import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENDLESS_SWEEP_MAX_LAYERS } from './endlessAccess.js';

const contentPath = fileURLToPath(
  new URL('../resources/data/无尽劫境.json', import.meta.url)
);
const CONTENT = Object.freeze(JSON.parse(fs.readFileSync(contentPath, 'utf8')));
const ABILITIES = new Map(
  CONTENT.abilities.map((ability) => [ability.id, ability])
);
const CHECKPOINT_BOONS = new Map(
  (CONTENT.checkpointBoons || []).map(boon => [boon.id, boon])
);
const WORLDS = new Map(CONTENT.worlds.map((world) => [world.id, world]));
const RARITY_WEIGHT = Object.freeze({ 普通: 6, 稀有: 4, 核心: 2.5, 禁忌: 1 });
const CHECKPOINT_CHOICES = Object.freeze([
  Object.freeze({
    id: 'rest',
    name: '涅槃归息',
    subtitle: '收拢残魂，重燃命火',
    description: '全员复苏并恢复至满血，同时回复1点命火。',
  }),
  Object.freeze({
    id: 'fortune',
    name: '诸天垂青',
    subtitle: '以伤躯叩问未知机缘',
    description: '一名存活成员随机获得诸天神器或无上道法。',
  }),
  Object.freeze({
    id: 'ascend',
    name: '道果升华',
    subtitle: '熔炼此战，推高已有构筑',
    description: '每名成员随机一项未满级能力提升1级。',
  }),
]);

const EFFECT_KEYS = Object.freeze([
  'attackPct',
  'hpPct',
  'defensePct',
  'critChance',
  'dodgeChance',
  'regenPct',
  'damageReduction',
  'reflectChance',
  'reflectPct',
  'extraActionChance',
  'summonPct',
  'executePct',
  'teamShieldPct',
  'takeDamageAttackPct',
  'victoryHealPct',
  'onWinAttackPct',
  'fireScalingPct',
  'comboAttackPct',
  'revivePct',
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function random(run) {
  let state = Number(run.rngState) >>> 0 || 0x6d2b79f5;
  state = (state + 0x6d2b79f5) >>> 0;
  run.rngState = state;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function shuffle(run, items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random(run) * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function weightedPick(run, pool) {
  if (!pool.length) return null;
  const getWeight = (item) => {
    const base = RARITY_WEIGHT[item.rarity] || 1;
    const recoveryWeight = item.effect?.regenPct ? 0.35 : 1;
    return base * Math.max(0.01, asNumber(item.choiceWeight, recoveryWeight));
  };
  const total = pool.reduce(
    (sum, item) => sum + getWeight(item),
    0
  );
  let cursor = random(run) * total;
  for (const item of pool) {
    cursor -= getWeight(item);
    if (cursor < 0) return item;
  }
  return pool.at(-1);
}

function mergeEffect(target, source, multiplier = 1) {
  for (const key of EFFECT_KEYS) {
    target[key] = (target[key] || 0) + asNumber(source?.[key]) * multiplier;
  }
  return target;
}

function getOwnedLevel(member, abilityId) {
  return Math.max(0, Math.floor(asNumber(member?.abilities?.[abilityId])));
}

function countTeamTags(run) {
  const counts = {};
  for (const member of Object.values(run.members)) {
    for (const [abilityId, level] of Object.entries(member.abilities || {})) {
      const ability = ABILITIES.get(abilityId);
      for (const tag of ability?.tags || [])
        counts[tag] = (counts[tag] || 0) + level;
    }
  }
  return counts;
}

function collectEffects(member, run) {
  const effects = {};
  for (const [abilityId, level] of Object.entries(member.abilities || {})) {
    mergeEffect(effects, ABILITIES.get(abilityId)?.effect, level);
  }
  for (const boonId of member.blessings || []) {
    mergeEffect(effects, CHECKPOINT_BOONS.get(boonId)?.effect);
  }
  effects.teamShieldPct = Object.values(run.members).reduce(
    (total, current) => {
      return (
        total +
        Object.entries(current.abilities || {}).reduce(
          (sum, [abilityId, level]) => {
            return (
              sum +
              asNumber(ABILITIES.get(abilityId)?.effect?.teamShieldPct) * level
            );
          },
          0
        ) +
        (current.blessings || []).reduce(
          (sum, boonId) =>
            sum + asNumber(CHECKPOINT_BOONS.get(boonId)?.effect?.teamShieldPct),
          0
        )
      );
    },
    0
  );
  for (const fusionId of run.fusions || []) {
    mergeEffect(
      effects,
      CONTENT.fusions.find((fusion) => fusion.id === fusionId)?.effect
    );
  }

  const tags = countTeamTags(run);
  if ((tags.火焰 || 0) >= 3)
    effects.attackPct = (effects.attackPct || 0) + 0.08;
  if ((tags.速度 || 0) >= 3)
    effects.dodgeChance = (effects.dodgeChance || 0) + 0.04;
  if ((tags.生存 || 0) >= 3) effects.hpPct = (effects.hpPct || 0) + 0.08;
  if ((tags.召唤 || 0) >= 3)
    effects.summonPct = (effects.summonPct || 0) + 0.08;
  if (effects.fireScalingPct)
    effects.attackPct += effects.fireScalingPct * (tags.火焰 || 0);
  return effects;
}

function calculateMemberStats(member, run, round = 1) {
  const effects = collectEffects(member, run);
  const rageStacks = Math.min(10, Math.max(0, asNumber(member.battleRage)));
  const comboStacks = Math.min(10, Math.max(0, round - 1));
  return {
    maxHp: Math.max(1, Math.round(member.base.hp * (1 + effects.hpPct))),
    attack: Math.max(
      1,
      Math.round(
        member.base.attack *
          (1 + effects.attackPct + asNumber(member.growthAttackPct)) *
          (1 + effects.takeDamageAttackPct * rageStacks) *
          (1 + effects.comboAttackPct * comboStacks)
      )
    ),
    defense: Math.max(
      0,
      Math.round(member.base.defense * (1 + effects.defensePct))
    ),
    critChance: clamp(0.05 + effects.critChance, 0.05, 0.65),
    dodgeChance: clamp(effects.dodgeChance, 0, 0.45),
    damageReduction: clamp(effects.damageReduction, 0, 0.65),
    reflectChance: clamp(effects.reflectChance, 0, 0.45),
    reflectPct: clamp(effects.reflectPct, 0, 1),
    extraActionChance: clamp(effects.extraActionChance, 0, 0.55),
    summonPct: Math.max(0, effects.summonPct),
    executePct: Math.max(0, effects.executePct),
    regenPct: Math.max(0, effects.regenPct),
    victoryHealPct: Math.max(0, effects.victoryHealPct),
    onWinAttackPct: Math.max(0, effects.onWinAttackPct),
    teamShieldPct: Math.max(0, effects.teamShieldPct),
    revivePct: clamp(effects.revivePct, 0, 0.8),
  };
}

function refreshMemberVitals(run, oldMaximums = {}) {
  for (const member of Object.values(run.members)) {
    const previousMax =
      oldMaximums[member.id] || member.maxHp || member.base.hp;
    const nextMax = calculateMemberStats(member, run).maxHp;
    member.maxHp = nextMax;
    if (nextMax > previousMax && member.alive)
      member.hp += nextMax - previousMax;
    member.hp = clamp(Math.round(member.hp), 0, nextMax);
  }
}

function createProjection(id, player) {
  const realmDepth =
    asNumber(player.level_id) +
    asNumber(player.Physique_id) +
    asNumber(player.mijinglevel_id) +
    asNumber(player.xiangulevel_id);
  const foundation = 1 + clamp(realmDepth * 0.003, 0, 0.2);
  const base = {
    hp: Math.round(1000 * foundation),
    attack: Math.round(120 * foundation),
    defense: Math.round(45 * foundation),
    speed: 100,
  };
  return {
    id,
    name: player.名号 || `无名修士${String(id).slice(-4)}`,
    rewardRealms: {
      level: asNumber(player.level_id),
      physique: asNumber(player.Physique_id),
      secret: asNumber(player.mijinglevel_id),
      ancient: asNumber(player.xiangulevel_id),
    },
    bankedRewards: { cultivation: 0, blood: 0 },
    unbankedRewards: { cultivation: 0, blood: 0 },
    base,
    hp: base.hp,
    maxHp: base.hp,
    alive: true,
    abilities: {},
    blessings: [],
    growthAttackPct: 0,
  };
}

function isAbilityAvailable(member, ability) {
  const meetsRequirements = Object.entries(ability.requires || {}).every(
    ([abilityId, level]) => getOwnedLevel(member, abilityId) >= asNumber(level)
  );
  return (
    meetsRequirements &&
    getOwnedLevel(member, ability.id) < asNumber(ability.maxLevel, 1)
  );
}

function pickUnique(run, pool, member, picked) {
  const available = pool.filter(
    (item) => !picked.has(item.id) && isAbilityAvailable(member, item)
  );
  const selected = weightedPick(run, available);
  if (selected) picked.add(selected.id);
  return selected;
}

function createChoices(run, memberId, layer = Math.max(1, run.layer + 1)) {
  const member = run.members[memberId];
  if (!member?.alive) return [];
  const world = getWorldForLayer(run, layer);
  const picked = new Set();
  const related = CONTENT.abilities.filter(
    (ability) => ability.world === world.id
  );
  const survival = CONTENT.abilities.filter((ability) =>
    ability.tags?.some((tag) => ['生存', '防御', '恢复'].includes(tag))
  );
  const all = CONTENT.abilities;
  const neutral = CONTENT.abilities.filter(
    (ability) => ability.world === 'neutral'
  );
  const choices = [
    pickUnique(run, related, member, picked),
    pickUnique(run, survival, member, picked),
    pickUnique(run, all, member, picked),
  ].filter(Boolean);

  while (choices.length < 3) {
    const fallback =
      pickUnique(run, neutral, member, picked) ||
      pickUnique(run, all, member, picked);
    if (!fallback) break;
    choices.push(fallback);
  }
  return choices.map((choice) => choice.id);
}

function setPendingChoices(run, layer) {
  run.pendingChoices = {};
  for (const member of Object.values(run.members)) {
    if (member.alive)
      run.pendingChoices[member.id] = createChoices(run, member.id, layer);
  }
  run.phase = Object.keys(run.pendingChoices).length ? 'choice' : 'ready';
}

function beginCheckpoint(run, layer) {
  run.pendingChoices = {};
  run.phase = 'checkpoint';
  run.checkpoint = {
    title: '劫后问道',
    layer,
    choices: clone(CHECKPOINT_CHOICES),
  };
}

export function getEndlessContent() {
  return clone(CONTENT);
}

export function getAbility(abilityId) {
  const ability = ABILITIES.get(abilityId);
  return ability ? clone(ability) : null;
}

export function getCheckpointBoon(boonId) {
  const boon = CHECKPOINT_BOONS.get(boonId);
  return boon ? clone(boon) : null;
}

export function getWorldForLayer(run, layer) {
  const chapter = Math.max(0, Math.floor((Math.max(1, layer) - 1) / 10));
  const order = run.worldOrder?.length
    ? run.worldOrder
    : CONTENT.worlds.map((world) => world.id);
  return WORLDS.get(order[chapter % order.length]) || CONTENT.worlds[0];
}

export function getMemberStats(run, memberId) {
  const member = run.members?.[memberId];
  return member ? calculateMemberStats(member, run) : null;
}

export function detectFusions(run) {
  const owned = new Set(
    Object.values(run.members).flatMap((member) =>
      Object.keys(member.abilities || {}).filter(
        (abilityId) => getOwnedLevel(member, abilityId) > 0
      )
    )
  );
  return CONTENT.fusions
    .filter((fusion) =>
      fusion.requires.every((abilityId) => owned.has(abilityId))
    )
    .map((fusion) => fusion.id);
}

export function createEndlessRun({
  teamId,
  groupId,
  players,
  seed = Date.now(),
}) {
  if (!players?.length) throw new Error('无尽劫境至少需要一名玩家');
  const run = {
    id: `${Date.now().toString(36)}-${(Number(seed) >>> 0).toString(36)}`,
    version: 3,
    contentVersion: CONTENT.version,
    teamId,
    groupId: String(groupId),
    layer: 0,
    highestClearedLayer: 0,
    phase: 'choice',
    rngState: Number(seed) >>> 0,
    worldOrder: [],
    members: {},
    fusions: [],
    pendingChoices: {},
    checkpoint: null,
    lastCheckpoint: null,
    maxLifeFire: Math.max(2, Math.ceil(players.length / 2)),
    lifeFire: Math.max(2, Math.ceil(players.length / 2)),
    banked: { lingshi: 0, sourceStone: 0, tokens: 0 },
    unbanked: { lingshi: 0, sourceStone: 0, tokens: 0 },
    startedAt: Date.now(),
    lastBattle: null,
  };
  run.worldOrder = shuffle(
    run,
    CONTENT.worlds.map((world) => world.id)
  );
  for (const entry of players)
    run.members[entry.id] = createProjection(entry.id, entry.player);
  setPendingChoices(run, 1);
  return run;
}

export function applyEndlessChoice(run, memberId, choiceNumber) {
  if (run.phase !== 'choice') throw new Error('当前不是选择能力阶段');
  const choices = run.pendingChoices?.[memberId];
  if (!choices) throw new Error('你本层已经完成选择，或当前无法选择能力');
  const index = Math.floor(asNumber(choiceNumber)) - 1;
  const abilityId = choices[index];
  const ability = ABILITIES.get(abilityId);
  if (!ability) throw new Error('请选择1、2或3');
  const member = run.members[memberId];
  if (!isAbilityAvailable(member, ability))
    throw new Error(`${ability.name}的进阶条件尚未满足`);

  const oldMaximums = Object.fromEntries(
    Object.values(run.members).map((member) => [
      member.id,
      calculateMemberStats(member, run).maxHp,
    ])
  );
  member.abilities[abilityId] = getOwnedLevel(member, abilityId) + 1;
  delete run.pendingChoices[memberId];

  const previousFusions = new Set(run.fusions || []);
  run.fusions = detectFusions(run);
  const newFusions = run.fusions.filter((id) => !previousFusions.has(id));
  refreshMemberVitals(run, oldMaximums);
  if (!Object.keys(run.pendingChoices).length) run.phase = 'ready';

  return {
    ability: clone(ability),
    level: member.abilities[abilityId],
    newFusions: newFusions.map((id) =>
      clone(CONTENT.fusions.find((fusion) => fusion.id === id))
    ),
    ready: run.phase === 'ready',
  };
}

export function applyCheckpointChoice(run, choiceNumber) {
  if (run.phase !== 'checkpoint' || !run.checkpoint)
    throw new Error('当前没有等待抉择的十层天关');
  const index = Math.floor(asNumber(choiceNumber)) - 1;
  const choice = run.checkpoint.choices?.[index];
  if (!choice) throw new Error('请选择1、2或3');

  const oldMaximums = Object.fromEntries(
    Object.values(run.members).map(member => [
      member.id,
      calculateMemberStats(member, run).maxHp,
    ])
  );
  let reward;
  if (choice.id === 'rest') {
    const restored = Object.values(run.members).map(member => {
      member.alive = true;
      const maxHp = calculateMemberStats(member, run).maxHp;
      member.maxHp = maxHp;
      member.hp = maxHp;
      return { memberId: member.id, memberName: member.name, hp: maxHp };
    });
    const before = run.lifeFire;
    run.lifeFire = Math.min(run.maxLifeFire, run.lifeFire + 1);
    reward = {
      kind: 'rest',
      restored,
      recoveredLifeFire: run.lifeFire - before,
      lifeFire: run.lifeFire,
    };
  } else if (choice.id === 'fortune') {
    const living = Object.values(run.members).filter(member => member.alive);
    const candidates = living.flatMap(member =>
      [...CHECKPOINT_BOONS.values()]
        .filter(boon => !(member.blessings || []).includes(boon.id))
        .map(boon => ({ member, boon }))
    );
    const selected = candidates[Math.floor(random(run) * candidates.length)];
    if (selected) {
      selected.member.blessings ||= [];
      selected.member.blessings.push(selected.boon.id);
      reward = {
        kind: 'fortune',
        memberId: selected.member.id,
        memberName: selected.member.name,
        boon: clone(selected.boon),
      };
    } else {
      const member = living[Math.floor(random(run) * living.length)];
      member.growthAttackPct += 0.12;
      reward = {
        kind: 'fortune',
        memberId: member.id,
        memberName: member.name,
        overflow: true,
      };
    }
    refreshMemberVitals(run, oldMaximums);
  } else {
    const upgrades = [];
    for (const member of Object.values(run.members)) {
      const candidates = Object.entries(member.abilities || {}).filter(
        ([abilityId, level]) => {
          const ability = ABILITIES.get(abilityId);
          return ability && level < asNumber(ability.maxLevel, 1);
        }
      );
      const selected = candidates[Math.floor(random(run) * candidates.length)];
      if (selected) {
        const [abilityId] = selected;
        member.abilities[abilityId] += 1;
        upgrades.push({
          memberId: member.id,
          memberName: member.name,
          abilityId,
          abilityName: ABILITIES.get(abilityId).name,
          level: member.abilities[abilityId],
        });
      } else {
        member.growthAttackPct += 0.08;
        upgrades.push({
          memberId: member.id,
          memberName: member.name,
          fallback: true,
        });
      }
    }
    reward = { kind: 'ascend', upgrades };
    refreshMemberVitals(run, oldMaximums);
  }

  run.lastCheckpoint = {
    layer: run.checkpoint.layer,
    choice: clone(choice),
    reward,
    at: Date.now(),
  };
  run.checkpoint = null;
  setPendingChoices(run, run.layer + 1);
  return clone(run.lastCheckpoint);
}

function getStage(layer) {
  if (layer % 10 === 0) return 'boss';
  if (layer % 5 === 0) return 'elite';
  return 'normal';
}

export function createEndlessEnemy(run, layer) {
  const world = getWorldForLayer(run, layer);
  const stage = getStage(layer);
  const pool = world[stage];
  const template = pool[Math.floor(random(run) * pool.length)];
  const teamSize = Object.keys(run.members).length;
  const teamScale = 1 + Math.max(0, teamSize - 1) * 0.3;
  const monsterCount = stage === 'normal'
    ? 1 + Math.floor(Math.max(0, layer - 1) / 10)
    : 1;
  const unitMaxHp = Math.round(
    template.hp * Math.pow(1.105, layer - 1) * teamScale
  );
  const enemy = {
    ...template,
    unitName: template.name,
    name: monsterCount > 1
      ? `${template.name}·怪潮×${monsterCount}`
      : template.name,
    world: world.id,
    worldName: world.name,
    stage,
    monsterCount,
    unitMaxHp,
    teamScale,
    maxHp: unitMaxHp * monsterCount,
    attack: Math.round(
      template.attack * Math.pow(1.05, layer - 1) * teamScale
    ),
    defense: Math.round(
      template.defense * Math.pow(1.035, layer - 1) * teamScale
    ),
  };
  enemy.hp = enemy.maxHp;
  return enemy;
}

function addBattleLog(logs, message) {
  if (logs.length < 20 && !logs.includes(message)) logs.push(message);
}

function addBattleAction(run, action) {
  if (!run.__roundActions) return;
  run.__roundActions.push({
    side: action.side || 'system',
    kind: action.kind || 'damage',
    actor: action.actor || '劫境',
    skill: action.skill || '普通攻击',
    verb: action.verb || '施展',
    target: action.target || '',
    damage: Math.max(0, Math.round(asNumber(action.damage))),
    healing: Math.max(0, Math.round(asNumber(action.healing))),
    absorbed: Math.max(0, Math.round(asNumber(action.absorbed))),
    critical: Boolean(action.critical),
    execute: Boolean(action.execute),
    narration: action.narration || '',
    note: action.note || '',
  });
}

function abilityProcs(member) {
  const procs = [];
  for (const [abilityId, level] of Object.entries(member.abilities || {})) {
    const ability = ABILITIES.get(abilityId);
    if (ability?.proc)
      procs.push({ ...ability.proc, level, source: ability.name, abilityId });
  }
  for (const boonId of member.blessings || []) {
    const boon = CHECKPOINT_BOONS.get(boonId);
    if (boon?.proc)
      procs.push({ ...boon.proc, level: 1, source: boon.name, abilityId: boonId });
  }
  return procs;
}

function fusionProcs(run) {
  return (run.fusions || [])
    .map((id) => CONTENT.fusions.find((fusion) => fusion.id === id))
    .filter((fusion) => fusion?.proc)
    .map((fusion) => ({
      ...fusion.proc,
      level: 1,
      source: fusion.name,
      fusionId: fusion.id,
    }));
}

function summonAssist(member, run) {
  const hasShadow = getOwnedLevel(member, 'anime_shadow_monarch') > 0;
  const hasTransformedSelf =
    getOwnedLevel(member, 'perfect_free_transformation') > 0;
  const hasShadowClone = getOwnedLevel(member, 'anime_shadow_clone') > 0;
  const eternalShadow = (run.fusions || []).includes('fusion_eternal_shadow');
  if (eternalShadow && hasShadowClone) {
    return {
      name: '诸世暗影分身军团',
      detail: '未来投影与影分身披上影甲，万千暗影之手从每一道分身脚下探出',
    };
  }
  if (eternalShadow) {
    return {
      name: '诸世暗影军团',
      detail: '映照之我披上影甲，万千暗影之手从敌人脚下同时探出',
    };
  }
  if (hasShadow && hasTransformedSelf) {
    return {
      name: '暗影之手与当世之我',
      detail: '暗影之手封锁退路，跨越岁月的投影从正面轰杀',
    };
  }
  if (hasShadow && hasShadowClone) {
    return {
      name: '暗影分身军团',
      detail: '实体分身封锁四方，每道影子中又升起一只暗影之手发动夹击',
    };
  }
  if (hasShadow) {
    return {
      name: '暗影之手',
      detail: '漆黑巨手撕开目标身后的影子，与本体形成夹击',
    };
  }
  if (hasTransformedSelf) {
    return {
      name: '当世之我',
      detail: '映照出的另一尊当世真身，与本体使用相同构筑同时出手',
    };
  }
  if (hasShadowClone) {
    return {
      name: '影分身军团',
      detail: '数十道实体分身从烟幕中冲出，以连续体术封死目标退路',
    };
  }
  return {
    name: '诸天虚影',
    detail: '队伍的召唤共鸣牵引诸天投影降临战场',
  };
}

function procNarrative(proc, member, enemy) {
  if (proc.narration)
    return {
      verb: proc.verb || '发动',
      detail: proc.narration
        .replaceAll('{member}', member.name)
        .replaceAll('{enemy}', enemy.name),
    };
  if (proc.abilityId === 'perfect_thunder_emperor')
    return {
      verb: '引动',
      detail: `${member.name}结出雷帝法印，九天雷罚贯穿云海锁定${enemy.name}`,
    };
  if (proc.abilityId === 'flame_lotus')
    return {
      verb: '引爆',
      detail: `${member.name}将数种异火压入莲心，毁灭火莲在${enemy.name}身前彻底绽放`,
    };
  return {
    verb: '发动',
    detail: `${member.name}催动${proc.source}，以${proc.label}追击${enemy.name}`,
  };
}

function futureSelf(run, member, round, level) {
  const pool = CONTENT.abilities.filter(
    ability =>
      ability.id !== 'perfect_free_transformation' &&
      !member.abilities?.[ability.id]
  );
  const abilities = shuffle(run, pool).slice(
    0,
    Math.min(pool.length, 2 + Math.min(2, level))
  );
  const projection = clone(member);
  projection.abilities = { ...(member.abilities || {}) };
  for (const ability of abilities) projection.abilities[ability.id] = 1;
  return {
    abilities,
    stats: calculateMemberStats(projection, run, round),
  };
}

function fusionNarrative(proc, enemy) {
  if (proc.narration)
    return proc.narration
      .replaceAll('{member}', '全队')
      .replaceAll('{enemy}', enemy.name);
  if (proc.fusionId === 'fusion_thunder_lotus')
    return `全队将雷帝神雷灌入异火莲心，混沌雷火覆盖${enemy.name}所在战场`;
  return `诸天能力完成共鸣，${proc.label}越过世界规则轰向${enemy.name}`;
}

function handleLethal(run, member, logs) {
  if (member.hp > 0) return false;
  const stats = calculateMemberStats(member, run);
  if (!member.battleRevived && stats.revivePct > 0) {
    member.battleRevived = true;
    member.hp = Math.max(1, Math.round(stats.maxHp * stats.revivePct));
    addBattleLog(logs, `${member.name}触发涅槃，在灰烬与道光中重归战场！`);
    addBattleAction(run, {
      side: 'player',
      kind: 'recover',
      actor: member.name,
      skill: '涅槃重生',
      target: member.name,
      healing: member.hp,
    });
    if (run.__counters) run.__counters.revive++;
    return false;
  }
  if (run.lifeFire > 0) {
    run.lifeFire--;
    member.hp = Math.max(1, Math.round(stats.maxHp * 0.3));
    addBattleLog(
      logs,
      `命火燃烧，${member.name}从濒死中归来（剩余${run.lifeFire}点）！`
    );
    addBattleAction(run, {
      side: 'player',
      kind: 'recover',
      actor: member.name,
      skill: '命火续命',
      target: member.name,
      healing: member.hp,
      note: `剩余${run.lifeFire}点命火`,
    });
    if (run.__counters) run.__counters.lifeFireUsed++;
    return false;
  }
  member.hp = 0;
  member.alive = false;
  addBattleLog(logs, `${member.name}投影破碎，化作残魂退出本场战斗。`);
  addBattleAction(run, {
    side: 'system',
    kind: 'status',
    actor: member.name,
    skill: '投影破碎',
    target: member.name,
  });
  return true;
}

function damageMember(run, member, amount, logs, source = {}) {
  if (!member.alive || amount <= 0) return false;
  let remaining = Math.max(1, Math.round(amount));
  let absorbed = 0;
  if (member.shield > 0) {
    absorbed = Math.min(member.shield, remaining);
    member.shield -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) {
    member.hp -= remaining;
    member.battleRage = Math.min(10, (member.battleRage || 0) + 1);
    if (run.__damageTakenByMember) run.__damageTakenByMember[member.id] += remaining;
  }
  addBattleAction(run, {
    side: source.side || 'enemy',
    kind: source.kind || 'damage',
    actor: source.actor || '劫境守关者',
    skill: source.skill || '普通攻击',
    target: member.name,
    damage: remaining,
    absorbed,
    note: source.note,
  });
  return handleLethal(run, member, logs);
}

function playerAttack(run, member, enemy, round, logs, damageByMember) {
  if (!member.alive || enemy.hp <= 0) return;
  const stats = calculateMemberStats(member, run, round);
  let damage = Math.max(1, stats.attack - enemy.defense * 0.62);
  const isCrit = random(run) < stats.critChance;
  if (isCrit) damage *= 1.7;
  const isExecute = stats.executePct > 0 && enemy.hp / enemy.maxHp <= 0.15;
  if (isExecute) damage *= 1 + stats.executePct;
  const summonDamage = stats.attack * stats.summonPct;
  let dealt = Math.max(1, Math.round(damage + summonDamage));
  const directDamage = Math.max(1, Math.round(damage));
  const summonDealt = Math.max(0, dealt - directDamage);
  enemy.hp -= dealt;
  damageByMember[member.id] += dealt;
  addBattleAction(run, {
    side: 'player',
    actor: member.name,
    skill: '普通攻击',
    target: enemy.name,
    damage: directDamage,
    critical: isCrit,
    execute: isExecute,
  });
  if (summonDealt > 0)
    {
      const assist = summonAssist(member, run);
      addBattleAction(run, {
      side: 'player',
      kind: 'summon',
      actor: member.name,
      skill: `${assist.name}·协同攻击`,
      verb: '召唤',
      target: enemy.name,
      damage: summonDealt,
      narration: assist.detail,
      });
      addBattleLog(
        logs,
        `${member.name}召唤${assist.name}协同攻击，${assist.detail}，造成${summonDealt}点伤害！`
      );
    }
  if (isCrit)
    addBattleLog(logs, `${member.name}抓住破绽，暴击轰出${directDamage}点伤害！`);
  if (isExecute)
    addBattleLog(logs, `${member.name}看准敌势衰微，斩杀追加至${directDamage}点伤害！`);

  if (random(run) < stats.extraActionChance && enemy.hp > 0) {
    const echoDamage = Math.max(1, Math.round(damage * 0.55));
    enemy.hp -= echoDamage;
    damageByMember[member.id] += echoDamage;
    addBattleAction(run, {
      side: 'player',
      actor: member.name,
      skill: '速度残响·追击',
      verb: '留下',
      target: enemy.name,
      damage: echoDamage,
      narration: '本体已经收势，第二条时间线中的残影却从死角补上致命一击',
    });
    addBattleLog(logs, `${member.name}留下速度残响，追加${echoDamage}伤害。`);
  }

  for (const proc of abilityProcs(member)) {
    if (enemy.hp <= 0 || round % proc.everyRounds !== 0) continue;
    const variant = proc.variants?.length
      ? proc.variants[Math.floor(random(run) * proc.variants.length)]
      : null;
    const resolved = variant ? { ...proc, ...variant } : proc;
    const baseProcDamage = Math.max(
      1,
      Math.round(
        stats.attack *
          proc.damagePct *
          asNumber(variant?.damageMultiplier, 1) *
          proc.level
      )
    );
    let procDamage = baseProcDamage;
    let skill = resolved.label;
    let note = '';
    let narrative;
    if (proc.abilityId === 'perfect_free_transformation') {
      const isFuture = round % (proc.everyRounds * 2) === 0;
      if (isFuture) {
        const future = futureSelf(run, member, round, proc.level);
        procDamage = Math.max(
          baseProcDamage + 1,
          Math.round(future.stats.attack * proc.damagePct * proc.level * 1.3)
        );
        skill = '他化自在·未来身';
        note = `未来构筑：${future.abilities.map(ability => ability.name).join('、')}`;
        narrative = {
          verb: '映照',
          detail: `${member.name}截取未来岁月，映照出携带${future.abilities
            .map(ability => ability.name)
            .join('、')}的更强未来之我`,
        };
      } else {
        skill = '他化自在·当世身';
        narrative = {
          verb: '映照',
          detail: `${member.name}映照当世之我，两尊真身以完全相同的构筑同时攻向${enemy.name}`,
        };
      }
    } else {
      narrative = procNarrative(resolved, member, enemy);
    }
    enemy.hp -= procDamage;
    damageByMember[member.id] += procDamage;
    addBattleAction(run, {
      side: 'player',
      actor: member.name,
      skill,
      verb: narrative.verb,
      target: enemy.name,
      damage: procDamage,
      narration: narrative.detail,
      note,
    });
    addBattleLog(
      logs,
      `${narrative.detail}，${skill}追加${procDamage}点伤害！${note ? `（${note}）` : ''}`
    );
    if (proc.selfDamagePct) {
      damageMember(
        run,
        member,
        stats.maxHp * proc.selfDamagePct * proc.level,
        logs,
        {
          side: 'system',
          kind: 'recoil',
          actor: member.name,
          skill: `${skill}反噬`,
        }
      );
    }
  }

  if (enemy.trait === '反射' && dealt > 0 && member.alive) {
    damageMember(
      run,
      member,
      Math.min(stats.maxHp * 0.08, dealt * 0.08),
      logs,
      { side: 'enemy', actor: enemy.name, skill: '反射反噬' }
    );
  }
  enemy.hp = Math.max(0, Math.round(enemy.hp));
}

function enemyHit(run, enemy, member, multiplier, logs, skill = '普通攻击') {
  if (!member.alive) return;
  const stats = calculateMemberStats(member, run);
  if (random(run) < stats.dodgeChance) {
    addBattleLog(logs, `${member.name}看穿攻势，于毁灭降临前避开一击。`);
    addBattleAction(run, {
      side: 'player',
      kind: 'dodge',
      actor: member.name,
      skill: '闪避',
      target: enemy.name,
      note: `避开《${skill}》`,
    });
    return;
  }
  const frenzy =
    enemy.trait === '狂暴' && enemy.hp / enemy.maxHp <= 0.3 ? 1.28 : 1;
  const defenseRate = enemy.trait === '破甲' ? 0.25 : 0.65;
  let damage = Math.max(
    1,
    enemy.attack * multiplier * frenzy - stats.defense * defenseRate
  );
  damage *= 1 - stats.damageReduction;
  if (random(run) < stats.reflectChance) {
    const reflected = Math.max(1, Math.round(damage * stats.reflectPct));
    enemy.hp = Math.max(0, enemy.hp - reflected);
    damage *= 0.35;
    addBattleLog(logs, `${member.name}逆转矢量，反射${reflected}伤害！`);
    addBattleAction(run, {
      side: 'player',
      actor: member.name,
      skill: '矢量操纵·反射',
      target: enemy.name,
      damage: reflected,
    });
  }
  const died = damageMember(run, member, damage, logs, {
    side: 'enemy',
    actor: enemy.name,
    skill,
  });
  if (died && enemy.trait === '吞噬') {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(enemy.maxHp * 0.08));
    addBattleLog(logs, `${enemy.name}吞噬破碎投影，恢复了部分生命。`);
    addBattleAction(run, {
      side: 'enemy',
      kind: 'recover',
      actor: enemy.name,
      skill: '吞噬投影',
      target: enemy.name,
      healing: Math.round(enemy.maxHp * 0.08),
    });
  }
}

function enemyAreaHit(run, enemy, multiplier, logs, skill) {
  addBattleLog(logs, `${enemy.name}施展《${skill}》，杀机覆盖整片战场！`);
  for (const member of Object.values(run.members)) {
    if (enemy.hp <= 0) break;
    if (member.alive) enemyHit(run, enemy, member, multiplier, logs, skill);
  }
}

function triggerEnemyMechanic(run, enemy, round, logs) {
  const alive = Object.values(run.members).filter((member) => member.alive);
  if (!alive.length || enemy.hp <= 0) return false;

  if (enemy.stage === 'boss' && round % 5 === 0) {
    const target = [...alive].sort(
      (a, b) => a.hp / Math.max(1, a.maxHp) - b.hp / Math.max(1, b.maxHp)
    )[0];
    addBattleLog(logs, `${enemy.name}锁定气息最衰弱者，斩断其生路与因果！`);
    enemyHit(run, enemy, target, 1.55, logs, '因果绝命印');
    return true;
  }
  if (enemy.stage === 'boss' && round % 3 === 0) {
    enemyAreaHit(run, enemy, 0.78, logs, '位面覆灭');
    return true;
  }

  switch (enemy.trait) {
    case '群攻':
      if (round % 4 === 0) {
        enemyAreaHit(run, enemy, 0.76, logs, '怪潮横扫');
        return true;
      }
      break;
    case '狂暴':
      if (round % 4 === 0) {
        enemyAreaHit(run, enemy, 0.66, logs, '血怒震荡');
        return true;
      }
      break;
    case '反射':
      if (round % 4 === 0) {
        enemyAreaHit(run, enemy, 0.58, logs, '镜界反冲');
        return true;
      }
      break;
    case '破甲':
      if (round % 3 === 0) {
        const target = alive[Math.floor(random(run) * alive.length)];
        enemyHit(run, enemy, target, 1.42, logs, '碎甲镇杀');
        return true;
      }
      break;
    case '吞噬':
      if (round % 4 === 0) {
        const target = alive[Math.floor(random(run) * alive.length)];
        enemyHit(run, enemy, target, 0.92, logs, '噬魂汲取');
        if (enemy.hp > 0) {
          const before = enemy.hp;
          enemy.hp = Math.min(
            enemy.maxHp,
            enemy.hp + Math.round(enemy.maxHp * 0.04)
          );
          addBattleAction(run, {
            side: 'enemy',
            kind: 'recover',
            actor: enemy.name,
            skill: '噬魂汲取',
            target: enemy.name,
            healing: enemy.hp - before,
          });
          addBattleLog(logs, `${enemy.name}吞噬生机，恢复${enemy.hp - before}生命。`);
        }
        return true;
      }
      break;
    case '迅捷':
      if (round % 3 === 0) {
        for (let index = 0; index < 2; index++) {
          const remaining = Object.values(run.members).filter(
            (member) => member.alive
          );
          if (!remaining.length || enemy.hp <= 0) break;
          enemyHit(
            run,
            enemy,
            remaining[Math.floor(random(run) * remaining.length)],
            0.72,
            logs,
            `时间残像·第${index + 1}击`
          );
        }
        return true;
      }
      break;
    case '再生':
      if (round % 4 === 0) {
        const target = alive[Math.floor(random(run) * alive.length)];
        enemyHit(run, enemy, target, 1.12, logs, '不灭血肉·腐生扑杀');
        if (enemy.hp > 0) {
          const before = enemy.hp;
          enemy.hp = Math.min(
            enemy.maxHp,
            enemy.hp + Math.round(enemy.maxHp * 0.05)
          );
          addBattleAction(run, {
            side: 'enemy',
            kind: 'recover',
            actor: enemy.name,
            skill: '不灭血肉',
            target: enemy.name,
            healing: enemy.hp - before,
          });
        }
        return true;
      }
      break;
    case '禁疗':
      if (round % 4 === 0) {
        enemyAreaHit(run, enemy, 0.62, logs, '断生禁域');
        return true;
      }
      break;
  }
  return false;
}

function monsterPackFollowUp(run, enemy, logs) {
  if (enemy.stage !== 'normal' || enemy.monsterCount <= 1 || enemy.hp <= 0)
    return;
  const remainingUnits = Math.max(
    1,
    Math.ceil(enemy.hp / Math.max(1, enemy.unitMaxHp))
  );
  const extraAttackers = remainingUnits - 1;
  if (!extraAttackers) return;

  const strikes = Math.min(extraAttackers, 8);
  addBattleLog(logs, `怪潮尚余${remainingUnits}只，余众从四面八方发动围猎！`);
  for (let index = 0; index < strikes; index++) {
    const alive = Object.values(run.members).filter((member) => member.alive);
    if (!alive.length || enemy.hp <= 0) break;
    const overflow = index === strikes - 1 && extraAttackers > strikes
      ? extraAttackers - strikes + 1
      : 1;
    enemyHit(
      run,
      enemy,
      alive[Math.floor(random(run) * alive.length)],
      0.55 * overflow,
      logs,
      overflow > 1 ? `怪潮合击·${overflow}重` : `怪潮围猎·第${index + 1}击`
    );
  }
}

function enemyTurn(run, enemy, round, logs) {
  const alive = Object.values(run.members).filter((member) => member.alive);
  if (!alive.length || enemy.hp <= 0) return;
  if (!triggerEnemyMechanic(run, enemy, round, logs)) {
    const target = alive[Math.floor(random(run) * alive.length)];
    enemyHit(run, enemy, target, 1, logs, '普通攻击');
  }
  monsterPackFollowUp(run, enemy, logs);
}

function endRound(run, enemy, logs) {
  if (enemy.trait === '再生' && enemy.hp > 0) {
    const before = enemy.hp;
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + Math.round(enemy.maxHp * 0.02));
    addBattleAction(run, {
      side: 'enemy',
      kind: 'recover',
      actor: enemy.name,
      skill: '再生',
      target: enemy.name,
      healing: enemy.hp - before,
    });
  }
  for (const member of Object.values(run.members)) {
    if (!member.alive) continue;
    const stats = calculateMemberStats(member, run);
    const healingPenalty = enemy.trait === '禁疗' ? 0.5 : 1;
    const before = member.hp;
    member.hp = Math.min(
      stats.maxHp,
      member.hp + Math.round(stats.maxHp * stats.regenPct * healingPenalty)
    );
    if (member.hp > before)
      addBattleAction(run, {
        side: 'player',
        kind: 'recover',
        actor: member.name,
        skill: '者字秘·回天',
        target: member.name,
        healing: member.hp - before,
        note: healingPenalty < 1 ? '受禁疗压制' : '',
      });
  }
  if (enemy.trait === '再生')
    addBattleLog(logs, `${enemy.name}不断再生，必须尽快结束战斗。`);
}

function prepareBattle(run) {
  for (const member of Object.values(run.members)) {
    member.battleRage = 0;
    member.battleRevived = false;
    const stats = calculateMemberStats(member, run);
    member.maxHp = stats.maxHp;
    member.hp = clamp(member.hp, 0, stats.maxHp);
    member.shield = member.alive
      ? Math.round(stats.maxHp * stats.teamShieldPct)
      : 0;
  }
}

function ensureRewardState(run) {
  run.banked ||= {};
  run.unbanked ||= {};
  const legacyBankedCultivation = asNumber(run.banked.cultivation);
  const legacyUnbankedCultivation = asNumber(run.unbanked.cultivation);
  for (const pool of [run.banked, run.unbanked]) {
    pool.lingshi = asNumber(pool.lingshi);
    pool.sourceStone = asNumber(pool.sourceStone);
    pool.tokens = asNumber(pool.tokens);
    delete pool.cultivation;
  }
  for (const member of Object.values(run.members || {})) {
    member.rewardRealms ||= { level: 0, physique: 0, secret: 0, ancient: 0 };
    member.bankedRewards ||= {
      cultivation: legacyBankedCultivation,
      blood: 0,
    };
    member.unbankedRewards ||= {
      cultivation: legacyUnbankedCultivation,
      blood: 0,
    };
  }
}

function treasureRewardFromRealms(realms, realm, roll) {
  const primary = Math.max(0, asNumber(realms[realm]));
  const secret = Math.max(0, asNumber(realms.secret));
  const ancient = Math.max(0, asNumber(realms.ancient));
  return Math.trunc(
    (2000 + 10000 * primary ** 2 * secret * ancient * (2 + roll)) * 10
  );
}

function treasureReward(run, realm, member) {
  return treasureRewardFromRealms(
    member.rewardRealms || {},
    realm,
    random(run)
  );
}

export function getEndlessLayerCurrencyReward(layer) {
  const safeLayer = Math.max(1, Math.floor(asNumber(layer, 1)));
  const stage = getStage(safeLayer);
  const stageMultiplier = stage === 'boss' ? 3 : stage === 'elite' ? 1.6 : 1;
  const rewardBase = Math.round(
    30000 * safeLayer * (1 + safeLayer * 0.03) * stageMultiplier
  );
  return {
    stage,
    lingshi: rewardBase * 10000,
    sourceStone: Math.round(
      ((1200000 + safeLayer * 80000) * stageMultiplier) / 2
    ),
    tokens: Math.round((20 + safeLayer * 5) * stageMultiplier * 1.3),
  };
}

export function getEndlessSweepReward(
  player,
  highestLayer,
  randomizer = Math.random
) {
  const endLayer = Math.max(0, Math.floor(asNumber(highestLayer)));
  if (!endLayer) return null;
  const startLayer = Math.max(1, endLayer - ENDLESS_SWEEP_MAX_LAYERS + 1);
  const rewardRealms = {
    level: asNumber(player?.level_id),
    physique: asNumber(player?.Physique_id),
    secret: asNumber(player?.mijinglevel_id),
    ancient: asNumber(player?.xiangulevel_id),
  };
  const reward = {
    startLayer,
    endLayer,
    layers: endLayer - startLayer + 1,
    cultivation: 0,
    blood: 0,
    lingshi: 0,
    sourceStone: 0,
    tokens: 0,
  };
  for (let layer = startLayer; layer <= endLayer; layer++) {
    const currency = getEndlessLayerCurrencyReward(layer);
    reward.lingshi += currency.lingshi;
    reward.sourceStone += currency.sourceStone;
    reward.tokens += currency.tokens;
    reward.cultivation += treasureRewardFromRealms(
      rewardRealms,
      'level',
      Math.max(0, Math.min(1, asNumber(randomizer())))
    );
    reward.blood += treasureRewardFromRealms(
      rewardRealms,
      'physique',
      Math.max(0, Math.min(1, asNumber(randomizer())))
    );
  }
  return reward;
}

function finishVictory(run, enemy, layer) {
  ensureRewardState(run);
  const baseRecovery =
    enemy.stage === 'boss' ? 0.08 : enemy.stage === 'elite' ? 0.12 : 0.05;
  for (const member of Object.values(run.members)) {
    const stats = calculateMemberStats(member, run);
    if (member.alive) {
      member.hp = Math.min(
        stats.maxHp,
        member.hp +
          Math.round(stats.maxHp * (baseRecovery + stats.victoryHealPct))
      );
    }
    member.growthAttackPct += stats.onWinAttackPct;
    delete member.battleRage;
    delete member.battleRevived;
    delete member.shield;
  }

  const currencyReward = getEndlessLayerCurrencyReward(layer);
  const layerReward = {
    lingshi: currencyReward.lingshi,
    sourceStone: currencyReward.sourceStone,
    tokens: currencyReward.tokens,
    members: {},
  };
  run.unbanked.lingshi += layerReward.lingshi;
  run.unbanked.sourceStone += layerReward.sourceStone;
  run.unbanked.tokens += layerReward.tokens;
  for (const member of Object.values(run.members)) {
    const cultivation = treasureReward(run, 'level', member);
    const blood = treasureReward(run, 'physique', member);
    member.unbankedRewards.cultivation += cultivation;
    member.unbankedRewards.blood += blood;
    layerReward.members[member.id] = { cultivation, blood };
  }

  if (enemy.stage === 'boss') {
    for (const key of ['lingshi', 'sourceStone', 'tokens'])
      run.banked[key] += run.unbanked[key];
    run.unbanked = { lingshi: 0, sourceStone: 0, tokens: 0 };
    for (const member of Object.values(run.members)) {
      member.bankedRewards.cultivation += member.unbankedRewards.cultivation;
      member.bankedRewards.blood += member.unbankedRewards.blood;
      member.unbankedRewards = { cultivation: 0, blood: 0 };
    }
  }
  return layerReward;
}

function applyFusionProc(run, enemy, round, logs, damageByMember) {
  if (enemy.hp <= 0) return;
  const living = Object.values(run.members).filter((member) => member.alive);
  if (!living.length) return;
  const teamAttack = living.reduce(
    (sum, member) => sum + calculateMemberStats(member, run, round).attack,
    0
  );
  for (const proc of fusionProcs(run)) {
    if (round % proc.everyRounds !== 0 || enemy.hp <= 0) continue;
    const damage = Math.max(1, Math.round(teamAttack * proc.damagePct));
    enemy.hp = Math.max(0, enemy.hp - damage);
    damageByMember._fusion += damage;
    if (run.__counters) run.__counters.fusionHits++;
    const narration = fusionNarrative(proc, enemy);
    addBattleLog(logs, `${narration}，轰出${damage}点伤害！`);
    addBattleAction(run, {
      side: 'team',
      actor: '全队共鸣',
      skill: proc.label,
      verb: proc.verb || '凝聚',
      target: enemy.name,
      damage,
      narration,
    });
    if (proc.selfDamagePct) {
      for (const member of living) {
        const stats = calculateMemberStats(member, run);
        damageMember(run, member, stats.maxHp * proc.selfDamagePct, logs, {
          side: 'system',
          kind: 'recoil',
          actor: '全队共鸣',
          skill: `${proc.label}反噬`,
        });
      }
    }
  }
}

export function resolveEndlessLayer(run) {
  if (run.phase !== 'ready') throw new Error('全队尚未完成能力选择');
  const layer = run.layer + 1;
  const enemy = createEndlessEnemy(run, layer);
  const logs = [];
  const damageByMember = Object.fromEntries(
    Object.keys(run.members).map((id) => [id, 0])
  );
  damageByMember._fusion = 0;
  const damageTakenByMember = Object.fromEntries(
    Object.keys(run.members).map((id) => [id, 0])
  );
  const counters = {
    fusionHits: 0,
    revive: 0,
    lifeFireUsed: 0,
  };
  prepareBattle(run);
  run.__damageTakenByMember = damageTakenByMember;
  run.__counters = counters;
  addBattleLog(
    logs,
    `第${layer}层·${enemy.worldName}：${enemy.name}降临（${enemy.trait}；队伍修正+${Math.round(
      (enemy.teamScale - 1) * 100
    )}%）。`
  );

  let rounds = 0;
  const roundDetails = [];
  for (let round = 1; round <= 30; round++) {
    rounds = round;
    run.__roundActions = [];
    const logStart = logs.length;
    const enemyHpBefore = enemy.hp;
    const damageBefore = { ...damageByMember };
    const takenBefore = Object.values(damageTakenByMember).reduce(
      (sum, value) => sum + value,
      0
    );
    for (const member of Object.values(run.members)) {
      playerAttack(run, member, enemy, round, logs, damageByMember);
      if (enemy.hp <= 0) break;
    }
    if (enemy.hp > 0)
      applyFusionProc(run, enemy, round, logs, damageByMember);
    if (enemy.hp > 0) enemyTurn(run, enemy, round, logs);
    if (
      enemy.hp > 0 &&
      Object.values(run.members).some((member) => member.alive)
    )
      endRound(run, enemy, logs);
    const attacks = Object.keys(run.members)
      .map((id) => ({
        id,
        name: run.members[id].name,
        damage: Math.max(0, damageByMember[id] - damageBefore[id]),
      }))
      .filter((attack) => attack.damage > 0);
    const takenAfter = Object.values(damageTakenByMember).reduce(
      (sum, value) => sum + value,
      0
    );
    const members = Object.values(run.members).map((member) => {
      const stats = calculateMemberStats(member, run, round);
      return {
        id: member.id,
        name: member.name,
        hp: Math.max(0, member.hp),
        maxHp: stats.maxHp,
        alive: member.alive,
      };
    });
    const teamHp = members.reduce((sum, member) => sum + member.hp, 0);
    const teamMaxHp = members.reduce((sum, member) => sum + member.maxHp, 0);
    roundDetails.push({
      round,
      attacks,
      fusionDamage: Math.max(
        0,
        damageByMember._fusion - damageBefore._fusion
      ),
      enemyDamage: Math.max(0, enemyHpBefore - enemy.hp),
      teamDamageTaken: Math.max(0, takenAfter - takenBefore),
      enemyHp: Math.max(0, enemy.hp),
      enemyHpPct: Math.round(
        (Math.max(0, enemy.hp) / Math.max(1, enemy.maxHp)) * 100
      ),
      teamHpPct: Math.round((teamHp / Math.max(1, teamMaxHp)) * 100),
      members,
      actions: run.__roundActions,
      events: logs.slice(logStart),
    });
    if (
      enemy.hp <= 0 ||
      !Object.values(run.members).some((member) => member.alive)
    )
      break;
  }

  const victory =
    enemy.hp <= 0 && Object.values(run.members).some((member) => member.alive);
  run.layer = layer;
  let layerReward = null;
  if (victory) {
    run.highestClearedLayer = Math.max(
      asNumber(run.highestClearedLayer),
      layer
    );
    layerReward = finishVictory(run, enemy, layer);
    if (enemy.stage === 'boss') beginCheckpoint(run, layer);
    else setPendingChoices(run, layer + 1);
  } else {
    for (const member of Object.values(run.members)) {
      member.alive = false;
      member.hp = 0;
    }
    run.phase = 'defeated';
    run.pendingChoices = {};
    if (rounds >= 30)
      addBattleLog(logs, '战斗拖入第三十回合，劫境坍塌吞没了所有投影。');
  }

  const livingIds = Object.keys(run.members);
  const totalDamage = livingIds.reduce(
    (sum, id) => sum + damageByMember[id],
    0
  );
  const mvpId = livingIds.length
    ? livingIds.reduce((best, id) =>
        damageByMember[id] > damageByMember[best] ? id : best
      )
    : null;
  let analysis;
  if (!victory) {
    if (rounds >= 30)
      analysis = '输出不足以在三十回合内击碎劫境守关者，建议提升爆发与连段。';
    else if (run.lifeFire <= 0)
      analysis = '命火耗尽，全队投影被逐一击碎，注意堆叠护盾与减伤扛过前期。';
    else
      analysis = '核心成员过早阵亡导致输出断层，建议优先保住核心输出位。';
  }
  const summary = {
    totalDamage,
    mvpId,
    mvpName: mvpId ? run.members[mvpId]?.name : null,
    mvpDamage: mvpId ? damageByMember[mvpId] : 0,
    fusionHits: counters.fusionHits,
    revive: counters.revive,
    lifeFireUsed: counters.lifeFireUsed,
    analysis: analysis || null,
  };

  run.lastBattle = {
    layer,
    stage: enemy.stage,
    world: enemy.worldName,
    enemy: enemy.name,
    trait: enemy.trait,
    enemyCount: enemy.monsterCount,
    enemyUnitMaxHp: enemy.unitMaxHp,
    enemyTeamScale: enemy.teamScale,
    victory,
    rounds,
    enemyRemainingHp: enemy.hp,
    enemyMaxHp: enemy.maxHp,
    damageByMember,
    damageTakenByMember,
    roundDetails,
    layerReward,
    summary,
    logs,
    at: Date.now(),
  };
  delete run.__damageTakenByMember;
  delete run.__counters;
  delete run.__roundActions;
  return clone(run.lastBattle);
}

export function getSettlement(run, retention = 1) {
  ensureRewardState(run);
  const safeRetention = clamp(asNumber(retention, 1), 0, 1);
  const members = {};
  for (const member of Object.values(run.members || {})) {
    members[member.id] = {
      cultivation: Math.round(
        member.bankedRewards.cultivation +
          member.unbankedRewards.cultivation * safeRetention
      ),
      blood: Math.round(
        member.bankedRewards.blood + member.unbankedRewards.blood * safeRetention
      ),
      lostCultivation: Math.round(
        member.unbankedRewards.cultivation * (1 - safeRetention)
      ),
      lostBlood: Math.round(member.unbankedRewards.blood * (1 - safeRetention)),
    };
  }
  return {
    lingshi: Math.round(
      run.banked.lingshi + run.unbanked.lingshi * safeRetention
    ),
    sourceStone: Math.round(
      run.banked.sourceStone + run.unbanked.sourceStone * safeRetention
    ),
    tokens: Math.round(
      run.banked.tokens + run.unbanked.tokens * safeRetention
    ),
    lostLingshi: Math.round(run.unbanked.lingshi * (1 - safeRetention)),
    lostSourceStone: Math.round(
      run.unbanked.sourceStone * (1 - safeRetention)
    ),
    lostTokens: Math.round(run.unbanked.tokens * (1 - safeRetention)),
    members,
  };
}

export function getFusion(fusionId) {
  const fusion = CONTENT.fusions.find((item) => item.id === fusionId);
  return fusion ? clone(fusion) : null;
}

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const contentPath = fileURLToPath(
  new URL('../resources/data/无尽劫境.json', import.meta.url)
);
const CONTENT = Object.freeze(JSON.parse(fs.readFileSync(contentPath, 'utf8')));
const ABILITIES = new Map(
  CONTENT.abilities.map((ability) => [ability.id, ability])
);
const WORLDS = new Map(CONTENT.worlds.map((world) => [world.id, world]));
const RARITY_WEIGHT = Object.freeze({ 普通: 6, 稀有: 4, 核心: 2.5, 禁忌: 1 });

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
  const total = pool.reduce(
    (sum, item) => sum + (RARITY_WEIGHT[item.rarity] || 1),
    0
  );
  let cursor = random(run) * total;
  for (const item of pool) {
    cursor -= RARITY_WEIGHT[item.rarity] || 1;
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
    growthAttackPct: 0,
  };
}

function isAbilityAvailable(member, ability) {
  return getOwnedLevel(member, ability.id) < asNumber(ability.maxLevel, 1);
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

export function getEndlessContent() {
  return clone(CONTENT);
}

export function getAbility(abilityId) {
  const ability = ABILITIES.get(abilityId);
  return ability ? clone(ability) : null;
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
    version: 2,
    contentVersion: CONTENT.version,
    teamId,
    groupId: String(groupId),
    layer: 0,
    phase: 'choice',
    rngState: Number(seed) >>> 0,
    worldOrder: [],
    members: {},
    fusions: [],
    pendingChoices: {},
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

  const oldMaximums = Object.fromEntries(
    Object.values(run.members).map((member) => [
      member.id,
      calculateMemberStats(member, run).maxHp,
    ])
  );
  const member = run.members[memberId];
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

function getStage(layer) {
  if (layer % 10 === 0) return 'boss';
  if (layer % 5 === 0) return 'elite';
  return 'normal';
}

function createEnemy(run, layer) {
  const world = getWorldForLayer(run, layer);
  const stage = getStage(layer);
  const pool = world[stage];
  const template = pool[Math.floor(random(run) * pool.length)];
  const teamSize = Object.keys(run.members).length;
  const healthScale = Math.pow(1.105, layer - 1) * (0.45 + 0.55 * teamSize);
  const attackScale =
    Math.pow(1.05, layer - 1) * (0.84 + 0.08 * (teamSize - 1));
  const defenseScale = Math.pow(1.035, layer - 1);
  const enemy = {
    ...template,
    world: world.id,
    worldName: world.name,
    stage,
    maxHp: Math.round(template.hp * healthScale),
    attack: Math.round(template.attack * attackScale),
    defense: Math.round(template.defense * defenseScale),
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
  const hasPastSelf = getOwnedLevel(member, 'perfect_free_transformation') > 0;
  const eternalShadow = (run.fusions || []).includes('fusion_eternal_shadow');
  if (eternalShadow) {
    return {
      name: '诸世暗影军团',
      detail: '过去之我披上影甲，万千暗影之手从敌人脚下同时探出',
    };
  }
  if (hasShadow && hasPastSelf) {
    return {
      name: '暗影之手与过去之我',
      detail: '暗影之手封锁退路，跨越岁月的投影从正面轰杀',
    };
  }
  if (hasShadow) {
    return {
      name: '暗影之手',
      detail: '漆黑巨手撕开目标身后的影子，与本体形成夹击',
    };
  }
  if (hasPastSelf) {
    return {
      name: '过去之我',
      detail: '古老投影跨越岁月长河，与当世之身同时出手',
    };
  }
  return {
    name: '诸天虚影',
    detail: '队伍的召唤共鸣牵引诸天投影降临战场',
  };
}

function procNarrative(proc, member, enemy) {
  if (proc.abilityId === 'perfect_thunder_emperor')
    return {
      verb: '引动',
      detail: `${member.name}结出雷帝法印，九天雷罚贯穿云海锁定${enemy.name}`,
    };
  if (proc.abilityId === 'perfect_free_transformation')
    return {
      verb: '映照',
      detail: `${member.name}截取岁月道痕，映照一尊过去之我跨越时空出手`,
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

function fusionNarrative(proc, enemy) {
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
    const procDamage = Math.max(
      1,
      Math.round(stats.attack * proc.damagePct * proc.level)
    );
    enemy.hp -= procDamage;
    damageByMember[member.id] += procDamage;
    const narrative = procNarrative(proc, member, enemy);
    addBattleAction(run, {
      side: 'player',
      actor: member.name,
      skill: proc.label,
      verb: narrative.verb,
      target: enemy.name,
      damage: procDamage,
      narration: narrative.detail,
    });
    addBattleLog(
      logs,
      `${narrative.detail}，${proc.label}追加${procDamage}点伤害！`
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
          skill: `${proc.label}反噬`,
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

function enemyTurn(run, enemy, round, logs) {
  const alive = Object.values(run.members).filter((member) => member.alive);
  if (!alive.length || enemy.hp <= 0) return;
  const isAreaAttack = enemy.stage === 'boss' && round % 3 === 0;
  if (isAreaAttack || (enemy.trait === '群攻' && round % 4 === 0)) {
    addBattleLog(logs, `${enemy.name}发动覆灭全场的攻势！`);
    for (const member of alive) {
      if (enemy.hp <= 0) break;
      enemyHit(
        run,
        enemy,
        member,
        0.72,
        logs,
        enemy.stage === 'boss' ? '位面覆灭' : '怪潮横扫'
      );
    }
    return;
  }
  const target = alive[Math.floor(random(run) * alive.length)];
  enemyHit(run, enemy, target, 1, logs, '普通攻击');
  if (enemy.trait === '迅捷' && round % 3 === 0 && enemy.hp > 0) {
    const remaining = Object.values(run.members).filter(
      (member) => member.alive
    );
    if (remaining.length)
      enemyHit(
        run,
        enemy,
        remaining[Math.floor(random(run) * remaining.length)],
        0.65,
        logs,
        '迅捷追击'
      );
  }
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

function treasureReward(run, realm, member) {
  const realms = member.rewardRealms || {};
  const primary = Math.max(0, asNumber(realms[realm]));
  const secret = Math.max(0, asNumber(realms.secret));
  const ancient = Math.max(0, asNumber(realms.ancient));
  return Math.trunc(
    (2000 + 10000 * primary ** 2 * secret * ancient * (2 + random(run))) * 10
  );
}

function finishVictory(run, enemy, layer) {
  ensureRewardState(run);
  const baseRecovery =
    enemy.stage === 'boss' ? 1 : enemy.stage === 'elite' ? 0.12 : 0.05;
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

  const stageMultiplier =
    enemy.stage === 'boss' ? 3 : enemy.stage === 'elite' ? 1.6 : 1;
  const rewardBase = Math.round(
    30000 * layer * (1 + layer * 0.03) * stageMultiplier
  );
  const layerReward = {
    lingshi: rewardBase * 100000,
    sourceStone: Math.round((1200000 + layer * 80000) * stageMultiplier),
    tokens: Math.round((20 + layer * 5) * stageMultiplier),
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
    run.lifeFire = Math.min(run.maxLifeFire, run.lifeFire + 1);
    for (const member of Object.values(run.members)) {
      member.alive = true;
      const stats = calculateMemberStats(member, run);
      member.maxHp = stats.maxHp;
      member.hp = stats.maxHp;
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
      verb: '凝聚',
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
  const enemy = createEnemy(run, layer);
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
    `第${layer}层·${enemy.worldName}：${enemy.name}降临（${enemy.trait}）。`
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
    layerReward = finishVictory(run, enemy, layer);
    setPendingChoices(run, layer + 1);
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

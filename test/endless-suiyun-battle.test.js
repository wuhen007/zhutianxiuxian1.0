import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createSuiyunRoot } from '../model/suiyun.js';
import { createCrossRaidAvatar, hydrateCrossRaidAvatar } from '../apps/worldChat/raid.js';
import {
  ENDLESS_TREASURES,
  SUIYUN_ENDLESS_TREASURE_ID,
  SUIYUN_ENDLESS_COMBAT,
  getSuiyunTreasureCombat,
  getTreasureStates,
} from '../model/endlessTreasure.js';

// 与现有战斗回归一致，从真实源码访问私有结算入口；不向生产模型添加测试导出。
const sourceUrl = new URL('../model/endlessRealm.js', import.meta.url);
const dependencies = [];
let source = fs.readFileSync(sourceUrl, 'utf8').replace(
  /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm,
  (_statement, binding, specifier) => {
    const index = dependencies.length;
    dependencies.push(import(specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : specifier));
    return binding.trim().startsWith('{')
      ? `let ${binding.replace(/\bas\b/g, ':')} = dependencies[${index}];`
      : `let ${binding.trim()} = dependencies[${index}].default;`;
  }
).replace(/\bimport\.meta\.url\b/g, JSON.stringify(sourceUrl.href)).replace(/^export /gm, '');
const modules = await Promise.all(dependencies);
const loadBattle = new Function('dependencies', `${source}\nconst seededRandom = random; return {
  createEndlessRun, resolveEndlessLayer, getMemberStats, getEndlessContent,
  prepareBattle, playerAttack, enemyHit, triggerBossMechanisms, endRound,
  tryBossRevive, damageMember, damageEnemy, runTreasureCombat, runSuiyunSword,
  setRandom(values = [], fallback = .999) {
    const queue = [...values];
    random = () => queue.length ? queue.shift() : fallback;
  },
  useSeededRandom() { random = seededRandom; },
  disableCausalExecution() {
    const original = getSuiyunTreasureCombat;
    getSuiyunTreasureCombat = (member, run) => {
      const entry = original(member, run);
      return entry ? { ...entry, causalExecuteChance: 0 } : null;
    };
  }
};`);

function fixture(stage = 1, extra = {}) {
  const api = loadBattle(modules);
  const run = api.createEndlessRun({
    teamId: 'suiyun-treasure', groupId: 'test', seed: 20261018,
    players: [
      { id: 'owner', player: { 名号: '月华剑修', 灵根: stage ? createSuiyunRoot(stage) : { name: '凡体' }, ...extra } },
      { id: 'ordinary', player: { 名号: '同行修士', 灵根: { name: '凡体' } } },
    ],
  });
  run.phase = 'ready';
  run.pendingChoices = {};
  run.lifeFire = 0;
  run.__roundActions = [];
  run.__damageTakenByMember = { owner: 0, ordinary: 0 };
  const member = run.members.owner, ordinary = run.members.ordinary;
  for (const current of [member, ordinary]) {
    current.base = { hp: 100_000, attack: 100, defense: 0, speed: 100 };
    current.maxHp = api.getMemberStats(run, current.id).maxHp;
    current.hp = 1;
    current.shield = 0;
  }
  const enemy = {
    name: '试炼首领', stage: 'boss', layer: 50, trait: '', mechanisms: [],
    hp: 1_000_000_000, maxHp: 1_000_000_000, unitMaxHp: 1_000_000_000,
    monsterCount: 1, attack: 100, defense: 1_000_000_000,
    shield: 0, maxShield: 0, revivesLeft: 0, bossCycle: 5,
  };
  api.setRandom();
  return { api, run, member, ordinary, enemy, logs: [], damage: { owner: 0, ordinary: 0, _fusion: 0, _assist: 0 } };
}

function sword(f, values = [], round = 1, fallback = .999) {
  f.api.setRandom(values, fallback);
  f.api.runSuiyunSword(f.run, f.member, f.enemy, round, f.logs, f.damage,
    SUIYUN_ENDLESS_COMBAT, { ...f.api.getMemberStats(f.run, 'owner'), attack: 100 });
}
const slashes = f => f.run.__roundActions.filter(action => /霜月剑潮·连续斩击|霜月一剑/.test(action.skill));

test('岁云至宝：五阶段自动投影，灵根名在跨服 JSON 快照中保留且队友不继承', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const f = fixture(stage);
    assert.ok(f.member.treasureIds.some(treasure => treasure.id === SUIYUN_ENDLESS_TREASURE_ID));
    assert.equal(f.ordinary.treasureIds.some(treasure => treasure.id === SUIYUN_ENDLESS_TREASURE_ID), false);
    const restored = JSON.parse(JSON.stringify(f.run));
    assert.deepEqual(restored.members.owner.灵根, { name: createSuiyunRoot(stage).name });
    assert.ok(getSuiyunTreasureCombat(restored.members.owner, restored));
    assert.equal(getSuiyunTreasureCombat(restored.members.ordinary, restored), null);
    const snapshot = createCrossRaidAvatar({ 名号: '异服剑修', 灵根: createSuiyunRoot(stage) });
    const avatar = hydrateCrossRaidAvatar(JSON.parse(JSON.stringify(snapshot)), { serverId: 'remote', memberTag: 'sword' });
    const crossRun = f.api.createEndlessRun({ teamId: 'cross', groupId: 'test', seed: 42, players: [{ id: avatar.id, player: avatar }] });
    assert.ok(getSuiyunTreasureCombat(crossRun.members[avatar.id], crossRun), '真实跨服创建与还原链保留本命至宝资格');
  }
});

test('岁云至宝：非本系灵根伪造收藏、装配与投影均不获得战斗效果', () => {
  const f = fixture(0, {
    无尽至宝列表: [{ id: SUIYUN_ENDLESS_TREASURE_ID, level: 10 }],
    无尽至宝装配: [SUIYUN_ENDLESS_TREASURE_ID],
    月华传承: { 技能: ['霜剑入月', '岁云归一', '白云苍狗'] },
  });
  assert.equal(f.member.treasureIds.some(treasure => treasure.id === SUIYUN_ENDLESS_TREASURE_ID), false);
  f.member.treasureIds.push({ id: SUIYUN_ENDLESS_TREASURE_ID, level: 10 });
  assert.equal(getSuiyunTreasureCombat(f.member, f.run), null);
  assert.deepEqual(f.api.getMemberStats(f.run, 'owner'), f.api.getMemberStats(f.run, 'ordinary'));
  f.api.playerAttack(f.run, f.member, f.enemy, 1, f.logs, f.damage);
  assert.equal(slashes(f).length, 0);
  assert.equal(f.damage.owner, 1, '普通攻击仍被高防御压至最低伤害');
  assert.equal(f.member.hp, 1, '伪造至宝没有吸血');
});

test('霜月领域：封法仅对本人无效，每场重置超限、沉默与旧封印', () => {
  const f = fixture();
  const ids = f.api.getEndlessContent().abilities.slice(0, 3).map(ability => ability.id);
  for (const current of [f.member, f.ordinary]) {
    current.abilities = Object.fromEntries(ids.map(id => [id, 1]));
    current.silencedUntilRound = 100;
    current.battleSealedAbilityIds = [ids[0]];
  }
  f.member.suiyunOverlimitRounds = 3;
  f.enemy.trait = '封法';
  f.api.prepareBattle(f.run, f.enemy, { sealedAbilityCount: 1 }, f.logs);
  assert.equal(f.member.suiyunOverlimitRounds || 0, 0);
  assert.equal(f.member.silencedUntilRound, undefined);
  assert.equal(f.member.battleSealedAbilityIds?.length || 0, 0);
  assert.equal(f.ordinary.battleSealedAbilityIds.length, 3);
});

test('霜月领域：大道沉寂阻断在本人，普通队友仍被沉默', () => {
  const f = fixture();
  f.enemy.mechanisms = ['沉默'];
  f.api.setRandom([0]);
  f.api.triggerBossMechanisms(f.run, f.enemy, 4, f.logs);
  assert.equal(f.member.silencedUntilRound || 0, 0);
  f.api.setRandom([.999]);
  f.api.triggerBossMechanisms(f.run, f.enemy, 4, f.logs);
  assert.equal(f.ordinary.silencedUntilRound, 5);
});

test('霜月领域：免疫碎盾但不免普通伤害，队友护盾照常被粉碎', () => {
  const f = fixture();
  f.enemy.mechanisms = ['破盾'];
  f.member.shield = 1000;
  f.ordinary.shield = 10;
  f.api.triggerBossMechanisms(f.run, f.enemy, 3, f.logs);
  assert.ok(f.member.shield > 0 && f.member.shield < 1000);
  assert.equal(f.member.hp, 1, '剩余护盾吸收碎盾招式的普通伤害');
  f.ordinary.shield = 2000;
  f.ordinary.hp = f.ordinary.maxHp;
  f.api.triggerBossMechanisms(f.run, f.enemy, 3, f.logs);
  assert.equal(f.ordinary.shield, 0);
  assert.ok(f.ordinary.hp < f.ordinary.maxHp);
});

test('霜月领域：处决与反射负面无效，直接攻击和自身反噬仍扣血', () => {
  const f = fixture();
  f.member.hp = 500;
  f.ordinary.hp = f.ordinary.maxHp;
  f.enemy.mechanisms = ['斩杀'];
  f.api.triggerBossMechanisms(f.run, f.enemy, 5, f.logs);
  assert.equal(f.member.hp, 500);
  assert.equal(f.member.alive, true);
  f.api.damageMember(f.run, f.member, 100, f.logs, { side: 'enemy', actor: f.enemy.name, skill: '反射反噬', negativeEffect: true });
  assert.equal(f.member.hp, 500);
  f.api.damageMember(f.run, f.member, 100, f.logs, { side: 'enemy', actor: f.enemy.name, skill: '普通攻击' });
  assert.equal(f.member.hp, 400);
  f.api.damageMember(f.run, f.member, 100, f.logs, { side: 'system', kind: 'recoil', actor: f.member.name, skill: '自身反噬' });
  assert.equal(f.member.hp, 300);
  f.ordinary.hp = 1;
  f.api.triggerBossMechanisms(f.run, f.enemy, 5, f.logs);
  assert.equal(f.ordinary.alive, false, '霜月领域不为队友免疫即死');
});

test('霜月领域：高血线天命斩杀属于普通攻击，不被即死免疫误吞', () => {
  const f = fixture();
  f.member.hp = f.member.maxHp;
  f.ordinary.hp = f.ordinary.maxHp;
  f.enemy.mechanisms = ['斩杀'];
  const stats = f.api.getMemberStats(f.run, 'owner');
  f.api.triggerBossMechanisms(f.run, f.enemy, 5, f.logs);
  assert.equal(f.member.maxHp - f.member.hp, Math.round(f.enemy.attack * 1.6 * (1 - stats.damageReduction)));
});

test('霜月领域：破甲只对本人失效，按完整 65% 防御抵挡而队友仅按 25%', () => {
  const f = fixture();
  f.enemy.trait = '破甲';
  f.enemy.attack = 1000;
  for (const current of [f.member, f.ordinary]) {
    current.base.defense = 100;
    current.hp = current.maxHp;
    const stats = f.api.getMemberStats(f.run, current.id);
    f.api.enemyHit(f.run, f.enemy, current, 1, f.logs);
    const defenseRate = current === f.member ? .65 : .25;
    const expected = Math.round(Math.max(1, 1000 - stats.defense * defenseRate) * (1 - stats.damageReduction));
    assert.equal(current.maxHp - current.hp, expected);
  }
});

test('霜月领域：禁疗不折损本人恢复，队友仍受禁疗压制', () => {
  for (const bossAntiHeal of [false, true]) {
    const f = fixture();
    if (bossAntiHeal) f.enemy.mechanisms = ['禁疗'];
    else f.enemy.trait = '禁疗';
    f.ordinary.eventBuffs = { regenPct: .1 };
    const ownStats = f.api.getMemberStats(f.run, 'owner');
    const allyStats = f.api.getMemberStats(f.run, 'ordinary');
    f.api.endRound(f.run, f.enemy, 1, f.logs, f.damage);
    assert.equal(f.member.hp, 1 + Math.round(ownStats.maxHp * ownStats.regenPct));
    assert.equal(f.ordinary.hp, 1 + Math.round(allyStats.maxHp * allyStats.regenPct * (bossAntiHeal ? .35 : .5)));
  }
});

test('霜月一剑：完整无视防御，24 倍群伤按当前存活单位数计算', () => {
  const f = fixture();
  f.enemy.monsterCount = 5;
  f.enemy.unitMaxHp = f.enemy.maxHp / 5;
  f.enemy.hp = f.enemy.unitMaxHp * 2.2;
  const before = f.enemy.hp;
  sword(f);
  assert.equal(before - f.enemy.hp, 100 * 24 * 3);
  assert.equal(f.member.hp, 1 + 100 * 24 * 3);
  assert.equal(slashes(f).length, 1);
  assert.match(slashes(f)[0].note, /群攻3个目标/);
});

test('全额吸血：只按实际扣除敌方生命结算，护盾和过量伤害不吸血', () => {
  for (const [hp, shield, expectedHealing] of [[100, 100, 100], [1000, 3000, 0], [3000, 500, 1900]]) {
    const f = fixture();
    f.enemy.hp = hp;
    f.enemy.shield = shield;
    sword(f);
    assert.equal(f.member.hp, 1 + expectedHealing, `hp=${hp}, shield=${shield}`);
    assert.equal(f.ordinary.hp, 1);
  }
});

test('剑尊完整攻击链：普攻与其他已装至宝一并忽略防御、吸血，专属剑式每轮只执行一次', () => {
  const damages = [];
  for (const defense of [0, 1_000_000_000_000]) {
    const f = fixture();
    f.member.treasureIds.push({ id: 'treasure_strongest_qi', level: 1 });
    f.member.abilities.anime_shura_armor = 1;
    f.enemy.defense = defense;
    f.api.playerAttack(f.run, f.member, f.enemy, 3, f.logs, f.damage);
    assert.equal(slashes(f).length, 1);
    assert.ok(f.run.__roundActions.some(action => action.skill === '普通攻击'));
    assert.ok(f.run.__roundActions.some(action => action.skill === '神魔灭绝劈'));
    const actualHpDamage = f.enemy.maxHp - f.enemy.hp;
    assert.equal(f.member.hp - 1, actualHpDamage);
    damages.push(actualHpDamage);
  }
  assert.equal(damages[0], damages[1]);
});

test('未来视：65% 边界可闪避或化解整次攻击，未触发时仍承伤', () => {
  for (const choice of [0, .999]) {
    const f = fixture();
    f.member.hp = f.member.maxHp;
    f.member.shield = 50;
    f.api.setRandom([.649999, choice]);
    f.api.enemyHit(f.run, f.enemy, f.member, 1, f.logs);
    assert.equal(f.member.hp, f.member.maxHp);
    assert.equal(f.member.shield, 50);
    assert.equal(f.run.__damageTakenByMember.owner, 0);
    assert.match(f.run.__roundActions.map(action => action.skill).join(' '), /未来视/);
  }
  const miss = fixture();
  miss.member.hp = miss.member.maxHp;
  miss.api.setRandom([.65]);
  miss.api.enemyHit(miss.run, miss.enemy, miss.member, 1, miss.logs);
  assert.ok(miss.member.hp < miss.member.maxHp);
});

test('超限：55% 边界触发 3 回合、2.5 倍剑伤，到期恢复且新战不继承', () => {
  const f = fixture();
  sword(f, [.549999, .999]);
  assert.equal(f.member.suiyunOverlimitRounds, 3);
  assert.equal(slashes(f)[0].damage, 100 * 24 * 2.5);
  for (let round = 1; round <= 3; round++) {
    f.api.endRound(f.run, f.enemy, round, f.logs, f.damage);
    assert.equal(f.member.suiyunOverlimitRounds, 3 - round);
  }
  sword(f, [.55, .999], 4);
  assert.equal(f.member.suiyunOverlimitRounds, 0);
  assert.equal(slashes(f).at(-1).damage, 100 * 24);
  f.member.suiyunOverlimitRounds = 3;
  f.api.prepareBattle(f.run, f.enemy, null, f.logs);
  assert.equal(f.member.suiyunOverlimitRounds || 0, 0);
});

test('超限反弹：来袭原威力 2 倍返还并完全化解，不把减伤与护盾算进反弹', () => {
  for (const sightRoll of [0, .999]) {
    const f = fixture();
    f.member.suiyunOverlimitRounds = 3;
    f.member.hp = f.member.maxHp;
    f.member.shield = 100;
    f.run.__damageByMember = f.damage;
    f.api.setRandom([sightRoll, .999]);
    const enemyHp = f.enemy.hp;
    f.api.enemyHit(f.run, f.enemy, f.member, 1.5, f.logs, '试炼重斩');
    assert.equal(enemyHp - f.enemy.hp, 100 * 1.5 * 2);
    assert.equal(f.damage.owner, 100 * 1.5 * 2);
    assert.equal(f.damage.ordinary, 0);
    assert.equal(f.member.hp, f.member.maxHp);
    assert.equal(f.member.shield, 100);
    assert.equal(f.run.__damageTakenByMember.owner, 0);
    f.ordinary.hp = f.ordinary.maxHp;
    f.api.setRandom();
    f.api.enemyHit(f.run, f.enemy, f.ordinary, 1.5, f.logs);
    assert.ok(f.ordinary.hp < f.ordinary.maxHp, '超限不保护普通队友');
  }
});

test('连续斩击：85% 入连斩、90% 续刀边界及 15 斩硬上限', () => {
  for (const [rolls, fallback, expected] of [
    [[.999, .85], .999, 1],
    [[.999, .849999], .999, 2],
    [[.999, 0, .899999, .9], .999, 3],
    [[.999, 0], 0, 15],
  ]) {
    const f = fixture();
    sword(f, rolls, 1, fallback);
    assert.equal(slashes(f).length, expected, JSON.stringify(rolls));
    assert.equal(f.enemy.maxHp - f.enemy.hp, expected * 100 * 24);
    assert.equal(f.member.suiyunOverlimitRounds || 0, 0);
  }
});

test('预取杀生因果：仅超限第 8 斩起判定，35% 即死清空 Boss 护盾与复活', () => {
  const f = fixture();
  f.enemy.shield = 10_000_000_000;
  f.enemy.maxShield = f.enemy.shield;
  f.enemy.mechanisms = ['复活', '护盾'];
  f.enemy.revivesLeft = 3;
  sword(f, [0, 0, ...Array(6).fill(0), .349999]);
  assert.equal(slashes(f).length, 8);
  assert.equal(f.enemy.hp, 0);
  assert.equal(f.enemy.shield, 0);
  assert.equal(f.enemy.revivesLeft, 0);
  assert.equal(f.api.tryBossRevive(f.run, f.enemy, f.logs), false);
  assert.ok(f.run.__roundActions.some(action => action.execute && /因果/.test(action.skill)));

  const miss = fixture();
  sword(miss, [0, 0, ...Array(6).fill(0), .35, .9]);
  assert.equal(slashes(miss).length, 8);
  assert.ok(miss.enemy.hp > 0);
  assert.equal(miss.run.__roundActions.some(action => action.execute), false);
});

test('普通旧至宝与公共挑战入口：最强之气保留原技能，岁云快照可直接完成真实层战斗', () => {
  const old = fixture(0, { 无尽至宝列表: [{ id: 'treasure_strongest_qi', name: '最强之气', level: 1 }] });
  old.member.abilities.anime_shura_armor = 1;
  old.enemy.defense = 0;
  old.api.runTreasureCombat(old.run, old.member, old.enemy, 3, old.logs, old.damage);
  assert.ok(old.run.__roundActions.some(action => action.skill === '神魔灭绝劈'));
  assert.equal(old.member.hp, 1, '旧至宝不获得岁云吸血');
  assert.equal(slashes(old).length, 0);

  const f = fixture();
  const restored = JSON.parse(JSON.stringify(f.run));
  const result = f.api.resolveEndlessLayer(restored);
  assert.equal(result.victory, true);
  assert.ok(result.roundDetails.flatMap(round => round.actions).some(action => /霜月/.test(action.skill)));
});

function benchmarkTreasure(treasure, level, targetCount) {
  const f = fixture(treasure.id === SUIYUN_ENDLESS_TREASURE_ID ? 1 : 0);
  delete f.run.members.ordinary;
  const abilities = f.api.getEndlessContent().abilities;
  f.member.base = { attack: 100, hp: 1_000_000, defense: 100, speed: 100 };
  f.member.treasureIds = [{ id: treasure.id, level }];
  f.member.abilities = { [treasure.baseAbility]: treasure.baseLevel || 1 };
  const requirement = treasure.awaken;
  Object.assign(f.member.abilities, requirement.requires, requirement.requiresAny?.[0]);
  for (const ability of abilities) {
    if (Object.keys(f.member.abilities).length >= (requirement.minAbilities || 0)) break;
    f.member.abilities[ability.id] ||= 1;
  }
  const inWorld = requirement.minAbilitiesInWorld;
  if (inWorld) {
    for (const ability of abilities.filter(item => item.world === inWorld.world).slice(0, inWorld.count))
      f.member.abilities[ability.id] ||= 1;
  }
  f.member.__worldAbilityCounts = {};
  for (const id of Object.keys(f.member.abilities)) {
    const world = abilities.find(ability => ability.id === id)?.world;
    if (world) f.member.__worldAbilityCounts[world] = (f.member.__worldAbilityCounts[world] || 0) + 1;
  }
  f.member.blessings = [...new Set([...(requirement.requiresBoons || []), ...(treasure.stages || []).flatMap(stage => stage.requiresBoons || [])])];
  f.run.fusions = [...(requirement.requiresFusions || [])];
  assert.equal(getTreasureStates(f.member, f.run)[0].awaken.active, true, treasure.name);
  Object.assign(f.enemy, {
    maxHp: 1_000_000 * targetCount, hp: 1_000_000 * targetCount,
    unitMaxHp: 1_000_000, monsterCount: targetCount, defense: 100,
  });
  f.api.prepareBattle(f.run, f.enemy, null, f.logs);
  f.member.hp = f.member.maxHp;
  f.api.disableCausalExecution();
  f.api.useSeededRandom();
  f.run.rngState = 20261018;
  let riderActions = 0;
  for (let round = 1; round <= 30; round++) {
    // 固定满血 Boss 木桩逐轮补满，保留至宝状态；避免即死及过量伤害夸大持续输出。
    f.enemy.hp = f.enemy.maxHp;
    f.enemy.shield = 0;
    f.run.__roundActions = [];
    f.api.playerAttack(f.run, f.member, f.enemy, round, f.logs, f.damage);
    f.api.endRound(f.run, f.enemy, round, f.logs, f.damage);
    riderActions += f.run.__roundActions.filter(action => /旧十年最终形态必杀|构筑：/.test(action.note)).length;
  }
  if (treasure.id === 'treasure_decade') assert.ok(riderActions >= 300, '帝骑十位独立骑士也纳入对照');
  return { name: treasure.name, damage: f.damage.owner };
}

test('固定种子输出基准：Lv.1/Lv.10、百万血单体及五目标，岁云 30 回合输出领先全部旧至宝', context => {
  for (const level of [1, 10]) for (const targets of [1, 5]) {
    const result = ENDLESS_TREASURES.map(treasure => benchmarkTreasure(treasure, level, targets));
    const suiyun = result.find(item => item.name === '岁云剑尊');
    const legacy = result.filter(item => item !== suiyun).sort((a, b) => b.damage - a.damage);
    assert.equal(legacy.length, 29);
    context.diagnostic(`Lv.${level} / ${targets}目标 / 30回合：岁云 ${suiyun.damage}，旧宝最高 ${legacy[0].name} ${legacy[0].damage}，比值 ${(suiyun.damage / legacy[0].damage).toFixed(2)}x`);
    assert.ok(legacy.every(item => suiyun.damage > item.damage), JSON.stringify({ level, targets, suiyun, strongestLegacy: legacy[0] }));
  }
});

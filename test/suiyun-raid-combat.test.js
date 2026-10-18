import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as suiyun from '../model/suiyunCombat.js';
import * as memoryCombat from '../model/memoryCombat.js';
import { createSuiyunRoot, getSuiyunEffects, hasSuiyunSkills, SUIYUN_EXCLUSIVE_SKILLS } from '../model/suiyun.js';
import { createMemoryRoot } from '../model/memoryPath.js';
import { mergeHighRealmRaidResult, prepareHighRealmBattle } from '../model/highRealmBarrier.js';

const source = fs.readFileSync(new URL('../apps/Battle/tuanben.js', import.meta.url), 'utf8');
const combatSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const ACTION_BAR_MAX = 5000;
function actionFunction(name) {
  const method = combatSource.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n\\}`, 'm'))?.[0];
  assert.ok(method, name);
  return new Function('ACTION_BAR_MAX', `${method.replace('export ', '')}; return ${name};`)(ACTION_BAR_MAX);
}

function loadRaid() {
  const dependencies = {
    ...suiyun, ...memoryCombat, getSuiyunEffects, hasSuiyunSkills, prepareHighRealmBattle, mergeHighRealmRaidResult,
    plugin: class {}, data: { jineng1: [], jineng2: [], jineng3: [], jineng_heal: [] },
    ensureNumber: (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    bigNumberTransform: value => String(value),
    initActionBar: actionFunction('initActionBar'), advanceUnitBars: actionFunction('advanceUnitBars'),
    getReadyUnits: actionFunction('getReadyUnits'), boostActionBar: actionFunction('boostActionBar'),
    pushBackActionBar: actionFunction('pushBackActionBar'), ACTION_BAR_MAX,
    applyEmperorWorldTripodOpening: () => ({ active: false }),
    applySuperdimensionalOpening: () => ({ active: false }),
    applyRelicBattleOpening: () => ({ active: false }),
    settleBattleGongfaProficiency: async () => ({}),
    getZheziReviveConfig: () => ({ maxRevives: 0, recoveryRatios: [] }),
    filterEquippedVitalitySkills: () => [],
    hasLearnedGongfa: () => false,
    resolveHuangwuLethalGuard: () => ({ triggered: false }),
    getRealmAuthorityLevel: player => player.mijinglevel_id || 0,
    getGodDemonStealRule: () => ({ triggers: false }),
    calculateHarm: (attack, defense) => Math.max(0, attack - defense),
    getCompanionAttackAction: () => '发动协同攻击',
    九秘功法列表: [],
  };
  const stripped = source.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*\r?\n/gm, '').replace(/^export /gm, '');
  return new Function(...Object.keys(dependencies), `${stripped}\nreturn { tuanben, applyRaidSuiyunDamage, applyRaidMoonHit };`)(...Object.values(dependencies));
}

const owner = (overrides = {}) => ({
  名号: '月华剑修', 灵根: createSuiyunRoot(1), 攻击: 100, 防御: 100,
  血量上限: 1000, 当前血量: 1000, 速度: 100, 暴击率: 0, 暴击伤害: 1.5,
  学习的功法: [], mijinglevel_id: 0, xiangulevel_id: 0, ...overrides,
});
const enemy = (overrides = {}) => ({
  名号: '试炼首领', 灵根: { name: '普通' }, 攻击: 10, 防御: 0,
  血量上限: 1000000, 当前血量: 1000000, 速度: 100, ...overrides,
});

async function runBattle(player, boss, options = {}) {
  const { tuanben } = loadRaid();
  const app = Object.create(tuanben.prototype);
  const logs = [];
  const actions = [];
  const observed = {};
  app.sendBattleImages = async (_event, messages) => logs.push(...messages);
  app.triggerVitalityRecovery = () => false;
  app.calculateAttack = async (attacker, defender) => {
    actions.push({ name: attacker.名号, attack: attacker.攻击, target: defender.名号 });
    return { damage: attacker.名号 === '月华剑修' ? (options.playerDamage || 0) : (options.bossDamage ?? attacker.攻击), msgs: [], 斩杀阈值: options.execute || 0 };
  };
  const originalReset = app.resetPlayersStatus;
  app.resetPlayersStatus = players => {
    observed.players = structuredClone(players);
    originalReset.call(app, players);
  };
  const random = Math.random;
  Math.random = () => options.random ?? .99;
  try {
    const result = await app.tb_battle([player], boss, {});
    return { result, logs, actions, observed };
  } finally { Math.random = random; }
}

test('团本真实伤害入口岁云归一减伤50%，按实际掉血反弹而非过量伤害', () => {
  const { applyRaidSuiyunDamage } = loadRaid();
  const player = owner();
  const boss = enemy();
  const logs = [];
  assert.equal(applyRaidSuiyunDamage(player, boss, 80, logs), 40);
  assert.equal(player.当前血量, 960);
  assert.equal(boss.当前血量, 999960);
  player.当前血量 = 10;
  assert.equal(applyRaidSuiyunDamage(player, boss, 1000, logs), 10);
  assert.equal(boss.当前血量, 999950);
  assert.equal(player._suiyunRevives, 1);
  assert.equal(player.当前血量, 1500);
  assert.equal(player.攻击, 150);
});

test('独立团本行动条初始化也计岁云常青+200，原速度存档不回写', async () => {
  const original = owner({ 速度: 1 });
  const run = await runBattle(original, enemy({ 速度: 10000, 攻击: 1e10 }), { bossDamage: 1e12 });
  assert.equal(original.速度, 1);
  assert.equal(original._speed, undefined);
  assert.equal(run.observed.players[0]._speed, (1 + 200) * 1.5 ** 3);
});
test('团本霜剑保留护盾与一次性免疫，不调用防御公式或防御技能', () => {
  const { applyRaidMoonHit } = loadRaid();
  const player = owner();
  const boss = enemy({ 防御: 1e30, 护盾值: 2500, 法力免疫: '一次免疫' });
  const logs = [];
  const result = suiyun.castSuiyunMoonSword(player, [boss], {
    applyDamage: (target, raw, caster) => applyRaidMoonHit(target, caster, raw, logs),
  });
  assert.equal(result.hits, 9);
  assert.equal(result.totalDamage, 7 * 2500);
  assert.equal(boss.护盾值, 0);
  assert.equal(boss.法力免疫, null);
});

test('双方反弹同时致死先结算各自剩余复活，三次用完后均保持零血', () => {
  const { applyRaidSuiyunDamage } = loadRaid();
  const a = owner({ 当前血量: 5 });
  const b = owner({ 当前血量: 10 });
  const messages = [];
  applyRaidSuiyunDamage(b, a, 100, messages);
  assert.equal(a._suiyunRevives, 1);
  assert.equal(b._suiyunRevives, 1);
  assert.equal(a.当前血量, 1500);
  assert.equal(b.当前血量, 1500);
  a._suiyunRevives = b._suiyunRevives = 3;
  a.当前血量 = 5;
  b.当前血量 = 10;
  applyRaidSuiyunDamage(b, a, 100, messages);
  assert.equal(a.当前血量, 0);
  assert.equal(b.当前血量, 0);
  assert.equal(messages.filter(line => line.includes('白云苍狗')).length, 2);
});

test('每个岁云阶段霜剑不受防御衰减，第八剑跌破15%立即斩杀收尾', async () => {
  for (let stage = 1; stage <= 5; stage++) {
    const player = owner({ 灵根: createSuiyunRoot(stage), 速度: 10000 });
    const boss = enemy({ 当前血量: 22500, 血量上限: 22500, 防御: 1e30, 速度: 1, 免疫控制: 999 });
    const before = structuredClone(player);
    const run = await runBattle(player, boss);
    assert.equal(run.result.result, '玩家胜利');
    assert.equal(run.result.boss_hp_change, -22500);
    assert.ok(run.logs.some(line => line.includes('霜剑击中试炼首领8次') && line.includes('20000')));
    assert.ok(run.logs.some(line => line.includes('低于15%') && line.includes('封禁复活')));
    assert.deepEqual(player, before, '战斗副本不改原始玩家属性或复活次数');
  }
});

test('霜寒每全局轮次生效，行动控制跳过免控且压低真实行动条速度', async () => {
  const run = await runBattle(owner({ 速度: 5000, 攻击: 1 }), enemy({ 速度: 10000, 防御: 1e20 }), { bossDamage: 1 });
  assert.ok(run.logs.some(line => line.includes('霜寒') && line.includes('20%')));
  assert.ok(run.logs.some(line => line.includes('绝对控制') && line.includes('中断')));
  assert.ok(run.logs.some(line => line.includes('行动条降低2500')));
});

test('通用BOSS攻击复活恰好三次、每次1.5倍、第四次死亡结束而非空血超时', async () => {
  const run = await runBattle(owner({ 当前血量: 100, 血量上限: 100, 速度: 1 }), enemy({ 速度: 10000, 当前血量: 1e20, 血量上限: 1e20 }), { bossDamage: 1e10 });
  assert.equal(run.result.result, 'BOSS胜利');
  assert.equal(run.observed.players[0]._suiyunRevives, 3);
  assert.equal(run.observed.players[0].当前血量, 0);
  assert.equal(run.observed.players[0].攻击, 100 * 1.5 ** 3);
  assert.equal(run.observed.players[0].血量上限, 100 * 1.5 ** 3);
  assert.equal(run.actions.length, 4);
  assert.equal(run.logs.filter(line => line.includes('白云苍狗')).length, 3);
  assert.ok(!run.logs.some(line => line.includes('超过100回合')));
});

test('尸骸大罗剑胎群攻与九幽冥渊斩均先结算三次复活再判全灭', async () => {
  for (const name of ['尸骸仙帝', '九幽魔君']) {
    const run = await runBattle(owner({ 当前血量: 100, 血量上限: 100, 速度: 1, mijinglevel_id: 21 }), enemy({ 名号: name, 攻击: 1e10, 速度: 10000, 当前血量: 1e25, 血量上限: 1e25 }), { random: .99 });
    assert.equal(run.result.result, 'BOSS胜利', name);
    assert.equal(run.observed.players[0]._suiyunRevives, 3, name);
    assert.equal(run.observed.players[0].当前血量, 0, name);
    assert.equal(run.logs.filter(line => line.includes('白云苍狗')).length, 3, name);
    assert.ok(run.logs.some(line => line.includes('岁云归一')), name);
  }
});

test('九幽群攻和灼烧路径接入防反，持续伤害不越过复活处理', async () => {
  const run = await runBattle(owner({ 当前血量: 100, 血量上限: 100, 速度: 1, mijinglevel_id: 21 }), enemy({ 名号: '九幽魔君', 攻击: 1e10, 速度: 10000, 当前血量: 1e25, 血量上限: 1e25 }), { random: .1 });
  assert.equal(run.observed.players[0]._suiyunRevives, 3);
  assert.equal(run.observed.players[0].当前血量, 0);
  assert.ok(run.logs.some(line => line.includes('九幽冥狱火')));
  assert.ok(run.logs.some(line => line.includes('身负九幽冥火灼烧')));
  assert.ok(run.logs.some(line => line.includes('岁云归一')));
});

test('道种持续伤害在行动前立即复活，既有已复活标志不吞掉白云次数', async () => {
  const { tuanben, applyRaidSuiyunDamage } = loadRaid();
  const app = Object.create(tuanben.prototype);
  const player = owner({ 当前血量: 0, 已复活: true });
  assert.equal((await app.checkPlayerRevival(player)).success, true);
  assert.equal(player._suiyunRevives, 1);
  const logs = [];
  applyRaidSuiyunDamage(player, enemy(), 1e10, logs);
  assert.equal(player._suiyunRevives, 2);
  applyRaidSuiyunDamage(player, enemy(), 1e10, logs);
  assert.equal(player._suiyunRevives, 3);
  applyRaidSuiyunDamage(player, enemy(), 1e10, logs);
  await app.checkPlayerStatus([player], (...lines) => logs.push(...lines));
  assert.equal(player.已死亡, true);
});

test('真实团本行动前道种DoT连续四次致命消耗三次复活后阵亡', async () => {
  const run = await runBattle(owner({ 速度: 10000, 攻击: 0, _fumianhuihe: 4, _fumian_damage: 1e10 }), enemy({ 速度: 1, 当前血量: 1e30, 血量上限: 1e30 }));
  assert.equal(run.result.result, 'BOSS胜利');
  assert.equal(run.observed.players[0]._suiyunRevives, 3);
  assert.equal(run.observed.players[0].当前血量, 0);
  assert.ok(run.logs.some(line => line.includes('道种余威击溃')));
  assert.equal(run.logs.filter(line => line.includes('白云苍狗')).length, 3);
});

test('帝尊法旨群攻直接致死前先白云复活，后续普通攻击仍有剩余两次', async () => {
  const run = await runBattle(owner({ 当前血量: 100, 血量上限: 100, 速度: 1 }), enemy({ 名号: '帝尊', 攻击: 1e10, 速度: 10000, 当前血量: 1e25, 血量上限: 1e25 }), { bossDamage: 1e12 });
  assert.equal(run.result.result, 'BOSS胜利');
  assert.equal(run.observed.players[0]._suiyunRevives, 3);
  assert.ok(run.logs.some(line => line.includes('九秘合一·天帝法旨')));
  assert.equal(run.logs.filter(line => line.includes('白云苍狗')).length, 3);
});

test('团本岁云敌方同样施放九剑，次数耗尽后收尾不再回生', async () => {
  const run = await runBattle(owner({ 当前血量: 100, 血量上限: 100, 速度: 1 }), enemy({ 灵根: createSuiyunRoot(2), 攻击: 100, 速度: 10000, 当前血量: 1e20, 血量上限: 1e20 }));
  assert.equal(run.result.result, 'BOSS胜利');
  assert.equal(run.observed.players[0]._suiyunRevives, 3);
  assert.equal(run.observed.players[0].当前血量, 0);
  assert.ok(run.logs.some(line => line.includes('霜剑击中月华剑修4次')));
});

test('普通玩家攻击及分身协同对岁云BOSS同样结算减反和三次复活', async () => {
  for (const companion of [false, true]) {
    const player = owner({ 灵根: { name: '普通' }, 速度: 10000, 血量上限: 1e9, 当前血量: 1e9,
      分身: companion ? [{ 名号: '协同道身', 攻击: 10000, 当前血量: 100000 }] : [] });
    const run = await runBattle(player, enemy({ 灵根: createSuiyunRoot(1), 速度: 1, 血量上限: 100, 当前血量: 100 }), { playerDamage: companion ? 0 : 10000 });
    assert.equal(run.result.result, '玩家胜利');
    assert.equal(run.logs.filter(line => line.includes('白云苍狗')).length, 3);
    assert.ok(run.logs.some(line => line.includes('岁云归一')));
    if (companion) assert.ok(run.logs.some(line => line.includes('协同伤害')));
  }
});

test('高境界天堑先于岁云技能和复活，低境传承没有回击或复生', async () => {
  const run = await runBattle(owner({ mijinglevel_id: 20 }), enemy({ mijinglevel_id: 21 }));
  assert.equal(run.result.result, 'BOSS胜利');
  assert.equal(run.result.players_hp_change[0], -1000);
  assert.ok(run.logs.some(line => line.includes('境界天堑')));
  assert.ok(!run.logs.some(line => /霜剑入月|白云苍狗|岁云归一/.test(line)));
});

test('真实团本模块可以完整装载，无缺失共享技能导出', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    const { tuanben } = await import('./plugins/zhutianxiuxian1.0/apps/Battle/tuanben.js');
    if (typeof tuanben.prototype.tb_battle !== 'function') process.exit(2);
    process.exit(0);
  `], { cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('非岁云月华受赐者在独立团本同样施放九剑、防反并复生三次', async () => {
  const gift = {
    id: 'gift-raid', 灵根: { name: '普通灵根', type: '普通' },
    月华传承: { 授予者: 'owner', 受赐者: 'gift-raid', 名额: 1, 传授时间: 1000, 技能: [...SUIYUN_EXCLUSIVE_SKILLS] },
  };
  const attack = await runBattle(owner({ ...gift, 速度: 10000 }), enemy({ 速度: 1, 防御: 1e15 }));
  assert.ok(attack.logs.some(line => /霜剑击中试炼首领9次，实际伤害合计22500/.test(line)));
  const revival = await runBattle(owner({ ...gift, 当前血量: 100, 血量上限: 100, 速度: 1 }),
    enemy({ 当前血量: 1e15, 血量上限: 1e15, 攻击: 1e10, 速度: 10000 }), { bossDamage: 1e12 });
  assert.equal(revival.logs.filter(line => line.includes('【白云苍狗】')).length, 3);
  assert.ok(revival.logs.some(line => line.includes('【岁云归一】')));
  assert.equal(revival.result.result, 'BOSS胜利');
  assert.equal(revival.result.players_hp_change[0], -100);
});

test('独立团本真实入口消费记忆因子成长、下一击取消与两种一次保命', async () => {
  const memory = { 灵根: createMemoryRoot(2), 记忆命途: { 因子: { 负世: 3, 纷争: 3, 诡计: 3, 死亡: 3 } } };
  const attacker = owner({ ...memory, 速度: 5000, 当前血量: 100000, 血量上限: 100000 });
  const battle = await runBattle(attacker, enemy({ 速度: 4999, 当前血量: 1000000, 血量上限: 1000000 }), { playerDamage: 100, bossDamage: 1 });
  assert.ok(battle.logs.some(line => line.includes('【负世】')));
  assert.ok(battle.logs.some(line => line.includes('【纷争】')));
  assert.ok(battle.logs.some(line => line.includes('本次攻击取消')));
  assert.equal(attacker.攻击, 100);
  assert.equal(attacker.血量上限, 100000);
  const fragile = await runBattle(owner({ ...memory, 速度: 1, 当前血量: 100, 血量上限: 100 }),
    enemy({ 速度: 10000, 攻击: 1e10, 当前血量: 1e15, 血量上限: 1e15 }), { bossDamage: 1e12 });
  assert.equal(fragile.logs.filter(line => line.includes('【死亡·拒绝终结】')).length, 1);
  assert.equal(fragile.logs.filter(line => line.includes('【纷争·再起】')).length, 1);
  assert.equal(fragile.result.result, 'BOSS胜利');
  assert.equal(fragile.result.players_hp_change[0], -100);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as authority from '../model/suiyunAuthority.js';
import * as combat from '../model/suiyunCombat.js';
import * as innate from '../model/innateTreasure.js';
import { createSuiyunRoot, activateSuiyun, advanceSuiyun, ensureSuiyunState, getSuiyunStage, getSuiyunEffects } from '../model/suiyun.js';
import { getMemoryEffects } from '../model/memoryPath.js';
import { reduceTribulationDamageByDefense } from '../model/tribulationDamage.js';
import { calculateEquippedStats, isFixedStatEquipment } from '../model/equipmentStats.js';
import { getLifeSourceRepairMaximum } from '../model/lifeSourceRepair.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { calculateWudaoResult } from '../apps/User/wudaoRules.js';
import { compareWorldlineAuthority, resolveAncientHistoryStrike, destroyWorldline } from '../model/worldlineAuthority.js';
import { getShengxuExploreDuration } from '../model/shengxuContent.js';
import { calculateRiftExploreDuration } from '../model/lingjieRift.js';
import { calculateShangcangDuration } from '../model/shangcangDungeon.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = structuredClone;
const owner = () => ({
  id: 'owner', 名号: '天阙器主', 当前大道至宝: authority.SUIYUN_BRANCH,
  灵根: createSuiyunRoot(5), 生命本源: 15000, 仙道潜力: 100,
  攻击: 100, 防御: 100, 速度: 100, 当前血量: 500, 血量上限: 1000,
  学习的功法: [], mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1,
  天阙权柄: { 解封: Object.fromEntries(authority.SUIYUN_AUTHORITY_SEALS.map(seal => [seal.name, { at: 0 }])) },
});
function fixture() {
  const state = {
    players: { owner: owner(), target: { id: 'target', 名号: '受赠者', 灵根: { name: '凡体', 生命本源: 100 }, 生命本源: 1, 仙道潜力: 125, 道伤: 4 } },
    bags: { owner: { 材料: [{ name: '界核', 数量: 500 }, { name: '宇宙核心', 数量: 500 }], 功法: [{ name: '测试宝术', 数量: 1 }], 装备: [] } },
    failGrant: false, failWrite: false,
  };
  const dependencies = {
    ...authority, ...innate, path, randomUUID, withPlayerMutationLock, getLifeSourceRepairMaximum,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async id => String(id), existplayer: async id => Boolean(state.players[id]),
    Read_player: async id => clone(state.players[id]),
    Write_player: async (id, value) => {
      if (state.failWrite) { state.failWrite = false; throw Error('write-failed'); }
      state.players[id] = clone(value);
    },
    Read_najie: async id => clone(state.bags[id]),
    Write_najie: async (id, value) => {
      if (state.rejectBag) return false;
      if (state.failBag) { state.failBag = false; throw Error('bag-write-failed'); }
      state.bags[id] = clone(value);
    },
    Add_najie_thing: async (id, item) => {
      if (state.failGrant) { state.failGrant = false; throw Error('grant-failed'); }
      state.bags[id].装备.push(clone(item));
    },
    player_efficiency: async () => {
      state.attributeRefreshes = (state.attributeRefreshes || 0) + 1;
      if (state.failRefresh) throw Error('refresh-failed');
    },
    __PATH: { player_path: '/fixture/players', najie_path: '/fixture/bags' },
    data: { gongfa_list: [{ name: '测试宝术', class: '功法' }] },
    FileRollbackTransaction: class {
      constructor() { this.players = clone(state.players); this.bags = clone(state.bags); }
      capture() {} commit() {}
      rollback() { state.players = this.players; state.bags = this.bags; }
    },
  };
  const source = read('apps/User/SuiyunAuthority.js').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(dependencies), `${source}; return SuiyunAuthority;`)(...Object.values(dependencies));
  const e = (msg, target = '') => ({ user_id: 'owner', msg, message: target ? [{ type: 'at', qq: target }] : [], reply: async message => message });
  return { state, app: new App(), e, dependencies };
}

test('天阙权柄仅由真实至宝持有者激活，召唤物和月华受赐者不继承', () => {
  assert.equal(authority.hasSuiyunBranch(owner()), true);
  for (const extra of [{ 当前大道至宝: '' }, { 分身: true }, { _tahua_type: 'self' }, { _圆神分身: true }]) {
    assert.equal(authority.hasSuiyunBranch({ ...owner(), ...extra }), false);
  }
  assert.equal(authority.getSuiyunEffectiveDefense(owner(), { 防御: 400 }), 200);
  assert.equal(authority.getSuiyunEffectiveDefense({}, { 防御: 400 }), 400);
  for (const base of [1, 2, 7, 24, 30]) {
    assert.equal(base + innate.getHabitatSlotBonus(owner(), base), Math.max(base, 24));
  }
  assert.equal(innate.getHabitatSlotBonus({}), 0);
});

test('旧晋阶试炼不再影响境界晋升，也不折算成至宝解封', () => {
  const p = {};
  activateSuiyun(p);
  Object.assign(p.岁云, { 引月入体: 12, 化霜入剑: 12, 月之见证: 9 });
  assert.equal(ensureSuiyunState(p).梦幻试炼, undefined);
  assert.equal(authority.getSuiyunUnsealedCount(p), 0);
  p.mijinglevel_id = 10;
  assert.equal(advanceSuiyun(p).ok, true);
});

test('理想悟道收益增加20个百分点，折后费用向上取整前按0.8计', () => {
  const base = { player: {}, rule: { baseGain: 100, lifespanCost: 10 }, random: () => .5 };
  const normal = calculateWudaoResult(base);
  const actual = calculateWudaoResult({ ...base, player: owner() });
  assert.equal(actual.gain - normal.gain, 20);
  assert.ok(Math.abs(authority.getSuiyunWudaoCost(owner(), 101) - 80.8) < 1e-10);
  assert.equal(authority.getSuiyunWudaoCost({}, 101), 101);
});

test('天空单次探索减少60秒，普通和圣墟及裂缝时长不会负数', () => {
  const p = owner(), plain = { ...p, 当前大道至宝: '' };
  assert.equal(authority.getSuiyunExplorationDuration(p, 30000), 1000);
  assert.equal(innate.getDungeonTimedActionMultiplier(p, 300000), .8);
  assert.equal(getShengxuExploreDuration(plain, { duration: 15 }) - getShengxuExploreDuration(p, { duration: 15 }), 1);
  assert.equal(calculateRiftExploreDuration(plain).durationMs - calculateRiftExploreDuration(p).durationMs, 60000);
  assert.equal(calculateShangcangDuration(plain).durationMs - calculateShangcangDuration(p).durationMs, 60000);
});

test('天空沉迷按轮数每轮减10分钟、法身单次入口只减60秒，文案给实际值', async () => {
  const source = read('apps/SecretPlace/SecretPlaceplus.js');
  const start = source.indexOf('async function calculateTimeReductionForAddiction(');
  const body = source.slice(start).replace(/\r\n/g, '\n');
  const deps = {
    hasSuiyunAuthority: authority.hasSuiyunAuthority, data: { minggeList: [] },
    getMinggeEffects: () => ({}), getMinggeSecretPlaceReductionMs: () => 0, isDaofaActive: () => false,
  };
  const fn = new Function(...Object.keys(deps), `${body};return calculateTimeReductionForAddiction;`)(...Object.values(deps));
  for (const [count, expected] of [[.1, 1], [1, 10], [3, 30]]) {
    const result = await fn(owner(), count);
    assert.equal(result.timeReduction, expected);
    assert.ok(result.msgs.some(msg => msg.includes(`共减少${expected}分钟`)), `文案应给实际值：${expected}`);
    assert.ok(!result.msgs.some(msg => msg.includes('60秒')), '沉迷口径不是秒');
  }
});

test('海洋每回合回血一次、减伤20%，天空速度按基准线性成长、第二回合真实扣血', () => {
  const p = owner(), enemy = { 当前血量: 10000, 血量上限: 10000, 防御: 0 };
  p.灵根 = { name: '凡体' }; // 排除岁云归一，直接验证至宝自身20%减伤。
  assert.equal(combat.reduceSuiyunDamage(p, 100), 80);
  combat.resetSuiyunCombat(p);
  const deal = (_source, target, damage) => { target.当前血量 -= damage; };
  combat.tickSuiyunAuthorityRound(p, [enemy], 1, deal);
  assert.equal(p.当前血量, 700);
  assert.ok(Math.abs(p.速度 - 110) < 1e-8);
  combat.tickSuiyunAuthorityRound(p, [enemy], 1, deal);
  assert.equal(p.当前血量, 700);
  combat.tickSuiyunAuthorityRound(p, [enemy], 2, deal);
  assert.equal(p.当前血量, 900);
  assert.ok(Math.abs(p.速度 - 120) < 1e-8);
  assert.equal(enemy.当前血量, 9700);
});

test('预备断崖和降世在开战时持锁消费一次，首击3倍、降世三回合后撤销临时增幅', async () => {
  const f = fixture();
  await f.app.prepare(f.e('#断崖之剑'));
  await f.app.prepare(f.e('#岁云降世'));
  const unit = clone(f.state.players.owner);
  const io = { read: f.dependencies.Read_player, write: f.dependencies.Write_player, lock: withPlayerMutationLock };
  await authority.claimSuiyunBattleAuthority([unit], io);
  combat.resetSuiyunCombat(unit);
  assert.equal(combat.amplifySuiyunFirstAttack(unit, 10), 30);
  assert.equal(combat.amplifySuiyunFirstAttack(unit, 10), 10);
  const enemy = { 当前血量: 1e8, 血量上限: 1e8 };
  let hits = 0;
  for (let round = 1; round <= 4; round++) combat.tickSuiyunAuthorityRound(unit, [enemy], round, () => { hits++; });
  assert.equal(hits, 3);
  assert.equal(unit.攻击, 100);
  assert.equal(f.state.players.owner.攻击, 100);
  const second = clone(f.state.players.owner);
  await authority.claimSuiyunBattleAuthority([second], io);
  assert.equal(second._天阙降世, undefined);
  assert.equal(second._天阙断崖, undefined);
});

test('根源波动准确修复与增加已有潜力20%，并发只成功一次；落盘失败回滚', async () => {
  const f = fixture();
  await Promise.all([f.app.originPulse(f.e('#根源波动', 'target')), f.app.originPulse(f.e('#根源波动', 'target'))]);
  assert.equal(f.state.players.target.仙道潜力, 150);
  assert.equal(f.state.players.target.道伤, 0);
  assert.equal(f.state.players.target.生命本源, getLifeSourceRepairMaximum(f.state.players.target));
  assert.ok(authority.suiyunAuthorityRemaining(f.state.players.owner, '海洋') > 47 * 3600000);
  const rollback = fixture();
  const before = clone(rollback.state.players);
  rollback.state.failWrite = true;
  await assert.rejects(rollback.app.originPulse(rollback.e('#根源波动', 'target')), /write-failed/);
  assert.deepEqual(rollback.state.players, before);
});

test('七夜祈愿本源真实扣500，不叠加，目标下次渡劫全程减半且之后失效', async () => {
  const f = fixture();
  await f.app.wish(f.e('#祈愿渡劫', 'target'));
  await f.app.wish(f.e('#祈愿渡劫', 'target'));
  assert.equal(f.state.players.owner.生命本源, 14500);
  const p = f.state.players.target;
  authority.beginSuiyunTribulation(p);
  assert.equal(p.基拉祈祈愿.remaining, 0);
  assert.equal(authority.getSuiyunTribulationMultiplier(p), .5);
  delete p._基拉祈渡劫;
  authority.beginSuiyunTribulation(p);
  assert.equal(authority.getSuiyunTribulationMultiplier(p), 1);
});

test('人体秘境实际雷劫减伤函数消费七夜祈愿，每道减半并与原规则乘算', () => {
  const source = read('apps/User/zhetiandujie.js');
  const start = source.indexOf('applyGongfaEffects(player, originalDamage, equipment = {}) {');
  const end = source.indexOf('  // ==== 辅助方法 ====', start);
  const dependencies = {
    getSuiyunEffects, getMemoryEffects, reduceTribulationDamageByDefense,
    getDaoHeartDamageMultiplier: () => 1, consumeBlackEmperorTribulationFormation: () => ({}),
    hasEquippedInnateTreasure: innate.hasEquippedInnateTreasure, bigNumberTransform: String,
  };
  const app = new Function(...Object.keys(dependencies), `return ({${source.slice(start, end)}});`)(...Object.values(dependencies));
  app.getEraDifficultyFactor = () => 1;
  app.isEffectActive = () => false;
  const ordinary = { 灵根: { name: '凡体' }, 防御: 0, 当前血量: 1000, 血量上限: 1000 };
  const plain = app.applyGongfaEffects(ordinary, 100).damage;
  const protectedPlayer = { ...ordinary, _基拉祈渡劫: true };
  assert.equal(app.applyGongfaEffects(protectedPlayer, 100).damage, plain * .5);
  assert.equal(app.applyGongfaEffects(protectedPlayer, 100).damage, plain * .5);
  delete protectedPlayer._基拉祈渡劫;
  assert.equal(app.applyGongfaEffects(protectedPlayer, 100).damage, plain);
});

test('三种创世配方准确扣材，每项+50000%参与百分比结算，发放失败材料回滚', async () => {
  const f = fixture();
  for (const kind of ['防具', '装备', '法宝']) await f.app.genesis(f.e(`#创世 ${kind} 天阙${kind}`));
  assert.equal(f.state.bags.owner.材料[0].数量, 200);
  assert.equal(f.state.bags.owner.材料[1].数量, 200);
  for (const item of f.state.bags.owner.装备) {
    assert.equal(isFixedStatEquipment(item), false);
    assert.deepEqual(calculateEquippedStats({ 攻击: 100, 防御: 100, 血量上限: 100 }, [item]), { 攻击: 50100, 防御: 50100, 血量上限: 50100 });
  }
  const rollback = fixture();
  rollback.state.failGrant = true;
  await assert.rejects(rollback.app.genesis(rollback.e('#创世 防具 测试甲')), /grant-failed/);
  assert.equal(rollback.state.bags.owner.材料[0].数量, 500);
  assert.equal(rollback.state.bags.owner.装备.length, 0);
});

test('无极不持秘籍也能领悟，库存、潜力与功法冷却不扣，重复并发只学一次', async () => {
  const f = fixture();
  f.state.bags.owner.功法 = [];
  f.state.bags.owner.时间线封锁 = { locked: true };
  const beforeBag = clone(f.state.bags.owner), before = clone(f.state.players.owner);
  await Promise.all([f.app.learn(f.e('#无极悟技 测试宝术')), f.app.learn(f.e('#无极悟技 测试宝术'))]);
  assert.deepEqual(f.state.players.owner.学习的功法, ['测试宝术']);
  assert.equal(f.state.attributeRefreshes, 1);
  assert.deepEqual(f.state.bags.owner, beforeBag);
  assert.deepEqual(f.state.players.owner, { ...before, 学习的功法: ['测试宝术'] });
  const withScroll = fixture();
  await withScroll.app.learn(withScroll.e('#无极悟技 测试宝术'));
  assert.equal(withScroll.state.bags.owner.功法[0].数量, 1);
});

test('无极校验现有功法与解封状态，保存或属性刷新失败回滚学习且可重试', async () => {
  const f = fixture();
  const before = clone(f.state.players);
  assert.match(await f.app.learn(f.e('#无极悟技 不存在功法')), /现有功法/);
  assert.deepEqual(f.state.players, before);
  assert.equal(f.state.attributeRefreshes, undefined);
  for (const failure of ['failWrite', 'failRefresh']) {
    f.state[failure] = true;
    await assert.rejects(f.app.learn(f.e('#无极悟技 测试宝术')), /failed/);
    assert.deepEqual(f.state.players, before);
    assert.equal(f.state.bags.owner.功法[0].数量, 1);
    f.state[failure] = false;
  }
  await f.app.learn(f.e('#无极悟技 测试宝术'));
  assert.deepEqual(f.state.players.owner.学习的功法, ['测试宝术']);
});

test('海洋减伤与回血为解封即用被动，不需根源波动且其48小时冷却不影响被动', async () => {
  const f = fixture(), base = f.state.players.owner;
  base.天阙权柄 = { 解封: { 海洋: { at: 0 } } };
  const unprepared = clone(base);
  assert.equal(combat.reduceSuiyunDamage(unprepared, 100), 40);
  combat.tickSuiyunAuthorityRound(unprepared, [], 1);
  assert.equal(unprepared.当前血量, 700);
  assert.equal(authority.suiyunAuthorityRemaining(unprepared, '海洋'), 0);
  await f.app.originPulse(f.e('#根源波动', 'target'));
  const onCooldown = clone(f.state.players.owner);
  assert.ok(authority.suiyunAuthorityRemaining(onCooldown, '海洋') > 0);
  const cooldowns = clone(onCooldown.天阙权柄.冷却);
  assert.equal(combat.reduceSuiyunDamage(onCooldown, 100), 40);
  combat.tickSuiyunAuthorityRound(onCooldown, [], 1);
  assert.equal(onCooldown.当前血量, 700);
  combat.tickSuiyunAuthorityRound(onCooldown, [], 1);
  assert.equal(onCooldown.当前血量, 700);
  combat.tickSuiyunAuthorityRound(onCooldown, [], 2);
  assert.equal(onCooldown.当前血量, 900);
  combat.tickSuiyunAuthorityRound(onCooldown, [], 3);
  assert.equal(onCooldown.当前血量, 1000);
  assert.deepEqual(onCooldown.天阙权柄.冷却, cooldowns);
  const sealed = { ...clone(base), 天阙权柄: {} };
  assert.equal(combat.reduceSuiyunDamage(sealed, 100), 50);
  combat.tickSuiyunAuthorityRound(sealed, [], 1);
  assert.equal(sealed.当前血量, 500);
});

test('梦幻借用真实原指令权柄只消费一次，24小时冷却，未获得源至宝永久归属', async () => {
  const f = fixture();
  assert.match(await f.app.dream(f.e('#梦幻 盘古幡 开天')), /#开天/);
  const p = f.state.players.owner;
  assert.equal(innate.hasEquippedInnateTreasure(p, '盘古幡', '开天'), true);
  assert.equal(innate.hasEquippedInnateTreasure(p, '盘古幡', '被动:1'), false);
  innate.startAuthorityCooldown(p, '开天');
  assert.equal(p.岁云梦幻.used, true);
  assert.equal(authority.consumeSuiyunDream(p, '盘古幡', '开天'), false);
  assert.ok(authority.suiyunAuthorityRemaining(p, '梦幻') > 23 * 3600000);
  assert.equal(p.当前大道至宝, authority.SUIYUN_BRANCH);
  assert.equal(p.当前先天至宝, undefined);
});

test('梦幻被动只带入一场战斗，后续战斗不再次获得源至宝被动', async () => {
  const f = fixture();
  await f.app.dream(f.e('#梦幻 盘古幡 被动1'));
  const first = clone(f.state.players.owner);
  const io = { read: f.dependencies.Read_player, write: f.dependencies.Write_player, lock: withPlayerMutationLock };
  await authority.claimSuiyunBattleAuthority([first], io);
  assert.equal(innate.hasEquippedInnateTreasure(first, '盘古幡', '被动:1'), true);
  const second = clone(f.state.players.owner);
  await authority.claimSuiyunBattleAuthority([second], io);
  assert.equal(innate.hasEquippedInnateTreasure(second, '盘古幡', '被动:1'), false);
});

test('梦幻借用大道权柄走实际原命令接口，保存最新角色，源至宝归属和文明本源不变', async () => {
  const f = fixture();
  await f.app.dream(f.e('#梦幻 大道至宝 万法'));
  const globalState = { treasure: { name: '真实大道炉', ownerId: 'other', origin: 12 } };
  const before = clone(globalState);
  const deps = {
    ...f.dependencies, getSuiyunDream: authority.getSuiyunDream, consumeSuiyunDream: authority.consumeSuiyunDream,
    readDaoTreasureState: () => globalState, isDaoTreasureOwner: () => false,
    spendDaoTreasureOrigin: async () => ({ ok: false, reason: 'not-owner' }),
  };
  const source = read('apps/duanzao/DaoTreasure.js').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?[ \t]*\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(deps), `${source}; return DaoTreasure;`)(...Object.values(deps));
  const app = new App();
  assert.equal((await app.requireOwner(f.e('#推演终极功法 测试'), '万法')).dream, true);
  const result = await app.spendOrigin({ ownerId: 'owner', cost: 8, mutate: async () => {
    const current = await deps.Read_player('owner');
    current.学习的功法.push('梦幻终极法');
    await deps.Write_player('owner', current);
  } });
  assert.equal(result.ok, true);
  assert.deepEqual(globalState, before);
  assert.equal(f.state.players.owner.岁云梦幻.used, true);
  assert.deepEqual(f.state.players.owner.学习的功法, ['梦幻终极法']);
  assert.equal((await app.spendOrigin({ ownerId: 'owner' })).ok, false);
});

test('诸天一念五阶段都转入实际赠送接口，保留@与物品数量；普通灵根不获得通道', async () => {
  const source = read('apps/User/MoneyOperation.js');
  const start = source.indexOf('async suiyunGive('), end = source.indexOf('async Give(', start);
  let p = owner();
  const deps = { channel: async id => id, existplayer: async () => true, Read_player: async () => p, getSuiyunStage };
  const give = new Function(...Object.keys(deps), `return ({${source.slice(start, end)}}).suiyunGive;`)(...Object.values(deps));
  for (let stage = 1; stage <= 5; stage++) {
    p = { 灵根: createSuiyunRoot(stage), power_place: 99999 };
    const e = { user_id: 'owner', msg: '#诸天一念 材料*20', message: [{ type: 'text', text: '#诸天一念 材料*20' }, { type: 'at', qq: 'target' }], reply: async text => text };
    const result = await give.call({ Give: async next => ({ msg: next.msg, at: next.message[1].qq }) }, e);
    assert.deepEqual(result, { msg: '#赠送材料*20', at: 'target' });
  }
  p = { 灵根: { name: '凡体' } };
  assert.match(await give.call({}, { user_id: 'owner', reply: async text => text }), /岁云系列/);
});

test('无上在共享古史逻辑拦截高境打击与毁线，原存档不变；霜华损失减半', () => {
  const p = owner(), before = clone(p);
  const attacker = { mijinglevel_id: 30 };
  assert.equal(compareWorldlineAuthority(attacker, p).ok, false);
  assert.equal(resolveAncientHistoryStrike(attacker, p, { type: '功法', name: '测试' }).ok, false);
  assert.equal(destroyWorldline(p, 'line').presentEffect, 'protected');
  assert.deepEqual(p, before);
  const after = { ...p, 修为: 60, 血气: 80, 生命本源: 100, 道伤: 2 };
  authority.protectSuiyunTribulationLoss(after, { ...p, 修为: 100, 血气: 100, 生命本源: 200, 道伤: 0 });
  assert.equal(after.修为, 80);
  assert.equal(after.血气, 90);
  assert.equal(after.生命本源, 150);
  assert.equal(after.道伤, 1);
});

function sealedFixture() {
  const f = fixture();
  f.state.players.owner.天阙权柄 = {};
  for (const seal of authority.SUIYUN_AUTHORITY_SEALS.filter(seal => seal.item)) {
    f.state.bags.owner[seal.itemClass] ||= [];
    f.state.bags.owner[seal.itemClass].push({ name: seal.item, 数量: seal.amount + 1 });
  }
  return f;
}

test('九条解封命令精确注册，全部可独立完成，上交数量与600本源一致', async () => {
  const f = sealedFixture();
  const oldBag = clone(f.state.bags.owner);
  const initialLife = f.state.players.owner.生命本源;
  for (const [index, seal] of [...authority.SUIYUN_AUTHORITY_SEALS].reverse().entries()) {
    assert.ok(f.app.rule.some(rule => rule.fnc === 'unseal' && new RegExp(rule.reg).test(seal.command)));
    const reply = await f.app.unseal(f.e(seal.command));
    const p = f.state.players.owner;
    assert.equal(authority.getSuiyunUnsealedCount(p), index + 1);
    assert.equal(authority.hasSuiyunAuthority(p, seal.name), true);
    assert.match(reply, /权柄已开放/);
    assert.equal(authority.hasSuiyunAuthority(p, '无上'), index === 8);
    assert.equal(authority.hasSuiyunAuthority(p, '月宫'), index === 8);
    assert.equal(authority.hasSuiyunAuthority(p, '霜华'), index === 8);
    assert.equal(authority.hasSuiyunAuthority(p, '岁云降世'), index === 8);
  }
  assert.equal(f.state.players.owner.生命本源, initialLife - 600);
  for (const seal of authority.SUIYUN_AUTHORITY_SEALS.filter(seal => seal.item)) {
    const amount = bag => bag[seal.itemClass].filter(item => item.name === seal.item).reduce((sum, item) => sum + item.数量, 0);
    assert.equal(amount(oldBag) - amount(f.state.bags.owner), seal.amount);
  }
  assert.match(await f.app.panel(f.e('#天阙权柄')), /9\/9｜已完全解封/);
  const before = clone({ players: f.state.players, bags: f.state.bags });
  for (const seal of authority.SUIYUN_AUTHORITY_SEALS) await f.app.unseal(f.e(seal.command));
  assert.deepEqual({ players: f.state.players, bags: f.state.bags }, before);
});

test('封印默认覆盖全部主动被动和旧待用状态，旧试炼记录与已学雷帝不抵扣供物', async () => {
  const f = sealedFixture(), p = f.state.players.owner;
  p.岁云 = { 引月入体: 12, 梦幻试炼: 1, 化霜入剑: 12, 月之见证: 9 };
  p.学习的功法 = ['雷帝宝术'];
  p.岁云梦幻 = { treasureName: '盘古幡', key: '开天', expiresAt: Date.now() + 60000 };
  p.天阙权柄.断崖之剑待用 = true;
  p.天阙权柄.岁云降世待用 = true;
  for (const [name] of authority.SUIYUN_BRANCH_AUTHORITIES) assert.equal(authority.hasSuiyunAuthority(p, name), false, name);
  assert.equal(authority.getSuiyunEffectiveDefense(p, { 防御: 100 }), 100);
  assert.equal(innate.getHabitatSlotBonus(p, 7), 0);
  assert.equal(authority.getSuiyunWudaoCost(p, 100), 100);
  assert.equal(authority.getSuiyunExplorationDuration(p, 120000), 120000);
  assert.equal(innate.hasEquippedInnateTreasure(p, '盘古幡', '开天'), false);
  await authority.claimSuiyunBattleAuthority([p], {
    read: f.dependencies.Read_player, write: f.dependencies.Write_player, lock: withPlayerMutationLock,
  });
  assert.equal(p._天阙断崖, undefined);
  assert.equal(p._天阙降世, undefined);
  const before = clone({ players: f.state.players, bags: f.state.bags });
  for (const [method, message] of [
    ['prepare', '#断崖之剑'], ['prepare', '#岁云降世'], ['originPulse', '#根源波动'],
    ['wish', '#祈愿渡劫'], ['learn', '#无极悟技 测试宝术'], ['genesis', '#创世 防具 测试'],
    ['dream', '#梦幻 盘古幡 开天'],
  ]) assert.match(await f.app[method](f.e(message)), /尚未解封/);
  assert.deepEqual({ players: f.state.players, bags: f.state.bags }, before);
  f.state.bags.owner.功法 = [];
  assert.match(await f.app.unseal(f.e('#理想勇者试炼')), /纳戒现有0/);
  assert.equal(authority.hasSuiyunAuthority(p, '理想'), false);
});

test('如梦供物可跨同类堆栈精确扣20，重复并发解封不多扣、使用冷却互相独立', async () => {
  const f = sealedFixture();
  f.state.bags.owner.丹药 = [{ name: '如梦的加持', 数量: 9 }, { name: '如梦的加持', 数量: 12 }];
  const replies = await Promise.all([f.app.unseal(f.e('#开启梦幻试炼')), f.app.unseal(f.e('#开启梦幻试炼'))]);
  assert.equal(f.state.bags.owner.丹药.reduce((sum, item) => sum + item.数量, 0), 1);
  assert.equal(authority.getSuiyunUnsealedCount(f.state.players.owner), 1);
  assert.ok(replies.some(text => text.includes('已解封')));
  assert.equal(authority.suiyunAuthorityRemaining(f.state.players.owner, '梦幻'), 0);
  assert.match(await f.app.dream(f.e('#梦幻 盘古幡 开天')), /已借来/);
  assert.ok(authority.suiyunAuthorityRemaining(f.state.players.owner, '梦幻') > 0);
  assert.equal(authority.hasSuiyunAuthority(f.state.players.owner, '真实'), false);
  assert.equal(f.state.players.owner.岁云梦幻.used, false);
});

test('上交或玩家写入失败整体回滚，纳戒封锁和不足时不记解封，归一无额外消耗', async () => {
  for (const failure of ['failWrite', 'failBag', 'rejectBag']) {
    const f = sealedFixture(), before = clone({ players: f.state.players, bags: f.state.bags });
    f.state[failure] = true;
    await assert.rejects(f.app.unseal(f.e('#开启梦幻试炼')), /failed|封锁/);
    assert.deepEqual({ players: f.state.players, bags: f.state.bags }, before);
    f.state[failure] = false;
    await f.app.unseal(f.e('#开启梦幻试炼'));
    assert.equal(authority.getSuiyunUnsealedCount(f.state.players.owner), 1);
  }
  const f = sealedFixture();
  f.state.bags.owner.丹药[0].数量 = 19;
  const before = clone(f.state.bags.owner);
  assert.match(await f.app.unseal(f.e('#开启梦幻试炼')), /现有19/);
  assert.deepEqual(f.state.bags.owner, before);
  f.state.bags.owner.时间线封锁 = { locked: true };
  assert.match(await f.app.unseal(f.e('#归一')), /封锁/);
  delete f.state.bags.owner.时间线封锁;
  const resourceBefore = clone(f.state.bags.owner);
  await f.app.unseal(f.e('#归一'));
  assert.equal(authority.hasSuiyunAuthority(f.state.players.owner, '创世'), true);
  assert.deepEqual(f.state.bags.owner, resourceBefore);
});

test('召唤基拉祈只付一次600本源并保留正数，解封与原500本源祈愿分别扣费', async () => {
  const f = sealedFixture();
  f.state.players.owner.生命本源 = 600;
  assert.match(await f.app.unseal(f.e('#召唤基拉祈')), /保留正数/);
  assert.equal(f.state.players.owner.生命本源, 600);
  f.state.players.owner.生命本源 = 1200;
  await Promise.all([f.app.unseal(f.e('#召唤基拉祈')), f.app.unseal(f.e('#召唤基拉祈'))]);
  assert.equal(f.state.players.owner.生命本源, 600);
  await f.app.wish(f.e('#祈愿渡劫', 'target'));
  assert.equal(f.state.players.owner.生命本源, 100);
  assert.equal(f.state.players.target.基拉祈祈愿.remaining, 1);
  const serialized = JSON.parse(JSON.stringify(f.state.players.owner));
  assert.equal(authority.hasSuiyunAuthority(serialized, '七夜的许愿星'), true);
  serialized.当前大道至宝 = '';
  assert.equal(authority.hasSuiyunAuthority(serialized, '七夜的许愿星'), false);
  serialized.当前大道至宝 = authority.SUIYUN_BRANCH;
  assert.equal(authority.hasSuiyunAuthority(serialized, '七夜的许愿星'), true);
});

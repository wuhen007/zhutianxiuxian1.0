import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as earth from '../model/revivalEarth.js';
import {
  getLocationId, getLocationName, getLocationThreshold, getCoordinateLocations,
  hasCoordinate, canImmortalEmperorFreeTravel,
} from '../model/weimianTravel.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

function newPlayer() {
  return {
    id: 'test', level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1,
    huafenlevel_id: 1, power_place: 0, 修为: 1, 血气: 1, 灵石: 12345,
    学习的功法: ['保留的旧字段'], unrelated: { value: 42 },
  };
}

function fixture({ realm = 0, phase = 0, cultivation = 0 } = {}) {
  const player = newPlayer();
  player.复活地球 = earth.createRevivalState(1);
  player.power_place = earth.REVIVAL_EARTH_LOCATION;
  const s = player.复活地球;
  s.place = '空间站';
  s.credits = 100_000;
  s.knowledge.功法 = true;
  Object.assign(s.body, { realm, phase, cultivation });
  for (const name of earth.REVIVAL_ITEMS) s.bag[name] = 100;
  let now = 1000;
  let seq = 0;
  const command = (text, roll = 0.99, options = {}) => earth.runRevivalCommand(player, text, {
    now, random: () => roll, requestId: `m${++seq}`, ...options,
  });
  const finish = () => {
    now = player.复活地球.action.endAt;
    return command('结算');
  };
  const act = (text, roll = 0.99) => {
    const start = command(text, roll);
    assert.equal(start.ok, true, `${text}: ${start.message}`);
    assert.ok(player.复活地球.action, text);
    const result = finish();
    assert.equal(result.ok, true, result.message);
    return result;
  };
  const trip = target => {
    act(`探索 ${target} 确认`);
    act('应对 隐蔽 确认');
    return act('撤离 确认');
  };
  const cooperate = () => {
    act('交谈');
    act('抉择 个人窗口 确认');
  };
  const episode = (verb, choice) => {
    act(verb);
    return act(`抉择 ${choice} 确认`);
  };
  return { player, command, finish, act, trip, cooperate, episode, setNow: time => { now = time; } };
}

test('只登记原著前段境界；存档沿用独立字段，不替换现有境界表', () => {
  assert.deepEqual(earth.REVIVAL_REALMS, ['凡人', '炼气', '筑基', '金丹', '元婴', '化神']);
  const table = JSON.parse(fs.readFileSync(new URL('../resources/data/Level/练气境界.json', import.meta.url), 'utf8'));
  assert.equal(table[1].level, '虚妄境初期');
  const player = newPlayer();
  const before = structuredClone(player);
  assert.equal(earth.runRevivalCommand(player, '入界').changed, false);
  assert.deepEqual(player, before);
  assert.equal(earth.runRevivalCommand(player, '入界 确认').ok, true);
  const { 复活地球, power_place, ...rest } = player;
  const { power_place: _, ...old } = before;
  assert.deepEqual(rest, old);
  assert.equal(power_place, 0.5);
  assert.equal(复活地球.place, '塔监狱');
});

test('既有修炼角色、其他位面、已结束记录都不会被入界覆盖', () => {
  for (const change of [{ level_id: 2 }, { Physique_id: 2 }, { huafenlevel_id: 2 }, { lunhui: 1 }, { power_place: 1 }]) {
    const player = { ...newPlayer(), ...change };
    const before = structuredClone(player);
    assert.equal(earth.runRevivalCommand(player, '入界 确认').ok, false);
    assert.deepEqual(player, before);
  }
  const f = fixture();
  assert.equal(f.command('入界 确认').ok, false);
});

test('塔内观察记录保留；越狱失败留塔、成功到站且安置额度只领一次', () => {
  const f = fixture();
  Object.assign(f.player.复活地球, { place: '塔监狱', credits: 0 });
  assert.equal(f.command('越狱 确认').ok, false);
  for (let i = 0; i < 3; i++) f.act('观察');
  assert.equal(f.player.复活地球.towerNotes, 3);
  assert.equal(f.player.复活地球.deaths, 3);
  assert.equal(f.command('推演').ok, false);
  f.cooperate();
  f.act('推演');
  f.act('越狱 确认', 0);
  assert.equal(f.player.复活地球.place, '塔监狱');
  assert.equal(f.command('越狱 确认').ok, false);
  assert.equal(f.command('推演').ok, false);
  f.act('观察 读数');
  f.act('推演');
  f.act('越狱 确认', 0.99);
  assert.equal(f.player.复活地球.place, '空间站');
  assert.equal(f.player.复活地球.credits, 120);
  f.player.复活地球.place = '塔监狱';
  f.act('观察 读数');
  f.cooperate();
  f.act('推演');
  f.act('候时');
  f.act('越狱 确认', 0.99);
  assert.equal(f.player.复活地球.credits, 120);
});

test('空间站零积分仍有工作途径；离线查看不额外扣费或追加死亡', () => {
  const f = fixture();
  f.player.复活地球.credits = 0;
  f.act('工作');
  assert.equal(f.player.复活地球.credits, 30);
  const before = structuredClone(f.player);
  f.setNow(9_999_999_999);
  assert.equal(f.command('状态').ok, true);
  assert.deepEqual(f.player, before);
});

test('凡人先研读再引灵入体；旧账号属性不影响本世修炼', () => {
  const f = fixture();
  f.player.复活地球.knowledge = {};
  f.player.攻击 = 1e100;
  f.player.修为 = 1e100;
  assert.equal(f.command('修炼').ok, false);
  f.act('研读');
  f.act('修炼');
  assert.equal(f.player.复活地球.body.realm, 1);
  assert.equal(f.player.level_id, 1);
  assert.equal(f.player.攻击, 1e100);
});

test('筑基材料、丹炉、丹药、闭关逐项生效；积累满也无自动突破', () => {
  const f = fixture({ realm: 1, phase: 3, cultivation: 100 });
  f.player.复活地球.bag.筑基丹 = 0;
  assert.equal(f.command('突破').ok, false);
  assert.equal(f.command('制作 筑基丹').ok, false);
  f.act('制作 丹炉');
  const herb = f.player.复活地球.bag.百年大蓟;
  f.act('制作 筑基丹');
  assert.equal(f.player.复活地球.bag.百年大蓟, herb - 1);
  assert.equal(f.command('突破').ok, true);
  assert.equal(f.player.复活地球.body.realm, 1);
  assert.equal(f.command('结算').ok, false);
  f.finish();
  assert.equal(f.player.复活地球.body.realm, 2);
  assert.equal(f.player.复活地球.body.cultivation, 0);
});

test('结丹逐项要求五行与来源，修为或积分再多也不会绕过', () => {
  const f = fixture({ realm: 2, phase: 3, cultivation: 180 });
  assert.equal(f.command('突破').ok, false);
  assert.equal(f.command('蕴养 金').ok, false);
  assert.equal(f.command('蕴养 火').ok, false);
  f.act('制作 本命法器');
  f.act('制作 持续火种');
  for (const element of ['金', '木', '水', '火', '土']) {
    for (let i = 0; i < 3; i++) f.act(`蕴养 ${element}`);
    assert.equal(f.command(`蕴养 ${element}`).ok, false);
  }
  f.act('突破');
  assert.equal(f.player.复活地球.body.realm, 3);
});

test('木土基材在首轮投入，火燃料与水灵之气按次扣除', () => {
  const f = fixture({ realm: 2 });
  f.player.复活地球.facilities.持续火种 = true;
  for (const element of ['木', '土', '水', '火']) {
    for (let i = 0; i < 3; i++) f.act(`蕴养 ${element}`);
  }
  assert.equal(f.player.复活地球.bag.千年古木, 99);
  assert.equal(f.player.复活地球.bag.五百年灵草, 99);
  assert.equal(f.player.复活地球.bag.水灵之气, 97);
  assert.equal(f.player.复活地球.bag.燃料, 97);
});

test('污染结婴需要支线与金脑丹；开始前展示风险，失败按真死亡清算', () => {
  const f = fixture({ realm: 3, phase: 3, cultivation: 300 });
  assert.equal(f.command('突破 确认').ok, false);
  f.player.复活地球.knowledge.佛道传承 = true;
  const before = structuredClone(f.player);
  const preview = f.command('突破');
  assert.match(preview.message, /65%/);
  assert.deepEqual(f.player, before);
  f.player.复活地球.bag.金脑丹 = 0;
  assert.equal(f.command('突破 确认').ok, false);
  f.player.复活地球.bag.金脑丹 = 1;
  f.act('突破 确认', 0);
  assert.equal(f.player.复活地球.body.realm, 0);
  assert.equal(f.player.复活地球.deaths, 1);
  assert.equal(f.player.复活地球.place, '空间站');
});

test('污染结婴成功才能获得元婴；不是所有修士的通用突破口', () => {
  const f = fixture({ realm: 3, phase: 3, cultivation: 300 });
  assert.match(f.command('突破').message, /佛道污染结婴支线/);
  f.player.复活地球.knowledge.佛道传承 = true;
  f.act('突破 确认');
  assert.equal(f.player.复活地球.body.realm, 4);
});

test('化魔未核实则关闭且不扣资源；化神只在元婴积累完成后启动', () => {
  const f = fixture({ realm: 4, phase: 3, cultivation: 480 });
  const before = structuredClone(f.player);
  assert.match(f.command('化神 化魔').message, /原文补核/);
  assert.deepEqual(f.player, before);
  f.player.复活地球.body.cultivation = 0;
  assert.equal(f.command('化神 化凡').ok, false);
});

test('化凡实际压制修为；主动动用会清经历与愿文，单世不切换路线', () => {
  const f = fixture({ realm: 4, phase: 3, cultivation: 480 });
  assert.equal(f.command('化神 化凡').ok, true);
  f.act('化凡');
  for (const text of ['修炼', '探索 地表采药 确认', '制作 丹炉', '吸收黑雾 确认']) {
    assert.equal(f.command(text).ok, false, text);
  }
  const before = structuredClone(f.player);
  assert.equal(f.command('动用修为').ok, false);
  assert.deepEqual(f.player, before);
  assert.equal(f.command('动用修为 确认').ok, true);
  assert.equal(f.player.复活地球.body.mortalSteps, 0);
  assert.equal(f.player.复活地球.body.vow, '');
  assert.equal(f.command('化神 信仰').ok, false);
  assert.equal(f.command('化神 化凡').ok, true);
  assert.equal(f.command('立愿 不够字数').ok, false);
  for (const choice of ['匀出配给', '购买药包', '留存名册']) f.episode('化凡', choice);
  assert.equal(f.command('突破').ok, false);
  assert.equal(f.command('立愿 守护身边凡人并为同胞建立接应').ok, true);
  f.act('突破');
  assert.equal(f.player.复活地球.body.realm, 5);
  assert.equal(f.command('探索 离界测绘 确认').ok, true);
});

test('科技居民的感谢只计贡献；信仰路线需图腾、信众与供奉', () => {
  const f = fixture({ realm: 4, phase: 3, cultivation: 480 });
  assert.equal(f.command('化神 信仰').ok, true);
  assert.equal(f.command('传道').ok, false);
  f.act('救援 确认');
  assert.equal(f.player.复活地球.body.faith, 0);
  assert.equal(f.player.复活地球.station.contribution, 5);
  f.act('凝聚图腾');
  assert.equal(f.command('突破').ok, false);
  assert.equal(f.command('传道').ok, false);
  assert.equal(f.command('研读 蝶梦').ok, false);
  f.act('寻访信众');
  for (const choice of ['分粮共食', '送药守约', '仪器复核', '留下手册']) f.episode('传道', choice);
  assert.equal(f.player.复活地球.body.faith, 100);
  f.act('突破');
  assert.equal(f.player.复活地球.body.realm, 5);
});

test('真正死亡清全部本世战力与随身物资，而非只改境界标签', () => {
  const f = fixture({ realm: 4, phase: 3, cultivation: 480 });
  const s = f.player.复活地球;
  Object.assign(s.body, { weapon: true, path: '信仰', chosenPath: '信仰', faith: 99, totem: true });
  s.body.elements = { 金: 3, 木: 3, 水: 3, 火: 3, 土: 3 };
  s.storage.灵植 = 20;
  s.facilities.丹炉 = true;
  s.addiction = 4;
  s.rescueBudget = 0;
  const base = { realm: f.player.level_id, cultivation: f.player.修为, money: f.player.灵石 };
  f.act('探索 离界测绘 确认', 0);
  assert.deepEqual(f.player.复活地球.body, earth.createRevivalState().body);
  assert.deepEqual(f.player.复活地球.bag, {});
  assert.equal(f.player.复活地球.storage.灵植, 20);
  assert.equal(f.player.复活地球.facilities.丹炉, true);
  assert.equal(f.player.复活地球.addiction, 4);
  assert.equal(f.player.复活地球.knowledge.功法, true);
  assert.deepEqual({ realm: f.player.level_id, cultivation: f.player.修为, money: f.player.灵石 }, base);
});

test('接应预算约束落点和实际支出；无钱回塔，有钱仍可能失败', () => {
  for (const [credits, budget, rescueRoll, place, remaining] of [
    [1000, 0, 0, '塔监狱', 980],
    [70, 300, 0, '塔监狱', 50],
    [1000, 60, 0, '空间站', 920],
    [1000, 120, 0.9, '塔监狱', 860],
    [1000, 300, 0.9, '空间站', 740],
    [1000, 300, 0, '空间站', 920],
    [1000, 300, 0.5, '空间站', 860],
    [1000, 300, 0.75, '空间站', 800],
    [1000, 300, 0.99, '塔监狱', 680],
  ]) {
    const f = fixture({ realm: 1 });
    Object.assign(f.player.复活地球, { credits, rescueBudget: budget });
    let i = 0;
    assert.equal(f.command('探索 地表采药 确认', 0, { random: () => i++ === 0 ? 0 : rescueRoll }).ok, true);
    f.finish();
    assert.equal(f.player.复活地球.place, place);
    assert.equal(f.player.复活地球.credits, remaining);
    assert.equal(f.player.复活地球.body.realm, 0);
  }
});

test('黑雾成瘾在吸收开始时记账，死亡后仍在，且不会代替突破关卡', () => {
  const f = fixture({ realm: 2, phase: 3, cultivation: 170 });
  f.player.复活地球.knowledge.佛道传承 = true;
  f.act('吸收黑雾 确认');
  assert.equal(f.player.复活地球.body.cultivation, 180);
  assert.equal(f.player.复活地球.body.realm, 2);
  assert.equal(f.command('突破').ok, false);
  f.player.复活地球.body.cultivation = 0;
  f.act('吸收黑雾 确认', 0);
  assert.equal(f.player.复活地球.body.realm, 0);
  assert.equal(f.player.复活地球.addiction, 2);
});

test('物资输入校验、余额与原子性；预览、缺材料、提前结算均保持原样', () => {
  const f = fixture({ realm: 2 });
  for (const text of [
    '存入 灵植 -1', '取出 灵植 NaN', '存入 __proto__ 1',
    '存入 灵植 1e2', '存入 灵植 9007199254740993', '存入 灵植 101',
    '接应预算 61', '接应预算 -60', '接应预算 360',
    '探索 古木遗址', '制作 不存在', '不存在命令',
  ]) {
    const before = structuredClone(f.player);
    assert.equal(f.command(text).ok, false, text);
    assert.deepEqual(f.player, before, text);
  }
  assert.equal(f.command('存入 灵植 5').ok, true);
  assert.equal(f.command('取出 灵植 2').ok, true);
  assert.equal(f.player.复活地球.storage.灵植, 3);
  assert.equal(f.player.复活地球.bag.灵植, 97);
  assert.equal(f.command('工作').ok, true);
  const before = structuredClone(f.player);
  assert.equal(f.command('研读').ok, false);
  assert.equal(f.command('结算').ok, false);
  assert.deepEqual(f.player, before);
});

test('重启后沿用已固定随机数，重复结算不重发奖励与不重复死亡', () => {
  const f = fixture({ realm: 1 });
  assert.equal(f.command('探索 地表采药 确认', 0).ok, true);
  const restored = JSON.parse(JSON.stringify(f.player));
  const now = restored.复活地球.action.endAt;
  const result = earth.runRevivalCommand(restored, '结算', { now, random: () => { throw Error('不应重抽'); }, requestId: 'receipt' });
  assert.equal(result.ok, true);
  assert.equal(restored.复活地球.deaths, 1);
  const before = structuredClone(restored);
  assert.match(earth.runRevivalCommand(restored, '结算', { now, requestId: 'receipt' }).message, /已结算消息/);
  assert.equal(earth.runRevivalCommand(restored, '结算', { now }).ok, false);
  assert.deepEqual(restored, before);
});

test('普通升级、跨体系、传送与复活地球坐标购买隔离；原路线保持可用', () => {
  const f = fixture();
  for (const text of ['#闭关', '#突破', '#花粉进化', '#前往凡间', '#复活选择 1']) {
    assert.notEqual(earth.getRevivalCommandBlock(f.player, text), '');
    assert.equal(earth.getRevivalCommandBlock(newPlayer(), text), '');
  }
  for (const text of ['#复活地球', '#复活地球 状态', '#我的练气', '#我', '#诸天帮助', '#世界 发言 测试']) {
    assert.equal(earth.getRevivalCommandBlock(f.player, text), '');
  }
  assert.equal(getLocationId('复活地球'), 0.5);
  assert.equal(getLocationName(0.5), '复活地球');
  assert.equal(getCoordinateLocations().includes('复活地球'), false);
  assert.equal(hasCoordinate(f.player, '复活地球'), false);
  assert.equal(getLocationThreshold({ level_id: 100, mijinglevel_id: 25 }, '复活地球').ok, false);
  assert.equal(getLocationThreshold(f.player, '凡间').ok, false);
  assert.equal(canImmortalEmperorFreeTravel({ mijinglevel_id: 25 }, '凡间', '复活地球'), false);
  assert.equal(getLocationThreshold({ level_id: 42 }, '仙界').ok, true);
});

test('旧快照与字段删除会被挡住；相同本世记录允许既有派生属性重算', () => {
  const f = fixture();
  const stale = structuredClone(f.player);
  f.command('工作');
  assert.throws(() => earth.assertRevivalWriteCurrent(f.player, stale), { code: 'REVIVAL_EARTH_STALE_WRITE' });
  const removed = structuredClone(f.player);
  delete removed.复活地球;
  assert.throws(() => earth.assertRevivalWriteCurrent(f.player, removed));
  const changed = structuredClone(f.player);
  changed.复活地球.credits++;
  assert.throws(() => earth.assertRevivalWriteCurrent(f.player, changed));
  const recalculated = structuredClone(f.player);
  recalculated.攻击 = 5000;
  assert.doesNotThrow(() => earth.assertRevivalWriteCurrent(f.player, recalculated));
  recalculated.power_place = 0;
  assert.throws(() => earth.assertRevivalWriteCurrent(f.player, recalculated));
  for (const field of ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id', 'lunhui']) {
    const bypass = structuredClone(f.player);
    bypass[field] = 20;
    assert.throws(() => earth.assertRevivalWriteCurrent(f.player, bypass), field);
  }
});

test('损坏存档和未知版本暂停操作，不静默清档或重新抽取', () => {
  for (const change of [{ version: 999 }, { credits: -1 }, { place: '不明' }, { rescueBudget: 999 }]) {
    const f = fixture();
    Object.assign(f.player.复活地球, change);
    const before = structuredClone(f.player);
    assert.equal(f.command('工作').ok, false);
    assert.deepEqual(f.player, before);
  }
  const f = fixture();
  const before = structuredClone(f.player);
  assert.equal(f.command('工作', 2).ok, false);
  assert.deepEqual(f.player, before);
});

test('接引需化神、测绘与装置；一次转换，重复消息不重复升阶', () => {
  const f = fixture({ realm: 5 });
  assert.equal(f.command('修炼').ok, false);
  assert.equal(f.command('突破').ok, false);
  assert.equal(f.command('离界 确认').ok, false);
  f.trip('离界测绘');
  f.act('制作 接引装置');
  assert.equal(f.command('离界').ok, false);
  assert.equal(f.command('离界 确认', 0.99, { requestId: 'ascend' }).ok, true);
  assert.equal(f.player.power_place, 1);
  assert.equal(f.player.level_id, 42);
  assert.equal(f.player.复活地球.body.realm, 5);
  assert.equal(f.player.复活地球.status, 'ascended');
  assert.equal(f.player.复活地球.needsImmortalSync, true);
  const before = structuredClone(f.player);
  assert.equal(f.command('离界 确认', 0.99, { requestId: 'ascend' }).changed, false);
  assert.equal(f.command('入界 确认').ok, false);
  assert.deepEqual(f.player, before);
  assert.match(earth.getRevivalCommandBlock(f.player, '#闭关'), /属性尚待同步/);
  f.player.复活地球.needsImmortalSync = false;
  assert.equal(earth.getRevivalCommandBlock(f.player, '#闭关'), '');
});

test('探索有可见危险征兆；抵达后可主动空手撤离而不强制搜索', () => {
  const f = fixture({ realm: 1 });
  assert.match(f.command('探索 地表采药').message, /伪人巡查路线/);
  const cultivation = f.player.复活地球.body.realm;
  const bag = structuredClone(f.player.复活地球.bag);
  f.act('探索 地表采药 确认', 0.2);
  assert.equal(f.player.复活地球.place, '地表');
  f.act('撤离 确认');
  assert.equal(f.player.复活地球.body.realm, cultivation);
  assert.equal(f.player.复活地球.deaths, 0);
  assert.deepEqual(f.player.复活地球.bag, bag);
  assert.equal(f.player.复活地球.credits, 99980);
});

test('实际Go入口在频道账号映射后隔离普通行动', async () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function Go(');
  const end = source.indexOf('// export async function Go(', start);
  const fn = source.slice(start, end).replace('export async function', 'async function');
  const f = fixture();
  const replies = [];
  let account;
  const Go = vm.runInNewContext(`${fn}\nGo`, {
    channel: async () => 'mapped-account',
    Read_player: async id => { account = id; return f.player; },
    getRevivalCommandBlock: earth.getRevivalCommandBlock,
  });
  assert.equal(await Go({ user_id: 'qg_origin', msg: '#闭关', reply: text => replies.push(text) }), 0);
  assert.equal(account, 'mapped-account');
  assert.match(replies[0], /独立境界/);
});

function appFixture(initial, { failWrite = false, failSync = false, pending = null } = {}) {
  let disk = structuredClone(initial);
  let writes = 0;
  let syncs = 0;
  const replies = [];
  const source = fs.readFileSync(new URL('../apps/User/RevivalEarth.js', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export class', 'class');
  const bindings = {
    ...earth, console: { warn() {} },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async id => id, existplayer: async () => true,
    Read_player: async () => structuredClone(disk),
    Write_player: async (_id, next) => {
      if (failWrite) throw Error('simulated disk failure');
      earth.assertRevivalWriteCurrent(disk, next);
      writes++;
      disk = structuredClone(next);
    },
    Read_equipment: async () => ({}),
    Write_equipment: async () => {
      syncs++;
      if (failSync) throw Error('simulated recalculation failure');
      disk.血量上限 = 20000000;
    },
    redis: { get: async () => pending },
    withPlayerMutationLock,
  };
  const Constructor = vm.runInNewContext(`${source}\nRevivalEarth`, bindings);
  const app = new Constructor();
  const send = (msg, messageId = '') => app.handle({
    msg, user_id: initial.id, ...(messageId ? { message_id: messageId } : {}),
    reply: async text => replies.push(text),
  });
  return { app, send, replies, disk: () => disk, writes: () => writes, syncs: () => syncs, allowSync: () => { failSync = false; } };
}

test('实际命令入口自动发现、别名显示本世境界；普通玩家原面板继续向后传递', async () => {
  const f = fixture({ realm: 2 });
  const app = appFixture(f.player);
  assert.ok(app.app.rule.some(rule => new RegExp(rule.reg).test('#复活地球 状态')));
  assert.equal(await app.send('#我的练气'), true);
  assert.match(app.replies.at(-1), /筑基初期/);
  const other = appFixture(newPlayer());
  assert.equal(await other.send('#我的练气'), false);
  assert.equal(other.replies.length, 0);
});

test('实际入口并发与相同消息幂等，只开启一次任务与扣一次成本', async () => {
  const f = fixture();
  const app = appFixture(f.player);
  await Promise.all([app.send('#复活地球 工作', 'same'), app.send('#复活地球 工作', 'same')]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().复活地球.credits, 99995);
  assert.equal(app.disk().复活地球.action.kind, 'work');
  assert.match(app.replies.join('\n'), /已结算消息/);
});

test('落盘失败不发成功回执；旧行动未结算时阻止换路线', async () => {
  const f = fixture();
  const app = appFixture(f.player, { failWrite: true });
  await app.send('#复活地球 工作');
  assert.equal(app.writes(), 0);
  assert.equal(app.disk().复活地球.action, null);
  assert.match(app.replies.at(-1), /未确认完成/);
  const entry = appFixture(newPlayer(), { pending: '{"action":"闭关"}' });
  await entry.send('#复活地球 入界 确认');
  assert.equal(entry.writes(), 0);
  assert.match(entry.replies.at(-1), /原路线尚有行动记录/);
});

test('离界先持久化后同步派生属性；同步失败状态可重试，且不重复转换', async () => {
  const f = fixture({ realm: 5 });
  f.player.复活地球.knowledge.离界坐标 = true;
  f.player.复活地球.facilities.接引装置 = true;
  const app = appFixture(f.player, { failSync: true });
  await app.send('#复活地球 离界 确认', 'ascend');
  assert.equal(app.disk().level_id, 42);
  assert.equal(app.disk().复活地球.needsImmortalSync, true);
  assert.match(app.replies.at(-1), /同步待重试/);
  app.allowSync();
  await app.send('#复活地球 状态', 'status');
  assert.equal(app.disk().复活地球.needsImmortalSync, false);
  assert.equal(app.disk().当前血量, app.disk().血量上限);
  assert.equal(app.disk().复活地球.status, 'ascended');
  await app.send('#复活地球 离界 确认', 'ascend');
  assert.equal(app.syncs(), 2);
  assert.equal(app.disk().level_id, 42);
});

test('塔线索按类型去重，候时改善窗口但不会重抽已启动越狱', () => {
  const f = fixture();
  f.player.复活地球.place = '塔监狱';
  for (const name of ['规章', '规章', '读数', '名册']) f.act(`观察 ${name}`);
  assert.equal(f.player.复活地球.towerNotes, 3);
  assert.equal(f.command('越狱 确认').ok, false);
  f.cooperate();
  f.act('推演');
  assert.match(f.command('越狱').message, /75%/);
  f.act('候时');
  assert.match(f.command('越狱').message, /95%/);
  assert.equal(f.command('越狱 确认', 0.1).ok, true);
  assert.equal(f.player.复活地球.tower.window, 0);
  assert.equal(f.command('候时').ok, false);
  f.finish();
  assert.equal(f.player.复活地球.place, '空间站');
  assert.equal(f.player.复活地球.tower.ally, false);
});

test('带回塔规记忆也需重建本轮协作与校准，没有永久越狱窗口', () => {
  const f = fixture({ realm: 1 });
  f.player.复活地球.towerNotes = 3;
  f.player.复活地球.tower.clues = ['规章', '读数', '名册'];
  f.command('接应预算 0');
  f.act('探索 地表采药 确认', 0);
  assert.equal(f.player.复活地球.place, '塔监狱');
  assert.equal(f.player.复活地球.towerNotes, 3);
  assert.equal(f.command('推演').ok, false);
  f.cooperate();
  assert.equal(f.command('推演').ok, false);
  f.act('观察 读数');
  f.act('推演');
  assert.equal(f.player.复活地球.tower.window, 1);
});

test('外勤抵达与搜索不直接发资源或知识，返站才交付且只交一次', () => {
  const f = fixture({ realm: 2 });
  const original = structuredClone(f.player.复活地球.bag);
  f.act('探索 塔底调查 确认');
  assert.deepEqual(f.player.复活地球.bag, original);
  f.act('应对 隐蔽 确认');
  assert.deepEqual(f.player.复活地球.bag, original);
  assert.equal(f.player.复活地球.expedition.cargo.黑雾样本, 1);
  assert.equal(f.player.复活地球.knowledge.佛道传承, undefined);
  assert.equal(f.command('撤离 确认').ok, true);
  const now = f.player.复活地球.action.endAt;
  f.setNow(now);
  assert.equal(f.command('结算', 0.99, { requestId: 'return-result' }).ok, true);
  assert.equal(f.player.复活地球.bag.黑雾样本, original.黑雾样本 + 1);
  assert.equal(f.player.复活地球.knowledge.佛道传承, true);
  const before = structuredClone(f.player);
  assert.equal(f.command('结算', 0.99, { requestId: 'return-result' }).changed, false);
  assert.deepEqual(f.player, before);
});

test('外勤期间站内操作封锁；预览和只读面板不抽随机、不迁移或收费', () => {
  const f = fixture({ realm: 2 });
  f.act('探索 地表采药 确认');
  const before = structuredClone(f.player);
  const noRandom = () => { throw Error('预览不应抽签'); };
  for (const text of ['状态', '外勤', '站务', '塔规']) {
    assert.equal(f.command(text, 0.99, { random: noRandom }).ok, true, text);
  }
  for (const text of [
    '工作', '研读', '存入 灵植 1', '取出 灵植 1', '制作 探测器', '突破',
    '离界 确认', '接应预算 300', '委托 医疗补给', '救援 确认', '化神 化凡',
    '探索 废站勘探 确认', '应对 隐蔽', '应对 科技', '应对 法术', '撤离', '弃货撤离',
  ]) {
    assert.equal(f.command(text, 0.99, { random: noRandom }).ok, false, text);
  }
  f.setNow(9_999_999_999);
  assert.equal(f.command('外勤').ok, true);
  assert.deepEqual(f.player, before);
});

test('应对方式有实际成本：隐蔽耗时、施法暴露、科技消耗探测器', () => {
  for (const mode of ['隐蔽', '法术', '科技']) {
    const f = fixture({ realm: 1 });
    f.act('探索 地表采药 确认');
    f.act(`应对 ${mode} 确认`);
    const x = f.player.复活地球.expedition;
    assert.equal(x.window, mode === '隐蔽' ? 3 : 4);
    assert.equal(x.casts, mode === '法术' ? 0 : 1);
    assert.equal(x.loudCasts, mode === '法术' ? 1 : 0);
    assert.equal(f.player.复活地球.bag.探测器, mode === '科技' ? 99 : 100);
    assert.equal(f.command('应对 隐蔽 确认').ok, false);
    f.command('深入 确认');
    if (mode === '法术') assert.equal(f.command('应对 法术 确认').ok, false);
  }
  const f = fixture({ realm: 1 });
  f.act('探索 地表采药 确认');
  f.player.复活地球.bag.探测器 = 0;
  const before = structuredClone(f.player);
  assert.equal(f.command('应对 科技 确认').ok, false);
  assert.equal(f.command('应对 隐蔽 确认', 2).ok, false);
  assert.deepEqual(f.player, before);
});

test('深入最多三处，窗口耗尽仍可紧急撤离，离线不会额外杀人', () => {
  const f = fixture({ realm: 2 });
  f.act('探索 地表采药 确认');
  for (let depth = 1; depth <= 3; depth++) {
    f.act('应对 科技 确认');
    if (depth < 3) {
      const before = structuredClone(f.player);
      assert.equal(f.command('深入').changed, false);
      assert.deepEqual(f.player, before);
      assert.equal(f.command('深入 确认').ok, true);
    }
  }
  assert.equal(f.player.复活地球.expedition.window, 0);
  assert.equal(f.player.复活地球.expedition.cargo.灵植, 15);
  assert.equal(f.command('深入 确认').ok, false);
  assert.equal(f.command('地表修炼 确认').ok, false);
  assert.match(f.command('撤离').message, /25个百分点/);
  const before = structuredClone(f.player);
  f.setNow(9_999_999_999);
  f.command('状态');
  assert.deepEqual(f.player, before);
  f.act('撤离 确认');
  assert.equal(f.player.复活地球.bag.灵植, 115);
  assert.equal(f.player.复活地球.expedition, null);
});

test('弃货撤离降低当次风险，确认才放弃新收获，不销毁原随身物资', () => {
  const f = fixture({ realm: 2 });
  f.act('探索 塔底调查 确认');
  f.act('应对 隐蔽 确认');
  const original = structuredClone(f.player.复活地球.bag);
  const before = structuredClone(f.player);
  const loadedRisk = Number(f.command('撤离').message.match(/死亡风险(\d+)%/)[1]);
  const emptyRisk = Number(f.command('弃货撤离').message.match(/死亡风险(\d+)%/)[1]);
  assert.ok(emptyRisk < loadedRisk);
  assert.deepEqual(f.player, before);
  assert.equal(f.command('弃货撤离 确认').ok, true);
  assert.deepEqual(f.player.复活地球.expedition.cargo, {});
  assert.deepEqual(f.player.复活地球.expedition.discoveries, []);
  f.finish();
  assert.deepEqual(f.player.复活地球.bag, original);
  assert.equal(f.player.复活地球.knowledge.佛道传承, undefined);
});

test('货物尚在地表时死亡清修为、行囊、暂存与未交调查，不损仓储', () => {
  const f = fixture({ realm: 2, phase: 3, cultivation: 180 });
  f.player.复活地球.storage.灵植 = 20;
  f.player.复活地球.station.contract = '医疗补给';
  f.player.复活地球.station.contribution = 12;
  f.act('探索 塔底调查 确认');
  f.act('应对 隐蔽 确认');
  const result = f.act('撤离 确认', 0);
  assert.match(result.message, /外勤暂存损失：黑雾样本×1/);
  assert.equal(f.player.复活地球.body.realm, 0);
  assert.equal(f.player.复活地球.expedition, null);
  assert.deepEqual(f.player.复活地球.bag, {});
  assert.equal(f.player.复活地球.knowledge.佛道传承, undefined);
  assert.equal(f.player.复活地球.storage.灵植, 20);
  assert.equal(f.player.复活地球.station.contract, '医疗补给');
  assert.equal(f.player.复活地球.station.contribution, 12);
});

test('地表修炼消耗撤离窗口，收益封顶而不跳突破关卡', () => {
  const f = fixture({ realm: 1, cultivation: 90 });
  f.act('探索 地表采药 确认');
  assert.equal(f.command('地表修炼 确认').ok, false);
  f.act('应对 隐蔽 确认');
  const before = structuredClone(f.player);
  assert.match(f.command('地表修炼').message, /占用窗口2/);
  assert.deepEqual(f.player, before);
  f.act('地表修炼 确认');
  assert.equal(f.player.复活地球.body.cultivation, 100);
  assert.equal(f.player.复活地球.body.phase, 0);
  assert.equal(f.player.复活地球.expedition.window, 1);
  assert.equal(f.player.复活地球.bag.灵植, before.复活地球.bag.灵植);
  assert.equal(f.command('突破').ok, false);
  assert.equal(f.command('地表修炼 确认').ok, false);
  f.act('撤离 确认');
  f.act('突破');
  assert.equal(f.player.复活地球.body.phase, 1);
});

test('三个岗位均可从零余额工作；报酬、材料与站务贡献分账', () => {
  for (const [name, credits, item, contribution] of [
    ['绿植维护', 30, '灵植', 1], ['工程检修', 35, '工程部件', 1], ['复活值守', 40, '', 2],
  ]) {
    const f = fixture();
    Object.assign(f.player.复活地球, { credits: 0, bag: {} });
    f.act(`工作 ${name}`);
    assert.equal(f.player.复活地球.credits, credits);
    assert.equal(f.player.复活地球.station.contribution, contribution);
    assert.equal(f.player.复活地球.body.faith, 0);
    if (item) assert.ok(f.player.复活地球.bag[item] > 0);
    else assert.deepEqual(f.player.复活地球.bag, {});
  }
});

test('委托单一领取、缺货不扣、交付幂等；取消没有凭空奖励', async () => {
  const f = fixture();
  f.player.复活地球.bag.灵植 = 0;
  assert.equal(f.command('委托 医疗补给').ok, true);
  assert.equal(f.command('委托 设备修复').ok, false);
  const before = structuredClone(f.player);
  assert.equal(f.command('交付委托').ok, false);
  assert.deepEqual(f.player, before);
  for (let i = 0; i < 2; i++) f.act('工作');
  const ready = structuredClone(f.player);
  const app = appFixture(ready);
  await Promise.all([
    app.send('#复活地球 交付委托', 'delivery'),
    app.send('#复活地球 交付委托', 'delivery'),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().复活地球.bag.灵植, 0);
  assert.equal(app.disk().复活地球.credits, ready.复活地球.credits + 45);
  assert.equal(app.disk().复活地球.station.completed, 1);
  assert.equal(app.disk().复活地球.station.contribution, 5);
  assert.equal(f.command('取消委托').ok, true);
  assert.equal(f.player.复活地球.credits, ready.复活地球.credits);
  assert.equal(f.player.复活地球.bag.灵植, 4);
});

function downgradeV6(f) {
  const s = f.player.复活地球;
  s.version = 6;
  delete s.anomalyArchive;
  if (s.action?.rulesVersion === 7) s.action.rulesVersion = 6;
  return s;
}

function downgradeV5(f) {
  const s = downgradeV6(f);
  s.version = 5;
  delete s.station.crisis;
  if (s.action?.rulesVersion === 6) s.action.rulesVersion = 5;
  return s;
}

function downgradeV4(f) {
  const s = downgradeV5(f);
  s.version = 4;
  if (s.expedition) delete s.expedition.signal;
  if (s.action?.rulesVersion === 5) s.action.rulesVersion = 4;
  return s;
}

function downgradeV3(f) {
  const s = downgradeV4(f);
  s.version = 3;
  delete s.body.pathEvent;
  delete s.body.pathChoices;
  for (const record of s.deathRecords || []) {
    delete record.body.pathEvent;
    delete record.body.pathChoices;
  }
  if (s.action?.rulesVersion === 4) {
    s.action.rulesVersion = 3;
    if (['mortal', 'preach'].includes(s.action.kind)) delete s.action.event;
  }
  return s;
}

function downgradeFixture(f) {
  const s = downgradeV3(f);
  s.version = 1;
  delete s.tower;
  delete s.station;
  delete s.expedition;
  delete s.lifeTrace;
  delete s.deathRecords;
  return s;
}

test('v1只读兼容，预览与失败保留原存档；首次成功动作才持久化v7', () => {
  const f = fixture({ realm: 1 });
  const old = downgradeFixture(f);
  old.towerNotes = 2;
  old.history = [{ at: 1, command: '旧命令', message: '旧结果' }];
  old.receipts = [{ id: 'old-message', message: '旧回执' }];
  const before = structuredClone(f.player);
  for (const text of ['状态', '外勤', '塔规', '站务']) assert.equal(f.command(text).ok, true);
  assert.equal(f.command('探索 地表采药').changed, false);
  assert.equal(f.command('取出 灵植 999').ok, false);
  assert.equal(f.command('工作', 0.99, { requestId: 'old-message' }).changed, false);
  assert.deepEqual(f.player, before);
  assert.equal(f.command('工作').ok, true);
  assert.equal(f.player.复活地球.version, 7);
  assert.deepEqual(f.player.复活地球.tower.clues, ['规章', '读数']);
  assert.equal(f.player.复活地球.history[0].message, '旧结果');
  assert.equal(f.player.复活地球.action.rulesVersion, 7);
  assert.equal(f.player.复活地球.revision, before.复活地球.revision + 1);
});

test('旧版已开始的探索保留一次结算返航、空手分支和原全额接应', () => {
  for (const roll of [0, 0.2, 0.99]) {
    const f = fixture({ realm: 1 });
    const s = downgradeFixture(f);
    s.credits = 1000;
    s.action = { kind: 'explore', title: '地表采药', target: '地表采药', endAt: 1000, roll, rescueRoll: 0, risk: 0.18 };
    const before = structuredClone(s.bag);
    const result = f.command('结算', 0.99, { random: () => { throw Error('旧行动不重抽'); } });
    assert.equal(result.ok, true, result.message);
    assert.equal(f.player.复活地球.place, '空间站');
    assert.equal(f.player.复活地球.expedition, null);
    assert.equal(f.player.复活地球.version, 7);
    if (roll === 0) {
      assert.equal(f.player.复活地球.credits, 880);
      assert.equal(f.player.复活地球.body.realm, 0);
      assert.match(result.message, /旧行动全额预算/);
    } else if (roll === 0.2) {
      assert.deepEqual(f.player.复活地球.bag, before);
    } else {
      assert.equal(f.player.复活地球.bag.灵植, before.灵植 + 5);
    }
  }
});

test('旧版越狱与救援完成原约定，不追加协作门槛或撤销信仰进度', () => {
  const f = fixture();
  const s = downgradeFixture(f);
  Object.assign(s, { place: '塔监狱', credits: 0, towerNotes: 3 });
  s.action = { kind: 'escape', title: '旧越狱', endAt: 1000, risk: 0.25, roll: 0.99, rescueRoll: 0 };
  assert.equal(f.command('结算').ok, true);
  assert.equal(f.player.复活地球.place, '空间站');
  assert.equal(f.player.复活地球.credits, 120);
  const faith = fixture({ realm: 4 });
  const old = downgradeFixture(faith);
  Object.assign(old.body, { path: '信仰', chosenPath: '信仰', totem: true, faith: 50 });
  old.action = { kind: 'rescue', title: '旧救援', endAt: 1000, risk: 0.2, roll: 0.99, rescueRoll: 0 };
  assert.equal(faith.command('结算').ok, true);
  assert.equal(faith.player.复活地球.body.faith, 75);
  faith.act('救援 确认');
  assert.equal(faith.player.复活地球.body.faith, 75);
  assert.equal(faith.player.复活地球.station.contribution, 5);
});

test('地表应对与撤离重启后沿用固定死亡结果，重放不重复扣费', () => {
  for (const text of ['应对 科技 确认', '撤离 确认']) {
    const f = fixture({ realm: 2 });
    f.act('探索 地表采药 确认');
    if (text === '撤离 确认') f.act('应对 隐蔽 确认');
    assert.equal(f.command(text, 0).ok, true);
    const restored = JSON.parse(JSON.stringify(f.player));
    const now = restored.复活地球.action.endAt;
    assert.equal(earth.runRevivalCommand(restored, '结算', {
      now, random: () => { throw Error('重启不重抽'); }, requestId: 'settled-field',
    }).ok, true);
    assert.equal(restored.复活地球.deaths, 1);
    assert.equal(restored.复活地球.expedition, null);
    const before = structuredClone(restored);
    earth.runRevivalCommand(restored, '结算', { now, requestId: 'settled-field' });
    assert.deepEqual(restored, before);
  }
});

test('实际入口返站落盘失败保留待结算货物，重试仅交付一次', async () => {
  const f = fixture({ realm: 2 });
  f.act('探索 塔底调查 确认');
  f.act('应对 隐蔽 确认');
  assert.equal(f.command('撤离 确认').ok, true);
  const before = structuredClone(f.player);
  const failed = appFixture(before, { failWrite: true });
  await failed.send('#复活地球 结算', 'return');
  assert.equal(failed.writes(), 0);
  assert.deepEqual(failed.disk(), before);
  assert.match(failed.replies.at(-1), /未确认完成/);
  const retry = appFixture(failed.disk());
  await Promise.all([
    retry.send('#复活地球 结算', 'return'),
    retry.send('#复活地球 结算', 'return'),
  ]);
  assert.equal(retry.writes(), 1);
  assert.equal(retry.disk().复活地球.bag.黑雾样本, before.复活地球.bag.黑雾样本 + 1);
  assert.equal(retry.disk().复活地球.knowledge.佛道传承, true);
  assert.equal(retry.disk().复活地球.expedition, null);
});

test('实际入口并发应对只消费一次探测器与窗口；旧存档查询保持只读', async () => {
  const f = fixture({ realm: 1 });
  f.act('探索 地表采药 确认');
  const app = appFixture(f.player);
  await Promise.all([
    app.send('#复活地球 应对 科技 确认', 'same-choice'),
    app.send('#复活地球 应对 科技 确认', 'same-choice'),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().复活地球.bag.探测器, 99);
  assert.equal(app.disk().复活地球.expedition.window, 4);
  const old = fixture();
  downgradeFixture(old);
  const view = appFixture(old.player);
  await view.send('#复活地球 站务');
  await view.send('#复活地球 状态');
  assert.equal(view.writes(), 0);
  assert.deepEqual(view.disk(), old.player);
});

test('v2损坏协作、外勤和站务字段时保持快照，不静默修复或发奖励', () => {
  for (const damage of [
    s => { s.tower.clues = ['规章', '规章']; s.towerNotes = 2; },
    s => { s.tower.window = 2; },
    s => { s.station.contribution = -1; },
    s => { s.station.contract = ['医疗补给']; },
    s => { s.expedition.window = -1; },
    s => { s.expedition.cargo.灵植 = Infinity; },
    s => { s.expedition.discoveries = ['不明传承']; },
    s => { s.expedition.stage = 'travel'; },
    s => { s.place = '空间站'; },
    s => { delete s.expedition; },
    s => { s.action = { kind: 'scavenge', endAt: 1000, roll: 0.99, rescueRoll: 0, rulesVersion: 999 }; },
    s => { s.action = { kind: 'scavenge', endAt: 1000, roll: 0.99, rescueRoll: 0, rulesVersion: 2, risk: NaN }; },
    s => { s.action = { kind: 'scavenge', endAt: 1000, roll: 0.99, rescueRoll: 0, rulesVersion: 2 }; },
  ]) {
    const f = fixture({ realm: 1 });
    f.act('探索 地表采药 确认');
    damage(f.player.复活地球);
    const before = structuredClone(f.player);
    for (const text of ['状态', '撤离 确认', '工作']) assert.equal(f.command(text).ok, false);
    assert.deepEqual(f.player, before);
  }
});

test('狱友事件由已存随机数选定，交谈重放或重启不更换事件；预览不收费', () => {
  const f = fixture();
  f.player.复活地球.place = '塔监狱';
  f.act('观察 规章');
  assert.equal(f.command('交谈', 0.1).ok, true);
  const saved = JSON.parse(JSON.stringify(f.player));
  assert.equal(earth.runRevivalCommand(saved, '结算', {
    now: saved.复活地球.action.endAt, random: () => { throw Error('事件不重抽'); },
  }).ok, true);
  assert.equal(saved.复活地球.tower.event, '读数矛盾');
  f.finish();
  assert.equal(f.player.复活地球.tower.ally, false);
  const before = structuredClone(f.player);
  assert.equal(f.command('交谈').ok, false);
  assert.match(f.command('事件').message, /陈默/);
  assert.match(f.command('抉择 采用旧表').message, /15个百分点/);
  assert.equal(f.command('抉择 __proto__ 确认').ok, false);
  assert.deepEqual(f.player, before);
});

test('采用旧表有持续误差：候时只校准处理时段，重查读数才纠正错误', () => {
  const f = fixture();
  f.player.复活地球.place = '塔监狱';
  for (let i = 0; i < 3; i++) f.act('观察');
  f.act('交谈', 0);
  f.act('抉择 采用旧表 确认');
  f.act('推演');
  f.act('候时');
  assert.equal(f.player.复活地球.tower.stale, true);
  assert.match(f.command('越狱').message, /80%获空间站接应/);
  assert.match(f.command('塔规').message, /实际越狱失败率：20%/);
  f.act('观察 读数');
  assert.equal(f.player.复活地球.tower.stale, false);
  f.act('推演');
  f.act('候时');
  assert.match(f.command('越狱').message, /95%获空间站接应/);
});

test('共同核验以更长行动换可靠记录，共用窗口风险与到站贡献同时落实', () => {
  const verify = fixture();
  verify.player.复活地球.place = '塔监狱';
  verify.act('观察');
  verify.act('交谈', 0.1);
  verify.act('抉择 共同核验 确认');
  assert.equal(verify.player.复活地球.tower.ally, true);
  assert.equal(verify.player.复活地球.tower.stale, false);
  for (const roll of [0, 0.99]) {
    const f = fixture();
    f.player.复活地球.place = '塔监狱';
    for (let i = 0; i < 3; i++) f.act('观察');
    f.act('交谈', 0.99);
    assert.match(f.command('事件').message, /周苓/);
    f.act('抉择 共用窗口 确认');
    f.act('推演');
    f.act('候时');
    assert.match(f.command('越狱').message, /85%获空间站接应/);
    f.act('越狱 确认', roll);
    assert.equal(f.player.复活地球.station.contribution, roll ? 3 : 0);
    assert.equal(f.player.复活地球.deathRecords.at(-1).risk, 0.15);
    assert.equal(f.player.复活地球.tower.escort, !roll);
  }
});

test('站务资格门槛、登记费与生活费实际生效，资格不是修为补偿', () => {
  const f = fixture({ realm: 1 });
  assert.equal(f.command('申请 配给 确认').ok, false);
  f.player.复活地球.station.contribution = 12;
  const before = structuredClone(f.player);
  assert.equal(f.command('申请 居住').changed, false);
  assert.deepEqual(f.player, before);
  for (const name of ['配给', '居住', '接应']) {
    assert.equal(f.command(`申请 ${name} 确认`).ok, true);
    assert.equal(f.command(`申请 ${name} 确认`).ok, false);
  }
  assert.equal(f.player.复活地球.credits, 99880);
  assert.equal(f.player.复活地球.station.contribution, 12);
  f.act('修炼');
  assert.equal(f.player.复活地球.credits, 99868);
  assert.equal(f.player.复活地球.body.realm, 1);
  f.act('工作');
  assert.equal(f.player.复活地球.credits, 99896);
  assert.match(f.command('站务').message, /生活费2积分/);
});

test('站务动作只在开始时记生活费，缺费及随机源异常全额回滚', () => {
  const f = fixture({ realm: 1 });
  f.player.复活地球.credits = 10;
  const before = structuredClone(f.player);
  assert.equal(f.command('修炼').ok, false);
  assert.deepEqual(f.player, before);
  f.player.复活地球.credits = 15;
  const funded = structuredClone(f.player);
  assert.equal(f.command('修炼', NaN).ok, false);
  assert.deepEqual(f.player, funded);
  assert.equal(f.command('修炼').ok, true);
  assert.equal(f.player.复活地球.credits, 0);
  assert.equal(f.player.复活地球.action.livingCost, 5);
  f.finish();
  assert.equal(f.player.复活地球.credits, 0);
});

test('登记接应的新行动使用60%并固定概率；欠款期间回落50%，旧修为仍清零', () => {
  for (const borrow of [false, true]) {
    const f = fixture({ realm: 1 });
    f.player.复活地球.station.contribution = 12;
    f.command('申请 接应 确认');
    f.command('接应预算 60');
    if (borrow) f.command('透支 10 确认');
    let calls = 0;
    assert.equal(f.command('探索 地表采药 确认', 0, { random: () => calls++ === 0 ? 0 : 0.55 }).ok, true);
    assert.equal(f.player.复活地球.action.rescueChance, borrow ? 0.5 : 0.6);
    f.finish();
    assert.equal(f.player.复活地球.place, borrow ? '塔监狱' : '空间站');
    assert.equal(f.player.复活地球.body.realm, 0);
    assert.equal(f.player.复活地球.station.relay, true);
  }
});

test('透支额度和一次性费用明确，追加透支不刷新缓冲，同消息不重复到账', () => {
  const f = fixture({ realm: 1 });
  f.player.复活地球.credits = 0;
  for (const text of ['透支 0 确认', '透支 11 确认', '透支 130 确认', '透支 NaN 确认', '透支 60']) {
    const before = structuredClone(f.player);
    assert.equal(f.command(text).changed, false, text);
    assert.deepEqual(f.player, before);
  }
  assert.equal(f.command('透支 60 确认', 0.99, { requestId: 'loan' }).ok, true);
  assert.equal(f.command('透支 60 确认', 0.99, { requestId: 'loan' }).changed, false);
  assert.equal(f.player.复活地球.credits, 60);
  assert.equal(f.player.复活地球.station.debt, 66);
  f.act('修炼');
  assert.equal(f.player.复活地球.station.grace, 2);
  assert.equal(f.command('透支 60 确认').ok, true);
  assert.equal(f.player.复活地球.station.debt, 132);
  assert.equal(f.player.复活地球.station.grace, 2);
  assert.equal(f.command('透支 10 确认').ok, false);
  const before = structuredClone(f.player);
  f.setNow(9_999_999_999);
  for (const text of ['站务', '状态', '履历']) assert.equal(f.command(text).ok, true);
  assert.deepEqual(f.player, before);
});

test('欠款三次非工作行动后进入审查，工作和部分还款不制造新缓冲', () => {
  const f = fixture({ realm: 1 });
  f.player.复活地球.credits = 0;
  f.command('透支 120 确认');
  for (let i = 0; i < 3; i++) f.act('修炼');
  assert.equal(f.player.复活地球.station.grace, 0);
  const before = structuredClone(f.player);
  for (const text of ['修炼', '探索 地表采药 确认', '透支 10 确认', '申请 配给 确认']) {
    assert.equal(f.command(text).ok, false);
  }
  assert.deepEqual(f.player, before);
  f.act('工作 复活值守');
  assert.equal(f.player.复活地球.station.debt, 92);
  assert.equal(f.player.复活地球.credits, 70);
  f.command('还款 20');
  assert.equal(f.player.复活地球.station.debt, 72);
  assert.equal(f.player.复活地球.station.grace, 0);
  for (const text of ['还款 0', '还款 -1', '还款 9007199254740993', '还款 73']) assert.equal(f.command(text).ok, false);
  f.act('工作 复活值守');
  f.act('工作 复活值守');
  assert.equal(f.player.复活地球.station.debt, 0);
  assert.equal(f.command('修炼').ok, true);
});

test('审查中零积分仍能工作还款，委托收入也优先偿债', () => {
  const f = fixture();
  Object.assign(f.player.复活地球.station, { debt: 66, grace: 0 });
  f.player.复活地球.credits = 0;
  f.act('工作 复活值守');
  assert.equal(f.player.复活地球.station.debt, 26);
  assert.equal(f.player.复活地球.credits, 0);
  f.command('委托 医疗补给');
  f.command('交付委托');
  assert.equal(f.player.复活地球.station.debt, 0);
  assert.equal(f.player.复活地球.credits, 19);
  assert.equal(f.player.复活地球.station.grace, 0);
});

test('接受清退需要独立确认，真死亡回塔、债务保留，重复消息不再死亡', () => {
  const f = fixture({ realm: 3, phase: 2, cultivation: 150 });
  Object.assign(f.player.复活地球.station, { debt: 66, grace: 0, resident: true });
  f.player.复活地球.storage.灵植 = 15;
  const before = structuredClone(f.player);
  assert.match(f.command('接受清退').message, /清空本世境界/);
  assert.equal(f.command('接受清退 暂缓 确认').ok, false);
  assert.deepEqual(f.player, before);
  assert.equal(f.command('接受清退 确认', 0.99, { requestId: 'evict' }).ok, true);
  assert.equal(f.player.复活地球.place, '塔监狱');
  assert.equal(f.player.复活地球.body.realm, 0);
  assert.deepEqual(f.player.复活地球.bag, {});
  assert.equal(f.player.复活地球.station.debt, 66);
  assert.equal(f.player.复活地球.storage.灵植, 15);
  assert.equal(f.player.复活地球.station.resident, true);
  assert.equal(f.player.复活地球.credits, before.复活地球.credits);
  assert.equal(f.command('接受清退 确认', 0.99, { requestId: 'evict' }).changed, false);
  assert.equal(f.player.复活地球.deaths, 1);
  assert.equal(f.player.复活地球.deathRecords[0].mode, '确认清退');
  assert.match(f.command('复盘').message, /已确认清退，直接死亡回塔/);
});

test('最后一次缓冲可完成整趟外勤，中途不追费、返站才受审查限制', () => {
  const f = fixture({ realm: 1 });
  Object.assign(f.player.复活地球.station, { debt: 11, grace: 1 });
  f.act('探索 地表采药 确认');
  const credits = f.player.复活地球.credits;
  assert.equal(f.player.复活地球.station.grace, 0);
  assert.equal(f.player.复活地球.place, '地表');
  f.act('应对 隐蔽 确认');
  f.act('撤离 确认');
  assert.equal(f.player.复活地球.credits, credits);
  assert.equal(f.command('探索 地表采药 确认').ok, false);
  assert.equal(f.command('还款 11').ok, true);
  assert.equal(f.command('探索 地表采药 确认').ok, true);
});

test('缓冲尚未耗尽也须结清欠款再离界，预览不借接引丢债', () => {
  const f = fixture({ realm: 5 });
  f.player.复活地球.knowledge.离界坐标 = true;
  f.player.复活地球.facilities.接引装置 = true;
  f.command('透支 60 确认');
  const before = structuredClone(f.player);
  assert.equal(f.command('离界 确认').ok, false);
  assert.deepEqual(f.player, before);
  assert.equal(f.command('还款 66').ok, true);
  assert.equal(f.command('离界 确认').ok, true);
});

test('死亡复盘保存当世选择、旧境界和货损，查询不读档复活或写状态', () => {
  const f = fixture({ realm: 2, phase: 3, cultivation: 180 });
  f.act('探索 塔底调查 确认');
  f.act('应对 隐蔽 确认');
  const beforeBody = structuredClone(f.player.复活地球.body);
  f.act('撤离 确认', 0);
  const record = f.player.复活地球.deathRecords.at(-1);
  assert.deepEqual(record.body, beforeBody);
  assert.equal(record.cargo.黑雾样本, 1);
  assert.deepEqual(record.discoveries, ['佛道传承']);
  assert.equal(record.mode, '积分接应');
  assert.equal(record.spent, 60);
  assert.deepEqual(record.decisions.map(item => item.command), ['探索 塔底调查 确认', '应对 隐蔽 确认', '撤离 确认']);
  assert.deepEqual(f.player.复活地球.lifeTrace, []);
  const before = structuredClone(f.player);
  assert.match(f.command('复盘 1').message, /筑基大圆满/);
  assert.match(f.command('死亡记录').message, /第1世/);
  assert.equal(f.command('复盘 999').ok, false);
  assert.equal(f.command('复盘 NaN').ok, false);
  assert.deepEqual(f.player, before);
});

test('复盘限制为最近20世，本世决策保留24条，旧记录不影响死亡总数', () => {
  const f = fixture();
  f.player.复活地球.place = '塔监狱';
  for (let i = 0; i < 22; i++) f.act('观察 规章');
  assert.equal(f.player.复活地球.deaths, 22);
  assert.equal(f.player.复活地球.deathRecords.length, 20);
  assert.equal(f.player.复活地球.deathRecords[0].life, 3);
  assert.equal(f.command('复盘 1').ok, false);
  assert.equal(f.command('复盘 22').ok, true);
  assert.match(f.command('复盘 22').message, /塔内周期性死亡/);
  assert.doesNotMatch(f.command('复盘 22').message, /主动接受清退|已确认清退/);
  const g = fixture();
  for (let i = 0; i < 13; i++) {
    g.command('透支 10 确认');
    g.command('还款 11');
  }
  assert.equal(g.player.复活地球.lifeTrace.length, 24);
  assert.equal(g.player.复活地球.history.length, 8);
});

function downgradeV2(f) {
  const s = downgradeV3(f);
  s.version = 2;
  for (const key of ['event', 'stale', 'escort']) delete s.tower[key];
  for (const key of ['resident', 'rationed', 'relay', 'debt', 'grace']) delete s.station[key];
  delete s.lifeTrace;
  delete s.deathRecords;
  if (s.action) {
    s.action.rulesVersion = 2;
    delete s.action.livingCost;
    delete s.action.rescueChance;
  }
  return s;
}

test('v2待结算交谈按旧约定直接取得协作，不追收生活费或追加事件', () => {
  const f = fixture();
  f.player.复活地球.place = '塔监狱';
  f.act('观察');
  f.command('交谈');
  const s = downgradeV2(f);
  const before = structuredClone(f.player);
  for (const text of ['事件', '站务', '死亡记录', '履历']) assert.equal(f.command(text).ok, true);
  assert.deepEqual(f.player, before);
  const credits = s.credits;
  f.finish();
  assert.equal(f.player.复活地球.version, 7);
  assert.equal(f.player.复活地球.tower.ally, true);
  assert.equal(f.player.复活地球.tower.event, null);
  assert.equal(f.player.复活地球.credits, credits);
  assert.deepEqual(f.player.复活地球.deathRecords, []);
});

test('v2待结算外勤仍沿用原风险与接应计费，不为升级额外扣生活费', () => {
  const f = fixture({ realm: 1 });
  f.command('探索 地表采药 确认', 0);
  downgradeV2(f);
  const credits = f.player.复活地球.credits;
  f.finish();
  assert.equal(f.player.复活地球.credits, credits - 60);
  assert.equal(f.player.复活地球.body.realm, 0);
  assert.equal(f.player.复活地球.deathRecords.at(-1).legacyRescue, false);
  assert.equal(f.player.复活地球.station.debt, 0);
});

test('新制输入损坏暂停操作，不抹掉债务、复盘或资格', () => {
  for (const damage of [
    s => { s.station.debt = -1; },
    s => { s.station.grace = 4; },
    s => { s.station.grace = 1; },
    s => { s.station.resident = 'yes'; },
    s => { s.tower.event = ['读数矛盾']; },
    s => { s.tower.stale = true; },
    s => { delete s.lifeTrace; },
    s => { s.deathRecords = [{ life: 1 }]; },
    s => { s.lifeTrace = [{ at: 1, command: '伪造', message: null }]; },
  ]) {
    const f = fixture();
    damage(f.player.复活地球);
    const before = structuredClone(f.player);
    assert.equal(f.command('状态').ok, false);
    assert.equal(f.command('透支 60 确认').ok, false);
    assert.deepEqual(f.player, before);
  }
});

test('真实命令类对资格与透支幂等，落盘失败不宣告借款或清退成功', async () => {
  const f = fixture();
  const loan = appFixture(f.player);
  await Promise.all([loan.send('#复活地球 透支 60 确认', 'loan'), loan.send('#复活地球 透支 60 确认', 'loan')]);
  assert.equal(loan.writes(), 1);
  assert.equal(loan.disk().复活地球.station.debt, 66);
  assert.equal(loan.disk().复活地球.credits, 100060);
  f.player.复活地球.station.contribution = 4;
  const permit = appFixture(f.player);
  await Promise.all([
    permit.send('#复活地球 申请 配给 确认', 'permit'),
    permit.send('#复活地球 申请 配给 确认', 'permit'),
  ]);
  assert.equal(permit.writes(), 1);
  assert.equal(permit.disk().复活地球.credits, 99980);
  assert.equal(permit.disk().复活地球.station.rationed, true);
  const failedLoan = appFixture(f.player, { failWrite: true });
  await failedLoan.send('#复活地球 透支 60 确认', 'loan');
  assert.equal(failedLoan.disk().复活地球.station.debt, 0);
  assert.match(failedLoan.replies.at(-1), /未确认完成/);
  Object.assign(f.player.复活地球.station, { debt: 66, grace: 0 });
  const failedEviction = appFixture(f.player, { failWrite: true });
  await failedEviction.send('#复活地球 接受清退 确认', 'evict');
  assert.deepEqual(failedEviction.disk(), f.player);
  assert.equal(failedEviction.disk().复活地球.deathRecords.length, 0);
});

test('100个固定种子走塔事件、借款审查与一次外勤，无零余额软锁或重复结算', t => {
  let expeditionDeaths = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const player = newPlayer();
    let rng = seed;
    let now = 1000;
    const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
    const send = text => {
      const result = earth.runRevivalCommand(player, text, { now, random });
      assert.equal(result.ok, true, `seed ${seed} ${text}: ${result.message}`);
      if (player.复活地球.action) {
        now = player.复活地球.action.endAt;
        assert.equal(earth.runRevivalCommand(player, '结算', { now, random }).ok, true);
      }
    };
    send('入界 确认');
    for (let turn = 0; player.复活地球.place === '塔监狱' && turn < 120; turn++) {
      const tower = player.复活地球.tower;
      if (tower.clues.length < 3 || !tower.calibrated) send('观察');
      else if (tower.event) send(`抉择 ${{ 读数矛盾: '共同核验', 轮换分离: '个人窗口', 同号名册: '逐页对照', 熄灯点名: '手抄核对' }[tower.event]} 确认`);
      else if (!tower.ally) send('交谈');
      else if (!tower.window) send('推演');
      else if (tower.window === 1) send('候时');
      else send('越狱 确认');
    }
    assert.equal(player.复活地球.place, '空间站');
    send('工作');
    send('透支 60 确认');
    send('研读');
    send('修炼');
    send('修炼');
    assert.equal(player.复活地球.station.grace, 0);
    for (let job = 0; player.复活地球.station.debt && job < 4; job++) send('工作');
    assert.equal(player.复活地球.station.debt, 0);
    const deaths = player.复活地球.deaths;
    send('探索 地表采药 确认');
    if (player.复活地球.expedition?.signal) send('抉择 绕开信号 确认');
    if (player.复活地球.expedition) send('应对 隐蔽 确认');
    if (player.复活地球.expedition) send('撤离 确认');
    assert.equal(player.复活地球.expedition, null);
    assert.equal(player.复活地球.action, null);
    expeditionDeaths += player.复活地球.deaths - deaths;
    const before = structuredClone(player);
    assert.equal(earth.runRevivalCommand(player, '结算', { now, random }).ok, false);
    assert.deepEqual(player, before);
    assert.equal(earth.runRevivalCommand(player, '状态', { now, random }).ok, true);
  }
  assert.ok(expeditionDeaths > 0 && expeditionDeaths < 100);
  t.diagnostic(`100个种子的单次外勤死亡数：${expeditionDeaths}；这是回归烟测，不是全成长平衡结论。`);
});

for (const route of ['化凡', '信仰']) {
test(`从零物资开局走完${route}支线与仙界接引，没有测试注入物资或境界`, () => {
  const player = newPlayer();
  let now = 1000;
  const send = text => {
    const result = earth.runRevivalCommand(player, text, { now, random: () => 0.99 });
    assert.equal(result.ok, true, `${text}: ${result.message}`);
    if (player.复活地球?.action) {
      now = player.复活地球.action.endAt;
      const settled = earth.runRevivalCommand(player, '结算', { now });
      assert.equal(settled.ok, true, settled.message);
    }
  };
  const finance = amount => {
    while (player.复活地球.credits < amount) send('工作');
  };
  const explore = target => {
    finance(1000);
    send(`探索 ${target} 确认`);
    send('应对 隐蔽 确认');
    send('撤离 确认');
  };
  const fill = () => {
    const s = player.复活地球;
    while (player.复活地球.body.cultivation < earth.REVIVAL_STUDY_NEED[s.body.realm]) {
      finance(1000);
      if (!player.复活地球.bag.灵植) send('工作');
      send('修炼');
    }
  };
  const completeMinorStages = () => {
    for (let i = 0; i < 3; i++) { fill(); send('突破'); }
    fill();
  };
  send('入界 确认');
  for (let i = 0; i < 3; i++) send('观察');
  send('交谈');
  send('抉择 个人窗口 确认');
  send('推演');
  send('候时');
  send('越狱 确认');
  send('研读');
  send('工作');
  send('修炼');
  completeMinorStages();
  explore('地表采药');
  explore('废站勘探');
  send('制作 丹炉');
  send('制作 筑基丹');
  send('突破');
  completeMinorStages();
  explore('废站勘探');
  explore('废站勘探');
  send('制作 本命法器');
  send('制作 持续火种');
  explore('古木遗址');
  for (let i = 0; i < 3; i++) explore('极寒地带');
  for (const element of ['金', '木', '水', '火', '土']) {
    for (let i = 0; i < 3; i++) { finance(1000); send(`蕴养 ${element}`); }
  }
  send('突破');
  completeMinorStages();
  explore('塔底调查');
  explore('道门试炼');
  send('突破 确认');
  completeMinorStages();
  if (route === '化凡') {
    send('化神 化凡');
    for (const choice of ['顶替夜班', '跑腿换药', '手抄守候']) {
      finance(1000);
      send('化凡');
      send(`抉择 ${choice} 确认`);
    }
    send('立愿 建立接应站庇护仍在地表挣扎的人');
  } else {
    send('化神 信仰');
    explore('图腾寻访');
    explore('废站勘探');
    send('凝聚图腾');
    finance(1000);
    send('寻访信众');
    for (const choice of ['轮值耕作', '承认局限', '停供守夜', '交接轮值']) {
      finance(1000);
      if (!player.复活地球.bag.灵植) send('工作');
      send('传道');
      send(`抉择 ${choice} 确认`);
    }
  }
  finance(1000);
  send('突破');
  explore('离界测绘');
  while ((player.复活地球.bag.工程部件 || 0) < 12 || (player.复活地球.bag.燃料 || 0) < 6) explore('废站勘探');
  finance(505);
  send('制作 接引装置');
  send('离界 确认');
  assert.equal(player.复活地球.status, 'ascended');
  assert.equal(player.复活地球.body.realm, 5);
  assert.equal(player.level_id, 42);
  assert.equal(player.power_place, 1);
  assert.equal(player.复活地球.deaths, 4);
  assert.equal(player.灵石, 12345);
});
}

function pathFixture(route) {
  const f = fixture({ realm: 4, phase: 3, cultivation: 480 });
  assert.equal(f.command(`化神 ${route}`).ok, true);
  if (route === '信仰') {
    f.act('凝聚图腾');
    f.act('寻访信众');
  }
  return f;
}

test('化凡/传道只触发待选事件，预览、错误选项与重复发起不变更进度或抽随机', () => {
  for (const [route, verb, event, choice] of [
    ['化凡', '化凡', '借来的床位', '匀出配给'],
    ['信仰', '传道', '饥年供桌', '分粮共食'],
  ]) {
    const f = pathFixture(route);
    f.act(verb);
    assert.equal(f.player.复活地球.body.pathEvent, event);
    assert.equal(f.player.复活地球.body.mortalSteps, 0);
    assert.equal(f.player.复活地球.body.faith, 0);
    const before = structuredClone(f.player);
    const noRandom = { random: () => { throw Error('预览不抽随机'); } };
    for (const query of ['事件', '状态']) {
      const result = f.command(query, 0, noRandom);
      assert.equal(result.ok, true);
      assert.match(result.message, new RegExp(event));
    }
    assert.match(f.command('事件').message, /插件改编/);
    for (const text of [verb, '突破', '立愿 守护身边仍在等待的人', '抉择 __proto__ 确认',
      '抉择 constructor 确认', `抉择 ${choice}`, `抉择 ${choice} 多余 确认`]) {
      const result = f.command(text, 0, noRandom);
      assert.equal(result.ok, false, text);
      assert.doesNotMatch(result.message, /预览不抽随机/);
    }
    assert.deepEqual(f.player, before);
  }
});

test('24种化凡/信仰抉择组合均可完成，先前承诺实际改变后续积分、物资或时长', () => {
  for (const [route, groups] of [
    ['化凡', [['匀出配给', '顶替夜班'], ['购买药包', '跑腿换药'], ['留存名册', '手抄守候']]],
    ['信仰', [['分粮共食', '轮值耕作'], ['送药守约', '承认局限'], ['仪器复核', '停供守夜'], ['交接轮值', '留下手册']]],
  ]) {
    for (let mask = 0; mask < 2 ** groups.length; mask++) {
      const choices = groups.map((group, i) => group[(mask >> i) & 1]);
      const expected = {
        匀出配给: [10, 10, { 灵植: 1 }], 顶替夜班: [45, 0, {}],
        购买药包: [10, choices[0] === '顶替夜班' ? 15 : 30, {}],
        跑腿换药: [choices[0] === '匀出配给' ? 30 : 60, 0, {}],
        留存名册: [10, 20, { 工程部件: 1 }], 手抄守候: [60, 0, {}],
        分粮共食: [10, 0, { 灵植: 3 }], 轮值耕作: [60, 0, {}],
        送药守约: [10, 0, { 灵植: choices[0] === '轮值耕作' ? 2 : 4 }],
        承认局限: [choices[0] === '分粮共食' ? 30 : 60, 0, {}],
        仪器复核: [15, 10, { 工程部件: 2 }], 停供守夜: [60, 0, {}],
        交接轮值: [choices[1] === '送药守约' ? 30 : 60, 0, {}],
        留下手册: [15, choices[2] === '仪器复核' ? 0 : 10, { 工程部件: 1 }],
      };
      const f = pathFixture(route);
      for (const [i, choice] of choices.entries()) {
        f.act(route === '化凡' ? '化凡' : '传道');
        const startAt = f.player.复活地球.history.at(-1).at;
        const before = structuredClone(f.player.复活地球);
        const [minutes, credits, items] = expected[choice];
        const result = f.command(`抉择 ${choice} 确认`);
        assert.equal(result.ok, true, `${choices}: ${result.message}`);
        const during = f.player.复活地球;
        assert.equal(during.action.endAt - startAt, minutes * 60_000, choice);
        assert.equal(during.action.livingCost, 0);
        assert.equal(during.credits, before.credits - credits);
        for (const name of earth.REVIVAL_ITEMS) {
          assert.equal(during.bag[name], before.bag[name] - (items[name] || 0), `${choice}:${name}`);
        }
        assert.equal(during.body.pathChoices.length, i);
        assert.equal(during.body.mortalSteps, route === '化凡' ? i : 0);
        assert.equal(during.body.faith, route === '信仰' ? i * 25 : 0);
        f.finish();
        const after = f.player.复活地球;
        assert.equal(after.body.pathEvent, null);
        assert.equal(after.body.pathChoices.length, i + 1);
        assert.equal(after.body.mortalSteps, route === '化凡' ? i + 1 : 0);
        assert.equal(after.body.faith, route === '信仰' ? (i + 1) * 25 : 0);
        assert.equal(after.station.contribution, 0);
        assert.equal(after.deaths, 0);
        assert.equal(after.body.realm, 4);
        assert.match(after.lifeTrace.at(-1).command, /抉择兑现/);
      }
      if (route === '化凡') assert.equal(f.command('立愿 为仍在等待的人留下接应与见证').ok, true);
      f.act('突破');
      assert.equal(f.player.复活地球.body.realm, 5);
      assert.match(f.command('事件').message, /化神已经完成/);
    }
  }
});

test('化凡后段展示前次抉择回响，旧段记录不伪造新同伴', () => {
  for (const [first, second, echo] of [
    ['匀出配给', '购买药包', /亲口托付姓名/],
    ['顶替夜班', '跑腿换药', /空病床/],
  ]) {
    const f = pathFixture('化凡');
    f.episode('化凡', first);
    f.act('化凡');
    assert.match(f.command('事件').message, first === '匀出配给' ? /程禾赶来/ : /药房同意抵扣/);
    f.act(`抉择 ${second} 确认`);
    f.act('化凡');
    assert.match(f.command('事件').message, echo);
  }
  const f = pathFixture('化凡');
  downgradeV3(f).body.mortalSteps = 2;
  f.act('化凡');
  assert.match(f.command('事件').message, /旧版已取得进度/);
  assert.doesNotMatch(f.command('事件').message, /回响：/);
});

test('缺资源的待选事件不扣半笔费用，零余额工作与仓储仍可用于补足材料', () => {
  const f = pathFixture('化凡');
  f.act('化凡');
  f.player.复活地球.credits = 0;
  f.player.复活地球.bag.灵植 = 0;
  const before = structuredClone(f.player);
  assert.equal(f.command('抉择 匀出配给 确认').ok, false);
  assert.deepEqual(f.player, before);
  f.act('工作');
  assert.equal(f.player.复活地球.credits, 30);
  assert.equal(f.player.复活地球.body.pathEvent, '借来的床位');
  f.command('存入 灵植 2');
  const missingHerb = structuredClone(f.player);
  assert.match(f.command('抉择 匀出配给 确认').message, /随身物资缺少/);
  assert.deepEqual(f.player, missingHerb);
  assert.equal(f.command('取出 灵植 1').ok, true);
  f.act('抉择 匀出配给 确认');
  assert.equal(f.player.复活地球.credits, 20);
  assert.equal(f.player.复活地球.body.mortalSteps, 1);
});

test('抉择不再计生活费或消耗缓冲，但审查到期后须先工作还款，旧行动仍可结算', () => {
  const f = pathFixture('化凡');
  f.command('透支 30 确认');
  f.episode('化凡', '顶替夜班');
  assert.equal(f.player.复活地球.station.grace, 2);
  f.episode('化凡', '跑腿换药');
  assert.equal(f.player.复活地球.station.grace, 1);
  f.act('化凡');
  assert.equal(f.player.复活地球.station.grace, 0);
  assert.equal(f.player.复活地球.body.pathEvent, '无回音的接应');
  const before = structuredClone(f.player);
  assert.match(f.command('抉择 手抄守候 确认').message, /清退审查/);
  assert.deepEqual(f.player, before);
  f.act('工作 复活值守');
  assert.equal(f.player.复活地球.station.debt, 0);
  assert.equal(f.player.复活地球.body.pathEvent, '无回音的接应');
  const credits = f.player.复活地球.credits;
  f.act('抉择 手抄守候 确认');
  assert.equal(f.player.复活地球.credits, credits);
  assert.equal(f.player.复活地球.body.mortalSteps, 3);
});

test('动用修为清除已兑现经历、待选事件和后续协助，但不退款且单世路线保留', () => {
  const f = pathFixture('化凡');
  f.episode('化凡', '匀出配给');
  f.act('化凡');
  for (const text of ['救援 确认', '制作 探测器', '探索 离界测绘 确认']) assert.equal(f.command(text).ok, false);
  const before = structuredClone(f.player);
  assert.equal(f.command('动用修为').ok, false);
  assert.deepEqual(f.player, before);
  assert.equal(f.command('动用修为 确认').ok, true);
  const s = f.player.复活地球;
  assert.equal(s.body.pathEvent, null);
  assert.deepEqual(s.body.pathChoices, []);
  assert.equal(s.body.mortalSteps, 0);
  assert.equal(s.body.path, '');
  assert.equal(s.body.chosenPath, '化凡');
  assert.equal(s.credits, before.复活地球.credits);
  assert.deepEqual(s.bag, before.复活地球.bag);
  assert.equal(f.command('抉择 跑腿换药 确认').ok, false);
  assert.equal(f.command('化神 信仰').ok, false);
  assert.equal(f.command('化神 化凡').ok, true);
  f.act('化凡');
  assert.equal(f.player.复活地球.body.pathEvent, '借来的床位');
  assert.doesNotMatch(f.command('事件').message, /回响：/);
  f.act('抉择 顶替夜班 确认');
  f.episode('化凡', '跑腿换药');
  f.episode('化凡', '手抄守候');
  assert.equal(f.command('立愿 为仍在等待的人留下接应与见证').ok, true);
  assert.equal(f.command('动用修为 确认').ok, true);
  assert.equal(f.player.复活地球.body.vow, '');
  assert.deepEqual(f.player.复活地球.body.pathChoices, []);
});

test('抉择进行中锁定选择与动用修为，完成后重复点击不再奖励', () => {
  const f = pathFixture('化凡');
  f.act('化凡');
  assert.equal(f.command('抉择 匀出配给 确认').ok, true);
  const before = structuredClone(f.player);
  for (const text of ['抉择 顶替夜班 确认', '动用修为 确认', '化凡', '突破']) {
    assert.match(f.command(text).message, /已有行动/);
  }
  assert.deepEqual(f.player, before);
  f.finish();
  const completed = structuredClone(f.player);
  assert.equal(f.command('抉择 匀出配给 确认').ok, false);
  assert.equal(f.command('结算').ok, false);
  assert.deepEqual(f.player, completed);
});

test('信仰待选事件随外勤保留，地表先撤离，再到站兑现而非远程交付', () => {
  const f = pathFixture('信仰');
  f.act('传道');
  f.act('探索 离界测绘 确认');
  assert.match(f.command('事件').message, /先完成外勤撤离/);
  const before = structuredClone(f.player);
  assert.equal(f.command('抉择 分粮共食 确认').ok, false);
  assert.deepEqual(f.player, before);
  f.act('撤离 确认');
  assert.equal(f.player.复活地球.body.pathEvent, '饥年供桌');
  f.act('抉择 分粮共食 确认');
  assert.equal(f.player.复活地球.body.faith, 25);
});

test('死亡清除本世事件与承诺，复盘保留失去的经历而信众联系不变', () => {
  const f = pathFixture('信仰');
  f.episode('传道', '轮值耕作');
  f.act('传道');
  const lost = structuredClone(f.player.复活地球.body);
  f.act('救援 确认', 0);
  const s = f.player.复活地球;
  assert.deepEqual(s.body, earth.createRevivalState().body);
  assert.deepEqual(s.deathRecords.at(-1).body, lost);
  assert.equal(s.knowledge.信众群体, true);
  assert.equal(s.place, '空间站');
  assert.match(f.command('复盘').message, /病榻祈求/);
  assert.match(f.command('复盘').message, /饥年供桌 → 轮值耕作/);
  assert.match(f.command('复盘').message, /信仰25\/100/);
  assert.equal(f.command('抉择 送药守约 确认').ok, false);
});

test('v1/v2/v3待结算化凡、传道与化神闭关兑现原进度，不强塞事件或补收费用', () => {
  for (const downgrade of [downgradeFixture, downgradeV2, downgradeV3]) {
    for (const route of ['化凡', '信仰']) {
      for (const kind of [route === '化凡' ? 'mortal' : 'preach', 'breakthrough']) {
        const f = pathFixture(route);
        const s = downgrade(f);
        const ready = kind === 'breakthrough';
        Object.assign(s.body, {
          mortalSteps: route === '化凡' ? (ready ? 3 : 1) : 0,
          faith: route === '信仰' ? (ready ? 100 : 25) : 0,
          vow: ready && route === '化凡' ? '为仍在等待的人留下接应与见证' : '',
        });
        s.action = { kind, title: '旧版进行中的经历', endAt: 1000, roll: 0.99, rescueRoll: 0 };
        if (ready) Object.assign(s.action, { gate: 'spirit', risk: 0 });
        if (s.version >= 2) s.action.rulesVersion = s.version;
        if (s.version === 3) Object.assign(s.action, { rescueChance: 0.5, livingCost: 5 });
        const before = structuredClone(f.player);
        assert.equal(f.command('事件').ok, true);
        assert.deepEqual(f.player, before);
        const result = f.command('结算', 0, { random: () => { throw Error('旧行动不补随机'); } });
        assert.equal(result.ok, true, result.message);
        const after = f.player.复活地球;
        assert.equal(after.version, 7);
        assert.equal(after.body.pathEvent, null);
        assert.deepEqual(after.body.pathChoices, []);
        assert.equal(after.credits, before.复活地球.credits);
        assert.deepEqual(after.bag, before.复活地球.bag);
        assert.equal(after.body.realm, ready ? 5 : 4);
        if (!ready) assert.equal(route === '化凡' ? after.body.mortalSteps : after.body.faith, route === '化凡' ? 2 : 50);
      }
    }
  }
});

test('v3化凡愿文与99点旧信仰保留，只读和预览不迁移，尾段不追补早期承诺', () => {
  const f = pathFixture('化凡');
  const old = downgradeV3(f);
  Object.assign(old.body, { mortalSteps: 3, vow: '为仍在等待的人留下接应与见证' });
  const before = structuredClone(f.player);
  for (const query of ['状态', '事件', '履历', '死亡记录']) assert.equal(f.command(query).ok, true);
  assert.equal(f.command('抉择 手抄守候 确认').ok, false);
  assert.deepEqual(f.player, before);
  f.act('突破');
  assert.equal(f.player.复活地球.body.vow, before.复活地球.body.vow);
  assert.equal(f.player.复活地球.body.realm, 5);
  const faith = pathFixture('信仰');
  downgradeV3(faith).body.faith = 99;
  faith.act('传道');
  assert.equal(faith.player.复活地球.body.pathEvent, '送别之约');
  assert.equal(faith.player.复活地球.body.faith, 99);
  assert.doesNotMatch(faith.command('事件').message, /回响：/);
  faith.act('抉择 交接轮值 确认');
  assert.equal(faith.player.复活地球.body.faith, 100);
  assert.equal(faith.player.复活地球.body.pathChoices.length, 1);
  faith.act('突破');
  assert.equal(faith.player.复活地球.body.realm, 5);
});

test('v3塔内交谈与已确认同行选择保持新人物事件语义，未回落旧版分支', () => {
  const f = fixture();
  f.player.复活地球.place = '塔监狱';
  for (let i = 0; i < 3; i++) f.act('观察');
  f.command('交谈');
  downgradeV3(f);
  f.finish();
  assert.equal(f.player.复活地球.tower.event, '轮换分离');
  assert.equal(f.player.复活地球.tower.ally, false);
  f.command('抉择 共用窗口 确认');
  downgradeV3(f);
  f.finish();
  assert.equal(f.player.复活地球.tower.escort, true);
  f.act('推演');
  f.command('越狱 确认');
  downgradeV3(f);
  const oldDeaths = structuredClone(f.player.复活地球.deathRecords);
  assert.match(f.command('复盘 1').message, /没有本版记录/);
  f.finish();
  assert.equal(f.player.复活地球.station.contribution, 3);
  assert.deepEqual(f.player.复活地球.deathRecords.slice(0, -1), oldDeaths);
});

test('两条经历与抉择跨重启结算，重复消息不重新扣费、抽签或发进度', () => {
  for (const [route, verb, choice] of [['化凡', '化凡', '匀出配给'], ['信仰', '传道', '分粮共食']]) {
    const f = pathFixture(route);
    f.command(verb);
    const restored = JSON.parse(JSON.stringify(f.player));
    const now = restored.复活地球.action.endAt;
    const options = { now, requestId: 'episode', random: () => { throw Error('结算不重抽'); } };
    assert.equal(earth.runRevivalCommand(restored, '结算', options).ok, true);
    const event = structuredClone(restored);
    assert.equal(earth.runRevivalCommand(restored, '结算', options).changed, false);
    assert.deepEqual(restored, event);
    assert.equal(earth.runRevivalCommand(restored, `抉择 ${choice} 确认`, {
      now, requestId: 'choice-start', random: () => 0.99,
    }).ok, true);
    const restarted = JSON.parse(JSON.stringify(restored));
    const prepaid = structuredClone(restarted);
    assert.equal(earth.runRevivalCommand(restarted, `抉择 ${choice} 确认`, {
      ...options, requestId: 'choice-start',
    }).changed, false);
    assert.deepEqual(restarted, prepaid);
    const settleOptions = { ...options, now: restarted.复活地球.action.endAt, requestId: 'choice-finish' };
    assert.equal(earth.runRevivalCommand(restarted, '结算', settleOptions).ok, true);
    assert.equal(restarted.复活地球.body.pathChoices.length, 1);
    assert.equal(restarted.复活地球.credits, prepaid.复活地球.credits);
    const completed = structuredClone(restarted);
    assert.equal(earth.runRevivalCommand(restarted, '结算', settleOptions).changed, false);
    assert.deepEqual(restarted, completed);
  }
});

test('损坏事件、越段记录与错配抉择行动均暂停且保留原快照', () => {
  const f = pathFixture('化凡');
  f.episode('化凡', '匀出配给');
  f.act('化凡');
  for (const damage of [
    s => { delete s.body.pathChoices; },
    s => { s.body.pathChoices = {}; },
    s => { s.body.pathChoices.push({ ...s.body.pathChoices[0] }); },
    s => { s.body.pathChoices[0].event = '病榻祈求'; },
    s => { s.body.pathChoices[0].choice = '__proto__'; },
    s => { s.body.pathChoices[0].event = '无回音的接应'; },
    s => { s.body.pathEvent = '借来的床位'; },
    s => { s.body.pathEvent = ['断药名单']; },
    s => { s.body.realm = 5; },
    s => { s.action = { kind: 'pathChoice', event: '断药名单', choice: '手抄守候', rulesVersion: 4,
      livingCost: 0, rescueChance: 0.5, endAt: 1000, roll: 0.5, rescueRoll: 0.5 }; },
    s => { s.action = { kind: 'pathChoice', event: '断药名单', choice: '购买药包', rulesVersion: 3,
      livingCost: 0, rescueChance: 0.5, endAt: 1000, roll: 0.5, rescueRoll: 0.5 }; },
    s => { s.action = { kind: 'pathChoice', event: '断药名单', choice: '购买药包', rulesVersion: 4, risk: 1,
      livingCost: 0, rescueChance: 0.5, endAt: 1000, roll: 0.5, rescueRoll: 0.5 }; },
    s => { s.body.pathEvent = null; s.action = { kind: 'mortal', event: '断药名单', rulesVersion: 4, risk: 1,
      livingCost: 5, rescueChance: 0.5, endAt: 1000, roll: 0.5, rescueRoll: 0.5 }; },
    s => { s.action = { kind: 'mortal', event: '断药名单', rulesVersion: 4,
      livingCost: 5, rescueChance: 0.5, endAt: 1000, roll: 0.5, rescueRoll: 0.5 }; },
  ]) {
    const player = structuredClone(f.player);
    damage(player.复活地球);
    const before = structuredClone(player);
    for (const command of ['状态', '事件', '工作', '结算']) {
      assert.equal(earth.runRevivalCommand(player, command, { now: 1000 }).ok, false, command);
      assert.deepEqual(player, before);
    }
  }
});

test('实际入口并发抉择与兑现各写一次，落盘失败保留费用、待选事件和进度', async () => {
  const f = pathFixture('化凡');
  f.act('化凡');
  const start = appFixture(f.player);
  await Promise.all([
    start.send('#复活地球 抉择 匀出配给 确认', 'path-start'),
    start.send('#复活地球 抉择 匀出配给 确认', 'path-start'),
  ]);
  assert.equal(start.writes(), 1);
  assert.equal(start.disk().复活地球.credits, f.player.复活地球.credits - 10);
  assert.equal(start.disk().复活地球.bag.灵植, f.player.复活地球.bag.灵植 - 1);
  assert.equal(start.disk().复活地球.body.mortalSteps, 0);
  const failedStart = appFixture(f.player, { failWrite: true });
  await failedStart.send('#复活地球 抉择 匀出配给 确认', 'failed-start');
  assert.deepEqual(failedStart.disk(), f.player);
  assert.match(failedStart.replies.at(-1), /未确认完成/);
  f.command('抉择 匀出配给 确认');
  const due = appFixture(f.player);
  await Promise.all([due.send('#复活地球 结算', 'path-due'), due.send('#复活地球 结算', 'path-due')]);
  assert.equal(due.writes(), 1);
  assert.equal(due.disk().复活地球.body.mortalSteps, 1);
  assert.equal(due.disk().复活地球.body.pathChoices.length, 1);
  assert.equal(due.disk().复活地球.credits, f.player.复活地球.credits);
  const failedDue = appFixture(f.player, { failWrite: true });
  await failedDue.send('#复活地球 结算', 'failed-due');
  assert.deepEqual(failedDue.disk(), f.player);
  assert.equal(failedDue.disk().复活地球.body.mortalSteps, 0);
});

test('出发前的三种单点全程风险与真实抵达、搜索、撤离行动逐项一致，预览不收费抽签', () => {
  for (const [target, task] of Object.entries(earth.REVIVAL_EXPEDITIONS)) {
    for (const realm of [task.realm, 5]) {
      for (const weapon of [false, true]) {
        for (const mode of ['隐蔽', '法术', '科技']) {
          const f = fixture({ realm });
          f.player.复活地球.body.weapon = weapon;
          f.player.复活地球.knowledge.佛道传承 = true;
          const before = structuredClone(f.player);
          const preview = f.command(`探索 ${target}`, 0, { random: () => { throw Error('预览不抽签'); } });
          assert.equal(preview.changed, false);
          assert.match(preview.message, /单点行程估算/);
          assert.match(preview.message, /三段分别抽签/);
          assert.deepEqual(f.player, before);
          assert.equal(f.command(`探索 ${target} 确认`).ok, true);
          const travel = f.player.复活地球.action.risk;
          f.finish();
          assert.equal(f.command(`应对 ${mode} 确认`).ok, true);
          const search = f.player.复活地球.action.risk;
          f.finish();
          assert.equal(f.command('撤离 确认').ok, true);
          const returning = f.player.复活地球.action.risk;
          const expected = (100 * (1 - (1 - travel) * (1 - search) * (1 - returning))).toFixed(2);
          assert.ok(preview.message.includes(`${mode}：全程死亡风险${expected}%`), `${target}/${realm}/${weapon}/${mode}`);
          f.finish();
        }
      }
    }
  }
});

test('风险展示保留小数及复合概率，不把2.5%舍入成3%，接应资格不降低真死亡率', () => {
  const f = fixture({ realm: 3 });
  f.player.复活地球.body.weapon = true;
  f.player.复活地球.knowledge.佛道传承 = true;
  const preview = f.command('探索 道门试炼').message;
  assert.match(preview, /抵达阶段：本次死亡风险26%/);
  assert.match(preview, /隐蔽：全程死亡风险68\.24%/);
  assert.match(preview, /法术：全程死亡风险72\.43%/);
  assert.match(preview, /科技：全程死亡风险67\.14%/);
  f.player.复活地球.station.relay = true;
  f.player.复活地球.rescueBudget = 300;
  assert.equal(f.command('探索 道门试炼').message, preview);
  const high = fixture({ realm: 5 });
  high.player.复活地球.body.weapon = true;
  assert.match(high.command('探索 地表采药').message, /抵达阶段：本次死亡风险2\.5%/);
  assert.match(high.command('探索 地表采药').message, /隐蔽：全程死亡风险6\.84%/);
});

function signalFixture(pattern = '回声') {
  const f = fixture({ realm: 2, phase: 2, cultivation: 90 });
  const rolls = [0.99, 0.99, pattern === '回声' ? 0.05 : 0.2];
  assert.equal(f.command('探索 塔底调查 确认', 0.99, { random: () => rolls.shift() }).ok, true);
  assert.equal(f.finish().ok, true);
  return f;
}

test('信号总概率保持25%，四类线索边界固定；抵达前不披露线索，查询重启不补抽', () => {
  for (const [roll, expected] of [[0, '回声'], [0.062499, '回声'], [0.0625, '借影'], [0.124999, '借影'], [0.125, '错时'], [0.187499, '错时'], [0.1875, '索名'], [0.249999, '索名'], [0.25, null], [0.99, null]]) {
    const f = fixture({ realm: 2 });
    const rolls = [0.99, 0.7, roll];
    assert.equal(f.command('探索 塔底调查 确认', 0.99, { random: () => rolls.shift() }).ok, true);
    assert.equal(rolls.length, 0);
    assert.equal(f.player.复活地球.expedition.signal?.pattern ?? null, expected);
    assert.equal(f.player.复活地球.action.roll, 0.99);
    assert.equal(f.player.复活地球.action.rescueRoll, 0.7);
    assert.doesNotMatch(f.command('事件').message, /调查线索|接应员只问|耳机里的/);
    const before = structuredClone(f.player);
    const noRandom = () => { throw Error('查询或结算不补抽'); };
    for (const text of ['事件', '外勤', '状态']) assert.equal(f.command(text, 0, { random: noRandom }).ok, true);
    assert.deepEqual(f.player, before);
    const loaded = JSON.parse(JSON.stringify(f.player));
    const result = earth.runRevivalCommand(loaded, '结算', { now: loaded.复活地球.action.endAt, random: noRandom });
    assert.equal(result.ok, true, result.message);
    assert.equal(loaded.复活地球.expedition.signal?.pattern ?? null, expected);
    assert.equal(loaded.复活地球.expedition.stage, 'encounter');
    assert.equal(loaded.复活地球.deaths, 0);
    if (expected) {
      assert.match(result.message, /插件原创/);
      assert.doesNotMatch(result.message, /调查线索|核验记录/);
    }
  }
});

test('可疑信号未决策先拦搜索；调查与核验的线索仅在结算时兑现，零随机值也不新增死亡', () => {
  for (const pattern of ['回声', '索名']) {
    for (const method of ['手工', '科技']) {
      const f = signalFixture(pattern);
      const s = f.player.复活地球;
      const { credits, deaths } = s;
      assert.equal(f.command('应对 隐蔽 确认').ok, false);
      assert.equal(f.command('核验 手工 确认').ok, false);
      assert.equal(f.command('抉择 切断广播 确认').ok, false);
      assert.equal(f.command('调查 信号 确认', 0).ok, true);
      assert.equal(f.player.复活地球.action.risk, 0);
      assert.equal(f.player.复活地球.action.livingCost, 0);
      assert.equal(f.player.复活地球.expedition.window, 4);
      assert.equal(f.player.复活地球.expedition.signal.investigated, false);
      assert.doesNotMatch(f.command('事件').message, /调查线索：/);
      f.finish();
      assert.match(f.command('事件').message, pattern === '回声' ? /上一轮的停顿/ : /只问姓名/);
      assert.equal(f.command('调查 信号 确认').ok, false);
      const now = f.player.复活地球.history.at(-1).at;
      f.command(`核验 ${method} 确认`, 0);
      assert.equal(f.player.复活地球.action.endAt - now, (method === '科技' ? 2 : 5) * 60_000);
      assert.equal(f.player.复活地球.expedition.signal.verified, false);
      assert.doesNotMatch(f.command('事件').message, /核验记录：/);
      f.finish();
      assert.equal(f.player.复活地球.expedition.window, method === '科技' ? 4 : 3);
      assert.equal(f.player.复活地球.bag.探测器, method === '科技' ? 99 : 100);
      assert.match(f.command('事件').message, pattern === '回声' ? /处置规则：切断广播/ : /处置规则：关闭回传/);
      assert.equal(f.player.复活地球.credits, credits);
      assert.equal(f.player.复活地球.deaths, deaths);
      const after = structuredClone(f.player);
      assert.equal(f.command(`核验 ${method} 确认`).ok, false);
      assert.deepEqual(f.player, after);
    }
  }
});

test('正确处置与误判实际改变所有搜索方式及返航风险，预览和保存值一致，处置不二次改选', () => {
  for (const pattern of ['回声', '索名']) {
    for (const choice of ['切断广播', '关闭回传']) {
      for (const mode of ['隐蔽', '法术', '科技']) {
        const f = signalFixture(pattern);
        f.act('调查 信号 确认');
        f.act(`抉择 ${choice} 确认`);
        const correct = choice === (pattern === '回声' ? '切断广播' : '关闭回传');
        const delta = correct ? -0.05 : 0.15;
        assert.match(f.command('事件').message, correct ? /诱导链已截断/ : /暴露给了假接应点/);
        assert.match(f.command('事件').message, /插件原创/);
        const before = structuredClone(f.player);
        for (const text of ['抉择 绕开信号 确认', '抉择 追随信号 确认', '核验 科技 确认', '调查 信号 确认']) {
          assert.equal(f.command(text).ok, false);
        }
        assert.deepEqual(f.player, before);
        const expectedSearch = 0.4 + delta + { 隐蔽: -0.1, 法术: -0.06, 科技: -0.12 }[mode];
        const preview = f.command(`应对 ${mode}`).message;
        f.command(`应对 ${mode} 确认`);
        assert.ok(Math.abs(f.player.复活地球.action.risk - expectedSearch) < 1e-12);
        assert.ok(preview.includes(`本次死亡风险${Number((expectedSearch * 100).toFixed(2))}%`));
        f.finish();
        const expectedReturn = 0.2 + delta + (mode === '法术' ? 0.05 : 0);
        assert.ok(f.command('撤离').message.includes(`本次死亡风险${Number((expectedReturn * 100).toFixed(2))}%`));
        f.command('撤离 确认');
        assert.ok(Math.abs(f.player.复活地球.action.risk - expectedReturn) < 1e-12);
        f.finish();
        assert.equal(f.player.复活地球.place, '空间站');
        assert.equal(f.player.复活地球.knowledge.佛道传承, true);
        assert.equal(f.player.复活地球.expedition, null);
      }
    }
  }
});

test('正确与错误处置影响地表修炼和弃货撤离，风险仍有上下限', () => {
  for (const choice of ['切断广播', '关闭回传']) {
    const f = signalFixture();
    f.act('调查 信号 确认');
    f.act(`抉择 ${choice} 确认`);
    f.act('应对 隐蔽 确认');
    f.command('地表修炼 确认');
    const delta = choice === '切断广播' ? -0.05 : 0.15;
    assert.ok(Math.abs(f.player.复活地球.action.risk - (0.4 + 0.1 + delta)) < 1e-12);
    f.finish();
    assert.equal(f.player.复活地球.expedition.window, 0);
    f.command('弃货撤离 确认');
    assert.ok(Math.abs(f.player.复活地球.action.risk - (0.2 + 0.25 + delta - 0.15)) < 1e-12);
    f.finish();
    assert.equal(f.player.复活地球.knowledge.佛道传承, undefined);
  }
  const low = signalFixture();
  low.act('调查 信号 确认');
  low.act('抉择 切断广播 确认');
  low.player.复活地球.expedition.risk = 0.05;
  low.command('应对 科技 确认');
  assert.equal(low.player.复活地球.action.risk, 0.02);
  low.finish();
  low.command('撤离 确认');
  assert.equal(low.player.复活地球.action.risk, 0.02);
  const high = signalFixture();
  high.command('抉择 追随信号 确认');
  high.player.复活地球.expedition.risk = 0.9;
  high.command('应对 法术 确认');
  assert.equal(high.player.复活地球.action.risk, 0.9);
});

test('绕开与追随可直接选择且成本公开，深入不刷新异常，重复消息不重复耗窗', () => {
  for (const choice of ['绕开信号', '追随信号']) {
    const f = signalFixture();
    const before = structuredClone(f.player);
    const noRandom = () => { throw Error('即时决策不抽签'); };
    assert.equal(f.command(`抉择 ${choice}`, 0, { random: noRandom }).changed, false);
    assert.deepEqual(f.player, before);
    assert.equal(f.command(`抉择 ${choice} 确认`, 0, { random: noRandom, requestId: 'signal-choice' }).ok, true);
    const chosen = structuredClone(f.player);
    assert.equal(f.command(`抉择 ${choice} 确认`, 0, { random: noRandom, requestId: 'signal-choice' }).changed, false);
    assert.deepEqual(f.player, chosen);
    assert.equal(f.player.复活地球.expedition.window, choice === '绕开信号' ? 4 : 5);
    assert.equal(f.player.复活地球.action, null);
    f.act('应对 科技 确认');
    assert.equal(f.command('深入 确认', 0, { random: noRandom }).ok, true);
    assert.deepEqual(f.player.复活地球.expedition.signal, chosen.复活地球.expedition.signal);
    assert.equal(f.command('调查 信号 确认').ok, false);
    f.command('应对 科技 确认');
    const expected = 0.4 + 0.07 - 0.12 + (choice === '追随信号' ? 0.15 : 0);
    assert.ok(Math.abs(f.player.复活地球.action.risk - expected) < 1e-12);
  }
});

test('无材料无余额仍能手工调查核验，零窗口可直接撤离且未处理信号不加罚', () => {
  const f = signalFixture();
  Object.assign(f.player.复活地球, { bag: {}, credits: 0 });
  Object.assign(f.player.复活地球.station, { debt: 11, grace: 0 });
  f.act('调查 信号 确认');
  f.act('核验 手工 确认');
  f.act('抉择 切断广播 确认');
  f.act('应对 隐蔽 确认');
  f.act('撤离 确认');
  assert.equal(f.player.复活地球.station.debt, 11);
  assert.equal(f.player.复活地球.station.grace, 0);
  assert.equal(f.player.复活地球.credits, 0);
  for (const window of [0, 5]) {
    const empty = signalFixture();
    Object.assign(empty.player.复活地球, { bag: {}, credits: 0 });
    empty.player.复活地球.expedition.window = window;
    const before = structuredClone(empty.player);
    empty.setNow(9_999_999_999);
    empty.command('事件');
    assert.deepEqual(empty.player, before);
    empty.command('撤离 确认');
    assert.equal(empty.player.复活地球.action.risk, window ? 0.2 : 0.45);
    empty.finish();
    assert.equal(empty.player.复活地球.place, '空间站');
    assert.deepEqual(empty.player.复活地球.bag, {});
  }
});

test('新命令预览只读；缺探测器、错误输入和异常随机源原子回滚，不留下半次调查或半笔费用', () => {
  const f = signalFixture();
  const noRandom = () => { throw Error('预览不抽签'); };
  let before = structuredClone(f.player);
  for (const text of ['调查 信号', '核验 科技', '抉择 绕开信号', '抉择 追随信号', '抉择 切断广播',
    '调查 信号 错误 确认', '抉择 不存在 确认']) {
    assert.equal(f.command(text, 0, { random: noRandom }).changed, false, text);
  }
  assert.equal(f.command('调查 信号 确认', NaN).ok, false);
  assert.deepEqual(f.player, before);
  f.act('调查 信号 确认');
  f.player.复活地球.bag.探测器 = 0;
  before = structuredClone(f.player);
  assert.equal(f.command('核验 科技 确认').ok, false);
  for (const text of ['核验 手工', '核验 科技', '抉择 切断广播', '抉择 关闭回传']) {
    assert.equal(f.command(text, 0, { random: noRandom }).changed, false, text);
  }
  assert.deepEqual(f.player, before);
  f.player.复活地球.bag.探测器 = 1;
  before = structuredClone(f.player);
  assert.equal(f.command('核验 科技 确认', Infinity).ok, false);
  assert.deepEqual(f.player, before);
  const fresh = fixture({ realm: 1 });
  const original = structuredClone(fresh.player);
  const rolls = [0.99, 0.99, NaN];
  assert.equal(fresh.command('探索 地表采药 确认', 0.99, { random: () => rolls.shift() }).ok, false);
  assert.deepEqual(fresh.player, original);
});

test('调查核验处置跨重启沿用线索，开始与结算收据幂等，进行中不换选项', () => {
  const f = signalFixture('索名');
  for (const text of ['调查 信号 确认', '核验 科技 确认', '抉择 关闭回传 确认']) {
    assert.equal(f.command(text, 0.99, { requestId: `start-${text}` }).ok, true);
    const before = structuredClone(f.player);
    const noRandom = () => { throw Error('重放不重新抽签'); };
    assert.equal(f.command(text, 0, { requestId: `start-${text}`, random: noRandom }).changed, false);
    assert.equal(f.command('抉择 绕开信号 确认').ok, false);
    assert.equal(f.command('撤离 确认').ok, false);
    assert.deepEqual(f.player, before);
    f.player.复活地球 = JSON.parse(JSON.stringify(f.player.复活地球));
    f.setNow(f.player.复活地球.action.endAt);
    assert.equal(f.command('结算', 0, { requestId: `end-${text}`, random: noRandom }).ok, true);
    const after = structuredClone(f.player);
    assert.equal(f.command('结算', 0, { requestId: `end-${text}`, random: noRandom }).changed, false);
    assert.deepEqual(f.player, after);
  }
  assert.equal(f.player.复活地球.expedition.signal.choice, '关闭回传');
  assert.equal(f.player.复活地球.bag.探测器, 99);
});

test('误判后真实死亡清本世与外勤，仓储保留；死亡复盘留下已获得线索及处置后果', () => {
  const f = signalFixture();
  f.player.复活地球.storage.灵植 = 12;
  f.act('调查 信号 确认');
  f.act('抉择 关闭回传 确认');
  f.act('应对 隐蔽 确认');
  f.act('撤离 确认', 0);
  const s = f.player.复活地球;
  assert.deepEqual(s.body, earth.createRevivalState(0).body);
  assert.deepEqual(s.bag, {});
  assert.equal(s.expedition, null);
  assert.equal(s.action, null);
  assert.equal(s.storage.灵植, 12);
  assert.equal(s.knowledge.佛道传承, undefined);
  const text = f.command('复盘').message;
  assert.match(text, /上一轮的停顿/);
  assert.match(text, /暴露给了假接应点/);
  assert.match(text, /抉择 关闭回传/);
  assert.match(text, /黑雾样本×1/);
  assert.doesNotMatch(text, /rescueRoll|signalRoll/);
});

test('v4待结算外勤和空闲地表逐阶段兼容，不抽异常不追费；返站后的新旅程才启用信号', () => {
  for (const phase of ['journey', 'encounter', 'scavenge', 'choice', 'fieldCultivate', 'return']) {
    const f = fixture({ realm: 2 });
    f.command('探索 塔底调查 确认');
    if (phase !== 'journey') f.finish();
    if (['scavenge', 'choice', 'fieldCultivate', 'return'].includes(phase)) f.command('应对 隐蔽 确认');
    if (['choice', 'fieldCultivate', 'return'].includes(phase)) f.finish();
    if (phase === 'fieldCultivate') f.command('地表修炼 确认');
    if (phase === 'return') f.command('撤离 确认');
    downgradeV4(f);
    const before = structuredClone(f.player);
    const noRandom = () => { throw Error('旧行动不补抽信号'); };
    for (const text of ['状态', '事件', '外勤']) assert.equal(f.command(text, 0, { random: noRandom }).ok, true, phase);
    assert.equal(f.command('调查 信号 确认').ok, false);
    assert.deepEqual(f.player, before);
    if (f.player.复活地球.action) {
      f.setNow(f.player.复活地球.action.endAt);
      assert.equal(f.command('结算', 0, { random: noRandom }).ok, true);
      assert.equal(f.player.复活地球.version, 7);
      assert.equal(f.player.复活地球.credits, before.复活地球.credits);
      assert.equal(f.player.复活地球.expedition?.signal ?? null, null);
    }
    if (f.player.复活地球.expedition?.stage === 'encounter') f.act('应对 隐蔽 确认');
    if (f.player.复活地球.expedition) f.act('撤离 确认');
    assert.equal(f.player.复活地球.place, '空间站');
    const rolls = [0.99, 0.99, 0.05];
    assert.equal(f.command('探索 塔底调查 确认', 0.99, { random: () => rolls.shift() }).ok, true);
    assert.equal(f.player.复活地球.expedition.signal.pattern, '回声');
  }
});

test('v4化凡传道及待结算抉择保留事件语义，升级v7不走旧版直接加进度分支', () => {
  for (const route of ['化凡', '信仰']) {
    const f = pathFixture(route);
    f.command(route === '化凡' ? '化凡' : '传道');
    downgradeV4(f);
    f.finish();
    assert.ok(f.player.复活地球.body.pathEvent);
    assert.equal(f.player.复活地球.body.mortalSteps, 0);
    assert.equal(f.player.复活地球.body.faith, 0);
    f.command(`抉择 ${route === '化凡' ? '顶替夜班' : '轮值耕作'} 确认`);
    downgradeV4(f);
    f.finish();
    assert.equal(f.player.复活地球.version, 7);
    assert.equal(f.player.复活地球.body.pathEvent, null);
    assert.equal(f.player.复活地球.body.pathChoices.length, 1);
    assert.equal(f.player.复活地球.body[route === '化凡' ? 'mortalSteps' : 'faith'], route === '化凡' ? 1 : 25);
  }
});

test('v4已开始的危险外勤保留死亡抽签、接应资格快照和清零规则，不因迁移重抽或追费', () => {
  const f = fixture({ realm: 2, cultivation: 90 });
  f.player.复活地球.station.relay = true;
  f.command('探索 塔底调查 确认');
  const s = downgradeV4(f);
  s.action.roll = 0.1;
  s.action.rescueRoll = 0.55;
  s.station.relay = false;
  const credits = s.credits;
  const loaded = JSON.parse(JSON.stringify(f.player));
  const result = earth.runRevivalCommand(loaded, '结算', {
    now: s.action.endAt, random: () => { throw Error('已保存的死亡不重抽'); },
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(loaded.复活地球.version, 7);
  assert.equal(loaded.复活地球.credits, credits - 60);
  assert.equal(loaded.复活地球.place, '空间站');
  assert.deepEqual(loaded.复活地球.body, earth.createRevivalState(0).body);
  assert.equal(loaded.复活地球.expedition, null);
  assert.equal(loaded.复活地球.deathRecords.at(-1).rescueChance, 0.6);
});

test('损坏信号、行动错配和缺字段保留原快照，不静默补成无异常', () => {
  for (const version of [1, 2, 3, 4]) {
    const f = fixture({ realm: 2 });
    [downgradeFixture, downgradeV2, downgradeV3, downgradeV4][version - 1](f);
    f.player.复活地球.action = { kind: 'signalInvestigate', endAt: 1000, roll: 0, rescueRoll: 0, risk: 0.9,
      ...(version >= 2 ? { rulesVersion: version } : {}),
      ...(version >= 3 ? { livingCost: 0, rescueChance: 0.5 } : {}),
    };
    const before = structuredClone(f.player);
    assert.equal(f.command('结算').ok, false);
    assert.deepEqual(f.player, before);
  }
  for (const mutate of [
    s => { delete s.expedition.signal; },
    s => { s.expedition.signal = []; },
    s => { s.expedition.signal.pattern = '未知'; },
    s => { s.expedition.signal.verified = true; },
    s => { s.expedition.signal.choice = '切断广播'; },
    s => { s.expedition.signal.investigated = '是'; },
    s => { s.expedition.signal.choice = '未知'; },
    s => { s.expedition.stage = 'choice'; },
    s => { s.expedition.depth = 2; },
    s => { s.action = { kind: 'signalVerify', method: '手工', endAt: 1000, roll: 0.99, rescueRoll: 0.99,
      rulesVersion: 5, livingCost: 0, rescueChance: 0.5, risk: 0 }; },
  ]) {
    const f = signalFixture();
    mutate(f.player.复活地球);
    const before = structuredClone(f.player);
    for (const text of ['状态', '事件', '结算', '撤离 确认']) assert.equal(f.command(text).ok, false);
    assert.deepEqual(f.player, before);
  }
  for (const mutate of [
    s => { s.action.risk = 0.1; },
    s => { s.action.livingCost = 5; },
    s => { s.action.rulesVersion = 4; },
    s => { s.expedition.signal = null; },
  ]) {
    const f = signalFixture();
    f.command('调查 信号 确认');
    mutate(f.player.复活地球);
    const before = structuredClone(f.player);
    assert.equal(f.command('结算').ok, false);
    assert.equal(f.command('事件').ok, false);
    assert.deepEqual(f.player, before);
  }
});

test('实际入口并发调查核验仅扣一次，落盘失败保留待核验状态，重试结算只兑现一次', async () => {
  const f = signalFixture();
  const original = structuredClone(f.player);
  const failStart = appFixture(f.player, { failWrite: true });
  await failStart.send('#复活地球 调查 信号 确认', 'signal-start');
  assert.deepEqual(failStart.disk(), original);
  assert.doesNotMatch(failStart.replies.at(-1), /调查可疑接应信号已开始/);
  const app = appFixture(f.player);
  await Promise.all([
    app.send('#复活地球 调查 信号 确认', 'signal-start'),
    app.send('#复活地球 调查 信号 确认', 'signal-start'),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().复活地球.expedition.window, 4);
  app.disk().复活地球.action.endAt = 0;
  await app.send('#复活地球 结算', 'signal-investigated');
  await Promise.all([
    app.send('#复活地球 核验 科技 确认', 'signal-tech'),
    app.send('#复活地球 核验 科技 确认', 'signal-tech'),
  ]);
  assert.equal(app.writes(), 3);
  assert.equal(app.disk().复活地球.bag.探测器, 99);
  app.disk().复活地球.action.endAt = 0;
  const pending = structuredClone(app.disk());
  const failSettle = appFixture(pending, { failWrite: true });
  await failSettle.send('#复活地球 结算', 'signal-verified');
  assert.deepEqual(failSettle.disk(), pending);
  assert.doesNotMatch(failSettle.replies.at(-1), /核验记录：/);
  const retry = appFixture(failSettle.disk());
  await Promise.all([
    retry.send('#复活地球 结算', 'signal-verified'),
    retry.send('#复活地球 结算', 'signal-verified'),
  ]);
  assert.equal(retry.writes(), 1);
  assert.equal(retry.disk().复活地球.expedition.signal.verified, true);
  assert.equal(retry.disk().复活地球.bag.探测器, 99);
});

test('连续工作与逐次工作等价：三个岗位、四种资格、零余额和欠款逐轮核算', () => {
  let compared = 0;
  for (const job of ['绿植维护', '工程检修', '复活值守']) {
    for (const permits of [0, 1, 2, 3]) {
      for (const credits of [0, 2, 100]) {
        for (const debt of [0, 33, 132]) {
          for (const count of [2, 10]) {
            const batch = fixture({ realm: 2 });
            const single = fixture({ realm: 2 });
            for (const f of [batch, single]) {
              Object.assign(f.player.复活地球, { credits, bag: {} });
              Object.assign(f.player.复活地球.station, {
                debt, grace: debt ? 1 : 0, rationed: Boolean(permits & 1), resident: Boolean(permits & 2),
              });
            }
            batch.act(`工作 ${job} ${count} 确认`);
            for (let i = 0; i < count; i++) single.act(`工作 ${job}`);
            const a = batch.player.复活地球;
            const b = single.player.复活地球;
            for (const key of ['credits', 'bag', 'storage', 'station', 'body', 'deaths', 'facilities', 'knowledge']) {
              assert.deepEqual(a[key], b[key], `${job}/${permits}/${credits}/${debt}/${count}/${key}`);
            }
            assert.equal(a.history.at(-1).at, b.history.at(-1).at, '累计工时等价');
            assert.equal(a.revision, 2, '整批一次确认、一次结算');
            assert.equal(b.revision, count * 2, '逐轮工作各自开始并结算');
            assert.equal(a.action, null, '到期停止，不自动续工');
            compared++;
          }
        }
      }
    }
  }
  assert.equal(compared, 216);
});

test('多轮工作先预览再确认，保存费率与工时，不预支奖励、不提前结算', () => {
  const f = fixture();
  Object.assign(f.player.复活地球, { credits: 0, bag: {} });
  const before = structuredClone(f.player);
  const noRandom = () => { throw Error('查询或结算抽签'); };
  const preview = f.command('工作 绿植维护 10', 0.99, { random: noRandom });
  assert.equal(preview.changed, false);
  assert.match(preview.message, /50分钟.*毛报酬300.*生活费共45.*结算后余额255/);
  assert.deepEqual(f.player, before);
  let draws = 0;
  const started = f.command('工作 绿植维护 10 确认', 0.99, {
    requestId: 'batch-start', random: () => { draws++; return 0.99; },
  });
  assert.equal(started.ok, true, started.message);
  assert.equal(draws, 2);
  const pending = structuredClone(f.player);
  const action = pending.复活地球.action;
  assert.equal(action.kind, 'workBatch');
  assert.equal(action.count, 10);
  assert.equal(action.unitLivingCost, 5);
  assert.equal(action.livingCost, 0);
  assert.equal(action.endAt, 1000 + 50 * 60_000);
  assert.deepEqual(pending.复活地球.bag, {});
  for (const command of ['工作', '存入 灵植 1', '申请 配给 确认', '结算']) {
    assert.equal(f.command(command).changed, false, command);
    assert.deepEqual(f.player, pending);
  }
  assert.equal(f.command('工作 绿植维护 10 确认', 0.99, { requestId: 'batch-start', random: noRandom }).changed, false);
  const restored = JSON.parse(JSON.stringify(pending));
  const options = { now: action.endAt + 100 * 24 * 60 * 60_000, random: noRandom, requestId: 'batch-finish' };
  const finished = earth.runRevivalCommand(restored, '结算', options);
  assert.equal(finished.ok, true, finished.message);
  assert.equal(restored.复活地球.credits, 255);
  assert.equal(restored.复活地球.bag.灵植, 20);
  assert.equal(restored.复活地球.action, null);
  assert.match(finished.message, /生活费合计45/);
  const settled = structuredClone(restored);
  assert.equal(earth.runRevivalCommand(restored, '结算', options).changed, false);
  assert.equal(earth.runRevivalCommand(restored, '结算', { ...options, requestId: 'again' }).ok, false);
  assert.deepEqual(restored, settled);
});

test('工作次数严格校验；错误输入、异常随机和溢出均不扣费或修改旧存档', () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    if (legacy) downgradeFixture(f);
    const before = structuredClone(f.player);
    for (const text of [
      '工作 绿植维护 0 确认', '工作 绿植维护 -1 确认', '工作 绿植维护 11 确认',
      '工作 绿植维护 1.5 确认', '工作 绿植维护 01 确认', '工作 绿植维护 1e1 确认',
      '工作 绿植维护 Infinity 确认', '工作 绿植维护 9007199254740993 确认',
      '工作 绿植维护 2 多余 确认', '工作 未知 2 确认', '工作 确认', '工作 2',
    ]) {
      assert.equal(f.command(text).ok, false, text);
      assert.deepEqual(f.player, before, text);
    }
    assert.equal(f.command('工作 绿植维护 2 确认', NaN).changed, false);
    assert.deepEqual(f.player, before);
  }
  const f = fixture();
  f.player.复活地球.bag.灵植 = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(f.player);
  assert.equal(f.command('工作 绿植维护 2 确认').changed, false);
  assert.deepEqual(f.player, before);
  f.player.复活地球.bag.灵植 = 0;
  f.player.复活地球.credits = Number.MAX_SAFE_INTEGER;
  const fullCredits = structuredClone(f.player);
  assert.equal(f.command('工作 复活值守 2 确认').changed, false);
  assert.deepEqual(f.player, fullCredits);
});

test('化凡审查期零余额连续工作偿债，生活费逐轮计算且保留待兑现经历', () => {
  const f = pathFixture('化凡');
  f.act('化凡');
  Object.assign(f.player.复活地球, { credits: 0, bag: {} });
  Object.assign(f.player.复活地球.station, { debt: 132, grace: 0 });
  assert.match(f.command('工作 绿植维护 10').message, /生活费共25，偿债132，结算后余额143、欠款0/);
  f.act('工作 绿植维护 10 确认');
  assert.equal(f.player.复活地球.credits, 143);
  assert.equal(f.player.复活地球.station.debt, 0);
  assert.equal(f.player.复活地球.station.grace, 0);
  assert.equal(f.player.复活地球.bag.灵植, 20);
  assert.equal(f.player.复活地球.body.pathEvent, '借来的床位');
  assert.equal(f.player.复活地球.body.mortalSteps, 0);
  assert.equal(f.player.复活地球.body.path, '化凡');
});

test('v1至v7已开始的单轮工作原样结算，新单轮语法保持原工作行动', () => {
  for (const downgrade of [downgradeFixture, downgradeV2, downgradeV3, downgradeV4, downgradeV5, downgradeV6, f => f.player.复活地球]) {
    const f = fixture();
    f.command('工作');
    const s = downgrade(f);
    if (s.version === 1) {
      delete s.action.rulesVersion;
      delete s.action.target;
      delete s.action.livingCost;
      delete s.action.rescueChance;
    }
    const credits = s.credits;
    const herbs = s.bag.灵植;
    const expectedContribution = s.version === 1 ? 0 : 1;
    const result = f.finish();
    assert.equal(result.ok, true, result.message);
    assert.equal(f.player.复活地球.credits, credits + 30);
    assert.equal(f.player.复活地球.bag.灵植, herbs + 2);
    assert.equal(f.player.复活地球.station.contribution, expectedContribution);
    assert.equal(f.player.复活地球.action, null);
  }
  const f = fixture();
  assert.equal(f.command('工作 工程检修 1').ok, true);
  assert.equal(f.player.复活地球.action.kind, 'work');
  assert.equal(f.player.复活地球.action.count, undefined);
});

test('损坏批次、费率与岗位暂停操作，筹备查询也不静默修复', () => {
  const f = fixture();
  assert.equal(f.command('工作 工程检修 10 确认').ok, true);
  for (const corrupt of [
    s => { delete s.action.count; }, s => { s.action.count = 1; }, s => { s.action.count = 11; },
    s => { s.action.count = 2.5; }, s => { s.action.count = '10'; },
    s => { s.action.unitLivingCost = 0; }, s => { s.action.unitLivingCost = 4; },
    s => { delete s.action.unitLivingCost; }, s => { s.action.target = '未知'; },
    s => { delete s.action.target; }, s => { s.action.rulesVersion = 4; },
    s => { s.action.risk = 0.5; }, s => { s.place = '塔监狱'; },
  ]) {
    const player = structuredClone(f.player);
    corrupt(player.复活地球);
    const before = structuredClone(player);
    for (const command of ['状态', '筹备', '结算']) {
      assert.equal(earth.runRevivalCommand(player, command, { now: player.复活地球.action.endAt }).ok, false);
      assert.deepEqual(player, before);
    }
  }
});

test('筹备查询兼容v1至v7且无抽签、写入、收据或隐式迁移；在途货物不入库存', () => {
  for (const downgrade of [downgradeFixture, downgradeV2, downgradeV3, downgradeV4, downgradeV5, downgradeV6, f => f.player.复活地球]) {
    const f = fixture({ realm: 1, phase: 3 });
    downgrade(f);
    const before = structuredClone(f.player);
    const result = f.command('筹备', 0.99, { random: () => { throw Error('筹备抽签'); } });
    assert.equal(result.ok, true, result.message);
    assert.equal(result.changed, false);
    assert.deepEqual(f.player, before);
  }
  const f = fixture({ realm: 1, phase: 3, cultivation: 100 });
  f.act('探索 地表采药 确认');
  f.act('应对 隐蔽 确认');
  Object.assign(f.player.复活地球, { bag: {}, storage: {} });
  const before = structuredClone(f.player);
  const result = f.command('筹备');
  assert.match(result.message, /地表暂存、未交回发现均未计入/);
  assert.match(result.message, /百年大蓟：需1｜随身0｜仓储0｜待补1/);
  assert.deepEqual(f.player, before);
  const busy = fixture();
  busy.command('工作 绿植维护 2 确认');
  const pending = structuredClone(busy.player);
  assert.match(busy.command('筹备').message, /先结算再汇总/);
  assert.deepEqual(busy.player, pending);
});

test('凡人与小境界筹备仅列当前关卡，不提早要求筑基或后期材料', () => {
  const f = fixture();
  Object.assign(f.player.复活地球, { credits: 0, bag: {}, storage: {}, knowledge: {} });
  const mortal = f.command('筹备');
  assert.match(mortal.message, /研读×1 → 修炼×1/);
  assert.match(mortal.message, /固定项目积分小计40.*固定计时15分钟/);
  assert.match(mortal.message, /灵植：需1｜随身0｜仓储0｜待补1/);
  assert.match(mortal.message, /工作 绿植维护 1/);
  assert.doesNotMatch(mortal.message, /筑基丹|蕴养|金脑丹/);
  Object.assign(f.player.复活地球.body, { realm: 1, cultivation: 25 });
  f.player.复活地球.knowledge.功法 = true;
  const minor = f.command('筹备');
  assert.match(minor.message, /修炼×3 → 突破×1/);
  assert.match(minor.message, /固定项目积分小计60.*固定计时35分钟/);
  assert.doesNotMatch(minor.message, /筑基丹|蕴养|金脑丹/);
});

test('筑基筹备展开丹炉与丹药原料，仓储成丹优先使用且不重复要求设施', () => {
  const f = fixture({ realm: 1, phase: 3 });
  Object.assign(f.player.复活地球, { credits: 0, bag: { 工程部件: 1 }, storage: { 工程部件: 2 } });
  const before = structuredClone(f.player);
  const plan = f.command('筹备');
  assert.equal(plan.ok, true, plan.message);
  assert.match(plan.message, /修炼×4 → 制作 丹炉×1 → 制作 筑基丹×1 → 突破×1/);
  assert.match(plan.message, /固定项目积分小计235.*固定计时130分钟/);
  assert.match(plan.message, /工程部件：需3｜随身1｜仓储2｜待补0/);
  assert.match(plan.message, /取出 工程部件 2/);
  assert.match(plan.message, /百年大蓟：需1.*待补1/);
  assert.doesNotMatch(plan.message, /筑基丹：需/);
  assert.deepEqual(f.player, before);
  f.player.复活地球.storage.筑基丹 = 1;
  const stored = f.command('筹备');
  assert.doesNotMatch(stored.message, /制作 丹炉|制作 筑基丹|百年大蓟|工程部件：需/);
  assert.match(stored.message, /筑基丹：需1｜随身0｜仓储1｜待补0/);
  assert.match(stored.message, /取出 筑基丹 1/);
  assert.match(stored.message, /固定项目积分小计125.*固定计时100分钟/);
  delete f.player.复活地球.storage.筑基丹;
  f.player.复活地球.facilities.丹炉 = true;
  assert.match(f.command('筹备').message, /固定项目积分小计150/);
});

test('突破查询返回独立配方副本，外部修改查询结果不污染实际门槛或筹备', () => {
  const f = fixture({ realm: 1, phase: 3, cultivation: 100 });
  const gate = earth.getRevivalBreakthroughGate(f.player.复活地球);
  gate.items.筑基丹 = 0;
  gate.credits = 0;
  assert.equal(earth.getRevivalBreakthroughGate(f.player.复活地球).items.筑基丹, 1);
  assert.equal(earth.getRevivalBreakthroughGate(f.player.复活地球).credits, 60);
  assert.match(f.command('筹备').message, /筑基丹：需1/);
  f.player.复活地球.bag.筑基丹 = 0;
  assert.equal(f.command('突破').changed, false);
});

test('结丹筹备按剩余蕴养计数，木土首轮基材不重复，火种与燃料合并需求', () => {
  const f = fixture({ realm: 2, phase: 3, cultivation: 180 });
  Object.assign(f.player.复活地球, { credits: 0, bag: {}, storage: {} });
  const all = f.command('筹备');
  assert.match(all.message, /固定项目积分小计620.*固定计时570分钟/);
  assert.match(all.message, /工程部件：需5/);
  assert.match(all.message, /燃料：需6/);
  assert.match(all.message, /千年古木：需1/);
  assert.match(all.message, /五百年灵草：需1/);
  assert.match(all.message, /水灵之气：需3/);
  for (const name of Object.keys(f.player.复活地球.body.elements)) f.player.复活地球.body.elements[name] = 1;
  f.player.复活地球.body.weapon = true;
  f.player.复活地球.facilities.持续火种 = true;
  const rest = f.command('筹备');
  assert.match(rest.message, /固定项目积分小计335.*固定计时390分钟/);
  assert.match(rest.message, /燃料：需2/);
  assert.match(rest.message, /水灵之气：需2/);
  assert.doesNotMatch(rest.message, /千年古木|五百年灵草|工程部件：需|制作 本命法器|制作 持续火种/);
});

test('结婴筹备展示污染风险与传承门槛，化神筹备区分未选路线、已付事件与分支代价', () => {
  const nascent = fixture({ realm: 3, phase: 3, cultivation: 300 });
  Object.assign(nascent.player.复活地球, { bag: {}, storage: {} });
  const plan = nascent.command('筹备');
  assert.match(plan.message, /先探索塔底调查并成功返站/);
  assert.match(plan.message, /探索 道门试炼.*另需佛道传承/);
  assert.match(plan.message, /闭关本身死亡风险65%/);
  assert.match(plan.message, /常规结婴条件仍待正文核实/);
  const choosing = fixture({ realm: 4, phase: 3, cultivation: 480 });
  choosing.player.复活地球.body.chosenPath = '化凡';
  assert.match(choosing.command('筹备').message, /化神 化凡」.*路线成本未计入/);
  const mortal = pathFixture('化凡');
  mortal.act('化凡');
  const before = structuredClone(mortal.player);
  const pending = mortal.command('筹备');
  assert.match(pending.message, /化凡×2 → 突破×1/);
  assert.match(pending.message, /固定项目积分小计145.*固定计时240分钟/);
  assert.match(pending.message, /发起费已付，不重复计入/);
  assert.match(pending.message, /抉择 匀出配给：10积分、10分钟、物资灵植×1/);
  assert.deepEqual(mortal.player, before);
  const faith = fixture({ realm: 4, phase: 3, cultivation: 480 });
  faith.command('化神 信仰');
  faith.player.复活地球.bag = {};
  assert.match(faith.command('筹备').message, /固定项目积分小计345.*固定计时300分钟/);
  faith.act('工作 工程检修 3 确认');
  faith.player.复活地球.bag.图腾载体 = 1;
  faith.act('凝聚图腾');
  faith.act('寻访信众');
  faith.act('工作 绿植维护 1');
  faith.act('传道');
  const current = faith.command('筹备');
  assert.match(current.message, /传道×3 → 突破×1/);
  assert.match(current.message, /固定项目积分小计210/);
  assert.doesNotMatch(current.message, /凝聚图腾×|寻访信众×/);
});

test('离界筹备复用装置配方并提示坐标和欠款，已结束记录仅显示封存', () => {
  const f = fixture({ realm: 5 });
  Object.assign(f.player.复活地球, { credits: 10, bag: {}, storage: { 工程部件: 12, 燃料: 2 } });
  Object.assign(f.player.复活地球.station, { resident: true, rationed: true, debt: 33, grace: 0 });
  const plan = f.command('筹备');
  assert.match(plan.message, /欠款33/);
  assert.match(plan.message, /固定项目积分小计502.*尚缺492/);
  assert.match(plan.message, /工程部件：需12｜随身0｜仓储12｜待补0/);
  assert.match(plan.message, /燃料：需6｜随身0｜仓储2｜待补4/);
  assert.match(plan.message, /须取得离界坐标/);
  f.player.复活地球.facilities.接引装置 = true;
  assert.match(f.command('筹备').message, /固定项目积分小计0/);
  assert.match(f.command('筹备').message, /取得离界坐标/);
  Object.assign(f.player.复活地球, { status: 'ascended', place: '仙界' });
  f.player.power_place = 1;
  const before = structuredClone(f.player);
  assert.match(f.command('筹备').message, /记录封存/);
  assert.deepEqual(f.player, before);
});

test('实际入口连续工作与兑现消息幂等，落盘失败保留旧余额与批次，筹备零写入', async () => {
  const f = fixture();
  const app = appFixture(f.player);
  await app.send('#复活地球 筹备');
  await app.send('#复活地球 工作 工程检修 10');
  assert.equal(app.writes(), 0);
  await Promise.all([
    app.send('#复活地球 工作 工程检修 10 确认', 'batch'),
    app.send('#复活地球 工作 工程检修 10 确认', 'batch'),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().复活地球.credits, 99995);
  assert.equal(app.disk().复活地球.action.count, 10);
  const failure = appFixture(f.player, { failWrite: true });
  await failure.send('#复活地球 工作 工程检修 10 确认');
  assert.deepEqual(failure.disk(), f.player);
  assert.match(failure.replies.at(-1), /未确认完成/);
  assert.equal(f.command('工作 工程检修 10 确认').ok, true);
  const saved = structuredClone(f.player);
  const failedSettlement = appFixture(saved, { failWrite: true });
  await failedSettlement.send('#复活地球 结算', 'settle-batch');
  assert.deepEqual(failedSettlement.disk(), saved);
  assert.equal(failedSettlement.writes(), 0);
  const retry = appFixture(saved);
  await Promise.all([
    retry.send('#复活地球 结算', 'settle-batch'),
    retry.send('#复活地球 结算', 'settle-batch'),
  ]);
  assert.equal(retry.writes(), 1);
  assert.equal(retry.disk().复活地球.action, null);
  assert.equal(retry.disk().复活地球.credits, 100300);
  assert.equal(retry.disk().复活地球.bag.工程部件, 110);
  assert.equal(retry.disk().复活地球.station.contribution, 10);
});

test('公共危机主动参加，旧版只读预览不迁移、不扣费、不抽签或抢占化神事件', () => {
  const noRandom = () => { throw Error('只读公议抽签'); };
  for (const downgrade of [downgradeFixture, downgradeV2, downgradeV3, downgradeV4, downgradeV5]) {
    const f = fixture();
    downgrade(f);
    const before = structuredClone(f.player);
    const view = f.command('站务危机', 0.99, { random: noRandom });
    assert.equal(view.ok, true, view.message);
    assert.match(view.message, /插件原创/);
    assert.equal(f.command('参与危机', 0.99, { random: noRandom }).changed, false);
    assert.equal(f.command('参与危机 多余 确认').changed, false);
    assert.deepEqual(f.player, before);
    assert.equal(f.command('参与危机 确认', 0.99, { random: noRandom }).ok, true);
    assert.equal(f.player.复活地球.version, 7);
    assert.deepEqual(f.player.复活地球.station.crisis, { choices: [] });
    assert.equal(f.player.复活地球.credits, before.复活地球.credits);
    const joined = structuredClone(f.player);
    assert.equal(f.command('参与危机 确认').changed, false);
    for (const text of ['公议 未知', '公议 轮班供氧 多余 确认', '公议 轮班供氧']) {
      assert.equal(f.command(text, 0.99, { random: noRandom }).changed, false);
      assert.deepEqual(f.player, joined);
    }
  }
  const f = pathFixture('化凡');
  f.act('化凡');
  f.command('参与危机 确认');
  assert.match(f.command('事件').message, /借来的床位/);
  assert.match(f.command('站务危机').message, /失压警报/);
  f.act('公议 轮班供氧 确认');
  assert.equal(f.player.复活地球.body.pathEvent, '借来的床位');
  assert.equal(f.player.复活地球.body.mortalSteps, 0);
});

test('18条公共危机选择组合完整兑现；前段证据改变取证材料、工时及结案回响', () => {
  let paths = 0;
  for (const first of ['机械检修', '灵力稳压', '轮班供氧']) {
    for (const second of ['贡献优先', '配给改订', '延长轮值']) {
      for (const final of ['公开核账', '封存名册']) {
        const f = fixture({ realm: 2, cultivation: 100 });
        f.command('参与危机 确认');
        const original = structuredClone(f.player.复活地球);
        f.act(`公议 ${first} 确认`, 0);
        assert.equal(f.player.复活地球.station.contribution, 2);
        assert.equal(f.player.复活地球.body.cultivation, first === '灵力稳压' ? 75 : 100);
        f.act(`公议 ${second} 确认`, 0);
        assert.equal(f.player.复活地球.station.contribution, 4);
        const credits = final === '封存名册' ? 0 : first === '机械检修' ? 10 : 20;
        const parts = final === '封存名册' ? 0 : first === '机械检修' ? 1 : 2;
        const minutes = final === '封存名册' ? 10
          : (first === '轮班供氧' ? 30 : 45) + (second === '贡献优先' ? 15 : -15);
        const before = structuredClone(f.player);
        const quote = f.command(`公议 ${final}`);
        assert.equal(quote.changed, false);
        assert.match(quote.message, new RegExp(`实际代价：${minutes}分钟、${credits}积分`));
        assert.deepEqual(f.player, before);
        const now = f.player.复活地球.history.at(-1).at;
        assert.equal(f.command(`公议 ${final} 确认`, 0).ok, true);
        assert.equal(f.player.复活地球.action.endAt, now + minutes * 60_000);
        assert.equal(f.player.复活地球.credits, before.复活地球.credits - credits - 5);
        assert.equal(f.player.复活地球.bag.工程部件, before.复活地球.bag.工程部件 - parts);
        assert.equal(f.player.复活地球.station.crisis.choices.length, 2, '尚未结算不加记录或奖励');
        const result = f.finish();
        assert.equal(result.ok, true, result.message);
        assert.match(result.message, /公共危机结案/);
        assert.match(result.message, second === '贡献优先' ? /孟乔的空床/ : /孟乔留在下一班/);
        assert.match(result.message, final === '公开核账' ? /双人核验/ : /封档理由是设备异常/);
        const state = f.player.复活地球;
        assert.equal(state.station.contribution, 6);
        assert.deepEqual(state.station.crisis.choices, [
          { event: '失压警报', choice: first }, { event: '配给争议', choice: second }, { event: '名册回声', choice: final },
        ]);
        assert.equal(state.body.faith, 0);
        assert.equal(state.body.mortalSteps, 0);
        assert.equal(state.body.realm, original.body.realm);
        assert.equal(state.deaths, 0, '零随机值也没有新暗骰死亡');
        assert.deepEqual(state.facilities, original.facilities);
        assert.deepEqual(state.storage, original.storage);
        const closed = structuredClone(f.player);
        assert.equal(f.command('参与危机 确认').changed, false);
        assert.equal(f.command(`公议 ${final} 确认`).changed, false);
        assert.equal(f.command('结算').changed, false);
        assert.equal(f.command('站务危机').changed, false);
        assert.deepEqual(f.player, closed);
        paths++;
      }
    }
  }
  assert.equal(paths, 18);
});

test('灵力稳压支付真实积累；凡人、积累不足与化凡压制均保留快照，化神不虚扣积累', () => {
  for (const [realm, cultivation, permitted] of [[0, 100, false], [1, 24, false], [1, 25, true], [4, 480, true], [5, 0, true]]) {
    const f = fixture({ realm, cultivation });
    f.command('参与危机 确认');
    const before = structuredClone(f.player);
    const result = f.command('公议 灵力稳压 确认');
    assert.equal(result.ok, permitted, result.message);
    if (!permitted) assert.deepEqual(f.player, before);
    else {
      assert.equal(f.player.复活地球.body.cultivation, cultivation - (realm === 5 ? 0 : 25));
      assert.equal(f.player.复活地球.credits, before.复活地球.credits - 5);
      assert.equal(f.player.复活地球.station.contribution, 0);
      f.finish();
      assert.equal(f.player.复活地球.station.contribution, 2);
    }
  }
  const f = pathFixture('化凡');
  f.command('参与危机 确认');
  const before = structuredClone(f.player);
  assert.equal(f.command('公议 灵力稳压 确认').changed, false);
  assert.deepEqual(f.player, before);
  f.act('公议 轮班供氧 确认');
  assert.equal(f.player.复活地球.body.path, '化凡');
  assert.equal(f.player.复活地球.body.cultivation, 480);
});

test('公议缺料、生活费不足、随机源异常与贡献溢出全部回滚，不留下半笔积累或费用', () => {
  for (const [credits, parts, roll, choice] of [
    [100, 2, 0.99, '机械检修'], [24, 3, 0.99, '机械检修'],
    [100, 3, NaN, '机械检修'], [4, 3, 0.99, '灵力稳压'], [100, 3, NaN, '灵力稳压'],
  ]) {
    const f = fixture({ realm: 1, cultivation: 50 });
    f.command('参与危机 确认');
    f.player.复活地球.credits = credits;
    f.player.复活地球.bag.工程部件 = parts;
    const before = structuredClone(f.player);
    assert.equal(f.command(`公议 ${choice} 确认`, roll).changed, false);
    assert.deepEqual(f.player, before);
  }
  const f = fixture();
  f.command('参与危机 确认');
  f.player.复活地球.station.contribution = Number.MAX_SAFE_INTEGER;
  const before = structuredClone(f.player);
  assert.equal(f.command('公议 轮班供氧 确认').changed, false);
  assert.deepEqual(f.player, before);
});

test('零积分零材料凡人可工作筹生活费完成整条危机，三段不赠修炼与宗教信仰', () => {
  const f = fixture();
  Object.assign(f.player.复活地球, { credits: 0, bag: {}, storage: {}, knowledge: {} });
  assert.equal(f.command('参与危机 确认').ok, true);
  assert.equal(f.command('公议 轮班供氧 确认').changed, false);
  f.act('工作 复活值守');
  for (const choice of ['轮班供氧', '延长轮值', '封存名册']) f.act(`公议 ${choice} 确认`, 0);
  const s = f.player.复活地球;
  assert.equal(s.credits, 25);
  assert.equal(s.station.contribution, 8);
  assert.equal(s.station.crisis.choices.length, 3);
  assert.equal(s.body.realm, 0);
  assert.equal(s.body.faith, 0);
  assert.equal(s.body.cultivation, 0);
  assert.deepEqual(s.bag, {});
  assert.deepEqual(s.knowledge, {});
});

test('每段公议只收一次资格生活费及债务缓冲；最后一次缓冲可结算，下段先清债', () => {
  const f = fixture();
  f.command('参与危机 确认');
  Object.assign(f.player.复活地球.station, { debt: 33, grace: 1, resident: true, rationed: true });
  const before = structuredClone(f.player);
  f.command('公议 轮班供氧');
  assert.deepEqual(f.player, before);
  assert.equal(f.command('公议 轮班供氧 确认').ok, true);
  assert.equal(f.player.复活地球.action.livingCost, 2);
  assert.equal(f.player.复活地球.station.grace, 0);
  assert.equal(f.finish().ok, true);
  assert.equal(f.player.复活地球.station.crisis.choices.length, 1);
  assert.equal(f.player.复活地球.credits, before.复活地球.credits - 2);
  assert.equal(f.command('公议 贡献优先 确认').changed, false);
  assert.match(f.command('站务危机').message, /清退审查中/);
  f.act('工作 复活值守');
  assert.equal(f.player.复活地球.station.debt, 0);
  f.act('公议 贡献优先 确认');
  assert.equal(f.player.复活地球.station.crisis.choices.length, 2);
  const locked = fixture();
  Object.assign(locked.player.复活地球.station, { debt: 33, grace: 0 });
  assert.equal(locked.command('参与危机 确认').changed, false);
  assert.equal(locked.player.复活地球.station.crisis, null);
});

test('公议跨重启固定费用与选择；长期离线不推进事件，重复开始或结算不发双份贡献', () => {
  const f = fixture({ realm: 2, cultivation: 100 });
  f.command('参与危机 确认');
  const noRandom = () => { throw Error('旧公议重抽'); };
  const before = structuredClone(f.player);
  f.command('站务危机', 0.99, { now: 1000 + 365 * 24 * 60 * 60_000, random: noRandom });
  assert.deepEqual(f.player, before);
  f.command('公议 机械检修 确认', 0.99, { requestId: 'public-start' });
  const saved = JSON.parse(JSON.stringify(f.player));
  const action = saved.复活地球.action;
  const pending = structuredClone(saved);
  assert.equal(earth.runRevivalCommand(saved, '公议 机械检修 确认', {
    requestId: 'public-start', now: action.endAt, random: noRandom,
  }).changed, false);
  assert.equal(earth.runRevivalCommand(saved, '结算', { now: action.endAt - 1 }).changed, false);
  assert.equal(earth.runRevivalCommand(saved, '公议 轮班供氧 确认', { now: action.endAt }).changed, false);
  assert.deepEqual(saved, pending);
  const options = { now: action.endAt + 365 * 24 * 60 * 60_000, random: noRandom, requestId: 'public-settle' };
  assert.equal(earth.runRevivalCommand(saved, '结算', options).ok, true);
  assert.equal(saved.复活地球.station.contribution, 2);
  assert.equal(saved.复活地球.station.crisis.choices.length, 1);
  assert.equal(saved.复活地球.action, null);
  assert.equal(saved.复活地球.credits, before.复活地球.credits - 25);
  const settled = structuredClone(saved);
  assert.equal(earth.runRevivalCommand(saved, '结算', options).changed, false);
  assert.equal(earth.runRevivalCommand(saved, '结算', { ...options, requestId: 'other' }).changed, false);
  assert.deepEqual(saved, settled);
});

test('死亡保留公议后果但仍清境界积累与随身；塔内或地表只查看，回站才继续', () => {
  const f = fixture({ realm: 2, cultivation: 100 });
  f.command('参与危机 确认');
  f.act('公议 机械检修 确认');
  const crisis = structuredClone(f.player.复活地球.station.crisis);
  const stored = structuredClone(f.player.复活地球.storage);
  f.command('接应预算 0');
  f.act('探索 地表采药 确认', 0);
  assert.equal(f.player.复活地球.deaths, 1);
  assert.equal(f.player.复活地球.place, '塔监狱');
  assert.deepEqual(f.player.复活地球.body, earth.createRevivalState(0).body);
  assert.deepEqual(f.player.复活地球.bag, {});
  assert.deepEqual(f.player.复活地球.storage, stored);
  assert.deepEqual(f.player.复活地球.station.crisis, crisis);
  assert.match(f.command('复盘').message, /公议兑现 失压警报·机械检修/);
  const before = structuredClone(f.player);
  assert.equal(f.command('公议 贡献优先 确认').changed, false);
  assert.match(f.command('站务危机').message, /先回站再公议/);
  assert.deepEqual(f.player, before);
  for (const clue of ['规章', '读数', '名册']) f.act(`观察 ${clue}`);
  f.cooperate();
  f.act('推演');
  f.act('越狱 确认');
  assert.deepEqual(f.player.复活地球.station.crisis, crisis);
  f.act('公议 延长轮值 确认');
  assert.equal(f.player.复活地球.station.crisis.choices.length, 2);
  const field = fixture({ realm: 1 });
  field.command('参与危机 确认');
  field.act('探索 地表采药 确认');
  assert.equal(field.command('公议 轮班供氧 确认').changed, false);
  assert.match(field.command('站务危机').message, /先回站再公议/);
  field.act('撤离 确认');
  field.act('公议 轮班供氧 确认');
  assert.equal(field.player.复活地球.station.crisis.choices.length, 1);
});

test('v5的连续工作、信号和待选化神事件迁移v7保留原语义，不自动塞入危机', () => {
  const batch = fixture();
  batch.command('工作 工程检修 10 确认');
  downgradeV5(batch);
  const original = structuredClone(batch.player);
  batch.command('站务危机');
  assert.deepEqual(batch.player, original);
  assert.equal(batch.finish().ok, true);
  assert.equal(batch.player.复活地球.version, 7);
  assert.equal(batch.player.复活地球.station.crisis, null);
  assert.equal(batch.player.复活地球.credits, original.复活地球.credits + 350 - 45);
  assert.equal(batch.player.复活地球.bag.工程部件, original.复活地球.bag.工程部件 + 10);
  const signal = signalFixture('回声');
  signal.command('调查 信号 确认');
  const old = downgradeV5(signal);
  const pattern = old.expedition.signal.pattern;
  assert.equal(signal.finish().ok, true);
  assert.equal(signal.player.复活地球.expedition.signal.pattern, pattern);
  assert.equal(signal.player.复活地球.expedition.signal.investigated, true);
  assert.equal(signal.player.复活地球.station.crisis, null);
  const path = pathFixture('化凡');
  path.act('化凡');
  path.command('抉择 匀出配给 确认');
  downgradeV5(path);
  assert.equal(path.finish().ok, true);
  assert.equal(path.player.复活地球.body.mortalSteps, 1);
  assert.equal(path.player.复活地球.station.crisis, null);
});

test('损坏公议档案、跳段记录与错配行动暂停且保留原始快照，不默认为尚未参加', () => {
  const f = fixture({ realm: 2, cultivation: 100 });
  f.command('参与危机 确认');
  f.command('公议 机械检修 确认');
  for (const corrupt of [
    s => { delete s.station.crisis; },
    s => { s.station.crisis = null; },
    s => { s.station.crisis = []; },
    s => { s.station.crisis.choices = {}; },
    s => { s.station.crisis.choices = [{ event: '配给争议', choice: '贡献优先' }]; },
    s => { s.station.crisis.choices = [{ event: '失压警报', choice: '封存名册' }]; },
    s => { s.station.crisis.choices = [{ event: '失压警报', choice: '机械检修' }, { event: '失压警报', choice: '机械检修' }]; },
    s => { s.action.event = '配给争议'; },
    s => { s.action.choice = '未知'; },
    s => { s.action.rulesVersion = 5; },
    s => { s.action.livingCost = 0; },
    s => { s.action.cultivationCost = 25; },
    s => { delete s.action.cultivationCost; },
    s => { s.action.risk = 0.5; },
    s => { s.place = '塔监狱'; },
  ]) {
    const player = structuredClone(f.player);
    corrupt(player.复活地球);
    const before = structuredClone(player);
    for (const text of ['状态', '站务危机', '结算', '工作']) {
      assert.equal(earth.runRevivalCommand(player, text, { now: player.复活地球.action.endAt }).changed, false, text);
      assert.deepEqual(player, before);
    }
  }
  const idle = fixture();
  delete idle.player.复活地球.station.crisis;
  const before = structuredClone(idle.player);
  assert.equal(idle.command('站务危机').ok, false);
  assert.deepEqual(idle.player, before);
});

test('公议为个人支线，不影响另一玩家；离界保留已结或未结后记，不另设飞升拦截', () => {
  const other = fixture({ realm: 5 });
  const untouched = structuredClone(other.player);
  for (const finished of [false, true]) {
    const f = fixture({ realm: 5 });
    f.player.复活地球.facilities.接引装置 = true;
    f.player.复活地球.knowledge.离界坐标 = true;
    f.command('参与危机 确认');
    f.act('公议 轮班供氧 确认');
    if (finished) {
      f.act('公议 贡献优先 确认');
      f.act('公议 封存名册 确认');
    }
    const crisis = structuredClone(f.player.复活地球.station.crisis);
    const result = f.command('离界 确认');
    assert.equal(result.ok, true, result.message);
    assert.match(result.message, finished ? /孟乔的空床/ : /未结的公案/);
    assert.equal(f.player.复活地球.body.realm, 5);
    assert.deepEqual(f.player.复活地球.station.crisis, crisis);
    assert.match(f.command('站务危机').message, finished ? /封档理由/ : /后续结果没有补造/);
    assert.equal(f.command('公议 公开核账 确认').changed, false);
  }
  assert.deepEqual(other.player, untouched);
});

test('实际入口参与、公议与结算幂等，写入失败保留费用、积分和未兑现档案', async () => {
  const f = fixture({ realm: 2, cultivation: 100 });
  const app = appFixture(f.player);
  await app.send('#复活地球 站务危机');
  await app.send('#复活地球 参与危机');
  assert.equal(app.writes(), 0);
  await Promise.all([
    app.send('#复活地球 参与危机 确认', 'public-join'),
    app.send('#复活地球 参与危机 确认', 'public-join'),
  ]);
  assert.equal(app.writes(), 1);
  const joined = structuredClone(app.disk());
  const failed = appFixture(joined, { failWrite: true });
  await failed.send('#复活地球 公议 灵力稳压 确认', 'public-action');
  assert.deepEqual(failed.disk(), joined);
  assert.match(failed.replies.at(-1), /未确认完成/);
  await Promise.all([
    app.send('#复活地球 公议 灵力稳压 确认', 'public-action'),
    app.send('#复活地球 公议 灵力稳压 确认', 'public-action'),
  ]);
  assert.equal(app.writes(), 2);
  assert.equal(app.disk().复活地球.body.cultivation, 75);
  assert.equal(app.disk().复活地球.credits, 99995);
  assert.equal(app.disk().复活地球.station.crisis.choices.length, 0);
  app.disk().复活地球.action.endAt = 0;
  const pending = structuredClone(app.disk());
  const failFinish = appFixture(pending, { failWrite: true });
  await failFinish.send('#复活地球 结算', 'public-finish');
  assert.deepEqual(failFinish.disk(), pending);
  assert.doesNotMatch(failFinish.replies.at(-1), /公议兑现/);
  const retry = appFixture(pending);
  await Promise.all([
    retry.send('#复活地球 结算', 'public-finish'),
    retry.send('#复活地球 结算', 'public-finish'),
  ]);
  assert.equal(retry.writes(), 1);
  assert.equal(retry.disk().复活地球.station.contribution, 2);
  assert.equal(retry.disk().复活地球.station.crisis.choices.length, 1);
  assert.equal(retry.disk().复活地球.credits, 99995);
  assert.equal(retry.disk().复活地球.body.cultivation, 75);
});

const V7_SIGNAL_ROLLS = { 回声: 0.01, 借影: 0.09, 错时: 0.15, 索名: 0.22 };
const V7_SIGNAL_ANSWERS = { 回声: '切断广播', 借影: '遮断镜头', 错时: '锁定时钟', 索名: '关闭回传' };

function v7SignalFixture(pattern) {
  const f = fixture({ realm: 2, phase: 2, cultivation: 90 });
  const rolls = [0.99, 0.99, V7_SIGNAL_ROLLS[pattern]];
  assert.equal(f.command('探索 塔底调查 确认', 0.99, { random: () => rolls.shift() }).ok, true);
  f.finish();
  assert.equal(f.player.复活地球.expedition.signal.pattern, pattern);
  return f;
}

test('v7四组塔事件均由开始时保存的随机值决定，读档与查询不刷新', () => {
  for (const [roll, event] of [[0, '读数矛盾'], [0.2499, '读数矛盾'], [0.25, '同号名册'], [0.4999, '同号名册'], [0.5, '熄灯点名'], [0.7499, '熄灯点名'], [0.75, '轮换分离'], [0.9999, '轮换分离']]) {
    const f = fixture();
    f.player.复活地球.place = '塔监狱';
    f.act('观察 规章');
    f.command('交谈', roll);
    const saved = structuredClone(f.player);
    const result = earth.runRevivalCommand(saved, '结算', { now: saved.复活地球.action.endAt, random: () => { throw Error('不能重抽'); } });
    assert.equal(result.ok, true, result.message);
    assert.equal(saved.复活地球.tower.event, event);
    const before = structuredClone(saved);
    assert.equal(earth.runRevivalCommand(saved, '事件').changed, false);
    assert.equal(earth.runRevivalCommand(saved, '交谈').ok, false);
    assert.deepEqual(saved, before);
  }
});

test('新增狱友五种选择各自兑现工时、可靠性或同行风险，清零边界不变', () => {
  for (const [eventRoll, choice, minutes, stale, escort] of [
    [.3, '逐页对照', 20, false, false], [.3, '借用旧号', 5, true, false],
    [.6, '按表独行', 5, true, false], [.6, '补录同伴', 10, false, true], [.6, '手抄核对', 25, false, false],
  ]) {
    const f = fixture();
    f.player.复活地球.place = '塔监狱';
    for (let i = 0; i < 3; i++) f.act('观察');
    f.act('交谈', eventRoll);
    const before = structuredClone(f.player);
    const event = f.player.复活地球.tower.event;
    assert.equal(f.command(`抉择 ${choice}`, 0, { random: () => { throw Error('预览不抽签'); } }).changed, false);
    assert.deepEqual(f.player, before);
    f.setNow(10_000_000);
    assert.equal(f.command(`抉择 ${choice} 确认`).ok, true);
    assert.equal(f.player.复活地球.action.endAt, 10_000_000 + minutes * 60_000);
    assert.equal(f.player.复活地球.action.livingCost, 0);
    f.finish();
    assert.equal(f.player.复活地球.tower.stale, stale);
    assert.equal(f.player.复活地球.tower.escort, escort);
    assert.equal(f.player.复活地球.tower.ally, true);
    assert.deepEqual(f.player.复活地球.bag, before.复活地球.bag);
    assert.equal(f.player.复活地球.credits, before.复活地球.credits);
    assert.ok(f.player.复活地球.lifeTrace.some(row => row.command === `抉择兑现 ${event}·${choice}`));
    f.act('推演'); f.act('候时');
    assert.equal(f.command('越狱 确认').ok, true);
    assert.equal(f.player.复活地球.action.risk, (5 + (stale ? 15 : 0) + (escort ? 10 : 0)) / 100);
    f.finish();
    assert.equal(f.player.复活地球.place, '空间站');
    assert.equal(f.player.复活地球.station.contribution, escort ? 3 : 0);
    assert.equal(f.player.复活地球.body.realm, 0);
    assert.deepEqual(f.player.复活地球.bag, {});
  }
});

test('借影与错时沿用调查核验成本，各种链路处置改变真实行动风险', () => {
  for (const pattern of ['借影', '错时']) for (const method of ['手工', '科技']) {
    for (const choice of Object.values(V7_SIGNAL_ANSWERS)) {
      const f = v7SignalFixture(pattern);
      const before = structuredClone(f.player);
      const credits = before.复活地球.credits;
      f.act('调查 信号 确认', 0);
      assert.equal(f.player.复活地球.anomalyArchive.length, 0);
      const verification = f.act(`核验 ${method} 确认`, 0);
      assert.ok(verification.message.includes(`处置规则：${V7_SIGNAL_ANSWERS[pattern]}，`));
      assert.equal(f.player.复活地球.anomalyArchive.length, 1);
      assert.equal(f.player.复活地球.anomalyArchive[0].pattern, pattern);
      assert.equal(f.player.复活地球.anomalyArchive[0].method, method);
      assert.equal(f.player.复活地球.expedition.window, method === '手工' ? 3 : 4);
      assert.equal(f.player.复活地球.bag.探测器, before.复活地球.bag.探测器 - (method === '科技' ? 1 : 0));
      f.act(`抉择 ${choice} 确认`, 0);
      const x = f.player.复活地球.expedition;
      const adjustment = choice === V7_SIGNAL_ANSWERS[pattern] ? -.05 : .15;
      f.command('应对 隐蔽 确认');
      assert.equal(f.player.复活地球.action.risk, Math.max(.02, Math.min(.9, x.risk + adjustment - .1)));
      assert.equal(f.player.复活地球.credits, credits);
      f.finish(); f.command('撤离 确认');
      assert.equal(f.player.复活地球.action.risk, Math.max(.02, Math.min(.9, x.risk / 2 + adjustment)));
      assert.equal(f.player.复活地球.deaths, 0);
    }
  }
});

test('异常档案在核验结算时落下第一份证据，不在开工或调查时预支', () => {
  const f = v7SignalFixture('借影');
  f.act('调查 信号 确认');
  const before = structuredClone(f.player);
  f.command('核验 科技');
  assert.deepEqual(f.player, before);
  f.command('核验 科技 确认');
  assert.deepEqual(f.player.复活地球.anomalyArchive, []);
  assert.equal(f.command('结算').ok, false);
  const pending = JSON.parse(JSON.stringify(f.player));
  const result = earth.runRevivalCommand(pending, '结算', { now: pending.复活地球.action.endAt + 100_000_000, random: () => { throw Error('离线不补抽'); }, requestId: 'archive-settle' });
  assert.equal(result.ok, true, result.message);
  assert.equal(pending.复活地球.anomalyArchive.length, 1);
  const done = structuredClone(pending);
  assert.equal(earth.runRevivalCommand(pending, '结算', { requestId: 'archive-settle' }).changed, false);
  assert.deepEqual(pending, done);
  const info = earth.runRevivalCommand(pending, '异常档案', { random: () => { throw Error('档案不抽签'); } });
  assert.match(info.message, /借影/);
  assert.match(info.message, /遮断镜头/);
  assert.equal(info.changed, false);
  assert.deepEqual(pending, done);
});

test('已存档案不识别下一趟隐藏信号，不替玩家调查或自动降低风险', () => {
  const f = v7SignalFixture('回声');
  f.act('调查 信号 确认'); f.act('核验 手工 确认'); f.act('撤离 确认');
  const rolls = [.99, .99, V7_SIGNAL_ROLLS.错时];
  f.command('探索 塔底调查 确认', .99, { random: () => rolls.shift() });
  f.finish();
  const before = structuredClone(f.player);
  const archive = f.command('异常档案');
  assert.match(archive.message, /【回声】/);
  assert.doesNotMatch(archive.message, /【错时】|锁定时钟|授时数据/);
  assert.equal(f.command('抉择 锁定时钟 确认').ok, false);
  assert.deepEqual(f.player, before);
  f.command('撤离 确认');
  assert.equal(f.player.复活地球.action.risk, Math.max(.02, f.player.复活地球.expedition.risk / 2));
});

test('档案最多四类且重复核验不增加记录，失败真正清修为与随身而保留档案', () => {
  const f = fixture({ realm: 2, phase: 2, cultivation: 90 });
  for (const pattern of ['回声', '借影', '错时', '索名', '借影']) {
    const rolls = [.99, .99, V7_SIGNAL_ROLLS[pattern]];
    f.command('探索 塔底调查 确认', .99, { random: () => rolls.shift() }); f.finish();
    f.act('调查 信号 确认'); f.act('核验 手工 确认');
    f.act('撤离 确认');
  }
  assert.deepEqual(f.player.复活地球.anomalyArchive.map(row => row.pattern), ['回声', '借影', '错时', '索名']);
  const archive = structuredClone(f.player.复活地球.anomalyArchive);
  f.command('接应预算 0'); f.act('探索 塔底调查 确认', 0);
  assert.equal(f.player.复活地球.place, '塔监狱');
  assert.equal(f.player.复活地球.body.realm, 0);
  assert.equal(f.player.复活地球.body.cultivation, 0);
  assert.deepEqual(f.player.复活地球.bag, {});
  assert.deepEqual(f.player.复活地球.anomalyArchive, archive);
  assert.match(f.command('异常档案').message, /已核验4\/4/);
});

test('v1至v6档案查询和预览不迁移，成功动作才升级v7并留空档案', () => {
  for (const downgrade of [downgradeFixture, downgradeV2, downgradeV3, downgradeV4, downgradeV5, downgradeV6]) {
    const f = fixture(); downgrade(f);
    const before = structuredClone(f.player);
    const query = f.command('异常档案', 0, { random: () => { throw Error('不抽签'); } });
    assert.equal(query.ok, true, query.message);
    assert.match(query.message, /已核验0\/4/);
    assert.deepEqual(f.player, before);
    assert.equal(f.command('工作 工程检修 2').changed, false);
    assert.deepEqual(f.player, before);
    assert.equal(f.command('工作').ok, true);
    assert.equal(f.player.复活地球.version, 7);
    assert.deepEqual(f.player.复活地球.anomalyArchive, []);
  }
});

test('v6已开始的交谈保持两组旧事件，待选事件和同行承诺原样兑现', () => {
  for (const [roll, event, choice] of [[.3, '读数矛盾', '共同核验'], [.6, '轮换分离', '共用窗口']]) {
    const f = fixture(); f.player.复活地球.place = '塔监狱'; f.act('观察 规章'); f.command('交谈', roll);
    downgradeV6(f);
    const savedAction = structuredClone(f.player.复活地球.action);
    assert.equal(f.command('异常档案').changed, false);
    assert.deepEqual(f.player.复活地球.action, savedAction);
    f.finish();
    assert.equal(f.player.复活地球.tower.event, event);
    f.command(`抉择 ${choice} 确认`); downgradeV6(f); f.finish();
    assert.equal(f.player.复活地球.tower.ally, true);
    assert.equal(f.player.复活地球.tower.escort, choice === '共用窗口');
    assert.deepEqual(f.player.复活地球.anomalyArchive, []);
  }
});

test('v6核验行动不补档案、不重抽信号，迁移后新核验才建档', () => {
  const f = v7SignalFixture('回声');
  f.act('调查 信号 确认'); f.command('核验 科技 确认');
  const old = downgradeV6(f);
  const saved = structuredClone(old.action);
  const beforeCredits = old.credits;
  const beforeDetectors = old.bag.探测器;
  const result = f.command('结算', 0, { now: saved.endAt, random: () => { throw Error('旧行动不重抽'); } });
  assert.equal(result.ok, true, result.message);
  assert.equal(f.player.复活地球.expedition.signal.pattern, '回声');
  assert.equal(f.player.复活地球.expedition.signal.verified, true);
  assert.deepEqual(f.player.复活地球.anomalyArchive, []);
  assert.equal(f.player.复活地球.credits, beforeCredits);
  assert.equal(f.player.复活地球.bag.探测器, beforeDetectors);
  const next = v7SignalFixture('索名');
  next.act('调查 信号 确认'); downgradeV6(next);
  next.act('核验 手工 确认');
  assert.equal(next.player.复活地球.anomalyArchive[0].pattern, '索名');
});

test('损坏档案、新类型混入旧行动、错误新处置均保持原始快照', () => {
  for (const damage of [
    s => { delete s.anomalyArchive; }, s => { s.anomalyArchive = {}; },
    s => { s.anomalyArchive = [{ pattern: '不存在', at: 1, life: 1, method: '手工' }]; },
    s => { s.anomalyArchive = [{ pattern: '回声', at: -1, life: 1, method: '手工' }]; },
    s => { s.anomalyArchive = [{ pattern: '回声', at: 1, life: 2, method: '手工' }]; },
    s => { s.anomalyArchive = [{ pattern: '回声', at: 1, life: 1, method: '猜测' }]; },
    s => { s.anomalyArchive = Array.from({ length: 2 }, () => ({ pattern: '回声', at: 1, life: 1, method: '手工' })); },
  ]) {
    const f = fixture(); damage(f.player.复活地球);
    const before = structuredClone(f.player);
    for (const command of ['状态', '异常档案', '工作']) assert.equal(f.command(command).ok, false);
    assert.deepEqual(f.player, before);
  }
  const f = v7SignalFixture('借影'); f.command('调查 信号 确认');
  f.player.复活地球.action.rulesVersion = 6;
  const before = structuredClone(f.player);
  assert.equal(f.command('结算').ok, false);
  assert.deepEqual(f.player, before);
  const input = v7SignalFixture('错时'); input.act('调查 信号 确认');
  for (const command of ['抉择 __proto__ 确认', '抉择 锁定时钟 多余 确认', '核验 科技 确认']) {
    const snapshot = structuredClone(input.player);
    assert.equal(input.command(command, 0, { random: () => NaN }).ok, false);
    assert.deepEqual(input.player, snapshot);
  }
});

test('借影和错时零窗口可撤离，档案不消耗接应预算或改变旧风险', () => {
  for (const pattern of ['借影', '错时']) {
    const f = v7SignalFixture(pattern);
    f.player.复活地球.expedition.window = 0;
    f.player.复活地球.bag = {};
    f.player.复活地球.credits = 0;
    const before = structuredClone(f.player);
    assert.equal(f.command('调查 信号 确认').ok, false);
    assert.equal(f.command('核验 科技 确认').ok, false);
    assert.deepEqual(f.player, before);
    assert.equal(f.command('撤离 确认').ok, true);
    assert.equal(f.player.复活地球.action.risk, Math.min(.9, f.player.复活地球.expedition.risk / 2 + .25));
    f.finish();
    assert.equal(f.player.复活地球.place, '空间站');
    assert.deepEqual(f.player.复活地球.anomalyArchive, []);
  }
});

test('新核验与档案通过实际命令类的锁和收据；落盘失败不泄露尚未提交的核验结果', async () => {
  const f = v7SignalFixture('错时'); f.act('调查 信号 确认');
  const app = appFixture(f.player);
  await Promise.all([app.send('#复活地球 核验 科技 确认', 'v7-verify'), app.send('#复活地球 核验 科技 确认', 'v7-verify')]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().复活地球.bag.探测器, 99);
  assert.deepEqual(app.disk().复活地球.anomalyArchive, []);
  app.disk().复活地球.action.endAt = 0;
  const pending = structuredClone(app.disk());
  const failed = appFixture(pending, { failWrite: true });
  await failed.send('#复活地球 结算', 'v7-finish');
  assert.deepEqual(failed.disk(), pending);
  assert.doesNotMatch(failed.replies.at(-1), /处置规则：锁定时钟/);
  const retry = appFixture(pending);
  await Promise.all([retry.send('#复活地球 结算', 'v7-finish'), retry.send('#复活地球 结算', 'v7-finish')]);
  assert.equal(retry.writes(), 1);
  assert.equal(retry.disk().复活地球.anomalyArchive.length, 1);
  await retry.send('#复活地球 异常档案', 'archive-read');
  assert.equal(retry.writes(), 1);
  assert.match(retry.replies.at(-1), /错时/);
});

test('离界后的异常档案只读封存，不增加接引门槛，也不修改另一名玩家', () => {
  const f = fixture({ realm: 5 });
  f.player.复活地球.anomalyArchive = [{ pattern: '借影', at: 1, life: 1, method: '手工' }];
  f.player.复活地球.knowledge.离界坐标 = true;
  f.player.复活地球.facilities.接引装置 = true;
  const other = fixture({ realm: 2 });
  const beforeOther = structuredClone(other.player);
  assert.equal(f.command('离界 确认').ok, true);
  const saved = structuredClone(f.player);
  assert.match(f.command('异常档案').message, /档案封存/);
  assert.deepEqual(f.player, saved);
  assert.deepEqual(other.player, beforeOther);
});

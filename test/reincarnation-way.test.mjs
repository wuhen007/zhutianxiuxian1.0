import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import * as logic from '../model/reincarnationWay.js';

const patch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = path.resolve(process.env.REINCARNATION_HOST_PLUGIN || patch);
const { withPlayerMutationLock } = await import(pathToFileURL(path.join(host, 'utils/playerMutationLock.js')));
const authority = await import(pathToFileURL(path.join(host, 'model/realmAuthority.js')));
const state = (realm = '生死境', stage = 0, progress = 0) => ({
  境界: `${realm}${logic.REINCARNATION_STAGE_NAMES[stage]}`,
  生死境: { 阶段: 0, 进度: 0, 掌控生死: .1, 突破寿元压制: 0 },
  岁月境: { 阶段: 0, 进度: 0, 掌控时间: 0, 改变时代: 0 },
  [realm]: { 阶段: stage, 进度: progress }, 修炼记录: [],
});
const rich = extra => ({ 修为: 1e15, 寿元: 1e15, mijinglevel_id: 15, 名号: '隔离测试角色', ...extra });
const json = value => JSON.parse(JSON.stringify(value));

function harness({ player = rich(), players, source, guard = true, saveError = false } = {}) {
  const records = new Map(Object.entries(players || { 'test-user': player }).map(([id, value]) => [id, structuredClone(value)]));
  let reads = 0, writes = 0;
  const replies = [];
  const dependencies = {
    ...logic, ...authority, withPlayerMutationLock, structuredClone,
    fs, path, config: { getConfig() { throw new Error('Unexpected real config access'); }, setConfig() { throw new Error('Unexpected global config mutation'); } },
    data: {}, ensureDaoPath: () => {}, console,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => guard,
    channel: async id => id === 'mapped-official-id' ? 'test-user' : id,
    existplayer: async id => records.has(id),
    Read_player: async id => { reads++; return structuredClone(records.get(id)); },
    Write_player: async (id, value) => { if (saveError) throw new Error('simulated save failure'); writes++; records.set(id, structuredClone(value)); },
    bigNumberTransform: value => String(value),
  };
  // Execute the real command class without loading its game bootstrap or adapters.
  const text = (source || fs.readFileSync(path.join(patch, 'apps/User/daofa.js'), 'utf8'))
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '')
    .replace('export class daofa', 'class daofa');
  const App = vm.runInNewContext(`${text}\n;daofa`, dependencies, { filename: 'isolated-daofa.js', timeout: 1500 });
  const app = new App();
  const event = (msg = '#修炼轮回大道', values = {}) => ({
    msg, user_id: 'test-user', reply: async text => { replies.push(text); return true; }, ...values,
  });
  return { app, records, replies, event, reads: () => reads, writes: () => writes };
}

test('合法修炼参数1～99，拒绝0/负数/小数/过大/超长数', () => {
  for (const [text, expected] of [['#修炼轮回大道', 1], ['#修炼轮回大道*99', 99], ['#修炼轮回大道 * 2', 2]]) {
    assert.equal(logic.parseReincarnationBatch(text), expected);
  }
  for (const text of ['#修炼轮回大道*0', '#修炼轮回大道*-1', '#修炼轮回大道*1.5', '#修炼轮回大道*100', '#修炼轮回大道*9999999999999999999', '#修炼轮回大道*abc']) {
    assert.equal(logic.parseReincarnationBatch(text), null);
  }
});
test('未入门模板不会掉入错误岁月消耗分支', () => {
  const p = rich({ 轮回大道: { 境界: '未入门' } });
  const r = logic.planReincarnationCultivation(p, 1);
  assert.equal(r.ok, true); assert.equal(r.total.cultivation, 1e8);
  assert.equal(r.state.境界, '生死境初期'); assert.equal(r.state.生死境.进度, 5);
  assert.equal(p.轮回大道.境界, '未入门');
});
test('生死初期95%一次达到中期，名称和能力同时更新', () => {
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: state('生死境', 0, 95) }), 1);
  assert.equal(r.state.境界, '生死境中期');
  assert.equal(r.state.生死境.阶段, 1); assert.equal(r.state.生死境.进度, 0);
  assert.equal(r.state.生死境.掌控生死, .3);
  assert.equal(r.state.生死境.突破寿元压制, .1);
});
test('跨小阶段进度溢出保留，不归零丢失', () => {
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: state('生死境', 2, 99) }), 1);
  assert.equal(r.state.境界, '生死境大圆满');
  assert.equal(r.state.生死境.进度, 2);
});
test('跨大境界标记生死境完成并只推进岁月进度', () => {
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: state('生死境', 3, 99) }), 1);
  assert.equal(r.state.境界, '岁月境初期');
  assert.equal(r.state.生死境.阶段, 3); assert.equal(r.state.生死境.进度, 100);
  assert.equal(r.state.生死境.掌控生死, 1);
  assert.equal(r.state.岁月境.进度, 1); assert.equal(r.state.岁月境.掌控时间, .1);
});
test('线上观察到的旧档形状：岁月19%不再被生死15%覆盖', () => {
  const old = { 境界: '岁月境初期', 生死境: { 阶段: 0, 进度: 15 }, 岁月境: { 阶段: 0, 进度: 19 }, 修炼记录: [] };
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: old }), 1);
  assert.equal(r.state.岁月境.进度, 23);
  assert.equal(r.state.生死境.阶段, 3);
  assert.equal(r.total.cultivation, 1e9);
});
test('同一批跨阶段逐次重算费用和进度', () => {
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: state('生死境', 0, 95) }), 2);
  assert.equal(r.total.cultivation, 1e8 + 1.5e8);
  assert.equal(r.total.lifespan, (1e8 + 1.5e8) * 100);
  assert.equal(r.state.生死境.进度, 4);
  assert.deepEqual(r.state.修炼记录.map(item => item.进度增加), [5, 4]);
});
test('同一批跨生死和岁月切换单次价格', () => {
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: state('生死境', 3, 98) }), 2);
  assert.equal(r.total.cultivation, 337500000 + 1000000000);
  assert.equal(r.state.岁月境.进度, 4);
});
test('满级自动停止剩余次数，只扣实际执行的修炼费用', () => {
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: state('岁月境', 3, 99) }), 99);
  assert.equal(r.actualCount, 1);
  assert.equal(r.total.cultivation, 8e9);
  assert.equal(r.state.岁月境.阶段, 3); assert.equal(r.state.岁月境.进度, 100);
  assert.equal(r.state.岁月境.改变时代, .5);
  assert.equal(r.maxed, true);
});
test('已满级不再扣费，不再生成NaN或越界阶段', () => {
  const p = rich({ 轮回大道: state('岁月境', 3, 100) }); const before = structuredClone(p);
  const r = logic.planReincarnationCultivation(p, 2);
  assert.equal(r.ok, false); assert.equal(r.reason, 'maxed'); assert.deepEqual(p, before);
});
test('批量资源不足整批不扣费、不初始化存档', () => {
  const p = rich({ 修为: 100000001 }); const before = structuredClone(p);
  const r = logic.planReincarnationCultivation(p, 2);
  assert.equal(r.ok, false); assert.equal(r.reason, 'resources');
  assert.deepEqual(p, before);
});
test('跨阶累计费用精确校验，不只按最初低价判断', () => {
  const p = rich({ 轮回大道: state('生死境', 0, 95), 修为: 200000000 });
  const r = logic.planReincarnationCultivation(p, 2);
  assert.equal(r.reason, 'resources'); assert.equal(r.total.cultivation, 250000000);
});
test('寿元不足同样不扣修为', () => {
  const p = rich({ 寿元: 1 }); const before = structuredClone(p);
  assert.equal(logic.planReincarnationCultivation(p, 1).reason, 'resources');
  assert.deepEqual(p, before);
});
test('资源字段拒绝NaN/Infinity/缺失/负值，数字字符串规范处理', () => {
  for (const value of [NaN, Infinity, undefined, null, false, -1, '']) {
    assert.equal(logic.planReincarnationCultivation(rich({ 修为: value }), 1).reason, 'resources-invalid');
  }
  const r = logic.planReincarnationCultivation(rich({ 修为: '1000000000', 寿元: '100000000000' }), 1);
  assert.equal(typeof r.cultivationAfter, 'number'); assert.equal(r.cultivationAfter, 900000000);
});
test('极大余额导致浮点扣费为0时拒绝免费修炼', () => {
  assert.equal(logic.planReincarnationCultivation(rich({ 修为: 1e100 }), 1).reason, 'precision');
});
test('原资源倍率与进度表八个阶段全部保留', () => {
  for (const realm of ['生死境', '岁月境']) for (let n = 0; n < 4; n++) {
    const step = logic.getReincarnationStep(state(realm, n));
    assert.equal(step.cultivation, realm === '生死境' ? 1e8 * 1.5 ** n : 1e9 * 2 ** n);
    assert.equal(step.lifespan, step.cultivation * 100);
    assert.equal(step.progress, (realm === '生死境' ? [5, 4, 3, 2] : [4, 3, 2, 1])[n]);
  }
});
test('八个阶段每个都有单调进度，完整练到封顶', () => {
  const player = rich(); const names = new Set();
  for (let i = 0; i < 500; i++) {
    const r = logic.planReincarnationCultivation(player, 1);
    assert.equal(r.ok, true);
    player.轮回大道 = r.state; player.修为 = r.cultivationAfter; player.寿元 = r.lifespanAfter;
    names.add(r.afterRealm);
    assert.equal(JSON.stringify(r).includes('NaN'), false);
    if (r.maxed) break;
  }
  assert.equal(names.size, 8);
  assert.equal(logic.getReincarnationStatus(player.轮回大道).maxed, true);
});
test('批量与逐次修炼相同次数时总成本、进度、能力等价', () => {
  let p = rich({ 轮回大道: state('生死境', 2, 97) });
  const batch = logic.planReincarnationCultivation(p, 99, { now: 1000 });
  for (let n = 0; n < batch.actualCount; n++) {
    const r = logic.planReincarnationCultivation(p, 1, { now: 1000 });
    p = { ...p, 修为: r.cultivationAfter, 寿元: r.lifespanAfter, 轮回大道: r.state };
  }
  assert.deepEqual(p.轮回大道, batch.state);
  assert.equal(p.修为, batch.cultivationAfter); assert.equal(p.寿元, batch.lifespanAfter);
});
test('同境界名称与数字阶段不一致时保留已达到的较高阶段', () => {
  const r = logic.normalizeReincarnationWay({ ...state('生死境', 0, 0), 生死境: { 阶段: 2, 进度: 20 } });
  assert.equal(r.境界, '生死境后期'); assert.equal(r.生死境.掌控生死, .6);
  assert.equal(logic.normalizeReincarnationWay({ ...state('生死境', 3), 生死境: { 阶段: 0, 进度: 0 } }).生死境.阶段, 3);
});
test('残缺嵌套字段、异常阶段和字符串旧字段可安全显示', () => {
  for (const raw of [undefined, null, [], {}, { 境界: '岁月境初期' }, { 境界: 2, 生死境: null },
    { 境界: '岁月境初期', 岁月境: { 阶段: 9, 进度: 40 } }]) {
    const r = logic.normalizeReincarnationWay(raw);
    assert.ok(Number.isFinite(r.生死境.掌控生死));
    assert.ok(Number.isFinite(r.岁月境.改变时代));
    assert.ok(r.岁月境.阶段 <= 3);
  }
  const r = logic.normalizeReincarnationWay({ 境界: '生死境初期', 生死境: { 阶段: '2', 进度: '13.5' } });
  assert.equal(r.生死境.阶段, 2); assert.equal(r.生死境.进度, 13.5);
});
test('不从389条旧修炼日志推算或补发等级', () => {
  const old = { ...state('岁月境', 0, 19), 修炼记录: Array.from({ length: 389 }, () => ({ 消耗修为: 1e9 })) };
  const r = logic.normalizeReincarnationWay(old);
  assert.equal(r.境界, '岁月境初期'); assert.equal(r.岁月境.进度, 19);
  assert.equal(r.修炼记录.length, 389);
});
test('未知扩展字段保留，日志上限500', () => {
  const old = { ...state(), 扩展: { keep: true }, 修炼记录: Array.from({ length: 500 }, (_, i) => ({ seq: i })) };
  const r = logic.planReincarnationCultivation(rich({ 轮回大道: old }), 2);
  assert.deepEqual(r.state.扩展, { keep: true }); assert.equal(r.state.修炼记录.length, 500);
  assert.equal(r.state.修炼记录[0].seq, 2);
});
test('更高岁月境保留生死权限，岁月大圆满才可推进时代', () => {
  assert.equal(logic.canControlLifeDeath(state('生死境', 2)), false);
  assert.equal(logic.canControlLifeDeath(state('生死境', 3)), true);
  assert.equal(logic.canControlLifeDeath(state('岁月境', 0)), true);
  assert.equal(logic.canAdvanceReincarnationEra(state('岁月境', 2)), false);
  assert.equal(logic.canAdvanceReincarnationEra(state('岁月境', 3)), true);
});
test('规则入口存在且可匹配原有指令和显式同步', () => {
  const h = harness();
  for (const text of ['#轮回大道', '#修炼轮回大道', '#修炼轮回大道*99', '#同步轮回大道']) {
    assert.ok(h.app.rule.some(r => new RegExp(r.reg).test(text)));
  }
});
test('命令端修炼单次写入并在保存后回复', async () => {
  const h = harness({ player: rich({ 轮回大道: state('生死境', 0, 95) }) });
  await h.app.cultivateReincarnationWay(h.event());
  assert.equal(h.writes(), 1); assert.equal(h.records.get('test-user').轮回大道.境界, '生死境中期');
  assert.match(h.replies[0], /境界提升/);
});
test('两个并发修炼在同玩家锁内读档，不覆盖进度或漏扣费', async () => {
  const h = harness({ player: rich({ 轮回大道: state('生死境', 0, 95) }) });
  await Promise.all([h.app.cultivateReincarnationWay(h.event()), h.app.cultivateReincarnationWay(h.event())]);
  const p = h.records.get('test-user');
  assert.equal(p.轮回大道.生死境.进度, 4);
  assert.equal(p.修为, 1e15 - 1e8 - 1.5e8);
  assert.equal(h.writes(), 2);
});
test('并发请求中仅够一次时第二次不扣成负数', async () => {
  const h = harness({ player: rich({ 修为: 1e8, 寿元: 1e10 }) });
  await Promise.all([h.app.cultivateReincarnationWay(h.event()), h.app.cultivateReincarnationWay(h.event())]);
  assert.equal(h.writes(), 1);
  assert.equal(h.records.get('test-user').修为, 0);
  assert.ok(h.replies.some(msg => msg.includes('资源不足')));
});
test('主身份映射与已有角色检查在修炼前生效', async () => {
  const h = harness();
  await h.app.cultivateReincarnationWay(h.event('#修炼轮回大道', { user_id: 'mapped-official-id' }));
  assert.equal(h.writes(), 1);
  await h.app.cultivateReincarnationWay(h.event('#修炼轮回大道', { user_id: 'no-player' }));
  assert.equal(h.writes(), 1);
  assert.match(h.replies.at(-1), /先创建/);
});
test('准帝门槛沿用三大体系统一权柄，低级角色不扣费', async () => {
  const denied = harness({ player: rich({ mijinglevel_id: 14 }) });
  await denied.app.cultivateReincarnationWay(denied.event());
  assert.equal(denied.writes(), 0); assert.match(denied.replies[0], /需达到准帝/);
  for (const extra of [{ mijinglevel_id: 1, xiangulevel_id: 14 }, { mijinglevel_id: 1, huafenlevel_id: 14 }]) {
    const h = harness({ player: rich(extra) });
    await h.app.cultivateReincarnationWay(h.event()); assert.equal(h.writes(), 1);
  }
});
test('角色封锁检查保留，参数无效不读不写玩家', async () => {
  const locked = harness({ guard: false });
  await locked.app.cultivateReincarnationWay(locked.event());
  assert.equal(locked.reads(), 0); assert.equal(locked.writes(), 0);
  const h = harness(); await h.app.cultivateReincarnationWay(h.event('#修炼轮回大道*0'));
  assert.equal(h.reads(), 0); assert.equal(h.writes(), 0);
});
test('写入失败不会回复修炼成功', async () => {
  const h = harness({ saveError: true });
  await assert.rejects(h.app.cultivateReincarnationWay(h.event()), /simulated save failure/);
  assert.equal(h.writes(), 0); assert.equal(h.replies.length, 0);
});
test('查询旧档只读不写，显式同步不消耗资源且幂等', async () => {
  const h = harness({ player: rich({ 轮回大道: { 境界: '岁月境初期', 生死境: { 阶段: 0, 进度: 15 }, 岁月境: { 阶段: 0, 进度: 19 } } }) });
  const before = structuredClone(h.records.get('test-user'));
  await h.app.viewReincarnationWay(h.event('#轮回大道'));
  assert.equal(h.writes(), 0); assert.match(h.replies[0], /19.0%/);
  await h.app.syncReincarnationWay(h.event('#同步轮回大道'));
  assert.equal(h.writes(), 1);
  assert.equal(h.records.get('test-user').修为, before.修为);
  assert.equal(h.records.get('test-user').寿元, before.寿元);
  await h.app.syncReincarnationWay(h.event('#同步轮回大道'));
  assert.equal(h.writes(), 1);
});
test('满级命令明确停止，不写档不扣费', async () => {
  const h = harness({ player: rich({ 轮回大道: state('岁月境', 3, 100) }) });
  await h.app.cultivateReincarnationWay(h.event('#修炼轮回大道*99'));
  assert.equal(h.writes(), 0); assert.match(h.replies[0], /不扣资源/);
});
test('掌控生死支持升入岁月境后的权限、签名年数和目标锁', async () => {
  const h = harness({ players: {
    'test-user': rich({ 轮回大道: state('岁月境', 0) }),
    '123456': rich({ 寿元: 100 }),
  } });
  await h.app.controlLifeDeath(h.event('#掌控生死 @123456 -20', { isMaster: true }));
  assert.equal(h.records.get('123456').寿元, 80);
  await h.app.controlLifeDeath(h.event('#掌控生死 +10', { isMaster: true, at: '123456' }));
  assert.equal(h.records.get('123456').寿元, 90);
});
test('低境玩家不使用时代技能，掌控生死仍限主人且无效参数不写', async () => {
  const h = harness();
  await h.app.controlLifeDeath(h.event('#掌控生死 @123456 1'));
  await h.app.advanceEra2(h.event('#推进时代 1000'));
  await h.app.controlLifeDeath(h.event('#掌控生死 123456', { isMaster: true }));
  assert.equal(h.writes(), 0);
  assert.equal(h.app.rule.find(r => r.fnc === 'advanceEra2').permission, undefined);
  assert.equal(h.app.rule.find(r => r.fnc === 'controlLifeDeath').permission, 'master');
});
test('时代跨世纪正确计算，不依赖未定义的this.eras', () => {
  assert.deepEqual(logic.getReincarnationEraTarget({ index: 4, years: 9500, epoch: 20, totalYears: 999500 }, 1000), {
    index: 0, years: 500, epoch: 21,
  });
  for (const delta of [0, -1, 1.5, 10001, Infinity]) assert.throws(() => logic.getReincarnationEraTarget({ index: 0, years: 0, epoch: 1 }, delta));
});
test('时代数据冲突会报错而不是写错Era.yaml或倒退累计年数', () => {
  assert.throws(() => logic.getReincarnationEraTarget({ index: 0, years: 0, epoch: 1, totalYears: 999000 }, 1), /不一致/);
  assert.throws(() => logic.getReincarnationEraTarget({}, 1), /格式异常/);
});
test('推进时代调用独立的玩家境界入口，不借用管理员设置时代', async () => {
  const h = harness({ player: rich({ 轮回大道: state('岁月境', 3) }) });
  const calls = [];
  h.app.getReincarnationEraManager = async () => ({
    advanceReincarnationEra: async args => {
      calls.push({ playerId: args.playerId, years: args.years, hasIsMaster: Object.hasOwn(args, 'isMaster') });
      return args.reply('mock-manager-ok');
    },
    setEraProgress: async () => { throw new Error('Admin entrance must not be called'); },
  });
  await h.app.advanceEra2(h.event('#推进时代 1000', { isMaster: false }));
  assert.deepEqual(calls, [{ playerId: 'test-user', years: 1000, hasIsMaster: false }]);
  assert.equal(h.writes(), 0);
  assert.match(h.replies[0], /mock-manager-ok/);
});

// Optional read-only reproduction against the saved PRE-PATCH command source.
test('原版复现：升阶段不更新名称能力，岁月19%重复修炼仍停19%', { skip: !process.env.REINCARNATION_ORIGINAL_DAOFA }, async () => {
  const source = fs.readFileSync(process.env.REINCARNATION_ORIGINAL_DAOFA, 'utf8');
  const oldLife = state('生死境', 0, 95); oldLife.生死境.掌控生死 = .1; oldLife.生死境.突破寿元压制 = 0;
  const a = harness({ source, player: rich({ 轮回大道: oldLife }) });
  await a.app.cultivateReincarnationWay(a.event());
  assert.equal(a.records.get('test-user').轮回大道.生死境.阶段, 1);
  assert.equal(a.records.get('test-user').轮回大道.境界, '生死境初期');
  assert.equal(a.records.get('test-user').轮回大道.生死境.掌控生死, .1);
  const oldTime = { 境界: '岁月境初期',
    生死境: { 阶段: 0, 进度: 15, 掌控生死: .1, 突破寿元压制: 0 },
    岁月境: { 阶段: 0, 进度: 19, 掌控时间: .1, 改变时代: 0 }, 修炼记录: [] };
  const b = harness({ source, player: rich({ 轮回大道: oldTime }) });
  await b.app.cultivateReincarnationWay(b.event());
  assert.equal(b.records.get('test-user').轮回大道.岁月境.进度, 19);
  assert.ok(b.records.get('test-user').修为 < 1e15, '原版扣费但进度没增加');
});

test('补丁没有修改自身之道后半部分实现', { skip: !process.env.REINCARNATION_ORIGINAL_DAOFA }, () => {
  const original = fs.readFileSync(process.env.REINCARNATION_ORIGINAL_DAOFA, 'utf8').replace(/\r\n/g, '\n');
  const current = fs.readFileSync(path.join(patch, 'apps/User/daofa.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(current.slice(current.indexOf('async  createOwnWay(e)')), original.slice(original.indexOf('async  createOwnWay(e)')));
});

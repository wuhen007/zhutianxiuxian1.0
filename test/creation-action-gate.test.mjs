import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as gate from '../model/completedSecretPlaceAction.js';

const patch = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = path.resolve(process.env.CREATION_HOST_PLUGIN || patch);
const locks = await import(pathToFileURL(path.join(host, 'model/secretPlaceAddiction.js')));
const playerLocks = await import(pathToFileURL(path.join(host, 'utils/playerMutationLock.js')));
const creation = await import(pathToFileURL(path.join(host, 'model/createEverything.js')));
const authority = await import(pathToFileURL(path.join(host, 'model/realmAuthority.js')));
const nowBase = 1790483015710;
const idle = (extra = {}) => ({
  action: '镇守仙境', end_time: 1790482445148, time: 60000,
  shutup: 1, working: 1, Place_action: 1, Place_actionplus: 1, power_up: 1,
  mojie: '1', xijie: '1', plant: '1', mine: '1', Place_address: { name: '归真之地' }, ...extra,
});

function fixture({ action = idle(), source, level = 23, missingItem = false, failCreationSave = false } = {}) {
  let now = nowBase, inventoryAdds = 0, playerWrites = 0, worldWrites = 0;
  const actionKey = 'xiuxian:player:test-player:action';
  const fashanKey = `${actionKey}:fashan`;
  const lockKey = 'xiuxian:player:test-player:secret-place-settlement-lock';
  const fashanRaw = JSON.stringify({ action: '镇守永恒未知之地', shutup: '0', isFashan: true, end_time: now + 100000000 });
  const kv = new Map([[fashanKey, fashanRaw]]);
  if (action !== null) kv.set(actionKey, typeof action === 'string' ? action : JSON.stringify(action));
  const ops = [];
  let player = { id: 'test-player', 名号: '隔离玩家', 修为: 100000, 血气: 200000, mijinglevel_id: level, 法身状态: '行动中' };
  let world = { 现世承受力: 2000000 };
  const replies = [];
  const redis = {
    async get(key) { ops.push(['get', key]); return kv.get(key) ?? null; },
    async set(key, value, options) {
      ops.push(['set', key, options]);
      if (options?.NX && kv.has(key)) return null;
      if (failCreationSave && key === actionKey && String(value).includes('造化万物')) throw new Error('simulated Redis SET failure');
      kv.set(key, value); return 'OK';
    },
    async del(key) { ops.push(['del', key]); return kv.delete(key) ? 1 : 0; },
  };
  const io = {
    existsSync(file) { return file === 'world.json'; },
    readFileSync(file) { assert.equal(file, 'world.json'); return JSON.stringify(world); },
    writeFileSync(file, bytes) { assert.equal(file, 'world.json'); worldWrites++; world = JSON.parse(bytes); },
  };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const deps = {
    ...gate, ...authority, ...creation, ...playerLocks,
    SECRET_PLACE_SETTLEMENT_BUSY: locks.SECRET_PLACE_SETTLEMENT_BUSY,
    withSecretPlaceSettlementLock: (id, callback) => locks.withSecretPlaceSettlementLock(id, callback, { redisClient: redis }),
    plugin: class { constructor(options) { Object.assign(this, options); } },
    redis, fs: io, path, data: { filePathMap: { weimianList: 'world.json' } }, Date: FakeDate,
    Math: { random: () => .99, ...Object.fromEntries(Object.getOwnPropertyNames(Math).filter(k => k !== 'random').map(k => [k, Math[k]])) },
    console: { log() {}, warn() {}, error() {} },
    channel: async id => id === 'official-alias' ? 'test-player' : id,
    Read_player: async id => { assert.equal(id, 'test-player'); return structuredClone(player); },
    Write_player: async (id, p) => { assert.equal(id, 'test-player'); playerWrites++; player = structuredClone(p); },
    Add_najie_thing: async (id, name, type, count) => { assert.equal(id, 'test-player'); inventoryAdds += count; },
    foundthing: async () => missingItem ? null : { name: '测试材料', class: '道具', 稀有度: 7, 出售价: 1000 },
    addCausalDebt: () => ({ costFree: level >= 23, delta: 0, debt: 0, backlash: null }),
    Read_najie: async () => ({}), Write_najie: async () => { throw new Error('Unexpected inventory erasure'); },
    computeJuelingErasure: () => { throw new Error('Unexpected erasure'); },
  };
  const code = (source || fs.readFileSync(path.join(patch, 'apps/User/zhengdaotixi.js'), 'utf8'))
    .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '').replace(/^export /gm, '');
  const App = vm.runInNewContext(`${code}\n;zhengdaotixi`, deps, { timeout: 1500 });
  const app = new App();
  const event = (msg = '#造化万物 测试材料', extra = {}) => ({
    msg, user_id: 'test-player', isGroup: true, reply: async value => { replies.push(value); return true; }, ...extra,
  });
  return { app, event, redis, kv, ops, replies, actionKey, fashanKey, fashanRaw, lockKey,
    advance: ms => { now += ms; }, player: () => structuredClone(player),
    counts: () => ({ inventoryAdds, playerWrites, worldWrites }) };
}

test('实际混合1/"1"完成态正确判闲，不按永久TTL认定繁忙', () => {
  assert.equal(gate.isCompletedSecretPlaceAction(idle(), nowBase), true);
});
test('任何进行中标记均不放行，即使到期很久也不跳过结算', () => {
  for (const flag of gate.SECRET_PLACE_IDLE_FLAGS) for (const active of [0, '0']) {
    assert.equal(gate.isCompletedSecretPlaceAction(idle({ [flag]: active }), nowBase), false);
  }
});
test('缺失或异常状态标记不被视为已完成', () => {
  for (const flag of gate.SECRET_PLACE_IDLE_FLAGS) for (const value of [undefined, null, false, true, 'idle', 2]) {
    assert.equal(gate.isCompletedSecretPlaceAction(idle({ [flag]: value }), nowBase), false);
  }
});
test('未来时间和无效时间拒绝放行', () => {
  for (const end of [nowBase + 1, NaN, Infinity, null, undefined, '', -1]) {
    assert.equal(gate.isCompletedSecretPlaceAction(idle({ end_time: end }), nowBase), false);
  }
  assert.equal(gate.isCompletedSecretPlaceAction(idle({ end_time: String(nowBase) }), nowBase), true);
});
test('只认已核对的普通秘境动作，其他玩法不误判完成', () => {
  for (const action of ['镇守永恒未知之地', '造化万物', '位面传送', '渡劫', '闭关', '', undefined]) {
    assert.equal(gate.isCompletedSecretPlaceAction(idle({ action }), nowBase), false);
  }
  for (const action of ['探索界海', '秘境历练', '下界八域历练', '九天十地历练', '遮天位面历练', '禁地历练', '探索仙府']) {
    assert.equal(gate.isCompletedSecretPlaceAction(idle({ action }), nowBase), true);
  }
});
test('法身动作和未结清的批量计数始终保留', () => {
  for (const extra of [{ isFashan: true }, { actor: 'fashan' }, { eternal_guard: true },
    { creation: {} }, { total_count: 5, settled_count: 4 }, { total_count: 5 }, { settled_count: 1 }]) {
    assert.equal(gate.isCompletedSecretPlaceAction(idle(extra), nowBase), false);
  }
  assert.equal(gate.isCompletedSecretPlaceAction(idle({ total_count: 5, settled_count: 5 }), nowBase), true);
});
test('判断只读且提示区分未到期与待结算', () => {
  const a = idle(); const before = structuredClone(a);
  gate.isCompletedSecretPlaceAction(a, nowBase); assert.deepEqual(a, before);
  assert.match(gate.formatBlockingAction(idle({ Place_action: 0, end_time: nowBase + 60000 }), nowBase), /剩余约1分钟/);
  assert.match(gate.formatBlockingAction(idle({ Place_action: 0 }), nowBase), /仍需完成结算/);
});
test('截图场景由旧完成态进入造化，不重发镇守收益，不动法身', async () => {
  const h = fixture();
  await h.app.createEverything(h.event());
  const action = JSON.parse(h.kv.get(h.actionKey));
  assert.equal(action.action, '造化万物');
  assert.equal(action.creation.itemName, '测试材料');
  assert.equal(h.kv.get(h.fashanKey), h.fashanRaw);
  assert.deepEqual(h.counts(), { inventoryAdds: 0, playerWrites: 0, worldWrites: 0 });
  assert.match(h.replies[0], /开始造化/);
  assert.equal(h.kv.has(h.lockKey), false);
});
test('读取行动在获取结算锁之后，完成后释放锁', async () => {
  const h = fixture();
  await h.app.createEverything(h.event());
  const lockIndex = h.ops.findIndex(([op, key]) => op === 'set' && key === h.lockKey);
  const readIndex = h.ops.findIndex(([op, key]) => op === 'get' && key === h.actionKey);
  assert.ok(lockIndex >= 0 && readIndex > lockIndex);
  assert.ok(h.ops.some(([op, key]) => op === 'del' && key === h.lockKey));
});
test('到期但活动标记为0时不发奖不创建新动作', async () => {
  const h = fixture({ action: idle({ Place_action: 0 }) });
  const before = h.kv.get(h.actionKey);
  await h.app.createEverything(h.event());
  assert.equal(h.kv.get(h.actionKey), before);
  assert.match(h.replies[0], /仍需完成结算/);
  assert.equal(h.counts().inventoryAdds, 0);
});
test('未来镇守显示等待时间，不能通过造化强制结算', async () => {
  const h = fixture({ action: idle({ Place_action: '0', end_time: nowBase + 90000 }) });
  await h.app.createEverything(h.event());
  assert.match(h.replies[0], /剩余约2分钟/);
  assert.equal(JSON.parse(h.kv.get(h.actionKey)).action, '镇守仙境');
});
test('动作JSON损坏或未知结构不删除也不放行', async () => {
  for (const action of ['{broken', 'null', '[]', '{}', idle({ action: 'unknown' })]) {
    const h = fixture({ action });
    const before = h.kv.get(h.actionKey);
    await h.app.createEverything(h.event());
    assert.equal(h.kv.get(h.actionKey), before);
    assert.equal(h.counts().inventoryAdds, 0);
    assert.ok(!h.replies.some(message => String(message).includes('开始造化')));
  }
});
test('跨进程结算锁被占用时友好回复，无覆盖或强制解锁', async () => {
  const h = fixture(); h.kv.set(h.lockKey, 'another-settler');
  const before = h.kv.get(h.actionKey);
  await h.app.createEverything(h.event());
  assert.equal(h.kv.get(h.lockKey), 'another-settler');
  assert.equal(h.kv.get(h.actionKey), before);
  assert.match(h.replies[0], /当前行动正在结算/);
});
test('结算先关闭标记但仍持有锁时，造化等保存奖励完成后才进入', async () => {
  const h = fixture({ action: idle({ Place_action: 0 }) });
  let unlock, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const settlement = locks.withSecretPlaceSettlementLock('test-player', async () => {
    h.kv.set(h.actionKey, JSON.stringify(idle()));
    entered();
    await new Promise(resolve => { unlock = resolve; });
  }, { redisClient: h.redis });
  await ready;
  const pendingCreation = h.app.createEverything(h.event());
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(JSON.parse(h.kv.get(h.actionKey)).action, '镇守仙境');
  assert.equal(h.replies.length, 0);
  unlock();
  await Promise.all([settlement, pendingCreation]);
  assert.equal(JSON.parse(h.kv.get(h.actionKey)).action, '造化万物');
});
test('无旧动作时仍按原规则开启造化', async () => {
  const h = fixture({ action: null });
  await h.app.createEverything(h.event());
  assert.equal(JSON.parse(h.kv.get(h.actionKey)).creation.minutes, 7);
});
test('仙帝新造化只预扣原承受力成本，不领取物品', async () => {
  const h = fixture({ level: 21 });
  await h.app.createEverything(h.event());
  const a = JSON.parse(h.kv.get(h.actionKey));
  assert.equal(a.creation.totalCost, 10);
  assert.equal(a.creation.minutes, 35);
  assert.deepEqual(h.counts(), { inventoryAdds: 0, playerWrites: 0, worldWrites: 1 });
});
test('低境界和无效物品不清除旧完成记录或扣费', async () => {
  for (const options of [{ level: 20 }, { missingItem: true }]) {
    const h = fixture(options); const before = h.kv.get(h.actionKey);
    await h.app.createEverything(h.event());
    assert.equal(h.kv.get(h.actionKey), before);
    assert.deepEqual(h.counts(), { inventoryAdds: 0, playerWrites: 0, worldWrites: 0 });
  }
});
test('输入无数量或异常数量保持原限制', async () => {
  for (const msg of ['#造化万物', '#造化万物 测试材料 0', '#造化万物 测试材料 -1', '#造化万物 测试材料 1.5']) {
    const h = fixture(); const before = h.kv.get(h.actionKey);
    await h.app.createEverything(h.event(msg));
    assert.equal(h.kv.get(h.actionKey), before);
  }
});
test('现有造化未到期保持原行为和剩余时间提示', async () => {
  const h = fixture();
  await h.app.createEverything(h.event());
  const before = h.kv.get(h.actionKey);
  await h.app.createEverything(h.event());
  assert.equal(h.kv.get(h.actionKey), before);
  assert.match(h.replies[1], /演化中/);
  assert.equal(h.counts().inventoryAdds, 0);
});
test('正常造化到期可领取，不重复回放前次镇守奖励', async () => {
  const h = fixture();
  await h.app.createEverything(h.event());
  h.advance(7 * 60000);
  await h.app.createEverything(h.event('#造化万物'));
  assert.equal(h.counts().inventoryAdds, 1);
  assert.equal(h.counts().playerWrites, 1);
  assert.equal(h.kv.has(h.actionKey), false);
  assert.equal(h.kv.get(h.fashanKey), h.fashanRaw);
});
test('同时发两条新造化，同角色只开一单', async () => {
  const h = fixture();
  await Promise.all([h.app.createEverything(h.event()), h.app.createEverything(h.event())]);
  assert.equal(h.replies.filter(message => String(message).includes('开始造化')).length, 1);
  assert.equal(h.replies.filter(message => String(message).includes('演化中')).length, 1);
});
test('同时领取同一造化只能发一次物品', async () => {
  const h = fixture();
  await h.app.createEverything(h.event());
  h.advance(7 * 60000);
  await Promise.all([h.app.createEverything(h.event('#造化万物')), h.app.createEverything(h.event('#造化万物'))]);
  assert.equal(h.counts().inventoryAdds, 1);
});
test('群聊限定和账号映射保持兼容', async () => {
  const h = fixture();
  await h.app.createEverything(h.event('#造化万物 测试材料', { isGroup: false }));
  assert.equal(h.ops.length, 0);
  await h.app.createEverything(h.event('#造化万物 测试材料', { user_id: 'qg_official-alias' }));
  assert.equal(JSON.parse(h.kv.get(h.actionKey)).action, '造化万物');
});
test('开启造化保存失败仍保留原已完成动作并释放锁', async () => {
  const h = fixture({ failCreationSave: true, level: 21 });
  const before = h.kv.get(h.actionKey);
  await h.app.createEverything(h.event());
  assert.equal(h.kv.get(h.actionKey), before);
  assert.equal(h.kv.has(h.lockKey), false);
  assert.match(h.replies[0], /预扣的现世承受力已返还/);
});
test('旧代码精确复现：已完成镇守有残留键即一律拒绝造化', { skip: !process.env.CREATION_ORIGINAL_SOURCE }, async () => {
  const source = fs.readFileSync(process.env.CREATION_ORIGINAL_SOURCE, 'utf8');
  const h = fixture({ source });
  await h.app.createEverything(h.event());
  assert.match(h.replies[0], /你当前正在进行【镇守仙境】/);
  assert.equal(JSON.parse(h.kv.get(h.actionKey)).action, '镇守仙境');
});
test('补丁仅修改造化入口与繁忙判断，不替换发奖、成本或其他技能', { skip: !process.env.CREATION_ORIGINAL_SOURCE }, () => {
  const old = fs.readFileSync(process.env.CREATION_ORIGINAL_SOURCE, 'utf8').replace(/\r\n/g, '\n');
  const current = fs.readFileSync(path.join(patch, 'apps/User/zhengdaotixi.js'), 'utf8').replace(/\r\n/g, '\n');
  const anchor = '    let authorityLevel = pendingCreation?.authorityLevel ?? getRealmAuthorityLevel(player);';
  assert.equal(current.slice(current.indexOf(anchor)), old.slice(old.indexOf(anchor)));
});

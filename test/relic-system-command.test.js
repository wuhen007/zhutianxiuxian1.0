import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as relicModel from '../model/relicSystem.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const PLAYER_ID = '731001';
const OTHER_ID = '731002';
const SET_NAME = '荒古战血';
const source = fs.readFileSync(new URL('../apps/RelicSystem.js', import.meta.url), 'utf8')
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  .replace('export class', 'class');

function relic(id, quality = '凡耀') {
  return relicModel.createRelic({ id, quality, setName: SET_NAME, random: () => 0.5 });
}

function equipment(bag = [], fragments = 0) {
  const state = relicModel.createEmptyRelicState();
  state.背包 = bag;
  state.碎片 = fragments;
  return { 武器: { name: '原有武器', atk: 123 }, 遗珍: state, unrelated: { keep: true } };
}

function appFixture(initial = equipment(), { failWrite = false } = {}) {
  const disks = new Map([[PLAYER_ID, structuredClone(initial)], [OTHER_ID, equipment()]]);
  const pending = new Map();
  const activeLocks = new Map();
  const reads = [];
  const replies = [];
  const expiries = [];
  let now = 1_000_000;
  let writes = 0;
  let expansionItems = 1;
  const redis = {
    async get(key) {
      const item = pending.get(key);
      if (item && item.expires <= now) pending.delete(key);
      return pending.get(key)?.value ?? null;
    },
    async set(key, value, ...args) {
      const seconds = typeof args[0] === 'object' ? args[0]?.EX
        : String(args[0]).toUpperCase() === 'EX' ? args[1] : undefined;
      const expires = seconds === undefined ? Infinity : now + Number(seconds) * 1000;
      expiries.push(seconds);
      pending.set(key, { value: String(value), expires });
      return 'OK';
    },
    async setEx(key, seconds, value) { return this.set(key, value, { EX: seconds }); },
    async del(key) { return Number(pending.delete(key)); },
  };
  const bindings = {
    ...relicModel, randomUUID, redis, structuredClone,
    console: { warn() {}, error() {}, log() {} },
    Date: class extends Date { static now() { return now; } },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    channel: async id => String(id),
    existplayer: async id => disks.has(String(id)),
    Read_equipment: async id => {
      id = String(id);
      reads.push({ id, locked: (activeLocks.get(id) || 0) > 0 });
      return structuredClone(disks.get(id));
    },
    Write_equipment: async (id, next) => {
      if (failWrite) throw Error('simulated equipment write failure');
      writes++;
      disks.set(String(id), structuredClone(next));
    },
    exist_najie_thing: async () => expansionItems,
    Add_najie_thing: async (_id, _name, _type, amount) => { expansionItems += amount; },
    withPlayerMutationLock: (id, task, options) => withPlayerMutationLock(id, async () => {
      id = String(id);
      activeLocks.set(id, (activeLocks.get(id) || 0) + 1);
      try { return await task(); }
      finally { activeLocks.set(id, activeLocks.get(id) - 1); }
    }, options),
  };
  const Constructor = vm.runInNewContext(`${source}\nRelicSystem`, bindings);
  const app = new Constructor();
  const send = async (msg, { userId = PLAYER_ID, allowUnmatched = false } = {}) => {
    const rule = app.rule.find(rule => new RegExp(rule.reg).test(msg));
    if (!rule && allowUnmatched) return false;
    assert.ok(rule, `实际命令规则应匹配：${msg}`);
    return app[rule.fnc]({
      msg, user_id: userId, isMaster: true,
      reply: async value => { replies.push(typeof value === 'string' ? value : JSON.stringify(value)); },
    });
  };
  return {
    send, replies, reads, expiries, pending,
    disk: (id = PLAYER_ID) => disks.get(id),
    writes: () => writes,
    expansionItems: () => expansionItems,
    advance: milliseconds => { now += milliseconds; },
  };
}

function confirmation(app) {
  const token = app.replies.at(-1)?.match(/#确认分解遗珍\*([a-f0-9]{8})\b/)?.[1];
  assert.ok(token, '预览应包含带 8 位小写十六进制令牌的确认命令');
  return `#确认分解遗珍*${token}`;
}

test('空背包与碎片规则查询展示余额和各品质费率，查询不落盘', async () => {
  const app = appFixture(equipment([], 73));
  await app.send('#遗珍背包');
  assert.match(app.replies.at(-1), /碎片[^\n]*73/);
  await app.send('#遗珍碎片');
  const text = app.replies.at(-1);
  assert.match(text, /碎片[\s\S]*73/);
  for (const [quality, rule] of Object.entries(relicModel.RELIC_FRAGMENT_RULES)) {
    const line = text.split('\n').find(line => line.includes(quality));
    assert.ok(line, quality);
    assert.match(line, new RegExp(`(?:^|\\D)${rule.salvage}(?:\\D|$)`));
    assert.match(line, new RegExp(`(?:^|\\D)${rule.synthesis}(?:\\D|$)`));
  }
  assert.equal(app.writes(), 0);
});

test('实际命令贯通预览、确认分解、定向合成三件和三部位共鸣', async () => {
  const initial = equipment([relic('dismantle-me', '至圣')], 20);
  const app = appFixture(initial);
  await app.send('#分解遗珍*1');
  assert.equal(app.writes(), 0);
  assert.deepEqual(app.disk(), initial);
  assert.equal(app.pending.size, 1);
  assert.equal(app.expiries.at(-1), 120);
  await app.send(confirmation(app));
  assert.equal(app.disk().遗珍.背包.length, 0);
  assert.equal(app.disk().遗珍.碎片, 30);
  await app.send(`#合成遗珍*${SET_NAME}*凡耀*3`);
  const bag = app.disk().遗珍.背包;
  assert.equal(bag.length, 3);
  assert.equal(app.disk().遗珍.碎片, 0);
  assert.equal(new Set(bag.map(item => item.id)).size, 3);
  for (const item of bag) {
    assert.equal(item.套装, SET_NAME);
    assert.equal(item.品质, '凡耀');
    assert.equal(item.副词条.length, 1);
    assert.ok(Object.hasOwn(relicModel.RELIC_AFFIXES, item.副词条[0].name));
  }
  for (const part of relicModel.RELIC_PARTS) await app.send(`#铭刻遗珍*1*${part}`);
  assert.deepEqual(relicModel.calculateRelicEffects(app.disk().遗珍).resonances, [SET_NAME]);
  assert.equal(app.disk().遗珍.背包.length, 0);
  assert.deepEqual(app.disk().武器, initial.武器);
  assert.deepEqual(app.disk().unrelated, initial.unrelated);
  assert.equal(app.writes(), 5);
});

test('批量预览仅选精确品质；重排编号和新增同品质均不改变确认快照', async () => {
  const app = appFixture(equipment([
    relic('low'), relic('selected-a', '灵玄'), relic('selected-b', '灵玄'), relic('high', '至圣'),
  ]));
  await app.send('#批量分解遗珍*灵玄');
  const confirm = confirmation(app);
  assert.equal(app.writes(), 0);
  app.disk().遗珍.背包.reverse();
  app.disk().遗珍.背包.push(relic('new-spirit', '灵玄'));
  await app.send(confirm);
  assert.deepEqual(app.disk().遗珍.背包.map(item => item.id).sort(), ['high', 'low', 'new-spirit']);
  assert.equal(app.disk().遗珍.碎片, 6);
  assert.equal(app.writes(), 1);
});

test('取消确认清除 pending，旧确认不会分解任何遗珍', async () => {
  const initial = equipment([relic('cancelled')]);
  const app = appFixture(initial);
  await app.send('#分解遗珍*1');
  const confirm = confirmation(app);
  await app.send('#取消分解遗珍');
  assert.equal(app.pending.size, 0);
  await app.send(confirm);
  assert.deepEqual(app.disk(), initial);
  assert.equal(app.writes(), 0);
});

test('确认令牌绑定玩家；另一个玩家的尝试不消费原玩家预览', async () => {
  const initial = equipment([relic('belongs-to-player')]);
  const app = appFixture(initial);
  await app.send('#分解遗珍*1');
  const confirm = confirmation(app);
  const other = structuredClone(app.disk(OTHER_ID));
  await app.send(confirm, { userId: OTHER_ID });
  assert.deepEqual(app.disk(), initial);
  assert.deepEqual(app.disk(OTHER_ID), other);
  assert.equal(app.writes(), 0);
  await app.send(confirm);
  assert.equal(app.disk().遗珍.碎片, 1);
  assert.equal(app.writes(), 1);
});

test('新预览替换旧令牌，旧令牌不会执行或抹掉新的待确认操作', async () => {
  const app = appFixture(equipment([relic('first'), relic('second', '灵玄')]));
  await app.send('#分解遗珍*1');
  const oldConfirm = confirmation(app);
  await app.send('#分解遗珍*2');
  const currentConfirm = confirmation(app);
  assert.notEqual(oldConfirm, currentConfirm);
  await app.send(oldConfirm);
  assert.equal(app.writes(), 0);
  await app.send(currentConfirm);
  assert.deepEqual(app.disk().遗珍.背包.map(item => item.id), ['first']);
  assert.equal(app.disk().遗珍.碎片, 3);
});

test('分解预览在 120 秒过期，不会消费或重新按当前编号选物品', async () => {
  const initial = equipment([relic('expired')]);
  const app = appFixture(initial);
  await app.send('#分解遗珍*1');
  const confirm = confirmation(app);
  app.advance(120_000);
  await app.send(confirm);
  assert.deepEqual(app.disk(), initial);
  assert.equal(app.writes(), 0);
  assert.match(app.replies.at(-1), /过期|预览|确认/);
});

test('快照中任意遗珍消失或已经铭刻，整批分解失败并保留其余物品', async () => {
  for (const equipped of [false, true]) {
    const app = appFixture(equipment([relic('keep', '灵玄'), relic('changed', '灵玄')]));
    await app.send('#批量分解遗珍*灵玄');
    const confirm = confirmation(app);
    const changed = app.disk().遗珍.背包.pop();
    if (equipped) app.disk().遗珍.铭刻.武器[0] = changed;
    const before = structuredClone(app.disk());
    await app.send(confirm);
    assert.deepEqual(app.disk(), before);
    assert.equal(app.writes(), 0);
  }
});

test('并发确认同一个令牌只分解一次、获得一次碎片', async () => {
  const app = appFixture(equipment([relic('one-time', '超脱')]));
  await app.send('#分解遗珍*1');
  const confirm = confirmation(app);
  await Promise.all([app.send(confirm), app.send(confirm)]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().遗珍.碎片, 100);
  assert.equal(app.disk().遗珍.背包.length, 0);
});

test('默认合成一件；并发合成依据最新余额结算，不透支碎片', async () => {
  const app = appFixture(equipment([], 10));
  await Promise.all([
    app.send(`#合成遗珍*${SET_NAME}*凡耀`),
    app.send(`#合成遗珍*${SET_NAME}*凡耀`),
  ]);
  assert.equal(app.writes(), 1);
  assert.equal(app.disk().遗珍.碎片, 0);
  assert.equal(app.disk().遗珍.背包.length, 1);
  assert.match(app.replies.join('\n'), /不足/);
});

test('错误合成参数、余额不足、满包与不足批量空位均不消费碎片', async () => {
  const app = appFixture(equipment([], 100_000));
  const before = structuredClone(app.disk());
  for (const args of [
    '未知套装*凡耀', '__proto__*凡耀', `${SET_NAME}*未知品质`, `${SET_NAME}*constructor`,
    `${SET_NAME}*凡耀*0`, `${SET_NAME}*凡耀*-1`, `${SET_NAME}*凡耀*1.5`,
    `${SET_NAME}*凡耀*201`, `${SET_NAME}*凡耀*Infinity`, `${SET_NAME}*凡耀*1*多余`,
  ]) {
    await app.send(`#合成遗珍*${args}`, { allowUnmatched: true });
    assert.deepEqual(app.disk(), before, args);
  }
  assert.equal(app.writes(), 0);
  for (const [size, fragments, count] of [[0, 9, 1], [200, 1000, 1], [199, 1000, 3]]) {
    const initial = equipment(Array.from({ length: size }, (_, index) => relic(`full-${index}`)), fragments);
    const full = appFixture(initial);
    await full.send(`#合成遗珍*${SET_NAME}*凡耀*${count}`);
    assert.deepEqual(full.disk(), initial);
    assert.equal(full.writes(), 0);
  }
});

test('分解或合成落盘失败不改变持久化物品和余额，不返回成功结果', async () => {
  const initial = equipment([relic('write-failure', '大道')], 100);
  const app = appFixture(initial, { failWrite: true });
  await app.send('#分解遗珍*1');
  await app.send(confirmation(app));
  assert.deepEqual(app.disk(), initial);
  assert.match(app.replies.at(-1), /failure|失败/);
  await app.send(`#合成遗珍*${SET_NAME}*凡耀*3`);
  assert.deepEqual(app.disk(), initial);
  assert.match(app.replies.at(-1), /failure|失败/);
  assert.equal(app.writes(), 0);
});

test('遗珍各写入口都先持玩家锁再读装备，管理员发放锁定实际接收者', async () => {
  const app = appFixture(equipment([relic('for-engraving')], 100));
  for (const command of [
    '#铭刻遗珍*1*武器', '#卸下遗珍*武器', '#拓展遗珍槽*武器',
    `#发放遗珍*${OTHER_ID}*凡耀*${SET_NAME}`, `#合成遗珍*${SET_NAME}*凡耀`,
  ]) {
    const start = app.reads.length;
    await app.send(command);
    const reads = app.reads.slice(start);
    assert.ok(reads.length, command);
    assert.ok(reads.every(read => read.locked), `${command} 应在锁内读取玩家最新装备`);
  }
  assert.equal(app.disk(OTHER_ID).遗珍.背包.length, 1);
  assert.equal(app.expansionItems(), 0);
  await app.send('#分解遗珍*1');
  const confirm = confirmation(app);
  const start = app.reads.length;
  await app.send(confirm);
  assert.ok(app.reads.slice(start).length);
  assert.ok(app.reads.slice(start).every(read => read.locked));
});

test('拓展槽位落盘失败返还界纹拓印，装备状态仍保留原存档', async () => {
  const initial = equipment();
  const app = appFixture(initial, { failWrite: true });
  await app.send('#拓展遗珍槽*武器');
  assert.deepEqual(app.disk(), initial);
  assert.equal(app.expansionItems(), 1);
  assert.equal(app.writes(), 0);
});

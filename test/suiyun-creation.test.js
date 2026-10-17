import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import * as creation from '../model/suiyunCreation.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../apps/SecretPlace/rebirthTransaction.js';
import { getActiveZhutianAvatarName } from '../model/zhutianMirror.js';

const source = fs.readFileSync(new URL('../apps/User/Suiyun.js', import.meta.url), 'utf8');
const catalog = name => JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${name}.json`, import.meta.url), 'utf8'));
const highItem = catalog('丹药列表').find(item => Number(item.稀有度) >= 9 && !creation.getSuiyunCreationRestriction(item));
assert.ok(highItem, '需要真实高稀有度可造物用于验证');

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyun-create-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const playerDir = path.join(directory, 'players');
  const inventoryDir = path.join(directory, 'najie');
  fs.mkdirSync(playerDir); fs.mkdirSync(inventoryDir);
  const playerFile = path.join(playerDir, 'owner.json');
  const inventoryFile = path.join(inventoryDir, 'owner.json');
  fs.writeFileSync(playerFile, JSON.stringify({ id: 'owner', 灵根: core.createSuiyunRoot(5), 岁云之力: 20, 仙道潜力: 5, ...overrides }));
  fs.writeFileSync(inventoryFile, JSON.stringify({ 装备: [], 丹药: [], 仙宠: [], 道具: [] }));
  fs.writeFileSync(path.join(directory, '小世界列表.json'), '[]');
  const state = { grants: [], lookups: [], failure: '', messages: [], worlds: [], replyFails: false, item: structuredClone(highItem) };
  state.readPlayer = () => JSON.parse(fs.readFileSync(playerFile, 'utf8'));
  state.readInventory = () => JSON.parse(fs.readFileSync(inventoryFile, 'utf8'));
  state.writePlayer = player => fs.writeFileSync(playerFile, JSON.stringify(player));
  state.writeInventory = inventory => fs.writeFileSync(inventoryFile, JSON.stringify(inventory));
  const deps = {
    ...core, ...creation, fs, path, randomUUID, withPlayerMutationLock, FileRollbackTransaction, getActiveZhutianAvatarName,
    __PATH: { player_path: playerDir, najie_path: inventoryDir },
    data: { xiaoshijie: state.worlds, lib_path: directory },
    console: { error() {} },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async id => id, existplayer: async id => id === 'owner',
    Read_player: async () => state.readPlayer(),
    Write_player: async (_id, player) => {
      if (state.failure === 'before-player') throw new Error('before-player');
      state.writePlayer(player);
      if (state.failure === 'after-player') throw new Error('after-player');
    },
    Read_najie: async () => state.readInventory(),
    foundthing: async (name, options) => {
      state.lookups.push({ name, options });
      if (state.unknown) return false;
      return { ...state.item };
    },
    Add_najie_thing: async (qq, name, itemClass, count, pinji, multiplier, options) => {
      state.grants.push({ qq, name, itemClass, count, pinji, multiplier, options });
      if (state.failure === 'before-item') throw new Error('before-item');
      if (state.failure === 'skip-item') return 0;
      const inventory = state.readInventory();
      inventory[itemClass] ||= [];
      inventory[itemClass].push({ name, class: itemClass, 数量: state.failure === 'double-item' ? 2 : count });
      if (state.failure !== 'missing-receipt') {
        inventory._rewardClaims ||= {};
        inventory._rewardClaims[options.idempotencyKey] = { amount: count };
      }
      state.writeInventory(inventory);
      if (state.failure === 'after-item') throw new Error('after-item');
    },
  };
  const stripped = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const Suiyun = new Function(...Object.keys(deps), `${stripped}\nreturn Suiyun;`)(...Object.values(deps));
  state.app = new Suiyun();
  state.event = (msg = `#岁云造物 ${state.item.name}`, extra = {}) => ({ user_id: 'owner', msg, ...extra, reply: async message => {
    if (state.replyFails) throw new Error('message-delivery-error');
    state.messages.push(message); return message;
  } });
  state.run = (msg, extra) => state.app.createItem(state.event(msg, extra));
  return state;
}

test('岁云剑尊用10点造一件真实高稀有度物品，原十倍掉落不放大发放', async t => {
  const f = fixture(t);
  for (const text of [`#岁云造物${highItem.name}`, `#岁云造物 ${highItem.name}`]) {
    assert.ok(f.app.rule.some(rule => rule.fnc === 'createItem' && new RegExp(rule.reg).test(text)));
    assert.match(await f.run(text), /×1，消耗10点/);
  }
  assert.equal(f.readPlayer().岁云之力, 0);
  assert.equal(f.grants.length, 2);
  assert.ok(f.grants.every(item => item.count === 1 && item.multiplier === 1 && item.options.readOnlyLookup));
  assert.equal(new Set(f.grants.map(item => item.options.idempotencyKey)).size, 2);
  assert.ok(f.grants.every(item => item.options.idempotencyKey.startsWith('suiyun-create:') && !item.options.idempotencyKey.startsWith('suiyun:')));
  assert.ok(f.lookups.every(item => item.options.readOnly));
  assert.equal(f.readInventory().丹药.reduce((sum, item) => sum + item.数量, 0), 2);
});

test('低阶与仅获赠战技者没有造物权限，霜月剑尊起开放，化身装载时先回本源', async t => {
  const f = fixture(t);
  for (let stage = 1; stage <= 2; stage++) {
    f.writePlayer({ id: 'owner', 灵根: core.createSuiyunRoot(stage), 岁云之力: 20 });
    assert.match(await f.run(), /岁云造物自【霜月剑尊】阶段起开放/);
  }
  f.writePlayer({ id: 'owner', 灵根: { name: '凡体' }, 岁云之力: 20,
    月华传承: { 授予者: 'teacher', 受赐者: 'owner', 名额: 1, 传授时间: 0, 技能: [...core.SUIYUN_EXCLUSIVE_SKILLS] } });
  assert.match(await f.run(), /岁云的残念/);
  for (let stage = 3; stage <= 4; stage++) {
    f.writePlayer({ id: 'owner', 灵根: core.createSuiyunRoot(stage), 岁云之力: 20 });
    assert.match(await f.run(), /获得【.*】×1，消耗10点/);
  }
  f.writePlayer({ id: 'owner', 灵根: core.createSuiyunRoot(5), 岁云之力: 20, 诸天镜系统: { 当前化身: '门矢士' } });
  assert.match(await f.run(), /装载化身 本源/);
});

test('数量后缀、艾特、未知物品、近似名称和不足余额均不扣费', async t => {
  const f = fixture(t);
  for (const suffix of ['', '丹药*10', '丹药×2', '丹药 2', '丹药 -1', '丹药 1.5', '丹药\n另一物品']) {
    assert.match(await f.run(`#岁云造物 ${suffix}`), /用法/);
  }
  assert.match(await f.run(undefined, { at: 'other' }), /艾特/);
  assert.match(await f.run(undefined, { message: [{ type: 'at', qq: 'other' }] }), /艾特/);
  f.unknown = true;
  assert.match(await f.run(), /未找到/);
  f.unknown = false;
  assert.match(await f.run(`#岁云造物 ${highItem.name}999`), /未找到/);
  const player = f.readPlayer(); player.岁云之力 = 9.999; f.writePlayer(player);
  assert.match(await f.run(), /不足10点/);
  assert.equal(f.readPlayer().岁云之力, 9.999);
  assert.equal(f.grants.length, 0);
});

test('造物不按稀有度或普通绑定拦截，保留明确唯一与不可创造规则', () => {
  for (const rarity of [0, 7, 8, 9, 10, 999, undefined]) {
    assert.equal(creation.getSuiyunCreationRestriction({ name: '普通物品', class: '道具', 稀有度: rarity, 不可交易: true }), '');
  }
  for (const item of [
    { name: '岁云的残念', class: '道具' }, { name: '无上天阙枝', class: '装备' },
    { name: '圣法碎片', class: '道具' }, { name: '神秘石罐', class: '道具' },
    { name: '大罗剑胎', class: '装备' }, { name: '玉石匣', class: '道具' }, { name: '帝血', class: '道具' },
    { name: '世界树幼苗', class: '道具' }, { name: '混沌珠', class: '装备' },
    { name: '虚天之主传承', class: '道具' }, { name: '自铸至宝', class: '装备', 大道至宝本体: true },
    { name: '封印物', class: '丹药', 不可创造: 1 }, { name: '唯一物', class: '道具', 全服唯一: true },
    { name: '认主物', class: '装备', 绑定者: 'other' }, { name: '配方条目' },
  ]) assert.ok(creation.getSuiyunCreationRestriction(item), item.name);
});

test('唯一物和纳戒封锁在扣费前拦截，不生成回执', async t => {
  const f = fixture(t);
  f.item = { name: '无上天阙枝', class: '装备', 全时间线唯一: true };
  assert.match(await f.run(), /唯一归属/);
  f.item = structuredClone(highItem);
  f.writeInventory({ 丹药: [], 时间线封锁: { locked: true } });
  assert.match(await f.run(), /封锁/);
  assert.equal(f.grants.length, 0);
  assert.equal(f.readPlayer().岁云之力, 20);
});

test('真实文件回滚覆盖扣费前后及物品写入前后，中断不白拿或只扣无货', async t => {
  const f = fixture(t);
  for (const failure of ['before-player', 'after-player', 'before-item', 'after-item', 'skip-item', 'double-item', 'missing-receipt']) {
    const before = { player: f.readPlayer(), inventory: f.readInventory() };
    f.failure = failure;
    assert.match(await f.run(), /消耗与物品已恢复/);
    assert.deepEqual(f.readPlayer(), before.player, failure);
    assert.deepEqual(f.readInventory(), before.inventory, failure);
  }
  f.failure = '';
  await f.run();
  assert.equal(f.readPlayer().岁云之力, 10);
  assert.equal(f.readInventory().丹药.length, 1);
});

test('并发造物重新核验10点余额，只有一次成功且回复失败不撤销交付', async t => {
  const f = fixture(t, { 岁云之力: 10 });
  const replies = await Promise.all([f.run(), f.run()]);
  assert.equal(f.grants.length, 1);
  assert.equal(replies.filter(item => item.includes('不足10点')).length, 1);
  assert.equal(f.readPlayer().岁云之力, 0);
  const second = fixture(t, { 岁云之力: 10 });
  second.replyFails = true;
  await assert.rejects(second.run(), /message-delivery-error/);
  assert.equal(second.readPlayer().岁云之力, 0);
  assert.equal(second.readInventory().丹药.length, 1);
});

test('先结算天宫收益，后续造物中断不回滚已领取的小时产出', async t => {
  const f = fixture(t, { 岁云之力: 9.8 });
  const anchor = Date.now() - 2 * core.SUIYUN_HOUR_MS;
  f.worlds.push({ player_qq: 'owner', 月华天宫: true, 月华天宫上次结算时间: anchor });
  f.failure = 'before-item';
  assert.match(await f.run(), /已恢复/);
  assert.equal(f.readPlayer().岁云之力, 10);
  assert.equal(f.readPlayer().仙道潜力, 105);
  assert.equal(f.worlds[0].月华天宫上次结算时间, anchor + 2 * core.SUIYUN_HOUR_MS);
  f.failure = '';
  await f.run();
  assert.equal(f.readPlayer().岁云之力, 0);
  assert.equal(f.readPlayer().仙道潜力, 105);
});

test('道种归入道具栏，装备与仙宠同样固定一件', async t => {
  const f = fixture(t, { 岁云之力: 30 });
  for (const [itemClass, name] of [['装备', '测试装备'], ['仙宠', '测试仙宠'], ['道种', '普通测试道种']]) {
    f.item = { class: itemClass, name, 稀有度: 10 };
    await f.run();
    assert.equal(f.grants.at(-1).itemClass, itemClass === '道种' ? '道具' : itemClass);
    assert.equal(f.grants.at(-1).count, 1);
  }
  assert.equal(f.readPlayer().岁云之力, 0);
});

test('只读物品查询在自铸目录损坏时不修复全局文件，造物发放沿用只读查询', async () => {
  const code = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const from = code.indexOf('export async function foundthing(');
  const to = code.indexOf('export async function get_shitujifen_img(', from);
  let repaired = false;
  const find = new Function('readDaoTreasureState', 'data', 'Read_it', 'Writeit',
    `${code.slice(from, to).replace('export ', '')}; return foundthing;`)(
    () => ({}), new Proxy({}, { get: () => [] }),
    async () => { throw new Error('broken custom catalog'); }, async () => { repaired = true; },
  );
  assert.equal(await find('不存在的物品', { readOnly: true }), false);
  assert.equal(repaired, false);
  assert.match(code, /foundthing\(name, \{ readOnly: options\.readOnlyLookup === true \}\)/);
});

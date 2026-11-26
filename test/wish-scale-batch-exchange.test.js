import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as fishing from '../model/immortalFishing.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../apps/SecretPlace/rebirthTransaction.js';

const source = fs.readFileSync(new URL('../apps/User/ImmortalFishing.js', import.meta.url), 'utf8');

function fixture(t, { scales = 1000, inventory = {}, player = {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wish-scale-batch-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'fixture.json');
  fs.writeFileSync(file, JSON.stringify({ 众生愿鳞: scales, ...inventory }));
  const state = { player, writes: [], fail: '', replies: [], file };
  const deps = {
    ...fishing, path, withPlayerMutationLock, FileRollbackTransaction,
    __PATH: { najie_path: directory },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    channel: async () => 'fixture',
    Read_player: async () => structuredClone(state.player),
    exist_najie_thing: async (_id, name) => JSON.parse(fs.readFileSync(file, 'utf8'))[name] || 0,
    Add_najie_thing: async (_id, name, category, amount) => {
      const isAward = amount > 0;
      if (state.fail === 'before-award' && isAward) throw new Error('injected-before-award');
      const latest = JSON.parse(fs.readFileSync(file, 'utf8'));
      latest[name] = (latest[name] || 0) + amount;
      assert.ok(latest[name] >= 0, '余额不透支');
      fs.writeFileSync(file, JSON.stringify(latest));
      state.writes.push({ name, category, amount });
      if (state.fail === 'after-debit' && !isAward) throw new Error('injected-after-debit');
      if (state.fail === 'after-award' && isAward) throw new Error('injected-after-award');
    },
  };
  const stripped = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(deps), `${stripped}\nreturn ImmortalFishing;`)(...Object.values(deps));
  state.app = new App();
  state.send = async msg => {
    const rule = state.app.rule.find(rule => new RegExp(rule.reg).test(msg));
    assert.ok(rule, `应匹配命令：${msg}`);
    return state.app[rule.fnc]({ user_id: 'fixture', msg, reply: async message => { state.replies.push(message); return true; } });
  };
  state.read = () => JSON.parse(fs.readFileSync(file, 'utf8'));
  return state;
}

test('旧命令默认1份，星号与空格批量按兑换份数结算真实总价与产量', async t => {
  for (const [command, quantity] of [
    ['#愿鳞兑换 宇宙核心', 1], ['#愿鳞兑换 宇宙核心*3', 3],
    ['#愿鳞兑换 宇宙核心 3', 3], ['#愿鳞兑换宇宙核心＊3', 3],
  ]) {
    const f = fixture(t);
    await f.send(command);
    assert.deepEqual(f.read(), { 众生愿鳞: 1000 - 80 * quantity, 宇宙核心: 5 * quantity });
    assert.deepEqual(f.writes, [
      { name: '众生愿鳞', category: '道具', amount: -80 * quantity },
      { name: '宇宙核心', category: '材料', amount: 5 * quantity },
    ]);
    assert.match(f.replies.at(-1), new RegExp(`消耗众生愿鳞x${80 * quantity}.*x${5 * quantity}`));
  }
  const f = fixture(t);
  await f.send('#愿鳞兑换 轮回命签*2');
  assert.deepEqual(f.read(), { 众生愿鳞: 900, 轮回命签: 100 });
});

test('兑换表仍可查看且解释份数；非法、非安全数量与总价溢出全部不写盘', async t => {
  const f = fixture(t);
  await f.send('#愿鳞兑换');
  assert.match(f.replies.at(-1), /兑换份数/);
  const before = fs.readFileSync(f.file, 'utf8');
  for (const suffix of ['*0', '*-1', '*1.5', '*1e2', '*NaN', '*Infinity', '*9007199254740992', '*9007199254740991', '*', '*2*3', ' 2 3', ' -2']) {
    await f.send(`#愿鳞兑换 宇宙核心${suffix}`);
    assert.doesNotMatch(f.replies.at(-1), /兑换成功/);
    assert.equal(fs.readFileSync(f.file, 'utf8'), before, suffix);
  }
  for (const name of ['不存在的商品', '__proto__', 'constructor']) {
    await f.send(`#愿鳞兑换 ${name} 3`);
    assert.match(f.replies.at(-1), /兑换表中没有/);
  }
  assert.equal(f.writes.length, 0);
  const overflowing = fixture(t, { inventory: { 宇宙核心: Number.MAX_SAFE_INTEGER } });
  await overflowing.send('#愿鳞兑换 宇宙核心*1');
  assert.match(overflowing.replies.at(-1), /物品数量超出精确结算范围/);
  assert.equal(overflowing.writes.length, 0);
});

test('余额按整批检查；同一玩家并发请求只允许余额足够的那批', async t => {
  const f = fixture(t, { scales: 239 });
  await f.send('#愿鳞兑换 宇宙核心*3');
  assert.match(f.replies.at(-1), /239\/240/);
  assert.equal(f.writes.length, 0);
  const concurrent = fixture(t, { scales: 240 });
  await Promise.all([concurrent.send('#愿鳞兑换 宇宙核心*3'), concurrent.send('#愿鳞兑换 宇宙核心 3')]);
  assert.deepEqual(concurrent.read(), { 众生愿鳞: 0, 宇宙核心: 15 });
  assert.equal(concurrent.writes.length, 2);
  assert.equal(concurrent.replies.filter(reply => reply.includes('兑换成功')).length, 1);
  assert.equal(concurrent.replies.filter(reply => reply.includes('众生愿鳞不足')).length, 1);
});

test('绑定灯与配方保留单份、已持有及已参悟约束，不因批量绕过', async t => {
  for (const name of ['万界引潮灯', '大衍悟道丹配方']) {
    const f = fixture(t);
    await f.send(`#愿鳞兑换 ${name}*2`);
    assert.match(f.replies.at(-1), /仅可兑换1份/);
    assert.equal(f.writes.length, 0);
    await f.send(`#愿鳞兑换 ${name}`);
    const before = f.read();
    await f.send(`#愿鳞兑换 ${name} 1`);
    assert.match(f.replies.at(-1), /已经持有/);
    assert.deepEqual(f.read(), before);
  }
  const learned = fixture(t, { player: { 大衍悟道丹配方: true } });
  await learned.send('#愿鳞兑换 大衍悟道丹配方');
  assert.match(learned.replies.at(-1), /已经参悟/);
  assert.equal(learned.writes.length, 0);
});

test('扣费后或批量发放前后写入失败均由真实文件事务完整回滚，重试仅结算一批', async t => {
  for (const fail of ['after-debit', 'before-award', 'after-award']) {
    const f = fixture(t, { inventory: { 宇宙核心: 7 } });
    const before = fs.readFileSync(f.file, 'utf8');
    f.fail = fail;
    await assert.rejects(f.send('#愿鳞兑换 宇宙核心*3'), new RegExp(`injected-${fail}`));
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    assert.equal(f.replies.some(reply => reply.includes('兑换成功')), false);
    f.fail = '';
    await f.send('#愿鳞兑换 宇宙核心*3');
    assert.deepEqual(f.read(), { 众生愿鳞: 760, 宇宙核心: 22 });
  }
});

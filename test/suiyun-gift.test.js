import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import * as gift from '../model/suiyunGift.js';
import { getSuperdimensionalRewriteTarget } from '../model/shengfaFragment.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const source = fs.readFileSync(new URL('../apps/User/Suiyun.js', import.meta.url), 'utf8');
const clone = value => structuredClone(value);

function tempRegistry(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'suiyun-gift-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return path.join(directory, 'claims', 'gift');
}

function fixture(t) {
  const file = tempRegistry(t);
  const players = {
    owner: { id: 'owner', 名号: '月下修士', 灵根: core.createSuiyunRoot(1), 月华值: 1000 },
    target: { id: 'target', 名号: '受赐修士', 灵根: { name: '凡体' }, 学习的功法: ['普通功法'], 仙道潜力: 10 },
  };
  const state = { file, players, writes: 0, failWrite: false };
  const dependencies = {
    ...core, ...gift, withPlayerMutationLock, getSuperdimensionalRewriteTarget,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true,
    channel: async id => id,
    existplayer: async id => Boolean(players[id]),
    getActiveZhutianAvatarName: player => player?.诸天镜系统?.当前化身 || '',
    Read_player: async id => clone(players[id]),
    Write_player: async (id, player) => {
      if (state.failWrite === 'before') { state.failWrite = false; throw new Error('injected-before-write'); }
      players[id] = clone(player);
      state.writes++;
      if (state.failWrite === 'after') { state.failWrite = false; throw new Error('injected-after-write'); }
    },
    readSuiyunGifts: () => gift.readSuiyunGifts({ file }),
    withSuiyunGiftClaim: (owner, recipient, name, grant) => gift.withSuiyunGiftClaim(owner, recipient, name, grant, { file, now: 1000 }),
  };
  const stripped = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const Suiyun = new Function(...Object.keys(dependencies), `${stripped}\nreturn Suiyun;`)(...Object.values(dependencies));
  state.app = new Suiyun();
  state.event = (extra = {}) => ({ user_id: 'owner', msg: '#赐予月华', isGroup: true, reply: async message => message, ...extra });
  state.give = id => state.app.gift(state.event({ message: [{ type: 'text', text: '#赐予月华' }, { type: 'at', qq: id }] }));
  state.claims = () => gift.readSuiyunGifts({ file });
  return state;
}

test('赐予月华指令兼容紧邻艾特，无目标查看名额且不创建存档', async t => {
  const f = fixture(t);
  for (const msg of ['#赐予月华', '#赐予月华 @目标', '#赐予月华@目标']) {
    assert.ok(f.app.rule.some(rule => rule.fnc === 'gift' && new RegExp(rule.reg).test(msg)));
  }
  const reply = await f.app.gift(f.event());
  assert.match(reply, /全服名额 0\/3/);
  assert.match(reply, /1：空缺.*\n2：空缺.*\n3：空缺/);
  assert.match(reply, /霜剑入月、岁云归一、白云苍狗/);
  assert.equal(fs.existsSync(path.dirname(f.file)), false);
  assert.equal(f.writes, 0);
});

test('真实目标仅获得三技传承，原灵根功法资源完整保留', async t => {
  const f = fixture(t);
  const before = clone(f.players.target);
  assert.match(await f.give('target'), /获得霜剑入月、岁云归一、白云苍狗/);
  assert.deepEqual(f.players.target.月华传承, {
    授予者: 'owner', 受赐者: 'target', 名额: 1, 传授时间: 1000,
    技能: ['霜剑入月', '岁云归一', '白云苍狗'],
  });
  const { 月华传承, ...remaining } = f.players.target;
  assert.deepEqual(remaining, before);
  assert.equal(f.players.owner.月华值, 1000);
  assert.equal(f.claims()[0].delivered, true);
  assert.match(await f.app.gift(f.event()), /1：受赐修士（已传授）/);
});

test('重复赐予不重复占名额或写入玩家，可跨实例读取持久记录', async t => {
  const f = fixture(t);
  await Promise.all([f.give('target'), f.give('target')]);
  assert.equal(f.writes, 1);
  assert.equal(f.claims().length, 1);
  assert.match(await f.give('target'), /此前已获/);
  assert.equal(f.writes, 1);
  let regrants = 0;
  const retry = await gift.withSuiyunGiftClaim('owner', 'target', '新名号', () => regrants++, { file: f.file });
  assert.equal(retry.alreadyGranted, true);
  assert.equal(regrants, 0);
});

test('三席为所有岁云持有者共用，四个并发目标最多保存三位', async t => {
  const f = fixture(t);
  for (let index = 1; index <= 4; index++) f.players[`target${index}`] = { id: `target${index}`, 名号: `目标${index}` };
  f.players.owner2 = { id: 'owner2', 灵根: core.createSuiyunRoot(5) };
  const replies = await Promise.all([1, 2, 3, 4].map(index => f.app.gift(f.event({ user_id: index % 2 ? 'owner' : 'owner2', at: `target${index}` }))));
  assert.equal(f.claims().length, 3);
  assert.equal(f.writes, 3);
  assert.equal(Object.values(f.players).filter(player => player.月华传承).length, 3);
  assert.equal(replies.filter(reply => reply.includes('三个名额已用尽')).length, 1);
});

test('双方身份检查拒绝自传、全体艾特、未建档、非岁云与化身授予者', async t => {
  const f = fixture(t);
  assert.match(await f.give('owner'), /另一位/);
  assert.match(await f.give('all'), /单独@/);
  assert.match(await f.app.gift(f.event({ at: 'all' })), /单独@/);
  assert.match(await f.app.gift(f.event({ message: [
    { type: 'at', qq: 'target' }, { type: 'at', qq: 'owner' },
  ] })), /一次只能@/);
  assert.match(await f.give('missing'), /尚未/);
  assert.match(await f.app.gift(f.event({ user_id: 'target', at: 'owner' })), /残念/);
  f.players.owner.诸天镜系统 = { 当前化身: '测试化身' };
  assert.match(await f.give('target'), /装载化身 本源/);
  assert.equal(f.claims().length, 0);
  assert.equal(f.writes, 0);
});

test('已有岁云灵根或其化身中的本源不会浪费传承名额，受赐者不转授', async t => {
  const f = fixture(t);
  f.players.root = { id: 'root', 灵根: core.createSuiyunRoot(3) };
  assert.match(await f.give('root'), /自带月华三技/);
  f.players.root.诸天镜系统 = { 当前化身: '门矢士', 本源灵根: core.createSuiyunRoot(3) };
  f.players.root.灵根 = { name: '门矢士' };
  assert.match(await f.give('root'), /自带月华三技/);
  await f.give('target');
  assert.match(await f.app.gift(f.event({ user_id: 'target', at: 'root' })), /残念/);
  assert.equal(f.claims().length, 1);
});

for (const failure of ['before', 'after']) {
  test(`玩家写入${failure === 'before' ? '前' : '后'}中断保留原席，原目标重试完成且没有第四人`, async t => {
    const f = fixture(t);
    f.failWrite = failure;
    await assert.rejects(f.give('target'), new RegExp(`injected-${failure}-write`));
    assert.equal(f.claims()[0].delivered, false);
    assert.match(await f.app.gift(f.event()), /待原目标重试完成/);
    for (const id of ['other1', 'other2', 'other3']) f.players[id] = { id, 名号: id };
    await f.give('other1');
    await f.give('other2');
    assert.match(await f.give('other3'), /三个名额已用尽/);
    assert.match(await f.give('target'), /承接第1席/);
    assert.equal(f.claims()[0].delivered, true);
    assert.equal(f.claims().length, 3);
    assert.equal(Object.values(f.players).filter(player => player.月华传承).length, 3);
  });
}

test('返回 false 的写入保留待完成状态，另一授予者不会接管预留', async t => {
  const file = tempRegistry(t);
  const pending = await gift.withSuiyunGiftClaim('owner', 'target', '目标', () => false, { file });
  assert.equal(pending.pending, true);
  let grants = 0;
  const another = await gift.withSuiyunGiftClaim('owner2', 'target', '目标', () => grants++, { file });
  assert.equal(another.ok, false);
  assert.match(another.reason, /原授予者/);
  assert.equal(grants, 0);
  assert.equal(gift.readSuiyunGifts({ file }).length, 1);
});

test('损坏的传承记录保留占位并显式报错，不补发新席', async t => {
  const file = tempRegistry(t);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.1.json`, '{broken', 'utf8');
  await assert.rejects(gift.withSuiyunGiftClaim('owner', 'target', '目标', () => {}, { file }), SyntaxError);
  assert.equal(fs.existsSync(`${file}.2.json`), false);
});

test('跨进程抢同一目标只占一席，再并发抢不同目标总计仍为三席', async t => {
  const file = tempRegistry(t);
  const moduleURL = new URL('../model/suiyunGift.js', import.meta.url).href;
  const script = `import { withSuiyunGiftClaim } from ${JSON.stringify(moduleURL)};
    const result = await withSuiyunGiftClaim('owner', process.argv[2], process.argv[2], async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    }, { file: process.argv[1] });
    process.stdout.write(JSON.stringify(result));`;
  const run = recipient => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, file, recipient], { windowsHide: true });
    let output = '';
    let errors = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { errors += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(errors)));
  });
  const same = await Promise.all(Array.from({ length: 6 }, () => run('same')));
  assert.ok(same.every(result => result.ok));
  assert.equal(gift.readSuiyunGifts({ file }).length, 1);
  const different = await Promise.all(Array.from({ length: 6 }, (_, index) => run(`other${index}`)));
  assert.equal(different.filter(result => result.ok).length, 2);
  const claims = gift.readSuiyunGifts({ file });
  assert.equal(claims.length, 3);
  assert.equal(new Set(claims.map(claim => claim.recipientId)).size, 3);
});

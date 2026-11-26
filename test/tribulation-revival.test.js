import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  getAvailableRevivalGongfas,
  requestManualRevivalChoice,
  resolveGongfaRevival,
  submitManualRevivalChoice,
} from '../model/tribulationRevival.js';

test('柳神法复活获得三层45%庇护与五道15%恢复', () => {
  const player = {
    名号: '测试修士',
    血量上限: 1000,
    当前血量: 0,
    生命本源: 100,
    学习的功法: ['柳神法'],
    功法: { 柳神法: { 冷却回合: 0 } },
  };
  const result = resolveGongfaRevival(player, { allowMingge: false });
  assert.equal(result.revived, true);
  assert.equal(player.当前血量, 600);
  assert.equal(player.柳神效果.庇护层数, 3);
  assert.equal(player.柳神效果.减伤比例, 0.45);
  assert.deepEqual(player.柳神效果.持续恢复, { 回合数: 5, 治疗量: 150 });
});

test('自动模式直接复活，手动模式濒死时等待玩家选择', () => {
  const base = {
    名号: '测试修士',
    血量上限: 1000,
    当前血量: 0,
    生命本源: 100,
    学习的功法: ['者字秘', '柳神法'],
    功法: { 者字秘: { 冷却回合: 0 }, 柳神法: { 冷却回合: 0 } },
  };

  const automatic = structuredClone(base);
  assert.equal(resolveGongfaRevival(automatic, { allowMingge: false }).source, '者字秘·向死而生');

  const manual = structuredClone(base);
  manual.渡劫复活模式 = '手动';
  const pending = resolveGongfaRevival(manual, { allowMingge: false });
  assert.equal(pending.requiresChoice, true);
  assert.deepEqual(pending.choices, ['者字秘', '柳神法']);
  assert.equal(manual.生命本源, 100);
});

test('手动选择只接受当前可用功法并按选择结果复活', async () => {
  const player = {
    名号: '测试修士',
    血量上限: 1000,
    当前血量: 0,
    生命本源: 100,
    学习的功法: ['者字秘', '柳神法'],
    功法: { 者字秘: { 冷却回合: 0 }, 柳神法: { 冷却回合: 2 } },
    渡劫复活模式: '手动',
  };

  assert.deepEqual(getAvailableRevivalGongfas(player), ['者字秘']);
  const replies = [];
  const waiting = requestManualRevivalChoice(
    { reply: message => replies.push(message) },
    '10001',
    ['者字秘']
  );
  assert.equal(submitManualRevivalChoice('10001', '2').reason, 'invalid');
  assert.equal(submitManualRevivalChoice('10001', '1').name, '者字秘');
  assert.equal(await waiting, '者字秘');
  assert.match(replies[0], /#复活选择 序号/);

  const result = resolveGongfaRevival(player, { allowMingge: false, selectedName: '者字秘' });
  assert.equal(result.source, '者字秘·向死而生');
  assert.equal(player.生命本源, 50);
  assert.equal(player.功法.柳神法.冷却回合, 2);
});

test('复活选择提示发送失败时立即解除等待', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const selected = await requestManualRevivalChoice(
      { reply: () => Promise.reject(new Error('send failed')) },
      '10002',
      ['者字秘']
    );
    assert.equal(selected, '');
    assert.equal(submitManualRevivalChoice('10002', '1').reason, 'none');
  } finally {
    console.error = originalError;
  }
});

test('生命本源为零时保持枯竭，不会被复活结算重置', () => {
  const player = {
    名号: '测试修士',
    血量上限: 1000,
    当前血量: 0,
    生命本源: 0,
    学习的功法: ['者字秘'],
    功法: { 者字秘: { 冷却回合: 0 } },
  };

  assert.equal(resolveGongfaRevival(player, { allowMingge: false }).revived, false);
  assert.equal(player.生命本源, 0);
});

test('天魔炼化的小数生命本源经过复活结算仍会保留', () => {
  const noRevival = {
    名号: '测试修士',
    血量上限: 1000,
    当前血量: 0,
    生命本源: 252.5,
    学习的功法: [],
    功法: {},
  };
  assert.equal(resolveGongfaRevival(noRevival, { allowMingge: false }).revived, false);
  assert.equal(noRevival.生命本源, 252.5);

  const revived = {
    ...noRevival,
    学习的功法: ['者字秘'],
    功法: { 者字秘: { 冷却回合: 0 } },
  };
  assert.equal(resolveGongfaRevival(revived, { allowMingge: false }).revived, true);
  assert.equal(revived.生命本源, 202.5);
});

test('普通肉身雷劫失败也接入统一复活选择', () => {
  const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function LevelTask');
  const end = source.indexOf('export async function mortal_tribulation', start);
  const levelTask = source.slice(start, end);

  assert.match(levelTask, /resolveInteractiveGongfaRevival\(/);
  assert.match(levelTask, /成功复活，并避开本道雷劫/);
});

test('渡劫插件可以完整装载', () => {
  const script = `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    const module = await import('./plugins/zhutianxiuxian1.0/apps/User/zhetiandujie.js');
    if (typeof module.zhetiandujie !== 'function') process.exit(1);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

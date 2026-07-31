import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  SHOUYUAN_DIFFICULTIES,
  readShouyuanDifficulty,
  resolveShouyuanDifficulty,
} from '../apps/User/shouyuanDifficulty.js';

test('往生难度映射为 1/2/3', () => {
  assert.deepEqual(SHOUYUAN_DIFFICULTIES, { 简单: 1, 普通: 2, 困难: 3 });
  const current = readShouyuanDifficulty(path.join(process.cwd(), 'resources/data/位面.json'));
  assert.equal(current.level, 1);
});

test('简单难度不流逝寿元也不触发寿元耗尽轮回', () => {
  assert.deepEqual(resolveShouyuanDifficulty(1), {
    level: 1,
    name: '简单',
    drainsLifespan: false,
    reincarnatesOnExhaustion: false,
  });
});

test('普通仅流逝寿元，困难同时启用寿元耗尽轮回', () => {
  assert.equal(resolveShouyuanDifficulty(2).drainsLifespan, true);
  assert.equal(resolveShouyuanDifficulty(2).reincarnatesOnExhaustion, false);
  assert.equal(resolveShouyuanDifficulty(3).drainsLifespan, true);
  assert.equal(resolveShouyuanDifficulty(3).reincarnatesOnExhaustion, true);
});

test('缺失或非法配置按简单难度处理', () => {
  assert.equal(resolveShouyuanDifficulty(undefined).level, 1);
  assert.equal(resolveShouyuanDifficulty(99).level, 1);
});

test('选择三档难度后均会输出详细规则文案', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'apps/AdminSuper/GlobalInit.js'),
    'utf-8'
  );
  assert.match(source, /【诸天难度·大道垂怜】/);
  assert.match(source, /【诸天难度·岁月留痕】/);
  assert.match(source, /【诸天难度·生死轮转】/);
});

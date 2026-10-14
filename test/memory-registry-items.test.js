import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { claimMemoryUnique, readMemoryUnique, rollAndGrantMemoryData } from '../model/memoryRegistry.js';
import { createMemoryRoot, MEMORY_ROMANCE_SETS } from '../model/memoryPath.js';

test('奇怪的数据暂停掉落，概率命中与切换时间线均不发放或占用', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-registry-'));
  try {
    const options = { file: path.join(directory, 'claims'), timeline: 'A', location: '往世星海', random: () => 0 };
    const grant = async () => assert.fail('暂停条目不应发放');
    for (const timeline of ['A', 'B']) {
      const results = await Promise.all(['one', 'two'].map(id => rollAndGrantMemoryData({ id }, grant, { ...options, timeline })));
      assert.ok(results.every(result => result.encountered === false && result.reason === 'disabled'));
    }
    assert.deepEqual(fs.readdirSync(directory), []);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('旧数据待补发记录保留归属，但暂停历史补发', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-registry-'));
  try {
    const options = { file: path.join(directory, 'claims'), location: '往世星海', random: () => 0 };
    assert.equal(claimMemoryUnique('data', 'one', options).ok, true);
    assert.equal(readMemoryUnique('data', options).ownerId, 'one');
    const before = readMemoryUnique('data', options);
    for (const id of ['one', 'two']) {
      const result = await rollAndGrantMemoryData({ id }, async () => assert.fail('历史补发也已暂停'), options);
      assert.equal(result.encountered, false);
    }
    assert.deepEqual(readMemoryUnique('data', options), before);
    assert.equal(claimMemoryUnique('root', 'one', options).ok, true);
    assert.equal(claimMemoryUnique('root', 'two', options).ok, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('记忆目录仅保留四阶段与浪漫九件套，暂停物品和秘籍撤下注册', () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${name}.json`, import.meta.url), 'utf8'));
  const roots = read('灵根列表');
  for (let stage = 1; stage <= 4; stage++) {
    const expected = createMemoryRoot(stage);
    assert.deepEqual(roots.find(item => item.name === expected.name), expected);
    assert.equal(roots.filter(item => item.id === expected.id).length, 1);
  }
  assert.equal(roots.some(item => item.name === '星神·记忆'), false);
  const items = read('道具列表');
  for (const name of ['奇怪的数据', '记忆之诗篇']) {
    assert.equal(items.some(entry => entry.name === name), false);
  }
  assert.equal(read('功法列表').some(item => item.name === '六相冰封'), false);
  const equipment = read('特殊装备列表');
  for (const name of MEMORY_ROMANCE_SETS.flat()) {
    const item = equipment.find(entry => entry.name === name);
    assert.ok(item);
    assert.equal(item.记忆专属, true);
    assert.equal(item.不可随机获取, true);
    assert.equal(item.不可创造, 1);
    assert.equal(equipment.filter(entry => entry.id === item.id).length, 1);
  }
});

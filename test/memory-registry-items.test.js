import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { claimMemoryUnique, readMemoryUnique, rollAndGrantMemoryData } from '../model/memoryRegistry.js';
import { createMemoryRoot, MEMORY_ROMANCE_SETS } from '../model/memoryPath.js';

test('数据掉落严格限星海万分之一、同时间线只一件且不同时间线独立', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-registry-'));
  try {
    const options = { file: path.join(directory, 'claims'), timeline: 'A', location: '往世星海', random: () => 0 };
    const grants = [];
    const grant = async result => grants.push(result.idempotencyKey);
    assert.equal((await rollAndGrantMemoryData({ id: 'one' }, grant, { ...options, location: '普通秘境' })).encountered, false);
    assert.equal((await rollAndGrantMemoryData({ id: 'one' }, grant, { ...options, random: () => .0001 })).encountered, false);
    const results = await Promise.all(['one', 'two'].map(id => rollAndGrantMemoryData({ id }, grant, options)));
    assert.equal(results.filter(result => result.encountered).length, 1);
    assert.equal(grants.length, 1);
    assert.match(grants[0], /^memory:data:A:/);
    assert.equal((await rollAndGrantMemoryData({ id: 'one' }, grant, options)).encountered, false);
    assert.equal((await rollAndGrantMemoryData({ id: 'two' }, grant, { ...options, timeline: 'B' })).encountered, true);
    assert.equal(grants.length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('数据发放中断占用原归属，原玩家无须再次命中概率即可补发', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-registry-'));
  try {
    const options = { file: path.join(directory, 'claims'), location: '往世星海', random: () => 0 };
    await assert.rejects(rollAndGrantMemoryData({ id: 'one' }, async () => { throw new Error('disk'); }, options), /disk/);
    assert.equal(readMemoryUnique('data', options).ownerId, 'one');
    assert.equal((await rollAndGrantMemoryData({ id: 'two' }, async () => {}, options)).encountered, false);
    assert.equal((await rollAndGrantMemoryData({ id: 'one' }, async () => {}, { ...options, random: () => 1 })).encountered, true);
    assert.equal(claimMemoryUnique('root', 'one', options).ok, true);
    assert.equal(claimMemoryUnique('root', 'two', options).ok, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('记忆命途目录与核心五阶段一致，唯一传承与三阶浪漫九件套齐备', () => {
  const read = name => JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${name}.json`, import.meta.url), 'utf8'));
  const roots = read('灵根列表');
  for (let stage = 1; stage <= 5; stage++) {
    const expected = createMemoryRoot(stage);
    assert.deepEqual(roots.find(item => item.name === expected.name), expected);
    assert.equal(roots.filter(item => item.id === expected.id).length, 1);
  }
  const items = read('道具列表');
  for (const name of ['奇怪的数据', '记忆之诗篇']) {
    const item = items.find(entry => entry.name === name);
    assert.equal(item.不可创造, 1);
    assert.equal(item.不可交易, true);
    assert.equal(item.不可支取, true);
  }
  assert.equal(read('功法列表').find(item => item.name === '六相冰封').不可外传, true);
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  drawXianguSeed,
  findXianguTopSeed,
  getRegularXianguSeedNames,
  getXianguTopSeedCatalog,
  grantXianguSeed,
  normalizeXianguSeedName,
  normalizeXianguSeedRecord,
  resolveXianguSeedExtremeName,
} from '../apps/SecretPlace/xianguSeed.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');
const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'data', 'xianguSecretPlace.json'), 'utf8'));
const levels = JSON.parse(fs.readFileSync(path.join(rootDir, 'resources', 'data', 'Level', '仙古今世法.json'), 'utf8'));

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function sequenceRandom(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test('11种顶级道种与神火极境配置逐字对应', () => {
  const catalog = getXianguTopSeedCatalog(config);
  const names = catalog.map(seed => seed.名称);
  const level8 = levels.find(level => level.level_id === 8);
  const extremeSeedNames = Object.keys(level8.极境)
    .filter(name => name !== '神火极境·祭炼真我')
    .map(name => name.replace(/^神火极境·/, ''));

  assert.equal(catalog.length, 11);
  assert.deepEqual(new Set(names), new Set(extremeSeedNames));
  assert.equal(new Set(names).size, names.length);
  for (const seed of catalog) {
    assert.equal(seed.品质, '神话');
    assert.ok(seed.融合成功率 > 0 && seed.融合成功率 <= 1);
    assert.ok(seed.权重 > 0);
    assert.ok(seed.出现区域.length > 0);
    assert.ok(seed.出现碎片.length > 0);
    assert.equal(resolveXianguSeedExtremeName(config, levels, seed.名称), `神火极境·${seed.名称}`);
  }
});

test('旧版道种名称可规范到顶级道种目录', () => {
  const aliases = {
    世界树嫩芽: '世界树幼苗',
    世界树种子: '世界树幼苗',
    宇宙雏形种子: '宇宙雏形种',
    万道树苗: '万道树',
    青月焰种: '青月焰',
  };
  for (const [legacyName, canonicalName] of Object.entries(aliases)) {
    assert.equal(normalizeXianguSeedName(legacyName), canonicalName);
    assert.equal(findXianguTopSeed(config, legacyName)?.名称, canonicalName);
  }
});

test('道种记录兼容字符串与旧版英文字段', () => {
  assert.deepEqual(normalizeXianguSeedRecord('生命之种'), { 名称: '生命之种' });

  const legacy = normalizeXianguSeedRecord({
    name: '天穹种',
    quality: '神话',
    type: '天穹/守御',
    successRate: 0.85,
    attrs: { 防御加成: 0.2 },
    skill: '天穹镇世',
    extra: '护持道基',
  });

  assert.equal(legacy.名称, '天穹种');
  assert.equal(legacy.品质, '神话');
  assert.equal(legacy.类型, '天穹/守御');
  assert.equal(legacy.融合成功率, 0.85);
  assert.deepEqual(legacy.属性加成, { 防御加成: 0.2 });
  assert.equal(legacy.专属技能, '天穹镇世');
  assert.equal(legacy.额外效果, '护持道基');
});

test('字符串道种转入永久存档后保留规范名称', () => {
  const player = { xiangu_run: {} };
  const stored = grantXianguSeed(player, '生命之种');

  assert.equal(stored.名称, '生命之种');
  assert.equal(player.xiangu_seeds[0].名称, '生命之种');
  assert.deepEqual(player.xiangu_run.获得道种, ['生命之种']);
});

test('普通、稀有、传说道种不会命中神火极境', () => {
  for (const name of ['灵火灵种', '青鸾焰', '朱雀焚天炎', '太阳神火']) {
    assert.equal(resolveXianguSeedExtremeName(config, levels, name), null);
  }
});

test('顶级道种不会跨碎片掉落', () => {
  const catalog = getXianguTopSeedCatalog(config);
  const fragments = new Map();
  for (const seed of catalog) {
    seed.出现碎片.forEach((fragmentId, index) => {
      fragments.set(fragmentId, seed.出现区域[index] || seed.出现区域[0]);
    });
  }

  for (const [fragmentId, location] of fragments) {
    const allowed = new Set(catalog.filter(seed =>
      seed.出现区域.includes(location) && seed.出现碎片.includes(fragmentId)
    ).map(seed => seed.名称));
    assert.ok(allowed.size > 0, `${fragmentId}应至少配置一种顶级道种`);

    for (let seed = 1; seed <= 100; seed++) {
      const reward = drawXianguSeed(config, {
        location,
        fragmentId,
        source: 'unique',
        forceTop: true,
        random: seededRandom(seed),
      });
      assert.equal(reward.顶级道种, true);
      assert.ok(allowed.has(reward.名称), `${reward.名称}不应出现在${fragmentId}`);
    }
  }
});

test('11种顶级道种在各自来源中都可被权重抽中', () => {
  const catalog = getXianguTopSeedCatalog(config);
  for (const target of catalog) {
    const location = target.出现区域[0];
    const fragmentId = target.出现碎片[0];
    const candidates = catalog.filter(seed =>
      seed.出现区域.includes(location) && seed.出现碎片.includes(fragmentId)
    );
    const targetIndex = candidates.findIndex(seed => seed.名称 === target.名称);
    const totalWeight = candidates.reduce((sum, seed) => sum + seed.权重, 0);
    const priorWeight = candidates.slice(0, targetIndex).reduce((sum, seed) => sum + seed.权重, 0);
    const targetRoll = (priorWeight + target.权重 / 2) / totalWeight;
    const reward = drawXianguSeed(config, {
      location,
      fragmentId,
      source: 'unique',
      forceTop: true,
      random: sequenceRandom([0, targetRoll]),
    });
    assert.equal(reward.名称, target.名称, `${target.名称}应能从${fragmentId}抽中`);
  }
});

test('火道禁区和隐藏区域都有独立常规池', () => {
  const edgeNames = new Set(getRegularXianguSeedNames('边缘区域'));
  for (const location of ['火道禁区', '隐藏区域']) {
    const reward = drawXianguSeed(config, {
      location,
      source: 'treasure',
      random: () => 0.999999,
    });
    assert.equal(reward.顶级道种, false);
    assert.equal(edgeNames.has(reward.名称), false, `${location}不应回退边缘普通灵种`);
  }
});

test('发放道种只追加xiangu_seeds并保留既有数据', () => {
  const previousRunSeeds = ['旧收获'];
  const player = {
    xiangu_seeds: [{ 名称: '旧道种' }],
    xiangu_run: { 获得道种: previousRunSeeds },
    najie: { 灵石: 10 },
  };
  const reward = drawXianguSeed(config, {
    location: '火道禁区',
    fragmentId: 'flame_abyss',
    source: 'unique',
    forceTop: true,
    random: () => 0.999999,
    now: 0,
  });
  grantXianguSeed(player, reward);
  grantXianguSeed(player, reward);

  assert.equal(player.xiangu_seeds.length, 3);
  assert.equal(player.xiangu_seeds[0].名称, '旧道种');
  assert.equal(player.xiangu_seeds[1].名称, '青月焰');
  assert.equal(player.xiangu_seeds[2].名称, '青月焰');
  assert.deepEqual(previousRunSeeds, ['旧收获']);
  assert.notEqual(player.xiangu_run.获得道种, previousRunSeeds);
  assert.deepEqual(player.xiangu_run.获得道种, ['旧收获', '青月焰', '青月焰']);
  assert.deepEqual(player.najie, { 灵石: 10 });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS,
  FOREIGN_CALAMITY_INDEX_KEY,
  FOREIGN_PAGE_REQUIREMENT,
  FOREIGN_TECHNIQUES,
  PLANE_FAVOR_WUDAO_COST,
  averageForeignCalamityPlayers,
  consumePlaneFavorForWudao,
  createForeignCalamityRewardPlan,
  createForeignCalamityWave,
  listForeignCalamities,
  saveForeignCalamity,
  spawnForeignCalamities,
} from '../model/foreignCalamity.js';

const samplePlayers = [
  { 攻击: 100, 防御: 80, 血量上限: 1000, 速度: 100, 元神: 200, 生命本源: 51, 暴击率: 0.2, 暴击伤害: 1.5, mijinglevel_id: 4, xiangulevel_id: 2, huafenlevel_id: 1 },
  { 攻击: 300, 防御: 160, 血量上限: 3000, 速度: 200, 元神: 400, 生命本源: 151, 暴击率: 0.4, 暴击伤害: 2.5, mijinglevel_id: 8, xiangulevel_id: 4, huafenlevel_id: 3 },
];

test('每名玩家的域外灾厄讨伐冷却为15分钟', () => {
  assert.equal(FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS, 15 * 60 * 1000);
});

test('域外灾厄按全服有效玩家平均值生成1至10尊，并继承额外体系', () => {
  const average = averageForeignCalamityPlayers(samplePlayers);
  assert.equal(average.攻击, 200);
  assert.equal(average.血量上限, 2000);
  assert.equal(average.生命本源, 101);
  assert.equal(average.mijinglevel_id, 6);
  assert.equal(average.samples, 2);

  const one = createForeignCalamityWave({ worldYear: 1000, players: samplePlayers, random: () => 0 });
  const ten = createForeignCalamityWave({ worldYear: 2000, players: samplePlayers, random: () => 0.999999 });
  assert.equal(one.length, 1);
  assert.equal(ten.length, 10);
  assert.ok(one[0].攻击 > 0 && one[0].防御 > 0 && one[0].血量上限 > 0);
  assert.ok(one[0].生命本源 > 0);
  assert.ok(one[0].mijinglevel_id > 0 && one[0].xiangulevel_id > 0 && one[0].huafenlevel_id > 0);
  assert.ok(one[0].额外体系);
});

test('跨过多个千年节点会逐波生成，重复执行不会再生成', async () => {
  const values = new Map();
  const sets = new Map();
  globalThis.redis = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options = {}) {
      if (options.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(key) { return Number(values.delete(key)); },
    async eval(_script, { keys, arguments: args }) {
      return values.get(keys[0]) === args[0] ? this.del(keys[0]) : 0;
    },
    async sMembers(key) { return [...(sets.get(key) || [])]; },
    async sRem(key, value) { return Number(sets.get(key)?.delete(value) || false); },
    async sAdd(key, value) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(value);
    },
  };
  try {
    const spawned = await spawnForeignCalamities(0, 2500, { players: samplePlayers, random: () => 0 });
    assert.deepEqual(spawned.map(entity => entity.worldYear), [1000, 2000]);
    assert.deepEqual(await spawnForeignCalamities(0, 2500, { players: samplePlayers, random: () => 0 }), []);
  } finally {
    delete globalThis.redis;
  }
});

test('已领奖和失效灾厄会从活动索引清理', async () => {
  const values = new Map();
  const sets = new Map([[FOREIGN_CALAMITY_INDEX_KEY, new Set(['active', 'claimed', 'missing'])]]);
  values.set('xiuxian:foreign-calamity:entity:active', JSON.stringify({ id: 'active', status: 'active' }));
  values.set('xiuxian:foreign-calamity:entity:claimed', JSON.stringify({
    id: 'claimed', status: 'defeated', rewardClaimedAt: 1,
  }));
  globalThis.redis = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options = {}) {
      if (options.NX && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(key) { return Number(values.delete(key)); },
    async eval(_script, { keys, arguments: args }) {
      return values.get(keys[0]) === args[0] ? this.del(keys[0]) : 0;
    },
    async sMembers(key) { return [...(sets.get(key) || [])]; },
    async sAdd(key, value) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(value);
    },
    async sRem(key, value) { sets.get(key)?.delete(value); },
  };
  try {
    const entities = await listForeignCalamities();
    assert.deepEqual(entities.map(entity => entity.id), ['active']);
    assert.deepEqual([...sets.get(FOREIGN_CALAMITY_INDEX_KEY)], ['active']);

    await saveForeignCalamity({ id: 'pending', status: 'defeated' });
    assert.ok(sets.get(FOREIGN_CALAMITY_INDEX_KEY).has('pending'));
    await saveForeignCalamity({ id: 'pending', status: 'defeated', rewardClaimedAt: 2 });
    assert.equal(sets.get(FOREIGN_CALAMITY_INDEX_KEY).has('pending'), false);
  } finally {
    delete globalThis.redis;
  }
});

test('击杀奖励严格抽取两种不同奖组，并固定消减业力、增加位面青睐', () => {
  const entity = createForeignCalamityWave({ worldYear: 1000, players: samplePlayers, random: () => 0.4 })[0];
  for (let index = 0; index < 50; index++) {
    let seed = index + 1;
    const reward = createForeignCalamityRewardPlan(entity, () => ((seed++ * 9301 + 49297) % 233280) / 233280);
    assert.equal(reward.groups.length, 2);
    assert.equal(new Set(reward.groups.map(group => group.type)).size, 2);
    assert.ok(reward.karmaReduction >= 5 && reward.karmaReduction <= 10);
    assert.ok(reward.planeFavor >= 5 && reward.planeFavor <= 20);
    for (const group of reward.groups) {
      if (group.type === 'page') assert.ok(group.amount >= 1 && group.amount <= 3);
      if (group.type === 'strengthen' || group.type === 'token') assert.ok(group.amount >= 1 && group.amount <= 10);
    }
  }
});

test('位面青睐达到50点且实际增加悟道收益时才消耗50点', () => {
  assert.equal(PLANE_FAVOR_WUDAO_COST, 50);
  const player = { 位面青睐: 58 };
  assert.deepEqual(consumePlaneFavorForWudao(player, 100, 500), {
    gain: 120, consumed: 50, bonus: 20, remainingFavor: 8,
  });
  assert.equal(player.位面青睐, 8);

  assert.deepEqual(consumePlaneFavorForWudao(player, 100, 100), {
    gain: 100, consumed: 0, bonus: 0, remainingFavor: 8,
  });
  assert.equal(player.位面青睐, 8);

  const insufficient = { 位面青睐: 49 };
  assert.deepEqual(consumePlaneFavorForWudao(insufficient, 100, 500), {
    gain: 100, consumed: 0, bonus: 0, remainingFavor: 49,
  });
  assert.equal(insufficient.位面青睐, 49);
});

test('十三门域外传承均有十页合一材料，只有道与法和杀术配置战斗技能', () => {
  const gongfa = JSON.parse(fs.readFileSync(new URL('../resources/data/item/功法列表.json', import.meta.url), 'utf8'));
  const items = JSON.parse(fs.readFileSync(new URL('../resources/data/item/道具列表.json', import.meta.url), 'utf8'));
  const attackSkills = JSON.parse(fs.readFileSync(new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url), 'utf8'));
  assert.equal(FOREIGN_TECHNIQUES.length, 13);
  assert.equal(FOREIGN_PAGE_REQUIREMENT, 10);
  for (const technique of FOREIGN_TECHNIQUES) {
    assert.ok(gongfa.some(item => item.name === technique.name), technique.name);
    assert.ok(items.some(item => item.name === technique.page && item.type === '域外功法残页'), technique.page);
    assert.equal(
      attackSkills.some(skill => skill.name === technique.name),
      technique.category !== '修炼功法',
      `${technique.name}技能配置`,
    );
  }
});

test('域外灾厄应用模块可以完整装载', () => {
  const cwd = fileURLToPath(new URL('../../..', import.meta.url));
  const script = `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    const { ForeignCalamity } = await import('./plugins/zhutianxiuxian1.0/apps/Boss/ForeignCalamity.js');
    const app = new ForeignCalamity();
    if (!app.rule.some(rule => rule.reg === '^#天魔炼化魔主$')) process.exit(2);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

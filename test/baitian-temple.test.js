import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL,
  BAITIAN_TEMPLE_INTERVAL_HOURS,
  BAITIAN_TEMPLE_SOURCE_PER_INTERVAL,
  NILUAN_TECHNIQUE,
  buildBaitianTemple,
  openJadeCasket,
  settleBaitianTemple,
} from '../model/baitianTemple.js';
import {
  allocateGongfaInsight,
  resolveGongfaCombatSkill,
} from '../model/gongfaProficiency.js';

test('玉石匣只消耗一次并直接烙印逆乱八式', () => {
  const player = { 学习的功法: [] };
  const najie = { 道具: [{ name: '玉石匣', 数量: 1 }] };

  assert.equal(openJadeCasket(player, najie).ok, true);
  assert.equal(player.败天传承已开启, true);
  assert.deepEqual(player.学习的功法, [NILUAN_TECHNIQUE]);
  assert.equal(najie.道具.length, 0);
  assert.equal(openJadeCasket(player, najie).reason, 'opened');
});

test('败天神殿消耗2000万源石和15枚世界石', () => {
  const player = { 败天传承已开启: true, 源石: 30_000_000 };
  const najie = { 材料: [{ name: '世界石', 数量: 20 }] };
  const world = {};

  assert.equal(buildBaitianTemple(player, najie, world, new Date('2026-08-13T00:00:00Z')).ok, true);
  assert.equal(player.源石, 10_000_000);
  assert.equal(najie.材料[0].数量, 5);
  assert.equal(world.败天神殿.上次结算时间, '2026-08-13T00:00:00.000Z');
});

test('败天神殿每四个现实小时结算一次并保留不足四小时的进度', () => {
  const world = {
    败天神殿: {
      建成时间: '2026-08-13T00:00:00.000Z',
      上次结算时间: '2026-08-13T00:00:00.000Z',
    },
  };
  assert.deepEqual(settleBaitianTemple(world, new Date('2026-08-13T03:59:59Z')), {
    cycles: 0,
    hours: 0,
    sourceStone: 0,
    insight: 0,
  });

  const result = settleBaitianTemple(world, new Date('2026-08-13T10:30:00Z'));

  assert.deepEqual(result, {
    cycles: 2,
    hours: 2 * BAITIAN_TEMPLE_INTERVAL_HOURS,
    sourceStone: 2 * BAITIAN_TEMPLE_SOURCE_PER_INTERVAL,
    insight: 2 * BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL,
  });
  assert.equal(world.败天神殿.上次结算时间, '2026-08-13T08:00:00.000Z');
});

test('败天神殿最多累计96个现实小时', () => {
  const world = {
    败天神殿: {
      建成时间: '2026-08-01T00:00:00.000Z',
      上次结算时间: '2026-08-01T00:00:00.000Z',
    },
  };
  const result = settleBaitianTemple(world, new Date('2026-08-13T00:00:00Z'));

  assert.equal(result.cycles, 24);
  assert.equal(result.hours, 96);
  assert.equal(result.sourceStone, 24 * BAITIAN_TEMPLE_SOURCE_PER_INTERVAL);
  assert.equal(result.insight, 24 * BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL);
  assert.equal(world.败天神殿.上次结算时间, '2026-08-13T00:00:00.000Z');
});

test('败天神殿异常时间会校准且不发放奖励', () => {
  const world = { 败天神殿: { 上次结算时间: 'invalid' } };
  const result = settleBaitianTemple(world, new Date('2026-08-13T00:00:00Z'));

  assert.equal(result.cycles, 0);
  assert.equal(result.sourceStone, 0);
  assert.equal(world.败天神殿.上次结算时间, '2026-08-13T00:00:00.000Z');
});

test('神殿感悟可自由分配且不突破功法熟练度上限', () => {
  const player = {
    学习的功法: [NILUAN_TECHNIQUE],
    功法熟练度: { [NILUAN_TECHNIQUE]: 995 },
    功法感悟值: 20,
  };
  const result = allocateGongfaInsight(player, NILUAN_TECHNIQUE, 20);

  assert.deepEqual(result, { ok: true, spent: 5, proficiency: 1000, balance: 15 });
  assert.equal(player.功法熟练度[NILUAN_TECHNIQUE], 1000);
});

test('逆乱八式只会施展当前参悟深度已经解锁的招式', () => {
  const skill = {
    name: NILUAN_TECHNIQUE,
    class: '功法',
    msg1: '基础式',
    招式: [
      { name: '第一式', 最低熟练度: 0, msg1: '第一式' },
      { name: '第二式', 最低熟练度: 100, msg1: '第二式' },
      { name: '第八式', 最低熟练度: 1000, msg1: '第八式' },
    ],
  };
  const novice = { 学习的功法: [NILUAN_TECHNIQUE], 功法熟练度: { [NILUAN_TECHNIQUE]: 99 } };
  const mastered = { 学习的功法: [NILUAN_TECHNIQUE], 功法熟练度: { [NILUAN_TECHNIQUE]: 1000 } };

  assert.equal(resolveGongfaCombatSkill(novice, skill, () => 0.99).msg1, '第一式');
  const finalMove = resolveGongfaCombatSkill(mastered, skill, () => 0.99);
  assert.equal(finalMove.msg1, '第八式');
  assert.equal(finalMove.name, NILUAN_TECHNIQUE);
  assert.equal(finalMove.招式名, '第八式');
});

test('逆乱八式已登记为仙王法并配置完整八式攻击数据', () => {
  const techniques = JSON.parse(readFileSync(new URL('../resources/data/item/功法列表.json', import.meta.url), 'utf8'));
  const attacks = JSON.parse(readFileSync(new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url), 'utf8'));
  const technique = techniques.find(item => item.name === NILUAN_TECHNIQUE);
  const attack = attacks.find(item => item.name === NILUAN_TECHNIQUE);

  assert.equal(technique.type, '仙王法');
  assert.equal(attack.class, '功法');
  assert.equal(attack.招式.length, 8);
  assert.deepEqual(attack.招式.map(move => move.最低熟练度), [0, 100, 250, 400, 500, 650, 750, 1000]);
});

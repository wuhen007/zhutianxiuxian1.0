import assert from 'node:assert/strict';
import test from 'node:test';

import { tryNpcProtectorIntervention } from '../model/npcProtector.js';

import {
  applyTianjiaoAuctionCounterbid,
  applyTianjiaoDungeonSneakAttack,
  buildProxyPlunder,
  buildTianjiaoSurrenderOffer,
  clearTianjiaoHatred,
  getTianjiaoHatredLevel,
  getTribulationAmbushChance,
  isTianjiaoAvailable,
  parseTribulationLocation,
  resolveTianjiaoSoulBacklash,
  rollIndependentTianjiaoEscape,
  selectHostileTianjiao,
} from '../model/tianjiaoHostility.js';

function createRedis(entries = {}) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key, String(value)]));
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async keys(pattern) {
      const prefix = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern;
      return [...values.keys()].filter(key => key.startsWith(prefix));
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
  };
}

test('仇恨档位按边界分级', () => {
  assert.equal(getTianjiaoHatredLevel(60), '敌视');
  assert.equal(getTianjiaoHatredLevel(61), '仇恨');
  assert.equal(getTianjiaoHatredLevel(101), '死敌');
  assert.equal(getTianjiaoHatredLevel(201), '不死不休');
});

test('死亡、养伤和全局复活期的天骄不参与仇恨事件', async () => {
  const now = 1_000_000;
  assert.equal(isTianjiaoAvailable({ isAlive: false }, 100, now), false);
  assert.equal(isTianjiaoAvailable({ isAlive: true, currentHP: 0 }, 100, now), false);
  assert.equal(isTianjiaoAvailable({ isAlive: true, isHealing: true }, 100, now), false);
  assert.equal(isTianjiaoAvailable({
    isAlive: true,
    isHealing: true,
    养伤: { untilWorldYear: 101 },
  }, 100, now), false);
  assert.equal(isTianjiaoAvailable({
    isAlive: true,
    isHealing: true,
    养伤: { untilWorldYear: 100 },
  }, 100, now), true);

  const redis = createRedis({
    'tianjiao:hatred:伤者:1': 300,
    'tianjiao:status:伤者:1': JSON.stringify({ isAlive: true }),
    'tianjiao:status:伤者': JSON.stringify({
      isAlive: true,
      isHealing: true,
      养伤: { untilWorldYear: 200 },
    }),
    'tianjiao:hatred:轮回者:1': 300,
    'tianjiao:global:revive:轮回者': now + 1,
    'tianjiao:hatred:清醒者:1': 120,
    'tianjiao:status:清醒者': JSON.stringify({ isAlive: true }),
  });
  const selected = await selectHostileTianjiao({
    redis,
    tianjiaoList: [{ 名号: '伤者' }, { 名号: '轮回者' }, { 名号: '清醒者' }],
    playerId: '1',
    minimumLevel: '死敌',
    worldYear: 100,
    now,
    random: () => 0,
  });
  assert.equal(selected?.name, '清醒者');
});

test('求饶额外赔礼恰为五种不同物品，稀有度和数量受限', () => {
  const gameData = {
    cailiao_list: Array.from({ length: 7 }, (_, index) => ({
      name: `材料${index + 1}`,
      class: '材料',
      稀有度: index + 1,
    })),
  };
  const offer = buildTianjiaoSurrenderOffer({
    掉落物: [{ name: '天骄佩玉', class: '道具', 数量: 3, 概率: 1, 稀有度: 7 }],
  }, gameData, () => 0);
  assert.equal(offer.normal.length, 1);
  assert.equal(offer.extras.length, 5);
  assert.equal(new Set(offer.extras.map(item => item.name)).size, 5);
  assert.ok(offer.extras.every(item => item.rarity <= 5));
  assert.ok(offer.extras.every(item => item.amount >= 1 && item.amount <= 20));
});

test('天骄逃跑概率与掷骰为两次独立随机', () => {
  const rolls = [0.7, 0.69];
  assert.deepEqual(rollIndependentTianjiaoEscape(() => rolls.shift()), {
    chance: 0.7,
    roll: 0.69,
    escaped: true,
  });
});

test('高阶 NPC 护道人在堵截续战中也会实际对战残血天骄', async () => {
  const player = {
    大帝庇护: 1,
    护道人: '苏灵',
    护道人下次出手时间: 0,
    当前血量: 1,
    血量上限: 100,
  };
  const enemy = { 名号: '堵截天骄', 当前血量: 37, 血量上限: 1_000 };
  let observedHp = 0;
  const result = await tryNpcProtectorIntervention(
    player,
    enemy,
    async (_protector, woundedEnemy) => {
      observedHp = woundedEnemy.当前血量;
      return { winner: 'B', B_hp: woundedEnemy.当前血量, msg: [] };
    },
    1_000,
    { forceBattle: true },
  );
  assert.equal(observedHp, 37);
  assert.equal(result.won, false);
});

test('拍卖抬价同一玩家每件拍品只触发一次', () => {
  const first = applyTianjiaoAuctionCounterbid(
    { last_price: 100, tianjiaoCounteredPlayers: [] },
    { name: '宿敌' },
    '42',
    () => 0,
  );
  assert.equal(first.countered, true);
  assert.equal(first.price, 111);
  assert.equal(first.auction.last_offer_player, -1);
  const second = applyTianjiaoAuctionCounterbid(first.auction, { name: '宿敌' }, '42', () => 1);
  assert.equal(second.countered, false);
});

test('下本偷袭不直接将玩家扣死', () => {
  const player = { 当前血量: 100, 血量上限: 100 };
  const result = applyTianjiaoDungeonSneakAttack(player, () => 1);
  assert.equal(result.damage, 55);
  assert.equal(player.当前血量, 45);
});

test('灵身与神祇收益抢夺不超过已获数量', () => {
  const result = buildProxyPlunder([
    { name: '药草', type: '草药', count: 2 },
    { name: '矿石', type: '材料', count: 100 },
  ], () => 1);
  assert.deepEqual(result.stolen.map(item => item.amount), [1, 65]);
});

test('搜魂反噬同时损伤肉身、元神并留下道伤', () => {
  const player = {
    level_id: 1,
    Physique_id: 1,
    mijinglevel_id: 1,
    当前血量: 1_000,
    血量上限: 1_000,
    元神: 500,
    元神上限: 500,
  };
  const result = resolveTianjiaoSoulBacklash(player, {
    level_id: 20,
    Physique_id: 20,
    mijinglevel_id: 10,
  }, () => 0);
  assert.equal(result.selfDestructed, true);
  assert.ok(player.当前血量 < 1_000);
  assert.ok(player.元神 < 500);
  assert.ok(player.道伤 >= 1);
});

test('偏僻星系和护法都会降低渡劫截道概率', () => {
  assert.equal(parseTribulationLocation('#渡圣人劫 偏僻星系'), 'remote');
  assert.equal(parseTribulationLocation('#证道成帝 偏僻无人的星系'), 'remote');
  assert.equal(parseTribulationLocation('#渡圣人劫'), 'visible');
  assert.ok(getTribulationAmbushChance('remote', 0, 1) < getTribulationAmbushChance('visible', 0, 1));
  assert.ok(getTribulationAmbushChance('visible', 1, 1) < getTribulationAmbushChance('visible', 0, 1));
  assert.ok(getTribulationAmbushChance('visible', 0, 3) > getTribulationAmbushChance('visible', 0, 1));
});

test('天骄入轮回时清理全玩家仇恨和恐惧期', async () => {
  const redis = createRedis({
    'tianjiao:hatred:宿敌:1': 300,
    'tianjiao:hatred:宿敌:2': 80,
    'tianjiao:fear:宿敌:1': 123,
    'tianjiao:hatred_status:宿敌': JSON.stringify({}),
  });
  const result = await clearTianjiaoHatred(redis, '宿敌');
  assert.deepEqual(result, { cleared: 2, fearCleared: 1 });
  assert.equal(redis.values.size, 0);
});

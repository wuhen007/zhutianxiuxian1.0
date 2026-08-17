import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  FISHING_PLANE_NAMES,
  FISH_KING_CHANCE,
  IMMORTAL_BAIT_NAMES,
  IMMORTAL_FISHING_EVENT_CHANCE,
  OTHER_SHORE_FRUIT_CHANCE,
  TIDE_DURATION_YEARS,
  TIDE_INTERVAL_YEARS,
  WISH_SCALE_EXCHANGE_NAMES,
  XIANWU_COORD_CHANCE,
  getFishingTide,
  getImmortalFishingCooldown,
  getImmortalBaitConfig,
  getPlaneFishAtlas,
  getPlaneFishConfig,
  getPlaneFishingEventChoice,
  getWishScaleExchangeConfig,
  parseImmortalBait,
  parseWishScaleExchange,
  recordFishCatch,
  rollBaitRewardAmount,
  rollImmortalBaitReward,
  rollPlaneFish,
  rollPlaneFishingEvent,
  rollWishScaleAmount,
} from '../model/immortalFishing.js';
import {
  calculateFishKingCultivationReward,
  calculateFishKingDamage,
  createFishKingBattleAvatar,
  createFishKingRelicRewards,
  createFishKingRewardAssignments,
  createFishKingState,
  FISH_KING_BATTLE_CD_SECONDS,
  FISH_KING_CHEST_REWARD_CHANCE,
  FISH_KING_DAMAGE_CAP_RATIO,
  FISH_KING_BAIT_POOL,
  FISH_KING_KILL_GROUPS,
  FISH_KING_KILL_REWARD_ITEMS,
  getFishKingBattleCooldown,
  rollFishKingChestReward,
} from '../model/immortalFishKing.js';

const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const itemLists = [
  readJson('../resources/data/item/丹药列表.json'),
  readJson('../resources/data/item/材料列表.json'),
  readJson('../resources/data/item/草药列表.json'),
  readJson('../resources/data/item/道具列表.json'),
  readJson('../resources/data/item/食材列表.json'),
  readJson('../resources/data/item/盒子列表.json'),
].flat();
const combatSkillNames = new Set([
  ...readJson('../resources/data/item/技能组/攻击技能.json'),
  ...readJson('../resources/data/item/技能组/防御技能.json'),
  ...readJson('../resources/data/item/技能组/治疗技能.json'),
].map(skill => skill.name));
const recipes = readJson('../resources/data/item/合成列表.json');
const forgingMaterials = readJson('../resources/data/item/锻造材料.json');

test('五种众生仙饵均有独立奖池、物品登记与合成配方', () => {
  assert.deepEqual(IMMORTAL_BAIT_NAMES, [
    '神藏仙饵',
    '矿髓沉饵',
    '百草香饵',
    '因果道饵',
    '轮回冥饵',
  ]);
  for (const baitName of IMMORTAL_BAIT_NAMES) {
    const config = getImmortalBaitConfig(baitName);
    assert.ok(config.rewards.length > 0);
    assert.equal(config.rewards.reduce((sum, reward) => sum + reward.weight, 0), 100);
    assert.ok(itemLists.some(item => item.name === baitName && item.type === '仙饵'));
    assert.ok(recipes.some(recipe => recipe.name === baitName));
    for (const reward of config.rewards) {
      assert.ok(
        itemLists.some(item => item.name === reward.name && item.class === reward.class),
        `${baitName}奖池中的${reward.name}未登记`
      );
    }
  }
  for (const [name, itemClass] of [
    ['仙武界坐标', '道具'],
    ['彼岸轮回果', '材料'],
  ]) {
    assert.ok(itemLists.some(item => item.name === name && item.class === itemClass));
  }
});

test('垂钓指令可解析仙饵且保留无饵模式', () => {
  assert.equal(parseImmortalBait('#垂钓众生'), null);
  assert.equal(parseImmortalBait('#垂钓众生 轮回冥饵'), '轮回冥饵');
});

test('仙武界坐标概率为2.5%且获得后永久退出奖池', () => {
  assert.equal(XIANWU_COORD_CHANCE, 0.025);
  assert.equal(
    rollImmortalBaitReward('轮回冥饵', {}, () => 0.024999).name,
    '仙武界坐标'
  );
  assert.notEqual(
    rollImmortalBaitReward(
      '轮回冥饵',
      { ownsXianwuCoordinate: true },
      () => 0.024999
    ).name,
    '仙武界坐标'
  );
});

test('彼岸轮回果在坐标区间之后保持0.1%独立区间', () => {
  assert.equal(OTHER_SHORE_FRUIT_CHANCE, 0.001);
  assert.equal(
    rollImmortalBaitReward('轮回冥饵', {}, () => 0.0255).name,
    '彼岸轮回果'
  );
  assert.equal(
    rollImmortalBaitReward(
      '轮回冥饵',
      { ownsXianwuCoordinate: true },
      () => 0.0005
    ).name,
    '彼岸轮回果'
  );
});

test('顶级材料配方数量符合设定', () => {
  const furnace = recipes.find(item => item.name === '造化仙炉');
  assert.deepEqual(furnace.materials, [
    { name: '罗天晶', class: '材料', amount: 5 },
    { name: '道衍晶', class: '材料', amount: 7 },
    { name: '造化仙晶', class: '材料', amount: 3 },
  ]);
  const touchScreen = recipes.find(item => item.name === '神主触屏');
  assert.deepEqual(touchScreen.materials, [
    { name: '神主触屏碎片', class: '道具', amount: 10 },
  ]);
});

test('愿鳞兑换档位、数量及绑定引潮灯符合设定', () => {
  assert.equal(parseWishScaleExchange('#愿鳞兑换'), null);
  assert.equal(parseWishScaleExchange('#愿鳞兑换 宇宙核心'), '宇宙核心');
  assert.deepEqual(WISH_SCALE_EXCHANGE_NAMES, [
    '众生仙钓', '百草香饵', '神藏仙饵', '矿髓沉饵', '因果道饵', '轮回冥饵',
    '宇宙核心', '界核', '鸿蒙道火', '三千弱水', '万界引潮灯', '轮回命签',
  ]);
  assert.deepEqual(
    WISH_SCALE_EXCHANGE_NAMES.map(name => [name, getWishScaleExchangeConfig(name).cost]),
    [
      ['众生仙钓', 5], ['百草香饵', 30], ['神藏仙饵', 30],
      ['矿髓沉饵', 40], ['因果道饵', 50], ['轮回冥饵', 50],
      ['宇宙核心', 80], ['界核', 80], ['鸿蒙道火', 80],
      ['三千弱水', 80], ['万界引潮灯', 120], ['轮回命签', 50],
    ]
  );
  for (const name of ['宇宙核心', '界核', '鸿蒙道火', '三千弱水']) {
    assert.ok(forgingMaterials.some(item => item.name === name && item.class === '材料'));
    assert.equal(getWishScaleExchangeConfig(name).reward.amount, 5);
  }
  const sign = getWishScaleExchangeConfig('轮回命签');
  assert.equal(sign.reward.name, '轮回命签');
  assert.equal(sign.reward.amount, 50);
  assert.ok(itemLists.some(item => item.name === '轮回命签' && item.class === '道具'));
  const lamp = itemLists.find(item => item.name === '万界引潮灯');
  assert.equal(lamp.不可交易, 1);
});

test('垂钓基础四十分钟，引潮灯先减半，道法仙术再减十分钟', () => {
  assert.equal(getImmortalFishingCooldown(), 40 * 60 * 1000);
  assert.equal(getImmortalFishingCooldown({ hasTideLamp: true }), 20 * 60 * 1000);
  assert.equal(getImmortalFishingCooldown({ hasDaoArt: true }), 30 * 60 * 1000);
  assert.equal(
    getImmortalFishingCooldown({ hasTideLamp: true, hasDaoArt: true }),
    10 * 60 * 1000
  );
  assert.equal(rollWishScaleAmount(false, () => 0), 1);
  assert.equal(rollWishScaleAmount(false, () => 0.999999), 5);
  assert.equal(rollWishScaleAmount(true, () => 0), 2);
  assert.equal(rollWishScaleAmount(true, () => 0.999999), 10);
});

test('仙饵钓物数量随机1~5，引潮灯翻倍为2~10', () => {
  assert.equal(rollBaitRewardAmount(false, () => 0), 1);
  assert.equal(rollBaitRewardAmount(false, () => 0.999999), 5);
  assert.equal(rollBaitRewardAmount(true, () => 0), 2);
  assert.equal(rollBaitRewardAmount(true, () => 0.999999), 10);
});

test('七个位面均有8%额外垂钓奇遇且不触发时返回空', () => {
  assert.equal(IMMORTAL_FISHING_EVENT_CHANCE, 0.08);
  assert.equal(rollPlaneFishingEvent('凡间', () => 0.08), null);
  for (const plane of ['凡间', '仙界', '遮天位面', '九天十地', '下界八域', '太初星墟', '仙域']) {
    const event = rollPlaneFishingEvent(plane, () => 0.079999);
    assert.ok(event?.id, `${plane}缺少垂钓奇遇`);
    assert.equal(event.choices.length, 3, `${plane}奇遇不是三选一`);
  }
  assert.equal(getPlaneFishingEventChoice('duan-de', 1).playerFlags.古地府秘辛, true);
});

test('七个位面各有三种普通鱼与一只专属鱼王', () => {
  assert.deepEqual(FISHING_PLANE_NAMES, [
    '凡间', '仙界', '遮天位面', '下界八域', '九天十地', '太初星墟', '仙域',
  ]);
  for (const plane of FISHING_PLANE_NAMES) {
    const config = getPlaneFishConfig(plane);
    assert.equal(config.fish.length, 3);
    assert.equal(config.fish.reduce((sum, fish) => sum + fish.weight, 0), 100);
    assert.ok(config.king.name);
    assert.ok(config.king.speed > 0);
    assert.ok(config.king.skills.length >= 2);
    assert.ok(config.king.skills.every(name => combatSkillNames.has(name)));
  }
  assert.equal(new Set(FISHING_PLANE_NAMES.map(
    plane => getPlaneFishConfig(plane).king.speed
  )).size, FISHING_PLANE_NAMES.length);
});

test('万界潮汐每五千年刷新并持续两千年', () => {
  assert.equal(TIDE_INTERVAL_YEARS, 5000);
  assert.equal(TIDE_DURATION_YEARS, 2000);
  assert.equal(getFishingTide(1999).active, true);
  assert.equal(getFishingTide(2000).active, false);
  assert.equal(getFishingTide(4999).active, false);
  assert.equal(getFishingTide(5000).active, true);
  assert.deepEqual(getFishingTide(5000).planes, getFishingTide(6999).planes);
  assert.notEqual(getFishingTide(5000).planes[0], getFishingTide(5000).planes[1]);
});

test('鱼王基础概率为1%，旺潮位面提升至2%', () => {
  assert.equal(FISH_KING_CHANCE, 0.01);
  const normalTide = { active: false, planes: [] };
  const boostedTide = { active: true, planes: ['凡间'] };
  assert.equal(rollPlaneFish('凡间', { tide: normalTide }, () => 0.009).type, 'king');
  assert.equal(rollPlaneFish('凡间', { tide: normalTide }, () => 0.01).type, 'fish');
  assert.equal(rollPlaneFish('凡间', { tide: boostedTide }, () => 0.019).type, 'king');
});

test('普通鱼与鱼王击杀都能登记图鉴', () => {
  const player = {};
  recordFishCatch(player, '凡间', '青灵鲤');
  recordFishCatch(player, '凡间', '青灵鲤');
  recordFishCatch(player, '凡间', '吞舟玄龟');
  const atlas = getPlaneFishAtlas(player, '凡间');
  assert.equal(atlas.collected, 2);
  assert.equal(atlas.entries.find(entry => entry.name === '青灵鲤').count, 2);
  assert.equal(atlas.entries.find(entry => entry.king).count, 1);
});

test('鱼王状态、伤害与击杀奖励：每人3组完整清单', () => {
  const state = createFishKingState({
    groupId: 1,
    ownerId: 2,
    ownerName: '垂钓者',
    plane: '凡间',
    king: { name: '吞舟玄龟', speed: 150, skills: ['真龙宝术', '不灭经'] },
    ownerPower: 100000,
    now: 1000,
  });
  assert.equal(state.healthMax, 2000000);
  assert.equal(FISH_KING_BATTLE_CD_SECONDS, 30 * 60);
  assert.equal(getFishKingBattleCooldown(), 30 * 60);
  assert.equal(getFishKingBattleCooldown({ hasDaoArt: true }), 20 * 60);
  assert.equal(FISH_KING_DAMAGE_CAP_RATIO, 0.2);
  assert.equal(calculateFishKingDamage(state, true), 300000);
  assert.equal(calculateFishKingDamage(state, true, state.healthMax * 10), 400000);
  const avatar = createFishKingBattleAvatar({
    攻击: 1000,
    防御: 800,
    血量上限: 5000,
    速度: 200,
    暴击率: 0.2,
    灵根: { 法球倍率: 2 },
  }, state, () => 0);
  assert.equal(avatar.攻击, 800);
  assert.equal(avatar.防御, 640);
  assert.equal(avatar.血量上限, 4000);
  assert.equal(avatar.速度, 150);
  assert.deepEqual(avatar.学习的功法, ['真龙宝术', '不灭经']);
  // 击杀奖励：每人 FISH_KING_KILL_GROUPS 组，每组 7 项普通物品（遗珍单发）
  const rewards = createFishKingRewardAssignments(state.members, () => 0);
  const itemCountPerGroup = FISH_KING_KILL_REWARD_ITEMS.filter(item => item.special !== 'relic').length;
  assert.equal(rewards.length, FISH_KING_KILL_GROUPS * itemCountPerGroup);
  assert.ok(rewards.every(reward => reward.recipient.id === '2'));
  // random=0 → 数量取区间下限；饵料固定取池首
  const byName = {};
  for (const reward of rewards) {
    byName[reward.name] = (byName[reward.name] || 0) + reward.amount;
  }
  assert.equal(byName['遣龙令'], FISH_KING_KILL_GROUPS * 1);
  assert.equal(byName['超越宝盒'], FISH_KING_KILL_GROUPS * 1);
  assert.equal(byName['遣虎令'], FISH_KING_KILL_GROUPS * 1);
  assert.equal(byName[FISH_KING_BAIT_POOL[0]], FISH_KING_KILL_GROUPS * 1);
  assert.equal(byName['一叶轻舟'], FISH_KING_KILL_GROUPS);
  assert.equal(byName['群星秘钥'], FISH_KING_KILL_GROUPS * 1);
  assert.equal(byName['仙舟'], FISH_KING_KILL_GROUPS * 1);
  // 遗珍：每人 FISH_KING_KILL_GROUPS 件，随机品质、位面套装、id 互异
  const relicRewards = createFishKingRelicRewards(state, () => 0);
  assert.equal(relicRewards.length, FISH_KING_KILL_GROUPS);
  assert.equal(new Set(relicRewards.map(r => r.relic.id)).size, FISH_KING_KILL_GROUPS);
  assert.ok(relicRewards.every(r => r.recipient.id === '2' && r.relic.品质 === '凡耀' && r.relic.套装 === '玄黄不灭'));
});

test('鱼王宝箱：9项独立概率掉落 + 愿鳞15~30保底', () => {
  // random=0：9 项全部命中（0 < 0.55），数量取下限，饵料取池首，愿鳞 15
  const all = rollFishKingChestReward(() => 0);
  assert.equal(all.length, 10); // 9 项 + 保底愿鳞
  assert.equal(all[all.length - 1].name, '众生愿鳞');
  assert.equal(all[all.length - 1].amount, 15);
  assert.ok(all.some(item => item.name === '无尽扫荡券' && item.amount === 1));
  assert.ok(all.some(item => item.name === '定神丹' && item.amount === 1));
  assert.ok(all.some(item => item.name === '群星秘钥' && item.amount === 1));
  assert.ok(all.some(item => item.name === '超越宝盒' && item.amount === 3));
  assert.ok(all.some(item => item.name === '众生仙钓' && item.amount === 2));
  assert.ok(all.some(item => item.name === FISH_KING_BAIT_POOL[0] && item.amount === 2));
  assert.ok(all.some(item => item.name === '一叶轻舟' && item.amount === 1));
  assert.ok(all.some(item => item.name === '界河灵舟' && item.amount === 1));
  assert.ok(all.some(item => item.name === '仙舟' && item.amount === 3));
  // random=0.999：9 项全部落空（0.999 >= 0.55），仅剩保底愿鳞（范围 15~30）
  const none = rollFishKingChestReward(() => 0.999);
  assert.equal(none.length, 1);
  assert.equal(none[0].name, '众生愿鳞');
  assert.ok(none[0].amount >= 15 && none[0].amount <= 30);
  // 概率阈值与愿鳞上限
  assert.equal(FISH_KING_CHEST_REWARD_CHANCE, 0.55);
  assert.ok(rollFishKingChestReward(() => 0.999).every(item => item.amount <= 30));
  assert.ok(itemLists.some(item => item.name === '鱼王宝箱' && item.class === '盒子'));
});

test('击杀修为血气 = 2000万 × 五维等级乘积', () => {
  const player = {
    level_id: 10,
    Physique_id: 10,
    mijinglevel_id: 5,
    xiangulevel_id: 3,
    huafenlevel_id: 2,
  };
  // 2000万 × (10×10×5×3×2=3000) = 600亿
  assert.equal(calculateFishKingCultivationReward(player), 60_000_000_000);
  assert.equal(calculateFishKingCultivationReward({}), 20_000_000); // 缺失字段按 1
});

test('多人讨伐：每名成员独立获得3组奖励与3件遗珍', () => {
  const members = [
    { id: '2', name: '垂钓者' },
    { id: '3', name: '甲' },
    { id: '4', name: '乙' },
  ];
  const rewards = createFishKingRewardAssignments(members, () => 0.5);
  const itemCountPerGroup = FISH_KING_KILL_REWARD_ITEMS.filter(item => item.special !== 'relic').length;
  assert.equal(rewards.length, members.length * FISH_KING_KILL_GROUPS * itemCountPerGroup);
  for (const member of members) {
    const mine = rewards.filter(reward => reward.recipient.id === member.id);
    assert.equal(mine.length, FISH_KING_KILL_GROUPS * itemCountPerGroup);
    assert.ok(mine.every(reward => reward.amount >= 1));
  }
  const state = { id: 's1', plane: '仙界', members };
  const relicRewards = createFishKingRelicRewards(state, () => 0.5);
  assert.equal(relicRewards.length, members.length * FISH_KING_KILL_GROUPS);
  assert.equal(new Set(relicRewards.map(r => r.relic.id)).size, members.length * FISH_KING_KILL_GROUPS);
  assert.ok(relicRewards.every(r => r.relic.品质 === '灵玄' && r.relic.套装 === '万法天章'));
});

test('渡劫天功由十张残页合成并登记为帝经', () => {
  const recipe = recipes.find(item => item.name === '渡劫天功');
  assert.deepEqual(recipe.materials, [
    { name: '渡劫天功残页', class: '材料', amount: 10 },
  ]);
  const skills = readJson('../resources/data/item/功法列表.json');
  assert.equal(skills.find(item => item.name === '渡劫天功').type, '帝经');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  FLOWER_ANCESTOR_BREEDING_MS,
  FLOWER_ANCESTOR_DORMANT_MS,
  FLOWER_ANCESTOR_WUDAO_LIMIT,
  SUPER_FLOWER_FRUIT_NAME,
  applyAncestorWudao,
  beginFlowerAncestorBreeding,
  calculateFlowerDaoGain,
  consumeSuperFlowerFruit,
  ensureFlowerPollenState,
  getFlowerAncestorSeedState,
  getFlowerDaoGateState,
  settleFlowerAncestorSeed,
} from '../model/flowerPollenPath.js';
import {
  FLOWER_ANCESTOR_SEED_DROP_CHANCE,
  getShengxuDungeon,
  resolveShengxuDungeonReward,
} from '../model/shengxuContent.js';

test('祖种孕育完成后进入24小时沉寂，并在沉寂结束时刷新悟道次数', () => {
  const start = 1_000_000;
  const player = ensureFlowerPollenState({ huafenlevel_id: 11 });
  const started = beginFlowerAncestorBreeding(player, start, { hasSeed: true, hasStoneJar: true });
  assert.equal(started.ok, true);
  assert.equal(started.completeAt, start + FLOWER_ANCESTOR_BREEDING_MS);

  const completed = settleFlowerAncestorSeed(player, start + FLOWER_ANCESTOR_BREEDING_MS);
  assert.equal(completed.completed, true);
  assert.equal(player.花粉路祖种状态.待领取异果, 1);
  assert.equal(player.花粉路祖种状态.沉寂结束时间, start + FLOWER_ANCESTOR_BREEDING_MS + FLOWER_ANCESTOR_DORMANT_MS);
  assert.equal(getFlowerAncestorSeedState(player, start + FLOWER_ANCESTOR_BREEDING_MS).dormant, true);

  const awakened = settleFlowerAncestorSeed(player, start + FLOWER_ANCESTOR_BREEDING_MS + FLOWER_ANCESTOR_DORMANT_MS);
  assert.equal(awakened.awakened, true);
  assert.equal(player.花粉路祖种状态.悟道次数, 0);
  assert.equal(beginFlowerAncestorBreeding(player, start + FLOWER_ANCESTOR_BREEDING_MS + FLOWER_ANCESTOR_DORMANT_MS, { hasSeed: true, hasStoneJar: true }).reason, 'fruit-pending');
});

test('延迟结算时沉寂仍从孕育完成时刻计算', () => {
  const start = 5_000_000;
  const player = ensureFlowerPollenState({ huafenlevel_id: 11 });
  beginFlowerAncestorBreeding(player, start, { hasSeed: true, hasStoneJar: true });
  const now = start + FLOWER_ANCESTOR_BREEDING_MS + FLOWER_ANCESTOR_DORMANT_MS + 1;
  const settled = settleFlowerAncestorSeed(player, now);
  assert.equal(settled.completed, true);
  assert.equal(settled.awakened, true);
  assert.equal(player.花粉路祖种状态.沉寂结束时间, 0);
  assert.equal(player.花粉路祖种状态.悟道次数, 0);
});

test('超级异果按四体系乘积补益并补齐此前法则', () => {
  const player = ensureFlowerPollenState({
    level_id: 2,
    Physique_id: 3,
    mijinglevel_id: 4,
    xiangulevel_id: 5,
    huafenlevel_id: 11,
    额外体系: 'huafen',
    修为: 10,
    血气: 20,
    仙道潜力: 30,
    道伤: 4,
  });
  const result = consumeSuperFlowerFruit(player, 2_000_000, { hasFruit: true });
  assert.equal(result.ok, true);
  assert.equal(result.extraLevels, 4 * 5 * 11);
  assert.equal(result.cultivationGain, 2 * 3 * 4 * 5 * 11 * 2_000_000);
  assert.equal(player.修为, 2 * 3 * 4 * 5 * 11 * 2_000_000 + 10);
  assert.equal(player.血气, 2 * 3 * 4 * 5 * 11 * 2_000_000 + 20);
  assert.equal(player.仙道潜力, 30 + 4 * 5 * 11 * 1000);
  assert.equal(player.道伤, 0);
  assert.equal(player.道伤修复度, undefined);
  assert.equal(player.花粉道途.stages.saintPrinciple, 600);
  assert.equal(player.花粉道途.stages.reflectionPrinciple, 1100);
  assert.equal(result.law.completedPrior[0].name, '圣者花粉道则');
  assert.equal(result.lawGain, 1100);
  assert.equal(SUPER_FLOWER_FRUIT_NAME, '超级异果');
});

test('祖种模型入口缺省持有凭证时拒绝执行', () => {
  const breedingPlayer = ensureFlowerPollenState({ huafenlevel_id: 11 });
  breedingPlayer.花粉路祖种状态.孕育完成时间 = 900;
  assert.equal(beginFlowerAncestorBreeding(breedingPlayer, 1_000).reason, 'seed');
  assert.equal(breedingPlayer.花粉路祖种状态.孕育完成时间, 900);
  assert.equal(breedingPlayer.花粉路祖种状态.待领取异果, 0);
  assert.equal(beginFlowerAncestorBreeding(breedingPlayer, 1_000, { hasSeed: true }).reason, 'stone-jar');
  assert.equal(breedingPlayer.花粉路祖种状态.孕育完成时间, 900);

  const fruitPlayer = ensureFlowerPollenState({
    level_id: 2,
    Physique_id: 3,
    huafenlevel_id: 11,
    修为: 10,
    血气: 20,
    仙道潜力: 30,
    道伤: 4,
  });
  fruitPlayer.花粉路祖种状态.孕育完成时间 = 1_900;
  assert.equal(consumeSuperFlowerFruit(fruitPlayer, 2_000).reason, 'fruit');
  assert.equal(fruitPlayer.花粉路祖种状态.孕育完成时间, 1_900);
  assert.equal(fruitPlayer.花粉路祖种状态.待领取异果, 0);
  assert.deepEqual(
    [fruitPlayer.修为, fruitPlayer.血气, fruitPlayer.仙道潜力, fruitPlayer.道伤],
    [10, 20, 30, 4],
  );

  const daoPlayer = ensureFlowerPollenState({ huafenlevel_id: 9 });
  daoPlayer.花粉路祖种状态.孕育完成时间 = 2_900;
  assert.equal(applyAncestorWudao(daoPlayer, 9, () => 0.5, { now: 3_000 }).reason, 'seed');
  assert.equal(daoPlayer.花粉路祖种状态.孕育完成时间, 2_900);
  assert.equal(daoPlayer.花粉路祖种状态.待领取异果, 0);
  assert.equal(daoPlayer.花粉路祖种状态.悟道次数, 0);
});

test('祖种悟道按同条件常规最终收益精确结算三倍', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9, 进化积淀: 40 });
  const gainOptions = {
    eraIndex: 2,
    ancestorSeed: true,
    stoneJar: true,
    physiqueBonus: 0.2,
    aptitudeBonus: 0.15,
    techniqueBonus: 0.1,
    minggeBonus: 0.1,
    titleBonus: 0.05,
    equipmentBonus: 0.1,
    treasureBonus: 0.2,
    worldBonus: 0.1,
    daoHeartMultiplier: 0.9,
  };
  const traceMultiplier = 1.3;
  const normal = calculateFlowerDaoGain(
    structuredClone(player),
    9,
    () => 0.5,
    gainOptions,
  );
  const normalFinalGain = Math.max(1, Math.floor(normal.gain * traceMultiplier));
  const ancestor = applyAncestorWudao(player, 9, () => 0.5, {
    ...gainOptions,
    now: 5_000,
    hasSeed: true,
    postGainMultiplier: traceMultiplier,
  });

  assert.equal(ancestor.ok, true);
  assert.equal(ancestor.normalGain, normalFinalGain);
  assert.equal(ancestor.rawGain, normalFinalGain * 3);
  assert.equal(ancestor.gain, normalFinalGain * 3);
  assert.ok(Math.abs(ancestor.multiplier - normal.multiplier * traceMultiplier * 3) < 1e-12);
});

test('祖种悟道独立记录三次并获得三倍道韵', () => {
  const player = ensureFlowerPollenState({ huafenlevel_id: 9, 进化积淀: 100 });
  const normal = getFlowerDaoGateState(player, 9);
  let first;
  for (let i = 0; i < FLOWER_ANCESTOR_WUDAO_LIMIT; i++) {
    const result = applyAncestorWudao(player, 9, () => 0.5, { now: 5_000 + i, hasSeed: true });
    assert.equal(result.ok, true);
    if (!first) first = result;
  }
  assert.equal(player.花粉路祖种状态.悟道次数, FLOWER_ANCESTOR_WUDAO_LIMIT);
  assert.equal(first.multiplier >= 3, true);
  assert.equal(applyAncestorWudao(player, 9, () => 0.5, { now: 9_000, hasSeed: true }).reason, 'limit');
  assert.equal(getFlowerDaoGateState(player, 9).exp > normal.exp, true);
});

test('祖种命令在锁内读取玩家并以双文件事务消费到期异果', () => {
  const source = fs.readFileSync('apps/User/FlowerPollenPath.js', 'utf8');
  const statusSource = source.slice(source.indexOf('async status(e)'), source.indexOf('async realms(e)'));
  assert.match(statusSource, /const player = await withPlayerMutationLock[\s\S]+const fresh = await Read_player/);

  const consumeSource = source.slice(source.indexOf('async eatSuperFlowerFruit(e)'), source.indexOf('async flowerDao(e)'));
  assert.match(consumeSource, /settleAncestorForUser\(userId, player\)[\s\S]+exist_najie_thing/);
  assert.match(consumeSource, /transaction\.capture\(path\.join\(__PATH\.player_path/);
  assert.match(consumeSource, /transaction\.capture\(path\.join\(__PATH\.najie_path/);
  assert.match(consumeSource, /transaction\.rollback\(\)/);

  assert.ok((source.match(/buildFlowerDaoGainContext\(userId, player,/g) || []).length >= 2);
});

test('祖种只在圣墟极低概率掉落且已从上苍奖励表移除', () => {
  const dungeon = getShengxuDungeon('阳间名山');
  const hitRolls = [1, 1, 1, FLOWER_ANCESTOR_SEED_DROP_CHANCE - Number.EPSILON];
  const missRolls = [1, 1, 1, FLOWER_ANCESTOR_SEED_DROP_CHANCE];
  assert.equal(resolveShengxuDungeonReward(dungeon, () => hitRolls.shift()).ancestorSeed, '花粉路祖种');
  assert.equal(resolveShengxuDungeonReward(dungeon, () => missRolls.shift()).ancestorSeed, '');

  const shangcang = JSON.parse(fs.readFileSync('resources/data/item/副本/上苍之上列表.json', 'utf8'));
  assert.equal(JSON.stringify(shangcang).includes('花粉路祖种'), false);
});

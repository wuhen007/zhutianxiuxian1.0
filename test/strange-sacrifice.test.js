import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  STRANGE_SACRIFICE,
  advanceStrangeSacrificeState,
  applyHeavenWillSlashOnAdvancement,
  applyStrangeSacrificeDefeat,
  buildStrangeSacrificeEnemies,
  getSacrificePromotionGate,
  getStrangeSacrificeEncounter,
  promotePlayerToSacrifice,
} from '../model/strangeSacrifice.js';

function emperor(overrides = {}) {
  return {
    名号: '测试仙帝',
    mijinglevel_id: 21,
    攻击: 100,
    防御: 80,
    当前血量: 900,
    血量上限: 1000,
    道心: 500,
    道心值: 500,
    道心上次恢复时间: Date.now(),
    厄土仙帝击杀数: 10,
    自身之道阶段: 7,
    修炼次数: 400,
    ...overrides,
  };
}

test('首次小祭取八纪元与仙帝出现后两千年的较早值', () => {
  const warning = advanceStrangeSacrificeState(null, {
    worldYear: 100,
    hasImmortalEmperor: true,
  });
  assert.equal(warning.event.type, 'small_warning');
  assert.equal(warning.state.smallDueWorldYear, 2100);

  const started = advanceStrangeSacrificeState(warning.state, {
    worldYear: 2100,
    hasImmortalEmperor: true,
  });
  assert.equal(started.event.type, 'small_started');
  assert.equal(started.state.activeEvent.firstRound, true);

  const ended = advanceStrangeSacrificeState(started.state, {
    worldYear: 4100,
    hasImmortalEmperor: true,
  });
  assert.equal(ended.event.type, 'small_ended');
  assert.equal(
    ended.state.bigDueWorldYear,
    4100 + STRANGE_SACRIFICE.bigDelayEpochs * STRANGE_SACRIFICE.yearsPerEpoch,
  );

  const big = advanceStrangeSacrificeState(ended.state, {
    worldYear: ended.state.bigDueWorldYear,
    hasImmortalEmperor: true,
  });
  assert.equal(big.event.type, 'big_started');
  assert.equal(big.state.activeEvent.firstRound, true);
});

test('小祭五帝围猎固定1150速度且全属性为玩家三倍', () => {
  const player = emperor();
  const encounter = getStrangeSacrificeEncounter(player, 'small', true);
  const enemies = buildStrangeSacrificeEnemies(player, encounter);
  assert.equal(enemies.length, 5);
  assert.equal(enemies[0].速度, 1150);
  assert.equal(enemies[0]._忽略境界速度加成, true);
  assert.equal(enemies[0].攻击, 300);
  assert.equal(enemies[0].防御, 240);
  assert.equal(enemies[0].血量上限, 3000);
});

test('战败打灭三至五条时间线并封锁二十四小时', () => {
  const now = 1_000_000;
  const minimum = emperor();
  const minResult = applyStrangeSacrificeDefeat(minimum, {
    now,
    random: () => 0,
  });
  assert.equal(minResult.count, 3);
  assert.equal(minimum.诡异祭礼身灭道消至, now + 24 * 60 * 60 * 1000);
  assert.equal(minimum.当前血量, 0);

  const maximum = emperor();
  const maxResult = applyStrangeSacrificeDefeat(maximum, {
    now,
    random: () => 0.999999,
  });
  assert.equal(maxResult.count, 5);
});

test('永恒仙图抵消祭礼身灭道消且不打灭时间线', () => {
  const player = emperor({ 当前大道至宝: '永恒仙图', 元神: 0 });
  const result = applyStrangeSacrificeDefeat(player, { now: 1000, random: () => 0 });
  assert.equal(result.rewritten, true);
  assert.deepEqual(result.destroyed, []);
  assert.equal(player.当前血量, 900);
  assert.equal(player.元神, 1);
  assert.equal(player.诡异祭礼身灭道消至, undefined);
});

test('祭道要求十位仙帝击杀、道心圆满与自身之道修满', () => {
  assert.equal(getSacrificePromotionGate(emperor()).ok, true);
  assert.equal(
    getSacrificePromotionGate(emperor({ 厄土仙帝击杀数: 9 })).ok,
    false,
  );
  assert.equal(
    getSacrificePromotionGate(emperor({ 道心: 499, 道心值: 499 })).ok,
    false,
  );
  assert.equal(getSacrificePromotionGate(emperor({ 修炼次数: 399 })).ok, false);

  const xiangu = emperor({
    mijinglevel_id: 1,
    xiangulevel_id: 22,
    自创修炼体系: { route: 'xiangu' },
  });
  assert.equal(getSacrificePromotionGate(xiangu).ok, true);
  assert.equal(promotePlayerToSacrifice(xiangu), 'xiangu');
  assert.equal(xiangu.xiangulevel_id, 23);
  assert.equal(xiangu.自身之道阶段, 8);
});

test('天意一刀会斩断强行踏入仙道领域的道基', () => {
  const previous = { mijinglevel_id: 16 };
  const next = {
    mijinglevel_id: 17,
    修为: 100,
    血气: 100,
    血量上限: 1000,
    当前血量: 1000,
  };
  const result = applyHeavenWillSlashOnAdvancement(
    previous,
    next,
    { heavenSlashUntilWorldYear: 100 },
    50,
  );
  assert.equal(result.triggered, true);
  assert.equal(next.mijinglevel_id, 16);
  assert.equal(next.修为, 0);
  assert.equal(next.道伤, 3);
  assert.equal(next.道基状态, '天意一刀·道基斩开');

  const flower = { huafenlevel_id: 17, 修为: 100, 血气: 100, 血量上限: 1000 };
  applyHeavenWillSlashOnAdvancement(
    {},
    flower,
    { heavenSlashUntilWorldYear: 100 },
    50,
  );
  assert.equal(flower.huafenlevel_id, 1);
});

test('祭道、造化万物与Boss指令已接入新规则', () => {
  const realmSource = fs.readFileSync(
    new URL('../apps/User/zhengdaotixi.js', import.meta.url),
    'utf8',
  );
  const bossSource = fs.readFileSync(
    new URL('../apps/Boss/StrangeSacrifice.js', import.meta.url),
    'utf8',
  );
  assert.match(realmSource, /getSacrificePromotionGate\(player\)/);
  assert.match(realmSource, /calculateCreationEverything\(authorityLevel, itemExist\.稀有度, amount\)/);
  assert.match(realmSource, /action: '造化万物'/);
  assert.match(realmSource, /creationProfile\.causalDebt/);
  assert.match(bossSource, /#迎战诡异小祭/);
  assert.match(bossSource, /#迎战诡异大祭/);
  assert.match(bossSource, /#开启诡异大祭万界/);
});

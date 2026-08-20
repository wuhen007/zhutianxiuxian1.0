import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createShengxuMonster,
  getShengxuDungeon,
  getShengxuDungeonPlane,
  getShengxuExploreCost,
  getShengxuExploreShortages,
  resolveShengxuDungeonReward,
} from '../model/shengxuContent.js';
import {
  STONE_JAR_OPPORTUNITY,
  claimShengxuOpportunityState,
  defaultShengxuOpportunityState,
} from '../model/shengxuOpportunity.js';
import Show from '../model/show.js';

test('shengxu dungeons scale monsters from player attributes', () => {
  const dungeon = getShengxuDungeon('昆仑山');
  const monster = createShengxuMonster({ 攻击: 1000, 防御: 800, 血量上限: 5000 }, dungeon);
  assert.equal(monster.名号, '昆仑兽王');
  assert.equal(monster.攻击, 720);
  assert.equal(monster.当前血量, 3600);
  assert.equal(monster.level_id, 1);
  assert.equal(monster.Physique_id, 1);
  assert.equal(monster._万灵魔幡不可炼化, true);
});

test('shengxu entry cost and plane follow dungeon difficulty', () => {
  const kunlun = getShengxuDungeon('昆仑山');
  const cost = getShengxuExploreCost(kunlun);
  assert.deepEqual(cost, { xiuwei: 1440000, xueqi: 1440000, lingshi: 720000, shouyuan: 2 });
  assert.equal(getShengxuDungeonPlane(kunlun), '小阴间');
  assert.equal(getShengxuDungeonPlane(getShengxuDungeon('魂河古地')), '阳间');
  assert.deepEqual(
    getShengxuExploreShortages({ 修为: 1439999, 血气: 1440000, 灵石: 720000, 寿元: 2 }, cost),
    ['修为需1,440,000，现有1,439,999'],
  );
});

test('shengxu dungeon panel exposes image and four entry costs', () => {
  const html = fs.readFileSync(new URL('../resources/html/shengxu_place/shengxu_place.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../resources/html/shengxu_place/shengxu_place.css', import.meta.url), 'utf8');
  for (const label of ['修为', '血气', '灵石', '寿元']) assert.match(html, new RegExp(label));
  assert.match(html, /妙术秘术/);
  assert.match(css, /secret_place\.jpg/);
  assert.match(css, /card\.jpg/);
  assert.match(css, /background-blend-mode:\s* multiply/);
  assert.match(css, /color:\s*#f4f1e8/);
});

test('shengxu show model resolves its dedicated template', async () => {
  const view = await new Show({ user_id: '10001' }).get_shengxu_placeData({ dungeons: [] });
  assert.match(view.tplFile, /shengxu_place\/shengxu_place\.html$/);
  assert.equal(view.saveId, 'shengxu_place');
});

test('shengxu settlement is claimed and recorded idempotently', () => {
  const source = fs.readFileSync(new URL('../apps/User/ShengxuContent.js', import.meta.url), 'utf8');
  assert.match(source, /xiuxian:shengxu:settling:/);
  assert.match(source, /圣墟副本最近结算/);
  assert.match(source, /idempotencyKey: `shengxu:/);
});

test('earth chapter contains a complete early-game dungeon route', () => {
  const earthDungeons = [
    '太行山', '昆仑山', '武当山', '龙虎山', '嵩山', '终南山', '泰山', '顺天玉虚宫', '大雷音寺遗址',
  ].map(getShengxuDungeon);
  assert.ok(earthDungeons.every(dungeon => dungeon?.chapter === '地球篇'));
  assert.equal(getShengxuDungeon('武当山').gongfa, '太极呼吸法');
});

test('dungeon inheritance drops use configured probability', () => {
  const dungeon = getShengxuDungeon('魂河古地');
  assert.equal(resolveShengxuDungeonReward(dungeon, () => 0).gongfa, '盗引呼吸法');
  assert.equal(resolveShengxuDungeonReward(dungeon, () => 1).gongfa, '');
});

test('a unique opportunity has only one global owner', () => {
  const state = defaultShengxuOpportunityState();
  assert.equal(claimShengxuOpportunityState(state, STONE_JAR_OPPORTUNITY, '10001', 1).ok, true);
  const second = claimShengxuOpportunityState(state, STONE_JAR_OPPORTUNITY, '10002', 2);
  assert.equal(second.ok, false);
  assert.equal(second.ownerId, '10001');
});

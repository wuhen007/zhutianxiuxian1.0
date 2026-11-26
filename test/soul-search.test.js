import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  applySoulSearchKarmaTribulation,
  calculateSoulSearchSuccessRate,
  canUseSoulSearch,
  getSoulSearchProfile,
  pickSoulSearchGongfa,
} from '../apps/User/soulSearchRules.js';

test('斩道王者或仙古真一境均可使用搜魂', () => {
  assert.equal(canUseSoulSearch({ mijinglevel_id: 11 }), true);
  assert.equal(canUseSoulSearch({ mijinglevel_id: 1, xiangulevel_id: 9 }), true);
  assert.equal(canUseSoulSearch({ mijinglevel_id: 10, xiangulevel_id: 8 }), false);
});

test('花粉路达到斩道对标权柄后可使用搜魂', () => {
  assert.equal(canUseSoulSearch({ huafenlevel_id: 10 }), true);
  assert.equal(canUseSoulSearch({ huafenlevel_id: 9 }), false);
});

test('搜魂基础成功率为80%', () => {
  assert.equal(calculateSoulSearchSuccessRate({}, {}), 0.8);
});

test('目标境界或元神等级更高时降低搜魂成功率', () => {
  const executor = { mijinglevel_id: 10, yuanshenlevel_id: 2 };
  assert.equal(
    calculateSoulSearchSuccessRate(executor, { mijinglevel_id: 12, yuanshenlevel_id: 4 }),
    0.6
  );
});

test('搜魂成功率限制在10%到95%', () => {
  assert.equal(
    calculateSoulSearchSuccessRate(
      { mijinglevel_id: 30, yuanshenlevel_id: 20 },
      { mijinglevel_id: 1, yuanshenlevel_id: 0 }
    ),
    0.95
  );
  assert.equal(
    calculateSoulSearchSuccessRate(
      { mijinglevel_id: 1, yuanshenlevel_id: 0 },
      { mijinglevel_id: 30, yuanshenlevel_id: 20 }
    ),
    0.1
  );
});

test('搜魂成功后只随机取得两到三门功法', () => {
  const gongfa = ['一', '二', '三', '四', '五'];
  assert.equal(pickSoulSearchGongfa(gongfa, Infinity, () => 0).length, 2);
  assert.equal(pickSoulSearchGongfa(gongfa, Infinity, () => 0.99).length, 3);
  assert.equal(pickSoulSearchGongfa(['唯一功法'], Infinity, () => 0.99).length, 1);
  assert.equal(pickSoulSearchGongfa(gongfa, 1, () => 0.99).length, 1);
});

test('天魔成长路线提高功法上限和业力雷劫阈值', () => {
  assert.deepEqual(getSoulSearchProfile({}), { maxGongfa: 5, karmaThreshold: 100 });
  assert.deepEqual(getSoulSearchProfile({ 灵根: { name: '九重魔功' } }), {
    maxGongfa: 9,
    karmaThreshold: 150,
  });
  assert.deepEqual(getSoulSearchProfile({ 灵根: { name: '极道天魔' } }), {
    maxGongfa: 10,
    karmaThreshold: 200,
  });
  assert.deepEqual(getSoulSearchProfile({ 灵根: { name: '无相·万化天魔体' } }), {
    maxGongfa: 15,
    karmaThreshold: 300,
  });
});

test('业力不足100时不触发灭世雷劫', () => {
  const player = { 业力值: 99, 当前血量: 1000 };
  assert.deepEqual(applySoulSearchKarmaTribulation(player), {
    triggered: false,
    karma: 99,
    karmaThreshold: 100,
  });
  assert.equal(player.业力值, 99);
});

test('不同天魔体质按各自业力阈值触发雷劫', () => {
  const player = {
    灵根: { name: '无相·万化天魔体' },
    业力值: 299,
    当前血量: 1_000_000,
    防御: 1_000_000_000_000_000,
  };
  assert.equal(applySoulSearchKarmaTribulation(player).triggered, false);
  player.业力值 = 300;
  const result = applySoulSearchKarmaTribulation(player);
  assert.equal(result.triggered, true);
  assert.equal(result.karmaThreshold, 300);
  assert.equal(player.业力值, 0);
});

test('扛过十道灭世雷劫只清算100点业力', () => {
  const player = {
    业力值: 150,
    当前血量: 1_000_000,
    防御: 1_000_000_000_000_000,
  };
  const result = applySoulSearchKarmaTribulation(player);
  assert.equal(result.survived, true);
  assert.equal(result.waves.length, 10);
  assert.equal(player.当前血量, 999_990);
  assert.equal(player.业力值, 50);
});

test('灭世雷劫失败会跌落四体系并削减元神资质功法', () => {
  const player = {
    业力值: 100,
    当前血量: 1,
    防御: 0,
    level_id: 10,
    Physique_id: 9,
    mijinglevel_id: 8,
    xiangulevel_id: 7,
    元神: 800,
    元神上限: 1000,
    天资等级: '超凡资质',
    学习的功法: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'],
  };
  const result = applySoulSearchKarmaTribulation(player, () => 0);

  assert.equal(result.survived, false);
  assert.deepEqual(
    [player.level_id, player.Physique_id, player.mijinglevel_id, player.xiangulevel_id],
    [9, 8, 7, 6]
  );
  assert.equal(player.元神上限, 300);
  assert.equal(player.元神, 300);
  assert.equal(player.天资等级, '平庸之资');
  assert.equal(result.penalty.forgottenGongfa.length, 3);
  assert.equal(player.学习的功法.length, 7);
  assert.equal(player.业力值, 0);
});

test('玩家搜魂必须战斗获胜后才进行元神判定', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/zhengdaotixi.js', import.meta.url),
    'utf8'
  );
  const soulSearch = source.slice(
    source.indexOf('async soulSearch(e)'),
    source.indexOf('async guanding(e)')
  );
  const battle = soulSearch.indexOf('await zd_battle(executor, target, { pvp: true })');
  const victoryGate = soulSearch.indexOf("if (battleResult.winner !== 'A')");
  const soulCheck = soulSearch.indexOf('calculateSoulSearchSuccessRate(executor, target)');

  assert.ok(battle >= 0 && battle < victoryGate && victoryGate < soulCheck);
});

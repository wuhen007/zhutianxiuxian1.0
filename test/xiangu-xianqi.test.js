import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyResolveZhizunExternalDaoFlaw,
  applyShenhuoRefinement,
  canResolveZhizunExternalDaoFlaw,
  clampXianqiStrands,
  ensureXianqiState,
  getFlameQualityRate,
  getNextShenhuoRefinement,
  getNextXianqiTrial,
  getXianguShenhuoAttributeMultiplier,
  getXianqiShieldReductionRate,
  getXianqiStrands,
  getXianqiSuppressMultiplier,
  grantXianqi,
  handleXianguCombatEffects,
  resolveXianguDefensiveMitigation,
  scaleXianguBaseStats,
} from '../model/xianguXianqi.js';

test('仙气道数兼容数字、字符串和旧对象，并限制在零至三道', () => {
  assert.equal(clampXianqiStrands(2), 2);
  assert.equal(clampXianqiStrands('3'), 3);
  assert.equal(clampXianqiStrands({ strands: 1 }), 1);
  assert.equal(clampXianqiStrands(10), 3);
  assert.equal(clampXianqiStrands(-2), 0);
  assert.equal(clampXianqiStrands('无'), 0);
});

test('旧版仙气详情迁移后不再使用凡仙、真仙、仙王标签', () => {
  const player = {
    xiangu_xianqi: {
      strands: 2,
      list: [{ type: '凡仙', src: '旧来源' }],
      flags: { legacy: true },
    },
  };

  assert.equal(ensureXianqiState(player), 2);
  assert.equal(player.xiangu_xianqi, 2);
  assert.deepEqual(
    player.xiangu_xianqi_detail.list.map(entry => entry.name),
    ['第一道仙气', '第二道仙气'],
  );
  assert.equal('type' in player.xiangu_xianqi_detail.list[0], false);
  assert.equal(player.xiangu_xianqi_detail.list[1].src, '历史存档·来源未记录');
  assert.equal(player.xiangu_xianqi_detail.flags.legacy, true);
});

test('仙气按来源幂等发放且不会超过三道', () => {
  const player = { xiangu_xianqi: 0 };
  const now = new Date('2026-07-26T00:00:00.000Z');

  assert.equal(grantXianqi(player, '极品仙种点燃神火', now), true);
  assert.equal(grantXianqi(player, '极品仙种点燃神火', now), false);
  assert.equal(grantXianqi(player, '第二道仙气试炼', now), true);
  assert.equal(grantXianqi(player, '第三道仙气试炼', now), true);
  assert.equal(grantXianqi(player, '额外来源', now), false);
  assert.equal(getXianqiStrands(player), 3);
  assert.equal(player.xiangu_xianqi_detail.list.length, 3);
});

test('第二、第三道仙气只能在神火境依次挑战', () => {
  assert.deepEqual(
    getNextXianqiTrial({ xiangulevel_id: 8, xiangu_xianqi: 0 }),
    { allowed: false, reason: 'first_strand_required', strands: 0 },
  );

  const second = getNextXianqiTrial({ xiangulevel_id: 8, xiangu_xianqi: 1 });
  assert.equal(second.allowed, true);
  assert.equal(second.targetStrand, 2);
  assert.equal(second.costMultiplier, 20);

  const third = getNextXianqiTrial({ xiangulevel_id: 8, xiangu_xianqi: 2 });
  assert.equal(third.allowed, true);
  assert.equal(third.targetStrand, 3);
  assert.equal(third.costMultiplier, 30);

  assert.equal(getNextXianqiTrial({ xiangulevel_id: 9, xiangu_xianqi: 1 }).reason, 'realm');
  assert.equal(getNextXianqiTrial({ xiangulevel_id: 8, xiangu_xianqi: 3 }).reason, 'complete');
});

test('仙气压制每领先一道增加百分之三十并兼容旧存档', () => {
  assert.equal(getXianqiSuppressMultiplier({ xiangu_xianqi: 1 }, { xiangu_xianqi: 0 }), 1.3);
  assert.equal(getXianqiSuppressMultiplier({ xiangu_xianqi: 2 }, { xiangu_xianqi: 0 }), 1.6);
  assert.equal(getXianqiSuppressMultiplier({ xiangu_xianqi: 3 }, { xiangu_xianqi: 0 }), 1.9);
  assert.equal(getXianqiSuppressMultiplier({ xiangu_xianqi: { strands: 2 } }, { xiangu_xianqi: 1 }), 1.3);
  assert.equal(getXianqiSuppressMultiplier({ xiangu_xianqi: 10 }, { xiangu_xianqi: 0 }), 1.9);
  assert.equal(getXianqiSuppressMultiplier({ xiangu_xianqi: 1 }, { xiangu_xianqi: 3 }), 1);
});

test('斩道王者及以上以己道法则免疫仙气压制', () => {
  const threeStrands = { xiangu_xianqi: 3 };

  assert.equal(getXianqiSuppressMultiplier(threeStrands, { mijinglevel_id: 10, xiangu_xianqi: 0 }), 1.9);
  assert.equal(getXianqiSuppressMultiplier(threeStrands, {
    mijinglevel_id: 11,
    xiangu_xianqi: 0,
    道途: { stages: { kingDao: 0 } },
  }), 1);
  assert.equal(getXianqiSuppressMultiplier(threeStrands, { mijinglevel_id: '11', xiangu_xianqi: 0 }), 1);
  assert.equal(getXianqiSuppressMultiplier(threeStrands, { mijinglevel_id: 12, xiangu_xianqi: 0 }), 1);

  // 免疫只看防守方；斩道王者攻击尚未立道者时，已有仙气仍可形成压制。
  assert.equal(getXianqiSuppressMultiplier(
    { mijinglevel_id: 11, xiangu_xianqi: 3 },
    { mijinglevel_id: 10, xiangu_xianqi: 0 },
  ), 1.9);
});

test('神火品质倍率与外道载道隐患按增量缩放仙古基础属性且兼容未记录旧档', () => {
  const levels = [
    { level_id: 7, 基础攻击: 1000, 基础防御: 1000, 基础血量: 1000 },
    { level_id: 8, 基础攻击: 2000, 基础防御: 2000, 基础血量: 2000 },
    { level_id: 15, 基础攻击: 11000, 基础防御: 11000, 基础血量: 11000 },
  ];

  // 旧档未记录 xiangu_shenhuo 默认按 1.0 倍计算
  assert.equal(getXianguShenhuoAttributeMultiplier({ xiangulevel_id: 8 }), 1.0);
  assert.deepEqual(scaleXianguBaseStats({ xiangulevel_id: 8 }, levels), {
    基础攻击: 2000,
    基础防御: 2000,
    基础血量: 2000,
  });

  // 下品神火（×0.3）：1000 + (2000 - 1000) * 0.3 = 1300
  const lowFlamePlayer = {
    xiangulevel_id: 8,
    xiangu_shenhuo: { 已点燃: true, 神火品质: '下品', 属性倍率: 0.3 },
  };
  assert.deepEqual(scaleXianguBaseStats(lowFlamePlayer, levels), {
    基础攻击: 1300,
    基础防御: 1300,
    基础血量: 1300,
  });

  // 唯一真火（×2.0）：1000 + (2000 - 1000) * 2.0 = 3000
  const uniqueFlamePlayer = {
    xiangulevel_id: 8,
    xiangu_shenhuo: { 已点燃: true, 神火品质: '唯一', 属性倍率: 2.0 },
  };
  assert.deepEqual(scaleXianguBaseStats(uniqueFlamePlayer, levels), {
    基础攻击: 3000,
    基础防御: 3000,
    基础血量: 3000,
  });

  // 至尊境外道隐患折损 0.88 倍
  const flawZhizun = {
    xiangulevel_id: 15,
    xiangu_shenhuo: { 已点燃: true, 神火品质: '上品', 属性倍率: 1.0 },
    xiangu_zhizun_external_dao_flaw: true,
  };
  assert.deepEqual(scaleXianguBaseStats(flawZhizun, levels), {
    基础攻击: 9680,
    基础防御: 9680,
    基础血量: 9680,
  });
});

test('道火精粹液可将下品神火逐阶提纯至唯一真火并补生第一道仙气', () => {
  const player = {
    xiangulevel_id: 8,
    xiangu_daohuo_jingcui: 7,
    xiangu_xianqi: 0,
    xiangu_shenhuo: {
      已点燃: true,
      神火品质: '下品',
      属性倍率: getFlameQualityRate('下品'),
    },
  };

  const r1 = applyShenhuoRefinement(player);
  assert.equal(r1.ok, true);
  assert.equal(player.xiangu_shenhuo.神火品质, '中品');
  assert.equal(player.xiangu_shenhuo.属性倍率, 0.5);
  assert.equal(player.xiangu_xianqi, 0);

  const r2 = applyShenhuoRefinement(player);
  assert.equal(r2.ok, true);
  assert.equal(player.xiangu_shenhuo.神火品质, '上品');
  assert.equal(player.xiangu_shenhuo.属性倍率, 1.0);

  const r3 = applyShenhuoRefinement(player);
  assert.equal(r3.ok, true);
  assert.equal(player.xiangu_shenhuo.神火品质, '极品');
  assert.equal(player.xiangu_shenhuo.属性倍率, 1.5);
  assert.equal(r3.grantedFirstStrand, true);
  assert.equal(player.xiangu_xianqi, 1);

  const r4 = applyShenhuoRefinement(player);
  assert.equal(r4.ok, true);
  assert.equal(player.xiangu_shenhuo.神火品质, '唯一');
  assert.equal(player.xiangu_shenhuo.属性倍率, 2.0);
  assert.equal(player.xiangu_daohuo_jingcui, 0);

  assert.equal(getNextShenhuoRefinement(player).reason, 'max');
});

test('圣院弟子或修成以身为种者可消耗仙道潜力涅槃重塑至尊道基消除外道隐患', () => {
  const player = {
    xiangulevel_id: 15,
    xiangu_zhizun_external_dao_flaw: true,
    仙道潜力: 18,
  };
  assert.equal(canResolveZhizunExternalDaoFlaw(player).reason, 'qualification');

  player.仙古院籍 = { 学院: '天神书院', 分院: '圣院' };
  const resolved = applyResolveZhizunExternalDaoFlaw(player);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.potentialCost, 15);
  assert.equal(player.仙道潜力, 3);
  assert.equal(player.xiangu_zhizun_external_dao_flaw, false);
  assert.equal(player.xiangu_yishenweizhong, true);
});

test('今世法五大极境与雷灵战斗词条正常触发并支持仙院/圣院流派放大', () => {
  const attacker = {
    名号: '荒',
    xiangulevel_id: 13,
    攻击: 10000,
    防御: 5000,
    当前血量: 8000,
    血量上限: 10000,
    五行神通: '庚金剑气',
    xiangu_nifa_zhanwo: true,
    xiangu_zhanxian_zhadao: true,
    xiangu_leiling: 3,
    仙古院籍: { 学院: '天神书院', 分院: '圣院' },
  };
  const defender = {
    名号: '帝冲',
    xiangulevel_id: 14,
    攻击: 12000,
    防御: 6000,
    当前血量: 50000,
    血量上限: 50000,
    五行抗性: '圆满',
    xiangu_xianqi: 3,
    仙古院籍: { 学院: '天神书院', 分院: '仙院' },
  };

  const msg = [];
  const combatRes = handleXianguCombatEffects(attacker, defender, msg, () => 0.01);
  assert.equal(combatRes.triggered, true);
  assert.ok(combatRes.bonusDamage > 0);
  assert.ok(combatRes.healed > 0);
  assert.match(msg.join('\n'), /【极境·庚金剑气】/);
  assert.match(msg.join('\n'), /【极境·逆伐斩我】/);
  assert.match(msg.join('\n'), /【极境·斩仙铡刀】/);
  assert.match(msg.join('\n'), /【至宝·雷灵协战】/);

  const defMsg = [];
  const mitigated = resolveXianguDefensiveMitigation(defender, 10000, defMsg);
  assert.ok(mitigated < 10000);
  assert.equal(getXianqiShieldReductionRate(defender), 0.138);
  assert.match(defMsg.join('\n'), /【极境·五行不灭】/);
  assert.match(defMsg.join('\n'), /【仙气·万法不侵】/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clampXianqiStrands,
  ensureXianqiState,
  getNextXianqiTrial,
  getXianqiStrands,
  getXianqiSuppressMultiplier,
  grantXianqi,
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

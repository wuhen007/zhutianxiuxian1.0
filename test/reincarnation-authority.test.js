import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  applyReincarnationDecision,
  getReincarnationAuthority,
  requiresControllerDecision,
  resolveReincarnationThresholds,
} from '../apps/SecretPlace/reincarnationAuthority.js';

const mijingLevels = JSON.parse(
  fs.readFileSync('resources/data/Level/秘境体系.json', 'utf8')
);
const xianguLevels = JSON.parse(
  fs.readFileSync('resources/data/Level/仙古今世法.json', 'utf8')
);
const huafenLevels = JSON.parse(
  fs.readFileSync('resources/data/Level/花粉进化路体系.json', 'utf8')
);

test('轮回权限门槛直接对应三条额外体系境界配置', () => {
  const thresholds = resolveReincarnationThresholds(mijingLevels, xianguLevels, huafenLevels);

  assert.equal(thresholds.rescue.mijingLevelId, 11);
  assert.equal(thresholds.rescue.xianguLevelId, 9);
  assert.equal(thresholds.rescue.huafenLevelId, 10);
  assert.equal(thresholds.control.mijingLevelId, 16);
  assert.equal(thresholds.control.xianguLevelId, 15);
  assert.equal(thresholds.control.huafenLevelId, 15);
});

test('斩道王者、真一境或花粉圣者可以救人但尚不能执掌轮回', () => {
  const zhandao = getReincarnationAuthority(
    { mijinglevel_id: 11, xiangulevel_id: 1 },
    mijingLevels,
    xianguLevels,
    huafenLevels
  );
  const zhenyi = getReincarnationAuthority(
    { mijinglevel_id: 1, xiangulevel_id: 9 },
    mijingLevels,
    xianguLevels,
    huafenLevels
  );
  const flowerSaint = getReincarnationAuthority(
    { mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 10 },
    mijingLevels,
    xianguLevels,
    huafenLevels
  );

  assert.equal(zhandao.canRescue, true);
  assert.equal(zhandao.canControl, false);
  assert.equal(zhenyi.canRescue, true);
  assert.equal(zhenyi.canControl, false);
  assert.equal(flowerSaint.canRescue, true);
  assert.equal(flowerSaint.canControl, false);
  assert.equal(
    getReincarnationAuthority(
      { huafenlevel_id: 9 },
      mijingLevels,
      xianguLevels,
      huafenLevels
    ).canRescue,
    false
  );
});

test('大帝、仙古至尊境或花粉天尊可以执掌轮回', () => {
  const emperor = getReincarnationAuthority(
    { mijinglevel_id: 16, xiangulevel_id: 1 },
    mijingLevels,
    xianguLevels,
    huafenLevels
  );
  const supreme = getReincarnationAuthority(
    { mijinglevel_id: 1, xiangulevel_id: 15 },
    mijingLevels,
    xianguLevels,
    huafenLevels
  );
  const flowerHeavenlyVenerable = getReincarnationAuthority(
    { mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 15 },
    mijingLevels,
    xianguLevels,
    huafenLevels
  );

  assert.equal(emperor.canControl, true);
  assert.equal(supreme.canControl, true);
  assert.equal(flowerHeavenlyVenerable.canControl, true);
  assert.equal(
    getReincarnationAuthority(
      { huafenlevel_id: 14 },
      mijingLevels,
      xianguLevels,
      huafenLevels
    ).canControl,
    false
  );
});

test('存在执掌者时任务等待裁定，准许后立即进入轮回', () => {
  const task = { player_id: '10001', end_time: 999999, status: '轮回中' };
  const controller = { player_id: '20002', player_name: '无始大帝' };

  assert.equal(requiresControllerDecision(task, controller), true);

  const allowed = applyReincarnationDecision(task, 'allow', controller, 123456);
  assert.equal(allowed.end_time, 123456);
  assert.equal(allowed.rebirth_decision.status, 'allow');
  assert.equal(requiresControllerDecision(allowed, controller), false);
});

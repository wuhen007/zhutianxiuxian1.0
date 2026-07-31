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

test('轮回权限门槛直接对应两份境界配置', () => {
  const thresholds = resolveReincarnationThresholds(mijingLevels, xianguLevels);

  assert.equal(thresholds.rescue.mijingLevelId, 11);
  assert.equal(thresholds.rescue.xianguLevelId, 9);
  assert.equal(thresholds.control.mijingLevelId, 16);
  assert.equal(thresholds.control.xianguLevelId, 15);
});

test('斩道王者或真一境可以救人但尚不能执掌轮回', () => {
  const zhandao = getReincarnationAuthority(
    { mijinglevel_id: 11, xiangulevel_id: 1 },
    mijingLevels,
    xianguLevels
  );
  const zhenyi = getReincarnationAuthority(
    { mijinglevel_id: 1, xiangulevel_id: 9 },
    mijingLevels,
    xianguLevels
  );

  assert.equal(zhandao.canRescue, true);
  assert.equal(zhandao.canControl, false);
  assert.equal(zhenyi.canRescue, true);
  assert.equal(zhenyi.canControl, false);
});

test('大帝或仙古至尊境可以执掌轮回', () => {
  const emperor = getReincarnationAuthority(
    { mijinglevel_id: 16, xiangulevel_id: 1 },
    mijingLevels,
    xianguLevels
  );
  const supreme = getReincarnationAuthority(
    { mijinglevel_id: 1, xiangulevel_id: 15 },
    mijingLevels,
    xianguLevels
  );

  assert.equal(emperor.canControl, true);
  assert.equal(supreme.canControl, true);
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

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REINCARNATION_APTITUDE_FLOOR,
  normalizeReincarnationAptitude,
  resolveReincarnationAptitudeLoss,
} from '../model/reincarnationAptitude.js';

test('轮回天资最低只降到生而愚痴', () => {
  assert.deepEqual(resolveReincarnationAptitudeLoss('天弃之人'), {
    current: '天弃之人',
    next: REINCARNATION_APTITUDE_FLOOR,
    extinguished: false,
  });
});

test('生而愚痴继续遭受轮回磨损时真灵消散', () => {
  assert.deepEqual(resolveReincarnationAptitudeLoss(REINCARNATION_APTITUDE_FLOOR), {
    current: REINCARNATION_APTITUDE_FLOOR,
    next: null,
    extinguished: true,
  });
});

test('旧存档的生而痴傻按生而愚痴处理', () => {
  assert.equal(normalizeReincarnationAptitude('生而痴傻'), REINCARNATION_APTITUDE_FLOOR);
  assert.equal(resolveReincarnationAptitudeLoss('生而痴傻').extinguished, true);
});

test('开局特殊天资无化如是不能通过轮回继续降档', () => {
  assert.deepEqual(resolveReincarnationAptitudeLoss('无化如是'), {
    current: '无化如是',
    next: null,
    extinguished: true,
  });
});

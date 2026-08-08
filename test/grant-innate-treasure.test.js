import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInnateTreasureGrant,
  claimInnateTreasure,
  releaseInnateTreasure,
} from '../model/innateTreasure.js';

const TREASURE = '盘古幡';
const OWNER_A = '1000000001';
const OWNER_B = '1000000002';

test('未知先天至宝名返回 unknown，不会误发', () => {
  const grant = buildInnateTreasureGrant('并不存在的至宝', OWNER_A);
  assert.equal(grant.ok, false);
  assert.equal(grant.reason, 'unknown');
  assert.equal(grant.treasure, undefined);
});

test('未认主时正常返回至宝本体且绑定到目标玩家', () => {
  const grant = buildInnateTreasureGrant(TREASURE, OWNER_A);
  assert.equal(grant.ok, true);
  assert.equal(grant.name, TREASURE);
  assert.equal(grant.ownerId, OWNER_A);
  assert.equal(grant.treasure.name, TREASURE);
  assert.equal(grant.treasure.绑定者, OWNER_A);
  assert.equal(grant.treasure.品阶, '先天至宝');
  assert.equal(grant.treasure.type, '至宝');
});

test('已被他人认主且未强制时拒绝发放，并回报原归属者', () => {
  claimInnateTreasure(TREASURE, OWNER_A);
  try {
    const grant = buildInnateTreasureGrant(TREASURE, OWNER_B);
    assert.equal(grant.ok, false);
    assert.equal(grant.reason, 'owned');
    assert.equal(grant.ownerId, OWNER_A);
  } finally {
    releaseInnateTreasure(TREASURE, OWNER_A);
  }
});

test('已被他人认主但附加 force 时允许覆盖发放', () => {
  claimInnateTreasure(TREASURE, OWNER_A);
  try {
    const grant = buildInnateTreasureGrant(TREASURE, OWNER_B, { force: true });
    assert.equal(grant.ok, true);
    assert.equal(grant.ownerId, OWNER_B);
    assert.equal(grant.treasure.绑定者, OWNER_B);
  } finally {
    releaseInnateTreasure(TREASURE, OWNER_B);
  }
});

test('自己已认主时重复发放幂等通过', () => {
  claimInnateTreasure(TREASURE, OWNER_A);
  try {
    const grant = buildInnateTreasureGrant(TREASURE, OWNER_A);
    assert.equal(grant.ok, true);
    assert.equal(grant.ownerId, OWNER_A);
  } finally {
    releaseInnateTreasure(TREASURE, OWNER_A);
  }
});

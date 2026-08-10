import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRealmAuthorityLevel,
  getRealmAuthorityName,
  hasRealmAuthority,
  lowerRealmAuthority,
} from '../model/realmAuthority.js';

test('xiangu high realms match mijing authority tiers', () => {
  const pairs = [
    [8, 10],
    [9, 11],
    [10, 11],
    [11, 12],
    [12, 13],
    [13, 14],
    [14, 15],
    [15, 16],
    [16, 17],
    [17, 18],
    [19, 19],
    [21, 20],
    [22, 21],
    [23, 22],
    [24, 23],
    [25, 24],
  ];

  for (const [xiangu, expected] of pairs) {
    assert.equal(getRealmAuthorityLevel({ mijinglevel_id: 1, xiangulevel_id: xiangu }), expected);
  }
});

test('either cultivation path can satisfy an authority requirement', () => {
  assert.equal(hasRealmAuthority({ mijinglevel_id: 21, xiangulevel_id: 1 }, 21), true);
  assert.equal(hasRealmAuthority({ mijinglevel_id: 1, xiangulevel_id: 22 }, 21), true);
  assert.equal(hasRealmAuthority({ mijinglevel_id: 20, xiangulevel_id: 21 }, 21), false);
});

test('the stronger path determines the effective authority', () => {
  assert.equal(getRealmAuthorityLevel({ mijinglevel_id: 22, xiangulevel_id: 24 }), 23);
  assert.equal(getRealmAuthorityLevel({ mijinglevel_id: 24, xiangulevel_id: 22 }), 24);
});

test('realm loss applies to the path providing the authority', () => {
  const xianguPlayer = { mijinglevel_id: 1, xiangulevel_id: 22 };
  assert.equal(lowerRealmAuthority(xianguPlayer), 'xiangu');
  assert.deepEqual(xianguPlayer, { mijinglevel_id: 1, xiangulevel_id: 21 });

  const mijingPlayer = { mijinglevel_id: 21, xiangulevel_id: 1 };
  assert.equal(lowerRealmAuthority(mijingPlayer), 'mijing');
  assert.deepEqual(mijingPlayer, { mijinglevel_id: 20, xiangulevel_id: 1 });
});

test('authority realm names follow the active path', () => {
  const mijingLevels = [{ level_id: 21, level: 'mijing emperor' }];
  const xianguLevels = [{ level_id: 22, level: 'xiangu emperor' }];

  assert.equal(
    getRealmAuthorityName(
      { mijinglevel_id: 1, xiangulevel_id: 22 },
      mijingLevels,
      xianguLevels
    ),
    'xiangu emperor'
  );
});

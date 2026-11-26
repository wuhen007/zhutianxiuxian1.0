import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFlowerPollenAuthorityLevel,
  getRealmAuthorityLevel,
  getRealmAuthorityName,
  getRealmAuthorityPath,
  getTianjiaoRealmTier,
  getGodDemonStealRule,
  getYuanshenAdvancement,
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
  assert.equal(hasRealmAuthority({ huafenlevel_id: 22 }, 21), true);
});

test('the stronger path determines the effective authority', () => {
  assert.equal(getRealmAuthorityLevel({ mijinglevel_id: 22, xiangulevel_id: 24 }), 23);
  assert.equal(getRealmAuthorityLevel({ mijinglevel_id: 24, xiangulevel_id: 22 }), 24);
});

test('显式选择的额外体系优先于伴生体系和其他残留境界', () => {
  assert.equal(getRealmAuthorityPath({
    额外体系: 'xiangu',
    mijinglevel_id: 21,
    xiangulevel_id: 12,
    huafenlevel_id: 25,
  }), 'xiangu');
  assert.equal(getRealmAuthorityPath({
    额外体系: 'huafen',
    mijinglevel_id: 24,
    xiangulevel_id: 25,
    huafenlevel_id: 12,
  }), 'huafen');
});

test('realm loss applies to the path providing the authority', () => {
  const xianguPlayer = { mijinglevel_id: 1, xiangulevel_id: 22 };
  assert.equal(lowerRealmAuthority(xianguPlayer), 'xiangu');
  assert.deepEqual(xianguPlayer, { mijinglevel_id: 1, xiangulevel_id: 21, 曾达路尽级仙帝: true });

  const mijingPlayer = { mijinglevel_id: 21, xiangulevel_id: 1 };
  assert.equal(lowerRealmAuthority(mijingPlayer), 'mijing');
  assert.deepEqual(mijingPlayer, { mijinglevel_id: 20, xiangulevel_id: 1, 曾达路尽级仙帝: true });

  const huafenPlayer = { mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 22 };
  assert.equal(lowerRealmAuthority(huafenPlayer), 'huafen');
  assert.deepEqual(huafenPlayer, { mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 21, 曾达路尽级仙帝: true });
});

test('元神凝练按境界表前进并在最高阶停止', () => {
  const levels = [
    { level_id: 13, level: '祭道级元神' },
    { level_id: 14, level: '祭道之上级元神' },
    { level_id: 15, level: '唯一道之上级元神' },
  ];
  assert.deepEqual(getYuanshenAdvancement(levels, 14), {
    next: levels[2],
    atMax: false,
    requiredAuthority: 24,
  });
  assert.equal(getYuanshenAdvancement(levels, 15).atMax, true);
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

  const huafenLevels = [{ level_id: 17, level: 'flower ultimate' }];
  assert.equal(
    getRealmAuthorityName(
      { mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 17 },
      mijingLevels,
      xianguLevels,
      huafenLevels
    ),
    'flower ultimate'
  );
});

test('flower pollen realms map to matching authority tiers', () => {
  const pairs = [
    [1, 1], [2, 2], [3, 3], [4, 6], [5, 7], [6, 8], [7, 9],
    [8, 10], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14],
    [14, 15], [15, 16], [16, 16], [17, 17], [18, 18], [19, 18],
    [20, 19], [21, 20], [22, 21], [23, 22], [24, 23], [25, 24],
  ];
  for (const [huafen, expected] of pairs) {
    assert.equal(getFlowerPollenAuthorityLevel(huafen), expected);
    assert.equal(getRealmAuthorityLevel({ huafenlevel_id: huafen }), expected);
  }
});

test('tianjiao challenge matches all three cultivation paths', () => {
  assert.equal(getTianjiaoRealmTier({ mijinglevel_id: 8 }), 'below');
  assert.equal(getTianjiaoRealmTier({ mijinglevel_id: 9 }), 'matched');
  assert.equal(getTianjiaoRealmTier({ mijinglevel_id: 12 }), 'full');

  assert.equal(getTianjiaoRealmTier({ xiangulevel_id: 6 }), 'below');
  assert.equal(getTianjiaoRealmTier({ xiangulevel_id: 7 }), 'matched');
  assert.equal(getTianjiaoRealmTier({ xiangulevel_id: 10 }), 'full');

  assert.equal(getTianjiaoRealmTier({ huafenlevel_id: 6 }), 'below');
  assert.equal(getTianjiaoRealmTier({ huafenlevel_id: 7 }), 'matched');
  assert.equal(getTianjiaoRealmTier({ huafenlevel_id: 10 }), 'matched');
  assert.equal(getTianjiaoRealmTier({ huafenlevel_id: 11 }), 'full');
});

test('终焉神魔体按九秘领域和帝境等级限制夺取', () => {
  const saintKing = { mijinglevel_id: 13, 皆字秘触发: true, _临字秘加成倍率: 9 };
  const emperor = { mijinglevel_id: 16 };
  assert.equal(getGodDemonStealRule(saintKing, emperor).allowed, false);

  const quasiEmperor = { mijinglevel_id: 15, 皆字秘触发: true, _临字秘加成倍率: 9 };
  const exception = getGodDemonStealRule(quasiEmperor, emperor);
  assert.equal(exception.allowed, true);
  assert.equal(exception.chance, 0.2);
  assert.equal(exception.ratioMultiplier, 0.25);

  assert.equal(
    getGodDemonStealRule(
      { mijinglevel_id: 12, 皆字秘触发: true },
      { mijinglevel_id: 13 }
    ).allowed,
    true
  );
  assert.equal(
    getGodDemonStealRule(
      { mijinglevel_id: 12, _临字秘加成倍率: 9 },
      { mijinglevel_id: 14 }
    ).allowed,
    true
  );
  assert.equal(
    getGodDemonStealRule(
      { mijinglevel_id: 12, 皆字秘触发: true, _临字秘加成倍率: 9 },
      { mijinglevel_id: 15 }
    ).allowed,
    true
  );
  assert.equal(
    getGodDemonStealRule({ mijinglevel_id: 12 }, { mijinglevel_id: 13 }).allowed,
    false
  );
});

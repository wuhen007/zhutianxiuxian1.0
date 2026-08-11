import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HUOYU_FOUR_POLE_PITY,
  ZHETIAN_INHERITANCE_TARGET,
  advanceHuoyuFourPole,
  advanceZhetianInheritance,
  getZhetianInheritanceEntryBlock,
  resolveZhetianDungeonVictory,
} from '../model/zhetianInheritance.js';

function saint(gongfa = []) {
  return { mijinglevel_id: 12, 学习的功法: [...gongfa] };
}

function day(number) {
  return new Date(2026, 0, number, 12).getTime();
}

test('祖地入口要求圣人境，姜家额外要求四极卷', () => {
  assert.match(
    getZhetianInheritanceEntryBlock({ mijinglevel_id: 11 }, '姬家祖地'),
    /圣人/
  );
  assert.match(getZhetianInheritanceEntryBlock(saint(), '姜家祖地'), /四极卷/);
  assert.equal(
    getZhetianInheritanceEntryBlock(saint(['恒宇经·四极卷']), '姜家祖地'),
    null
  );
  assert.equal(getZhetianInheritanceEntryBlock(saint(), '火域'), null);
});

test('姬家传承每日只计一次，第五日授予虚空经', () => {
  const player = saint();

  const first = advanceZhetianInheritance(player, {
    dungeon: '姬家祖地',
    now: day(1),
  });
  const duplicate = advanceZhetianInheritance(player, {
    dungeon: '姬家祖地',
    now: day(1),
  });
  assert.equal(first.progress, 1);
  assert.equal(duplicate.reason, 'daily-limit');
  assert.equal(player.遮天帝经传承.虚空经.progress, 1);

  for (let current = 2; current <= ZHETIAN_INHERITANCE_TARGET; current += 1) {
    advanceZhetianInheritance(player, {
      dungeon: '姬家祖地',
      now: day(current),
    });
  }

  assert.ok(player.学习的功法.includes('虚空经'));
  assert.equal(player.遮天帝经传承.虚空经.completed, true);
});

test('姜家传承有四极卷前置，第五日授予恒宇经', () => {
  const player = saint();
  const blocked = advanceZhetianInheritance(player, {
    dungeon: '姜家祖地',
    now: day(1),
  });
  assert.equal(blocked.reason, 'blocked');

  player.学习的功法.push('恒宇经·四极卷');
  let result;
  for (let current = 1; current <= ZHETIAN_INHERITANCE_TARGET; current += 1) {
    result = advanceZhetianInheritance(player, {
      dungeon: '姜家祖地',
      now: day(current),
    });
  }

  assert.equal(result.learned, '恒宇经');
  assert.ok(player.学习的功法.includes('恒宇经'));
});

test('火域四极卷改为个人概率并在第十次保底', () => {
  const player = saint();
  for (let attempt = 1; attempt < HUOYU_FOUR_POLE_PITY; attempt += 1) {
    const result = advanceHuoyuFourPole(player, {
      dungeon: '火域',
      hasCrystal: true,
      random: () => 0.99,
    });
    assert.equal(result.learned, undefined);
    assert.equal(result.attempts, attempt);
  }

  const guaranteed = advanceHuoyuFourPole(player, {
    dungeon: '火域',
    hasCrystal: true,
    random: () => 0.99,
  });
  assert.equal(guaranteed.learned, '恒宇经·四极卷');
  assert.equal(guaranteed.consumeCrystal, true);
  assert.ok(player.学习的功法.includes('恒宇经·四极卷'));
});

test('无火晶不累计，统一结算只处理相关副本', () => {
  const player = saint();
  const missing = advanceHuoyuFourPole(player, {
    dungeon: '火域',
    hasCrystal: false,
  });
  assert.equal(missing.reason, 'missing-crystal');
  assert.equal(player.遮天帝经传承, undefined);

  assert.deepEqual(resolveZhetianDungeonVictory(player, { dungeon: '灵墟洞天' }), {
    changed: false,
    consumeCrystal: false,
    learned: [],
    message: '',
  });
});


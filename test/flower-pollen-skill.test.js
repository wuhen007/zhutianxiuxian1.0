import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLOWER_POLLEN_SKILLS,
  getFlowerPollenSkill,
  getLearnedFlowerPollenSkills,
  getSevenTreasureProgress,
  handleFlowerPollenSkills,
  rollFlowerPollenSkill,
} from '../model/flowerPollenSkill.js';
import { getShengxuDungeon } from '../model/shengxuContent.js';

test('skill tree covers 11 skills including the seven treasures', () => {
  assert.equal(FLOWER_POLLEN_SKILLS.length, 11);
  assert.ok(getFlowerPollenSkill('大力牛魔拳'));
  assert.ok(getFlowerPollenSkill('闪电拳'));
  assert.ok(getFlowerPollenSkill('大日如来拳'));
  assert.ok(getFlowerPollenSkill('时光术'));
  assert.equal(FLOWER_POLLEN_SKILLS.filter(s => s.name.startsWith('七妙宝术')).length, 7);
});

test('learned skills are matched from 学习的功法', () => {
  const player = { 学习的功法: ['基础呼吸法', '大力牛魔拳', '七妙宝术·土'] };
  const learned = getLearnedFlowerPollenSkills(player);
  assert.deepEqual(learned.map(s => s.name), ['大力牛魔拳', '七妙宝术·土']);
  assert.equal(getSevenTreasureProgress(player), 1);
  assert.equal(getLearnedFlowerPollenSkills({}).length, 0);
});

test('dungeon skill drop rolls from its pool', () => {
  const taishan = getShengxuDungeon('太行山');
  assert.deepEqual(taishan.skills, [{ name: '大力牛魔拳', chance: 0.15 }]);
  assert.equal(rollFlowerPollenSkill(taishan, () => 0), '大力牛魔拳'); // 必中
  assert.equal(rollFlowerPollenSkill(taishan, () => 1), ''); // 必不中
  const hunhe = getShengxuDungeon('魂河古地');
  assert.deepEqual(hunhe.skills.map(s => s.name), ['七妙宝术·阴', '七妙宝术·阳', '时光术']);
  assert.equal(rollFlowerPollenSkill({}, () => 0), ''); // 无技能池
});

test('battle skill deals damage on trigger', () => {
  const attacker = { 名号: '楚风', 攻击: 1000, 当前血量: 5000, 血量上限: 5000, 学习的功法: ['大力牛魔拳'] };
  const defender = { 名号: '星路猎杀者', 当前血量: 8000 };
  const msg = [];
  const triggered = handleFlowerPollenSkills(attacker, defender, msg, () => 0);
  assert.equal(triggered, true);
  assert.ok(defender.当前血量 < 8000);
  assert.ok(msg.some(line => line.includes('大力牛魔拳')));
});

test('heal-type skill restores attacker health', () => {
  const attacker = { 名号: '楚风', 攻击: 1000, 当前血量: 1000, 血量上限: 5000, 学习的功法: ['七妙宝术·土'] };
  const defender = { 名号: '敌', 当前血量: 9999 };
  const msg = [];
  const triggered = handleFlowerPollenSkills(attacker, defender, msg, () => 0);
  assert.equal(triggered, true);
  assert.ok(attacker.当前血量 > 1000);
  assert.ok(msg.some(line => line.includes('恢复')));
});

test('seven treasure synergy amplifies damage', () => {
  // 集齐 3 宝：伤害加成 1 + 3*0.15 = 1.45；金宝 2.0× 触发（攻击类宝术居首）
  const attacker = {
    名号: '楚风', 攻击: 1000, 当前血量: 5000, 血量上限: 5000,
    学习的功法: ['七妙宝术·金', '七妙宝术·火', '七妙宝术·水'],
  };
  const defender = { 名号: '敌', 当前血量: 100000 };
  const msg = [];
  handleFlowerPollenSkills(attacker, defender, msg, () => 0);
  const expected = Math.floor(1000 * 2.0 * 1.45); // 金宝 2.0× × 1.45
  const dealt = 100000 - defender.当前血量;
  assert.equal(dealt, expected);
  assert.ok(msg.some(line => line.includes('七妙加成')));
});

test('no trigger when random misses', () => {
  const attacker = { 名号: '楚风', 攻击: 1000, 当前血量: 5000, 血量上限: 5000, 学习的功法: ['大力牛魔拳'] };
  const defender = { 名号: '敌', 当前血量: 8000 };
  const msg = [];
  const triggered = handleFlowerPollenSkills(attacker, defender, msg, () => 1);
  assert.equal(triggered, false);
  assert.equal(defender.当前血量, 8000);
});

test('dungeons reference only existing skills', () => {
  const names = new Set(FLOWER_POLLEN_SKILLS.map(s => s.name));
  for (const dungeon of [getShengxuDungeon('太行山'), getShengxuDungeon('小阴间星路'), getShengxuDungeon('阳间名山'), getShengxuDungeon('魂河古地')]) {
    for (const entry of dungeon.skills || []) {
      assert.ok(names.has(entry.name), `${dungeon.name} 引用未知技能 ${entry.name}`);
    }
  }
});

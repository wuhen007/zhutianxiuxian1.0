import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  EXCLUSIVE_EQUIPMENT_SETS,
  ZHUTIAN_EQUIPMENT_STAGE_BONUSES,
  ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS,
  applyExclusiveSetOpening,
  getZhutianExclusiveEquipmentBonus,
  getZhutianWorldCompletion,
  rewriteBeyondDefeat,
} from '../model/exclusiveEquipmentSets.js';
import { calculateEquipmentSetBonuses } from '../model/equipmentStats.js';

function equipment(set) {
  return {
    武器: { name: set.weapon },
    护具: { name: set.armor },
    法宝: { name: set.treasure },
  };
}

test('三套九件专属装备已登记到特殊装备目录', () => {
  const items = JSON.parse(fs.readFileSync(
    new URL('../resources/data/item/特殊装备列表.json', import.meta.url),
    'utf8'
  ));
  const names = new Set(items.map(item => item.name));
  for (const set of Object.values(EXCLUSIVE_EQUIPMENT_SETS)) {
    assert.equal(names.has(set.weapon), true);
    assert.equal(names.has(set.armor), true);
    assert.equal(names.has(set.treasure), true);
  }
});

test('七类诸天化身的二十一件专属装备已登记且不可交易', () => {
  const items = JSON.parse(fs.readFileSync(
    new URL('../resources/data/item/特殊装备列表.json', import.meta.url),
    'utf8'
  ));
  assert.deepEqual(Object.keys(ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS), [
    '木之本樱', '鹿目圆', '门矢士', '少女流萤', '伊蕾娜', '爱莉希雅', '天命青儿',
  ]);
  const byId = new Map(items.map(item => [item.id, item]));
  const pieces = Object.values(ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS)
    .flatMap(set => [set.weapon, set.armor, set.treasure]);
  assert.equal(pieces.length, 21);
  for (const piece of pieces) {
    assert.equal(byId.get(piece.id)?.name, piece.name);
    assert.equal(byId.get(piece.id)?.不可交易, 1);
  }
});

test('诸天专属套装按对应灵根阶段同步增长全属性', () => {
  assert.deepEqual(ZHUTIAN_EQUIPMENT_STAGE_BONUSES, [0, 2.5, 5, 8, 15]);
  for (const [avatarName, set] of Object.entries(ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS)) {
    const equipped = {
      武器: { ...set.weapon },
      护具: { ...set.armor },
      法宝: { ...set.treasure },
    };
    set.roots.forEach((rootName, index) => {
      const stage = index + 1;
      const expected = ZHUTIAN_EQUIPMENT_STAGE_BONUSES[stage];
      const player = {
        灵根: { name: rootName },
        诸天镜系统: { 世界进度: { [set.world]: { 探索度: 100 } } },
      };
      const result = getZhutianExclusiveEquipmentBonus(player, equipped);
      assert.deepEqual(result, {
        active: true,
        avatarName,
        setName: set.setName,
        stage,
        bonus: expected,
      });
      assert.deepEqual(calculateEquipmentSetBonuses(player, equipped), {
        攻: expected,
        防: expected,
        血: expected,
      });
    });
  }
});

test('诸天专属套装按所属世界完成度线性兑现阶段上限', () => {
  const set = ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS.门矢士;
  const player = {
    灵根: { name: '帝骑·终极神主' },
    诸天镜系统: { 世界进度: { [set.world]: { 探索度: 40 } } },
  };
  const equipped = {
    武器: { ...set.weapon },
    护具: { ...set.armor },
    法宝: { ...set.treasure },
  };
  assert.equal(getZhutianWorldCompletion(player, set.world), 40);
  assert.equal(getZhutianExclusiveEquipmentBonus(player, equipped).bonus, 6);
  assert.deepEqual(calculateEquipmentSetBonuses(player, equipped), { 攻: 6, 防: 6, 血: 6 });

  player.诸天镜系统.世界进度[set.world].探索度 = 100;
  const fullBonus = calculateEquipmentSetBonuses(player, equipped).攻;
  assert.equal(Math.trunc(6_250_000_000 * (1 + fullBonus)), 100_000_000_000);
});

test('诸天专属套装混穿、伪造编号或切换本源后不生效', () => {
  const set = ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS.木之本樱;
  const equipped = {
    武器: { ...set.weapon },
    护具: { ...set.armor },
    法宝: { ...set.treasure, id: 1 },
  };
  assert.equal(getZhutianExclusiveEquipmentBonus({ 灵根: { name: '梦之杖·木之本樱' } }, equipped).active, false);
  assert.equal(getZhutianExclusiveEquipmentBonus({ 灵根: { name: '普通灵根' } }, {
    武器: { ...set.weapon },
    护具: { ...set.armor },
    法宝: { ...set.treasure },
  }).active, false);
});

test('彼岸套开场获得专属命运权柄', () => {
  const set = EXCLUSIVE_EQUIPMENT_SETS.彼岸命运神道套;
  const player = {
    名号: '彼岸之主',
    灵根: { name: set.physique },
    全伤害类型加成: 0,
    全类型减免: 0,
  };
  const result = applyExclusiveSetOpening(player, equipment(set));
  assert.equal(result.setName, '彼岸命运神道套');
  assert.equal(player.全伤害类型加成, 0.35);
  assert.equal(player.全类型减免, 0.25);
  assert.equal(player.首次闪避, true);
  assert.equal(player._彼岸命运改写, true);
});

test('彼岸套每场只能改写一次败亡命运', () => {
  const player = {
    名号: '彼岸之主',
    当前血量: 0,
    血量上限: 1000,
    攻击: 100,
    速度: 100,
    _彼岸命运改写: true,
  };
  const first = rewriteBeyondDefeat(player);
  assert.equal(first.revived, true);
  assert.equal(player.当前血量, 500);
  assert.equal(player.攻击, 120);
  player.当前血量 = 0;
  assert.equal(rewriteBeyondDefeat(player).revived, false);
});

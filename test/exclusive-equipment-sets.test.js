import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  EXCLUSIVE_EQUIPMENT_SETS,
  applyExclusiveSetOpening,
  rewriteBeyondDefeat,
} from '../model/exclusiveEquipmentSets.js';

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

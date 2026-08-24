import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { normalizeSellableEquipmentQuality } from '../model/equipmentSale.js';

test('一键出售只把待售无品级装备归一为最低品级', () => {
  const najie = {
    装备: [
      { name: '无品级剑', islockd: 0 },
      { name: '已有品级剑', islockd: 0, pinji: 5 },
      { name: '锁定剑', islockd: 1 },
      { name: '本命帝兵', islockd: 0, type: '帝兵', author_name: '玩家' },
    ],
  };

  assert.equal(normalizeSellableEquipmentQuality(najie), true);
  assert.equal(najie.装备[0].pinji, 0);
  assert.equal(najie.装备[1].pinji, 5);
  assert.equal(najie.装备[2].pinji, undefined);
  assert.equal(najie.装备[3].pinji, undefined);
  assert.equal(normalizeSellableEquipmentQuality(najie), false);
});

test('指定出售和确认出售都会先写回最低品级', () => {
  const source = fs.readFileSync(new URL('../apps/User/UserSellAll.js', import.meta.url), 'utf8');
  assert.equal(source.match(/normalizeSellableEquipmentQuality\(najie\)/g)?.length, 2);
  assert.match(source, /l\.type === '帝兵' && l\.author_name\) continue/);
});

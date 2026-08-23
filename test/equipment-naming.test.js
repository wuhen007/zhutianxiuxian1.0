import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isEquipmentNameTooLong,
  parseEquipmentNamingCommand,
} from '../model/equipmentNaming.js';

test('神兵赋名解析并限制八个字符', () => {
  assert.deepEqual(parseEquipmentNamingCommand('#赋名旧剑*新剑', '赋名'), {
    originalName: '旧剑',
    newName: '新剑',
  });
  assert.deepEqual(parseEquipmentNamingCommand('#神兵重铸 旧剑 * 新剑 ', '神兵重铸'), {
    originalName: '旧剑',
    newName: '新剑',
  });
  assert.equal(parseEquipmentNamingCommand('#赋名旧剑', '赋名'), null);
  assert.equal(parseEquipmentNamingCommand('#赋名*新剑', '赋名'), null);
  assert.equal(parseEquipmentNamingCommand('#赋名旧剑*', '赋名'), null);
  assert.equal(isEquipmentNameTooLong('一二三四五六七八'), false);
  assert.equal(isEquipmentNameTooLong('一二三四五六七八九'), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveGongfaRevival } from '../model/tribulationRevival.js';

test('柳神法复活获得三层45%庇护与五道15%恢复', () => {
  const player = {
    名号: '测试修士',
    血量上限: 1000,
    当前血量: 0,
    生命本源: 100,
    学习的功法: ['柳神法'],
    功法: { 柳神法: { 冷却回合: 0 } },
  };
  const result = resolveGongfaRevival(player, { allowMingge: false });
  assert.equal(result.revived, true);
  assert.equal(player.当前血量, 600);
  assert.equal(player.柳神效果.庇护层数, 3);
  assert.equal(player.柳神效果.减伤比例, 0.45);
  assert.deepEqual(player.柳神效果.持续恢复, { 回合数: 5, 治疗量: 150 });
});

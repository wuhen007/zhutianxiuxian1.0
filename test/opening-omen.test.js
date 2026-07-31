import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyOpeningOmen,
  DEFAULT_OPENING_POTENTIAL,
  drawOpeningOmen,
  formatOpeningOmenMessage,
  MORTAL_OPENING_OMENS,
} from '../model/openingOmen.js';

test('凡界异象权重合计为100且不会加载封存母题', () => {
  assert.equal(MORTAL_OPENING_OMENS.reduce((sum, omen) => sum + omen.weight, 0), 100);
  assert.equal(MORTAL_OPENING_OMENS.some(omen => /苦海|轮回|高原|铜棺/.test(omen.name)), false);
});

test('普通灵根不会抽到灵体专属异象', () => {
  assert.equal(drawOpeningOmen({ type: '体质' }, () => 0.96).id, 'spirit_body_awakening');
  assert.notEqual(drawOpeningOmen({ type: '伪灵根' }, () => 0.96).id, 'spirit_body_awakening');
});

test('异象奖励写入玩家字段且只能结算一次', () => {
  const player = { 仙道潜力: DEFAULT_OPENING_POTENTIAL, 修为: 1, 血气: 1, 灵石: 10000 };
  const omen = MORTAL_OPENING_OMENS.at(-1);

  applyOpeningOmen(player, omen, 1000);
  applyOpeningOmen(player, omen, 2000);

  assert.equal(player.仙道潜力, 1000);
  assert.equal(player.修为, 1000001);
  assert.equal(player.血气, 1000001);
  assert.equal(player.灵石, 1010000);
  assert.deepEqual(player.开局异象, {
    id: omen.id,
    name: omen.name,
    tier: omen.tier,
    obtainedAt: 1000,
    奖励已结算: true,
  });
});

test('平凡开局会明确显示没有额外造化', () => {
  const message = formatOpeningOmenMessage(MORTAL_OPENING_OMENS[0], '路人甲1号');
  assert.match(message, /无。仙路不曾格外垂青于你/);
});

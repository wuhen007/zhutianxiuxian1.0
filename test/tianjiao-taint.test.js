import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMITATION_COPY_RATE,
  REIMBURSE_RATE,
  TAINT_PENALTY_RATE,
  applyEquipmentTaint,
  applyTaintPenalty,
  createImitation,
  createImitationItem,
  hasPercentageStats,
  isTainted,
  listPercentEquipSlots,
  listTaintedSlots,
  reimburseImitation,
  repairTaint,
} from '../model/tianjiaoTaint.js';

const PERCENT_WEAPON = {
  name: '太初镇世剑',
  归一属性: { 百分比: { atk: 0.2, def: 0.05 } },
};
const PLAIN_ARMOR = { name: '普通护甲', 归一属性: { 百分比: {} } };
const EQUIP = {
  武器: PERCENT_WEAPON,
  护具: PLAIN_ARMOR,
  法宝: { name: '紫极神炉', 归一属性: { 百分比: { HP: 0.15 } } },
};

test('百分比装备判定与槽位收集', () => {
  assert.equal(hasPercentageStats(PERCENT_WEAPON), true);
  assert.equal(hasPercentageStats(PLAIN_ARMOR), false);
  const slots = listPercentEquipSlots(EQUIP);
  assert.deepEqual(slots.map(s => s.slot), ['武器', '法宝']);
});

test('施加污损：仅限未污损的百分比装备', () => {
  const equip = { 武器: { ...PERCENT_WEAPON }, 护具: { ...PLAIN_ARMOR } };
  const result = applyEquipmentTaint(equip, '武器', '华云飞', 1000);
  assert.equal(result.ok, true);
  assert.deepEqual(equip.武器.污损, { 天骄: '华云飞', 时间: 1000 });
  assert.equal(isTainted(equip.武器), true);

  const again = applyEquipmentTaint(equip, '武器', '霸王浑战', 2000);
  assert.equal(again.ok, false, '已污损的装备不可再次污损');
  assert.equal(applyEquipmentTaint(equip, '护具', '华云飞').ok, false, '非百分比装备不可污损');
});

test('修复污损', () => {
  const equip = { 武器: { ...PERCENT_WEAPON, 污损: { 天骄: '华云飞', 时间: 1000 } } };
  assert.equal(repairTaint(equip, '武器'), true);
  assert.equal(isTainted(equip.武器), false);
  assert.equal(repairTaint(equip, '武器'), false, '无污损时返回 false');
});

test('战斗内污损结算：对应属性 -20%', () => {
  const equip = {
    武器: { ...PERCENT_WEAPON, 污损: { 天骄: '华云飞', 时间: 1000 } },
    法宝: { ...EQUIP.法宝, 污损: { 天骄: '华云飞', 时间: 1000 } },
    护具: { ...PLAIN_ARMOR },
  };
  const A_player = { 攻击: 1000, 防御: 800, 血量上限: 5000 };
  const penalties = applyTaintPenalty(A_player, equip);
  assert.equal(penalties.length, 2);
  assert.equal(A_player.攻击, Math.floor(1000 * (1 - TAINT_PENALTY_RATE)));
  assert.equal(A_player.血量上限, Math.floor(5000 * (1 - TAINT_PENALTY_RATE)));
  assert.equal(A_player.防御, 800, '未污损槽位不受影响');
  assert.ok(penalties.every(p => p.天骄 === '华云飞'));
});

test('参悟仿制：复制原装备 60% 词条并记录来源', () => {
  const imitation = createImitation('霸王浑战', '12345', '剑仙', '武器', PERCENT_WEAPON, 3000);
  assert.equal(imitation.仿制名, '仿·太初镇世剑');
  assert.equal(imitation.来源装备名, '太初镇世剑');
  assert.equal(imitation.槽位, '武器');
  assert.equal(imitation.来源QQ, '12345');
  assert.equal(imitation.天骄, '霸王浑战');
  assert.equal(imitation.词条.atk, Math.round(0.2 * IMITATION_COPY_RATE * 10000) / 10000);
  assert.equal(imitation.词条.def, Math.round(0.05 * IMITATION_COPY_RATE * 10000) / 10000);

  const item = createImitationItem(imitation, '999');
  assert.equal(item.name, '仿·太初镇世剑');
  assert.equal(item.品阶, '参悟仿制');
  assert.equal(item.参悟仿制, imitation);
});

test('反哺炼化：仿制品 50% 词条加成回本体，名称须匹配', () => {
  const orig = { name: '太初镇世剑', 归一属性: { 百分比: { atk: 0.2 } } };
  const imitation = createImitation('霸王浑战', '12345', '剑仙', '武器', PERCENT_WEAPON, 3000);
  const imitationItem = createImitationItem(imitation, '999');

  const result = reimburseImitation(orig, imitationItem);
  assert.equal(result.ok, true);
  const expected = Math.round((0.2 + Math.round(0.2 * IMITATION_COPY_RATE * 10000) / 10000 * REIMBURSE_RATE) * 10000) / 10000;
  assert.equal(orig.归一属性.百分比.atk, expected, '原词条应加上仿制品词条×50%');

  const mismatch = reimburseImitation({ name: '别的装备', 归一属性: { 百分比: {} } }, imitationItem);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'name_mismatch');

  const empty = reimburseImitation({ name: '太初镇世剑', 归一属性: { 百分比: {} } }, { 参悟仿制: { 来源装备名: '太初镇世剑', 词条: {} } });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'nothing_gained');
});

test('被污损装备不会被选为参悟目标（保守策略）', () => {
  const equip = {
    武器: { ...PERCENT_WEAPON, 污损: { 天骄: '华云飞', 时间: 1000 } },
    法宝: EQUIP.法宝,
  };
  const tainted = listTaintedSlots(equip);
  assert.deepEqual(tainted.map(t => t.slot), ['武器']);
  assert.equal(tainted[0].天骄, '华云飞');
});

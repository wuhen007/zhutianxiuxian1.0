import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  calculateEquippedStats,
  calculateEquipmentSetBonuses,
  getEquipmentAllAttributeMultiplier,
  isCanonicalDaluoSwordEmbryo,
  isNameablePercentageEquipment,
  MAX_PERCENT_EQUIPMENT_STAT,
  rebalancePercentBonuses,
} from '../model/equipmentStats.js';

test('装备百分比统一加算后只乘一次基础属性', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };

  assert.equal(
    calculateEquippedStats(base, [{ atk: 0.5 }, { atk: 0.5 }, { atk: 0.5 }]).攻击,
    2500
  );
  assert.equal(
    calculateEquippedStats(base, [{ atk: 1 }, { atk: 1 }, { atk: 1 }]).攻击,
    4000
  );
  assert.equal(calculateEquippedStats(base, [{ atk: 1.6 }]).攻击, 2600);
  // 三件各 +9900% 的百分比装备：先加算（29700%）后乘一次基础属性，
  // 未达 50000% 上限，最终倍率为 298 倍
  assert.deepEqual(
    calculateEquippedStats(base, [
      { atk: 99, def: 99, HP: 99 },
      { atk: 99, def: 99, HP: 99 },
      { atk: 99, def: 99, HP: 99 },
    ]),
    { 攻击: 298000, 防御: 298000, 血量上限: 298000 }
  );
  assert.deepEqual(
    calculateEquippedStats(base, [{ atk: 0.5 }, { atk: 1000, def: 2000, HP: 3000 }]),
    { 攻击: 2500, 防御: 3000, 血量上限: 4000 }
  );
  assert.deepEqual(
    calculateEquippedStats(base, [{
      atk: 1000,
      def: 2000,
      HP: 3000,
      归一属性: { 百分比: { atk: 0.5, def: 0.25, HP: 1 } },
    }]),
    { 攻击: 2500, 防御: 3250, 血量上限: 5000 }
  );
});

test('百分比装备单属性加成上限为 50000%', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  // 60000% 应被钳制到 50000%（501 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 600 } } }]).攻击,
    501000
  );
  // 6000% 未达上限，正常生效（61 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 60 } } }]).攻击,
    61000
  );
  // 恰好 5000% 正常生效（51 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 50 } } }]).攻击,
    51000
  );
  // 4900% 正常生效（50 倍）
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 49 } } }]).攻击,
    50000
  );
});

test('万象归一与普通百分比装备分池封顶后继续加算', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  const fixedFusion = {
    name: '大罗剑胎',
    atk: 1000,
    def: 2000,
    HP: 3000,
    归一来源: '百分比装备',
    归一属性: { 百分比: { atk: 300, def: 100, HP: 200 } },
  };
  const ordinaryOverflow = [
    { atk: 300, def: 300, HP: 300 },
    { atk: 300, def: 300, HP: 300 },
  ];

  assert.deepEqual(
    calculateEquippedStats(base, [fixedFusion, ...ordinaryOverflow]),
    { 攻击: 802000, 防御: 603000, 血量上限: 704000 },
  );

  // 两池均未封顶时仍沿用原来的加算曲线，不引入额外交叉倍率。
  assert.deepEqual(
    calculateEquippedStats(base, [
      { atk: 0.5, def: 0.5, HP: 0.5 },
      {
        atk: 1000,
        def: 2000,
        HP: 3000,
        归一来源: '百分比装备',
        归一属性: { 百分比: { atk: 0.5, def: 0.5, HP: 0.5 } },
      },
    ]),
    { 攻击: 3000, 防御: 4000, 血量上限: 5000 },
  );
});

test('只有万象归一标记进入独立池，天骄洗礼等旧词条仍留普通池', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  assert.deepEqual(
    calculateEquippedStats(base, [
      { atk: 300, def: 300, HP: 300 },
      { atk: 300, def: 300, HP: 300 },
      {
        atk: 1000,
        def: 2000,
        HP: 3000,
        归一属性: { 百分比: { atk: 100, def: 100, HP: 100 } },
      },
    ]),
    { 攻击: 502000, 防御: 503000, 血量上限: 504000 },
  );
});

test('万象归一独立池单属性上限同为 50000%', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  assert.deepEqual(
    calculateEquippedStats(base, [{
      atk: 1000,
      def: 2000,
      HP: 3000,
      归一来源: '百分比装备',
      归一属性: { 百分比: { atk: 600, def: 600, HP: 600 } },
    }]),
    { 攻击: 502000, 防御: 503000, 血量上限: 504000 },
  );
});

test('可赋名百分比装备以499为单属性上限', () => {
  assert.equal(MAX_PERCENT_EQUIPMENT_STAT, 499);
  assert.equal(isNameablePercentageEquipment({ type: '武器', atk: 99, def: 0, HP: 0 }), true);
  assert.equal(isNameablePercentageEquipment({ type: '武器', atk: 499, def: 0, HP: 0 }), true);
  assert.equal(isNameablePercentageEquipment({ type: '武器', atk: 500, def: 0, HP: 0 }), false);
  assert.equal(isNameablePercentageEquipment({ type: '法宝', atk: 1, def: 0, HP: 499 }), true);
  assert.equal(isNameablePercentageEquipment({ type: '武器', atk: 1.4, def: 0.5, HP: 0 }), false);
});

test('带攻击字段的普通道具不会被当成百分比装备', () => {
  assert.equal(isNameablePercentageEquipment({ class: '道具', type: '道具', atk: 2 }), false);
});

test('万道神炉：百分比装备溢出自动补偿至理论极限（不溢出不丢失）', () => {
  // 攻超出（600）：100 点溢出按序补偿给第一个未达极限的属性（防）
  assert.deepEqual(rebalancePercentBonuses(600, 100, 200), { atk: 500, def: 200, HP: 200, overflow: 0 });
  // 防超出（600）：溢出补攻
  assert.deepEqual(rebalancePercentBonuses(300, 600, 300), { atk: 400, def: 500, HP: 300, overflow: 0 });
  // 全部未超：原样保留
  assert.deepEqual(rebalancePercentBonuses(100, 200, 300), { atk: 100, def: 200, HP: 300, overflow: 0 });
  // 全部超出：全部钳制到极限（无可补偿目标，剩余溢出丢弃）
  assert.deepEqual(rebalancePercentBonuses(600, 600, 600), { atk: 500, def: 500, HP: 500, overflow: 300 });

  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  // 攻 60000%、防 10000%、血 20000%：默认模式攻被截断丢弃；补偿模式下溢出补防、血，最终全部达 50000% 极限
  const slots = [{ 归一属性: { 百分比: { atk: 600, def: 100, HP: 200 } } }];
  assert.equal(calculateEquippedStats(base, slots).攻击, 501000);
  assert.equal(calculateEquippedStats(base, slots).防御, 101000);
  assert.equal(calculateEquippedStats(base, slots).血量上限, 201000);
  const compensated = calculateEquippedStats(base, slots, { rebalanceOverflow: true });
  assert.deepEqual(compensated, { 攻击: 501000, 防御: 201000, 血量上限: 201000 });
});

test('大罗剑胎对至尊体系列提供十五倍，其他灵根提供七点五倍', () => {
  const sword = {
    name: '大罗剑胎',
    至尊体全属性倍率: 15,
    其他灵根全属性倍率: 7.5,
  };

  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '至尊体' } }, sword), 15);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '涅槃至尊体' } }, sword), 15);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '终极至尊体' } }, sword), 15);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '天灵根' } }, sword), 7.5);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '至尊体' } }, { name: '普通剑' }), 1);
  assert.equal(isCanonicalDaluoSwordEmbryo(sword), true);
});

test('自铸百分比武器即使同名大罗剑胎也不会触发仙古唯一装备加成', () => {
  const renamedCraft = { name: '大罗剑胎', class: '装备', type: '武器', atk: 48.5, def: 36, HP: 52 };
  assert.equal(isCanonicalDaluoSwordEmbryo(renamedCraft), false);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '至尊体' } }, renamedCraft), 1);
  assert.deepEqual(calculateEquipmentSetBonuses({ 灵根: { type: '至尊体' } }, {
    武器: renamedCraft,
  }), { 攻: 0, 防: 0, 血: 0 });
});

test('大罗剑胎识别兼容历史标记和当前目录，排除混搭倍率与普通同名武器', () => {
  const catalog = JSON.parse(fs.readFileSync(new URL('../resources/data/item/装备列表.json', import.meta.url), 'utf8'));
  const current = catalog.find(item => item.id === 100054);
  assert.equal(isCanonicalDaluoSwordEmbryo(current), true);
  assert.equal(isCanonicalDaluoSwordEmbryo({ ...current, id: undefined }), true);
  const legacy = { name: '大罗剑胎', 至尊体全属性倍率: 7, 其他灵根全属性倍率: 4.5 };
  assert.equal(isCanonicalDaluoSwordEmbryo(legacy), true);
  assert.equal(getEquipmentAllAttributeMultiplier({ 灵根: { type: '至尊体' } }, legacy), 7);
  for (const item of [
    { name: '大罗剑胎' },
    { name: '大罗剑胎', 至尊体全属性倍率: 15, 其他灵根全属性倍率: 4.5 },
    { name: '大罗剑胎', 至尊体全属性倍率: 7, 其他灵根全属性倍率: 7.5 },
    { ...current, name: '普通剑' },
  ]) assert.equal(isCanonicalDaluoSwordEmbryo(item), false);
  assert.deepEqual(calculateEquipmentSetBonuses({ 灵根: { type: '至尊体' } }, { 武器: current }), { 攻: 14, 防: 14, 血: 14 });
});

test('常规重算与渡劫共用套装增益规则', () => {
  assert.deepEqual(calculateEquipmentSetBonuses({
    魔道值: 1000,
    灵根: { type: '魔头' },
  }, {
    武器: { name: '灭仙剑' },
    护具: { name: '灭仙衣' },
    法宝: { name: '灭仙符' },
  }), { 攻: 0.15, 防: 0, 血: 0 });

  assert.deepEqual(calculateEquipmentSetBonuses({
    mijinglevel_id: 21,
    灵根: { type: '普通' },
  }, {
    武器: { name: '荒剑' },
    护具: { name: '祭道甲胄' },
    法宝: { name: '雷池' },
  }), { 攻: 52, 防: 62, 血: 47 });

  assert.deepEqual(calculateEquipmentSetBonuses({}, {}), { 攻: 0, 防: 0, 血: 0 });

  const tribulationSource = fs.readFileSync(
    new URL('../apps/User/zhetiandujie.js', import.meta.url),
    'utf8',
  );
  const methodStart = tribulationSource.indexOf('calcTribulationAttr(player, equipment)');
  const methodEnd = tribulationSource.indexOf('async command_datitingtianji', methodStart);
  const methodSource = tribulationSource.slice(methodStart, methodEnd);
  assert.match(methodSource, /calculateEquipmentSetBonuses\(player, equipment/);
  assert.doesNotMatch(methodSource, /不计算任何套装增益/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  calculateEquippedStats,
  collectEquipmentStatPools,
  calculateEquipmentSetBonuses,
  getEquipmentAllAttributeMultiplier,
  isCanonicalDaluoSwordEmbryo,
  isNameablePercentageEquipment,
  MAX_PERCENT_EQUIPMENT_STAT,
  rebalancePercentBonuses,
} from '../model/equipmentStats.js';

for (const [setName, multiplier, rootNames, romanceTier] of [
  ['岁云剑尊套', 20, ['岁云剑尊'], 0],
  ['霜月剑尊套', 10, ['霜月剑尊', '岁云化身', '岁云剑尊'], 0],
  ['泰坦记忆套', 3, ['无漏净子'], 2],
  ['星神记忆套', 10, ['无漏净子'], 3],
]) {
  test(`${setName}齐套攻防生命总倍率为${multiplier}倍，保留灵根与因子门槛`, () => {
    const items = JSON.parse(fs.readFileSync(new URL('../resources/data/item/特殊装备列表.json', import.meta.url), 'utf8'))
      .filter(item => item.套装 === setName);
    assert.equal(items.length, 3);
    const equipment = Object.fromEntries(items.map(item => [item.type, { ...item, 绑定者: 'owner' }]));
    for (const item of items) assert.ok(item.desc.includes(`总倍率×${multiplier}（加成+${multiplier - 1}）`));
    for (const name of rootNames) {
      const player = { id: 'owner', 灵根: { name }, 记忆命途: { 因子: { 浪漫: romanceTier } } };
      const bonus = calculateEquipmentSetBonuses(player, equipment);
      assert.deepEqual(bonus, { 攻: multiplier - 1, 防: multiplier - 1, 血: multiplier - 1 });
      assert.deepEqual(Object.values(bonus).map(value => 100 * (1 + value)), Array(3).fill(100 * multiplier));
      assert.deepEqual(calculateEquipmentSetBonuses(player, { ...equipment, 法宝: {} }), { 攻: 0, 防: 0, 血: 0 });
      if (romanceTier) {
        player.记忆命途.因子.浪漫 = romanceTier - 1;
        assert.deepEqual(calculateEquipmentSetBonuses(player, equipment), { 攻: 0, 防: 0, 血: 0 });
      }
      player.灵根.name = '普通灵根';
      assert.deepEqual(calculateEquipmentSetBonuses(player, equipment), { 攻: 0, 防: 0, 血: 0 });
    }
    if (setName === '霜月剑尊套') {
      equipment.武器.绑定者 = 'other';
      assert.deepEqual(calculateEquipmentSetBonuses({ id: 'owner', 灵根: { name: rootNames[0] } }, equipment), { 攻: 0, 防: 0, 血: 0 });
    }
  });
}

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
  // 多件加算，最终倍率为 298 倍
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

test('单件百分比加成最高499，含基础500倍；多件叠加无总上限', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  for (const count of [1, 2, 3, 5]) {
    const slots = Array.from({ length: count }, () => ({ atk: 499, def: 499, HP: 499 }));
    const expected = 1000 * (1 + 499 * count);
    assert.deepEqual(calculateEquippedStats(base, slots), {
      攻击: expected, 防御: expected, 血量上限: expected,
    });
  }
  // 追加词条与本件基础词条共用单件上限。
  assert.equal(calculateEquippedStats(base, [{ atk: 400, 归一属性: { 百分比: { atk: 200 } } }]).攻击, 500000);
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 600 } } }]).攻击,
    500000
  );
  // 固定数值装备仍按原规则加算，不把500点固定攻击改成百分比。
  assert.equal(calculateEquippedStats(base, [{ atk: 500 }]).攻击, 1500);
  assert.equal(
    calculateEquippedStats(base, [{ 归一属性: { 百分比: { atk: 60 } } }]).攻击,
    61000
  );
});

test('万象归一与普通百分比装备分别汇总后无上限加算', () => {
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
    { 攻击: 902000, 防御: 703000, 血量上限: 804000 },
  );

  // 沿用加算曲线，不引入额外交叉倍率。
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
    { 攻击: 702000, 防御: 703000, 血量上限: 704000 },
  );
});

test('万象归一单件限499，多件词条合计不封顶且固定值完整保留', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  const item = {
    atk: 1000, def: 2000, HP: 3000,
    归一来源: '百分比装备',
    归一属性: { 百分比: { atk: 600, def: 600, HP: 600 } },
  };
  assert.deepEqual(
    calculateEquippedStats(base, [item]),
    { 攻击: 501000, 防御: 502000, 血量上限: 503000 },
  );
  assert.deepEqual(calculateEquippedStats(base, [item, item]), {
    攻击: 1001000, 防御: 1003000, 血量上限: 1005000,
  });
  assert.deepEqual(collectEquipmentStatPools([item, item]).fusion, { atk: 998, def: 998, HP: 998 });
  assert.equal(item.归一属性.百分比.atk, 600, '结算不改写历史装备数据');
});

test('截图中的换防具案例：血量加成超过旧500限额后仍继续增加', () => {
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  const weapon = { atk: 276, def: 84, HP: 276 };
  const treasure = { atk: 199.52, def: 299.28, HP: 297.25 };
  const before = calculateEquippedStats(base, [weapon, { atk: 3.74, def: 3.74, HP: 3.74 }, treasure]);
  const after = calculateEquippedStats(base, [weapon, treasure, treasure]);
  assert.deepEqual(before, { 攻击: 480260, 防御: 388020, 血量上限: 577990 });
  assert.deepEqual(after, { 攻击: 676040, 防御: 683560, 血量上限: 871500 });
  assert.ok(after.血量上限 > before.血量上限);
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

test('万道神炉：单件内补偿到499，多件合计不截顶也不跨件转移', () => {
  assert.deepEqual(rebalancePercentBonuses(600, 100, 200), { atk: 499, def: 201, HP: 200, overflow: 0 });
  assert.deepEqual(rebalancePercentBonuses(300, 600, 300), { atk: 401, def: 499, HP: 300, overflow: 0 });
  assert.deepEqual(rebalancePercentBonuses(100, 200, 300), { atk: 100, def: 200, HP: 300, overflow: 0 });
  assert.deepEqual(rebalancePercentBonuses(600, 600, 600), { atk: 499, def: 499, HP: 499, overflow: 303 });

  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  const slots = [
    { 归一属性: { 百分比: { atk: 600, def: 100, HP: 200 } } },
    { atk: 100, def: 100, HP: 100 },
  ];
  assert.deepEqual(calculateEquippedStats(base, slots), { 攻击: 600000, 防御: 201000, 血量上限: 301000 });
  assert.deepEqual(calculateEquippedStats(base, slots, { rebalanceOverflow: true }), {
    攻击: 600000, 防御: 302000, 血量上限: 301000,
  });
  assert.deepEqual(calculateEquippedStats(base, [
    { 归一属性: { 百分比: { atk: 600, def: 600, HP: 600 } } },
    { atk: 1, def: 1, HP: 1 },
  ], { rebalanceOverflow: true }), { 攻击: 501000, 防御: 501000, 血量上限: 501000 });
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

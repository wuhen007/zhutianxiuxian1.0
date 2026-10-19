import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  ENDLESS_SHOP,
  ENDLESS_TOKEN,
  FUSION_ITEM,
  canPurchaseEndlessProduct,
  findEndlessProduct,
  formatFusionResult,
  formatTreasureClue,
  grantEndlessDirectReward,
  mergeSetEquipment,
} from '../model/endlessShop.js';
import {
  calculateEquippedStats,
  calculateEquipmentSetBonuses,
} from '../model/equipmentStats.js';

const itemDir = fileURLToPath(new URL('../resources/data/item/', import.meta.url));
const shopData = JSON.parse(
  fs.readFileSync(
    fileURLToPath(new URL('../resources/data/无尽商店.json', import.meta.url)),
    'utf8'
  )
);

test('无尽商店商品可按编号和名称查找', () => {
  assert.equal(ENDLESS_TOKEN, '劫境道痕');
  assert.equal(ENDLESS_SHOP.length, shopData.products.length);
  assert.equal(
    new Set(ENDLESS_SHOP.map(item => item.id)).size,
    ENDLESS_SHOP.length
  );
  assert.equal(ENDLESS_SHOP[0].name, shopData.products[0].name);
  assert.equal(findEndlessProduct('1').name, '大衍悟道丹');
  // 价格以无尽商店.json 数据为准，避免配置调整后测试硬编码过期
  assert.equal(
    findEndlessProduct(FUSION_ITEM).price,
    shopData.products.find(p => p.name === FUSION_ITEM).price
  );
  assert.equal(
    findEndlessProduct('造化本源').price,
    shopData.products.find(p => p.name === '造化本源').price
  );
});

test('无尽商店实体商品都存在于物品目录', () => {
  const catalogs = ['丹药列表.json', '炼丹师丹药.json', '道具列表.json', '盒子列表.json', '锻造材料.json']
    .flatMap(file => JSON.parse(fs.readFileSync(`${itemDir}${file}`, 'utf8')));
  for (const product of ENDLESS_SHOP.filter(item => item.action === 'item')) {
    assert.ok(
      catalogs.some(item => item.name === product.name && item.class === product.itemClass),
      `${product.name}不存在于${product.itemClass}物品目录`
    );
  }
});

test('先天灵宝天机将新显化至宝的精确坐标交给购买者', () => {
  const now = 1_000_000;
  const manifested = {
    type: 'treasureAppear',
    treasure: { name: '混沌珠' },
    contest: { status: 'open', profile: { omen: '混沌气遮蔽星河。' } },
    plane: '遮天位面',
    location: '太初古矿',
    coordinate: { x: 227, y: 116 },
    expiresAt: now + 90 * 60000,
    timestamp: 2,
  };

  const clue = formatTreasureClue(manifested, now).join('\n');
  assert.match(clue, /天机锁定：混沌珠·万象之源/);
  assert.match(clue, /出世之地：遮天位面·太初古矿（坐标 227,116）/);
  assert.match(clue, /现世余时：1小时30分钟/);
  assert.match(clue, /#前往227,116/);
});

test('万象归一消耗材料并保留套装数值和百分比属性', () => {
  const equipment = {
    武器: { name: '灭仙剑', type: '武器', atk: 1000, def: 200, HP: 300, bao: 0.2 },
    护具: {},
    法宝: {},
  };
  const najie = {
    装备: [{
      name: '诸天剑影', type: '武器', atk: 0.5, def: 0.2, HP: 1, bao: 0.1, 数量: 1,
      归一属性: { 百分比: { atk: 0.1, def: 0.05 } },
    }],
    道具: [{ name: FUSION_ITEM, 数量: 1 }],
  };
  const result = mergeSetEquipment(equipment, najie, '武器', '诸天剑影');
  assert.equal(result.equipment.武器.name, '灭仙剑');
  assert.deepEqual(result.equipment.武器.归一属性.百分比, {
    atk: 0.6,
    def: 0.25,
    HP: 1,
  });
  assert.ok(Math.abs(result.equipment.武器.bao - 0.3) < 1e-12);
  assert.equal(result.najie.装备.length, 0);
  assert.equal(result.najie.道具.length, 0);
});

test('万象归一后的固定值、百分比与原套装效果共同进入面板', () => {
  const equipment = {
    武器: { name: '灭仙剑', type: '武器', atk: 1000, def: 200, HP: 300 },
    护具: { name: '灭仙衣', type: '护具' },
    法宝: { name: '灭仙符', type: '法宝' },
  };
  const najie = {
    装备: [{ name: '百分比剑', type: '武器', atk: 0.5, def: 0.2, HP: 1, 数量: 1 }],
    道具: [{ name: FUSION_ITEM, 数量: 1 }],
  };
  const merged = mergeSetEquipment(equipment, najie, '武器', '百分比剑');
  const stats = calculateEquippedStats(
    { 攻击: 1000, 防御: 1000, 血量上限: 1000 },
    [merged.equipment.武器, merged.equipment.护具, merged.equipment.法宝]
  );
  const set = calculateEquipmentSetBonuses({ 魔道值: 1000, 灵根: { type: '魔头' } }, merged.equipment);

  assert.deepEqual(stats, { 攻击: 2500, 防御: 1400, 血量上限: 2300 });
  assert.deepEqual(set, { 攻: 0.15, 防: 0, 血: 0 });
  assert.deepEqual({
    攻击: Math.trunc(stats.攻击 * (1 + set.攻)),
    防御: Math.trunc(stats.防御 * (1 + set.防)),
    血量上限: Math.trunc(stats.血量上限 * (1 + set.血)),
  }, { 攻击: 2875, 防御: 1400, 血量上限: 2300 });
});

test('万象归一与超过旧上限的普通百分比装备完整加算', () => {
  const equipment = {
    武器: {
      id: 100054,
      name: '大罗剑胎',
      type: '武器',
      atk: 4_500_000_000,
      def: 4_500_000_000,
      HP: 4_500_000_000,
      bao: 0.2,
      至尊体全属性倍率: 15,
      其他灵根全属性倍率: 7.5,
    },
    护具: { type: '护具', atk: 278.95, def: 286.84, HP: 361.6, bao: 0.83 },
    法宝: { type: '法宝', atk: 279.62, def: 287.52, HP: 362.54, bao: 0.83 },
    帝兵: {},
    至宝: {},
  };
  const najie = {
    装备: [{
      name: '剑', type: '武器', atk: 303.96, def: 92.51, HP: 303.96, bao: 0.83, 数量: 1,
    }],
    道具: [{ name: FUSION_ITEM, 数量: 1 }],
  };
  const merged = mergeSetEquipment(equipment, najie, '武器', '剑');
  const before = calculateEquippedStats(
    { 攻击: 1000, 防御: 1000, 血量上限: 1000 },
    Object.values(equipment),
  );
  const after = calculateEquippedStats(
    { 攻击: 1000, 防御: 1000, 血量上限: 1000 },
    Object.values(merged.equipment),
  );
  const message = formatFusionResult(merged).join('\n');

  assert.equal(after.攻击 - before.攻击, 303_960);
  assert.equal(after.防御 - before.防御, 92_510);
  assert.equal(after.血量上限 - before.血量上限, 303_960);
  const set = calculateEquipmentSetBonuses(
    { 灵根: { type: '圆环之理' } },
    merged.equipment,
  );
  assert.deepEqual(set, { 攻: 6.5, 防: 6.5, 血: 6.5 });
  assert.equal(
    Math.trunc(after.攻击 * (1 + set.攻)) - Math.trunc(before.攻击 * (1 + set.攻)),
    2_279_700,
  );
  assert.equal(
    Math.trunc(after.防御 * (1 + set.防)) - Math.trunc(before.防御 * (1 + set.防)),
    693_825,
  );
  assert.equal(
    Math.trunc(after.血量上限 * (1 + set.血)) - Math.trunc(before.血量上限 * (1 + set.血)),
    2_279_700,
  );
  assert.equal(merged.target.bao, 1.03);
  assert.match(message, /攻击\+30396% \/ 防御\+9251% \/ 血量\+30396% \/ 暴击\+83%/);
  assert.equal(before.攻击, 4_500_559_570);
  assert.equal(before.防御, 4_500_575_360);
  assert.equal(before.血量上限, 4_500_725_140);
  assert.match(message, /单件每项百分比加成最高\+49900%（含基础500倍）/);
  assert.match(message, /普通装备与归一词条多件加算，无总上限/);
  assert.doesNotMatch(message, /50000%|截顶|已达普通百分比/);
});

test('万象归一保留原始词条，结算与展示按单件上限且保留固定数值', () => {
  const equipment = {
    武器: { name: '灭仙剑', type: '武器', atk: 1000, def: 2000, HP: 3000 },
    护具: {}, 法宝: {},
  };
  const source = {
    name: '溢出百分比剑', type: '武器', atk: 498, def: 100, HP: 450, 数量: 1,
    归一属性: { 百分比: { atk: 4, def: 500, HP: 70 } },
  };
  const merged = mergeSetEquipment(equipment, {
    装备: [source], 道具: [{ name: FUSION_ITEM, 数量: 1 }],
  }, '武器', source.name);

  assert.deepEqual(merged.target.归一属性.百分比, { atk: 502, def: 600, HP: 520 });
  assert.deepEqual(calculateEquippedStats(
    { 攻击: 1000, 防御: 1000, 血量上限: 1000 },
    [merged.target],
  ), { 攻击: 501_000, 防御: 502_000, 血量上限: 503_000 });
  assert.match(formatFusionResult(merged).join('\n'), /归一生效词条：攻击\+49900% \/ 防御\+49900% \/ 血量\+49900%/);
  assert.equal(equipment.武器.归一属性, undefined);
  assert.equal(source.数量, 1);
});

test('万象归一保留源溢出，万道神炉在熔铸前后都补偿同件属性', () => {
  const source = {
    name: '溢出百分比剑', type: '武器', atk: 400, def: 100, HP: 200, 数量: 1,
    归一属性: { 百分比: { atk: 200 } },
  };
  const merged = mergeSetEquipment({
    武器: { name: '灭仙剑', type: '武器', atk: 1000, def: 2000, HP: 3000 },
  }, {
    装备: [source], 道具: [{ name: FUSION_ITEM, 数量: 1 }],
  }, '武器', source.name);
  const base = { 攻击: 1000, 防御: 1000, 血量上限: 1000 };
  const options = { rebalanceOverflow: true };

  assert.deepEqual(merged.target.归一属性.百分比, { atk: 600, def: 100, HP: 200 });
  assert.deepEqual(calculateEquippedStats(base, [source], options), {
    攻击: 500_000, 防御: 202_000, 血量上限: 201_000,
  });
  assert.deepEqual(calculateEquippedStats(base, [merged.target], options), {
    攻击: 501_000, 防御: 204_000, 血量上限: 204_000,
  });
  assert.match(formatFusionResult(merged, options).join('\n'), /攻击\+49900% \/ 防御\+20100% \/ 血量\+20000%/);
  assert.match(formatFusionResult(merged).join('\n'), /攻击\+49900% \/ 防御\+10000% \/ 血量\+20000%/);
});

test('准仙帝可用两万道痕兑换一点纪元积累', () => {
  const product = findEndlessProduct('纪元积累');
  assert.equal(product.price, 20_000);
  assert.equal(canPurchaseEndlessProduct({ mijinglevel_id: 19 }, product), false);
  assert.equal(canPurchaseEndlessProduct({ mijinglevel_id: 20 }, product), true);
  assert.equal(canPurchaseEndlessProduct({ xiangulevel_id: 21 }, product), true);
  assert.equal(canPurchaseEndlessProduct({ huafenlevel_id: 21 }, product), true);

  const player = { 纪元积累: 3 };
  assert.equal(grantEndlessDirectReward(player, product, 2), true);
  assert.equal(player.纪元积累, 5);
});

test('万象归一与全局装备规则共用499百分比阈值', () => {
  const furnace = { 道具: [{ name: FUSION_ITEM, 数量: 1 }] };
  assert.throws(() => mergeSetEquipment(
    { 武器: { name: '灭仙剑', type: '武器', atk: 499 }, 护具: {}, 法宝: {} },
    { ...furnace, 装备: [{ name: '百分比剑', type: '武器', atk: 1, 数量: 1 }] },
    '武器',
    '百分比剑'
  ), /必须是数值装备/);

  const merged = mergeSetEquipment(
    { 武器: { name: '灭仙剑', type: '武器', atk: 500 }, 护具: {}, 法宝: {} },
    { ...furnace, 装备: [{ name: '百分比剑', type: '武器', atk: 499, 数量: 1 }] },
    '武器',
    '百分比剑'
  );
  assert.equal(merged.target.归一属性.百分比.atk, 499);
});

test('同名自铸武器不会被万象归一误认成仙古大罗剑胎', () => {
  const najie = {
    装备: [{ name: '百分比剑', type: '武器', atk: 1, 数量: 1 }],
    道具: [{ name: FUSION_ITEM, 数量: 1 }],
  };
  assert.throws(() => mergeSetEquipment(
    { 武器: { name: '大罗剑胎', type: '武器', atk: 1000 }, 护具: {}, 法宝: {} },
    najie,
    '武器',
    '百分比剑'
  ), /不是仙古秘境产出的大罗剑胎/);

  const result = mergeSetEquipment(
    {
      武器: {
        id: 100054,
        name: '大罗剑胎',
        type: '武器',
        atk: 3_000_000_000,
        至尊体全属性倍率: 15,
        其他灵根全属性倍率: 7.5,
      },
      护具: {},
      法宝: {},
    },
    najie,
    '武器',
    '百分比剑'
  );
  assert.equal(result.target.归一来源, '百分比剑');
});

test('万象归一落盘受玩家锁和三文件回滚保护', () => {
  const source = fs.readFileSync(new URL('../apps/EndlessRealm.js', import.meta.url), 'utf8');
  const start = source.indexOf('async mergeEquipment(e)');
  const end = source.indexOf('async unequipEndlessPuzzleCmd', start);
  const handler = source.slice(start, end);
  assert.match(handler, /withPlayerMutationLock\(userId/);
  assert.match(handler, /__PATH\.player_path/);
  assert.match(handler, /__PATH\.equipment_path/);
  assert.match(handler, /__PATH\.najie_path/);
  assert.match(handler, /transaction\.rollback\(\)/);
});

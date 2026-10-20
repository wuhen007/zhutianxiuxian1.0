import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import template from 'art-template';

import {
  isFixedStatEquipment,
  MAX_PERCENT_EQUIPMENT_STAT,
} from '../model/equipmentStats.js';

const EQUIPMENT_HTML_FILES = [
  'resources/html/najie/najie.html',
  'resources/html/equipment/equipment.html',
  'resources/html/player/player.html',
  'resources/html/player/player-2.html',
  'resources/html/player_pindao/player_pindao.html',
  'resources/html/najie_copy/najie_copy.html',
  'resources/html/najie-category/najie-category.html',
  'resources/html/wuqi/wuqi.html',
  'resources/html/supermarket/supermarket.html',
];

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('装备显示阈值与战斗计算一致：单属性 >499 为数值装备，否则百分比', () => {
  assert.equal(MAX_PERCENT_EQUIPMENT_STAT, 499);
  assert.equal(isFixedStatEquipment({ atk: 499, def: 499, HP: 499 }), false);
  assert.equal(isFixedStatEquipment({ atk: 500, def: 1, HP: 1 }), true);

  for (const file of EQUIPMENT_HTML_FILES) {
    const html = read(file);
    assert.ok(
      !/(atk|def|HP)\s*>\s*(10|99)\b/.test(html),
      `${file} 仍残留旧阈值（>10/>99），与战斗计算的 >499 不一致`
    );
    assert.ok(
      /(atk|def|HP)\s*>\s*499/.test(html),
      `${file} 缺少数值装备判定阈值 >499`
    );
  }
});

test('百分比装备统一按倍率显示：1.6 显示为 160%', () => {
  assert.equal(`${(1.6 * 100).toFixed(0)}%`, '160%');

  for (const file of EQUIPMENT_HTML_FILES) {
    const html = read(file);
    assert.ok(
      !/\.(atk|def|HP)>=\s*1\?/.test(html),
      `${file} 仍残留 >=1 时不乘 100 的错误显示`
    );
    assert.match(
      html,
      /(atk|def|HP)[^\n]*\*100\)\.toFixed\(0\)/,
      `${file} 缺少倍率乘 100 的百分比显示`
    );
  }
});

test('归一追加词条在所有装备模板中可编译并正确合并显示', () => {
  for (const file of EQUIPMENT_HTML_FILES) {
    const html = read(file);
    assert.match(html, /归一属性/);
    assert.match(html, /百分比/);
    assert.doesNotThrow(() => template.compile(html), `${file} 模板编译失败`);
  }

  const output = template.render(read('resources/html/najie/najie.html'), {
    pluResPath: '',
    pifu: 1,
    user_id: '10001',
    player: { 名号: '测试道君', 当前血量: 1, 血量上限: 1 },
    strand_hp: { style: '' },
    strand_lingshi: { style: '' },
    najie: {
      等级: 1,
      灵石: 0,
      灵石上限: 1,
      装备: [
        {
          id: 99, name: '天阙创世剑', type: '武器', pinji: 0, islockd: 0,
          atk: 500, def: 500, HP: 500, bao: 0, 数量: 1, 出售价: 0,
          天阙创世: true, 百分比上限豁免: '天阙创世',
        },
        {
          id: 1,
          name: '固定归一剑',
          type: '武器',
          pinji: 0,
          islockd: 0,
          atk: 1000,
          def: 200,
          HP: 300,
          bao: 0,
          数量: 1,
          出售价: 1,
          归一属性: { 百分比: { atk: 0.5 } },
        },
        {
          id: 2,
          name: '百分比归一剑',
          type: '武器',
          pinji: 0,
          islockd: 0,
          atk: 0.5,
          def: 0,
          HP: 0,
          bao: 0,
          数量: 1,
          出售价: 1,
          归一属性: { 百分比: { atk: 0.12 } },
        },
        {
          id: 3,
          name: '百分比溢出剑',
          type: '武器',
          pinji: 0,
          islockd: 0,
          atk: 300,
          def: 0,
          HP: 0,
          bao: 0,
          数量: 1,
          出售价: 1,
          归一属性: { 百分比: { atk: 300 } },
        },
        {
          id: 4,
          name: '固定归一溢出剑',
          type: '武器',
          pinji: 0,
          islockd: 0,
          atk: 1000,
          def: 0,
          HP: 0,
          bao: 0,
          数量: 1,
          出售价: 1,
          归一属性: { 百分比: { atk: 600 } },
        },
      ],
      丹药: [],
      道具: [],
      功法: [],
      草药: [],
      材料: [],
      食材: [],
      盒子: [],
      宝石: [],
      仙宠: [],
      仙宠口粮: [],
    },
  });

  assert.match(output, /攻击：1000（\+50%）/);
  assert.match(output, /攻击：62%/);
  assert.match(output, /攻击：49900%/);
  assert.match(output, /攻击：1000（\+49900%）/);
  assert.doesNotMatch(output, /60000%/);
  assert.match(output, /攻击：50000%/);
});

test('所有装备模板的单件百分比都按499上限渲染，保留正常小数词条', () => {
  for (const file of EQUIPMENT_HTML_FILES) {
    const expressions = read(file).match(/\{\{set equipmentPercent = [^\r\n]+?\}\}\{\{[^\r\n]+?\}\}/g) || [];
    assert.ok(expressions.length >= 6, `${file} 缺少装备百分比展示`);
    for (const rate of [600, 499, 1.6]) {
      const item = {
        atk: 0, def: 0, HP: 0,
        归一属性: { 百分比: { atk: rate, def: rate, HP: rate } },
      };
      const data = {
        equipmentCap: 499,
        item, arms: item, armor: item, treasure: item,
        equipment: { 武器: item, 护具: item, 法宝: item, 帝兵: item },
        $value: { name: item },
      };
      for (const expression of expressions) {
        assert.equal(template.render(expression, data), (Math.min(499, rate) * 100).toFixed(0), file);
        assert.equal(template.render(expression, { ...data, equipmentCap: 500 }), (Math.min(500, rate) * 100).toFixed(0), `${file}:创世`);
      }
    }
  }
});

test('装备列表内置百分比装备与战斗规则自洽', () => {
  const list = JSON.parse(read('resources/data/item/装备列表.json'));
  const woodenSword = (Array.isArray(list) ? list : Object.values(list)).find(
    item => item?.name === '小木剑'
  );
  assert.deepEqual(
    [woodenSword?.atk, woodenSword?.def, woodenSword?.HP],
    [100, 100, 100],
  );
  assert.equal(isFixedStatEquipment(woodenSword), false);
});

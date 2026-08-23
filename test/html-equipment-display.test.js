import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const EQUIPMENT_HTML_FILES = [
  'resources/html/najie/najie.html',
  'resources/html/equipment/equipment.html',
  'resources/html/player/player.html',
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
  const equipmentStats = read('model/equipmentStats.js');
  assert.match(equipmentStats, /MAX_PERCENT_EQUIPMENT_STAT = 499/);
  assert.match(
    equipmentStats,
    /atk > MAX_PERCENT_EQUIPMENT_STAT \|\| def > MAX_PERCENT_EQUIPMENT_STAT \|\| HP > MAX_PERCENT_EQUIPMENT_STAT/
  );

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
    const percentExprs = html.match(/\.(atk|def|HP)\*100\)\.toFixed\(0\)/g) || [];
    assert.ok(percentExprs.length > 0, `${file} 缺少倍率乘 100 的百分比显示`);
  }
});

test('装备列表内置百分比装备（100~499）与战斗规则自洽', () => {
  const list = JSON.parse(read('resources/data/item/装备列表.json'));
  const suspicious = (Array.isArray(list) ? list : Object.values(list)).filter(
    item =>
      item &&
      ([item.atk, item.def, item.HP].some(n => Number(n) >= 100 && Number(n) <= 499))
  );
  // 100~499 的装备按战斗规则是百分比装备（≤499），显示层必须能标出 %，
  // 这里仅断言此类装备存在且数量已知，防止数据被误改后显示层静默失配。
  assert.ok(suspicious.length >= 3, '内置装备中应存在 100~499 区间的百分比装备');
});

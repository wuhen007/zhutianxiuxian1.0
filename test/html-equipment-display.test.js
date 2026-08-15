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
  assert.match(equipmentStats, /atk > 499 \|\| def > 499 \|\| HP > 499/);

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

test('百分比装备显示兼容两种数据格式：整数百分数值(100=100%) 与 小数(0.02=2%)', () => {
  for (const file of EQUIPMENT_HTML_FILES) {
    const html = read(file);
    const percentExprs = html.match(/\([\w$.\u4e00-\u9fa5]+\.(atk|def|HP)\*100\)\.toFixed\(0\)/g) || [];
    assert.equal(
      percentExprs.length,
      0,
      `${file} 存在未兼容双格式的百分比显示：${percentExprs.join(' | ')}`
    );
    const dualExprs = html.match(/\([\w$.\u4e00-\u9fa5]+\.(atk|def|HP)>=\s*1\?/g) || [];
    assert.ok(dualExprs.length > 0, `${file} 缺少整数/小数双格式兼容显示`);
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

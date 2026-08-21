import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { enrichNajieDisplayRarity } from '../model/najieRarity.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('丹药楼与纳戒显示道心、元神和心神效果', () => {
  for (const path of [
    '../resources/html/danyao/danyao.html',
    '../resources/html/najie/najie.html',
    '../resources/html/najie-category/najie-category.html',
  ]) {
    const html = read(path);
    assert.match(html, /item\.道心/);
    assert.match(html, /item\.yuanshen/);
    assert.match(html, /item\.heart/);
    assert.match(html, /item\.heartMax/);
    assert.match(html, /item\.potential/);
    assert.match(html, /item\.insight/);
    assert.match(html, /item\.额外数量/);
    assert.match(html, /item\.biguan/);
    assert.match(html, /item\.daoshang/);
  }
});

test('丹药楼会收录道具表中的丹药', () => {
  const source = read('../model/xiuxian.js');
  assert.match(source, /'newdanyao_list', 'daoju_list'/);
  assert.match(source, /if \(j\.class != '丹药'\) continue/);
});

test('普通服用道心果会写入玩家并扣除实际使用数量', () => {
  const source = read('../apps/User/UserHome.js');
  const start = source.indexOf("if (thing_exist.type == '道心')");
  const end = source.indexOf("if (thing_exist.type == '心神恢复')", start);
  const branch = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(branch, /applyDaoHeartFruit\(player, thing_exist, quantity\)/);
  assert.match(branch, /Write_player\(usr_qq, player\)/);
  assert.match(branch, /Add_najie_thing\(usr_qq, thing_name, '丹药', -result\.useCount\)/);
});

test('旧存档简化条目会补全道心/元神/心神效果字段', async () => {
  const DATA = {
    灵品道心果: { name: '灵品道心果', class: '丹药', type: '道心', 道心: 15, 稀有度: 6 },
    定神丹: { name: '定神丹', class: '丹药', type: '心神恢复', heart: 10, 稀有度: 7 },
    涅槃丹: { name: '涅槃丹', class: '丹药', type: '天药', yuanshen: 100000, 稀有度: 3 },
  };
  const resolveItem = async name => DATA[name] || null;
  const legacyNajie = {
    丹药: [
      { name: '灵品道心果', 数量: 5, desc: '服用后道心+15' },
      { name: '定神丹', 数量: 3 },
      { name: '涅槃丹', 数量: 2 },
      { name: '未知旧物品', 数量: 1 },
    ],
  };
  const result = await enrichNajieDisplayRarity(legacyNajie, resolveItem);
  const byName = Object.fromEntries(result.丹药.map(item => [item.name, item]));

  assert.equal(byName['灵品道心果'].道心, 15);
  assert.equal(byName['灵品道心果'].稀有度, 6);
  assert.equal(byName['定神丹'].heart, 10);
  assert.equal(byName['涅槃丹'].yuanshen, 100000);
  // 已有数值的条目不被覆盖，未知物品保持原样
  assert.equal(byName['未知旧物品'].数量, 1);
  assert.equal(byName['未知旧物品'].稀有度, 1);
});

test('纳戒富化不覆盖条目已有字段', async () => {
  const resolveItem = async () => ({ 道心: 100, heart: 50, 稀有度: 9 });
  const najie = { 丹药: [{ name: '圣品道心果', 道心: 40, 数量: 1 }] };
  const result = await enrichNajieDisplayRarity(najie, resolveItem);
  assert.equal(result.丹药[0].道心, 40);
  assert.equal(result.丹药[0].heart, 50);
});

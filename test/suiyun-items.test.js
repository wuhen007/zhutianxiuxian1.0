import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculateEquipmentSetBonuses } from '../model/equipmentStats.js';
import { applyExclusiveSetOpening, hasExclusiveEquipmentSet } from '../model/exclusiveEquipmentSets.js';
import { isItemPermanentlyNonTradeable, applyEquipmentTransfer } from '../model/equipmentTransfer.js';
import { extractArchiveItem, mergeArchiveItem } from '../model/backupSnapshot.js';
import { recruitDisciple } from '../model/sectDisciples.js';
import { applyTianjiaoImprovement } from '../model/tianjiaoGrowth.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const catalog = file => JSON.parse(read(`resources/data/item/${file}.json`));

test('岁云五阶数值与如梦本尊终阶相同，且排除随机获取', () => {
  const roots = catalog('灵根列表');
  const names = ['月华之体', '月华似剑', '霜月剑尊', '岁云化身', '岁云剑尊'];
  names.forEach((name, index) => {
    const root = roots.find(item => item.name === name);
    assert.equal(root.id, 7091001 + index);
    assert.equal(root.生命本源, [200, 600, 1800, 5400, 15000][index]);
    assert.equal(root.唯一灵根, true);
    assert.equal(root.不可随机获取, true);
  });
  const final = roots.find(item => item.name === '岁云剑尊');
  const dream = roots.find(item => item.name === '如梦本尊');
  for (const field of ['eff', '法球倍率', '攻击', '防御', '生命', '生命本源']) {
    assert.equal(final[field], dream[field]);
  }
});

test('残念与功法接入物品目录，唯一物品不进普通奖池', () => {
  const remnant = catalog('道具列表').find(item => item.name === '岁云的残念');
  assert.equal(remnant.全服唯一, true);
  assert.equal(remnant.不可支取, true);
  assert.equal(remnant.不可创造, 1);
  assert.equal(remnant.不可交易, true);
  const method = catalog('功法列表').find(item => item.name === '月华炼天功');
  assert.equal(method.class, '功法');
  assert.equal(method.type, '限定功法');
});

test('宗门随机弟子不抽取岁云唯一灵根', () => {
  const root = catalog('灵根列表').find(item => item.name === '月华之体');
  const result = recruitDisciple({}, { talentList: [root], random: () => 0 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'talent');
});

test('岁云套逐件基础属性与套装倍率均高于终焉套，限最终灵根激活', () => {
  const items = catalog('特殊装备列表');
  const equipment = {};
  for (const [slot, name, oldName] of [
    ['武器', '岁云剑', '【终焉】诸神黄昏'],
    ['护具', '岁云袍', '【终焉】神魔葬天衣'],
    ['法宝', '云月之莲', '【终焉】万劫归墟轮'],
  ]) {
    const item = items.find(entry => entry.name === name);
    const previous = items.find(entry => entry.name === oldName);
    assert.equal(item.岁云专属, true);
    assert.equal(item.不可随机获取, true);
    for (const field of ['atk', 'def', 'HP', 'bao']) assert.ok(item[field] > previous[field]);
    equipment[slot] = item;
  }
  const player = { 名号: '剑尊', 灵根: { name: '岁云剑尊' } };
  assert.equal(hasExclusiveEquipmentSet(player, equipment, '岁云剑尊套'), true);
  assert.deepEqual(calculateEquipmentSetBonuses(player, equipment), { 攻: 8, 防: 8, 血: 8 });
  const opening = applyExclusiveSetOpening(player, equipment);
  assert.equal(opening.setName, '岁云剑尊套');
  assert.equal(player.全伤害类型加成, 0.5);
  assert.equal(player.全类型减免, 0.3);
  assert.deepEqual(calculateEquipmentSetBonuses({ 灵根: { name: '岁云化身' } }, equipment), { 攻: 0, 防: 0, 血: 0 });
});

test('天骄随机搜刮排除岁云套但保留普通高阶装备', () => {
  const special = catalog('特殊装备列表').filter(item => item.套装 === '岁云剑尊套');
  const ordinary = { name: '普通古剑', type: '武器', atk: 1000000, def: 1000000, HP: 1000000 };
  const starter = { name: '旧剑', type: '武器', atk: 500, def: 500, HP: 500 };
  const npc = { 名号: '测试天骄', 装备: { 武器: starter }, level_id: 1, Physique_id: 1 };
  const context = {
    cultivationLevels: [], physiqueLevels: [], secretLevels: [], ancientLevels: [],
    equipmentList: [starter], specialEquipmentList: [...special, ordinary],
  };
  let rolls = [0, 0.99, 0];
  applyTianjiaoImprovement(npc, 'equipment', context, () => rolls.shift() ?? 0);
  assert.equal(npc.装备.武器.name, '普通古剑');
});

test('天阙枝永久绑定：即使老存档遗失标记也禁止赠送和归档支取', () => {
  const treasure = catalog('特殊装备列表').find(item => item.name === '无上天阙枝');
  assert.equal(treasure.大道至宝本体, true);
  assert.equal(treasure.全时间线唯一, true);
  assert.equal(treasure.不可支取, true);
  const legacy = { name: '无上天阙枝', 数量: 1, class: '装备', type: '至宝', islockd: 0, pinji: 6 };
  assert.equal(isItemPermanentlyNonTradeable(legacy), true);
  const source = { 装备: [structuredClone(legacy)] };
  const target = { 装备: [] };
  assert.throws(() => applyEquipmentTransfer(source, target, { name: legacy.name }, 1, 'other'), { code: 'transfer-forbidden' });
  assert.equal(extractArchiveItem({ najie: source }, '装备', legacy.name), null);
  assert.equal(mergeArchiveItem({ player: {}, najie: target }, { category: '装备', name: legacy.name, amount: 1, item: legacy }), false);
  assert.equal(source.装备[0].数量, 1);
  assert.equal(target.装备.length, 0);
  for (const name of ['岁云的残念', '岁云残念']) {
    assert.equal(extractArchiveItem({ najie: { 道具: [{ name, 数量: 1 }] } }, '道具', name), null);
  }
});

test('普通物品仍可从归档支取，绑定品上架入口与双秘境接线存在', () => {
  const item = { name: '普通材料', 数量: 2 };
  const entry = extractArchiveItem({ najie: { 材料: [item] } }, '材料', item.name);
  const najie = {};
  assert.equal(mergeArchiveItem({ player: {}, najie }, entry), true);
  assert.equal(najie.材料[0].数量, 2);
  assert.match(read('apps/Exchange/Exchange.js'), /isItemPermanentlyNonTradeable\(thing_exist\)/);
  assert.match(read('apps/Auction/Auction.js'), /isItemTransferRestricted\(thing_data\)/);
  for (const file of ['SecretPlaceTask.js', 'SecretPlaceplusTask.js']) {
    const code = read(`apps/SecretPlace/${file}`);
    assert.match(code, /rollAndGrantSuiyunRemnant/);
    assert.match(code, /'岁云的残念', '道具', 1, undefined, undefined, \{ idempotencyKey \}/);
    assert.match(code, /getInnateDungeonRewardMultiplier\(player\) \* getSuiyunEffects\(player\)\.lootMultiplier/);
  }
  assert.match(read('apps/User/UserHome.js'), /"岁云": 9/);
  assert.match(read('apps/User/zhengdaotixi.js'), /"岁云": 9/);
  assert.match(read('apps/User/Superdimensional.js'), /root\.唯一灵根 \|\| root\.不可随机获取/);
  assert.match(read('apps/User/InnateTreasureAuthorities.js'), /!item\.全服唯一 && !item\.全时间线唯一/);
});

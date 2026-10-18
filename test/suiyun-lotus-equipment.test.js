import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { calculateEquippedStats, calculateEquipmentSetBonuses } from '../model/equipmentStats.js';
import { getSuiyunLotusBonus } from '../model/suiyun.js';
import { createDaoTreasureItem, isDaoTreasureItem } from '../model/daoTreasure.js';

const copy = value => structuredClone(value);
const statFields = ['攻击', '防御', '血量上限'];
const root = { name: '岁云剑尊', type: '岁云', 攻击: 5000, 防御: 5000, 生命: 5000 };
const equipment = {
  武器: { name: '岁云剑', atk: 640000000, def: 320000000, HP: 520000000 },
  护具: { name: '岁云袍', atk: 380000000, def: 680000000, HP: 780000000 },
  法宝: { name: '云月之莲', atk: 540000000, def: 500000000, HP: 660000000, pinji: 6 },
};

// Execute the complete production equipment rebuild, with file/registry IO replaced.
// Formula helpers remain real; the fake relic doubles stats to catch wrong placement.
function fixture(initialEquipment = equipment, initialRoot = root) {
  const state = {
    player: {
      id: 'lotus-fixture', level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1,
      灵根: copy(initialRoot), 岁云: { 累计炼化月华: 0 }, 月华值: 0, 当前血量: 1000,
    },
    equipment: copy(initialEquipment), savedEquipment: null,
  };
  const zero = { 攻击: 0, 防御: 0, 血量: 0, 全属性加成: 0, 暴击率加成: 0 };
  const realm = [{ level_id: 1, 基础攻击: 100, 基础防御: 200, 基础血量: 300, 基础暴击: 0 }];
  const dependencies = {
    path, __PATH: { equipment_path: '/fixture-equipment' },
    assertGlobalInitIdle() {}, assertTribulationWriteAllowed: async () => {},
    withPlayerMutationLock: async (_id, action) => action(),
    Read_player: async () => copy(state.player),
    Write_player: async (_id, player) => { state.player = copy(player); },
    Add_HP: async () => {}, invalidateBattleEquipmentCache() {},
    writeJsonAtomically: (_path, value) => { state.savedEquipment = copy(value); },
    normalizeEquipment: value => Object.fromEntries(['武器', '护具', '法宝', '帝兵', '至宝'].map(slot => [slot, {
      name: '', atk: 0, def: 0, HP: 0, bao: 0, 全属性: 0, ...copy(value[slot] || {}),
    }])),
    getInnateTreasureProjectionName: () => '', isInnateTreasureName: () => false,
    isDaoTreasureItem, createOtherShoreDaoTreasureRuntime: () => null,
    updateEquippedInnateTreasure() {}, ensureExtraCultivationState() {}, ensureFlowerPollenState() {},
    calculateExtraAttributeLimit: () => ({ total: 1e15 }),
    calculateXianguExtremeBonus: () => zero, calculateFlowerExtremeBonus: () => zero,
    getFlowerPathAttributeMultiplier: () => 1, calculateFlowerFieldBonus: () => zero,
    data: { Level_list: realm, LevelMax_list: realm, Levelmijing_list: realm, xiangujinshi_list: realm, huafen_list: realm, minggeList: [] },
    getMinggeEffects: () => ({}), calculateMinggeFourRealmBonus: () => zero,
    calculateEquippedStats, calculateEquipmentSetBonuses, getSuiyunLotusBonus,
    hasEquippedInnateTreasure: () => false, getPetAbilityBonus: () => 0,
    DAO_TREASURE_ALL_ATTRIBUTE_BONUS: 300, readXianguRate: () => 0, XIANGU_COMBAT_RATE_KEYS: {},
    getRealmAuthorityLevel: () => 0,
    applyRelicEffectsToPlayer: player => { for (const field of statFields) player[field] *= 2; },
  };
  const source = readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = source.indexOf('export async function Write_equipment(');
  const end = source.indexOf('\nexport async function Write_linggen(', start);
  const rebuild = new Function(...Object.keys(dependencies),
    `${source.slice(start, end).replace('export ', '')}; return Write_equipment;`)(...Object.values(dependencies));
  state.rebuild = () => rebuild(state.player.id, state.equipment);
  return state;
}

test('完整装备重算在所有乘区之后最终加算莲成长，不改器物atk/def/HP且重复重算不叠加', async () => {
  const f = fixture();
  await f.rebuild();
  const before = copy(f.player);
  const itemBefore = copy(f.savedEquipment.法宝);
  f.player.岁云.累计炼化月华 = 100;
  await f.rebuild();
  for (const field of statFields) assert.equal(f.player[field] - before[field], 20000000, field);
  assert.deepEqual(f.savedEquipment.法宝, itemBefore);
  const grown = copy(f.player);
  await f.rebuild();
  for (const field of statFields) assert.equal(f.player[field], grown[field], field);
  f.player.月华值 = 0;
  await f.rebuild();
  for (const field of statFields) assert.equal(f.player[field], grown[field], '兑换可用余额不缩减已成长属性');
});

test('真实装备重算同步器名但保留大道真名、主权柄与全部属性，卸下后清理器名缓存', async () => {
  const item = createDaoTreasureItem({ name: '诸天文明炉', ownerId: 'lotus-fixture', integrity: 100 });
  const f = fixture({ ...equipment, 至宝: item });
  await f.rebuild();
  const before = copy(f.player);
  f.player.大道主权柄 = '世界';
  f.equipment.至宝.自定义名称 = '岁月青枝';
  await f.rebuild();
  assert.equal(f.player.当前大道至宝, '诸天文明炉');
  assert.equal(f.player.大道至宝器名, '岁月青枝');
  assert.equal(f.player.大道主权柄, '世界');
  for (const field of statFields) assert.equal(f.player[field], before[field]);
  f.equipment.至宝 = {};
  await f.rebuild();
  assert.equal(f.player.大道至宝器名, '');
  assert.equal(f.player.当前大道至宝, '');
});

test('余额、未装备与其他灵根不提供莲成长，卸下之后重算移除增幅', async () => {
  for (const [items, physique] of [
    [{ ...equipment, 法宝: { ...equipment.法宝, name: '普通法宝' } }, root],
    [equipment, { name: '普通灵根', type: '普通' }],
  ]) {
    const f = fixture(items, physique);
    await f.rebuild();
    const before = copy(f.player);
    f.player.岁云.累计炼化月华 = 10000;
    f.player.月华值 = 1e9;
    await f.rebuild();
    for (const field of statFields) assert.equal(f.player[field], before[field]);
  }
  const f = fixture();
  f.player.岁云.累计炼化月华 = 100;
  await f.rebuild();
  f.equipment.法宝 = { ...f.equipment.法宝, name: '普通法宝' };
  await f.rebuild();
  const withoutLotus = copy(f.player);
  f.player.岁云.累计炼化月华 = 0;
  await f.rebuild();
  for (const field of statFields) assert.equal(f.player[field], withoutLotus[field]);
});

test('不同品质莲的累计成长差值相同，日修炼余额不进入成长统计', async () => {
  for (const quality of [0, 6]) {
    const f = fixture({ ...equipment, 法宝: { ...equipment.法宝, pinji: quality } });
    f.player.月华值 = 1000000;
    await f.rebuild();
    const before = copy(f.player);
    f.player.岁云.累计炼化月华 = 250;
    await f.rebuild();
    for (const field of statFields) assert.equal(f.player[field] - before[field], 50000000);
  }
});

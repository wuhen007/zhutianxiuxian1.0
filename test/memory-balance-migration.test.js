import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import { createMemoryRoot, normalizeMemoryPlayer, getMemoryStage, getMemoryLifeMaximum, MEMORY_FACTORS } from '../model/memoryPath.js';
import { calculateEquippedStats, calculateEquipmentSetBonuses } from '../model/equipmentStats.js';
import { getActiveZhutianAvatarName } from '../model/zhutianMirror.js';
import { getLifeSourceRepairMaximum } from '../model/lifeSourceRepair.js';
import { findTalentSynchronizationMatch } from '../model/talentSynchronization.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { markZhutianMirrorSnapshot, assertZhutianMirrorWriteCurrent, assertZhutianAvatarRootWriteAllowed } from '../utils/zhutianMirrorVersion.js';

const source = readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const part = (start, end) => {
  const offset = source.indexOf(start);
  const limit = source.indexOf(end, offset + start.length);
  assert.ok(offset >= 0 && limit > offset, start);
  return source.slice(offset, limit).replace(/^export /gm, '');
};
const clone = value => structuredClone(value);
const legacyRoot = () => ({ ...createMemoryRoot(4), id: 7092005, name: '星神·记忆', 攻击: 5000, 防御: 5000, 生命: 5000, 生命本源: 5400, eff: 30000, 法球倍率: 1000 });
const legacyPlayer = () => ({
  id: 'memory-fixture', 灵根: legacyRoot(), 天资等级: '星神之资', 天资评价: '旧专属天资',
  level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1,
  攻击: 500100, 防御: 250050, 血量上限: 2500500, 当前血量: 80000,
  生命本源: 7800, 修炼效率提升: 30004, 记忆命途: { 因子: Object.fromEntries(MEMORY_FACTORS.map(name => [name, 3])) },
  学习的功法: ['六相冰封', '普通心法'], 记忆棱镜: 12345, 记忆碎片: 1.25,
});

function runtime(input = legacyPlayer(), { noEquipment = false, allowWrites = false } = {}) {
  let stored = clone(input);
  const counters = { playerReads: 0, equipmentReads: 0, writes: 0, locks: 0, registryWrites: 0 };
  const zero = () => ({ 攻击: 0, 防御: 0, 血量: 0 });
  const level = [{ level_id: 1, 基础攻击: 20, 基础防御: 10, 基础血量: 100, 基础暴击: 0 }];
  const unexpectedWrite = () => { counters.writes++; throw new Error('unexpected write during read'); };
  const savePlayer = (_id, player) => {
    assertZhutianMirrorWriteCurrent(stored, player);
    assertZhutianAvatarRootWriteAllowed(stored, player);
    stored = clone(player);
    counters.writes++;
  };
  const dependencies = {
    path, console: { log() {}, error() {}, warn() {} }, normalizeMemoryPlayer, markZhutianMirrorSnapshot,
    __PATH: { player_path: '/memory-fixture/player', equipment_path: '/memory-fixture/equipment', najie_path: '/memory-fixture/najie', danyao_path: '/memory-fixture/danyao' },
    fs: {
      existsSync: file => !noEquipment || !String(file).includes('equipment'),
      readFileSync: file => {
        if (String(file).includes('equipment')) { counters.equipmentReads++; return '{}'; }
        counters.playerReads++;
        if (counters.playerReads > 5) throw new Error('recursive player read');
        return JSON.stringify(stored);
      },
      writeFileSync: unexpectedWrite,
      readdirSync: () => ['memory-fixture.json'],
    },
    data: {
      Level_list: level, LevelMax_list: level, Levelmijing_list: level, xiangujinshi_list: level, huafen_list: level,
      minggeList: [], jineng1: [], jineng2: [], jineng3: [], jineng_heal: [],
      gongfa_list: [{ name: '普通心法', 修炼加成: 4 }], timegongfa_list: [], dijingList: [],
      setData: (_kind, id, player) => savePlayer(id, player),
      getData: async () => markZhutianMirrorSnapshot(clone(stored)),
      talent_list: [1, 2, 3, 4].map(createMemoryRoot), yincang: [], dibing_list: [],
    },
    getLocationName: () => '', PLACE_LOCATION_MAP: {}, normalizeLocationList: list => list,
    ensureGongfaProficiency() {}, ensureGongfaDailyGain() {}, ensureCombatSkillLoadout() {},
    ensureForbiddenState() {}, ensureWanhuaBannerState() {}, isTianmoHuashengPhysique: () => false,
    ensureExtraCultivationState() {}, ensureFlowerPollenState() {}, ensureDefaultCoordinates() {}, syncSuiyunLuckyBonus() {},
    getForbiddenCultivationMultiplier: () => 1,
    markTribulationSnapshot: (_id, player) => player,
    migrateLegacyInnateTreasureSlot: equipment => equipment, normalizeRelicState: item => item || {},
    getInnateTreasureProjectionName: () => '', isInnateTreasureName: () => false, isDaoTreasureItem: () => false,
    updateEquippedInnateTreasure: () => { counters.registryWrites++; },
    calculateExtraAttributeLimit: () => ({ total: 1000 }), calculateXianguExtremeBonus: zero,
    calculateFlowerExtremeBonus: zero, getFlowerPathAttributeMultiplier: () => 1, calculateFlowerFieldBonus: zero,
    getMinggeEffects: () => ({}), calculateMinggeFourRealmBonus: zero,
    calculateEquippedStats, calculateEquipmentSetBonuses, hasEquippedInnateTreasure: () => false,
    DAO_TREASURE_ALL_ATTRIBUTE_BONUS: 0, getPetAbilityBonus: () => 0,
    readXianguRate: () => 0, XIANGU_COMBAT_RATE_KEYS: {}, getRealmAuthorityLevel: () => 0,
    applyRelicEffectsToPlayer() {}, getSuiyunLotusBonus: () => ({ active: false }),
    assertGlobalInitIdle: allowWrites ? () => {} : unexpectedWrite,
    assertTribulationWriteAllowed: allowWrites ? () => {} : unexpectedWrite,
    Write_player: allowWrites ? savePlayer : unexpectedWrite,
    Add_HP: allowWrites ? () => {} : unexpectedWrite,
    writeJsonAtomically: allowWrites ? () => { counters.writes++; } : unexpectedWrite,
    invalidateBattleEquipmentCache: allowWrites ? () => {} : unexpectedWrite,
    withPlayerMutationLock: (id, task) => { counters.locks++; return withPlayerMutationLock(id, task); },
    isNotNull: Boolean, Read_danyao: async () => ({ biguanxl: 0 }),
    config: { getConfig: () => ({ Master: [] }) },
    FileRollbackTransaction: class { capture() {} commit() {} rollback() { stored = clone(input); } },
    getActiveZhutianAvatarName, findTalentSynchronizationMatch, getMemoryStage, getLifeSourceRepairMaximum,
    getSuiyunEffects: () => ({}), Read_najie: async () => ({}), Write_najie: async () => {}, rebuildPlayerLucky() {},
  };
  const code = [
    part('export async function Read_player(', 'export async function LevelTask('),
    part('function normalizeEquipmentSlot(', 'const TB_EQUIPMENT_CACHE_TTL_MS'),
    part('export async function Read_equipment(', 'function readXianguRate('),
    part('export async function Write_equipment(', 'export async function Write_linggen('),
    part('export async function player_efficiency(', '//修改纳戒物品锁定状态'),
    part('export function normalizeBattleOrbMultiplier(', 'export function healBattleUnitByCurrentRatio('),
    part('export async function synchronization(', 'export async function channel('),
    '({Read_player, Write_equipment, player_efficiency, normalizeBattleOrbMultiplier, synchronization})',
  ].join('\n');
  const api = vm.runInNewContext(code, dependencies);
  return { api, counters, stored: () => stored };
}

test('旧星神读取即时重算战斗、本源及修炼值，不写盘不获写锁且不递归', async () => {
  const f = runtime();
  const player = await f.api.Read_player('memory-fixture');
  assert.equal(player.灵根.name, '无漏净子');
  assert.equal(player.天资等级, '平庸之资');
  assert.deepEqual([player.攻击, player.防御, player.血量上限, player.当前血量], [1100, 550, 5500, 5500]);
  assert.equal(player.生命本源, 740);
  assert.equal(player.修炼效率提升, 3004);
  assert.equal(player.记忆棱镜, 12345);
  assert.equal(player.记忆碎片, 1.25);
  assert.equal(f.stored().灵根.name, '星神·记忆');
  assert.deepEqual(f.counters, { playerReads: 1, equipmentReads: 1, writes: 0, locks: 0, registryWrites: 0 });
});

test('缺装备文件使用空装备只读重算，重复读档结果稳定', async () => {
  const f = runtime(legacyPlayer(), { noEquipment: true });
  const first = await f.api.Read_player('memory-fixture');
  const second = await f.api.Read_player('memory-fixture');
  assert.equal(first.攻击, second.攻击);
  assert.equal(first.生命本源, second.生命本源);
  assert.equal(f.counters.equipmentReads, 0);
  assert.equal(f.counters.writes, 0);
});

test('旧前四阶规范到削弱数值，保存后的二次规范幂等且保持受损本源', () => {
  for (const [stage, oldStats, oldLife] of [[1, 2, 250], [2, 10, 600], [3, 50, 1200], [4, 500, 2400]]) {
    const player = { 灵根: { ...createMemoryRoot(stage), 攻击: oldStats, 防御: oldStats, 生命: oldStats, 生命本源: oldLife }, 生命本源: 10, 记忆命途: { 因子: { 门径: 1, 理性: 3 } } };
    assert.equal(normalizeMemoryPlayer(player), true);
    assert.deepEqual(player.灵根, createMemoryRoot(stage));
    assert.equal(player.生命本源, 10);
    assert.equal(normalizeMemoryPlayer(player), false);
  }
});

test('装载化身时旧本源规范不影响当前战力、隐藏根身份和镜版本写保护', async () => {
  const previous = { ...legacyPlayer(), 灵根: { name: '门矢士', type: '假面驾驭', 攻击: 1, eff: 2 }, 隐藏灵根: legacyRoot(), 诸天镜系统: { 当前化身: '门矢士', 状态版本: 3, 本源灵根: legacyRoot() } };
  const f = runtime(previous);
  const player = await f.api.Read_player('memory-fixture');
  assert.equal(player.诸天镜系统.本源灵根.name, '无漏净子');
  assert.equal(player.隐藏灵根.name, '星神·记忆');
  assert.equal(player.灵根.name, '门矢士');
  assert.equal(player.攻击, previous.攻击);
  assert.equal(f.counters.equipmentReads, 0);
  assert.doesNotThrow(() => assertZhutianMirrorWriteCurrent(previous, player));
  assert.doesNotThrow(() => assertZhutianAvatarRootWriteAllowed(previous, player));
  assert.throws(() => assertZhutianMirrorWriteCurrent({ ...previous, 诸天镜系统: { ...previous.诸天镜系统, 状态版本: 4 } }, player), { code: 'ZHUTIAN_MIRROR_STALE_WRITE' });
});

test('旧顶层法球缓存随旧星神降档，进入真实战斗归一化后不残留1000倍', async () => {
  const f = runtime({ ...legacyPlayer(), 法球倍率: 1000 });
  const player = await f.api.Read_player('memory-fixture');
  assert.equal(f.api.normalizeBattleOrbMultiplier(player), 100);
  const other = runtime({ ...legacyPlayer(), 法球倍率: 777 });
  assert.equal((await other.api.Read_player('memory-fixture')).法球倍率, 777);
});

test('显式修炼效率更新使用迁移快照并正常持锁写档，保留停用功法记录', async () => {
  const f = runtime();
  await f.api.player_efficiency('memory-fixture');
  assert.equal(f.counters.writes, 1);
  assert.equal(f.counters.locks, 1);
  assert.equal(f.stored().灵根.name, '无漏净子');
  assert.equal(f.stored().修炼效率提升, 3004);
  assert.deepEqual(f.stored().学习的功法, ['六相冰封', '普通心法']);
  assert.equal(f.stored().生命本源, getMemoryLifeMaximum(f.stored()));
});

test('一键同步真实方法规范旧星神后同时重算战斗值和修炼效率', async () => {
  const f = runtime(legacyPlayer(), { allowWrites: true });
  const result = await f.api.synchronization({ user_id: 'fixture-admin', isMaster: true });
  assert.equal(result.failed, 0, JSON.stringify(result.errors));
  assert.equal(result.succeeded, 1);
  assert.equal(f.stored().灵根.name, '无漏净子');
  assert.equal(f.stored().攻击, 1100);
  assert.equal(f.stored().修炼效率提升, 3004);
});

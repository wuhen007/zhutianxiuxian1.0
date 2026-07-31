import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPlayerPlaneName } from './planeCoords.js';

export const INNATE_TREASURE_NAMES = Object.freeze([
  '混沌珠',
  '太极图',
  '盘古幡',
  '诛仙四剑',
  '山河社稷图',
  '天地玄黄玲珑塔',
  '东皇钟',
  '混沌钟',
  '六道轮回盘',
  '炼妖壶',
  '崆峒印',
]);

export const AUTHORITY_COOLDOWNS = Object.freeze({
  混沌复制: 12 * 60 * 60 * 1000,
  混沌演化: 24 * 60 * 60 * 1000,
  混沌变幻: 6 * 60 * 60 * 1000,
  炼妖融合: 30 * 24 * 60 * 60 * 1000,
  玄黄护道: 24 * 60 * 60 * 1000,
  图中巡游: 72 * 60 * 60 * 1000,
  收摄山河: 72 * 60 * 60 * 1000,
  开天: 6 * 60 * 60 * 1000,
  诛仙剑阵: 24 * 60 * 60 * 1000,
  东皇镇世: 24 * 60 * 60 * 1000,
  截断岁月: 7 * 24 * 60 * 60 * 1000,
  人皇敕令: 7 * 24 * 60 * 60 * 1000,
  执掌轮回: 24 * 60 * 60 * 1000,
  阴阳逆转: 24 * 60 * 60 * 1000,
});

export const INNATE_TREASURE_PROJECTION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const TREASURE_SET = new Set(INNATE_TREASURE_NAMES);
const STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'data',
  'innate_treasure_state.json'
);

function defaultState() {
  return { owners: {}, equipped: {}, decree: null, landscapeRealms: [] };
}

export function readInnateTreasureState() {
  try {
    if (!fs.existsSync(STATE_FILE)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
  } catch (error) {
    console.error('[先天至宝] 读取全局状态失败:', error.message);
    return defaultState();
  }
}

export function writeInnateTreasureState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function isInnateTreasureName(name) {
  return TREASURE_SET.has(String(name || ''));
}

export function createInnateTreasure(name, ownerId, now = Date.now()) {
  if (!isInnateTreasureName(name)) throw new Error(`未知先天至宝：${name}`);
  return {
    id: 29000000 + INNATE_TREASURE_NAMES.indexOf(name) + 1,
    name,
    class: '装备',
    type: '帝兵',
    品阶: '先天至宝',
    author_name: String(ownerId),
    atk: 100000000,
    def: 100000000,
    HP: 100000000,
    全属性: 100,
    bao: 1,
    出售价: 0,
    绑定者: String(ownerId),
    认主时间: now,
    pinji: 6,
    数量: 1,
    islockd: 1,
  };
}

export function createInnateTreasureProjection(name, ownerId, now = Date.now()) {
  if (!isInnateTreasureName(name)) throw new Error(`未知先天至宝：${name}`);
  return {
    id: 29100000 + INNATE_TREASURE_NAMES.indexOf(name) + 1,
    name: `${name}·七日投影`,
    class: '装备',
    type: '帝兵',
    品阶: '先天投影',
    先天至宝本体: name,
    先天投影截止: now + INNATE_TREASURE_PROJECTION_DURATION_MS,
    author_name: String(ownerId),
    atk: 0,
    def: 0,
    HP: 0,
    全属性: 0,
    bao: 1,
    出售价: 0,
    绑定者: String(ownerId),
    认主时间: now,
    pinji: 6,
    数量: 1,
    islockd: 1,
  };
}

export function getInnateTreasureProjectionName(item) {
  if (!item?.先天至宝本体 || !isInnateTreasureName(item.先天至宝本体)) return '';
  if (Number(item.先天投影截止) <= Date.now()) return '';
  return item.先天至宝本体;
}

export function claimInnateTreasure(name, ownerId, now = Date.now()) {
  const state = readInnateTreasureState();
  if (state.owners[name]) return { ok: false, ownerId: state.owners[name].ownerId };
  state.owners[name] = { ownerId: String(ownerId), claimedAt: now };
  writeInnateTreasureState(state);
  return { ok: true };
}

export function releaseInnateTreasure(name, ownerId) {
  const state = readInnateTreasureState();
  if (state.owners[name]?.ownerId !== String(ownerId)) return false;
  delete state.owners[name];
  delete state.equipped[name];
  writeInnateTreasureState(state);
  return true;
}

export function updateEquippedInnateTreasure(ownerId, treasureName, sectName = '') {
  const state = readInnateTreasureState();
  for (const [name, record] of Object.entries(state.equipped)) {
    if (record.ownerId === String(ownerId) && name !== treasureName) delete state.equipped[name];
  }
  if (isInnateTreasureName(treasureName)) {
    state.equipped[treasureName] = {
      ownerId: String(ownerId),
      sectName: String(sectName || ''),
      equippedAt: Date.now(),
    };
  }
  writeInnateTreasureState(state);
}

export function hasEquippedInnateTreasure(player, name) {
  return player?.当前先天至宝 === name;
}

export function getAuthorityState(player) {
  if (!player.先天权柄 || typeof player.先天权柄 !== 'object') player.先天权柄 = {};
  if (!player.先天权柄.冷却 || typeof player.先天权柄.冷却 !== 'object') {
    player.先天权柄.冷却 = {};
  }
  return player.先天权柄;
}

export function getCooldownRemaining(player, key, now = Date.now()) {
  const expiresAt = Number(player?.先天权柄?.冷却?.[key]) || 0;
  return Math.max(0, expiresAt - now);
}

export function startAuthorityCooldown(player, key, now = Date.now()) {
  const duration = AUTHORITY_COOLDOWNS[key];
  if (!duration) throw new Error(`未知权柄冷却：${key}`);
  getAuthorityState(player).冷却[key] = now + duration;
  return now + duration;
}

export function getTimedActionMultiplier(player) {
  if (hasEquippedInnateTreasure(player, '混沌钟')) return 0.7;
  if (hasEquippedInnateTreasure(player, '东皇钟')) return 0.8;
  return 1;
}

export function getPetTreasureRules(player) {
  if (!hasEquippedInnateTreasure(player, '炼妖壶')) {
    return { requiredMinutes: null, maxMinutes: null, rewardMultiplier: 1 };
  }
  return { requiredMinutes: 60, maxMinutes: 24 * 60, rewardMultiplier: 2 };
}

export function getPetAbilityBonus(pet, type) {
  const nativeBonus = pet?.type === type ? Number(pet?.加成) || 0 : 0;
  const inherited = pet?.炼妖继承能力;
  const inheritedBonus = inherited?.type === type ? Number(inherited?.加成) || 0 : 0;
  return nativeBonus + inheritedBonus;
}

export function getSmallWorldYieldMultiplier(player) {
  return hasEquippedInnateTreasure(player, '山河社稷图') ? 2 : 1;
}

export function getHabitatSlotBonus(player) {
  return hasEquippedInnateTreasure(player, '山河社稷图') ? 2 : 0;
}

export function getInnerWorldOpenChance(baseChance, player) {
  const chance = Math.min(1, Math.max(0, Number(baseChance) || 0));
  if (!hasEquippedInnateTreasure(player, '天地玄黄玲珑塔')) return chance;
  const guarded = player?.先天权柄?.玄黄护道待用 === true;
  return guarded ? 1 - (1 - chance) * 0.7 : chance;
}

export function consumeXuanhuangGuard(player) {
  if (!player?.先天权柄?.玄黄护道待用) return false;
  delete player.先天权柄.玄黄护道待用;
  return true;
}

export function getInnerWorldYieldMultiplier(player) {
  return hasEquippedInnateTreasure(player, '崆峒印') ? 1.3 : 1;
}

export function getTribulationDamageMultiplier(player) {
  return hasEquippedInnateTreasure(player, '天地玄黄玲珑塔') &&
    player?.先天权柄?.玄黄护道待用 === true
    ? 0.7
    : 1;
}

export function hasReincarnationProtection(player, now = Date.now()) {
  return hasEquippedInnateTreasure(player, '六道轮回盘') ||
    Number(player?.先天权柄?.轮回庇护截止) > now;
}

export function getKongtongModifiers(player, now = Date.now()) {
  const state = readInnateTreasureState();
  const owner = state.equipped?.['崆峒印'];
  const sectName = String(player?.宗门?.宗门名称 || '');
  const ownerOrSect = Boolean(owner) && (
    owner.ownerId === String(player?.id || '') ||
    (sectName && owner.sectName === sectName)
  );
  const decree = state.decree && Number(state.decree.expiresAt) > now ? state.decree : null;
  return {
    cultivationMultiplier: ownerOrSect ? 2 : 1,
    decree,
  };
}

export function getInnateDungeonRewardMultiplier(player, now = Date.now()) {
  const state = readInnateTreasureState();
  const decree = state.decree && Number(state.decree.expiresAt) > now
    ? state.decree
    : null;
  let multiplier = 1;
  if (decree?.type === '历练' && decree.plane === getPlayerPlaneName(player)) multiplier *= 2;
  if (player?.先天权柄?.盘古开天待用 === true) multiplier *= 2;
  return multiplier;
}

export function setKongtongDecree(ownerId, plane, type, now = Date.now()) {
  const state = readInnateTreasureState();
  state.decree = {
    ownerId: String(ownerId),
    plane,
    type,
    startedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    borrowedQqs: [],
  };
  writeInnateTreasureState(state);
  return state.decree;
}

export function claimKongtongBorrow(qq, now = Date.now()) {
  const state = readInnateTreasureState();
  const decree = state.decree;
  if (!decree || decree.type !== '修炼' || Number(decree.expiresAt) <= now) {
    return { ok: false, reason: 'inactive' };
  }
  if (!Array.isArray(decree.borrowedQqs)) decree.borrowedQqs = [];
  if (decree.borrowedQqs.includes(String(qq))) return { ok: false, reason: 'claimed' };
  decree.borrowedQqs.push(String(qq));
  writeInnateTreasureState(state);
  return { ok: true, decree };
}

export function formatCooldown(ms) {
  const minutes = Math.ceil(Math.max(0, ms) / 60000);
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `${hours}小时`;
  return `${Math.ceil(hours / 24)}天`;
}

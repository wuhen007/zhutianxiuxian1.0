import { getRealmAuthorityLevel, getRealmAuthorityPath } from '../../model/realmAuthority.js';
import { getFlowerDaoGateState } from '../../model/flowerPollenPath.js';
import { getSuiyunEffects } from '../../model/suiyun.js';
import { getMemoryEffects } from '../../model/memoryPath.js';

export const DAO_PATH_VERSION = 2;
export const DAO_DAILY_LIMIT = 3;

export const DAO_REALM_RULES = Object.freeze([
  Object.freeze({
    realmId: 11,
    key: 'kingDao',
    name: '王者道则',
    targetExp: 600,
    baseGain: 20,
    lifespanCost: 200000,
    yuanshenLevel: 2,
    completion: '己道初立',
    nextRealm: '圣人',
  }),
  Object.freeze({
    realmId: 12,
    key: 'saintDao',
    name: '圣道法则',
    targetExp: 1200,
    baseGain: 40,
    lifespanCost: 5000000,
    yuanshenLevel: 3,
    completion: '圣域成形',
    nextRealm: '圣人王',
  }),
  Object.freeze({
    realmId: 13,
    key: 'saintKingDao',
    name: '圣王法则',
    targetExp: 2400,
    baseGain: 80,
    lifespanCost: 10000000,
    yuanshenLevel: 4,
    completion: '秩序成链',
    nextRealm: '大圣',
  }),
  Object.freeze({
    realmId: 14,
    key: 'greatSaintDao',
    name: '大圣法则',
    targetExp: 4800,
    baseGain: 160,
    lifespanCost: 20000000,
    yuanshenLevel: 5,
    completion: '大圣道果',
    nextRealm: '准帝',
  }),
  Object.freeze({
    realmId: 15,
    key: 'quasiEmperorDao',
    name: '准帝法则',
    targetExp: 9600,
    baseGain: 320,
    lifespanCost: 150000000,
    yuanshenLevel: 6,
    completion: '皇道雏形',
    nextRealm: '大帝',
  }),
  Object.freeze({
    realmId: 17,
    key: 'redDustImmortalDao',
    name: '红尘仙道',
    targetExp: 19200,
    baseGain: 640,
    lifespanCost: 300000000,
    yuanshenLevel: 8,
    completion: '不朽仙道',
    nextRealm: '仙王',
  }),
  Object.freeze({
    realmId: 18,
    key: 'immortalKingDao',
    name: '仙王道则',
    targetExp: 38400,
    baseGain: 1280,
    lifespanCost: 600000000,
    yuanshenLevel: 9,
    completion: '王境道果',
    nextRealm: '仙王巨头',
  }),
  Object.freeze({
    realmId: 19,
    key: 'giantDaoPrototype',
    name: '诸天道则',
    targetExp: 76800,
    baseGain: 2560,
    lifespanCost: 1200000000,
    yuanshenLevel: 10,
    completion: '体系雏形',
    nextRealm: '合道开创修炼体系',
  }),
]);

// 仙古今世法的悟道阶段独立于遮天道途，避免两个体系共用同名法则或进度。
export const XIANGU_DAO_REALM_RULES = Object.freeze([
  Object.freeze({ realmId: 9, key: 'trueGodLaw', name: '真神法则', targetExp: 600, baseGain: 20, lifespanCost: 200000, yuanshenLevel: 2, completion: '真神道果', nextRealm: '圣祭境' }),
  Object.freeze({ realmId: 10, key: 'godKingPrinciple', name: '神王道则', targetExp: 1200, baseGain: 40, lifespanCost: 200000, yuanshenLevel: 2, completion: '神王道果', nextRealm: '天神境' }),
  Object.freeze({ realmId: 11, key: 'heavenlyRule', name: '天规', targetExp: 2400, baseGain: 80, lifespanCost: 200000, yuanshenLevel: 3, completion: '天规初立', nextRealm: '虚道境' }),
  Object.freeze({ realmId: 12, key: 'mysteriousVoid', name: '玄虚', targetExp: 4800, baseGain: 160, lifespanCost: 200000, yuanshenLevel: 4, completion: '玄虚道果', nextRealm: '斩我境' }),
  Object.freeze({ realmId: 13, key: 'onlySelf', name: '唯我', targetExp: 9600, baseGain: 320, lifespanCost: 200000, yuanshenLevel: 5, completion: '真我独尊', nextRealm: '遁一境' }),
  Object.freeze({ realmId: 14, key: 'originReturn', name: '归元', targetExp: 19200, baseGain: 640, lifespanCost: 200000, yuanshenLevel: 6, completion: '万法归元', nextRealm: '至尊境' }),
  Object.freeze({ realmId: 15, key: 'supreme', name: '无上', targetExp: 38400, baseGain: 1280, lifespanCost: 200000, yuanshenLevel: 7, completion: '无上道果', nextRealm: '真仙境' }),
  Object.freeze({ realmId: 20, key: 'emperorLightPrototype', name: '诸天古则', targetExp: 76800, baseGain: 2560, lifespanCost: 1200000000, yuanshenLevel: 10, completion: '体系雏形', nextRealm: '合道开创修炼体系' }),
]);

export const XIANGU_DAO_PATH_VERSION = 1;

/**
 * 悟道资源成本。两套体系共用玩家身上的秘境等级与仙古等级，按合计等级计费。
 * 修为、血气的“次方”按平方处理，避免把“次方”误解为线性加成。
 */
export function getWudaoResourceCosts(mijingLevel, xianguLevel) {
  const mijing = Math.max(0, Math.trunc(Number(mijingLevel) || 0));
  const xiangu = Math.max(0, Math.trunc(Number(xianguLevel) || 0));
  const levelSum = mijing + xiangu;
  return {
    mijing,
    xiangu,
    levelSum,
    potential: levelSum * 100,
    cultivation: 2000000 * levelSum ** 2,
    blood: 2000000 * levelSum ** 2,
    lifespan: 200000 * levelSum,
    spirit: 10000000 * levelSum,
  };
}

const PHYSIQUE_BONUSES = Object.freeze({
  '小成·荒古圣体': 0.05,
  '大成·荒古圣体': 0.1,
  '小成·苍天霸体': 0.05,
  '大成·苍天霸体': 0.1,
  先天道胎: 0.25,
  先天圣体道胎: 0.3,
  混沌体: 0.35,
  先天混沌圣体道胎: 0.45,
});

const APTITUDE_BONUSES = Object.freeze({
  无化如是: -0.3,
  生而愚痴: -0.25,
  生而痴傻: -0.25,
  天弃之人: -0.2,
  先天不足: -0.1,
  平庸之资: 0,
  超凡资质: 0.05,
  天纵之资: 0.1,
  旷世奇才: 0.15,
  绝世天骄: 0.2,
  万古无双: 0.25,
  无演无尽: 0.3,
  岁云: 0.3,
});

const ERA_PROFILES = Object.freeze([
  Object.freeze({ name: '神话时代', bonus: 0.3 }),
  Object.freeze({ name: '太古时代', bonus: 0.15 }),
  Object.freeze({ name: '天命时代', bonus: 0 }),
  Object.freeze({ name: '末法时代', bonus: -0.2 }),
  Object.freeze({ name: '绝灵时代', bonus: -0.4 }),
]);

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function safeRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return clamp(value, 0, 1 - Number.EPSILON);
}

function normalizeExp(value, targetExp) {
  return Math.floor(clamp(value, 0, targetExp));
}

export function getDaoRuleForRealm(realmId) {
  return DAO_REALM_RULES.find(rule => rule.realmId === Number(realmId)) || null;
}

export function getXianguDaoRuleForRealm(realmId) {
  return XIANGU_DAO_REALM_RULES.find(rule => rule.realmId === Number(realmId)) || null;
}

export function getDaoStage(exp, rule) {
  if (!rule) return { name: '未开启', minExp: 0, nextExp: 0 };
  const currentExp = normalizeExp(exp, rule.targetExp);
  const smallExp = Math.floor(rule.targetExp / 6);
  const greatExp = Math.floor(rule.targetExp / 2);

  if (currentExp >= rule.targetExp) {
    return { name: '圆满', minExp: rule.targetExp, nextExp: rule.targetExp };
  }
  if (currentExp >= greatExp) {
    return { name: '大成', minExp: greatExp, nextExp: rule.targetExp };
  }
  if (currentExp >= smallExp) {
    return { name: '小成', minExp: smallExp, nextExp: greatExp };
  }
  return { name: '初悟', minExp: 0, nextExp: smallExp };
}

export function ensureDaoPath(player, options = {}) {
  const migrateLegacy = options.migrateLegacy !== false;
  const hadDaoPath = Boolean(
    player?.道途 && typeof player.道途 === 'object' && !Array.isArray(player.道途)
  );
  let changed = false;

  if (!hadDaoPath) {
    player.道途 = {};
    changed = true;
  }

  const path = player.道途;
  if (!path.stages || typeof path.stages !== 'object' || Array.isArray(path.stages)) {
    path.stages = {};
    changed = true;
  }
  if (!path.daily || typeof path.daily !== 'object' || Array.isArray(path.daily)) {
    path.daily = { date: '', count: 0 };
    changed = true;
  }
  const previousVersion = Number(path.version) || 0;
  if (path.version !== DAO_PATH_VERSION) {
    path.version = DAO_PATH_VERSION;
    changed = true;
  }

  if (!hadDaoPath && migrateLegacy) {
    const currentRealm = Number(player.mijinglevel_id) || 0;
    for (const rule of DAO_REALM_RULES) {
      const namedLegacyExp = Number(player.法则?.[rule.name]);
      let exp;
      if (Number.isFinite(namedLegacyExp)) {
        exp = namedLegacyExp;
      } else if (currentRealm > rule.realmId) {
        exp = rule.targetExp;
      } else if (currentRealm === rule.realmId) {
        // 高境节点代表“当前境界通往下一境界”的门槛，老存档从零开始悟；
        // 人道阶段沿用旧版中途进度回填规则。
        exp = rule.realmId >= 17 ? 0 : Math.floor(rule.targetExp / 2);
      } else {
        continue;
      }
      path.stages[rule.key] = normalizeExp(exp, rule.targetExp);
    }

    if (currentRealm >= 16) {
      path.result = path.result || { name: '无缺帝道', achievedAt: null };
    }
  }

  // v1 存档没有红尘仙后的悟道节点：已经走过的节点自动补满，当前节点从零开始。
  if (previousVersion < 2 && hadDaoPath) {
    const currentRealm = Number(player.mijinglevel_id) || 0;
    for (const rule of DAO_REALM_RULES.filter(item => item.realmId >= 17)) {
      if (path.stages[rule.key] !== undefined) continue;
      if (currentRealm > rule.realmId) path.stages[rule.key] = rule.targetExp;
      else if (currentRealm === rule.realmId) path.stages[rule.key] = 0;
      changed = true;
    }
  }

  for (const rule of DAO_REALM_RULES) {
    if (path.stages[rule.key] === undefined) continue;
    const normalized = normalizeExp(path.stages[rule.key], rule.targetExp);
    if (normalized !== path.stages[rule.key]) {
      path.stages[rule.key] = normalized;
      changed = true;
    }
  }

  const normalizedCount = Math.max(0, Math.floor(Number(path.daily.count) || 0));
  if (normalizedCount !== path.daily.count) {
    path.daily.count = normalizedCount;
    changed = true;
  }
  if (typeof path.daily.date !== 'string') {
    path.daily.date = '';
    changed = true;
  }

  return { path, migrated: !hadDaoPath && migrateLegacy, changed };
}

export function unlockDaoRealm(player, realmId) {
  const { path } = ensureDaoPath(player, { migrateLegacy: false });
  const rule = getDaoRuleForRealm(realmId);
  if (!rule) return null;
  if (path.stages[rule.key] === undefined) path.stages[rule.key] = 0;
  return rule;
}

export function ensureXianguDaoPath(player) {
  let changed = false;
  if (!player.仙古道途 || typeof player.仙古道途 !== 'object' || Array.isArray(player.仙古道途)) {
    player.仙古道途 = {};
    changed = true;
  }
  const path = player.仙古道途;
  if (!path.stages || typeof path.stages !== 'object' || Array.isArray(path.stages)) {
    path.stages = {};
    changed = true;
  }
  if (!path.daily || typeof path.daily !== 'object' || Array.isArray(path.daily)) {
    path.daily = { date: '', count: 0 };
    changed = true;
  }
  if (path.version !== XIANGU_DAO_PATH_VERSION) {
    path.version = XIANGU_DAO_PATH_VERSION;
    changed = true;
  }
  for (const rule of XIANGU_DAO_REALM_RULES) {
    if (path.stages[rule.key] === undefined) continue;
    const normalized = normalizeExp(path.stages[rule.key], rule.targetExp);
    if (normalized !== path.stages[rule.key]) {
      path.stages[rule.key] = normalized;
      changed = true;
    }
  }
  const count = Math.max(0, Math.floor(Number(path.daily.count) || 0));
  if (count !== path.daily.count) {
    path.daily.count = count;
    changed = true;
  }
  if (typeof path.daily.date !== 'string') {
    path.daily.date = '';
    changed = true;
  }
  return { path, changed };
}

export function unlockXianguDaoRealm(player, realmId) {
  const { path } = ensureXianguDaoPath(player);
  const rule = getXianguDaoRuleForRealm(realmId);
  if (!rule) return null;
  if (path.stages[rule.key] === undefined) path.stages[rule.key] = 0;
  return rule;
}

export function getXianguDaoGateState(player, realmId) {
  const ensured = ensureXianguDaoPath(player);
  const rule = getXianguDaoRuleForRealm(realmId);
  if (!rule) return { ok: true, rule: null, exp: 0, stage: null, ...ensured };
  const exp = normalizeExp(ensured.path.stages[rule.key] ?? 0, rule.targetExp);
  return {
    ok: exp >= rule.targetExp,
    rule,
    exp,
    stage: getDaoStage(exp, rule),
    ...ensured,
  };
}

export function markDaoAsEmperor(player, method = '') {
  const { path } = ensureDaoPath(player, { migrateLegacy: false });
  path.result = {
    name: '无缺帝道',
    method,
    achievedAt: Date.now(),
  };
  return path.result;
}

/** 九世逆活圆满后，自动补齐此前的人道与帝道，不占用红尘仙后的悟道节点。 */
export function completeDaoByNineLives(player, daoFruit = '', now = Date.now()) {
  const { path } = ensureDaoPath(player, { migrateLegacy: false });
  for (const rule of DAO_REALM_RULES.filter(item => item.realmId <= 15)) {
    path.stages[rule.key] = rule.targetExp;
  }
  path.result = {
    name: daoFruit ? `九世圆满·${daoFruit}` : '九世圆满大道',
    method: '逆活九世',
    achievedAt: now,
  };
  return path.result;
}

/** 在仙王巨头圆满诸天道则后，记录玩家独有的修炼体系。 */
export function createCultivationSystem(player, rawName, now = Date.now()) {
  if (player?.自创修炼体系) return { ok: false, reason: 'exists', system: player.自创修炼体系 };
  const name = String(rawName ?? '').trim();
  if (!name || Array.from(name).length > 5 || /[\r\n#]/.test(name)) {
    return { ok: false, reason: 'name' };
  }
  if (getRealmAuthorityLevel(player) < 19) return { ok: false, reason: 'realm' };

  const route = getRealmAuthorityPath(player);
  const routeLabel = {
    mijing: '遮天人体秘境',
    xiangu: '仙古今世法',
    huafen: '花粉进化路',
  }[route];
  const gate = route === 'xiangu'
    ? getXianguDaoGateState(player, 20)
    : route === 'huafen'
      ? getFlowerDaoGateState(player, 19)
      : getDaoGateState(player, 19);
  if (!gate.ok) return { ok: false, reason: 'dao', gate };

  const system = {
    name,
    founder: player?.名号 || '',
    source: `${routeLabel}道果合流`,
    route,
    createdAt: now,
    stage: '道祖体系',
  };
  player.自创修炼体系 = system;
  const path = route === 'xiangu'
    ? ensureXianguDaoPath(player).path
    : route === 'huafen'
      ? gate.path
      : ensureDaoPath(player, { migrateLegacy: false }).path;
  path.result = {
    name: `${name}·开道者`,
    method: '合道',
    inherited: path.result?.name || '九世圆满大道',
    achievedAt: now,
  };
  return { ok: true, system, path: path.result };
}

export function getDaoGateState(player, realmId) {
  const ensured = ensureDaoPath(player);
  const rule = getDaoRuleForRealm(realmId);
  if (!rule) return { ok: true, rule: null, exp: 0, stage: null, ...ensured };
  const exp = normalizeExp(ensured.path.stages[rule.key] ?? 0, rule.targetExp);
  const stage = getDaoStage(exp, rule);
  return {
    ok: exp >= rule.targetExp,
    rule,
    exp,
    stage,
    ...ensured,
  };
}

export function getShanghaiDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function refreshDaoDaily(path, dateKey = getShanghaiDateKey()) {
  if (path.daily.date !== dateKey) {
    path.daily.date = dateKey;
    path.daily.count = 0;
    return true;
  }
  return false;
}

export function recordDaoAttempt(path, dateKey = getShanghaiDateKey()) {
  refreshDaoDaily(path, dateKey);
  path.daily.count += 1;
  return path.daily.count;
}

export function getPhysiqueWudaoBonus(physiqueName, player = { 灵根: { name: physiqueName } }) {
  return getMemoryEffects(player).enlightenmentBonus
    || getSuiyunEffects({ 灵根: { name: physiqueName } }).enlightenmentBonus
    || Number(PHYSIQUE_BONUSES[physiqueName]) || 0;
}

export function getAptitudeWudaoBonus(aptitudeName) {
  return Number(APTITUDE_BONUSES[aptitudeName === '星神之资' ? '无演无尽' : aptitudeName]) || 0;
}

export function getEraWudaoProfile(eraIndex) {
  return ERA_PROFILES[Number(eraIndex)] || ERA_PROFILES[2];
}

function explicitTechniqueBonus(item) {
  const raw = Number(item?.悟道加成);
  if (!Number.isFinite(raw)) return null;
  return clamp(Math.abs(raw) > 1 ? raw / 100 : raw, -0.5, 0.5);
}

function inferredTechniqueBonus(item, isCustomSutra) {
  const type = String(item?.type || '');
  if (isCustomSutra || type.includes('仙帝法')) return 0.25;
  if (type.includes('帝经')) return 0.2;
  if (type.includes('道与法')) return 0.15;
  if (/九秘|十凶|宝术|仙王法/.test(type)) return 0.1;
  return 0.05;
}

export function getTechniqueWudaoProfile(learnedNames, techniquePools = {}) {
  const learned = new Set(Array.isArray(learnedNames) ? learnedNames : []);
  if (!learned.size) return { name: '无', bonus: 0 };

  const regularPools = [techniquePools.gongfaList, techniquePools.timeGongfaList]
    .filter(Array.isArray)
    .flat();
  const customPool = Array.isArray(techniquePools.dijingList)
    ? techniquePools.dijingList
    : [];
  const candidates = [
    ...regularPools.map(item => ({ item, isCustom: false })),
    ...customPool.map(item => ({ item, isCustom: true })),
  ].filter(({ item }) => learned.has(item?.name));

  let best = { name: '无', bonus: 0 };
  for (const { item, isCustom } of candidates) {
    const explicit = explicitTechniqueBonus(item);
    const bonus = explicit ?? inferredTechniqueBonus(item, isCustom);
    if (bonus > best.bonus) best = { name: item.name, bonus };
  }
  return best;
}

export function getWudaoLifespanCost(rule, minggeEffects = {}) {
  const reduction = clamp(minggeEffects.悟道寿元消耗减少, 0, 0.5);
  const increase = clamp(minggeEffects.悟道寿元消耗增加, 0, 1);
  const multiplier = clamp(1 - reduction + increase, 0.5, 2);
  return {
    cost: Math.max(1, Math.floor(rule.lifespanCost * multiplier)),
    multiplier,
  };
}

export function calculateWudaoResult(options) {
  const {
    rule,
    physiqueName = '',
    eraIndex = 2,
    aptitudeName = '',
    techniqueBonus = 0,
    worldBonus = 0,
    minggeEffects = {},
    useTea = false,
    random = Math.random,
  } = options;
  if (!rule) throw new Error('缺少悟道境界规则');

  const era = getEraWudaoProfile(eraIndex);
  const bonuses = {
    physique: getPhysiqueWudaoBonus(physiqueName, options.player),
    era: era.bonus,
    aptitude: getAptitudeWudaoBonus(aptitudeName),
    technique: clamp(techniqueBonus, -0.5, 0.5),
    world: clamp(worldBonus, 0, 0.5),
    mingge: clamp(minggeEffects.悟道收益, -0.5, 1),
    tea: useTea ? 0.5 : 0,
  };
  const totalBonus = Object.entries(bonuses)
    .filter(([name]) => name !== 'world')
    .reduce((sum, [, value]) => sum + value, 0);
  const multiplier = clamp(1 + totalBonus, 0.5, 2.5) * (1 + bonuses.world);
  const randomFactor = 0.9 + safeRandom(random) * 0.2;
  const enlightenmentChance = clamp(
    0.02 + (Number(minggeEffects.顿悟概率) || 0) + (useTea ? 0.1 : 0),
    0,
    0.25
  );
  const enlightened = safeRandom(random) < enlightenmentChance;
  const gain = Math.max(
    1,
    Math.floor(rule.baseGain * multiplier * randomFactor * (enlightened ? 2 : 1))
  );
  const lifespan = getWudaoLifespanCost(rule, minggeEffects);

  return {
    gain,
    enlightened,
    enlightenmentChance,
    multiplier,
    randomFactor,
    bonuses,
    era,
    lifespanCost: lifespan.cost,
    lifespanMultiplier: lifespan.multiplier,
  };
}

export function calculateWudaoAttempt(options = {}) {
  const requiredYuanshenLevel = Math.max(0, Math.trunc(Number(options.requiredYuanshenLevel) || 0));
  const parsedYuanshenLevel = Number(options.currentYuanshenLevel);
  const currentYuanshenLevel = Number.isFinite(parsedYuanshenLevel)
    ? Math.max(-1, Math.trunc(parsedYuanshenLevel))
    : -1;
  if (currentYuanshenLevel < requiredYuanshenLevel) {
    return { allowed: false, success: false, successChance: 0, resourceCostRate: 0 };
  }

  const successChance = clamp(
    0.7 + (currentYuanshenLevel - requiredYuanshenLevel) * 0.05,
    0.7,
    0.95,
  );
  const random = options.random || Math.random;
  const success = safeRandom(random) < successChance;
  if (success) {
    return { allowed: true, success: true, successChance, resourceCostRate: 1 };
  }

  const baseLossPercent = Math.floor(safeRandom(random) * 101);
  const resourceCostRate = baseLossPercent / 100 * (options.useTea ? 0.5 : 1);
  return {
    allowed: true,
    success: false,
    successChance,
    baseLossPercent,
    resourceCostRate,
  };
}

export function getAvailableLifespan(player) {
  const suppressed = Number(player?.压制寿元);
  if (Number.isFinite(suppressed) && suppressed > 0) return Math.floor(suppressed);
  return Math.max(0, Math.floor(Number(player?.寿元) || 0));
}

export function consumePlayerLifespan(player, amount) {
  const cost = Math.max(0, Math.floor(Number(amount) || 0));
  const available = getAvailableLifespan(player);
  if (available <= cost) return false;

  const remaining = available - cost;
  const suppressed = Number(player?.压制寿元);
  if (Number.isFinite(suppressed) && suppressed > 0) {
    player.压制寿元 = remaining;
    player.寿元 = Math.min(Math.max(0, Number(player.寿元) || 0), remaining, 9999);
  } else {
    player.寿元 = remaining;
  }
  return true;
}

export function formatSignedPercent(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? '+' : ''}${Math.round(number * 100)}%`;
}

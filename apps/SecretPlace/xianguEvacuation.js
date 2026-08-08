import { getXianguBagSummary } from './xianguBag.js';

export const XIANGU_EVACUATION_MODES = Object.freeze({
  NORMAL: 'normal',
  EMERGENCY: 'emergency',
});

export const DEFAULT_XIANGU_EVACUATION_CONFIG = Object.freeze({
  normal: Object.freeze({ baseSeconds: 10, perLootSeconds: 2, maxSeconds: 60 }),
  emergency: Object.freeze({ baseSeconds: 30, perLootSeconds: 2, maxSeconds: 90 }),
  confirmationWindowSeconds: 120,
});

const CORE_FRAGMENT_ID = 'xiangu_core';

function toFiniteNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNonNegativeInteger(value, fallback = 0) {
  const number = toFiniteNumber(value, fallback);
  return Math.max(0, Math.floor(number));
}

function normalizeMode(mode) {
  return mode === XIANGU_EVACUATION_MODES.EMERGENCY
    ? XIANGU_EVACUATION_MODES.EMERGENCY
    : XIANGU_EVACUATION_MODES.NORMAL;
}

function unwrapConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {};
  const nested = config.撤离配置;
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : config;
}

function firstConfiguredNumber(sources, keys, fallback) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      const value = toFiniteNumber(source[key]);
      if (value !== null) return value;
    }
  }
  return fallback;
}

function resolveModeConfig(mode, config) {
  const root = unwrapConfig(config);
  const isEmergency = mode === XIANGU_EVACUATION_MODES.EMERGENCY;
  const nested = isEmergency
    ? root.emergency || root.紧急撤离 || root.紧急
    : root.normal || root.普通撤离 || root.正常撤离 || root.普通;
  const defaults = DEFAULT_XIANGU_EVACUATION_CONFIG[mode];
  const sources = [nested, root];

  const baseKeys = isEmergency
    ? ['baseSeconds', '基础秒数', '基础时间', 'emergencyBaseSeconds', '紧急撤离基础秒数', '紧急撤离基础时间']
    : ['baseSeconds', '基础秒数', '基础时间', 'normalBaseSeconds', '普通撤离基础秒数', '普通撤离基础时间'];
  const maxKeys = isEmergency
    ? ['maxSeconds', '上限秒数', '最长时间', 'emergencyMaxSeconds', '紧急撤离上限秒数', '紧急撤离最长时间']
    : ['maxSeconds', '上限秒数', '最长时间', 'normalMaxSeconds', '普通撤离上限秒数', '普通撤离最长时间'];

  const baseSeconds = Math.max(0, firstConfiguredNumber(sources, baseKeys, defaults.baseSeconds));
  const perLootSeconds = Math.max(0, firstConfiguredNumber(
    sources,
    ['perLootSeconds', '每单位秒数', '每单位战利品秒数', '每份战利品时间', '每件增加秒数'],
    defaults.perLootSeconds,
  ));
  const configuredMax = firstConfiguredNumber(sources, maxKeys, defaults.maxSeconds);

  return {
    baseSeconds,
    perLootSeconds,
    maxSeconds: Math.max(baseSeconds, configuredMax),
  };
}

function resolveConfirmationWindowSeconds(config, mode) {
  const root = unwrapConfig(config);
  const nested = mode === XIANGU_EVACUATION_MODES.EMERGENCY
    ? root.emergency || root.紧急撤离 || root.紧急
    : root.normal || root.普通撤离 || root.正常撤离 || root.普通;
  return Math.max(1, firstConfiguredNumber(
    [nested, root],
    ['confirmationWindowSeconds', '确认窗口秒数', '确认有效期秒数', '撤离确认窗口', '完成窗口'],
    DEFAULT_XIANGU_EVACUATION_CONFIG.confirmationWindowSeconds,
  ));
}

function normalizePosition(position) {
  if (!position || typeof position !== 'object' || Array.isArray(position)) return null;
  const x = toFiniteNumber(position.x);
  const y = toFiniteNumber(position.y);
  return x === null || y === null ? null : { x, y };
}

function getPlayerPosition(player = {}) {
  return normalizePosition(player.xiangu_realm_map?.playerPos) || normalizePosition({
    x: player.xiangu_pos_x,
    y: player.xiangu_pos_y,
  });
}

function getSeedName(seed) {
  if (typeof seed === 'string') return seed.trim();
  if (!seed || typeof seed !== 'object') return '';
  return String(seed.名称 || seed.name || '').trim();
}

function clonePlainData(value) {
  if (value === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function countNajieItems(najie) {
  if (!najie || typeof najie !== 'object' || Array.isArray(najie)) return 0;

  let total = 0;
  for (const category of Object.values(najie)) {
    if (!Array.isArray(category)) continue;
    for (const item of category) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      total += toNonNegativeInteger(item.数量);
    }
  }
  return total;
}

export function getXianguCurrentHp(player = {}) {
  const currentHp = toFiniteNumber(player.当前血量);
  if (currentHp !== null) return currentHp;
  return toFiniteNumber(player.血气);
}

export function createXianguRun(player = {}, najie = {}, now = Date.now(), random = Math.random) {
  const startedAt = Math.max(0, Math.floor(toFiniteNumber(now, Date.now())));
  const randomValue = typeof random === 'function' ? toFiniteNumber(random(), 0) : 0;
  const boundedRandom = Math.max(0, Math.min(1 - Number.EPSILON, randomValue));
  const randomPart = Math.floor(boundedRandom * 0x100000000)
    .toString(36)
    .padStart(7, '0');
  const seeds = Array.isArray(player.xiangu_seeds) ? player.xiangu_seeds : [];

  const run = {
    version: 1,
    runId: `xiangu-${startedAt.toString(36)}-${randomPart}`,
    startedAt,
    startNajieCount: countNajieItems(najie),
    startSeedCount: seeds.length,
    startKills: toNonNegativeInteger(player.xiangu_kills),
    startInfamy: toFiniteNumber(player.xiangu_infamy, 0),
    获得道种: [],
  };

  player.xiangu_run = run;
  return run;
}

export function calculateEvacuationDuration({
  mode = XIANGU_EVACUATION_MODES.NORMAL,
  lootUnits = 0,
  config = {},
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const modeConfig = resolveModeConfig(normalizedMode, config);
  const units = toNonNegativeInteger(lootUnits);
  return Math.ceil(Math.min(
    modeConfig.maxSeconds,
    modeConfig.baseSeconds + units * modeConfig.perLootSeconds,
  ));
}

export function createEvacuationState({
  player = {},
  run = player.xiangu_run,
  runId = run?.runId,
  mode = XIANGU_EVACUATION_MODES.NORMAL,
  now = Date.now(),
  config = {},
  durationSeconds,
  fragmentId = player.xiangu_realm_map?.fragmentId,
  position = getPlayerPosition(player),
  currentHp = getXianguCurrentHp(player),
  lootUnits,
  lootStats = {},
} = {}) {
  const normalizedMode = normalizeMode(mode);
  const startedAt = Math.max(0, Math.floor(toFiniteNumber(now, Date.now())));
  const stats = lootStats && typeof lootStats === 'object' && !Array.isArray(lootStats)
    ? clonePlainData(lootStats)
    : {};
  const inferredLootUnits =
    toNonNegativeInteger(stats.najieDelta ?? stats.najieItemsGained) +
    toNonNegativeInteger(stats.seedCount ?? stats.seedsGained) +
    toNonNegativeInteger(stats.uniqueFound);
  const resolvedLootUnits = toNonNegativeInteger(
    lootUnits ?? stats.lootUnits ?? stats.units ?? inferredLootUnits,
  );
  const resolvedDuration = durationSeconds === undefined
    ? calculateEvacuationDuration({ mode: normalizedMode, lootUnits: resolvedLootUnits, config })
    : toNonNegativeInteger(durationSeconds);
  const readyAt = startedAt + resolvedDuration * 1000;
  const expiresAt = readyAt + Math.ceil(resolveConfirmationWindowSeconds(config, normalizedMode) * 1000);

  return {
    version: 1,
    runId: String(runId || ''),
    mode: normalizedMode,
    startedAt,
    readyAt,
    expiresAt,
    durationSeconds: resolvedDuration,
    fragmentId: String(fragmentId || ''),
    position: normalizePosition(position),
    currentHp: toFiniteNumber(currentHp),
    lootUnits: resolvedLootUnits,
    lootStats: { ...stats, lootUnits: resolvedLootUnits },
  };
}

export function parseEvacuationState(rawState) {
  if (!rawState) return null;

  let parsed = rawState;
  if (typeof rawState === 'string') {
    try {
      parsed = JSON.parse(rawState);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const version = toNonNegativeInteger(parsed.version);
  const runId = String(parsed.runId || '').trim();
  const mode = parsed.mode;
  const startedAt = toFiniteNumber(parsed.startedAt);
  const readyAt = toFiniteNumber(parsed.readyAt);
  const expiresAt = toFiniteNumber(parsed.expiresAt);
  const position = normalizePosition(parsed.position);
  const fragmentId = String(parsed.fragmentId || '').trim();

  if (
    version !== 1 ||
    !runId ||
    !Object.values(XIANGU_EVACUATION_MODES).includes(mode) ||
    startedAt === null ||
    readyAt === null ||
    expiresAt === null ||
    startedAt > readyAt ||
    readyAt >= expiresAt ||
    !fragmentId ||
    !position
  ) {
    return null;
  }

  const lootStats = parsed.lootStats && typeof parsed.lootStats === 'object' && !Array.isArray(parsed.lootStats)
    ? clonePlainData(parsed.lootStats)
    : {};
  const lootUnits = toNonNegativeInteger(parsed.lootUnits ?? lootStats.lootUnits);

  return {
    ...parsed,
    version,
    runId,
    mode,
    startedAt,
    readyAt,
    expiresAt,
    durationSeconds: toNonNegativeInteger(parsed.durationSeconds, Math.ceil((readyAt - startedAt) / 1000)),
    fragmentId,
    position,
    currentHp: toFiniteNumber(parsed.currentHp),
    lootUnits,
    lootStats: { ...lootStats, lootUnits },
  };
}

export function validateEvacuationState(rawState, {
  player = {},
  runId = player.xiangu_run?.runId,
  now = Date.now(),
  fragmentId = player.xiangu_realm_map?.fragmentId,
  position = getPlayerPosition(player),
  currentHp = getXianguCurrentHp(player),
  coreFragmentId = CORE_FRAGMENT_ID,
} = {}) {
  const state = parseEvacuationState(rawState);
  if (!state) return { ok: false, code: 'missing', remaining: 0, state: null };

  const checkedAt = toFiniteNumber(now, Date.now());
  if (!runId || String(runId) !== state.runId) {
    return { ok: false, code: 'run_mismatch', remaining: 0, state };
  }
  if (checkedAt >= state.expiresAt) {
    return { ok: false, code: 'expired', remaining: 0, state };
  }
  if (!player?.in_xiangu) {
    return { ok: false, code: 'not_in_xiangu', remaining: 0, state };
  }

  const currentFragmentId = String(fragmentId || '');
  if (
    state.mode === XIANGU_EVACUATION_MODES.NORMAL &&
    (state.fragmentId !== coreFragmentId || currentFragmentId !== coreFragmentId)
  ) {
    return { ok: false, code: 'not_in_core', remaining: 0, state };
  }

  const currentPosition = normalizePosition(position);
  if (
    currentFragmentId !== state.fragmentId ||
    !currentPosition ||
    currentPosition.x !== state.position.x ||
    currentPosition.y !== state.position.y
  ) {
    return { ok: false, code: 'moved', remaining: 0, state };
  }

  const checkedHp = toFiniteNumber(currentHp);
  if (state.currentHp !== null && checkedHp !== null && checkedHp < state.currentHp) {
    return { ok: false, code: 'damaged', remaining: 0, state };
  }

  if (checkedAt < state.readyAt) {
    return {
      ok: false,
      code: 'not_ready',
      remaining: Math.max(1, Math.ceil((state.readyAt - checkedAt) / 1000)),
      state,
    };
  }

  return { ok: true, code: 'ready', remaining: 0, state };
}

export function buildXianguRunSummary(player = {}, najie = {}, now = Date.now()) {
  const run = player.xiangu_run && typeof player.xiangu_run === 'object'
    ? player.xiangu_run
    : {};
  const endedAt = Math.max(0, Math.floor(toFiniteNumber(now, Date.now())));
  const startedAt = Math.max(0, Math.floor(toFiniteNumber(
    run.startedAt ?? player.xiangu_entry_time,
    endedAt,
  )));
  const durationMs = Math.max(0, endedAt - startedAt);

  const najieStartCount = toNonNegativeInteger(run.startNajieCount ?? run.startInventoryCount);
  const najieEndCount = countNajieItems(najie);
  const legacyNajieDelta = Math.max(0, najieEndCount - najieStartCount);
  const hasBag = Object.hasOwn(player, 'xiangu_bag');
  const bag = getXianguBagSummary(player.xiangu_bag);
  const najieDelta = hasBag ? bag.itemCount : legacyNajieDelta;

  const seeds = Array.isArray(player.xiangu_seeds) ? player.xiangu_seeds : [];
  const seedStartCount = toNonNegativeInteger(run.startSeedCount);
  const currentSeedDelta = Math.max(0, seeds.length - seedStartCount);
  const trackedSeeds = Array.isArray(run.获得道种) ? run.获得道种 : [];
  const trackedSeedNames = trackedSeeds.map(getSeedName).filter(Boolean);
  const derivedSeedNames = seeds.slice(seedStartCount).map(getSeedName).filter(Boolean);
  const bagSeedNames = bag.seeds.map(seed =>
    typeof seed === 'string' ? seed : String(seed?.名称 || seed?.name || '')
  ).filter(Boolean);
  const seedNames = hasBag
    ? bagSeedNames
    : trackedSeedNames.length > 0 ? trackedSeedNames : derivedSeedNames;
  const seedCount = hasBag
    ? bag.seedCount
    : trackedSeedNames.length > 0 ? trackedSeedNames.length : currentSeedDelta;

  const killsStart = toNonNegativeInteger(run.startKills);
  const killsEnd = toNonNegativeInteger(player.xiangu_kills);
  const killDelta = Math.max(0, killsEnd - killsStart);
  const infamyStart = toFiniteNumber(run.startInfamy, 0);
  const infamyEnd = toFiniteNumber(player.xiangu_infamy, 0);
  const infamyDelta = infamyEnd - infamyStart;
  const gains = player.xiangu_gains && typeof player.xiangu_gains === 'object'
    ? player.xiangu_gains
    : {};
  const daoyun = Math.max(0, toFiniteNumber(gains.daoyun, 0));
  const uniqueFound = toNonNegativeInteger(gains.unique_found);
  const gainNames = Object.keys(gains).filter(key =>
    !['daoyun', 'xiongmng', 'debuff', 'unique_found'].includes(key) &&
    toFiniteNumber(gains[key], 0) > 0
  );
  const lootUnits = hasBag ? bag.lootUnits : najieDelta + seedCount + uniqueFound;

  return {
    version: 1,
    runId: String(run.runId || ''),
    startedAt,
    endedAt,
    durationMs,
    durationSeconds: Math.floor(durationMs / 1000),
    durationMinutes: Math.floor(durationMs / 60000),
    najieStartCount,
    najieEndCount,
    najieDelta,
    najieItemsGained: najieDelta,
    seedStartCount,
    seedEndCount: seeds.length,
    seedCount,
    seedsGained: seedCount,
    seedNames,
    killsStart,
    killsEnd,
    killDelta,
    killsGained: killDelta,
    infamyStart,
    infamyEnd,
    infamyDelta,
    infamyGained: infamyDelta,
    daoyun,
    xiuwei: hasBag ? bag.xiuwei : 0,
    xueqi: hasBag ? bag.xueqi : 0,
    sourceStone: hasBag ? bag.sourceStone : 0,
    potential: hasBag ? bag.potential : 0,
    techniqueCount: hasBag ? bag.techniqueCount : 0,
    uniqueFound,
    gainNames,
    lootUnits,
  };
}

export function clearXianguSessionState(player = {}, summary = {}) {
  const temporaryFields = [
    'xiangu_realm_map',
    'xiangu_realm_history',
    'xiangu_pos_x',
    'xiangu_pos_y',
    'xiangu_run',
    'xiangu_soulsearch_target',
    'xiangu_teammate',
    'xiangu_teammate_name',
    'xiangu_teammate_data',
    'xiangu_teammate_betray_chance',
    'xiangu_last_npc_tick',
    'xiangu_npc_interactions',
    'xiangu_bag',
    'xiangu_defeated_npc_ids',
    'xiangu_world_seed',
  ];

  for (const field of temporaryFields) delete player[field];
  player.in_xiangu = false;
  player.xiangu_entry_time = 0;
  player.xiangu_location = '边缘区域';
  player.xiangu_gains = {};
  if (
    summary &&
    typeof summary === 'object' &&
    !Array.isArray(summary) &&
    Object.keys(summary).length > 0
  ) {
    player.xiangu_last_run = clonePlainData(summary);
  }
  return player;
}

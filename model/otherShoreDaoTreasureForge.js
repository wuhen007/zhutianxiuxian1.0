import {
  getOtherShoreDaoTreasureRecipe,
  validateOtherShoreDaoTreasureRecipe,
} from './otherShoreProgression.js';

export const OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS = 24 * 60 * 60 * 1000;
export const OTHER_SHORE_DAO_TREASURE_FORGE_RECEIPT_LIMIT = 256;

const copy = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const text = (value) => String(value ?? '').trim();
const whole = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
};

function timestamp(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('炼制时间无效');
  return Math.trunc(number);
}

function requiredText(value, field) {
  const result = text(value);
  if (!result) throw new Error(`${field} 不能为空`);
  return result;
}

function forgeError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = copy(details);
  return error;
}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function normalizeTreasure(entry, index) {
  const source = typeof entry === 'string' ? { id: entry, name: entry } : entry || {};
  const name = text(source.name ?? source.名称 ?? source.id) || `先天至宝${index + 1}`;
  return {
    id: text(source.id ?? source.treasureId ?? source.先天至宝本体 ?? name),
    name,
  };
}

function selectedTreasureSource(options, context) {
  return options.selectedInnateTreasures
    ?? options.innateTreasures
    ?? options.selectedTreasures
    ?? context.selectedInnateTreasures
    ?? context.innateTreasures
    ?? context.先天至宝
    ?? [];
}

function selectedTreasures(options, context) {
  const source = selectedTreasureSource(options, context);
  if (!Array.isArray(source)) return [];
  const unique = new Map();
  source.map(normalizeTreasure).forEach((entry) => {
    if (entry.id && !unique.has(entry.id)) unique.set(entry.id, entry);
  });
  return [...unique.values()];
}

function authorityFrom(entry, index, treasures, sourceTreasureId = '') {
  const source = typeof entry === 'string' ? { name: entry } : entry || {};
  const name = text(source.name ?? source.名称 ?? source.authority ?? source.权柄 ?? source.cooldownKey ?? source.id);
  if (!name) return null;
  const fallbackTreasure = treasures[index] || null;
  const explicitTreasureId = text(source.sourceTreasureId ?? source.treasureId ?? sourceTreasureId);
  const treasureId = explicitTreasureId || text(fallbackTreasure?.id);
  const treasure = treasures.find((item) => item.id === treasureId) || fallbackTreasure;
  return {
    id: text(source.id) || `authority-${hash(`${treasureId}:${name}`)}`,
    name,
    sourceTreasureId: treasureId || null,
    sourceTreasureName: text(source.sourceTreasureName ?? treasure?.name) || null,
    command: text(source.command) || null,
    cooldownKey: text(source.cooldownKey) || null,
    effect: text(source.effect ?? source.效果) || null,
    passive: source.passive === true || source.被动 === true || source.type === 'passive',
  };
}

function embeddedAuthorities(entry) {
  if (!entry || typeof entry !== 'object') return [];
  const result = [];
  const append = (source, passive = false) => {
    const values = Array.isArray(source) ? source : source == null ? [] : [source];
    values.forEach((value) => result.push(
      passive && (typeof value !== 'object' || value === null)
        ? { name: value, passive: true }
        : passive
          ? { ...value, passive: true }
          : value,
    ));
  };
  append(entry.authorities ?? entry.权柄列表 ?? entry.authority ?? entry.权柄);
  append(entry.passives ?? entry.passiveAuthorities ?? entry.被动权柄, true);
  return result;
}

function selectedAuthorities(options, context, treasures) {
  let explicit = options.selectedAuthorities
    ?? options.authorities
    ?? options.selectedTreasureAuthorities
    ?? context.selectedAuthorities
    ?? context.选中权柄;
  if (typeof explicit === 'string') explicit = explicit.split(/[、,，\s]+/).filter(Boolean);
  const result = [];
  if (Array.isArray(explicit)) {
    explicit.forEach((entry, index) => {
      const authority = authorityFrom(entry, index, treasures);
      if (authority) result.push(authority);
    });
  } else if (explicit && typeof explicit === 'object') {
    for (const [treasureId, entries] of Object.entries(explicit)) {
      const values = Array.isArray(entries) ? entries : [entries];
      values.forEach((entry, index) => {
        const authority = authorityFrom(entry, index, treasures, treasureId);
        if (authority) result.push(authority);
      });
    }
  }
  const originals = selectedTreasureSource(options, context);
  for (const [index, treasure] of treasures.entries()) {
    const original = Array.isArray(originals) ? originals[index] : null;
    embeddedAuthorities(original).forEach((entry) => {
      const authority = authorityFrom(entry, index, treasures, treasure.id);
      if (authority) result.push(authority);
    });
  }
  const unique = new Map();
  result.forEach((entry) => {
    const key = `${entry.sourceTreasureId || ''}:${entry.name}`;
    unique.set(key, { ...(unique.get(key) || {}), ...entry });
  });
  return [...unique.values()];
}

function customAuthorities(options, context) {
  const source = options.customAuthorities
    ?? options.自定义权柄
    ?? context.customAuthorities
    ?? context.自定义强化权柄
    ?? [];
  const values = typeof source === 'string' ? source.split(/[、,，\s]+/) : source;
  if (!Array.isArray(values)) return [];
  const unique = new Map();
  values.forEach((entry, index) => {
    const authority = authorityFrom(entry, index, []);
    if (!authority) return;
    const key = authority.cooldownKey || authority.id || authority.name;
    if (!unique.has(key)) unique.set(key, authority);
  });
  return [...unique.values()];
}

function playerContext(options) {
  const source = options.playerContext ?? options.player ?? options.context ?? {};
  return source && typeof source === 'object' ? source : {};
}

function playerIdFrom(options, context) {
  return requiredText(options.playerId ?? context.playerId ?? context.userId ?? context.id, 'playerId');
}

function playerNameFrom(options, context, playerId) {
  return text(options.playerName ?? context.playerName ?? context.名号 ?? context.name) || playerId;
}

function materialLedger(options, context) {
  return options.materialLedger
    ?? options.materials
    ?? context.materialLedger
    ?? context.materials
    ?? context.彼岸炼器材料
    ?? context.彼岸大道至宝材料
    ?? {};
}

function receiptFor(state, operationId, action, playerId, targetId) {
  const receipt = state.receipts[operationId];
  if (!receipt) return null;
  if (receipt.action !== action || receipt.playerId !== playerId || (targetId && receipt.targetId !== targetId)) {
    throw forgeError('operation-conflict', 'operationId 已用于另一项大道炼制操作');
  }
  return copy(receipt.result);
}

function saveReceipt(state, operationId, action, playerId, targetId, result, now) {
  state.receipts[operationId] = {
    action,
    playerId,
    targetId,
    result: copy(result),
    at: timestamp(now),
  };
  const permanentStartIds = new Set(Object.values(state.startOperations || {})
    .flatMap((operations) => Object.keys(operations || {})));
  const transientIds = Object.keys(state.receipts).filter((id) => !permanentStartIds.has(id));
  for (const stale of transientIds.slice(
    0,
    Math.max(0, transientIds.length - OTHER_SHORE_DAO_TREASURE_FORGE_RECEIPT_LIMIT),
  )) {
    delete state.receipts[stale];
  }
  return copy(result);
}

function permanentStartFor(state, playerId, operationId, recipeId) {
  const record = state.startOperations[playerId]?.[operationId];
  if (!record) return null;
  if (record.recipeId !== recipeId) {
    throw forgeError('operation-conflict', 'operationId 已用于另一项大道炼制操作');
  }
  return copy(record.result);
}

function savePermanentStart(state, playerId, operationId, recipeId, result, now) {
  state.startOperations[playerId] ||= {};
  state.startOperations[playerId][operationId] = {
    recipeId,
    result: copy(result),
    at: timestamp(now),
  };
}

function forgeStatus(record, now) {
  if (!record) return 'idle';
  if (record.status === 'claimed') return 'claimed';
  return timestamp(now) >= record.readyAt ? 'ready' : 'forging';
}

function buildConsumption(validation, recipe, treasures) {
  const consumedTreasures = recipe.requirements.consumeInnateTreasures
    ? treasures.slice(0, recipe.requirements.innateTreasures)
    : [];
  return {
    materials: copy(validation.requiredMaterials),
    innateTreasures: consumedTreasures,
    innateTreasureCount: consumedTreasures.length,
    daoFruit: recipe.id === 'dao-fruit-five-treasure',
    quasiImmortalEmperorSources: whole(recipe.requirements.quasiImmortalEmperorSources),
  };
}

function buildOutputPlan(recipe, forgeId, treasures, authorities, custom) {
  if (recipe.id === 'three-innate-erasure') {
    const selected = treasures.slice(0, 3);
    const fused = selected.flatMap((treasure) =>
      authorities.filter((entry) => entry.sourceTreasureId === treasure.id));
    if (selected.some((treasure) => !fused.some((entry) => entry.sourceTreasureId === treasure.id))) {
      throw forgeError('authorities-missing', '三宝归墟法要求每件先天至宝至少拥有一项主动或被动权柄');
    }
    return {
      authorityMode: recipe.output.authorityMode,
      authorities: fused.map((entry) => ({ ...entry, enhanced: true, mode: 'fused' })),
      cooldownMultiplier: recipe.output.cooldownMultiplier,
      innateTreasuresPreserved: false,
    };
  }
  if (recipe.id === 'dao-fruit-five-treasure') {
    const selectedIds = new Set(treasures.slice(0, 5).map((entry) => entry.id));
    const authorityPool = authorities.filter((entry) => selectedIds.has(entry.sourceTreasureId));
    if (!authorityPool.length) {
      throw forgeError('authorities-missing', '道果五宝法需要至少选择一项候选权柄');
    }
    const chosen = authorityPool[parseInt(hash(`${forgeId}:authority`), 36) % authorityPool.length];
    return {
      authorityMode: recipe.output.authorityMode,
      authorities: [{ ...chosen, enhanced: true, mode: 'random-enhanced' }],
      authorityPool: authorityPool.map((entry) => entry.name),
      cooldownMultiplier: recipe.output.cooldownMultiplier,
      innateTreasuresPreserved: true,
      preservedInnateTreasures: copy(treasures.slice(0, 5)),
    };
  }
  if (recipe.id === 'return-truth-edit') {
    if (custom.length !== 3) {
      throw forgeError('authorities-invalid', '还真编权法需要恰好三项不同的自定义强化权柄');
    }
    return {
      authorityMode: recipe.output.authorityMode,
      authorities: custom.map((authority) => ({
        ...authority,
        enhanced: true,
        mode: 'return-truth-edited',
      })),
      cooldownMultiplier: recipe.output.cooldownMultiplier,
      innateTreasuresPreserved: true,
    };
  }
  throw forgeError('method-unavailable', '第二法尚缺彼岸古法正文，开炉状态保持锁定');
}

function buildTreasure(record) {
  const authorities = copy(record.output.authorities);
  return {
    id: `other-shore-dao-treasure-${hash(record.forgeId)}`,
    name: record.treasureName,
    class: '装备',
    type: '至宝',
    品阶: '大道至宝',
    大道至宝本体: true,
    ownerId: record.playerId,
    ownerName: record.playerName,
    author_name: record.playerId,
    绑定者: record.playerId,
    recipeId: record.recipeId,
    recipeName: record.recipeName,
    sourceForgeId: record.forgeId,
    authorityMode: record.output.authorityMode,
    authorities,
    大道权柄: authorities.map((entry) => entry.name),
    cooldownMultiplier: record.output.cooldownMultiplier,
    冷却倍率: record.output.cooldownMultiplier,
    dimensionTravel: {
      canTearDimensions: true,
      canCarryLowerRealmTravellers: true,
      preparationRequired: true,
      destinationLimit: 'below-thousand-dimensional-ancient-realm',
    },
    completedAt: record.readyAt,
    数量: 1,
    稀有度: 10,
    islockd: 1,
    不可交易: true,
  };
}

export function ensureOtherShoreDaoTreasureForgeState(world = {}) {
  if (!world || typeof world !== 'object') throw new Error('彼岸世界状态无效');
  if (!world.progression || typeof world.progression !== 'object') world.progression = {};
  const current = world.progression.forge;
  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    world.progression.forge = { version: 1, players: {}, receipts: {}, startOperations: {} };
  }
  const state = world.progression.forge;
  state.version = 1;
  if (!state.players || typeof state.players !== 'object' || Array.isArray(state.players)) state.players = {};
  if (!state.receipts || typeof state.receipts !== 'object' || Array.isArray(state.receipts)) state.receipts = {};
  if (!state.startOperations || typeof state.startOperations !== 'object' || Array.isArray(state.startOperations)) {
    state.startOperations = {};
  }
  for (const [playerId, operations] of Object.entries(state.startOperations)) {
    if (!operations || typeof operations !== 'object' || Array.isArray(operations)) continue;
    for (const [operationId, record] of Object.entries(operations)) {
      if (!record?.result || state.receipts[operationId]) continue;
      state.receipts[operationId] = {
        action: 'start',
        playerId,
        targetId: record.recipeId,
        result: copy(record.result),
        at: timestamp(record.at ?? record.result.startedAt ?? 0),
      };
    }
  }
  return state;
}

export function startOtherShoreDaoTreasureForge(world, options = {}) {
  const state = ensureOtherShoreDaoTreasureForgeState(world);
  const context = playerContext(options);
  const playerId = playerIdFrom(options, context);
  const playerName = playerNameFrom(options, context, playerId);
  const operationId = requiredText(options.operationId, 'operationId');
  const recipe = getOtherShoreDaoTreasureRecipe(options.recipeId ?? options.recipe ?? options.method);
  if (!recipe) throw forgeError('unknown-recipe', '未知大道至宝配方');
  const permanentReplay = permanentStartFor(state, playerId, operationId, recipe.id);
  if (permanentReplay) return permanentReplay;
  const replay = receiptFor(state, operationId, 'start', playerId, recipe.id);
  if (replay) return replay;
  if (recipe.id === 'custom-ancient-method') {
    throw forgeError('method-unavailable', '第二法尚缺彼岸古法正文，开炉状态保持锁定');
  }
  const existing = state.players[playerId];
  if (existing && forgeStatus(existing, options.now ?? Date.now()) !== 'claimed') {
    throw forgeError('forge-active', '当前已有大道至宝处于炼制或待领取状态', {
      forgeId: existing.forgeId,
      status: forgeStatus(existing, options.now ?? Date.now()),
    });
  }

  const treasures = selectedTreasures(options, context);
  const selected = selectedAuthorities(options, context, treasures);
  const custom = customAuthorities(options, context);
  const validationInput = {
    ...context,
    ...options,
    currentLayer: options.currentLayer
      ?? context.currentLayer
      ?? context.other_shore?.layer,
    materials: materialLedger(options, context),
    innateTreasures: treasures,
    knownRecipes: options.knownRecipes
      ?? context.knownRecipes
      ?? context.彼岸大道至宝炼制法
      ?? context.大道至宝炼制法,
    customAuthorities: custom,
  };
  const validation = validateOtherShoreDaoTreasureRecipe(recipe.id, validationInput);
  if (!validation.ok) {
    throw forgeError('requirements-missing', '大道至宝炼制条件尚未齐备', validation);
  }
  const requiredTreasureCount = whole(recipe.requirements.innateTreasures);
  if (requiredTreasureCount && treasures.length !== requiredTreasureCount) {
    throw forgeError(
      'treasure-selection-invalid',
      `${recipe.name}需要恰好选择${requiredTreasureCount}件不同的先天至宝`,
    );
  }

  const startedAt = timestamp(options.now ?? Date.now());
  const forgeId = `other-shore-forge-${hash(`${playerId}:${operationId}`)}`;
  const output = buildOutputPlan(recipe, forgeId, treasures, selected, custom);
  const record = {
    version: 1,
    forgeId,
    playerId,
    playerName,
    treasureName: text(options.treasureName) || `${recipe.name}·大道至宝`,
    status: 'forging',
    recipeId: recipe.id,
    recipeName: recipe.name,
    startedAt,
    readyAt: startedAt + OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS,
    completedAt: null,
    claimedAt: null,
    consumption: buildConsumption(validation, recipe, treasures),
    output,
    treasure: null,
  };
  state.players[playerId] = record;
  const result = {
    started: true,
    duplicate: false,
    forgeId,
    playerId,
    status: record.status,
    recipeId: record.recipeId,
    recipeName: record.recipeName,
    startedAt: record.startedAt,
    readyAt: record.readyAt,
    consumption: copy(record.consumption),
    output: copy(record.output),
  };
  const saved = saveReceipt(state, operationId, 'start', playerId, recipe.id, result, startedAt);
  savePermanentStart(state, playerId, operationId, recipe.id, saved, startedAt);
  return saved;
}

export function claimOtherShoreDaoTreasureForge(world, options = {}) {
  const state = ensureOtherShoreDaoTreasureForgeState(world);
  const context = playerContext(options);
  const playerId = playerIdFrom(options, context);
  const operationId = requiredText(options.operationId, 'operationId');
  const requestedForgeId = text(options.forgeId);
  const replay = receiptFor(state, operationId, 'claim', playerId, requestedForgeId);
  if (replay) return replay;
  const record = state.players[playerId];
  if (!record || (requestedForgeId && requestedForgeId !== record.forgeId)) {
    throw forgeError('forge-missing', '大道至宝炼制记录不存在或已经变化');
  }
  const now = timestamp(options.now ?? Date.now());
  if (record.status === 'claimed') {
    const duplicate = {
      claimed: false,
      duplicate: true,
      forgeId: record.forgeId,
      playerId,
      claimedAt: record.claimedAt,
      treasure: copy(record.treasure),
    };
    return saveReceipt(state, operationId, 'claim', playerId, record.forgeId, duplicate, now);
  }
  if (now < record.readyAt) {
    throw forgeError('forge-not-ready', '大道炉仍在炼制', {
      forgeId: record.forgeId,
      readyAt: record.readyAt,
      remainingMs: record.readyAt - now,
    });
  }
  record.status = 'claimed';
  record.completedAt = record.readyAt;
  record.claimedAt = now;
  record.treasure ||= buildTreasure(record);
  const result = {
    claimed: true,
    duplicate: false,
    forgeId: record.forgeId,
    playerId,
    completedAt: record.completedAt,
    claimedAt: record.claimedAt,
    treasure: copy(record.treasure),
  };
  return saveReceipt(state, operationId, 'claim', playerId, record.forgeId, result, now);
}

function serializeForge(record, now) {
  if (!record) return null;
  const status = forgeStatus(record, now);
  const elapsed = Math.min(OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS, Math.max(0, timestamp(now) - record.startedAt));
  return {
    forgeId: record.forgeId,
    status,
    recipeId: record.recipeId,
    recipeName: record.recipeName,
    treasureName: record.treasureName,
    startedAt: record.startedAt,
    readyAt: record.readyAt,
    completedAt: record.completedAt,
    claimedAt: record.claimedAt,
    remainingMs: status === 'forging' ? record.readyAt - timestamp(now) : 0,
    progress: Number(((elapsed / OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS) * 100).toFixed(2)),
    canClaim: status === 'ready',
    consumption: copy(record.consumption),
    output: copy(record.output),
    treasure: status === 'claimed' ? copy(record.treasure) : null,
  };
}

export function serializeOtherShoreDaoTreasureForge(world, options = {}) {
  const state = ensureOtherShoreDaoTreasureForgeState(world);
  const playerId = text(options.playerId ?? options.viewerId);
  const now = timestamp(options.now ?? Date.now());
  return {
    version: state.version,
    durationMs: OTHER_SHORE_DAO_TREASURE_FORGE_DURATION_MS,
    playerId: playerId || null,
    forge: playerId ? serializeForge(state.players[playerId], now) : null,
  };
}

export const ensureOtherShoreForgeState = ensureOtherShoreDaoTreasureForgeState;
export const startOtherShoreForge = startOtherShoreDaoTreasureForge;
export const claimOtherShoreForge = claimOtherShoreDaoTreasureForge;
export const serializeOtherShoreForge = serializeOtherShoreDaoTreasureForge;

export default {
  ensureOtherShoreDaoTreasureForgeState,
  startOtherShoreDaoTreasureForge,
  claimOtherShoreDaoTreasureForge,
  serializeOtherShoreDaoTreasureForge,
};

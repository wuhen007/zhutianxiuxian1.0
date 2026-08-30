export const OTHER_SHORE_EXPEDITION_STAR_ID = '1,-1';
export const OTHER_SHORE_LOST_CACHE_TTL_MS = 30 * 60 * 1000;
export const OTHER_SHORE_FORCED_EVACUATION_LOSS_RATE = 0.3;
export const OTHER_SHORE_CAMP_CONTRIBUTION_CAP = 10;

export const OTHER_SHORE_CAMPAIGNS = Object.freeze({
  [OTHER_SHORE_EXPEDITION_STAR_ID]: Object.freeze({
    campaignId: 'xuanque-divine-furnace',
    starId: OTHER_SHORE_EXPEDITION_STAR_ID,
    name: '玄阙神炉',
    boss: Object.freeze({
      bossId: 'xuanque-calamity-core',
      name: '玄阙灾核',
      maxHp: 600_000_000_000_000,
    }),
    stages: Object.freeze([
      Object.freeze({ id: 'observe-scar', name: '观测灾痕', kind: 'explore' }),
      Object.freeze({ id: 'clear-variants', name: '清剿同源变异体', kind: 'battle' }),
      Object.freeze({ id: 'repair-star-eye', name: '修复古星阵眼', kind: 'operation' }),
      Object.freeze({ id: 'read-qin-inscription', name: '读取先秦炉铭', kind: 'lore' }),
      Object.freeze({ id: 'suppress-calamity-core', name: '镇压神炉灾核', kind: 'boss' }),
    ]),
  }),
});

export const OTHER_SHORE_CAMP_LEVELS = Object.freeze([
  Object.freeze({ level: 0, buildRequirement: 0, storageCapacity: 0, resilience: 0, healing: false }),
  Object.freeze({ level: 1, buildRequirement: 10, storageCapacity: 20, resilience: 6, healing: false }),
  Object.freeze({ level: 2, buildRequirement: 30, storageCapacity: 60, resilience: 12, healing: false }),
  Object.freeze({ level: 3, buildRequirement: 60, storageCapacity: 200, resilience: 20, healing: false }),
]);

const CAMPAIGN_PHASES = new Set(['visited', 'anchored', 'cleared']);
const LOOT_KINDS = new Set(['common', 'key', 'unique']);
const RECEIPT_LIMIT = 200;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function whole(value, fallback = 0) {
  return Math.max(0, Math.trunc(finite(value, fallback)));
}

function positive(value, label) {
  const number = finite(value, NaN);
  if (!(number > 0)) throw new Error(`${label}必须大于0`);
  return number;
}

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label}不能为空`);
  return text;
}

function copy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function timestamp(value) {
  return whole(value, Date.now());
}

function requireWorld(world) {
  if (!world || typeof world !== 'object') throw new TypeError('world 必须是世界文档');
  return world;
}

function requireStar(world, starId) {
  const id = requiredText(starId, 'starId');
  if (!world?.stars?.some(star => star.id === id)) throw new Error(`彼岸大星不存在：${id}`);
  return id;
}

function requireCampaign(starId) {
  const campaign = OTHER_SHORE_CAMPAIGNS[String(starId || '')];
  if (!campaign) throw new Error(`该大星尚未开放远征战役：${starId}`);
  return campaign;
}

function createCampaignState(campaign) {
  return {
    campaignId: campaign.campaignId,
    starId: campaign.starId,
    status: 'active',
    stageClears: campaign.stages.map(() => 0),
    clearCount: 0,
    participants: {},
    completions: {},
    boss: {
      bossId: campaign.boss.bossId,
      name: campaign.boss.name,
      maxHp: campaign.boss.maxHp,
      currentHp: campaign.boss.maxHp,
      status: 'active',
      contributions: {},
      defeatedAt: null,
      defeatedBy: null,
    },
    updatedAt: 0,
  };
}

export function ensureOtherShoreExpeditionState(world) {
  requireWorld(world);
  world.expedition ||= {};
  const state = world.expedition;
  state.version = 1;
  state.camps ||= {};
  state.campaigns ||= {};
  state.runs ||= {};
  state.downed ||= {};
  state.lostCaches ||= {};
  state.settlements ||= {};
  state.claims ||= {};
  state.receipts ||= {};
  for (const campaign of Object.values(OTHER_SHORE_CAMPAIGNS)) {
    state.campaigns[campaign.starId] ||= createCampaignState(campaign);
  }
  return state;
}

function receiptFor(scope, operationId, action, actorId) {
  const id = requiredText(operationId, 'operationId');
  const receipt = scope.receipts?.[id];
  if (!receipt) return null;
  if (receipt.action !== action || receipt.actorId !== actorId) {
    throw new Error('operationId 已用于其他彼岸远征行动');
  }
  return copy(receipt.result);
}

function saveReceipt(scope, operationId, action, actorId, result, now) {
  scope.receipts ||= {};
  scope.receipts[operationId] = {
    action,
    actorId,
    at: timestamp(now),
    result: copy(result),
  };
  const stale = Object.keys(scope.receipts).slice(0, -RECEIPT_LIMIT);
  for (const id of stale) delete scope.receipts[id];
  return result;
}

function campLevelFor(buildPoints) {
  let level = 0;
  for (const profile of OTHER_SHORE_CAMP_LEVELS) {
    if (buildPoints >= profile.buildRequirement) level = profile.level;
  }
  return level;
}

function campStatus(camp, fallback = 'active') {
  if (camp.level === 0) return 'unbuilt';
  const profile = OTHER_SHORE_CAMP_LEVELS[camp.level];
  if (camp.stress >= profile.resilience) return 'disabled';
  return fallback;
}

function campFor(world, starId) {
  const state = ensureOtherShoreExpeditionState(world);
  const id = requireStar(world, starId);
  state.camps[id] ||= {
    version: 1,
    starId: id,
    level: 0,
    buildPoints: 0,
    defenseReserve: 0,
    stress: 0,
    status: 'unbuilt',
    contributors: {},
    defenders: {},
    lastSiege: null,
    updatedAt: 0,
  };
  return state.camps[id];
}

export function getOtherShoreCamp(world, starId) {
  return campFor(world, starId);
}

export function getOtherShoreCampCapabilities(camp) {
  const level = Math.min(3, whole(camp?.level));
  const profile = OTHER_SHORE_CAMP_LEVELS[level];
  const usable = level > 0 && camp?.status !== 'disabled';
  return {
    level,
    usable,
    storageCapacity: profile.storageCapacity,
    resilience: profile.resilience,
    canStore: usable,
    canEvacuate: usable,
    canHeal: false,
  };
}

export function contributeOtherShoreCamp(world, {
  starId,
  playerId,
  playerName,
  amount = 1,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const id = requiredText(playerId, 'playerId');
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(state, operation, 'camp_build', id);
  if (previous) return previous;
  const camp = campFor(world, starId);
  const requested = positive(amount, '营地建设贡献');
  const maximum = OTHER_SHORE_CAMP_LEVELS.at(-1).buildRequirement;
  const contribution = camp.contributors[id] || {
    playerName: String(playerName || id),
    amount: 0,
  };
  const granted = Math.min(
    requested,
    Math.max(0, OTHER_SHORE_CAMP_CONTRIBUTION_CAP - contribution.amount),
    Math.max(0, maximum - camp.buildPoints),
  );
  const oldLevel = camp.level;
  camp.buildPoints += granted;
  camp.level = campLevelFor(camp.buildPoints);
  camp.status = campStatus(camp);
  camp.updatedAt = timestamp(now);
  if (granted > 0) {
    contribution.amount += granted;
    camp.contributors[id] = contribution;
  }
  const result = {
    starId: camp.starId,
    granted,
    buildPoints: camp.buildPoints,
    level: camp.level,
    leveledUp: camp.level > oldLevel,
    status: camp.status,
  };
  return saveReceipt(state, operation, 'camp_build', id, result, now);
}

export function reinforceOtherShoreCamp(world, {
  starId,
  playerId,
  playerName,
  amount = 1,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const id = requiredText(playerId, 'playerId');
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(state, operation, 'camp_reinforce', id);
  if (previous) return previous;
  const camp = campFor(world, starId);
  if (camp.level === 0) throw new Error('营地尚未建成');
  const supplied = positive(amount, '营地抗压贡献');
  const repaired = Math.min(camp.stress, supplied);
  camp.stress -= repaired;
  const profile = OTHER_SHORE_CAMP_LEVELS[camp.level];
  const reserveAdded = Math.min(profile.resilience - camp.defenseReserve, supplied - repaired);
  camp.defenseReserve += reserveAdded;
  camp.status = campStatus(camp);
  camp.updatedAt = timestamp(now);
  const defense = camp.defenders[id] ||= {
    playerName: String(playerName || id),
    amount: 0,
  };
  defense.amount += repaired + reserveAdded;
  const result = {
    starId: camp.starId,
    repaired,
    reserveAdded,
    stress: camp.stress,
    defenseReserve: camp.defenseReserve,
    status: camp.status,
  };
  return saveReceipt(state, operation, 'camp_reinforce', id, result, now);
}

export function applyOtherShoreCampSiege(world, {
  starId,
  purge = {},
  pressure = purge.pressure,
  occupied = purge.occupied,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(state, operation, 'camp_siege', 'purge');
  if (previous) return previous;
  const camp = campFor(world, starId);
  const requirement = Math.max(1, whole(purge.defenseRequirement, 1));
  const globalDefense = Math.min(requirement, whole(purge.defense));
  const rawAttack = whole(pressure) + (occupied === true ? 4 : 0);
  const attack = Math.ceil(rawAttack * (1 - globalDefense / requirement));
  const absorbed = Math.min(camp.defenseReserve, attack);
  camp.defenseReserve -= absorbed;
  const stressGained = camp.level === 0 ? 0 : Math.max(0, attack - absorbed);
  camp.stress += stressGained;
  camp.status = campStatus(camp, attack > 0 ? 'besieged' : 'active');
  camp.lastSiege = {
    rawAttack,
    attack,
    globalDefense,
    occupied: occupied === true,
    at: timestamp(now),
  };
  camp.updatedAt = timestamp(now);
  const result = {
    starId: camp.starId,
    rawAttack,
    attack,
    absorbed,
    stressGained,
    stress: camp.stress,
    status: camp.status,
  };
  return saveReceipt(state, operation, 'camp_siege', 'purge', result, now);
}

function createBag() {
  return { carried: [], stored: [] };
}

function normalizeLootItem(item) {
  const source = typeof item === 'string' ? { name: item } : item;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('战利品必须是名称或对象');
  }
  const name = requiredText(source.name ?? source.名称, '战利品名称');
  const inferredKind = source.unique === true ? 'unique' : source.key === true ? 'key' : 'common';
  const kind = String(source.kind || inferredKind);
  if (!LOOT_KINDS.has(kind)) throw new Error(`未知战利品类型：${kind}`);
  const quantity = whole(source.quantity ?? source.数量 ?? 1);
  if (quantity === 0) throw new Error('战利品数量必须大于0');
  const normalized = copy(source);
  delete normalized.名称;
  delete normalized.数量;
  delete normalized.quantity;
  return {
    ...normalized,
    id: String(source.id || `${kind}:${name}`),
    name,
    kind,
    quantity,
  };
}

function addLoot(target, items) {
  for (const source of items || []) {
    const item = normalizeLootItem(source);
    const existing = target.find(entry => entry.id === item.id && entry.kind === item.kind);
    if (existing) existing.quantity += item.quantity;
    else target.push(item);
  }
  return target;
}

function lootUnits(items) {
  return (items || []).reduce((sum, item) => sum + whole(item.quantity), 0);
}

export function getOtherShoreExpeditionBagSummary(run) {
  const bag = run?.bag || createBag();
  return {
    carried: copy(bag.carried || []),
    stored: copy(bag.stored || []),
    carriedUnits: lootUnits(bag.carried),
    storedUnits: lootUnits(bag.stored),
  };
}

function requireRun(run) {
  if (!run || typeof run !== 'object' || !run.runId || !run.playerId || !run.starId) {
    throw new TypeError('彼岸远征会话无效');
  }
  run.bag ||= createBag();
  run.bag.carried ||= [];
  run.bag.stored ||= [];
  run.receipts ||= {};
  run.history ||= [];
  return run;
}

function runFor(world, { playerId, runId } = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const id = requiredText(playerId, 'playerId');
  const run = state.runs[id];
  if (!run) throw new Error('当前修士没有进行中的彼岸远征');
  if (runId !== undefined && requiredText(runId, 'runId') !== run.runId) {
    throw new Error('彼岸远征会话已经变化');
  }
  return requireRun(run);
}

export function getOtherShoreExpeditionRun(world, options = {}) {
  return runFor(world, options);
}

function requireRunStatus(run, allowed) {
  if (!allowed.includes(run.status)) throw new Error(`当前远征状态不允许该行动：${run.status}`);
}

export function startOtherShoreExpedition(world, {
  starId = OTHER_SHORE_EXPEDITION_STAR_ID,
  playerId,
  playerName,
  runId,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const star = requireStar(world, starId);
  const campaign = requireCampaign(star);
  if (!CAMPAIGN_PHASES.has(world.states?.[star]?.phase)) throw new Error('踏足该大星后才能开始远征');
  const id = requiredText(playerId, 'playerId');
  const startedAt = timestamp(now);
  const resolvedRunId = String(runId || `other-shore-${startedAt}-${id}`);
  const operation = requiredText(operationId || resolvedRunId, 'operationId');
  const previous = receiptFor(state, operation, 'expedition_start', id);
  if (previous) return previous;
  const current = state.runs[id];
  if (current && current.status !== 'evacuated') throw new Error('当前修士已有进行中的彼岸远征');
  const campaignState = state.campaigns[star];
  if (campaignState.participants[id]?.clears > 0) throw new Error('当前修士已经完成玄阙神炉首通');
  const participant = campaignState.participants[id] ||= {
    playerName: String(playerName || id),
    starts: 0,
    clears: 0,
    highestStage: 0,
  };
  participant.starts++;
  campaignState.updatedAt = startedAt;
  const run = {
    version: 1,
    runId: resolvedRunId,
    campaignId: campaign.campaignId,
    starId: star,
    playerId: id,
    playerName: String(playerName || id),
    status: 'active',
    stageIndex: 0,
    startedAt,
    updatedAt: startedAt,
    bag: createBag(),
    downed: null,
    rescue: null,
    settlement: null,
    receipts: {},
    history: [{ type: 'started', at: startedAt }],
  };
  state.runs[id] = run;
  return saveReceipt(state, operation, 'expedition_start', id, { run }, now);
}

function completeRun(campaignState, run, at) {
  if (campaignState.completions[run.runId]) return false;
  addLoot(run.bag.carried, [{
    id: 'key:era-power',
    name: '纪元之力',
    kind: 'key',
    quantity: 1,
  }]);
  run.stageIndex = 5;
  run.status = 'ready_to_evac';
  run.completedAt = at;
  run.updatedAt = at;
  run.history.push({ type: 'campaign_completed', at });
  campaignState.completions[run.runId] = { playerId: run.playerId, at };
  const participant = campaignState.participants[run.playerId] ||= {
    playerName: run.playerName,
    starts: 1,
    clears: 0,
    highestStage: 0,
  };
  participant.highestStage = 5;
  participant.clears++;
  return true;
}

export function advanceOtherShoreExpedition(world, {
  playerId,
  runId,
  stageId,
  success = true,
  loot = [],
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const run = runFor(world, { playerId, runId });
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(run, operation, 'stage_advance', run.playerId);
  if (previous) return previous;
  requireRunStatus(run, ['active']);
  const campaign = requireCampaign(run.starId);
  const stage = campaign.stages[run.stageIndex];
  if (!stage) throw new Error('本轮远征战役已经完成');
  if (run.stageIndex >= campaign.stages.length - 1) throw new Error('第五阶段需挑战全服共享区域首领');
  if (stageId !== undefined && requiredText(stageId, 'stageId') !== stage.id) {
    throw new Error(`当前战役阶段已经变化：${stage.id}`);
  }
  const at = timestamp(now);
  if (success !== true) {
    const result = { advanced: false, stageIndex: run.stageIndex, stage: copy(stage), completed: false };
    return saveReceipt(run, operation, 'stage_advance', run.playerId, result, at);
  }
  addLoot(run.bag.carried, loot);
  const campaignState = state.campaigns[run.starId];
  campaignState.stageClears[run.stageIndex]++;
  run.stageIndex++;
  run.updatedAt = at;
  run.history.push({ type: 'stage_cleared', stageId: stage.id, at });
  const participant = campaignState.participants[run.playerId] ||= {
    playerName: run.playerName,
    starts: 1,
    clears: 0,
    highestStage: 0,
  };
  participant.highestStage = Math.max(participant.highestStage, run.stageIndex);
  let completed = false;
  if (run.stageIndex === campaign.stages.length - 1) {
    if (campaignState.boss.status === 'defeated') completed = completeRun(campaignState, run, at);
    else run.status = 'waiting_boss';
  }
  campaignState.updatedAt = at;
  const result = {
    advanced: true,
    clearedStage: copy(stage),
    stageIndex: run.stageIndex,
    nextStage: copy(campaign.stages[run.stageIndex] || null),
    completed,
    bag: getOtherShoreExpeditionBagSummary(run),
  };
  return saveReceipt(run, operation, 'stage_advance', run.playerId, result, at);
}

function campaignBossDamage(boss, { damage, battle, won } = {}) {
  const explicit = Number(damage);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const remaining = Number(battle?.B_hp ?? battle?.bossHp ?? battle?.enemyHp);
  if (Number.isFinite(remaining)) return Math.max(0, boss.currentHp - remaining);
  if (won === true || battle?.winner === 'A') return boss.currentHp;
  return 0;
}

export function applyOtherShoreCampaignBossBattle(world, {
  starId = OTHER_SHORE_EXPEDITION_STAR_ID,
  playerId,
  playerName,
  runId,
  damage,
  battle,
  won = false,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const run = runFor(world, { playerId, runId });
  const actor = run.playerId;
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(state, operation, 'campaign_boss_battle', actor);
  if (previous) return previous;
  const star = requireStar(world, starId);
  if (star !== run.starId) throw new Error(`必须位于区域首领大星 ${run.starId}`);
  requireRunStatus(run, ['waiting_boss']);
  const campaignState = state.campaigns[star];
  const boss = campaignState.boss;
  if (boss.status === 'defeated') throw new Error('玄阙灾核已经被镇压');
  const dealt = Math.min(boss.currentHp, campaignBossDamage(boss, { damage, battle, won }));
  const at = timestamp(now);
  if (dealt > 0) {
    boss.currentHp -= dealt;
    const contribution = boss.contributions[actor] ||= {
      playerName: String(playerName || run.playerName || actor),
      damage: 0,
    };
    contribution.damage += dealt;
    run.history.push({ type: 'campaign_boss_damage', damage: dealt, at });
  }
  const defeated = boss.currentHp <= 0;
  const completedPlayerIds = [];
  if (defeated) {
    boss.currentHp = 0;
    boss.status = 'defeated';
    boss.defeatedAt = at;
    boss.defeatedBy = actor;
    campaignState.status = 'completed';
    campaignState.stageClears[4]++;
    campaignState.clearCount++;
    for (const candidate of Object.values(state.runs)) {
      if (candidate.campaignId !== campaignState.campaignId || candidate.status !== 'waiting_boss') continue;
      if (completeRun(campaignState, candidate, at)) completedPlayerIds.push(candidate.playerId);
    }
  }
  campaignState.updatedAt = at;
  run.updatedAt = at;
  const result = {
    damage: dealt,
    currentHp: boss.currentHp,
    maxHp: boss.maxHp,
    defeated,
    completedPlayerIds,
  };
  return saveReceipt(state, operation, 'campaign_boss_battle', actor, result, at);
}

export function depositOtherShoreExpeditionLoot(world, {
  playerId,
  runId,
  operationId,
  now = Date.now(),
} = {}) {
  const run = runFor(world, { playerId, runId });
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(run, operation, 'loot_deposit', run.playerId);
  if (previous) return previous;
  requireRunStatus(run, ['active', 'waiting_boss', 'ready_to_evac', 'stabilized']);
  const camp = campFor(world, run.starId);
  const capabilities = getOtherShoreCampCapabilities(camp);
  if (!capabilities.canStore) throw new Error('当前大星营地不可用');
  let remainingCapacity = Math.max(0, capabilities.storageCapacity - lootUnits(run.bag.stored));
  const moved = [];
  const carried = [];
  for (const item of run.bag.carried) {
    const quantity = Math.min(item.quantity, remainingCapacity);
    if (quantity > 0) {
      addLoot(moved, [{ ...item, quantity }]);
      remainingCapacity -= quantity;
    }
    if (item.quantity > quantity) carried.push({ ...item, quantity: item.quantity - quantity });
  }
  addLoot(run.bag.stored, moved);
  run.bag.carried = carried;
  run.updatedAt = timestamp(now);
  const result = {
    moved: copy(moved),
    movedUnits: lootUnits(moved),
    ...getOtherShoreExpeditionBagSummary(run),
  };
  return saveReceipt(run, operation, 'loot_deposit', run.playerId, result, now);
}

function registerDowned(state, run, now, reason) {
  state.downed[run.starId] ||= {};
  state.downed[run.starId][run.playerId] = {
    runId: run.runId,
    playerId: run.playerId,
    playerName: run.playerName,
    starId: run.starId,
    downedAt: timestamp(now),
    reason: String(reason || '战斗失利'),
  };
}

function clearDowned(state, run) {
  const entries = state.downed?.[run.starId];
  if (entries?.[run.playerId]?.runId === run.runId) delete entries[run.playerId];
  if (entries && Object.keys(entries).length === 0) delete state.downed[run.starId];
}

export function markOtherShoreExpeditionDowned(world, {
  playerId,
  runId,
  reason,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const run = runFor(world, { playerId, runId });
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(run, operation, 'expedition_downed', run.playerId);
  if (previous) return previous;
  requireRunStatus(run, ['active', 'waiting_boss', 'ready_to_evac']);
  const at = timestamp(now);
  const resumeStatus = run.status;
  run.status = 'downed';
  run.downed = { at, reason: String(reason || '战斗失利'), resumeStatus };
  run.updatedAt = at;
  run.history.push({ type: 'downed', at, reason: run.downed.reason });
  registerDowned(state, run, at, reason);
  const result = { status: run.status, starId: run.starId, downedAt: at };
  return saveReceipt(run, operation, 'expedition_downed', run.playerId, result, at);
}

export function rescueOtherShoreExpedition(world, {
  playerId,
  runId,
  targetPlayerId,
  targetRunId,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const rescuerRun = runFor(world, { playerId, runId });
  const targetRun = runFor(world, { playerId: targetPlayerId, runId: targetRunId });
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(targetRun, operation, 'expedition_rescue', rescuerRun.playerId);
  if (previous) return previous;
  requireRunStatus(rescuerRun, ['active', 'waiting_boss', 'ready_to_evac', 'stabilized']);
  requireRunStatus(targetRun, ['downed']);
  if (rescuerRun.playerId === targetRun.playerId) throw new Error('濒危修士需要由其他修士救援');
  if (rescuerRun.starId !== targetRun.starId) throw new Error('只有同一大星的修士可以救援');
  const indexed = state.downed?.[targetRun.starId]?.[targetRun.playerId];
  if (!indexed || indexed.runId !== targetRun.runId) throw new Error('该濒危目标已经失效');
  const at = timestamp(now);
  targetRun.status = 'stabilized';
  targetRun.rescue = {
    rescuerId: rescuerRun.playerId,
    rescuerName: rescuerRun.playerName,
    at,
  };
  targetRun.updatedAt = at;
  targetRun.history.push({ type: 'rescued', rescuerId: rescuerRun.playerId, at });
  rescuerRun.history.push({ type: 'rescue', targetId: targetRun.playerId, at });
  clearDowned(state, targetRun);
  const result = {
    rescued: true,
    targetId: targetRun.playerId,
    status: targetRun.status,
    healed: false,
  };
  return saveReceipt(targetRun, operation, 'expedition_rescue', rescuerRun.playerId, result, at);
}

function reserveClaim(state, run, claimId, action, now) {
  const existing = state.claims[claimId];
  if (existing && (existing.runId !== run.runId || existing.playerId !== run.playerId)) {
    throw new Error('claimId 已用于其他远征结算');
  }
  state.claims[claimId] ||= {
    claimId,
    runId: run.runId,
    playerId: run.playerId,
    action,
    createdAt: timestamp(now),
  };
}

function finishEvacuation(world, { playerId, runId, mode, claimId, now = Date.now() }) {
  const state = ensureOtherShoreExpeditionState(world);
  const run = runFor(world, { playerId, runId });
  const id = requiredText(claimId, 'claimId');
  const action = mode === 'forced' ? 'evacuation_force' : 'evacuation_normal';
  const existing = state.settlements[id];
  if (existing) {
    if (existing.runId !== run.runId || existing.playerId !== run.playerId || existing.action !== action) {
      throw new Error('claimId 已用于其他远征结算');
    }
    return { duplicate: true, settlement: copy(existing) };
  }
  if (run.settlement) throw new Error('该远征会话已经生成其他结算');
  requireRunStatus(run, ['active', 'waiting_boss', 'ready_to_evac', 'stabilized', 'downed']);
  if (mode === 'normal') {
    if (run.status === 'downed') throw new Error('濒危状态需先获救或强制撤离');
    const capabilities = getOtherShoreCampCapabilities(campFor(world, run.starId));
    if (!capabilities.canEvacuate) throw new Error('当前大星营地不可用，需强制撤离');
  }
  reserveClaim(state, run, id, action, now);
  const at = timestamp(now);
  const safeItems = copy(run.bag.stored);
  const lostCommon = [];
  const cacheItems = [];
  if (mode === 'normal') {
    addLoot(safeItems, run.bag.carried);
  } else {
    for (const item of run.bag.carried) {
      if (item.kind !== 'common') {
        addLoot(cacheItems, [item]);
        continue;
      }
      const lost = Math.floor(item.quantity * OTHER_SHORE_FORCED_EVACUATION_LOSS_RATE);
      if (lost > 0) addLoot(lostCommon, [{ ...item, quantity: lost }]);
      if (item.quantity > lost) addLoot(safeItems, [{ ...item, quantity: item.quantity - lost }]);
    }
  }
  let lostCacheId = null;
  if (cacheItems.length > 0) {
    lostCacheId = `other-shore-lost-${run.runId}-${at}`;
    state.lostCaches[lostCacheId] = {
      version: 1,
      cacheId: lostCacheId,
      ownerId: run.playerId,
      runId: run.runId,
      starId: run.starId,
      status: 'available',
      items: cacheItems,
      createdAt: at,
      expiresAt: at + OTHER_SHORE_LOST_CACHE_TTL_MS,
      recoveredAt: null,
    };
  }
  run.bag = createBag();
  run.status = 'evacuated';
  run.updatedAt = at;
  run.endedAt = at;
  run.history.push({ type: action, at, claimId: id });
  const settlement = {
    version: 1,
    claimId: id,
    runId: run.runId,
    playerId: run.playerId,
    starId: run.starId,
    mode,
    action,
    state: 'pending',
    items: safeItems,
    lostCommon,
    lostCacheId,
    createdAt: at,
    claimedAt: null,
  };
  state.settlements[id] = settlement;
  run.settlement = { claimId: id, action };
  clearDowned(state, run);
  return { duplicate: false, settlement: copy(settlement) };
}

export function evacuateOtherShoreExpedition(world, options = {}) {
  return finishEvacuation(world, { ...options, mode: 'normal' });
}

export function forceEvacuateOtherShoreExpedition(world, options = {}) {
  return finishEvacuation(world, { ...options, mode: 'forced' });
}

export function recoverOtherShoreLostCache(world, {
  playerId,
  runId,
  cacheId,
  operationId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const run = runFor(world, { playerId, runId });
  const operation = requiredText(operationId, 'operationId');
  const previous = receiptFor(run, operation, 'lost_cache_recover', run.playerId);
  if (previous) return previous;
  requireRunStatus(run, ['active']);
  const id = requiredText(cacheId, 'cacheId');
  const cache = state.lostCaches[id];
  if (!cache || cache.status !== 'available') throw new Error('遗失行囊已经失效');
  const at = timestamp(now);
  if (at >= cache.expiresAt) {
    cache.status = 'expired';
    throw new Error('遗失行囊已经消散');
  }
  if (cache.ownerId !== run.playerId) throw new Error('该遗失行囊不属于当前修士');
  if (cache.starId !== run.starId) throw new Error('必须抵达遗失行囊所在大星');
  addLoot(run.bag.carried, cache.items);
  cache.status = 'recovered';
  cache.recoveredAt = at;
  cache.recoveredByRunId = run.runId;
  run.updatedAt = at;
  run.history.push({ type: 'lost_cache_recovered', cacheId: id, at });
  const result = { recovered: true, cacheId: id, items: copy(cache.items) };
  return saveReceipt(run, operation, 'lost_cache_recover', run.playerId, result, at);
}

export function claimOtherShoreExpeditionSettlement(world, {
  playerId,
  claimId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const owner = requiredText(playerId, 'playerId');
  const id = requiredText(claimId, 'claimId');
  const settlement = state.settlements[id];
  if (!settlement || settlement.playerId !== owner) throw new Error('远征结算不存在或已变化');
  const itemCount = lootUnits(settlement.items);
  if (settlement.state === 'claimed') {
    return {
      claimed: false,
      duplicate: true,
      claimId: id,
      runId: settlement.runId,
      itemCount,
      items: copy(settlement.items),
    };
  }
  const claimedAt = timestamp(now);
  state.claims[id] = {
    ...state.claims[id],
    state: 'claimed',
    itemCount,
    claimedAt,
  };
  settlement.state = 'claimed';
  settlement.claimedAt = claimedAt;
  if (state.runs[owner]?.runId === settlement.runId && state.runs[owner].status === 'evacuated') {
    delete state.runs[owner];
  }
  return {
    claimed: true,
    duplicate: false,
    claimId: id,
    runId: settlement.runId,
    itemCount,
    items: copy(settlement.items),
  };
}

export function serializeOtherShoreExpedition(world, {
  starId = OTHER_SHORE_EXPEDITION_STAR_ID,
  viewerId,
  now = Date.now(),
} = {}) {
  const state = ensureOtherShoreExpeditionState(world);
  const star = requireStar(world, starId);
  const campaign = OTHER_SHORE_CAMPAIGNS[star] || null;
  const campaignState = campaign ? state.campaigns[star] : null;
  const camp = campFor(world, star);
  const targets = Object.values(state.downed[star] || {})
    .filter(target => target.playerId !== String(viewerId || ''))
    .map(target => ({
      playerId: target.playerId,
      playerName: target.playerName,
      downedAt: target.downedAt,
    }));
  const checkedAt = timestamp(now);
  const viewer = String(viewerId || '');
  const lostCaches = Object.values(state.lostCaches)
    .filter(cache => cache.ownerId === viewer && cache.status === 'available' && checkedAt < cache.expiresAt)
    .map(cache => ({
      cacheId: cache.cacheId,
      starId: cache.starId,
      expiresAt: cache.expiresAt,
      itemCount: lootUnits(cache.items),
    }));
  const run = state.runs[viewer];
  const settlements = Object.values(state.settlements)
    .filter(settlement => settlement.playerId === viewer && settlement.state === 'pending')
    .map(settlement => ({
      claimId: settlement.claimId,
      action: settlement.action,
      itemCount: lootUnits(settlement.items),
      createdAt: settlement.createdAt,
    }));
  const runSettlement = run?.settlement
    ? state.settlements[run.settlement.claimId]
    : null;
  const runCampaign = run ? OTHER_SHORE_CAMPAIGNS[run.starId] : null;
  return {
    version: state.version,
    starId: star,
    camp: {
      starId: camp.starId,
      level: camp.level,
      buildPoints: camp.buildPoints,
      defenseReserve: camp.defenseReserve,
      stress: camp.stress,
      status: camp.status,
      contributorCount: Object.keys(camp.contributors).length,
      ...getOtherShoreCampCapabilities(camp),
    },
    campaign: campaign ? {
      campaignId: campaign.campaignId,
      name: campaign.name,
      status: campaignState.status,
      clearCount: campaignState.clearCount,
      participantCount: Object.keys(campaignState.participants).length,
      stages: campaign.stages.map((stage, index) => ({
        ...stage,
        clearCount: campaignState.stageClears[index],
      })),
      boss: {
        bossId: campaignState.boss.bossId,
        name: campaignState.boss.name,
        status: campaignState.boss.status,
        currentHp: campaignState.boss.currentHp,
        maxHp: campaignState.boss.maxHp,
        viewerDamage: campaignState.boss.contributions[viewer]?.damage || 0,
      },
    } : null,
    rescue: {
      count: targets.length,
      targetIds: targets.map(target => target.playerId),
      targets,
    },
    viewer: {
      run: run ? {
        runId: run.runId,
        status: run.status,
        stageIndex: run.stageIndex,
        currentStage: copy(runCampaign?.stages[run.stageIndex] || null),
        bag: getOtherShoreExpeditionBagSummary(run),
        downed: copy(run.downed),
        rescue: copy(run.rescue),
        settlement: runSettlement ? {
          claimId: runSettlement.claimId,
          action: runSettlement.action,
          state: runSettlement.state,
          itemCount: lootUnits(runSettlement.items),
        } : null,
        pendingClaimId: runSettlement?.state === 'pending' ? runSettlement.claimId : null,
      } : null,
      lostCaches,
      settlements,
    },
  };
}

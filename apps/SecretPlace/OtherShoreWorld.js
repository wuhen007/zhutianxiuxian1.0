import { randomUUID } from 'node:crypto';
import { plugin } from '../../api/api.js';
import {
  Read_player,
  Read_najie,
  Write_player,
  Write_najie,
  bigNumberTransform,
  channel,
  existplayer,
  foundthing,
  zd_battle,
} from '../../model/xiuxian.js';
import { claimXianguBagItems } from './xianguBag.js';
import { normalizeRiftMemoryState } from '../../model/foreignCalamity.js';
import { readInnateTreasureState } from '../../model/innateTreasure.js';
import {
  applyTianmoCalamityRefinement,
  hasTianmoHuashengTechnique,
  isTianmoHuashengPhysique,
} from '../../model/tianmoHuasheng.js';
import {
  consumeSpiritHeart,
  getSpiritHeartMax,
  refreshSpiritHeart,
} from '../../model/spiritUniverse.js';
import {
  getOtherShoreSuppression,
  getOtherShoreTravelRule,
} from '../../model/otherShoreRules.js';
import {
  anchorOtherShoreStar,
  calculateOtherShoreTravel,
  contributeOtherShoreExploration,
  createOtherShoreWorld,
  getOtherShoreHexDistance,
  observeOtherShoreStars,
  otherShoreCoordinateId,
  serializeOtherShoreWorld,
  visitOtherShoreStar,
} from '../../model/otherShoreWorld.js';
import {
  OTHER_SHORE_THREAT_REFINEMENT_WEIGHT,
  advanceOtherShoreThreat,
  applyOtherShoreThreatOverlordBattle,
  chooseOtherShoreOverlordFate,
  claimOtherShoreThreatReward,
  createOtherShoreCalamityVariant,
  createOtherShorePurgeEnvoy,
  createOtherShoreThreatOverlordCombatant,
  ensureOtherShoreThreat,
  recordOtherShoreTreasureSignal,
  registerOtherShoreCalamityKill,
  registerOtherShorePurgeDefense,
  serializeOtherShoreThreat,
  startNextOtherShoreThreat,
} from '../../model/otherShoreThreat.js';
import {
  OTHER_SHORE_EXPEDITION_STAR_ID,
  advanceOtherShoreExpedition,
  applyOtherShoreCampaignBossBattle,
  applyOtherShoreCampSiege,
  claimOtherShoreExpeditionSettlement,
  contributeOtherShoreCamp,
  depositOtherShoreExpeditionLoot,
  ensureOtherShoreExpeditionState,
  evacuateOtherShoreExpedition,
  forceEvacuateOtherShoreExpedition,
  getOtherShoreExpeditionRun,
  markOtherShoreExpeditionDowned,
  recoverOtherShoreLostCache,
  reinforceOtherShoreCamp,
  rescueOtherShoreExpedition,
  serializeOtherShoreExpedition,
  startOtherShoreExpedition,
} from '../../model/otherShoreExpedition.js';
import {
  deliverOtherShorePlayerMutation,
  deliverOtherShorePlayerMutations,
  updateOtherShoreWorldState,
} from '../../model/otherShoreState.js';
import {
  createCanglanWebLink,
  registerCanglanWebController,
} from '../../model/endlessWebServer.js';
import { inspectPlayerAction } from '../../model/playerActionState.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const OTHER_SHORE_PLANE_ID = 3.8;
const OTHER_SHORE_ORIGIN_PLANE_ID = 3.5;
const WORLD_SEED = 'canglan-prime-v1';
const ACTION_RECEIPT_LIMIT = 24;
const THREAT_NEXT_CYCLE_DELAY_MS = 15 * 60 * 1000;
const THREAT_BATTLE_COOLDOWN_MS = 5 * 60 * 1000;
const EXPEDITION_BATTLE_COOLDOWN_MS = 2 * 60 * 1000;
const THREAT_BATTLE_LEASE_SECONDS = 180;
const RELEASE_THREAT_BATTLE_LEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;
const SESSION_MUTATION_FIELDS = Object.freeze([
  'other_shore',
  '心神',
  '心神恢复时间',
  '问仙令',
  '彼岸心神余程',
  '彼岸心神余程境界',
]);
const THREAT_BATTLE_MUTATION_FIELDS = Object.freeze([
  ...SESSION_MUTATION_FIELDS,
  '当前血量',
  '彼岸威望',
]);
const THREAT_REFINEMENT_MUTATION_FIELDS = Object.freeze([
  ...SESSION_MUTATION_FIELDS,
  '生命本源',
  '灵根',
  '天魔化生',
]);
const THREAT_REWARD_MUTATION_FIELDS = Object.freeze([
  ...SESSION_MUTATION_FIELDS,
  '纪元积累',
  '彼岸威望',
  '彼岸古史残章',
  '彼岸威胁战果',
]);
const EXPEDITION_REWARD_MUTATION_FIELDS = Object.freeze([
  ...SESSION_MUTATION_FIELDS,
  '彼岸威望',
  '彼岸古史残章',
  '彼岸远征记录',
]);
const PLAYER_MUTATION_FIELDS = Object.freeze([...new Set([
  ...THREAT_BATTLE_MUTATION_FIELDS,
  ...THREAT_REFINEMENT_MUTATION_FIELDS,
  ...THREAT_REWARD_MUTATION_FIELDS,
  ...EXPEDITION_REWARD_MUTATION_FIELDS,
])]);

const EXPEDITION_ACTIVE_STATUSES = new Set([
  'active',
  'waiting_boss',
  'ready_to_evac',
  'stabilized',
  'downed',
]);

const EXPEDITION_STAGE_LOOT = Object.freeze({
  'observe-scar': Object.freeze([
    Object.freeze({ id: 'common:other-shore-star-sand', name: '彼岸星砂', class: '材料', kind: 'common', quantity: 3 }),
  ]),
  'clear-variants': Object.freeze([
    Object.freeze({ id: 'common:reincarnation-soul-crystal', name: '轮回魂晶', class: '材料', kind: 'common', quantity: 1 }),
  ]),
  'repair-star-eye': Object.freeze([
    Object.freeze({ id: 'common:other-shore-star-sand', name: '彼岸星砂', class: '材料', kind: 'common', quantity: 5 }),
  ]),
  'read-qin-inscription': Object.freeze([
    Object.freeze({ id: 'key:primordial-spirit-forging-page', name: '太初锻神录残页', class: '道具', kind: 'key', quantity: 1 }),
  ]),
});

const THREAT_REWARDS = Object.freeze({
  participant: Object.freeze({ era: 0, prestige: 10, fragments: 1 }),
  major: Object.freeze({ era: 1, prestige: 25, fragments: 2 }),
  epoch: Object.freeze({ era: 2, prestige: 50, fragments: 4 }),
});

const THREAT_PHASE_NAMES = Object.freeze({
  calamity: '同源灾厄潮',
  overlord: '灾厄魔主',
  decision: '魔主归宿',
  purge: '禁宝司清剿',
  resolved: '本轮平定',
});

const PHASE_STATUS = Object.freeze({
  unobserved: 'unseen',
  sensed: 'observed',
  visited: 'explored',
  anchored: 'anchored',
  cleared: 'anchored',
});

const STAR_META = Object.freeze({
  origin: ['诸界交汇', '先秦远征遗脉'],
  gate: ['界潮', '彼岸古文明'],
  abyss: ['归墟', '寂灭生态'],
  tomb: ['纪元葬灭', '失落王庭'],
  archive: ['古史', '纪元碑灵'],
  anchor: ['维度锚定', '裂界维护者'],
  harbor: ['星路', '先秦炼气士'],
  ruin: ['残缺大道', '遗迹生灵'],
  forge: ['太初真火', '铸星文明'],
  palace: ['帝道残痕', '帝落遗民'],
  observatory: ['超维观测', '纪元主宰眷属'],
  citadel: ['禁宝律令', '古文明禁宝司'],
  life: ['生机', '星海灵族'],
  tide: ['界潮', '潮汐生灵'],
  rift: ['裂界', '域外修士'],
  civilization: ['文明薪火', '古星城邦'],
  dead: ['寂灭', '灾厄变异体'],
});

function createCanglanWorld() {
  const world = observeOtherShoreStars(createOtherShoreWorld(WORLD_SEED), '0,0', 1);
  ensureOtherShoreThreat(world);
  ensureOtherShoreExpeditionState(world);
  return world;
}

function maintainOtherShoreThreat(world, now = Date.now()) {
  ensureOtherShoreExpeditionState(world);
  const { event } = ensureOtherShoreThreat(world, { now });
  if (event.phase === 'purge') {
    const previousRouteIndex = Math.max(0, Number(event.purge?.routeIndex) || 0);
    const advanced = advanceOtherShoreThreat(world, { eventId: event.eventId, now });
    const currentRouteIndex = Math.max(previousRouteIndex, Number(event.purge?.routeIndex) || 0);
    for (let routeIndex = previousRouteIndex + 1; routeIndex <= currentRouteIndex; routeIndex++) {
      const starId = event.purge.route[routeIndex];
      if (!starId) continue;
      applyOtherShoreCampSiege(world, {
        starId,
        purge: {
          pressure: Math.max(0, Number(advanced.pressure) - (currentRouteIndex - routeIndex)),
          defense: event.purge.defense,
          defenseRequirement: event.purge.defenseRequirement,
          occupied: routeIndex >= event.purge.route.length - 1,
        },
        operationId: `purge:${event.eventId}:route:${routeIndex}`,
        now,
      });
    }
  }
  if (
    event.phase === 'resolved'
    && now - Number(event.resolvedAt || now) >= THREAT_NEXT_CYCLE_DELAY_MS
    && world.stars.some(star => star.id !== world.centerId
      && ['visited', 'anchored', 'cleared'].includes(world.states?.[star.id]?.phase))
  ) {
    startNextOtherShoreThreat(world, { now });
  }
  return world.threat;
}

function canRefineOtherShoreOverlord(player) {
  return isTianmoHuashengPhysique(player) && hasTianmoHuashengTechnique(player);
}

function ownedInnateTreasures(userId) {
  const owners = readInnateTreasureState().owners || {};
  return Object.entries(owners)
    .filter(([, owner]) => String(owner?.ownerId || '') === String(userId))
    .map(([name]) => name)
    .sort();
}

function replaceDocument(document, next) {
  for (const key of Object.keys(document)) delete document[key];
  Object.assign(document, next);
}

function currentSession(player) {
  return player?.in_other_shore === true
    && Number(player?.power_place) === OTHER_SHORE_PLANE_ID
    && player?.other_shore?.worldId === WORLD_SEED
    ? player.other_shore
    : null;
}

function currentExpeditionRun(world, userId) {
  const run = world?.expedition?.runs?.[String(userId)];
  return run && EXPEDITION_ACTIVE_STATUSES.has(run.status) ? run : null;
}

function pendingExpeditionSettlement(world, userId) {
  return Object.values(world?.expedition?.settlements || {})
    .find(settlement => settlement.playerId === String(userId) && settlement.state === 'pending') || null;
}

function expeditionLootBag(items = []) {
  return {
    items: items.map(item => ({
      ...structuredClone(item),
      class: item.class || (item.name === '太初锻神录残页' ? '道具' : '材料'),
      quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
    })).filter(item => item.quantity > 0),
  };
}

function applyExpeditionSettlementReward(player, settlement, itemCount, now = Date.now()) {
  player.彼岸远征记录 ||= {};
  player.彼岸远征记录.settlements ||= {};
  if (player.彼岸远征记录.settlements[settlement.claimId]) return false;
  const prestige = settlement.mode === 'forced' ? 3 : 8;
  const fragments = settlement.items.some(item => item.kind === 'key' || item.kind === 'unique') ? 1 : 0;
  player.彼岸威望 = Math.max(0, Math.trunc(Number(player.彼岸威望) || 0)) + prestige;
  player.彼岸古史残章 = Math.max(0, Math.trunc(Number(player.彼岸古史残章) || 0)) + fragments;
  player.彼岸远征记录.settlements[settlement.claimId] = {
    mode: settlement.mode,
    itemCount,
    claimedAt: now,
  };
  return true;
}

function parseCoordinate(input) {
  const match = String(input || '').match(/(-?\d+)\s*[,，]\s*(-?\d+)/);
  if (!match) return null;
  return otherShoreCoordinateId(Number(match[1]), Number(match[2]));
}

function cubeRound(q, r) {
  let x = Math.round(q);
  let z = Math.round(r);
  let y = Math.round(-q - r);
  const xDiff = Math.abs(x - q);
  const yDiff = Math.abs(y + q + r);
  const zDiff = Math.abs(z - r);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff > zDiff) y = -x - z;
  else z = -x - y;
  return { q: x, r: z };
}

function straightPath(world, fromId, toId) {
  const byId = new Map(world.stars.map(star => [star.id, star]));
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) throw new Error('目标大星不在当前沧澜星图内');
  const distance = getOtherShoreHexDistance(from, to);
  const path = [];
  for (let step = 0; step <= distance; step++) {
    const ratio = distance === 0 ? 0 : step / distance;
    const point = cubeRound(
      from.q + (to.q - from.q) * ratio,
      from.r + (to.r - from.r) * ratio,
    );
    const id = otherShoreCoordinateId(point);
    if (byId.has(id) && path.at(-1) !== id) path.push(id);
  }
  return path;
}

function strongestRealmName(player) {
  return getOtherShoreTravelRule(player).name;
}

function publicStar(star) {
  const [law = '未解析', civilization = '未解析'] = STAR_META[star.kind] || [];
  return {
    id: star.id,
    q: star.q,
    r: star.r,
    status: PHASE_STATUS[star.phase] || 'unseen',
    name: star.name,
    kind: star.kind,
    law,
    civilization,
    threat: star.risk,
    signal: star.description,
    description: star.description,
    contribution: Math.max(0, Number(star.contribution) || 0),
    anchorRequirement: Math.max(0, Number(star.anchorRequirement) || 0),
    keyStar: star.keyStar === true,
  };
}

function explorationEcho(star, contribution) {
  const echoes = {
    citadel: '禁宝司残存律令苏醒，持有先天至宝的因果正在被重新标记。',
    observatory: '超维观测阵列短暂转向，纪元主宰的眸光掠过这片星域。',
    anchor: '母锚深处传来与灵界裂缝同源的震颤，古航路正在复苏。',
    harbor: '函谷旧印与先秦炼气士的远征星图彼此重合。',
    rift: '裂界彼端有灾厄变异体投来与你同源的气息。',
  };
  return echoes[star.kind]
    || `第${contribution}重星域道痕归入全服星图，远方仍有法则回响。`;
}

function findActionReceipt(session, operationId, action, targetId) {
  if (!operationId) return null;
  const receipt = session.actionReceipts?.[operationId];
  if (!receipt) return null;
  if (receipt.action !== action || (targetId !== undefined && receipt.targetId !== targetId)) {
    throw new Error('操作标识已经用于另一项星海动作');
  }
  return receipt;
}

function rememberActionReceipt(session, operationId, action, targetId, message) {
  if (!operationId) return;
  session.actionReceipts ||= {};
  session.actionReceipts[operationId] = {
    action,
    targetId,
    message,
    at: Date.now(),
  };
  const stale = Object.entries(session.actionReceipts)
    .sort((left, right) => Number(right[1]?.at || 0) - Number(left[1]?.at || 0))
    .slice(ACTION_RECEIPT_LIMIT);
  for (const [id] of stale) delete session.actionReceipts[id];
}

function playerMutationKey(userId, runId, action, targetId) {
  return [userId, runId, action, targetId].join(':');
}

function createPlayerMutationPatch(player, fields = SESSION_MUTATION_FIELDS) {
  return Object.fromEntries(fields
    .filter(field => Object.hasOwn(player, field))
    .map(field => [field, structuredClone(player[field])]));
}

function applyPlayerMutationPatch(player, patch) {
  for (const field of PLAYER_MUTATION_FIELDS) {
    if (Object.hasOwn(patch || {}, field)) player[field] = structuredClone(patch[field]);
  }
}

function stagePlayerMutation(world, player, session, {
  userId,
  action,
  targetId,
  operationId,
  message,
  mutationKey,
  fields,
  inventoryBag,
  inventoryClaimId,
}) {
  rememberActionReceipt(session, operationId, action, targetId, message);
  player.other_shore = session;
  world.pendingPlayerMutations ||= {};
  world.pendingPlayerMutations[mutationKey] = {
    id: randomUUID(),
    userId,
    runId: session.runId,
    action,
    targetId,
    operationId,
    message,
    playerPatch: createPlayerMutationPatch(player, fields),
    ...(inventoryBag ? {
      inventoryBag: structuredClone(inventoryBag),
      inventoryClaimId: String(inventoryClaimId || ''),
    } : {}),
    createdAt: Date.now(),
  };
}

async function applyPendingPlayerMutation(userId, player, pending) {
  if (pending.inventoryBag) {
    const najie = await Read_najie(userId);
    claimXianguBagItems(
      najie,
      pending.inventoryBag,
      `xiangu:other-shore:${pending.inventoryClaimId}`,
    );
    await Write_najie(userId, najie);
  }
  applyPlayerMutationPatch(player, pending.playerPatch);
  await Write_player(userId, player);
}

async function deliverPlayerMutation(userId, player, mutationKey) {
  const delivered = await deliverOtherShorePlayerMutation(
    globalThis.redis,
    createCanglanWorld,
    mutationKey,
    pending => applyPendingPlayerMutation(userId, player, pending),
  );
  if (!delivered) throw new Error('彼岸玩家变更回执缺失，请重新尝试');
  return delivered;
}

async function releaseThreatBattleLease(key, token) {
  try {
    if (typeof globalThis.redis.eval === 'function') {
      await globalThis.redis.eval(RELEASE_THREAT_BATTLE_LEASE_SCRIPT, {
        keys: [key],
        arguments: [token],
      });
    } else if (await globalThis.redis.get(key) === token) {
      await globalThis.redis.del(key);
    }
  } catch {
  }
}

async function withThreatBattleLease(eventId, scope, task) {
  const key = `xiuxian:other-shore:threat:battle:${eventId}:${scope}`;
  const token = `${Date.now()}:${randomUUID()}`;
  const acquired = await globalThis.redis.set(key, token, {
    NX: true,
    EX: THREAT_BATTLE_LEASE_SECONDS,
  });
  if (!acquired) return { busy: true };
  try {
    return await task();
  } finally {
    await releaseThreatBattleLease(key, token);
  }
}

function createOtherShoreBattlePlayer(player, userId) {
  const combatant = structuredClone(player);
  const suppression = getOtherShoreSuppression(player);
  const multiplier = suppression.attributeMultiplier;
  combatant.id = String(userId);
  combatant.灵根 = structuredClone(player.灵根 || { name: '普通灵根', 法球倍率: 1 });
  for (const field of [
    '攻击', '防御', '当前血量', '血量上限', '暴击率', '暴击伤害',
    '闪避率', '吸血率', '穿透', '速度', '元神', '生命本源',
  ]) {
    if (Number.isFinite(Number(combatant[field]))) {
      const scaled = Number(combatant[field]) * multiplier;
      combatant[field] = ['攻击', '防御', '当前血量', '血量上限', '速度'].includes(field)
        ? Math.max(1, Math.floor(scaled))
        : ['暴击率', '暴击伤害', '闪避率', '吸血率'].includes(field)
          ? scaled
          : Math.max(0, Math.floor(scaled));
    }
  }
  const realmSpeed = (Number(player.mijinglevel_id) || 0) * 50
    + (Number(player.xiangulevel_id) || 0) * 50
    + Math.max(0, (Number(player.huafenlevel_id) || 1) - 1) * 50;
  combatant.速度 = Math.max(
    1,
    Math.floor(((Number(player.速度 ?? 100) || 100) + realmSpeed) * multiplier),
  );
  combatant._忽略境界速度加成 = true;
  combatant.血量上限 = Math.max(1, Number(combatant.血量上限) || 1);
  combatant.当前血量 = Math.min(
    combatant.血量上限,
    Math.max(1, Number(combatant.当前血量) || 1),
  );
  const orb = Math.max(0.01, Number(player.灵根?.法球倍率 ?? player.法球倍率) || 1)
    * suppression.techniqueEffectMultiplier;
  combatant.灵根.法球倍率 = orb;
  combatant.法球倍率 = orb;
  for (const field of ['攻击', '防御', '生命', '生命本源']) {
    if (Number.isFinite(Number(combatant.灵根[field]))) {
      combatant.灵根[field] = Number(combatant.灵根[field]) * suppression.techniqueEffectMultiplier;
    }
  }
  return combatant;
}

function syncOtherShoreBattleHp(player, combatant, battle) {
  const sourceMax = Math.max(1, Number(player.血量上限) || Number(player.当前血量) || 1);
  const battleMax = Math.max(1, Number(combatant.血量上限) || 1);
  const remainingRatio = Math.min(1, Math.max(0, Number(battle?.A_hp) || 0) / battleMax);
  player.当前血量 = Math.min(sourceMax, Math.max(1, Math.floor(sourceMax * remainingRatio)));
  return player.当前血量;
}

function createExpeditionEnemy(player, userId, run, expedition, now = Date.now()) {
  const stage = expedition.viewer.run?.currentStage;
  const enemy = createOtherShoreCalamityVariant(player, {
    eventId: `expedition:${run.runId}:${stage?.id || 'boss'}`,
    starId: run.starId,
    playerId: userId,
    now,
  });
  if (stage?.kind !== 'boss') return enemy;
  const boss = expedition.campaign?.boss;
  if (!boss || boss.status === 'defeated') throw new Error('玄阙灾核已经被全服修士镇压');
  enemy.id = boss.bossId;
  enemy.type = '彼岸区域共享首领';
  enemy.名号 = `${boss.name}·纪元残躯`;
  enemy.当前血量 = boss.currentHp;
  enemy.血量上限 = boss.currentHp;
  enemy.攻击 = Math.max(1, Math.floor(Number(enemy.攻击) * 1.35));
  enemy.防御 = Math.max(1, Math.floor(Number(enemy.防御) * 1.35));
  enemy.速度 = Math.max(1, Math.floor(Number(enemy.速度) * 1.2));
  enemy.boss = true;
  enemy.能力标记 = ['神炉灾焰', '同源映照', '纪元炉心'];
  return enemy;
}

function serializeExpeditionForWeb(world, session, userId) {
  const playerId = String(userId);
  const storedRun = world?.expedition?.runs?.[playerId] || null;
  const focusStarId = storedRun?.starId || OTHER_SHORE_EXPEDITION_STAR_ID;
  const raw = serializeOtherShoreExpedition(world, {
    starId: focusStarId,
    viewerId: playerId,
  });
  const run = raw.viewer.run;
  const stageTotal = raw.campaign?.stages?.length || 0;
  const stage = run?.currentStage || null;
  const pending = pendingExpeditionSettlement(world, playerId);
  const active = Boolean(run && EXPEDITION_ACTIVE_STATUSES.has(run.status));
  const atStar = session.positionId === focusStarId;
  const campEstablished = raw.camp.level > 0 && raw.camp.status !== 'disabled';
  const campMaxDefense = Math.max(1, Number(raw.camp.resilience) || 0);
  const campDefense = campEstablished
    ? Math.max(0, Math.min(campMaxDefense, campMaxDefense - Number(raw.camp.stress || 0)))
    : 0;
  const personalComplete = Boolean(run && run.stageIndex >= stageTotal && stageTotal > 0);
  const lostCaches = raw.viewer.lostCaches.map(cache => ({ ...cache, id: cache.cacheId }));
  const lostCache = lostCaches.find(cache => cache.starId === focusStarId) || null;
  const rescueTargets = raw.rescue.targets.map(target => ({
    id: target.playerId,
    userId: target.playerId,
    name: target.playerName,
    downedAt: target.downedAt,
  }));
  const phase = world.states?.[focusStarId]?.phase;
  const campNeedsWork = raw.camp.level < 3
    || raw.camp.stress > 0
    || raw.camp.defenseReserve < raw.camp.resilience;
  const hasPendingClaim = Boolean(pending);
  const viewerClears = Number(
    world.expedition?.campaigns?.[focusStarId]?.participants?.[playerId]?.clears,
  ) || 0;

  return {
    exists: Boolean(raw.campaign),
    active,
    runId: run?.runId || 'IDLE',
    starId: focusStarId,
    status: run?.status || (hasPendingClaim ? 'settled' : 'idle'),
    campaign: {
      id: raw.campaign?.campaignId || '',
      title: raw.campaign?.name || '玄阙神炉区域战役',
      status: run?.status || raw.campaign?.status || 'idle',
      complete: personalComplete,
      progress: stageTotal ? Math.min(100, (Number(run?.stageIndex) || 0) / stageTotal * 100) : 0,
      boss: raw.campaign?.boss || null,
    },
    stage: {
      id: stage?.id || '',
      name: stage?.name || (personalComplete ? '首通完成' : '等待建立远征'),
      kind: stage?.kind || '',
      index: Math.max(0, Number(run?.stageIndex) || 0),
      number: run ? Math.min(stageTotal, (Number(run.stageIndex) || 0) + 1) : 0,
      total: stageTotal,
    },
    camp: {
      ...raw.camp,
      established: campEstablished,
      name: campEstablished ? '玄阙星锚营地' : '玄阙临时驻点',
      maxLevel: 3,
      defense: campDefense,
      maxDefense: campMaxDefense,
    },
    tacticalBag: {
      items: run?.bag?.carried || [],
      used: run?.bag?.carriedUnits || 0,
      secured: run?.bag?.storedUnits || 0,
      capacity: raw.camp.storageCapacity || 0,
    },
    evacuation: {
      status: hasPendingClaim ? 'ready' : 'idle',
      active: hasPendingClaim,
      ready: hasPendingClaim,
      forced: pending?.mode === 'forced',
      claimId: pending?.claimId || null,
    },
    downed: {
      ...(run?.downed || {}),
      active: run?.status === 'downed',
      expiresAt: null,
    },
    lostCache: lostCache ? { ...lostCache, active: true } : { active: false },
    lostCaches,
    rescueTargets,
    viewer: {
      canEnter: atStar
        && !active
        && !hasPendingClaim
        && Boolean(raw.campaign)
        && viewerClears === 0
        && ['visited', 'anchored', 'cleared'].includes(phase),
      canBuildCamp: atStar
        && ['visited', 'anchored', 'cleared'].includes(phase)
        && campNeedsWork,
      canAdvance: atStar
        && ['active', 'waiting_boss'].includes(run?.status)
        && Boolean(stage),
      canDeposit: atStar
        && active
        && run?.status !== 'downed'
        && raw.camp.canStore
        && Number(run?.bag?.carriedUnits) > 0,
      canRescue: atStar
        && ['active', 'waiting_boss', 'ready_to_evac', 'stabilized'].includes(run?.status)
        && rescueTargets.length > 0,
      canRecoverLostCache: atStar
        && run?.status === 'active'
        && lostCaches.some(cache => cache.starId === focusStarId),
      canEvacuate: atStar
        && active
        && run?.status !== 'downed'
        && raw.camp.canEvacuate,
      canForceEvacuate: atStar && active,
      canClaim: hasPendingClaim,
    },
  };
}

function applyThreatReward(player, eventId, reward, now = Date.now()) {
  player.彼岸威胁战果 ||= {};
  if (player.彼岸威胁战果[eventId]) return { duplicate: true, reward: THREAT_REWARDS[reward.tier] };
  const grant = THREAT_REWARDS[reward.tier];
  if (!grant) throw new Error('彼岸战果品阶异常');
  player.纪元积累 = Math.max(0, Math.trunc(Number(player.纪元积累) || 0)) + grant.era;
  player.彼岸威望 = Math.max(0, Math.trunc(Number(player.彼岸威望) || 0)) + grant.prestige;
  player.彼岸古史残章 = Math.max(0, Math.trunc(Number(player.彼岸古史残章) || 0)) + grant.fragments;
  player.彼岸威胁战果[eventId] = {
    tier: reward.tier,
    score: reward.score,
    claimedAt: now,
  };
  return { duplicate: false, reward: grant };
}

async function deliverPendingPlayerMutations(userId, player) {
  const session = currentSession(player);
  if (!session) return [];
  const prefix = `${userId}:${session.runId}:`;
  return deliverOtherShorePlayerMutations(
    globalThis.redis,
    createCanglanWorld,
    key => key.startsWith(prefix),
    async pending => {
      if (pending.userId !== userId || pending.runId !== session.runId) {
        throw new Error('彼岸玩家变更回执身份不匹配');
      }
      await applyPendingPlayerMutation(userId, player, pending);
    },
  );
}

async function playerIdFromEvent(e) {
  return channel(String(e.user_id || '').replace('qg_', ''));
}

export class OtherShoreWorld extends plugin {
  constructor() {
    super({
      name: 'OtherShoreWorld',
      dsc: '彼岸世界·沧澜界全服星图',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#(?:柠檬堂.*|冲水堂.*|无尽商店.*|势力商店.*|.*商店.*|.*商城.*|无尽购买\\s+.+|选购.*|购买.*|.*兑换.*|向NPC购买.*|上架.*|下架.*)$', fnc: 'guardExternalCommerce' },
        { reg: '^#(?:服用.+|一键回血)$', fnc: 'guardExternalHealing' },
        { reg: '^#(?:穿梭.*|接引.*|送往.*|同意接引|遨游时间长河|轮回|登仙|证道|轰击成仙路)$', fnc: 'guardOtherShoreTransit' },
        { reg: '^#进入彼岸世界$', fnc: 'enterOtherShore' },
        { reg: '^#(?:离开|退出)彼岸世界$', fnc: 'leaveOtherShore' },
        { reg: '^#(?:彼岸世界|沧澜星图|彼岸状态)$', fnc: 'showOtherShore' },
        { reg: '^#(?:彼岸网页|沧澜网页)$', fnc: 'openOtherShoreWeb' },
        { reg: '^#(?:彼岸威胁|彼岸灾厄)$', fnc: 'showThreat' },
        { reg: '^#(?:讨伐彼岸灾厄|讨伐彼岸魔主|迎战彼岸威胁)$', fnc: 'challengeThreat' },
        { reg: '^#斩灭彼岸魔主$', fnc: 'executeThreatOverlord' },
        { reg: '^#炼化彼岸魔主$', fnc: 'refineThreatOverlord' },
        { reg: '^#抗击禁宝司$', fnc: 'defendAgainstPurge' },
        { reg: '^#领取彼岸战果$', fnc: 'claimThreatReward' },
        { reg: '^#(?:彼岸远征|进入区域远征)$', fnc: 'startExpedition' },
        { reg: '^#(?:彼岸营地|建设前线营地)$', fnc: 'buildExpeditionCamp' },
        { reg: '^#(?:推进彼岸战役|推进区域战役)$', fnc: 'advanceExpeditionCampaign' },
        { reg: '^#彼岸行囊$', fnc: 'showExpedition' },
        { reg: '^#存放彼岸战利品$', fnc: 'depositExpeditionBag' },
        { reg: '^#救援彼岸修士(?:\s+\S+)?$', fnc: 'rescueExpeditionPlayer' },
        { reg: '^#(?:彼岸撤离|远征撤离)$', fnc: 'evacuateExpedition' },
        { reg: '^#(?:彼岸强撤|强制撤离)$', fnc: 'forceEvacuateExpedition' },
        { reg: '^#领取彼岸远征战果$', fnc: 'claimExpeditionReward' },
        { reg: '^#(?:追回|取回)彼岸行囊$', fnc: 'recoverExpeditionBag' },
        { reg: '^#观测大星(?:\\s+-?\\d+\\s*[,，]\\s*-?\\d+)?$', fnc: 'observeStar' },
        { reg: '^#(?:远征|前往大星)\\s+-?\\d+\\s*[,，]\\s*-?\\d+$', fnc: 'moveStar' },
        { reg: '^#探索大星$', fnc: 'exploreStar' },
        { reg: '^#锚定大星$', fnc: 'anchorStar' },
      ],
    });
    registerCanglanWebController(this);
  }

  async requirePlayer(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) {
      await e.reply('彼岸星图中尚无你的命火，请先发送 #踏入仙途。');
      return null;
    }
    return { userId, player: await Read_player(userId) };
  }

  async requireResident(e) {
    const result = await this.requirePlayer(e);
    if (!result) return null;
    if (!currentSession(result.player)) {
      await e.reply('你尚未进入彼岸世界。身处太初星墟并持有完整【裂界残忆】后，可发送 #进入彼岸世界。');
      return null;
    }
    return result;
  }

  async world() {
    const updated = await updateOtherShoreWorldState(
      globalThis.redis,
      createCanglanWorld,
      world => maintainOtherShoreThreat(world),
    );
    return updated.document;
  }

  async syncThreatSignals(userId, player) {
    const session = currentSession(player);
    const treasures = session ? ownedInnateTreasures(userId) : [];
    const updated = await updateOtherShoreWorldState(
      globalThis.redis,
      createCanglanWorld,
      world => {
        const event = maintainOtherShoreThreat(world);
        if (!session || event.phase === 'resolved') return;
        for (const treasureName of treasures) {
          recordOtherShoreTreasureSignal(world, {
            eventId: event.eventId,
            starId: session.positionId,
            userId,
            userName: player.名号,
            treasureName,
            operationId: `treasure-signal:${event.eventId}:${userId}:${treasureName}`,
          });
        }
      },
    );
    return updated.document;
  }

  async refreshedPlayer(userId) {
    return withPlayerMutationLock(userId, async () => {
      const source = await Read_player(userId);
      const player = structuredClone(source);
      await deliverPendingPlayerMutations(userId, player);
      const status = refreshSpiritHeart(player);
      if (status.recovered > 0 || !Number.isFinite(Number(source.心神))) {
        await Write_player(userId, player);
      }
      return player;
    });
  }

  async guardExternalCommerce(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) return false;
    const player = await Read_player(userId);
    if (!currentSession(player)) return false;
    await e.reply('【彼岸界律】诸天商路在此失去坐标，外界商店与交易行均未响应。');
    return true;
  }

  async guardExternalHealing(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) return false;
    const player = await Read_player(userId);
    if (!currentSession(player)) return false;
    if (String(e.msg || '').trim() === '#一键回血') {
      await e.reply('【彼岸界律】此界不承认外来疗伤丹药的药理，丹力在入体前便已消散。');
      return true;
    }
    const name = String(e.msg || '').replace(/^#服用/, '').split('*')[0].trim();
    const item = name ? await foundthing(name) : null;
    if (item?.class !== '丹药' || (item.type !== '血量' && Number(item.HP) <= 0 && Number(item.HPp) <= 0)) return false;
    await e.reply('【彼岸界律】此界不承认外来疗伤丹药的药理，丹力在入体前便已消散。');
    return true;
  }

  async guardOtherShoreTransit(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) return false;
    const player = await Read_player(userId);
    if (!currentSession(player)) return false;
    await e.reply('【彼岸界律】常规位面通道无法在此锚定，请在稳定星锚处发送 #离开彼岸世界。');
    return true;
  }

  async enterOtherShore(e) {
    const result = await this.requirePlayer(e);
    if (!result) return true;
    const { userId } = result;
    const outcome = await withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (currentSession(player)) return { message: '你已经身处沧澜界，发送 #沧澜星图 可继续远征。' };
      if (Number(player.power_place) !== OTHER_SHORE_ORIGIN_PLANE_ID) {
        return { message: '裂界坐标只会在太初星墟显化，你需先抵达太初星墟。' };
      }
      if (!normalizeRiftMemoryState(player.彼岸残忆).unlocked) {
        return { message: '你尚未掌握完整【裂界残忆】，灾厄魔主的残魂中或许藏着彼岸坐标。' };
      }
      const action = inspectPlayerAction(await globalThis.redis.get(`xiuxian:player:${userId}:action`));
      if (action.active) return { message: `你正在进行【${action.action?.action || '其他行动'}】，此刻难以穿过裂界。` };
      const world = await this.world();
      refreshSpiritHeart(player);
      const rule = getOtherShoreTravelRule(player);
      const storedTier = String(player.彼岸心神余程境界 || '');
      const recordedPositionId = String(player.彼岸远征记录?.lastPositionId || '');
      const recordedPhase = world.states?.[recordedPositionId]?.phase;
      const positionId = ['anchored', 'cleared'].includes(recordedPhase)
        ? recordedPositionId
        : '0,0';
      player.other_shore = {
        version: 1,
        worldId: WORLD_SEED,
        runId: randomUUID(),
        positionId,
        enteredAt: Date.now(),
        mindRemainder: storedTier === rule.tier ? Math.max(0, Number(player.彼岸心神余程) || 0) : 0,
        mindTier: rule.tier,
        pressure: 0,
      };
      player.in_other_shore = true;
      player.power_place = OTHER_SHORE_PLANE_ID;
      await Write_player(userId, player);
      const suppression = getOtherShoreSuppression(player);
      return {
        message: [
          '【裂界彼岸·沧澜祖星】',
          '六十一颗大星在黑暗中同时点燃，全服沧澜星图已与你的神念相接。',
          suppression.immune
            ? '你的道路自成一体，彼岸界律未能压制你的战力。'
            : '异界法则覆压道果：全属性与功法数值效果按70%结算。',
          `当前心神：${player.心神}/${getSpiritHeartMax(player)}｜未知星域：${rule.name}`,
          '发送 #彼岸网页 开启交互星图，或发送 #观测大星。',
        ].join('\n'),
      };
    });
    await e.reply(outcome.message);
    return true;
  }

  async leaveOtherShore(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const { userId } = result;
    const outcome = await withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      const session = currentSession(player);
      if (!session) return { message: '彼岸会话已经消散。' };
      const world = await this.world();
      if (currentExpeditionRun(world, userId)) {
        return { message: '区域远征仍在进行，请先在当前大星完成正常撤离或强制撤离。' };
      }
      if (pendingExpeditionSettlement(world, userId)) {
        return { message: '尚有彼岸远征战果待领取，请先发送 #领取彼岸远征战果。' };
      }
      const phase = world.states?.[session.positionId]?.phase;
      if (!['anchored', 'cleared'].includes(phase)) {
        return { message: '当前大星尚未锚定，裂界回路无法闭合。请沿星路返回已锚定大星后再离开。' };
      }
      player.彼岸心神余程 = Math.max(0, Number(session.mindRemainder) || 0);
      player.彼岸心神余程境界 = String(session.mindTier || '');
      player.彼岸远征记录 ||= {};
      player.彼岸远征记录.lastPositionId = session.positionId;
      player.彼岸远征记录.lastLeftAt = Date.now();
      player.in_other_shore = false;
      player.power_place = OTHER_SHORE_ORIGIN_PLANE_ID;
      delete player.other_shore;
      await Write_player(userId, player);
      return { message: '裂界在身后合拢，你已携沧澜星图回到太初星墟。' };
    });
    await e.reply(outcome.message);
    return true;
  }

  async getWebState({ userId, runId = '' }) {
    const player = await this.refreshedPlayer(String(userId));
    const session = currentSession(player);
    if (!session) throw new Error('你已离开彼岸世界，请重新进入后领取星图入口');
    if (runId && session.runId !== runId) {
      throw new Error('本次彼岸远征已更替，请重新领取星图入口');
    }
    const world = await this.syncThreatSignals(String(userId), player);
    const serialized = serializeOtherShoreWorld(world);
    const travel = getOtherShoreTravelRule(player);
    const suppression = getOtherShoreSuppression(player);
    const observed = serialized.stars.filter(star => star.discovered).length;
    const known = serialized.stars.filter(star => star.visited).length;
    return {
      version: 1,
      worldId: WORLD_SEED,
      player: {
        name: player.名号 || '无名修士',
        realm: strongestRealmName(player),
        travelTier: travel.tier,
        mind: Math.max(0, Number(player.心神) || 0),
        maxMind: getSpiritHeartMax(player),
        mindRemainder: Math.max(0, Number(session.mindRemainder) || 0),
        positionId: session.positionId,
        suppressionImmune: suppression.immune,
      },
      pressure: Math.max(0, Number(session.pressure) || 0),
      progress: { observed, known, total: serialized.stars.length },
      threat: serializeOtherShoreThreat(world, {
        viewerId: String(userId),
        positionId: session.positionId,
        canRefine: canRefineOtherShoreOverlord(player),
      }),
      expedition: serializeExpeditionForWeb(world, session, String(userId)),
      nodes: serialized.stars.map(star => ({
        ...publicStar(star),
        viewerContributed: Number(star.contributors?.[String(userId)] || 0) >= 1,
      })),
    };
  }

  async performWebAction({ userId, runId = '', action, targetId, operationId }) {
    const name = String(action);
    let result;
    const expeditionActions = new Set([
      'expedition_enter',
      'camp_build',
      'campaign_advance',
      'bag_deposit',
      'expedition_rescue',
      'lost_cache_recover',
      'evacuation_start',
      'evacuation_force',
      'expedition_claim',
    ]);
    if (expeditionActions.has(name)) {
      result = await this.performExpeditionAction(
        String(userId),
        name,
        String(targetId || ''),
        String(operationId || ''),
        String(runId || ''),
      );
    } else if (name === 'challenge' || name === 'defend') {
      result = await this.performThreatBattle(
        String(userId),
        name,
        String(operationId || ''),
        String(runId || ''),
      );
    } else if (name === 'execute' || name === 'refine' || name === 'claim') {
      result = await this.performThreatAction(
        String(userId),
        name,
        String(operationId || ''),
        String(runId || ''),
      );
    } else {
      result = await this.performAction(
        String(userId),
        name,
        String(targetId),
        String(operationId || ''),
        String(runId || ''),
      );
    }
    return { ok: true, message: result.message };
  }

  async performAction(userId, action, targetId, operationId = '', expectedRunId = '') {
    const allowed = new Set(['observe', 'move', 'explore', 'anchor']);
    if (!allowed.has(action)) throw new Error('未知的沧澜星海动作');
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const mutationKey = playerMutationKey(
        userId,
        session.runId,
        action,
        targetId,
      );
      const recovered = await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) {
        return { message: recoveredCurrent.message, replayed: true, recovered: true };
      }
      const receipt = findActionReceipt(session, operationId, action, targetId);
      if (receipt) return { message: receipt.message, replayed: true };
      await this.syncThreatSignals(userId, player);
      const travelRule = getOtherShoreTravelRule(player);
      if (session.mindTier !== travelRule.tier) {
        session.mindTier = travelRule.tier;
        session.mindRemainder = 0;
      }

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        async world => {
          maintainOtherShoreThreat(world);
          const star = world.stars.find(item => item.id === targetId);
          if (!star) throw new Error('目标大星不在当前沧澜星图内');
          if (action === 'move' && currentExpeditionRun(world, userId)) {
            throw new Error('区域远征已锁定当前大星，请先撤离本次战役再横渡星海');
          }
          if (action === 'move' && pendingExpeditionSettlement(world, userId)) {
            throw new Error('远征战果尚未结算，请先领取后再横渡星海');
          }
          let next = world;
          let message = '';

          if (action === 'observe') {
            if (getOtherShoreHexDistance(session.positionId, targetId) > 1) {
              throw new Error('神念只能观测当前大星相邻的星域');
            }
            if (world.states[targetId].phase !== 'unobserved') throw new Error('此星已经完成初步观测');
            next = observeOtherShoreStars(world, session.positionId, 1);
            message = `神念捕获【${star.name}】的法则星辉，相邻迷雾已同步至全服星图。`;
          }

          if (action === 'move') {
            if (targetId === session.positionId) throw new Error('你已经身处这颗大星');
            const path = straightPath(world, session.positionId, targetId);
            const travel = calculateOtherShoreTravel(world, path, player, session.mindRemainder);
            const heart = consumeSpiritHeart(player, travel.cost);
            if (!heart.ok) throw new Error(`心神不足：需要${travel.cost}点，当前${heart.current}/${heart.max}`);
            for (let index = 1; index < path.length; index++) {
              next = observeOtherShoreStars(next, path[index - 1], 1);
              next = visitOtherShoreStar(next, path[index]);
            }
            session.positionId = targetId;
            session.mindRemainder = travel.remainder;
            session.pressure = Math.min(100, Math.max(0, Number(session.pressure) || 0) + travel.unanchoredSteps * 3);
            player.彼岸心神余程 = travel.remainder;
            player.彼岸心神余程境界 = travel.tier;
            message = `横渡${travel.totalSteps}格抵达【${star.name}】，其中${travel.unanchoredSteps}格未锚定，消耗心神${travel.cost}点。`;
          }

          if (action === 'explore') {
            if (targetId !== session.positionId) throw new Error('需先抵达目标大星');
            const state = world.states[targetId];
            if (['anchored', 'cleared'].includes(state.phase)) throw new Error('此星已经建立稳定道标');
            if (Number(state.contribution || 0) >= star.anchorRequirement) {
              throw new Error('此星探索贡献已经充足，可尝试建立星锚');
            }
            if (Number(state.contributors?.[userId] || 0) >= 1) {
              throw new Error('你已完成此星的个人探索，其余道痕需由其他修士补全');
            }
            if (state.phase === 'unobserved') next = observeOtherShoreStars(next, targetId, 0);
            if (next.states[targetId].phase === 'sensed') next = visitOtherShoreStar(next, targetId);
            next = contributeOtherShoreExploration(next, targetId, userId, 1);
            const progress = next.states[targetId].contribution;
            session.pressure = Math.min(100, Math.max(0, Number(session.pressure) || 0) + Math.max(1, star.risk));
            message = [
              `【${star.name}·探索推进】全服道痕 ${progress}/${star.anchorRequirement}`,
              explorationEcho(star, progress),
              progress >= star.anchorRequirement ? '星辰核心已经显露，可建立星锚。' : '仍需继续探索或等待其他修士驰援。',
            ].join('\n');
          }

          if (action === 'anchor') {
            if (targetId !== session.positionId) throw new Error('需先抵达目标大星');
            if (['anchored', 'cleared'].includes(world.states[targetId].phase)) {
              throw new Error('此星已经建立稳定道标，无需重复锚定');
            }
            next = anchorOtherShoreStar(world, targetId);
            session.pressure = Math.max(0, Math.max(0, Number(session.pressure) || 0) - 8);
            message = `【${star.name}·全服星锚】航路已经稳定，所有后来者经过此星不再消耗心神。`;
          }

          replaceDocument(world, { ...next });
          stagePlayerMutation(world, player, session, {
            userId,
            action,
            targetId,
            operationId,
            message,
            mutationKey,
          });
          return { message };
        },
      );
      await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
  }

  async performExpeditionAction(userId, action, targetId, operationId = '', expectedRunId = '') {
    const allowed = new Set([
      'expedition_enter',
      'camp_build',
      'campaign_advance',
      'bag_deposit',
      'expedition_rescue',
      'lost_cache_recover',
      'evacuation_start',
      'evacuation_force',
      'expedition_claim',
    ]);
    if (!allowed.has(action)) throw new Error('未知的彼岸区域远征动作');
    const operation = operationId || randomUUID();

    if (action === 'expedition_claim') {
      return this.claimExpeditionSettlement(userId, operation, expectedRunId);
    }

    if (action === 'campaign_advance') {
      const player = await this.refreshedPlayer(userId);
      const session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const world = await this.syncThreatSignals(userId, player);
      const run = getOtherShoreExpeditionRun(world, { playerId: userId });
      const expedition = serializeOtherShoreExpedition(world, {
        starId: run.starId,
        viewerId: userId,
      });
      const kind = expedition.viewer.run?.currentStage?.kind;
      if (kind === 'battle' || kind === 'boss') {
        return this.performExpeditionBattle(userId, operation, expectedRunId);
      }
    }

    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      await this.syncThreatSignals(userId, player);

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        world => {
          maintainOtherShoreThreat(world);
          ensureOtherShoreExpeditionState(world);
          let message;

          if (action === 'expedition_enter') {
            if (targetId !== OTHER_SHORE_EXPEDITION_STAR_ID || session.positionId !== targetId) {
              throw new Error(`玄阙神炉战役需在大星 ${OTHER_SHORE_EXPEDITION_STAR_ID} 开启`);
            }
            if (pendingExpeditionSettlement(world, userId)) {
              throw new Error('尚有上一轮远征战果待领取');
            }
            const started = startOtherShoreExpedition(world, {
              starId: targetId,
              playerId: userId,
              playerName: player.名号,
              runId: `canglan-expedition-${randomUUID()}`,
              operationId: operation,
            });
            message = `【${started.run.playerName}·玄阙远征】区域落点已建立，第一阶段：${started.run.history.length ? '观测灾痕' : '等待推进'}。`;
          } else if (action === 'camp_build') {
            if (session.positionId !== targetId) throw new Error('需在当前大星亲自建设前线营地');
            if (!['visited', 'anchored', 'cleared'].includes(world.states?.[targetId]?.phase)) {
              throw new Error('需先踏足并探明该大星，才能建设前线营地');
            }
            const before = serializeOtherShoreExpedition(world, { starId: targetId, viewerId: userId }).camp;
            if (before.level >= 3 && before.stress <= 0 && before.defenseReserve >= before.resilience) {
              throw new Error('当前前线营地已经达到最高等级并处于满额防备');
            }
            if (before.stress > 0 || (before.level >= 3 && before.defenseReserve < before.resilience)) {
              const result = reinforceOtherShoreCamp(world, {
                starId: targetId,
                playerId: userId,
                playerName: player.名号,
                amount: 5,
                operationId: operation,
              });
              message = `【前线营地·加固】修复压力${result.repaired}，补充防御储备${result.reserveAdded}，当前压力${result.stress}。`;
            } else {
              const result = contributeOtherShoreCamp(world, {
                starId: targetId,
                playerId: userId,
                playerName: player.名号,
                amount: 10,
                operationId: operation,
              });
              message = result.granted > 0
                ? `【前线营地·共建】贡献${result.granted}点，建设进度${result.buildPoints}/60，营地升至L${result.level}。`
                : '你在这颗大星的建设贡献已达上限，需等待其他修士接续星锚。';
            }
          } else {
            const run = getOtherShoreExpeditionRun(world, { playerId: userId });
            if (session.positionId !== run.starId) throw new Error(`需返回远征大星 ${run.starId}`);

            if (action === 'campaign_advance') {
              const stage = serializeOtherShoreExpedition(world, {
                starId: run.starId,
                viewerId: userId,
              }).viewer.run?.currentStage;
              if (!stage) throw new Error('当前区域战役已经完成');
              if (stage.kind === 'battle' || stage.kind === 'boss') {
                throw new Error('当前阶段需要进入真实战斗，请重新推进');
              }
              const advanced = advanceOtherShoreExpedition(world, {
                playerId: userId,
                runId: run.runId,
                stageId: stage.id,
                loot: EXPEDITION_STAGE_LOOT[stage.id] || [],
                operationId: operation,
              });
              message = advanced.completed
                ? `【${stage.name}】玄阙神炉首通完成，可封存战利品并撤离。`
                : `【阶段完成·${stage.name}】临时战利品已归入彼岸行囊，下一阶段：${advanced.nextStage?.name || '等待共享首领'}。`;
            } else if (action === 'bag_deposit') {
              const deposited = depositOtherShoreExpeditionLoot(world, {
                playerId: userId,
                runId: run.runId,
                operationId: operation,
              });
              message = deposited.movedUnits > 0
                ? `【营地封存】${deposited.movedUnits}份战利品已转入星锚仓，随身${deposited.carriedUnits}份、封存${deposited.storedUnits}份。`
                : '营地仓储已满，或当前没有可封存的随身战利品。';
            } else if (action === 'expedition_rescue') {
              const targetRun = world.expedition.runs?.[String(targetId)];
              if (!targetRun) throw new Error('同星求援信号已经消散');
              const rescued = rescueOtherShoreExpedition(world, {
                playerId: userId,
                runId: run.runId,
                targetPlayerId: String(targetId),
                targetRunId: targetRun.runId,
                operationId: operation,
              });
              message = `【同星救援】${targetRun.playerName}的道躯已稳定，可撤离或封存物资；本次救援不恢复气血。`;
              if (!rescued.rescued) message = '求援信号已经由其他修士稳定。';
            } else if (action === 'lost_cache_recover') {
              const recovered = recoverOtherShoreLostCache(world, {
                playerId: userId,
                runId: run.runId,
                cacheId: String(targetId),
                operationId: operation,
              });
              const count = recovered.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
              message = `【遗失行囊追回】${count}份关键物资重新归入临时行囊，请及时封存。`;
            } else if (action === 'evacuation_start') {
              const evacuation = evacuateOtherShoreExpedition(world, {
                playerId: userId,
                runId: run.runId,
                claimId: `expedition:${operation}`,
              });
              message = `【星锚撤离完成】${evacuation.settlement.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)}份战利品已送入待领取结算。`;
            } else if (action === 'evacuation_force') {
              const evacuation = forceEvacuateOtherShoreExpedition(world, {
                playerId: userId,
                runId: run.runId,
                claimId: `expedition:${operation}`,
              });
              const lost = evacuation.settlement.lostCommon.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
              message = `【强制撤离完成】未封存普通物资损失${lost}份${evacuation.settlement.lostCacheId ? '，关键物已形成30分钟遗失行囊' : ''}。`;
            } else {
              throw new Error('未知的彼岸区域远征动作');
            }
          }
          return { message };
        },
      );
      return updated.value;
    });
  }

  async performExpeditionBattle(userId, operationId = '', expectedRunId = '') {
    const operation = operationId || randomUUID();
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const recovered = await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const replay = findActionReceipt(session, operation, 'campaign_advance', undefined);
      if (replay) return { message: replay.message, replayed: true };

      let world = await this.syncThreatSignals(userId, player);
      let run = getOtherShoreExpeditionRun(world, { playerId: userId });
      let expedition = serializeOtherShoreExpedition(world, { starId: run.starId, viewerId: userId });
      let stage = expedition.viewer.run?.currentStage;
      if (!stage || !['battle', 'boss'].includes(stage.kind)) throw new Error('当前阶段不需要战斗');
      if (session.positionId !== run.starId) throw new Error(`需返回远征大星 ${run.starId}`);
      if (Number(player.当前血量) <= 0) throw new Error('你当前气血枯竭，只能等待同星修士救援或强制撤离');
      const mutationKey = playerMutationKey(userId, session.runId, 'campaign_advance', stage.id);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) return { message: recoveredCurrent.message, replayed: true, recovered: true };

      const expeditionRunId = run.runId;
      const stageId = stage.id;
      const leaseScope = stage.kind === 'boss' ? 'boss' : `${expeditionRunId}:${stageId}:${userId}`;
      const leased = await withThreatBattleLease(`expedition:${run.campaignId}`, leaseScope, async () => {
        world = await this.syncThreatSignals(userId, player);
        run = getOtherShoreExpeditionRun(world, { playerId: userId, runId: expeditionRunId });
        expedition = serializeOtherShoreExpedition(world, { starId: run.starId, viewerId: userId });
        stage = expedition.viewer.run?.currentStage;
        if (!stage || stage.id !== stageId || !['battle', 'boss'].includes(stage.kind)) {
          throw new Error('区域战役阶段已经变化，请重新确认行动台');
        }
        if (session.positionId !== run.starId) throw new Error(`需返回远征大星 ${run.starId}`);

        const now = Date.now();
        const cooldownKey = `xiuxian:other-shore:expedition:cooldown:${expeditionRunId}:${stageId}:${userId}`;
        const cooldownUntil = Number(await globalThis.redis.get(cooldownKey)) || 0;
        if (cooldownUntil > now) {
          throw new Error(`区域战斗尚在调息，还需${Math.ceil((cooldownUntil - now) / 60000)}分钟`);
        }
        const reserved = await globalThis.redis.set(
          cooldownKey,
          String(now + EXPEDITION_BATTLE_COOLDOWN_MS),
          { NX: true, EX: Math.ceil(EXPEDITION_BATTLE_COOLDOWN_MS / 1000) },
        );
        if (!reserved) throw new Error('区域战斗尚在调息，请稍后再试');

        const combatant = createOtherShoreBattlePlayer(player, userId);
        const enemy = createExpeditionEnemy(player, userId, run, expedition, now);
        const battle = await zd_battle(combatant, enemy, {
          battleType: stage.kind === 'boss' ? 'other_shore_campaign_boss' : 'other_shore_campaign_variant',
          preserveHpOnTimeout: true,
        });
        player = await Read_player(userId);
        session = currentSession(player);
        if (!session || (expectedRunId && session.runId !== expectedRunId)) {
          throw new Error('战斗结束时彼岸远征会话已经更替');
        }
        syncOtherShoreBattleHp(player, combatant, battle);

        const updated = await updateOtherShoreWorldState(
          globalThis.redis,
          createCanglanWorld,
          document => {
            maintainOtherShoreThreat(document);
            const latest = getOtherShoreExpeditionRun(document, {
              playerId: userId,
              runId: expeditionRunId,
            });
            let message;
            if (stage.kind === 'boss') {
              if (latest.status === 'ready_to_evac') {
                message = '玄阙灾核已在交锋期间被全服镇压，本次仅同步剩余气血。';
              } else {
                const result = applyOtherShoreCampaignBossBattle(document, {
                  starId: latest.starId,
                  playerId: userId,
                  playerName: player.名号,
                  runId: latest.runId,
                  battle,
                  operationId: operation,
                });
                if (!result.defeated && battle.winner !== 'A') {
                  markOtherShoreExpeditionDowned(document, {
                    playerId: userId,
                    runId: latest.runId,
                    reason: '玄阙灾核重创道躯',
                    operationId: `${operation}:downed`,
                  });
                }
                message = result.defeated
                  ? `【玄阙灾核伏诛】造成${bigNumberTransform(result.damage)}点有效伤害，全服待战修士均已完成首通。`
                  : `【共享首领交锋】有效伤害${bigNumberTransform(result.damage)}，灾核气血${bigNumberTransform(result.currentHp)}/${bigNumberTransform(result.maxHp)}${battle.winner === 'A' ? '' : '；你的道躯已进入濒危状态'}。`;
              }
            } else if (battle.winner === 'A') {
              const result = advanceOtherShoreExpedition(document, {
                playerId: userId,
                runId: latest.runId,
                stageId,
                loot: EXPEDITION_STAGE_LOOT[stageId] || [],
                operationId: operation,
              });
              message = `【${result.clearedStage.name}·清剿完成】同源变异体已经伏诛，下一阶段：${result.nextStage?.name || '玄阙灾核'}。`;
            } else {
              markOtherShoreExpeditionDowned(document, {
                playerId: userId,
                runId: latest.runId,
                reason: '同源变异体重创道躯',
                operationId: `${operation}:downed`,
              });
              message = '【区域战斗失利】你已进入濒危状态；同星修士可实施救援，亦可由你强制撤离。';
            }

            stagePlayerMutation(document, player, session, {
              userId,
              action: 'campaign_advance',
              targetId: stageId,
              operationId: operation,
              message,
              mutationKey,
              fields: THREAT_BATTLE_MUTATION_FIELDS,
            });
            return { message, battle };
          },
        );
        await deliverPlayerMutation(userId, player, mutationKey);
        return updated.value;
      });
      if (leased.busy) return { message: '玄阙战场正在结算另一场交锋，请稍候。' };
      return leased;
    });
  }

  async claimExpeditionSettlement(userId, operationId = '', expectedRunId = '') {
    const operation = operationId || randomUUID();
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const recovered = await deliverPendingPlayerMutations(userId, player);
      const recoveredClaim = recovered.find(item => (
        item.action === 'expedition_claim'
        && (!operationId || item.operationId === operation)
      ));
      if (recoveredClaim) return { message: recoveredClaim.message, replayed: true, recovered: true };
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const replay = findActionReceipt(session, operation, 'expedition_claim', undefined);
      if (replay) return { message: replay.message, replayed: true };
      await this.syncThreatSignals(userId, player);
      const world = await this.world();
      const pending = pendingExpeditionSettlement(world, userId);
      if (!pending) throw new Error('当前没有待领取的彼岸远征战果');
      const claimId = pending.claimId;
      const mutationKey = playerMutationKey(userId, session.runId, 'expedition_claim', claimId);

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          const settlement = pendingExpeditionSettlement(document, userId);
          if (!settlement || settlement.claimId !== claimId) throw new Error('远征结算已经变化，请重新同步');
          const payload = structuredClone(settlement);
          const claimed = claimOtherShoreExpeditionSettlement(document, {
            playerId: userId,
            claimId,
          });
          applyExpeditionSettlementReward(player, payload, claimed.itemCount);
          const names = claimed.items.map(item => `${item.name}×${item.quantity}`).join('、') || '无实物战利品';
          const message = `【彼岸远征结算】${names}已归入纳戒，彼岸威望+${payload.mode === 'forced' ? 3 : 8}。`;
          stagePlayerMutation(document, player, session, {
            userId,
            action: 'expedition_claim',
            targetId: claimId,
            operationId: operation,
            message,
            mutationKey,
            fields: EXPEDITION_REWARD_MUTATION_FIELDS,
            inventoryBag: expeditionLootBag(claimed.items),
            inventoryClaimId: claimId,
          });
          return { message };
        },
      );
      await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
  }

  async performThreatBattle(userId, action, operationId = '', expectedRunId = '') {
    if (!['challenge', 'defend'].includes(action)) throw new Error('未知的彼岸威胁战斗');
    const operation = operationId || randomUUID();
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }

      const recovered = await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const replay = findActionReceipt(session, operation, action, undefined);
      if (replay) return { message: replay.message, replayed: true };

      let world = await this.syncThreatSignals(userId, player);
      let threat = serializeOtherShoreThreat(world, {
        viewerId: userId,
        positionId: session.positionId,
        canRefine: canRefineOtherShoreOverlord(player),
      });
      const eventId = threat.eventId;
      const mutationKey = playerMutationKey(userId, session.runId, action, eventId);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) {
        return { message: recoveredCurrent.message, replayed: true, recovered: true };
      }
      if (Number(player.当前血量) <= 0) throw new Error('你当前气血枯竭，难以迎战彼岸强敌');

      const validate = current => {
        if (action === 'challenge') {
          if (!['calamity', 'overlord'].includes(current.phase)) throw new Error('当前威胁并非可讨伐阶段');
          if (session.positionId !== current.starId) throw new Error(`需先抵达事件大星 ${current.starId}`);
          if (current.phase === 'calamity' && current.viewer.calamityKill > 0) {
            throw new Error('你已镇压本轮同源灾厄，请等待其他修士补全十方战果');
          }
          return;
        }
        if (current.phase !== 'purge') throw new Error('禁宝司清剿使尚未进入星图');
        if (session.positionId !== current.purge.currentStarId) {
          throw new Error(`需前往清剿使当前所在大星 ${current.purge.currentStarId}`);
        }
        if (current.viewer.purgeDefense > 0) throw new Error('你已完成本轮防线贡献');
      };
      validate(threat);

      const leaseScope = action === 'challenge' && threat.phase === 'overlord'
        ? 'overlord'
        : `${action}:${userId}`;
      const leased = await withThreatBattleLease(eventId, leaseScope, async () => {
        world = await this.syncThreatSignals(userId, player);
        threat = serializeOtherShoreThreat(world, {
          viewerId: userId,
          positionId: session.positionId,
          canRefine: canRefineOtherShoreOverlord(player),
        });
        if (threat.eventId !== eventId) throw new Error('彼岸威胁已经更替，请重新观测星图');
        validate(threat);
        if (threat.phase === 'overlord' && leaseScope !== 'overlord') {
          throw new Error('灾厄魔主刚刚降临，请重新发起讨伐');
        }

        const now = Date.now();
        const cooldownKey = `xiuxian:other-shore:threat:cooldown:${eventId}:${action}:${userId}`;
        const cooldownUntil = Number(await globalThis.redis.get(cooldownKey)) || 0;
        if (cooldownUntil > now) {
          throw new Error(`彼岸征战尚在调息，还需${Math.ceil((cooldownUntil - now) / 60000)}分钟`);
        }
        const reserved = await globalThis.redis.set(
          cooldownKey,
          String(now + THREAT_BATTLE_COOLDOWN_MS),
          { NX: true, EX: Math.ceil(THREAT_BATTLE_COOLDOWN_MS / 1000) },
        );
        if (!reserved) throw new Error('彼岸征战尚在调息，请稍后再试');

        const startingPhase = threat.phase;
        const startingStarId = startingPhase === 'purge' ? threat.purge.currentStarId : threat.starId;
        const combatant = createOtherShoreBattlePlayer(player, userId);
        let enemy;
        let battleType;
        if (startingPhase === 'calamity') {
          enemy = createOtherShoreCalamityVariant(player, {
            eventId,
            starId: startingStarId,
            playerId: userId,
            now,
          });
          battleType = 'other_shore_calamity';
        } else if (startingPhase === 'overlord') {
          enemy = createOtherShoreThreatOverlordCombatant(world, {
            eventId,
            starId: startingStarId,
          });
          battleType = 'other_shore_overlord';
        } else {
          enemy = createOtherShorePurgeEnvoy(player, {
            eventId,
            starId: startingStarId,
            playerId: userId,
            pressure: threat.purge.pressure,
            escalation: world.threat.escalation,
            now,
          });
          battleType = 'other_shore_purge';
        }

        const battle = await zd_battle(combatant, enemy, {
          battleType,
          preserveHpOnTimeout: true,
        });
        player = await Read_player(userId);
        session = currentSession(player);
        if (!session || (expectedRunId && session.runId !== expectedRunId)) {
          throw new Error('战斗结束时彼岸远征会话已经更替');
        }
        syncOtherShoreBattleHp(player, combatant, battle);

        const updated = await updateOtherShoreWorldState(
          globalThis.redis,
          createCanglanWorld,
          document => {
            const event = maintainOtherShoreThreat(document);
            let message;
            if (event.eventId !== eventId) {
              message = '战斗结束时本轮威胁已由全服平定，本次仅同步剩余气血。';
            } else if (startingPhase === 'calamity') {
              if (event.phase !== 'calamity') {
                message = '同源灾厄潮已在战斗间隙结束，本次仅同步剩余气血。';
              } else if (battle.winner === 'A') {
                const settled = registerOtherShoreCalamityKill(document, {
                  eventId,
                  starId: startingStarId,
                  playerId: userId,
                  playerName: player.名号,
                  variantId: enemy.id,
                  operationId: operation,
                });
                if (!settled.duplicate) {
                  player.彼岸威望 = Math.max(0, Number(player.彼岸威望) || 0) + 3;
                }
                message = settled.spawnedOverlord
                  ? `【十厄归一】同源灾厄 ${settled.killCount}/${settled.killTarget}，灾厄魔主已降临此星。`
                  : `【同源灾厄伏诛】全服进度 ${settled.killCount}/${settled.killTarget}，彼岸威望+3。`;
              } else {
                message = `【讨伐失利】灾厄异相仍在星海游荡，你的气血降至${bigNumberTransform(player.当前血量)}。`;
              }
            } else if (startingPhase === 'overlord') {
              if (event.phase !== 'overlord') {
                message = '灾厄魔主已被其他修士镇压，本次仅同步剩余气血。';
              } else {
                const settled = applyOtherShoreThreatOverlordBattle(document, {
                  eventId,
                  starId: startingStarId,
                  playerId: userId,
                  playerName: player.名号,
                  battle,
                  operationId: operation,
                });
                message = settled.defeated
                  ? `【魔主伏诛】造成${bigNumberTransform(settled.damage)}点有效伤害。你可决定 #斩灭彼岸魔主 或 #炼化彼岸魔主。`
                  : `【魔主讨伐】有效伤害${bigNumberTransform(settled.damage)}，共享气血${bigNumberTransform(settled.currentHp)}/${bigNumberTransform(settled.maxHp)}${settled.revived ? '；魔主已逆命复生并引来超维注视' : ''}。`;
              }
            } else if (event.phase !== 'purge' || event.purge.currentStarId !== startingStarId) {
              message = '清剿舰队已转移至下一颗大星，本次仅同步剩余气血。';
            } else {
              const settled = registerOtherShorePurgeDefense(document, {
                eventId,
                starId: startingStarId,
                playerId: userId,
                playerName: player.名号,
                won: battle.winner === 'A',
                operationId: operation,
              });
              if (settled.granted > 0) {
                player.彼岸威望 = Math.max(0, Number(player.彼岸威望) || 0) + 5;
              }
              message = battle.winner === 'A'
                ? `【星海防线】全服防御 ${settled.defense}/${settled.defenseRequirement}${settled.resolved ? '，禁宝司清剿舰队已被逐出沧澜界' : ''}，彼岸威望+5。`
                : `【防线失守】${enemy.名号}仍在推进，当前防御 ${settled.defense}/${settled.defenseRequirement}。`;
            }

            stagePlayerMutation(document, player, session, {
              userId,
              action,
              targetId: eventId,
              operationId: operation,
              message,
              mutationKey,
              fields: THREAT_BATTLE_MUTATION_FIELDS,
            });
            return { message, battle, phase: document.threat.phase };
          },
        );
        await deliverPlayerMutation(userId, player, mutationKey);
        return updated.value;
      });
      if (leased.busy) {
        return { message: '这处彼岸战场正在结算另一场交锋，请稍候。' };
      }
      return leased;
    });
  }

  async performThreatAction(userId, action, operationId = '', expectedRunId = '') {
    if (!['execute', 'refine', 'claim'].includes(action)) throw new Error('未知的彼岸威胁动作');
    const operation = operationId || randomUUID();
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const recovered = await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const replay = findActionReceipt(session, operation, action, undefined);
      if (replay) return { message: replay.message, replayed: true };

      const world = await this.syncThreatSignals(userId, player);
      const threat = serializeOtherShoreThreat(world, {
        viewerId: userId,
        positionId: session.positionId,
        canRefine: canRefineOtherShoreOverlord(player),
      });
      const targetId = action === 'claim' ? threat.viewer.pendingRewardEventId : threat.eventId;
      if (!targetId) throw new Error('当前没有可领取的彼岸战果');
      const mutationKey = playerMutationKey(userId, session.runId, action, targetId);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) {
        return { message: recoveredCurrent.message, replayed: true, recovered: true };
      }

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          let message;
          if (action === 'execute') {
            chooseOtherShoreOverlordFate(document, {
              eventId: targetId,
              starId: session.positionId,
              playerId: userId,
              playerName: player.名号,
              choice: 'kill',
              canRefine: false,
              operationId: operation,
            });
            message = '【斩灭魔主】违禁道果已经湮灭，禁宝司清剿舰队循因果航路闯入沧澜星图。';
          } else if (action === 'refine') {
            if (!canRefineOtherShoreOverlord(player)) {
              throw new Error('只有掌握天魔化生功的极道天魔一脉可以炼化灾厄魔主');
            }
            const refinement = applyTianmoCalamityRefinement(player, {
              sourceLifeEssence: document.threat?.overlord?.生命本源,
              weight: OTHER_SHORE_THREAT_REFINEMENT_WEIGHT,
            });
            if (!refinement.applied) throw new Error('灾厄魔主本源未能纳入天魔化生');
            chooseOtherShoreOverlordFate(document, {
              eventId: targetId,
              starId: session.positionId,
              playerId: userId,
              playerName: player.名号,
              choice: 'refine',
              canRefine: true,
              operationId: operation,
            });
            message = `【天魔化生·魔主炼化】折算0.5名生灵，生命本源+${refinement.lifeSourceGain}，累计化生${refinement.refinementCount}；禁宝司清剿舰队已循因果降临。`;
          } else {
            const claimed = claimOtherShoreThreatReward(document, {
              eventId: targetId,
              playerId: userId,
              claimId: operation,
            });
            const applied = applyThreatReward(player, targetId, claimed.reward);
            const reward = applied.reward;
            message = applied.duplicate
              ? '本轮彼岸战果此前已归入道果。'
              : `【彼岸战果·${claimed.reward.tier}】纪元积累+${reward.era}、彼岸威望+${reward.prestige}、彼岸古史残章+${reward.fragments}。`;
          }

          stagePlayerMutation(document, player, session, {
            userId,
            action,
            targetId,
            operationId: operation,
            message,
            mutationKey,
            fields: action === 'refine'
              ? THREAT_REFINEMENT_MUTATION_FIELDS
              : action === 'claim'
                ? THREAT_REWARD_MUTATION_FIELDS
                : SESSION_MUTATION_FIELDS,
          });
          return { message };
        },
      );
      await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
  }

  async showOtherShore(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const state = await this.getWebState({ userId: result.userId });
    const current = state.nodes.find(node => node.id === state.player.positionId);
    const anchored = state.nodes.filter(node => node.status === 'anchored').length;
    await e.reply([
      '【彼岸世界·沧澜星图】',
      `所在大星：${current?.name || current?.id}（${current?.id}）`,
      `全服探明：${state.progress.known}/${state.progress.total}｜稳定星锚：${anchored}`,
      `心神：${state.player.mind}/${state.player.maxMind}｜余程：${state.player.mindRemainder}｜界压：${state.pressure}`, 
      state.player.suppressionImmune ? '界律：自身体系完整，免疫30%压制' : '界律：全属性与功法数值效果压制30%',
      `全服威胁：${THREAT_PHASE_NAMES[state.threat?.phase] || '未知'}｜事件星 ${state.threat?.starId || '未显化'}`,
      '星海动作：#观测大星｜#远征 q,r｜#探索大星｜#锚定大星｜#彼岸威胁｜#彼岸网页',
    ].join('\n'));
    return true;
  }

  async showThreat(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const state = await this.getWebState({ userId: result.userId });
      const threat = state.threat;
      const eventStar = state.nodes.find(node => node.id === threat.starId);
      const lines = [
        `【彼岸威胁·${THREAT_PHASE_NAMES[threat.phase] || threat.phase}】`,
        `${threat.title}｜${eventStar?.name || threat.starId}（${threat.starId}）`,
      ];
      if (threat.phase === 'calamity') {
        lines.push(`全服镇压：${threat.killCount}/${threat.killTarget}`, '抵达事件星后发送 #讨伐彼岸灾厄。');
      } else if (threat.phase === 'overlord') {
        lines.push(
          `魔主气血：${bigNumberTransform(threat.overlord.currentHp)}/${bigNumberTransform(threat.overlord.maxHp)}`,
          `个人有效伤害：${bigNumberTransform(threat.overlord.viewerDamage)}`,
          '发送 #讨伐彼岸魔主 参与共享气血讨伐。',
        );
      } else if (threat.phase === 'decision') {
        lines.push(
          `归宿裁定者：${threat.decision.chosenByName || '最终一击修士'}`,
          threat.viewer.canExecute
            ? '你可发送 #斩灭彼岸魔主；天魔化生一脉亦可发送 #炼化彼岸魔主。'
            : threat.viewer.canDecide
              ? `请先返回事件大星 ${threat.starId} 再裁定魔主归宿。`
              : '魔主道果正等待最终一击者裁定。',
        );
      } else if (threat.phase === 'purge') {
        const current = state.nodes.find(node => node.id === threat.purge.currentStarId);
        lines.push(
          `${threat.purge.title}｜当前 ${current?.name || threat.purge.currentStarId}（${threat.purge.currentStarId}）`,
          `防线：${threat.purge.defense}/${threat.purge.defenseRequirement}｜舰队压力：${threat.purge.pressure}`,
          `增援：${threat.escalation.hyperdimensional ? '超维强者已经显化' : threat.escalation.eraLord ? '纪元主宰已经降临' : '禁宝司先遣舰队'}`,
          '抵达舰队所在大星后发送 #抗击禁宝司。',
        );
      } else {
        lines.push('本轮清剿已经平定，十五分钟后新的灾厄因果会在已踏足大星显化。');
      }
      if (threat.viewer.canClaim) lines.push('你有未领取战果：发送 #领取彼岸战果。');
      await e.reply(lines.join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async replyThreatAction(e, action, battle = false) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const outcome = battle
        ? await this.performThreatBattle(result.userId, action)
        : await this.performThreatAction(result.userId, action);
      const logs = battle && Array.isArray(outcome.battle?.msg)
        ? outcome.battle.msg.filter(Boolean).slice(-8)
        : [];
      await e.reply([...logs, logs.length ? '' : null, outcome.message].filter(Boolean).join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async challengeThreat(e) {
    return this.replyThreatAction(e, 'challenge', true);
  }

  async executeThreatOverlord(e) {
    return this.replyThreatAction(e, 'execute');
  }

  async refineThreatOverlord(e) {
    return this.replyThreatAction(e, 'refine');
  }

  async defendAgainstPurge(e) {
    return this.replyThreatAction(e, 'defend', true);
  }

  async claimThreatReward(e) {
    return this.replyThreatAction(e, 'claim');
  }

  async openOtherShoreWeb(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const link = await createCanglanWebLink(this, {
        userId: result.userId,
        runId: currentSession(result.player).runId,
        displayName: result.player.名号 || '无名修士',
      });
      const message = `【沧澜界·全服星图】\n${link}\n入口两分钟内有效，进入后可持续使用两小时。`;
      if (!e.isGroup) {
        await e.reply(message);
        return true;
      }
      const friend = e.bot?.pickFriend?.(e.user_id);
      if (!friend?.sendMsg) throw new Error('当前适配器未开放私聊投递');
      await friend.sendMsg(message);
      await e.reply('沧澜星图入口已通过私聊送达，请在两分钟内开启。');
    } catch (error) {
      await e.reply(`沧澜星图入口生成失败：${error.message}`);
    }
    return true;
  }

  async observeStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const world = await this.world();
    const session = currentSession(result.player);
    let targetId = parseCoordinate(e.msg);
    if (!targetId) {
      targetId = world.stars.find(star =>
        world.states[star.id].phase === 'unobserved'
        && getOtherShoreHexDistance(session.positionId, star.id) === 1
      )?.id;
    }
    if (!targetId) {
      await e.reply('当前相邻大星均已完成初步观测。');
      return true;
    }
    try {
      const action = await this.performAction(result.userId, 'observe', targetId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async moveStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const targetId = parseCoordinate(e.msg);
    try {
      const action = await this.performAction(result.userId, 'move', targetId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async exploreStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const action = await this.performAction(result.userId, 'explore', currentSession(result.player).positionId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async anchorStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const action = await this.performAction(result.userId, 'anchor', currentSession(result.player).positionId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }
}

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { plugin } from '../../api/api.js';
import {
  __PATH,
  Read_equipment,
  Read_player,
  Read_najie,
  Write_equipment,
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
import {
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  clearInnateTreasureAuthorityState,
  readInnateTreasureState,
  writeInnateTreasureState,
} from '../../model/innateTreasure.js';
import { createDaoTreasureItem } from '../../model/daoTreasure.js';
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
  OTHER_SHORE_DAO_TREASURE_MATERIALS,
  OTHER_SHORE_DAO_TREASURE_RECIPES,
  getOtherShoreDaoTreasureRecipe,
  previewOtherShoreDaoTreasureForge,
  serializeOtherShoreProgression,
  validateOtherShoreLayerAccess,
} from '../../model/otherShoreProgression.js';
import {
  claimOtherShoreAncientEventReward,
  contributeOtherShoreAncientEvent,
  ensureOtherShoreAncientEvents,
  serializeOtherShoreAncientEvents,
} from '../../model/otherShoreAncientEvents.js';
import {
  claimOtherShoreDaoTreasureForge,
  ensureOtherShoreDaoTreasureForgeState,
  serializeOtherShoreDaoTreasureForge,
  startOtherShoreDaoTreasureForge,
} from '../../model/otherShoreDaoTreasureForge.js';
import {
  applyOtherShoreTrueWorldBattle,
  claimOtherShoreTrueWorldLoot,
  ensureOtherShoreTrueWorldState,
  exploreOtherShoreTrueWorld,
  getOtherShoreTrueWorldSector,
  OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT,
  moveOtherShoreTrueWorld,
  observeOtherShoreTrueWorld,
  serializeOtherShoreTrueWorld,
  startOtherShoreTrueWorldEncounter,
} from '../../model/otherShoreTrueWorld.js';
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
  OTHER_SHORE_CAMPAIGNS,
  OTHER_SHORE_CAMPAIGN_CHAIN,
  OTHER_SHORE_EXPEDITION_STAR_ID,
  OTHER_SHORE_QIN_FERRY_STAR_ID,
  OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID,
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
import { FileRollbackTransaction } from './rebirthTransaction.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { PLACE_LOCATION_MAP } from '../../model/weimianTravel.js';

const OTHER_SHORE_PLANE_ID = PLACE_LOCATION_MAP.彼岸世界;
const OTHER_SHORE_ORIGIN_PLANE_ID = PLACE_LOCATION_MAP.太初星墟;
const WORLD_SEED = 'canglan-prime-v1';
const ACTION_RECEIPT_LIMIT = 24;
const THREAT_NEXT_CYCLE_DELAY_MS = 15 * 60 * 1000;
const THREAT_BATTLE_COOLDOWN_MS = 5 * 60 * 1000;
const EXPEDITION_BATTLE_COOLDOWN_MS = 2 * 60 * 1000;
const TRUE_WORLD_BATTLE_COOLDOWN_MS = 8 * 60 * 1000;
const TRUE_WORLD_EXPLORATION_TARGET = OTHER_SHORE_TRUE_WORLD_SECTOR_COUNT;
const ANCIENT_EVENT_CONTRIBUTION = 10;
const FORMAL_DAO_RECIPE_IDS = Object.freeze([
  'three-innate-erasure',
  'dao-fruit-five-treasure',
  'return-truth-edit',
]);
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
const TRUE_WORLD_SESSION_FIELDS = Object.freeze([
  ...SESSION_MUTATION_FIELDS,
  '彼岸真世界记录',
]);
const TRUE_WORLD_BATTLE_MUTATION_FIELDS = Object.freeze([
  ...TRUE_WORLD_SESSION_FIELDS,
  '当前血量',
]);
const TRUE_WORLD_REWARD_MUTATION_FIELDS = Object.freeze([
  ...TRUE_WORLD_SESSION_FIELDS,
  '纪元积累',
  '准仙帝本源',
  '彼岸炼器材料',
  '彼岸真世界战果',
  '彼岸大道至宝炼制法',
]);
const ANCIENT_EVENT_REWARD_MUTATION_FIELDS = Object.freeze([
  ...TRUE_WORLD_SESSION_FIELDS,
  '彼岸古文明记录',
  '彼岸古史',
  '彼岸大道至宝炼制法',
  '彼岸先天至宝线索',
  '彼岸超维权柄残片',
]);
const DAO_FORGE_REWARD_MUTATION_FIELDS = Object.freeze([
  ...TRUE_WORLD_SESSION_FIELDS,
  '彼岸大道铸炉记录',
  '彼岸大道至宝记录',
]);
const PLAYER_MUTATION_FIELDS = Object.freeze([...new Set([
  ...THREAT_BATTLE_MUTATION_FIELDS,
  ...THREAT_REFINEMENT_MUTATION_FIELDS,
  ...THREAT_REWARD_MUTATION_FIELDS,
  ...EXPEDITION_REWARD_MUTATION_FIELDS,
  ...TRUE_WORLD_BATTLE_MUTATION_FIELDS,
  ...TRUE_WORLD_REWARD_MUTATION_FIELDS,
  ...ANCIENT_EVENT_REWARD_MUTATION_FIELDS,
  ...DAO_FORGE_REWARD_MUTATION_FIELDS,
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
  'trace-qin-route': Object.freeze([
    Object.freeze({ id: 'key:qin-star-route-fragment', name: '先秦星路残图', class: '道具', kind: 'key', quantity: 1 }),
  ]),
  'cross-spirit-rift': Object.freeze([
    Object.freeze({ id: 'common:spirit-rift-crystal', name: '灵界裂隙结晶', class: '材料', kind: 'common', quantity: 3 }),
  ]),
  'restore-ferry-stele': Object.freeze([
    Object.freeze({ id: 'common:dimensional-anchor-crystal', name: '维度锚晶', class: '材料', kind: 'common', quantity: 2 }),
  ]),
  'repel-rift-demons': Object.freeze([
    Object.freeze({ id: 'common:rift-demon-marrow', name: '裂魔道髓', class: '材料', kind: 'common', quantity: 1 }),
  ]),
  'decode-rift-genealogy': Object.freeze([
    Object.freeze({ id: 'key:rift-genealogy-fragment', name: '裂界源谱残卷', class: '道具', kind: 'key', quantity: 1 }),
  ]),
  'stabilize-anchor-veins': Object.freeze([
    Object.freeze({ id: 'common:dimensional-anchor-crystal', name: '维度锚晶', class: '材料', kind: 'common', quantity: 3 }),
  ]),
  'recover-qin-dojo': Object.freeze([
    Object.freeze({ id: 'key:qin-dojo-beacon', name: '先秦道场界标', class: '道具', kind: 'key', quantity: 1 }),
  ]),
  'clear-anchor-corruption': Object.freeze([
    Object.freeze({ id: 'common:mother-anchor-corruption-core', name: '母锚侵蚀核', class: '材料', kind: 'common', quantity: 2 }),
  ]),
});

const EXPEDITION_BOSS_PROFILES = Object.freeze({
  [OTHER_SHORE_EXPEDITION_STAR_ID]: Object.freeze({
    attack: 1.35,
    defense: 1.35,
    speed: 1.2,
    abilities: Object.freeze(['神炉灾焰', '同源映照', '纪元炉心']),
  }),
  [OTHER_SHORE_QIN_FERRY_STAR_ID]: Object.freeze({
    attack: 1.55,
    defense: 1.5,
    speed: 1.35,
    abilities: Object.freeze(['裂界断航', '灵界反照', '古航吞噬']),
  }),
  [OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID]: Object.freeze({
    attack: 1.85,
    defense: 1.75,
    speed: 1.55,
    abilities: Object.freeze(['母锚封维', '先秦道痕抹除', '噬界皇域']),
  }),
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

function reconcileCampaignStarCatalog(world) {
  const furnace = world?.stars?.find(star => star.id === OTHER_SHORE_EXPEDITION_STAR_ID);
  if (furnace) Object.assign(furnace, {
    name: '玄阙神炉',
    kind: 'forge',
    risk: 4,
    anchorRequirement: 7,
    description: '亦称太初熔星，先秦炼气士曾在此锻造星路阵眼，如今炉心孕育着同源灾核。',
    keyStar: true,
  });
  return world;
}

function createCanglanWorld() {
  const world = reconcileCampaignStarCatalog(
    observeOtherShoreStars(createOtherShoreWorld(WORLD_SEED), '0,0', 1),
  );
  ensureOtherShoreThreat(world);
  ensureOtherShoreExpeditionState(world);
  ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
  ensureOtherShoreAncientEvents(world);
  ensureOtherShoreDaoTreasureForgeState(world);
  return world;
}

function getTrueWorldExplorationSummary(world) {
  const trueWorld = ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
  const exploredCount = Math.max(0, Math.trunc(Number(trueWorld.global?.exploredCount) || 0));
  const sectorCount = Math.max(1, Math.trunc(Number(trueWorld.radius)
    ? 1 + 3 * Number(trueWorld.radius) * (Number(trueWorld.radius) + 1)
    : 7057));
  const target = Math.min(sectorCount, TRUE_WORLD_EXPLORATION_TARGET);
  const complete = exploredCount >= target || world.progression?.trueWorldExplorationComplete === true;
  return {
    status: complete ? 'complete' : 'in_progress',
    completed: complete,
    exploredCount,
    sectorCount,
    target,
    progress: target > 0 ? Math.min(100, Number((exploredCount / target * 100).toFixed(2))) : 100,
    percent: target > 0 ? Math.min(100, Number((exploredCount / target * 100).toFixed(2))) : 100,
  };
}

function buildOtherShoreProgression(world, player, userId, currentLayer = 'canglan') {
  const expedition = ensureOtherShoreExpeditionState(world);
  ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
  const playerId = String(userId || '');
  const campaignClears = OTHER_SHORE_CAMPAIGN_CHAIN.filter(starId => (
    Number(expedition.campaigns?.[starId]?.participants?.[playerId]?.clears) > 0
  )).length;
  const motherAnchorCampaign = expedition.campaigns?.[OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID];
  const motherAnchor = world.states?.[OTHER_SHORE_RIFT_MOTHER_ANCHOR_STAR_ID];
  const progressionState = world.progression || {};
  const canglanCampaignCleared = campaignClears === OTHER_SHORE_CAMPAIGN_CHAIN.length;
  const riftMotherAnchor = motherAnchor?.phase === 'cleared'
    && Number(motherAnchorCampaign?.participants?.[playerId]?.clears) > 0;
  const trueWorldUnlocked = canglanCampaignCleared && riftMotherAnchor;
  const dimensionBreak = player?.彼岸维度破壁
    ?? player?.彼岸乾坤界破壁
    ?? player?.dimensionBreak;
  const realmTier = getOtherShoreTravelRule(player).tier;
  const trueWorldExploration = getTrueWorldExplorationSummary(world);
  const qiankunUnlocked = trueWorldUnlocked && validateOtherShoreLayerAccess('qiankun', {
    currentLayer: 'true_world',
    trueWorldExplorationComplete: trueWorldExploration.completed,
    trueWorldExplored: progressionState.trueWorldExplored,
    trueWorldCampaignClears: progressionState.trueWorldCampaignClears,
    trueWorldExploration,
    realmTier,
    dimensionBreak,
  }).ok;
  const unlockedLayers = ['canglan'];
  if (trueWorldUnlocked) unlockedLayers.push('true_world');
  if (qiankunUnlocked) unlockedLayers.push('qiankun');
  return serializeOtherShoreProgression({
    currentLayer: currentLayer === 'true_world' && unlockedLayers.includes('true_world')
      ? 'true_world'
      : currentLayer === 'qiankun' && unlockedLayers.includes('qiankun')
        ? 'qiankun'
        : 'canglan',
    unlockedLayers,
    canglanCampaignClears: campaignClears,
    riftMotherAnchor,
    trueWorldUnlocked,
    trueWorldExplorationComplete: trueWorldExploration.completed,
    trueWorldExplored: progressionState.trueWorldExplored,
    trueWorldCampaignClears: progressionState.trueWorldCampaignClears,
    trueWorldExploration,
    dimensionBreak,
    realmTier,
    world,
    playerId: String(userId || ''),
    forge: world.progression?.forge || null,
  });
}

function maintainOtherShoreThreat(world, now = Date.now()) {
  reconcileCampaignStarCatalog(world);
  ensureOtherShoreExpeditionState(world);
  ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
  ensureOtherShoreAncientEvents(world);
  ensureOtherShoreDaoTreasureForgeState(world);
  const { event } = ensureOtherShoreThreat(world, { now });
  if (event.phase === 'purge') {
    const previousRouteIndex = Math.max(0, Number(event.purge?.routeIndex) || 0);
    const applyRouteSiege = (routeIndex, pressure) => {
      const starId = event.purge.route[routeIndex];
      if (!starId) return;
      applyOtherShoreCampSiege(world, {
        starId,
        purge: {
          pressure,
          defense: event.purge.defense,
          defenseRequirement: event.purge.defenseRequirement,
          occupied: routeIndex >= event.purge.route.length - 1,
        },
        operationId: `purge:${event.eventId}:route:${routeIndex}`,
        now,
      });
    };
    applyRouteSiege(previousRouteIndex, Math.max(0, Number(event.purge.pressure) || 0));
    const advanced = advanceOtherShoreThreat(world, { eventId: event.eventId, now });
    const currentRouteIndex = Math.max(previousRouteIndex, Number(event.purge?.routeIndex) || 0);
    for (let routeIndex = previousRouteIndex + 1; routeIndex <= currentRouteIndex; routeIndex++) {
      applyRouteSiege(
        routeIndex,
        Math.max(0, Number(advanced.pressure) - (currentRouteIndex - routeIndex)),
      );
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

function stableHashNumber(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unlockId(entry) {
  return String(typeof entry === 'object' ? entry?.id || entry?.name || '' : entry || '');
}

function normalizeUnlockList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return String(value || '').split(/[、,，\s]+/).filter(Boolean);
}

function appendUniqueUnlocks(target, entries = []) {
  const known = new Set(target.map(unlockId));
  const added = [];
  for (const entry of entries) {
    const id = unlockId(entry);
    if (!id || known.has(id)) continue;
    const value = typeof entry === 'object' ? structuredClone(entry) : entry;
    target.push(value);
    known.add(id);
    added.push(value);
  }
  return added;
}

function grantQuasiImmortalEmperorRecipe(player, claimId, now = Date.now()) {
  player.彼岸大道至宝炼制法 = normalizeUnlockList(player.彼岸大道至宝炼制法);
  const known = new Set(player.彼岸大道至宝炼制法.map(unlockId));
  const recipeId = FORMAL_DAO_RECIPE_IDS.find(id => !known.has(id));
  if (!recipeId) return null;
  const recipe = getOtherShoreDaoTreasureRecipe(recipeId);
  const unlock = {
    id: recipe.id,
    name: recipe.name,
    source: '真世界准仙帝战果',
    claimId,
    unlockedAt: now,
  };
  player.彼岸大道至宝炼制法.push(unlock);
  return unlock;
}

function chooseUnrecordedTreasureClue(userId, eventId, now = Date.now()) {
  const state = readInnateTreasureState();
  const unrecordedPool = INNATE_TREASURE_NAMES.slice(12);
  const available = unrecordedPool.filter(name => !state.owners?.[name]);
  const pool = available.length ? available : unrecordedPool;
  const treasureName = pool[stableHashNumber(`${userId}:${eventId}`) % pool.length];
  return {
    id: `other-shore-clue:${eventId}:${treasureName}`,
    name: `未录先天至宝·${treasureName}线索`,
    treasureName,
    sourceEventId: eventId,
    obtainedAt: now,
  };
}

function applyAncientEventReward(player, claim, userId, now = Date.now()) {
  const eventId = String(claim?.eventId || '');
  const claimId = String(claim?.claim?.claimId || `ancient:${eventId}:${userId}`);
  player.彼岸古文明记录 ||= { claims: {} };
  player.彼岸古文明记录.claims ||= {};
  if (player.彼岸古文明记录.claims[claimId]) {
    return { duplicate: true, claimId, rewards: [] };
  }

  const reward = claim?.reward || {};
  player.彼岸古史 = normalizeUnlockList(player.彼岸古史);
  player.彼岸大道至宝炼制法 = normalizeUnlockList(player.彼岸大道至宝炼制法);
  player.彼岸先天至宝线索 = normalizeUnlockList(player.彼岸先天至宝线索);
  player.彼岸超维权柄残片 = normalizeUnlockList(player.彼岸超维权柄残片);
  const rewards = [
    ...appendUniqueUnlocks(player.彼岸古史, reward.ancientHistory),
    ...appendUniqueUnlocks(player.彼岸大道至宝炼制法, reward.recipeUnlocks),
    ...appendUniqueUnlocks(player.彼岸超维权柄残片, reward.authorities),
  ];
  if (reward.innateTreasureClues?.length) {
    rewards.push(...appendUniqueUnlocks(
      player.彼岸先天至宝线索,
      [chooseUnrecordedTreasureClue(userId, eventId, now)],
    ));
  }
  player.彼岸古文明记录.claims[claimId] = {
    eventId,
    rewards: rewards.map(entry => unlockId(entry)),
    claimedAt: now,
  };
  return { duplicate: false, claimId, rewards };
}

function innateAuthorityName(authority, fallback) {
  return String(
    authority?.name
      || authority?.cooldownKey
      || authority?.command?.replace(/^#/, '').split(/\s+/)[0]
      || fallback,
  );
}

function normalizeInnateAuthorityToken(value) {
  return String(value || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^.+?[:：]/, '')
    .split(/\s+/)[0];
}

const ACTIVE_INNATE_AUTHORITY_OPTIONS = Object.freeze(
  Object.entries(INNATE_TREASURE_CATALOG).flatMap(([treasureName, catalog]) =>
    (catalog.authorities || [])
      .filter(authority => authority.cooldownKey)
      .map((authority, index) => ({
        id: `${treasureName}:authority:${index + 1}`,
        name: innateAuthorityName(authority, treasureName),
        sourceTreasureId: treasureName,
        sourceTreasureName: treasureName,
        command: authority.command || '',
        cooldownKey: authority.cooldownKey,
        effect: authority.effect || '',
        passive: false,
      })),
  ),
);

function resolveCustomForgeAuthorities(requested) {
  const selected = [];
  for (const raw of requested) {
    const token = normalizeInnateAuthorityToken(raw);
    const authority = ACTIVE_INNATE_AUTHORITY_OPTIONS.find(entry => [
      entry.name,
      entry.cooldownKey,
      normalizeInnateAuthorityToken(entry.command),
    ].includes(token));
    if (!authority) throw new Error(`未知先天至宝权柄【${raw}】`);
    if (!selected.some(entry => entry.cooldownKey === authority.cooldownKey)) {
      selected.push(structuredClone(authority));
    }
  }
  if (selected.length !== 3) throw new Error('还真编权法需要恰好三项不同的先天至宝权柄');
  return selected;
}

function parseDaoForgeTarget(value) {
  const source = String(value || '').trim();
  const separator = source.indexOf('|');
  const recipeId = separator < 0 ? source : source.slice(0, separator).trim();
  const entries = (separator < 0 ? '' : source.slice(separator + 1))
    .split(/[、,，]/)
    .map(entry => entry.trim())
    .filter(Boolean);
  const recipe = getOtherShoreDaoTreasureRecipe(recipeId);
  return {
    recipe,
    selections: recipe?.id === 'return-truth-edit'
      ? { customAuthorities: entries }
      : { treasureNames: entries },
  };
}

function forgeTreasureEntries(userId, recipe, requestedNames = [], { autoSelect = false } = {}) {
  const owned = ownedInnateTreasures(userId);
  const required = Math.max(0, Number(recipe?.requirements?.innateTreasures) || 0);
  const selectedNames = requestedNames.length
    ? [...new Set(requestedNames)]
    : autoSelect ? owned.slice(0, required) : [];
  const foreign = selectedNames.filter(name => !owned.includes(name));
  if (foreign.length) throw new Error(`这些先天至宝不属于你：${foreign.join('、')}`);
  return selectedNames.map(name => {
    const catalog = INNATE_TREASURE_CATALOG[name] || {};
    const authorities = [
      ...(catalog.authorities || []),
      ...(catalog.passives || []).map((effect, index) => ({
        name: `${catalog.title || name}·被动${index + 1}`,
        effect,
        passive: true,
      })),
    ];
    return {
      id: name,
      name,
      authorities: authorities.map((authority, index) => ({
        id: `${name}:authority:${index + 1}`,
        name: innateAuthorityName(authority, catalog.title || name),
        sourceTreasureId: name,
        sourceTreasureName: name,
        command: authority?.command || '',
        cooldownKey: authority?.cooldownKey || '',
        effect: authority?.effect || '',
        passive: authority?.passive === true,
      })),
    };
  });
}

function playerForgeContext(player, progression, treasures, customAuthorities) {
  return {
    ...player,
    currentLayer: progression.currentLayer,
    realm: strongestRealmName(player),
    realmTier: getOtherShoreTravelRule(player).tier,
    materials: player.彼岸炼器材料 || player.彼岸大道至宝材料 || {},
    innateTreasures: treasures,
    knownRecipes: normalizeUnlockList(
      player.彼岸大道至宝炼制法 || player.大道至宝炼制法,
    ),
    daoFruit: Boolean(player.道果 || player.自身道果),
    returnTruthPower: Boolean(player.还真之力 || player.如梦道祖还真之力),
    quasiImmortalEmperorSources: player.准仙帝本源 || 0,
    customAuthorities,
    trueWorldUnlocked: progression.prerequisites.trueWorldUnlocked,
    riftMotherAnchor: progression.prerequisites.riftMotherAnchor,
    canglanCampaignClears: progression.prerequisites.canglanCampaignClears,
    trueWorldExplorationComplete: progression.prerequisites.trueWorldExplorationComplete,
  };
}

function hasHeldInnateTreasure(najie, equipment, name) {
  if (equipment?.至宝?.name === name && !equipment.至宝.先天投影截止) return true;
  return (najie?.装备 || []).some(item => item?.name === name
    && Number(item?.数量 || 1) > 0
    && !item?.先天投影截止);
}

function consumeMaterialLedger(ledger, costs) {
  for (const [materialId, rawAmount] of Object.entries(costs || {})) {
    let remaining = Math.max(0, Math.trunc(Number(rawAmount) || 0));
    const material = OTHER_SHORE_DAO_TREASURE_MATERIALS.find(entry => entry.id === materialId);
    const keys = [materialId, material?.name, ...(material?.aliases || [])].filter(Boolean);
    for (const key of keys) {
      const amount = Math.max(0, Math.trunc(Number(ledger[key]) || 0));
      const consumed = Math.min(amount, remaining);
      if (consumed > 0) ledger[key] = amount - consumed;
      remaining -= consumed;
      if (remaining <= 0) break;
    }
    if (remaining > 0) throw new Error(`${material?.name || materialId}库存不足`);
  }
}

function applyForgeConsumption(player, najie, equipment, innateState, started, treasures) {
  const selectedNames = treasures.map(entry => entry.name);
  for (const name of selectedNames) {
    if (!hasHeldInnateTreasure(najie, equipment, name)) {
      throw new Error(`先天至宝【${name}】未在纳戒或至宝槽中`);
    }
    if (String(innateState.owners?.[name]?.ownerId || '') !== String(started.playerId)) {
      throw new Error(`先天至宝【${name}】全服归属已发生变化`);
    }
  }
  if (!player.彼岸炼器材料 && player.彼岸大道至宝材料) {
    player.彼岸炼器材料 = structuredClone(player.彼岸大道至宝材料);
  }
  player.彼岸炼器材料 ||= {};
  consumeMaterialLedger(player.彼岸炼器材料, started.consumption.materials);
  player.准仙帝本源 = Math.max(0, Math.trunc(Number(player.准仙帝本源) || 0)
    - Math.max(0, Math.trunc(Number(started.consumption.quasiImmortalEmperorSources) || 0)));
  if (started.consumption.daoFruit) {
    if (Object.hasOwn(player, '道果')) player.道果 = null;
    if (Object.hasOwn(player, '自身道果')) player.自身道果 = null;
  }

  const consumedNames = new Set((started.consumption.innateTreasures || []).map(entry => entry.name));
  for (const name of consumedNames) clearInnateTreasureAuthorityState(player, name);
  let najieChanged = false;
  let equipmentChanged = false;
  if (consumedNames.size) {
    const before = (najie.装备 || []).length;
    najie.装备 = (najie.装备 || []).filter(item => !consumedNames.has(item?.name) || item?.先天投影截止);
    najieChanged = najie.装备.length !== before;
    if (consumedNames.has(equipment?.至宝?.name) && !equipment.至宝.先天投影截止) {
      equipment.至宝 = null;
      equipmentChanged = true;
    }
  }
  player.彼岸大道铸炉记录 = {
    forgeId: started.forgeId,
    recipeId: started.recipeId,
    status: 'forging',
    startedAt: started.startedAt,
    readyAt: started.readyAt,
  };
  return { consumedNames: [...consumedNames], najieChanged, equipmentChanged };
}

function captureInnateTreasureRecords(state, names, playerId) {
  const consumed = new Set(names);
  return {
    names: [...names],
    owners: Object.fromEntries(names
      .filter(name => state.owners?.[name])
      .map(name => [name, structuredClone(state.owners[name])])),
    equipped: Object.fromEntries(names
      .filter(name => state.equipped?.[name])
      .map(name => [name, structuredClone(state.equipped[name])])),
    decree: consumed.has('崆峒印') && String(state.decree?.ownerId || '') === String(playerId)
      ? structuredClone(state.decree)
      : null,
    landscapeRealms: consumed.has('山河社稷图')
      ? structuredClone((state.landscapeRealms || [])
        .filter(realm => String(realm.ownerId || '') === String(playerId)))
      : [],
  };
}

function consumeInnateTreasureRecords(playerId, selectedNames, consumedNames) {
  const state = readInnateTreasureState({ strict: true });
  for (const name of selectedNames) {
    if (String(state.owners?.[name]?.ownerId || '') !== String(playerId)) {
      throw new Error(`先天至宝【${name}】全服归属已发生变化`);
    }
  }
  if (!consumedNames.length) return;
  for (const name of consumedNames) {
    delete state.owners[name];
    delete state.equipped[name];
  }
  if (consumedNames.includes('崆峒印')
    && String(state.decree?.ownerId || '') === String(playerId)) {
    state.decree = null;
  }
  if (consumedNames.includes('山河社稷图')) {
    state.landscapeRealms = (state.landscapeRealms || [])
      .filter(realm => String(realm.ownerId || '') !== String(playerId));
  }
  writeInnateTreasureState(state);
}

function restoreInnateTreasureRecords(snapshot) {
  if (!snapshot?.names?.length) return;
  const state = readInnateTreasureState({ strict: true });
  let changed = false;
  for (const name of snapshot.names) {
    if (!state.owners?.[name] && snapshot.owners[name]) {
      state.owners[name] = structuredClone(snapshot.owners[name]);
      changed = true;
    }
    if (!state.equipped?.[name] && snapshot.equipped[name]
      && String(state.owners?.[name]?.ownerId || '') === String(snapshot.owners[name]?.ownerId || '')) {
      state.equipped[name] = structuredClone(snapshot.equipped[name]);
      changed = true;
    }
  }
  if (snapshot.decree && !state.decree
    && String(state.owners?.['崆峒印']?.ownerId || '') === String(snapshot.decree.ownerId || '')) {
    state.decree = structuredClone(snapshot.decree);
    changed = true;
  }
  state.landscapeRealms ||= [];
  const existingRealmIds = new Set(state.landscapeRealms.map(realm => realm.id));
  for (const realm of snapshot.landscapeRealms || []) {
    if (existingRealmIds.has(realm.id)) continue;
    if (String(state.owners?.['山河社稷图']?.ownerId || '') !== String(realm.ownerId || '')) continue;
    state.landscapeRealms.push(structuredClone(realm));
    changed = true;
  }
  if (changed) writeInnateTreasureState(state);
}

function createOtherShoreDaoTreasureItem(treasure, userId) {
  const base = createDaoTreasureItem({
    name: treasure.name,
    ownerId: String(userId),
    integrity: 100,
    completedWorldYear: 0,
  });
  return {
    ...base,
    ...structuredClone(treasure),
    id: 39_100_000 + (stableHashNumber(treasure.sourceForgeId || treasure.name) % 800_000),
    ownerId: String(userId),
    author_name: String(userId),
    绑定者: String(userId),
    彼岸大道至宝: true,
    固定全属性: base.固定全属性,
    全属性倍率加成: base.全属性倍率加成,
    完整度: 100,
    数量: 1,
    不可出售: true,
    desc: '由彼岸古文明炼制法铸成，可撕裂维度并承载低境界修士跨维航行。',
  };
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

function assertTrueWorldExclusive(world, userId) {
  if (currentExpeditionRun(world, userId)) {
    throw new Error('区域远征仍在进行，请先完成撤离再进入真世界');
  }
  if (pendingExpeditionSettlement(world, userId)) {
    throw new Error('远征战果尚未结算，请先领取后再进入真世界');
  }
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
    phase: star.phase,
    cleared: star.phase === 'cleared',
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
    const persistedPlayer = pending.action === 'dao_forge_claim'
      ? await Read_player(userId)
      : null;
    const forgeDelivered = persistedPlayer?.彼岸大道至宝记录?.[pending.targetId]?.delivered === true;
    if (!forgeDelivered) {
      claimXianguBagItems(
        najie,
        pending.inventoryBag,
        `xiangu:other-shore:${pending.inventoryClaimId}`,
      );
      if (!await Write_najie(userId, najie)) {
        throw new Error('纳戒处于时间线封锁状态，彼岸战果尚未投递');
      }
    }
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
  if (!boss || boss.status === 'defeated') {
    throw new Error(`${boss?.name || '区域首领'}已经被全服修士镇压`);
  }
  const profile = EXPEDITION_BOSS_PROFILES[run.starId]
    || EXPEDITION_BOSS_PROFILES[OTHER_SHORE_EXPEDITION_STAR_ID];
  enemy.id = boss.bossId;
  enemy.type = '彼岸区域共享首领';
  enemy.名号 = `${boss.name}·纪元残躯`;
  enemy.当前血量 = boss.currentHp;
  enemy.血量上限 = boss.currentHp;
  enemy.攻击 = Math.max(1, Math.floor(Number(enemy.攻击) * profile.attack));
  enemy.防御 = Math.max(1, Math.floor(Number(enemy.防御) * profile.defense));
  enemy.速度 = Math.max(1, Math.floor(Number(enemy.速度) * profile.speed));
  enemy.boss = true;
  enemy.能力标记 = [...profile.abilities];
  return enemy;
}

const TRUE_WORLD_TIER_ABILITIES = Object.freeze({
  true_immortal: Object.freeze(['灵界裂隙折光', '先秦炼气遗痕']),
  immortal_king: Object.freeze(['万星归墟法', '裂界断流']),
  immortal_king_giant: Object.freeze(['葬界指', '破纪元枪', '超维回响']),
  quasi_immortal_emperor: Object.freeze(['灾厄祭世秘法', '魔主化外身', '魔神斩天诀', '逆命劫生经']),
});

function trueWorldCoordinateParts(value) {
  const match = String(value || '').trim().match(/^(-?\d+),(-?\d+)$/);
  if (!match) throw new Error('真世界坐标格式应为 q,r');
  return { q: Number(match[1]), r: Number(match[2]) };
}

function trueWorldStraightPath(fromId, toId) {
  const from = trueWorldCoordinateParts(fromId);
  const to = trueWorldCoordinateParts(toId);
  const distance = getOtherShoreHexDistance(from, to);
  const path = [];
  for (let step = 0; step <= distance; step += 1) {
    const ratio = distance === 0 ? 0 : step / distance;
    const point = cubeRound(
      from.q + (to.q - from.q) * ratio,
      from.r + (to.r - from.r) * ratio,
    );
    const id = otherShoreCoordinateId(point);
    if (path.at(-1) !== id) path.push(id);
  }
  return path;
}

function syncTrueWorldViewer(world, userId, playerName, session) {
  const state = ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
  // serialize creates a normalized per-player record without exposing the whole sector sea.
  serializeOtherShoreTrueWorld(world, { viewerId: String(userId), center: '0,0', radius: 0 });
  const viewer = state.players[String(userId)];
  const coordinate = String(
    session?.trueWorldPositionId
      || viewer?.coordinate
      || '0,0',
  );
  viewer.playerName = String(playerName || viewer.playerName || userId);
  viewer.coordinate = coordinate;
  viewer.knownSectors ||= {};
  viewer.knownSectors[coordinate] = true;
  viewer.mindRemainder = Math.max(0, Math.trunc(Number(
    session?.trueWorldMindRemainder ?? viewer.mindRemainder,
  ) || 0));
  if (session) {
    session.trueWorldPositionId = coordinate;
    session.trueWorldMindRemainder = viewer.mindRemainder;
  }
  return viewer;
}

function createTrueWorldEnemy(player, userId, coordinate, encounter, now = Date.now()) {
  if (!encounter) throw new Error('当前扇区尚未生成真世界敌群');
  const enemy = createOtherShoreCalamityVariant(player, {
    eventId: encounter.encounterId,
    starId: coordinate,
    playerId: userId,
    now,
  });
  const abilities = TRUE_WORLD_TIER_ABILITIES[encounter.tier]
    || TRUE_WORLD_TIER_ABILITIES.true_immortal;
  Object.assign(enemy, {
    id: encounter.encounterId,
    eventId: encounter.encounterId,
    starId: coordinate,
    type: '真世界灾厄变异体',
    名号: encounter.name,
    攻击: Math.max(1, Math.trunc(Number(encounter.attack) || 1)),
    防御: Math.max(1, Math.trunc(Number(encounter.defense) || 1)),
    当前血量: Math.max(1, Math.trunc(Number(encounter.currentHp) || 1)),
    血量上限: Math.max(1, Math.trunc(Number(encounter.maxHp) || 1)),
    暴击率: 1,
    暴击伤害: 3,
    速度: 1000,
    元神: Math.max(1, Math.trunc(Number(encounter.attack) || 1)),
    生命本源: 16,
    level_id: 16,
    Physique_id: 16,
    mijinglevel_id: 16,
    xiangulevel_id: 16,
    huafenlevel_id: 16,
    额外体系: '彼岸同源灾厄道果',
    boss: encounter.tier === 'quasi_immortal_emperor',
    能力标记: [...abilities],
    学习的功法: [...abilities],
    _忽略境界速度加成: true,
  });
  enemy.灵根 = { name: encounter.name, type: '彼岸', 法球倍率: 1 };
  enemy.法球倍率 = 1;
  return enemy;
}

function trueWorldLootBag(items = []) {
  const bagItems = (Array.isArray(items) ? items : [])
    // 炼器材料由彼岸炼器材料账本承载，避免同时进入纳戒造成双重库存。
    .filter(item => item?.kind !== 'material' && item?.class !== '材料');
  if (!bagItems.length) return null;
  return {
    items: bagItems.map(item => ({
      ...structuredClone(item),
      class: item.kind === 'material' || item.class === '材料' ? '材料' : '道具',
      type: item.kind === 'technique' ? '功法' : '道具',
      quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)),
    })).filter(item => item.quantity > 0),
  };
}

function applyTrueWorldClaimToPlayer(player, claim, now = Date.now()) {
  const claimId = String(claim?.claimId || '');
  if (!claimId) throw new Error('真世界战果编号缺失');
  player.彼岸真世界战果 ||= {};
  const duplicate = Boolean(player.彼岸真世界战果[claimId]);
  let recipeUnlock = null;
  if (!duplicate) {
    player.纪元积累 = Math.max(0, Math.trunc(Number(player.纪元积累) || 0))
      + Math.max(0, Math.trunc(Number(claim.eraAccumulation) || 0));
    player.准仙帝本源 = Math.max(0, Math.trunc(Number(player.准仙帝本源) || 0))
      + Math.max(0, Math.trunc(Number(claim.reward?.quasiImmortalEmperorSources) || 0));
    player.彼岸炼器材料 ||= {};
    for (const [id, quantity] of Object.entries(claim.materials || {})) {
      player.彼岸炼器材料[id] = Math.max(0, Math.trunc(Number(player.彼岸炼器材料[id]) || 0))
        + Math.max(0, Math.trunc(Number(quantity) || 0));
    }
    if (claim.reward?.tier === 'quasi_immortal_emperor') {
      recipeUnlock = grantQuasiImmortalEmperorRecipe(player, claimId, now);
    }
    player.彼岸真世界战果[claimId] = {
      encounterId: claim.encounterId || claim.reward?.encounterId || '',
      tier: claim.reward?.tier || '',
      recipeId: recipeUnlock?.id || '',
      claimedAt: now,
    };
  }
  return { duplicate, recipeUnlock, bag: trueWorldLootBag(claim.items) };
}

function persistTrueWorldPosition(player, session, viewer, now = Date.now()) {
  player.彼岸真世界记录 ||= {};
  player.彼岸真世界记录.positionId = String(session?.trueWorldPositionId || viewer?.coordinate || '0,0');
  player.彼岸真世界记录.mindRemainder = Math.max(0, Math.trunc(Number(
    session?.trueWorldMindRemainder ?? viewer?.mindRemainder,
  ) || 0));
  player.彼岸真世界记录.lastActionAt = now;
}

function serializeExpeditionForWeb(world, session, userId) {
  const playerId = String(userId);
  const storedRun = world?.expedition?.runs?.[playerId] || null;
  const pending = pendingExpeditionSettlement(world, playerId);
  const positionId = String(session?.positionId || '');
  const idleFocusStarId = OTHER_SHORE_CAMPAIGNS[positionId]
    ? positionId
    : OTHER_SHORE_EXPEDITION_STAR_ID;
  const focusStarId = storedRun && (
    EXPEDITION_ACTIVE_STATUSES.has(storedRun.status) || pending
  )
    ? storedRun.starId
    : idleFocusStarId;
  const raw = serializeOtherShoreExpedition(world, {
    starId: focusStarId,
    viewerId: playerId,
  });
  const run = storedRun?.starId === focusStarId ? raw.viewer.run : null;
  const recoveryOnly = run?.mode === 'recovery';
  const stageTotal = raw.campaign?.stages?.length || 0;
  const stage = recoveryOnly
    ? { id: 'lost-cache-recovery', name: '追回遗失行囊', kind: 'recovery' }
    : run?.currentStage || null;
  const active = Boolean(run && EXPEDITION_ACTIVE_STATUSES.has(run.status));
  const atStar = session.positionId === focusStarId;
  const campEstablished = raw.camp.level > 0;
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
  const campaignUnlocked = raw.campaign?.unlocked !== false;
  const lockedReason = campaignUnlocked
    ? ''
    : `需先完成前置战役【${raw.campaign?.prerequisite?.name || '未知战役'}】个人首通`;
  const campaignName = raw.campaign?.name || '当前大星';

  return {
    exists: Boolean(raw.campaign),
    active,
    mode: run?.mode || 'campaign',
    runId: run?.runId || 'IDLE',
    starId: focusStarId,
    status: run?.status || (hasPendingClaim ? 'settled' : 'idle'),
    campaign: {
      id: raw.campaign?.campaignId || '',
      title: raw.campaign?.name ? `${raw.campaign.name}区域战役` : '当前大星尚无区域战役',
      status: run?.status || raw.campaign?.status || 'idle',
      complete: personalComplete && !recoveryOnly,
      progress: recoveryOnly ? 0 : stageTotal ? Math.min(100, (Number(run?.stageIndex) || 0) / stageTotal * 100) : 0,
      boss: raw.campaign?.boss || null,
      unlocked: campaignUnlocked,
      lockedReason,
      prerequisite: raw.campaign?.prerequisite || null,
      chain: raw.campaignChain || [],
    },
    stage: {
      id: stage?.id || '',
      name: stage?.name || (personalComplete ? '首通完成' : '等待建立远征'),
      kind: stage?.kind || '',
      index: recoveryOnly ? 0 : Math.max(0, Number(run?.stageIndex) || 0),
      number: recoveryOnly ? 1 : run ? Math.min(stageTotal, (Number(run.stageIndex) || 0) + 1) : 0,
      total: recoveryOnly ? 1 : stageTotal,
    },
    camp: {
      ...raw.camp,
      established: campEstablished,
      name: campEstablished ? `${campaignName}前线营地` : `${campaignName}临时驻点`,
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
        && campaignUnlocked
        && (viewerClears === 0 || lostCaches.some(cache => cache.starId === focusStarId))
        && ['anchored', 'cleared'].includes(phase),
      canBuildCamp: atStar
        && ['visited', 'anchored', 'cleared'].includes(phase)
        && run?.status !== 'downed'
        && campNeedsWork,
      canAdvance: atStar
        && !recoveryOnly
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
  const avatarName = getActiveZhutianAvatarName(player);
  return deliverOtherShorePlayerMutations(
    globalThis.redis,
    createCanglanWorld,
    (key, pending) => key.startsWith(prefix) && (!avatarName || pending?.action !== 'refine'),
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
        { reg: '^#进入真世界$', fnc: 'enterTrueWorld' },
        { reg: '^#返回沧澜界$', fnc: 'leaveTrueWorld' },
        { reg: '^#(?:彼岸世界|沧澜星图|彼岸状态)$', fnc: 'showOtherShore' },
        { reg: '^#真世界(?:状态|探索)?$', fnc: 'showTrueWorld' },
        { reg: '^#彼岸层级$', fnc: 'showOtherShoreProgression' },
        { reg: '^#彼岸铸宝(?:\\s+.+)?$', fnc: 'previewOtherShoreForge' },
        { reg: '^#彼岸古文明$', fnc: 'showAncientEvents' },
        { reg: '^#推进古文明事件(?:\\s+\\S+)?$', fnc: 'contributeAncientEvent' },
        { reg: '^#领取古文明战果(?:\\s+\\S+)?$', fnc: 'claimAncientEventReward' },
        { reg: '^#大道开炉\\s+\\S+(?:\\s+.+)?$', fnc: 'startDaoForge' },
        { reg: '^#大道出炉$', fnc: 'claimDaoForge' },
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
        { reg: '^#观测真世界(?:\\s+-?\\d+\\s*[,，]\\s*-?\\d+)?$', fnc: 'observeTrueWorld' },
        { reg: '^#(?:前往|移动至)真世界\\s+-?\\d+\\s*[,，]\\s*-?\\d+$', fnc: 'moveTrueWorld' },
        { reg: '^#探索真世界$', fnc: 'exploreTrueWorld' },
        { reg: '^#(?:迎战|挑战)真世界敌群$', fnc: 'challengeTrueWorld' },
        { reg: '^#领取真世界战果(?:\\s+\\S+)?$', fnc: 'claimTrueWorldReward' },
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
      const trueWorldViewer = world.trueWorld?.players?.[String(userId)];
      const recordedTrueWorldPosition = String(player.彼岸真世界记录?.positionId || '');
      const trueWorldPositionId = String(
        trueWorldViewer?.coordinate || recordedTrueWorldPosition || '0,0',
      );
      player.other_shore = {
        version: 1,
        worldId: WORLD_SEED,
        runId: randomUUID(),
        positionId,
        enteredAt: Date.now(),
        mindRemainder: storedTier === rule.tier ? Math.max(0, Number(player.彼岸心神余程) || 0) : 0,
        mindTier: rule.tier,
        pressure: 0,
        layer: 'canglan',
        trueWorldPositionId,
        trueWorldMindRemainder: Math.max(0, Number(
          trueWorldViewer?.mindRemainder ?? player.彼岸真世界记录?.mindRemainder,
        ) || 0),
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
      if (session.layer === 'true_world') {
        return { message: '你正在真世界远征，请先发送 #返回沧澜界，再沿稳定星锚离开彼岸。' };
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
      persistTrueWorldPosition(player, session, world.trueWorld?.players?.[String(userId)]);
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
    ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
    const trueWorldPlayer = syncTrueWorldViewer(world, String(userId), player.名号, session);
    const trueWorldPositionId = trueWorldPlayer.coordinate;
    const currentLayer = session.layer === 'true_world' ? 'true_world' : 'canglan';
    const progression = buildOtherShoreProgression(world, player, String(userId), currentLayer);
    const trueWorldRaw = serializeOtherShoreTrueWorld(world, {
      viewerId: String(userId),
      center: trueWorldPositionId,
      radius: 3,
    });
    const trueWorldUnlocked = progression.prerequisites.trueWorldUnlocked === true;
    const trueWorld = {
      ...trueWorldRaw,
      exists: true,
      unlocked: trueWorldUnlocked,
      currentLayer,
      currentSectorId: trueWorldRaw.viewer?.coordinate || trueWorldPositionId,
      enemy: trueWorldRaw.currentSector?.encounter || null,
    };
    const ancientEvents = serializeOtherShoreAncientEvents(world, { viewerId: String(userId) });
    for (const event of ancientEvents.events) {
      event.viewer.atCoordinate = currentLayer === 'true_world'
        && event.coordinate === String(trueWorldPositionId);
      event.viewer.canContribute = event.viewer.canContribute && event.viewer.atCoordinate;
    }
    const daoForge = serializeOtherShoreDaoTreasureForge(world, {
      playerId: String(userId),
    });
    const knownRecipeSource = player.彼岸大道至宝炼制法 || player.大道至宝炼制法 || [];
    const knownRecipes = Array.isArray(knownRecipeSource)
      ? knownRecipeSource
      : String(knownRecipeSource).split(/[、,，\s]+/).filter(Boolean);
    daoForge.ownedInnateTreasures = ownedInnateTreasures(userId);
    daoForge.authorityOptions = ACTIVE_INNATE_AUTHORITY_OPTIONS.map(authority => ({
      name: authority.name,
      sourceTreasureName: authority.sourceTreasureName,
      command: authority.command,
      cooldownKey: authority.cooldownKey,
    }));
    daoForge.recipes = progression.recipes.map(recipe => {
      const treasures = forgeTreasureEntries(userId, recipe, [], { autoSelect: true });
      const preview = previewOtherShoreDaoTreasureForge(recipe.id, playerForgeContext(
        player,
        progression,
        treasures,
        player.自定义强化权柄 || [],
      ));
      const forgeInputMissing = recipe.id === 'return-truth-edit'
        ? preview.missing.filter(entry => entry.id !== 'custom-authorities')
        : preview.missing;
      return {
        id: recipe.id,
        index: recipe.index,
        name: recipe.name,
        description: recipe.description,
        known: knownRecipes.some(entry => unlockId(entry) === recipe.id),
        ready: forgeInputMissing.length === 0
          && preview.errors.length === 0
          && recipe.id !== 'custom-ancient-method',
        unavailable: recipe.id === 'custom-ancient-method',
        missing: forgeInputMissing,
      };
    });
    if (!trueWorldUnlocked) {
      // 未接驳时只返回入口元数据，避免把程序化扇区、边界和共享战况提前暴露给前端。
      trueWorld.seed = null;
      trueWorld.center = null;
      trueWorld.currentSectorId = null;
      trueWorld.global = {
        observedCount: 0,
        exploredCount: 0,
        progressPercent: 0,
        totalContribution: 0,
        eraAccumulation: 0,
        quasiImmortalEmperorDefeated: 0,
        encounterCount: 0,
        victoryCount: 0,
        opportunityCount: 0,
        materialTotals: {},
        materialNames: {},
      };
      trueWorld.frontier = [];
      trueWorld.sectors = [];
      trueWorld.activeEncounters = [];
      trueWorld.currentSector = null;
      trueWorld.enemy = null;
      trueWorld.capabilities = {
        canObserve: false,
        canMove: false,
        canExplore: false,
        canEncounter: false,
        canClaim: false,
      };
      trueWorld.viewer = null;
    }
    const observed = serialized.stars.filter(star => star.discovered).length;
    const known = serialized.stars.filter(star => star.visited).length;
    return {
      version: 1,
      worldId: WORLD_SEED,
      currentLayer,
      progression,
      player: {
        name: player.名号 || '无名修士',
        realm: strongestRealmName(player),
        travelTier: travel.tier,
        mind: Math.max(0, Number(player.心神) || 0),
        maxMind: getSpiritHeartMax(player),
        mindRemainder: Math.max(0, Number(session.mindRemainder) || 0),
        positionId: session.positionId,
        layer: currentLayer,
        trueWorldPositionId,
        trueWorldMindRemainder: Math.max(0, Number(session.trueWorldMindRemainder) || 0),
        eraAccumulation: Math.max(0, Number(player.纪元积累) || 0),
        quasiImmortalEmperorSources: Math.max(0, Number(player.准仙帝本源) || 0),
        forgeMaterials: structuredClone(player.彼岸炼器材料 || {}),
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
      trueWorld,
      ancientEvents,
      daoForge,
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
    const trueWorldActions = new Set([
      'true_world_observe',
      'true_world_move',
      'true_world_explore',
      'true_world_encounter',
      'true_world_encounter_start',
      'true_world_battle',
      'true_world_claim',
      'true_world_enter',
      'true_world_leave',
    ]);
    const ancientEventActions = new Set([
      'ancient_event_contribute',
      'ancient_event_claim',
    ]);
    const daoForgeActions = new Set([
      'dao_forge_start',
      'dao_forge_claim',
    ]);
    if (ancientEventActions.has(name)) {
      result = await this.performAncientEventAction(
        String(userId),
        name,
        String(targetId || ''),
        String(operationId || ''),
        String(runId || ''),
      );
    } else if (daoForgeActions.has(name)) {
      if (name === 'dao_forge_start') {
        const target = parseDaoForgeTarget(targetId);
        if (!target.recipe) throw new Error('未知大道至宝配方');
        result = await this.startDaoTreasureForge(
          String(userId),
          target.recipe.id,
          target.selections,
          String(operationId || ''),
          String(runId || ''),
        );
      } else result = await this.claimDaoTreasureForge(
          String(userId),
          String(targetId || ''),
          String(operationId || ''),
          String(runId || ''),
        );
    } else if (trueWorldActions.has(name)) {
      if (name === 'true_world_enter' || name === 'true_world_leave') {
        result = await this.setTrueWorldLayer(
          String(userId),
          name === 'true_world_enter',
          String(runId || ''),
        );
      } else {
        result = await this.performTrueWorldAction(
          String(userId),
          name,
          String(targetId || ''),
          String(operationId || ''),
          String(runId || ''),
        );
      }
    } else if (expeditionActions.has(name)) {
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

  async performAncientEventAction(userId, action, eventId, operationId = '', expectedRunId = '') {
    const operation = operationId || randomUUID();
    const target = String(eventId || '');
    if (!target) throw new Error('彼岸古文明事件编号缺失');
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

      const mutationKey = playerMutationKey(userId, session.runId, action, target);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) return { message: recoveredCurrent.message, replayed: true, recovered: true };
      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          const view = serializeOtherShoreAncientEvents(document, { viewerId: userId });
          const event = view.events.find(entry => entry.id === target);
          if (!event) throw new Error('彼岸古文明事件不存在');
          if (action === 'ancient_event_contribute') {
            if (session.layer !== 'true_world') throw new Error('需先进入真世界再推进古文明事件');
            if (String(session.trueWorldPositionId || '') !== event.coordinate) {
              throw new Error(`需先抵达真世界扇区 ${event.coordinate}`);
            }
            const result = contributeOtherShoreAncientEvent(document, {
              eventId: target,
              playerId: userId,
              playerName: player.名号,
              amount: ANCIENT_EVENT_CONTRIBUTION,
              operationId: `ancient:${session.runId}:${operation}:contribute`,
            });
            const message = result.chapterCompleted
              ? `【古文明章节完成·${event.name}】本次贡献${result.applied}，全服已复原该段古史${result.chainCompleted ? '，纪元主宰观测链被彻底切断' : ''}。`
              : `【古文明推进·${event.name}】贡献+${result.applied}，全服进度${result.progress}/${result.contributionRequired}。`;
            return { message, result };
          }
          if (action !== 'ancient_event_claim') throw new Error('未知的古文明事件动作');
          const claimed = claimOtherShoreAncientEventReward(document, {
            eventId: target,
            playerId: userId,
            operationId: `ancient:${session.runId}:${operation}:claim`,
          });
          const applied = applyAncientEventReward(player, claimed, userId);
          const rewardNames = applied.rewards.map(entry => entry.name || unlockId(entry)).filter(Boolean);
          const message = applied.duplicate
            ? '该段古文明战果此前已经归入道果。'
            : `【古文明战果·${event.name}】${rewardNames.join('、') || '古史因果'}已归入本体。`;
          stagePlayerMutation(document, player, session, {
            userId,
            action,
            targetId: target,
            operationId: operation,
            message,
            mutationKey,
            fields: ANCIENT_EVENT_REWARD_MUTATION_FIELDS,
          });
          return { message, claimed, applied };
        },
      );
      if (action === 'ancient_event_claim') await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
  }

  async startDaoTreasureForge(
    userId,
    recipeId,
    selections = {},
    operationId = '',
    expectedRunId = '',
  ) {
    const operation = operationId || randomUUID();
    const recipe = getOtherShoreDaoTreasureRecipe(recipeId);
    if (!recipe) throw new Error('未知大道至宝配方');
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      const session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      if (session.layer !== 'true_world') throw new Error('大道铸炉只能在真世界法则中稳定开炉');

      const requestedNames = Array.isArray(selections.treasureNames) ? selections.treasureNames : [];
      const treasures = forgeTreasureEntries(userId, recipe, requestedNames);
      const requestedAuthorities = Array.isArray(selections.customAuthorities)
        ? selections.customAuthorities
        : [];
      const customAuthorities = recipe.id === 'return-truth-edit'
        ? resolveCustomForgeAuthorities(requestedAuthorities)
        : requestedAuthorities;
      const [najie, equipment] = await Promise.all([
        Read_najie(userId),
        Read_equipment(userId),
      ]);
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${userId}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${userId}.json`));
      transaction.capture(path.join(__PATH.equipment_path, `${userId}.json`));
      let innateRollback = null;
      let innateRecordsConsumed = false;
      const domainOperationId = `forge:${session.runId}:${operation}:start`;

      try {
        const updated = await updateOtherShoreWorldState(
          globalThis.redis,
          createCanglanWorld,
          async document => {
            maintainOtherShoreThreat(document);
            const progression = buildOtherShoreProgression(document, player, userId, 'true_world');
            if (!progression.prerequisites.trueWorldUnlocked) {
              throw new Error('真世界尚未开放，当前大道炉无法锚定');
            }
            const forgeState = ensureOtherShoreDaoTreasureForgeState(document);
            const replayed = Boolean(forgeState.receipts[domainOperationId]);
            const started = startOtherShoreDaoTreasureForge(document, {
              playerId: userId,
              playerName: player.名号,
              recipeId: recipe.id,
              selectedInnateTreasures: treasures,
              customAuthorities,
              playerContext: playerForgeContext(player, progression, treasures, customAuthorities),
              treasureName: selections.treasureName
                || `${player.名号 || '无名修士'}·${recipe.name}·${operation.slice(0, 6)}`,
              operationId: domainOperationId,
            });
            if (!replayed) {
              const innateState = readInnateTreasureState({ strict: true });
              const consumed = applyForgeConsumption(
                player,
                najie,
                equipment,
                innateState,
                started,
                treasures,
              );
              innateRollback = captureInnateTreasureRecords(
                innateState,
                consumed.consumedNames,
                userId,
              );
              if (consumed.najieChanged && !await Write_najie(userId, najie)) {
                throw new Error('纳戒处于时间线封锁状态，本次大道开炉已取消');
              }
              await Write_player(userId, player);
              consumeInnateTreasureRecords(
                userId,
                treasures.map(entry => entry.name),
                consumed.consumedNames,
              );
              innateRecordsConsumed = consumed.consumedNames.length > 0;
              if (consumed.equipmentChanged) await Write_equipment(userId, equipment);
            }
            const hours = Math.ceil((started.readyAt - Date.now()) / 3600000);
            const message = replayed
              ? `大道炉已保持原有进度，${started.recipeName}仍在炼制。`
              : `【大道开炉·${started.recipeName}】材料已封入炉心，预计${Math.max(0, hours)}小时后成器。`;
            return { message, started, replayed };
          },
        );
        transaction.commit();
        return updated.value;
      } catch (error) {
        try {
          transaction.rollback();
        } finally {
          if (innateRecordsConsumed) restoreInnateTreasureRecords(innateRollback);
        }
        throw error;
      }
    });
  }

  async claimDaoTreasureForge(userId, forgeId = '', operationId = '', expectedRunId = '') {
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
      const world = await this.world();
      const forgeView = serializeOtherShoreDaoTreasureForge(world, { playerId: userId });
      const target = String(forgeId || forgeView.forge?.forgeId || '');
      if (!target) throw new Error('当前没有大道至宝炼制记录');
      const mutationKey = playerMutationKey(userId, session.runId, 'dao_forge_claim', target);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) return { message: recoveredCurrent.message, replayed: true, recovered: true };

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          const claimed = claimOtherShoreDaoTreasureForge(document, {
            playerId: userId,
            forgeId: target,
            operationId: `forge:${session.runId}:${operation}:claim`,
          });
          const item = createOtherShoreDaoTreasureItem(claimed.treasure, userId);
          player.彼岸大道铸炉记录 = {
            ...(player.彼岸大道铸炉记录 || {}),
            forgeId: target,
            recipeId: item.recipeId,
            status: 'claimed',
            claimedAt: claimed.claimedAt,
            treasureName: item.name,
          };
          player.彼岸大道至宝记录 ||= {};
          const alreadyDelivered = player.彼岸大道至宝记录[target]?.delivered === true;
          if (!alreadyDelivered) {
            player.彼岸大道至宝记录[target] = {
              name: item.name,
              recipeId: item.recipeId,
              sourceForgeId: item.sourceForgeId,
              authorities: item.大道权柄,
              claimedAt: claimed.claimedAt,
              delivered: true,
            };
          }
          const message = alreadyDelivered
            ? `大道至宝【${item.name}】已在纳戒中，本次仅同步铸炉状态。`
            : claimed.duplicate
              ? `大道至宝【${item.name}】此前已经出炉，本次补齐纳戒回执。`
              : `【大道至宝出炉·${item.name}】权柄：${item.大道权柄.join('、')}。`;
          stagePlayerMutation(document, player, session, {
            userId,
            action: 'dao_forge_claim',
            targetId: target,
            operationId: operation,
            message,
            mutationKey,
            fields: DAO_FORGE_REWARD_MUTATION_FIELDS,
            ...(!alreadyDelivered ? {
              inventoryBag: {
                items: [{ ...item, class: '装备', kind: 'equipment', quantity: 1 }],
              },
              inventoryClaimId: `dao-forge:${target}`,
            } : {}),
          });
          return { message, claimed, item };
        },
      );
      await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
  }

  async setTrueWorldLayer(userId, entering, expectedRunId = '') {
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      const session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const world = await this.world();
      if (entering) assertTrueWorldExclusive(world, userId);
      const progression = buildOtherShoreProgression(world, player, userId, entering ? 'true_world' : 'canglan');
      if (entering && !progression.prerequisites.trueWorldUnlocked) {
        throw new Error('真世界尚未开放：请先完成沧澜关键战役并锚定裂界母锚');
      }
      ensureOtherShoreTrueWorldState(world, { seed: `${WORLD_SEED}:true-world` });
      const viewer = world.trueWorld.players?.[String(userId)];
      if (entering) {
        session.layer = 'true_world';
        session.trueWorldPositionId = String(
          viewer?.coordinate || player.彼岸真世界记录?.positionId || session.trueWorldPositionId || '0,0',
        );
        session.trueWorldMindRemainder = Math.max(0, Math.trunc(Number(
          viewer?.mindRemainder ?? player.彼岸真世界记录?.mindRemainder,
        ) || 0));
        persistTrueWorldPosition(player, session, viewer);
        await Write_player(userId, player);
        return { message: `【真世界】远征坐标已接驳至 ${session.trueWorldPositionId}，全服开图回路开启。` };
      }
      session.layer = 'canglan';
      persistTrueWorldPosition(player, session, viewer);
      await Write_player(userId, player);
      return { message: '【彼岸回航】已返回沧澜界，真世界坐标与心神余程已保存。' };
    });
  }

  async performTrueWorldAction(userId, action, targetId = '', operationId = '', expectedRunId = '') {
    const allowed = new Set([
      'true_world_observe',
      'true_world_move',
      'true_world_explore',
      'true_world_encounter',
      'true_world_encounter_start',
      'true_world_battle',
      'true_world_claim',
    ]);
    if (!allowed.has(action)) throw new Error('未知的真世界动作');
    if (action === 'true_world_claim') {
      return this.claimTrueWorldLoot(userId, targetId, operationId, expectedRunId);
    }
    if (action === 'true_world_encounter' || action === 'true_world_battle') {
      return this.performTrueWorldBattle(userId, action, targetId, operationId, expectedRunId);
    }

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
      if (session.layer !== 'true_world') {
        throw new Error('当前仍在沧澜界，请先切换至真世界再执行该动作');
      }
      const fallbackTarget = String(session.trueWorldPositionId || '0,0');
      const rawTarget = String(targetId || '').trim();
      const target = rawTarget ? parseCoordinate(rawTarget) : fallbackTarget;
      if (rawTarget && !target) throw new Error('真世界坐标格式应为 q,r');
      const mutationKey = playerMutationKey(userId, session.runId, action, target);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) return { message: recoveredCurrent.message, replayed: true, recovered: true };
      const receipt = findActionReceipt(session, operation, action, target);
      if (receipt) return { message: receipt.message, replayed: true };

      await this.syncThreatSignals(userId, player);
      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          assertTrueWorldExclusive(document, userId);
          const progression = buildOtherShoreProgression(document, player, userId, 'true_world');
          if (!progression.prerequisites.trueWorldUnlocked) {
            throw new Error('真世界尚未开放：请先完成沧澜关键战役并锚定裂界母锚');
          }
          const viewer = syncTrueWorldViewer(document, userId, player.名号, session);
          let result;
          let message;
          if (action === 'true_world_observe') {
            const distance = getOtherShoreHexDistance(viewer.coordinate, target);
            if (distance > 3) throw new Error('真世界观测范围最多覆盖当前坐标三格');
            result = observeOtherShoreTrueWorld(document, {
              playerId: userId,
              playerName: player.名号,
              coordinate: target,
              range: 1,
              operationId: `tw:${session.runId}:${operation}:observe`,
            });
            message = `【真世界·观测】${result.revealed.length}个扇区的文明回声已并入全服星图。`;
          } else if (action === 'true_world_move') {
            if (target === viewer.coordinate) throw new Error('你已经身处目标真世界扇区');
            if (currentExpeditionRun(document, userId)) {
              throw new Error('区域远征仍在进行，请先完成撤离再横渡真世界');
            }
            if (pendingExpeditionSettlement(document, userId)) {
              throw new Error('远征战果尚未结算，请先领取后再横渡真世界');
            }
            const path = trueWorldStraightPath(viewer.coordinate, target);
            result = moveOtherShoreTrueWorld(document, {
              playerId: userId,
              playerName: player.名号,
              from: viewer.coordinate,
              to: target,
              path,
              realm: player,
              mindAvailable: player.心神,
              mindRemainder: session.trueWorldMindRemainder,
              operationId: `tw:${session.runId}:${operation}:move`,
            });
            const heart = consumeSpiritHeart(player, result.mindCost);
            if (!heart.ok) throw new Error(`心神不足：需要${result.mindCost}点，当前${heart.current}/${heart.max}`);
            session.trueWorldPositionId = result.to;
            session.trueWorldMindRemainder = result.mindRemainder;
            player.彼岸心神余程 = result.mindRemainder;
            player.彼岸心神余程境界 = result.travelTier;
            message = `【真世界·横渡】抵达${result.to}，${result.totalSteps}格中${result.unanchoredSteps}格未探明，消耗心神${result.mindCost}点。`;
          } else if (action === 'true_world_explore') {
            if (target !== viewer.coordinate) throw new Error('需先抵达目标真世界扇区');
            result = exploreOtherShoreTrueWorld(document, {
              playerId: userId,
              playerName: player.名号,
              coordinate: target,
              amount: 25,
              operationId: `tw:${session.runId}:${operation}:explore`,
            });
            message = `【真世界·探索】${result.sector.name || result.sector.id}贡献+${result.granted}，本扇区进度${result.sector.progress}/${result.sector.progressRequired}${result.newlyExplored ? '，已完成全服探明' : ''}。`;
          } else if (action === 'true_world_encounter_start') {
            if (target !== viewer.coordinate) throw new Error('需先抵达目标真世界扇区');
            result = startOtherShoreTrueWorldEncounter(document, {
              playerId: userId,
              playerName: player.名号,
              coordinate: target,
              realm: player,
              operationId: `tw:${session.runId}:${operation}:encounter`,
            });
            message = `【真世界·敌群显化】${result.encounter.name}已在${target}苏醒，发送网页迎战或 #迎战真世界敌群。`;
          } else {
            throw new Error('未知的真世界探索动作');
          }
          persistTrueWorldPosition(player, session, viewer);
          stagePlayerMutation(document, player, session, {
            userId,
            action,
            targetId: target,
            operationId: operation,
            message,
            mutationKey,
            fields: TRUE_WORLD_SESSION_FIELDS,
          });
          return { message, result };
        },
      );
      await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
  }

  async performTrueWorldBattle(userId, action, targetId = '', operationId = '', expectedRunId = '') {
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
      if (session.layer !== 'true_world') {
        throw new Error('当前仍在沧澜界，请先切换至真世界再迎战敌群');
      }
      const rawTarget = String(targetId || '').trim();
      const target = rawTarget ? parseCoordinate(rawTarget) : String(session.trueWorldPositionId || '0,0');
      if (rawTarget && !target) throw new Error('真世界坐标格式应为 q,r');
      const mutationKey = playerMutationKey(userId, session.runId, action, target);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) return { message: recoveredCurrent.message, replayed: true, recovered: true };
      const receipt = findActionReceipt(session, operation, action, target);
      if (receipt) return { message: receipt.message, replayed: true };
      if (Number(player.当前血量) <= 0) throw new Error('你当前气血枯竭，暂时无法迎战真世界敌群');

      let world = await this.syncThreatSignals(userId, player);
      const started = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          assertTrueWorldExclusive(document, userId);
          const progression = buildOtherShoreProgression(document, player, userId, 'true_world');
          if (!progression.prerequisites.trueWorldUnlocked) {
            throw new Error('真世界尚未开放：请先完成沧澜关键战役并锚定裂界母锚');
          }
          const viewer = syncTrueWorldViewer(document, userId, player.名号, session);
          if (viewer.coordinate !== target) throw new Error('需先抵达目标真世界扇区');
          return startOtherShoreTrueWorldEncounter(document, {
            playerId: userId,
            playerName: player.名号,
            coordinate: target,
            realm: player,
            operationId: `tw:${session.runId}:${operation}:encounter`,
          });
        },
      );
      let encounter = started.value?.encounter;
      if (!encounter || encounter.status === 'defeated') {
        const message = '当前扇区敌群已经被全服修士清除，新的敌群会在后续波次显化。';
        return { message, replayed: true };
      }

      const leased = await withThreatBattleLease(`true-world:${encounter.encounterId}`, userId, async () => {
        world = await this.world();
        const sector = getOtherShoreTrueWorldSector(world, target);
        encounter = sector.encounter;
        if (!encounter || encounter.status !== 'active') {
          return { message: '该真世界敌群已被其他修士清除，本次仅同步全服战果。' };
        }
        const now = Date.now();
        const cooldownKey = `xiuxian:other-shore:true-world:cooldown:${encounter.encounterId}:${userId}`;
        const cooldownUntil = Number(await globalThis.redis.get(cooldownKey)) || 0;
        if (cooldownUntil > now) {
          throw new Error(`真世界战斗尚在调息，还需${Math.ceil((cooldownUntil - now) / 60000)}分钟`);
        }
        const cooldownValue = String(now + TRUE_WORLD_BATTLE_COOLDOWN_MS);
        const reserved = await globalThis.redis.set(
          cooldownKey,
          cooldownValue,
          { NX: true, EX: Math.ceil(TRUE_WORLD_BATTLE_COOLDOWN_MS / 1000) },
        );
        if (!reserved) throw new Error('真世界战斗尚在调息，请稍后再试');
        let releaseCooldown = true;
        try {
          const combatant = createOtherShoreBattlePlayer(player, userId);
          const enemy = createTrueWorldEnemy(player, userId, target, encounter, now);
          const battle = await zd_battle(combatant, enemy, {
            battleType: 'other_shore_true_world',
            preserveHpOnTimeout: true,
          });
          player = await Read_player(userId);
          session = currentSession(player);
          if (!session || (expectedRunId && session.runId !== expectedRunId)) {
            throw new Error('战斗结束时彼岸远征会话已经更替');
          }
          syncOtherShoreBattleHp(player, combatant, battle);

          const settled = await updateOtherShoreWorldState(
            globalThis.redis,
            createCanglanWorld,
            document => {
              maintainOtherShoreThreat(document);
              const progression = buildOtherShoreProgression(document, player, userId, 'true_world');
              if (!progression.prerequisites.trueWorldUnlocked) throw new Error('真世界入口已经关闭');
              const viewer = syncTrueWorldViewer(document, userId, player.名号, session);
              if (viewer.coordinate !== target) throw new Error('战斗结束时修士已离开目标扇区');
              const playerRemaining = Number(battle?.A_hp ?? battle?.playerHp);
              const enemyRemaining = Number(battle?.B_hp ?? battle?.enemyHp ?? battle?.bossHp);
              const battleWon = Number.isFinite(playerRemaining) && Number.isFinite(enemyRemaining)
                ? playerRemaining > 0 && enemyRemaining <= 0
                : battle?.winner === 'A';
              const result = applyOtherShoreTrueWorldBattle(document, {
                playerId: userId,
                playerName: player.名号,
                coordinate: target,
                encounterId: encounter.encounterId,
                battle,
                won: battleWon,
                operationId: `tw:${session.runId}:${operation}:battle`,
              });
              let message;
              if (result.alreadyDefeated) {
                message = '该敌群已被其他修士清除，本次仅同步战场结果。';
              } else if (result.defeated) {
                message = `【真世界·${result.tier}敌群伏诛】有效伤害${bigNumberTransform(result.damage)}，战果已生成待领取单${result.rewards?.length ? '，发送 #领取真世界战果 收取' : ''}。`;
              } else {
                message = battleWon
                  ? `【真世界·持续交锋】有效伤害${bigNumberTransform(result.damage)}，敌群余血${bigNumberTransform(result.currentHp)}/${bigNumberTransform(result.maxHp)}。`
                  : `【真世界·交锋失利】敌群余血${bigNumberTransform(result.currentHp)}/${bigNumberTransform(result.maxHp)}，你的气血降至${bigNumberTransform(player.当前血量)}。`;
              }
              persistTrueWorldPosition(player, session, viewer);
              stagePlayerMutation(document, player, session, {
                userId,
                action,
                targetId: target,
                operationId: operation,
                message,
                mutationKey,
                fields: TRUE_WORLD_BATTLE_MUTATION_FIELDS,
              });
              return { message, battle, result };
            },
          );
          await deliverPlayerMutation(userId, player, mutationKey);
          releaseCooldown = false;
          return settled.value;
        } finally {
          if (releaseCooldown && await globalThis.redis.get(cooldownKey) === cooldownValue) {
            await globalThis.redis.del(cooldownKey);
          }
        }
      });
      if (leased.busy) return { message: '这处真世界战场正在结算另一场交锋，请稍候。' };
      return leased;
    });
  }

  async claimTrueWorldLoot(userId, targetId = '', operationId = '', expectedRunId = '') {
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
      const world = await this.world();
      const viewer = serializeOtherShoreTrueWorld(world, {
        viewerId: userId,
        center: session.trueWorldPositionId || '0,0',
        radius: 0,
      }).viewer;
      const claimId = String(
        targetId && viewer?.pendingClaims?.some(claim => claim.claimId === targetId)
          ? targetId
          : viewer?.pendingClaims?.[0]?.claimId || '',
      );
      if (!claimId) throw new Error('当前没有待领取的真世界战果');
      const mutationKey = playerMutationKey(userId, session.runId, 'true_world_claim', claimId);
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) return { message: recoveredCurrent.message, replayed: true, recovered: true };
      const receipt = findActionReceipt(session, operation, 'true_world_claim', claimId);
      if (receipt) return { message: receipt.message, replayed: true };

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        document => {
          maintainOtherShoreThreat(document);
          const claimed = claimOtherShoreTrueWorldLoot(document, {
            playerId: userId,
            claimId,
            operationId: `tw:${session.runId}:${operation}:claim`,
          });
          const applied = applyTrueWorldClaimToPlayer(player, claimed);
          const items = (claimed.items || []).map(item => `${item.name || item.id}×${item.quantity || 1}`).join('、') || '无实物战果';
          const message = claimed.duplicate
            ? '本份真世界战果此前已经入账，本次仅补齐纳戒回执。'
            : `【真世界战果·${claimed.reward?.tier || '未知层级'}】${items}；纪元积累+${claimed.eraAccumulation || 0}，准仙帝本源+${claimed.reward?.quasiImmortalEmperorSources || 0}${applied.recipeUnlock ? `；领悟${applied.recipeUnlock.name}` : ''}。`;
          const syncedViewer = document.trueWorld?.players?.[String(userId)];
          persistTrueWorldPosition(player, session, syncedViewer);
          stagePlayerMutation(document, player, session, {
            userId,
            action: 'true_world_claim',
            targetId: claimId,
            operationId: operation,
            message,
            mutationKey,
            fields: TRUE_WORLD_REWARD_MUTATION_FIELDS,
            inventoryBag: applied.bag,
            inventoryClaimId: claimId,
          });
          return { message, claimed };
        },
      );
      await deliverPlayerMutation(userId, player, mutationKey);
      return updated.value;
    });
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
            const campaign = OTHER_SHORE_CAMPAIGNS[targetId];
            if (!campaign) throw new Error('当前大星尚未显化区域战役');
            if (session.positionId !== targetId) throw new Error(`需先抵达战役大星 ${targetId}`);
            if (!['anchored', 'cleared'].includes(world.states?.[targetId]?.phase)) {
              throw new Error('需先完成全服探索并建立稳定星锚，才能开启区域战役');
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
            const openingStage = campaign.stages[0]?.name || '建立区域落点';
            message = started.run.mode === 'recovery'
              ? `【${started.run.playerName}·行囊追回】遗失因果已重新锁定，请在30分钟消散前取回关键物。`
              : `【${started.run.playerName}·${campaign.name}】区域落点已建立，第一阶段：${openingStage}。`;
          } else if (action === 'camp_build') {
            if (session.positionId !== targetId) throw new Error('需在当前大星亲自建设前线营地');
            if (currentExpeditionRun(world, userId)?.status === 'downed') {
              throw new Error('道躯正处于濒危状态，需先获救或强制撤离');
            }
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
              const expedition = serializeOtherShoreExpedition(world, {
                starId: run.starId,
                viewerId: userId,
              });
              const stage = expedition.viewer.run?.currentStage;
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
                ? `【${stage.name}】${expedition.campaign.name}首通完成，可封存战利品并撤离。`
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
            const campaign = OTHER_SHORE_CAMPAIGNS[latest.starId];
            const bossName = campaign?.boss?.name || '区域首领';
            let message;
            if (stage.kind === 'boss') {
              if (latest.status === 'ready_to_evac') {
                message = `${bossName}已在交锋期间被全服镇压，本次仅同步剩余气血。`;
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
                    reason: `${bossName}重创道躯`,
                    operationId: `${operation}:downed`,
                  });
                }
                message = result.defeated
                  ? `【${bossName}伏诛】造成${bigNumberTransform(result.damage)}点有效伤害，${campaign?.name || '当前战役'}大星已彻查，全服待战修士均已完成首通。`
                  : `【共享首领交锋】有效伤害${bigNumberTransform(result.damage)}，${bossName}气血${bigNumberTransform(result.currentHp)}/${bigNumberTransform(result.maxHp)}${battle.winner === 'A' ? '' : '；你的道躯已进入濒危状态'}。`;
              }
            } else if (battle.winner === 'A') {
              const result = advanceOtherShoreExpedition(document, {
                playerId: userId,
                runId: latest.runId,
                stageId,
                loot: EXPEDITION_STAGE_LOOT[stageId] || [],
                operationId: operation,
              });
              message = result.completed
                ? `【${result.clearedStage.name}·清剿完成】${campaign?.name || '当前战役'}首通完成，可封存战利品并撤离。`
                : `【${result.clearedStage.name}·清剿完成】区域强敌已经伏诛，下一阶段：${result.nextStage?.name || bossName}。`;
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
      if (leased.busy) return { message: '区域战场正在结算另一场交锋，请稍候。' };
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
      if (action === 'refine') {
        const avatarName = getActiveZhutianAvatarName(player);
        if (avatarName) {
          throw new Error(`当前正装载化身【${avatarName}】，请先发送 #装载化身 本源，再炼化彼岸魔主。`);
        }
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

  async showOtherShoreProgression(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const world = await this.world();
      const progression = buildOtherShoreProgression(world, result.player, result.userId);
      const lines = [
        '【彼岸世界·层级航路】',
        ...progression.layers.map(layer => `${layer.unlocked ? '●' : '○'} ${layer.name}｜${layer.enemyRange}`),
        `当前层级：${progression.layers.find(layer => layer.id === progression.currentLayer)?.name || '沧澜界'}`,
        '真世界：需完成沧澜关键战役首通并锚定裂界母锚。',
        '乾坤界：需真世界入口、仙帝维度力量与维度破壁。',
        `稳定材料：${progression.materials.map(material => `${material.name}${material.baseQuantity}`).join('、')}`,
        '发送 #彼岸铸宝 查看四种大道至宝炼制法，或发送 #彼岸铸宝 1-4 查看具体缺口。',
      ];
      await e.reply(lines.join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async previewOtherShoreForge(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const world = await this.world();
      const progression = buildOtherShoreProgression(world, result.player, result.userId);
      const recipeText = String(e.msg || '').match(/^#彼岸铸宝(?:\s+(.+))?$/)?.[1]?.trim() || '';
      if (!recipeText) {
        await e.reply([
          '【大道至宝·彼岸炼器法】',
          ...OTHER_SHORE_DAO_TREASURE_RECIPES.map(recipe => `${recipe.index}. ${recipe.name}｜${recipe.description}`),
          '发送 #彼岸铸宝 1-4 查看缺口；条件齐备后发送 #大道开炉 1-4 正式炼制。',
        ].join('\n'));
        return true;
      }
      const preview = previewOtherShoreDaoTreasureForge(recipeText, {
        ...result.player,
        currentLayer: progression.currentLayer,
        materials: result.player.彼岸炼器材料 || result.player.彼岸大道至宝材料 || {},
        innateTreasures: ownedInnateTreasures(result.userId),
        knownRecipes: result.player.彼岸大道至宝炼制法 || result.player.大道至宝炼制法 || [],
        daoFruit: Boolean(result.player.道果 || result.player.自身道果),
        returnTruthPower: Boolean(result.player.还真之力 || result.player.如梦道祖还真之力),
        quasiImmortalEmperorSources: result.player.准仙帝本源 || 0,
        customAuthorities: result.player.自定义强化权柄 || [],
        trueWorldUnlocked: progression.prerequisites.trueWorldUnlocked,
        riftMotherAnchor: progression.prerequisites.riftMotherAnchor,
        canglanCampaignClears: progression.prerequisites.canglanCampaignClears,
        trueWorldExplorationComplete: progression.prerequisites.trueWorldExplorationComplete,
      });
      const lines = [
        `【大道至宝预览·${preview.recipe?.name || recipeText}】`,
        preview.ok ? '状态：铸造预检通过，可发送 #大道开炉 正式封材。' : '状态：尚有条件未满足。',
        `基础材料：${Object.entries(preview.requiredMaterials || {}).map(([id, amount]) => `${id}×${amount}`).join('、')}`,
      ];
      if (preview.missing.length) lines.push(`缺口：${preview.missing.map(item => `${item.label}（${item.available}/${item.required}）`).join('、')}`);
      if (preview.errors.length) lines.push(`提示：${preview.errors.join('、')}`);
      lines.push(`权柄模式：${preview.output?.authorityMode || '待定'}｜保留先天至宝：${preview.preserved?.innateTreasures || 0}`);
      await e.reply(lines.join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async showAncientEvents(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const state = await this.getWebState({ userId: result.userId });
      const ancient = state.ancientEvents;
      const forge = state.daoForge?.forge;
      const lines = [
        `【彼岸古文明·${ancient.completedCount}/${ancient.eventCount}】`,
        ...ancient.events.map(event => {
          const mark = event.status === 'completed' ? '已复原' : event.status === 'active' ? '进行中' : '前置锁定';
          const location = event.viewer.atCoordinate ? '已抵达' : `坐标${event.coordinate}`;
          return `${event.order}. ${event.name}｜${mark} ${event.progress}/${event.contributionRequired}｜${location}`;
        }),
      ];
      const active = ancient.events.find(event => event.id === ancient.activeEventId);
      if (active) lines.push(`当前敌对：${active.opposition.join('、')}`);
      if (ancient.viewer.canClaim) lines.push('已有个人战果可领取：#领取古文明战果');
      if (forge) {
        lines.push(`大道炉：${forge.recipeName}｜${forge.status}${forge.canClaim ? '｜可发送 #大道出炉' : ''}`);
      }
      await e.reply(lines.join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async contributeAncientEvent(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const state = await this.getWebState({ userId: result.userId });
      const token = String(e.msg || '').match(/^#推进古文明事件(?:\s+(\S+))?$/)?.[1] || '';
      const matched = state.ancientEvents.events.find(entry => (
        entry.id === token || entry.name === token || String(entry.order) === token
      ));
      const event = matched || (!token
        ? state.ancientEvents.events.find(entry => entry.id === state.ancientEvents.activeEventId)
        : null);
      if (token && !matched) throw new Error(`彼岸古文明事件【${token}】不存在`);
      if (!event) throw new Error('当前没有可推进的彼岸古文明章节');
      const outcome = await this.performAncientEventAction(
        result.userId,
        'ancient_event_contribute',
        event.id,
        '',
        currentSession(result.player).runId,
      );
      await e.reply(outcome.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async claimAncientEventReward(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const state = await this.getWebState({ userId: result.userId });
      const token = String(e.msg || '').match(/^#领取古文明战果(?:\s+(\S+))?$/)?.[1] || '';
      const matched = state.ancientEvents.events.find(entry => (
        entry.id === token || entry.name === token || String(entry.order) === token
      ));
      const event = matched || (!token
        ? state.ancientEvents.events.find(entry => entry.viewer.canClaim)
        : null);
      if (token && !matched) throw new Error(`彼岸古文明事件【${token}】不存在`);
      if (!event) throw new Error('当前没有可领取的古文明战果');
      const outcome = await this.performAncientEventAction(
        result.userId,
        'ancient_event_claim',
        event.id,
        '',
        currentSession(result.player).runId,
      );
      await e.reply(outcome.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async startDaoForge(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const match = String(e.msg || '').match(/^#大道开炉\s+(\S+)(?:\s+(.+))?$/);
      const recipe = getOtherShoreDaoTreasureRecipe(match?.[1]);
      if (!recipe) throw new Error('大道开炉格式：#大道开炉 1-4 [至宝或三项权柄，以逗号分隔]');
      const entries = String(match?.[2] || '')
        .split(/[、,，]/)
        .map(value => value.trim())
        .filter(Boolean);
      const requiredEntries = recipe.id === 'return-truth-edit'
        ? 3
        : Math.max(0, Number(recipe.requirements?.innateTreasures) || 0);
      if (requiredEntries && (entries.length !== requiredEntries || new Set(entries).size !== requiredEntries)) {
        const kind = recipe.id === 'return-truth-edit' ? '项不同的强化权柄' : '件不同的先天至宝';
        throw new Error(`请在开炉指令中显式列出${requiredEntries}${kind}`);
      }
      const selections = recipe.id === 'return-truth-edit'
        ? { customAuthorities: entries }
        : { treasureNames: entries };
      const outcome = await this.startDaoTreasureForge(
        result.userId,
        recipe.id,
        selections,
        '',
        currentSession(result.player).runId,
      );
      await e.reply(outcome.message);
    } catch (error) {
      const missing = error.details?.missing?.map(item => item.label).filter(Boolean);
      await e.reply(missing?.length ? `${error.message}：${missing.join('、')}` : error.message);
    }
    return true;
  }

  async claimDaoForge(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const outcome = await this.claimDaoTreasureForge(
        result.userId,
        '',
        '',
        currentSession(result.player).runId,
      );
      await e.reply(outcome.message);
    } catch (error) {
      if (error.code === 'forge-not-ready' && error.details?.remainingMs) {
        await e.reply(`大道炉仍在炼制，还需约${Math.ceil(error.details.remainingMs / 3600000)}小时。`);
      } else {
        await e.reply(error.message);
      }
    }
    return true;
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

  async replyExpeditionAction(e, action, targetId = '') {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const session = currentSession(result.player);
      let target = String(targetId || session.positionId);
      if (action === 'expedition_rescue' || action === 'lost_cache_recover') {
        const state = await this.getWebState({ userId: result.userId, runId: session.runId });
        target = action === 'expedition_rescue'
          ? String(targetId || state.expedition.rescueTargets[0]?.userId || '')
          : String(targetId || state.expedition.lostCaches[0]?.cacheId || '');
      }
      const outcome = await this.performExpeditionAction(
        result.userId,
        action,
        target,
        '',
        session.runId,
      );
      const logs = Array.isArray(outcome.battle?.msg)
        ? outcome.battle.msg.filter(Boolean).slice(-8)
        : [];
      await e.reply([...logs, logs.length ? '' : null, outcome.message].filter(Boolean).join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async startExpedition(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    return this.replyExpeditionAction(e, 'expedition_enter', currentSession(result.player).positionId);
  }

  async buildExpeditionCamp(e) {
    return this.replyExpeditionAction(e, 'camp_build');
  }

  async advanceExpeditionCampaign(e) {
    return this.replyExpeditionAction(e, 'campaign_advance');
  }

  async showExpedition(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const state = await this.getWebState({ userId: result.userId });
      const expedition = state.expedition;
      const camp = expedition.camp;
      const bag = expedition.tacticalBag;
      const lines = [
        `【彼岸区域战役·${expedition.campaign.title}】`,
        expedition.active
          ? `阶段：${expedition.stage.number}/${expedition.stage.total} ${expedition.stage.name}｜状态：${expedition.status}`
          : expedition.evacuation.ready
            ? '远征已经撤离，战果正在等待领取。'
            : expedition.campaign.unlocked === false
              ? expedition.campaign.lockedReason
              : '当前没有进行中的个人远征。',
        `前线营地：L${camp.level}/${camp.maxLevel}｜建设${camp.buildPoints}/60｜压力${camp.stress}｜防备${camp.defenseReserve}/${camp.resilience}`,
        `临时行囊：随身${bag.used}份｜营地封存${bag.secured}份｜仓储上限${bag.capacity}份`,
        '彼岸营地只承担封存、撤离与救援，不恢复气血。',
      ];
      const chain = expedition.campaign.chain || [];
      if (chain.length) {
        lines.push(`沧澜主线：${chain.map(item => `${item.viewerCleared ? '已通' : item.unlocked ? '可战' : '锁定'}·${item.name}`).join(' → ')}`);
      }
      if (bag.items.length) lines.push(`随身物资：${bag.items.map(item => `${item.name}×${item.quantity}`).join('、')}`);
      if (expedition.downed.active) lines.push('道躯状态：濒危，等待同星救援或发送 #彼岸强撤。');
      if (expedition.rescueTargets.length) {
        lines.push(`同星求援：${expedition.rescueTargets.map(item => `${item.name}(${item.userId})`).join('、')}`);
      }
      if (expedition.lostCaches.length) lines.push('遗失行囊仍在30分钟回收窗口内，可发送 #追回彼岸行囊。');
      if (expedition.viewer.canClaim) lines.push('发送 #领取彼岸远征战果 完成纳戒结算。');
      await e.reply(lines.join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async depositExpeditionBag(e) {
    return this.replyExpeditionAction(e, 'bag_deposit');
  }

  async rescueExpeditionPlayer(e) {
    const targetId = String(e.msg || '').match(/^#救援彼岸修士\s+(\S+)/)?.[1] || '';
    return this.replyExpeditionAction(e, 'expedition_rescue', targetId);
  }

  async evacuateExpedition(e) {
    return this.replyExpeditionAction(e, 'evacuation_start');
  }

  async forceEvacuateExpedition(e) {
    return this.replyExpeditionAction(e, 'evacuation_force');
  }

  async claimExpeditionReward(e) {
    return this.replyExpeditionAction(e, 'expedition_claim');
  }

  async recoverExpeditionBag(e) {
    return this.replyExpeditionAction(e, 'lost_cache_recover');
  }

  async enterTrueWorld(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const outcome = await this.setTrueWorldLayer(result.userId, true, currentSession(result.player).runId);
      await e.reply(outcome.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async leaveTrueWorld(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const outcome = await this.setTrueWorldLayer(result.userId, false, currentSession(result.player).runId);
      await e.reply(outcome.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async showTrueWorld(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const state = await this.getWebState({ userId: result.userId });
      const trueWorld = state.trueWorld;
      const progression = state.progression;
      if (!trueWorld.unlocked) {
        await e.reply('【真世界】入口尚未开放：请先完成沧澜关键战役并锚定裂界母锚。');
        return true;
      }
      const current = trueWorld.currentSector || trueWorld.viewer?.currentSector;
      const enemy = trueWorld.enemy || current?.encounter;
      const pending = trueWorld.viewer?.pendingClaims?.length || 0;
      await e.reply([
        '【彼岸世界·真世界全服远征】',
        `当前坐标：${trueWorld.currentSectorId}｜半径${trueWorld.radius}｜扇区${trueWorld.sectorCount}`,
        `全服开图：观测${trueWorld.global.observedCount}｜探明${trueWorld.global.exploredCount}/${progression.prerequisites.trueWorldExplorationComplete ? '全图完成' : trueWorld.sectorCount}`,
        `纪元积累：${trueWorld.global.eraAccumulation}｜准仙帝敌群伏诛：${trueWorld.global.quasiImmortalEmperorDefeated}`,
        `个人战果：纪元${trueWorld.viewer?.eraAccumulation || 0}｜准仙帝本源${trueWorld.viewer?.quasiImmortalEmperorSources || 0}｜待领${pending}`,
        enemy?.status === 'active'
          ? `当前敌群：${enemy.name}｜${bigNumberTransform(enemy.currentHp)}/${bigNumberTransform(enemy.maxHp)}`
          : `当前扇区：${current?.name || trueWorld.currentSectorId}｜${current?.status || 'unseen'}`,
        '动作：#观测真世界 q,r｜#前往真世界 q,r｜#探索真世界｜#迎战真世界敌群｜#领取真世界战果｜#返回沧澜界',
      ].join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async replyTrueWorldAction(e, action, targetId = '') {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const session = currentSession(result.player);
      let target = String(targetId || session.trueWorldPositionId || '0,0');
      if (action === 'true_world_claim') {
        target = String(targetId || '');
      }
      const outcome = await this.performTrueWorldAction(
        result.userId,
        action,
        target,
        '',
        session.runId,
      );
      const logs = Array.isArray(outcome.battle?.msg)
        ? outcome.battle.msg.filter(Boolean).slice(-8)
        : [];
      await e.reply([...logs, logs.length ? '' : null, outcome.message].filter(Boolean).join('\n'));
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async observeTrueWorld(e) {
    const target = parseCoordinate(e.msg);
    return this.replyTrueWorldAction(e, 'true_world_observe', target || '');
  }

  async moveTrueWorld(e) {
    const target = parseCoordinate(e.msg);
    if (!target) {
      await e.reply('真世界坐标格式应为 q,r');
      return true;
    }
    return this.replyTrueWorldAction(e, 'true_world_move', target);
  }

  async exploreTrueWorld(e) {
    return this.replyTrueWorldAction(e, 'true_world_explore');
  }

  async challengeTrueWorld(e) {
    return this.replyTrueWorldAction(e, 'true_world_encounter');
  }

  async claimTrueWorldReward(e) {
    const claimId = String(e.msg || '').match(/^#领取真世界战果(?:\s+(\S+))?$/)?.[1] || '';
    return this.replyTrueWorldAction(e, 'true_world_claim', claimId);
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
      await e.reply(message);
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

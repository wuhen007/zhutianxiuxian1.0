import { createStoryTheater } from './story.js?v=20260930-story';
import { createPlanetPainter, planetMaterial } from './planets.js?v=20260930-planets';

(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const canvas = $('#star-map');
  const context = canvas.getContext('2d', { alpha: false });
  const planetPainter = createPlanetPainter();
  const portrait = $('#planet-portrait');
  let portraitKey = '';
  const app = $('#app');
  const gate = $('#gate');
  const intelPanel = $('#intel-panel');
  const jumpFlash = $('#jump-flash');
  const params = new URLSearchParams(location.search);
  const isPreview = params.get('preview') === '1';
  let ticket = params.get('ticket') || '';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const HEX_RADIUS = 50;
  const MAP_RADIUS = 4;
  const TRUE_WORLD_RADIUS = 48;
  const TRUE_WORLD_SECTOR_COUNT = 1 + 3 * TRUE_WORLD_RADIUS * (TRUE_WORLD_RADIUS + 1);
  const SQRT3 = Math.sqrt(3);
  const STATUS_ORDER = { unseen: 0, observed: 1, explored: 2, anchored: 3 };
  const STATUS_LABELS = { unseen: '未探明星域', observed: '已捕获星辉', explored: '已探明大星', anchored: '稳定星锚' };
  const THREAT_PHASE_LABELS = {
    calamity: '灾厄爆发',
    overlord: '魔主降临',
    decision: '魔主待决',
    purge: '清剿推进',
    resolved: '战事平定',
  };
  const THREAT_ACTIONS = new Set(['challenge', 'execute', 'refine', 'defend', 'claim']);
  const EXPEDITION_ACTIONS = new Set([
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
  const TRUE_WORLD_ACTIONS = new Set([
    'true_world_observe',
    'true_world_move',
    'true_world_encounter',
    'true_world_claim',
    // Domain-level names remain accepted so a gateway can expose them directly.
    'true_world_explore',
    'true_world_encounter_start',
    'true_world_battle',
    'true_world_enter',
    'true_world_leave',
  ]);
  const ANCIENT_EVENT_ACTIONS = new Set([
    'ancient_event_contribute',
    'ancient_event_claim',
  ]);
  const DAO_FORGE_ACTIONS = new Set([
    'dao_forge_start',
    'dao_forge_claim',
  ]);
  const PALETTE = {
    void: '#090908',
    bone: '#ede5d4',
    boneSoft: '#b9b09f',
    muted: '#514d46',
    gold: '#c7a75f',
    goldBright: '#e0c47c',
    cinnabar: '#bd4534',
  };

  const view = { width: 0, height: 0, dpr: 1 };
  const camera = { x: 0, y: 0, zoom: 1, ready: false };
  const pointers = new Map();
  let gesture = null;
  let pinch = null;
  let state = null;
  let selectedId = null;
  let trueWorldSelectedSectorId = null;
  let ancientEventSelectedId = null;
  let daoForgeSelectedRecipeId = null;
  const daoForgeTreasureSelections = new Map();
  let daoForgeAuthorityDraft = '';
  let currentRoute = [];
  let currentRouteCost = { distance: 0, unknown: 0, cost: 0, remainder: 0, denominator: 1 };
  let busy = false;
  let activeAction = '';
  let toastTimer = 0;
  let travel = null;
  let lastFrame = 0;
  let actionEffect = null;
  const story = createStoryTheater({
    root: app,
    motionQuery,
    preview: isPreview,
    onEffect(effect, point) {
      const target = point || currentNode();
      if (target) actionEffect = { effect, x: target.x, y: target.y, startedAt: performance.now() };
    },
  });
  const reducedMotion = () => motionQuery.matches || story.motionOff;

  const STAR_PREFIXES = ['赤霄', '归墟', '照夜', '长庚', '沉璧', '扶光', '玄阙', '烬海'];
  const STAR_SUFFIXES = ['天轮', '古曜', '孤辰', '界灯', '神炉', '道渊', '明墟', '帝垣'];
  const STAR_KINDS = ['赤焰巨星', '古老黄星', '白曜大星', '衰变巨星', '双生大星', '脉冲古星'];
  const STAR_LAWS = ['光阴迟滞', '纯阳焚界', '空间折叠', '万物寂灭', '因果回响', '重力潮汐', '神魂共振'];
  const STAR_CIVILIZATIONS = ['无文明信号', '残存古城邦', '星舟聚落', '彼岸遗民', '沉眠道统', '未知机械群'];
  const STAR_SIGNALS = [
    '星辉沿断裂的法则环反复折返，深处存在尚未闭合的古代道标。',
    '恒星表层浮现周期性暗纹，疑似一座跨纪元阵列正在缓慢苏醒。',
    '神念抵达边界后发生偏折，星核附近传来不属于本纪元的回声。',
    '外层星冕保持异常静止，数道文明讯号被封存在同一段时间里。',
    '大星正在吞吐稀薄源质，轨道废墟中仍有稳定的法则脉冲。',
    '此处没有自然星风，所有尘埃都朝向一座不可见的星门排列。',
  ];

  function axialDistance(a, b = { q: 0, r: 0 }) {
    return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  }

  function axialPoint(q, r) {
    return { x: HEX_RADIUS * SQRT3 * (q + r / 2), y: HEX_RADIUS * 1.5 * r };
  }

  function coordinateKey(q, r) {
    return `${q},${r}`;
  }

  function nodeHash(q, r) {
    return Math.abs(((q + 11) * 73856093) ^ ((r + 17) * 19349663));
  }

  function createBaseNodes() {
    const nodes = [];
    for (let q = -MAP_RADIUS; q <= MAP_RADIUS; q += 1) {
      const rMin = Math.max(-MAP_RADIUS, -q - MAP_RADIUS);
      const rMax = Math.min(MAP_RADIUS, -q + MAP_RADIUS);
      for (let r = rMin; r <= rMax; r += 1) {
        const index = nodes.length;
        const hash = nodeHash(q, r);
        const distance = axialDistance({ q, r });
        const point = axialPoint(q, r);
        nodes.push({
          id: coordinateKey(q, r),
          coordKey: coordinateKey(q, r),
          q,
          r,
          x: point.x,
          y: point.y,
          name: `${STAR_PREFIXES[index % STAR_PREFIXES.length]}${STAR_SUFFIXES[Math.floor(index / STAR_PREFIXES.length)]}`,
          status: 'unseen',
          kind: STAR_KINDS[hash % STAR_KINDS.length],
          law: STAR_LAWS[(hash >>> 2) % STAR_LAWS.length],
          civilization: STAR_CIVILIZATIONS[(hash >>> 4) % STAR_CIVILIZATIONS.length],
          threat: Math.min(9, Math.max(1, distance + (hash % 3))),
          signal: STAR_SIGNALS[(hash >>> 3) % STAR_SIGNALS.length],
          description: STAR_SIGNALS[(hash >>> 3) % STAR_SIGNALS.length],
          contribution: 0,
          anchorRequirement: Math.min(10, Math.max(3, distance + 3 + (hash % 2))),
          tone: ['gold', 'bone', 'cinnabar'][hash % 3],
          seed: hash,
        });
      }
    }
    return nodes;
  }

  const BASE_NODES = createBaseNodes();
  console.assert(BASE_NODES.length === 61, 'Canglan map must contain exactly 61 nodes.');

  function normalizeStatus(value) {
    const text = String(value || '').toLowerCase();
    if (['anchored', 'anchor', 'cleared', '锚定', '已锚定', '彻查'].includes(text)) return 'anchored';
    if (['explored', 'known', 'visited', '探明', '已探明', '踏足'].includes(text)) return 'explored';
    if (['observed', 'observe', 'sensed', '观测', '已观测', '感知'].includes(text)) return 'observed';
    if (['unobserved', 'unseen', '未知', '未观测'].includes(text)) return 'unseen';
    return 'unseen';
  }

  function finiteNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function optionalBoolean(value, fallback = false) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function normalizeBagItems(rawItems) {
    if (Array.isArray(rawItems)) {
      return rawItems.map((item, index) => typeof item === 'string'
        ? { id: `item-${index}`, name: item, quantity: 1 }
        : {
          ...item,
          id: String(item?.id ?? item?.name ?? `item-${index}`),
          name: String(item?.name ?? item?.title ?? item?.itemName ?? '未鉴定物'),
          quantity: Math.max(1, Math.trunc(finiteNumber(item?.quantity, finiteNumber(item?.count, 1)))),
        });
    }
    if (rawItems && typeof rawItems === 'object') {
      return Object.entries(rawItems).map(([name, quantity]) => ({
        id: name,
        name,
        quantity: Math.max(1, Math.trunc(finiteNumber(quantity, 1))),
      }));
    }
    return [];
  }

  function normalizeExpedition(rawExpedition, nodes) {
    const supplied = Boolean(rawExpedition && typeof rawExpedition === 'object');
    const exists = supplied && rawExpedition.exists !== false;
    const source = supplied ? rawExpedition : {};
    const campaignSource = source.campaign && typeof source.campaign === 'object' ? source.campaign : {};
    const stageSource = source.stage && typeof source.stage === 'object'
      ? source.stage
      : campaignSource.stage && typeof campaignSource.stage === 'object'
        ? campaignSource.stage
        : {};
    const status = String(source.status ?? campaignSource.status ?? 'idle').toLowerCase();
    const completed = optionalBoolean(campaignSource.complete, optionalBoolean(source.complete, ['complete', 'completed', 'settled', 'closed'].includes(status)));
    const active = exists && optionalBoolean(
      source.active,
      optionalBoolean(source.inExpedition, Boolean(source.runId || campaignSource.id) && !completed),
    );
    const indexedStage = stageSource.index !== undefined ? finiteNumber(stageSource.index) + 1 : 0;
    const stageNumber = active || completed
      ? Math.max(1, Math.trunc(finiteNumber(
        stageSource.number,
        finiteNumber(stageSource.current, finiteNumber(campaignSource.stageNumber, finiteNumber(source.stageIndex, indexedStage || 1))),
      )))
      : 0;
    const stageTotal = Math.max(stageNumber, Math.trunc(finiteNumber(
      stageSource.total,
      finiteNumber(campaignSource.stageTotal, finiteNumber(source.stageTotal, active || completed ? 4 : 0)),
    )));
    const rawProgress = finiteNumber(
      stageSource.progress,
      finiteNumber(campaignSource.progress, stageTotal ? (stageNumber - (completed ? 0 : 1)) / stageTotal * 100 : 0),
    );
    const progress = clampPercent(rawProgress > 0 && rawProgress <= 1 ? rawProgress * 100 : rawProgress);
    const campSource = source.camp && typeof source.camp === 'object' ? source.camp : {};
    const campLevel = Math.max(0, Math.trunc(finiteNumber(campSource.level, finiteNumber(campSource.tier))));
    const campEstablished = optionalBoolean(campSource.established, optionalBoolean(campSource.active, campLevel > 0));
    const campDefense = Math.max(0, finiteNumber(campSource.defense, finiteNumber(campSource.currentDefense)));
    const campMaxDefense = Math.max(1, finiteNumber(campSource.maxDefense, finiteNumber(campSource.defenseMax, campEstablished ? 100 : 1)));
    const bagSource = source.tacticalBag && typeof source.tacticalBag === 'object'
      ? source.tacticalBag
      : source.bag && typeof source.bag === 'object'
        ? source.bag
        : {};
    const bagItems = normalizeBagItems(bagSource.items ?? bagSource.loot ?? bagSource.materials);
    const itemUnits = bagItems.reduce((total, item) => total + item.quantity, 0);
    const bagUsed = Math.max(0, finiteNumber(bagSource.used, finiteNumber(bagSource.load, itemUnits)));
    const bagCapacity = Math.max(bagUsed, finiteNumber(bagSource.capacity, finiteNumber(bagSource.max, active ? 12 : 0)));
    const evacuationSource = source.evacuation && typeof source.evacuation === 'object' ? source.evacuation : {};
    const evacuationStatus = String(evacuationSource.status ?? evacuationSource.phase ?? 'idle').toLowerCase();
    const evacuationActive = optionalBoolean(evacuationSource.active, ['preparing', 'channeling', 'ready', 'arrived'].includes(evacuationStatus));
    const evacuationReady = optionalBoolean(evacuationSource.ready, ['ready', 'arrived', 'complete', 'completed'].includes(evacuationStatus));
    const downedSource = source.downed;
    const downed = typeof downedSource === 'object' && downedSource
      ? { ...downedSource, active: optionalBoolean(downedSource.active, optionalBoolean(downedSource.downed, true)) }
      : { active: downedSource === true };
    const lostSource = source.lostCache && typeof source.lostCache === 'object' ? source.lostCache : {};
    const lostCount = Math.max(0, Math.trunc(finiteNumber(lostSource.itemCount, finiteNumber(lostSource.count, normalizeBagItems(lostSource.items).length))));
    const lostCache = {
      ...lostSource,
      active: optionalBoolean(lostSource.active, optionalBoolean(lostSource.recoverable, lostCount > 0)),
      itemCount: lostCount,
      expiresAt: lostSource.expiresAt ?? lostSource.expireAt ?? null,
    };
    const rescueTargets = Array.isArray(source.rescueTargets) ? source.rescueTargets : [];
    const viewer = source.viewer && typeof source.viewer === 'object' ? source.viewer : {};
    const starId = String(source.starId ?? campaignSource.starId ?? campaignSource.targetId ?? '0,0');
    const lostCaches = (Array.isArray(viewer.lostCaches) ? viewer.lostCaches : Array.isArray(source.lostCaches) ? source.lostCaches : [])
      .filter(cache => String(cache?.starId ?? cache?.positionId ?? starId) === starId);
    const fallbackStar = nodes.find(node => node.id === starId || node.coordKey === starId);
    const canClaim = optionalBoolean(viewer.canClaim, optionalBoolean(source.canClaim, evacuationReady && !evacuationSource.claimed));

    return {
      ...source,
      exists,
      active,
      runId: String(source.runId ?? campaignSource.id ?? (active ? 'EXPEDITION' : 'IDLE')),
      starId,
      campaign: {
        ...campaignSource,
        title: String(campaignSource.title ?? campaignSource.name ?? `${fallbackStar?.name || '当前大星'}区域战役`),
        status,
        complete: completed,
        progress,
        unlocked: optionalBoolean(campaignSource.unlocked, true),
        lockedReason: String(campaignSource.lockedReason || ''),
        chain: Array.isArray(campaignSource.chain) ? campaignSource.chain : [],
      },
      stage: {
        ...stageSource,
        number: stageNumber,
        total: stageTotal,
        name: String(stageSource.name ?? stageSource.title ?? campaignSource.stageName ?? (active ? '远征前哨' : '星路待命')),
      },
      camp: {
        ...campSource,
        established: campEstablished,
        name: String(campSource.name ?? campSource.title ?? (campEstablished ? '无名星锚营地' : '无星锚驻点')),
        level: campLevel,
        maxLevel: Math.max(campLevel, Math.trunc(finiteNumber(campSource.maxLevel, finiteNumber(campSource.maxTier, 3)))),
        defense: campDefense,
        maxDefense: campMaxDefense,
      },
      tacticalBag: {
        ...bagSource,
        items: bagItems,
        used: bagUsed,
        capacity: bagCapacity,
        secured: Math.max(0, finiteNumber(bagSource.secured, finiteNumber(bagSource.deposited))),
      },
      evacuation: {
        ...evacuationSource,
        status: evacuationStatus,
        active: evacuationActive,
        ready: evacuationReady,
        completesAt: evacuationSource.completesAt ?? evacuationSource.readyAt ?? null,
      },
      downed,
      lostCache,
      lostCaches,
      rescueTargets,
      viewer: {
        ...viewer,
        canEnter: optionalBoolean(viewer.canEnter, optionalBoolean(source.canEnter, !active && !canClaim)),
        canBuildCamp: optionalBoolean(viewer.canBuildCamp, active && !campEstablished && !downed.active && !evacuationActive),
        canAdvance: optionalBoolean(viewer.canAdvance, active && campEstablished && !completed && !downed.active && !evacuationActive),
        canDeposit: optionalBoolean(viewer.canDeposit, active && campEstablished && bagUsed > 0 && !downed.active && !evacuationActive),
        canRescue: optionalBoolean(viewer.canRescue, active && rescueTargets.length > 0 && !downed.active && !evacuationActive),
        canRecoverLostCache: optionalBoolean(viewer.canRecoverLostCache, active && lostCaches.length > 0 && !downed.active && !evacuationActive),
        canEvacuate: optionalBoolean(viewer.canEvacuate, active && campEstablished && completed && !downed.active && !evacuationActive),
        canForceEvacuate: optionalBoolean(viewer.canForceEvacuate, active && (downed.active || !campEstablished) && !evacuationActive),
        canClaim,
      },
    };
  }

  function normalizeThreat(rawThreat, nodes) {
    if (!rawThreat || typeof rawThreat !== 'object') return null;
    const phase = String(rawThreat.phase || '').toLowerCase();
    if (!Object.hasOwn(THREAT_PHASE_LABELS, phase)) return null;
    const overlord = rawThreat.overlord || {};
    const decision = rawThreat.decision || {};
    const purge = rawThreat.purge || {};
    const viewer = rawThreat.viewer || {};
    const starId = String(rawThreat.starId ?? purge.currentStarId ?? '0,0');
    const purgeCurrentStarId = String(purge.currentStarId ?? starId);
    const purgeRoute = Array.isArray(purge.route) ? purge.route : [];
    const purgeRouteId = reference => String(
      typeof reference === 'object' && reference
        ? reference.starId ?? reference.id ?? reference.coordKey ?? coordinateKey(reference.q ?? reference.x, reference.r ?? reference.y)
        : reference
    );
    const derivedPurgeStep = purgeRoute.findIndex(reference => purgeRouteId(reference) === purgeCurrentStarId);
    const fallbackStar = nodes.find(node => node.id === starId || node.coordKey === starId);
    const maxHp = Math.max(0, finiteNumber(overlord.maxHp, finiteNumber(overlord.currentHp, finiteNumber(overlord.hp))));
    const totalSteps = Math.max(0, Math.trunc(finiteNumber(purge.totalSteps, purgeRoute.length - 1)));
    return {
      ...rawThreat,
      eventId: String(rawThreat.eventId || 'THREAT-UNKNOWN'),
      phase,
      starId,
      title: String(
        phase === 'purge'
          ? purge.title || rawThreat.title
          : ['overlord', 'decision'].includes(phase)
            ? overlord.title || rawThreat.title || overlord.name
            : rawThreat.title
        || `${fallbackStar?.name || '未知大星'}威胁`
      ),
      killCount: Math.max(0, Math.trunc(finiteNumber(rawThreat.killCount))),
      killTarget: Math.max(1, Math.trunc(finiteNumber(rawThreat.killTarget, 10))),
      overlord: {
        ...overlord,
        name: String(overlord.title || overlord.name || '灾厄魔主'),
        hp: Math.max(0, finiteNumber(overlord.currentHp, finiteNumber(overlord.hp))),
        maxHp,
        revived: overlord.revived === true,
        viewerDamage: Math.max(0, finiteNumber(overlord.viewerDamage)),
      },
      decision: {
        ...decision,
        canExecute: decision.canExecute === true || viewer.canExecute === true,
        canRefine: decision.canRefine === true || viewer.canRefine === true,
        refinementWeight: Math.max(0, finiteNumber(decision.refinementWeight, .5)),
      },
      purge: {
        ...purge,
        currentStarId: purgeCurrentStarId,
        route: purgeRoute,
        step: Math.max(0, Math.trunc(finiteNumber(purge.step, finiteNumber(purge.routeIndex, derivedPurgeStep >= 0 ? derivedPurgeStep : 0)))),
        totalSteps,
        defense: Math.max(0, finiteNumber(purge.defenseCount, finiteNumber(purge.defense))),
        required: Math.max(1, finiteNumber(purge.defenseRequirement, finiteNumber(purge.required, 1))),
        occupied: purge.occupied === true,
        nextAdvanceAt: purge.nextAdvanceAt || null,
      },
      escalation: rawThreat.escalation || {},
      viewer: {
        ...viewer,
        canChallenge: viewer.canChallenge === true,
        canResolve: viewer.canResolve === true,
        canExecute: viewer.canExecute === true || decision.canExecute === true,
        canRefine: viewer.canRefine === true || decision.canRefine === true,
        canDefend: viewer.canDefend === true,
        canClaim: viewer.canClaim === true,
        calamityKill: Math.max(0, finiteNumber(viewer.calamityKill)),
        defenseContribution: Math.max(0, finiteNumber(viewer.purgeDefense, finiteNumber(viewer.defenseContribution))),
        purgeDefense: Math.max(0, finiteNumber(viewer.purgeDefense, finiteNumber(viewer.defenseContribution))),
        pendingRewardEventId: viewer.pendingRewardEventId || null,
      },
      history: Array.isArray(rawThreat.history) ? rawThreat.history : [],
    };
  }

  function normalizeProgression(rawProgression) {
    const source = rawProgression && typeof rawProgression === 'object' ? rawProgression : {};
    const fallbackLayers = [
      { id: 'canglan', name: '沧澜界', unlocked: true, enemyRange: '圣王~准帝' },
      { id: 'true_world', name: '真世界', unlocked: false, enemyRange: '真仙~仙王巨头' },
      { id: 'qiankun', name: '乾坤界', unlocked: false, enemyRange: '仙帝~祭道' },
    ];
    const layers = Array.isArray(source.layers) && source.layers.length
      ? source.layers.map(layer => ({
        ...layer,
        id: String(layer?.id || ''),
        name: String(layer?.name || layer?.id || '未知层'),
        unlocked: layer?.unlocked === true,
      }))
      : fallbackLayers;
    const unlockedLayers = Array.isArray(source.unlockedLayers)
      ? source.unlockedLayers.map(value => String(value))
      : layers.filter(layer => layer.unlocked).map(layer => layer.id);
    return {
      ...source,
      currentLayer: String(source.currentLayer || unlockedLayers.at(-1) || 'canglan'),
      unlockedLayers,
      layers,
      materials: Array.isArray(source.materials) ? source.materials : [],
      recipes: Array.isArray(source.recipes) ? source.recipes : [],
    };
  }

  function normalizeTrueWorldCoordinate(value, fallback = '0,0') {
    if (value && typeof value === 'object') {
      const q = Number(value.q ?? value.x);
      const r = Number(value.r ?? value.y);
      if (Number.isInteger(q) && Number.isInteger(r)) return `${q},${r}`;
      return normalizeTrueWorldCoordinate(value.id ?? value.coordinate ?? value.coord, fallback);
    }
    const text = String(value ?? '').trim();
    return /^-?\d+,-?\d+$/.test(text) ? text : fallback;
  }

  function normalizeTrueWorld(rawTrueWorld) {
    const supplied = rawTrueWorld && typeof rawTrueWorld === 'object';
    const source = supplied ? rawTrueWorld : {};
    const globalSource = source.global && typeof source.global === 'object'
      ? source.global
      : source.summary && typeof source.summary === 'object'
        ? source.summary
        : {};
    const viewerSource = source.viewer && typeof source.viewer === 'object'
      ? source.viewer
      : source.player && typeof source.player === 'object'
        ? source.player
        : {};
    const rawSectors = Array.isArray(source.sectors)
      ? source.sectors
      : Array.isArray(source.visibleSectors)
        ? source.visibleSectors
        : [];
    const sectors = rawSectors.map((sector, index) => {
      const id = normalizeTrueWorldCoordinate(sector, `0,${index}`);
      const coordinates = id.split(',').map(Number);
      const progress = Math.max(0, finiteNumber(sector?.progress, finiteNumber(sector?.contribution)));
      const required = Math.max(1, finiteNumber(sector?.progressRequired, finiteNumber(sector?.requirement, 1)));
      return {
        ...sector,
        id,
        q: Number.isFinite(coordinates[0]) ? coordinates[0] : 0,
        r: Number.isFinite(coordinates[1]) ? coordinates[1] : 0,
        name: String(sector?.name ?? sector?.landmark?.name ?? sector?.biomeName ?? `真世界扇区 ${id}`),
        status: String(sector?.status ?? sector?.phase ?? 'unseen').toLowerCase(),
        progress,
        progressRequired: required,
        known: sector?.known !== false,
        threat: Math.max(0, finiteNumber(sector?.threat, 0)),
        biomeName: String(sector?.biomeName ?? sector?.biome ?? '未知星域'),
        biomeDescription: String(sector?.biomeDescription ?? sector?.description ?? ''),
        landmark: sector?.landmark || null,
        encounter: sector?.encounter || null,
      };
    });
    const fallbackSector = sectors.find(sector => sector.id === '0,0') || sectors[0] || {
      id: '0,0', q: 0, r: 0, name: '真世界门户', status: 'explored', progress: 1, progressRequired: 1, threat: 0,
    };
    const currentSectorId = normalizeTrueWorldCoordinate(
      source.currentSectorId ?? source.focusSectorId ?? source.currentSector ?? viewerSource.coordinate ?? source.center,
      fallbackSector.id,
    );
    const currentSector = sectors.find(sector => sector.id === currentSectorId) || {
      ...fallbackSector,
      id: currentSectorId,
      ...(() => {
        const [q, r] = currentSectorId.split(',').map(Number);
        return { q: Number.isFinite(q) ? q : 0, r: Number.isFinite(r) ? r : 0 };
      })(),
    };
    const activeEncounters = Array.isArray(source.activeEncounters) ? source.activeEncounters : [];
    const enemySource = source.enemy && typeof source.enemy === 'object'
      ? source.enemy
      : source.encounter && typeof source.encounter === 'object'
        ? source.encounter
        : currentSector.encounter && typeof currentSector.encounter === 'object'
          ? currentSector.encounter
          : activeEncounters.find(entry => String(entry?.sectorId ?? entry?.coordinate ?? '') === currentSectorId) || activeEncounters[0] || {};
    const enemyMaxHp = Math.max(0, finiteNumber(enemySource.maxHp, finiteNumber(enemySource.hp, 0)));
    const enemyCurrentHp = Math.max(0, finiteNumber(enemySource.currentHp, finiteNumber(enemySource.hp, enemyMaxHp)));
    const actions = source.actions && typeof source.actions === 'object' ? source.actions : {};
    const actionAllowed = (name, fallback) => {
      const key = `can${name[0].toUpperCase()}${name.slice(1)}`;
      if (typeof viewerSource[key] === 'boolean') return viewerSource[key];
      if (typeof actions[name] === 'boolean') return actions[name];
      return fallback;
    };
    const pendingClaims = Array.isArray(viewerSource.pendingClaims)
      ? viewerSource.pendingClaims
      : Array.isArray(source.pendingClaims)
        ? source.pendingClaims
        : [];
    const pendingLoot = pendingClaims.map((claim, index) => ({
      id: String(claim?.claimId ?? `claim-${index}`),
      claimId: String(claim?.claimId ?? `claim-${index}`),
      name: String(claim?.opportunity || claim?.tier || '真世界战果'),
      quantity: Math.max(1, Math.trunc(finiteNumber(claim?.materialUnits, 1))),
      tier: claim?.tier || null,
      eraAccumulation: Math.max(0, finiteNumber(claim?.eraAccumulation)),
    }));
    const normalizedLoot = normalizeBagItems(
      source.loot ?? source.rewards ?? viewerSource.loot ?? viewerSource.rewards ?? source.claimableLoot,
    );
    const loot = normalizedLoot.length ? normalizedLoot : pendingLoot;
    const globalExplored = Math.max(0, Math.trunc(finiteNumber(globalSource.exploredCount, finiteNumber(source.exploredCount, 0))));
    const globalObserved = Math.max(0, Math.trunc(finiteNumber(globalSource.observedCount, finiteNumber(source.observedCount, globalExplored))));
    const sectorCount = Math.max(1, Math.trunc(finiteNumber(source.sectorCount, finiteNumber(globalSource.sectorCount, 1 + 3 * 48 * 49))));
    const progressPercent = clampPercent(finiteNumber(globalSource.progressPercent, finiteNumber(source.progressPercent, globalExplored / sectorCount * 100)));
    const unlocked = source.unlocked !== false && source.access !== false && source.locked !== true;
    return {
      ...source,
      exists: supplied && source.exists !== false,
      unlocked,
      title: String(source.title ?? source.name ?? '真世界'),
      radius: Math.max(1, Math.trunc(finiteNumber(source.radius, 48))),
      sectorCount,
      currentSectorId,
      currentSector,
      center: normalizeTrueWorldCoordinate(source.center, currentSectorId),
      sectors,
      frontier: Array.isArray(source.frontier) ? source.frontier : [],
      global: {
        ...globalSource,
        observedCount: globalObserved,
        exploredCount: globalExplored,
        progressPercent,
        eraAccumulation: Math.max(0, finiteNumber(globalSource.eraAccumulation, finiteNumber(source.eraAccumulation, 0))),
        quasiImmortalEmperorDefeated: Math.max(0, Math.trunc(finiteNumber(globalSource.quasiImmortalEmperorDefeated, finiteNumber(source.quasiImmortalEmperorDefeated, 0)))),
        encounterCount: Math.max(0, Math.trunc(finiteNumber(globalSource.encounterCount, 0))),
        victoryCount: Math.max(0, Math.trunc(finiteNumber(globalSource.victoryCount, 0))),
      },
      viewer: {
        ...viewerSource,
        coordinate: normalizeTrueWorldCoordinate(viewerSource.coordinate ?? viewerSource.currentSector ?? currentSectorId, currentSectorId),
        eraAccumulation: Math.max(0, finiteNumber(viewerSource.eraAccumulation, 0)),
        quasiImmortalEmperorSources: Math.max(0, Math.trunc(finiteNumber(viewerSource.quasiImmortalEmperorSources, 0))),
        knownCount: Math.max(0, Math.trunc(finiteNumber(viewerSource.knownCount, 0))),
        exploredCount: Math.max(0, Math.trunc(finiteNumber(viewerSource.exploredCount, 0))),
        victories: viewerSource.victories && typeof viewerSource.victories === 'object' ? viewerSource.victories : {},
        materials: viewerSource.materials && typeof viewerSource.materials === 'object' ? viewerSource.materials : {},
        opportunities: Array.isArray(viewerSource.opportunities) ? viewerSource.opportunities : [],
        loot,
        canObserve: actionAllowed('observe', unlocked),
        canMove: actionAllowed('move', unlocked),
        canExplore: actionAllowed('explore', unlocked && currentSector.status !== 'explored'),
        canEncounter: actionAllowed('encounter', unlocked && currentSector.status === 'explored'),
        canClaim: actionAllowed('claim', unlocked && loot.length > 0),
      },
      enemy: {
        ...enemySource,
        encounterId: String(enemySource.encounterId ?? enemySource.id ?? ''),
        tier: String(enemySource.tier ?? enemySource.realmTier ?? ''),
        name: String(enemySource.name ?? enemySource.title ?? '尚未生成'),
        realmName: String(enemySource.realmName ?? enemySource.realm ?? '--'),
        maxHp: enemyMaxHp,
        currentHp: Math.min(enemyMaxHp || enemyCurrentHp, enemyCurrentHp),
        status: String(enemySource.status ?? (enemyMaxHp > 0 ? 'active' : 'idle')).toLowerCase(),
        sameRealmMutant: enemySource.sameRealmMutant === true,
      },
      loot,
    };
  }

  function normalizeAncientEvents(rawAncientEvents) {
    const source = rawAncientEvents && typeof rawAncientEvents === 'object' ? rawAncientEvents : {};
    const events = (Array.isArray(source.events) ? source.events : []).map((entry, index) => {
      const event = entry && typeof entry === 'object' ? entry : {};
      const viewer = event.viewer && typeof event.viewer === 'object' ? event.viewer : {};
      const required = Math.max(1, Math.trunc(finiteNumber(event.contributionRequired, 1)));
      const progress = Math.min(required, Math.max(0, Math.trunc(finiteNumber(event.progress))));
      return {
        ...event,
        id: String(event.id || `ancient-event-${index + 1}`),
        order: Math.max(1, Math.trunc(finiteNumber(event.order, index + 1))),
        name: String(event.name || `古文明章节 ${index + 1}`),
        coordinate: normalizeTrueWorldCoordinate(event.coordinate, '0,0'),
        description: String(event.description || '古史因果尚未完成解析。'),
        opposition: Array.isArray(event.opposition) ? event.opposition.map(String) : [],
        status: String(event.status || 'locked').toLowerCase(),
        progress,
        contributionRequired: required,
        progressPercent: clampPercent(finiteNumber(event.progressPercent, progress / required * 100)),
        contributorCount: Math.max(0, Math.trunc(finiteNumber(event.contributorCount))),
        sectorExplored: event.sectorExplored === true,
        viewer: {
          ...viewer,
          contribution: Math.max(0, Math.trunc(finiteNumber(viewer.contribution))),
          claimed: viewer.claimed === true,
          atCoordinate: viewer.atCoordinate === true,
          canContribute: viewer.canContribute === true,
          canClaim: viewer.canClaim === true,
        },
      };
    }).sort((a, b) => a.order - b.order);
    const completedCount = Math.max(
      events.filter(event => event.status === 'completed').length,
      Math.trunc(finiteNumber(source.completedCount)),
    );
    const viewerSource = source.viewer && typeof source.viewer === 'object' ? source.viewer : {};
    return {
      ...source,
      exists: events.length > 0,
      status: String(source.status || (completedCount === events.length && events.length ? 'completed' : 'active')).toLowerCase(),
      activeEventId: String(source.activeEventId || events.find(event => event.status === 'active')?.id || ''),
      completedCount,
      eventCount: Math.max(events.length, Math.trunc(finiteNumber(source.eventCount, events.length))),
      events,
      viewer: {
        ...viewerSource,
        totalContribution: Math.max(0, Math.trunc(finiteNumber(viewerSource.totalContribution, events.reduce((sum, event) => sum + event.viewer.contribution, 0)))),
        canClaim: viewerSource.canClaim === true || events.some(event => event.viewer.canClaim),
      },
    };
  }

  function normalizeDaoForge(rawDaoForge) {
    const source = rawDaoForge && typeof rawDaoForge === 'object' ? rawDaoForge : {};
    const recipes = (Array.isArray(source.recipes) ? source.recipes : []).map((entry, index) => {
      const recipe = entry && typeof entry === 'object' ? entry : {};
      return {
        ...recipe,
        id: String(recipe.id || `dao-forge-recipe-${index + 1}`),
        index: Math.max(1, Math.trunc(finiteNumber(recipe.index, index + 1))),
        name: String(recipe.name || `第${index + 1}法`),
        description: String(recipe.description || '此法仍在彼岸古史中等待补全。'),
        known: recipe.known === true,
        ready: recipe.ready === true,
        unavailable: recipe.unavailable === true,
        missing: Array.isArray(recipe.missing) ? recipe.missing : [],
      };
    }).sort((a, b) => a.index - b.index);
    const rawForge = source.forge && typeof source.forge === 'object' ? source.forge : null;
    const durationMs = Math.max(1, finiteNumber(source.durationMs, 24 * 60 * 60 * 1000));
    const forge = rawForge ? {
      ...rawForge,
      forgeId: String(rawForge.forgeId || ''),
      status: String(rawForge.status || 'forging').toLowerCase(),
      recipeId: String(rawForge.recipeId || ''),
      recipeName: String(rawForge.recipeName || '大道至宝'),
      treasureName: String(rawForge.treasureName || rawForge.recipeName || '大道至宝'),
      startedAt: Math.max(0, finiteNumber(rawForge.startedAt)),
      readyAt: Math.max(0, finiteNumber(rawForge.readyAt)),
      remainingMs: Math.max(0, finiteNumber(rawForge.remainingMs)),
      progress: clampPercent(finiteNumber(rawForge.progress)),
      canClaim: rawForge.canClaim === true || String(rawForge.status).toLowerCase() === 'ready',
    } : null;
    return {
      ...source,
      exists: recipes.length > 0 || Boolean(forge),
      durationMs,
      recipes,
      forge,
      ownedInnateTreasures: Array.isArray(source.ownedInnateTreasures)
        ? source.ownedInnateTreasures
          .map(entry => String(entry && typeof entry === 'object' ? entry.name ?? entry.id ?? '' : entry || '').trim())
          .filter(Boolean)
        : [],
    };
  }

  function normalizeState(raw = {}) {
    const supplied = Array.isArray(raw.nodes)
      ? raw.nodes
        : Array.isArray(raw.map?.nodes)
          ? raw.map.nodes
          : Array.isArray(raw.map?.stars)
            ? raw.map.stars
            : Array.isArray(raw.stars)
              ? raw.stars
              : Array.isArray(raw.world?.stars)
                ? raw.world.stars
                : [];
    const byCoordinate = new Map();
    supplied.forEach((node, index) => {
      const q = Number(node.q ?? node.x);
      const r = Number(node.r ?? node.y);
      if (Number.isFinite(q) && Number.isFinite(r)) byCoordinate.set(coordinateKey(q, r), { ...node, sourceIndex: index });
    });

    const nodes = BASE_NODES.map(base => {
      const suppliedNode = byCoordinate.get(base.coordKey) || supplied.find(node => String(node.id) === base.id) || {};
      return {
        ...base,
        ...suppliedNode,
        id: String(suppliedNode.id ?? base.id),
        coordKey: base.coordKey,
        q: base.q,
        r: base.r,
        x: base.x,
        y: base.y,
        status: normalizeStatus(suppliedNode.status ?? suppliedNode.phase ?? base.status),
        threat: suppliedNode.threat ?? suppliedNode.risk ?? base.threat,
        signal: suppliedNode.signal ?? suppliedNode.description ?? base.signal,
        contribution: Math.max(0, Number(suppliedNode.contribution ?? base.contribution) || 0),
        anchorRequirement: Math.max(0, Number(suppliedNode.anchorRequirement ?? base.anchorRequirement) || 0),
        viewerContributed: suppliedNode.viewerContributed === true,
        cleared: suppliedNode.cleared === true || suppliedNode.phase === 'cleared',
      };
    });

    const playerSource = raw.player || raw.viewer || {};
    const requestedPosition = String(playerSource.positionId ?? playerSource.position ?? raw.positionId ?? raw.position ?? '0,0');
    const requestedCoordinates = coordinateKey(Number(playerSource.q ?? playerSource.x ?? 0), Number(playerSource.r ?? playerSource.y ?? 0));
    const positionNode = nodes.find(node => node.id === requestedPosition)
      || nodes.find(node => node.coordKey === requestedPosition)
      || nodes.find(node => node.coordKey === requestedCoordinates)
      || nodes.find(node => node.coordKey === '0,0');

    return {
      ...raw,
      nodes,
      player: {
        name: playerSource.name || playerSource.playerName || '无名修士',
        realm: playerSource.realm || raw.realm || '大帝以下',
        travelTier: playerSource.travelTier || raw.travelTier || '',
        mind: Math.max(0, Number(playerSource.mind ?? raw.mind ?? 0)),
        maxMind: Math.max(0, Number(playerSource.maxMind ?? raw.maxMind ?? playerSource.mind ?? raw.mind ?? 0)),
        mindRemainder: Math.max(0, Number(playerSource.mindRemainder ?? raw.mindRemainder ?? 0)),
        positionId: positionNode.id,
      },
      pressure: Math.max(0, Number(raw.pressure ?? raw.expeditionPressure ?? 0)),
      threat: normalizeThreat(raw.threat ?? raw.world?.threat, nodes),
      expedition: normalizeExpedition(raw.expedition ?? raw.world?.expedition, nodes),
      progression: normalizeProgression(raw.progression ?? raw.world?.progression),
      trueWorld: normalizeTrueWorld(raw.trueWorld ?? raw.true_world ?? raw.world?.trueWorld ?? raw.world?.true_world),
      ancientEvents: normalizeAncientEvents(raw.ancientEvents ?? raw.world?.ancientEvents),
      daoForge: normalizeDaoForge(raw.daoForge ?? raw.world?.daoForge),
    };
  }

  function createPreviewState() {
    const campaignStars = {
      '0,0': { name: '沧澜祖星', kind: 'origin', law: '万物生息', civilization: '先秦归航者', signal: '海陆之间仍有生灵繁衍。古老星锚守候着横越两岸的归航者。' },
      '1,-1': { name: '玄阙神炉', kind: '古文明神炉', law: '太初真火', civilization: '先秦炼气士遗脉', signal: '神炉灾痕连接着失落古航路，炉心深处有共享灾核正在复苏。' },
      '4,-4': { name: '彼岸渡口', kind: '裂界古渡', law: '两界折叠', civilization: '先秦归航者', signal: '残缺渡碑保存着先秦炼气士横穿灵界裂隙的返乡坐标。' },
      '0,-4': { name: '裂界母锚', kind: '维度母锚', law: '万隙归源', civilization: '彼岸古文明', signal: '诸灵界裂隙在此汇为同一根系，母锚背后隐约显出更高世界。' },
    };
    const nodes = BASE_NODES.map(node => {
      const distance = axialDistance(node);
      let status = 'unseen';
      if (distance === 0) status = 'anchored';
      else if (distance === 1) status = node.seed % 3 === 0 ? 'anchored' : 'explored';
      else if (distance === 2) status = node.seed % 2 === 0 ? 'explored' : 'observed';
      else if (distance === 3 && node.seed % 3 !== 0) status = 'observed';
      const contribution = STATUS_ORDER[status] >= STATUS_ORDER.anchored
        ? node.anchorRequirement
        : status === 'explored'
          ? Math.max(0, node.anchorRequirement - 1)
          : 0;
      return { ...node, kind: ['life', 'tide', 'ruin', 'rift', 'dead', 'civilization'][node.seed % 6], ...(campaignStars[node.id] || {}), status, contribution, viewerContributed: false };
    });

    const previewState = normalizeState({
      player: {
        name: '观星者',
        realm: '仙王巨头',
        mind: 27,
        maxMind: 36,
        mindRemainder: 1,
        positionId: '0,0',
      },
      pressure: 42,
      nodes,
      threat: {
        eventId: 'CL-7-038',
        phase: 'calamity',
        starId: '1,-1',
        title: '赤霄灾潮 · 变异体增殖',
        killCount: 9,
        killTarget: 10,
        overlord: {
          name: '煌天焚世魔主',
          hp: 1200000000000000,
          maxHp: 1200000000000000,
          revived: false,
          viewerDamage: 0,
        },
        decision: { canExecute: false, canRefine: false, refinementWeight: .5 },
        purge: {
          currentStarId: '3,-2',
          route: ['3,-2', '2,-1', '1,-1', '0,0'],
          step: 0,
          totalSteps: 3,
          defense: 0,
          required: 3,
          occupied: false,
          nextAdvanceAt: Date.now() + 180000,
        },
        escalation: { eraLord: false, hyperdimensional: false },
        viewer: {
          canChallenge: true,
          canResolve: false,
          canExecute: false,
          canRefine: false,
          canDefend: false,
          canClaim: false,
          calamityKill: 1,
          defenseContribution: 0,
          purgeDefense: 0,
          pendingRewardEventId: null,
        },
        history: [{ type: 'calamity_started', starName: '玄阙神炉' }],
      },
      expedition: {
        exists: true,
        active: false,
        runId: 'IDLE',
        starId: '1,-1',
        campaign: {
          title: '玄阙神炉区域战役',
          status: 'idle',
          complete: false,
          progress: 0,
          unlocked: true,
          lockedReason: '',
          chain: [
            { starId: '1,-1', name: '玄阙神炉', order: 0, unlocked: true, viewerCleared: false, globalCleared: false },
            { starId: '4,-4', name: '先秦归航', order: 1, unlocked: false, viewerCleared: false, globalCleared: false },
            { starId: '0,-4', name: '母锚归一', order: 2, unlocked: false, viewerCleared: false, globalCleared: false },
          ],
        },
        stage: { number: 0, total: 5, name: '等待建立远征' },
        camp: { level: 0, maxLevel: 3, name: '玄阙神炉临时驻点', defense: 0, maxDefense: 1 },
        tacticalBag: { items: [], used: 0, secured: 0, capacity: 0 },
        evacuation: { status: 'idle', active: false, ready: false },
        downed: { active: false },
        lostCache: { active: false },
        lostCaches: [],
        rescueTargets: [],
        viewer: {
          canEnter: true,
          canBuildCamp: false,
          canAdvance: false,
          canDeposit: false,
          canRescue: false,
          canRecoverLostCache: false,
          canEvacuate: false,
          canForceEvacuate: false,
          canClaim: false,
        },
      },
    });
    if (params.get('layer') === 'true_world') {
      previewState.progression.currentLayer = 'true_world';
      previewState.progression.unlockedLayers = ['canglan', 'true_world'];
      previewState.progression.layers = previewState.progression.layers.map(layer => ({
        ...layer,
        unlocked: ['canglan', 'true_world'].includes(layer.id),
      }));
      previewState.trueWorld = normalizeTrueWorld({
        exists: true,
        unlocked: true,
        title: '真世界 · 先秦遗都前线',
        radius: 48,
        sectorCount: TRUE_WORLD_SECTOR_COUNT,
        center: '0,0',
        currentSectorId: '7,-3',
        sectors: [
          { id: '0,0', q: 0, r: 0, name: '真世界门户', status: 'explored', progress: 100, progressRequired: 100, threat: 2, biomeName: '真界源海', biomeDescription: '门户后的星海正在向全服神念展开。' },
          { id: '1,0', q: 1, r: 0, name: '先秦遗都外环', status: 'observed', progress: 22, progressRequired: 100, threat: 4, biomeName: '先秦炼气遗都', biomeDescription: '残存道种炉在星尘中回应观测。' },
          { id: '-1,1', q: -1, r: 1, name: '灵界裂隙源庭', status: 'observed', progress: 48, progressRequired: 100, threat: 5, biomeName: '灵界裂隙荒原', biomeDescription: '裂缝像河流一样改道。' },
          { id: '7,-3', q: 7, r: -3, name: '先秦炼气祖庭', status: 'explored', progress: 100, progressRequired: 100, threat: 7, biomeName: '祖庭道火星海', biomeDescription: '失落炼气士把大星炼成祖庭，古史正沿道火重新显化。' },
          { id: '-9,4', q: -9, r: 4, name: '灵界裂隙源庭', status: 'observed', progress: 38, progressRequired: 100, threat: 8, biomeName: '万隙源海', biomeDescription: '诸天灵界裂隙在这里汇成一条古老源谱。' },
          { id: '13,-8', q: 13, r: -8, name: '禁宝清算庭', status: 'unseen', progress: 0, progressRequired: 100, threat: 9, biomeName: '清算星垣' },
          { id: '21,-13', q: 21, r: -13, name: '纪元主宰观测台', status: 'unseen', progress: 0, progressRequired: 100, threat: 10, biomeName: '超维观测断层' },
        ],
        global: { observedCount: 5, exploredCount: 2, progressPercent: 0.028, eraAccumulation: 12, quasiImmortalEmperorDefeated: 3, encounterCount: 8, victoryCount: 7 },
        viewer: {
          coordinate: '7,-3', knownCount: 5, exploredCount: 2, eraAccumulation: 4, quasiImmortalEmperorSources: 2,
          victories: { total: 2, quasi_immortal_emperor: 1 },
          materials: { 'true-world-source-crystal': 9, 'dao-rule-origin': 4 },
          loot: [{ id: 'opportunity:qin-qi-refinement', claimId: 'preview-claim-01', name: '先秦炼气遗篇', quantity: 1 }],
          pendingClaims: [{ claimId: 'preview-claim-01', tier: 'quasi_immortal_emperor', materialUnits: 13, eraAccumulation: 1, opportunity: '先秦炼气遗篇' }],
          canObserve: true, canMove: true, canEncounter: true, canClaim: true,
        },
        enemy: { encounterId: 'preview-tw-wave-01', tier: 'quasi_immortal_emperor', name: '同源准仙帝灾厄变异体', realmName: '准仙帝', maxHp: 8400000000000000, currentHp: 4200000000000000, status: 'active', sameRealmMutant: true },
        frontier: ['0,0', '1,0', '-9,4', '13,-8'],
      });
      previewState.ancientEvents = normalizeAncientEvents({
        status: 'active', activeEventId: 'qin-qi-refiner-ancestral-court', completedCount: 0, eventCount: 4,
        events: [
          { id: 'qin-qi-refiner-ancestral-court', order: 1, name: '先秦炼气祖庭', coordinate: '7,-3', status: 'active', progress: 70, contributionRequired: 120, contributorCount: 6, sectorExplored: true, description: '复原先秦炼气士以星辰为炉、以身为种的祖庭古史。', opposition: ['祖庭道火残灵', '裂界守史人'], viewer: { contribution: 10, atCoordinate: true, canContribute: true, canClaim: false } },
          { id: 'spirit-rift-source-court', order: 2, name: '灵界裂隙源庭', coordinate: '-9,4', status: 'locked', progress: 0, contributionRequired: 180, description: '沿旧源谱追溯灵界裂隙，拼合彼岸古文明第一次越界的炼制术。', opposition: ['裂界巡猎者', '源庭校正阵'], viewer: {} },
          { id: 'forbidden-treasure-cleansing-court', order: 3, name: '禁宝清算庭', coordinate: '13,-8', status: 'locked', progress: 0, contributionRequired: 260, description: '攻入清算中枢，截获尚未被无尽商店收录的先天至宝天机。', opposition: ['禁宝司清算舰队', '违禁因果裁定者'], viewer: {} },
          { id: 'era-overlord-observatory-finale', order: 4, name: '纪元主宰观测台', coordinate: '21,-13', status: 'locked', progress: 0, contributionRequired: 400, description: '切断逻辑彼岸观测链，迎战纪元主宰投影与超维清算者。', opposition: ['纪元主宰·逻辑投影', '超维清算者·断律使'], viewer: {} },
        ],
        viewer: { totalContribution: 10, canClaim: false },
      });
      previewState.daoForge = normalizeDaoForge({
        durationMs: 86400000,
        ownedInnateTreasures: ['盘古幡', '太极图', '混沌钟', '诛仙四剑', '山河社稷图'],
        authorityOptions: [
          { name: '开天', cooldownKey: '开天', sourceTreasureName: '盘古幡', command: '#开天' },
          { name: '阴阳逆转', cooldownKey: '阴阳逆转', sourceTreasureName: '太极图', command: '#阴阳逆转' },
          { name: '诛仙剑阵', cooldownKey: '诛仙剑阵', sourceTreasureName: '诛仙四剑', command: '#布诛仙剑阵' },
          { name: '星辰护界', cooldownKey: '星辰护界', sourceTreasureName: '周天星辰旗', command: '#星辰护界' },
          { name: '演化诸天', cooldownKey: '演化诸天', sourceTreasureName: '定海珠', command: '#演化诸天' },
        ],
        recipes: [
          { id: 'three-innate-erasure', index: 1, name: '三宝归墟法', description: '三件先天至宝自古史消失，融合三宝全部可解析权柄并缩短冷却。', known: true, ready: true, missing: [] },
          { id: 'custom-ancient-method', index: 2, name: '彼岸定法', description: '彼岸古法正文尚未补全，当前只保留炼制位。', known: false, ready: false, unavailable: true, missing: [{ label: '彼岸古法正文' }] },
          { id: 'dao-fruit-five-treasure', index: 3, name: '道果五宝法', description: '道果与五宝同炉，保留五宝并随机强化一项权柄。', known: true, ready: true, missing: [] },
          { id: 'return-truth-edit', index: 4, name: '还真编权法', description: '三十准仙帝本源入炉，自定义编辑三项强化权柄。', known: true, ready: false, missing: [{ label: '准仙帝本源 30' }] },
        ],
      });
      trueWorldSelectedSectorId = '7,-3';
      ancientEventSelectedId = 'qin-qi-refiner-ancestral-court';
      daoForgeSelectedRecipeId = 'three-innate-erasure';
    }
    return previewState;
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) element.textContent = value ?? '';
  }

  function getNode(id) {
    if (!state || id === null || id === undefined) return null;
    const key = String(id);
    return state.nodes.find(node => node.id === key || node.coordKey === key) || null;
  }

  function currentNode() {
    return getNode(state?.player?.positionId);
  }

  function coordMap() {
    return new Map((state?.nodes || BASE_NODES).map(node => [node.coordKey, node]));
  }

  function resolveThreatNode(reference) {
    if (reference === null || reference === undefined) return null;
    if (typeof reference !== 'object') return getNode(reference);
    const id = reference.starId ?? reference.id ?? reference.coordKey;
    if (id !== undefined) {
      const matched = getNode(id);
      if (matched) return matched;
    }
    const q = Number(reference.q ?? reference.x);
    const r = Number(reference.r ?? reference.y);
    return Number.isFinite(q) && Number.isFinite(r) ? getNode(coordinateKey(q, r)) : null;
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

  function routeBetween(from, to) {
    if (!from || !to) return [];
    const distance = axialDistance(from, to);
    const nodesByCoordinate = coordMap();
    const route = [];
    for (let index = 0; index <= distance; index += 1) {
      const t = distance === 0 ? 0 : index / distance;
      const coordinate = cubeRound(from.q + (to.q - from.q) * t, from.r + (to.r - from.r) * t);
      const node = nodesByCoordinate.get(coordinateKey(coordinate.q, coordinate.r));
      if (node && route.at(-1)?.coordKey !== node.coordKey) route.push(node);
    }
    return route;
  }

  function travelRate(player) {
    const tier = String(player?.travelTier || '').toLowerCase();
    const realm = String(player?.realm || '');
    if (tier === 'immortal_emperor' || (/仙帝/.test(realm) && !/准仙帝/.test(realm))) return { numerator: 0, denominator: 1 };
    if (tier === 'quasi_immortal_emperor' || /准仙帝/.test(realm)) return { numerator: 1, denominator: 10 };
    if (tier === 'immortal_king' || /仙王/.test(realm)) return { numerator: 1, denominator: 3 };
    if (tier === 'true_immortal' || /真仙/.test(realm)) return { numerator: 1, denominator: 2 };
    if (tier === 'emperor' || /大帝/.test(realm)) return { numerator: 1, denominator: 1 };
    return { numerator: 5, denominator: 1 };
  }

  function calculateRouteCost(route, player = state?.player) {
    const rate = travelRate(player);
    const traversed = route.slice(1);
    const unknown = traversed.filter(node => node.status !== 'anchored').length;
    const carried = rate.denominator > 1 ? Math.min(rate.denominator - 1, Number(player?.mindRemainder) || 0) : 0;
    const units = carried + unknown * rate.numerator;
    return {
      distance: traversed.length,
      unknown,
      cost: rate.numerator === 0 ? 0 : Math.floor(units / rate.denominator),
      remainder: rate.numerator === 0 ? 0 : units % rate.denominator,
      denominator: rate.denominator,
    };
  }

  function displayName(node) {
    return node && node.status !== 'unseen' ? node.name : node ? '未命名大星' : '择定一颗大星';
  }

  function threatLabel(threat) {
    const numeric = Number(threat);
    if (!Number.isFinite(numeric)) return String(threat || '未解析');
    if (numeric >= 8) return `极危 ${numeric}`;
    if (numeric >= 5) return `凶险 ${numeric}`;
    if (numeric >= 3) return `警戒 ${numeric}`;
    return `平稳 ${numeric}`;
  }

  function explorationProgress(node) {
    return {
      contribution: Math.max(0, Number(node?.contribution) || 0),
      requirement: Math.max(0, Number(node?.anchorRequirement) || 0),
    };
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, finiteNumber(value)));
  }

  function formatMagnitude(value) {
    const numeric = Math.max(0, finiteNumber(value));
    const units = [
      [1e12, '兆'],
      [1e8, '亿'],
      [1e4, '万'],
    ];
    const unit = units.find(([size]) => numeric >= size);
    if (!unit) return Math.round(numeric).toLocaleString('zh-CN');
    const amount = numeric / unit[0];
    return `${amount >= 100 ? Math.round(amount) : amount.toFixed(amount >= 10 ? 1 : 2).replace(/\.0+$/, '')}${unit[1]}`;
  }

  function escalationActive(value) {
    if (!value) return false;
    if (typeof value !== 'object') return Boolean(value);
    if (Object.hasOwn(value, 'active')) return value.active === true;
    if (Object.hasOwn(value, 'present')) return value.present === true;
    if (Object.hasOwn(value, 'arrived')) return value.arrived === true;
    return Object.keys(value).length > 0;
  }

  function escalationName(value, fallback) {
    return typeof value === 'object' && value ? String(value.name || value.title || fallback) : fallback;
  }

  function threatProgressModel(threat) {
    if (!threat) return { label: '全服威胁', value: '--', progress: 0, summary: '未发现域外因果。', detail: '星海因果尚未显化。' };
    if (threat.phase === 'calamity') {
      const remaining = Math.max(0, threat.killTarget - threat.killCount);
      return {
        label: '全服灾厄击杀',
        value: `${threat.killCount} / ${threat.killTarget}`,
        progress: threat.killCount / threat.killTarget * 100,
        summary: `再斩 ${remaining} 只，灾厄魔主将循裂界降临。`,
        detail: '同源灾厄变异体正在事件大星增殖，全服击杀共同推进降临阈值。',
      };
    }
    if (threat.phase === 'overlord') {
      const maxHp = Math.max(1, threat.overlord.maxHp);
      return {
        label: threat.overlord.name,
        value: `${formatMagnitude(threat.overlord.hp)} / ${formatMagnitude(threat.overlord.maxHp)}`,
        progress: (1 - threat.overlord.hp / maxHp) * 100,
        summary: `${threat.overlord.name}镇压星域，全服伤害实时汇入。`,
        detail: threat.overlord.revived
          ? '魔主返命功法已经触发，复生之身仍保留全属性增幅。'
          : '魔主正以十倍秘法与化外身封锁星路，击破后将进入处置阶段。',
      };
    }
    if (threat.phase === 'decision') {
      return {
        label: '魔主处置',
        value: '因果待决',
        progress: 100,
        summary: `诛灭魔主，或按 ${threat.decision.refinementWeight} 人权重炼入本源。`,
        detail: `炼化可计作 ${threat.decision.refinementWeight} 人贡献；任一处置都会暴露先天至宝因果，引来古文明清剿者。`,
      };
    }
    if (threat.phase === 'purge') {
      const remaining = Math.max(0, threat.purge.required - threat.purge.defense);
      return {
        label: threat.purge.occupied ? '失守大星反攻' : '全服守星防线',
        value: `${threat.purge.defense} / ${threat.purge.required}`,
        progress: threat.purge.defense / threat.purge.required * 100,
        summary: `清剿阵列推进 ${threat.purge.step}/${threat.purge.totalSteps}，防线还需 ${remaining} 点。`,
        detail: threat.purge.occupied
          ? '当前大星已经失守，清剿者将沿已探明星路继续推进。'
          : '彼岸古文明正在回收违禁品因果，守住当前节点即可截断推进路线。',
      };
    }
    return {
      label: '本轮战果',
      value: threat.viewer.canClaim ? '待领取' : '已归档',
      progress: 100,
      summary: threat.viewer.canClaim ? '星海威胁解除，个人战果等待结算。' : '星海威胁解除，永久星图状态已经更新。',
      detail: threat.viewer.canClaim ? '领取本轮全服讨伐战果，完成此次事件闭环。' : '清剿者已经退出当前星域，事件记录写入彼岸古史。',
    };
  }

  function formatAdvanceTime(value) {
    if (!value) return '未显化';
    const remaining = Math.max(0, new Date(value).getTime() - Date.now());
    if (!Number.isFinite(remaining)) return '未显化';
    if (remaining <= 0) return '即将推进';
    return `${Math.max(1, Math.ceil(remaining / 60000))} 分钟`;
  }

  function threatHistoryText(entry) {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object') return '';
    if (entry.text || entry.message || entry.summary) {
      return String(entry.text || entry.message || entry.summary);
    }
    const type = String(entry.type || '').toLowerCase();
    const star = entry.starName || entry.starTitle || entry.starId || entry.currentStarId || '事件大星';
    const playerName = entry.playerName || entry.authorizedPlayerName || '一位彼岸修士';
    const fate = String(entry.fate || entry.choice || '').toLowerCase();
    const messages = {
      calamity_started: `域外灾厄在${star}爆发。`,
      calamity_kill: `${playerName}斩灭灾厄变异体，全服累计 ${finiteNumber(entry.killCount)} 只。`,
      overlord_spawned: '灾厄魔主循裂界降临，化外身封锁星路。',
      overlord_battle: `${playerName}对灾厄魔主造成 ${formatMagnitude(entry.damage)} 伤害。`,
      overlord_revived: '魔主返命功法触发，解除控制并以全盛状态再度行动。',
      decision_opened: `${playerName}击破魔主复生之身，本源进入处置窗口。`,
      overlord_fate_chosen: fate === 'refine' || fate === 'refined'
        ? '魔主本源已被炼化，按 0.5 人权重计入战果。'
        : '魔主本源已被彻底诛灭。',
      purge_started: '彼岸古文明清剿阵列锁定先天至宝因果。',
      purge_advanced: `清剿阵列已经推进至${star}。`,
      purge_occupied: `${star}失守，清剿阵列开始改写当地法则。`,
      star_occupied: `${star}失守，清剿阵列开始改写当地法则。`,
      purge_defense: `${playerName}补强守星防线，当前防御 ${finiteNumber(entry.defense)}。`,
      threat_resolved: '全服防线稳固，星域威胁已经解除。',
      treasure_signaled: `${entry.treasureName || '先天至宝'}因果暴露，彼岸观测者完成锁定。`,
    };
    return messages[type] || String(entry.title || '彼岸因果发生变化。');
  }

  function setProgress(selector, fillSelector, progress) {
    const element = $(selector);
    const value = clampPercent(progress);
    element?.setAttribute('aria-valuenow', String(Math.round(value)));
    const fill = $(fillSelector);
    if (fill) fill.style.width = `${value}%`;
  }

  function renderThreatHistory(history) {
    const list = $('#threat-history');
    if (!list) return;
    const items = (history || []).slice(-2).reverse().map(threatHistoryText).filter(Boolean);
    list.replaceChildren(...items.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
  }

  function threatTargetNode(threat = state?.threat) {
    if (!threat) return null;
    const id = threat.phase === 'purge' || threat.phase === 'resolved'
      ? threat.purge.currentStarId || threat.starId
      : threat.starId;
    return resolveThreatNode(id) || resolveThreatNode(threat.starId);
  }

  function expeditionTargetId(action) {
    const expedition = state?.expedition;
    if (!expedition) return selectedId;
    if (action === 'expedition_rescue') {
      const rescue = expedition.rescueTargets[0];
      return String(rescue?.userId ?? rescue?.id ?? expedition.starId ?? selectedId);
    }
    if (action === 'lost_cache_recover') {
      const cache = expedition.lostCaches[0];
      return String(cache?.cacheId ?? cache?.id ?? expedition.starId ?? selectedId);
    }
    return action === 'expedition_enter'
      ? selectedId
      : String(expedition.starId ?? selectedId ?? state.player.positionId);
  }

  function trueWorldTargetId(action = '') {
    const trueWorld = state?.trueWorld;
    if (action === 'true_world_claim') {
      const pending = trueWorld?.viewer?.pendingClaims;
      if (Array.isArray(pending) && pending.length) return String(pending[0].claimId || '');
      const loot = Array.isArray(trueWorld?.loot) ? trueWorld.loot : [];
      const claim = loot.find(item => item?.claimId);
      if (claim?.claimId) return String(claim.claimId);
    }
    return String(trueWorldSelectedSectorId || trueWorld?.currentSectorId || trueWorld?.center || '0,0');
  }

  function ancientEventTargetId() {
    return String(selectedAncientEvent()?.id || state?.ancientEvents?.activeEventId || '');
  }

  function daoForgeTargetId(action = '') {
    if (action === 'dao_forge_claim') return String(state?.daoForge?.forge?.forgeId || '');
    const recipe = selectedDaoForgeRecipe();
    const selection = daoForgeSelection(recipe);
    return recipe ? `${recipe.id}|${selection.entries.join(',')}` : '';
  }

  function renderThreat() {
    const threat = state?.threat;
    const strip = $('#threat-strip');
    const consolePanel = $('#threat-console');
    strip.hidden = !threat;
    consolePanel.hidden = !threat;
    if (!threat) return;

    const model = threatProgressModel(threat);
    const phaseLabel = THREAT_PHASE_LABELS[threat.phase];
    strip.dataset.phase = threat.phase;
    consolePanel.dataset.phase = threat.phase;
    setText('#threat-phase-label', phaseLabel);
    setText('#threat-console-phase', `全服威胁 · ${phaseLabel}`);
    setText('#threat-strip-title', threat.title);
    setText('#threat-title', threat.title);
    setText('#threat-strip-summary', model.summary);
    setText('#threat-strip-progress-text', model.value);
    setText('#threat-event-id', threat.eventId);
    setText('#threat-primary-label', model.label);
    setText('#threat-primary-value', model.value);
    setText('#threat-detail', model.detail);
    setProgress('#threat-strip-progress', '#threat-strip-progress-fill', model.progress);
    setProgress('#threat-progress', '#threat-progress-fill', model.progress);

    const eraLord = escalationActive(threat.escalation?.eraLord);
    const hyperdimensional = escalationActive(threat.escalation?.hyperdimensional);
    const eraMark = $('#era-lord-mark');
    const hyperMark = $('#hyperdimensional-mark');
    eraMark.hidden = !eraLord;
    hyperMark.hidden = !hyperdimensional;
    eraMark.textContent = eraLord ? escalationName(threat.escalation.eraLord, '纪元') : '纪元';
    hyperMark.textContent = hyperdimensional ? escalationName(threat.escalation.hyperdimensional, '超维') : '超维';

    const metrics = threat.phase === 'calamity'
      ? [['个人击杀', threat.viewer.calamityKill], ['剩余灾厄', Math.max(0, threat.killTarget - threat.killCount)], ['事件坐标', threatTargetNode(threat)?.name || threat.starId]]
      : threat.phase === 'overlord'
        ? [['个人伤害', formatMagnitude(threat.overlord.viewerDamage)], ['返命功法', threat.overlord.revived ? '已触发' : '未触发'], ['处置节点', '击破魔主']]
        : threat.phase === 'decision'
          ? [['处置资格', threat.viewer.canExecute || threat.viewer.canRefine ? '已取得' : '待取得'], ['炼化权重', `${threat.decision.refinementWeight} 人`], ['清剿预兆', '因果锁定']]
          : threat.phase === 'purge'
            ? [['守星贡献', threat.viewer.defenseContribution], ['推进节点', `${threat.purge.step}/${threat.purge.totalSteps}`], ['下次推进', formatAdvanceTime(threat.purge.nextAdvanceAt)]]
            : [['灾厄击杀', threat.viewer.calamityKill], ['守星贡献', threat.viewer.defenseContribution], ['战果状态', threat.viewer.canClaim ? '待领取' : '已领取']];
    metrics.forEach((metric, index) => {
      const suffix = ['one', 'two', 'three'][index];
      setText(`#threat-metric-${suffix}-label`, metric[0]);
      setText(`#threat-metric-${suffix}`, metric[1]);
    });

    const actionStates = {
      challenge: ['calamity', 'overlord'].includes(threat.phase) && threat.viewer.canChallenge,
      execute: threat.phase === 'decision' && threat.viewer.canExecute && threat.decision.canExecute,
      refine: threat.phase === 'decision' && threat.viewer.canRefine && threat.decision.canRefine,
      defend: threat.phase === 'purge' && threat.viewer.canDefend,
      claim: threat.viewer.canClaim,
    };
    document.querySelectorAll('[data-threat-action]').forEach(button => {
      const action = button.dataset.threatAction;
      button.disabled = busy || !actionStates[action];
      button.classList.toggle('is-busy', busy && activeAction === action);
      button.setAttribute('aria-busy', String(busy && activeAction === action));
    });
    $('#focus-threat').disabled = !threatTargetNode(threat);
    renderThreatHistory(threat.history);
  }

  function formatRemaining(value) {
    if (!value) return '';
    const remaining = new Date(value).getTime() - Date.now();
    if (!Number.isFinite(remaining)) return '';
    if (remaining <= 0) return '已就绪';
    if (remaining < 60000) return `${Math.max(1, Math.ceil(remaining / 1000))} 秒`;
    return `${Math.ceil(remaining / 60000)} 分钟`;
  }

  function replaceTextList(selector, values, emptyText = '') {
    const list = $(selector);
    if (!list) return;
    const content = values.length ? values : emptyText ? [emptyText] : [];
    list.replaceChildren(...content.map(value => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
  }

  function renderExpedition(selected) {
    const expedition = state?.expedition;
    if (!expedition) return;
    const panel = $('#expedition-console');
    const phase = expedition.evacuation.ready
      ? 'ready'
      : expedition.downed.active
        ? 'downed'
        : expedition.evacuation.active
          ? 'evacuating'
          : expedition.active
            ? 'active'
            : expedition.campaign.complete
              ? 'settled'
              : 'empty';
    panel.dataset.phase = phase;

    setText('#expedition-title', expedition.exists ? expedition.campaign.title : '未建立远征');
    setText('#expedition-run-id', expedition.active || expedition.campaign.complete ? expedition.runId : 'IDLE');
    setText('#expedition-stage-name', expedition.stage.name);
    setText('#expedition-stage-count', expedition.stage.total ? `${expedition.stage.number} / ${expedition.stage.total}` : '0 / 0');
    setProgress('#expedition-progress', '#expedition-progress-fill', expedition.campaign.progress);
    setText('#expedition-brief', expedition.campaign.unlocked === false
      ? expedition.campaign.lockedReason || '前置战役尚未完成。'
      : expedition.active
        ? `${expedition.campaign.status === 'active' || expedition.campaign.status === 'idle' ? '远征进行中' : expedition.campaign.status} · 当前大星行动由全服探索态势共同推进。`
        : expedition.campaign.complete
          ? '本轮星域行动已完成，远征记录保留在彼岸古史。'
          : expedition.exists
            ? '星锚稳定后可建立个人远征，全服共享区域首领气血。'
            : '当前大星尚未显化区域战役。');

    const camp = expedition.camp;
    setText('#camp-tier', camp.established ? `L${camp.level} / ${camp.maxLevel}` : '未建立');
    setText('#camp-name', camp.name);
    setText('#camp-status', camp.established ? `防御 ${Math.round(camp.defense)} / ${Math.round(camp.maxDefense)} · 星锚在线` : '驻点信号未落定');
    setProgress('#camp-defense', '#camp-defense-fill', camp.established ? camp.defense / camp.maxDefense * 100 : 0);

    const bag = expedition.tacticalBag;
    setText('#bag-capacity', `${Math.round(bag.used)} / ${Math.round(bag.capacity)}`);
    setText('#bag-summary', bag.items.length
      ? `${bag.items.length} 类未结算物资${bag.secured ? ` · 已封存 ${Math.round(bag.secured)}` : ''}`
      : bag.secured
        ? `${Math.round(bag.secured)} 份物资已封存`
        : '尚无未结算战利品');
    replaceTextList('#bag-items', bag.items.slice(0, 2).map(item => `${item.name} × ${item.quantity}`), '行囊净空');
    setProgress('#bag-load', '#bag-load-fill', bag.capacity ? bag.used / bag.capacity * 100 : 0);

    let alertTone = 'quiet';
    let alertTitle = '前线静默';
    let alertCopy = '未发现撤离、失联或遗失行囊信号。';
    if (expedition.evacuation.ready) {
      alertTone = 'ready';
      alertTitle = '撤离战果待领取';
      alertCopy = expedition.evacuation.forced
        ? '强制撤离已经完成，部分未封存物资留在原星。'
        : '维度通道已经闭合，远征战果可进行最终结算。';
    } else if (expedition.downed.active) {
      alertTone = 'danger';
      alertTitle = '道躯失联';
      alertCopy = `等待同星修士救援${formatRemaining(expedition.downed.expiresAt) ? ` · ${formatRemaining(expedition.downed.expiresAt)}` : ''}`;
    } else if (expedition.evacuation.active) {
      alertTone = 'warning';
      alertTitle = '撤离通道构筑中';
      alertCopy = `星锚正在固定维度坐标${formatRemaining(expedition.evacuation.completesAt) ? ` · ${formatRemaining(expedition.evacuation.completesAt)}` : ''}`;
    } else if (expedition.lostCache.active) {
      alertTone = 'warning';
      alertTitle = '遗失行囊信号';
      alertCopy = `${expedition.lostCache.itemCount} 份物资留在原星${formatRemaining(expedition.lostCache.expiresAt) ? ` · ${formatRemaining(expedition.lostCache.expiresAt)}` : ''}`;
    } else if (expedition.rescueTargets.length) {
      alertTone = 'signal';
      alertTitle = '同星求援';
      alertCopy = `${expedition.rescueTargets.length} 道失联神念仍在当前区域回响。`;
    } else if (expedition.lostCaches.length) {
      alertTone = 'signal';
      alertTitle = '遗失行囊可追回';
      alertCopy = `${expedition.lostCaches.length} 道同星缓存信号仍可定位。`;
    } else if (expedition.active) {
      alertTone = 'stable';
      alertTitle = '远征信号稳定';
      alertCopy = camp.established ? '营地星锚在线，临时物资通道保持畅通。' : '区域落点已建立，前线营地尚未成形。';
    }
    const alert = $('#expedition-alert');
    alert.dataset.tone = alertTone;
    setText('#expedition-alert-title', alertTitle);
    setText('#expedition-alert-copy', alertCopy);

    const flags = [];
    if (camp.established) flags.push(`营地 L${camp.level}`);
    if (expedition.downed.active) flags.push('濒危');
    if (expedition.evacuation.active) flags.push(expedition.evacuation.ready ? '待结算' : '撤离中');
    if (expedition.rescueTargets.length) flags.push(`${expedition.rescueTargets.length} 求援`);
    if (expedition.lostCaches.length) flags.push(`${expedition.lostCaches.length} 可追回`);
    if (expedition.lostCache.active) flags.push(`${expedition.lostCache.itemCount} 遗失`);
    const campaignChain = expedition.campaign.chain || [];
    if (campaignChain.length) {
      const cleared = campaignChain.filter(entry => entry.viewerCleared).length;
      flags.push(`沧澜主线 ${cleared}/${campaignChain.length}`);
    }
    if (expedition.campaign.unlocked === false) flags.push('前置锁定');
    const flagBox = $('#expedition-flags');
    flagBox.replaceChildren(...flags.map(text => {
      const flag = document.createElement('span');
      flag.textContent = text;
      return flag;
    }));

    const actionStates = {
      expedition_enter: expedition.viewer.canEnter
        && Boolean(selected && selected.id === expedition.starId && selected.status !== 'unseen'),
      camp_build: expedition.viewer.canBuildCamp,
      campaign_advance: expedition.viewer.canAdvance,
      bag_deposit: expedition.viewer.canDeposit,
      expedition_rescue: expedition.viewer.canRescue && expedition.rescueTargets.length > 0,
      lost_cache_recover: expedition.viewer.canRecoverLostCache && expedition.lostCaches.length > 0,
      evacuation_start: expedition.viewer.canEvacuate,
      evacuation_force: expedition.viewer.canForceEvacuate,
      expedition_claim: expedition.viewer.canClaim,
    };
    document.querySelectorAll('[data-expedition-action]').forEach(button => {
      const action = button.dataset.expeditionAction;
      button.disabled = busy || !actionStates[action];
      button.classList.toggle('is-busy', busy && activeAction === action);
      button.setAttribute('aria-busy', String(busy && activeAction === action));
    });
  }

  function routeNote(selected, cost) {
    if (!selected) return '选择大星后显化航路。';
    if (cost.distance === 0) return '神念已抵达此星。';
    if (cost.cost > state.player.mind) return `心神不足，尚差 ${cost.cost - state.player.mind} 点。`;
    if (cost.unknown === 0) return '航路均已锚定，本次不消耗心神。';
    if (cost.denominator > 1 && cost.remainder > 0) return `跨越 ${cost.unknown} 格未锚星域，余程记为 ${cost.remainder}/${cost.denominator}。`;
    return `跨越 ${cost.unknown} 格未锚星域，航路可达。`;
  }

  const TRUE_WORLD_STATUS_LABELS = {
    unseen: '未观测',
    observed: '已观测',
    explored: '已探明',
    active: '敌群活跃',
    defeated: '敌群已清除',
    idle: '等待敌群',
    locked: '入口未开',
  };

  const TRUE_WORLD_TIER_LABELS = {
    true_immortal: '真仙',
    immortal_king: '仙王',
    immortal_king_giant: '仙王巨头',
    quasi_immortal_emperor: '准仙帝',
  };

  function trueWorldStatusLabel(value) {
    const key = String(value || '').toLowerCase();
    return TRUE_WORLD_STATUS_LABELS[key] || (key ? key : '待命');
  }

  function ancientEventStatusLabel(value) {
    return ({ locked: '前置锁定', active: '全服推进中', completed: '古史已复原' })[String(value || '').toLowerCase()] || '状态未知';
  }

  function formatForgeClock(value) {
    const remaining = Math.max(0, Math.trunc(finiteNumber(value)));
    const seconds = Math.ceil(remaining / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const rest = seconds % 60;
    return [hours, minutes, rest].map(part => String(part).padStart(2, '0')).join(':');
  }

  function selectedAncientEvent() {
    const ancient = state?.ancientEvents;
    if (!ancient?.events?.length) return null;
    const id = ancientEventSelectedId && ancient.events.some(event => event.id === ancientEventSelectedId)
      ? ancientEventSelectedId
      : ancient.activeEventId || ancient.events.find(event => event.viewer.canClaim)?.id || ancient.events[0].id;
    ancientEventSelectedId = id;
    return ancient.events.find(event => event.id === id) || ancient.events[0];
  }

  function renderAncientEvents() {
    const panel = $('#ancient-event-console');
    const ancient = state?.ancientEvents;
    if (!panel) return;
    panel.hidden = !ancient?.exists;
    if (!ancient?.exists) return;
    const event = selectedAncientEvent();
    setText('#ancient-event-count', `${ancient.completedCount} / ${Math.max(ancient.eventCount, ancient.events.length)}`);
    const track = $('#ancient-event-track');
    if (track) {
      track.replaceChildren(...ancient.events.map(entry => {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'tab';
        button.dataset.ancientEventId = entry.id;
        button.dataset.status = entry.status;
        button.className = entry.id === event?.id ? 'is-current' : '';
        button.setAttribute('aria-selected', String(entry.id === event?.id));
        button.title = `${entry.name} · ${entry.coordinate}`;
        const order = document.createElement('b');
        order.textContent = String(entry.order).padStart(2, '0');
        const name = document.createElement('span');
        name.textContent = entry.name;
        const progress = document.createElement('small');
        progress.textContent = entry.status === 'completed' ? '完成' : entry.status === 'locked' ? '锁定' : `${Math.round(entry.progressPercent)}%`;
        button.append(order, name, progress);
        button.addEventListener('click', () => {
          ancientEventSelectedId = entry.id;
          renderAncientEvents();
        });
        return button;
      }));
    }
    if (!event) return;
    panel.dataset.status = event.status;
    setText('#ancient-event-status', ancientEventStatusLabel(event.status));
    setText('#ancient-event-name', event.name);
    setText('#ancient-event-coordinate', event.coordinate);
    setText('#ancient-event-copy', event.description);
    setText('#ancient-event-contribution', `全服 ${event.progress} / ${event.contributionRequired}`);
    setText('#ancient-event-viewer', `个人 ${event.viewer.contribution} · ${event.contributorCount} 人留痕`);
    setText('#ancient-event-opposition', `敌对：${event.opposition.length ? event.opposition.join(' · ') : '尚未观测'}`);
    setProgress('.ancient-event-progress', '#ancient-event-progress-fill', event.progressPercent);
    document.querySelectorAll('[data-ancient-event-action]').forEach(button => {
      const action = button.dataset.ancientEventAction;
      const allowed = action === 'ancient_event_contribute' ? event.viewer.canContribute : event.viewer.canClaim;
      button.disabled = busy || !allowed;
      button.classList.toggle('is-busy', busy && activeAction === action);
      button.setAttribute('aria-busy', String(busy && activeAction === action));
    });
  }

  function selectedDaoForgeRecipe() {
    const forgeState = state?.daoForge;
    if (!forgeState?.recipes?.length) return null;
    const activeRecipeId = forgeState.forge && forgeState.forge.status !== 'claimed' ? forgeState.forge.recipeId : '';
    const id = activeRecipeId || (
      daoForgeSelectedRecipeId && forgeState.recipes.some(recipe => recipe.id === daoForgeSelectedRecipeId)
        ? daoForgeSelectedRecipeId
        : forgeState.recipes.find(recipe => recipe.known && recipe.ready && !recipe.unavailable)?.id || forgeState.recipes[0].id
    );
    daoForgeSelectedRecipeId = id;
    return forgeState.recipes.find(recipe => recipe.id === id) || forgeState.recipes[0];
  }

  function daoForgeSelectionRule(recipeId) {
    if (recipeId === 'three-innate-erasure') return { kind: 'treasure', count: 3, label: '投入先天至宝' };
    if (recipeId === 'dao-fruit-five-treasure') return { kind: 'treasure', count: 5, label: '指定五件先天至宝' };
    if (recipeId === 'return-truth-edit') return { kind: 'authority', count: 3, label: '编辑强化权柄' };
    return { kind: 'locked', count: 0, label: '彼岸古法正文' };
  }

  function daoForgeSelection(recipe) {
    const rule = daoForgeSelectionRule(recipe?.id);
    let entries = [];
    if (rule.kind === 'treasure') {
      const selected = daoForgeTreasureSelections.get(recipe.id) || new Set();
      daoForgeTreasureSelections.set(recipe.id, selected);
      entries = [...selected];
    } else if (rule.kind === 'authority') {
      entries = daoForgeAuthorityDraft.split(/[、,，]/).map(value => value.trim()).filter(Boolean);
    }
    return {
      ...rule,
      entries,
      valid: rule.count > 0 && entries.length === rule.count && new Set(entries).size === rule.count,
    };
  }

  function forgeRecordSelections(forge) {
    const consumed = Array.isArray(forge?.consumption?.innateTreasures) ? forge.consumption.innateTreasures : [];
    const preserved = Array.isArray(forge?.output?.preservedInnateTreasures) ? forge.output.preservedInnateTreasures : [];
    const authorities = Array.isArray(forge?.output?.authorities) ? forge.output.authorities : [];
    return [...consumed, ...preserved, ...authorities]
      .map(entry => String(entry && typeof entry === 'object' ? entry.name ?? entry.id ?? '' : entry || '').trim())
      .filter(Boolean);
  }

  function renderDaoForgeSelection(recipe, forgeState, active) {
    const selection = daoForgeSelection(recipe);
    const options = $('#dao-forge-treasure-options');
    const authorityField = $('#dao-forge-authority-field');
    const authorityInput = $('#dao-forge-authorities');
    const authorityOptions = $('#dao-forge-authority-options');
    if (authorityOptions) {
      authorityOptions.replaceChildren(...(forgeState.authorityOptions || []).map(authority => {
        const option = document.createElement('option');
        option.value = authority.cooldownKey || authority.name;
        option.label = `${authority.sourceTreasureName} · ${authority.name}`;
        return option;
      }));
    }
    setText('#dao-forge-selection-label', active ? '本炉投入已经锁定' : selection.label);
    const lockedEntries = active ? forgeRecordSelections(forgeState.forge) : [];
    setText('#dao-forge-selection-count', active
      ? `${lockedEntries.length} 项`
      : selection.count ? `${selection.entries.length} / ${selection.count}` : 'LOCKED');
    authorityField.hidden = active || selection.kind !== 'authority';
    if (authorityInput && authorityInput.value !== daoForgeAuthorityDraft) authorityInput.value = daoForgeAuthorityDraft;
    if (!options) return selection;
    if (active) {
      const summary = document.createElement('p');
      summary.className = 'dao-forge-locked-selection';
      summary.textContent = lockedEntries.length ? lockedEntries.join(' · ') : '大道权柄正在炉中重排';
      options.replaceChildren(summary);
      return selection;
    }
    if (selection.kind !== 'treasure') {
      options.replaceChildren();
      return selection;
    }
    const selected = daoForgeTreasureSelections.get(recipe.id);
    const owned = forgeState.ownedInnateTreasures;
    for (const name of [...selected]) if (!owned.includes(name)) selected.delete(name);
    options.replaceChildren(...owned.map(name => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = name;
      input.checked = selected.has(name);
      input.disabled = !input.checked && selected.size >= selection.count;
      const text = document.createElement('span');
      text.textContent = name;
      input.addEventListener('change', () => {
        if (input.checked) selected.add(name);
        else selected.delete(name);
        renderDaoForge();
      });
      label.append(input, text);
      return label;
    }));
    selection.entries = [...selected];
    selection.valid = selection.entries.length === selection.count;
    setText('#dao-forge-selection-count', `${selection.entries.length} / ${selection.count}`);
    return selection;
  }

  function renderDaoForge() {
    const panel = $('#dao-forge-console');
    const forgeState = state?.daoForge;
    if (!panel) return;
    panel.hidden = !forgeState?.exists;
    if (!forgeState?.exists) return;
    const recipe = selectedDaoForgeRecipe();
    const forge = forgeState.forge;
    const active = forge && forge.status !== 'claimed';
    const selection = renderDaoForgeSelection(recipe, forgeState, active);
    const progress = forge
      ? clampPercent(forge.readyAt > forge.startedAt
        ? (Date.now() - forge.startedAt) / (forge.readyAt - forge.startedAt) * 100
        : forge.progress)
      : 0;
    const remainingMs = forge?.status === 'forging'
      ? Math.max(0, (forge.readyAt || Date.now() + forge.remainingMs) - Date.now())
      : 0;
    const status = forge?.status || 'idle';
    const statusLabel = ({ idle: '待开炉', forging: '炼制中', ready: '可出炉', claimed: '已收取' })[status] || status;
    panel.dataset.status = status;
    setText('#dao-forge-status', statusLabel);
    const recipes = $('#dao-forge-recipes');
    if (recipes) {
      recipes.replaceChildren(...forgeState.recipes.map(entry => {
        const button = document.createElement('button');
        button.type = 'button';
        button.role = 'tab';
        button.dataset.daoForgeRecipe = entry.id;
        button.className = entry.id === recipe?.id ? 'is-current' : '';
        button.setAttribute('aria-selected', String(entry.id === recipe?.id));
        button.disabled = Boolean(active && entry.id !== forge.recipeId);
        button.title = entry.unavailable ? '此法正文尚未补全' : entry.known ? entry.description : '尚未掌握此炼制法';
        const number = document.createElement('b');
        number.textContent = String(entry.index).padStart(2, '0');
        const name = document.createElement('span');
        name.textContent = entry.name;
        const mark = document.createElement('small');
        mark.textContent = entry.unavailable ? '缺卷' : !entry.known ? '未悟' : entry.ready ? '可炼' : '缺材';
        button.append(number, name, mark);
        button.addEventListener('click', () => {
          daoForgeSelectedRecipeId = entry.id;
          renderDaoForge();
        });
        return button;
      }));
    }
    if (!recipe) return;
    setText('#dao-forge-recipe-name', forge?.recipeName || recipe.name);
    setText('#dao-forge-timer', status === 'forging' ? formatForgeClock(remainingMs) : status === 'ready' ? '00:00:00' : '24:00:00');
    setText('#dao-forge-recipe-copy', forge ? `${forge.treasureName}正在炉中重排大道权柄。` : recipe.description);
    const missing = recipe.missing.map(entry => String(entry?.label || entry?.name || entry)).filter(Boolean);
    const requirement = recipe.unavailable
      ? '彼岸古法正文尚未补全'
      : !recipe.known
        ? '尚未从准仙帝战果或古文明记录中悟得此法'
        : missing.length
          ? `缺少：${missing.join(' · ')}`
          : selection.valid || active
            ? `条件齐备 · 已持有 ${forgeState.ownedInnateTreasures.length} 件先天至宝`
            : `还需指定 ${Math.max(0, selection.count - selection.entries.length)} 项${selection.kind === 'authority' ? '强化权柄' : '先天至宝'}`;
    setText('#dao-forge-requirements', requirement);
    setProgress('.dao-forge-progress', '#dao-forge-progress-fill', status === 'ready' || status === 'claimed' ? 100 : progress);
    document.querySelectorAll('[data-dao-forge-action]').forEach(button => {
      const action = button.dataset.daoForgeAction;
      const allowed = action === 'dao_forge_start'
        ? !active && recipe.known && recipe.ready && !recipe.unavailable && selection.valid
        : Boolean(forge?.canClaim || status === 'ready');
      button.disabled = busy || !allowed;
      button.classList.toggle('is-busy', busy && activeAction === action);
      button.setAttribute('aria-busy', String(busy && activeAction === action));
    });
  }

  function renderTrueWorld() {
    const panel = $('#true-world-console');
    if (!panel) return;
    const progression = state?.progression || {};
    const progressionLayer = (progression.layers || []).find(layer => layer.id === 'true_world');
    const tw = state?.trueWorld;
    const visible = Boolean(tw?.exists || progression.currentLayer === 'true_world' || progressionLayer?.unlocked === true);
    panel.hidden = !visible;
    if (!visible || !tw) return;

    const unlocked = tw.unlocked !== false && progressionLayer?.unlocked !== false;
    panel.dataset.phase = unlocked ? String(tw.enemy?.status || 'idle') : 'locked';
    setText('#true-world-title', unlocked ? tw.title : '真世界未接驳');
    setText('#true-world-coordinate', unlocked ? tw.currentSectorId : 'LOCKED');
    const global = tw.global || {};
    const viewer = tw.viewer || {};
    const explored = Math.max(0, Math.trunc(finiteNumber(global.exploredCount)));
    const sectorCount = Math.max(1, Math.trunc(finiteNumber(tw.sectorCount, TRUE_WORLD_SECTOR_COUNT)));
    const observed = Math.max(0, Math.trunc(finiteNumber(global.observedCount)));
    setText('#true-world-explored', `${explored} / ${sectorCount}`);
    setText('#true-world-observed', `观测 ${observed}`);
    setText('#true-world-era', formatMagnitude(global.eraAccumulation));
    setText('#true-world-quasi', `准仙帝 ${Math.max(0, Math.trunc(finiteNumber(global.quasiImmortalEmperorDefeated)))}`);
    setText('#true-world-player-era', formatMagnitude(viewer.eraAccumulation));
    setText('#true-world-victories', `胜场 ${Math.max(0, Math.trunc(finiteNumber(viewer.victories?.total, viewer.victories?.count)))}`);
    setProgress('.true-world-progress', '#true-world-progress-fill', global.progressPercent);

    const sectors = Array.isArray(tw.sectors) ? tw.sectors : [];
    const selectedId = trueWorldSelectedSectorId && (sectors.some(sector => sector.id === trueWorldSelectedSectorId) || trueWorldSelectedSectorId === tw.currentSectorId)
      ? trueWorldSelectedSectorId
      : tw.currentSectorId;
    trueWorldSelectedSectorId = selectedId;
    const selected = sectors.find(sector => sector.id === selectedId) || tw.currentSector || { id: selectedId, name: '真世界扇区', status: 'unseen' };
    const encounter = selected.encounter && typeof selected.encounter === 'object' ? selected.encounter : (selected.id === tw.currentSectorId ? tw.enemy : null);
    const enemy = selected.id === tw.currentSectorId && tw.enemy ? tw.enemy : encounter || {};
    const sectorProgress = Math.max(0, finiteNumber(selected.progress));
    const sectorRequired = Math.max(1, finiteNumber(selected.progressRequired, 1));
    setText('#true-world-sector-badge', `${trueWorldStatusLabel(selected.status)} · ${sectorProgress}/${sectorRequired}`);
    setText('#true-world-sector-title', selected.name || selected.biomeName || `真世界扇区 ${selected.id}`);
    setText('#true-world-sector-threat', `危 ${Math.max(0, Math.trunc(finiteNumber(selected.threat)))}`);
    setText('#true-world-sector-copy', selected.biomeDescription || selected.landmark?.lore || (unlocked ? '神念尚未解析该扇区的文明回声。' : '完成沧澜界关键战役后，真世界入口将显化。'));
    const enemyBox = $('#true-world-enemy');
    const enemyStatus = String(enemy.status || 'idle').toLowerCase();
    enemyBox?.setAttribute('data-status', enemyStatus);
    setText('#true-world-enemy-tier', enemy.tier ? (TRUE_WORLD_TIER_LABELS[enemy.tier] || enemy.tier) : '当前敌群');
    setText('#true-world-enemy-name', enemy.name || '尚未生成');
    setText('#true-world-enemy-realm', enemy.sameRealmMutant ? `${enemy.realmName || '--'} · 同源变异` : (enemy.realmName || '--'));
    const enemyHp = Math.max(0, finiteNumber(enemy.currentHp));
    const enemyMaxHp = Math.max(enemyHp, finiteNumber(enemy.maxHp));
    setText('#true-world-enemy-health', enemyMaxHp > 0 ? `${formatMagnitude(enemyHp)} / ${formatMagnitude(enemyMaxHp)}` : '--');

    const frontier = [];
    const seen = new Set();
    [...sectors, ...(Array.isArray(tw.frontier) ? tw.frontier : [])].forEach(entry => {
      const id = normalizeTrueWorldCoordinate(entry, '');
      if (!id || seen.has(id)) return;
      seen.add(id);
      const sector = typeof entry === 'object' && entry
        ? { ...entry, id }
        : sectors.find(item => item.id === id) || { id, name: `真世界扇区 ${id}`, status: 'unseen' };
      if (id !== selectedId) frontier.push(sector);
    });
    const frontierBox = $('#true-world-frontier');
    if (frontierBox) {
      frontierBox.replaceChildren(...frontier.slice(0, 8).map(sector => {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.trueWorldSector = sector.id;
        item.className = `true-world-sector-chip status-${String(sector.status || 'unseen').toLowerCase()}`;
        item.textContent = `${sector.name || sector.id} · ${trueWorldStatusLabel(sector.status)}`;
        item.title = `${sector.id} · 选择目标扇区`;
        item.disabled = !unlocked;
        return item;
      }));
    }
    const loot = Array.isArray(tw.loot) && tw.loot.length ? tw.loot : (Array.isArray(viewer.loot) ? viewer.loot : []);
    const materialEntries = viewer.materials && typeof viewer.materials === 'object'
      ? Object.entries(viewer.materials).filter(([, amount]) => finiteNumber(amount) > 0).slice(0, 3).map(([name, amount]) => ({ id: name, name, quantity: amount }))
      : [];
    const lootBox = $('#true-world-loot');
    if (lootBox) {
      const entries = [...loot, ...materialEntries];
      lootBox.replaceChildren(...entries.slice(0, 5).map(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name || item.id || '战利品'} ×${Math.max(1, Math.trunc(finiteNumber(item.quantity, 1)))}`;
        return li;
      }));
    }
    const brief = !unlocked
      ? String((progressionLayer && (progressionLayer.entry || progressionLayer.description)) || '完成沧澜界战役与裂界母锚后开放。')
      : `半径 ${tw.radius} · ${sectorCount.toLocaleString('zh-CN')} 个扇区 · 全服共同探索${enemyStatus === 'active' ? ' · 敌群正在侵入' : ''}`;
    setText('#true-world-brief', brief);
    const actionStates = {
      true_world_observe: unlocked && viewer.canObserve && ['unseen', 'observed'].includes(String(selected.status).toLowerCase()),
      true_world_explore: unlocked && viewer.canObserve && selected.id === tw.currentSectorId && String(selected.status).toLowerCase() !== 'explored',
      true_world_move: unlocked && viewer.canMove && selected.id !== tw.currentSectorId,
      true_world_encounter: unlocked && viewer.canEncounter && selected.id === tw.currentSectorId && selected.status === 'explored',
      true_world_encounter_start: unlocked && viewer.canEncounter && selected.id === tw.currentSectorId && selected.status === 'explored',
      true_world_battle: unlocked && viewer.canEncounter && selected.id === tw.currentSectorId && enemyStatus === 'active',
      true_world_claim: unlocked && viewer.canClaim,
    };
    const observeButton = document.querySelector('[data-true-world-action="true_world_observe"], [data-true-world-action="true_world_explore"]');
    if (observeButton) {
      const exploreMode = selected.status === 'observed' && viewer.canExplore;
      observeButton.dataset.trueWorldAction = exploreMode ? 'true_world_explore' : 'true_world_observe';
      const label = observeButton.querySelector('span');
      if (label) label.textContent = exploreMode ? '开图' : '观测';
    }
    document.querySelectorAll('[data-true-world-action]').forEach(button => {
      const action = button.dataset.trueWorldAction;
      button.disabled = busy || !actionStates[action];
      button.classList.toggle('is-busy', busy && activeAction === action);
      button.setAttribute('aria-busy', String(busy && activeAction === action));
    });
    renderAncientEvents();
    renderDaoForge();
  }

  function renderProgression() {
    const progression = state?.progression;
    if (!progression) return;
    const layers = Array.isArray(progression.layers) ? progression.layers : [];
    const unlocked = layers.filter(layer => layer.unlocked === true).length;
    setText('#progression-title', layers.find(layer => layer.id === progression.currentLayer)?.name || '沧澜界');
    setText('#progression-layer-count', `${unlocked} / ${Math.max(3, layers.length)}`);
    const layerBox = $('#progression-layers');
    if (layerBox) {
      layerBox.replaceChildren(...layers.map(layer => {
        const item = document.createElement('button');
        item.type = 'button';
        item.dataset.layerId = layer.id;
        item.className = `${layer.unlocked ? 'is-unlocked' : 'is-locked'}${layer.id === progression.currentLayer ? ' is-current' : ''}`;
        item.textContent = layer.name;
        item.title = layer.unlocked ? '切换层级' : String(layer.entry || '尚未开放');
        item.disabled = layer.unlocked !== true;
        return item;
      }));
    }
    const materials = (progression.materials || []).slice(0, 5).map(material => `${material.name} ${material.baseQuantity}`);
    setText('#progression-materials', materials.length
      ? `大道至宝稳定材料：${materials.join(' · ')}`
      : '大道至宝稳定材料：随真世界探索逐步收录');
  }

  function render() {
    if (!state) return;
    story.syncPreferences();
    const player = state.player;
    const current = currentNode();
    let selected = getNode(selectedId);
    if (!selected) {
      selected = current;
      selectedId = current?.id || null;
    }
    currentRoute = routeBetween(current, selected);
    currentRouteCost = calculateRouteCost(currentRoute, player);
    const known = state.nodes.filter(node => STATUS_ORDER[node.status] >= STATUS_ORDER.explored).length;

    setText('#realm-name', player.realm);
    setText('#mind-value', player.mind);
    setText('#mind-max', `/ ${player.maxMind}`);
    setText('#pressure-value', state.pressure);
    setText('#known-count', known);
    setText('#connection-text', isPreview ? '预览星轨' : '星海已接驳');
    setText('#route-from', displayName(current));
    setText('#route-to', displayName(selected));
    setText('#route-distance', `${currentRouteCost.distance} 格`);
    setText('#route-unknown', `${currentRouteCost.unknown} 格`);
    setText('#route-cost', `${currentRouteCost.cost} 点`);
    setText('#panel-distance', `${currentRouteCost.distance} 格`);
    setText('#panel-cost', `${currentRouteCost.cost} 点`);
    setText('#route-note', routeNote(selected, currentRouteCost));

    const unseen = !selected || selected.status === 'unseen';
    const progress = explorationProgress(selected);
    setText('#star-status', selected ? selected.cleared ? '彻查' : STATUS_LABELS[selected.status] : '尚未定星');
    setText('#star-name', displayName(selected));
    renderPlanetPortrait(selected);
    const picker = $('#planet-select');
    picker.replaceChildren(...state.nodes.map(node => {
      const option = document.createElement('option');
      option.value = node.id;
      option.textContent = `${displayName(node)} · ${node.coordKey}`;
      return option;
    }));
    picker.value = selected?.id || '';
    setText('#star-coordinates', selected ? `星标 Q${signed(selected.q)} · R${signed(selected.r)}` : '沧澜星图等待神念');
    setText('#threat-mark', unseen ? '--' : `危${Number(selected.threat) || '?'}`);
    setText('#star-signal', selected ? (unseen ? '星雾遮断神念，只能确认一颗大星正在边界之后燃烧。' : selected.signal || selected.description) : '星海寂静，因果尚未落向任何坐标。');
    setText('#star-law', unseen ? '未解析' : selected.law);
    setText('#star-kind', unseen ? '未解析' : planetMaterial(selected).label);
    setText('#star-civilization', unseen ? '未解析' : selected.civilization);
    setText('#star-threat', unseen ? '未解析' : threatLabel(selected.threat));
    setText('#star-contribution', unseen
      ? '未解析'
      : progress.requirement === 0
        ? '无需贡献'
        : `${Math.min(progress.contribution, progress.requirement)} / ${progress.requirement}${selected.viewerContributed ? ' · 已留道痕' : ''}`);

    const atCurrent = selected && current && selected.id === current.id;
    const actionStates = {
      observe: Boolean(selected && current && selected.status === 'unseen' && axialDistance(current, selected) === 1),
      move: Boolean(selected && !atCurrent && currentRouteCost.cost <= player.mind),
      explore: Boolean(selected && atCurrent && !selected.viewerContributed && STATUS_ORDER[selected.status] <= STATUS_ORDER.explored && progress.contribution < progress.requirement),
      anchor: Boolean(selected && atCurrent && selected.status === 'explored' && progress.contribution >= progress.requirement),
    };
    document.querySelectorAll('[data-action]').forEach(button => {
      const action = button.dataset.action;
      button.disabled = busy || !actionStates[action];
      button.classList.toggle('is-busy', busy && activeAction === action);
    });
    renderThreat();
    renderExpedition(selected);
    renderProgression();
    renderTrueWorld();
    // 首屏和后台标签页也绘制一帧，持续动画仍在隐藏时暂停。
    draw(performance.now());
  }

  function renderPlanetPortrait(node) {
    if (!node) return;
    const material = planetMaterial(node);
    setText('#planet-type', material.label);
    setText('#planet-coordinate', `${signed(node.q)} / ${signed(node.r)}`);
    setText('#planet-visual-note', node.status === 'unseen' ? '星雾未散 · 表面尚待观测' : '星相演绎 · 非实测地貌');
    portrait.setAttribute('aria-label', `${displayName(node)}的${node.status === 'unseen' ? '未知轮廓' : '行星近景'}`);
    const key = `${node.id}:${node.status}:${node.kind}:${devicePixelRatio}`;
    if (key === portraitKey) return;
    portraitKey = key;
    const dpr = Math.min(2, devicePixelRatio || 1);
    portrait.width = 320 * dpr;
    portrait.height = 235 * dpr;
    const ctx = portrait.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, 320, 235);
    ctx.strokeStyle = 'rgba(199,167,95,.14)';
    ctx.lineWidth = .6;
    for (const r of [108, 139]) {
      ctx.beginPath(); ctx.ellipse(160, 116, r, r * .31, -.36, 0, Math.PI * 2); ctx.stroke();
    }
    planetPainter.draw(ctx, node, 160, 113, 86, { quality: 320 });
  }

  function signed(value) {
    const numeric = Number(value) || 0;
    return numeric > 0 ? `+${numeric}` : String(numeric);
  }

  function mapBounds() {
    const xs = BASE_NODES.map(node => node.x);
    const ys = BASE_NODES.map(node => node.y);
    return {
      minX: Math.min(...xs) - HEX_RADIUS,
      maxX: Math.max(...xs) + HEX_RADIUS,
      minY: Math.min(...ys) - HEX_RADIUS,
      maxY: Math.max(...ys) + HEX_RADIUS,
    };
  }

  const BOUNDS = mapBounds();

  function resetView() {
    if (!view.width || !view.height) return;
    const desktop = view.width > 760;
    const panelWidth = desktop ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 370 : 0;
    const areaLeft = 20;
    const areaRight = view.width - panelWidth - 20;
    const areaTop = desktop ? 214 : 246;
    const areaBottom = view.height - 110;
    const mapWidth = BOUNDS.maxX - BOUNDS.minX;
    const mapHeight = BOUNDS.maxY - BOUNDS.minY;
    camera.zoom = Math.max(.34, Math.min(1.18, (areaRight - areaLeft) / mapWidth, (areaBottom - areaTop) / mapHeight));
    camera.x = (areaLeft + areaRight) / 2 - ((BOUNDS.minX + BOUNDS.maxX) / 2) * camera.zoom;
    camera.y = (areaTop + areaBottom) / 2 - ((BOUNDS.minY + BOUNDS.maxY) / 2) * camera.zoom;
    camera.ready = true;
  }

  function resizeCanvas() {
    const rectangle = canvas.getBoundingClientRect();
    view.width = Math.max(1, rectangle.width);
    view.height = Math.max(1, rectangle.height);
    view.dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(view.width * view.dpr);
    canvas.height = Math.round(view.height * view.dpr);
    if (!camera.ready) resetView();
  }

  function screenToWorld(x, y) {
    return { x: (x - camera.x) / camera.zoom, y: (y - camera.y) / camera.zoom };
  }

  function setZoom(nextZoom, screenX = view.width / 2, screenY = view.height / 2) {
    const before = screenToWorld(screenX, screenY);
    camera.zoom = Math.max(.3, Math.min(2.5, nextZoom));
    camera.x = screenX - before.x * camera.zoom;
    camera.y = screenY - before.y * camera.zoom;
  }

  function traceHex(x, y, radius = HEX_RADIUS) {
    context.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = Math.PI / 180 * (60 * index - 30);
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (index === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
  }

  function drawBackground() {
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.fillStyle = PALETTE.void;
    context.fillRect(0, 0, view.width, view.height);
    const glow = context.createRadialGradient(view.width * .38, view.height * .48, 0, view.width * .38, view.height * .48, view.height * .68);
    glow.addColorStop(0, '#16272a55'); glow.addColorStop(.55, '#101b2228'); glow.addColorStop(1, '#09090800');
    context.fillStyle = glow; context.fillRect(0, 0, view.width, view.height);
    for (let i = 0; i < 240; i += 1) {
      const hash = nodeHash(i, 23);
      const x = (hash % 10000) / 10000 * view.width;
      const y = ((hash >>> 8) % 10000) / 10000 * view.height;
      context.globalAlpha = .15 + (hash % 5) * .075;
      context.fillStyle = i % 4 ? '#adbbb9' : '#c7a75f';
      context.fillRect(x, y, i % 17 ? .7 : 1.3, i % 17 ? .7 : 1.3);
    }
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(138,165,165,.07)';
    context.lineWidth = 1;
    for (let r = 1; r <= 3; r += 1) {
      context.beginPath();
      context.ellipse(view.width * .37, view.height * .52, view.height * (.2 + r * .16), view.height * (.16 + r * .11), -.25, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function purgeRouteNodes(threat = state?.threat) {
    if (!threat || !Array.isArray(threat.purge?.route)) return [];
    return threat.purge.route.map(resolveThreatNode).filter(Boolean);
  }

  function drawCampaignRoute(now) {
    const chain = state?.expedition?.campaign?.chain || [];
    const points = chain
      .map(entry => ({ entry, node: getNode(entry.starId) }))
      .filter(item => item.node);
    if (points.length < 2) return;
    context.save();
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const completed = current.entry.viewerCleared === true;
      context.beginPath();
      context.moveTo(previous.node.x, previous.node.y);
      context.lineTo(current.node.x, current.node.y);
      context.setLineDash(completed ? [] : [4 / camera.zoom, 7 / camera.zoom]);
      context.lineDashOffset = motionQuery.matches ? 0 : -now * .006 / camera.zoom;
      context.lineWidth = (completed ? 2.2 : 1.35) / camera.zoom;
      context.strokeStyle = completed ? PALETTE.goldBright : PALETTE.boneSoft;
      context.globalAlpha = completed ? .72 : current.entry.unlocked ? .38 : .18;
      context.stroke();
    }
    points.forEach(({ entry, node }) => {
      traceHex(node.x, node.y, 25);
      context.setLineDash([]);
      context.lineWidth = (entry.viewerCleared ? 2.2 : 1.2) / camera.zoom;
      context.strokeStyle = entry.viewerCleared ? PALETTE.goldBright : entry.unlocked ? PALETTE.gold : PALETTE.muted;
      context.globalAlpha = entry.viewerCleared ? .86 : .48;
      context.stroke();
    });
    context.restore();
  }

  function drawPurgeRoute(now) {
    const threat = state?.threat;
    if (!threat || !['purge', 'resolved'].includes(threat.phase)) return;
    const route = purgeRouteNodes(threat);
    if (route.length < 2) return;
    const step = Math.min(route.length - 1, Math.max(0, threat.purge.step));
    const phaseAlpha = threat.phase === 'resolved' ? .25 : 1;

    context.save();
    context.beginPath();
    route.forEach((node, index) => {
      if (index === 0) context.moveTo(node.x, node.y);
      else context.lineTo(node.x, node.y);
    });
    context.setLineDash([5 / camera.zoom, 8 / camera.zoom]);
    context.lineDashOffset = motionQuery.matches ? 0 : now * .012 / camera.zoom;
    context.lineWidth = 3.2 / camera.zoom;
    context.strokeStyle = PALETTE.cinnabar;
    context.globalAlpha = .26 * phaseAlpha;
    context.stroke();

    if (step > 0) {
      context.beginPath();
      route.slice(0, step + 1).forEach((node, index) => {
        if (index === 0) context.moveTo(node.x, node.y);
        else context.lineTo(node.x, node.y);
      });
      context.setLineDash([]);
      context.lineWidth = 2.4 / camera.zoom;
      context.strokeStyle = threat.phase === 'resolved' ? PALETTE.gold : PALETTE.cinnabar;
      context.globalAlpha = .9 * phaseAlpha;
      context.stroke();
    }

    const current = resolveThreatNode(threat.purge.currentStarId) || route[step];
    if (current) {
      const pulse = motionQuery.matches ? 0 : (Math.sin(now * .004) + 1) * 2;
      traceHex(current.x, current.y, 27 + pulse);
      context.setLineDash([]);
      context.lineWidth = 2 / camera.zoom;
      context.strokeStyle = threat.purge.occupied ? PALETTE.bone : PALETTE.cinnabar;
      context.globalAlpha = threat.phase === 'resolved' ? .34 : .92;
      context.stroke();
      if (threat.purge.occupied) {
        context.fillStyle = 'rgba(189,69,52,.22)';
        context.fill();
      }
    }
    context.restore();
  }

  function drawThreatMarkers(now) {
    const threat = state?.threat;
    const node = threatTargetNode(threat);
    if (!threat || !node) return;
    const resolved = threat.phase === 'resolved';
    const eraLord = escalationActive(threat.escalation?.eraLord);
    const hyperdimensional = escalationActive(threat.escalation?.hyperdimensional);
    const pulse = motionQuery.matches ? 0 : (Math.sin(now * .0032) + 1) * 2.8;
    const radius = threat.phase === 'overlord' || threat.phase === 'decision' ? 33 : 28;

    context.save();
    context.globalAlpha = resolved ? .34 : .95;
    context.strokeStyle = resolved ? PALETTE.gold : PALETTE.cinnabar;
    context.lineWidth = (threat.phase === 'overlord' || threat.phase === 'decision' ? 2.2 : 1.6) / camera.zoom;
    context.beginPath();
    context.arc(node.x, node.y, radius + pulse, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha *= .46;
    context.beginPath();
    context.arc(node.x, node.y, radius + 8 + pulse * .55, now * .0005, now * .0005 + Math.PI * 1.42);
    context.stroke();

    if (threat.phase === 'overlord' || threat.phase === 'decision') {
      context.globalAlpha = resolved ? .25 : .8;
      context.beginPath();
      for (let index = 0; index < 4; index += 1) {
        const angle = Math.PI / 2 * index + Math.PI / 4;
        context.moveTo(node.x + Math.cos(angle) * 38, node.y + Math.sin(angle) * 38);
        context.lineTo(node.x + Math.cos(angle) * 47, node.y + Math.sin(angle) * 47);
      }
      context.stroke();
    }

    if (eraLord) {
      context.globalAlpha = resolved ? .3 : .88;
      context.strokeStyle = PALETTE.goldBright;
      context.lineWidth = 1.4 / camera.zoom;
      traceHex(node.x, node.y, 40 + pulse * .3);
      context.stroke();
      context.beginPath();
      context.moveTo(node.x - 10, node.y - 44);
      context.lineTo(node.x, node.y - 51);
      context.lineTo(node.x + 10, node.y - 44);
      context.stroke();
    }

    if (hyperdimensional) {
      const size = 48 + pulse * .22;
      context.globalAlpha = resolved ? .28 : .9;
      context.strokeStyle = PALETTE.bone;
      context.lineWidth = 1.2 / camera.zoom;
      context.save();
      context.translate(node.x, node.y);
      context.rotate(Math.PI / 4 + (motionQuery.matches ? 0 : now * .00008));
      context.strokeRect(-size, -size, size * 2, size * 2);
      context.strokeStyle = PALETTE.cinnabar;
      context.globalAlpha *= .62;
      context.strokeRect(-size + 5, -size - 3, size * 2, size * 2);
      context.restore();
    }

    if (camera.zoom >= .5) {
      context.globalAlpha = resolved ? .45 : .9;
      context.fillStyle = hyperdimensional ? PALETTE.bone : eraLord ? PALETTE.goldBright : PALETTE.cinnabar;
      context.font = '800 7px Consolas, "Microsoft YaHei UI", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'bottom';
      const marker = hyperdimensional ? '超维干涉' : eraLord ? '纪元主宰' : THREAT_PHASE_LABELS[threat.phase];
      context.fillText(marker, node.x, node.y - (hyperdimensional ? 58 : eraLord ? 50 : 39), 70);
    }
    context.restore();
  }

  function drawRoute(now) {
    if (currentRoute.length < 2) return;
    const unaffordable = state && currentRouteCost.cost > state.player.mind;
    context.save();
    context.beginPath();
    currentRoute.forEach((node, index) => {
      if (index === 0) context.moveTo(node.x, node.y);
      else context.lineTo(node.x, node.y);
    });
    context.lineWidth = 2.1 / camera.zoom;
    context.setLineDash([8 / camera.zoom, 7 / camera.zoom]);
    context.lineDashOffset = motionQuery.matches ? 0 : -(now * .018) / camera.zoom;
    context.strokeStyle = unaffordable ? PALETTE.cinnabar : PALETTE.goldBright;
    context.globalAlpha = unaffordable ? .48 : .88;
    context.stroke();
    context.restore();
  }

  function starColor(node) {
    if (node.status === 'anchored') return PALETTE.goldBright;
    if (node.status === 'explored') return PALETTE.bone;
    if (node.status === 'observed') return PALETTE.cinnabar;
    return PALETTE.muted;
  }

  function drawNode(node, now) {
    const selected = getNode(selectedId)?.id === node.id;
    const current = currentNode()?.id === node.id;
    const unknown = node.status === 'unseen';
    const radius = unknown ? 12 : selected ? 27 : current ? 25 : 17 + (node.seed % 6);
    const color = starColor(node);
    context.save();
    if (selected || current) {
      context.strokeStyle = selected ? PALETTE.goldBright : 'rgba(199,167,95,.55)';
      context.lineWidth = .9 / camera.zoom;
      context.beginPath();
      context.arc(node.x, node.y, radius + 9, 0, Math.PI * 2);
      context.stroke();
      context.globalAlpha = .3;
      context.beginPath();
      context.arc(node.x, node.y, radius + 13, -.8, 3.8);
      context.stroke();
      context.globalAlpha = 1;
    }
    planetPainter.draw(context, node, node.x, node.y, radius, {
      quality: camera.zoom > 1.65 ? 256 : 112,
      opacity: unknown ? .6 : node.status === 'observed' ? .8 : 1,
    });
    if (node.status === 'anchored' || node.cleared) {
      context.fillStyle = PALETTE.goldBright;
      context.beginPath();
      context.moveTo(node.x, node.y - radius - 9);
      context.lineTo(node.x - 2.5, node.y - radius - 5);
      context.lineTo(node.x + 2.5, node.y - radius - 5);
      context.closePath(); context.fill();
    }
    if (Number(node.threat) >= 7 && !unknown) {
      context.strokeStyle = PALETTE.cinnabar;
      context.lineWidth = 1.7 / camera.zoom;
      context.beginPath(); context.arc(node.x, node.y, radius + 5, -.65, .65); context.stroke();
    }
    if ((!unknown && camera.zoom >= .53) || selected) {
      const labelY = node.y + radius + 9;
      context.textAlign = 'center'; context.textBaseline = 'top';
      context.font = '500 9px "Microsoft YaHei UI", sans-serif';
      context.fillStyle = '#090d10';
      const label = unknown ? '未探明古星' : String(node.name).slice(0, 8);
      const width = context.measureText(label).width;
      context.globalAlpha = .8;
      context.fillRect(node.x - width / 2 - 3, labelY - 2, width + 6, 14);
      context.globalAlpha = 1;
      context.fillStyle = selected ? PALETTE.goldBright : color;
      context.fillText(label, node.x, labelY, 78);
    }
    context.restore();
  }
  function travelPosition(now) {
    if (!travel || travel.route.length < 2) return null;
    const linear = Math.min(1, Math.max(0, (now - travel.startedAt) / 1000));
    const eased = linear < .5 ? 4 * linear * linear * linear : 1 - Math.pow(-2 * linear + 2, 3) / 2;
    const scaled = eased * (travel.route.length - 1);
    const index = Math.min(travel.route.length - 2, Math.floor(scaled));
    const local = Math.min(1, scaled - index);
    const from = travel.route[index];
    const to = travel.route[index + 1];
    return {
      x: from.x + (to.x - from.x) * local,
      y: from.y + (to.y - from.y) * local,
      angle: Math.atan2(to.y - from.y, to.x - from.x),
    };
  }

  function drawTravel(now) {
    const position = travelPosition(now);
    if (!position) return;
    context.save();
    context.translate(position.x, position.y);
    context.rotate(position.angle);
    context.strokeStyle = PALETTE.goldBright;
    context.fillStyle = PALETTE.bone;
    context.lineWidth = 1.5 / camera.zoom;
    context.beginPath();
    context.moveTo(-28, 0);
    context.lineTo(-8, 0);
    context.stroke();
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-5, -4.5);
    context.lineTo(-2, 0);
    context.lineTo(-5, 4.5);
    context.closePath();
    context.fill();
    context.restore();
  }

  function draw(now = 0) {
    const animationTime = reducedMotion() ? 0 : now;
    drawBackground();
    context.save();
    context.translate(camera.x, camera.y);
    context.scale(camera.zoom, camera.zoom);
    drawCampaignRoute(animationTime);
    drawPurgeRoute(animationTime);
    drawRoute(animationTime);
    (state?.nodes || BASE_NODES).forEach(node => drawNode(node, animationTime));
    drawThreatMarkers(animationTime);
    if (!reducedMotion()) {
      drawTravel(now);
      drawActionEffect(now);
    }
    context.restore();
  }

  function drawActionEffect(now) {
    if (!actionEffect) return;
    const progress = (now - actionEffect.startedAt) / 2200;
    if (progress >= 1) { actionEffect = null; return; }
    const { effect, x, y } = actionEffect;
    const radius = 20 + progress * 125;
    const danger = effect === 'battle';
    context.save();
    context.translate(x, y);
    context.globalAlpha = Math.sin(progress * Math.PI) * .75;
    context.strokeStyle = danger ? PALETTE.cinnabar : PALETTE.goldBright;
    context.lineWidth = 1.4 / camera.zoom;
    if (effect === 'anchor' || effect === 'forge' || effect === 'ancient') {
      context.rotate(progress * Math.PI * .18);
      traceHex(0, 0, 25 + progress * 38);
      context.stroke();
      traceHex(0, 0, 32 + progress * 50);
      context.stroke();
    }
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha *= .55;
    context.beginPath();
    context.arc(0, 0, radius * .7, progress * 2, progress * 2 + Math.PI * 1.4);
    context.stroke();
    if (danger || effect === 'forge') {
      context.beginPath();
      for (let index = 0; index < 12; index += 1) {
        const angle = index * Math.PI / 6;
        context.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        context.lineTo(Math.cos(angle) * (radius + 15), Math.sin(angle) * (radius + 15));
      }
      context.stroke();
    }
    context.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (!travel && reducedMotion() && now - lastFrame < 500) return;
    if (now - lastFrame < 32) return;
    lastFrame = now;
    draw(now);
  }

  function hitNode(screenX, screenY) {
    const point = screenToWorld(screenX, screenY);
    let nearest = null;
    let bestDistance = Infinity;
    (state?.nodes || []).forEach(node => {
      const distance = Math.hypot(point.x - node.x, point.y - node.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = node;
      }
    });
    return bestDistance <= HEX_RADIUS * .82 ? nearest : null;
  }

  function selectAt(x, y) {
    const node = hitNode(x, y);
    if (!node) return;
    selectedId = node.id;
    render();
    if (view.width <= 760) setDrawer(true);
  }

  function pointerPoint(event) {
    const rectangle = canvas.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }

  canvas.addEventListener('pointerdown', event => {
    const point = pointerPoint(event);
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, point);
    if (pointers.size === 1) {
      gesture = { startX: point.x, startY: point.y, cameraX: camera.x, cameraY: camera.y, moved: false, pinched: false };
      canvas.classList.add('is-dragging');
    } else if (pointers.size === 2) {
      const [first, second] = [...pointers.values()];
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      pinch = {
        distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
        zoom: camera.zoom,
        world: screenToWorld(center.x, center.y),
      };
      if (gesture) gesture.pinched = true;
    }
  });

  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const point = pointerPoint(event);
    pointers.set(event.pointerId, point);
    if (pointers.size === 2 && pinch) {
      const [first, second] = [...pointers.values()];
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      camera.zoom = Math.max(.3, Math.min(2.5, pinch.zoom * distance / pinch.distance));
      camera.x = center.x - pinch.world.x * camera.zoom;
      camera.y = center.y - pinch.world.y * camera.zoom;
      return;
    }
    if (pointers.size === 1 && gesture) {
      const dx = point.x - gesture.startX;
      const dy = point.y - gesture.startY;
      if (Math.hypot(dx, dy) > 5) gesture.moved = true;
      camera.x = gesture.cameraX + dx;
      camera.y = gesture.cameraY + dy;
    }
  });

  function finishPointer(event) {
    if (!pointers.has(event.pointerId)) return;
    const point = pointerPoint(event);
    const isTap = pointers.size === 1 && gesture && !gesture.moved && !gesture.pinched;
    pointers.delete(event.pointerId);
    if (isTap) selectAt(point.x, point.y);
    if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      gesture = { startX: remaining.x, startY: remaining.y, cameraX: camera.x, cameraY: camera.y, moved: true, pinched: true };
    } else if (pointers.size === 0) {
      gesture = null;
      pinch = null;
      canvas.classList.remove('is-dragging');
    }
  }

  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const point = pointerPoint(event);
    setZoom(camera.zoom * Math.exp(-event.deltaY * .0012), point.x, point.y);
  }, { passive: false });

  canvas.addEventListener('keydown', event => {
    const movement = 42;
    if (event.key === 'ArrowLeft') camera.x += movement;
    else if (event.key === 'ArrowRight') camera.x -= movement;
    else if (event.key === 'ArrowUp') camera.y += movement;
    else if (event.key === 'ArrowDown') camera.y -= movement;
    else if (event.key === '+' || event.key === '=') setZoom(camera.zoom * 1.16);
    else if (event.key === '-' || event.key === '_') setZoom(camera.zoom / 1.16);
    else if (event.key === '0') resetView();
    else return;
    event.preventDefault();
  });

  function showToast(message) {
    if (!message) return;
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
  }

  function setDrawer(open) {
    intelPanel.classList.toggle('is-open', open);
    $('#drawer-toggle').setAttribute('aria-expanded', String(open));
  }

  function showGate(title, message, retry = false) {
    setText('#gate-title', title);
    setText('#gate-message', message);
    $('#retry-button').hidden = !retry;
    gate.hidden = false;
  }

  function openMap(nextState) {
    state = normalizeState(nextState);
    selectedId = getNode(selectedId)?.id || state.player.positionId;
    app.classList.remove('is-loading');
    gate.hidden = true;
    render();
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || `星海响应异常 (${response.status})`);
    return payload;
  }

  async function fetchState() {
    const payload = await requestJson('/api/canglan/state');
    return payload.state || payload;
  }

  function cleanTicketFromUrl() {
    if (!ticket || !history.replaceState) return;
    const clean = new URL(location.href);
    clean.searchParams.delete('ticket');
    history.replaceState(null, '', `${clean.pathname}${clean.search}${clean.hash}`);
    ticket = '';
  }

  async function connect() {
    if (isPreview) {
      openMap(createPreviewState());
      selectedId = getNode('1,-1')?.id || state.player.positionId;
      render();
      showToast('预览星轨已展开');
      return;
    }
    showGate('正在接引星图', '神念校验中');
    try {
      if (!ticket) {
        openMap(await fetchState());
        return;
      }
      const sessionPayload = await requestJson('/api/canglan/session', {
        method: 'POST',
        body: JSON.stringify({ ticket }),
      });
      cleanTicketFromUrl();
      const nextState = sessionPayload.state || await fetchState();
      openMap(nextState);
    } catch (error) {
      showGate(
        ticket ? '星海接驳中断' : '星图会话待重连',
        error.message || '神念未能抵达沧澜界。',
        true,
      );
    }
  }

  function cloneState(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  }

  function addPreviewHistory(threat, entry) {
    threat.history = [...(threat.history || []), typeof entry === 'string' ? { text: entry } : entry].slice(-6);
  }

  function previewThreatAction(next, action) {
    const threat = next.threat;
    if (!threat) throw new Error('当前星域没有显化中的全服威胁。');
    if (action === 'challenge' && threat.phase === 'calamity' && threat.viewer.canChallenge) {
      threat.killCount = threat.killTarget;
      threat.viewer.calamityKill += 1;
      threat.phase = 'overlord';
      threat.title = '煌天焚世魔主 · 真身降临';
      threat.overlord.hp = threat.overlord.maxHp;
      threat.overlord.revived = false;
      threat.viewer.canChallenge = true;
      addPreviewHistory(threat, { type: 'overlord_spawned' });
      return { ok: true, state: next, message: '灾厄阈值已破，煌天焚世魔主降临！' };
    }
    if (action === 'challenge' && threat.phase === 'overlord' && threat.viewer.canChallenge) {
      if (!threat.overlord.revived) {
        threat.overlord.hp = threat.overlord.maxHp;
        threat.overlord.viewerDamage += threat.overlord.maxHp;
        threat.overlord.revived = true;
        addPreviewHistory(threat, { type: 'overlord_revived' });
        return { ok: true, state: next, message: '魔主返命功法触发，复生之身以全盛状态再度行动！' };
      }
      threat.overlord.hp = 0;
      threat.overlord.viewerDamage += threat.overlord.maxHp;
      threat.phase = 'decision';
      threat.title = '煌天焚世魔主 · 本源待决';
      threat.viewer.canChallenge = false;
      threat.viewer.canResolve = true;
      threat.viewer.canExecute = true;
      threat.viewer.canRefine = true;
      threat.decision.canExecute = true;
      threat.decision.canRefine = true;
      addPreviewHistory(threat, { type: 'decision_opened' });
      return { ok: true, state: next, message: '魔主返命与化外身尽数破灭，请决定其本源归宿。' };
    }
    if (['execute', 'refine'].includes(action) && threat.phase === 'decision') {
      const allowed = action === 'execute'
        ? threat.viewer.canExecute && threat.decision.canExecute
        : threat.viewer.canRefine && threat.decision.canRefine;
      if (!allowed) throw new Error('当前处置因果尚未开放。');
      const refined = action === 'refine';
      threat.phase = 'purge';
      threat.title = '古文明清剿阵列 · 禁器回收';
      threat.purge.currentStarId = '2,-1';
      threat.purge.route = ['3,-2', '2,-1', '1,-1', '0,0'];
      threat.purge.step = 1;
      threat.purge.totalSteps = 3;
      threat.purge.defense = 2;
      threat.purge.required = 3;
      threat.purge.occupied = false;
      threat.purge.nextAdvanceAt = Date.now() + 180000;
      threat.escalation = {
        eraLord: { active: true, name: '纪元' },
        hyperdimensional: { active: true, name: '超维' },
      };
      threat.viewer.canResolve = false;
      threat.viewer.canExecute = false;
      threat.viewer.canRefine = false;
      threat.viewer.canDefend = true;
      addPreviewHistory(threat, { type: 'overlord_fate_chosen', fate: refined ? 'refine' : 'execute' });
      addPreviewHistory(threat, { type: 'purge_started' });
      return { ok: true, state: next, message: refined ? '炼化完成，清剿阵列已经锁定星域！' : '魔主已诛，清剿阵列仍然跨界抵达！' };
    }
    if (action === 'defend' && threat.phase === 'purge' && threat.viewer.canDefend) {
      threat.purge.defense = threat.purge.required;
      threat.purge.step = Math.min(threat.purge.totalSteps, threat.purge.step + 1);
      threat.purge.currentStarId = threat.purge.route[threat.purge.step] || threat.purge.currentStarId;
      threat.viewer.defenseContribution += 1;
      threat.viewer.purgeDefense = threat.viewer.defenseContribution;
      threat.viewer.canDefend = false;
      threat.viewer.canClaim = true;
      threat.viewer.pendingRewardEventId = threat.eventId;
      threat.phase = 'resolved';
      threat.title = '第七星域 · 清剿退潮';
      threat.escalation = {
        eraLord: { active: false, name: '纪元' },
        hyperdimensional: { active: false, name: '超维' },
      };
      addPreviewHistory(threat, { type: 'threat_resolved' });
      return { ok: true, state: next, message: '守星成功，事件永久状态已经写入星图。' };
    }
    if (action === 'claim' && threat.viewer.canClaim) {
      threat.viewer.canClaim = false;
      threat.viewer.pendingRewardEventId = null;
      addPreviewHistory(threat, '个人讨伐战果已领取，纪元积累与古史情报归入行囊。');
      return { ok: true, state: next, message: '战果已领取：纪元积累与彼岸古史情报。' };
    }
    throw new Error('当前事件阶段不接受这项行动。');
  }

  function previewExpeditionAction(next, action, targetId) {
    const expedition = next.expedition;
    if (action === 'expedition_enter') {
      if (!expedition.viewer.canEnter) throw new Error('当前已有远征因果尚未结清。');
      const node = next.nodes.find(item => item.id === targetId || item.coordKey === targetId);
      if (!node || node.status === 'unseen') throw new Error('目标大星尚未完成观测。');
      next.player.positionId = node.id;
      next.expedition = {
        active: true,
        runId: `CLX-${String(Date.now()).slice(-6)}`,
        starId: node.id,
        campaign: {
          title: `${node.name} · 灾痕远征`,
          status: 'active',
          complete: false,
          progress: 10,
          unlocked: true,
          lockedReason: '',
          chain: expedition.campaign.chain || [],
          stage: { number: 1, total: 5, name: '观测灾痕' },
        },
        camp: null,
        tacticalBag: { items: [], used: 0, capacity: 12, secured: 0 },
        evacuation: { status: 'idle', active: false, ready: false },
        downed: false,
        lostCache: null,
        rescueTargets: [],
        viewer: {
          canEnter: false,
          canBuildCamp: true,
          canAdvance: false,
          canDeposit: false,
          canRescue: false,
          canRecoverLostCache: true,
          canEvacuate: false,
          canForceEvacuate: true,
          canClaim: false,
          lostCaches: [{ cacheId: 'preview-cache-01', starId: node.id, itemCount: 2, name: '失落星匣' }],
        },
      };
      return { ok: true, state: next, message: `已进入${node.name}区域战役，灾痕坐标完成锁定。` };
    }
    if (!expedition.active) throw new Error('当前没有进行中的星域远征。');
    if (action === 'camp_build') {
      if (!expedition.viewer.canBuildCamp) throw new Error('营地星锚尚未满足建设条件。');
      expedition.camp = {
        established: true,
        name: '照夜前线营',
        level: 1,
        maxLevel: 3,
        defense: 36,
        maxDefense: 100,
      };
      expedition.campaign.progress = 25;
      expedition.viewer.canBuildCamp = false;
      expedition.viewer.canAdvance = true;
      expedition.viewer.canForceEvacuate = false;
      return { ok: true, state: next, message: '前线营地落成，星锚与临时物资通道已经接通。' };
    }
    if (action === 'campaign_advance') {
      if (!expedition.viewer.canAdvance) throw new Error('区域战役暂时没有可推进节点。');
      if (expedition.stage.number >= 4) {
        expedition.stage = { number: 5, total: 5, name: '镇压神炉灾核' };
        expedition.campaign.stage = expedition.stage;
        expedition.campaign.progress = 100;
        expedition.campaign.complete = true;
        expedition.campaign.status = 'complete';
        expedition.tacticalBag.items = [
          ...expedition.tacticalBag.items,
          { id: 'era-power', name: '纪元之力', quantity: 1 },
        ];
        expedition.tacticalBag.used += 1;
        expedition.viewer.canAdvance = false;
        expedition.viewer.canDeposit = true;
        expedition.viewer.canEvacuate = true;
        return { ok: true, state: next, message: '神炉灾核已经镇压，五阶段区域战役完成。' };
      }
      if (expedition.stage.number >= 3) {
        expedition.stage = { number: 4, total: 5, name: '读取先秦炉铭' };
        expedition.campaign.stage = expedition.stage;
        expedition.campaign.progress = 82;
        return { ok: true, state: next, message: '古星阵眼稳定，先秦炉铭已经显化。' };
      }
      expedition.stage = { number: 2, total: 5, name: '清理同源变异体' };
      expedition.campaign.stage = expedition.stage;
      expedition.campaign.progress = 52;
      expedition.tacticalBag.items = [
        ...expedition.tacticalBag.items,
        { id: 'anchor-core', name: '星锚残芯', quantity: 2 },
        { id: 'shore-sand', name: '彼岸界砂', quantity: 3 },
      ];
      expedition.tacticalBag.used += 5;
      expedition.rescueTargets = [{ userId: 'preview-rescue-01', name: '失联观星者' }];
      expedition.viewer.canAdvance = false;
      expedition.viewer.canDeposit = true;
      expedition.viewer.canRescue = false;
      return { ok: true, state: next, message: '变异体阵线已破，临时行囊装入五份彼岸物资。' };
    }
    if (action === 'bag_deposit') {
      if (!expedition.viewer.canDeposit) throw new Error('当前没有可封存的临时战利品。');
      expedition.tacticalBag.secured += expedition.tacticalBag.used;
      expedition.tacticalBag.items = [];
      expedition.tacticalBag.used = 0;
      expedition.viewer.canDeposit = false;
      expedition.viewer.canRescue = expedition.rescueTargets.length > 0;
      return { ok: true, state: next, message: '临时物资已封入营地星锚，本轮撤离将保留这些战果。' };
    }
    if (action === 'expedition_rescue') {
      const rescue = expedition.rescueTargets.find(target => String(target.userId ?? target.id) === String(targetId)) || expedition.rescueTargets[0];
      if (!expedition.viewer.canRescue || !rescue) throw new Error('当前星域没有可响应的求援信号。');
      expedition.rescueTargets = expedition.rescueTargets.filter(target => target !== rescue);
      expedition.stage = { number: 3, total: 5, name: '修复古星阵眼' };
      expedition.campaign.stage = expedition.stage;
      expedition.campaign.progress = 64;
      expedition.tacticalBag.items = [
        ...expedition.tacticalBag.items,
        { id: 'ancient-component', name: '古文明构件', quantity: 1 },
      ];
      expedition.tacticalBag.used += 1;
      expedition.viewer.canRescue = false;
      expedition.viewer.canAdvance = true;
      expedition.viewer.canDeposit = true;
      return { ok: true, state: next, message: `${rescue.name || '失联修士'}已回归营地，古星阵眼修复节点已经开放。` };
    }
    if (action === 'lost_cache_recover') {
      const cache = expedition.lostCaches.find(item => String(item.cacheId ?? item.id) === String(targetId)) || expedition.lostCaches[0];
      if (!expedition.viewer.canRecoverLostCache || !cache) throw new Error('当前星域没有可追回的遗失行囊。');
      const recovered = Math.max(1, Math.trunc(finiteNumber(cache.itemCount, finiteNumber(cache.count, 1))));
      expedition.lostCaches = expedition.lostCaches.filter(item => item !== cache);
      expedition.viewer.lostCaches = expedition.lostCaches;
      expedition.tacticalBag.items = [
        ...expedition.tacticalBag.items,
        { id: `recovered-${cache.cacheId ?? cache.id}`, name: cache.name || '追回物资', quantity: recovered },
      ];
      expedition.tacticalBag.used += recovered;
      expedition.viewer.canRecoverLostCache = expedition.lostCaches.length > 0;
      expedition.viewer.canDeposit = expedition.camp.established && expedition.tacticalBag.used > 0;
      return { ok: true, state: next, message: `遗失行囊已追回，${recovered} 份物资重新归入临时行囊。` };
    }
    if (action === 'evacuation_start') {
      if (!expedition.viewer.canEvacuate) throw new Error('稳定撤离条件尚未满足。');
      expedition.evacuation = { status: 'ready', active: true, ready: true, forced: false, completesAt: Date.now() };
      expedition.viewer.canEvacuate = false;
      expedition.viewer.canClaim = true;
      return { ok: true, state: next, message: '星锚撤离完成，远征战果已经送达结算节点。' };
    }
    if (action === 'evacuation_force') {
      if (!expedition.viewer.canForceEvacuate) throw new Error('当前状态不需要强制撤离。');
      const lostCount = Math.ceil(expedition.tacticalBag.used * .3);
      expedition.lostCache = lostCount
        ? { active: true, itemCount: lostCount, expiresAt: Date.now() + 30 * 60000 }
        : null;
      expedition.tacticalBag.used = Math.max(0, expedition.tacticalBag.used - lostCount);
      expedition.evacuation = { status: 'ready', active: true, ready: true, forced: true, completesAt: Date.now() };
      expedition.viewer.canForceEvacuate = false;
      expedition.viewer.canClaim = true;
      return { ok: true, state: next, message: lostCount ? `强制撤离完成，${lostCount} 份物资遗留在原星。` : '强制撤离完成。' };
    }
    if (action === 'expedition_claim') {
      if (!expedition.viewer.canClaim) throw new Error('当前没有待领取的远征结算。');
      expedition.active = false;
      expedition.campaign.complete = true;
      expedition.campaign.status = 'settled';
      expedition.evacuation = { ...expedition.evacuation, active: false, ready: false, claimed: true, status: 'claimed' };
      expedition.tacticalBag.items = [];
      expedition.tacticalBag.used = 0;
      expedition.viewer.canClaim = false;
      expedition.viewer.canEnter = true;
      return { ok: true, state: next, message: '远征结算已领取，封存物资与区域贡献归入本体。' };
    }
    throw new Error('当前远征阶段不接受这项行动。');
  }

  function previewTrueWorldAction(next, action, targetId) {
    const trueWorld = next.trueWorld;
    if (!trueWorld?.exists || trueWorld.unlocked === false) throw new Error('真世界入口尚未接驳。');
    if (action === 'true_world_enter' || action === 'true_world_leave') {
      const layer = action === 'true_world_enter' ? 'true_world' : 'canglan';
      trueWorld.currentLayer = layer;
      next.currentLayer = layer;
      next.progression ||= {};
      next.progression.currentLayer = layer;
      next.player.layer = layer;
      return {
        ok: true,
        state: next,
        message: layer === 'true_world' ? '预览：已接驳真世界。' : '预览：已返回沧澜界。',
      };
    }
    trueWorld.global ||= {};
    trueWorld.viewer ||= {};
    trueWorld.sectors ||= [];
    const id = normalizeTrueWorldCoordinate(targetId, trueWorld.currentSectorId || '0,0');
    let sector = trueWorld.sectors.find(entry => entry.id === id);
    if (!sector) {
      const [q, r] = id.split(',').map(Number);
      sector = { id, q, r, name: `真世界扇区 ${id}`, status: 'unseen', progress: 0, progressRequired: 100, threat: 4, biomeName: '未知星域' };
      trueWorld.sectors.push(sector);
    }
    const normalizeViewerLoot = () => {
      trueWorld.viewer.loot = Array.isArray(trueWorld.viewer.loot) ? trueWorld.viewer.loot : [];
      trueWorld.loot = Array.isArray(trueWorld.loot) ? trueWorld.loot : trueWorld.viewer.loot;
    };
    const markObserved = () => {
      const wasUnseen = sector.status === 'unseen';
      sector.status = sector.status === 'unseen' ? 'observed' : sector.status;
      if (wasUnseen) trueWorld.global.observedCount = Math.max(0, finiteNumber(trueWorld.global.observedCount)) + 1;
      sector.progress = Math.min(Math.max(1, finiteNumber(sector.progressRequired, 100)), finiteNumber(sector.progress) + 25);
      if (sector.progress >= sector.progressRequired) {
        sector.status = 'explored';
        trueWorld.global.exploredCount = Math.max(0, finiteNumber(trueWorld.global.exploredCount)) + (sector._previewExplored ? 0 : 1);
        sector._previewExplored = true;
      }
      trueWorld.global.progressPercent = trueWorld.global.exploredCount / Math.max(1, finiteNumber(trueWorld.sectorCount, TRUE_WORLD_SECTOR_COUNT)) * 100;
    };
    if (action === 'true_world_observe' || action === 'true_world_explore') {
      markObserved();
      trueWorld.currentSectorId = id;
      trueWorld.viewer.coordinate = id;
      trueWorld.viewer.canExplore = sector.status !== 'explored';
      return { ok: true, state: next, message: `${sector.name}观测回波已并入全服星图。` };
    }
    if (action === 'true_world_move') {
      markObserved();
      trueWorld.currentSectorId = id;
      trueWorld.viewer.coordinate = id;
      return { ok: true, state: next, message: `真世界航路闭合，已抵达${sector.name}。` };
    }
    if (action === 'true_world_encounter' || action === 'true_world_encounter_start' || action === 'true_world_battle') {
      if (sector.status !== 'explored') markObserved();
      trueWorld.currentSectorId = id;
      trueWorld.viewer.coordinate = id;
      trueWorld.enemy = {
        encounterId: trueWorld.enemy?.encounterId || 'preview-tw-wave-01',
        tier: 'quasi_immortal_emperor',
        name: '同源准仙帝灾厄变异体',
        realmName: '准仙帝',
        maxHp: 8400000000000000,
        currentHp: 0,
        status: 'defeated',
        sameRealmMutant: true,
      };
      trueWorld.global.victoryCount = Math.max(0, finiteNumber(trueWorld.global.victoryCount)) + 1;
      trueWorld.global.quasiImmortalEmperorDefeated = Math.max(0, finiteNumber(trueWorld.global.quasiImmortalEmperorDefeated)) + 1;
      trueWorld.global.eraAccumulation = Math.max(0, finiteNumber(trueWorld.global.eraAccumulation)) + 1;
      trueWorld.viewer.eraAccumulation = Math.max(0, finiteNumber(trueWorld.viewer.eraAccumulation)) + 1;
      trueWorld.viewer.victories ||= {};
      trueWorld.viewer.victories.total = Math.max(0, finiteNumber(trueWorld.viewer.victories.total)) + 1;
      normalizeViewerLoot();
      const reward = { id: 'era-dao-marrow', name: '纪元道髓', quantity: 1 };
      trueWorld.loot.push(reward);
      trueWorld.viewer.canClaim = true;
      return { ok: true, state: next, message: '同源准仙帝变异体已镇压，纪元积累与战利品等待收取。' };
    }
    if (action === 'true_world_claim') {
      normalizeViewerLoot();
      if (!trueWorld.viewer.canClaim && !trueWorld.loot.length) throw new Error('当前没有待收取的真世界战果。');
      trueWorld.viewer.canClaim = false;
      trueWorld.viewer.loot = [];
      trueWorld.loot = [];
      return { ok: true, state: next, message: '真世界战果已收取，纪元积累归入本体。' };
    }
    throw new Error('当前真世界行动未接入。');
  }

  function previewAncientEventAction(next, action, targetId) {
    const ancient = next.ancientEvents;
    const event = ancient?.events?.find(entry => entry.id === targetId);
    if (!event) throw new Error('所选古文明章节已经隐入古史。');
    if (action === 'ancient_event_contribute') {
      if (!event.viewer.canContribute) throw new Error('需抵达事件坐标，并完成真世界扇区探索。');
      const applied = Math.min(10, event.contributionRequired - event.progress);
      event.progress += applied;
      event.progressPercent = event.progress / event.contributionRequired * 100;
      event.viewer.contribution += applied;
      event.contributorCount = Math.max(1, event.contributorCount);
      ancient.viewer.totalContribution += applied;
      if (event.progress >= event.contributionRequired) {
        event.status = 'completed';
        event.viewer.canContribute = false;
        event.viewer.canClaim = true;
        ancient.completedCount += 1;
        const nextEvent = ancient.events.find(entry => entry.order === event.order + 1);
        if (nextEvent) {
          nextEvent.status = 'active';
          ancient.activeEventId = nextEvent.id;
        } else {
          ancient.activeEventId = '';
          ancient.status = 'completed';
        }
      }
      ancient.viewer.canClaim = ancient.events.some(entry => entry.viewer.canClaim);
      return { ok: true, state: next, message: `${event.name}全服贡献 ${event.progress}/${event.contributionRequired}。` };
    }
    if (action === 'ancient_event_claim') {
      if (!event.viewer.canClaim) throw new Error('所选章节暂无个人战果。');
      event.viewer.canClaim = false;
      event.viewer.claimed = true;
      ancient.viewer.canClaim = ancient.events.some(entry => entry.viewer.canClaim);
      return { ok: true, state: next, message: `${event.name}个人古史战果已经归档。` };
    }
    throw new Error('当前古文明行动未接入。');
  }

  function previewDaoForgeAction(next, action, targetId) {
    const forgeState = next.daoForge;
    if (!forgeState?.exists) throw new Error('大道炉尚未在真世界显化。');
    if (action === 'dao_forge_start') {
      const [recipeId, rawEntries = ''] = String(targetId).split('|', 2);
      const entries = rawEntries.split(',').map(value => value.trim()).filter(Boolean);
      const recipe = forgeState.recipes.find(entry => entry.id === recipeId);
      if (!recipe || !recipe.known || !recipe.ready || recipe.unavailable) throw new Error('所选炼制法的条件尚未齐备。');
      const rule = daoForgeSelectionRule(recipe.id);
      if (entries.length !== rule.count || new Set(entries).size !== rule.count) {
        throw new Error(`${recipe.name}需要恰好指定${rule.count}项投入。`);
      }
      if (rule.kind === 'treasure' && entries.some(name => !forgeState.ownedInnateTreasures.includes(name))) {
        throw new Error('所选先天至宝不在当前持有列表。');
      }
      if (forgeState.forge && forgeState.forge.status !== 'claimed') throw new Error('当前已有大道至宝在炉中。');
      const startedAt = Date.now();
      forgeState.forge = {
        forgeId: `preview-forge-${recipe.id}`,
        status: 'forging',
        recipeId: recipe.id,
        recipeName: recipe.name,
        treasureName: `${recipe.name}·大道至宝`,
        startedAt,
        readyAt: startedAt + forgeState.durationMs,
        remainingMs: forgeState.durationMs,
        progress: 0,
        canClaim: false,
        selectionEntries: entries,
        consumption: rule.kind === 'treasure' && recipe.id === 'three-innate-erasure'
          ? { innateTreasures: entries.map(name => ({ id: name, name })) }
          : { innateTreasures: [] },
        output: rule.kind === 'treasure'
          ? { preservedInnateTreasures: recipe.id === 'dao-fruit-five-treasure' ? entries.map(name => ({ id: name, name })) : [] }
          : { authorities: entries.map(name => ({ id: name, name })) },
      };
      return { ok: true, state: next, message: `${recipe.name}已经开炉，二十四小时后大道至宝成形。` };
    }
    if (action === 'dao_forge_claim') {
      const forge = forgeState.forge;
      if (!forge || !(forge.canClaim || forge.status === 'ready')) throw new Error('大道炉仍在炼制。');
      forge.status = 'claimed';
      forge.canClaim = false;
      forge.progress = 100;
      forge.remainingMs = 0;
      return { ok: true, state: next, message: `${forge.treasureName}已经出炉并收入纳戒。` };
    }
    throw new Error('当前大道炉行动未接入。');
  }

  function previewAction(action, targetId) {
    const next = cloneState(state);
    if (ANCIENT_EVENT_ACTIONS.has(action)) return previewAncientEventAction(next, action, targetId);
    if (DAO_FORGE_ACTIONS.has(action)) return previewDaoForgeAction(next, action, targetId);
    if (TRUE_WORLD_ACTIONS.has(action)) return previewTrueWorldAction(next, action, targetId);
    if (EXPEDITION_ACTIONS.has(action)) return previewExpeditionAction(next, action, targetId);
    const node = next.nodes.find(item => item.id === targetId);
    const current = next.nodes.find(item => item.id === next.player.positionId);
    if (!node) throw new Error('目标大星已离开神念范围。');
    if (THREAT_ACTIONS.has(action)) return previewThreatAction(next, action);
    if (action === 'observe') {
      if (node.status !== 'unseen') throw new Error('此星已经完成观测。');
      if (!current || axialDistance(current, node) !== 1) throw new Error('神念只能观测当前大星相邻的星域。');
      node.status = 'observed';
      return { ok: true, state: next, message: `已捕获${node.name}的法则星辉。` };
    }
    if (action === 'move') {
      if (node.id === current?.id) throw new Error('神念已在此星。');
      const route = routeBetween(current, node);
      const cost = calculateRouteCost(route, next.player);
      if (cost.cost > next.player.mind) throw new Error('心神不足，航路未能闭合。');
      next.player.mind -= cost.cost;
      next.player.mindRemainder = cost.remainder;
      next.player.positionId = node.id;
      route.slice(1, -1).forEach(routeNode => {
        const mutable = next.nodes.find(item => item.id === routeNode.id);
        if (mutable && mutable.status === 'unseen') mutable.status = 'observed';
      });
      if (STATUS_ORDER[node.status] < STATUS_ORDER.explored) node.status = 'explored';
      next.pressure = Math.min(100, next.pressure + cost.unknown * 3);
      return { ok: true, state: next, message: `跃迁完成，神念抵达${node.name}。` };
    }
    if (action === 'explore') {
      if (node.id !== current?.id) throw new Error('需先抵达目标大星。');
      const progress = explorationProgress(node);
      if (progress.contribution >= progress.requirement) throw new Error('此星探索贡献已经充足。');
      if (node.viewerContributed) throw new Error('你已完成此星的个人探索。');
      node.status = 'explored';
      node.contribution = Math.min(progress.requirement, progress.contribution + 1);
      node.viewerContributed = true;
      return { ok: true, state: next, message: `${node.name}探索贡献 ${node.contribution}/${progress.requirement}。` };
    }
    if (action === 'anchor') {
      const progress = explorationProgress(node);
      if (node.id !== current?.id || node.status !== 'explored' || progress.contribution < progress.requirement) throw new Error('需先补足此星探索贡献。');
      node.status = 'anchored';
      next.pressure = Math.max(0, next.pressure - 8);
      return { ok: true, state: next, message: `${node.name}星锚已经稳定。` };
    }
    throw new Error('未知的星海指令。');
  }

  function operationId() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function playTravel(route) {
    if (reducedMotion() || route.length < 2) return Promise.resolve();
    jumpFlash.classList.remove('is-active');
    void jumpFlash.offsetWidth;
    jumpFlash.classList.add('is-active');
    travel = { route, startedAt: performance.now() };
    return new Promise(resolve => {
      setTimeout(() => {
        travel = null;
        jumpFlash.classList.remove('is-active');
        resolve();
      }, 1000);
    });
  }

  async function performAction(action) {
    if (busy) return;
    const threatAction = THREAT_ACTIONS.has(action);
    const expeditionAction = EXPEDITION_ACTIONS.has(action);
    const trueWorldAction = TRUE_WORLD_ACTIONS.has(action);
    const ancientEventAction = ANCIENT_EVENT_ACTIONS.has(action);
    const daoForgeAction = DAO_FORGE_ACTIONS.has(action);
    const targetId = threatAction
      ? threatTargetNode()?.id
      : expeditionAction
        ? expeditionTargetId(action)
        : trueWorldAction
          ? trueWorldTargetId(action)
          : ancientEventAction
            ? ancientEventTargetId()
            : daoForgeAction
              ? daoForgeTargetId(action)
              : getNode(selectedId)?.id;
    if (!targetId) return;
    const before = state;
    const requestId = operationId();
    const effectNode = trueWorldAction || ancientEventAction || daoForgeAction ? currentNode() : getNode(targetId);
    const targetName = trueWorldAction ? state.trueWorld?.currentSector?.name || '真世界'
      : ancientEventAction ? '古文明遗迹'
        : daoForgeAction ? '大道铸炉' : displayName(effectNode);
    let acknowledged = null;
    const travelRoute = action === 'move' ? [...currentRoute] : [];
    busy = true;
    activeAction = action;
    render();
    try {
      const payload = isPreview
        ? previewAction(action, targetId)
        : await requestJson('/api/canglan/action', {
          method: 'POST',
          body: JSON.stringify({ action, targetId, operationId: requestId }),
        });
      acknowledged = payload;
      if (action === 'move') await playTravel(travelRoute);
      const nextState = payload.state || (!isPreview ? await fetchState() : state);
      state = normalizeState(nextState);
      selectedId = action === 'move'
        ? state.player.positionId
        : threatAction
          ? (threatTargetNode()?.id || selectedId || state.player.positionId)
          : expeditionAction
            ? (getNode(state.expedition?.starId)?.id || selectedId || state.player.positionId)
            : trueWorldAction || ancientEventAction || daoForgeAction
              ? selectedId
              : (getNode(targetId)?.id || state.player.positionId);
      showToast(payload.message || '星海因果已经更新。');
      story.present({ action, message: payload.message, targetName, before, after: state, point: effectNode, operationId: requestId });
    } catch (error) {
      showToast(error.message || '本次神念未能落定。');
      story.present({
        action, targetName, operationId: requestId,
        failed: !acknowledged, pendingSync: Boolean(acknowledged),
        message: acknowledged
          ? `${acknowledged.message || '行动已有响应。'}\n星图同步暂未完成，请先刷新核对，勿重复提交。\n${error.message || ''}`
          : error.message || '本次响应未确认，请刷新星图核对。',
      });
    } finally {
      busy = false;
      activeAction = '';
      render();
    }
  }

  async function refreshState() {
    if (busy) return;
    if (isPreview) {
      render();
      showToast('预览星轨已刷新');
      return;
    }
    try {
      busy = true;
      render();
      state = normalizeState(await fetchState());
      showToast('星海状态已同步');
    } catch (error) {
      showToast(error.message || '星海同步中断。');
    } finally {
      busy = false;
      render();
    }
  }

  function focusThreat() {
    const node = threatTargetNode();
    if (!node) return;
    selectedId = node.id;
    const panelWidth = view.width > 760 ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 370 : 0;
    const mapCenterX = (view.width - panelWidth) / 2;
    const mapCenterY = view.height / 2 + (view.width <= 760 ? 36 : 24);
    camera.x = mapCenterX - node.x * camera.zoom;
    camera.y = mapCenterY - node.y * camera.zoom;
    render();
    if (view.width <= 760) setDrawer(true);
    canvas.focus({ preventScroll: true });
  }

  $('#zoom-in').addEventListener('click', () => setZoom(camera.zoom * 1.2));
  $('#zoom-out').addEventListener('click', () => setZoom(camera.zoom / 1.2));
  $('#reset-view').addEventListener('click', resetView);
  $('#planet-focus').addEventListener('click', () => {
    const node = getNode(selectedId);
    if (!node) return;
    const desktop = view.width > 760;
    const panelWidth = desktop ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 370 : 0;
    camera.zoom = 2.3;
    camera.x = (view.width - panelWidth) / 2 - node.x * camera.zoom;
    camera.y = view.height * .52 - node.y * camera.zoom;
    if (!desktop) setDrawer(false);
    canvas.focus({ preventScroll: true });
  });
  $('#planet-select').addEventListener('change', event => {
    selectedId = event.target.value;
    render();
    if (view.width <= 760) setDrawer(true);
  });
  $('#refresh-state').addEventListener('click', refreshState);
  $('#focus-threat').addEventListener('click', focusThreat);
  $('#drawer-toggle').addEventListener('click', () => setDrawer(!intelPanel.classList.contains('is-open')));
  $('#retry-button').addEventListener('click', connect);
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.action)));
  document.querySelectorAll('[data-threat-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.threatAction)));
  document.querySelectorAll('[data-expedition-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.expeditionAction)));
  document.querySelectorAll('[data-true-world-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.trueWorldAction)));
  document.querySelectorAll('[data-ancient-event-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.ancientEventAction)));
  document.querySelectorAll('[data-dao-forge-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.daoForgeAction)));
  $('#dao-forge-authorities')?.addEventListener('input', event => {
    daoForgeAuthorityDraft = event.currentTarget.value;
    renderDaoForge();
  });
  document.addEventListener('click', event => {
    const layerButton = event.target.closest?.('[data-layer-id]');
    if (layerButton && !layerButton.disabled && state?.progression) {
      const layerId = String(layerButton.dataset.layerId || '');
      const layer = (state.progression.layers || []).find(entry => entry.id === layerId);
      if (!layer?.unlocked) return;
      const currentLayer = String(state.currentLayer || state.progression.currentLayer || 'canglan');
      if (layerId !== currentLayer && (layerId === 'true_world' || currentLayer === 'true_world')) {
        trueWorldSelectedSectorId = state.trueWorld?.currentSectorId || trueWorldSelectedSectorId || '0,0';
        void performAction(layerId === 'true_world' ? 'true_world_enter' : 'true_world_leave');
        return;
      }
      state.progression.currentLayer = layerId;
      if (layerId === 'true_world') {
        trueWorldSelectedSectorId = state.trueWorld?.currentSectorId || '0,0';
        setDrawer(true);
      }
      render();
    }
    const sectorButton = event.target.closest?.('[data-true-world-sector]');
    if (sectorButton && !sectorButton.disabled) {
      trueWorldSelectedSectorId = String(sectorButton.dataset.trueWorldSector || '0,0');
      render();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && view.width <= 760) setDrawer(false);
  });
  addEventListener('resize', () => {
    resizeCanvas();
    resetView();
  });
  motionQuery.addEventListener?.('change', () => draw(performance.now()));

  window.lucide?.createIcons({ attrs: { 'stroke-width': 1.7 } });
  resizeCanvas();
  requestAnimationFrame(frame);
  connect();
})();

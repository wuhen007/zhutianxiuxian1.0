(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const canvas = $('#star-map');
  const context = canvas.getContext('2d', { alpha: false });
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
  let currentRoute = [];
  let currentRouteCost = { distance: 0, unknown: 0, cost: 0, remainder: 0, denominator: 1 };
  let busy = false;
  let activeAction = '';
  let toastTimer = 0;
  let travel = null;
  let lastFrame = 0;

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
    const stageTotal = active || completed
      ? Math.max(stageNumber, Math.trunc(finiteNumber(stageSource.total, finiteNumber(campaignSource.stageTotal, finiteNumber(source.stageTotal, 4)))))
      : 0;
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
    };
  }

  function createPreviewState() {
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
      return { ...node, status, contribution, viewerContributed: false };
    });

    return normalizeState({
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
    });
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
    setText('#expedition-brief', expedition.active
      ? `${expedition.campaign.status === 'active' || expedition.campaign.status === 'idle' ? '远征进行中' : expedition.campaign.status} · 当前大星行动由全服探索态势共同推进。`
      : expedition.campaign.complete
        ? '本轮星域行动已完成，远征记录保留在彼岸古史。'
        : '当前大星尚无个人远征记录。');

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
    const flagBox = $('#expedition-flags');
    flagBox.replaceChildren(...flags.map(text => {
      const flag = document.createElement('span');
      flag.textContent = text;
      return flag;
    }));

    const actionStates = {
      expedition_enter: expedition.viewer.canEnter && Boolean(selected && selected.status !== 'unseen'),
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

  function render() {
    if (!state) return;
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
    setText('#star-status', selected ? STATUS_LABELS[selected.status] : '尚未定星');
    setText('#star-name', displayName(selected));
    setText('#star-coordinates', selected ? `星标 Q${signed(selected.q)} · R${signed(selected.r)}` : '沧澜星图等待神念');
    setText('#threat-mark', unseen ? '--' : `危${Number(selected.threat) || '?'}`);
    setText('#star-signal', selected ? (unseen ? '星雾遮断神念，只能确认一颗大星正在边界之后燃烧。' : selected.signal || selected.description) : '星海寂静，因果尚未落向任何坐标。');
    setText('#star-law', unseen ? '未解析' : selected.law);
    setText('#star-kind', unseen ? '未解析' : selected.kind);
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
    const areaTop = desktop ? 112 : 92;
    const areaBottom = view.height - (desktop ? 96 : 82);
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
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(237,229,212,.035)';
    context.beginPath();
    context.moveTo(-40, view.height * .78);
    context.lineTo(view.width * .72, view.height * .16);
    context.lineTo(view.width + 50, view.height * .28);
    context.stroke();
    context.strokeStyle = 'rgba(189,69,52,.12)';
    context.beginPath();
    context.moveTo(0, view.height * .82);
    context.lineTo(view.width * .33, view.height);
    context.stroke();
  }

  function purgeRouteNodes(threat = state?.threat) {
    if (!threat || !Array.isArray(threat.purge?.route)) return [];
    return threat.purge.route.map(resolveThreatNode).filter(Boolean);
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
    const color = starColor(node);
    const pulse = motionQuery.matches ? 0 : Math.sin(now * .0015 + node.seed) * .8;
    const core = unknown ? 2.2 : 3.3 + (node.seed % 3) * .55;

    context.save();
    context.globalAlpha = unknown ? .42 : 1;
    traceHex(node.x, node.y, HEX_RADIUS - .8 / camera.zoom);
    context.lineWidth = (selected ? 1.7 : .7) / camera.zoom;
    context.strokeStyle = selected ? PALETTE.goldBright : unknown ? 'rgba(237,229,212,.12)' : 'rgba(237,229,212,.22)';
    context.stroke();

    if (selected) {
      traceHex(node.x, node.y, HEX_RADIUS - 5 / camera.zoom);
      context.lineWidth = .7 / camera.zoom;
      context.strokeStyle = PALETTE.cinnabar;
      context.stroke();
    }

    context.strokeStyle = color;
    context.lineWidth = .8 / camera.zoom;
    context.globalAlpha = unknown ? .25 : .58;
    context.beginPath();
    context.arc(node.x, node.y, 10 + pulse, now * .00022 + node.seed, now * .00022 + node.seed + Math.PI * 1.35);
    context.stroke();
    context.beginPath();
    context.arc(node.x, node.y, 15 - pulse * .4, -now * .00016 - node.seed, -now * .00016 - node.seed + Math.PI * .75);
    context.stroke();

    context.globalAlpha = unknown ? .45 : .86;
    context.beginPath();
    context.moveTo(node.x - (11 + core), node.y);
    context.lineTo(node.x + (11 + core), node.y);
    context.moveTo(node.x, node.y - (11 + core));
    context.lineTo(node.x, node.y + (11 + core));
    context.stroke();

    context.globalAlpha = 1;
    context.fillStyle = color;
    context.beginPath();
    context.arc(node.x, node.y, core, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.void;
    context.beginPath();
    context.arc(node.x, node.y, Math.max(1, core * .28), 0, Math.PI * 2);
    context.fill();

    if (Number(node.threat) >= 7 && !unknown) {
      context.strokeStyle = PALETTE.cinnabar;
      context.lineWidth = 1.2 / camera.zoom;
      context.beginPath();
      context.arc(node.x, node.y, 21, -.8, .8);
      context.stroke();
    }

    if (current) {
      context.strokeStyle = PALETTE.goldBright;
      context.lineWidth = 1.7 / camera.zoom;
      context.beginPath();
      context.arc(node.x, node.y, 23, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(node.x, node.y - 29);
      context.lineTo(node.x - 3.5, node.y - 24);
      context.lineTo(node.x + 3.5, node.y - 24);
      context.closePath();
      context.fillStyle = PALETTE.goldBright;
      context.fill();
    }

    if (!unknown && camera.zoom >= .62) {
      context.font = '600 9px "Microsoft YaHei UI", sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'top';
      context.fillStyle = selected ? PALETTE.bone : PALETTE.boneSoft;
      context.globalAlpha = selected ? 1 : .78;
      context.fillText(String(node.name).slice(0, 6), node.x, node.y + 26, 66);
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
    drawBackground();
    context.save();
    context.translate(camera.x, camera.y);
    context.scale(camera.zoom, camera.zoom);
    drawPurgeRoute(now);
    drawRoute(now);
    (state?.nodes || BASE_NODES).forEach(node => drawNode(node, now));
    drawThreatMarkers(now);
    drawTravel(now);
    context.restore();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    if (!travel && motionQuery.matches && now - lastFrame < 500) return;
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
          progress: 12,
          stage: { number: 1, total: 4, name: '观测灾痕' },
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
      expedition.stage = { number: 2, total: 4, name: '清理同源变异体' };
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
      expedition.stage = { number: 4, total: 4, name: '古星阵眼稳定' };
      expedition.campaign.stage = expedition.stage;
      expedition.campaign.progress = 100;
      expedition.campaign.complete = true;
      expedition.campaign.status = 'complete';
      expedition.tacticalBag.items = [{ id: 'ancient-component', name: '古文明构件', quantity: 1 }];
      expedition.tacticalBag.used = 1;
      expedition.viewer.canRescue = false;
      expedition.viewer.canEvacuate = true;
      return { ok: true, state: next, message: `${rescue.name || '失联修士'}已回归营地，区域战役完成。` };
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

  function previewAction(action, targetId) {
    const next = cloneState(state);
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
    if (motionQuery.matches || route.length < 2) return Promise.resolve();
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
    const targetId = threatAction
      ? threatTargetNode()?.id
      : expeditionAction
        ? expeditionTargetId(action)
        : getNode(selectedId)?.id;
    if (!targetId) return;
    const travelRoute = action === 'move' ? [...currentRoute] : [];
    busy = true;
    activeAction = action;
    render();
    try {
      const payload = isPreview
        ? previewAction(action, targetId)
        : await requestJson('/api/canglan/action', {
          method: 'POST',
          body: JSON.stringify({ action, targetId, operationId: operationId() }),
        });
      if (action === 'move') await playTravel(travelRoute);
      const nextState = payload.state || (!isPreview ? await fetchState() : state);
      state = normalizeState(nextState);
      selectedId = action === 'move'
        ? state.player.positionId
        : threatAction
          ? (threatTargetNode()?.id || selectedId || state.player.positionId)
          : expeditionAction
            ? (getNode(state.expedition?.starId)?.id || selectedId || state.player.positionId)
            : (getNode(targetId)?.id || state.player.positionId);
      showToast(payload.message || '星海因果已经更新。');
    } catch (error) {
      showToast(error.message || '本次神念未能落定。');
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
  $('#refresh-state').addEventListener('click', refreshState);
  $('#focus-threat').addEventListener('click', focusThreat);
  $('#drawer-toggle').addEventListener('click', () => setDrawer(!intelPanel.classList.contains('is-open')));
  $('#retry-button').addEventListener('click', connect);
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.action)));
  document.querySelectorAll('[data-threat-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.threatAction)));
  document.querySelectorAll('[data-expedition-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.expeditionAction)));
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

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
    drawRoute(now);
    (state?.nodes || BASE_NODES).forEach(node => drawNode(node, now));
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

  function previewAction(action, targetId) {
    const next = cloneState(state);
    const node = next.nodes.find(item => item.id === targetId);
    const current = next.nodes.find(item => item.id === next.player.positionId);
    if (!node) throw new Error('目标大星已离开神念范围。');
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
    const target = getNode(selectedId);
    if (!target) return;
    const travelRoute = action === 'move' ? [...currentRoute] : [];
    busy = true;
    activeAction = action;
    render();
    try {
      const payload = isPreview
        ? previewAction(action, target.id)
        : await requestJson('/api/canglan/action', {
          method: 'POST',
          body: JSON.stringify({ action, targetId: target.id, operationId: operationId() }),
        });
      if (action === 'move') await playTravel(travelRoute);
      const nextState = payload.state || (!isPreview ? await fetchState() : state);
      state = normalizeState(nextState);
      selectedId = action === 'move' ? state.player.positionId : (getNode(target.id)?.id || state.player.positionId);
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

  $('#zoom-in').addEventListener('click', () => setZoom(camera.zoom * 1.2));
  $('#zoom-out').addEventListener('click', () => setZoom(camera.zoom / 1.2));
  $('#reset-view').addEventListener('click', resetView);
  $('#refresh-state').addEventListener('click', refreshState);
  $('#drawer-toggle').addEventListener('click', () => setDrawer(!intelPanel.classList.contains('is-open')));
  $('#retry-button').addEventListener('click', connect);
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => performAction(button.dataset.action)));
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

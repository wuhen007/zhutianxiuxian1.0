export const XIANGU_LEGACY_EVENTS = Object.freeze({
  ARENA_WIN: 'arena_win',
  PLAYER_KILL: 'player_kill',
  NPC_KILL: 'npc_kill',
  ITEM_OBTAINED: 'item_obtained',
});

export const XIANGU_CANON_GOALS = Object.freeze({
  shiguanwang_tianzi: Object.freeze({
    npcId: 'shiguanwang_tianzi',
    name: '十冠王天子',
    action: 'contest_arena',
    location: '仙古擂台',
    objective: '携世界树幼苗登临擂台，续写第十一世冠冕',
    event: XIANGU_LEGACY_EVENTS.ARENA_WIN,
    target: 3,
    historicalCrowns: 10,
  }),
  zhexian: Object.freeze({
    npcId: 'zhexian',
    name: '谪仙',
    action: 'hunt_player',
    location: '凶巢',
    objective: '以凶巢杀局猎取同代修士，谋取天角蚁传承',
    event: XIANGU_LEGACY_EVENTS.PLAYER_KILL,
    target: 2,
    historicalCrowns: 0,
  }),
  ningchuan: Object.freeze({
    npcId: 'ningchuan',
    name: '六冠王宁川',
    action: 'hunt_player',
    location: '深层区域',
    objective: '猎取同代天骄，积蓄第七世冠王气运',
    event: XIANGU_LEGACY_EVENTS.PLAYER_KILL,
    target: 2,
    historicalCrowns: 6,
  }),
  gujian_yun: Object.freeze({
    npcId: 'gujian_yun',
    name: '孤剑云',
    action: 'seek_item',
    location: '虚空夹层',
    objective: '搜集三道剑谷剑意碎片，追索大罗剑胎的下落',
    event: XIANGU_LEGACY_EVENTS.ITEM_OBTAINED,
    item: '剑谷剑意碎片',
    target: 3,
    historicalCrowns: 0,
  }),
  dichong: Object.freeze({
    npcId: 'dichong',
    name: '帝冲',
    action: 'hunt_player',
    location: '深层区域',
    objective: '镇杀仙殿宿敌，以不死身争夺终极造化',
    event: XIANGU_LEGACY_EVENTS.PLAYER_KILL,
    target: 2,
    historicalCrowns: 0,
  }),
  honghuang: Object.freeze({
    npcId: 'honghuang',
    name: '红凰',
    action: 'seek_item',
    location: '火道禁区',
    objective: '搜集两枚真凰翎羽，借火道残则完成涅槃',
    event: XIANGU_LEGACY_EVENTS.ITEM_OBTAINED,
    item: '真凰翎羽',
    target: 2,
    historicalCrowns: 0,
  }),
});

const NPC_NAME_TO_ID = new Map([
  ...Object.values(XIANGU_CANON_GOALS).map(goal => [goal.name, goal.npcId]),
  ['十冠王', 'shiguanwang_tianzi'],
  ['宁川', 'ningchuan'],
  ['独孤云', 'gujian_yun'],
]);

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function normalizeRoundId(roundId) {
  const value = String(roundId ?? '').trim();
  if (!value) throw new TypeError('仙古轮次不能为空');
  return value;
}

export function resolveXianguCanonNpcId(value) {
  const key = String(value?.id || value?.npcId || value?.name || value?.名号 || value || '').trim();
  return XIANGU_CANON_GOALS[key] ? key : NPC_NAME_TO_ID.get(key) || null;
}

export function createXianguNpcGoalState(roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  return {
    version: 1,
    roundId: normalizedRoundId,
    goals: Object.fromEntries(Object.keys(XIANGU_CANON_GOALS).map(npcId => [npcId, {
      npcId,
      progress: 0,
      completed: false,
      completedAt: null,
    }])),
  };
}

export function ensureXianguNpcGoals(holder, roundId) {
  if (!holder || typeof holder !== 'object' || Array.isArray(holder)) {
    throw new TypeError('仙古目标需要可持久化对象');
  }
  const normalizedRoundId = normalizeRoundId(roundId);
  const current = holder.xiangu_npc_goals;
  if (!current || current.roundId !== normalizedRoundId || !current.goals) {
    holder.xiangu_npc_goals = createXianguNpcGoalState(normalizedRoundId);
  }
  return holder.xiangu_npc_goals;
}

export function advanceXianguNpcGoal(state, event = {}) {
  const npcId = resolveXianguCanonNpcId(event.actorId || event.npcId || event.actor);
  const definition = npcId && XIANGU_CANON_GOALS[npcId];
  const goal = definition && state?.goals?.[npcId];
  const eventType = String(event.type || '');
  const itemName = String(event.itemName || event.item || '').trim();

  if (
    !goal || goal.completed || eventType !== definition.event ||
    (definition.item && itemName !== definition.item)
  ) {
    return { updated: false, completedNow: false, goal: goal || null, definition: definition || null };
  }

  const amount = Math.max(1, toCount(event.amount));
  goal.progress = Math.min(definition.target, toCount(goal.progress) + amount);
  goal.completed = goal.progress >= definition.target;
  if (goal.completed) goal.completedAt = toCount(event.at || Date.now());

  return { updated: true, completedNow: goal.completed, goal, definition };
}

export function formatXianguNpcGoals(state) {
  const lines = [`【古代怪胎动向·${state?.roundId || '未知轮次'}】`];
  for (const definition of Object.values(XIANGU_CANON_GOALS)) {
    const goal = state?.goals?.[definition.npcId];
    const progress = Math.min(definition.target, toCount(goal?.progress));
    const status = goal?.completed ? '已达成' : `${progress}/${definition.target}`;
    lines.push(`${definition.name}｜${definition.location}｜${definition.objective}（${status}）`);
  }
  return lines.join('\n');
}

export function ensureXianguLegacy(holder) {
  if (!holder || typeof holder !== 'object' || Array.isArray(holder)) {
    throw new TypeError('仙古战绩需要可持久化对象');
  }

  const definition = XIANGU_CANON_GOALS[resolveXianguCanonNpcId(holder)];
  const legacy = holder.xiangu_legacy && typeof holder.xiangu_legacy === 'object'
    ? holder.xiangu_legacy
    : {};
  legacy.version = 1;
  legacy.crowns = Math.max(toCount(legacy.crowns), definition?.historicalCrowns || 0);
  legacy.totals = {
    arenaWins: toCount(legacy.totals?.arenaWins),
    playerKills: toCount(legacy.totals?.playerKills),
    npcKills: toCount(legacy.totals?.npcKills),
  };
  legacy.rounds = Array.isArray(legacy.rounds) ? legacy.rounds : [];
  holder.xiangu_legacy = legacy;
  return legacy;
}

function ensureLegacyRound(legacy, roundId) {
  const normalizedRoundId = normalizeRoundId(roundId);
  let round = legacy.rounds.find(item => String(item?.roundId) === normalizedRoundId);
  if (!round) {
    round = {
      roundId: normalizedRoundId,
      arenaWins: 0,
      playerKills: 0,
      npcKills: 0,
      crowned: false,
      crownedAt: null,
    };
    legacy.rounds.push(round);
  }
  return round;
}

const RESULT_FIELDS = Object.freeze({
  [XIANGU_LEGACY_EVENTS.ARENA_WIN]: 'arenaWins',
  [XIANGU_LEGACY_EVENTS.PLAYER_KILL]: 'playerKills',
  [XIANGU_LEGACY_EVENTS.NPC_KILL]: 'npcKills',
});

export function recordXianguLegacyResult(holder, { roundId, type, amount = 1 } = {}) {
  const field = RESULT_FIELDS[type];
  if (!field) return null;

  const legacy = ensureXianguLegacy(holder);
  const round = ensureLegacyRound(legacy, roundId);
  const gain = Math.max(1, toCount(amount));
  legacy.totals[field] += gain;
  round[field] = toCount(round[field]) + gain;
  return { field, gain, total: legacy.totals[field], round, legacy };
}

export function getXianguCrownTitle(crowns) {
  const count = toCount(crowns);
  const numerals = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  if (count === 0) return '未称冠';
  return `${numerals[count] || count}冠王`;
}

export function awardXianguCrown(holder, { roundId, at = Date.now() } = {}) {
  const legacy = ensureXianguLegacy(holder);
  const round = ensureLegacyRound(legacy, roundId);
  if (round.crowned) {
    return { awarded: false, crowns: legacy.crowns, title: getXianguCrownTitle(legacy.crowns), round, legacy };
  }

  round.crowned = true;
  round.crownedAt = toCount(at);
  legacy.crowns += 1;
  return { awarded: true, crowns: legacy.crowns, title: getXianguCrownTitle(legacy.crowns), round, legacy };
}

export function formatXianguLegacy(holder, roundId) {
  const legacy = ensureXianguLegacy(holder);
  const round = roundId === undefined
    ? legacy.rounds.at(-1)
    : legacy.rounds.find(item => String(item?.roundId) === String(roundId));
  const name = holder.name || holder.名号 || '无名天骄';
  const current = round
    ? `本轮：擂台${toCount(round.arenaWins)}胜｜击败修士${toCount(round.playerKills)}人｜击败NPC ${toCount(round.npcKills)}人${round.crowned ? '｜已称冠' : ''}`
    : '本轮：暂无战绩';
  return [
    `【仙古战绩·${name}】`,
    `冠冕：${getXianguCrownTitle(legacy.crowns)}`,
    `累计：擂台${legacy.totals.arenaWins}胜｜击败修士${legacy.totals.playerKills}人｜击败NPC ${legacy.totals.npcKills}人`,
    current,
  ].join('\n');
}

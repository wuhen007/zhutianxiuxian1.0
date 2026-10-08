// 独立轮回大道（生死境→岁月境）；不是“自身之道”的轮回战斗技能。
export const REINCARNATION_STAGE_NAMES = Object.freeze(['初期', '中期', '后期', '大圆满']);
export const REINCARNATION_MAX_BATCH = 99;
export const REINCARNATION_HISTORY_LIMIT = 500;
const LIFE_CONTROL = [0.1, 0.3, 0.6, 1];
const SUPPRESSION_CONTROL = [0, 0.1, 0.3, 0.5];
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, fallback = 0) => {
  if (!['number', 'string'].includes(typeof v) || String(v).trim() === '') return fallback;
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
};
const round = v => Math.round(v * 1e6) / 1e6;

function normalizePart(part) {
  const source = object(part) ? structuredClone(part) : {};
  const stage = Math.max(0, Math.trunc(num(source.阶段)));
  return {
    ...source,
    // 旧版可把岁月阶段推到4以上；只封顶，绝不继续生成undefined/NaN。
    阶段: Math.min(3, stage),
    进度: stage > 3 ? 100 : round(Math.min(100, Math.max(0, num(source.进度)))),
  };
}

export function normalizeReincarnationWay(raw, { start = false } = {}) {
  const source = object(raw) ? structuredClone(raw) : {};
  const life = normalizePart(source.生死境);
  const time = normalizePart(source.岁月境);
  const title = typeof source.境界 === 'string' ? source.境界 : '';
  const name = /^(生死境|岁月境)(初期|中期|后期|大圆满)$/.exec(title);
  // 修复旧版本阶段已升但名称仍初期的情形，不根据修炼日志推算缺失的等级。
  if (name) {
    const part = name[1] === '岁月境' ? time : life;
    part.阶段 = Math.max(part.阶段, REINCARNATION_STAGE_NAMES.indexOf(name[2]));
  }
  let inTime = title.startsWith('岁月境') || time.阶段 > 0 || time.进度 > 0;
  const entered = start || inTime || title.startsWith('生死境') || life.阶段 > 0 || life.进度 > 0;
  if (entered) {
    const part = inTime ? time : life;
    if (part.进度 >= 100 && part.阶段 < 3) { part.阶段++; part.进度 = 0; }
    else if (!inTime && life.阶段 === 3 && life.进度 >= 100) {
      inTime = true; time.阶段 = 0; time.进度 = 0;
    }
  }
  if (inTime) { life.阶段 = 3; life.进度 = 100; }
  life.掌控生死 = entered ? LIFE_CONTROL[life.阶段] : 0;
  life.突破寿元压制 = entered ? SUPPRESSION_CONTROL[life.阶段] : 0;
  time.掌控时间 = inTime ? LIFE_CONTROL[time.阶段] : 0;
  time.改变时代 = inTime ? SUPPRESSION_CONTROL[time.阶段] : 0;
  return {
    ...source,
    境界: entered ? `${inTime ? '岁月境' : '生死境'}${REINCARNATION_STAGE_NAMES[(inTime ? time : life).阶段]}` : '未入门',
    生死境: life, 岁月境: time,
    修炼记录: Array.isArray(source.修炼记录) ? source.修炼记录.slice(-REINCARNATION_HISTORY_LIMIT) : [],
  };
}

export function getReincarnationStatus(raw) {
  const state = normalizeReincarnationWay(raw);
  const realm = state.境界.startsWith('岁月境') ? '岁月境' : '生死境';
  const current = state[realm];
  const entered = state.境界 !== '未入门';
  const rank = entered ? (realm === '岁月境' ? 4 : 0) + current.阶段 : -1;
  return { state, realm, current, rank, entered, maxed: rank === 7 && current.进度 >= 100 };
}

export function getReincarnationStep(raw) {
  const status = getReincarnationStatus(raw);
  if (status.maxed) return { cultivation: 0, lifespan: 0, progress: 0 };
  const stage = status.current.阶段;
  const life = status.realm === '生死境';
  const cultivation = life ? 1e8 * 1.5 ** stage : 1e9 * 2 ** stage;
  return { cultivation, lifespan: cultivation * 100, progress: (life ? [5, 4, 3, 2] : [4, 3, 2, 1])[stage] };
}

export function parseReincarnationBatch(message) {
  const match = /^#修炼轮回大道(?:\s*\*\s*(\d+))?$/.exec(String(message || '').trim());
  if (!match) return null;
  const count = match[1] === undefined ? 1 : Number(match[1]);
  return Number.isSafeInteger(count) && count >= 1 && count <= REINCARNATION_MAX_BATCH ? count : null;
}

function addProgress(state, amount) {
  const inTime = state.境界.startsWith('岁月境');
  let realm = inTime ? '岁月境' : '生死境';
  let part = state[realm];
  part.进度 = round(part.进度 + amount);
  if (part.进度 >= 100) {
    if (realm === '岁月境' && part.阶段 === 3) part.进度 = 100;
    else {
      const remainder = round(part.进度 - 100);
      if (part.阶段 < 3) part.阶段++;
      else {
        part.阶段 = 3; part.进度 = 100;
        realm = '岁月境'; part = state.岁月境; part.阶段 = 0;
      }
      part.进度 = remainder;
    }
  }
  state.境界 = `${realm}${REINCARNATION_STAGE_NAMES[part.阶段]}`;
  return normalizeReincarnationWay(state);
}

// Pure transaction plan: failed validation/insufficient resources never mutates player.
// Costs are computed at every crossed stage; cap stops billing unused batch repetitions.
export function planReincarnationCultivation(player, count, { now = Date.now() } = {}) {
  if (!Number.isSafeInteger(count) || count < 1 || count > REINCARNATION_MAX_BATCH) {
    return { ok: false, reason: 'batch' };
  }
  const before = getReincarnationStatus(player?.轮回大道);
  if (before.maxed) return { ok: false, reason: 'maxed', state: before.state };
  let state = normalizeReincarnationWay(player?.轮回大道, { start: true });
  const steps = [];
  let cultivation = 0, lifespan = 0;
  for (let index = 0; index < count; index++) {
    if (getReincarnationStatus(state).maxed) break;
    const prior = getReincarnationStatus(state);
    const cost = getReincarnationStep(state);
    state = addProgress(state, cost.progress);
    cultivation += cost.cultivation; lifespan += cost.lifespan;
    steps.push({
      时间: new Date(now).toISOString(), 消耗修为: cost.cultivation, 消耗寿元: cost.lifespan,
      进度增加: cost.progress, 修炼前境界: prior.state.境界, 修炼后境界: state.境界,
    });
  }
  const currentCultivation = num(player?.修为, NaN);
  const currentLifespan = num(player?.寿元, NaN);
  if (!Number.isFinite(currentCultivation) || !Number.isFinite(currentLifespan) ||
    currentCultivation < 0 || currentLifespan < 0) return { ok: false, reason: 'resources-invalid' };
  const total = { cultivation, lifespan };
  if (currentCultivation < cultivation || currentLifespan < lifespan) {
    return { ok: false, reason: 'resources', total, actualCount: steps.length, requestedCount: count };
  }
  // Very large JS Number balances can lose a small subtraction entirely.
  if ((cultivation && currentCultivation - cultivation === currentCultivation) ||
    (lifespan && currentLifespan - lifespan === currentLifespan)) {
    return { ok: false, reason: 'precision' };
  }
  state.修炼记录 = [...state.修炼记录, ...steps].slice(-REINCARNATION_HISTORY_LIMIT);
  const after = getReincarnationStatus(state);
  return {
    ok: true, state, total, requestedCount: count, actualCount: steps.length,
    cultivationAfter: currentCultivation - cultivation, lifespanAfter: currentLifespan - lifespan,
    beforeRealm: before.state.境界, afterRealm: state.境界,
    stageUp: before.rank < after.rank, maxed: after.maxed,
  };
}

export function canControlLifeDeath(raw) {
  return getReincarnationStatus(raw).rank >= 3;
}

export function canAdvanceReincarnationEra(raw) {
  return getReincarnationStatus(raw).rank >= 7;
}

// Prepare arguments for the existing world-era manager, not a second Era.yaml.
export function getReincarnationEraTarget(current, delta) {
  if (!Number.isSafeInteger(delta) || delta < 1 || delta > 10000) throw new Error('每次推进应为 1～10000 的整数年。');
  const index = num(current?.index, NaN), years = num(current?.years, NaN), epoch = num(current?.epoch, NaN);
  if (!Number.isSafeInteger(index) || index < 0 || index > 4 || !Number.isSafeInteger(years) ||
    years < 0 || years >= 10000 || !Number.isSafeInteger(epoch) || epoch < 1) {
    throw new Error('当前世界纪元格式异常，请先检查时代配置。');
  }
  const before = ((epoch - 1) * 5 + index) * 10000 + years;
  if (!Number.isSafeInteger(before + delta)) throw new Error('时代累计年数超出精确计数范围。');
  const configured = num(current?.totalYears, before);
  if (configured > before) throw new Error('时代累计年数与纪元位置不一致，请先核对世界配置。');
  const total = before + delta;
  return { index: Math.floor(total / 10000) % 5, years: total % 10000, epoch: Math.floor(total / 50000) + 1 };
}

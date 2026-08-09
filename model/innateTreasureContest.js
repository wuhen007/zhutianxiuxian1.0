export const TREASURE_TRIAL_LIMIT = 3;
export const TREASURE_CONTEST_DURATION_MS = 24 * 60 * 60 * 1000;
// 天机购买者的信息差优势加分：抢先获知至宝真名/权能/天象，夺宝时更有把握
export const TIANJI_INFO_BONUS = 8;
export const TREASURE_DAO_HEARTS = Object.freeze([
  '镇压诸天',
  '守护苍生',
  '参悟大道',
  '逍遥天地',
]);

const TRIAL_TAGS = Object.freeze({
  battle: '力',
  insight: '悟',
  support: '德',
  fate: '险',
});

const PROFILES = Object.freeze({
  混沌珠: profile('混沌无相，万物未生而万象已具。', ['悟', '险', '德'], '逍遥天地', ['归一', '开辟', '流转'], 0,
    ['此宝亲近能从无中见有之人。', '大道无定形，强求反而失其真意。']),
  太极图: profile('阴阳二气彼此纠缠，却始终没有真正相融。', ['悟', '德', '险'], '参悟大道', ['阴', '阳', '衡'], 2,
    ['刚柔并济者更易引动道图。', '它所求并非一阴一阳，而是二者归衡。']),
  盘古幡: profile('混沌如铁幕压下，唯有一道裂隙贯穿天地。', ['力', '险', '悟'], '镇压诸天', ['固守', '劈开', '绕行'], 1,
    ['此宝不拒绝锋芒毕露之人。', '开天并非蛮力，其中亦有大道轨迹。']),
  诛仙四剑: profile('四道杀机纵横交错，阵中却留有一线生门。', ['力', '险', '悟'], '镇压诸天', ['止杀', '困敌', '退避'], 0,
    ['杀伐果决者可闻剑鸣。', '真正的杀剑知晓何时止戈。']),
  山河社稷图: profile('图卷中万灵繁衍，山河兴替皆在一念之间。', ['德', '悟', '险'], '守护苍生', ['独占', '共生', '封藏'], 1,
    ['万灵愿意亲近护持山河之人。', '此图重众生，不重一人之得失。']),
  天地玄黄玲珑塔: profile('玄黄气垂落万重，任凭劫光冲刷而不动。', ['德', '悟', '力'], '守护苍生', ['攻伐', '守御', '舍弃'], 1,
    ['不争并非怯弱，而是有所守护。', '承受劫难仍不退者最合塔意。']),
  东皇钟: profile('钟声未响，四方时空已经凝固。', ['力', '德', '悟'], '镇压诸天', ['镇', '破', '遁'], 0,
    ['它欣赏能够定鼎秩序之人。', '钟声为镇世而鸣，并非只为杀伐。']),
  混沌钟: profile('钟体外日月星辰流转，钟内地水火风反复开灭。', ['力', '悟', '险'], '镇压诸天', ['静止', '开灭', '隐匿'], 1,
    ['敢在开灭之间前行者可得回应。', '攻守一体，方为混沌钟的真意。']),
  六道轮回盘: profile('六道轮转不息，每一道生门之后皆藏死意。', ['悟', '德', '险'], '守护苍生', ['永生', '轮回', '寂灭'], 1,
    ['它看重知生死而不滥掌生死之人。', '轮回不是终点，而是众生再行一步。']),
  炼妖壶: profile('壶中万灵气息交融，却没有任何一道气息被彻底抹去。', ['悟', '险', '德'], '逍遥天地', ['吞噬', '融合', '禁锢'], 1,
    ['它偏爱理解万灵变化之人。', '造化在融合，不在单纯吞噬。']),
  崆峒印: profile('人道气运如长河汇聚，亿万呼声共同托起古印。', ['德', '力', '悟'], '守护苍生', ['一人', '宗门', '众生'], 2,
    ['独强不足以承人皇之重。', '众生愿力才是古印真正的根基。']),
});

function profile(omen, favoredTags, daoHeart, insightOptions, correctInsight, clues) {
  return { omen, favoredTags, daoHeart, insightOptions, correctInsight, clues };
}

function participant(contest, qq) {
  return contest?.participants?.[String(qq)] || null;
}

function hashLuck(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 6;
}

export function getTreasureContestProfile(name) {
  return PROFILES[name] || profile(
    '先天气机沉浮不定，似在审视每一位来者。',
    ['力', '悟', '德'],
    '参悟大道',
    ['强取', '参悟', '守候'],
    1,
    ['器灵并不只看境界高低。', '顺应其性情比强取更易得到认可。']
  );
}

export function createTreasureGuardian(player, difficulty, treasureName = '先天至宝') {
  const scales = {
    普通: { attack: 0.7, defense: 0.7, hp: 0.75 },
    凶险: { attack: 0.95, defense: 0.95, hp: 1 },
    绝境: { attack: 1.2, defense: 1.15, hp: 1.25 },
  };
  const scale = scales[difficulty];
  if (!scale) return null;
  const guardian = JSON.parse(JSON.stringify(player || {}));
  delete guardian.id;
  guardian.名号 = `${treasureName}·${difficulty}守护灵`;
  guardian.攻击 = Math.max(1, Math.floor((Number(player?.攻击) || 1) * scale.attack));
  guardian.防御 = Math.max(1, Math.floor((Number(player?.防御) || 1) * scale.defense));
  guardian.血量上限 = Math.max(1, Math.floor((Number(player?.血量上限) || 1) * scale.hp));
  guardian.当前血量 = guardian.血量上限;
  guardian.暴击率 = 0.05;
  guardian.暴击伤害 = 1.5;
  guardian.灵根 = { name: '先天器灵', type: '器灵', 法球倍率: 0.1, 攻击: 0, 防御: 0, 生命: 0 };
  guardian.法球倍率 = 0.1;
  guardian.学习的功法 = [];
  guardian.当前使用的功法 = '';
  guardian.仙宠 = [];
  guardian.分身 = [];
  guardian.当前先天至宝 = '';
  guardian.先天权柄 = {};
  return guardian;
}

export function createTreasureContest(treasureName, now = Date.now()) {
  return {
    version: 1,
    status: 'open',
    startedAt: now,
    sealProgress: 0,
    participants: {},
    rewardedQqs: [],
  };
}

export function registerTianjiTreasureEvent(config, activeEvents, result, invoker = {}) {
  const event = result.eventData;
  event.source = 'tianji';
  event.interaction = 'treasure';
  event.participantQqs ||= [];
  event.awakenedBy = {
    qq: String(invoker.qq || ''),
    name: String(invoker.name || invoker.qq || '一位无名修士'),
  };
  // 天机购买者凭信息差参与择主之争可获额外加分
  if (event.contest && typeof event.contest === 'object') {
    event.contest.tianjiBuyer = event.awakenedBy;
  }
  result.message = [
    '【先天灵宝天机·扰动诸天】',
    `${event.awakenedBy.name}以劫境道痕推演天机，令一件蛰伏于诸天的先天至宝显化！`,
    '',
    result.message,
  ].join('\n');
  config.eventHistory.push(event);
  config.activeEvents = [...activeEvents, event];
  if (config.eventHistory.length > 100) config.eventHistory = config.eventHistory.slice(-100);
  return { ok: true, ...result };
}

export function joinTreasureContest(contest, qq, name, now = Date.now()) {
  if (!contest || contest.status !== 'open') return { ok: false, reason: 'closed' };
  const key = String(qq);
  if (contest.participants[key]) return { ok: false, reason: 'duplicate', participant: contest.participants[key] };
  contest.participants[key] = {
    qq: key,
    name: String(name || key),
    joinedAt: now,
    trials: {},
    trialScore: 0,
    contribution: 0,
    daoHeart: '',
  };
  return { ok: true, participant: contest.participants[key] };
}

export function getRevealedTreasureClues(treasureName, sealProgress) {
  const clues = getTreasureContestProfile(treasureName).clues;
  const count = Number(sealProgress) >= 75 ? 2 : Number(sealProgress) >= 25 ? 1 : 0;
  return clues.slice(0, count);
}

export function performTreasureTrial(contest, treasureName, qq, trial, options = {}, random = Math.random) {
  if (!contest || contest.status !== 'open') return { ok: false, reason: 'closed' };
  const player = participant(contest, qq);
  if (!player) return { ok: false, reason: 'not_joined' };
  if (!TRIAL_TAGS[trial]) return { ok: false, reason: 'invalid_trial' };
  if (player.trials[trial]) return { ok: false, reason: 'duplicate_trial' };
  if (Object.keys(player.trials).length >= TREASURE_TRIAL_LIMIT) return { ok: false, reason: 'limit' };

  const profileData = getTreasureContestProfile(treasureName);
  const before = Number(contest.sealProgress) || 0;
  let score = 0;
  let progress = 0;
  let detail = '';
  let healthPenaltyRate = 0;

  if (trial === 'battle') {
    const difficulties = {
      普通: { chance: 0.9, score: 12, progress: 7 },
      凶险: { chance: 0.7, score: 17, progress: 9 },
      绝境: { chance: 0.45, score: 20, progress: 12 },
    };
    const difficulty = difficulties[options.difficulty];
    if (!difficulty) return { ok: false, reason: 'invalid_option' };
    const healthRatio = Math.min(1, Math.max(0, Number(options.healthRatio) || 0));
    const chance = Math.max(0.15, difficulty.chance - (1 - healthRatio) * 0.25);
    const externalBattle = typeof options.battleWon === 'boolean';
    const success = externalBattle ? options.battleWon : random() < chance;
    score = success ? difficulty.score : Math.max(4, Math.floor(difficulty.score * 0.4));
    progress = success ? difficulty.progress : 4;
    healthPenaltyRate = externalBattle ? 0 : success ? 0.05 : { 普通: 0.12, 凶险: 0.22, 绝境: 0.35 }[options.difficulty];
    detail = success
      ? `你通过了${options.difficulty}守护灵试炼。`
      : `你败于${options.difficulty}守护灵，但仍带回部分破封道痕。`;
  }

  if (trial === 'insight') {
    const choiceIndex = profileData.insightOptions.indexOf(String(options.choice || ''));
    if (choiceIndex < 0) return { ok: false, reason: 'invalid_option' };
    const correct = choiceIndex === profileData.correctInsight;
    score = correct ? 20 : 9;
    progress = correct ? 10 : 6;
    detail = correct ? '先天禁制与你的答案共鸣，显露出完整道纹。' : '禁制并未完全认可答案，只逸散出少量道纹。';
  }

  if (trial === 'support') {
    const contribution = Math.min(10, Math.max(1, Math.trunc(Number(options.contribution) || 0)));
    score = 18;
    progress = 8 + Math.ceil(contribution / 2);
    player.contribution = Math.min(10, (Number(player.contribution) || 0) + contribution);
    detail = `你以${options.resourceLabel || '资源'}护住灵脉，获得${contribution}点破封贡献。`;
  }

  if (trial === 'fate') {
    const roll = random();
    if (roll < 0.2) {
      score = 6;
      progress = 5;
      healthPenaltyRate = 0.3;
      detail = '命运乱流骤然反噬，你负伤脱身，只截留少量道痕。';
    } else if (roll < 0.8) {
      score = 14;
      progress = 9;
      healthPenaltyRate = 0.1;
      detail = '你穿过一段破碎未来，带回了完整的命运道痕。';
    } else {
      score = 20;
      progress = 13;
      detail = '乱流深处的器灵投影主动与你同行，留下罕见机缘。';
    }
  }

  player.trials[trial] = {
    tag: TRIAL_TAGS[trial],
    score,
    detail,
    completedAt: Number(options.now) || Date.now(),
  };
  player.trialScore = Math.min(60, (Number(player.trialScore) || 0) + score);
  contest.sealProgress = Math.min(100, before + progress);
  const milestones = [25, 50, 75, 100].filter(value => before < value && contest.sealProgress >= value);
  return { ok: true, score, progress, detail, healthPenaltyRate, milestones, participant: player };
}

export function placeTreasureDaoHeart(contest, qq, choice, now = Date.now()) {
  if (!contest || contest.status !== 'open') return { ok: false, reason: 'closed' };
  const player = participant(contest, qq);
  if (!player) return { ok: false, reason: 'not_joined' };
  if (Object.keys(player.trials).length < TREASURE_TRIAL_LIMIT) return { ok: false, reason: 'trials_required' };
  if (!TREASURE_DAO_HEARTS.includes(choice)) return { ok: false, reason: 'invalid_option' };
  if (player.daoHeart) return { ok: false, reason: 'duplicate' };
  player.daoHeart = choice;
  player.daoHeartAt = now;
  return { ok: true, participant: player };
}

export function rankTreasureContest(contest, treasureName, eventSeed = '') {
  const profileData = getTreasureContestProfile(treasureName);
  const buyerQq = String(contest?.tianjiBuyer?.qq || '');
  return Object.values(contest?.participants || {})
    .filter(player => Object.keys(player.trials || {}).length === TREASURE_TRIAL_LIMIT && player.daoHeart)
    .map(player => {
      const routeAffinity = Math.min(15, Object.values(player.trials).reduce(
        (sum, trial) => sum + (profileData.favoredTags.includes(trial.tag) ? 5 : 0), 0
      ));
      const heartAffinity = player.daoHeart === profileData.daoHeart ? 10 : 3;
      const affinity = routeAffinity + heartAffinity;
      const luck = hashLuck(`${eventSeed}:${player.qq}`);
      const trialScore = Math.min(60, Number(player.trialScore) || 0);
      const contribution = Math.min(10, Number(player.contribution) || 0);
      // 天机购买者的信息差优势：抢先知晓至宝真名与天象，试炼更有把握
      const tianjiBonus = buyerQq && String(player.qq) === buyerQq ? TIANJI_INFO_BONUS : 0;
      return {
        qq: player.qq,
        name: player.name,
        trialScore,
        affinity,
        contribution,
        luck,
        tianjiBonus,
        total: trialScore + affinity + contribution + luck + tianjiBonus,
        joinedAt: player.joinedAt,
      };
    })
    .sort((a, b) => b.total - a.total || b.trialScore - a.trialScore || a.joinedAt - b.joinedAt || a.qq.localeCompare(b.qq));
}

export function settleTreasureContest(contest, treasureName, eventSeed, now = Date.now()) {
  if (!contest) return { ok: false, reason: 'missing' };
  if (contest.status === 'settled') return { ok: true, alreadySettled: true, rankings: contest.rankings || [] };
  const rankings = rankTreasureContest(contest, treasureName, eventSeed);
  contest.status = 'settled';
  contest.settledAt = now;
  contest.rankings = rankings;
  contest.winner = rankings[0] || null;
  return { ok: true, rankings, winner: contest.winner };
}

/* ============ 天骄 AI 竞争者（择主之争） ============ */

const ALL_TRIALS = Object.freeze(['battle', 'insight', 'support', 'fate']);

function pickTianjiaoTrialTags(favoredTags, random) {
  const favored = ALL_TRIALS.filter(tag => favoredTags.includes(TRIAL_TAGS[tag]));
  const rest = ALL_TRIALS.filter(tag => !favored.includes(tag));
  const ordered = [...favored, ...rest];
  const result = [];
  for (const tag of ordered) {
    if (result.length >= 3) break;
    if (!result.includes(tag)) result.push(tag);
  }
  if (result.length < 3) {
    for (const tag of ALL_TRIALS) {
      if (result.length >= 3) break;
      if (!result.includes(tag)) result.push(tag);
    }
  }
  return result;
}

function simulateTianjiaoTrial(tag, tianjiao, random) {
  const completedAt = Date.now();
  if (tag === 'battle') {
    const pathLevel = Math.max(Number(tianjiao?.mijinglevel_id) || 1, Number(tianjiao?.xiangulevel_id) || 1);
    const success = random() < Math.min(0.95, 0.55 + pathLevel * 0.02);
    const score = success ? 16 + Math.floor(random() * 4) : 4 + Math.floor(random() * 4);
    return { tag: TRIAL_TAGS.battle, score, detail: success ? '力压守护灵，势如破竹。' : '强攻守护灵，稍落下风。', completedAt };
  }
  if (tag === 'insight') {
    const correct = random() < 0.65;
    const score = correct ? 18 + Math.floor(random() * 2) : 9;
    return { tag: TRIAL_TAGS.insight, score, detail: correct ? '一眼洞悉禁制真意。' : '参悟有失，仅得皮毛。', completedAt };
  }
  if (tag === 'support') {
    const score = 16 + Math.floor(random() * 2);
    return { tag: TRIAL_TAGS.support, score, detail: '以本源护住灵脉，泽被一方。', completedAt };
  }
  const roll = random();
  const score = roll < 0.2 ? 6 : roll < 0.8 ? 14 : 20;
  return {
    tag: TRIAL_TAGS.fate,
    score,
    detail: score >= 20 ? '于命运乱流中夺得上苍机缘。' : score >= 14 ? '穿越破碎未来，截留道痕。' : '为命运乱流所扰，负伤而返。',
    completedAt,
  };
}

function pickTianjiaoDaoHeart(preferred, random) {
  return random() < 0.55 ? preferred : TREASURE_DAO_HEARTS[Math.floor(random() * TREASURE_DAO_HEARTS.length)];
}

/**
 * 为择主之争注入天骄 AI 竞争者。
 * 天骄以 `tianjiao:名号` 作为参赛键，预生成完整参赛档案（3 次试炼 + 道心），
 * 可被 rankTreasureContest 正常纳入排名，但结算发奖时因非真实玩家而自动跳过。
 * 不推进 sealProgress（破封进度由真实玩家驱动）。
 * @returns 注入的天骄参赛者数组
 */
export function injectTianjiaoContestants(contest, treasureName, tianjiaoList, options = {}, random = Math.random) {
  if (!contest || contest.status !== 'open') return [];
  const profileData = getTreasureContestProfile(treasureName);
  const excluded = new Set(options.excludeNames || []);
  const pool = (tianjiaoList || [])
    .filter(tj => tj?.名号 && !excluded.has(tj.名号))
    .filter(tj => Number(tj.位面) >= 2); // 仅独立天骄（位面 2 / 2.5）参与
  if (pool.length === 0) return [];

  const maxCount = Math.min(Number(options.count) || 3, pool.length);
  const count = maxCount <= 2 ? maxCount : 2 + (random() < 0.6 ? 1 : 0);
  const shuffled = [...pool].sort(() => random() - 0.5);
  const selected = shuffled.slice(0, count);
  const now = Number(options.now) || Date.now();
  const entrants = [];

  for (const tianjiao of selected) {
    const key = `tianjiao:${tianjiao.名号}`;
    if (contest.participants[key]) continue;
    const tags = pickTianjiaoTrialTags(profileData.favoredTags, random);
    const trials = {};
    for (const tag of tags) {
      trials[tag] = simulateTianjiaoTrial(tag, tianjiao, random);
    }
    const rawScore = Object.values(trials).reduce((sum, trial) => sum + trial.score, 0);
    const trialScore = Math.max(40, Math.min(60, rawScore));
    const participant = {
      qq: key,
      name: tianjiao.名号,
      joinedAt: now,
      trials,
      trialScore,
      contribution: 3 + Math.floor(random() * 6),
      daoHeart: pickTianjiaoDaoHeart(profileData.daoHeart, random),
      isTianjiao: true,
      tianjiaoName: tianjiao.名号,
    };
    contest.participants[key] = participant;
    entrants.push(participant);
  }
  return entrants;
}

/** 判断参赛者是否为天骄 AI 竞争者 */
export function isTianjiaoContestant(qq) {
  return String(qq || '').startsWith('tianjiao:');
}

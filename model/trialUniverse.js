// 独立试炼路线：写时复制，回归才结算；主角色境界、背包和财产始终保留。
export const TRIAL_UNIVERSE_LOCATION = 0.6;
export const TRIAL_WORLDS = Object.freeze({
  末日: { name: '灰烬长夜', danger: 22, wounds: 24, horror: 8, intro: '太阳熄灭后的第七日，地下避难城开始按体温清点活人。', tasks: ['穿越灰雪街区，取得避难城坐标', '修复生命维持核心，护送最后一组幸存者', '守住黎明闸门，抵达回归信标'] },
  灵异: { name: '空号病院', danger: 26, wounds: 10, horror: 22, intro: '废弃病院每夜多出一张床，广播正在呼叫尚未出生之人的名字。', tasks: ['核对病房名册，识别虚构床位', '追查午夜广播，封存索命录音', '护送仍有影子的病人离开七号门'] },
  科幻: { name: '寂星协议', danger: 24, wounds: 22, horror: 12, intro: '远航舰队抵达了一颗由人类求救信号拼成的行星，舰载智能宣布全员已经死亡。', tasks: ['穿越失压甲板，恢复离线生命扫描', '夺回导航权限，识别复制船员', '关闭同化核心，发射逃生舱'] },
  不可名状: { name: '逆月之海', danger: 32, wounds: 8, horror: 30, intro: '月亮沉在海底，潮汐却从每个人的梦里上涨。直视真相的人逐渐忘记自己属于人类。', tasks: ['记录不会改写的潮汐刻度', '收集三枚沉梦锚，拒绝深海呼名', '遮蔽逆月，守住自我并点亮归航灯'] },
  魔幻: { name: '食誓王庭', danger: 25, wounds: 20, horror: 16, intro: '王国依靠吞食誓言延续，城中每座雕像都保留着上一位许愿者的心跳。', tasks: ['进入无声城，寻回被夺走的姓名', '破坏食誓祭坛，解开活人石化契约', '携带王庭罪证穿越断誓之门'] },
  修仙: { name: '葬仙药园', danger: 28, wounds: 26, horror: 12, intro: '仙宗药园里种着历代飞升者，所谓天赐仙露，正沿天穹裂隙一滴滴落下。', tasks: ['辨认活人药田，取得守园符令', '斩断采生阵脉，救出将被炼化的同伴', '熄灭接引仙灯，逃离伪飞升大阵'] },
});
const TYPES = Object.keys(TRIAL_WORLDS);
const MAX_POINTS = 1_000_000_000;
const GOODS = Object.freeze({ 医疗包: 60, 定神剂: 60, 界障护符: 100 });
const MODES = Object.freeze({
  谨慎: { progress: 1, ticks: 2, hp: 4, sanity: 3, danger: -8 },
  强攻: { progress: 2, ticks: 1, hp: 12, sanity: 4, danger: 15 },
  调查: { progress: 1, ticks: 1, hp: 3, sanity: 10, danger: 0 },
});
export const TRIAL_HELP = [
  '【试炼宇宙·主神空间】全民被传送于此，以命完成诸界任务，兑换强化，最终成神。',
  '#试炼宇宙 状态 / 世界 / 任务 / 规则',
  '#试炼宇宙 进入 末日|灵异|科幻|不可名状|魔幻|修仙 确认',
  '#试炼宇宙 行动 谨慎|强攻|调查；#试炼宇宙 结算',
  '#试炼宇宙 兑换 [医疗包|定神剂|界障护符]；#试炼宇宙 使用 [物品]',
  '#试炼宇宙 强化 [体魄|精神]；#试炼宇宙 成神 确认；#试炼宇宙 重生 确认',
  '每次行动都有实际代价与遇险概率；先看任务中的精确风险。进入后完成三段任务才开放回归。',
].join('\n');
export const TRIAL_RULES = [
  '【试炼规则与死亡代价】',
  '三阶段各需4点进度，最多12格行动时限；仅主动行动或使用物品推进时限，离线不扣生命。',
  '谨慎：进度+1、时限+2；强攻：进度+2、时限+1，有情报时消耗1情报额外+1；调查：进度+1、情报+1、时限+1，但精神消耗较高。情报上限3，阶段完成后保留。',
  '每次行动先付固定生命/精神代价，再判定额外遭遇；风险始终至少10%。任务面板列出当前精确数值。生命或精神归零、时限耗尽而任务未完成，均判本世死亡。',
  '重复世界会记住你：同类型每次历史通关提高2个百分点遇险率（最高+15），遭遇的生命/精神额外损伤各+2（最高+60）。历史难度在重生后仍保留，重复刷取并非无风险收益。',
  '回归结算：350积分，首次通关该类型另得500积分及本世凭证；主神空间免费修复生命和精神。奖励只在活着完成全部任务并结算后到账。',
  '死亡立即清空本世积分、强化、物品、通关凭证与本轮奖励；保留历史通关、死亡和最近履历。发送「重生 确认」以凡躯再来；原修仙角色境界和财产始终不受损。',
  '兑换和强化仅在主神空间；物品仅在任务中使用，每次占1格时限。护符减半下一次遭遇的额外损伤，不抵消固定代价。',
  '成神要求：本世六类通关凭证、体魄与精神各5级、3000积分；扣除3000积分，独立神阶成为真神，对应修仙境界「无境」。成神后保留独立路线，不提升主角色level_id。',
].join('\n');

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const integer = (value, maximum = MAX_POINTS) => Number.isSafeInteger(value) && value >= 0 && value <= maximum;
const maximum = (state, key) => 100 + state.body[key === 'hp' ? '体魄' : '精神'] * 8;
const newBody = () => ({ 体魄: 0, 精神: 0, hp: 100, sanity: 100 });
const starterBag = () => ({ 医疗包: 1, 定神剂: 1, 界障护符: 0 });

export function createTrialState(now = Date.now()) {
  ensure(integer(now, Number.MAX_SAFE_INTEGER), '时间参数异常。');
  return {
    version: 1, revision: 0, createdAt: now, status: 'active', place: '主神空间',
    body: newBody(), credits: 0, bag: starterBag(), run: null, seals: [],
    clears: 0, deaths: 0, clearedTypes: Object.fromEntries(TYPES.map(type => [type, 0])),
    divinity: '凡躯', realm: '', history: [], deathRecords: [], receipts: [],
  };
}

// 成神与待重生仍属于独立路线；即便异常存档缺失字段，位置标记也继续拦截普通指令。
export function isTrialUniverseActive(player) {
  return Boolean(player?.试炼宇宙) || Number(player?.power_place) === TRIAL_UNIVERSE_LOCATION;
}

export function getTrialCommandBlock(player, message) {
  if (!isTrialUniverseActive(player)) return '';
  if (/^#(?:试炼宇宙(?:\s|帮助(?:\s|$)|$)|我的练气$|我$|诸天帮助$|修仙帮助$|帮助$|世界(?:\s|$))/.test(String(message || '').trim())) return '';
  return '你已进入试炼宇宙，使用独立生命、积分与强化。普通修仙和穿梭暂停；发送 #试炼宇宙 状态 或 #试炼宇宙 帮助。';
}

export function assertTrialWriteCurrent(previous, next) {
  const before = previous?.试炼宇宙;
  if (!before) return;
  const after = next?.试炼宇宙;
  let valid = true;
  try { validateState(after); } catch { valid = false; }
  if (!valid || after.revision < before.revision || after.revision > before.revision + 1
    || (after.revision === before.revision && JSON.stringify(before) !== JSON.stringify(after))
    || Number(next.power_place) !== TRIAL_UNIVERSE_LOCATION
    || ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id', 'lunhui']
      .some(key => Number(previous[key] || 0) !== Number(next[key] || 0))) {
    const error = new Error('试炼宇宙存档已变化，请重新读取后操作。');
    error.code = 'TRIAL_UNIVERSE_STALE_WRITE';
    throw error;
  }
}

function validateTree(value, depth = 0) {
  ensure(depth <= 8, '试炼存档结构异常。');
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'number') { ensure(integer(value, Number.MAX_SAFE_INTEGER), '试炼数值异常。'); return; }
  if (typeof value === 'string') { ensure(value.length <= 6000, '试炼文本过长。'); return; }
  ensure(typeof value === 'object', '试炼存档结构异常。');
  ensure(Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)), '试炼存档对象异常。');
  ensure(Object.keys(value).length <= 100, '试炼存档条目异常。');
  for (const [key, child] of Object.entries(value)) {
    ensure(!['__proto__', 'constructor', 'prototype'].includes(key), '试炼存档键名异常。');
    validateTree(child, depth + 1);
  }
}

function validateState(state) {
  validateTree(state);
  ensure(state?.version === 1 && ['active', 'dead', 'ascended'].includes(state.status), '试炼存档版本或状态异常。');
  for (const key of ['revision', 'createdAt']) ensure(integer(state[key], Number.MAX_SAFE_INTEGER), '试炼版本号或时间异常。');
  for (const key of ['credits', 'clears', 'deaths']) ensure(integer(state[key]), `试炼字段${key}异常。`);
  ensure(state.body && ['体魄', '精神'].every(key => integer(state.body[key], 5)), '试炼强化数据异常。');
  ensure(integer(state.body.hp, maximum(state, 'hp')) && integer(state.body.sanity, maximum(state, 'sanity')), '试炼生命或精神数据异常。');
  ensure(state.bag && Object.keys(state.bag).every(key => Object.hasOwn(GOODS, key) && integer(state.bag[key], 99)), '试炼物品数据异常。');
  ensure(Array.isArray(state.seals) && state.seals.length <= 6 && new Set(state.seals).size === state.seals.length && state.seals.every(type => TYPES.includes(type)), '试炼凭证数据异常。');
  ensure(state.clearedTypes && Object.keys(state.clearedTypes).length === 6 && TYPES.every(type => integer(state.clearedTypes[type]))
    && Object.values(state.clearedTypes).reduce((sum, count) => sum + count, 0) === state.clears, '试炼通关记录异常。');
  ensure(state.seals.every(type => state.clearedTypes[type] > 0), '试炼凭证缺少通关记录。');
  ensure(Array.isArray(state.history) && state.history.length <= 24 && state.history.every(record => integer(record.at, Number.MAX_SAFE_INTEGER) && typeof record.command === 'string' && typeof record.message === 'string'), '试炼履历异常。');
  ensure(Array.isArray(state.receipts) && state.receipts.length <= 64 && state.receipts.every(record => typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 200 && typeof record.message === 'string')
    && new Set(state.receipts.map(record => record.id)).size === state.receipts.length, '试炼消息记录异常。');
  ensure(Array.isArray(state.deathRecords) && state.deathRecords.length <= 20 && state.deathRecords.every(record => integer(record.life) && record.life > 0 && record.life <= state.deaths && integer(record.at, Number.MAX_SAFE_INTEGER) && typeof record.reason === 'string'), '试炼死亡记录异常。');
  const run = state.run;
  ensure(run === null || (run && TYPES.includes(run.type) && integer(run.stage, 3) && integer(run.progress, 3)
    && integer(run.ticks, 12) && integer(run.intel, 3) && typeof run.ward === 'boolean'
    && (run.stage < 3 || run.progress === 0) && (run.stage === 3 || run.ticks < 12)
    && integer(run.enteredAt, Number.MAX_SAFE_INTEGER)), '试炼任务数据异常。');
  ensure(state.place === (run ? TRIAL_WORLDS[run.type].name : '主神空间'), '试炼位置记录异常。');
  ensure(state.status === 'dead' ? !run && state.body.hp === 0 && state.body.sanity === 0 && state.credits === 0
    && state.body.体魄 === 0 && state.body.精神 === 0 && state.seals.length === 0
    && Object.values(state.bag).every(count => count === 0)
    : state.body.hp > 0 && state.body.sanity > 0, '试炼生死记录异常。');
  ensure(state.status === 'ascended'
    ? !run && state.divinity === '真神' && state.realm === '无境' && state.body.体魄 === 5 && state.body.精神 === 5 && state.seals.length === 6
    : state.divinity === '凡躯' && state.realm === '', '试炼神阶记录异常。');
}

function checkEntry(player) {
  ensure(player && typeof player === 'object' && !player.试炼宇宙, '已有试炼宇宙记录，请查看状态。');
  ensure(!player.复活地球, '已有其他独立路线记录，请保留原有旅程。');
  ensure(Number(player.power_place) === 0, '请从凡间选择这条开局路线。');
  ensure(['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id'].every(key => {
    const value = Number(player[key] ?? 1);
    return Number.isInteger(value) && value >= 0 && value <= 1;
  }) && Number(player.lunhui || 0) === 0, '试炼宇宙入口仅接纳新凡人，已有修炼角色保留原路线。');
}

function riskFor(state, mode) {
  const run = state.run;
  const repeated = Math.min(15, state.clearedTypes[run.type] * 2);
  return Math.max(10, Math.min(70, TRIAL_WORLDS[run.type].danger + run.stage * 3 + repeated
    + MODES[mode].danger - run.intel * 6 - state.body.精神));
}

function costFor(state, mode, key) {
  return Math.max(1, MODES[mode][key] - Math.floor(state.body[key === 'hp' ? '体魄' : '精神'] / 2));
}

function encounterDamage(state, key) {
  return TRIAL_WORLDS[state.run.type][key] + Math.min(60, state.clearedTypes[state.run.type] * 2);
}

function formatTask(state) {
  if (state.status === 'dead') return '本世已死亡；发送 #试炼宇宙 重生 阅读清零规则，确认后再度降临。';
  if (state.status === 'ascended') return '六道凭证已铸成神位：真神，对应修仙境界「无境」。本篇终局已达成。';
  const run = state.run;
  if (!run) return '你在主神空间。查看「世界」，准备物品与强化后发送 #试炼宇宙 进入 末日 确认。';
  const world = TRIAL_WORLDS[run.type];
  return [
    `【${world.name}·${run.type}】${world.intro}`,
    ...world.tasks.map((task, index) => `${index < run.stage ? '✓' : index === run.stage ? '→' : '·'} 阶段${index + 1}：${task}${index === run.stage ? `（${run.progress}/4）` : ''}`),
    `时限${run.ticks}/12｜情报${run.intel}/3｜护符${run.ward ? '生效中' : '未启用'}`,
    run.stage === 3 ? '三段任务已完成，停止行动，发送 #试炼宇宙 结算 活着回归并领取奖励。'
      : Object.keys(MODES).map(mode => `${mode}：进度+${MODES[mode].progress + (mode === '强攻' && run.intel > 0 ? 1 : 0)}、时限+${MODES[mode].ticks}、生命-${costFor(state, mode, 'hp')}、精神-${costFor(state, mode, 'sanity')}；遇险${riskFor(state, mode)}%`).join('\n'),
    `遭遇追加：生命-${encounterDamage(state, 'wounds')}、精神-${encounterDamage(state, 'horror')}${run.ward ? '（已启用护符减半）' : ''}；此类型历史通关${state.clearedTypes[run.type]}次，任何行动均非零风险。`,
  ].join('\n');
}

export function formatTrialStatus(state) {
  if (!state) return `${TRIAL_HELP}\n先发送 #踏入仙途，再选择 #降临 试炼宇宙；已创建的新凡人也可发送 #试炼宇宙 入界 阅读规则。`;
  validateState(state);
  return [
    `【试炼宇宙】${state.place}｜第${state.deaths + (state.status === 'dead' ? 0 : 1)}世｜${state.status === 'dead' ? '等待重生' : state.divinity}`,
    `生命${state.body.hp}/${maximum(state, 'hp')}｜精神${state.body.sanity}/${maximum(state, 'sanity')}｜积分${state.credits}`,
    `强化：体魄${state.body.体魄}/5、精神${state.body.精神}/5｜历史通关${state.clears}｜死亡${state.deaths}`,
    `本世凭证${state.seals.length}/6：${state.seals.join('、') || '尚无'}｜物品：${Object.entries(state.bag).map(([name, count]) => `${name}×${count}`).join('、') || '无'}`,
    state.status === 'ascended' ? '神阶：真神｜对应修仙境界：无境（独立神位，不改主角色境界）' : '终极目标：六类凭证 + 体魄/精神各5级 + 3000积分，成神对应「无境」。',
    formatTask(state),
    '发送 #试炼宇宙 帮助 查看命令；#试炼宇宙 规则 查看死亡代价。',
  ].join('\n');
}

function die(state, reason, now) {
  state.deaths++;
  state.deathRecords = [...state.deathRecords, { life: state.deaths, at: now, reason,
    world: state.run.type, credits: state.credits, body: { ...state.body }, seals: [...state.seals] }].slice(-20);
  Object.assign(state, { status: 'dead', place: '主神空间', credits: 0, bag: {}, run: null, seals: [], body: { 体魄: 0, 精神: 0, hp: 0, sanity: 0 } });
  return `【本世死亡】${reason}\n本轮奖励、本世积分、强化、物品和凭证已清空，历史记录保留；原修仙角色未受影响。发送 #试炼宇宙 重生 确认 重新开始。`;
}

function checkSurvival(state, now) {
  if (state.body.hp <= 0) return die(state, '生命耗尽，试炼终止。', now);
  if (state.body.sanity <= 0) return die(state, '精神崩溃，自我被世界吞没。', now);
  if (state.run.ticks >= 12 && state.run.stage < 3) return die(state, '任务时限耗尽，回归信标永久熄灭。', now);
  return '';
}

function perform(state, command, now, random) {
  const [verb, arg, confirm, ...extra] = command.split(/\s+/);
  ensure(extra.length === 0, '命令参数过多，请查看 #试炼宇宙 帮助。');
  if (verb === '重生') {
    ensure(state.status === 'dead', '当前仍活着，请继续本世旅程。');
    ensure(arg === '确认' && !confirm, '重生清空本世进度，以凡躯和两份基础补给重来；保留历史。发送 #试炼宇宙 重生 确认。');
    Object.assign(state, { status: 'active', body: newBody(), bag: starterBag() });
    return '你再次在主神空间睁眼。过去的死亡仍记在档案里，此世从凡躯开始。查看「世界」，谨慎选择下一场试炼。';
  }
  ensure(state.status !== 'dead', '本世已死亡，请发送 #试炼宇宙 重生 确认。');
  ensure(state.status !== 'ascended', '你已成神，对应无境；本篇终局已达成，独立神位永久保留。');
  if (verb === '进入') {
    ensure(!state.run, '已有进行中的试炼，请先完成任务并结算。');
    const type = arg === '确认' || !arg ? TYPES.find(name => !state.seals.includes(name)) || '末日' : arg;
    ensure(TYPES.includes(type), '世界类型：末日、灵异、科幻、不可名状、魔幻、修仙。');
    ensure((arg === '确认' && !confirm) || confirm === '确认', `${TRIAL_WORLDS[type].intro}\n进入后完成三段任务才能回归；生命、精神或时限耗尽即本世死亡，清空本世积分、强化、物品和凭证。发送 #试炼宇宙 进入 ${type} 确认。`);
    state.run = { type, stage: 0, progress: 0, ticks: 0, intel: 0, ward: false, enteredAt: now };
    state.place = TRIAL_WORLDS[type].name;
    return `【强制投放开始】你的编号从主神光幕上隐去。\n${formatTask(state)}`;
  }
  if (verb === '行动') {
    ensure(state.run && state.run.stage < 3, '先进入试炼；任务完成后请结算回归。');
    ensure(Object.hasOwn(MODES, arg) && !confirm, '行动选择：谨慎、强攻、调查。发送 #试炼宇宙 任务 查看代价。');
    const mode = MODES[arg];
    const run = state.run;
    const world = TRIAL_WORLDS[run.type];
    const risk = riskFor(state, arg);
    const roll = random();
    ensure(typeof roll === 'number' && Number.isFinite(roll) && roll >= 0 && roll < 1, '随机参数异常，本次行动未结算。');
    const incident = roll < risk / 100;
    const progress = mode.progress + (arg === '强攻' && run.intel > 0 ? 1 : 0);
    if (arg === '强攻' && run.intel > 0) run.intel--;
    if (arg === '调查') run.intel = Math.min(3, run.intel + 1);
    const protection = run.ward && incident ? 0.5 : 1;
    state.body.hp = Math.max(0, state.body.hp - costFor(state, arg, 'hp') - (incident ? Math.ceil(encounterDamage(state, 'wounds') * protection) : 0));
    state.body.sanity = Math.max(0, state.body.sanity - costFor(state, arg, 'sanity') - (incident ? Math.ceil(encounterDamage(state, 'horror') * protection) : 0));
    if (incident) run.ward = false;
    run.ticks += mode.ticks;
    run.progress += progress;
    let completed = '';
    if (run.progress >= 4) { completed = `阶段${run.stage + 1}完成：${world.tasks[run.stage]}。`; run.stage++; run.progress = 0; }
    // 超出时限的行动即使推进到终点也失败；恰在第12格完成可回归。
    const dead = run.ticks > 12 ? die(state, '行动越过任务时限，回归信标熄灭。', now) : checkSurvival(state, now);
    if (dead) return dead;
    return `${arg}推进${progress}点，遇险概率${risk}%：${incident ? '遭遇灾厄，受到额外伤害' : '暂时避开异常'}。${completed}\n生命${state.body.hp}｜精神${state.body.sanity}｜时限${run.ticks}/12。\n${run.stage === 3 ? '全部任务完成！发送 #试炼宇宙 结算 回归。' : `下一步：${world.tasks[run.stage]}（${run.progress}/4），可查看「任务」再行动。`}`;
  }
  if (verb === '结算') {
    ensure(!arg && !confirm && state.run?.stage === 3, '尚未完成三段任务，奖励暂未到账。');
    const type = state.run.type;
    const first = !state.seals.includes(type);
    const reward = 350 + (first ? 500 : 0);
    state.credits += reward;
    state.clears++;
    state.clearedTypes[type]++;
    if (first) state.seals.push(type);
    state.run = null;
    state.place = '主神空间';
    state.body.hp = maximum(state, 'hp');
    state.body.sanity = maximum(state, 'sanity');
    return `你活着回到了主神空间。${type}试炼结算：积分+${reward}${first ? `，获得本世「${type}」通关凭证` : ''}；生命与精神已修复。当前积分${state.credits}。可兑换物品或强化自身。`;
  }
  if (verb === '使用') {
    ensure(state.run && state.run.stage < 3, '物品用于进行中的试炼，主神空间在回归时修复生命与精神。');
    ensure(Object.hasOwn(GOODS, arg) && !confirm, '可用物品：医疗包、定神剂、界障护符。');
    ensure(state.bag[arg] > 0, `缺少${arg}，回归后可兑换。`);
    if (arg === '界障护符') { ensure(!state.run.ward, '已有生效中的界障护符。'); state.run.ward = true; }
    else {
      const key = arg === '医疗包' ? 'hp' : 'sanity';
      ensure(state.body[key] < maximum(state, key), `${arg === '医疗包' ? '生命' : '精神'}已满，保留补给。`);
      state.body[key] = Math.min(maximum(state, key), state.body[key] + 45);
    }
    state.bag[arg]--;
    state.run.ticks++;
    return checkSurvival(state, now) || `使用${arg}，占用1格时限。生命${state.body.hp}｜精神${state.body.sanity}｜时限${state.run.ticks}/12。`;
  }
  ensure(!state.run, '此操作需回归主神空间后进行。');
  if (verb === '兑换') {
    ensure(Object.hasOwn(GOODS, arg) && !confirm, '兑换物品：医疗包60积分、定神剂60积分、界障护符100积分。');
    ensure(state.credits >= GOODS[arg], `积分不足：兑换${arg}需要${GOODS[arg]}积分。`);
    ensure((state.bag[arg] || 0) < 99, '该物品持有上限99。');
    state.credits -= GOODS[arg];
    state.bag[arg] = (state.bag[arg] || 0) + 1;
    return `兑换${arg}×1，扣除${GOODS[arg]}积分；剩余${state.credits}积分。`;
  }
  if (verb === '强化') {
    ensure(['体魄', '精神'].includes(arg) && !confirm, '强化方向：体魄、精神；升到下一等级消耗120×目标等级积分，最高5级。');
    ensure(state.body[arg] < 5, '该方向强化已达5级上限。');
    const price = 120 * (state.body[arg] + 1);
    ensure(state.credits >= price, `积分不足：下一级${arg}强化需要${price}积分。`);
    state.credits -= price;
    state.body[arg]++;
    state.body.hp = maximum(state, 'hp');
    state.body.sanity = maximum(state, 'sanity');
    return `${arg}强化至${state.body[arg]}级，扣除${price}积分；生命与精神修复。每级对应上限+8，每两级减少对应固定行动消耗1点；精神每级还降低遇险1个百分点。`;
  }
  if (verb === '成神') {
    ensure(arg === '确认' && !confirm, '成神将消耗3000积分，须本世六类凭证与体魄/精神各5级。发送 #试炼宇宙 成神 确认。');
    ensure(state.seals.length === 6 && state.body.体魄 === 5 && state.body.精神 === 5 && state.credits >= 3000,
      `神位尚缺：本世凭证${state.seals.length}/6、体魄${state.body.体魄}/5、精神${state.body.精神}/5、积分${state.credits}/3000。`);
    state.credits -= 3000;
    Object.assign(state, { status: 'ascended', divinity: '真神', realm: '无境' });
    return '六道世界凭证在虚空中燃成神环。你不再是等待投放的编号，而是立于诸界灾厄尽头的真神。\n【终局·成神】修仙境界对应「无境」。独立神位已封存；原修仙境界与财产保留。';
  }
  throw new Error('未知试炼命令，请发送 #试炼宇宙 帮助。');
}

export function runTrialCommand(player, command = '状态', { now = Date.now(), random = Math.random, requestId = '' } = {}) {
  try {
    ensure(typeof command === 'string' && command.length <= 200, '试炼命令格式异常。');
    command = command.replace(/^#试炼宇宙(?:\s+|$)/, '').trim().replace(/\s+/g, ' ') || '状态';
    ensure(integer(now, Number.MAX_SAFE_INTEGER) && typeof random === 'function', '时间或随机参数异常。');
    ensure(typeof requestId === 'string' && requestId.length <= 200, '消息标识异常。');
    if (command === '帮助' || command === '规则') return { ok: true, changed: false, message: command === '帮助' ? TRIAL_HELP : TRIAL_RULES };
    const previous = player?.试炼宇宙;
    if (previous) validateState(previous);
    if (command === '状态') return { ok: true, changed: false, message: formatTrialStatus(previous) };
    if (command === '世界') return { ok: true, changed: false, message: TYPES.map(type => `【${type}·${TRIAL_WORLDS[type].name}】${TRIAL_WORLDS[type].intro}\n三段任务：${TRIAL_WORLDS[type].tasks.join(' → ')}`).join('\n\n') };
    if (command === '兑换') return { ok: true, changed: false, message: '【兑换】医疗包60积分：恢复45生命；定神剂60积分：恢复45精神；界障护符100积分：下一次遭遇额外损伤减半。兑换仅在主神空间，使用仅在试炼，每次占1格时限。' };
    if (command === '强化') return { ok: true, changed: false, message: '【强化】体魄提升生命上限，精神提升精神上限并降低遇险；每级对应上限+8，每两级减少对应行动固定消耗1。下一级价格120×目标等级积分，两方向最高5级；发送 强化 体魄 或 强化 精神。' };
    if (command === '任务' || command === '履历') {
      ensure(previous, '先发送 #试炼宇宙 入界 阅读规则。');
      return { ok: true, changed: false, message: command === '任务' ? formatTask(previous) : `【最近试炼履历】\n${previous.history.map(record => `${record.at}｜${record.command}\n${record.message}`).join('\n') || '旅程尚未开始。'}\n【死亡记录】\n${previous.deathRecords.map(record => `第${record.life}世·${record.world}：${record.reason}`).join('\n') || '无'} ` };
    }
    const receipt = requestId && previous?.receipts.find(record => record.id === requestId);
    if (receipt) return { ok: true, changed: false, message: `【已处理消息】${receipt.message}` };
    let state;
    let message;
    if (command === '入界' || command === '入界 确认') {
      checkEntry(player);
      ensure(command === '入界 确认', `${TRIAL_RULES}\n此路线仅接纳新凡人，普通修仙与穿梭暂停。发送 #试炼宇宙 入界 确认。`);
      state = createTrialState(now);
      message = '一道白光撕开了全球的天空。无论身在何处，所有人都在同一座无边广场醒来。\n头顶的主神光球宣告：这里没有无代价的救赎。走进诸界，完成任务，活着回来；用积分兑换力量，直到你自己成为神。\n【降临·试炼宇宙】已领取医疗包与定神剂各1份。发送 #试炼宇宙 世界 选择第一场试炼；#试炼宇宙 规则 查看死亡代价。';
    } else {
      ensure(previous, '先发送 #试炼宇宙 入界 阅读规则。');
      ensure(Number(player.power_place) === TRIAL_UNIVERSE_LOCATION, '位面位置与试炼记录不一致，请保留存档并检查。');
      state = structuredClone(previous);
      message = perform(state, command, now, random);
    }
    state.revision++;
    state.history = [...state.history, { at: now, command, message }].slice(-24);
    // ponytail: 与其他独立路线一致保留最近64条回执；如接入长期消息重放，再改为持久事件去重表。
    if (requestId) state.receipts = [...state.receipts, { id: requestId, message }].slice(-64);
    validateState(state);
    player.试炼宇宙 = state;
    player.power_place = TRIAL_UNIVERSE_LOCATION;
    return { ok: true, changed: true, message };
  } catch (error) {
    return { ok: false, changed: false, message: error.message };
  }
}

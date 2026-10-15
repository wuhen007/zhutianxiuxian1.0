// 原创独立位面；所有战斗、修炼、探索都先保存行动，到期再兑现。
export const SWORD_MAGIC_LOCATION = 0.7;
const MINUTE = 60_000;
const MAX = 1_000_000_000;
const ok = (condition, message) => { if (!condition) throw new Error(message); };
const integer = (n, max = MAX) => Number.isSafeInteger(n) && n >= 0 && n <= max;
const own = (object, key) => Object.hasOwn(object, key);

export const SWORD_MAGIC_TRAITS = Object.freeze([
  { id: 'spirit', name: '精灵亲和', weight: 12, desc: '能听见低阶精灵；风鸣林可通过精灵交涉，解锁独有线索。' },
  { id: 'element', name: '元素亲和', weight: 18, desc: '魔法训练额外获得2点熟练度；法术应对的魔力消耗减少3点。' },
  { id: 'mana', name: '魔力超群', weight: 8, desc: '魔力上限增加35，适合持续施法。' },
  { id: 'silent', name: '无吟唱者', weight: 2, desc: '无需口述咒文；施法应对缩短2分钟，解锁静默解析古代封印。' },
  { id: 'sword', name: '剑术直觉', weight: 18, desc: '武力增加6；剑术训练额外获得2点熟练度。' },
  { id: 'holy', name: '圣印共鸣', weight: 12, desc: '祷告训练额外获得2点熟练度；净化消耗减少3点魔力。' },
  { id: 'wanderer', name: '旅人洞察', weight: 20, desc: '探索缩短1分钟；调查时能发现额外的遗迹材料。' },
  { id: 'will', name: '逆境意志', weight: 10, desc: '每次冒险受伤减少4点；不会免除战败或疗养代价。' },
]);
const TRAIT_IDS = SWORD_MAGIC_TRAITS.map(trait => trait.id);
export const SWORD_MAGIC_PROFESSIONS = Object.freeze({
  剑士: { skill: '剑术', desc: '以斗气和身法迎战，正面突破最为稳健。' },
  魔法师: { skill: '魔法', desc: '操纵元素与术式，擅长解析法阵。' },
  僧侣: { skill: '祷告', desc: '以誓愿引导圣术，擅长净化与庇护。' },
  游侠: { skill: '侦察', desc: '追踪、射击与野外生存，擅长调查和迂回。' },
});
const GOODS = Object.freeze({
  野营口粮: { price: 8, description: '出发探索消耗1份。' },
  疗伤药: { price: 18, description: '3分钟治疗，恢复60生命。' },
  魔力药: { price: 22, description: '3分钟调息，恢复50魔力。' },
  古代晶片: { price: 0, description: '遗迹材料，用于铸造职业武装。' },
});
export const SWORD_MAGIC_REGIONS = Object.freeze([
  { name: '风鸣林', level: 1, minutes: 6, threat: 12, reward: 45, item: 2,
    intro: '木精灵的歌声断在一棵倒生的树前。失踪的采药人留下半张骑士征收令，落款是四百年前就已撤销的税务厅。',
    mystery: '树根中封着王室铸造的魔力钉——征收旧约从未被废除，只是被改名为「生态修复」。林中异变来自旧约苏醒的悸动。',
    choices: ['救援', '调查', '精灵交涉'] },
  { name: '灰钟地窟', level: 2, minutes: 8, threat: 18, reward: 60, item: 2,
    intro: '废弃钟楼下的亡灵每天重复同一次祈祷，为某个不被允许提及的人。圣堂公告却说此地从未安葬过人。',
    mystery: '亡灵守着被抹去姓名的工程师。古钟曾为王国抽取地脉计时；他查清了地脉炉的用途，于是连名字都成了禁忌。',
    choices: ['强攻', '净化', '调查'] },
  { name: '雾桥驿', level: 3, minutes: 10, threat: 25, reward: 75, item: 2,
    intro: '商路上出现魔族难民，他们宁可进入仇视自己的王国也不愿留在故乡。领主要求封桥，公会却要你护送持有旧时代地图的孩子。',
    mystery: '地图标明的灾变中心位于王都，而非宣传中的魔王领。魔族逃离的不是战乱，是正在失修的裂隙。',
    choices: ['救援', '调查', '强攻'] },
  { name: '断冠遗迹', level: 4, minutes: 12, threat: 32, reward: 90, item: 3,
    intro: '王冠残片悬在无声大厅，四百年的尘埃不敢落在上面。凡是念出咒文的人，都会被封印当作入侵者。',
    mystery: '历代勇者的誓约记录于此，每一份都在为地脉炉支付代价；断冠者拒绝的从来不是责任，而是谎言。',
    choices: ['法术', '静默解析', '调查'] },
  { name: '黑曜边城', level: 5, minutes: 14, threat: 40, reward: 110, item: 3,
    intro: '魔王的守军正在抵挡裂隙，城墙上的抓痕朝向城外。城外人类军团的旗帜上，刻着与你遗迹武装相同的纹章。',
    mystery: '魔王是守隙之职，勇者是封印之职；两种力量曾共同维护世界，如今却在史书的两端互相仇杀。',
    choices: ['救援', '法术', '净化'] },
  { name: '裂月王庭', level: 6, minutes: 16, threat: 48, reward: 150, item: 4,
    intro: '裂月将临，旧王庭的地脉炉开始吞噬大陆，炉火映得夜空如凝固的血。你要决定谁来承担封印，以及如何改写旧约。',
    mystery: '王国、圣堂与魔族都只保存了旧约的一部分；六地证据拼出了最后的解法，也拼出了四百年前那个夜晚的完整真相。',
    choices: ['重铸勇者誓约', '织补地脉', '继承守隙王冠'] },
]);

export const SWORD_MAGIC_LORE = [
  '【剑与魔法·艾瑟兰大陆】',
  '断冠纪元第417年。封建领主掌握田地与骑士，商路城邦以公会维持秩序；法术学院向贵族与平民学徒同时收取昂贵学费，巡礼僧侣在乡野修筑庇护所。',
  '人类、森裔精灵、矮人与魔族依靠同一条世界地脉生存。地脉是世界的血液循环：魔法通过理解元素、构筑术式与支付魔力施展，咏唱帮助稳定术式；无吟唱者可以直接完成构筑，但仍受知识、魔力与熟练度限制。剑士以呼吸与斗气淬炼肉体，僧侣以誓愿和圣印引导地脉支流，游侠负责追踪与遗迹勘探。',
  '再往前是圣约纪元：古代王庭在地脉主脉上建成地脉炉，并立下旧约——勇者司封印，魔王司守隙，两职本是一体两面。四百一十七年前，断冠者折冠拒祭，王庭改写史书，旧约裂为三份残章，王国、圣堂与魔族各执其一。',
  '史书称勇者将击败魔王，精灵却记得另一份旧约。四百年间地脉炉无人维护，持续抽取地脉，魔力潮汐逐年紊乱——而裂月，将临。',
  '你从白桦镇出发。谁是敌人，要靠你的探索与证据判断，而不是史书；最终可成为黎明勇者、地脉贤者或守隙魔王。',
].join('\n\n');
export const SWORD_MAGIC_HELP = [
  '【剑与魔法·冒险手册】',
  '#剑与魔法 世界观 / 地图 / 状态 / 词条 / 见闻',
  '#抽取异界词条：一次抽取2条不重复天赋；#抽取命格词条 在此路线同样生效。',
  '#剑与魔法 就职 剑士|魔法师|僧侣|游侠',
  '#剑与魔法 训练 剑术|魔法|祷告|侦察：5分钟；帮工5分钟赚15铜币；休养10分钟免费。',
  '#剑与魔法 探索 风鸣林：到期出现事件；#剑与魔法 抉择 选项：继续计时。',
  '#剑与魔法 状态 或 结算：到期自动核对结果；途中可 #剑与魔法 撤离。',
  '#剑与魔法 商店 / 购买 野营口粮 2 / 使用 疗伤药 / 锻造',
  '#我的纳戒 或 #剑与魔法 背包：查看随身、仓储与探索收获。',
  '#剑与魔法 存入 物品 数量 / 取出 物品 数量 / 丢弃 物品 数量',
  '一名角色同时进行一个行动。每次探索、战斗、治疗与训练都需要现实时间；重启保持原期限。主线按地图顺序解锁，完成后提供可重复公会委托。',
].join('\n');

const has = (state, id) => state.traits.includes(id);
const caps = state => ({ hp: 100 + (state.level - 1) * 8,
  mp: 60 + (state.level - 1) * 6 + (has(state, 'mana') ? 35 : 0) });
const load = state => Object.values(state.bag).reduce((sum, n) => sum + n, 0)
  + Object.values(state.cargo).reduce((sum, n) => sum + n, 0);
const traitNames = state => state.traits.map(id => SWORD_MAGIC_TRAITS.find(trait => trait.id === id).name);
const items = bag => Object.entries(bag).filter(([, n]) => n > 0).map(([name, n]) => `${name}×${n}`).join('、') || '空';
function randomRoll(random) {
  const value = random();
  ok(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1, '随机源异常，本次操作未提交。');
  return value;
}
function changeItems(bag, name, amount) {
  ok(own(GOODS, name) && Number.isSafeInteger(amount), '物品或数量异常。');
  const next = (bag[name] || 0) + amount;
  ok(integer(next), `缺少${name}或数量超出范围。`);
  bag[name] = next;
}
function gainExp(state, amount) {
  state.exp += amount;
  while (state.level < 10 && state.exp >= state.level * 35) {
    state.exp -= state.level * 35;
    state.level++;
  }
}
export function createSwordMagicState(now = Date.now()) {
  ok(integer(now, Number.MAX_SAFE_INTEGER), '时间异常。');
  return { version: 1, revision: 0, createdAt: now, profession: '', traits: [], drawnAt: null,
    level: 1, exp: 0, coins: 120, hp: 100, mp: 60, wounded: false,
    skills: { 剑术: 0, 魔法: 0, 祷告: 0, 侦察: 0 }, place: '白桦镇', chapter: 0,
    bag: { 野营口粮: 2, 疗伤药: 2, 魔力药: 1 }, storage: {}, cargo: {}, weapon: false,
    companion: false, pact: false,
    action: null, encounter: null, lore: [], ending: '', defeats: 0, commissions: 0,
    history: [], receipts: [] };
}

function validateState(state) {
  ok(state?.version === 1 && integer(state.revision, Number.MAX_SAFE_INTEGER)
    && integer(state.createdAt, Number.MAX_SAFE_INTEGER), '异界存档版本异常。');
  ok(integer(state.level, 10) && state.level >= 1 && integer(state.exp)
    && integer(state.coins) && integer(state.chapter, 6) && integer(state.defeats)
    && integer(state.commissions), '异界成长记录异常。');
  ok(state.profession === '' || own(SWORD_MAGIC_PROFESSIONS, state.profession), '职业记录异常。');
  ok(Array.isArray(state.traits) && state.traits.length <= 2 && new Set(state.traits).size === state.traits.length
    && state.traits.every(id => TRAIT_IDS.includes(id))
    && (state.drawnAt === null ? state.traits.length === 0 : integer(state.drawnAt, Number.MAX_SAFE_INTEGER) && state.traits.length === 2), '天赋记录异常。');
  ok(integer(state.hp, caps(state).hp) && integer(state.mp, caps(state).mp)
    && ['wounded', 'weapon', 'companion', 'pact'].every(key => typeof state[key] === 'boolean'), '异界生命记录异常。');
  ok(state.skills && Object.keys(state.skills).length === 4
    && ['剑术', '魔法', '祷告', '侦察'].every(key => integer(state.skills[key], 30)), '职业熟练度异常。');
  for (const bag of [state.bag, state.storage, state.cargo]) {
    ok(bag && typeof bag === 'object' && !Array.isArray(bag)
      && Object.entries(bag).every(([name, count]) => own(GOODS, name) && integer(count)), '异界物品记录异常。');
  }
  ok(load(state) <= 12, '随身及探索收获合计上限12格。');
  ok(['白桦镇', ...SWORD_MAGIC_REGIONS.map(region => region.name)].includes(state.place), '异界位置异常。');
  ok(Array.isArray(state.lore) && state.lore.length === state.chapter
    && state.lore.every((name, i) => name === SWORD_MAGIC_REGIONS[i].name), '主线见闻记录异常。');
  ok(['', '黎明勇者', '地脉贤者', '守隙魔王'].includes(state.ending)
    && (state.chapter === 6) === Boolean(state.ending), '异界终局异常。');
  const a = state.action;
  ok(a === null || (a && ['train', 'work', 'rest', 'use', 'explore', 'choice', 'forge', 'return'].includes(a.kind)
    && integer(a.startedAt, Number.MAX_SAFE_INTEGER) && integer(a.endAt, Number.MAX_SAFE_INTEGER)
    && a.endAt > a.startedAt && typeof a.target === 'string'
    && integer(a.region, 5) && typeof a.repeat === 'boolean' && typeof a.title === 'string'
    && Number.isFinite(a.roll) && a.roll >= 0 && a.roll < 1), '异界行动记录异常。');
  if (a) {
    if (a.kind === 'train') ok(own(state.skills, a.target), '训练目标异常。');
    if (a.kind === 'use') ok(['疗伤药', '魔力药'].includes(a.target), '治疗记录异常。');
    if (['explore', 'choice'].includes(a.kind)) ok(state.place === SWORD_MAGIC_REGIONS[a.region].name, '探索位置异常。');
    if (a.kind === 'choice') ok(SWORD_MAGIC_REGIONS[a.region].choices.includes(a.target), '抉择记录异常。');
  }
  ok(state.encounter === null || (integer(state.encounter.region, 5) && typeof state.encounter.repeat === 'boolean'
    && state.place === SWORD_MAGIC_REGIONS[state.encounter.region].name && !a), '遭遇记录异常。');
  for (const [key, limit] of [['history', 16], ['receipts', 64]]) {
    ok(Array.isArray(state[key]) && state[key].length <= limit
      && state[key].every(item => typeof item.message === 'string'
        && (key === 'history' ? integer(item.at, Number.MAX_SAFE_INTEGER) : typeof item.id === 'string' && item.id.length > 0)), '异界履历异常。');
  }
  ok(new Set(state.receipts.map(receipt => receipt.id)).size === state.receipts.length, '消息凭证重复。');
}

export function isSwordMagicActive(player) {
  return Boolean(player?.剑与魔法) || Number(player?.power_place) === SWORD_MAGIC_LOCATION;
}
export function getSwordMagicCommandBlock(player, message) {
  if (!isSwordMagicActive(player)) return '';
  if (/^#(?:剑与魔法(?:\s|帮助(?:\s|$)|$)|抽取异界词条$|抽取词条$|抽取命格词条$|我的练气$|我$|我的纳戒$|纳戒$|背包$|修仙帮助$|诸天帮助$|世界(?:\s|$))/.test(String(message || '').trim())) return '';
  return '你正身处「剑与魔法」，使用独立职业、魔力与背包。发送 #剑与魔法 帮助 查看冒险指令。';
}
export function assertSwordMagicWriteCurrent(previous, next) {
  if (!previous?.剑与魔法) return;
  const before = previous.剑与魔法, after = next?.剑与魔法;
  let valid = true;
  try { validateState(after); } catch { valid = false; }
  if (!valid || after.revision < before.revision || after.revision > before.revision + 1
    || (after.revision === before.revision && JSON.stringify(after) !== JSON.stringify(before))
    || Number(next.power_place) !== SWORD_MAGIC_LOCATION
    || ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id', 'lunhui']
      .some(key => Number(previous[key] || 0) !== Number(next[key] || 0))) {
    const error = new Error('剑与魔法存档已变化，请读取最新记录再操作。');
    error.code = 'SWORD_MAGIC_STALE_WRITE';
    throw error;
  }
}

function status(state, now) {
  const limits = caps(state);
  return [
    `【剑与魔法·艾瑟兰】${state.profession || '未就职'} Lv.${state.level}｜${state.ending || '白桦镇的异乡人'}`,
    `生命${state.hp}/${limits.hp}｜魔力${state.mp}/${limits.mp}｜铜币${state.coins}｜经验${state.exp}/${state.level * 35}`,
    `天赋：${traitNames(state).join('、') || '尚未抽取，发送 #抽取异界词条'}；职业武装：${state.weapon ? '已锻造' : '未锻造'}`,
    `旅途羁绊：${state.companion ? '巡礼僧侣莉娅同行（战后治疗5）' : '尚无同行者'}；${state.pact ? '风精灵契约（施法消耗-2，回镇恢复魔力4）' : '尚未缔结精灵契约'}`,
    `熟练度：${Object.entries(state.skills).map(([name, n]) => `${name}${n}/30`).join('、')}`,
    `地点：${state.place}｜主线${state.chapter}/6｜公会委托${state.commissions}次｜重伤撤回${state.defeats}次`,
    state.action ? `行动：${state.action.title}｜${Math.max(0, Math.ceil((state.action.endAt - now) / 1000))}秒后完成`
      : state.encounter ? `事件：${SWORD_MAGIC_REGIONS[state.encounter.region].intro}\n选项：${SWORD_MAGIC_REGIONS[state.encounter.region].choices.join(' / ')}；发送 #剑与魔法 抉择 选项`
        : state.wounded ? '你需要休养或使用疗伤药。' : '当前空闲。可以训练、准备背包或探索地图。',
    '发送 #剑与魔法 帮助 查看规则；#我的纳戒 查看当前路线物资。',
  ].join('\n');
}
function begin(state, kind, title, minutes, target, now, random, extra = {}) {
  ok(!state.action, '已有行动正在进行，请查看状态或等待其完成。');
  const roll = ['explore', 'choice'].includes(kind) ? randomRoll(random) : 0;
  const endAt = now + Math.max(1, minutes) * MINUTE;
  ok(Number.isSafeInteger(endAt), '行动结束时间超出范围。');
  state.action = { kind, title, target, startedAt: now, endAt, roll, region: 0, repeat: false, ...extra };
  return `${title}已开始，预计${Math.max(1, minutes)}分钟。发送 #剑与魔法 状态 查看进度；到期后自动兑现。`;
}
function settle(state) {
  const a = state.action;
  state.action = null;
  if (a.kind === 'train') {
    const trait = { 剑术: 'sword', 魔法: 'element', 祷告: 'holy', 侦察: 'wanderer' }[a.target];
    const primary = SWORD_MAGIC_PROFESSIONS[state.profession].skill === a.target ? 1 : 0;
    state.skills[a.target] = Math.min(30, state.skills[a.target] + 3 + primary + (has(state, trait) ? 2 : 0));
    gainExp(state, 18);
    return `训练完成：${a.target}熟练度${state.skills[a.target]}/30，获得18经验。`;
  }
  if (a.kind === 'work') { state.coins += 15; return '白桦镇帮工完成，获得15铜币。'; }
  if (a.kind === 'rest') {
    state.hp = caps(state).hp; state.mp = caps(state).mp; state.wounded = false;
    return '在白桦镇休养完成，生命与魔力恢复，重伤已解除。';
  }
  if (a.kind === 'use') {
    if (a.target === '疗伤药') { state.hp = Math.min(caps(state).hp, state.hp + 60); state.wounded = false; }
    else state.mp = Math.min(caps(state).mp, state.mp + 50);
    return `使用${a.target}完成；生命${state.hp}，魔力${state.mp}。`;
  }
  if (a.kind === 'forge') { state.weapon = true; return '职业武装锻造完成，所有冒险应对能力增加8。'; }
  if (a.kind === 'return') {
    state.place = '白桦镇'; state.encounter = null; state.cargo = {};
    return '你已撤回白桦镇，未完成的本次探索没有发奖。';
  }
  const region = SWORD_MAGIC_REGIONS[a.region];
  if (a.kind === 'explore') {
    state.encounter = { region: a.region, repeat: a.repeat };
    return `抵达${region.name}。${region.intro}\n可选：${region.choices.join(' / ')}。调查或应对仍需时间，发送 #剑与魔法 抉择 选项。`;
  }
  const skill = ['法术', '静默解析', '织补地脉'].includes(a.target) ? '魔法'
    : ['净化', '继承守隙王冠'].includes(a.target) ? '祷告'
      : ['调查', '精灵交涉'].includes(a.target) ? '侦察' : '剑术';
  const primary = SWORD_MAGIC_PROFESSIONS[state.profession].skill === skill;
  const power = state.level * 5 + state.skills[skill] + (primary ? 7 : 0) + (state.weapon ? 8 : 0)
    + (skill === '剑术' && has(state, 'sword') ? 6 : 0)
    + (a.target === '精灵交涉' && has(state, 'spirit') ? 14 : 0)
    + (a.target === '静默解析' && has(state, 'silent') ? 14 : 0);
  const danger = Math.max(0.03, Math.min(0.65, (region.threat - power + 18) / 100));
  const hurt = Math.max(2, region.threat - Math.floor(power / 3) - (has(state, 'will') ? 4 : 0))
    + (a.roll < danger ? 30 : 0);
  state.hp = Math.max(0, state.hp - hurt);
  state.place = '白桦镇';
  if (state.hp === 0) {
    state.defeats++; state.hp = 1; state.wounded = true; state.cargo = {};
    state.coins -= Math.min(15, state.coins);
    return '你在冒险中重伤，被公会救援队送回白桦镇。本次收获遗失，支付至多15铜币救援费；休养后可再次挑战。';
  }
  const amount = Math.min(region.item + (a.target === '调查' ? 1 : 0)
    + (has(state, 'wanderer') && a.target === '调查' ? 1 : 0), 12 - load(state));
  changeItems(state.bag, '古代晶片', amount);
  state.coins += a.repeat ? Math.floor(region.reward / 2) : region.reward;
  gainExp(state, a.repeat ? 22 : 45);
  if (a.repeat) state.commissions++;
  else {
    if (a.region === 0 && a.target === '救援') state.companion = true;
    if (a.region === 0 && a.target === '精灵交涉') state.pact = true;
    state.lore.push(region.name); state.chapter++;
    if (state.chapter === 6) state.ending = {
      重铸勇者誓约: '黎明勇者', 织补地脉: '地脉贤者', 继承守隙王冠: '守隙魔王',
    }[a.target];
  }
  if (state.companion) state.hp = Math.min(caps(state).hp, state.hp + 5);
  if (state.pact) state.mp = Math.min(caps(state).mp, state.mp + 4);
  state.cargo = {};
  return `完成${region.name}的${a.repeat ? '公会委托' : '主线'}，遭遇伤害${hurt}，带回古代晶片×${amount}，铜币+${a.repeat ? Math.floor(region.reward / 2) : region.reward}。\n${a.repeat ? '重复委托不重复解锁主线见闻。' : `【见闻】${region.mystery}`}${!a.repeat && a.region === 0 ? state.companion ? '\n你救出了巡礼僧侣莉娅，她将同行并在每次冒险后治疗5生命。' : state.pact ? '\n风精灵与你缔结契约，后续施法减少2魔力，回镇恢复4魔力。' : '\n你带回了更完整的遗迹材料；调查将额外获得晶片。' : ''}${state.ending ? `\n【断冠纪元终章】你成为${state.ending}，你的决定已写入大陆史。` : ''}`;
}

function perform(state, command, now, random) {
  const [verb, target, countText, ...extra] = command.split(/\s+/);
  ok(extra.length === 0, '参数过多，请查看 #剑与魔法 帮助。');
  if (verb === '抽取词条') {
    ok(!target && state.drawnAt === null && !state.action, '开局词条每名角色仅抽取一次，当前行动中也暂缓抽取。');
    let pool = [...SWORD_MAGIC_TRAITS];
    for (let i = 0; i < 2; i++) {
      let point = randomRoll(random) * pool.reduce((sum, trait) => sum + trait.weight, 0);
      const trait = pool.find(item => (point -= item.weight) < 0) || pool.at(-1);
      state.traits.push(trait.id); pool = pool.filter(item => item.id !== trait.id);
    }
    state.drawnAt = now; state.mp = caps(state).mp;
    return `【异界开局词条】${state.traits.map(id => {
      const trait = SWORD_MAGIC_TRAITS.find(item => item.id === id);
      return `${trait.name}：${trait.desc}`;
    }).join('\n')}\n词条已保存，本角色不重复抽取。`;
  }
  if (verb === '就职') {
    ok(!state.action, '当前行动结束后再登记职业。');
    ok(!state.profession && own(SWORD_MAGIC_PROFESSIONS, target) && !countText, '选择一次职业：剑士、魔法师、僧侣、游侠。');
    ok(state.drawnAt !== null, '请先发送 #抽取异界词条，再根据天赋选择职业。');
    state.profession = target; state.skills[SWORD_MAGIC_PROFESSIONS[target].skill] = 5;
    return `你在白桦镇公会登记为${target}。${SWORD_MAGIC_PROFESSIONS[target].desc}`;
  }
  if (verb === '丢弃') {
    const count = Number(countText);
    ok(own(GOODS, target) && integer(count) && count > 0 && /^\d+$/.test(countText), '用法：丢弃 物品 正整数。');
    changeItems(state.bag, target, -count); return `已丢弃${target}×${count}。`;
  }
  if (verb === '撤离') {
    ok(!target && state.place !== '白桦镇' && (!state.action || state.action.kind === 'explore'), '只能中止行进或从尚未应对的遭遇撤离。');
    state.action = null; state.encounter = null;
    return begin(state, 'return', '撤回白桦镇', 3, '', now, random);
  }
  ok(!state.action, `当前正在${state.action?.title}，请等待完成。`);
  if (verb === '抉择') {
    ok(state.encounter && !countText, '先完成一段探索，再选择遭遇选项。');
    const { region: index, repeat } = state.encounter;
    const region = SWORD_MAGIC_REGIONS[index];
    ok(region.choices.includes(target), `本次选项：${region.choices.join('、')}。`);
    if (target === '精灵交涉') ok(has(state, 'spirit'), '精灵尚未回应你的声音，可选择救援或调查。');
    if (target === '静默解析') ok(has(state, 'silent'), '需要无吟唱者天赋；也可通过调查完成此遗迹。');
    if (index === 3 && target === '法术') ok(has(state, 'silent'), '无声大厅会响应咒文；可选择调查，拥有无吟唱者时也可施法或静默解析。');
    if (index === 5) {
      const required = { 重铸勇者誓约: '剑术', 织补地脉: '魔法', 继承守隙王冠: '祷告' }[target];
      ok(state.skills[required] >= 10 && state.weapon, `此结局需要${required}熟练度10与职业武装；可先撤离、训练、锻造再来。`);
    }
    const magic = ['法术', '静默解析', '净化', '织补地脉', '继承守隙王冠'].includes(target);
    const cost = magic ? Math.max(3, 12 - (has(state, 'element') ? 3 : 0)
      - (has(state, 'holy') && target === '净化' ? 3 : 0) - (state.pact ? 2 : 0)) : 0;
    ok(state.mp >= cost, '魔力不足，请撤离回镇补给，或选择其他应对方式。');
    state.mp -= cost;
    state.encounter = null;
    return begin(state, 'choice', `${region.name}·${target}`, magic && has(state, 'silent') ? 3 : 5, target, now, random, { region: index, repeat });
  }
  if (verb === '使用') {
    ok(['疗伤药', '魔力药'].includes(target) && !countText, '使用 疗伤药 或 魔力药。');
    ok((state.bag[target] || 0) > 0, `随身缺少${target}。`);
    const key = target === '疗伤药' ? 'hp' : 'mp';
    ok(state[key] < caps(state)[key] || (key === 'hp' && state.wounded), '当前状态已满，保留补给。');
    ok(!state.encounter, '遭遇期间先决定应对或撤离，治疗需在阶段间进行。');
    changeItems(state.bag, target, -1);
    return begin(state, 'use', `使用${target}`, 3, target, now, random);
  }
  ok(!state.encounter && state.place === '白桦镇', '先完成当前遭遇或撤离回白桦镇。');
  if (verb === '休养') {
    ok(!target, '用法：#剑与魔法 休养。');
    return begin(state, 'rest', '在白桦镇休养', 10, '', now, random);
  }
  if (verb === '帮工') {
    ok(!target, '用法：#剑与魔法 帮工。');
    return begin(state, 'work', '白桦镇公会帮工', 5, '', now, random);
  }
  if (verb === '购买' || verb === '存入' || verb === '取出') {
    const count = countText === undefined && verb === '购买' ? 1 : Number(countText);
    ok(own(GOODS, target) && integer(count, 99) && count > 0
      && (countText === undefined || /^\d+$/.test(countText)), '物品名称或数量有误，数量为1至99的整数。');
    if (verb !== '存入') ok(load(state) + count <= 12, '随身空间不足，请先存入仓储或整理背包。');
    if (verb === '购买') {
      ok(GOODS[target].price > 0, '古代晶片通过探索获得。');
      const cost = GOODS[target].price * count;
      ok(state.coins >= cost, `铜币不足，需要${cost}。`); state.coins -= cost;
    } else changeItems(verb === '存入' ? state.bag : state.storage, target, -count);
    changeItems(verb === '存入' ? state.storage : state.bag, target, count);
    return `${verb}${target}×${count}，随身${load(state)}/12格。`;
  }
  ok(state.profession && state.drawnAt !== null, '先抽取异界词条并就职，再进行冒险或训练。');
  if (verb === '训练') {
    ok(own(state.skills, target) && !countText, '训练方向：剑术、魔法、祷告、侦察；每项熟练度上限30，封顶后仍可获得经验。');
    ok(state.coins >= 10, '训练需要10铜币，可完成已开放地区的公会委托筹措。');
    state.coins -= 10; return begin(state, 'train', `${target}训练`, 5, target, now, random);
  }
  if (verb === '锻造') {
    ok(!target && !state.weapon && state.coins >= 60 && (state.bag.古代晶片 || 0) >= 4, '锻造一次职业武装需要60铜币与随身古代晶片×4。');
    state.coins -= 60; changeItems(state.bag, '古代晶片', -4);
    return begin(state, 'forge', '锻造职业武装', 15, '', now, random);
  }
  if (verb === '探索') {
    const index = SWORD_MAGIC_REGIONS.findIndex(region => region.name === target);
    ok(index >= 0 && !countText, '请按地图中的地区名探索。');
    const region = SWORD_MAGIC_REGIONS[index];
    ok(!state.wounded, '重伤期间先休养或使用疗伤药。');
    ok(index <= state.chapter && state.level >= region.level, `此地区需要前序主线与等级${region.level}，当前等级${state.level}。`);
    ok((state.bag.野营口粮 || 0) > 0 && load(state) <= 11, '探索需要野营口粮×1，并至少留1格收获空间。');
    changeItems(state.bag, '野营口粮', -1); state.place = region.name;
    return begin(state, 'explore', `前往${region.name}探索`, region.minutes - (has(state, 'wanderer') ? 1 : 0), target, now, random, { region: index, repeat: index < state.chapter });
  }
  throw new Error('未知指令，请发送 #剑与魔法 帮助。');
}

export function runSwordMagicCommand(player, command = '状态', { now = Date.now(), random = Math.random, requestId = '' } = {}) {
  let state, messages = [], progressed = false;
  const commit = (success, message) => {
    if (progressed) {
      state.revision++;
      state.history = [...state.history, { at: now, message }].slice(-16);
      // ponytail: 保留最近64条指令回执；核心天赋、主线和行动状态另外独立防重。
      if (requestId) state.receipts = [...state.receipts, { id: requestId, message }].slice(-64);
      validateState(state);
      player.剑与魔法 = state; player.power_place = SWORD_MAGIC_LOCATION;
    }
    return { ok: success, changed: progressed, message };
  };
  try {
    ok(typeof command === 'string' && command.length <= 160 && integer(now, Number.MAX_SAFE_INTEGER)
      && typeof requestId === 'string' && requestId.length <= 160, '指令、时间或消息标识异常。');
    command = command.trim().replace(/\s+/g, ' ') || '状态';
    if (command === '帮助') return { ok: true, changed: false, message: SWORD_MAGIC_HELP };
    if (command === '世界观') return { ok: true, changed: false, message: SWORD_MAGIC_LORE };
    if (!player?.剑与魔法) {
      ok(command === '入界 确认', '先发送 #踏入仙途，再选择 #降临 剑与魔法。');
      ok(!player.试炼宇宙 && !player.复活地球 && Number(player.power_place) === 0
        && ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id'].every(key => Number(player[key] ?? 1) === 1)
        && !Number(player.lunhui || 0), '这条路线接纳新凡人，已有角色沿原路线继续。');
      state = createSwordMagicState(now); progressed = true;
      return commit(true, '你在艾瑟兰的白桦镇醒来，公会为异乡人准备了基础补给。\n发送 #抽取异界词条 抽取两条开局天赋，再发送 #剑与魔法 就职 职业。\n#剑与魔法 世界观 查看断冠纪元的秘密。');
    }
    validateState(player.剑与魔法);
    ok(Number(player.power_place) === SWORD_MAGIC_LOCATION, '位面与角色记录不一致，请保留存档检查。');
    const receipt = requestId && player.剑与魔法.receipts.find(item => item.id === requestId);
    if (receipt) return { ok: true, changed: false, message: `【已处理消息】${receipt.message}` };
    state = structuredClone(player.剑与魔法);
    if (state.action && now >= state.action.endAt) {
      messages.push(settle(state)); progressed = true;
    }
    let message;
    if (command === '状态' || command === '结算') message = status(state, now);
    else if (command === '背包') message = `【异界随身物资】${load(state)}/12格\n${items(state.bag)}\n【白桦镇仓储】${items(state.storage)}\n【探索收获】${items(state.cargo)}\n取放仅在白桦镇空闲时进行；休养、治疗、锻造与探索都需时间。`;
    else if (command === '词条') message = `每个角色抽取2条不重复天赋。下表是首抽权重，第二抽剔除已抽词条后按剩余权重归一；并非两次均为相同概率。\n${SWORD_MAGIC_TRAITS.map(trait => `${trait.name} ${trait.weight}/100：${trait.desc}`).join('\n')}\n已获得：${traitNames(state).join('、') || '尚未抽取'}`;
    else if (command === '地图') message = SWORD_MAGIC_REGIONS.map((region, i) =>
      `${i <= state.chapter ? '已开放' : '待解锁'}｜${region.name} Lv.${region.level}｜探索${region.minutes}分钟＋应对5分钟\n${i <= state.chapter ? region.intro : '前序主线完成后揭示'}`
    ).join('\n\n');
    else if (command === '见闻') message = state.lore.map(name => { const region = SWORD_MAGIC_REGIONS.find(item => item.name === name); return `【${name}】${region.mystery}`; }).join('\n\n') || '你的见闻尚未成册，完成主线后记录亲自查得的证据。';
    else if (command === '商店') message = Object.entries(GOODS).filter(([, item]) => item.price).map(([name, item]) => `${name}：${item.price}铜币。${item.description}`).join('\n');
    else {
      const settled = structuredClone(state);
      try { message = perform(state, command, now, random); progressed = true; }
      catch (error) { state = settled; return commit(false, [...messages, error.message].join('\n\n')); }
    }
    return commit(true, [...messages, message].join('\n\n'));
  } catch (error) {
    return { ok: false, changed: false, message: error.message };
  }
}

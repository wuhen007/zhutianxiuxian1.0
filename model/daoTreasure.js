import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomically } from '../utils/atomicJson.js';

export const DAO_TREASURE_FORGE_YEARS = 50_000;
export const DAO_TREASURE_STAGE_YEARS = 10_000;
export const DAO_TREASURE_FIXED_ATTRIBUTES = 1_000_000_000_000;
export const DAO_TREASURE_ALL_ATTRIBUTE_BONUS = 300;
export const DAO_TREASURE_MAX_ORIGIN = 12;
export const DAO_TREASURE_EPOCH_RECOVERY = 4;
export const DAO_TREASURE_GUARD_TARGET = 3;

export const DAO_TREASURE_FUEL = Object.freeze({
  众生念力: 1000,
  鸿蒙道火: 100,
  界核: 50,
  宇宙核心: 10,
});

export const DAO_TREASURE_STAGES = Object.freeze([
  { name: '熔薪', lore: '众生愿念化作纪元薪火，文明积累自此投入大道炉。' },
  { name: '铸胚', lore: '宇宙核心为骨，界核为胎，至宝器胚在岁月中成形。', authority: '生死' },
  { name: '铭权', lore: '命数与天资被刻入器身，诸天因果重新排列。', authority: '命运' },
  { name: '养道', lore: '文明万法交汇为一，至宝开始自行推演大道。', authority: '万法' },
  { name: '渡劫', lore: '器胚承受纪元终劫，自身演化一方不灭世界。', authority: '世界' },
]);

export const DAO_TREASURE_AUTHORITIES = Object.freeze(['生死', '命运', '万法', '世界']);
export const DAO_TREASURE_REPAIR_TARGETS = Object.freeze(['本体', ...DAO_TREASURE_AUTHORITIES]);

export function getDaoTreasureForgeProgress(startWorldYear, worldYear) {
  const elapsed = Math.min(
    DAO_TREASURE_FORGE_YEARS,
    Math.max(0, Number(worldYear) - Number(startWorldYear))
  );
  return {
    elapsed,
    stageIndex: Math.min(
      DAO_TREASURE_STAGES.length,
      Math.floor(elapsed / DAO_TREASURE_STAGE_YEARS)
    ),
    completed: elapsed >= DAO_TREASURE_FORGE_YEARS,
  };
}

export const DAO_TREASURE_STATE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'resources',
  'data',
  'dao_treasure_state.json'
);

let stateQueue = Promise.resolve();

function defaultState() {
  return {
    version: 1,
    project: null,
    treasure: null,
  };
}

function normalizeState(value) {
  const state = value && typeof value === 'object' ? value : {};
  return {
    ...defaultState(),
    ...state,
    version: 1,
  };
}

export function readDaoTreasureState() {
  try {
    if (!fs.existsSync(DAO_TREASURE_STATE_FILE)) return defaultState();
    return normalizeState(JSON.parse(fs.readFileSync(DAO_TREASURE_STATE_FILE, 'utf8')));
  } catch (error) {
    console.error('[大道至宝] 读取状态失败', error.message);
    return defaultState();
  }
}

export function writeDaoTreasureState(state) {
  writeJsonAtomically(DAO_TREASURE_STATE_FILE, normalizeState(state));
}

async function withStateLock(task) {
  const previous = stateQueue;
  let release;
  stateQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

function makeStageStates() {
  return DAO_TREASURE_STAGES.map((stage, index) => ({
    index,
    name: stage.name,
    authority: stage.authority || '',
    guardians: {},
    closed: false,
    complete: null,
  }));
}

function fuelReady(fuel = {}) {
  return Object.entries(DAO_TREASURE_FUEL).every(
    ([name, target]) => (Number(fuel[name]) || 0) >= target
  );
}

export function createDaoTreasureItem(treasure) {
  if (!treasure?.name || !treasure?.ownerId) throw new Error('大道至宝归属无效');
  return {
    id: 39_000_001,
    name: treasure.name,
    class: '装备',
    type: '至宝',
    品阶: '大道至宝',
    大道至宝本体: true,
    author_name: String(treasure.ownerId),
    绑定者: String(treasure.ownerId),
    固定全属性: DAO_TREASURE_FIXED_ATTRIBUTES,
    全属性倍率加成: DAO_TREASURE_ALL_ATTRIBUTE_BONUS,
    atk: 0,
    def: 0,
    HP: 0,
    bao: 0,
    全属性: 0,
    出售价: 0,
    pinji: 6,
    稀有度: 10,
    数量: 1,
    islockd: 1,
    不可交易: true,
    完整度: treasure.integrity,
    成器世界年: treasure.completedWorldYear,
  };
}

export function isDaoTreasureItem(item) {
  return Boolean(item?.大道至宝本体 || item?.品阶 === '大道至宝');
}

export function isDaoTreasureOwner(ownerId, state = readDaoTreasureState()) {
  return Boolean(state.treasure && String(state.treasure.ownerId) === String(ownerId));
}

export function getDaoTreasureAuthorityStatus(authority, state = readDaoTreasureState()) {
  return state.treasure?.authorities?.[authority] || '未成器';
}

export function applyDaoTreasureBattleOpening(holder, opponent, options = {}) {
  const messages = [];
  if (!holder?.当前大道至宝 || !DAO_TREASURE_AUTHORITIES.includes(holder?.大道主权柄)) {
    return { active: false, holderSpeedMultiplier: 1, opponentSpeedMultiplier: 1, messages };
  }
  const state = options.state || readDaoTreasureState();
  if (String(holder.当前大道至宝) !== String(state.treasure?.name || '')
    || !isDaoTreasureOwner(holder.id, state)) {
    return { active: false, holderSpeedMultiplier: 1, opponentSpeedMultiplier: 1, messages };
  }
  const authority = holder.大道主权柄;
  if (getDaoTreasureAuthorityStatus(authority, state) !== '完整') {
    messages.push(`【大道残缺】${holder.当前大道至宝}的${authority}权柄尚未修复，本战无法敕令。`);
    return { active: false, holderSpeedMultiplier: 1, opponentSpeedMultiplier: 1, messages };
  }

  if (authority === '生死') {
    holder._大道生死护命 = true;
    opponent._大道生死断轮回 = true;
    messages.push(`【生死改写】${holder.名号}从生死簿上抹去己名，并删去${opponent.名号}一次复生结局。`);
  }
  if (authority === '命运') {
    holder._大道命运必定暴击 = true;
    opponent._大道命运阻断暴击 = true;
    messages.push(`【命运重书】${holder.名号}的首次攻伐必定暴击，${opponent.名号}的首次暴击则被命数否决。`);
  }
  if (authority === '万法') {
    holder._大道万法道痕 = 0;
    messages.push(`【诸法推演】${holder.名号}开始解析敌方法则，每三次攻伐完成一次终极反演。`);
  }
  if (authority === '世界') {
    holder._大道世界领域回合 = 5;
    holder._大道世界减伤 = 0.35;
    messages.push(`【一界镇压】${holder.当前大道至宝}展开大道界，五次行动内减伤35%、遁速提升30%，敌方遁速降低20%。`);
  }
  return {
    active: true,
    authority,
    holderSpeedMultiplier: authority === '世界' ? 1.3 : 1,
    opponentSpeedMultiplier: authority === '世界' ? 0.8 : 1,
    messages,
  };
}

export function resolveDaoTreasureCritical(attacker, multiplier) {
  let next = Number(multiplier) || 1;
  let message = '';
  if (attacker?._大道命运阻断暴击 && next > 1) {
    attacker._大道命运阻断暴击 = false;
    next = 1;
    message = `【命数否决】${attacker.名号}本应降临的暴击被大道从命途中删去。`;
  }
  if (attacker?._大道命运必定暴击) {
    attacker._大道命运必定暴击 = false;
    next = Math.max(next, Number(attacker.暴击伤害) || 1.5);
    message = `【命数既定】${attacker.名号}此击早已写在命运终章，必定暴击。`;
  }
  return { multiplier: next, message };
}

export function applyDaoTreasureLawDeduction(attacker, defender, damage, options = {}) {
  if (!attacker?._大道万法道痕 && attacker?._大道万法道痕 !== 0) {
    return { damage, triggered: false, message: '' };
  }
  attacker._大道万法道痕 += 1;
  if (attacker._大道万法道痕 < 3) {
    return {
      damage,
      triggered: false,
      message: `【万法道痕】${attacker.名号}已推演敌法${attacker._大道万法道痕}/3。`,
    };
  }
  attacker._大道万法道痕 = 0;
  const currentDamage = Math.max(0, Math.trunc(Number(damage) || 0));
  const maxHp = Math.max(1, Number(defender?.血量上限) || Number(defender?.当前血量) || 1);
  const isBoss = Boolean(options.isBoss);
  const cap = Math.floor(maxHp * (isBoss ? 0.1 : 0.3));
  const lawDamage = Math.max(1, Math.min(Math.floor(currentDamage * 0.7), cap));
  return {
    damage: currentDamage + lawDamage,
    lawDamage,
    triggered: true,
    message: `【万法反演】三道法痕归一，追加${lawDamage.toLocaleString('zh-CN')}点无视防御与减伤的法则伤害。`,
  };
}

export function tryDaoTreasureDeathRewrite(player) {
  if (!player?._大道生死护命 || Number(player.当前血量) > 0) {
    return { revived: false, messages: [] };
  }
  player._大道生死护命 = false;
  player.不可复活 = false;
  player.dongjie = false;
  player.当前血量 = Math.max(1, Math.floor((Number(player.血量上限) || 1) * 0.4));
  return {
    revived: true,
    messages: [
      `【生死改写】${player.名号}的死局被大道重新落笔，真灵越过轮回归来。`,
      `${player.名号}恢复40%生命，且本次复生不受禁活法则阻断。`,
    ],
  };
}

export function consumeDaoTreasureRevivalBlock(player) {
  if (!player?._大道生死断轮回 || Number(player.当前血量) > 0) return false;
  player._大道生死断轮回 = false;
  return true;
}

export function tickDaoTreasureDomain(player) {
  const rounds = Number(player?._大道世界领域回合) || 0;
  if (rounds <= 0) return '';
  player._大道世界领域回合 = rounds - 1;
  if (player._大道世界领域回合 > 0) return '';
  delete player._大道世界减伤;
  return `【大道界归隐】${player.名号}收束世界法则，一界镇压结束。`;
}

export function applyDaoTreasureDomainReduction(defender, damage) {
  const currentDamage = Math.max(0, Math.trunc(Number(damage) || 0));
  if (!defender?._大道世界领域回合 || !defender?._大道世界减伤) return currentDamage;
  return Math.trunc(currentDamage * (1 - defender._大道世界减伤));
}

export async function createDaoTreasureProject({ ownerId, ownerName, name, worldYear }) {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    if (state.treasure) return { ok: false, reason: 'already-completed', treasure: state.treasure };
    if (state.project && state.project.status !== 'cancelled') {
      return { ok: false, reason: 'project-exists', project: state.project };
    }

    const project = {
      id: `dao-${Date.now()}`,
      name,
      ownerId: String(ownerId),
      ownerName: ownerName || '无名炼器师',
      status: 'gathering',
      createdWorldYear: Number(worldYear) || 0,
      startWorldYear: null,
      targetWorldYear: null,
      stageIndex: -1,
      fuel: Object.fromEntries(Object.keys(DAO_TREASURE_FUEL).map(key => [key, 0])),
      contributors: {},
      stages: makeStageStates(),
      history: [{ type: 'created', worldYear: Number(worldYear) || 0, at: Date.now() }],
    };
    state.project = project;
    writeDaoTreasureState(state);
    return { ok: true, project };
  });
}

export async function contributeDaoTreasureFuel({
  contributorId,
  contributorName,
  itemName,
  amount,
  worldYear,
  consume,
}) {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    const originalState = structuredClone(state);
    const project = state.project;
    if (!project || project.status !== 'gathering') return { ok: false, reason: 'not-gathering' };
    const target = DAO_TREASURE_FUEL[itemName];
    if (!target) return { ok: false, reason: 'invalid-fuel' };
    const current = Number(project.fuel[itemName]) || 0;
    const accepted = Math.min(Math.max(0, Math.trunc(Number(amount) || 0)), target - current);
    if (accepted <= 0) return { ok: false, reason: 'fuel-full' };

    project.fuel[itemName] = current + accepted;
    const key = String(contributorId);
    const firstContribution = !project.contributors[key];
    const contributor = project.contributors[key] || {
      name: contributorName || key,
      total: 0,
      fuel: {},
      firstAt: Date.now(),
    };
    contributor.name = contributorName || contributor.name;
    contributor.total += accepted;
    contributor.fuel[itemName] = (Number(contributor.fuel[itemName]) || 0) + accepted;
    contributor.lastAt = Date.now();
    project.contributors[key] = contributor;

    let ignited = false;
    if (fuelReady(project.fuel)) {
      ignited = true;
      project.status = 'forging';
      project.startWorldYear = Number(worldYear) || 0;
      project.targetWorldYear = project.startWorldYear + DAO_TREASURE_FORGE_YEARS;
      project.stageIndex = 0;
      project.history.push({ type: 'ignited', worldYear: project.startWorldYear, at: Date.now() });
    }
    writeDaoTreasureState(state);
    try {
      await consume(accepted);
    } catch (error) {
      writeDaoTreasureState(originalState);
      throw error;
    }
    return { ok: true, accepted, ignited, firstContribution, project };
  });
}

function closeStage(project, stageIndex, worldYear) {
  const stage = project.stages[stageIndex];
  if (!stage || stage.closed) return null;
  const guardians = Object.keys(stage.guardians || {}).length;
  stage.closed = true;
  stage.complete = guardians >= DAO_TREASURE_GUARD_TARGET;
  stage.closedWorldYear = worldYear;
  project.history.push({
    type: 'stage-closed',
    stageIndex,
    guardians,
    complete: stage.complete,
    worldYear,
    at: Date.now(),
  });
  return { stageIndex, stage: { ...stage }, guardians };
}

function completeProject(state, worldYear, epoch) {
  const project = state.project;
  for (let index = 0; index < DAO_TREASURE_STAGES.length; index++) {
    closeStage(project, index, worldYear);
  }
  const authorities = {};
  for (const stage of project.stages) {
    if (stage.authority) authorities[stage.authority] = stage.complete ? '完整' : '残缺';
  }
  const completedStages = project.stages.filter(stage => stage.complete).length;
  const integrity = Math.round((completedStages / project.stages.length) * 100);
  const treasure = {
    id: project.id,
    name: project.name,
    ownerId: project.ownerId,
    ownerName: project.ownerName,
    completedWorldYear: worldYear,
    completedEpoch: Math.max(1, Math.trunc(Number(epoch) || 1)),
    integrity,
    body: project.stages[0].complete ? '完整' : '残缺',
    authorities,
    origin: DAO_TREASURE_MAX_ORIGIN,
    lastRecoveryEpoch: Math.max(1, Math.trunc(Number(epoch) || 1)),
    uses: {},
    ultimateTechnique: null,
    daoWorld: null,
    delivery: { status: 'pending', attempts: 0 },
  };
  project.status = 'completed';
  project.stageIndex = DAO_TREASURE_STAGES.length;
  project.completedWorldYear = worldYear;
  state.treasure = treasure;
  return treasure;
}

export async function advanceDaoTreasureProject(worldYear, epoch = 1) {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    const events = [];
    let changed = false;
    const project = state.project;

    if (project?.status === 'forging') {
      const progress = getDaoTreasureForgeProgress(project.startWorldYear, worldYear);
      const nextStageIndex = progress.stageIndex;
      while (project.stageIndex < nextStageIndex) {
        const closed = closeStage(project, project.stageIndex, Number(worldYear));
        if (closed) events.push({ type: 'stage-closed', ...closed });
        project.stageIndex += 1;
        changed = true;
        if (project.stageIndex < DAO_TREASURE_STAGES.length) {
          events.push({ type: 'stage-opened', stageIndex: project.stageIndex });
        }
      }
      if (progress.completed) {
        const treasure = completeProject(state, Number(worldYear), epoch);
        events.push({ type: 'completed', treasure });
        changed = true;
      }
    }

    const treasure = state.treasure;
    const safeEpoch = Math.max(1, Math.trunc(Number(epoch) || 1));
    if (treasure && safeEpoch > (Number(treasure.lastRecoveryEpoch) || 1)) {
      const elapsedEpochs = safeEpoch - (Number(treasure.lastRecoveryEpoch) || 1);
      const previous = Number(treasure.origin) || 0;
      treasure.origin = Math.min(
        DAO_TREASURE_MAX_ORIGIN,
        previous + elapsedEpochs * DAO_TREASURE_EPOCH_RECOVERY
      );
      treasure.lastRecoveryEpoch = safeEpoch;
      if (treasure.origin !== previous) events.push({ type: 'origin-recovered', amount: treasure.origin - previous });
      changed = true;
    }

    if (changed) writeDaoTreasureState(state);
    return { changed, events, state };
  });
}

export async function guardDaoTreasureStage({ playerId, playerName, worldYear }) {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    const project = state.project;
    if (!project || project.status !== 'forging') return { ok: false, reason: 'not-forging' };
    const stage = project.stages[project.stageIndex];
    if (!stage || stage.closed) return { ok: false, reason: 'stage-closed' };
    const key = String(playerId);
    if (stage.guardians[key]) return { ok: false, reason: 'already-guarded', stage };
    stage.guardians[key] = { name: playerName || key, worldYear: Number(worldYear) || 0, at: Date.now() };
    project.history.push({ type: 'guarded', stageIndex: project.stageIndex, playerId: key, worldYear, at: Date.now() });
    writeDaoTreasureState(state);
    return {
      ok: true,
      stage,
      guardians: Object.keys(stage.guardians).length,
      target: DAO_TREASURE_GUARD_TARGET,
    };
  });
}

export function getPendingDaoTreasureDelivery(state = readDaoTreasureState()) {
  const treasure = state.treasure;
  if (!treasure || treasure.delivery?.status === 'delivered') return null;
  return { treasure, item: createDaoTreasureItem(treasure) };
}

export async function markDaoTreasureDelivered() {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    if (!state.treasure) return false;
    state.treasure.delivery = { status: 'delivered', deliveredAt: Date.now() };
    writeDaoTreasureState(state);
    return true;
  });
}

export async function spendDaoTreasureOrigin({ ownerId, cost, useKey, mutate }) {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    const originalState = structuredClone(state);
    const treasure = state.treasure;
    if (!treasure || String(treasure.ownerId) !== String(ownerId)) {
      return { ok: false, reason: 'not-owner' };
    }
    if (useKey && treasure.uses?.[useKey]) return { ok: false, reason: 'already-used' };
    const price = Math.max(0, Math.trunc(Number(cost) || 0));
    if ((Number(treasure.origin) || 0) < price) {
      return { ok: false, reason: 'insufficient-origin', current: Number(treasure.origin) || 0 };
    }
    treasure.origin -= price;
    if (useKey) treasure.uses[useKey] = { at: Date.now(), cost: price };
    writeDaoTreasureState(state);
    try {
      await mutate?.(treasure, state);
    } catch (error) {
      writeDaoTreasureState(originalState);
      throw error;
    }
    writeDaoTreasureState(state);
    return { ok: true, remaining: treasure.origin, treasure };
  });
}

export async function repairDaoTreasureAuthority({ ownerId, authority, consume }) {
  return withStateLock(async () => {
    const state = readDaoTreasureState();
    const originalState = structuredClone(state);
    const treasure = state.treasure;
    if (!treasure || String(treasure.ownerId) !== String(ownerId)) return { ok: false, reason: 'not-owner' };
    if (!DAO_TREASURE_REPAIR_TARGETS.includes(authority)) return { ok: false, reason: 'invalid-authority' };
    const isBody = authority === '本体';
    const status = isBody
      ? (treasure.body || (Number(treasure.integrity) >= 100 ? '完整' : '残缺'))
      : treasure.authorities[authority];
    if (status === '完整') return { ok: false, reason: 'already-complete' };
    if (isBody) treasure.body = '完整';
    else treasure.authorities[authority] = '完整';
    treasure.integrity = Math.min(100, (Number(treasure.integrity) || 0) + 20);
    writeDaoTreasureState(state);
    try {
      await consume();
    } catch (error) {
      writeDaoTreasureState(originalState);
      throw error;
    }
    return { ok: true, treasure };
  });
}

export function formatDaoTreasureProject(project, worldYear = null) {
  if (!project) return '当前没有正在进行的大道炼器工程。';
  if (project.status === 'gathering') {
    return [
      `【大道炉·文明聚薪】${project.name}`,
      `开炉者：${project.ownerName}`,
      ...Object.entries(DAO_TREASURE_FUEL).map(([name, target]) =>
        `${name}：${Number(project.fuel?.[name]) || 0}/${target}`
      ),
      `贡献修士：${Object.keys(project.contributors || {}).length}人`,
      '薪火齐备后自动点炉，固定炼制一个纪元。',
      '指令：#献祭文明 材料名*数量',
    ].join('\n');
  }
  if (project.status === 'forging') {
    const stage = project.stages[project.stageIndex];
    const current = Number.isFinite(Number(worldYear)) ? Number(worldYear) : Number(project.startWorldYear);
    const { elapsed } = getDaoTreasureForgeProgress(project.startWorldYear, current);
    const guardians = Object.keys(stage?.guardians || {}).length;
    return [
      `【大道炉·${stage?.name || '成器'}】${project.name}`,
      `开炉者：${project.ownerName}`,
      `当前阶段：${Math.min(project.stageIndex + 1, 5)}/5 ${stage?.name || ''}`,
      `镇守道痕：${guardians}/${DAO_TREASURE_GUARD_TARGET}`,
      `起炉世界年：${project.startWorldYear}`,
      `成器世界年：${project.targetWorldYear}`,
      `已炼制：${elapsed}/${DAO_TREASURE_FORGE_YEARS}年`,
      '指令：#镇守大道炉',
    ].join('\n');
  }
  return `【大道器成】${project.name}已结束一个纪元的炼制。`;
}

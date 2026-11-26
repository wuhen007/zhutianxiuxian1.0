// 离线纯内存回归：只调用真实命令模型，不读取玩家文件、连接宿主或等待现实时间。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  runRevivalCommand, createRevivalState, getRevivalBreakthroughGate,
  REVIVAL_EXPEDITIONS, REVIVAL_STUDY_NEED, REVIVAL_REALMS,
} from '../model/revivalEarth.js';

const MINUTE = 60_000;
const ROUTES = ['化凡', '信仰'];
const POLICIES = ['warehouse', 'carry'];
const SIGNAL_POLICIES = ['avoid', 'manual', 'tech'];
const SIGNAL_ACTIONS = ['signalInvestigate', 'signalVerify', 'signalHandle'];
const EXPEDITION_MODES = ['stealth', 'magic', 'tech'];
const CRISIS_POLICIES = ['none', 'labor', 'technical', 'cultivation'];
const CRISIS_CHOICES = {
  labor: ['轮班供氧', '延长轮值', '公开核账'],
  technical: ['机械检修', '配给改订', '公开核账'],
  cultivation: ['灵力稳压', '延长轮值', '公开核账'],
};
const ELEMENTS = ['金', '木', '水', '火', '土'];
const CHOICES = {
  读数矛盾: '共同核验', 轮换分离: '个人窗口', 同号名册: '逐页对照', 熄灯点名: '手抄核对',
  借来的床位: '顶替夜班', 断药名单: '跑腿换药', 无回音的接应: '手抄守候',
  饥年供桌: '轮值耕作', 病榻祈求: '承认局限', 沉默图腾: '停供守夜', 送别之约: '交接轮值',
};

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name}须为${min}至${max}之间的整数。`);
  }
}

function seededRandom(seed) {
  let n = seed;
  return () => {
    n = (n + 0x6D2B79F5) >>> 0;
    let t = Math.imul(n ^ (n >>> 15), n | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 只接收公开进度与已兑现的核验回执，没有隐藏pattern或未来随机数入口。
export function chooseSignalSimulationCommand({
  signalPolicy = 'avoid', investigated, verified, window, detectors = 0, evidence = '',
}) {
  assert.ok(SIGNAL_POLICIES.includes(signalPolicy), 'signalPolicy须为avoid、manual或tech');
  if (signalPolicy === 'avoid') return window > 0 ? '抉择 绕开信号 确认' : '撤离 确认';
  if (!investigated) return window > 0 ? '调查 信号 确认' : '撤离 确认';
  if (!verified) {
    if (signalPolicy === 'tech' && detectors > 0) return '核验 科技 确认';
    return window > 0 ? '核验 手工 确认' : '撤离 确认';
  }
  const choices = [...evidence.matchAll(/^核验记录：.*?处置规则：(切断广播|关闭回传|遮断镜头|锁定时钟)(?:接收)?，/gm)];
  assert.equal(choices.length, 1, '已核验回执缺少唯一处置规则；策略停止，不猜隐藏答案。');
  return `抉择 ${choices[0][1]} 确认`;
}

export function chooseWorkSimulationCommand(job, roundsNeeded = 1, workBatch = 1) {
  assert.ok(['绿植维护', '工程检修', '复活值守'].includes(job), '未知工作岗位');
  integer(workBatch, 'workBatch', 1, 10);
  assert.ok(Number.isFinite(roundsNeeded) && roundsNeeded > 0, '需求轮数须为正数');
  const rounds = Math.min(workBatch, Math.ceil(roundsNeeded));
  return rounds === 1 ? `工作 ${job}` : `工作 ${job} ${rounds} 确认`;
}

// 固定深入策略，不窥读未来事故。选择更深时允许耗尽窗口，真实模型仍收取紧急接驳风险。
export function chooseExpeditionSimulationCommand({
  stage, depth, window, casts = 0, detectors = 0, canUseMagic = true,
  expeditionMode = 'stealth', expeditionDepth = 1, hasMaterialReward = true,
}) {
  assert.ok(EXPEDITION_MODES.includes(expeditionMode), '未知外勤方式');
  integer(expeditionDepth, 'expeditionDepth', 1, 3);
  const mode = expeditionMode === 'tech' && detectors > 0 ? '科技'
    : expeditionMode === 'magic' && canUseMagic && casts > 0 ? '法术' : '隐蔽';
  const cost = mode === '隐蔽' ? 2 : 1;
  if (stage === 'encounter') return window >= cost ? `应对 ${mode} 确认` : '撤离 确认';
  if (stage === 'choice' && depth < expeditionDepth && hasMaterialReward && window >= cost + 1) return '深入 确认';
  return '撤离 确认';
}

// 固定、非最优策略：默认仍为单轮工作、不参与公议、单点隐蔽；其余行为由显式参数选择。
// 决策只读玩家可见进度；永不读取行动roll/rescueRoll，也不因未来结果选择命令。
function nextCommand(s, route, policy, signalPolicy, lastMessage, options) {
  const { workBatch, expeditionMode, expeditionDepth, crisisPolicy } = options;
  if (!s) return '入界 确认';
  if (s.place === '塔监狱') {
    const t = s.tower;
    if (t.clues.length < 3 || !t.calibrated) return '观察';
    if (t.event) {
      assert.ok(CHOICES[t.event], `未识别公开狱友事件：${t.event}`);
      return `抉择 ${CHOICES[t.event]} 确认`;
    }
    if (!t.ally) return '交谈';
    if (!t.window) return '推演';
    return t.window === 1 ? '候时' : '越狱 确认';
  }
  if (s.expedition) {
    const x = s.expedition;
    // 只读已抵达的可见遭遇，不读隐藏pattern，也不窥探抽签结果。
    if (x.stage === 'encounter' && x.signal && !x.signal.choice) {
      return chooseSignalSimulationCommand({
        signalPolicy, investigated: x.signal.investigated, verified: x.signal.verified,
        window: x.window, detectors: s.bag.探测器 || 0, evidence: lastMessage,
      });
    }
    return chooseExpeditionSimulationCommand({
      stage: x.stage, depth: x.depth, window: x.window, casts: x.casts, detectors: s.bag.探测器 || 0,
      canUseMagic: s.body.realm > 0 && !(s.body.realm === 4 && s.body.path === '化凡'),
      expeditionMode, expeditionDepth, hasMaterialReward: Object.keys(REVIVAL_EXPEDITIONS[x.target].items).length > 0,
    });
  }
  const work = (job, rounds = 1) => chooseWorkSimulationCommand(job, rounds, workBatch);
  if (s.station.debt) return work('复活值守', s.station.debt / 40);
  if (s.rescueBudget !== 300) return '接应预算 300';

  const b = s.body;
  const upkeep = 5 - (s.station.resident ? 2 : 0) - (s.station.rationed ? 1 : 0);
  const total = name => (s.bag[name] || 0) + (s.storage[name] || 0);
  const pay = (command, cost = 0, items = {}, { risk = false, timed = true } = {}) => {
    for (const [name, amount] of Object.entries(items)) {
      if (total(name) < amount) {
        if (name === '灵植') return work('绿植维护', (amount - total(name)) / 2);
        if (name === '工程部件') return work('工程检修', amount - total(name));
        const target = Object.entries(REVIVAL_EXPEDITIONS).find(([, task]) => task.items[name])?.[0];
        assert.ok(target, `策略没有物资${name}的来源`);
        assert.ok(b.realm >= REVIVAL_EXPEDITIONS[target].realm, `策略过早请求${target}`);
        return explore(target);
      }
    }
    for (const [name, amount] of Object.entries(items)) {
      if ((s.bag[name] || 0) < amount) return `取出 ${name} ${amount - (s.bag[name] || 0)}`;
    }
    if (s.credits < cost + (timed ? upkeep : 0) + 300) return work('复活值守', (cost + (timed ? upkeep : 0) + 300 - s.credits) / (40 - upkeep));
    if (risk && policy === 'warehouse') {
      const surplus = Object.entries(s.bag).find(([name, count]) => count > (items[name] || 0));
      if (surplus) return `存入 ${surplus[0]} ${surplus[1] - (items[surplus[0]] || 0)}`;
    }
    return command;
  };
  const explore = target => {
    const detectors = (signalPolicy === 'tech' ? 1 : 0) + (expeditionMode === 'tech' ? expeditionDepth : 0);
    if (total('探测器') < detectors) {
      return pay('制作 探测器', 10, { 工程部件: 1 });
    }
    // 探测器并非出发消耗品：只在核验时消耗。此处用于取出并保留随身，不被存仓策略收走。
    return pay(`探索 ${target} 确认`, REVIVAL_EXPEDITIONS[target].cost,
      detectors ? { 探测器: detectors } : {}, { risk: true });
  };

  for (const [name, key, need, cost] of [
    ['配给', 'rationed', 4, 20], ['居住', 'resident', 8, 60], ['接应', 'relay', 12, 40],
  ]) {
    if (!s.station[key] && s.station.contribution >= need) return pay(`申请 ${name} 确认`, cost, {}, { timed: false });
  }
  if (crisisPolicy !== 'none') {
    const stage = s.station.crisis?.choices.length || 0;
    // 术法分支先正常修炼到有25积累，不给凡人白送修为，也不破坏化凡压制。
    const waitingForPower = crisisPolicy === 'cultivation' && stage === 0
      && (b.realm < 1 || (b.realm < 5 && b.cultivation < 25) || (b.realm === 4 && b.path === '化凡'));
    if (stage < 3 && !waitingForPower) {
      if (!s.station.crisis) return '参与危机 确认';
      const choice = CRISIS_CHOICES[crisisPolicy][stage];
      const mechanical = s.station.crisis.choices[0]?.choice === '机械检修';
      const [credits, items] = choice === '机械检修' ? [20, { 工程部件: 3 }]
        : choice === '配给改订' ? [20, { 灵植: 2 }]
          : choice === '公开核账' ? [mechanical ? 10 : 20, { 工程部件: mechanical ? 1 : 2 }] : [0, {}];
      return pay(`公议 ${choice} 确认`, credits, items);
    }
  }
  if (!s.knowledge.功法) return pay('研读', 20);
  if (!b.realm) return pay('修炼', 10, { 灵植: 1 });
  if (b.realm === 1 && !s.facilities.丹炉) return pay('制作 丹炉', 80, { 工程部件: 3 });
  if (b.realm === 1 && !total('筑基丹')) {
    return pay('制作 筑基丹', 20, { 百年大蓟: 1, 百年茯神: 1, 筑基药引: 1 });
  }
  if (b.realm === 2) {
    if (!b.weapon) return pay('制作 本命法器', 100, { 工程部件: 5 });
    if (!s.facilities.持续火种) return pay('制作 持续火种', 50, { 燃料: 3 });
    // 先收齐本世所需基材，随后再投入蕴养；仓储策略通过命令存取，非额外赠予。
    for (const [name, amount] of [
      ['千年古木', b.elements.木 === 0 ? 1 : 0], ['五百年灵草', b.elements.土 === 0 ? 1 : 0],
      ['水灵之气', 3 - b.elements.水], ['燃料', 3 - b.elements.火],
    ]) {
      if (total(name) < amount) {
        const target = Object.entries(REVIVAL_EXPEDITIONS).find(([, task]) => task.items[name])[0];
        return explore(target);
      }
    }
    for (const name of ELEMENTS) {
      if (b.elements[name] >= 3) continue;
      const item = { 木: '千年古木', 土: '五百年灵草', 水: '水灵之气', 火: '燃料' }[name];
      const items = item && (['水', '火'].includes(name) || b.elements[name] === 0) ? { [item]: 1 } : {};
      return pay(`蕴养 ${name}`, 20, items);
    }
  }
  if (b.realm === 3) {
    if (!s.knowledge.佛道传承) return explore('塔底调查');
    if (!total('金脑丹')) return explore('道门试炼');
  }
  if (b.realm >= 4 && !b.path) {
    if (!s.knowledge.离界坐标) return explore('离界测绘');
    if (!s.facilities.接引装置) return pay('制作 接引装置', 500, { 工程部件: 12, 燃料: 6 });
    if (route === '信仰' && !total('图腾载体')) return explore('图腾寻访');
  }
  if (b.realm === 5) return pay('离界 确认', 0, {}, { timed: false });
  if (b.cultivation < REVIVAL_STUDY_NEED[b.realm]) return pay('修炼', 10, { 灵植: 1 });
  if (b.realm === 4 && b.phase === 3) {
    if (!b.path) return `化神 ${route}`;
    if (b.pathEvent) return `抉择 ${CHOICES[b.pathEvent]} 确认`;
    if (route === '化凡') {
      if (b.mortalSteps < 3) return pay('化凡', 15);
      if (!b.vow) return '立愿 为仍在等待的人留下接应与见证';
    } else {
      if (!b.totem) return pay('凝聚图腾', 60, { 图腾载体: 1, 工程部件: 3 });
      if (!s.knowledge.信众群体) return pay('寻访信众', 30);
      if (b.faith < 100) return pay('传道', 30, { 灵植: 1 });
    }
  }
  const gate = getRevivalBreakthroughGate(s);
  assert.ok(gate.ok, `策略未满足突破关卡：${gate.message}`);
  return pay(gate.risk ? '突破 确认' : '突破', gate.credits, gate.items, { risk: gate.risk > 0 });
}

function bodyRank(b) {
  return b.realm * 10_000 + b.phase * 1000 + b.cultivation;
}

function addCounts(total, items = {}) {
  for (const [name, count] of Object.entries(items)) {
    if (count > 0) total[name] = (total[name] || 0) + count;
  }
}

export function simulateRevivalRun({
  seed = 1, route = '化凡', policy = 'warehouse', signalPolicy = 'avoid',
  workBatch = 1, expeditionMode = 'stealth', expeditionDepth = 1, crisisPolicy = 'none',
  maxCommands = 30_000, maxMinutes = 525_600,
} = {}) {
  integer(seed, 'seed', 0, 0xFFFFFFFF);
  integer(maxCommands, 'maxCommands', 1, 1_000_000);
  integer(maxMinutes, 'maxMinutes', 1, 5_256_000);
  integer(workBatch, 'workBatch', 1, 10);
  integer(expeditionDepth, 'expeditionDepth', 1, 3);
  assert.ok(ROUTES.includes(route), 'route须为化凡或信仰');
  assert.ok(POLICIES.includes(policy), 'policy须为warehouse或carry');
  assert.ok(SIGNAL_POLICIES.includes(signalPolicy), 'signalPolicy须为avoid、manual或tech');
  assert.ok(EXPEDITION_MODES.includes(expeditionMode), 'expeditionMode须为stealth、magic或tech');
  assert.ok(CRISIS_POLICIES.includes(crisisPolicy), 'crisisPolicy须为none、labor、technical或cultivation');
  const strategy = { workBatch, expeditionMode, expeditionDepth, crisisPolicy };
  const random = seededRandom(seed);
  const player = { id: 'simulation-only', power_place: 0, level_id: 1, 灵石: 12345 };
  const startedAt = 1000;
  let now = startedAt;
  let status = 'budget_exhausted';
  let reason = 'command_limit';
  let recovery = null;
  let lastMessage = '';
  const result = {
    seed, route, policy, signalPolicy, ...strategy, commands: 0, actions: 0, elapsedMinutes: 0,
    deaths: 0, riskDeaths: 0, towerResets: 0, returnsToTower: 0, signalEncounters: 0, signalsAvoided: 0,
    signalsHandled: 0, manualVerifications: 0, techVerifications: 0, signalWindowsSpent: 0,
    detectorsCrafted: 0, detectorsUsed: 0, detectorsLost: 0,
    detectorCraftCredits: 0, detectorPartsSpent: 0, detectorCraftMinutes: 0,
    creditsIn: 0, creditsOut: 0, upkeep: 0, rescueSpent: 0,
    workActions: 0, peakRealm: 0, lossesByRealm: {},
    workBatchActions: 0, workRoundsStarted: 0, workRoundsCompleted: 0, workCreditsEarned: 0,
    searchesCompleted: 0, maxCompletedDepth: 0, deepeningDecisions: 0, successfulReturns: 0, emergencyReturnsStarted: 0,
    detectorSearchUses: 0, crisisStagesCompleted: 0, crisisCreditsSpent: 0, crisisCultivationSpent: 0,
    crisisItemsSpent: {}, cargoDelivered: {}, cargoLost: {}, carriedLost: {},
    riskByAction: {}, minutesByAction: {}, commandCounts: {}, firstRealmAt: { 凡人: 0 },
    recoveries: [], lastCommands: [],
  };
  try {
    while (result.commands < maxCommands) {
      const before = player.复活地球;
      const action = before?.action;
      const previousNow = now;
      if (action) {
        const deadline = startedAt + maxMinutes * MINUTE;
        now = Math.min(action.endAt, deadline);
        result.minutesByAction[action.kind] = (result.minutesByAction[action.kind] || 0) + (now - previousNow) / MINUTE;
        if (action.kind === 'craft' && action.target === '探测器') {
          result.detectorCraftMinutes += (now - previousNow) / MINUTE;
        }
        if (action.endAt > deadline) { reason = 'time_limit'; break; }
      }
      // 待选与决策只用公开的进度。结算才由模型读取预抽随机数。
      const text = action ? '结算' : nextCommand(before, route, policy, signalPolicy, lastMessage, strategy);
      const reply = runRevivalCommand(player, text, {
        now, random, requestId: `sim-${++result.commands}`,
      });
      const verb = text.split(' ')[0];
      result.commandCounts[verb] = (result.commandCounts[verb] || 0) + 1;
      result.lastCommands = [...result.lastCommands, text].slice(-12);
      if (!reply.ok || !reply.changed) {
        status = 'command_rejected';
        reason = `${text}：${reply.message}`;
        break;
      }
      const after = player.复活地球;
      lastMessage = reply.message;
      if (action?.kind === 'journey' && after.expedition?.signal) result.signalEncounters++;
      if (text === '抉择 绕开信号 确认') result.signalsAvoided++;
      if (action?.kind === 'signalHandle') {
        assert.match(reply.message, /处置匹配线索，诱导链已截断/, '核验策略选错了公开处置规则');
        result.signalsHandled++;
      }
      if (action?.kind === 'signalVerify') result[action.method === '科技' ? 'techVerifications' : 'manualVerifications']++;
      if (action?.kind === 'craft' && action.target === '探测器') result.detectorsCrafted++;
      const difference = after.credits - (before?.credits || 0);
      // 多轮在一条结算里既发薪又扣生活费；展开实际回执，不把内部费用吞进净收入。
      let internalWorkFees = 0;
      if (action?.kind === 'workBatch') {
        const matches = [...reply.message.matchAll(/整批生活费合计(\d+)积分/g)];
        assert.equal(matches.length, 1, '连续工作结算缺少明确生活费回执');
        internalWorkFees = Number(matches[0][1]) - action.livingCost;
        assert.ok(Number.isSafeInteger(internalWorkFees) && internalWorkFees >= 0);
        assert.ok(difference + internalWorkFees >= 0, '工作结算账户流向异常');
        result.upkeep += internalWorkFees;
      }
      if (difference + internalWorkFees > 0) result.creditsIn += difference + internalWorkFees;
      else result.creditsOut -= difference + internalWorkFees;
      result.creditsOut += internalWorkFees;
      if (action && ['work', 'workBatch'].includes(action.kind)) {
        const income = reply.message.match(/报酬(\d+)积分/);
        assert.ok(income, '工作结算缺少报酬回执');
        result.workCreditsEarned += Number(income[1]);
        result.workRoundsCompleted += action.kind === 'workBatch' ? action.count : 1;
      }
      assert.equal(result.creditsIn - result.creditsOut, after.credits, '账户收支不平');
      assert.equal(player.灵石, 12345, '改动了其他体系资产');
      if (!action && after.action) {
        result.actions++;
        result.upkeep += after.action.livingCost;
        if (['work', 'workBatch'].includes(after.action.kind)) {
          result.workActions++;
          result.workRoundsStarted += after.action.kind === 'workBatch' ? after.action.count : 1;
          if (after.action.kind === 'workBatch') result.workBatchActions++;
        }
        if (after.action.kind === 'signalVerify' && after.action.method === '科技') result.detectorsUsed++;
        if (after.action.kind === 'scavenge' && text === '应对 科技 确认') {
          result.detectorsUsed++;
          result.detectorSearchUses++;
        }
        if (after.action.kind === 'return' && before.expedition.window === 0) result.emergencyReturnsStarted++;
        if (after.action.kind === 'stationChoice') {
          result.crisisCreditsSpent += before.credits - after.credits;
          result.crisisCultivationSpent += after.action.cultivationCost;
          addCounts(result.crisisItemsSpent, Object.fromEntries(Object.keys(before.bag)
            .map(name => [name, before.bag[name] - (after.bag[name] || 0)])));
        }
        if (after.action.kind === 'craft' && after.action.target === '探测器') {
          result.detectorCraftCredits += before.credits - after.credits;
          result.detectorPartsSpent += (before.bag.工程部件 || 0) - (after.bag.工程部件 || 0);
        }
      }
      if (text === '抉择 绕开信号 确认' || (!action && SIGNAL_ACTIONS.includes(after.action?.kind))) {
        result.signalWindowsSpent += before.expedition.window - after.expedition.window;
      }
      const death = after.deaths > (before?.deaths || 0);
      if (text === '深入 确认') result.deepeningDecisions++;
      if (action?.kind === 'scavenge' && !death) {
        result.searchesCompleted++;
        result.maxCompletedDepth = Math.max(result.maxCompletedDepth, after.expedition.depth);
      }
      if (action?.kind === 'return' && !death) {
        result.successfulReturns++;
        addCounts(result.cargoDelivered, before.expedition.cargo);
      }
      if (action?.kind === 'stationChoice') result.crisisStagesCompleted++;
      if (action?.risk > 0 && action.kind !== 'escape') {
        const label = action.gate === 'nascent' ? '污染结婴' : action.title;
        const bucket = result.riskByAction[label] ||= { attempts: 0, deaths: 0 };
        bucket.attempts++;
        if (death) bucket.deaths++;
      }
      if (death) {
        assert.equal(after.deaths, before.deaths + 1, '同次重复死亡');
        assert.deepEqual(after.body, createRevivalState(0).body, '死亡未清空本世');
        assert.deepEqual(after.bag, {}, '死亡遗留随身物资');
        assert.deepEqual(after.storage, before.storage, '死亡改动仓储');
        assert.deepEqual(after.facilities, before.facilities, '死亡改动设施');
        assert.equal(after.action, null, '死亡遗留计时行动');
        assert.equal(after.expedition, null, '死亡遗留外勤');
        const record = after.deathRecords.at(-1);
        result.detectorsLost += before.bag.探测器 || 0;
        addCounts(result.carriedLost, record.bag);
        addCounts(result.cargoLost, record.cargo);
        result.deaths++;
        result.rescueSpent += record.spent;
        if (record.mode === '积分接应') {
          result.riskDeaths++;
          if (record.place === '塔监狱') result.returnsToTower++;
          const realm = REVIVAL_REALMS[record.body.realm];
          result.lossesByRealm[realm] = (result.lossesByRealm[realm] || 0) + 1;
          // 连续重修期间再次死亡仍追踪第一次的最高损失目标，避免只报告短的成功段。
          if (!recovery) recovery = { at: now, target: bodyRank(record.body), realm };
          else recovery.target = Math.max(recovery.target, bodyRank(record.body));
        } else result.towerResets++;
      }
      assert.equal(result.detectorsCrafted - result.detectorsUsed - result.detectorsLost,
        (after.bag.探测器 || 0) + (after.storage.探测器 || 0), '探测器制作、使用、死亡损失与库存不平');
      assert.equal(result.workRoundsStarted - result.workRoundsCompleted,
        after.action?.kind === 'workBatch' ? after.action.count : after.action?.kind === 'work' ? 1 : 0,
        '工作轮次未区分开工与兑现');
      assert.equal(result.crisisStagesCompleted, after.station.crisis?.choices.length || 0, '公共危机重复兑现或提前计入');
      const minutes = (now - startedAt) / MINUTE;
      result.peakRealm = Math.max(result.peakRealm, after.body.realm);
      result.firstRealmAt[REVIVAL_REALMS[after.body.realm]] ??= minutes;
      if (recovery && bodyRank(after.body) >= recovery.target) {
        result.recoveries.push({ realm: recovery.realm, minutes: (now - recovery.at) / MINUTE });
        recovery = null;
      }
      if (after.status === 'ascended') { status = 'ascended'; reason = ''; break; }
      if (minutes >= maxMinutes) { reason = 'time_limit'; break; }
    }
  } catch (error) {
    status = 'simulation_error';
    reason = error.message;
  }
  const s = player.复活地球;
  return {
    ...result, status, reason, elapsedMinutes: (now - startedAt) / MINUTE,
    signalMinutes: SIGNAL_ACTIONS.reduce((sum, kind) => sum + (result.minutesByAction[kind] || 0), 0),
    crisisMinutes: result.minutesByAction.stationChoice || 0,
    recoveryPending: recovery ? { realm: recovery.realm, elapsedMinutes: (now - recovery.at) / MINUTE } : null,
    final: s ? {
      place: s.place, realm: REVIVAL_REALMS[s.body.realm], phase: s.body.phase, cultivation: s.body.cultivation,
      credits: s.credits, debt: s.station.debt, action: s.action?.title || null,
      detectors: (s.bag.探测器 || 0) + (s.storage.探测器 || 0),
      pendingWorkRounds: s.action?.kind === 'workBatch' ? s.action.count : s.action?.kind === 'work' ? 1 : 0,
      crisisStages: s.station.crisis?.choices.length || 0,
      pendingMinutes: s.action ? Math.max(0, (s.action.endAt - now) / MINUTE) : 0,
    } : null,
  };
}

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = q => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] : null;
  return { n: sorted.length, min: sorted[0] ?? null, p50: quantile(0.5), p90: quantile(0.9), max: sorted.at(-1) ?? null };
}

export function summarizeRevivalRuns(runs) {
  const groups = new Map();
  const ordered = [...runs].sort((a, b) => ROUTES.indexOf(a.route) - ROUTES.indexOf(b.route)
    || POLICIES.indexOf(a.policy) - POLICIES.indexOf(b.policy)
    || SIGNAL_POLICIES.indexOf(a.signalPolicy || 'avoid') - SIGNAL_POLICIES.indexOf(b.signalPolicy || 'avoid'));
  for (const run of ordered) {
    // 缺省字段兼容历史单轮、单点、不参加危机报告，不把不同策略混在同一分位数里。
    const criteria = {
      route: run.route, policy: run.policy, signalPolicy: run.signalPolicy || 'avoid',
      workBatch: run.workBatch ?? 1, expeditionMode: run.expeditionMode || 'stealth',
      expeditionDepth: run.expeditionDepth ?? 1, crisisPolicy: run.crisisPolicy || 'none',
    };
    const key = JSON.stringify(criteria);
    if (!groups.has(key)) groups.set(key, { criteria, sample: [] });
    groups.get(key).sample.push(run);
  }
  return [...groups.values()].map(({ criteria, sample }) => {
    const completed = sample.filter(run => run.status === 'ascended');
    return {
      ...criteria, samples: sample.length, completed: completed.length,
      censored: sample.filter(run => run.status === 'budget_exhausted').length,
      errors: sample.filter(run => !['ascended', 'budget_exhausted'].includes(run.status)).length,
      completedMinutes: distribution(completed.map(run => run.elapsedMinutes)),
      completedRiskDeaths: distribution(completed.map(run => run.riskDeaths)),
      completedCommands: distribution(completed.map(run => run.commands)),
      completedWorkActions: distribution(completed.map(run => run.workActions)),
      completedWorkRounds: distribution(completed.map(run => run.workRoundsCompleted ?? run.workActions)),
      completedCreditsOut: distribution(completed.map(run => run.creditsOut)),
      observedMinutes: distribution(sample.map(run => run.elapsedMinutes)),
      observedCommands: distribution(sample.map(run => run.commands)),
      observedRiskDeaths: distribution(sample.map(run => run.riskDeaths)),
      signalTotals: Object.fromEntries([
        'signalEncounters', 'signalsAvoided', 'signalsHandled', 'manualVerifications', 'techVerifications',
        'signalWindowsSpent', 'signalMinutes', 'detectorsCrafted', 'detectorsUsed', 'detectorsLost',
        'detectorCraftCredits', 'detectorPartsSpent', 'detectorCraftMinutes',
      ].map(key => [key, sample.reduce((sum, run) => sum + (run[key] || 0), 0)])),
      pacingTotals: Object.fromEntries([
        'workBatchActions', 'workRoundsStarted', 'workRoundsCompleted', 'workCreditsEarned',
        'deepeningDecisions', 'searchesCompleted', 'successfulReturns', 'emergencyReturnsStarted', 'detectorSearchUses',
        'crisisStagesCompleted', 'crisisCreditsSpent', 'crisisCultivationSpent', 'crisisMinutes',
      ].map(key => [key, sample.some(run => run[key] === undefined) ? null
        : sample.reduce((sum, run) => sum + run[key], 0)])),
      resourceTotals: Object.fromEntries(['cargoDelivered', 'cargoLost', 'carriedLost', 'crisisItemsSpent'].map(key => {
        if (sample.some(run => run[key] === undefined)) return [key, null];
        const items = {};
        for (const run of sample) addCounts(items, run[key]);
        return [key, items];
      })),
      // 只统计已回到损失前境界/阶段/积累的区间；进行中的重修另列，不作为零分钟。
      recoveryMinutes: distribution(sample.flatMap(run => run.recoveries.map(record => record.minutes))),
      pendingRecoveries: sample.filter(run => run.recoveryPending).length,
      lossesByRealm: Object.fromEntries(REVIVAL_REALMS.map(realm =>
        [realm, sample.reduce((sum, run) => sum + (run.lossesByRealm[realm] || 0), 0)])),
    };
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', default: '10' }, 'start-seed': { type: 'string', default: '1' },
      route: { type: 'string', default: 'both' }, policy: { type: 'string', default: 'warehouse' },
      'signal-policy': { type: 'string', default: 'avoid' },
      'work-batch': { type: 'string', default: '1' },
      'expedition-mode': { type: 'string', default: 'stealth' },
      'expedition-depth': { type: 'string', default: '1' },
      'crisis-policy': { type: 'string', default: 'none' },
      'max-commands': { type: 'string', default: '30000' }, 'max-minutes': { type: 'string', default: '525600' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log('复活地球纯内存成长仿真；标准输出为JSON，不读写玩家存档。\n--seeds 10 --start-seed 1 --route both|化凡|信仰 --policy warehouse|carry\n--signal-policy avoid|manual|tech|all（默认avoid绕开）\n--work-batch 1~10（按当前缺口工作，最多该轮数）\n--expedition-mode stealth|magic|tech --expedition-depth 1~3\n--crisis-policy none|labor|technical|cultivation\n--max-commands 30000 --max-minutes 525600\n默认仍为单轮、单点隐蔽、不参与危机。深入可能耗尽窗口并增加返航风险，法术/科技余量不足时尝试隐蔽，否则撤离。\n达到预算单独标记，非通关或软锁证明；计时不含现实中错过结算和消息操作。');
    return;
  }
  const seeds = Number(values.seeds);
  const startSeed = Number(values['start-seed']);
  integer(seeds, 'seeds', 1, 1000);
  integer(startSeed, 'start-seed', 0, 0xFFFFFFFF - seeds + 1);
  assert.ok(['both', ...ROUTES].includes(values.route), 'route须为both、化凡或信仰');
  assert.ok(['all', ...SIGNAL_POLICIES].includes(values['signal-policy']), 'signal-policy须为avoid、manual、tech或all');
  const strategy = {
    workBatch: Number(values['work-batch']), expeditionMode: values['expedition-mode'],
    expeditionDepth: Number(values['expedition-depth']), crisisPolicy: values['crisis-policy'],
  };
  const runs = [];
  const sourceHashes = Object.fromEntries([
    ['model', new URL('../model/revivalEarth.js', import.meta.url)],
    ['simulator', new URL('./revival-earth-sim.mjs', import.meta.url)],
  ].map(([name, url]) => [name, createHash('sha256').update(readFileSync(url)).digest('hex')]));
  const routes = values.route === 'both' ? ROUTES : [values.route];
  const signalPolicies = values['signal-policy'] === 'all' ? SIGNAL_POLICIES : [values['signal-policy']];
  for (const route of routes) {
    for (const signalPolicy of signalPolicies) {
      for (let i = 0; i < seeds; i++) {
        const run = simulateRevivalRun({
          seed: startSeed + i, route, policy: values.policy, signalPolicy,
          ...strategy,
          maxCommands: Number(values['max-commands']), maxMinutes: Number(values['max-minutes']),
        });
        runs.push(run);
        console.error(`${route}/${signalPolicy}/batch${strategy.workBatch}/${strategy.expeditionMode}${strategy.expeditionDepth}/${strategy.crisisPolicy} seed=${run.seed} ${run.status} commands=${run.commands} minutes=${run.elapsedMinutes}`);
      }
    }
  }
  console.log(JSON.stringify({
    methodology: {
      generator: 'seeded mulberry32', seedsPerRoute: seeds * signalPolicies.length, startSeed,
      sourceHashes,
      policy: values.policy, maxCommands: Number(values['max-commands']), maxMinutes: Number(values['max-minutes']),
      signalPolicies, seedsPerCombination: seeds,
      ...strategy,
      strategy: `先登记资格与筹足300接应预算；按缺口最多${strategy.workBatch}轮工作；候时越狱；${strategy.expeditionMode}外勤最多${strategy.expeditionDepth}处，纯解锁测绘不深入；公共危机${strategy.crisisPolicy}；不吸黑雾、不地表修炼；先筹离界装置再化神。`,
      crisisStrategy: {
        none: '不参与。', labor: CRISIS_CHOICES.labor.join(' → '),
        technical: CRISIS_CHOICES.technical.join(' → '), cultivation: CRISIS_CHOICES.cultivation.join(' → '),
        timing: '优先登记已满足门槛的资格，材料与300积分接应储备通过真实工作筹齐；术法先正常修炼到足够积累，不插入假修为。',
      },
      signalStrategy: {
        avoid: '见可疑信号直接绕开。',
        manual: '调查、手工核验，读取已兑现的公开核验回执后按规则处置，不窥读隐藏类型。',
        tech: '出发前通过工作/制作/仓储取出筹足核验探测器1；科技搜索另按探索深度筹备。调查、核验后按公开回执处置；缺探测器时手工核验，零窗口且核验条件不足时撤离。',
      },
      storage: values.policy === 'warehouse' ? '危险行动前逐项存入多余物资，仅留本次消耗。' : '不主动存仓，随身物资承受死亡损失。',
      limits: '固定非最优策略，非玩家总体通关率。批量工作也会减少无风险行动的抽签次数；同种子不代表相同事故轨迹，总体策略对比不是配对事故实验。计时不含消息操作和离线空档。超预算样本保留，完成样本分位数不代表全体。消耗在发生时计，奖励只在结算时计；深入可能耗尽窗口，科技搜索额外消耗探测器。',
    },
    summary: summarizeRevivalRuns(runs), runs,
  }, null, 2));
  process.exitCode = runs.some(run => !['ascended', 'budget_exhausted'].includes(run.status)) ? 1
    : runs.some(run => run.status === 'budget_exhausted') ? 2 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  simulateRevivalRun, summarizeRevivalRuns, chooseSignalSimulationCommand,
  chooseWorkSimulationCommand, chooseExpeditionSimulationCommand,
} from '../scripts/revival-earth-sim.mjs';
import { createRevivalState, runRevivalCommand } from '../model/revivalEarth.js';

test('同种子与策略生成相同命令和收支，模拟时钟不依赖现实日期', () => {
  const options = { seed: 3, maxCommands: 500, route: '化凡' };
  const first = simulateRevivalRun(options);
  assert.deepEqual(first, simulateRevivalRun(options));
  assert.deepEqual(first, simulateRevivalRun({ ...options, signalPolicy: 'avoid' }));
  assert.equal(first.creditsIn - first.creditsOut, first.final.credits);
  assert.equal(Object.values(first.commandCounts).reduce((a, b) => a + b, 0), first.commands);
  assert.equal(Object.values(first.minutesByAction).reduce((a, b) => a + b, 0), first.elapsedMinutes);
  assert.equal(first.commandCounts['吸收黑雾'], undefined);
  assert.equal(first.commandCounts['深入'], undefined);
  assert.ok(first.commandCounts['存入'] > 0);
  const carry = simulateRevivalRun({ ...options, policy: 'carry' });
  assert.equal(carry.commandCounts['存入'], undefined);
  assert.equal(carry.commandCounts['取出'], undefined);
});

test('命令预算和时间预算单独标记，待结算行动不提前兑现也不假报通关或软锁', () => {
  const limited = simulateRevivalRun({ maxCommands: 1 });
  assert.equal(limited.status, 'budget_exhausted');
  assert.equal(limited.reason, 'command_limit');
  assert.equal(limited.commands, 1);
  assert.equal(limited.final.realm, '凡人');
  const timed = simulateRevivalRun({ maxMinutes: 1 });
  assert.equal(timed.status, 'budget_exhausted');
  assert.equal(timed.reason, 'time_limit');
  assert.equal(timed.elapsedMinutes, 1);
  assert.equal(timed.final.pendingMinutes, 4);
  assert.equal(timed.commandCounts['结算'], undefined);
  assert.equal(timed.deaths, 0);
  const [summary] = summarizeRevivalRuns([limited, timed]);
  assert.equal(summary.completed, 0);
  assert.equal(summary.censored, 2);
  assert.equal(summary.errors, 0);
  assert.equal(summary.completedMinutes.n, 0);
  assert.equal(summary.completedMinutes.p50, null);
});

for (const route of ['化凡', '信仰']) {
  test(`固定种子3从零成长、死亡重修与${route}接引，死亡时逐项检查清零及保留边界`, () => {
    // v5的信号使用独立随机抽取，序列位置与v4不同；保留同一种子，提高到正式仿真预算。
    const run = simulateRevivalRun({ seed: 3, route, maxCommands: 30000 });
    assert.equal(run.status, 'ascended', JSON.stringify({ reason: run.reason, commands: run.lastCommands }));
    assert.equal(run.final.place, '仙界');
    assert.equal(run.final.realm, '化神');
    assert.equal(run.final.debt, 0);
    assert.ok(run.riskDeaths > 0);
    assert.ok(run.workActions > 0);
    assert.ok(run.commandCounts['存入'] > 0);
    assert.ok(run.commandCounts['取出'] > 0);
    assert.ok(run.signalEncounters > 0);
    assert.equal(run.signalsAvoided, run.signalEncounters);
    assert.equal(run.commandCounts['调查'], undefined);
    assert.equal(run.commandCounts['核验'], undefined);
    assert.equal(run.commandCounts['化神'], 1);
    assert.equal(run.commandCounts[route === '化凡' ? '化凡' : '传道'], route === '化凡' ? 3 : 4);
    assert.equal(run.riskDeaths + run.towerResets, run.deaths);
    assert.equal(Object.values(run.riskByAction).reduce((sum, item) => sum + item.deaths, 0), run.riskDeaths);
    assert.equal(Object.values(run.lossesByRealm).reduce((a, b) => a + b, 0), run.riskDeaths);
    assert.equal(run.recoveryPending, null);
    assert.ok(run.recoveries.length > 0);
    assert.ok(run.creditsOut >= run.rescueSpent + run.upkeep);
    assert.equal(run.creditsIn - run.creditsOut, run.final.credits);
    assert.equal(Object.values(run.minutesByAction).reduce((a, b) => a + b, 0), run.elapsedMinutes);
    assert.ok(run.firstRealmAt.炼气 < run.firstRealmAt.筑基);
    assert.ok(run.firstRealmAt.元婴 < run.firstRealmAt.化神);
  });
}

test('汇总不剔除超预算样本，未完成重修不计零分钟，错误独立列出', () => {
  const base = simulateRevivalRun({ seed: 0, maxCommands: 1 });
  const samples = [
    { ...base, status: 'ascended', elapsedMinutes: 120, riskDeaths: 1, commands: 100,
      recoveries: [{ realm: '炼气', minutes: 60 }] },
    { ...base, status: 'ascended', elapsedMinutes: 360, riskDeaths: 3, commands: 300 },
    { ...base, status: 'budget_exhausted', elapsedMinutes: 900, riskDeaths: 7,
      recoveryPending: { realm: '金丹', elapsedMinutes: 800 } },
    { ...base, status: 'command_rejected', reason: '测试命令错误' },
  ];
  const [summary] = summarizeRevivalRuns(samples);
  assert.equal(summary.samples, 4);
  assert.equal(summary.completed, 2);
  assert.equal(summary.censored, 1);
  assert.equal(summary.errors, 1);
  assert.deepEqual(summary.completedMinutes, { n: 2, min: 120, p50: 120, p90: 360, max: 360 });
  assert.equal(summary.observedRiskDeaths.max, 7);
  assert.equal(summary.recoveryMinutes.n, 1);
  assert.equal(summary.pendingRecoveries, 1);
});

test('仿真参数拒绝无界循环与未知策略，零种子可复现', () => {
  for (const change of [
    { seed: -1 }, { seed: 0x100000000 }, { seed: NaN }, { maxCommands: 0 },
    { maxCommands: Infinity }, { maxMinutes: -1 }, { maxMinutes: 1.5 },
    { route: '化魔' }, { policy: 'read-future-roll' }, { signalPolicy: 'read-hidden-pattern' }, { signalPolicy: 'all' },
    { workBatch: 0 }, { workBatch: 11 }, { workBatch: 1.5 }, { workBatch: NaN },
    { expeditionDepth: 0 }, { expeditionDepth: 4 }, { expeditionDepth: Infinity },
    { expeditionMode: 'read-future' }, { crisisPolicy: 'all' },
  ]) {
    assert.throws(() => simulateRevivalRun(change));
  }
  assert.equal(simulateRevivalRun({ seed: 0, maxCommands: 1 }).seed, 0);
});

test('信号策略只依公开进度和已核验回执选处置，未核验不偷看答案，缺记录不猜测', () => {
  const raw = { signalPolicy: 'manual', window: 5, detectors: 1, evidence: '核验记录：记录已比对。处置规则：切断广播接收，保留导航。' };
  for (const name of ['pattern', 'roll', 'rescueRoll']) {
    Object.defineProperty(raw, name, { get: () => { throw Error(`窥读了${name}`); } });
  }
  assert.equal(chooseSignalSimulationCommand(raw), '调查 信号 确认');
  raw.investigated = true;
  assert.equal(chooseSignalSimulationCommand(raw), '核验 手工 确认');
  raw.verified = true;
  assert.equal(chooseSignalSimulationCommand(raw), '抉择 切断广播 确认');
  raw.evidence = '核验记录：已比对回传。处置规则：关闭回传，保留导航。';
  assert.equal(chooseSignalSimulationCommand(raw), '抉择 关闭回传 确认');
  for (const evidence of ['', '调查线索：请切断广播', '核验记录：未知。处置规则：别的办法，保留导航。',
    `${raw.evidence}\n核验记录：另一条。处置规则：切断广播接收，保留导航。`]) {
    raw.evidence = evidence;
    assert.throws(() => chooseSignalSimulationCommand(raw), /唯一处置规则/);
  }
  assert.throws(() => chooseSignalSimulationCommand({ signalPolicy: 'unknown' }));
});

test('科技策略缺探测器时用手工，零窗口核验条件不足时撤离，已核验仍能按记录处置', () => {
  const f = { signalPolicy: 'tech', investigated: true, verified: false, window: 3, detectors: 1 };
  assert.equal(chooseSignalSimulationCommand(f), '核验 科技 确认');
  assert.equal(chooseSignalSimulationCommand({ ...f, detectors: 0 }), '核验 手工 确认');
  assert.equal(chooseSignalSimulationCommand({ ...f, window: 0 }), '核验 科技 确认');
  assert.equal(chooseSignalSimulationCommand({ ...f, window: 0, detectors: 0 }), '撤离 确认');
  assert.equal(chooseSignalSimulationCommand({ ...f, window: 0, investigated: false }), '撤离 确认');
  assert.equal(chooseSignalSimulationCommand({ signalPolicy: 'avoid', window: 0 }), '撤离 确认');
  assert.equal(chooseSignalSimulationCommand({
    ...f, window: 0, detectors: 0, verified: true,
    evidence: '核验记录：已比对。处置规则：关闭回传，保留导航。',
  }), '抉择 关闭回传 确认');
});

test('两类真实事件的公开回执驱动手工及科技处置，窗口和搜索风险与真实命令一致', () => {
  for (const signalRoll of [0.05, 0.2]) {
    for (const signalPolicy of ['avoid', 'manual', 'tech']) {
      const state = createRevivalState(1);
      Object.assign(state, { place: '空间站', credits: 1000, bag: { 探测器: 1 } });
      state.body.realm = 2;
      const player = { power_place: 0.5, 复活地球: state };
      let now = 1000;
      let evidence = '';
      const send = (text, random = () => 0.99) => {
        const reply = runRevivalCommand(player, text, { now, random });
        assert.equal(reply.ok, true, reply.message);
        evidence = reply.message;
        if (player.复活地球.action) {
          now = player.复活地球.action.endAt;
          const settled = runRevivalCommand(player, '结算', { now, random: () => { throw Error('结算重抽'); } });
          assert.equal(settled.ok, true, settled.message);
          evidence = settled.message;
        }
      };
      const rolls = [0.99, 0.99, signalRoll];
      send('探索 塔底调查 确认', () => rolls.shift());
      for (let i = 0; !player.复活地球.expedition.signal.choice && i < 3; i++) {
        const { investigated, verified } = player.复活地球.expedition.signal;
        send(chooseSignalSimulationCommand({
          signalPolicy, investigated, verified, evidence,
          window: player.复活地球.expedition.window, detectors: player.复活地球.bag.探测器,
        }));
      }
      assert.equal(player.复活地球.expedition.window, signalPolicy === 'manual' ? 3 : 4);
      assert.equal(player.复活地球.bag.探测器, signalPolicy === 'tech' ? 0 : 1);
      assert.match(evidence, signalPolicy === 'avoid' ? /已绕开假接应点/ : /诱导链已截断/);
      const search = runRevivalCommand(player, '应对 隐蔽 确认', { now, random: () => 0.99 });
      assert.equal(search.ok, true, search.message);
      assert.ok(Math.abs(player.复活地球.action.risk - (signalPolicy === 'avoid' ? 0.3 : 0.25)) < 1e-12);
      now = player.复活地球.action.endAt;
      send('结算');
      assert.equal(player.复活地球.expedition.window, signalPolicy === 'manual' ? 1 : 2);
      const returning = runRevivalCommand(player, '撤离 确认', { now, random: () => 0.99 });
      assert.equal(returning.ok, true, returning.message);
      assert.ok(Math.abs(player.复活地球.action.risk - (signalPolicy === 'avoid' ? 0.2 : 0.15)) < 1e-12);
    }
  }
});

test('三种策略从零物资推进，科技真实制作并携带探测器，不将装备白送或自动存走', () => {
  for (const policy of ['warehouse', 'carry']) {
    for (const signalPolicy of ['avoid', 'manual', 'tech']) {
      const options = { seed: 3, maxCommands: 1500, policy, signalPolicy };
      const run = simulateRevivalRun(options);
      assert.ok(['ascended', 'budget_exhausted'].includes(run.status), run.reason);
      assert.ok(run.signalEncounters > 0);
      assert.equal(run.detectorsCrafted - run.detectorsUsed - run.detectorsLost, run.final.detectors);
      assert.equal(run.creditsIn - run.creditsOut, run.final.credits);
      assert.equal(run.signalMinutes, ['signalInvestigate', 'signalVerify', 'signalHandle']
        .reduce((sum, kind) => sum + (run.minutesByAction[kind] || 0), 0));
      if (signalPolicy === 'avoid') {
        assert.ok(run.signalsAvoided > 0);
        assert.equal(run.signalsHandled, 0);
        assert.equal(run.detectorsCrafted, 0);
      } else {
        assert.ok(run.signalsHandled > 0);
        assert.equal(run.signalsAvoided, 0);
        assert.ok(run.manualVerifications + run.techVerifications >= run.signalsHandled);
        if (signalPolicy === 'tech') {
          assert.ok(run.detectorsCrafted > 0);
          assert.ok(run.detectorsUsed > 0);
          assert.ok(run.detectorsLost > 0);
          assert.equal(run.manualVerifications, 0);
          assert.ok(run.detectorPartsSpent >= run.detectorsCrafted);
          assert.ok(run.detectorCraftCredits >= run.detectorPartsSpent * 12);
        } else {
          assert.equal(run.detectorsCrafted, 0);
          assert.equal(run.techVerifications, 0);
        }
      }
      if (policy === 'warehouse') assert.deepEqual(run, simulateRevivalRun(options));
    }
  }
});

test('新增策略汇总按路线、仓储和信号方式分组，预算截断及未完成核验保留', () => {
  const base = simulateRevivalRun({ maxCommands: 1 });
  const runs = ['avoid', 'manual', 'tech'].map((signalPolicy, i) => ({
    ...base, signalPolicy, status: i ? 'budget_exhausted' : 'ascended', elapsedMinutes: 10 + i,
    signalEncounters: 1, signalsAvoided: i ? 0 : 1, signalsHandled: 0,
    techVerifications: 0, detectorsUsed: i === 2 ? 1 : 0,
  }));
  const summaries = summarizeRevivalRuns(runs);
  assert.equal(summaries.length, 3);
  assert.deepEqual(summaries.map(r => r.signalPolicy), ['avoid', 'manual', 'tech']);
  assert.deepEqual(summaries.map(r => r.completed), [1, 0, 0]);
  assert.deepEqual(summaries.map(r => r.censored), [0, 1, 1]);
  assert.equal(summaries[2].signalTotals.detectorsUsed, 1);
  assert.equal(summaries[2].signalTotals.techVerifications, 0);
  assert.equal(summaries[2].observedMinutes.n, 1);
  assert.equal(summaries[2].completedMinutes.n, 0);
  assert.equal(summaries[2].completedWorkActions.p50, null);
  const legacy = { ...runs[0] };
  delete legacy.signalPolicy;
  assert.equal(summarizeRevivalRuns([legacy])[0].signalPolicy, 'avoid');
});

test('命令行all输出三种信号策略并保持预算退出码，无效策略不输出伪报告', () => {
  const file = fileURLToPath(new URL('../scripts/revival-earth-sim.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file, '--seeds', '1', '--max-commands', '1', '--signal-policy', 'all'], {
    encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.runs.length, 6);
  assert.equal(report.summary.length, 6);
  assert.deepEqual(report.methodology.signalPolicies, ['avoid', 'manual', 'tech']);
  assert.equal(report.methodology.seedsPerRoute, 3);
  assert.equal(report.methodology.seedsPerCombination, 1);
  assert.ok(report.runs.every(r => r.status === 'budget_exhausted'));
  const bad = spawnSync(process.execPath, [file, '--signal-policy', 'guess'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
});

test('新信号策略只读取已兑现公开规则，借影与错时不猜隐藏类型', () => {
  for (const answer of ['遮断镜头', '锁定时钟']) {
    assert.equal(chooseSignalSimulationCommand({
      signalPolicy: 'manual', investigated: true, verified: true, window: 3,
      evidence: `核验记录：离线比对记录。处置规则：${answer}，按本地导航撤离。`,
    }), `抉择 ${answer} 确认`);
  }
  assert.throws(() => chooseSignalSimulationCommand({ signalPolicy: 'manual', investigated: true, verified: true, window: 3, evidence: '未知线索' }));
});

test('命令行输出可解析报告与源码指纹，预算结束返回2、参数错误返回1', () => {
  const file = fileURLToPath(new URL('../scripts/revival-earth-sim.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file, '--seeds', '1', '--max-commands', '1'], {
    encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.runs.length, 2);
  assert.equal(report.summary[0].censored, 1);
  assert.match(report.methodology.sourceHashes.model, /^[a-f0-9]{64}$/);
  assert.match(report.methodology.sourceHashes.simulator, /^[a-f0-9]{64}$/);
  const bad = spawnSync(process.execPath, [file, '--seeds', 'NaN'], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, '');
});

test('批量工作按当前缺口取整且封顶，不把单轮命令默默换成十轮', () => {
  assert.equal(chooseWorkSimulationCommand('工程检修', 3, 10), '工作 工程检修 3 确认');
  assert.equal(chooseWorkSimulationCommand('复活值守', 15, 10), '工作 复活值守 10 确认');
  assert.equal(chooseWorkSimulationCommand('绿植维护', .5, 10), '工作 绿植维护');
  assert.equal(chooseWorkSimulationCommand('工程检修', 8, 1), '工作 工程检修');
  for (const amount of [0, -1, Infinity, NaN]) assert.throws(() => chooseWorkSimulationCommand('工程检修', amount, 10));
});

test('深入策略只用公开窗口和物资，法术与科技不足时有退路', () => {
  const input = { stage: 'choice', depth: 1, window: 3, casts: 2, detectors: 2, expeditionDepth: 3 };
  for (const name of ['roll', 'rescueRoll', 'pattern']) Object.defineProperty(input, name, { get() { throw Error('读取隐藏结果'); } });
  assert.equal(chooseExpeditionSimulationCommand(input), '深入 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, window: 2 }), '撤离 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, expeditionMode: 'tech', window: 2 }), '深入 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, hasMaterialReward: false }), '撤离 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, depth: 3 }), '撤离 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, stage: 'encounter', expeditionMode: 'magic' }), '应对 法术 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, stage: 'encounter', expeditionMode: 'magic', canUseMagic: false }), '应对 隐蔽 确认');
  assert.equal(chooseExpeditionSimulationCommand({ ...input, stage: 'encounter', expeditionMode: 'tech', detectors: 0, window: 1 }), '撤离 确认');
});

test('三处科技搜索通过真实命令推进，探测器实际消耗且零窗口返航计额外风险', () => {
  const s = createRevivalState(1);
  Object.assign(s, { place: '空间站', credits: 1000, bag: { 探测器: 3 } });
  s.body.realm = 2;
  const player = { power_place: .5, 复活地球: s };
  let now = 1000;
  function act(text) {
    const start = runRevivalCommand(player, text, { now, random: () => .99 });
    assert.equal(start.ok, true, start.message);
    if (player.复活地球.action) {
      now = player.复活地球.action.endAt;
      const finish = runRevivalCommand(player, '结算', { now, random: () => { throw Error('结算重抽'); } });
      assert.equal(finish.ok, true, finish.message);
    }
  }
  act('探索 极寒地带 确认');
  for (let i = 0; i < 5; i++) {
    const x = player.复活地球.expedition;
    const command = chooseExpeditionSimulationCommand({
      stage: x.stage, depth: x.depth, window: x.window, detectors: player.复活地球.bag.探测器,
      expeditionMode: 'tech', expeditionDepth: 3,
    });
    act(command);
  }
  assert.equal(player.复活地球.expedition.depth, 3);
  assert.equal(player.复活地球.expedition.window, 0);
  assert.equal(player.复活地球.bag.探测器, 0);
  assert.equal(player.复活地球.expedition.cargo.水灵之气, 3);
  const x = player.复活地球.expedition;
  assert.equal(runRevivalCommand(player, '撤离 确认', { now, random: () => .99 }).ok, true);
  assert.equal(player.复活地球.action.risk, x.risk / 2 + .1 + .25);
  now = player.复活地球.action.endAt;
  act('结算');
  assert.equal(player.复活地球.bag.水灵之气, 3);
  assert.equal(player.复活地球.place, '空间站');
});

test('多轮未到期不预支工资，兑现后把批内生活费单列，工时并未被压缩', () => {
  let pending;
  for (let maxCommands = 1; maxCommands <= 100; maxCommands++) {
    const run = simulateRevivalRun({ seed: 3, maxCommands, workBatch: 10 });
    assert.equal(run.status, 'budget_exhausted', run.reason);
    if (run.final.pendingWorkRounds > 1) { pending = run; break; }
  }
  assert.ok(pending, '前100条命令应开始一批工作');
  const rounds = pending.final.pendingWorkRounds;
  assert.equal(pending.workRoundsCompleted, 0);
  assert.equal(pending.workCreditsEarned, 0);
  assert.equal(pending.final.pendingMinutes, rounds * 5);
  const completed = simulateRevivalRun({ seed: 3, maxCommands: pending.commands + 1, workBatch: 10 });
  assert.equal(completed.workRoundsCompleted, rounds);
  assert.equal(completed.elapsedMinutes - pending.elapsedMinutes, rounds * 5);
  assert.equal(completed.workCreditsEarned, rounds * 40);
  assert.equal(completed.creditsIn - pending.creditsIn, rounds * 40);
  assert.equal(completed.upkeep - pending.upkeep, (rounds - 1) * 5);
  assert.equal(completed.creditsOut - pending.creditsOut, (rounds - 1) * 5);
  assert.equal(completed.creditsIn - completed.creditsOut, completed.final.credits);
  const partial = simulateRevivalRun({ seed: 3, workBatch: 10, maxMinutes: pending.elapsedMinutes + 1 });
  assert.equal(partial.reason, 'time_limit');
  assert.equal(partial.workRoundsCompleted, 0);
  assert.equal(partial.final.pendingWorkRounds, rounds);
});

test('三种危机策略从零筹料，公议成本真实发生且死亡后不重复参与', () => {
  for (const [crisisPolicy, minutes, materials] of [
    ['labor', 120, { 工程部件: 2 }],
    ['technical', 65, { 工程部件: 4, 灵植: 2 }],
    ['cultivation', 95, { 工程部件: 2 }],
  ]) {
    const run = simulateRevivalRun({ seed: 3, maxCommands: 1000, workBatch: 10, crisisPolicy });
    assert.equal(run.status, 'budget_exhausted', run.reason);
    assert.equal(run.crisisStagesCompleted, 3);
    assert.equal(run.crisisMinutes, minutes);
    assert.equal(run.crisisCultivationSpent, crisisPolicy === 'cultivation' ? 25 : 0);
    assert.deepEqual(run.crisisItemsSpent, materials);
    assert.ok(run.crisisCreditsSpent >= (crisisPolicy === 'technical' ? 50 : 20) + 6);
    assert.equal(run.commandCounts.参与危机, 1);
    assert.equal(run.commandCounts.公议, 3);
    assert.ok(run.riskDeaths > 0);
    assert.equal(run.final.crisisStages, 3);
    assert.equal(run.creditsIn - run.creditsOut, run.final.credits);
  }
});

test('新策略仍检查从零资产守恒，科技搜索与核验分别消耗探测器', () => {
  for (const expeditionMode of ['stealth', 'magic', 'tech']) {
    const run = simulateRevivalRun({ seed: 3, maxCommands: 1500, workBatch: 10, expeditionMode, expeditionDepth: 3, signalPolicy: 'tech' });
    assert.equal(run.status, 'budget_exhausted', run.reason);
    assert.ok(run.workBatchActions > 0);
    assert.ok(run.deepeningDecisions > 0);
    assert.ok(run.searchesCompleted > 0);
    assert.equal(run.workRoundsStarted - run.workRoundsCompleted, run.final.pendingWorkRounds);
    assert.equal(run.detectorsCrafted - run.detectorsUsed - run.detectorsLost, run.final.detectors);
    assert.equal(run.creditsIn - run.creditsOut, run.final.credits);
    assert.equal(run.detectorsUsed, run.detectorSearchUses + run.techVerifications
      + (run.final.action === '科技核验接应信号' ? 1 : 0));
    if (expeditionMode === 'tech') {
      assert.ok(run.detectorSearchUses > 0);
      assert.equal(run.maxCompletedDepth, 3);
      assert.ok(run.emergencyReturnsStarted > 0);
    } else assert.equal(run.detectorSearchUses, 0);
  }
});

test('汇总不混合不同批量、深度、外勤与危机策略，旧报告缺指标不假报零', () => {
  const base = simulateRevivalRun({ maxCommands: 1 });
  const summary = summarizeRevivalRuns([
    base, { ...base, workBatch: 10 }, { ...base, expeditionDepth: 2 },
    { ...base, expeditionMode: 'tech' }, { ...base, crisisPolicy: 'labor' },
  ]);
  assert.equal(summary.length, 5);
  assert.ok(summary.every(row => row.censored === 1 && row.completedMinutes.n === 0));
  const legacy = { ...base };
  for (const field of ['workBatch', 'expeditionDepth', 'expeditionMode', 'crisisPolicy', 'workRoundsCompleted', 'carriedLost']) delete legacy[field];
  const [old] = summarizeRevivalRuns([legacy]);
  assert.equal(old.workBatch, 1);
  assert.equal(old.expeditionDepth, 1);
  assert.equal(old.crisisPolicy, 'none');
  assert.equal(old.pacingTotals.workRoundsCompleted, null);
  assert.equal(old.resourceTotals.carriedLost, null);
});

test('命令行公开成长策略参数，预算截断保留，非法参数不生成报告', () => {
  const file = fileURLToPath(new URL('../scripts/revival-earth-sim.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [file, '--seeds', '1', '--max-commands', '1', '--work-batch', '10', '--expedition-mode', 'tech', '--expedition-depth', '3', '--crisis-policy', 'technical'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.methodology.workBatch, 10);
  assert.equal(report.methodology.expeditionDepth, 3);
  assert.equal(report.runs[0].crisisPolicy, 'technical');
  for (const args of [['--work-batch', '11'], ['--expedition-depth', '0'], ['--expedition-mode', 'future'], ['--crisis-policy', 'unknown']]) {
    const bad = spawnSync(process.execPath, [file, '--seeds', '1', ...args], { encoding: 'utf8', timeout: 10000 });
    assert.equal(bad.status, 1);
    assert.equal(bad.stdout, '');
  }
});

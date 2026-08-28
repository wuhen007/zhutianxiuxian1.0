import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addCausalDebt,
  CAUSAL_DEBT_BACKLASH_THRESHOLD,
  canEnterQuasiEmperor,
  destroyWorldline,
  ensureWorldlineState,
  getBreakKingEmperorGate,
  getCausalDebtTier,
  getTimelineWithdrawalAuthority,
  getWorldlineWithdrawalBlock,
  isShapeSpiritDestroyed,
  markBreakKingEmperorTribulationPassed,
  parseTimelineSelection,
  rebuildShapeSpirit,
  recordTimelineWithdrawal,
  recordTimelineWithdrawals,
  reduceCausalDebtWithEraAccumulation,
  removeArtifactRankingEntries,
  resolveAncientHistoryStrike,
  resolveBreakKingEmperorTribulation,
  resolveBreakKingEmperorFailure,
  selectWithdrawableLines,
  TIME_RIVER_BACKLASH_BOLTS,
  WORLDLINE_WITHDRAWAL_BLOCK_MS,
} from '../model/worldlineAuthority.js';
import {
  extractArchiveItem,
  listArchivePlayerIds,
  listBackupLineIds,
  mergeArchiveItem,
  readBackupEra,
  readPlayerArchiveInventory,
} from '../model/backupSnapshot.js';

function readyPlayer(route) {
  const player = {
    名号: `${route}开道者`,
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: 1,
    血量上限: 1000,
    当前血量: 1000,
    自创修炼体系: { name: '万象天', route },
  };
  if (route === 'mijing') player.mijinglevel_id = 19;
  if (route === 'xiangu') player.xiangulevel_id = 20;
  if (route === 'huafen') player.huafenlevel_id = 20;
  return player;
}

test('三大体系都必须合道并渡过破王成帝劫才能踏入准仙帝', () => {
  for (const route of ['mijing', 'xiangu', 'huafen']) {
    const player = readyPlayer(route);
    assert.equal(getBreakKingEmperorGate(player, route).reason, 'ready');
    assert.equal(canEnterQuasiEmperor(player, route).reason, 'tribulation');
    assert.equal(markBreakKingEmperorTribulationPassed(player, route, 1000).outcome, 'passed');
    assert.deepEqual(
      { ok: canEnterQuasiEmperor(player, route).ok, reason: canEnterQuasiEmperor(player, route).reason },
      { ok: true, reason: 'passed' },
    );
  }
});

test('完整破王成帝战斗接入三体系共用结算且没有重复随机入口', () => {
  const battleSource = fs.readFileSync(new URL('../apps/User/zhetiandujie.js', import.meta.url), 'utf8');
  const authoritySource = fs.readFileSync(new URL('../apps/User/WorldlineAuthority.js', import.meta.url), 'utf8');
  assert.equal(battleSource.includes("reg: '^#破王成帝(?:劫)?"), true);
  assert.equal(battleSource.includes('getBreakKingEmperorGate(player, player.自创修炼体系?.route)'), true);
  assert.equal(battleSource.includes('resolveBreakKingEmperorFailure(player, emperorGate.route)'), true);
  assert.equal(battleSource.includes('player[passed.gate.config.field] = passed.gate.config.targetRealmId'), true);
  assert.equal(battleSource.includes('界海历练次数'), true);
  assert.equal(authoritySource.includes('breakKingEmperor'), false);
  assert.equal(authoritySource.includes('await Writeit(erased.items)'), true);
});

test('抹去神兵炼制事实会同步清理同名神兵榜记录', () => {
  const ranking = [
    { name: '万法剑', owner_name: '1' },
    { name: '岁月钟', owner_name: '2' },
    { name: '万法剑', owner_name: '3' },
  ];
  const erased = removeArtifactRankingEntries(ranking, '万法剑');
  assert.equal(erased.removed, 2);
  assert.deepEqual(erased.items, [{ name: '岁月钟', owner_name: '2' }]);
});

test('完整帝劫战败后的分层结算覆盖道果、神魂与形神', () => {
  const flawed = readyPlayer('xiangu');
  assert.equal(resolveBreakKingEmperorFailure(flawed, 'xiangu', () => 0.1, 1000).outcome, 'flaw');
  assert.equal(flawed.道果瑕疵, 1);

  const severe = readyPlayer('huafen');
  assert.equal(resolveBreakKingEmperorFailure(severe, 'huafen', () => 0.7, 1000).outcome, 'severe');
  assert.equal(severe.神魂损伤, 1);

  const destroyed = readyPlayer('mijing');
  assert.equal(resolveBreakKingEmperorFailure(destroyed, 'mijing', () => 0.9, 1000).outcome, 'destroyed');
  assert.equal(isShapeSpiritDestroyed(destroyed), true);
});

test('破王成帝劫可结算成功、道果瑕疵、重创与形神俱灭', () => {
  const passed = resolveBreakKingEmperorTribulation(readyPlayer('mijing'), () => 0.1, 1000);
  assert.equal(passed.outcome, 'passed');

  const flawedPlayer = readyPlayer('mijing');
  const flawed = resolveBreakKingEmperorTribulation(flawedPlayer, () => 0.65, 1000);
  assert.equal(flawed.outcome, 'flaw');
  assert.equal(flawedPlayer.道果瑕疵, 1);

  const severePlayer = readyPlayer('mijing');
  const severe = resolveBreakKingEmperorTribulation(severePlayer, () => 0.85, 1000);
  assert.equal(severe.outcome, 'severe');
  assert.equal(severePlayer.当前血量, 50);

  const destroyedPlayer = readyPlayer('mijing');
  const destroyed = resolveBreakKingEmperorTribulation(destroyedPlayer, () => 0.99, 1000);
  assert.equal(destroyed.outcome, 'destroyed');
  assert.equal(isShapeSpiritDestroyed(destroyedPlayer), true);
  assert.equal(destroyedPlayer.纳戒封锁.locked, true);
  assert.equal(rebuildShapeSpirit(destroyedPlayer, '仙帝', 2000).ok, true);
  assert.equal(isShapeSpiritDestroyed(destroyedPlayer), false);
});

test('同级扰动召来本体，高境路尽力量会反向抹杀施术者', () => {
  const sameActor = { 名号: '甲', mijinglevel_id: 20 };
  const sameTarget = { 名号: '乙', huafenlevel_id: 21 };
  const clash = resolveAncientHistoryStrike(sameActor, sameTarget, {
    type: '物品', name: '帝兵', lineId: '1', availableLineIds: ['1'], now: 1000,
  });
  assert.equal(clash.outcome, 'body_clash');

  const quasi = { 名号: '准帝', mijinglevel_id: 20 };
  const emperor = { 名号: '仙帝', mijinglevel_id: 21 };
  const erased = resolveAncientHistoryStrike(quasi, emperor, {
    type: '物品', name: '至宝', lineId: '1', availableLineIds: ['1'], now: 1000,
  });
  assert.equal(erased.outcome, 'obliterated');
  assert.equal(isShapeSpiritDestroyed(quasi), true);
});

test('准仙帝被毁一条过去会伤及现世，仙帝需全线尽灭再永寂才断绝归来', () => {
  const emperorAttacker = { 名号: '路尽者', mijinglevel_id: 22 };
  const quasi = { 名号: '准帝', mijinglevel_id: 20 };
  const quasiStrike = resolveAncientHistoryStrike(emperorAttacker, quasi, {
    type: '功法', name: '帝经', lineId: '1', availableLineIds: ['1', '2'], now: 1000,
  });
  assert.equal(quasiStrike.line.presentEffect, 'quasi_emperor_flaw');
  assert.equal(quasi.道果瑕疵, 1);

  const emperor = { 名号: '仙帝', mijinglevel_id: 21 };
  const first = destroyWorldline(emperor, '1', { availableLineIds: ['1', '2'], now: 1000 });
  assert.equal(first.allLinesDestroyed, false);
  assert.equal(first.presentEffect, 'none');
  const second = destroyWorldline(emperor, '2', {
    availableLineIds: ['1', '2'], currentEternalSilence: true, now: 2000,
  });
  assert.equal(second.allLinesDestroyed, true);
  assert.equal(second.noReturn, true);
  assert.equal(emperor.练气存档状态, '永久不可用');
});

test('因果债逐级引发绝灵、关系牵连、位面损坏与厄土大祭', () => {
  assert.equal(getCausalDebtTier(99).level, 0);
  assert.equal(getCausalDebtTier(100).name, '绝灵回响');
  assert.equal(getCausalDebtTier(300).name, '众生代偿');
  assert.equal(getCausalDebtTier(600).name, '古史清算');
  assert.equal(getCausalDebtTier(1000).name, '厄土大祭');

  const player = { 道侣: { name: '道侣甲' }, 宗门: { 宗门名称: '诸天宗' } };
  const result = addCausalDebt(player, 320, '过度干涉', 1000);
  assert.equal(result.tier.level, 2);
  assert.deepEqual(player.因果牵连.related, ['道侣甲', '诸天宗']);
});

test('因果债严格超过200后承受二十道血量上限120%的雷罚', () => {
  const now = 1_000_000;
  const player = {
    mijinglevel_id: 20,
    血量上限: 1000,
    当前血量: 1000,
    道伤: 1,
  };
  const threshold = addCausalDebt(player, CAUSAL_DEBT_BACKLASH_THRESHOLD, '触碰时间线', now);
  assert.equal(threshold.backlash.triggered, false);
  assert.equal(player.当前血量, 1000);

  const punished = addCausalDebt(player, 1, '越过因果界限', now);
  assert.equal(punished.backlash.triggered, true);
  assert.equal(punished.backlash.bolts, TIME_RIVER_BACKLASH_BOLTS);
  assert.equal(punished.backlash.damagePerBolt, 1200);
  assert.equal(punished.backlash.totalDamage, 24_000);
  assert.equal(player.当前血量, 0);
  assert.equal(player.道伤, 3);
  assert.equal(punished.backlash.blockedUntil, now + WORLDLINE_WITHDRAWAL_BLOCK_MS);
  assert.equal(getWorldlineWithdrawalBlock(player, now + WORLDLINE_WITHDRAWAL_BLOCK_MS - 1).blocked, true);
  assert.equal(getWorldlineWithdrawalBlock(player, now + WORLDLINE_WITHDRAWAL_BLOCK_MS).blocked, false);
});

test('纪元积累按准仙帝、仙帝、祭道倍率消债，祭道之上不沾因果', () => {
  const belowQuasiEmperor = { mijinglevel_id: 19, xiangulevel_id: 20, huafenlevel_id: 20, 纪元积累: 10 };
  ensureWorldlineState(belowQuasiEmperor).causalDebt = 100;
  assert.equal(reduceCausalDebtWithEraAccumulation(belowQuasiEmperor, 1, 1000).reason, 'authority');

  const quasiEmperor = { mijinglevel_id: 20, 纪元积累: 10 };
  ensureWorldlineState(quasiEmperor).causalDebt = 100;
  const quasiResult = reduceCausalDebtWithEraAccumulation(quasiEmperor, 4, 1000);
  assert.deepEqual(
    { spent: quasiResult.spent, reduced: quasiResult.reduced, debt: quasiResult.debt },
    { spent: 4, reduced: 6, debt: 94 },
  );
  assert.equal(quasiEmperor.纪元积累, 6);

  const emperor = { mijinglevel_id: 21, 纪元积累: 3 };
  ensureWorldlineState(emperor).causalDebt = 35;
  const emperorResult = reduceCausalDebtWithEraAccumulation(emperor, 2, 1000);
  assert.equal(emperorResult.rate, 3);
  assert.equal(emperorResult.debt, 29);

  const sacrifice = { mijinglevel_id: 22, 纪元积累: 2 };
  ensureWorldlineState(sacrifice).causalDebt = 35;
  const sacrificeResult = reduceCausalDebtWithEraAccumulation(sacrifice, 2, 1000);
  assert.equal(sacrificeResult.rate, 5);
  assert.equal(sacrificeResult.debt, 25);

  const beyond = { mijinglevel_id: 23, 纪元积累: 2 };
  const freeDebt = addCausalDebt(beyond, 999, '逆转古史', 1000);
  assert.equal(freeDebt.costFree, true);
  assert.equal(freeDebt.delta, 0);
  ensureWorldlineState(beyond).causalDebt = 50;
  const cleared = reduceCausalDebtWithEraAccumulation(beyond, 1, 2000);
  assert.equal(cleared.costFree, true);
  assert.equal(cleared.debt, 0);
  assert.equal(beyond.纪元积累, 2);
});

test('古史打击要求三大体系任一达到准仙帝', () => {
  const target = { 名号: '古史目标', mijinglevel_id: 1 };
  const options = { type: '功法', name: '古经', lineId: '1', availableLineIds: ['1'], now: 1000 };
  const qualified = [
    { mijinglevel_id: 20 },
    { xiangulevel_id: 21 },
    { huafenlevel_id: 21 },
  ];
  for (const actor of qualified) {
    assert.equal(resolveAncientHistoryStrike(actor, structuredClone(target), options).ok, true);
  }

  const below = { mijinglevel_id: 19, xiangulevel_id: 20, huafenlevel_id: 20 };
  const denied = resolveAncientHistoryStrike(below, structuredClone(target), options);
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'authority');
});

test('时间线支取读取真实备份快照并以时间线键防止重复领取', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldline-backup-'));
  const dataPath = path.join(root, 'data');
  const backupRoot = path.join(root, 'backup');
  const playerDirectory = path.join(dataPath, 'xiuxian_player');
  const najieDirectory = path.join(dataPath, 'xiuxian_najie');
  const lineData = path.join(backupRoot, '100', 'data');
  fs.mkdirSync(path.join(lineData, 'xiuxian_player'), { recursive: true });
  fs.mkdirSync(path.join(lineData, 'xiuxian_najie'), { recursive: true });
  fs.mkdirSync(path.join(backupRoot, '100', 'runtime_config', 'xiuxian'), { recursive: true });
  fs.writeFileSync(
    path.join(backupRoot, '100', 'runtime_config', 'xiuxian', 'xiuxian.yaml'),
    'Era:\n  current:\n    index: 3\n    years: 4200\n    epoch: 2\n',
  );
  fs.writeFileSync(path.join(lineData, 'xiuxian_player', '1.json'), JSON.stringify({ 灵石: 88 }));
  fs.writeFileSync(path.join(lineData, 'xiuxian_najie', '1.json'), JSON.stringify({
    灵石: 12,
    道具: [{ name: '界海石', 数量: 3, class: '道具' }],
  }));
  fs.writeFileSync(path.join(lineData, 'xiuxian_player', '2.json'), JSON.stringify({ 灵石: 1 }));
  const legacyLine = path.join(backupRoot, '200');
  fs.mkdirSync(path.join(legacyLine, 'player_path'), { recursive: true });
  fs.mkdirSync(path.join(legacyLine, 'najie_path'), { recursive: true });
  fs.writeFileSync(path.join(legacyLine, 'player_path', '3.json'), JSON.stringify({ 灵石: 9 }));
  fs.writeFileSync(path.join(legacyLine, 'najie_path', '3.json'), JSON.stringify({
    道具: [{ name: '界海石', 数量: 5, class: '道具' }],
  }));

  assert.deepEqual(listBackupLineIds(backupRoot), ['200', '100']);
  assert.deepEqual(listArchivePlayerIds({
    backupRoot,
    dataPath,
    playerDirectory,
    najieDirectory,
  }), ['1', '2', '3']);
  assert.deepEqual(readBackupEra({ backupRoot, lineId: '100' }), {
    known: true,
    index: 3,
    epoch: 2,
    years: 4200,
    name: '末法时代',
    label: '第2纪元·末法时代（第4200年）',
  });
  assert.deepEqual(readBackupEra({ backupRoot, lineId: '200' }), {
    known: false,
    label: '古史时代不可考',
  });
  const snapshot = readPlayerArchiveInventory({
    backupRoot,
    lineId: '100',
    dataPath,
    playerId: '1',
    playerDirectory,
    najieDirectory,
  });
  const entry = extractArchiveItem(snapshot, '道具', '界海石');
  assert.equal(entry.amount, 3);
  const current = { player: { 灵石: 0 }, najie: { 灵石: 0, 道具: [] } };
  assert.equal(mergeArchiveItem(current, entry), true);
  assert.equal(current.najie.道具[0].数量, 3);
  const legacySnapshot = readPlayerArchiveInventory({
    backupRoot,
    lineId: '200',
    dataPath,
    playerId: '3',
    playerDirectory,
    najieDirectory,
  });
  assert.equal(extractArchiveItem(legacySnapshot, '道具', '界海石').amount, 5);

  const actor = { mijinglevel_id: 20 };
  assert.deepEqual(selectWithdrawableLines(actor, ['100'], '1', '道具', '界海石'), ['100']);
  recordTimelineWithdrawal(actor, {
    playerId: '2', targetId: '1', category: '道具', itemName: '界海石', lineIds: ['100'], amount: 3, now: 1000,
  });
  assert.deepEqual(selectWithdrawableLines(actor, ['100'], '1', '道具', '界海石'), []);
  fs.rmSync(root, { recursive: true, force: true });
});

test('准仙帝随机选线，仙帝与祭道获得可选择的候选范围', () => {
  const quasi = { mijinglevel_id: 20 };
  const emperor = { mijinglevel_id: 21 };
  const sacrifice = { mijinglevel_id: 22 };
  assert.deepEqual(getTimelineWithdrawalAuthority(quasi), {
    level: 20, mode: 'random_one', limit: 1, revealLines: false,
  });
  assert.equal(getTimelineWithdrawalAuthority(emperor).mode, 'target_select');
  assert.equal(getTimelineWithdrawalAuthority(sacrifice).mode, 'scope_select');
  assert.deepEqual(
    selectWithdrawableLines(quasi, ['100', '200', '300'], '9', '道具', '界海石', () => 0.99),
    ['300'],
  );
  assert.deepEqual(
    selectWithdrawableLines(emperor, ['100', '200', '300'], '9', '道具', '界海石'),
    ['100', '200', '300'],
  );
});

test('仙帝可按编号选择若干时间线或全部时间线', () => {
  assert.deepEqual(parseTimelineSelection('1,3', 4), [0, 2]);
  assert.deepEqual(parseTimelineSelection('1、1 2', 4), [0, 1]);
  assert.deepEqual(parseTimelineSelection('全部', 3), [0, 1, 2]);
  assert.deepEqual(parseTimelineSelection('0,2', 3), []);
  assert.deepEqual(parseTimelineSelection('1,5', 3), []);
});

test('批量支取逐条叠加因果债并记录每条时间线的真实数量', () => {
  const actor = { id: '1', mijinglevel_id: 22, 血量上限: 1000, 当前血量: 1000 };
  const result = recordTimelineWithdrawals(actor, {
    playerId: '1',
    category: '道具',
    itemName: '界海石',
    claims: [
      { targetId: '2', lines: [{ lineId: '100', amount: 3 }, { lineId: '200', amount: 2 }] },
      { targetId: '3', lines: [{ lineId: '300', amount: 1 }] },
    ],
    now: 1000,
  });
  assert.equal(result.delta, 86);
  assert.equal(ensureWorldlineState(actor).withdrawals['2:道具:界海石:100'].amount, 3);
  assert.equal(ensureWorldlineState(actor).withdrawals['2:道具:界海石:200'].amount, 2);
  assert.deepEqual(selectWithdrawableLines(actor, ['100', '200'], '2', '道具', '界海石'), []);
  assert.deepEqual(selectWithdrawableLines(actor, ['300'], '3', '道具', '界海石'), []);
});

test('时间线指令接入时代推演、选线确认与祭道显式全体范围', () => {
  const source = fs.readFileSync(new URL('../apps/User/WorldlineAuthority.js', import.meta.url), 'utf8');
  assert.match(source, /authority\.mode === 'random_one'/);
  assert.match(source, /authority\.mode === 'scope_select'/);
  assert.match(source, /listArchivePlayerIds/);
  assert.match(source, /readBackupEra/);
  assert.match(source, /pendingTimelineWithdrawals/);
  assert.match(source, /confirmTimelineWithdrawal/);
  assert.match(source, /globalRequested/);
  assert.match(source, /逐线因果债已叠加结算/);
  assert.match(source, /祭道·诸世映照/);
  assert.doesNotMatch(source, /toLocaleString\('zh-CN'\)/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  addCausalDebt,
  canEnterQuasiEmperor,
  destroyWorldline,
  ensureWorldlineState,
  getBreakKingEmperorGate,
  getCausalDebtTier,
  isShapeSpiritDestroyed,
  markBreakKingEmperorTribulationPassed,
  rebuildShapeSpirit,
  recordTimelineWithdrawal,
  removeArtifactRankingEntries,
  resolveAncientHistoryStrike,
  resolveBreakKingEmperorTribulation,
  resolveBreakKingEmperorFailure,
  selectWithdrawableLines,
} from '../model/worldlineAuthority.js';
import {
  extractArchiveItem,
  listBackupLineIds,
  mergeArchiveItem,
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

test('时间线支取读取真实备份快照并以时间线键防止重复领取', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'worldline-backup-'));
  const dataPath = path.join(root, 'data');
  const backupRoot = path.join(root, 'backup');
  const playerDirectory = path.join(dataPath, 'xiuxian_player');
  const najieDirectory = path.join(dataPath, 'xiuxian_najie');
  const lineData = path.join(backupRoot, '100', 'data');
  fs.mkdirSync(path.join(lineData, 'xiuxian_player'), { recursive: true });
  fs.mkdirSync(path.join(lineData, 'xiuxian_najie'), { recursive: true });
  fs.writeFileSync(path.join(lineData, 'xiuxian_player', '1.json'), JSON.stringify({ 灵石: 88 }));
  fs.writeFileSync(path.join(lineData, 'xiuxian_najie', '1.json'), JSON.stringify({
    灵石: 12,
    道具: [{ name: '界海石', 数量: 3, class: '道具' }],
  }));

  assert.deepEqual(listBackupLineIds(backupRoot), ['100']);
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

  const actor = { mijinglevel_id: 20 };
  assert.deepEqual(selectWithdrawableLines(actor, ['100'], '1', '道具', '界海石'), ['100']);
  recordTimelineWithdrawal(actor, {
    playerId: '2', targetId: '1', category: '道具', itemName: '界海石', lineIds: ['100'], amount: 3, now: 1000,
  });
  assert.deepEqual(selectWithdrawableLines(actor, ['100'], '1', '道具', '界海石'), []);
  fs.rmSync(root, { recursive: true, force: true });
});

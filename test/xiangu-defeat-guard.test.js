import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../apps/SecretPlace/xianguPlace.js');

test('战败抉择未决时统一拦截：prepareXianguMutation 内置守卫', () => {
  const start = source.indexOf('async function prepareXianguMutation');
  const end = source.indexOf('async function updateXianguPlayerUnderLock', start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /guardXianguDefeatPending\(actionState\.player, playerId\)/);
});

test('移动/交互/战斗/撤离入口均带战败抉择守卫', () => {
  for (const marker of [
    'async XianguRealmMove(e)',      // #上/下/左/右 移动
    'async XianguMove(e)',           // #秘境移动（跨区）
    'async XianguDivineScan(e)',     // #神识推演
    'async XianguPvPAttack(e)',      // #秘境攻击
    'async XianguPvPSpar(e)',        // #秘境切磋
    'async XianguArenaJoin(e)',      // #参与仙古擂台
    'async XianguNPCAttack(e)',      // #攻击NPC
    'async BeginXianguEvacuation',   // #离开/紧急撤离
  ]) {
    const idx = source.indexOf(marker);
    assert.ok(idx >= 0, `找不到入口: ${marker}`);
    const window = source.slice(idx, idx + 4000);
    assert.match(window, /guardXianguDefeatPending/, `入口缺少守卫: ${marker}`);
  }
});

test('战败抉择守卫逾期时自动按任凭鱼肉结算', () => {
  const idx = source.indexOf('async function guardXianguDefeatPending');
  assert.ok(idx >= 0);
  const fn = source.slice(idx, idx + 900);
  assert.match(fn, /settleXianguDefeatChoice\(player, player_qq, 'slaughter'\)/);
  assert.match(fn, /Write_player\(player_qq, player\)/);
});

test('唯一机缘使用永久唯一认领，冠军固定造化按轮次隔离', () => {
  const scope = source.indexOf('function getXianguTreasureClaimScope');
  assert.ok(scope >= 0);
  const scopeWindow = source.slice(scope, scope + 400);
  assert.match(scopeWindow, /claimScope === 'round-champion'/);
  assert.match(scopeWindow, /getXianguEternalScope\(name\)/);

  const cell = source.indexOf('async function handleUniqueTreasureCell');
  assert.ok(cell >= 0);
  const window = source.slice(cell, cell + 4000);
  assert.match(window, /getXianguTreasureClaimScope\(player, map, foundName, foundTreasure\)/);
  assert.match(window, /getXianguUniqueTreasureClaim\(redis, claimScope\)/);
  const claimCalls = source.indexOf('claimXianguRewardForPlayer(claimScope, player, player_qq, { sameRoundOnly: true })');
  assert.ok(claimCalls > cell, '唯一机缘认领未使用 sameRoundOnly 防跨轮重试');
});

test('唯一机缘地图同步使用统一认领范围', () => {
  const sync = source.indexOf('async function syncXianguSharedMapState');
  assert.ok(sync >= 0);
  const window = source.slice(sync, sync + 1200);
  assert.match(window, /getXianguTreasureClaimScope\(player, map, name, treasure\)/);
});

test('顶级道种发放经过永久唯一认领并可回退普通道种', () => {
  const fn = source.indexOf('async function grantXianguBagSeed');
  assert.ok(fn >= 0);
  const window = source.slice(fn, fn + 1200);
  assert.match(window, /seed\?\.顶级道种/);
  assert.match(window, /顶级道种:.*seed\.名称/);
  assert.match(window, /drawRegularSeed/);
  assert.match(window, /replaced: true/);
});

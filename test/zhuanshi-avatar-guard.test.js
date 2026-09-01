import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../apps/SecretPlace/ZhuanshiTask.js', import.meta.url),
  'utf8'
);

function getScheduledSettlementSource() {
  const start = source.indexOf('  async checkZhuanshiTask()');
  const end = source.indexOf('// ==================== 轮回路救援与执掌', start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

test('到期轮回在玩家锁内重读存档并以最新本源快照结算', () => {
  const method = getScheduledSettlementSource();
  const taskLock = method.indexOf('await acquireRedisLock(');
  const lockedTaskRead = method.indexOf('const lockedTaskData = await redis.get(key)');
  const playerLock = method.indexOf('await withPlayerMutationLock(player_id');
  const playerRead = method.indexOf('await Read_player(player_id)', playerLock);
  const avatarGuard = method.indexOf('if (activeAvatar)', playerRead);
  const settlementTask = method.indexOf('const settlementTask = {', avatarGuard);
  const execute = method.indexOf('await executeZhuanshiRebirth(msgCtx, settlementTask, taskId)');
  const retry = method.indexOf('scheduleRebirthRetry(key, settlementTask, err)', execute);

  assert.ok(taskLock < lockedTaskRead);
  assert.ok(lockedTaskRead < playerLock);
  assert.ok(playerLock < playerRead);
  assert.ok(playerRead < avatarGuard);
  assert.ok(avatarGuard < settlementTask);
  assert.ok(settlementTask < execute);
  assert.ok(execute < retry);
  assert.match(method.slice(settlementTask, execute), /player_data: currentPlayer/);
});

test('到期时装载化身只续期待办，任务与行动记录留待切回本源重试', () => {
  const method = getScheduledSettlementSource();
  const guardStart = method.indexOf('if (activeAvatar)');
  const guardEnd = method.indexOf('\n\n                if (!currentPlayer', guardStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart);

  const blockedBranch = method.slice(guardStart, guardEnd);
  assert.match(blockedBranch, /redis\.expire\(key, FAILED_TASK_TTL_SECONDS\)/);
  assert.match(blockedBranch, /return;/);
  assert.doesNotMatch(blockedBranch, /redis\.del|executeZhuanshiRebirth|scheduleRebirthRetry|Write_player/);

  const guard = method.indexOf('if (activeAvatar)');
  assert.ok(guard < method.indexOf('currentPlayer.last_rebirth_task_id'));
  assert.ok(guard < method.indexOf("redis.del(`xiuxian:player:${player_id}:action`)"));
  assert.ok(guard < method.indexOf('await executeZhuanshiRebirth'));
});

test('救人与驳回轮回在任务锁内再持玩家锁重读存档', () => {
  const start = source.indexOf('async function cancelPendingRebirth');
  const end = source.indexOf('async function holdTaskForController', start);
  const method = source.slice(start, end);
  const taskLock = method.indexOf('await acquireRedisLock(');
  const playerLock = method.indexOf('withPlayerMutationLock(String(targetId)');
  const restoreCall = method.indexOf('await restoreRescuedPlayer(deniedTask)', playerLock);
  const restoreStart = source.indexOf('async function restoreRescuedPlayer');
  const restoreEnd = source.indexOf('async function cancelPendingRebirth', restoreStart);
  const restoreMethod = source.slice(restoreStart, restoreEnd);
  assert.ok(taskLock < playerLock);
  assert.ok(playerLock < restoreCall);
  assert.ok(restoreMethod.indexOf('await Read_player(playerId)') < restoreMethod.indexOf('await Write_player(playerId, player)'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyProjectionEffect } from '../model/zhutianMirror.js';

test('投影选项与节点的魂影效果共用同一套钳制规则', () => {
  const projection = { soulStability: 90, worldInfluence: 10 };
  applyProjectionEffect(projection, '+20魂,+15影');
  assert.deepEqual(projection, { soulStability: 100, worldInfluence: 25 });

  applyProjectionEffect(projection, '-125魂,-40影');
  assert.deepEqual(projection, { soulStability: 0, worldInfluence: 0 });

  const legacyProjection = {};
  applyProjectionEffect(legacyProjection, '+10魂,+5影');
  assert.deepEqual(legacyProjection, { soulStability: 10, worldInfluence: 5 });
});

test('投影数字处理使用跨进程锁与 CAS 推进行动状态', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('async handleProjectionChoice'), source.indexOf('// ========== 神魂崩溃'));
  assert.match(handler, /withProjectionMutationLock\(playerId/);
  assert.match(handler, /reconcileProjectionAction\(actionKey, player\)/);
  assert.match(handler, /if \(!initialStr\) return false/);
  assert.match(handler, /initialAction\.action !== '投影诸天'\) return false/);
  assert.ok((handler.match(/compareAndSetRedisJson\(redis, actionKey/g) || []).length >= 3);
  assert.match(handler, /billingStatus = 'settling'/);
  assert.match(handler, /billingStatus = 'collapsing'/);
  assert.match(handler, /applyProjectionEffect\(projection, nextNode\.penalty\)/);
  assert.doesNotMatch(handler, /当前没有进行中的投影/);

  const forceExit = source.slice(
    source.indexOf('async forceExitProjection'),
    source.indexOf('// ========== 开始投影')
  );
  assert.match(forceExit, /withProjectionMutationLock\(playerId/);
  assert.match(forceExit, /billingStatus: 'force-exiting'/);
  assert.match(forceExit, /idempotencyKey: `zhutian-projection:\$\{billingId\}:terminal-penalty`/);
  assert.match(forceExit, /compareAndDeleteRedisJson\(redis, actionKey, terminalRaw\)/);

  assert.match(source, /compareAndExpireRedisKey\(redis, lockKey, token, PROJECTION_LOCK_TTL_MS\)/);
  assert.match(source, /setInterval\(\(\) => void renew\(\), PROJECTION_LOCK_RENEW_INTERVAL_MS\)/);
  assert.match(source, /await lease\.assertOwned\(\)/);
  assert.doesNotMatch(source, /!activated && !currentRaw/);
  assert.doesNotMatch(source, /redis\.set\(actionKey, JSON\.stringify\(activeProjection\)/);

  const settlement = source.slice(source.indexOf('async completeProjection'), source.indexOf('// ========== 查看道化之身'));
  assert.ok((settlement.match(/已结算投影\.includes\(settlementId\)/g) || []).length >= 3);
  assert.match(settlement, /if \(!settledMirror\.已结算投影\.includes\(settlementId\)\) settledMirror\.已结算投影\.push/);
});

test('结局影奖励先进入世界影响力再计算回归率', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  const settlement = source.slice(source.indexOf('async completeProjection'), source.indexOf('// ========== 查看道化之身'));
  const applyIndex = settlement.indexOf('endNode.reward?.影');
  const rateIndex = settlement.indexOf('const baseRate');
  assert.ok(applyIndex >= 0 && applyIndex < rateIndex);
  assert.match(settlement, /applyProjectionEffect/);
});

test('频道账号统一使用映射后的玩家ID并迁移旧行动键', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  assert.match(source, /const rawPlayerId = String\(e\.user_id\)/);
  assert.match(source, /channel\(rawPlayerId\.replace\('qg_', ''\)\)/);
  assert.match(source, /migrateLegacyPlayerActionKey\(redis, playerId, rawPlayerId\)/);
  assert.match(source, /getProjectionActionKey\(playerId\)/);
  assert.doesNotMatch(source, /`xiuxian:player:\$\{e\.user_id\}:action`/);
  assert.match(source, /playerId,\s*\n\s*world: selectedWorld\.name/);
});

test('仙古不再拦截裸数字，数字选择交给诸天投影', async () => {
  const source = await readFile(new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url), 'utf8');
  // 旧的 1/2/3 选项机制已移除（选项从不写入 redis，处理器永远命中不到），
  // 裸数字不再被仙古拦截，直接由诸天投影等插件处理。
  assert.doesNotMatch(source, /reg: '\^\[123\]\$'/);
  assert.doesNotMatch(source, /XianguExploreChoice/);
  assert.doesNotMatch(source, /xianguOptions/);
});

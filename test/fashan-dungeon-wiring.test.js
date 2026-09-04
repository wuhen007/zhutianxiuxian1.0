import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { withSecretPlaceSettlementLock } from '../model/secretPlaceAddiction.js';

test('法身探索与沉迷使用独立动作键并接入普通和上苍结算器', () => {
  const entry = fs.readFileSync('apps/SecretPlace/SecretPlaceplus.js', 'utf8');
  const normalTask = fs.readFileSync('apps/SecretPlace/SecretPlaceplusTask.js', 'utf8');
  const shangcangTask = fs.readFileSync('apps/SecretPlace/ShangcangTask.js', 'utf8');
  const legacyEntry = fs.readFileSync('apps/SecretPlace/SecretPlace.js', 'utf8');
  const legacyTask = fs.readFileSync('apps/SecretPlace/SecretPlaceTask.js', 'utf8');

  assert.match(entry, /#法身探索/);
  assert.match(entry, /#法身沉迷/);
  assert.match(entry, /requireActorAtPlane\(player, expectedPlane, 'fashan'\)/);
  assert.match(entry, /canImmortalEmperorFreeTravel\(player, currentLocation, targetLocation\)/);
  assert.match(entry, /getLocationThreshold\(player, location\)/);
  assert.match(entry, /if \(!threshold\.ok && !emperorFreeTravel\)/);
  assert.match(normalTask, /settleFashanProxies/);
  assert.match(normalTask, /getFashanActionKey\(playerId\)/);
  assert.match(normalTask, /withSecretPlaceSettlementLock\(player_id,[\s\S]*?\}, options\);/);
  assert.match(normalTask, /actionKey: proxyActionKey,[\s\S]*?historyKey: proxyHistoryKey/);
  assert.match(normalTask, /const Write_player = proxyActor/);
  assert.match(normalTask, /if \(key === '当前血量' \|\| key === '法身当前血量'\) continue/);
  assert.match(normalTask, /FASHAN_ADDITIVE_PLAYER_FIELDS/);
  assert.match(normalTask, /mergedPlayer\[key\] = current \+ after - before/);
  assert.match(normalTask, /if \(options\.taskId && !\(await ownsAction\(\)\)\) return false/);
  assert.match(normalTask, /mergedPlayer\.法身当前血量 = actorState\.currentHp/);
  assert.match(normalTask, /actorCurrentHp: actorState\.currentHp/);
  assert.match(normalTask, /actorState,[\s\S]{0,80}taskId,/);
  assert.match(normalTask, /if \(options\.taskId && action\?\.taskId !== options\.taskId\) return false/);
  assert.match(normalTask, /withPlayerMutationLock\(playerId, async \(\) =>/);
  assert.match(normalTask, /const settlementPlane = getLocationId\(options\.actorPlane/);
  assert.match(normalTask, /preferredPlane: seekingMultipliers\.realmEvent > 1 \? getLocationName\(settlementPlane\) : null/);
  assert.match(normalTask, /await Write_player\(player_id, player\);\s*await Add_血气\(player_id, qixue\);\s*await Add_修为\(player_id, xiuwei\)/);
  assert.match(normalTask, /active \? null : \{ EX: FASHAN_TASK_RETENTION_SECONDS \}/);
  assert.match(normalTask, /redis\.expire\(proxyHistoryKey, FASHAN_TASK_RETENTION_SECONDS\)/);
  assert.doesNotMatch(normalTask, /await Write_player\(playerId, player\);[\s\S]{0,300}playerHpMounted/);
  assert.doesNotMatch(normalTask, /const bodyActionKey/);
  assert.match(shangcangTask, /\['body', 'fashan'\]/);
  assert.match(legacyTask, /!isShangcangAction\(parsedAction\)/);
  assert.match(legacyEntry, /hasPendingFashanAction/);
  assert.match(entry, /const entryCount = mode === 'explore' \? 0 : count/);
  assert.match(entry, /await redis\.set\(actionKey, JSON\.stringify\(action\)\);/);
  assert.match(entry, /await redis\.set\(getFashanHistoryKey\(userId\), JSON\.stringify\(\{/);
  assert.doesNotMatch(legacyEntry, /allowEternalGuard: allowFashan/);
});

test('法身直连结算已持有外层锁时可跳过重复 Redis 加锁', async () => {
  let ran = false;
  const result = await withSecretPlaceSettlementLock('fashan-test', async () => {
    ran = true;
    return 42;
  }, {
    skipRedisLock: true,
    redisClient: { set: async () => { throw new Error('unexpected redis lock'); } },
  });
  assert.equal(ran, true);
  assert.equal(result, 42);
});

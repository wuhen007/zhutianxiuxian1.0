import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import * as vm from 'node:vm';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url),
  'utf8',
);

function methodBody(name) {
  const start = source.indexOf(`async ${name}(e)`);
  assert.notEqual(start, -1, `${name} should remain registered`);
  const next = source.indexOf('\n  async ', start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

function sourceBetween(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `${startMarker} should remain in production source`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `${endMarker} should remain after ${startMarker}`);
  return source.slice(start, end);
}

/**
 * Evaluate the production lock functions against a deterministic in-memory
 * Redis. This keeps the test independent of the bot bootstrap while still
 * executing the exact lease/ALS/release implementation from xianguPlace.js.
 */
function createProductionLockHarness() {
  const releaseScript = source.match(
    /const XIANGU_RELEASE_LOCK_SCRIPT = `[^`]*`;/s,
  )?.[0];
  const renewScript = source.match(
    /const XIANGU_RENEW_LOCK_SCRIPT = `[^`]*`;/s,
  )?.[0];
  const actionConstants = source.match(
    /const XIANGU_ACTION_LOCK_TTL_SECONDS = [\s\S]*?const XIANGU_ACTION_BUSY = Symbol\('xiangu-action-busy'\);/,
  )?.[0];
  assert.ok(releaseScript && renewScript && actionConstants);

  const releaseFn = sourceBetween(
    'async function releaseXianguEvacuationLock',
    'async function acquireXianguPlayerLocks',
  );
  const acquireFn = sourceBetween(
    'async function acquireXianguActionLease',
    'async function withXianguActionLock',
  );
  const withFn = sourceBetween(
    'async function withXianguActionLock',
    'function xianguNpcWorldTickKey',
  );

  const values = new Map();
  const redis = {
    async set(key, value, options = {}) {
      if (options.NX && values.has(key)) return null;
      values.set(key, String(value));
      return 'OK';
    },
    async get(key) {
      return values.get(key) ?? null;
    },
    async eval(script, { keys, arguments: args }) {
      const key = keys[0];
      if (values.get(key) !== args[0]) return 0;
      if (script.includes('expire')) return 1;
      if (script.includes('del')) {
        values.delete(key);
        return 1;
      }
      return 0;
    },
  };

  const code = `
    ${releaseScript}
    ${renewScript}
    ${actionConstants}
    function xianguEvacuationLockKey(playerId) {
      return 'lock:' + playerId;
    }
    ${releaseFn}
    ${acquireFn}
    function getXianguActionContext(playerId) {
      const context = xianguActionStorage.getStore();
      if (!context || String(context.playerId) !== String(playerId)) return null;
      return context;
    }
    ${withFn}
    ({ withXianguActionLock, acquireXianguActionLease, XIANGU_ACTION_BUSY });
  `;
  const context = vm.createContext({
    AsyncLocalStorage,
    redis,
    console,
    Date,
    Math,
    setInterval,
    clearInterval,
  });
  const api = vm.runInContext(code, context);
  return { ...api, redis, values };
}

test('PvP locks both action and battle keys in deterministic order', () => {
  assert.match(source, /xianguPlayerRedisKey\(id, 'xiangu_evacuation_lock'\)/);
  assert.match(source, /xianguPlayerRedisKey\(id, 'xiangu_pvp_lock'\)/);
  assert.match(source, /const keys = ids[\s\S]*?\.sort\(\);/);
  assert.match(source, /prepareXianguAction\(player_qq, \{ lockHeld: true \}\)/g);
  assert.match(source, /prepareXianguAction\(targetId, \{ lockHeld: true \}\)/g);
  assert.match(source, /releaseXianguPlayerLocks\(pvpLock\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*?acquired\.map\(lockKey => releaseXianguEvacuationLock\(lockKey, token\)\)/);
});

test('持锁写入携带令牌，旧快照会在战斗期间被拒绝', () => {
  assert.match(source, /Write_player as writePlayerRecord/);
  assert.match(source, /const holder = typeof redis\?\.get === 'function' \? await redis\.get\(lockKey\) : null;/);
  assert.match(source, /if \(\(owner && holder !== owner\) \|\| \(!owner && holder\)\)/);
  assert.match(source, /return writePlayerRecord\(playerId, player, writeOptions\);/);
  assert.ok(
    (source.match(/xianguLockToken: pvpLock\.token/g) || []).length >= 8,
    'both PvP participants must use the battle token for every outcome',
  );
  assert.match(source, /await Write_player\(playerId, player, \{ xianguLockToken: lockToken \}\)/);
  assert.match(source, /await Write_player\(targetId, storedPlayer, \{ xianguLockToken: lockToken \}\)/);
});

test('动作锁实际串行化，并在异常与令牌变化后安全释放', async () => {
  const harness = createProductionLockHarness();
  let entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  let releaseGate;
  const gate = new Promise(resolve => { releaseGate = resolve; });

  const first = harness.withXianguActionLock('42', async () => {
    entered();
    await gate;
    return 'first';
  });
  await enteredPromise;

  const second = await harness.withXianguActionLock('42', async () => 'second');
  assert.equal(second, harness.XIANGU_ACTION_BUSY, '并发动作必须被拒绝');

  releaseGate();
  assert.equal(await first, 'first');
  assert.equal(
    await harness.withXianguActionLock('42', async () => 'after-release'),
    'after-release',
    '动作完成后应能重新取得锁',
  );

  await assert.rejects(
    harness.withXianguActionLock('43', async () => {
      throw new Error('action failed');
    }),
    /action failed/,
  );
  assert.equal(
    await harness.withXianguActionLock('43', async () => 'after-error'),
    'after-error',
    '异常路径也必须 finally 释放动作锁',
  );

  const lease = await harness.acquireXianguActionLease('44');
  harness.values.set('lock:44', 'new-owner');
  await lease.release();
  assert.equal(
    await harness.redis.get('lock:44'),
    'new-owner',
    'compare-delete 不得删除后续所有者的锁',
  );
  harness.values.delete('lock:44');
});

test('mutation 根入口安装全程动作锁包装', () => {
  assert.match(source, /installXianguActionWrappers\(this\);/);
  for (const method of [
    'Goxiangu',
    'XianguExplore',
    'XianguExploreChoice',
    'XianguRealmMove',
    'XianguMove',
    'XianguDivineScan',
    'XianguJieZhuDaoZhong',
    'XianguIgniteShenhuo',
    'XianguFuYongDanYao',
    'XianguJilianZhenwo',
    'XianguNPCTalk',
    'XianguNPCBuy',
    'XianguNPCAttack',
    'XianguOfferSeed',
    'XianguSoulSearchNPC',
    'XianguNPCTeam',
    'XianguNPCTeamLeave',
    'XianguFactionQuest',
  ]) {
    assert.match(source, new RegExp(`'${method}'`));
  }
  assert.match(source, /finally \{[\s\S]*?await lease\.release\(\);/);
});

test('后台 NPC tick 在动作锁存在时跳过，并在写入前重新持锁', () => {
  assert.match(source, /if \(await redis\.get\(xianguEvacuationLockKey\(playerId\)\)\) continue;/);
  assert.match(source, /await updateXianguPlayerUnderLock\(playerId, async lockedPlayer =>/);
  assert.match(source, /await processNPCBehavior\(lockedPlayer, playerId, \{ allowCombat: false \}\)/);
});

test('状态、目标和 NPC 查询不会用旧快照写回玩家', () => {
  assert.doesNotMatch(methodBody('XianguStatus'), /Write_player\(/);
  assert.doesNotMatch(methodBody('XianguGoal'), /Write_player\(/);
  assert.match(methodBody('XianguFindNPC'), /const initialized = await updateXianguPlayerUnderLock\(player_qq/);
  assert.doesNotMatch(methodBody('XianguFindNPC'), /needsMapInitialization\) await Write_player/);
  assert.match(methodBody('XianguMap'), /prepareXianguAction\(player_qq\)/);
});

test('结算保存拒绝时不会把未落盘收据误标为已应用', () => {
  assert.match(
    source,
    /const saved = await Write_player\(targetId, storedPlayer\);[\s\S]*?if \(saved === false\)[\s\S]*?待重试/,
  );
  assert.match(
    source,
    /const saved = await Write_player\(targetId, storedPlayer, \{ xianguLockToken: lockToken \}\);[\s\S]*?if \(saved === false\)[\s\S]*?待重试/,
  );
});

test('收据恢复同时应用背包与附加玩家状态', () => {
  assert.match(
    source,
    /recoverXianguSettlementReceipts\([\s\S]*?receipt\.kind === 'marrow-pool'[\s\S]*?applyXianguMarrowPoolReceiptPayload\([\s\S]*?bag: applyXianguBagSettlementPayload\([\s\S]*?state: applyXianguPlayerStatePayload\(/,
  );
  assert.match(source, /kinds: \[[^\]]*'marrow-pool'[^\]]*\]/);
});

test('待结算共享奖励在恢复前重新确认占位', () => {
  assert.match(
    source,
    /recoverXianguSettlementReceipts\([\s\S]*?claim: async \(storedPlayer, receipt\)[\s\S]*?claimXianguNpcDeathForPlayer\([\s\S]*?claimXianguRewardForPlayer\(/,
  );
  assert.match(source, /source\.worldUnique !== true[\s\S]*?claimXianguMarrowPoolWorldSlot\(/);
  assert.match(
    source,
    /\['npc-kill-loot', 'npc-ecology-loot'\]\.includes\(kind\) \? 'npc-kill-loot' : kind/,
  );
  assert.doesNotMatch(source, /status: 'claim-fallback'/);
});

test('撤离前持锁恢复仙髓池等待结算收据', () => {
  const body = methodBody('ConfirmLeaveXiangu');
  assert.match(
    body,
    /recoverXianguClaimBagRewards\(latestPlayer, player_qq, \{[\s\S]*?xianguLockToken: lockToken[\s\S]*?throwOnError: true/,
  );
  assert.match(body, /const unsettledReward = recoveredRewards\.find/);
  assert.match(source, /payload: \{\s*invitedBy: String\(pool\?\.invitedBy \|\| ''\)/);
});

test('确认撤离使用完整动作租约覆盖恢复与最终结算', () => {
  assert.match(
    methodBody('ConfirmLeaveXiangu'),
    /redis\.set\(lockKey, lockToken, \{\s*EX: XIANGU_ACTION_LOCK_TTL_SECONDS,\s*NX: true,\s*\}\)/,
  );
});

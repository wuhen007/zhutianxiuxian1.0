import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  beginDarkSuppression,
  clearDarkSuppressionPlayerState,
  completeDarkSuppressionCreation,
  DARK_SUPPRESSION_ACTIVE,
  DARK_SUPPRESSION_CREATING,
  deleteDarkSuppressionAction,
  hasDarkSuppressionPlayerState,
  hasDarkSuppressionState,
} from '../model/darkSuppression.js';

const source = fs.readFileSync(new URL('../apps/SecretPlace/zhenya.js', import.meta.url), 'utf8');
const timeRiverSource = fs.readFileSync(new URL('../apps/SecretPlace/shijianchangheTask.js', import.meta.url), 'utf8');
const cancelStart = source.indexOf('  async cancelSuppression(playerId)');
const cancelEnd = source.indexOf('\n  async checkSuppressedPlayers()', cancelStart);
const cancelSource = source.slice(cancelStart, cancelEnd);
const recoveryStart = source.indexOf('  async applySuppressionCreationRecovery(playerId, state');
const recoveryEnd = source.indexOf('\n  async resumeSuppressionCreation(', recoveryStart);
const recoverySource = source.slice(recoveryStart, recoveryEnd);
const resumeStart = source.indexOf('  async resumeSuppressionCreation(playerId, state)');
const resumeEnd = source.indexOf('\n  async checkSuppressedPlayers()', resumeStart);
const resumeSource = source.slice(resumeStart, resumeEnd);
const checkStart = source.indexOf('  async checkSuppressedPlayers()');
const checkEnd = source.indexOf('\n  async sendSuppressionReminder(', checkStart);
const checkSource = source.slice(checkStart, checkEnd);
const releaseStart = source.indexOf('  async releaseSuppression(playerId)');
const releaseEnd = source.indexOf('\n  async cleanupSuppression(', releaseStart);
const releaseSource = source.slice(releaseStart, releaseEnd);
const cleanupSource = source.slice(releaseEnd);
const suppressionStart = timeRiverSource.indexOf('async handleDarkSuppression(');
const suppressionEnd = timeRiverSource.indexOf('\n  // 生成遭遇文案', suppressionStart);
const suppressionSource = timeRiverSource.slice(suppressionStart, suppressionEnd);

test('管理员可按@或QQ解除黑暗炼化且不触发跌境惩罚', () => {
  assert.match(source, /reg: '\^#解除炼化\.\*\$'/);
  assert.match(source, /getTargetQQFromEvent\(e\)/);
  assert.match(source, /e\.isMaster.*masters\.includes\(adminQQ\)/);
  assert.match(cancelSource, /withPlayerMutationLock/);
  assert.ok(cancelSource.indexOf('DARK_SUPPRESSION_CREATING') < cancelSource.indexOf('markDarkSuppressionCreationCancelling'));
  assert.ok(cancelSource.indexOf('markDarkSuppressionCreationCancelling') < cancelSource.indexOf('cancelCreatingSuppression'));
  assert.ok(cancelSource.indexOf('await markDarkSuppressionCancelling') < cancelSource.indexOf('clearDarkSuppressionPlayerState'));
  assert.match(cancelSource, /clearDarkSuppressionPlayerState\(player\)/);
  assert.doesNotMatch(cancelSource, /lowerRealmAuthority/);
});

test('解除炼化只删除对应行动并清理完整状态键', () => {
  assert.match(source, /deleteDarkSuppressionAction/);
  assert.match(source, /xiuxian:dark_suppression:/);
  assert.match(source, /:suppression_end/);
  assert.match(source, /:suppression_data/);
  assert.match(source, /xiuxian:time_river:end_time:/);
  assert.match(timeRiverSource, /handleDarkSuppression[\s\S]{0,160}withPlayerMutationLock/);
  assert.match(source, /Number\.isFinite\(parsedEndTime\)/);
  assert.match(checkSource, /withPlayerMutationLock\(playerId, \(\) => this\.checkSuppressedPlayer\(playerId, now\)\)/);
  assert.ok(checkSource.indexOf('DARK_SUPPRESSION_CANCELLING_CREATION') < checkSource.indexOf('DARK_SUPPRESSION_CREATING'));
  assert.match(checkSource, /state\.marker === DARK_SUPPRESSION_CREATING[\s\S]{0,120}resumeSuppressionCreation/);
  assert.match(checkSource, /if \(!hasDarkSuppressionPlayerState\(player\)\)[\s\S]{0,120}cleanupSuppression/);
  assert.doesNotMatch(releaseSource, /finally/);
  assert.ok(releaseSource.indexOf('await Write_player') < releaseSource.lastIndexOf('await this.cleanupSuppression'));
  assert.ok(cleanupSource.indexOf('deleteDarkSuppressionAction') < cleanupSource.indexOf('xiuxian:dark_suppression:'));
  assert.ok(suppressionSource.indexOf('await beginDarkSuppression') < suppressionSource.indexOf('await Write_equipment'));
  assert.ok(suppressionSource.indexOf('await beginDarkSuppression') < suppressionSource.indexOf('await Write_player'));
  assert.ok(suppressionSource.indexOf('await Write_equipment') < suppressionSource.indexOf('const latestPlayer = await Read_player'));
  assert.ok(suppressionSource.indexOf('const latestPlayer = await Read_player') < suppressionSource.indexOf('await Write_player'));
  assert.ok(suppressionSource.indexOf('await Write_player') < suppressionSource.indexOf('await completeDarkSuppressionCreation'));
  assert.match(recoverySource, /Write_equipment[\s\S]*Read_player[\s\S]*Object\.assign[\s\S]*Write_player/);
  assert.match(resumeSource, /applySuppressionCreationRecovery[\s\S]*completeDarkSuppressionCreation/);
  assert.match(resumeSource, /applySuppressionCreationRecovery\(playerId, state, true\)[\s\S]*cleanupSuppression/);
});

test('玩家炼化字段可清理，其他道果状态保持不变', () => {
  const suppressed = { 道果状态: '道崩·炼化中', 时间长河道崩: { source: '苍帝' } };
  assert.equal(hasDarkSuppressionPlayerState(suppressed), true);
  assert.equal(hasDarkSuppressionState(suppressed), true);
  assert.equal(clearDarkSuppressionPlayerState(suppressed), true);
  assert.deepEqual(suppressed, {});

  const unrelated = { 道果状态: '神胎圆满·道源唯一' };
  assert.equal(clearDarkSuppressionPlayerState(unrelated), false);
  assert.deepEqual(unrelated, { 道果状态: '神胎圆满·道源唯一' });
});

test('炼化Redis状态在不可逆玩家写入前一次原子建立', async () => {
  const invocations = [];
  const redis = {
    async eval(script, options) {
      invocations.push({ script, ...options });
      return 1;
    },
  };
  const playerPatch = { 道果状态: '道崩·炼化中' };
  const equipment = { 至宝: { name: '' } };

  await beginDarkSuppression(redis, '10001', {
    startedAt: 100,
    endTime: 200,
    groupId: 300,
    originalLevel: 21,
    recoveryPlayerPatch: playerPatch,
    recoveryEquipment: equipment,
  });

  const invocation = invocations[0];
  assert.deepEqual(invocation.keys, [
    'xiuxian:dark_suppression:10001',
    'xiuxian:player:10001:suppression_end',
    'xiuxian:player:10001:suppression_data',
    'xiuxian:player:10001:action',
  ]);
  assert.equal(invocation.arguments[0], DARK_SUPPRESSION_CREATING);
  assert.equal(invocation.arguments[1], '200');
  assert.deepEqual(JSON.parse(invocation.arguments[2]), {
    group_id: 300,
    original_level: 21,
    recovery: { player_patch: playerPatch, equipment },
  });
  assert.deepEqual(JSON.parse(invocation.arguments[3]), {
    action: '被镇压炼化元神',
    start_time: 100,
    end_time: 200,
    group_id: 300,
  });
  assert.match(invocation.script, /SET[\s\S]*KEYS\[1\][\s\S]*SET[\s\S]*KEYS\[4\]/);

  await completeDarkSuppressionCreation(redis, '10001', {
    groupId: 300,
    originalLevel: 21,
  });
  assert.deepEqual(invocations[1].arguments.slice(0, 2), [
    DARK_SUPPRESSION_CREATING,
    DARK_SUPPRESSION_ACTIVE,
  ]);
  assert.deepEqual(JSON.parse(invocations[1].arguments[2]), {
    group_id: 300,
    original_level: 21,
  });
});

test('并发写入新行动后不会被旧炼化快照误删', async () => {
  const key = 'xiuxian:player:10001:action';
  const oldAction = JSON.stringify({ action: '被镇压炼化元神', start_time: 1 });
  const values = new Map([[key, oldAction]]);
  let firstEval = true;
  const redis = {
    async get(target) { return values.get(target) || null; },
    async eval(_script, { keys, arguments: args }) {
      if (firstEval) {
        firstEval = false;
        values.set(key, JSON.stringify({ action: '闭关', start_time: 2 }));
      }
      if (values.get(keys[0]) !== args[0]) return 0;
      values.delete(keys[0]);
      return 1;
    },
  };

  assert.equal(await deleteDarkSuppressionAction(redis, key, oldAction), false);
  assert.equal(JSON.parse(values.get(key)).action, '闭关');
});

test('炼化行动仍是当前值时以CAS原子删除', async () => {
  const key = 'xiuxian:player:10001:action';
  const action = JSON.stringify({ action: '被镇压炼化元神', start_time: 1 });
  const values = new Map([[key, action]]);
  const redis = {
    async get(target) { return values.get(target) || null; },
    async eval(_script, { keys, arguments: args }) {
      if (values.get(keys[0]) !== args[0]) return 0;
      values.delete(keys[0]);
      return 1;
    },
  };

  assert.equal(await deleteDarkSuppressionAction(redis, key, action), true);
  assert.equal(values.has(key), false);
});

test('炼化行动持续并发变化时保留重试信号', async () => {
  const key = 'xiuxian:player:10001:action';
  let version = 1;
  const redis = {
    async get() {
      return JSON.stringify({ action: '被镇压炼化元神', start_time: version++ });
    },
    async eval() { return 0; },
  };

  await assert.rejects(
    deleteDarkSuppressionAction(redis, key),
    /changed during cleanup/
  );
});

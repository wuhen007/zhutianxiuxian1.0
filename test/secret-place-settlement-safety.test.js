import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('普通与沉迷结算入口统一持有玩家结算锁', () => {
  const manual = read('../apps/User/UserSellAll.js');
  const regularTask = read('../apps/SecretPlace/SecretPlaceTask.js');
  const addictionTask = read('../apps/SecretPlace/SecretPlaceplusTask.js');

  assert.match(manual, /withSecretPlaceSettlementLock\(player_id/);
  assert.match(regularTask, /withSecretPlaceSettlementLock\(player_id/);
  assert.match(addictionTask, /withSecretPlaceSettlementLock\(player_id/);
});

test('手动结算委托给定时任务的同一实现', () => {
  const manual = read('../apps/User/UserSellAll.js');
  assert.match(manual, /async regression\(e\)[\s\S]*?new SecretPlaceTask\(\)\.Secretplacetask\(playerId\)/);
  assert.match(manual, /async regression\(e\)[\s\S]*?new SecretPlaceplusTask\(\)/);
});

test('秘境结算不再包含账号时间或资源特判', () => {
  const source = [
    read('../apps/User/UserSellAll.js'),
    read('../apps/SecretPlace/SecretPlace.js'),
  ].join('\n');
  assert.doesNotMatch(source, /4909071520328015562/);
});

test('沉迷结算增量奖励之后不再写回旧玩家快照', () => {
  const timed = read('../apps/SecretPlace/SecretPlaceplusTask.js');
  const manual = read('../apps/User/UserSellAll.js');

  assert.doesNotMatch(
    timed,
    /await Add_血气\(player_id, qixue\);\s*await Add_修为\(player_id, xiuwei\);\s*await Write_player\(player_id, player\)/,
  );
  assert.match(
    timed,
    /await Write_player\(player_id, player\);\s*await Add_血气\(player_id, qixue\);\s*await Add_修为\(player_id, xiuwei\);/,
  );
  assert.match(
    manual,
    /await Add_修为\(player_id, xiuwei\);\s*player = await Read_player\(player_id\);/,
  );
});

test('柳神赏识奖励随玩家快照一起保存', () => {
  const source = [
    read('../apps/SecretPlace/SecretPlaceTask.js'),
    read('../apps/SecretPlace/SecretPlaceplusTask.js'),
    read('../apps/User/UserSellAll.js'),
  ].join('\n');
  assert.doesNotMatch(source, /await Add_修为\(usr_qq, rewardExp\)/);
  assert.match(source, /player\.修为 = \(Number\(player\.修为\) \|\| 0\) \+ rewardExp/);
});

test('普通结算的特殊奖励历史函数来自公共模块', () => {
  const manual = read('../apps/User/UserSellAll.js');
  const task = read('../apps/SecretPlace/SecretPlaceTask.js');
  assert.doesNotMatch(manual, /\brecordItemToHistory\s*\(/);
  assert.doesNotMatch(task, /\brecordItemToHistory\s*\(/);
  assert.match(manual, /recordSecretPlaceItemToHistory\(redis,/);
  assert.match(task, /recordSecretPlaceItemToHistory\(redis,/);
});

test('单张结算卡使用映射后的玩家账号加锁和读写行动', () => {
  const home = read('../apps/User/UserHome.js');
  assert.match(
    home,
    /if \(thing_exist\.type === "秘境结算"\) \{\s*const player_id = String\(usr_qq\);/,
  );
});

test('定时结算逐玩家隔离异常且通知统一走安全发送', () => {
  for (const path of [
    '../apps/SecretPlace/SecretPlaceTask.js',
    '../apps/SecretPlace/SecretPlaceplusTask.js',
  ]) {
    const source = read(path);
    assert.match(source, /try \{\s*result = await withSecretPlaceSettlementLock\(player_id/);
    assert.match(source, /catch \(error\) \{[\s\S]*?continue;/);
    assert.match(source, /sendSecretPlaceNotification\(action, player_id, msg\)/);
  }
});

test('普通秘境开始计算奖励前不再发送结束通知', () => {
  const source = read('../apps/SecretPlace/SecretPlaceTask.js');
  const settlementStart = source.indexOf("if (action.Place_action == '0')");
  const rewardStart = source.indexOf('let weizhi = action.Place_address', settlementStart);
  assert.ok(settlementStart >= 0 && rewardStart > settlementStart);
  assert.doesNotMatch(source.slice(settlementStart, rewardStart), /sendSecretPlaceNotification|sendMsg/);
});

test('秘境入口持久化会话路由而非直接保存伪群号', () => {
  for (const path of [
    '../apps/SecretPlace/SecretPlace.js',
    '../apps/SecretPlace/SecretPlaceplus.js',
  ]) {
    const source = read(path);
    assert.match(source, /applySecretPlaceNotificationContext\(arr, e, usr_qq\)/);
    assert.doesNotMatch(source, /arr\.group_id = e\.group_id/);
  }
});

test('天资奇遇分支不会提前退出整个玩家结算', () => {
  for (const path of [
    '../apps/SecretPlace/SecretPlaceTask.js',
    '../apps/SecretPlace/SecretPlaceplusTask.js',
  ]) {
    const source = read(path);
    const start = source.indexOf('aptitudeEncounter:');
    const end = source.indexOf("if (random > 0.1 && random < 0.1002)", start);
    assert.ok(start >= 0 && end > start);
    assert.doesNotMatch(source.slice(start, end), /\breturn\s*;/);
    assert.match(source.slice(start, end), /break aptitudeEncounter;/);
  }
});

test('秘境汇总通知失败时保留原始条目等待重试', () => {
  const source = read('../apps/SecretPlace/msgTask.js');
  assert.match(source, /const failedEntries = \[\]/);
  assert.match(source, /if \(!sent\) failedEntries\.push\(\.\.\.batch\.entries\)/);
  assert.match(source, /await Write_temp\(failedEntries\)/);
});

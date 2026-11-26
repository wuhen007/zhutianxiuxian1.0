import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const commandSource = fs.readFileSync(
  new URL('../apps/User/UserSellAll.js', import.meta.url),
  'utf8'
);
const modelSource = fs.readFileSync(
  new URL('../model/xiuxian.js', import.meta.url),
  'utf8'
);
const adminSource = fs.readFileSync(
  new URL('../apps/AdminSuper/AdminSuper.js', import.meta.url),
  'utf8'
);
const associationSyncSource = modelSource.slice(
  modelSource.indexOf('export async function Synchronization_ASS'),
  modelSource.indexOf('export async function synchronization')
);
const playerSyncSource = modelSource.slice(
  modelSource.indexOf('export async function synchronization'),
  modelSource.indexOf('export async function channel')
);

test('一键同步保留唯一入口并使用带时效的互斥锁', () => {
  assert.match(commandSource, /reg: '\^#一键同步\$'/);
  assert.match(commandSource, /fnc: 'all_tongbu'/);
  assert.match(commandSource, /archive-sync/);
  assert.match(commandSource, /EX: 3600, NX: true/);
  assert.match(commandSource, /redis\.get\(lockKey\) === lockToken/);
  assert.doesNotMatch(adminSource, /#一键同步/);
});

test('玩家同步逐档隔离并通过事务回滚四类存档', () => {
  assert.match(playerSyncSource, /withPlayerMutationLock\(usr_qq/);
  for (const pathName of ['player_path', 'najie_path', 'equipment_path', 'danyao_path']) {
    assert.match(playerSyncSource, new RegExp(`transaction\\.capture\\(path\\.join\\(__PATH\\.${pathName}`));
  }
  assert.match(playerSyncSource, /transaction\.commit\(\)/);
  assert.match(playerSyncSource, /transaction\.rollback\(\)/);
  assert.match(playerSyncSource, /result\.failed\+\+/);
  assert.match(playerSyncSource, /result\.errors\.push/);
  assert.match(playerSyncSource, /return result/);
});

test('玩家同步覆盖当前命格、心神、仙道潜力和额外修炼字段', () => {
  for (const field of [
    'huafenlevel_id',
    '仙道潜力',
    '命格词条上限',
    '附加命格',
    '心神',
    '心神额外上限',
    '道心',
    '学习的功法',
    '记忆坐标',
    '传送阵坐标',
  ]) {
    assert.match(playerSyncSource, new RegExp(field));
  }
  for (const category of [
    '装备', '丹药', '道具', '功法', '草药', '食材',
    '盒子', '材料', '仙宠', '仙宠口粮', '宝石',
  ]) {
    assert.match(playerSyncSource, new RegExp(`'${category}'`));
  }
});

test('宗门同步按宗门统计失败并继续处理', () => {
  assert.match(associationSyncSource, /宗门存档结构无效/);
  assert.match(associationSyncSource, /宗主存档或境界无效/);
  assert.match(associationSyncSource, /result\.succeeded\+\+/);
  assert.match(associationSyncSource, /宗门.*同步失败/);
  assert.match(commandSource, /宗门数据：成功/);
});

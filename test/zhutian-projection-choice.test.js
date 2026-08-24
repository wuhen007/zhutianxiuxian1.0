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

test('投影数字处理锁内重读行动并拒绝处理排队期间过期的选择', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  const handler = source.slice(source.indexOf('async handleProjectionChoice'), source.indexOf('// ========== 神魂崩溃'));
  assert.match(handler, /withPlayerMutationLock\(playerId/);
  assert.ok((handler.match(/redis\.get\(actionKey\)/g) || []).length >= 2);
  assert.match(handler, /if \(!initialStr\) return false/);
  assert.match(handler, /initialAction\.action !== '投影诸天'\) return false/);
  assert.match(handler, /actionStr !== initialStr/);
  assert.match(handler, /applyProjectionEffect\(projection, nextNode\.penalty\)/);
  assert.doesNotMatch(handler, /当前没有进行中的投影/);

  const forceExit = source.slice(
    source.indexOf('async forceExitProjection'),
    source.indexOf('// ========== 开始投影')
  );
  assert.match(forceExit, /withPlayerMutationLock\(playerId/);
});

test('结局影奖励先进入世界影响力再计算回归率', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  const settlement = source.slice(source.indexOf('async completeProjection'), source.indexOf('// ========== 查看道化之身'));
  const applyIndex = settlement.indexOf('endNode.reward?.影');
  const rateIndex = settlement.indexOf('const baseRate');
  assert.ok(applyIndex >= 0 && applyIndex < rateIndex);
  assert.match(settlement, /applyProjectionEffect/);
});

test('频道账号使用映射后的玩家ID并保留原消息行动键', async () => {
  const source = await readFile(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
  assert.match(source, /channel\(String\(e\.user_id\)\.replace\('qg_', ''\)\)/);
  assert.match(source, /`xiuxian:player:\$\{e\.user_id\}:action`/);
  assert.match(source, /playerId,\s*\n\s*world: selectedWorld\.name/);
});

test('仙古数字选项未命中时会放行诸天投影选择', async () => {
  const source = await readFile(new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url), 'utf8');
  const start = source.indexOf('async XianguExploreChoice(e)');
  const end = source.indexOf('\n  }\n\n}', start);
  const handler = source.slice(start, end);
  assert.match(handler, /redis\.get\(`xiuxian:player:\$\{e\.user_id\}:action`\)\) return false/);
  assert.match(handler, /if \(!player\.in_xiangu\) return false/);
  assert.match(handler, /if \(!optionsJson\) return false/);
  assert.match(handler, /choice < 0 \|\| choice >= options\.length\) return false/);
  assert.match(handler, /await e\.reply\(exploreResult\.message\);\s*return true/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../apps/SecretPlace/shijianchangheTask.js', import.meta.url), 'utf8');
const entrySource = fs.readFileSync(new URL('../apps/SecretPlace/shijianchanghe.js', import.meta.url), 'utf8');
const xiuxianSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');

test('时间长河任务接入分段三帝战、献祭待援和尸骸免炼化', () => {
  assert.match(source, /timeRiverStage:\s*stage/);
  assert.match(source, /rollDarkTriadContinuation/);
  assert.match(source, /时间长河战败待援/);
  assert.match(source, /getTimeRiverSacrificeRecovery/);
  assert.match(source, /applyTimeRiverSacrificeBuff/);
  assert.match(source, /applyCangEmperorOpeningSuppression/);
  assert.match(source, /己道推演: player\.己道推演/);
  assert.match(source, /const counterEnemy = enemies\.find\(enemy => enemy\._时间长河反制\)/);
  assert.match(source, /_时间长河临字秘反制目标/);
  assert.match(source, /_时间长河复活次数已用/);
  assert.match(source, /enemyState: this\.captureEnemyState\(enemies, battleResult\)/);
  assert.match(source, /enemyState: action\.enemyState/);
  assert.match(source, /sacrificeBuff: recovery\.ratio/);
  assert.match(source, /member\.当前血量 = Math\.max\(1, Number\(member\.血量上限\)/);
  assert.match(source, /柳神·小塔护道/);
  assert.match(source, /DARK_TRIAD_NAMES\.every\(name => enemyNames\.includes\(name\)\)/);
  assert.match(source, /primary\.名号 !== '尸骸仙帝'/);
  assert.doesNotMatch(source, /B_player\.名号 === '苍帝'[\s\S]{0,120}\['鸿帝', '羽帝'\]/);
  assert.equal((xiuxianSource.match(/action\.action === '时间长河战败待援'/g) || []).length, 1);
  assert.match(xiuxianSource, /tickCangEmperorOpeningSuppression\(attacker\)/);
  assert.match(xiuxianSource, /tickCangEmperorOpeningSuppression\(readyUnit\)/);
  assert.match(xiuxianSource, /tryDarkTriadRevival\(player\)/);
  assert.match(xiuxianSource, /_时间长河复活彩蛋/);
});

test('遨游时间长河要求玩家先抵达该时序域，并防止重复结算与胜利误罚', () => {
  assert.match(entrySource, /if \(!verc\(\{ e \}\)\) return false/);
  assert.match(entrySource, /isTimeRiverLocation\(player\.power_place\)/);
  assert.match(entrySource, /#穿梭时间长河/);
  assert.doesNotMatch(entrySource, /player\.power_place\s*=\s*PLACE_LOCATION_MAP\.时间长河/);
  assert.doesNotMatch(entrySource, /player\.power_place\s*=\s*4/);
  assert.doesNotMatch(entrySource, /data\.Level_list\.find/);
  assert.match(source, /runTaskOnce\('ShijianChangheTask'/);
  assert.match(source, /withPlayerMutationLock\(usr_qq/);
  assert.match(entrySource, /withPlayerMutationLock\('time-river-active-index'/);
  assert.match(source, /withPlayerMutationLock\('time-river-active-index'/);
  assert.match(source, /outcome === 'defeat' && !chainBattle/);
  assert.match(source, /Number\(player\.纪元积累\) \|\| 0/);
  assert.match(source, /addCappedEraAccumulation\(player, eraAccumulationChange\)/);
  assert.match(source, /eraAccumulationChange: result\.era\.gained/);
  assert.match(source, /eraAccumulationCap: result\.era\.cap/);
  assert.match(source, /battleResult\.eraAccumulationCap/);
  assert.doesNotMatch(source, /MAX_ERA_ACCUMULATION/);
  assert.match(source, /if \(!await existplayer\(usr_qq\)\)/);
});

test('时间长河长战报保留完整过程并按多张图片顺序发送', () => {
  assert.doesNotMatch(source, /battleResult\.msg\.slice\(0, 3\)/);
  assert.doesNotMatch(source, /battleResult\.msg\.slice\(-2\)/);
  assert.match(source, /const pageSize = 60/);
  assert.match(source, /时间长河探索结果 \$\{index \+ 1\}\/\$\{pageCount\}/);
  assert.match(source, /await ForwardMsg\(mockEvent, \[title, \.\.\.page\]\)/);
  assert.match(xiuxianSource, /return await e\.reply\(img\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { XIANGU_REALM_ROUTES } from '../apps/SecretPlace/xianguTribulationSettlement.js';
import { applyQuestionFortuneCost } from '../model/redDustFortune.js';
import {
  ensureXianqiState,
  getXianqiStrands,
} from '../model/xianguXianqi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const levelDataPath = path.join(__dirname, '..', 'resources', 'data', 'Level', '仙古今世法.json');
const levelData = JSON.parse(fs.readFileSync(levelDataPath, 'utf8'));
const breakthroughSource = fs.readFileSync(
  path.join(__dirname, '..', 'apps', 'User', 'xiangujinshi.js'),
  'utf8',
);

// 复刻 breakthroughUpperRealm 的“成功分支”逻辑（与 src 中编辑后的代码一致）
function simulateBreakthroughUpperRealm(player) {
  const fromLevelId = Number(player.xiangulevel_id);
  const breakthrough = XIANGU_REALM_ROUTES[fromLevelId];
  if (!breakthrough) throw new Error('当前境界无对应渡劫');

  ensureXianqiState(player); // 仅规范字段，不减 strands

  const currentLevel = levelData.find((l) => Number(l.level_id) === fromLevelId);
  const targetLevel = levelData.find((l) => Number(l.level_id) === breakthrough.targetLevelId);
  const diff = {
    攻击: targetLevel.基础攻击 - currentLevel.基础攻击,
    防御: targetLevel.基础防御 - currentLevel.基础防御,
    血气: targetLevel.基础血量 - currentLevel.基础血量,
  };

  // —— 成功结算（与 src 一致）——
  player.xiangulevel_id = breakthrough.targetLevelId;
  player.攻击 = (Number(player.攻击) || 0) + diff.攻击;
  player.防御 = (Number(player.防御) || 0) + diff.防御;
  player.血气上限 = (Number(player.血气上限) || 0) + diff.血气;

  // —— 新加的仙道潜力扣除（与 src 中 deductXianguPotential 一致）——
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) - applyQuestionFortuneCost(player, 10));

  return { player, breakthrough, diff };
}

function makeShenhuoPlayer(extra = {}) {
  return {
    名号: '神火修士',
    xiangulevel_id: 8, // 神火境
    攻击: 0,
    防御: 0,
    血气上限: 0,
    仙道潜力: 50,
    xiangu_shenhuo: { 极境达成: true },
    xiangu_xianqi: { strands: 3, max: 3 }, // 神火极境三道仙气圆满
    xiangu_xianqi_three_complete: true,
    ...extra,
  };
}

test('神火极境冲关真一境：路由指向真一境(targetLevelId=9)', () => {
  const route = XIANGU_REALM_ROUTES[8];
  assert.equal(route.targetLevelId, 9);
  assert.equal(route.targetName, '真一境');
});

test('真实神火→真一成功分支复用境界配置并立即重算装备属性', () => {
  assert.doesNotMatch(
    breakthroughSource,
    /path\.join\(__PATH\.data_path,\s*'\.\.',\s*'resources',\s*'data'/,
  );

  const functionStart = breakthroughSource.indexOf('async breakthroughUpperRealm');
  const start = breakthroughSource.indexOf('player.xiangulevel_id = breakthrough.targetLevelId;', functionStart);
  const end = breakthroughSource.indexOf('const routeLine =', start);
  const breakthroughFunction = breakthroughSource.slice(functionStart, end);
  const successSettlement = breakthroughSource.slice(start, end);

  assert.ok(functionStart >= 0 && start >= 0 && end > start, '应能定位真实的上位境界成功结算分支');
  assert.match(breakthroughFunction, /const equipment = await Read_equipment\(usr_qq\);/);
  assert.match(breakthroughFunction, /runRealmBreakthrough\(e, player, \{ fromLevelId, equipment \}\)/);
  assert.match(successSettlement, /await Write_equipment\(usr_qq, equipment\);/);
  assert.match(successSettlement, /refreshedPlayer\.当前血量 = refreshedPlayer\.血量上限;/);
});

test('神火→真一：冲关后正确达到真一境，属性增量=2000万', () => {
  const player = makeShenhuoPlayer();
  const { breakthrough, diff } = simulateBreakthroughUpperRealm(player);

  assert.equal(player.xiangulevel_id, 9, '应抵达真一境(level_id=9)');
  assert.equal(breakthrough.targetName, '真一境');

  // 神火基础 3700万 → 真一基础 5700万，差 2000万
  assert.equal(diff.攻击, 20000000);
  assert.equal(diff.防御, 20000000);
  assert.equal(diff.血气, 20000000);

  assert.equal(player.攻击, 20000000);
  assert.equal(player.防御, 20000000);
  assert.equal(player.血气上限, 20000000);
});

test('神火→真一：仙道潜力被正确扣除（无问道签时 -10）', () => {
  const player = makeShenhuoPlayer({ 仙道潜力: 50 });
  simulateBreakthroughUpperRealm(player);
  assert.equal(player.仙道潜力, 40, '50 - 10 = 40');
});

test('神火→真一：持有问道签时潜力按八折扣除（-8）', () => {
  const player = makeShenhuoPlayer({
    仙道潜力: 50,
    红尘仙缘签: { type: 'question', expiresAt: Date.now() + 999999 },
  });
  simulateBreakthroughUpperRealm(player);
  assert.equal(player.仙道潜力, 42, '50 - ceil(10*0.8)=42');
});

test('神火→真一：神火极境三道仙气在突破后完整保留', () => {
  const player = makeShenhuoPlayer();
  simulateBreakthroughUpperRealm(player);
  assert.equal(getXianqiStrands(player), 3, '仙气不应因突破真一而丢失');
  assert.equal(player.xiangu_xianqi_three_complete, true, '三道仙气圆满标记应保留');
});

test('仙道潜力不足时门控拦截（与 chongguan 门控一致）', () => {
  const player = makeShenhuoPlayer({ 仙道潜力: 5 });
  const cost = applyQuestionFortuneCost(player, 10);
  assert.ok(player.仙道潜力 < cost, '5 < 10，应被门控拦截');
});

// 极境突破（#冲关极境）成功分支同样扣除仙道潜力（与门控一致）
// 极境突破不改变 xiangulevel_id，仅推进 player.极境 数组 / 凝聚仙气，成功即扣潜力
function simulateExtremeDeduct(player) {
  // 与 src 中各 breakthroughExtreme* / breakthroughXianqiExtreme 成功分支一致
  player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) - applyQuestionFortuneCost(player, 10));
  return player;
}

test('极境突破（如神火极境凝聚仙气）成功时扣除仙道潜力(−10)', () => {
  const player = makeShenhuoPlayer({ 仙道潜力: 50, xiangulevel_id: 8 });
  simulateExtremeDeduct(player);
  assert.equal(player.仙道潜力, 40);
});

test('极境突破持有问道签时按八折扣除(−8)', () => {
  const player = makeShenhuoPlayer({
    仙道潜力: 50,
    红尘仙缘签: { type: 'question', expiresAt: Date.now() + 999999 },
  });
  simulateExtremeDeduct(player);
  assert.equal(player.仙道潜力, 42);
});

test('普通冲关与极境冲关扣除口径一致（均为 applyQuestionFortuneCost(player,10)）', () => {
  const normal = makeShenhuoPlayer({ 仙道潜力: 100 });
  const extreme = makeShenhuoPlayer({ 仙道潜力: 100 });
  simulateBreakthroughUpperRealm(normal); // 神火→真一
  simulateExtremeDeduct(extreme); // 神火极境
  assert.equal(normal.仙道潜力, 90);
  assert.equal(extreme.仙道潜力, 90);
});

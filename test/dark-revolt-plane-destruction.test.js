import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { survivesDarkRevoltPlaneDestruction } from '../model/darkRevolt.js';

const source = fs.readFileSync(new URL('../apps/Boss/DarkRevoltDestruction.js', import.meta.url), 'utf8');
const bossSource = fs.readFileSync(new URL('../apps/Boss/BOSS2.js', import.meta.url), 'utf8');
const secretPlaceSource = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js', import.meta.url), 'utf8');
const addictionSource = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlaceplus.js', import.meta.url), 'utf8');

test('黑暗动乱位面毁灭只允许五个目标', () => {
  for (const name of ['凡间', '仙境', '下界八域', '太初星墟', '遮天位面']) {
    assert.match(source, new RegExp(`name: '${name}'`));
  }
  assert.match(source, /intervalWorldYears: 5000/);
  assert.match(source, /name: '遮天位面'.*hitsToDestroy: 3/);
  for (const name of ['凡间', '仙境', '下界八域', '太初星墟']) {
    assert.match(source, new RegExp(`name: '${name}'.*hitsToDestroy: 1`));
  }
  assert.doesNotMatch(source, /sendToYongJi|YongJi/);
  assert.doesNotMatch(bossSource, /destroyedPlanes\.push/);
});

test('黑暗动乱位面毁灭第三次才宣布彻底毁灭', () => {
  assert.match(source, /state\.damageCounts\[target\.name\] = hit/);
  assert.match(source, /hit >= target\.hitsToDestroy/);
  assert.match(source, /还需\$\{event\.remainingHits\}次毁灭打击/);
  assert.match(source, /承受三次毁灭，位面本源彻底崩灭/);
  assert.match(source, /打入轮回：\$\{event\.reincarnatedNames\.length\}人/);
});

test('大帝级及以上修士不会被禁区至尊打入轮回', () => {
  assert.equal(survivesDarkRevoltPlaneDestruction({ mijinglevel_id: 15 }), false);
  assert.equal(survivesDarkRevoltPlaneDestruction({ mijinglevel_id: 16 }), true);
  assert.equal(survivesDarkRevoltPlaneDestruction({ xiangulevel_id: 15 }), true);
  assert.equal(survivesDarkRevoltPlaneDestruction({ huafenlevel_id: 15 }), true);
  assert.equal(survivesDarkRevoltPlaneDestruction({ mijinglevel_id: 21 }), true);
  assert.match(source, /if \(survivesDarkRevoltPlaneDestruction\(player\)\)/);
  assert.match(source, /survivorIds\.push\(qq\)/);
  assert.match(source, /fullyDestroyed[\s\S]*survivorIds\.map\(clearDestroyedPlaneActivities\)/);
});

test('禁区至尊打爆位面后封锁副本并终止进行中的行动', () => {
  assert.match(source, /worldState\[target\.dataName\] = 0/);
  assert.match(source, /PLANE_DESTRUCTION_SOURCES\.DARK_REVOLT/);
  assert.match(source, /worldState\[target\.dataName\] === 1[\s\S]*state\.damageCounts\[target\.name\] = 0/);
  assert.match(secretPlaceSource, /isWeiMianDestroyed\(currentPlaneName\)/);
  assert.match(addictionSource, /isWeiMianDestroyed\(currentPlaneName\)/);
  for (const key of [
    'xiuxian:player:${qq}:action',
    'xiuxian:player:${qq}:action:fashan',
    'xiuxian:travel_task:${qq}',
    'xiuxian:player:${qq}:addiction_history',
  ]) {
    assert.ok(source.includes(`redis.del(\`${key}\`)`));
  }
});

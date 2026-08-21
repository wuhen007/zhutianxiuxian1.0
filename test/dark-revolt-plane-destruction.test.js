import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../apps/Boss/DarkRevoltDestruction.js', import.meta.url), 'utf8');
const bossSource = fs.readFileSync(new URL('../apps/Boss/BOSS2.js', import.meta.url), 'utf8');

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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../apps/SecretPlace/shijianchangheTask.js', import.meta.url), 'utf8');
const xiuxianSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');

test('时间长河任务接入分段三帝战、献祭待援和尸骸免炼化', () => {
  assert.match(source, /timeRiverStage:\s*stage/);
  assert.match(source, /rollDarkTriadContinuation/);
  assert.match(source, /时间长河战败待援/);
  assert.match(source, /getTimeRiverSacrificeRecovery/);
  assert.match(source, /primary\.名号 !== '尸骸仙帝'/);
  assert.doesNotMatch(source, /B_player\.名号 === '苍帝'[\s\S]{0,120}\['鸿帝', '羽帝'\]/);
  assert.equal((xiuxianSource.match(/action\.action === '时间长河战败待援'/g) || []).length, 1);
  assert.match(xiuxianSource, /_时间长河复活彩蛋/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  applyImperialPassSortie,
  createForeignProdigy,
  createImperialPassWave,
  getEquivalentSecretRealm,
  getImperialPassDueReminders,
  getImperialPassSupport,
  getWaveEnemyCount,
  isImperialPassThreshold,
  isImperialPassWaveComplete,
  rankImperialPassPrestige,
} from '../model/foreignImperialPass.js';

test('帝关每波防守三千年，并在前两千年各提醒一次', () => {
  const wave = createImperialPassWave({ wave: 1, worldYear: 1000, now: 1 });
  assert.equal(wave.deadlineWorldYear, 4000);
  assert.deepEqual(getImperialPassDueReminders(wave, 1999), []);
  assert.deepEqual(getImperialPassDueReminders(wave, 2000), [1000]);
  wave.remindedWorldYears.push(1000);
  assert.deepEqual(getImperialPassDueReminders(wave, 3000), [2000]);
  wave.remindedWorldYears.push(2000);
  assert.deepEqual(getImperialPassDueReminders(wave, 3500), []);
  assert.deepEqual(getImperialPassDueReminders({ ...wave, remindedWorldYears: [] }, 4000), []);

  const source = fs.readFileSync(new URL('../apps/tasks/ForeignImperialPass.js', import.meta.url), 'utf8');
  assert.match(source, /帝关泣血·最后千年/);
  assert.match(source, /安澜、俞陀的法相/);
  assert.match(source, /城关将破/);
});

test('帝关城破通过标准毁灭记录接入自然修复', () => {
  const source = fs.readFileSync(new URL('../apps/tasks/ForeignImperialPass.js', import.meta.url), 'utf8');
  const start = source.indexOf('async breachImperialPass');
  const end = source.indexOf('async forceImperialPass', start);
  const breachBody = source.slice(start, end);

  assert.match(breachBody, /markPlaneDestroyed/);
  assert.match(breachBody, /PLANE_DESTRUCTION_SOURCES\.FOREIGN_IMPERIAL_PASS/);
  assert.doesNotMatch(breachBody, /planes\.九天十地\s*=\s*0|planes\.遮天位面\s*=\s*0/);
});

test('圣王与虚道按元神表统一使用圣人王公式', () => {
  assert.equal(isImperialPassThreshold({ mijinglevel_id: 13 }), true);
  assert.equal(isImperialPassThreshold({ xiangulevel_id: 12 }), true);
  assert.equal(isImperialPassThreshold({ mijinglevel_id: 12, xiangulevel_id: 11 }), false);
  assert.equal(getEquivalentSecretRealm({ mijinglevel_id: 1, xiangulevel_id: 12 }), 13);
  assert.equal(getEquivalentSecretRealm({ mijinglevel_id: 14, xiangulevel_id: 12 }), 14);
});

test('异域天骄全属性复用遮天渡劫的境界基数与随机区间', () => {
  const levels = {
    Level_list: [{ level_id: 64, 基础攻击: 100, 基础防御: 200, 基础血量: 300 }],
    LevelMax_list: [{ level_id: 63, 基础攻击: 10, 基础防御: 20, 基础血量: 30 }],
    Levelmijing_list: [{ level_id: 13, 基础攻击: 1, 基础防御: 2, 基础血量: 3 }],
  };
  const enemy = createForeignProdigy({ xiangulevel_id: 12 }, levels, { random: () => 0 });
  assert.equal(enemy.mijinglevel_id, 13);
  assert.equal(enemy.异域全属性, 47.2);
  assert.equal(enemy.攻击, Math.trunc(111 * 47.2));
  assert.equal(enemy.防御, Math.trunc(222 * 47.2));
  assert.equal(enemy.血量上限, Math.trunc(333 * 47.2));
});

test('波数提高敌人数，百杀且全员应援后才击溃士气', () => {
  assert.equal(getWaveEnemyCount(1, () => 0), 12);
  assert.equal(getWaveEnemyCount(2, () => 0), 18);
  assert.equal(getWaveEnemyCount(3, () => 0), 26);

  let wave = createImperialPassWave({ wave: 1, worldYear: 1000, eligibleQqs: ['1', '2'], now: 1 });
  wave = applyImperialPassSortie(wave, { qq: '1', name: '荒', kills: 100, defeated: false, now: 2 });
  assert.deepEqual(getImperialPassSupport(wave), { supported: 1, required: 2 });
  assert.equal(wave.morale, 0);
  assert.equal(isImperialPassWaveComplete(wave), false);
  wave = applyImperialPassSortie(wave, { qq: '2', name: '叶', kills: 0, defeated: true, now: 3 });
  assert.equal(isImperialPassWaveComplete(wave), true);

  const ranking = rankImperialPassPrestige({
    1: { name: '荒', prestige: 100, kills: 100 },
    2: { name: '叶', prestige: 20, kills: 20 },
  });
  assert.equal(ranking[0].qq, '1');
});

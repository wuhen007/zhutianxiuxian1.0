import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { calculatePetCarePeriod } from '../apps/Garden/smallWorldPetEnergy.js';
import {
  WORKSHOP_MATERIAL_RATE,
  WORKSHOP_OUTPUTS,
  WORKSHOP_UPGRADE_HOURS,
  upgradeWorkshop,
} from '../apps/Garden/smallWorldWorkshop.js';

test('仙宠会按十四小时劳作、七小时休息、三小时玩耍自动循环', () => {
  const result = calculatePetCarePeriod(100, 100, 72, 4, 0);
  assert.equal(result.activeHours, 42);
  assert.equal(result.weightedWorkHours, 42);
  assert.equal(result.restHours, 21);
  assert.equal(result.playHours, 9);
  assert.equal(result.meals, 3);
  assert.equal(result.endEnergy, 100);
  assert.equal(result.cycleProgress, 0);
  assert.equal(result.weightedWorkHours * WORKSHOP_MATERIAL_RATE, 72);
  assert.deepEqual(WORKSHOP_OUTPUTS.修炼, { 修为: 3000000, 血气: 3000000, 制符草药: 1, 仙宠口粮: 0.5 });
  assert.equal(WORKSHOP_OUTPUTS.战斗.灵石, 50000);
  assert.equal(WORKSHOP_OUTPUTS.战斗.源石, 15000);
});

test('工坊五次升级依次消耗72、120、240、360、480份双材料', () => {
  assert.deepEqual(Object.values(WORKSHOP_UPGRADE_HOURS), [72, 120, 240, 360, 480]);
  const world = { 工坊: { 灵田: { level: 1 } }, 工坊物资: {} };
  for (const hours of Object.values(WORKSHOP_UPGRADE_HOURS)) {
    world.工坊物资.界源矿石 = hours;
    world.工坊物资.工坊构件 = hours;
    const result = upgradeWorkshop(world, '灵田');
    assert.equal(result.ok, true);
    assert.equal(result.requirement.hours, hours);
    assert.equal(world.工坊物资.界源矿石, 0);
    assert.equal(world.工坊物资.工坊构件, 0);
  }
  assert.equal(world.工坊.灵田.level, 6);
  assert.equal(upgradeWorkshop(world, '灵田').reason, 'max');
});

test('小世界应用可以完整装载新增工坊模块', () => {
  const cwd = fileURLToPath(new URL('../../..', import.meta.url));
  const script = `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    await import('./plugins/zhutianxiuxian1.0/apps/Garden/xiaoshijie.js');
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

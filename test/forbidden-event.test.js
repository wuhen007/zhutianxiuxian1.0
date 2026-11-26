import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDaoSightingEvent,
  createForbiddenCleansingEvent,
  getEventRemaining,
  resolveCleansingOutcome,
} from '../model/forbiddenEvent.js';

test('违禁品清算事件保存目标与截杀者', () => {
  const event = createForbiddenCleansingEvent({
    treasureName: '混沌珠',
    ownerId: '10001',
    ownerName: '持宝者',
    plane: '仙界',
    coordinate: { x: 10, y: 20 },
    worldYear: 500,
    pursuer: { name: '道天', title: '超维强者', threat: 2, law: '抹除' },
  });
  assert.equal(event.target.treasureName, '混沌珠');
  assert.equal(event.target.coordinate.x, 10);
  assert.equal(event.pursuer.name, '道天');
  assert.equal(event.status, 'active');
});

test('大道至宝惊鸿具有现实窗口与一千年世界窗口', () => {
  const event = createDaoSightingEvent({
    location: { plane: '仙界', location: '古地', coordinate: { x: 1, y: 2 } },
    worldYear: 1000,
    now: 100,
    treasure: { name: '岁月天碑', title: '时间大道显化' },
  });
  assert.equal(event.expiresWorldYear, 2000);
  assert.equal(getEventRemaining(event, 1500, 100).active, true);
  assert.equal(getEventRemaining(event, 2000, 100).active, false);
});

test('清算失败结果覆盖封禁、遁走、碎片化与失踪', () => {
  assert.equal(resolveCleansingOutcome(() => 0.1), 'sealed');
  assert.equal(resolveCleansingOutcome(() => 0.6), 'fled');
  assert.equal(resolveCleansingOutcome(() => 0.8), 'shattered');
  assert.equal(resolveCleansingOutcome(() => 0.99), 'vanished');
});


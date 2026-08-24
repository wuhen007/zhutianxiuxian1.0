import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildPlaneDestroyedMessage,
  getPlaneDestructionInfo,
  markPlaneDestroyed,
  PLANE_DESTRUCTION_RECORD_KEY,
  PLANE_DESTRUCTION_SOURCES,
  repairNaturallyDestroyedPlanes,
  repairPlane,
} from '../model/planeDestruction.js';

function createPlaneFile(initial = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plane-destruction-'));
  const filePath = path.join(dir, '位面.json');
  fs.writeFileSync(filePath, JSON.stringify({
    诸天位面: 5,
    凡间: 1,
    仙界: 1,
    遮天位面: 1,
    ...initial,
  }), 'utf8');
  return {
    filePath,
    read: () => JSON.parse(fs.readFileSync(filePath, 'utf8')),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test('禁区至尊毁灭的位面满修复年限后自行恢复', t => {
  const fixture = createPlaneFile();
  t.after(fixture.cleanup);

  assert.equal(markPlaneDestroyed(fixture.filePath, '遮天位面', {
    source: PLANE_DESTRUCTION_SOURCES.DARK_REVOLT,
    actor: '石皇',
    worldYear: 100,
  }), true);
  assert.deepEqual(repairNaturallyDestroyedPlanes(fixture.filePath, {
    worldYear: 2099,
    minAge: 2000,
  }), []);
  assert.equal(fixture.read().遮天位面, 0);

  assert.deepEqual(repairNaturallyDestroyedPlanes(fixture.filePath, {
    worldYear: 2100,
    minAge: 2000,
  }), ['遮天位面']);
  const restored = fixture.read();
  assert.equal(restored.遮天位面, 1);
  assert.equal(restored[PLANE_DESTRUCTION_RECORD_KEY], undefined);
});

test('毁灭拦截文案区分禁区至尊与厄土仙帝', t => {
  const fixture = createPlaneFile();
  t.after(fixture.cleanup);

  markPlaneDestroyed(fixture.filePath, '凡间', {
    source: PLANE_DESTRUCTION_SOURCES.DARK_REVOLT,
    actor: '轮回之主',
    worldYear: 300,
  });
  const darkMessage = buildPlaneDestroyedMessage(fixture.filePath, '凡间');
  assert.match(darkMessage, /禁区至尊/);
  assert.match(darkMessage, /轮回之主/);
  assert.match(darkMessage, /缓慢重聚/);

  markPlaneDestroyed(fixture.filePath, '仙界', {
    source: PLANE_DESTRUCTION_SOURCES.STRANGE_EMPEROR,
    actor: '厄土仙帝',
    worldYear: 300,
  });
  const strangeMessage = buildPlaneDestroyedMessage(fixture.filePath, '仙界');
  assert.match(strangeMessage, /厄土仙帝/);
  assert.match(strangeMessage, /不会随时间自行恢复/);
  assert.match(strangeMessage, /仙帝级及以上/);
});

test('厄土仙帝毁灭的位面只接受显式修复', t => {
  const fixture = createPlaneFile();
  t.after(fixture.cleanup);

  markPlaneDestroyed(fixture.filePath, '仙界', {
    source: PLANE_DESTRUCTION_SOURCES.STRANGE_EMPEROR,
    actor: '厄土仙帝',
    worldYear: 100,
  });
  assert.deepEqual(repairNaturallyDestroyedPlanes(fixture.filePath, {
    worldYear: 100000,
    minAge: 2000,
  }), []);
  assert.equal(fixture.read().仙界, 0);
  assert.equal(repairPlane(fixture.filePath, '仙界'), true);
  assert.equal(fixture.read().仙界, 1);
});

test('缺少毁灭来源的旧位面使用通用拦截文案', t => {
  const fixture = createPlaneFile({ 凡间: 0 });
  t.after(fixture.cleanup);

  assert.equal(getPlaneDestructionInfo(fixture.filePath, '凡间').source, 'unknown');
  const message = buildPlaneDestroyedMessage(fixture.filePath, '凡间');
  assert.match(message, /已经被打爆/);
  assert.doesNotMatch(message, /禁区至尊|厄土仙帝/);
});

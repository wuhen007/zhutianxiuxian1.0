import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('永寂位面索引同时读取永恒未知之地的旧 6.5 键', () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const script = `
    globalThis.logger = { info() {}, error() {} };
    globalThis.Bot = { makeLog() {} };
    const records = {
      '10001': JSON.stringify({
        qq: '10001',
        名号: '旧存档修士',
        planeId: 6.5,
        planeName: '永恒未知之地',
        yongjiTimeStr: '历史记录',
      }),
    };
    const sets = new Map([
      ['xiuxian:yongji:byplane:6.5', ['10001']],
      ['xiuxian:yongji:byplane:42', []],
    ]);
    globalThis.redis = {
      async sMembers(key) { return sets.get(key) || []; },
      async hGet(_key, qq) { return records[qq] || null; },
      async hGetAll() { return records; },
    };
    const { getYongJiByPlane, getYongJiStats } = await import('./plugins/zhutianxiuxian1.0/apps/Boss/YongJiList.js');
    const byCanonicalId = await getYongJiByPlane(42);
    const byLegacyId = await getYongJiByPlane(6.5);
    const stats = await getYongJiStats();
    process.stdout.write(JSON.stringify({
      canonical: byCanonicalId.list.map(item => item.qq),
      legacy: byLegacyId.list.map(item => item.qq),
      stats: stats.byPlane,
    }));
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(output.canonical, ['10001']);
  assert.deepEqual(output.legacy, ['10001']);
  assert.deepEqual(output.stats, [{ planeId: 42, planeName: '永恒未知之地', count: 1 }]);
});

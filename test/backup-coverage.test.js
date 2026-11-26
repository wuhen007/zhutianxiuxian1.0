import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findPlayerArchiveSnapshot, selectBackupsToDelete } from '../model/backupSnapshot.js';

const source = fs.readFileSync(new URL('../apps/User/BackUp.js', import.meta.url), 'utf8');

test('full backup covers runtime directories, redis state and cache reload', () => {
  for (const expected of [
    "const ROOT_DATA_SNAPSHOT = 'root_data'",
    "const RUNTIME_CONFIG_SNAPSHOT = 'runtime_config'",
    "'jueling_loss:*'",
    "'jueling_loss_immune:*'",
    "'tianjige2:*'",
    'entries.every(Array.isArray)',
    'data.ensureDirsExist()',
    '[旧格式：不含小世界/内景地/位面]',
  ]) {
    assert.ok(source.includes(expected), `missing backup coverage: ${expected}`);
  }
});

test('single-player restore resolves current full snapshots and legacy snapshots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-backup-'));
  try {
    const dataPath = path.join(root, 'live', 'data');
    const liveDirectory = path.join(dataPath, 'xiuxian_player');
    const backupPath = path.join(root, 'backup');
    const current = path.join(backupPath, 'data', 'xiuxian_player', '10001.json');
    const legacy = path.join(backupPath, 'player_path', '10001.json');
    fs.mkdirSync(path.dirname(current), { recursive: true });
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(current, '{}');
    fs.writeFileSync(legacy, '{}');

    const input = { backupPath, dataPath, liveDirectory, legacyKey: 'player_path', fileName: '10001.json' };
    assert.equal(findPlayerArchiveSnapshot(input), current);
    fs.unlinkSync(current);
    assert.equal(findPlayerArchiveSnapshot(input), legacy);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backup cleanup preserves the latest snapshot of every day for one week', () => {
  const now = new Date(2026, 7, 24, 20, 0, 0, 0);
  const timestamp = (daysAgo, hour) => {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(hour, 0, 0, 0);
    return date.getTime();
  };
  const folders = [
    timestamp(0, 8), timestamp(0, 12), timestamp(0, 18),
    timestamp(1, 9), timestamp(1, 22),
    timestamp(2, 10), timestamp(2, 23),
    timestamp(7, 8), timestamp(7, 21),
    timestamp(8, 23),
  ].map(String);

  const deleted = new Set(selectBackupsToDelete(folders, {
    keepCount: 2,
    retentionDays: 7,
    now: now.getTime(),
  }));

  assert.equal(deleted.has(String(timestamp(1, 22))), false);
  assert.equal(deleted.has(String(timestamp(2, 23))), false);
  assert.equal(deleted.has(String(timestamp(7, 21))), false);
  assert.equal(deleted.has(String(timestamp(1, 9))), true);
  assert.equal(deleted.has(String(timestamp(2, 10))), true);
  assert.equal(deleted.has(String(timestamp(7, 8))), true);
  assert.equal(deleted.has(String(timestamp(8, 23))), true);
});

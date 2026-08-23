import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findPlayerArchiveSnapshot } from '../model/backupSnapshot.js';

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

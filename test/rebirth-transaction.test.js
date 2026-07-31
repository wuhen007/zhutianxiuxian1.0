import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FileRollbackTransaction,
  writeJsonAtomically,
} from '../apps/SecretPlace/rebirthTransaction.js';

function withTempDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rebirth-transaction-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('回滚会恢复原文件并删除事务中新建的文件', () => {
  withTempDirectory(directory => {
    const existingPath = path.join(directory, 'player.json');
    const createdPath = path.join(directory, 'najie.json');
    fs.writeFileSync(existingPath, '{"old":true}', 'utf8');

    const transaction = new FileRollbackTransaction();
    transaction.capture(existingPath);
    transaction.capture(createdPath);

    writeJsonAtomically(existingPath, { old: false });
    writeJsonAtomically(createdPath, { created: true });
    transaction.rollback();

    assert.equal(fs.readFileSync(existingPath, 'utf8'), '{"old":true}');
    assert.equal(fs.existsSync(createdPath), false);
  });
});

test('提交后不会再回滚已写入的数据', () => {
  withTempDirectory(directory => {
    const playerPath = path.join(directory, 'player.json');
    fs.writeFileSync(playerPath, '{"generation":1}', 'utf8');

    const transaction = new FileRollbackTransaction();
    transaction.capture(playerPath);
    writeJsonAtomically(playerPath, { generation: 2 });
    transaction.commit();
    transaction.rollback();

    assert.deepEqual(JSON.parse(fs.readFileSync(playerPath, 'utf8')), {
      generation: 2,
    });
    assert.equal(
      fs.readdirSync(directory).some(file => file.endsWith('.tmp')),
      false
    );
  });
});

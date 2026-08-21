import assert from 'node:assert/strict';
import test from 'node:test';

import { writeFileAtomically } from '../utils/atomicJson.js';

function createFileSystem(renameSync) {
  const files = new Map();

  return {
    files,
    writeFileSync(path, content) {
      files.set(path, content);
    },
    renameSync(sourcePath, targetPath) {
      renameSync();
      files.set(targetPath, files.get(sourcePath));
      files.delete(sourcePath);
    },
    existsSync(path) {
      return files.has(path);
    },
    unlinkSync(path) {
      files.delete(path);
    },
  };
}

test('retries a transient Windows rename error', () => {
  let attempts = 0;
  const fileSystem = createFileSystem(() => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' });
  });

  writeFileAtomically('player.json', 'new data', fileSystem);

  assert.equal(attempts, 3);
  assert.equal(fileSystem.files.get('player.json'), 'new data');
  assert.equal([...fileSystem.files.keys()].some(path => path.endsWith('.tmp')), false);
});

test('does not retry a permanent rename error and removes the temp file', () => {
  let attempts = 0;
  const fileSystem = createFileSystem(() => {
    attempts += 1;
    throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  });

  assert.throws(
    () => writeFileAtomically('player.json', 'new data', fileSystem),
    error => error.code === 'ENOSPC',
  );
  assert.equal(attempts, 1);
  assert.equal(fileSystem.files.size, 0);
});

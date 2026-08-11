import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

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

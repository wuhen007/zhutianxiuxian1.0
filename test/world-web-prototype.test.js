import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(root, 'resources', 'web', 'world-prototypes');
const read = (name) => fs.readFileSync(path.join(webRoot, name), 'utf8');

test('世界网页原型包含三套主题和完整交易入口', () => {
  const approval = read('index.html');
  const template = read('template.html');
  const styles = read('styles.css');
  const script = read('prototype.js');

  for (const theme of ['celestial', 'forge', 'scroll']) {
    assert.match(approval, new RegExp(`theme=${theme}`));
    assert.match(styles, new RegExp(`data-theme="${theme}"`));
  }
  for (const id of ['message-stream', 'chat-form', 'inventory-list', 'trade-form', 'trade-grid']) {
    assert.match(template, new RegExp(`id="${id}"`));
  }
  assert.match(template, /data-want-kind="item"/);
  assert.match(template, /id="tradeable-items"/);
  assert.match(script, /selectInventoryItem/);
  assert.match(script, /wantKind === 'item'/);
  assert.match(script, /已向.*发布交易委托/);
});

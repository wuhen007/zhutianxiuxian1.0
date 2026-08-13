import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../apps/Help/BotHelp.js', import.meta.url), 'utf8');
const variants = ['celestial-codex', 'astral-atlas', 'rift-stele'];

test('图片帮助默认使用天宫玉册并保留三套四列模板', () => {
  assert.match(appSource, /const HELP_TEMPLATE = 'celestial-codex'/);
  assert.match(appSource, /help-variants\/\$\{HELP_TEMPLATE\}\.html/);

  for (const variant of variants) {
    assert.ok(fs.existsSync(new URL(`../resources/html/help-variants/${variant}.html`, import.meta.url)));
    const css = fs.readFileSync(
      new URL(`../resources/html/help-variants/${variant}.css`, import.meta.url),
      'utf8'
    );
    assert.match(css, /grid-template-columns:\s*repeat\(4,/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
  }
});

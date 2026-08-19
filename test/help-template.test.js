import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const appSource = fs.readFileSync(new URL('../apps/Help/BotHelp.js', import.meta.url), 'utf8');
const variants = ['celestial-codex', 'astral-atlas', 'rift-stele'];
const typography = {
  'celestial-codex': [/\.command-copy strong[^}]*font-size:\s*18px/, /\.command-copy p[^}]*font-size:\s*15px/],
  'astral-atlas': [/\.route-copy strong[^}]*font-size:\s*18px/, /\.route-copy p[^}]*font-size:\s*15px/],
  'rift-stele': [/\.edict-main strong[^}]*font-size:\s*18px/, /\.edict\s*>\s*p[^}]*font-size:\s*15px/],
};

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
    const [titleSize, descSize] = typography[variant];
    assert.match(css, titleSize);
    assert.match(css, descSize);
  }
});

test('诸天帮助完整收录遗珍与世界频道指令', () => {
  const help = fs.readFileSync(new URL('../config/help/zhutianhelp.yaml', import.meta.url), 'utf8');
  for (const text of [
    '诸天遗珍',
    '#铭刻遗珍*编号*武器/护具/法宝*1/2',
    '#拓展遗珍槽*武器/护具/法宝',
    '诸天世界频道',
    '#世界 发言 内容 / #世界 留言 内容',
    '#世界 加入 / #世界 退出',
    '#世界 群号全员公开',
  ]) {
    assert.ok(help.includes(text), `诸天帮助缺少：${text}`);
  }
});

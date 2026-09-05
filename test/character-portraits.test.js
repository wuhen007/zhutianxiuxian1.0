import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import template from 'art-template';
import probe from 'probe-image-size';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const characters = JSON.parse(read('resources/data/item/剧情人物列表.json'));
const html = read('resources/html/character/character.html');
const portraits = {
  柳神: 'liushen.webp',
  石昊: 'shihao.webp',
  孟天正: 'mengtianzheng.webp',
  盖九幽: 'gaijiuyou.webp',
  张五爷: 'zhangwuye.webp',
  黑皇: 'heihuang.webp',
  段德: 'duande.webp',
  苏灵: 'suling.webp',
  叶萧: 'yexiao.webp',
  莫晓羽: 'moxiaoyu.webp',
};

function render(items) {
  return template.render(html, {
    pluResPath: '/plugin-resources/',
    realms: [{ name: '测试位面', characters: items }],
    totalCharacters: items.length,
    unlockedCount: items.filter(character => character.已解锁).length,
    progressPercentage: 0,
  });
}

test('十位剧情人物立绘对应正确，资源保持完整竖版尺寸', () => {
  for (const [name, filename] of Object.entries(portraits)) {
    assert.equal(characters.find(character => character.名号 === name)?.立绘, filename);
    const image = probe.sync(fs.readFileSync(
      new URL(`../resources/img/character/${filename}`, import.meta.url),
    ));
    assert.equal(image.mime, 'image/webp', name);
    assert.deepEqual([image.width, image.height], [1024, 1536], name);
  }
  assert.equal(new Set(Object.values(portraits)).size, 10);
});

test('人物图鉴渲染全部立绘，使用插件资源地址并主动加载截图所需图片', () => {
  const output = render(characters.map(character => ({
    ...character, 已解锁: true, 关系: 2, 好感度: 180,
  })));
  assert.equal((output.match(/<img /g) || []).length, characters.length);
  assert.equal((output.match(/loading="eager"/g) || []).length, characters.length);
  for (const character of characters) {
    assert.ok(output.includes(`src="/plugin-resources/img/character/${character.立绘}"`));
    assert.ok(output.includes(`alt="${character.名号}立绘"`));
    assert.ok(output.includes(character.人物描述));
  }
  assert.ok(output.includes('命运终章·移劫夺运'));
  assert.ok(output.includes('共渡命劫：'));
});

test('未解锁人物保留遮罩与立绘，缺少立绘字段的旧数据照常显示文字', () => {
  const known = { ...characters[0], 已解锁: false };
  const legacy = { ...characters[1], 已解锁: true, 关系: 1, 好感度: 10 };
  delete legacy.立绘;
  const output = render([known, legacy]);
  assert.equal((output.match(/<img /g) || []).length, 1);
  assert.equal((output.match(/<div class="locked-overlay">/g) || []).length, 1);
  assert.equal((output.match(/<div class="relationship-info">/g) || []).length, 1);
  assert.ok(output.includes(legacy.人物描述));
  assert.ok(!output.includes('undefined'));
  assert.match(output, /onerror="this\.parentElement\.style\.display='none'"/);
});

test('两份图鉴样式同步，立绘保持比例，解锁遮罩位于图片之上', () => {
  const css = read('resources/html/character/character.css');
  for (const selector of ['.character-portrait', '.character-portrait img']) {
    const escaped = selector.replaceAll('.', '\\.');
    const rule = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`);
    const normalize = value => value.replace(/\s+/g, ' ').trim();
    assert.equal(normalize(html.match(rule)[1]), normalize(css.match(rule)[1]));
  }
  for (const source of [html, css]) {
    assert.match(source, /object-fit:\s*contain/);
    assert.match(source, /\.character-portrait img\s*\{[^}]*height:\s*auto/s);
    assert.match(source, /\.locked-overlay\s*\{[^}]*z-index:\s*1/s);
  }
});

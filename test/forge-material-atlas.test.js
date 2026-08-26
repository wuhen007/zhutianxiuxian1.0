import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import template from 'art-template';

const html = fs.readFileSync(
  new URL('../resources/html/duanzaocailiao/duanzaocailiao.html', import.meta.url),
  'utf8'
);
const commandSource = fs.readFileSync(
  new URL('../apps/ShowImeg/Showningmeng.js', import.meta.url),
  'utf8'
);

test('锻造材料楼模板展示已拥有与未拥有材料', () => {
  const output = template.render(html, {
    pluResPath: '..',
    nickname: '试炼者',
    material_have: [{
      name: '庚金',
      owned: 3,
      type: '锻造',
      稀有度: 1,
      effect: '攻+1.0%',
    }],
    material_need: [{
      name: '宇宙核心',
      type: '锻造',
      稀有度: 10,
      effect: '全属性锻造材料',
      出售价: 100,
    }],
  });

  assert.match(output, /试炼者的锻造材料/);
  assert.match(output, /【已拥有】/);
  assert.match(output, /持有：3/);
  assert.match(output, /【未拥有】/);
  assert.match(output, /宇宙核心/);
});

test('锻造材料楼命令已注册', () => {
  assert.match(commandSource, /reg: '\^#锻造材料楼\$'/);
  assert.match(commandSource, /fnc: 'Show_DuanzhaoCailiao'/);
});

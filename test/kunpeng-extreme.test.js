import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const attacks = JSON.parse(fs.readFileSync(new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url), 'utf8'));
const arts = JSON.parse(fs.readFileSync(new URL('../resources/data/item/功法列表.json', import.meta.url), 'utf8'));
const battleSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');

test('鲲鹏宝术极尽与行字秘极尽使用同一速度模板，仅表现文案不同', () => {
  const movement = attacks.find(skill => skill.name === '行字秘·极尽');
  const kunpeng = attacks.find(skill => skill.name === '鲲鹏宝术·极尽');
  assert.ok(kunpeng);
  for (const field of ['class', 'pr', 'cnt', 'beilv', 'other', '拉条', '速度加成', '攻击类型', '稀有度']) {
    assert.equal(kunpeng[field], movement[field], field);
  }
  assert.notEqual(kunpeng.msg1, movement.msg1);
  assert.ok(arts.some(art => art.name === '鲲鹏宝术·极尽'));
  assert.match(battleSource, /attacker\._speedBoost \+= 速度效果/);
});

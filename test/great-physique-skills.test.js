import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), 'utf8'));

test('大成圣体与苍天霸体终结技触发率统一为0.55', () => {
  const skills = readJson('resources', 'data', 'item', '技能组', '攻击技能.json');
  for (const name of ['大成·苍天霸体', '大成·荒古圣体']) {
    const skill = skills.find(item => item.name === name && item.beilv === 10);
    assert.ok(skill, `${name}终结技应存在`);
    assert.equal(skill.pr, 0.55);
    assert.equal(skill.禁疗, 1);
    assert.equal(skill.不可复活, 1);
  }
});

test('大成苍天霸体拥有独立防御与领域技能', () => {
  const defense = readJson('resources', 'data', 'item', '技能组', '防御技能.json');
  const special = readJson('resources', 'data', 'item', '技能组', '灵根增幅技能.json');
  assert.ok(defense.some(item => item.name === '大成·苍天霸体'));
  assert.ok(special.some(item => item.name === '大成·苍天霸体' && item.效果类型 === '霸血领域'));
});

test('大成苍天霸体使用独立灵根 ID', () => {
  const roots = readJson('resources', 'data', 'item', '灵根列表.json');
  const rootEntry = roots.find(item => item.name === '大成·苍天霸体');
  assert.equal(rootEntry?.id, 70049);
  assert.equal(roots.filter(item => item.id === 70049).length, 1);
});

test('团本攻击流程把终结技的禁疗与不可复活同步到真实目标', () => {
  const battleSource = fs.readFileSync(path.join(root, 'apps', 'Battle', 'tuanben.js'), 'utf8');
  assert.match(battleSource, /defender\.不可复活\s*=\s*true/);
  assert.match(battleSource, /defender\.禁疗\s*=\s*1/);
});

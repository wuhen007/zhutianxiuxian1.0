import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

test('源石坊羽化仙经残页可合成唯一的完整帝经', () => {
  const materials = readJson('resources/data/item/材料列表.json');
  const recipes = readJson('resources/data/item/合成列表.json');
  const techniques = readJson('resources/data/item/功法列表.json');

  const pages = materials.filter(item => item.name === '羽化仙经残页');
  assert.equal(pages.length, 1);
  assert.equal(pages[0].class, '材料');

  const recipesForScripture = recipes.filter(item => item.name === '羽化仙经');
  assert.equal(recipesForScripture.length, 1);
  assert.deepEqual(recipesForScripture[0].materials, [
    { name: '羽化仙经残页', class: '材料', amount: 10 },
  ]);

  const scripture = techniques.filter(item => item.name === '羽化仙经');
  assert.equal(scripture.length, 1);
  assert.equal(scripture[0].class, '功法');
  assert.equal(scripture[0].type, '帝经');
});

test('源石坊真实发放残页且完整帝经参与秘境判定', () => {
  const gameSource = fs.readFileSync(
    path.join(rootDir, 'apps/Game/Games.js'),
    'utf8'
  );
  const stoneRules = fs.readFileSync(
    path.join(rootDir, 'apps/Game/stoneMarketRules.js'),
    'utf8'
  );
  const levelSource = fs.readFileSync(
    path.join(rootDir, 'apps/User/Level.js'),
    'utf8'
  );

  assert.match(
    stoneRules,
    /name:\s*'羽化仙经残页'[\s\S]{0,160}class:\s*'材料'/
  );
  assert.match(
    gameSource,
    /Add_najie_thing\(usr_qq, item\.name, item\.class, item\.amount\)/
  );
  assert.match(levelSource, /fullDiJingList[\s\S]{0,500}"羽化仙经"/);
});

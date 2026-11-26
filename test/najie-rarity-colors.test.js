import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { enrichNajieDisplayRarity } from '../model/najieRarity.js';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const overviewHtml = read('../resources/html/najie/najie.html');
const copyHtml = read('../resources/html/najie_copy/najie_copy.html');
const categoryHtml = read('../resources/html/najie-category/najie-category.html');
const rarityCss = read('../resources/html/najie/rarity.css');
const xiuxianSource = read('../model/xiuxian.js');
const rarityClass = 'rarity-{{item.稀有度 || 1}}';

test('纳戒所有物品外框按稀有度生成样式类', () => {
  for (const html of [overviewHtml, copyHtml]) {
    const cards = html.match(/<div class="item(?: [^"]*)?"/g) ?? [];
    assert.ok(cards.length > 0);
    assert.ok(cards.every(card => card.includes(rarityClass)));
    assert.doesNotMatch(html, /item_title[^\n]*rarity-/);
    assert.match(html, /html\/najie\/rarity\.css\?v=20260811/);
  }

  const categoryCards = categoryHtml.match(/<div class="item-card[^"]*"/g) ?? [];
  assert.ok(categoryCards.length > 0);
  assert.ok(categoryCards.every(card => card.includes(rarityClass)));
  assert.doesNotMatch(categoryHtml, /item-name[^\n]*rarity-/);
  assert.match(categoryHtml, /html\/najie\/rarity\.css\?v=20260811/);
});

test('纳戒稀有度样式覆盖1至10级', () => {
  for (let rarity = 1; rarity <= 10; rarity++) {
    assert.match(rarityCss, new RegExp(`\\.item(?:-card)?\\.rarity-${rarity}\\b`));
  }

  assert.match(rarityCss, /rarity-8[\s\S]*linear-gradient/);
  assert.match(rarityCss, /rarity-9[\s\S]*linear-gradient/);
  assert.match(rarityCss, /rarity-10[\s\S]*najie-rarity-border-flow/);
  assert.match(rarityCss, /repeating-linear-gradient/);
  assert.match(rarityCss, /prefers-reduced-motion/);
  assert.doesNotMatch(rarityCss, /item_title|item-name|text-fill-color/);
});

test('旧纳戒物品从当前物品库补齐展示稀有度', async () => {
  const najie = {
    丹药: [
      { name: '七阶淬体丹', 稀有度: 0, 数量: 2 },
      { name: '裂隙龙髓丹', 稀有度: 3, 数量: 1 },
    ],
    道具: [{ name: '金矿', 数量: 75 }],
  };
  const rarityByName = new Map([
    ['七阶淬体丹', 5],
    ['裂隙龙髓丹', 7],
    ['金矿', 2],
  ]);

  const displayNajie = await enrichNajieDisplayRarity(najie, async name => ({
    name,
    稀有度: rarityByName.get(name),
  }));

  assert.equal(displayNajie.丹药[0].稀有度, 5);
  assert.equal(displayNajie.丹药[1].稀有度, 3);
  assert.equal(displayNajie.道具[0].稀有度, 2);
  assert.equal(najie.丹药[0].稀有度, 0);
});

test('三种纳戒截图入口都补齐旧存档稀有度', () => {
  for (const functionName of [
    'get_najie_category_img',
    'get_najie_img',
    'get_najie_chouchou_img',
  ]) {
    const marker = `export async function ${functionName}`;
    const start = xiuxianSource.indexOf(marker);
    const followingSource = xiuxianSource.slice(start + marker.length);
    const nextFunction = followingSource.indexOf('\nexport async function');
    const functionSource = nextFunction < 0
      ? followingSource
      : followingSource.slice(0, nextFunction);
    assert.ok(start >= 0);
    assert.match(functionSource, /enrichNajieDisplayRarity\(najie, foundthing\)/);
  }
  assert.equal(
    (xiuxianSource.match(/enrichNajieDisplayRarity\(najie, foundthing\)/g) || []).length,
    3
  );
});

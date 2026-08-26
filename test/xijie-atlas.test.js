import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import template from 'art-template';
import {
  buildXijieAtlasData,
  isXijieShopLockExpired,
  refreshXijieShop,
  XIJIE_SHOP_LOCK_TTL_MS,
} from '../model/xijieAtlas.js';

const html = fs.readFileSync(
  new URL('../resources/html/xijie_list/xijie_list.html', import.meta.url),
  'utf8'
);

const css = fs.readFileSync(
  new URL('../resources/html/xijie_list/xijie_list.css', import.meta.url),
  'utf8'
);

const appSource = fs.readFileSync(new URL('../apps/Xijie/Xijie.js', import.meta.url), 'utf8');
const staticShop = JSON.parse(fs.readFileSync(
  new URL('../resources/data/item/shop列表.json', import.meta.url),
  'utf8'
));
const runtimeShop = JSON.parse(fs.readFileSync(
  new URL('../resources/data/shop/shop.json', import.meta.url),
  'utf8'
));

test('洗劫图鉴按地点汇总实时状态和掉落权重', () => {
  const atlas = buildXijieAtlasData([
    {
      id: 101,
      name: '试炼楼',
      Grade: 2,
      state: 0,
      price: 1000,
      one: [
        { name: '灵石', class: '道具', 数量: 10 },
        { name: '灵石', class: '道具', 数量: 10 },
        { name: '残卷', class: '材料', 数量: 0 },
      ],
    },
    { id: 102, name: '戒备关', Grade: 1, state: 1, price: 2000, one: [] },
    { id: 103, name: '空库', Grade: 3, state: 0, price: 3000, one: [{ name: '灰烬', class: '材料', 数量: 0 }] },
  ]);

  assert.deepEqual(atlas.stats, {
    locationCount: 3,
    readyCount: 1,
    guardedCount: 1,
    emptyCount: 1,
    rewardTypeCount: 2,
  });
  assert.equal(atlas.locations[0].priceLabel, '2,000');
  assert.equal(atlas.locations[0].rewards[0].weightLabel, '权重 ×2');
  assert.equal(atlas.locations[0].rewards[1].quantityLabel, '已耗尽');
  assert.equal(atlas.locations[2].status, '已搬空');
});

test('洗劫图鉴模板可渲染所有地点和核心状态', () => {
  const output = template.render(html, {
    ...buildXijieAtlasData([{ id: 1, name: '柠檬堂', Grade: 1, state: 0, price: 1500000, one: [{ name: '庚金', class: '材料', 数量: 2 }] }]),
    pluResPath: '..',
  });

  assert.match(output, /洗劫列表图鉴/);
  assert.match(output, /柠檬堂/);
  assert.match(output, /可洗劫/);
  assert.match(output, /庚金/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /width:\s*1120px/);
  assert.match(appSource, /reg: '\^#洗劫\(\?:列表\|图鉴\|列表图鉴\)\$'/);
  assert.match(appSource, /fnc: 'xijieList'/);

  const emptyOutput = template.render(html, {
    ...buildXijieAtlasData([]),
    pluResPath: '..',
  });
  assert.match(emptyOutput, /暂无洗劫地点档案/);
});

test('商店刷新完整同步目录并让所有地点重新营业', () => {
  const refreshed = refreshXijieShop(
    [
      { id: 1, name: '旧店', Grade: 3, state: 1, price: 1, one: [] },
      { id: 2, name: '万维梵宇', Grade: 2, state: 1, price: 1, one: [] },
    ],
    [
      { id: 2, name: '万维梵宇', Grade: 1, state: 0, price: 99, one: [{ name: '梵宇石', 数量: 5 }] },
      { id: 3, name: '新店', Grade: 1, state: 0, price: 88, one: [] },
    ]
  );

  assert.deepEqual(refreshed.map(place => place.name), ['万维梵宇', '新店']);
  assert.equal(refreshed[0].Grade, 2);
  assert.equal(refreshed[0].state, 0);
  assert.equal(refreshed[0].price, 99);
  assert.deepEqual(refreshed[0].one, [{ name: '梵宇石', 数量: 5 }]);
  assert.equal(refreshed[1].state, 0);
});

test('静态商店列表与运行时商店完全同步', () => {
  assert.deepEqual(staticShop, runtimeShop);
  assert.ok(runtimeShop.some(place => place.name === '超维真界'));
});

test('洗劫地点占用超时或缺少旧版时间戳时自动失效', () => {
  const now = 1_000_000;
  assert.equal(isXijieShopLockExpired({ state: 0 }, now), false);
  assert.equal(isXijieShopLockExpired({ state: 1 }, now), true);
  assert.equal(isXijieShopLockExpired({ state: 1, state_until: now - 1 }, now), true);
  assert.equal(isXijieShopLockExpired({ state: 1, state_until: now + XIJIE_SHOP_LOCK_TTL_MS }, now), false);
});

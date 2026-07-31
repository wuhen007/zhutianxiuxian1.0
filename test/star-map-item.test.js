import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function readItemData(file) {
  return JSON.parse(fs.readFileSync(new URL(`../resources/data/item/${file}`, import.meta.url), 'utf8'));
}

test('星图已接入道具主表与商城', () => {
  const props = readItemData('道具列表.json');
  const commodities = readItemData('商店/商品列表.json');
  const starMap = props.find(item => item.name === '星图');
  const commodity = commodities.find(item => item.name === '星图');

  assert.deepEqual(
    [starMap?.id, starMap?.class, starMap?.type],
    [29000003, '道具', '位面坐标'],
  );
  assert.deepEqual(
    [commodity?.id, commodity?.class, commodity?.type, commodity?.出售价],
    [29000003, '道具', '位面坐标', 250000000],
  );
  assert.equal(commodity.出售价 * 1.2, 300000000);
});

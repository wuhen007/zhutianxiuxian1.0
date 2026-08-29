import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getLocationName, PLACE_LOCATION_MAP } from '../model/weimianTravel.js';

const pluginSource = fs.readFileSync(
  new URL('../apps/SecretPlace/OtherShoreWorld.js', import.meta.url),
  'utf8'
);
const secretPlaceSource = fs.readFileSync(
  new URL('../apps/SecretPlace/SecretPlace.js', import.meta.url),
  'utf8'
);

test('彼岸世界插件注册完整探索入口与前置界律拦截', () => {
  assert.match(pluginSource, /priority:\s*1/);
  assert.match(pluginSource, /进入彼岸世界/);
  assert.match(pluginSource, /彼岸网页/);
  assert.match(pluginSource, /观测大星/);
  assert.match(pluginSource, /远征/);
  assert.match(pluginSource, /探索大星/);
  assert.match(pluginSource, /锚定大星/);
  assert.match(pluginSource, /柠檬堂/);
  assert.match(pluginSource, /无尽商店/);
  assert.match(pluginSource, /选购/);
  assert.match(pluginSource, /服用/);
  assert.match(pluginSource, /guardOtherShoreTransit/);
  assert.match(pluginSource, /遨游时间长河/);
  assert.match(pluginSource, /轮回\|登仙\|证道\|轰击成仙路/);
  assert.match(pluginSource, /Number\(player\?\.power_place\) === OTHER_SHORE_PLANE_ID/);
  assert.match(pluginSource, /pickFriend/);
  assert.match(pluginSource, /ACTION_RECEIPT_LIMIT/);
  assert.match(pluginSource, /其余道痕需由其他修士补全/);
  assert.match(pluginSource, /一键回血/);
});

test('彼岸世界拥有独立位面编号并开启位面配置', () => {
  const planes = JSON.parse(fs.readFileSync(new URL('../resources/data/位面.json', import.meta.url), 'utf8'));
  assert.equal(PLACE_LOCATION_MAP.彼岸世界, 3.8);
  assert.equal(getLocationName(3.8), '彼岸世界');
  assert.equal(planes.彼岸世界, 1);
  assert.match(secretPlaceSource, /threshold\.code === 'sealed'/);
  assert.match(secretPlaceSource, /isSealedLocation\(location\)/);
});

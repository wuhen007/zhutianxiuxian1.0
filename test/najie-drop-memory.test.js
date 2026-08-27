import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  DUNGEON_NAJIE_MEMORY_CHANCE,
  OWN_NAJIE_RECALL_CHANCE,
  discoverNajieDropMemory,
  filterRememberedNajieDrops,
  formatNajieMemoryDiscovery,
  hasNajieDropMemory,
  rememberNajieDrop,
  tryRecallOwnNajieDrop,
} from '../model/najieDropMemory.js';
import { findNearbyNajieDrops } from '../model/najieDropLocation.js';

test('下一世仅按概率记起自己的遗落纳戒且不会重复记录', () => {
  const player = {};
  assert.equal(OWN_NAJIE_RECALL_CHANCE, 0.35);
  assert.equal(tryRecallOwnNajieDrop(player, 'drop:a', () => 0.9), false);
  assert.equal(hasNajieDropMemory(player, 'drop:a'), false);
  assert.equal(tryRecallOwnNajieDrop(player, 'drop:a', () => 0.1), true);
  assert.equal(rememberNajieDrop(player, 'drop:a'), false);
  assert.deepEqual(player.遗落纳戒记忆, ['drop:a']);
});

test('秘境发现只会抽取尚未记起且仍有效的纳戒', async () => {
  const now = 1000;
  const records = new Map([
    ['drop:known', JSON.stringify({ player_name: '故人', expiredTime: 2000, beFound: false })],
    ['drop:broken', '{'],
    ['drop:found', JSON.stringify({ player_name: '已得者', expiredTime: 2000, beFound: true })],
    ['drop:expired', JSON.stringify({ player_name: '旧人', expiredTime: 999, beFound: false })],
    ['drop:new', JSON.stringify({
      player_name: '前世剑主',
      expiredTime: 2000,
      beFound: false,
      location: { weimianName: '遮天位面', x: 88, y: 99 },
    })],
  ]);
  const redis = {
    async zRange() { return [...records.keys()]; },
    async get(key) { return records.get(key); },
  };
  const player = { 遗落纳戒记忆: ['drop:known'] };
  const values = [DUNGEON_NAJIE_MEMORY_CHANCE / 2, 0];
  const discovered = await discoverNajieDropMemory(redis, player, {
    now,
    random: () => values.shift(),
  });

  assert.equal(discovered.key, 'drop:new');
  assert.equal(hasNajieDropMemory(player, 'drop:new'), true);
  assert.match(formatNajieMemoryDiscovery(discovered), /遮天位面坐标\(88, 99\)/);
});

test('残忆索引异常不会中断秘境结算', async () => {
  const player = {};
  const discovered = await discoverNajieDropMemory({
    async zRange() { throw new Error('redis unavailable'); },
  }, player, { random: () => 0 });

  assert.equal(discovered, null);
  assert.equal(player.遗落纳戒记忆, undefined);
});

test('坐标搜索也只显示已掌握记忆的纳戒', () => {
  const drops = [
    { key: 'drop:known', location: { weimianName: '凡间', weimianId: 0, x: 10, y: 10 } },
    { key: 'drop:hidden', location: { weimianName: '凡间', weimianId: 0, x: 10, y: 10 } },
  ];
  const player = {
    power_place: 0,
    凡间坐标: { x: 10, y: 10 },
    遗落纳戒记忆: ['drop:known'],
  };

  assert.deepEqual(filterRememberedNajieDrops(drops, player).map(drop => drop.key), ['drop:known']);
  assert.deepEqual(
    findNearbyNajieDrops(drops, player, 0, drop => hasNajieDropMemory(player, drop.key))
      .map(item => item.drop.key),
    ['drop:known']
  );
});

test('拾取服务先校验记忆，三条秘境结算链路均可发现记忆', () => {
  const rebirth = fs.readFileSync(new URL('../apps/SecretPlace/ZhuanshiTask.js', import.meta.url), 'utf8');
  const pickupStart = rebirth.indexOf('async function pickupNajieDrop');
  const pickupEnd = rebirth.indexOf('function formatLocation', pickupStart);
  assert.ok(pickupStart >= 0 && pickupEnd > pickupStart);
  const pickup = rebirth.slice(pickupStart, pickupEnd);
  assert.ok(pickup.indexOf('hasNajieDropMemory(picker, dropKey)') < pickup.indexOf('checkNajieDropReach'));
  assert.match(rebirth, /dropInfo\.remembered = tryRecallOwnNajieDrop/);
  assert.match(rebirth, /【前尘尽忘】/);

  const normal = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlaceTask.js', import.meta.url), 'utf8');
  const addiction = fs.readFileSync(new URL('../apps/SecretPlace/SecretPlaceplusTask.js', import.meta.url), 'utf8');
  assert.ok((normal.match(/discoverNajieDropMemory\(redis, player\)/g) || []).length >= 2);
  assert.match(addiction, /discoverNajieDropMemory\(redis, player\)/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkNajieDropReach,
  createNajieDropLocation,
  findNearbyNajieDrops,
  getNajieDropPlanes,
  normalizeNajieDropLocation,
} from '../model/najieDropLocation.js';
import {
  getPlayerPlaneCoordinate,
  getPlayerPlaneName,
  setPlayerPlaneCoordinate,
} from '../model/planeCoords.js';

test('纳戒掉落位面直接采用正式位面坐标表', () => {
  assert.deepEqual(
    getNajieDropPlanes().map(plane => [plane.name, plane.id]),
    [
      ['凡间', 0],
      ['仙界', 1],
      ['下界八域', 1.5],
      ['遮天位面', 2],
      ['九天十地', 2.5],
      ['界海', 3],
      ['仙域', 6],
    ]
  );
});

test('玩家在每个位面分别保存坐标并兼容凡间坐标字段', () => {
  const player = { power_place: 0 };
  assert.equal(setPlayerPlaneCoordinate(player, { x: 10, y: 20 }), true);
  assert.deepEqual(player.凡间坐标, { x: 10, y: 20 });

  player.power_place = 2;
  assert.equal(getPlayerPlaneName(player), '遮天位面');
  assert.equal(setPlayerPlaneCoordinate(player, { x: 501, y: 502 }), true);
  assert.deepEqual(getPlayerPlaneCoordinate(player), { x: 501, y: 502 });
  assert.deepEqual(player.凡间坐标, { x: 10, y: 20 });
});

test('新纳戒生成在对应轮回阶段可达的正式坐标内', () => {
  const values = [0.999, 0.123, 0.456];
  let index = 0;
  const location = createNajieDropLocation(6, () => values[index++]);
  assert.deepEqual(location, {
    weimianId: 6,
    weimianName: '仙域',
    x: 123,
    y: 456,
    coordinateVersion: 2,
  });
});

test('旧版虚构位面和超范围坐标会稳定迁移', () => {
  assert.deepEqual(
    normalizeNajieDropLocation({ weimianId: 7, weimianName: '轮回路', x: 20001, y: 50000 }),
    {
      weimianId: 0,
      weimianName: '凡间',
      x: 1,
      y: 0,
      coordinateVersion: 2,
    }
  );
});

test('捡取纳戒必须同时满足同位面和准确坐标', () => {
  const location = { weimianId: 2, weimianName: '遮天位面', x: 500, y: 500 };
  assert.equal(checkNajieDropReach({ power_place: 0, 凡间坐标: { x: 500, y: 500 } }, location).reason, 'plane');
  assert.equal(checkNajieDropReach({ power_place: 2 }, location).reason, 'unset');
  assert.equal(checkNajieDropReach({ power_place: 2, 遮天位面坐标: { x: 499, y: 500 } }, location).reason, 'coordinate');
  assert.equal(checkNajieDropReach({ power_place: 2, 遮天位面坐标: { x: 500, y: 500 } }, location).ok, true);
});

test('附近搜索保留全局领取序号并按距离排序', () => {
  const drops = [
    { key: 'a', location: { weimianName: '仙界', weimianId: 1, x: 0, y: 0 } },
    { key: 'b', location: { weimianName: '凡间', weimianId: 0, x: 12, y: 10 } },
    { key: 'c', location: { weimianName: '凡间', weimianId: 0, x: 11, y: 10 } },
  ];
  const result = findNearbyNajieDrops(drops, {
    power_place: 0,
    凡间坐标: { x: 10, y: 10 },
  }, 5);
  assert.deepEqual(result.map(item => [item.drop.key, item.globalIndex, item.distance]), [
    ['c', 3, 1],
    ['b', 2, 2],
  ]);
});

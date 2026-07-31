import assert from "node:assert/strict";
import test from "node:test";

import {
  createRealmEventLocation,
  formatRealmEventLocation,
  formatRealmEventTravel,
  getRealmEventReach,
} from "../model/realmEventLocation.js";

test("位面事件可落在指定真实地点的坐标范围内", () => {
  const values = [0, 0];
  let index = 0;
  const event = createRealmEventLocation({
    plane: "遮天位面",
    location: "busishan",
    random: () => values[index++],
  });

  assert.deepEqual(event, {
    plane: "遮天位面",
    location: "不死山",
    coordinate: { x: 295, y: 250 },
  });
});

test("位面事件地点同时输出位面、坐标和前往指令", () => {
  const event = {
    plane: "凡间",
    location: "血色禁地",
    coordinate: { x: 200, y: 30 },
  };

  assert.equal(formatRealmEventLocation(event), "凡间·血色禁地（坐标 200,30）");
  assert.equal(
    formatRealmEventTravel(event),
    "先穿梭至凡间，再发送 #前往200,30"
  );
});

test("旧位面事件没有坐标时继续显示原地点", () => {
  assert.equal(
    formatRealmEventLocation({ location: "通天古星禁地" }),
    "通天古星禁地"
  );
  assert.equal(formatRealmEventTravel({ location: "通天古星禁地" }), "");
});

test("玩家必须同时抵达事件位面和精确坐标", () => {
  const event = { plane: "凡间", coordinate: { x: 200, y: 30 } };
  const player = { power_place: 0, 凡间坐标: { x: 200, y: 30 } };

  assert.equal(getRealmEventReach(player, event).ok, true);
  assert.equal(
    getRealmEventReach({ ...player, 凡间坐标: { x: 201, y: 30 } }, event)
      .reason,
    "coordinate"
  );
  assert.equal(
    getRealmEventReach({ ...player, power_place: 1 }, event).reason,
    "plane"
  );
});

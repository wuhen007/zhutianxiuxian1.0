import assert from "node:assert/strict";
import test from "node:test";

import {
  getLastRealmEventWorldYear,
  getRealmEventWorldYear,
  isRealmEventCooldownReady,
} from "../model/realmEventClock.js";

test("位面大事件按世界总年份执行正常冷却", () => {
  const config = {
    enableEvents: true,
    eventCooldown: 2000,
    lastEventWorldYear: 6000,
  };

  assert.equal(isRealmEventCooldownReady(config, 7000, 7000), false);
  assert.equal(isRealmEventCooldownReady(config, 8000, 8000), true);
});

test("旧冷却记录跨时代后可迁移并继续触发", () => {
  const config = {
    enableEvents: true,
    eventCooldown: 2000,
    lastEventTime: 8000,
  };
  const currentWorldYear = getRealmEventWorldYear(1, 0, 1);

  assert.equal(currentWorldYear, 10000);
  assert.equal(
    getRealmEventWorldYear(0, 0, 2) - getRealmEventWorldYear(4, 9000, 1),
    1000
  );
  assert.equal(getLastRealmEventWorldYear(config, currentWorldYear, 0), 8000);
  assert.equal(isRealmEventCooldownReady(config, currentWorldYear, 0), true);
});

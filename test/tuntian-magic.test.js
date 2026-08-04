import assert from "node:assert/strict";
import test from "node:test";

import {
  SAINT_REMAINS_COOLDOWN_MS,
  TUNTIAN_SOURCE_TARGET,
  absorbTuntianSource,
  attemptSaintRemains,
  getTuntianEligibility,
} from "../model/tuntianMagic.js";

function makeDevourer(extra = {}) {
  return {
    灵根: {
      id: 7010015,
      name: "魔胎仙体",
      type: "魔胎",
      eff: 300,
      法球倍率: 8,
      攻击: 5,
      防御: 2,
      生命: 3,
      生命本源: 150,
    },
    学习的功法: ["吞天魔功"],
    魔道值: 0,
    生命本源: 150,
    ...extra,
  };
}

test("吞天本源仅供吞天魔功的魔胎仙体吸收", () => {
  assert.equal(getTuntianEligibility(makeDevourer()).ok, true);
  assert.equal(
    getTuntianEligibility(makeDevourer({ 学习的功法: [] })).ok,
    false
  );
  assert.equal(
    getTuntianEligibility(makeDevourer({ 灵根: { name: "荒古圣体" } })).ok,
    false
  );
});

test("吞噬十份本源后蜕变混沌体且不会降低原有高倍率", () => {
  const player = makeDevourer();
  let result;
  for (let count = 1; count <= TUNTIAN_SOURCE_TARGET; count++) {
    result = absorbTuntianSource(
      player,
      { 类型: "天骄本源", 目标: `天骄${count}` },
      count
    );
  }

  assert.equal(result.evolved, true);
  assert.equal(player.吞天魔功修炼.本源, 10);
  assert.equal(player.吞天魔功修炼.吞噬记录.length, 10);
  assert.equal(player.灵根.name, "混沌体");
  assert.equal(player.灵根.type, "混沌体");
  assert.equal(player.灵根.eff, 300);
  assert.equal(player.灵根.法球倍率, 8);
  assert.deepEqual(
    [player.灵根.攻击, player.灵根.防御, player.灵根.生命],
    [5, 5, 5]
  );
  assert.equal(player.生命本源, 200);
  assert.equal(player.魔道值, 200);
});

test("圣地遗骸每日仅尝试一次且成功后增加一份本源", () => {
  const now = 1_000_000_000;
  const player = makeDevourer();
  const failed = attemptSaintRemains(player, "摇光圣地", {
    now,
    random: () => 0.5,
  });
  assert.equal(failed.attempted, true);
  assert.equal(failed.success, false);

  const cooling = attemptSaintRemains(player, "姬家", {
    now: now + 1,
    random: () => 0,
  });
  assert.equal(cooling.attempted, false);
  assert.equal(cooling.waitMs, SAINT_REMAINS_COOLDOWN_MS - 1);

  const succeeded = attemptSaintRemains(player, "姬家", {
    now: now + SAINT_REMAINS_COOLDOWN_MS,
    random: () => 0,
  });
  assert.equal(succeeded.success, true);
  assert.equal(succeeded.count, 1);
  assert.equal(player.吞天魔功修炼.吞噬记录[0].目标, "姬家先贤遗骸");
});

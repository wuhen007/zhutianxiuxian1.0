import assert from "node:assert/strict";
import test from "node:test";
import {
  OTHER_SHORE_SUPPRESSION_MULTIPLIER,
  OTHER_SHORE_WORLD_RESTRICTIONS,
  calculateOtherShoreMindCost,
  getOtherShoreSuppression,
  getOtherShoreTravelTier,
  isOtherShoreExternalActionAllowed,
  isOtherShoreSuppressionImmune,
} from "../model/otherShoreRules.js";
import {
  OTHER_SHORE_KEY_STARS,
  anchorOtherShoreStar,
  calculateOtherShoreTravel,
  clearOtherShoreCampaignStar,
  clearOtherShoreStar,
  contributeOtherShoreExploration,
  createOtherShoreWorld,
  findOtherShoreShortestPath,
  getOtherShoreHexDistance,
  getOtherShoreNeighbors,
  observeOtherShoreStars,
  serializeOtherShoreWorld,
  visitOtherShoreStar,
} from "../model/otherShoreWorld.js";

test("半径4的沧澜界生成61颗大星，其中13颗为手工关键星", () => {
  const world = createOtherShoreWorld("count-seed");
  assert.equal(world.stars.length, 61);
  assert.equal(OTHER_SHORE_KEY_STARS.length, 13);
  assert.equal(world.stars.filter((star) => star.keyStar).length, 13);
  const furnace = world.stars.find((star) => star.id === "1,-1");
  assert.equal(furnace.name, "玄阙神炉");
  assert.equal(furnace.keyStar, true);
  assert.equal(world.stars.find((star) => star.id === "1,2").name, "太初熔星");

  const view = serializeOtherShoreWorld(world);
  const center = view.stars.find((star) => star.id === "0,0");
  assert.equal(center.discovered, true);
  assert.equal(center.anchored, true);
  assert.equal(center.phase, "anchored");
  assert.equal(view.stars.filter((star) => star.discovered).length, 1);
});

test("固定池生成对同一seed稳定，不同seed会改变普通星", () => {
  const first = createOtherShoreWorld("stable-seed");
  const second = createOtherShoreWorld("stable-seed");
  const different = createOtherShoreWorld("different-seed");
  assert.deepEqual(first, second);
  assert.notDeepEqual(
    first.stars.filter((star) => !star.keyStar),
    different.stars.filter((star) => !star.keyStar)
  );
  assert.deepEqual(
    first.stars.filter((star) => star.keyStar),
    different.stars.filter((star) => star.keyStar)
  );
});

test("六边图全图连通，六邻居与最短路径符合轴坐标距离", () => {
  const world = createOtherShoreWorld("path-seed");
  assert.equal(getOtherShoreNeighbors(world, "0,0").length, 6);
  assert.equal(getOtherShoreNeighbors(world, "4,0").length, 3);

  for (const star of world.stars) {
    const path = findOtherShoreShortestPath(world, "0,0", star.id);
    assert.ok(path, `${star.id} 应从中心可达`);
    assert.equal(path.length - 1, getOtherShoreHexDistance("0,0", star.id));
  }
});

test("观测、踏足、贡献、锚定与完成只向前推进共享阶段", () => {
  const initial = createOtherShoreWorld("phase-seed");
  const observed = observeOtherShoreStars(initial, "0,0", 1);
  const target = getOtherShoreNeighbors(observed, "0,0")[0];
  assert.equal(initial.states[target.id].phase, "unobserved");
  assert.equal(observed.states[target.id].phase, "sensed");

  const visited = visitOtherShoreStar(observed, target.id);
  let contributed = visited;
  for (let index = 0; index < target.anchorRequirement; index++) {
    contributed = contributeOtherShoreExploration(
      contributed,
      target.id,
      `player-${index}`,
      1
    );
  }
  const capped = contributeOtherShoreExploration(
    contributed,
    target.id,
    "player-0",
    1
  );
  const anchored = anchorOtherShoreStar(contributed, target.id);
  const cleared = clearOtherShoreStar(anchored, target.id);
  assert.equal(visited.states[target.id].phase, "visited");
  assert.equal(
    contributed.states[target.id].contributors["player-0"],
    1
  );
  assert.equal(capped, contributed);
  assert.equal(anchored.states[target.id].phase, "anchored");
  assert.equal(cleared.states[target.id].phase, "cleared");
  assert.equal(observed.states[target.id].phase, "sensed");
});

test("旧版已踏足远征在首领伏诛后自动补足道标并彻查", () => {
  const initial = observeOtherShoreStars(createOtherShoreWorld("legacy-run"), "0,0", 1);
  const target = getOtherShoreNeighbors(initial, "0,0")[0];
  const visited = visitOtherShoreStar(initial, target.id);
  const cleared = clearOtherShoreCampaignStar(visited, target.id);

  assert.equal(cleared.states[target.id].phase, "cleared");
  assert.equal(cleared.states[target.id].contribution, target.anchorRequirement);
  assert.equal(visited.states[target.id].phase, "visited");
});

test("心神计费匹配六个境界档位并持久保留不足一点的路程", () => {
  assert.equal(calculateOtherShoreMindCost("圣人", 2).cost, 10);
  assert.equal(calculateOtherShoreMindCost("大帝", 2).cost, 2);
  assert.deepEqual(calculateOtherShoreMindCost("真仙", 1), {
    tier: "true_immortal",
    name: "真仙",
    mindPerStep: 1,
    stepsPerMind: 2,
    unanchoredSteps: 1,
    cost: 0,
    remainder: 1,
  });
  assert.deepEqual(calculateOtherShoreMindCost("真仙", 1, 1), {
    tier: "true_immortal",
    name: "真仙",
    mindPerStep: 1,
    stepsPerMind: 2,
    unanchoredSteps: 1,
    cost: 1,
    remainder: 0,
  });
  assert.equal(calculateOtherShoreMindCost("仙王巨头", 3).cost, 1);
  assert.equal(calculateOtherShoreMindCost("准仙帝", 10).cost, 1);
  assert.equal(calculateOtherShoreMindCost("路尽级仙帝", 61).cost, 0);
});

test("三套额外体系按真实境界表进入心神移动档位", () => {
  assert.equal(getOtherShoreTravelTier({ mijinglevel_id: 18 }), "immortal_king");
  assert.equal(getOtherShoreTravelTier({ mijinglevel_id: 20 }), "quasi_immortal_emperor");
  assert.equal(getOtherShoreTravelTier({ mijinglevel_id: 21 }), "immortal_emperor");

  assert.equal(getOtherShoreTravelTier({ xiangulevel_id: 17 }), "immortal_king");
  assert.equal(getOtherShoreTravelTier({ xiangulevel_id: 20 }), "immortal_king");
  assert.equal(getOtherShoreTravelTier({ xiangulevel_id: 21 }), "quasi_immortal_emperor");
  assert.equal(getOtherShoreTravelTier({ xiangulevel_id: 22 }), "immortal_emperor");

  assert.equal(getOtherShoreTravelTier({ huafenlevel_id: 19 }), "immortal_king");
  assert.equal(getOtherShoreTravelTier({ huafenlevel_id: 21 }), "quasi_immortal_emperor");
  assert.equal(getOtherShoreTravelTier({ huafenlevel_id: 22 }), "immortal_emperor");
});

test("只有路径中进入的未锚定星辰收取心神", () => {
  let world = createOtherShoreWorld("travel-seed");
  const path = findOtherShoreShortestPath(world, "0,0", "2,0");
  world = observeOtherShoreStars(world, "0,0", 2);
  const firstTarget = world.stars.find((star) => star.id === path[1]);
  world = visitOtherShoreStar(world, firstTarget.id);
  for (let index = 0; index < firstTarget.anchorRequirement; index++) {
    world = contributeOtherShoreExploration(
      world,
      firstTarget.id,
      `player-${index}`,
      1
    );
  }
  world = anchorOtherShoreStar(world, firstTarget.id);

  const travel = calculateOtherShoreTravel(world, path, "大帝");
  assert.equal(travel.totalSteps, 2);
  assert.equal(travel.anchoredSteps, 1);
  assert.equal(travel.unanchoredSteps, 1);
  assert.equal(travel.cost, 1);
});

test("压制默认0.7，正式以身为种与自创体系免疫，旧字段仅在正式标记缺失时兜底", () => {
  assert.equal(OTHER_SHORE_SUPPRESSION_MULTIPLIER, 0.7);
  assert.deepEqual(getOtherShoreSuppression({}), {
    immune: false,
    attributeMultiplier: 0.7,
    techniqueEffectMultiplier: 0.7,
  });
  assert.equal(
    isOtherShoreSuppressionImmune({ xiangu_yishenweizhong: true }),
    true
  );
  assert.equal(
    isOtherShoreSuppressionImmune({ 自创修炼体系: { name: "万象天" } }),
    true
  );
  assert.equal(isOtherShoreSuppressionImmune({ xianggulevel_id: 12 }), true);
  assert.equal(
    isOtherShoreSuppressionImmune({
      xiangu_yishenweizhong: false,
      xiangulevel_id: 99,
    }),
    false
  );
});

test("世界规则声明禁用外部商店与丹药回血", () => {
  assert.deepEqual(OTHER_SHORE_WORLD_RESTRICTIONS, {
    externalShop: false,
    externalPillHealing: false,
  });
  assert.equal(isOtherShoreExternalActionAllowed("externalShop"), false);
  assert.equal(isOtherShoreExternalActionAllowed("externalPillHealing"), false);
});

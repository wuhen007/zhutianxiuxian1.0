import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  REFINEMENT_COOLDOWN_MS,
  SAME_TARGET_COOLDOWN_MS,
  TIANMO_HUASHENG_TECHNIQUE,
  WANHUA_TIANMO_PHYSIQUE,
  applyTianmoRefinement,
  calculateEssenceTransfer,
  createTianmoTrialOpponent,
  getRefinementAvailability,
  grantTianmoHuashengTechnique,
} from "../model/tianmoHuasheng.js";

function makeTianmo(extra = {}) {
  return {
    id: "demon",
    灵根: {
      name: "极道天魔",
      type: "天魔",
      eff: 2,
      法球倍率: 2,
      攻击: 3,
      防御: 2,
      生命: 2,
      生命本源: 50,
    },
    学习的功法: [TIANMO_HUASHENG_TECHNIQUE],
    仙道潜力: 0,
    修为: 0,
    血气: 0,
    寿元: 10,
    生命本源: 100,
    ...extra,
  };
}

function makeTarget(extra = {}) {
  return {
    id: "target",
    仙道潜力: 9,
    修为: 1000,
    血气: 500,
    寿元: 101,
    生命本源: 51,
    ...extra,
  };
}

test("万化天魔传承只授予极道天魔且不会重复学习", () => {
  const player = makeTianmo({ 学习的功法: [] });
  assert.equal(grantTianmoHuashengTechnique(player, 1000), true);
  assert.deepEqual(player.学习的功法, [TIANMO_HUASHENG_TECHNIQUE]);
  assert.equal(player.天魔化生.传承时间, 1000);
  assert.equal(grantTianmoHuashengTechnique(player, 2000), false);

  const ordinary = { 灵根: { name: "命运神道体" }, 学习的功法: [] };
  assert.equal(grantTianmoHuashengTechnique(ordinary), false);
});

test("万灵怨胎按挑战者战力生成且不会继承功法", () => {
  const player = makeTianmo({
    攻击: 1000,
    防御: 800,
    血量上限: 10000,
    当前血量: 5000,
  });
  const opponent = createTianmoTrialOpponent(player);

  assert.equal(opponent.id, undefined);
  assert.equal(opponent.名号, "万灵怨胎");
  assert.equal(opponent.攻击, 800);
  assert.equal(opponent.防御, 600);
  assert.equal(opponent.当前血量, 9000);
  assert.equal(opponent.法球倍率, 1.5);
  assert.deepEqual(opponent.学习的功法, []);
  assert.deepEqual(player.学习的功法, [TIANMO_HUASHENG_TECHNIQUE]);
});

test("炼化按潜力50%、其余10%真实转移并保留最低本源", () => {
  const executor = makeTianmo();
  const target = makeTarget();
  const expected = calculateEssenceTransfer(target);
  assert.deepEqual(expected, {
    仙道潜力: 4,
    修为: 100,
    血气: 50,
    寿元: 10,
    生命本源: 5,
  });

  const result = applyTianmoRefinement(executor, target, {
    now: 1000,
    targetId: "target",
  });
  assert.deepEqual(result.transfer, expected);
  assert.equal(executor.修为, 100);
  assert.equal(target.修为, 900);
  assert.equal(executor.灵根.法球倍率, 2.1);
  assert.equal(executor.灵根.攻击, 3.05);
  assert.equal(executor.灵根.防御, 2.05);
  assert.equal(executor.灵根.生命, 2.05);
  assert.equal(target.天魔炼化保护至, 1000 + SAME_TARGET_COOLDOWN_MS);

  const exhausted = calculateEssenceTransfer(
    makeTarget({ 寿元: 1, 生命本源: 1 })
  );
  assert.equal(exhausted.寿元, 0);
  assert.equal(exhausted.生命本源, 0);
});

test("达到500%法球倍率时蜕变为无相万化天魔体", () => {
  const executor = makeTianmo();
  executor.灵根.法球倍率 = 4.9;
  executor.灵根.攻击 = 4.45;
  executor.灵根.防御 = 3.45;
  executor.灵根.生命 = 3.45;

  const result = applyTianmoRefinement(executor, makeTarget(), {
    now: 1000,
    targetId: "target",
  });
  assert.equal(result.evolved, true);
  assert.equal(executor.灵根.name, WANHUA_TIANMO_PHYSIQUE);
  assert.equal(executor.灵根.法球倍率, 5);
  assert.equal(executor.灵根.攻击, 8);
  assert.equal(executor.灵根.防御, 3.5);
  assert.equal(executor.灵根.生命, 8);
  assert.equal(executor.生命本源, 155);
  assert.equal(executor.天魔化生.已蜕变, true);
});

test("功法、体质与两类灵根技能均已登记到静态数据", () => {
  const dataUrl = new URL("../resources/data/item/", import.meta.url);
  const readJson = (relativePath) =>
    JSON.parse(fs.readFileSync(new URL(relativePath, dataUrl), "utf8"));
  const techniques = readJson("功法列表.json");
  const physiques = readJson("灵根列表.json");
  const attacks = readJson("技能组/攻击技能.json");
  const amplifications = readJson("技能组/灵根增幅技能.json");

  assert.ok(techniques.some((item) => item.name === TIANMO_HUASHENG_TECHNIQUE));
  const physique = physiques.find(
    (item) => item.name === WANHUA_TIANMO_PHYSIQUE
  );
  assert.equal(physique.法球倍率, 5);
  assert.deepEqual([physique.攻击, physique.防御, physique.生命], [8, 3.5, 8]);
  assert.ok(attacks.some((item) => item.name === WANHUA_TIANMO_PHYSIQUE));
  assert.ok(
    amplifications.some((item) => item.name === WANHUA_TIANMO_PHYSIQUE)
  );
});

test("炼化受24小时全局冷却与7天同目标保护", () => {
  const now = 1_000_000_000;
  const executor = makeTianmo({
    天魔化生: {
      上次炼化: now - REFINEMENT_COOLDOWN_MS + 1,
      炼化记录: {},
    },
  });
  let state = getRefinementAvailability(executor, "a", now);
  assert.equal(state.ok, false);
  assert.equal(state.waitMs, 1);

  executor.天魔化生.上次炼化 = now - REFINEMENT_COOLDOWN_MS;
  executor.天魔化生.炼化记录.a = now - SAME_TARGET_COOLDOWN_MS + 1;
  state = getRefinementAvailability(executor, "a", now);
  assert.equal(state.ok, false);
  assert.equal(state.waitMs, 1);
  assert.equal(getRefinementAvailability(executor, "b", now).ok, true);

  const protectedTarget = { 天魔炼化保护至: now + 5000 };
  state = getRefinementAvailability(executor, "b", now, protectedTarget);
  assert.equal(state.ok, false);
  assert.equal(state.waitMs, 5000);
});

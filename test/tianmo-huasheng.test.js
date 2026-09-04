import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  REFINEMENT_COOLDOWN_MS,
  SAME_TARGET_COOLDOWN_MS,
  TIANMO_HUASHENG_TECHNIQUE,
  WANHUA_TIANMO_ROOT,
  WANHUA_TIANMO_PHYSIQUE,
  applyTianmoCalamityRefinement,
  applyTianmoRefinement,
  calculateEssenceTransfer,
  createTianmoTrialOpponent,
  ensureTianmoHuashengState,
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
      生命本源: 150,
    },
    学习的功法: [TIANMO_HUASHENG_TECHNIQUE],
    仙道潜力: 0,
    修为: 0,
    血气: 0,
    寿元: 10,
    生命本源: 250,
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

test("炼化按潜力/修为/血气/本源20%、寿元10%真实转移并保留最低本源与小数", () => {
  const executor = makeTianmo();
  const target = makeTarget({ 生命本源: 51.5 });
  const expected = calculateEssenceTransfer(target);
  assert.deepEqual(expected, {
    仙道潜力: 1,
    修为: 200,
    血气: 100,
    寿元: 10,
    生命本源: 10,
  });

  const result = applyTianmoRefinement(executor, target, {
    now: 1000,
    targetId: "target",
  });
  assert.deepEqual(result.transfer, expected);
  assert.equal(executor.修为, 200);
  assert.equal(target.修为, 800);
  assert.equal(executor.灵根.法球倍率, 2.1);
  assert.equal(executor.灵根.攻击, 3.05);
  assert.equal(executor.灵根.防御, 2.05);
  assert.equal(executor.灵根.生命, 2.05);
  assert.equal(executor.生命本源, 260);
  assert.equal(target.生命本源, 41.5);
  assert.equal(target.天魔炼化保护至, 1000 + SAME_TARGET_COOLDOWN_MS);

  const exhausted = calculateEssenceTransfer(
    makeTarget({ 寿元: 1, 生命本源: 1 })
  );
  assert.equal(exhausted.寿元, 0);
  assert.equal(exhausted.生命本源, 0);
});

test("十次灾厄炼化折算一次玩家炼化并实际增加生命本源", () => {
  const executor = makeTianmo();
  for (let index = 0; index < 10; index++) {
    assert.equal(applyTianmoCalamityRefinement(executor, {
      now: 1000 + index,
      sourceLifeEssence: 51,
    }).applied, true);
  }

  assert.equal(executor.天魔化生.炼化次数, 1);
  assert.equal(executor.天魔化生.灾厄炼化次数, 10);
  assert.equal(executor.生命本源, 260);
  assert.equal(executor.天魔化生.累计所得.生命本源, 10);
  assert.equal(executor.灵根.法球倍率, 2.1);
  assert.deepEqual(
    [executor.灵根.攻击, executor.灵根.防御, executor.灵根.生命],
    [3.05, 2.05, 2.05]
  );
});

test("灾厄魔主炼化按0.5名玩家计入化生进度", () => {
  const executor = makeTianmo();
  const result = applyTianmoCalamityRefinement(executor, {
    now: 1000,
    sourceLifeEssence: 51,
    weight: 0.5,
  });

  assert.equal(result.applied, true);
  assert.equal(result.refinementWeight, 0.5);
  assert.equal(executor.天魔化生.炼化次数, 0.5);
  assert.equal(executor.天魔化生.灾厄炼化次数, 1);
  assert.equal(executor.生命本源, 255);
  assert.equal(executor.灵根.法球倍率, 2.05);
  assert.deepEqual(
    [executor.灵根.攻击, executor.灵根.防御, executor.灵根.生命],
    [3.025, 2.025, 2.025]
  );

  applyTianmoRefinement(executor, makeTarget(), { now: 2000, targetId: "next" });
  assert.equal(executor.生命本源, 265);
  assert.equal(executor.天魔化生.累计所得.生命本源, 15);
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
  assert.equal(executor.灵根.生命本源, 500);
  assert.equal(executor.生命本源, 610);
  assert.equal(executor.天魔化生.已蜕变, true);
});

test("灵根攻防生封顶自身灵根1.5倍，生命本源封顶灵根本源2倍且不回退", () => {
  // 极道天魔 caps：攻击 3×1.5=4.5 / 防御 2×1.5=3 / 生命 2×1.5=3；本源 150×2=300
  const capExecutor = makeTianmo({
    灵根: { ...makeTianmo().灵根, 攻击: 4.5, 防御: 3, 生命: 3 },
  });
  const capped = applyTianmoRefinement(capExecutor, makeTarget(), {
    now: 5000,
    targetId: "rich",
  });
  assert.equal(capped.applied, true);
  assert.equal(capped.attributeCapped, true);
  assert.deepEqual(
    [capExecutor.灵根.攻击, capExecutor.灵根.防御, capExecutor.灵根.生命],
    [4.5, 3, 3]
  );

  // 生命本源满 300 后不再入账，但目标仍被完整抽取
  const fullExecutor = makeTianmo({ 生命本源: 300 });
  const victim = makeTarget();
  const full = applyTianmoRefinement(fullExecutor, victim, {
    now: 6000,
    targetId: "victim",
  });
  assert.equal(full.lifeSourceCapped, true);
  assert.equal(full.transfer.生命本源, 0);
  assert.equal(fullExecutor.生命本源, 300);
  assert.equal(victim.生命本源, 41);

  // 灾厄/魔主炼化同样封顶
  const calamity = applyTianmoCalamityRefinement(fullExecutor, {
    now: 7000,
    sourceLifeEssence: 51,
  });
  assert.equal(calamity.lifeSourceGain, 0);
  assert.equal(calamity.lifeSourceCapped, true);
  assert.equal(fullExecutor.生命本源, 300);
});

test("灾厄炼化本源只入账上限内剩余部分", () => {
  const executor = makeTianmo({ 生命本源: 295 });
  const result = applyTianmoCalamityRefinement(executor, {
    now: 1000,
    sourceLifeEssence: 51,
  });
  assert.equal(result.lifeSourceGain, 1);
  assert.equal(executor.生命本源, 296);
  const result2 = applyTianmoCalamityRefinement(executor, {
    now: 1001,
    sourceLifeEssence: 51,
  });
  assert.equal(result2.lifeSourceGain, 1);
  assert.equal(executor.生命本源, 297);
});

test("装载诸天化身时两类天魔炼化都不会改变灵根或目标", () => {
  const executor = makeTianmo({
    诸天镜系统: { 当前化身: "鹿目圆" },
  });
  const target = makeTarget();
  const originalExecutor = structuredClone(executor);
  const originalTarget = structuredClone(target);

  const playerResult = applyTianmoRefinement(executor, target, {
    now: 1000,
    targetId: "target",
  });
  const calamityResult = applyTianmoCalamityRefinement(executor, {
    now: 1000,
    sourceLifeEssence: 100,
  });

  assert.equal(getRefinementAvailability(executor, "target", 1000).reason, "avatar_loaded");
  assert.equal(playerResult.reason, "avatar_loaded");
  assert.equal(calamityResult.reason, "avatar_loaded");
  assert.deepEqual(executor, originalExecutor);
  assert.deepEqual(target, originalTarget);
});

test("旧极道与无相存档补齐本源差额且不会重复叠加", () => {
  const legacyJidao = makeTianmo({
    灵根: { ...makeTianmo().灵根, 生命本源: 50 },
    生命本源: 150,
  });
  ensureTianmoHuashengState(legacyJidao);
  assert.equal(legacyJidao.灵根.生命本源, 150);
  assert.equal(legacyJidao.生命本源, 250);

  const legacyWanhua = {
    灵根: { ...WANHUA_TIANMO_ROOT, 生命本源: 100 },
    生命本源: 205,
    天魔化生: { 累计所得: { 生命本源: 5 } },
  };
  ensureTianmoHuashengState(legacyWanhua);
  assert.equal(legacyWanhua.灵根.生命本源, 500);
  assert.equal(legacyWanhua.生命本源, 605);
  ensureTianmoHuashengState(legacyWanhua);
  assert.equal(legacyWanhua.生命本源, 605);

  const syncedWanhua = {
    灵根: { ...WANHUA_TIANMO_ROOT },
    生命本源: 280,
  };
  ensureTianmoHuashengState(syncedWanhua, { extraLifeSource: 100 });
  assert.equal(syncedWanhua.灵根.生命本源, 500);
  assert.equal(syncedWanhua.生命本源, 680);
  ensureTianmoHuashengState(syncedWanhua, { extraLifeSource: 100 });
  assert.equal(syncedWanhua.生命本源, 680);

  const damagedSyncedWanhua = {
    灵根: { ...WANHUA_TIANMO_ROOT },
    生命本源: 150,
  };
  ensureTianmoHuashengState(damagedSyncedWanhua);
  assert.equal(damagedSyncedWanhua.生命本源, 550);

  const aboveLegacyThreshold = {
    灵根: { ...WANHUA_TIANMO_ROOT },
    生命本源: 250,
  };
  ensureTianmoHuashengState(aboveLegacyThreshold);
  assert.equal(aboveLegacyThreshold.生命本源, 250);
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
  assert.equal(physique.生命本源, WANHUA_TIANMO_ROOT.生命本源);
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

test("天魔化生与生命本源救赎模块可以完整装载", () => {
  const script = `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    const tianmo = await import('./plugins/zhutianxiuxian1.0/apps/motou/TianmoHuasheng.js');
    const rescue = await import('./plugins/zhutianxiuxian1.0/apps/zhutianjing/mofashaonv.js');
    if (typeof tianmo.TianmoHuasheng !== 'function') process.exit(1);
    if (typeof rescue.mofashaonv !== 'function') process.exit(1);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("自救写回会保留目标修复结果", () => {
  const source = fs.readFileSync(
    new URL("../apps/zhutianjing/mofashaonv.js", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("async executeRescue(");
  const end = source.indexOf("/** 解放天牢 */", start);
  assert.ok(start >= 0 && end > start, "executeRescue block should remain discoverable");

  const block = source.slice(start, end);
  const refresh = block.indexOf(
    "const updatedCaster = isSelf ? await Read_player(casterQQ) : caster;"
  );
  const deduct = block.indexOf(
    "updatedCaster.希望系统.希望碎片 = Math.max("
  );
  const write = block.indexOf("await Write_player(casterQQ, updatedCaster);");

  assert.ok(refresh >= 0, "self rescue should refresh the persisted player state");
  assert.ok(refresh < deduct, "cost should be applied after the refresh");
  assert.ok(deduct < write, "the merged state should be written after accounting");
});

test("修复指令会在满值早退前持久化天魔本源迁移", () => {
  const source = fs.readFileSync(
    new URL("../apps/User/UserHome.js", import.meta.url),
    "utf8"
  );
  const start = source.indexOf("async shengmingbenyuan(");
  const end = source.indexOf("async repairDaoshang(", start);
  assert.ok(start >= 0 && end > start, "life-source repair block should remain discoverable");

  const block = source.slice(start, end);
  const persist = block.indexOf("await Write_player(usr_qq, player);");
  const earlyExit = block.indexOf("if (player.生命本源 >= maxLifeBase)");
  assert.ok(persist >= 0, "repair should persist migrated player data");
  assert.ok(persist < earlyExit, "migration persistence should precede the full-value early exit");
});

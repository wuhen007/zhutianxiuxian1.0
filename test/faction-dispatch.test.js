import assert from "node:assert/strict";
import test from "node:test";

import {
  DISPATCH_MINUTES_PER_COUNT,
  DISPATCH_RECEIPT_FIELD,
  applyDispatchRewardsOnce,
  createDispatchTask,
  generateDispatchRewards,
  getDispatchState,
  getFactionDispatchAuthority,
  parseDispatchRequest,
  prepareDispatchCostDeduction,
} from "../model/factionDispatch.js";

const dungeon = {
  id: 5200,
  name: "大千世界",
  Price: 1000,
  one: [{ name: "矿渣", class: "道具", id: 1 }],
  two: [{ name: "碎矿", class: "道具", id: 2 }],
  three: [{ name: "金矿", class: "道具", id: 3 }],
};

function emptyNajie(items = []) {
  return {
    等级: 1,
    灵石: 0,
    源石: 0,
    装备: [],
    丹药: [],
    道具: items,
    功法: [],
    草药: [],
    材料: [],
    食材: [],
    盒子: [],
    仙宠: [],
    仙宠口粮: [],
    宝石: [],
  };
}

test("只有最高势力职位或长老职位拥有派遣权", () => {
  assert.equal(
    getFactionDispatchAuthority({ 势力: "瑶池", 势力职位: "圣女" }).ok,
    true
  );
  assert.equal(
    getFactionDispatchAuthority({ 势力: "摇光圣地", 势力职位: "圣子" }).ok,
    true
  );
  assert.equal(
    getFactionDispatchAuthority({ 势力: "剑云海", 势力职位: "传人" }).ok,
    true
  );
  assert.equal(
    getFactionDispatchAuthority({ 势力: "瑶池", 势力职位: "长老" }).ok,
    true
  );
  assert.equal(
    getFactionDispatchAuthority({ 势力: "摇光圣地", 势力职位: "真传弟子" }).ok,
    false
  );
});

test("派遣指令支持默认一次和指定次数", () => {
  assert.deepEqual(parseDispatchRequest("#派遣势力弟子大千世界*3"), {
    dungeonName: "大千世界",
    count: 3,
  });
  assert.deepEqual(parseDispatchRequest("#派遣弟子 大千世界"), {
    dungeonName: "大千世界",
    count: 1,
  });
});

test("每次派遣生成三次掉落并降低稀有奖励概率", () => {
  const values = [0.01, 0.1, 0.9];
  const rewards = generateDispatchRewards(dungeon, 1, () => values.shift());

  assert.deepEqual(
    rewards.map((item) => [item.name, item.tier, item.count]),
    [
      ["金矿", "稀有", 1],
      ["碎矿", "良品", 1],
      ["矿渣", "普通", 1],
    ]
  );
});

test("任务独立记录时间、消耗和预生成奖励", () => {
  const now = 1000;
  const task = createDispatchTask({
    player: { 势力: "摇光圣地", 势力职位: "圣女" },
    dungeon,
    count: 2,
    now,
    id: "job-1",
    random: () => 0.9,
  });

  assert.equal(task.id, "job-1");
  assert.equal(task.costs.灵石, 6000);
  assert.equal(task.costs.打工券, 2);
  assert.equal(task.costs.秘境之匙, 2);
  assert.equal(task.endAt, now + 2 * DISPATCH_MINUTES_PER_COUNT * 60 * 1000);
  assert.equal(task.rewards[0].name, "矿渣");
  assert.equal(task.rewards[0].count, 6);
  assert.equal(getDispatchState(task, task.endAt - 1), "running");
  assert.equal(getDispatchState(task, task.endAt), "ready");
});

test("超过次数上限或选择未开放副本时不能创建任务", () => {
  const player = { 势力: "瑶池", 势力职位: "圣女" };

  assert.throws(
    () => createDispatchTask({ player, dungeon, count: 13 }),
    /派遣次数必须在1-12之间/
  );
  assert.throws(
    () =>
      createDispatchTask({
        player,
        dungeon: { ...dungeon, name: "永恒海" },
        count: 1,
      }),
    /当前不能派遣弟子前往永恒海/
  );
});

test("扣费校验成功后不修改传入的玩家和纳戒对象", () => {
  const player = { 灵石: 10000 };
  const najie = emptyNajie([
    { name: "打工券", 数量: 3 },
    { name: "秘境之匙", 数量: 4 },
  ]);
  const result = prepareDispatchCostDeduction(player, najie, {
    灵石: 6000,
    打工券: 2,
    秘境之匙: 2,
  });

  assert.equal(result.ok, true);
  assert.equal(result.player.灵石, 4000);
  assert.equal(
    result.najie.道具.find((item) => item.name === "打工券").数量,
    1
  );
  assert.equal(
    result.najie.道具.find((item) => item.name === "秘境之匙").数量,
    2
  );
  assert.equal(player.灵石, 10000);
  assert.equal(najie.道具[0].数量, 3);
});

test("任一派遣资源不足时不会产生部分扣款结果", () => {
  const player = { 灵石: 10000 };
  const najie = emptyNajie([
    { name: "打工券", 数量: 2 },
    { name: "秘境之匙", 数量: 1 },
  ]);
  const snapshot = structuredClone(najie);
  const result = prepareDispatchCostDeduction(player, najie, {
    灵石: 6000,
    打工券: 2,
    秘境之匙: 2,
  });

  assert.equal(result.ok, false);
  assert.match(result.message, /秘境之匙不足/);
  assert.equal(player.灵石, 10000);
  assert.deepEqual(najie, snapshot);
});

test("同一任务奖励凭结算记录只能写入一次", () => {
  const task = {
    id: "job-once",
    rewards: [
      {
        name: "矿渣",
        class: "道具",
        count: 3,
        item: { name: "矿渣", class: "道具", id: 1 },
      },
    ],
  };
  const first = applyDispatchRewardsOnce(
    emptyNajie([{ name: "矿渣", 数量: 2 }]),
    task
  );
  const second = applyDispatchRewardsOnce(first.najie, task);

  assert.equal(first.alreadyClaimed, false);
  assert.equal(first.najie.道具[0].数量, 5);
  assert.deepEqual(first.najie[DISPATCH_RECEIPT_FIELD], ["job-once"]);
  assert.equal(second.alreadyClaimed, true);
  assert.equal(second.najie.道具[0].数量, 5);
});

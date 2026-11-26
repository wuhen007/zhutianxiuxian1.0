import assert from "node:assert/strict";
import test from "node:test";
import {
  RED_DUST_LIVES,
  RED_DUST_VOWS,
  createRedDustPath,
  formatRedDustProgress,
  getRedDustDaoFruit,
  getRedDustLifeInfo,
  getRedDustVow,
} from "../model/redDustPath.js";

test("红尘仙路按现有九种心魔生成九世命题", () => {
  assert.equal(RED_DUST_LIVES.length, 9);
  assert.equal(RED_DUST_LIVES[0].demon, "旧我执念");
  assert.equal(RED_DUST_LIVES[8].demon, "天地牢笼");
  assert.equal(getRedDustLifeInfo(0).life, 1);
  assert.equal(getRedDustLifeInfo(99).life, 9);
});

test("三种世愿可被解析并携带不同代价", () => {
  assert.equal(getRedDustVow("化凡").costRate, 0.85);
  assert.equal(getRedDustVow("争渡").costRate, 1);
  assert.equal(getRedDustVow("逆天").gainRate, 1.15);
  assert.equal(getRedDustVow("不存在"), null);
});

test("红尘仙路初始状态从当前逆活世数开始", () => {
  const path = createRedDustPath({ nihuo_count: 4 }, 123);
  assert.deepEqual(path, {
    unlocked: true,
    unlockedAt: 123,
    life: 4,
    vow: null,
    seals: [
      { life: 1, vow: "旧世道痕", legacy: true },
      { life: 2, vow: "旧世道痕", legacy: true },
      { life: 3, vow: "旧世道痕", legacy: true },
    ],
    ashes: 0,
  });
});

test("九世圆满与旧存档进度不会被压回第一世", () => {
  assert.equal(
    formatRedDustProgress({ nihuo_count: 10, 红尘仙路: { unlocked: true } })
      .currentLife,
    10
  );
  assert.equal(
    formatRedDustProgress({
      nihuo_count: 4,
      红尘仙路: { unlocked: true, seals: [] },
    }).completed,
    3
  );
});

test("九世选择汇聚为对应红尘道果", () => {
  assert.equal(getRedDustDaoFruit(Array(5).fill({ vow: "化凡" })), "长生道果");
  assert.equal(getRedDustDaoFruit(Array(5).fill({ vow: "争渡" })), "战仙道果");
  assert.equal(getRedDustDaoFruit(Array(5).fill({ vow: "逆天" })), "逆命道果");
  assert.equal(
    getRedDustDaoFruit([{ vow: "化凡" }, { vow: "争渡" }]),
    "红尘道果"
  );
});

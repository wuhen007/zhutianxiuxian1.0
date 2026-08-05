import assert from "node:assert/strict";
import test from "node:test";
import {
  findTianjiaoByName,
  formatTianjiSearchResult,
  parseTianjiCommand,
  parseTianjiCost,
  searchPlayerGongfa,
} from "../model/tianjiSearch.js";

test("解析打听天机与推演天机指令", () => {
  assert.deepEqual(parseTianjiCommand("#打听天机 猪咪岁岁位置"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#打听天机 猪咪岁岁位置 灵石"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#推演天机 位置 猪咪岁岁"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#推演天机 位置 猪咪岁岁 灵石"), {
    type: "tianjiao",
    name: "猪咪岁岁",
    cost: null,
  });
  assert.deepEqual(parseTianjiCommand("#推演天机 吞天魔功"), {
    type: "gongfa",
    keyword: "吞天魔功",
    cost: null,
  });
});
test("中文与数字天机代价都能解析", () => {
  assert.equal(parseTianjiCost("2000万"), 20_000_000);
  assert.equal(parseTianjiCost("二千万"), 20_000_000);
  assert.equal(parseTianjiCost("3亿"), 300_000_000);
  assert.equal(parseTianjiCost("5000000"), 5_000_000);
  assert.equal(parseTianjiCost(""), null);
});

test("从位面天骄列表按名号查找", () => {
  const list = [{ 名号: "猪咪岁岁" }, { 名号: "白泽" }];
  assert.equal(findTianjiaoByName(list, "白泽").名号, "白泽");
  assert.equal(findTianjiaoByName(list, "不存在"), null);
});

test("功法溯源扫描所有玩家存档", () => {
  const files = ["1.json", "2.json"];
  const readPlayer = (qq) =>
    qq === "1"
      ? { 名号: "叶黑", 学习的功法: ["吞天魔功"], mijinglevel_id: 16 }
      : { 名号: "路人" };
  const results = searchPlayerGongfa(readPlayer, files, "吞天魔功");
  assert.deepEqual(results, [{ qq: "1", name: "叶黑", realm: 16 }]);
});

test("天骄位置与功法溯源结果按统一格式输出", () => {
  const trace = formatTianjiSearchResult({
    type: "tianjiao",
    target: {
      name: "猪咪岁岁",
      known: true,
      trace: "北斗·神碑林（坐标 380,400）",
    },
  });
  assert.match(trace, /猪咪岁岁/);
  assert.match(trace, /神碑林/);
  const gongfa = formatTianjiSearchResult({
    type: "gongfa",
    target: "吞天魔功",
    results: [],
  });
  assert.match(gongfa, /并无修士修炼/);
});

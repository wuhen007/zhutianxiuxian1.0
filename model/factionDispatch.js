import { mergeNajieContents, NAJIE_CATEGORIES } from "./najieMerge.js";

export const DISPATCH_DUNGEON_NAMES = ["大千世界"];
export const DISPATCH_MAX_COUNT = 12;
export const DISPATCH_ROLLS_PER_COUNT = 3;
export const DISPATCH_MINUTES_PER_COUNT = 90;
export const DISPATCH_RECEIPT_FIELD = "势力派遣结算记录";

const MAX_RECEIPTS = 100;
const STACKABLE_COST_CATEGORY = "道具";
const AUTHORIZED_POSITIONS = {
  瑶池: new Set(["圣女", "长老", "势力长老"]),
  摇光圣地: new Set(["圣子", "圣女", "长老", "势力长老"]),
  剑云海: new Set(["传人", "长老", "势力长老"]),
};

const WORKER_NAMES = {
  瑶池: "瑶池执事弟子",
  摇光圣地: "摇光内门弟子",
  剑云海: "剑云海剑侍",
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function getFactionDispatchAuthority(player = {}) {
  const faction = player.势力;
  const position = player.势力职位;
  const positions = AUTHORIZED_POSITIONS[faction];

  if (!faction || faction === "无") {
    return { ok: false, message: "你尚未加入任何势力，无法调遣势力弟子。" };
  }
  if (!positions) {
    return { ok: false, message: `${faction}暂未开放弟子派遣。` };
  }
  if (!positions.has(position)) {
    return {
      ok: false,
      message: `你当前是${faction}${
        position || "普通弟子"
      }，尚无长老级调遣权。`,
    };
  }

  return {
    ok: true,
    faction,
    position,
    workerName: WORKER_NAMES[faction] || `${faction}执事弟子`,
  };
}

export function parseDispatchRequest(message = "") {
  const body = String(message)
    .replace(/^#派遣(?:势力)?弟子\s*/, "")
    .trim();
  const match = body.match(/^(.+?)(?:\s*\*\s*(\d+))?$/);

  if (!match) return null;
  return {
    dungeonName: match[1].trim(),
    count: match[2] === undefined ? 1 : Number(match[2]),
  };
}

export function calculateDispatchCosts(dungeon, count) {
  const safeCount = Math.trunc(finiteNumber(count));
  return {
    灵石: Math.trunc(
      finiteNumber(dungeon?.Price) * DISPATCH_ROLLS_PER_COUNT * safeCount
    ),
    打工券: safeCount,
    秘境之匙: safeCount,
  };
}

function selectRewardPool(dungeon, roll) {
  if (roll < 0.05 && Array.isArray(dungeon.three) && dungeon.three.length) {
    return { tier: "稀有", pool: dungeon.three };
  }
  if (roll < 0.3 && Array.isArray(dungeon.two) && dungeon.two.length) {
    return { tier: "良品", pool: dungeon.two };
  }
  if (Array.isArray(dungeon.one) && dungeon.one.length) {
    return { tier: "普通", pool: dungeon.one };
  }
  if (Array.isArray(dungeon.two) && dungeon.two.length) {
    return { tier: "良品", pool: dungeon.two };
  }
  return {
    tier: "稀有",
    pool: Array.isArray(dungeon.three) ? dungeon.three : [],
  };
}

function randomIndex(length, random) {
  if (length <= 1) return 0;
  return Math.min(length - 1, Math.floor(random() * length));
}

export function generateDispatchRewards(dungeon, count, random = Math.random) {
  const rolls = Math.trunc(finiteNumber(count)) * DISPATCH_ROLLS_PER_COUNT;
  const combined = new Map();

  for (let index = 0; index < rolls; index++) {
    const { tier, pool } = selectRewardPool(dungeon, random());
    if (!pool.length) continue;

    const item = clone(pool[randomIndex(pool.length, random)]);
    const category = item.class;
    if (!NAJIE_CATEGORIES.includes(category)) continue;

    const key = `${category}:${item.name}`;
    const current = combined.get(key);
    if (current) {
      current.count += 1;
    } else {
      combined.set(key, {
        name: item.name,
        class: category,
        tier,
        count: 1,
        item,
      });
    }
  }

  return [...combined.values()];
}

export function createDispatchTask({
  player,
  dungeon,
  count,
  now = Date.now(),
  random = Math.random,
  id,
}) {
  const authority = getFactionDispatchAuthority(player);
  if (!authority.ok) throw new Error(authority.message);
  if (!Number.isInteger(count) || count < 1 || count > DISPATCH_MAX_COUNT) {
    throw new Error(`派遣次数必须在1-${DISPATCH_MAX_COUNT}之间。`);
  }
  if (!DISPATCH_DUNGEON_NAMES.includes(dungeon?.name)) {
    throw new Error(`当前不能派遣弟子前往${dungeon?.name || "该副本"}。`);
  }

  const duration = count * DISPATCH_MINUTES_PER_COUNT * 60 * 1000;
  return {
    version: 1,
    id: id || `dispatch-${now}`,
    status: "running",
    faction: authority.faction,
    position: authority.position,
    workerName: authority.workerName,
    dungeon: {
      id: dungeon.id,
      name: dungeon.name,
    },
    count,
    costs: calculateDispatchCosts(dungeon, count),
    rewards: generateDispatchRewards(dungeon, count, random),
    startedAt: now,
    endAt: now + duration,
  };
}

function inventoryItemCount(najie, name) {
  const item = najie?.[STACKABLE_COST_CATEGORY]?.find(
    (entry) => entry?.name === name
  );
  return finiteNumber(item?.数量);
}

function deductInventoryItem(najie, name, count) {
  const items = Array.isArray(najie[STACKABLE_COST_CATEGORY])
    ? najie[STACKABLE_COST_CATEGORY]
    : [];
  const item = items.find((entry) => entry?.name === name);
  item.数量 = finiteNumber(item.数量) - count;
  najie[STACKABLE_COST_CATEGORY] = items.filter(
    (entry) => finiteNumber(entry?.数量) > 0
  );
}

export function prepareDispatchCostDeduction(player, najie, costs) {
  if (finiteNumber(player?.灵石) < costs.灵石) {
    return { ok: false, message: `灵石不足，需要${costs.灵石}灵石。` };
  }
  if (inventoryItemCount(najie, "打工券") < costs.打工券) {
    return { ok: false, message: `打工券不足，需要${costs.打工券}张。` };
  }
  if (inventoryItemCount(najie, "秘境之匙") < costs.秘境之匙) {
    return { ok: false, message: `秘境之匙不足，需要${costs.秘境之匙}把。` };
  }

  const nextPlayer = clone(player);
  const nextNajie = clone(najie);
  if (!Array.isArray(nextNajie[STACKABLE_COST_CATEGORY])) {
    nextNajie[STACKABLE_COST_CATEGORY] = [];
  }
  nextPlayer.灵石 = finiteNumber(nextPlayer.灵石) - costs.灵石;
  deductInventoryItem(nextNajie, "打工券", costs.打工券);
  deductInventoryItem(nextNajie, "秘境之匙", costs.秘境之匙);

  return { ok: true, player: nextPlayer, najie: nextNajie };
}

export function getDispatchState(task, now = Date.now()) {
  if (!task) return "none";
  if (task.status === "claimed") return "claimed";
  if (task.status === "cancelled") return "cancelled";
  return now >= finiteNumber(task.endAt) ? "ready" : "running";
}

function rewardsToNajie(rewards) {
  const rewardNajie = { 灵石: 0, 源石: 0 };
  for (const category of NAJIE_CATEGORIES) rewardNajie[category] = [];

  for (const reward of rewards || []) {
    if (!NAJIE_CATEGORIES.includes(reward.class) || reward.count <= 0) continue;
    rewardNajie[reward.class].push({
      ...clone(reward.item),
      数量: reward.count,
      islockd: 0,
    });
  }
  return rewardNajie;
}

export function applyDispatchRewardsOnce(currentNajie, task) {
  const receipts = Array.isArray(currentNajie?.[DISPATCH_RECEIPT_FIELD])
    ? currentNajie[DISPATCH_RECEIPT_FIELD]
    : [];

  if (receipts.includes(task.id)) {
    return { alreadyClaimed: true, najie: clone(currentNajie) };
  }

  const merged = mergeNajieContents(currentNajie, rewardsToNajie(task.rewards));
  merged[DISPATCH_RECEIPT_FIELD] = [...receipts, task.id].slice(-MAX_RECEIPTS);
  return { alreadyClaimed: false, najie: merged };
}

export function formatDispatchRewards(rewards = []) {
  if (!rewards.length) return "本次未带回任何道具";
  return rewards.map((reward) => `${reward.name}x${reward.count}`).join("、");
}

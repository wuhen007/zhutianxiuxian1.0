import { plugin, verc, data } from "../../api/api.js";
import {
  existplayer,
  Read_najie,
  Read_player,
  Write_najie,
  Write_player,
  channel,
} from "../../model/xiuxian.js";
import {
  acquireRedisLock,
  commitClaimWithRollback,
  releaseRedisLock,
} from "../SecretPlace/xianyiBaodiState.js";
import {
  DISPATCH_DUNGEON_NAMES,
  DISPATCH_MAX_COUNT,
  DISPATCH_MINUTES_PER_COUNT,
  applyDispatchRewardsOnce,
  calculateDispatchCosts,
  createDispatchTask,
  formatDispatchRewards,
  getDispatchState,
  getFactionDispatchAuthority,
  parseDispatchRequest,
  prepareDispatchCostDeduction,
} from "../../model/factionDispatch.js";

const LOCK_TTL_SECONDS = 60;

function dispatchKey(usrQq) {
  return `xiuxian:player:${usrQq}:faction_dispatch`;
}

function dispatchLockKey(usrQq) {
  return `xiuxian:lock:faction_dispatch:${usrQq}`;
}

function najieLockKey(usrQq) {
  return `xiuxian:lock:najie_pickup:${usrQq}`;
}

async function readDispatchTask(usrQq) {
  const encoded = await redis.get(dispatchKey(usrQq));
  if (!encoded) return null;
  return JSON.parse(encoded);
}

async function saveDispatchTask(usrQq, task) {
  await redis.set(dispatchKey(usrQq), JSON.stringify(task));
}

function createLockToken(usrQq) {
  return `${usrQq}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainSeconds = seconds % 60;
  return `${hours ? `${hours}小时` : ""}${
    minutes ? `${minutes}分钟` : ""
  }${remainSeconds}秒`;
}

async function rollbackStart({ usrQq, player, najie, error }) {
  const rollbackErrors = [];
  try {
    await Write_player(usrQq, player);
  } catch (rollbackError) {
    rollbackErrors.push(rollbackError);
  }
  try {
    await Write_najie(usrQq, najie);
  } catch (rollbackError) {
    rollbackErrors.push(rollbackError);
  }
  if (rollbackErrors.length) {
    throw new AggregateError(
      [error, ...rollbackErrors],
      "势力派遣启动失败且资源回滚不完整"
    );
  }
  throw error;
}

export class FactionDispatch extends plugin {
  constructor() {
    super({
      name: "FactionDispatch",
      dsc: "势力弟子派遣模块",
      event: "message",
      priority: 600,
      rule: [
        { reg: "^#势力派遣$", fnc: "showDispatchHelp" },
        { reg: "^#派遣(势力)?弟子\\s*.+$", fnc: "startDispatch" },
        { reg: "^#势力弟子状态$", fnc: "showDispatchStatus" },
        { reg: "^#领取势力弟子收获$", fnc: "claimDispatch" },
        { reg: "^#召回势力弟子$", fnc: "cancelDispatch" },
      ],
    });
  }

  async getPlayerContext(e) {
    if (!verc({ e })) return null;
    if (!e.isGroup) {
      await e.reply("势力派遣请在群聊中使用。");
      return null;
    }

    const usrQq = (
      await channel(e.user_id.toString().replace("qg_", ""))
    ).toString();
    if (!(await existplayer(usrQq))) return null;
    const player = await Read_player(usrQq);
    return { usrQq, player };
  }

  async showDispatchHelp(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;
    const authority = getFactionDispatchAuthority(context.player);
    if (!authority.ok) return e.reply(authority.message);

    const dungeons = DISPATCH_DUNGEON_NAMES.map((name) =>
      data.didian_list.find((item) => item.name === name)
    ).filter(Boolean);
    const dungeonLines = dungeons.map((dungeon) => {
      const cost = calculateDispatchCosts(dungeon, 1);
      return `- ${dungeon.name}：每次${DISPATCH_MINUTES_PER_COUNT}分钟，${cost.灵石}灵石、1张打工券、1把秘境之匙`;
    });

    return e.reply(
      [
        "【势力弟子派遣】",
        `身份：${authority.faction}${authority.position}`,
        `可派遣：${authority.workerName}`,
        ...dungeonLines,
        `单次最多派遣${DISPATCH_MAX_COUNT}次，收益约为亲自沉迷副本的三成。`,
        "",
        "派遣：#派遣势力弟子大千世界*次数",
        "状态：#势力弟子状态",
        "领取：#领取势力弟子收获",
        "召回：#召回势力弟子",
      ].join("\n")
    );
  }

  async startDispatch(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;
    const { usrQq } = context;
    const request = parseDispatchRequest(e.msg);
    if (!request) return e.reply("用法：#派遣势力弟子大千世界*次数");
    if (
      !Number.isInteger(request.count) ||
      request.count < 1 ||
      request.count > DISPATCH_MAX_COUNT
    ) {
      return e.reply(`派遣次数必须在1-${DISPATCH_MAX_COUNT}之间。`);
    }

    const dungeon = data.didian_list.find(
      (item) => item.name === request.dungeonName
    );
    if (!dungeon || !DISPATCH_DUNGEON_NAMES.includes(dungeon.name)) {
      return e.reply(
        `当前只可派遣弟子前往：${DISPATCH_DUNGEON_NAMES.join("、")}。`
      );
    }

    const lockToken = createLockToken(usrQq);
    let dispatchLocked = false;
    let najieLocked = false;
    try {
      dispatchLocked = await acquireRedisLock(
        redis,
        dispatchLockKey(usrQq),
        lockToken,
        LOCK_TTL_SECONDS
      );
      if (!dispatchLocked)
        return e.reply("你的势力弟子正在接受其他调令，请稍后重试。");
      najieLocked = await acquireRedisLock(
        redis,
        najieLockKey(usrQq),
        lockToken,
        LOCK_TTL_SECONDS
      );
      if (!najieLocked)
        return e.reply("你的纳戒正在进行其他操作，请稍后重试。");

      const existing = await readDispatchTask(usrQq);
      const existingState = getDispatchState(existing);
      if (existingState === "running") {
        return e.reply(
          `弟子尚未归来，剩余${formatRemaining(existing.endAt - Date.now())}。`
        );
      }
      if (existingState === "ready") {
        return e.reply("上一队弟子已经归来，请先使用 #领取势力弟子收获。");
      }

      const player = await Read_player(usrQq);
      const authority = getFactionDispatchAuthority(player);
      if (!authority.ok) return e.reply(authority.message);
      const najie = await Read_najie(usrQq);
      const task = createDispatchTask({
        player,
        dungeon,
        count: request.count,
        now: Date.now(),
        id: `${usrQq}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      const deduction = prepareDispatchCostDeduction(player, najie, task.costs);
      if (!deduction.ok) return e.reply(deduction.message);

      await Write_najie(usrQq, deduction.najie);
      try {
        await Write_player(usrQq, deduction.player);
        await saveDispatchTask(usrQq, task);
      } catch (error) {
        await rollbackStart({ usrQq, player, najie, error });
      }

      return e.reply(
        [
          "【势力弟子·奉命出发】",
          `${task.workerName}已前往${task.dungeon.name}，执行${task.count}轮派遣。`,
          `消耗：${task.costs.灵石}灵石、${task.costs.打工券}张打工券、${task.costs.秘境之匙}把秘境之匙`,
          `预计归来：${formatRemaining(task.endAt - Date.now())}后`,
          "你的本体行动不受影响。",
        ].join("\n")
      );
    } catch (error) {
      console.error("[势力派遣] 启动失败:", error);
      return e.reply("势力弟子派遣失败，已尽力退还消耗，请稍后重试。");
    } finally {
      if (najieLocked) {
        try {
          await releaseRedisLock(redis, najieLockKey(usrQq), lockToken);
        } catch (error) {
          console.error("[势力派遣] 释放纳戒锁失败:", error);
        }
      }
      if (dispatchLocked) {
        try {
          await releaseRedisLock(redis, dispatchLockKey(usrQq), lockToken);
        } catch (error) {
          console.error("[势力派遣] 释放任务锁失败:", error);
        }
      }
    }
  }

  async showDispatchStatus(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;

    try {
      const task = await readDispatchTask(context.usrQq);
      const state = getDispatchState(task);
      if (state === "none" || state === "claimed" || state === "cancelled") {
        const authority = getFactionDispatchAuthority(context.player);
        if (!authority.ok) return e.reply(authority.message);
        return e.reply("当前没有正在执行或等待领取的势力弟子任务。");
      }
      if (state === "ready") {
        return e.reply(
          [
            "【势力弟子·已经归来】",
            `副本：${task.dungeon.name}x${task.count}`,
            "使用 #领取势力弟子收获 接收道具。",
          ].join("\n")
        );
      }
      return e.reply(
        [
          "【势力弟子·执行中】",
          `队伍：${task.workerName}`,
          `副本：${task.dungeon.name}x${task.count}`,
          `剩余：${formatRemaining(task.endAt - Date.now())}`,
        ].join("\n")
      );
    } catch (error) {
      console.error("[势力派遣] 查询失败:", error);
      return e.reply("查询势力弟子状态失败。");
    }
  }

  async claimDispatch(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;
    const { usrQq } = context;

    const lockToken = createLockToken(usrQq);
    let dispatchLocked = false;
    let najieLocked = false;
    try {
      dispatchLocked = await acquireRedisLock(
        redis,
        dispatchLockKey(usrQq),
        lockToken,
        LOCK_TTL_SECONDS
      );
      if (!dispatchLocked)
        return e.reply("势力弟子收获正在结算，请勿重复领取。");
      najieLocked = await acquireRedisLock(
        redis,
        najieLockKey(usrQq),
        lockToken,
        LOCK_TTL_SECONDS
      );
      if (!najieLocked)
        return e.reply("你的纳戒正在进行其他操作，请稍后重试。");

      const task = await readDispatchTask(usrQq);
      const state = getDispatchState(task);
      if (state === "none" || state === "cancelled")
        return e.reply("当前没有可以领取的势力弟子收获。");
      if (state === "running") {
        return e.reply(
          `弟子尚未归来，剩余${formatRemaining(task.endAt - Date.now())}。`
        );
      }
      if (state === "claimed") return e.reply("本次势力弟子收获已经领取。");

      const originalNajie = await Read_najie(usrQq);
      const applied = applyDispatchRewardsOnce(originalNajie, task);
      const claimedTask = {
        ...task,
        status: "claimed",
        claimedAt: Date.now(),
      };

      if (applied.alreadyClaimed) {
        await saveDispatchTask(usrQq, claimedTask);
        return e.reply("本次收获已经写入纳戒，任务状态已修复。");
      }

      await commitClaimWithRollback({
        originalNajie,
        mergedNajie: applied.najie,
        writeNajie: (najie) => Write_najie(usrQq, najie),
        commitBaodi: () => saveDispatchTask(usrQq, claimedTask),
      });

      return e.reply(
        [
          "【势力弟子·历练归来】",
          `${task.workerName}从${task.dungeon.name}带回：`,
          formatDispatchRewards(task.rewards),
          "所得道具已存入纳戒。",
        ].join("\n")
      );
    } catch (error) {
      console.error("[势力派遣] 领取失败:", error);
      return e.reply(
        "领取势力弟子收获失败，本次任务不会重复发奖，请稍后重试。"
      );
    } finally {
      if (najieLocked) {
        try {
          await releaseRedisLock(redis, najieLockKey(usrQq), lockToken);
        } catch (error) {
          console.error("[势力派遣] 释放纳戒锁失败:", error);
        }
      }
      if (dispatchLocked) {
        try {
          await releaseRedisLock(redis, dispatchLockKey(usrQq), lockToken);
        } catch (error) {
          console.error("[势力派遣] 释放任务锁失败:", error);
        }
      }
    }
  }

  async cancelDispatch(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;
    const { usrQq } = context;

    const lockToken = createLockToken(usrQq);
    let locked = false;
    try {
      locked = await acquireRedisLock(
        redis,
        dispatchLockKey(usrQq),
        lockToken,
        LOCK_TTL_SECONDS
      );
      if (!locked) return e.reply("你的势力弟子正在接受其他调令，请稍后重试。");

      const task = await readDispatchTask(usrQq);
      const state = getDispatchState(task);
      if (state === "none" || state === "claimed" || state === "cancelled") {
        return e.reply("当前没有可以召回的势力弟子。");
      }
      if (state === "ready") {
        return e.reply("弟子已经完成任务，请使用 #领取势力弟子收获。");
      }

      await saveDispatchTask(usrQq, {
        ...task,
        status: "cancelled",
        cancelledAt: Date.now(),
      });
      return e.reply(
        "势力弟子已经中止历练并返程；已消耗的路费与凭证不予退还，本次没有副本收获。"
      );
    } catch (error) {
      console.error("[势力派遣] 召回失败:", error);
      return e.reply("召回势力弟子失败，请稍后重试。");
    } finally {
      if (locked) {
        try {
          await releaseRedisLock(redis, dispatchLockKey(usrQq), lockToken);
        } catch (error) {
          console.error("[势力派遣] 释放任务锁失败:", error);
        }
      }
    }
  }
}

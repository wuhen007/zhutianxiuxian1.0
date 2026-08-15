import path from "path";
import { config, plugin } from "../../api/api.js";
import {
  Add_najie_thing,
  Read_player,
  Write_player,
  channel,
  exist_najie_thing,
} from "../../model/xiuxian.js";
import { __PATH } from "../../model/xiuxian.js";
import { withPlayerMutationLock } from "../../utils/playerMutationLock.js";
import { FileRollbackTransaction } from "../SecretPlace/rebirthTransaction.js";
import { getFishingTide } from "../../model/immortalFishing.js";
import { getRealmEventWorldYear } from "../../model/realmEventClock.js";
import {
  SEA_BOAT_NAMES,
  SEA_BOAT_TIERS,
  SEA_EVENT_IDS,
  SEA_FIRST_BOAT_MATERIALS,
  SEA_ROUTE_NAMES,
  SEA_VOYAGE_COST,
  getBoatTier,
  getBoatTierIndex,
  getSeaEventById,
  getSeaEventChoice,
  getSeaRoute,
  isSeaRouteTideBoosted,
  rollSeaEvent,
  rollSeaSighting,
  rollSeaVoyageBaseReward,
} from "../../model/seaVoyage.js";
import {
  consumeSeaVoyageSets,
  getPendingSeaVoyageRewards,
  getSeaRouteAtlas,
  markSeaVoyageRewardsClaimed,
  recordSeaSighting,
} from "../../model/seaVoyageProgress.js";

const IMMORTAL_BAIT_NAMES = Object.freeze(['百草香饵', '神藏仙饵', '矿髓沉饵', '因果道饵', '轮回冥饵']);

function getCurrentWorldYear() {
  const current = config.getConfig("xiuxian", "xiuxian")?.Era?.current || {};
  const totalYears = Number(current.totalYears);
  return Number.isFinite(totalYears)
    ? totalYears
    : getRealmEventWorldYear(current.index, current.years, current.epoch);
}

function formatMinutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

export class SeaVoyage extends plugin {
  constructor() {
    super({
      name: "万舟争渡",
      dsc: "造舟出海探险，记录海域见闻并兑换仙钓与愿鳞",
      event: "message",
      priority: 600,
      rule: [
        { reg: "^#造舟(?:\\s+升级)?$", fnc: "buildBoat" },
        { reg: "^#舟仓(?:\\s+拆解)?$", fnc: "boatShed" },
        { reg: "^#出海(?:\\s+[^\\s]+(?:\\s+[^\\s]+)?)?$", fnc: "setSail" },
        { reg: "^#海域见闻$", fnc: "showSeaAtlas" },
        { reg: "^#领取见闻奖励$", fnc: "claimSeaAtlasRewards" },
      ],
    });
  }

  /* ------------------------------ 造舟 / 升级 / 拆解 ------------------------------ */

  async buildBoat(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return e.reply("你还未踏入修仙界，请先发送【#踏入仙途】。");
      const upgrading = /升级/.test(e.msg);
      const currentBoat = player.出海舟;

      if (!upgrading) {
        if (currentBoat) return e.reply("你已有【" + currentBoat + "】，发送【#舟仓 拆解】可返还材料降阶。");
        for (const material of SEA_FIRST_BOAT_MATERIALS) {
          const owned = await exist_najie_thing(usr_qq, material.name, material.class);
          if (owned < material.amount) {
            return e.reply("铸造一叶轻舟需要" + material.name + "x" + material.amount + "（当前 " + owned + "）。");
          }
        }
        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
        try {
          for (const material of SEA_FIRST_BOAT_MATERIALS) {
            await Add_najie_thing(usr_qq, material.name, material.class, -material.amount);
          }
          await Add_najie_thing(usr_qq, "一叶轻舟", "道具", 1, undefined, 1, {
            idempotencyKey: "sea-boat:" + usr_qq + ":一叶轻舟",
          });
          player.出海舟 = "一叶轻舟";
          await Write_player(usr_qq, player);
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          throw error;
        }
        return e.reply("你以群星之沙与愿鳞铸成一叶轻舟，从此可【#出海】探险诸天水域。");
      }

      if (!currentBoat) return e.reply("你还没有舟，请先发送【#造舟】铸造一叶轻舟。");
      const tier = getBoatTier(currentBoat);
      if (!tier?.upgrade) return e.reply("【" + currentBoat + "】已是至巅，无法再升级。");
      const upgrade = tier.upgrade;
      for (const material of upgrade.materials) {
        const owned = await exist_najie_thing(usr_qq, material.name, material.class);
        if (owned < material.amount) {
          return e.reply("升级【" + upgrade.name + "】需要" + material.name + "x" + material.amount + "（当前 " + owned + "）。");
        }
      }
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
      try {
        for (const material of upgrade.materials) {
          await Add_najie_thing(usr_qq, material.name, material.class, -material.amount);
        }
        await Add_najie_thing(usr_qq, upgrade.name, "道具", 1, undefined, 1, {
          idempotencyKey: "sea-boat:" + usr_qq + ":" + upgrade.name,
        });
        player.出海舟 = upgrade.name;
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      return e.reply("舟身一阵轰鸣，【" + upgrade.name + "】铸成！收益倍率提升至 x" + getBoatTier(upgrade.name).multiplier + "，出海更快。");
    });
  }

  async boatShed(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return e.reply("你还未踏入修仙界，请先发送【#踏入仙途】。");
      const currentBoat = player.出海舟;

      if (!/拆解/.test(e.msg)) {
        if (!currentBoat) {
          return e.reply([
            "【舟仓】空无片木。",
            "铸造：#造舟（需群星之沙x20、众生愿鳞x50）",
            ...SEA_BOAT_NAMES.map(name => {
              const tier = getBoatTier(name);
              return `【${name}】收益x${tier.multiplier}，出海${tier.voyageMinutes}分钟${tier.upgrade ? "，" + tier.upgrade.name + "需" + tier.upgrade.materials.map(m => m.name + "x" + m.amount).join("、") : ""}`;
            }),
            "出海：#出海 航线名（凡间河/遮天渊/界海）",
          ].join("\n"));
        }
        const tier = getBoatTier(currentBoat);
        const task = player.出海任务;
        const lines = [
          "【舟仓】",
          "当前舟：【" + currentBoat + "】收益x" + tier.multiplier + "，出海" + tier.voyageMinutes + "分钟",
        ];
        if (task) {
          const remaining = Number(task.endAt) - Date.now();
          lines.push(remaining > 0
            ? "出海进行中：【" + task.route + "】约" + formatMinutes(remaining) + "分钟后回港。"
            : "舟已回港，发送【#出海】领取渔获。");
        } else {
          lines.push("舟停泊港中，发送【#出海 航线名】启航。");
        }
        if (tier.upgrade) {
          lines.push("升级：【#造舟 升级】（需" + tier.upgrade.materials.map(m => m.name + "x" + m.amount).join("、") + "）");
        } else {
          lines.push("此舟已是至巅，无可升级。");
        }
        if (getBoatTierIndex(currentBoat) > 0) lines.push("拆解：#舟仓 拆解（返还部分材料降阶）");
        return e.reply(lines.join("\n"));
      }

      const index = getBoatTierIndex(currentBoat);
      if (!currentBoat) return e.reply("你还没有舟，无需拆解。");
      if (index <= 0) return e.reply("一叶轻舟无法拆解。");
      const tier = SEA_BOAT_TIERS[index];
      const lowerTier = SEA_BOAT_TIERS[index - 1];
      const refunds = (tier.upgrade?.materials || [])
        .filter(material => material.name !== currentBoat)
        .map(material => ({ ...material, amount: Math.max(1, Math.trunc(material.amount * 0.7)) }));
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
      try {
        await Add_najie_thing(usr_qq, currentBoat, "道具", -1);
        for (const refund of refunds) {
          await Add_najie_thing(usr_qq, refund.name, refund.class, refund.amount, undefined, 1, {
            idempotencyKey: "sea-boat-refund:" + usr_qq + ":" + currentBoat + ":" + refund.name,
          });
        }
        await Add_najie_thing(usr_qq, lowerTier.name, "道具", 1, undefined, 1, {
          idempotencyKey: "sea-boat:" + usr_qq + ":" + lowerTier.name,
        });
        player.出海舟 = lowerTier.name;
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      return e.reply("你拆解【" + currentBoat + "】，返还" + (refunds.length > 0
        ? refunds.map(r => r.name + "x" + r.amount).join("、")
        : "无") + "，舟降为【" + lowerTier.name + "】。");
    });
  }

  /* --------------------------------- 出海与结算 --------------------------------- */

  async setSail(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return e.reply("你还未踏入修仙界，请先发送【#踏入仙途】。");
      const args = String(e.msg).replace(/^#出海\s*/, "").trim().split(/\s+/).filter(Boolean);
      const first = args[0] || "";

      // 事件选择：#出海 1/2/3
      if (/^[1-3]$/.test(first)) {
        return this.resolvePendingEvent(e, usr_qq, player, Number(first));
      }

      const routeName = first || null;
      const baitName = args[1] || null;

      // 无参数：查状态或结算回港
      if (!routeName) {
        return this.settleVoyage(e, usr_qq, player, null);
      }

      if (!SEA_ROUTE_NAMES.includes(routeName)) {
        return e.reply("没有这条航线。可选：#出海 凡间河 / 遮天渊 / 界海。");
      }
      if (baitName && !IMMORTAL_BAIT_NAMES.includes(baitName)) {
        return e.reply("仙饵必须是：百草香饵/神藏仙饵/矿髓沉饵/因果道饵/轮回冥饵。");
      }
      const currentBoat = player.出海舟;
      if (!currentBoat) return e.reply("你没有舟，先【#造舟】。");
      if (player.出海任务) {
        const remaining = Number(player.出海任务.endAt) - Date.now();
        if (remaining > 0) return e.reply("舟还在海上，约" + formatMinutes(remaining) + "分钟后回港。");
        return this.settleVoyage(e, usr_qq, player, routeName);
      }

      // 扣消耗：1 仙钓 + （指定仙饵 1 或 愿鳞 10）
      const rodCount = await exist_najie_thing(usr_qq, SEA_VOYAGE_COST.fishingRod.name, SEA_VOYAGE_COST.fishingRod.class);
      if (rodCount < SEA_VOYAGE_COST.fishingRod.amount) {
        return e.reply("众生仙钓不足（需要" + SEA_VOYAGE_COST.fishingRod.amount + "），可通过【#垂纶】签到或【#愿鳞兑换】获得。");
      }
      let costDesc;
      if (baitName) {
        const baitCount = await exist_najie_thing(usr_qq, baitName, "道具");
        if (baitCount < 1) return e.reply("【" + baitName + "】数量不足。");
      } else {
        const scaleCount = await exist_najie_thing(usr_qq, SEA_VOYAGE_COST.wishScales.name, SEA_VOYAGE_COST.wishScales.class);
        if (scaleCount < SEA_VOYAGE_COST.wishScales.amount) {
          return e.reply("众生愿鳞不足（需要" + SEA_VOYAGE_COST.wishScales.amount + "），也可指定仙饵替代：如 #出海 凡间河 百草香饵。");
        }
      }

      const tier = getBoatTier(currentBoat);
      const startAt = Date.now();
      const endAt = startAt + tier.voyageMinutes * 60 * 1000;
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
      try {
        await Add_najie_thing(usr_qq, SEA_VOYAGE_COST.fishingRod.name, SEA_VOYAGE_COST.fishingRod.class, -SEA_VOYAGE_COST.fishingRod.amount, undefined, 1, {
          idempotencyKey: "sea-voyage-cost:" + usr_qq + ":" + startAt + ":rod",
        });
        if (baitName) {
          await Add_najie_thing(usr_qq, baitName, "道具", -1, undefined, 1, {
            idempotencyKey: "sea-voyage-cost:" + usr_qq + ":" + startAt + ":bait",
          });
          costDesc = "众生仙钓x1、" + baitName + "x1";
        } else {
          await Add_najie_thing(usr_qq, SEA_VOYAGE_COST.wishScales.name, SEA_VOYAGE_COST.wishScales.class, -SEA_VOYAGE_COST.wishScales.amount, undefined, 1, {
            idempotencyKey: "sea-voyage-cost:" + usr_qq + ":" + startAt + ":scales",
          });
          costDesc = "众生仙钓x1、众生愿鳞x10";
        }
        player.出海任务 = { route: routeName, startAt, endAt, settled: false };
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      return e.reply([
        "【" + routeName + "·启航】",
        "你乘【" + currentBoat + "】出港，消耗" + costDesc + "。",
        "约" + tier.voyageMinutes + "分钟后回港，届时发送【#出海】领取渔获。",
      ].join("\n"));
    });
  }

  /** 回港结算：发放基础收益，60% 触发海域事件三选一 */
  async settleVoyage(e, usr_qq, player, startRoute) {
    const task = player.出海任务;
    if (!task || task.settled) {
      if (startRoute) return this.setSailStart(e, usr_qq, player, startRoute);
      return e.reply([
        "【万舟争渡】",
        "航线：#出海 凡间河 / 遮天渊 / 界海",
        "消耗：众生仙钓x1 + 愿鳞x10（或指定仙饵替代）",
        "收益：愿鳞、海域材料，随机记录见闻；集齐见闻可 #领取见闻奖励。",
      ].join("\n"));
    }
    if (Number(task.endAt) > Date.now()) {
      if (startRoute) return this.setSailStart(e, usr_qq, player, startRoute);
      return e.reply("舟还在海上，约" + formatMinutes(Number(task.endAt) - Date.now()) + "分钟后回港。");
    }

    const route = getSeaRoute(task.route);
    if (!route) {
      delete player.出海任务;
      await Write_player(usr_qq, player);
      return e.reply("航路已随界潮消散。");
    }
    const tide = getFishingTide(getCurrentWorldYear());
    const tideBoosted = isSeaRouteTideBoosted(task.route, tide);
    const tier = getBoatTier(player.出海舟) || SEA_BOAT_TIERS[0];
    const base = rollSeaVoyageBaseReward(task.route, {
      boatMultiplier: tier.multiplier,
      tideBoosted,
    });

    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, usr_qq + ".json"));
    transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
    let lines = [];
    try {
      const settleKey = "sea-voyage-settle:" + usr_qq + ":" + task.route + ":" + task.startAt;
      await Add_najie_thing(usr_qq, "众生愿鳞", "道具", base.wishScales, undefined, 1, { idempotencyKey: settleKey + ":scales" });
      for (const material of base.materials) {
        await Add_najie_thing(usr_qq, material.name, material.class, material.amount, undefined, 1, { idempotencyKey: settleKey + ":mat:" + material.name });
      }
      if (base.sighting) {
        recordSeaSighting(player, task.route, base.sighting);
      }
      await this.grantPendingRewards(e, usr_qq, player, settleKey);

      lines.push("【" + task.route + "·回港】");
      lines.push("愿鳞 x" + base.wishScales + (tideBoosted ? "（万界潮汐加持）" : ""));
      for (const material of base.materials) {
        lines.push(material.name + " x" + material.amount);
      }
      if (base.sighting) lines.push("见闻：「" + base.sighting + "」已记录");

      const event = rollSeaEvent();
      if (event) {
        task.settled = true;
        task.eventId = event.id;
        await Write_player(usr_qq, player);
        transaction.commit();
        lines.push("—— 回港途中，你撞上一段海域奇遇 ——");
        lines.push("【" + event.title + "】");
        lines.push(event.intro);
        lines.push(...event.choices.map((choice, index) => (index + 1) + ". " + choice.label));
        lines.push("发送【#出海 1/2/3】作出选择。");
        return e.reply(lines.join("\n"));
      }

      delete player.出海任务;
      await Write_player(usr_qq, player);
      transaction.commit();
    } catch (error) {
      transaction.rollback();
      throw error;
    }
    return e.reply(lines.join("\n"));
  }

  /** 处理海域事件三选一 */
  async resolvePendingEvent(e, usr_qq, player, choiceNumber) {
    const task = player.出海任务;
    if (!task?.settled || !task.eventId) return e.reply("当前没有待选择的海域奇遇。");
    const event = getSeaEventById(task.eventId);
    if (!event) {
      delete player.出海任务;
      await Write_player(usr_qq, player);
      return e.reply("这段海域奇遇已随界潮消散。");
    }
    const choice = getSeaEventChoice(task.eventId, choiceNumber);
    if (!choice) return e.reply("没有这个选择，请发送 #出海 1/2/3。");

    const settleKey = "sea-voyage-event:" + usr_qq + ":" + task.route + ":" + task.startAt;
    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, usr_qq + ".json"));
    transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
    let outcome;
    try {
      outcome = await this.applyEventChoice(e, usr_qq, player, choice, settleKey);
      delete player.出海任务;
      await Write_player(usr_qq, player);
      transaction.commit();
    } catch (error) {
      transaction.rollback();
      throw error;
    }
    return e.reply("【" + event.title + "·" + choice.label + "】\n" + outcome);
  }

  async applyEventChoice(e, usr_qq, player, choice, settleKey) {
    const lines = [];
    for (const item of choice.items || []) {
      await Add_najie_thing(usr_qq, item.name, item.class, item.amount, undefined, 1, {
        idempotencyKey: settleKey + ":item:" + item.name,
      });
      lines.push(item.name + " x" + item.amount);
    }
    if (choice.sighting) {
      const sightingName = rollSeaSighting(player.出海任务?.route || null, { tideBoosted: false });
      if (sightingName && player.出海任务?.route) {
        recordSeaSighting(player, player.出海任务.route, sightingName);
        lines.push("见闻：「" + sightingName + "」已记录");
        await this.grantPendingRewards(e, usr_qq, player, settleKey + ":sighting");
      }
    }
    if (choice.gamble) {
      const win = Math.random() < 0.6;
      const branch = win ? choice.gamble.win : choice.gamble.lose;
      if (branch.items) {
        for (const item of branch.items) {
          await Add_najie_thing(usr_qq, item.name, item.class, item.amount, undefined, 1, {
            idempotencyKey: settleKey + ":gamble:" + item.name,
          });
          lines.push(item.name + " x" + item.amount);
        }
      }
      if (branch.loseCargoRatio) {
        lines.push("（风暴卷走部分货物）");
      }
      lines.push(branch.message);
      return lines.join("\n");
    }
    if (choice.loseCargoRatio) {
      lines.push("（部分货物被卷走）");
    }
    lines.push(choice.message);
    return lines.join("\n");
  }

  /** 领取全部可领取的见闻奖励（发现 + 集齐套装，含消耗） */
  async grantPendingRewards(e, usr_qq, player, settleKey) {
    const rewards = getPendingSeaVoyageRewards(player);
    if (rewards.length === 0) return;
    for (const reward of rewards) {
      await Add_najie_thing(usr_qq, reward.name, reward.class, reward.amount, undefined, 1, {
        idempotencyKey: "sea-atlas:" + usr_qq + ":" + reward.key + ":" + reward.name,
      });
    }
    consumeSeaVoyageSets(player, rewards);
    markSeaVoyageRewardsClaimed(player, rewards);
  }

  /* -------------------------------- 见闻录展示与领取 -------------------------------- */

  async showSeaAtlas(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    const player = await Read_player(usr_qq);
    if (!player) return true;
    const pending = getPendingSeaVoyageRewards(player);
    const lines = [
      "【海域见闻录】",
      ...SEA_ROUTE_NAMES.map(routeName => {
        const atlas = getSeaRouteAtlas(player, routeName);
        return "【" + routeName + "】" + atlas.collected + "/" + atlas.total
          + "：" + atlas.entries.map(entry => entry.name + (entry.count > 0 ? "x" + entry.count : "")).join("、");
      }),
      "集齐一条航线的全部见闻，可 #领取见闻奖励（5仙钓+10愿鳞+2航线饵料，并消耗见闻）。",
    ];
    if (pending.length > 0) lines.push("当前有可领取的见闻奖励，发送 #领取见闻奖励。");
    return e.reply(lines.join("\n"));
  }

  async claimSeaAtlasRewards(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return e.reply("你还未踏入修仙界，请先发送【#踏入仙途】。");
      const rewards = getPendingSeaVoyageRewards(player);
      if (rewards.length === 0) return e.reply("当前没有可领取的见闻奖励，先去出海收集见闻吧。");

      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, usr_qq + ".json"));
      transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
      try {
        for (const reward of rewards) {
          await Add_najie_thing(usr_qq, reward.name, reward.class, reward.amount, undefined, 1, {
            idempotencyKey: "sea-atlas:" + usr_qq + ":" + reward.key + ":" + reward.name,
          });
        }
        consumeSeaVoyageSets(player, rewards);
        markSeaVoyageRewardsClaimed(player, rewards);
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }

      const grouped = new Map();
      for (const reward of rewards) {
        const key = reward.class + ":" + reward.name;
        const current = grouped.get(key) || { ...reward, amount: 0 };
        current.amount += reward.amount;
        grouped.set(key, current);
      }
      const consumed = new Map();
      for (const reward of rewards) {
        if (!reward.consume) continue;
        const route = reward.consume.route;
        consumed.set(route, (consumed.get(route) || 0) + (Number(reward.consume.amount) || 0));
      }
      return e.reply([
        "见闻奖励领取成功：",
        ...[...grouped.values()].map(reward => "【" + reward.name + "】x" + reward.amount),
        ...(consumed.size > 0
          ? ["兑换套装已消耗：" + [...consumed].map(([route, amount]) => route + "见闻各" + amount + "条").join("，") + "。"]
          : []),
      ].join("\n"));
    });
  }

  async setSailStart(e, usr_qq, player, routeName) {
    if (player.出海任务?.settled) {
      return e.reply("你有一段海域奇遇待处理，请发送【#出海 1/2/3】作出选择，再启航新航线。");
    }
    const currentBoat = player.出海舟;
    if (!currentBoat) return e.reply("你没有舟，先【#造舟】。");
    return e.reply("舟停泊港中，发送【#出海 " + routeName + "】启航。");
  }
}

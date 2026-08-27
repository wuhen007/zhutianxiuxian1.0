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
import {
  FISHING_PLANE_NAMES,
  IMMORTAL_BAIT_NAMES,
  TIDE_DURATION_YEARS,
  WISH_SCALE_EXCHANGE_NAMES,
  getFishingTide,
  getImmortalBaitConfig,
  getPlaneFishAtlas,
  getPlaneFishingEventById,
  getPlaneFishingEventChoice,
  getWishScaleExchangeConfig,
  parseWishScaleExchange,
} from "../../model/immortalFishing.js";
import { getPlayerPlaneName } from "../../model/planeCoords.js";
import { getRealmEventWorldYear } from "../../model/realmEventClock.js";
import {
  DAILY_SIGN_BUTTONS,
  replyOfficialMessage,
} from "../../model/officialMessage.js";
import {
  claimImmortalFishingSign,
  consumeFishAtlasSets,
  getPendingFishAtlasRewards,
  markFishAtlasRewardsClaimed,
} from "../../model/immortalFishingProgress.js";

function getCurrentWorldYear() {
  const current = config.getConfig("xiuxian", "xiuxian")?.Era?.current || {};
  const totalYears = Number(current.totalYears);
  return Number.isFinite(totalYears)
    ? totalYears
    : getRealmEventWorldYear(current.index, current.years, current.epoch);
}

export class ImmortalFishing extends plugin {
  constructor() {
    super({
      name: "诸天仙饵与仙武界",
      dsc: "查看众生仙饵、鱼谱潮汐、位面奇遇并兑换愿鳞",
      event: "message",
      priority: 600,
      rule: [
        { reg: "^#众生仙饵$", fnc: "showBaits" },
        { reg: "^#(?:垂纶|众生仙钓签到|仙钓签到|垂钓签到)$", fnc: "fishingSign" },
        { reg: "^#众生鱼图鉴(?:\\s+.*)?$", fnc: "showFishAtlas" },
        { reg: "^#(?:领取鱼图鉴奖励|领取众生鱼谱奖励)$", fnc: "claimFishAtlasRewards" },
        { reg: "^#万界潮汐$", fnc: "showFishingTide" },
        { reg: "^#垂钓奇遇(?:\\s*[1-3])?$", fnc: "chooseFishingEvent" },
        { reg: "^#愿鳞兑换(?:\\s+.*)?$", fnc: "wishScaleExchange" },
        { reg: "^#寻找武祖$", fnc: "seekWuzu" },
      ],
    });
  }

  async fishingSign(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return e.reply("你还未踏入修仙界，请先发送【#踏入仙途】。");
      const result = claimImmortalFishingSign(player);
      if (!result.claimed) {
        const message = "今日已垂纶于诸天界河，机缘已定，明日再来。已连续垂纶" + result.streak + "日。";
        return replyOfficialMessage(e, {
          markdown: message,
          text: message,
          buttons: DAILY_SIGN_BUTTONS,
        });
      }

      const rewards = result.rewards || { hookAmount: result.amount, baits: [] };
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, usr_qq + ".json"));
      transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
      try {
        await Add_najie_thing(
          usr_qq,
          "众生仙钓",
          "道具",
          rewards.hookAmount,
          undefined,
          1,
          { idempotencyKey: "immortal-fishing-sign:" + usr_qq + ":" + result.date }
        );
        for (const bait of rewards.baits) {
          await Add_najie_thing(
            usr_qq,
            bait.name,
            "道具",
            bait.amount,
            undefined,
            1,
            { idempotencyKey: "immortal-fishing-sign-bait:" + usr_qq + ":" + result.date + ":" + bait.name }
          );
        }
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }

      const bonus = result.amount > 1 ? "，第" + result.streak + "日潮头加赠" : "";
      const lines = [
        "【垂纶·第" + result.streak + "日】",
        "一纶垂入诸天界河，潮声裹挟着机缘而来——",
        "众生仙钓 x" + rewards.hookAmount,
        ...rewards.baits.map(bait => bait.name + " x" + bait.amount),
        "连续垂纶" + result.streak + "日" + bonus + "。",
      ];
      const message = lines.join("\n");
      return replyOfficialMessage(e, {
        markdown: message,
        text: message,
        buttons: DAILY_SIGN_BUTTONS,
      });
    });
  }

  async claimFishAtlasRewards(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return e.reply("你还未踏入修仙界，请先发送【#踏入仙途】。");
      const rewards = getPendingFishAtlasRewards(player);
      if (rewards.length === 0) {
        return e.reply("当前没有可领取的鱼谱奖励，先去垂钓众生收集鱼谱吧。");
      }

      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, usr_qq + ".json"));
      transaction.capture(path.join(__PATH.najie_path, usr_qq + ".json"));
      try {
        for (const reward of rewards) {
          await Add_najie_thing(
            usr_qq,
            reward.name,
            reward.class,
            reward.amount,
            undefined,
            1,
            { idempotencyKey: "fish-atlas:" + usr_qq + ":" + reward.key + ":" + reward.name }
          );
        }
        // 套装奖励会消耗对应位面每种渔获各1条，防止无限重复兑换
        consumeFishAtlasSets(player, rewards);
        markFishAtlasRewardsClaimed(player, rewards);
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
        const plane = reward.consume.plane;
        consumed.set(plane, (consumed.get(plane) || 0) + (Number(reward.consume.amount) || 0));
      }
      const consumedLines = [...consumed.entries()]
        .map(([plane, amount]) => plane + "渔获各" + amount + "条");
      return e.reply([
        "鱼谱奖励领取成功：",
        ...[...grouped.values()].map(reward => "【" + reward.name + "】x" + reward.amount),
        "共" + rewards.length + "项收集奖励已到账。",
        ...(consumedLines.length > 0
          ? ["兑换套装已消耗：" + consumedLines.join("，") + "。"]
          : []),
      ].join("\n"));
    });
  }
  async showFishAtlas(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    const player = await Read_player(usr_qq);
    if (!player) return true;
    const query = String(e.msg).replace(/^#众生鱼图鉴\s*/, "").trim();
    if (query === "全部") {
      const atlases = FISHING_PLANE_NAMES.map(plane => getPlaneFishAtlas(player, plane));
      return e.reply([
        "【众生鱼图鉴·诸天总览】",
        ...atlases.map(atlas => `${atlas.plane}：${atlas.collected}/${atlas.total}`),
        `总进度：${atlases.reduce((sum, atlas) => sum + atlas.collected, 0)}/${atlases.reduce((sum, atlas) => sum + atlas.total, 0)}`,
      ].join("\n"));
    }
    const plane = query || getPlayerPlaneName(player);
    const atlas = getPlaneFishAtlas(player, plane);
    if (!atlas) return e.reply(`【${plane || "当前位面"}】尚未收录众生鱼谱。`);
    return e.reply([
      `【众生鱼图鉴·${plane}】${atlas.collected}/${atlas.total}`,
      ...atlas.entries.map(entry =>
        `${entry.king ? "鱼王" : "渔获"}｜${entry.name}：${entry.count > 0 ? `x${entry.count}` : "未发现"}`
      ),
    ].join("\n"));
  }

  async showFishingTide(e) {
    const worldYear = getCurrentWorldYear();
    const tide = getFishingTide(worldYear);
    if (!tide.active) {
      return e.reply([
        "【万界潮汐·沉寂期】",
        `当前世界年份：${worldYear}`,
        `下一轮潮汐将在${tide.remainingYears}年后刷新，持续${TIDE_DURATION_YEARS}年。`,
      ].join("\n"));
    }
    return e.reply([
      `【万界潮汐·${tide.name}】`,
      `当前世界年份：${worldYear}`,
      `旺潮位面：${tide.planes.join("、")}`,
      `剩余时间：${tide.remainingYears}年`,
      "旺潮位面的珍稀鱼概率提高，鱼王出现率由1%提升至2%。",
    ].join("\n"));
  }

  async chooseFishingEvent(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) return true;
      const pending = player.垂钓位面奇遇;
      if (!pending || Number(pending.expiresAt) <= Date.now()) {
        if (pending) {
          delete player.垂钓位面奇遇;
          await Write_player(usr_qq, player);
        }
        await e.reply("当前没有等待选择的垂钓奇遇。");
        return true;
      }

      const event = getPlaneFishingEventById(pending.eventId);
      if (!event) {
        delete player.垂钓位面奇遇;
        await Write_player(usr_qq, player);
        return e.reply("这段垂钓奇遇已经随界潮消散。");
      }
      const choiceNumber = Number(String(e.msg).match(/[1-3]$/)?.[0]);
      if (!choiceNumber) {
        await e.reply([
          `【${event.title}】`,
          event.intro,
          ...event.choices.map((choice, index) => `${index + 1}. ${choice.label}`),
          "发送 #垂钓奇遇 1/2/3 作出选择。",
        ].join("\n"));
        return true;
      }

      const choice = getPlaneFishingEventChoice(pending.eventId, choiceNumber);
      if (!choice) return e.reply("这条奇遇没有对应选择。");
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${usr_qq}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));
      try {
        for (const item of choice.items || []) {
          await Add_najie_thing(usr_qq, item.name, item.class, item.amount);
        }
        for (const [field, amount] of Object.entries(choice.playerAdds || {})) {
          player[field] = (Number(player[field]) || 0) + amount;
        }
        for (const [field, value] of Object.entries(choice.playerFlags || {})) {
          player[field] = value;
        }
        if (choice.sourceStone) {
          player.源石 = (Number(player.源石) || 0) + choice.sourceStone;
        }
        delete player.垂钓位面奇遇;
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      await e.reply(`【${event.title}·${choice.label}】\n${choice.message}`);
      return true;
    });
  }

  async wishScaleExchange(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) {
        await e.reply("你还未踏入修仙界，请先发送【#踏入仙途】");
        return true;
      }

      const scaleCount = await exist_najie_thing(usr_qq, "众生愿鳞", "道具");
      const exchangeName = parseWishScaleExchange(e.msg);
      if (!exchangeName) {
        const lines = WISH_SCALE_EXCHANGE_NAMES.map(name => {
          const config = getWishScaleExchangeConfig(name);
          return `${config.cost}愿鳞：${name}x${config.reward.amount}`;
        });
        await e.reply(
          [
            `【众生愿鳞兑换】当前持有：${scaleCount}`,
            ...lines,
            "炼器材料为四选一，直接发送：#愿鳞兑换 宇宙核心（或界核/鸿蒙道火/三千弱水）",
          ].join("\n")
        );
        return true;
      }

      const config = getWishScaleExchangeConfig(exchangeName);
      if (!config) {
        await e.reply(`兑换表中没有【${exchangeName}】，发送【#愿鳞兑换】查看。`);
        return true;
      }
      if (config.unique) {
        if (config.unlockFlag && player[config.unlockFlag]) {
          await e.reply(`你已经参悟【${config.reward.name}】，无需重复兑换。`);
          return true;
        }
        const owned = await exist_najie_thing(
          usr_qq,
          config.reward.name,
          config.reward.class
        );
        if (owned > 0) {
          await e.reply(`你已经持有绑定道具【${config.reward.name}】，无需重复兑换。`);
          return true;
        }
      }
      if (scaleCount < config.cost) {
        await e.reply(`众生愿鳞不足：${scaleCount}/${config.cost}。`);
        return true;
      }

      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));
      try {
        await Add_najie_thing(usr_qq, "众生愿鳞", "道具", -config.cost);
        await Add_najie_thing(
          usr_qq,
          config.reward.name,
          config.reward.class,
          config.reward.amount
        );
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }

      await e.reply(
        `兑换成功：消耗众生愿鳞x${config.cost}，获得【${config.reward.name}】x${config.reward.amount}。`
      );
      return true;
    });
  }

  async showBaits(e) {
    const lines = IMMORTAL_BAIT_NAMES.map(name => {
      const config = getImmortalBaitConfig(name);
      const rewards = config.rewards.map(reward => reward.name).join("、");
      return `【${name}】${config.effect}\n渔获：${rewards}`;
    });
    await e.reply(
      [
        "【众生仙饵】",
        ...lines,
        "仙饵制作：#合成仙饵名",
        "使用：#垂钓众生 仙饵名",
        "轮回冥饵钓出仙武界坐标的概率为2.5%，每人仅能获得一次；彼岸轮回果概率为0.1%。",
      ].join("\n")
    );
    return true;
  }

  async seekWuzu(e) {
    const usr_qq = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(usr_qq, async () => {
      const player = await Read_player(usr_qq);
      if (!player) {
        await e.reply("你还未踏入修仙界，请先发送【#踏入仙途】");
        return true;
      }

      const coordinateCount = await exist_najie_thing(
        usr_qq,
        "仙武界坐标",
        "道具"
      );
      if (!player.仙武界坐标已获得 && coordinateCount < 1) {
        await e.reply("你尚未寻得仙武界坐标，无法定位武祖叶萧。", true);
        return true;
      }
      if (player.武祖叶萧认可) {
        await e.reply("武祖叶萧已认可你的道途，无需再次寻找。", true);
        return true;
      }

      const fruitCount = await exist_najie_thing(
        usr_qq,
        "彼岸轮回果",
        "材料"
      );
      const eraCount = await exist_najie_thing(usr_qq, "纪元之力", "材料");
      if (fruitCount < 10 || eraCount < 10) {
        await e.reply(
          `武祖叶萧审视着你的积累：彼岸轮回果 ${fruitCount}/10，纪元之力 ${eraCount}/10。`,
          true
        );
        return true;
      }

      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${usr_qq}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));

      try {
        await Add_najie_thing(usr_qq, "彼岸轮回果", "材料", -10);
        await Add_najie_thing(usr_qq, "纪元之力", "材料", -10);
        await Add_najie_thing(usr_qq, "武祖权柄", "道具", 1);
        player.仙武界坐标已获得 = true;
        player.武祖叶萧认可 = true;
        await Write_player(usr_qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }

      await e.reply(
        "你循坐标抵达仙武界。武祖叶萧以武道天心熔炼十枚彼岸轮回果与十缕纪元之力，赐下【武祖权柄】。",
        true
      );
      return true;
    });
  }
}

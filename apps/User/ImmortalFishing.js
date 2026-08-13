import path from "path";
import { plugin } from "../../api/api.js";
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
  IMMORTAL_BAIT_NAMES,
  WISH_SCALE_EXCHANGE_NAMES,
  getImmortalBaitConfig,
  getWishScaleExchangeConfig,
  parseWishScaleExchange,
} from "../../model/immortalFishing.js";

export class ImmortalFishing extends plugin {
  constructor() {
    super({
      name: "诸天仙饵与仙武界",
      dsc: "查看众生仙饵、兑换愿鳞并寻找武祖叶萧",
      event: "message",
      priority: 600,
      rule: [
        { reg: "^#众生仙饵$", fnc: "showBaits" },
        { reg: "^#愿鳞兑换(?:\\s+.*)?$", fnc: "wishScaleExchange" },
        { reg: "^#寻找武祖$", fnc: "seekWuzu" },
      ],
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

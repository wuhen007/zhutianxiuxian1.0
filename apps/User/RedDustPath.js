import { plugin, verc } from "../../api/api.js";
import {
  existplayer,
  Read_player,
  Write_player,
  channel,
} from "../../model/xiuxian.js";
import {
  RED_DUST_VOWS,
  createRedDustPath,
  formatRedDustProgress,
  getRedDustLifeInfo,
  getRedDustVow,
} from "../../model/redDustPath.js";

const RED_DUST_TIANJI_COST = 5_000_000;

export class RedDustPath extends plugin {
  constructor() {
    super({
      name: "RedDustPath",
      dsc: "红尘仙天机",
      event: "message",
      priority: 610,
      rule: [
        { reg: "^#打听天机\\s+红尘仙$", fnc: "askRedDust" },
        { reg: "^#推演红尘仙$", fnc: "showRedDustOmen" },
        { reg: "^#立下世愿\\s*(化凡|争渡|逆天)$", fnc: "makeRedDustVow" },
        { reg: "^#我的红尘仙路$", fnc: "showRedDustPath" },
      ],
    });
  }

  async getPlayer(e) {
    if (!verc({ e })) return null;
    const usrQQ = await channel(e.user_id.toString().replace("qg_", ""));
    if (!(await existplayer(usrQQ))) return null;
    return { usrQQ: usrQQ.toString(), player: await Read_player(usrQQ) };
  }

  async askRedDust(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { usrQQ, player } = context;
    if ((player.mijinglevel_id || 0) < 16) {
      return e.reply("只有大帝境，才有资格向天机老人追问红尘仙法。");
    }
    if (player.mijinglevel_id >= 17) {
      return e.reply("你已九世圆满、红尘为仙，无须再向天机追问此法。");
    }

    const existing = formatRedDustProgress(player).path;
    if (existing?.unlocked) {
      return e.reply(
        "你已听见《红尘仙法总纲》。请使用【#推演红尘仙】查看此世命题。"
      );
    }
    if ((Number(player.源石) || 0) < RED_DUST_TIANJI_COST) {
      return e.reply(
        [
          "【天机不可轻泄】",
          `追问红尘仙法需要${RED_DUST_TIANJI_COST.toLocaleString(
            "zh-CN"
          )}源石。`,
          `你当前拥有${(Number(player.源石) || 0).toLocaleString(
            "zh-CN"
          )}源石。`,
        ].join("\n")
      );
    }

    player.源石 -= RED_DUST_TIANJI_COST;
    player.红尘仙路 = createRedDustPath(player);
    await Write_player(usrQQ, player);
    return e.reply(
      [
        "【红尘仙法·总纲】",
        "天机老人没有告诉你一颗丹药或一件宝物的名字。",
        "“红尘仙不是转世重来，而是同一条命，九次斩旧生新。”",
        "你已知晓九世命题。每一世仍需推演本人的生门，并立下世愿。",
        `花费：${RED_DUST_TIANJI_COST.toLocaleString("zh-CN")}源石`,
        "下一步：#推演红尘仙",
      ].join("\n")
    );
  }

  async showRedDustOmen(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { player } = context;
    const { path, currentLife, completed } = formatRedDustProgress(player);
    if (!path?.unlocked) {
      return e.reply("你还不知道红尘仙法。请先使用【#打听天机 红尘仙】。");
    }
    if (currentLife >= 10 || player.mijinglevel_id >= 17) {
      return e.reply("九世道痕已经圆满，你已走过红尘仙路。");
    }

    const info = getRedDustLifeInfo(currentLife);
    const vow = getRedDustVow(path.vow);
    return e.reply(
      [
        `【红尘仙路·第${currentLife}世】`,
        `命题：${info.name}`,
        `心魔：${info.demon}`,
        `天机：${info.clue}`,
        "",
        "可立世愿：",
        ...Object.values(RED_DUST_VOWS).map(
          (item) => `- ${item.id}：${item.description}`
        ),
        "",
        `当前世愿：${vow ? vow.name : "未立"}`,
        `已凝聚世印：${completed}/9`,
        path.ashes
          ? `劫灰：${path.ashes}（每道使下次心魔威能降低2%，最多20%）`
          : "",
        vow
          ? "已立愿，可使用【#逆活九世】"
          : "选择后使用【#立下世愿 化凡/争渡/逆天】",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  async makeRedDustVow(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { usrQQ, player } = context;
    const path = formatRedDustProgress(player).path;
    if (!path?.unlocked) {
      return e.reply("你还没有红尘仙法总纲。请先使用【#打听天机 红尘仙】。");
    }
    const vow = getRedDustVow(e.msg.replace(/^#立下世愿\s*/, ""));
    if (!vow) return e.reply("世愿只能选择：化凡、争渡或逆天。");
    if (player.mijinglevel_id >= 17 || (player.nihuo_count || 1) >= 10) {
      return e.reply("你已走完九世，不必再立世愿。");
    }
    if (path.vow) {
      return e.reply(
        `本世已经立下【${
          getRedDustVow(path.vow)?.name || path.vow
        }】，不能中途改愿。`
      );
    }

    player.红尘仙路 = {
      ...path,
      life: player.nihuo_count || path.life || 1,
      vow: vow.id,
    };
    await Write_player(usrQQ, player);
    return e.reply(
      [
        `【立下世愿·${vow.name}】`,
        vow.description,
        "世愿一旦立下，本世逆活开始前不可更改。",
        "完成准备后使用【#逆活九世】。",
      ].join("\n")
    );
  }

  async showRedDustPath(e) {
    const context = await this.getPlayer(e);
    if (!context) return false;
    const { player } = context;
    const { path, currentLife, completed } = formatRedDustProgress(player);
    if (!path?.unlocked) return e.reply("你尚未踏上红尘仙路。");
    const vow = getRedDustVow(path.vow);
    const seals = path.seals.length
      ? path.seals.map((seal) => `第${seal.life}世·${seal.vow}`).join("、")
      : "暂无";
    return e.reply(
      [
        "【我的红尘仙路】",
        `总纲：已知｜世印：${completed}/9`,
        currentLife >= 10 || player.mijinglevel_id >= 17
          ? "状态：九世圆满，红尘为仙"
          : `当前：第${currentLife}世·${getRedDustLifeInfo(currentLife).name}`,
        `世愿：${vow ? vow.name : "未立"}`,
        player.红尘道果 ? `道果：${player.红尘道果}` : "",
        `已成道痕：${seals}`,
        path.ashes ? `劫灰：${path.ashes}` : "",
        currentLife < 10 && player.mijinglevel_id < 17
          ? "使用【#推演红尘仙】查看本世天机。"
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

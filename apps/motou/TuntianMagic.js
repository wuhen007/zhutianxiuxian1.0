import { plugin, verc } from "../../api/api.js";
import {
  Read_player,
  Write_player,
  channel,
  existplayer,
} from "../../model/xiuxian.js";
import {
  SAINT_REMAINS_COOLDOWN_MS,
  TUNTIAN_HOLY_LANDS,
  TUNTIAN_SOURCE_TARGET,
  attemptSaintRemains,
  ensureTuntianState,
  getSaintRemainsAvailability,
  getTuntianEligibility,
  hasTuntianTechnique,
} from "../../model/tuntianMagic.js";
import { withPlayerMutationLock } from "../../utils/playerMutationLock.js";

const activeDevours = new Set();

function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours ? `${hours}小时` : ""}${minutes ? `${minutes}分钟` : ""}`;
}

function formatTuntianFailure(result) {
  if (result?.reason === "avatar_loaded") {
    return `当前正装载化身【${result.avatarName}】，请先发送 #装载化身 本源，再运转吞天魔功。`;
  }
  return result?.reason || "吞天魔功暂时无法运转。";
}

export class TuntianMagic extends plugin {
  constructor() {
    super({
      name: "TuntianMagic",
      dsc: "吞天魔功邪道玩法",
      event: "message",
      priority: 600,
      rule: [
        { reg: "^#吞天魔功$", fnc: "showProgress" },
        { reg: "^#吞噬(?:先贤)?遗骸(?:\\s+(.+))?$", fnc: "devourRemains" },
      ],
    });
  }

  async getPlayer(e) {
    let qq = e.user_id.toString().replace("qg_", "");
    qq = await channel(qq);
    if (!(await existplayer(qq))) return null;
    return { qq, player: await Read_player(qq) };
  }

  async showProgress(e) {
    if (!verc({ e })) return false;
    const result = await this.getPlayer(e);
    if (!result) return false;
    const { player } = result;

    if (!hasTuntianTechnique(player))
      return e.reply("你尚未学会【吞天魔功】。");
    if (player.灵根?.name === "混沌体") {
      return e.reply("【吞天魔功】万般本源归一，你已蜕变为【混沌体】。");
    }
    const eligibility = getTuntianEligibility(player);
    if (!eligibility.ok) return e.reply(formatTuntianFailure(eligibility));

    const state = ensureTuntianState(player);
    const availability = getSaintRemainsAvailability(player);
    const remainsStatus =
      availability.waitMs > 0
        ? `祖陵潜入冷却：${formatDuration(availability.waitMs)}`
        : "祖陵潜入：可行动";
    return e.reply(
      [
        "【吞天魔功·本源之路】",
        `当前体质：${player.灵根.name}`,
        `吞天本源：${state.本源}/${TUNTIAN_SOURCE_TARGET}`,
        `魔道值：${Math.floor(Number(player.魔道值) || 0)}`,
        remainsStatus,
        "本源来源：#吞噬先贤遗骸 [圣地]，或彻底击杀位面天骄。",
      ].join("\n")
    );
  }

  async devourRemains(e) {
    if (!verc({ e })) return false;
    const result = await this.getPlayer(e);
    if (!result) return false;
    const { qq } = result;
    if (activeDevours.has(qq))
      return e.reply("吞天魔功正在炼化本源，请稍后再试。");

    activeDevours.add(qq);
    try {
      return await withPlayerMutationLock(qq, async () => {
      const player = await Read_player(qq);
      const eligibility = getTuntianEligibility(player);
      if (!eligibility.ok) return e.reply(formatTuntianFailure(eligibility));
      if (Number(player.power_place) !== 2) {
        return e.reply("先贤祖陵皆在遮天位面，你需先抵达北斗星域。");
      }
      const actionRaw = await redis.get(`xiuxian:player:${qq}:action`);
      if (actionRaw) {
        try {
          const action = JSON.parse(actionRaw);
          if (Number(action?.end_time) > Date.now()) {
            return e.reply(`你正在${action.action}中，无法潜入圣地祖陵。`);
          }
        } catch {}
      }

      const requested = e.msg
        .match(/^#吞噬(?:先贤)?遗骸(?:\s+(.+))?$/)?.[1]
        ?.trim();
      if (requested && !TUNTIAN_HOLY_LANDS.includes(requested)) {
        return e.reply(`可潜入的圣地：${TUNTIAN_HOLY_LANDS.join("、")}`);
      }
      const holyLand =
        requested ||
        TUNTIAN_HOLY_LANDS[
          Math.floor(Math.random() * TUNTIAN_HOLY_LANDS.length)
        ];
      const devour = attemptSaintRemains(player, holyLand);
      if (!devour.attempted) {
        if (devour.reason === "avatar_loaded") {
          return e.reply(formatTuntianFailure(devour));
        }
        const wait =
          devour.waitMs > 0 ? `，还需${formatDuration(devour.waitMs)}` : "";
        return e.reply(`${devour.reason}${wait}`);
      }

      await Write_player(qq, player);
      if (!devour.success) {
        return e.reply(
          [
            `【${holyLand}·祖陵惊变】`,
            "圣地守陵阵纹骤然复苏，你只得斩断气机退走。",
            `本次未能取得先贤本源，${
              SAINT_REMAINS_COOLDOWN_MS / 3600000
            }小时后可再次潜入。`,
          ].join("\n")
        );
      }

      return e.reply(
        [
          `【${holyLand}·吞噬先贤】`,
          "吞天魔功化作大道宝瓶，将遗骸中的道则与生命精粹尽数炼化。",
          `吞天本源：${devour.count}/${devour.target}｜魔道值 +20`,
          devour.evolved ? "万道熔于一炉，你已蜕变为【混沌体】！" : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
      });
    } catch (error) {
      console.error("吞噬先贤遗骸失败:", error);
      return e.reply("吞天魔功运转异常，本次未能吞噬本源。");
    } finally {
      activeDevours.delete(qq);
    }
  }
}

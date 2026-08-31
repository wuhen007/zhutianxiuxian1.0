import { data, plugin, verc } from "../../api/api.js";
import RealmEvents from "../tasks/RealmEvents.js";
import {
  formatRealmEventLocation,
  formatRealmEventTravel,
  getRealmEventReach,
} from "../../model/realmEventLocation.js";
import {
  ForwardMsg,
  Read_equipment,
  Read_player,
  Write_equipment,
  Write_player,
  channel,
  existplayer,
  zd_battle,
} from "../../model/xiuxian.js";
import {
  REFINEMENT_ORB_TARGET,
  TIANMO_HUASHENG_TECHNIQUE,
  WANHUA_TIANMO_PHYSIQUE,
  applyTianmoRefinement,
  createTianmoTrialOpponent,
  ensureTianmoHuashengState,
  getRefinementAvailability,
  grantTianmoHuashengTechnique,
  hasTianmoHuashengTechnique,
  isTianmoHuashengPhysique,
} from "../../model/tianmoHuasheng.js";
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  FORBIDDEN_COOLDOWN_MS,
  forbiddenCooldownKey,
  getForbiddenProtection,
  protectForbiddenTarget,
} from '../../model/forbiddenSoul.js';
import {
  WANHUA_BANNER_NAME,
  formatWanhuaBannerStatus,
} from '../../model/wanhuaBanner.js';
import { getLifeSourceRepairMaximum } from '../../model/lifeSourceRepair.js';
import { getMinggeEffects } from '../../model/mingge.js';

const activeRefinements = new Set();

function formatDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days ? `${days}天` : "",
    hours ? `${hours}小时` : "",
    minutes ? `${minutes}分钟` : "",
  ]
    .filter(Boolean)
    .join("");
}

function formatNumber(value) {
  return Math.floor(Number(value) || 0).toLocaleString("zh-CN");
}

function getActiveAction(actionValue) {
  if (!actionValue) return null;
  try {
    const action = JSON.parse(actionValue);
    return action && Date.now() <= Number(action.end_time) ? action : null;
  } catch {
    return null;
  }
}

function isProtectedWeakTarget(executor, target) {
  if (
    (Number(executor.level_id) || 0) > 41 &&
    (Number(target.level_id) || 0) <= 41
  ) {
    return true;
  }
  return (
    (Number(executor.level_id) || 0) >= 12 &&
    (Number(target.level_id) || 0) < 12
  );
}

export class TianmoHuasheng extends plugin {
  constructor() {
    super({
      name: "TianmoHuasheng",
      dsc: "天魔化生功邪修玩法",
      event: "message",
      priority: 600,
      rule: [
        { reg: "^#进入万相魔冢$", fnc: "enterWanxiangTomb" },
        { reg: "^#天魔炼化.*$", fnc: "refinePlayer" },
        { reg: "^#天魔化生$", fnc: "showProgress" },
        { reg: "^#(万灵魔幡|魔幡状态)$", fnc: "showWanhuaBanner" },
      ],
    });
  }

  async showWanhuaBanner(e) {
    if (!verc({ e })) return false;
    let qq = e.user_id.toString().replace("qg_", "");
    qq = await channel(qq);
    if (!(await existplayer(qq))) return false;

    const [player, equipment] = await Promise.all([
      Read_player(qq),
      Read_equipment(qq),
    ]);
    if (player.灵根?.name !== WANHUA_TIANMO_PHYSIQUE) {
      return e.reply("只有【无相·万化天魔体】能够承载万灵魔幡中的无尽怨魂。");
    }
    const resonance = equipment?.法宝?.name === WANHUA_BANNER_NAME
      ? "已装备，万灵魔域可在战斗中展开"
      : `未装备${WANHUA_BANNER_NAME}，炼魂效果暂不生效`;
    return e.reply(`${formatWanhuaBannerStatus(player)}\n当前共鸣：${resonance}`);
  }

  async enterWanxiangTomb(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply("万相魔冢只能在群聊中进入。");

    let qq = e.user_id.toString().replace("qg_", "");
    qq = await channel(qq);
    if (!(await existplayer(qq))) return false;
    if (activeRefinements.has(qq)) return e.reply("你正在进行另一场天魔试炼。");

    activeRefinements.add(qq);
    try {
      const player = await Read_player(qq);
      if (player.灵根?.name !== "极道天魔") {
        return e.reply("只有【极道天魔】能够进入万相魔冢。");
      }
      if (hasTianmoHuashengTechnique(player)) {
        return e.reply("你已获得【天魔化生功】，无需再次接受传承。");
      }

      const event = RealmEvents.getActiveEvent("tianmoHuashengLegacy");
      if (!event) return e.reply("万相魔冢尚未现世，或本次传承已经结束。");
      const reach = getRealmEventReach(player, event);
      if (!reach.ok) {
        return e.reply([
          `万相魔冢位于${formatRealmEventLocation(event)}，你尚未抵达。`,
          formatRealmEventTravel(event),
        ].filter(Boolean).join("\n"));
      }
      if (player.万化天魔传承试炼?.事件时间 === event.timestamp) {
        return e.reply("本次万相魔冢试炼你已经挑战过了。");
      }

      const action = getActiveAction(
        await redis.get(`xiuxian:player:${qq}:action`)
      );
      if (action) return e.reply(`你正在${action.action}中，无法进入魔冢。`);
      if ((Number(player.当前血量) || 0) <= 0) {
        return e.reply("你已身受重创，无法承受万灵怨念。");
      }

      player.法球倍率 = Number(player.灵根.法球倍率) || 0;
      const opponent = createTianmoTrialOpponent(player);
      const A_player = { ...player };
      const B_player = { ...opponent };
      const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player);
      if (blackEmperorFormation.consumed) await Write_player(qq, player);
      const battle = await zd_battle(A_player, B_player);
      if (blackEmperorFormation.message && Array.isArray(battle.msg)) battle.msg.unshift(blackEmperorFormation.message);
      const succeeded = battle.winner === "A";
      player.当前血量 = Math.max(0, Number(battle.A_hp) || 0);
      player.万化天魔传承试炼 = {
        事件时间: event.timestamp,
        挑战时间: Date.now(),
        结果: succeeded ? "通过" : "失败",
      };
      if (succeeded) grantTianmoHuashengTechnique(player);
      await Write_player(qq, player);

      if (battle.msg?.length <= 35) {
        try {
          await ForwardMsg(e, battle.msg);
        } catch (error) {
          console.error("发送万相魔冢战报失败:", error);
        }
      }

      return e.reply(
        succeeded
          ? "【万化天魔传承】你炼尽万灵怨胎，获得禁忌功法【天魔化生功】！"
          : "【万化天魔传承】你被万灵怨胎击败，本次传承试炼失败。"
      );
    } catch (error) {
      console.error("万相魔冢试炼失败:", error);
      return e.reply(`万相魔冢试炼异常：${error.message}`);
    } finally {
      activeRefinements.delete(qq);
    }
  }

  async showProgress(e) {
    if (!verc({ e })) return false;
    let qq = e.user_id.toString().replace("qg_", "");
    qq = await channel(qq);
    if (!(await existplayer(qq))) return false;

    const player = await Read_player(qq);
    if (!isTianmoHuashengPhysique(player)) {
      return e.reply("你的根骨无法承载天魔化生之道。");
    }
    if (!hasTianmoHuashengTechnique(player)) {
      const event = RealmEvents.getActiveEvent("tianmoHuashengLegacy");
      if (event) {
        const travel = formatRealmEventTravel(event);
        return e.reply(
          [
            "【万化天魔传承·万相魔冢】",
            `现世地点：${formatRealmEventLocation(event)}`,
            travel ? `赶路方式：${travel}` : "",
            `剩余时间：${formatDuration(Number(event.expiresAt) - Date.now())}`,
            "使用 #进入万相魔冢 接受传承试炼。",
          ].filter(Boolean).join("\n")
        );
      }
      return e.reply("你尚未得到【天魔化生功】传承，需等待位面大事件现世。");
    }

    const state = ensureTianmoHuashengState(player);
    const orb = Number(player.灵根?.法球倍率) || 0;
    const effects = getMinggeEffects(player, data.minggeList);
    const lifeSourceMaximum = getLifeSourceRepairMaximum(player, effects.生命本源额外);
    const remaining = Math.max(
      0,
      Math.ceil((REFINEMENT_ORB_TARGET - orb) / 0.1)
    );
    const availability = getRefinementAvailability(player, "__status__");
    const cooldown =
      availability.waitMs > 0 ? formatDuration(availability.waitMs) : "可炼化";

    return e.reply(
      [
        `【${TIANMO_HUASHENG_TECHNIQUE}】`,
        `当前体质：${player.灵根.name}`,
        `法球倍率：${(orb * 100).toFixed(0)}% / 500%`,
        `攻防生：${player.灵根.攻击} / ${player.灵根.防御} / ${player.灵根.生命}`,
        `生命本源：${player.生命本源} / ${lifeSourceMaximum}`,
        `已炼化：${state.炼化次数}人（含灾厄折算）`,
        `灾厄类炼化：${state.灾厄炼化次数}尊（普通灾厄0.1人，灾厄魔主0.5人）`,
        `距离蜕变：${
          remaining > 0 ? `还需${remaining}次` : `已成${WANHUA_TIANMO_PHYSIQUE}`
        }`,
        `本源状态：${cooldown}`,
      ].join("\n")
    );
  }

  async refinePlayer(e) {
    if (!verc({ e })) return false;
    if (!e.isGroup) return e.reply("天魔炼化只能在群聊中发动。");

    const atTarget = e.message?.find((item) => item.type === "at");
    if (!atTarget) return e.reply("请指定炼化目标：#天魔炼化 @目标");

    let executorQQ = e.user_id.toString().replace("qg_", "");
    let targetQQ = atTarget.qq.toString().replace("qg_", "");
    executorQQ = await channel(executorQQ);
    targetQQ = await channel(targetQQ);
    if (executorQQ === targetQQ) return e.reply("天魔化生功不能炼化自身。");
    if (!(await existplayer(executorQQ))) return false;
    if (!(await existplayer(targetQQ)))
      return e.reply("目标尚未踏入修行，无法炼化。");

    const lockKeys = [executorQQ, targetQQ].sort();
    if (lockKeys.some((key) => activeRefinements.has(key))) {
      return e.reply("相关玩家正在经历另一场天魔炼化，请稍后再试。");
    }

    lockKeys.forEach((key) => activeRefinements.add(key));
    try {
      const [executor, target] = await Promise.all([
        Read_player(executorQQ),
        Read_player(targetQQ),
      ]);
      const now = Date.now();

      if (!isTianmoHuashengPhysique(executor)) {
        return e.reply("只有【极道天魔】一脉能够施展天魔化生功。");
      }
      if (!hasTianmoHuashengTechnique(executor)) {
        return e.reply("你尚未获得【天魔化生功】传承。");
      }

      const availability = getRefinementAvailability(
        executor,
        targetQQ,
        now,
        target
      );
      if (!availability.ok) {
        const wait =
          availability.waitMs > 0
            ? `，还需${formatDuration(availability.waitMs)}`
            : "";
        return e.reply(`${availability.reason}${wait}。`);
      }
      if (isProtectedWeakTarget(executor, target)) {
        return e.reply("天魔亦有傲骨，不可炼化境界相差过大的弱小修士。");
      }
      const protection = getForbiddenProtection(target, now);
      if (protection.protected) {
        return e.reply(`目标仍受禁忌侵害保护，还需${formatDuration(protection.waitMs)}。`);
      }
      const sharedCooldownUntil = Number(await redis.get(forbiddenCooldownKey(executorQQ))) || 0;
      if (sharedCooldownUntil > now) {
        return e.reply(`禁术因果尚未消散，还需${formatDuration(sharedCooldownUntil - now)}。`);
      }

      const [executorAction, targetAction] = await Promise.all([
        redis.get(`xiuxian:player:${executorQQ}:action`),
        redis.get(`xiuxian:player:${targetQQ}:action`),
      ]);
      const activeExecutorAction = getActiveAction(executorAction);
      const activeTargetAction = getActiveAction(targetAction);
      if (activeExecutorAction)
        return e.reply(`你正在${activeExecutorAction.action}中，无法炼化。`);
      if (activeTargetAction)
        return e.reply(
          `${target.名号}正在${activeTargetAction.action}中，无法炼化。`
        );

      const executorHealth = Number(executor.当前血量) || 0;
      const targetHealth = Number(target.当前血量) || 0;
      if (executorHealth <= 0)
        return e.reply("你已身受重创，无法运转天魔化生功。");
      if (targetHealth <= 0)
        return e.reply(`${target.名号}本源沉寂，暂时无法炼化。`);

      const sharedCooldownReserved = await redis.set(
        forbiddenCooldownKey(executorQQ),
        String(now + FORBIDDEN_COOLDOWN_MS),
        { EX: Math.ceil(FORBIDDEN_COOLDOWN_MS / 1000), NX: true }
      );
      if (sharedCooldownReserved !== "OK") {
        return e.reply("禁术因果刚被触发，请稍后查看冷却。");
      }

      executor.法球倍率 = Number(executor.灵根.法球倍率) || 0;
      target.法球倍率 = Number(target.灵根?.法球倍率) || 0;
      const battle = await zd_battle(executor, target);
      if (battle.msg?.length <= 35) await ForwardMsg(e, battle.msg);

      executor.当前血量 = Math.max(0, Number(battle.A_hp) || 0);
      target.当前血量 = Math.max(0, Number(battle.B_hp) || 0);
      if (battle.winner !== "A") {
        await Promise.all([
          Write_player(executorQQ, executor),
          Write_player(targetQQ, target),
        ]);
        return e.reply(`炼化失败，${executor.名号}反被${target.名号}击败。`);
      }

      const result = applyTianmoRefinement(executor, target, {
        targetId: targetQQ,
        now,
      });
      protectForbiddenTarget(target, now);
      executor.法球倍率 = executor.灵根.法球倍率;
      target.当前血量 = 0;

      await Promise.all([
        Write_player(executorQQ, executor),
        Write_player(targetQQ, target),
      ]);
      const equipment = await Read_equipment(executorQQ);
      await Write_equipment(executorQQ, equipment);

      const gain = result.transfer;
      const lines = [
        "【天魔化生·炼尽本源】",
        `${executor.名号}击溃${target.名号}，将其灵根与资质炼作自身魔胎！`,
        `仙道潜力 +${formatNumber(gain.仙道潜力)}`,
        `修为 +${formatNumber(gain.修为)} | 血气 +${formatNumber(gain.血气)}`,
        `寿元 +${formatNumber(gain.寿元)} | 生命本源 +${formatNumber(
          gain.生命本源
        )}`,
        `法球倍率：${(result.previousOrb * 100).toFixed(0)}% -> ${(
          result.currentOrb * 100
        ).toFixed(0)}%`,
        "灵根攻、防、生永久各提升 0.05",
      ];
      if (result.evolved) {
        lines.push(
          "",
          "万灵根性归于一身，诸天形相尽作魔胎！",
          `体质蜕变为【${WANHUA_TIANMO_PHYSIQUE}】！`
        );
      }
      return e.reply(lines.join("\n"));
    } catch (error) {
      console.error("天魔炼化失败:", error);
      return e.reply(`天魔化生功运转失败：${error.message}`);
    } finally {
      lockKeys.forEach((key) => activeRefinements.delete(key));
    }
  }
}

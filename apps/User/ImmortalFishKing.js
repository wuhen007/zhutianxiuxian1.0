import path from "path";
import { plugin } from "../../api/api.js";
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";
import {
  Add_najie_thing,
  __PATH,
  Harm,
  GetPower,
  Read_equipment,
  Read_player,
  Set_HP,
  Write_equipment,
  Write_player,
  channel,
  existplayer,
  exist_najie_thing,
  zd_battle,
} from "../../model/xiuxian.js";
import {
  FISHING_PLANE_NAMES,
  getPlaneFishConfig,
  recordFishCatch,
} from "../../model/immortalFishing.js";
import {
  consumeFishAtlasSets,
  getPendingFishAtlasRewards,
  markFishAtlasRewardsClaimed,
} from "../../model/immortalFishingProgress.js";
import {
  addRelicToBag,
  normalizeRelicState,
} from "../../model/relicSystem.js";
import {
  FISH_KING_MAX_MEMBERS,
  FISH_KING_KILL_LINGSHI,
  FISH_KING_KILL_SOURCE_STONE,
  calculateFishKingCultivationReward,
  calculateFishKingDamage,
  calculateFishKingRescueDamage,
  createFishKingBattleAvatar,
  createFishKingRelicRewards,
  createFishKingRewardAssignments,
  deleteActiveFishKing,
  findFishKingByMemberId,
  findFishKingByTeamId,
  listActiveFishKings,
  getFishKingBattleCooldown,
  readActiveFishKing,
  rollFishKingChestReward,
  rollFishKingRescue,
  saveActiveFishKing,
  tryCreateFishKing,
  withFishKingLock,
} from "../../model/immortalFishKing.js";
import { withPlayerMutationLock } from "../../utils/playerMutationLock.js";
import { FileRollbackTransaction } from "../SecretPlace/rebirthTransaction.js";

function battleCooldownKey(stateId, playerId) {
  return `xiuxian:immortal-fish-king:battle-cd:${stateId}:${playerId}`;
}

function formatNumber(value) {
  return Math.max(0, Math.trunc(Number(value) || 0)).toLocaleString("zh-CN");
}

function getFishKingRescueLines(rescue, state, damage) {
  const damageLine = `鱼王本体遭受${formatNumber(damage)}点大道重创，至多折损最大生命的20%。`;
  if (rescue.id === "rumeng") {
    return [
      "【沉梦惊醒·如梦】",
      "败势将成，喧嚣的众生海忽然沉入死寂，亿万重浪潮如被一只无形之手按平。",
      "月白衣影自沉眠深处缓缓睁眸，诸天星辉随她的呼吸明灭。",
      `如梦望向${state.name}，淡淡言道：“一条小鱼，安敢扰我沉眠？”`,
      "她只抬手拍下一掌，掌影横断界河，鱼王的潮汐化身连同漫天妖云当场粉碎。",
      damageLine,
    ];
  }
  return [
    "【神维垂眸·莫晓羽】",
    "战局倾覆之际，诸天维度骤然静止，时光、因果与浪潮同时失去了流向。",
    "神维宇宙之外，莫晓羽隔着无尽世界投来一眼；那目光高悬众生之上，似在俯观纸上的一粒微尘。",
    `一道念头跨越万古落下，${state.name}的血脉、道则与潮汐化身顷刻被镇杀成虚无。`,
    damageLine,
  ];
}

function createRelicReward(state) {
  // 每名成员 3 件随机品质遗珍（id 按成员+组序区分，可安全去重）
  return createFishKingRelicRewards(state, Math.random);
}

export class ImmortalFishKing extends plugin {
  constructor() {
    super({
      name: "诸天鱼王讨伐",
      dsc: "组队挑战垂钓众生时惊动的位面鱼王",
      event: "message",
      priority: 599,
      rule: [
        { reg: "^#召唤\\S+鱼王.*$", fnc: "summon", permission: "master" },
        { reg: "^#鱼王列表$", fnc: "list" },
        { reg: "^#鱼王状态$", fnc: "status" },
        { reg: "^#鱼王榜$", fnc: "damageList" },
        { reg: "^#加入鱼王讨伐(?:\\s*(\\d+))?$", fnc: "join" },
        { reg: "^#退出鱼王讨伐$", fnc: "leave" },
        { reg: "^#讨伐鱼王$", fnc: "battle" },
        { reg: "^#打开鱼王宝箱(?:\\*\\d+)?$", fnc: "openChest" },
      ],
    });
  }

  async getPlayerContext(e) {
    if (!e.isGroup) {
      await e.reply("鱼王讨伐仅在群聊中进行。");
      return null;
    }
    const playerId = await channel(e.user_id.toString().replace("qg_", ""));
    if (!await existplayer(playerId)) return null;
    const player = await Read_player(playerId);
    return { playerId: String(playerId), player, groupId: String(e.group_id) };
  }

  async summon(e) {
    if (!e.isGroup || !e.group_id) return e.reply("召唤鱼王只能在群聊中进行。");
    const match = String(e.msg || "").trim().match(/^#召唤(.+?)鱼王(?:\s*@.*)?$/);
    const plane = match?.[1]?.trim();
    if (!plane || !FISHING_PLANE_NAMES.includes(plane)) {
      return e.reply("未知位面。可召唤：" + FISHING_PLANE_NAMES.join("、") + "。");
    }

    const atTarget = Array.isArray(e.message)
      ? e.message.find(item => item.type === "at" && String(item.qq || "") !== "all")
      : null;
    if (!atTarget?.qq) return e.reply(`请指定垂钓者，用法：#召唤${plane}鱼王@目标玩家`);
    const targetId = String(await channel(String(atTarget.qq).replace("qg_", "")));
    if (!await existplayer(targetId)) {
      return e.reply("被指定的玩家尚未踏入修仙界，无法成为垂钓者。");
    }
    const target = await Read_player(targetId);
    if (!target) return e.reply("未能读取被指定玩家的修仙存档。");

    const groupId = String(e.group_id);
    const result = await withFishKingLock(groupId, async () => {
      const current = await readActiveFishKing(groupId);
      if (current) {
        return { message: `本群已有【${current.ownerName}的${current.name}】（编号${current.teamId}），请先完成当前讨伐。` };
      }
      const joined = await findFishKingByMemberId(targetId);
      if (joined) {
        return { message: `${target.名号}正在编号${joined.teamId}的鱼王讨伐队伍中，请先退出或完成该次讨伐。` };
      }

      const king = getPlaneFishConfig(plane)?.king;
      if (!king) return { message: `【${plane}】尚未孕育可召唤的鱼王。` };
      const created = await tryCreateFishKing({
        groupId, ownerId: targetId, ownerName: target.名号, plane, king,
        ownerPower: GetPower(target.攻击, target.防御, target.血量上限, target.暴击率),
      });
      if (!created) return { message: "界潮正在紊乱，鱼王召唤失败，请稍后重试。" };
      return { message: [
        `【诸天召王·${plane}】`,
        "一缕因果被炼作钓线，洞穿层层界壁，径直坠入诸天水脉最深处。",
        `${target.名号}掌中凭空浮现一柄众生仙钓，自此成为这场因果的垂钓者。`,
        `界潮倒卷，星河失色——【${king.name}】循着钓线撞入此界！`,
        `讨伐队伍编号：${created.teamId}`,
        `鱼王本体血量：${formatNumber(created.healthMax)}`,
        `发送 #加入鱼王讨伐 ${created.teamId}，随后使用 #讨伐鱼王。`,
      ].join("\n") };
    });
    return e.reply(result.busy ? "界潮正在翻覆，请稍后再召唤鱼王。" : result.message);
  }

  async list(e) {
    const states = await listActiveFishKings();
    if (states.length === 0) {
      return e.reply("当前没有正在讨伐的鱼王。");
    }
    const lines = [
      "【鱼王列表】",
      "发送 #加入鱼王讨伐 编号 可跨群加入对应讨伐队。",
    ];
    states.forEach((state, index) => {
      const members = state.members
        .map(member => member.name || member.id)
        .join("、") || "暂无";
      lines.push(
        (index + 1) + ". 编号" + (state.teamId || "?")
          + "｜垂钓者：" + (state.ownerName || "无名修士")
          + "｜鱼王：" + state.name
          + "｜位面：" + (state.plane || "未知")
          + "｜血量：" + formatNumber(state.health) + "/" + formatNumber(state.healthMax)
          + "｜队员：" + members
          + "｜状态：" + (state.status === "active" && Number(state.health) > 0 ? "可加入" : "结算中")
          + "｜来源群：" + (state.groupId || "未知")
      );
    });
    return e.reply(lines.join("\n"));
  }
  async status(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const state = await readActiveFishKing(context.groupId);
    if (!state) return e.reply("本群当前没有被钓起的位面鱼王。");
    const cooldownMinutes = getFishKingBattleCooldown({
      hasDaoArt: context.player.daofaxianshu == 2,
    }) / 60;
    const lines = state.members.map((member, index) =>
      `${index === 0 ? "垂钓者" : "成员"}：${member.name}｜伤害 ${formatNumber(state.damage[member.id])}`
    );
    const ownerLabel = state.ownerName || "无名修士";
    return e.reply([
      `【${ownerLabel}的${state.name}讨伐队伍】（编号${state.teamId || "?"}）`,
      `位面：${state.plane} ｜ 本体血量：${formatNumber(state.health)}/${formatNumber(state.healthMax)}`,
      `固定速度：${Number(state.speed) || 100} ｜ 灵根：${state.灵根?.name || "潮汐灵根"}`,
      `鱼王秘术：${state.skills?.join("、") || "潮汐冲击"}`,
      "遗珍掉落：每名队员3件随机品质",
      "击杀奖励：每人3组物品+灵石/源石2500w+修为血气（2000w×五维等级）",
      `队伍：${state.members.length}/${FISH_KING_MAX_MEMBERS}`,
      `你的讨伐冷却：${cooldownMinutes}分钟${context.player.daofaxianshu == 2 ? "（道法仙术）" : ""}`,
      ...lines,
      "发送 #加入鱼王讨伐，队员发送 #讨伐鱼王。",
    ].join("\n"));
  }

  async openChest(e) {
    const playerId = await channel(e.user_id.toString().replace("qg_", ""));
    return withPlayerMutationLock(playerId, async () => {
      const amount = Math.min(9999, Math.max(1, Number(e.msg.match(/\*(\d+)$/)?.[1]) || 1));
      const owned = await exist_najie_thing(playerId, "鱼王宝箱", "盒子");
      if (owned < amount) {
        return e.reply(`鱼王宝箱不足：${owned}/${amount}。`);
      }

      const rewards = new Map();
      for (let index = 0; index < amount; index++) {
        const chestRewards = rollFishKingChestReward();
        for (const reward of chestRewards) {
          const key = `${reward.class}:${reward.name}`;
          const current = rewards.get(key) || { ...reward, amount: 0 };
          current.amount += reward.amount;
          rewards.set(key, current);
        }
      }

      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.najie_path, `${playerId}.json`));
      try {
        await Add_najie_thing(playerId, "鱼王宝箱", "盒子", -amount);
        for (const reward of rewards.values()) {
          await Add_najie_thing(playerId, reward.name, reward.class, reward.amount);
        }
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      return e.reply([
        `开启鱼王宝箱x${amount}，获得：`,
        ...[...rewards.values()].map(reward => `【${reward.name}】x${reward.amount}`),
      ].join("\n"));
    });
  }

  async damageList(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const state = await readActiveFishKing(context.groupId);
    if (!state) return e.reply("本群当前没有鱼王伤害记录。");
    const members = [...state.members].sort(
      (a, b) => (Number(state.damage[b.id]) || 0) - (Number(state.damage[a.id]) || 0)
    );
    const ownerLabel = state.ownerName || "无名修士";
    return e.reply([
      `【${ownerLabel}的${state.name}伤害榜】`,
      ...members.map((member, index) =>
        `${index + 1}. ${member.name}：${formatNumber(state.damage[member.id])}`
      ),
    ].join("\n"));
  }

  async join(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const teamNumber = String(e.msg || "").match(/^#加入鱼王讨伐\s*(\d+)?$/)?.[1] || null;
    let targetGroupId = context.groupId;
    if (teamNumber) {
      const target = await findFishKingByTeamId(teamNumber);
      if (!target) return e.reply("没有找到编号 " + teamNumber + " 的鱼王讨伐队伍。");
      targetGroupId = target.groupId;
    }

    const result = await withFishKingLock(targetGroupId, async () => {
      const state = teamNumber
        ? await findFishKingByTeamId(teamNumber)
        : await readActiveFishKing(context.groupId);
      if (!state) {
        return {
          message: teamNumber
            ? "编号 " + teamNumber + " 的鱼王讨伐已经结束。"
            : "本群当前没有可加入的鱼王讨伐。",
        };
      }
      if (state.status !== "active" || Number(state.health) <= 0) {
        return { message: "鱼王已经击杀，当前正在结算，暂时不能加入讨伐队。" };
      }
      if (state.members.some(member => member.id === context.playerId)) {
        const ownerLabel = state.ownerName || "无名修士";
        return { message: "你已经在" + ownerLabel + "的" + state.name + "讨伐队伍中。" };
      }
      const existing = await findFishKingByMemberId(context.playerId);
      if (existing && existing.id !== state.id && existing.status === "active" && Number(existing.health) > 0) {
        return {
          message: "你已经加入编号" + (existing.teamId || "?") + "的鱼王讨伐队，请先退出当前队伍。",
        };
      }
      if (state.members.length >= FISH_KING_MAX_MEMBERS) {
        return { message: "鱼王讨伐队已经满员。" };
      }
      state.members.push({ id: context.playerId, name: context.player.名号 });
      await saveActiveFishKing(state);
      const ownerLabel = state.ownerName || "无名修士";
      return {
        message: "你加入了【" + ownerLabel + "的" + state.name + "讨伐队伍】（编号"
          + state.teamId + "），当前" + state.members.length + "/" + FISH_KING_MAX_MEMBERS + "人。",
      };
    });
    return e.reply(result.busy ? "鱼王正在翻动界潮，请稍后再试。" : result.message);
  }
  async leave(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;
    const memberState = await findFishKingByMemberId(context.playerId);
    if (!memberState) return e.reply("请先发送【#加入鱼王讨伐】或使用鱼王编号加入队伍。");

    const result = await withFishKingLock(memberState.groupId, async () => {
      const state = await readActiveFishKing(memberState.groupId);
      if (!state) return { message: "本群当前没有鱼王讨伐。" };
      if (state.status !== "active" || Number(state.health) <= 0) {
        return { message: "鱼王已经击杀，当前正在结算，暂时不能退出讨伐队。" };
      }
      const index = state.members.findIndex(member => member.id === context.playerId);
      if (index < 0) return { message: "你没有加入鱼王讨伐。" };
      if (context.playerId === state.ownerId) {
        return { message: "你是钓起鱼王的人，必须留在岸边维持钓线。" };
      }
      state.members.splice(index, 1);
      await saveActiveFishKing(state);
      const ownerLabel = state.ownerName || "无名修士";
      return { message: `你退出了【${ownerLabel}的${state.name}讨伐队伍】（编号${state.teamId || "?"}）。` };
    });
    return e.reply(result.busy ? "鱼王正在翻动界潮，请稍后再试。" : result.message);
  }

  async battle(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return true;

    const memberState = await findFishKingByMemberId(context.playerId);
    if (!memberState) return e.reply("请先发送【#加入鱼王讨伐】或使用鱼王编号加入队伍。");

    const result = await withFishKingLock(memberState.groupId, async () => {
      const state = await readActiveFishKing(memberState.groupId);
      if (!state) return { message: "本群当前没有可讨伐的鱼王。" };
      if (!state.members.some(member => member.id === context.playerId)) {
        return { message: "请先发送【#加入鱼王讨伐】。" };
      }
      if (state.status === "settling" || Number(state.health) <= 0) {
        return this.settleFishKing(state);
      }

      const cooldownKey = battleCooldownKey(state.id, context.playerId);
      const battleCooldownSeconds = getFishKingBattleCooldown({
        hasDaoArt: context.player.daofaxianshu == 2,
      });
      if (!await redis.set(cooldownKey, "1", {
        EX: battleCooldownSeconds,
        NX: true,
      })) {
        const seconds = Math.max(1, Number(await redis.ttl(cooldownKey)) || 1);
        return { message: `你刚与鱼王鏖战过，还需休息${Math.ceil(seconds / 60)}分钟。` };
      }

      const boss = createFishKingBattleAvatar(context.player, state);
      const attacker = { ...context.player, 法球倍率: context.player?.灵根?.法球倍率 || 1 };
      const battle = await zd_battle(attacker, boss);
      await Set_HP(context.playerId, battle.A_hp);

      const won = battle.winner === "A";
      const bonusDamage = Harm((Number(context.player.攻击) || 0) * 0.85, boss.防御) * 4;
      const damage = calculateFishKingDamage(state, won, bonusDamage);
      state.health = Math.max(0, Number(state.health) - damage);
      state.damage[context.playerId] = (Number(state.damage[context.playerId]) || 0) + damage;

      const rescue = won ? null : rollFishKingRescue();
      let rescueDamage = 0;
      if (rescue) {
        rescueDamage = calculateFishKingRescueDamage(state, rescue);
        state.health = Math.max(0, Number(state.health) - rescueDamage);
        state.damage[context.playerId] =
          (Number(state.damage[context.playerId]) || 0) + rescueDamage;
      }

      battle.msg.push(
        `${context.player.名号}${won ? "击溃" : "不敌"}${boss.名号}，仍对鱼王本体造成${formatNumber(damage)}伤害。`
      );
      if (rescue) battle.msg.push(...getFishKingRescueLines(rescue, state, rescueDamage));
      battle.msg.push(
        `鱼王本体剩余：${formatNumber(state.health)}/${formatNumber(state.healthMax)}（${rescue ? "救场额外按最大生命20%结算" : "单次伤害至多20%"}）`,
        `本次讨伐后需调息${battleCooldownSeconds / 60}分钟。`
      );

      let settlement = null;
      if (state.health <= 0) {
        state.status = "settling";
        state.rewardAssignments ||= createFishKingRewardAssignments(state.members);
        await saveActiveFishKing(state);
        settlement = await this.settleFishKing(state);
      } else {
        await saveActiveFishKing(state);
      }
      return { battle, settlement };
    });

    if (result.busy) return e.reply("另一名队员正在与鱼王交战，请稍后再试。");
    if (result.message) return e.reply(result.message);
    const imageData = await new Show().get_battleData({ temp: result.battle.msg });
    const image = await puppeteer.screenshot("fight", { ...imageData });
    await e.reply(image);
    if (result.settlement?.message) await e.reply(result.settlement.message);
    return true;
  }

  async settleFishKing(state) {
    state.rewardAssignments ||= createFishKingRewardAssignments(state.members);
    state.relicRewards ||= createRelicReward(state);
    await saveActiveFishKing(state);

    for (const drop of state.rewardAssignments) {
      await Add_najie_thing(
        drop.recipient.id,
        drop.name,
        drop.class,
        drop.amount,
        undefined,
        1,
        { idempotencyKey: `fish-king:${state.id}:drop:${drop.dropIndex}` }
      );
    }
    await Add_najie_thing(
      state.ownerId,
      "鱼王宝箱",
      "盒子",
      1,
      undefined,
      1,
      { idempotencyKey: `fish-king:${state.id}:owner-chest` }
    );

    // 遗珍：每名成员 3 件随机品质（id 去重，重跑安全）
    let relicBagFull = false;
    let relicGrantFailed = false;
    for (const reward of state.relicRewards) {
      if (relicBagFull || relicGrantFailed) break;
      try {
        await withPlayerMutationLock(reward.recipient.id, async () => {
          const equipment = await Read_equipment(reward.recipient.id);
          const relicState = normalizeRelicState(equipment.遗珍);
          const allRelics = [
            ...relicState.背包,
            ...Object.values(relicState.铭刻).flat().filter(Boolean),
          ];
          if (allRelics.some(relic => relic.id === reward.relic.id)) return;
          try {
            equipment.遗珍 = addRelicToBag(relicState, reward.relic);
          } catch (error) {
            if (error.message !== "遗珍背包已满") throw error;
            relicBagFull = true;
            return;
          }
          await Write_equipment(reward.recipient.id, equipment);
        });
      } catch (error) {
        relicGrantFailed = true;
        logger.error(`[鱼王遗珍] 结算失败 fishKing=${state.id}`, error);
      }
    }
    if (relicBagFull) {
      return {
        message: [
          `【${state.name}遗珍结算暂缓】`,
          "部分队员的遗珍背包已满。",
          "常规奖励已锁定；请清理遗珍背包后发送 #讨伐鱼王 继续结算。",
        ].join("\n"),
      };
    }
    if (relicGrantFailed) {
      return {
        message: [
          `【${state.name}遗珍结算暂缓】`,
          "部分队员的装备状态暂时无法写入。",
          "常规奖励已锁定；请稍后发送 #讨伐鱼王 继续结算。",
        ].join("\n"),
      };
    }

    // 货币与修为血气：每人灵石/源石 2500w，修为血气 = 2000w × 五维等级乘积
    const currencyLines = [];
    let currencyFailed = false;
    try {
      for (const member of state.members) {
        const player = await Read_player(member.id);
        if (!player) {
          currencyFailed = true;
          break;
        }
        const cultivation = calculateFishKingCultivationReward(player);
        player.灵石 = (Number(player.灵石) || 0) + FISH_KING_KILL_LINGSHI;
        player.源石 = (Number(player.源石) || 0) + FISH_KING_KILL_SOURCE_STONE;
        player.修为 = (Number(player.修为) || 0) + cultivation;
        player.血气 = (Number(player.血气) || 0) + cultivation;
        await Write_player(member.id, player);
        currencyLines.push(
          `${member.name}获得灵石x${formatNumber(FISH_KING_KILL_LINGSHI)}、源石x${formatNumber(FISH_KING_KILL_SOURCE_STONE)}、修为x${formatNumber(cultivation)}、血气x${formatNumber(cultivation)}`
        );
      }
    } catch (error) {
      currencyFailed = true;
      logger.error(`[鱼王货币] 结算失败 fishKing=${state.id}`, error);
    }
    if (currencyFailed) {
      return {
        message: [
          `【${state.name}货币结算暂缓】`,
          "部分队员的存档暂时无法写入。",
          "常规奖励已锁定；请稍后发送 #讨伐鱼王 继续结算。",
        ].join("\n"),
      };
    }

    let atlasRewards = [];
    await withPlayerMutationLock(state.ownerId, async () => {
      const owner = await Read_player(state.ownerId);
      if (!owner) throw new Error("鱼王垂钓者存档不存在");
      owner.众生鱼王战绩 ||= [];
      if (!owner.众生鱼王战绩.includes(state.id)) {
        recordFishCatch(owner, state.plane, state.name);
        atlasRewards = getPendingFishAtlasRewards(owner);
        for (const reward of atlasRewards) {
          await Add_najie_thing(
            state.ownerId,
            reward.name,
            reward.class,
            reward.amount,
            undefined,
            1,
            { idempotencyKey: "fish-atlas:" + state.ownerId + ":" + reward.key + ":" + reward.name }
          );
        }
        // 套装奖励消耗对应位面每种渔获各1条，防止集齐后无限重复领取
        consumeFishAtlasSets(owner, atlasRewards);
        markFishAtlasRewardsClaimed(owner, atlasRewards);
        owner.众生鱼王战绩.push(state.id);
        owner.众生鱼王战绩 = owner.众生鱼王战绩.slice(-100);
        await Write_player(state.ownerId, owner);
      }
    });

    // 按成员聚合普通物品，逐人展示
    const rewardLines = state.members.map(member => {
      const byName = new Map();
      for (const drop of state.rewardAssignments) {
        if (drop.recipient.id !== member.id) continue;
        const current = byName.get(drop.name) || { name: drop.name, amount: 0 };
        current.amount += drop.amount;
        byName.set(drop.name, current);
      }
      const parts = [...byName.values()]
        .map(item => `【${item.name}】x${item.amount}`)
        .join("、");
      return `${member.name}获得：${parts}`;
    });
    const relicLines = state.members.map(member => {
      const relics = state.relicRewards.filter(reward => reward.recipient.id === member.id);
      return `${member.name}获得遗珍：${relics
        .map(reward => `【${reward.relic.品质}·${reward.relic.套装}】x1`)
        .join("、")}`;
    });
    await deleteActiveFishKing(state.groupId);
    return {
      message: [
        `【${state.name}伏诛】鱼王终于被拖出众生海！`,
        ...rewardLines,
        ...relicLines,
        ...currencyLines,
        ...(atlasRewards.length > 0
          ? ["鱼谱收集奖励：" + atlasRewards.map(reward => "【" + reward.name + "】x" + reward.amount).join("、")]
          : []),
        `${state.ownerName}作为垂钓者，额外获得【鱼王宝箱】x1。`,
      ].join("\n"),
    };
  }
}

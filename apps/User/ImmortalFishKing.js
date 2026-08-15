import path from "path";
import { plugin } from "../../api/api.js";
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";
import {
  Add_najie_thing,
  __PATH,
  Go,
  Harm,
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
import { getPlayerPlaneName } from "../../model/planeCoords.js";
import { recordFishCatch } from "../../model/immortalFishing.js";
import {
  consumeFishAtlasSets,
  markFishAtlasRewardsClaimed,
} from "../../model/immortalFishingProgress.js";
import {
  addRelicToBag,
  createFishKingRelic,
  normalizeRelicState,
} from "../../model/relicSystem.js";
import {
  FISH_KING_MAX_MEMBERS,
  calculateFishKingDamage,
  createFishKingBattleAvatar,
  createFishKingRewardAssignments,
  deleteActiveFishKing,
  findFishKingByTeamId,
  getFishKingBattleCooldown,
  readActiveFishKing,
  rollFishKingChestReward,
  saveActiveFishKing,
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

function createRelicReward(state) {
  const recipient = state.members[Math.floor(Math.random() * state.members.length)];
  return {
    recipient: { ...recipient },
    relic: createFishKingRelic({
      plane: state.plane,
      id: `fish-king-relic:${state.id}`,
    }),
  };
}

export class ImmortalFishKing extends plugin {
  constructor() {
    super({
      name: "诸天鱼王讨伐",
      dsc: "组队挑战垂钓众生时惊动的位面鱼王",
      event: "message",
      priority: 599,
      rule: [
        { reg: "^#鱼王状态$", fnc: "status" },
        { reg: "^#鱼王榜$", fnc: "damageList" },
        { reg: "^#加入鱼王讨伐(?:\\s*(\\d+))?$", fnc: "join" },
        { reg: "^#退出鱼王讨伐$", fnc: "leave" },
        { reg: "^#讨伐鱼王$", fnc: "battle" },
        { reg: "^#打开鱼王宝箱(?:\\*\\d+)?$", fnc: "openChest" },
      ],
    });
  }

  async resolveFishKingContext(e) {
    if (!e.isGroup) {
      await e.reply("鱼王讨伐仅在群聊中进行。");
      return null;
    }
    const playerId = await channel(e.user_id.toString().replace("qg_", ""));
    if (!await existplayer(playerId)) return null;
    const player = await Read_player(playerId);
    return { playerId: String(playerId), player, groupId: String(e.group_id) };
  }

  async status(e) {
    const context = await this.resolveFishKingContext(e);
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
      `速度倍率：${Number(state.speedMultiplier) || 1}倍`,
      `鱼王秘术：${state.skills?.join("、") || "潮汐冲击"}`,
      "遗珍掉落：必定1件，讨伐队员随机获得",
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
        const reward = rollFishKingChestReward();
        const key = `${reward.class}:${reward.name}`;
        const current = rewards.get(key) || { ...reward, amount: 0 };
        current.amount += reward.amount;
        rewards.set(key, current);
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
    const context = await this.resolveFishKingContext(e);
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
    const context = await this.resolveFishKingContext(e);
    if (!context) return true;
    const teamNumber = String(e.msg || "").match(/^#加入鱼王讨伐\s*(\d+)?$/)?.[1] || null;
    const result = await withFishKingLock(context.groupId, async () => {
      let state;
      if (teamNumber) {
        state = await findFishKingByTeamId(teamNumber);
        if (!state) return { message: `没有找到编号 ${teamNumber} 的鱼王讨伐队伍。` };
        if (state.groupId !== context.groupId) {
          return { message: `编号 ${teamNumber} 的讨伐队伍不在本群，无法加入。` };
        }
      } else {
        state = await readActiveFishKing(context.groupId);
        if (!state) return { message: "本群当前没有可加入的鱼王讨伐。" };
      }
      if (state.status !== "active" || Number(state.health) <= 0) {
        return { message: "鱼王已经击杀，当前正在结算，暂时不能加入讨伐队。" };
      }
      if (getPlayerPlaneName(context.player) !== state.plane) {
        return { message: `鱼王出现在【${state.plane}】，你需要先抵达该位面。` };
      }
      if (state.members.some(member => member.id === context.playerId)) {
        const ownerLabel = state.ownerName || "无名修士";
        return { message: `你已经在${ownerLabel}的${state.name}讨伐队伍中。` };
      }
      if (state.members.length >= FISH_KING_MAX_MEMBERS) {
        return { message: "鱼王讨伐队已经满员。" };
      }
      state.members.push({ id: context.playerId, name: context.player.名号 });
      await saveActiveFishKing(state);
      const ownerLabel = state.ownerName || "无名修士";
      return { message: `你加入了【${ownerLabel}的${state.name}讨伐队伍】（编号${state.teamId}），当前${state.members.length}/${FISH_KING_MAX_MEMBERS}人。` };
    });
    return e.reply(result.busy ? "鱼王正在翻动界潮，请稍后再试。" : result.message);
  }

  async leave(e) {
    const context = await this.resolveFishKingContext(e);
    if (!context) return true;
    const result = await withFishKingLock(context.groupId, async () => {
      const state = await readActiveFishKing(context.groupId);
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
    const context = await this.resolveFishKingContext(e);
    if (!context) return true;
    if (!await Go(e)) return false;
    if (Number(context.player.当前血量) <= Number(context.player.血量上限) * 0.1) {
      return e.reply("你伤势过重，无法下水讨伐鱼王。");
    }

    const result = await withFishKingLock(context.groupId, async () => {
      const state = await readActiveFishKing(context.groupId);
      if (!state) return { message: "本群当前没有可讨伐的鱼王。" };
      if (!state.members.some(member => member.id === context.playerId)) {
        return { message: "请先发送【#加入鱼王讨伐】。" };
      }
      if (getPlayerPlaneName(context.player) !== state.plane) {
        return { message: `鱼王仍在【${state.plane}】，你已无法触及它。` };
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

      battle.msg.push(
        `${context.player.名号}${won ? "击溃" : "不敌"}${boss.名号}，仍对鱼王本体造成${formatNumber(damage)}伤害。`,
        `鱼王本体剩余：${formatNumber(state.health)}/${formatNumber(state.healthMax)}（单次伤害至多20%）`,
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
    state.relicReward ||= createRelicReward(state);
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

    let relicBagFull = false;
    let relicGrantFailed = false;
    try {
      await withPlayerMutationLock(state.relicReward.recipient.id, async () => {
        const equipment = await Read_equipment(state.relicReward.recipient.id);
        const relicState = normalizeRelicState(equipment.遗珍);
        const allRelics = [
          ...relicState.背包,
          ...Object.values(relicState.铭刻).flat().filter(Boolean),
        ];
        if (allRelics.some(relic => relic.id === state.relicReward.relic.id)) return;
        try {
          equipment.遗珍 = addRelicToBag(relicState, state.relicReward.relic);
        } catch (error) {
          if (error.message !== "遗珍背包已满") throw error;
          relicBagFull = true;
          return;
        }
        await Write_equipment(state.relicReward.recipient.id, equipment);
      });
    } catch (error) {
      relicGrantFailed = true;
      logger.error(`[鱼王遗珍] 结算失败 fishKing=${state.id}`, error);
    }
    if (relicBagFull) {
      return {
        message: [
          `【${state.name}遗珍结算暂缓】`,
          `${state.relicReward.recipient.name}被随机选中获得遗珍，但其遗珍背包已满。`,
          "常规奖励已锁定；请清理遗珍背包后发送 #讨伐鱼王 继续结算。",
        ].join("\n"),
      };
    }
    if (relicGrantFailed) {
      return {
        message: [
          `【${state.name}遗珍结算暂缓】`,
          `${state.relicReward.recipient.name}的装备状态暂时无法写入。`,
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

    const lines = state.rewardAssignments.map(drop =>
      `${drop.recipient.name}获得【${drop.name}】x${drop.amount}`
    );
    const relic = state.relicReward.relic;
    await deleteActiveFishKing(state.groupId);
    return {
      message: [
        `【${state.name}伏诛】鱼王终于被拖出众生海！`,
        ...lines,
        `${state.relicReward.recipient.name}获得【${relic.品质}·${relic.套装}遗珍】x1。`,
        ...(atlasRewards.length > 0
          ? ["鱼谱收集奖励：" + atlasRewards.map(reward => "【" + reward.name + "】x" + reward.amount).join("、")]
          : []),
        `${state.ownerName}作为垂钓者，额外获得【鱼王宝箱】x1。`,
      ].join("\n"),
    };
  }
}

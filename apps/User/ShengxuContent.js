import { plugin, verc } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_player,
  Write_player,
  channel,
  exist_najie_thing,
  existplayer,
  zd_battle,
} from '../../model/xiuxian.js';
import { isCultivatingExtraPath } from '../../model/extraCultivation.js';
import {
  SHENGXU_DUNGEONS,
  SHENGXU_FACTIONS,
  createShengxuMonster,
  getShengxuDungeon,
  getShengxuExploreDuration,
  resolveShengxuDungeonReward,
} from '../../model/shengxuContent.js';
import {
  STONE_JAR_CLUE_REQUIREMENT,
  STONE_JAR_OPPORTUNITY,
  claimShengxuOpportunity,
  getShengxuOpportunityOwner,
} from '../../model/shengxuOpportunity.js';
import {
  getFactionDateKey,
  getFactionJoinBlock,
  hasClaimedFactionJoinReward,
  recordFactionJoin,
  wasFactionRewardClaimedToday,
} from '../../model/factionSystem.js';
import { PLACE_LOCATION_MAP, getShanghaiDateKey } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

function battleExcerpt(messages) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= 12) return messages;
  return [...messages.slice(0, 3), '……战斗过程过长，仅展示末段……', ...messages.slice(-8)];
}

function isInShengxuPlane(player) {
  // 圣墟位面三级：小阴间 4 / 大阴间 5 / 阳间 7
  return [PLACE_LOCATION_MAP.小阴间, PLACE_LOCATION_MAP.大阴间, PLACE_LOCATION_MAP.阳间]
    .includes(Number(player?.power_place));
}

function stoneJarRequirements(player) {
  const cleared = Object.keys(player?.圣墟副本通关 || {}).length;
  const clues = Math.max(0, Number(player?.圣墟机缘线索) || 0);
  const extremes = Array.isArray(player?.花粉极境) ? player.花粉极境 : [];
  const missingExtremes = ['无敌画卷', '观想真形'].filter(name => !extremes.includes(name));
  const reasons = [];
  if (Number(player?.huafenlevel_id) < 11) reasons.push('境界需达到映照诸天');
  if (cleared < 6) reasons.push(`需踏破6处不同圣墟副本（当前${cleared}）`);
  if (clues < STONE_JAR_CLUE_REQUIREMENT) reasons.push(`需石罐线索${STONE_JAR_CLUE_REQUIREMENT}枚（当前${clues}）`);
  if (missingExtremes.length) reasons.push(`需极境：${missingExtremes.join('、')}`);
  if (Number(player?.花粉隐患) > 50) reasons.push(`花粉隐患需不高于50（当前${player.花粉隐患}）`);
  return { ok: reasons.length === 0, reasons, cleared, clues };
}

export class ShengxuContent extends plugin {
  constructor() {
    super({
      name: '圣墟内容',
      dsc: '圣墟副本、势力与唯一机缘',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#圣墟副本$', fnc: 'dungeons' },
        { reg: '^#探索圣墟\\s+.+$', fnc: 'explore' },
        { reg: '^#圣墟势力$', fnc: 'factions' },
        { reg: '^#加入(?:菩提基因|大梦净土|阳间第一山)$', fnc: 'joinFaction' },
        { reg: '^#领取圣墟俸禄$', fnc: 'salary' },
        { reg: '^#(?:石罐|石罐机缘)$', fnc: 'stoneJar' },
        { reg: '^#追寻石罐$', fnc: 'claimStoneJar' },
      ],
    });
    // 探索定时结算：每 20 秒检查一次到期的圣墟探索
    this.task = [{
      cron: '*/20 * * * * *',
      name: 'ShengxuExploreTask',
      fnc: () => this.tick(),
    }];
    this.ticking = false;
  }

  async getPlayer(e) {
    let userId = e.user_id.toString().replace('qg_', '');
    userId = await channel(userId);
    if (!(await existplayer(userId))) return null;
    return { userId: String(userId), player: await Read_player(userId) };
  }

  async dungeons(e) {
    if (!verc({ e })) return false;
    const lines = SHENGXU_DUNGEONS.map(dungeon =>
      `【${dungeon.chapter}】${dungeon.name}｜花粉${dungeon.requiredLevel}阶｜${dungeon.monster}｜${dungeon.medium}｜耗时${dungeon.duration}分钟`
    );
    return e.reply(['【圣墟位面副本】', '需先发送 #穿梭小阴间 进入圣墟诸界', ...lines, '探索：#探索圣墟 地点名（每处每日一次，探索耗时结束后自动归来结算）'].join('\n'));
  }

  async explore(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const dungeon = getShengxuDungeon(e.msg.replace(/^#探索圣墟\s+/, ''));
    if (!dungeon) return e.reply(`未知地点。可用：${SHENGXU_DUNGEONS.map(item => item.name).join('、')}`);
    const { userId } = context;
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('只有花粉进化路修士可以进入圣墟副本。');
      if (!isInShengxuPlane(player)) return e.reply('圣墟副本只存在于圣墟诸界（小阴间/大阴间/阳间），请先发送 #穿梭小阴间。');
      if (Number(player.huafenlevel_id) < dungeon.requiredLevel) {
        return e.reply(`探索${dungeon.name}需花粉进化序列达到${dungeon.requiredLevel}，当前为${player.huafenlevel_id}。`);
      }
      if (await redis.get(`xiuxian:player:${userId}:game_action`) == 0) return e.reply('修仙：游戏进行中...');

      // 探索中检查：同一时间只能探索一处圣墟副本
      const exploreKey = `xiuxian:shengxu:explore:${userId}`;
      const activeRaw = await redis.get(exploreKey);
      if (activeRaw) {
        try {
          const active = JSON.parse(activeRaw);
          const remainMs = Number(active.end_time) - Date.now();
          if (remainMs > 0) {
            const m = Math.floor(remainMs / 60000);
            const s = Math.floor((remainMs % 60000) / 1000);
            return e.reply(`你正在探索【${active.dungeonName}】，剩余 ${m} 分 ${s} 秒后归来。`);
          }
          await redis.del(exploreKey);
        } catch {
          // 坏数据直接覆盖
        }
      }

      // 每处每日一次（探索开始日占位）
      const dailyKey = `xiuxian:shengxu:dungeon:${getShanghaiDateKey()}:${dungeon.name}:${userId}`;
      if (!(await redis.set(dailyKey, '1', { EX: 2 * 24 * 60 * 60, NX: true }))) {
        return e.reply(`你今日已经探索过${dungeon.name}。`);
      }

      const durationMin = getShengxuExploreDuration(player, dungeon);
      const now = Date.now();
      const endTime = now + durationMin * 60 * 1000;
      const task = {
        qq: userId,
        playerName: player.名号 || userId,
        groupId: e.isGroup ? e.group_id : null,
        dungeonName: dungeon.name,
        start_time: now,
        end_time: endTime,
      };
      await redis.set(exploreKey, JSON.stringify(task), { EX: 24 * 60 * 60 });
      const endLabel = new Date(endTime).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return e.reply([
        `【${dungeon.name}·开始探索】`,
        `${player.名号 || userId}踏入${dungeon.name}，${dungeon.monster}的气息在深处隐现。`,
        `探索耗时：${durationMin} 分钟`,
        `预计归来：${endLabel}`,
        '探索结束后将自动结算收获。',
      ].join('\n'));
    });
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.settleExplorations();
    } catch (error) {
      console.error('[圣墟副本] 探索结算定时任务失败:', error);
    } finally {
      this.ticking = false;
    }
  }

  async settleExplorations() {
    const now = Date.now();
    const keys = await redis.keys('xiuxian:shengxu:explore:*');
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      let task;
      try {
        task = JSON.parse(raw);
      } catch {
        await redis.del(key);
        continue;
      }
      if (now < Number(task.end_time)) continue;
      try {
        await this.settleExplore(task);
        await redis.del(key);
      } catch (error) {
        console.error(`[圣墟副本] 玩家 ${task.qq} 探索结算失败:`, error);
      }
    }
  }

  async settleExplore(task) {
    const userId = String(task.qq);
    const player = await Read_player(userId);
    if (!player) return;
    const dungeon = getShengxuDungeon(task.dungeonName);
    if (!dungeon) return;

    const attacker = structuredClone(player);
    attacker.当前血量 = Math.max(1, Number(player.血量上限 || player.当前血量) || 1);
    const monster = createShengxuMonster(player, dungeon);
    const battle = await zd_battle(attacker, monster, { battleType: 'shengxu_dungeon' });
    const lines = [
      `【${dungeon.name}·探索归来】`,
      `${task.playerName}在${dungeon.name}深处遭遇【${monster.名号}】！`,
      ...battleExcerpt(battle.msg),
    ];
    const fresh = await Read_player(userId);
    fresh.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(battle.A_hp)) : 1;
    fresh.功法熟练度 = attacker.功法熟练度;
    fresh.功法熟练度每日 = attacker.功法熟练度每日;
    if (battle.winner !== 'A') {
      await Write_player(userId, fresh);
      lines.push('【探索失败】你被异变生灵重创，当前血量降至1。');
      return this.sendExploreResult(task, lines.join('\n'));
    }

    const reward = resolveShengxuDungeonReward(dungeon);
    await Add_najie_thing(userId, reward.medium, '道具', reward.amount);
    if (reward.gongfa) await Add_najie_thing(userId, reward.gongfa, '功法', 1);
    fresh.进化积淀 = Math.max(0, Number(fresh.进化积淀) || 0) + reward.accumulation;
    fresh.圣墟机缘线索 = Math.max(0, Number(fresh.圣墟机缘线索) || 0) + 1;
    fresh.圣墟副本通关 ??= {};
    fresh.圣墟副本通关[dungeon.name] = (Number(fresh.圣墟副本通关[dungeon.name]) || 0) + 1;
    await Write_player(userId, fresh);
    lines.push(
      '【探索胜利】',
      `${reward.medium}×${reward.amount}｜进化积淀+${reward.accumulation}｜石罐线索+1`,
      reward.gongfa ? `获得传承：【${reward.gongfa}】` : '本次未寻得呼吸法传承。'
    );
    return this.sendExploreResult(task, lines.join('\n'));
  }

  async sendExploreResult(task, message) {
    try {
      if (task.groupId) return await this.pushInfo(task.groupId, true, [segment.at(Number(task.qq)), message]);
      return await this.pushInfo(task.qq, false, message);
    } catch (error) {
      console.error(`[圣墟副本] 玩家 ${task.qq} 结算消息发送失败:`, error);
    }
  }

  async factions(e) {
    if (!verc({ e })) return false;
    const lines = Object.entries(SHENGXU_FACTIONS).map(([name, faction]) =>
      `${name}｜需花粉序列${faction.requiredLevel}｜职位：${faction.position}`
    );
    return e.reply(['【圣墟势力】', ...lines, '加入：#加入势力名｜日俸：#领取圣墟俸禄'].join('\n'));
  }

  async joinFaction(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const factionName = e.msg.replace(/^#加入/, '').trim();
    const faction = SHENGXU_FACTIONS[factionName];
    if (!faction) return false;
    return withPlayerMutationLock(context.userId, async () => {
      const player = await Read_player(context.userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('该势力只接引花粉进化路修士。');
      if (!isInShengxuPlane(player)) return e.reply('这些势力扎根于圣墟诸界，请先穿梭至小阴间。');
      if (Number(player.huafenlevel_id) < faction.requiredLevel) return e.reply(`加入${factionName}需花粉进化序列达到${faction.requiredLevel}。`);
      const block = getFactionJoinBlock(player);
      if (!block.ok) return e.reply(block.reason === 'member' ? `你已加入${block.faction}。` : '你尚处于脱离势力冷却期。');
      const firstJoin = !hasClaimedFactionJoinReward(player, factionName);
      player.势力 = factionName;
      player.势力职位 = faction.position;
      recordFactionJoin(player, factionName, faction.position, Date.now(), firstJoin);
      await Write_player(context.userId, player);
      if (firstJoin) await Add_najie_thing(context.userId, faction.medium, '道具', 1);
      return e.reply(`【加入${factionName}】\n身份：${faction.position}${firstJoin ? `\n入门奖励：${faction.medium}×1` : ''}`);
    });
  }

  async salary(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(context.userId, async () => {
      const player = await Read_player(context.userId);
      const faction = SHENGXU_FACTIONS[player.势力];
      if (!faction) return e.reply('你尚未加入圣墟势力。');
      const sharedDateKey = `xiuxian:player:${context.userId}:faction_salary_date`;
      if (wasFactionRewardClaimedToday(await redis.get(sharedDateKey))) return e.reply('你今日已经领取过势力俸禄。');
      const lockKey = `xiuxian:player:${context.userId}:faction_salary_claim:${getFactionDateKey()}`;
      if (!(await redis.set(lockKey, '1', { EX: 2 * 24 * 60 * 60, NX: true }))) return e.reply('你今日已经领取过势力俸禄。');
      await Add_najie_thing(context.userId, faction.medium, '道具', faction.amount);
      if (faction.dew) await Add_najie_thing(context.userId, '净化花露', '道具', faction.dew);
      player.进化积淀 = Math.max(0, Number(player.进化积淀) || 0) + faction.accumulation;
      await Write_player(context.userId, player);
      await redis.set(sharedDateKey, getFactionDateKey());
      return e.reply(`【${player.势力}俸禄】\n${faction.medium}×${faction.amount}${faction.dew ? `｜净化花露×${faction.dew}` : ''}｜进化积淀+${faction.accumulation}`);
    });
  }

  async stoneJar(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const owner = getShengxuOpportunityOwner(STONE_JAR_OPPORTUNITY);
    const requirements = stoneJarRequirements(context.player);
    const lines = [
      '【石罐唯一机缘】',
      owner ? `全服归属：已被修士 ${owner} 认主` : '全服归属：尚未认主',
      `你的线索：${requirements.clues}/${STONE_JAR_CLUE_REQUIREMENT}｜不同副本：${requirements.cleared}/6`,
      requirements.ok ? '你已满足追寻条件，可发送 #追寻石罐。' : `尚缺：${requirements.reasons.join('；')}`,
      '石罐本体全服唯一，不可交易、复制或重复获取。',
    ];
    return e.reply(lines.join('\n'));
  }

  async claimStoneJar(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(context.userId, async () => {
      const player = await Read_player(context.userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('只有花粉进化路修士能追寻石罐。');
      if (!isInShengxuPlane(player)) return e.reply('石罐本体隐没在圣墟诸界，请先穿梭至小阴间。');
      const currentOwner = getShengxuOpportunityOwner(STONE_JAR_OPPORTUNITY);
      if (currentOwner === context.userId || player.圣墟唯一机缘?.石罐本体) {
        player.圣墟唯一机缘 ??= {};
        player.圣墟唯一机缘.石罐本体 = true;
        await Write_player(context.userId, player);
        if (Number(await exist_najie_thing(context.userId, '神秘石罐', '道具')) <= 0) {
          await Add_najie_thing(context.userId, '神秘石罐', '道具', 1);
        }
        return e.reply('石罐本体已经认你为主，相关存档与物品状态已校准。');
      }
      const requirements = stoneJarRequirements(player);
      if (!requirements.ok) return e.reply(`追寻条件未满足：${requirements.reasons.join('；')}`);
      if (currentOwner) return e.reply(`石罐本体已经被修士 ${currentOwner} 认主。`);
      const lockKey = 'xiuxian:shengxu:unique:stone_jar';
      if (!(await redis.set(lockKey, context.userId, { EX: 30, NX: true }))) {
        return e.reply('石罐刚刚响应了另一位修士的呼唤，你来迟一步。');
      }
      const claim = claimShengxuOpportunity(STONE_JAR_OPPORTUNITY, context.userId);
      if (!claim.ok) {
        await redis.set(lockKey, claim.ownerId, { EX: 30 });
        return e.reply(`石罐本体已经被修士 ${claim.ownerId} 认主。`);
      }
      player.圣墟唯一机缘 ??= {};
      player.圣墟唯一机缘.石罐本体 = true;
      player.圣墟唯一机缘.石罐认主时间 = claim.claimedAt;
      await Write_player(context.userId, player);
      await Add_najie_thing(context.userId, '神秘石罐', '道具', 1);
      return e.reply([
        '【全服唯一机缘·石罐认主】',
        '九枚线索在虚空中连成古老路径，石罐破开岁月尘埃落入你的掌中。',
        '效果：每日感应异变额外获得一份当前阶进化花粉；净化花露效果翻倍。',
      ].join('\n'));
    });
  }
}

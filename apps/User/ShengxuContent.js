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
import { getShanghaiDateKey } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

function battleExcerpt(messages) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= 12) return messages;
  return [...messages.slice(0, 3), '……战斗过程过长，仅展示末段……', ...messages.slice(-8)];
}

function stoneJarRequirements(player) {
  const cleared = Object.keys(player?.圣墟副本通关 || {}).length;
  const clues = Math.max(0, Number(player?.圣墟机缘线索) || 0);
  const extremes = Array.isArray(player?.花粉极境) ? player.花粉极境 : [];
  const missingExtremes = ['无敌画卷', '观想真形'].filter(name => !extremes.includes(name));
  const reasons = [];
  if (Number(player?.huafenlevel_id) < 11) reasons.push('境界需达到映照诸天');
  if (cleared < 4) reasons.push(`需踏破4处不同圣墟副本（当前${cleared}）`);
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
      `${dungeon.name}｜需${dungeon.requiredLevel}阶花粉境界｜${dungeon.monster}｜${dungeon.medium}`
    );
    return e.reply(['【圣墟副本】', ...lines, '探索：#探索圣墟 地点名（每处每日一次）'].join('\n'));
  }

  async explore(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const dungeon = getShengxuDungeon(e.msg.replace(/^#探索圣墟\s+/, ''));
    if (!dungeon) return e.reply(`未知地点。可用：${SHENGXU_DUNGEONS.map(item => item.name).join('、')}`);
    const { userId } = context;
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('只有花粉进化路修士可以进入圣墟副本。');
      if (Number(player.huafenlevel_id) < dungeon.requiredLevel) {
        return e.reply(`探索${dungeon.name}需花粉进化序列达到${dungeon.requiredLevel}，当前为${player.huafenlevel_id}。`);
      }
      if (await redis.get(`xiuxian:player:${userId}:game_action`) == 0) return e.reply('修仙：游戏进行中...');
      const dailyKey = `xiuxian:shengxu:dungeon:${getShanghaiDateKey()}:${dungeon.name}:${userId}`;
      if (!(await redis.set(dailyKey, '1', { EX: 2 * 24 * 60 * 60, NX: true }))) {
        return e.reply(`你今日已经探索过${dungeon.name}。`);
      }

      const attacker = structuredClone(player);
      attacker.当前血量 = Math.max(1, Number(player.血量上限 || player.当前血量) || 1);
      const monster = createShengxuMonster(player, dungeon);
      const battle = await zd_battle(attacker, monster, { battleType: 'shengxu_dungeon' });
      const lines = [
        `【${dungeon.name}】遭遇${monster.名号}`,
        ...battleExcerpt(battle.msg),
      ];
      // 战斗可能持久化消耗型权柄，结算奖励前重新读取，避免旧快照覆盖它们。
      player = await Read_player(userId);
      player.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(battle.A_hp)) : 1;
      player.功法熟练度 = attacker.功法熟练度;
      player.功法熟练度每日 = attacker.功法熟练度每日;
      if (battle.winner !== 'A') {
        await Write_player(userId, player);
        lines.push('【探索失败】你被异变生灵重创，当前血量降至1。');
        return e.reply(lines.join('\n'));
      }

      const reward = resolveShengxuDungeonReward(dungeon);
      await Add_najie_thing(userId, reward.medium, '道具', reward.amount);
      if (reward.gongfa) await Add_najie_thing(userId, reward.gongfa, '功法', 1);
      player.进化积淀 = Math.max(0, Number(player.进化积淀) || 0) + reward.accumulation;
      player.圣墟机缘线索 = Math.max(0, Number(player.圣墟机缘线索) || 0) + 1;
      player.圣墟副本通关 ??= {};
      player.圣墟副本通关[dungeon.name] = (Number(player.圣墟副本通关[dungeon.name]) || 0) + 1;
      await Write_player(userId, player);
      lines.push(
        '【探索胜利】',
        `${reward.medium}×${reward.amount}｜进化积淀+${reward.accumulation}｜石罐线索+1`,
        reward.gongfa ? `获得传承：【${reward.gongfa}】` : '本次未寻得呼吸法传承。'
      );
      return e.reply(lines.join('\n'));
    });
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
      `你的线索：${requirements.clues}/${STONE_JAR_CLUE_REQUIREMENT}｜不同副本：${requirements.cleared}/4`,
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

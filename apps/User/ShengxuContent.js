import { config, plugin, puppeteer, Show, verc } from '../../api/api.js';
import {
  Add_najie_thing,
  Go,
  Read_player,
  Write_player,
  bigNumberTransform,
  channel,
  exist_najie_thing,
  existplayer,
  zd_battle,
} from '../../model/xiuxian.js';
import { isCultivatingExtraPath } from '../../model/extraCultivation.js';
import {
  SHENGXU_DUNGEONS,
  SHENGXU_FACTIONS,
  BREATHING_PAGE_REQUIRE,
  collectBreathingPage,
  createShengxuMonster,
  ensureBreathingPages,
  getShengxuDungeon,
  getShengxuDungeonPlane,
  getShengxuExploreCost,
  getShengxuExploreDuration,
  getShengxuExploreShortages,
  resolveShengxuDungeonReward,
  resolveShengxuTierReward,
  synthesizeBreathingMethod,
} from '../../model/shengxuContent.js';
import {
  FLOWER_POLLEN_SKILLS,
  getLearnedFlowerPollenSkills,
  getSevenTreasureProgress,
  rollFlowerPollenSkill,
} from '../../model/flowerPollenSkill.js';
import {
  advanceFlowerField,
  collectFlowerFieldPage,
  getFlowerFieldProfile,
} from '../../model/flowerPollenField.js';
import {
  FLOWER_ANCESTOR_SEED_OPPORTUNITY,
  STONE_JAR_CLUE_REQUIREMENT,
  STONE_JAR_OPPORTUNITY,
  claimShengxuOpportunityAtomic,
  getShengxuAncestorSeedSettlementResult,
  getShengxuOpportunityOwner,
  persistShengxuAncestorSeedSettlementResult,
  withShengxuOpportunityLock,
} from '../../model/shengxuOpportunity.js';
import {
  getFactionDateKey,
  getFactionJoinBlock,
  hasClaimedFactionJoinReward,
  recordFactionJoin,
  wasFactionRewardClaimedToday,
} from '../../model/factionSystem.js';
import { getLocationId, getLocationName, PLACE_LOCATION_MAP, getShanghaiDateKey } from '../../model/weimianTravel.js';
import {
  getActorPlane,
  getFashanActionKey,
  isFashanActionPending,
  isFashanReady,
  requireActorAtPlane,
} from '../../model/fashanProxy.js';
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

function getShengxuExploreKey(userId, actor = 'body') {
  return `xiuxian:shengxu:explore:${userId}${actor === 'fashan' ? ':fashan' : ''}`;
}

function getActorActionKey(userId, actor = 'body') {
  return actor === 'fashan'
    ? getFashanActionKey(userId)
    : `xiuxian:player:${userId}:action`;
}

function buildActorSnapshot(player, actor, actorPlane) {
  if (actor !== 'fashan') return null;
  const snapshot = structuredClone(player);
  snapshot.power_place = actorPlane;
  snapshot.法身位置 = actorPlane;
  snapshot.法身状态 = '行动中';
  snapshot.法身行动 = '圣墟副本探索';
  return snapshot;
}

function mergeNumericDelta(target = {}, before = {}, after = {}, cap = Number.POSITIVE_INFINITY) {
  const merged = { ...target };
  for (const [name, value] of Object.entries(after || {})) {
    const delta = Math.max(0, (Number(value) || 0) - (Number(before?.[name]) || 0));
    if (delta > 0) merged[name] = Math.min(cap, (Number(merged[name]) || 0) + delta);
  }
  return merged;
}

function mergeCombatProficiency(fresh, beforeActor, afterActor) {
  fresh.功法熟练度 = mergeNumericDelta(
    fresh.功法熟练度,
    beforeActor?.功法熟练度,
    afterActor?.功法熟练度,
    1000,
  );
  const beforeDaily = beforeActor?.功法熟练度每日;
  const afterDaily = afterActor?.功法熟练度每日;
  if (!afterDaily?.日期 || beforeDaily?.日期 !== afterDaily.日期) return;
  fresh.功法熟练度每日 ??= { 日期: afterDaily.日期, 收益: {} };
  if (fresh.功法熟练度每日.日期 !== afterDaily.日期) return;
  fresh.功法熟练度每日.收益 = mergeNumericDelta(
    fresh.功法熟练度每日.收益,
    beforeDaily?.收益,
    afterDaily.收益,
    20,
  );
}

function resolveShengxuSettlementReward(dungeon, persistedAncestorSeedRoll) {
  let rewardRollIndex = 0;
  return resolveShengxuDungeonReward(dungeon, () => {
    rewardRollIndex++;
    // resolveShengxuDungeonReward 的第四个随机槽固定用于祖种。
    if (rewardRollIndex === 4 && persistedAncestorSeedRoll !== null) {
      return persistedAncestorSeedRoll ? 0 : 1;
    }
    return Math.random();
  });
}

async function reconcileFlowerAncestorSeedAward(userId, player, settlementId) {
  return withShengxuOpportunityLock(`${FLOWER_ANCESTOR_SEED_OPPORTUNITY}:inventory`, async lease => {
    const claim = await claimShengxuOpportunityAtomic(
      FLOWER_ANCESTOR_SEED_OPPORTUNITY,
      userId,
    );
    if (!claim.ownedBySelf) return { confirmed: false, added: false, ownerId: claim.ownerId };

    await lease.assertOwned();
    const before = Math.max(0, Number(await exist_najie_thing(userId, '花粉路祖种', '道具')) || 0);
    if (before <= 0) {
      await lease.assertOwned();
      await Add_najie_thing(
        userId,
        '花粉路祖种',
        '道具',
        1,
        undefined,
        1,
        { idempotencyKey: `shengxu:${settlementId}:ancestorSeed` },
      );
    }
    let after = Math.max(0, Number(await exist_najie_thing(userId, '花粉路祖种', '道具')) || 0);
    if (after <= 0) {
      // 兼容“物品丢失但旧 reward claim 尚存”的存档；唯一物品检查仍会阻止重复增加。
      await lease.assertOwned();
      await Add_najie_thing(userId, '花粉路祖种', '道具', 1);
      after = Math.max(0, Number(await exist_najie_thing(userId, '花粉路祖种', '道具')) || 0);
    }
    if (after <= 0) throw new Error(`祖种归属 ${userId} 已锁定，但库存确认失败`);

    const markerRepaired = player.圣墟唯一机缘?.花粉路祖种 !== true
      || player.圣墟唯一机缘?.花粉路祖种认主时间 === undefined;
    await lease.assertOwned();
    player.圣墟唯一机缘 ??= {};
    player.圣墟唯一机缘.花粉路祖种 = true;
    player.圣墟唯一机缘.花粉路祖种认主时间 ??= claim.claimedAt ?? Date.now();
    return { confirmed: true, added: after > before, markerRepaired, ownerId: claim.ownerId };
  });
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
        { reg: '^#沉迷圣墟\\s+.+\\*\\d+$', fnc: 'addictedExplore' },
        { reg: '^#法身探索圣墟\\s+.+$', fnc: 'fashanExplore' },
        { reg: '^#法身沉迷圣墟\\s+.+\\*\\d+$', fnc: 'fashanAddictedExplore' },
        { reg: '^#圣墟势力$', fnc: 'factions' },
        { reg: '^#加入(?:菩提基因|大梦净土|阳间第一山)$', fnc: 'joinFaction' },
        { reg: '^#领取圣墟俸禄$', fnc: 'salary' },
        { reg: '^#(?:石罐|石罐机缘)$', fnc: 'stoneJar' },
        { reg: '^#追寻石罐$', fnc: 'claimStoneJar' },
        { reg: '^#合成呼吸法\\s+\\S+$', fnc: 'synthesizeBreathing' },
        { reg: '^#(?:神术|神术列表)$', fnc: 'flowerSkills' },
        { reg: '^#(?:场域|场域状态)$', fnc: 'flowerField' },
        { reg: '^#参悟场域$', fnc: 'advanceField' },
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
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const { player } = context;
    const dungeons = SHENGXU_DUNGEONS.map(dungeon => {
      const cost = getShengxuExploreCost(dungeon);
      const plane = getShengxuDungeonPlane(dungeon);
      const shortages = getShengxuExploreShortages(player, cost);
      const realmReady = Number(player.huafenlevel_id) >= dungeon.requiredLevel;
      const planeReady = Number(player.power_place) === PLACE_LOCATION_MAP[plane];
      return {
        ...dungeon,
        plane,
        durationActual: getShengxuExploreDuration(player, dungeon),
        xiuweiCost: bigNumberTransform(cost.xiuwei),
        xueqiCost: bigNumberTransform(cost.xueqi),
        lingshiCost: bigNumberTransform(cost.lingshi),
        shouyuanCost: cost.shouyuan,
        skillsText: dungeon.skills.map(skill => skill.name).join('、'),
        rewardsText: `one：${dungeon.one.map(item => item.name).join('、')}｜two：${dungeon.two.map(item => item.name).join('、')}｜three：${dungeon.three.map(item => item.name).join('、')}`,
        ready: realmReady && planeReady && shortages.length === 0,
        status: !realmReady ? `花粉序列不足（需${dungeon.requiredLevel}阶）`
          : !planeReady ? `需身处${plane}`
            : shortages.length ? shortages[0] : '可探索',
      };
    });
    const view = await new Show(e).get_shengxu_placeData({
      playerName: player.名号 || context.userId,
      currentPlane: getLocationName(player.power_place) || '未知之地',
      flowerLevel: Number(player.huafenlevel_id) || 1,
      dungeons,
    });
    const img = await puppeteer.screenshot('shengxu_place', { ...view });
    // TRSS-Yunzai 不自动发送插件返回值，需显式 e.reply 出图
    return e.reply(img);
  }

  async explore(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const dungeon = getShengxuDungeon(e.msg.replace(/^#探索圣墟\s+/, ''));
    if (!dungeon) return e.reply(`未知地点。可用：${SHENGXU_DUNGEONS.map(item => item.name).join('、')}`);
    return this.beginExplore(e, context, dungeon, 1, 'body');
  }

  async addictedExplore(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const match = e.msg.match(/^#沉迷圣墟\s+(.+?)\*(\d+)$/);
    const dungeon = getShengxuDungeon(match?.[1]);
    const batches = Number(match?.[2]);
    if (!dungeon) return e.reply(`未知地点。可用：${SHENGXU_DUNGEONS.map(item => item.name).join('、')}`);
    if (!Number.isInteger(batches) || batches < 1 || batches > 12) return e.reply('沉迷次数必须在1-12之间。');
    return this.beginExplore(e, context, dungeon, batches * 10, 'body');
  }

  async fashanExplore(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const dungeon = getShengxuDungeon(e.msg.replace(/^#法身探索圣墟\s+/, ''));
    if (!dungeon) return e.reply(`未知地点。可用：${SHENGXU_DUNGEONS.map(item => item.name).join('、')}`);
    return this.beginExplore(e, context, dungeon, 1, 'fashan');
  }

  async fashanAddictedExplore(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const match = e.msg.match(/^#法身沉迷圣墟\s+(.+?)\*(\d+)$/);
    const dungeon = getShengxuDungeon(match?.[1]);
    const batches = Number(match?.[2]);
    if (!dungeon) return e.reply(`未知地点。可用：${SHENGXU_DUNGEONS.map(item => item.name).join('、')}`);
    if (!Number.isInteger(batches) || batches < 1 || batches > 12) return e.reply('沉迷次数必须在1-12之间。');
    return this.beginExplore(e, context, dungeon, batches * 10, 'fashan');
  }

  async beginExplore(e, context, dungeon, totalCount, actor = 'body') {
    const { userId } = context;
    if (actor !== 'fashan' && !(await Go(e))) return false;
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('只有花粉进化路修士可以进入圣墟副本。');
      const dungeonPlane = getShengxuDungeonPlane(dungeon);
      const expectedPlane = PLACE_LOCATION_MAP[dungeonPlane];
      let actorPlane = getLocationId(player.power_place);
      if (actor === 'fashan') {
        const actionKey = getActorActionKey(userId, actor);
        const activeAction = await redis.get(actionKey);
        if (activeAction) {
          try {
            const parsed = JSON.parse(activeAction);
            if (isFashanActionPending(parsed)) return e.reply(`法身正在${parsed.action || '代行'}中，请等待当前行动结算。`);
            await redis.del(actionKey);
          } catch {
            await redis.del(actionKey);
          }
          player.法身状态 = '空闲中';
          player.法身行动 = '无行动';
        }
        if (!isFashanReady(player)) return e.reply('法身尚未凝聚完成，或当前已有代行行动。');
        const planeCheck = requireActorAtPlane(player, expectedPlane, 'fashan');
        if (!planeCheck.ok) {
          return e.reply(`【法身位面不符】${dungeon.name}位于${dungeonPlane}，当前法身位于${getLocationName(planeCheck.actual) || '未知之地'}。`);
        }
        actorPlane = planeCheck.actual;
      } else {
        if (!isInShengxuPlane(player)) return e.reply('圣墟副本只存在于圣墟诸界（小阴间/大阴间/阳间），请先发送 #穿梭小阴间。');
        if (getLocationId(player.power_place) !== expectedPlane) {
          return e.reply(`【位面不符】${dungeon.name}位于${dungeonPlane}，请先穿梭至${dungeonPlane}。`);
        }
      }
      if (Number(player.huafenlevel_id) < dungeon.requiredLevel) {
        return e.reply(`探索${dungeon.name}需花粉进化序列达到${dungeon.requiredLevel}，当前为${player.huafenlevel_id}。`);
      }
      // 真身与法身各自维护一条探索任务，互不覆盖。
      const exploreKey = getShengxuExploreKey(userId, actor);
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
          return e.reply(`【${active.dungeonName}】探索已经结束，正在等待结算。`);
        } catch {
          // 坏数据直接覆盖
          await redis.del(exploreKey);
        }
      }

      // 单次探索保留每日限制；沉迷以十轮为一组，按资源和总耗时约束。
      const dailyKey = totalCount === 1
        ? `xiuxian:shengxu:dungeon:${getShanghaiDateKey()}:${dungeon.name}:${userId}${actor === 'fashan' ? ':fashan' : ''}`
        : null;
      if (dailyKey && !(await redis.set(dailyKey, '1', { EX: 2 * 24 * 60 * 60, NX: true }))) {
        return e.reply(`你今日已经探索过${dungeon.name}。`);
      }

      const unitCost = getShengxuExploreCost(dungeon);
      const cost = Object.fromEntries(Object.entries(unitCost).map(([key, value]) => [key, value * totalCount]));
      const totalShortages = getShengxuExploreShortages(player, cost);
      if (totalShortages.length) {
        if (dailyKey) await redis.del(dailyKey);
        return e.reply(['【圣墟探索·资源不足】', ...totalShortages].join('\n'));
      }
      const durationMin = getShengxuExploreDuration(player, dungeon);
      const totalDurationMin = durationMin * totalCount;
      const now = Date.now();
      const endTime = now + totalDurationMin * 60 * 1000;
      const task = {
        taskId: `${userId}:${actor}:${dungeon.name}:${now}`,
        mode: totalCount > 1 ? 'addiction' : 'single',
        actor,
        actorPlane,
        ...(actor === 'fashan' ? { 法身位置: actorPlane, actorSnapshot: buildActorSnapshot(player, actor, actorPlane) } : {}),
        qq: userId,
        playerName: player.名号 || userId,
        groupId: e.isGroup ? e.group_id : null,
        dungeonName: dungeon.name,
        start_time: now,
        end_time: endTime,
        next_settle_time: now + durationMin * 60 * 1000,
        interval: durationMin * 60 * 1000,
        total_count: totalCount,
        settled_count: 0,
        cost,
      };
      player.修为 -= cost.xiuwei;
      player.血气 -= cost.xueqi;
      player.灵石 -= cost.lingshi;
      player.寿元 -= cost.shouyuan;
      try {
        const ttl = Math.ceil(totalDurationMin * 60) + 24 * 60 * 60;
        await redis.set(exploreKey, JSON.stringify(task), { EX: ttl });
        const actionKey = getActorActionKey(userId, actor);
        await redis.set(actionKey, JSON.stringify({
          action: actor === 'fashan'
            ? (totalCount > 1 ? '法身沉迷圣墟' : '法身探索圣墟')
            : (totalCount > 1 ? '圣墟沉迷' : '圣墟探索'),
          actor,
          actorPlane,
          ...(actor === 'fashan' ? { isFashan: true, 法身位置: actorPlane } : {}),
          start_time: now,
          end_time: endTime,
          time: totalDurationMin * 60 * 1000,
          Place_actionplus: 'shengxu',
          Place_address: { name: dungeon.name },
          shengxuTaskId: task.taskId,
        }), { EX: ttl });
        if (actor === 'fashan') {
          player.法身位置 = actorPlane;
          player.法身行动 = totalCount > 1 ? `沉迷圣墟·${dungeon.name}` : `探索圣墟·${dungeon.name}`;
          player.法身状态 = '行动中';
        }
        await Write_player(userId, player);
      } catch (error) {
        await redis.del(exploreKey);
        await redis.del(getActorActionKey(userId, actor));
        if (dailyKey) await redis.del(dailyKey);
        throw error;
      }
      const endLabel = new Date(endTime).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return e.reply([
        `【${dungeon.name}·${actor === 'fashan' ? '法身' : ''}${totalCount > 1 ? '开始沉迷' : '开始探索'}】`,
        `${player.名号 || userId}${actor === 'fashan' ? '的法身' : ''}踏入${dungeon.name}，${dungeon.monster}的气息在深处隐现。${totalCount > 1 ? `将连续探索${totalCount}轮。` : ''}`,
        `入场消耗：修为${bigNumberTransform(cost.xiuwei)}｜血气${bigNumberTransform(cost.xueqi)}｜灵石${bigNumberTransform(cost.lingshi)}｜寿元${cost.shouyuan}年`,
        `探索耗时：每轮${durationMin}分钟｜共${totalDurationMin}分钟`,
        `预计归来：${endLabel}`,
        totalCount > 1 ? '每轮到期自动结算，全部完成后推送汇总收获。' : '探索结束后将自动结算收获。',
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
      task.actor = task.actor === 'fashan' ? 'fashan' : 'body';
      const normalizedActorPlane = getLocationId(task.actorPlane ?? task.法身位置);
      if (task.actor === 'fashan' && Number.isFinite(normalizedActorPlane)) {
        task.actorPlane = normalizedActorPlane;
        task.法身位置 = normalizedActorPlane;
      }
      const addictionComplete = task.mode === 'addiction' && Number(task.settled_count) >= Number(task.total_count);
      const dueAt = task.mode === 'addiction' ? task.next_settle_time : task.end_time;
      if (!addictionComplete && now < Number(dueAt)) continue;
      const settleKey = `xiuxian:shengxu:settling:${task.qq}:${task.actor}`;
      const token = `${process.pid}:${Date.now()}:${Math.random()}`;
      if (!(await redis.set(settleKey, token, { EX: 120, NX: true }))) continue;
      try {
        if ((await redis.get(key)) !== raw) continue;
        if (task.mode === 'addiction') {
          await this.settleAddiction(key, task, now);
        } else {
          await this.settleExplore(task);
          await redis.del(key);
          await this.clearShengxuAction(task);
        }
      } catch (error) {
        console.error(`[圣墟副本] 玩家 ${task.qq} 探索结算失败:`, error);
      } finally {
        if ((await redis.get(settleKey)) === token) await redis.del(settleKey);
      }
    }
  }

  async settleAddiction(key, task, now) {
    task.summary ??= { wins: 0, losses: 0, xiuwei: 0, xueqi: 0, lingshi: 0, accumulation: 0, items: {} };
    let processed = 0;
    while (task.settled_count < task.total_count && now >= Number(task.next_settle_time) && processed < 10) {
      const round = Number(task.settled_count) + 1;
      const result = await this.settleExplore({ ...task, taskId: `${task.taskId}:round:${round}` }, false);
      if (result?.actorPlaneMismatch) {
        task.stop_reason = result.stopReason;
        task.settled_count = task.total_count;
        break;
      }
      task.settled_count = round;
      task.next_settle_time = Number(task.next_settle_time) + Number(task.interval);
      processed++;
      if (!result?.alreadySettled) this.addAddictionSummary(task.summary, result);
      const ttl = Math.max(24 * 60 * 60, Math.ceil((Number(task.end_time) - Date.now()) / 1000) + 24 * 60 * 60);
      await redis.set(key, JSON.stringify(task), { EX: ttl });
    }
    if (task.settled_count >= task.total_count) {
      await redis.del(key);
      await this.clearShengxuAction(task);
      return this.sendAddictionResult(task);
    }
  }

  addAddictionSummary(summary, result) {
    if (!result?.settled) return;
    if (result.ancestorSeedGranted) {
      summary.items['花粉路祖种'] = (summary.items['花粉路祖种'] || 0) + 1;
    }
    if (!result.won) {
      summary.losses++;
      return;
    }
    summary.wins++;
    const reward = result.reward;
    summary.xiuwei += reward.xiuwei;
    summary.xueqi += reward.xueqi;
    summary.lingshi += reward.lingshi;
    summary.accumulation += reward.accumulation;
    const items = [
      { name: reward.medium, amount: reward.amount },
      reward.gongfa && { name: reward.gongfa, amount: 1 },
      reward.herb && { name: reward.herb, amount: 1 },
      reward.fruit && { name: reward.fruit, amount: 1 },
      result.tierReward,
    ].filter(Boolean);
    for (const item of items) summary.items[item.name] = (summary.items[item.name] || 0) + (item.amount || 1);
  }

  async sendAddictionResult(task) {
    const summary = task.summary || {};
    const items = Object.entries(summary.items || {}).map(([name, amount]) => `${name}×${amount}`);
    const message = [
      `【${task.dungeonName}·${task.actor === 'fashan' ? '法身' : ''}沉迷结算完成】`,
      `连续探索：${task.total_count}轮｜胜${summary.wins || 0}｜负${summary.losses || 0}`,
      `修为+${bigNumberTransform(summary.xiuwei || 0)}｜血气+${bigNumberTransform(summary.xueqi || 0)}｜灵石+${bigNumberTransform(summary.lingshi || 0)}`,
      `进化积淀+${summary.accumulation || 0}`,
      items.length ? `物品：${items.join('｜')}` : '本次没有获得物品。',
      task.stop_reason || '',
    ].join('\n');
    return this.sendExploreResult(task, message);
  }

  async clearShengxuAction(task) {
    const key = getActorActionKey(task.qq, task.actor);
    const raw = await redis.get(key);
    let matchesTask = !raw;
    if (raw) {
      try {
        const action = JSON.parse(raw);
        if (action.shengxuTaskId !== task.taskId) return;
        matchesTask = true;
      } catch {
        // 专用法身键中的坏数据视为过期动作，继续恢复状态。
        matchesTask = true;
      }
    }
    if (!matchesTask) return;
    if (raw && (await redis.get(key)) === raw) await redis.del(key);
    if (task.actor !== 'fashan') return;
    await withPlayerMutationLock(String(task.qq), async () => {
      const player = await Read_player(String(task.qq));
      if (!player || player.法身状态 !== '行动中') return;
      const currentLabel = String(player.法身行动 || '');
      const expectedLabel = task.mode === 'addiction'
        ? `沉迷圣墟·${task.dungeonName}`
        : `探索圣墟·${task.dungeonName}`;
      // 若清理期间已有新法身任务，不能误清新任务状态。
      if (currentLabel && currentLabel !== expectedLabel && currentLabel !== '圣墟副本探索') return;
      player.法身状态 = '空闲中';
      player.法身行动 = '无行动';
      await Write_player(String(task.qq), player);
    });
  }

  async settleExplore(task, sendResult = true) {
    const userId = String(task.qq);
    const player = await Read_player(userId);
    if (!player) return { settled: false };
    const dungeon = getShengxuDungeon(task.dungeonName);
    if (!dungeon) return { settled: false };
    const actorType = task.actor === 'fashan' ? 'fashan' : 'body';
    const actorSource = actorType === 'fashan' && task.actorSnapshot && typeof task.actorSnapshot === 'object'
      ? task.actorSnapshot
      : player;
    const actorPlane = getLocationId(task.actorPlane ?? getActorPlane(actorSource, actorType));
    const settlementId = task.taskId || `${userId}:${dungeon.name}:${task.start_time}`;
    const settlementKey = actorType === 'fashan' ? `fashan:${dungeon.name}` : dungeon.name;
    const persistedAncestorSeedRoll = await getShengxuAncestorSeedSettlementResult(settlementId);
    if (player.圣墟副本最近结算?.[settlementKey] === settlementId) {
      const ownerId = getShengxuOpportunityOwner(FLOWER_ANCESTOR_SEED_OPPORTUNITY);
      if (persistedAncestorSeedRoll === true || ownerId === userId) {
        let repair = { added: false };
        await withPlayerMutationLock(userId, async () => {
          const fresh = await Read_player(userId);
          repair = await reconcileFlowerAncestorSeedAward(userId, fresh, settlementId);
          if (repair.added || repair.markerRepaired) await Write_player(userId, fresh);
        });
        if (repair.added && sendResult) {
          await this.sendExploreResult(task, '【全服唯一机缘】花粉路祖种库存已补齐。');
        }
        return { settled: true, alreadySettled: true, ancestorSeedGranted: repair.added };
      }
      return { settled: true, alreadySettled: true };
    }
    if (actorType === 'fashan' && getLocationId(player.法身位置) !== actorPlane) {
      const stopReason = `【法身位面中断】法身已离开${getShengxuDungeonPlane(dungeon)}，本次${dungeon.name}探索终止。`;
      if (sendResult) await this.sendExploreResult(task, stopReason);
      return { settled: true, won: false, actorPlaneMismatch: true, stopReason };
    }

    const attacker = structuredClone(actorSource);
    attacker.power_place = Number.isFinite(actorPlane) ? actorPlane : getLocationId(attacker.power_place);
    attacker.当前血量 = Math.max(1, Number(actorSource.血量上限 || actorSource.当前血量) || 1);
    const monster = createShengxuMonster(actorSource, dungeon);
    const battle = await zd_battle(attacker, monster, { battleType: 'shengxu_dungeon' });
    const lines = [
      `【${dungeon.name}·${actorType === 'fashan' ? '法身' : ''}探索归来】`,
      `${task.playerName}${actorType === 'fashan' ? '的法身' : ''}在${dungeon.name}深处遭遇【${monster.名号}】！`,
      ...battleExcerpt(battle.msg),
    ];
    let message = '';
    let outcome = { settled: false };
    await withPlayerMutationLock(userId, async () => {
      const fresh = await Read_player(userId);
      fresh.圣墟副本最近结算 ??= {};
      if (fresh.圣墟副本最近结算[settlementKey] === settlementId) {
        outcome = { settled: true, alreadySettled: true };
        return;
      }
      if (actorType !== 'fashan') {
        fresh.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(battle.A_hp)) : 1;
      }
      mergeCombatProficiency(fresh, actorSource, attacker);
      fresh.圣墟副本最近结算[settlementKey] = settlementId;
      let ancestorSeedGranted = false;
      let ancestorSeedReconciled = false;
      const reconcileAncestorSeed = async () => {
        if (ancestorSeedReconciled) return;
        const result = await reconcileFlowerAncestorSeedAward(userId, fresh, settlementId);
        ancestorSeedReconciled = result.confirmed;
        ancestorSeedGranted = result.added;
      };
      let ancestorSeedRoll = persistedAncestorSeedRoll;
      if (ancestorSeedRoll === null && battle.winner !== 'A') {
        ancestorSeedRoll = await persistShengxuAncestorSeedSettlementResult(settlementId, false);
      }
      if (ancestorSeedRoll === true) await reconcileAncestorSeed();
      if (battle.winner !== 'A') {
        await Write_player(userId, fresh);
        lines.push(actorType === 'fashan'
          ? '【法身探索失败】法身被异变生灵击退，真身未受影响。'
          : '【探索失败】你被异变生灵重创，当前血量降至1。');
        if (ancestorSeedGranted) lines.push('【全服唯一机缘】获得花粉路祖种×1，已接入祖种悟道与超级异果体系。');
        message = lines.join('\n');
        outcome = { settled: true, won: false, ancestorSeedGranted };
        return;
      }

      const reward = resolveShengxuSettlementReward(dungeon, persistedAncestorSeedRoll);
      const ancestorSeedRolled = await persistShengxuAncestorSeedSettlementResult(
        settlementId,
        Boolean(reward.ancestorSeed),
      );
      reward.ancestorSeed = ancestorSeedRolled ? '花粉路祖种' : '';
      const tierRates = config.getConfig('xiuxian', 'xiuxian')?.SecretPlace || {};
      const tierReward = resolveShengxuTierReward(dungeon, Math.random, tierRates);
      const addReward = (name, type, amount, slot) => Add_najie_thing(
        userId, name, type, amount, undefined, 1, { idempotencyKey: `shengxu:${settlementId}:${slot}` }
      );
      await addReward(reward.medium, '道具', reward.amount, 'medium');
      if (reward.gongfa) await addReward(reward.gongfa, '功法', 1, 'gongfa');
      if (reward.herb) await addReward(reward.herb, '道具', 1, 'herb');
      if (reward.fruit) await addReward(reward.fruit, '道具', 1, 'fruit');
      if (tierReward) await addReward(tierReward.name, tierReward.class, tierReward.amount, `tier:${tierReward.tier}`);
      if (reward.ancestorSeed) await reconcileAncestorSeed();
      fresh.进化积淀 = Math.max(0, Number(fresh.进化积淀) || 0) + reward.accumulation;
      fresh.修为 = Math.max(0, (Number(fresh.修为) || 0) + reward.xiuwei);
      fresh.血气 = Math.max(0, (Number(fresh.血气) || 0) + reward.xueqi);
      fresh.灵石 = Math.max(0, (Number(fresh.灵石) || 0) + reward.lingshi);
      fresh.圣墟机缘线索 = Math.max(0, Number(fresh.圣墟机缘线索) || 0) + 1;
      fresh.圣墟副本通关 ??= {};
      fresh.圣墟副本通关[dungeon.name] = (Number(fresh.圣墟副本通关[dungeon.name]) || 0) + 1;
      const page = collectBreathingPage(fresh, dungeon.gongfa);
      const skillName = rollFlowerPollenSkill(dungeon);
      if (skillName) {
        fresh.学习的功法 ??= [];
        if (!fresh.学习的功法.includes(skillName)) fresh.学习的功法.push(skillName);
      }
      const field = dungeon.fieldPage ? collectFlowerFieldPage(fresh) : null;
      await Write_player(userId, fresh);
      lines.push(
        '【探索胜利】',
        `${reward.medium}×${reward.amount}｜进化积淀+${reward.accumulation}｜石罐线索+1`,
        `修为+${bigNumberTransform(reward.xiuwei)}｜血气+${bigNumberTransform(reward.xueqi)}｜灵石+${bigNumberTransform(reward.lingshi)}`,
      );
      if (ancestorSeedGranted) lines.push('【全服唯一机缘】获得花粉路祖种×1，已接入祖种悟道与超级异果体系。');
      if (reward.herb) lines.push('【本源圣药】灵性惊人，可净化始祖污染度−60。');
      if (reward.fruit) lines.push('【异果机缘】获得' + reward.fruit + '×1，可服用换取进化积淀。');
      if (tierReward) lines.push(`【${tierReward.tier}档奖励】${tierReward.name}×${tierReward.amount}`);
      if (page.ok) {
        if (page.learned) lines.push(`呼吸法残页折现：进化积淀+${page.reward}（已掌握${page.gongfa}）`);
        else lines.push(`拾取【${page.gongfa}·残页】${page.count}/${page.need}，集齐可 #合成呼吸法 ${page.gongfa}`);
      }
      if (skillName) lines.push(`参悟神术：【${skillName}】（战斗中概率自动施展）`);
      if (field?.ok) {
        if (field.canAdvance) lines.push(`拾取【场域残图】${field.pages}/${field.pageRequire}，可 #参悟场域 升阶！`);
        else lines.push(`拾取【场域残图】（共${field.pages}张，${field.pageRequire}张可 #参悟场域）`);
      }
      lines.push(reward.gongfa ? `获得传承：【${reward.gongfa}】` : '本次未直接寻得呼吸法传承。');
      message = lines.join('\n');
      outcome = { settled: true, won: true, reward, tierReward, ancestorSeedGranted };
    });
    if (message && sendResult) await this.sendExploreResult(task, message);
    return outcome;
  }

  async sendExploreResult(task, message) {
    try {
      if (task.groupId) return await this.pushInfo(task.groupId, true, [segment.at(Number(task.qq)), message]);
      return await this.pushInfo(task.qq, false, message);
    } catch (error) {
      console.error(`[圣墟副本] 玩家 ${task.qq} 结算消息发送失败:`, error);
    }
  }

  async flowerSkills(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const learned = getLearnedFlowerPollenSkills(context.player);
    const seven = getSevenTreasureProgress(context.player);
    const lines = ['【花粉路·道法与杀术】'];
    if (learned.length) {
      lines.push('已参悟：');
      lines.push(...learned.map(skill => `【${skill.type}·${skill.name}】${skill.desc}`));
      if (seven > 0) lines.push(`七妙宝术进度：${seven}/7（每多一宝，七妙伤害+15%；七宝圆满+60%）`);
    } else {
      lines.push('尚未参悟任何神术。探索圣墟副本可概率参悟神术传承。');
    }
    for (const type of ['道与法', '盖世杀术']) {
      lines.push('', `【${type}·副本传承】`);
      lines.push(...FLOWER_POLLEN_SKILLS
        .filter(skill => skill.type === type)
        .map(skill => `${skill.name}｜花粉${skill.realm}阶｜${skill.desc}`));
    }
    return e.reply(lines.join('\n'));
  }

  async flowerField(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const profile = getFlowerFieldProfile(context.player);
    const lines = [
      '【场域·花粉路支脉】',
      `场域境界：${profile.stage}/${profile.maxStage} 重天`,
      `全属性加成：+${Math.round(profile.attrBonus * 100)}%（基于花粉境界基础三维）`,
      `场域法·镇压制强化：×${(1 + profile.stage * 0.04).toFixed(2)}`,
      `场域残图：${profile.pages}/${profile.pageRequire}（星路篇及以上副本探索胜利必得）`,
    ];
    if (profile.stage < profile.maxStage) lines.push('集满 5 张后发送 #参悟场域 升阶。');
    else lines.push('场域已臻九重天，以身立道，领域无双。');
    return e.reply(lines.join('\n'));
  }

  async advanceField(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(context.userId, async () => {
      const player = await Read_player(context.userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('只有花粉进化路修士可以参悟场域。');
      const result = advanceFlowerField(player);
      if (!result.ok) {
        if (result.reason === 'max') return e.reply('你的场域已臻九重天，无上领域已然圆满。');
        return e.reply(`【残图不足】场域残图 ${result.pages}/${result.need}，探索星路篇及以上副本拾取。`);
      }
      await Write_player(context.userId, player);
      return e.reply([
        '【场域升阶】',
        `你拼合残图，场域境界踏入 ${result.stage} 重天！`,
        `全属性加成提升至 +${Math.round(result.stage * 3)}%，领域威压愈发凝实。`,
      ].join('\n'));
    });
  }

  async synthesizeBreathing(e) {
    if (!verc({ e })) return false;
    const context = await this.getPlayer(e);
    if (!context) return e.reply('玩家不存在，请先创建角色。');
    const gongfa = e.msg.replace(/^#合成呼吸法\s+/, '').trim();
    return withPlayerMutationLock(context.userId, async () => {
      const player = await Read_player(context.userId);
      if (!isCultivatingExtraPath(player, 'huafen')) return e.reply('只有花粉进化路修士可以参悟呼吸法。');
      const result = synthesizeBreathingMethod(player, gongfa);
      if (!result.ok) {
        const pages = ensureBreathingPages(player);
        return e.reply(`【残页不足】${gongfa}残页 ${Number(pages[gongfa]) || 0}/${BREATHING_PAGE_REQUIRE}，探索对应圣墟副本拾取残页。`);
      }
      await Write_player(context.userId, player);
      return e.reply([
        '【呼吸法参悟】',
        `你以${BREATHING_PAGE_REQUIRE}张残页拼合残缺古碑，参悟【${gongfa}】！`,
        '进化成功率与下本速度随之提升。',
      ].join('\n'));
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
      let claim;
      try {
        claim = await claimShengxuOpportunityAtomic(STONE_JAR_OPPORTUNITY, context.userId);
      } catch (error) {
        if (error?.code === 'SHENGXU_OPPORTUNITY_BUSY') {
          return e.reply('石罐刚刚响应了另一位修士的呼唤，你来迟一步。');
        }
        throw error;
      }
      if (!claim.ok) {
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

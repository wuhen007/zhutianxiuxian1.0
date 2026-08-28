import plugin from '../../../../lib/plugins/plugin.js';
import config from '../../model/Config.js';
import { data } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import { __PATH } from '../../model/xiuxian.js';
import {
  Read_player,
  existplayer,
  Write_player,
  Write_najie,
  ForwardMsg,
  Read_najie,
  exist_najie_thing,
  Add_najie_thing
} from '../../model/xiuxian.js';
import RealmEvents from './RealmEvents.js';
import { formatRealmEventLocation } from '../../model/realmEventLocation.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { getRealmAuthorityLevel, hasRealmAuthority } from '../../model/realmAuthority.js';
import {
  getPlaneDestructionInfo,
  markPlaneDestroyed,
  PLANE_DESTRUCTION_SOURCES,
  repairPlane,
  repairNaturallyDestroyedPlanes,
} from '../../model/planeDestruction.js';
import {
  awakenEmperorCrisis,
  confrontEmperorCrisis,
  defeatEmperorCrisis,
  EMPEROR_CRISIS_GRACE_YEARS,
  EMPEROR_CRISIS_KEY,
  getEmperorChallengeMode,
  resolveEmperorCrisis,
} from '../../model/emperorCrisis.js';
import {
  formatDarkRevoltPlaneDestruction,
  processDarkRevoltPlaneDestruction,
} from '../Boss/DarkRevoltDestruction.js';
import { triggerPeriodicRiftsForEra } from '../../model/planeRiftFestival.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import {
  restoreAllPlayerLifespans,
  suppressAllPlayerLifespans,
} from './juelingLifespanService.js';
import {
  XIANGU_LIFECYCLE,
  advanceXianguLifecycle,
  getXianguOpeningAttemptProbability,
  isXianguBloomCheckDue,
  scheduleXianguBloomCheck,
  setXianguOpeningProbability,
  startXianguPreparation,
} from './xianguLifecycle.js';
import {
  CHENGXIAN_ROAD_LIFECYCLE,
  closeChengxianRoad,
  isChengxianRoadCheckDue,
  isChengxianRoadCloseDue,
  markChengxianRoadCheckFailed,
  markChengxianRoadOpened,
} from '../../model/chengxianRoad.js';
import {
  advanceSpecialTianjiaoEvolution,
  attemptTianjiaoBreakthrough,
  canTianjiaoGrow,
  ensureTianjiaoInitialTemplate,
  getTianjiaoImprovementChance,
  improveTianjiao,
  isIndependentTianjiao,
  isTianjiaoBreakthroughYear,
  isTianjiaoImprovementYear,
  recoverTianjiaoFromSetback,
} from '../../model/tianjiaoGrowth.js';
import {
  DAO_TREASURE_GUARD_TARGET,
  DAO_TREASURE_STAGES,
  advanceDaoTreasureProject,
} from '../../model/daoTreasure.js';
import { spawnForeignCalamities } from '../../model/foreignCalamity.js';

export class EraChangeTask extends plugin {
  constructor() {
    super({
      name: '时代变迁管理员',
      dsc: '管理修仙世界的时代变迁过程',
      event: 'message',
      priority: 1000,
      rule: [
        {
          reg: '^#?设置时代(进度)?',
          fnc: 'setEraProgress'
        },
        {
  reg: '^#解除绝灵压制$',
  fnc: 'releaseJuelingSuppression',
},
        {
          reg: '^#?下一千年$',
          fnc: 'advanceOneThousandYears'
        },
        {
          reg: '^#?下一个时代$',
          fnc: 'advanceToNextEra'
        },
        {
          reg: '^#?(当前)?纪元$',
          fnc: 'queryEpoch',
        },
        {
          reg: '^#查看损失$',
          fnc: 'checkJuelingLoss',
        },
        {
          reg: '^#使用星宇护身符$',
          fnc: 'useXingyuHufu',
        },
        {
          reg: '^#模拟损失(?:\\s+(\\d+))?$',
          fnc: 'simulateJuelingEraLossCommand', // 修改函数名
        },
        {
          reg: '^#?(位面)?大事件(记录)?$',
          fnc: 'queryRealmEvents',
        }
      ]
    });
    
    // 初始化配置
    this.configKey = 'xiuxian';
    this.loadEraConfig();
    
    // 设置定时任务
    this.setupEraTask();
    
    // 时代定义
    this.eras = [
      { name: "神话时代", icon: "✨", desc: "天地初开，神灵显化。灵药遍地，异兽横行。大道法则清晰可见，凡人亦可感悟天道至理。" },
      { name: "太古时代", icon: "⚔️", desc: "神魔大战，万族并起。武道昌盛，血脉之力如江河奔涌。顶级修士可掌阴阳五行，移山填海。" },
      { name: "天命时代", icon: "🌌", desc: "天命既明，规则既定。各族鼎立，宗门林立。灵气平稳有序，强者辈出。" },
      { name: "末法时代", icon: "🌑", desc: "天道倾斜，灵气枯竭。规则崩坏，修行之途日渐艰难。仙路渐闭，凡人武道崛起。" },
      { name: "绝灵时代", icon: "💀", desc: "天地寂灭，灵气断绝。末法终结，万物归凡。曾经的修仙之道已成传说。" }
    ];
  }
  
  /** 加载时代配置 */
  loadEraConfig() {
    const set = config.getConfig(this.configKey, 'xiuxian') || {};
    
    // 初始化默认配置
    if (!set.Era) {
      set.Era = {
        enabled: true,
        current: { index: 0, years: 0, epoch: 1, totalYears: 0 }, // totalYears：累计年数（不随时代切换重置），用于位面自我修复
        task: "0 0 */2 * * *", // 默认每2小时执行一次
        pushNotice: true,
        notifyGroups: [],
        yearlyAdvance: 1000, // 每次推进1000年
        weimianRepairInterval: 2000 // 位面自我修复间隔（每多少年修复一次）
      };
      config.setConfig(this.configKey, 'xiuxian', set);
    }
    
    // 确保有纪元计数
    if (!set.Era.current.epoch) {
      set.Era.current.epoch = 1;
      config.setConfig(this.configKey, 'xiuxian', set);
    }
    
    // 确保有累计年数（兼容旧配置，并跨时代/纪元保持单调）
    const inferredWorldYear = getRealmEventWorldYear(
      set.Era.current.index,
      set.Era.current.years,
      set.Era.current.epoch,
    );
    if (
      typeof set.Era.current.totalYears !== 'number' ||
      set.Era.current.totalYears < inferredWorldYear
    ) {
      set.Era.current.totalYears = inferredWorldYear;
      config.setConfig(this.configKey, 'xiuxian', set);
    }
    
    // 确保有修复间隔配置
    if (!set.Era.weimianRepairInterval) {
      set.Era.weimianRepairInterval = 2000;
      config.setConfig(this.configKey, 'xiuxian', set);
    }
    
    this.set = set;
  }
  
  /** 设置定时任务 */
  setupEraTask() {
    try {
      // 确保 task 属性初始化为空数组
      this.task = [];
      
      if (this.set.Era?.enabled) {
        // 确保使用正确的配置键名
        const cronExpression = this.set.Era.task || "0 0 */2 * * *";
        
        // 添加任务到数组
        this.task.push({
          cron: cronExpression,
          name: '时代进度推进',
          fnc: () => this.advanceEra(),
          log: true
        });
      }
    } catch (e) {
      console.error("设置时代定时任务失败:", e);
    }
  }

  async processXianguLifecycle(weimianData, {
    previousWorldYear,
    worldYear,
    save,
  }) {
    let lifecycle = advanceXianguLifecycle(weimianData, { worldYear });
    let changed = lifecycle.changed;
    let notice = null;

    // A just-closed round must never roll into another round in the same tick.
    if (
      lifecycle.transition === null &&
      lifecycle.stage === 'closed' &&
      isXianguBloomCheckDue(weimianData, previousWorldYear, worldYear)
    ) {
      const attemptProbability = getXianguOpeningAttemptProbability(weimianData);
      if (Math.random() < attemptProbability) {
        lifecycle = startXianguPreparation(weimianData, { worldYear });
        setXianguOpeningProbability(weimianData, 0);
        changed = true;
        notice = 'preparing';
      } else {
        const previousProbability = weimianData.仙古秘境开启概率;
        setXianguOpeningProbability(weimianData, attemptProbability);
        scheduleXianguBloomCheck(weimianData, worldYear);
        changed ||= previousProbability !== weimianData.仙古秘境开启概率;
        changed = true;
      }
    } else if (lifecycle.transition) {
      notice = lifecycle.transition;
    }

    // Persist the transition before notifying groups. A broadcast failure must
    // not repeat a world event on the next clock tick.
    if (changed) save?.();

    if (lifecycle.clearManualRound) {
      try {
        await redis.del('xiuxian:xiangu:manual-round');
      } catch (error) {
        console.error('[仙古秘境] 清理手动轮次标记失败:', error);
      }
    }

    if (!notice) return lifecycle;

    const realmNames = ['三千道州', '无量天', '九幽地'];
    const randomRealm = realmNames[Math.floor(Math.random() * realmNames.length)];
    let message;

    if (notice === 'preparing') {
      message = [
        '【仙古花蕾现世·大世将启】',
        `${randomRealm}上空，一枚仙古花蕾自虚无中显化。`,
        '混沌雾霭缠绕花瓣，古老道音传遍三千道州。',
        '花蕾尚未完全绽放，秘境门户仍受仙古法则封锁。',
        `约${XIANGU_LIFECYCLE.PREPARATION_YEARS}年后，花开之时，年轻天骄方可入内争夺机缘。`,
        '诸修可趁此整备法器、结伴探路；也当提防旧敌趁大世将临清算因果。',
      ].join('\n');
    } else if (notice === 'opened') {
      message = [
        '【仙古花蕾绽放·秘境开启】',
        `${randomRealm}上空，仙古花蕾终于绽放！`,
        '秘境壁垒破碎，仙古纪元气息弥漫九天十地！',
        '「仙古秘境开启了！」',
        '年轻天骄们，速速前往探索！',
        '使用 #进入仙古秘境 命令尝试进入',
        '（需铭文境至至尊者境，位于九天十地位面）',
      ].join('\n');
    } else {
      message = [
        '【仙古花蕾凋零·秘境关闭】',
        `${randomRealm}上空，仙古花蕾凋零。`,
        '秘境壁垒闭合，仙古气息消散！',
        '「仙古秘境关闭了！」',
        '尚未撤离的修士将无法继续探索，请使用 #紧急撤离；已进入撤离流程者仍可完成结算。',
      ].join('\n');
    }

    await this.broadcastMessage(message);
    return lifecycle;
  }

  async processChengxianRoad(weimianData, {
    previousWorldYear,
    worldYear,
    save,
  }) {
    let changed = false;
    let notice = null;

    if (isChengxianRoadCloseDue(weimianData, worldYear)) {
      closeChengxianRoad(weimianData);
      changed = true;
      notice = 'closed';
    }

    // A road that just closed waits for the next clock tick before rolling again.
    if (
      !notice &&
      isChengxianRoadCheckDue(weimianData, previousWorldYear, worldYear)
    ) {
      const highLevelPlayers = await this.checkHighLevelPlayers();
      const eligiblePlayers = highLevelPlayers.filter(player => player.authorityLevel >= 16);
      const baseProbability = 0.3;
      const playerBonus = Math.min(eligiblePlayers.length * 0.05, 0.5);
      const totalProbability = Math.min(baseProbability + playerBonus, 0.7);

      if (Math.random() < totalProbability) {
        markChengxianRoadOpened(weimianData, worldYear);
        changed = true;
        notice = 'opened';
      } else {
        const previousNextCheck = weimianData.成仙路下次判定总年份;
        markChengxianRoadCheckFailed(weimianData, worldYear);
        changed ||= previousNextCheck !== weimianData.成仙路下次判定总年份;
      }

      if (notice === 'opened') {
        const realmNames = ['北斗星域', '飞仙星', '葬帝星', '紫微星域', '通天古星'];
        const randomRealm = realmNames[Math.floor(Math.random() * realmNames.length)];
        const message = [
          '【仙路开启·万古惊变】',
          `${randomRealm}上空，天穹骤然崩裂！`,
          '一道横贯星河的璀璨仙路显化世间！',
          '「轰隆隆——」',
          '万道仙光垂落，照亮诸天万界！',
          '仙域气息弥漫，长生物质喷涌！',
          '「成仙路开启了！」',
          '古史记载：',
          '- 神话时代，帝尊曾率天庭部众踏仙路',
          '- 太古末年，不死天皇沐浴帝血飞升',
          '- 荒古岁月，狠人大帝一掌断仙路',
          '而今，仙路再现，',
          '红尘仙及以上的修士皆可尝试轰击仙路，踏入传说中的仙域！',
          `本次仙路开启后${CHENGXIAN_ROAD_LIFECYCLE.REOPEN_COOLDOWN_YEARS}年内，不再进入新的开启判定。`,
          '使用 #轰击成仙路 命令尝试进入仙域。',
          '「这一世，谁能成仙？」',
        ].join('\n');
        if (changed) save?.();
        await this.broadcastMessage(message);
        return { changed, transition: notice };
      }
    }

    if (changed) save?.();
    if (notice === 'closed') {
      await this.broadcastMessage([
        '【仙路闭合·万古沉寂】',
        '千年时光转瞬即逝，璀璨的成仙路逐渐黯淡！',
        '横贯星河的仙路缓缓闭合，最终消失在虚空之中……',
        '「仙路已闭，待有缘再开」',
        '「这一世，终究无人成仙？」',
        '仙路闭合，诸天万界重归沉寂，',
        '唯有等待下一次仙路开启……',
        `本次仙路自开启起${CHENGXIAN_ROAD_LIFECYCLE.REOPEN_COOLDOWN_YEARS}年内，不再进入新的开启判定。`,
      ].join('\n'));
    }
    return { changed, transition: notice };
  }

  async processDarkRevoltDestruction(worldYear) {
    try {
      const event = await processDarkRevoltPlaneDestruction(worldYear);
      return event ? formatDarkRevoltPlaneDestruction(event) : '';
    } catch (error) {
      console.error('[黑暗动乱] 禁区至尊毁灭位面处理失败:', error);
      return '';
    }
  }
  async releaseJuelingSuppression(e) {
  // 权限检查：只有机器人管理员或修仙管理员可以使用
  const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
  const masterList = xiuxianConfig.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  if (!e.isMaster && !masterList.includes(userQQ)) {
    return e.reply('你没有权限使用此命令');
  }

  try {
    /* 1. 直接执行寿元归还逻辑（内部会判断是否存在压制记录） */
    const restoredCount = await this.restoreLifespan();

    /* 2. 广播结果 */
    const msg = [
      `【绝灵压制·已解除】`,
      `管理员手动归还寿元枷锁！`,
      `所有曾被压制的修士寿元已立即恢复`,
      `恢复修士数量：${restoredCount}人`,
      `「枷锁虽断，大道重归」`
    ].join('\n');

    await e.reply(msg);
    return true;
  } catch (err) {
    console.error('[解除绝灵压制] 错误：', err);
    e.reply('解除过程中发生异常，请查看日志。');
    return false;
  }
}
  /** 进入绝灵时代时压制玩家寿元 */
  async suppressLifespan(afterApply) {
    return suppressAllPlayerLifespans(afterApply);
  }
  
  /** 离开绝灵时代时恢复玩家寿元 */
  async restoreLifespan(afterApply) {
    return restoreAllPlayerLifespans(afterApply);
  }

  async applyEraLifespanTransition(oldIndex, newIndex, afterApply) {
    if (oldIndex !== 4 && newIndex === 4) {
      return { suppressedCount: await this.suppressLifespan(afterApply), restoredCount: 0 };
    }
    if (oldIndex === 4 && newIndex !== 4) {
      return { suppressedCount: 0, restoredCount: await this.restoreLifespan(afterApply) };
    }
    if (afterApply) await afterApply();
    return { suppressedCount: 0, restoredCount: 0 };
  }

  persistEraCurrent(era, current) {
    const previous = era.current;
    era.current = current;
    try {
      config.setConfig(this.configKey, 'xiuxian', this.set);
    } catch (error) {
      era.current = previous;
      throw error;
    }
  }
  // 指令处理函数
  async simulateJuelingEraLossCommand(e) {
    // 解析参数，支持可选的QQ号
    const match = e.msg.match(/^#模拟损失(?:\s+(\d+))?$/);
    const targetQQ = match[1] ? match[1] : null;

    // 调用模拟函数
    const result = await this.simulateJuelingEraLoss(targetQQ);

    if (result.success) {
      if (result.lossReports.length > 0) {
        let msg = [
          "【模拟绝灵时代损失完成】",
          result.message,
          "",
          "受影响玩家及损失物品:"
        ];

        // 显示前10个玩家的损失情况
        const displayCount = Math.min(10, result.lossReports.length);
        for (let i = 0; i < displayCount; i++) {
          const report = result.lossReports[i];
          msg.push(`${report.name} (QQ:${report.qq}): ${report.losses.join(", ")}`);
        }

        if (result.lossReports.length > 10) {
          msg.push(`...等共 ${result.lossReports.length} 名玩家`);
        }

        msg.push("");
        msg.push(`总计损失物品: ${result.totalLossCount}件`);
        msg.push("注: 此为模拟损失，未实际扣除物品");

        e.reply(msg.join("\n"));
      } else {
        e.reply("【模拟绝灵时代损失完成】\n本次模拟没有玩家损失物品");
      }
    } else {
      e.reply(`模拟失败: ${result.message}`);
    }

    return true;
  }

/** 模拟绝灵时代物品损失 */
  async simulateJuelingEraLoss(targetQQ = null) {
    try {
        let playerFiles;
        
        // 如果指定了目标QQ，只处理该玩家
        if (targetQQ) {
            // 检查玩家是否存在
            if (!await existplayer(targetQQ)) {
                return { success: false, message: `玩家 ${targetQQ} 不存在` };
            }
            
            const player = await Read_player(targetQQ);
            
            // 仙王及以上境界不损失物品
            if (hasRealmAuthority(player, 19)) {
                return { 
                    success: false, 
                    message: `玩家 ${player.名号} 已达到仙王境界，免疫绝灵时代影响` 
                };
            }
            
            playerFiles = [`${targetQQ}.json`];
        } else {
            // 处理所有玩家
            playerFiles = fs.readdirSync(__PATH.player_path)
                .filter(file => file.endsWith(".json"));
        }
        
        const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
        
        let totalLossCount = 0;
        const lossReports = [];
        
        for (const file of jsonFiles) {
            const qq = file.replace(".json", "");
            const player = await Read_player(qq);
            
            // 仙王及以上境界不损失物品
            if (hasRealmAuthority(player, 19)) continue;
            
            const najie = await Read_najie(qq);
            
            // 模拟绝灵时代年份 (随机1-5000年)
            const eraYears = Math.floor(Math.random() * 5000) + 1;
            
            // 计算损失组数 (基础3-5组 + 每千年增加2组)
            const extraGroups = Math.floor(eraYears / 1000) * 2;
            const totalLossGroups = 3 + extraGroups + Math.floor(Math.random() * 3);
            
            // 可损失物品类别
            const lossCategories = [
                '丹药','道具', '功法','草药', '材料', '食材', '仙宠','仙宠口粮','盒子'
            ].filter(cat => najie[cat]?.length > 0);
            
            if (lossCategories.length === 0) continue;
            
            let playerLossCount = 0;
            let playerLossItems = [];
            
            // 随机选择要损失的类别
            for (let i = 0; i < totalLossGroups && lossCategories.length > 0; i++) {
                const randomCatIndex = Math.floor(Math.random() * lossCategories.length);
                const category = lossCategories[randomCatIndex];
                
                // 从该类中随机选择一件物品
                if (najie[category] && najie[category].length > 0) {
                    const itemIndex = Math.floor(Math.random() * najie[category].length);
                    const item = najie[category][itemIndex];
                    
                    // 跳过已锁定物品
                    if (item.islockd === 1) continue;
                    
                    // 计算损失数量 (1-3个或10%)
                    const lossAmount = Math.min(
                        Math.max(1, Math.floor(item.数量 * 0.1)), 
                        item.数量
                    );
                    
                    playerLossCount++;
                    playerLossItems.push({
                        name: item.name,
                        category: category,
                        amount: lossAmount
                    });
                }
            }
            
            if (playerLossCount > 0) {
                totalLossCount += playerLossCount;
                
                // 记录玩家损失到Redis
                const lossData = {
                    timestamp: Date.now(),
                    eraYears: eraYears,
                    items: playerLossItems,
                    isSimulated: true // 标记为模拟损失
                };
                
                // 使用Redis存储损失信息
                const redisKey = `jueling_loss:${qq}`;
                // 获取现有的损失记录
                let existingLosses = [];
                try {
                    const existingData = await redis.get(redisKey);
                    if (existingData) {
                        existingLosses = JSON.parse(existingData);
                    }
                } catch (e) {
                    console.error("读取Redis损失记录失败:", e);
                }
                
                // 添加新损失记录
                existingLosses.push(lossData);
                
                // 保存到Redis
                try {
                    await redis.set(redisKey, JSON.stringify(existingLosses));
                } catch (e) {
                    console.error("保存损失记录到Redis失败:", e);
                }
                
                // 记录玩家损失
                lossReports.push({
                    qq: qq,
                    name: player.名号,
                    losses: playerLossItems.map(item => `${item.name}x${item.amount}`),
                    eraYears: eraYears
                });
            }
        }
        
        return { 
            success: true, 
            totalLossCount, 
            lossReports,
            message: targetQQ ? 
                `已为玩家 ${targetQQ} 模拟绝灵时代物品损失` : 
                `已为所有玩家模拟绝灵时代物品损失，共 ${lossReports.length} 名玩家受影响` 
        };
    } catch (e) {
        console.error("模拟绝灵时代物品损失失败:", e);
        return { 
            success: false, 
            message: "模拟绝灵时代物品损失失败，请查看日志" 
        };
    }
  }

/** 绝灵时代物品损失处理（仙王不损失） */
async handleJuelingEraLoss() {
    try {
        const playerFiles = fs.readdirSync(__PATH.player_path);
        const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
        
        let totalLossCount = 0;
        let sealedCount = 0; // 新增：被封印玩家计数
        let immuneCount = 0; // 新增：星宇护身符免疫计数
        const lossReports = [];
        
        for (const file of jsonFiles) {
            const qq = file.replace(".json", "");
            const player = await Read_player(qq);
            
            // === 检查是否被神源封印 ===
            const actionKey = `xiuxian:player:${qq}:action`;
            const actionData = await redis.get(actionKey);
            if (actionData) {
                const actionObj = JSON.parse(actionData);
                if (actionObj.action === '神源封印') {
                    sealedCount++; // 统计被封印玩家
                    continue; // 跳过被封印的玩家
                }
            }
            
            // 仙王及以上境界不损失物品
            if (hasRealmAuthority(player, 19)) continue;

            // === 星宇护身符：绝灵免疫护盾（消耗一层挡下本次纳戒损失）===
            const immuneKey = `jueling_loss_immune:${qq}`;
            const immuneLayers = Number(await redis.get(immuneKey)) || 0;
            if (immuneLayers > 0) {
                await redis.decr(immuneKey);
                immuneCount++;
                // 记录护身符豁免（便于 #查看损失 展示）
                const immuneRecord = {
                    timestamp: Date.now(),
                    eraYears: this.set.Era.current.years,
                    items: [{ name: '星宇护身符', category: '护身符', amount: 0 }],
                    isSimulated: false,
                    type: 'hufu_immune'
                };
                try {
                    const immuneRedisKey = `jueling_loss:${qq}`;
                    let existingLosses = [];
                    const existingData = await redis.get(immuneRedisKey);
                    if (existingData) existingLosses = JSON.parse(existingData).filter(l => !l.isSimulated);
                    existingLosses.push(immuneRecord);
                    await redis.set(immuneRedisKey, JSON.stringify(existingLosses));
                } catch (e2) {
                    console.error('记录星宇护身符豁免失败:', e2);
                }
                continue; // 护身符挡下，跳过本次纳戒损失
            }

            await withPlayerMutationLock(qq, async () => {
            const najie = await Read_najie(qq);
            
            // 计算损失组数 (基础3-5组 + 每千年增加2组)
            const eraYears = this.set.Era.current.years;
            const extraGroups = Math.floor(eraYears / 1000) * 2;
            const baseGroups = 3 + Math.floor(Math.random() * 3); // 3-5组
            const totalLossGroups = baseGroups + extraGroups;
            
            // 可损失物品类别
            const lossCategories = [
                '丹药','道具', '功法','草药', '材料', '食材', '仙宠','仙宠口粮','盒子'
            ].filter(cat => najie[cat]?.length > 0);
            
            if (lossCategories.length === 0) return;
            
            let playerLossCount = 0;
            let playerLossItems = [];
            
            // 随机选择要损失的类别
            for (let i = 0; i < totalLossGroups && lossCategories.length > 0; i++) {
                const randomCatIndex = Math.floor(Math.random() * lossCategories.length);
                const category = lossCategories[randomCatIndex];
                
                // 从该类中随机选择一件物品
                if (najie[category] && najie[category].length > 0) {
                    const itemIndex = Math.floor(Math.random() * najie[category].length);
                    const item = najie[category][itemIndex];
                    
                    // 跳过已锁定物品
                    if (item.islockd === 1) continue;
                    
                    // 修复：确保至少损失1个
                    const lossAmount = Math.max(
                        1,
                        Math.min(
                            Math.floor(item.数量 * 0.1),
                            item.数量
                        )
                    );
                    
                    // 执行损失
                    item.数量 -= lossAmount;
                    if (item.数量 <= 0) {
                        najie[category].splice(itemIndex, 1);
                    }
                    
                    playerLossCount++;
                    playerLossItems.push({
                        name: item.name,
                        category: category,
                        amount: lossAmount
                    });
                    
                    // 如果该类已空，移除可选类别
                    if (najie[category].length === 0) {
                        lossCategories.splice(randomCatIndex, 1);
                    }
                }
            }
            
            if (playerLossCount > 0) {
                // 保存纳戒数据
                await Write_najie(qq, najie);
                totalLossCount += playerLossCount;
                
                // 记录玩家损失到Redis
                const lossData = {
                    timestamp: Date.now(),
                    eraYears: eraYears,
                    items: playerLossItems,
                    isSimulated: false // 标记为真实损失
                };
                
                // 使用Redis存储损失信息
                const redisKey = `jueling_loss:${qq}`;
                let existingLosses = [];
                try {
                    const existingData = await redis.get(redisKey);
                    if (existingData) {
                        existingLosses = JSON.parse(existingData);
                        // 过滤掉模拟记录，只保留真实记录
                        existingLosses = existingLosses.filter(l => !l.isSimulated);
                    }
                } catch (e) {
                    console.error("读取Redis损失记录失败:", e);
                }
                
                // 添加新损失记录
                existingLosses.push(lossData);
                
                // 保存到Redis
                try {
                    await redis.set(redisKey, JSON.stringify(existingLosses));
                } catch (e) {
                    console.error("保存损失记录到Redis失败:", e);
                }
                
                // 记录玩家损失
                lossReports.push({
                    qq: qq,
                    name: player.名号,
                    losses: playerLossItems.map(item => `${item.name}x${item.amount}`),
                    eraYears: eraYears
                });
            }
            });
        }
        
        return { totalLossCount, lossReports, sealedCount, immuneCount }; // 返回被封印玩家数量与星宇护身符免疫数量
    } catch (e) {
        console.error("处理绝灵时代物品损失失败:", e);
        return { totalLossCount: 0, lossReports: [], sealedCount: 0, immuneCount: 0 };
    }
}

/** 使用星宇护身符：消耗1个，凝聚一层绝灵免疫护盾（redis持久化） */
async useXingyuHufu(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');

    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }

    // 检查纳戒是否拥有星宇护身符
    if (Number(await exist_najie_thing(usr_qq, '星宇护身符', '道具')) < 1) {
        e.reply("你的纳戒中没有【星宇护身符】，无法凝聚星宇护盾。");
        return true;
    }

    // 消耗1个护身符
    await Add_najie_thing(usr_qq, '星宇护身符', '道具', -1);

    // 护盾层数 +1（与玩家绑定，长期有效，每次绝灵损失消耗1层）
    const immuneKey = `jueling_loss_immune:${usr_qq}`;
    const layers = await redis.incr(immuneKey);

    await e.reply([
        `【星宇护身符·激活】`,
        `你祭出【星宇护身符】，星宇之力萦绕周身，万法不侵。`,
        `当前已凝聚星宇护盾：${layers}层`,
        `绝灵时代来临后，将自动替你挡下 ${layers} 次纳戒损失（每次消耗1层）。`,
        `「星河不灭，绝灵难侵」`
    ].join('\n'));
    return true;
}

/** 查看损失信息指令 */
async checkJuelingLoss(e) {
    
    let usr_qq = e.user_id.toString().replace('qg_','');
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply(`请先创建修仙角色`);
        return true;
    }
    
    try {
        // 从Redis获取损失记录
        const redisKey = `jueling_loss:${usr_qq}`;
        const lossData = await redis.get(redisKey);
        
        if (!lossData) {
            await ForwardMsg(e, "【绝灵时代损失记录】\n暂无物品损失记录。");
            return true;
        }
        
        const losses = JSON.parse(lossData);
        
        // 按时间倒序排列
        losses.sort((a, b) => b.timestamp - a.timestamp);
        
        // 构建回复消息
        const player = await Read_player(usr_qq);
        let msg = [
            `【${player.名号}的绝灵时代损失记录】`,
            "注：达到仙王境界可免疫绝灵时代的影响",
            ""
        ];
        
        // 显示最近5次损失记录
        const recentLosses = losses.slice(0, 5);
        
        for (const loss of recentLosses) {
            const date = new Date(loss.timestamp);
            const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
            
            // 标记是否为模拟损失
            const lossType = loss.isSimulated ? "[模拟]" : "[真实]";

            // 星宇护身符豁免记录单独展示
            if (loss.type === 'hufu_immune') {
                msg.push(`[${dateStr}] ${lossType} 绝灵${loss.eraYears}年：【星宇护身符】替你挡下绝灵侵蚀，纳戒无损`);
                msg.push("");
                continue;
            }

            msg.push(`[${dateStr}] ${lossType} 绝灵${loss.eraYears}年时损失:`);
            
            // 修复：按类别和名称分组，合并相同物品的数量
            const itemsMerged = {};
            
            // 首先合并相同物品的数量
            loss.items.forEach(item => {
                const key = `${item.category}-${item.name}`;
                if (!itemsMerged[key]) {
                    itemsMerged[key] = {
                        category: item.category,
                        name: item.name,
                        totalAmount: 0
                    };
                }
                itemsMerged[key].totalAmount += item.amount;
            });
            
            // 然后按类别分组
            const itemsByCategory = {};
            Object.values(itemsMerged).forEach(item => {
                if (!itemsByCategory[item.category]) {
                    itemsByCategory[item.category] = [];
                }
                itemsByCategory[item.category].push(`${item.name}x${item.totalAmount}`);
            });
            
            // 按固定顺序显示类别，确保显示一致
            const categoryOrder = ["草药", "食材", "材料", "道具", "盒子", "仙宠"];
            let hasContent = false;
            
            categoryOrder.forEach(category => {
                if (itemsByCategory[category] && itemsByCategory[category].length > 0) {
                    msg.push(`  ${category}：${itemsByCategory[category].join('，')}`);
                    hasContent = true;
                }
            });
            
            // 处理未在预设类别中的物品
            const otherCategories = Object.keys(itemsByCategory).filter(cat => 
                !categoryOrder.includes(cat)
            );
            
            otherCategories.forEach(category => {
                if (itemsByCategory[category] && itemsByCategory[category].length > 0) {
                    msg.push(`  ${category}：${itemsByCategory[category].join('，')}`);
                    hasContent = true;
                }
            });
            
            if (!hasContent) {
                msg.push("  无物品损失");
            }
            
            msg.push(""); // 空行分隔
        }
        
        // 添加统计信息
        const totalItemsLost = losses.reduce((total, loss) => {
            // 计算不重复的物品种类数量
            const uniqueItems = {};
            loss.items.forEach(item => {
                const key = `${item.category}-${item.name}`;
                uniqueItems[key] = (uniqueItems[key] || 0) + item.amount;
            });
            return total + Object.keys(uniqueItems).length;
        }, 0);
        
        const realLosses = losses.filter(l => !l.isSimulated);
        const simulatedLosses = losses.filter(l => l.isSimulated);
        
        msg.push(`总计损失记录：${losses.length}次（真实：${realLosses.length}，模拟：${simulatedLosses.length}）`);
        msg.push(`总计损失物品：${totalItemsLost}件`);
        
        await ForwardMsg(e, msg);
        return true;
        
    } catch (error) {
        console.error("查看损失记录失败:", error);
        e.reply(`查看损失记录时发生错误，请稍后再试。`);
        return true;
    }
}


// 在指令处理部分添加这个指令
// 例如在某个指令路由中添加：
// if (e.msg === "#查看损失信息") return await checkJuelingLoss(e);
  async advanceEra(e) {
    if (!this.set.Era?.enabled) return;
    
    try {
      // 重新加载最新配置
      this.loadEraConfig();
      
      const era = this.set.Era;
      let { index, years, epoch } = era.current;
      const advanceYears = era.yearlyAdvance || 1000;
      const previousWorldYear = getRealmEventWorldYear(index, years, epoch);
      
      // 记录旧时代索引
      const oldIndex = index;
      const oldEraName = this.eras[index].name;
      
      // 推进年份
      years += advanceYears;
      
      // ==== 位面自我修复机制：累计年数推进 ====
      const repairInterval = era.weimianRepairInterval || 2000;
      const configuredTotalYears = Number(era.current.totalYears);
      const totalYearsBefore = Math.max(
        Number.isFinite(configuredTotalYears) ? configuredTotalYears : 0,
        previousWorldYear,
      );
      const totalYearsAfter = totalYearsBefore + advanceYears;
      
      // 计算本轮跨过的修复节点（处理一次 tick 跨多节点的边界情况）
      const repairsBefore = Math.floor(totalYearsBefore / repairInterval);
      const repairsAfter = Math.floor(totalYearsAfter / repairInterval);
      const pendingRepairs = repairsAfter - repairsBefore;
      
      // 暂存到本地变量，下面会写回
      let totalYears = totalYearsAfter;
      
      // 先处理修复（后续 era.current 重新赋值时再统一持久化）
      for (let i = 0; i < pendingRepairs; i++) {
        await this.repairWeimian(totalYears);
      }
      
      // ==== 关键修改：统一读取位面数据 ====
      let weimianData = {};
      let weimianPath = data.filePathMap.weimianList;
      try {
        if (fs.existsSync(weimianPath)) {
          const rawData = fs.readFileSync(weimianPath, 'utf8');
          weimianData = JSON.parse(rawData);
        }
      } catch (err) {
        console.error('读取位面数据失败:', err);
      }
      
  // ==== 绝灵时代物品损失处理 ====
let lossMessage = '';
if (index === 4) { // 当前是绝灵时代
    const { totalLossCount, lossReports, sealedCount, immuneCount } = await this.handleJuelingEraLoss();
    
    if (totalLossCount > 0 || sealedCount > 0 || immuneCount > 0) {
        const sampleReports = lossReports
            .slice(0, 5)
            .map(r => {
                const eraEffect = `（时代侵蚀+${Math.floor(r.eraYears/1000)*2}组）`;
                return `${r.name} 损失了 ${r.losses.join('、')}${eraEffect}`;
            });
        
        lossMessage = [
            `【绝灵侵蚀·灵物凋零】`,
            `灵气枯竭的绝灵时代，万物都在失去灵性！`,
            `修士们纳戒中的灵物开始腐朽消散...`,
            `本次千年流逝造成：`,
            `- 总损失组数: ${totalLossCount}组`,
            `- 影响修士: ${lossReports.length}人`,
            `- 被封印玩家豁免: ${sealedCount}人`,
            `- 星宇护身符挡下: ${immuneCount}人`,
            `- 损失记录可通过指令查看：#查看损失`,
            `「灵性消散，道法凋零」`,
            `「此世修仙路，终将归于凡尘...」`,
            `「神源封印者不受时代侵蚀」`
        ].join('\n');
    }
}
      
      // 广播损失信息
      if (lossMessage) {
        await this.broadcastMessage(lossMessage);
      }
      // 修复核心：统一处理年份溢出
      const totalEras = this.eras.length;
      let eraPass = 0; // 跳过的时代数量
      
      // 计算跳过的时代数
      if (years >= 10000) {
        eraPass = Math.floor(years / 10000);
        years = years % 10000; // 剩余年份
      }

      let eraChanged = false;
      let newEraName = oldEraName;
      let epochIncreased = false;
      
      if (eraPass > 0) {
        // 计算新的总时代索引
        const totalIndex = index + eraPass;
        
        // 计算完整循环数（纪元增加）
        const fullCycles = Math.floor(totalIndex / totalEras);
        epoch += fullCycles;
        epochIncreased = fullCycles > 0;
        
        // 计算新时代索引（循环）
        index = totalIndex % totalEras;
        eraChanged = true;
        newEraName = this.eras[index].name;
      }
      
      const lifespanTransition = await this.applyEraLifespanTransition(
        oldIndex,
        index,
        () => this.persistEraCurrent(era, { index, years, epoch, totalYears }),
      );

      const currentWorldYear = getRealmEventWorldYear(index, years, epoch);
      const foreignCalamities = await spawnForeignCalamities(previousWorldYear, currentWorldYear);
      if (foreignCalamities.length > 0 && era.pushNotice) {
        const counts = foreignCalamities.reduce((total, entity) => {
          total[entity.type] = (total[entity.type] || 0) + 1;
          return total;
        }, {});
        await this.broadcastMessage([
          '【千年灾劫·域外来敌】',
          `诸天纪年抵达${foreignCalamities[0].worldYear}年，界壁外降下${foreignCalamities.length}尊灾厄。`,
          Object.entries(counts).map(([type, count]) => `${type}x${count}`).join('、'),
          '发送 #域外灾厄 查看，击败后可获得两组随机战利品、业力消减与位面青睐。',
        ].join('\n'));
      }
      await this.processChengxianRoad(weimianData, {
        previousWorldYear,
        worldYear: currentWorldYear,
        save: () => {
          try {
            fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
          } catch (err) {
            console.error('保存位面数据失败:', err);
          }
        },
      });
      await this.processDaoTreasureLifecycle(currentWorldYear, epoch);
      await this.processXianguLifecycle(weimianData, {
        previousWorldYear,
        worldYear: currentWorldYear,
        save: () => {
          try {
            fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
          } catch (err) {
            console.error('保存位面数据失败:', err);
          }
        },
      });
      const darkRevoltDestructionMessage = await this.processDarkRevoltDestruction(currentWorldYear);
      if (darkRevoltDestructionMessage && era.pushNotice) {
        await this.broadcastMessage(darkRevoltDestructionMessage);
      }
      const emperorRefinementMessage = await processEmperorRefinement(currentWorldYear);
      if (emperorRefinementMessage && era.pushNotice) {
        await this.broadcastMessage(emperorRefinementMessage);
      }
      
      // 每千年发送进度通知
      if (era.pushNotice && years % 1000 === 0) {
        const progress = Math.round((years / 10000) * 100);
        await this.broadcastMessage(
          ` 时代自动推进 ${advanceYears} 年！\n` +
          `当前纪元: 第${epoch}纪元\n` +
          `当前时代: ${this.eras[index].name} ${this.eras[index].icon}\n` +
          `年份: ${years}/10000 年\n` +
          `进度: ${this.createProgressBar(years)} ${progress}%`
        );
      }
      
      // ==== 天骄境界增长机制 ====
      try {
        await this.handleTianjiaoGrowth();
      } catch (tianjiaoErr) {
        console.error("天骄境界增长处理失败:", tianjiaoErr);
      }
      
      // ==== 位面大事件系统 ====
      try {
        const eventResult = await RealmEvents.triggerRandomEvent(index, years, epoch);
        if (eventResult && era.pushNotice) {
          await this.broadcastMessage(eventResult.message);
        }
        const riftResult = triggerPeriodicRiftsForEra(index, years, epoch);
        if (riftResult && era.pushNotice) await this.broadcastMessage(riftResult.message);
      } catch (eventErr) {
        console.error("触发位面大事件失败:", eventErr);
      }
      
      // ==== 新增：检查高境界玩家 ====
      const highLevelPlayers = await this.checkHighLevelPlayers();
      
      // 检查帝尊状态
      if (highLevelPlayers.length > 0) {
        // 如果帝尊已被彻底打败（状态为0），则跳过
        if (weimianData.帝尊 === 0) {
          console.log('帝尊已被彻底打败，不再响应高境界玩家');
        } else {
          // 设置帝尊感知标记
          const emperorCrisis = await setEmperorAwareness(currentWorldYear);
          if (emperorCrisis.awakened) {
            const message = [
            `【帝尊布局·万古惊变】`,
            `在时间长河的上游，一道恐怖的气息苏醒！`,
            `帝尊睁开万古未动的眼眸，神念扫过诸天万界：`,
            `"这一世...竟有变数？"`,
            `帝尊布局万古，妄图炼化全宇宙生灵的道果成就自身，`,
            `忽然感应到似乎有一道变数崛起了！`,
            `此一世有了大帝么？若${EMPEROR_CRISIS_GRACE_YEARS}年内无人应战，遮天宇宙将被世界鼎炼化。`,
            `感应到的高境界修士：`,
          ...highLevelPlayers.map(p => `- ${p.名号}（权柄等级: ${p.authorityLevel}）`)
          ].join('\n');
          
            await this.broadcastMessage(message);
          }
        }
      }
      
      // 时代结束重置天心印记
      if (eraPass > 0) {
        const { resetCount, emperorNames } = await this.resetHeavenHeartMark();
        
        // 广播重置消息
        if (resetCount > 0) {
          let emperorList = "";
          if (emperorNames.length > 0) {
            emperorList = [
              `当世大帝：`,
              ...emperorNames.map(name => `- ${name}`),
            ].join('\n');
          }
          
          const message = [
            `【时代更迭·天心重铸】`,
            `${eraPass}万年过去，${oldEraName}时代结束！`,
            `天道法则重铸，所有大帝的天心印记已被重置`,
            `新时代将诞生新的大帝！`,
            `重置数量：${resetCount}位大帝`,
            emperorList
          ].join("\n");
          
          await this.broadcastMessage(message);
        }
      }
      
      // 时代变迁通知
      if (eraChanged && era.pushNotice) {
        await this.broadcastNewEra(oldEraName, newEraName, epochIncreased ? epoch : null);
      }
      
      // ==== 新增：检查是否进入绝灵时代 ====
      // 检查是否进入绝灵时代
      if (oldIndex !== 4 && index === 4) {
        const { suppressedCount } = lifespanTransition;
        
        // 广播消息
        const message = [
          `【绝灵降临·寿元压制】`,
          `天地寂灭，灵气断绝！`,
          `绝灵时代降临，天道法则发生剧变！`,
          `所有低阶修士的寿元被天道压制至9999年`,
          `压制修士数量：${suppressedCount}人`,
          `「大道如枷锁，寿元如流水」`,
          `「此世修仙路，已是末路穷途！」`
        ].join("\n");
        
        await this.broadcastMessage(message);
      }
      
      // 检查是否离开绝灵时代
      if (oldIndex === 4 && index !== 4) {
        const { restoredCount } = lifespanTransition;
        
        // 广播消息
        const message = [
          `【灵气复苏·寿元解封】`,
          `天地复苏，灵气重涌！`,
          `绝灵时代结束，天道法则恢复正常！`,
          `所有修士被压制的寿元已恢复`,
          `恢复修士数量：${restoredCount}人`,
          `「枷锁已断，大道重开」`,
          `「修仙之路，再现光明！」`
        ].join("\n");
        
        await this.broadcastMessage(message);
      }
      
    } catch (e) {
      console.error("时代推进失败:", e);
      await this.broadcastToAdmins(`时代推进失败: ${e.message}`);
    }
  }
  
  /**
   * 位面自我修复
   * 每累计 weimianRepairInterval 年触发一次：诸天位面 +1（上限 10）
   * 三档文案：普通修复(5→8) / 高位修复(8→10) / 完全修复(10·诸天重光)
   */
  async repairWeimian(worldYear) {
    const weimianPath = data.filePathMap.weimianList;
    let weimianData = {};
    
    try {
      if (fs.existsSync(weimianPath)) {
        weimianData = JSON.parse(fs.readFileSync(weimianPath, 'utf8'));
      } else {
        console.error('[位面修复] 位面数据文件不存在');
        return;
      }
    } catch (err) {
      console.error('[位面修复] 读取位面数据失败:', err);
      return;
    }
    
    const oldLevel = weimianData["诸天位面"] || 5;

    // 位面等级与毁灭/修复共用 Era.current.totalYears 这条诸天纪年。
    const repaired = repairNaturallyDestroyedPlanes(weimianPath, {
      worldYear,
      minAge: this.set.Era.weimianRepairInterval || 2000,
    });
    if (repaired.length > 0) {
      await this.broadcastMessage([
        '【诸天位面·岁月回流】',
        `诸天纪年抵达修复节点，${repaired.length} 个可自然修复的残破位面重新凝聚。`,
        `恢复位面：${repaired.join('、')}`,
        `当前诸天纪年：${worldYear}年`,
      ].join('\n'));
    }

    // 自愈函数已更新位面文件，重新读取，避免后续位面等级写回覆盖修复结果。
    weimianData = JSON.parse(fs.readFileSync(weimianPath, 'utf8'));
    
    // 已达顶峰，不再修复
    if (oldLevel >= 10) return;
    
    const newLevel = oldLevel + 1;
    weimianData["诸天位面"] = newLevel;
    
    try {
      fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
    } catch (err) {
      console.error('[位面修复] 保存位面数据失败:', err);
      return;
    }
    
    const oldSuppress = 10 - oldLevel;
    const newSuppress = 10 - newLevel;
    const line = `位面等级：${oldLevel} → ${newLevel}`;
    const suppressLine = `位面压制：${oldSuppress} → ${newSuppress}`;
    
    let msg;
    if (newLevel >= 10) {
      // 完全修复·诸天重光
      msg = [
        `【诸天重光·万界归一】`,
        `万古诸天，一纪沉浮。`,
        `当最后一缕裂痕在虚空中弥合，`,
        `一道横贯古今的金光从混沌深处迸发——`,
        `诸天万界，终于在这一刻彻底复苏！`,
        ``,
        `成仙路的尽头，隐约可见那扇古老的仙门；`,
        `时间长河的彼岸，似乎有谁正在回眸。`,
        `那些沉睡万古的存在，也在这一刻睁开了眼眸。`,
        ``,
        `这一世，将不再是末法；`,
        `这一纪，将有人真正登临绝顶！`,
        ``,
        `「山高路远，诸位道友，且行且珍惜。」`,
        ``,
        `${line}（已达顶峰·诸天重光）`,
        `位面压制：0（位面完全修复！）`
      ].join('\n');
    } else if (newLevel >= 8) {
      // 高位修复·大道回响
      msg = [
        `【位面复苏·大道回响】`,
        `亘古匆匆，沧海桑田。`,
        `当世人都以为诸天已彻底沉沦时，`,
        `天地尽头忽然传来一声沉闷的轰鸣——`,
        `那是大道在重塑，那是命运在回响！`,
        ``,
        `曾断绝的成仙路，似又有了微弱的回音；`,
        `曾破碎的天心印记，似又重新凝聚。`,
        `那扇横贯万古的仙门，似在混沌深处缓缓浮现。`,
        ``,
        `修士们仰望苍穹，心中皆有一个疑问：`,
        `「这一纪元的尽头，究竟谁将叩开那扇门？」`,
        ``,
        line,
        suppressLine
      ].join('\n');
    } else {
      // 普通修复·道则弥合
      msg = [
        `【位面修复·道则弥合】`,
        `万古如长夜，弹指已千年。`,
        ``,
        `诸天万界深处，混沌初动，`,
        `一缕大道金光自时间长河尽头涌来——`,
        `那是岁月的回眸，是命运的缝合，是宇宙本源的自我修复。`,
        ``,
        `破碎的天地法则在虚空中缓缓弥合，`,
        `断绝的灵脉在山河间重新凝聚，`,
        `曾被末法斩断的成道之机，似又有了微弱的回音。`,
        ``,
        `——「这一纪元，又要起风了。」`,
        ``,
        line,
        suppressLine
      ].join('\n');
    }
    
    await this.broadcastMessage(msg);
    console.log(`[位面修复] ${oldLevel} → ${newLevel}，压制 ${oldSuppress} → ${newSuppress}`);
  }
  
  /** 检查并触发诡异大祭（每8个纪元触发一次） */
  async checkAndTriggerDajie(epoch) {
    try {
      // 检查大祭是否已被终结
      const eternalDefeat = await redis.get('xiuxian:dajie_eternally_defeated');
      if (eternalDefeat === 'true') {
        // 如果大祭被终结，重置计数器
        await redis.set('xiuxian:epochs_since_dajie', epoch.toString());
        return;
      }
      
      // 获取上次大祭开始的纪元
      let epochsSinceLastDajie = await redis.get('xiuxian:epochs_since_dajie');
      epochsSinceLastDajie = epochsSinceLastDajie ? parseInt(epochsSinceLastDajie) : 0;
      
      // 检查是否满8个纪元
      if (epoch - epochsSinceLastDajie >= 8) {
        // 检查诡异大祭是否已开启
        let dajieAlive = await redis.get('guiyishizu');
        if (!dajieAlive) {
          // 触发诡异大祭
          await this.triggerDajie(epoch);
        }
      }
    } catch (e) {
      console.error("检查诡异大祭触发失败:", e);
    }
  }
  
  /** 触发诡异大祭 */
  async triggerDajie(epoch) {
    try {
      // 记录大祭开始的纪元
      await redis.set('xiuxian:epochs_since_dajie', epoch.toString());
      
      const message = [
        `═══════ 诡异大祭·预兆 ═══════`,
        `【诸天异变】`,
        `就在这一日——`,
        `厄土高原深处，传来一阵诡异的脉动！`,
        `那股沉寂了万古的气息，`,
        `正在缓缓苏醒……`,
        ``,
        `「诡异……将再次降临。」`,
        ``,
        `黑雾开始在高原上空汇聚，`,
        `亿万被祭掉生灵的残魂在黑雾中哀嚎，`,
        `诉说着那段永世难忘的血泪史……`,
        ``,
        `距离诡异大祭正式降临还有一个千年……`,
        `诸天万界的路尽级仙帝们，`,
        `请做好迎接大祭的准备！`,
      ].join('\n');
      
      await this.broadcastMessage(message);
      
      // 广播到所有群
      const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
      const groupList = await redis.sMembers(redisGlKey);
      for (const group_id of groupList) {
        Bot.pickGroup(group_id).sendMsg(message).catch(console.error);
      }
      
      console.log(`[诡异大祭] 第${epoch}纪元，诡异大祭预兆已发布`);
    } catch (e) {
      console.error("触发诡异大祭失败:", e);
    }
  }
  
  async checkHighLevelPlayers() {
    const now = Date.now();
    if (this.highLevelPlayersCache?.expiresAt > now) {
      return this.highLevelPlayersCache.players;
    }
    if (this.highLevelPlayersPromise) return this.highLevelPlayersPromise;
    this.highLevelPlayersPromise = (async () => {
    try {
      // 获取所有玩家文件
      const playerFiles = fs.readdirSync(__PATH.player_path);
      const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
      
      const highLevelPlayers = [];
      
      for (const file of jsonFiles) {
        const qq = file.replace(".json", "");
        const player = await Read_player(qq);
        
        const authorityLevel = getRealmAuthorityLevel(player);
        if (authorityLevel > 15) {
          highLevelPlayers.push({
            qq: qq,
            名号: player.名号,
            mijinglevel_id: player.mijinglevel_id,
            xiangulevel_id: player.xiangulevel_id,
            authorityLevel,
          });
        }
      }
      
      this.highLevelPlayersCache = {
        players: highLevelPlayers,
        expiresAt: Date.now() + 60_000,
      };
      return highLevelPlayers;
    } catch (e) {
      console.error("检查高境界玩家失败:", e);
      return [];
    }
    })().finally(() => {
      this.highLevelPlayersPromise = null;
    });
    return this.highLevelPlayersPromise;
  }
  
  // 新增：重置天心印记的方法
  async resetHeavenHeartMark() {
    try {
        // 获取所有玩家文件
        const playerFiles = fs.readdirSync(__PATH.player_path);
        const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
        
        let resetCount = 0;
        let emperorNames = []; // 存储大帝名号
        
        for (const file of jsonFiles) {
            const qq = file.replace(".json", "");
            const player = await Read_player(qq);
            
            // 检查并重置天心印记
            if (player.天心印记 && player.天心印记 > 0) {
                // 记录大帝名号
                emperorNames.push(player.名号);
                
                player.天心印记 = 0;
                await Write_player(qq, player);
                resetCount++;
            }
        }
        
        return { resetCount, emperorNames };
    } catch (e) {
        console.error("重置天心印记失败:", e);
        throw new Error("重置天心印记失败");
    }
  }
  
  /** 天骄每三千年尝试突破并进行一次自我强化。 */
  async handleTianjiaoGrowth() {
    try {
      const tianjiaoList = data.weimiantianjiao_list;
      if (!tianjiaoList || tianjiaoList.length === 0) return;
      const eraIndex = Number(this.set.Era.current.index) || 0;
      const eraYears = Number(this.set.Era.current.years) || 0;
      const worldYears = getRealmEventWorldYear(eraIndex, eraYears, this.set.Era.current.epoch);
      const breakthroughDue = isTianjiaoBreakthroughYear(worldYears);
      const improvementDue = isTianjiaoImprovementYear(worldYears);
      const context = {
        eraIndex,
        cultivationLevels: data.Level_list,
        physiqueLevels: data.LevelMax_list,
        secretLevels: data.Levelmijing_list,
        ancientLevels: data.xiangujinshi_list,
        flowerLevels: data.huafen_list,
        equipmentList: data.equipment_list,
        specialEquipmentList: data.tszb_list,
        imperialWeaponList: data.dibing_list,
        talentList: data.talent_list,
        techniqueList: [
          ...(data.jineng1 || []),
          ...(data.jineng2 || []),
          ...(data.jineng3 || []),
          ...(data.jineng_heal || []),
        ],
      };
      const realmReports = [];
      const improvementReports = [];
      const bloodlineReports = [];
      const recoveryReports = [];
      let tianjiaoDataChanged = false;

      for (const tianjiao of tianjiaoList) {
        if (ensureTianjiaoInitialTemplate(tianjiao)) tianjiaoDataChanged = true;

        const statusKey = `tianjiao:status:${tianjiao.名号}`;
        let status = {};
        try {
          status = JSON.parse(await redis.get(statusKey) || '{}');
        } catch {
          status = {};
        }

        const recovered = recoverTianjiaoFromSetback(status, worldYears);
        if (recovered) {
          recoveryReports.push({ name: tianjiao.名号, ...recovered });
          await redis.set(statusKey, JSON.stringify(status));
        }

        if (!isIndependentTianjiao(tianjiao)) continue;
        if (!canTianjiaoGrow(status, worldYears)) continue;

        let statusChanged = false;
        if (breakthroughDue) {
          if (status.下次证道阻断) {
            delete status.下次证道阻断;
            statusChanged = true;
          } else {
            const breakthrough = attemptTianjiaoBreakthrough(tianjiao, context);
            if (breakthrough) {
              realmReports.push({ name: tianjiao.名号, ...breakthrough });
              tianjiaoDataChanged = true;
            }
          }
        }

        const bloodline = advanceSpecialTianjiaoEvolution(tianjiao, context);
        if (bloodline) {
          bloodlineReports.push(bloodline);
          tianjiaoDataChanged = true;
        }

        if (improvementDue) {
          const improvementMultiplier = Number(status.下次自强倍率) || 1;
          delete status.下次自强倍率;
          statusChanged = true;
          if (Math.random() < getTianjiaoImprovementChance(eraIndex) * improvementMultiplier) {
            const improvements = improveTianjiao(tianjiao, context);
            if (improvements.length > 0) {
              improvementReports.push({ name: tianjiao.名号, improvements });
              tianjiaoDataChanged = true;
            }
          }
        }

        if (statusChanged) await redis.set(statusKey, JSON.stringify(status));
      }

      if (tianjiaoDataChanged) {
        const bossListPath = path.join(data.filePathMap.lib, '位面boss列表.json');
        fs.writeFileSync(bossListPath, JSON.stringify(tianjiaoList, null, 2), 'utf8');
      }

      if (tianjiaoDataChanged || recoveryReports.length > 0) {
        const mijingReports = realmReports.filter(r => r.field === 'mijinglevel_id');
        const xianguReports = realmReports.filter(r => r.field === 'xiangulevel_id');
        const msgLines = [];

        if (recoveryReports.length > 0) {
          msgLines.push('【天骄伤愈·再临天下】');
          for (const r of recoveryReports) {
            msgLines.push(`  ${r.name} 养伤千载，自【${r.type}】中走出，气血恢复到 ${r.currentHP}%。`);
          }
        }

        if (mijingReports.length > 0) {
          msgLines.push('【遮天秘境·天骄证道】');
          msgLines.push('北斗星域，道韵流转，诸天骄于秘境道途中再破关隘！');
          for (const r of mijingReports) {
            msgLines.push(`  ${r.name} 闭关五千年，自【${r.oldRealm}】证得【${r.newRealm}】！`);
          }
        }

        if (xianguReports.length > 0) {
          msgLines.push('【仙古纪元·神子蜕变】');
          msgLines.push('下界八域，血气冲霄，仙古路上的神子们历劫蜕变！');
          for (const r of xianguReports) {
            msgLines.push(`  ${r.name} 历经磨劫，自【${r.oldRealm}】蜕变至【${r.newRealm}】！`);
          }
        }

        if (improvementReports.length > 0) {
          msgLines.push('【三千年积累·天骄自强】');
          for (const report of improvementReports) {
            msgLines.push(`  ${report.name}：${report.improvements.join('；')}`);
          }
        }

        if (bloodlineReports.length > 0) {
          msgLines.push('【天骄血脉·本源蜕变】');
          for (const report of bloodlineReports) {
            msgLines.push(`  ${report.name}：${report.message}`);
            if (report.evolvedTo) msgLines.push(`  体质蜕变为【${report.evolvedTo}】！`);
          }
        }

        msgLines.push('「机缘所致，大道可期」');

        await this.broadcastMessage(msgLines.join('\n'));
        console.log(`[天骄成长] ${realmReports.length}次境界突破，${improvementReports.length}位自我强化，${bloodlineReports.length}次血脉事件，${recoveryReports.length}位伤愈`);
      }
    } catch (e) {
      console.error('天骄境界增长处理失败:', e);
    }
  }
  
  /** 广播新时代通知 */
  async broadcastNewEra(oldEra, newEra, newEpoch) {
    const newEraObj = this.eras.find(e => e.name === newEra);
    let message = `天地巨变！修仙世界已从【${oldEra}】进入【${newEra}】！\n`;
    
    if (newEpoch) {
      message += `纪元更迭！当前纪元：第${newEpoch}纪元\n`;
    }
    
    message += `${newEraObj.icon} ${newEraObj.desc}\n` +
               `天道法则转变，所有修士请做好应对准备！`;
    
    await this.broadcastMessage(message);
  }

  async processDaoTreasureLifecycle(worldYear, epoch) {
    try {
      const daoAdvance = await advanceDaoTreasureProject(worldYear, epoch);
      for (const event of daoAdvance.events || []) {
        if (event.type === 'stage-closed') {
          const stage = DAO_TREASURE_STAGES[event.stageIndex];
          await this.broadcastMessage([
            `【大道炉·${stage.name}终章】`,
            `一个时代的炉火已经燃尽，留下镇守道痕${event.guardians}/${DAO_TREASURE_GUARD_TARGET}。`,
            event.stage.complete
              ? `${stage.authority ? `【${stage.authority}】权柄` : '大道器胚'}完整成形。`
              : `${stage.authority ? `【${stage.authority}】权柄` : '大道器胚'}留下残缺，成器后可献祭材料修复。`,
          ].join('\n'));
        }
        if (event.type === 'stage-opened') {
          const stage = DAO_TREASURE_STAGES[event.stageIndex];
          await this.broadcastMessage([
            `【大道炉·${stage.name}】`,
            stage.lore,
            event.stageIndex === 4
              ? '第五时代器劫降临，使用 #渡大道器劫 击败大道化身，留下渡劫道痕。'
              : '每位修士可使用 #镇守大道炉 留下一道文明道痕。',
          ].join('\n'));
        }
        if (event.type === 'completed') {
          await this.broadcastMessage([
            '【大道器成·诸界重排】',
            `一个纪元的文明薪火于今日燃尽，【${event.treasure.name}】自大道熔炉中出世。`,
            `器主：${event.treasure.ownerName}｜完整度：${event.treasure.integrity}%`,
            '自此，生死有了可以删改的文字，命运有了可以重新落下的笔锋。',
            '至宝将在器主下一次使用 #大道至宝 时发放至纳戒。',
          ].join('\n'));
        }
      }
    } catch (error) {
      console.error('大道至宝纪元推进失败:', error);
    }
  }
  
  /** 设置时代进度（管理员命令） */
  async setEraProgress(e) {
    // 权限检查：只有机器人管理员或修仙管理员可以使用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限使用此命令');
    }

    const params = e.msg.replace(/^#?设置时代(进度)?\s*/, '').trim();
    
    if (!params) {
      const { index, years, epoch } = this.set.Era.current;
      const era = this.eras[index];
      return e.reply([
        `📜 当前时代状态`,
        `纪元: 第${epoch}纪元`,
        `时代: ${era.name} ${era.icon}`,
        `年份: ${years}/10000`,
        `进度: ${this.createProgressBar(years)} ${Math.round((years/10000)*100)}%`,
        `使用格式: #设置时代 [时代索引] [年份] [纪元]`,
        `时代索引: 0=神话, 1=太古, 2=天命, 3=末法, 4=绝灵`,
        `例如: #设置时代 2 5000 1`
      ].join('\n'));
    }
    
    const parts = params.split(/\s+/);
    const eraIndexStr = parts[0];
    const yearStr = parts[1];
    const epochStr = parts[2] || "1"; // 默认纪元为1
    
    const eraIndex = parseInt(eraIndexStr);
    const years = parseInt(yearStr);
    const epoch = parseInt(epochStr);
    
    // 参数验证
    if (isNaN(eraIndex) || isNaN(years) || isNaN(epoch) || 
        eraIndex < 0 || eraIndex >= this.eras.length || 
        years < 0 || years > 10000 || epoch < 1) {
      return e.reply('参数错误！请提供有效的时代索引(0-4)、年份(0-10000)和纪元(≥1)');
    }
    
    // 记录旧时代索引
    const oldIndex = this.set.Era.current.index;
    
    const worldYear = getRealmEventWorldYear(eraIndex, years, epoch);
    const lifespanTransition = await this.applyEraLifespanTransition(
      oldIndex,
      eraIndex,
      () => this.persistEraCurrent(this.set.Era, { index: eraIndex, years, epoch, totalYears: worldYear }),
    );
    await this.processDaoTreasureLifecycle(worldYear, epoch);
    const darkRevoltDestructionMessage = await this.processDarkRevoltDestruction(worldYear);
    const emperorRefinementMessage = await processEmperorRefinement(worldYear);
    
    const era = this.eras[eraIndex];
    
    // ==== 新增：寿元压制逻辑 ====
    let suppressMsg = '';
    let restoreMsg = '';
    
    // 检查是否进入绝灵时代
    if (oldIndex !== 4 && eraIndex === 4) {
      const { suppressedCount } = lifespanTransition;
      
      suppressMsg = [
        `【绝灵降临·寿元压制】`,
        `进入绝灵时代，所有修士寿元被压制至9999年`,
        `压制修士数量：${suppressedCount}人`
      ].join("\n");
    }
    
    // 检查是否离开绝灵时代
    if (oldIndex === 4 && eraIndex !== 4) {
      const { restoredCount } = lifespanTransition;
      
      restoreMsg = [
        `【灵气复苏·寿元解封】`,
        `离开绝灵时代，所有修士被压制的寿元已恢复`,
        `恢复修士数量：${restoredCount}人`
      ].join("\n");
    }
    
    return e.reply([
      `时代设置成功！`,
      `新纪元: 第${epoch}纪元`,
      `新时代: ${era.name} ${era.icon}`,
      `新年份: ${years}/10000年`,
      `进度: ${this.createProgressBar(years)} ${Math.round((years/10000)*100)}%`,
      suppressMsg,
      restoreMsg,
      darkRevoltDestructionMessage,
      emperorRefinementMessage,
    ].join('\n'));
  }
  
 /** 推进一千年 */
  async advanceOneThousandYears(e) {
    // 权限检查：只有机器人管理员或修仙管理员可以使用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限使用此命令');
    }

    try {
      this.loadEraConfig();
      
      const era = this.set.Era;
      let { index, years, epoch } = era.current;
      const advanceYears = 1000;
      const previousWorldYear = getRealmEventWorldYear(index, years, epoch);
      
      const oldIndex = index;
      const oldEraName = this.eras[index].name;
      
      years += advanceYears;
      
      let weimianData = {};
      let weimianPath = data.filePathMap.weimianList;
      try {
        if (fs.existsSync(weimianPath)) {
          const rawData = fs.readFileSync(weimianPath, 'utf8');
          weimianData = JSON.parse(rawData);
        }
      } catch (err) {
        console.error('读取位面数据失败:', err);
      }
      
      const totalEras = this.eras.length;
      let eraPass = 0;
      
      if (years >= 10000) {
        eraPass = Math.floor(years / 10000);
        years = years % 10000;
      }

      let eraChanged = false;
      let newEraName = oldEraName;
      let epochIncreased = false;
      
      if (eraPass > 0) {
        const totalIndex = index + eraPass;
        const fullCycles = Math.floor(totalIndex / totalEras);
        index = totalIndex % totalEras;
        eraChanged = true;
        newEraName = this.eras[index].name;
        epoch += fullCycles;
        epochIncreased = fullCycles > 0;
      }
      
      const currentWorldYear = getRealmEventWorldYear(index, years, epoch);
      const lifespanTransition = await this.applyEraLifespanTransition(
        oldIndex,
        index,
        () => this.persistEraCurrent(era, { index, years, epoch, totalYears: currentWorldYear }),
      );
      await this.processChengxianRoad(weimianData, {
        previousWorldYear,
        worldYear: currentWorldYear,
        save: () => {
          try {
            fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
          } catch (err) {
            console.error('保存位面数据失败:', err);
          }
        },
      });
      await this.processDaoTreasureLifecycle(currentWorldYear, epoch);

      await this.processXianguLifecycle(weimianData, {
        previousWorldYear,
        worldYear: currentWorldYear,
        save: () => {
          try {
            fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
          } catch (err) {
            console.error('保存位面数据失败:', err);
          }
        },
      });
      const darkRevoltDestructionMessage = await this.processDarkRevoltDestruction(currentWorldYear);
      const emperorRefinementMessage = await processEmperorRefinement(currentWorldYear);
      
      const currentEra = this.eras[index];
      let message = [
        `管理员推进了 ${advanceYears} 年！`,
        `当前纪元: 第${epoch}纪元`,
        `当前时代: ${currentEra.name} ${currentEra.icon}`,
        `新年份: ${years}/10000年`,
        `进度: ${this.createProgressBar(years)} ${Math.round((years/10000)*100)}%`
      ].join('\n');
      
      // ==== 新增：绝灵时代物品损失 ====
      let lossMessage = '';
      if (this.set.Era.current.index === 4) {
        const { totalLossCount, lossReports, immuneCount } = await this.handleJuelingEraLoss();

        if (totalLossCount > 0 || immuneCount > 0) {
          const sampleReports = lossReports
            .slice(0, 5)
            .map(r => {
              const eraEffect = `（时代侵蚀+${Math.floor(r.eraYears/1000)*2}组）`;
              return `${r.name} 损失了 ${r.losses.join('、')}${eraEffect}`;
            });
          
          lossMessage = [
            `【绝灵侵蚀·灵物凋零】`,
            `灵气枯竭的绝灵时代，万物都在失去灵性！`,
            `修士们纳戒中的灵物开始腐朽消散...`,
            `本次千年流逝造成：`,
            `- 总损失组数: ${totalLossCount}组`,
            `- 影响修士: ${lossReports.length}人`,
            `- 星宇护身符挡下: ${immuneCount}人`,
            `部分损失记录：`,
            ...sampleReports,
            `「灵性消散，道法凋零」`,
            `「此世修仙路，终将归于凡尘...」`
          ].join('\n');
        }
      }
      
      // ==== 天骄境界增长机制 ====
      try {
        await this.handleTianjiaoGrowth();
      } catch (tianjiaoErr) {
        console.error("天骄境界增长处理失败:", tianjiaoErr);
      }
      
      // ==== 位面大事件系统 ====
      try {
        const eventResult = await RealmEvents.triggerRandomEvent(this.set.Era.current.index, years, epoch);
        if (eventResult) {
          message += '\n\n' + eventResult.message;
        }
        const riftResult = triggerPeriodicRiftsForEra(this.set.Era.current.index, years, epoch);
        if (riftResult) message += '\n\n' + riftResult.message;
      } catch (eventErr) {
        console.error("触发位面大事件失败:", eventErr);
      }
      
      // 检查高境界玩家
      const highLevelPlayers = await this.checkHighLevelPlayers();
      if (highLevelPlayers.length > 0) {
        if (weimianData.帝尊 !== 0) {
          const emperorCrisis = await setEmperorAwareness(currentWorldYear);
          if (emperorCrisis.awakened) {
            const highPlayerMsg = [
            `【帝尊布局·万古惊变】`,
            `在时间长河的上游，一道恐怖的气息苏醒！`,
            `帝尊睁开万古未动的眼眸，神念扫过诸天万界：`,
            `"这一世...竟有变数？"`,
            `帝尊布局万古，妄图炼化全宇宙生灵的道果成就自身，`,
            `忽然感应到似乎有一道变数崛起了！`,
            `此一世有了大帝么？若${EMPEROR_CRISIS_GRACE_YEARS}年内无人应战，遮天宇宙将被世界鼎炼化。`,
            `感应到的高境界修士：`,
            ...highLevelPlayers.map(p => `- ${p.名号}（权柄等级: ${p.authorityLevel}）`)
          ].join('\n');
          
            message += '\n\n' + highPlayerMsg;
          }
        } else {
          message += '\n\n帝尊已被彻底打败，不再响应高境界玩家';
        }
      }
      
      if (eraChanged) {
        message += `\n\n时代更迭！进入新时代: ${newEraName}`;
        if (epochIncreased) {
          message += `\n纪元更迭！当前纪元：第${epoch}纪元`;
        }
        
        if (era.pushNotice) {
          await this.broadcastNewEra(oldEraName, newEraName, epochIncreased ? epoch : null);
        }
      }
      
      // 添加损失消息
      if (lossMessage) {
        message += '\n\n' + lossMessage;
      }
      if (darkRevoltDestructionMessage) {
        message += `\n\n${darkRevoltDestructionMessage}`;
      }
      if (emperorRefinementMessage) message += `\n\n${emperorRefinementMessage}`;
      
      // 检查是否进入/离开绝灵时代
      let suppressMsg = '';
      let restoreMsg = '';
      
      if (oldIndex !== 4 && index === 4) {
        const { suppressedCount } = lifespanTransition;
        
        suppressMsg = [
          `【绝灵降临·寿元压制】`,
          `天地寂灭，灵气断绝！`,
          `绝灵时代降临，天道法则发生剧变！`,
          `所有低阶修士的寿元被天道压制至9999年`,
          `压制修士数量：${suppressedCount}人`,
          `「大道如枷锁，寿元如流水」`,
          `「此世修仙路，已是末路穷途！」`
        ].join("\n");
      }
      
      if (oldIndex === 4 && index !== 4) {
        const { restoredCount } = lifespanTransition;
        
        restoreMsg = [
          `【灵气复苏·寿元解封】`,
          `天地复苏，灵气重涌！`,
          `绝灵时代结束，天道法则恢复正常！`,
          `所有修士被压制的寿元已恢复`,
          `恢复修士数量：${restoredCount}人`,
          `「枷锁已断，大道重开」`,
          `「修仙之路，再现光明！」`
        ].join("\n");
      }
      
      if (suppressMsg) message += '\n\n' + suppressMsg;
      if (restoreMsg) message += '\n\n' + restoreMsg;
      
      // 天心印记重置
      if (eraPass > 0) {
        const { resetCount, emperorNames } = await this.resetHeavenHeartMark();
        
        if (resetCount > 0) {
          const resetMsg = [
            `【时代更迭·天心重铸】`,
            `${eraPass}万年过去，${oldEraName}时代结束！`,
            `天道法则重铸，所有大帝的天心印记已被重置`,
            `新时代将诞生新的大帝！`,
            `重置数量：${resetCount}位大帝`
          ].join("\n");
          
          message += '\n\n' + resetMsg;
        }
      }
      
      await e.reply(message);
      return true;
    } catch (error) {
      console.error("推进一千年失败:", error);
      await e.reply(`推进一千年失败: ${error.message}`);
      return false;
    }
  }
  
  async advanceToNextEra(e) {
    // 权限检查：只有机器人管理员或修仙管理员可以使用
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限使用此命令');
    }

    try {
      // 重新加载最新配置
      this.loadEraConfig();
      
      const era = this.set.Era;
      let { index, years, epoch } = era.current;
      const previousWorldYear = getRealmEventWorldYear(index, years, epoch);
      
      // 记录旧时代索引
      const oldIndex = index;
      const oldEraName = this.eras[index].name;
      
      // 推进到下一个时代
      index = (index + 1) % this.eras.length;
      years = 0; // 新时代年份重置为0
      
      // 检查是否需要增加纪元（从绝灵时代回到神话时代）
      if (oldIndex === 4 && index === 0) {
        epoch++;
      }
      
      // 更新配置
      const currentWorldYear = getRealmEventWorldYear(index, years, epoch);
      const lifespanTransition = await this.applyEraLifespanTransition(
        oldIndex,
        index,
        () => this.persistEraCurrent(era, { index, years, epoch, totalYears: currentWorldYear }),
      );
      await this.processDaoTreasureLifecycle(currentWorldYear, epoch);

      let weimianData = {};
      const weimianPath = data.filePathMap.weimianList;
      try {
        if (fs.existsSync(weimianPath)) {
          weimianData = JSON.parse(fs.readFileSync(weimianPath, 'utf8'));
        }
      } catch (err) {
        console.error('读取位面数据失败:', err);
      }
      await this.processChengxianRoad(weimianData, {
        previousWorldYear,
        worldYear: currentWorldYear,
        save: () => {
          try {
            fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
          } catch (err) {
            console.error('保存位面数据失败:', err);
          }
        },
      });
      await this.processXianguLifecycle(weimianData, {
        previousWorldYear,
        worldYear: currentWorldYear,
        save: () => {
          try {
            fs.writeFileSync(weimianPath, JSON.stringify(weimianData, null, 4), 'utf8');
          } catch (err) {
            console.error('保存位面数据失败:', err);
          }
        },
      });
      const darkRevoltDestructionMessage = await this.processDarkRevoltDestruction(currentWorldYear);
      const emperorRefinementMessage = await processEmperorRefinement(currentWorldYear);
      
      const newEraName = this.eras[index].name;
      
      // 重置天心印记
      await this.resetHeavenHeartMark();
      
      // 构建回复消息
      let message = [
        `【管理员操作·时代推进】`,
        `管理员手动推进时代！`,
        `旧时代: ${oldEraName}`,
        `新时代: ${newEraName} ${this.eras[index].icon}`,
        `年份: 0/10000 年`,
        `天心印记已重置，新时代将诞生新的大帝！`
      ].join("\n");
      
      // ==== 新增：寿元压制逻辑 ====
      // 检查是否进入绝灵时代
      if (oldIndex !== 4 && index === 4) {
        const { suppressedCount } = lifespanTransition;
        
        // 回复消息
        const suppressMsg = [
          `【绝灵降临·寿元压制】`,
          `进入绝灵时代，所有修士寿元被压制至9999年`,
          `压制修士数量：${suppressedCount}人`
        ].join("\n");
        
        message += `\n\n${suppressMsg}`;
      }
      
      // 检查是否离开绝灵时代
      if (oldIndex === 4 && index !== 4) {
        const { restoredCount } = lifespanTransition;
        
        // 回复消息
        const restoreMsg = [
          `【灵气复苏·寿元解封】`,
          `离开绝灵时代，所有修士被压制的寿元已恢复`,
          `恢复修士数量：${restoredCount}人`
        ].join("\n");
        
        message += `\n\n${restoreMsg}`;
      }
      
      // ==== 位面大事件系统 ====
      try {
        const eventResult = await RealmEvents.triggerRandomEvent(index, years, epoch);
        if (eventResult) {
          message += '\n\n' + eventResult.message;
        }
        const riftResult = triggerPeriodicRiftsForEra(index, years, epoch);
        if (riftResult) message += '\n\n' + riftResult.message;
      } catch (eventErr) {
        console.error("触发位面大事件失败:", eventErr);
      }
      if (darkRevoltDestructionMessage) {
        message += `\n\n${darkRevoltDestructionMessage}`;
      }
      if (emperorRefinementMessage) message += `\n\n${emperorRefinementMessage}`;
      
      await e.reply(message);
      
    } catch (e) {
      console.error("手动推进时代失败:", e);
      await e.reply(`手动推进时代失败: ${e.message}`);
    }
  }
  
  /** 查询当前纪元 */
  async queryEpoch(e) {
    try {
      this.loadEraConfig();
      const { index, years, epoch } = this.set.Era.current;
      const era = this.eras[index];
      
      const progress = Math.round((years / 10000) * 100);
      const nextEraIndex = (index + 1) % this.eras.length;
      
      // ==== 新增：获取当世大帝 ====
      let emperorList = [];
      try {
        const playerFiles = fs.readdirSync(__PATH.player_path);
        const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
        
        for (const file of jsonFiles) {
          const qq = file.replace(".json", "");
          const player = await Read_player(qq);
          
          if (player.天心印记 && player.天心印记 > 0) {
            emperorList.push(player.名号);
          }
        }
      } catch (err) {
        console.error("查询当世大帝失败:", err);
      }
      
      let emperorMsg = "";
      if (emperorList.length > 0) {
        emperorMsg = [
          `【当世大帝】`,
          ...emperorList.map(name => `- ${name}`),
        ].join('\n');
      } else {
        emperorMsg = `\n【当世大帝】\n- 暂无大帝`;
      }
      
      // 检查当前是否在绝灵时代
      const isJuelingEra = index === 4;
      let lifespanStatus = "";
      
      if (isJuelingEra) {
        lifespanStatus = [
          `【寿元压制】`,
          `当前处于绝灵时代，所有修士寿元被压制至9999年`,
          `离开此时代后将恢复原始寿元`
        ].join("\n");
      }
      
      await e.reply([
        `纪元信息`,
        `当前纪元: 第${epoch}纪元`,
        `当前时代: ${era.name} ${era.icon}`,
        `年份: ${years}/10000年`,
        `进度: ${this.createProgressBar(years)} ${progress}%`,
        `下个时代: ${this.eras[nextEraIndex].name}`,
        `距离下个时代: ${10000 - years}年`,
        `当完成所有时代后，将进入第${epoch + 1}纪元`,
        emperorMsg,
        lifespanStatus
      ].join('\n'));
      
      return true;
    } catch (error) {
      console.error("查询纪元失败:", error);
      await e.reply(`查询纪元失败: ${error.message}`);
      return false;
    }
  }
  
  /** 创建进度条 */
  createProgressBar(years) {
    const width = 10;
    const progress = Math.min(100, Math.floor(years / 100));
    const filled = Math.floor(progress / (100 / width));
    const empty = width - filled;

    return `${'▰'.repeat(filled)}${'▱'.repeat(empty)}`;
  }

  /** 查询位面大事件记录 */
  async queryRealmEvents(e) {
    try {
      const activeEvents = RealmEvents.getActiveEvents();
      const eventHistory = RealmEvents.getEventHistory(10);
      const eventStats = RealmEvents.getEventStats();

      let msg = [`【位面大事件】`, `【当前事件】`];
      if (activeEvents.length === 0) {
        msg.push('当前诸天平静，暂无正在发生的大事件。', '');
      } else {
        for (const event of activeEvents) {
          const minutes = Math.max(1, Math.ceil((Number(event.expiresAt) - Date.now()) / 60000));
          const remaining = minutes >= 60
            ? `${Math.floor(minutes / 60)}小时${minutes % 60 ? `${minutes % 60}分钟` : ''}`
            : `${minutes}分钟`;
          msg.push(
            `- ${RealmEvents.getEventTypeName(event.type)}`,
            `  地点：${formatRealmEventLocation(event)}`,
            `  剩余：${remaining}`,
            `  参与：${RealmEvents.getEventParticipationCommand(event)}`,
            `  已参与：${event.participantQqs?.length || event.claimedQqs?.length || 0}人`
          );
        }
        msg.push('');
      }
      msg.push(`【最近记录】`);

      if (eventHistory.length === 0) {
        msg.push(`暂无大事件记录`);
      } else {
        for (let i = 0; i < eventHistory.length; i++) {
          const event = eventHistory[i];
          const eventType = RealmEvents.getEventTypeName(event.type);
          const date = new Date(event.timestamp);
          const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;

          // 根据不同事件类型显示不同摘要
          let summary = '';
          switch (event.type) {
            case 'treasureAppear':
              summary = `${event.treasure.name} 出世于 ${formatRealmEventLocation(event)}`;
              break;
            case 'merchantVisit':
              summary = `${event.merchant.name} 降临 ${formatRealmEventLocation(event)}`;
              break;
            case 'sectWar':
              summary = `${event.attacker.name} 与 ${event.defender.name}${event.location ? ` 于 ${formatRealmEventLocation(event)}` : ''} 爆发战争`;
              break;
            case 'prodigyRise':
              summary = event.location
                ? `${event.player.name} 崛起于 ${formatRealmEventLocation(event)}`
                : `${event.player.name} 崛起于诸天`;
              break;
            case 'forbiddenZone':
              summary = `${event.zone.name}${event.location ? ` 于 ${formatRealmEventLocation(event)}` : ''} 发生异动`;
              break;
            case 'emperorLegacy':
              summary = `${event.emperor.name} 传承现世于 ${formatRealmEventLocation(event)}`;
              break;
            case 'bingziLegacy':
              summary = event.bingzi?.winner
                ? `${event.bingzi.winner.name}于 ${formatRealmEventLocation(event)} 承下完整兵字秘`
                : `秦门兵图显化于 ${formatRealmEventLocation(event)}`;
              break;
            case 'worldChange':
              summary = event.location
                ? `${event.event.title}，源点位于 ${formatRealmEventLocation(event)}`
                : `${event.event.title}`;
              break;
            case 'mysteriousRuins':
              summary = `${event.ruins.name} 被发现于 ${formatRealmEventLocation(event)}`;
              break;
            case 'tianmoHuashengLegacy':
              summary = `万相魔冢现世于 ${formatRealmEventLocation(event)}`;
              break;
            case 'coordinateClue':
              summary = `${formatRealmEventLocation(event)}显露通往${event.targetPlane}的坐标线索`;
              break;
            case 'wenxianClue':
              summary = `问仙古碑显化于 ${formatRealmEventLocation(event)}`;
              break;
            default:
              summary = '未知事件';
          }

          msg.push(`${i + 1}. [${dateStr}] ${eventType}`);
          msg.push(`   ${summary}（参与${event.participantQqs?.length || event.claimedQqs?.length || 0}人）`);
          msg.push(``);
        }
      }

      msg.push(`【事件统计】`);
      msg.push(`总事件数：${eventStats.total}`);
      if (Object.keys(eventStats.byType).length > 0) {
        for (const [type, count] of Object.entries(eventStats.byType)) {
          const typeName = RealmEvents.getEventTypeName(type);
          msg.push(`- ${typeName}：${count}次`);
        }
      }

      await e.reply(msg.join('\n'));
      return true;
    } catch (error) {
      console.error("查询大事件失败:", error);
      await e.reply(`查询大事件失败: ${error.message}`);
      return false;
    }
  }

  /** 广播消息到所有配置的群组 */
  async broadcastMessage(msg) {
    try {
      const groups = this.set.Era.notifyGroups || [];
      for (const groupId of groups) {
        // 这里需要根据您的框架实现消息发送
        await Bot.sendGroupMsg(groupId, msg);
        console.log(`[时代广播] 群 ${groupId}: ${msg}`);
      }
    } catch (e) {
      console.error("广播消息失败:", e);
    }
  }
  
  /** 向管理员广播消息 */
  async broadcastToAdmins(msg) {
    try {
      // 这里需要根据您的框架获取管理员列表
      // 示例: const admins = [管理员QQ列表];
      const admins = []; // 替换为实际管理员QQ列表
      for (const admin of admins) {
        // 示例: await Bot.sendPrivateMsg(admin, msg);
        console.log(`[管理员通知] ${admin}: ${msg}`);
      }
    } catch (e) {
      console.error("管理员通知失败:", e);
    }
  }
}

// 定义Redis键（模块级别）
const redisKeys = {
  emperorAwareness: 'Xiuxian:Emperor:Awareness'
};

// 辅助函数：记录错误
function logError(funcName, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ${funcName} 错误: ${error.message}`);
  // 可以添加更多日志逻辑，如写入文件等
}

function currentEmperorWorldYear() {
  const current = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
  return getRealmEventWorldYear(current.index, current.years, current.epoch);
}

function readEmperorPlaneState() {
  const filePath = data.filePathMap.weimianList;
  if (!fs.existsSync(filePath)) return { filePath, state: null };
  return { filePath, state: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
}

function saveEmperorPlaneState(filePath, state) {
  fs.writeFileSync(filePath, JSON.stringify(state, null, 4), 'utf8');
}

export async function processEmperorRefinement(worldYear = currentEmperorWorldYear()) {
  try {
    const { filePath, state } = readEmperorPlaneState();
    if (!state) return null;
    const result = resolveEmperorCrisis(state[EMPEROR_CRISIS_KEY], worldYear);
    if (!result.refined) return null;
    state[EMPEROR_CRISIS_KEY] = result.state;
    saveEmperorPlaneState(filePath, state);
    markPlaneDestroyed(filePath, '遮天位面', {
      source: PLANE_DESTRUCTION_SOURCES.EMPEROR_REFINEMENT,
      actor: '帝尊',
      worldYear,
    });
    await redis.del(redisKeys.emperorAwareness);
    return [
      '【帝尊炼界·遮天终局】',
      `${EMPEROR_CRISIS_GRACE_YEARS}年内无人应战，帝尊以世界鼎吞纳万道与众生道果。`,
      '遮天宇宙已被彻底炼化，位面通道与全部副本入口崩灭。',
    ].join('\n');
  } catch (e) {
    logError('processEmperorRefinement', e);
    return null;
  }
}

export async function setEmperorAwareness(worldYear = currentEmperorWorldYear()) {
  try {
    const { filePath, state } = readEmperorPlaneState();
    if (!state || state.帝尊 === 0 || state['遮天位面'] === 0) {
      return { active: false, awakened: false };
    }
    const result = awakenEmperorCrisis(state[EMPEROR_CRISIS_KEY], worldYear);
    state[EMPEROR_CRISIS_KEY] = result.state;
    if (result.awakened) saveEmperorPlaneState(filePath, state);
    const active = result.state?.status === 'active';
    if (active) await redis.set(redisKeys.emperorAwareness, 'active');
    return { active, awakened: result.awakened, deadline: result.state?.deadline };
  } catch (e) {
    logError('setEmperorAwareness', e);
    return { active: false, awakened: false };
  }
}

export async function delayEmperorRefinement(worldYear = currentEmperorWorldYear()) {
  try {
    await processEmperorRefinement(worldYear);
    const { filePath, state } = readEmperorPlaneState();
    if (!state) return { confronted: false };
    if (getEmperorChallengeMode(state[EMPEROR_CRISIS_KEY]) === 'reclaim') {
      return { confronted: true, recoveryBattle: true };
    }
    const result = confrontEmperorCrisis(state[EMPEROR_CRISIS_KEY], worldYear);
    if (!result.confronted) return result;
    state[EMPEROR_CRISIS_KEY] = result.state;
    saveEmperorPlaneState(filePath, state);
    await redis.set(redisKeys.emperorAwareness, 'active');
    return { confronted: true, deadline: result.state.deadline };
  } catch (e) {
    logError('delayEmperorRefinement', e);
    return { confronted: false };
  }
}

/** 检查帝尊是否处于迎战或炼界后夺回状态 */
export async function checkEmperorAwareness(options = {}) {
  try {
    await processEmperorRefinement(currentEmperorWorldYear());
    let { state } = readEmperorPlaneState();
    if (
      state?.帝尊 !== 0
      && state?.['遮天位面'] !== 0
      && !state?.[EMPEROR_CRISIS_KEY]
      && await redis.get(redisKeys.emperorAwareness) === 'active'
    ) {
      await setEmperorAwareness(currentEmperorWorldYear());
      ({ state } = readEmperorPlaneState());
    }
    const mode = state?.帝尊 !== 0 ? getEmperorChallengeMode(state?.[EMPEROR_CRISIS_KEY]) : null;
    const available = mode === 'reclaim' || (mode === 'confront' && state?.['遮天位面'] !== 0);
    return options.details ? { available, mode } : available;
  } catch (e) {
    logError('checkEmperorAwareness', e);
    return options.details ? { available: false, mode: null } : false;
  }
}

export async function clearEmperorAwareness() {
  try {
    await redis.del(redisKeys.emperorAwareness);
    const { filePath, state } = readEmperorPlaneState();
    if (!state) return { cleared: false, restoredPlane: false };
    const restoreZhetian = getEmperorChallengeMode(state[EMPEROR_CRISIS_KEY]) === 'reclaim'
      && getPlaneDestructionInfo(filePath, '遮天位面').source === PLANE_DESTRUCTION_SOURCES.EMPEROR_REFINEMENT;
    state.帝尊 = 0;
    state[EMPEROR_CRISIS_KEY] = defeatEmperorCrisis(
      state[EMPEROR_CRISIS_KEY],
      currentEmperorWorldYear(),
    );
    saveEmperorPlaneState(filePath, state);
    const restoredPlane = restoreZhetian && repairPlane(filePath, '遮天位面');
    return { cleared: true, restoredPlane };
  } catch (e) {
    logError('clearEmperorAwareness', e);
    return { cleared: false, restoredPlane: false };
  }
}

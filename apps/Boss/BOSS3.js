import { isXiuxianAdmin } from '../../model/xiuxian.js';
import {  plugin, verc, data, config } from '../../api/api.js';
import fs from 'fs';
import { multiplySuiyunLoot } from '../../model/suiyunLoot.js';
import {
  __PATH,
  Add_灵石,
  ForwardMsg,
  Add_HP,
  Write_player,
  Read_player,
  Harm,
  zd_battle,
  channel, Add_najie_thing ,bigNumberTransform,
  buildAt,
  Add_修为,
  Add_血气,
} from '../../model/xiuxian.js';
import {
  startWeimianDestruction,
  stopWeimianDestruction,
  handleDestructionStatusCommand,
  repairAllDestroyedPlanes,
  repairDestroyedPlaneByName,
} from './WeimianDestruction.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  markPlaneDestroyed,
  PLANE_DESTRUCTION_SOURCES,
} from '../../model/planeDestruction.js';
import {
  getYongJiStats,
} from './YongJiList.js';
import {
  getRealmAuthorityLevel,
  resetSelfDaoAfterImmortalEmperorFall,
  revokeBreakKingEmperorEligibility,
} from '../../model/realmAuthority.js';
import { enterSacrificeBubble, resolveHighlandFinale, SACRIFICE_BUBBLE_GUIDANCE } from '../../model/strangeSacrifice.js';
import { PLACE_LOCATION_PATTERN } from '../../model/weimianTravel.js';

let WorldBOSSBattleCD = []; //CD
let WorldBOSSBattleLock = 0; //BOSS战斗锁
let WorldBOSSBattleUnLockTimer = 0; //防止战斗锁因意外锁死
let bossAutoCloseTimer = null; // 全局定时器变量

export class BOSS3 extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_修仙_BOSS',
      dsc: 'BOSS模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#开启诡异大祭万界$',
          fnc: 'CreateWorldBoss',
        },
        {
          reg: '^#关闭诡异大祭万界$',
          fnc: 'DeleteWorldBoss',
        },
        {
          reg: '^#诡异始祖状态$',
          fnc: 'LookUpWorldBossStatus',
        },
        {
          reg: '^#扫平厄土高原贡献榜$',
          fnc: 'ShowDamageList',
        },
        {
          reg: '^#迎战厄土高原$',
          fnc: 'WorldBossBattle',
        },
        {
          reg: '^#位面毁灭状态$',
          fnc: 'ShowWeimianDestructionStatus',
        },
        {
          reg: '^#恢复诸天位面$',
          fnc: 'RestoreAllPlanes',
        },
        {
          reg: `^#恢复(?:${PLACE_LOCATION_PATTERN})$`,
          fnc: 'RestoreNamedPlane',
        },
        {
          reg: '^#永寂名单$',
          fnc: 'ShowYongJiList',
        },
        // 映照功能已统一迁移至 zhengdaotixi.js，由 #映照 统一入口接管
        // 包括：#映照[名号]（复活）、#映照[位面名]（修复位面）、#映照诸天
      ],
    });
    this.set = config.getConfig('task', 'task');
    this.task = []; // 无定时任务，防止loader报undefined.cron
  }
  
  //黑暗动乱开启指令
  async CreateWorldBoss(e) {
    if (!e) {
      console.log('[黑暗动乱] 定时任务触发，准备开启黑暗动乱');
      if (!await BossIsAlive()) {
        if (await InitWorldBoss(e) == 0) {
          const groupList = await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
          for (const group_id of groupList) {
            Bot.pickGroup(group_id).sendMsg("厄土高原深处，黑雾翻涌如潮！诡异始祖自万古沉眠中苏醒，那腐朽而又永恒的气息弥漫诸天万界！十道模糊身影自高原尽头浮现，每一尊都散发着令仙帝都要颤栗的祭道级不祥！他们要发动诡异大祭，以诸天为祭品，万灵为薪柴，将整个现世化为永恒的黑暗！");
          }
        }
      }
      return true;
    }
    if (isXiuxianAdmin(e)) {
      if (!await BossIsAlive()) {
        if (await InitWorldBoss(e) == 0)
          e.reply("厄土高原深处，黑雾骤然沸腾！诡异始祖感应到现世出现了变数，决定提前发动大祭！诸天万界即将陷入永夜，亿万生灵将成为祭品！");
        return true;
      } else {
        e.reply("诡异大祭已经开启，厄土高原的门户已然洞开！");
        return true;
      }
    }
  }
  
  //黑暗动乱结束指令
  async DeleteWorldBoss(e) {
    if (!verc({ e })) return false;
    if (isXiuxianAdmin(e)) {
      if (await BossIsAlive()) {
        const WorldBossStatusStr = await redis.get('guiyishizu');
        if (WorldBossStatusStr) {
          const WorldBossStatus = JSON.parse(WorldBossStatusStr);
          
          if (bossAutoCloseTimer) {
            clearTimeout(bossAutoCloseTimer);
            bossAutoCloseTimer = null;
          }
          
          await redis.del('guiyishizu');
          await redis.del('gaoyuan');
          await redis.del('guiyishizu_ancestors'); // 删除始祖状态
          
          // 停止位面破坏系统
          await stopWeimianDestruction();
          
          e.reply([
            `【天道归来】`,
            `如梦道祖终于出手了！`,
            `他眸光如星河永恒，一眼望穿万古，`,
            `划破了笼罩诸天的黑暗阴霾！`,
            `「诡异……终有尽时。」`,
            `他的声音回荡在时间长河之中，`,
            `将诡异始祖的存在从古史中抹去，`,
            `这一纪元的诡异大祭，就此终结！`,
            `世间万灵对这段血泪史渐渐遗忘，`,
            `但那段黑暗岁月，永远烙印在仙帝的记忆深处……`,
          ].join("\n"));
        } else {
          e.reply('诡异大祭从未降临');
        }
      } else return false;
    }
  }
  
  // 诡异始祖状态指令
  async LookUpWorldBossStatus(e) {
    if (!verc({ e })) return false;
    
    if (await BossIsAlive()) {
      let WorldBossStatusStr = await redis.get('guiyishizu');
      let WorldBossStatus = JSON.parse(WorldBossStatusStr);
      
      if (WorldBossStatusStr) {
        // 获取始祖存活状态
        let ancestorsStr = await redis.get('guiyishizu_ancestors');
        let ancestorsState = ancestorsStr ? JSON.parse(ancestorsStr) : { killed: [], alive: [0,1,2,3,4,5,6,7,8,9] };
        let aliveCount = ancestorsState.alive.length;
        
        // 获取当前纪元
        let eraConfig = config.getConfig('xiuxian', 'xiuxian');
        let currentEpoch = eraConfig.Era?.current?.epoch || 1;
        
        let statusMsg = [
          `【诡异始祖·厄土高原】`,
          `黑雾翻涌，诸天颤栗！`,
          `诡异始祖盘坐于高原之上，周身缭绕不祥气息，`,
          `祭道符文沉浮，映照诸世破灭！`,
          ``,
          `【大祭状态】`,
          `当前纪元：第${currentEpoch}纪元`,
          `大祭阶段：${aliveCount > 0 ? '正在进行中' : '终末阶段'}`,
          `存活始祖：${aliveCount}/10 尊`,
        ];
        
        // 显示存活始祖名号
        if (ancestorsState.alive.length > 0) {
          statusMsg.push(`存活始祖列表：`);
          let ancestorNames = [
            '厄土圣尊', '轮回葬主', '血祭之母', '虚无道尊', '太初邪神',
            '永夜魔祖', '万古尸皇', '苍穹之孽', '鸿蒙死劫', '羽化邪神'
          ];
          for (let idx of ancestorsState.alive) {
            statusMsg.push(`  ◆ 诡异始祖·${ancestorNames[idx]}`);
          }
        }
        
        // 大祭是否被终结
        if (WorldBossStatus.isEternallyDefeated) {
          statusMsg.push(``, `【大祭终焉】`, `诡异大祭已被彻底终结！`, `厄土高原归于沉寂，世间重归安宁！`);
        } else if (aliveCount === 0) {
          statusMsg.push(``, `【本源激荡】`, `十祖尽灭，高原本源狂暴！`, `终极始祖即将降临！`);
        } else {
          // 血量描述
          const healthPercent = (WorldBossStatus.Health / WorldBossStatus.Healthmax * 100).toFixed(1);
          statusMsg.push(``, `【高原本源】`, `黑暗本源：${healthPercent}%`);
          statusMsg.push(`（${bigNumberTransform(WorldBossStatus.Health)}/${bigNumberTransform(WorldBossStatus.Healthmax)}）`);
        }
        
        // 状态描述
        if (WorldBossStatus.isWeak) {
          statusMsg.push(``, `「高原震荡，黑血逆流！」`);
          statusMsg.push(`高原本源受损，气息衰弱`);
          statusMsg.push(`剩余虚弱纪元：${WorldBossStatus.isWeak}`);
        } else if (WorldBossStatus.isAngry) {
          statusMsg.push(``, `「诸天为祭，万灵为牲！」`);
          statusMsg.push(`高原本源暴怒，祭道符文燃烧！`);
          statusMsg.push(`剩余狂暴纪元：${WorldBossStatus.isAngry}`);
        } else {
          statusMsg.push(``, `「超越永恒，凌驾诸世！」`);
          statusMsg.push(`高原本源处于全盛，祭道无缺`);
        }
        
        await e.reply(statusMsg.join("\n"));
        return true;
      }
    } else {
      // 检查是否有玩家处于寂灭状态
      let epochConfig = config.getConfig('xiuxian', 'xiuxian');
      let currentEpoch = epochConfig.Era?.current?.epoch || 1;
      
      let timeMsg = [
        `【诸天静默】`,
        `高原沉寂，黑雾消散，`,
        `诡异始祖蛰伏于高原深处，静待大祭时刻！`,
        ``,
        `【大祭规则】`,
        `诡异大祭每8个纪元降临一次`,
        `当前纪元：第${currentEpoch}纪元`,
        `距离大祭降临：${8 - (currentEpoch % 8)}个纪元`,
        ``,
        `「高原永寂，仙帝不出。」`,
        `「待到大祭再临时，便是诸天浩劫日！」`,
      ];
      
      await e.reply(timeMsg.join("\n"));
      return true;
    }
  }
  
  // 位面毁灭状态指令
  async ShowWeimianDestructionStatus(e) {
    if (!verc({ e })) return false;
    await handleDestructionStatusCommand(e);
  }

  async RestoreAllPlanes(e) {
    if (!verc({ e }) || !isXiuxianAdmin(e)) return false;
    const result = await repairAllDestroyedPlanes();
    await e.reply(result.repairedCount
      ? `【诸天复原】已恢复${result.repairedCount}个位面：${result.repaired.join('、')}`
      : '【诸天复原】当前没有处于毁灭状态的位面');
    return true;
  }

  async RestoreNamedPlane(e) {
    if (!verc({ e }) || !isXiuxianAdmin(e)) return false;
    const planeName = String(e.msg || '').replace(/^#恢复/, '').trim();
    const repaired = await repairDestroyedPlaneByName(planeName);
    await e.reply(repaired
      ? `【位面复原】「${planeName}」已从破灭中重聚`
      : `【位面复原】「${planeName}」当前未被毁灭`);
    return true;
  }
  
  // 黑暗动乱伤害贡献榜
  async ShowDamageList(e) {
    if (await BossIsAlive()) {
      let PlayerRecord = await redis.get("gaoyuan");
      let WorldBossStatusStr = await redis.get("guiyishizu");
      let WorldBossStatus = JSON.parse(WorldBossStatusStr);
      
      if (WorldBossStatus == undefined) {
        e.reply("高原本源状态异常");
        return true;
      }
      if (PlayerRecord == 0 || PlayerRecord == "0") {
        e.reply("此刻还没有诸天至高强者挺身而出守护现世万界");
        return true;
      }
      
      let PlayerRecordJSON = JSON.parse(PlayerRecord);
      let PlayerList = await SortPlayer(PlayerRecordJSON);
      
      if (!PlayerRecordJSON?.Name || PlayerList.length === 0) {
        e.reply("诡异大祭已被彻底终结，世间重归安宁");
        return true;
      }
      
      let CurrentQQ;
      let TotalDamage = 0;
      for (let i = 0; i < (PlayerList.length <= 20 ? PlayerList.length : 20); i++)
        TotalDamage += PlayerRecordJSON.TotalDamage[PlayerList[i]];
      
      let msg = [
        "═══════ 扫平厄土高原贡献排行榜 ═══════"
      ];
      
      for (var i = 0; i < PlayerList.length; i++) {
        if (i < 20) {
          let Reward = Math.trunc((PlayerRecordJSON.TotalDamage[PlayerList[i]] / TotalDamage) * WorldBossStatus.Reward);
          Reward = Reward < 10000 ? 10000 : Reward;
          if (Reward > 1000000) Reward = 1000000;
          
          msg.push("第" + `${i + 1}` + "名:\n" + 
            `名号:${PlayerRecordJSON.Name[PlayerList[i]]}` + '\n' + 
            `总伤害:${bigNumberTransform(PlayerRecordJSON.TotalDamage[PlayerList[i]])}` + 
            `\n${WorldBossStatus.Health == 0 ? `已得到灵石` : `预计得到灵石`}:${Reward}`);
        }
        if (PlayerRecordJSON.QQ[PlayerList[i]] == e.user_id) CurrentQQ = i + 1;
      }
      
      await ForwardMsg(e, msg);
      await sleep(1000);
      if (CurrentQQ != undefined)
        e.reply(`你在扫平厄土高原贡献排行榜中排名第${CurrentQQ}，对厄土高原本源造成伤害${bigNumberTransform(PlayerRecordJSON.TotalDamage[PlayerList[CurrentQQ - 1]])}，再接再厉！`);
    } else {
      e.reply("诡异大祭尚未降临，厄土高原一片沉寂！");
    }
    return true;
  }

  async WorldBossBattle(e) {
    if (!verc({ e })) return false;
    if (e.isPrivate) return false;
    
    // ===== 新增：检查大祭是否开启 =====
    if (!(await BossIsAlive())) {
      // 检查纪元是否满足8纪元开启条件
      let eraConfig = config.getConfig('xiuxian', 'xiuxian');
      let currentEpoch = eraConfig.Era?.current?.epoch || 1;
      let epochsSinceLastDajie = await redis.get('xiuxian:epochs_since_dajie') || 0;
      epochsSinceLastDajie = parseInt(epochsSinceLastDajie);
      
      // 检查大祭是否被彻底终结
      let eternalDefeat = await redis.get('xiuxian:dajie_eternally_defeated');
      
      if (eternalDefeat === 'true') {
        await e.reply([
          `【叩关失败】`,
          `你凝视厄土高原，却发现那里空无一物！`,
          `诡异大祭已被彻底终结，高原祖地化为虚无！`,
          `诡异始祖的存在痕迹，从古今未来被彻底抹去！`,
          `「这一世的大祭，已成绝响。」`,
          `强行叩关已无意义……`,
        ].join("\n"));
        return false;
      }
      
      if ((currentEpoch - epochsSinceLastDajie) < 8) {
        let epochsLeft = 8 - (currentEpoch - epochsSinceLastDajie);
        await e.reply([
          `【高原紧闭】`,
          `厄土高原黑雾弥漫，却无门可入！`,
          `诡异始祖尚未发动大祭，高原祖地封印未开！`,
          `你强行叩关，却被高原意志感知——`,
          ``,
          `「何人胆敢叨扰我族清净？」`,
          `一股超越想象的不祥之力骤然降临！`,
          `你的帝躯被高原意志镇压，道果崩裂！`,
          ``,
          `【强行叩关·天意惩罚】`,
          `你被诡异物质侵蚀，寿元减少1000年！`,
          `修为跌落一个境界！`,
          `「说了大祭未开，尔等蝼蚁偏要找死！」`,
        ].join("\n"));
        
        // 执行惩罚
        let usr_qq = e.user_id.toString().replace("qg_", "");
        usr_qq = await channel(usr_qq);
        
        if (data.existData('player', usr_qq)) {
          let player = await data.getData('player', usr_qq);
          
          // 寿元惩罚
          player.寿元 = Math.max(1, player.寿元 - 1000);
          
          // 境界跌落
          if (player.mijinglevel_id > 1) {
            const wasImmortalEmperor = player.己道推演?.completed === true
              || String(player.自身之道境界 || '').includes('仙帝');
            player.mijinglevel_id = Math.max(1, player.mijinglevel_id - 1);
            player.level_id = Math.max(1, player.level_id - 1);
            player.Physique_id = Math.max(1, player.Physique_id - 1);
            // 境界跌落削帝路资格：需重渡破王成帝劫
            revokeBreakKingEmperorEligibility(player, 'mijing');
            if (wasImmortalEmperor) resetSelfDaoAfterImmortalEmperorFall(player);
          }
          
          await Write_player(usr_qq, player);
        }
        
        return false;
      }
      
      // 纪元满足，开启大祭
      await InitWorldBoss(e);
    }
    
    let WorldBossStatusStr = await redis.get('guiyishizu');
    let PlayerRecord = await redis.get('gaoyuan');
    let WorldBossStatus = JSON.parse(WorldBossStatusStr);
    
    WorldBossStatus.LastActivityTime = new Date().getTime();
    
    // 重置自动关闭定时器
    if (bossAutoCloseTimer) {
      clearTimeout(bossAutoCloseTimer);
      bossAutoCloseTimer = null;
    }
    bossAutoCloseTimer = setTimeout(() => {
      checkAndCloseInactiveBoss().catch(err => {
        console.error('自动关闭黑暗动乱失败:', err);
      });
    }, 24 * 60 * 60 * 1000);
    await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));

    let usr_qq = e.user_id.toString().replace("qg_", "");
    usr_qq = await channel(usr_qq);

    // ===== 检查「不念不想」虚弱状态（映照诸天后遗症）=====
    const buNianCheckKey = `xiuxian:player:${usr_qq}:bunian`;
    const buNianData = await redis.get(buNianCheckKey);
    if (buNianData) {
      const buNian = JSON.parse(buNianData);
      const buNianRemain = buNian.endTime - Date.now();
      if (buNianRemain > 0) {
        const bnHours = Math.floor(buNianRemain / 3600000);
        const bnMins = Math.floor((buNianRemain % 3600000) / 60000);
        await e.reply([
          `【不念不想·修炼受阻】`,
          ``,
          `你的帝意在映照诸天后已近乎枯竭，`,
          `灵台空明如镜，一念不生，一想不起——`,
          ``,
          `这种状态下，你无法凝神战斗……`,
          ``,
          `「不念不想，方是帝意映照诸天后的真实代价。」`,
          ``,
          `剩余虚弱时间：${bnHours}小时${bnMins}分钟`,
        ].join('\n'));
        return true;
      } else {
        await redis.del(buNianCheckKey);
      }
    }

    // ===== 检查寂灭状态（圣墟设定）=====
    let oblivionKey = `xiuxian:player:${usr_qq}:oblivion`;
    let oblivionData = await redis.get(oblivionKey);
    if (oblivionData) {
      let oblivion = JSON.parse(oblivionData);
      let now = Date.now();
      const sacrificedPlayer = await data.getData('player', usr_qq);
      if (getRealmAuthorityLevel(sacrificedPlayer) === 22 && (oblivion.isByUltimate || oblivion.eternalEndTime)) {
        enterSacrificeBubble(sacrificedPlayer, now);
        await Write_player(usr_qq, sacrificedPlayer);
        await redis.del(oblivionKey);
        await e.reply(`【始祖彻底永祭·空间泡影】\n${SACRIFICE_BUBBLE_GUIDANCE}\n720分钟计时已写入存档。`);
        return true;
      }
      
      if (now < oblivion.endTime) {
        let remainMinutes = Math.ceil((oblivion.endTime - now) / 60000);
        let remainSeconds = Math.ceil((oblivion.endTime - now) / 1000) % 60;
        
        // 获取玩家境界判断寂灭类型
        let checkPlayer = await data.getData('player', usr_qq);
        let isXiuDao = checkPlayer && checkPlayer.mijinglevel_id >= 22;
        let isAboveXiuDao = checkPlayer && checkPlayer.mijinglevel_id >= 23;
        let remainingAttempts = 3 - (oblivion.failCount || 0);
        let isByUltimate = oblivion.isByUltimate || false;
        
        if (isXiuDao) {
          // 祭道境寂灭：念想消磨
          await e.reply([
            `【祭道寂灭·念想消磨】`,
            `你的元神在高原祖地中飘荡……`,
            `诡异始祖正在磨灭世间对你的念想！`,
            `每一缕思念你的神识都在被吞噬，`,
            `你的名字正在从众生的记忆中抹去……`,
            ``,
            isByUltimate ? (
              `【终极始祖之厄】`,
              `你被终极始祖亲自出手抹杀！`,
              `那道超越祭道的力量，正在湮灭你的一切痕迹……`
            ) : (
              `「始祖之厄」正在侵蚀你的道果根基！`
            ),
            `剩余寂灭时间：${remainMinutes}分${remainSeconds}秒`,
            `剩余复活机会：${remainingAttempts}次`,
            ``,
            `「念想不灭，道果不亡……」`,
            `「若世间再无一人记得你——」`,
            `「你将彻底永寂于岁月长河之中。」`,
          ].join("\n"));
        } else {
          // 仙帝境寂灭：念想复苏
          await e.reply([
            `【仙帝寂灭·念想复苏】`,
            `你的元神在高原祖地中飘荡……`,
            `诡异始祖想要彻底磨灭你的存在！`,
            `但只要你还在世人心中——`,
            `你便终有一日会复苏归来！`,
            ``,
            `「念念不忘，必有回响！」`,
            `诸天万界，有念你之人吗？`,
            `有人在呼唤你的名字吗？`,
            ``,
            `寂灭倒计时：${remainMinutes}分${remainSeconds}秒`,
            `当念想汇聚之时，便是你归来之日！`,
          ].join("\n"));
        }
        return false;
      } else {
        // 寂灭结束，检查是否被彻底永寂
        if (oblivion.eternalEndTime && now >= oblivion.eternalEndTime) {
          // 检查是否是祭道之上境界（23级），只有祭道之上才能解除永寂
          let checkPlayer = await data.getData('player', usr_qq);
          let isAboveXiuDao = checkPlayer && checkPlayer.mijinglevel_id >= 23;
          
          if (isAboveXiuDao) {
            // 祭道之上可以解除永寂
            await redis.del(oblivionKey);
            await e.reply([
              `【永寂解除】`,
              `你以祭道之上的无上修为，`,
              `强行从永寂中挣脱！`,
              `那被始祖抹去的一切痕迹，在你手中重聚！`,
              `「纵然永寂万古——」`,
              `「亦挡不住我超脱之心！」`,
            ].join("\n"));
          } else {
            // 普通玩家被永寂
            await e.reply([
              `【彻底永寂】`,
              `你的一缕残念在高原黑雾中消散……`,
              `世间再无一人记得你的名号，`,
              `你的痕迹被彻底抹去，`,
              `从古史中消失得无影无踪……`,
              ``,
              `「世间再无此人。」`,
              `「这便是与诡异始祖为敌的代价。」`,
              `「唯有超越祭道，方能挣脱永寂枷锁……」`,
            ].join("\n"));
            
            // 玩家彻底永寂，删除玩家数据（data.delData 不存在，改用 fs）
            const playerFile = data.filePathMap.player + '/' + usr_qq + '.json';
            try { if (fs.existsSync(playerFile)) fs.unlinkSync(playerFile); } catch (e) {}
            // 清理 Redis 状态键
            const keysToClean = [
              `xiuxian:player:${usr_qq}:action`,
              `xiuxian:player:${usr_qq}BOSSCD`,
              oblivionKey,
              `xiuxian:player:${usr_qq}:worldbosscd`,
              `xiuxian:player:${usr_qq}:shenyou`,
              `xiuxian:player:${usr_qq}:game_action`,
            ];
            for (const k of keysToClean) { try { await redis.del(k); } catch (e) {} }
            return false;
          }
        }
        
        // 寂灭结束，清除状态
        await redis.del(oblivionKey);
        let checkPlayer = await data.getData('player', usr_qq);
        let isXiuDao = checkPlayer && checkPlayer.mijinglevel_id >= 22;
        let isByUltimate = oblivion.isByUltimate || false;
        
        if (isXiuDao) {
          await e.reply([
            `【祭道归来】`,
            `历经漫漫寂灭岁月，念想之力终于汇聚！`,
            `虽然始祖磨灭了世间大部分对你的记忆，`,
            `但仍有一缕执念，穿越了厄土高原的黑雾！`,
            `你的道果从虚无中重新凝聚……`,
            ``,
            `「我……回来了。」`,
            `「这一次，我要终结一切！」`,
          ].join("\n"));
        } else {
          await e.reply([
            `【仙帝复苏】`,
            `历经漫漫寂灭岁月，念想之力终于汇聚！`,
            `诸天万界，无数生灵在梦中呼唤你的名字！`,
            `他们的思念穿越了厄土高原的黑雾！`,
            `你的真身从虚无中重新凝聚归来！`,
            ``,
            `「念念不忘，必有回响！」`,
            `「我，终将踏平厄土高原！」`,
          ].join("\n"));
        }
      }
    }
    
    let Time = 5;
    let now_Time = new Date().getTime();
    Time = parseInt(60000 * Time);
    let last_time = await redis.get('xiuxian:player:' + usr_qq + 'BOSSCD');
    last_time = parseInt(last_time);
    if (now_Time < last_time + Time) {
      let Couple_m = Math.trunc((last_time + Time - now_Time) / 60 / 1000);
      let Couple_s = Math.trunc(((last_time + Time - now_Time) % 60000) / 1000);
      await e.reply('正在CD中，' + `剩余cd:  ${Couple_m}分 ${Couple_s}秒`);
      return false;
    }
    
    await data.existData("player", e.user_id);
    let CurrentPlayerAttributes = await data.getData("player", e.user_id);
    
    if (data.existData('player', usr_qq)) {
      let player = await data.getData('player', usr_qq);
      
      if (player.mijinglevel_id < 21) {
        await e.reply('你尚未达到路尽级仙帝境界，无法踏入厄土高原！那里的每一缕黑雾都足以让仙王灰飞烟灭！');
        return false;
      }
      
      let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
      action = JSON.parse(action);
      if (action != null) {
        let action_end_time = action.end_time;
        let now_time = new Date().getTime();
        if (now_time <= action_end_time) {
          let m = parseInt((action_end_time - now_time) / 1000 / 60);
          let s = parseInt((action_end_time - now_time - m * 60 * 1000) / 1000);
          await e.reply('正在' + action.action + '中,剩余时间:' + m + '分' + s + '秒');
          return false;
        }
      }
      
      if (player.当前血量 <= player.血量上限 * 0.1) {
        await e.reply('你的帝躯已残破不堪，血气近乎干涸！先疗伤恢复，否则踏足高原只会是送死！');
        return false;
      }
      
      if (WorldBOSSBattleCD[usr_qq]) {
        let Seconds = Math.trunc((300000 - (new Date().getTime() - WorldBOSSBattleCD[usr_qq])) / 1000);
        if (Seconds <= 300 && Seconds >= 0) {
          await e.reply(`你刚刚从高原战场上败退，法力尚未恢复完全~(剩余${Seconds}秒)`);
          return false;
        }
      }
      
      // 检查大祭是否被彻底终结
      if (WorldBossStatus.isEternallyDefeated) {
        await e.reply([
          `【大祭终焉】`,
          `诡异大祭已被彻底终结！`,
          `十祖永寂，高原虚无，`,
          `这片厄土已从古今未来彻底消失！`,
        ].join("\n"));
        return false;
      }
      
      let PlayerRecordJSON, Userid;
      if (PlayerRecord == 0 || PlayerRecord == "0") {
        let QQGroup = [usr_qq];
        let DamageGroup = [0];
        let Name = [player.名号];
        PlayerRecordJSON = { QQ: QQGroup, TotalDamage: DamageGroup, Name: Name };
        Userid = 0;
      } else {
        PlayerRecordJSON = JSON.parse(PlayerRecord);
        let i;
        for (i = 0; i < PlayerRecordJSON.QQ.length; i++) {
          if (PlayerRecordJSON.QQ[i] == usr_qq) {
            Userid = i;
            break;
          }
        }
        if (Userid === undefined) {
          PlayerRecordJSON.QQ.push(usr_qq);
          PlayerRecordJSON.Name.push(player.名号);
          PlayerRecordJSON.TotalDamage.push(0);
          Userid = PlayerRecordJSON.QQ.length - 1;
        }
      }
      
      let TotalDamage = 0;

      // 获取始祖存活状态
      const plateauPlayerSnapshot = structuredClone(player);
      let ancestorsStr = await redis.get('guiyishizu_ancestors');
      let ancestorsState = ancestorsStr ? JSON.parse(ancestorsStr) : { killed: [], alive: [0,1,2,3,4,5,6,7,8,9] };
      
      // 十大始祖详细设定（圣墟设定）
      let ancestorConfigs = [
        { 名号: '诡异始祖·厄土圣尊', 灵根: { type: '祭道', name: '终焉神魔体', 法球倍率: 1.5, 攻击: 10, 防御: 10, 生命: 10 }, 功法: ['祭道归墟经', '高原不灭体', '九重魔功', '诡异物质洪流'], 描述: '十大始祖之首，背负世外高原，执掌诸天祭礼。' },
        { 名号: '诡异始祖·轮回葬主', 灵根: { type: '祭道', name: '葬天葬地体', 法球倍率: 1.4, 攻击: 9, 防御: 12, 生命: 15 }, 功法: ['葬天术', '葬士经', '九重魔功', '诡异物质洪流'], 描述: '葬士之祖，执掌六道轮回外的诡异葬土。' },
        { 名号: '诡异始祖·血祭之母', 灵根: { type: '祭道', name: '大成·荒古圣体', 法球倍率: 1.3, 攻击: 12, 防御: 8, 生命: 12 }, 功法: ['血神经', '血海无边', '九重魔功', '诡异物质洪流'], 描述: '血海源头，以诸天万界生灵血祭高原。' },
        { 名号: '诡异始祖·虚无道尊', 灵根: { type: '祭道', name: '大成·苍天圣体', 法球倍率: 1.5, 攻击: 11, 防御: 9, 生命: 9 }, 功法: ['幽冥指', '黄泉路', '九重魔功', '诡异物质洪流'], 描述: '身化虚无，驾驭诡异黑血。' },
        { 名号: '诡异始祖·太初邪神', 灵根: { type: '祭道', name: '混沌体', 法球倍率: 1.4, 攻击: 13, 防御: 10, 生命: 10 }, 功法: ['他化自在法', '尸骸帝经', '九重魔功', '诡异物质洪流'], 描述: '自混沌中苏醒的古老存在。' },
        { 名号: '诡异始祖·永夜魔祖', 灵根: { type: '祭道', name: '灭世九幽体', 法球倍率: 1.3, 攻击: 14, 防御: 8, 生命: 11 }, 功法: ['灭世九击', '九幽獓祖术', '九重魔功', '诡异物质洪流'], 描述: '吞噬大千宇宙之光，带来永恒黑夜。' },
        { 名号: '诡异始祖·万古尸皇', 灵根: { type: '祭道', name: '先天混沌圣体道胎', 法球倍率: 1.5, 攻击: 15, 防御: 15, 生命: 15 }, 功法: ['原始真解', '尸骸帝经', '九重魔功', '诡异物质洪流'], 描述: '最早沾染高原骨灰的强者之一。' },
        { 名号: '诡异始祖·苍穹之孽', 灵根: { type: '祭道', name: '先天圣体道胎', 法球倍率: 1.4, 攻击: 12, 防御: 11, 生命: 10 }, 功法: ['苍帝拳', '灭世九击', '九重魔功', '诡异物质洪流'], 描述: '霸占苍天青空，以万灵为刍狗。' },
        { 名号: '诡异始祖·鸿蒙死劫', 灵根: { type: '祭道', name: '终极涅槃·至尊', 法球倍率: 1.3, 攻击: 10, 防御: 10, 生命: 10 }, 功法: ['鸿蒙掌', '命运之轮', '九重魔功', '诡异物质洪流'], 描述: '执掌诡异命运，拨弄众生因果。' },
        { 名号: '诡异始祖·羽化邪神', 灵根: { type: '祭道', name: '羽化飞仙体', 法球倍率: 1.5, 攻击: 16, 防御: 7, 生命: 9 }, 功法: ['羽化飞仙术', '弑帝战矛', '九重魔功', '诡异物质洪流'], 描述: '手持诡异版弑帝战矛，仙帝沾之即死。' }
      ];
      
      let ancestorShortNames = ['厄土圣尊', '轮回葬主', '血祭之母', '虚无道尊', '太初邪神', '永夜魔祖', '万古尸皇', '苍穹之孽', '鸿蒙死劫', '羽化邪神'];
      
      // 根据存活状态生成BOSS列表
      let BossList = [];
      let bossNameList = [];
      
      for (let i of ancestorsState.alive) {
        let cfg = ancestorConfigs[i];
        let multiplier = 0.5 + (i * 0.12);
        let fbl = cfg.灵根.法球倍率;
        
        BossList.push({
          名号: cfg.名号,
          攻击: Math.trunc(player.攻击 * multiplier * (0.9 + 0.3 * Math.random()) * (1 + cfg.灵根.攻击)),
          防御: Math.trunc(player.防御 * multiplier * (0.9 + 0.3 * Math.random()) * (1 + cfg.灵根.防御)),
          当前血量: Math.trunc(player.血量上限 * multiplier * 2.5 * (1 + cfg.灵根.生命)),
          血量上限: Math.trunc(player.血量上限 * multiplier * 2.5 * (1 + cfg.灵根.生命)),
          暴击率: Math.min(player.暴击率 + i * 0.015, 0.95),
          灵根: { type: cfg.灵根.type, name: cfg.灵根.name, 法球倍率: fbl },
          速度: 120 + i * 15,
          mijinglevel_id: 21 + Math.floor(i / 3),
          法球倍率: fbl,
          魔道值: 9999,
          id: `boss_${i}`,
          学习的功法: cfg.功法
        });
        bossNameList.push(ancestorShortNames[i]);
      }

      player.法球倍率 = player.灵根.法球倍率;
      player.当前血量 = player.血量上限;

      if (WorldBOSSBattleUnLockTimer) clearTimeout(WorldBOSSBattleUnLockTimer);
      SetWorldBOSSBattleUnLockTimer(e);
      
      if (WorldBOSSBattleLock != 0) {
        await e.reply('厄土高原上有至高存在正在与始祖激战，此刻踏入恐有凶险，稍后再试！');
        return false;
      }
      WorldBOSSBattleLock = 1;
      
      // 获取当前存活的始祖数量
      let aliveCount = ancestorsState.alive.length;
      
      // 开战宣言
      await e.reply([
        `诡异大祭·厄土高原`,
        `黑雾翻涌，高原震荡！`,
        `你踏入厄土高原，黑色的雾霭扑面而来，`,
        `夹杂着亿万被祭掉生灵的呢喃与哀嚎！`,
        ``,
        aliveCount === 10 ? (
          `十道模糊身影自高原尽头浮现，`
        ) : (
          `${aliveCount}道身影从高原深处踏步而出，`
        ),
        `每一尊都散发着令诸天颤栗的祭道级气息！`,
        `「祭掉诸天，葬下万界！」`,
        `十大始祖（现存${aliveCount}尊）齐声低语，声音贯穿古今未来！`,
        `「尔等蝼蚁，也敢阻挡我族大祭？」`,
        ``,
        `你独自一人，面对${aliveCount}尊诡异始祖的围杀！`
      ].join('\n'));
      
      await sleep(2000);

      // 战斗
      const A_player1 = { ...player };
      const B_team1 = BossList.map(item => ({ ...item }));
      const blackEmperorFormation1 = consumeBlackEmperorBattleFormation(player, A_player1, B_team1);
      if (blackEmperorFormation1.consumed) await Write_player(usr_qq, player);
      let Data_battle1 = await zd_battle(A_player1, B_team1);
      let allMsg = [...Data_battle1.msg];
      if (blackEmperorFormation1.message) allMsg.unshift(blackEmperorFormation1.message);
      await sendBattleMsg(e, allMsg);
      await sleep(1500);

      // 恢复玩家状态（兼容zd_battle两种返回签名）
      if (Data_battle1.A_team && Data_battle1.A_team.length > 0) {
        player.当前血量 = Data_battle1.A_team[0].当前血量;
      } else {
        logger.warn(`[WorldBossBattle] A_team缺失，使用A_hp兜底: ${JSON.stringify(Data_battle1.A_hp)}`);
        player.当前血量 = typeof Data_battle1.A_hp === 'number' ? Data_battle1.A_hp : player.当前血量;
      }

      // 统计始祖存活情况（使用战斗返回的B_team数据，而非原始BossList）
      let battleBTeam = Data_battle1.B_team || [];
      let stillAliveAncestors = [];
      let deadAncestorsThisRound = [];
      
      for (let i = 0; i < battleBTeam.length; i++) {
        if (battleBTeam[i].当前血量 > 0) {
          stillAliveAncestors.push(battleBTeam[i]);
        } else {
          // 从battleBTeam获取名号，如果名号包含"复苏"则去掉
          let name = battleBTeam[i].名号 || bossNameList[i];
          deadAncestorsThisRound.push(name.replace('（复苏）', ''));
        }
      }
      
      let playerAlive = Data_battle1.A_hp > 0;
      let allBossesDead = stillAliveAncestors.length === 0;
      
      // 获取复活计数
      let reviveCount = WorldBossStatus.reviveCount || 0;
      
      // 记录本次击杀的始祖到状态
      for (let name of deadAncestorsThisRound) {
        if (!ancestorsState.killed.includes(ancestorShortNames.indexOf(name))) {
          ancestorsState.killed.push(ancestorShortNames.indexOf(name));
        }
        // 从alive中移除
        let idx = ancestorsState.alive.indexOf(ancestorShortNames.indexOf(name));
        if (idx > -1) ancestorsState.alive.splice(idx, 1);
      }
      await redis.set('guiyishizu_ancestors', JSON.stringify(ancestorsState));
      
      // ===== 第一次战败：真身寂灭 =====
      if (!playerAlive && aliveCount === 10) {
        // 玩家第一次战败，且十个始祖都在
        let killedCount = deadAncestorsThisRound.length;
        
        // 获取当前失败次数
        let oblivionInfo = await redis.get(oblivionKey);
        let failCount = 0;
        if (oblivionInfo) {
          let oldOblivion = JSON.parse(oblivionInfo);
          failCount = (oldOblivion.failCount || 0) + 1;
        } else {
          failCount = 1;
        }
        
        // 根据境界计算寂灭时间
        // 仙帝(21)：10分钟，每次+5分钟
        // 祭道(22)：15分钟起，每次+10分钟
        let isXiuDao = player.mijinglevel_id >= 22;
        let baseTime = isXiuDao ? 15 : 10;
        let incrementTime = isXiuDao ? 10 : 5;
        let oblivionDuration = baseTime + (failCount - 1) * incrementTime;
        let oblivionEndTime = Date.now() + oblivionDuration * 60 * 1000;
        
        // 祭道境第三次失败彻底永寂
        let eternalEndTime = null;
        if (isXiuDao && failCount >= 3) {
          // 祭道境：第三次失败彻底永寂，需要60分钟才能彻底消散
          eternalEndTime = oblivionEndTime + 999999 * 60 * 1000; // 永寂999999分钟
        }
        
        await redis.set(oblivionKey, JSON.stringify({
          startTime: Date.now(),
          endTime: oblivionEndTime,
          eternalEndTime: eternalEndTime,
          failCount: failCount,
          killedAncestors: deadAncestorsThisRound,
          isXiuDao: isXiuDao
        }));
        
        let remainingAttempts = 3 - failCount;
        
        if (isXiuDao) {
          // 祭道境寂灭文案
          if (failCount === 1) {
            await e.reply([
              `【祭道之厄·厄土高原】`,
              `你被始祖围攻，帝躯崩裂！`,
              `祭道级的不祥之力侵入你的道果，`,
              `始祖们在磨灭世间对你的念想！`,
              ``,
              `「有点意思……」`,
              `一尊始祖低头凝视着你的残躯，`,
              `「竟是祭道境的存在，蝼蚁之力，却也可畏。」`,
              `「我倒要看看，磨灭三次之后——」`,
              `「世间是否还记得你的名号！」`,
              ``,
              `你的元神在高原黑雾中飘荡……`,
              `寂灭时间：${oblivionDuration}分钟`,
              `剩余复活机会：${remainingAttempts}次`,
              ``,
              `【警告】若被击杀3次，将彻底永寂！`,
              `念想尽灭，道果消亡！`,
            ].join('\n'));
          } else if (failCount === 2) {
            await e.reply([
              `【祭道之厄·念想消磨】`,
              `你再次被始祖击溃！`,
              `诡异始祖加大了磨灭念想的力度……`,
              `世间记得你名字的人越来越少，`,
              `你的存在正在被逐渐抹去！`,
              ``,
              `「还能复活？」`,
              `始祖的声音中带着一丝诧异，`,
              `「有趣……那便再磨灭你一次！」`,
              `「当世间再无一人记得你——」`,
              `「你便彻底消亡于古今未来！」`,
              ``,
              `你的元神在厄土高原中飘荡……`,
              `寂灭时间：${oblivionDuration}分钟`,
              `剩余复活机会：${remainingAttempts}次`,
              ``,
              `【最后警告】这是你最后一次复活机会！`,
              `「念念不忘，必有回响——」`,
              `「但若世间再无念想——」`,
              `「你将永坠虚无！」`,
            ].join('\n'));
          }
        } else {
          // 仙帝境寂灭文案
          await e.reply([
            `【厄土高原·寂灭之殇】`,
            `你被始祖围攻，帝躯崩裂！`,
            `鲜血染红了高原的黑土，`,
            `你的真身被高原意志击溃，`,
            `元神陷入长达${oblivionDuration}分钟的寂灭！`,
            ``,
            `然而——你并非毫无斩获！`,
            `在这场生死搏杀中，你成功击杀了：`,
            ``,
            ...deadAncestorsThisRound.map((name, i) => `◆ 诡异始祖·${name}`),
            ``,
            `共计 ${killedCount} 尊诡异始祖！`,
            `他们的尸骸化为诡异物质，融入高原黑雾……`,
            ``,
            `「有意思……」`,
            `一尊始祖低头凝视着你的残躯，`,
            `「蝼蚁之力，竟能杀我同伴？」`,
            `始祖们对你的念想进行了一次消磨，`,
            `但只要世间还有人记得你——`,
            `你便终将归来！`,
            ``,
            `寂灭时间：${oblivionDuration}分钟`,
            `「念念不忘，必有回响！」`,
            `「只要诸天还有一人念你之名——」`,
            `「你便会从虚无中复苏！」`,
          ].join('\n'));
        }
        
        // 计算伤害
        TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.04 * killedCount);
        WorldBossStatus.Health -= TotalDamage;
        
        // 玩家血量归零
        player.当前血量 = 0;
        await Write_player(usr_qq, player);
        
        // 特殊剧情触发
        let random = Math.random();
        if (random < 0.3) {
          let damage = Math.trunc(WorldBossStatus.Healthmax * 0.35);
          TotalDamage += damage;
          WorldBossStatus.Health -= damage;
          
          await e.reply([
          "【大长老的呼唤】",
          "诸世成墟，万界崩碎！",
          "大长老孟天正立于破碎的界骸之上，满身是血，",
          "帝躯残破，眼中带着无尽的悲凉：",
          "「侵我故土，杀我子弟，搅起血与火还有乱！」",
          "「诡异灭之不尽吗？我们虽然还活着，",
          "可到了这一世来，依旧没有解决大患」",
          "他以帝血为引，在虚空中镌刻染血经篇，",
          "经文燃烧，化作不灭仙光，贯穿时空长河：",
          "「孩子，你在哪里？荒，你听到了吗？」",
          "「我在呼唤你的名，你为什么还不归来？！」",
          "整片世间都寂静了瞬间！",
          "九道一也仰天悲吼：",
          "「荒天帝，你回来啊！」",
          "孟祖师声音低沉，带着无尽悲怆：",
          "「孩子，荒，你在哪里，听到我的呼唤了吗？」",
          "「在，我一直都在！」",
          "一道声音自万古前传来，震彻诸天万界！",
          "诸世外最黑暗的区域骤然灿烂，",
          "光芒穿透永恒黑暗，映照得诸天近乎透明！",
          "时空长河沸腾，一道身影踏着岁月而来，",
          "「谁在称无敌？哪个敢言不败？」",
          "「他化自在，他化万古！」",
          "荒天帝暴喝一声，施展他化自在法，登时间古今未来都断裂了，到处都是荒天帝的身影",
          "手持荒剑，剑光映照诸世生灭，",
          "一剑斩出，煌煌剑光贯穿古今未来，让过去现在未来的修士都看到了这至高一剑",
          "剑光所过之处，黑暗物质如冰雪消融！",
          `对【高原本源】造成${bigNumberTransform(damage)}点道伤！`,
          ].join('\n'));
        } else if (random > 0.6 && random < 0.8) {
          let damage = Math.trunc(WorldBossStatus.Healthmax * 0.25);
          TotalDamage += damage;
          WorldBossStatus.Health -= damage;
          
          await e.reply([
            `【叶天帝显化】`,
            `诸天之外，一道拳光横贯星海！`,
            `「我为天帝，当镇杀世间一切敌！」`,
            `叶天帝跨界而来，拳意滔天，`,
            `一拳轰向诡异始祖群！`,
            `对【高原本源】造成${bigNumberTransform(damage)}点伤害！`,
          ].join('\n'));
        }
        
        // 保存状态并返回
        PlayerRecordJSON.TotalDamage[Userid] += TotalDamage;
        await redis.set('gaoyuan', JSON.stringify(PlayerRecordJSON));
        await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));
        WorldBOSSBattleLock = 0;
        return true;
      }
      
      // ===== 后续战斗 =====
      
      // 如果所有始祖都死了
      if (allBossesDead && playerAlive) {
        // 如果是第一次击杀十祖，触发复活机制
        if (reviveCount === 0) {
          // 更新复活计数
          WorldBossStatus.reviveCount = 1;
          await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));
          
          await e.reply([
            `【厄土高原 · 祖地复苏】`,
            `你站在尸山血海中，帝血染红了黑土。`,
            `十尊始祖，尽数崩灭。`,
            `你觉得，结束了。`,
            ``,
            `可是……`,
            `脚下的高原，突然传来了脚步声。`,
            `一步一步，沉重、缓慢、却又无可阻挡。`,
            `像是踩在所有生灵的心头。`,
            ``,
            `黑雾翻涌，祖地裂开。`,
            `十道熟悉却又陌生的身影，`,
            `再次从高原深处——迈步而出。`,
            ``,
            `「无用的。」`,
            `为首的那尊始祖开口了，`,
            `声音平静，却比咆哮更令人绝望：`,
            `「你的确逆天。」`,
            `「拼死搏杀，将我等杀至陨灭……」`,
            `「可又能如何？」`,
            ``,
            `「我族，万古长青。」`,
            `「哪怕你杀我十次、百次、千次——」`,
            `「最后，我们还是会，从祖地里走出来。」`,
            ``,
            `「这就是我族的底蕴。」`,
            `「所以，恒驻世间，无种族可敌！」`,
          ].join("\n"));
          
          await sleep(4000);
          
          // 复活十祖 - 恢复血量并提升难度
          let revivedBossList = [];
          for (let i = 0; i < BossList.length; i++) {
            let cfg = ancestorConfigs[i];
            let multiplier = 0.6 + (i * 0.15);
            let fbl = cfg.灵根.法球倍率;
            
            revivedBossList.push({
              名号: cfg.名号 + '（复苏）',
              攻击: Math.trunc(player.攻击 * multiplier * 1.3 * (0.9 + 0.3 * Math.random()) * (1 + cfg.灵根.攻击)),
              防御: Math.trunc(player.防御 * multiplier * 1.2 * (0.9 + 0.3 * Math.random()) * (1 + cfg.灵根.防御)),
              当前血量: Math.trunc(player.血量上限 * multiplier * 3 * (1 + cfg.灵根.生命)),
              血量上限: Math.trunc(player.血量上限 * multiplier * 3 * (1 + cfg.灵根.生命)),
              暴击率: Math.min(player.暴击率 + i * 0.02, 0.95),
              灵根: { type: cfg.灵根.type, name: cfg.灵根.name, 法球倍率: fbl },
              速度: 150 + i * 20,
              mijinglevel_id: 21 + Math.floor(i / 3),
              法球倍率: fbl,
              魔道值: 9999,
              id: `boss_${i}_revived`,
              学习的功法: cfg.功法
            });
          }
          
          // 恢复玩家状态继续战斗
          player.当前血量 = Data_battle1.A_team[0].当前血量;
          player.法球倍率 = player.灵根.法球倍率;
          
          await e.reply([
            `【诡异大祭·第二轮决战】`,
            `十尊复苏始祖傲立高原，`,
            `他们的气息比之前更加恐怖！`,
            `黑雾中浮现祭道符文，诡异物质沸腾！`,
            ``,
            `「既然你想终结我族——」`,
            `「那就让你见识真正的绝望！」`,
            ``,
            `你再次踏入战场，独自面对十尊复苏始祖！`
          ].join('\n'));
          
          await sleep(2000);
          
          // 第二轮战斗
          const A_player2 = { ...player };
          const B_team2 = revivedBossList.map(item => ({ ...item }));
          const blackEmperorFormation2 = consumeBlackEmperorBattleFormation(player, A_player2, B_team2);
          if (blackEmperorFormation2.consumed) await Write_player(usr_qq, player);
          let Data_battle1_again = await zd_battle(A_player2, B_team2);
          if (blackEmperorFormation2.message && Array.isArray(Data_battle1_again.msg)) Data_battle1_again.msg.unshift(blackEmperorFormation2.message);
          await sendBattleMsg(e, Data_battle1_again.msg);
          await sleep(1500);
          
          // 恢复玩家状态（兼容zd_battle两种返回签名）
          if (Data_battle1_again.A_team && Data_battle1_again.A_team.length > 0) {
            player.当前血量 = Data_battle1_again.A_team[0].当前血量;
          } else {
            logger.warn(`[WorldBossBattle] again A_team缺失，使用A_hp兜底`);
            player.当前血量 = typeof Data_battle1_again.A_hp === 'number' ? Data_battle1_again.A_hp : player.当前血量;
          }
          
          // 更新存活情况（使用战斗返回的B_team数据，而非原始revivedBossList）
          let battleRevivedBTeam = Data_battle1_again.B_team || [];
          let stillAliveRevived = battleRevivedBTeam.filter(a => a.当前血量 > 0);
          let revivedDeadAncestors = battleRevivedBTeam.filter(a => a.当前血量 <= 0).map(b => b.名号.replace('（复苏）', ''));
          let playerAlive2 = Data_battle1_again.A_hp > 0;
          let allRevivedDead = stillAliveRevived.length === 0;
          
          // 如果再次全灭，进入终极始祖阶段
          if (allRevivedDead && playerAlive2) {
            WorldBossStatus.reviveCount = 2;
            await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));
            
            await e.reply([
              `【祭道合体 · 终极始祖】`,
              `「高原不灭，始祖不死！」`,
              `十尊始祖残躯坠入祖地，`,
              `黑血沸腾，祭道符文燃烧！`,
              `他们终于承认——`,
              `仅靠复活，仍不足以终结你。`,
              ``,
              `「吾等即高原，高原即吾等！」`,
              `十道魂光归一，`,
              `一尊超越祭道的身影，缓缓走出。`,
              ``,
              `「吾名——终极始祖。」`,
              `「自今日起，祭掉此世，湮灭永恒！」`
            ].join("\n"));
            
            await sleep(2000);
            
            // 生成终极始祖
            let fusionAtk = revivedBossList.reduce((sum, a) => sum + a.攻击, 0) * 1.5;
            let fusionDef = revivedBossList.reduce((sum, a) => sum + a.防御, 0) * 1.2;
            let fusionHp = revivedBossList.reduce((sum, a) => sum + a.血量上限, 0) * 2;
            
            let ultimateBoss = {
              名号: '终极始祖·超越祭道',
              攻击: Math.trunc(fusionAtk),
              防御: Math.trunc(fusionDef),
              当前血量: Math.trunc(fusionHp),
              血量上限: Math.trunc(fusionHp),
              暴击率: 0.95,
              灵根: { type: '终极', name: '高原本源体', 法球倍率: 3 },
              速度: 500,
              mijinglevel_id: 24,
              法球倍率: 2,
              魔道值: 99999,
              id: 'ultimate_boss',
              学习的功法: ['高原永存', '祭道终结', '诡异本源']
            };
            
            
            await sleep(2000);
            
            // 终极战斗
            const A_player3 = { ...player };
            const B_player3 = { ...ultimateBoss };
            const blackEmperorFormation3 = consumeBlackEmperorBattleFormation(player, A_player3, B_player3);
            if (blackEmperorFormation3.consumed) await Write_player(usr_qq, player);
            let Data_battle2 = await zd_battle(A_player3, [B_player3]);
            if (blackEmperorFormation3.message && Array.isArray(Data_battle2.msg)) Data_battle2.msg.unshift(blackEmperorFormation3.message);
            await sendBattleMsg(e, Data_battle2.msg);
            await sleep(1500);
            
            // 恢复玩家状态（兼容zd_battle两种返回签名）
            if (Data_battle2.A_team && Data_battle2.A_team.length > 0) {
              player.当前血量 = Data_battle2.A_team[0].当前血量;
            } else {
              logger.warn(`[WorldBossBattle] battle2 A_team缺失，使用A_hp兜底`);
              player.当前血量 = typeof Data_battle2.A_hp === 'number' ? Data_battle2.A_hp : player.当前血量;
            }
            
            if (Data_battle2.A_hp > 0) {
              if (await this.rewindHighland(e, player, WorldBossStatus, plateauPlayerSnapshot)) return true;
              // 彻底终结大祭！
              TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.8);
              WorldBossStatus.Health = 0;
              WorldBossStatus.isEternallyDefeated = true;
              
              // 停止位面破坏系统
              await stopWeimianDestruction();
              
              // 记录大祭被终结
              await redis.set('xiuxian:dajie_eternally_defeated', 'true');
              let eraConfig = config.getConfig('xiuxian', 'xiuxian');
              await redis.set('xiuxian:epochs_since_dajie', eraConfig.Era?.current?.epoch?.toString() || '1');
              
              await e.reply([
                `【诡异大祭·终焉】`,
                `「不……这不可能！！」`,
                `终极始祖发出绝望的嘶吼，`,
                `他的身躯在剑光下崩解，`,
                `那永恒不灭的高原意志，`,
                `在这一刻彻底崩塌！`,
                ``,
                `「诡异……终有尽时。」`,
                `你的声音回荡在厄土高原之上，`,
                `亿万被祭掉生灵的残魂在高原上空盘旋，`,
                `化作璀璨的星雨洒落诸天！`,
                ``,
                `【大祭终结】`,
                `你彻底永寂了诡异始祖！`,
                `终结了这场席卷诸天的诡异大祭！`,
                `黑雾散尽，万界重光！`,
                `芸芸众生，终于重见天日！`,
                ``,
                `对【高原本源】造成${bigNumberTransform(TotalDamage)}点致命伤害！`,
                `【高原本源已被彻底湮灭！】`
              ].join('\n'));
              
            } else {
              // 终极始祖击败玩家
              TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.1);
              WorldBossStatus.Health -= TotalDamage;
              
              // 获取失败次数
              let oblivionInfo = await redis.get(oblivionKey);
              let failCount = 1;
              let previousFails = 0;
              if (oblivionInfo) {
                let oldOblivion = JSON.parse(oblivionInfo);
                previousFails = oldOblivion.failCount || 0;
              }
              failCount = previousFails + 1;
              
              // 祭道境：时间更长，更快达到永寂
              let isXiuDao = player.mijinglevel_id >= 22;
              let oblivionDuration = isXiuDao ? 20 : 15;
              let oblivionEndTime = Date.now() + oblivionDuration * 60 * 1000;
              
              // 祭道境第三次失败彻底永寂
              let eternalEndTime = null;
              if (isXiuDao && failCount >= 3) {
                eternalEndTime = oblivionEndTime + 999999 * 60 * 1000; // 永寂999999分钟
              }
              
              await redis.set(oblivionKey, JSON.stringify({
                startTime: Date.now(),
                endTime: oblivionEndTime,
                eternalEndTime: eternalEndTime,
                failCount: failCount,
                stage: 'ultimate_defeat',
                isXiuDao: isXiuDao,
                isByUltimate: true // 被终极始祖击败
              }));
              
              let remainingAttempts = 3 - failCount;
              
              await e.reply([
                `【终极败北】`,
                `终极始祖不可敌！`,
                `他的实力已超越祭道，凌驾于所有法则之上！`,
                `你的帝躯再次崩裂，`,
                `但这次，你虽败犹荣！`,
                `因为你连续击败了两轮十祖！`,
                `只差一步，就能彻底终结大祭！`,
                ``,
                `对【高原本源】造成${bigNumberTransform(TotalDamage)}点伤害`,
                ``,
                `寂灭时间：${oblivionDuration}分钟`,
                isXiuDao ? `剩余复活机会：${remainingAttempts}次` : `「念念不忘，必有回响！」`,
                isXiuDao && failCount >= 2 ? `【警告】这是你最后一次复活机会！` : ''
              ].join('\n'));
              
              player.当前血量 = 0;
              await Write_player(usr_qq, player);
            }
            
          } else if (!playerAlive2) {
            // 第二轮战败
            TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.08);
            WorldBossStatus.Health -= TotalDamage;
            
            // 获取失败次数
            let oblivionInfo = await redis.get(oblivionKey);
            let failCount = 1;
            let previousFails = 0;
            if (oblivionInfo) {
              let oldOblivion = JSON.parse(oblivionInfo);
              previousFails = oldOblivion.failCount || 0;
            }
            failCount = previousFails + 1;
            
            let isXiuDao = player.mijinglevel_id >= 22;
            let oblivionDuration = isXiuDao ? 20 : 12;
            let oblivionEndTime = Date.now() + oblivionDuration * 60 * 1000;
            
            let eternalEndTime = null;
            if (isXiuDao && failCount >= 3) {
              eternalEndTime = oblivionEndTime + 999999 * 60 * 1000; // 永寂999999分钟
            }
            
            await redis.set(oblivionKey, JSON.stringify({
              startTime: Date.now(),
              endTime: oblivionEndTime,
              eternalEndTime: eternalEndTime,
              failCount: failCount,
              stage: 'revived_defeat',
              isXiuDao: isXiuDao
            }));
            
            let remainingAttempts = 3 - failCount;
            
            await e.reply([
              `【力竭而败】`,
              `你被复苏后的始祖围攻，`,
              `真身在寂灭中崩解……`,
              `但本轮战斗你成功击杀了${revivedDeadAncestors.length}尊复苏始祖！`,
              ``,
              `「蝼蚁之力，却也惊天！」`,
              `始祖们的目光中浮现忌惮之色，`,
              `「连续两轮……你究竟是何种存在？」`,
              ``,
              `对【高原本源】造成${bigNumberTransform(TotalDamage)}点伤害`,
              ``,
              `寂灭时间：${oblivionDuration}分钟`,
              isXiuDao ? `剩余复活机会：${remainingAttempts}次` : `「念念不忘，必有回响！」`,
              isXiuDao && failCount >= 2 ? `【警告】这是你最后一次复活机会！` : ''
            ].join('\n'));
            
            player.当前血量 = 0;
            await Write_player(usr_qq, player);
          } else {
            // 第二轮险胜但还有存活
            TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.5);
            WorldBossStatus.Health -= TotalDamage;
            
            await e.reply([
              `【惨胜】`,
              `你与复苏始祖血战到底！`,
              `成功击杀${revivedDeadAncestors.length}尊！`,
              `但剩余始祖遁入祖地深处休养……`,
              `「这一世……当真出了变数！」`,
              ``,
              `对【高原本源】造成${bigNumberTransform(TotalDamage)}点伤害！`
            ].join('\n'));
          }
          
          // 保存状态
          PlayerRecordJSON.TotalDamage[Userid] += TotalDamage;
          await redis.set('gaoyuan', JSON.stringify(PlayerRecordJSON));
          await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));
          WorldBOSSBattleLock = 0;
          return true;
        }
        // 如果是复活后再次击杀十祖，进入终极始祖阶段
        else if (reviveCount >= 1) {
          await e.reply([
          `【厄土高原·祖地惊变】`,
          `你站在尸山血海之上，`,
          `十尊始祖，尽数陨落！`,
          `帝血染红了高原的每一寸黑土，`,
          `诡异物质在高原上肆虐咆哮！`,
          ``,
          `「不可能！」`,
          `「我族万古长青，怎会败于你手？！」`,
          ``,
          `然而，就在这时——`,
          `脚下的高原，骤然剧烈震颤！`,
          `黑雾沸腾如怒海，`,
          `一道更加恐怖的气息，从高原最深处苏醒！`,
          ``,
          `「吾族……竟被逼至如此境地？」`,
          `一道超越祭道的身影，缓缓自祖地中走出，`,
          `那气息，那威压，远超十大始祖之和！`,
          ``,
          `「吾乃——终极始祖！」`,
          `「尔等蝼蚁，竟敢屠戮我族！」`,
          `「这一世的大祭，由我亲手终结！」`,
        ].join('\n'));
        
        await sleep(3000);
        
        // 生成终极始祖
        let fusionAtk = BossList.reduce((sum, a) => sum + a.攻击, 0) * 1.5;
        let fusionDef = BossList.reduce((sum, a) => sum + a.防御, 0) * 1.2;
        let fusionHp = BossList.reduce((sum, a) => sum + a.血量上限, 0) * 3;
        
        let ultimateBoss = {
          名号: '终极始祖·超越祭道',
          攻击: Math.trunc(fusionAtk),
          防御: Math.trunc(fusionDef),
          当前血量: Math.trunc(fusionHp),
          血量上限: Math.trunc(fusionHp),
          暴击率: 0.95,
          灵根: { type: '终极', name: '高原本源体', 法球倍率: 5 },
          速度: 500,
          mijinglevel_id: 22,
          法球倍率: 5,
          魔道值: 99999,
          id: 'ultimate_boss',
          学习的功法: ['高原永存', '祭道终结', '刀斩古今']
        };
        
        // 终极战斗
        const A_player4 = { ...player };
        const B_player4 = { ...ultimateBoss };
        const blackEmperorFormation4 = consumeBlackEmperorBattleFormation(player, A_player4, B_player4);
        if (blackEmperorFormation4.consumed) await Write_player(usr_qq, player);
        let Data_battle2 = await zd_battle(A_player4, [B_player4]);
        if (blackEmperorFormation4.message && Array.isArray(Data_battle2.msg)) Data_battle2.msg.unshift(blackEmperorFormation4.message);
        await sendBattleMsg(e, Data_battle2.msg);
        await sleep(1500);
        
        player.当前血量 = Data_battle2.A_team[0].当前血量;
        
        if (Data_battle2.A_hp > 0) {
          if (await this.rewindHighland(e, player, WorldBossStatus, plateauPlayerSnapshot)) return true;
          // 彻底终结大祭！
          TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.8);
          WorldBossStatus.Health = 0;
          WorldBossStatus.isEternallyDefeated = true;
          
          // 停止位面破坏系统
          await stopWeimianDestruction();
          
          // 记录大祭被终结
          await redis.set('xiuxian:dajie_eternally_defeated', 'true');
          let eraConfig = config.getConfig('xiuxian', 'xiuxian');
          await redis.set('xiuxian:epochs_since_dajie', eraConfig.Era?.current?.epoch?.toString() || '1');
          
          await e.reply([
            `【诡异大祭·终焉】`,
            `「不……这不可能！！」`,
            `终极始祖发出绝望的嘶吼，`,
            `他的身躯在剑光下崩解，`,
            `那永恒不灭的高原意志，`,
            `在这一刻彻底崩塌！`,
            ``,
            `「诡异……终有尽时。」`,
            `你的声音回荡在厄土高原之上，`,
            `亿万被祭掉生灵的残魂在高原上空盘旋，`,
            `化作璀璨的星雨洒落诸天！`,
            ``,
            `【大祭终结】`,
            `你彻底永寂了诡异始祖！`,
            `终结了这场席卷诸天的诡异大祭！`,
            `黑雾散尽，万界重光！`,
            `芸芸众生，终于重见天日！`,
            ``,
            `对【高原本源】造成${bigNumberTransform(TotalDamage)}点致命伤害！`,
            `【高原本源已被彻底湮灭！】`,
          ].join('\n'));
          
        } else {
          // 终极始祖击败玩家
          TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.1);
          WorldBossStatus.Health -= TotalDamage;
          
          await e.reply([
            `【终极败北】`,
            `终极始祖不可敌！`,
            `他的实力已超越祭道，凌驾于所有法则之上！`,
            `你的帝躯再次崩裂，`,
            `但这次，你虽败犹荣！`,
            `因为你已经击杀了十大始祖！`,
            `只差一步，就能彻底终结大祭！`,
            ``,
            `对【高原本源】造成${bigNumberTransform(TotalDamage)}点伤害`,
          ].join('\n'));
          
          player.当前血量 = 0;
          await Write_player(usr_qq, player);
          
          // 获取失败次数并设置永寂
          let oblivionInfo = await redis.get(oblivionKey);
          let failCount = 1;
          let previousFails = 0;
          if (oblivionInfo) {
            let oldOblivion = JSON.parse(oblivionInfo);
            previousFails = oldOblivion.failCount || 0;
          }
          failCount = previousFails + 1;
          
          let isXiuDao = player.mijinglevel_id >= 22;
          let oblivionDuration = isXiuDao ? 20 : 15;
          let oblivionEndTime = Date.now() + oblivionDuration * 60 * 1000;
          
          let eternalEndTime = null;
          if (isXiuDao && failCount >= 3) {
            eternalEndTime = oblivionEndTime + 999999 * 60 * 1000;
          }
          
          await redis.set(oblivionKey, JSON.stringify({
            startTime: Date.now(),
            endTime: oblivionEndTime,
            eternalEndTime: eternalEndTime,
            failCount: failCount,
            isXiuDao: isXiuDao,
            isByUltimate: true
          }));
        }
        } // 关闭 else if (reviveCount >= 1)
        
      } else if (playerAlive) {
        // 玩家胜利但还有始祖存活
        let killedThisSession = ancestorsState.killed.length;
        let remainingCount = 10 - killedThisSession;
        
        TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.76);
        WorldBossStatus.Health -= TotalDamage;
        
        await e.reply([
          `【初战告捷】`,
          `你与${remainingCount}尊始祖激战，`,
          `成功击杀${deadAncestorsThisRound.length}尊！`,
          `剩余存活始祖：${remainingCount}/10尊`,
          ``,
          `「尔等……竟如此强大？」`,
          `始祖们的目光中浮现忌惮之色，`,
          `「这一世，竟出了如此变数……」`,
          `始祖们退入高原深处，休养生息，`,          ``,
          `对【高原本源】造成${bigNumberTransform(TotalDamage)}点伤害！`,
  
        ].join('\n'));
        
        // 真身寂灭5分钟（战斗胜利但也受创）
        let oblivionEndTime = Date.now() + 5 * 60 * 1000;
        await redis.set(oblivionKey, JSON.stringify({
          startTime: Date.now(),
          endTime: oblivionEndTime,
          failCount: 0,
          killedAncestors: deadAncestorsThisRound,
          isVictory: true
        }));
        
      } else {
        // 玩家败北
        let killedThisSession = ancestorsState.killed.length;
        let remainingCount = 10 - killedThisSession;
        
        // 获取失败次数
        let oblivionInfo = await redis.get(oblivionKey);
        let failCount = 1;
        let previousFails = 0;
        if (oblivionInfo) {
          let oldOblivion = JSON.parse(oblivionInfo);
          previousFails = oldOblivion.failCount || 0;
        }
        failCount = previousFails + 1;
        
        let isXiuDao = player.mijinglevel_id >= 22;
        let oblivionDuration = isXiuDao ? 15 : 10;
        let oblivionEndTime = Date.now() + oblivionDuration * 60 * 1000;
        
        let eternalEndTime = null;
        if (isXiuDao && failCount >= 3) {
          eternalEndTime = oblivionEndTime + 999999 * 60 * 1000; // 永寂999999分钟
        }
        
        let remainingAttempts = 3 - failCount;
        
        TotalDamage = Math.trunc(WorldBossStatus.Healthmax * 0.04);
        WorldBossStatus.Health -= TotalDamage;
        
        await e.reply([
          `【力竭而败】`,
          `你被${remainingCount}尊始祖围攻，`,
          `最终力竭而亡……`,
          `但你已经证明了自己的实力！`,
          `本场战斗击杀：${deadAncestorsThisRound.length}尊`,
          `累计击杀：${killedThisSession}/10尊`,
          ``,
          `「蝼蚁之力，却也惊天！」`,
          `始祖们开始正视你的存在，`,
          `「待你复苏之日，再来一战！」`,
          ``,
          `对【高原本源】造成${bigNumberTransform(TotalDamage)}点伤害`,
          ``,
          `寂灭时间：${oblivionDuration}分钟`,
          isXiuDao ? `剩余复活机会：${remainingAttempts}次` : `「念念不忘，必有回响！」`,
          isXiuDao && failCount >= 2 ? `【警告】这是你最后一次复活机会！` : ''
        ].join('\n'));
        
        // 真身寂灭
        await redis.set(oblivionKey, JSON.stringify({
          startTime: Date.now(),
          endTime: oblivionEndTime,
          eternalEndTime: eternalEndTime,
          failCount: failCount,
          killedAncestors: deadAncestorsThisRound,
          isXiuDao: isXiuDao
        }));
        
        player.当前血量 = 0;
        await Write_player(usr_qq, player);
      }
      
      // 状态回合处理
      WorldBossStatus.isAngry = WorldBossStatus.isAngry ? WorldBossStatus.isAngry - 1 : 0;
      WorldBossStatus.isWeak = WorldBossStatus.isWeak ? WorldBossStatus.isWeak - 1 : 0;
      
      // 狂暴触发
      if (TotalDamage >= WorldBossStatus.OriginHealth * 0.1 && !WorldBossStatus.isAngry) {
        WorldBossStatus.isAngry = 3;
        await e.reply([
          `【始祖暴怒】`,
          `你的攻势重创了高原本源，`,
          `令诡异始祖们彻底暴怒！`,
          `「区区蝼蚁，也敢伤我本源？！」`,
          `高原震动，黑血沸腾！`,
          `祭道符文燃烧，威压撼动古今未来！`,
          `始祖们进入狂暴状态，持续3个纪元！`,
        ].join('\n'));
      }
      
      // 保存记录
      PlayerRecordJSON.TotalDamage[Userid] += TotalDamage;
      await redis.set('gaoyuan', JSON.stringify(PlayerRecordJSON));
      await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));
      
      WorldBOSSBattleLock = 0;
      
      // 检查是否彻底终结
      if (WorldBossStatus.Health <= 0 && WorldBossStatus.isEternallyDefeated) {
        await this.handleFinalRewards(e, PlayerRecordJSON, WorldBossStatus);
      }
    }
  }
  
  // 处理最终奖励
  async rewindHighland(e, player, status, snapshot = null) {
    const finale = resolveHighlandFinale(status, player);
    if (finale.destroyed) return false;
    status.Health = status.Healthmax;
    status.isEternallyDefeated = false;
    status.reviveCount = 0;
    status.isAngry = 0;
    status.isWeak = 0;
    if (snapshot) {
      const id = await channel(String(e.user_id).replace('qg_', ''));
      await Write_player(id, snapshot);
    }
    await redis.set('guiyishizu', JSON.stringify(status));
    await redis.set('guiyishizu_ancestors', JSON.stringify({ killed: [], alive: [0,1,2,3,4,5,6,7,8,9] }));
    await redis.del('xiuxian:dajie_eternally_defeated', 'xiuxian:epochs_since_dajie');
    WorldBOSSBattleLock = 0;
    await e.reply('【高原意志复苏·时间线回溯】诡异族群的覆灭结局被逆转，十大始祖与高原本源尽数复归；终结奖励不结算。唯有祭道之上，方能彻底摧毁高原。');
    return true;
  }

  async handleFinalRewards(e, PlayerRecordJSON, WorldBossStatus) {
    let killerId = PlayerRecordJSON.QQ[PlayerRecordJSON.QQ.length - 1];
    let killerPlayer = await data.getData('player', killerId);
    if (await this.rewindHighland(e, killerPlayer, WorldBossStatus)) return;
    
    // 发放奖励
    killerPlayer.灵石 += 50000000;
    killerPlayer.修为 += 50000000;
    killerPlayer.血气 += 50000000;
    await data.setData("player", killerId, killerPlayer);
    
    // 发放击杀者特殊奖励
    let killerItems = getRandomItems(data.heiandongluandizhan, 5);
    await addItemsToNajie(killerId, killerItems);
    let killerItemsMsg = killerItems.map(item => `${item.name}×${item.quantity}`).join(', ');
    
    await e.reply([
      segment.at(killerId),
      `【终结者】`,
      `【${killerPlayer.名号}】`,
      `你彻底终结了诡异大祭，永寂了厄土高原！`,
      `天道有感，降下无量福泽：`,
      `获得灵石：50000000`,
      `修为提升：50000000`,
      `血气提升：50000000`,
      `在破碎的高原祖地中，你寻得终极神物：`,
      `${killerItemsMsg}`,
      ``,
      `【大祭终结·诸天同庆】`,
      `诡异大祭已成为过去，`,
      `这段血泪史将被铭记在古史之中！`,
    ].join('\n'));
    
    // 处理贡献排行榜
    let PlayerList = await SortPlayer(PlayerRecordJSON);
    let Show_MAX = Math.min(PlayerList.length, 20);
    
    let TotalDamage = 0;
    for (let i = 0; i < Show_MAX; i++) {
      TotalDamage += PlayerRecordJSON.TotalDamage[PlayerList[i]];
    }
    
    let Rewardmsg = ["═══════ 扫平厄土高原·贡献排行榜 ═══════"];
    
    for (let i = 0; i < Show_MAX; i++) {
      let playerId = PlayerRecordJSON.QQ[PlayerList[i]];
      let playerName = PlayerRecordJSON.Name[PlayerList[i]];
      let damage = PlayerRecordJSON.TotalDamage[PlayerList[i]];
      
      let rewardMoney = Math.trunc((damage / TotalDamage) * WorldBossStatus.Reward);
      rewardMoney = Math.max(5000, Math.min(rewardMoney, 5000000));
      
      let playerData = await data.getData("player", playerId);
      playerData.灵石 += rewardMoney;
      await data.setData("player", playerId, playerData);
      
      let itemsCount = i === 0 ? 8 : i === 1 ? 6 : i === 2 ? 4 : i <= 4 ? 2 : 1;
      
      if (itemsCount > 0) {
        let rankItems = getRandomItems(data.heiandongluandizhan, itemsCount);
        await addItemsToNajie(playerId, rankItems);
        let itemNames = rankItems.map(item => `${item.name}×${item.quantity}`).join(', ');
        await e.reply([segment.at(playerId), `\n【贡献榜第${i+1}名】获得灵石${rewardMoney}，物品：${itemNames}`]);
      }
      
      Rewardmsg.push(`第${i+1}名: ${playerName} - 伤害:${bigNumberTransform(damage)} - 灵石:${rewardMoney}`);
    }
    
    await ForwardMsg(e, Rewardmsg);
    
    // 清除所有相关状态
    await redis.del('guiyishizu');
    await redis.del('gaoyuan');
    await redis.del('guiyishizu_ancestors');
    markPlaneDestroyed(data.filePathMap.weimianList, '厄土高原', {
      source: PLANE_DESTRUCTION_SOURCES.STRANGE_EMPEROR,
      actor: killerPlayer.名号 || '终结高原者',
      permanent: true,
    });
    
    // 广播终焉消息
    const groupList = await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    for (const group_id of groupList) {
      Bot.pickGroup(group_id).sendMsg([
        "【诸天同庆】",
        "诡异大祭已被终结！",
        "厄土高原化为虚无，诡异始祖彻底消亡！",
        "诸天万界重归安宁，芸芸众生欢欣鼓舞！",
        "这段血与泪的历史，将永载史册！",
      ].join("\n"));
    }
  }

  // ==================== 永寂名单查询 ====================

  /**
   * #永寂名单 — 查看当前永寂者总览
   */
  async ShowYongJiList(e) {
    if (!verc({ e })) return false;

    const stats = await getYongJiStats();

    if (stats.total === 0) {
      await e.reply([
        `【永寂之界·名单】`,
        ``,
        `永寂之界一片虚空，万籁俱寂……`,
        `此刻尚无修士沉眠于此。`,
        ``,
        `「永寂者若有，必是诡异大祭的牺牲。」`,
        `「待大祭降临，此地将再不寂寥。」`,
      ].join('\n'));
      return true;
    }

    const lines = [
      `\n══════ 永寂之界 · 沉眠名单 ══════`,
      ``,
      `永寂者总计：${stats.total} 名`,
      ``,
      `【按位面分布】`,
    ];

    for (const plane of stats.byPlane) {
      lines.push(`  ◆ ${plane.planeName}：${plane.count} 名`);
    }

    lines.push(``, `「他们的道果悬于永寂之界，`);
    lines.push(`　等待仙帝「映照」权能将其召唤归来。」`);
    lines.push(``, `【映照指令】`);
    lines.push(`  #映照[名号] — 复活单名永寂者`);
    lines.push(`  #映照[位面名] — 修复被诡异大祭崩灭的位面`);
    lines.push(`  #映照诸天 — 复活全部永寂者（代价极大）`);

    await e.reply(lines.join('\n'));
    return true;
  }

}

// 辅助函数
async function InitWorldBoss(e) {
  const planeState = JSON.parse(fs.readFileSync(data.filePathMap.weimianList, 'utf8'));
  if (planeState.高原彻底覆灭 === true) {
    await e?.reply?.('高原已被祭道之上彻底摧毁，大祭不再重开。');
    return -1;
  }
  let AverageDamageStruct = await GetAverageDamage(e);
  let player_quantity = parseInt(AverageDamageStruct.player_quantity);
  let AverageDamage = parseInt(AverageDamageStruct.AverageDamage);
  let Reward = 6000000;
  WorldBOSSBattleLock = 0;
  
  if (player_quantity == 0) {
    await e.reply("现世万界竟无路尽级仙帝！诡异始祖的大祭无人可挡，诸天将陷入永夜……");
    return -1;
  }
  
  if (player_quantity < 5) Reward = 3000000;
  
  let X = AverageDamage * 0.2;
  
  let Health = Math.trunc(X * 15000000 * player_quantity * 2);
  let Attack = Math.trunc(X * 15000000 * player_quantity * 2);
  let Defence = Math.trunc(X * 15000000 * player_quantity * 2);
  
  let WorldBossStatus = {
    Health: Health,
    Healthmax: Health,
    OriginHealth: Health,
    isAngry: 0,
    isWeak: 0,
    Attack: Attack,
    Defence: Defence,
    KilledTime: -1,
    Reward: Reward * 5,
    LastActivityTime: new Date().getTime(),
    isEternallyDefeated: false,
    reviveCount: 0
  };
  
  // 初始化始祖状态：全部存活
  let ancestorsState = { killed: [], alive: [0,1,2,3,4,5,6,7,8,9] };
  
  if (bossAutoCloseTimer) {
    clearTimeout(bossAutoCloseTimer);
    bossAutoCloseTimer = null;
  }
  
  let PlayerRecord = { QQ: [], TotalDamage: [], Name: [] };
  await redis.set('guiyishizu', JSON.stringify(WorldBossStatus));
  await redis.set('gaoyuan', JSON.stringify(PlayerRecord));
  await redis.set('guiyishizu_ancestors', JSON.stringify(ancestorsState));
  
  // 启动位面破坏系统
  await startWeimianDestruction();
  
  // 广播开启消息
  let msg = [
    "【诸天万界公告】",
    "厄土高原深处，黑雾骤然沸腾！",
    "万道哀鸣，星辰坠落！",
    "",
    "诡异始祖自万古沉眠中苏醒，",
    "十道模糊身影自高原尽头浮现，",
    "每一尊都散发着令诸天颤栗的祭道级气息！",
    "",
    "他们要发动诡异大祭，",
    "以诸天为祭品，万灵为薪柴，",
    "将整个现世化为永恒的黑暗！",
    "",
    "亿万宇宙化为尘埃，无数古界沦为死域！",
    "黑暗物质侵蚀时间长河，命运长河断流！",
    "仙帝染血，祭道陨落，诸天陷入至暗时刻！",
    "",
    "唯有达到路尽级仙帝境界的强者，",
    "方能踏上高原，参与这场终极决战！",
  ].join('\n');
  
  const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
  const groupList = await redis.sMembers(redisGlKey);
  
  for (const group_id of groupList) {
    Bot.pickGroup(group_id).sendMsg(msg).catch(console.error);
  }
  
  return 0;
}

async function BossIsAlive() {
  let status = await redis.get('guiyishizu');
  if (!status) return false;
  let WorldBossStatus = JSON.parse(status);
  // 如果已被彻底终结，返回false
  if (WorldBossStatus.isEternallyDefeated) return false;
  return true;
}

async function SortPlayer(PlayerRecordJSON) {
  if (PlayerRecordJSON) {
    let Temp0 = JSON.parse(JSON.stringify(PlayerRecordJSON));
    let Temp = Temp0.TotalDamage;
    let SortResult = [];
    Temp.sort(function (a, b) { return b - a; });
    for (let i = 0; i < PlayerRecordJSON.TotalDamage.length; i++) {
      for (let s = 0; s < PlayerRecordJSON.TotalDamage.length; s++) {
        if (Temp[i] == PlayerRecordJSON.TotalDamage[s]) {
          SortResult[i] = s;
          break;
        }
      }
    }
    return SortResult;
  }
  return [];
}

async function SetWorldBOSSBattleUnLockTimer(e) {
  WorldBOSSBattleUnLockTimer = setTimeout(() => {
    if (WorldBOSSBattleLock == 1) {
      WorldBOSSBattleLock = 0;
    }
  }, 60000);
}

async function sleep(time) {
  return new Promise(resolve => { setTimeout(resolve, time); });
}

async function sendBattleMsg(e, msg) {
  const chunkSize = 60;
  if (msg.length <= chunkSize) {
    await ForwardMsg(e, msg);
  } else {
    for (let i = 0; i < msg.length; i += chunkSize) {
      let chunk = msg.slice(i, i + chunkSize);
      await ForwardMsg(e, chunk);
      if (i + chunkSize < msg.length) await sleep(500);
    }
  }
}

async function GetAverageDamage(e) {
  let File = fs.readdirSync(data.filePathMap.player);
  File = File.filter(file => file.endsWith('.json'));
  let temp = [];
  let TotalPlayer = 0;
  for (let i = 0; i < File.length; i++) {
    let this_qq = File[i].replace('.json', '');
    let player = await data.getData('player', this_qq);
    if (player && player.mijinglevel_id > 20 && player.mijinglevel_id <= 24) {
      temp[TotalPlayer] = parseInt(player.攻击);
      TotalPlayer++;
    }
  }
  temp.sort(function (a, b) { return b - a; });
  let AverageDamage = 0;
  if (TotalPlayer > 15)
    for (let i = 2; i < temp.length - 4; i++) AverageDamage += temp[i];
  else for (let i = 0; i < temp.length; i++) AverageDamage += temp[i];
  AverageDamage = TotalPlayer > 15 ? AverageDamage / (temp.length - 6) : 
                  temp.length == 0 ? 0 : AverageDamage / temp.length;
  return { AverageDamage, player_quantity: TotalPlayer };
}

async function checkAndCloseInactiveBoss() {
  if (!await BossIsAlive()) return;

  const WorldBossStatusStr = await redis.get('guiyishizu');
  if (!WorldBossStatusStr) return;

  const WorldBossStatus = JSON.parse(WorldBossStatusStr);
  const now = new Date().getTime();

  if (now - WorldBossStatus.LastActivityTime > 24 * 60 * 60 * 1000) {
    if (bossAutoCloseTimer) {
      clearTimeout(bossAutoCloseTimer);
      bossAutoCloseTimer = null;
    }

    await redis.del('guiyishizu');
    await redis.del('gaoyuan');
    await redis.del('guiyishizu_ancestors');

    // 停止位面破坏系统
    await stopWeimianDestruction();

    await applyJueLingEraPenalty();
    
    const groupList = await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    for (const group_id of groupList) {
      Bot.pickGroup(group_id).sendMsg([
        "【高原沉寂】",
        "厄土高原之上，黑雾缓缓散去……诡异始祖完成了这一世的大祭，将诸天万界化为祭品后，归于沉寂。",
        "",
        "但他们并未真正离去，只是再次沉眠于高原深处，等待八个纪元后的再次苏醒……",
        "",
        "「既然无人能阻——」",
        "「那便让这条路，断了吧。」",
        "",
        "厄土仙帝离去前回首，眸光穿透古今未来。",
        "他并未再行大祭，而是轻轻抬手，对着现世，以掌化刀来了一记——「天意一刀」。",
        "",
        `那一刀恐怖至极，划开了永恒混沌`,
        `刹那间天地大道崩裂，法则残缺，`,
        `万灵赖以修行的根基，被生生斩断瓦解。`,
        "【绝灵降临】",
        "天地迎来至暗时刻，",
        "所有仙帝以下修士境界跌落！",
        "仙路断绝，大道难求！"
      ].join("\n"));
    }
  }
}

async function applyJueLingEraPenalty() {
  try {
    const playerFiles = fs.readdirSync(data.filePathMap.player);
    const jsonFiles = playerFiles.filter(file => file.endsWith('.json'));
    
    let affectedPlayers = 0;
    
    for (const file of jsonFiles) {
      const qq = file.replace('.json', '');
      const player = await Read_player(qq);
      
      if (player && player.mijinglevel_id < 21) {
        player.mijinglevel_id = Math.max(1, player.mijinglevel_id - 1);
        player.level_id = Math.max(1, player.level_id - 1);
        player.Physique_id = Math.max(1, player.Physique_id - 1);
        // 绝灵降临境界跌落削帝路资格：需重渡破王成帝劫
        revokeBreakKingEmperorEligibility(player, 'mijing');
        await Write_player(qq, player);
        affectedPlayers++;
      }
    }
    
    console.log(`[诡异大祭余波] ${affectedPlayers}位玩家境界跌落`);
    return affectedPlayers;
  } catch (err) {
    console.error('应用惩罚失败:', err);
    return 0;
  }
}

function getRandomItems(items, count) {
  let selectedItems = [];
  if (!Array.isArray(items) || items.length === 0) return selectedItems;
  
  const itemPool = [...items];
  for (let i = 0; i < count; i++) {
    if (itemPool.length === 0) break;
    const randomIndex = Math.floor(Math.random() * itemPool.length);
    const item = itemPool[randomIndex];
    if (item && typeof item === 'object' && '数量' in item) {
      selectedItems.push({
        name: item.name,
        class: item.class,
        quantity: item.数量
      });
      itemPool.splice(randomIndex, 1);
    }
  }
  return selectedItems;
}

async function addItemsToNajie(playerId, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  const recipient = await Read_player(playerId);
  for (let item of items) {
    if (item && item.name && item.class && item.quantity !== undefined) {
      try {
        item.quantity = multiplySuiyunLoot(recipient, item, item.quantity);
        await Add_najie_thing(playerId, item.name, item.class, item.quantity);
      } catch (e) {
        console.error(`添加物品失败: ${item.name}`, e);
      }
    }
  }
}

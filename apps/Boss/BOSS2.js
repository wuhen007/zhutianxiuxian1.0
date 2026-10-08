import { plugin, verc, data, config } from '../../api/api.js';
import fs from 'fs';
import { multiplySuiyunLoot } from '../../model/suiyunLoot.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  Add_灵石,
  ForwardMsg,
  Add_HP,
  Write_player,
  Read_player,
  Harm,
  zd_battle,
  channel, Add_najie_thing 
} from '../../model/xiuxian.js';
import {
  DARK_REVOLT_SUPREMES,
  DARK_REVOLT_CONSTANTS,
  DARK_REVOLT_RESCUE_EVENTS,
  applyDarkRevoltSuppression,
  activateDachengShengtiCorpse,
  allDarkRevoltBossesDefeated,
  createDarkRevoltStatus,
  damageDarkRevoltBoss,
  getActiveDarkRevoltBoss,
  isSaintBodyPlayer,
  normalizeDarkRevoltStatus,
  syncDarkRevoltLegacyFields,
} from '../../model/darkRevolt.js';
import { rescuePlaneForPlayer } from './WeimianDestruction.js';
import {
  clearDarkRevoltDestruction,
  getCurrentWorldYear,
  getDarkRevoltDestructionStatus,
  initializeDarkRevoltDestruction,
  touchDarkRevoltActivity,
} from './DarkRevoltDestruction.js';
let WorldBOSSBattleCD = []; //CD
let WorldBOSSBattleLock = 0; //BOSS战斗锁，防止打架频率过高造成奖励多发
let WorldBOSSBattleUnLockTimer = 0; //防止战斗锁因意外锁死
const SHENGTI_CORPSE_RESCUE_KEY = 'Xiuxian:DarkRevolt:ShengtiCorpse:';

function shengtiCorpseKey(qq) {
  return `${SHENGTI_CORPSE_RESCUE_KEY}${String(qq)}`;
}

async function armDachengShengtiCorpse(qq, player, status) {
  if (!isSaintBodyPlayer(player)) {
    return { ok: false, reason: '只有圣体血脉才能驾驭大成圣体尸骸' };
  }
  const eventStartedAt = Number(status?.harvestStartedAt) || 0;
  const key = shengtiCorpseKey(qq);
  const existing = await redis.get(key);
  if (existing) {
    try {
      const saved = JSON.parse(existing);
      if (saved.eventStartedAt === eventStartedAt && Number(saved.usesRemaining) > 0) {
        return { ok: false, reason: `尸骸真灵尚在战场，剩余${saved.usesRemaining}回合` };
      }
    } catch (e) {}
  }
  await redis.set(key, JSON.stringify({
    eventStartedAt,
    usesRemaining: DARK_REVOLT_CONSTANTS.corpseRescueRounds,
    activatedAt: Date.now(),
  }));
  return { ok: true, usesRemaining: DARK_REVOLT_CONSTANTS.corpseRescueRounds };
}

async function consumeDachengShengtiCorpse(qq, player, boss, status) {
  const key = shengtiCorpseKey(qq);
  const raw = await redis.get(key);
  if (!raw) return { active: false, player };
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch (e) {
    await redis.del(key);
    return { active: false, player };
  }
  const eventStartedAt = Number(status?.harvestStartedAt) || 0;
  const usesRemaining = Number(saved.usesRemaining) || 0;
  if (saved.eventStartedAt !== eventStartedAt || usesRemaining <= 0) {
    await redis.del(key);
    return { active: false, player };
  }
  const empoweredPlayer = activateDachengShengtiCorpse(player, boss);
  const nextUses = usesRemaining - 1;
  if (nextUses > 0) {
    await redis.set(key, JSON.stringify({ ...saved, usesRemaining: nextUses }));
  } else {
    await redis.del(key);
  }
  return { active: true, player: empoweredPlayer, usesRemaining: nextUses };
}
export class BOSS2 extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_修仙_BOSS',
      dsc: 'BOSS模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#开启黑暗动乱$',
          fnc: 'CreateWorldBoss',
        },
        {
          reg: '^#关闭黑暗动乱$',
          fnc: 'DeleteWorldBoss',
        },
        {
          reg: '^#禁区至尊状态$',
          fnc: 'LookUpWorldBossStatus',
        },
        {
          reg: '^#黑暗动乱帝战贡献榜$',
          fnc: 'ShowDamageList',
        },
        {
          reg: '^#平定黑暗动乱$',
          fnc: 'WorldBossBattle',
        },
        {
          reg: '^#救场黑暗动乱$',
          fnc: 'RescueDarkRevolt',
        },
        {
          reg: '^#驾驭大成圣体尸骸$',
          fnc: 'ControlDachengShengtiCorpse',
        },
      ],
    });
    this.set = config.getConfig('task', 'task');
   this.task = {
  cron: this.set.BossTask2,
  name: 'BossTask2',
  fnc: () => this.CreateWorldBoss({ 
    isMaster: true, // 模拟管理员权限
    reply: (msg) => console.log(`[黑暗动乱开启！] ${msg}`) // 日志输出
  }),
};
  }
  //黑暗动乱开启指令
    async CreateWorldBoss(e) {
      if (!e) {
    // 可以在这里记录日志或者使用 Bot 发送消息
    console.log('[黑暗动乱] 定时任务触发，准备开启黑暗动乱');
    if (!await BossIsAlive()) {
      if (await InitWorldBoss(e) == 0) {
        // 发送群消息通知
        const groupList = await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
        for (const group_id of groupList) {
          Bot.pickGroup(group_id).sendMsg("禁区至尊感应到天地异变，提前苏醒！黑暗动乱已降临，诸天万界陷入浩劫！\n强者可输入 #平定黑暗动乱 参与帝战；大帝可输入 #救场黑暗动乱 护住一方位面；圣体可尝试 #驾驭大成圣体尸骸。");
        }
      }
      return true;
    } else {
      console.log('[黑暗动乱] 黑暗动乱已经开启');
      return true;
    }
  }
        if (e.isMaster) {
            if (!await BossIsAlive()) {
                if (await InitWorldBoss(e) == 0)
                    e.reply("似乎有什么东西干预了岁月，让禁区至尊有所预感，提前出世要收割万灵生命展开帝战打开成仙之门，恐怖的黑暗动乱开启！");
                return true;
            }
            else {
                e.reply("各大禁区至尊早已出世");
                return true;
            }
        }
        else return;
    }
  //黑暗动乱结束指令
  async DeleteWorldBoss(e) {
    if (!verc({ e })) return false;
    if (e.isMaster) {
      if (await BossIsAlive()) {
        await redis.del('Xiuxian:WorldBossStatus2');
        await redis.del('zhutianxiuxian1.0Record2');
        await clearDarkRevoltDestruction();
       e.reply("恐怖的黑暗动乱气息惊扰到了如梦道祖，只见他睁眼望向诸天万界，眸光照耀永恒无垠的黑暗宇宙，划破了一切既定未定，截断了整片黑暗动乱的时空，将这段历史从古史的源头中直接抹去了，世间万灵都对这段过往失去了记忆！");
      } else e.reply('黑暗动乱早已结束');
    } else return false;
  }
  //黑暗动乱状态指令
  async LookUpWorldBossStatus(e) {
    if (!verc({ e })) return false;
    if (await BossIsAlive()) {
      let WorldBossStatusStr = await redis.get('Xiuxian:WorldBossStatus2');
      let WorldBossStatus = JSON.parse(WorldBossStatusStr);
      if (WorldBossStatusStr) {
        WorldBossStatus = normalizeDarkRevoltStatus(WorldBossStatus);
        syncDarkRevoltLegacyFields(WorldBossStatus);
        WorldBossStatusStr = WorldBossStatus;
        if (new Date().getTime() - WorldBossStatusStr.KilledTime < 86400000) {
          e.reply(`此刻未到仙域之门打开之时，禁区至尊还在蛰伏`);
          return false;
        } else if (WorldBossStatusStr.KilledTime != -1) {
          if ((await InitWorldBoss(e)) == 0) await this.LookUpWorldBossStatus(e);
          return false;
        }
        const activeBoss = getActiveDarkRevoltBoss(WorldBossStatus);
        const destructionStatus = await getDarkRevoltDestructionStatus();
        const destroyedPlanes = destructionStatus.targets.filter(target => target.destroyed).map(target => target.name);
        const ReplyMsg = [
          `----黑暗动乱·六位至尊----`,
          `阶段: ${WorldBossStatus.defeated || 0}/${WorldBossStatus.totalBosses || 6}`,
          `已收割万灵精血: ${WorldBossStatus.harvestedLives || 0}`,
          `已毁灭位面: ${destroyedPlanes.join('、') || '无'}`,
        ];
        ReplyMsg.push(
          `至尊毁灭进度：${destructionStatus.targets.map(target => `${target.name}${target.hits}/${target.hitsToDestroy}`).join('、')}`,
          `无人迎战阈值：${destructionStatus.intervalWorldYears}年`,
        );
        for (const boss of WorldBossStatus.bosses) {
          const currentAttack = boss.isAngry ? Math.trunc(boss.攻击 * 1.8) : boss.isWeak ? Math.trunc(boss.攻击 * 0.7) : boss.攻击;
          const currentDefence = boss.isWeak ? Math.trunc(boss.防御 * 0.7) : boss.防御;
          ReplyMsg.push(`【${boss.名号}·${boss.title}】${boss.defeated ? '已陨落' : boss === activeBoss ? '当前帝战' : '待战'}\n血量:${boss.Health}/${boss.Healthmax}\n攻击:${currentAttack}\n防御:${currentDefence}\n${boss.quote}`);
        }
        ReplyMsg.push('帝道/皇道规则：低于大帝境修士全属性削减70%；六位至尊均已极尽升华。');
        e.reply(ReplyMsg);
      }
    } else e.reply('金角大王未开启！');
    return false;
  }

  //黑暗动乱伤害贡献榜
    async ShowDamageList(e) {
        if (await BossIsAlive()) {
            let PlayerRecord = await redis.get("zhutianxiuxian1.0Record2");
            let WorldBossStatusStr = await redis.get("Xiuxian:WorldBossStatus2");
            let WorldBossStatus = normalizeDarkRevoltStatus(JSON.parse(WorldBossStatusStr));
            if (WorldBossStatus == undefined) {
                e.reply("WorldBossStatus Error");
                return true;
            }
            if (PlayerRecord == 0) {
                e.reply("此刻还没有人族强者挺身而出守护诸天");
                return true;
            }
            let PlayerRecordJSON = JSON.parse(PlayerRecord);
            let PlayerList = await SortPlayer(PlayerRecordJSON);
            if (!PlayerRecordJSON?.Name) {
                e.reply("黑暗动乱早已被人族强者平定");
                return true;
            }
            let CurrentQQ;
            let TotalDamage = 0;
            for (let i = 0; i < (PlayerList.length <= 20 ? PlayerList.length : 20); i++)
                TotalDamage += PlayerRecordJSON.TotalDamage[PlayerList[i]];
            let msg = [
                "****黑暗动乱帝战贡献排行榜****"
            ];
            for (var i = 0; i < PlayerList.length; i++) {
                if (i < 20) {
                    let Reward = Math.trunc((PlayerRecordJSON.TotalDamage[PlayerList[i]] / TotalDamage) * WorldBossStatus.Reward);
                    Reward = Reward < 10000 ? 10000 : Reward;
                    if (Reward > 1000000) {
                        Reward = 1000000
                    }
                    msg.push("第" + `${i + 1}` + "名:\n" + `名号:${PlayerRecordJSON.Name[PlayerList[i]]}` + '\n' + `总伤害:${PlayerRecordJSON.TotalDamage[PlayerList[i]]}` + `\n${WorldBossStatus.KilledTime !== -1 ? `已得到灵石` : `预计得到灵石`}:${Reward}`);
                }
                if (PlayerRecordJSON.QQ[PlayerList[i]] == e.user_id) CurrentQQ = i + 1;
            }
            await ForwardMsg(e, msg);
            await sleep(1000);
            if (CurrentQQ != undefined)
                e.reply(`你在黑暗动乱帝战贡献排行榜中排名第${CurrentQQ}，对禁区至尊造成伤害${PlayerRecordJSON.TotalDamage[PlayerList[CurrentQQ - 1]]}，再接再厉！`);
        }
        else e.reply("黑暗动乱还未到来！");
        return true;
  }
  // 大帝救场：护住一个位面并撤离其中的低境界修士。
  async RescueDarkRevolt(e) {
    if (!verc({ e })) return false;
    if (!(await BossIsAlive())) {
      await e.reply('黑暗动乱尚未降临，无需施展救场帝术。');
      return false;
    }
    const usrQq = await channel(String(e.user_id).replace('qg_', ''));
    const result = await rescuePlaneForPlayer(usrQq);
    if (!result.ok) {
      await e.reply(`【帝者救场失败】${result.reason}`);
      return false;
    }
    await e.reply([
      '【帝者救场·万灵西迁】',
      `你以帝道撑开虚空通道，护住了「${result.plane.name}」。`,
      `${result.evacuated} 名低境界修士已撤往凡间；此位面在本次动乱中受帝印庇护。`,
      '「黑暗虽临，众生尚有一线生机。」',
    ].join('\n'));
    return true;
  }
  // 圣体血脉彩蛋：以尸骸真灵临时接管帝战镜像。
  async ControlDachengShengtiCorpse(e) {
    if (!verc({ e })) return false;
    if (!(await BossIsAlive())) {
      await e.reply('黑暗动乱尚未降临，大成圣体尸骸仍沉睡于荒古禁地。');
      return false;
    }
    const usrQq = await channel(String(e.user_id).replace('qg_', ''));
    const player = await data.getData('player', usrQq);
    const rawStatus = await redis.get('Xiuxian:WorldBossStatus2');
    const status = normalizeDarkRevoltStatus(rawStatus ? JSON.parse(rawStatus) : null);
    if (!player || !status) {
      await e.reply('帝战记录残缺，无法定位圣体尸骸。');
      return false;
    }
    const result = await armDachengShengtiCorpse(usrQq, player, status);
    if (!result.ok) {
      await e.reply(`【尸骸驾驭失败】${result.reason}`);
      return false;
    }
    await e.reply([
      '【彩蛋·大成圣体尸骸】',
      '荒古禁地深处，沉寂万古的大成圣体尸骸被圣体血脉唤醒。',
      DARK_REVOLT_RESCUE_EVENTS.dachengShengti.quote,
      '金色血气重燃，残躯短暂拥有叫板大帝的战力，且无视当前至尊的皇道法则压制。',
      `本次可维持${result.usesRemaining}场帝战；尸骸只护道，不会改写你的永久修为。`,
      '「纵然只剩一具尸骸，也要为后世众生再战一场！」',
    ].join('\n'));
    return true;
  }
  //与金角大王战斗
  async WorldBossBattle(e) {
    if (!verc({ e })) return false;
    if (e.isPrivate) return false;

    if (!(await BossIsAlive())) {
      e.reply('黑暗动乱还未到来！');
      return false;
    }
    let usr_qq=e.user_id.toString().replace("qg_","")
    usr_qq=await channel(usr_qq)
    var Time = 5;
    let now_Time = new Date().getTime(); //获取当前时间戳
    Time = parseInt(60000 * Time);
    let last_time = await redis.get('xiuxian:player:' + usr_qq + 'BOSSCD'); //获得上次的时间戳,
    last_time = parseInt(last_time);
    if (now_Time < last_time + Time) {
      let Couple_m = Math.trunc((last_time + Time - now_Time) / 60 / 1000);
      let Couple_s = Math.trunc(((last_time + Time - now_Time) % 60000) / 1000);
      e.reply('正在CD中，' + `剩余cd:  ${Couple_m}分 ${Couple_s}秒`);
      return false;
    }
    await data.existData("player", e.user_id)
    let CurrentPlayerAttributes = await data.getData("player", e.user_id);
    if (data.existData('player', usr_qq)) {
      let player = await data.getData('player', usr_qq);
      if (player.mijinglevel_id < 12) {
        e.reply('秘境体系至少达到圣人才能参与挑战');
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
          e.reply(
            '正在' + action.action + '中,剩余时间:' + m + '分' + s + '秒'
          );
          return false;
        }
      }
      if (player.当前血量 <= player.血量上限 * 0.1) {
        e.reply('你的生命早已如风中残烛，先疗伤吧，别急着参战平定黑暗动乱了');
        return false;
      }
      if (WorldBOSSBattleCD[usr_qq]) {
        let Seconds = Math.trunc(
          (300000 - (new Date().getTime() - WorldBOSSBattleCD[usr_qq])) / 1000
        );
        if (Seconds <= 300 && Seconds >= 0) {
          e.reply(
            `刚刚一战消耗了太多法力，还是先歇息一会儿吧~(剩余${Seconds}秒)`
          );
          return false;
        }
      }

          let WorldBossStatusStr = await redis.get('Xiuxian:WorldBossStatus2');
    let PlayerRecord = await redis.get('zhutianxiuxian1.0Record2');
    let WorldBossStatus = JSON.parse(WorldBossStatusStr);
    
    // ==== 新增的拦截逻辑 ====
    // 获取当前时间
    const now = new Date();
    const currentHour = now.getHours();
    
    // 检查是否在开放时间（20:00-21:00）
   // if (currentHour < 20 || currentHour >= 21) {
    //    e.reply(`此刻未到成仙路打开之时，禁区至尊还在蛰伏，成仙路将在每日20:00-21:00开启`);
    //    return false;
   // }
    
    // 检查冷却时间（24小时）
    if (WorldBossStatus.KilledTime !== -1) {
        const lastKilledTime = new Date(WorldBossStatus.KilledTime);
        const nextOpenTime = new Date(lastKilledTime.getTime() + 86400000);
        
        if (now < nextOpenTime) {
            const hours = nextOpenTime.getHours();
            const minutes = nextOpenTime.getMinutes().toString().padStart(2, '0');
            e.reply(`黑暗动乱刚刚被平定，禁区至尊还在恢复元气，下次开启时间: ${hours}:${minutes}`);
            return false;
        }
    }
    
    // 如果黑暗动乱未开启，尝试初始化
    if (WorldBossStatus.KilledTime !== -1) {
        const initResult = await InitWorldBoss(e);
        if (initResult === 0) {
            // 重新获取状态
            WorldBossStatusStr = await redis.get('Xiuxian:WorldBossStatus2');
            WorldBossStatus = JSON.parse(WorldBossStatusStr);
        } else {
            e.reply('开启黑暗动乱失败，请稍后再试');
            return false;
        }
    }
      let PlayerRecordJSON, Userid;
      if (PlayerRecord == 0) {
        let QQGroup = [],
          DamageGroup = [],
          Name = [];
        QQGroup[0] = usr_qq;
        DamageGroup[0] = 0;
        Name[0] = player.名号;
        PlayerRecordJSON = {
          QQ: QQGroup,
          TotalDamage: DamageGroup,
          Name: Name,
        };
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
        if (!Userid && Userid != 0) {
          PlayerRecordJSON.QQ[i] = usr_qq;
          PlayerRecordJSON.Name[i] = player.名号;
          PlayerRecordJSON.TotalDamage[i] = 0;
          Userid = i;
        }
      }
      let TotalDamage = 0;
      WorldBossStatus = normalizeDarkRevoltStatus(WorldBossStatus);
      const activeBoss = getActiveDarkRevoltBoss(WorldBossStatus);
      if (!activeBoss) {
        WorldBossStatus.KilledTime = WorldBossStatus.KilledTime === -1 ? Date.now() : WorldBossStatus.KilledTime;
        await redis.set('Xiuxian:WorldBossStatus2', JSON.stringify(WorldBossStatus));
        e.reply('六位至尊皆已陨落，黑暗动乱正在结算。');
        return false;
      }
      syncDarkRevoltLegacyFields(WorldBossStatus, activeBoss);
      const supreme = DARK_REVOLT_SUPREMES.find(item => item.id === activeBoss.id) || DARK_REVOLT_SUPREMES[0];
      const bossAttackMultiplier = activeBoss.isAngry ? 1.8 : activeBoss.isWeak ? 0.7 : 1;
      const Boss = {
        ...activeBoss,
        名号: activeBoss.名号,
        攻击: Math.trunc(activeBoss.攻击 * bossAttackMultiplier),
        防御: Math.trunc(activeBoss.防御 * (activeBoss.isWeak ? 0.7 : 1)),
        当前血量: activeBoss.Health,
        暴击率: activeBoss.暴击率 || 3,
        灵根: { ...supreme.root },
        学习的功法: [...(activeBoss.techniques || supreme.techniques)],
        法球倍率: activeBoss.法球倍率 || supreme.root.法球倍率,
      };
      player.法球倍率 = player.灵根?.法球倍率 || 1;
      if (WorldBOSSBattleUnLockTimer) clearTimeout(WorldBOSSBattleUnLockTimer);
      SetWorldBOSSBattleUnLockTimer(e);
      if (WorldBOSSBattleLock != 0) {
        e.reply(
          '好像有人族强者正在与禁区至尊大战，现在去怕是有未知的凶险，还是等等吧！'
        );
        return false;
      }
      WorldBOSSBattleLock = 1;
      await touchDarkRevoltActivity({
        eventId: WorldBossStatus.harvestStartedAt,
        worldYear: getCurrentWorldYear(),
      });
      const corpseRescue = await consumeDachengShengtiCorpse(usr_qq, player, Boss, WorldBossStatus);
      const suppression = applyDarkRevoltSuppression(corpseRescue.player, supreme);
      const A_player = suppression.player;
      const B_player = { ...Boss };
      if (corpseRescue.active) {
        e.reply([
          '【圣体尸骸·帝战彩蛋】',
          '大成圣体尸骸短暂接管战斗镜像，金血化拳，战力直逼大帝。',
          `本场无视${supreme.lawType}压制，剩余尸骸真灵回合：${corpseRescue.usesRemaining}`,
        ].join('\n'));
      }
      const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player);
      if (blackEmperorFormation.consumed) await Write_player(usr_qq, player);
      let Data_battle = await zd_battle(A_player, B_player);
      let msg = Data_battle.msg;
      if (blackEmperorFormation.message) msg.unshift(blackEmperorFormation.message);
      if (msg.length <= 60) await ForwardMsg(e, msg);
      else {
        let msgg = JSON.parse(JSON.stringify(msg));
        msgg.length = 60;
        await ForwardMsg(e, msgg);
        e.reply('战斗过长，仅展示部分内容');
      }
      await sleep(1000);
      if (!activeBoss.Healthmax) {
        e.reply('请联系管理员重新开启!');
        return false;
      }
      if (Data_battle.winner === 'A') {
        TotalDamage = Math.trunc(
          activeBoss.Healthmax * 0.16 +
            Harm(A_player.攻击 * 0.85, Boss.防御) * 10
        );
        damageDarkRevoltBoss(WorldBossStatus, TotalDamage, activeBoss);
        e.reply(
          `${player.名号}击败了[${Boss.名号}]，${supreme.lawType}被撼动，造成伤害${TotalDamage}`
        );
      } else if (Data_battle.winner === 'B') {
        TotalDamage = Math.trunc(
          activeBoss.Healthmax * 0.04 +
            Harm(A_player.攻击 * 0.85, Boss.防御) * 6
        );
        damageDarkRevoltBoss(WorldBossStatus, TotalDamage, activeBoss);
        e.reply(
          `${player.名号}被[${Boss.名号}]击败了，只对其造成了${TotalDamage}伤害`
        );
        player.当前血量 = corpseRescue.active
          ? Math.max(1, Math.trunc((Number(player.血量上限) || 1) * 0.18))
          : 0;
        await Write_player(usr_qq, player);
      }
      await sleep(1000);
      let random = Math.random();
       if (TotalDamage >= 0.1 * activeBoss.OriginHealth && !activeBoss.hasAscended && !activeBoss.defeated) {
                activeBoss.isAngry = 30;
                activeBoss.hasAscended = true;
                e.reply(`${supreme.quote}\n${activeBoss.名号}极尽升华，帝级本源全面复苏，狂暴持续30回合！`);
            }
            if (!activeBoss.defeated && activeBoss.Health <= activeBoss.Healthmax * 0.25) {
                activeBoss.isWeak = Math.max(activeBoss.isWeak || 0, 3);
            }
            if ( TotalDamage >= 0.15 * activeBoss.OriginHealth && activeBoss.isWeak && random <0.2) {
                e.reply(`${activeBoss.名号}施展者字秘，极尽涅槃，血量回复30%！`);
                activeBoss.Health = Math.min(activeBoss.Healthmax, activeBoss.Health + Math.trunc(activeBoss.Healthmax * 0.3));
            }
      if (player.当前血量 == 0) {
                e.reply(`很可惜您未能击败${activeBoss.名号}，反而自身重伤，再接再厉！`);
                if (random < 0.45) {
                    let ExpFormBOSS = 1000000 + data.Level_list.find(item => item.level_id === CurrentPlayerAttributes.level_id).level_id * 21000;
                    e.reply(`你在与${activeBoss.名号}的生死大战中忽然领悟到了大道真谛，修为提升${ExpFormBOSS}，血气提升${ExpFormBOSS}`);
                    CurrentPlayerAttributes.修为 += ExpFormBOSS;
                    CurrentPlayerAttributes.血气 += ExpFormBOSS;
                }
                if (random >0.1&&random < 0.35) {
                    let HPFormBOSS = 5000 + CurrentPlayerAttributes.血量上限 * 0.2;
                    if (HPFormBOSS > CurrentPlayerAttributes.血量上限) HPFormBOSS = CurrentPlayerAttributes.血量上限 - CurrentPlayerAttributes.当前血量;
                    HPFormBOSS = Math.trunc(HPFormBOSS);
                    e.reply(`你在帝战中被打的几乎身魂消散，就在这即将陨落之际，虚空大帝分心为你渡入一道本源精气，将你强行救活，并且生命恢复${HPFormBOSS}点，但他也因此被禁区至尊重创了`);
                    CurrentPlayerAttributes.当前血量 += HPFormBOSS;
                }
                if ( random  <0.1 ) {
                    const assistDamage = Math.trunc(activeBoss.Health * 0.25);
                    TotalDamage += assistDamage;
            damageDarkRevoltBoss(WorldBossStatus, assistDamage, activeBoss);
            e.reply(
              `${DARK_REVOLT_RESCUE_EVENTS.dachengShengti.quote}\n${DARK_REVOLT_RESCUE_EVENTS.yellowEmperor.quote}\n${DARK_REVOLT_RESCUE_EVENTS.holyLandWeapons.quote}\n万器共鸣与大成圣体金血一同攻向${activeBoss.名号}，造成${assistDamage}伤害，${activeBoss.名号}剩余${activeBoss.Health}。`);
                }
                if (random >0.1&& random <  0.3) {
                    const assistDamage = Math.trunc(activeBoss.Health * 0.15);
                    TotalDamage += assistDamage;
            damageDarkRevoltBoss(WorldBossStatus, assistDamage, activeBoss);
            e.reply(
              `帝战打爆无数大星，太阳圣皇真灵持极道帝兵降临；恒宇炉、虚空镜、太皇剑等圣地帝兵隔空齐鸣，对${activeBoss.名号}造成${assistDamage}伤害，${activeBoss.名号}剩余${activeBoss.Health}。`);
                }
            }
             activeBoss.isAngry ? --activeBoss.isAngry : 0;
             activeBoss.isWeak ? --activeBoss.isWeak : 0;
             syncDarkRevoltLegacyFields(WorldBossStatus);
             if (suppression.suppressed) {
               e.reply(`${supreme.lawType}降临：你的境界不足大帝，帝道威压使全属性削减70%（当前保留30%）。`);
             } else if (suppression.lawBypassed) {
               e.reply(`圣体金血贯穿皇道法则：大成圣体尸骸护持之下，本场全属性不受${supreme.lawType}压制。`);
             }
             if (activeBoss.defeated) {
               WorldBossStatus.harvestedLives = (Number(WorldBossStatus.harvestedLives) || 0) + Math.trunc(activeBoss.OriginHealth * 0.001);
               e.reply(`${activeBoss.名号}陨落！其发动动乱时，${activeBoss.harvest}\n${activeBoss.battle}`);
               const nextBoss = getActiveDarkRevoltBoss(WorldBossStatus);
               if (nextBoss) {
                 syncDarkRevoltLegacyFields(WorldBossStatus, nextBoss);
                 e.reply(`下一阶段帝战开启：${nextBoss.名号}（${nextBoss.title}）\n${nextBoss.quote}`);
               }
             }
      await sleep(1000);
      PlayerRecordJSON.TotalDamage[Userid] += TotalDamage;
      redis.set('zhutianxiuxian1.0Record2', JSON.stringify(PlayerRecordJSON));
      redis.set('Xiuxian:WorldBossStatus2', JSON.stringify(WorldBossStatus));
// 修改后的物品选择函数（使用物品池中的数量）
function getRandomItems(items, count) {
  let selectedItems = [];
  
  // 确保 items 是数组且不为空
  if (!Array.isArray(items) || items.length === 0) {
    console.error("物品池为空或无效");
    return selectedItems;
  }
  
  // 复制物品池（不修改原始数据）
  const itemPool = [...items];
  
  for (let i = 0; i < count; i++) {
    if (itemPool.length === 0) break;
    
    // 随机选择一个物品
    const randomIndex = Math.floor(Math.random() * itemPool.length);
    const item = itemPool[randomIndex];
    
    // 确保物品有效且有数量属性
    if (item && typeof item === 'object' && '数量' in item) {
      const rewardQuantity = item.数量;
      
      selectedItems.push({
        name: item.name,
        class: item.class,
        quantity: rewardQuantity
      });
      
      // 从池中移除已选物品
      itemPool.splice(randomIndex, 1);
    } else {
      console.warn("无效的物品:", item);
    }
  }
  
  return selectedItems;
}

async function addItemsToNajie(playerId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    console.warn("没有物品可添加");
    return;
  }
  
  const recipient = await Read_player(playerId);
  for (let item of items) {
    // 确保物品有效
    if (item && item.name && item.class && item.quantity !== undefined) {
      try {
        // 使用 item.quantity 作为添加物品的数量
        item.quantity = multiplySuiyunLoot(recipient, item, item.quantity);
        await Add_najie_thing(playerId, item.name, item.class, item.quantity);
      } catch (e) {
        console.error(`添加物品失败: ${item.name}`, e);
      }
    } else {
      console.warn("无效的物品对象:", item);
    }
  }
}    // 分配奖励给击杀者（最后一击的玩家）
// 分配奖励给击杀者（最后一击的玩家）
if (allDarkRevoltBossesDefeated(WorldBossStatus)) {
    // 记录击杀者
    const killerId = e.user_id;
    
    // 为击杀者分配特殊奖励
    let killerItems = getRandomItems(data.heiandongluandizhan, 2);
    await addItemsToNajie(killerId, killerItems);
    
    // 构建击杀者获得的物品消息
    let killerItemsMsg = killerItems.map(item => `${item.name}×${item.quantity}`).join(', ');
    
    e.reply([
        segment.at(killerId),
        `\n你终结了六位至尊的最后一尊，平定了黑暗动乱，保护了诸天万界的芸芸众生，受到天道青睐，天地降下福泽你获得了10000000灵石与修为血气奖励！并且在还未破碎的帝战战场中找到了以下物品: ${killerItemsMsg}`
    ]);
    
    // 更新玩家属性
    let killerPlayer = await data.getData("player", killerId);
    killerPlayer.灵石 += 10000000;
    killerPlayer.修为 += 10000000;
    killerPlayer.血气 += 10000000;
    data.setData("player", killerId, killerPlayer);
    
    // 保存击杀记录
    WorldBossStatus.KilledTime = new Date().getTime();
    redis.set('Xiuxian:WorldBossStatus2', JSON.stringify(WorldBossStatus));
    await clearDarkRevoltDestruction();
    // 处理贡献排行榜奖励
    let PlayerList = await SortPlayer(PlayerRecordJSON);
    let Show_MAX = Math.min(PlayerList.length, 20); // 最多显示20名玩家
    
    let TotalDamage = PlayerList.reduce((sum, index) => sum + PlayerRecordJSON.TotalDamage[index], 0);
    
    let Rewardmsg = ["****黑暗动乱帝战贡献排行榜****"];
    
    for (let i = 0; i < Show_MAX; i++) {
        let playerId = PlayerRecordJSON.QQ[PlayerList[i]];
        let playerName = PlayerRecordJSON.Name[PlayerList[i]];
        let damage = PlayerRecordJSON.TotalDamage[PlayerList[i]];
        
        // 计算灵石奖励（基于伤害占比）
        let rewardMoney = Math.trunc((damage / TotalDamage) * WorldBossStatus.Reward);
        rewardMoney = Math.max(1500, Math.min(rewardMoney, 1000000)); // 限制在1500-1000000之间
        
        // 更新玩家灵石
        let playerData = await data.getData("player", playerId);
        playerData.灵石 += rewardMoney;
        data.setData("player", playerId, playerData);
        
        // 根据排名分配物品
        let itemsCount = 0;
        if (i === 0) { // 伤害贡献第一名
            itemsCount = 5;
        } else if (i === 1) { // 第二名
            itemsCount = 4;
        } else if (i === 2) { // 第三名
            itemsCount = 3;
        } else if (i >= 3 && i <= 4) { // 第四、五名
            itemsCount = 2;
        } else if (i >= 5 && i <= 9) { // 第六到十名
            itemsCount = 1;
        }
        

        // 添加物品奖励
        if (itemsCount > 0) {
            let rankItems = getRandomItems(data.heiandongluandizhan, itemsCount);
            await addItemsToNajie(playerId, rankItems);
            
            const itemNames = rankItems.map(item => `${item.name}×${item.quantity}`).join(', ');
            
            let rewardMsg = `你是黑暗动乱帝战贡献榜第${i+1}名玩家，获得了以下物品: ${itemNames}`;
            
            
            e.reply([segment.at(playerId), `\n${rewardMsg}`]);
        }
        
        // 添加到排行榜消息
        Rewardmsg.push(`第${i+1}名: ${playerName} - 伤害:${damage} - 获得灵石:${rewardMoney}`);
    }
    
    // 发送排行榜消息
    await ForwardMsg(e, Rewardmsg);
}
        }
    }
}


//初始化六位至尊：六条独立血条，阶段按禁区至尊出世顺序推进
async function InitWorldBoss(e) {
  const notify = (message) => e?.reply ? e.reply(message) : console.log(`[黑暗动乱] ${message}`);
  let AverageDamageStruct = await GetAverageDamage(e);
  let player_quantity = parseInt(AverageDamageStruct.player_quantity);
  let AverageDamage = parseInt(AverageDamageStruct.AverageDamage);
  WorldBOSSBattleLock = 0;
  if (player_quantity == 0) {
    notify("你们甚至没有斩道王者以上的高手，平定黑暗动乱不是你们能参与的，继续努力再来吧！");
    return - 1;
  }
  notify(`【黑暗动乱】斩道王者以上玩家：${player_quantity}，六位至尊分别出世。`);
  notify('属性基准：练气满级 + 炼体满级 + 秘境大帝 + 仙古一级 + 帝兵倍率120 + 装备100% + 额外加成10万亿。');
  const WorldBossStatus = createDarkRevoltStatus({
    averageDamage: AverageDamage,
    playerQuantity: player_quantity,
    levels: data,
  });
  WorldBossStatus.Reward = (player_quantity < 5 ? 3_000_000 : 6_000_000) * 5;
  let PlayerRecord = 0;
  await redis.set('Xiuxian:WorldBossStatus2', JSON.stringify(WorldBossStatus));
  await redis.set('zhutianxiuxian1.0Record2', JSON.stringify(PlayerRecord));
  await initializeDarkRevoltDestruction({
    eventId: WorldBossStatus.harvestStartedAt,
    worldYear: getCurrentWorldYear(),
  });
  let msg = '【诸天位面公告】成仙路失败后的六位至尊同时出世，发动最大规模黑暗动乱：收割万灵精血、打爆位面、以血气再叩成仙路。帝道规则与皇道法则降临，低境界修士全属性削减70%。\n圣体血脉可尝试输入 #驾驭大成圣体尸骸，触发短暂叫板大帝的救场彩蛋。';
  const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
  const groupList = await redis.sMembers(redisGlKey);
    for (const group_id of groupList) {
        await pushInfo(group_id, true, msg);
    }
    return false;
}

async function pushInfo(id, is_group, msg) {
  if (is_group) {
    await Bot.pickGroup(id)
      .sendMsg(msg)
      .catch(err => {
        console.error('[黑暗动乱] 全服公告发送失败:', err?.message || err);
      });
  } else {
    await common.relpyPrivate(id, msg);
  }
}

//获取黑暗动乱是否已开启
async function BossIsAlive() {
  return (
    (await redis.get('Xiuxian:WorldBossStatus2')) &&
      (await redis.get('zhutianxiuxian1.0Record2'))
  );
}

//排序
async function SortPlayer(PlayerRecordJSON) {
  if (PlayerRecordJSON) {
    let Temp0 = JSON.parse(JSON.stringify(PlayerRecordJSON));
    let Temp = Temp0.TotalDamage;
    let SortResult = [];
    Temp.sort(function (a, b) {
      return b - a;
    });
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
}
//设置防止锁卡死的计时器
async function SetWorldBOSSBattleUnLockTimer(e) {
  WorldBOSSBattleUnLockTimer = setTimeout(() => {
    if (WorldBOSSBattleLock == 1) {
      WorldBOSSBattleLock = 0;
      e.reply('检测到战斗锁卡死，已自动修复');
      return false;
    }
  }, 30000);
}

//sleep
async function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

//获取玩家平均实力和渡劫期以上人数
async function GetAverageDamage(e) {
  let File = fs.readdirSync(data.filePathMap.player);
  File = File.filter(file => file.endsWith('.json'));
  let temp = [];
  let TotalPlayer = 0;
  for (var i = 0; i < File.length; i++) {
    let this_qq = File[i].replace('.json', '');

    let player = await data.getData('player', this_qq);
    if (player.mijinglevel_id > 12 && player.mijinglevel_id < 23 && player.lunhui == 0) {
      temp[TotalPlayer] = parseInt(player.攻击);
      if (e?.reply) e.reply(`[黑暗动乱] ${this_qq}玩家攻击:${temp[TotalPlayer]}`);
      else console.log(`[黑暗动乱] ${this_qq}玩家攻击:${temp[TotalPlayer]}`);
      TotalPlayer++;
    }
  }
  //排序
  temp.sort(function (a, b) {
    return b - a;
  });
  let AverageDamage = 0;
  if (TotalPlayer > 15)
    for (let i = 2; i < temp.length - 4; i++) AverageDamage += temp[i];
  else for (let i = 0; i < temp.length; i++) AverageDamage += temp[i];
  AverageDamage =
    TotalPlayer > 15
      ? AverageDamage / (temp.length - 6)
      : temp.length == 0
      ? 0
      : AverageDamage / temp.length;
  let res = {
    AverageDamage: AverageDamage,
    player_quantity: TotalPlayer,
  };
  return res;
}

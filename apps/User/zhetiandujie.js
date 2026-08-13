import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import path from 'path';
import {
  ZHENGDAO_ROUTES,
  getZhengdaoSuccessState,
  resolveZhengdaoRoute,
} from './zhengdaoRules.js';
import {
  getDaoGateState,
  markDaoAsEmperor,
  unlockDaoRealm,
} from './wudaoRules.js';
import {
  calculateMinggeFourRealmBonus,
  getMinggeEffectNumber,
  getMinggeEffects,
} from '../../model/mingge.js';
import {
  calculateZhetianTribulationCosts,
  rollZhetianMinggeRevival,
} from './zhetianTribulationMingge.js';
import { calculateEquippedStats } from '../../model/equipmentStats.js';
import { consumeBlackEmperorTribulationFormation } from '../../model/blackEmperor.js';
import { reduceTribulationDamageByDefense } from '../../model/tribulationDamage.js';
import { applyQuestionFortuneCost } from '../../model/redDustFortune.js';
import { PLACE_LOCATION_MAP } from '../../model/weimianTravel.js';
import { getPlayerPlaneCoordinate } from '../../model/planeCoords.js';
import {
  resetTribulationGongfaCooldowns,
  ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS,
  BODY_TRIBULATION_SHIFT,
  calcPlaneCoordinateShift,
  calcCoordinateShift,
  applyTribulationShift,
  TRIBULATION_BASE_ATK_SCALE,
  LEIDI_TRIBULATION_CONVERSION_RATE,
  LEIDI_TRIBULATION_CONVERSION_WAVES,
  canUseClowWish,
} from './zhetianTribulationRules.js';
import {
  existplayer,
  Write_player,
  Write_equipment,
  isNotNull,
  player_efficiency,
  get_random_fromARR,
  Read_player,
  bigNumberTransform,
  foundthing,
  Read_equipment,
  Add_HP,
  zd_battle,
  exist_najie_thing,
  Add_修为,
  ForwardMsg,
  Add_血气,
  __PATH,
  Add_寿元,
  Add_najie_thing,
  dujie,
  LevelTask,
  get_log_img,
  channel
} from '../../model/xiuxian.js';
import { TRIBULATION_LOCK_BUSY, withTribulationLock } from '../../model/tribulationLock.js';

const TRIBULATION_METHODS = [
  'duzhendaoLeijie',
  'shengrenleijie',
  'shengrenwangleijie',
  'dashengleijie',
  'zhundileijie',
  'command_zhengdao',
  'poWangChengDi',
];

export class zhetiandujie extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_zhetiandujie',
      dsc: '遮天渡劫系统',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#渡斩道雷劫',
          fnc: 'duzhendaoLeijie'
        },
        {
          reg: '^#渡圣人雷劫',
          fnc: 'shengrenleijie'
        },
          {
          reg: '^#渡圣人王雷劫',
          fnc: 'shengrenwangleijie' 
        },
        {
          reg: '^#渡大圣雷劫',
          fnc: 'dashengleijie'  
        },
        {
          reg: '^#渡准帝雷劫',
          fnc: 'zhundileijie'  
        },
        {
          reg:'^#证道成帝$',
          fnc:'command_zhengdao'
        },
        { 
          reg: '^#破王成帝$', 
          fnc: 'poWangChengDi' 
        },
        {
          reg: '^#(打听天机\\s*渡劫|渡劫天机)$',
          fnc: 'command_datitingtianji'
        },
        {
          reg: '^#库洛牌祈愿\\s*(@?\\S+)?\\s*$',
          fnc: 'command_kuluoqiyuan'
        }
      ],
    });

    this.gongfa = {
      "者字秘": { 
        resurrectTimes: 1,
        cooldown: 7,  
        desc: "九秘之者，生命极致，向死而生，可逆转生死"
      },
      "真凰宝术": { 
        resurrectTimes: 2, 
        cooldown: 5,  
        desc: "十凶宝术之一，凤凰涅槃，浴火重生，每滴血都是不死源泉"
      },
      "凰劫再生术": { 
        resurrectTimes: 1,
         cooldown: 10,  
        desc: "不死神凰族至高秘术，历万劫而不灭，度千难而再生"
      },
      "雷帝宝术": { 
        resurrectTimes: 1,
         cooldown: 5,  
        desc: "十凶宝术之一，执掌天劫，汲取雷劫中的生命物质"
      },
      "柳神法": { 
        resurrectTimes: 1,
         cooldown: 5,  
        desc: "仙古纪元祖祭灵的功法，习练者拥有强大的生命本源力量"
      },
          "补天术": {
        resurrectTimes: 1,
        cooldown: 9,
        desc: "补天教镇教秘术，可补天地残缺，逆转生死"
    },
    "不灭经": {
        resurrectTimes: 3,
        cooldown: 4,
        desc: "天地至高经文，肉身不灭，元神不朽"
    },
    "万化圣诀": {
        resurrectTimes: 1,
        cooldown: 9,
        desc: "狠人大帝所创秘术，化尽世间一切惊世奇术"
    },
    "涅槃仙功": {
        resurrectTimes: 1,
        cooldown: 12,
        desc: "远古流传的残缺仙功，可涅槃重生但效果有限"
    }
    };
    this.minggeRevivalAttempts = new WeakSet();
    for (const methodName of TRIBULATION_METHODS) {
      const original = this[methodName];
      if (typeof original !== 'function') continue;
      this[methodName] = async function guardedTribulation(e, ...args) {
        const playerId = String(e.user_id || '').replace('qg_', '');
        const result = await withTribulationLock(playerId, () => original.call(this, e, ...args));
        if (result === TRIBULATION_LOCK_BUSY) {
          return e.reply('【渡劫中】你已有一场渡劫正在进行，请等待结算完成。');
        }
        return result;
      };
    }
  }

// ==== 遮天风格功法复活逻辑（生命本源消耗版）====
async checkGongfaResurrection(e, player) {
    console.log('【DEBUG】开始检查复活功法，当前生命本源：', player.生命本源 || 0);

    // 命格复活每次渡劫只判定一次，不消耗生命本源，也不占用功法冷却。
    if (!this.minggeRevivalAttempts.has(player)) {
        this.minggeRevivalAttempts.add(player);
        const minggeEffects = getMinggeEffects(player, data.minggeList);
        const { chance: revivalChance, revived } = rollZhetianMinggeRevival(minggeEffects);
        if (revived) {
            const healAmount = Math.max(1, Math.floor(player.血量上限 * 0.3));
            player.当前血量 = healAmount;
            await e.reply([
                `【命格·凤凰余血】`,
                `${player.名号}体内残存的凤凰血脉骤然燃烧，于死境中重聚生机！`,
                `命格复活概率：${(revivalChance * 100).toFixed(0)}%`,
                `恢复血量：${bigNumberTransform(healAmount)}/${bigNumberTransform(player.血量上限)}`
            ].join('\n'));
            return true;
        }
    }
  
    // 初始化生命本源（如果不存在）
    player.生命本源 = player.生命本源 ?? 100; // 默认100点生命本源
  
    // ==== 检查生命本源是否足够 ====
    if (player.生命本源 <= 0) {
        await e.reply([
            `【生命本源枯竭】`,
            `${player.名号}的生命本源已经完全枯竭，`,
            `再也无法通过任何功法复活！`,
            `需寻找不死神药或天地奇物补充生命本源`
        ].join("\n"));
        return false;
    }

    // ==== 通用复活检查函数 ====
const tryResurrect = async (gongfaName, effectFunc) => {
    if (await this.checkGongfaExist(player, gongfaName) && player.生命本源 >= 50) {
        player.生命本源 -= 50;
        
        // 设置冷却（从功法配置读取冷却回合数）
        player.功法[gongfaName].冷却回合 = this.gongfa[gongfaName].cooldown;
        
        await effectFunc();
        await Write_player(e.user_id, player);
        return true;
    }
    return false;
};

    // ==== 者字秘复活 ====
    if (await tryResurrect("者字秘", async () => {
        const healAmount = Math.floor(player.血量上限 * 0.7);
        player.当前血量 = healAmount;
        
        await e.reply([
            `【者字秘·向死而生】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
             `冷却时间：${this.gongfa["者字秘"].cooldown}回合`,
            `虚空裂开，九道仙光交织成璀璨"者"字，镇压诸天万道！`,
            `「生命极尽，向死而生！」道音响彻星空`,
            `恢复血量：${healAmount}/${player.血量上限}`,
            `附加效果：`,
            `1. 接下来3道雷劫伤害减少25%`,
            `2. 每次成功减伤后恢复5%最大生命值`
        ].join("\n"));
        
        player.者字秘效果 = {
            减伤比例: 0.25,
            剩余次数: 3,
            恢复比例: 0.05
        };
    })) return true;

    // ==== 真凰宝术复活 ====
    if (await tryResurrect("真凰宝术", async () => {
        player.当前血量 = player.血量上限;
        
        await e.reply([
            `【真凰涅槃·浴火重生】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
             `冷却时间：${this.gongfa["真凰宝术"].cooldown}回合`,
            `七色神火焚尽苍穹，${player.名号}化作凤凰神卵！`,
            `「真凰不灭，历劫永存！」涅槃真义流淌`,
            `恢复效果：生命值全满`,
            `附加效果：`,
            `1. 免疫下一次致命伤害（保留10000点生命）`,
            `2. 复活后首次雷劫伤害降低50%`
        ].join("\n"));
        
        player.真凰效果 = {
            免死: true,
            阶段减伤: 0.5
        };
    })) return true;

    // ==== 雷帝宝术复活 ====
    if (await tryResurrect("雷帝宝术", async () => {
        const healAmount = Math.floor(player.血量上限 * 0.4);
        player.当前血量 = healAmount;
        
        await e.reply([
            `【雷帝宝术·劫中取生】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
             `冷却时间：${this.gongfa["雷帝宝术"].cooldown}回合`,
            `漫天雷劫被牵引，化作雷池环绕${player.名号}！`,
            `「以劫养身，以雷续命！」道音与雷暴共鸣！`,
            `恢复血量：${healAmount}/${player.血量上限}`,
            `附加效果：`,
            `1. 接下来${LEIDI_TRIBULATION_CONVERSION_WAVES}道雷劫伤害的${LEIDI_TRIBULATION_CONVERSION_RATE * 100}%转化为治疗`,
            `2. 每次转化提升10%雷系抗性`,
        ].join("\n"));
        
        player.雷帝效果 = {
            转化比例: LEIDI_TRIBULATION_CONVERSION_RATE,
            剩余次数: LEIDI_TRIBULATION_CONVERSION_WAVES,
            抗性提升: 0.1,
            当前抗性: 0
        };
    })) return true;

    // ==== 柳神法复活 ====
    if (await tryResurrect("柳神法", async () => {
        const healAmount = Math.floor(player.血量上限 * 0.6);
        player.当前血量 = healAmount;
        
        await e.reply([
            `【柳神法·生生不息】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
             `冷却时间：${this.gongfa["柳神法"].cooldown}回合`,
            `通天柳树虚影撑开雷海，枝条垂落万道霞光！`,
            `「祭灵之道，生生不息...」祭祀音回荡星空！`,
            `恢复血量：${healAmount}/${player.血量上限}`,
            `附加效果：`,
            `1. 获得3层「柳神庇护」（每层减伤20%）`,
            `2. 每秒恢复8%生命值，持续5秒`,
            `3. 免疫控制效果`,
        ].join("\n"));
        
        player.柳神效果 = {
            庇护层数: 3,
            减伤比例: 0.2,
            持续恢复: {
                回合数: 5,
                治疗量: Math.floor(player.血量上限 * 0.08)
            },
            免疫控制: true
        };
    })) return true;
    // ==== 不灭经复活 ====
    if (await tryResurrect("不灭经", async () => {
        player.当前血量 = player.血量上限;
        
        await e.reply([
            `【不灭经·肉身不朽】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
            `冷却时间：${this.gongfa["不灭经"].cooldown}回合`,
            `金色经文浮现体表，${player.名号}肉身绽放不朽光辉！`,
            `「肉身不灭，元神永存！」古老经文响彻星空`,
            `恢复效果：生命值全满`,
            `附加效果：`,
            `1. 接下来5道雷劫伤害减少40%`,
            `2. 每次受伤后恢复30%最大生命值`,
            `3. 死亡后自动触发（最多3次）`
        ].join("\n"));
        
        player.不灭经效果 = {
            减伤比例: 0.4,
            剩余次数: 5,
            恢复比例: 0.3,
            剩余复活次数: 2
        };
    })) return true;

    // ==== 补天术复活 ====
    if (await tryResurrect("补天术", async () => {
        const healAmount = Math.floor(player.血量上限 * 0.8);
        player.当前血量 = healAmount;
        
        await e.reply([
            `【补天术·逆天改命】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
            `冷却时间：${this.gongfa["补天术"].cooldown}回合`,
            `七彩神石虚影浮现，补全${player.名号}残缺的生命本源！`,
            `「补天之道，逆天而行！」补天教真言震动虚空`,
            `恢复血量：${healAmount}/${player.血量上限}`,
            `附加效果：`,
            `1. 技能冷却时间缩短20%`
        ].join("\n"));
        
        player.补天术效果 = {
            免疫控制: 3,
            冷却缩减: 0.2,
            持续时间: 3
        };
    })) return true;

    // ==== 万化圣诀复活 ====
    if (await tryResurrect("万化圣诀", async () => {
        const healAmount = Math.floor(player.血量上限 * 0.5);
        player.当前血量 = healAmount;
        
        await e.reply([
            `【万化圣诀·化死为生】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
            `冷却时间：${this.gongfa["万化圣诀"].cooldown}回合`,
            `${player.名号}周身浮现万道飞仙光，死气转化为生机！`,
            `恢复血量：${healAmount}/${player.血量上限}`,
            `附加效果：`,
            `1. 免疫下一次致命伤害（保留10000点生命）`,
        ].join("\n"));
        
        player.万化圣诀效果 = {
            剩余次数: 3,
            免死: true
        };
    })) return true;

    // ==== 涅槃仙功复活 ====
    if (await tryResurrect("涅槃仙功", async () => {
        const healAmount = Math.floor(player.血量上限 * 0.3);
        player.当前血量 = healAmount;
        
        await e.reply([
            `【涅槃仙功】`,
            `消耗50点生命本源（剩余：${player.生命本源}）`,
            `冷却时间：${this.gongfa["涅槃仙功"].cooldown}回合`,
            `${player.名号}周身涅槃符文，涅槃符文勉力维持生机！`,
            `恢复血量：${healAmount}/${player.血量上限}`,
            `附加效果：`,
            `1. 接下来2次攻击伤害降低20%`,
        ].join("\n"));
        
        player.涅槃仙功效果 = {
            减伤比例: 0.2,
            剩余次数: 2,
            本源恢复减半: true
        };
    })) return true;
    // ==== 没有可用复活功法 ====
    console.log('【DEBUG】没有可用复活功法');
    await e.reply([
        `【道基崩碎·帝路断绝】`,
        `${player.名号}周身大道符文寸寸崩裂！`,
        `需满足以下条件方可再战帝路：`,
        `1. 生命本源≥50（当前：${player.生命本源}）`,
        `2. 拥有可用的复活功法`,
    ].join("\n"));
    
    player.当前血量 = 1;
    player.修为 *= 0.7;
    player.血气 *= 0.7;
    await Write_player(e.user_id, player);
    return false;
}
  // ==== 功法检查方法 ====
async checkGongfaExist(player, gongfaName) {
    console.log(`【功法检查】${gongfaName}`, 
        `冷却回合：${player.功法?.[gongfaName]?.冷却回合 ?? 0}`);

    // 初始化数据结构
    player.功法 = player.功法 || {};
    player.学习的功法 = player.学习的功法 || [];
    
    // 检查是否学习过该功法
    if (!player.学习的功法.includes(gongfaName)) {
        return false;
    }
    
    // 初始化功法数据（如果未初始化）
    player.功法[gongfaName] = player.功法[gongfaName] || {
        冷却回合: 0  // 默认无冷却
    };
    
    // 最终判定：无冷却即可使用
    return player.功法[gongfaName].冷却回合 <= 0;
}

//  渡斩道雷劫
async duzhendaoLeijie(e) {
  if (!e.isGroup) return e.reply('需在群聊中渡劫');

  const usr_qq = e.user_id.toString().replace('qg_', '');
  const player = await Read_player(usr_qq);
  const equipment = await Read_equipment(usr_qq);

  /* ========== 基础校验 ========== */
  if (player.mijinglevel_id >= 11) return e.reply('你早已成就斩道王者，不可重复证道');
  if (player.mijinglevel_id < 10) {
    return e.reply([
      `「欲斩己道，先成圣主！」`,
      `${player.名号}当前境界仅为${player.mijinglevel_id}，`,
      `需达到圣主巅峰方可引动斩道劫`
    ].join('\n'));
  }

  /* ========== 仙道潜力检查（渡斩道雷劫=1点） ========== */
  {
    const potentialCost = applyQuestionFortuneCost(player, 1);
    const currentPotential = player.仙道潜力 || 0;
    if (currentPotential < potentialCost) {
      return e.reply([
        `【仙道潜力不足·渡劫受阻】`,
        `${player.名号}欲引动斩道劫，却感仙道潜力枯竭，天雷拒绝降临！`,
        `当前仙道潜力：${currentPotential} 点`,
        `渡斩道雷劫所需：${potentialCost} 点`,
        `「无潜力者，天劫不降，只能蛰伏等待机缘！」`
      ].join('\n'));
    }
  }
  /* ========== 仙道潜力检查结束 ========== */

  /* ========== 时代系数 ========== */
  const set = config.getConfig('xiuxian', 'xiuxian');
  const currentEra = set.Era?.current || { index: 0, years: 0 };
  const eraCostRates = [0.7, 0.8, 1.0, 1.5, 2.0];
  const eraDifficultyRates = [0.1, 0.3, 1, 2, 3];
  const eraName = ['神话时代', '太古时代', '天命时代', '末法时代', '绝灵时代'][currentEra.index];
  const costRate = eraCostRates[currentEra.index];
  const difficultyRate = eraDifficultyRates[currentEra.index];

  /* ========== 资源检查 ========== */
  const baseCost = Math.pow(2, 9) * 500000;
  const actualBloodCost = applyQuestionFortuneCost(player, Math.ceil(baseCost * costRate));
  const actualCost = this.getMinggeCultivationCost(player, actualBloodCost);
  const minggeCostLine = this.getMinggeCostLine(player, actualBloodCost);
  if (player.修为 < actualCost || player.血气 < actualBloodCost) {
    return e.reply([
      `资源不足渡斩道劫！`,
      `需求修为：${actualCost.toLocaleString()}`,
      `需求血气：${actualBloodCost.toLocaleString()}`,
      ...(minggeCostLine ? [minggeCostLine] : []),
      `当前修为：${player.修为.toLocaleString()}`,
      `当前血气：${player.血气.toLocaleString()}`
    ].join('\n'));
  }

  /* ========== 扣资源 ========== */
  player.修为 -= actualCost;
  player.血气 -= actualBloodCost;
  await Write_player(usr_qq, player);

  // ===== 天道排斥外物，进入渡劫状态 =====
  const _tribSnap = this.enterTribulationState(player, equipment);

  // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
  const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

  /* ========== 阶段定义 ========== */
  const stages = [
    {
      name: '道心拷问',
      waves: 9,
      baseMul: 0.10,          // 基于玩家攻击的倍数
      desc: [
        '斩道第一关，直指本心！',
        '心魔幻境浮现，拷问修士道心。',
        '共 9 道精神劫雷，每道递增 3 %。'
      ]
    },
    {
      name: '法则枷锁',
      waves: 9,
      baseMul: 0.15,
      desc: [
        '斩道第二关，万道化锁！',
        '大道链条贯穿躯体，封锁五大秘境。',
        '共 9 道道则枷锁，肉身与道基双重考验。'
      ]
    },
    {
      name: '古今道影',
      waves: 9,
      baseMul: 0.25,
      desc: [
        '斩道第三关，与古战今！',
        '时间长河浮现古代斩道者虚影，同境无敌。',
        '共 9 位道影，携往昔天骄之威轮番镇杀。'
      ]
    },
    {
      name: '斩道天刀',
      waves: 1,
      baseMul: 0.99,          // 基于血量上限
      useHP: true,            // 标志：按血量上限计算
      desc: [
        '斩道终极关，天刀灭形！',
        '苍穹裂开，斩道天刀携天道之威劈落。',
        '一刀 99 % 血限，九死一生！'
      ]
    }
  ];

  /* ========== 开战报 ========== */
  let battleLog = [
    `【斩道劫启·大道共鸣】`,
    `${player.名号}盘坐星空，五大秘境齐鸣！`,
    `「我之道，当斩尽世间枷锁！」`,
    `九重天降下斩道神雷，欲磨灭逆天者！`,
    `当前时代：${eraName}（消耗系数 ${costRate}，难度系数 ${difficultyRate}）`,
    `消耗修为：${actualCost.toLocaleString()}｜消耗血气：${actualBloodCost.toLocaleString()}`,
    ...(minggeCostLine ? [minggeCostLine] : [])
  ];
  await this.broadcastToAll(player,battleLog.join('\n'));
  battleLog = [];

  /* ========== 逐阶段 ========== */
  for (const [idx, stage] of stages.entries()) {
    battleLog.push(`【第 ${idx + 1} 阶段：${stage.name}】`);
    battleLog.push(...stage.desc);
    await this.broadcastToAll(player,battleLog.join('\n'));
    battleLog = [];

    for (let wave = 1; wave <= stage.waves; wave++) {
      this.clearTempEffects(player);
      this.updateCooldowns(player);

      /* ---- 计算基础伤害 ---- */
      let base = stage.useHP
        ? player.血量上限 * stage.baseMul * (1 + 0.03 * wave)
          * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.斩道
        : maxAtk * stage.baseMul * (1 + 0.03 * wave) * difficultyRate
          * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.斩道;

      /* ---- 功法/灵根/帝兵/时代 统一结算 ---- */
      const { damage: finalDamage, messages } = await this.applyTribulationDamage(player, base, equipment);
      player.当前血量 = Math.max(1, player.当前血量 - finalDamage);

      /* ---- 日志 ---- */
      battleLog.push(
        `第 ${wave} 道劫：`,
        `造成 ${bigNumberTransform(finalDamage)} 点劫伤`,
        `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
      );
      if (messages.length) battleLog.push(...messages);

      /* ---- 持续恢复 ---- */
      if (player.柳神效果?.持续恢复?.回合数 > 0) {
        const heal = player.柳神效果.持续恢复.治疗量;
        player.当前血量 = Math.min(player.血量上限, player.当前血量 + heal);
        player.柳神效果.持续恢复.回合数--;
        battleLog.push(`【生命复苏】恢复 ${heal} 点生命`);
      }

      /* ---- 濒死复活 ---- */
      if (player.当前血量 <= 1) {
        const resurrected = await this.checkGongfaResurrection(e, player);
        if (!resurrected) {
          /* 失败惩罚 */
          player.修为 *= 0.6;
          player.血气 *= 0.6;
          player.道伤 = (player.道伤 || 0) + 2;
          battleLog.push(
            `【斩道失败】道基崩碎，从星空坠落！`,
            `修为、血气折损 40 %，道伤 +2（当前 ${player.道伤}）`
          );
          this.clearTempEffects(player);
          await Write_player(usr_qq, player);
          await this.broadcastToAll(player,battleLog.join('\n'));
          return;
        }
        battleLog.push('【逆天续命】重燃生命之火！');
      }

      await Write_player(usr_qq, player);
      await this.broadcastToAll(player,battleLog.join('\n'));
      battleLog = [];

      /* ---- 间隔 ---- */
      if (wave < stage.waves) await new Promise(r => setTimeout(r, 8000));
    }

    /* ------ 阶段奖励 ------ */
    if (player.当前血量 <= 1) break;          // 已失败
    battleLog.push(`成功渡过 ${stage.name}！`);
    if (idx === 0) {                            // 阶段 1 奖励
      player.攻击 = Math.floor(player.攻击 * 1.05);
      battleLog.push('【道心稳固】攻击提升 5 %');
    } else if (idx === 1) {                     // 阶段 2 奖励
      player.防御 = Math.floor(player.防御 * 1.05);
      battleLog.push('【枷锁破碎】防御提升 5 %');
    } else if (idx === 2) {                     // 阶段 3 奖励
      player.血量上限 = Math.floor(player.血量上限 * 1.05);
      battleLog.push('【战胜古影】生命上限提升 5 %');
    }

    if (idx < stages.length - 1) {
      await this.broadcastToAll(player,battleLog.join('\n'));
      battleLog = [];
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  /* ========== 结果判定 ========== */
  if (player.当前血量 > 1) {
    /* ---- 晋升斩道王者 ---- */
    player.mijinglevel_id = 11;
    unlockDaoRealm(player, 11);
    player.道伤 = 0;
    player.攻击 = Math.floor(player.攻击 * 1.3);
    player.防御 = Math.floor(player.防御 * 1.3);
    player.血量上限 = Math.floor(player.血量上限 * 1.3);
    player.当前血量 = player.血量上限;
    await Add_寿元(usr_qq, 500);
    
    // 扣除仙道潜力（渡斩道=1点）
    player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 1));

    battleLog.push(
      `【斩道成功】`,
      `${player.名号}斩断大道枷锁，五大秘境绽放不朽神光！`,
      `「从此我命由我不由天！」`,
      `攻击、防御、生命上限提升 30 %，寿元 +500`
    );

    /* ---- 本命帝兵淬炼 ---- */
    if (equipment.帝兵?.author_name === player.id && !equipment.帝兵.斩道王兵) {
      const 增益 = actualCost * 0.3;
      equipment.帝兵.atk += Math.floor(增益 * 0.5);
      equipment.帝兵.def += Math.floor(增益 * 0.5);
      equipment.帝兵.HP += Math.floor(增益 * 0.5);
      equipment.帝兵.全属性 = (equipment.帝兵.全属性 || 0) + 5;
      equipment.帝兵.斩道王兵 = true;
      await Write_equipment(usr_qq, equipment);
      battleLog.push(
        `${player.名号}的本命帝兵${equipment.帝兵.name}经历斩道劫淬炼`,
        `攻击 +${bigNumberTransform(增益 * 0.5)}`,
        `防御 +${bigNumberTransform(增益 * 0.5)}`,
        `生命 +${bigNumberTransform(增益 * 0.5)}`,
        `全属性 +5`
      );
    }
  }

  this.clearTempEffects(player);
  await Write_player(usr_qq, player);
  await this.broadcastToAll(player,battleLog.join('\n'));
  // ===== 渡劫结束，重算全装属性 =====
  await this.exitTribulationState(player, _tribSnap, usr_qq, equipment);
}


// ==== 时代消耗系数 ====
getEraCostFactor() {
    const eraIndex = config.getConfig('xiuxian', 'xiuxian').Era?.current?.index || 0;
    return [0.7, 0.8, 1.0, 1.5, 2.0][eraIndex];
}

async checkWudaoGate(e, player, usr_qq, realmId) {
    const gate = getDaoGateState(player, realmId);
    if (gate.changed) await Write_player(usr_qq, player);
    if (gate.ok) return true;

    await e.reply([
      `【${gate.rule.name}未圆·渡劫受阻】`,
      `${player.名号}欲引动${gate.rule.nextRealm}雷劫，却感自身之道尚有残缺！`,
      `当前进度：${gate.exp}/${gate.rule.targetExp}（${gate.stage.name}）`,
      `需将${gate.rule.name}修至【圆满】，方可继续前行。`,
      `发送#悟道参悟己道，#我的道途查看完整进度。`
    ].join('\n'));
    return false;
}
  // ==== 渡圣人雷劫主逻辑（修复版）====
  async shengrenleijie(e) {
    if (!e.isGroup) return e.reply('需在群聊中渡劫');
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
    console.log('【DEBUG】开始渡劫，玩家初始状态：', JSON.stringify({
      名号: player.名号,
      境界: player.mijinglevel_id,
      血量: `${player.当前血量}/${player.血量上限}`,
      功法: player.功法
    }));
        if (player.mijinglevel_id >= 12) {
        e.reply(`你早已成就圣人，不可重复证道`);
        return false;
    }
    // ==== 境界检查 ====
    if (player.mijinglevel_id < 11) {
      return e.reply([
        `「欲渡圣劫，先入斩道王者！」`,
        `${player.名号}当前境界仅为${player.mijinglevel_id}，`,
        `需突破至斩道王者方可引动圣人劫`
      ].join('\n'));
    }
    
    /* ========== 仙道潜力检查（渡圣人雷劫=2点） ========== */
    {
      const potentialCost = applyQuestionFortuneCost(player, 2);
      const currentPotential = player.仙道潜力 || 0;
      if (currentPotential < potentialCost) {
        return e.reply([
          `【仙道潜力不足·渡劫受阻】`,
          `${player.名号}欲引动圣人劫，却感仙道潜力枯竭，天雷拒绝降临！`,
          `当前仙道潜力：${currentPotential} 点`,
          `渡圣人雷劫所需：${potentialCost} 点`,
          `「无潜力者，天劫不降，只能蛰伏等待机缘！」`
        ].join('\n'));
      }
    }
    /* ========== 仙道潜力检查结束 ========== */

    if (!(await this.checkWudaoGate(e, player, usr_qq, 11))) return false;

    // ==== 时代系统配置 ====
    const set = config.getConfig('xiuxian', 'xiuxian');
    const currentEra = set.Era?.current || { index: 0, years: 0 };
    const eraCostRates = [0.75, 0.8, 1.0, 2.0, 3.0];
    const eraDifficultyRates = [0.1, 0.3, 1, 2, 3];
    const eraNames = ["神话时代", "太古时代", "天命时代", "末法时代", "绝灵时代"];
    
    const difficultyRate = eraDifficultyRates[currentEra.index];
    const costRate = eraCostRates[currentEra.index];
    const eraName = eraNames[currentEra.index];
    const costModifier = costRate !== 1.0 ? `(×${costRate})` : "";

    // ==== 资源检查 ====
    const base_need_exp = Math.pow(2, 11) * 2000000;
    const actual_blood_need = applyQuestionFortuneCost(player, Math.ceil(base_need_exp * costRate));
    const actual_need_exp = this.getMinggeCultivationCost(player, actual_blood_need);
    const minggeCostLine = this.getMinggeCostLine(player, actual_blood_need);
    const exp2 = Math.max(0, actual_need_exp - player.修为);
    const exp3 = Math.max(0, actual_blood_need - player.血气);

    if (player.修为 < actual_need_exp) {
      return e.reply([
        `修为不足以渡圣人劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
        ...(minggeCostLine ? [minggeCostLine] : []),
        `还需修为: ${exp2.toLocaleString()}`
      ].join("\n"));
    }

    if (player.血气 < actual_blood_need) {
      return e.reply([
        `血气不足以渡圣人劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_blood_need.toLocaleString()} ${costModifier}`,
        `还需血气: ${exp3.toLocaleString()}`
      ].join("\n"));
    }

    // ==== 扣除资源 ====
    player.修为 -= actual_need_exp;
    player.血气 -= actual_blood_need;
    
    // ===== 天道排斥外物，进入渡劫状态 =====
    const _tribSnap2 = this.enterTribulationState(player, equipment);

    // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
    const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

    // ==== 开始渡劫 ====
    let battleLog = [
      `【圣人劫启·星域震动】`,
      `${player.名号}仰天长啸，浑身精气沸腾，冲击圣人壁垒！`,
      `整片星域的法则被搅动，宇宙本源降下无量雷劫！`,
      `「轰！」第一道雷光便劈碎陨星，照亮黑暗宇宙！`,
      `当前时代：${eraName}`,
      `消耗修为：${actual_need_exp.toLocaleString()}`,
      `消耗血气：${actual_blood_need.toLocaleString()}`,
      ...(minggeCostLine ? [minggeCostLine] : [])
    ];

    const stages = [
      { 
        name: "毁灭雷海", 
        waves: 9,
        baseDamage: maxAtk * 0.05 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人,
        desc: [
          `天穹崩塌，无穷雷海倾泻而下！`,
          `共9道毁灭雷光，每道威力递增3%`,
          `雷海中沉浮着古老星骸，裹挟灭世之威`
        ]
      },
      {
        name: "先天道图",
        waves: 9,
        baseDamage: maxAtk * 0.15 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人,
        desc: [
          `雷劫演化先天道图，由大道符文交织`,
          `9轮道图镇压，磨灭渡劫者道基`,
          `图中走出模糊身影，抬手镇压万古青天`
        ]
      },
      {
        name: "圣贤烙印",
        waves: 9,
        baseDamage: maxAtk * 0.4 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人,
        desc: [
          `时间长河泛起涟漪，古之圣贤显现`,
          `9位同阶无敌者轮番出手`,
          `「与古今圣贤对决，方证己道！」`
        ]
      },
      {
        name: "天庭镇杀",
        waves: 9,
        baseDamage: maxAtk * 1 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人,
        desc: [
          `九重天阙降临，天庭宫阙镇压而下`,
          `9道帝器虚影贯穿古今`,
          `「天庭不容逆天者！」至强一击`
        ]
      }
    ];

// ==== 分阶段渡劫（15道雷劫/阶段）====
for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
  const stage = stages[stageIndex];
  
  battleLog.push(`【第${stageIndex + 1}阶段：${stage.name}】`);
  battleLog.push(...stage.desc);
  
  for (let wave = 1; wave <= 9; wave++) {
    this.clearTempEffects(player);
    
    const baseDamage = stage.baseDamage * (1 + 0.02 * wave);
    const { damage: finalDamage, messages } = await this.applyTribulationDamage(player, baseDamage,equipment);
    player.当前血量 = Math.max(1, player.当前血量 - finalDamage);
     // 在每道雷劫处理完毕后添加 ↓
    this.updateCooldowns(player); // 更新功法冷却


    battleLog.push(
       `${player.名号}`,
        `第${wave}道雷劫：`,
      `你的帝兵${equipment.帝兵.name}在雷海中沉浮`,
      `雷劫对你造成${bigNumberTransform(finalDamage)}点劫伤！`,
     `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
    );
    
    if (messages.length > 0) {
      battleLog.push(...messages);
    }
    
    if (player.柳神效果?.持续恢复 && player.柳神效果.持续恢复.回合数 > 0) {
      const heal = player.柳神效果.持续恢复.治疗量;
      player.当前血量 = Math.min(player.血量上限, player.当前血量 + heal);
      player.柳神效果.持续恢复.回合数--;
      battleLog.push(`【生命复苏】恢复${heal}点生命`);
    }
    
          // ==== 检查死亡与复活 ====
    if (player.当前血量 <= 1) {
        const resurrected = await this.checkGongfaResurrection(e, player);
        if (resurrected) {
            battleLog.push(`【逆转生死,欺瞒天地】${player.名号}以无上秘法成功复活，并避开第${wave}道劫数！`);
            await Write_player(usr_qq, player);
            await this.broadcastToAll(player,battleLog.join('\n'));
            battleLog = [];
            
            // 直接进入下一道劫难
            continue;
        } else {
            break;
        }
    }
    
    // ==== 每道雷劫间隔10秒 ====
    if (wave < 9) {
      await Write_player(usr_qq, player);
      await this.broadcastToAll(player,battleLog.join('\n'));
      battleLog = [];
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒间隔
    }
  }
  
  if (player.当前血量 <= 1) break;
  
  battleLog.push(`成功渡过${stage.name}！`);
  
  if (stageIndex < stages.length - 1) {
    await Write_player(usr_qq, player);
    await this.broadcastToAll(player,battleLog.join('\n'));
    battleLog = [];
    await new Promise(resolve => setTimeout(resolve, 3000)); // 阶段间3秒间隔
  }
}

    // ==== 渡劫结果判定 ====
    if (player.当前血量 > 1) {
      player.mijinglevel_id = 12;
      unlockDaoRealm(player, 12);
      player.道伤=0;
      // 扣除仙道潜力（渡圣人=2点）
      player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 2));
      battleLog.push(`【劫尽成圣】`);
      battleLog.push(`雷劫散去，${player.名号}沐浴仙光重生！`);
      battleLog.push(`破碎的躯体重组，每一滴血都蕴含圣道法则，`);
      battleLog.push(`举手投足间可摘星拿月，横渡宇宙边荒！`);
      battleLog.push(`「这一世，我为圣！」道音响彻三千州！`);
      if (equipment.帝兵&&equipment.帝兵.author_name&&!equipment.帝兵.圣人&&equipment.帝兵.author_name == player.id) {
const 淬体增益 = actual_need_exp * 0.3;
    equipment.帝兵.atk += Math.floor(淬体增益 * 0.5);
    equipment.帝兵.def += Math.floor(淬体增益 * 0.5);
    equipment.帝兵.HP += Math.floor(淬体增益 * 0.5);
    equipment.帝兵.全属性 += 5;
    equipment.帝兵.圣人 = true;
     await Write_equipment(usr_qq, equipment);
    battleLog.push(
        `${player.名号}的本命帝兵${equipment.帝兵.name}吸收${bigNumberTransform(淬体增益)}雷劫精华`,
        `攻击永久+${bigNumberTransform(淬体增益 * 0.5)}`,
        `防御永久+${bigNumberTransform(淬体增益 * 0.5)}`,
        `生命永久+${bigNumberTransform(淬体增益 * 0.5)}`,
        `全属性增加至${equipment.帝兵.全属性}`
    );
}
    } else {
      battleLog.push(`【渡劫失败】`);
      battleLog.push(`${player.名号}被雷劫劈碎道果，从星空坠落！`);
      battleLog.push(`圣道符文黯淡，需寻不死神药修复伤体，`);
      battleLog.push(`再积累${bigNumberTransform(actual_need_exp * 2)}修为方可重渡此劫！`);
      player.道伤 = (player.道伤 || 0) + 1;
      battleLog.push(`当前道伤：${player.道伤}！`);
      player.修为 *= 0.7;
      player.血气 *= 0.7;
    }

    this.clearTempEffects(player);
    await Write_player(usr_qq, player);
    e.reply(battleLog.join('\n'));
    // ===== 渡劫结束，重算全装属性 =====
    await this.exitTribulationState(player, _tribSnap2, usr_qq, equipment);
  }
// ==== 渡圣人王雷劫主逻辑 ====
async shengrenwangleijie(e) {
    if (!e.isGroup) return e.reply('需在群聊中渡劫');
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
        if (player.mijinglevel_id >= 13) {
        e.reply(`你早已成就圣人王，不可重复证道`);
        return false;
    }
    // ==== 境界检查 ====
    if (player.mijinglevel_id < 12) {
      return e.reply([
        `「欲渡圣王劫，先成圣人位！」`,
        `${player.名号}当前境界仅为${player.mijinglevel_id}，`,
        `需先渡过圣人劫，成就圣人之位方可引动圣人王劫`
      ].join('\n'));
    }
    
    /* ========== 仙道潜力检查（渡圣人王雷劫=3点） ========== */
    {
      const potentialCost = applyQuestionFortuneCost(player, 3);
      const currentPotential = player.仙道潜力 || 0;
      if (currentPotential < potentialCost) {
        return e.reply([
          `【仙道潜力不足·渡劫受阻】`,
          `${player.名号}欲引动圣人王劫，却感仙道潜力枯竭，天雷拒绝降临！`,
          `当前仙道潜力：${currentPotential} 点`,
          `渡圣人王雷劫所需：${potentialCost} 点`,
          `「无潜力者，天劫不降，只能蛰伏等待机缘！」`
        ].join('\n'));
      }
    }
    /* ========== 仙道潜力检查结束 ========== */

    if (!(await this.checkWudaoGate(e, player, usr_qq, 12))) return false;

    // ==== 时代系统配置 ====
    const set = config.getConfig('xiuxian', 'xiuxian');
    const currentEra = set.Era?.current || { index: 0, years: 0 };
    const eraCostRates = [1.0, 1.2, 1.5, 2.5, 4.0]; // 圣人王劫消耗更大
    const eraDifficultyRates = [0.1, 0.3, 1, 2, 3];
    const eraNames = ["神话时代", "太古时代", "天命时代", "末法时代", "绝灵时代"];
    
    const difficultyRate = eraDifficultyRates[currentEra.index];
    const costRate = eraCostRates[currentEra.index];
    const eraName = eraNames[currentEra.index];
    const costModifier = costRate !== 1.0 ? `(×${costRate})` : "";

    // ==== 资源检查 ====
    const base_need_exp = Math.pow(2, 12) * 2000000; // 圣人王劫消耗更大
    const actual_blood_need = applyQuestionFortuneCost(player, Math.ceil(base_need_exp * costRate));
    const actual_need_exp = this.getMinggeCultivationCost(player, actual_blood_need);
    const minggeCostLine = this.getMinggeCostLine(player, actual_blood_need);
    const exp2 = Math.max(0, actual_need_exp - player.修为);
    const exp3 = Math.max(0, actual_blood_need - player.血气);

    if (player.修为 < actual_need_exp) {
      return e.reply([
        `修为不足以渡圣人王劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
        ...(minggeCostLine ? [minggeCostLine] : []),
        `还需修为: ${exp2.toLocaleString()}`
      ].join("\n"));
    }

    if (player.血气 < actual_blood_need) {
      return e.reply([
        `血气不足以渡圣人王劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_blood_need.toLocaleString()} ${costModifier}`,
        `还需血气: ${exp3.toLocaleString()}`
      ].join("\n"));
    }

    // ==== 扣除资源 ====
    player.修为 -= actual_need_exp;
    player.血气 -= actual_blood_need;
    
    // ===== 天道排斥外物，进入渡劫状态 =====
    const _tribSnap3 = this.enterTribulationState(player, equipment);

    // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
    const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

    // ==== 开始渡劫 ====
    let battleLog = [
      `【圣人王劫启·星域崩塌】`,
      `${player.名号}屹立星空，圣人之威撼动诸天星辰！`,
      `整片星域的大道法则沸腾，宇宙边荒都在颤抖！`,
      `「轰隆！」雷劫未至，已有无数小星辰承受不住威压而崩碎！`,
      `当前时代：${eraName}`,
      `消耗修为：${actual_need_exp.toLocaleString()}`,
      `消耗血气：${actual_blood_need.toLocaleString()}`,
      ...(minggeCostLine ? [minggeCostLine] : [])
    ];

    // ==== 圣人王劫阶段 ====
    const stages = [
      { 
        name: "九重仙劫", 
        waves: 9,
        baseDamage: maxAtk * 0.2 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人王,
        desc: [
          `九重天阙降临，每一重都代表一种极致天罚！`,
          `混沌雷海、五行仙光、阴阳道图、时空碎片...`,
          `九重天劫合一，欲要磨灭逆天者！`
        ],
        special: async (wave, player) => {
          const specialEffects = [
            { name: "混沌雷池", damageMult: 1.5, desc: "混沌气弥漫，雷池中沉浮着开天前的景象" },
            { name: "五行仙光", damageMult: 1.3, desc: "五色仙光刷落，磨灭万物，重演地水火风" },
            { name: "阴阳道图", damageMult: 1.4, desc: "阴阳鱼旋转，演化生死奥义，磨灭圣道法则" },
            { name: "时空碎片", damageMult: 1.6, desc: "时间与空间碎片飞舞，割裂永恒，贯穿古今未来" }
          ];
          
          const effect = specialEffects[wave % specialEffects.length];
          return {
            damage: effect.damageMult,
            message: `【${effect.name}】${effect.desc}，伤害提升${(effect.damageMult-1)*100}%`
          };
        }
      },
         {
        name: "心魔劫",
        waves: 9,
        baseDamage: maxAtk * 0.3 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人王,
        desc: [
          `心魔丛生，过往遗憾与心结具现化！`,
          `亲人、爱人、仇敌、道心漏洞...`,
          `最大的敌人往往是自己，战胜心魔方能证道！`
        ],
        special: async (wave, player) => {
          // 心魔劫特殊效果：直接攻击道心，可能造成额外效果
          const heartDevils = [
            { effect: "道心不稳", desc: "看见已故亲人，道心波动，全属性暂时降低10%" },
            { effect: "心魔入侵", desc: "内心恐惧具现，下一次伤害翻倍" },
            { effect: "往事重现", desc: "修炼路上的遗憾重现，真气紊乱" },
            { effect: "未来片段", desc: "看见自己证道失败的未来，心生恐惧" }
          ];
          
          const devil = heartDevils[wave % heartDevils.length];
          
          // 实际应用效果
          if (devil.effect === "道心不稳") {
            player.攻击 *= 2;
            
          }
          
          return {
            damage: 1.2,
            message: `【心魔劫】${devil.desc}`
          };
        }
      },
      {
        name: "肉身劫",
        waves: 9,
        baseDamage: maxAtk * 0.4 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人王,
        desc: [
          `专门针对肉身的考验，万道锤炼圣体！`,
          `不灭经文化作枷锁，大道符文烙印血肉，`,
          `要么在万道锤炼中升华，要么肉身崩碎！`
        ],
        special: async (wave, player) => {
          // 肉身劫特殊效果：对肉身有额外要求，但成功后也有额外奖励
          const bodyTests = [
            { test: "筋骨重组", desc: "筋骨寸寸断裂后重组，痛苦万分" },
            { test: "血脉沸腾", desc: "血脉沸腾如岩浆，洗涤杂质" },
            { test: "窍穴洞开", desc: "周身窍穴被强行洞开，吸纳天地精华" },
            { test: "神魂淬炼", desc: "神魂离体接受雷劫淬炼，危险至极" }
          ];
          
          const test = bodyTests[wave % bodyTests.length];
          
          // 根据玩家体质决定效果
          const isStrongBody = player.灵根?.type?.includes("圣体") || 
                              player.灵根?.type?.includes("神体");
                              
          if (isStrongBody) {
            // 强大体质获得增益
            player.防御 *= 1.05;
            return {
              damage: 0.9,
              message: `【${test.test}】${test.desc}，特殊体质适应锤炼，防御提升5%`
            };
          } else {
            // 普通体质承受额外伤害
            return {
              damage: 1.3,
              message: `【${test.test}】${test.desc}，肉身不足，承受额外伤害`
            };
          }
        }
      },
      {
        name: "少年大帝烙印",
        waves: 9,
        baseDamage: maxAtk * 0.6 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人王,
        desc: [
          `时间长河奔腾，九位少年大帝从过去走来！`,
          `虚空大帝、恒宇大帝、无始大帝、狠人大帝...`,
          `每一位都曾无敌于一个时代，同阶无敌的存在！`
        ],
        special: async (wave, player) => {
          const emperors = [
            { name: "虚空大帝", skill: "虚空经", desc: "虚空之道，无处不在，又无处可在" },
            { name: "恒宇大帝", skill: "恒宇经", desc: "炉养百经，熔炼万道，一道破万法" },
            { name: "无始大帝", skill: "无始经", desc: "无始亦无终，一手遮天，镇压万古" },
            { name: "狠人大帝", skill: "吞天魔功", desc: "一念花开，君临天下，飞仙之力破灭万法" },
            { name: "青帝", skill: "妖帝九斩", desc: "一株青莲摇动，万古青天一株莲" },
            { name: "太阳圣皇", skill: "太阳真经", desc: "太阳圣力熔炼星空，至阳至刚" },
            { name: "太阴人皇", skill: "太阴真经", desc: "太阴圣力冻结时空，至阴至寒" },
            { name: "阿弥陀佛", skill: "佛法无边", desc: "佛光普照，度化众生，掌中佛国" },
            { name: "斗战圣皇", skill: "斗战圣法", desc: "战意滔天，斗战圣法演化诸天神通" }
          ];
          
          const emperor = emperors[wave % emperors.length];
          return {
            damage: 1.8 + (wave * 0.1),
            message: `【${emperor.name}】${emperor.desc}，施展${emperor.skill}！`
          };
        }
      },
   
      {
        name: "帝兵劫",
        waves: 9,
        baseDamage: maxAtk * 1 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.圣人王,
        desc: [
          `雷劫演化极道帝兵，进行终极攻伐！`,
          `虚空镜、恒宇炉、无始钟、吞天魔罐...`,
          `极道神威贯穿宇宙，这不是考验，而是绝杀！`
        ],
        special: async (wave, player) => {
          const imperialWeapons = [
            { name: "虚空镜", effect: "放逐虚空", desc: "镜光照耀，将被击中的部位放逐到未知虚空" },
            { name: "恒宇炉", effect: "熔炼万道", desc: "炉火滔天，熔炼对手的道与法" },
            { name: "无始钟", effect: "镇压时空", desc: "钟声一响，时空凝固，行动困难" },
            { name: "吞天魔罐", effect: "吞噬本源", desc: "魔罐旋转，吞噬生命本源" },
            { name: "荒塔", effect: "镇压炼化", desc: "九层荒塔镇压而下，炼化万物" },
            { name: "西皇塔", effect: "西皇圣力", desc: "瑶池圣力净化一切，克制邪法" }
          ];
          
          const weapon = imperialWeapons[wave % imperialWeapons.length];
          
          // 如果有帝兵，可能触发特殊互动
          if (equipment.帝兵) {
            const interaction = Math.random() > 0.7;
            if (interaction) {
              return {
                damage: 0.8,
                message: `【${weapon.name}】${weapon.desc}，但${equipment.帝兵.name}自主复苏，抵消部分威能`
              };
            }
          }
          
          return {
            damage: 1.5 + (wave * 0.1),
            message: `【${weapon.name}】${weapon.desc}，极道神威无可匹敌！`
          };
        }
      }
    ];

    // ==== 分阶段渡劫 ====
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stage = stages[stageIndex];
      
      battleLog.push(`【第${stageIndex + 1}阶段：${stage.name}】`);
      battleLog.push(...stage.desc);
      
      for (let wave = 1; wave <= stage.waves; wave++) {
        this.clearTempEffects(player);
        
        let baseDamage = stage.baseDamage * (1 + 0.03 * wave);
        
        // 应用阶段特殊效果
        if (stage.special) {
          const specialEffect = await stage.special(wave, player);
          baseDamage *= specialEffect.damage;
          battleLog.push(specialEffect.message);
        }
        
        const { damage: finalDamage, messages } = await this.applyTribulationDamage(player, baseDamage,equipment);
        player.当前血量 = Math.max(1, player.当前血量 - finalDamage);
        this.updateCooldowns(player);

        battleLog.push(
          `第${wave}道劫难：`,
          `造成${bigNumberTransform(finalDamage)}点劫伤！`,
          `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
        );
        
        if (messages.length > 0) {
          battleLog.push(...messages);
        }
        
        // 持续恢复效果
        if (player.柳神效果?.持续恢复 && player.柳神效果.持续恢复.回合数 > 0) {
          const heal = player.柳神效果.持续恢复.治疗量;
          player.当前血量 = Math.min(player.血量上限, player.当前血量 + heal);
          player.柳神效果.持续恢复.回合数--;
          battleLog.push(`【生命复苏】恢复${heal}点生命`);
        }
        
        // 检查死亡与复活
        if (player.当前血量 <= 1) {
          const resurrected = await this.checkGongfaResurrection(e, player);
          if (resurrected) {
            battleLog.push(`【逆转生死】${player.名号}成功复活！`);
            await Write_player(usr_qq, player);
            await this.broadcastToAll(player,battleLog.join('\n'));
            battleLog = [];
            wave--;
            continue;
          } else {
            break;
          }
        }
        
        // 每道劫难间隔
        if (wave < stage.waves) {
          await Write_player(usr_qq, player);
          await this.broadcastToAll(player,battleLog.join('\n'));
          battleLog = [];
          await new Promise(resolve => setTimeout(resolve, 12000)); // 12秒间隔
        }
      }
      
      if (player.当前血量 <= 1) break;
      
      battleLog.push(`成功渡过${stage.name}！`);
      
      // 阶段奖励
      if (stageIndex === 0) {
        player.攻击 *= 1.05;
        battleLog.push(`【九重天洗礼】攻击力提升5%`);
      } else if (stageIndex === 3) {
        player.防御 *= 1.08;
        player.血量上限 *= 1.1;
        battleLog.push(`【肉身涅槃】防御提升8%，生命上限提升10%`);
      }
      
      if (stageIndex < stages.length - 1) {
        await Write_player(usr_qq, player);
        await this.broadcastToAll(player,battleLog.join('\n'));
        battleLog = [];
        await new Promise(resolve => setTimeout(resolve, 5000)); // 阶段间5秒间隔
      }
    }

    // ==== 渡劫结果判定 ====
    if (player.当前血量 > 1) {
      player.mijinglevel_id = 13; // 圣人王境界
      unlockDaoRealm(player, 13);
      // 扣除仙道潜力（渡圣人王=3点）
      player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 3));
      battleLog.push(`【劫尽成王】`);
      battleLog.push(`雷劫散去，${player.名号}屹立星空，圣王之威震慑九天十地！`);
      battleLog.push(`肉身经过万道锤炼，已近不灭，圣王道果圆满，`);
      battleLog.push(`一念间可穿梭星域，徒手撕裂星辰！`);
      battleLog.push(`「这一世，我为圣王！」道音传遍宇宙边荒！`);
      player.道伤=0;
      // 本命帝兵淬炼
      if (equipment.帝兵 &&!equipment.帝兵.圣人王&&equipment.帝兵.author_name === player.id) {
        const 淬体增益 = actual_need_exp * 0.3;
        equipment.帝兵.atk += Math.floor(淬体增益 * 0.7);
        equipment.帝兵.def += Math.floor(淬体增益 * 0.7);
        equipment.帝兵.HP += Math.floor(淬体增益 * 0.7);
        equipment.帝兵.全属性 += 10;
        equipment.帝兵.圣人王 = true;
        await Write_equipment(usr_qq, equipment);
        battleLog.push(
          `${player.名号}的本命帝兵${equipment.帝兵.name}经历圣王劫淬炼，`,
          `攻击永久+${bigNumberTransform(淬体增益 * 0.7)}`,
          `防御永久+${bigNumberTransform(淬体增益 * 0.7)}`,
          `生命永久+${bigNumberTransform(淬体增益 * 0.7)}`,
          `全属性增加至${equipment.帝兵.全属性}`
        );
      }
      
    } else {
      battleLog.push(`【渡劫失败】`);
      battleLog.push(`${player.名号}被圣人王劫劈碎圣王道果，从星空坠落！`);
      battleLog.push(`圣王符文黯淡，需寻不死神药修复伤体，`);
      battleLog.push(`再积累${bigNumberTransform(actual_need_exp * 3)}修为方可重渡此劫！`);
      player.道伤 = (player.道伤 || 0) + 1;
      battleLog.push(`当前道伤：${player.道伤}！`);
      player.修为 *= 0.6; // 惩罚更重
      player.血气 *= 0.6;
    }

    this.clearTempEffects(player);
    await Write_player(usr_qq, player);
    e.reply(battleLog.join('\n'));
    // ===== 渡劫结束，重算全装属性 =====
    await this.exitTribulationState(player, _tribSnap3, usr_qq, equipment);
  }
  // ==== 渡大圣雷劫主逻辑 ====
async dashengleijie(e) {
    if (!e.isGroup) return e.reply('需在群聊中渡劫');
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
        if (player.mijinglevel_id >= 14) {
        e.reply(`你早已成就大圣，不可重复证道`);
        return false;
    }
    // ==== 境界检查 ====
    if (player.mijinglevel_id < 13) {
      return e.reply([
        `「欲渡大圣劫，先成圣人王！」`,
        `${player.名号}当前境界仅为${player.mijinglevel_id}，`,
        `需先渡过圣人王劫，成就圣王之位方可引动大圣劫`
      ].join('\n'));
    }
    
    /* ========== 仙道潜力检查（渡大圣雷劫=4点） ========== */
    {
      const potentialCost = applyQuestionFortuneCost(player, 4);
      const currentPotential = player.仙道潜力 || 0;
      if (currentPotential < potentialCost) {
        return e.reply([
          `【仙道潜力不足·渡劫受阻】`,
          `${player.名号}欲引动大圣劫，却感仙道潜力枯竭，天雷拒绝降临！`,
          `当前仙道潜力：${currentPotential} 点`,
          `渡大圣雷劫所需：${potentialCost} 点`,
          `「无潜力者，天劫不降，只能蛰伏等待机缘！」`
        ].join('\n'));
      }
    }
    /* ========== 仙道潜力检查结束 ========== */

    if (!(await this.checkWudaoGate(e, player, usr_qq, 13))) return false;

    // ==== 时代系统配置 ====
    const set = config.getConfig('xiuxian', 'xiuxian');
    const currentEra = set.Era?.current || { index: 0, years: 0 };
    const eraCostRates = [1.5, 1.8, 2.2, 3.0, 5.0]; // 大圣劫消耗极大
    const eraDifficultyRates = [0.1, 0.3, 1, 2, 3];
    const eraNames = ["神话时代", "太古时代", "天命时代", "末法时代", "绝灵时代"];
    
    const difficultyRate = eraDifficultyRates[currentEra.index];
    const costRate = eraCostRates[currentEra.index];
    const eraName = eraNames[currentEra.index];
    const costModifier = costRate !== 1.0 ? `(×${costRate})` : "";

    // ==== 道伤检查 ====
    if (player.道伤 && player.道伤 >= 3) {
      return e.reply([
        `【道基受损·难以渡劫】`,
        `${player.名号}道基受损严重，已有${player.道伤}处道伤，`,
        `强行渡劫必死无疑！需先寻不死药修复道基。`,
        `推荐：真龙不死药、麒麟神药、九妙不死药`
      ].join('\n'));
    }

    // ==== 资源检查 ====
    const base_need_exp = Math.pow(2, 13) * 2000000; // 大圣劫消耗巨大
    const actual_blood_need = applyQuestionFortuneCost(player, Math.ceil(base_need_exp * costRate));
    const actual_need_exp = this.getMinggeCultivationCost(player, actual_blood_need);
    const minggeCostLine = this.getMinggeCostLine(player, actual_blood_need);
    const exp2 = Math.max(0, actual_need_exp - player.修为);
    const exp3 = Math.max(0, actual_blood_need - player.血气);

    if (player.修为 < actual_need_exp) {
      return e.reply([
        `修为不足以渡大圣劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
        ...(minggeCostLine ? [minggeCostLine] : []),
        `还需修为: ${exp2.toLocaleString()}`
      ].join("\n"));
    }

    if (player.血气 < actual_blood_need) {
      return e.reply([
        `血气不足以渡大圣劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_blood_need.toLocaleString()} ${costModifier}`,
        `还需血气: ${exp3.toLocaleString()}`
      ].join("\n"));
    }



    // ==== 扣除资源 ====
    player.修为 -= actual_need_exp;
    player.血气 -= actual_blood_need;
    
    // ===== 天道排斥外物，进入渡劫状态 =====
    const _tribSnap4 = this.enterTribulationState(player, equipment);

    // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
    const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

    // ==== 开始渡劫 ====
    let battleLog = [
      `【大圣劫启·宇宙震颤】`,
      `${player.名号}屹立星空，圣王之威撼动整片宇宙！`,
      `无数星域同时感应到这股恐怖气息，万道哀鸣！`,
      `「轰！」第一道雷光便劈碎了星河，湮灭万千星辰！`,
      `当前时代：${eraName} (难度系数:${difficultyRate})`,
      `消耗修为：${actual_need_exp.toLocaleString()}`,
      `消耗血气：${actual_blood_need.toLocaleString()}`,
      ...(minggeCostLine ? [minggeCostLine] : [])
    ];

    // ==== 大圣劫阶段 ====
    const stages = [
      { 
        name: "混沌天雷", 
        waves: 9,
        baseDamage: maxAtk * 0.3 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大圣,
        desc: [
          `开天辟地前的混沌雷海降临，蕴含创世与灭世之力！`,
          `每一道混沌天雷都携带先天道则，磨灭万物！`,
          `这是天地间最本源的考验，唯有超脱方能存活！`
        ],
        special: async (wave, player) => {
          const chaosEffects = [
            { name: "开天神雷", damageMult: 1.8, desc: "蕴含开天辟地之力，重塑乾坤" },
            { name: "灭世魔雷", damageMult: 2.0, desc: "携带终结一切的气息，毁灭万物" },
            { name: "阴阳混沌雷", damageMult: 1.7, desc: "阴阳交融，演化生死轮回" },
            { name: "时空劫雷", damageMult: 2.2, desc: "扰乱时空，同时攻击过去现在未来" }
          ];
          
          const effect = chaosEffects[wave % chaosEffects.length];
          return {
            damage: effect.damageMult,
            message: `【${effect.name}】${effect.desc}，伤害提升${(effect.damageMult-1)*100}%`
          };
        }
      },
            {
        name: "心魔劫",
        waves: 9,
        baseDamage: maxAtk * 0.4 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大圣,
        desc: [
          `大圣心魔劫，直指道心最深处！`,
          `过往一切遗憾、恐惧、执念具现化！`,
          `亲人陨落、道途挫折、红颜薄命...`,
          `唯有斩断一切执念，方能道心通明！`
        ],
        special: async (wave, player) => {
          // 心魔劫特殊效果：直接攻击道心，可能造成额外效果
          const heartDevils = [
            { 
              effect: "道心裂痕", 
              desc: "道心出现裂痕，全属性暂时降低15%",
              apply: (player) => {
                player.攻击 *= 0.85;
                player.防御 *= 0.85;
                player.血量上限 *= 0.85;
              }
            },
            { 
              effect: "心魔噬魂", 
              desc: "心魔直接攻击神魂，下一次伤害翻倍",
              apply: (player) => {
                player.下次伤害倍率 = 2.0;
              }
            },
            { 
              effect: "往事心结", 
              desc: "修炼路上的遗憾重现，真气紊乱",
              apply: (player) => {
                player.当前血量 *= 0.9;
                player.修为 *= 0.95;
              }
            },
            { 
              effect: "未来恐惧", 
              desc: "看见自己证道失败的未来，心生恐惧",
              apply: (player) => {
                player.元神 *= 0.7;
                player.元神上限 *= 0.7;
              }
            },
            { 
              effect: "红颜劫", 
              desc: "情劫显现，道心波动",
              apply: (player) => {
                player.心境不稳 = true;
                player.当前血量 *= 0.8;
              }
            }
          ];
          
          const devil = heartDevils[wave % heartDevils.length];
          devil.apply(player);
          
          return {
            damage: 1.5,
            message: `【心魔劫·${devil.effect}】${devil.desc}`
          };
        }
      },
      {
        name: "肉身劫",
        waves: 9,
        baseDamage: maxAtk * 0.5 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大圣,
        desc: [
          `专门针对大圣肉身的终极考验！`,
          `万道化为实质枷锁，大道符文烙印每一寸血肉！`,
          `要么在万道锤炼中极尽升华，成就无上宝体！`,
          `要么肉身崩碎，道基尽毁！`
        ],
        special: async (wave, player) => {
          // 肉身劫特殊效果：对肉身有极高要求，但成功后也有极大奖励
          const bodyTests = [
            { 
              test: "筋骨重组", 
              desc: "筋骨寸寸断裂后重组，痛苦万分",
              effect: (player) => {
                if (player.灵根?.type?.includes("圣体")) {
                  player.防御 *= 1.1;
                  return "圣体适应重组，防御提升10%";
                } else {
                  player.当前血量 *= 0.7;
                  return "肉身不足，承受巨大痛苦，生命减少30%";
                }
              }
            },
            { 
              test: "血脉沸腾", 
              desc: "血脉沸腾如岩浆，洗涤杂质",
              effect: (player) => {
                if (player.灵根?.type?.includes("神体")) {
                  player.攻击 *= 1.1;
                  player.当前血量 = player.血量上限;
                  return "神体血脉沸腾，攻击提升10%，生命全满";
                } else {
                  player.当前血量 *= 0.8;
                  return "血脉不足，承受巨大痛苦，生命减少20%";
                }
              }
            },
            { 
              test: "窍穴洞开", 
              desc: "周身窍穴被强行洞开，吸纳天地精华",
              effect: (player) => {
                const isStrongBody = player.灵根?.type?.includes("圣体") || 
                                    player.灵根?.type?.includes("神体");
                if (isStrongBody) {
                  player.修为 *= 1.05;
                  player.血气 *= 1.05;
                  return "窍穴洞开成功，修为血气提升5%";
                } else {
                  player.道伤 = (player.道伤 || 0) + 0.3;
                  return "窍穴洞开失败，道基受损，道伤增加0.3";
                }
              }
            },
            { 
              test: "神魂淬炼", 
              desc: "神魂离体接受雷劫淬炼，危险至极",
              effect: (player) => {
                if (player.元神 && player.yuanshenlevel_id >= 5) {
                  player.元神 *= 1.2;
                  player.元神上限 *= 1.2;
                  return "神魂淬炼成功，元神与元神上限提升20%";
                } else {
                  player.当前血量 *= 0.6;
                  player.修为 *= 0.9;
                  return "神魂淬炼失败，生命减少40%，修为减少10%";
                }
              }
            }
          ];
          
          const test = bodyTests[wave % bodyTests.length];
          const effectResult = test.effect(player);
          
          return {
            damage: 1.8,
            message: `【肉身劫·${test.test}】${test.desc}，${effectResult}`
          };
        }
      },
      {
        name: "至尊烙印",
        waves: 9,
        baseDamage: maxAtk * 0.7 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大圣,
        desc: [
          `古往今来最强大的九位至尊烙印显化！`,
          `不死天皇、狠人大帝、无始大帝、帝尊...`,
          `每一位都是曾经无敌于世的存在，他们的道与法在此重现！`
        ],
        special: async (wave, player) => {
          const emperors = [
            { 
              name: "不死天皇", 
              skill: "飞仙诀", 
              desc: "五色神光横扫，天皇秘术镇压诸天",
              effect: (player) => {
                // 不死天皇的特殊效果：剥夺寿元
                const lifeLoss = Math.floor(player.寿元 * 0.35);
                player.寿元 = Math.max(1, player.寿元 - lifeLoss);
                return `被剥夺${lifeLoss}年寿元`;
              }
            },
            { 
              name: "狠人大帝", 
              skill: "吞天魔功", 
              desc: "一念花开，君临天下，飞仙之力破灭万法",
              effect: (player) => {
                // 狠人大帝的特殊效果：吞噬本源
                player.修为 *= 0.75;
                player.血气 *= 0.75;
                return `本源被吞噬，修为血气减少25%`;
              }
            },
            { 
              name: "无始大帝", 
              skill: "无始经", 
              desc: "无始亦无终，一手遮天，镇压万古",
              effect: (player) => {
                // 无始大帝的特殊效果：时间停滞
                player.功法冷却延长 = 2;
                return `时间停滞，所有功法冷却延长2回合`;
              }
            },
            { 
              name: "帝尊", 
              skill: "九秘合一", 
              desc: "九秘齐聚，天下无敌，一道破万法",
              effect: (player) => {
                // 帝尊的特殊效果：全面压制
                player.攻击 *= 0.9;
                player.防御 *= 0.9;
                return `全面压制，攻防降低10%`;
              }
            },
            { 
              name: "青帝", 
              skill: "妖帝九斩", 
              desc: "一株青莲摇动，万古青天一株莲",
              effect: (player) => {
                // 青帝的特殊效果：生命汲取
                const healAmount = Math.floor(player.血量上限 * 0.1);
                player.当前血量 = Math.max(1, player.当前血量 - healAmount);
                return `被汲取${healAmount}点生命`;
              }
            },

            { 
              name: "恒宇大帝", 
              skill: "恒宇经", 
              desc: "炉养百经，熔炼万道，一道破万法",
              effect: (player) => {
                // 恒宇大帝的特殊效果：熔炼道基
                player.道伤 = (player.道伤 || 0) + 1;
                return `道基被熔炼，道伤增加1`;
              }
            },
            { 
              name: "阿弥陀佛", 
              skill: "佛法无边", 
              desc: "佛光普照，度化众生，掌中佛国",
              effect: (player) => {
                // 阿弥陀佛的特殊效果：度化心志
                player.心境不稳 = true;
                return `心志被动摇，下次伤害增加30%`;
              }
            }
          ];
          
          const emperor = emperors[wave % emperors.length];
          const effectResult = emperor.effect(player);
          
          return {
            damage: 2.0 + (wave * 0.15),
            message: `【${emperor.name}】${emperor.desc}，施展${emperor.skill}！${effectResult}`
          };
        }
      },

      {
        name: "帝兵劫",
        waves: 9,
        baseDamage: maxAtk * 0.9 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大圣,
        desc: [
          `雷劫演化极道帝兵，进行终极攻伐！`,
          `不仅有无始钟、虚空镜等已知帝兵，`,
          `还有神话时代、乱古时代的未知帝兵显化！`,
          `这是天地间最强大的攻伐，非大圣不可抵挡！`
        ],
        special: async (wave, player) => {
          const imperialWeapons = [
            { 
              name: "无始钟", 
              effect: "镇压时空", 
              desc: "钟声一响，时空凝固，行动困难",
              damageMult: 2.5
            },
            { 
              name: "虚空镜", 
              effect: "放逐虚空", 
              desc: "镜光照耀，将被击中的部位放逐到未知虚空",
              damageMult: 2.3
            },
            { 
              name: "吞天魔罐", 
              effect: "吞噬本源", 
              desc: "魔罐旋转，吞噬生命本源和修为",
              damageMult: 2.8
            },
            { 
              name: "荒塔", 
              effect: "镇压炼化", 
              desc: "九层荒塔镇压而下，炼化万物",
              damageMult: 2.7
            },
            { 
              name: "诛仙四剑", 
              effect: "诛仙剑阵", 
              desc: "四剑齐出，布下诛仙剑阵，非四圣不可破",
              damageMult: 3.0
            },
            { 
              name: "不死天刀", 
              effect: "天皇杀阵", 
              desc: "五色天刀斩落，蕴含不死天皇的杀阵",
              damageMult: 2.9
            },
            { 
              name: "青铜仙殿", 
              effect: "仙殿镇杀", 
              desc: "仙殿降临，镇压一切，蕴含成仙之秘",
              damageMult: 2.6
            },
            { 
              name: "万物母气鼎", 
              effect: "母气镇压", 
              desc: "万物母气垂落，重若星辰，镇压诸天",
              damageMult: 2.4
            },
            { 
              name: "神皇戟", 
              effect: "神皇一击", 
              desc: "神皇戟劈落，蕴含神皇无敌一击",
              damageMult: 2.9
            }
          ];
          
          const weapon = imperialWeapons[wave % imperialWeapons.length];
          
          // 如果有帝兵，可能触发特殊互动
          if (equipment.帝兵) {
            const interaction = Math.random() > 0.5;
            if (interaction) {
              const damageReduction = 0.7 + (Math.random() * 0.2);
              return {
                damage: weapon.damageMult * damageReduction,
                message: `【${weapon.name}】${weapon.desc}，但${equipment.帝兵.name}自主复苏，抵消部分威能`
              };
            }
          }
          
          return {
            damage: weapon.damageMult,
            message: `【${weapon.name}】${weapon.desc}，极道神威无可匹敌！`
          };
        }
      },
      {
        name: "天道审判",
        waves: 1,
        baseDamage: maxAtk * 2 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大圣,
        desc: [
          `最终审判！天道显化，降下终极一击！`,
          `这是天地对逆天者的最终考验！`,
          `要么超脱天地，成就无上大圣！`,
          `要么身死道消，化为宇宙尘埃！`
        ],
        special: async (wave, player) => {
          return {
            damage: 3 + (Math.random() * 2.0),
            message: `【天道审判】天地不容逆天者，降下终极毁灭！`
          };
        }
      }
    ];

    // ==== 分阶段渡劫 ====
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stage = stages[stageIndex];
      
      battleLog.push(`【第${stageIndex + 1}阶段：${stage.name}】`);
      battleLog.push(...stage.desc);
      
      for (let wave = 1; wave <= stage.waves; wave++) {
        this.clearTempEffects(player);
        
        let baseDamage = stage.baseDamage * (1 + 0.05 * wave);
        
        // 应用阶段特殊效果
        if (stage.special) {
          const specialEffect = await stage.special(wave, player);
          baseDamage *= specialEffect.damage;
          battleLog.push(specialEffect.message);
        }
        
        // 心境不稳效果
        if (player.心境不稳) {
          baseDamage *= 1.3;
          battleLog.push(`【心境不稳】伤害增加30%`);
          delete player.心境不稳;
        }
        
        // 下次伤害倍率
        if (player.下次伤害倍率) {
          baseDamage *= player.下次伤害倍率;
          battleLog.push(`【特殊效果】伤害增加${(player.下次伤害倍率-1)*100}%`);
          delete player.下次伤害倍率;
        }
        
        const { damage: finalDamage, messages } = await this.applyTribulationDamage(player, baseDamage,equipment);
        player.当前血量 = Math.max(1, player.当前血量 - finalDamage);
        
        // 功法冷却延长效果
        if (player.功法冷却延长) {
          for (const gongfaName in player.功法) {
            if (player.功法[gongfaName].冷却回合 > 0) {
              player.功法[gongfaName].冷却回合 += player.功法冷却延长;
            }
          }
          battleLog.push(`【时间停滞】所有功法冷却延长${player.功法冷却延长}回合`);
          delete player.功法冷却延长;
        }
        
        this.updateCooldowns(player);

        battleLog.push(
          `第${wave}道劫难：`,
          `造成${bigNumberTransform(finalDamage)}点道伤！`,
          `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
        );
        
        if (messages.length > 0) {
          battleLog.push(...messages);
        }
        
        // 持续恢复效果
        if (player.柳神效果?.持续恢复 && player.柳神效果.持续恢复.回合数 > 0) {
          const heal = player.柳神效果.持续恢复.治疗量;
          player.当前血量 = Math.min(player.血量上限, player.当前血量 + heal);
          player.柳神效果.持续恢复.回合数--;
          battleLog.push(`【生命复苏】恢复${heal}点生命`);
        }
        
          // ==== 检查死亡与复活 ====
    if (player.当前血量 <= 1) {
        const resurrected = await this.checkGongfaResurrection(e, player);
        if (resurrected) {
            battleLog.push(`【逆转生死,欺瞒天地】${player.名号}以无上秘法成功复活，并避开第${wave}道劫数！`);
            await Write_player(usr_qq, player);
            await this.broadcastToAll(player,battleLog.join('\n'));
            battleLog = [];
            
            // 直接进入下一道劫难
            continue;
        } else {
            break;
        }
    }
        
        // 每道劫难间隔
        if (wave < stage.waves) {
          await Write_player(usr_qq, player);
          await this.broadcastToAll(player,battleLog.join('\n'));
          battleLog = [];
          await new Promise(resolve => setTimeout(resolve, 15000)); // 15秒间隔
        }
      }
      
      if (player.当前血量 <= 1) break;
      
      battleLog.push(`成功渡过${stage.name}！`);
      
      // 阶段奖励
      if (stageIndex === 0) {
        player.攻击 *= 1.08;
        battleLog.push(`【混沌洗礼】攻击力提升8%`);
      } else if (stageIndex === 2) {
        player.道心稳固 = true;
        battleLog.push(`【道心通明】心境稳固，不再受心魔影响`);
      } else if (stageIndex === 3) {
        player.防御 *= 1.1;
        player.血量上限 *= 1.15;
        battleLog.push(`【肉身涅槃】防御提升10%，生命上限提升15%`);
      }
      
      if (stageIndex < stages.length - 1) {
        await Write_player(usr_qq, player);
        await this.broadcastToAll(player,battleLog.join('\n'));
        battleLog = [];
        await new Promise(resolve => setTimeout(resolve, 8000)); // 阶段间8秒间隔
      }
    }

    // ==== 渡劫结果判定 ====
    if (player.当前血量 > 1) {
      player.mijinglevel_id = 14; // 大圣境界
      unlockDaoRealm(player, 14);
      // 扣除仙道潜力（渡大圣=4点）
      player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 4));
      battleLog.push(`【劫尽成圣】`);
      battleLog.push(`雷劫散去，${player.名号}屹立星空，大圣之威震慑九天十地！`);
      battleLog.push(`肉身经过万道锤炼，已近不灭，大圣道果圆满，`);
      battleLog.push(`一念间可穿梭星域，徒手撕裂星辰！`);
      battleLog.push(`「这一世，我为大圣！」道音传遍宇宙边荒！`);
      
      // 本命帝兵淬炼
      if (equipment.帝兵 &&!equipment.帝兵.大圣&& equipment.帝兵.author_name === player.id) {
        const 淬体增益 = actual_need_exp * 0.5;
        equipment.帝兵.atk += Math.floor(淬体增益 * 1.0);
        equipment.帝兵.def += Math.floor(淬体增益 * 1.0);
        equipment.帝兵.HP += Math.floor(淬体增益 * 1.0);
        equipment.帝兵.全属性 += 15;
        equipment.帝兵.大圣 = true;
        
        
        await Write_equipment(usr_qq, equipment);
        battleLog.push(
          `${player.名号}的本命帝兵${equipment.帝兵.name}经历大圣劫淬炼，`,
          `攻击永久+${bigNumberTransform(淬体增益 * 1.0)}`,
          `防御永久+${bigNumberTransform(淬体增益 * 1.0)}`,
          `生命永久+${bigNumberTransform(淬体增益 * 1.0)}`,
          `全属性增加至${equipment.帝兵.全属性}`
        );
      }
      

      
      // 清除道伤
      if (player.道伤) {
        battleLog.push(`【道基重塑】大圣劫淬炼下，所有道伤被修复`);
        delete player.道伤;
      }
    } else {
      battleLog.push(`【渡劫失败】`);
      battleLog.push(`${player.名号}被大圣劫劈碎圣王道果，从星空坠落！`);
      battleLog.push(`大圣符文黯淡，需寻不死神药修复伤体，`);
      battleLog.push(`再积累${bigNumberTransform(actual_need_exp * 4)}修为方可重渡此劫！`);
      
      // 道伤增加
      player.道伤 = (player.道伤 || 0) + 1;
      player.修为 *= 0.5; // 惩罚更重
      player.血气 *= 0.5;
      
      battleLog.push(`道伤增加，当前道伤：${player.道伤}/3`);
    }

    this.clearTempEffects(player);
    await Write_player(usr_qq, player);
    e.reply(battleLog.join('\n'));
    // ===== 渡劫结束，重算全装属性 =====
    await this.exitTribulationState(player, _tribSnap4, usr_qq, equipment);
  }
    // ==== 渡准帝雷劫主逻辑 ====
async zhundileijie(e) {
    if (!e.isGroup) return e.reply('需在群聊中渡劫');
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);
        if (player.mijinglevel_id >= 15) {
        e.reply(`你早已成就准帝，不可重复证道`);
        return false;
    }
    // ==== 境界检查 ====
    if (player.mijinglevel_id < 14) {
      return e.reply([
        `「欲渡准帝劫，先成大圣位！」`,
        `${player.名号}当前境界仅为${player.mijinglevel_id}，`,
        `需先渡过大圣劫，成就大圣之位方可引动准帝劫`
      ].join('\n'));
    }
    
    /* ========== 仙道潜力检查（渡准帝雷劫=5点） ========== */
    {
      const potentialCost = applyQuestionFortuneCost(player, 5);
      const currentPotential = player.仙道潜力 || 0;
      if (currentPotential < potentialCost) {
        return e.reply([
          `【仙道潜力不足·渡劫受阻】`,
          `${player.名号}欲引动准帝劫，却感仙道潜力枯竭，天雷拒绝降临！`,
          `当前仙道潜力：${currentPotential} 点`,
          `渡准帝雷劫所需：${potentialCost} 点`,
          `「无潜力者，天劫不降，只能蛰伏等待机缘！」`
        ].join('\n'));
      }
    }
    /* ========== 仙道潜力检查结束 ========== */

    if (!(await this.checkWudaoGate(e, player, usr_qq, 14))) return false;

    // ==== 准帝劫重数选择 ====
    // 准帝劫分为1-9重天，玩家可以选择渡几重天的劫难
    let selectedHeaven = 9; // 默认第一重天
    

    // ==== 时代系统配置 ====
    const set = config.getConfig('xiuxian', 'xiuxian');
    const currentEra = set.Era?.current || { index: 0, years: 0 };
    const eraCostRates = [2.0, 2.5, 3.0, 4.0, 6.0]; // 准帝劫消耗极大
    const eraDifficultyRates = [0.3, 0.6, 2, 3, 5];
    const eraNames = ["神话时代", "太古时代", "天命时代", "末法时代", "绝灵时代"];
    
    const difficultyRate = eraDifficultyRates[currentEra.index] * (selectedHeaven / 3);
    const costRate = eraCostRates[currentEra.index] * (selectedHeaven / 3);
    const eraName = eraNames[currentEra.index];
    const costModifier = costRate !== 1.0 ? `(×${costRate.toFixed(1)})` : "";

    // ==== 道伤检查 ====
    if (player.道伤 && player.道伤 >= 2) {
      return e.reply([
        `【道基受损·难以渡劫】`,
        `${player.名号}道基受损严重，已有${player.道伤}处道伤，`,
        `强行渡准帝劫必死无疑！需先寻不死药或仙珍修复道基。`,
        `推荐：真龙不死药、麒麟神药、九妙不死药、天命石、造化源眼`
      ].join('\n'));
    }

    // ==== 资源检查 ====
    const base_need_exp = Math.pow(2, 14) * 2000000; // 准帝劫消耗巨大
    const actual_blood_need = applyQuestionFortuneCost(player, Math.ceil(base_need_exp * costRate));
    const actual_need_exp = this.getMinggeCultivationCost(player, actual_blood_need);
    const minggeCostLine = this.getMinggeCostLine(player, actual_blood_need);
    const exp2 = Math.max(0, actual_need_exp - player.修为);
    const exp3 = Math.max(0, actual_blood_need - player.血气);

    if (player.修为 < actual_need_exp) {
      return e.reply([
        `修为不足以渡准帝劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100).toFixed(0)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
        ...(minggeCostLine ? [minggeCostLine] : []),
        `还需修为: ${exp2.toLocaleString()}`
      ].join("\n"));
    }

    if (player.血气 < actual_blood_need) {
      return e.reply([
        `血气不足以渡准帝劫！`,
        `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100).toFixed(0)}%)` : ''}`,
        `基础需求: ${base_need_exp.toLocaleString()}`,
        `实际需求: ${actual_blood_need.toLocaleString()} ${costModifier}`,
        `还需血气: ${exp3.toLocaleString()}`
      ].join("\n"));
    }

    // ==== 扣除资源 ====
    player.修为 -= actual_need_exp;
    player.血气 -= actual_blood_need;
    
    // ===== 天道排斥外物，进入渡劫状态 =====
    const _tribSnap5 = this.enterTribulationState(player, equipment);

    // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
    const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

    // ==== 开始渡劫 ====
    let battleLog = [
      `【准帝劫启·诸天震动】`,
      `${player.名号}屹立宇宙边荒，大圣之威撼动整片古史！`,
      `万道哀鸣，时间长河泛起涟漪，古今未来的强者都投来目光！`,
      `「轰！」第一道雷光便劈开了星海，湮灭无数古星！`,
      `选择重数：${selectedHeaven}重天`,
      `当前时代：${eraName} (难度系数:${difficultyRate.toFixed(1)})`,
      `消耗修为：${actual_need_exp.toLocaleString()}`,
      `消耗血气：${actual_blood_need.toLocaleString()}`,
      ...(minggeCostLine ? [minggeCostLine] : [])
    ];

    // ==== 准帝劫阶段 ====
    // 根据选择的重数，决定经历哪些阶段
    const allStages = [
      { 
        name: "混沌雷海", 
        requiredHeaven: 1,
        waves: 9,
        baseDamage: maxAtk * 0.3 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝,
        desc: [
          `开天辟地前的混沌雷海降临，蕴含创世与灭世之力！`,
          `每一滴雷液都足以湮灭大圣，每一道雷光都足以重创准帝！`,
          `这是天地间最本源的考验，唯有超脱方能存活！`
        ],
        special: async (wave, player) => {
          const chaosEffects = [
            { name: "鸿蒙紫雷", damageMult: 2.0, desc: "鸿蒙初开时的第一道雷，蕴含造化之力" },
            { name: "玄黄劫雷", damageMult: 2.2, desc: "玄黄之气凝结的雷劫，重若星域" },
            { name: "阴阳混沌雷", damageMult: 1.9, desc: "阴阳交融，演化生死轮回" },
            { name: "时空劫雷", damageMult: 2.5, desc: "扰乱时空，同时攻击过去现在未来" },
            { name: "五行仙雷", damageMult: 2.1, desc: "五行轮转，相生相克，磨灭万法" }
          ];
          
          const effect = chaosEffects[wave % chaosEffects.length];
          return {
            damage: effect.damageMult,
            message: `【${effect.name}】${effect.desc}，伤害提升${(effect.damageMult-1)*100}%`
          };
        }
      },
      {
        name: "帝皇烙印",
        requiredHeaven: 1,
        waves: 9,
        baseDamage: maxAtk * 1 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝,
        desc: [
          `古往今来最强大的九位帝皇烙印显化！`,
          `不死天皇、狠人大帝、无始大帝、帝尊、叶凡...`,
          `每一位都是曾经无敌于世的存在，他们的道与法在此重现！`
        ],
        special: async (wave, player) => {
          const emperors = [
            { 
              name: "不死天皇", 
              skill: "飞仙诀", 
              desc: "五色神光横扫，天皇秘术镇压诸天",
              effect: (player) => {
                const lifeLoss = Math.floor(player.寿元 * 0.7);
                player.寿元 = Math.max(1, player.寿元 - lifeLoss);
                return `被剥夺${lifeLoss}年寿元`;
              }
            },
            { 
              name: "狠人大帝", 
              skill: "吞天魔功", 
              desc: "一念花开，君临天下，飞仙之力破灭万法",
              effect: (player) => {
                player.修为 *= 0.92;
                return `本源被吞噬，修为减少8%`;
              }
            },
            { 
              name: "无始大帝", 
              skill: "无始经", 
              desc: "无始亦无终，一手遮天，镇压万古",
              effect: (player) => {
                player.功法冷却延长 = 3;
                return `时间停滞，所有功法冷却延长3回合`;
              }
            },
            { 
              name: "帝尊", 
              skill: "九秘合一", 
              desc: "九秘齐聚，天下无敌，一道破万法",
              effect: (player) => {
                player.攻击 *= 0.85;
                player.防御 *= 0.7;
                return `全面压制，攻击降低15%，防御降低30%`;
              }
            },
            { 
              name: "圣体始祖", 
              skill: "六道轮回拳", 
              desc: "圣体专属拳法，六道轮回，拳意无敌",
              effect: (player) => {
                if (player.灵根?.type?.includes("圣体")) {
                  player.攻击 *= 1.1;
                  return `圣体共鸣，攻击提升10%`;
                } else {
                  player.当前血量 *= 0.7;
                  return `被六道轮回拳击中，生命减少30%`;
                }
              }
            },
            { 
              name: "青帝", 
              skill: "妖帝九斩", 
              desc: "一株青莲摇动，万古青天一株莲",
              effect: (player) => {
                const healAmount = Math.floor(player.血量上限 * 0.15);
                player.当前血量 = Math.max(1, player.当前血量 - healAmount);
                return `被汲取${healAmount}点生命`;
              }
            },
            { 
              name: "虚空大帝", 
              skill: "虚空经", 
              desc: "虚空之道，无处不在，又无处可在",
              effect: (player) => {
                player.元神 *= 0.5;
                player.元神上限 *= 0.5;
                return `空间与被禁锢，元神被镇压降低50%`;
              }
            },
            { 
              name: "恒宇大帝", 
              skill: "恒宇经", 
              desc: "炉养百经，熔炼万道，一道破万法",
              effect: (player) => {
                player.道伤 = (player.道伤 || 0) + 2;
                return `道基被熔炼，道伤增加2`;
              }
            },
            { 
              name: "阿弥陀佛", 
              skill: "佛法无边", 
              desc: "佛光普照，度化众生，掌中佛国",
              effect: (player) => {
                player.心境不稳 = true;
                return `心志被动摇，下次伤害增加40%`;
              }
            }
          ];
          
          const emperor = emperors[wave % emperors.length];
          const effectResult = emperor.effect(player);
          
          return {
            damage: 2.5 + (wave * 0.2),
            message: `【${emperor.name}】${emperor.desc}，施展${emperor.skill}！${effectResult}`
          };
        }
      },
      {
        name: "心魔劫",
        requiredHeaven: 3,
        waves: 9,
        baseDamage: maxAtk * 0.5 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝,
        desc: [
          `准帝心魔劫，直指道心最深处！`,
          `过往一切遗憾、恐惧、执念具现化！`,
          `亲人陨落、道途挫折、红颜薄命、证道失败...`,
          `唯有斩断一切执念，方能道心通明！`
        ],
        special: async (wave, player) => {
          const heartDevils = [
            { 
              effect: "道心裂痕", 
              desc: "道心出现裂痕，全属性暂时降低20%",
              apply: (player) => {
                player.攻击 *= 0.8;
                player.防御 *= 0.8;
                player.血量上限 *= 0.8;
              }
            },
            { 
              effect: "心魔噬魂", 
              desc: "心魔直接攻击神魂，下一次伤害翻倍",
              apply: (player) => {
                player.下次伤害倍率 = 2.2;
              }
            },
            { 
              effect: "往事心结", 
              desc: "修炼路上的遗憾重现，真气紊乱",
              apply: (player) => {
                player.当前血量 *= 0.85;
                player.修为 *= 0.3;
                player.血气 *= 0.3;
              }
            },
            { 
              effect: "未来恐惧", 
              desc: "看见自己证道失败的未来，心生恐惧",
              apply: (player) => {
                player.元神 *= 0.6;
                player.元神上限 *= 0.6;
              }
            },
            { 
              effect: "红颜劫", 
              desc: "情劫显现，道心波动",
              apply: (player) => {
                player.心境不稳 = true;
                player.当前血量 *= 0.75;
              }
            },
            { 
              effect: "道友劫", 
              desc: "昔日道友成为心魔，道心受损,出现道伤",
              apply: (player) => {
                player.道伤 = (player.道伤 || 0) + 1;
                player.当前血量 *= 0.8;
              }
            }
          ];
          
          const devil = heartDevils[wave % heartDevils.length];
          devil.apply(player);
          
          return {
            damage: 1.8,
            message: `【心魔劫·${devil.effect}】${devil.desc}`
          };
        }
      },
      {
        name: "肉身劫",
        requiredHeaven: 3,
        waves: 9,
        baseDamage: maxAtk * 0.7 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝,
        desc: [
          `专门针对准帝肉身的终极考验！`,
          `万道化为实质枷锁，大道符文烙印每一寸血肉！`,
          `要么在万道锤炼中极尽升华，成就无上宝体！`,
          `要么肉身崩碎，道基尽毁！`
        ],
        special: async (wave, player) => {
          const bodyTests = [
            { 
              test: "筋骨重组", 
              desc: "筋骨寸寸断裂后重组，痛苦万分",
              effect: (player) => {
                if (player.灵根?.type?.includes("圣体")) {
                  player.防御 *= 1.15;
                  return "圣体适应重组，防御提升15%";
                } else {
                  player.当前血量 *= 0.65;
                  return "肉身不足，承受巨大痛苦，生命减少35%";
                }
              }
            },
            { 
              test: "血脉沸腾", 
              desc: "血脉沸腾如岩浆，洗涤杂质",
              effect: (player) => {
                if (player.灵根?.type?.includes("神体")) {
                  player.攻击 *= 1.15;
                  player.当前血量 = player.血量上限;
                  return "神体血脉沸腾，攻击提升15%，生命全满";
                } else {
                  player.当前血量 *= 0.7;
                  return "血脉不足，承受巨大痛苦，生命减少30%";
                }
              }
            },
            { 
              test: "窍穴洞开", 
              desc: "周身窍穴被强行洞开，吸纳天地精华",
              effect: (player) => {
                const isStrongBody = player.灵根?.type?.includes("圣体") || 
                                    player.灵根?.type?.includes("神体");
                if (isStrongBody) {
                  player.修为 *= 1.08;
                  player.血气 *= 1.08;
                  return "窍穴洞开成功，修为血气提升8%";
                } else {
                  player.道伤 = (player.道伤 || 0) + 0.4;
                  return "窍穴洞开失败，道基受损，道伤增加0.4";
                }
              }
            },
            { 
              test: "神魂淬炼", 
              desc: "神魂离体接受雷劫淬炼，危险至极",
              effect: (player) => {
                if (player.神魂强度 && player.神魂强度 > 800) {
                  player.元神 *= 1.25;
                  player.元神上限 *= 1.12;
                  return "神魂淬炼成功，元神强度提升25%";
                } else {
                  player.当前血量 *= 0.55;
                  player.修为 *= 0.25;
                  player.血气 *= 0.25;
                  return "神魂淬炼失败，生命减少45%，修为血气减少75%";
                }
              }
            },
            { 
              test: "道骨重塑", 
              desc: "全身道骨被雷劫重塑，痛苦至极",
              effect: (player) => {
                if (player.灵根?.type?.includes("圣体") || player.灵根?.type?.includes("神体")) {
                  player.防御 *= 1.2;
                  player.攻击 *= 1.1;
                  return "道骨重塑成功，防御提升20%，攻击提升10%";
                } else {
                  player.当前血量 *= 0.5;
                  player.道伤 = (player.道伤 || 0) + 0.3;
                  return "道骨重塑失败，生命减少50%，道伤增加0.3";
                }
              }
            }
          ];
          
          const test = bodyTests[wave % bodyTests.length];
          const effectResult = test.effect(player);
          
          return {
            damage: 2.2,
            message: `【肉身劫·${test.test}】${test.desc}，${effectResult}`
          };
        }
      },
      {
        name: "帝兵劫",
        requiredHeaven: 6,
        waves: 9,
        baseDamage: maxAtk * 2 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝,
        desc: [
          `雷劫演化极道帝兵，进行终极攻伐！`,
          `不仅有无始钟、虚空镜等已知帝兵，`,
          `还有神话时代、乱古时代的未知帝兵显化！`,
          `这是天地间最强大的攻伐，非准帝不可抵挡！`
        ],
        special: async (wave, player) => {
          const imperialWeapons = [
            { 
              name: "无始钟", 
              effect: "镇压时空", 
              desc: "钟声一响，时空凝固，行动困难",
              damageMult: 3.0
            },
            { 
              name: "虚空镜", 
              effect: "放逐虚空", 
              desc: "镜光照耀，将被击中的部位放逐到未知虚空",
              damageMult: 2.8
            },
            { 
              name: "吞天魔罐", 
              effect: "吞噬本源", 
              desc: "魔罐旋转，吞噬生命本源和修为",
              damageMult: 3.2
            },
            { 
              name: "荒塔", 
              effect: "镇压炼化", 
              desc: "九层荒塔镇压而下，炼化万物",
              damageMult: 3.1
            },
            { 
              name: "诛仙四剑", 
              effect: "诛仙剑阵", 
              desc: "四剑齐出，布下诛仙剑阵，非四圣不可破",
              damageMult: 3.5
            },
            { 
              name: "不死天刀", 
              effect: "天皇杀阵", 
              desc: "五色天刀斩落，蕴含不死天皇的杀阵",
              damageMult: 3.3
            },
            { 
              name: "青铜仙殿", 
              effect: "仙殿镇杀", 
              desc: "仙殿降临，镇压一切，蕴含成仙之秘",
              damageMult: 2.9
            },
            { 
              name: "万物母气鼎", 
              effect: "母气镇压", 
              desc: "万物母气垂落，重若星辰，镇压诸天",
              damageMult: 2.7
            },
            { 
              name: "神皇戟", 
              effect: "神皇一击", 
              desc: "神皇戟劈落，蕴含神皇无敌一击",
              damageMult: 3.4
            }
          ];
          
          const weapon = imperialWeapons[wave % imperialWeapons.length];
          
          // 如果有帝兵，可能触发特殊互动
          if (equipment.帝兵) {
            const interaction = Math.random() > 0.6;
            if (interaction) {
              const damageReduction = 0.6 + (Math.random() * 0.2);
              return {
                damage: weapon.damageMult * damageReduction,
                message: `【${weapon.name}】${weapon.desc}，但${equipment.帝兵.name}自主复苏，抵消部分威能`
              };
            }
          }
          
          return {
            damage: weapon.damageMult,
            message: `【${weapon.name}】${weapon.desc}，极道神威无可匹敌！`
          };
        }
      },
      {
        name: "天道审判",
        requiredHeaven: 6,
        waves: 1,
        baseDamage: maxAtk * 5 * difficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.准帝,
        desc: [
          `最终审判！天道显化，降下终极一击！`,
          `这是天地对逆天者的最终考验！`,
          `要么超脱天地，成就无上准帝！`,
          `要么身死道消，化为宇宙尘埃！`
        ],
        special: async (wave, player) => {
          return {
            damage: 6.0 + (Math.random() * 3.0),
            message: `【天道审判】天地不容逆天者，降下终极毁灭！`
          };
        }
      }
    ];

    // 根据选择的重数筛选阶段
    const stages = allStages.filter(stage => stage.requiredHeaven <= selectedHeaven);
    
    // ==== 分阶段渡劫 ====
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stage = stages[stageIndex];
      
      battleLog.push(`【第${stageIndex + 1}阶段：${stage.name}】`);
      battleLog.push(...stage.desc);
      
      for (let wave = 1; wave <= stage.waves; wave++) {
        this.clearTempEffects(player);
        
        let baseDamage = stage.baseDamage * (1 + 0.08 * wave);
        
        // 应用阶段特殊效果
        if (stage.special) {
          const specialEffect = await stage.special(wave, player);
          baseDamage *= specialEffect.damage;
          battleLog.push(specialEffect.message);
        }
        
        // 心境不稳效果
        if (player.心境不稳) {
          baseDamage *= 1.4;
          battleLog.push(`【心境不稳】伤害增加40%`);
          delete player.心境不稳;
        }
        
        // 下次伤害倍率
        if (player.下次伤害倍率) {
          baseDamage *= player.下次伤害倍率;
          battleLog.push(`【特殊效果】伤害增加${(player.下次伤害倍率-1)*100}%`);
          delete player.下次伤害倍率;
        }
        
        const { damage: finalDamage, messages } = await this.applyTribulationDamage(player, baseDamage,equipment);
        player.当前血量 = Math.max(1, player.当前血量 - finalDamage);
        
        // 功法冷却延长效果
        if (player.功法冷却延长) {
          for (const gongfaName in player.功法) {
            if (player.功法[gongfaName].冷却回合 > 0) {
              player.功法[gongfaName].冷却回合 += player.功法冷却延长;
            }
          }
          battleLog.push(`【时间停滞】所有功法冷却延长${player.功法冷却延长}回合`);
          delete player.功法冷却延长;
        }
        
        this.updateCooldowns(player);

        battleLog.push(
          `第${wave}道劫难：`,
          `造成${bigNumberTransform(finalDamage)}点道伤！`,
          `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
        );
        
        if (messages.length > 0) {
          battleLog.push(...messages);
        }
        
        // 持续恢复效果
        if (player.柳神效果?.持续恢复 && player.柳神效果.持续恢复.回合数 > 0) {
          const heal = player.柳神效果.持续恢复.治疗量;
          player.当前血量 = Math.min(player.血量上限, player.当前血量 + heal);
          player.柳神效果.持续恢复.回合数--;
          battleLog.push(`【生命复苏】恢复${heal}点生命`);
        }
        
          // ==== 检查死亡与复活 ====
    if (player.当前血量 <= 1) {
        const resurrected = await this.checkGongfaResurrection(e, player);
        if (resurrected) {
            battleLog.push(`【逆转生死,欺瞒天地】${player.名号}以无上秘法成功复活，并避开第${wave}道劫数！`);
            await Write_player(usr_qq, player);
            await this.broadcastToAll(player,battleLog.join('\n'));
            battleLog = [];
            
            // 直接进入下一道劫难
            continue;
        } else {
            break;
        }
    }
        
        // 每道劫难间隔
        if (wave < stage.waves) {
          await Write_player(usr_qq, player);
          await this.broadcastToAll(player,battleLog.join('\n'));
          battleLog = [];
          await new Promise(resolve => setTimeout(resolve, 18000)); // 18秒间隔
        }
      }
      
      if (player.当前血量 <= 1) break;
      
      battleLog.push(`成功渡过${stage.name}！`);
      
      // 阶段奖励
      if (stageIndex === 0) {
        player.攻击 *= 1.1;
        battleLog.push(`【混沌洗礼】攻击力提升10%`);
      } else if (stageIndex === 2) {
        player.道心稳固 = true;
        battleLog.push(`【道心通明】心境稳固，不再受心魔影响`);
      } else if (stageIndex === 3) {
        player.防御 *= 1.15;
        player.血量上限 *= 1.2;
        battleLog.push(`【肉身涅槃】防御提升15%，生命上限提升20%`);
      } else if (stageIndex === 6) {
        player.修为 *= 1.2;
        player.血气 *= 1.2;
        battleLog.push(`【时间长河洗礼】修为血气提升20%`);
      } else if (stageIndex === 7) {
        player.元神上限 = (player.元神上限 || 100) * 1.5;
        battleLog.push(`【禅唱缭绕】元神上限提升150%`);
      }
      
      if (stageIndex < stages.length - 1) {
        await Write_player(usr_qq, player);
        await this.broadcastToAll(player,battleLog.join('\n'));
        battleLog = [];
        await new Promise(resolve => setTimeout(resolve, 10000)); // 阶段间10秒间隔
      }
    }

    // ==== 渡劫结果判定 ====
    if (player.当前血量 > 1) {
      player.mijinglevel_id = 15; // 准帝境界
      unlockDaoRealm(player, 15);
      player.准帝重天 = selectedHeaven; // 记录达到的准帝重数
      // 扣除仙道潜力（渡准帝=5点）
      player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 5));
      
      battleLog.push(`【劫尽成帝】`);
      battleLog.push(`雷劫散去，${player.名号}屹立星空，准帝之威震慑九天十地！`);
      battleLog.push(`肉身经过万道锤炼，已近不灭，准帝道果圆满，`);
      battleLog.push(`一念间可穿梭星域，徒手撕裂星辰！`);
      battleLog.push(`「这一世，我为准帝！」道音传遍宇宙边荒！`);
      
      // 根据渡过的重数给予不同奖励
      const heavenReward = {
        1: { attack: 1.2, defense: 1.2, health: 1.2 },
        3: { attack: 1.3, defense: 1.3, health: 1.3 },
        6: { attack: 1.5, defense: 1.5, health: 1.5 },
        9: { attack: 2.0, defense: 2.0, health: 2.0 }
      };
      
      const reward = heavenReward[selectedHeaven];
      player.攻击 *= reward.attack;
      player.防御 *= reward.defense;
      player.血量上限 *= reward.health;
      player.当前血量 = player.血量上限;
      
      battleLog.push(`【${selectedHeaven}重天奖励】攻击提升${(reward.attack-1)*100}%，防御提升${(reward.defense-1)*100}%，生命上限提升${(reward.health-1)*100}%`);
      
      // 本命帝兵淬炼
      if (equipment.帝兵 && !equipment.帝兵.准帝&&equipment.帝兵.author_name === player.id) {
        const 淬体增益 = actual_need_exp * (selectedHeaven / 3);
        equipment.帝兵.atk += Math.floor(淬体增益 * 1.2);
        equipment.帝兵.def += Math.floor(淬体增益 * 1.2);
        equipment.帝兵.HP += Math.floor(淬体增益 * 1.2);
        equipment.帝兵.全属性 += 20 ;
        equipment.帝兵.准帝 = true;

        
        await Write_equipment(usr_qq, equipment);
        battleLog.push(
          `${player.名号}的本命帝兵${equipment.帝兵.name}经历准帝劫淬炼，`,
          `攻击永久+${bigNumberTransform(淬体增益 * 1.2)}`,
          `防御永久+${bigNumberTransform(淬体增益 * 1.2)}`,
          `生命永久+${bigNumberTransform(淬体增益 * 1.2)}`,
          `全属性增加至${equipment.帝兵.全属性}`
        );
      }
      

      
      // 清除道伤
      if (player.道伤) {
        battleLog.push(`【道基重塑】准帝劫淬炼下，所有道伤被修复`);
        delete player.道伤;
      }

    } else {
      battleLog.push(`【渡劫失败】`);
      battleLog.push(`${player.名号}被准帝劫劈碎道果，从星空坠落！`);
      battleLog.push(`准帝符文黯淡，需寻不死神药修复伤体，`);
      battleLog.push(`再积累${bigNumberTransform(actual_need_exp * 5)}修为方可重渡此劫！`);
      
      // 道伤增加
      player.道伤 = (player.道伤 || 0) + 1;
      player.修为 *= 0.4; // 惩罚更重
      player.血气 *= 0.4;
      
      battleLog.push(`道伤增加，当前道伤：${player.道伤}/2`);
      
      // 如果道伤超过2，永久无法再渡准帝劫
      if (player.道伤 >= 2) {
        player.无法渡准帝劫 = true;
        battleLog.push(`【道基尽毁】道伤过重，永久无法再渡准帝劫！`);
      }
    }

    this.clearTempEffects(player);
    await Write_player(usr_qq, player);
    e.reply(battleLog.join('\n'));
    // ===== 渡劫结束，重算全装属性 =====
    await this.exitTribulationState(player, _tribSnap5, usr_qq, equipment);
  }
  async command_zhengdao(e) {
    if (!verc({ e })) return false;
    
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player = await Read_player(usr_qq);
    const equipment = await Read_equipment(usr_qq);

    // 先确认帝路境界，避免低境界玩家提前触发天心与准帝法则判断
    if (player.mijinglevel_id < 15) {
        const levelName = data.Levelmijing_list.find(l => l.level_id === player.mijinglevel_id)?.level || "未知境界";
        e.reply([
            `证道成帝需达到准帝九重天！`,
            `你当前的证道体系仅到达 ${levelName}`
        ].join("\n"));
        return false;
    }
    if (player.mijinglevel_id >= 16) {
        e.reply(`你早已成就帝位，不可重复证道`);
        return false;
    }
    
    // 检查当世是否已有大帝（天心印记持有者）
    const hasHeavenHeartMark = await this.checkHeavenHeartMark(usr_qq);
    const now = Date.now();

    // 护道状态是限时证道窗口，过期后不应继续绕过天心压制
    if (player.护道状态 && Number(player.护道状态) <= now) {
      delete player.护道状态;
      await Write_player(usr_qq, player);
    }

    const zhengdaoDecision = resolveZhengdaoRoute(player, hasHeavenHeartMark, now);
    const isAboveAllDaos = zhengdaoDecision.route === ZHENGDAO_ROUTES.ABOVE_ALL_DAOS;
    const isProtectedZhengdao = zhengdaoDecision.route === ZHENGDAO_ROUTES.PROTECTED;
    
    // 普通体质既无护道者开路，也无法自行凌驾万道
    if (zhengdaoDecision.route === ZHENGDAO_ROUTES.BLOCKED) {
        e.reply([
            `【天心印记·帝路断绝】`,
            `${player.名号}欲证道成帝，却感天地大道压制！`,
            `当世已有大帝存在，天心印记镇压万道！`,
            `唯有大成荒古圣体、先天圣体道胎、混沌体、先天混沌圣体道胎，`,
            `方可不借天心，凌驾万道成帝！`,
            `其余修士需请当世大帝轰击天地万道，开辟限时证道契机。`
        ].join("\n"));
        return false;
    }
    
    /* ========== 仙道潜力检查（证道成帝=6点） ========== */
    {
      const potentialCost = applyQuestionFortuneCost(player, 6);
      const currentPotential = player.仙道潜力 || 0;
      if (currentPotential < potentialCost) {
        return e.reply([
          `【仙道潜力不足·证道受阻】`,
          `${player.名号}欲证道成帝，却感仙道潜力枯竭，帝道之门紧闭！`,
          `当前仙道潜力：${currentPotential} 点`,
          `证道成帝所需：${potentialCost} 点`,
          `「无潜力者，帝道断绝，需补足仙道潜力方可踏上帝路！」`
        ].join('\n'));
      }
    }
    /* ========== 仙道潜力检查结束 ========== */

    if (!(await this.checkWudaoGate(e, player, usr_qq, 15))) return false;
    
    // 获取时代信息
    const set = config.getConfig('xiuxian', 'xiuxian');
    const currentEra = set.Era?.current || { index: 0, years: 0 };
    
    // 时代系统配置
    const eraCostRates = [3.0, 3.5, 4.0, 6.0, 8.0]; // 准帝劫消耗极大
    const eraDifficultyRates = [1, 2, 3, 5, 7];
    const eraNames = ["神话时代", "太古时代", "天命时代", "末法时代", "绝灵时代"];
    
    const difficultyRate = eraDifficultyRates[currentEra.index];
    const costRate = eraCostRates[currentEra.index];
    const eraName = eraNames[currentEra.index];
    const eraBoost = difficultyRate; // 使用难度系数作为时代加成
    const challengeDifficultyRate = difficultyRate * zhengdaoDecision.difficultyMultiplier;
    const costModifier = costRate !== 1.0 ? `(×${costRate})` : "";
    
    // 计算实际需求
    const base_need_exp = Math.pow(2, 15) * 250000;
    const actual_blood_need = applyQuestionFortuneCost(player, Math.ceil(base_need_exp * costRate));
    const actual_need_exp = this.getMinggeCultivationCost(player, actual_blood_need, 'zhengdao');
    const minggeCostLine = this.getMinggeCostLine(player, actual_blood_need, 'zhengdao');
    const exp2 = Math.max(0, actual_need_exp - player.修为);
    const exp3 = Math.max(0, actual_blood_need - player.血气);
    
    // 资源检查
    if (player.修为 < actual_need_exp) {
        e.reply([
            `修为不足以证道成帝！`,
            `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
            `基础需求: ${base_need_exp.toLocaleString()}`,
            `实际需求: ${actual_need_exp.toLocaleString()} ${costModifier}`,
            ...(minggeCostLine ? [minggeCostLine] : []),
            `还需修为: ${exp2.toLocaleString()}`
        ].join("\n"));
        return false;
    }
    if (player.血气 < actual_blood_need) {
        e.reply([
            `血气不足以证道成帝！`,
            `当前时代: ${eraName} ${costRate !== 1.0 ? `(消耗${costRate > 1 ? '增加' : '减少'}${Math.abs(100 - costRate*100)}%)` : ''}`,
            `基础需求: ${base_need_exp.toLocaleString()}`,
            `实际需求: ${actual_blood_need.toLocaleString()} ${costModifier}`,
            `还需血气: ${exp3.toLocaleString()}`
        ].join("\n"));
        return false;
    }
    
    // ==== 道伤检查 ====
    if (player.道伤 && player.道伤 >= 2) {
        return e.reply([
            `【道基受损·难以证道】`,
            `${player.名号}道基受损严重，已有${player.道伤}处道伤，`,
            `强行证道必死无疑！需先寻不死药或仙珍修复道基。`,
            `推荐：真龙不死药、麒麟神药、九妙不死药、天命石、造化源眼`
        ].join('\n'));
    }
    
    
    // ==== 扣除资源 ====
    player.修为 -= actual_need_exp;
    player.血气 -= actual_blood_need;
    
    // ===== 天道排斥外物，进入渡劫状态 =====
    const _tribSnap6 = this.enterTribulationState(player, equipment);

    // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
    const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

// ==== 推送全服公告 ====
let startMsg;
if (isAboveAllDaos) {
    startMsg = [
        `【逆天证道·凌驾万道】`,
        `轰！！！`,
        `当世帝印与宇宙万道同时复苏，欲镇杀后来者！`,
        `「${player.名号}」身负${zhengdaoDecision.physique.name}，不退反进，直入帝劫！`,
        zhengdaoDecision.physique.opening,
        zhengdaoDecision.physique.mechanism,
        `此劫若成，其道果将不寄托天心，而是凌驾于万道之上！`,
        `宇宙八荒尽皆失声，连当世大帝都向雷海投来目光！`
    ].join("\n");
} else if (isProtectedZhengdao) {
    startMsg = [
        `【帝血开路·诸帝并存】`,
        `轰！！！`,
        `护道者留下的大道裂隙尚未闭合，天心压制被暂时撕开！`,
        `「${player.名号}」抓住这唯一的契机，闯入帝劫！`,
        `此路不夺当世天心，只在万道之外另立自身帝道！`
    ].join("\n");
} else {
    startMsg = [
        `【诸天震动·帝劫启】`,
        `轰！！！`,
        `宇宙边荒，一道惊世神光撕裂星海，照亮了万古长夜！`,
        `「${player.名号}」于${eraName}末路，逆天而行，欲证道成帝！`,
        `天心印记震颤，万道哀鸣，整片古史都在颤抖！`,
        `无数沉睡的古皇、至尊自禁区中苏醒，`,
        `冰冷的目光跨越时空，注视着这逆天之举！`,
        `"这一世，又要有人踏上帝路了吗？"`,
        `宇宙八荒，所有修士皆心生感应，抬头望天，`,
        `只见雷海漫天，混沌气汹涌，一场旷世帝劫即将开启！`
    ].join("\n");
}
await this.broadcastToAll(player,startMsg);

// ==== 开始证道劫 ====
let battleLog = [
    `【帝劫启·万古颤】`,
    `轰隆！！！`,
    isAboveAllDaos
      ? zhengdaoDecision.physique.opening
      : `${player.名号}屹立宇宙边荒，周身帝道神光冲霄，淹没了整片星域！`,
    `准帝九重天的气息毫无保留地释放，一颗又一颗死寂古星在威压下炸开！`,
    `"来吧！让我看看这帝劫能否阻我证道！"`,
    `话音未落，第一道雷光便已劈落，粗大如星河，照亮了黑暗的宇宙，`,
    `所过之处，虚空崩塌，法则湮灭，无数大星化为齑粉！`,
    `这已不是寻常雷劫，而是天地大道的具现化，`,
    `每一缕电芒都蕴含着灭世之力，足以让寻常准帝饮恨！`,
    `当前时代：${eraName} (天道压制:${difficultyRate.toFixed(1)}倍)`,
    isAboveAllDaos
      ? `凌驾万道：当世帝印额外压制${zhengdaoDecision.difficultyMultiplier.toFixed(1)}倍`
      : `证道方式：${zhengdaoDecision.route}`,
    `燃烧修为：${actual_need_exp.toLocaleString()}年苦修`,
    `献祭血气：${actual_blood_need.toLocaleString()}载积累`,
    ...(minggeCostLine ? [minggeCostLine] : [])
];
    
    // ==== 证道劫阶段 ====
    const allStages = [
        { 
            name: "万道枷锁", 
            waves: 9,
            baseDamage: maxAtk * 0.5 * challengeDifficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大帝,
            desc: [
                `天道降下万道枷锁，欲将逆天者束缚！`,
                `每一道枷锁都蕴含一种大道法则，`,
                `唯有打破所有枷锁，方能超脱天道！`
            ],
            special: async (wave, player) => {
                const lockTypes = [
                    { name: "时间枷锁", damageMult: 1.8, desc: "时间停滞，行动困难" },
                    { name: "空间枷锁", damageMult: 1.9, desc: "空间凝固，无法闪避" },
                    { name: "因果枷锁", damageMult: 2.2, desc: "因果倒转，伤害反弹" },
                    { name: "命运枷锁", damageMult: 2.5, desc: "命运长河显化，锁定命运" },
                    { name: "轮回枷锁", damageMult: 2.3, desc: "六道轮回，神魂震荡" }
                ];
                
                const effect = lockTypes[wave % lockTypes.length];
                return {
                    damage: effect.damageMult,
                    message: `【${effect.name}】${effect.desc}，伤害提升${(effect.damageMult-1)*100}%`
                };
            }
        },
        {
            name: "心魔劫",
            waves: 9,
            baseDamage: maxAtk * 0.8 * challengeDifficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大帝,
            desc: [
                `证道心魔劫，直指道心最深处！`,
                `过往一切遗憾、恐惧、执念具现化！`,
                `亲人陨落、道途挫折、红颜薄命、证道失败...`,
                `唯有斩断一切执念，方能道心通明！`
            ],
            special: async (wave, player) => {
                const heartDevils = [
                    { 
                        effect: "道心裂痕", 
                        desc: "道心出现裂痕，全属性暂时降低20%",
                        apply: (player) => {
                            player.攻击 *= 0.8;
                            player.防御 *= 0.8;
                            player.血量上限 *= 0.8;
                        }
                    },
                    { 
                        effect: "心魔噬魂", 
                        desc: "心魔直接攻击神魂，下一次伤害翻倍",
                        apply: (player) => {
                            player.下次伤害倍率 = 2.2;
                        }
                    },
                    { 
                        effect: "往事心结", 
                        desc: "修炼路上的遗憾重现，真气紊乱",
                        apply: (player) => {
                            player.当前血量 *= 0.85;
                            player.修为 *= 0.9;
                        }
                    },
                    { 
                        effect: "未来恐惧", 
                        desc: "看见自己证道失败的未来，心生恐惧",
                        apply: (player) => {
                            player.元神 *= 0.6;
                            player.元神上限 *= 0.6;
                        }
                    },
                    { 
                        effect: "红颜劫", 
                        desc: "情劫显现，道心波动",
                        apply: (player) => {
                            player.心境不稳 = true;
                            player.当前血量 *= 0.75;
                        }
                    },
                    { 
                        effect: "道友劫", 
                        desc: "昔日道友成为心魔，道心受损",
                        apply: (player) => {
                            player.道伤 = (player.道伤 || 0) + 0.5;
                            player.当前血量 *= 0.8;
                        }
                    }
                ];
                
                const devil = heartDevils[wave % heartDevils.length];
                devil.apply(player);
                
                return {
                    damage: 1.8,
                    message: `【心魔劫·${devil.effect}】${devil.desc}`
                };
            }
        },
        {
            name: "帝兵劫",
            waves: 9,
            baseDamage: maxAtk * 1.2 * challengeDifficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大帝,
            desc: [
                `雷劫演化极道帝兵，进行终极攻伐！`,
                `不仅有无始钟、虚空镜等已知帝兵，`,
                `还有神话时代、乱古时代的未知帝兵显化！`,
                `这是天地间最强大的攻伐，非大帝不可抵挡！`
            ],
            special: async (wave, player) => {
                const imperialWeapons = [
                    { 
                        name: "无始钟", 
                        effect: "镇压时空", 
                        desc: "钟声一响，时空凝固，行动困难",
                        damageMult: 3.0
                    },
                    { 
                        name: "虚空镜", 
                        effect: "放逐虚空", 
                        desc: "镜光照耀，将被击中的部位放逐到未知虚空",
                        damageMult: 2.8
                    },
                    { 
                        name: "吞天魔罐", 
                        effect: "吞噬本源", 
                        desc: "魔罐旋转，吞噬生命本源和修为",
                        damageMult: 3.2
                    },
                    { 
                        name: "荒塔", 
                        effect: "镇压炼化", 
                        desc: "九层荒塔镇压而下，炼化万物",
                        damageMult: 3.1
                    },
                    { 
                        name: "诛仙四剑", 
                        effect: "诛仙剑阵", 
                        desc: "四剑齐出，布下诛仙剑阵，非四圣不可破",
                        damageMult: 3.5
                    }
                ];
                
                const weapon = imperialWeapons[wave % imperialWeapons.length];
                
                // 如果有帝兵，可能触发特殊互动
                if (equipment.帝兵) {
                    const interaction = Math.random() > 0.6;
                    if (interaction) {
                        const damageReduction = 0.6 + (Math.random() * 0.2);
                        return {
                            damage: weapon.damageMult * damageReduction,
                            message: `【${weapon.name}】${weapon.desc}，但${equipment.帝兵.name}自主复苏，抵消部分威能`
                        };
                    }
                }
                
                return {
                    damage: weapon.damageMult,
                    message: `【${weapon.name}】${weapon.desc}，极道神威无可匹敌！`
                };
            }
        },
        {
            name: "天道审判",
            waves: 1,
            baseDamage: maxAtk * 6.0 * challengeDifficultyRate * ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS.大帝,
            desc: [
                `最终审判！天道显化，降下终极一击！`,
                `这是天地对逆天者的最终考验！`,
                `要么超脱天地，成就无上大帝！`,
                `要么身死道消，化为宇宙尘埃！`
            ],
            special: async (wave, player) => {
                return {
                    damage: 6.0 + (Math.random() * 3.0),
                    message: `【天道审判】天地不容逆天者，降下终极毁灭！`
                };
            }
        }
    ];
    
    // ==== 分阶段渡劫 ====
    let accumulatedPower = 0; // 积累的天地威能
    let battleSuccess = true;
    
    for (let stageIndex = 0; stageIndex < allStages.length; stageIndex++) {
        const stage = allStages[stageIndex];
        
        // 初始化跳过标记
        stage.skippedWave = null;
        
        battleLog.push(`【第${stageIndex + 1}阶段：${stage.name}】`);
        battleLog.push(...stage.desc);
        
        for (let wave = 1; wave <= stage.waves; wave++) {
            this.clearTempEffects(player);
            
            
            let baseDamage = stage.baseDamage * (1 + 0.08 * wave);
            
            // 应用阶段特殊效果
            if (stage.special) {
                const specialEffect = await stage.special(wave, player);
                baseDamage *= specialEffect.damage;
                battleLog.push(specialEffect.message);
            }
            
            // 心境不稳效果
            if (player.心境不稳) {
                baseDamage *= 1.4;
                battleLog.push(`【心境不稳】伤害增加40%`);
                delete player.心境不稳;
            }
            
            // 下次伤害倍率
            if (player.下次伤害倍率) {
                baseDamage *= player.下次伤害倍率;
                battleLog.push(`【特殊效果】伤害增加${(player.下次伤害倍率-1)*100}%`);
                delete player.下次伤害倍率;
            }
            
            const { damage: finalDamage, messages } = await this.applyTribulationDamage(player, baseDamage,equipment);
            player.当前血量 = Math.max(1, player.当前血量 - finalDamage);
            
            // 功法冷却延长效果
            if (player.功法冷却延长) {
                for (const gongfaName in player.功法) {
                    if (player.功法[gongfaName].冷却回合 > 0) {
                        player.功法[gongfaName].冷却回合 += player.功法冷却延长;
                    }
                }
                battleLog.push(`【时间停滞】所有功法冷却延长${player.功法冷却延长}回合`);
                delete player.功法冷却延长;
            }
            
            this.updateCooldowns(player);

            battleLog.push(
                `第${wave}道劫难：`,
                `造成${bigNumberTransform(finalDamage)}点道伤！`,
                `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
            );
            
            if (messages.length > 0) {
                battleLog.push(...messages);
            }
            
            // 持续恢复效果
            if (player.柳神效果?.持续恢复 && player.柳神效果.持续恢复.回合数 > 0) {
                const heal = player.柳神效果.持续恢复.治疗量;
                player.当前血量 = Math.min(player.血量上限, player.当前血量 + heal);
                player.柳神效果.持续恢复.回合数--;
                battleLog.push(`【生命复苏】恢复${heal}点生命`);
            }
            
          // ==== 检查死亡与复活 ====
    if (player.当前血量 <= 1) {
        const resurrected = await this.checkGongfaResurrection(e, player);
        if (resurrected) {
            battleLog.push(`【逆转生死,欺瞒天地】${player.名号}以无上秘法成功复活，并避开第${wave}道劫数！`);
            await Write_player(usr_qq, player);
            await this.broadcastToAll(player,battleLog.join('\n'));
            battleLog = [];
            
            // 直接进入下一道劫难
            continue;
        } else {
            battleSuccess = false;
            break;
        }
    }
            
            // 每道劫难间隔
            if (wave < stage.waves) {
                await Write_player(usr_qq, player);
                await this.broadcastToAll(player,battleLog.join('\n'));
                battleLog = [];
                await new Promise(resolve => setTimeout(resolve, 18000)); // 18秒间隔
            }
        }
        
        if (!battleSuccess) break;
        
        battleLog.push(`成功渡过${stage.name}！`);
        
        // 阶段奖励
        if (stageIndex === 0) {
            player.攻击 *= 1.1;
            battleLog.push(`【万道洗礼】攻击力提升10%`);
        } else if (stageIndex === 1) {
            player.道心稳固 = true;
            battleLog.push(`【道心通明】心境稳固，不再受心魔影响`);
        } else if (stageIndex === 2) {
            player.防御 *= 1.15;
            player.血量上限 *= 1.2;
            battleLog.push(`【帝兵淬体】防御提升15%，生命上限提升20%`);
        }
        
        if (stageIndex < allStages.length - 1 && battleSuccess) {
            await Write_player(usr_qq, player);
            await this.broadcastToAll(player,battleLog.join('\n'));
            battleLog = [];
            await new Promise(resolve => setTimeout(resolve, 10000)); // 阶段间10秒间隔
        }
    }
    
    // 如果证道劫失败
    if (!battleSuccess) {
        // 道伤增加
        player.道伤 = (player.道伤 || 0) + 1;
        player.修为 *= 0.4; // 惩罚更重
        player.血气 *= 0.4;

        battleLog.push(`【证道失败】`);
        battleLog.push(`${player.名号}被证道劫劈碎道果，从星空坠落！`);
        battleLog.push(`道基受损，需寻不死神药修复伤体，`);
        battleLog.push(`再积累${bigNumberTransform(actual_need_exp * 5)}修为方可重证此道！`);
        battleLog.push(`道伤增加，当前道伤：${player.道伤}/2`);
                // 证道失败文案
const startMsg = [
    `【证道失败·帝路断绝】`,
    `咔嚓...`,
    `${player.名号}的道果出现裂痕，最终彻底崩碎！`,
    `帝劫无情，将其从星空击落，血染长空！`,
    `"这一世...终究还是失败了..."`,
    `无数观望的修士叹息，又一位天骄倒在了帝路上。`,
    `天地同悲，万道沉寂，整片宇宙都笼罩在悲伤中。`,
    `但帝路不断，后来者仍将前赴后继，`,
    `只为那虚无缥缈的成帝契机！`
];
await this.broadcastToAll(player,startMsg);
        // 如果道伤超过2，永久无法再证道
        if (player.道伤 >= 2) {
            player.无法证道 = true;
            battleLog.push(`【帝路断绝】道基尽毁，此生若不修复道基则无法再证道成帝！`);
        }
        
        this.clearTempEffects(player);
        await Write_player(usr_qq, player);
        // ===== 渡劫结束，重算全装属性 =====
        await this.exitTribulationState(player, _tribSnap6, usr_qq, equipment);
        return e.reply(battleLog.join('\n'));
    }
    
    // ==== 大帝意志阵列 ====
    const emperors = [
        { name: "太阳圣皇", desc: "扶桑神树，耀照九天", quote: "帝路茫茫，唯道可证", basePower: 7.5e8 },
        { name: "青帝", desc: "万古青天一株莲", quote: "天道无常，我道永恒", basePower: 8.2e8 },
        { name: "虚空大帝", desc: "虚空无垠，道化万古", quote: "虚空不灭，大道永存", basePower: 8.8e8 },
        { name: "斗战圣皇", desc: "战天斗地，不敬仙神", quote: "战无不胜，攻无不克", basePower: 9.0e8 },
        { name: "狠人大帝", desc: "一念花开，君临天下", quote: "不为成仙，只为在这红尘中等你归来", basePower: 9e8 },
        { name: "无始大帝", desc: "仙路尽头谁为峰，一见无始道成空", quote: "我道成时，天地俯首", basePower: 9.5e8 }
    ];
    
    let battleCount = 0;
    battleSuccess = true;
    
    for (const emperor of emperors) {
        battleCount++;
        
        // 创建大帝虚影（BB_player）
        const BB_player = createEmperorPlayer(
            emperor.name,
            battleCount,
            player,
            challengeDifficultyRate
        );
        
        // 恢复玩家血量
        player.当前血量 = player.血量上限;
        await Write_player(usr_qq, player); 
        
        // 战斗预告
        const prebattleMsg = [
            `第${battleCount}战：${emperor.name}意志降临！`,
            `「${emperor.desc}」`,
            `道音："${emperor.quote}"`,
            `气血：${bigNumberTransform(BB_player.当前血量)} | 攻击：${bigNumberTransform(BB_player.攻击)}`,
            eraBoost > 1 ? `【${eraName}加持】威能提升${(eraBoost-1)*100}%` : ""
        ];
        await e.reply(prebattleMsg.join("\n"));
        await sleep(5000);
        
        // 进行战斗
        const battleResult = await zd_battle(player, BB_player);
        
        // 更新玩家血量
        player.当前血量 = battleResult.A_hp;
        await Write_player(usr_qq, player);
         let msg = battleResult.msg;
      if (msg.length <= 30) await ForwardMsg(e, msg);
      else {
        let msgg = JSON.parse(JSON.stringify(msg));
        msgg.length = 30;
        await ForwardMsg(e, msgg);
        e.reply('战斗过长，仅展示部分内容');
      }
        
        // 结果解释调整
        if (battleResult.A_hp <= 0) {
            // 玩家战败
            battleSuccess = false;
            
            // 时代惩罚机制
            const penaltyFactor = costRate > 1.0 ? costRate : 1.0;
            const powerLoss = battleCount * emperor.basePower * penaltyFactor;
            const attackLoss = Math.round(powerLoss * 0.4);
            const defenseLoss = Math.round(powerLoss * 0.3);
            const hpLoss = Math.round(powerLoss * 0.3);
            
            player.攻击加成 -= attackLoss;
            player.防御加成 -= defenseLoss;
            player.生命加成 -= hpLoss;
            player.mijinglevel_id = Math.max(1, player.mijinglevel_id - 1);
            
            await Write_player(usr_qq, player);
            
            // 失败结局
            await e.reply([
                `${player.名号}败于${emperor.name}之手！`,
                `证道之路断绝！天道惩罚：`,
                `境界跌落：${player.mijinglevel_id}重天`,
                `攻击损失: ${bigNumberTransform(attackLoss)}`,
                `防御损失: ${bigNumberTransform(defenseLoss)}`,
                `生命损失: ${bigNumberTransform(hpLoss)}`,
                eraName !== "天命时代" ? `【${eraName}天罚】惩罚增强${(penaltyFactor-1)*100}%` : ""
            ].join('\n'));
            
            break; // 终止后续挑战
        } else if (battleResult.B_hp <= 0) {
            // 战胜大帝的奖励
            const powerReward = emperor.basePower * difficultyRate;
            const attackReward = Math.round(powerReward * 0.4);
            const defenseReward = Math.round(powerReward * 0.3);
            const hpReward = Math.round(powerReward * 0.3);
            
            player.攻击加成 += attackReward;
            player.防御加成 += defenseReward;
            player.生命加成 += hpReward;
            accumulatedPower += powerReward;
            
            await Write_player(usr_qq, player);
            
            await e.reply([
                `【战败古帝·道果初成】`,
    `轰！${emperor.name}的虚影逐渐消散，`,
    `化作一道精纯的帝道法则融入${player.名号}体内！`,
    `"后生可畏..."`,
    `${emperor.name}留下最后的赞叹，彻底归于虚无。`,
    `${player.名号}的道果更加圆满，距离帝位更近一步！`,
                `攻击获得: ${bigNumberTransform(attackReward)}`,
                `防御获得: ${bigNumberTransform(defenseReward)}`,
                `生命获得: ${bigNumberTransform(hpReward)}`,
                difficultyRate < 1 ? `【${eraName}馈赠】奖励增强${(1/difficultyRate-1)*100}%` : ""
            ].join('\n'));
            
            if (battleCount < emperors.length) {
                await sleep(3000);
                await e.reply(` 准备迎战下一位古帝意志...`);
                await sleep(2000);
            }
        }
    }
    
    // 最终证道结果
    if (battleSuccess) {
        player.mijinglevel_id = 16;
        player.道伤=0;
        // 扣除仙道潜力（证道成帝=6点）
        player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 6));

        player.无法证道=false;
        // 生成帝号
        const titleComponents = emperors.map(e => e.name.charAt(0)).join('');
        const divineAppellation = getDivineAppellation();
        player.di_wei = "天帝";
        player.帝号 = `${titleComponents}${divineAppellation}天帝`;
        
        // 最终属性奖励
        const finalPowerBonus = Math.round(accumulatedPower * 2);
        player.攻击加成 += finalPowerBonus;
        player.防御加成 += finalPowerBonus;
        player.生命加成 += finalPowerBonus;
        
        // 天心合道独占天心；其他路线在万道之外另立自身帝道
        const successState = getZhengdaoSuccessState(zhengdaoDecision.route);
        player.证道方式 = successState.zhengdaoMethod;
        player.天心印记 = successState.heavenHeartMark;
        markDaoAsEmperor(player, successState.zhengdaoMethod);
        delete player.护道状态;
        
        await Write_player(usr_qq, player);

        let successReply;
        let successBroadcast;
        if (isAboveAllDaos) {
            successReply = [
                `【逆天成帝·凌驾万道】`,
                `${player.名号}以${zhengdaoDecision.physique.name}击穿天心，成功证道成帝！`,
                `诸天尊号：${player.帝号}`,
                `证道方式：${player.证道方式}`,
                `时代背景：${eraName}`,
                `资源消耗：${actual_need_exp.toLocaleString()} ${costModifier}`,
                `最终属性提升：${bigNumberTransform(finalPowerBonus)}`,
                `真身踏于万道之上，道果不寄托天心！`,
                `当世帝印仍在，而诸天自此再添一尊无缺大帝！`,
            ];
            successBroadcast = [
                `【证道成功·万道之上】`,
                `轰！！！！！！`,
                `天心印记与宇宙万道同时裂开，一道帝影自九天之外降临！`,
                `${player.名号}立身万道之上，将当世帝印与诸天法则尽数踏在脚下！`,
                `其道果不与天心相合，却绽放出无缺大帝的盖世威压！`,
                `"天心非我道，万道在我下！这一世，我为${player.帝号}！"`,
                `自此诸帝并存，一条前所未有的帝路烙印在古史中！`
            ];
        } else if (isProtectedZhengdao) {
            successReply = [
                `【护道成帝·另立帝道】`,
                `${player.名号}借护道者开辟的万道裂隙，成功证道成帝！`,
                `诸天尊号：${player.帝号}`,
                `证道方式：${player.证道方式}`,
                `时代背景：${eraName}`,
                `资源消耗：${actual_need_exp.toLocaleString()} ${costModifier}`,
                `最终属性提升：${bigNumberTransform(finalPowerBonus)}`,
                `此道不夺当世天心，于万道之外自成一域！`,
            ];
            successBroadcast = [
                `【证道成功·诸帝并立】`,
                `护道者撕开的万道裂隙中，第二种无缺帝道冲霄而起！`,
                `${player.名号}不与当世天心相争，于诸天之外证得${player.帝号}道果！`,
                `这一世不再一帝独尊，诸帝并存的古史由此开启！`
            ];
        } else {
            successReply = [
                `大道共鸣！诸天齐贺！`,
                `${player.名号}成功证道成帝！`,
                `诸天尊号：${player.帝号}`,
                `时代背景：${eraName}`,
                `资源消耗：${actual_need_exp.toLocaleString()} ${costModifier}`,
                `最终属性提升：${bigNumberTransform(finalPowerBonus)}`,
                `【天心印记】`,
                `天道认可，授予天心印记！`,
                `此时代唯你独尊，镇压万道！`,
            ];
            successBroadcast = [
                `【证道成功·大帝诞生】`,
                `轰！！！！！！`,
                `万道共鸣，诸天齐贺！整片宇宙都在颤抖！`,
                `${player.名号}屹立雷海中央，周身帝气弥漫，`,
                `一道璀璨的天心印记自虚空凝聚，没入其眉心！`,
                `"这一世，我为${player.帝号}！"`,
                `道音传遍九天十地，所有修士心生感应，`,
                `不由自主地跪伏在地，朝拜这新诞生的大帝！`,
                `天降祥瑞，地涌金莲，宇宙边荒绽放无尽仙光，`,
                `一个新的时代，由此开启！`
            ];
        }

        await e.reply(successReply.join("\n"));
        await this.broadcastToAll(player, successBroadcast);
    } else {
        // 证道失败结局
        await e.reply([
            `【证道失败】`,
            `${player.名号}被大帝意志击败，证道之路断绝！`,
            `道基受损，需寻不死神药修复伤体，目前道伤：${player.道伤}`,
            `再积累${bigNumberTransform(actual_need_exp * 5)}修为方可重证此道！`
        ].join('\n'));
    }
    
    // ===== 渡劫结束，重算全装属性 =====
    await this.exitTribulationState(player, _tribSnap6, usr_qq, equipment);
    return true;
}
/**
 * 破王成帝（生命本源版）
 * 死亡标准：生命本源 ≤ 0
 * 挑战门槛：生命本源 ≥ 50
 * 失败惩罚：−50 本源 + 24 h CD + 修为/血气 7 折
 */
async poWangChengDi(e) {
  if (!e.isGroup) return e.reply('修仙游戏请在群聊中游玩');

  const usr_qq = e.user_id.toString().replace('qg_', '');
  let player = await Read_player(usr_qq);
  const equipment = await Read_equipment(usr_qq);

  /* ====== 基础校验 ====== */
  if (player.mijinglevel_id !== 19)
    return e.reply('仅仙道领域——仙王巨头可破王成帝');
  if (player.破王成帝 && Date.now() / 1000 < player.破王成帝)
    return e.reply('你道基未愈，暂不可再次冲击帝位');
  player.生命本源 = player.生命本源 ?? 100;
  if (player.生命本源 < 50)
    return e.reply(`生命本源不足（当前 ${player.生命本源}，需 ≥ 50）`);

  /* ====== 时代系数 ====== */
  const set = config.getConfig('xiuxian', 'xiuxian');
  const currentEra = set.Era?.current || { index: 2 };
  const costRates = [0.75, 0.8, 1.0, 2.0, 3.0];
  const diffRates = [0.8, 0.9, 1.0, 1.2, 1.5];
  const costRate = costRates[currentEra.index];
  const diffRate = diffRates[currentEra.index];

  /* ====== 资源检查 ====== */
  const baseNeed = Math.pow(2, 15) * 250000;
  const bloodNeed = applyQuestionFortuneCost(player, Math.ceil(baseNeed * costRate));
  const realNeed = this.getMinggeCultivationCost(player, bloodNeed, 'zhengdao');
  const minggeCostLine = this.getMinggeCostLine(player, bloodNeed, 'zhengdao');
  if (player.修为 < realNeed || player.血气 < bloodNeed)
    return e.reply([
      `资源不足以破王成帝！`,
      `需修为：${realNeed.toLocaleString()}`,
      `需血气：${bloodNeed.toLocaleString()}`,
      ...(minggeCostLine ? [minggeCostLine] : []),
      `当前修为：${player.修为.toLocaleString()}`,
      `当前血气：${player.血气.toLocaleString()}`
    ].join('\n'));

/* ====== 扣资源 & 初始化 ====== */
player.修为 -= realNeed;
player.血气 -= bloodNeed;
player.生命本源 = player.生命本源 ?? 100;
const totalShackles = 30;
player.神明枷锁 = totalShackles;
player.神明之光 = 0;
player.破王成帝 = 0;          // 0 表示进行中

/* ------ 新增：护法血量实时快照 ------ */
if (player.护法玩家) {
  player.护法玩家.当前血量 = Math.floor(player.护法玩家.当前血量 * 3);
  player.护法玩家.血量上限 = player.护法玩家.当前血量;
}

await Write_player(usr_qq, player);

// ===== 天道排斥外物，进入渡劫状态 =====
const _tribSnap7 = this.enterTribulationState(player, equipment);

  // ===== 计算理论最大攻击（雷劫威力不再依赖玩家当前攻击） =====
  const { maxAtk, formationShift, kuluoShift, qitianMessage } = this.calcMaxAtkWithTribulationShifts(player, equipment);

  let log = [
    `【破王成帝·帝劫启】`,
    `${player.名号}欲破王称帝，引动诸天震荡！`,
    `融合第六秘境「举头三尺有神明」，头顶小人浮现，其周身缠绕${totalShackles}道大道枷锁！`,
    `消耗修为：${realNeed.toLocaleString()} 消耗血气：${bloodNeed.toLocaleString()}`,
    ...(minggeCostLine ? [minggeCostLine] : [])
  ];
  await e.reply(log.join('\n'));
  log = [];

  /* ====== 枷锁循环（30 道，30 s 一道） ====== */
  let broken = 0;
  let checkDone = null;
  const lockInterval = setInterval(async () => {
    try {
          /* ------ 新增：护法血量同步（防止护法者中途回血/受伤） ------ */
    if (player.护法玩家) {
      const prot = await Read_player(player.护法玩家.名字); // 用名号反查 QQ
      player.护法玩家.当前血量 = Math.floor(prot.当前血量 * 3);
      player.护法玩家.血量上限 = player.护法玩家.当前血量;
    }
      if (broken >= totalShackles) { clearInterval(lockInterval); return; }

      /* 每道扣 55 % 当前血量的“道伤” */
      let raw = player.当前血量 * 0.55;
      const { damage: dmg, messages } = await this.applyTribulationDamage(player, raw, equipment);
      player.当前血量 = Math.max(1, player.当前血量 - dmg);
      broken++;
      player.神明枷锁--;

      log.push(
        `【第 ${broken} 道枷锁崩断！】`,
        `- 几大秘境剧烈摇颤，天地大道哀鸣！`,
        `- 体魄龟裂，满身伤痕，几乎要炸开了，王血染红虚空！`,
        `- 头顶神明小人光芒大盛，大道符文流转不息！`,
        `造成 ${bigNumberTransform(dmg)} 点道伤 剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
      );
      if (messages.length) log.push(...messages);

      /* 每 10 层神明下降一尺 */
      if (broken % 10 === 0) log.push(`【神明降临】头顶小人下降 ${broken / 10} 尺！神威浩荡，整片宇宙都在颤栗！！`);

      /* 15 道触发不朽之王 or 莫晓羽庇护 */
      if (broken === 15) log.push(...(await this.attackBySupremes(player, diffRate, e)));

      await Write_player(usr_qq, player);
      await e.reply(log.join('\n'));
      log = [];

      /* ====== 死亡判定：生命本源 ≤ 0 ====== */
      if (player.当前血量 <= 1) {
        const resurrected = await this.checkGongfaResurrection(e, player);
        if (!resurrected) {
          clearInterval(lockInterval);
          if (checkDone) clearInterval(checkDone);
          /* 失败惩罚 */
          player.生命本源 -= 50;
          player.修为 *= 0.7;
          player.血气 *= 0.7;
          player.破王成帝 = Math.floor(Date.now() / 1000) + 86400; // 24 h CD
          player.当前血量 = 1;
          /* ------ 新增：解除双方护法关系 ------ */
          await this.clearProtectorRelation(player);
          await Write_player(usr_qq, player);
          await e.reply([
            `【帝路崩断·道基受损】`,
            `${player.名号}终究未能打破桎梏，帝路崩断！`,
            `生命本源 −50（剩余 ${player.生命本源}）`,
            `需修养 24 时辰，以无上神物修复道基方能再战帝路！`
          ].join('\n'));
          // ===== 渡劫结束，重算全装属性 =====
          await this.exitTribulationState(player, _tribSnap7, usr_qq, equipment);
        } else {
          log.push(`【向死而生】重燃生命之火，继续迎战枷锁！`);
        }
      }
    } catch (err) {
      clearInterval(lockInterval);
      if (checkDone) clearInterval(checkDone);
      console.error('枷锁阶段出错：', err);
    }
  }, 30000);

  /* ====== 突破完成检查 ====== */
  checkDone = setInterval(async () => {
    if (broken >= totalShackles && player.当前血量 > 1) {
      clearInterval(checkDone);
      clearInterval(lockInterval);
      player.mijinglevel_id = 20;        // 准仙帝
      player.神明枷锁 = 0;
      player.神明之光 = 3;
      player.破王成帝 = 0;               // 清除标记
      player.当前血量 = player.血量上限;
      /* ------ 新增：解除双方护法关系 ------ */
      await this.clearProtectorRelation(player);
      await Write_player(usr_qq, player);
      await e.reply([
        `【帝境突破】`,
        `${player.名号}长啸震九天：「我身为炉，万道为火，今日熔炼古今法，重开帝者路！」`,
        `破碎王境，登临准仙帝！`
      ].join('\n'));
      // ===== 渡劫结束，重算全装属性 =====
      await this.exitTribulationState(player, _tribSnap7, usr_qq, equipment);
    }
  }, 1000);
}
// 解除护法双向绑定
async clearProtectorRelation(player) {
  if (!player.护法玩家) return;
  // 清被护者
  delete player.护法玩家;
  // 清护法者
  const allFiles = fs.readdirSync(__PATH.player_path);
  for (const f of allFiles) {
    const prot = await Read_player(f.replace('.json', ''));
    if (prot.正在护法 === player.名号) {
      delete prot.正在护法;
      await Write_player(f.replace('.json', ''), prot);
      break;
    }
  }
}
/* ====== 不朽之王围攻（含莫晓羽庇护） ====== */
async attackBySupremes(player, diffRate, e) {
  const msgs = [];
  msgs.push(
    `【诸王阻道】`,
    `几大不朽之王感应到帝者气息，跨界而来！`
  );

  /* ====== 莫晓羽庇护判定 ====== */
  if (player.莫晓羽庇护 === 1) {
    player.莫晓羽庇护 = 0;                 // 一次性消耗
    player.莫晓羽CD = Math.floor(Date.now() / 1000) + 86400; // 24 h 内不可再得

    /* 星指维宇崩全文 */
    msgs.push(
      `时间长河上游，一道英姿伟岸的身影踏破万古而来！`,
      `他黑发如瀑，眸若冷电，周身环绕无穷维度泡影！`,
      `「区区不朽之王，也敢阻我庇护之人破王成帝？」`,
      `声如开天辟地之雷，震得整片古史都在颤抖！`,
      ``,
      `【星指维宇崩】`,
      `云海极不可思议的景象在发生！`,
      `无数维度时空的泡影浮现，一颗颗庞大的维宙围绕着莫晓羽转动！`,
      `万万劫时空古史为之明亮，上至太宇之前，下至无尽未来！`,
      ``,
      `只见莫晓羽缓缓抬手，无尽维宙被其攥握手中！`,
      `「星指维宇崩！」`,
      `虚妄中洪亮的声音响彻诸天万界，在混沌海中炸响回荡！`,
      ``,
      `一道汇聚着至高维度极尽锋芒的巨指浮现！`,
      `占据一切时空概念变量，向着五大不朽之王点指而去！`,
      `这一指，无量指光普照一切，刹那光华，直达永恒，直达终结！`,
      ``,
      `五大不朽之王身躯寸寸崩解！`,
      `他们的存在被从古史中彻底抹去：`,
      `- 昆谛的炼仙壶化为虚无，连传说都消散！`,
      `- 安澜的不朽盾崩为尘埃，赤锋矛断为星屑！`,
      `- 蒲魔王的噬神之种归于寂灭，再无重生可能！`,
      `- 无殇的万法不侵之躯被永恒洞穿，法则根基尽毁！`,
      `- 俞陀的万古不朽身化为光雨，真灵永寂！`,
      `- 赤王的时间长河被彻底蒸干，再无岁月痕迹！`,
      ``,
      `过去无人记得他们曾存在`,
      `现在无人知晓他们曾降临`,
      `未来无人能寻他们之踪迹`,
      `就连诸天万界的史书典籍中，关于他们的记载也瞬间化为空白！`,
      ``,
      `莫晓羽转身望向${player.名号}，眸光转缓：`,
      `「帝路漫漫，此劫已过，前路珍重...」`,
      `伟岸身影渐淡，唯有一道符咒虚影守护在${player.名号}头顶`,
      `流转着镇压万古轮回的无上伟力！`
    );

    await Write_player(e.user_id, player);
    return msgs;                             // 跳过 20 次攻击
  }

  /* ====== 无庇护 → 原 20 次轮流攻击 ====== */
  const attackers = [
    { name: '昆谛', quote: '炼仙壶下，万道成灰！', mult: 1.0 },
    { name: '安澜', quote: '赤锋矛破九天，不朽盾镇轮回！', mult: 0.9 },
    { name: '蒲魔王', quote: '噬神之种，葬尔道果！', mult: 1.1 },
    { name: '无殇', quote: '万法不侵，帝路断魂！', mult: 1.3 },
    { name: '俞陀', quote: '万古成空，唯我不朽！', mult: 1.2 },
    { name: "瞿忡", quote: "葬灭古今，唯我永恒！", mult: 1.4},
    { name: "刀王", quote: "一刀断万古！", mult: 1.5 },
    { name: '赤王', quote: '时间长河，葬汝真灵！', mult: 0.8 }
  ];

  for (let i = 0; i < 20; i++) {
    /* ---- 每 5 次普攻后插入一次「八大联手一击」 ---- */
    if (i > 0 && i % 5 === 0) {
      msgs.push(
        ``,
        `【八大不朽之王·联手一击】`,
        `「诸王合力，断你帝路！」`
      );
      // 8 人同时出手，基础倍率 1.5
      let jointBase = player.攻击 * 0.3 * 8 * 1.5 * diffRate;
      const { damage: jointDmg } = this.applyGongfaEffects(player, jointBase, {});
      player.当前血量 = Math.max(1, player.当前血量 - jointDmg);
      msgs.push(
      `八王合击，打出 ${bigNumberTransform(jointDmg)} 点道伤！`,
      `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
      );
      if (player.当前血量 <= 1) break;
    }

    /* ---- 常规轮流单挑 ---- */
    const atk = attackers[i % attackers.length];
    let base = player.攻击 * 0.3 * atk.mult * diffRate;
    const { damage: dmg } = this.applyGongfaEffects(player, base, {});
    player.当前血量 = Math.max(1, player.当前血量 - dmg);
    msgs.push(`${atk.name}破空而至，阻道帝路：「${atk.quote}」`);
    msgs.push(`打出恐怖一击，造成${bigNumberTransform(dmg)}点道伤！`);
    if (player.当前血量 <= 1) break;
  }

  return msgs;
}


// 新增：检查天心印记的方法
async  checkHeavenHeartMark(currentQQ) {
    const playerFiles = fs.readdirSync(__PATH.player_path);
    const jsonFiles = playerFiles.filter(file => file.endsWith(".json"));
    
    for (const file of jsonFiles) {
        const qq = file.replace(".json", "");
        // 跳过当前玩家
        if (qq === currentQQ) continue;
        
        const player = await Read_player(qq);
        // 检查天心印记是否存在且大于0
        if (player.天心印记 && player.天心印记>0) {
            return true; // 存在其他大帝
        }
    }
    
    return false; // 没有其他大帝
}

 // ==== 功法效果检查方法 ====
isEffectActive(player, effectName) {
    if (!player || !effectName) return false;
    
    // 功法与效果对象的映射关系
    const effectMap = {
        "者字秘": "者字秘效果",
        "柳神法": "柳神效果",
        "雷帝宝术": "雷帝效果",
        "不灭经": "不灭经效果",
        "补天术": "补天术效果",
        "万化圣诀": "万化圣诀效果",
        "真凰宝术": "真凰效果",
        "凰劫再生术": "凰劫效果",
        "涅槃仙功": "涅槃仙功效果"
    };
    
    const effectKey = effectMap[effectName];
    if (!effectKey || !player[effectKey]) return false;
    
    // 根据不同功法的效果类型判断是否激活
    switch (effectName) {
        case "者字秘":
        case "雷帝宝术":
        case "不灭经":
        case "涅槃仙功":
            return player[effectKey].剩余次数 > 0;
        case "柳神法":
            return player[effectKey].庇护层数 > 0 || 
                  (player[effectKey].持续恢复 && player[effectKey].持续恢复.回合数 > 0);
        case "真凰宝术":
            return player[effectKey].免死 || 
                  player[effectKey].阶段减伤 > 0;
        case "凰劫再生术":
            return player[effectKey].阶段减伤 > 0;
        case "补天术":
        case "万化圣诀":
            return player[effectKey]?.剩余次数 > 0 || 
                   player[effectKey]?.免死;
        default:
            return false;
    }
}

updateCooldowns(player) {
    if (!player.功法) return;
    
    for (const gongfaName in player.功法) {
        if (player.功法[gongfaName].冷却回合 > 0) {
            player.功法[gongfaName].冷却回合--;
            console.log(`【冷却更新】${gongfaName} 剩余冷却：${player.功法[gongfaName].冷却回合}`);
        }
    }
}
async broadcastToAll(player,startMsg) {
    try {
        // 获取配置中的群组列表
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        const notifyGroups = xiuxianConfig?.Era?.notifyGroups || [];
        
        if (notifyGroups.length > 0) {
            // 广播到所有配置的群组
            for (const groupId of notifyGroups) {
                try {
                    await Bot.pickGroup(groupId).sendMsg([
                        startMsg
                    ]);
                    console.log(`[全服通知] 群 ${groupId}: ${startMsg}`);
                } catch (groupErr) {
                    console.error(`发送全服通知到群 ${groupId} 失败[${player.id}]:`, groupErr);
                }
            }
        } else {
            // 如果没有配置群组，回退到私聊
            await common.relpyPrivate(player.id, startMsg);
            console.log(`[全服通知] 私聊 ${player.id}: ${startMsg}`);
        }
    } catch (err) {
        console.error(`发送全服通知失败[${player.id}]:`, err);
        
        // 最终回退到私聊发送
        try {
            await common.relpyPrivate(player.id, startMsg);
            console.log(`[全服通知] 私聊回退 ${player.id}: ${startMsg}`);
        } catch (fallbackErr) {
            console.error(`私聊发送全服通知失败[${player.id}]:`, fallbackErr);
        }
    }
}

// ==== 渡劫属性计算 ====
// 渡劫保留武器/护具/法宝/帝兵/至宝的直接属性，套装效果仍被天道压制
// 帝兵与独立至宝额外保留全属性×后两层基础
// 调用方式：const tAttr = this.calcTribulationAttr(player, equipment);

/**
 * 渡劫全属性计算 —— 镜像 Write_equipment，保留装备直接属性但剥离套装效果
 * @param {Object} player  - Read_player 的玩家对象
 * @param {Object} equipment - Read_equipment 的装备对象
 * @returns {{攻击, 防御, 血量上限, 暴击率, 暴击伤害}}
 */
calcTribulationAttr(player, equipment) {
  // ===== 阈值拆分（与 Write_equipment 完全一致） =====
  const _lv = player.level_id || 1;
  const _phy = player.Physique_id || 1;
  const _mij = player.mijinglevel_id || 1;
  const 练气上限 = _lv <= 41 ? _lv * 1000000 : 41 * 1000000 + (_lv - 41) * 10000000;
  const 炼体上限 = _phy <= 41 ? _phy * 1000000 : 41 * 1000000 + (_phy - 41) * 10000000;
  const 证道上限 = _mij * 15000000;
  const 额外上限 = 练气上限 + 炼体上限 + 证道上限;

  // 光阴加成豁免：始终全额参与所有放大
  const 光阴攻 = player.光阴加成?.攻 || 0;
  const 光阴防 = player.光阴加成?.防 || 0;
  const 光阴血 = player.光阴加成?.生 || 0;

  const 额外攻 = player.攻击加成 || 0;
  const 额外防 = player.防御加成 || 0;
  const 额外血 = player.生命加成 || 0;

  const 阈内攻 = Math.min(额外攻, 额外上限);
  const 阈内防 = Math.min(额外防, 额外上限);
  const 阈内血 = Math.min(额外血, 额外上限);
  const 超出攻 = Math.max(额外攻 - 额外上限, 0);
  const 超出防 = Math.max(额外防 - 额外上限, 0);
  const 超出血 = Math.max(额外血 - 额外上限, 0);

  // ===== 阶段1：命格只作用于四体系基础总和，且独立留到最后加算 =====
  const 四体系境界 = {
    练气: data.Level_list.find(item => item.level_id == player.level_id),
    炼体: data.LevelMax_list.find(item => item.level_id == player.Physique_id),
    秘境: data.Levelmijing_list.find(item => item.level_id == player.mijinglevel_id),
    仙古: data.xiangujinshi_list.find(item => item.level_id == (player.xiangulevel_id || 1)),
  };
  const 四体系基础 = {
    攻击: 四体系境界.练气.基础攻击 + 四体系境界.炼体.基础攻击 +
      四体系境界.秘境.基础攻击 + 四体系境界.仙古.基础攻击,
    防御: 四体系境界.练气.基础防御 + 四体系境界.炼体.基础防御 +
      四体系境界.秘境.基础防御 + 四体系境界.仙古.基础防御,
    血量: 四体系境界.练气.基础血量 + 四体系境界.炼体.基础血量 +
      四体系境界.秘境.基础血量 + 四体系境界.仙古.基础血量,
  };
  const 命格效果 = getMinggeEffects(player, data.minggeList);
  const 命格四体系加成 = calculateMinggeFourRealmBonus(四体系基础, 命格效果);

  let 攻击 = 四体系基础.攻击 + 阈内攻 + 光阴攻;
  let 防御 = 四体系基础.防御 + 阈内防 + 光阴防;
  let 血量上限 = 四体系基础.血量 + 阈内血 + 光阴血;
  let 暴击率 = 四体系境界.练气.基础暴击 + 四体系境界.炼体.基础暴击 +
    getMinggeEffectNumber(命格效果, '暴击加成');

  // ===== 阶段2：灵根百分比放大（乘法） =====
  const 灵根攻击 = player.灵根?.攻击 ?? 0;
  const 灵根防御 = player.灵根?.防御 ?? 0;
  const 灵根生命 = player.灵根?.生命 ?? 0;
  攻击 = 攻击 * (1 + 灵根攻击);
  防御 = 防御 * (1 + 灵根防御);
  血量上限 = 血量上限 * (1 + 灵根生命);

  // ===== 阶段3：渡劫保留五个装备槽的直接属性 =====
  const equipmentSlots = [equipment.武器, equipment.护具, equipment.法宝, equipment.帝兵, equipment.至宝];
  const equippedStats = calculateEquippedStats(
    { 攻击, 防御, 血量上限 },
    equipmentSlots
  );
  攻击 = equippedStats.攻击;
  防御 = equippedStats.防御;
  血量上限 = equippedStats.血量上限;
  for (const slot of equipmentSlots) 暴击率 += Number(slot?.bao) || 0;

  // 暴击伤害（与 Write_equipment 一致）
  let 暴击伤害 = 暴击率 + 1.5;
  if (暴击伤害 > 2.5) 暴击伤害 = 2.5;
  if (player.仙宠?.type == '暴伤') 暴击伤害 += player.仙宠.加成 || 0;

  // ===== 阶段5：套装效果 —— 天道排斥，全部归零（×1 无变化） =====
  // 不计算任何套装增益

  // ===== 阶段6：帝兵与至宝全属性（只乘后两层基础，保留） =====
  const 秘境基础数据 = data.Levelmijing_list.find(item => item.level_id == player.mijinglevel_id);
  const 仙古基础数据 = data.xiangujinshi_list.find(item => item.level_id == (player.xiangulevel_id || 1));
  const 后两层攻 = (秘境基础数据?.基础攻击 || 0) + (仙古基础数据?.基础攻击 || 0);
  const 后两层防 = (秘境基础数据?.基础防御 || 0) + (仙古基础数据?.基础防御 || 0);
  const 后两层血 = (秘境基础数据?.基础血量 || 0) + (仙古基础数据?.基础血量 || 0);
  if (equipment.帝兵) {
    // 自铸帝兵 → 全额
    if (equipment.帝兵.author_name == player.id) {
      攻击 += Math.trunc(equipment.帝兵.全属性 * 后两层攻);
      防御 += Math.trunc(equipment.帝兵.全属性 * 后两层防);
      血量上限 += Math.trunc(equipment.帝兵.全属性 * 后两层血);
    }
    // 特殊帝兵且境界不足 → 1/10
    else if ((equipment.帝兵.name == "封神榜" || equipment.帝兵.name == "神女炉" || equipment.帝兵.name == "天庭权杖")
             && player.mijinglevel_id < 12 && (player.xiangulevel_id || 1) < 12) {
      攻击 += Math.trunc(equipment.帝兵.全属性 * 后两层攻 / 10);
      防御 += Math.trunc(equipment.帝兵.全属性 * 后两层防 / 10);
      血量上限 += Math.trunc(equipment.帝兵.全属性 * 后两层血 / 10);
    }
    // 无主帝兵 → 全额
    else if (!equipment.帝兵.author_name) {
      攻击 += Math.trunc(equipment.帝兵.全属性 * 后两层攻);
      防御 += Math.trunc(equipment.帝兵.全属性 * 后两层防);
      血量上限 += Math.trunc(equipment.帝兵.全属性 * 后两层血);
    }
  }
  if (equipment.至宝?.name) {
    攻击 += Math.trunc((Number(equipment.至宝.全属性) || 0) * 后两层攻);
    防御 += Math.trunc((Number(equipment.至宝.全属性) || 0) * 后两层防);
    血量上限 += Math.trunc((Number(equipment.至宝.全属性) || 0) * 后两层血);
  }

  // ===== 阶段7：超出上限的额外加成（最后加算，自然稀释） =====
  攻击 = Math.max(1, 攻击 + 超出攻 + 命格四体系加成.攻击);
  防御 = Math.max(1, 防御 + 超出防 + 命格四体系加成.防御);
  血量上限 = Math.max(1, 血量上限 + 超出血 + 命格四体系加成.血量);

  return {
    攻击: Math.trunc(攻击),
    防御: Math.trunc(防御),
    血量上限: Math.trunc(血量上限),
    暴击率: 暴击率,
    暴击伤害: 暴击伤害
  };
}

/**
 * #打听天机 渡劫 —— 推演渡劫随机区间与可去位面坐标
 * 三部分：①帝兵全属性随机波动 + 单波伤害区间；②玩家当前可去的位面及其坐标；③不可去位面与差距
 */
async command_datitingtianji(e) {
  if (!e.isGroup) return e.reply('修仙：请在群聊中打听天机');

  const usr_qq = e.user_id.toString().replace('qg_', '');
  if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');

  const player = await Read_player(usr_qq);
  const equipment = await Read_equipment(usr_qq);
  const mijing = Number(player.mijinglevel_id) || 1;
  const xiangu = Number(player.xiangulevel_id) || 1;
  const mijingData = data.Levelmijing_list.find(i => i.level_id === mijing);

  // ===== 帝兵全属性随机区间（与 calcMaxTheoreticalAtk 同源） =====
  const 帝兵全属性极限 = {
    10: { 无兵字秘: 14.2, 有兵字秘: 54.2, name: '圣主' },
    11: { 无兵字秘: 22.2, 有兵字秘: 62.2, name: '斩道王者' },
    12: { 无兵字秘: 32.2, 有兵字秘: 72.2, name: '圣人' },
    13: { 无兵字秘: 47.2, 有兵字秘: 87.2, name: '圣人王' },
    14: { 无兵字秘: 62.2, 有兵字秘: 102.2, name: '大圣' },
    15: { 无兵字秘: 89.2, 有兵字秘: 129.2, name: '准帝' }
  };
  const 区间 = 帝兵全属性极限[mijing] || null;

  // ===== 当前理论 maxAtk =====
  let maxAtk = 0;
  try {
    maxAtk = this.calcMaxTheoreticalAtk(player, equipment);
  } catch (err) {
    console.error('[打听天机] calcMaxTheoreticalAtk 失败:', err);
  }

  // ===== 下场雷劫信息 =====
  const 雷劫列表 = [
    { idx: 10, name: '斩道雷劫', 倍率: 30, 阶段最高: 1.0 },
    { idx: 11, name: '圣人雷劫', 倍率: 45, 阶段最高: 1.0 },
    { idx: 12, name: '圣人王雷劫', 倍率: 60, 阶段最高: 1.0 },
    { idx: 13, name: '大圣雷劫', 倍率: 90, 阶段最高: 2.0 },
    { idx: 14, name: '准帝雷劫', 倍率: 120, 阶段最高: 5.0 }
  ];
  const 下场雷劫 = 雷劫列表.find(r => r.idx === mijing);
  const 时代 = config.getConfig('xiuxian', 'xiuxian');
  const eraIndex = 时代?.Era?.current?.index ?? 2;
  const eraDifficultyRates = [0.8, 0.9, 1.0, 1.2, 1.5];
  const eraNames = ['神话时代', '太古时代', '天命时代', '末法时代', '绝灵时代'];
  const eraDiff = eraDifficultyRates[eraIndex] || 1.0;
  const eraName = eraNames[eraIndex] || '天命时代';

  // ===== 位面通行要求 =====
  // 仙域/界海 等用户口述要求与代码 getLocationThreshold 不一致，此处按用户设计意图呈现
  const 位面列表 = [
    { name: '仙界',         要求: '地仙境或轮回',           需: (p) => Number(p.level_id) >= 42 || (Number(p?.lunhui) || 0) !== 0, 坐标字段: '仙界坐标' },
    { name: '下界八域',     要求: '默认通行',               需: () => true,                                                            坐标字段: '下界八域坐标' },
    { name: '遮天位面',     要求: '秘境≥12 / 仙古≥11 / 花粉≥11 / 五色祭坛', 需: (p) => p.mijinglevel_id >= 12 || p.xiangulevel_id > 10 || p.huafenlevel_id >= 11 || Number(p?.五色祭坛激活) === 1, 坐标字段: '遮天位面坐标' },
    { name: '九天十地',     要求: '默认通行',               需: () => true,                                                            坐标字段: '九天十地坐标' },
    { name: '界海',         要求: '仙王巨头（秘境≥19 / 仙古≥19 / 花粉≥20）', 需: (p) => p.mijinglevel_id >= 19 || p.xiangulevel_id >= 19 || p.huafenlevel_id >= 20, 坐标字段: '界海坐标' },
    { name: '太初星墟',     要求: '帝境（秘境≥16 / 仙古≥16 / 花粉≥15）', 需: (p) => p.mijinglevel_id >= 16 || p.xiangulevel_id >= 16 || p.huafenlevel_id >= 15, 坐标字段: '太初星墟坐标' },
    { name: '仙域',         要求: '仙王（秘境≥18 / 仙古≥16 / 花粉≥18）', 需: (p) => p.mijinglevel_id >= 18 || p.xiangulevel_id >= 16 || p.huafenlevel_id >= 18, 坐标字段: '仙域坐标' },
    { name: '时间长河',     要求: '准仙帝（秘境≥20 / 仙古≥20 / 花粉≥21）', 需: (p) => p.mijinglevel_id >= 20 || p.xiangulevel_id >= 20 || p.huafenlevel_id >= 21, 坐标字段: '时间长河坐标' },
    { name: '永恒未知之地', 要求: '仙帝（秘境≥21 / 仙古≥21 / 花粉≥22）', 需: (p) => p.mijinglevel_id >= 21 || p.xiangulevel_id >= 21 || p.huafenlevel_id >= 22, 坐标字段: '永恒未知之地坐标' }
  ];
  const 位面状态 = 位面列表.map(p => {
    const 可去 = p.需(player);
    const 差值 = p.要求.match(/秘境≥(\d+)/);
    const 所需 = 差值 ? Number(差值[1]) : 0;
    return {
      ...p,
      可去,
      差值: 可去 || !所需 ? 0 : Math.max(0, 所需 - Math.max(mijing, xiangu, Number(player.huafenlevel_id) || 1)),
      坐标: 可去 ? getPlayerPlaneCoordinate(player, p.name) : null
    };
  });

  // ===== 当前位面 =====
  const 当前位面 = Object.entries(PLACE_LOCATION_MAP).find(([, id]) => Number(id) === Number(player.power_place))?.[0] || '凡间';
  const 当前坐标 = getPlayerPlaneCoordinate(player);

  // ===== 组装输出 =====
  const lines = [];
  lines.push('【天机推演·渡劫吉凶】');
  lines.push(`${player.名号}，本座为你推演渡劫吉凶——`);
  lines.push('');
  lines.push(`当前秘境境界：${mijingData?.level || `lv.${mijing}`}（秘境 ${mijing} / 仙古 ${xiangu}）`);
  lines.push(`当前位面：${当前位面}${当前坐标 ? `（坐标 ${当前坐标.x},${当前坐标.y}）` : '（坐标未记录）'}`);
  lines.push(`当前时代：${eraName}（难度 ×${eraDiff}）`);
  lines.push('');

  // ===== 渡劫区间修正（体质 / 位面坐标 / 库洛牌 / 黑皇阵纹） =====
  const 体质偏移 = BODY_TRIBULATION_SHIFT[player.灵根?.name] || 0;
  const 位面偏移 = 当前坐标 ? calcPlaneCoordinateShift(player) : 0;
  const 库洛牌偏移 = player.库洛牌祈愿?.区间偏移 || 0;
  const 待用阵纹 = player.黑皇待用阵纹 === '欺天阵纹';
  const 区间跨度 = 区间 ? Math.round(区间.有兵字秘 - 区间.无兵字秘) : 0;
  const 已确定偏移 = 体质偏移 + 位面偏移 + 库洛牌偏移;
  // 阵纹偏正 = 区间下移 = 更安全；阵纹反噬 = 区间上移 = 更凶险
  const 阵纹最优 = 待用阵纹 ? -15 : 0;
  const 阵纹最差 = 待用阵纹 ? 15 : 0;
  const clampSpan = (v) => Math.max(0, Math.min(区间跨度, v));
  const 实际最低随机 = clampSpan(0 + 已确定偏移 + 阵纹最优);
  const 实际最高随机 = clampSpan(区间跨度 + 已确定偏移 + 阵纹最差);
  const 实际最低倍率 = 区间 ? Number((区间.无兵字秘 + 实际最低随机).toFixed(1)) : 0;
  const 实际最高倍率 = 区间 ? Number((区间.无兵字秘 + 实际最高随机).toFixed(1)) : 0;

  // ===== 天机一：帝兵随机伤害区间（已计入修正） =====
  if (区间 && 下场雷劫) {
    const 波动倍数 = 实际最低倍率 > 0 ? (实际最高倍率 / 实际最低倍率).toFixed(2) : '—';
    const 血上限 = Math.max(1, Number(player.血量上限) || 1);

    // 修正（2026-08-05）：maxAtk 本身已含「帝兵全属性随机倍率」，原逻辑再乘 实际最低/最高倍率 = 双重放大，
    //   致「最凶险」被夸大约 25 倍（788 倍血量虚高）。改为对「雷劫攻击基础」只乘一次随机倍率。
    // 斩道天刀（idx 10）为血量上限系（useHP=true），终关按血量上限估算，与 maxAtk / 帝兵随机档均无关。
    const 雷劫攻击基础 = (data.Level_list.find(i => i.level_id == 64)?.基础攻击 || 0)
      + (data.LevelMax_list.find(i => i.level_id == 63)?.基础攻击 || 0)
      + (data.Levelmijing_list.find(i => i.level_id == player.mijinglevel_id)?.基础攻击 || 0);
    const 终波系数 = 1 + 0.03 * 1;   // 终关均为 1 波：(1 + 0.03*1)
    const 是HP终关 = (下场雷劫.idx === 10);   // 仅斩道天刀为血量上限系
    let 当前时代幸运, 当前时代凶险;
    if (是HP终关) {
      当前时代幸运 = Math.trunc(血上限 * 下场雷劫.阶段最高 * 终波系数 * 下场雷劫.倍率);
      当前时代凶险 = 当前时代幸运;
    } else {
      当前时代幸运 = Math.trunc(雷劫攻击基础 * 实际最低倍率 * eraDiff * 下场雷劫.倍率 * 下场雷劫.阶段最高 * 终波系数);
      当前时代凶险 = Math.trunc(雷劫攻击基础 * 实际最高倍率 * eraDiff * 下场雷劫.倍率 * 下场雷劫.阶段最高 * 终波系数);
    }
    const 凶险倍数 = 当前时代凶险 / 血上限;

    lines.push('【天机一·帝兵随机伤害区间】');
    lines.push(`理论区间：${区间.无兵字秘}× ~ ${区间.有兵字秘}×`);
    lines.push(`修正后区间：${实际最低倍率}× ~ ${实际最高倍率}×（波动 ${波动倍数} 倍）`);
    lines.push('');
    lines.push(`本次雷劫基准 maxAtk：${bigNumberTransform(maxAtk)}`);
    lines.push(`（只由境界层数决定——天道不认外物，装备与帝兵再强也不会招来更猛的雷）`);
    lines.push('');
    lines.push(`${下场雷劫.name}（境界倍率 ×${下场雷劫.倍率}）· ${eraName}（×${eraDiff}）单波峰值：`);
    lines.push(`  最幸运：${bigNumberTransform(当前时代幸运)}`);
    lines.push(`  最凶险：${bigNumberTransform(当前时代凶险)}`);
    if (是HP终关) lines.push(`  （终关「斩道天刀」按血量上限结算，与帝兵随机档无关——此即你方才所问的"最终那道雷"）`);
    lines.push(`  你的血量上限：${bigNumberTransform(血上限)}`);
    if (凶险倍数 <= 1) {
      lines.push(`  ⇒ 最凶险仅为血量上限的 ${(凶险倍数 * 100).toFixed(1)}%，可硬扛。`);
    } else {
      lines.push(`  ⇒ 最凶险为血量上限的 ${凶险倍数.toFixed(1)} 倍，须靠功法减伤 / 体质减伤 / 复活手段。`);
    }
    lines.push(`「天机玄妙，帝兵蕴养之极致与贫瘠，全在一线之间。」`);
    lines.push('');
  } else {
    lines.push('【天机一·帝兵随机伤害区间】');
    lines.push(`当前秘境等级 ${mijing} 尚未进入帝兵蕴养区间（需圣主 lv.10 及以上）。`);
    lines.push('');
  }

  // ===== 天机二：渡劫区间修正明细 =====
  lines.push('【天机二·渡劫区间修正明细】');
  lines.push(`帝兵全属性随机跨度：0 ~ ${区间跨度}（共 ${区间跨度 + 1} 个值，取值越低越安全）`);
  lines.push('');
  lines.push(`修正项（负数向安全端平移，正数向凶险端平移）：`);
  lines.push(`  · 体质 [${player.灵根?.name || '无'}]：${体质偏移 >= 0 ? '+' : ''}${体质偏移}${体质偏移 < 0 ? '　受天地法则青睐' : ''}`);
  lines.push(`  · 位面坐标 [${当前位面 || '凡间'}${当前坐标 ? ` (${当前坐标.x},${当前坐标.y})` : ''}]：${位面偏移 >= 0 ? '+' : ''}${位面偏移}${当前坐标 ? (位面偏移 < 0 ? '　吉位，渡劫更稳' : 位面偏移 > 0 ? '　凶位，渡劫更险' : '　平位') : '　坐标未记录'}`);
  lines.push(`  · 库洛牌祈愿：${库洛牌偏移 !== 0 ? `${库洛牌偏移 >= 0 ? '+' : ''}${库洛牌偏移}（已受祈愿）` : '±0（未被祈愿）'}`);
  lines.push(`  · 黑皇欺天阵纹：${待用阵纹 ? '已待用（渡劫时随机 -15 ~ +15）' : '±0（未刻入）'}`);
  lines.push('');
  lines.push(`已确定偏移合计：${已确定偏移 >= 0 ? '+' : ''}${已确定偏移}`);
  lines.push(`修正后随机取值：${实际最低随机} ~ ${实际最高随机}（原 0 ~ ${区间跨度}，已钳位）`);
  lines.push('');

  // ===== 天机三：可去位面渡劫坐标 =====
  const 可去位面 = 位面状态.filter(p => p.可去);
  if (可去位面.length > 0) {
    lines.push('【天机三·可去位面渡劫吉凶】');
    lines.push('位面坐标决定区间偏移（-10 吉 ~ +10 凶），换个地方渡劫结果大不同：');
    lines.push('');
    // 逐个位面算坐标偏移，按吉凶排序（偏移越低越安全）
    const 位面吉凶 = 可去位面.map(p => {
      const planeId = PLACE_LOCATION_MAP?.[p.name];
      const 偏移 = p.坐标 ? calcCoordinateShift(planeId, p.坐标.x, p.坐标.y) : null;
      return { ...p, 偏移 };
    }).sort((a, b) => {
      if (a.偏移 === null) return 1;
      if (b.偏移 === null) return -1;
      return a.偏移 - b.偏移;
    });
    for (const p of 位面吉凶) {
      const 当前位标记 = p.name === 当前位面 ? ' ★ 你当前所在' : '';
      if (p.坐标 === null || p.偏移 === null) {
        lines.push(`○ ${p.name}${当前位标记}　坐标未记录`);
        lines.push(`   准入：${p.要求}　｜　需先 #位面穿梭 至此锚定坐标后方可推演`);
      } else {
        const 吉凶符 = p.偏移 <= -6 ? '◎ 大吉' : p.偏移 < 0 ? '○ 吉' : p.偏移 === 0 ? '· 平' : p.偏移 <= 5 ? '△ 小凶' : '✗ 大凶';
        const 实际倍率 = 区间
          ? `${(区间.无兵字秘 + clampSpan(0 + 体质偏移 + p.偏移 + 库洛牌偏移 + 阵纹最优)).toFixed(1)}× ~ ${(区间.无兵字秘 + clampSpan(区间跨度 + 体质偏移 + p.偏移 + 库洛牌偏移 + 阵纹最差)).toFixed(1)}×`
          : '—';
        lines.push(`${吉凶符}　${p.name}${当前位标记}`);
        lines.push(`   坐标 (${p.坐标.x}, ${p.坐标.y})　位面偏移 ${p.偏移 >= 0 ? '+' : ''}${p.偏移}`);
        lines.push(`   在此渡劫区间：${实际倍率}`);
      }
      lines.push('');
    }
    const 最佳 = 位面吉凶.find(p => p.偏移 !== null);
    if (最佳) {
      lines.push(`推演所得：${最佳.name}（${最佳.坐标.x}, ${最佳.坐标.y}）为你眼下最稳之地。`);
      lines.push('');
    }
  } else {
    lines.push('【天机三·可去位面】');
    lines.push('当前境界下，尚未有可去的位面。');
    lines.push('');
  }

  // ===== 天机四：不可去位面与差距 =====
  const 不可去位面 = 位面状态.filter(p => !p.可去);
  if (不可去位面.length > 0) {
    lines.push('【天机四·暂不可去位面】');
    for (const p of 不可去位面) {
      const 差文本 = p.差值 > 0 ? `（差 ${p.差值} 级）` : '';
      lines.push(`✗ ${p.name} — ${p.要求}${差文本}`);
    }
    lines.push('');
  }

  lines.push(`「位面有壁，大道无形。可去者方为退路，不可去者莫强求。」`);

  await e.reply(lines.join('\n'));
  return true;
}

/**
 * #库洛牌祈愿 —— 为他人施加一次性的渡劫区间减伤 buff
 * 限制：发起者每日 3 次；目标单次受益 -5 区间偏移（向安全端）
 * buff 存储在目标 player.库洛牌祈愿，下次对方渡劫时自动消耗
 */
async command_kuluoqiyuan(e) {
  if (!e.isGroup) return e.reply('修仙：请在群聊中使用库洛牌祈愿');

  const fromQQ = e.user_id.toString().replace('qg_', '');
  if (!await existplayer(fromQQ)) return e.reply('你还未踏入修仙路');
  const caster = await Read_player(fromQQ);
  if (!canUseClowWish(caster)) {
    return e.reply('只有木之本樱、星之杖·木之本樱或梦之杖·木之本樱才能使用库洛牌祈愿。');
  }

  // 解析 @ 目标
  const rawTarget = e.at && e.at !== 'all' ? String(e.at).replace('qg_', '') : '';
  if (!rawTarget) return e.reply('用法：#库洛牌祈愿 @玩家\n（例如：#库洛牌祈愿 @叶凡）');
  if (rawTarget === fromQQ) return e.reply('不能为自己祈愿，渡劫终须独自面对。');

  if (!await existplayer(rawTarget)) return e.reply('对方未踏入修仙路，祈愿无法传达。');

  // 每日 3 次限制（Redis）
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const counterKey = `xiuxian:kuluo_wish:${fromQQ}:${today}`;
  let used = Number(await redis.get(counterKey)) || 0;
  if (used >= 3) {
    return e.reply([
      `【库洛牌·祈愿已达上限】`,
      `今日已祈愿 ${used} 次（上限 3 次）`,
      `明日再来吧，愿星光为你蓄势。`
    ].join('\n'));
  }

  // 固定 buff 值 -5（向安全端偏移 5 点）
  const 区间偏移 = -5;
  const targetPlayer = await Read_player(rawTarget);

  // 若目标已有 buff，覆盖（最新一次生效）
  targetPlayer.库洛牌祈愿 = {
    区间偏移,
    来源: fromQQ,
    时间: Date.now(),
    一次性: true,
  };
  await Write_player(rawTarget, targetPlayer);

  // 计数 +1
  await redis.set(counterKey, String(used + 1), 'EX', 60 * 60 * 25); // 25h 防止跨日漂移

  const 剩余 = 3 - used - 1;
  await e.reply([
    `【库洛牌·祈愿成功】`,
    `${targetPlayer.名号}，你身上已被星光庇佑。`,
    `下次渡劫时，本场雷劫随机区间向安全端偏移 ${Math.abs(区间偏移)} 点。`,
    `（buff 为一次性，对方渡劫即消耗）`,
    ``,
    `你今日剩余祈愿次数：${剩余}/3`
  ].join('\n'));
  return true;
}

/**
 * 进入渡劫状态 —— 保存原始属性，替换为渡劫属性
 * 在渡劫函数开头调用，渡劫过程中 player.攻击/防御/血量上限 均为剥离外物的值
 * @param {Object} player
 * @param {Object} equipment
 * @returns {Object} 原始属性快照（供 restoreAfterTribulation 使用）
 */
enterTribulationState(player, equipment) {
  resetTribulationGongfaCooldowns(player);

  const snapshot = {
    攻击: player.攻击,
    防御: player.防御,
    血量上限: player.血量上限,
    当前血量: player.当前血量,
    暴击率: player.暴击率,
    暴击伤害: player.暴击伤害,
    mijinglevel_id: player.mijinglevel_id
  };

  const tAttr = this.calcTribulationAttr(player, equipment);
  player.攻击 = tAttr.攻击;
  player.防御 = tAttr.防御;
  player.血量上限 = tAttr.血量上限;
  player.暴击率 = tAttr.暴击率;
  player.暴击伤害 = tAttr.暴击伤害;
  player.当前血量 = tAttr.血量上限; // 满血进入渡劫

  return snapshot;
}

/**
 * 退出渡劫状态 —— 渡劫结束后重算全装属性
 * 渡劫结果已通过 Write_player 保存（mijinglevel_id 提升等），
 * 此函数调用 Write_equipment 按新境界重新计算全装属性（含武器/护具/法宝/套装/帝兵）
 * 成功渡劫后满血恢复，失败则保留残余血量
 * @param {Object} player   - 渡劫函数中的局部 player 对象（含结果修改）
 * @param {Object} snapshot  - enterTribulationState 返回的快照
 * @param {string} usr_qq
 * @param {Object} equipment
 */
async exitTribulationState(player, snapshot, usr_qq, equipment) {
  // 判断是否渡劫成功（mijinglevel_id 提升了 = 成功）
  const success = player.mijinglevel_id > snapshot.mijinglevel_id;

  // Write_equipment 内部会 Read_player（含新 mijinglevel_id）→ 重算全装属性 → Write_player
  await Write_equipment(usr_qq, equipment);

  // 清除本次玄黄护道；成功渡劫时按重算后的血量上限补满。
  const refreshed = await Read_player(usr_qq);
  delete refreshed._玄黄护道渡劫;
  if (success) {
    refreshed.当前血量 = refreshed.血量上限;
  }
  await Write_player(usr_qq, refreshed);
}

// ==== 理论最大攻击计算 ====
// 大能至准帝（雷劫基准）：天道只认「境界」，不认外物。
// 基准 = 练气圆满 + 炼体圆满 + 当前秘境 三层基础攻击，
// 再乘以当前秘境无兵字秘/有兵字秘蕴养极限之间的随机全属性（含各项区间修正）。
// 【重要】武器/护具/法宝加成与帝兵 atk 一律不参与，避免"越肝装备天雷越猛"的反向激励。
calcMaxTheoreticalAtk(player, equipment = {}, shiftOptions = {}) {
  const 练气Atk = data.Level_list.find(item => item.level_id == 64)?.基础攻击 || 0;
  const 炼体Atk = data.LevelMax_list.find(item => item.level_id == 63)?.基础攻击 || 0;
  const 秘境Atk = data.Levelmijing_list.find(item => item.level_id == player.mijinglevel_id)?.基础攻击 || 0;
  const 秘境等级 = Number(player.mijinglevel_id) || 0;

  const 帝兵全属性极限 = {
    10: { 无兵字秘: 14.2, 有兵字秘: 54.2 },
    11: { 无兵字秘: 22.2, 有兵字秘: 62.2 },
    12: { 无兵字秘: 32.2, 有兵字秘: 72.2 },
    13: { 无兵字秘: 47.2, 有兵字秘: 87.2 },
    14: { 无兵字秘: 62.2, 有兵字秘: 102.2 },
    15: { 无兵字秘: 89.2, 有兵字秘: 129.2 }
  };

  const 当前极限 = 帝兵全属性极限[秘境等级];
  if (当前极限) {
    // 帝兵全属性以 1 点为成长单位，保留九彩神金初始属性产生的 .2。
    const 随机跨度 = Math.round(当前极限.有兵字秘 - 当前极限.无兵字秘);
    const 基础随机 = Math.floor(Math.random() * (随机跨度 + 1));

    // 汇总区间偏移：体质 + 位面坐标 + 黑皇阵纹 + 库洛牌祈愿
    const shifts = {
      bodyShift: shiftOptions.bodyShift ?? (BODY_TRIBULATION_SHIFT[player?.灵根?.name] || 0),
      planeShift: shiftOptions.planeShift ?? calcPlaneCoordinateShift(player),
      formationShift: Number(shiftOptions.formationShift || 0),
      kuluoShift: Number(shiftOptions.kuluoShift || 0),
    };
    const { final: 修正后随机 } = applyTribulationShift(基础随机, 随机跨度, shifts);

    const 随机全属性 = 当前极限.无兵字秘 + 修正后随机;

    // 天道只认境界，不认外物：装备（武器/护具/法宝）与帝兵 atk 均不计入雷劫基准。
    // 同秘境同炼体的玩家，雷劫强度完全一致，差异只来自随机区间与各项修正。
    // 整体强度可通过 TRIBULATION_BASE_ATK_SCALE 统一缩放。
    const 雷劫攻击基础 = (练气Atk + 炼体Atk + 秘境Atk) * TRIBULATION_BASE_ATK_SCALE;

    return Math.trunc(雷劫攻击基础 * 随机全属性);
  }

  // 其他境界保留原理论攻击算法，避免影响破王成帝等共享调用。
  const 仙古Atk = data.xiangujinshi_list.find(item => item.level_id == (player.xiangulevel_id || 1))?.基础攻击 || 0;

  // 最大额外加成上限（阈值，与 Write_equipment 一致）
  const _lv = player.level_id || 1;
  const _phy = player.Physique_id || 1;
  const _mij = player.mijinglevel_id || 1;
  const 练气上限 = _lv <= 41 ? _lv * 1000000 : 41 * 1000000 + (_lv - 41) * 10000000;
  const 炼体上限 = _phy <= 41 ? _phy * 1000000 : 41 * 1000000 + (_phy - 41) * 10000000;
  const 证道上限 = _mij * 15000000;
  const 额外上限 = 练气上限 + 炼体上限 + 证道上限;

  // 光阴加成（雷劫中光阴之力不减）
  const 光阴攻 = player.光阴加成?.攻 || 0;

  // 最大帝兵攻击加成
  let 帝兵Atk = 0;
  if (equipment?.帝兵) {
    帝兵Atk += equipment.帝兵.atk || 0;
    const 后两层攻 = 秘境Atk + 仙古Atk;
    // 自铸帝兵全额，特殊帝兵境界不足1折，无主帝兵全额
    if (equipment.帝兵.author_name == player.id) {
      帝兵Atk += Math.trunc((equipment.帝兵.全属性 || 0) * 后两层攻);
    } else if ((equipment.帝兵.name == "封神榜" || equipment.帝兵.name == "神女炉" || equipment.帝兵.name == "天庭权杖")
               && player.mijinglevel_id < 12 && (player.xiangulevel_id || 1) < 12) {
      帝兵Atk += Math.trunc((equipment.帝兵.全属性 || 0) * 后两层攻 / 10);
    } else if (!equipment.帝兵.author_name) {
      帝兵Atk += Math.trunc((equipment.帝兵.全属性 || 0) * 后两层攻);
    }
  }

  let 至宝Atk = 0;
  if (equipment?.至宝?.name) {
    至宝Atk += Number(equipment.至宝.atk) || 0;
    至宝Atk += Math.trunc((Number(equipment.至宝.全属性) || 0) * (秘境Atk + 仙古Atk));
  }

  const 装备后攻击 = calculateEquippedStats(
    { 攻击: 练气Atk + 炼体Atk + 秘境Atk + 仙古Atk + 额外上限 + 光阴攻 },
    [equipment?.武器, equipment?.护具, equipment?.法宝]
  ).攻击;

  return 装备后攻击 + 帝兵Atk + 至宝Atk;
}

/**
 * 消耗库洛牌祈愿 buff（一次性，读取后立即移除）
 * @returns {number} buff 提供的偏移量（负数=安全）
 */
consumeKuluoWishBuff(player) {
  if (!player?.库洛牌祈愿) return 0;
  const buff = player.库洛牌祈愿;
  const shift = Number(buff.区间偏移 || 0);
  delete player.库洛牌祈愿;
  return shift;
}

/**
 * 综合计算 maxAtk（用于实际渡劫）
 * 自动读取：体质偏移 + 位面坐标偏移 + 黑皇阵纹偏移 + 库洛牌偏移
 * @returns {{ maxAtk: number, formationShift: number, kuluoShift: number, planeShift: number, bodyShift: number, qitianMessage: string }}
 */
calcMaxAtkWithTribulationShifts(player, equipment = {}) {
  // 1. 黑皇欺天阵纹（区间偏移，-15 ~ +15）
  const qitianFormation = consumeBlackEmperorTribulationFormation(player);
  const formationShift = qitianFormation.consumed ? qitianFormation.rangeShift : 0;
  const qitianMessage = qitianFormation.message || '';

  // 2. 库洛牌祈愿（一次性 buff）
  const kuluoShift = this.consumeKuluoWishBuff(player);

  const maxAtk = this.calcMaxTheoreticalAtk(player, equipment, {
    formationShift,
    kuluoShift,
  });

  return { maxAtk, formationShift, kuluoShift, qitianMessage };
}

/**
 * 渡劫结算统一入口：applyGongfaEffects + 雷池真液·淬体护道
 * 持有雷池真液时，本次渡劫按滴数减伤（每滴10%，上限50%，一次渡劫只扣一次）。
 */
async applyTribulationDamage(player, originalDamage, equipment = {}) {
  const { damage, messages } = this.applyGongfaEffects(player, originalDamage, equipment);
  if (player && !player._雷池真液已用) {
    try {
      const qq = String(player.id || player.qq || '');
      const qty = await exist_najie_thing(qq, '雷池真液', '道具');
      if (qty > 0) {
        player._雷池真液已用 = true;
        const use = Math.min(5, Number(qty));
        await Add_najie_thing(qq, '雷池真液', '道具', -use);
        const finalDamage = Math.max(1, Math.floor(damage * (1 - use * 0.1)));
        messages.push(`【雷池真液】淬体护道，减免${use * 10}%雷劫伤害（消耗${use}滴）`);
        return { damage: finalDamage, messages };
      }
    } catch (error) {
      console.warn('[雷池真液] 渡劫减伤结算失败:', error);
    }
  }
  return { damage, messages };
}

// ==== 功法特效应用函数 ====
applyGongfaEffects(player, originalDamage, equipment = {}) {
  if (!player || typeof originalDamage !== 'number') {
    console.error('Invalid parameters', {player, originalDamage});
    return { damage: originalDamage, messages: [] };
  }

  let finalDamage = originalDamage;
  let effectMessages = [];
  const eraFactor = this.getEraDifficultyFactor();
  const qitianFormation = consumeBlackEmperorTribulationFormation(player);
  if (qitianFormation.message && !qitianFormation.announced) {
    effectMessages.push(qitianFormation.message);
    qitianFormation.announced = true;
  }

  if (player.护法玩家) {
    const share = Math.floor(finalDamage * 0.4); // 护法吃40%
    player.护法玩家.当前血量 -= share;
    finalDamage -= share;

    effectMessages.push(`【护法承伤】${player.护法玩家.名字}挡下 ${share.toLocaleString()} 点！`);

    // 护法力竭
    if (player.护法玩家.当前血量 <= 0) {
      effectMessages.push(`【护法消散】${player.护法玩家.名字}已力竭！`);
      delete player.护法玩家;
    }
  }
  // ==== 合并圣体和神王体效果 ====
   const bodyEffects = {
     // ==== 九天十地体质 ====
  "天生至尊": {
    reduction: 0.25,
    desc: "至尊骨初显，天生异象",
    special: "至尊初现"
  },
  "涅槃·至尊": {
    reduction: 0.40,
    desc: "至尊涅槃，重获新生",
    special: "至尊涅槃"
  },
  "终极涅槃·至尊": {
    reduction: 0.65,
    desc: "终极涅槃，至尊无敌",
    special: "终极至尊"
  },
  "重瞳者": {
    reduction: 0.50,
    desc: "眸开天地，重瞳破虚",
    special: "重瞳开天"
  },
    // 圣体系列
    "荒古圣体": { 
      reduction: 0.15, 
      desc: "金色血气冲天，圣体初显威能",
      special: null
    },
    "小成·荒古圣体": { 
      reduction: 0.30, 
      desc: "黄金血气如海，圣体小成震世",
      special: "圣体异象"
    },
    "大成·荒古圣体": { 
      reduction: 0.60, 
      desc: "九转金身不灭，可叫板大帝",
      special: "圣体异象"
    },
    
    // 霸体系列
    "苍天霸体": {
      reduction: 0.20,
      desc: "紫血沸腾，霸体初成",
      special: "霸钟护体"
    },
    "小成·苍天霸体": {
      reduction: 0.35,
      desc: "霸体紫气冲霄，九天真龙环绕",
      special: "霸钟护体"
    },
    "大成·苍天霸体": {
      reduction: 0.55,
      desc: "霸体无敌，睥睨万界",
      special: "霸钟护体"
    },
    
    // 道胎系列
    "先天道胎": {
      reduction: 0.10,
      desc: "道法自然，胎息天地",
      special: "道法自然"
    },
    "先天圣体道胎": {
      reduction: 0.65,
      desc: "圣体与道胎合一，先天立于不败",
      special: "混沌青莲"
    },
    
    // 混沌体系列
    "混沌体": {
      reduction: 0.45,
      desc: "身与道合，言出法随",
      special: "混沌护体"
    },
    "先天混沌圣体道胎": {
      reduction: 0.80,
      desc: "混沌初开，鸿蒙始判",
      special: "混沌开天"
    },
    
    // 太阳体系列
    "太阳之体": {
      reduction: 0.08,
      desc: "太阳真火初显",
      special: null
    },
    "太阳神体": {
      reduction: 0.25,
      desc: "太阳真火护体",
      special: "太阳真火"
    },
    "太阳圣皇体": {
      reduction: 0.40,
      desc: "太阳圣皇临世",
      special: "太阳圣皇"
    },
    
    // 太阴体系列
    "太阴之体": {
      reduction: 0.08,
      desc: "太阴之力初显",
      special: null
    },
    "太阴神体": {
      reduction: 0.25,
      desc: "太阴之力护体",
      special: "太阴真水"
    },
    "太阴圣皇体": {
      reduction: 0.40,
      desc: "太阴圣皇临世",
      special: "太阴圣皇"
    },
    
    // 神王体系列
    "神王体": {
      reduction: 0.12,
      desc: "神王初显威能",
      special: null
    },
    "小成·神王体": {
      reduction: 0.28,
      desc: "神王净土展开",
      special: "神王净土"
    },
    "大成·神王体": {
      reduction: 0.45,
      desc: "神王再生术",
      special: "神灵之泪"
    },
    
    // 妖体系列
    "天妖体": {
      reduction: 0.10,
      desc: "妖气初显",
      special: null
    },
    "天妖王体": {
      reduction: 0.30,
      desc: "妖王临世",
      special: "妖王真身"
    },
    "天妖皇体": {
      reduction: 0.50,
      desc: "妖皇降世",
      special: "妖皇真身"
    },
    
    // 魔胎系列
    "伪·魔胎仙体": {
      reduction: 0.35,
      desc: "魔胎初成",
      special: "魔气护体"
    },
    "魔胎仙体": {
      reduction: 0.70,
      desc: "魔胎仙体大成",
      special: "魔主降世"
    },
    
 // ==== 神魔体质 ====
  "命运神道体": {
    reduction: 0.30,
    desc: "命运长河显化，神道初成",
    special: "命运长河"
  },
  "极道天魔": {
    reduction: 0.35,
    desc: "天魔降世，万魔朝拜",
    special: "天魔真身"
  },
  "终焉神魔体": {
    reduction: 0.55,
    desc: "神魔一体，终焉降临",
    special: "终焉降临"
  },
  "彼岸·命运神道体": {
    reduction: 0.75,
    desc: "脚踏彼岸金桥，命运长河环绕己身",
    special: "彼岸金桥"
  },
  "无相·万化天魔体": {
    reduction: 0.75,
    desc: "无相魔胎吞吐万灵根性，诸天劫光亦成化生资粮",
    special: "万化魔胎"
  },
    // ==== 诸天万界体质 ====
    "爱莉希雅": {
  reduction: 0.35,
  desc: "真我初显，无瑕之光绽放",
  special: "真我刻印"
},
"人之律者·爱莉希雅": {
  reduction: 0.60,
  desc: "人之律者，为世上所有美好而战",
  special: "始源领域"
},
"始源之律者·爱莉希雅": {
  reduction: 0.85,
  desc: "始源之律，超越因果的终点与起点",
  special: "始源之理"
},
  "木之本樱": {
    reduction: 0.10,
    desc: "魔卡少女初现，封印解除",
    special: "库洛牌"
  },
  "星之杖·木之本樱": {
    reduction: 0.25,
    desc: "星之杖闪耀，魔卡觉醒",
    special: "星之杖"
  },
  "梦之杖·木之本樱": {
    reduction: 0.45,
    desc: "梦之杖在手，完全解放",
    special: "梦之杖"
  },
  "鹿目圆": {
    reduction: 0.20,
    desc: "魔法少女契约签订",
    special: "祈愿之力"
  },
   "许愿者·圆": {
    reduction: 0.35,
    desc: "愿望之力初显，粉色光芒绽放",
    special: "愿望实现"
  },
  "希望之光·圆": {
    reduction: 0.60,
    desc: "希望之光闪耀，因果律初显",
    special: "希望化身"
  },
  "圆神": {
    reduction: 0.85,
    desc: "圆环之理显现，超越因果",
    special: "圆环之理"
  },
  "门矢士": {
    reduction: 0.15,
    desc: "假面骑士降临，世界破坏者",
    special: "骑士降临"
  },
  "帝骑": {
    reduction: 0.25,
    desc: "帝骑之力觉醒，驾驭一切",
    special: "帝骑之力"
  },
  "帝骑·神主": {
    reduction: 0.45,
    desc: "神主形态，终极驾驭",
    special: "神主形态"
  },
  "帝骑·终极神主": {
    reduction: 0.65,
    desc: "超终极神主，破坏神降临",
    special: "破坏神"
  },
  "伊蕾娜": {
    reduction: 0.20,
    desc: "灰之魔女旅行开始",
    special: "魔女扫帚"
  },
  "少女流萤": {
    reduction: 0.30,
    desc: "星穹铁道，少女启程",
    special: "星穹之力"
  },
  "流萤萨姆机甲": {
    reduction: 0.55,
    desc: "萨姆机甲启动，星核猎手",
    special: "机甲武装"
  },
  "天命青儿": {
    reduction: 0.70,
    desc: "一剑独尊，天命所归",
    special: "天命一剑"
  }
  };

if (player.灵根?.name && bodyEffects[player.灵根.name]) {
    const effect = bodyEffects[player.灵根.name];
    const reducedDamage = finalDamage * effect.reduction;
    finalDamage -= reducedDamage;

    effectMessages.push(
        `【${player.灵根.name}】${effect.desc}`,
        `${player.灵根.name}减伤：${(effect.reduction*100).toFixed(0)}% (减免${bigNumberTransform(reducedDamage)})`
    );

// ==== 调整后的帝兵品阶体系 ====
const DI_BING_RANKS = [
    "雏形", "通灵", "铭刻道与理", "斩道王兵", 
    "圣兵", "准帝兵", "极道帝兵", "仙器", 
    "仙王器", "准仙帝器", "仙帝器", "祭道器"
];

// ==== 在体质效果处理之后添加本命帝兵护主效果 ====
if (equipment.帝兵 && equipment.帝兵.author_name === player.id) {
    // 获取帝兵品阶等级
    const rankIndex = DI_BING_RANKS.indexOf(equipment.帝兵.品阶);
    
    // 只有通灵及以上品阶才能护主
    if (rankIndex >= 1) {
        // 根据品阶计算触发概率和减免比例
        const baseProbability = 0.3; // 通灵品阶基础概率
        const baseReduction = 0.15;   // 通灵品阶基础减免
        
        // 品阶越高，触发概率和减免比例越高
        const probability = Math.min(0.95, baseProbability + (rankIndex * 0.08));
        const reductionRate = Math.min(0.7, baseReduction + (rankIndex * 0.06));
        
        // 品阶名称映射
        const rankNames = {
            1: "通灵",
            2: "铭刻道与理",
            3: "斩道王兵",
            4: "圣兵",
            5: "准帝兵",
            6: "极道帝兵",
            7: "仙器",
            8: "仙王器",
            9: "准仙帝器",
            10: "仙帝器",
            11: "祭道器"
        };
        
        // 50%概率触发本命帝兵护主
        if (Math.random() < probability) {
            const reductionAmount = finalDamage * reductionRate;
            finalDamage -= reductionAmount;
            
            effectMessages.push(
                `【本命帝兵护主·${rankNames[rankIndex]}】`,
                `${equipment.帝兵.name}（${equipment.帝兵.品阶}）感应到主人危机，自主复苏！`,
                `帝兵神威绽放，形成护体光幕，`,
                `减免${(reductionRate*100).toFixed(0)}%伤害 (${bigNumberTransform(reductionAmount)})`,
                `触发概率：${(probability*100).toFixed(0)}%`,
                `「帝兵有灵，护主心切！」`
            );
        } else {
            // 未触发时的提示（可选）
            if (Math.random() < 0.3) {
                effectMessages.push(
                    `【帝兵感应】`,
                    `${equipment.帝兵.name}微微颤动，但未完全复苏`,
                    `（${equipment.帝兵.品阶}品阶触发概率：${(probability*100).toFixed(0)}%）`
                );
            }
        }
    } else if (rankIndex === 0) {
        // 雏形帝兵的特殊提示
        if (Math.random() < 0.2) {
            effectMessages.push(
                `【帝兵雏形】`,
                `${equipment.帝兵.name}微微颤动，但尚未通灵，无法护主`,
                `需继续温养提升品阶`
            );
        }
    }
}
    // ==== 特殊效果处理 ====
    if (effect.special) {
      switch(effect.special) {
        // 圣体异象（小成/大成圣体）
        case "圣体异象":
          if (Math.random() < 0.3) {
            const extraReduction = finalDamage * 0.15;
            finalDamage -= extraReduction;
            effectMessages.push(
              `【黄金血气】异象冲天，额外减免${bigNumberTransform(extraReduction)}伤害`,
              `圣体专属异象，可压制万道`
            );
          }
          break;
          
        // 霸钟护体（霸体系列）
        case "霸钟护体":
          if (Math.random() < 0.25) {
            const immuneDamage = finalDamage * 0.5;
            finalDamage -= immuneDamage;
            effectMessages.push(
              `【霸钟长鸣】震碎虚空，减免${bigNumberTransform(immuneDamage)}伤害`,
              `霸体专属防御，紫血沸腾`
            );
          }
          break;
          
        // 道法自然（先天道胎）
        case "道法自然":
          const naturalReduction = finalDamage * 0.1;
          finalDamage -= naturalReduction;
          effectMessages.push(
            `【道法自然】与天地大道共鸣，减免${bigNumberTransform(naturalReduction)}伤害`,
            `万法不侵，诸邪避退`
          );
          break;
          
        // 混沌青莲（先天圣体道胎）
        case "混沌青莲":
          if (Math.random() < 0.4) {
            const chaosReduction = finalDamage * 0.25;
            finalDamage -= chaosReduction;
            effectMessages.push(
              `【混沌青莲】脚下绽放，减免${bigNumberTransform(chaosReduction)}伤害`,
              `仙王虚影在身后叩首`
            );
          }
          break;
          
        // 混沌护体（混沌体）
        case "混沌护体":
          const chaosShield = finalDamage * 0.2;
          finalDamage -= chaosShield;
          effectMessages.push(
            `【混沌气】弥漫周身，减免${bigNumberTransform(chaosShield)}伤害`,
            `演化开天辟地之景`
          );
          break;
          
        // 混沌开天（先天混沌圣体道胎）
        case "混沌开天":
          if (Math.random() < 0.5) {
            const chaosReduction = finalDamage * 0.35;
            finalDamage -= chaosReduction;
            effectMessages.push(
              `【混沌开天】演化鸿蒙，减免${bigNumberTransform(chaosReduction)}伤害`,
              `大道符文交织成永恒神链`
            );
          }
          break;
          
        // 太阳真火（太阳神体）
        case "太阳真火":
          const sunFireReduction = finalDamage * 0.15;
          finalDamage -= sunFireReduction;
          effectMessages.push(
            `【太阳真火】焚烧雷劫，减免${bigNumberTransform(sunFireReduction)}伤害`,
            `至阳之力克制天劫`
          );
          break;
          
        // 太阳圣皇（太阳圣皇体）
        case "太阳圣皇":
          if (Math.random() < 0.3) {
            const emperorReduction = finalDamage * 0.25;
            finalDamage -= emperorReduction;
            effectMessages.push(
              `【太阳圣皇】虚影降临，减免${bigNumberTransform(emperorReduction)}伤害`,
              `圣皇之威震慑天劫`
            );
          }
          break;
          
        // 太阴真水（太阴神体）
        case "太阴真水":
          const moonWaterReduction = finalDamage * 0.15;
          finalDamage -= moonWaterReduction;
          effectMessages.push(
            `【太阴真水】浇灭雷火，减免${bigNumberTransform(moonWaterReduction)}伤害`,
            `至阴之力化解天劫`
          );
          break;
          
        // 太阴圣皇（太阴圣皇体）
        case "太阴圣皇":
          if (Math.random() < 0.3) {
            const emperorReduction = finalDamage * 0.25;
            finalDamage -= emperorReduction;
            effectMessages.push(
              `【太阴圣皇】虚影降临，减免${bigNumberTransform(emperorReduction)}伤害`,
              `圣皇之威震慑天劫`
            );
          }
          break;
          
        // 神王净土（小成神王体）
        case "神王净土":
          if (Math.random() < 0.15) {
            const immuneDamage = finalDamage;
            finalDamage = 0;
            effectMessages.push(
              `【神王净土】万法不侵，完全免疫${bigNumberTransform(immuneDamage)}伤害！`,
              `净土范围内，诸邪避退，万法不沾身`
            );
          }
          break;
          

          
        // 妖王真身（天妖王体）
        case "妖王真身":
          const demonReduction = finalDamage * 0.2;
          finalDamage -= demonReduction;
          effectMessages.push(
            `【妖王真身】显化，减免${bigNumberTransform(demonReduction)}伤害`,
            `太古妖神虚影护体`
          );
          break;
          
        // 妖皇真身（天妖皇体）
        case "妖皇真身":
          if (Math.random() < 0.35) {
            const emperorReduction = finalDamage * 0.3;
            finalDamage -= emperorReduction;
            effectMessages.push(
              `【妖皇真身】降临，减免${bigNumberTransform(emperorReduction)}伤害`,
              `妖皇之威震慑天劫`
            );
          }
          break;
          
        // 魔气护体（伪·魔胎仙体）
        case "魔气护体":
          const demonShield = finalDamage * 0.15;
          finalDamage -= demonShield;
          effectMessages.push(
            `【魔气滔天】形成护盾，减免${bigNumberTransform(demonShield)}伤害`,
            `万魔朝拜，魔气护主`
          );
          break;
          
        // 魔主降世（魔胎仙体）
        case "魔主降世":
          if (Math.random() < 0.4) {
            const lordReduction = finalDamage * 0.4;
            finalDamage -= lordReduction;
            effectMessages.push(
              `【魔主降世】虚影显化，减免${bigNumberTransform(lordReduction)}伤害`,
              `魔道法则镇压诸天`
            );
          }
          break;
          

          
        // 神王再生术（大成神王体）
        case "神王再生术":
          if (player.当前血量 < player.血量上限 * 0.3) {
            const regenerateAmount = Math.floor(player.血量上限 * 0.25);
            player.当前血量 = Math.min(player.血量上限, player.当前血量 + regenerateAmount);
            effectMessages.push(
              `【神王再生术】血脉沸腾，断肢重生`,
              `危急时刻触发神体本源，恢复${bigNumberTransform(regenerateAmount)}点生命`,
              `「神王不死，真灵不灭！」道音回荡`
            );
          }
          break;

        case "神王净土":
          // 小成神王体：神王净土
          if (Math.random() < 0.15) {
            const immuneDamage = finalDamage;
            finalDamage = 0;
            effectMessages.push(
              `【神王净土】万法不侵，完全免疫${bigNumberTransform(immuneDamage)}伤害！`,
              `净土范围内，诸邪避退，万法不沾身`
            );
          }
          break;
  // ==== 九天十地特殊效果 ====
    case "至尊初现":
      if (Math.random() < 0.25) {
        const extraReduction = finalDamage * 0.15;
        finalDamage -= extraReduction;
        effectMessages.push(
          `【至尊骨显化】异象冲天，额外减免${bigNumberTransform(extraReduction)}伤害`,
          `至尊骨初显威能，压制万道`
        );
      }
      break;
      
    // case "至尊涅槃":
    //   const healAmount2 = Math.floor(player.血量上限 * 0.1);
    //   player.当前血量 = Math.min(player.血量上限, player.当前血量 + healAmount2);
    //   effectMessages.push(
    //     `【涅槃重生】至尊骨涅槃，恢复${bigNumberTransform(healAmount2)}点生命`,
    //     `接下来3道雷劫伤害减少15%`
    //   );
      
    //   player.至尊效果 = player.至尊效果 || {};
    //   player.至尊效果.减伤比例 = 0.15;
    //   player.至尊效果.剩余次数 = 3;
    //   break;
      
    case "终极至尊":
      if (Math.random() < 0.4) {
        const immuneDamage = finalDamage * 0.3;
        finalDamage -= immuneDamage;
        effectMessages.push(
          `【至尊无敌】异象显化，减免${bigNumberTransform(immuneDamage)}伤害`,
          `至尊骨终极形态，万法不侵`
        );
      }
      break;
      
    case "重瞳开天":
      const leftEyeReduction = finalDamage * 0.15;
      finalDamage -= leftEyeReduction;
      effectMessages.push(
        `【左眼开天】演化开天辟地，减免${bigNumberTransform(leftEyeReduction)}伤害`,
        `重瞳之力初显威能`
      );
      break;
      
    // ==== 神魔特殊效果 ====
    case "命运长河":
      const fateReduction = finalDamage * 0.1;
      finalDamage -= fateReduction;
      effectMessages.push(
        `【命运长河】显化，减免${bigNumberTransform(fateReduction)}伤害`,
        `命运之力护佑己身`
      );
      break;
      
    case "天魔真身":
      if (Math.random() < 0.3) {
        const demonReduction = finalDamage * 0.25;
        finalDamage -= demonReduction;
        effectMessages.push(
          `【天魔真身】降临，减免${bigNumberTransform(demonReduction)}伤害`,
          `万魔朝拜，魔威滔天`
        );
      }
      break;
      
    case "终焉降临":
      const endReduction = finalDamage * 0.2;
      finalDamage -= endReduction;
      effectMessages.push(
        `【终焉之力】弥漫，减免${bigNumberTransform(endReduction)}伤害`,
        `神魔一体，终结一切`
      );
      break;
      
    case "彼岸金桥":
      const bridgeReduction = finalDamage * 0.25;
      finalDamage -= bridgeReduction;
      effectMessages.push(
        `【彼岸金桥】横跨命运长河，减免${bigNumberTransform(bridgeReduction)}伤害`,
        `超脱彼岸，劫数不加`
      );
      break;
      
    // ==== 诸天万界特殊效果 ====
    case "库洛牌":
      if (Math.random() < 0.3) {
        const cardReduction = finalDamage * 0.2;
        finalDamage -= cardReduction;
        effectMessages.push(
          `【库洛牌·盾】召唤护盾，减免${bigNumberTransform(cardReduction)}伤害`,
          `封印解除！`
        );
      }
      break;
      
    case "星之杖":
      const starReduction = finalDamage * 0.15;
      finalDamage -= starReduction;
      effectMessages.push(
        `【星之杖】闪耀星光，减免${bigNumberTransform(starReduction)}伤害`,
        `隐藏着星星力量的钥匙啊！`
      );
      break;
      
    case "梦之杖":
      if (Math.random() < 0.35) {
        const dreamReduction = finalDamage * 0.3;
        finalDamage -= dreamReduction;
        effectMessages.push(
          `【梦之杖】释放梦境之力，减免${bigNumberTransform(dreamReduction)}伤害`,
          `请在我面前显示你真正的力量！`
        );
      }
      break;
      
    case "祈愿之力":
      const wishReduction = finalDamage * 0.1;
      finalDamage -= wishReduction;
      effectMessages.push(
        `【祈愿之力】守护，减免${bigNumberTransform(wishReduction)}伤害`,
        `为了所有魔法少女的幸福`
      );
      break;
      
    case "圆环之理":
      if (Math.random() < 0.5) {
        const circleReduction = finalDamage * 0.4;
        finalDamage -= circleReduction;
        effectMessages.push(
          `【圆环之理】显现，减免${bigNumberTransform(circleReduction)}伤害`,
          `超越因果，改写命运`
        );
      }
      break;
      
    case "骑士降临":
      if (Math.random() < 0.25) {
        const riderReduction = finalDamage * 0.3;
        finalDamage -= riderReduction;
        effectMessages.push(
          `【假面骑士降临】减免${bigNumberTransform(riderReduction)}伤害`,
          `世界的破坏者，降临！`
        );
      }
      break;
      
    case "帝骑之力":
      const decadeReduction = finalDamage * 0.15;
      finalDamage -= decadeReduction;
      effectMessages.push(
        `【帝骑之力】驾驭一切，减免${bigNumberTransform(decadeReduction)}伤害`,
        `我只是一个路过的假面骑士`
      );
      break;
      
    case "神主形态":
      if (Math.random() < 0.35) {
        const godReduction = finalDamage * 0.35;
        finalDamage -= godReduction;
        effectMessages.push(
          `【神主形态】终极驾驭，减免${bigNumberTransform(godReduction)}伤害`,
          `Final Form Ride！`
        );
      }
      break;
      
    case "破坏神":
      const destroyReduction = finalDamage * 0.25;
      finalDamage -= destroyReduction;
      effectMessages.push(
        `【破坏神】降临，减免${bigNumberTransform(destroyReduction)}伤害`,
        `超终极形态，破坏一切`
      );
      break;
      
    case "魔女扫帚":
      const broomReduction = finalDamage * 0.1;
      finalDamage -= broomReduction;
      effectMessages.push(
        `【魔女扫帚】飞行躲避，减免${bigNumberTransform(broomReduction)}伤害`,
        `天才魔女伊蕾娜`
      );
      break;
      
    case "星穹之力":
      const railReduction = finalDamage * 0.15;
      finalDamage -= railReduction;
      effectMessages.push(
        `【星穹之力】护体，减免${bigNumberTransform(railReduction)}伤害`,
        `开拓者，启程！`
      );
      break;
      
    case "机甲武装":
      if (Math.random() < 0.4) {
        const mechaReduction = finalDamage * 0.3;
        finalDamage -= mechaReduction;
        effectMessages.push(
          `【萨姆机甲】武装，减免${bigNumberTransform(mechaReduction)}伤害`,
          `星核猎手，执行任务`
        );
      }
      break;
      
    case "天命一剑":
      const swordReduction = finalDamage * 0.25;
      finalDamage -= swordReduction;
      effectMessages.push(
        `【天命一剑】斩破天劫，减免${bigNumberTransform(swordReduction)}伤害`,
        `一剑独尊，天命所归`
      );
      break; 
        case "神灵之泪":
          // 大成神王体/东荒神王体：神灵之泪
          const healAmount = Math.floor(player.血量上限 * 0.08);
          player.当前血量 = Math.min(player.血量上限, player.当前血量 + healAmount);
          effectMessages.push(
            `【神灵之泪】神王悲悯，泪洒星空`,
            `恢复${bigNumberTransform(healAmount)}点生命，接下来3道雷劫伤害减少20%`
          );
          
          player.神王效果 = player.神王效果 || {};
          player.神王效果.减伤比例 = 0.20;
          player.神王效果.剩余次数 = 3;
          break;

            case "神王再生术":
        // 神王再生术（濒死恢复）
        if (player.当前血量 < player.血量上限 * 0.3) {
          const regenerateAmount = Math.floor(player.血量上限 * 0.25);
          player.当前血量 = Math.min(player.血量上限, player.当前血量 + regenerateAmount);
          effectMessages.push(
            `【神王再生术】血脉沸腾，断肢重生`,
            `危急时刻触发神体本源，恢复${bigNumberTransform(regenerateAmount)}点生命`,
            `「神王不死，真灵不灭！」道音回荡`
          );
        }
        break;
      }
    }
  }

  // ==== 神王效果持续减伤 ====
  if (player.神王效果?.剩余次数 > 0) {
    const reduction = finalDamage * player.神王效果.减伤比例;
    finalDamage -= reduction;
    player.神王效果.剩余次数--;
    
    effectMessages.push(
      `【神之序曲】大道和鸣，减伤${bigNumberTransform(reduction)}`,
      `剩余减伤次数：${player.神王效果.剩余次数}`
    );
  }
    if (this.isEffectActive(player, "者字秘") && player.者字秘效果) {
      const 减伤值 = originalDamage * (player.者字秘效果.减伤比例 || 0.25) * eraFactor;
      finalDamage -= 减伤值;
      const 恢复量 = Math.floor(player.血量上限 * (player.者字秘效果.恢复比例 || 0.05));
      player.当前血量 = Math.min(player.血量上限, player.当前血量 + 恢复量);
      
      effectMessages.push(
        `【者字秘】减免${bigNumberTransform(减伤值)}伤害，恢复${恢复量}生命`,
        `剩余减伤次数：${--player.者字秘效果.剩余次数}`
      );
    }

    if (this.isEffectActive(player, "柳神法") && player.柳神效果) {
      const 减伤值 = originalDamage * (player.柳神效果.减伤比例 || 0.2);
      finalDamage -= 减伤值;
      
      effectMessages.push(
        `【柳神庇护】抵消${bigNumberTransform(减伤值)}伤害`,
        `剩余庇护层数：${--player.柳神效果.庇护层数}`
      );
      
      if (player.柳神效果.持续恢复) {
        player.当前血量 += player.柳神效果.持续恢复.治疗量 || 0;
        player.柳神效果.持续恢复.回合数--;
      }
    }

    if (this.isEffectActive(player, "雷帝宝术") && player.雷帝效果) {
      const 转化比例 = Math.max(0, Math.min(
        Number(player.雷帝效果.转化比例) || LEIDI_TRIBULATION_CONVERSION_RATE,
        LEIDI_TRIBULATION_CONVERSION_RATE
      ));
      const 吸收量 = originalDamage * 转化比例;
      const 治疗量 = Math.min(吸收量, player.血量上限 - player.当前血量);
      
      player.当前血量 += 治疗量;
      player.雷帝效果.当前抗性 = Math.min(0.9, 
        (player.雷帝效果.当前抗性 || 0) + (player.雷帝效果.抗性提升 || 0.1)
      );
      
      effectMessages.push(
        `【雷劫转化】吸收${bigNumberTransform(治疗量)}伤害治疗`,
        `雷抗提升至：${((player.雷帝效果.当前抗性 || 0)*100).toFixed(0)}%`,
        `剩余转化次数：${--player.雷帝效果.剩余次数}`
      );
    }

    if (player.真凰效果?.免死 && finalDamage >= player.当前血量) {
      finalDamage = player.当前血量 - 10000;
      effectMessages.push("【真凰涅槃】触发免死效果！");
      delete player.真凰效果.免死;
    }

    if (this.isEffectActive(player, "凰劫再生术")) {
      const 减伤值 = finalDamage * player.凰劫效果.阶段减伤;
      finalDamage -= 减伤值;
      player.防御 *= (1 + player.凰劫效果.防御提升);
      player.凰劫效果.已提升 += player.凰劫效果.防御提升;
      
      effectMessages.push(
        `【万劫不灭】减伤${bigNumberTransform(减伤值)}`,
        `累计防御提升：${(player.凰劫效果.已提升*100).toFixed(0)}%`
      );
    }
   // ==== 不灭经效果 ====
    if (this.isEffectActive(player, "不灭经") && player.不灭经效果) {
        const 减伤值 = originalDamage * (player.不灭经效果.减伤比例 || 0.4);
        finalDamage -= 减伤值;
        const 恢复量 = Math.floor(player.血量上限 * (player.不灭经效果.恢复比例 || 0.3));
        player.当前血量 = Math.min(player.血量上限, player.当前血量 + 恢复量);
        
        effectMessages.push(
            `【不灭经文】减免${bigNumberTransform(减伤值)}伤害`,
            `恢复${恢复量}生命（不灭经效果）`,
            `剩余减伤次数：${--player.不灭经效果.剩余次数}`
        );
        
        if (player.不灭经效果.剩余次数 <= 0) {
            delete player.不灭经效果;
        }
    }

    // ==== 补天术效果 ====
    if (this.isEffectActive(player, "补天术")) {
        // 补天术主要效果在复活时体现，这里可以添加持续效果
        if (player.补天术效果?.冷却缩减) {
            effectMessages.push(`【补天之力】技能冷却时间缩短20%`);
        }
    }

    // ==== 万化圣诀效果 ====
    if (this.isEffectActive(player, "万化圣诀")) {
        if (player.万化圣诀效果?.免死 && finalDamage >= player.当前血量) {
            finalDamage = player.当前血量 - 10000;
            effectMessages.push("【万化圣诀】触发免死效果！");
            delete player.万化圣诀效果.免死;
        }
    }

    // ==== 涅槃仙功效果 ====
    if (this.isEffectActive(player, "涅槃仙功") && player.涅槃仙功效果) {
        const 减伤值 = originalDamage * (player.涅槃仙功效果.减伤比例 || 0.2);
        finalDamage -= 减伤值;
        
        effectMessages.push(
            `【涅槃减伤】减免${bigNumberTransform(减伤值)}伤害`,
            `剩余减伤次数：${--player.涅槃仙功效果.剩余次数}`
        );
        
        if (player.涅槃仙功效果.剩余次数 <= 0) {
            delete player.涅槃仙功效果;
        }
    }

    if (
      player.当前先天至宝 === '天地玄黄玲珑塔' &&
      player.先天权柄?.玄黄护道待用
    ) {
      player._玄黄护道渡劫 = true;
      delete player.先天权柄.玄黄护道待用;
      effectMessages.push('【玄黄护道】天地玄黄气护住道基，本次渡劫所受伤害降低30%。');
    }
    if (player._玄黄护道渡劫) finalDamage *= 0.7;

    // 黑皇欺天阵纹：现在改为区间偏移（-15 ~ +15），由 calcMaxTheoreticalAtk 应用，此处不再乘伤害
    const defended = reduceTribulationDamageByDefense(finalDamage, player.防御);
    if (defended.reduction > 0) {
      effectMessages.push(
        `【道躯防御】防御×0.3抵消${bigNumberTransform(defended.reduction)}点雷劫伤害`
      );
    }

    return {
      damage: defended.damage,
      messages: effectMessages
    };
  }

  // ==== 辅助方法 ====
  getDefaultResurrectTimes(gongfaName) {
    return this.gongfa[gongfaName]?.resurrectTimes || 0;
  }

  getEraDifficultyFactor() {
    const set = config.getConfig('xiuxian', 'xiuxian');
    const eraIndex = set.Era?.current?.index || 0;
    const difficultyRates = [0.8, 0.9, 1.0, 1.2, 1.5];
    return difficultyRates[eraIndex];
  }

  getMinggeCultivationCost(player, eraAdjustedCost, type = 'tribulation') {
    const effects = getMinggeEffects(player, data.minggeList);
    return calculateZhetianTribulationCosts(eraAdjustedCost, effects, type).cultivationCost;
  }

  getMinggeCostLine(player, eraAdjustedCost, type = 'tribulation') {
    const effects = getMinggeEffects(player, data.minggeList);
    const { cultivationCost, reduction } = calculateZhetianTribulationCosts(
      eraAdjustedCost,
      effects,
      type
    );
    if (cultivationCost >= eraAdjustedCost) return null;
    return `命格修为减免：${(reduction * 100).toFixed(0)}%（血气消耗不变）`;
  }

clearTempEffects(player) {
    // 只清理已失效的效果，保留仍然有效的持续效果
    const effects = [
        { key: '者字秘效果', check: (effect) => effect?.剩余次数 <= 0 },
        { key: '真凰效果', check: (effect) => !effect?.免死 && (!effect?.阶段减伤 || effect?.阶段减伤 <= 0) },
        { key: '雷帝效果', check: (effect) => effect?.剩余次数 <= 0 },
        { key: '柳神效果', check: (effect) => effect?.庇护层数 <= 0 && (!effect?.持续恢复 || effect?.持续恢复.回合数 <= 0) },
        { key: '凰劫效果', check: (effect) => effect?.阶段减伤 <= 0 },
        { key: '不灭经效果', check: (effect) => effect?.剩余次数 <= 0 },
        { key: '补天术效果', check: (effect) => effect?.持续时间 <= 0 },
        { key: '万化圣诀效果', check: (effect) => effect?.剩余次数 <= 0 },
        { key: '涅槃仙功效果', check: (effect) => effect?.剩余次数 <= 0 }
    ];
    
    effects.forEach(({ key, check }) => {
        if (player[key] && check(player[key])) {
            delete player[key];
        }
    });
}



  formatNumber(num) {
    return num.toLocaleString();
  }
}


    
function createEmperorPlayer(emperorName, battleNumber, player, difficultyRate = 1) {
    // 基于玩家属性计算大帝虚影属性
    const baseAttack = player.攻击 * 1; // 基础攻击为玩家攻击的1.5倍
    const baseDefense = player.防御 * 1; // 基础防御为玩家防御的1.5倍
    const baseHP = player.血量上限 * 11; // 基础生命为玩家生命上限的1.5倍
    
    // 创建B_player对象
    const B_player = {
        名号: `${emperorName}虚影`,
        当前血量: baseHP,
        攻击: baseAttack,
        防御: baseDefense,
        学习的功法: [],
        灵根: { name: "普通灵根", type: "普通", 法球倍率: 1.0 },
        法球倍率: 1.0,
        血量上限: baseHP,
        魔道值: 0,
        神石: 0,
        dongjie: false,
        mijinglevel_id: 16, // 大帝级
    };
    
    // 根据大帝名字添加特性和功法
    switch (emperorName) {
        case "太阳圣皇":
            B_player.当前血量 = baseHP * 0.45;
            B_player.攻击 = baseAttack * 0.45;
            B_player.防御 = baseDefense * 0.45;
            B_player.学习的功法.push("扶桑神树守护","太阳真火焚九天","太阳真经", "扶桑神术");
            B_player.灵根 = { name: "太阳神体", type: "特殊体质", "法球倍率": 1.5 };
            B_player.法球倍率 =  1.5;
            break;
            
        case "青帝":
            B_player.当前血量 = baseHP * 0.45;
            B_player.攻击 = baseAttack * 0.45;
            B_player.防御 = baseDefense * 0.45;
            B_player.学习的功法.push("青莲万法不侵","妖帝九斩","混沌青莲开天", "混沌青莲法");
            B_player.灵根 = { name: "混沌青莲体", type: "特殊体质", "法球倍率": 1.5 };
            B_player.法球倍率 = 1.5;
            break;
            
        case "虚空大帝":
            B_player.当前血量 = baseHP * 0.45;
            B_player.攻击 = baseAttack * 0.45;
            B_player.防御 = baseDefense * 0.45;
            B_player.学习的功法.push("虚空遁形","虚空经", "虚空永恒放逐","大虚空术");
            B_player.灵根 = { name: "虚空道体", type: "特殊体质", "法球倍率": 1.5 };
            B_player.法球倍率 = 1.5;
            break;
            
        case "斗战圣皇":
            B_player.当前血量 = baseHP * 0.45;
            B_player.攻击 = baseAttack * 0.75; // 斗战圣皇攻击更高
            B_player.防御 = baseDefense * 0.45;
            B_player.学习的功法.push("斗战金身","斗战圣法·葬仙图", "九转天功","斗字秘");
            B_player.灵根 = { name: "斗战圣体", type: "特殊体质", "法球倍率": 3 };
            B_player.法球倍率 = 3;
            break;    

        case "无始大帝":
            B_player.当前血量 = baseHP * 0.45;
            B_player.攻击 = baseAttack * 1;
            B_player.防御 = baseDefense * 0.45;
            B_player.学习的功法.push("无始钟护体","无始无终","无始经", "时光逆转","斗字秘","临字秘","前字秘","者字秘","皆字秘");
            B_player.灵根 = { name: "先天圣体道胎", type: "特殊体质", "法球倍率": 2 };
            B_player.法球倍率 = 2;
            break;
            
        case "狠人大帝":
            B_player.当前血量 = baseHP * 0.45;
            B_player.攻击 = baseAttack * 1;
            B_player.防御 = baseDefense * 0.45;
            B_player.学习的功法.push("不灭天功", "万化圣诀", "飞仙","一念花开，君临天下","凰劫再生术","吞天魔功","斩天道");
            B_player.灵根 = { name: "魔胎仙体", type: "特殊体质", "法球倍率": 2 };
            B_player.法球倍率 = 2;
            break;
    }
    
    // 根据战斗次数增强
    const multiplier = 1 + (battleNumber - 1) * 0.1 * difficultyRate;
    B_player.当前血量 = B_player.当前血量 * multiplier;
    B_player.攻击 = B_player.攻击 * multiplier;
    B_player.防御 = B_player.防御 * multiplier;
    B_player.血量上限 = B_player.当前血量; // 设置血量上限
    
    return B_player;
}
// 睡眠函数
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 辅助函数：获取神圣称谓
function getDivineAppellation() {
    const appellations = ["玄", "昊", "寰", "太初", "道衍", "星穹", "混元", "混沌"];
    return appellations[Math.floor(Math.random() * appellations.length)];
}

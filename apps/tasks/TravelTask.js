import { plugin, common,  config, data } from '../../api/api.js';
import {
  Read_player,
  Read_najie,
  isNotNull,
  Add_najie_thing,
  Add_修为,
  Add_血气,
  Reduse_player_学习功法,
  Add_player_学习功法,
  Add_HP,
  Add_灵石,
  Add_源石,
  Write_player,
  Write_najie,
    Read_equipment,
    Write_equipment,
    exist_najie_thing,
    getMonsterByLocation,
  Add_寿元,
  Read_danyao,
  get_fight_img,
  Write_danyao,
   bigNumberTransform,
  zd_battle,
  get_log_img,
  player_efficiency,
} from '../../model/xiuxian.js';
import { AppName } from '../../app.config.js';
import {
  FORBIDDEN_SUPREME_ATTENTION_THRESHOLD,
  applyForbiddenSupremePlunder,
  buildForbiddenSupreme,
  getLocationName,
  PLACE_LOCATION_MAP,
  recordUnfetteredJourney,
  registerForbiddenSupremeAttention,
  selectForbiddenSupreme,
} from '../../model/weimianTravel.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import { randomUUID } from 'node:crypto';
import {
  buildRelativeTianjiaoCombatant,
  buildTianjiaoSurrenderOffer,
  isTianjiaoAvailable,
  rollIndependentTianjiaoEscape,
} from '../../model/tianjiaoHostility.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { tryNpcProtectorIntervention } from '../../model/npcProtector.js';
import { replyOfficialMessage } from '../../model/officialMessage.js';

function resolveStoredLocation(value, name = '') {
  const locationName = getLocationName(name) || getLocationName(value);
  return locationName && Object.hasOwn(PLACE_LOCATION_MAP, locationName)
    ? PLACE_LOCATION_MAP[locationName]
    : value;
}

export class TravelTask extends plugin {
  constructor() {
    super({
      name: 'TravelTask',
      dsc: '定时任务',
      event: 'message',
      priority: 300,
      rule: [],
    });
    this.set = config.getConfig('task', 'task');
    this.task = [
      {
        cron: this.set.travel_task, // 使用配置中的传送任务时间
        name: 'TravelTask',
        fnc: () => this.checkTravelTasks(),
      }
    ];
    // ========== 在constructor中添加偷袭配置 ==========
    // 仇恨值系统配置
    this.HATRED_CONFIG = {
      LEVELS: {
        陌生: { min: 0, max: 10, escapeChance: 0.1, protectorChance: 0 },
        注意: { min: 11, max: 30, escapeChance: 0.25, protectorChance: 0.15 },
        敌视: { min: 31, max: 60, escapeChance: 0.45, protectorChance: 0.35 },
        仇恨: { min: 61, max: 100, escapeChance: 0.65, protectorChance: 0.55 },
        死敌: { min: 101, max: 200, escapeChance: 0.8, protectorChance: 0.75 },
        不死不休: { min: 201, max: Infinity, escapeChance: 0.95, protectorChance: 0.9 }
      },
      GAIN: {
        挑战失败: 5,
        挑战成功: 20,
        击杀: 50,
        嘲讽: 3,
        护道失败: 30
      }
    };

this.AMBUSH_CONFIG = {
  // 基础触发概率（根据仇恨等级调整）
  BASE_CHANCE: 0.15, // 15%基础概率
  
  // 仇恨等级配置
  LEVELS: {
    陌生: { min: 0, max: 0 },
    注意: { min: 1, max: 30 },
    敌视: { min: 31, max: 60 },
    仇恨: { min: 61, max: 120 },
    死敌: { min: 121, max: 200 },
    不死不休: { min: 201, max: Infinity }
  },
  
  // 仇恨等级对概率的加成
  HATRED_BONUS: {
    陌生: 0,
    注意: 0.05,
    敌视: 0.10,
    仇恨: 0.20,
    死敌: 0.35,
    不死不休: 0.50
  },
  
  // 偷袭类型权重（根据仇恨等级）
  AMBUSH_TYPES: {
    陌生: [
      { type: '单人偷袭', weight: 100, minHatred: 0 }
    ],
    注意: [
      { type: '单人偷袭', weight: 70, minHatred: 0 },
      { type: '带人围攻', weight: 30, minHatred: 15 }
    ],
    敌视: [
      { type: '单人偷袭', weight: 40, minHatred: 0 },
      { type: '带人围攻', weight: 50, minHatred: 30 },
      { type: '大阵围困', weight: 10, minHatred: 45 }
    ],
    仇恨: [
      { type: '单人偷袭', weight: 20, minHatred: 0 },
      { type: '带人围攻', weight: 50, minHatred: 60 },
      { type: '大阵围困', weight: 30, minHatred: 80 }
    ],
    死敌: [
      { type: '带人围攻', weight: 40, minHatred: 100 },
      { type: '大阵围困', weight: 60, minHatred: 150 }
    ],
    不死不休: [
      { type: '大阵围困', weight: 100, minHatred: 200 }
    ]
  },
  
  // 围攻人数配置
  MINIONS_COUNT: {
    带人围攻: { min: 2, max: 5 },
    大阵围困: { min: 5, max: 9 }
  },
  
  // 偷袭者属性倍率（相对于玩家）
  ATTACKER_MULTIPLIER: {
    单人偷袭: 0.8,      // 略弱于玩家
    带人围攻: 0.6,      // 较弱但人多
    大阵围困: 0.4       // 很弱但大阵加成
  },
  
  // 大阵加成
  FORMATION_BONUS: {
    攻击加成: 1.5,
    防御加成: 2.0,
    血量加成: 3.0
  }
};

// 偷袭对话库
this.AMBUSH_DIALOGUES = {
  开场: [
    "【虚空震荡】位面通道突然崩塌！",
    "【杀机毕露】一道恐怖气息封锁了虚空！",
    "【空间破碎】位面乱流中杀出数道身影！",
    "【阵法启动】四周虚空被神秘符文封锁！",
    "【天骄降临】位面通道被人强行打断！"
  ],
  
  单人偷袭: {
    开场: [
      "{tianjiaoName}从虚空中杀出：「{dialogue}」",
      "一道身影撕裂空间而来，正是{tianjiaoName}：「{dialogue}」",
      "虚空破碎，{tianjiaoName}拦住了去路：「{dialogue}」"
    ],
    战斗开始: [
      "{tianjiaoName}摆开架势，准备与你一战！",
      "杀意弥漫，{tianjiaoName}已锁定你的气息！",
      "今日不是你死就是我亡！"
    ]
  },
  
  带人围攻: {
    开场: [
      "{tianjiaoName}带着{count}名手下封锁了虚空：「{dialogue}」",
      "虚空中走出数道身影，为首的正是{tianjiaoName}：「{dialogue}」",
      "{tianjiaoName}一声令下，{count}名强者同时出手！"
    ],
    战斗开始: [
      "{count}名强者同时围攻，形势危急！",
      "你被{tianjiaoName}的人团团围住，插翅难逃！",
      "以多欺少？这就是天骄的手段？"
    ]
  },
  
  大阵围困: {
    开场: [
      "{tianjiaoName}启动了【{formationName}】：「{dialogue}」",
      "虚空被大阵封锁，{tianjiaoName}立于阵眼：「{dialogue}」",
      "【{formationName}】启动，天地变色，{tianjiaoName}的声音传来：「{dialogue}」"
    ],
    战斗开始: [
      "大阵加持下，{tianjiaoName}的实力暴涨！",
      "阵法之力笼罩全身，{tianjiaoName}如同战神降世！",
      "被困大阵之中，你必须破阵而出！"
    ]
  },
  
  胜利: [
    "你击退了偷袭者，但位面通道已受损...",
    "鲜血染红虚空，你带着伤势继续前进...",
    "这一战虽胜，但你已精疲力竭..."
  ],
  
  失败: [
    "【陨落】你倒在了位面乱流之中...",
    "【死亡】天骄的围攻让你神魂俱灭...",
    "【陨落】大阵之力碾碎了你的肉身..."
  ],
  
  逃脱: [
    "【重伤逃脱】你燃烧精血逃出生天，但道基受损...",
    "【险死还生】关键时刻你捏碎传送符逃脱，但身受重伤...",
    "【残命】你以重伤为代价撕开空间裂缝逃走..."
  ]
};

// 大阵名称库
this.FORMATION_NAMES = [
  "九幽锁魂阵", "万剑诛仙阵", "阴阳逆乱阵", 
  "虚空囚笼阵", "血海轮回阵", "天罡地煞阵",
  "五行灭绝阵", "星辰陨落阵", "混沌灭世阵"
];

  }
  
  // ==================== 偷袭战败处理 ====================
  async handleAmbushDefeat(e, player, tianjiaoName, tianjiaoData, ambushType, group_id) {
    const usr_qq = player.id;
    
    try {
      // 1. 构建死亡文案
      const defeatDialogue = this.getRandomDialogue(tianjiaoData, '胜利嘲讽') || "哼，不过如此！";
      const deathMessages = this.generateDeathMessages(
        player, 
        tianjiaoName, 
        tianjiaoData, 
        ambushType, 
        null, // dropInfo 先设为null
        defeatDialogue
      );

      // 2. 发送死亡消息（文本）
      await this.sendTextMessage(usr_qq, deathMessages.join('\n'), group_id);
      
      // 保留当前存档，由轮回事务在最终往生时统一生成遗物并重建角色。
      // 这样轮回路上的强者仍有机会在倒计时结束前将玩家救回。
      const rebirthTime = Date.now() + 5 * 60 * 1000; // 5分钟后转世
      const task = {
        player_id: usr_qq,
        player_name: player.名号,
        player_data: player,
        start_time: Date.now(),
        end_time: rebirthTime,
        acount: player.轮回转世次数 || 0,
        group_id: group_id,
        status: '轮回中',
        type: '偷袭身死',
        isAmbushDeath: true, // 标记为偷袭死亡
        ambushTianjiao: tianjiaoName
      };
      const action = {
        action: '轮回往生路',
        type: 'zhuanshi',
        start_time: task.start_time,
        end_time: task.end_time,
        description: `被${tianjiaoName}击杀，等待往生或救援`,
        status: '轮回中',
      };

      await redis.multi()
        .set(`xiuxian:zhuanshi_task:${usr_qq}`, JSON.stringify(task))
        .set(`xiuxian:player:${usr_qq}:action`, JSON.stringify(action))
        .exec();

      console.log(`【偷袭死亡】玩家 ${usr_qq} 被 ${tianjiaoName} 击杀`);

      return true;

    } catch (err) {
      console.error('处理偷袭战败失败:', err);
      return false;
    }
  }

  // ==================== 生成死亡文案（辰东风格） ====================
  generateDeathMessages(player, tianjiaoName, tianjiaoData, ambushType, dropInfo, defeatDialogue) {
    const messages = [];
    const playerName = player.名号;
    const tianjiaoLevel = tianjiaoData.境界;
    
    // 根据偷袭类型选择不同文案
    switch (ambushType) {
      case '单人偷袭':
        messages.push(...this.generateSoloDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo));
        break;
      case '带人围攻':
        messages.push(...this.generateGroupDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo));
        break;
      case '大阵围困':
        messages.push(...this.generateFormationDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo));
        break;
      default:
        messages.push(...this.generateSoloDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo));
    }
    
    // 统一结尾：轮回状态
    messages.push('');
    messages.push(`【轮回转世】`);
    messages.push(`你的魂魄被地府之力牵引，即将进入轮回...`);
    messages.push(`预计5分钟后转世重生`);
    
    return messages;
  }

  // 单人偷袭死亡文案
  generateSoloDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo) {
    return [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `【陨落·天骄截杀】`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `${tianjiaoName}:「${defeatDialogue}」`,
      ``,
      `虚空破碎，一道身影如鬼魅般出现。`,
      `${tianjiaoName}，${tianjiaoLevel}的存在，`,
      `只是一掌，便震碎了你的护体神光！`,
      ``,
      `你拼命抵抗，但在绝对实力面前，`,
      `一切挣扎都是徒劳...`,
      ``,
      `"噗——"`,
      ``,
      `鲜血染红了虚空，你的肉身如瓷器般碎裂。`,
      `${tianjiaoName}冷漠地看着你的残躯，`,
      `随手一挥，将你的纳戒摄入手中。`,
      ``,
      `【纳戒被夺】`,
      dropInfo ? 
        `纳戒中${dropInfo.value > 0 ? '价值不菲的' : ''}物品尽归其有...` : 
        `纳戒中空空如也，被随手丢弃...`,
      ``,
      `你的魂魄离体而出，想要逃遁，`,
      `却被${tianjiaoName}一指点碎！`,
      ``,
      `「蝼蚁之辈，也敢与我为敌？」`,
      ``,
      `神魂俱灭，道消身殒。`,
      `这一世，你走到了尽头...`
    ];
  }

  // 带人围攻死亡文案
  generateGroupDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo) {
    return [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `【陨落·群狼噬虎】`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `${tianjiaoName}:「${defeatDialogue}」`,
      ``,
      `虚空被封锁，数道身影同时杀出！`,
      `${tianjiaoName}立于虚空，冷眼旁观，`,
      `手下强者如狼似虎，将你团团围住。`,
      ``,
      `你左冲右突，却始终无法突破包围。`,
      `每一击都带走你大片血肉，`,
      `每一剑都削去你部分神魂...`,
      ``,
      `"啊——！"`,
      ``,
      `你发出不甘的怒吼，但回应你的，`,
      `只有更加凌厉的杀招！`,
      ``,
      `最终，你倒在了血泊之中。`,
      `${tianjiaoName}缓步走来，`,
      `一脚踩在你的头颅之上。`,
      ``,
      `「这就是得罪我的下场。」`,
      ``,
      `【纳戒被夺】`,
      dropInfo ? 
        `手下将你的纳戒呈上，${tianjiaoName}满意地点头...` : 
        `纳戒中并无宝物，被随手捏碎...`,
      ``,
      `你的肉身被炼化成一具尸傀，`,
      `永世不得超生...`,
      ``,
      `魂魄被大阵磨灭，`,
      `这一世，彻底终结...`
    ];
  }

  // 大阵围困死亡文案
  generateFormationDeath(playerName, tianjiaoName, tianjiaoLevel, defeatDialogue, dropInfo) {
    const formationName = this.FORMATION_NAMES[Math.floor(Math.random() * this.FORMATION_NAMES.length)];
    
    return [
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `【陨落·大阵炼魂】`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `${tianjiaoName}:「${defeatDialogue}」`,
      ``,
      `【${formationName}】轰然启动！`,
      `天地变色，阴阳逆转，`,
      `你被彻底困死在阵眼之中！`,
      ``,
      `大阵之力如磨盘般碾压而来，`,
      `你的肉身开始崩解，`,
      `你的神魂开始燃烧...`,
      ``,
      `"不——！"`,
      ``,
      `你拼命催动功法，想要破阵而出，`,
      `但大阵之力源源不绝，`,
      `如那天道之威，不可抗拒！`,
      ``,
      `${tianjiaoName}盘坐阵眼，冷笑连连：`,
      `「此阵专炼强者神魂，你能死在此阵中，也算荣幸。」`,
      ``,
      `你的肉身被炼化成一枚血色丹药，`,
      `你的神魂被抽入阵眼，永世镇压！`,
      ``,
      `【纳戒被夺】`,
      dropInfo ? 
        `大阵将你的纳戒吐出，${tianjiaoName}收入囊中...` : 
        `纳戒在大阵中化为灰烬...`,
      ``,
      `魂飞魄散，永世不得超生。`,
      `这一世，你成为了别人的养料...`
    ];
  }

  // ========== 添加到天骄系统类中 ==========

  /**
   * 检查并触发偷袭事件
   */
  async checkAmbush(e, player, tianjiaoName, group_id) {
    const usr_qq = player.id;
    if (await redis.get(`tianjiao:pending:${usr_qq}`)) return false;
    const fearUntil = Number(await redis.get(`tianjiao:fear:${tianjiaoName}:${usr_qq}`)) || 0;
    if (fearUntil > Date.now()) return false;
    if (!await this.canTianjiaoAmbush(tianjiaoName)) return false;
    
    // 获取仇恨值
    const hatred = await this.getPlayerHatred(tianjiaoName, usr_qq);
    const hatredLevel = this.getHatredLevel(hatred);
    
    // 计算触发概率
    const baseChance = this.AMBUSH_CONFIG.BASE_CHANCE;
    const bonusChance = this.AMBUSH_CONFIG.HATRED_BONUS[hatredLevel] || 0;
    const totalChance = baseChance + bonusChance;
    
    // 判断是否触发
    if (Math.random() > totalChance) {
      return false; // 未触发
    }
    
    // 选择偷袭类型
    const ambushType = this.selectAmbushType(hatredLevel, hatred);
    if (!ambushType) {
      return false;
    }
    
    // 执行偷袭
    return await this.executeAmbush(e, player, tianjiaoName, ambushType, group_id);
  }
  
  getHatredLevel(hatredValue) {
    for (const [level, range] of Object.entries(this.AMBUSH_CONFIG.LEVELS)) {
      if (hatredValue >= range.min && hatredValue <= range.max) {
        return level;
      }
    }
    return '陌生';
  }
  
  /**
   * 选择偷袭类型
   */
  selectAmbushType(hatredLevel, hatredValue) {
    const types = this.AMBUSH_CONFIG.AMBUSH_TYPES[hatredLevel];
    if (!types || types.length === 0) {
      return null;
    }
    
    // 过滤符合条件的类型
    const validTypes = types.filter(t => hatredValue >= t.minHatred);
    if (validTypes.length === 0) {
      return null;
    }
    
    // 按权重随机选择
    const totalWeight = validTypes.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const type of validTypes) {
      random -= type.weight;
      if (random <= 0) {
        return type.type;
      }
    }
    
    return validTypes[0].type;
  }

  /**
   * 执行偷袭战斗
   */
  async executeAmbush(e, player, tianjiaoName, ambushType, group_id) {
    const usr_qq = player.id;
    const tianjiaoData = data.weimiantianjiao_list.find(tj => tj.名号 === tianjiaoName);
    
    if (!tianjiaoData) {
      return false;
    }
    
    // 发送开场白
    const openingDialogue = this.getRandomDialogue(tianjiaoData, '败北狠话') || "受死吧！";
    const randomOpening = this.AMBUSH_DIALOGUES.开场[Math.floor(Math.random() * this.AMBUSH_DIALOGUES.开场.length)];
    
    let ambushMsg = [randomOpening];
    
    // 根据偷袭类型构建消息
    const typeConfig = this.AMBUSH_DIALOGUES[ambushType];
    if (typeConfig) {
      let msg = typeConfig.开场[Math.floor(Math.random() * typeConfig.开场.length)];
      msg = msg.replace('{tianjiaoName}', tianjiaoName);
      msg = msg.replace('{dialogue}', openingDialogue);
      
      if (ambushType === '带人围攻') {
        const minionCount = this.getRandomInt(
          this.AMBUSH_CONFIG.MINIONS_COUNT.带人围攻.min,
          this.AMBUSH_CONFIG.MINIONS_COUNT.带人围攻.max
        );
        msg = msg.replace('{count}', minionCount);
      } else if (ambushType === '大阵围困') {
        const formationName = this.FORMATION_NAMES[Math.floor(Math.random() * this.FORMATION_NAMES.length)];
        msg = msg.replace('{formationName}', formationName);
        msg = msg.replace('{count}', this.getRandomInt(
          this.AMBUSH_CONFIG.MINIONS_COUNT.大阵围困.min,
          this.AMBUSH_CONFIG.MINIONS_COUNT.大阵围困.max
        ));
      }
      
      ambushMsg.push(msg);
    }
    
    // 构建战斗属性
    const A_player = {
      ...player,
      名号: player.名号,
      攻击: player.攻击,
      防御: player.防御,
      当前血量: player.当前血量,
      血量上限: player.血量上限,
      暴击率: player.暴击率,
      暴击伤害: player.暴击伤害,
      灵根: player.灵根,
      法球倍率: player.灵根?.法球倍率 || 1,
      学习的功法: player.学习的功法 || [],
    };
    
    // 构建偷袭者属性
    const multiplier = this.AMBUSH_CONFIG.ATTACKER_MULTIPLIER[ambushType];
    let B_player = buildRelativeTianjiaoCombatant(A_player, tianjiaoData, multiplier);
    B_player.名号 = `${tianjiaoName}(偷袭)`;
    
    // 大阵加成
    if (ambushType === '大阵围困') {
      const bonus = this.AMBUSH_CONFIG.FORMATION_BONUS;
      B_player.攻击 = parseInt(B_player.攻击 * bonus.攻击加成);
      B_player.防御 = parseInt(B_player.防御 * bonus.防御加成);
      B_player.当前血量 = parseInt(B_player.当前血量 * bonus.血量加成);
      B_player.血量上限 = parseInt(B_player.血量上限 * bonus.血量加成);
      B_player.名号 = `${tianjiaoName}(大阵加持)`;
    }
    
    // 发送战斗开始消息
    if (typeConfig && typeConfig.战斗开始) {
      let battleMsg = typeConfig.战斗开始[Math.floor(Math.random() * typeConfig.战斗开始.length)];
      battleMsg = battleMsg.replace('{tianjiaoName}', tianjiaoName);
      battleMsg = battleMsg.replace('{count}', ambushType === '带人围攻' ? '数' : '');
      ambushMsg.push(battleMsg);
    }
    
    // 发送偷袭消息 - 文本
    await this.sendTextMessage(usr_qq, ambushMsg.join('\n'), group_id);
    
    const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player);
    if (blackEmperorFormation.consumed) await Write_player(usr_qq, player);
    // 进行强制战斗
    const result = await zd_battle(A_player, B_player);
    let msg = result.msg;
    if (blackEmperorFormation.message && Array.isArray(msg)) msg.unshift(blackEmperorFormation.message);
    
    // 发送战斗过程 - 转换为图片
    if (msg.length <= 20) {
      // 如果战斗过程较短，直接转图片
      await this.sendBattleImage(usr_qq, msg, group_id);
    } else {
      // 如果战斗过程较长，截取一部分转图片
      let msgg = JSON.parse(JSON.stringify(msg));
      msgg.length = 20;
      await this.sendBattleImage(usr_qq, msgg, group_id);
      // 添加提示文本
      await this.sendTextMessage(usr_qq, '战斗过长，仅展示部分内容...', group_id);
    }
    
    let isWin = false;
    if (result.winner === 'A') {
      isWin = true;
    } else if (result.winner === 'B') {
      isWin = false;
    } else {
      await this.sendTextMessage(usr_qq, '战斗过程出错，无法判断胜负...', group_id);
      return false;
    }
    
    if (isWin) {
      const offer = buildTianjiaoSurrenderOffer(tianjiaoData, data);
      const token = randomUUID();
      const pending = {
        type: 'surrender',
        stage: 'offered',
        token,
        playerId: String(usr_qq),
        tianjiaoName,
        tianjiaoLife: Math.max(0, Number(tianjiaoData.轮回世数) || 0),
        offer,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
        groupId: group_id || '',
      };
      await redis.set(`tianjiao:pending:${usr_qq}`, JSON.stringify(pending), { EX: 10 * 60 });
      await redis.set(`tianjiao:fear:${tianjiaoName}:${usr_qq}`, (Date.now() + 6 * 60 * 60 * 1000).toString());
      await this.addHatred(tianjiaoName, usr_qq, '挑战成功');
      const normal = offer.normal.map(item => `${item.name}x${item.amount}`).join('、') || '无';
      const extras = offer.extras.map(item => `${item.name}x${item.amount}（稀有度${item.rarity}）`).join('、');
      const surrenderText = [
        '【天骄败退·献宝求饶】',
        `${tianjiaoName}被你逼至绝境，主动交出随身战利品与五份赔礼。`,
        `本命战利品：${normal}`,
        `赔礼：${extras}`,
        '发送 #接受求饶 收下全部赔礼并放其离去；发送 #拒绝求饶 继续追杀。',
        '本次选择保留10分钟。',
      ].join('\n');
      await replyOfficialMessage(this.createSimulatedEvent(usr_qq, group_id), {
        markdown: [
          '# 天骄败退·献宝求饶',
          '',
          `${tianjiaoName}被逼至绝境，主动交出随身战利品与五份赔礼。`,
          '',
          `**本命战利品：** ${normal}`,
          `**赔礼：** ${extras}`,
          '',
          '> 本次选择保留10分钟。',
        ].join('\n'),
        text: surrenderText,
        buttons: [[
          { text: '接受求饶', command: '#接受求饶', permission: false },
          { text: '拒绝求饶', command: '#拒绝求饶', permission: false },
        ]],
      });
      
      return true; // 继续传送
      
    } else {
      B_player.当前血量 = Math.max(1, Number(result.B_hp) || Number(B_player.当前血量) || 1);
      const protection = await this.resolvePlayerProtector(
        player,
        B_player,
        tianjiaoName,
        usr_qq,
        group_id,
      );
      if (protection.saved) return true;
      await this.handleAmbushDefeat(e, player, tianjiaoName, tianjiaoData, ambushType, group_id);
      return 'defeat'; // 标记为战败死亡
    }
  }

  async canTianjiaoAmbush(tianjiaoName) {
    const now = Date.now();
    const [statusRaw, reviveRaw, escapeRaw] = await Promise.all([
      redis.get(`tianjiao:status:${tianjiaoName}`),
      redis.get(`tianjiao:global:revive:${tianjiaoName}`),
      redis.get(`tianjiao:global:escape:${tianjiaoName}`),
    ]);
    if (Math.max(Number(reviveRaw) || 0, Number(escapeRaw) || 0) > now) return false;
    let status = null;
    try {
      status = statusRaw ? JSON.parse(statusRaw) : null;
    } catch {
      return false;
    }
    return isTianjiaoAvailable(status, getRealmEventWorldYear(), now);
  }

  buildPlayerProtectorCombatant(protector) {
    return {
      ...protector,
      名号: protector.名号,
      攻击: protector.攻击,
      防御: protector.防御,
      当前血量: protector.当前血量,
      血量上限: protector.血量上限 || protector.当前血量,
      暴击率: protector.暴击率,
      暴击伤害: protector.暴击伤害,
      灵根: protector.灵根,
      法球倍率: protector.灵根?.法球倍率 || protector.法球倍率 || 1,
      学习的功法: protector.学习的功法 || [],
    };
  }

  async resolvePlayerProtector(player, woundedTianjiao, tianjiaoName, usr_qq, group_id) {
    const remainingLine = `${tianjiaoName}带着上一战仅剩的${bigNumberTransform(woundedTianjiao.当前血量)}点气血迎战。`;
    const npcProtection = await tryNpcProtectorIntervention(
      player,
      woundedTianjiao,
      zd_battle,
      Date.now(),
      { forceBattle: true },
    );
    if (npcProtection.triggered) {
      await Write_player(usr_qq, player);
      await this.sendBattleImage(usr_qq, [
        '【护道人接战】',
        remainingLine,
        ...npcProtection.messages,
      ], group_id);
      if (npcProtection.won) return { triggered: true, saved: true, protectorWon: true };
      return this.resolveProtectorDefeat(player, tianjiaoName, usr_qq, group_id);
    }

    if (player.大帝庇护 !== 1 || !player.庇护人) {
      return { triggered: false, saved: false };
    }

    try {
      const protector = await Read_player(player.庇护人);
      const protectorBattle = await zd_battle(
        this.buildPlayerProtectorCombatant(protector),
        woundedTianjiao,
        { battleType: 'tianjiao_ambush_protector' },
      );
      await this.sendBattleImage(usr_qq, [
        '【护道人跨界而来】',
        `${protector.名号}循着护道印记降临：伤我所护之人，便由我来接这一战。`,
        remainingLine,
        ...(Array.isArray(protectorBattle.msg) ? protectorBattle.msg : [protectorBattle.msg]),
      ], group_id);
      if (protectorBattle.winner === 'A') {
        player.当前血量 = Math.max(1, Math.floor((Number(player.血量上限) || 1) * 0.3));
        await Write_player(usr_qq, player);
        await redis.set(`tianjiao:fear:${tianjiaoName}:${usr_qq}`, (Date.now() + 6 * 60 * 60 * 1000).toString());
        await this.sendTextMessage(usr_qq, `${protector.名号}击退了${tianjiaoName}，替你稳住伤势后送你继续上路。`, group_id);
        return { triggered: true, saved: true, protectorWon: true };
      }
      return this.resolveProtectorDefeat(player, tianjiaoName, usr_qq, group_id);
    } catch (error) {
      console.error(`[天骄堵截] 玩家护道人出战失败 player=${usr_qq}`, error);
      return { triggered: true, saved: false, error };
    }
  }

  async resolveProtectorDefeat(player, tianjiaoName, usr_qq, group_id) {
    const escape = rollIndependentTianjiaoEscape();
    if (!escape.escaped) {
      await this.sendTextMessage(usr_qq, [
        `【护道人败北】${tianjiaoName}击败护道人后并未退走。`,
        `独立逃跑概率：${(escape.chance * 100).toFixed(1)}%，掷骰：${(escape.roll * 100).toFixed(1)}%。`,
      ].join('\n'), group_id);
      return { triggered: true, saved: false, protectorWon: false, escape };
    }

    player.当前血量 = Math.max(1, Math.floor((Number(player.血量上限) || 1) * 0.1));
    await Write_player(usr_qq, player);
    await redis.set(`tianjiao:fear:${tianjiaoName}:${usr_qq}`, (Date.now() + 6 * 60 * 60 * 1000).toString());
    await this.sendTextMessage(usr_qq, [
      `【险死还生】${tianjiaoName}击败护道人后察觉远方气机逼近，最终选择遁走。`,
      `独立逃跑概率：${(escape.chance * 100).toFixed(1)}%，掷骰：${(escape.roll * 100).toFixed(1)}%。`,
      `你保住性命，当前血量：${bigNumberTransform(player.当前血量)}。`,
    ].join('\n'), group_id);
    return { triggered: true, saved: true, protectorWon: false, escape };
  }
  
  async addHatred(tianjiaoName, usr_qq, reason) {
    const hatredKey = this.getHatredKey(tianjiaoName, usr_qq);
    const currentHatred = parseInt(await redis.get(hatredKey) || '0');
    const gain = this.HATRED_CONFIG.GAIN[reason] || 5;
    const newHatred = currentHatred + gain;
    
    await redis.set(hatredKey, newHatred.toString());

    
    return { old: currentHatred, new: newHatred, gain };
  }
  
  // 获取个人仇恨值
  async getPlayerHatred(tianjiaoName, usr_qq) {
    const hatredKey = `tianjiao:hatred:${tianjiaoName}:${usr_qq}`;
    return parseInt(await redis.get(hatredKey) || '0');
  }

  /**
   * 获取天骄随机对话
   * @param {Object} tianjiaoData - 天骄数据对象（来自 data.weimiantianjiao_list）
   * @param {string} type - 对话类型（出场、胜利嘲讽、败北狠话、保命成功、护道人出场、护道人败北、低血量警告）
   * @returns {string} 随机对话内容，如果没有找到则返回空字符串
   */
  getRandomDialogue(tianjiaoData, type) {
    // 检查天骄数据是否存在
    if (!tianjiaoData) {
      console.warn('【getRandomDialogue】天骄数据为空');
      return "";
    }
    
    // 检查对话类型是否存在
    if (!type) {
      console.warn('【getRandomDialogue】对话类型为空');
      return "";
    }
    
    // 获取对应对话数组
    const dialogues = tianjiaoData[type];
    
    // 如果没有找到对应类型的对话，或者不是数组，或者数组为空
    if (!dialogues || !Array.isArray(dialogues) || dialogues.length === 0) {
      console.warn(`【getRandomDialogue】天骄 ${tianjiaoData.名号 || '未知'} 没有 ${type} 类型的对话`);
      return "";
    }
    
    // 随机选择一条对话
    const randomIndex = Math.floor(Math.random() * dialogues.length);
    return dialogues[randomIndex];
  }

  /**
   * 发送战斗图片消息（仅用于战斗过程）
   * @param {string} user_id - 用户QQ
   * @param {Array|string} messages - 消息数组或字符串
   * @param {string} group_id - 群号（可选）
   */
  async sendBattleImage(user_id, messages, group_id) {
    try {
      // 确保messages是数组
      const messageArray = Array.isArray(messages) ? messages : [messages];
      
      // 检查消息是否为空
      if (messageArray.length === 0) {
        console.warn('发送战斗图片：消息数组为空');
        return false;
      }
      
      // 创建模拟事件对象
      const simulatedEvent = this.createSimulatedEvent(user_id, group_id);
      
      // 生成战斗图片
      let img;
      try {
        img = await get_fight_img(simulatedEvent, messageArray);
      } catch (imgError) {
        console.error('生成战斗图片失败:', imgError);
        throw new Error('图片生成失败');
      }
      
      // 检查生成的图片是否有效
      if (!img) {
        console.error('生成的图片为空');
        throw new Error('生成的图片为空');
      }
      
      // 发送图片
      if (group_id) {
        // 群聊中发送，带@
        await this.pushInfo(group_id, true, [
          segment.at(user_id),
          img
        ]);
      } else {
        // 私聊中发送
        await this.pushInfo(user_id, false, img);
      }
      
      console.log(`成功发送战斗图片给 ${user_id}${group_id ? ` (群${group_id})` : ''}`);
      return true;
      
    } catch (err) {
      console.error('发送战斗图片失败:', err);
      
      // 备用方案：尝试发送文本消息
      try {
        const messageText = Array.isArray(messages) ? messages.join('\n') : messages;
        
        if (group_id) {
          await this.pushInfo(group_id, true, [
            segment.at(user_id),
            '【战斗过程】\n' + messageText
          ]);
        } else {
          await this.pushInfo(user_id, false, '【战斗过程】\n' + messageText);
        }
        console.log('已发送备用文本消息');
        return true;
      } catch (fallbackErr) {
        console.error('发送备用文本消息也失败:', fallbackErr);
        return false;
      }
    }
  }

  /**
   * 发送文本消息
   * @param {string} user_id - 用户QQ
   * @param {string} message - 消息内容
   * @param {string} group_id - 群号（可选）
   */
  async sendTextMessage(user_id, message, group_id) {
    try {
      if (group_id) {
        // 群聊中发送，带@
        await this.pushInfo(group_id, true, [
          segment.at(user_id),
          message
        ]);
      } else {
        // 私聊中发送
        await this.pushInfo(user_id, false, message);
      }
      return true;
    } catch (err) {
      console.error('发送文本消息失败:', err);
      return false;
    }
  }

  /**
   * 创建模拟事件对象
   * 这个对象需要满足get_fight_img函数的要求
   */
  createSimulatedEvent(user_id, group_id) {
    return {
      reply: async (content) => {
        // 这个函数可能不会被get_fight_img调用，但为了兼容性保留
        if (group_id) {
          await Bot.pickGroup(group_id).sendMsg([
            segment.at(user_id),
            ...(Array.isArray(content) ? content : [content]),
          ]);
        } else {
          await common.relpyPrivate(user_id, content);
        }
      },
      // 添加get_fight_img可能需要的基本属性
      user_id: user_id,
      group_id: group_id,
      isGroup: !!group_id,
      isPrivate: !group_id,
      // 添加一些默认属性，避免undefined错误
      sender: {
        user_id: Bot.uin,
        nickname: Bot.nickname || '系统'
      },
      bot: Bot
    };
  }

  /**
   * 获取随机整数
   */
  getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async executeForbiddenSupremeInterception(task, player) {
    const supreme = selectForbiddenSupreme();
    const boss = buildForbiddenSupreme(supreme, {
      cultivation: data.Level_list,
      physique: data.LevelMax_list,
      secret: data.Levelmijing_list,
      ancient: data.xiangujinshi_list,
    });
    const travelMethod = task.used_token ? '位面传送阵' : '肉身横渡';
    const speed = boss.速度 + boss.mijinglevel_id * 50 + boss.xiangulevel_id * 50;

    await this.sendTextMessage(task.player_qq, [
      '【禁区至尊·横断星路】',
      `你连续以${travelMethod}撕开遮天位面壁垒，第三次波动终于惊醒了${supreme.name}。`,
      '一只帝道大手压塌虚空，封死所有退路。',
      `灵根：${supreme.root.name}`,
      `功法：${supreme.techniques.join('、')}`,
      `装备：${boss.装备描述}；帝兵：${boss.帝兵描述}`,
      `境界：练气${boss.level_id}级、炼体${boss.Physique_id}级、秘境大帝、仙古1级`,
      `极道全属性：750亿；速度：100 + 16×50 + 1×50 = ${speed}`,
      `${supreme.name}：“让本皇看看，你从诸天带回了什么。”`,
    ].join('\n'), task.group_id);

    const A_player = { ...player };
    const B_player = { ...boss };
    const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player);
    if (blackEmperorFormation.consumed) await Write_player(task.player_qq, player);
    const result = await zd_battle(A_player, B_player);
    if (blackEmperorFormation.message && Array.isArray(result?.msg)) result.msg.unshift(blackEmperorFormation.message);
    const battleLog = Array.isArray(result?.msg) ? result.msg.slice(0, 20) : [];
    if (battleLog.length > 0) await this.sendBattleImage(task.player_qq, battleLog, task.group_id);

    if (result?.winner === 'A') {
      player.禁区至尊注视 = 0;
      player.击退禁区至尊次数 = Math.max(0, Math.floor(Number(player.击退禁区至尊次数) || 0)) + 1;
      await this.sendTextMessage(task.player_qq,
        `你正面击退了${supreme.name}，帝道目光暂时从你的星路上移开。`, task.group_id);
      return 'victory';
    }
    if (result?.winner !== 'B') {
      await this.sendTextMessage(task.player_qq,
        '至尊交锋被崩塌的位面通道强行中止，本次不作战败结算。', task.group_id);
      return 'error';
    }

    const najie = await Read_najie(task.player_qq);
    const loss = applyForbiddenSupremePlunder(player, najie);
    player.power_place = resolveStoredLocation(task.from_location, task.from_name);
    await Write_najie(task.player_qq, najie);
    await Write_player(task.player_qq, player);
    try {
      await player_efficiency(task.player_qq);
    } catch (error) {
      console.error(`[禁区至尊] 重算玩家修炼效率失败 player=${task.player_qq}`, error?.message);
    }
    await redis.del(`xiuxian:player:${task.player_qq}:action`);

    const itemSummary = loss.takenItems.slice(0, 8)
      .map(item => `- ${item.category}【${item.name}】×${item.quantity}`);
    if (loss.takenItems.length > itemSummary.length) {
      itemSummary.push(`- 另有${loss.takenItems.length - itemSummary.length}类物品`);
    }
    await this.sendTextMessage(task.player_qq, [
      `【${supreme.name}·搜魂夺宝】`,
      '你被帝威镇压，元神记忆被强行翻阅，毕生所学尽数从识海中抹去。',
      `已废除功法：${loss.learnedTechniques.length}门`,
      `元神仅余一成，当前血量降至1，并被打回${task.from_name || '原位面'}。`,
      `纳戒的可掠夺物被夺走${loss.takenQuantity}件，仅留下${loss.remainingQuantity}件低价值物品；仙宠、口粮与食材未动：`,
      ...(itemSummary.length > 0 ? itemSummary : ['- 纳戒中没有可供至尊取走的物品']),
    ].join('\n'), task.group_id);
    return 'defeat';
  }

  async checkTravelTasks() {
    // 获取所有传送任务
    const keys = await redis.keys('xiuxian:travel_task:*');
    
    for (const key of keys) {
      const taskData = await redis.get(key);
      if (!taskData) continue;
      
      const task = JSON.parse(taskData);
      const now = Date.now();
      
      // 检查是否已完成
      if (now >= task.end_time) {
        await this.completeTravelTask(task);
        await redis.del(key); // 删除任务
      }
    }
  }
  
  async completeTravelTask(task) {
    const { player_qq, to_location, to_name, travel_msg, player_name, group_id, used_token, token_tier, accident } = task;
    // 防御：老任务/异常数据可能未携带 travel_msg，归一化为数组避免展开时崩溃
    const travelMsgArr = Array.isArray(travel_msg) ? travel_msg : [];

    try {
      const player = await Read_player(player_qq);
      
      // 创建模拟事件对象
      const simulatedEvent = this.createSimulatedEvent(player_qq, group_id);

      let supremeAttention = { warning: '', count: 0, intercept: false };
      if (!task.travel_protected) {
        // ===== 遮天位面·禁区至尊注视 =====
        supremeAttention = registerForbiddenSupremeAttention(player, task);
        if (supremeAttention.intercept) {
          const supremeResult = await this.executeForbiddenSupremeInterception(task, player);
          if (supremeResult === 'defeat') return false;
        }

        // ===== 检查偷袭事件 =====
        const hatredTianjiaoList = await this.getHatredTianjiaoList(player_qq);
        if (hatredTianjiaoList.length > 0) {
          const randomTianjiao = hatredTianjiaoList[Math.floor(Math.random() * hatredTianjiaoList.length)];
          const ambushResult = await this.checkAmbush(simulatedEvent, player, randomTianjiao, group_id);
          if (ambushResult === 'defeat') return false;
        }
      }
      
      // ===== 正常传送完成 =====
      player.power_place = resolveStoredLocation(to_location, to_name);
      const unfetteredJourneyProgress = recordUnfetteredJourney(player);
      await Write_player(player_qq, player);
      
      await redis.del(`xiuxian:player:${player_qq}:action`);
      await redis.del(`xiuxian:travel_task:${player_qq}`);
      
      // 传送阵抵达：虚空乱流事故处理（仅令牌任务）
      let accidentMsgs = [];
      if (used_token && accident) {
        // 小额资源损失（不删档），并附乱流文案
        const lossXiuwei = 5e6;
        const lossQixue = 5e6;
        player.修为 = Math.max(0, (Number(player.修为) || 0) - lossXiuwei);
        player.血气 = Math.max(0, (Number(player.血气) || 0) - lossQixue);
        await Write_player(player_qq, player);
        accidentMsgs = [
          ``,
          `【虚空乱流·星路偏移】`,
          `传送途中骤起虚空乱流，星空古路剧烈震荡！`,
          `你竭力稳住阵纹，却被乱流卷走部分修为与血气：`,
          `- 修为 -${lossXiuwei}`,
          `- 血气 -${lossQixue}`,
          `乱流散去，你狼狈地跌入${to_name}边缘……`
        ];
      }
      
      const tierLabel = used_token ? (token_tier === 'high' ? '高级传送阵' : '传送阵') : '肉身穿梭';
      const arriveMsg = [
        `【位面穿梭·完成】`,
        `${player_name}已借助${tierLabel}成功抵达${to_name}!`,
        ...travelMsgArr,
        ...(supremeAttention.exempt
          ? ['', `【禁区至尊·${supremeAttention.exemptLevel === 'emperor' ? '大帝极忌' : '至尊重忌'}】`, supremeAttention.warning]
          : supremeAttention.warning
            ? ['', `【禁区至尊注视 ${supremeAttention.count}/${FORBIDDEN_SUPREME_ATTENTION_THRESHOLD}】`, supremeAttention.warning]
            : []),
        ...accidentMsgs,
        ...(unfetteredJourneyProgress ? [`【天地无拘】横渡位面：${unfetteredJourneyProgress}/3`] : []),
        `位面穿梭完成，你现已身处${to_name}`
      ].join('\n');
      
      // 发送到达消息 - 文本
      await this.sendTextMessage(player_qq, arriveMsg, group_id);
      
      return true;
      
    } catch (err) {
      console.error(`完成传送任务出错（玩家QQ：${player_qq}）：`, err);
      
      try {
        const errorMsg = `【穿梭失败】\n位面穿梭过程中发生意外，请联系管理员！`;
        await this.sendTextMessage(player_qq, errorMsg, group_id);
      } catch (secondaryErr) {
        console.error('发送错误消息失败：', secondaryErr);
      }
      
      return false;
    }
  }

  /**
   * 获取与玩家有仇恨的天骄列表
   */
  async getHatredTianjiaoList(usr_qq) {
    const hatredList = [];
    
    for (const tianjiao of data.weimiantianjiao_list) {
      if (!await this.canTianjiaoAmbush(tianjiao.名号)) continue;
      const hatred = await this.getPlayerHatred(tianjiao.名号, usr_qq);
      if (hatred > 0) {
        // 仇恨值越高，被选中的权重越大
        const weight = Math.ceil(hatred / 10);
        for (let i = 0; i < weight; i++) {
          hatredList.push(tianjiao.名号);
        }
      }
    }
    
    return hatredList;
  }
  
  async getPlayerHatred(tianjiaoName, usr_qq) {
    const hatredKey = this.getHatredKey(tianjiaoName, usr_qq);
    return parseInt(await redis.get(hatredKey) || '0');
  }
  
  getHatredKey(tianjiaoName, usr_qq) {
    return `tianjiao:hatred:${tianjiaoName}:${usr_qq}`;
  }

  /**
   * 推送消息，群消息推送群，或者推送私人
   * @param id
   * @param is_group
   * @return  falses {Promise<void>}
   */
  async pushInfo(id, is_group, msg) {
    if (is_group) {
      await Bot.pickGroup(id)
        .sendMsg(msg)
        .catch(err => {
          Bot.logger.mark(err);
        });
    } else {
      await common.relpyPrivate(id, msg);
    }
  }
}

// 辅助函数：获取属性名称
function getPropertyName(prop) {
  const names = {
    'level_id': '练气',
    'Physique_id': '炼体',
    'mijinglevel_id': '人体秘境体系',
    'xiangulevel_id': '仙古今世法'
  };
  return names[prop] || prop;
}

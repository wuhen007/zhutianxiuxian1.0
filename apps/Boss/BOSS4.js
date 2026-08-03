import fs from 'fs';
import { plugin, verc, data, config } from '../../api/api.js';
import {
  Add_灵石,
  Add_源石,
  Add_修为,
  Add_血气,
  ForwardMsg,
  Add_HP,
  Read_player,
  Add_najie_thing,
  Write_player,
  bigNumberTransform,
  Harm,
  zd_battle,
} from '../../model/xiuxian.js';
import { recordWenXianTrial } from '../../model/wenxianling.js';
import {
  buildTianjiaoBattleStats,
  isIndependentTianjiao,
} from '../../model/tianjiaoGrowth.js';

let WorldBOSSBattleCD = []; //CD
let WorldBOSSBattleLock = 0; //BOSS战斗锁，防止打架频率过高造成奖励多发
let WorldBOSSBattleUnLockTimer = 0; //防止战斗锁因意外锁死

export class BOSS4 extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_修仙_BOSS4',
      dsc: '天骄讨伐模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#开启天骄$',
          fnc: 'CreateWorldBoss2',
        },
        {
          reg: '^#关闭天骄$',
          fnc: 'DeleteWorldBoss2',
        },
        {
          reg: '^#天骄状态(?:\\s+(.*))?$',
          fnc: 'LookUpWorldBossStatus2',
        },
        {
          reg: '^#天骄贡献榜(?:\\s+(.*))?$',
          fnc: 'ShowDamageList2',
        },
        {
          reg: '^#讨伐天骄\\s+(.*)$',
          fnc: 'WorldBossBattle2',
        },
        {
          reg: '^#天骄列表$',
          fnc: 'ShowTianjiaoList',
        },
        {
          reg: '^#天骄仇恨(?:\\s+(.*))?$',
          fnc: 'ShowHatredStatus',
        },
      ],
    });

    this.task = []; // 无定时任务，防止loader报undefined.cron
    this.userCooldownMs = 30 * 60 * 1000; // 30分钟个人冷却
    this.tianjiaoRefreshMs = 18 * 60 * 60 * 1000; // 18小时天骄刷新时间
    this.escapeRefreshMs = 6 * 60 * 60 * 1000; // 逃脱后6小时复活

    // 地点映射表
    this.LOCATION_MAP = {
      '凡间': 0,
      '仙界': 1,
      '下界八域': 1.5,
      '遮天位面': 2,
      '九天十地': 2.5,
      '界海': 3,
      '时间长河': 4,
      '永恒未知之地': 5,
      '仙域': 6
    };

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

    // 通用对话库（备用）
    this.GENERAL_DIALOGUES = {
      出场: [
        "天骄在此，谁敢一战？",
        "今日便让你见识真正的实力！",
        "蝼蚁之辈，也敢挑战天骄？"
      ],
      胜利嘲讽: [
        "就这点实力？回去再练几百年吧。",
        "天骄之威，岂是你能抗衡？",
        "这一战，不过是我热身而已。"
      ],
      败北狠话: [
        "该死...你竟能伤我...",
        "此仇不报，誓不为人！",
        "你等着，我会回来的！"
      ],
      保命成功: [
        "今日之辱，来日必报！",
        "保命手段发动，下次见面必取你性命！",
        "该死...这次算你运气好！"
      ],
      护道人出场: [
        "何人敢伤我派天骄？",
        "小辈，你可知得罪我们的下场？",
        "天骄乃我派未来，尔敢！"
      ],
      护道人败北: [
        "该死...这小辈竟有如此实力...",
        "我们...不会放过你的...",
        "天骄快走...保留传承..."
      ],
      低血量警告: [
        "不好...伤势过重...",
        "该死...不能再战了...",
        "必须撤退...否则伤及本源..."
      ]
    };
  }


  // ======================
  // 保命法宝（辰东文笔）
  // ======================
  getEscapeTreasure(name) {
    const map = {
      "猪咪岁岁": "替身猪偶·九命不灭",
      "金翅小鹏王": "鲲鹏翅·血影遁",
      "华云飞": "一念花开·替身笺",
      "王腾": "乱古帝符·虚空替命",
      "霸王浑战": "霸血焚天·紫血替身",
      "十冠王天子": "世界树枝·替劫叶",
      "鹤无双": "不朽王座·虚影遁",
      "逍遥子": "鲲鹏极速·扶摇遁"
    };
    return map[name] || "神秘保命法宝";
  }

  // ======================
  // 护道人名字映射
  // ======================
  getProtectorName(name) {
    const map = {
      "猪咪岁岁": "猪家护道老祖·猪惊天",
      "王家老祖·猪百万": "王家太上护道·猪霸天",
      "金翅小鹏王": "鹏族大圣护道·鹏万里",
      "金翅大鹏长老·鹏九霄": "鹏族不朽护道·鹏啸天",
      "华云飞": "云飞护道仙·云中君",
      "星峰太上长老·墨云": "星峰护道尊者·墨无极",
      "王腾": "王家护道圣·王天帝",
      "北原王家长老·王靖海": "北原王家护道·王苍穹",
      "霸王浑战": "霸体护道人·浑天圣祖",
      "霸体祖星长老·苍战": "祖星护道尊者·苍天霸皇",
      "十冠王天子": "十冠王护道圣·世无双",
      "仙古遗地长老·十方": "仙古护道长老·十方禁忌",
      "鹤无双": "鹤族护道仙·鹤凌云",
      "异域不朽客·鹤青冥": "异域护道不朽·鹤破虚",
      "逍遥子": "故友·无涯散仙"
    };
    return map[name] || `${name}的护道人`;
  }
  // ========== 仇恨值系统核心方法 ==========

  getHatredKey(tianjiaoName, usr_qq) {
    return `tianjiao:hatred:${tianjiaoName}:${usr_qq}`;
  }

  getTianjiaoHatredStatusKey(tianjiaoName) {
    return `tianjiao:hatred_status:${tianjiaoName}`;
  }

  async addHatred(tianjiaoName, usr_qq, reason) {
    const hatredKey = this.getHatredKey(tianjiaoName, usr_qq);
    const currentHatred = parseInt(await redis.get(hatredKey) || '0');
    const gain = this.HATRED_CONFIG.GAIN[reason] || 5;
    const newHatred = currentHatred + gain;
    
    await redis.set(hatredKey, newHatred.toString());
    await this.updateTianjiaoHatredStatus(tianjiaoName);
    
    return { old: currentHatred, new: newHatred, gain };
  }

  getHatredLevel(hatredValue) {
    for (const [level, range] of Object.entries(this.HATRED_CONFIG.LEVELS)) {
      if (hatredValue >= range.min && hatredValue <= range.max) {
        return level;
      }
    }
    return '陌生';
  }

  async updateTianjiaoHatredStatus(tianjiaoName) {
    const statusKey = this.getTianjiaoHatredStatusKey(tianjiaoName);
    const pattern = `tianjiao:hatred:${tianjiaoName}:*`;
    const keys = await redis.keys(pattern);
    
    let totalHatred = 0;
    let maxHatred = 0;
    let enemyCount = keys.length;
    
    for (const key of keys) {
      const value = parseInt(await redis.get(key) || '0');
      totalHatred += value;
      if (value > maxHatred) maxHatred = value;
    }
    
    const status = { totalHatred, maxHatred, enemyCount, updateTime: Date.now() };
    await redis.set(statusKey, JSON.stringify(status));
    return status;
  }

  async getTianjiaoHatredStatus(tianjiaoName) {
    const statusKey = this.getTianjiaoHatredStatusKey(tianjiaoName);
    const status = await redis.get(statusKey);
    return status ? JSON.parse(status) : { totalHatred: 0, maxHatred: 0, enemyCount: 0 };
  }

  async getPlayerHatred(tianjiaoName, usr_qq) {
    const hatredKey = this.getHatredKey(tianjiaoName, usr_qq);
    return parseInt(await redis.get(hatredKey) || '0');
  }

  // ========== 对话系统 ==========

  getRandomDialogue(tianjiaoData, type) {
    const dialogues = tianjiaoData[type] || this.GENERAL_DIALOGUES[type];
    if (!dialogues || dialogues.length === 0) return "";
    return dialogues[Math.floor(Math.random() * dialogues.length)];
  }

  // ========== 护道人系统 ==========

  // ======================
  // 护道人生成（按你给的数值）
  // ======================
  generateProtector(tianjiaoName, playerLevel) {
    const base = {
      无境: {
        exp: 100000000000,
        level_id: 64,
        基础攻击: 10000000000,
        基础防御: 10000000000,
        基础血量: 20000000000,
        基础暴击: 3.0
      },
      无上之境: {
        exp: 30000000000,
        level_id: 63,
        基础攻击: 1600000000,
        基础防御: 16500000000,
        基础血量: 33500000000,
        基础暴击: 1.0
      },
      "仙台秘境——大圣": {
        level_id: 14,
        基础攻击: 1500000000,
        基础防御: 150000000,
        基础血量: 150000000
      }
    };

    const multiplier = 50 + Math.floor(Math.random() * 51);

    return {
      名号: this.getProtectorName(tianjiaoName),
      境界: "护道者",
      level_id: base.无境.level_id,
      exp: base.无境.exp * multiplier,
      攻击: Math.floor(
        (base.无境.基础攻击 +
          base.无上之境.基础攻击 +
          base["仙台秘境——大圣"].基础攻击) *
        multiplier
      ),
      防御: Math.floor(
        (base.无境.基础防御 +
          base.无上之境.基础防御 +
          base["仙台秘境——大圣"].基础防御) *
        multiplier
      ),
      血量上限: Math.floor(
        (base.无境.基础血量 +
          base.无上之境.基础血量 +
          base["仙台秘境——大圣"].基础血量) *
        multiplier
      ),
      当前血量: Math.floor(
        (base.无境.基础血量 +
          base.无上之境.基础血量 +
          base["仙台秘境——大圣"].基础血量) *
        multiplier
      ),
      暴击率: base.无境.基础暴击,
      暴击伤害: 3.5,
      灵根: { name: "护道灵根", 法球倍率: 1.8 },
      学习的功法: ["护道圣诀", "天罡战气", "不灭金身"]
    };
  }

  // ======================
  // 护身法宝触发机制
  // ======================
  async triggerProtectiveTalisman(e, tianjiaoName, tianjiaoData, status) {
    // 基础触发概率 30%
    const baseChance = 0.30;
    // 血量越低，触发概率越高（线性增加，最高到80%）
    const hpFactor = Math.max(0, (50 - status.currentHP) / 50);
    const triggerChance = Math.min(0.80, baseChance + hpFactor * 0.50);

    if (Math.random() > triggerChance) {
      return false; // 未触发护身法宝
    }

    const treasureName = this.getEscapeTreasure(tianjiaoName);
    const treasureDialogues = [
      `${tianjiaoName}身上爆发出一道璀璨光华！`,
      `${treasureName}显化，护住${tianjiaoName}周身！`,
      "护身法宝自动激发，天骄安然无恙！",
      "危急关头，神秘力量涌现..."
    ];

    const randomDialogue = treasureDialogues[Math.floor(Math.random() * treasureDialogues.length)];
    
    // 恢复血量（恢复10%-20%，不超过100%）
    const recoverPercent = 10 + Math.floor(Math.random() * 11);
    const newHP = Math.min(100, status.currentHP + recoverPercent);
    status.currentHP = newHP;

    let messages = [
      `【护身法宝触发】`,
      randomDialogue,
      `${treasureName}生效！`,
      `天骄血量恢复${recoverPercent}%，当前血量：${status.currentHP}%`,
      `（法宝已耗尽，本次战斗不会再触发）`
    ];

    await ForwardMsg(e, messages);
    return true;
  }

  // ======================
  // 护道人触发机制（基于血量的线性概率）
  // ======================
  async triggerProtector(e, tianjiaoName, tianjiaoData, player, currentHP) {
    // 只有血量低于30%时才可能触发护道人
    if (currentHP > 30) {
      return { triggered: false, protectorWon: false };
    }

    // 线性概率计算：血量越低，触发概率越高
    // 30%血量时 10%概率，0%血量时 80%概率
    const triggerChance = 0.10 + (30 - currentHP) / 30 * 0.70;

    if (Math.random() > triggerChance) {
      return { triggered: false, protectorWon: false };
    }

    let messages = [
      `【护道人触发】`,
      `${tianjiaoName}大喝一声：「护道人何在！」`
    ];

    // 护道人出场
    const protectorDialogue = this.getRandomDialogue(tianjiaoData, '护道人出场');
    messages.push(protectorDialogue);

    const protector = this.generateProtector(tianjiaoName, player.level_id);
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

    const B_player = {
      名号: protector.名号,
      攻击: protector.攻击,
      防御: protector.防御,
      当前血量: protector.当前血量,
      血量上限: protector.血量上限,
      暴击率: protector.暴击率,
      暴击伤害: protector.暴击伤害,
      灵根: protector.灵根?.name || "普通灵根",
      法球倍率: protector.灵根?.法球倍率 || 1,
      学习的功法: protector.学习的功法 || [],
    };

    const result = await zd_battle(A_player, B_player, { battleType: 'tianjiao' });
    let battleMsg = result.msg;

    if (battleMsg.length <= 20) {
      messages = messages.concat(battleMsg);
    } else {
      messages.push("战斗过程过长，仅展示关键结果...");
      messages.push(battleMsg[0]);
      messages.push("...");
      messages.push(battleMsg[battleMsg.length - 1]);
    }

    if (result.winner === 'A') {
      // 玩家击败护道人
      const protectorDefeatDialogue = this.getRandomDialogue(tianjiaoData, '护道人败北');
      messages.push("", `【护道人败北】`, protectorDefeatDialogue);
      
      await this.addHatred(tianjiaoName, e.user_id.toString(), '护道失败');
      
      messages.push("", `【天骄重伤遁走】`, `${tianjiaoName}的护道人被你击败，天骄趁乱重伤逃走！`);
      
      await Add_灵石(e.user_id.toString(), 8000000);
      await Add_源石(e.user_id.toString(), 3000000);
      messages.push("额外奖励：灵石800万、源石300万");
      
      await ForwardMsg(e, messages);
      return { triggered: true, protectorWon: false, escaped: true };
      
    } else if (result.winner === 'B') {
      // 护道人击败玩家
      messages.push("", `【你被护道人击败】`, `护道人实力深不可测，你不得不撤退...`);
      
      player.当前血量 = Math.floor(player.当前血量 * 0.1);
      await Write_player(e.user_id.toString(), player);
      
      await this.addHatred(tianjiaoName, e.user_id.toString(), '挑战失败');
      
      await ForwardMsg(e, messages);
      return { triggered: true, protectorWon: true, escaped: false };
    }

    await ForwardMsg(e, messages);
    return { triggered: false, protectorWon: false };
  }

  // ========== 显示方法 ==========

  async ShowTianjiaoList(e) {
    if (!verc({ e })) return false;

    let msg = ['****位面天骄列表****'];
    for (const tianjiao of data.weimiantianjiao_list) {
      msg.push(`名号: ${tianjiao.名号}`);
      msg.push(`境界: ${tianjiao.境界}`);
      msg.push(`位面: ${this.getLocationName(tianjiao.位面)}`);
      msg.push('-------------------');
    }

    await ForwardMsg(e, msg);
    return false;
  }

  getLocationName(locationId) {
    for (const [name, id] of Object.entries(this.LOCATION_MAP)) {
      if (id === locationId) return name;
    }
    return `未知位面(${locationId})`;
  }

  async CreateWorldBoss2(e) {
    if (!e || e.isMaster) {
      await InitWorldBoss(e);
      return false;
    }
  }

  async DeleteWorldBoss2(e) {
    if (!verc({ e })) return false;
    if (e.isMaster) {
      if (await BossIsAlive()) {
        await redis.del('Xiuxian:WorldBossStatus2');
        await redis.del('zhutianxiuxian1.0Record2');

        for (const tianjiao of data.weimiantianjiao_list) {
          await redis.del(`tianjiao:global:revive:${tianjiao.名号}`);
          await redis.del(`tianjiao:damage:${tianjiao.名号}`);
          await redis.del(`tianjiao:hatred_status:${tianjiao.名号}`);
          
          const hatredPattern = `tianjiao:hatred:${tianjiao.名号}:*`;
          const hatredKeys = await redis.keys(hatredPattern);
          for (const key of hatredKeys) {
            await redis.del(key);
          }
        }

        e.reply('天骄挑战关闭！所有仇恨值已清零。');
      } else e.reply('天骄未开启');
    } else return false;
  }

  async LookUpWorldBossStatus2(e) {
    if (!verc({ e })) return false;

    const match = e.msg.match(/^#天骄状态(?:\s+(.*))?$/);
    const tianjiaoName = match[1] ? match[1].trim() : '';

    if (!tianjiaoName) {
      let allStatus = ['****所有天骄状态****'];

      for (const tianjiao of data.weimiantianjiao_list) {
        const statusKey = `tianjiao:status:${tianjiao.名号}`;
        let status = await redis.get(statusKey);
        status = JSON.parse(status || '{}');

        const globalReviveKey = `tianjiao:global:revive:${tianjiao.名号}`;
        const globalReviveTime = await redis.get(globalReviveKey);

        if (!status.currentHP || status.currentHP <= 0) {
          status.currentHP = 100;
          status.isAlive = true;
          await redis.set(statusKey, JSON.stringify(status));
        }

        if (globalReviveTime && Date.now() < parseInt(globalReviveTime)) {
          const remainingMs = parseInt(globalReviveTime) - Date.now();
          const hours = Math.floor(remainingMs / (60 * 60 * 1000));
          const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

          allStatus.push(
            `名号: ${tianjiao.名号}`,
            `境界: ${tianjiao.境界}`,
            `位面: ${this.getLocationName(tianjiao.位面)}`,
            `状态: 已击败，${hours}小时${minutes}分钟后刷新`,
            '-------------------'
          );
        } else {
          allStatus.push(
            `名号: ${tianjiao.名号}`,
            `境界: ${tianjiao.境界}`,
            `位面: ${this.getLocationName(tianjiao.位面)}`,
            `血量: ${status.currentHP}%`,
            `状态: ${status.isAlive ? '存活' : '已击败'}`,
            '-------------------'
          );
        }
      }

      e.reply(allStatus.join('\n'));
      return false;
    }

    const tianjiaoData = data.weimiantianjiao_list.find(tj => tj.名号 === tianjiaoName);
    if (!tianjiaoData) {
      e.reply(`未找到名为「${tianjiaoName}」的天骄`);
      return false;
    }

    const globalReviveKey = `tianjiao:global:revive:${tianjiaoName}`;
    const globalReviveTime = await redis.get(globalReviveKey);

    if (globalReviveTime && Date.now() < parseInt(globalReviveTime)) {
      const remainingMs = parseInt(globalReviveTime) - Date.now();
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      e.reply(`${tianjiaoName}已被击败，将在${hours}小时${minutes}分钟后刷新`);
      return false;
    }

    const statusKey = `tianjiao:status:${tianjiaoName}`;
    let status = await redis.get(statusKey);
    status = JSON.parse(status || '{}');

    if (!status.currentHP || status.currentHP <= 0) {
      status.currentHP = 100;
      status.isAlive = true;
      await redis.set(statusKey, JSON.stringify(status));
    }

    let ReplyMsg = [
      `----${tianjiaoName}状态----`,
      `境界: ${tianjiaoData.境界}`,
      `位面: ${this.getLocationName(tianjiaoData.位面)}`,
      `当前血量: ${status.currentHP}%`,
      `状态: ${status.isAlive ? '存活' : '已击败'}`
    ];

    e.reply(ReplyMsg.join('\n'));
    return false;
  }

  async ShowHatredStatus(e) {
    if (!verc({ e })) return false;
    
    const usr_qq = e.user_id.toString();
    const match = e.msg.match(/^#天骄仇恨(?:\s+(.*))?$/);
    const tianjiaoName = match[1] ? match[1].trim() : '';
    
    if (!tianjiaoName) {
      let msg = ['****你的天骄仇恨值****'];
      let hasHatred = false;
      
      for (const tianjiao of data.weimiantianjiao_list) {
        const hatred = await this.getPlayerHatred(tianjiao.名号, usr_qq);
        if (hatred > 0) {
          hasHatred = true;
          const level = this.getHatredLevel(hatred);
          const config = this.HATRED_CONFIG.LEVELS[level];
          msg.push(`【${tianjiao.名号}】`);
          msg.push(`  仇恨值: ${hatred}`);
          msg.push(`  关系: ${level}`);
          msg.push(`  保命触发率: ${Math.floor(config.escapeChance * 100)}%`);
          msg.push(`  护道人召唤率: ${Math.floor(config.protectorChance * 100)}%`);
          msg.push('-------------------');
        }
      }
      
      if (!hasHatred) {
        msg.push("你目前与所有天骄都是陌生关系");
        msg.push("多挑战天骄，建立'深厚'的友谊吧！");
      }
      
      e.reply(msg.join('\n'));
      return false;
    }
    
    const tianjiaoData = data.weimiantianjiao_list.find(tj => tj.名号 === tianjiaoName);
    if (!tianjiaoData) {
      e.reply(`未找到名为「${tianjiaoName}」的天骄`);
      return false;
    }
    
    const hatred = await this.getPlayerHatred(tianjiaoName, usr_qq);
    const level = this.getHatredLevel(hatred);
    const config = this.HATRED_CONFIG.LEVELS[level];
    const globalStatus = await this.getTianjiaoHatredStatus(tianjiaoName);
    
    let msg = [
      `****${tianjiaoName}仇恨状态****`,
      `你的仇恨值: ${hatred}`,
      `关系等级: ${level}`,
      `保命手段触发率: ${Math.floor(config.escapeChance * 100)}%`,
      `护道人召唤率: ${Math.floor(config.protectorChance * 100)}%`,
      "",
      `【全局统计】`,
      `总仇恨值: ${globalStatus.totalHatred}`,
      `最高仇恨: ${globalStatus.maxHatred}`,
      `敌对玩家: ${globalStatus.enemyCount}人`
    ];
    
    if (level === '死敌' || level === '不死不休') {
      msg.push("");
      msg.push("⚠️ 警告：该天骄对你恨之入骨，每次击败都可能触发强力保命手段！");
    }
    
    e.reply(msg.join('\n'));
    return false;
  }

  // ========== 贡献榜方法 ==========

  /**
   * 安全地将任意值转为BigInt
   * 处理科学计数法(1e+20)、小数(1.5)、空值等BigInt不接受的输入
   */
  safeBigInt(value) {
    if (value === null || value === undefined) return 0n;
    if (typeof value === 'bigint') return value;
    // 转为字符串，处理科学计数法
    let str = String(value).trim();
    if (str === '' || str === 'NaN' || str === 'Infinity' || str === '-Infinity') return 0n;
    try {
      // 先尝试直接转
      return BigInt(str);
    } catch {
      // 可能包含小数点或科学计数法，先转数字再截断
      try {
        const num = Number(str);
        if (!isFinite(num)) return 0n;
        // 截断小数部分，然后转BigInt
        return BigInt(Math.floor(num));
      } catch {
        return 0n;
      }
    }
  }

  async updateDamageContribution(damageKey, usr_qq, damageDealt) {
    try {
      const currentBig = this.safeBigInt(await redis.hGet(damageKey, usr_qq));
      const incrementBig = this.safeBigInt(damageDealt);
      const newValue = (currentBig + incrementBig).toString();
      await redis.hSet(damageKey, usr_qq, newValue);
      return true;
    } catch (error) {
      console.error('更新贡献值失败:', error);
      await redis.hSet(damageKey, usr_qq, String(damageDealt));
      return false;
    }
  }

  async getDamageRankings(damageKey) {
    const damageData = await redis.hGetAll(damageKey);
    const contributors = [];

    for (const [qq, damageStr] of Object.entries(damageData)) {
      const damageBig = this.safeBigInt(damageStr);
      if (damageBig === 0n) {
        console.warn(`无效的贡献值: QQ=${qq}, damage=${damageStr}`);
        await redis.hSet(damageKey, qq, '0');
      }
      contributors.push({
        qq,
        damage: damageBig,
        damageStr: damageStr
      });
    }

    contributors.sort((a, b) => {
      if (a.damage > b.damage) return -1;
      if (a.damage < b.damage) return 1;
      return 0;
    });

    return contributors;
  }

  bigNumberTransformBigInt(value) {
    try {
      const num = this.safeBigInt(value);
      if (num < 10000n) {
        return num.toString();
      }

      const units = [
        '', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟',
        '涧', '正', '载', '极', '恒河沙', '阿僧祇', '那由他',
        '不可思议', '无量', '大数'
      ];

      let result = num;
      let unitIndex = 0;

      while (result >= 10000n && unitIndex < units.length - 1) {
        result = result / 10000n;
        unitIndex++;
      }

      const divisor = 10000n ** BigInt(unitIndex);
      const remainder = num % divisor;

      if (remainder === 0n) {
        return result.toString() + units[unitIndex];
      } else {
        const decimalValue = (remainder * 100n) / divisor;
        const decimalStr = decimalValue.toString().padStart(2, '0');
        let formattedDecimal = decimalStr;
        while (formattedDecimal.length > 0 && formattedDecimal.endsWith('0')) {
          formattedDecimal = formattedDecimal.slice(0, -1);
        }

        if (formattedDecimal.length === 0) {
          return result.toString() + units[unitIndex];
        } else {
          return `${result.toString()}.${formattedDecimal}${units[unitIndex]}`;
        }
      }
    } catch (error) {
      console.error('大数字转换错误:', error, value);
      return typeof value === 'string' ? value : value.toString();
    }
  }

  // ========== 核心战斗方法 ==========

  async WorldBossBattle2(e) {
    if (!verc({ e })) return false;
    if (e.isPrivate) return false;

    // 战斗锁检查
    if (WorldBOSSBattleLock === 1) {
      e.reply('天骄战斗正在进行中，请稍后再试！');
      return false;
    }

    const match = e.msg.match(/^#讨伐天骄\s+(.*)$/);
    if (!match || !match[1]) {
      e.reply('请指定要讨伐的天骄名称，例如: #讨伐天骄 猪咪岁岁');
      return false;
    }

    const tianjiaoName = match[1].trim();
    const usr_qq = e.user_id.toString();
      const player = await Read_player(usr_qq);
      const panguRewardMultiplier = player.当前先天至宝 === '盘古幡' && player.先天权柄?.盘古开天待用 ? 2 : 1;
      const zhuxianTianjiao = player.当前先天至宝 === '诛仙四剑';
    
    const tianjiaoData = data.weimiantianjiao_list.find(tj => tj.名号 === tianjiaoName);
    if (!tianjiaoData) {
      e.reply(`未找到名为「${tianjiaoName}」的天骄`);
      return false;
    }

    // 检查全局复活CD
    const globalReviveKey = `tianjiao:global:revive:${tianjiaoName}`;
    const globalReviveTime = await redis.get(globalReviveKey);

    if (globalReviveTime && Date.now() < parseInt(globalReviveTime)) {
      const remainingMs = parseInt(globalReviveTime) - Date.now();
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      e.reply(`${tianjiaoName}已被击败，将在${hours}小时${minutes}分钟后刷新`);
      return false;
    }

    // 检查CD时间
    const now_Time = Date.now();
    const last_time = await redis.get(`xiuxian:player:${usr_qq}:BOSSCD`);
    const userCooldownMs = this.userCooldownMs;

    if (player.id != "2283096140" && last_time && now_Time < parseInt(last_time) + userCooldownMs) {
      const remainingMs = parseInt(last_time) + userCooldownMs - now_Time;
      const minutes = Math.floor(remainingMs / (60 * 1000));
      const seconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
      e.reply(`讨伐天骄冷却中，剩余时间: ${minutes}分${seconds}秒`);
      return false;
    }

    // 设置战斗锁
    WorldBOSSBattleLock = 1;
    SetWorldBOSSBattleUnLockTimer(e);

    try {
      // 创建玩家角色
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

      // 检查玩家状态
      if (A_player.level_id < 32) {
        e.reply('你的练气境界至少达到法身境才能讨伐天骄');
        WorldBOSSBattleLock = 0;
        return false;
      }

      if (A_player.power_place !== tianjiaoData.位面) {
        e.reply(`你当前不在「${this.getLocationName(tianjiaoData.位面)}」，无法挑战${tianjiaoName}`);
        WorldBOSSBattleLock = 0;
        return false;
      }

      if (A_player.当前血量 <= A_player.血量上限 * 0.1) {
        e.reply('还是先疗伤吧，别急着参战了');
        WorldBOSSBattleLock = 0;
        return false;
      }

      // 获取天骄状态
      const statusKey = `tianjiao:status:${tianjiaoName}`;
      let status = await redis.get(statusKey);
      status = JSON.parse(status || '{}');

      if (!status.currentHP || status.currentHP <= 0) {
        status.currentHP = 100;
        status.isAlive = true;
      }

      // 获取仇恨值
      const currentHatred = await this.getPlayerHatred(tianjiaoName, usr_qq);
      const hatredLevel = this.getHatredLevel(currentHatred);

      // 根据玩家境界调整天骄属性
      let attributeMultiplier = 10;
      let openingDialogue = "";
      const usesIndependentStats = isIndependentTianjiao(tianjiaoData);

      if (tianjiaoData.名号 === "猪咪岁岁") {
        if (A_player.level_id > 41) {
          e.reply(`成仙者不得以大欺小，请让后辈弟子来讨伐！`);
          WorldBOSSBattleLock = 0;
          return false;
        } else {
          attributeMultiplier = 5;
          openingDialogue = "雪豹闭嘴！";
        }
      } else if (usesIndependentStats) {
        attributeMultiplier = 1;
        if (A_player.mijinglevel_id < 9 && A_player.xiangulevel_id < 7) {
          player.道伤 += 1;
          player.当前血量 = 0;
          await Write_player(usr_qq, player);
          e.reply(`你连仙台境/尊者境都未达到，${tianjiaoName}根本不想浪费时间在你这只蝼蚁身上，直接将你一巴掌拍死！(道伤+1)`);
          WorldBOSSBattleLock = 0;
          return false;
        }
        openingDialogue = `${tianjiaoName}携自身当前境界与你一战！`;
      } else {
        if (A_player.mijinglevel_id >= 12 || A_player.xiangulevel_id >= 10) {
          attributeMultiplier = 5;
          openingDialogue = `检测到玩家已成就圣人/天神境，${tianjiaoName}将不再压制境界，以全部实力应战！`;
        } else if (A_player.mijinglevel_id < 9 && A_player.xiangulevel_id < 7) {
          player.道伤 += 1;
          player.当前血量 = 0;
          await Write_player(usr_qq, player);
          e.reply(`你连仙台境/尊者境都未达到，${tianjiaoName}根本不想浪费时间在你这只蝼蚁身上，直接将你一巴掌拍死！(道伤+1)`);
          WorldBOSSBattleLock = 0;
          return false;
        } else {
          attributeMultiplier = 3;
          openingDialogue = `${tianjiaoName}压制境界与你一战！`;
        }
      }

      // 发送开场白
      const randomOpening = this.getRandomDialogue(tianjiaoData, '出场');
      if (randomOpening) {
        e.reply(`${tianjiaoName}:「${randomOpening}」`);
      } else if (openingDialogue) {
        e.reply(openingDialogue);
      }

      // 遮天与九天十地天骄使用自身境界、装备和积累，不再镜像挑战者属性。
      const independentStats = usesIndependentStats
        ? buildTianjiaoBattleStats(tianjiaoData, {
            cultivationLevels: data.Level_list,
            physiqueLevels: data.LevelMax_list,
            secretLevels: data.Levelmijing_list,
            ancientLevels: data.xiangujinshi_list,
            equipmentList: data.equipment_list,
            imperialWeaponList: data.dibing_list,
          })
        : null;
      const B_player = independentStats ? {
        ...independentStats,
        名号: `${tianjiaoName}(当前状态)`,
        速度: (tianjiaoData.速度 ?? 100) + (tianjiaoData.mijinglevel_id ?? 0) * 50 + (tianjiaoData.xiangulevel_id ?? 0) * 50,
        灵根: tianjiaoData.灵根?.name || "普通灵根",
        法球倍率: tianjiaoData.灵根?.法球倍率 || 1,
      } : {
        名号: `${tianjiaoName}${attributeMultiplier > 1 ? '(全力状态)' : '(压制境界)'}`,
        攻击: parseInt(A_player.攻击 * attributeMultiplier),
        防御: parseInt(A_player.防御 * attributeMultiplier),
        当前血量: parseInt(A_player.血量上限 * attributeMultiplier),
        血量上限: parseInt(A_player.血量上限 * attributeMultiplier),
        暴击率: tianjiaoData.暴击率,
        暴击伤害: tianjiaoData.暴击伤害,
        速度: (tianjiaoData.速度 ?? 100) + (tianjiaoData.mijinglevel_id ?? 0) * 50 + (tianjiaoData.xiangulevel_id ?? 0) * 50,
        闪避率: tianjiaoData.闪避率,
        首次闪避: tianjiaoData.首次闪避,
        闪避增攻: tianjiaoData.闪避增攻,
        闪避增攻上限: tianjiaoData.闪避增攻上限,
        灵根: tianjiaoData.灵根?.name || "普通灵根",
        法球倍率: tianjiaoData.灵根?.法球倍率 || 1,
        学习的功法: tianjiaoData.学习的功法 || [],
      };

      // 进行战斗
      const result = await zd_battle(A_player, B_player, { battleType: 'tianjiao' });
      let msg = result.msg;
      
      if (msg.length <= 30) {
        await ForwardMsg(e, msg);
      } else {
        let msgg = JSON.parse(JSON.stringify(msg));
        msgg.length = 30;
        await ForwardMsg(e, msgg);
        e.reply('战斗过长，仅展示部分内容');
      }

      const damageKey = `tianjiao:damage:${tianjiaoName}`;
      let isWin = false;
      let tianjiaoDefeated = false;
      
      if (result.winner === 'A') {
        const damageDealt = Math.floor(A_player.血量上限 * attributeMultiplier);
        await this.updateDamageContribution(damageKey, usr_qq, damageDealt);
        isWin = true;
      } else if (result.winner === 'B') {
        const damageDealt = Math.floor(A_player.血量上限 * attributeMultiplier * 0.1);
        await this.updateDamageContribution(damageKey, usr_qq, damageDealt);
        isWin = false;
      } else {
        e.reply(`战斗过程出错，无法判断胜负`);
        WorldBOSSBattleLock = 0;
        return false;
      }

      // ========== 仇恨值与对话系统 ==========

      if (isWin) {
        // 玩家胜利
        if (panguRewardMultiplier > 1) {
          player.先天权柄 ||= { 冷却: {} };
          delete player.先天权柄.盘古开天待用;
          player.先天权柄.盘古洗劫翻倍待用 = true;
          await Write_player(usr_qq, player);
        }
        
        // 先检查是否触发护身法宝（不扣血）
        const talismanTriggered = await this.triggerProtectiveTalisman(e, tianjiaoName, tianjiaoData, status);
        
        if (!talismanTriggered) {
          // 护身法宝未触发，正常扣血
          status.currentHP = Math.max(0, status.currentHP - (zhuxianTianjiao ? 40 : 20));
        }
        
        const hatredResult = await this.addHatred(tianjiaoName, usr_qq, '挑战成功');
        if (zhuxianTianjiao) {
          hatredResult.new = Math.max(0, hatredResult.new - 50);
          await redis.set(this.getHatredKey(tianjiaoName, usr_qq), hatredResult.new.toString());
          await redis.set(`tianjiao:fear:${tianjiaoName}:${usr_qq}`, (Date.now() + 8 * 60 * 60 * 1000).toString());
          await this.updateTianjiaoHatredStatus(tianjiaoName);
        }
        const newLevel = this.getHatredLevel(hatredResult.new);

        // 发送败北狠话
        const defeatDialogue = this.getRandomDialogue(tianjiaoData, '败北狠话');
        if (defeatDialogue) {
          await e.reply(`${tianjiaoName}:「${defeatDialogue}」`);
        }

        let winMsg = [
          `恭喜你战胜${tianjiaoName}！`,
          talismanTriggered 
            ? `护身法宝生效，天骄血量未减少，当前剩余${status.currentHP}%`
            : `天骄血量减少${zhuxianTianjiao ? 40 : 20}%，当前剩余${status.currentHP}%`,
          `仇恨值+${hatredResult.gain}（当前：${hatredResult.new}，关系：${newLevel}）`
        ];
        await e.reply(winMsg.join('\n'));

        // 检查天骄是否被彻底击败
        if (status.currentHP <= 0) {
          // 先检查护道人触发（基于血量的线性概率）
          const protectorResult = await this.triggerProtector(e, tianjiaoName, tianjiaoData, player, status.currentHP);
          
          if (protectorResult.triggered) {
            if (protectorResult.escaped) {
              // 天骄被护道人救走逃脱
              status.isAlive = false;
              const shortReviveTime = Date.now() + this.escapeRefreshMs;
              await redis.set(globalReviveKey, shortReviveTime.toString());
              
              await redis.set(statusKey, JSON.stringify(status));
              await redis.set(`xiuxian:player:${usr_qq}:BOSSCD`, now_Time.toString());
              WorldBOSSBattleLock = 0;
              return true;
            } else if (protectorResult.protectorWon) {
              // 被护道人击败，结束战斗
              await redis.set(`xiuxian:player:${usr_qq}:BOSSCD`, now_Time.toString());
              WorldBOSSBattleLock = 0;
              return true;
            }
          }
          
          // 无护道人触发或护道人被击败，天骄彻底死亡
          status.isAlive = false;
          tianjiaoDefeated = true;
          const reviveTime = Date.now() + this.tianjiaoRefreshMs;
          await redis.set(globalReviveKey, reviveTime.toString());
          
          await e.reply(`${tianjiaoName}已被彻底击败，18小时后将重新出现！`);

          // 发放掉落物
          if (tianjiaoData.掉落物) {
            for (const item of tianjiaoData.掉落物) {
              if (Math.random() < item.概率) {
                const amount = item.数量 * panguRewardMultiplier;
                await Add_najie_thing(usr_qq, item.name, item.class, amount);
                await e.reply(`获得掉落：${item.name} x${amount}`);
              }
            }
          }

          // 特殊掉落
          if (tianjiaoData.特殊掉落) {
            for (const special of tianjiaoData.特殊掉落) {
              if (Math.random() < special.概率) {
                const amount = special.数量 * panguRewardMultiplier;
                await Add_najie_thing(usr_qq, special.name, special.class, amount);
                let dropMsg = `特殊掉落：${special.name} x${amount}`;
                if (special.效果) {
                  dropMsg += `（${special.效果}）`;
                }
                await e.reply(dropMsg);
              }
            }
          }

          // 发放贡献榜奖励
          await this.distributeContributionRewards(e, tianjiaoName, tianjiaoData, usr_qq);
        }

        // 计算奖励
        let reward = 10000;
        let zuizhong = (A_player.mijinglevel_id + A_player.xiangulevel_id) * A_player.level_id * A_player.Physique_id * reward * panguRewardMultiplier;

        // 发放胜利奖励
        await Add_灵石(usr_qq, 15000000 * panguRewardMultiplier);
        await Add_源石(usr_qq, 5000000 * panguRewardMultiplier);
        await Add_修为(usr_qq, zuizhong);
        await Add_血气(usr_qq, zuizhong);

        let rewardMsg = [
          `成功战胜${tianjiaoName}！获得奖励：`,
          `灵石：${1500 * panguRewardMultiplier}万`,
          `源石：${500 * panguRewardMultiplier}万`,
          `修为：${bigNumberTransform(zuizhong)}`,
          `血气：${bigNumberTransform(zuizhong)}`
        ];

        // 斗字秘学习功法功能
        if (player.学习的功法.includes("斗字秘") && Math.random() < 0.01) {
          player.学习的功法 = player.学习的功法 || [];
          const playerLearnedSkills = player.学习的功法;
          const learnableSkills = tianjiaoData.学习的功法.filter(skill => !playerLearnedSkills.includes(skill));

          if (learnableSkills.length > 0) {
            const randomIndex = Math.floor(Math.random() * learnableSkills.length);
            const newSkill = learnableSkills[randomIndex];
            player.学习的功法.push(newSkill);
            await Write_player(usr_qq, player);

            let skillDescription = "";
            if (newSkill.includes("拳") || newSkill.includes("掌")) {
              skillDescription = `拳掌交锋间，斗字秘运转到极致，演化出${newSkill}的无上奥义！`;
            } else if (newSkill.includes("剑") || newSkill.includes("刀")) {
              skillDescription = `兵器碰撞的刹那，斗字秘捕捉到${newSkill}的剑意道痕，将其烙印在识海！`;
            } else if (newSkill.includes("秘") || newSkill.includes("诀")) {
              skillDescription = `斗字秘推演万法，在生死搏杀中洞悉${newSkill}的运转轨迹！`;
            } else if (newSkill.includes("经") || newSkill.includes("法")) {
              skillDescription = `古经轰鸣，道音阵阵，斗字秘逆推${newSkill}的完整传承！`;
            } else {
              skillDescription = `斗战圣法演化到极致，在战斗中领悟${newSkill}的真谛！`;
            }

            const douziMiMsg = [
              "【斗字秘】触发",
              "九秘之【斗字秘】运转，斗战圣法演化诸天万法！",
              "",
              skillDescription,
              "",
              `领悟功法：${newSkill}`,
              "【斗字秘】不愧为战斗第一圣法，可演化一切攻伐之术！",
              "在生死搏杀中，你的战斗经验与道行同步精进！"
            ].join('\n');

            rewardMsg.push(douziMiMsg);
          } else {
            const douziMiMsg = [
              "【斗字秘】触发",
              "九秘之【斗字秘】运转，斗战圣法演化诸天万法！",
              "",
              `在与${tianjiaoName}的激战中，【斗字秘】推演其所有功法，`,
              `然你已尽数掌握${tianjiaoName}的传承，无法再演化新的功法。`,
              "",
              "【斗字秘】虽未演化出新法，但战斗经验与道行依旧精进！",
              "万法归宗，殊途同归，你的战斗技艺已达化境！"
            ].join('\n');

            rewardMsg.push(douziMiMsg);
          }
        }

        await e.reply(rewardMsg.join('\n'));

        if (tianjiaoDefeated) {
          const latestPlayer = await Read_player(usr_qq);
          const passTrial = recordWenXianTrial(latestPlayer, 'tianjiao');
          if (passTrial.changed) await Write_player(usr_qq, latestPlayer);
        }

      } else {
        // 玩家失败
        status.currentHP = Math.max(0, status.currentHP - (zhuxianTianjiao ? 2 : 1));
        const hatredResult = await this.addHatred(tianjiaoName, usr_qq, '挑战失败');
        const newLevel = this.getHatredLevel(hatredResult.new);

        // 发送胜利嘲讽
        const tauntDialogue = this.getRandomDialogue(tianjiaoData, '胜利嘲讽');
        if (tauntDialogue) {
          await e.reply(`${tianjiaoName}:「${tauntDialogue}」`);
        }

        await e.reply([
          `你未能战胜${tianjiaoName}，天骄血量减少${zhuxianTianjiao ? 2 : 1}%，当前剩余${status.currentHP}%`,
          `仇恨值+${hatredResult.gain}（当前：${hatredResult.new}，关系：${newLevel}）`
        ].join('\n'));

        // 计算失败奖励
        let reward = 10;
        let zuizhong = (A_player.mijinglevel_id + A_player.xiangulevel_id) * A_player.level_id * A_player.Physique_id * reward;

        await Add_源石(usr_qq, 1000000);
        await Add_灵石(usr_qq, 3000000);
        await Add_修为(usr_qq, zuizhong);
        await Add_血气(usr_qq, zuizhong);

        await e.reply([
          `你与${tianjiaoName}激战一番，获得奖励：`,
          `灵石：300万`,
          `源石：100万`,
          `修为：${bigNumberTransform(zuizhong)}`,
          `血气：${bigNumberTransform(zuizhong)}`
        ].join('\n'));
      }

      // 保存天骄状态
      await redis.set(statusKey, JSON.stringify(status));
      // 设置CD
      await redis.set(`xiuxian:player:${usr_qq}:BOSSCD`, now_Time.toString());

    } catch (error) {
      console.error('天骄战斗出错:', error);
      e.reply('战斗过程发生错误，请稍后再试！');
    } finally {
      // 释放战斗锁
      WorldBOSSBattleLock = 0;
    }

    return true;
  }

  // ========== 贡献榜奖励分发 ==========

  async distributeContributionRewards(e, tianjiaoName, tianjiaoData, killerQQ) {
    const damageKey = `tianjiao:damage:${tianjiaoName}`;
    const contributors = await this.getDamageRankings(damageKey);

    if (contributors.length === 0) {
      return;
    }

    const rewardMessages = [`****${tianjiaoName}贡献榜奖励****`];

    for (let i = 0; i < contributors.length; i++) {
      const contributor = contributors[i];
      let rewardCount = 1;

      if (i === 0) {
        rewardCount = 3 + Math.floor(Math.random() * 3);
      } else if (i >= 1 && i <= 4) {
        rewardCount = 2 + Math.floor(Math.random() * 3);
      } else if (i <= 9) {
        rewardCount = 1 + Math.floor(Math.random() * 3);
      }

      const rewards = await this.giveRandomItems(contributor.qq, tianjiaoData, rewardCount);
      const playerName = await this.getPlayerName(contributor.qq);
      const damageDisplay = this.bigNumberTransformBigInt(contributor.damageStr || contributor.damage.toString());
      let passTrialCompleted = false;
      try {
        const contributorPlayer = await Read_player(contributor.qq);
        const passTrial = recordWenXianTrial(contributorPlayer, 'tianjiao');
        if (passTrial.changed) {
          await Write_player(contributor.qq, contributorPlayer);
          passTrialCompleted = true;
        }
      } catch (error) {
        console.warn(`记录玩家${contributor.qq}问仙试炼失败:`, error);
      }
      
      rewardMessages.push(`${i + 1}. ${playerName} - 伤害: ${damageDisplay}`);

      if (rewards.length > 0) {
        rewardMessages.push(`   获得 ${rewards.length} 样物品: ${rewards.join('、')}`);
      } else {
        rewardMessages.push(`   获得基础奖励`);
      }
      if (passTrialCompleted) rewardMessages.push('   问仙试炼：位面天骄印记已完成');
    }

    if (Math.random() < 0.5) {
      const extraRewardCount = 1 + Math.floor(Math.random() * 3);
      const extraRewards = await this.giveRandomItems(killerQQ, tianjiaoData, extraRewardCount);

      if (extraRewards.length > 0) {
        const killerName = await this.getPlayerName(killerQQ);
        rewardMessages.push(`击杀者${killerName}获得额外奖励: ${extraRewards.join('、')}`);
      }
    }

    if (rewardMessages.length > 1) {
      await ForwardMsg(e, rewardMessages);
    }

    await redis.del(damageKey);
  }

  async giveRandomItems(qq, tianjiaoData, count) {
    const rewards = [];
    
    // 先检查玩家是否存在
    try {
      await Read_player(qq);
    } catch (error) {
      console.warn(`玩家${qq}不存在，跳过物品发放`);
      return rewards;
    }
    
    if (!tianjiaoData.掉落物 || tianjiaoData.掉落物.length === 0) {
      return rewards;
    }

    const baseItems = tianjiaoData.掉落物.filter(item => item.概率 >= 0.5);
    const rareItems = tianjiaoData.掉落物.filter(item => item.概率 < 0.5);
    let hasDropped = false;

    for (let i = 0; i < count; i++) {
      let itemPool = Math.random() < 0.7 ? rareItems : baseItems;
      if (itemPool.length === 0) {
        itemPool = baseItems;
      }

      const randomIndex = Math.floor(Math.random() * itemPool.length);
      const item = itemPool[randomIndex];
      const actualProbability = item.概率 >= 0.5 ? 1.0 : item.概率;

      try {
        if (Math.random() < actualProbability) {
          await Add_najie_thing(qq, item.name, item.class, item.数量);
          rewards.push(`${item.name}x${item.数量}`);
          hasDropped = true;
        }
      } catch (itemError) {
        console.warn(`发放物品失败: ${item.name}`, itemError);
      }
    }

    if (!hasDropped && baseItems.length > 0) {
      const fallbackIndex = Math.floor(Math.random() * baseItems.length);
      const fallbackItem = baseItems[fallbackIndex];
      try {
        await Add_najie_thing(qq, fallbackItem.name, fallbackItem.class, fallbackItem.数量);
        rewards.push(`${fallbackItem.name}x${fallbackItem.数量}（保底奖励）`);
      } catch (itemError) {
        console.warn(`发放保底物品失败: ${fallbackItem.name}`, itemError);
      }
    }

    return rewards;
  }

  async getPlayerName(qq) {
    try {
      const player = await Read_player(qq);
      return player.名号 || `玩家${qq}`;
    } catch (error) {
      return `玩家${qq}`;
    }
  }

  async ShowDamageList2(e) {
    if (!verc({ e })) return false;

    const match = e.msg.match(/^#天骄贡献榜(?:\s+(.*))?$/);
    const tianjiaoName = match[1] ? match[1].trim() : '';

    if (!tianjiaoName) {
      e.reply('请指定要查看的天骄名称，例如: #天骄贡献榜 猪咪岁岁');
      return false;
    }

    const tianjiaoData = data.weimiantianjiao_list.find(tj => tj.名号 === tianjiaoName);
    if (!tianjiaoData) {
      e.reply(`未找到名为「${tianjiaoName}」的天骄`);
      return false;
    }

    const globalReviveKey = `tianjiao:global:revive:${tianjiaoName}`;
    const globalReviveTime = await redis.get(globalReviveKey);

    if (globalReviveTime && Date.now() < parseInt(globalReviveTime)) {
      e.reply(`${tianjiaoName}已被击败，暂无贡献数据`);
      return false;
    }

    const statusKey = `tianjiao:status:${tianjiaoName}`;
    let status = await redis.get(statusKey);
    status = JSON.parse(status || '{}');

    if (!status.isAlive) {
      e.reply(`${tianjiaoName}已被击败，暂无贡献数据`);
      return false;
    }

    const damageKey = `tianjiao:damage:${tianjiaoName}`;
    const contributors = await this.getDamageRankings(damageKey);

    if (contributors.length === 0) {
      e.reply(`${tianjiaoName}暂无贡献数据`);
      return false;
    }

    const msg = [`****${tianjiaoName}贡献榜****`];
    for (let i = 0; i < Math.min(contributors.length, 10); i++) {
      const contributor = contributors[i];
      const playerName = await this.getPlayerName(contributor.qq);
      const damageDisplay = this.bigNumberTransformBigInt(contributor.damageStr || contributor.damage.toString());
      msg.push(`${i + 1}. ${playerName} - 伤害: ${damageDisplay}`);
    }

    if (contributors.length > 10) {
      msg.push(`...等${contributors.length}位修士`);
    }

    msg.push(`天骄当前血量: ${status.currentHP}%`);

    e.reply(msg.join('\n'));
    return false;
  }
}

// ========== 全局函数 ==========

async function InitWorldBoss(e) {
  for (const tianjiao of data.weimiantianjiao_list) {
    const statusKey = `tianjiao:status:${tianjiao.名号}`;
    const status = {
      currentHP: 100,
      isAlive: true,
    };
    await redis.set(statusKey, JSON.stringify(status));
    await redis.del(`tianjiao:global:revive:${tianjiao.名号}`);
    await redis.del(`tianjiao:damage:${tianjiao.名号}`);
    await redis.del(`tianjiao:hatred_status:${tianjiao.名号}`);
    
    const hatredPattern = `tianjiao:hatred:${tianjiao.名号}:*`;
    const hatredKeys = await redis.keys(hatredPattern);
    for (const key of hatredKeys) {
      await redis.del(key);
    }
  }

  if (e && e.reply) {
    e.reply('所有天骄已初始化，可以开始挑战！仇恨值已清零。');
  }

  return false;
}

async function BossIsAlive() {
  for (const tianjiao of data.weimiantianjiao_list) {
    const statusKey = `tianjiao:status:${tianjiao.名号}`;
    const status = await redis.get(statusKey);
    if (status) {
      const statusObj = JSON.parse(status);
      if (statusObj.isAlive) return true;
    }
  }
  return false;
}

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

async function SetWorldBOSSBattleUnLockTimer(e) {
  WorldBOSSBattleUnLockTimer = setTimeout(() => {
    if (WorldBOSSBattleLock == 1) {
      WorldBOSSBattleLock = 0;
      e.reply('检测到战斗锁卡死，已自动修复');
      return false;
    }
  }, 30000);
}

async function sleep(time) {
  return new Promise(resolve => {
    setTimeout(resolve, time);
  });
}

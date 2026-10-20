import { hasSuiyunAuthority } from '../../model/suiyunAuthority.js';
import fs from 'fs';
import path from 'path';
import { multiplySuiyunLoot } from '../../model/suiyunLoot.js';
import { getTianjiaoProgressPenalty } from '../../model/suiyunCombat.js';
import { plugin, verc, data, config } from '../../api/api.js';
import {
  Add_灵石,
  Add_源石,
  Add_修为,
  Add_血气,
  ForwardMsg,
  Add_HP,
  Read_player,
  Read_najie,
  Read_equipment,
  Write_equipment,
  Write_najie,
  Add_najie_thing,
  Write_player,
  bigNumberTransform,
  Harm,
  __PATH,
  zd_battle,
  get_fight_img,
  player_efficiency,
} from '../../model/xiuxian.js';
import { recordWenXianTaskProgress, recordWenXianTrial } from '../../model/wenxianling.js';
import { absorbTuntianSource } from '../../model/tuntianMagic.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import {
  buildTianjiaoBattleStats,
  ensureTianjiaoInitialTemplate,
  formatTianjiaoTrace,
  getKnownTianjiaoTrace,
  getTianjiaoRealmName,
  getTianjiaoTraceReach,
  isIndependentTianjiao,
  isTianjiaoHealing,
  registerTianjiaoDefeat,
  resetTianjiaoToInitialTemplate,
} from '../../model/tianjiaoGrowth.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  claimInnateTreasure,
  createInnateTreasure,
  hasEquippedInnateTreasure,
  tryPanguShatterTalisman,
} from '../../model/innateTreasure.js';
import { clearTianjiaoTreasure, rollTianjiaoTreasureRecovery } from '../../model/tianjiaoTreasure.js';
import {
  TAINTED_SLOTS,
  applyEquipmentTaint,
  applyTaintPenalty,
  createImitation,
  createImitationItem,
  isTainted,
  listPercentEquipSlots,
  listTaintedSlots,
  reimburseImitation,
  repairTaint,
} from '../../model/tianjiaoTaint.js';
import {
  applyPveStatMultiplier,
  consumeSourceStoneField,
  consumeTianjiaoScent,
  getTianjiaoScentAccess,
} from '../../model/tianjiTalismans.js';
import { getDouziMimicChance, tryLearnTianjiaoGongfa } from '../../model/gongfaProficiency.js';
import { getExtraCultivationLevelSum } from '../../model/extraCultivation.js';
import { getTianjiaoRealmTier } from '../../model/realmAuthority.js';
import { getLocationName as resolveLocationName } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { compareAndDeleteRedisJson } from '../../utils/redisJsonCas.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { replyOfficialMessage } from '../../model/officialMessage.js';
import { addRelicToBag, createFishKingRelic } from '../../model/relicSystem.js';
import {
  clearTianjiaoHatred,
  getForbiddenEscapeMethod,
  hasSoulSearchTechnique,
  isEvilCultivator,
  resolveTianjiaoSoulBacklash,
  rollIndependentTianjiaoEscape,
  rollTianjiaoDropAmount,
} from '../../model/tianjiaoHostility.js';

let WorldBOSSBattleCD = []; //CD
let WorldBOSSBattleLockToken = 0;
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
        {
          reg: '^#查看污损$',
          fnc: 'LookUpTaintStatus',
        },
        {
          reg: '^#修复污损$',
          fnc: 'RepairTaint',
        },
        {
          reg: '^#反哺炼化\\s+(.*)$',
          fnc: 'ReimburseImitation',
        },
        {
          reg: '^#接受求饶$',
          fnc: 'AcceptTianjiaoSurrender',
        },
        {
          reg: '^#拒绝求饶$',
          fnc: 'RefuseTianjiaoSurrender',
        },
        {
          reg: '^#搜魂天骄$',
          fnc: 'SoulSearchTianjiao',
        },
        {
          reg: '^#天魔炼化天骄$',
          fnc: 'RefineTianjiao',
        },
        {
          reg: '^#灭杀天骄$',
          fnc: 'ExecuteTianjiao',
        },
      ],
    });

    this.task = [
      {
        cron: '0 */15 * * * *',
        name: '天骄转世巡查',
        fnc: () => this.checkTianjiaoReincarnation(),
        log: true,
      },
    ];
    this.userCooldownMs = 90 * 60 * 1000; // 90分钟个人冷却
    this.tianjiaoRefreshMs = 18 * 60 * 60 * 1000; // 18小时天骄刷新时间
    this.escapeRefreshMs = 6 * 60 * 60 * 1000; // 逃脱后6小时复活

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
      "逍遥子": "鲲鹏极速·扶摇遁",
      "武疯子": "七死身·光阴替命",
      "谪仙": "仙古玉笛·祭灵替劫",
      "六冠王宁川": "万灵天图·替命道纹",
      "伊轻舞": "八德宝轮·广寒月影",
      "元古": "元光转生轮·皇血替身"
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
      "逍遥子": "故友·无涯散仙",
      "武疯子": "武皇一脉大能·黎九霄",
      "谪仙": "仙古遗脉护道者·曲无尘",
      "六冠王宁川": "宁族护道神·宁天图",
      "伊轻舞": "广寒宫太上长老·月寒衣",
      "元古": "元皇湖古圣·元玄"
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

  getTianjiaoEscapeKey(tianjiaoName) {
    return `tianjiao:global:escape:${tianjiaoName}`;
  }

  getTianjiaoRewardIdempotencyKey(tianjiaoName, settlementId, recipient, kind, index = '') {
    return `tianjiao:${tianjiaoName}:${settlementId}:${kind}:${recipient}:${index}`;
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
  // 护体法宝触发机制（每日3次，第二个自然日刷新）
  // ======================
  getTalismanDayKey(now = Date.now()) {
    const d = new Date(now);
    const pad = value => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async triggerProtectiveTalisman(e, tianjiaoName, tianjiaoData, status) {
    if (status.护身法宝已碎) return false;

    // 每日触发次数：跨自然日自动清零
    const todayKey = this.getTalismanDayKey();
    if (status.护体法宝触发日 !== todayKey) {
      status.护体法宝触发日 = todayKey;
      status.护体法宝当日次数 = 0;
    }
    const usedToday = Math.max(0, Math.floor(Number(status.护体法宝当日次数) || 0));
    if (usedToday >= 3) {
      await ForwardMsg(e, [
        `【护体法宝】${tianjiaoName}的护体法宝已经用尽（今日3/3），不再护体！`,
      ]);
      return false;
    }

    // 基础触发概率 10%，血量越低触发概率越高（线性增加，最高65%）
    const baseChance = 0.10;
    const hpFactor = Math.max(0, (50 - status.currentHP) / 50);
    const triggerChance = Math.min(0.65, baseChance + hpFactor * 0.55);

    if (Math.random() > triggerChance) {
      return false; // 未触发护体法宝
    }

    const treasureName = this.getEscapeTreasure(tianjiaoName);
    const treasureDialogues = [
      `${tianjiaoName}身上爆发出一道璀璨光华！`,
      `${treasureName}显化，护住${tianjiaoName}周身！`,
      "护体法宝自动激发，天骄安然无恙！",
      "危急关头，神秘力量涌现..."
    ];

    const randomDialogue = treasureDialogues[Math.floor(Math.random() * treasureDialogues.length)];

    // 恢复血量（恢复10%-20%，不超过100%）
    const recoverPercent = 10 + Math.floor(Math.random() * 11);
    const newHP = Math.min(100, status.currentHP + recoverPercent);
    status.currentHP = newHP;
    status.护体法宝当日次数 = usedToday + 1;

    const remaining = Math.max(0, 3 - (usedToday + 1));
    const usedLine = remaining > 0
      ? `今日已触发${usedToday + 1}/3次，剩余${remaining}次`
      : `今日已触发3/3次，护体法宝已经用尽`;

    let messages = [
      `【护体法宝触发】`,
      randomDialogue,
      `${treasureName}生效！`,
      `天骄血量恢复${recoverPercent}%，当前血量：${status.currentHP}%`,
      `（${usedLine}）`
    ];

    await ForwardMsg(e, messages);
    return true;
  }

  // ======================
  // 护道人触发机制（优先使用仇恨等级配置）
  // ======================
  async triggerProtector(e, tianjiaoName, tianjiaoData, player, currentHP, sourceField = null, hatredLevel = '') {
    // 只有血量低于30%时才可能触发护道人
    if (currentHP > 30) {
      return { triggered: false, protectorWon: false };
    }

    // 未配置仇恨等级时，保留原本的血量兜底概率。
    const hatredConfig = this.HATRED_CONFIG.LEVELS[hatredLevel] || {};
    const configuredChance = Number(hatredConfig.protectorChance);
    const hpChance = 0.10 + (30 - currentHP) / 30 * 0.70;
    const triggerChance = Number.isFinite(configuredChance)
      ? Math.min(0.95, Math.max(0, configuredChance))
      : hpChance;

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
    if (sourceField?.consumed) applyPveStatMultiplier(A_player, sourceField.multiplier);

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

    const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player, { sourceField });
    if (blackEmperorFormation.consumed) await Write_player(e.user_id.toString(), player);
    const result = await zd_battle(A_player, B_player, { battleType: 'tianjiao' });
    let battleMsg = result.msg;
    if (blackEmperorFormation.message && Array.isArray(battleMsg)) battleMsg.unshift(blackEmperorFormation.message);

    messages.push("━━━ 护道人之战 ━━━");
    messages = messages.concat(Array.isArray(battleMsg) ? battleMsg : [battleMsg]);

    if (result.winner === 'A') {
      // 玩家击败护道人
      const protectorDefeatDialogue = this.getRandomDialogue(tianjiaoData, '护道人败北');
      messages.push("", `【护道人败北】`, protectorDefeatDialogue);
      
      await this.addHatred(tianjiaoName, e.user_id.toString(), '护道失败');
      
      const escape = rollIndependentTianjiaoEscape();
      const escaped = escape.escaped;
      messages.push(
        "",
        escaped ? `【天骄重伤遁走】` : `【天骄逃遁失败】`,
        escaped
          ? `${tianjiaoName}的护道人被你击败，天骄趁乱重伤逃走！`
          : `${tianjiaoName}试图遁走，却被你截断退路！`,
        `独立逃跑概率：${(escape.chance * 100).toFixed(1)}%，掷骰：${(escape.roll * 100).toFixed(1)}%`
      );
      
      await Add_灵石(e.user_id.toString(), 8000000);
      await Add_源石(e.user_id.toString(), 3000000);
      messages.push("额外奖励：灵石800万、源石300万");
      
      await sendFightImages(e, messages);
      return { triggered: true, protectorWon: false, escaped };
      
    } else if (result.winner === 'B') {
      // 护道人击败玩家
      messages.push("", `【你被护道人击败】`, `护道人实力深不可测，你不得不撤退...`);
      
      player.当前血量 = Math.floor(player.当前血量 * 0.1);
      await Write_player(e.user_id.toString(), player);
      
      await this.addHatred(tianjiaoName, e.user_id.toString(), '挑战失败');
      
      await sendFightImages(e, messages);
      return { triggered: true, protectorWon: true, escaped: false };
    }

    await sendFightImages(e, messages);
    return { triggered: false, protectorWon: false };
  }

  async distributeNormalBattleDrops(e, tianjiaoName, tianjiaoData, qq, multiplier, settlementId) {
    if (!Array.isArray(tianjiaoData.掉落物)) return;
    for (let index = 0; index < tianjiaoData.掉落物.length; index++) {
      const item = tianjiaoData.掉落物[index];
      if (Math.random() >= item.概率) continue;
      const amount = rollTianjiaoDropAmount(item, multiplier);
      try {
        const idempotencyKey = this.getTianjiaoRewardIdempotencyKey(tianjiaoName, settlementId, qq, 'battle-drop', index);
        const display = await this.grantTianjiaoDrop(qq, item, amount, idempotencyKey);
        if (display) await e.reply(`获得掉落：${display}`);
      } catch (error) {
        console.warn(`[天骄掉落] ${tianjiaoName}/${qq} 发放失败:`, error);
      }
    }
  }

  async grantTianjiaoDrop(qq, item, amount, idempotencyKey) {
    amount = multiplySuiyunLoot(await Read_player(qq), item, amount, { memory: false });
    if (item.class !== '遗珍') {
      await Add_najie_thing(qq, item.name, item.class, amount, undefined, 1, { idempotencyKey });
      return `${item.name} x${amount}`;
    }

    return withPlayerMutationLock(qq, async () => {
      const equipment = await Read_equipment(qq);
      equipment._rewardClaims ||= {};
      if (equipment._rewardClaims[idempotencyKey]) return '';
      const relics = [];
      let relicState = equipment.遗珍;
      for (let index = 0; index < amount; index++) {
        const relic = createFishKingRelic({ plane: '圣墟大宇宙' });
        relicState = addRelicToBag(relicState, relic);
        relics.push(`${relic.品质}·${relic.套装}`);
      }
      equipment.遗珍 = relicState;
      equipment._rewardClaims[idempotencyKey] = { claimedAt: Date.now(), amount };
      await Write_equipment(qq, equipment);
      return `随机遗珍 x${amount}（${relics.join('、')}）`;
    });
  }

  getPendingEncounterKey(qq) {
    return `tianjiao:pending:${qq}`;
  }

  async readPendingEncounter(qq, requiredStage = '') {
    const raw = await redis.get(this.getPendingEncounterKey(qq));
    if (!raw) return null;
    try {
      const pending = JSON.parse(raw);
      if (Number(pending.expiresAt) <= Date.now()) {
        await redis.del(this.getPendingEncounterKey(qq));
        return null;
      }
      if (requiredStage && pending.stage !== requiredStage) return null;
      return pending;
    } catch {
      await redis.del(this.getPendingEncounterKey(qq));
      return null;
    }
  }

  async claimPendingEncounter(pending) {
    return Boolean(await redis.set(`tianjiao:pending:claim:${pending.token}`, '1', { NX: true, EX: 30 }));
  }

  async releasePendingEncounterClaim(pending) {
    await redis.del(`tianjiao:pending:claim:${pending.token}`);
  }

  async AcceptTianjiaoSurrender(e) {
    const qq = e.user_id.toString().replace('qg_', '');
    return withPlayerMutationLock(qq, async () => {
      const pending = await this.readPendingEncounter(qq, 'offered');
      if (!pending) return e.reply('当前没有等待处理的天骄求饶。');
      if (!await this.claimPendingEncounter(pending)) return e.reply('这次求饶正在结算，请稍候查看纳戒。');
      try {
        const recipient = await Read_player(qq);
        const rewards = (Array.isArray(pending.offer?.all) ? pending.offer.all : []).map(item => ({
          ...item,
          amount: multiplySuiyunLoot(recipient, item, Math.max(1, Math.min(20, Math.floor(Number(item.amount) || 1))), { memory: false }),
        }));
        for (let index = 0; index < rewards.length; index++) {
          const item = rewards[index];
          await Add_najie_thing(
            qq,
            item.name,
            item.class,
            item.amount,
            undefined,
            1,
            { idempotencyKey: `tianjiao-surrender:${pending.token}:${index}` },
          );
        }
        const hatredKey = this.getHatredKey(pending.tianjiaoName, qq);
        const hatred = Math.max(0, Number(await redis.get(hatredKey)) || 0);
        await redis.set(hatredKey, Math.max(0, hatred - 30).toString());
        await this.updateTianjiaoHatredStatus(pending.tianjiaoName);
        await redis.del(this.getPendingEncounterKey(qq));
        await redis.set(`tianjiao:pending:resolved:${pending.token}`, 'accepted', { EX: 24 * 3600 });
        return e.reply([
          '【止戈受降】',
          `你收下${pending.tianjiaoName}交出的赔礼，放其离去。`,
          `获得：${rewards.map(item => `${item.name}x${item.amount}`).join('、')}`,
          `双方仇恨值降低30。`,
        ].join('\n'));
      } catch (error) {
        await this.releasePendingEncounterClaim(pending);
        console.error(`[天骄求饶] 接受结算失败 player=${qq}`, error);
        return e.reply('赔礼交割被天机打断，再发送一次 #接受求饶 即可续结算。');
      }
    });
  }

  async RefuseTianjiaoSurrender(e) {
    const qq = e.user_id.toString().replace('qg_', '');
    return withPlayerMutationLock(qq, async () => {
      const pending = await this.readPendingEncounter(qq, 'offered');
      if (!pending) return e.reply('当前没有等待处理的天骄求饶。');
      if (!await this.claimPendingEncounter(pending)) return e.reply('这次选择正在结算，请稍候。');
      const player = await Read_player(qq);
      if (isEvilCultivator(player)) {
        pending.stage = 'execution';
        pending.expiresAt = Date.now() + 5 * 60 * 1000;
        await redis.set(this.getPendingEncounterKey(qq), JSON.stringify(pending), { EX: 5 * 60 });
        await this.releasePendingEncounterClaim(pending);
        const choices = [
          '发送 #天魔炼化天骄，尝试吞其道果。',
          '发送 #灭杀天骄，直接斩断生机。',
        ];
        if (hasSoulSearchTechnique(player)) {
          choices.unshift('你掌握【搜魂大法】，发送 #搜魂天骄 可先搜魂，再行灭杀。');
        }
        const text = [
          '【拒降·魔念横生】',
          `${pending.tianjiaoName}已被镇压，神魂正在剧烈挣扎。`,
          ...choices,
          '对方可能自爆神魂，反噬强度由双方境界差决定。选择保留5分钟。',
        ].join('\n');
        const buttons = [];
        if (hasSoulSearchTechnique(player)) buttons.push({ text: '搜魂', command: '#搜魂天骄' });
        buttons.push(
          { text: '天魔炼化', command: '#天魔炼化天骄' },
          { text: '直接灭杀', command: '#灭杀天骄' },
        );
        return replyOfficialMessage(e, {
          markdown: [
            '# 拒降·魔念横生',
            '',
            `${pending.tianjiaoName}已被镇压，神魂正在剧烈挣扎。`,
            '',
            ...choices.map(choice => `- ${choice}`),
            '',
            '> 对方可能自爆神魂，选择保留5分钟。',
          ].join('\n'),
          text,
          buttons: [buttons],
        });
      }
      try {
        return await this.resolveForbiddenEscape(e, pending, qq);
      } finally {
        await this.releasePendingEncounterClaim(pending);
      }
    });
  }

  async resolveForbiddenEscape(e, pending, qq) {
    const method = getForbiddenEscapeMethod();
    const escape = rollIndependentTianjiaoEscape();
    const tianjiaoData = data.weimiantianjiao_list.find(item => item.名号 === pending.tianjiaoName);
    if (!tianjiaoData) {
      await redis.del(this.getPendingEncounterKey(qq));
      return e.reply('天骄气息已经消散，本次追杀结束。');
    }

    if (escape.escaped) {
      const statusKey = `tianjiao:status:${pending.tianjiaoName}`;
      let status = {};
      try {
        status = JSON.parse(await redis.get(statusKey) || '{}');
      } catch {
        status = {};
      }
      status.currentHP = 100;
      status.isAlive = false;
      await redis.set(statusKey, JSON.stringify(status));
      await redis.set(this.getTianjiaoEscapeKey(pending.tianjiaoName), (Date.now() + this.escapeRefreshMs).toString());
      await redis.del(`tianjiao:global:revive:${pending.tianjiaoName}`);
      await redis.del(this.getPendingEncounterKey(qq));
      return e.reply([
        '【禁忌遁术】',
        `${pending.tianjiaoName}${method}。`,
        `独立逃跑概率：${(escape.chance * 100).toFixed(1)}%，掷骰：${(escape.roll * 100).toFixed(1)}%。`,
        '禁忌手段成功，其将在6小时后重新现身；求饶赔礼随之失去。',
      ].join('\n'));
    }

    await e.reply([
      '【禁忌遁术·失败】',
      `${pending.tianjiaoName}${method}，却被你截断因果。`,
      `独立逃跑概率：${(escape.chance * 100).toFixed(1)}%，掷骰：${(escape.roll * 100).toFixed(1)}%。`,
    ].join('\n'));
    const settlementId = `ambush-${pending.token}`;
    await this.distributeNormalBattleDrops(e, pending.tianjiaoName, tianjiaoData, qq, 1, settlementId);
    await this.finalizePendingTianjiaoDeath(e, pending, qq, false);
    await redis.del(this.getPendingEncounterKey(qq));
    return true;
  }

  async SoulSearchTianjiao(e) {
    return this.resolveEvilTianjiaoExecution(e, 'soul-search');
  }

  async RefineTianjiao(e) {
    return this.resolveEvilTianjiaoExecution(e, 'refine');
  }

  async ExecuteTianjiao(e) {
    return this.resolveEvilTianjiaoExecution(e, 'execute');
  }

  async resolveEvilTianjiaoExecution(e, mode) {
    const qq = e.user_id.toString().replace('qg_', '');
    return withPlayerMutationLock(qq, async () => {
      const pending = await this.readPendingEncounter(qq, 'execution');
      if (!pending) return e.reply('当前没有被你镇压、等待处置的天骄。');
      if (!await this.claimPendingEncounter(pending)) return e.reply('这次处置正在结算，请稍候。');
      try {
        const player = await Read_player(qq);
        if (mode === 'refine') {
          const avatarName = getActiveZhutianAvatarName(player);
          if (avatarName) {
            return e.reply(`当前正装载化身【${avatarName}】，请先发送 #装载化身 本源，再炼化天骄本源。`);
          }
        }
        if (!isEvilCultivator(player)) return e.reply('你的魔道修为不足以施展这种处置。');
        if (mode === 'soul-search' && !hasSoulSearchTechnique(player)) {
          return e.reply('你尚未掌握【搜魂大法】。');
        }
        const tianjiaoData = data.weimiantianjiao_list.find(item => item.名号 === pending.tianjiaoName);
        if (!tianjiaoData) return e.reply('目标神魂已经脱离镇压。');
        const claimKey = `tianjiao-evil:${pending.token}:${mode}`;
        player._rewardClaims ||= {};
        const alreadyResolved = Boolean(player._rewardClaims[claimKey]);
        const backlash = alreadyResolved
          ? { selfDestructed: false, repeated: true }
          : resolveTianjiaoSoulBacklash(player, tianjiaoData);
        const rewardLines = [];

        if (!alreadyResolved && backlash.selfDestructed) {
          player._rewardClaims[claimKey] = Date.now();
          await Write_player(qq, player);
          await this.finalizePendingTianjiaoDeath(e, pending, qq, true);
          await redis.del(this.getPendingEncounterKey(qq));
          return e.reply([
            '【神魂自爆·禁术反噬】',
            `${pending.tianjiaoName}宁愿自毁真灵，也不肯让你得到神魂中的秘密。`,
            `肉身受创：${bigNumberTransform(backlash.bodyDamage)}，元神受创：${bigNumberTransform(backlash.soulDamage)}，道伤+${backlash.daoInjury}。`,
            `自爆概率：${(backlash.chance * 100).toFixed(1)}%，其残灵已坠入轮回。`,
          ].join('\n'));
        }

        if (!alreadyResolved && mode === 'soul-search') {
          const learnable = (tianjiaoData.学习的功法 || []).filter(name => !player.学习的功法?.includes(name));
          if (learnable.length > 0) {
            const learned = learnable[Math.floor(Math.random() * learnable.length)];
            player.学习的功法 ||= [];
            player.学习的功法.push(learned);
            rewardLines.push(`搜得功法记忆：【${learned}】`);
          } else {
            const gain = Math.max(1, Math.floor((Number(player.元神上限) || 100) * 0.05));
            player.元神 = (Number(player.元神) || 0) + gain;
            rewardLines.push(`其功法皆已掌握，转而炼得元神+${bigNumberTransform(gain)}`);
          }
        } else if (!alreadyResolved && mode === 'refine') {
          const cultivation = Math.max(1, Math.floor((Number(player.修为) || 1) * 0.05));
          const vitality = Math.max(1, Math.floor((Number(player.血气) || 1) * 0.05));
          player.修为 = (Number(player.修为) || 0) + cultivation;
          player.血气 = (Number(player.血气) || 0) + vitality;
          player.魔道值 = (Number(player.魔道值) || 0) + 80;
          rewardLines.push(`炼得修为+${bigNumberTransform(cultivation)}、血气+${bigNumberTransform(vitality)}、魔道值+80`);
          const devour = absorbTuntianSource(player, {
            类型: '天骄本源',
            目标: pending.tianjiaoName,
          });
          if (devour.gained) {
            rewardLines.push(`吞天本源：${devour.count}/${devour.target}，魔道值额外+20${devour.evolved ? '，体质蜕变为【混沌体】' : ''}`);
          }
        } else if (!alreadyResolved) {
          rewardLines.push('你没有觊觎其道果，只斩断了这一世生机。');
        }

        if (!alreadyResolved) {
          player._rewardClaims[claimKey] = Date.now();
          await Write_player(qq, player);
        }
        await this.finalizePendingTianjiaoDeath(e, pending, qq, true);
        await redis.del(this.getPendingEncounterKey(qq));
        const titles = {
          'soul-search': '搜魂功成',
          refine: '天魔炼化',
          execute: '斩断生机',
        };
        return e.reply([
          `【${titles[mode]}】`,
          `${pending.tianjiaoName}本世道身已灭，真灵坠入轮回。`,
          ...rewardLines,
        ].join('\n'));
      } catch (error) {
        console.error(`[天骄邪道处置] player=${qq} mode=${mode}`, error);
        return e.reply('处置结算被天机打断，原选择仍保留，可再次发送对应指令续结算。');
      } finally {
        await this.releasePendingEncounterClaim(pending);
      }
    });
  }

  async finalizePendingTianjiaoDeath(e, pending, qq, suppressRewards, { suiyun = false, namespace = 'suiyun' } = {}) {
    if (!['suiyun', 'memory'].includes(namespace)) throw new Error('未知本源炼化来源');
    const lockKey = 'tianjiao:battle:lock';
    const lockToken = `pending:${qq}:${pending.token}:${Date.now()}:${Math.random()}`;
    if (!await redis.set(lockKey, lockToken, { NX: true, EX: 180 })) return null;
    try {
    const tianjiaoData = data.weimiantianjiao_list.find(item => item.名号 === pending.tianjiaoName);
    if (!tianjiaoData) return null;
    if (pending.playerId && String(pending.playerId) !== String(qq)) return null;
    const receiptKey = `${namespace}:tianjiao-death:${pending.token}`;
    if (suiyun) {
      const receiptRaw = await redis.get(receiptKey);
      if (receiptRaw) {
        const receipt = JSON.parse(receiptRaw);
        if (receipt.ownerId !== String(qq) || receipt.token !== pending.token || receipt.name !== pending.tianjiaoName) return null;
        return { ...receipt, replayed: true };
      }
      if (Number(pending.suiyunOriginalExpiresAt || pending.expiresAt) <= Date.now()) return null;
      if (pending.tianjiaoLife != null && Number(pending.tianjiaoLife) !== (Number(tianjiaoData.轮回世数) || 0)) return null;
    }
    const globalReviveKey = `tianjiao:global:revive:${pending.tianjiaoName}`;
    if ((Number(await redis.get(globalReviveKey)) || 0) > Date.now()) return null;
    const statusKey = `tianjiao:status:${pending.tianjiaoName}`;
    let status = {};
    try {
      status = JSON.parse(await redis.get(statusKey) || '{}');
    } catch {
      status = {};
    }
    status.currentHP = 0;
    status.isAlive = true;
    let deathReceipt;
    if (suiyun) {
      pending.suiyunOriginalExpiresAt ||= pending.expiresAt;
      pending.stage = `${namespace}-settlement`;
      pending.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      await redis.set(this.getPendingEncounterKey(qq), JSON.stringify(pending), { EX: 24 * 3600 });
      deathReceipt = { key: receiptKey, ownerId: String(qq), token: pending.token, name: pending.tianjiaoName, sourceLifeEssence: Number(tianjiaoData.生命本源) || 100 };
    }
    return await this.finalizeTianjiaoDefeat(e, {
      tianjiaoName: pending.tianjiaoName,
      tianjiaoData,
      status,
      statusKey,
      globalReviveKey,
      killerQQ: qq,
      rewardMultiplier: 1,
      suppressRewards,
      deathReceipt,
    });
    } finally {
      await compareAndDeleteRedisJson(redis, lockKey, lockToken);
    }
  }

  // ========== 显示方法 ==========

  async ShowTianjiaoList(e) {
    if (!verc({ e })) return false;

    const player = await Read_player(e.user_id.toString());
    let msg = ['****位面天骄列表****'];
    for (const tianjiao of data.weimiantianjiao_list) {
      const trace = this.getAvailableTianjiaoTrace(player, tianjiao);
      const realm = getTianjiaoRealmName(tianjiao, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list);
      msg.push(`名号: ${tianjiao.名号}`);
      msg.push(`境界: ${realm}`);
      msg.push(`踪迹: ${formatTianjiaoTrace(trace)}`);
      msg.push('-------------------');
    }

    await ForwardMsg(e, msg);
    return false;
  }

  getLocationName(locationId) {
    return resolveLocationName(locationId) || `未知位面(${locationId})`;
  }

  getAvailableTianjiaoTrace(player, tianjiao, now = Date.now()) {
    const known = getKnownTianjiaoTrace(player, tianjiao, now);
    if (known) return known;
    try {
      const eventConfig = JSON.parse(fs.readFileSync(`${__PATH.data_path}/weimian_events.json`, 'utf8'));
      return (eventConfig.activeEvents || [])
        .map(event => event.tianjiaoTrace)
        .find(trace => trace?.name === tianjiao?.名号 && Number(trace.expiresAt) > now) || null;
    } catch {
      return null;
    }
  }

  getTianjiaoWorldYear() {
    const era = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
    return getRealmEventWorldYear(era.index, era.years, era.epoch);
  }

  getTianjiaoContext() {
    const era = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
    return {
      eraIndex: Number(era.index) || 0,
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
  }

  persistTianjiaoList() {
    try {
      const bossListPath = path.join(data.filePathMap.lib, '位面boss列表.json');
      fs.writeFileSync(bossListPath, JSON.stringify(data.weimiantianjiao_list, null, 2), 'utf8');
    } catch (error) {
      console.error('保存天骄列表失败:', error);
    }
  }

  async checkTianjiaoReincarnation() {
    try {
      const era = config.getConfig('xiuxian', 'xiuxian')?.Era || {};
      const groups = era.notifyGroups || [];
      const now = Date.now();

      for (const tianjiao of data.weimiantianjiao_list || []) {
        const name = tianjiao.名号;
        const reviveKey = `tianjiao:global:revive:${name}`;
        const reviveTime = Number(await redis.get(reviveKey));
        if (!reviveTime || now < reviveTime) continue;

        const announcedKey = `tianjiao:reincarnation:announced:${name}`;
        if (await redis.get(announcedKey)) {
          await redis.del(reviveKey);
          continue;
        }

        const life = Math.max(1, Number(tianjiao.轮回世数) || 1);
        const title = tianjiao.轮回称号 || '轮回者';
        const statusKey = `tianjiao:status:${name}`;
        let status = {};
        try {
          status = JSON.parse(await redis.get(statusKey) || '{}');
        } catch {
          status = {};
        }
        status.currentHP = 100;
        status.isAlive = true;
        delete status.本世败绩;
        delete status.isHealing;
        delete status.养伤;
        delete status.下次自强倍率;
        delete status.下次证道阻断;
        delete status.护身法宝已碎;
        await redis.set(statusKey, JSON.stringify(status));
        if (!(await redis.set(announcedKey, '1', { NX: true }))) continue;
        await redis.del(reviveKey);

        const message = [
          '【轮回钟鸣·转世归来】',
          `第${life}世·${title}，${name}！`,
          '道身崩灭处，一点真灵不灭；轮回深处，昔年印记重新亮起。',
          '万载积累尽散，神骨道胎重铸，这一世自原点再踏征途。',
          '旧世因果俱消，新敌四起，诸天修士当心，天骄已归来！',
          '「纵死一次，大道不灭」',
        ].join('\n');

        for (const groupId of groups) {
          try {
            await Bot.sendGroupMsg(groupId, message);
          } catch (error) {
            console.error(`[天骄轮回] 群 ${groupId} 公告失败:`, error);
          }
        }
        console.log(`[天骄轮回] ${name} 第${life}世归来`);
      }
    } catch (error) {
      console.error('[天骄转世巡查] 失败:', error);
    }
  }

  async CreateWorldBoss2(e) {
    if (!e || e.isMaster) {
      if (WorldBOSSBattleLock === 1 || await redis.get('tianjiao:battle:lock')) {
        e?.reply?.('天骄战斗正在进行，暂不能重置天骄状态。');
        return false;
      }
      await InitWorldBoss(e);
      return false;
    }
  }

  async DeleteWorldBoss2(e) {
    if (!verc({ e })) return false;
    if (e.isMaster) {
      if (WorldBOSSBattleLock === 1 || await redis.get('tianjiao:battle:lock')) {
        e.reply('天骄战斗正在进行，暂不能关闭天骄挑战。');
        return false;
      }
      if (await BossIsAlive()) {
        await redis.del('Xiuxian:WorldBossStatus2');
        await redis.del('zhutianxiuxian1.0Record2');

        for (const tianjiao of data.weimiantianjiao_list) {
          await redis.del(`tianjiao:global:revive:${tianjiao.名号}`);
          await redis.del(`tianjiao:global:escape:${tianjiao.名号}`);
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

    const player = await Read_player(e.user_id.toString());
    await this.checkTianjiaoReincarnation();
    const match = e.msg.match(/^#天骄状态(?:\s+(.*))?$/);
    const tianjiaoName = match[1] ? match[1].trim() : '';

    if (!tianjiaoName) {
      let allStatus = ['****所有天骄状态****'];

      for (const tianjiao of data.weimiantianjiao_list) {
        const trace = this.getAvailableTianjiaoTrace(player, tianjiao);
        const realm = getTianjiaoRealmName(tianjiao, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list);
        const statusKey = `tianjiao:status:${tianjiao.名号}`;
        let status = await redis.get(statusKey);
        status = JSON.parse(status || '{}');

        const globalReviveKey = `tianjiao:global:revive:${tianjiao.名号}`;
        const globalReviveTime = Number(await redis.get(globalReviveKey)) || 0;
        const escapeTime = Number(await redis.get(this.getTianjiaoEscapeKey(tianjiao.名号))) || 0;
        const blockedUntil = Math.max(globalReviveTime, escapeTime);
        const isUnavailable = blockedUntil > Date.now();

        if (!isUnavailable && (!status.isAlive || !status.currentHP || status.currentHP <= 0)) {
          status.currentHP = 100;
          status.isAlive = true;
          await redis.set(statusKey, JSON.stringify(status));
        }

        if (isUnavailable) {
          const remainingMs = blockedUntil - Date.now();
          const hours = Math.floor(remainingMs / (60 * 60 * 1000));
          const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

          allStatus.push(
            `名号: ${tianjiao.名号}`,
            `境界: ${realm}`,
            `踪迹: ${formatTianjiaoTrace(trace)}`,
            `状态: ${globalReviveTime >= escapeTime ? '已击败' : '已被护道人救走'}，${hours}小时${minutes}分钟后刷新`,
            ...(Number(tianjiao.轮回世数) > 0 ? [`转世: 第${tianjiao.轮回世数}世·${tianjiao.轮回称号 || ''}`] : []),
            ...(tianjiao.天骄夺宝 ? [`至宝: 【${tianjiao.当前先天至宝}】随其遁走，讨伐可夺回`] : []),
            ...(tianjiao.参悟仿制 ? [`参悟: 已参悟【${tianjiao.参悟仿制.来源名号}】的「${tianjiao.参悟仿制.来源装备名}」，击杀可夺仿制`] : []),
            '-------------------'
          );
        } else {
          const healing = isTianjiaoHealing(status, this.getTianjiaoWorldYear());
          allStatus.push(
            `名号: ${tianjiao.名号}`,
            `境界: ${realm}`,
            `踪迹: ${formatTianjiaoTrace(trace)}`,
            `血量: ${status.currentHP}%`,
            `状态: ${status.isAlive ? (healing ? '存活（养伤中）' : '存活') : '已击败'}`,
            ...(healing ? [`养伤: ${status.养伤?.type || '疗伤中'}，至第${status.养伤?.untilWorldYear}年`] : []),
            ...(Number(tianjiao.轮回世数) > 0 ? [`转世: 第${tianjiao.轮回世数}世·${tianjiao.轮回称号 || ''}`] : []),
            ...(tianjiao.天骄夺宝 ? [`至宝: 【${tianjiao.当前先天至宝}】携宝之躯，讨伐可夺回`] : []),
            ...(tianjiao.参悟仿制 ? [`参悟: 已参悟【${tianjiao.参悟仿制.来源名号}】的「${tianjiao.参悟仿制.来源装备名}」，击杀可夺仿制`] : []),
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

    const trace = this.getAvailableTianjiaoTrace(player, tianjiaoData);

    const globalReviveKey = `tianjiao:global:revive:${tianjiaoName}`;
    const globalReviveTime = Number(await redis.get(globalReviveKey)) || 0;
    const escapeTime = Number(await redis.get(this.getTianjiaoEscapeKey(tianjiaoName))) || 0;
    const blockedUntil = Math.max(globalReviveTime, escapeTime);
    const isUnavailable = blockedUntil > Date.now();

    if (isUnavailable) {
      const remainingMs = blockedUntil - Date.now();
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      e.reply(globalReviveTime >= escapeTime
        ? `${tianjiaoName}已被击败，将在${hours}小时${minutes}分钟后刷新`
        : `${tianjiaoName}已被护道人救走，将在${hours}小时${minutes}分钟后重新现身`);
      return false;
    }

    const statusKey = `tianjiao:status:${tianjiaoName}`;
    let status = await redis.get(statusKey);
    status = JSON.parse(status || '{}');

    if (!isUnavailable && (!status.isAlive || !status.currentHP || status.currentHP <= 0)) {
      status.currentHP = 100;
      status.isAlive = true;
      await redis.set(statusKey, JSON.stringify(status));
    }

    const healing = isTianjiaoHealing(status, this.getTianjiaoWorldYear());
    const realm = getTianjiaoRealmName(tianjiaoData, data.Levelmijing_list, data.xiangujinshi_list, data.huafen_list);
    let ReplyMsg = [
      `----${tianjiaoName}状态----`,
      `境界: ${realm}`,
      `踪迹: ${formatTianjiaoTrace(trace)}`,
      `当前血量: ${status.currentHP}%`,
      `状态: ${status.isAlive ? (healing ? '存活（养伤中）' : '存活') : '已击败'}`,
      ...(healing ? [`养伤: ${status.养伤?.type || '疗伤中'}，至第${status.养伤?.untilWorldYear}年`] : []),
      ...(Number(tianjiaoData.轮回世数) > 0 ? [`转世: 第${tianjiaoData.轮回世数}世·${tianjiaoData.轮回称号 || ''}`] : []),
      ...(tianjiaoData.天骄夺宝 ? [`至宝: 【${tianjiaoData.当前先天至宝}】天骄夺宝之器，讨伐该天骄可夺回`] : []),
      ...(tianjiaoData.参悟仿制 ? [`参悟: 已参悟【${tianjiaoData.参悟仿制.来源名号}】的「${tianjiaoData.参悟仿制.来源装备名}」，击杀该天骄可夺仿制品`] : []),
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
          msg.push('  逃跑判定: 每次独立生成0~1概率并掷骰');
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
      '逃跑判定: 每次独立生成0~1概率并掷骰',
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

  async finalizeTianjiaoDefeat(e, options) {
    const {
      tianjiaoName,
      tianjiaoData,
      status,
      statusKey,
      globalReviveKey,
      killerQQ,
      rewardMultiplier = 1,
      suppressRewards = false,
      deathReceipt,
    } = options;
    const reviveTime = Date.now() + this.tianjiaoRefreshMs;
    const settlementId = reviveTime.toString();

    status.currentHP = 100;
    status.isAlive = false;
    delete status.本世败绩;
    delete status.isHealing;
    delete status.养伤;
    delete status.下次自强倍率;
    delete status.下次证道阻断;
    delete status.护身法宝已碎;

    if (deathReceipt) {
      // 死亡标记、本世状态与来源回执原子落盘；随后玩家写入失败可凭同一回执补领。
      const { key, ...receipt } = deathReceipt;
      await redis.multi()
        .set(globalReviveKey, settlementId)
        .set(statusKey, JSON.stringify(status))
        .set(key, JSON.stringify({ ...receipt, reviveTime, settlementId }), { EX: 24 * 3600 })
        .exec();
    } else {
      await redis.set(globalReviveKey, settlementId);
    }
    await redis.del(`tianjiao:reincarnation:announced:${tianjiaoName}`);
    await redis.del(this.getTianjiaoEscapeKey(tianjiaoName));
    await redis.set(statusKey, JSON.stringify(status));

    const hatredCleanup = await clearTianjiaoHatred(redis, tianjiaoName);

    try {
      await e.reply(`${tianjiaoName}道身崩灭，已入轮回！与全服玩家的${hatredCleanup.cleared}笔旧怨已经清空，18小时后转世之身归来。`);
    } catch (error) {
      console.warn(`[天骄轮回] ${tianjiaoName} 击杀提示发送失败:`, error);
    }

    if (!suppressRewards && Array.isArray(tianjiaoData.特殊掉落)) {
      for (let index = 0; index < tianjiaoData.特殊掉落.length; index++) {
        const special = tianjiaoData.特殊掉落[index];
        if (Math.random() >= special.概率) continue;
        const amount = rollTianjiaoDropAmount(special, rewardMultiplier);
        try {
          const idempotencyKey = this.getTianjiaoRewardIdempotencyKey(tianjiaoName, settlementId, killerQQ, 'special-drop', index);
          const display = await this.grantTianjiaoDrop(killerQQ, special, amount, idempotencyKey);
          if (!display) continue;
          let dropMsg = `特殊掉落：${display}`;
          if (special.效果) dropMsg += `（${special.效果}）`;
          await e.reply(dropMsg);
        } catch (error) {
          console.warn(`[天骄特殊掉落] ${tianjiaoName}/${killerQQ} 发放失败:`, error);
        }
      }
    }

    // 污损修复：击杀天骄，曾被其污损的装备复原
    try {
      const killerEquip = await Read_equipment(killerQQ);
      let repairedCount = 0;
      for (const { slot, item, 天骄 } of listTaintedSlots(killerEquip)) {
        if (天骄 === tianjiaoName && repairTaint(killerEquip, slot)) repairedCount++;
      }
      if (repairedCount > 0) {
        await Write_equipment(killerQQ, killerEquip);
        await e.reply(`【污损复原】${tianjiaoName}伏诛，你身上${repairedCount}件被污损的装备重焕灵光！`);
      }
    } catch (error) {
      console.warn(`[天骄污损修复] ${tianjiaoName}/${killerQQ} 失败:`, error);
    }

    // 参悟仿制掉落：天骄参悟的装备仿制品随之坠落
    if (!suppressRewards && tianjiaoData.参悟仿制) {
      try {
        const imitation = tianjiaoData.参悟仿制;
        await Add_najie_thing(killerQQ, createImitationItem(imitation, killerQQ), '装备', 1, 6);
        await e.reply(`【参悟掉落】${tianjiaoName}参悟的「${imitation.仿制名}」随之坠落，落入你手！发送 #反哺炼化 ${imitation.来源装备名} 可将道韵炼回本体。`);
        delete tianjiaoData.参悟仿制;
        this.persistTianjiaoList();
      } catch (error) {
        console.warn(`[天骄参悟掉落] ${tianjiaoName}/${killerQQ} 失败:`, error);
      }
    }

    // 至宝夺回：天骄持宝被讨伐，击杀者高概率夺回至宝；未夺回则随转世释放，等待再出世
    if (!suppressRewards && tianjiaoData?.天骄夺宝 && tianjiaoData.当前先天至宝) {
      try {
        const recovery = rollTianjiaoTreasureRecovery(tianjiaoData, Math.random, 0.8);
        if (recovery.ok && recovery.recovered) {
          const ownership = claimInnateTreasure(recovery.treasureName, killerQQ);
          if (ownership.ok) {
            const najie = await Read_najie(killerQQ);
            const equipment = await Read_equipment(killerQQ);
            const alreadyHas = equipment.至宝?.name === recovery.treasureName ||
              najie.装备?.some(item => item.name === recovery.treasureName);
            if (!alreadyHas) {
              await Add_najie_thing(killerQQ, createInnateTreasure(recovery.treasureName, killerQQ), '装备', 1, 6);
            }
          }
          this.persistTianjiaoList();
          await e.reply(`【至宝夺回】${tianjiaoName}道身崩灭，掌中先天至宝【${recovery.treasureName}】坠入凡尘，被你拾获！`);
        } else if (recovery.ok) {
          this.persistTianjiaoList();
          await e.reply(`【至宝蒙尘】${tianjiaoName}掌中的【${recovery.treasureName}】随其真灵一同没入轮回，未能夺回！`);
          await this.announceTreasureRebirth(recovery.treasureName);
        }
      } catch (error) {
        console.warn(`[天骄至宝夺回] ${tianjiaoName} 结算失败:`, error);
      }
    }

    if (!suppressRewards) {
      try {
        await this.distributeContributionRewards(e, tianjiaoName, tianjiaoData, killerQQ, settlementId);
      } catch (error) {
        console.warn(`[天骄贡献奖励] ${tianjiaoName} 结算失败:`, error);
      }
    }
    try {
      await redis.del(`tianjiao:damage:${tianjiaoName}`);
    } catch (error) {
      console.warn(`[天骄贡献奖励] ${tianjiaoName} 伤害榜清理失败:`, error);
    }

    let reincarnation = null;
    try {
      reincarnation = resetTianjiaoToInitialTemplate(tianjiaoData, this.getTianjiaoContext());
      // 转世后至宝随旧身没入轮回（未被夺回则释放，等待再出世）
      clearTianjiaoTreasure(tianjiaoData);
      this.persistTianjiaoList();
      await e.reply(`第${reincarnation.life}世·${reincarnation.title}，${tianjiaoName}轮回印记已定。`);
    } catch (error) {
      console.error(`[天骄轮回] ${tianjiaoName} 重置初始模板失败:`, error);
    }

    return { reviveTime, settlementId, reincarnation, ...(deathReceipt ? { sourceLifeEssence: deathReceipt.sourceLifeEssence } : {}) };
  }

  /** 至宝重出预告：夺回失败时全服公告该至宝已遁入诸天，等待再次出世 */
  async announceTreasureRebirth(treasureName) {
    try {
      const message = [
        '【至宝重出预告】',
        `先天至宝【${treasureName}】随天骄真灵没入轮回，已重新遁入诸天！`,
        '混沌未分，机缘待定——下一次出世，诸天修士皆可再争！',
        '「灵宝有灵，自择其主」',
      ].join('\n');
      const groups = config.getConfig('xiuxian', 'xiuxian')?.Era?.notifyGroups || [];
      for (const groupId of groups) {
        try {
          await Bot.sendGroupMsg(groupId, message);
        } catch (error) {
          console.error(`[至宝重出预告] 群 ${groupId} 公告失败:`, error);
        }
      }
      console.log(`[至宝重出预告] ${treasureName} 待再次出世`);
    } catch (error) {
      console.error('[至宝重出预告] 发送失败:', error);
    }
  }

  /** 败北触发：概率污损玩家百分比装备 / 天骄参悟玩家装备词条（温和可逆，仅针对百分比装备） */
  async rollTianjiaoTaint(e, tianjiaoData, usr_qq, player) {
    try {
      const equip = await Read_equipment(usr_qq);
      const percentSlots = listPercentEquipSlots(equip);
      if (!percentSlots.length) return;
      const msgs = [];
      let changed = false;

      // 污损：20% 概率选一件未污损的百分比装备
      if (Math.random() < 0.2) {
        const candidates = percentSlots.filter(({ item }) => !isTainted(item));
        if (candidates.length) {
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          applyEquipmentTaint(equip, target.slot, tianjiaoData.名号);
          changed = true;
          msgs.push(`【装备污损】你败退之际，${tianjiaoData.名号}以道痕污浊了你的【${target.item.name}】（对应属性-20%，击杀${tianjiaoData.名号}或 #修复污损 可复原）`);
        }
      }

      // 参悟：12% 概率，天骄参悟玩家装备词条（对同一玩家每天限一次）
      if (Math.random() < 0.12 && !tianjiaoData.参悟仿制) {
        const dailyKey = `tianjiao:paramita:${tianjiaoData.名号}:${usr_qq}`;
        if (!(await redis.get(dailyKey))) {
          const target = percentSlots[Math.floor(Math.random() * percentSlots.length)];
          tianjiaoData.参悟仿制 = createImitation(
            tianjiaoData.名号,
            usr_qq,
            player.名号 || usr_qq,
            target.slot,
            target.item
          );
          this.persistTianjiaoList();
          await redis.set(dailyKey, '1', { EX: 24 * 3600 });
          msgs.push(`【天骄参悟】${tianjiaoData.名号}观摩你的【${target.item.name}】，悟出其中道韵，生成「${tianjiaoData.参悟仿制.仿制名}」！击杀${tianjiaoData.名号}可夺回，发送 #反哺炼化 可炼回本体`);
        }
      }

      if (msgs.length) {
        if (changed) await Write_equipment(usr_qq, equip);
        await e.reply(msgs.join('\n'));
      }
    } catch (error) {
      console.warn(`[天骄污损/参悟] ${tianjiaoData.名号}/${usr_qq} 结算失败:`, error);
    }
  }

  /** #查看污损：展示玩家被污损的装备与修复途径 */
  async LookUpTaintStatus(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString();
    try {
      const equip = await Read_equipment(usr_qq);
      const tainted = listTaintedSlots(equip);
      if (!tainted.length) {
        return e.reply('你身上没有被天骄污损的装备，道韵清朗。');
      }
      const lines = ['****你的装备污损状态****'];
      for (const { slot, item, 天骄 } of tainted) {
        const field = TAINTED_SLOTS[slot] || '属性';
        lines.push(`【${item.name}】（${slot}）`);
        lines.push(`  污损来源: ${天骄}`);
        lines.push(`  影响: ${field} -20%`);
        lines.push('-------------------');
      }
      lines.push('', '修复方式：击杀污损来源天骄自动复原，或发送 #修复污损（消耗灵石5000万+源石1000万/件）');
      return e.reply(lines.join('\n'));
    } catch (error) {
      console.error('[天骄污损查看] 失败:', error);
      return e.reply('查询污损状态时发生错误，请稍后再试。');
    }
  }

  /** #修复污损：消耗灵石/源石修复全部污损装备 */
  async RepairTaint(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString();
    try {
      const equip = await Read_equipment(usr_qq);
      const tainted = listTaintedSlots(equip);
      if (!tainted.length) return e.reply('你身上没有污损装备，无需修复。');
      const costLingshi = tainted.length * 50000000;
      const costYuanshi = tainted.length * 10000000;
      const player = await Read_player(usr_qq);
      if ((Number(player.灵石) || 0) < costLingshi || (Number(player.源石) || 0) < costYuanshi) {
        return e.reply(`修复${tainted.length}件污损装备需要灵石${bigNumberTransform(costLingshi)}与源石${bigNumberTransform(costYuanshi)}，家底不够，还是去击杀污损来源的天骄吧！`);
      }
      await Add_灵石(usr_qq, -costLingshi);
      await Add_源石(usr_qq, -costYuanshi);
      for (const { slot } of tainted) repairTaint(equip, slot);
      await Write_equipment(usr_qq, equip);
      return e.reply(`你以灵石${bigNumberTransform(costLingshi)}、源石${bigNumberTransform(costYuanshi)}为代价，洗去${tainted.length}件装备上的污损道痕，重焕灵光！`);
    } catch (error) {
      console.error('[天骄污损修复] 失败:', error);
      return e.reply('修复时发生错误，请稍后再试。');
    }
  }

  /** #反哺炼化 装备名：把天骄仿制品的道韵炼回本体装备（消耗仿制品） */
  async ReimburseImitation(e) {
    if (!verc({ e })) return false;
    const match = e.msg.match(/^#反哺炼化\s+(.*)$/);
    const equipName = match?.[1]?.trim();
    const usr_qq = e.user_id.toString();
    if (!equipName) return e.reply('请指定本体装备名，例如：#反哺炼化 太初镇世剑');
    try {
      const najie = await Read_najie(usr_qq);
      const imitationItem = (najie.装备 || []).find(item =>
        item?.参悟仿制 && item.参悟仿制.来源装备名 === equipName
      ) || (najie.装备 || []).find(item =>
        item?.参悟仿制 && item.name === `仿·${equipName}`
      );
      if (!imitationItem) {
        return e.reply(`纳戒中未找到【${equipName}】对应的参悟仿制品，先击杀参悟天骄获取吧！`);
      }
      const equip = await Read_equipment(usr_qq);
      const slots = ['武器', '护具', '法宝', '帝兵', '至宝'];
      const origItem = slots.map(slot => equip[slot]).find(item => item?.name === equipName);
      if (!origItem) return e.reply(`本体装备【${equipName}】不在身上，请先装备或确认名字无误。`);
      const result = reimburseImitation(origItem, imitationItem);
      if (!result.ok) {
        if (result.reason === 'nothing_gained') return e.reply('仿制品中并无可炼化的道韵词条。');
        return e.reply('反哺炼化失败，请确认仿制品与本体装备匹配。');
      }
      najie.装备 = (najie.装备 || []).filter(item => item !== imitationItem);
      await Write_najie(usr_qq, najie);
      await Write_equipment(usr_qq, equip);
      const gainedText = Object.entries(result.gained)
        .map(([key, value]) => `${key}+${(value * 100).toFixed(1)}%`)
        .join('，');
      return e.reply(`你将「${imitationItem.name}」中的天骄道韵炼化，反哺回【${equipName}】！\n本体词条提升：${gainedText}\n「参悟他人之道，亦是成就自身之路」`);
    } catch (error) {
      console.error('[天骄反哺炼化] 失败:', error);
      return e.reply('反哺炼化时发生错误，请稍后再试。');
    }
  }

  async WorldBossBattle2(e) {
    if (!verc({ e })) return false;
    if (e.isPrivate) return false;
    await this.checkTianjiaoReincarnation();

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
      const panguRewardMultiplier = hasEquippedInnateTreasure(player, '盘古幡', '开天') && player.先天权柄?.盘古开天待用 ? 2 : 1;
      const zhuxianTianjiao = hasEquippedInnateTreasure(player, '诛仙四剑', '被动:1');
      // 岁云常青（岁云灵根自带）在天骄讨伐中与诛仙四剑被动同级：单次至多斩落40%气血，两者并存不叠加。
      const tianjiaoProgress = getTianjiaoProgressPenalty(player, { zhuxian: zhuxianTianjiao });
    
    const tianjiaoData = data.weimiantianjiao_list.find(tj => tj.名号 === tianjiaoName);
    if (!tianjiaoData) {
      e.reply(`未找到名为「${tianjiaoName}」的天骄`);
      return false;
    }
    if (ensureTianjiaoInitialTemplate(tianjiaoData)) this.persistTianjiaoList();

    const globalReviveKey = `tianjiao:global:revive:${tianjiaoName}`;
    const escapeKey = this.getTianjiaoEscapeKey(tianjiaoName);
    const globalReviveTime = Number(await redis.get(globalReviveKey)) || 0;
    const escapeTime = Number(await redis.get(escapeKey)) || 0;
    const blockedUntil = Math.max(globalReviveTime, escapeTime);
    if (blockedUntil > Date.now()) {
      const remainingMs = blockedUntil - Date.now();
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      e.reply(globalReviveTime >= escapeTime
        ? `${tianjiaoName}已被击败，将在${hours}小时${minutes}分钟后轮回归来`
        : `${tianjiaoName}已被护道人救走，将在${hours}小时${minutes}分钟后重新现身`);
      return false;
    }

    const trace = this.getAvailableTianjiaoTrace(player, tianjiaoData);
    const traceReach = getTianjiaoTraceReach(player, trace);
    const scentAccess = getTianjiaoScentAccess(player, tianjiaoName);
    const usesScent = !traceReach.ok && scentAccess.ok;
    if (!traceReach.ok && !usesScent) {
      if (!trace && scentAccess.reason === 'target') {
        e.reply(`万里追息印已锁定${scentAccess.state.target}，剩余${scentAccess.state.remaining}次，无法改追${tianjiaoName}。`);
        return false;
      }
      if (!trace) {
        e.reply(`你尚未找到${tianjiaoName}的踪迹。通关副本、关注位面大事件，或消耗万里定位符均可追踪。`);
        return false;
      }
      e.reply([
        `${tianjiaoName}当前踪迹：${formatTianjiaoTrace(trace)}`,
        traceReach.reason === 'plane'
          ? `请先穿梭至${trace.plane}。`
          : `请抵达精确坐标后再讨伐：#前往${trace.coordinate.x},${trace.coordinate.y}`,
      ].join('\n'));
      return false;
    }

    // 检查CD时间
    const now_Time = Date.now();
    const battleId = `${now_Time}:${usr_qq}`;
    const last_time = await redis.get(`xiuxian:player:${usr_qq}:BOSSCD`);
    const userCooldownMs = this.userCooldownMs * (hasSuiyunAuthority(player, '无极') ? .5 : 1);

    if (player.id != "2283096140" && last_time && now_Time < parseInt(last_time) + userCooldownMs) {
      const remainingMs = parseInt(last_time) + userCooldownMs - now_Time;
      const minutes = Math.floor(remainingMs / (60 * 1000));
      const seconds = Math.floor((remainingMs % (60 * 1000)) / 1000);
      e.reply(`讨伐天骄冷却中，剩余时间: ${minutes}分${seconds}秒`);
      return false;
    }

    const distributedLockKey = 'tianjiao:battle:lock';
    const distributedLockToken = `${process.pid}:${now_Time}:${usr_qq}:${Math.random()}`;
    if (!(await redis.set(distributedLockKey, distributedLockToken, { EX: 30, NX: true }))) {
      e.reply('天骄战斗正在进行中，请稍后再试！');
      return false;
    }

    // 设置战斗锁
    WorldBOSSBattleLock = 1;
    const lockToken = ++WorldBOSSBattleLockToken;
    SetWorldBOSSBattleUnLockTimer(e, lockToken);

    try {
      // 取得同一把死亡锁后重验，避免排查踪迹期间本世已被另一处置终结。
      if ((Number(await redis.get(globalReviveKey)) || 0) > Date.now()) {
        return e.reply(`${tianjiaoName}本世道身刚刚已经陨落，请等待转世归来。`);
      }
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

      // 装备污损：天骄留下的污损道痕使对应装备属性本场战斗 -20%（实时结算，可击杀/材料修复）
      try {
        const taintEquip = await Read_equipment(usr_qq);
        const taintPenalties = applyTaintPenalty(A_player, taintEquip);
        if (taintPenalties.length) {
          await e.reply(`【装备污损】${taintPenalties.map(p => `【${p.name}】`).join('')}被${taintPenalties[0].天骄}的污损道痕压制，本场战斗对应属性-20%！击杀该天骄或 #修复污损 可复原。`);
        }
      } catch (error) {
        console.warn(`[天骄污损] ${tianjiaoName}/${usr_qq} 战斗扣减失败:`, error);
      }

      // 检查玩家状态
      if (A_player.level_id < 32) {
        e.reply('你的练气境界至少达到法身境才能讨伐天骄');
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

      if (!status.isAlive || !status.currentHP || status.currentHP <= 0) {
        status.currentHP = 100;
        status.isAlive = true;
      }
      // 护体法宝碎毁状态仅影响本次战败，每场战斗开始时恢复
      delete status.护身法宝已碎;

      // 获取仇恨值
      const currentHatred = await this.getPlayerHatred(tianjiaoName, usr_qq);
      const hatredLevel = this.getHatredLevel(currentHatred);

      // 根据玩家境界调整天骄属性
      let attributeMultiplier = 10;
      let openingDialogue = "";
      const usesIndependentStats = isIndependentTianjiao(tianjiaoData);
      const tianjiaoRealmTier = getTianjiaoRealmTier(A_player);

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
        if (tianjiaoRealmTier === 'below') {
          player.道伤 = Math.max(0, Number(player.道伤) || 0) + 1;
          player.当前血量 = 0;
          await Write_player(usr_qq, player);
          e.reply(`你尚未达到仙台、尊者或塑形级权柄，${tianjiaoName}根本不想浪费时间在你身上，直接将你一掌击败！(道伤+1)`);
          WorldBOSSBattleLock = 0;
          return false;
        }
        openingDialogue = `${tianjiaoName}携自身当前境界与你一战！`;
      } else {
        if (tianjiaoRealmTier === 'full') {
          attributeMultiplier = 5;
          openingDialogue = `检测到玩家已具备圣人级以上权柄，${tianjiaoName}将不再压制境界，以全部实力应战！`;
        } else if (tianjiaoRealmTier === 'below') {
          player.道伤 = Math.max(0, Number(player.道伤) || 0) + 1;
          player.当前血量 = 0;
          await Write_player(usr_qq, player);
          e.reply(`你尚未达到仙台、尊者或塑形级权柄，${tianjiaoName}根本不想浪费时间在你身上，直接将你一掌击败！(道伤+1)`);
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

      // 位面天骄使用自身境界、装备和积累，不再镜像挑战者属性。
      const independentStats = usesIndependentStats
        ? buildTianjiaoBattleStats(tianjiaoData, {
            cultivationLevels: data.Level_list,
            physiqueLevels: data.LevelMax_list,
            secretLevels: data.Levelmijing_list,
            ancientLevels: data.xiangujinshi_list,
            flowerLevels: data.huafen_list,
            equipmentList: data.equipment_list,
            imperialWeaponList: data.dibing_list,
          })
        : null;
      const B_player = independentStats ? {
        ...independentStats,
        名号: `${tianjiaoName}(当前状态)`,
        灵根: tianjiaoData.灵根 || { name: "普通灵根", type: "普通灵根" },
        法球倍率: tianjiaoData.灵根?.法球倍率 || 1,
      } : {
        名号: `${tianjiaoName}${attributeMultiplier > 1 ? '(全力状态)' : '(压制境界)'}`,
        攻击: parseInt(A_player.攻击 * attributeMultiplier),
        防御: parseInt(A_player.防御 * attributeMultiplier),
        当前血量: parseInt(A_player.血量上限 * attributeMultiplier),
        血量上限: parseInt(A_player.血量上限 * attributeMultiplier),
        暴击率: tianjiaoData.暴击率,
        暴击伤害: tianjiaoData.暴击伤害,
        闪避率: tianjiaoData.闪避率,
        首次闪避: tianjiaoData.首次闪避,
        闪避增攻: tianjiaoData.闪避增攻,
        闪避增攻上限: tianjiaoData.闪避增攻上限,
        灵根: tianjiaoData.灵根?.name || "普通灵根",
        法球倍率: tianjiaoData.灵根?.法球倍率 || 1,
        学习的功法: tianjiaoData.学习的功法 || [],
      };

      const scentResult = usesScent ? consumeTianjiaoScent(player, tianjiaoName) : null;
      const sourceField = consumeSourceStoneField(player, A_player);
      if (scentResult?.ok || sourceField.consumed) await Write_player(usr_qq, player);

      // 进行战斗
      const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player, { sourceField });
      if (blackEmperorFormation.consumed) await Write_player(usr_qq, player);
      const result = await zd_battle(A_player, B_player, { battleType: 'tianjiao' });
      let msg = result.msg;
      if (scentResult?.ok && Array.isArray(msg)) {
        msg.unshift(`【万里追息】锁定${scentResult.target}气息，本次无需踪迹；追息印剩余${scentResult.remaining}次。`);
      }
      if (sourceField.consumed && Array.isArray(msg)) {
        msg.unshift(`【${sourceField.name}】山川龙气入体，攻防血提升${Math.round((sourceField.multiplier - 1) * 100)}%，阵势剩余${sourceField.remaining}场。`);
      }
      if (blackEmperorFormation.message && Array.isArray(msg)) msg.unshift(blackEmperorFormation.message);
      
      // 按每张20条控制 fight.html 图片高度，完整保留战斗日志并按顺序发送。
      await sendFightImages(e, msg);

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

      const latestTaskPlayer = await Read_player(usr_qq);
      const wenxianTasks = recordWenXianTaskProgress(latestTaskPlayer, 'tianjiao');
      if (wenxianTasks.changed || wenxianTasks.dailyCompleted) {
        await Write_player(usr_qq, latestTaskPlayer);
      }
      Object.assign(player, latestTaskPlayer);

      // ========== 仇恨值与对话系统 ==========

      if (isWin) {
        let rewardSettlementId = battleId;
        // 玩家胜利
        if (panguRewardMultiplier > 1) {
          player.先天权柄 ||= { 冷却: {} };
          delete player.先天权柄.盘古开天待用;
          player.先天权柄.盘古洗劫翻倍待用 = true;
          await Write_player(usr_qq, player);
        }
        
        const panguTalismanShattered = tryPanguShatterTalisman(status, panguRewardMultiplier > 1);
        // 先检查是否触发护身法宝（不扣血）
        const talismanTriggered = await this.triggerProtectiveTalisman(e, tianjiaoName, tianjiaoData, status);
        
        if (!talismanTriggered) {
          // 护身法宝未触发，正常扣血
          status.currentHP = Math.max(0, status.currentHP - tianjiaoProgress.win);
        }

        const defeatResult = registerTianjiaoDefeat(tianjiaoData, status, this.getTianjiaoWorldYear());
        const setbackLines = [];
        if (defeatResult.setback) {
          const typeText = {
            轻伤: '本源震荡，血洒长空',
            道心受创: '连败之下道心受创',
            道心破碎: '道心破碎，万载积累溃散一角',
          }[defeatResult.setback.type] || '道伤缠身';
          setbackLines.push(
            `【天骄道伤】${typeText}！`,
            `自第${defeatResult.setback.startedAtWorldYear}年起闭关养伤千载，伤愈之前不再精进。`,
          );
          if (defeatResult.setback.lostGrowth) {
            setbackLines.push(defeatResult.setback.lostGrowth);
          }
        }
        
        const hatredResult = await this.addHatred(tianjiaoName, usr_qq, '挑战成功');
        if (zhuxianTianjiao) {
          hatredResult.new = Math.max(0, hatredResult.new - 50);
          hatredResult.gain = hatredResult.new - hatredResult.old; // 同步展示用增量（含-50减免）
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
          panguTalismanShattered
            ? `【盘古幡·开天碎宝】开天气刃斩碎${this.getEscapeTreasure(tianjiaoName)}，此宝本世无法再护体！`
            : '',
          tianjiaoProgress.source === '岁云常青'
            ? talismanTriggered
              ? '【岁云常青】月华余剑追入战局，却被护体法宝截住，本次未能斩落天骄气血。'
              : '【岁云常青】月华不熄，余剑长鸣，一缕清辉追过散去的战影，再斩天骄气血。'
            : '',
          talismanTriggered 
            ? `护体法宝生效，天骄血量未减少，当前剩余${status.currentHP}%`
            : `天骄血量减少${tianjiaoProgress.win}%，当前剩余${status.currentHP}%`,
          `仇恨值${hatredResult.gain >= 0 ? '+' : ''}${hatredResult.gain}（当前：${hatredResult.new}，关系：${newLevel}）`
        ].filter(Boolean);
        if (setbackLines.length > 0) winMsg.push(...setbackLines);
        await e.reply(winMsg.join('\n'));

        // 检查天骄是否被彻底击败
        if (status.currentHP <= 0) {
          // 先检查护道人触发（基于血量的线性概率）
          const protectorResult = await this.triggerProtector(e, tianjiaoName, tianjiaoData, player, status.currentHP, sourceField, hatredLevel);
          
          if (protectorResult.triggered) {
            if (protectorResult.escaped) {
              // 天骄被护道人救走逃脱
              status.currentHP = 100;
              status.isAlive = false;
              const shortReviveTime = Date.now() + this.escapeRefreshMs;
              await redis.set(escapeKey, shortReviveTime.toString());
              await redis.del(globalReviveKey);
              
              await redis.set(statusKey, JSON.stringify(status));
              await redis.set(`xiuxian:player:${usr_qq}:BOSSCD`, now_Time.toString());
              WorldBOSSBattleLock = 0;
              return true;
            } else if (protectorResult.protectorWon) {
              // 被护道人击败：天骄恢复30%气血，本次讨伐结束
              status.currentHP = Math.min(100, Math.max(0, Number(status.currentHP) || 0) + 30);
              await redis.set(statusKey, JSON.stringify(status));
              await e.reply([
                `【护道人护主】`,
                `${tianjiaoName}被护道人救下，服用秘药稳住伤势，恢复30%气血！`,
                `当前剩余：${status.currentHP}%`,
                `（下次讨伐需从 ${status.currentHP}% 血继续）`,
              ].join('\n'));
              await redis.set(`xiuxian:player:${usr_qq}:BOSSCD`, now_Time.toString());
              WorldBOSSBattleLock = 0;
              return true;
            }
          }
          
          // 无护道人触发或护道人被击败，天骄彻底死亡
          tianjiaoDefeated = true;
          await this.distributeNormalBattleDrops(e, tianjiaoName, tianjiaoData, usr_qq, panguRewardMultiplier, battleId);
          const defeatSettlement = await this.finalizeTianjiaoDefeat(e, {
            tianjiaoName,
            tianjiaoData,
            status,
            statusKey,
            globalReviveKey,
            killerQQ: usr_qq,
            rewardMultiplier: panguRewardMultiplier,
          });
          rewardSettlementId = defeatSettlement.settlementId;
        } else {
          await this.distributeNormalBattleDrops(e, tianjiaoName, tianjiaoData, usr_qq, panguRewardMultiplier, battleId);
        }

        // 计算奖励
        let reward = 10000;
        let zuizhong = getExtraCultivationLevelSum(A_player) * A_player.level_id * A_player.Physique_id * reward * panguRewardMultiplier;

        // 发放胜利奖励
        const rewardCalls = [
          () => Add_灵石(usr_qq, 15000000 * panguRewardMultiplier, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, rewardSettlementId, usr_qq, 'victory', '灵石'),
          }),
          () => Add_源石(usr_qq, 5000000 * panguRewardMultiplier, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, rewardSettlementId, usr_qq, 'victory', '源石'),
          }),
          () => Add_修为(usr_qq, zuizhong, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, rewardSettlementId, usr_qq, 'victory', '修为'),
          }),
          () => Add_血气(usr_qq, zuizhong, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, rewardSettlementId, usr_qq, 'victory', '血气'),
          }),
        ];
        for (let index = 0; index < rewardCalls.length; index++) {
          try {
            await rewardCalls[index]();
          } catch (error) {
            console.warn(`[天骄奖励] ${tianjiaoName} 奖励${index}发放失败:`, error);
          }
        }

        let rewardMsg = [
          `成功战胜${tianjiaoName}！获得奖励：`,
          `灵石：${1500 * panguRewardMultiplier}万`,
          `源石：${500 * panguRewardMultiplier}万`,
          `修为：${bigNumberTransform(zuizhong)}`,
          `血气：${bigNumberTransform(zuizhong)}`
        ];

        // 斗字秘随熟练度提升推演概率，成功后从最新存档写入，避免覆盖本场奖励。
        const registeredGongfa = new Set([
          ...(data.gongfa_list || []),
          ...(data.timegongfa_list || []),
          ...(data.dijingList || []),
          ...(data.jineng1 || []).filter(skill => skill.class === '功法'),
          ...(data.jineng2 || []).filter(skill => skill.class === '功法'),
          ...(data.jineng_heal || []).filter(skill => skill.class === '功法'),
          ...(data.jineng3 || []).filter(skill => skill.class === '功法'),
        ].map(item => item.name));
        const targetGongfa = (tianjiaoData.学习的功法 || [])
          .filter(name => registeredGongfa.has(name));
        const mimic = await withPlayerMutationLock(usr_qq, async () => {
          const douziPlayer = await Read_player(usr_qq);
          const result = tryLearnTianjiaoGongfa(douziPlayer, targetGongfa);
          if (result.ok) {
            await Write_player(usr_qq, douziPlayer);
            await player_efficiency(usr_qq);
          }
          return result;
        });
        const mimicChance = mimic.chance;
        if (mimicChance > 0) {
          rewardMsg.push(`斗字秘推演概率：${(mimicChance * 100).toFixed(2)}%`);
          if (mimic.ok) {
            const newSkill = mimic.name;
            let skillDescription = '';
            if (newSkill.includes('拳') || newSkill.includes('掌')) {
              skillDescription = `拳掌交锋间，斗字秘运转到极致，演化出${newSkill}的无上奥义！`;
            } else if (newSkill.includes('剑') || newSkill.includes('刀')) {
              skillDescription = `兵器碰撞的刹那，斗字秘捕捉到${newSkill}的剑意道痕，将其烙印在识海！`;
            } else if (newSkill.includes('秘') || newSkill.includes('诀')) {
              skillDescription = `斗字秘推演万法，在生死搏杀中洞悉${newSkill}的运转轨迹！`;
            } else if (newSkill.includes('经') || newSkill.includes('法')) {
              skillDescription = `古经轰鸣，道音阵阵，斗字秘逆推${newSkill}的完整传承！`;
            } else {
              skillDescription = `斗战圣法演化到极致，在战斗中领悟${newSkill}的真谛！`;
            }
            rewardMsg.push([
              '【斗字秘·演化万法】',
              '九秘之斗字秘自行运转，将交战中捕捉到的道痕层层拆解。',
              skillDescription,
              `领悟功法：【${newSkill}】（熟练度0）`,
              '此法初得其形，仍需在战斗或功法参悟中修至圆满。',
            ].join('\n'));
          } else if (mimic.reason === 'mastered') {
            rewardMsg.push(`你已掌握${tianjiaoName}当前所有可演化功法，斗字秘无新法可参。`);
          }
        }

        await e.reply(rewardMsg.join('\n'));

        if (tianjiaoDefeated) {
          const progression = await withPlayerMutationLock(usr_qq, async () => {
            const latestPlayer = await Read_player(usr_qq);
            const passTrial = recordWenXianTrial(latestPlayer, 'tianjiao');
            const devour = absorbTuntianSource(latestPlayer, {
              类型: '天骄本源',
              目标: tianjiaoName,
            });
            if (passTrial.changed || devour.gained) await Write_player(usr_qq, latestPlayer);
            return { devour };
          });
          const { devour } = progression;
          if (devour.gained) {
            await e.reply([
              '【吞天魔功·猎杀天骄】',
              `大道宝瓶吞尽${tianjiaoName}的天骄本源。`,
              `吞天本源：${devour.count}/${devour.target}｜魔道值 +20`,
              devour.evolved ? '万般体质熔炼归一，你已蜕变为【混沌体】！' : '',
            ].filter(Boolean).join('\n'));
          } else if (devour.reason === 'avatar_loaded') {
            await e.reply(`当前正装载化身【${devour.avatarName}】，本次未吸收天骄本源；请先发送 #装载化身 本源。`);
          }
        }

        this.persistTianjiaoList();

      } else {
        // 玩家失败
        status.currentHP = Math.max(0, status.currentHP - tianjiaoProgress.lose);
        if (status.currentHP <= 0) {
          tianjiaoDefeated = true;
          await this.finalizeTianjiaoDefeat(e, {
            tianjiaoName,
            tianjiaoData,
            status,
            statusKey,
            globalReviveKey,
            killerQQ: usr_qq,
          });
          await e.reply(`${tianjiaoName}在交战中耗尽最后一丝生机，已入轮回结算。`);
        }
        const hatredResult = tianjiaoDefeated
          ? { gain: 0, new: 0 }
          : await this.addHatred(tianjiaoName, usr_qq, '挑战失败');
        const newLevel = tianjiaoDefeated ? '轮回' : this.getHatredLevel(hatredResult.new);

        // 天骄污损与参悟：败北时概率触发（仅针对百分比装备，温和可逆）
        if (!tianjiaoDefeated) {
          await this.rollTianjiaoTaint(e, tianjiaoData, usr_qq, player);
        }

        // 发送胜利嘲讽
        const tauntDialogue = this.getRandomDialogue(tianjiaoData, '胜利嘲讽');
        if (tauntDialogue) {
          await e.reply(`${tianjiaoName}:「${tauntDialogue}」`);
        }

        await e.reply([
          `你未能战胜${tianjiaoName}，天骄血量减少${tianjiaoProgress.lose}%，当前剩余${status.currentHP}%${tianjiaoProgress.source === '岁云常青' ? '（岁云常青·剑意未散）' : ''}`,
          `仇恨值${hatredResult.gain >= 0 ? '+' : ''}${hatredResult.gain}（当前：${hatredResult.new}，关系：${newLevel}）`
        ].join('\n'));

        // 计算失败奖励
        let reward = 10;
        let zuizhong = getExtraCultivationLevelSum(A_player) * A_player.level_id * A_player.Physique_id * reward;

        const failureRewards = [
          () => Add_源石(usr_qq, 1000000, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, battleId, usr_qq, 'failure', '源石'),
          }),
          () => Add_灵石(usr_qq, 3000000, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, battleId, usr_qq, 'failure', '灵石'),
          }),
          () => Add_修为(usr_qq, zuizhong, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, battleId, usr_qq, 'failure', '修为'),
          }),
          () => Add_血气(usr_qq, zuizhong, {
            idempotencyKey: this.getTianjiaoRewardIdempotencyKey(tianjiaoName, battleId, usr_qq, 'failure', '血气'),
          }),
        ];
        for (let index = 0; index < failureRewards.length; index++) {
          try {
            await failureRewards[index]();
          } catch (error) {
            console.warn(`[天骄失败奖励] ${tianjiaoName} 奖励${index}发放失败:`, error);
          }
        }

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
      clearWorldBOSSBattleUnlockTimer();
      WorldBOSSBattleLock = 0;
      try {
        if (await redis.get(distributedLockKey) === distributedLockToken) {
          await redis.del(distributedLockKey);
        }
      } catch (error) {
        console.warn('[天骄战斗锁] 分布式锁释放失败:', error);
      }
    }

    return true;
  }

  // ========== 贡献榜奖励分发 ==========

  async distributeContributionRewards(e, tianjiaoName, tianjiaoData, killerQQ, settlementId = Date.now().toString()) {
    const damageKey = `tianjiao:damage:${tianjiaoName}`;
    const contributors = await this.getDamageRankings(damageKey);

    if (contributors.length === 0) {
      await redis.del(damageKey);
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

      const rewards = await this.giveRandomItems(contributor.qq, tianjiaoData, rewardCount, settlementId, 'contribution');
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
      const extraRewards = await this.giveRandomItems(killerQQ, tianjiaoData, extraRewardCount, settlementId, 'killer-extra');

      if (extraRewards.length > 0) {
        const killerName = await this.getPlayerName(killerQQ);
        rewardMessages.push(`击杀者${killerName}获得额外奖励: ${extraRewards.join('、')}`);
      }
    }

    try {
      if (rewardMessages.length > 1) await ForwardMsg(e, rewardMessages);
    } catch (error) {
      console.warn(`[天骄贡献奖励] ${tianjiaoName} 奖励消息发送失败:`, error);
    } finally {
      await redis.del(damageKey);
    }
  }

  async giveRandomItems(qq, tianjiaoData, count, settlementId = Date.now().toString(), rewardKind = 'random') {
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
        itemPool = rareItems.length > 0 ? rareItems : baseItems;
      }
      if (itemPool.length === 0) continue;

      const randomIndex = Math.floor(Math.random() * itemPool.length);
      const item = itemPool[randomIndex];
      const actualProbability = item.概率 >= 0.5 ? 1.0 : item.概率;

      try {
        if (Math.random() < actualProbability) {
          const amount = rollTianjiaoDropAmount(item);
          const idempotencyKey = this.getTianjiaoRewardIdempotencyKey(tianjiaoData.名号 || 'unknown', settlementId, qq, rewardKind, i);
          const display = await this.grantTianjiaoDrop(qq, item, amount, idempotencyKey);
          if (display) rewards.push(display.replace(' x', 'x'));
          hasDropped = true;
        }
      } catch (itemError) {
        console.warn(`发放物品失败: ${item.name}`, itemError);
      }
    }

    const fallbackItems = baseItems.length > 0 ? baseItems : rareItems;
    if (!hasDropped && fallbackItems.length > 0) {
      const fallbackIndex = Math.floor(Math.random() * fallbackItems.length);
      const fallbackItem = fallbackItems[fallbackIndex];
      try {
        const amount = rollTianjiaoDropAmount(fallbackItem);
        const idempotencyKey = this.getTianjiaoRewardIdempotencyKey(tianjiaoData.名号 || 'unknown', settlementId, qq, `${rewardKind}-fallback`);
        const display = await this.grantTianjiaoDrop(qq, fallbackItem, amount, idempotencyKey);
        if (display) rewards.push(`${display.replace(' x', 'x')}（保底奖励）`);
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
    await this.checkTianjiaoReincarnation();

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
    const globalReviveTime = Number(await redis.get(globalReviveKey)) || 0;
    const escapeTime = Number(await redis.get(this.getTianjiaoEscapeKey(tianjiaoName))) || 0;
    const blockedUntil = Math.max(globalReviveTime, escapeTime);

    if (blockedUntil && Date.now() < blockedUntil) {
      e.reply(`${tianjiaoName}已被击败，暂无贡献数据`);
      return false;
    }

    const statusKey = `tianjiao:status:${tianjiaoName}`;
    let status = await redis.get(statusKey);
    status = JSON.parse(status || '{}');

    if (!status.isAlive && escapeTime && escapeTime <= Date.now()) {
      status.currentHP = 100;
      status.isAlive = true;
      await redis.set(statusKey, JSON.stringify(status));
    }

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
    await redis.del(`tianjiao:global:escape:${tianjiao.名号}`);
    await redis.del(`tianjiao:reincarnation:announced:${tianjiao.名号}`);
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

function clearWorldBOSSBattleUnlockTimer() {
  if (WorldBOSSBattleUnLockTimer) {
    clearTimeout(WorldBOSSBattleUnLockTimer);
    WorldBOSSBattleUnLockTimer = 0;
  }
}

async function SetWorldBOSSBattleUnLockTimer(e, lockToken) {
  clearWorldBOSSBattleUnlockTimer();
  WorldBOSSBattleUnLockTimer = setTimeout(() => {
    if (WorldBOSSBattleLock === 1 && WorldBOSSBattleLockToken === lockToken) {
      WorldBOSSBattleLock = 0;
      WorldBOSSBattleUnLockTimer = 0;
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

async function sendFightImages(e, messages) {
  const pageSize = 20;
  const battleMessages = (Array.isArray(messages) ? messages : [messages ?? ''])
    .map(message => String(message ?? ''));

  for (let start = 0; start < battleMessages.length; start += pageSize) {
    const image = await get_fight_img(e, battleMessages.slice(start, start + pageSize));
    if (image) await e.reply(image);
    if (start + pageSize < battleMessages.length) await sleep(250);
  }
}

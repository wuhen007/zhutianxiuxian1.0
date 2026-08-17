/* ==========================================
 * yuanshen.js  —— 元神体系（完整版 v2.0）
 * 灵感来源：完美世界/遮天/圣墟/深空彼岸/阳神
 * 
 * 新增功能：
 *   - 功法体系扩展（15个功法，5种类型）
 *   - 淬炼/爆发/护体新命令
 *   - 精神宇宙入口（神识云游）
 * ========================================== */
import { plugin, data } from '../../api/api.js';
import {
  existplayer,
  Read_najie,
  Read_player,
  Write_najie,
  Write_player,
  bigNumberTransform
} from '../../model/xiuxian.js';
import {
  getMinggeEffects,
  calculateMinggeYield,
  calculateMinggeChance,
  getMinggeDirectMultiplier,
  getMinggeEffectNumber,
} from '../../model/mingge.js';
import { getExtraCultivationLevelSum } from '../../model/extraCultivation.js';
import { getRealmAuthorityLevel, getYuanshenAdvancement } from '../../model/realmAuthority.js';
import {
  SPIRIT_HEART_ENTRY_COST,
  consumeSpiritHeartEntry,
  createSpiritFinding,
  createSpiritJourney,
  getSpiritHeartCost,
  getSpiritHeartRecoveryMs,
  getSpiritChoice,
  getSpiritInsightRequirement,
  getSpiritLegacyChance,
  getSpiritRetentionRate,
  increaseSpiritHeartLimit,
  mergeSpiritItemsIntoNajie,
  normalizeSpiritJourney,
  pickWeightedDrop,
  refreshSpiritHeart,
  resolveSpiritChoice,
  resolveSpiritGuardianBattle,
  retainSpiritFindings,
  shouldTriggerSpiritLegacy,
} from '../../model/spiritUniverse.js';
import {
  consumeXuanhuangGuard,
  getInnerWorldOpenChance,
  getInnerWorldYieldMultiplier,
} from '../../model/innateTreasure.js';
import { applyQuestionFortuneCost } from '../../model/redDustFortune.js';

/* =========================================================
 * 1. 功法配置表（全局）—— 五大类型
 * ========================================================= */
const YUANSHEN_SKILLS = {
  /* ---------- 恢复类：缓慢恢复元神 ---------- */
  '前字秘':              { cd: 240, ratio: 0.20, type: '恢复' },
  '太一凝神诀':          { cd: 180, ratio: 0.08, type: '恢复' },
  '涅槃法门·残缺':       { cd: 360, ratio: 0.01, type: '恢复' },
  '涅槃法门':            { cd: 240, ratio: 0.10, type: '恢复' },
  '神火淬魂法':          { cd: 300, ratio: 0.12, type: '恢复' },   // 神火祭坛掉落
  '观照经':              { cd: 200, ratio: 0.06, type: '恢复' },
  '太虚蕴神经':          { cd: 240, ratio: 0.10, type: '恢复' },   // 灵界裂缝掉落

  /* ---------- 淬炼类：消耗元神提升元神上限 ---------- */
  '九劫玄身':            { cd: 720,  ratio: 0.15, type: '淬炼', boost: 0.05 },
  '九灭重生经':          { cd: 1440, ratio: 0.20, type: '淬炼', boost: 0.10 },
  '帝印炼神诀':          { cd: 1080, ratio: 0.18, type: '淬炼', boost: 0.08 },  // 帝印残墟
  '葬仙经':              { cd: 1440, ratio: 0.25, type: '淬炼', boost: 0.12 },  // 真仙坟场

  /* ---------- 爆发类：消耗元神临时增强战斗（PVP/BOSS） ---------- */
  '神灵斩劫经':          { cd: 480,  type: '爆发', cost: 0.15, dmg_boost: 0.25 },
  '劫运神拳':            { cd: 600,  type: '爆发', cost: 0.20, dmg_boost: 0.30 },

  /* ---------- 防御类：消耗元神生成护盾抵挡道伤 ---------- */
  '元神盾':              { cd: 360,  type: '防御', cost: 0.10, daoshang_block: 0.5 },
  '九劫雷符':            { cd: 600,  type: '防御', cost: 0.15, daoshang_block: 0.7 },  // 九劫雷池

  /* ---------- 神游类：提升精神宇宙探索效率 ---------- */
  '搜魂大法':            { cd: 300,  type: '神游', event_bonus: 0.15 },
  '花粉蜕变经':          { cd: 480,  type: '神游', depth_bonus: 1 },   // 花粉天路
  '十二万九千六百念经':  { cd: 600,  type: '神游', event_bonus: 0.20 }, // 念头星河
};

export class yuanshentixi extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_yuanshentixi',
      dsc:  '元神体系模块 v2.0',
      event: 'message',
      priority: 600,
      rule: [
        /* ---- 内景地 ---- */
        { reg: '^#开启内景地$',                fnc: 'neijing' },
        { reg: '^#进入内景地$',                fnc: 'jinruneijing' },
        { reg: '^#内景地修炼(\\*(\\d+))?$',     fnc: 'neijingBatch' },
        /* ---- 元神基础 ---- */
        { reg: '^#凝练元神$',                  fnc: 'ninglianyuanshen' },
        { reg: '^#我的元神$',                  fnc: 'yuanshen' },
        /* ---- 功法修炼（五大类） ---- */
        { reg: '^以\\S+修炼元神$',             fnc: 'xiulianyuanshen' },
        { reg: '^以\\S+淬炼元神$',             fnc: 'cuilianyuanshen' },
        { reg: '^以\\S+元神爆发$',             fnc: 'yuanshenbaofa' },
        { reg: '^以\\S+元神护体$',             fnc: 'yuanshenhuti' },
        /* ---- 精神宇宙（神识云游） ---- */
        { reg: '^#精神宇宙$',                  fnc: 'jingshenyuzhou' },
        { reg: '^#神游\\S+$',                  fnc: 'shenyouEnter' },
        { reg: '^#观想$',                      fnc: 'shenyouGuanxiang' },
        { reg: '^#抉择[1-3]$',                 fnc: 'shenyouChoose' },
        { reg: '^#深入$',                      fnc: 'shenyouDeep' },
        { reg: '^#归位$',                      fnc: 'shenyouReturn' },
        { reg: '^#神识状态$',                  fnc: 'shenyouStatus' },
      ]
    });
  }

  /* =========================================================
   * 通用：校验玩家 + CD检查
   * ========================================================= */
  async _validatePlayer(e, needYuanshen = true) {
    if (!e.isGroup) return { err: '修仙游戏请在群聊中游玩' };
    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!await existplayer(usr_qq)) return { err: '玩家不存在，请先创建角色' };
    const player = await Read_player(usr_qq);
    if (needYuanshen && player.yuanshenlevel_id == null)
      return { err: '你尚未凝练元神，无法进行此操作' };
    return { usr_qq, player };
  }

  _checkCd(skillName, usr_qq, cfg) {
    const now = Date.now();
    const cdKey = `xiulian_${skillName}_${usr_qq}`;
    const cdMs  = cfg.cd * 60 * 1000;
    return { now, cdKey, cdMs };
  }

  async _doCdCheck(skillName, usr_qq, cfg) {
    const { now, cdKey, cdMs } = this._checkCd(skillName, usr_qq, cfg);
    const last = await redis.get(cdKey);
    if (last && now - last < cdMs) {
      const remainMin = Math.ceil((cdMs - (now - last)) / 1000 / 60);
      const h = Math.floor(remainMin / 60);
      const m = remainMin % 60;
      const str = h > 0 ? `${h}小时${m}分钟` : `${m}分钟`;
      return { blocked: true, msg: `【${skillName}】尚在冷却，还需 ${str}` };
    }
    return { blocked: false, now, cdKey };
  }

  _matchSkill(e, regex, typeFilter = null) {
    const msg = e.msg.replace(/\s/g, '');
    const m = msg.match(regex);
    if (!m) return null;
    const skillName = m[1];
    if (!player) return { skillName, err: null };
    // typeFilter: null=不筛选, 指定类型必须匹配
    const cfg = YUANSHEN_SKILLS[skillName];
    if (!cfg) return { skillName, err: `【${skillName}】暂无对应的元神法门` };
    if (typeFilter && cfg.type !== typeFilter)
      return { skillName, err: `【${skillName}】不是${this._typeName(typeFilter)}，无法使用此命令` };
    return { skillName, cfg };
  }

  _typeName(type) {
    const map = { '恢复':'恢复类功法','淬炼':'淬炼类功法','爆发':'爆发类功法','防御':'防御类功法','神游':'神游类功法' };
    return map[type] || '功法';
  }

  /* =========================================================
   * 以 xxx 修炼元神（恢复类 | 通用恢复）
   * ========================================================= */
  async xiulianyuanshen(e) {
    const v = await this._validatePlayer(e);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    const msg = e.msg.replace(/\s/g, '');
    const m = msg.match(/^以(\S+)修炼元神$/);
    if (!m) return;
    const skillName = m[1];

    if (!p.学习的功法.includes(skillName))
      return e.reply(`你尚未掌握【${skillName}】，无法以此修炼元神`);

    const cfg = YUANSHEN_SKILLS[skillName];
    if (!cfg) return e.reply(`【${skillName}】暂无元神修炼法门`);
    // 恢复类 + 未分类的都走恢复逻辑（兼容旧版）
    if (cfg.type && cfg.type !== '恢复')
      return e.reply(`【${skillName}】是${this._typeName(cfg.type)}，请使用对应的命令`);

    const 上限 = p.元神上限 || 0;
    if (上限 <= 0) return e.reply('元神上限异常，请先凝练元神');

    const cdCheck = await this._doCdCheck(skillName, usr_qq, cfg);
    if (cdCheck.blocked) return e.reply(cdCheck.msg);

    let add = Math.ceil(上限 * cfg.ratio);

    // ==== 命格消费层：元神修炼加成 ====
    const minggeEffects = getMinggeEffects(p, data.minggeList);
    const yuanshenBonus = minggeEffects?.['元神修炼加成'] || 0;
    if (yuanshenBonus !== 0) {
      add = calculateMinggeYield(add, minggeEffects, '元神修炼加成');
    }

    p.元神 = (p.元神 || 0) + add;
    await Write_player(usr_qq, p);
    await redis.set(cdCheck.cdKey, cdCheck.now);

    let replyMsg =
      `你运转【${skillName}】，紫府中元神之光渐盛，\n元神恢复 ${bigNumberTransform(add)}（当前：${bigNumberTransform(p.元神)}/${bigNumberTransform(上限)}）`;
    if (yuanshenBonus !== 0) {
      replyMsg += `\n命格·元神通玄：修炼效率 +${Math.round(yuanshenBonus * 100)}%`;
    }

    return e.reply(replyMsg);
  }

  /* =========================================================
   * 以 xxx 淬炼元神（淬炼类）
   *   消耗：元神上限 * ratio 的元神
   *   收益：元神上限 * boost
   * ========================================================= */
  async cuilianyuanshen(e) {
    const v = await this._validatePlayer(e);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    const msg = e.msg.replace(/\s/g, '');
    const m = msg.match(/^以(\S+)淬炼元神$/);
    if (!m) return;
    const skillName = m[1];

    if (!p.学习的功法.includes(skillName))
      return e.reply(`你尚未掌握【${skillName}】`);

    const cfg = YUANSHEN_SKILLS[skillName];
    if (!cfg || cfg.type !== '淬炼')
      return e.reply(`【${skillName}】不是淬炼类功法`);

    const 上限 = p.元神上限 || 0;
    if (上限 <= 0) return e.reply('元神上限异常');
    const cost = Math.ceil(上限 * cfg.ratio);
    if ((p.元神 || 0) < cost)
      return e.reply(`淬炼需要消耗 ${bigNumberTransform(cost)} 元神，你当前仅 ${bigNumberTransform(p.元神||0)}`);

    const cdCheck = await this._doCdCheck(skillName, usr_qq, cfg);
    if (cdCheck.blocked) return e.reply(cdCheck.msg);

    p.元神 -= cost;
    const boostVal = Math.ceil(上限 * cfg.boost);
    p.元神上限 += boostVal;
    await Write_player(usr_qq, p);
    await redis.set(cdCheck.cdKey, cdCheck.now);

    return e.reply([
      `你以【${skillName}】淬炼元神，`,
      `元神之火在紫府中熊熊燃烧——`,
      `消耗元神：${bigNumberTransform(cost)}`,
      `元神上限提升：+${bigNumberTransform(boostVal)}`,
      `当前元神上限：${bigNumberTransform(p.元神上限)}`,
    ].join('\n'));
  }

  /* =========================================================
   * 以 xxx 元神爆发（爆发类）
   *   消耗：元神上限 * cost 的元神
   *   效果：设置临时buff到redis（5分钟有效）
   * ========================================================= */
  async yuanshenbaofa(e) {
    const v = await this._validatePlayer(e);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    const msg = e.msg.replace(/\s/g, '');
    const m = msg.match(/^以(\S+)元神爆发$/);
    if (!m) return;
    const skillName = m[1];

    if (!p.学习的功法.includes(skillName))
      return e.reply(`你尚未掌握【${skillName}】`);

    const cfg = YUANSHEN_SKILLS[skillName];
    if (!cfg || cfg.type !== '爆发')
      return e.reply(`【${skillName}】不是爆发类功法`);

    const 上限 = p.元神上限 || 0;
    const cost = Math.ceil(上限 * cfg.cost);
    if ((p.元神 || 0) < cost)
      return e.reply(`爆发需要消耗 ${bigNumberTransform(cost)} 元神，你当前仅 ${bigNumberTransform(p.元神||0)}`);

    const cdCheck = await this._doCdCheck(skillName, usr_qq, cfg);
    if (cdCheck.blocked) return e.reply(cdCheck.msg);

    p.元神 -= cost;
    const buff = {
      type: '元神爆发',
      skill: skillName,
      dmg_boost: cfg.dmg_boost,
      end_time: Date.now() + 5 * 60 * 1000,  // 5分钟
    };
    await redis.set(`yuanshen:buff:${usr_qq}`, JSON.stringify(buff));
    await Write_player(usr_qq, p);
    await redis.set(cdCheck.cdKey, cdCheck.now);

    return e.reply([
      `【${skillName}·元神爆发！】`,
      `你燃烧元神，紫府中的精神之火冲天而起——`,
      `消耗元神：${bigNumberTransform(cost)}`,
      `战斗伤害加成：+${Math.round(cfg.dmg_boost * 100)}%`,
      `持续时间：5分钟`,
      `「一念花开，君临天下！」`,
    ].join('\n'));
  }

  /* =========================================================
   * 以 xxx 元神护体（防御类）
   *   消耗：元神上限 * cost 的元神
   *   效果：生成道伤护盾（redis存储，持续30分钟）
   * ========================================================= */
  async yuanshenhuti(e) {
    const v = await this._validatePlayer(e);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    const msg = e.msg.replace(/\s/g, '');
    const m = msg.match(/^以(\S+)元神护体$/);
    if (!m) return;
    const skillName = m[1];

    if (!p.学习的功法.includes(skillName))
      return e.reply(`你尚未掌握【${skillName}】`);

    const cfg = YUANSHEN_SKILLS[skillName];
    if (!cfg || cfg.type !== '防御')
      return e.reply(`【${skillName}】不是防御类功法`);

    const 上限 = p.元神上限 || 0;
    const cost = Math.ceil(上限 * cfg.cost);
    if ((p.元神 || 0) < cost)
      return e.reply(`护体需要消耗 ${bigNumberTransform(cost)} 元神，你当前仅 ${bigNumberTransform(p.元神||0)}`);

    const cdCheck = await this._doCdCheck(skillName, usr_qq, cfg);
    if (cdCheck.blocked) return e.reply(cdCheck.msg);

    p.元神 -= cost;
    const shield = {
      type: '元神护体',
      skill: skillName,
      daoshang_block: cfg.daoshang_block,   // 抵挡道伤的比例
      end_time: Date.now() + 30 * 60 * 1000, // 30分钟
    };
    await redis.set(`yuanshen:shield:${usr_qq}`, JSON.stringify(shield));
    await Write_player(usr_qq, p);
    await redis.set(cdCheck.cdKey, cdCheck.now);

    return e.reply([
      `【${skillName}·元神护体！】`,
      `你以元神之力在周身凝聚出一层无形的精神护罩——`,
      `消耗元神：${bigNumberTransform(cost)}`,
      `道伤抵挡：${Math.round(cfg.daoshang_block * 100)}%`,
      `持续时间：30分钟`,
      `「万法不侵，诸邪避退！」`,
    ].join('\n'));
  }

  /* =========================================================
   * #我的元神
   * ========================================================= */
  async yuanshen(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;
    const heart = refreshSpiritHeart(p);
    await Write_player(usr_qq, p);

    let 元神状态 = "尚未凝练";
    let 元神等级名称 = "无";

    if (p.yuanshenlevel_id === undefined || p.yuanshenlevel_id === null) {
      元神状态 = "你还没有凝练元神";
    } else {
      const 元神等级数据 = data.Levelyuanshen_list.find(
        item => item.level_id == p.yuanshenlevel_id
      );
      if (!元神等级数据) {
        元神状态 = "元神等级数据异常，请重新凝练";
      } else {
        元神等级名称 = 元神等级数据.level;
        元神状态 = "已凝练";
      }
    }

    // 列出可用的元神功法
    const ownedSkills = (p.学习的功法 || []).filter(s => YUANSHEN_SKILLS[s]);
    const skillList = ownedSkills.map(s => {
      const cfg = YUANSHEN_SKILLS[s];
      return `  · ${s}（${cfg.type || '恢复'}）`;
    }).join('\n');

    let 回复信息 = [
      `【${p.名号} 元神状态】`,
      `元神强度：${bigNumberTransform(p.元神 || 0)}/${bigNumberTransform(p.元神上限 || 0)}`,
      `元神等级：${元神等级名称}`,
      `神识强度：${bigNumberTransform(p.神识 || 0)}点`,
      `心神：${heart.current}/${heart.max}（每${getSpiritHeartRecoveryMs(p) / 60000}分钟恢复1点${p.问道仙宫 ? '，问道仙宫加持' : ''}）`,
      `状态：${元神状态}`,
    ];

    if (skillList) {
      回复信息.push(`可用元神功法：\n${skillList}`);
    } else if (元神状态 === '已凝练') {
      回复信息.push(`可用元神功法：无（去精神宇宙获取吧）`);
    }

    e.reply(回复信息.join("\n"));
  }

  /* =========================================================
   * #开启内景地
   * ========================================================= */
  async neijing(e) {
    const v = await this._validatePlayer(e);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    if (p.内景地 == 1) return e.reply(`你的内景地已然开启`);

    let 要求 = 15000000 * getExtraCultivationLevelSum(p);

    // ==== 命格消费层：内景地消耗倍率（direct-multiplier，默认 1）====
    const minggeEffects = getMinggeEffects(p, data.minggeList);
    const costMult = getMinggeDirectMultiplier(minggeEffects, '内景地消耗倍率');
    要求 = Math.floor(要求 * costMult);
    要求 = applyQuestionFortuneCost(p, 要求);
    if (p.元神 <= 要求) {
      let 相差 = 要求 - p.元神;
      return e.reply(`你的元神并不足以开启内景地，开启内景地需要${bigNumberTransform(要求)}，你只有${bigNumberTransform(p.元神)}，还差${bigNumberTransform(相差)}`);
    }

    // ==== 命格消费层：内景地开启概率（chance，叠加在元神等级基础之上）====
    const baseProbability = 0.1;
    const baseProb = baseProbability + p.yuanshenlevel_id * 0.1;
    const minggeSuccessProbability = calculateMinggeChance(baseProb, minggeEffects, '内景地开启概率', { max: 1 });
    const successProbability = getInnerWorldOpenChance(minggeSuccessProbability, p);
    let 开启概率 = successProbability * 100;
    let 元神加成 = (p.yuanshenlevel_id * 0.1) * 100;
    const fateOpenChance = getMinggeEffectNumber(minggeEffects, '内景地开启概率');
    const fateYieldNote = getMinggeEffectNumber(minggeEffects, '内景地收益');
    const random = Math.random();
    const isSuccess = random <= successProbability;

    p.元神 -= 要求;
    consumeXuanhuangGuard(p);

    if (isSuccess) {
      p.内景地 = 1;
      await Write_player(usr_qq, p);
      const successLines = [
        `紫府洞开，黄庭初现！`,
        `你的思感超越了物质界限，进入「致虚极，守静笃」的境界，开启了道家黄庭内景地！`,
        `泥丸宫中显化三寸灵台，识海化作无垠星空`,
      ];
      if (fateOpenChance > 0) {
        successLines.push(
          `前世彼岸教祖的一缕真灵，于此刻再临黄庭——`,
          `万载因果翻涌，残破的教坛在识海深处重新矗立，`,
          `你以教祖之姿，于方寸之间再立一界，自此黄庭有主，彼岸可期。`
        );
      }
      return e.reply(successLines.join("\n"));
    } else {
      await Write_player(usr_qq, p);
      const failLines = [
        `你欲打坐入定，进入那种『玄妙之极』的境界`,
        `然玄关紧闭，神火将熄！`,
        `冲关瞬间灵台蒙尘，三尸神躁动反噬`,
        `终究未能开启内景`,
        `总开启概率:${开启概率}%`,
        `基础概率10%,元神等级加成${元神加成}%`,
      ];
      if (fateOpenChance > 0) {
        failLines.push(
          `纵有教祖残念暗助，此世玄关仍如铁壁——`,
          `彼岸花未开，黄泉路犹远，教祖之威暂敛，待你重凝元神再叩界门。`
        );
      }
      const fateLines = [];
      if (fateOpenChance > 0) fateLines.push(`命格·内景地开启概率加成 +${Math.round(fateOpenChance * 100)}%`);
      if (costMult !== 1) fateLines.push(`命格·内景地消耗倍率 ${Math.round(costMult * 100)}%（减免${Math.round((1 - costMult) * 100)}%）`);
      if (fateYieldNote > 0) fateLines.push(`命格·内景地收益 +${Math.round(fateYieldNote * 100)}%`);
      if (fateLines.length) failLines.push(...fateLines);
      return e.reply(failLines.join("\n"));
    }
  }

  /* =========================================================
   * #凝练元神
   * ========================================================= */
  async ninglianyuanshen(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    if (p.凝练次数 === undefined) p.凝练次数 = 1;
    let cishu = p.凝练次数;
    let baseexp = 15000000 * cishu;

    if (p.元神 < baseexp) {
      return e.reply([
        `当前元神强度：${bigNumberTransform(p.元神)}/${bigNumberTransform(baseexp)}`,
        `你的元神不够强大，难以将元神凝练变得更加强大！`,
        `你需要获取修炼元神的法门或去精神宇宙摘取天药让元神壮大。`,
        `提示：使用 #精神宇宙 查看可进入的精神位面`,
      ].join("\n"));
    }

    if (p.yuanshenlevel_id === undefined) {
      p.元神 -= baseexp;
      p.凝练次数 += 1;
      p.yuanshenlevel_id = 0;
      let 元神等级 = data.Levelyuanshen_list.find(
        item => item.level_id == p.yuanshenlevel_id
      ).level;
      await Write_player(usr_qq, p);
      return e.reply(`你成功凝练了元神，你目前的元神级别是${元神等级}！`);
    }

    if (p.yuanshenlevel_id >= 0) {
      const advancement = getYuanshenAdvancement(data.Levelyuanshen_list, p.yuanshenlevel_id);
      if (advancement.atMax) return e.reply('你的元神已凝练至当前最高境界！');
      const requiredAuthority = advancement.requiredAuthority;
      const authority = getRealmAuthorityLevel(p);
      if (authority <= 1) {
        return e.reply('你尚未开始修炼额外体系，无法再继续凝练元神！');
      }
      if (authority < requiredAuthority) {
        return e.reply(`你的额外体系道果不够强大，主修境界需达到${requiredAuthority}重天，方可凝练${advancement.next.level}！`);
      }

      p.元神 -= baseexp;
      p.凝练次数 += 1;
      p.yuanshenlevel_id = Number(advancement.next.level_id);
      await Write_player(usr_qq, p);
      return e.reply(`你成功凝练了元神，你目前的元神级别是${advancement.next.level}！`);
    }
  }

  /* =========================================================
   * #进入内景地
   * ========================================================= */
  async jinruneijing(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    if (getRealmAuthorityLevel(p) > 19) {
      const eraNames = ["神话时代", "乱古纪元", "仙古纪元", "末法时代"];
      const randomEra = eraNames[Math.floor(Math.random() * eraNames.length)];
      return e.reply([
        `${p.名号}眼眸开阖间有星河幻灭：`,
        `「自${randomEra}至今...」`,
        `「本座的道躯早已自成宇宙」`,
        `内景地飘落的道源粒子触体即散`,
        `化作点点星辉融入周天星辰`
      ].join('\n'));
    }

    if (p.内景地 === undefined || p.内景地 !== 1) {
      return e.reply([
        '「内景未开，道门紧闭」',
        `${p.名号}周身道纹明灭不定`,
        `需先使用 #开启内景地 方能进入`,
        `（当前内景状态：${p.内景地 ?? "未觉醒"}）`
      ].join('\n'));
    }

    let reward = 500000;
    let zuizhong = getExtraCultivationLevelSum(p) * p.level_id * p.Physique_id * reward;
    // ==== 命格消费层：内景地收益（bonus-rate，×1.3 并期望取整）====
    zuizhong = calculateMinggeYield(zuizhong, getMinggeEffects(p, data.minggeList), '内景地收益');
    zuizhong = Math.floor(zuizhong * getInnerWorldYieldMultiplier(p));
    p.修为 += zuizhong;
    p.血气 += zuizhong;
    p.神识 += zuizhong;
    let zuizhong2 = 0.1 * getExtraCultivationLevelSum(p);
    p.道伤 = Math.max(0, p.道伤 - zuizhong2);
    p.内景地 = 0;
    await Write_player(usr_qq, p);

    return e.reply([
      `【内景悟道·时溯千年】`,
      `${p.名号}盘坐内景地中，`,
      `见：`,
      `鹅毛大雪般的道源粒子飘落`,
      `时间长河在此流速缓慢`,
      `三魂七魄与大道共鸣`,
      `修炼成果：`,
      `一定程度消解生命之轮的道伤`,
      `修为淬炼 +${bigNumberTransform(zuizhong)}`,
      `血气升华 +${bigNumberTransform(zuizhong)}`,
      `神识蜕变 +${bigNumberTransform(zuizhong)}`,
      `「内景一瞬，外界千年」道音回荡`
    ].join('\n'));
  }

  /* =========================================================
   * #内景地修炼*N（批量）
   * ========================================================= */
  async neijingBatch(e) {
    if (!e.isGroup) return e.reply('修仙游戏请在群聊中游玩');
    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');
    const player = await Read_player(usr_qq);
    if (player.yuanshenlevel_id === undefined)
      return e.reply('你连元神都未凝练，谈何内景地？');

    const match = e.msg.match(/^#内景地修炼(?:\*(\d+))?$/);
    let times = 1;
    if (match && match[1]) times = Math.min(parseInt(match[1], 10), 50);
    if (times <= 0) return e.reply('次数必须≥1');

    let successCnt = 0, failCnt = 0, totalCost = 0;
    const msgs = [];

    if (getRealmAuthorityLevel(player) > 19) {
      const eraNames = ["神话时代", "乱古纪元", "仙古纪元", "末法时代"];
      const randomEra = eraNames[Math.floor(Math.random() * eraNames.length)];
      return e.reply([
        `${player.名号}眼眸开阖间有星河幻灭：`,
        `「自${randomEra}至今...」`,
        `「本座的道躯早已自成宇宙」`,
        `内景地飘落的道源粒子触体即散`,
        `化作点点星辉融入周天星辰`
      ].join('\n'));
    }

    // 命格消费层（批量与单次 neijing 保持一致）：内景地消耗倍率 / 内景地开启概率
    const batchMingge = getMinggeEffects(player, data.minggeList);
    const batchCostMult = getMinggeDirectMultiplier(batchMingge, '内景地消耗倍率');

    for (let i = 0; i < times; i++) {
      await Write_player(usr_qq, player);
      const 要求 = applyQuestionFortuneCost(
        player,
        Math.floor(15000000 * getExtraCultivationLevelSum(player) * batchCostMult)
      );
      if (player.元神 < 要求) {
        msgs.push(`【中止】第${i + 1}次：元神不足（需${bigNumberTransform(要求)}，仅剩${bigNumberTransform(player.元神)}）`);
        msgs.push(`剩余未执行：${times - i} 次`);
        break;
      }

      const prob = getInnerWorldOpenChance(
        calculateMinggeChance(0.1 + player.yuanshenlevel_id * 0.1, batchMingge, '内景地开启概率', { max: 1 }),
        player
      );
      const isWin = Math.random() <= prob;

      player.元神 -= 要求;
      consumeXuanhuangGuard(player);
      totalCost += 要求;

      if (isWin) {
        successCnt++;
        player.内景地 = 1;
        await Write_player(usr_qq, player);

        const reward = 500000;
        let zuizhong = getExtraCultivationLevelSum(player) * player.level_id * player.Physique_id * reward;
        // ==== 命格消费层：内景地收益（bonus-rate，×1.3 并期望取整）====
        zuizhong = calculateMinggeYield(zuizhong, getMinggeEffects(player, data.minggeList), '内景地收益');
        zuizhong = Math.floor(zuizhong * getInnerWorldYieldMultiplier(player));
        player.修为 += zuizhong;
        player.血气 += zuizhong;
        player.神识 += zuizhong;
        const zuizhong2 = 0.1 * getExtraCultivationLevelSum(player);
        player.道伤 = Math.max(0, player.道伤 - zuizhong2);
        player.内景地 = 0;
        msgs.push(`第${i + 1}次：开启成功，已进入内景地，获得修为/血气/神识 +${bigNumberTransform(zuizhong)}，道伤 -${zuizhong2.toFixed(1)}`);
      } else {
        failCnt++;
        msgs.push(`第${i + 1}次：开启失败，损失元神 ${bigNumberTransform(要求)}`);
      }
    }

    await Write_player(usr_qq, player);

    // 命格生效提示
    const fateNotes = [];
    if (batchCostMult !== 1) fateNotes.push(`命格·内景地消耗倍率 ${Math.round(batchCostMult * 100)}%（减免${Math.round((1 - batchCostMult) * 100)}%）`);
    const fateOpen = getMinggeEffectNumber(batchMingge, '内景地开启概率');
    if (fateOpen > 0) fateNotes.push(`命格·内景地开启概率加成 +${Math.round(fateOpen * 100)}%`);

    const summary = [
      `内景地批量修炼完成！`,
      ...(fateNotes.length ? [`命格生效：${fateNotes.join('，')}`] : []),
      `计划次数：${times} 次`,
      `实际执行：${successCnt + failCnt} 次`,
      `成功开启：${successCnt} 次`,
      `失败次数：${failCnt} 次`,
      `累计消耗元神：${bigNumberTransform(totalCost)}`,
      `剩余元神：${bigNumberTransform(player.元神)}`
    ].join('\n');

    e.reply(summary);
    if (msgs.length) await ForwardMsg(e, msgs);
  }

  _spiritPlaces() {
    return data.jingshenyuzhou_list || [];
  }

  _spiritBonuses(player) {
    return (player.学习的功法 || []).reduce((result, skill) => {
      const cfg = YUANSHEN_SKILLS[skill];
      if (cfg?.type === '神游') {
        result.event += cfg.event_bonus || 0;
        result.depth += cfg.depth_bonus || 0;
      }
      return result;
    }, { event: 0, depth: 0 });
  }

  async _withShenyouLock(usr_qq, e, callback) {
    const key = `shenyou:${usr_qq}:lock`;
    const token = `${Date.now()}:${Math.random()}`;
    const acquired = Boolean(await redis.set(key, token, { EX: 15, NX: true }));
    if (!acquired) return e.reply('神识正在回应上一道念头，请稍候再试');
    try {
      return await callback();
    } finally {
      if (await redis.get(key) === token) await redis.del(key);
    }
  }

  _eventIntro(eventType) {
    const intros = {
      念头风暴: '无数陌生念头汇成风暴，正在撕扯你的识海边界。',
      道则碎片: '一枚残缺道则悬在虚空中，周围还有数道危险气息游弋。',
      古贤烙印: '古贤虚影自岁月中显化，一指点向你的眉心。',
      心魔幻象: '熟悉的身影从迷雾中走来，你却无法判断它是真是假。',
      灵光乍现: '一道灵光划破识海，深处似乎藏着更完整的道痕。',
      天药凝形: '精神能量逐渐凝成天药，虚空也随之开始坍缩。',
    };
    return intros[eventType] || '前方精神潮汐翻涌，一场未知机缘正在成形。';
  }

  _choiceResultMessage(eventType, result) {
    const finding = result.finding;
    const messages = {
      steady_success: `你不与「${eventType}」正面争锋，守住灵台并记下一缕道痕。`,
      treasure_found: `你循着气机深入其中，将「${finding?.name}」收入神识携带之物。`,
      treasure_empty: '你搜寻许久，只捕捉到几缕迅速消散的精神微光。',
      treasure_hazard: '你触动了隐藏禁制，机缘化为泡影，神识也被撕裂一角。',
      insight_recover: '你看破表象，从精神潮汐中炼出纯净念力，道痕接连浮现。',
      insight_expand: `你触及元神蜕变之秘，归位后可令元神上限提升${bigNumberTransform(finding?.amount || 0)}。`,
      insight_skill: `古老传承主动与你共鸣，「${finding?.name}」暂时烙印在神识之中。`,
      insight_legacy: `一道强者残魂从道痕中苏醒，唯有胜过它，方能承接「${finding?.name || '未知传承'}」。`,
      insight_trace: '完整传承虽未显现，你仍从残痕中连续悟出两道道痕。',
      insight_backlash: '你强行追索大道源头，却被混乱意志反噬，神识剧烈震荡。',
    };
    return messages[result.outcome] || '这一缕精神异象缓缓消散。';
  }

  async _settleShenyou(e, usr_qq, player, rawState, options = {}) {
    const state = normalizeSpiritJourney(rawState);
    const forced = Boolean(options.forced);
    const retention = getSpiritRetentionRate(state.current_layer, forced);
    const retained = retainSpiritFindings(state.findings, retention);
    const lostCount = state.findings.length - retained.length;
    const itemFindings = retained.filter(f => (f.kind || f.type) === 'item');
    const lines = [...(options.prelude || [])];

    player.学习的功法 = player.学习的功法 || [];
    let maxGain = 0;
    let duplicateGain = 0;
    const rewardLines = [];
    const place = this._spiritPlaces().find(item => item.id == state.place_id);
    const layer = place?.layers?.[state.current_layer - 1];
    const duplicateValue = Math.ceil(Number(layer?.cost_per_action || 100000) * 0.5);

    for (const finding of retained) {
      const kind = finding.kind || finding.type;
      if (kind === 'skill') {
        if (player.学习的功法.includes(finding.name)) {
          duplicateGain += duplicateValue;
          rewardLines.push(`重复传承「${finding.name}」化为 ${bigNumberTransform(duplicateValue)} 元神`);
        } else {
          player.学习的功法.push(finding.name);
          rewardLines.push(`领悟「${finding.name}」`);
        }
      } else if (kind === 'max') {
        maxGain += Math.max(0, Number(finding.amount) || 0);
        rewardLines.push(`元神上限 +${bigNumberTransform(finding.amount || 0)}`);
      } else if (kind === 'item') {
        rewardLines.push(`${finding.name} ×1`);
      }
    }

    player.元神上限 = (Number(player.元神上限) || 0) + maxGain;
    player.元神 = (Number(player.元神) || 0) + duplicateGain;

    let najie = null;
    if (itemFindings.length) {
      najie = await Read_najie(usr_qq);
      mergeSpiritItemsIntoNajie(najie, itemFindings, [
        ...(data.jingshenyuzhou_drop_list || []),
        ...(data.daoju_list || []),
        ...(data.danyao_list || []),
      ]);
    }

    if (najie) await Write_najie(usr_qq, najie);
    await Write_player(usr_qq, player);
    await redis.del(`shenyou:${usr_qq}`);

    lines.push(
      forced ? '元神投影受创，你被精神宇宙强行排斥！' : '你主动收束念头，神识沿来路归位。',
      `【${state.place_name}·神游结算】`,
      `最深到达：第${state.max_layer_reached}层`,
      `完成抉择：${state.guanxiang_count}次`,
      `累计消耗：${bigNumberTransform(state.yuanshen_consumed)} 元神`,
      `战利品保留：${Math.round(retention * 100)}%`,
    );
    if (rewardLines.length) lines.push('归位所得：', ...rewardLines.map(line => `  · ${line}`));
    else lines.push('归位所得：无');
    if (lostCount > 0) lines.push(`强制归位时遗失：${lostCount}件临时收获`);
    lines.push('神识没入眉心，你缓缓睁开双眼。');
    return e.reply(lines.join('\n'));
  }

  /* =========================================================
   * #精神宇宙 —— 查看精神位面列表
   * ========================================================= */
  async jingshenyuzhou(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;
    const heart = refreshSpiritHeart(p);
    const heartCost = getSpiritHeartCost(
      SPIRIT_HEART_ENTRY_COST,
      getMinggeEffects(p, data.minggeList)
    );
    await Write_player(usr_qq, p);
    const places = this._spiritPlaces();
    if (!places.length) return e.reply('精神宇宙数据不存在');

    const lines = [
      '╔══════════ 精神宇宙·神识云游 ══════════╗',
      `心神：${heart.current}/${heart.max}｜每次神游消耗${heartCost}点`,
      '每层完成有限观想后，需以元神战胜守关残魂。',
      '主动归位保留全部收获；战败强制归位并可能遗失。',
      '╠══════════════════════════════════════╣',
    ];

    for (const place of places) {
      const reqLevel = place.yuanshen_required || 0;
      const meta = data.Levelyuanshen_list.find(l => l.level_id == reqLevel);
      const canEnter = p.yuanshenlevel_id != null && p.yuanshenlevel_id >= reqLevel;
      lines.push(
        `${canEnter ? '✅' : '🔒'}【${place.name}】（${place.depth}层）`,
        `   要求：${meta?.level || '未知'}｜入场：${heartCost}心神 + ${bigNumberTransform(place.entry_cost || 0)}元神`,
        `   珍品：${(place.Best || []).join('、') || '未知'}`,
        canEnter ? `   命令：#神游${place.name}` : '   元神等级不足',
        '─────────────────────────────────────',
      );
    }

    lines.push('╚══════════════════════════════════════╝');
    e.reply(lines.join('\n'));
  }

  /* =========================================================
   * #神游XXX —— 进入精神位面
   * ========================================================= */
  async shenyouEnter(e) {
    const v = await this._validatePlayer(e);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    return this._withShenyouLock(usr_qq, e, async () => {
      const placeName = e.msg.replace('#神游', '').trim();
      const place = this._spiritPlaces().find(item => item.name === placeName);
      if (!place) return e.reply(`未找到精神位面：${placeName}\n使用 #精神宇宙 查看可进入的位面`);

      if (p.yuanshenlevel_id < (place.yuanshen_required || 0)) {
        const meta = data.Levelyuanshen_list.find(l => l.level_id == place.yuanshen_required);
        return e.reply(`你的元神等级不足，需要${meta?.level || place.yuanshen_required}方可进入`);
      }

      const existing = await redis.get(`shenyou:${usr_qq}`);
      if (existing) {
        const state = normalizeSpiritJourney(JSON.parse(existing));
        return e.reply(`你的神识正在「${state.place_name}」第${state.current_layer}层云游\n请先 #归位 后再进入其他位面`);
      }

      const entryCost = place.entry_cost || 100000;
      if ((p.元神 || 0) < entryCost) {
        return e.reply(`神识云游需要 ${bigNumberTransform(entryCost)} 元神，你当前仅 ${bigNumberTransform(p.元神 || 0)}`);
      }

      const minggeEffects = getMinggeEffects(p, data.minggeList);
      const heartCost = getSpiritHeartCost(SPIRIT_HEART_ENTRY_COST, minggeEffects);
      const heart = consumeSpiritHeartEntry(p, Date.now(), minggeEffects);
      if (!heart.ok) {
        const elapsed = Date.now() - Number(p.心神恢复时间 || Date.now());
        const waitMinutes = Math.max(1, Math.ceil((getSpiritHeartRecoveryMs(p) - elapsed) / 60000));
        await Write_player(usr_qq, p);
        return e.reply(`进入精神宇宙需要${heartCost}点心神，你当前为${heart.current}/${heart.max}\n约${waitMinutes}分钟后恢复下一点心神`);
      }

      const firstLayer = place.layers[0];
      p.元神 -= entryCost;
      const state = createSpiritJourney(place, usr_qq, entryCost);
      await Write_player(usr_qq, p);
      await redis.set(`shenyou:${usr_qq}`, JSON.stringify(state));

      return e.reply([
        `${p.名号}盘膝入定，一缕神识越过精神宇宙的边界。`,
        `进入「${place.name}」·第1层「${firstLayer.name}」`,
        place.desc || '',
        '',
        `心神：${heart.current}/${heart.max}`,
        `入场消耗：${heart.cost}心神、${bigNumberTransform(entryCost)}元神`,
        '发送 #观想 寻找当前层的机缘',
      ].join('\n'));
    });
  }

  /* =========================================================
   * #观想 —— 生成当前层的三选一事件
   * ========================================================= */
  async shenyouGuanxiang(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    return this._withShenyouLock(usr_qq, e, async () => {
      const raw = await redis.get(`shenyou:${usr_qq}`);
      if (!raw) return e.reply('你的神识并未云游\n使用 #神游XXX 进入精神宇宙');

      const state = normalizeSpiritJourney(JSON.parse(raw));
      const place = this._spiritPlaces().find(item => item.id == state.place_id);
      const layer = place?.layers?.[state.current_layer - 1];
      if (!place || !layer) return e.reply('神识云游数据异常，请 #归位 后重试');
      if (state.pending_event) return e.reply('眼前的异象尚未消散，请先使用 #抉择1、#抉择2 或 #抉择3');

      const bonus = this._spiritBonuses(p);
      const nodeLimit = getSpiritInsightRequirement(bonus.depth);
      if (state.layer_actions >= nodeLimit) {
        return e.reply(`本层${nodeLimit}处精神节点均已探明，守关意识已经显化\n使用 #深入 发起元神战斗，或 #归位 保全收获`);
      }

      const choices = [1, 2, 3].map(number => getSpiritChoice(number, layer));
      if ((p.元神 || 0) < choices[0].cost) {
        return e.reply(`你至少需要 ${bigNumberTransform(choices[0].cost)} 元神才能继续观想\n请使用 #归位 结算收益`);
      }

      const events = layer.events?.length ? layer.events : ['精神潮汐'];
      const eventType = events[Math.floor(Math.random() * events.length)];
      state.pending_event = { type: eventType, layer: state.current_layer };
      await redis.set(`shenyou:${usr_qq}`, JSON.stringify(state));

      const treasureChance = Math.min(90, Math.round((0.65 + bonus.event) * 100));
      return e.reply([
        `【${place.name}·${layer.name}】`,
        this._eventIntro(eventType),
        '',
        `精神节点：${state.layer_actions + 1}/${nodeLimit}`,
        `1. 镇守心神｜${bigNumberTransform(choices[0].cost)}元神｜稳获道痕`,
        `2. 搜寻机缘｜${bigNumberTransform(choices[1].cost)}元神｜寻宝率${treasureChance}%`,
        `3. 参悟道痕｜${bigNumberTransform(choices[2].cost)}元神｜可能触发特殊传承`,
        '',
        '使用 #抉择1、#抉择2 或 #抉择3',
      ].join('\n'));
    });
  }

  async shenyouChoose(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;
    const choiceNumber = Number(e.msg.match(/^#抉择([1-3])$/)?.[1]);

    return this._withShenyouLock(usr_qq, e, async () => {
      const raw = await redis.get(`shenyou:${usr_qq}`);
      if (!raw) return e.reply('你的神识并未云游');

      const state = normalizeSpiritJourney(JSON.parse(raw));
      const place = this._spiritPlaces().find(item => item.id == state.place_id);
      const layer = place?.layers?.[state.current_layer - 1];
      if (!place || !layer) return e.reply('当前精神位面数据异常');
      if (!state.pending_event) return e.reply('当前没有等待处理的异象，请先使用 #观想');
      const eventType = state.pending_event.type;
      if (state.pending_event.layer !== state.current_layer) {
        state.pending_event = null;
        await redis.set(`shenyou:${usr_qq}`, JSON.stringify(state));
        return e.reply('旧有异象已经消散，请重新使用 #观想');
      }

      const bonuses = this._spiritBonuses(p);
      const result = resolveSpiritChoice({
        choiceNumber,
        layer,
        shenyouBonus: bonuses.event,
      });
      if (!result) return e.reply('无效抉择');
      if ((p.元神 || 0) < result.action.cost) {
        return e.reply(`此抉择需要 ${bigNumberTransform(result.action.cost)} 元神，你当前仅 ${bigNumberTransform(p.元神 || 0)}\n可以改选其他抉择或使用 #归位`);
      }

      p.元神 -= result.action.cost;
      p.元神 = Math.max(0, (Number(p.元神) || 0) + result.currentYuanshenDelta);
      state.yuanshen_consumed += result.action.cost;
      state.guanxiang_count++;
      state.layer_insight += result.insightGain;
      state.layer_actions++;
      state.pending_event = null;

      let legacyBattle = null;
      if (choiceNumber === 3 && p.元神 > 0) {
        const skillDrops = (layer.drops || []).filter(drop => drop.class === '功法');
        const pity = Math.max(0, Number(p.精神传承保底) || 0);
        const triggered = skillDrops.length > 0 && shouldTriggerSpiritLegacy(
          pity,
          getSpiritLegacyChance(state.current_layer, place.depth),
        );
        if (triggered) {
          result.finding = createSpiritFinding(pickWeightedDrop(skillDrops));
          result.outcome = 'insight_legacy';
          p.精神传承保底 = 0;
          legacyBattle = resolveSpiritGuardianBattle({ player: p, place, layer, legacy: true });
          p.元神 = legacyBattle.remainingYuanshen;
          if (!legacyBattle.won) result.finding = null;
        } else {
          p.精神传承保底 = pity + 1;
        }
      }
      if (result.finding) state.findings.push(result.finding);

      const required = getSpiritInsightRequirement(bonuses.depth);
      const lines = [
        `【${eventType}·${result.action.label}】`,
        this._choiceResultMessage(eventType, result),
        `消耗元神：${bigNumberTransform(result.action.cost)}`,
      ];
      if (result.currentYuanshenDelta) {
        const sign = result.currentYuanshenDelta > 0 ? '+' : '';
        lines.push(`额外元神变化：${sign}${bigNumberTransform(result.currentYuanshenDelta)}`);
      }
      if (legacyBattle) {
        lines.push(
          '',
          `【特殊传承·${legacyBattle.guardianName}】`,
          ...legacyBattle.logs,
          legacyBattle.won
            ? `残魂认可了你的元神，传承「${result.finding?.name}」化作烙印。`
            : '你未能承受传承意志，元神投影被逐出此界。',
        );
      }
      lines.push(
        `本层精神节点：${state.layer_actions}/${required}`,
        `本层悟痕：${state.layer_insight}`,
        `临时收获：${state.findings.length}件`,
      );
      if (state.layer_actions >= required) {
        lines.push('本层节点已经探明，使用 #深入 挑战守关意识');
      }

      if ((legacyBattle && !legacyBattle.won) || p.元神 <= 0) {
        return this._settleShenyou(e, usr_qq, p, state, { forced: true, prelude: lines });
      }

      await Write_player(usr_qq, p);
      await redis.set(`shenyou:${usr_qq}`, JSON.stringify(state));
      return e.reply(lines.join('\n'));
    });
  }

  /* =========================================================
   * #深入 —— 探明节点后挑战守关意识
   * ========================================================= */
  async shenyouDeep(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    return this._withShenyouLock(usr_qq, e, async () => {
      const raw = await redis.get(`shenyou:${usr_qq}`);
      if (!raw) return e.reply('你的神识并未云游\n使用 #神游XXX 进入精神宇宙');

      const state = normalizeSpiritJourney(JSON.parse(raw));
      const place = this._spiritPlaces().find(item => item.id == state.place_id);
      if (!place) return e.reply('神识云游数据异常');
      if (state.pending_event) return e.reply('眼前异象尚未处理，请先完成当前抉择');

      const bonuses = this._spiritBonuses(p);
      const required = getSpiritInsightRequirement(bonuses.depth);
      if (state.layer_actions < required) {
        return e.reply(`本层还有精神节点尚未探明，需要完成${required}次观想，你当前完成${state.layer_actions}次`);
      }

      const isFinalLayer = state.current_layer >= place.depth;
      if (!isFinalLayer) {
        const depthReq = (place.yuanshen_required || 0) + state.current_layer;
        if (p.yuanshenlevel_id < depthReq) {
          const meta = data.Levelyuanshen_list.find(l => l.level_id == depthReq);
          return e.reply(`守关意识感知到你的元神尚未圆满，下一层需要 ${meta?.level || depthReq}`);
        }
      }

      const layer = place.layers[state.current_layer - 1];
      const battle = resolveSpiritGuardianBattle({ player: p, place, layer });
      p.元神 = battle.remainingYuanshen;
      const lines = [
        `【${place.name}·守关元神战】`,
        `${battle.guardianName}挡住了通往下一层的精神通道。`,
        ...battle.logs,
        `元神损耗：${bigNumberTransform(battle.yuanshenLost)}`,
      ];

      if (!battle.won) {
        lines.push(`${battle.guardianName}仍余${bigNumberTransform(battle.guardianRemainingHp)}点魂力，你的投影被震出精神宇宙。`);
        return this._settleShenyou(e, usr_qq, p, state, { forced: true, prelude: lines });
      }

      lines.push(`${battle.guardianName}消散，精神壁垒随之洞开。`);
      if (isFinalLayer) {
        p.精神宇宙首通 = Array.isArray(p.精神宇宙首通) ? p.精神宇宙首通 : [];
        const firstClear = !p.精神宇宙首通.includes(Number(place.id));
        if (firstClear) {
          p.精神宇宙首通.push(Number(place.id));
          const heartGain = increaseSpiritHeartLimit(p, 2);
          lines.push(`首次贯通「${place.name}」，心神上限永久+${heartGain}。`);
        }
        if (firstClear || Math.random() < 0.05) {
          state.findings.push({
            kind: 'item',
            type: 'item',
            name: '虚天神钥',
            class: '道具',
            itemType: '宝物',
          });
          lines.push('守关残念中浮现一枚【虚天神钥】。');
        }
        state.max_layer_reached = Math.max(state.max_layer_reached, state.current_layer);
        lines.push(`你已贯通「${place.name}」，神识沿完整道标归位。`);
        return this._settleShenyou(e, usr_qq, p, state, { prelude: lines });
      }

      const nextLayer = place.layers[state.current_layer];
      state.current_layer++;
      state.layer_name = nextLayer.name;
      state.layer_insight = 0;
      state.layer_actions = 0;
      state.max_layer_reached = Math.max(state.max_layer_reached, state.current_layer);
      await Write_player(usr_qq, p);
      await redis.set(`shenyou:${usr_qq}`, JSON.stringify(state));

      return e.reply([
        ...lines,
        `进入第${state.current_layer}层「${nextLayer.name}」`,
        `本层可能遭遇：${(nextLayer.events || []).join('、') || '未知异象'}`,
        '发送 #观想 继续探索，或 #归位 保全收获',
      ].join('\n'));
    });
  }

  /* =========================================================
   * #归位 —— 主动收回神识并保留全部收益
   * ========================================================= */
  async shenyouReturn(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;

    return this._withShenyouLock(usr_qq, e, async () => {
      const raw = await redis.get(`shenyou:${usr_qq}`);
      if (!raw) return e.reply('你的神识并未云游');
      return this._settleShenyou(e, usr_qq, p, JSON.parse(raw));
    });
  }

  /* =========================================================
   * #神识状态 —— 查看当前云游状态
   * ========================================================= */
  async shenyouStatus(e) {
    const v = await this._validatePlayer(e, false);
    if (v.err) return e.reply(v.err);
    const { usr_qq, player: p } = v;
    const heart = refreshSpiritHeart(p);
    await Write_player(usr_qq, p);

    const raw = await redis.get(`shenyou:${usr_qq}`);
    if (!raw) return e.reply(`你的神识并未云游\n心神：${heart.current}/${heart.max}（每${getSpiritHeartRecoveryMs(p) / 60000}分钟恢复1点${p.问道仙宫 ? '，问道仙宫加持' : ''}）\n使用 #精神宇宙 查看可进入的位面`);

    const state = normalizeSpiritJourney(JSON.parse(raw));
    const place = this._spiritPlaces().find(item => item.id == state.place_id);
    const bonuses = this._spiritBonuses(p);
    const required = getSpiritInsightRequirement(bonuses.depth);
    const forcedRetention = getSpiritRetentionRate(state.current_layer, true);

    e.reply([
      '【神识云游状态】',
      `心神：${heart.current}/${heart.max}`,
      `位面：${state.place_name}（共${place?.depth || '?'}层）`,
      `当前：第${state.current_layer}层「${state.layer_name}」`,
      `本层精神节点：${state.layer_actions}/${required}`,
      `本层悟痕：${state.layer_insight}`,
      `完成抉择：${state.guanxiang_count}次`,
      `累计消耗元神：${bigNumberTransform(state.yuanshen_consumed)}`,
      `临时收获：${state.findings.length}件`,
      `强制归位保留率：${Math.round(forcedRetention * 100)}%`,
      state.pending_event ? `待处理异象：${state.pending_event.type}（使用 #抉择1/2/3）` : '',
      '',
      '可用命令：#观想 | #深入 | #归位',
    ].filter(Boolean).join('\n'));
  }
}

// apps/SecretPlace/xianguTribulation.js
// 仙古今世法渡劫系统
// 原著境界线：
//   尊者→神火：三千道火祭炼真我（道火洗礼，不是雷劫）
//   神火极境：在境界内分别凝聚第二、第三道仙气
//   神火→真一：史上最强天劫（九重天与第十层雷域），不再赠送仙气
//   真一→圣祭：法则道痕洗礼（不是真雷）后承受神王劫
//   圣祭→天神：已有仙气化作大道之花，自然晋阶，不渡雷劫
//   天神→虚道：以身为种，遭上苍天谴与大道抹杀
//   虚道→斩我：古来前三绝世大劫；原著中石昊可借此入斩我但主动压境，本系统将其收束为晋阶关
//   斩我→遁一：合并斩仙铡刀斩除不朽印记的前置淬炼，以及原著明确的遁一天劫
//   遁一→至尊：红尘业火、天地拷问与至尊尸骨路（是大道意志考验，不按普通雷劫处理）
// 每一阶段每一道伤害都真实扣减 player.当前血量，并接入：
//   ① 时代系数 difficultyRate（神话/太古/天命/末法/绝灵，由全局 Era 配置读取）
//   ② 灵根/体质减伤（bodyEffects 表，与遮天同源）
//   ③ 功法/生命本源复活（真凰/万化免死、生命本源≥50 且习有复活功法）
//   ④ 功法减伤（者字秘/不灭经/真凰/柳神/涅槃/雷帝/万化/凰劫 等，复活后再结算）
// 让玩家切实体会到「血条崩落、假死、复苏、濒死被功法救回」的艰难，且修炼成果（减伤/复活）真实生效。
// 本模块负责原著劫难编排与统一伤害结算，实际境界、属性和奖励仍由调用方写入。

import { sleep, bigNumberTransform } from '../../model/xiuxian.js';
import { getXianqiStrands } from '../../model/xianguXianqi.js';
import { config } from '../../api/api.js';
import {
  hasXianguGongfa,
  settleXianguWaveDamage,
  XIANGU_REALM_ROUTES,
} from './xianguTribulationSettlement.js';

export { XIANGU_REALM_ROUTES } from './xianguTribulationSettlement.js';

// ============ 灵根/体质减伤表（与遮天渡劫 applyGongfaEffects 同源，保证「灵根减伤」生效）============
// 本插件 player.灵根.name 取值体系（圣体/神体/命运神道体/天魔 等）与遮天一致，可直接复用。
const BODY_EFFECTS = {
  // ==== 九天十地体质 ====
  "天生至尊": { reduction: 0.25, desc: "至尊骨初显，天生异象", special: "至尊初现" },
  "涅槃·至尊": { reduction: 0.40, desc: "至尊涅槃，重获新生", special: null },
  "终极涅槃·至尊": { reduction: 0.65, desc: "终极涅槃，至尊无敌", special: "终极至尊" },
  "重瞳者": { reduction: 0.50, desc: "眸开天地，重瞳破虚", special: "重瞳开天" },
  // 圣体系列
  "荒古圣体": { reduction: 0.15, desc: "金色血气冲天，圣体初显威能", special: null },
  "小成·荒古圣体": { reduction: 0.30, desc: "黄金血气如海，圣体小成震世", special: "圣体异象" },
  "大成·荒古圣体": { reduction: 0.60, desc: "九转金身不灭，可叫板大帝", special: "圣体异象" },
  // 霸体系列
  "苍天霸体": { reduction: 0.20, desc: "紫血沸腾，霸体初成", special: "霸钟护体" },
  "小成·苍天霸体": { reduction: 0.35, desc: "霸体紫气冲霄，九天真龙环绕", special: "霸钟护体" },
  "大成·苍天霸体": { reduction: 0.55, desc: "霸体无敌，睥睨万界", special: "霸钟护体" },
  // 道胎系列
  "先天道胎": { reduction: 0.10, desc: "道法自然，胎息天地", special: "道法自然" },
  "先天圣体道胎": { reduction: 0.65, desc: "圣体与道胎合一，先天立于不败", special: "混沌青莲" },
  // 混沌体系列
  "混沌体": { reduction: 0.45, desc: "身与道合，言出法随", special: "混沌护体" },
  "先天混沌圣体道胎": { reduction: 0.80, desc: "混沌初开，鸿蒙始判", special: "混沌开天" },
  // 太阳体系列
  "太阳之体": { reduction: 0.08, desc: "太阳真火初显", special: null },
  "太阳神体": { reduction: 0.25, desc: "太阳真火护体", special: "太阳真火" },
  "太阳圣皇体": { reduction: 0.40, desc: "太阳圣皇临世", special: "太阳圣皇" },
  // 太阴体系列
  "太阴之体": { reduction: 0.08, desc: "太阴之力初显", special: null },
  "太阴神体": { reduction: 0.25, desc: "太阴之力护体", special: "太阴真水" },
  "太阴圣皇体": { reduction: 0.40, desc: "太阴圣皇临世", special: "太阴圣皇" },
  // 神王体系列
  "神王体": { reduction: 0.12, desc: "神王初显威能", special: null },
  "小成·神王体": { reduction: 0.28, desc: "神王净土展开", special: "神王净土" },
  "大成·神王体": { reduction: 0.45, desc: "神王再生术", special: "神王再生术" },
  // 妖体系列
  "天妖体": { reduction: 0.10, desc: "妖气初显", special: null },
  "天妖王体": { reduction: 0.30, desc: "妖王临世", special: "妖王真身" },
  "天妖皇体": { reduction: 0.50, desc: "妖皇降世", special: "妖皇真身" },
  // 魔胎系列
  "伪·魔胎仙体": { reduction: 0.35, desc: "魔胎初成", special: "魔气护体" },
  "魔胎仙体": { reduction: 0.70, desc: "魔胎仙体大成", special: "魔主降世" },
  // ==== 神魔体质 ====
  "命运神道体": { reduction: 0.30, desc: "命运长河显化，神道初成", special: "命运长河" },
  "极道天魔": { reduction: 0.35, desc: "天魔降世，万魔朝拜", special: "天魔真身" },
  "终焉神魔体": { reduction: 0.55, desc: "神魔一体，终焉降临", special: "终焉降临" },
  "彼岸·命运神道体": { reduction: 0.75, desc: "脚踏彼岸金桥，命运长河环绕己身", special: "彼岸金桥" },
  "无相·万化天魔体": { reduction: 0.75, desc: "万灵根性归于无相魔胎", special: "万化魔胎" },
  // ==== 诸天万界体质 ====
  "爱莉希雅": { reduction: 0.35, desc: "真我初显，无瑕之光绽放", special: "真我刻印" },
  "人之律者·爱莉希雅": { reduction: 0.60, desc: "人之律者，为世上所有美好而战", special: "始源领域" },
  "始源之律者·爱莉希雅": { reduction: 0.85, desc: "始源之律，超越因果的终点与起点", special: "始源之理" },
  "木之本樱": { reduction: 0.10, desc: "魔卡少女初现，封印解除", special: "库洛牌" },
  "星之杖·木之本樱": { reduction: 0.25, desc: "星之杖闪耀，魔卡觉醒", special: "星之杖" },
  "梦之杖·木之本樱": { reduction: 0.45, desc: "梦之杖在手，完全解放", special: "梦之杖" },
  "鹿目圆": { reduction: 0.20, desc: "魔法少女契约签订", special: "祈愿之力" },
  "许愿者·圆": { reduction: 0.35, desc: "愿望之力初显，粉色光芒绽放", special: "祈愿之力" },
  "希望之光·圆": { reduction: 0.60, desc: "希望之光闪耀，因果律初显", special: "希望之光" },
  "圆神": { reduction: 0.85, desc: "圆环之理显现，超越因果", special: "圆环之理" },
  "门矢士": { reduction: 0.15, desc: "假面骑士降临，世界破坏者", special: "骑士降临" },
  "帝骑": { reduction: 0.25, desc: "帝骑之力觉醒，驾驭一切", special: "帝骑之力" },
  "帝骑·神主": { reduction: 0.45, desc: "神主形态，终极驾驭", special: "神主形态" },
  "帝骑·终极神主": { reduction: 0.65, desc: "超终极神主，破坏神降临", special: "破坏神" },
  "伊蕾娜": { reduction: 0.20, desc: "灰之魔女旅行开始", special: "魔女扫帚" },
  "少女流萤": { reduction: 0.30, desc: "星穹铁道，少女启程", special: "星穹之力" },
  "流萤萨姆机甲": { reduction: 0.55, desc: "萨姆机甲启动，星核猎手", special: "机甲武装" },
  "天命青儿": { reduction: 0.70, desc: "一剑独尊，天命所归", special: "天命一剑" }
};

// 拥有以下任一功法（已习）即可在渡劫濒死时触发「生命本源」版功法复活
const REVIVE_GONGFA = ['者字秘', '真凰宝术', '雷帝宝术', '柳神法', '不灭经', '补天术', '万化圣诀', '涅槃仙功'];

export class XianguTribulation {
  constructor() {
    this.revived = false; // 是否触发过功法复活 / 欺瞒天地
    this.dead = false;    // 是否道火吞没真我（渡劫失败）
    this._eraFactor = this._getEraFactor();
  }

  // 成功率（与原文公式一致；满极境 + 道韵>=500 即封顶 100%）
  // 基础 30% + 每个极境 10% + 道韵加成（最多 10%）
  calcSuccessRate(completed, daoyun) {
    const r = 0.30 + (completed?.length || 0) * 0.10 + Math.min((daoyun || 0) / 5000, 0.10);
    return Math.min(r, 1.0);
  }

  // ============ 时代系数（与遮天 getEraDifficultyFactor 同源）============
  _getEraFactor() {
    try {
      const set = config.getConfig('xiuxian', 'xiuxian');
      const idx = (set && set.Era && set.Era.current && set.Era.current.index) || 0;
      const rates = [0.8, 0.9, 1.0, 1.2, 1.5]; // 神话/太古/天命/末法/绝灵
      return rates[idx] != null ? rates[idx] : 1.0;
    } catch (e) {
      return 1.0;
    }
  }

  // ============ 伤害结算工具（基于血量上限的分数，保证各境界都有真实过山车）============
  _M(player) {
    return player.血量上限 || player.血气上限 || player.当前血量 || 100000;
  }

  _pct(player) {
    const M = this._M(player);
    return M > 0 ? Math.floor(((player.当前血量 || 0) / M) * 100) : 0;
  }

  _bar(player) {
    return `剩余血量：${bigNumberTransform(player.当前血量 || 0)}/${bigNumberTransform(this._M(player))}（肉身完整度 ${this._pct(player)}%）`;
  }

  // ============ 统一伤害结算：时代系数 × 灵根减伤 × 功法减伤 ============
  // equipment 恒为 {}（以身为种·不借外物，天道排斥凡器；但灵根/功法减伤仍生效）
  applyDefenses(player, base) {
    const { damage: bodyDamage, msgs } = this._applyBodyDefenses(player, base);
    const finalDamage = this._gongfaReduce(player, base, bodyDamage, msgs);

    return { damage: Math.max(1, Math.floor(finalDamage)), msgs };
  }

  // 灵根防御必须单独结算，供致死判定先触发复活，再应用功法减伤。
  _applyBodyDefenses(player, base) {
    let finalDamage = base;
    const msgs = [];

    const name = player.灵根?.name;
    if (name && BODY_EFFECTS[name]) {
      const eff = BODY_EFFECTS[name];
      const rd = finalDamage * eff.reduction;
      finalDamage -= rd;
      msgs.push(`【${name}】${eff.desc}｜灵根减伤 减免 ${bigNumberTransform(rd)}`);
      if (eff.special && eff.special !== '真我刻印' && eff.special !== '始源领域' && eff.special !== '始源之理' && eff.special !== '希望之光') {
        finalDamage = this._applySpecial(player, eff.special, finalDamage, msgs);
      }
    }

    return { damage: Math.max(1, finalDamage), msgs };
  }

  // 灵根特殊异象（与遮天 applyGongfaEffects 同源，heal 改为作用 player.当前血量 池）
  _applySpecial(player, special, finalDamage, msgs) {
    const M = this._M(player);
    switch (special) {
      case "圣体异象":
        if (Math.random() < 0.3) { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【黄金血气】异象冲天，额外减免 ${bigNumberTransform(r)}`); }
        break;
      case "霸钟护体":
        if (Math.random() < 0.25) { const r = finalDamage * 0.5; finalDamage -= r; msgs.push(`【霸钟长鸣】震碎虚空，减免 ${bigNumberTransform(r)}`); }
        break;
      case "道法自然": { const r = finalDamage * 0.1; finalDamage -= r; msgs.push(`【道法自然】与天地共鸣，减免 ${bigNumberTransform(r)}`); break; }
      case "混沌青莲":
        if (Math.random() < 0.4) { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【混沌青莲】脚下绽放，减免 ${bigNumberTransform(r)}`); }
        break;
      case "混沌护体": { const r = finalDamage * 0.2; finalDamage -= r; msgs.push(`【混沌气】弥漫周身，减免 ${bigNumberTransform(r)}`); break; }
      case "混沌开天":
        if (Math.random() < 0.5) { const r = finalDamage * 0.35; finalDamage -= r; msgs.push(`【混沌开天】演化鸿蒙，减免 ${bigNumberTransform(r)}`); }
        break;
      case "太阳真火": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【太阳真火】焚烧雷劫，减免 ${bigNumberTransform(r)}`); break; }
      case "太阳圣皇":
        if (Math.random() < 0.3) { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【太阳圣皇】虚影降临，减免 ${bigNumberTransform(r)}`); }
        break;
      case "太阴真水": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【太阴真水】浇灭雷火，减免 ${bigNumberTransform(r)}`); break; }
      case "太阴圣皇":
        if (Math.random() < 0.3) { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【太阴圣皇】虚影降临，减免 ${bigNumberTransform(r)}`); }
        break;
      case "神王净土":
        if (Math.random() < 0.15) { const immune = finalDamage; finalDamage = 0; msgs.push(`【神王净土】万法不侵，完全免疫 ${bigNumberTransform(immune)}！`); }
        break;
      case "妖王真身": { const r = finalDamage * 0.2; finalDamage -= r; msgs.push(`【妖王真身】显化，减免 ${bigNumberTransform(r)}`); break; }
      case "妖皇真身":
        if (Math.random() < 0.35) { const r = finalDamage * 0.3; finalDamage -= r; msgs.push(`【妖皇真身】降临，减免 ${bigNumberTransform(r)}`); }
        break;
      case "魔气护体": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【魔气滔天】形成护盾，减免 ${bigNumberTransform(r)}`); break; }
      case "魔主降世":
        if (Math.random() < 0.4) { const r = finalDamage * 0.4; finalDamage -= r; msgs.push(`【魔主降世】虚影显化，减免 ${bigNumberTransform(r)}`); }
        break;
      case "神王再生术":
        if ((player.当前血量 || 0) < M * 0.3) { const regen = Math.floor(M * 0.25); player.当前血量 = Math.min(M, (player.当前血量 || 0) + regen); msgs.push(`【神王再生术】血脉沸腾，恢复 ${bigNumberTransform(regen)} 血气`); }
        break;
      case "至尊初现":
        if (Math.random() < 0.25) { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【至尊骨显化】额外减免 ${bigNumberTransform(r)}`); }
        break;
      case "终极至尊":
        if (Math.random() < 0.4) { const r = finalDamage * 0.3; finalDamage -= r; msgs.push(`【至尊无敌】减免 ${bigNumberTransform(r)}`); }
        break;
      case "重瞳开天": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【左眼开天】减免 ${bigNumberTransform(r)}`); break; }
      case "命运长河": { const r = finalDamage * 0.1; finalDamage -= r; msgs.push(`【命运长河】减免 ${bigNumberTransform(r)}`); break; }
      case "天魔真身":
        if (Math.random() < 0.3) { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【天魔真身】减免 ${bigNumberTransform(r)}`); }
        break;
      case "终焉降临": { const r = finalDamage * 0.2; finalDamage -= r; msgs.push(`【终焉之力】减免 ${bigNumberTransform(r)}`); break; }
      case "彼岸金桥": { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【彼岸金桥】减免 ${bigNumberTransform(r)}`); break; }
      case "库洛牌":
        if (Math.random() < 0.3) { const r = finalDamage * 0.2; finalDamage -= r; msgs.push(`【库洛牌·盾】减免 ${bigNumberTransform(r)}`); }
        break;
      case "星之杖": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【星之杖】减免 ${bigNumberTransform(r)}`); break; }
      case "梦之杖":
        if (Math.random() < 0.35) { const r = finalDamage * 0.3; finalDamage -= r; msgs.push(`【梦之杖】减免 ${bigNumberTransform(r)}`); }
        break;
      case "祈愿之力": { const r = finalDamage * 0.1; finalDamage -= r; msgs.push(`【祈愿之力】减免 ${bigNumberTransform(r)}`); break; }
      case "圆环之理":
        if (Math.random() < 0.5) { const r = finalDamage * 0.4; finalDamage -= r; msgs.push(`【圆环之理】减免 ${bigNumberTransform(r)}`); }
        break;
      case "骑士降临":
        if (Math.random() < 0.25) { const r = finalDamage * 0.3; finalDamage -= r; msgs.push(`【假面骑士降临】减免 ${bigNumberTransform(r)}`); }
        break;
      case "帝骑之力": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【帝骑之力】减免 ${bigNumberTransform(r)}`); break; }
      case "神主形态":
        if (Math.random() < 0.35) { const r = finalDamage * 0.35; finalDamage -= r; msgs.push(`【神主形态】减免 ${bigNumberTransform(r)}`); }
        break;
      case "破坏神": { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【破坏神】减免 ${bigNumberTransform(r)}`); break; }
      case "魔女扫帚": { const r = finalDamage * 0.1; finalDamage -= r; msgs.push(`【魔女扫帚】减免 ${bigNumberTransform(r)}`); break; }
      case "星穹之力": { const r = finalDamage * 0.15; finalDamage -= r; msgs.push(`【星穹之力】减免 ${bigNumberTransform(r)}`); break; }
      case "机甲武装":
        if (Math.random() < 0.4) { const r = finalDamage * 0.3; finalDamage -= r; msgs.push(`【萨姆机甲】减免 ${bigNumberTransform(r)}`); }
        break;
      case "天命一剑": { const r = finalDamage * 0.25; finalDamage -= r; msgs.push(`【天命一剑】减免 ${bigNumberTransform(r)}`); break; }
      case "神灵之泪": { const heal = Math.floor(M * 0.08); player.当前血量 = Math.min(M, (player.当前血量 || 0) + heal); msgs.push(`【神灵之泪】神王悲悯，恢复 ${bigNumberTransform(heal)} 血气`); break; }
    }
    return finalDamage;
  }

  // 功法减伤（与遮天 applyGongfaEffects 同源；originalDamage 用于「者字秘/不灭经/雷帝/涅槃」比例，runningDamage 用于「真凰/柳神/凰劫/万化」）
  // 兼容战斗态 player.功法 与长期存档 player.学习的功法。
  _gongfaReduce(player, originalDamage, runningDamage, msgs) {
    let finalDamage = runningDamage;
    const M = this._M(player);
    const learned = (g) => this._hasGongfa(player, g);

    // 者字秘（含时代系数，参考遮天）
    if (player.者字秘效果 && player.者字秘效果.剩余次数 > 0) {
      const r = originalDamage * (player.者字秘效果.减伤比例 || 0.25) * this._eraFactor;
      finalDamage -= r;
      const heal = Math.floor(M * (player.者字秘效果.恢复比例 || 0.05));
      player.当前血量 = Math.min(M, (player.当前血量 || 0) + heal);
      player.者字秘效果.剩余次数--;
      msgs.push(`【者字秘】减伤 ${bigNumberTransform(r)}，回血 ${bigNumberTransform(heal)}`);
    } else if (learned('者字秘')) {
      const r = originalDamage * 0.25 * this._eraFactor;
      finalDamage -= r;
      msgs.push(`【者字秘】向死而生·减伤 ${bigNumberTransform(r)}`);
    }

    // 不灭经
    if (player.不灭经效果 && player.不灭经效果.剩余次数 > 0) {
      const r = originalDamage * (player.不灭经效果.减伤比例 || 0.4);
      finalDamage -= r;
      const heal = Math.floor(M * (player.不灭经效果.恢复比例 || 0.3));
      player.当前血量 = Math.min(M, (player.当前血量 || 0) + heal);
      player.不灭经效果.剩余次数--;
      msgs.push(`【不灭经】减伤 ${bigNumberTransform(r)}，回血 ${bigNumberTransform(heal)}`);
    } else if (learned('不灭经')) {
      const r = originalDamage * 0.25;
      finalDamage -= r;
      msgs.push(`【不灭经】肉身不朽·减伤 ${bigNumberTransform(r)}`);
    }

    // 真凰宝术（阶段减伤）
    if (player.真凰效果 && player.真凰效果.阶段减伤 > 0) {
      const r = finalDamage * player.真凰效果.阶段减伤;
      finalDamage -= r;
      msgs.push(`【真凰宝术】减伤 ${bigNumberTransform(r)}`);
    } else if (learned('真凰宝术')) {
      const r = finalDamage * 0.20;
      finalDamage -= r;
      msgs.push(`【真凰宝术】减伤 ${bigNumberTransform(r)}`);
    }

    // 柳神法
    if (player.柳神效果 && player.柳神效果.庇护层数 > 0) {
      const r = finalDamage * (player.柳神效果.减伤比例 || 0.2);
      finalDamage -= r;
      player.柳神效果.庇护层数--;
      msgs.push(`【柳神法】庇护·减伤 ${bigNumberTransform(r)}`);
    } else if (learned('柳神法')) {
      const r = finalDamage * 0.15;
      finalDamage -= r;
      msgs.push(`【柳神法】减伤 ${bigNumberTransform(r)}`);
    }

    // 涅槃仙功
    if (player.涅槃仙功效果 && player.涅槃仙功效果.剩余次数 > 0) {
      const r = originalDamage * (player.涅槃仙功效果.减伤比例 || 0.2);
      finalDamage -= r;
      player.涅槃仙功效果.剩余次数--;
      msgs.push(`【涅槃仙功】减伤 ${bigNumberTransform(r)}`);
    } else if (learned('涅槃仙功')) {
      const r = finalDamage * 0.15;
      finalDamage -= r;
      msgs.push(`【涅槃仙功】减伤 ${bigNumberTransform(r)}`);
    }

    // 雷帝宝术（转化治疗）
    if (player.雷帝效果 && player.雷帝效果.剩余次数 > 0) {
      const heal = Math.min(Math.floor(originalDamage * (player.雷帝效果.转化比例 || 0.6)), M - (player.当前血量 || 0));
      player.当前血量 = Math.min(M, (player.当前血量 || 0) + heal);
      player.雷帝效果.剩余次数--;
      msgs.push(`【雷帝宝术】转化治疗 ${bigNumberTransform(heal)}`);
    } else if (learned('雷帝宝术')) {
      const heal = Math.floor(M * 0.10);
      player.当前血量 = Math.min(M, (player.当前血量 || 0) + heal);
      msgs.push(`【雷帝宝术】劫力转化·回血 ${bigNumberTransform(heal)}`);
    }

    // 万化圣诀（免死在 _tryRevive 处理，这里给常驻减伤）
    if (learned('万化圣诀') && !(player.万化圣诀效果)) {
      const r = finalDamage * 0.10;
      finalDamage -= r;
      msgs.push(`【万化圣诀】化死为生·减伤 ${bigNumberTransform(r)}`);
    }

    // 凰劫再生术
    if (player.凰劫效果 && player.凰劫效果.阶段减伤 > 0) {
      const r = finalDamage * player.凰劫效果.阶段减伤;
      finalDamage -= r;
      msgs.push(`【凰劫再生术】减伤 ${bigNumberTransform(r)}`);
    } else if (learned('凰劫再生术')) {
      const r = finalDamage * 0.15;
      finalDamage -= r;
      msgs.push(`【凰劫再生术】减伤 ${bigNumberTransform(r)}`);
    }

    return finalDamage;
  }

  // ============ 功法复活（与遮天 checkGongfaResurrection 同源，作用于 player.当前血量 池）============
  // 返回复活方式描述字符串；无可用复活则返回 null（渡劫失败）
  _hasGongfa(player, gongfa) {
    return hasXianguGongfa(player, gongfa);
  }

  _tryRevive(player) {
    const M = this._M(player);

    // 1. 免死效果（真凰/万化圣诀）
    if (player.真凰效果 && player.真凰效果.免死) {
      delete player.真凰效果.免死;
      player.当前血量 = Math.floor(M * 0.5);
      this.revived = true;
      return '真凰涅槃·免死';
    }
    if (player.万化圣诀效果 && player.万化圣诀效果.免死) {
      delete player.万化圣诀效果.免死;
      player.当前血量 = Math.floor(M * 0.5);
      this.revived = true;
      return '万化圣诀·免死';
    }

    // 2. 生命本源 + 复活功法
    player.生命本源 = player.生命本源 ?? 100;
    const reviveGongfa = REVIVE_GONGFA.find((g) => this._hasGongfa(player, g));
    if (player.生命本源 >= 50 && reviveGongfa) {
      player.生命本源 -= 50;
      player.当前血量 = Math.floor(M * 0.5);
      this.revived = true;
      return `功法复活·${reviveGongfa}（消耗50生命本源，剩余 ${player.生命本源}）`;
    }

    return null;
  }

  // ============ 一道劫：灵根减伤 → 濒死复活 → 功法减伤 → 真实扣血 ============
  _dealWave(player, frac, wave, note, opts = {}) {
    const M = this._M(player);
    const baseRaw = M * frac * (1 + 0.03 * (wave - 1));
    const base = baseRaw * this._eraFactor; // 时代系数
    const { damage: bodyDamage, msgs: bodyMsgs } = this._applyBodyDefenses(player, base);
    const sourceName = opts.sourceName || '道火本源';
    const fatalName = opts.fatalName || '劫力';

    const lines = [];
    lines.push(`　第${wave}道劫｜${note}`);
    lines.push(`　${sourceName} ${bigNumberTransform(base)}（时代系数×${this._eraFactor}）｜灵根减伤后 ${bigNumberTransform(bodyDamage)}`);
    for (const m of bodyMsgs) lines.push(`　　${m}`);

    const gongfaMsgs = [];
    const settlement = settleXianguWaveDamage({
      player,
      bodyDamage,
      tryRevive: () => this._tryRevive(player),
      applyGongfaReduction: () => this._gongfaReduce(player, base, bodyDamage, gongfaMsgs),
    });
    if (settlement.revival) {
      lines.push(`　${fatalName}致死！先触发${settlement.revival}｜血量回升至 ${bigNumberTransform(settlement.revivedHp)}`);
    }
    for (const m of gongfaMsgs) lines.push(`　　${m}`);
    lines.push(`　功法减伤后实受 ${bigNumberTransform(settlement.damage)}`);

    if (settlement.dead) {
      this.dead = true;
      lines.push(`　${fatalName}彻底磨灭生机，功法难救——渡劫失败！`);
      return { lines, dead: true };
    }

    return { lines, dead: false };
  }

  // ============ 一道劫：回血（炉鼎护身/复苏）+ 战报行 ============
  _waveCure(player, frac, note) {
    const h = Math.floor(this._M(player) * frac);
    const M = this._M(player);
    player.当前血量 = Math.min(M, (player.当前血量 || 0) + h);
    return `　道火淬炼｜${note}｜恢复 ${bigNumberTransform(h)} 点血量`;
  }

  _restoreToFull(player) {
    const before = player.当前血量 || 0;
    const maxHp = this._M(player);
    player.当前血量 = maxHp;
    return Math.max(0, maxHp - before);
  }

  // ============ 阶段演出辅助：每道劫独立推播 + 道间/阶段间 sleep（对齐遮天渡劫播报节奏）============
  // 与遮天一致：每打一道就 e.reply 一次 + 道间 sleep，阶段末尾再 sleep 阶段间隔
  // 祭炼道数更少（3-4 道/阶段 vs 遮天 9 道/阶段），故道间隔取 3.5s（遮天 8-12s）
  async _stageWaves(e, player, introLines, waves, tailLines = [], opts = {}) {
    const waveInterval = opts.waveInterval || 3500;   // 道间间隔
    const stageInterval = opts.stageInterval || 3000; // 阶段间间隔

    // 阶段 intro 一次性推播
    await e.reply([...introLines, '', opts.reportTitle || '——道火劫报——'].join('\n'));
    await sleep(1500);

    // 每道劫独立推播：与遮天 `await broadcastToAll + battleLog=[] + sleep` 同构
    for (let i = 0; i < waves.length; i++) {
      const wave = (opts.waveOffset || 0) + i + 1;
      const r = this._dealWave(player, waves[i].frac, wave, waves[i].note, opts);
      const waveLines = [...r.lines, '', this._bar(player)];
      await e.reply(waveLines.join('\n'));
      if (r.dead) {
        await sleep(stageInterval);
        return true;
      }
      if (i < waves.length - 1) {
        await sleep(waveInterval);
      }
    }

    // 阶段总结（叙事转折 + 「阶段渡过」确认）
    const summaryText = opts.summaryText || '【阶段渡过】炉火炼真我，本阶段道火告一段落';
    const summary = tailLines.length > 0
      ? [...tailLines, '', summaryText]
      : [summaryText];
    await e.reply(summary.join('\n'));
    await sleep(stageInterval);
    return false;
  }

  // ============ 主流程 ============
  async run(e, player, ctx) {
    const name = player.名号 || '修士';
    const successRate = this.calcSuccessRate(ctx.completed, ctx.daoyun);

    // 尊者境点燃神火：这是三千道火洗礼，并非天神境后的「以身为种」。
    await e.reply([
      `【祭炼真我·以天地为炉】`,
      ``,
      `${name}立于仙古花蕾之下，三千青石路无声。`,
      `不借外物，以三千大道为火，祭炼肉身与元神！`,
      ``,
      `"以天地为炉，以万道为火，焚肉身，烧元神，筑真我。"`,
      `——这条路，古来走者多形神俱灭。`,
      ``,
      `当前时代系数：×${this._eraFactor}（结算顺序：灵根减伤 / 功法复活 / 功法减伤）`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(1600);

    await this.stage1(e, name, player);
    if (this.dead) return { success: false, revived: this.revived };
    await this.stage2(e, name, player);
    if (this.dead) return { success: false, revived: this.revived };
    await this.stage3(e, name, player);
    if (this.dead) return { success: false, revived: this.revived };
    await this.stage4(e, name, player);
    if (this.dead) return { success: false, revived: this.revived };
    await this.stage5(e, name, player);
    if (this.dead) return { success: false, revived: this.revived };

    const success = Math.random() <= successRate;
    await e.reply(success ? [
      `【三千道火·祭炼圆满】`,
      ``,
      `三千大道火光次第熄灭，最终尽数归于${name}体内。`,
      `肉身与元神熬炼无瑕，一点神火自体内燃起。`,
      `这不是借种成道，而是以万道为火，筑成唯一真我！`
    ].join('\n') : [
      `【三千道火·祭炼未成】`,
      ``,
      `${name}未能令三千道火归一，真火在最后一刻溃散。`,
      `道基尚存，却需重新积累道韵后再行尝试。`
    ].join('\n'));

    return { success, revived: this.revived };
  }

  // ============ 第一重：引动道火·割肉裂魂（试错的开始）============
  async stage1(e, name, player) {
    const intro = [
      `【第一重·引动道火·割肉裂魂】`,
      ``,
      `${name}引动外部大道——非单一古火，而是十几条青石路上的道则！`,
      `一簇又一簇大道符号缭绕肉身，炽盛无比……下一刻，竟将自身烧出大窟窿！`,
      `血肉模糊，露出晶莹白骨。"好痛！"`,
      `道则在烧其躯干、燃其精魂，如同一柄又一柄仙剑斩来，在割肉、在裂魂。`
    ];
    const dead = await this._stageWaves(e, player, intro, [
      { frac: 0.10, note: '十几道道则如仙剑斩来，割肉裂魂' },
      { frac: 0.12, note: '大道符号缭绕，烧出大窟窿' },
      { frac: 0.14, note: '道火焚躯干、燃其精魂' },
      { frac: 0.16, note: '伤势加重，几近断开' }
    ], [
      `${name}终于明白，为何古来走另类成神路者皆殒落。`,
      `"我做的不够好，有偏差——这不是熬炼，这是在自我毁灭。"`,
      `骤然睁眼："不是如此！必须改变，不然走不到尽头便伤殒！"`
    ]);
    if (dead) return;
  }

  // ============ 第二重：乾坤为炉·虚空凝鼎（第一次转变思维）============
  async stage2(e, name, player) {
    // 阶段 intro 一次性推播
    await e.reply([
      `【第二重·乾坤为炉·虚空凝鼎】`,
      ``,
      `${name}叱喝："乾坤为炉！"`,
      `挣脱出来，离地悬坐。虚空扭曲，天穹似压落，青石路腾起贴近。`,
      `无形间，体外凝出一座虚空炉鼎，将${name}收在当中。`,
      `十几道火光被撑开，开始沸腾——煅烧那口炉鼎，而非裹身！`,
      `道火之威骤减，身上的大窟窿竟渐渐愈合，肌体发光。`,
      ``,
      `——道火劫报（炉鼎护身，反受其淬）——`
    ].join('\n'));
    await sleep(2000);

    // 3 道淬炼回血，每道一道独立推播（对齐遮天逐道节奏）
    const heals = [
      { frac: 0.11, note: '鼎壁隔绝道火，伤体渐愈·第一缕' },
      { frac: 0.11, note: '鼎内温养，肌体生辉·第二缕' },
      { frac: 0.11, note: '道火反哺，道基凝实·第三缕' }
    ];
    for (let i = 0; i < heals.length; i++) {
      const healLine = this._waveCure(player, heals[i].frac, heals[i].note);
      await e.reply([
        `【第二重·第${i + 1}道淬炼】`,
        ``,
        healLine,
        ``,
        this._bar(player)
      ].join('\n'));
      if (i < heals.length - 1) await sleep(3500);
    }

    // 阶段总结
    await e.reply([
      `鼎内温养三道，${name}血肉重塑、道基初凝。`,
      ``,
      `【阶段渡过】炉火炼真我，本阶段道火告一段落`
    ].join('\n'));
    await sleep(3000);
  }

  // ============ 第三重：再疑·以火锻己（第二次试错 → 再转变）============
  async stage3(e, name, player) {
    const intro = [
      `【第三重·再疑·以火锻己】`,
      ``,
      `炉鼎中，${name}却蹙眉："还是不对，与我的本意不符。"`,
      `温和的火只护住了他，却非他要走的路。`,
      `"我只是以这些道为火，烧身燃神，锻造真我，而不是去效仿古法！"`,
      `鼎仍在，但火不同了——盛烈刺透躯体，令他浑身喷火，伤又出现。`,
      `道火增至几十种，肉身再现破损。`
    ];
    const dead = await this._stageWaves(e, player, intro, [
      { frac: 0.09, note: '盛烈刺透躯体，浑身喷火' },
      { frac: 0.11, note: '几十种道火齐至，伤又出现' },
      { frac: 0.13, note: '以火锻己，再踏死地' }
    ]);
    if (dead) return;
  }

  // ============ 第四重：炉火纯青·一百零八道 + 假死悬念 ============
  async stage4(e, name, player) {
    const intro = [
      `【第四重·炉火纯青·一百零八道】`,
      ``,
      `一百零八道火焰齐聚！${name}清楚不能一蹴而就，只引"小火"慢慢适应。`,
      `自身被点燃，血肉干枯瘦一圈，浑身焦黑如炭，大小窟窿伤痕上百处。`
    ];
    const dead = await this._stageWaves(e, player, intro, [
      { frac: 0.12, note: '一百零八道火焰齐聚，血肉干枯' },
      { frac: 0.13, note: '浑身焦黑如炭，窟窿上百处' },
      { frac: 0.15, note: '天地为熔炉·肉身即熔炉，火光涌入' }
    ]);
    if (dead) return;

    // 假死悬念幕（原著：炉鼎化去，坠地如骷髅，三日寂灭，第五日复苏）
    player.当前血量 = 1; // 真我寂灭，仅余一息
    await e.reply([
      `【天地寂灭·如化石骸】`,
      ``,
      `乾坤炉鼎化去，一百零八道火消退。`,
      `${name}坠落青石阶，通体焦黑、皮包骨头，一动也不能动。`,
      `外界哗然："妄自而为，烧废了！"`,
      `……（三日寂灭，生气渐消）`,
      ``,
      `剩余血量：${bigNumberTransform(1)}/${bigNumberTransform(this._M(player))}（肉身完整度 0%·假死）`
    ].join('\n'));
    await sleep(3200);

    // 第五日·真我复苏（回血）
    const reviveHp = Math.floor(this._M(player) * 0.5);
    player.当前血量 = Math.min(this._M(player), reviveHp);
    await e.reply([
      `第五日。`,
      `${name}猛地睁眼，真我复苏！`,
      `一百零八处伤痕内，有火光跳动，圣焰滋养全身。`,
      `"炉火纯青，这一步走到了头。"`,
      ``,
      `——道火劫报（真我复苏）——`,
      `　道火淬炼｜圣焰滋养全身｜恢复 ${bigNumberTransform(reviveHp - 1)} 点血量`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2400);
  }

  // ============ 第五重：三千道火齐现·上苍窥伺 ============
  async stage5(e, name, player) {
    const intro = [
      `【第五重·三千道火齐现·上苍窥伺】`,
      ``,
      `"就以这种程度的火焚烧，直到三千种大道火光齐现。"`,
      `仙道花蕾三千花瓣，对应三千青石路，大道火光次第亮起。`,
      `上苍窥伺，万道齐焚——这是终极的道火洗礼。`,
      `${name}立于火海中央，肌体由内而外透出神光。`
    ];
    const dead = await this._stageWaves(e, player, intro, [
      { frac: 0.10, note: '三千大道火光齐现，上苍窥伺' },
      { frac: 0.12, note: '万道齐焚·终极洗礼' },
      { frac: 0.13, note: '道火灌顶，真我临界' }
    ]);
    if (dead) return;
  }

  async runRealmBreakthrough(e, player, ctx = {}) {
    this.revived = false;
    this.dead = false;

    const route = XIANGU_REALM_ROUTES[Number(ctx.fromLevelId ?? player.xiangulevel_id)];
    if (!route || typeof this[route.tribulationMethod] !== 'function') {
      throw new Error('当前境界没有对应的仙古今世法渡劫');
    }
    return this[route.tribulationMethod](e, player);
  }

  async runXianqiCondensation(e, player, targetStrand) {
    this.revived = false;
    this.dead = false;

    const current = getXianqiStrands(player);
    if (Number(player.xiangulevel_id) !== 8 || current === 0 || targetStrand !== current + 1) {
      throw new Error('仙气试炼次序不正确');
    }
    if (targetStrand === 2) return this._runSecondXianqiTrial(e, player);
    if (targetStrand === 3) return this._runThirdXianqiTrial(e, player);
    throw new Error('不存在对应的仙气试炼');
  }

  async _runSecondXianqiTrial(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【神火极境·第二道仙气】`,
      ``,
      `${name}没有叩击真一境壁垒，而是将境界继续压在神火绝巅。`,
      `第一道仙气化作引子，万道规则反向灌入肉身与元神。`
    ].join('\n'));
    await sleep(1500);

    const dead = await this._stageWaves(e, player, [
      `【仙气再生·万道熬炼】`,
      `这不是境界突破，而是在神火境已经走到尽头后再开一条路。`
    ], [
      { frac: 0.07, note: '万道规则入体，神火道果震荡' },
      { frac: 0.085, note: '古代强者烙印显化，同境围杀' },
      { frac: 0.10, note: '肉身与元神同时龟裂，仙气重组真我' },
      { frac: 0.13, note: '大道铡刀落下，斩去神火境旧极限' }
    ], [
      `${name}以第一道仙气护住真我，在毁灭中牵引出第二道仙气。`,
      `境界仍是神火，生命层次却已再次蜕变。`
    ], {
      reportTitle: '——神火极境·第二道仙气试炼——',
      sourceName: '万道劫光',
      fatalName: '极境反噬',
      summaryText: '【第二道仙气】双气绕体，神火道果再破极限',
      waveInterval: 2500,
      stageInterval: 2000,
    });

    return { success: !dead, revived: this.revived, targetStrand: 2 };
  }

  async _runThirdXianqiTrial(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【神火绝巅·第三道仙气】`,
      ``,
      `${name}身绕两道仙气，仍旧拒绝迈入真一。`,
      `要在神火境内完成最后一次蜕变，唯有主动迎向最可怕的天地审判。`
    ].join('\n'));
    await sleep(1500);

    const dead = await this._stageWaves(e, player, [
      `【终极蜕变·三气归一】`,
      `天地不允许神火境拥有这样的道果，雷海、大道古器与铡刀同时显化。`
    ], [
      { frac: 0.075, note: '雷霆凶兽成群扑杀，双气护体' },
      { frac: 0.09, note: '大道古器横空，镇压肉身元神' },
      { frac: 0.105, note: '时间碎片割裂真我，神火近乎熄灭' },
      { frac: 0.12, note: '仙道劫光贯体，两道仙气反复崩散重聚' },
      { frac: 0.15, note: '大道铡刀终极斩落，第三道仙气破劫而生' }
    ], [
      `${name}从毁灭中重塑道躯，第三道仙气终于与前两道并立。`,
      `三道仙气圆满，神火境绝巅道果功成。`
    ], {
      reportTitle: '——神火绝巅·第三道仙气试炼——',
      sourceName: '仙道劫光',
      fatalName: '天地审判',
      summaryText: '【三道仙气圆满】神火境内三次蜕变尽数完成',
      waveInterval: 2500,
      stageInterval: 2000,
    });

    return { success: !dead, revived: this.revived, targetStrand: 3 };
  }

  async _runZhenyiTribulation(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【神火大圆满·史上最强天劫】`,
      ``,
      `${name}压制多年的神火冲至极尽，强行引动这个时代本已消失的天劫。`,
      `雷海倾覆，这一战只为突破真一；仙气道果已在神火境定型，不会在晋阶时补生。`
    ].join('\n'));
    await sleep(1500);

    let dead = await this._stageWaves(e, player, [
      `【第一关·大道铡刀】`,
      `雷海孕育古老刑罚，专斩最强一列的肉身、元神与道果。`
    ], [
      { frac: 0.07, note: '山岳雷霆倾落，雷海淬体' },
      { frac: 0.08, note: '饕餮等雷霆凶兽扑杀' },
      { frac: 0.10, note: '金色天碑镇压肉身' },
      { frac: 0.13, note: '大道铡刀斩断肉身与元神' }
    ], [
      `${name}以不灭神火护住真我，在毁灭中强行重组断体。`,
      `真一境壁垒轰然破碎，但后面的九重天劫才刚刚开始。`
    ], {
      reportTitle: '——最强雷劫·前四劫——',
      sourceName: '雷劫本源',
      fatalName: '大道雷罚',
      summaryText: '【突破真一】神火道果升华，仙气数量保持不变'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 9 };

    const healed = this._restoreToFull(player);
    await e.reply([
      `【真一升华·断体再生】`,
      ``,
      `${name}晋入真一境，断骨再生，裂痕尽去。`,
      `突破恢复 ${bigNumberTransform(healed)} 点血量；雷海随即再次暴动。`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【第二关·九重天与第十雷域】`,
      `同阶古代强者、太古凶兽与大道古器从雷海中复苏。`
    ], [
      { frac: 0.055, note: '古代铁骑与太古凶兽围杀' },
      { frac: 0.06, note: '青铜古殿、九重塔与神秘大钟镇压' },
      { frac: 0.065, note: '黑暗牢笼拘禁元神，时间碎片割魂' },
      { frac: 0.07, note: '连续击穿九重雷天' },
      { frac: 0.08, note: '第十雷域与斩仙台余波' }
    ], [
      `${name}击穿第十层雷域，在金色雷池中取得雷池真液。`,
      `史上最强天劫至此散去。`
    ], {
      waveOffset: 4,
      reportTitle: '——最强雷劫·九天十地——',
      sourceName: '雷劫本源',
      fatalName: '大道雷罚',
      summaryText: '【天劫渡尽】肉身与元神经九天十地淬炼圆满'
    });

    return { success: !dead, revived: this.revived, targetLevelId: 9, reward: '雷池真液' };
  }

  async _runShengjiTribulation(e, player) {
    const name = player.名号 || '修士';
    const xianqi = getXianqiStrands(player);
    await e.reply([
      `【真一境圆满·圣祭之路】`,
      ``,
      `${name}不借兵器替劫，选择以全身修为逐寸献祭。`,
      `这场洗礼形似雷霆，却是法则与道痕垂落，并非真正雷电。`
    ].join('\n'));
    await sleep(1500);

    let dead = await this._stageWaves(e, player, [
      `【圣祭洗礼·法则斩身】`,
      `每一处血肉都要经历修为跌落与重塑，使已有道果化成大道之花。`
    ], [
      { frac: 0.04, note: '法则斩落左臂修为，跌回神火层次' },
      { frac: 0.045, note: '道痕洞穿胸膛，脏腑被逐一祭炼' },
      { frac: 0.05, note: '元神与肉身反复跌境、重塑' },
      { frac: 0.055, note: '全身十度圣祭，道果归于稳定' }
    ], [
      xianqi > 0
        ? `${name}以神火境修成的${xianqi}道仙气护持道果，完成圣祭。`
        : `${name}以完整神火道果护持真我，完成圣祭。`,
      `然而要铸成至强神王身，还需主动迎击真正的神王劫。`
    ], {
      reportTitle: '——圣祭法则洗礼——',
      sourceName: '法则道痕',
      fatalName: '圣祭反噬',
      summaryText: '【圣祭完成】这不是雷劫，而是全身道果的反复献祭与重塑'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 10 };

    const healed = this._restoreToFull(player);
    await e.reply([
      `【大道之花·圣祭复苏】`,
      `${name}的道果重新稳定，恢复 ${bigNumberTransform(healed)} 点血量。`,
      `下一刻，真正的神王劫跨越虚空降临！`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【神王劫·十重天】`,
      `此劫不为普通晋阶，只为熬炼古来罕见的至强神王身。`
    ], [
      { frac: 0.045, note: '山岳铜锣合击，震裂肉身' },
      { frac: 0.05, note: '雷泽翻涌，鳄祖扑杀' },
      { frac: 0.055, note: '金色大日横空，金乌焚身' },
      { frac: 0.06, note: '古代骑士与九名同阶强者围攻' },
      { frac: 0.065, note: '飞仙之光横斩躯体' },
      { frac: 0.075, note: '第八重天雷霆骨炉熬炼肉身元神' },
      { frac: 0.075, note: '第九重天压落修为，万灵古木袭杀' },
      { frac: 0.08, note: '第十重天真龙真凰与古台终极镇压' }
    ], [
      `${name}以残躯登临第十重天，沐浴雷池真液。`,
      `神王劫尽，圣祭道果彻底稳定。`
    ], {
      reportTitle: '——神王雷劫——',
      sourceName: '神王劫力',
      fatalName: '神王雷罚',
      summaryText: '【神王劫毕】至强神王身经十重雷劫熬炼而成'
    });

    return { success: !dead, revived: this.revived, targetLevelId: 10, reward: '雷池真液' };
  }

  async _runTianshenBreakthrough(e, player) {
    const name = player.名号 || '修士';
    const xianqi = getXianqiStrands(player);
    const healed = this._restoreToFull(player);

    await e.reply([
      `【圣祭圆满·晋阶天神】`,
      ``,
      xianqi === 3
        ? `${name}将三道仙气凝成三朵大道之花，神火极境道果圆融无缺。`
        : xianqi > 0
          ? `${name}将已有${xianqi}道仙气化作大道之花，继续承载自身道果。`
          : `${name}以完整神火道果凝成大道之花，承载自身修为。`,
      `积累的神性精华化开，生命层次自然跃升。`,
      ``,
      `【原著规则】此次晋阶不降雷劫。`,
      `雷劫被主动延后，待日后融合自身之种时再作最终淬炼。`,
      `境界升华恢复 ${bigNumberTransform(healed)} 点血量。`
    ].join('\n'));
    await sleep(2000);

    return { success: true, revived: false, targetLevelId: 11, noTribulation: true };
  }

  async _runXudaoTribulation(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【天神绝巅·以身为种】`,
      ``,
      `${name}舍弃与外界完美道种相合的旧路，以人体为种，开启体内无尽之门。`,
      `此道不受大天地认可，一旦天机泄露，必遭上苍抹杀。`
    ].join('\n'));
    await sleep(1500);

    let dead = await this._stageWaves(e, player, [
      `【第一关·种子中悟道】`,
      `天地胎盘暂时遮掩天机，秩序神链仍不断反噬。`
    ], [
      { frac: 0.025, note: '秩序神链缠身，分解大道本质' },
      { frac: 0.03, note: '金色规则粒子共振，冲击体内仙门' },
      { frac: 0.035, note: '大道化成金色巨锤，初次轰击肉身' }
    ], [
      `${name}不再向外界借种，体内众门逐一显形。`,
      `种已初成，遮掩天机的石板也开始失去作用。`
    ], {
      reportTitle: '——以身为种·大道反噬——',
      sourceName: '秩序反噬',
      fatalName: '大道反噬',
      summaryText: '【种子初成】人体小天地开始与外界大乾坤并立'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 12 };

    const healed = this._restoreToFull(player);
    await e.reply([
      `【种成·天机暴露】`,
      ``,
      `石板最后一次护住${name}，恢复 ${bigNumberTransform(healed)} 点血量。`,
      `随后庇护彻底散去，上苍发现了这条不受认可的新路。`,
      `神塔、大钟、天刀与仙剑自雷海中同时显化！`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【第二关·欺天之劫】`,
      `这不是寻常晋阶雷劫，而是天地要将以身为种者从世间彻底抹去。`
    ], [
      { frac: 0.07, note: '金色天锤落下，粉碎血肉骨骼' },
      { frac: 0.08, note: '神塔与大道钟波镇压元神' },
      { frac: 0.095, note: '天刀仙剑密布虚空，无处可避' },
      { frac: 0.12, note: '雷海与秩序汪洋倾覆，执行最终抹杀' }
    ], [
      `${name}在毁灭中不再压制境界，体内众门齐开。`,
      `人体秘境与仙古道果彼此印证，天神壁垒被一举冲破！`
    ], {
      waveOffset: 3,
      reportTitle: '——上苍天谴·欺天之劫——',
      sourceName: '天谴劫力',
      fatalName: '上苍抹杀',
      summaryText: '【以身为种】天谴未能抹去真我，虚道境门户洞开'
    });

    return { success: !dead, revived: this.revived, targetLevelId: 12, path: '以身为种' };
  }

  async _runZhanwoTribulation(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【虚道绝巅·斩我明道】`,
      ``,
      `${name}在虚道境将自身大道推至极限，引来古来排名前三的绝世大劫。`,
      `原著中石昊在此劫后已可随时踏入斩我，却为夯实道基主动压境；本次冲关将走完那一步。`
    ].join('\n'));
    await sleep(1500);

    let dead = await this._stageWaves(e, player, [
      `【第一关·九重雷天】`,
      `雷海演化诸天强敌与大道古器，每一层都比前一层更接近绝境。`
    ], [
      { frac: 0.035, note: '雷霆凶兽与同阶古代强者围杀' },
      { frac: 0.04, note: '大道古器横空，肉身元神同时受创' },
      { frac: 0.045, note: '时间碎片飞舞，斩落旧日道痕' },
      { frac: 0.05, note: '九重雷天连续镇压，真我几近崩散' },
      { frac: 0.06, note: '仙光贯体，三大至尊术自行护主' }
    ], [
      `${name}击穿九重雷天，旧我裂痕被雷霆逐一照见。`,
      `劫云之上还有最后一层天，毁灭中孕育着复活的秘密。`
    ], {
      reportTitle: '——古来前三绝世大劫——',
      sourceName: '绝世雷劫',
      fatalName: '九天雷罚',
      summaryText: '【九重天尽】三大至尊术齐出，护住一点不灭真我'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 13 };

    const healed = this._restoreToFull(player);
    await e.reply([
      `【雷池复苏·最后一层天】`,
      ``,
      `${name}饮下雷池真液，在毁灭中复苏，恢复 ${bigNumberTransform(healed)} 点血量。`,
      `三头雷灵自雷池深处现身，既争夺造化，也引来最后的雷罚。`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【第二关·雷池与雷灵】`,
      `最后一层天中毁灭与生机并存，唯有斩去虚妄旧我，才能带着真我归来。`
    ], [
      { frac: 0.045, note: '雷灵穿梭雷海，争夺雷池造化' },
      { frac: 0.05, note: '仙道劫光洗去旧我执念' },
      { frac: 0.055, note: '雷池翻覆，毁灭本源灌入元神' },
      { frac: 0.06, note: '肉身再碎，唯余真我执掌大道' },
      { frac: 0.075, note: '最后一层天合拢，绝世雷罚终极轰杀' }
    ], [
      `${name}从雷池中重新站起，降服三头雷灵。`,
      `虚妄旧我尽斩，真我明悟，斩我境门户彻底洞开。`
    ], {
      waveOffset: 5,
      reportTitle: '——绝世大劫·最后一层天——',
      sourceName: '雷池本源',
      fatalName: '绝世雷罚',
      summaryText: '【斩我明道】斩去虚妄旧我，真我与自身大道相合'
    });

    return {
      success: !dead,
      revived: this.revived,
      targetLevelId: 13,
      path: '斩我明道',
      reward: '雷池真液',
      thunderSpirits: dead ? 0 : 3,
      routeText: '绝世大劫渡尽，斩去虚妄旧我，并从雷池中降服三头雷灵。'
    };
  }

  async _runDunyiTribulation(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【斩我绝巅·遁去其一】`,
      ``,
      `${name}补全斩我境的最后道痕，以完整法则叩问遁一。`,
      `本关先重现斩我阶段的斩仙铡刀淬炼，再承受原著明确记载的遁一天劫。`
    ].join('\n'));
    await sleep(1500);

    let dead = await this._stageWaves(e, player, [
      `【第一关·斩仙铡刀】`,
      `雷池古台升起，铡刀针对境界显化，号称难以熬过的必死之劫。`
    ], [
      { frac: 0.04, note: '千百雷光磨灭斩我道痕' },
      { frac: 0.045, note: '雷池古台锁定肉身与元神' },
      { frac: 0.055, note: '斩仙铡刀落下，斩开元神印记' },
      { frac: 0.07, note: '不朽印记连同旧日束缚一并斩断' }
    ], [
      `${name}没有避开铡刀，反借刀锋斩下体内不朽印记。`,
      `外来束缚既除，自身大道终于完整无缺。`
    ], {
      reportTitle: '——斩我前置淬炼·雷池古台——',
      sourceName: '铡刀劫光',
      fatalName: '斩仙铡刀',
      summaryText: '【印记斩落】借必死之劫斩除外来不朽印记'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 14 };

    const healed = this._restoreToFull(player);
    await e.reply([
      `【道基圆满·遁一天劫】`,
      ``,
      `${name}以雷池真液修复残躯，恢复 ${bigNumberTransform(healed)} 点血量。`,
      `境界壁垒松动，真正的遁一天劫遮蔽天宇。原著只以“可怕无边、满身是血、九死一生”概括此战。`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【第二关·遁一大劫】`,
      `完整大道与天地规则正面碰撞，一线生机藏在无边毁灭之中。`
    ], [
      { frac: 0.045, note: '万道雷霆压落，斩我道果开始蜕变' },
      { frac: 0.05, note: '法则汪洋冲刷，血肉片片剥落' },
      { frac: 0.055, note: '大道锁链贯穿元神，封死退路' },
      { frac: 0.065, note: '雷海倾覆，道躯崩解后强行重组' },
      { frac: 0.075, note: '天地万法合击，只留遁去的一线生机' },
      { frac: 0.085, note: '九死一生，踏出斩我境最后一步' }
    ], [
      `${name}满身是血地走出雷海，取到价值惊人的雷池真液。`,
      `大道遁去其一，道行超然物外，正式踏入遁一境。`
    ], {
      waveOffset: 4,
      reportTitle: '——遁一境·可怕无边之劫——',
      sourceName: '遁一劫力',
      fatalName: '遁一雷罚',
      summaryText: '【遁去其一】九死一生渡过遁一天劫'
    });

    return {
      success: !dead,
      revived: this.revived,
      targetLevelId: 14,
      path: '遁去其一',
      reward: '雷池真液',
      routeText: '斩仙铡刀斩去外来印记，继而九死一生渡过遁一天劫。'
    };
  }

  async _runZhizunTribulation(e, player) {
    const name = player.名号 || '修士';
    await e.reply([
      `【遁一大圆满·至尊路】`,
      ``,
      `${name}要越过人道天堑，在五百岁禁忌线前强闯至尊。`,
      `此关不是普通雷劫：天地将以业火、意志与大道尸骨路连续拷问成道之心。`
    ].join('\n'));
    await sleep(1500);

    let dead = await this._stageWaves(e, player, [
      `【第一关·红尘业火】`,
      `成道执念化作业火，由内而外焚烧血肉、元神与一生因果。`
    ], [
      { frac: 0.04, note: '万念冲霄，成道执念反噬己身' },
      { frac: 0.045, note: '红尘业火自血肉深处燃起' },
      { frac: 0.055, note: '一生因果化焰，元神近乎枯竭' },
      { frac: 0.07, note: '业火焚尽杂念，只留成道真心' }
    ], [
      `${name}从焦黑躯壳中涅槃，踏入准至尊层次。`,
      `这并非终点，天地意志的正式拷问才刚刚开始。`
    ], {
      reportTitle: '——至尊路·红尘业火——',
      sourceName: '红尘业火',
      fatalName: '业火焚身',
      summaryText: '【业火渡尽】斩落杂念，迈入准至尊领域'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 15 };

    let healed = this._restoreToFull(player);
    await e.reply([
      `【涅槃复苏·天地拷问】`,
      ``,
      `${name}运转不死术重塑道躯，恢复 ${bigNumberTransform(healed)} 点血量。`,
      `赤、紫、金三色意志之光自天外落下；它们像雷霆，却绝非雷霆。`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【第二关·天地意志】`,
      `每一道光都不可闪避，分别拷问肉身、元神与承载大道的资格。`
    ], [
      { frac: 0.05, note: '赤色意志之光锁定天灵，拷问肉身' },
      { frac: 0.055, note: '紫色意志之光震荡元神，险些令其炸开' },
      { frac: 0.06, note: '金色审判之光压落，天地意志镇压道果' },
      { frac: 0.07, note: '虚空割裂，时光碎片反复切割真我' },
      { frac: 0.085, note: '乾坤本源压身，拒绝五百岁前成道' }
    ], [
      `${name}扛过三色意志之光，却发现道行仍未圆满。`,
      `灰暗虚空中，一条铺满至尊尸骨的古路缓缓浮现。`
    ], {
      waveOffset: 4,
      reportTitle: '——至尊路·天地拷问——',
      sourceName: '天地意志',
      fatalName: '天地拷问',
      summaryText: '【天地拷问】肉身、元神与道果经受大乾坤审判'
    });
    if (dead) return { success: false, revived: this.revived, targetLevelId: 15 };

    healed = this._restoreToFull(player);
    await e.reply([
      `【至尊尸骨路·九天九夜】`,
      ``,
      `${name}短暂复苏，恢复 ${bigNumberTransform(healed)} 点血量，随后独自踏上尸骨古路。`,
      `此路摹刻历代失败者，死气、规则神兵与大道本源将连续磨灭闯关者。`,
      ``,
      this._bar(player)
    ].join('\n'));
    await sleep(2500);

    dead = await this._stageWaves(e, player, [
      `【第三关·至尊路上多尸骨】`,
      `九天九夜里每日皆临生死，最惨时只余元神、残骨与数滴真血。`
    ], [
      { frac: 0.055, note: '尸骨古路蔓延死气，要将生者化作枯骨' },
      { frac: 0.065, note: '规则神矛突现，洞穿额骨与元神' },
      { frac: 0.075, note: '历代失败烙印齐出，拖拽真我沉沦' },
      { frac: 0.085, note: '大道本源拷问：成道是否顺其自然' },
      { frac: 0.10, note: '九天九夜最后一击，只余残骨与真血' }
    ], [
      `${name}借大天地载道，强行走完至尊路；急于求成也在道基中留下了一丝隐患。`,
      `尸骨路散去，人道天堑被越过，至尊威压席卷天地！`
    ], {
      waveOffset: 9,
      reportTitle: '——至尊尸骨路·最终考验——',
      sourceName: '至尊路劫力',
      fatalName: '大道磨灭',
      summaryText: '【人道绝巅】九天九夜拷问结束，至尊道果功成'
    });

    return {
      success: !dead,
      revived: this.revived,
      targetLevelId: 15,
      path: '至尊路',
      externalDaoFlaw: !dead,
      routeText: '红尘业火、天地意志与九天九夜尸骨路尽数渡过；此番借外道载道留下隐患，日后仍需重走以身为种之路。'
    };
  }
}

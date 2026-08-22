/**
 * 无尽至宝系统
 * ------------
 * 无尽劫境第25关起，每次打到第25关解锁一件永久随机「无尽至宝」。
 * 每件至宝：
 *  - 开局自带 1 级专属能力（可来自原有能力池，或专属合成能力）
 *  - 在局内满足「觉醒条件」（收集指定能力 / 达到指定能力等级 / 能力总数）后，
 *    觉醒为高阶形态，获得全属性加成与专属战斗技能
 *  - 至宝等级（1~10）可消耗劫境道痕提升，基础加成随等级成长
 *
 * 本文件只负责数据与纯函数（状态判定/加成计算），战斗执行逻辑在 endlessRealm.js 中实现。
 */
export const ENDLESS_TREASURE_FIELD = '无尽至宝列表';
export const ENDLESS_TREASURE_EQUIPPED_FIELD = '无尽至宝装配';
export const ENDLESS_TREASURE_SLOT_FIELD = '无尽至宝槽位';
export const ENDLESS_TREASURE_LEVEL_CAP = 10;
export const ENDLESS_TREASURE_UNLOCK_LAYER = 25;
export const ENDLESS_TREASURE_EFFECT_RATE = 0.5;
export const ENDLESS_TREASURE_EFFECT_PER_LEVEL = 0.15;
export const ENDLESS_TREASURE_UPGRADE_BASE_COST = 1000;
export const ENDLESS_TREASURE_UPGRADE_COST_STEP = 750;

/* 至宝专属合成能力名（用于面板展示；这些能力不会进入选择池） */
export const SYNTHETIC_ABILITY_NAMES = Object.freeze({
  treasure_demon_mark: '斑纹',
  treasure_ninetails_chakra: '九尾查克拉',
  treasure_cursed_energy: '咒力',
  treasure_magic_contract: '魔法契约',
  treasure_light_power: '光之力',
  treasure_one_cut_curse: '一击必杀',
  treasure_serious_fist: '认真模式',
  treasure_sharingan: '写轮眼',
  treasure_reiatsu: '灵压',
  treasure_ambition: '霸王色霸气',
  treasure_cosmo: '小宇宙',
  treasure_saiyan_blood: '赛亚人血脉',
  treasure_magic_circuit: '魔术回路',
  treasure_holy_body: '荒古圣体',
  treasure_demon_blood: '魔人血脉',
  treasure_titan_power: '巨人之力',
  treasure_wushi_jing: '无始经',
  treasure_strongest_qi: '最强之气',
});

/* 旧平成十年骑士（K触屏·神主形态召唤物） */
export const HEISEI_RIDERS = Object.freeze([
  Object.freeze({ id: 'kuuga', name: '空我', form: '究极形态', attack: 1.8, hp: 1.2, crit: 0.14, hits: 1, skills: ['究极升华拳'], flavor: '究极之暗·护盾蓄力', ultimate: { label: '究极升华·天地崩裂', damagePct: 8, shieldPct: 0.25, chargedStrike: true, chargeMultiplier: 1.5, shieldMultiplier: 3 } }),
  Object.freeze({ id: 'agito', name: '亚极陀', form: '闪耀形态', attack: 1.65, hp: 1.4, crit: 0.1, hits: 1, skills: ['闪耀骑士踢'], flavor: '太阳神光·无限进化', ultimate: { label: '闪耀骑士踢', damagePct: 6, healMaxPct: 0.15, growthPct: 0.06, growthMax: 3 } }),
  Object.freeze({ id: 'ryuki', name: '龙骑', form: '生存形态', attack: 1.7, hp: 1.15, crit: 0.12, hits: 2, healPct: 0.12, skills: ['龙骑士踢'], flavor: '烈火龙契约·浴火吸血', ultimate: { label: '龙火风暴', damagePct: 3.5, hits: 2, healPct: 0.35 } }),
  Object.freeze({ id: 'faiz', name: 'Faiz', form: '爆裂形态', attack: 1.95, hp: 1.05, crit: 0.22, hits: 1, skills: ['爆裂电光踢'], flavor: '光子超频·破甲贯穿', ultimate: { label: '超强化深红电钻', aoeLabel: '光子破坏炮', damagePct: 8.5, aoeDamagePct: 5, ignoreDefense: true, armorBreakPct: 0.35, armorBreakRounds: 2 } }),
  Object.freeze({ id: 'blade', name: 'Blade', form: '帝王形态', attack: 1.7, hp: 1.35, crit: 0.12, hits: 2, skills: ['皇家同花顺'], flavor: '十三不死者·皇家封印', ultimate: { label: '皇家同花顺', damagePct: 8, ignoreDefense: true, antiHealRounds: 2, lowHpThreshold: 0.35, lowHpMultiplier: 2 } }),
  Object.freeze({ id: 'hibiki', name: '响鬼', form: '装甲形态', attack: 1.55, hp: 1.3, crit: 0.1, hits: 3, skills: ['音击打·业火'], flavor: '七重音击·灼烧引爆', ultimate: { label: '音击刃·鬼神觉声', damagePct: 1.1, hits: 7, burnPct: 0.012, burnStacks: 7 } }),
  Object.freeze({ id: 'kabuto', name: 'Kabuto', form: '超越形态', attack: 1.85, hp: 1.1, crit: 0.2, hits: 2, skills: ['Hyper Clock Up'], flavor: '百虫剑·超越时空', ultimate: { label: '百虫剑·究极斩', damagePct: 10, ignoreDefense: true, actionAdvance: true, alternate: { label: '百虫剑·究极炮', damagePct: 6, ignoreDefense: true, actionDelay: 1 } } }),
  Object.freeze({ id: 'deno', name: '电王', form: '电车形态', attack: 1.65, hp: 1.45, crit: 0.1, hits: 1, skills: ['电车斩杀'], flavor: '四大异魔神·随机形态', ultimate: { label: '电车斩·终点站', damagePct: 6, shieldPct: 0.15, randomFormBuff: true } }),
  Object.freeze({ id: 'kiva', name: 'Kiva', form: '魔皇形态', attack: 1.8, hp: 1.2, crit: 0.15, hits: 1, burnChance: 0.35, skills: ['魔皇破坏者'], flavor: '赞巴特剑·血月汲取', ultimate: { label: '终结赞巴特斩', damagePct: 7.5, burnPct: 0.025, burnStacks: 3, healPct: 0.3 } }),
  Object.freeze({ id: 'decade', name: '帝骑', form: '神主形态', attack: 2.15, hp: 1.1, crit: 0.25, hits: 2, skills: ['最终攻击驾驭'], flavor: '品红全能·驾驭诸骑', ultimate: { label: 'Final Attack Ride·十骑终焉', damagePct: 10, shieldMultiplier: 4, ignoreDefense: true } }),
]);

/**
 * 无尽至宝池。
 * 字段约定：
 *  - baseAbility：开局自带的专属能力 id（可为合成能力）；baseLevel：自带等级
 *  - baseEffect：基础形态全属性加成（按至宝等级缩放）
 *  - awaken.requires：{能力id: 需求等级} 全部满足才觉醒
 *  - awaken.requiresAny：多组 requires，任一组满足即觉醒
 *  - awaken.minAbilities：能力总数 >= N 即觉醒（可叠加 minAbilitiesInWorld）
 *  - awaken.combat：觉醒形态专属战斗技能（由 endlessRealm 执行）
 *  - alternate：未觉醒时的替代形态（仅部分至宝需要，如 K触屏普通帝骑）
 */
export const ENDLESS_TREASURES = Object.freeze([
  /* 1. K触屏·帝骑驱动器 —— 假面骑士Decade */
  Object.freeze({
    id: 'treasure_decade',
    name: 'K触屏·帝骑驱动器',
    icon: '📱',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '品红骑士的驱动器。帝骑腰带练至3级后化作神主形态，首回合召齐旧平成十位骑士的最终形态；每三回合全员释放专属终极技，兼具破盾、无视防御、恢复与护阵，理论持续输出位居全部至宝之首。',
    baseAbility: 'anime_decade_driver',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, hpPct: 0.08, defensePct: 0.08 },
    awaken: {
      name: '神主形态·帝骑',
      requires: { anime_decade_driver: 3 },
      effect: { attackPct: 0.5, hpPct: 0.5, defensePct: 0.5, dodgeChance: 0.05 },
      combat: [
        {
          type: 'summonRiders',
          label: '神主帝骑·历代骑士召唤',
          narration: '{member}刷过神主牌，十位旧平成骑士的终极形态自世界夹缝中踏出',
        },
        {
          type: 'execute',
          threshold: 0.3,
          once: true,
          label: '历代骑士·最终一击',
          narration: '{member}发动神主被动，十位旧平成骑士之力汇聚成贯穿世界的一击',
        },
      ],
    },
    alternate: {
      effect: { attackPct: 0.2, hpPct: 0.2, defensePct: 0.2 },
      transformChance: 0.25,
      transformLabel: '旧平成骑士·形态驾驭',
    },
  }),

  /* 2. 缘一的斩鬼之刀 —— 鬼灭之刃 */
  Object.freeze({
    id: 'treasure_yoriichi',
    name: '缘一的斩鬼之刀',
    icon: '🗡️',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '继国缘一遗落的日轮刀。开局自带1级斑纹；收集日之呼吸与通透世界后觉醒为日呼传人，进入战斗全属性+35%，隐藏能力「日之呼吸·最终式」斩出多段连击并持续灼烧对手、禁绝疗愈。',
    baseAbility: 'treasure_demon_mark',
    baseLevel: 1,
    baseEffect: { attackPct: 0.12, hpPct: 0.05, critChance: 0.06 },
    awaken: {
      name: '日呼传人',
      requires: { anime_sun_breath: 1, anime_transparent_world: 1 },
      effect: { attackPct: 0.35, hpPct: 0.2, defensePct: 0.1, critChance: 0.06 },
      combat: [
        {
          type: 'multiHit',
          every: 4,
          hits: 5,
          damagePct: 0.45,
          label: '日之呼吸·最终式',
          verb: '斩出',
          narration: '{member}握紧缘一的斩鬼之刀，日轮十三式连贯而至，五段连击如旭日初升',
          burn: { pct: 0.025, rounds: 3, antiHeal: true, label: '日之灼烧' },
        },
      ],
    },
  }),

  /* 3. 九尾人柱力 —— 火影忍者 */
  Object.freeze({
    id: 'treasure_ninetails',
    name: '九尾人柱力',
    icon: '🦊',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '身负九尾查克拉的封印容器。开局自带1级九尾查克拉；掌握螺旋丸或影分身后可进入仙人模式；同时集齐两者后觉醒为仙狐模式，全属性+30%，可释放仙法·风遁螺旋手里剑。',
    baseAbility: 'treasure_ninetails_chakra',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, hpPct: 0.12, regenPct: 0.01 },
    stages: [
      {
        name: '仙人模式',
        requiresAny: [{ anime_rasengan: 1 }, { anime_shadow_clone: 1 }],
        effect: { attackPct: 0.15, hpPct: 0.15 },
      },
    ],
    awaken: {
      name: '仙狐模式',
      requires: { anime_rasengan: 1, anime_shadow_clone: 1 },
      effect: { attackPct: 0.3, hpPct: 0.3, defensePct: 0.1, extraActionChance: 0.05 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 2.2,
          label: '仙法·风遁螺旋手里剑',
          verb: '掷出',
          ignoreDefense: true,
          narration: '{member}凝聚自然能量，风遁查克拉化作撕裂天地的螺旋手里剑',
        },
      ],
    },
  }),

  /* 4. 领域展开·无量空处 —— 咒术回战 */
  Object.freeze({
    id: 'treasure_domain',
    name: '领域展开·无量空处',
    icon: '🌀',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '以咒力构筑生得领域。开局自带1级咒力；参悟三项能力后展开领域，全属性+30%，领域每回合侵蚀敌人，并周期性释放「茈·虚式」。',
    baseAbility: 'treasure_cursed_energy',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, damageReduction: 0.05 },
    awaken: {
      name: '领域展开·无量空处',
      minAbilities: 3,
      effect: { attackPct: 0.3, hpPct: 0.2, damageReduction: 0.08 },
      combat: [
        {
          type: 'domain',
          damagePct: 0.02,
          label: '无量空处·必中领域',
          narration: '{member}双手合十，生得领域轰然展开，无数信息洪流冲刷{enemy}',
        },
        {
          type: 'bigProc',
          every: 5,
          damagePct: 1.8,
          label: '茈·虚式',
          verb: '释放',
          narration: '{member}以领域为媒，虚式·茈在{enemy}体内炸开',
        },
      ],
    },
  }),

  /* 5. 魔法少女·星光契约 */
  Object.freeze({
    id: 'treasure_magical_girl',
    name: '魔法少女·星光契约',
    icon: '✨',
    rarity: '史诗',
    source: '无尽劫境·第25关',
    desc: '与星光缔结的变身契约。开局自带1级魔法契约；收集两项万象番界能力后完全变身，全属性+25%，并获得护盾与流星雨魔法。',
    baseAbility: 'treasure_magic_contract',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, hpPct: 0.08, dodgeChance: 0.02 },
    awaken: {
      name: '星光魔法·完全变身',
      minAbilitiesInWorld: { world: 'anime', count: 2 },
      effect: { attackPct: 0.25, hpPct: 0.15, defensePct: 0.15, teamShieldPct: 0.05 },
      combat: [
        {
          type: 'multiHit',
          every: 4,
          hits: 3,
          damagePct: 0.5,
          label: '星光魔法·流星雨',
          verb: '咏唱',
          narration: '{member}高举魔杖，万千星光化作流星坠向{enemy}',
        },
      ],
    },
  }),

  /* 6. 神光棒·光之巨人 —— 迪迦奥特曼 */
  Object.freeze({
    id: 'treasure_sparklens',
    name: '神光棒·光之巨人',
    icon: '⚡',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '变成光的神之棒。开局自带1级光之力；参悟两项能力后化身为光之巨人，全属性+40%，可释放哉佩利敖光线与闪耀计时器闪光。',
    baseAbility: 'treasure_light_power',
    baseLevel: 1,
    baseEffect: { attackPct: 0.1, hpPct: 0.1, defensePct: 0.1 },
    awaken: {
      name: '光之巨人·闪耀形态',
      minAbilities: 2,
      effect: { attackPct: 0.4, hpPct: 0.25, defensePct: 0.2, damageReduction: 0.05 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 2.0,
          label: '哉佩利敖光线',
          verb: '释放',
          narration: '{member}举起右臂，哉佩利敖光线贯穿{enemy}',
        },
        {
          type: 'bigProc',
          every: 8,
          damagePct: 3.5,
          label: '闪耀·计时器闪光',
          verb: '引爆',
          narration: '闪耀形态能量全开，计时器闪光将{enemy}吞没',
        },
      ],
    },
  }),

  /* 7. 赤红之瞳·村雨 —— 斩·赤红之瞳 */
  Object.freeze({
    id: 'treasure_akame',
    name: '赤红之瞳·村雨',
    icon: '🔪',
    rarity: '禁忌',
    source: '无尽劫境·第25关',
    desc: '妖刀村雨，一击必杀。开局自带1级一击必杀；参悟两项能力后咒毒觉醒，敌人生命低于30%时概率触发「村雨·咒杀」，并附加咒毒侵蚀。',
    baseAbility: 'treasure_one_cut_curse',
    baseLevel: 1,
    baseEffect: { attackPct: 0.12, executePct: 0.05 },
    awaken: {
      name: '一击必杀·咒毒',
      minAbilities: 2,
      effect: { attackPct: 0.2, executePct: 0.1, critChance: 0.05 },
      combat: [
        {
          type: 'execute',
          threshold: 0.3,
          chance: 0.45,
          once: true,
          label: '村雨·咒杀',
          narration: '{member}斩出村雨妖刀，咒毒沿伤口蔓延，断绝{enemy}的生机',
          burn: { pct: 0.02, rounds: 2, label: '咒毒侵蚀' },
        },
      ],
    },
  }),

  /* 8. 一拳超人·认真一拳 */
  Object.freeze({
    id: 'treasure_onepunch',
    name: '一拳超人·认真一拳',
    icon: '👊',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '无敌者的认真模式。开局自带1级认真模式；参悟两项能力后解锁「认真一拳」，每回合有概率对非Boss敌人一击必杀，对Boss则造成巨额伤害。',
    baseAbility: 'treasure_serious_fist',
    baseLevel: 1,
    baseEffect: { attackPct: 0.12, hpPct: 0.08 },
    awaken: {
      name: '认真一拳',
      minAbilities: 2,
      effect: { attackPct: 0.2, critChance: 0.1 },
      combat: [
        {
          type: 'onePunch',
          chance: 0.12,
          label: '认真一拳',
          verb: '轰出',
          bossMultiplier: 3,
          narration: '{member}握拳收于腰间，认真一拳砸碎{enemy}的防御',
        },
      ],
    },
  }),

  /* 9. 万花筒写轮眼 —— 火影忍者 */
  Object.freeze({
    id: 'treasure_mangekyou',
    name: '万花筒写轮眼',
    icon: '👁️',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '双瞳倒映因果的万花筒。开局自带1级写轮眼；参悟三项能力后须佐能乎拔地而起，全属性+35%，天照黑炎灼烧敌人。',
    baseAbility: 'treasure_sharingan',
    baseLevel: 1,
    baseEffect: { attackPct: 0.1, critChance: 0.05, dodgeChance: 0.02 },
    awaken: {
      name: '须佐能乎',
      minAbilities: 3,
      effect: { attackPct: 0.35, hpPct: 0.25, damageReduction: 0.1 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 1.9,
          label: '须佐能乎·天照',
          verb: '降下',
          narration: '须佐能乎睁眼，天照黑炎在{enemy}身上燃烧',
          burn: { pct: 0.02, rounds: 3, label: '天照黑炎' },
        },
      ],
    },
  }),

  /* 10. 斩魄刀·卍解 —— 死神 */
  Object.freeze({
    id: 'treasure_bankai',
    name: '斩魄刀·卍解',
    icon: '⚔️',
    rarity: '史诗',
    source: '无尽劫境·第25关',
    desc: '死神之力与斩魄刀共鸣。开局自带1级灵压；参悟两项能力后卍解，全属性+30%，月牙天冲·黑斩裂战场。',
    baseAbility: 'treasure_reiatsu',
    baseLevel: 1,
    baseEffect: { attackPct: 0.1, defensePct: 0.08 },
    awaken: {
      name: '卍解·天锁斩月',
      minAbilities: 2,
      effect: { attackPct: 0.3, defensePct: 0.15, extraActionChance: 0.04 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 1.8,
          label: '月牙天冲·黑',
          verb: '斩出',
          narration: '{member}挥下天锁斩月，黑色月牙冲天而起',
        },
      ],
    },
  }),

  /* 11. 霸王色霸气 —— 海贼王 */
  Object.freeze({
    id: 'treasure_haki',
    name: '霸王色霸气',
    icon: '👑',
    rarity: '史诗',
    source: '无尽劫境·第25关',
    desc: '王者资质的气魄。开局自带1级霸王色霸气；参悟三项能力后霸气觉醒，全属性+20%，霸王色冲击震慑战场。',
    baseAbility: 'treasure_ambition',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, hpPct: 0.1, critChance: 0.03 },
    awaken: {
      name: '霸王色觉醒',
      minAbilities: 3,
      effect: { attackPct: 0.2, hpPct: 0.15, damageReduction: 0.05 },
      combat: [
        {
          type: 'bigProc',
          every: 5,
          damagePct: 1.6,
          label: '霸王色·震慑冲击',
          verb: '释放',
          narration: '{member}目光一凛，霸王色霸气化作冲击波扫过{enemy}',
        },
      ],
    },
  }),

  /* 12. 小宇宙·第七感 —— 圣斗士星矢 */
  Object.freeze({
    id: 'treasure_seventh_sense',
    name: '小宇宙·第七感',
    icon: '🌟',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '燃烧到极致的生命之光。开局自带1级小宇宙；参悟三项能力后第七感觉醒，全属性+40%，天马流星拳连击不休。',
    baseAbility: 'treasure_cosmo',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, dodgeChance: 0.03, extraActionChance: 0.02 },
    awaken: {
      name: '第七感觉醒',
      minAbilities: 3,
      effect: { attackPct: 0.4, dodgeChance: 0.05, extraActionChance: 0.06 },
      combat: [
        {
          type: 'multiHit',
          every: 4,
          hits: 6,
          damagePct: 0.35,
          label: '天马流星拳',
          verb: '轰出',
          narration: '{member}燃烧小宇宙，天马流星拳化作漫天星光',
        },
      ],
    },
  }),

  /* 13. 赛亚人血脉 —— 龙珠 */
  Object.freeze({
    id: 'treasure_saiyan',
    name: '赛亚人血脉',
    icon: '🐉',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '为战而生的战斗民族血脉。开局自带1级赛亚人血脉；掌握自在极意后血脉沸腾，化作超级赛亚人，全属性+35%，龟派气功横扫战场。',
    baseAbility: 'treasure_saiyan_blood',
    baseLevel: 1,
    baseEffect: { attackPct: 0.1, hpPct: 0.1 },
    awaken: {
      name: '超级赛亚人',
      requires: { anime_ultra_instinct: 1 },
      effect: { attackPct: 0.35, hpPct: 0.25, critChance: 0.08 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 2.1,
          label: '龟派气功·超',
          verb: '释放',
          narration: '{member}金发倒竖，龟派气功化作贯日长虹轰向{enemy}',
        },
      ],
    },
  }),

  /* 14. 英灵召唤·宝具解放 —— Fate */
  Object.freeze({
    id: 'treasure_servant',
    name: '英灵召唤·宝具解放',
    icon: '🛡️',
    rarity: '史诗',
    source: '无尽劫境·第25关',
    desc: '与英灵缔结的魔术回路。开局自带1级魔术回路；参悟三项能力后宝具解放，全属性+25%，誓约胜利之剑斩断一切。',
    baseAbility: 'treasure_magic_circuit',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, defensePct: 0.08, regenPct: 0.005 },
    awaken: {
      name: '宝具解放',
      minAbilities: 3,
      effect: { attackPct: 0.25, defensePct: 0.15, damageReduction: 0.05 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 2.0,
          label: '誓约胜利之剑·Excalibur',
          verb: '解放',
          narration: '{member}高举圣剑，金色光柱净化{enemy}',
        },
      ],
    },
  }),

  /* 15. 荒古圣体 —— 遮天/完美世界 */
  Object.freeze({
    id: 'treasure_holy_body',
    name: '荒古圣体',
    icon: '💠',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '荒古血脉之体，人族无上体质。开局自带1级荒古圣体；参悟皆字秘、斗字秘或者字秘任一后圣体大成，全属性+40%，圣体金光镇压诸敌。',
    baseAbility: 'treasure_holy_body',
    baseLevel: 1,
    baseEffect: { attackPct: 0.1, hpPct: 0.12, defensePct: 0.1, regenPct: 0.008 },
    awaken: {
      name: '圣体大成',
      requiresAny: [
        { zhetian_fight_secret: 1 },
        { zhetian_all_secret: 1 },
        { zhetian_healer_secret: 1 },
      ],
      effect: { attackPct: 0.4, hpPct: 0.3, defensePct: 0.2, damageReduction: 0.08 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 1.8,
          label: '圣体金光·无上拳印',
          verb: '轰出',
          narration: '荒古圣体复苏，圣体金光凝成无上拳印镇压{enemy}',
        },
      ],
    },
  }),

  /* 16. 魔人化·斯巴达之血 —— 鬼泣 */
  Object.freeze({
    id: 'treasure_devil_may_cry',
    name: '魔人化·斯巴达之血',
    icon: '🔥',
    rarity: '史诗',
    source: '无尽劫境·第25关',
    desc: '流有恶魔猎人血脉的斯巴达之血。开局自带1级魔人血脉；参悟两项能力后真魔人化，全属性+30%，魔人连斩势不可挡。',
    baseAbility: 'treasure_demon_blood',
    baseLevel: 1,
    baseEffect: { attackPct: 0.1, critChance: 0.04 },
    awaken: {
      name: '真魔人化',
      minAbilities: 2,
      effect: { attackPct: 0.3, critChance: 0.08, damageReduction: 0.05 },
      combat: [
        {
          type: 'multiHit',
          every: 3,
          hits: 3,
          damagePct: 0.45,
          label: '魔人连斩',
          verb: '斩出',
          narration: '{member}化身真魔人，斯巴达之刃化作血色残影',
        },
      ],
    },
  }),

  /* 17. 巨人之力·进击 —— 进击的巨人 */
  Object.freeze({
    id: 'treasure_titan',
    name: '巨人之力·进击',
    icon: '🏔️',
    rarity: '史诗',
    source: '无尽劫境·第25关',
    desc: '继承自始祖的巨人之力。开局自带1级巨人之力；参悟两项能力后巨人化，生命与防御大幅提升，巨人之拳地鸣践踏。',
    baseAbility: 'treasure_titan_power',
    baseLevel: 1,
    baseEffect: { hpPct: 0.15, defensePct: 0.1, regenPct: 0.006 },
    awaken: {
      name: '巨人化',
      minAbilities: 2,
      effect: { hpPct: 0.35, attackPct: 0.2, defensePct: 0.15, damageReduction: 0.05 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 1.6,
          label: '巨人之拳·地鸣',
          verb: '踏出',
          narration: '{member}巨人化后一拳落下，地鸣撼动整片战场',
        },
      ],
    },
  }),

  /* 18. 无始钟·镇压诸天 —— 遮天 */
  Object.freeze({
    id: 'treasure_wushi_clock',
    name: '无始钟·镇压诸天',
    icon: '🔔',
    rarity: '神话',
    source: '无尽劫境·第25关',
    desc: '无始大帝伴生古钟。开局自带1级无始经；参悟三项能力后钟鸣镇世，全属性+35%，反弹敌伤并周期性释放镇压天音。',
    baseAbility: 'treasure_wushi_jing',
    baseLevel: 1,
    baseEffect: { attackPct: 0.08, hpPct: 0.08, damageReduction: 0.04 },
    awaken: {
      name: '无始钟鸣',
      minAbilities: 3,
      effect: { attackPct: 0.35, damageReduction: 0.1, reflectChance: 0.15, reflectPct: 0.6 },
      combat: [
        {
          type: 'bigProc',
          every: 4,
          damagePct: 1.7,
          label: '无始钟·镇压天音',
          verb: '鸣响',
          narration: '无始钟轻轻一震，镇压天音涤荡{enemy}',
        },
      ],
    },
  }),

  /* 19. 最强之气 —— 修罗铠甲 */
  Object.freeze({
    id: 'treasure_strongest_qi',
    name: '最强之气',
    icon: '⚔️',
    rarity: '禁忌',
    source: '无尽劫境·第25关',
    desc: '唯有超越一切执念的最强之气，才能驾驭修罗铠甲的完整力量。与修罗铠甲同时存在时觉醒为最强修罗，解锁神魔灭绝劈，对护盾造成毁灭性伤害并清除敌方增益。',
    baseAbility: 'treasure_strongest_qi',
    baseLevel: 1,
    baseEffect: { attackPct: 0.16, hpPct: 0.12, defensePct: 0.12 },
    awaken: {
      name: '最强修罗·完整解放',
      requires: { anime_shura_armor: 1 },
      effect: { attackPct: 0.55, hpPct: 0.35, defensePct: 0.45, damageReduction: 0.08, critChance: 0.08 },
      combat: [
        {
          type: 'bigProc',
          every: 3,
          damagePct: 4.5,
          shieldMultiplier: 8,
          clearEnemyBuffs: true,
          ignoreDefense: true,
          label: '神魔灭绝劈',
          verb: '劈灭',
          narration: '{member}将最强之气灌入修罗炼狱戟，神魔灭绝劈撕开空间斩向{enemy}',
        },
      ],
    },
  }),
]);

const TREASURE_MAP = new Map(ENDLESS_TREASURES.map((treasure) => [treasure.id, treasure]));

const EFFECT_KEYS = Object.freeze([
  'attackPct', 'hpPct', 'defensePct', 'critChance', 'dodgeChance', 'regenPct',
  'damageReduction', 'reflectChance', 'reflectPct', 'extraActionChance',
  'summonPct', 'executePct', 'teamShieldPct', 'riderKickChance',
]);

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mergeEffect(target, source, multiplier = 1) {
  for (const key of EFFECT_KEYS) {
    const value = asNumber(source?.[key]);
    if (value) target[key] = (target[key] || 0) + value * multiplier;
  }
  return target;
}

export function getTreasureById(id) {
  return TREASURE_MAP.get(id) || null;
}

export function getTreasureAbilityName(abilityId) {
  return SYNTHETIC_ABILITY_NAMES[abilityId] || null;
}

export function getTreasureIcon(id) {
  return TREASURE_MAP.get(id)?.icon || '💎';
}

/** 归一化玩家的至宝列表（懒初始化） */
export function normalizePlayerTreasures(player) {
  if (!player) return [];
  if (!Array.isArray(player[ENDLESS_TREASURE_FIELD])) player[ENDLESS_TREASURE_FIELD] = [];
  return player[ENDLESS_TREASURE_FIELD]
    .filter((item) => item && item.id && TREASURE_MAP.has(item.id))
    .map((item) => ({
      id: item.id,
      name: TREASURE_MAP.get(item.id).name,
      level: clamp(asNumber(item.level, 1), 1, ENDLESS_TREASURE_LEVEL_CAP),
    }));
}

export function getEndlessTreasureSlotGate(slot) {
  return Math.max(1, Math.floor(asNumber(slot, 1))) * 25;
}

export function getEndlessTreasureSlotCost(slot) {
  const safeSlot = Math.max(1, Math.floor(asNumber(slot, 1)));
  return safeSlot === 1 ? 0 : 4000 + safeSlot * 500;
}

/** 当前等级升至下一级所需道痕。Lv.1→2 为1000，此后每级递增750。 */
export function getEndlessTreasureUpgradeCost(level) {
  const current = clamp(Math.floor(asNumber(level, 1)), 1, ENDLESS_TREASURE_LEVEL_CAP);
  if (current >= ENDLESS_TREASURE_LEVEL_CAP) return null;
  return ENDLESS_TREASURE_UPGRADE_BASE_COST +
    (current - 1) * ENDLESS_TREASURE_UPGRADE_COST_STEP;
}

export function getEndlessTreasureSlotCount(player) {
  const highestLayer = Math.max(0, Math.floor(asNumber(player?.无尽劫境最高层)));
  // 旧存档没有最高层字段时，以已持有至宝反推第一槽资格。
  const legacyFirstSlot = Array.isArray(player?.[ENDLESS_TREASURE_FIELD]) &&
    player[ENDLESS_TREASURE_FIELD].length > 0 ? 1 : 0;
  const eligible = Math.max(legacyFirstSlot, Math.floor(highestLayer / 25));
  if (!eligible) return 0;
  return Math.min(eligible, Math.max(1, Math.floor(asNumber(player?.[ENDLESS_TREASURE_SLOT_FIELD]))));
}

/** 旧存档首次读取时自动装配第一件，后续只让装配中的至宝进入战斗。 */
export function normalizeEndlessTreasureLoadout(player) {
  const owned = normalizePlayerTreasures(player);
  const ownedIds = new Set(owned.map(item => item.id));
  const slots = getEndlessTreasureSlotCount(player);
  const hasSavedLoadout = Array.isArray(player?.[ENDLESS_TREASURE_EQUIPPED_FIELD]);
  const equipped = [...new Set(player?.[ENDLESS_TREASURE_EQUIPPED_FIELD] || [])]
    .filter(id => ownedIds.has(id))
    .slice(0, slots);
  if (!hasSavedLoadout && slots > 0 && owned.length) equipped.push(owned[0].id);
  if (player) {
    player[ENDLESS_TREASURE_SLOT_FIELD] = slots;
    player[ENDLESS_TREASURE_EQUIPPED_FIELD] = equipped;
  }
  return { owned, equipped, slots };
}

export function getEquippedEndlessTreasures(player) {
  const { owned, equipped } = normalizeEndlessTreasureLoadout(player);
  const equippedSet = new Set(equipped);
  return owned.filter(item => equippedSet.has(item.id));
}

function findOwnedTreasure(player, input) {
  const query = String(input || '').trim();
  const owned = normalizePlayerTreasures(player);
  const numeric = Number(query);
  return owned.find(item => item.id === query || item.name === query) ||
    (Number.isInteger(numeric) ? owned[numeric - 1] : null);
}

export function equipEndlessTreasure(player, input) {
  const target = findOwnedTreasure(player, input);
  if (!target) throw new Error('未找到这件无尽至宝');
  const loadout = normalizeEndlessTreasureLoadout(player);
  if (!loadout.slots) throw new Error('通关第25层后才能装配无尽至宝');
  if (loadout.equipped.includes(target.id)) throw new Error(`【${target.name}】已经装配`);
  if (loadout.equipped.length >= loadout.slots)
    throw new Error(`无尽至宝槽已满（${loadout.slots}/${loadout.slots}）`);
  loadout.equipped.push(target.id);
  player[ENDLESS_TREASURE_EQUIPPED_FIELD] = loadout.equipped;
  return { treasure: target, equipped: [...loadout.equipped], slots: loadout.slots };
}

export function unequipEndlessTreasure(player, input) {
  const target = findOwnedTreasure(player, input);
  if (!target) throw new Error('未找到这件无尽至宝');
  const loadout = normalizeEndlessTreasureLoadout(player);
  const index = loadout.equipped.indexOf(target.id);
  if (index < 0) throw new Error(`【${target.name}】尚未装配`);
  loadout.equipped.splice(index, 1);
  player[ENDLESS_TREASURE_EQUIPPED_FIELD] = loadout.equipped;
  return { treasure: target, equipped: [...loadout.equipped], slots: loadout.slots };
}

export function unlockEndlessTreasureSlot(player) {
  const current = getEndlessTreasureSlotCount(player);
  const next = current + 1;
  const gate = getEndlessTreasureSlotGate(next);
  const highestLayer = Math.max(0, Math.floor(asNumber(player?.无尽劫境最高层)));
  if (highestLayer < gate) throw new Error(`第${next}个至宝槽需要最高通关第${gate}层`);
  const cost = getEndlessTreasureSlotCost(next);
  const balance = Math.max(0, Math.floor(asNumber(player?.劫境道痕)));
  if (balance < cost) throw new Error(`开启第${next}个至宝槽需要${cost}劫境道痕，当前${balance}`);
  player.劫境道痕 = balance - cost;
  player[ENDLESS_TREASURE_SLOT_FIELD] = next;
  normalizeEndlessTreasureLoadout(player);
  return { slot: next, gate, cost, balance: player.劫境道痕 };
}

export function upgradeEndlessTreasure(player, input) {
  const target = findOwnedTreasure(player, input);
  if (!target) throw new Error('未找到这件无尽至宝');
  const cost = getEndlessTreasureUpgradeCost(target.level);
  if (cost === null) throw new Error(`【${target.name}】已经升至Lv.${ENDLESS_TREASURE_LEVEL_CAP}`);
  const balance = Math.max(0, Math.floor(asNumber(player?.劫境道痕)));
  if (balance < cost)
    throw new Error(`升级【${target.name}】需要${cost}劫境道痕，当前${balance}`);
  const level = target.level + 1;
  player.劫境道痕 = balance - cost;
  player[ENDLESS_TREASURE_FIELD] = normalizePlayerTreasures(player).map(item =>
    item.id === target.id ? { ...item, level } : item
  );
  return {
    treasure: TREASURE_MAP.get(target.id),
    level,
    cost,
    nextCost: getEndlessTreasureUpgradeCost(level),
    balance: player.劫境道痕,
  };
}

/**
 * 第25关奖励：随机解锁一件永久至宝。
 * 优先从未拥有的至宝中抽取；全部拥有后，随机将一件已拥有至宝升级（上限10级）。
 * @returns {{treasure:object, level:number, upgraded:boolean, name:string}|null}
 */
export function grantRandomEndlessTreasure(player, randomizer = Math.random) {
  const owned = normalizePlayerTreasures(player);
  const ownedIds = new Set(owned.map((item) => item.id));
  const candidates = ENDLESS_TREASURES.filter((treasure) => !ownedIds.has(treasure.id));
  let upgraded = false;
  let treasure;
  let level;
  if (candidates.length) {
    treasure = candidates[Math.floor(randomizer() * candidates.length)];
    level = 1;
  } else if (owned.length) {
    const target = owned[Math.floor(randomizer() * owned.length)];
    treasure = TREASURE_MAP.get(target.id);
    level = Math.min(ENDLESS_TREASURE_LEVEL_CAP, target.level + 1);
    upgraded = level > target.level;
    if (!upgraded) return null;
    player[ENDLESS_TREASURE_FIELD] = owned.map((item) =>
      item.id === target.id ? { ...item, level } : item
    );
    return { treasure, level, upgraded, name: treasure.name };
  } else {
    return null;
  }
  player[ENDLESS_TREASURE_FIELD] = [
    ...owned,
    { id: treasure.id, name: treasure.name, level, gainedAt: Date.now() },
  ];
  return { treasure, level, upgraded, name: treasure.name };
}

function ownsAbility(member, abilityId, requiredLevel) {
  return asNumber(member?.abilities?.[abilityId]) >= asNumber(requiredLevel, 1);
}

function abilityCount(member) {
  return Object.entries(member?.abilities || {}).filter(
    ([id, level]) => asNumber(level) > 0
  ).length;
}

function worldAbilityCount(member, world) {
  // 无法在此处读取能力池，由调用方注入 counts（见 getTreasureStates）
  return asNumber(member?.__worldAbilityCounts?.[world]);
}

function meetsRequirementGroup(member, group) {
  if (group.requires) {
    if (!Object.entries(group.requires).every(([id, level]) => ownsAbility(member, id, level)))
      return false;
  }
  if (group.requiresAny) {
    const matched = group.requiresAny.some((alt) =>
      Object.entries(alt).every(([id, level]) => ownsAbility(member, id, level))
    );
    if (!matched) return false;
  }
  if (group.minAbilities && abilityCount(member) < group.minAbilities) return false;
  if (group.minAbilitiesInWorld) {
    if (worldAbilityCount(member, group.minAbilitiesInWorld.world) < group.minAbilitiesInWorld.count)
      return false;
  }
  return true;
}

/**
 * 计算单名成员本场（run）中的至宝状态：基础形态、中间形态、觉醒形态。
 * @returns {Array<{treasure, level, baseEffect, stageEffect, awaken:{active,formName,effect,combat}, alternate, transformChance}>}
 */
export function getTreasureStates(member, run) {
  if (!member?.treasureIds?.length) return [];
  const effectScale = (level) =>
    ENDLESS_TREASURE_EFFECT_RATE + ENDLESS_TREASURE_EFFECT_PER_LEVEL * (level - 1);
  return member.treasureIds
    .map(({ id, level }) => {
      const treasure = TREASURE_MAP.get(id);
      if (!treasure) return null;
      const baseEffect = {};
      mergeEffect(baseEffect, treasure.baseEffect, effectScale(level));
      const stageEffect = {};
      for (const stage of treasure.stages || []) {
        if (meetsRequirementGroup(member, stage))
          mergeEffect(stageEffect, stage.effect, effectScale(level));
      }
      const awakenDef = treasure.awaken;
      const awakenActive = awakenDef && meetsRequirementGroup(member, awakenDef);
      const awaken = awakenActive
        ? {
            active: true,
            formName: awakenDef.name,
            effect: (() => {
              const effect = {};
              mergeEffect(effect, awakenDef.effect, effectScale(level));
              return effect;
            })(),
            combat: awakenDef.combat || [],
          }
        : { active: false, formName: null, effect: null, combat: [] };
      return {
        treasure,
        level,
        baseEffect,
        stageEffect,
        awaken,
        alternate: treasure.alternate || null,
        transformChance: treasure.alternate?.transformChance || 0,
      };
    })
    .filter(Boolean);
}

/** 汇总至宝全属性加成（基础 + 中间形态 + 觉醒形态） */
export function getTreasureEffects(member, run) {
  const effects = {};
  for (const state of getTreasureStates(member, run)) {
    mergeEffect(effects, state.baseEffect);
    mergeEffect(effects, state.stageEffect);
    if (state.awaken.active) mergeEffect(effects, state.awaken.effect);
    else if (state.alternate)
      mergeEffect(
        effects,
        state.alternate.effect,
        ENDLESS_TREASURE_EFFECT_RATE + ENDLESS_TREASURE_EFFECT_PER_LEVEL * (state.level - 1)
      );
  }
  return effects;
}

/** 当前活跃的禁疗倍率（0~1）。日之呼吸最终式等灼烧带有禁疗效果 */
export function getTreasureAntiHeal(run) {
  if (!run?.members) return 0;
  for (const member of Object.values(run.members)) {
    for (const burn of member.treasureBurns || []) {
      if (burn.antiHeal && burn.remaining > 0) return 1;
    }
  }
  return 0;
}

/** 本场觉醒的至宝战斗技能（供 endlessRealm 战斗循环消费） */
export function getTreasureBattleEntries(member, run) {
  const entries = [];
  for (const state of getTreasureStates(member, run)) {
    if (state.awaken.active) entries.push(...state.awaken.combat);
    if (!state.awaken.active && state.transformChance > 0)
      entries.push({
        type: 'transformRider',
        chance: state.transformChance,
        label: state.treasure.alternate?.transformLabel || '形态驾驭',
      });
  }
  return entries;
}

/** 面板展示：成员所持至宝及觉醒状态 */
export function getTreasureRunSummary(member, run) {
  return getTreasureStates(member, run).map((state) => ({
    id: state.treasure.id,
    name: state.treasure.name,
    icon: state.treasure.icon,
    rarity: state.treasure.rarity,
    level: state.level,
    awakened: state.awaken.active,
    formName: state.awaken.formName,
    stageName: Object.keys(state.stageEffect).length ? '仙人模式' : null,
  }));
}

/** 面板展示：玩家局外拥有的全部至宝 */
export function getPlayerTreasureViews(player) {
  const loadout = normalizeEndlessTreasureLoadout(player);
  const equipped = new Set(loadout.equipped);
  return loadout.owned.map((item) => {
    const treasure = TREASURE_MAP.get(item.id);
    return {
      id: item.id,
      name: item.name,
      icon: treasure.icon,
      rarity: treasure.rarity,
      level: item.level,
      effectRate: ENDLESS_TREASURE_EFFECT_RATE + ENDLESS_TREASURE_EFFECT_PER_LEVEL * (item.level - 1),
      nextCost: getEndlessTreasureUpgradeCost(item.level),
      equipped: equipped.has(item.id),
      desc: treasure.desc,
      awakenName: treasure.awaken?.name || null,
      awakenCondition: formatAwakenCondition(treasure.awaken),
    };
  });
}

function formatAwakenCondition(awaken) {
  if (!awaken) return null;
  const parts = [];
  if (awaken.requires) {
    for (const [abilityId, level] of Object.entries(awaken.requires)) {
      const name = SYNTHETIC_ABILITY_NAMES[abilityId] || abilityId;
      parts.push(`集齐「${name}」${level > 1 ? `Lv.${level}` : ''}`);
    }
  }
  if (awaken.requiresAny) {
    const groupText = awaken.requiresAny
      .map((group) =>
        Object.entries(group)
          .map(([abilityId, level]) => {
            const name = SYNTHETIC_ABILITY_NAMES[abilityId] || abilityId;
            return `「${name}」${level > 1 ? `Lv.${level}` : ''}`;
          })
          .join('、')
      )
      .join(' 或 ');
    parts.push(`掌握 ${groupText} 任一`);
  }
  if (awaken.minAbilities) parts.push(`参悟 ${awaken.minAbilities} 项能力`);
  if (awaken.minAbilitiesInWorld)
    parts.push(`参悟 ${awaken.minAbilitiesInWorld.count} 项${awaken.minAbilitiesInWorld.world === 'anime' ? '万象番界' : ''}能力`);
  return parts.length ? parts.join('；') : null;
}

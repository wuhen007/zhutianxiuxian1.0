/**
 * 遮天·成仙路失败后的黑暗动乱规则。
 *
 * 这里放纯数据和纯计算，避免把六位至尊的设定散落在消息处理器里。
 * 数值使用 Number：本事件的额外加成为 10 万亿，仍低于 JS 安全整数上限。
 */

export const DARK_REVOLT_CONSTANTS = Object.freeze({
  imperialWeaponMultiplier: 120,
  equipmentBonusPercent: 100,
  extraBonus: 10_000_000_000_000,
  secretRealmLevel: 16, // 仙台秘境——大帝
  xianguLevel: 1,
  lowerRealmCut: 0.7,
  lowerRealmRemain: 0.3,
  emperorLevel: 16,
  corpseRescueRounds: 3,
  corpseBossRatio: 0.92,
});

export const DARK_REVOLT_RESCUE_EVENTS = Object.freeze({
  yellowEmperor: {
    title: '黄帝救场·轩辕帝剑',
    quote: '黄帝自岁月尽头回首，轩辕帝剑横断黑暗，万古人道气运化作一线金光。',
  },
  dachengShengti: {
    title: '大成圣体·尸骸再战',
    quote: '荒古圣体尸骸睁开双眸，金色血气重燃，纵然只剩残躯，也敢向至尊挥拳。',
  },
  holyLandWeapons: {
    title: '圣地帝兵·万器共鸣',
    quote: '各大圣地帝兵同时复苏，恒宇炉、虚空镜、太皇剑与吞天魔罐齐鸣，共击一位至尊。',
  },
});

/** 六位至尊。顺序即帝战阶段顺序；长生天尊仍保留为仙陵外、对阵大成圣体的独立战场叙事。 */
export const DARK_REVOLT_SUPREMES = Object.freeze([
  {
    id: 'changsheng',
    name: '长生天尊',
    title: '仙陵之主',
    forbiddenZone: '仙陵',
    kind: '至尊',
    lawType: '帝道规则',
    root: { name: '长生仙体·不死药身', type: '至尊体', 法球倍率: 3.2, 攻击: 3.6, 防御: 4.2, 生命: 4.8 },
    techniques: ['长生天功·万古不朽', '者字秘', '长生仙光·极尽升华'],
    imperialWeapon: '长生剑',
    quote: '「成仙路已败，唯有以万灵精血再续长生！」',
    battle: '长生天尊离开仙陵，与荒古禁地的大成圣体在另一处战场展开帝战，长生仙光与圣体血气同时照亮黑暗宇宙。',
    harvest: '仙陵裂开无尽生命禁区，长生天尊祭起长生剑，收割万灵精血补足衰败本源。',
  },
  {
    id: 'shihuang',
    name: '石皇',
    title: '不死山之主',
    forbiddenZone: '不死山',
    kind: '古皇',
    lawType: '皇道法则',
    root: { name: '大圆满圣灵皇体', type: '大成圣体', 法球倍率: 3.4, 攻击: 4.5, 防御: 5.2, 生命: 5.8 },
    techniques: ['石皇经·天荒镇世', '行字秘·极尽', '者字秘'],
    imperialWeapon: '天荒戟',
    quote: '「这一世，谁敢阻我成仙！」',
    battle: '石皇踏出不死山，天荒戟横断星河，皇道法则与各路帝兵碰撞，打爆沿途生命古星。',
    harvest: '不死山黑雾覆盖星域，石皇以圣灵皇道锁住诸天，抽取万灵真血化作皇道本源。',
  },
  {
    id: 'lunhuizhuzhu',
    name: '轮回之主',
    title: '轮回海至尊',
    forbiddenZone: '轮回海',
    kind: '至尊',
    lawType: '帝道规则',
    root: { name: '九转轮回至尊体', type: '至尊体', 法球倍率: 3.1, 攻击: 3.8, 防御: 4.1, 生命: 4.6 },
    techniques: ['轮回古经·九世葬天', '六道轮回拳', '者字秘'],
    imperialWeapon: '轮回刀',
    quote: '「轮回不止，众生皆是我续命的薪柴。」',
    battle: '轮回之主打开六道轮回门，帝战映照九天十地，过去与未来的残影一同出手。',
    harvest: '轮回海化作血色漩涡，万灵精血被拖入六道，化为至尊不死物质。',
  },
  {
    id: 'shenxuzhuzhu',
    name: '神墟之主',
    title: '神墟至尊',
    forbiddenZone: '神墟',
    kind: '古皇',
    lawType: '皇道法则',
    root: { name: '神墟万域古皇体', type: '古皇体', 法球倍率: 3.3, 攻击: 3.7, 防御: 4.7, 生命: 5.1 },
    techniques: ['神墟古经·万域放逐', '永恒的放逐', '临字秘'],
    imperialWeapon: '神墟古皇兵',
    quote: '「神墟所至，万域皆空。」',
    battle: '神墟之主张开古老神域，破碎世界层层叠合，帝道神光将星海打成虚无。',
    harvest: '神墟吞没一方方位面，时空坐标被皇道法则抹除，万灵精血尽归神墟。',
  },
  {
    id: 'qitian',
    name: '弃天至尊',
    title: '禁区至尊',
    forbiddenZone: '未知禁区',
    kind: '至尊',
    lawType: '帝道规则',
    root: { name: '弃天灭世至尊体', type: '至尊体', 法球倍率: 3.5, 攻击: 4.2, 防御: 4.3, 生命: 5.2 },
    techniques: ['弃天古经·灭世劫', '皆字秘', '弃天九斩'],
    imperialWeapon: '弃天神矛',
    quote: '「天若不许我成仙，我便先弃了这片天！」',
    battle: '弃天至尊斩断天心印记，极尽升华后以灭世劫贯穿宇宙边荒，帝战余波令位面壁垒崩塌。',
    harvest: '弃天神矛钉穿星海，亿万生灵化为血雾，精血沿矛锋逆流回至尊道果。',
  },
  {
    id: 'guangan',
    name: '光暗至尊',
    title: '禁区至尊',
    forbiddenZone: '未知禁区',
    kind: '至尊',
    lawType: '帝道规则',
    root: { name: '光暗双生至尊体', type: '光暗皇体', 法球倍率: 3.4, 攻击: 4.0, 防御: 4.0, 生命: 4.9 },
    techniques: ['光暗古经·两仪葬界', '维宙星灭诀', '皆字秘'],
    imperialWeapon: '光暗至尊器',
    quote: '「光明与黑暗，本就是同一条成仙路。」',
    battle: '光暗至尊双手合拢，极昼与永夜化为两仪磨盘，光暗帝战同时碾碎星域与万道。',
    harvest: '光暗两极扫过诸天，位面如纸张般被撕裂，万灵精血在永夜中汇聚。',
  },
]);

const FALLBACK_REALMS = {
  qi: { '基础攻击': 10_000_000_000, '基础防御': 10_000_000_000, '基础血量': 20_000_000_000 },
  body: { '基础攻击': 1_600_000_000, '基础防御': 16_500_000_000, '基础血量': 33_500_000_000 },
  secret: { '基础攻击': 830_000_000, '基础防御': 830_000_000, '基础血量': 830_000_000 },
  ancient: { '基础攻击': 0, '基础防御': 0, '基础血量': 0 },
};

function maxRealm(list, fallback) {
  if (!Array.isArray(list) || !list.length) return fallback;
  return list.reduce((best, item) => Number(item?.level_id) > Number(best?.level_id) ? item : best, list[0]) || fallback;
}

function realmAt(list, levelId, fallback) {
  return Array.isArray(list)
    ? (list.find(item => Number(item?.level_id) === Number(levelId)) || fallback)
    : fallback;
}

function stat(realm, key) {
  return Number(realm?.[key]) || 0;
}

/**
 * 按“练气/炼体满级 + 秘境大帝 + 仙古一级 + 帝兵120 + 装备100 + 10万亿”生成至尊属性。
 * equipmentBonusPercent 是百分比，120 则是帝兵全属性倍率，二者均返回在 breakdown 里供面板/测试核对。
 */
export function buildDarkRevoltAttributes(levels = {}, supreme = DARK_REVOLT_SUPREMES[0], scale = 1) {
  const qi = maxRealm(levels.Level_list, FALLBACK_REALMS.qi);
  const body = maxRealm(levels.LevelMax_list, FALLBACK_REALMS.body);
  const secret = realmAt(levels.Levelmijing_list, DARK_REVOLT_CONSTANTS.secretRealmLevel, FALLBACK_REALMS.secret);
  const ancient = realmAt(levels.xiangujinshi_list, DARK_REVOLT_CONSTANTS.xianguLevel, FALLBACK_REALMS.ancient);
  const realm = ['攻击', '防御', '血量'].reduce((result, key) => {
    const field = key === '血量' ? '基础血量' : `基础${key}`;
    result[key] = stat(qi, field) + stat(body, field) + stat(secret, field) + stat(ancient, field);
    return result;
  }, {});
  const imperialBase = ['攻击', '防御', '血量'].reduce((result, key) => {
    const field = key === '血量' ? '基础血量' : `基础${key}`;
    result[key] = stat(secret, field) + stat(ancient, field);
    return result;
  }, {});
  const equipment = Object.fromEntries(Object.keys(realm).map(key => [key, realm[key] * (DARK_REVOLT_CONSTANTS.equipmentBonusPercent / 100)]));
  const imperial = Object.fromEntries(Object.keys(realm).map(key => [key, imperialBase[key] * DARK_REVOLT_CONSTANTS.imperialWeaponMultiplier]));
  const root = supreme.root || {};
  const rootMultiplier = {
    攻击: 1 + (Number(root.攻击) || 0),
    防御: 1 + (Number(root.防御) || 0),
    血量: 1 + (Number(root.生命) || 0),
  };
  const result = {
    攻击: Math.trunc((realm.攻击 + equipment.攻击 + imperial.攻击 + DARK_REVOLT_CONSTANTS.extraBonus) * rootMultiplier.攻击 * scale),
    防御: Math.trunc((realm.防御 + equipment.防御 + imperial.防御 + DARK_REVOLT_CONSTANTS.extraBonus) * rootMultiplier.防御 * scale),
    血量上限: Math.trunc((realm.血量 + equipment.血量 + imperial.血量 + DARK_REVOLT_CONSTANTS.extraBonus) * rootMultiplier.血量 * scale),
    暴击率: 3,
    暴击伤害: 2.5,
    灵根: { ...root },
    法球倍率: Number(root.法球倍率) || 3,
    level_id: Number(qi.level_id) || 64,
    Physique_id: Number(body.level_id) || 63,
    mijinglevel_id: DARK_REVOLT_CONSTANTS.secretRealmLevel,
    xiangulevel_id: DARK_REVOLT_CONSTANTS.xianguLevel,
    帝兵倍率: DARK_REVOLT_CONSTANTS.imperialWeaponMultiplier,
    装备加成: DARK_REVOLT_CONSTANTS.equipmentBonusPercent,
    额外加成: DARK_REVOLT_CONSTANTS.extraBonus,
    breakdown: { realm, equipment, imperial, extraBonus: DARK_REVOLT_CONSTANTS.extraBonus, imperialWeaponMultiplier: DARK_REVOLT_CONSTANTS.imperialWeaponMultiplier, equipmentBonusPercent: DARK_REVOLT_CONSTANTS.equipmentBonusPercent },
  };
  result.当前血量 = result.血量上限;
  return result;
}

/**
 * 至尊的帝道/皇道规则：境界低于大帝且未以仙古高阶法补足时，全属性只剩三成。
 * 返回副本，不修改玩家存档；battle 中用它构造被压制的战斗镜像。
 */
export function applyDarkRevoltSuppression(player, supreme = DARK_REVOLT_SUPREMES[0]) {
  const clone = { ...(player || {}) };
  const secret = Number(player?.mijinglevel_id) || 1;
  const ancient = Number(player?.xiangulevel_id) || 1;
  const baseSuppressed = Math.max(secret, ancient) < DARK_REVOLT_CONSTANTS.emperorLevel;
  const lawBypassed = Boolean(clone.大成圣体尸骸驾驭 || clone.corpseRescueActive);
  const suppressed = baseSuppressed && !lawBypassed;
  const lawType = supreme?.lawType || '帝道规则';
  if (suppressed) {
    for (const key of ['攻击', '防御', '血量上限', '当前血量', '攻击加成', '防御加成', '生命加成']) {
      if (Number.isFinite(Number(clone[key]))) clone[key] = Math.max(1, Math.trunc(Number(clone[key]) * DARK_REVOLT_CONSTANTS.lowerRealmRemain));
    }
  }
  return {
    player: clone,
    suppressed,
    lawBypassed,
    reduction: suppressed ? DARK_REVOLT_CONSTANTS.lowerRealmCut : 0,
    lawType,
  };
}

export function isSaintBodyPlayer(player = {}) {
  const root = player.灵根;
  const rootText = typeof root === 'string'
    ? `${root} ${player.体质 || ''} ${player.特殊体质 || ''}`
    : `${root?.name || ''} ${root?.type || ''} ${player.体质 || ''} ${player.特殊体质 || ''}`;
  return /圣体/.test(rootText);
}

/**
 * 将大成圣体尸骸短暂接入玩家战斗镜像。数值以当前至尊的九成二为上限，
 * 达到“叫板大帝”但不会永久改写玩家存档；法则豁免由 applyDarkRevoltSuppression 识别。
 */
export function activateDachengShengtiCorpse(player = {}, boss = {}) {
  const clone = { ...player };
  const ratio = DARK_REVOLT_CONSTANTS.corpseBossRatio;
  const bossAttack = Number(boss.攻击) || 0;
  const bossDefence = Number(boss.防御) || 0;
  const bossHealth = Number(boss.血量上限 || boss.Healthmax) || 0;
  clone.攻击 = Math.max(Number(clone.攻击) || 0, Math.trunc(bossAttack * ratio));
  clone.防御 = Math.max(Number(clone.防御) || 0, Math.trunc(bossDefence * ratio));
  clone.血量上限 = Math.max(Number(clone.血量上限) || 0, Math.trunc(bossHealth * ratio));
  clone.当前血量 = Math.max(Number(clone.当前血量) || 0, Math.trunc(clone.血量上限 * 0.72));
  clone.大成圣体尸骸驾驭 = true;
  clone.corpseRescueActive = true;
  clone.corpseRescueRounds = DARK_REVOLT_CONSTANTS.corpseRescueRounds;
  clone.法球倍率 = Math.max(Number(clone.法球倍率) || 0, 2.4);
  return clone;
}

export function createDarkRevoltStatus({ averageDamage = 1, playerQuantity = 1, levels = {} } = {}) {
  const safeAverage = Math.max(1, Number(averageDamage) || 1);
  const count = Math.max(1, Number(playerQuantity) || 1);
  const bosses = DARK_REVOLT_SUPREMES.map((supreme, index) => {
    const attrs = buildDarkRevoltAttributes(levels, supreme, 1 + index * 0.04);
    const health = Math.max(Math.trunc(attrs.血量上限 * (10 + count * 2) + safeAverage * 100), 1);
    return {
      ...attrs,
      id: supreme.id,
      名号: supreme.name,
      title: supreme.title,
      forbiddenZone: supreme.forbiddenZone,
      kind: supreme.kind,
      lawType: supreme.lawType,
      quote: supreme.quote,
      battle: supreme.battle,
      harvest: supreme.harvest,
      techniques: [...supreme.techniques],
      imperialWeapon: supreme.imperialWeapon,
      Health: health,
      Healthmax: health,
      OriginHealth: health,
      isAngry: 0,
      isWeak: 0,
      hasAscended: false,
      alive: true,
      defeated: false,
    };
  });
  const status = {
    version: 2,
    bosses,
    currentBossIndex: 0,
    activeBossId: bosses[0].id,
    Health: bosses[0].Health,
    Healthmax: bosses[0].Healthmax,
    OriginHealth: bosses[0].OriginHealth,
    Attack: bosses[0].攻击,
    Defence: bosses[0].防御,
    isAngry: 0,
    isWeak: 0,
    defeated: 0,
    totalBosses: bosses.length,
    // 开启瞬间先完成一次大范围收割；后续位面毁灭系统继续追加收割量。
    harvestedLives: Math.trunc(count * 10_000_000),
    harvestStartedAt: Date.now(),
    destroyedPlanes: [],
    KilledTime: -1,
    Reward: 30_000_000,
  };
  return status;
}

/** Upgrade old single-boss Redis state without discarding its cooldown/reward. */
export function normalizeDarkRevoltStatus(status) {
  if (!status || typeof status !== 'object') return status;
  if (Array.isArray(status.bosses) && status.bosses.length) return status;
  const legacy = DARK_REVOLT_SUPREMES[0];
  const oldHealth = Math.max(1, Number(status.Health) || 1);
  const oldBoss = {
    ...legacy,
    Health: oldHealth,
    Healthmax: Number(status.Healthmax) || oldHealth,
    OriginHealth: Number(status.OriginHealth) || oldHealth,
    攻击: Number(status.Attack) || 1,
    防御: Number(status.Defence) || 1,
    当前血量: Number(status.Health) || oldHealth,
    alive: oldHealth > 0,
    defeated: oldHealth <= 0,
    isAngry: Number(status.isAngry) || 0,
    isWeak: Number(status.isWeak) || 0,
    hasAscended: false,
  };
  const remainingBosses = DARK_REVOLT_SUPREMES.slice(1).map((supreme, index) => ({
    ...supreme,
    攻击: oldBoss.攻击,
    防御: oldBoss.防御,
    当前血量: oldBoss.Healthmax,
    Health: oldBoss.Healthmax,
    Healthmax: oldBoss.Healthmax,
    OriginHealth: oldBoss.Healthmax,
    isAngry: 0,
    isWeak: 0,
    hasAscended: false,
    alive: true,
    defeated: false,
    techniques: [...supreme.techniques],
    法球倍率: supreme.root.法球倍率,
    灵根: { ...supreme.root },
  }));
  return {
    ...status,
    version: 2,
    bosses: [oldBoss, ...remainingBosses],
    currentBossIndex: 0,
    activeBossId: legacy.id,
    defeated: 0,
    totalBosses: 6,
    harvestedLives: Number(status.harvestedLives) || 0,
    destroyedPlanes: Array.isArray(status.destroyedPlanes) ? status.destroyedPlanes : [],
  };
}

export function getActiveDarkRevoltBoss(status) {
  if (!status?.bosses?.length) return null;
  const index = status.bosses.findIndex(boss => boss.alive && !boss.defeated);
  if (index < 0) return null;
  status.currentBossIndex = index;
  status.activeBossId = status.bosses[index].id;
  return status.bosses[index];
}

export function syncDarkRevoltLegacyFields(status, boss = getActiveDarkRevoltBoss(status)) {
  if (!status) return status;
  if (!boss) {
    status.Health = 0;
    status.Healthmax = 0;
    status.Attack = 0;
    status.Defence = 0;
    status.isAngry = 0;
    status.isWeak = 0;
    return status;
  }
  status.Health = boss.Health;
  status.Healthmax = boss.Healthmax;
  status.OriginHealth = boss.OriginHealth;
  status.Attack = boss.攻击;
  status.Defence = boss.防御;
  status.isAngry = boss.isAngry;
  status.isWeak = boss.isWeak;
  return status;
}

export function damageDarkRevoltBoss(status, damage, targetBoss = null) {
  const boss = targetBoss || getActiveDarkRevoltBoss(status);
  if (!boss) return { boss: null, damage: 0, defeated: true };
  const dealt = Math.max(0, Math.trunc(Number(damage) || 0));
  boss.Health = Math.max(0, boss.Health - dealt);
  if (boss.Health === 0) {
    boss.alive = false;
    boss.defeated = true;
    status.defeated = (Number(status.defeated) || 0) + 1;
  }
  syncDarkRevoltLegacyFields(status);
  return { boss, damage: dealt, defeated: boss.defeated, remaining: boss.Health };
}

export function allDarkRevoltBossesDefeated(status) {
  return Array.isArray(status?.bosses) && status.bosses.length === DARK_REVOLT_SUPREMES.length && status.bosses.every(boss => boss.defeated);
}

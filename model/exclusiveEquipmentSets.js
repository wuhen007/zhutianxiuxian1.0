export const EXCLUSIVE_EQUIPMENT_SETS = Object.freeze({
  霜月剑尊套: Object.freeze({
    physiques: Object.freeze(['霜月剑尊', '岁云化身', '岁云剑尊']),
    weapon: '霜月剑', armor: '霜月剑袍', treasure: '霜月之莲',
    ids: Object.freeze([9600311, 9600312, 9600313]),
  }),
  岁云剑尊套: Object.freeze({
    physique: '岁云剑尊',
    weapon: '岁云剑',
    armor: '岁云袍',
    treasure: '云月之莲',
  }),
  终焉神魔套: Object.freeze({
    physique: '终焉神魔体',
    weapon: '【终焉】诸神黄昏',
    armor: '【终焉】神魔葬天衣',
    treasure: '【终焉】万劫归墟轮',
  }),
  万化天魔套: Object.freeze({
    physique: '无相·万化天魔体',
    weapon: '【万化】万相天魔刃',
    armor: '【万化】无相魔神袍',
    treasure: '【万化】万灵魔幡',
  }),
  彼岸命运神道套: Object.freeze({
    physique: '彼岸·命运神道体',
    weapon: '【彼岸】万古皆空·命运枪',
    armor: '【彼岸】万劫不坠天衣',
    treasure: '【彼岸】诸天命运轮',
  }),
});

export const ZHUTIAN_EQUIPMENT_STAGE_BONUSES = Object.freeze([0, 2.5, 5, 8, 15]);

export const ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS = Object.freeze({
  木之本樱: Object.freeze({
    setName: '魔卡守护套',
    world: '魔法少女樱',
    roots: Object.freeze(['木之本樱', '星之杖·木之本樱', '梦之杖·木之本樱']),
    weapon: Object.freeze({ id: 9600201, name: '【魔卡】星钥法杖' }),
    armor: Object.freeze({ id: 9600202, name: '【魔卡】守护法衣' }),
    treasure: Object.freeze({ id: 9600203, name: '【魔卡】库洛魔法书' }),
  }),
  鹿目圆: Object.freeze({
    setName: '圆环希望套',
    world: '魔法少女小圆',
    roots: Object.freeze(['鹿目圆', '许愿者·圆', '希望之光·圆', '圆神']),
    weapon: Object.freeze({ id: 9600204, name: '【圆环】因果长弓' }),
    armor: Object.freeze({ id: 9600205, name: '【圆环】希望法衣' }),
    treasure: Object.freeze({ id: 9600206, name: '【圆环】灵魂宝石' }),
  }),
  门矢士: Object.freeze({
    setName: '世界旅者套',
    world: '假面骑士帝骑',
    roots: Object.freeze(['门矢士', '帝骑', '帝骑·神主', '帝骑·终极神主']),
    weapon: Object.freeze({ id: 9600207, name: '【帝骑】驾驭卡盒剑' }),
    armor: Object.freeze({ id: 9600208, name: '【帝骑】次元战甲' }),
    treasure: Object.freeze({ id: 9600209, name: '【帝骑】次元驱动器' }),
  }),
  少女流萤: Object.freeze({
    setName: '焦土骑士套',
    world: '星穹铁道·匹诺康尼',
    roots: Object.freeze(['少女流萤', '流萤萨姆机甲']),
    weapon: Object.freeze({ id: 9600210, name: '【流萤】火萤IV型光刃' }),
    armor: Object.freeze({ id: 9600211, name: '【流萤】萨姆装甲' }),
    treasure: Object.freeze({ id: 9600212, name: '【流萤】变身器' }),
  }),
  伊蕾娜: Object.freeze({
    setName: '灰之魔女套',
    world: '魔女之旅',
    roots: Object.freeze(['伊蕾娜']),
    weapon: Object.freeze({ id: 9600213, name: '【灰之魔女】星辰魔杖' }),
    armor: Object.freeze({ id: 9600214, name: '【灰之魔女】旅行法袍' }),
    treasure: Object.freeze({ id: 9600215, name: '【灰之魔女】冒险日记' }),
  }),
  爱莉希雅: Object.freeze({
    setName: '无瑕始源套',
    world: '崩坏宇宙',
    roots: Object.freeze(['爱莉希雅', '人之律者·爱莉希雅', '始源之律者·爱莉希雅']),
    weapon: Object.freeze({ id: 9600216, name: '【始源】飞花爱之诗' }),
    armor: Object.freeze({ id: 9600217, name: '【始源】无瑕礼装' }),
    treasure: Object.freeze({ id: 9600218, name: '【始源】水晶花冠' }),
  }),
  天命青儿: Object.freeze({
    setName: '天命剑道套',
    world: '一剑独尊',
    roots: Object.freeze(['天命青儿']),
    weapon: Object.freeze({ id: 9600219, name: '【天命】行道剑' }),
    armor: Object.freeze({ id: 9600220, name: '【天命】大道青衣' }),
    treasure: Object.freeze({ id: 9600221, name: '【天命】天命剑匣' }),
  }),
});

export function getZhutianExclusiveEquipmentSet(avatarName) {
  return ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS[avatarName] || null;
}

export function getZhutianWorldCompletion(player, worldName) {
  const progress = player?.诸天镜系统?.世界进度?.[worldName] || {};
  const value = Number(progress.完成度 ?? progress.探索度) || 0;
  return Math.min(100, Math.max(0, Math.floor(value)));
}

export function getZhutianExclusiveEquipmentBonus(player, equipment = {}) {
  const rootName = String(player?.灵根?.name || '');
  for (const [avatarName, set] of Object.entries(ZHUTIAN_EXCLUSIVE_EQUIPMENT_SETS)) {
    const stage = set.roots.indexOf(rootName) + 1;
    if (stage <= 0) continue;
    const matches = [
      [equipment.武器, set.weapon],
      [equipment.护具, set.armor],
      [equipment.法宝, set.treasure],
    ].every(([equipped, required]) =>
      equipped?.name === required.name && Number(equipped.id) === required.id
    );
    if (!matches) return { active: false, avatarName, setName: set.setName, stage, bonus: 0 };
    const completion = getZhutianWorldCompletion(player, set.world);
    const maxBonus = ZHUTIAN_EQUIPMENT_STAGE_BONUSES[stage] || 0;
    return {
      active: true,
      avatarName,
      setName: set.setName,
      stage,
      bonus: Number((maxBonus * completion / 100).toFixed(4)),
    };
  }
  return { active: false, avatarName: '', setName: '', stage: 0, bonus: 0 };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasExclusiveEquipmentSet(player, equipment, setName) {
  const set = EXCLUSIVE_EQUIPMENT_SETS[setName];
  return Boolean(
    set &&
    (set.physiques ? set.physiques.includes(player?.灵根?.name) : player?.灵根?.name === set.physique) &&
    equipment?.武器?.name === set.weapon &&
    equipment?.护具?.name === set.armor &&
    equipment?.法宝?.name === set.treasure &&
    (!set.ids || [equipment.武器, equipment.护具, equipment.法宝].every((item, index) =>
      Number(item?.id) === set.ids[index] && (!item.绑定者 || String(item.绑定者) === String(player.id))))
  );
}

export function applyExclusiveSetOpening(player, equipment) {
  if (hasExclusiveEquipmentSet(player, equipment, '岁云剑尊套')) {
    player.全伤害类型加成 = number(player.全伤害类型加成) + 0.5;
    player.全类型减免 = Math.min(0.9, number(player.全类型减免) + 0.3);
    return {
      setName: '岁云剑尊套',
      messages: [`【岁云剑尊·云月天阙】${player.名号}执岁云剑、披岁云袍，云月之莲照彻诸世。全伤害提升50%，全类型减免提升30%。`],
    };
  }
  if (hasExclusiveEquipmentSet(player, equipment, '终焉神魔套')) {
    player.全伤害类型加成 = number(player.全伤害类型加成) + 0.4;
    player.全类型减免 = Math.min(0.9, number(player.全类型减免) + 0.2);
    player._终焉神魔领域 = true;
    return {
      setName: '终焉神魔套',
      messages: [
        `【神魔终焉·诸世归墟】${player.名号}披上葬天衣，归墟轮自背后升起，诸神黄昏照彻万界！`,
        '神也好，魔也罢，既见终焉，便已写在墓碑之上。全伤害提升40%，全类型减免提升20%。',
      ],
    };
  }

  if (hasExclusiveEquipmentSet(player, equipment, '彼岸命运神道套')) {
    player.全伤害类型加成 = number(player.全伤害类型加成) + 0.35;
    player.全类型减免 = Math.min(0.9, number(player.全类型减免) + 0.25);
    player.首次闪避 = true;
    player._彼岸命运改写 = true;
    return {
      setName: '彼岸命运神道套',
      messages: [
        `【彼岸神临·诸天改命】命运长河为${player.名号}倒卷，亿万朵彼岸花在诸天每一个纪元同时盛开！`,
        `不是${player.名号}走到了彼岸，而是彼岸因其一念才得以存在。万古皆空枪落入掌中，众生败亡之命已被提前写定！`,
        '全伤害提升35%，全类型减免提升25%，首次攻击必定闪避，并可改写一次败亡命运。',
      ],
    };
  }

  return { setName: '', messages: [] };
}

export function rewriteBeyondDefeat(player) {
  if (!player?._彼岸命运改写 || number(player.当前血量) > 0) return { revived: false, messages: [] };
  player._彼岸命运改写 = false;
  player.当前血量 = Math.max(1, Math.trunc(number(player.血量上限) * 0.5));
  player.攻击 = Math.max(1, Math.trunc(number(player.攻击) * 1.2));
  player.速度 = Math.max(1, Math.trunc((number(player.速度) || 100) * 1.2));
  player.dongjie = false;
  return {
    revived: true,
    messages: [
      `【彼岸·命运删改】${player.名号}战败的未来被诸天命运轮当场碾碎！`,
      '一页染血古史自时间长河中脱落，方才发生的一切被改写为虚妄。',
      `${player.名号}自彼岸尽头重新踏入现世，恢复50%生命，攻击与速度提升20%！`,
    ],
  };
}

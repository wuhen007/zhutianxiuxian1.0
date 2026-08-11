export const EXCLUSIVE_EQUIPMENT_SETS = Object.freeze({
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function hasExclusiveEquipmentSet(player, equipment, setName) {
  const set = EXCLUSIVE_EQUIPMENT_SETS[setName];
  return Boolean(
    set &&
    player?.灵根?.name === set.physique &&
    equipment?.武器?.name === set.weapon &&
    equipment?.护具?.name === set.armor &&
    equipment?.法宝?.name === set.treasure
  );
}

export function applyExclusiveSetOpening(player, equipment) {
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

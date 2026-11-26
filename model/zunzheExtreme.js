const clone = value => JSON.parse(JSON.stringify(value));

export const ZUNZHE_EXTREME_RESOURCES = Object.freeze([
  { name: '雷池真液', aliases: ['雷池真液', '雷池液'], class: '道具', quantity: 3 },
  { name: '血魂草', aliases: ['血魂草'], class: '草药', quantity: 1 },
  { name: '五行本源', aliases: ['五行本源'], class: '道具', quantity: 5 },
]);

export const ZUNZHE_THUNDER_STAGES = Object.freeze([
  { name: '五行雷罚', damage: 0.1, desc: '五行神雷轰击，肉身几近崩解' },
  { name: '仙道虚影', damage: 0.15, desc: '真龙、仙凰、雷帝虚影联手攻伐' },
  { name: '心魔劫', damage: 0.2, desc: '内心魔障显现，道心震颤' },
  { name: '终极雷海', damage: 0.3, desc: '雷海淹没天地，万物俱灭' },
]);

function getQuantity(najie, requirement) {
  const items = Array.isArray(najie?.[requirement.class]) ? najie[requirement.class] : [];
  return items.reduce((total, item) => (
    requirement.aliases.includes(item?.name)
      ? total + Math.max(0, Number(item.数量) || 0)
      : total
  ), 0);
}

function consumeQuantity(najie, requirement) {
  let remaining = requirement.quantity;
  const items = najie[requirement.class];

  for (const item of items) {
    if (remaining <= 0 || !requirement.aliases.includes(item?.name)) continue;
    const used = Math.min(Math.max(0, Number(item.数量) || 0), remaining);
    item.数量 -= used;
    remaining -= used;
  }

  najie[requirement.class] = items.filter(item => Number(item.数量) > 0);
}

export function normalizeXianguExtremeRealms(player) {
  player.极境 = [...new Set(
    (Array.isArray(player?.极境) ? player.极境 : []).map(levelId => String(levelId))
  )];
  return player.极境;
}

export function prepareZunzheExtremeTrial(player, najie, energyNeed) {
  const requiredEnergy = Math.max(0, Math.trunc(Number(energyNeed) || 0));
  const missingResources = ZUNZHE_EXTREME_RESOURCES
    .map(requirement => ({
      ...requirement,
      current: getQuantity(najie, requirement),
    }))
    .filter(requirement => requirement.current < requirement.quantity);

  const blood = Number(player?.血气) || 0;
  const cultivation = Number(player?.修为) || 0;
  if (missingResources.length > 0 || blood < requiredEnergy || cultivation < requiredEnergy) {
    return {
      ok: false,
      missingResources,
      missingBlood: Math.max(0, requiredEnergy - blood),
      missingCultivation: Math.max(0, requiredEnergy - cultivation),
    };
  }

  const nextPlayer = clone(player);
  const nextNajie = clone(najie);
  normalizeXianguExtremeRealms(nextPlayer);
  nextPlayer.血气 = blood - requiredEnergy;
  nextPlayer.修为 = cultivation - requiredEnergy;
  for (const requirement of ZUNZHE_EXTREME_RESOURCES) {
    consumeQuantity(nextNajie, requirement);
  }

  return { ok: true, player: nextPlayer, najie: nextNajie };
}

export function calculateZunzheDefenseReduction(defense) {
  const value = Math.max(0, Number(defense) || 0);
  return Math.min(0.6, value / (value + 500000));
}

export function calculateZunzheThunderStage({
  currentHP,
  maxHP,
  damageRate,
  liquidReduction = 0.3,
  defenseReduction = 0,
  immune = false,
}) {
  const maximum = Math.max(1, Math.trunc(Number(maxHP) || 1));
  const current = Math.min(maximum, Math.max(0, Math.trunc(Number(currentHP) || 0)));
  const damageAmount = immune
    ? 0
    : Math.max(0, Math.floor(
      maximum
      * Math.max(0, Number(damageRate) || 0)
      * (1 - Math.min(0.5, Math.max(0, Number(liquidReduction) || 0)))
      * (1 - Math.min(0.6, Math.max(0, Number(defenseReduction) || 0)))
    ));

  return {
    damageAmount,
    currentHP: Math.max(0, current - damageAmount),
  };
}

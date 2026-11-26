export const RED_DUST_FORTUNE_COST = 2_000_000;
export const RED_DUST_FORTUNE_DURATION_MS = 24 * 60 * 60 * 1000;

export const RED_DUST_FORTUNES = Object.freeze({
  question: Object.freeze({
    id: 'question',
    name: '问道签',
    description: '证道、冲关、渡劫、开启内景地与悟道代价减少20%',
  }),
  adventure: Object.freeze({
    id: 'adventure',
    name: '历练签',
    description: '副本结算的物品、修为与血气收益翻倍，可与其他增益叠加',
  }),
  seeking: Object.freeze({
    id: 'seeking',
    name: '寻缘签',
    description: '副本更易发现位面大事件、未知坐标与问仙残痕',
  }),
});

export function getRedDustFortuneType(value) {
  const text = String(value || '').trim();
  return Object.values(RED_DUST_FORTUNES)
    .find(fortune => fortune.id === text || fortune.name === text)?.id || null;
}

export function createRedDustFortune(type, eventTimestamp, now = Date.now()) {
  const id = getRedDustFortuneType(type);
  if (!id) return null;
  return {
    type: id,
    acquiredAt: now,
    expiresAt: now + RED_DUST_FORTUNE_DURATION_MS,
    eventTimestamp: Number(eventTimestamp) || 0,
  };
}

export function getActiveRedDustFortune(player, now = Date.now()) {
  const fortune = player?.红尘仙缘签;
  const type = getRedDustFortuneType(fortune?.type);
  if (!type || Number(fortune?.expiresAt) <= now) return null;
  return { ...fortune, type };
}

export function hasRedDustFortune(player, type, now = Date.now()) {
  return getActiveRedDustFortune(player, now)?.type === getRedDustFortuneType(type);
}

export function applyQuestionFortuneCost(player, amount, now = Date.now()) {
  const cost = Math.max(0, Number(amount) || 0);
  return hasRedDustFortune(player, 'question', now) ? Math.ceil(cost * 0.8) : cost;
}

export function getDungeonFortuneMultiplier(player, now = Date.now()) {
  return hasRedDustFortune(player, 'adventure', now) ? 2 : 1;
}

export function getSeekingFortuneMultipliers(player, now = Date.now()) {
  const active = hasRedDustFortune(player, 'seeking', now);
  return {
    realmEvent: active ? 5 : 1,
    coordinate: active ? 2 : 1,
    wenxian: active ? 2 : 1,
  };
}

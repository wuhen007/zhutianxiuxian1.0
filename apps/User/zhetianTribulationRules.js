export const ZHETIAN_TRIBULATION_DAMAGE_MULTIPLIERS = Object.freeze({
  斩道: 30,
  圣人: 45,
  圣人王: 60,
  大圣: 90,
  准帝: 120,
  大帝: 150,
  逆活: 180,
});

export function getReverseLifeTribulationWaves(life) {
  const normalizedLife = Math.max(1, Math.min(9, Math.trunc(Number(life) || 1)));
  return normalizedLife * 7;
}

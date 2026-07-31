export const XIANGU_REALM_ROUTES = Object.freeze({
  8: Object.freeze({ targetLevelId: 9, targetName: '真一境', costMultiplier: 30, tribulationMethod: '_runZhenyiTribulation' }),
  9: Object.freeze({ targetLevelId: 10, targetName: '圣祭境', costMultiplier: 30, tribulationMethod: '_runShengjiTribulation' }),
  10: Object.freeze({ targetLevelId: 11, targetName: '天神境', costMultiplier: 30, tribulationMethod: '_runTianshenBreakthrough' }),
  11: Object.freeze({ targetLevelId: 12, targetName: '虚道境', costMultiplier: 30, tribulationMethod: '_runXudaoTribulation' }),
  12: Object.freeze({ targetLevelId: 13, targetName: '斩我境', costMultiplier: 30, tribulationMethod: '_runZhanwoTribulation' }),
  13: Object.freeze({ targetLevelId: 14, targetName: '遁一境', costMultiplier: 30, tribulationMethod: '_runDunyiTribulation' }),
  14: Object.freeze({ targetLevelId: 15, targetName: '至尊境', costMultiplier: 30, tribulationMethod: '_runZhizunTribulation' }),
});

export function hasXianguGongfa(player, gongfa) {
  return !!(player.功法 && player.功法[gongfa])
    || (Array.isArray(player.学习的功法) && player.学习的功法.includes(gongfa));
}

export function settleXianguWaveDamage({
  player,
  bodyDamage,
  tryRevive,
  applyGongfaReduction,
}) {
  let revival = null;
  let revivedHp = null;

  // 功法减伤前达到致死线时，必须先触发复活。
  if (bodyDamage >= (player.当前血量 || 0)) {
    revival = tryRevive();
    if (revival) revivedHp = player.当前血量 || 0;
  }

  const damage = Math.max(1, Math.floor(applyGongfaReduction()));
  if (damage >= (player.当前血量 || 0)) {
    player.当前血量 = 0;
    return { revival, revivedHp, damage, dead: true };
  }

  player.当前血量 = (player.当前血量 || 0) - damage;
  return { revival, revivedHp, damage, dead: false };
}

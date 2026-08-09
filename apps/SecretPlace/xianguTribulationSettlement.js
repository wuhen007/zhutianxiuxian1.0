export const XIANGU_REALM_ROUTES = Object.freeze({
  8: Object.freeze({ targetLevelId: 9, targetName: '真一境', costMultiplier: 30, tribulationMethod: '_runZhenyiTribulation' }),
  9: Object.freeze({ targetLevelId: 10, targetName: '圣祭境', costMultiplier: 30, tribulationMethod: '_runShengjiTribulation' }),
  10: Object.freeze({ targetLevelId: 11, targetName: '天神境', costMultiplier: 30, tribulationMethod: '_runTianshenBreakthrough' }),
  11: Object.freeze({ targetLevelId: 12, targetName: '虚道境', costMultiplier: 30, tribulationMethod: '_runXudaoTribulation' }),
  12: Object.freeze({ targetLevelId: 13, targetName: '斩我境', costMultiplier: 30, tribulationMethod: '_runZhanwoTribulation' }),
  13: Object.freeze({ targetLevelId: 14, targetName: '遁一境', costMultiplier: 30, tribulationMethod: '_runDunyiTribulation' }),
  14: Object.freeze({ targetLevelId: 15, targetName: '至尊境', costMultiplier: 30, tribulationMethod: '_runZhizunTribulation' }),
});

// 载道劫判定（至尊路第四关）：自身之道境界达到「至尊·真意」及以上（阶段 index>=3）
// 即可以身为种、以我为根，借道而不失本我，不留隐患；否则借外道载道，留下道基隐患。
export function calcXianguCarryDaoFlaw(player) {
  const ownWayStrong = !!(player && player.已创自身之道)
    && Number(player?.自身之道阶段) >= 3;
  return { ownWayStrong, externalDaoFlaw: !ownWayStrong };
}

export function hasXianguGongfa(player, gongfa) {
  return !!(player.功法 && player.功法[gongfa])
    || (Array.isArray(player.学习的功法) && player.学习的功法.includes(gongfa));
}

// 仙古体系本命帝兵品阶（按仙古境界线进阶；前 3 档与后 5 档与遮天共用，中间 4 档为仙古专属）
const IMPERIAL_WEAPON_RANKS = Object.freeze([
  '雏形', '通灵', '铭刻道与理', '真神兵', '天神兵', '遁一兵', '至尊兵',
  '仙器', '仙王器', '准仙帝器', '仙帝器', '祭道器',
]);

// 遮天旧品阶 → 仙古品阶映射：仙古玩家旧存档帝兵（斩道王兵/圣兵/准帝兵/极道帝兵）自动对齐新体系档位
const LEGACY_RANK_MAP = Object.freeze({
  '斩道王兵': '真神兵',
  '圣兵': '天神兵',
  '准帝兵': '遁一兵',
  '极道帝兵': '至尊兵',
});

export function applyXianguImperialWeaponDefense(player, equipment, damage, random = Math.random) {
  const incoming = Math.max(1, Number(damage) || 0);
  const weapon = equipment?.帝兵;
  if (!weapon || weapon.author_name == null || String(weapon.author_name) !== String(player?.id)) {
    return { damage: incoming, reduction: 0, triggered: false };
  }

  const rankName = LEGACY_RANK_MAP[weapon.品阶] || weapon.品阶;
  const rankIndex = IMPERIAL_WEAPON_RANKS.indexOf(rankName);
  if (rankIndex < 1) return { damage: incoming, reduction: 0, triggered: false };

  const probability = Math.min(0.95, 0.3 + rankIndex * 0.08);
  const reductionRate = Math.min(0.7, 0.15 + rankIndex * 0.06);
  if (random() >= probability) {
    return { damage: incoming, reduction: 0, triggered: false, probability, reductionRate };
  }

  const reduction = incoming * reductionRate;
  return {
    damage: incoming - reduction,
    reduction,
    triggered: true,
    probability,
    reductionRate,
    rank: rankName,
    name: weapon.name || '本命帝兵',
  };
}

export function settleXianguWaveDamage({
  player,
  bodyDamage,
  tryRevive,
  gongfaActive = false,
  applyGongfaReduction,
}) {
  const damage = Math.max(1, Math.floor(
    gongfaActive ? applyGongfaReduction() : bodyDamage
  ));
  if (damage >= (player.当前血量 || 0)) {
    const revival = tryRevive();
    if (revival) {
      return {
        revival,
        revivedHp: player.当前血量 || 0,
        damage,
        avoided: true,
        dead: false,
      };
    }
    player.当前血量 = 0;
    return { revival: null, revivedHp: null, damage, avoided: false, dead: true };
  }

  player.当前血量 = (player.当前血量 || 0) - damage;
  return { revival: null, revivedHp: null, damage, avoided: false, dead: false };
}

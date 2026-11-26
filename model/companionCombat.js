export function getCompanionAttackAction(unit) {
  if (unit?._帝骑分身) return '驾驭骑士之力';
  if (unit?._圆神分身 || String(unit?.名号 || '').includes('圆环分身')) return '拉弓凝聚虹光';
  return '发动协同攻击';
}

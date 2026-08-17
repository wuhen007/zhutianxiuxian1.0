import { FLOWER_DAO_RULES } from './flowerPollenPath.js';
import { isCultivatingExtraPath } from './extraCultivation.js';

export const SHENGXU_RANK_LIMIT = 20;

function integer(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

export function isShengxuRankEligible(player) {
  return Boolean(player && isCultivatingExtraPath(player, 'huafen'));
}

export function getShengxuRankProfile(player) {
  const realmLevel = integer(player?.huafenlevel_id, 1);
  const rule = FLOWER_DAO_RULES.find(item => item.realmId === realmLevel);
  const flowerDaoExp = rule
    ? Math.min(rule.targetExp, integer(player?.花粉道途?.stages?.[rule.key]))
    : 0;
  const flowerDaoTarget = rule?.targetExp || 0;
  return {
    qq: String(player?.qq || player?.user_id || ''),
    name: player?.名号 || player?.qq || '无名修士',
    realmLevel,
    branch: player?.花粉路分支 || '未分支',
    flowerDaoExp,
    flowerDaoTarget,
    daoRatio: flowerDaoTarget ? flowerDaoExp / flowerDaoTarget : 0,
    extremeCount: Array.isArray(player?.花粉极境) ? player.花粉极境.length : 0,
    fieldStage: integer(player?.场域境界),
    accumulation: integer(player?.进化积淀),
  };
}

export function getShengxuRankEntries(players, limit = SHENGXU_RANK_LIMIT) {
  return (Array.isArray(players) ? players : [])
    .filter(isShengxuRankEligible)
    .map(getShengxuRankProfile)
    .sort((a, b) =>
      b.realmLevel - a.realmLevel
      || b.daoRatio - a.daoRatio
      || b.extremeCount - a.extremeCount
      || b.fieldStage - a.fieldStage
      || b.accumulation - a.accumulation
      || a.name.localeCompare(b.name, 'zh-CN')
      || a.qq.localeCompare(b.qq)
    )
    .slice(0, Math.max(1, Math.min(SHENGXU_RANK_LIMIT, integer(limit, SHENGXU_RANK_LIMIT))));
}

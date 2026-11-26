function realmAt(levels, levelId) {
  return (levels || []).find(item => Number(item?.level_id) === Number(levelId));
}

export function getXianguRealmDisplay(player, levels = []) {
  const levelId = Number(player?.xiangulevel_id) || 1;
  const realm = realmAt(levels, levelId);
  const baseName = realm?.level || '未知境界';

  if (levelId === 12 && player?.xiangu_jiutian_shidi) {
    return '虚道极境·九天十地劫';
  }
  if (levelId === 13 && player?.xiangu_zhanxian_zhadao) {
    return '斩我极境·斩仙铡刀劫';
  }

  const completed = new Set(
    (Array.isArray(player?.极境) ? player.极境 : []).map(value => String(value))
  );
  if (levelId === 8 && (player?.xiangu_shenhuo?.极境达成 || completed.has('8'))) {
    return player?.xiangu_shenhuo?.极境名称 || realm?.极境名称 || baseName;
  }
  if (completed.has(String(levelId)) && realm?.极境名称) return realm.极境名称;
  return baseName;
}

export function getFlowerRealmDisplay(player, levels = []) {
  const levelId = Number(player?.huafenlevel_id) || 1;
  const baseName = realmAt(levels, levelId)?.level || '未知境界';
  if (levelId === 17 && ['大宇', '究极'].includes(player?.花粉路分支)) {
    return `${player.花粉路分支}境`;
  }
  return baseName;
}

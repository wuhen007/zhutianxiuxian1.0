export function isDungeonMalignantEventImmune(player) {
  return (
    (Number(player?.mijinglevel_id) || 0) >= 12 ||
    (Number(player?.xiangulevel_id) || 0) >= 11 ||
    (Number(player?.huafenlevel_id) || 0) >= 11
  );
}

export function shouldTriggerDungeonMalignantEvent(player, random = Math.random) {
  return !isDungeonMalignantEventImmune(player) && random() < 0.4;
}

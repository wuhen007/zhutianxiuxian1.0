const DAY_MS = 24 * 60 * 60 * 1000;

export function isDaofaActive(player, now = Date.now()) {
  const endTime = Number(player?.daofaxianshu_endtime);
  return Number(player?.daofaxianshu) === 2 && Number.isFinite(endTime) && endTime > now;
}

export function refreshDaofaStatus(player, now = Date.now()) {
  if (Number(player?.daofaxianshu) !== 2) return 'inactive';

  if (!isDaofaActive(player, now)) {
    player.daofaxianshu = 0;
    player.daofaxianshu_endtime = 0;
    player.daofa = '未开启';
    return 'expired';
  }

  const remainingDays = Math.ceil((Number(player.daofaxianshu_endtime) - now) / DAY_MS);
  player.daofa = `已开启，当前剩余${remainingDays}天`;
  return 'active';
}

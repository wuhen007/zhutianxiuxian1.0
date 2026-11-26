const DAY_MS = 24 * 60 * 60 * 1000;

export function isDaofaActive(player, now = Date.now()) {
  const endTime = Number(player?.daofaxianshu_endtime);
  return Number(player?.daofaxianshu) === 2 && Number.isFinite(endTime) && endTime > now;
}

export function getDaofaDisplay(player, now = Date.now()) {
  if (!isDaofaActive(player, now)) return '未开启';
  const remainingDays = Math.ceil(
    ((Number(player.daofaxianshu_endtime) - now) / DAY_MS) * 10
  ) / 10;
  return `已开启，当前剩余${remainingDays}天`;
}

export function refreshDaofaStatus(player, now = Date.now()) {
  if (Number(player?.daofaxianshu) !== 2) {
    player.daofa = '未开启';
    return 'inactive';
  }

  if (!isDaofaActive(player, now)) {
    player.daofaxianshu = 0;
    player.daofaxianshu_endtime = 0;
    player.daofa = '未开启';
    return 'expired';
  }

  player.daofa = getDaofaDisplay(player, now);
  return 'active';
}

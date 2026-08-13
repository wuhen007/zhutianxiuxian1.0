export const NILUAN_TECHNIQUE = '逆乱八式';
export const BAITIAN_TEMPLE_NAME = '败天神殿';
export const BAITIAN_TEMPLE_SOURCE_COST = 20_000_000;
export const BAITIAN_TEMPLE_WORLD_STONE_COST = 15;
export const BAITIAN_TEMPLE_INTERVAL_HOURS = 4;
export const BAITIAN_TEMPLE_SOURCE_PER_INTERVAL = 5_000_000;
export const BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL = 5;
export const BAITIAN_TEMPLE_MAX_HOURS = 96;

const EMPTY_REWARDS = Object.freeze({ cycles: 0, hours: 0, sourceStone: 0, insight: 0 });

function findStack(najie, itemClass, name) {
  return najie?.[itemClass]?.find(item => item?.name === name);
}

function removeOne(najie, itemClass, item) {
  item.数量 = Math.max(0, (Number(item.数量) || 0) - 1);
  najie[itemClass] = najie[itemClass].filter(entry => (Number(entry?.数量) || 0) > 0);
}

export function openJadeCasket(player, najie) {
  if (player?.败天传承已开启 || player?.学习的功法?.includes(NILUAN_TECHNIQUE)) {
    return { ok: false, reason: 'opened' };
  }
  const casket = findStack(najie, '道具', '玉石匣');
  if (!casket || (Number(casket.数量) || 0) < 1) return { ok: false, reason: 'missing' };

  player.败天传承已开启 = true;
  player.学习的功法 = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
  player.学习的功法.push(NILUAN_TECHNIQUE);
  player.功法熟练度 = player.功法熟练度 && typeof player.功法熟练度 === 'object' && !Array.isArray(player.功法熟练度)
    ? player.功法熟练度
    : {};
  player.功法熟练度[NILUAN_TECHNIQUE] = Math.max(
    0,
    Number(player.功法熟练度[NILUAN_TECHNIQUE]) || 0
  );
  removeOne(najie, '道具', casket);
  return { ok: true };
}

export function buildBaitianTemple(player, najie, world, now = new Date()) {
  if (!player?.败天传承已开启 && !player?.学习的功法?.includes(NILUAN_TECHNIQUE)) {
    return { ok: false, reason: 'locked' };
  }
  if (world?.败天神殿) return { ok: false, reason: 'built' };

  const sourceStone = Math.max(0, Number(player?.源石) || 0);
  const worldStone = findStack(najie, '材料', '世界石');
  const worldStoneCount = Math.max(0, Number(worldStone?.数量) || 0);
  if (sourceStone < BAITIAN_TEMPLE_SOURCE_COST || worldStoneCount < BAITIAN_TEMPLE_WORLD_STONE_COST) {
    return { ok: false, reason: 'materials', sourceStone, worldStone: worldStoneCount };
  }

  player.源石 = sourceStone - BAITIAN_TEMPLE_SOURCE_COST;
  worldStone.数量 = worldStoneCount - BAITIAN_TEMPLE_WORLD_STONE_COST;
  najie.材料 = najie.材料.filter(item => (Number(item?.数量) || 0) > 0);
  const timestamp = now.toISOString();
  world.败天神殿 = { 建成时间: timestamp, 上次结算时间: timestamp };
  return { ok: true };
}

export function settleBaitianTemple(world, now = new Date()) {
  const temple = world?.败天神殿;
  if (!temple) return { ...EMPTY_REWARDS };

  const nowTime = now.getTime();
  if (!Number.isFinite(nowTime)) return { ...EMPTY_REWARDS };
  const last = new Date(temple.上次结算时间 || temple.建成时间);
  if (!Number.isFinite(last.getTime()) || last > now) {
    temple.上次结算时间 = now.toISOString();
    return { ...EMPTY_REWARDS };
  }
  const elapsedHours = (nowTime - last.getTime()) / 3_600_000;
  if (elapsedHours < BAITIAN_TEMPLE_INTERVAL_HOURS) {
    return { ...EMPTY_REWARDS };
  }

  const cycles = Math.floor(
    Math.min(elapsedHours, BAITIAN_TEMPLE_MAX_HOURS) / BAITIAN_TEMPLE_INTERVAL_HOURS
  );
  const hours = cycles * BAITIAN_TEMPLE_INTERVAL_HOURS;
  temple.上次结算时间 = elapsedHours > BAITIAN_TEMPLE_MAX_HOURS
    ? now.toISOString()
    : new Date(last.getTime() + hours * 3_600_000).toISOString();
  return {
    cycles,
    hours,
    sourceStone: cycles * BAITIAN_TEMPLE_SOURCE_PER_INTERVAL,
    insight: cycles * BAITIAN_TEMPLE_INSIGHT_PER_INTERVAL,
  };
}

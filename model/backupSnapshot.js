import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export const ARCHIVE_ERA_NAMES = Object.freeze([
  '神话时代',
  '太古时代',
  '天命时代',
  '末法时代',
  '绝灵时代',
]);

export function findPlayerArchiveSnapshot({
  backupPath,
  dataPath,
  liveDirectory,
  legacyKey,
  fileName,
  fileSystem = fs,
}) {
  const relativeDirectory = path.relative(dataPath, liveDirectory);
  if (relativeDirectory && !relativeDirectory.startsWith('..') && !path.isAbsolute(relativeDirectory)) {
    const current = path.join(backupPath, 'data', relativeDirectory, fileName);
    if (fileSystem.existsSync(current)) return current;
  }

  for (const key of Array.isArray(legacyKey) ? legacyKey : [legacyKey]) {
    const legacy = path.join(backupPath, key, fileName);
    if (fileSystem.existsSync(legacy)) return legacy;
  }
  return '';
}

export function selectBackupsToDelete(folderNames, {
  keepCount = 30,
  retentionDays = 7,
  now = Date.now(),
} = {}) {
  const timestamps = folderNames
    .map(Number)
    .filter(timestamp => Number.isFinite(timestamp) && timestamp > 0)
    .sort((a, b) => a - b);
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - Math.max(0, Math.trunc(retentionDays)));

  const inWindow = timestamps.filter(timestamp => timestamp >= cutoff.getTime());
  const recentCount = Math.max(0, Math.trunc(keepCount));
  const keep = new Set(recentCount > 0 ? inWindow.slice(-recentCount) : []);
  const latestByDay = new Map();

  for (const timestamp of inWindow) {
    const date = new Date(timestamp);
    const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    latestByDay.set(day, timestamp);
  }
  for (const timestamp of latestByDay.values()) keep.add(timestamp);

  return timestamps.filter(timestamp => !keep.has(timestamp)).map(String);
}

export function listBackupLineIds(backupRoot, fileSystem = fs) {
  if (!fileSystem.existsSync(backupRoot)) return [];
  return fileSystem.readdirSync(backupRoot)
    .filter(name => name === String(Number(name)))
    .filter(name => fileSystem.statSync(path.join(backupRoot, name)).isDirectory())
    .sort((a, b) => Number(b) - Number(a));
}

export function readBackupEra({ backupRoot, lineId, fileSystem = fs }) {
  const configFile = path.join(
    backupRoot,
    String(lineId),
    'runtime_config',
    'xiuxian',
    'xiuxian.yaml',
  );
  if (!fileSystem.existsSync(configFile)) return { known: false, label: '古史时代不可考' };
  try {
    const current = YAML.parse(fileSystem.readFileSync(configFile, 'utf8'))?.Era?.current || {};
    const index = Math.trunc(Number(current.index));
    if (!ARCHIVE_ERA_NAMES[index]) return { known: false, label: '古史时代不可考' };
    const epoch = Math.max(1, Math.trunc(Number(current.epoch) || 1));
    const years = Math.max(0, Math.trunc(Number(current.years) || 0));
    return {
      known: true,
      index,
      epoch,
      years,
      name: ARCHIVE_ERA_NAMES[index],
      label: `第${epoch}纪元·${ARCHIVE_ERA_NAMES[index]}（第${years}年）`,
    };
  } catch {
    return { known: false, label: '古史时代不可考' };
  }
}

export function listArchivePlayerIds({
  backupRoot,
  lineIds = listBackupLineIds(backupRoot),
  dataPath,
  playerDirectory,
  najieDirectory,
  fileSystem = fs,
}) {
  const ids = new Set();
  for (const lineId of lineIds) {
    const backupPath = path.join(backupRoot, String(lineId));
    const directories = [];
    for (const liveDirectory of [playerDirectory, najieDirectory]) {
      const relative = path.relative(dataPath, liveDirectory);
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        directories.push(path.join(backupPath, 'data', relative));
      }
    }
    directories.push(
      path.join(backupPath, 'player'),
      path.join(backupPath, 'player_path'),
      path.join(backupPath, 'najie'),
      path.join(backupPath, 'najie_path'),
    );
    for (const directory of directories) {
      if (!fileSystem.existsSync(directory) || !fileSystem.statSync(directory).isDirectory()) continue;
      for (const fileName of fileSystem.readdirSync(directory)) {
        if (fileName.endsWith('.json')) ids.add(fileName.slice(0, -5));
      }
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
}

export function readPlayerArchiveInventory({
  backupRoot,
  lineId,
  dataPath,
  playerId,
  playerDirectory,
  najieDirectory,
  fileSystem = fs,
}) {
  const backupPath = path.join(backupRoot, String(lineId));
  const fileName = `${playerId}.json`;
  const readJson = filePath => {
    if (!filePath) return null;
    try {
      return JSON.parse(fileSystem.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  };
  return {
    player: readJson(findPlayerArchiveSnapshot({
      backupPath,
      dataPath,
      liveDirectory: playerDirectory,
      legacyKey: ['player', 'player_path'],
      fileName,
      fileSystem,
    })),
    najie: readJson(findPlayerArchiveSnapshot({
      backupPath,
      dataPath,
      liveDirectory: najieDirectory,
      legacyKey: ['najie', 'najie_path'],
      fileName,
      fileSystem,
    })),
  };
}

export function isArchiveItemWithdrawable(item) {
  return Boolean(item) && !item.不可支取 && !item.全时间线唯一
    && !['无上天阙枝', '岁云的残念', '岁云残念'].includes(item.name);
}

export function extractArchiveItem(snapshot, category, itemName) {
  if (!snapshot) return null;
  if (category === '灵石') {
    const amount = Math.max(0, Number(snapshot.player?.灵石) || 0);
    return amount > 0 ? { category, name: '灵石', amount } : null;
  }
  if (category === '纳戒灵石') {
    const amount = Math.max(0, Number(snapshot.najie?.灵石) || 0);
    return amount > 0 ? { category, name: '纳戒灵石', amount } : null;
  }

  const items = snapshot.najie?.[category];
  if (!Array.isArray(items)) return null;
  const item = items.find(value => value?.name === itemName && Number(value.数量) > 0 && isArchiveItemWithdrawable(value));
  if (!item) return null;
  return {
    category,
    name: item.name,
    amount: Math.max(0, Number(item.数量) || 0),
    item: structuredClone(item),
  };
}

export function mergeArchiveItem({ player, najie }, entry) {
  if (!entry || entry.amount <= 0) return false;
  if (!['灵石', '纳戒灵石'].includes(entry.category) && !isArchiveItemWithdrawable(entry.item)) return false;
  if (entry.category === '灵石') {
    player.灵石 = (Number(player.灵石) || 0) + entry.amount;
    return true;
  }
  if (entry.category === '纳戒灵石') {
    najie.灵石 = (Number(najie.灵石) || 0) + entry.amount;
    return true;
  }

  najie[entry.category] = Array.isArray(najie[entry.category]) ? najie[entry.category] : [];
  const source = structuredClone(entry.item);
  const same = najie[entry.category].find(item =>
    item?.name === source.name
    && Number(item.pinji ?? -1) === Number(source.pinji ?? -1)
    && String(item.author_name || '') === String(source.author_name || '')
  );
  if (same) same.数量 = (Number(same.数量) || 0) + entry.amount;
  else {
    source.数量 = entry.amount;
    najie[entry.category].push(source);
  }
  return true;
}

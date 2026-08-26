import fs from 'node:fs';
import path from 'node:path';

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

  const legacy = path.join(backupPath, legacyKey, fileName);
  return fileSystem.existsSync(legacy) ? legacy : '';
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
      legacyKey: 'player',
      fileName,
      fileSystem,
    })),
    najie: readJson(findPlayerArchiveSnapshot({
      backupPath,
      dataPath,
      liveDirectory: najieDirectory,
      legacyKey: 'najie',
      fileName,
      fileSystem,
    })),
  };
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
  const item = items.find(value => value?.name === itemName && Number(value.数量) > 0);
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

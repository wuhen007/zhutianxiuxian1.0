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

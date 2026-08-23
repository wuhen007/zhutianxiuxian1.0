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

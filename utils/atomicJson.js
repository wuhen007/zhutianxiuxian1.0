import fs from 'node:fs';

export function writeJsonAtomically(filePath, value, fileSystem = fs) {
  writeFileAtomically(filePath, JSON.stringify(value, null, '\t'), fileSystem);
}

export function writeFileAtomically(filePath, content, fileSystem = fs) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const tempPath = `${filePath}.${suffix}.tmp`;

  try {
    fileSystem.writeFileSync(tempPath, content, 'utf8');
    fileSystem.renameSync(tempPath, filePath);
  } finally {
    if (fileSystem.existsSync(tempPath)) fileSystem.unlinkSync(tempPath);
  }
}

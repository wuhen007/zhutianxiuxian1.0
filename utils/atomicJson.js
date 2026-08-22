import fs from 'node:fs';

const renameRetryDelays = [20, 40];
const retryableRenameErrors = new Set(['EACCES', 'EBUSY', 'EPERM']);
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

export function writeJsonAtomically(filePath, value, fileSystem = fs) {
  writeFileAtomically(filePath, JSON.stringify(value, null, '\t'), fileSystem);
}

export function writeFileAtomically(filePath, content, fileSystem = fs) {
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
  const tempPath = `${filePath}.${suffix}.tmp`;

  try {
    fileSystem.writeFileSync(tempPath, content, 'utf8');
    try {
      renameWithRetry(fileSystem, tempPath, filePath);
    } catch (error) {
      if (!retryableRenameErrors.has(error?.code)) throw error;

      // Windows scanners often allow writes but temporarily deny replacing an open file.
      fileSystem.writeFileSync(filePath, content, 'utf8');
    }
  } finally {
    if (fileSystem.existsSync(tempPath)) {
      try {
        fileSystem.unlinkSync(tempPath);
      } catch (error) {
        if (!retryableRenameErrors.has(error?.code)) throw error;
      }
    }
  }
}

function renameWithRetry(fileSystem, sourcePath, targetPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fileSystem.renameSync(sourcePath, targetPath);
      return;
    } catch (error) {
      const delay = renameRetryDelays[attempt];
      if (!retryableRenameErrors.has(error?.code) || delay === undefined) throw error;
      Atomics.wait(sleepBuffer, 0, 0, delay);
    }
  }
}

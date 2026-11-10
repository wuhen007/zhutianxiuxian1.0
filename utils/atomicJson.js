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
    // 先落盘再改名：OS 崩溃时元数据可能已提交而数据未提交，会留下「大小正确、内容全零」的存档
    if (typeof fileSystem.openSync === 'function') {
      const fd = fileSystem.openSync(tempPath, 'r+');
      try {
        fileSystem.fsyncSync(fd);
      } finally {
        fileSystem.closeSync(fd);
      }
    }
    try {
      renameWithRetry(fileSystem, tempPath, filePath);
    } catch (error) {
      if (!retryableRenameErrors.has(error?.code)) throw error;

      // Windows scanners often allow writes but temporarily deny replacing an open file.
      // shortcut: 这条回退是直接覆盖，非原子；仅在 rename 被占用且重试耗尽时走到
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

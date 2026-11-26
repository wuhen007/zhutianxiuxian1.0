import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
const delays = [20, 40, 80, 160];
const retryableErrors = new Set(['EACCES', 'EBUSY', 'EPERM']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validateMainConfig(value) {
  const objects = ['CD', 'percentage', 'size', 'switch', 'biguan', 'work', 'Sign',
    'Auction', 'Auction2', 'SecretPlace', 'Era', 'AutoDailyTask'];
  const missing = objects.filter(key => !isObject(value?.[key]));
  if (!isObject(value) || missing.length) {
    throw new Error(`修仙主配置不完整（缺少 ${missing.join(', ') || '对象结构'}），已停止读写；请从已验证备份恢复。`);
  }
  for (const field of ['one', 'two', 'three']) {
    const number = value.SecretPlace[field];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1) {
      throw new Error(`修仙主配置 SecretPlace.${field} 应为 0～1 的数值。`);
    }
  }
  for (const [section, field] of [['Auction', 'Auction_task'], ['Auction2', 'Auction_task'], ['AutoDailyTask', 'cron']]) {
    if (typeof value[section][field] !== 'string' || !value[section][field].trim()) {
      throw new Error(`修仙主配置 ${section}.${field} 缺失，已停止读写。`);
    }
  }
  return value;
}

export function atomicWriteConfig(file, content, fileSystem = fs, sleep = ms => Atomics.wait(waitBuffer, 0, 0, ms)) {
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  let committed = false;
  try {
    fd = fileSystem.openSync(temporary, 'wx');
    fileSystem.writeFileSync(fd, content, 'utf8');
    fileSystem.fsyncSync(fd);
    fileSystem.closeSync(fd);
    fd = undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        fileSystem.renameSync(temporary, file);
        committed = true;
        break;
      } catch (error) {
        if (!retryableErrors.has(error?.code) || attempt >= delays.length) throw error;
        sleep(delays[attempt]);
      }
    }
  } finally {
    if (fd !== undefined) {
      try { fileSystem.closeSync(fd); } catch {}
    }
    // 仅清理由本次调用生成的临时文件；从不清空或删除目标配置。
    if (!committed) {
      try { fileSystem.unlinkSync(temporary); } catch {}
    }
  }
}

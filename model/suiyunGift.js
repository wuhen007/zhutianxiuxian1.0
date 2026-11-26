import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { SUIYUN_GIFT_LIMIT } from './suiyun.js';

export { SUIYUN_GIFT_LIMIT };
export const SUIYUN_GIFT_FILE = fileURLToPath(new URL('../resources/data/suiyun_gift', import.meta.url));
const slotFile = (file, slot) => `${file}.${slot}.json`;

function createSlot(file, claim) {
  const target = slotFile(file, claim.slot);
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(claim), { encoding: 'utf8', flag: 'wx' });
    // 完整 JSON 通过硬链接独占发布，其他进程不会读到刚创建但尚未写完的空文件。
    fs.linkSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readSlot(file, slot) {
  try {
    const claim = JSON.parse(fs.readFileSync(slotFile(file, slot), 'utf8'));
    if (!claim?.ownerId || !claim.recipientId || claim.slot !== slot
      || !Number.isFinite(claim.at) || typeof claim.delivered !== 'boolean') {
      throw new Error(`月华传承第${slot}席记录异常，请核对存档`);
    }
    return claim;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    // 损坏记录继续占位，避免重复发放同一名额。
    throw error;
  }
}

export function readSuiyunGifts({ file = SUIYUN_GIFT_FILE } = {}) {
  return Array.from({ length: SUIYUN_GIFT_LIMIT }, (_, index) => readSlot(file, index + 1)).filter(Boolean);
}

export async function withSuiyunGiftClaim(ownerId, recipientId, recipientName, grant, {
  file = SUIYUN_GIFT_FILE, now = Date.now(),
} = {}) {
  ownerId = String(ownerId || '').trim();
  recipientId = String(recipientId || '').trim();
  if (!ownerId || !recipientId || ownerId === recipientId || typeof grant !== 'function'
    || !Number.isFinite(now) || now < 0) {
    throw new TypeError('月华传承需要两位不同的修士与发放步骤');
  }
  return withPlayerMutationLock(`suiyun-gift:${file}`, async () => {
    let claim = readSuiyunGifts({ file }).find(entry => entry.recipientId === recipientId);
    if (!claim) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      for (let slot = 1; slot <= SUIYUN_GIFT_LIMIT; slot++) {
        const candidate = { ownerId, recipientId, recipientName: String(recipientName || recipientId), slot, at: now, delivered: false };
        try {
          // 全服五份独占记录：多个进程同时赐予也受席位上限约束。
          createSlot(file, candidate);
          claim = candidate;
          break;
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
          const existing = readSlot(file, slot);
          if (existing.recipientId === recipientId) { claim = existing; break; }
        }
      }
    }
    if (!claim) return { ok: false, reason: `月华传承的${SUIYUN_GIFT_LIMIT}个名额已用尽，请先 #收回月华 @目标 释放原席。` };
    if (claim.delivered) return { ok: true, alreadyGranted: true, claim };
    if (claim.ownerId !== ownerId) return { ok: false, reason: '这位修士已有待完成的月华传承，请由原授予者继续赐予。', claim };
    // 先占位后落玩家存档；不确定的写入失败保留该席，原目标重试补齐，不换人重发。
    if (await grant(claim) === false) return { ok: false, pending: true, reason: '传承已预留，请再次向同一目标发送 #赐予月华 完成落盘。', claim };
    const completed = { ...claim, delivered: true };
    writeJsonAtomically(slotFile(file, claim.slot), completed);
    return { ok: true, alreadyGranted: false, claim: completed };
  });
}

export async function revokeSuiyunGift(ownerId, recipientId, revoke, { file = SUIYUN_GIFT_FILE } = {}) {
  ownerId = String(ownerId || '').trim();
  recipientId = String(recipientId || '').trim();
  if (!ownerId || !recipientId || ownerId === recipientId || typeof revoke !== 'function') {
    throw new TypeError('收回月华需要授予者、受赐者与收回步骤');
  }
  return withPlayerMutationLock(`suiyun-gift:${file}`, async () => {
    const claim = readSuiyunGifts({ file }).find(entry => entry.recipientId === recipientId);
    if (!claim) return { ok: false, reason: '这位修士未占用月华传承名额。' };
    if (claim.ownerId !== ownerId) return { ok: false, reason: '请由原授予者收回这份月华传承。' };
    // 先移除玩家战技再释放席位；中断时原席仍在，可向同一目标重试收回。
    if (await revoke(claim) === false) return { ok: false, reason: '月华传承尚未收回，请向同一目标重试。' };
    const current = readSlot(file, claim.slot);
    if (!current || JSON.stringify(current) !== JSON.stringify(claim)) {
      throw new Error('月华席位已变化，请重新查看名额。');
    }
    fs.unlinkSync(slotFile(file, claim.slot));
    return { ok: true, claim };
  });
}

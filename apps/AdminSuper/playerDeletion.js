import fs from 'node:fs';
import path from 'node:path';

import {
  FileRollbackTransaction,
  writeJsonAtomically,
} from '../SecretPlace/rebirthTransaction.js';

const PLAYER_FILE_DEFINITIONS = [
  ['内景地', 'inner_world_path'],
  ['纳戒', 'najie_path'],
  ['装备', 'equipment_path'],
  ['丹药', 'danyao_path'],
  ['玩家存档', 'player_path'],
];

export function normalizePlayerId(playerId) {
  const normalized = String(playerId ?? '').replace(/^qg_/, '').trim();
  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    throw new TypeError('玩家账号格式无效');
  }
  return normalized;
}

export function removePlayerSmallWorlds(playerId, smallWorlds) {
  const normalizedId = normalizePlayerId(playerId);
  if (!Array.isArray(smallWorlds)) {
    throw new TypeError('小世界列表格式无效');
  }

  const remainingSmallWorlds = smallWorlds.filter(
    world => String(world?.player_qq ?? '') !== normalizedId
  );

  return {
    remainingSmallWorlds,
    removedCount: smallWorlds.length - remainingSmallWorlds.length,
  };
}

export function deletePlayerDataBundle({
  playerId,
  paths,
  smallWorlds,
  smallWorldFile,
  fileSystem = fs,
  fileTransaction = null,
}) {
  const normalizedId = normalizePlayerId(playerId);
  const targets = PLAYER_FILE_DEFINITIONS.map(([label, pathKey]) => {
    const directory = paths?.[pathKey];
    if (typeof directory !== 'string' || directory.length === 0) {
      throw new TypeError(`缺少${label}存储路径`);
    }
    return {
      label,
      filePath: path.join(directory, `${normalizedId}.json`),
    };
  });

  if (typeof smallWorldFile !== 'string' || smallWorldFile.length === 0) {
    throw new TypeError('缺少小世界列表路径');
  }

  const { remainingSmallWorlds, removedCount } = removePlayerSmallWorlds(
    normalizedId,
    smallWorlds
  );
  const transaction = fileTransaction ?? new FileRollbackTransaction(fileSystem);
  const managesTransaction = fileTransaction === null;
  const removedFiles = [];
  const missingFiles = [];

  try {
    for (const target of targets) {
      transaction.capture(target.filePath);
    }
    if (removedCount > 0) {
      transaction.capture(smallWorldFile);
    }

    for (const target of targets) {
      if (fileSystem.existsSync(target.filePath)) {
        fileSystem.unlinkSync(target.filePath);
        removedFiles.push(target.label);
      } else {
        missingFiles.push(target.label);
      }
    }

    if (removedCount > 0) {
      writeJsonAtomically(smallWorldFile, remainingSmallWorlds, fileSystem);
    }

    if (managesTransaction) transaction.commit();
  } catch (error) {
    if (!managesTransaction) throw error;
    try {
      transaction.rollback();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `玩家 ${normalizedId} 删档失败，且回滚未完整完成`
      );
    }
    throw error;
  }

  return {
    playerId: normalizedId,
    removedFiles,
    missingFiles,
    removedSmallWorlds: removedCount,
    remainingSmallWorlds,
  };
}

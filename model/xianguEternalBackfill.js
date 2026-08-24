import fs from 'node:fs';
import path from 'node:path';

import { claimXianguUniqueTreasure } from '../apps/SecretPlace/xianguSharedState.js';
import { isCanonicalDaluoSwordEmbryo } from './equipmentStats.js';

/**
 * 天地唯一机缘·全服补登
 *
 * 背景：仙古「天地唯一」判定只认 Redis 永久认领记录（worldSeed='eternal'）。
 * 认领机制上线前已持有 大罗剑胎/玉石匣/帝血 的玩家身上有物、记录缺失，
 * 仍可在后续轮次再搜刮出第二份。本模块一次性扫描全服存档，把持有者补进认领记录。
 *
 * 注意映射：认领记录 entityId 是地图 key（'玉石匣·仙王经文'/'一滴帝血'），
 * 与玩家物品名（'玉石匣'/'帝血'）不同，必须转换。
 */
export const ETERNAL_ITEM_CLAIM_KEYS = Object.freeze({
  大罗剑胎: '大罗剑胎',
  玉石匣: '玉石匣·仙王经文',
  帝血: '一滴帝血',
});

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function resolveClaimKey(item) {
  const name = typeof item === 'object' ? item?.name || item?.名称 : item;
  if (!name) return null;
  const value = String(name).trim();
  if (value === '大罗剑胎' && !isCanonicalDaluoSwordEmbryo(item)) return null;
  return Object.hasOwn(ETERNAL_ITEM_CLAIM_KEYS, value) ? ETERNAL_ITEM_CLAIM_KEYS[value] : null;
}

/**
 * 收集某玩家身上持有的唯一物（返回认领 entityId 集合）。
 * 覆盖：装备三槽、纳戒装备/道具、玩家存档内秘境背包（撤离后已清，兼容历史残留）。
 * 内景地当前无独立数据文件（inner_world 目录为空），留待有数据时在此追加。
 */
export function collectHeldEternalItems({ player, equipment, najie } = {}) {
  const held = new Set();
  const consider = item => {
    const claimKey = resolveClaimKey(item);
    if (claimKey) held.add(claimKey);
  };
  for (const slot of ['武器', '护具', '法宝']) {
    consider(equipment?.[slot]);
  }
  for (const item of najie?.装备 || []) consider(item);
  for (const item of najie?.道具 || []) consider(item);
  for (const item of player?.xiangu_bag?.items || []) consider(item);
  return held;
}

/**
 * 扫描全服玩家存档并补登唯一机缘认领记录（幂等）。
 * @param {Object} options
 * @param {*} options.redisClient 支持 set(key, value, { NX, EX }) 的 redis 客户端
 * @param {string} options.playerDir 玩家存档目录
 * @param {string} options.equipmentDir 装备存档目录
 * @param {string} options.najieDir 纳戒存档目录
 * @param {number} [options.limit=0] 单次最多扫描玩家数（0=全部）
 * @param {boolean} [options.dryRun=false] 预览模式：只统计不写入
 * @param {Function} [options.log] 日志回调
 */
export async function backfillXianguEternalClaims(options = {}) {
  const {
    redisClient,
    playerDir,
    equipmentDir,
    najieDir,
    limit = 0,
    dryRun = false,
    log = () => {},
  } = options;
  if (!redisClient || typeof redisClient.set !== 'function') {
    throw new TypeError('backfillXianguEternalClaims 需要 redisClient');
  }
  const stats = {
    scanned: 0,
    holders: 0,
    registered: 0,
    skipped: 0,
    failed: 0,
    byName: {},
  };
  const files = fs.existsSync(playerDir)
    ? fs.readdirSync(playerDir).filter(file => file.endsWith('.json')).sort()
    : [];
  const total = limit > 0 ? Math.min(limit, files.length) : files.length;
  for (let index = 0; index < total; index++) {
    const file = files[index];
    const playerId = file.replace(/\.json$/, '');
    try {
      const player = readJsonFile(path.join(playerDir, file)) || {};
      const equipment = readJsonFile(path.join(equipmentDir, `${playerId}.json`)) || {};
      const najie = readJsonFile(path.join(najieDir, `${playerId}.json`)) || {};
      stats.scanned++;
      const held = collectHeldEternalItems({ player, equipment, najie });
      if (held.size === 0) continue;
      stats.holders++;
      const claimant = {
        id: String(playerId),
        name: String(player?.名号 || playerId),
      };
      for (const claimKey of held) {
        const scope = { worldSeed: 'eternal', fragmentId: 'unique', entityId: claimKey };
        stats.byName[claimKey] = (stats.byName[claimKey] || 0) + 1;
        if (dryRun) continue;
        try {
          const result = await claimXianguUniqueTreasure(
            redisClient,
            scope,
            claimant,
            Date.now(),
            { meta: { roundSeed: 'backfill', source: 'eternal-backfill' } },
          );
          if (result.claimed) {
            stats.registered++;
            log(`[补登] ${playerId}(${claimant.name}) -> ${claimKey}`);
          } else {
            stats.skipped++;
          }
        } catch (error) {
          stats.failed++;
          log(`[补登失败] ${playerId} ${claimKey}: ${error?.message || error}`);
        }
      }
    } catch (error) {
      stats.failed++;
      log(`[补登失败] 玩家 ${playerId}: ${error?.message || error}`);
    }
  }
  return stats;
}

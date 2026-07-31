/**
 * 永寂者列表
 * 
 * 圣墟设定：
 * 诡异大祭之中，被位面破坏所席卷的修士并未真正身灭——
 * 他们的道果、形神、一切存在痕迹，
 * 被一股神秘力量凝聚在"永寂之界"深处，
 * 如同被封印在时间的琥珀中，
 * 既非生，亦非死——永寂。
 * 
 * 唯有仙帝境的大能，以"映照"之权能，
 * 方能从永寂之界将这些生灵召唤回来，
 * 赐予他们重临诸天的机会！
 * 
 * 存储结构：
 * redis key: xiuxian:yongji:list  → Hash { qq → JSON字符串(永寂者记录) }
 * redis key: xiuxian:yongji:byplane:{planeId} → Set { qq }  (按位面索引)
 * redis key: xiuxian:yongji:count  → 总永寂人数（快速统计）
 */

import path from 'path';
import fs from 'fs';
import { data } from '../../api/api.js';
import { Write_player } from '../../model/xiuxian.js';

// Redis Key 前缀
const YONGJI_HASH_KEY = 'xiuxian:yongji:list';
const YONGJI_PLANE_PREFIX = 'xiuxian:yongji:byplane:';
const YONGJI_COUNT_KEY = 'xiuxian:yongji:count';

// 位面ID → 名称映射
const PLANE_NAMES = {
  0: '凡间', 1: '仙界', 1.5: '下界八域',
  2: '遮天位面', 2.5: '九天十地', 3: '界海',
  4: '时间长河', 5: '永恒未知之地', 6: '仙域',
};

// ==================== 写入永寂 ====================

/**
 * 将玩家送入永寂之界（备份存档+清除数据）
 * 
 * @param {string} qq - 玩家QQ号
 * @param {Object} playerData - 玩家完整数据对象
 * @param {number|string} planeId - 被破坏的位面ID
 * @param {string} planeName - 被破坏的位面名称
 * @returns {boolean} 是否成功
 */
export async function sendToYongJi(qq, playerData, planeId, planeName) {
  const playerName = playerData?.名号 || qq;

  try {
    // ===== 步骤1：构建永寂记录 =====
    const yongjiRecord = {
      qq,
      名号: playerName,
      planeId,
      planeName,
      yongjiTime: Date.now(),             // 永寂时间戳
      yongjiTimeStr: new Date().toLocaleString('zh-CN'),
      
      // 完整玩家存档备份
      playerBackup: JSON.parse(JSON.stringify(playerData)),
      
      // 纳戒备份（单独处理）
      najieBackup: null,
    };

    // 备份纳戒数据
    try {
      const playerPath = data.filePathMap?.player;
      if (playerPath) {
        const najiePath = path.join(path.dirname(playerPath), 'xiuxian_najie');
        const najieFile = path.join(najiePath, `${qq}.json`);
        if (fs.existsSync(najieFile)) {
          yongjiRecord.najieBackup = JSON.parse(fs.readFileSync(najieFile, 'utf8'));
        }
      }
    } catch (e) {
      // 纳戒备份失败不阻止流程
    }

    // ===== 步骤2：写入Redis永寂列表 =====
    await redis.hSet(YONGJI_HASH_KEY, qq, JSON.stringify(yongjiRecord));

    // 按位面建立索引
    const planeKey = `${YONGJI_PLANE_PREFIX}${planeId}`;
    await redis.sAdd(planeKey, qq);

    // 更新总数
    await redis.incr(YONGJI_COUNT_KEY);

    // ===== 步骤3：删除玩家正式数据 =====
    await erasePlayerData(qq, playerName);

    logger.info(`[永寂之界] ${playerName}(${qq}) 于"${planeName}"崩灭时入永寂，存档已备份`);
    return true;

  } catch (err) {
    logger.error(`[永寂之界] 处理玩家${qq}时出错:`, err.message);
    return false;
  }
}

// ==================== 复活（映照归来） ====================

/**
 * 通过QQ号复活单个永寂者
 * 
 * @param {string} qq - 永寂者QQ号
 * @returns {{ success: boolean, playerName: string, planeName: string, reason?: string }}
 */
export async function reviveFromYongJi(qq) {
  try {
    const recordStr = await redis.hGet(YONGJI_HASH_KEY, qq);
    if (!recordStr) {
      return { success: false, playerName: qq, planeName: '未知', reason: '未找到永寂记录' };
    }

    const record = JSON.parse(recordStr);
    const { playerBackup, najieBackup, 名号: playerName, planeId, planeName } = record;

    // 恢复玩家数据
    if (playerBackup) {
      // 复活后传送至凡间（原位面已不存在）
      playerBackup.power_place = 0;
      // 标记复活时间
      playerBackup._revived_at = Date.now();
      playerBackup._revived_from_plane = planeName;

      await Write_player(qq, playerBackup);
    }

    // 恢复纳戒
    if (najieBackup) {
      try {
        const playerPath = data.filePathMap?.player;
        if (playerPath) {
          const najiePath = path.join(path.dirname(playerPath), 'xiuxian_najie');
          if (!fs.existsSync(najiePath)) fs.mkdirSync(najiePath, { recursive: true });
          const najieFile = path.join(najiePath, `${qq}.json`);
          fs.writeFileSync(najieFile, JSON.stringify(najieBackup, null, 2), 'utf8');
        }
      } catch (e) {
        // 纳戒恢复失败不影响主体恢复
      }
    }

    // 从永寂列表移除
    await redis.hDel(YONGJI_HASH_KEY, qq);
    const planeKey = `${YONGJI_PLANE_PREFIX}${planeId}`;
    await redis.sRem(planeKey, qq);
    await redis.decr(YONGJI_COUNT_KEY);

    logger.info(`[映照归来] ${playerName}(${qq}) 已从"${planeName}"永寂中复活`);
    return { success: true, playerName, planeName };

  } catch (err) {
    logger.error(`[映照归来] 复活${qq}失败:`, err.message);
    return { success: false, playerName: qq, planeName: '未知', reason: err.message };
  }
}

/**
 * 复活指定位面所有永寂者
 * 
 * @param {string|number} planeId - 位面ID
 * @returns {{ count: number, names: string[], planeName: string }}
 */
export async function revivePlaneFromYongJi(planeId) {
  const planeKey = `${YONGJI_PLANE_PREFIX}${planeId}`;
  const planeName = PLANE_NAMES[planeId] || `位面(${planeId})`;

  let revived = 0;
  const names = [];

  try {
    const qqList = await redis.sMembers(planeKey);
    if (!qqList || qqList.length === 0) {
      return { count: 0, names: [], planeName };
    }

    for (const qq of qqList) {
      const result = await reviveFromYongJi(qq);
      if (result.success) {
        revived++;
        names.push(result.playerName);
      }
    }

    logger.info(`[映照归来] 位面"${planeName}"复活了${revived}名永寂者`);
  } catch (err) {
    logger.error(`[映照归来] 位面${planeName}批量复活失败:`, err.message);
  }

  return { count: revived, names, planeName };
}

/**
 * 复活所有位面的全部永寂者
 * 
 * @returns {{ total: number, byPlane: Array<{ planeName, count, names }> }}
 */
export async function reviveAllFromYongJi() {
  const allRecords = await redis.hGetAll(YONGJI_HASH_KEY);
  if (!allRecords || Object.keys(allRecords).length === 0) {
    return { total: 0, byPlane: [] };
  }

  // 按位面分组
  const planeGroups = new Map();
  for (const [qq, recordStr] of Object.entries(allRecords)) {
    try {
      const record = JSON.parse(recordStr);
      const pid = record.planeId;
      if (!planeGroups.has(pid)) {
        planeGroups.set(pid, { planeName: record.planeName || PLANE_NAMES[pid] || `位面(${pid})`, qqList: [] });
      }
      planeGroups.get(pid).qqList.push(qq);
    } catch (e) {}
  }

  let total = 0;
  const byPlane = [];

  for (const [planeId, group] of planeGroups) {
    const names = [];
    for (const qq of group.qqList) {
      const result = await reviveFromYongJi(qq);
      if (result.success) {
        total++;
        names.push(result.playerName);
      }
    }
    if (names.length > 0) {
      byPlane.push({ planeName: group.planeName, count: names.length, names });
    }
  }

  logger.info(`[映照诸天] 共复活了${total}名永寂者`);
  return { total, byPlane };
}

// ==================== 查询接口 ====================

/**
 * 按名号或QQ查询是否在永寂列表中
 * 
 * @param {string} nameOrQQ
 * @returns {{ found: boolean, record?: Object }}
 */
export async function findYongJiByNameOrQQ(nameOrQQ) {
  try {
    // 先尝试直接以QQ查
    const directRecord = await redis.hGet(YONGJI_HASH_KEY, nameOrQQ);
    if (directRecord) {
      return { found: true, record: JSON.parse(directRecord) };
    }

    // 按名号遍历查找
    const allRecords = await redis.hGetAll(YONGJI_HASH_KEY);
    if (!allRecords) return { found: false };

    for (const [qq, recordStr] of Object.entries(allRecords)) {
      const record = JSON.parse(recordStr);
      if (record.名号 === nameOrQQ) {
        return { found: true, record };
      }
    }
  } catch (e) {}

  return { found: false };
}

/**
 * 获取永寂列表统计信息
 * 
 * @returns {{ total: number, byPlane: Array<{ planeId, planeName, count }> }}
 */
export async function getYongJiStats() {
  try {
    const allRecords = await redis.hGetAll(YONGJI_HASH_KEY);
    if (!allRecords) return { total: 0, byPlane: [] };

    const planeCounts = new Map();
    const total = Object.keys(allRecords).length;

    for (const recordStr of Object.values(allRecords)) {
      const record = JSON.parse(recordStr);
      const pid = record.planeId;
      if (!planeCounts.has(pid)) {
        planeCounts.set(pid, { planeId: pid, planeName: record.planeName || PLANE_NAMES[pid] || `位面(${pid})`, count: 0 });
      }
      planeCounts.get(pid).count++;
    }

    return { total, byPlane: [...planeCounts.values()] };
  } catch (e) {
    return { total: 0, byPlane: [] };
  }
}

/**
 * 获取指定位面的永寂者名单（不超过N人）
 * 
 * @param {string|number} planeId
 * @param {number} limit
 * @returns {{ planeName: string, list: Array<{ qq, 名号, yongjiTimeStr }> }}
 */
export async function getYongJiByPlane(planeId, limit = 50) {
  const planeKey = `${YONGJI_PLANE_PREFIX}${planeId}`;
  const planeName = PLANE_NAMES[planeId] || `位面(${planeId})`;

  try {
    const qqList = await redis.sMembers(planeKey);
    if (!qqList || qqList.length === 0) return { planeName, list: [] };

    const list = [];
    for (const qq of qqList.slice(0, limit)) {
      try {
        const recordStr = await redis.hGet(YONGJI_HASH_KEY, qq);
        if (recordStr) {
          const record = JSON.parse(recordStr);
          list.push({ qq, 名号: record.名号, yongjiTimeStr: record.yongjiTimeStr });
        }
      } catch (e) {}
    }

    return { planeName, list };
  } catch (e) {
    return { planeName, list: [] };
  }
}

/**
 * 大祭结束时清空永寂列表（可选：管理员手动触发）
 * 若不清空，永寂者可在下次大祭中被映照
 */
export async function clearYongJiList() {
  try {
    const allRecords = await redis.hGetAll(YONGJI_HASH_KEY);
    if (allRecords) {
      // 清空所有位面索引
      for (const recordStr of Object.values(allRecords)) {
        try {
          const record = JSON.parse(recordStr);
          await redis.del(`${YONGJI_PLANE_PREFIX}${record.planeId}`);
        } catch (e) {}
      }
    }
    await redis.del(YONGJI_HASH_KEY);
    await redis.set(YONGJI_COUNT_KEY, '0');
    logger.info('[永寂之界] 永寂列表已清空');
  } catch (e) {}
}

// ==================== 内部工具 ====================

/**
 * 彻底抹去玩家正式数据（玩家已被永寂备份，执行实际删除）
 * 
 * @param {string} qq
 * @param {string} playerName
 */
async function erasePlayerData(qq, playerName) {
  // 1. 删除玩家主数据文件（data.delData 不存在，改用 fs 直接删）
  try {
    const playerFile = path.join(data.filePathMap.player, `${qq}.json`);
    if (fs.existsSync(playerFile)) {
      fs.unlinkSync(playerFile);
      logger.info(`[永寂之界] 已删除玩家存档: ${playerFile}`);
    }
  } catch (e) {
    logger.error(`[永寂之界] 删除${qq}主数据失败:`, e.message);
  }

  // 2. 删除纳戒文件（已备份，安全删除）
  try {
    const playerPath = data.filePathMap?.player;
    if (playerPath) {
      const najiePath = path.join(path.dirname(playerPath), 'xiuxian_najie');
      const najieFile = path.join(najiePath, `${qq}.json`);
      if (fs.existsSync(najieFile)) fs.unlinkSync(najieFile);
    }
  } catch (e) {}

  // 3. 清理Redis状态键
  const keysToClean = [
    `xiuxian:player:${qq}:action`,
    `xiuxian:player:${qq}BOSSCD`,
    `xiuxian:player:${qq}:oblivion`,
    `xiuxian:player:${qq}:worldbosscd`,
    `xiuxian:player:${qq}:shenyou`,
    `xiuxian:player:${qq}:game_action`,
  ];
  for (const key of keysToClean) {
    try { await redis.del(key); } catch (e) {}
  }

  logger.info(`[永寂之界] ${playerName}(${qq}) 现世数据已抹除，入永寂`);
}

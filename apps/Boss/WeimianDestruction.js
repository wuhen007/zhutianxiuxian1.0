/**
 * 诡异大祭·位面破坏系统
 * 
 * 圣墟原著设定：
 * 诡异大祭期间，厄土仙帝与始祖攻击大千宇宙，
 * 将位面连同其中的亿万生灵一起打爆——
 * 形神俱灭，坠入永寂之界！
 * 唯准仙帝及以上境界，方能在这灭世浩劫中存活。
 * 
 * 机制：
 * - 诡异大祭开启后，每N分钟随机破坏1个位面
 * - 该位面所有低于准仙帝的玩家 → 入永寂（存档备份到永寂者列表，正式数据清除）
 * - 准仙帝及以上玩家 → 存活，传送至凡间
 * - 被破坏的位面在大祭期间不可再次进入
 * - 永寂者可被仙帝映照权能召唤归来
 */

import fs from 'fs';
import path from 'path';
import { data, config } from '../../api/api.js';
import { Write_player } from '../../model/xiuxian.js';
import { sendToYongJi } from './YongJiList.js';
import schedule from 'node-schedule';

// ==================== 位面.json 工具函数 ====================

/**
 * 读取 位面.json
 * @returns {Object} 位面数据对象
 */
function readWeiMianJson() {
  try {
    const filePath = data.filePathMap.weimianList;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    logger.error('[诡异大祭] 读取位面.json失败:', e.message);
    return null;
  }
}

/**
 * 写入 位面.json
 * @param {Object} obj - 完整的位面数据对象
 */
function writeWeiMianJson(obj) {
  try {
    const filePath = data.filePathMap.weimianList;
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 4), 'utf-8');
  } catch (e) {
    logger.error('[诡异大祭] 写入位面.json失败:', e.message);
  }
}

/**
 * 将位面.json中指定位面标记为崩灭（值设为0）
 * @param {string} planeName - 位面名称（与json中的key一致）
 */
function markPlaneDestroyed(planeName) {
  const obj = readWeiMianJson();
  if (!obj) return;
  if (planeName in obj) {
    obj[planeName] = 0;
    writeWeiMianJson(obj);
    logger.info(`[诡异大祭] 位面.json: 「${planeName}」已标记为崩灭(0)`);
  }
}

/**
 * 将位面.json中指定位面修复（值设为1）
 * @param {string} planeName - 位面名称
 */
function markPlaneRepaired(planeName) {
  const obj = readWeiMianJson();
  if (!obj) return;
  if (planeName in obj) {
    obj[planeName] = 1;
    writeWeiMianJson(obj);
    logger.info(`[诡异大祭] 位面.json: 「${planeName}」已修复(1)`);
  }
}

/**
 * 将所有可破坏位面修复（值重置为1）
 */
function markAllPlanesRepaired() {
  const obj = readWeiMianJson();
  if (!obj) return;
  for (const p of DESTROYABLE_PLANES) {
    if (p.name in obj) {
      obj[p.name] = 1;
    }
  }
  writeWeiMianJson(obj);
  logger.info('[诡异大祭] 位面.json: 所有位面已重置为可用(1)');
}

// ==================== 配置常量 ====================

/** 位面破坏间隔（毫秒），默认3分钟 */
const DESTRUCTION_INTERVAL = 3 * 60 * 1000;

/** 存活最低境界：准仙帝 = mijinglevel_id >= 20 */
const ZHUNXIAN_THRESHOLD = 20;

/** 可被破坏的位面（按圣墟原著，越底层越先遭殃；仙域虽是终局，诡异大祭期间厄土仙帝亦能染指） */
const DESTROYABLE_PLANES = [
  { id: 0,   name: '凡间',       desc: '亿万生灵的起点，在厄土仙帝掌中不过一缕青烟' },
  { id: 1,   name: '仙界',       desc: '仙道昌盛万古，此刻却成了最丰厚的祭品' },
  { id: 1.5, name: '下界八域',   desc: '八域崩裂，古教传承化为劫灰，万灵哀嚎' },
  { id: 2,   name: '遮天位面',   desc: '大帝道统，禁区林立，终究化为齑粉' },
  { id: 2.5, name: '九天十地',   desc: '仙王故土，乱古战场，在祭道之力下土崩瓦解' },
  { id: 3,   name: '界海',       desc: '准仙帝喋血之地，黑暗源头，终难逃破灭' },
  { id: 6,   name: '仙域',       desc: '诸天至高之地，厄土仙帝的真正目标——万古仙域，就此陨落' },
];

/** 不可破坏的终局位面（仅时间长河与永恒未知，因果缠绕/超脱轮回） */
const IMMUNE_PLANES = {
  4: '时间长河',   // 超脱时间本质，因果缠绕，厄土仙帝亦难彻底抹去
  5: '永恒未知',   // 一切终结之地，连诡异始祖都无法触碰
};

/** 位面ID→名称映射 */
const PLANE_NAMES = {
  0: '凡间', 1: '仙界', 1.5: '下界八域',
  2: '遮天位面', 2.5: '九天十地', 3: '界海',
  4: '时间长河', 5: '永恒未知之地', 6: '仙域',
};

// ==================== 运行时状态 ====================

let destructionTimer = null;
let destroyedPlanes = new Set();

// ==================== 公开接口 ====================

/**
 * 开始位面破坏定时器
 * 在诡异大祭开启时由BOSS3.js调用
 */
export async function startWeimianDestruction() {
  // 从redis恢复已破坏的位面（防止重启丢失）
  try {
    const saved = await redis.get('xiuxian:weimian_destruction:destroyed');
    if (saved) {
      destroyedPlanes = new Set(JSON.parse(saved));
    } else {
      destroyedPlanes = new Set();
    }
  } catch (e) {
    destroyedPlanes = new Set();
  }

  if (destructionTimer) {
    destructionTimer.cancel();
    destructionTimer = null;
  }

  logger.info(`[诡异大祭] 位面破坏系统启动 | 间隔:${DESTRUCTION_INTERVAL / 1000}s | 准仙帝门槛:mijinglevel>=${ZHUNXIAN_THRESHOLD}`);

  // 首次破坏：10秒缓冲，给玩家反应时间
  setTimeout(async () => {
    await destroyRandomPlane();
  }, 10000);

  // 使用 node-schedule 定时任务，替代 setInterval
  // cron表达式：每N分钟执行一次（N = DESTRUCTION_INTERVAL / 60000）
  const intervalMin = Math.round(DESTRUCTION_INTERVAL / 60000);
  const cronExpr = `*/${intervalMin} * * * *`;
  destructionTimer = schedule.scheduleJob(cronExpr, async () => {
    await destroyRandomPlane();
  });
  logger.info(`[诡异大祭] 定时任务已注册 | cron: ${cronExpr}`);

  await redis.set('xiuxian:weimian_destruction:timer_active', 'true');
}

/**
 * 停止位面破坏定时器
 * 诡异大祭结束时由BOSS3.js调用
 */
export async function stopWeimianDestruction() {
  if (destructionTimer) {
    destructionTimer.cancel();
    destructionTimer = null;
  }
  destroyedPlanes = new Set();
  try {
    await redis.del('xiuxian:weimian_destruction:destroyed');
    await redis.del('xiuxian:weimian_destruction:timer_active');
  } catch (e) {}
  logger.info('[诡异大祭] 位面破坏系统停止');
}

/**
 * 获取当前位面破坏状态
 * 供 #位面毁灭状态 命令使用
 */
export async function getDestructionStatus() {
  let timerActive = false;
  let destroyedList = [];
  try {
    timerActive = (await redis.get('xiuxian:weimian_destruction:timer_active')) === 'true';
    const saved = await redis.get('xiuxian:weimian_destruction:destroyed');
    destroyedList = saved ? JSON.parse(saved) : [];
  } catch (e) {}

  const remaining = DESTROYABLE_PLANES.filter(p => !destroyedList.includes(p.id));
  const immuneNames = DESTROYABLE_PLANES.map(p => p.id).concat(Object.keys(IMMUNE_PLANES).map(Number))
    .filter(id => IMMUNE_PLANES[id])
    .map(id => IMMUNE_PLANES[id]);

  return {
    active: timerActive,
    destroyed: destroyedList.map(id => PLANE_NAMES[id] || `未知(${id})`),
    remaining: remaining.map(p => p.name),
    immune: immuneNames,
    totalDestroyable: DESTROYABLE_PLANES.length,
    destroyedCount: destroyedList.length,
    interval: Math.round(DESTRUCTION_INTERVAL / 1000),
    threshold: ZHUNXIAN_THRESHOLD,
  };
}

/**
 * 检查指定位面是否已被破坏
 */
export function isPlaneDestroyed(planeId) {
  return destroyedPlanes.has(planeId);
}

/**
 * 修复所有被破坏的位面（映照诸天后调用）
 * 清除内存状态、Redis记录、位面.json三处同步
 */
export async function repairAllDestroyedPlanes() {
  destroyedPlanes.clear();
  try {
    await redis.del('xiuxian:weimian_destruction:destroyed');
  } catch (e) {}
  markAllPlanesRepaired(); // 位面.json全部置回1
  logger.info('[诡异大祭] 映照诸天——所有被毁位面已修复');
}

/**
 * 修复单个被破坏的位面（映照指定位面后调用）
 * @param {number} planeId - 位面ID
 * @returns {boolean} 是否成功修复（false表示该位面未被破坏）
 */
export async function repairSinglePlane(planeId) {
  if (!destroyedPlanes.has(planeId)) {
    return false;
  }
  destroyedPlanes.delete(planeId);
  try {
    await redis.set('xiuxian:weimian_destruction:destroyed',
      JSON.stringify([...destroyedPlanes]));
  } catch (e) {}
  // 位面.json对应位面置回1
  const planeName = PLANE_NAMES[planeId];
  if (planeName) markPlaneRepaired(planeName);
  logger.info(`[诡异大祭] 仙帝映照——位面「${planeName || planeId}」已修复`);
  return true;
}

// ==================== 核心破坏逻辑 ====================

/**
 * 随机选择一个可破坏位面并执行破坏
 */
async function destroyRandomPlane() {
  try {
    // 检查大祭是否仍在进行
    const bossAlive = await redis.get('guiyishizu');
    if (!bossAlive) {
      await stopWeimianDestruction();
      return;
    }
    // 检查是否已被彻底终结
    try {
      const bossData = JSON.parse(bossAlive);
      if (bossData.isEternallyDefeated) {
        await stopWeimianDestruction();
        return;
      }
    } catch (e) {}

    // 获取剩余可破坏的位面
    const remaining = DESTROYABLE_PLANES.filter(p => !destroyedPlanes.has(p.id));

    if (remaining.length === 0) {
      logger.info('[诡异大祭] 所有可破坏位面已毁灭');
      await sendFinalWarning();
      await stopWeimianDestruction();
      return;
    }

    // ========== 厄土仙帝破坏力极大，一次毁灭2个位面 ==========
    // 从剩余位面中随机取2个（不足2个时取全部）
    const shuffled = remaining.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, Math.min(2, shuffled.length));

    logger.info(`[诡异大祭] 厄土仙帝出手，本轮破坏 ${targets.length} 个位面: ${targets.map(t => t.name).join('、')}`);

    for (const target of targets) {
      logger.info(`[诡异大祭] 破坏位面: ${target.name} (ID:${target.id})`);

      // 执行破坏
      const result = await destroyPlane(target);

      // 标记已破坏（内存+Redis+位面.json三处同步）
      destroyedPlanes.add(target.id);
      markPlaneDestroyed(target.name); // 位面.json对应位面置0，穿梭/副本系统据此拦截

      // 全服广播（每个位面单独广播）
      await broadcastDestruction(target, result);

      // 两次广播之间间隔1.5秒，避免NT QQ同时发送超时
      if (targets.length > 1 && target !== targets[targets.length - 1]) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    // Redis统一更新一次
    await redis.set('xiuxian:weimian_destruction:destroyed',
      JSON.stringify([...destroyedPlanes]));

    // 剩余位面不足1个时发出最终警告
    const nowRemaining = DESTROYABLE_PLANES.filter(p => !destroyedPlanes.has(p.id));
    if (nowRemaining.length <= 0) {
      await sendFinalWarning();
    }

  } catch (err) {
    logger.error('[诡异大祭] 位面破坏失败:', err);
  }
}

/**
 * 破坏指定位面
 * 扫描该位面所有玩家，准仙帝以下入永寂，以上存活
 * 
 * @param {Object} planeInfo - { id, name, desc }
 * @returns {{ yongji: number, survived: number, survivorNames: string[], yongjiNames: string[] }}
 */
async function destroyPlane(planeInfo) {
  let yongji = 0;
  let survived = 0;
  const survivorNames = [];
  const yongjiNames = [];

  try {
    const playerDir = data.filePathMap.player;
    if (!fs.existsSync(playerDir)) {
      logger.warn(`[诡异大祭] 玩家数据目录不存在: ${playerDir}`);
      return { yongji: 0, survived: 0, survivorNames: [], yongjiNames: [] };
    }

    const files = fs.readdirSync(playerDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const qq = file.replace('.json', '');

      try {
        const playerData = await data.getData('player', qq);
        if (!playerData) continue;

        // 检查是否在目标位面
        if (playerData.power_place !== planeInfo.id) continue;

        // 检查寂灭状态——如果玩家正在寂灭中，视为已在厄土高原（不在本位面）
        let inOblivion = false;
        try {
          const oblivionData = await redis.get(`xiuxian:player:${qq}:oblivion`);
          if (oblivionData) {
            const oblivion = JSON.parse(oblivionData);
            if (Date.now() < oblivion.endTime) {
              inOblivion = true;
            }
          }
        } catch (e) {}
        if (inOblivion) continue; // 寂灭中的玩家不受位面破坏影响

        const playerName = playerData.名号 || qq;

        if (playerData.mijinglevel_id >= ZHUNXIAN_THRESHOLD) {
          // ✅ 准仙帝及以上：存活，传送至凡间
          playerData.power_place = 0;
          await Write_player(qq, playerData);
          survived++;
          survivorNames.push(playerName);

          logger.info(`[诡异大祭] ✓ ${playerName}(${qq}) 准仙帝修为，于位面崩灭中存活`);
        } else {
          // 🔴 境界不足：形神俱灭，入永寂之界（存档备份，现世数据清除）
          const ok = await sendToYongJi(qq, playerData, planeInfo.id, planeInfo.name);
          if (ok) {
            yongji++;
            yongjiNames.push(playerName);
            logger.info(`[诡异大祭] ✗ ${playerName}(${qq}) 坠入永寂之界`);
          }
        }
      } catch (playerErr) {
        logger.error(`[诡异大祭] 处理玩家${qq}失败:`, playerErr.message);
      }
    }
  } catch (err) {
    logger.error('[诡异大祭] 扫描玩家文件失败:', err.message);
  }

  return { yongji, survived, survivorNames, yongjiNames };
}

// ==================== 广播系统 ====================

/**
 * 全服广播位面破坏消息
 */
async function broadcastDestruction(planeInfo, result) {
  const groupList = await getGroupList();

  // 随机厄土仙帝台词（圣墟风格）
  const ancestorQuotes = [
    '「这个位面，碍眼太久了。」',
    '「蝼蚁栖身之所，也配称世界？」',
    '「祭掉此界，为大祭添一份薪柴。」',
    '「亿万生灵？不过是祭坛上的一缕青烟罢了。」',
    '「尔等的存在本身，便是对大祭的亵渎。」',
    '「厄土高原之下，万物皆为蝼蚁——连蝼蚁都不如。」',
    '「这一掌，祭掉一界因果——又何妨？」',
    '「诸天万界，终将归于永恒的黑暗，我只是……顺势而为。」',
    '「俯瞰诸天，汝等不过困笼之虫，挣扎无益。」',
    '「大祭的祭品，从来就不是一界一域——而是这整个现世！」',
    '「尔等呼唤的仙帝，又在何处？」',
    '「仙域又怎样？本帝一手打爆，不过须臾之事。」',
  ];

  const quote = ancestorQuotes[Math.floor(Math.random() * ancestorQuotes.length)];

  const totalCount = result.yongji + result.survived;
  const intervalSec = Math.round(DESTRUCTION_INTERVAL / 1000);

  // 分3段发送，每段简短清晰，避免特殊Unicode字符导致NT内核超时
  const part1 = [
    `诡异大祭 - 位面崩灭`,
    `厄土高原之上，黑雾骤然沸腾！`,
    `厄土仙帝的身影在虚空中骤然凝聚——`,
    `那双眼眸冷冷注视着`,
    `【${planeInfo.name}】`,
    ``,
    `他缓缓抬起那只蕴含诡异物质的巨掌——`,
    `${quote}`,
  ].join('\n');

  const part2 = [
    `轰！！！！`,
    `位面「${planeInfo.name}」——崩灭了！`,
    `${planeInfo.desc}`,
    ``,
    totalCount > 0 ? `位面内${totalCount}位修士中：` : `该位面空无一人……但它的毁灭本身，就是对诸天的警告。`,
  ];
  if (result.yongji > 0) part2.push(`> 坠入永寂：${result.yongji}人（形神俱灭，沉眠于永寂之界）`);
  if (result.survived > 0) part2.push(`> 侥幸存活：${result.survived}人（准仙帝及以上，传送至凡间）`);
  if (result.survivorNames.length > 0) {
    part2.push(`存活者：${result.survivorNames.join('、')}`);
  } else if (result.yongji > 0) {
    part2.push(`无人生还……`);
  }
  if (result.yongji > 0) part2.push(`永寂者如欲归来，需得仙帝「映照」权能救赎。`);
  const msg2 = part2.join('\n');

  const part3 = [
    `「尔等听着——」`,
    `「这，仅仅只是开始。」`,
    `「大祭的祭品，从来就不是一界一域。」`,
    `「而是这——整个诸天万界！」`,
    ``,
    `【下一位面将在${intervalSec}秒后被破坏】`,
  ].join('\n');

  // 分段发送，每段间隔800ms
  await sendToAllGroups(groupList, part1);
  await new Promise(r => setTimeout(r, 800));
  await sendToAllGroups(groupList, msg2);
  await new Promise(r => setTimeout(r, 800));
  await sendToAllGroups(groupList, part3);
}

/**
 * 最终警告（所有可破坏位面即将/已被全灭）
 */
async function sendFinalWarning() {
  const groupList = await getGroupList();

  const remaining = DESTROYABLE_PLANES.filter(p => !destroyedPlanes.has(p.id));

  let msg;
  if (remaining.length === 0) {
    msg = [
      `诡异大祭 - 诸天终末`,
      ``,
      `所有可破坏的位面，皆已化为虚无……`,
      ``,
      `厄土高原之上，十大始祖齐齐睁开双眼，`,
      `他们的目光交汇，贯穿古今未来——`,
      ``,
      `「诸天万界，祭品已备。」`,
      `「接下来——」`,
      `「便是我族大祭的真正高潮！」`,
      ``,
      `「祭掉现世！葬下永恒！」`,
      ``,
      `黑雾笼罩诸天，黑暗物质侵蚀时间长河……`,
      `唯时间长河、永恒未知、仙域三界，`,
      `因其特殊地位暂未被波及——`,
      `但也只是——暂时。`,
      ``,
      `【最后警告】`,
      `所有幸存的修士，若想活下去，`,
      `只有一条路——`,
      `踏入厄土高原，屠灭诡异始祖！`,
      `「#迎战厄土高原」`,
    ].join('\n');
  } else {
    msg = [
      `诡异大祭 - 灭世警告`,
      ``,
      `位面接连崩灭，剩下可破坏的位面仅剩：`,
      ...remaining.map(p => `  > ${p.name}`),
      ``,
      `厄土高原之上，始祖冷笑着——`,
      `「躲？你们能躲到哪里去？」`,
      `「这些位面，一个都逃不掉。」`,
      ``,
      `【最后警告】`,
      `不想身灭道消，就拿起你们的兵器——`,
      `「#迎战厄土高原」`,
    ].join('\n');
  }

  await sendToAllGroups(groupList, msg);
}

/**
 * 被破坏位面中全员永寂的额外广播
 */
async function broadcastAllYongJi(planeInfo, yongjiCount) {
  if (yongjiCount === 0) return;

  const groupList = await getGroupList();

  const msg = [
    `诡异大祭 - 举界永寂`,
    ``,
    `位面「${planeInfo.name}」中，${yongjiCount}位修士——`,
    `全数坠入永寂之界。`,
    ``,
    `他们的名号、道果、一切存在痕迹——`,
    `被诡异物质从现世中彻底剥离，`,
    `悬浮于永寂之界那永恒的沉默里。`,
    ``,
    `「世间暂无此人。」`,
    `「除非——」`,
    `「有仙帝以映照之权，将其从永寂中唤醒。」`,
    ``,
    `【映照命令】`,
    `仙帝可使用：`,
    `  > #映照[名号] — 复活单名永寂者`,
    `  > #映照${planeInfo.name} — 复活该位面所有永寂者`,
    `  > #映照诸天 — 复活所有位面所有永寂者（代价极大）`,
  ].join('\n');

  await sendToAllGroups(groupList, msg);
}

// ==================== 工具函数 ====================

/**
 * 获取全局推送群列表
 * 统一读取 config xiuxian.Era.notifyGroups，与项目其他模块保持一致
 * 管理员通过 #全局推送消息群号 / #删除全局推送群号 / #查看全局推送 管理
 */
async function getGroupList() {
  let groupList = [];

  // 方法1：优先读 AdminSuper 全局推送配置
  try {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const notifyGroups = xiuxianConfig?.Era?.notifyGroups || [];
    if (notifyGroups.length > 0) {
      groupList = notifyGroups.map(g => String(g));
      logger.info(`[诡异大祭] 从配置读取全局推送群列表: ${groupList.join(', ')}`);
      return groupList;
    }
  } catch (e) {
    logger.error('[诡异大祭] 从配置读取群列表失败，将尝试Redis:', e.message);
  }

  // 方法2：fallback 到 Redis 拍卖群列表（与 EraChangeTask.js 一致）
  try {
    const redisGlKey = 'xiuxian:AuctionofficialTask_GroupList';
    const redisGroups = await redis.sMembers(redisGlKey);
    if (redisGroups && redisGroups.length > 0) {
      groupList = redisGroups.map(g => String(g));
      logger.info(`[诡异大祭] 从Redis读取群列表(fallback): ${groupList.join(', ')}`);
      return groupList;
    }
  } catch (e) {
    logger.error('[诡异大祭] 从Redis读取群列表失败:', e.message);
  }

  logger.warn('[诡异大祭] 群列表为空，无法推送消息！请检查AdminSuper配置或Redis拍卖群列表');
  return [];
}

async function sendToAllGroups(groupList, msg) {
  const groups = groupList || [];
  for (const groupId of groups) {
    Bot.pickGroup(groupId).sendMsg(msg).catch(console.error);
  }
}

// ==================== 命令处理 ====================

/**
 * 处理 #位面毁灭状态 命令
 * @param {Object} e - 消息事件
 */
export async function handleDestructionStatusCommand(e) {
  const status = await getDestructionStatus();

  if (!status.active) {
    await e.reply([
      `【位面毁灭系统】`,
      `诡异大祭未开启，位面毁灭系统处于休眠状态。`,
      ``,
      `「大祭未至，诸天尚安。」`,
      `「但——他们终会来的。」`,
    ].join('\n'));
    return;
  }

  const progressBar = (() => {
    const pct = status.destroyedCount / status.totalDestroyable;
    const filled = Math.round(pct * 15);
    const empty = 15 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty) + ` ${status.destroyedCount}/${status.totalDestroyable}`;
  })();

  await e.reply([
    `\n══════ 诡异大祭 · 位面毁灭状态 ══════`,
    ``,
    `毁灭进度：${progressBar}`,
    `毁灭间隔：每${status.interval}秒破坏1个位面`,
    `存活门槛：秘境等级≥${status.threshold}（准仙帝及以上）`,
    ``,
    `已崩灭位面（${status.destroyedCount}/${status.totalDestroyable}）：`,
    ...(status.destroyed.length > 0
      ? status.destroyed.map(n => `  ◆ ${n} 【已崩灭·不可进入】`)
      : ['  ◆ （暂无）']),
    ``,
    `幸存位面（${status.remaining.length}）：`,
    ...status.remaining.map(n => `  ◇ ${n}`),
    ``,
    `终局位面（不可破坏）：`,
    ...status.immune.map(n => `  ◎ ${n}`),
    ``,
    `「大祭不休，毁灭不止——」`,
    status.destroyedCount >= status.totalDestroyable - 1 ? (
      `「所有可破坏位面即将全灭！你还等什么？！」`
    ) : (
      `「下一个被毁灭的，会是你所在的位面吗？」`
    ),
  ].join('\n'));
}

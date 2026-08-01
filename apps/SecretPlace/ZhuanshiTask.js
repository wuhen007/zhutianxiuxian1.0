import { plugin, common, config, data } from '../../api/api.js';
import fs from 'fs';
import {
  __PATH,
  buildAt
} from '../../model/xiuxian.js';
import {
  existplayer,
  Read_player,
  Write_player,
  Write_najie,
  Write_equipment,
  Read_equipment,
  isNotNull,
  get_random_talent,
  get_random_fromARR,
  Read_najie
} from '../../model/xiuxian.js';
import {
  mergeNajieContents,
  prepareIndependentDropItem,
} from '../../model/najieMerge.js';
import {
  checkNajieDropReach,
  createNajieDropLocation,
  findNearbyNajieDrops,
  getNajieDropPlanes,
  normalizeNajieDropLocation,
} from '../../model/najieDropLocation.js';
import {
  getPlayerPlaneCoordinate,
  getPlayerPlaneName,
} from '../../model/planeCoords.js';
import { createFromDrop as createXianyiBaodi } from './XianyiBaodi.js';
import {
  FileRollbackTransaction,
  writeJsonAtomically,
} from './rebirthTransaction.js';
import {
  applyReincarnationDecision,
  getPlayerRealmNames,
  getReincarnationAuthority,
  requiresControllerDecision,
} from './reincarnationAuthority.js';
import { readShouyuanDifficulty } from '../User/shouyuanDifficulty.js';

let ZxTask = null;

const PICKUP_LOCK_TTL_SECONDS = 30;
const REBIRTH_TASK_LOCK_TTL_SECONDS = 120;
const FAILED_TASK_TTL_SECONDS = 24 * 60 * 60;
const REINCARNATION_CONTROLLER_KEY = 'xiuxian:zhuanshi:controller';
const CONTROLLER_ACTION_REFRESH_MS = 2 * 60 * 1000;
const RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

async function acquireRedisLock(lockKey, token, ttlSeconds = PICKUP_LOCK_TTL_SECONDS) {
  return Boolean(await redis.set(lockKey, token, {
    NX: true,
    EX: ttlSeconds,
  }));
}

async function releaseRedisLock(lockKey, token) {
  try {
    await redis.eval(RELEASE_LOCK_SCRIPT, {
      keys: [lockKey],
      arguments: [token],
    });
  } catch (err) {
    console.error(`释放纳戒领取锁失败 (${lockKey}):`, err);
  }
}

// ==================== 境界体系 ====================
const MijingLevels = [
  { id: 1, name: "凡人", desc: "红尘中挣扎，百年后一抔黄土" },
  { id: 2, name: "轮海秘境·苦海", desc: "生命之轮与苦海同生，修士第一步" },
  { id: 3, name: "轮海秘境·命泉", desc: "命泉喷涌，神力源泉初现" },
  { id: 4, name: "轮海秘境·神桥", desc: "横渡苦海，神桥通天" },
  { id: 5, name: "轮海秘境·彼岸", desc: "到达彼岸，脱胎换骨" },
  { id: 6, name: "道宫秘境·五大神藏", desc: "心肝脾肺肾，五神孕道" },
  { id: 7, name: "四极秘境·四重天", desc: "四肢通天，力撼山河" },
  { id: 8, name: "化龙秘境·九重天", desc: "脊柱如龙，九变登天" },
  { id: 9, name: "仙台秘境·半步大能", desc: "仙台初筑，半步之遥" },
  { id: 10, name: "仙台秘境·大能", desc: "一方霸主，威震一域" },
  { id: 11, name: "仙台秘境·斩道王者", desc: "斩断前路，我道唯一" },
  { id: 12, name: "仙台秘境·圣人", desc: "圣贤之境，法则加身" },
  { id: 13, name: "仙台秘境·圣人王", desc: "圣中之王，俯视苍生" },
  { id: 14, name: "仙台秘境·大圣", desc: "准帝之下，举世无双" },
  { id: 15, name: "准帝九重天", desc: "九重天梯，一步一劫" },
  { id: 16, name: "大帝", desc: "人道绝巅，一世无敌" },
  { id: 17, name: "红尘仙", desc: "于红尘中九世成仙" },
  { id: 18, name: "仙王", desc: "仙中之王，万古不灭" },
  { id: 19, name: "仙王巨头", desc: "巨头之威，震慑诸天" },
  { id: 20, name: "道祖·准仙帝", desc: "道之极致，半步超脱" },
  { id: 21, name: "路尽级仙帝", desc: "进化路的尽头，至高无上" },
  { id: 22, name: "祭道", desc: "祭掉自身大道，超越极限" },
  { id: 23, name: "祭道之上", desc: "超越祭道，不可言说" },
  { id: 24, name: "唯一道之上", desc: "道之外，永恒自在" }
];

// ==================== 天资体系 ====================
const aptitudeGrades = {
  '无演无尽': 0.00001,   // 0.001% - 超脱天道
  '万古无双': 0.0001,    // 0.01% - 百万年难遇
  '绝世天骄': 0.001,     // 0.1% - 十万年难遇
  '旷世奇才': 0.005,     // 0.5% - 万年难遇
  '天纵之资': 0.01,      // 1% - 百年难遇
  '超凡资质': 0.05,      // 5% - 宗门核心
  '平庸之资': 0.78379,   // 78.379% - 芸芸众生
  '先天不足': 0.1,       // 10% - 道途艰难
  '天弃之人': 0.05,       // 5% - 天道不容
  '生而痴傻': 0.005,       // 0.5% - 灵智蒙尘
  '无化如是': 0.001       // 0.1% - 大道难成
};

// 天资评价（辰东风格）
const aptitudeDescriptions = {
  '无演无尽': '亘古未有，超脱天道之外，一念可演诸天万界，此等天资已非生灵所能拥有',
  '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，注定永恒无敌于世间',
  '绝世天骄': '惊才绝艳，具备大帝之姿，注定为一个时代的天地主角，万族共尊',
  '旷世奇才': '万年难遇，此等资质放眼九天十地也是凤毛麟角，有望触及准帝之境',
  '天纵之资': '天赋异禀，媲美上古大教圣子，若是不陨，必成一方巨擘',
  '超凡资质': '资质超凡，注定异于常人，可拜入圣地，得真传',
  '平庸之资': '资质平平，如那芸芸众生，若无大机缘，终生难窥仙道',
  '先天不足': '先天有缺，如那漏底的木桶，修炼事倍功半，需以百倍努力弥补',
  '天弃之人': '被天道所弃，修炼必遭反噬，每一步都如行走在刀尖之上，九死一生',
  '生而痴傻': '天生愚笨，灵智蒙尘，修炼难如登天，纵有仙经在前，亦难明其义',
  '无化如是': '无用之人，命中注定难有所为，如那风中残烛，随时可灭'
};

// 天资等级顺序（从高到低）
const aptitudeOrder = [
  '无演无尽', '万古无双', '绝世天骄', '旷世奇才', '天纵之资',
  '超凡资质', '平庸之资', '先天不足', '天弃之人', '生而痴傻', '无化如是'
];

// ==================== 轮回异象 ====================
const rebirthPhenomena = [
  "九天之上，雷海沸腾，仿佛天道在怒吼",
  "黄泉路上，彼岸花开，如血般妖艳",
  "六道轮回盘虚影浮现，镇压万古青天",
  "时间长河显化，过去未来交织",
  "混沌青莲摇曳，洒落大道之光",
  "飞仙之光划破黑暗，如那开天辟地第一缕光",
  "万鬼哭嚎，似在恭送一位无上存在",
  "仙乐阵阵，有真仙虚影在混沌中诵经",
  "阴阳二气化作太极图，缓缓转动",
  "星辰坠落，如那烟花般绚烂"
];

// 获取随机天资
function get_random_aptitude() {
  const rand = Math.random();
  let cumulative = 0;
  
  for (const [grade, prob] of Object.entries(aptitudeGrades)) {
    cumulative += prob;
    if (rand < cumulative) {
      return {
        grade: grade,
        evaluation: aptitudeDescriptions[grade],
        probability: prob
      };
    }
  }
  return { grade: '平庸之资', evaluation: aptitudeDescriptions['平庸之资'], probability: 0.78379 };
}

// 降低天资
function downgradeAptitude(currentAptitude) {
  const currentIndex = aptitudeOrder.indexOf(currentAptitude);
  if (currentIndex === -1 || currentIndex >= aptitudeOrder.length - 1) {
    return '无化如是'; // 已是最低，无法再降
  }
  return aptitudeOrder[currentIndex + 1];
}

// 判断能否硬扛阴阳大磨盘
function canWithstandYinYangGrind(player) {
  return (player.mijinglevel_id >= 11) || (player.xiangulevel_id >= 9);
}

// 发送消息
async function sendRebirthMessage(e, message) {
  try {
    if (e?.reply) {
      await e.reply(message);
    } else if (e?.group_id) {
      await e.reply(message);
    } else if (e?.user_id) {
      await common.relpyPrivate(e.user_id, message);
    }
  } catch (err) {
    console.error('【轮回】发送消息失败:', err);
  }
}

function buildPlayerMentionMessage(playerIds, message) {
  const ids = Array.isArray(playerIds) ? playerIds : [playerIds];
  const segs = [];
  for (const raw of ids) {
    if (raw == null) continue;
    const at = buildAt(raw); // 复用项目标准艾特封装（处理 qg_ 前缀 / 官方机器人 / OneBot）
    if (!at) continue;
    segs.push(at);
  }
  if (segs.length === 0) return message;
  return [...segs, `\n${message}`];
}

export async function notifyReincarnationPlayer(playerId, message, extraMentions = []) {
  try {
    const groupList = await getNotifyGroupList();
    const bot = globalThis.Bot;
    const mentionIds = [...new Set(
      [playerId, ...(Array.isArray(extraMentions) ? extraMentions : [extraMentions])]
        .map(id => String(id == null ? '' : id).replace('qg_', ''))
        .filter(id => id !== '')
    )];
    if (groupList.length > 0 && bot) {
      const payload = buildPlayerMentionMessage(mentionIds, message);
      const results = await Promise.allSettled(
        groupList.map(async groupId => bot.pickGroup(groupId).sendMsg(payload))
      );
      if (results.some(result => result.status === 'fulfilled')) return;
    }
    await common.relpyPrivate(String(playerId), message);
  } catch (err) {
    console.error(`【轮回】通知玩家 ${playerId} 失败:`, err);
  }
}

function getMentionedPlayerId(e) {
  const atItem = Array.isArray(e?.message)
    ? e.message.find(item => item?.type === 'at' && item?.qq !== 'all')
    : null;
  if (atItem?.qq) return String(atItem.qq).replace('qg_', '');

  const match = String(e?.msg || '').match(/@(\d+)/);
  return match?.[1] || null;
}

function getAuthority(player) {
  return getReincarnationAuthority(
    player,
    data.Levelmijing_list,
    data.xiangujinshi_list
  );
}

export async function getActiveReincarnationController() {
  const raw = await redis.get(REINCARNATION_CONTROLLER_KEY);
  if (!raw) return null;

  try {
    const record = JSON.parse(raw);
    if (!record?.player_id || !(await existplayer(record.player_id))) {
      await redis.del(REINCARNATION_CONTROLLER_KEY);
      return null;
    }

    const player = await Read_player(record.player_id);
    const authority = getAuthority(player);
    if (!authority.canControl) {
      await redis.del(REINCARNATION_CONTROLLER_KEY);
      return null;
    }

    return {
      ...record,
      player_name: player.名号,
      player,
      authority,
    };
  } catch (err) {
    console.error('【轮回执掌】校验当前执掌者失败:', err);
    await redis.del(REINCARNATION_CONTROLLER_KEY);
    return null;
  }
}

async function restoreRescuedPlayer(task) {
  const playerId = String(task.player_id);
  let player = null;

  try {
    player = await Read_player(playerId);
  } catch (err) {
    if (!task.player_data) throw err;
    player = JSON.parse(JSON.stringify(task.player_data));
  }

  let changed = false;
  if ((Number(player.当前血量) || 0) <= 0) {
    player.当前血量 = 1;
    changed = true;
  }
  if (task.type === '寿元耗尽' && (Number(player.寿元) || 0) <= 0) {
    player.寿元 = 1000;
    changed = true;
  }

  if (changed || !(await existplayer(playerId))) {
    await Write_player(playerId, player);
  }
  return player;
}

async function cancelPendingRebirth(targetId, actor, reason) {
  const taskKey = `xiuxian:zhuanshi_task:${targetId}`;
  const actionKey = `xiuxian:player:${targetId}:action`;
  const lockKey = `xiuxian:lock:zhuanshi_task:${targetId}`;
  const lockToken = `rescue:${actor.player_id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const locked = await acquireRedisLock(
    lockKey,
    lockToken,
    REBIRTH_TASK_LOCK_TTL_SECONDS
  );

  if (!locked) {
    return { success: false, code: 'busy' };
  }

  try {
    const raw = await redis.get(taskKey);
    if (!raw) return { success: false, code: 'missing' };

    const task = JSON.parse(raw);
    const taskId = getRebirthTaskId(task, taskKey);
    if (await isRebirthTaskCommitted(targetId, taskId)) {
      return { success: false, code: 'committed' };
    }

    const deniedTask = applyReincarnationDecision(task, 'deny', actor);
    deniedTask.rescue_reason = reason;
    await redis.set(taskKey, JSON.stringify(deniedTask));
    const player = await restoreRescuedPlayer(deniedTask);

    await redis.multi()
      .del(taskKey)
      .del(actionKey)
      .exec();

    return { success: true, task: deniedTask, player };
  } finally {
    await releaseRedisLock(lockKey, lockToken);
  }
}

async function holdTaskForController(taskKey, task, controller) {
  const now = Date.now();
  const actionKey = `xiuxian:player:${task.player_id}:action`;
  let action = {};

  try {
    const raw = await redis.get(actionKey);
    if (raw) action = JSON.parse(raw);
  } catch (err) {
    console.error(`读取轮回行动状态失败 (${task.player_id}):`, err);
  }

  const pendingTask = {
    ...task,
    status: '待轮回执掌者裁定',
    controller_pending: {
      controller_id: String(controller.player_id),
      controller_name: controller.player_name,
      since: task.controller_pending?.since || now,
    },
  };
  const pendingAction = {
    ...action,
    action: '轮回往生路',
    type: 'zhuanshi',
    start_time: action.start_time || task.start_time || now,
    end_time: now + CONTROLLER_ACTION_REFRESH_MS,
    description: `等待${controller.player_name}裁定是否往生`,
    status: '等待轮回裁定',
  };

  await redis.multi()
    .set(taskKey, JSON.stringify(pendingTask))
    .set(actionKey, JSON.stringify(pendingAction))
    .exec();
}

// 获取随机称号
function getRandomTitle() {
  const titles = [
    '路人', '散修', '道童', '剑客', '刀客', '书生', '侠客',
    '游子', '浪人', '隐士', '行者', '求道者', '问心人',
    '苦行僧', '摆渡人', '守墓人', '采药人', '铸剑师'
  ];
  return titles[Math.floor(Math.random() * titles.length)];
}

// 获取随机异象
function getRandomPhenomenon() {
  return rebirthPhenomena[Math.floor(Math.random() * rebirthPhenomena.length)];
}

// ==================== 纳戒掉落系统 ====================
// 位面定义
const weimianList = getNajieDropPlanes();

// 生成随机掉落坐标
function generateDropLocation(lunhuiCount) {
  return createNajieDropLocation(lunhuiCount);
}

// 纳戒是否为空
function isNajieEmpty(najie) {
  const categories = ['装备', '丹药', '道具', '功法', '草药', '材料', '食材', '盒子', '仙宠', '仙宠口粮', '宝石'];
  for (const cat of categories) {
    if (najie[cat] && najie[cat].length > 0) {
      return false;
    }
  }
  return (najie.灵石 || 0) <= 0 && (najie.源石 || 0) <= 0;
}

// 创建纳戒掉落记录
async function createNajieDrop(player_id, oldPlayer, oldNajie, taskId = null) {
  const lunhuiCount = oldPlayer.轮回转世次数 || 0;
  const location = generateDropLocation(lunhuiCount);
  
  // 计算纳戒价值
  let value = oldNajie.灵石 || 0;
  value += (oldNajie.源石 || 0) * 10000;
  
  const dropData = {
    player_id: player_id,
    player_name: oldPlayer.名号,
    player_level_id: oldPlayer.level_id,
    najie: oldNajie,
    location: location,
    lunhuiCount: lunhuiCount,
    createTime: Date.now(),
    expiredTime: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7天后过期
    beFound: false
  };
  
  // 保存到Redis
  const dropId = taskId ? encodeURIComponent(taskId) : Date.now();
  const dropKey = `xiuxian:najie_drop:${player_id}:${dropId}`;
  await redis.set(dropKey, JSON.stringify(dropData), { EX: 7 * 24 * 60 * 60 });

  const indexKey = `xiuxian:najie_drop_index`;
  try {
    await redis.zAdd(indexKey, { score: Date.now(), value: dropKey });
  } catch (err) {
    await redis.del(dropKey);
    throw err;
  }

  return { location, value, dropKey };
}

async function removeNajieDrop(dropKey) {
  if (!dropKey) return;

  const results = await Promise.allSettled([
    redis.del(dropKey),
    redis.zRem('xiuxian:najie_drop_index', dropKey),
  ]);
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}

// ==================== 仙遗宝地转化（寿元耗尽掉落 12h 未捡 → 秘境） ====================
const RELIC_UNCLAIMED_MS = 12 * 60 * 60 * 1000;  // 12 小时无人捡取
const RELIC_MIN_LEVEL = 41;                       // 死者境界需 level_id > 41（筑基及以上）
const RELIC_EXPIRE_MS = 30 * 24 * 60 * 60 * 1000; // 仙遗宝地存续 30 天

// 获取全服推送群列表（与诡异大祭保持一致）
async function getNotifyGroupList() {
  try {
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const notifyGroups = xiuxianConfig?.Era?.notifyGroups || [];
    if (notifyGroups.length > 0) return notifyGroups.map(g => String(g));
  } catch (e) {
    logger.error('[仙遗宝地] 读取群列表失败:', e.message);
  }
  try {
    const redisGroups = await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    if (redisGroups && redisGroups.length > 0) return redisGroups.map(g => String(g));
  } catch (e) {
    logger.error('[仙遗宝地] 从Redis读取群列表失败:', e.message);
  }
  return [];
}

async function broadcastToAllGroups(msg) {
  try {
    const groupList = await getNotifyGroupList();
    const bot = globalThis.Bot;
    if (!bot) return;
    for (const gid of groupList) {
      try {
        await bot.pickGroup(gid).sendMsg(msg);
      } catch (e) {
        console.error('[仙遗宝地] 广播发送失败:', e.message);
      }
    }
  } catch (e) {
    console.error('[仙遗宝地] 广播失败:', e.message);
  }
}

// 检查并转化超时未捡的掉落为仙遗宝地
async function checkRelicConversion() {
  try {
    const drops = await getAllNajieDrops();
    for (const drop of drops) {
      if (drop.isRelic) continue;
      if ((Date.now() - (drop.createTime || 0)) <= RELIC_UNCLAIMED_MS) continue;
      if ((drop.player_level_id || 0) <= RELIC_MIN_LEVEL) continue;

      const lockToken = `relic:${drop.key}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const lockKey = `xiuxian:lock:najie_drop:${drop.key}`;
      let locked = false;

      try {
        locked = await acquireRedisLock(lockKey, lockToken);
        if (!locked) continue;

        const freshDropRaw = await redis.get(drop.key);
        if (!freshDropRaw) continue;
        const freshDrop = { key: drop.key, ...JSON.parse(freshDropRaw) };
        if (freshDrop.beFound) continue;
        if ((Date.now() - (freshDrop.createTime || 0)) <= RELIC_UNCLAIMED_MS) continue;
        if ((freshDrop.player_level_id || 0) <= RELIC_MIN_LEVEL) continue;

        const conversion = await createXianyiBaodi(freshDrop);
        if (conversion?.baodi) {
          if (!conversion.created) {
            console.log(`【仙遗宝地】玩家 ${freshDrop.player_id} 的遗物已完成转化，清理残留掉落`);
            continue;
          }

          const msg = [
            `【仙遗宝地·现世】`,
            `岁月长河之中，一座古老的仙遗宝地自虚空中浮现！`,
            `此处乃【${freshDrop.player_name}】（第${freshDrop.player_level_id}层修士）坐化前遗落的一切造化，`,
            `历经十二时辰无人问津，终成一方独立秘境。`,
            `有缘者可循【#仙遗宝地】前往探索，夺取其中机缘！`
          ].join('\n');
          await broadcastToAllGroups(msg);
          console.log(`【仙遗宝地】玩家 ${freshDrop.player_id} 的遗物转化为仙遗宝地`);
        }
      } catch (err) {
        console.error(`【仙遗宝地】转化失败 (${drop.key}):`, err);
      } finally {
        if (locked) await releaseRedisLock(lockKey, lockToken);
      }
    }
  } catch (err) {
    console.error('仙遗宝地转化检查出错:', err);
  }
}

// 获取所有未捡取的纳戒掉落
async function getAllNajieDrops() {
  const indexKey = `xiuxian:najie_drop_index`;
  const now = Date.now();
  
  // 获取所有掉落键
  const dropKeys = await redis.zRange(indexKey, 0, -1);
  const drops = [];
  
  for (const key of dropKeys) {
    try {
      const dropData = await redis.get(key);
      if (dropData) {
        const data = JSON.parse(dropData);
        if (!data.beFound && now < data.expiredTime) {
          drops.push({
            key,
            ...data,
            location: normalizeNajieDropLocation(data.location),
          });
        }
      }
    } catch (e) {
      console.error('读取纳戒掉落失败:', e);
    }
  }
  
  return drops;
}

// 捡取纳戒
async function pickupNajieDrop(dropKey, pickerId) {
  const lockToken = `${pickerId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const dropLockKey = `xiuxian:lock:najie_drop:${dropKey}`;
  const pickerLockKey = `xiuxian:lock:najie_pickup:${pickerId}`;
  let dropLocked = false;
  let pickerLocked = false;

  try {
    dropLocked = await acquireRedisLock(dropLockKey, lockToken);
    if (!dropLocked) {
      return { success: false, message: '该纳戒正在被其他玩家捡取，请稍后重试' };
    }

    pickerLocked = await acquireRedisLock(pickerLockKey, lockToken);
    if (!pickerLocked) {
      return { success: false, message: '你正在捡取另一枚纳戒，请稍后重试' };
    }

    const dropData = await redis.get(dropKey);
    if (!dropData) {
      return { success: false, message: '纳戒不存在或已被捡取' };
    }

    const data = JSON.parse(dropData);
    data.location = normalizeNajieDropLocation(data.location);
    if (data.beFound) {
      return { success: false, message: '纳戒已被捡取' };
    }

    if (Date.now() > data.expiredTime) {
      return { success: false, message: '纳戒已过期消散' };
    }

    const picker = await Read_player(pickerId);
    const reach = checkNajieDropReach(picker, data.location);
    if (!reach.ok && reach.reason === 'plane') {
      return {
        success: false,
        message: `纳戒遗落于${reach.location.weimianName}，你当前身处${reach.currentPlane || '未知位面'}，无法隔界捡取。`,
      };
    }
    if (!reach.ok && reach.reason === 'unset') {
      return {
        success: false,
        message: `你尚未在${reach.currentPlane}确定位置，请先发送 #前往${reach.location.x},${reach.location.y}。`,
      };
    }
    if (!reach.ok) {
      return {
        success: false,
        message: [
          `你尚未抵达纳戒所在坐标。`,
          `当前位置：${reach.coordinate.x},${reach.coordinate.y}`,
          `目标坐标：${reach.location.x},${reach.location.y}`,
          `相距：${Math.ceil(reach.distance)}格`,
          `请发送 #前往${reach.location.x},${reach.location.y} 后再捡取。`,
        ].join('\n'),
      };
    }

    const originalNajie = await Read_najie(pickerId);
    const mergedNajie = mergeNajieContents(originalNajie, data.najie);
    await Write_najie(pickerId, mergedNajie);

    data.beFound = true;
    data.foundTime = Date.now();
    data.foundBy = pickerId;

    try {
      // 兼容 Redis<6.0（本服为 3.2.100）：KEEPTTL 子命令 6.0 才引入，旧版会报 ERR syntax error。
      // 改用剩余秒数重新设置过期，既保留原 7 天 TTL，又对所有版本安全。
      const remainingMs = data.expiredTime - Date.now();
      const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      await redis.set(dropKey, JSON.stringify(data), { EX: remainingSec });
    } catch (err) {
      await Write_najie(pickerId, originalNajie);
      throw err;
    }

    const indexKey = `xiuxian:najie_drop_index`;
    try {
      await redis.zRem(indexKey, dropKey);
    } catch (err) {
      console.error(`移除已领取纳戒索引失败 (${dropKey}):`, err);
    }

    return {
      success: true,
      data,
      najie: data.najie,
      mergedNajie,
    };
  } finally {
    if (pickerLocked) await releaseRedisLock(pickerLockKey, lockToken);
    if (dropLocked) await releaseRedisLock(dropLockKey, lockToken);
  }
}

// 格式化坐标显示
function formatLocation(location) {
  return `[${location.weimianName}]坐标(${location.x}, ${location.y})`;
}

// ==================== 创建新玩家 ====================
async function createNewPlayerAfterRebirth(e, oldPlayer, isChixiao, downgradedAptitude) {
  try {
    const player_id = oldPlayer.id;
    let File_msg = fs.readdirSync(__PATH.player_path);
    let n = File_msg.length + 1;
    
    const talent = await get_random_talent();
    
    let newAptitude;
    if (isChixiao) {
      newAptitude = {
        grade: '生而痴傻',
        evaluation: '前世灵魂在阴阳大磨盘中磨灭殆尽，仅余一缕残魂，灵智蒙尘，如那初生之婴'
      };
    } else if (downgradedAptitude) {
      newAptitude = {
        grade: downgradedAptitude,
        evaluation: aptitudeDescriptions[downgradedAptitude] + '（轮回磨砺，道基受损，前世荣光不再）'
      };
    } else {
      newAptitude = await get_random_aptitude();
    }
    
    // 轮回奖励计算
    const lunhuiGanwu = oldPlayer.轮回感悟 || 0;
    const hasYinji = oldPlayer.轮回印记 || false;
    
    let new_player = {
      id: player_id,
      sex: 0,
      名号: isChixiao ? `痴儿${n}号` : oldPlayer.痴傻状态 ? `痴儿${n}号` : `${getRandomTitle()}${n}号`,
      宣言: '这一世，我要踏破诸天，证道永恒！',
      daofa: '未开启',
      level_id: 1,
      Physique_id: 1,
      mijinglevel_id: 1,
      xiangulevel_id: 1,
      神识: 0,
      元神: 0,
      元神上限: 0,
      race: 1,
      修为: 1,
      血气: 1,
      灵石: 10000 + lunhuiGanwu * 1000,
      源石: 0,
      生命本源: 100,
      灵根: talent,
      神石: 0,
      寿元: 99 + lunhuiGanwu * 5,
      favorability: 0,
      breakthrough: false,
      linggen: [],
      linggenshow: 1,
      学习的功法: [],
      修炼效率提升: talent.eff,
      饱食度: 0,
      热量: 0,
      连续签到天数: 0,
      道法赐福天数: 0,
      攻击加成: 0,
      防御加成: 0,
      生命加成: 0,
      power_place: 0,
      当前血量: 8000 + lunhuiGanwu * 100,
      血量上限: 8000 + lunhuiGanwu * 100,
      lunhui: 0,
      lunhuiBH: 0,
      轮回点: 10 + lunhuiGanwu,
      daofaxianshu: 0,
      daofaxianshu_endtime: 0,
      occupation: [],
      occupation_level: 1,
      镇妖塔层数: 0,
      神魄段数: 0,
      魔道值: 0,
      仙宠: [],
      练气皮肤: 0,
      装备皮肤: 0,
      纳戒皮肤: 0,
      幸运: 0 + lunhuiGanwu,
      addluckyNo: 0,
      师徒任务阶段: 0,
      师徒积分: 0,
      attempting_level_7: false,
      guardian: null,
      抽奖次数: 0,
      出金率: 0,
      出金次数: 0,
      庇护人: "",
      仙宠寻宝状态: 0,
      仙宠寻宝: "",
      仙宠寻宝开始时间: 0,
      护道人: "无",
      势力: "无",
      势力职位: "",
      天资等级: newAptitude.grade,
      天资评价: newAptitude.evaluation,
      五色祭坛: 0,
      痴傻状态: isChixiao || oldPlayer.痴傻状态 || false,
      轮回转世次数: (oldPlayer.轮回转世次数 || 0) + 1,
      轮回感悟: lunhuiGanwu,
      轮回印记: hasYinji,
      // 以下字段对齐正常 #开始修仙 模板，避免重生后玩家对象缺字段导致属性/战力 NaN
      速度: 100,
      仙道潜力: 0,
      道心: 0,
      元神伤害加成: 0,
      元神伤害减免: 0,
      神通伤害加成: 0,
      神通伤害减免: 0,
      近战伤害加成: 0,
      近战伤害减免: 0,
      闪避率: 0,
      穿透: 0,
      治疗效果加成: 0,
      每回合恢复: 0,
      血上限加成: 0,
      全伤害类型加成: 0,
      全类型减免: 0,
      减伤: 0,
      治疗加成: 0,
      神通加成: 0,
      暴击率加成: 0,
      位面传送次数: 0,
      高级传送次数: 0,
      记忆坐标: ['凡间'],
      传送阵坐标: [],
      星图: 0
    };
    
    // 轮回印记加成
    if (hasYinji) {
      new_player.轮回点 += 5;
      new_player.幸运 += 5;
      new_player.寿元 += 10;
    }
    
    return new_player;
  } catch (err) {
    console.error('创建新玩家失败:', err);
    throw err;
  }
}

// ==================== 处理宗门关系 ====================
async function handleSectRelationship(player_id, oldPlayer, fileTransaction) {
  if (!isNotNull(oldPlayer.宗门)) return;

  const associationName = oldPlayer.宗门.宗门名称;
  const associationPath = `${__PATH.association}/${associationName}.json`;
  let ass = data.getAssociation(oldPlayer.宗门.宗门名称);
  if (!ass || ass === 'error' || typeof ass !== 'object') {
    throw new Error(`无法读取宗门数据：${associationName}`);
  }

  fileTransaction.capture(associationPath);

  if (oldPlayer.宗门.职位 !== '宗主') {
    // 普通成员，直接移除
    if (ass[oldPlayer.宗门.职位]) {
      ass[oldPlayer.宗门.职位] = ass[oldPlayer.宗门.职位].filter(item => item != player_id);
    }
    ass['所有成员'] = ass['所有成员'].filter(item => item != player_id);
    writeJsonAtomically(associationPath, ass);
  } else {
    // 宗主陨落，宗门大乱
    if (ass.所有成员.length < 2) {
      if (fs.existsSync(associationPath)) fs.unlinkSync(associationPath);
    } else {
      // 传承之争
      ass['所有成员'] = ass['所有成员'].filter(item => item != player_id);
      
      let newSectMaster = null;
      if (ass.长老 && ass.长老.length > 0) {
        newSectMaster = await get_random_fromARR(ass.长老);
      } else if (ass.内门弟子 && ass.内门弟子.length > 0) {
        newSectMaster = await get_random_fromARR(ass.内门弟子);
      } else {
        newSectMaster = await get_random_fromARR(ass.所有成员);
      }
      
      if (newSectMaster) {
        let newMaster = await data.getData('player', newSectMaster);
        if (!newMaster || !newMaster.宗门) {
          throw new Error(`无法读取宗主继任人数据：${newSectMaster}`);
        }

        const newMasterPath = `${__PATH.player_path}/${newSectMaster}.json`;
        fileTransaction.capture(newMasterPath);
        if (ass[newMaster.宗门.职位]) {
          ass[newMaster.宗门.职位] = ass[newMaster.宗门.职位].filter(
            item => item != newSectMaster
          );
        }
        ass['宗主'] = newSectMaster;
        newMaster.宗门.职位 = '宗主';
        writeJsonAtomically(newMasterPath, newMaster);
        writeJsonAtomically(associationPath, ass);
      } else {
        throw new Error(`宗门 ${associationName} 没有可继任的成员`);
      }
    }
  }
}

async function captureRedisValues(keys) {
  const values = new Map();
  for (const key of keys) {
    values.set(key, await redis.get(key));
  }
  return values;
}

async function restoreRedisValues(values) {
  for (const [key, value] of values) {
    if (value === null || value === undefined) {
      await redis.del(key);
    } else {
      await redis.set(key, value);
    }
  }
}

// ==================== 强制再入仙途 ====================
async function forceRebirthPlayer(
  e,
  oldPlayer,
  acount,
  isChixiao = false,
  downgradedAptitude = null,
  taskId = null
) {
  const player_id = oldPlayer.id;
  const fileTransaction = new FileRollbackTransaction();
  const playerFiles = {
    player: `${__PATH.player_path}/${player_id}.json`,
    equipment: `${__PATH.equipment_path}/${player_id}.json`,
    najie: `${__PATH.najie_path}/${player_id}.json`,
    danyao: `${__PATH.danyao_path}/${player_id}.json`,
  };
  const redisKeys = [
    `xiuxian:player:${player_id}:last_reCreate_time`,
    `xiuxian:player:${player_id}:reCreate_acount`,
  ];
  let redisBefore = new Map();
  let dropInfo = null;
  let committed = false;

  try {
    console.log(`【再入仙途】玩家 ${player_id} 开始转世...`);

    Object.values(playerFiles).forEach(file => fileTransaction.capture(file));
    redisBefore = await captureRedisValues(redisKeys);

    const new_player = await createNewPlayerAfterRebirth(
      e,
      oldPlayer,
      isChixiao,
      downgradedAptitude
    );
    if (taskId) new_player.last_rebirth_task_id = taskId;
    const new_equipment = {
      武器: data.equipment_list.find(item => item.name == '烂铁匕首'),
      护具: data.equipment_list.find(item => item.name == '破铜护具'),
      法宝: data.equipment_list.find(item => item.name == '廉价炮仗'),
      帝兵: data.dibing_list.find(item => item.name == '废铁'),
    };
    const new_najie = {
      等级: 1,
      灵石上限: 5000 + (oldPlayer.轮回感悟 || 0) * 100,
      灵石: 0,
      源石: 0,
      装备: [],
      丹药: [],
      道具: [],
      功法: [],
      草药: [],
      食材: [],
      盒子: [],
      材料: [],
      仙宠: [],
      仙宠口粮: [],
      宝石: [],
    };
    const new_danyao = {
      biguan: 0, biguanxl: 0, xingyun: 0, lianti: 0,
      ped: 0, modao: 0,
      beiyong1: 0, beiyong2: 0, beiyong3: 0, beiyong4: 0, beiyong5: 0,
    };

    const maxHp = Number(new_player.血量上限) || (8000 + (oldPlayer.轮回感悟 || 0) * 100);
    new_player.血量上限 = maxHp;
    new_player.当前血量 = maxHp; // 转世满血，修复此前 +999999 暴涨 bug

    await handleSectRelationship(player_id, oldPlayer, fileTransaction);

    try {
      let oldNajie = null;
      try {
        oldNajie = await Read_najie(player_id);
      } catch (e) {
        if (e?.code !== 'ENOENT') throw e;
      }

      const augmentedNajie = oldNajie
        ? JSON.parse(JSON.stringify(oldNajie))
        : {
            等级: 0, 灵石上限: 0, 灵石: 0, 源石: 0,
            装备: [], 丹药: [], 道具: [], 功法: [], 草药: [],
            材料: [], 食材: [], 盒子: [], 仙宠: [], 仙宠口粮: [], 宝石: []
          };

      // 将已穿戴的装备拍平为「装备」类道具，并入掉落（捡取者获得的是未穿戴装备，自行 #装备）
      const starterEquip = ['烂铁匕首', '破铜护具', '廉价炮仗', '废铁'];
      let hasEquipment = false;
      try {
        const oldEquipment = await Read_equipment(player_id);
        for (const slot of ['武器', '护具', '法宝', '帝兵']) {
          const item = oldEquipment?.[slot];
          if (item && item.name && !starterEquip.includes(item.name)) {
            augmentedNajie.装备.push(prepareIndependentDropItem(item, { 部位: slot }));
            hasEquipment = true;
          }
        }
      } catch (e) {
        if (e?.code !== 'ENOENT') console.warn(`【纳戒掉落】读取装备失败:`, e.message);
      }

      // 已装备的单体仙宠一并掉落
      let hasPet = false;
      if (oldPlayer.仙宠 && oldPlayer.仙宠.name) {
        augmentedNajie.仙宠.push(prepareIndependentDropItem(oldPlayer.仙宠));
        hasPet = true;
      }

      const hasLoot = (oldNajie && !isNajieEmpty(oldNajie)) || hasEquipment || hasPet;
      if (hasLoot) {
        dropInfo = await createNajieDrop(player_id, oldPlayer, augmentedNajie, taskId);
        console.log(`【纳戒掉落】玩家 ${player_id} 的遗物掉落至 ${formatLocation(dropInfo.location)}（装备:${hasEquipment} 仙宠:${hasPet}）`);
      }
    } catch (err) {
      console.error(`【纳戒掉落】处理掉落失败:`, err);
      throw err;
    }

    // 关键修复：必须走 Write_equipment 重算并写回 攻击/防御/生命/暴击/暴伤 等基础属性。
    // 直接 writeJsonAtomically(new_player) 不会触发属性计算（属性计算在 Write_equipment 内部完成），
    // 会导致重生后玩家存档缺 攻击/防御/血量上限/暴击率 → 战力面板算成 NaN → 战力 0。
    // 流程与 #开始修仙 一致：Write_player 落盘 → Write_equipment 读盘、计算属性、再 Write_player 写回带属性版。
    await Write_player(player_id, new_player);
    await Write_equipment(player_id, new_equipment);
    writeJsonAtomically(playerFiles.najie, new_najie);
    writeJsonAtomically(playerFiles.danyao, new_danyao);

    await redis.multi()
      .set(redisKeys[0], Date.now())
      .set(redisKeys[1], acount + 1)
      .exec();

    fileTransaction.commit();
    committed = true;

    let effectMsg = '';
    if (isChixiao) {
      effectMsg = '\n【灵魂重创】前世灵魂在阴阳大磨盘中磨灭殆尽，此生灵智蒙尘，如那初生之婴，痴痴傻傻...';
    } else if (downgradedAptitude) {
      effectMsg = `\n【道基受损】阴阳大磨盘磨灭部分本源，天资从"${oldPlayer.天资等级}"降至"${downgradedAptitude}"，前世荣光不再...`;
    }

    let najieDropMsg = '';
    if (dropInfo) {
      najieDropMsg = `\n【纳戒遗落】前世纳戒遗落于${dropInfo.location.weimianName}，坐标(${dropInfo.location.x}, ${dropInfo.location.y})，有缘人或可寻得...`;
    }

    const rebornMsg = [
      `【轮回转世·重生完成】`,
      `岁月如刀斩天骄，长生路上叹妖娆。`,
      `${oldPlayer.名号}的残魂在轮回中重新凝聚，前尘往事尽成空...`,
      effectMsg,
      najieDropMsg,
      `一声婴儿啼哭，你重新降临于世！`,
      `这一世，你将再踏仙路，追寻那永恒的大道！`,
      `QQ：${player_id}`,
      `道号：${new_player.名号}`,
      `天资：${new_player.天资等级}`,
      `灵根：${new_player.灵根.name}`,
      `轮回次数：${new_player.轮回转世次数}`,
      `仙路漫漫，愿你此生能够走得更远，`,
      `终有一日，踏破诸天，证道永恒！`
    ].join('\n');

    await notifyReincarnationPlayer(player_id, rebornMsg);
    console.log(`【再入仙途】玩家 ${player_id} 转世完成！`);
    return new_player;
  } catch (err) {
    if (committed) {
      console.error(`【再入仙途】玩家 ${player_id} 已提交，但后续处理出错:`, err);
      throw err;
    }

    const rollbackErrors = [];

    try {
      fileTransaction.rollback();
    } catch (rollbackErr) {
      rollbackErrors.push(rollbackErr);
    }
    try {
      await restoreRedisValues(redisBefore);
    } catch (rollbackErr) {
      rollbackErrors.push(rollbackErr);
    }
    try {
      await removeNajieDrop(dropInfo?.dropKey);
    } catch (rollbackErr) {
      rollbackErrors.push(rollbackErr);
    }

    console.error(`【再入仙途】玩家 ${player_id} 转世失败，已执行回滚:`, err);
    if (rollbackErrors.length > 0) {
      console.error(`【再入仙途】玩家 ${player_id} 回滚不完整:`, rollbackErrors);
    }
    throw err;
  }
}

// ==================== 执行轮回转世 ====================
async function executeZhuanshiRebirth(e, task, taskId) {
  try {
    const player_id = task.player_id;
    const oldPlayer = task.player_data;
    const acount = task.acount || 0;
    
    console.log(`【轮回】玩家 ${player_id} 开始轮回...`);
    
    const canWithstand = canWithstandYinYangGrind(oldPlayer);
    const mijingLevel = MijingLevels.find(l => l.id === oldPlayer.mijinglevel_id)?.name || '未知';
    const xianguLevel = oldPlayer.xiangulevel_id;
    const phenomenon = getRandomPhenomenon();
    
    let messages = [];
    
    // ===== 第一阶段：寿元耗尽，魂归地府 =====
    messages.push(`【轮回转世·魂归地府】`);

    messages.push(`岁月无情，大道苍凉。`);
    messages.push(`${oldPlayer.名号}的寿元终于走到了尽头...`);
    messages.push(`那一日，${phenomenon}，`);
    messages.push(`仿佛在为你送行，又仿佛在嘲笑这世间众生的渺小。`);
    messages.push(`一缕残魂飘飘荡荡，脱离肉身，坠入那传说中的古地府...`);
    messages.push(`黄泉路上，阴风怒号，无数亡魂与你擦肩而过，`);
    messages.push(`它们或是哭嚎，或是麻木，或是茫然...`);
    messages.push(`你随着亡魂大军，来到了地府深处。`);
    messages.push(`一座古老的石殿横亘在前，上书三个大字：`);
    messages.push(`【判官殿】`);

    
    await sendRebirthMessage(e, messages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ===== 第二阶段：判官审魂 =====
    let judgeMessages = [];
    
    judgeMessages.push(`【判官审魂】`);
    judgeMessages.push(`殿内，一盏魂灯摇曳，照亮了那高大的身影。`);
    judgeMessages.push(`判官翻开生死簿，目光如电，声音如雷霆：`);
    judgeMessages.push(`"${oldPlayer.名号}，阳寿已尽，功德已消，`);
    judgeMessages.push(`今生种种，皆为定数。`);
    judgeMessages.push(`速入轮回，来世或可得道！"`);
    
    if (oldPlayer.轮回转世次数 > 0) {
      judgeMessages.push(`判官眉头微皱："嗯？此人已轮回${oldPlayer.轮回转世次数}次..."`);
      judgeMessages.push(`"轮回印记在身，倒也是个有故事的人。"`);
    }
    
    if (canWithstand) {
      judgeMessages.push(`突然，判官面色大变！`);
      judgeMessages.push(`"这...这股气息...你是${mijingLevel}境的存在？！"`);
      judgeMessages.push(`"斩道王者！已触摸到天道规则，超脱轮回之外！"`);
      if (xianguLevel >= 9) {
        judgeMessages.push(`"不对...还有真神之躯！仙台与仙古同修，这是要逆天吗？！"`);
      }
      judgeMessages.push(``);
      judgeMessages.push(`判官连忙起身，恭敬道："大人，请随我来..."`);
    } else {
      judgeMessages.push(`你沉默不语，心中却有万般不甘。`);
      judgeMessages.push(`这一生，你可曾后悔？`);
      judgeMessages.push(`这一生，你可曾遗憾？`);
      judgeMessages.push(`这一生，你可曾...真正活过？`);
      judgeMessages.push(``);
      judgeMessages.push(`判官摇头："执念太深，难入轮回。`);
      judgeMessages.push(`去吧，阴阳大磨盘会磨灭你的一切执念。"`);
    }
    
    judgeMessages.push(``);
    judgeMessages.push(`你被带入古地府最深处——轮回路！`);
    judgeMessages.push(`前方，一座巨大的阴阳大磨盘横亘于世，`);
    judgeMessages.push(`阴鱼与阳鱼交织，缓缓转动，`);
    judgeMessages.push(`仿佛要将这世间的一切都磨灭成虚无...`);
    judgeMessages.push(``);
    
    await sendRebirthMessage(e, judgeMessages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ===== 第三阶段：阴阳大磨盘 =====
    let grindMessages = [];
    
    if (canWithstand) {
      // 强者硬扛
      grindMessages.push(`【阴阳大磨盘·以力破法】`);
      grindMessages.push(`阴阳大磨盘轰然震动，轮回之力如海啸般席卷而来！`);
      grindMessages.push(`那磨盘上的阴鱼与阳鱼仿佛活了过来，`);
      grindMessages.push(`化作两条巨大的阴阳鱼，张口要将你吞噬！`);
      grindMessages.push(`但你只是静静地站在那里，周身散发出无尽神威。`);
      grindMessages.push(`你的道，你的法，你的意志，在这一刻凝成实质！`);
      grindMessages.push(`"轰——！"`);
      grindMessages.push(`阴阳大磨盘发出不堪重负的哀鸣，`);
      grindMessages.push(`磨盘上出现无数裂痕，如那蛛网般蔓延！`);
      grindMessages.push(`判官目瞪口呆："这...这怎么可能！`);
      grindMessages.push(`阴阳大磨盘，自古长存，从未有人能将其震裂！"`);
      grindMessages.push(`你淡淡开口："我的道，不在轮回之中。"`);
      grindMessages.push(`"今日，我便以力破法，超脱这轮回之外！"`);
      grindMessages.push(`"咔嚓——！"`);
      grindMessages.push(`阴阳大磨盘，碎！`);
    } else {
      // 弱者受磨
      grindMessages.push(`【阴阳大磨盘·灵魂淬炼】`);
      grindMessages.push(`你被投入阴阳大磨盘之中！`);
      grindMessages.push(`磨盘缓缓转动，发出"轰隆隆"的巨响，`);
      grindMessages.push(`仿佛天道在怒吼，又仿佛万古的丧钟在敲响...`);
      grindMessages.push(`阴鱼与阳鱼交织成太极图案，`);
      grindMessages.push(`无尽轮回之力开始研磨你的灵魂！`);
      grindMessages.push(`那一刻，你的记忆如走马灯般闪过...`);
      grindMessages.push(`童年的欢笑，少年的热血，中年的沧桑，老年的悲凉...`);
      grindMessages.push(`爱恨情仇，喜怒哀乐，一切情感都在磨盘中化为虚无...`);
      grindMessages.push(`"啊——！"`);
      grindMessages.push(`你忍不住发出痛苦的嘶吼，`);
      grindMessages.push(`那是对过往的眷恋，对今生的不甘，对未来的迷茫...`);
      grindMessages.push(`磨盘无情，继续转动。`);
      grindMessages.push(`你的灵魂在痛苦中颤抖，在颤抖中蜕变...`);
    }
    
    grindMessages.push(``);
    await sendRebirthMessage(e, grindMessages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ===== 第四阶段：轮回结果 =====
    let resultMessages = [];
    let isChixiao = false;
    let downgradedAptitude = null;
    
    if (canWithstand) {
      // 完美转世
      resultMessages.push(`【轮回结果·完美无缺】`);
      resultMessages.push(`阴阳大磨盘破碎，轮回之力四散！`);
      resultMessages.push(`你的灵魂完好无损，道基未受丝毫影响！`);
      resultMessages.push(`判官躬身行礼："大人神威，古今罕见！`);
      resultMessages.push(`既已超脱轮回，本官便助大人完美转世！"`);
      resultMessages.push(`"愿大人来世，踏破诸天，证道永恒！"`);
    } else {
      // 受损转世
      const random = Math.random();
      const isChixiaoRandom = random < 0.3; // 30%概率痴傻
      
      if (isChixiaoRandom) {
        // 灵魂重创
        resultMessages.push(`【轮回结果·灵魂重创】`);
        resultMessages.push(`阴阳大磨盘疯狂转动，轮回之力远超你的承受极限！`);
        resultMessages.push(`"咔嚓——"一声脆响，你的灵魂出现无数裂痕！`);
        resultMessages.push(`那一刻，你感觉自己的记忆在飞速流逝...`);
        resultMessages.push(`功法、神通、阅历、情感，一切都在磨灭...`);
        resultMessages.push(`最终，你熬过了磨盘的磨砺，`);
        resultMessages.push(`但你的灵智已失，记忆几乎被磨灭殆尽...`);
        resultMessages.push(`判官叹息："灵魂受损至此，来世恐怕是痴傻之人..."`);
        resultMessages.push(`"也罢，送你再入轮回，望来世能够修复灵魂..."`);
        
        isChixiao = true;
      } else {
        // 天资受损
        const currentAptitude = oldPlayer.天资等级 || '平庸之资';
        const newAptitude = downgradeAptitude(currentAptitude);
        downgradedAptitude = newAptitude;
        
        resultMessages.push(`【轮回结果·道基受损】`);
        resultMessages.push(`阴阳大磨盘疯狂转动，轮回之力如潮水般涌来！`);
        resultMessages.push(`你的灵魂在磨盘中苦苦支撑，如那风中残烛...`);
        resultMessages.push(`最终，你熬过了磨盘的磨砺，`);
        resultMessages.push(`但你的灵魂本源受损，道基不再完美！`);
        resultMessages.push(`天资从"${currentAptitude}"降至"${newAptitude}"！`);
        resultMessages.push(`判官摇头："能熬过已是万幸，只是道基受损...`);
        resultMessages.push(`去吧，再入轮回，或许还有恢复之日。"`);
      }
    }
    
    // 轮回感悟
    if (acount + 1 >= 5 && !isChixiao && !canWithstand) {
      resultMessages.push(`【轮回感悟】`);
      resultMessages.push(`历经多次轮回，你对生死之道有了更深的感悟！`);
      resultMessages.push(`轮回感悟+1，来世或可得大道眷顾！`);
      oldPlayer.轮回感悟 = (oldPlayer.轮回感悟 || 0) + 1;
    }
    
    if (acount + 1 >= 10 && !isChixiao && !canWithstand) {
      resultMessages.push(`【轮回印记】`);
      resultMessages.push(`轮回印记在你灵魂上留下淡淡光芒，`);
      resultMessages.push(`这是大道的馈赠，也是你逆天而行的证明！`);
      oldPlayer.轮回印记 = true;
    }
    
    await sendRebirthMessage(e, resultMessages.join('\n'));
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ===== 第五阶段：再入仙途 =====
    const rebirthMessage = [
      `【再入仙途】`,
      `六道轮回之门轰然开启，`,
      `你的魂魄被一股无形之力牵引，投入那无尽的轮回之中...`,
      `前尘往事尽成空，`,
      `而今迈步从头越！`,
      `正在为你重塑肉身，重开仙路...`,
      `这一世，你将如何书写你的传奇？`,
    ].join('\n');
    
    await sendRebirthMessage(e, rebirthMessage);
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 执行转世
    await forceRebirthPlayer(
      e,
      oldPlayer,
      acount,
      isChixiao,
      downgradedAptitude,
      taskId
    );
    
    console.log(`【轮回】玩家 ${player_id} 轮回完成！`);
    
  } catch (err) {
    console.error(`【轮回】执行出错:`, err);
    await sendRebirthMessage(e, `\n【轮回出错】发生未知错误，旧存档已恢复，系统稍后会自动重试。`);
    throw err;
  }
}

function getRebirthTaskId(task, taskKey) {
  return task.task_id || `${taskKey}:${task.start_time || task.end_time}`;
}

async function isRebirthTaskCommitted(playerId, taskId) {
  try {
    const player = await Read_player(playerId);
    return player.last_rebirth_task_id === taskId;
  } catch {
    return false;
  }
}

async function scheduleRebirthRetry(taskKey, task, error) {
  const retryCount = (Number(task.retry_count) || 0) + 1;
  const retryMinutes = Math.min(5 * (2 ** Math.min(retryCount - 1, 3)), 60);
  const retryAt = Date.now() + retryMinutes * 60 * 1000;
  const updatedTask = {
    ...task,
    retry_count: retryCount,
    last_error: String(error?.message || error).slice(0, 500),
    last_error_time: Date.now(),
    end_time: retryAt,
    status: '轮回重试中',
  };

  await redis.set(taskKey, JSON.stringify(updatedTask), {
    EX: FAILED_TASK_TTL_SECONDS,
  });

  const actionKey = `xiuxian:player:${task.player_id}:action`;
  let action = {};
  try {
    const actionData = await redis.get(actionKey);
    if (actionData) action = JSON.parse(actionData);
  } catch (err) {
    console.error(`读取轮回行动状态失败 (${task.player_id}):`, err);
  }

  await redis.set(actionKey, JSON.stringify({
    ...action,
    action: action.action || '轮回转世',
    type: 'zhuanshi',
    start_time: action.start_time || task.start_time || Date.now(),
    end_time: retryAt,
    description: '轮回失败，等待自动重试',
    status: '轮回重试中',
  }));

  return { retryCount, retryMinutes };
}

// ==================== 定时任务类 ====================
class ZhuanshiTask extends plugin {
  constructor() {
    super({
      name: '轮回转世任务',
      dsc: '定时检测玩家轮回转世任务',
      event: 'message',
      priority: 6000,
      rule: []
    });

    ZxTask = this;
    this.setting = config.getConfig("task", "task");

    this.task = [
      {
        cron: this.setting.zhuanshi_task,
        name: 'ZhuanshiTask',
        fnc: () => this.checkZhuanshiTask(),
      }
    ];
  }

  async checkZhuanshiTask() {
    try {
      console.log('【轮回检查】开始执行...');
      const keys = await redis.keys('xiuxian:zhuanshi_task:*');
      const difficulty = readShouyuanDifficulty(data.filePathMap.weimianList);

      for (const key of keys) {
        try {
          const taskData = await redis.get(key);
          if (!taskData) {
            await redis.del(key);
            continue;
          }

          const task = JSON.parse(taskData);
          const now = Date.now();
          const player_id = task.player_id;

          if (now >= task.end_time) {
            const taskId = getRebirthTaskId(task, key);
            const lockToken = `${taskId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
            const lockKey = `xiuxian:lock:zhuanshi_task:${player_id}`;
            const locked = await acquireRedisLock(
              lockKey,
              lockToken,
              REBIRTH_TASK_LOCK_TTL_SECONDS
            );
            if (!locked) continue;

            try {
              if (await isRebirthTaskCommitted(player_id, taskId)) {
                await redis.del(key);
                await redis.del(`xiuxian:player:${player_id}:action`);
                console.log(`【轮回】玩家 ${player_id} 的任务已完成，清理残留任务`);
                continue;
              }

              if (task.rebirth_decision?.status === 'deny') {
                await restoreRescuedPlayer(task);
                await redis.multi()
                  .del(key)
                  .del(`xiuxian:player:${player_id}:action`)
                  .exec();
                console.log(`【轮回】玩家 ${player_id} 的往生已被驳回`);
                continue;
              }

              if (task.type === '寿元耗尽' && !difficulty.reincarnatesOnExhaustion) {
                await restoreRescuedPlayer(task);
                await redis.multi()
                  .del(key)
                  .del(`xiuxian:player:${player_id}:action`)
                  .exec();
                console.log(`【轮回】当前为${difficulty.name}难度，取消玩家 ${player_id} 的寿元轮回`);
                continue;
              }

              const controller = await getActiveReincarnationController();
              if (requiresControllerDecision(task, controller)) {
                const wasPending = Boolean(task.controller_pending);
                await holdTaskForController(key, task, controller);
                if (!wasPending) {
                  await notifyReincarnationPlayer(
                    player_id,
                    `【轮回路·等待裁定】\n${task.player_name || player_id}的魂魄已抵达轮回路。当前执掌者：${controller.player_name}，等待其裁定是否往生。`,
                    [controller.player_id]
                  );
                }
                console.log(
                  `【轮回执掌】玩家 ${player_id} 等待 ${controller.player_name} 裁定`
                );
                continue;
              }

              task.task_id = taskId;
              console.log(`【轮回】玩家 ${player_id} 时间到，开始轮回...`);

              const msgCtx = {
                isGroup: false,
                group_id: null,
                user_id: player_id,
                reply: async (msg) => {
                  try {
                    // 改为全服公告（复用插件既有 broadcastToAllGroups，无需造轮子）
                    await broadcastToAllGroups(msg);
                  } catch (err) {
                    console.error('【轮回】全服公告发送失败:', err);
                  }
                }
              };

              try {
                await executeZhuanshiRebirth(msgCtx, task, taskId);
              } catch (err) {
                const retry = await scheduleRebirthRetry(key, task, err);
                console.error(
                  `【轮回】玩家 ${player_id} 第${retry.retryCount}次失败，` +
                  `${retry.retryMinutes}分钟后重试`
                );
                continue;
              }

              try {
                await redis.del(`xiuxian:player:${player_id}:action`);
                await redis.del(key);
              } catch (cleanupErr) {
                console.error(`轮回成功后的任务清理失败 (${key}):`, cleanupErr);
              }
            } finally {
              await releaseRedisLock(lockKey, lockToken);
            }
          } else {
            const remaining = task.end_time - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            console.log(`【轮回检查】玩家 ${player_id} 剩余 ${hours}小时${minutes}分钟`);
          }
        } catch (err) {
          console.error(`处理轮回任务出错 (${key}):`, err);
        }
      }

      // 仙遗宝地转化检查（12h 未捡且筑基以上）
      try {
        await checkRelicConversion();
      } catch (err) {
        console.error('仙遗宝地转化检查出错:', err);
      }

      console.log('【轮回检查】完成');
    } catch (err) {
      console.error('轮回任务检查出错:', err);
    }
  }
}

// ==================== 轮回路救援与执掌 ====================
class ReincarnationRoad extends plugin {
  constructor() {
    super({
      name: '轮回往生路执掌系统',
      dsc: '强闯轮回救人以及大帝执掌轮回裁定',
      event: 'message',
      priority: 550,
      rule: [
        {
          reg: '^#(?:轮回救人|强闯轮回路).*$',
          fnc: 'rescueFromReincarnation',
        },
        {
          reg: '^#执掌轮回路$',
          fnc: 'takeControlOfReincarnation',
        },
        {
          reg: '^#放弃执掌轮回路$',
          fnc: 'releaseControlOfReincarnation',
        },
        {
          reg: '^#(?:准许往生|放行往生).*$',
          fnc: 'allowReincarnation',
        },
        {
          reg: '^#(?:驳回往生|拒绝往生).*$',
          fnc: 'denyReincarnation',
        },
        {
          reg: '^#轮回路状态$',
          fnc: 'showReincarnationStatus',
        },
      ],
    });
  }

  async getInvoker(e) {
    const playerId = String(e.user_id).replace('qg_', '');
    if (!(await existplayer(playerId))) return null;
    const player = await Read_player(playerId);
    return {
      player_id: playerId,
      player_name: player.名号,
      player,
      authority: getAuthority(player),
    };
  }

  async rescueFromReincarnation(e) {
    try {
      const invoker = await this.getInvoker(e);
      if (!invoker) return e.reply('你尚未踏上修行路，无法进入轮回往生路。');
      if (!invoker.authority.canRescue) {
        const required = invoker.authority.thresholds.rescue;
        return e.reply(
          `境界不足，至少需要达到${required.mijingName}或${required.xianguName}，` +
          `方可强闯轮回往生路救人。`
        );
      }

      const targetId = getMentionedPlayerId(e);
      if (!targetId) return e.reply('请指定要营救的玩家，例如：#轮回救人 @某人');
      if (targetId === invoker.player_id) {
        return e.reply('轮回路中不可自救，只能由他人接引魂魄归来。');
      }

      const result = await cancelPendingRebirth(
        targetId,
        invoker,
        '强闯轮回往生路救人'
      );
      if (!result.success) return this.replyCancelFailure(e, result.code);

      return e.reply([
        `【强闯轮回·救人成功】`,
        `${invoker.player_name}踏碎黄泉、横渡轮回，`,
        `将${result.task.player_name || result.player.名号}的魂魄从往生路上强行接回！`,
        `本次轮回任务已解除。`,
      ].join('\n'));
    } catch (err) {
      console.error('【轮回救人】执行失败:', err);
      return e.reply('强闯轮回往生路失败，魂魄仍在轮回路中。');
    }
  }

  async takeControlOfReincarnation(e) {
    try {
      const invoker = await this.getInvoker(e);
      if (!invoker) return e.reply('你尚未踏上修行路，无法执掌轮回。');
      if (!invoker.authority.canControl) {
        const required = invoker.authority.thresholds.control;
        return e.reply(
          `只有达到${required.mijingName}或仙古${required.xianguName}（极道至尊层次），` +
          `才能强行执掌轮回路。`
        );
      }

      const previous = await getActiveReincarnationController();
      const realms = getPlayerRealmNames(
        invoker.player,
        data.Levelmijing_list,
        data.xiangujinshi_list
      );
      const record = {
        player_id: invoker.player_id,
        player_name: invoker.player_name,
        mijing_realm: realms.mijing,
        xiangu_realm: realms.xiangu,
        controlled_at: Date.now(),
      };
      await redis.set(REINCARNATION_CONTROLLER_KEY, JSON.stringify(record));

      const replaced = previous && previous.player_id !== invoker.player_id
        ? `\n${previous.player_name}对轮回路的执掌已被强行取代。`
        : '';
      return e.reply(
        `【执掌轮回路】\n${invoker.player_name}以无上道果镇压六道，正式执掌轮回！\n` +
        `此后所有到期往生者都将等待你的裁定。${replaced}\n` +
        `使用 #准许往生 @某人 或 #驳回往生 @某人 进行裁定。`
      );
    } catch (err) {
      console.error('【执掌轮回】执行失败:', err);
      return e.reply('执掌轮回路失败。');
    }
  }

  async releaseControlOfReincarnation(e) {
    try {
      const invokerId = String(e.user_id).replace('qg_', '');
      const controller = await getActiveReincarnationController();
      if (!controller) return e.reply('当前无人执掌轮回路。');
      if (controller.player_id !== invokerId) {
        return e.reply(`当前轮回路由${controller.player_name}执掌，你无权放弃其权柄。`);
      }

      await redis.del(REINCARNATION_CONTROLLER_KEY);
      return e.reply('【轮回权柄归天】你已放弃执掌轮回路，待裁定魂魄将恢复自动往生。');
    } catch (err) {
      console.error('【放弃轮回执掌】执行失败:', err);
      return e.reply('放弃轮回权柄失败。');
    }
  }

  async allowReincarnation(e) {
    let lockKey = null;
    let lockToken = null;
    let locked = false;

    try {
      const controller = await getActiveReincarnationController();
      const invokerId = String(e.user_id).replace('qg_', '');
      if (!controller || controller.player_id !== invokerId) {
        return e.reply('只有当前轮回路执掌者可以准许往生。');
      }

      const targetId = getMentionedPlayerId(e);
      if (!targetId) return e.reply('请指定待裁定玩家，例如：#准许往生 @某人');

      const taskKey = `xiuxian:zhuanshi_task:${targetId}`;
      lockKey = `xiuxian:lock:zhuanshi_task:${targetId}`;
      lockToken = `allow:${invokerId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      locked = await acquireRedisLock(lockKey, lockToken, REBIRTH_TASK_LOCK_TTL_SECONDS);
      if (!locked) return e.reply('该魂魄正在接受其他裁定，请稍后重试。');

      const raw = await redis.get(taskKey);
      if (!raw) return e.reply('目标当前不在轮回往生路上。');

      const task = applyReincarnationDecision(
        JSON.parse(raw),
        'allow',
        controller
      );
      await redis.set(taskKey, JSON.stringify(task));
      await redis.set(`xiuxian:player:${targetId}:action`, JSON.stringify({
        action: '轮回往生路',
        type: 'zhuanshi',
        start_time: task.start_time || Date.now(),
        end_time: Date.now() + 60 * 1000,
        description: `已获${controller.player_name}准许往生`,
        status: '已准许往生',
      }));

      return e.reply(
        `【轮回裁定·准许】\n${controller.player_name}落下法旨：` +
        `${task.player_name || targetId}准入六道，下一次轮回检查时正式往生。`
      );
    } catch (err) {
      console.error('【准许往生】执行失败:', err);
      return e.reply('准许往生失败。');
    } finally {
      if (locked) await releaseRedisLock(lockKey, lockToken);
    }
  }

  async denyReincarnation(e) {
    try {
      const controller = await getActiveReincarnationController();
      const invokerId = String(e.user_id).replace('qg_', '');
      if (!controller || controller.player_id !== invokerId) {
        return e.reply('只有当前轮回路执掌者可以驳回往生。');
      }

      const targetId = getMentionedPlayerId(e);
      if (!targetId) return e.reply('请指定待裁定玩家，例如：#驳回往生 @某人');

      const result = await cancelPendingRebirth(
        targetId,
        controller,
        '轮回执掌者驳回往生'
      );
      if (!result.success) return this.replyCancelFailure(e, result.code);

      return e.reply(
        `【轮回裁定·驳回】\n${controller.player_name}逆转生死簿，` +
        `将${result.task.player_name || result.player.名号}遣返阳世，本次往生取消。`
      );
    } catch (err) {
      console.error('【驳回往生】执行失败:', err);
      return e.reply('驳回往生失败。');
    }
  }

  async showReincarnationStatus(e) {
    try {
      const controller = await getActiveReincarnationController();
      const keys = await redis.keys('xiuxian:zhuanshi_task:*');
      const tasks = [];

      for (const key of keys) {
        try {
          const raw = await redis.get(key);
          if (raw) tasks.push(JSON.parse(raw));
        } catch (err) {
          console.error(`读取轮回任务失败 (${key}):`, err);
        }
      }

      const lines = [
        '【轮回往生路状态】',
        controller
          ? `当前执掌者：${controller.player_name}`
          : '当前执掌者：无（到期后自动往生）',
        `路上魂魄：${tasks.length}人`,
      ];
      for (const task of tasks.slice(0, 10)) {
        lines.push(`- ${task.player_name || task.player_id}：${task.status || '轮回中'}`);
      }
      if (tasks.length > 10) lines.push(`- 另有${tasks.length - 10}人等待`);

      return e.reply(lines.join('\n'));
    } catch (err) {
      console.error('【轮回路状态】查询失败:', err);
      return e.reply('查询轮回路状态失败。');
    }
  }

  replyCancelFailure(e, code) {
    const messages = {
      busy: '该魂魄正在进行轮回结算或接受其他裁定，请稍后重试。',
      missing: '目标当前不在轮回往生路上。',
      committed: '目标已经完成往生，现世手段已无法追回。',
    };
    return e.reply(messages[code] || '本次轮回干预失败。');
  }
}

// ==================== 纳戒掉落查询与捡取 ====================
class NajieDrop extends plugin {
  constructor() {
    super({
      name: 'NajieDrop',
      dsc: '轮回纳戒掉落系统',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#遗落纳戒列表$',
          fnc: 'listNajieDrops',
        },
        {
          reg: '^#查询遗落纳戒.*$',
          fnc: 'queryNajieDrops',
        },
        {
          reg: '^#捡取纳戒(\\d+)$',
          fnc: 'pickupNajie',
        },
        {
          reg: '^#附近纳戒(?:\\s*(\\d{1,4}))?$',
          fnc: 'nearbyNajie',
        },
      ],
    });
  }

  // 列出所有未捡取的遗落纳戒
  async listNajieDrops(e) {
    try {
      const drops = await getAllNajieDrops();
      
      if (drops.length === 0) {
        await e.reply('当前没有任何遗落的纳戒。');
        return;
      }
      
      let msg = [ '【遗落纳戒列表】', '━━━━━━━━━━━━━━━━━━━━━━', ''];
      
      for (let i = 0; i < Math.min(drops.length, 10); i++) {
        const drop = drops[i];
        const remaining = Math.ceil((drop.expiredTime - Date.now()) / (1000 * 60 * 60));
        msg.push(`【${i + 1}】前主：${drop.player_name}`);
        msg.push(`    位置：${drop.location.weimianName} (${drop.location.x}, ${drop.location.y})`);
        msg.push(`    剩余：约${remaining}小时后消散`);
        msg.push('');
      }
      
      if (drops.length > 10) {
        msg.push(`...共${drops.length}个遗落纳戒`);
      }
      
      msg.push('使用【#捡取纳戒序号】可捡取对应纳戒');
      msg.push('先抵达对应位面并发送【#前往x,y】，才能捡取');
      msg.push('使用【#附近纳戒50】可搜索当前坐标50格内的纳戒');
      
      await e.reply(msg.join('\n'));
    } catch (err) {
      console.error('【遗落纳戒列表】出错:', err);
      await e.reply('查询遗落纳戒列表失败。');
    }
  }

  // 按位面查询遗落纳戒
  async queryNajieDrops(e) {
    try {
      const msg = e.msg.replace('#查询遗落纳戒', '').trim();
      const weimianName = msg || '';
      
      const allDrops = await getAllNajieDrops();
      let drops;
      if (weimianName) {
        const weimian = weimianList.find(w => w.name.includes(weimianName));
        if (weimian) {
          drops = allDrops.filter(drop => drop.location.weimianName === weimian.name);
        } else {
          await e.reply(`未找到名为"${weimianName}"的位面。`);
          return;
        }
      } else {
        drops = allDrops;
      }
      
      if (drops.length === 0) {
        await e.reply(`当前${weimianName ? weimianName + '中' : ''}没有任何遗落的纳戒。`);
        return;
      }
      
      let replyMsg = [ `【${weimianName || '所有位面'}遗落纳戒】` ];
      
      for (let i = 0; i < Math.min(drops.length, 5); i++) {
        const drop = drops[i];
        const globalIndex = allDrops.findIndex(item => item.key === drop.key) + 1;
        replyMsg.push(`【${globalIndex}】前主：${drop.player_name}`);
        replyMsg.push(`    坐标：(${drop.location.x}, ${drop.location.y})`);
        replyMsg.push('');
      }
      
      if (drops.length > 5) {
        replyMsg.push(`...共${drops.length}个遗落纳戒`);
      }

      replyMsg.push('请先前往该位面，再使用 #前往x,y 抵达目标坐标。');
      replyMsg.push('抵达后使用 #捡取纳戒序号。');

      await e.reply(replyMsg.join('\n'));
    } catch (err) {
      console.error('【查询遗落纳戒】出错:', err);
      await e.reply('查询遗落纳戒失败。');
    }
  }

  // 捡取纳戒
  async pickupNajie(e) {
    try {
      let usr_qq = e.user_id.toString().replace('qg_', '');
      
      // 检查是否是玩家
      let player;
      try {
        player = await Read_player(usr_qq);
      } catch {
        await e.reply('你还没有开始修仙，无法捡取纳戒。');
        return;
      }
      
      // 提取序号
      const match = e.msg.match(/^#捡取纳戒(\d+)$/);
      if (!match) {
        await e.reply('请输入正确的命令格式：#捡取纳戒序号');
        return;
      }
      const index = parseInt(match[1]) - 1;
      
      // 获取所有掉落
      const drops = await getAllNajieDrops();
      
      if (index < 0 || index >= drops.length) {
        await e.reply(`没有序号为${index + 1}的遗落纳戒。`);
        return;
      }
      
      const selectedDrop = drops[index];
      
      // // 检查是否是自己的纳戒（转世后同一QQ）
      // if (selectedDrop.player_id === usr_qq) {
      //   await e.reply('这是你自己的纳戒，无需捡取。');
      //   return;
      // }
      
      // 执行捡取
      const result = await pickupNajieDrop(selectedDrop.key, usr_qq);
      
      if (!result.success) {
        await e.reply(result.message);
        return;
      }
      
      // 发送成功消息
      const najie = result.najie;
      const totalLingshi = najie.灵石 || 0;
      
      let replyMsg = [
        `【纳戒捡取成功】`,
        `你捡取了${selectedDrop.player_name}遗落的纳戒！`,
        `发现地点：${selectedDrop.location.weimianName} (${selectedDrop.location.x}, ${selectedDrop.location.y})`,
        `纳戒中包含：`,
        `  灵石：${totalLingshi.toLocaleString()}`,
        `  装备：${najie.装备?.length || 0}件`,
        `  丹药：${najie.丹药?.length || 0}颗`,
        `  功法：${najie.功法?.length || 0}本`,
        `  草药：${najie.草药?.length || 0}株`,
        `  材料：${najie.材料?.length || 0}个`,
        `愿你善用此机缘，莫负前人之托！`,
      ].join('\n');
      
      await e.reply(replyMsg);
      
      console.log(`【纳戒捡取】玩家 ${usr_qq} 捡取了 ${selectedDrop.player_name} 的纳戒`);
    } catch (err) {
      console.error('【捡取纳戒】出错:', err);
      await e.reply('捡取纳戒失败。');
    }
  }

  // 查看附近纳戒（根据玩家当前位面）
  async nearbyNajie(e) {
    try {
      let usr_qq = e.user_id.toString().replace('qg_', '');
      
      // 检查是否是玩家
      let player;
      try {
        player = await Read_player(usr_qq);
      } catch {
        await e.reply('你还没有开始修仙，无法查看附近纳戒。');
        return;
      }
      
      // 提取当前位面坐标搜索半径，默认50格
      const match = e.msg.match(/^#附近纳戒(?:\s*(\d{1,4}))?$/);
      if (!match) {
        await e.reply('请输入正确的命令格式：#附近纳戒50');
        return;
      }
      const radius = Math.min(Math.max(parseInt(match[1] || '50'), 0), 2000);
      
      const weimianName = getPlayerPlaneName(player);
      const coordinate = getPlayerPlaneCoordinate(player, weimianName);
      if (!weimianName || !weimianList.some(plane => plane.name === weimianName)) {
        await e.reply('你当前所在位面没有固定坐标轴，无法搜索附近纳戒。');
        return;
      }
      if (!coordinate) {
        await e.reply(`你尚未在${weimianName}确定位置，请先发送 #前往x,y。`);
        return;
      }
      
      const allDrops = await getAllNajieDrops();
      const nearbyDrops = findNearbyNajieDrops(allDrops, player, radius);
      
      if (nearbyDrops.length === 0) {
        await e.reply(`在${weimianName}坐标${coordinate.x},${coordinate.y}周围${radius}格内没有遗落纳戒。`);
        return;
      }
      
      let msg = [
  
        `【附近纳戒】`,
        `当前位置：${weimianName} (${coordinate.x}, ${coordinate.y})`,
        `搜索半径：${radius}格`,
        ``
      ];

      for (const item of nearbyDrops.slice(0, 15)) {
        const drop = item.drop;
        msg.push(
          `【${item.globalIndex}】${drop.player_name} - ` +
          `坐标(${drop.location.x}, ${drop.location.y}) - 距离${Math.ceil(item.distance)}格`
        );
      }
      if (nearbyDrops.length > 15) msg.push(`...另有${nearbyDrops.length - 15}个纳戒`);
      
      msg.push('━━━━━━━━━━━━━━━━━━━━━━');
      msg.push('使用【#捡取纳戒序号】可捡取纳戒');
      msg.push(`共${nearbyDrops.length}个纳戒在搜索范围内`);
      
      await e.reply(msg.join('\n'));
    } catch (err) {
      console.error('【附近纳戒】出错:', err);
      await e.reply('查找附近纳戒失败。');
    }
  }
}

export { ZhuanshiTask, ReincarnationRoad, NajieDrop };
export default ZhuanshiTask;

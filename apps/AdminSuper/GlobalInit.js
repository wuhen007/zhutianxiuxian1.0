/**
 * 诸天初始化 · 超维真界灭维之战
 *
 * 超维真界之外，原初之主自「无」中走出——
 * 从无到有，从有到无，循环往复，祭掉一切。
 * 灭维之后，并非死寂，混沌中传出第一声道音，
 * 天地间正在诞生至宝，道化万千，诸天重演。
 *
 * 功能（仅限主人/修仙管理员）：
 * - #诸天初始化      发起灭维之战（需二次确认，60秒内有效）
 * - #确认诸天初始化  执行：清空玩家/纳戒/装备/丹药/内景地/小世界/
 *                    宗门/交易/任务/榜单/亲密度/师徒/若陀龙王，清理全部修仙redis，
 *                    重置时代、位面状态与位面事件，再入仙途冷却设为24小时
 * - #取消诸天初始化  取消本次灭维
 * - #同步公告群      将指令所在群设为唯一公告群
 * - #查看公告群      查看当前公告群列表
 *
 * 通知机制：
 * - 灭维预警及全部播报只发送到指令所在群，不广播其他群。
 * - 发起及确认时将 Era.notifyGroups 覆盖为指令所在群。
 *
 * 安全机制：
 * - 执行前自动备份所有受影响数据至 插件根/_backups/global_init_<时间戳>/
 * - 执行期间持有全局初始化锁（globalInitGuard），阻断全部玩家/全局数据写入，
 *   防止并发指令把刚清掉的数据写回；重复执行也会被锁拒绝。
 * - 分步执行，单步失败不中断整体流程，最终汇总失败项；整体异常有兜底回复。
 */

import fs from 'fs';
import path from 'path';
import { plugin, common, data, config } from '../../api/api.js';
import { __PATH } from '../../model/xiuxian.js';
import {
  beginGlobalInit,
  endGlobalInit,
  isGlobalInitRunning,
} from '../../utils/globalInitGuard.js';
import { getDefaultRiftState } from '../../model/planeRiftFestival.js';
import {
  SHOUYUAN_DIFFICULTIES,
  resolveShouyuanDifficulty,
} from '../User/shouyuanDifficulty.js';
import { createDimensionGuardState } from '../../model/dimensionGuard.js';

// ==================== 常量 ====================

/** 二次确认有效期（毫秒） */
const CONFIRM_TIMEOUT = 60 * 1000;

/** 待确认状态：qq -> 发起时间戳 */
const pendingConfirm = new Map();

/** 需要整目录清空的玩家数据目录（label -> 目录路径取值函数） */
const PLAYER_DIRS = [
  ['玩家存档', () => __PATH.player_path],
  ['纳戒', () => __PATH.najie_path],
  ['装备', () => __PATH.equipment_path],
  ['丹药药效', () => __PATH.danyao_path],
  ['内景地', () => __PATH.inner_world_path],
  ['宗门', () => __PATH.association],
];

/** 需要覆写为空值的玩家关联 JSON（label -> 文件路径取值函数 -> 空值） */
const PLAYER_JSON_FILES = [
  ['交易行', () => path.join(__PATH.Exchange, 'Exchange.json'), []],
  ['交易论坛', () => path.join(__PATH.Exchange, 'Forum.json'), []],
  ['锻炉', () => path.join(__PATH.duanlu, 'duanlu.json'), []],
  ['命名装备', () => path.join(__PATH.custom, 'custom.json'), []],
  ['临时缓存', () => path.join(__PATH.temp_path, 'temp.json'), []],
  ['每日任务', () => path.join(__PATH.renwu, 'renwu.json'), []],
  ['天地榜', () => path.join(__PATH.tiandibang, 'tiandibang.json'), []],
  ['道法仙术名单', () => path.join(__PATH.data_path, 'daofa_list.json'), {}],
];

/** 新纪元的完整位面初始状态；往生系统难度在重置时保留当前设置。 */
const WEIMIAN_INITIAL_STATE = Object.freeze({
  诸天位面: 5,
  现世承受力: 9999999,
  凡间: 1,
  仙界: 1,
  下界八域: 1,
  太初星墟: 1,
  遮天位面: 1,
  九天十地: 1,
  界海: 1,
  时间长河: 1,
  小阴间: 1,
  大阴间: 1,
  阳间: 1,
  上苍之上: 1,
  超维宇宙: 1,
  厄土高原: 1,
  永恒未知之地: 1,
  仙域: 1,
  帝尊: 1,
  成仙路: 0,
  成仙路开启总年份: 0,
  成仙路下次判定总年份: 0,
  仙古秘境: 0,
  古地府: 1,
  轮回路: 1,
  往生系统: 1,
  仙古秘境开启概率: 0,
  仙古秘境开启时间: 0,
  仙古秘境会话ID: '',
  仙古秘境阶段: 'closed',
  仙古秘境花蕾现世总年份: 0,
  仙古秘境准备结束总年份: 0,
  仙古秘境开启总年份: 0,
  仙古秘境关闭总年份: 0,
  仙古秘境下次判定总年份: 0,
});

const REALM_EVENTS_FILE = path.join(__PATH.data_path, 'weimian_events.json');
const DIMENSION_GUARD_STATE_FILE = path.join(__PATH.data_path, 'dimension_guard_state.json');

/** 需要清理的 redis key 前缀模式（本插件专属前缀，不会波及其他插件） */
const REDIS_PATTERNS = [
  'xiuxian:*',        // 玩家动作锁/签到CD/宗门战CD/拍卖/永寂名单等
  'Xiuxian:*',        // 若陀龙王团本状态等
  'jueling_loss:*',   // 绝灵时代寿元损失
  'jueling_loss_immune:*', // 绝灵免疫名单（与备份功能保持一致）
  'tianjige2:*',      // 天机阁二楼缓存
  'tianjiao:*',       // 天骄仇恨/伤害/恐惧/复活记录
  'dao:rewrite:*',    // 大道至宝重写缓存
  'guiyishizu*',      // 归一世祖状态（含 _ancestors）
  'gaoyuan',          // 大劫（高原）记录
  'zhutianxiuxian1.0Record2', // 世界 Boss 记录
];

// ==================== 工具函数 ====================

/** 清空目录下所有 .json 文件，返回删除数量 */
function clearJsonDir(dir) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(dir, f));
      count++;
    } catch (err) {
      logger.error(`[诸天初始化] 删除文件失败: ${path.join(dir, f)}`, err);
    }
  }
  return count;
}

/** 覆写 JSON 文件 */
function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 4), 'utf-8');
}

/** 读取 JSON 对象；文件缺失或损坏时返回空对象。 */
function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (err) {
    logger.warn(`[诸天初始化] ${filePath} 已损坏，将按默认值重建`, err);
    return {};
  }
}

/** 恢复完整位面初始状态，同时保留管理员选择的往生难度。 */
function resetWeimianState(filePath) {
  const current = readJsonObject(filePath);
  writeJson(filePath, {
    ...WEIMIAN_INITIAL_STATE,
    往生系统: resolveShouyuanDifficulty(current.往生系统).level,
  });
}

/** 清除位面事件进度，同时保留事件系统开关和冷却设置。 */
function resetRealmEvents(filePath) {
  const current = readJsonObject(filePath);
  const historyCount = Array.isArray(current.eventHistory) ? current.eventHistory.length : 0;
  writeJson(filePath, {
    eventHistory: [],
    lastEventTime: 0,
    lastEventWorldYear: null,
    activeEvents: [],
    eventCooldown: current.eventCooldown ?? 2000,
    enableEvents: current.enableEvents ?? true,
    eraTriggerChance: current.eraTriggerChance ?? 0.35,
    dungeonTriggerChance: current.dungeonTriggerChance ?? 0.002,
    eventDurationMs: current.eventDurationMs ?? 24 * 60 * 60 * 1000,
    maxActiveEvents: current.maxActiveEvents ?? 3,
  });
  return historyCount;
}

/** 将 JSON 文件恢复为空值，返回原有顶层记录数 */
function resetJsonFile(filePath, emptyValue) {
  let count = 0;
  if (fs.existsSync(filePath)) {
    try {
      const current = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      count = Array.isArray(current)
        ? current.length
        : current && typeof current === 'object'
          ? Object.keys(current).length
          : 0;
    } catch (err) {
      logger.warn(`[诸天初始化] ${filePath} 已损坏，将直接重置`, err);
    }
  } else {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  writeJson(filePath, emptyValue);
  return count;
}

/**
 * 从全局仙宠列表中移除玩家创造的仙宠，保留内置仙宠。
 * 玩家创造仙宠的标记：desc 含「创造的专属仙宠」（见 #创造仙宠 指令）。
 * 注意：仙宠列表.json 同时承载内置仙宠，绝不可整文件清空，否则所有内置仙宠都会消失。
 * 返回移除数量，并同步刷新内存 data.xianchon。
 */
function purgeCustomXianchong() {
  const file = path.join(__PATH.lib_path, '仙宠列表.json');
  if (!fs.existsSync(file)) return 0;
  let list = [];
  try {
    list = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (err) {
    logger.error('[诸天初始化] 读取仙宠列表失败', err);
    return 0;
  }
  if (!Array.isArray(list)) return 0;
  const before = list.length;
  const kept = list.filter(
    p => !(p && p.desc && typeof p.desc === 'string' && p.desc.includes('创造的专属仙宠'))
  );
  const removed = before - kept.length;
  if (removed > 0) {
    writeJson(file, kept);
    if (data.xianchon) data.xianchon = kept;
  }
  return removed;
}

/** 若文件/目录存在则备份到目标目录 */
function backupIfExist(src, destDir) {
  if (!fs.existsSync(src)) return;
  const dest = path.join(destDir, path.basename(src));
  fs.cpSync(src, dest, { recursive: true });
}

/** 批量删除 redis key，返回删除数量 */
async function purgeRedis() {
  let total = 0;
  for (const pattern of REDIS_PATTERNS) {
    try {
      const keys = await redis.keys(pattern);
      if (!keys || keys.length === 0) continue;
      // 分批删除，避免单次命令过大
      for (let i = 0; i < keys.length; i += 100) {
        const chunk = keys.slice(i, i + 100);
        await redis.del(chunk);
        total += chunk.length;
      }
    } catch (err) {
      logger.error(`[诸天初始化] 清理redis失败: ${pattern}`, err);
      throw err;
    }
  }
  return total;
}

/** 权限校验：机器人主人 或 修仙管理员 */
function isXiuxianMaster(e) {
  if (e.isMaster) return true;
  const set = config.getConfig('xiuxian', 'xiuxian') || {};
  const masterList = set.Master || [];
  const userQQ = e.user_id.toString().replace('qg_', '');
  return masterList.includes(userQQ);
}

/** 读取公告群列表（Era.notifyGroups，字符串数组） */
function getNotifyGroups() {
  const set = config.getConfig('xiuxian', 'xiuxian') || {};
  return (set?.Era?.notifyGroups || []).map(g => String(g));
}

/** 将指令所在群覆盖设为唯一公告群，成功时返回群号。 */
function setCurrentNotifyGroup(e) {
  if (e?.group_id === undefined || e.group_id === null || e.group_id === '') return null;
  const groupId = String(e.group_id);
  try {
    const set = config.getConfig('xiuxian', 'xiuxian') || {};
    set.Era = set.Era || {};
    set.Era.notifyGroups = [groupId];
    config.setConfig('xiuxian', 'xiuxian', set);
    return groupId;
  } catch (err) {
    logger.error(`[诸天初始化] 设置当前公告群 ${groupId} 失败`, err);
    return null;
  }
}

// ==================== 插件类 ====================

export class GlobalInit extends plugin {
  constructor() {
    super({
      name: 'GlobalInit',
      dsc: '诸天初始化·超维真界灭维之战',
      event: 'message',
      priority: 50,
      rule: [
        { reg: '^#诸天初始化$', fnc: 'startInit' },
        { reg: '^#确认诸天初始化$', fnc: 'confirmInit' },
        { reg: '^#取消诸天初始化$', fnc: 'cancelInit' },
        { reg: '^#(同步|自动设置)公告群$', fnc: 'syncNotifyGroups' },
        { reg: '^#查看公告群$', fnc: 'viewNotifyGroups' },
        { reg: '^#选择难度(?:\\s*(简单|普通|困难))?$', fnc: 'selectDifficulty' },
      ],
    });
  }

  /** 设置全局寿元与往生难度。 */
  async selectDifficulty(e) {
    if (!isXiuxianMaster(e)) return false;

    const match = String(e.msg || '').match(/^#选择难度(?:\s*(简单|普通|困难))?$/);
    const difficultyName = match?.[1];
    const weimianFile = data.filePathMap.weimianList;

    try {
      const weimian = JSON.parse(fs.readFileSync(weimianFile, 'utf-8'));
      if (!difficultyName) {
        const current = resolveShouyuanDifficulty(weimian.往生系统);
        await e.reply([
          `当前难度：${current.name}`,
          '简单：不随时间扣除寿元，寿元耗尽不进入轮回',
          '普通：随时间扣除寿元，寿元耗尽不进入轮回',
          '困难：随时间扣除寿元，寿元耗尽进入轮回',
          '使用：#选择难度 简单/普通/困难',
        ].join('\n'));
        return true;
      }

      weimian.往生系统 = SHOUYUAN_DIFFICULTIES[difficultyName];
      writeJson(weimianFile, weimian);
      const messages = {
        简单: [
          '【诸天难度·大道垂怜】',
          '',
          '天道法则悄然改写，岁月不再侵蚀众生的寿数。',
          '修士可从容问道，不必担忧寿元枯竭后被迫踏入轮回。',
          '',
          '寿元随时间流逝：关闭',
          '寿元耗尽强制轮回：关闭',
          '',
          '注意：战败、位面穿梭陨落或管理员发起的轮回，仍按原有规则执行。',
        ],
        普通: [
          '【诸天难度·岁月留痕】',
          '',
          '时光长河恢复流动，修士的寿元将随岁月逐渐消逝。',
          '纵使寿数归零，天道也不会强行接引魂魄进入轮回往生路。',
          '',
          '寿元随时间流逝：开启',
          '寿元耗尽强制轮回：关闭',
          '',
          '修士仍需寻找延寿机缘，但不会因寿元耗尽被强制转世。',
        ],
        困难: [
          '【诸天难度·生死轮转】',
          '',
          '大道无情，岁月如刀。修士的寿元将随时间不断流逝。',
          '寿数归零之时，魂魄会被古地府接引，强制踏上轮回往生路。',
          '',
          '寿元随时间流逝：开启',
          '寿元耗尽强制轮回：开启',
          '轮回救援期限：五分钟',
          '',
          '斩道王者、真一境或花粉圣者及以上可强闯轮回路救人；',
          '若轮回路由大帝、极道至尊或花粉天尊执掌，往生与否将由执掌者裁定。',
        ],
      };
      await e.reply([
        ...messages[difficultyName],
        '',
        `全服往生难度已设为「${difficultyName}」。`,
      ].join('\n'));
    } catch (err) {
      logger.error('[往生系统] 设置难度失败', err);
      await e.reply('设置难度失败，请检查位面数据文件。');
    }
    return true;
  }

  /** 📡 将当前群设为唯一公告群 */
  async syncNotifyGroups(e) {
    if (!isXiuxianMaster(e)) return false;

    const groupId = setCurrentNotifyGroup(e);
    if (!groupId) {
      await e.reply('请在群聊中发送 #同步公告群。');
      return true;
    }

    await e.reply(
      [
        '📡【诸天坐标 · 归档】',
        '',
        `已将当前群 ${groupId} 设为唯一公告群。`,
        '',
        '后续使用 Era.notifyGroups 的通知只会发送到本群。',
      ].join('\n')
    );
    return true;
  }

  /** 📜 查看公告群 */
  async viewNotifyGroups(e) {
    if (!isXiuxianMaster(e)) return false;
    const groups = getNotifyGroups();
    if (groups.length === 0) {
      await e.reply('📜 天道公告名录为空。请在目标群发送 #同步公告群。');
      return true;
    }
    await e.reply(
      [
        `📜【天道公告名录】共 ${groups.length} 方世界：`,
        groups.join('、'),
        '',
        '请在目标群发送 #同步公告群，可将公告群切换到该群。',
      ].join('\n')
    );
    return true;
  }

  /** 🌑 发起灭维之战（二次确认） */
  async startInit(e) {
    if (!isXiuxianMaster(e)) return false;

    const groupId = setCurrentNotifyGroup(e);
    if (!groupId) {
      await e.reply('请在群聊中发送 #诸天初始化；公告群设置失败时不会发起初始化。');
      return true;
    }

    const userQQ = e.user_id.toString().replace('qg_', '');
    const now = Date.now();
    for (const [qq, startedAt] of pendingConfirm) {
      if (now - startedAt > CONFIRM_TIMEOUT) pendingConfirm.delete(qq);
    }
    pendingConfirm.set(userQQ, now);

    await e.reply(
      [
        '【超维真界 · 灭维预警】',
        '',
        '超维真界之外，一尊无形无质的存在正缓缓睁开眼睛——',
        '原初之主，自「无」中走出，向「有」而行。',
        '',
        '一旦灭维之战开启，将不可逆地祭掉：',
        '　所有玩家存档　所有纳戒',
        '　所有装备　　　所有小世界与内景地',
        '　所有药效　　　所有宗门',
        '　所有交易论坛　所有锻炉与命名装备',
        '　所有任务缓存　天地榜与道法名单',
        '　所有亲密度　　所有师徒名分',
        '　若陀龙王　　　全部修仙redis',
        '　自创功法帝经　玩家所创仙宠',
        '　时代年份归零　位面秩序重演',
        '　旧纪元位面事件全部抹去',
        '　再入仙途冷却设为24小时',
        '',
        '执行前将自动备份至 _backups/ 目录。',
        `修仙公告群 已设为当前群：${groupId}。`,
        '灭维播报仅发送到当前群，不会通知其他群。',
        '',
        '若道心已定，请在 60 秒内发送：#确认诸天初始化',
        '若心生悔意，请发送：#取消诸天初始化',
      ].join('\n')
    );
    return true;
  }

  /** 🕊️ 取消灭维 */
  async cancelInit(e) {
    if (!isXiuxianMaster(e)) return false;
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!pendingConfirm.has(userQQ)) {
      await e.reply('🍃 并无待执行的灭维之战，诸天依旧安宁。');
      return true;
    }
    pendingConfirm.delete(userQQ);
    await e.reply('原初之主收回了目光，超维真界躲过一劫……此界众生，浑然不觉。');
    return true;
  }

  /** ☄️ 执行灭维之战 */
  async confirmInit(e) {
    if (!isXiuxianMaster(e)) return false;

    const userQQ = e.user_id.toString().replace('qg_', '');
    const startAt = pendingConfirm.get(userQQ);
    if (!startAt) {
      await e.reply('未曾发起灭维之战，请先发送：#诸天初始化');
      return true;
    }
    if (Date.now() - startAt > CONFIRM_TIMEOUT) {
      pendingConfirm.delete(userQQ);
      await e.reply('时光长河流转，灭维预警已然失效，请重新发起：#诸天初始化');
      return true;
    }

    const groupId = setCurrentNotifyGroup(e);
    if (!groupId) {
      await e.reply('请在群聊中发送 #确认诸天初始化；公告群设置失败时不会执行初始化。');
      return true;
    }

    pendingConfirm.delete(userQQ);

    if (isGlobalInitRunning()) {
      await e.reply('灭维之战已在执行中，不可重复祭天；请稍候再试。');
      return true;
    }
    beginGlobalInit();

    const failures = [];
    const stats = {};

    try {
    // ---------- 序章 ----------
    await e.reply(
      [
        '【超维真界 · 灭维之战】',
        '',
        '轰——！',
        '诸天震动，万道悲鸣！',
        '原初之主抬起手，从无到有，从有到无，循环往复——',
        '祂开始祭掉一切。',
        '',
        '一维……十维……千维……亿万维度，正在被逐一抹去……',
      ].join('\n')
    );

    // ---------- 步骤0：备份 ----------
    try {
      const ts = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14);
      const backupDir = path.join(__PATH.data_path, '..', '..', '_backups', `global_init_${ts}`);
      fs.mkdirSync(backupDir, { recursive: true });

      for (const [, getDir] of PLAYER_DIRS) backupIfExist(getDir(), backupDir);
      for (const [, getFile] of PLAYER_JSON_FILES) backupIfExist(getFile(), backupDir);
      backupIfExist(__PATH.qinmidu, backupDir);
      backupIfExist(__PATH.shitu, backupDir);
      backupIfExist(path.join(__PATH.Exchange, 'Boss_list.json'), backupDir);
      backupIfExist(path.join(__PATH.lib_path, '小世界列表.json'), backupDir);
      backupIfExist(path.join(__PATH.lib_path, '玩家自创帝经.json'), backupDir);
      backupIfExist(path.join(__PATH.lib_path, '仙宠列表.json'), backupDir);
      backupIfExist(data.filePathMap.weimianList, backupDir);
      backupIfExist(DIMENSION_GUARD_STATE_FILE, backupDir);
      backupIfExist(REALM_EVENTS_FILE, backupDir);
      backupIfExist(path.join(__PATH.data_path, 'foreign_imperial_pass.json'), backupDir);
      backupIfExist(path.join(__PATH.data_path, 'innate_treasure_state.json'), backupDir);
      backupIfExist(path.join(__PATH.data_path, 'plane_rift_festival.json'), backupDir);
      stats.backup = backupDir;
      logger.mark(`[诸天初始化] 数据已备份至: ${backupDir}`);
    } catch (err) {
      logger.error('[诸天初始化] 备份失败', err);
      await e.reply('时光炉未能收走此界烙印（备份失败），灭维之战中止！诸天暂得喘息。');
      return true;
    }

    await common.sleep(1500);

    // ---------- 步骤1：众生归无（玩家五件套 + 宗门目录） ----------
    try {
      for (const [label, getDir] of PLAYER_DIRS) {
        stats[label] = clearJsonDir(getDir());
      }
    } catch (err) {
      failures.push('玩家数据');
      logger.error('[诸天初始化] 清理玩家数据失败', err);
    }

    for (const [label, getFile, emptyValue] of PLAYER_JSON_FILES) {
      try {
        stats[label] = resetJsonFile(getFile(), emptyValue);
      } catch (err) {
        failures.push(label);
        logger.error(`[诸天初始化] 清理${label}失败`, err);
      }
    }

    // 自创帝经（全局列表）归空 —— 玩家自创功法存于 player.json 功法数组，已随玩家存档目录清空
    try {
      const dijingFile = path.join(__PATH.lib_path, '玩家自创帝经.json');
      const dijingCount = Array.isArray(data.dijingList) ? data.dijingList.length : 0;
      if (fs.existsSync(dijingFile)) writeJson(dijingFile, []);
      data.dijingList = [];
      stats['自创帝经'] = dijingCount;
    } catch (err) {
      failures.push('自创帝经');
      logger.error('[诸天初始化] 清理自创帝经失败', err);
    }

    // 玩家创造的仙宠（从全局仙宠列表精准过滤，保留内置仙宠）
    try {
      stats['创造仙宠'] = purgeCustomXianchong();
    } catch (err) {
      failures.push('创造仙宠');
      logger.error('[诸天初始化] 清理创造仙宠失败', err);
    }

    // 小世界列表整体归空
    try {
      const swFile = path.join(__PATH.lib_path, '小世界列表.json');
      const swCount = Array.isArray(data.xiaoshijie) ? data.xiaoshijie.length : 0;
      writeJson(swFile, []);
      data.xiaoshijie = [];
      stats['小世界'] = swCount;
    } catch (err) {
      failures.push('小世界列表');
      logger.error('[诸天初始化] 清理小世界失败', err);
    }

    // 异域远征（帝关叩关）状态归零
    try {
      const fipFile = path.join(__PATH.data_path, 'foreign_imperial_pass.json');
      writeJson(fipFile, {
        version: 1,
        status: 'dormant',
        campaign: 0,
        wave: 0,
        lastCheckedWorldYear: null,
        nextWaveYear: null,
        active: null,
        prestige: {},
        prisoners: [],
        history: [],
      });
    } catch (err) {
      failures.push('异域远征');
      logger.error('[诸天初始化] 清理异域远征状态失败', err);
    }

    // 先天至宝全局状态归零（owners/equipped/decree/landscapeRealms）
    try {
      const itsFile = path.join(__PATH.data_path, 'innate_treasure_state.json');
      writeJson(itsFile, {
        owners: {},
        equipped: {},
        decree: null,
        landscapeRealms: [],
      });
    } catch (err) {
      failures.push('先天至宝状态');
      logger.error('[诸天初始化] 清理先天至宝状态失败', err);
    }

    // 位面裂隙庆典状态归零（pity/activeRifts/history）
    try {
      const prfFile = path.join(__PATH.data_path, 'plane_rift_festival.json');
      writeJson(prfFile, getDefaultRiftState());
    } catch (err) {
      failures.push('位面裂隙庆典');
      logger.error('[诸天初始化] 清理位面裂隙庆典失败', err);
    }

    // 命名装备内存缓存同步归零（custom.json 已由 PLAYER_JSON_FILES 覆写为空数组）
    try {
      if (Array.isArray(data.namegive)) data.namegive = [];
    } catch (err) {
      failures.push('命名装备缓存');
      logger.error('[诸天初始化] 清理命名装备缓存失败', err);
    }

    await e.reply(
      [
        '🌫️【第一祭 · 众生归无】',
        '',
        `${stats['玩家存档'] ?? 0} 份修士真灵，尽数散于原初之海。`,
        `${stats['纳戒'] ?? 0} 枚纳戒崩解，万古珍藏化作最初的尘埃。`,
        `${stats['装备'] ?? 0} 件神兵折戟，帝兵成灰，回归道则。`,
        `${stats['小世界'] ?? 0} 方小世界如泡沫般破灭，${stats['内景地'] ?? 0} 座内景地崩塌成虚无。`,
        `${stats['丹药药效'] ?? 0} 份丹药药力溃散，万药失效，丹香散尽。`,
        `${stats['自创帝经'] ?? 0} 部无上帝经自史河中抹去，再无大帝独断万古。`,
        `${stats['创造仙宠'] ?? 0} 只玩家所创仙宠重归混沌，天地灵兽血脉归一。`,
        `${(stats['交易行'] ?? 0) + (stats['交易论坛'] ?? 0)} 条交易与论坛记录消散，锻炉、任务、榜单与道法名录一并归零。`,
      ].join('\n')
    );

    await common.sleep(1500);

    // ---------- 步骤2：人间断代（亲密度/师徒/若陀） ----------
    try {
      const qinmiduFile = path.join(__PATH.qinmidu, 'qinmidu.json');
      if (fs.existsSync(qinmiduFile)) writeJson(qinmiduFile, []);
    } catch (err) {
      failures.push('亲密度');
      logger.error('[诸天初始化] 清理亲密度失败', err);
    }

    try {
      const shituFile = path.join(__PATH.shitu, 'shitu.json');
      if (fs.existsSync(shituFile)) writeJson(shituFile, []);
    } catch (err) {
      failures.push('师徒');
      logger.error('[诸天初始化] 清理师徒失败', err);
    }

    try {
      const bossFile = path.join(__PATH.Exchange, 'Boss_list.json');
      if (fs.existsSync(bossFile)) writeJson(bossFile, []);
    } catch (err) {
      failures.push('若陀龙王');
      logger.error('[诸天初始化] 清理若陀龙王失败', err);
    }

    await e.reply(
      [
        '【第二祭 · 人间断代】',
        '',
        `诸天万教、${stats['宗门'] ?? 0} 座宗门山门崩塌，道统在此断绝。`,
        '红尘情缘、道侣白首，皆成过眼云烟。',
        '传道之恩、师徒之义，随维度一同湮灭。',
        '若陀龙王发出最后一声悲鸣，沉入永寂之界。',
      ].join('\n')
    );

    await common.sleep(1500);

    // ---------- 步骤3：天地法则（redis / 时代 / 位面 / 位面事件） ----------
    try {
      stats.redis = await purgeRedis();
    } catch {
      failures.push('redis烙印');
    }

    try {
      const set = config.getConfig('xiuxian', 'xiuxian') || {};
      set.CD = set.CD || {};
      set.CD.reborn = 24 * 60;
      set.Era = set.Era || {};
      set.Era.current = { index: 0, years: 0, epoch: 1 };
      config.setConfig('xiuxian', 'xiuxian', set);
    } catch (err) {
      failures.push('时代年份');
      logger.error('[诸天初始化] 重置时代失败', err);
    }

    try {
      const weimianFile = data.filePathMap.weimianList;
      resetWeimianState(weimianFile);
    } catch (err) {
      failures.push('位面状态');
      logger.error('[诸天初始化] 重置位面状态失败', err);
    }

    try {
      writeJson(DIMENSION_GUARD_STATE_FILE, createDimensionGuardState());
    } catch (err) {
      failures.push('维度镇守状态');
      logger.error('[诸天初始化] 重置维度镇守状态失败', err);
    }

    try {
      stats['位面事件'] = resetRealmEvents(REALM_EVENTS_FILE);
    } catch (err) {
      failures.push('位面事件');
      logger.error('[诸天初始化] 重置位面事件失败', err);
    }

    await e.reply(
      [
        '【第三祭 · 法则湮灭】',
        '',
        `${stats.redis ?? 0} 道天地烙印（redis）被原初之主一并祭去。`,
        '时光长河倒卷，岁月归零——神话时代 · 第一纪元 · 元年。',
        '再入仙途冷却重定为 24 小时。',
        '诸天位面恢复完整，帝尊归来，成仙路与仙古秘境重归沉寂。',
        `${stats['位面事件'] ?? 0} 条旧纪元位面事件自史河中抹去。`,
      ].join('\n')
    );

    await common.sleep(1500);

    // ---------- 终章 ----------
    const tail = [
      '【道化万千 · 新纪元】',
      '',
      '灭维之后，并非死寂。',
      '',
      '沧海成尘，雷电枯竭——',
      '旧世的繁华尽数化作灰烬，唯余一片破败。',
      '',
      '然而，从破败中崛起，在寂灭中复苏；',
      '混沌深处，传出了第一声道音：',
      '天地间正在诞生至宝，道生一，一生二，二生三，三生万物。',
      '道化万千，诸天重演，洪荒复苏，仙路重铸。',
      '',
      '超维真界，已然重开。',
      '静待有缘人，踏出问道的第一步。',
      '',
      '永恒未知之地上，一位独断万古的背影轻声开口：',
      '　「茫茫诸天，定有来者。」',
    ];

    tail.push('', `旧界烙印封存于：${stats.backup}`);
    if (failures.length > 0) {
      tail.push('', `以下残余未能尽祭，请手动查验：${failures.join('、')}`);
    }
    tail.push('', '建议重启机器人，以使时代定时任务与内存缓存彻底焕新。');

    await e.reply(tail.join('\n'));
    logger.mark(
      `[诸天初始化] 灭维之战完成 by ${userQQ}，统计: ${JSON.stringify(stats)}，失败项: ${failures.join(',') || '无'}`
    );
    } catch (err) {
      // 整体兜底：任一步骤外抛错（如 e.reply 被风控）时中止并提示恢复入口，避免"半清空"
      logger.error('[诸天初始化] 灭维之战执行中断', err);
      try {
        await e.reply(
          [
            '【超维真界 · 灭维中断】',
            '',
            '灭维之战在执行中遭遇未知反噬，流程已中止。',
            `旧界烙印封存于：${stats.backup || '（备份未完成，请查看后台日志）'}`,
            '建议重启机器人，并从备份目录手动恢复受影响数据。',
          ].join('\n')
        );
      } catch {
        // 回复失败不阻塞锁释放
      }
    } finally {
      endGlobalInit();
    }
    return true;
  }
}

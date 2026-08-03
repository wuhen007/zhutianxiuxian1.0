import { plugin, verc, data, config } from '../../api/api.js';
import fs from 'fs';
import path from 'path';

import {
  Read_player,
  existplayer,
  isNotNull,
  sleep,
  exist_najie_thing,
  Add_najie_thing,
  Read_najie,
  Write_najie,
  zd_battle,
  Add_HP,
  ForwardMsg,
  Read_equipment,
  Write_equipment,
} from '../../model/xiuxian.js';

import {
  Add_灵石,
  Add_修为,
   Add_血气,
   Add_寿元,
  exist_hunyin,
  find_qinmidu,
  add_qinmidu,
  Goweizhi,
  Write_player,
  xunbaoweizhi,
  Go,
  channel,
  Read_renwu,
  Write_renwu,
  find_renwu,
} from '../../model/xiuxian.js';
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";
import { XianguTribulation } from "./xianguTribulation.js";
import {
  ensureXianqiState,
  getXianqiStrands,
  grantXianqi,
} from '../../model/xianguXianqi.js';
import {
  getMinggeEffects,
  grantMinggePotential,
} from '../../model/mingge.js';
import {
  drawXianguSeed,
  findXianguTopSeed,
  grantXianguSeed,
  normalizeXianguSeedName,
  resolveXianguSeedExtremeName,
  shouldDropXianguSeed,
} from './xianguSeed.js';
import {
  buildXianguRunSummary,
  calculateEvacuationDuration,
  clearXianguSessionState,
  createEvacuationState,
  createXianguRun,
  getXianguCurrentHp,
  parseEvacuationState,
  validateEvacuationState,
} from './xianguEvacuation.js';
import {
  XIANGU_MARROW_POOL_KIND,
  XIANGU_MARROW_POOL_NAME,
  calculateXianguMarrowPoolRewards,
  createXianguFragmentSnapshot,
  createXianguExitPositions,
  ensureXianguExitConnectivity,
  getXianguMarrowPoolTrapChance,
  pickDifferentXianguFragment,
  placeXianguMarrowPool,
  restoreXianguFragmentSnapshot,
  resolveXianguMarrowPoolConfig,
  resolveXianguFragmentSize,
} from './xianguMap.js';
import {
  applyXianguHeavyInjury,
  buildXianguArenaRewardPlan,
  buildXianguBattleSides,
  getXianguExploreEfficiency,
  recordXianguArenaWin,
  resolveXianguLeaderWinner,
} from './xianguCombat.js';

const XIANGU_ACTIVE_PLAYERS_KEY = 'xiuxian:xiangu:player_set';
const XIANGU_RELEASE_LOCK_SCRIPT = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

function xianguPlayerRedisKey(playerId, suffix) {
  return `xiuxian:player:${playerId}:${suffix}`;
}

function xianguEvacuationKey(playerId) {
  return xianguPlayerRedisKey(playerId, 'xiangu_evacuation');
}

function xianguEvacuationLockKey(playerId) {
  return xianguPlayerRedisKey(playerId, 'xiangu_evacuation_lock');
}

async function releaseXianguEvacuationLock(lockKey, token) {
  try {
    await redis.eval(XIANGU_RELEASE_LOCK_SCRIPT, {
      keys: [lockKey],
      arguments: [token],
    });
  } catch (error) {
    console.error('释放仙古秘境撤离锁失败:', error);
  }
}

async function readXianguNajie(playerId) {
  try {
    return await Read_najie(playerId);
  } catch (error) {
    console.error(`读取玩家${playerId}的仙古秘境纳戒统计失败:`, error);
    return {};
  }
}

async function clearXianguRedisSession(playerId, legacyId = playerId) {
  const ids = [...new Set([String(playerId), String(legacyId)])];
  const suffixes = [
    'xiangu_evacuation',
    'xianguMoveCD',
    'xianguExploreCD',
    'xianguOptions',
  ];
  const operations = [
    ...ids.flatMap(id => suffixes.map(suffix => redis.del(xianguPlayerRedisKey(id, suffix)))),
    ...ids.map(id => redis.sRem(XIANGU_ACTIVE_PLAYERS_KEY, id)),
  ];
  const results = await Promise.allSettled(operations);
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length > 0) {
    console.error(`清理仙古秘境Redis临时状态时有${failures.length}项失败`);
  }
}

async function cancelXianguEvacuation(playerId) {
  const lockKey = xianguEvacuationLockKey(playerId);
  const lockToken = `action:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const lockAcquired = await redis.set(lockKey, lockToken, { EX: 10, NX: true });
  if (!lockAcquired) return { busy: true, cancelled: false };

  try {
    const cancelled = Boolean(await redis.del(xianguEvacuationKey(playerId)));
    return { busy: false, cancelled };
  } finally {
    await releaseXianguEvacuationLock(lockKey, lockToken);
  }
}

async function prepareXianguAction(playerId) {
  const interruption = await cancelXianguEvacuation(playerId);
  if (interruption.busy) return { ...interruption, player: null };
  return {
    ...interruption,
    player: await Read_player(playerId),
  };
}

async function prepareXianguMutation(e, playerId, actionName) {
  const actionState = await prepareXianguAction(playerId);
  if (actionState.busy) {
    await e.reply(`【撤离结算中】${actionName}未执行，请等待撤离结果。`);
    return null;
  }
  if (!actionState.player?.in_xiangu) {
    await e.reply(`【已离开仙古秘境】${actionName}未执行。`);
    return null;
  }
  if (actionState.cancelled) {
    await e.reply(`【撤离中断】你选择${actionName}，撤离通道随之消散。`);
  }
  return actionState.player;
}

async function updateXianguPlayerUnderLock(playerId, updater) {
  const lockKey = xianguEvacuationLockKey(playerId);
  const lockToken = `system:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  let lockAcquired = false;
  for (let attempt = 0; attempt < 10 && !lockAcquired; attempt++) {
    lockAcquired = Boolean(await redis.set(lockKey, lockToken, { EX: 10, NX: true }));
    if (!lockAcquired) await sleep(50);
  }
  if (!lockAcquired) return false;

  try {
    const player = await Read_player(playerId);
    if (!player?.in_xiangu) return false;
    await updater(player);
    await Write_player(playerId, player);
    return true;
  } finally {
    await releaseXianguEvacuationLock(lockKey, lockToken);
  }
}

async function setXianguCooldown(playerId, legacyId, timestamp) {
  const ids = [...new Set([String(playerId), String(legacyId)])];
  await Promise.all(ids.map(id => redis.set(xianguPlayerRedisKey(id, 'xianguCD'), String(timestamp))));
}

function getXianguEvacuationAnchor(player = {}) {
  const map = player.xiangu_realm_map;
  const mapPosition = map?.playerPos;
  const x = Number(mapPosition?.x ?? player.xiangu_pos_x);
  const y = Number(mapPosition?.y ?? player.xiangu_pos_y);
  const isLegacyCore = player.xiangu_location === '核心区域' && map?.fragmentId !== 'xiangu_core';
  return {
    fragmentId: isLegacyCore
      ? 'xiangu_core'
      : map?.fragmentId || `legacy_${player.xiangu_location || 'unknown'}`,
    position: {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    },
  };
}

function getXianguSecretConfig() {
  try {
    const configPath = data.filePathMap.xianguSecretPlace || (
      data.filePathMap.Level
        ? path.resolve(data.filePathMap.Level, '..', '..', '..', 'data', 'xianguSecretPlace.json')
        : null
    );
    if (!configPath || !fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    console.error('读取仙古秘境配置失败:', error);
    return {};
  }
}

async function grantXianguGrowthRewards(player, playerId, rewards = {}) {
  const result = { xiuwei: 0, xueqi: 0, lingshi: 0 };
  if (Number(rewards.xiuwei) > 0) {
    result.xiuwei = await Add_修为(playerId, rewards.xiuwei);
    player.修为 = (Number(player.修为) || 0) + result.xiuwei;
  }
  if (Number(rewards.xueqi) > 0) {
    result.xueqi = Math.trunc(rewards.xueqi);
    await Add_血气(playerId, result.xueqi);
    player.血气 = (Number(player.血气) || 0) + result.xueqi;
  }
  if (Number(rewards.lingshi) > 0) {
    result.lingshi = await Add_灵石(playerId, rewards.lingshi);
    player.灵石 = (Number(player.灵石) || 0) + result.lingshi;
  }
  return result;
}

async function addXianguSpoil(playerId, name, quantity = 1, desc = '仙古秘境战利品') {
  const najie = await Read_najie(playerId);
  najie.材料 ||= [];
  const existing = najie.材料.find(item => item.name === name);
  if (existing) existing.数量 = (Number(existing.数量) || 0) + quantity;
  else najie.材料.push({ name, 数量: quantity, islockd: 0, desc });
  await Write_najie(playerId, najie);
}

function getXianguCooldownHours(xianguConfig = getXianguSecretConfig()) {
  const hours = Number(
    xianguConfig?.撤离配置?.冷却时间 ?? xianguConfig?.准入条件?.冷却时间
  );
  return Number.isFinite(hours) && hours > 0 ? hours : 12;
}

export class xianguPlace extends plugin {
  constructor() {
    super({
  name: 'Yunzai_Bot_xianguPlace',
      dsc: '仙古秘境模块',
      event: 'message',
      priority: 600,
      rule: [
     
      {
    reg: '^#进入仙古秘境$',
    fnc: 'Goxiangu'
    },
    {
    reg: '^#离开仙古秘境$',
    fnc: 'LeaveXiangu'
    },
    {
    reg: '^#确认撤离$',
    fnc: 'ConfirmLeaveXiangu'
    },
    {
    reg: '^#紧急撤离$',
    fnc: 'EmergencyLeaveXiangu'
    },
    {
    reg: '^#秘境状态$',
    fnc: 'XianguStatus'
    },
    {
    reg: '^#秘境地图$',
    fnc: 'XianguMap'
    },
    {
    reg: '^#秘境探索$',
    fnc: 'XianguExplore'
    },
    {
    reg: '^[123]$',
    fnc: 'XianguExploreChoice'
    },
    {
    reg: '^#秘境目标$',
    fnc: 'XianguGoal'
    },
    {
    reg: '^#寻找NPC$',
    fnc: 'XianguFindNPC'
    },
    {
    reg: '^#秘境移动.*$',
    fnc: 'XianguMove'
    },
    {
    reg: '^#查看道种$',
    fnc: 'XianguViewSeeds'
    },
    {
    reg: '^#查看神火$',
    fnc: 'XianguViewShenhuo'
    },
    {
    reg: '^#借助(.+)道种点燃神火$|^#借助(.+)点燃神火$',
    fnc: 'XianguJieZhuDaoZhong'
    },
    {
    reg: '^#服用(.+)点燃神火$',
    fnc: 'XianguFuYongDanYao'
    },
    {
    reg: '^#点燃神火$',
    fnc: 'XianguIgniteShenhuo'
    },
    {
    reg: '^#祭炼真我$',
    fnc: 'XianguJilianZhenwo'
    },
    {
    reg: '^#以身为种$',
    fnc: 'XianguYiShenWeiZhong'
    },
    {
    reg: '^#秘境攻击.*$',
    fnc: 'XianguPvPAttack'
    },
    {
    reg: '^#秘境切磋.*$',
    fnc: 'XianguPvPSpar'
    },
    {
    reg: '^#查看凶名$',
    fnc: 'XianguInfamy'
    },
    {
    reg: '^#秘境悬赏.*$',
    fnc: 'XianguBounty'
    },
    {
    reg: '^#秘境杀戮榜$',
    fnc: 'XianguKillRank'
    },
    // ====== 步骤5：动态事件与NPC生态 ======
    {
    reg: '^#秘境事件$',
    fnc: 'XianguEventList'
    },
    {
    reg: '^#仙古擂台$',
    fnc: 'XianguArena'
    },
    {
    reg: '^#参与仙古擂台$',
    fnc: 'XianguArenaJoin'
    },
    {
    reg: '^#与NPC交谈$',
    fnc: 'XianguNPCTalk'
    },
    {
    reg: '^#向NPC购买.*$',
    fnc: 'XianguNPCBuy'
    },
    {
    reg: '^#攻击NPC$',
    fnc: 'XianguNPCAttack'
    },
    {
    reg: '^#查看阵营$',
    fnc: 'XianguFaction'
    },
    {
    reg: '^#献祭道种.*$',
    fnc: 'XianguOfferSeed'
    },
    // ====== NPC生态命令 ======
    {
    reg: '^#搜魂NPC$',
    fnc: 'XianguSoulSearchNPC'
    },
    {
    reg: '^#查看NPC好感$',
    fnc: 'XianguNPCRelation'
    },
    {
    reg: '^#NPC组队.*$',
    fnc: 'XianguNPCTeam'
    },
    {
    reg: '^#解除组队$',
    fnc: 'XianguNPCTeamLeave'
    },
    // ====== 阵营系统命令 ======
    {
    reg: '^#阵营任务$',
    fnc: 'XianguFactionQuest'
    },
    {
    reg: '^#阵营商店$',
    fnc: 'XianguFactionShop'
    },
    {
    reg: '^#阵营排行$',
    fnc: 'XianguFactionRank'
    },
    // ====== 终极版：六方向移动 + 神识推演 ======
    {
    reg: '^#上$',
    fnc: 'XianguRealmMove'
    },
    {
    reg: '^#下$',
    fnc: 'XianguRealmMove'
    },
    {
    reg: '^#左$',
    fnc: 'XianguRealmMove'
    },
    {
    reg: '^#右$',
    fnc: 'XianguRealmMove'
    },
    {
    reg: '^#左上$',
    fnc: 'XianguRealmMove'
    },
    {
    reg: '^#右上$',
    fnc: 'XianguRealmMove'
    },
    {
    reg: '^#秘境推演$',
    fnc: 'XianguDivineScan'
    }
      ],
    });
    // 启动动态事件定时器（模块加载时）
    startEventTimer();
  }

  async Goxiangu(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);

    if (player.in_xiangu) {
      const fragmentName = REALM_FRAGMENTS[player.xiangu_realm_map?.fragmentId]?.name;
      return e.reply([
        `【已在仙古秘境】`,
        `${player.名号}此刻仍在秘境之中，无需重复进入。`,
        `当前位置：${fragmentName || player.xiangu_location || '未知区域'}`,
        `正常撤离：抵达仙古花蕾核心后使用 #离开仙古秘境`,
        `受困时可使用 #紧急撤离`
      ].join('\n'));
    }

    // 境界检查 - 完美世界设定
    if (player.xiangulevel_id < 5) { // 铭文境以下
      return e.reply([
        `【仙古未开·境界不足】`,
        `${player.名号}仰望苍穹，欲入仙古秘境，`,
        `然秘境壁垒坚如磐石，非铭文境不可撼动！`,
        ``,
        `秘境规则：`,
        `「仙古秘境乃仙古纪元碎片，蕴含无上道则」`,
        `古史记载：`,
        `- 秘境压制一切高于神火境的存在`,
        `- 铭文境方可承受秘境法则威压`,
        `- 强闯者皆被秘境法则碾为齑粉`,
        ``,
        `当前境界：${data.xiangujinshi_list.find(l => l.level_id === player.xiangulevel_id)?.level || "未知"}`,
        `请先突破至铭文境再试！`
      ].join('\n'));
    }
    
    if (player.xiangulevel_id > 7) { // 尊者境以上
      return e.reply([
        `【境界超限·秘境排斥】`,
        `${player.名号}周身道则轰鸣，威压震碎虚空，`,
        `然仙古秘境法则显化，将其拒之门外！`,
        ``,
        `秘境规则：`,
        `「仙古秘境为年轻天骄试炼之地」`,
        `古史昭示：`,
        `- 尊者境以上威能会破坏秘境平衡`,
        `- 秘境法则压制一切高于神火境的存在`,
        `- 曾有古代怪胎压制境界进入，仍遭排斥`,
        `- 强行闯入将引发时空乱流，身死道消`,
        ``,
        `当前境界：${data.xiangujinshi_list.find(l => l.level_id === player.xiangulevel_id)?.level || "未知"}`,
        `请压制境界或另寻机缘！`
      ].join('\n'));
    }
    
    // 位面检查 - 完美世界设定
    if (player.power_place !== 2.5) { // 九天十地
      const placeNames = {
        '凡间': 0,
        '仙界': 1,
        '下界八域': 1.5,
        '遮天位面': 2,
        "九天十地": 2.5,
        '界海': 3,
        '时间长河': 4,
        '永恒未知之地': 5,
        '仙域': 6
      };
      
      const currentPlace = Object.entries(placeNames).find(([name, id]) => id === player.power_place)?.[0] || "未知位面";
      
      return e.reply([
        `【时空错乱·位面不符】`,
        `${player.名号}欲入仙古秘境，`,
        `却感天地法则排斥，时空扭曲！`,
        ``,
        `秘境规则：`,
        `「仙古秘境只在九天十地位面显现」`,
        `古史记载：`,
        `- 秘境入口位于三千州上空`,
        `- 唯有九天十地修士可感应秘境波动`,
        `- 异域修士曾尝试强行进入，遭天道反噬`,
        `- 秘境与九天十地大道共鸣，他界难寻`,
        ``,
        `当前位面：${currentPlace}`,
        `请先前往九天十地位面再尝试进入！`
      ].join('\n'));
    }
    
    // 读取位面数据
    let weimianData = {};
    try {
      const weimianPath = data.filePathMap.weimianList;
      if (fs.existsSync(weimianPath)) {
        const rawData = fs.readFileSync(weimianPath, 'utf8');
        weimianData = JSON.parse(rawData);
      } else {
        return e.reply('位面数据文件不存在，无法验证仙古秘境状态');
      }
    } catch (err) {
      console.error('读取位面数据失败:', err);
      return e.reply('读取位面数据失败，无法验证秘境状态');
    }
    
    // 检查秘境是否开启 - 完美世界设定
    if (weimianData.仙古秘境 !== 1) {
      return e.reply([
        `【仙古未开·时机未至】`,
        `${player.名号}立于三千州上空，`,
        `眸光如电，欲破开秘境壁垒！`,
        ``,
        `然，虚空寂寥，万道沉寂，`,
        `秘境壁垒坚如仙金，纹丝不动！`,
        ``,
        `秘境规则：`,
        `「仙古秘境开启需等待仙古花蕾绽放」`,
        `古史昭示：`,
        `- 秘境开启需三千道州气运汇聚`,
        `- 仙古花蕾绽放时，秘境门户方现`,
        `- 时机未至，纵仙王亦难强行开启`,
        `- 强行破壁将引动纪元反噬，道基崩毁`,
        ``,
        `当前状态：仙古花蕾未绽放`,
        `请耐心等待秘境自然开启之时`
      ].join('\n'));
    }

    // 检查CD时间
    const nowTime = Date.now();
    const lastEntryTime = await redis.get(xianguPlayerRedisKey(player_qq, 'xianguCD')) ||
      await redis.get(xianguPlayerRedisKey(usr_qq, 'xianguCD'));
    const cooldownHours = getXianguCooldownHours();
    const cooldownMs = cooldownHours * 60 * 60 * 1000;
    
    if (lastEntryTime && nowTime < parseInt(lastEntryTime) + cooldownMs) {
      const remainingMs = parseInt(lastEntryTime) + cooldownMs - nowTime;
      const hours = Math.floor(remainingMs / (60 * 60 * 1000));
      const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
      
      return e.reply([
        `【秘境休整·冷却中】`,
        `${player.名号}欲再入仙古秘境，`,
        `然秘境法则排斥，需休整恢复！`,
        ``,
        `秘境规则：`,
        `「秘境历练消耗巨大道源，需时间消化」`,
        `古史记载：`,
        `- 秘境中所得机缘需时间炼化`,
        `- 连续进入将引动秘境法则反噬`,
        `- 曾有天骄贪图机缘，连续进入而道基受损`,
        `- 秘境法则限制，${cooldownHours}小时内不可重复进入`,
        ``,
        `剩余冷却时间：${hours}小时${minutes}分钟`,
        `请耐心调息，巩固所得`
      ].join('\n'));
    }
    
    // 构建完美世界风格文案
    const ancientSites = [
      "真龙巢穴",
      "仙药园", 
      "天角蚁埋骨地",
      "十凶传承地",
      "仙王讲道台",
      "黑暗牢笼",
      "折仙咒遗迹"
    ];
    const randomSite = ancientSites[Math.floor(Math.random() * ancientSites.length)];
    
    const message = [
      `【仙古花蕾绽放·秘境开启】`,
      `${player.名号}立于三千州上空🌺`,
      `仙古花蕾绽放，霞光万道，瑞彩千条！`,
      `一朵巨大的花蕾在虚空中缓缓绽放，`,
      `每一片花瓣都承载着一个时代的气运！`,
      ``,
      `${player.名号}化作一道仙虹，顺着绽放的花瓣，踏入仙古秘境！`,
      ``,
      `秘境奇观`,
      `- 眼前浮现破碎的仙古纪元景象`,
      `- 真龙虚影横贯苍穹，雷帝宝术轰鸣`,
      `- 天角蚁力之极尽奥义显化虚空`,
      `- 仙药芬芳弥漫，不死物质浓郁如液`,
      `- 仙古遗民在秘境中繁衍生息`,
      ``,
      `秘境机缘`,
      `秘境深处，${randomSite}散发出诱人道韵：`,
      `- 十凶宝术残篇（真龙、雷帝、天角蚁等）`,
      `- 仙王传承古经（六道轮回仙王、无终仙王等）`,
      `- 各种仙种（世界树幼苗、宇宙雏形种等）`,
      `- 不死神药幼苗（白龟驮仙等）`,
      `- 纪元道则碎片（完整大道规则）`,
      ``,
      `秘境危险`,
      `然秘境中亦危机四伏：`,
      `- 仙古遗民敌视外来者，视其为入侵者`,
      `- 黑暗牢笼异动，不朽之王气息弥漫`,
      `- 折仙咒残留，触之即伤道基`,
      `- 秘境原住民中的天神、真神强者`,
      `- 其他州的天才初代、古代怪胎`,
      ``,
      `${player.名号}眸光坚定，`,
      `"这一世，我当踏出一条无敌路！"`,
      `身影没入秘境深处，开启新的传奇...`,
      ``,
      `【秘境状态】`,
      `位置：三千州上空 -> 仙古秘境`,
      `状态：秘境探索中（${cooldownHours}小时冷却）`,
      `提示：寻找适合自己的仙种，或以身为种！`,
      `撤离：核心区域使用 #离开仙古秘境，受困时使用 #紧急撤离`
    ].join('\n');

    const najie = await readXianguNajie(player_qq);

    // 每次进入都建立全新会话，避免沿用上一次的地图、选项或撤离状态。
    clearXianguSessionState(player);
    player.in_xiangu = true;
    player.xiangu_entry_time = nowTime;
    player.xiangu_gains = { daoyun: 0 };
    createXianguRun(player, najie, nowTime);
    initXianguRealmMap(player);

    await Write_player(player_qq, player);

    try {
      await clearXianguRedisSession(player_qq, usr_qq);
      await redis.sAdd(XIANGU_ACTIVE_PLAYERS_KEY, String(player_qq));
      await setXianguCooldown(player_qq, usr_qq, nowTime);
    } catch (redisError) {
      console.error('初始化仙古秘境Redis会话失败:', redisError);
    }
    
    await e.reply(message);
    return true;

  } catch (error) {
    console.error('进入仙古秘境失败:', error);
    await e.reply([
      `进入仙古秘境失败`,
      `秘境法则紊乱，时空通道崩溃！`,
      `错误信息: ${error.message}`,
      `请联系管理员查看日志`
    ].join('\n'));
    return false;
  }
}

  async LeaveXiangu(e) {
    return this.BeginXianguEvacuation(e, 'normal');
  }

  async EmergencyLeaveXiangu(e) {
    return this.BeginXianguEvacuation(e, 'emergency');
  }

  async BeginXianguEvacuation(e, mode) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      const evacuationKey = xianguEvacuationKey(player_qq);

      if (!player.in_xiangu) {
        await clearXianguRedisSession(player_qq, usr_qq);
        return e.reply([
          `【未入秘境·何来撤离】`,
          `${player.名号}此刻并不在仙古秘境中。`,
          `提示：使用 #进入仙古秘境 踏入秘境`
        ].join('\n'));
      }

      const existingRaw = await redis.get(evacuationKey);
      const existing = parseEvacuationState(existingRaw);
      const existingIsCurrent = existing &&
        existing.runId === player.xiangu_run?.runId &&
        Date.now() < existing.expiresAt;
      if (existingIsCurrent) {
        if (existing.mode !== mode) {
          const existingCommand = existing.mode === 'emergency' ? '#紧急撤离' : '#离开仙古秘境';
          return e.reply([
            `【已有撤离通道】`,
            `你正在进行${existing.mode === 'emergency' ? '紧急撤离' : '正常撤离'}。`,
            `请继续发送 ${existingCommand} 或 #确认撤离 完成当前撤离。`,
            `移动、探索或战斗会中断撤离。`
          ].join('\n'));
        }
        return this.ConfirmLeaveXiangu(e);
      }
      if (existingRaw) await redis.del(evacuationKey);

      const xianguConfig = getXianguSecretConfig();
      const evacuationConfig = xianguConfig.撤离配置 || {};
      const map = player.xiangu_realm_map;
      const coreFragmentId = evacuationConfig.正常撤离?.核心碎片 || 'xiangu_core';
      const anchor = getXianguEvacuationAnchor(player);

      if (mode === 'normal' && anchor.fragmentId !== coreFragmentId) {
        const fragmentName = REALM_FRAGMENTS[map?.fragmentId]?.name || player.xiangu_location || '未知区域';
        return e.reply([
          `【未至仙古花蕾·无法正常撤离】`,
          `${player.名号}试图接引秘境出口，却未能感应到核心法则。`,
          `当前碎片：${fragmentName}`,
          `正常撤离点：仙古花蕾·核心`,
          ``,
          `请循地图出口前往核心；若境界不足或地图受困，可使用 #紧急撤离。`
        ].join('\n'));
      }

      const now = Date.now();
      const najie = await readXianguNajie(player_qq);
      if (!player.xiangu_run?.runId) {
        createXianguRun(player, najie, player.xiangu_entry_time || now);
        await Write_player(player_qq, player);
      }
      const summary = buildXianguRunSummary(player, najie, now);
      const durationSeconds = calculateEvacuationDuration({
        mode,
        lootUnits: summary.lootUnits,
        config: evacuationConfig,
      });
      const state = createEvacuationState({
        player,
        mode,
        now,
        config: evacuationConfig,
        durationSeconds,
        fragmentId: anchor.fragmentId,
        position: anchor.position,
        currentHp: getXianguCurrentHp(player),
        lootUnits: summary.lootUnits,
        lootStats: {
          najieDelta: summary.najieDelta,
          seedCount: summary.seedCount,
          uniqueFound: summary.uniqueFound,
        },
      });
      const ttlSeconds = Math.max(1, Math.ceil((state.expiresAt - now) / 1000));
      await redis.set(evacuationKey, JSON.stringify(state), { EX: ttlSeconds });

      const command = mode === 'emergency' ? '#紧急撤离' : '#离开仙古秘境';
      return e.reply([
        mode === 'emergency' ? `【紧急撤离·强开虚空通道】` : `【仙古花蕾·撤离通道开启】`,
        mode === 'emergency'
          ? `${player.名号}燃烧秘境印记，强行锚定外界坐标！`
          : `${player.名号}立于仙古花蕾核心，引动归途法则！`,
        ``,
        `本轮新增纳戒物品：${summary.najieDelta}件`,
        `本轮获得道种：${summary.seedCount}枚`,
        `撤离准备时间：${durationSeconds}秒`,
        ``,
        `等待结束后再次发送 ${command} 或 #确认撤离。`,
        `移动、探索、主动交战或受到伤害都会中断撤离。`
      ].join('\n'));
    } catch (error) {
      console.error('开始仙古秘境撤离失败:', error);
      return e.reply(`撤离失败：${error.message}`);
    }
  }

  async ConfirmLeaveXiangu(e) {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    const evacuationKey = xianguEvacuationKey(player_qq);
    const lockKey = xianguEvacuationLockKey(player_qq);

    try {
      const rawState = await redis.get(evacuationKey);
      const state = parseEvacuationState(rawState);
      if (!state) {
        if (rawState) await redis.del(evacuationKey);
        return e.reply([
          `【尚未开始撤离】`,
          `正常撤离：在仙古花蕾核心发送 #离开仙古秘境`,
          `受困撤离：在任意区域发送 #紧急撤离`
        ].join('\n'));
      }

      const player = await Read_player(player_qq);
      const anchor = getXianguEvacuationAnchor(player);
      const xianguConfig = getXianguSecretConfig();
      const coreFragmentId = xianguConfig.撤离配置?.正常撤离?.核心碎片 || 'xiangu_core';
      const validation = validateEvacuationState(state, {
        player,
        runId: player?.xiangu_run?.runId,
        now: Date.now(),
        fragmentId: anchor.fragmentId,
        position: anchor.position,
        currentHp: getXianguCurrentHp(player),
        coreFragmentId,
      });

      if (!validation.ok) {
        if (validation.code === 'not_ready') {
          return e.reply([
            `【撤离通道尚未稳定】`,
            `还需等待 ${validation.remaining} 秒。`,
            `请留在原地，期间不要移动、探索或战斗。`
          ].join('\n'));
        }

        await redis.del(evacuationKey);
        if (validation.code === 'not_in_xiangu') {
          await redis.sRem(XIANGU_ACTIVE_PLAYERS_KEY, String(player_qq));
        }
        const reason = {
          expired: '撤离通道已经消散，请重新开始撤离。',
          run_mismatch: '撤离印记不属于当前这次秘境，会话已作废。',
          not_in_xiangu: '你已不在仙古秘境中，撤离状态已清理。',
          not_in_core: '你已离开仙古花蕾核心，正常撤离被中断。',
          moved: '你的位置发生变化，撤离通道被中断。',
          damaged: '你在读条期间受到伤害，撤离通道被中断。',
          missing: '撤离状态已经失效，请重新开始。',
        }[validation.code] || '撤离条件发生变化，请重新开始撤离。';
        return e.reply(`【撤离中断】${reason}`);
      }

      const lockToken = `${state.runId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
      const lockAcquired = await redis.set(lockKey, lockToken, { EX: 30, NX: true });
      if (!lockAcquired) {
        return e.reply('【撤离结算中】本次撤离正在处理，请勿重复发送。');
      }

      try {
        const latestPlayer = await Read_player(player_qq);
        const latestRawState = await redis.get(evacuationKey);
        const latestState = parseEvacuationState(latestRawState);
        const latestAnchor = getXianguEvacuationAnchor(latestPlayer);
        const latestValidation = validateEvacuationState(latestState, {
          player: latestPlayer,
          runId: latestPlayer?.xiangu_run?.runId,
          now: Date.now(),
          fragmentId: latestAnchor.fragmentId,
          position: latestAnchor.position,
          currentHp: getXianguCurrentHp(latestPlayer),
          coreFragmentId,
        });
        if (!latestValidation.ok) {
          if (latestValidation.code !== 'not_ready') await redis.del(evacuationKey);
          const waitMessage = latestValidation.code === 'not_ready'
            ? `撤离通道还需 ${latestValidation.remaining} 秒才能稳定。`
            : '撤离条件在结算前发生变化，本次撤离已中断。';
          return e.reply(`【撤离未完成】${waitMessage}`);
        }

        const finishedAt = Date.now();
        const najie = await readXianguNajie(player_qq);
        const summary = buildXianguRunSummary(latestPlayer, najie, finishedAt);
        if (summary.lootUnits > latestState.lootUnits) {
          await redis.del(evacuationKey);
          return e.reply([
            `【撤离中断·负载变化】`,
            `撤离期间又有机缘入手，原通道已无法承载当前收获。`,
            `请重新开始撤离，系统会按最新战利品计算时间。`
          ].join('\n'));
        }
        const totalExploreTime = Math.max(0, Math.floor(
          (finishedAt - (latestPlayer.xiangu_run?.startedAt || latestPlayer.xiangu_entry_time || finishedAt)) / 60000
        ));
        const savedInfamy = Number(latestPlayer.xiangu_infamy) || 0;
        const savedKills = Number(latestPlayer.xiangu_kills) || 0;
        summary.exitMode = latestState.mode;
        summary.exitReason = latestState.mode === 'emergency' ? 'emergency' : 'evacuated';
        summary.finishedAt = finishedAt;
        clearXianguSessionState(latestPlayer, summary);
        await Write_player(player_qq, latestPlayer);

        try {
          await clearXianguRedisSession(player_qq, usr_qq);
          await setXianguCooldown(player_qq, usr_qq, finishedAt);
        } catch (redisError) {
          console.error('清理仙古秘境Redis会话失败:', redisError);
        }

        const seedNames = Array.isArray(summary.seedNames) ? summary.seedNames : [];
        const cooldownHours = Number(xianguConfig.撤离配置?.冷却时间) || 12;
        return e.reply([
          latestState.mode === 'emergency' ? `【紧急撤离成功·脱离险境】` : `【撤离成功·重返九天】`,
          latestState.mode === 'emergency'
            ? `${latestPlayer.名号}在通道崩塌前冲出秘境，重新立于三千州上空。`
            : `${latestPlayer.名号}踏入仙古花蕾开启的归途，平安离开秘境。`,
          ``,
          `【本轮记录】`,
          `- 探索时间：${totalExploreTime}分钟`,
          `- 纳戒净增：${summary.najieDelta}件`,
          `- 获得道种：${summary.seedCount}枚${seedNames.length ? `（${seedNames.slice(0, 5).join('、')}${seedNames.length > 5 ? '等' : ''}）` : ''}`,
          `- 道韵领悟：${summary.daoyun}点`,
          `- 击败修士：${summary.killDelta}人`,
          `- 凶名变化：${summary.infamyDelta >= 0 ? '+' : ''}${summary.infamyDelta}`,
          ``,
          `累计凶名：${savedInfamy} | 累计击杀：${savedKills}`,
          `本轮奖励已在探索过程中实时入账。`,
          `冷却时间：${cooldownHours}小时`
        ].join('\n'));
      } finally {
        await releaseXianguEvacuationLock(lockKey, lockToken);
      }
    } catch (error) {
      console.error('确认仙古秘境撤离失败:', error);
      return e.reply(`确认撤离失败：${error.message}`);
    }
  }

  // 秘境状态查询
  async XianguStatus(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);

    // 检查秘境是否开启
    let weimianData = {};
    try {
      const weimianPath = data.filePathMap.weimianList;
      if (fs.existsSync(weimianPath)) {
        const rawData = fs.readFileSync(weimianPath, 'utf8');
        weimianData = JSON.parse(rawData);
      }
    } catch (err) {
      console.error('读取位面数据失败:', err);
    }

    const isXianguOpen = weimianData.仙古秘境 === 1;

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      await redis.sRem(XIANGU_ACTIVE_PLAYERS_KEY, String(player_qq));
      // 不在秘境中的状态显示
      const lastEntryTime = await redis.get(xianguPlayerRedisKey(player_qq, 'xianguCD')) ||
        await redis.get(xianguPlayerRedisKey(usr_qq, 'xianguCD'));
      const cooldownMs = getXianguCooldownHours() * 60 * 60 * 1000;
      let cooldownInfo = '';
      
      if (lastEntryTime && Date.now() < parseInt(lastEntryTime) + cooldownMs) {
        const remainingMs = parseInt(lastEntryTime) + cooldownMs - Date.now();
        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
        cooldownInfo = `冷却时间：${hours}小时${minutes}分钟`;
      } else {
        cooldownInfo = '冷却状态：可进入';
      }

      return e.reply([
        `【仙古秘境·状态面板】`,
        ``,
        `秘境状态：${isXianguOpen ? '【开启】仙古花蕾已绽放' : '【关闭】仙古花蕾含苞待放'}`,
        `玩家状态：未进入秘境`,
        ``,
        `准入条件`,
        `- 境界要求：铭文境 ~ 尊者境`,
        `- 位面要求：九天十地`,
        `- 秘境开启：${isXianguOpen ? '✓' : '✗'}`,
        ``,
        `${cooldownInfo}`,
        ``,
        `【古史记载】`,
        `"仙古秘境乃仙古纪元碎片，蕴含无上道则"`,
        `"每逢花蕾绽放之时，便是天骄崛起之机"`,
        ``,
        `${isXianguOpen ? 
          '【提示】使用 #进入仙古秘境 踏入秘境' : 
          '【提示】等待仙古花蕾绽放后再尝试进入'}`
      ].join('\n'));
    }

    // 在秘境中的状态显示
    const exploreTime = player.xiangu_entry_time ? 
      Math.floor((Date.now() - player.xiangu_entry_time) / 1000 / 60) : 0;
    const xianguGains = player.xiangu_gains || {};
    const currentNajie = await readXianguNajie(player_qq);
    if (!player.xiangu_run?.runId) {
      createXianguRun(player, currentNajie, player.xiangu_entry_time || Date.now());
      await Write_player(player_qq, player);
    }
    const runSummary = buildXianguRunSummary(
      player,
      currentNajie,
      Date.now()
    );
    
    await redis.sAdd(XIANGU_ACTIVE_PLAYERS_KEY, String(player_qq));
    const xianguPlayers = await redis.sCard(XIANGU_ACTIVE_PLAYERS_KEY);
    let evacuationState = parseEvacuationState(await redis.get(xianguEvacuationKey(player_qq)));
    if (evacuationState && Date.now() >= evacuationState.expiresAt) {
      await redis.del(xianguEvacuationKey(player_qq));
      evacuationState = null;
    }
    let evacuationInfo = '未开始';
    if (evacuationState) {
      const remaining = Math.max(0, Math.ceil((evacuationState.readyAt - Date.now()) / 1000));
      evacuationInfo = remaining > 0
        ? `${evacuationState.mode === 'emergency' ? '紧急撤离' : '正常撤离'}，剩余${remaining}秒`
        : `${evacuationState.mode === 'emergency' ? '紧急撤离' : '正常撤离'}已就绪，可发送 #确认撤离`;
    }

    return e.reply([
      `【仙古秘境·状态面板】`,
      ``,
      `秘境状态：${isXianguOpen ? '【开启】' : '【异常】'}`,
      `${player.名号}正处于秘境探索中`,
      ``,
      `【探索信息】`,
      `- 探索时间：${exploreTime}分钟`,
      `- 当前区域：${player.xiangu_location || '边缘区域'}`,
      `- 秘境玩家：${xianguPlayers}人`,
      `- 撤离状态：${evacuationInfo}`,
      ``,
      `【个人收获】`,
      `- 道韵领悟：${xianguGains.daoyun || 0}点`,
      `- 凶名值：${xianguGains.xiongmng || 0}`,
      `- 纳戒净增：${runSummary.najieDelta}件`,
      `- 获得道种：${runSummary.seedCount}枚`,
      `- 唯一机缘：${runSummary.uniqueFound}处`,
      ``,
      `【秘境提示】`,
      `- 使用 #秘境地图 查看可探索区域`,
      `- 使用 #离开仙古秘境 在核心区域撤离`,
      `- 无法抵达核心时可使用 #紧急撤离`,
      `- 秘境关闭前请务必安全撤离！`,
      ``,
      `【古史警示】`,
      `撤离读条期间必须留在原地并避免受伤`,
      `本轮奖励在探索过程中实时入账，撤离时生成收获记录`
    ].join('\n'));

  } catch (error) {
    console.error('查询秘境状态失败:', error);
    await e.reply([
      `查询秘境状态失败`,
      `错误信息: ${error.message}`
    ].join('\n'));
    return false;
  }
}

  // 秘境地图
  // 秘境地图★终极版★ 探索全图总览
  async XianguMap(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    if (!player.in_xiangu) {
      return e.reply([
        `【未入秘境·何来地图】`,
        `${player.名号}立于虚空，手中地图黯然无光，`,
        `"此乃仙古秘境专属地图，唯有进入秘境方能显现！"`,
        ``,
        `提示：使用 #进入仙古秘境 踏入秘境后查看`
      ].join('\n'));
    }

    // 如果没有碎片地图，初始化
    if (!player.xiangu_realm_map) {
      const actionState = await prepareXianguAction(player_qq);
      if (actionState.busy) return e.reply('【撤离结算中】地图初始化未执行。');
      player = actionState.player;
      if (!player?.in_xiangu) return e.reply('【撤离已完成】你已离开仙古秘境。');
      if (actionState.cancelled) {
        await e.reply('【撤离中断】重建秘境地图时，撤离通道随之消散。');
      }
      if (!player.xiangu_realm_map) {
        initXianguRealmMap(player);
        await Write_player(player_qq, player);
      }
    }

    const map = player.xiangu_realm_map;
    const fragment = REALM_FRAGMENTS[map.fragmentId];
    const daoyun = player.xiangu_gains?.daoyun || 0;
    const realmName = getRealmName(player.xiangulevel_id);
    const senseRange = getDivineSenseRange(player);

    // ======== 构造 cells 二维数组用于 HTML 渲染 ========
    // 先计算唯一机缘位置（用于道韵共鸣光晕）
    let uniquePos = null;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.grid[y][x] === CELL_TYPE.UNIQUE_TREASURE && map.revealed[y]?.[x]) {
          uniquePos = { x, y };
        }
      }
    }

    const cells = [];
    const axisX = [];
    const axisY = [];
    for (let i = 0; i < map.width; i++) axisX.push(i);
    for (let i = 0; i < map.height; i++) axisY.push(i);

    for (let y = 0; y < map.height; y++) {
      const row = [];
      for (let x = 0; x < map.width; x++) {
        const isPlayer = (x === map.playerPos.x && y === map.playerPos.y);
        const isRevealed = map.revealed[y]?.[x];
        const cellType = map.grid[y][x];

        let cls = 'cell-fog';
        if (isPlayer) {
          cls = 'cell-player';
        } else if (isRevealed) {
          switch (cellType) {
            case CELL_TYPE.WALL:           cls = 'cell-wall'; break;
            case CELL_TYPE.TREASURE:       cls = 'cell-treasure'; break;
            case CELL_TYPE.DANGER:         cls = 'cell-danger'; break;
            case CELL_TYPE.NPC:            cls = 'cell-npc'; break;
            case CELL_TYPE.EXIT:           cls = 'cell-exit'; break;
            case CELL_TYPE.VOID_RIFT:      cls = 'cell-void'; break;
            case CELL_TYPE.UNIQUE_TREASURE:
              cls = isXianguMarrowPoolPosition(map, x, y) ? 'cell-pool' : 'cell-unique';
              break;
            case CELL_TYPE.EMPTY:          cls = 'cell-empty'; break;
            case CELL_TYPE.EXPLORED_EMPTY: cls = 'cell-empty-explored'; break;
            default:                       cls = 'cell-empty';
          }
        }

        // 道韵共鸣光晕
        let echo = '';
        if (uniquePos && !isPlayer && cellType !== CELL_TYPE.UNIQUE_TREASURE) {
          const dist = Math.abs(x - uniquePos.x) + Math.abs(y - uniquePos.y);
          if (dist === 1) echo = 'cell-echo-1';
          else if (dist === 2) echo = 'cell-echo-2';
          else if (dist === 3) echo = 'cell-echo-3';
        }

        row.push({ cls, echo });
      }
      cells.push(row);
    }

    // ======== 构造已发现碎片数据 ========
    const discoveredFragments = [];
    if (map.discoveredFragments && map.discoveredFragments.length > 0) {
      for (const fragId of map.discoveredFragments) {
        const f = REALM_FRAGMENTS[fragId];
        if (!f) continue;
        const isCurrent = fragId === map.fragmentId;
        const history = player.xiangu_realm_history?.[fragId];
        let explored = '?/?';
        if (isCurrent) {
          const rev = map.revealed.flat().filter(Boolean).length;
          explored = `${rev}/${map.width * map.height}格`;
        } else if (history) {
          const rev = history.revealed ? history.revealed.flat().filter(Boolean).length : 0;
          const tot = history.revealed ? history.revealed.flat().length : 0;
          explored = `${rev}/${tot}格`;
        }
        discoveredFragments.push({
          name: f.name,
          zone: f.zone,
          riskStars: '★'.repeat(Math.ceil(f.risk * 5)),
          explored,
          current: isCurrent,
        });
      }
    }

    // ======== 构造出口数据 ========
    const exits = [];
    if (map.connectedFragments) {
      const dirNames = { top: '上方', bottom: '下方', left: '左方', right: '右方' };
      for (const [dir, connId] of Object.entries(map.connectedFragments)) {
        if (connId) {
          const connFrag = REALM_FRAGMENTS[connId];
          const levelReq = connFrag ? ZONE_LEVEL_REQUIREMENTS[connFrag.zone] : 5;
          const canEnter = player.xiangulevel_id >= levelReq;
          exits.push({
            direction: dirNames[dir] || dir,
            target: connFrag ? connFrag.name : connId,
            locked: !canEnter,
            levelRequired: getRealmName(levelReq),
          });
        }
      }
    }

    // ======== 计算进度 ========
    const revealedCount = map.revealed.flat().filter(Boolean).length;
    const totalCells = map.width * map.height;
    const revealedPct = Math.round((revealedCount / totalCells) * 100);

    // ======== 组装模板数据 ========
    const renderData = {
      playerName: player.名号 || '修士',
      playerTitle: realmName,
      daoyun,
      steps: map.stepsTaken || 0,
      realmName,
      fragmentName: fragment ? fragment.name : '未知碎片',
      fragmentZone: fragment ? fragment.zone : '未知区域',
      fragmentSize: `${map.width}×${map.height}`,
      fragmentRisk: fragment ? Math.ceil(fragment.risk * 5) : 1,
      fragmentRiskStars: '★'.repeat(fragment ? Math.ceil(fragment.risk * 5) : 1),
      senseRange: `${senseRange}格`,
      fragmentCount: map.discoveredFragments ? map.discoveredFragments.length : 1,
      cells,
      axisX,
      axisY,
      discoveredFragments,
      exits,
      revealedCount,
      totalCells,
      revealedPct,
    };

    // ======== 调用渲染器生成图片 ========
    try {
      const show = new Show(e);
      const tplData = await show.get_xiangu_map_template(renderData);
      const img = await puppeteer.screenshot('xiangu_map', tplData);
      if (img) {
        await e.reply(img);
        return true;
      }
    } catch (renderErr) {
      console.error('[XianguMap] 图片渲染失败，回退文字模式:', renderErr.message);
    }

    // ======== 图片失败时的文字回退 ========
    const lines = [];
    lines.push(`🗺️【仙古秘境·神识地图总览】`);
    lines.push(`📍 ${fragment ? fragment.name : '未知碎片'} · ${fragment ? fragment.zone : ''}`);
    lines.push(`🐉 ${player.名号} | ${realmName} | 道韵：${daoyun}`);
    lines.push(`👣 步数：${map.stepsTaken} | 揭示：${revealedCount}/${totalCells}`);
    lines.push('');
    for (let y = 0; y < map.height; y++) {
      let row = '';
      for (let x = 0; x < map.width; x++) {
        const isP = (x === map.playerPos.x && y === map.playerPos.y);
        const rev = map.revealed[y]?.[x];
        const ct = map.grid[y][x];
        if (isP) { row += '你'; continue; }
        if (!rev) { row += '▓'; continue; }
        switch (ct) {
          case CELL_TYPE.WALL: row += '█'; break;
          case CELL_TYPE.TREASURE: row += '◆'; break;
          case CELL_TYPE.DANGER: row += '✦'; break;
          case CELL_TYPE.NPC: row += '人'; break;
          case CELL_TYPE.EXIT: row += '⊕'; break;
          case CELL_TYPE.VOID_RIFT: row += '∞'; break;
          case CELL_TYPE.UNIQUE_TREASURE: row += isXianguMarrowPoolPosition(map, x, y) ? '♨' : '★'; break;
          default: row += '·';
        }
      }
      lines.push(' ' + row);
    }
    lines.push('');
    lines.push(`图例：你=你 ◆机缘 ✦危险 人NPC ⊕出口 ∞裂缝 ♨${XIANGU_MARROW_POOL_NAME} ★唯一 ▓迷雾`);
    return e.reply(lines.join('\n'));

  } catch (error) {
    console.error('查询秘境地图失败:', error);
    await e.reply(`查询秘境地图失败：${error.message}`);
    return false;
  }
}

  // 秘境探索★终极版★ 神识开图
  async XianguExplore(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【未入秘境·何来探索】`,
        `${player.名号}立于虚空，四顾茫然，`,
        `"我尚未踏入仙古秘境，何来探索之说？"`,
        ``,
        `提示：使用 #进入仙古秘境 踏入秘境`
      ].join('\n'));
    }

    // 检查探索CD
    const exploreCD = await redis.get(`xiuxian:player:${usr_qq}:xianguExploreCD`);
    if (exploreCD) {
      const remainingSec = Math.ceil((parseInt(exploreCD) + 25000 - Date.now()) / 1000);
      if (remainingSec > 0) {
        return e.reply([
          `【探索冷却中】`,
          `${player.名号}稍作休整，等待下一次探索...`,
          `剩余冷却时间：${remainingSec}秒`,
          ``,
          `提示：秘境中不宜频繁探索，以免惊动守护者`
        ].join('\n'));
      }
    }

    const actionState = await prepareXianguAction(player_qq);
    if (actionState.busy) {
      return e.reply('【撤离结算中】本次探索未执行，请等待撤离结果。');
    }
    player = actionState.player;
    if (!player?.in_xiangu) {
      return e.reply('【撤离已完成】你已离开仙古秘境，本次探索未执行。');
    }
    if (actionState.cancelled) {
      await e.reply('【撤离中断】你重新展开神识探索，撤离通道随之消散。');
    }

    // 设置探索CD（25秒）
    await redis.set(`xiuxian:player:${usr_qq}:xianguExploreCD`, Date.now().toString());

    // 获取或初始化碎片地图
    if (!player.xiangu_realm_map) {
      initXianguRealmMap(player);
    }
    const map = player.xiangu_realm_map;

    const poolConfig = resolveXianguMarrowPoolConfig(getXianguSecretConfig());
    const exploreEfficiency = getXianguExploreEfficiency(player);
    let poolDiscovery = null;
    if (Math.random() < poolConfig.exploreChance * exploreEfficiency) {
      poolDiscovery = placeXianguMarrowPool(map, {
        reveal: true,
        metadata: { source: 'explore', isTrap: false },
      });
      if (poolDiscovery.placed) {
        ensureXianguExitConnectivity(map.grid, map.playerPos, [poolDiscovery.position], {
          wallValue: CELL_TYPE.WALL,
          emptyValue: CELL_TYPE.EMPTY,
        });
      }
    }

    // 揭示当前位置周围（神识范围）
    revealAdjacentCells(map, map.playerPos, getDivineSenseRange(player));

    // 检查道韵共鸣（远距离唯一机缘）
    const echoes = checkTreasureEcho(player, map);

    // 渲染网格
    const gridRender = renderRealmGrid(player, map);

    // 神识感知
    const perceptions = getDivineSensePerception(player, map);

    // 混沌蚊湖特殊效果
    let mosquitoMsg = '';
    if (isInMosquitoLake(map)) {
      const mosquito = getMosquitoDrainEffect(player);
      player.血气 = Math.max(1, player.血气 - mosquito.drain);
      // 可能是致命区域
      if (player.血气 <= player.血气上限 * 0.1) {
        mosquitoMsg = `\n⚠️ 血气过低！混沌蚊群正在蚕食你的生命力！速离此地！`;
      }
    }

    await Write_player(player_qq, player);

    // 构建消息
    let msg = gridRender + '\n\n';

    if (poolDiscovery?.placed) {
      msg += [
        `💧【机缘显化·${XIANGU_MARROW_POOL_NAME}】`,
        `神识扫过时，万道水光忽然冲破迷雾！`,
        `宝池坐标：[${poolDiscovery.position.x}, ${poolDiscovery.position.y}]，可按地图方向前往。`,
        ``,
      ].join('\n');
    }

    if (exploreEfficiency < 1) {
      msg += `🩸【重伤】神识运转受阻，本次机缘发现率降低50%。\n\n`;
    }

    if (echoes && echoes.length > 0) {
      msg += `🔥【道韵共鸣】\n`;
      for (const echo of echoes) {
        msg += `· ${echo.msg}\n`;
      }
      msg += `\n`;
    }

    if (perceptions && perceptions.length > 0) {
      msg += `👁️【神识反馈】\n`;
      // 按方向分组显示最重要的
      const important = perceptions.filter(p => p.distance <= getDivineSenseRange(player));
      const shown = important.slice(0, 6);
      for (const p of shown) {
        msg += `· ${p.dir}：${p.msg}\n`;
      }
      msg += `\n`;
    }

    if (mosquitoMsg) {
      msg += mosquitoMsg + '\n\n';
    }

    const fragment = REALM_FRAGMENTS[map.fragmentId];
    msg += [
      `【可用命令】`,
      `#上 / #下 / #左 / #右 / #左上 / #右上 —— 向对应方向移动`,
      `#秘境探索 —— 神识感知周围（更新视野）`,
      `#秘境推演 —— 消耗道韵主动推演前方吉凶`,
      `#秘境移动 [碎片名] —— 远距离移动（通过已揭示出口）`,
      ``,
      `【秘境信息】`,
      `碎片：${fragment ? fragment.name : '未知'} | 探索步数：${map.stepsTaken}`,
      `揭示进度：${map.revealed.flat().filter(Boolean).length}/${map.width * map.height}格`,
      fragment ? `描述：${fragment.desc}` : ''
    ].join('\n');

    return e.reply(msg);

  } catch (error) {
    console.error('秘境探索失败:', error);
    await e.reply([
      `秘境探索失败`,
      `错误信息: ${error.message}`
    ].join('\n'));
    return false;
  }
}



  // ====== 终极版：六方向移动 ======
  async XianguRealmMove(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【未入秘境·何来移动】`,
        `${player.名号}立于虚空，四顾茫然，`,
        `"我尚未踏入仙古秘境，何来移动之说？"`,
        ``,
        `提示：使用 #进入仙古秘境 踏入秘境`
      ].join('\n'));
    }

    const actionState = await prepareXianguAction(player_qq);
    if (actionState.busy) {
      return e.reply('【撤离结算中】本次移动未执行，请等待撤离结果。');
    }
    player = actionState.player;
    if (!player?.in_xiangu) {
      return e.reply('【撤离已完成】你已离开仙古秘境，本次移动未执行。');
    }
    if (actionState.cancelled) {
      await e.reply('【撤离中断】你离开原位，尚未稳定的撤离通道随之崩散。');
    }

    // 必须有碎片地图
    if (!player.xiangu_realm_map) {
      initXianguRealmMap(player);
      await Write_player(player_qq, player);
      return e.reply('秘境地图已生成，请重新输入移动命令。');
    }

    // 移动CD（2秒）
    const moveCD = await redis.get(`xiuxian:player:${usr_qq}:xianguMoveCD`);
    if (moveCD) {
      const remaining = Math.ceil((parseInt(moveCD) + 2000 - Date.now()) / 1000);
      if (remaining > 0) {
        return e.reply(`${player.名号}刚移动过，请稍等${remaining}秒再行动。`);
      }
    }
    // 解析方向
    const msg = e.msg.trim();
    const directionMap = {
      '#上':  { dx: 0,  dy: -1, name: '上方', borderDir: 'top',    enterDir: 'bottom' },
      '#下':  { dx: 0,  dy: 1,  name: '下方', borderDir: 'bottom', enterDir: 'top' },
      '#左':  { dx: -1, dy: 0,  name: '左方', borderDir: 'left',   enterDir: 'right' },
      '#右':  { dx: 1,  dy: 0,  name: '右方', borderDir: 'right',  enterDir: 'left' },
      '#左上': { dx: -1, dy: -1, name: '左上方', borderDir: 'top',  enterDir: 'bottom' },
      '#右上': { dx: 1,  dy: -1, name: '右上方', borderDir: 'top',  enterDir: 'bottom' }
    };
    const dir = directionMap[msg];
    if (!dir) {
      return e.reply(`未知的方向：${msg}，请使用 #上/#下/#左/#右/#左上/#右上`);
    }

    await redis.set(`xiuxian:player:${usr_qq}:xianguMoveCD`, Date.now().toString());

    const map = player.xiangu_realm_map;
    const oldPos = map.playerPos;
    const nx = oldPos.x + dir.dx;
    const ny = oldPos.y + dir.dy;

    // ====== 越界处理：碎片间穿梭 ======
    if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) {
      // 确定越界方向对应的边界格子
      let borderCellX = oldPos.x;
      let borderCellY = oldPos.y;
      if (nx < 0) borderCellX = 0;
      else if (nx >= map.width) borderCellX = map.width - 1;
      if (ny < 0) borderCellY = 0;
      else if (ny >= map.height) borderCellY = map.height - 1;

      const borderCell = map.grid[borderCellY][borderCellX];

      // 检查边界格子是否为出口
      if (borderCell === CELL_TYPE.EXIT || borderCell === CELL_TYPE.EXPLORED_EMPTY) {
        // 边界是出口 → 尝试进入下一个碎片
        let connection = map.connectedFragments[dir.borderDir];
        if (!connection) {
          return e.reply([
            `【前方无路】`,
            `${player.名号}向${dir.name}迈出一步，`,
            `却发现前方是虚空深渊，没有可去的碎片...`,
            `只能原路返回。`
          ].join('\n'));
        }

        // 兼容旧存档中的自环连接，避免同一碎片被当作新地图反复生成。
        if (connection === map.fragmentId) {
          const repairedConnections = connectFragments(map.fragmentId, player.xiangulevel_id);
          connection = pickDifferentXianguFragment(
            map.fragmentId,
            Object.values(repairedConnections),
          );
          if (!connection) {
            return e.reply('【碎片连接修复失败】当前出口暂时无法稳定，请尝试其他方向。');
          }
          map.connectedFragments[dir.borderDir] = connection;
        }

        const nextFrag = REALM_FRAGMENTS[connection];
        if (!nextFrag) {
          return e.reply(`碎片数据异常：${connection}，请联系管理员。`);
        }

        // 检查境界是否满足
        const levelReq = ZONE_LEVEL_REQUIREMENTS[nextFrag.zone] || 5;
        if (player.xiangulevel_id < levelReq) {
          return e.reply([
            `【境界不足·无法穿越】`,
            `${player.名号}感应对面${nextFrag.name}的入口，`,
            `却被一股无形壁垒阻隔——`,
            `${nextFrag.zone}需要${getRealmName(levelReq)}方可进入！`,
            `当前境界：${getRealmName(player.xiangulevel_id)}`
          ].join('\n'));
        }

        const previousFragmentId = map.fragmentId;
        if (!player.xiangu_realm_history) player.xiangu_realm_history = {};
        const restoredFragment = restoreXianguFragmentSnapshot(
          player.xiangu_realm_history[connection],
          connection,
        );
        let nextFragmentState = restoredFragment;

        if (restoredFragment) {
          delete player.xiangu_realm_history[connection];
        } else {
          // 首次进入时生成碎片，并保留通往上一碎片的返程出口。
          const nextConnections = connectFragments(connection, player.xiangulevel_id);
          nextConnections[dir.enterDir] = previousFragmentId;
          const generated = generateFragmentGrid(connection, nextConnections);
          nextFragmentState = {
            width: nextFrag.size[0],
            height: nextFrag.size[1],
            grid: generated.grid,
            revealed: generated.grid.map(row => row.map(() => false)),
            playerPos: generated.playerPos,
            connectedFragments: nextConnections,
            uniqueTreasures: generated.specials.uniqueTreasures || {},
            npcLocations: generated.specials.npcLocations || [],
            exitPositions: generated.specials.exitPositions || [],
            generatedAt: Date.now(),
          };
        }

        const previousSnapshot = createXianguFragmentSnapshot(map);
        if (previousSnapshot) player.xiangu_realm_history[previousFragmentId] = previousSnapshot;

        // 切换碎片
        map.fragmentId = connection;
        map.width = nextFragmentState.width;
        map.height = nextFragmentState.height;
        map.grid = nextFragmentState.grid;
        map.revealed = nextFragmentState.revealed;
        map.playerPos = nextFragmentState.playerPos;
        map.discoveredFragments = [...new Set([...(map.discoveredFragments || []), connection])];
        map.connectedFragments = nextFragmentState.connectedFragments;
        map.uniqueTreasures = nextFragmentState.uniqueTreasures;
        map.npcLocations = nextFragmentState.npcLocations;
        map.exitPositions = nextFragmentState.exitPositions;
        map.generatedAt = nextFragmentState.generatedAt;

        // 新图揭示出生点；返程图保持原探索进度。
        if (!restoredFragment) revealAdjacentCells(map, map.playerPos, 1);

        // 更新快速字段
        player.xiangu_pos_x = map.playerPos.x;
        player.xiangu_pos_y = map.playerPos.y;
        player.xiangu_location = gridPosToZone(map);
        map.stepsTaken++;

        await Write_player(player_qq, player);

        const gridRender = renderRealmGrid(player, map);
        return e.reply([
          `🚪【跨越碎片】`,
          `${player.名号}穿过出口，踏入${nextFrag.name}！`,
          ``,
          `区域：${nextFrag.zone} | 危险：${'★'.repeat(Math.ceil(nextFrag.risk * 5))}`,
          `描述：${nextFrag.desc}`,
          ``,
          gridRender,
          ``,
          `可用命令：#秘境探索 | #秘境推演 | #上/#下/#左/#右/#左上/#右上`
        ].join('\n'));
      }

      // 边界不是出口 → 无法通行
      return e.reply([
        `【边界受阻】`,
        `${player.名号}向${dir.name}走去，却撞上了一面无形的空间壁垒...`,
        `此处并非出口，无法逾越。`
      ].join('\n'));
    }

    // ====== 检查目标格子 ======
    const targetCell = map.grid[ny][nx];

    // 墙壁阻挡
    if (targetCell === CELL_TYPE.WALL) {
      return e.reply([
        `【道则壁垒】`,
        `${player.名号}向${dir.name}迈步，`,
        `却被一道无形的道则屏障阻挡！`,
        `此处是一面古老的壁垒，无法穿透。`
      ].join('\n'));
    }

    // 移动玩家
    const oldX = oldPos.x, oldY = oldPos.y;
    map.playerPos = { x: nx, y: ny };
    map.stepsTaken++;

    // 揭示新位置周围
    revealAdjacentCells(map, map.playerPos, getDivineSenseRange(player));

    // 更新快速字段
    player.xiangu_pos_x = nx;
    player.xiangu_pos_y = ny;
    player.xiangu_location = gridPosToZone(map);

    // 初始化道韵字段
    if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 };

    // ====== 处理目标格子类型 ======
    let cellMsg = '';
    switch (targetCell) {
      case CELL_TYPE.TREASURE:
        // 触发机缘
        cellMsg = await handleTreasureCell(e, player, player_qq, map, nx, ny);
        break;

      case CELL_TYPE.DANGER:
        // 触发危险
        cellMsg = await handleDangerCell(e, player, player_qq, map, nx, ny);
        break;

      case CELL_TYPE.NPC:
        // 遇到NPC
        cellMsg = `👤 ${player.名号}发现前方有一道修士气息在徘徊！\n可使用 #与NPC交谈 与之互动。`;
        break;

      case CELL_TYPE.EXIT:
        // 踩到出口 → 提示
        const frag = REALM_FRAGMENTS[map.fragmentId];
        cellMsg = [
          `🚪【秘境出口】`,
          `${player.名号}来到一处空间薄弱点...`,
          `从此处可离开${frag ? frag.name : '当前碎片'}，进入相邻碎片。`,
          `再次向该方向移动即可穿越。`
        ].join('\n');
        break;

      case CELL_TYPE.VOID_RIFT:
        // 虚空裂缝
        cellMsg = await handleVoidRiftCell(e, player, player_qq, map, nx, ny);
        break;

      case CELL_TYPE.UNIQUE_TREASURE:
        // 唯一机缘
        cellMsg = await handleUniqueTreasureCell(e, player, player_qq, map, nx, ny);
        break;

      case CELL_TYPE.EMPTY:
      case CELL_TYPE.EXPLORED_EMPTY:
        // 空地 → 有概率触发小事件
        cellMsg = handleEmptyCell(player, map);
        break;
    }

    // 混沌蚊湖效果
    if (isInMosquitoLake(map)) {
      const mosquito = getMosquitoDrainEffect(player);
      player.血气 = Math.max(1, player.血气 - mosquito.drain);
      if (mosquito.msg) cellMsg += '\n' + mosquito.msg;
    }

    await Write_player(player_qq, player);

    // 道韵共鸣检测
    const echoes = checkTreasureEcho(player, map);

    // 渲染
    const gridRender = renderRealmGrid(player, map);
    const fragment = REALM_FRAGMENTS[map.fragmentId];

    let finalMsg = gridRender + '\n\n';
    if (cellMsg) finalMsg += cellMsg + '\n\n';
    if (echoes && echoes.length > 0) {
      finalMsg += `🔥【道韵共鸣】\n`;
      for (const echo of echoes) {
        finalMsg += `· ${echo.msg}\n`;
      }
      finalMsg += `\n`;
    }
    finalMsg += [
      `【移动信息】`,
      `坐标：[${nx}, ${ny}] | 碎片：${fragment ? fragment.name : '未知'}`,
      `步数：${map.stepsTaken} | 揭示：${map.revealed.flat().filter(Boolean).length}/${map.width * map.height}格`,
      `可用：#秘境探索 | #秘境推演 | #秘境地图`
    ].join('\n');

    return e.reply(finalMsg);

  } catch (error) {
    console.error('秘境移动失败:', error);
    await e.reply([
      `秘境移动失败`,
      `错误信息: ${error.message}`
    ].join('\n'));
    return false;
  }
}

// ====== 终极版：神识推演（消耗道韵探查前方） ======
async XianguDivineScan(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    if (!player.in_xiangu) {
      return e.reply([
        `【未入秘境·何来推演】`,
        `${player.名号}尚未踏入仙古秘境。`
      ].join('\n'));
    }

    if (!player.xiangu_realm_map) {
      return e.reply('秘境地图未初始化，请先使用 #进入仙古秘境。');
    }

    // 检查道韵
    if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 };
    if (player.xiangu_gains.daoyun < 5) {
      return e.reply([
        `【道韵不足】`,
        `${player.名号}闭目凝神，试图推演前方吉凶...`,
        `然而体内道韵枯竭，无法推演天机！`,
        ``,
        `当前道韵：${player.xiangu_gains.daoyun} 💎`,
        `需要：5 💎`,
        ``,
        `提示：探索机缘地或击败修士可获得道韵`
      ].join('\n'));
    }

    const actionState = await prepareXianguAction(player_qq);
    if (actionState.busy) {
      return e.reply('【撤离结算中】本次推演未执行，请等待撤离结果。');
    }
    player = actionState.player;
    if (!player?.in_xiangu) return e.reply('【撤离已完成】本次推演未执行。');
    if (!player.xiangu_realm_map) return e.reply('秘境地图已经失效，本次推演未执行。');
    if (!player.xiangu_gains || player.xiangu_gains.daoyun < 5) {
      return e.reply('【道韵不足】当前道韵不足5点，无法继续推演。');
    }
    if (actionState.cancelled) {
      await e.reply('【撤离中断】你转而推演天机，撤离通道随之消散。');
    }

    // 消耗道韵
    player.xiangu_gains.daoyun = Math.max(0, player.xiangu_gains.daoyun - 5);
    await Write_player(player_qq, player);

    const map = player.xiangu_realm_map;
    const { playerPos, grid } = map;

    // 扫描 4 格范围内的详细信息
    const scanRange = Math.min(4, getDivineSenseRange(player) + 2);
    const scanResults = [];

    for (let dy = -scanRange; dy <= scanRange; dy++) {
      for (let dx = -scanRange; dx <= scanRange; dx++) {
        if (dx === 0 && dy === 0) continue;
        const sx = playerPos.x + dx;
        const sy = playerPos.y + dy;
        if (sy < 0 || sy >= map.height || sx < 0 || sx >= map.width) continue;

        const cell = grid[sy][sx];
        const dist = Math.abs(dx) + Math.abs(dy);
        const cardinalDir = getDirectionName(dx, dy);

        let detail = null;
        switch (cell) {
          case CELL_TYPE.TREASURE:
            detail = `道韵感应到${cardinalDir}${dist}格处有【💎机缘】——灵光吞吐，必有宝物！`;
            scanResults.push({ dist, text: detail });
            break;
          case CELL_TYPE.DANGER:
            detail = `杀意从${cardinalDir}${dist}格处传来——【⚡危险】潜伏，需小心应对！`;
            scanResults.push({ dist, text: detail });
            break;
          case CELL_TYPE.NPC:
            detail = `一道神识在${cardinalDir}${dist}格处盘桓——有【👤修士】在此！`;
            scanResults.push({ dist, text: detail });
            break;
          case CELL_TYPE.EXIT:
            const conn = map.connectedFragments;
            let exitTarget = '未知碎片';
            // 判断出口方向
            if (sy === 0) exitTarget = conn.top ? REALM_FRAGMENTS[conn.top]?.name || '未知' : '无连接';
            else if (sy === map.height - 1) exitTarget = conn.bottom ? REALM_FRAGMENTS[conn.bottom]?.name || '未知' : '无连接';
            else if (sx === 0) exitTarget = conn.left ? REALM_FRAGMENTS[conn.left]?.name || '未知' : '无连接';
            else if (sx === map.width - 1) exitTarget = conn.right ? REALM_FRAGMENTS[conn.right]?.name || '未知' : '无连接';
            detail = `空间紊乱——${cardinalDir}${dist}格处【🚪出口】通向「${exitTarget}」！`;
            scanResults.push({ dist, text: detail });
            break;
          case CELL_TYPE.VOID_RIFT:
            detail = `危险！${cardinalDir}${dist}格处空间扭曲成【🌀虚空裂缝】——勿靠近！`;
            scanResults.push({ dist, text: detail });
            break;
          case CELL_TYPE.UNIQUE_TREASURE:
            detail = isXianguMarrowPoolPosition(map, sx, sy)
              ? `💧 万道水声共鸣！${cardinalDir}${dist}格处有【${XIANGU_MARROW_POOL_NAME}】！`
              : `🔥🔥🔥 天机震动！${cardinalDir}${dist}格处有【✨绝世机缘】——此乃大造化！`;
            scanResults.push({ dist, text: detail });
            break;
        }
      }
    }

    // 排序：按距离
    scanResults.sort((a, b) => a.dist - b.dist);

    let msg = [
      `🔮【神识推演·天机窥探】`,
      `${player.名号}运转秘法，以道韵为引，推演前方吉凶！`,
      `（消耗 5 💎 道韵）`,
      ``
    ];

    if (scanResults.length === 0) {
      msg.push(`四周一片虚无...你的神识未能探测到任何特殊之物。`);
    } else {
      // 按类型分组显示
      const shown = scanResults.slice(0, 8); // 最多显示8条
      for (const r of shown) {
        msg.push(`· ${r.text}`);
      }
      if (scanResults.length > 8) {
        msg.push(`...（共${scanResults.length}处异常，神识无法尽数显化）`);
      }
    }

    msg.push(``);
    msg.push(`剩余道韵：${player.xiangu_gains.daoyun} 💎`);

    // 也揭示扫描范围内的格子
    revealAdjacentCells(map, playerPos, scanRange);

    return e.reply(msg.join('\n'));

  } catch (error) {
    console.error('神识推演失败:', error);
    await e.reply([
      `神识推演失败`,
      `错误信息: ${error.message}`
    ].join('\n'));
    return false;
  }
}

  // 秘境移动（旧版，保留兼容）
  async XianguMove(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【未入秘境·何来移动】`,
        `${player.名号}立于虚空，四顾茫然，`,
        `"我尚未踏入仙古秘境，何来移动之说？"`,
        ``,
        `提示：使用 #进入仙古秘境 踏入秘境`
      ].join('\n'));
    }

    // 解析移动目标
    const msg = e.msg.replace('#秘境移动', '').trim();
    if (!msg) {
      return e.reply([
        `【秘境移动·说明】`,
        ``,
        `请指定要前往的区域：`,
        ``,
        `#秘境移动 边缘区域`,
        `#秘境移动 中层区域`,
        `#秘境移动 深层区域`,
        `#秘境移动 核心区域`,
        `#秘境移动 火道禁区`,
        ``,
        `或使用以下快捷命令：`,
        `#秘境前往接引古殿`,
        `#秘境前往仙药园`,
        `#秘境前往真龙巢穴`,
        `...`,
        ``,
        `提示：危险等级越高，机缘越丰厚，但风险也越大`
      ].join('\n'));
    }

    // 区域映射
    const areaMapping = {
      '边缘': '边缘区域',
      '边缘区域': '边缘区域',
      '中层': '中层区域',
      '中层区域': '中层区域',
      '深层': '深层区域',
      '深层区域': '深层区域',
      '核心': '核心区域',
      '核心区域': '核心区域',
      '接引古殿': '边缘区域',
      '初代营地': '边缘区域',
      '法则石碑': '边缘区域',
      '十凶传承地': '中层区域',
      '仙药园': '中层区域',
      '真龙巢穴': '中层区域',
      '天角蚁埋骨地': '中层区域',
      '仙王讲道台': '深层区域',
      '黑暗牢笼': '深层区域',
      '折仙咒遗迹': '深层区域',
      '仙古花蕾': '核心区域',
      '火道禁区': '火道禁区',
      '万火深渊': '火道禁区'
    };

    const targetArea = areaMapping[msg];
    if (!targetArea) {
      return e.reply([
        `【秘境移动·未知区域】`,
        `${player.名号}四处张望，寻找名为"${msg}"的地方...`,
        `然而此地并不存在于秘境之中！`,
        ``,
        `【可用区域】`,
        `边缘区域：接引古殿、初代营地、法则石碑`,
        `中层区域：十凶传承地、仙药园、真龙巢穴、天角蚁埋骨地`,
        `深层区域：仙王讲道台、黑暗牢笼、折仙咒遗迹`,
        `核心区域：仙古花蕾`,
        `火道禁区：万火深渊（祭炼真我·三千青石阶）`,
        ``,
        `提示：使用 #秘境地图 查看详细地图`
      ].join('\n'));
    }

    const actionState = await prepareXianguAction(player_qq);
    if (actionState.busy) {
      return e.reply('【撤离结算中】本次跨区移动未执行，请等待撤离结果。');
    }
    player = actionState.player;
    if (!player?.in_xiangu) {
      return e.reply('【撤离已完成】你已离开仙古秘境，本次移动未执行。');
    }
    if (actionState.cancelled) {
      await e.reply('【撤离中断】你转身前往其他区域，撤离通道随之消散。');
    }

    const currentLocation = player.xiangu_location || '边缘区域';
    
    // 检查是否已经在目标区域
    if (currentLocation === targetArea) {
      return e.reply([
        `【秘境移动·原地不动】`,
        `${player.名号}环顾四周，`,
        `发现自己已经身处${targetArea}之中！`,
        ``,
        `当前位置：${currentLocation}`,
        `目标位置：${targetArea}`,
        ``,
        `提示：使用 #秘境探索 在当前区域搜索机缘`
      ].join('\n'));
    }

    // 区域等级
    const areaLevels = {
      '边缘区域': 1,
      '中层区域': 2,
      '深层区域': 3,
      '核心区域': 4,
      '火道禁区': 5
    };
    
    const currentLevel = areaLevels[currentLocation];
    const targetLevel = areaLevels[targetArea];
    
    // 检查境界要求
    const levelRequirements = {
      '边缘区域': 5,  // 铭文境
      '中层区域': 6,  // 列阵境
      '深层区域': 7,  // 尊者境
      '核心区域': 7,   // 尊者境
      '火道禁区': 7   // 尊者境（祭炼真我·未点燃神火）
    };
    
    if (player.xiangulevel_id < levelRequirements[targetArea]) {
      return e.reply([
        `【秘境移动·境界不足】`,
        `${player.名号}欲前往${targetArea}，`,
        `却被一层无形的屏障阻挡！`,
        ``,
        `秘境法则：${targetArea}需${data.xiangujinshi_list.find(l => l.level_id === levelRequirements[targetArea])?.level || '未知境界'}方可进入`,
        ``,
        `当前境界：${data.xiangujinshi_list.find(l => l.level_id === player.xiangulevel_id)?.level || "未知"}`,
        `进入要求：${data.xiangujinshi_list.find(l => l.level_id === levelRequirements[targetArea])?.level || '未知'}或更高`,
        ``,
        `提示：先在中低区域历练，提升境界后再前往`
      ].join('\n'));
    }

    // 移动时间和风险
    const moveRisk = Math.abs(targetLevel - currentLevel) * 0.1;
    // 目标区域遭遇概率（跨区域越大越危险，深层区域本身更危险）
    const targetBaseRisk = { '边缘区域': 0.1, '中层区域': 0.3, '深层区域': 0.5, '核心区域': 0.7, '火道禁区': 0.85 }[targetArea] || 0.3;
    const encounterChance = Math.min(1.0, moveRisk + targetBaseRisk * 0.5);
    
    // 执行移动
    const moveTime = (targetLevel - currentLevel) * 3 + Math.floor(Math.random() * 5);
    
    await e.reply([
      `【秘境移动中...】`,
      ``,
      `${player.名号}离开${currentLocation}，`,
      `向着${targetArea}进发...`,
      ``,
      `穿越秘境壁垒...`,
      `时空流转...`,
      ``,
      `移动时间：约${moveTime}分钟`,
      `遭遇危险概率：${(encounterChance * 100).toFixed(1)}%`,
      ``,
      `【请稍候...】`
    ].join('\n'));

    // 随机事件判定
    if (Math.random() < encounterChance) {
      // 途中遭遇危险
      const eventTypes = ['迷路', '伏击', '陷阱', '时空乱流'];
      const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
      
      if (eventType === '伏击' || eventType === '时空乱流') {
        const hpLoss = Math.floor(player.血气 * 0.1);
        
        await e.reply([
          `【移动意外·${eventType}】`,
          ``,
          `${player.名号}在穿越${targetArea}途中，`,
          `突遭${eventType}！`,
          ``,
          `危急时刻，${player.名号}凭借高超的身法脱险，`,
          `但仍受了不轻的伤！`,
          ``,
          `【损失】`,
          `血气 -${hpLoss}`,
          ``,
          `【继续前进...】`
        ].join('\n'));
        
        player.血气 = Math.max(1, player.血气 - hpLoss);
      }
    }

    // 兼容旧版跨区命令时同步碎片地图，避免区域文字与真实地图脱节。
    const targetPool = ZONE_FRAGMENT_POOLS[targetArea] || ZONE_FRAGMENT_POOLS['边缘区域'];
    const targetFragmentId = targetArea === '核心区域'
      ? 'xiangu_core'
      : targetPool[Math.floor(Math.random() * targetPool.length)];
    const oldMap = player.xiangu_realm_map;
    const targetFragment = REALM_FRAGMENTS[targetFragmentId];
    player.xiangu_realm_history = player.xiangu_realm_history || {};
    const restoredFragment = restoreXianguFragmentSnapshot(
      player.xiangu_realm_history[targetFragmentId],
      targetFragmentId,
    );
    let targetFragmentState = restoredFragment;

    if (restoredFragment) {
      delete player.xiangu_realm_history[targetFragmentId];
    } else {
      const targetConnections = connectFragments(targetFragmentId, player.xiangulevel_id);
      if (oldMap?.fragmentId) targetConnections.bottom = oldMap.fragmentId;
      const generated = generateFragmentGrid(targetFragmentId, targetConnections);
      targetFragmentState = {
        width: targetFragment.size[0],
        height: targetFragment.size[1],
        grid: generated.grid,
        revealed: generated.grid.map(row => row.map(() => false)),
        playerPos: generated.playerPos,
        connectedFragments: targetConnections,
        uniqueTreasures: generated.specials.uniqueTreasures || {},
        npcLocations: generated.specials.npcLocations || [],
        exitPositions: generated.specials.exitPositions || [],
        generatedAt: Date.now(),
      };
    }

    if (oldMap?.fragmentId && oldMap.fragmentId !== targetFragmentId) {
      const previousSnapshot = createXianguFragmentSnapshot(oldMap);
      if (previousSnapshot) player.xiangu_realm_history[oldMap.fragmentId] = previousSnapshot;
    }

    player.xiangu_realm_map = {
      fragmentId: targetFragmentId,
      width: targetFragmentState.width,
      height: targetFragmentState.height,
      grid: targetFragmentState.grid,
      revealed: targetFragmentState.revealed,
      playerPos: targetFragmentState.playerPos,
      discoveredFragments: [...new Set([
        ...(oldMap?.discoveredFragments || []),
        targetFragmentId,
      ])],
      connectedFragments: targetFragmentState.connectedFragments,
      uniqueTreasures: targetFragmentState.uniqueTreasures,
      npcLocations: targetFragmentState.npcLocations,
      exitPositions: targetFragmentState.exitPositions,
      stepsTaken: (oldMap?.stepsTaken || 0) + 1,
      generatedAt: targetFragmentState.generatedAt,
    };
    if (!restoredFragment) {
      revealAdjacentCells(player.xiangu_realm_map, targetFragmentState.playerPos, 1);
    }
    player.xiangu_pos_x = targetFragmentState.playerPos.x;
    player.xiangu_pos_y = targetFragmentState.playerPos.y;
    player.xiangu_location = targetFragment.zone;

    // === NPC生态系统：移动时处理NPC行为 ===
    const npcMoveEvents = processNPCBehavior(player, targetArea);

    await Write_player(player_qq, player);

    // 移动完成
    const dangerLevel = '★'.repeat(targetLevel);
    const areaDesc = getAreaDescription(targetArea);
    
    await e.reply([
      `【抵达${targetArea}】`,
      ``,
      `${player.名号}穿越重重险阻，`,
      `终于抵达${targetArea}！`,
      ``,
      areaDesc,
      ``,
      `【区域信息】`,
      `- 危险等级：${dangerLevel}`,
      `- 区域特性：${getAreaFeature(targetArea)}`,
      `- 探索建议：${getAreaSuggestion(targetArea)}`,
      ``,
      `【当前位置】`,
      `${player.名号}现在位于：${targetArea}`,
      ``,
      (npcMoveEvents && npcMoveEvents.length > 0
        ? `【区域动态】\n${npcMoveEvents.join('\n')}\n\n` : ''),
      `提示：使用 #秘境探索 搜索机缘`
    ].join('\n'));

    return true;

  } catch (error) {
    console.error('秘境移动失败:', error);
    await e.reply([
      `秘境移动失败`,
      `错误信息: ${error.message}`
    ].join('\n'));
    return false;
  }
}


// ============ 步骤3：道种系统与神火突破 ============

// 查看当前拥有的道种
async XianguViewSeeds(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【道种查看·未入秘境】`,
        `${player.名号}尝试感应道种气息...`,
        `却发现此地并非仙古秘境，道韵稀薄，难以感应！`,
        ``,
        `提示：需先进入仙古秘境（#进入仙古秘境）才可查看道种`
      ].join('\n'));
    }

    // 获取道种列表
    const seeds = player.xiangu_seeds || [];
    
    if (seeds.length === 0) {
      return e.reply([
        `【道种查看·空空如也】`,
        ``,
        `${player.名号}感应体内，`,
        `却发现尚未获得任何道种...`,
        ``,
        `【道种获取途径】`,
        `• 探索秘境各区域（#秘境探索）`,
        `• 击杀秘境Boss`,
        `• 完成秘境任务`,
        ``,
        `【古史记载】`,
        `"道种乃修士点燃神火之基，珍贵无比"`
      ].join('\n'));
    }

    // 分类显示道种
    const 普通道种 = seeds.filter(s => s.品质 === '普通');
    const 稀有道种 = seeds.filter(s => s.品质 === '稀有');
    const 传说道种 = seeds.filter(s => s.品质 === '传说');
    const 神话道种 = seeds.filter(s => s.品质 === '神话');

    let seedList = [
      `【道种查看】`,
      ``,
      `${player.名号}感应体内道种...`,
      ``,
      `【道种统计】`,
      `- 总计：${seeds.length}枚`,
      `- 普通：${普通道种.length}枚`,
      `- 稀有：${稀有道种.length}枚`,
      `- 传说：${传说道种.length}枚`,
      `- 神话：${神话道种.length}枚`,
      ``
    ];

    if (神话道种.length > 0) {
      seedList.push(`【神话道种】`);
      for (const seed of 神话道种) {
        seedList.push(`◇ ${seed.名称} [${seed.类型}]`);
        seedList.push(`  融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`);
        seedList.push(`  专属技能：${seed.专属技能}`);
        if (seed.额外效果) seedList.push(`  额外效果：${seed.额外效果}`);
      }
      seedList.push(``);
    }

    if (传说道种.length > 0) {
      seedList.push(`【传说道种】`);
      for (const seed of 传说道种) {
        seedList.push(`◆ ${seed.名称} [${seed.类型}]`);
        seedList.push(`  融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`);
        seedList.push(`  专属技能：${seed.专属技能}`);
      }
      seedList.push(``);
    }

    if (稀有道种.length > 0) {
      seedList.push(`【稀有道种】`);
      for (const seed of 稀有道种) {
        seedList.push(`○ ${seed.名称} [${seed.类型}]`);
        seedList.push(`  融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`);
      }
      seedList.push(``);
    }

    if (普通道种.length > 0) {
      seedList.push(`【普通道种】`);
      for (const seed of 普通道种) {
        seedList.push(`· ${seed.名称} [${seed.类型}]`);
        seedList.push(`  融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`);
      }
      seedList.push(``);
    }

    seedList.push(`【融合提示】`);
    seedList.push(`在核心区域可使用 #融合道种 来点燃神火`);
    seedList.push(`道种品质越高，融合成功率越高`);

    return e.reply(seedList.join('\n'));

  } catch (error) {
    console.error('查看道种失败:', error);
    return e.reply(`查看道种失败: ${error.message}`);
  }
}

// 融合道种 - 点燃神火
async XianguJieZhuDaoZhong(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【道种融合·未入秘境】`,
        `${player.名号}欲融合道种...`,
        `却发现此地并非仙古秘境！`,
        ``,
        `提示：需先进入仙古秘境才可进行道种融合`
      ].join('\n'));
    }

    player = await prepareXianguMutation(e, player_qq, '融合道种');
    if (!player) return false;

    // 检查位置
    const location = player.xiangu_location || '边缘区域';
    if (location !== '核心区域') {
      return e.reply([
        `【道种融合·位置不符】`,
        ``,
        `${player.名号}欲融合道种，却感应到此地道韵不足！`,
        ``,
        `【融合要求】`,
        `道种融合必须在核心区域进行！`,
        `核心区域道韵浓郁，可助修士成功点燃神火。`,
        ``,
        `【当前区域】${location}`,
        `提示：请先前往核心区域（#秘境移动 核心区域）`
      ].join('\n'));
    }

    // 检查是否已点燃神火
    if (player.xiangu_shenhuo && player.xiangu_shenhuo.已点燃) {
      return e.reply([
        `【道种融合·神火已燃】`,
        ``,
        `${player.名号}体内神火熊熊燃烧...`,
        `神火既已点燃，便不可再次融合道种！`,
        ``,
        `【神火信息】`,
        `道种：${player.xiangu_shenhuo.道种名称}`,
        `品质：${player.xiangu_shenhuo.道种品质}`,
        `技能：${player.xiangu_shenhuo.专属技能 || '无'}`,
        ``,
        `提示：使用 #查看神火 查看详情`
      ].join('\n'));
    }

    // 获取道种列表
    const seeds = player.xiangu_seeds || [];
    
    if (seeds.length === 0) {
      return e.reply([
        `【道种融合·无种可融】`,
        ``,
        `${player.名号}欲融合道种，却发现体内空空如也...`,
        ``,
        `【获取道种】`,
        `• #秘境探索 - 探索可能发现道种`,
        `• 击杀秘境Boss - 高概率掉落道种`,
        `• 完成秘境任务 - 任务奖励道种`
      ].join('\n'));
    }

    // 解析命令参数：#借助XX道种点燃神火 / #借助XX点燃神火
    const msg = e.msg.replace(/^#借助/, '').replace(/点燃神火$/, '').replace(/道种$/, '').trim();
    
    // 如果没有参数，显示道种选择列表
    if (!msg) {
      let seedList = [
        `【道种融合·选择道种】`,
        ``,
        `${player.名号}请选择要融合的道种：`,
        ``
      ];
      
      for (let i = 0; i < seeds.length; i++) {
        const seed = seeds[i];
        const qualityMark = seed.品质 === '神话' ? '★' : seed.品质 === '传说' ? '◆' : seed.品质 === '稀有' ? '○' : '·';
        seedList.push(`【${i + 1}】${qualityMark} ${seed.名称}`);
        seedList.push(`    品质：${seed.品质} | 类型：${seed.类型}`);
        seedList.push(`    融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`);
        if (seed.专属技能) seedList.push(`    专属技能：${seed.专属技能}`);
        seedList.push(``);
      }
      
      seedList.push(`【使用说明】`);
      seedList.push(`发送 #借助XX道种点燃神火 点燃神火`);
      seedList.push(`例如：#借助世界树幼苗点燃神火`);
      seedList.push(``);
      seedList.push(`【融合地点】`);
      seedList.push(`当前位置：${location}`);
      seedList.push(`核心区域融合成功率+15%！`);

      return e.reply(seedList.join('\n'));
    }

    // 解析序号或道种名称
    let selectedSeed = null;
    let selectedIndex = -1;
    
    const index = parseInt(msg) - 1;
    if (!isNaN(index) && index >= 0 && index < seeds.length) {
      selectedSeed = seeds[index];
      selectedIndex = index;
    } else {
      // 按名称查找
      const canonicalMsg = normalizeXianguSeedName(msg);
      selectedIndex = seeds.findIndex(seed =>
        normalizeXianguSeedName(seed.名称).includes(canonicalMsg) || seed.名称.includes(msg)
      );
      selectedSeed = selectedIndex >= 0 ? seeds[selectedIndex] : null;
    }

    if (!selectedSeed) {
      return e.reply([
        `【道种融合·选择错误】`,
        `${player.名号}选择的道种不存在！`,
        ``,
        `请使用 #借助XX道种点燃神火 并指定道种名称`
      ].join('\n'));
    }

    // 兼容旧版名称，并用顶级道种目录补齐规范品质与融合信息。
    const canonicalSeedName = normalizeXianguSeedName(selectedSeed.名称);
    const topSeedDefinition = findXianguTopSeed(getXianguSecretConfig(), canonicalSeedName);
    selectedSeed = topSeedDefinition ? {
      ...selectedSeed,
      名称: topSeedDefinition.名称,
      品质: topSeedDefinition.品质,
      类型: topSeedDefinition.类型,
      融合成功率: topSeedDefinition.融合成功率,
      属性加成: topSeedDefinition.属性加成 || {},
      专属技能: topSeedDefinition.专属技能,
      额外效果: topSeedDefinition.额外效果,
      顶级道种: true,
    } : { ...selectedSeed, 名称: canonicalSeedName };

    // 计算融合成功率
    const baseConfig = getXianguSecretConfig();
    const fusionConfig = baseConfig.融合配置 || {};
    
    const baseSuccessRate = fusionConfig.基础成功率 || 0.5;
    const daoyunBonus = (player.xiangu_gains?.daoyun || 0) * (fusionConfig.道韵加成 || 0.005);
    const coreBonus = fusionConfig.核心区域加成 || 0.15;
    const seedBonus = (Number(selectedSeed.融合成功率) || 0.6) - 0.6; // 相对于普通道种的加成
    
    const totalSuccessRate = Math.min(0.95, baseSuccessRate + daoyunBonus + coreBonus + seedBonus);

    // 发送确认消息
    const qualityMark = selectedSeed.品质 === '神话' ? '★' : selectedSeed.品质 === '传说' ? '◆' : selectedSeed.品质 === '稀有' ? '○' : '·';
    
    await e.reply([
      `【道种融合·确认】`,
      ``,
      `${player.名号}准备融合道种：`,
      ``,
      `${qualityMark} ${selectedSeed.名称}`,
      ``,
      `【道种信息】`,
      `- 品质：${selectedSeed.品质}`,
      `- 类型：${selectedSeed.类型}`,
      `- 专属技能：${selectedSeed.专属技能 || '无'}`,
      ``,
      `【融合成功率计算】`,
      `- 基础成功率：${(baseSuccessRate * 100).toFixed(0)}%`,
      `- 道韵加成：+${(daoyunBonus * 100).toFixed(1)}%`,
      `- 核心区域加成：+${(coreBonus * 100).toFixed(0)}%`,
      `- 道种品质加成：+${(seedBonus * 100).toFixed(0)}%`,
      ``,
      `【最终成功率】：${(totalSuccessRate * 100).toFixed(1)}%`,
      ``,
      `【融合时间】：${fusionConfig.融合时间 || 60}秒`,
      `【失败惩罚】：道种损毁`,
      ``,
      `【注意事项】`,
      `• 融合过程中可能被其他玩家攻击打断！`,
      `• 融合成功率受道韵和位置影响`,
      `• 核心区域融合可获得额外加成`,
      ``,
      `【确认提示】`,
      `融合将被开始，请确保安全！`
    ].join('\n'));

    // 等待玩家确认
    await sleep(3000);

    // 执行融合
    await e.reply([
      `【道种融合·开始】`,
      ``,
      `${player.名号}盘膝而坐，`,
      `将${selectedSeed.名称}置于眉心...`,
      ``,
      `道种光华大放，与${player.名号}的道果产生共鸣！`,
      ``,
      `【融合进行中...】`
    ].join('\n'));

    await sleep(2000);

    // 检查是否被打断（模拟）
    const interrupted = Math.random() < (fusionConfig.打断概率 || 0.3);
    
    if (interrupted) {
      // 融合被打断
      const hpLoss = Math.floor(player.血气 * 0.3);
      player.血气 = Math.max(1, player.血气 - hpLoss);
      await Write_player(player_qq, player);

      await e.reply([
        `【道种融合·被打断！】`,
        ``,
        `就在${player.名号}融合道种的关键时刻...`,
        `一股狂暴的气息突然袭来！`,
        ``,
        `【打断事件】`,
        `有人在附近触发了秘境禁制！`,
        `${player.名号}心神失守，融合失败！`,
        ``,
        `【损失】`,
        `- 道种：${selectedSeed.名称}（已损毁）`,
        `- 血气：-${hpLoss}`,
        ``,
        `【古史警示】`,
        `"融合道种需在安全之地，否则后果难料..."`
      ].join('\n'));

      // 移除损毁的道种
      seeds.splice(selectedIndex, 1);
      player.xiangu_seeds = seeds;
      await Write_player(player_qq, player);

      return true;
    }

    // 等待融合完成
    await sleep(3000);

    // 判定融合结果
    const success = Math.random() < totalSuccessRate;

    if (!success) {
      // 融合失败
      await e.reply([
        `【道种融合·失败】`,
        ``,
        `${player.名号}的道果剧烈震动...`,
        `然而，道种与道果的共鸣突然中断！`,
        ``,
        `【失败原因】`,
        `融合过程中的某一环节出现了偏差...`,
        ``,
        `【损失】`,
        `- 道种：${selectedSeed.名称}（已损毁）`,
        ``,
        `【古史记载】`,
        `"融合道种需天时地利人和，缺一不可..."`,
        ``,
        `提示：道韵越高，融合成功率越高！`
      ].join('\n'));

      // 移除损毁的道种
      seeds.splice(selectedIndex, 1);
      player.xiangu_seeds = seeds;
      await Write_player(player_qq, player);

      return true;
    }

    // 融合成功：先写入神火状态，再由 Write_equipment 统一重算境界、道种和极境属性。
    const 属性加成 = selectedSeed.属性加成 || {};
    const breakthroughBonus = getShenhuoBreakthroughBonus();
    const beforeStats = {
      攻击: Number(player.攻击) || 0,
      防御: Number(player.防御) || 0,
      血量: Number(player.血量上限 || player.血气上限) || 0,
      暴击率: Number(player.暴击率) || 0,
    };

    // 提升境界
    player.xiangulevel_id = 8;

    // 设置神火状态
    // 统一神火品质：道种阶梯 → 神火阶梯（普通→下品/稀有→中品/传说→上品/神话→极品）
    // 只有目录内且在境界表存在同名配置的顶级仙种，才能达成道种极境并修出仙气。
    const extremeName = resolveXianguSeedExtremeName(baseConfig, data.xiangujinshi_list, selectedSeed.名称);
    const _shQuality = extremeName ? '极品' : (selectedSeed.品质 === '神话' ? '上品' : (DAOZHONG_TO_SHENHUO[selectedSeed.品质] || '下品'));
    player.xiangu_shenhuo = {
      已点燃: true,
      点燃方式: '道种孕育',
      道种名称: selectedSeed.名称,
      道种品质: selectedSeed.品质,
      神火品质: _shQuality,
      神火名称: selectedSeed.名称 + '·神火',
      属性倍率: getFlameQualityRate(_shQuality),
      道种类型: selectedSeed.类型,
      专属技能: selectedSeed.专属技能,
      额外效果: selectedSeed.额外效果,
      点燃时间: new Date().toISOString(),
      属性加成: 属性加成,
      境界提升: '神火境',
      突破前境界: 7,
      突破后境界: 8,
      极境达成: Boolean(extremeName),
      极境名称: extremeName
    };
    if (extremeName && getXianqiStrands(player) === 0) {
      grantXianqi(player, '神火点燃·' + selectedSeed.名称);
    }

    // 移除已融合的道种
    seeds.splice(selectedIndex, 1);
    player.xiangu_seeds = seeds;

    await Write_player(player_qq, player);

    let updatedPlayer = player;
    try {
      const equipment = await Read_equipment(player_qq);
      await Write_equipment(player_qq, equipment);
      updatedPlayer = await Read_player(player_qq);
    } catch (equipmentError) {
      // 装备重算异常时仍兑现本次境界与精确极境的固定属性。
      console.error('道种融合后装备属性同步失败:', equipmentError);
      const allRate = Number(属性加成.全属性加成) || 0;
      const extremeBonus = extremeName
        ? (data.xiangujinshi_list.find(level => Number(level.level_id) === 8)?.极境?.[extremeName] || {})
        : {};
      player.攻击 = Math.trunc((beforeStats.攻击 + breakthroughBonus.攻击 + (Number(extremeBonus.攻击加成) || 0) + (Number(属性加成.攻击) || 0)) * (1 + allRate + (Number(属性加成.攻击加成) || 0)));
      player.防御 = Math.trunc((beforeStats.防御 + breakthroughBonus.防御 + (Number(extremeBonus.防御加成) || 0) + (Number(属性加成.防御) || 0)) * (1 + allRate + (Number(属性加成.防御加成) || 0)));
      player.血量上限 = Math.trunc((beforeStats.血量 + breakthroughBonus.血气 + (Number(extremeBonus.血量加成) || 0) + (Number(属性加成.血气) || 0)) * (1 + allRate + (Number(属性加成.血气加成) || 0)));
      player.血气上限 = player.血量上限;
      player.当前血量 = player.血量上限;
      player.血气 = player.血量上限;
      player.暴击率 = beforeStats.暴击率 + breakthroughBonus.暴击率 + (Number(属性加成.暴击加成 ?? 属性加成.暴撃加成 ?? 属性加成.暴击) || 0);
      await Write_player(player_qq, player);
      updatedPlayer = player;
    }

    const statGain = {
      攻击: Math.max(0, Math.trunc((Number(updatedPlayer.攻击) || 0) - beforeStats.攻击)),
      防御: Math.max(0, Math.trunc((Number(updatedPlayer.防御) || 0) - beforeStats.防御)),
      血量: Math.max(0, Math.trunc((Number(updatedPlayer.血量上限 || updatedPlayer.血气上限) || 0) - beforeStats.血量)),
      暴击率: Math.max(0, (Number(updatedPlayer.暴击率) || 0) - beforeStats.暴击率),
    };

    // 发送成功消息
    const rarityGlow = selectedSeed.品质 === '神话' ? '七彩神光' : 
                       selectedSeed.品质 === '传说' ? '金色光华' : 
                       selectedSeed.品质 === '稀有' ? '银色光辉' : '淡淡光芒';

    await e.reply([
      `【道种融合·成功！！！】`,
      ``,
      `${player.名号}体内道果轰然震动！`,
      `${selectedSeed.名称}化作一道流光，`,
      `冲入${player.名号}的丹田之中！`,
      ``,
      `【神火点燃】`,
      `在${rarityGlow}中，`,
      `${player.名号}体内神火熊熊燃起！`,
      `火焰映照九天，经久不熄！`,
      ``,
      `【境界突破】`,
      `尊者境 → 神火境`,
      ``,
      `【属性提升】`,
      `血量上限 +${statGain.血量.toLocaleString()}`,
      `攻击 +${statGain.攻击.toLocaleString()}`,
      `防御 +${statGain.防御.toLocaleString()}`,
      `暴击率 +${(statGain.暴击率 * 100).toFixed(1)}%`,
      ``,
      `【神火信息】`,
      `道种：${selectedSeed.名称}`,
      `品质：${selectedSeed.品质} | 神火：${_shQuality} | 类型：${selectedSeed.类型}`,
      `专属技能：${selectedSeed.专属技能 || '无'}`,
      extremeName ? `【道种极境】${extremeName}（修出第一道仙气）` : `【神火根基】已点燃，未达成顶级道种极境`,
      extremeName ? `后续：离开秘境后使用 #冲关极境，可依次挑战第二、第三道仙气` : ``,
      `${selectedSeed.额外效果 ? `额外效果：${selectedSeed.额外效果}` : ''}`,
      ``,
      `【获得称号】`,
      `${baseConfig?.神火境配置?.突破奖励?.称号 || '神火境修士'}`,
      ``,
      `【古史记载】`,
      `"神火既燃，便是踏入了仙途！`,
      `从此刻起，寿元大增，威能无限！"`
    ].join('\n'));

    return true;

  } catch (error) {
    console.error('道种融合失败:', error);
    return e.reply(`道种融合失败: ${error.message}`);
  }
}

async XianguViewShenhuo(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    const player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【神火查看·未入秘境】`,
        `${player.名号}尝试感应神火...`,
        `却发现此地并非仙古秘境！`,
        ``,
        `提示：需先进入仙古秘境（#进入仙古秘境）`
      ].join('\n'));
    }

    const shenhuo = player.xiangu_shenhuo;

    if (!shenhuo || !shenhuo.已点燃) {
      return e.reply([
        `【神火查看·尚未点燃】`,
        ``,
        `${player.名号}感应体内...`,
        `丹田空空如也，神火尚未点燃！`,
        ``,
        `【点燃神火方式】`,
        `• #点燃神火（自身苦修·下品）`,
        `• #服用XXX点燃神火（天材地宝·中品）`,
        `• #借助XX道种点燃神火（品质对应，顶级仙种修仙气）`,
        `• #祭炼真我（三千道火淬炼·唯一，火道禁区·修仙气）`,
        ``,
        `【道种孕育说明】`,
        `• 拥有道种 + 位于核心区域`,
        `• 道种品质越高，神火品质越高`,
        `• 11种顶级仙种可达成专属极境并修出仙气`,
        ``,
        `【古史记载】`,
        `"神火乃修士根基，不可轻视..."`
      ].join('\n'));
    }

    const xianqiCount = ensureXianqiState(player);
    const xianqiSources = player.xiangu_xianqi_detail.list
      .map(entry => `${entry.name}：${entry.src}`)
      .join('\n');

    // 计算神火持续时间
    const点燃时间 = new Date(shenhuo.点燃时间);
    const现在 = new Date();
    const持续小时 = Math.floor((现在 - 点燃时间) / (1000 * 60 * 60));
    const持续分钟 = Math.floor((现在 - 点燃时间) / (1000 * 60)) % 60;

    // 属性加成显示
    const 属性加成 = shenhuo.属性加成 || {};
    let attrList = [];
    if (属性加成.攻击) attrList.push(`攻击 +${属性加成.攻击}`);
    if (属性加成.防御) attrList.push(`防御 +${属性加成.防御}`);
    if (属性加成.血气) attrList.push(`血气上限 +${属性加成.血气}`);
    if (属性加成.暴击) attrList.push(`暴击率 +${属性加成.暴击.toFixed(2)}`);
    if (属性加成.穿透) attrList.push(`穿透率 +${属性加成.穿透.toFixed(2)}`);
    if (属性加成.恢复) attrList.push(`生命恢复 +${属性加成.恢复.toFixed(2)}`);
    if (属性加成.减伤) attrList.push(`减伤率 +${属性加成.减伤.toFixed(2)}`);
    if (属性加成.道韵加成) attrList.push(`道韵加成 +${属性加成.道韵加成.toFixed(2)}`);
    if (属性加成.全属性加成) attrList.push(`全属性加成 +${属性加成.全属性加成.toFixed(2)}`);

    const品质Icon = shenhuo.道种品质 === '神话' ? '🔥' : 
                     shenhuo.道种品质 === '传说' ? '✨' : 
                     shenhuo.道种品质 === '稀有' ? '💫' : '🌟';

    return e.reply([
      `【神火状态】${品质Icon}`,
      ``,
      `${player.名号}体内神火熊熊燃烧...`,
      ``,
      `【神火信息】`,
      `根基：${shenhuo.道种名称 || shenhuo.神火名称 || shenhuo.点燃方式 || shenhuo.路线 || '自身神火'}`,
      `品质：${shenhuo.神火品质 || shenhuo.道种品质 || '下品'} | 类型：${shenhuo.道种类型 || shenhuo.路线 || '自身修炼'}`,
      `仙气：${xianqiCount}/3道`,
      `点燃时间：${持续小时}小时${持续分钟}分钟前`,
      ``,
      xianqiSources ? `【仙气道果】\n${xianqiSources}` : `【仙气道果】尚未修出仙气`,
      ``,
      `【专属技能】`,
      shenhuo.专属技能 || '无专属技能',
      ``,
      attrList.length > 0 ? `【道种属性加成】\n${attrList.join('\n')}` : '',
      shenhuo.额外效果 ? `\n【额外效果】${shenhuo.额外效果}` : '',
      ``,
      `【后续提示】`,
      xianqiCount === 0
        ? `• 只有极品仙种或三千道火点燃神火时能修出第一道仙气`
        : xianqiCount < 3
          ? `• 离开秘境后使用 #冲关极境，继续挑战下一道仙气`
          : `• 三道仙气已在神火境内圆满`
    ].join('\n'));

  } catch (error) {
    console.error('查看神火失败:', error);
    return e.reply(`查看神火失败: ${error.message}`);
  }
}

// 点燃神火（快捷命令，简化版）
async XianguIgniteShenhuo(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    // 检查是否在秘境中
    if (!player.in_xiangu) {
      return e.reply([
        `【点燃神火·未入秘境】`,
        `需先进入仙古秘境才能点燃神火！`,
        `使用 #进入仙古秘境 进入秘境`
      ].join('\n'));
    }

    player = await prepareXianguMutation(e, player_qq, '点燃神火');
    if (!player) return false;

    // 检查是否已点燃神火
    if (player.xiangu_shenhuo && player.xiangu_shenhuo.已点燃) {
      return e.reply([
        `【点燃神火·已点燃】`,
        `你体内神火早已燃起！`,
        `使用 #查看神火 查看详情`
      ].join('\n'));
    }

    // 普通神火（T3·苦修）：自身修炼，按部就班自然引动，不依赖道种/外物
    if (player.xiangulevel_id < 7) {
      return e.reply([
        `【点燃神火·境界不足】`,
        `自身修炼点燃神火需在尊者境方可尝试，当前：${data.xiangujinshi_list.find(l => l.level_id === player.xiangulevel_id)?.level || '未知'}`
      ].join('\n'));
    }

    const energyNeed = 50000000;
    if (player.修为 < energyNeed || player.血气 < energyNeed) {
      return e.reply([
        `【点燃神火·根基未足】`,
        `苦修点燃神火需雄厚根基，当前修为/血气需各达 ${energyNeed.toLocaleString()}`,
        `继续修炼积累后再来`
      ].join('\n'));
    }

    await e.reply([
      `【点燃神火·苦修引动】`,
      ``,
      `${player.名号}盘膝而坐，引动全身精血与道果共鸣...`,
      `不借外物，不假道种，只凭自身积累自然引动神火。`,
      ``,
      `正在引动中...`
    ].join('\n'));

    await sleep(2000);

    const successRate = 0.6;
    if (Math.random() > successRate) {
      // 苦修失败：道基受创，修为略损，无材料损失
      const loss = Math.floor(player.修为 * 0.05);
      await Add_修为(player_qq, -loss);
      return e.reply([
        `【点燃神火·苦修失败】`,
        `${player.名号}苦修引动神火，却始终差一线契机...`,
        `道果震颤，神火未能成型。`,
        ``,
        `【损失】`,
        `修为 -${loss.toLocaleString()}（道基受创）`,
        ``,
        `"按部就班虽稳，然潜力有限，神火黯淡..."`
      ].join('\n'));
    }

    // 苦修成功：普通神火（下品），无极境、无仙气
    const breakthroughBonus = getShenhuoBreakthroughBonus();
    player.血气上限 += breakthroughBonus.血气;
    player.血气 = player.血气上限;
    player.攻击 += breakthroughBonus.攻击;
    player.防御 += breakthroughBonus.防御;
    player.暴击率 += breakthroughBonus.暴击率;
    player.xiangulevel_id = 8;

    player.xiangu_shenhuo = {
      已点燃: true,
      点燃方式: '苦修',
      神火品质: '下品',
      神火名称: '苦修·凡火',
      属性倍率: getFlameQualityRate('下品'),
      点燃时间: new Date().toISOString(),
      属性加成: {},
      突破前境界: 7,
      突破后境界: 8,
      极境达成: false
    };

    await Write_player(player_qq, player);

    return e.reply([
      `【神火点燃·成功（凡火）】`,
      ``,
      `${player.名号}自身修炼，终于引动神火！`,
      `神火虽黯淡，却也是踏入神道领域的根基。`,
      ``,
      `【境界突破】尊者境 → 神火境`,
      ``,
      `【神火品质】下品（凡火）`,
      `【提示】借助道种（#借助XX道种点燃神火）或祭炼真我（#祭炼真我）可点燃更强神火`,
      ``,
      `使用 #查看神火 查看详情`
    ].join('\n'));

  } catch (error) {
    console.error('点燃神火失败:', error);
    return e.reply(`点燃神火失败: ${error.message}`);
  }
}

// 服用丹药点燃神火（T2·天材地宝）
async XianguFuYongDanYao(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    if (!player.in_xiangu) {
      return e.reply([
        `【服用丹药·未入秘境】`,
        `需先进入仙古秘境才能服用丹药点燃神火！`,
        `使用 #进入仙古秘境 进入秘境`
      ].join('\n'));
    }

    player = await prepareXianguMutation(e, player_qq, '服丹点燃神火');
    if (!player) return false;

    if (player.xiangu_shenhuo && player.xiangu_shenhuo.已点燃) {
      return e.reply([
        `【服用丹药·已点燃】`,
        `你体内神火早已燃起！`,
        `使用 #查看神火 查看详情`
      ].join('\n'));
    }

    if (player.xiangulevel_id < 7) {
      return e.reply([
        `【服用丹药·境界不足】`,
        `服丹点燃神火需在尊者境方可尝试，当前：${data.xiangujinshi_list.find(l => l.level_id === player.xiangulevel_id)?.level || '未知'}`
      ].join('\n'));
    }

    // 解析丹药名称：#服用XXX点燃神火
    const medicine = e.msg.replace(/^#服用/, '').replace(/点燃神火$/, '').trim();
    if (!medicine) {
      return e.reply([
        `【服用丹药·未指定】`,
        `请指定要服用的丹药名称，`,
        `例如：#服用神火丹点燃神火`,
        ``,
        `可用丹药（需在纳戒中拥有）：`,
        `• 神火丹 → 中品神火（成功率70%）`,
        `• 九转神丹 → 上品神火（成功率85%）`
      ].join('\n'));
    }

    // 校验纳戒中是否拥有该丹药
    const hasItem = await exist_najie_thing(player_qq, medicine, '丹药');
    if (!hasItem) {
      return e.reply([
        `【服用丹药·丹药缺失】`,
        `${player.名号}翻遍纳戒，却找不到【${medicine}】！`,
        `需先获得该丹药（神火丹/九转神丹）方可服用点燃神火。`
      ].join('\n'));
    }

    // 丹药 → 神火品质/成功率映射
    const medicineMap = {
      '神火丹': { quality: '中品', rate: 0.7, glow: '赤红丹火' },
      '九转神丹': { quality: '上品', rate: 0.85, glow: '九彩丹霞' }
    };
    const cfg = medicineMap[medicine];
    if (!cfg) {
      return e.reply([
        `【服用丹药·无法炼化】`,
        `【${medicine}】并非点燃神火所需的天材地宝丹药。`,
        `目前支持：神火丹（中品）、九转神丹（上品）。`
      ].join('\n'));
    }

    // 消耗丹药
    await Add_najie_thing(player_qq, medicine, '丹药', -1);

    await e.reply([
      `【服用丹药·引动】`,
      ``,
      `${player.名号}取出【${medicine}】，`,
      `一口吞下，丹力如火山般在体内爆发！`,
      ``,
      `正在以天材地宝之力引动神火...`
    ].join('\n'));

    await sleep(2000);

    const successRate = cfg.rate;
    if (Math.random() > successRate) {
      return e.reply([
        `【服用丹药·炼化失败】`,
        `${player.名号}体内丹力失控，神火未能成型...`,
        `丹药已耗尽，道基受创。`,
        ``,
        `"天材虽好，然火性难驯..."`
      ].join('\n'));
    }

    // 成功：根据丹药品质点燃神火
    const breakthroughBonus = getShenhuoBreakthroughBonus();
    player.血气上限 += breakthroughBonus.血气;
    player.血气 = player.血气上限;
    player.攻击 += breakthroughBonus.攻击;
    player.防御 += breakthroughBonus.防御;
    player.暴击率 += breakthroughBonus.暴击率;
    player.xiangulevel_id = 8;

    const _shQuality = cfg.quality;
    player.xiangu_shenhuo = {
      已点燃: true,
      点燃方式: '天材地宝',
      丹药名称: medicine,
      神火品质: _shQuality,
      神火名称: medicine + '·神火',
      属性倍率: getFlameQualityRate(_shQuality),
      点燃时间: new Date().toISOString(),
      属性加成: {},
      突破前境界: 7,
      突破后境界: 8,
      极境达成: false
    };
    // 服丹（天材地宝）不修仙气；仅顶级仙种或祭炼真我可修仙气

    await Write_player(player_qq, player);

    return e.reply([
      `【神火点燃·成功（${_shQuality}）】`,
      ``,
      `${player.名号}服下【${medicine}】，`,
      `丹力化火，神火轰然燃起！`,
      ``,
      `【境界突破】尊者境 → 神火境`,
      ``,
      `【神火品质】${_shQuality}`,
      `【提示】顶级仙种或祭炼真我方可修出仙气`,
      ``,
      `使用 #查看神火 查看详情`
    ].join('\n'));

  } catch (error) {
    console.error('服用丹药失败:', error);
    return e.reply(`服用丹药失败: ${error.message}`);
  }
}

// 三千道火祭炼真我 - 隐藏神火路线
async XianguJilianZhenwo(e) {
  try {
    const usr_qq = e.user_id.toString().replace('qg_', '');
    const player_qq = await channel(usr_qq);
    let player = await Read_player(player_qq);

    if (!player.in_xiangu) {
      return e.reply('【祭炼真我·未入秘境】需先进入仙古秘境！');
    }

    player = await prepareXianguMutation(e, player_qq, '祭炼真我');
    if (!player) return false;

    if (player.xiangu_shenhuo && player.xiangu_shenhuo.已点燃) {
      return e.reply([
        `【祭炼真我·路线冲突】`,
        `${player.名号}体内已有神火燃烧，祭炼真我的道路已经封闭！`,
        `"神火已燃，道种已定，难再祭炼真我..."`
      ].join('\n'));
    }

    if (player.xiangulevel_id < 7) {
      return e.reply(`【祭炼真我·境界不足】需尊者境方可尝试，当前：${data.xiangujinshi_list.find(l => l.level_id === player.xiangulevel_id)?.level || '未知'}`);
    }

    // 核心检查：六大极境
    const requiredJijing = ['2','3','4','5','6','7'];
    const completed = player.极境 || [];
    const missing = requiredJijing.filter(j => !completed.includes(j));
    if (missing.length > 0) {
      const jm = { '2':'搬血','3':'洞天','4':'化灵','5':'铭文','6':'列阵','7':'尊者' };
      return e.reply([
        `【祭炼真我·极境未满】`,
        `${player.名号}欲走祭炼真我之路...`,
        `却发现道基尚有缺陷！`,
        ``,
        `缺失极境：${missing.map(m => jm[m]+'极境').join('、')}`,
        ``,
        `"祭炼真我，需道基无暇，六大极境缺一不可！"`
      ].join('\n'));
    }

    const location = player.xiangu_location || '边缘区域';
    if (location !== '火道禁区') {
      return e.reply(`【祭炼真我·场所不符】祭炼真我需在火道禁区·三千青石阶感悟大道，当前：${location}`);
    }

    const daoyun = player.xiangu_gains?.daoyun || 0;
    if (daoyun < 500) {
      return e.reply([
        `【祭炼真我·道韵不足】`,
        `需500点道韵方可感悟祭炼真我大道，`,
        `当前：${daoyun}点`,
        `多探索秘境积累道韵后再尝试`
      ].join('\n'));
    }

    // 消耗能量和道韵
    const breakthroughBonus = getShenhuoBreakthroughBonus();
    const baseEnergyNeed = 300000000;
    if (player.血气 < baseEnergyNeed || player.修为 < baseEnergyNeed) {
      return e.reply(`【祭炼真我·本源不足】需${baseEnergyNeed.toLocaleString()}修为和血气`);
    }

    await Add_血气(player_qq, -baseEnergyNeed);
    await Add_修为(player_qq, -baseEnergyNeed);

    // 满血进入渡劫（与遮天 enterTribulationState 行为一致：当前血量归 血量上限）
    if (player.血量上限) player.当前血量 = player.血量上限;

    // —— 祭炼真我·三千道火演出（道火洗礼，不是以身为种天谴）——
    // 文本演出与成功/失败判定在 XianguTribulation 中完成，本函数只负责最终状态写入
    const trib = new XianguTribulation();
    const tribResult = await trib.run(e, player, { completed, daoyun });

    if (!tribResult.success) {
      // 理论上的失败（当前置要求变更或成功率被调低时）——道火未能归一，境界跌落
      player.qi_level = Math.max(1, (player.qi_level || 5) - 1);
      // 渡劫演出已真实扣血，失败也回满血气+血量，避免玩家卡在濒死
      player.血气 = player.血气上限;
      if (player.血量上限) player.当前血量 = player.血量上限;
      await Write_player(player_qq, player);
      return e.reply([
        `【祭炼真我·天地不容！！！】`,
        ``,
        `${player.名号}祭炼真我，逆天而行！`,
        `三千道火未能归一，真我道基崩裂……`,
        `真我未成，境界跌落！`,
        ``,
        `"此路不通，天地不容！"`
      ].join('\n'));
    }

    const beforeStats = {
      攻击: Number(player.攻击) || 0,
      防御: Number(player.防御) || 0,
      血量: Number(player.血量上限 || player.血气上限) || 0,
    };
    player.xiangulevel_id = 8;

    player.xiangu_shenhuo = {
      已点燃: true,
      路线: '祭炼真我',
      极境达成: true,
      极境名称: '神火极境·祭炼真我',
      神火品质: '唯一',
      神火名称: '祭炼真我·唯一真火',
      属性倍率: 2.0,
      点燃时间: new Date().toISOString(),
      专属技能: '草字剑诀',
      额外效果: '不受秘境境界压制·天地共鸣'
    };
    // 第一道仙气：三千道火淬炼（祭炼真我）方式点燃神火即修出
    if (getXianqiStrands(player) === 0) grantXianqi(player, '祭炼真我·三千道火淬炼');
    // 道火精粹液：渡劫后万道火精炼而成，可日后淬体
    player.xiangu_daohuo_jingcui = (player.xiangu_daohuo_jingcui || 0) + 1;

    // 学习草字剑诀
    player.学习的功法 = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
    if (!player.学习的功法.includes('草字剑诀')) {
      player.学习的功法.push('草字剑诀');
    }

    await Write_player(player_qq, player);

    let updatedPlayer = player;
    try {
      const equipment = await Read_equipment(player_qq);
      await Write_equipment(player_qq, equipment);
      updatedPlayer = await Read_player(player_qq);
    } catch (equipmentError) {
      console.error('祭炼真我后装备属性同步失败:', equipmentError);
      const extremeBonus = data.xiangujinshi_list.find(level => Number(level.level_id) === 8)
        ?.极境?.['神火极境·祭炼真我'] || {};
      player.攻击 = beforeStats.攻击 + breakthroughBonus.攻击 + (Number(extremeBonus.攻击加成) || 0);
      player.防御 = beforeStats.防御 + breakthroughBonus.防御 + (Number(extremeBonus.防御加成) || 0);
      player.血量上限 = beforeStats.血量 + breakthroughBonus.血气 + (Number(extremeBonus.血量加成) || 0);
      player.血气上限 = player.血量上限;
      player.当前血量 = player.血量上限;
      player.血气 = player.血量上限;
      await Write_player(player_qq, player);
      updatedPlayer = player;
    }

    const statGain = {
      攻击: Math.max(0, Math.trunc((Number(updatedPlayer.攻击) || 0) - beforeStats.攻击)),
      防御: Math.max(0, Math.trunc((Number(updatedPlayer.防御) || 0) - beforeStats.防御)),
      血量: Math.max(0, Math.trunc((Number(updatedPlayer.血量上限 || updatedPlayer.血气上限) || 0) - beforeStats.血量)),
    };

    const revivedNote = tribResult.revived
      ? `\n（险死还生——道火焚身之际先由功法复活，随后继续结算功法减伤，最终保住真我）`
      : '';
    await e.reply([
      `【祭炼真我·天地共鸣！！！】`,
      ``,
      `${player.名号}祭炼真我，逆天成功！`,
      `三千大道火光归一，肉身与元神熬炼无瑕！`,
      `一道绝世剑意从体内冲出——`,
      `草字剑诀！`,
      ``,
      `【神火点燃】`,
      `不借外物，祭炼真我，`,
      `天地间唯一不灭的真火燃起！`,
      `神火品质：唯一 ×2.0倍率`,
      ``,
      `【属性提升】`,
      `攻击 +${statGain.攻击.toLocaleString()}`,
      `防御 +${statGain.防御.toLocaleString()}`,
      `血量上限 +${statGain.血量.toLocaleString()}`,
      ``,
      `【获得神通】`,
      `草字剑诀·万古最强攻伐之术`,
      ``,
      `【渡劫造化】`,
      `道火精粹液 ×1（万道火精炼，可日后淬体）`,
      ``,
      `【称号】`,
      `祭炼真我`,
      ``,
      `【仙气极境】`,
      `第一道仙气已成；离开秘境后使用 #冲关极境，可依次挑战第二、第三道仙气。`,
      ``,
      `"此道开创，万古未有！"${revivedNote}`
    ].join('\n'));

  } catch (error) {
    console.error('祭炼真我失败:', error);
    // 演出中途异常时，尽量把血气+血量回满，避免玩家卡在濒死状态
    try {
      player.血气 = player.血气上限;
      if (player.血量上限) player.当前血量 = player.血量上限;
      await Write_player(player_qq, player);
    } catch (_) { /* 忽略二次写入错误 */ }
    return e.reply(`祭炼真我失败: ${error.message}`);
  }
}

async XianguYiShenWeiZhong(e) {
  const usr_qq = e.user_id.toString().replace('qg_', '');
  const player_qq = await channel(usr_qq);
  const player = await Read_player(player_qq);

  if (Number(player.xiangulevel_id) < 11) {
    const realm = data.xiangujinshi_list.find(l => Number(l.level_id) === Number(player.xiangulevel_id))?.level || '未知';
    return e.reply([
      `【以身为种·境界不足】`,
      `以身为种是天神绝巅冲击虚道境的道路，并非尊者境点燃神火之法。`,
      `当前境界：${realm}；需先达到天神境。`
    ].join('\n'));
  }

  if (Number(player.xiangulevel_id) > 11) {
    return e.reply('【以身为种】你已越过虚道境，无需再次欺天种道。');
  }

  return e.reply([
    `【以身为种·道路已明】`,
    `${player.名号}已至天神绝巅，可舍弃外界道种，以人体为种开启体内众门。`,
    `使用 #冲关，引动上苍天谴并冲击虚道境。`
  ].join('\n'));
}

  // ==================== 步骤4：战斗系统与PvP机制 ====================

  // PvP攻击 - 在秘境中攻击其他玩家
  async XianguPvPAttack(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      let player = await Read_player(player_qq);

      // 检查是否在秘境中
      if (!player.in_xiangu) {
        return e.reply([
          `【PvP·未入秘境】`,
          `${player.名号}欲寻敌厮杀，却发现身不在仙古秘境！`,
          `提示：需先进入仙古秘境才可攻击其他玩家`
        ].join('\n'));
      }

      // 获取目标玩家
      const target_qq = e.at || e.message?.find(m => m.type === 'at')?.qq;
      if (!target_qq) {
        return e.reply([
          `【PvP·无目标】`,
          `【说明】使用 #秘境攻击 @玩家 来攻击秘境中的其他修士`,
          ``,
          `【秘境法则】`,
          `仙古秘境不设规则，弱肉强食！`,
          `攻击其他修士会累积凶名值`,
          `高凶名者可能被各方势力悬赏`
        ].join('\n'));
      }

      const targetRawId = target_qq.toString().replace('qg_', '');
      const targetId = await channel(targetRawId);
      let targetPlayer = await Read_player(targetId);

      if (!targetPlayer || !targetPlayer.in_xiangu) {
        return e.reply(`目标不在仙古秘境中，无法攻击！`);
      }

      if (String(targetId) === String(player_qq)) {
        return e.reply(`【自戕无益】修行不易，何必自残？`);
      }

      // 检查是否同一区域
      let location = player.xiangu_location || '边缘区域';
      const targetLocation = targetPlayer.xiangu_location || '边缘区域';
      if (location !== targetLocation) {
        return e.reply([
          `【PvP·不在同一区域】`,
          `${player.名号}感应四周，未发现目标的气息...`,
          ``,
          `【区域信息】`,
          `当前位置：${location}`,
          `目标位置：${targetLocation}`,
          ``,
          `提示：双方需在同一区域内才能交战`
        ].join('\n'));
      }

      const attackerAction = await prepareXianguAction(player_qq);
      if (attackerAction.busy) {
        return e.reply('【撤离结算中】攻击方正在完成撤离，本次攻击未执行。');
      }
      player = attackerAction.player;
      if (!player?.in_xiangu) return e.reply('【撤离已完成】本次攻击未执行。');

      // 检查凶名惩罚（高凶名者攻击时消耗道韵）
      const infamy = player.xiangu_infamy || 0;
      if (infamy > 100) {
        const daoyun = (player.xiangu_gains?.daoyun || 0);
        if (daoyun < 50) {
          return e.reply([
            `【PvP·道韵不足】`,
            `${player.名号}凶名赫赫，欲再行杀戮，`,
            `却被秘境法则排斥——道韵不足以镇压杀意！`,
            ``,
            `凶名值：${infamy}`,
            `当前道韵：${daoyun}`,
            `攻击所需：50道韵`,
            `提示：先行探索积累道韵`
          ].join('\n'));
        }
        player.xiangu_gains.daoyun = Math.max(0, daoyun - 50);
      }

      const defenderAction = await prepareXianguAction(targetId);
      if (defenderAction.busy) {
        return e.reply('【目标正在撤离】对方已进入最终结算，本次攻击未执行。');
      }
      targetPlayer = defenderAction.player;
      if (!targetPlayer?.in_xiangu) {
        return e.reply('【目标已离开】对方已经完成撤离，本次攻击未执行。');
      }
      const currentLocation = player.xiangu_location || '边缘区域';
      const currentTargetLocation = targetPlayer.xiangu_location || '边缘区域';
      if (currentLocation !== currentTargetLocation) {
        return e.reply('【位置变化】交战双方已不在同一区域，本次攻击未执行。');
      }
      location = currentLocation;
      if (attackerAction.cancelled || defenderAction.cancelled) {
        await e.reply('【撤离中断】杀机惊动秘境法则，交战双方正在维持的撤离通道均已崩散。');
      }

      const battleSides = buildXianguBattleSides(player, targetPlayer, {
        attackerId: player_qq,
        defenderId: targetId,
      });
      const Data_battle = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_pvp' });
      const leaderWinner = resolveXianguLeaderWinner(Data_battle);
      const msg = Data_battle.msg;

      // 拼接战斗消息
      let resultMsg = [
        `【仙古秘境·修士之战】`,
        ``,
        `战场：${location}`,
        `攻击方：${player.名号}`,
        `防守方：${targetPlayer.名号}`,
        ...battleSides.messages,
        ``,
        `━━━━ 战斗过程 ━━━━`,
        ...msg,
        `━━━━ 战斗结果 ━━━━`
      ];

      if (leaderWinner === 'A') {
        let targetForcedExit = false;
        // 攻击方胜利
        const infamyGain = Math.floor(Math.random() * 20) + 10 + (location === '核心区域' ? 20 : location === '深层区域' ? 10 : 0);
        player.xiangu_infamy = (player.xiangu_infamy || 0) + infamyGain;
        player.xiangu_kills = (player.xiangu_kills || 0) + 1;
        player.xiangu_gains = player.xiangu_gains || {};
        player.xiangu_gains.xiongmng = (player.xiangu_gains.xiongmng || 0) + infamyGain;

        // 击杀奖励：灵石和修为
        const killRewardLingshi = Math.floor(1000 * (1 + infamyGain / 10));
        const killRewardXiuwei = Math.floor(200 * infamyGain);
        const killRewards = await grantXianguGrowthRewards(player, player_qq, {
          lingshi: killRewardLingshi,
          xiuwei: killRewardXiuwei,
        });

        // 掉落判定 - 50%几率掠夺对方一件物品/道种
        let lootMsg = '';
        if (Math.random() < 0.5) {
          // 优先掠夺道种
          if (targetPlayer.xiangu_seeds && targetPlayer.xiangu_seeds.length > 0) {
            const stolenSeed = targetPlayer.xiangu_seeds.splice(Math.floor(Math.random() * targetPlayer.xiangu_seeds.length), 1)[0];
            grantXianguSeed(player, stolenSeed);
            lootMsg = `掠夺道种：${stolenSeed.名称} [${stolenSeed.品质}]`;
          } else if (targetPlayer.纳戒 && targetPlayer.纳戒.length > 0) {
            // 掠夺纳戒随机物品
            const stolenItem = targetPlayer.纳戒.splice(Math.floor(Math.random() * targetPlayer.纳戒.length), 1)[0];
            await addXianguSpoil(player_qq, stolenItem.名称 || stolenItem.name, 1);
            lootMsg = `掠夺物品：${stolenItem.名称 || stolenItem.name}`;
          }
        }
        if (lootMsg) resultMsg.push(lootMsg);

        // 被击败者受损
        const hpLoss = Math.floor(targetPlayer.当前血量 * 0.5);
        targetPlayer.当前血量 = Math.max(1, targetPlayer.当前血量 - hpLoss);
        applyXianguHeavyInjury(targetPlayer);

        const arenaWin = XIANGU_EVENTS.activeEvent?.type === 'arena' &&
          XIANGU_EVENTS.activeEvent.endTime > Date.now() &&
          recordXianguArenaWin(XIANGU_EVENTS.arenaParticipants, player_qq, targetId);

        resultMsg.push(
          `战斗结果：${player.名号}胜！`,
          `凶名值 +${infamyGain}（累计：${player.xiangu_infamy}）`,
          `击杀数：${player.xiangu_kills}`,
          `灵石奖励 +${killRewards.lingshi.toLocaleString()}`,
          `修为奖励 +${killRewards.xiuwei.toLocaleString()}`,
          ...(arenaWin ? [`仙古擂台胜场 +1`] : [])
        );

        // 检查是否需要强制撤离（生命值过低）
        const targetMaxHp = Number(targetPlayer.血量上限 || targetPlayer.血气上限) || 1;
        if (targetPlayer.当前血量 < targetMaxHp * 0.1) {
          resultMsg.push(``, `${targetPlayer.名号}伤势过重，被秘境法则强行送离！`);
          const targetSummary = buildXianguRunSummary(
            targetPlayer,
            await readXianguNajie(targetId),
            Date.now()
          );
          targetSummary.exitMode = 'forced';
          targetSummary.exitReason = 'defeated';
          clearXianguSessionState(targetPlayer, targetSummary);
          targetForcedExit = true;
        }

        await Write_player(player_qq, player);
        await Write_player(targetId, targetPlayer);
        if (targetForcedExit) {
          const forcedExitTime = Date.now();
          try {
            await clearXianguRedisSession(targetId);
            await setXianguCooldown(targetId, targetId, forcedExitTime);
          } catch (redisError) {
            console.error('清理被击败玩家的仙古秘境Redis会话失败:', redisError);
          }
        }

      } else if (leaderWinner === 'B') {
        let playerForcedExit = false;
        // 防守方胜利
        const daoyunGain = Math.floor(Math.random() * 20) + 5;
        targetPlayer.xiangu_gains = targetPlayer.xiangu_gains || {};
        targetPlayer.xiangu_gains.daoyun = (targetPlayer.xiangu_gains.daoyun || 0) + daoyunGain;

        const hpLoss = Math.floor(player.当前血量 * 0.4);
        player.当前血量 = Math.max(1, player.当前血量 - hpLoss);
        applyXianguHeavyInjury(player);
        const arenaWin = XIANGU_EVENTS.activeEvent?.type === 'arena' &&
          XIANGU_EVENTS.activeEvent.endTime > Date.now() &&
          recordXianguArenaWin(XIANGU_EVENTS.arenaParticipants, targetId, player_qq);

        resultMsg.push(
          `战斗结果：${targetPlayer.名号}胜！`,
          `防御成功，道韵领悟 +${daoyunGain}`,
          `攻击方${player.名号}负伤，血气 -${hpLoss.toLocaleString()}`,
          ...(arenaWin ? [`仙古擂台胜场 +1`] : [])
        );

        const playerMaxHp = Number(player.血量上限 || player.血气上限) || 1;
        if (player.当前血量 < playerMaxHp * 0.1) {
          resultMsg.push(``, `${player.名号}伤势过重，被秘境法则强行送离！`);
          const playerSummary = buildXianguRunSummary(
            player,
            await readXianguNajie(player_qq),
            Date.now()
          );
          playerSummary.exitMode = 'forced';
          playerSummary.exitReason = 'defeated';
          clearXianguSessionState(player, playerSummary);
          playerForcedExit = true;
        }

        await Write_player(player_qq, player);
        await Write_player(targetId, targetPlayer);
        if (playerForcedExit) {
          const forcedExitTime = Date.now();
          try {
            await clearXianguRedisSession(player_qq, usr_qq);
            await setXianguCooldown(player_qq, usr_qq, forcedExitTime);
          } catch (redisError) {
            console.error('清理被击败玩家的仙古秘境Redis会话失败:', redisError);
          }
        }

      } else {
        // 平局
        resultMsg.push(`战斗结果：双方不分胜负，各自退去`);

        await Write_player(player_qq, player);
        await Write_player(targetId, targetPlayer);
      }

      resultMsg.push(``, `【秘境法则】`, `弱肉强食，适者生存`);

      return e.reply(resultMsg.join('\n'));

    } catch (error) {
      console.error('秘境PvP攻击失败:', error);
      return e.reply(`秘境攻击失败: ${error.message}`);
    }
  }

  // PvP切磋 - 无惩罚战斗
  async XianguPvPSpar(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      let player = await Read_player(player_qq);

      if (!player.in_xiangu) {
        return e.reply(`【切磋·未入秘境】切磋需在仙古秘境内进行`);
      }

      const target_qq = e.at || e.message?.find(m => m.type === 'at')?.qq;
      if (!target_qq) {
        return e.reply(`【切磋】请使用 #秘境切磋 @玩家 来与其他修士切磋道法`);
      }

      const targetRawId = target_qq.toString().replace('qg_', '');
      const targetId = await channel(targetRawId);
      let targetPlayer = await Read_player(targetId);

      if (!targetPlayer || !targetPlayer.in_xiangu) {
        return e.reply(`目标不在仙古秘境中，无法切磋！`);
      }

      if (String(targetId) === String(player_qq)) {
        return e.reply(`【独修无益】与自身切磋并无寸进`);
      }

      let location = player.xiangu_location || '边缘区域';
      const targetLocation = targetPlayer.xiangu_location || '边缘区域';
      if (location !== targetLocation) {
        return e.reply(`双方不在同一区域，无法切磋！`);
      }

      const attackerAction = await prepareXianguAction(player_qq);
      if (attackerAction.busy) {
        return e.reply('【撤离结算中】发起方正在完成撤离，本次切磋未执行。');
      }
      const defenderAction = await prepareXianguAction(targetId);
      if (defenderAction.busy) {
        return e.reply('【目标正在撤离】对方已进入最终结算，本次切磋未执行。');
      }
      player = attackerAction.player;
      targetPlayer = defenderAction.player;
      if (!player?.in_xiangu || !targetPlayer?.in_xiangu) {
        return e.reply('【切磋取消】一方已经完成撤离。');
      }
      if ((player.xiangu_location || '边缘区域') !== (targetPlayer.xiangu_location || '边缘区域')) {
        return e.reply('【切磋取消】双方位置已经发生变化。');
      }
      location = player.xiangu_location || '边缘区域';
      if (attackerAction.cancelled || defenderAction.cancelled) {
        await e.reply('【撤离中断】交手引动法则波动，双方正在维持的撤离通道均已崩散。');
      }

      const battleSides = buildXianguBattleSides(player, targetPlayer, {
        attackerId: player_qq,
        defenderId: targetId,
      });
      const Data_battle = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_spar' });
      const leaderWinner = resolveXianguLeaderWinner(Data_battle);
      const msg = Data_battle.msg;

      let resultMsg = [
        `【仙古秘境·以道会友】`,
        ``,
        `${player.名号}与${targetPlayer.名号}于${location}切磋道法`,
        ...battleSides.messages,
        `━━━━ 精 彩 对 决 ━━━━`,
        ...msg,
        `━━━━ 结 束 ━━━━`
      ];

      if (leaderWinner === 'A') {
        resultMsg.push(`${player.名号}技高一筹！`);
      } else if (leaderWinner === 'B') {
        resultMsg.push(`${targetPlayer.名号}略胜一筹！`);
      } else {
        resultMsg.push(`双方平分秋色！`);
      }

      resultMsg.push(``, `友情切磋，不伤和气`);

      await Write_player(player_qq, player);
      await Write_player(targetId, targetPlayer);

      return e.reply(resultMsg.join('\n'));

    } catch (error) {
      console.error('秘境切磋失败:', error);
      return e.reply(`秘境切磋失败: ${error.message}`);
    }
  }

  // 查看凶名 - 查看当前秘境凶名值及效果
  async XianguInfamy(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);

      const infamy = player.xiangu_infamy || 0;

      // 凶名等级划分
      let title, effects, desc;
      if (infamy === 0) {
        title = '清白之身';
        effects = ['· 无任何负面效果'];
        desc = '未染鲜血，道心清明';
      } else if (infamy < 30) {
        title = '初染杀业';
        effects = ['· NPC交易价格上浮5%'];
        desc = '手上沾了些许血腥，部分NPC对你保持警惕';
      } else if (infamy < 60) {
        title = '小有名声';
        effects = ['· NPC交易价格上浮15%', '· 善良阵营NPC可能拒绝交易'];
        desc = '凶名渐起，善良之辈见你绕道而行';
      } else if (infamy < 100) {
        title = '凶名赫赫';
        effects = ['· NPC交易价格上浮30%', '· 善良阵营NPC敌视', '· 中立阵营NPC警惕'];
        desc = '所过之处，人人自危';
      } else if (infamy < 200) {
        title = '血手人屠';
        effects = ['· NP交易价格上浮50%', '· 善良/中立阵营NPC敌视', '· 邪恶阵营NPC敬畏（交易优惠20%）', '· 可能被悬赏'];
        desc = '杀戮成性，已在秘境中留下赫赫凶名';
      } else {
        title = '魔头降世';
        effects = ['· 善良/中立阵营NPC攻击你', '· 邪恶阵营NPC追随', '· 高概率被悬赏', '· 道韵消耗加倍'];
        desc = '秘境法则都已对你产生警惕，各方修士欲除之而后快！';
      }

      const msg = [
        `【仙古秘境·凶名簿】`,
        ``,
        `修士：${player.名号}`,
        `凶名值：${infamy}`,
        `凶名等级：${title}`,
        ``,
        `【效果说明】`,
        ...effects,
        ``,
        `【概述】`,
        desc,
        ``,
        infamy >= 100 ? `【悬赏】高危凶名！使用 #秘境悬赏 可被其他修士追杀` : `提示：保持低凶名值有利于秘境探索`
      ];

      return e.reply(msg.join('\n'));

    } catch (error) {
      console.error('查看凶名失败:', error);
      return e.reply(`查看凶名失败: ${error.message}`);
    }
  }

  // 秘境悬赏 - 查看/发布悬赏
  async XianguBounty(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);

      if (!player.in_xiangu) {
        return e.reply(`【悬赏·未入秘境】悬赏系统仅在仙古秘境中可用`);
      }

      // 获取秘境配置中的悬赏列表
      const configPath = data.filePathMap.xianguSecretPlace || 
        path.join(process.cwd(), 'data', 'xianguSecretPlace.json');
      let xianguConfig = {};
      try {
        if (fs.existsSync(configPath)) {
          xianguConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      } catch (err) {}

      // 获取所有在线玩家的凶名值
      const bounties = [];
      const playerDataDir = path.join(process.cwd(), 'data', 'xiuxian_player');
      if (fs.existsSync(playerDataDir)) {
        const files = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const pdata = JSON.parse(fs.readFileSync(path.join(playerDataDir, file), 'utf8'));
            if (pdata.in_xiangu && (pdata.xiangu_infamy || 0) >= 50) {
              bounties.push({
                名号: pdata.名号,
                infamy: pdata.xiangu_infamy,
                location: pdata.xiangu_location,
                bounty: Math.floor(pdata.xiangu_infamy * 100)
              });
            }
          } catch (err) {}
        }
      }

      if (bounties.length === 0) {
        return e.reply([
          `【仙古秘境·悬赏榜】`,
          ``,
          `秘境祥和，暂无悬赏目标`,
          ``,
          `悬赏规则：`,
          `· 凶名值≥50的修士自动上榜`,
          `· 赏金 = 凶名值 × 100灵石`,
          `· 使用 #秘境悬赏 @目标 接取悬赏`
        ].join('\n'));
      }

      bounties.sort((a, b) => b.infamy - a.infamy);

      let msg = [
        `【仙古秘境·悬赏榜】`,
        `━━━━━━━━━━━━━━━━`,
        `排名  修士          凶名    赏金      位置`,
        `━━━━━━━━━━━━━━━━`
      ];

      bounties.slice(0, 10).forEach((b, i) => {
        const name = b.名号.padEnd(10, ' ');
        const infamy = String(b.infamy).padStart(4);
        const bounty = String((b.bounty / 10000).toFixed(1) + '万').padStart(6);
        const loc = b.location.padEnd(4);
        msg.push(`${String(i + 1).padStart(2)}    ${name}  ${infamy}   ${bounty}   ${loc}`);
      });

      msg.push(`━━━━━━━━━━━━━━━━`);
      msg.push(``, `使用 #秘境悬赏 @目标 接取悬赏任务`);

      return e.reply(msg.join('\n'));

    } catch (error) {
      console.error('秘境悬赏失败:', error);
      return e.reply(`秘境悬赏失败: ${error.message}`);
    }
  }

  // 秘境杀戮榜 - 查看秘境击杀排名
  async XianguKillRank(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);

      // 收集所有在线玩家的击杀数据
      const rankList = [];
      const playerDataDir = path.join(process.cwd(), 'data', 'xiuxian_player');
      if (fs.existsSync(playerDataDir)) {
        const files = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          try {
            const pdata = JSON.parse(fs.readFileSync(path.join(playerDataDir, file), 'utf8'));
            if (pdata.in_xiangu || (pdata.xiangu_infamy || 0) > 0) {
              rankList.push({
                名号: pdata.名号,
                infamy: pdata.xiangu_infamy || 0,
                kills: pdata.xiangu_kills || 0,
                online: pdata.in_xiangu || false
              });
            }
          } catch (err) {}
        }
      }

      if (rankList.length === 0) {
        return e.reply(`【杀戮榜】暂无数据`);
      }

      rankList.sort((a, b) => b.infamy - a.infamy);

      let msg = [
        `【仙古秘境·杀戮榜】`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `排名  修士          凶名    击杀    状态`,
        `━━━━━━━━━━━━━━━━━━━━`
      ];

      rankList.slice(0, 15).forEach((r, i) => {
        const name = r.名号.padEnd(10, ' ');
        const infamy = String(r.infamy).padStart(5);
        const kills = String(r.kills).padStart(4);
        const status = r.online ? '秘境中' : '已离开';
        msg.push(`${String(i + 1).padStart(2)}    ${name}  ${infamy}    ${kills}    ${status}`);
      });

      msg.push(`━━━━━━━━━━━━━━━━━━━━`);
      msg.push(``, `数据统计时间：实时`);

      return e.reply(msg.join('\n'));

    } catch (error) {
      console.error('查看杀戮榜失败:', error);
      return e.reply(`查看杀戮榜失败: ${error.message}`);
    }
  }

  // ==================== 步骤5：动态事件与NPC生态 ====================

  // 查看秘境事件列表
  async XianguEventList(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      return XianguEventListFn(e, player);
    } catch (error) {
      console.error('查看秘境事件失败:', error);
      return e.reply(`查看事件失败: ${error.message}`);
    }
  }

  // 仙古擂台
  async XianguArena(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply(`【擂台·未入秘境】需先进入仙古秘境`);
      return XianguArenaFn(e, player, player_qq);
    } catch (error) {
      console.error('仙古擂台失败:', error);
      return e.reply(`仙古擂台失败: ${error.message}`);
    }
  }

  // 参与仙古擂台
  async XianguArenaJoin(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      let player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply(`【擂台·未入秘境】需先进入仙古秘境`);
      const actionState = await prepareXianguAction(player_qq);
      if (actionState.busy) {
        return e.reply('【撤离结算中】本次擂台挑战未执行。');
      }
      player = actionState.player;
      if (!player?.in_xiangu) return e.reply('【撤离已完成】本次擂台挑战未执行。');
      if (actionState.cancelled) {
        await e.reply('【撤离中断】你选择登上擂台，撤离通道随之消散。');
      }
      return XianguArenaJoinFn(e, player, player_qq);
    } catch (error) {
      console.error('参与擂台失败:', error);
      return e.reply(`参与擂台失败: ${error.message}`);
    }
  }

  // 与NPC交谈
  async XianguNPCTalk(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await prepareXianguMutation(e, player_qq, '与NPC交谈');
      if (!player) return false;
      return XianguNPCTalkFn(e, player, player_qq);
    } catch (error) {
      console.error('与NPC交谈失败:', error);
      return e.reply(`与NPC交谈失败: ${error.message}`);
    }
  }

  // 向NPC购买
  async XianguNPCBuy(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const itemName = e.msg.replace('#向NPC购买', '').trim();
      const player = itemName
        ? await prepareXianguMutation(e, player_qq, '向NPC购买物品')
        : await Read_player(player_qq);
      if (!player) return false;
      if (!player.in_xiangu) return e.reply(`【NPC购买·未入秘境】需先进入仙古秘境`);
      return XianguNPCBuyFn(e, player, player_qq);
    } catch (error) {
      console.error('NPC购买失败:', error);
      return e.reply(`NPC购买失败: ${error.message}`);
    }
  }

  // 攻击NPC
  async XianguNPCAttack(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      let player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply(`【攻击NPC·未入秘境】需先进入仙古秘境`);
      const actionState = await prepareXianguAction(player_qq);
      if (actionState.busy) {
        return e.reply('【撤离结算中】本次攻击未执行。');
      }
      player = actionState.player;
      if (!player?.in_xiangu) return e.reply('【撤离已完成】本次攻击未执行。');
      if (actionState.cancelled) {
        await e.reply('【撤离中断】你主动发起战斗，撤离通道随之消散。');
      }
      return XianguNPCAttackFn(e, player, player_qq);
    } catch (error) {
      console.error('攻击NPC失败:', error);
      return e.reply(`攻击NPC失败: ${error.message}`);
    }
  }

  // 查看阵营
  async XianguFaction(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      return XianguFactionFn(e, player);
    } catch (error) {
      console.error('查看阵营失败:', error);
      return e.reply(`查看阵营失败: ${error.message}`);
    }
  }

  // 献祭道种
  async XianguOfferSeed(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await prepareXianguMutation(e, player_qq, '献祭道种');
      if (!player) return false;
      return XianguOfferSeedFn(e, player, player_qq);
    } catch (error) {
      console.error('献祭道种失败:', error);
      return e.reply(`献祭道种失败: ${error.message}`);
    }
  }

  // ====== NPC生态命令入口 ======

  // 搜魂NPC
  async XianguSoulSearchNPC(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await prepareXianguMutation(e, player_qq, '搜魂NPC');
      if (!player) return false;
      return XianguSoulSearchNPCFn(e, player, player_qq);
    } catch (error) {
      console.error('搜魂NPC失败:', error);
      return e.reply(`搜魂失败: ${error.message}`);
    }
  }

  // 查看NPC好感
  async XianguNPCRelation(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply(`需先进入仙古秘境`);
      return XianguNPCRelationFn(e, player);
    } catch (error) {
      console.error('查看NPC好感失败:', error);
      return e.reply(`查看失败: ${error.message}`);
    }
  }

  // NPC组队
  async XianguNPCTeam(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await prepareXianguMutation(e, player_qq, '与NPC组队');
      if (!player) return false;
      return XianguNPCTeamFn(e, player, player_qq);
    } catch (error) {
      console.error('NPC组队失败:', error);
      return e.reply(`组队失败: ${error.message}`);
    }
  }

  // 解除组队
  async XianguNPCTeamLeave(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await prepareXianguMutation(e, player_qq, '解除NPC组队');
      if (!player) return false;
      return XianguNPCTeamLeaveFn(e, player, player_qq);
    } catch (error) {
      console.error('解除组队失败:', error);
      return e.reply(`解除失败: ${error.message}`);
    }
  }

  // ====== 阵营命令入口 ======
  // 阵营任务
  async XianguFactionQuest(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await prepareXianguMutation(e, player_qq, '处理阵营任务');
      if (!player) return false;
      return XianguFactionQuestFn(e, player, player_qq);
    } catch (error) {
      console.error('阵营任务失败:', error);
      return e.reply(`阵营任务失败: ${error.message}`);
    }
  }
  // 阵营商店
  async XianguFactionShop(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply(`需先进入仙古秘境`);
      return XianguFactionShopFn(e, player, player_qq);
    } catch (error) {
      console.error('阵营商店失败:', error);
      return e.reply(`阵营商店失败: ${error.message}`);
    }
  }
  // 阵营排行
  async XianguFactionRank(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply(`需先进入仙古秘境`);
      return XianguFactionRankFn(e, player);
    } catch (error) {
      console.error('阵营排行失败:', error);
      return e.reply(`阵营排行失败: ${error.message}`);
    }
  }

  // 秘境目标：显示进度面板
  async XianguGoal(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply('需先进入仙古秘境！');
      
      const daoyun = player.xiangu_gains?.daoyun || 0;
      const location = player.xiangu_location || '边缘区域';
      const hasShenhuo = player.xiangu_shenhuo?.已点燃;
      const isJilian = ['以身为种', '祭炼真我'].includes(player.xiangu_shenhuo?.路线);
      
      let goalText = '';
      if (hasShenhuo) {
        goalText = player.xiangu_shenhuo.极境达成 ?
          `✅ 神火已点燃·极境达成（${player.xiangu_shenhuo.极境名称 || player.xiangu_shenhuo.点燃方式}）` :
          `🔶 神火已燃（${player.xiangu_shenhuo.神火品质}）`;
      } else if (isJilian) {
        goalText = '🔶 祭炼真我路线：需火道禁区 + 500道韵 + 六大极境';
      } else {
        const needDaoyun = Math.max(0, 100 - daoyun);
        goalText = `🔶 距点燃神火：还需${needDaoyun > 0 ? needDaoyun+'道韵' : '道韵已足！'}`;
      }
      
      return e.reply([
        `【仙古秘境·探索目标】`,
        ``,
        `当前位置：${location}`,
        `当前道韵：${daoyun}点`,
        `拥有道种：${player.xiangu_seeds?.length || 0}个`,
        ``,
        `【目标进度】`,
        goalText,
        ``,
        `【点燃神火·四种方式】`,
        `① #点燃神火（自身苦修·下品）`,
        `② #服用XXX点燃神火（天材地宝·中品）`,
        `③ #借助XX道种点燃神火（品质对应，顶级仙种修仙气）`,
        `④ #祭炼真我（三千道火淬炼·唯一，火道禁区·修仙气）`,
        ``,
        `【快捷提示】`,
        daoyun >= 500 ? `→ #祭炼真我 尝试最强路线（需六大极境·火道禁区）` : `→ 道韵不足（${daoyun}/500），继续探索`,
        location !== '核心区域' ? `→ #秘境移动 核心区域（借助道种点燃需在核心区域）` : `→ 已在核心区域，可借助道种点燃神火！`
      ].join('\n'));
    } catch (err) {
      console.error('探索目标查询失败:', err);
    }
  }

  // 主动寻找NPC
  async XianguFindNPC(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      const player = await Read_player(player_qq);
      if (!player.in_xiangu) return e.reply('需先进入仙古秘境！');
      
      const location = player.xiangu_location || '边缘区域';
      const npcs = getNPCsForPlayer(location, player.xiangu_infamy || 0);
      if (npcs.length === 0) return e.reply(`【寻找NPC】在${location}没有发现任何修士的踪迹...`);
      
      const lines = [`【寻找NPC·${location}】`, '', `${player.名号}放出神识，搜索周围的修士...`, ''];
      for (const npc of npcs) {
        const tag = npc.isCanon ? '【原著天骄】' : npc.hostile ? '⚠️敌意' : npc.faction === 'good' ? '✦善良' : npc.faction === 'evil' ? '▼邪恶' : '◆中立';
        const tradeTag = npc.trade ? '💱可交易' : '';
        lines.push(`${tag} ${npc.name || npc.名号} ${tradeTag}`);
        lines.push(`  ${npc.desc || npc.title || ''}`);
        if (npc.dialogs && npc.dialogs.length > 0) lines.push(`  "${npc.dialogs[0]}"`);
        if (npc.trade) lines.push(`  出售：${npc.trade.items?.map(i => i.name).join('、') || '无'}`);
        lines.push('');
      }
      
      lines.push('使用 #与NPC交谈 或 #攻击NPC 与目标交互');
      return e.reply(lines.join('\n'));
    } catch (err) {
      console.error('寻找NPC失败:', err);
    }
  }

  // 处理探索方向选择
  async XianguExploreChoice(e) {
    try {
      const usr_qq = e.user_id.toString().replace('qg_', '');
      const player_qq = await channel(usr_qq);
      let player = await Read_player(player_qq);
      if (!player.in_xiangu) return;
      const optionsJson = await redis.get(`xiuxian:player:${usr_qq}:xianguOptions`);
      if (!optionsJson) return;
      const options = JSON.parse(optionsJson);
      const choice = parseInt(e.msg) - 1;
      if (choice < 0 || choice >= options.length) return;
      const chosen = options[choice];
      const actionState = await prepareXianguAction(player_qq);
      if (actionState.busy) {
        return e.reply('【撤离结算中】本次探索选择未执行。');
      }
      player = actionState.player;
      if (!player?.in_xiangu) return e.reply('【撤离已完成】本次探索选择未执行。');
      if (actionState.cancelled) {
        await e.reply('【撤离中断】你选择继续追寻机缘，撤离通道随之消散。');
      }
      const currentLocation = player.xiangu_location || '边缘区域';
      const exploreResult = await performExplore(player, currentLocation, player_qq, usr_qq, chosen.bias);
      if (exploreResult.gains) {
        player.xiangu_gains = player.xiangu_gains || {};
        for (const [key, value] of Object.entries(exploreResult.gains)) {
          if (key === 'daoyun') player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + value;
          else if (key === 'xiongmng') player.xiangu_gains.xiongmng = (player.xiangu_gains.xiongmng || 0) + value;
          else player.xiangu_gains[key] = (player.xiangu_gains[key] || 0) + value;
        }
      }
      const npcEvents = processNPCBehavior(player, currentLocation);
      if (npcEvents && npcEvents.length > 0) exploreResult.message += '\n\n【秘境动态】\n' + npcEvents.join('\n');
      await redis.del(`xiuxian:player:${usr_qq}:xianguOptions`);
      await Write_player(player_qq, player);
      await e.reply(exploreResult.message);
      if (Math.random() < 0.25) await triggerNPCEncounter(e, player, player_qq, currentLocation);
    } catch (error) {
      console.error('探索选择处理失败:', error);
    }
  }

}
// ====== 终极版：格子类型处理器（模块级别） ======

// 处理机缘格子（增强版 — 道种/道具/灵石/道韵）
async function handleTreasureCell(e, player, player_qq, map, x, y) {
  map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY;
  map.revealed[y][x] = true;
  const fragment = REALM_FRAGMENTS[map.fragmentId];
  const riskMultiplier = 1 + (fragment ? fragment.risk : 0.2);
  const zone = fragment ? fragment.zone : '边缘区域';
  const xianguConfig = getXianguSecretConfig();

  if (shouldDropXianguSeed(xianguConfig, zone, 'treasure')) {
    const seed = generateRandomSeed(zone, { fragmentId: map.fragmentId, source: 'treasure' });
    grantXianguSeed(player, seed);
    const { xiuwei, xueqi } = calcExploreRewards(player, riskMultiplier * 2);
    const reward = await grantXianguGrowthRewards(player, player_qq, { xiuwei, xueqi });
    return [
      `💎🔥【机缘·道种现世·${seed.品质}】`,
      `${player.名号}在${fragment?.name || zone}深处感应到一枚道种，`,
      `${seed.顶级道种 ? '仙古法则齐鸣，神话仙种破土而出！' : '道种在残存的仙古法则中缓缓搏动...'}`, ``,
      `获得：${seed.名称} [${seed.品质}]`,
      `融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`,
      `修为 +${reward.xiuwei.toLocaleString()} | 血气 +${reward.xueqi.toLocaleString()}`,
      '', `提示：前往核心区域使用 #借助${seed.名称}点燃神火`
    ].join('\n');
  }

  const roll = Math.random();

  // 核心区域 → 概率获得极品道具
  if (zone === '核心区域' && roll < 0.25) {
    const items = getLocationItems(zone);
    if (items.length > 0) {
      const item = items[Math.floor(Math.random() * items.length)];
      await Add_najie_thing(player_qq, item.name, item.type, 1);
      await markUniqueItemObtained(item.name, player_qq);
      const { xiuwei, xueqi } = calcExploreRewards(player, riskMultiplier * 2);
      const reward = await grantXianguGrowthRewards(player, player_qq, { xiuwei, xueqi });
      return [
        `💎✨【机缘·稀世宝物·${item.rarity || '稀有'}】`,
        `${player.名号}在${fragment.name}深处发现一件宝物...`,
        `${item.desc || '一件蕴含古老力量的宝物'}`, ``,
        `获得：${item.name} × 1`,
        `修为 +${reward.xiuwei.toLocaleString()} | 血气 +${reward.xueqi.toLocaleString()}`
      ].join('\n');
    }
  }

  // 通用机缘池（加权随机）
  const treasurePool = [
    { name: '道韵领悟', weight: 0.25, handler: async () => {
        const dg = 1 + Math.floor(Math.random() * 5 * riskMultiplier);
        if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 };
        player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + dg;
        const { xiuwei, xueqi } = calcExploreRewards(player, riskMultiplier);
        const reward = await grantXianguGrowthRewards(player, player_qq, { xiuwei, xueqi });
        return `${player.名号}盘膝感悟道则...\n获得：${dg}道韵 | 修为 +${reward.xiuwei.toLocaleString()} | 血气 +${reward.xueqi.toLocaleString()}`;
      }},
    { name: '灵石矿脉', weight: 0.3, handler: async () => {
        const lg = Math.floor((500 + Math.random() * 3000) * riskMultiplier);
        const { xiuwei, xueqi } = calcExploreRewards(player, riskMultiplier);
        const reward = await grantXianguGrowthRewards(player, player_qq, { lingshi: lg, xiuwei, xueqi });
        return `${player.名号}发现小型灵石矿脉！\n获得：${reward.lingshi.toLocaleString()}灵石 | 修为 +${reward.xiuwei.toLocaleString()} | 血气 +${reward.xueqi.toLocaleString()}`;
      }},
    { name: '古兽精血', weight: 0.2, handler: async () => {
        const xq = Math.floor((200 + Math.random() * 800) * riskMultiplier);
        const reward = await grantXianguGrowthRewards(player, player_qq, { xueqi: xq });
        return `${player.名号}寻得古兽残留精血...\n获得：${reward.xueqi.toLocaleString()}点血气`;
      }},
    { name: '残破法器', weight: 0.15, handler: async () => {
        const faqiNames = ['残破战戟', '断裂古剑', '破碎神甲碎片', '古盾残片', '仙古符骨'];
        const fn = faqiNames[Math.floor(Math.random() * faqiNames.length)];
        const { xiuwei, xueqi } = calcExploreRewards(player, riskMultiplier);
        const sp = Math.floor((200 + Math.random() * 800) * riskMultiplier);
        const reward = await grantXianguGrowthRewards(player, player_qq, { lingshi: sp, xiuwei, xueqi });
        return `${player.名号}挖出${fn}（可卖${reward.lingshi.toLocaleString()}灵石）\n修为 +${reward.xiuwei.toLocaleString()} | 血气 +${reward.xueqi.toLocaleString()}`;
      }},
    { name: '神识碎片', weight: 0.1, handler: async () => {
        if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 };
        player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + 3;
        return `${player.名号}拾得仙古修士遗留的神识碎片！\n获得：3道韵`;
      }},
  ];

  const totalWeight = treasurePool.reduce((s, t) => s + t.weight, 0);
  let rnd = Math.random() * totalWeight;
  let chosen = treasurePool[0];
  for (const t of treasurePool) { rnd -= t.weight; if (rnd <= 0) { chosen = t; break; } }
  const rewardMsg = await chosen.handler();

  return [
    `💎【机缘搜刮】`, `${rewardMsg}`,
    `（区域：${fragment ? fragment.name : '未知'} | 加持 x${riskMultiplier.toFixed(2)}）`
  ].join('\n');
}

// 处理危险格子（增强版 — Boss/陷阱/守护兽/毒瘴/空间乱流）
async function handleDangerCell(e, player, player_qq, map, x, y) {
  map.revealed[y][x] = true;
  const fragment = REALM_FRAGMENTS[map.fragmentId];
  const riskMultiplier = 1 + (fragment ? fragment.risk : 0.2);
  const zone = fragment ? fragment.zone : '边缘区域';
  const roll = Math.random();
  const bossChance = Math.min(0.5, fragment ? fragment.risk * 0.6 : 0.1);

  if (roll < bossChance) {
    const bossNames = ['仙古遗种·王', '远古守护者', '堕落天骄', '秘境镇守者', '黑暗物质聚合体'];
    const bossName = bossNames[Math.floor(Math.random() * bossNames.length)];
    const scaled = getBossScaledStats(player.xiangulevel_id || 5, riskMultiplier * 0.5);
    let B_enemy = {
      名号: bossName, 攻击: Math.floor(scaled.attack * 0.8), 防御: Math.floor(scaled.defense * 0.8),
      当前血量: Math.floor(scaled.hp * 0.8), 血量上限: Math.floor(scaled.hp * 0.8),
      暴击率: 0.05, 法球倍率: 0.1, 灵根: { 法球倍率: 0.1 },
      学习的功法: [], 魔道值: 0, 仙宠: null, 神石: {},
      xiangulevel_id: player.xiangulevel_id || 5, mijinglevel_id: Math.max(1, (player.xiangulevel_id || 5) - 3),
    };
    try {
      const battleSides = buildXianguBattleSides(player, B_enemy, { attackerId: player_qq });
      const battleResult = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_boss' });
      const leaderWinner = resolveXianguLeaderWinner(battleResult);
      const battleLines = [...battleSides.messages, ...(Array.isArray(battleResult.msg) ? battleResult.msg : [battleResult.msg || ''])];
      let battleMsg = battleLines.join('\n');
      if (leaderWinner === 'A') {
        const dropLingshi = Math.floor((1000 + Math.random() * 5000) * riskMultiplier);
        const reward = await grantXianguGrowthRewards(player, player_qq, { lingshi: dropLingshi });
        const daoyunGain = Math.floor(3 + Math.random() * 8);
        if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 };
        player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + daoyunGain;
        player.xiangu_infamy = (player.xiangu_infamy || 0) + 10;
        map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY;
        battleMsg += `\n\n⚔️【Boss击败】${player.名号}力战${bossName}！\n获得：${reward.lingshi.toLocaleString()}灵石 + ${daoyunGain}道韵 | 凶名+10`;

        const xianguConfig = getXianguSecretConfig();
        if (shouldDropXianguSeed(xianguConfig, zone, 'boss')) {
          const seed = generateRandomSeed(zone, { fragmentId: map.fragmentId, source: 'boss' });
          grantXianguSeed(player, seed);
          battleMsg += `\n【Boss道种掉落】${seed.名称} [${seed.品质}]`;
        }
      } else {
        const hpLoss = Math.floor((Number(player.当前血量) || 1) * 0.3);
        player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hpLoss);
        applyXianguHeavyInjury(player);
        battleMsg += `\n\n【战败】当前血量 -${hpLoss.toLocaleString()}，陷入重伤。`;
      }
      return [`⚡🐲【遭遇·${bossName}】`, `${player.名号}在${zone}撞见${bossName}！`, ``, battleMsg].join('\n');
    } catch (battleErr) {
      console.error('Boss战斗异常:', battleErr);
      const hpLoss = Math.floor((500 + Math.random() * 2000) * riskMultiplier);
      player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hpLoss);
      applyXianguHeavyInjury(player);
      return [`⚡【Boss遭遇·异常】`, `${player.名号}遭遇${bossName}，苦战后撤退...`, `损失生命：-${hpLoss.toLocaleString()} | 剩余血量：${player.当前血量.toLocaleString()} | 状态：重伤`].join('\n');
    }
  }

  const takeCurrentHpDamage = amount => {
    const currentHp = Number(player.当前血量) || Number(player.血量上限 || player.血气上限) || 1;
    player.当前血量 = Math.max(1, currentHp - amount);
    return player.当前血量;
  };
  const dangerPool = [
    { name: '道则陷阱', desc: '脚下道则突然炸裂，杀阵启动！',
      handler: () => { const hl = Math.floor((200 + Math.random() * 600) * riskMultiplier); takeCurrentHpDamage(hl); map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY; return `当前血量：-${hl.toLocaleString()} | 剩余：${player.当前血量.toLocaleString()}`; }},
    { name: '守护兽', desc: '一头远古守护兽从暗处扑来！',
      handler: () => { const hl = Math.floor((500 + Math.random() * 1500) * riskMultiplier); takeCurrentHpDamage(hl); map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY; const dg = Math.floor(Math.random() * 3) + 1; if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 }; player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + dg; return `当前血量：-${hl.toLocaleString()} | 剩余：${player.当前血量.toLocaleString()}\n反杀守护兽，获得${dg}道韵！`; }},
    { name: '毒瘴', desc: '前方弥漫着腐蚀万物的剧毒瘴气...',
      handler: async () => { const hl = Math.floor((100 + Math.random() * 400) * riskMultiplier); takeCurrentHpDamage(hl); map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY; if (Math.random() < 0.3) { const { xiuwei } = calcExploreRewards(player, riskMultiplier * 0.5); const reward = await grantXianguGrowthRewards(player, player_qq, { xiuwei }); return `当前血量：-${hl.toLocaleString()} | 剩余：${player.当前血量.toLocaleString()}\n毒瘴中竟生长着稀有灵药！修为 +${reward.xiuwei.toLocaleString()}`; } return `当前血量：-${hl.toLocaleString()} | 剩余：${player.当前血量.toLocaleString()}`; }},
    { name: '空间乱流', desc: '空间突然扭曲，乱流撕裂一切！',
      handler: () => { const hl = Math.floor((300 + Math.random() * 1000) * riskMultiplier); takeCurrentHpDamage(hl); map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY; if (Math.random() < 0.3) { const possible = []; for (let ty = 0; ty < map.height; ty++) { for (let tx = 0; tx < map.width; tx++) { if (map.grid[ty][tx] !== CELL_TYPE.WALL && !(tx === x && ty === y)) possible.push({ x: tx, y: ty }); } } if (possible.length > 0) { const np = possible[Math.floor(Math.random() * possible.length)]; map.playerPos = np; player.xiangu_pos_x = np.x; player.xiangu_pos_y = np.y; revealAdjacentCells(map, np, 2); return `当前血量：-${hl.toLocaleString()} | 剩余：${player.当前血量.toLocaleString()}\n🌀空间乱流将你吹向远方！新位置：[${np.x}, ${np.y}]`; } } return `当前血量：-${hl.toLocaleString()} | 剩余：${player.当前血量.toLocaleString()}`; }},
  ];

  const danger = dangerPool[Math.floor(Math.random() * dangerPool.length)];
  const result = await danger.handler();
  return [`⚡【${danger.name}·遭遇】`, `${player.名号}${danger.desc}`, `${result}`].join('\n');
}

// 处理虚空裂缝格子
async function handleVoidRiftCell(e, player, player_qq, map, x, y) {
  map.revealed[y][x] = true;
  const roll = Math.random();
  if (roll < 0.3) {
    const possible = [];
    for (let ty = 0; ty < map.height; ty++) { for (let tx = 0; tx < map.width; tx++) { if (map.grid[ty][tx] !== CELL_TYPE.WALL && !(tx === x && ty === y)) possible.push({ x: tx, y: ty }); } }
    if (possible.length > 0) {
      const newPos = possible[Math.floor(Math.random() * possible.length)];
      map.playerPos = newPos; player.xiangu_pos_x = newPos.x; player.xiangu_pos_y = newPos.y;
      revealAdjacentCells(map, newPos, 2);
      return [`🌀【虚空传送】`, `${player.名号}被虚空裂缝吸入，`, `天旋地转后出现在全新之地！`, `新坐标：[${newPos.x}, ${newPos.y}]`].join('\n');
    }
  } else if (roll < 0.7) {
    const tc = 500 + Math.floor(Math.random() * 2000);
    const reward = await grantXianguGrowthRewards(player, player_qq, { lingshi: tc });
    map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY;
    return [`🌀【虚空宝藏】`, `裂缝中竟有宝物飘浮！`, `${player.名号}取出了${reward.lingshi}灵石。`].join('\n');
  } else {
    const hl = Math.floor(500 + Math.random() * 2000);
    player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hl);
    return [`🌀【虚空风暴】`, `裂缝中涌出虚空风暴，`, `${player.名号}被波及受伤！`, `损失生命：-${hl} | 剩余血量：${player.当前血量}`].join('\n');
  }
}

async function handleXianguMarrowPoolCell(player, player_qq, map, x, y, pool) {
  pool.claimed = true;
  map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY;
  player.xiangu_gains ||= {};
  player.xiangu_gains.unique_found = (Number(player.xiangu_gains.unique_found) || 0) + 1;

  if (pool.isTrap) {
    const ambushers = Array.isArray(pool.ambushers) && pool.ambushers.length > 0
      ? pool.ambushers
      : createXianguPoolAmbushers({
          name: '蒙面猎手',
          level_id: player.xiangulevel_id || 5,
          personality: 'hostile',
        });
    const battleSides = buildXianguBattleSides(player, ambushers, { attackerId: player_qq });
    let battleResult;
    try {
      battleResult = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_ambush' });
    } catch (error) {
      console.error('万道仙髓池伏杀战异常:', error);
      const hpLoss = Math.max(1, Math.floor((Number(player.当前血量) || 1) * 0.2));
      player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hpLoss);
      applyXianguHeavyInjury(player);
      return [
        `🩸【${XIANGU_MARROW_POOL_NAME}·杀局】`,
        `池中仙光骤灭，杀阵与伏兵同时现身！`,
        `${player.名号}趁乱破阵而出，当前血量 -${hpLoss.toLocaleString()}，陷入重伤。`,
      ].join('\n');
    }

    if (pool.invitedBy) {
      player.xiangu_npc_relations ||= {};
      player.xiangu_npc_relations[pool.invitedBy] =
        (Number(player.xiangu_npc_relations[pool.invitedBy]) || 0) - 30;
    }
    const battleLog = [
      ...battleSides.messages,
      ...(Array.isArray(battleResult.msg) ? battleResult.msg : [String(battleResult.msg || '')]),
    ];

    if (resolveXianguLeaderWinner(battleResult) === 'A') {
      const daoyunGain = 20;
      player.xiangu_gains.daoyun = (Number(player.xiangu_gains.daoyun) || 0) + daoyunGain;
      return [
        `🩸【${XIANGU_MARROW_POOL_NAME}·伏杀反转】`,
        `${pool.invitedByName || '引路修士'}以假池为饵，伏兵自杀阵中齐出！`,
        ``,
        `━━━━ 围杀战 ━━━━`,
        ...battleLog.slice(-10),
        `━━━━ 战斗结果 ━━━━`,
        `${player.名号}反杀伏兵，识破杀局，道韵 +${daoyunGain}。`,
      ].join('\n');
    }

    const hpLoss = Math.max(1, Math.floor((Number(player.当前血量) || 1) * 0.35));
    player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hpLoss);
    applyXianguHeavyInjury(player);
    return [
      `🩸【${XIANGU_MARROW_POOL_NAME}·伏杀】`,
      `${pool.invitedByName || '引路修士'}以假池为饵，伏兵自杀阵中齐出！`,
      ``,
      `━━━━ 围杀战 ━━━━`,
      ...battleLog.slice(-10),
      `━━━━ 战斗结果 ━━━━`,
      `${player.名号}拼死突围，当前血量 -${hpLoss.toLocaleString()}，陷入重伤。`,
    ].join('\n');
  }

  const poolConfig = resolveXianguMarrowPoolConfig(getXianguSecretConfig());
  const calculated = calculateXianguMarrowPoolRewards(player, {
    rewardMultiplier: poolConfig.rewardMultiplier,
  });
  const rewards = await grantXianguGrowthRewards(player, player_qq, calculated);
  const potentialGain = grantMinggePotential(
    player,
    getMinggeEffects(player, data.minggeList),
    poolConfig.potentialGain,
  );
  player.xiangu_gains.仙髓池浸泡 = (Number(player.xiangu_gains.仙髓池浸泡) || 0) + 1;
  if (pool.invitedBy) {
    player.xiangu_npc_relations ||= {};
    player.xiangu_npc_relations[pool.invitedBy] =
      (Number(player.xiangu_npc_relations[pool.invitedBy]) || 0) + 15;
  }

  return [
    `💧【机缘·${XIANGU_MARROW_POOL_NAME}】`,
    `池中承载着仙古残存的万道精粹，${player.名号}入池浸泡，根骨与道基一同蜕变。`,
    ``,
    `【浸泡所得】`,
    `仙道潜力 +${potentialGain}`,
    `修为 +${rewards.xiuwei.toLocaleString()}`,
    `血气 +${rewards.xueqi.toLocaleString()}`,
    `修为、血气均按寻宝算法 ×${poolConfig.rewardMultiplier}结算。`,
  ].join('\n');
}

// 处理唯一机缘格子
async function handleUniqueTreasureCell(e, player, player_qq, map, x, y) {
  map.revealed[y][x] = true;
  let foundTreasure = null, foundName = '';
  if (map.uniqueTreasures) {
    for (const [name, treasure] of Object.entries(map.uniqueTreasures)) {
      if (treasure.pos.x === x && treasure.pos.y === y && !treasure.claimed) { foundTreasure = treasure; foundName = name; break; }
    }
  }
  if (foundTreasure) {
    if (foundTreasure.kind === XIANGU_MARROW_POOL_KIND) {
      return handleXianguMarrowPoolCell(player, player_qq, map, x, y, foundTreasure);
    }
    foundTreasure.claimed = true;
    if (!player.xiangu_gains) player.xiangu_gains = { daoyun: 0 };
    player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + 20;
    player.xiangu_gains.unique_found = (player.xiangu_gains.unique_found || 0) + 1;
    const reward = await grantXianguGrowthRewards(player, player_qq, { lingshi: 10000, xiuwei: 5000 });
    map.grid[y][x] = CELL_TYPE.EXPLORED_EMPTY;
    let seedMessage = '';
    const fragment = REALM_FRAGMENTS[map.fragmentId];
    const zone = fragment?.zone || '核心区域';
    const xianguConfig = getXianguSecretConfig();
    if (shouldDropXianguSeed(xianguConfig, zone, 'unique')) {
      const seed = generateRandomSeed(zone, { fragmentId: map.fragmentId, source: 'unique' });
      grantXianguSeed(player, seed);
      seedMessage = `\n伴生道种：${seed.名称} [${seed.品质}]`;
    }
    return [`✨✨✨【绝世机缘·${foundName}】✨✨✨`, `${player.名号}伸手触及${foundTreasure.desc}`, ``, `获得：${foundName} | ${reward.lingshi}灵石 | ${reward.xiuwei}修为 | 20道韵${seedMessage}`, ``, `此等造化，足以震动九天十地！`].join('\n');
  }
  return `✨ ${player.名号}感知到绝世机缘的存在，却无法触及...`;
}

// 处理空地格子
function handleEmptyCell(player, map) {
  if (Math.random() < 0.2) {
    const ambient = [`${player.名号}缓步前行，四周一片寂静...`, `微风吹过，带来远古的气息。`, `脚步在荒芜的大地上回响。`, `远处似有微光闪烁，转眼又消失不见。`, `脚下的土地布满裂痕，诉说着仙古大战的惨烈。`];
    return ambient[Math.floor(Math.random() * ambient.length)];
  }
  return '';
}

// 计算探索修为/血气奖励（基于境界公式）
function calcExploreRewards(player, rewardMultiplier = 1) {
  const now_level_id = player.level_id || player.xiangulevel_id || 5;
  const now_physique_id = player.Physique_id || Math.max(3, now_level_id - 2);
  const now_mijinglevel_id = player.mijinglevel_id || 1;
  const now_xiangulevel_id = player.xiangulevel_id || 5;
  const t1 = 0.8 + Math.random() * 0.4;
  const t2 = 0.8 + Math.random() * 0.4;

  const xiuwei = Math.trunc(2000 + (10000 * now_level_id * now_level_id * now_mijinglevel_id * now_xiangulevel_id * t1) * rewardMultiplier);
  const xueqi = Math.trunc(2000 + (10000 * now_physique_id * now_physique_id * now_mijinglevel_id * now_xiangulevel_id * t2) * rewardMultiplier);

  return { xiuwei, xueqi };
}

// 计算神火突破属性提升（尊者境→神火境境界差量）
function getShenhuoBreakthroughBonus() {
  try {
    const levelPath = path.join(data.filePathMap.Level, '仙古今世法.json');
    if (!fs.existsSync(levelPath)) return { 血气: 20000000, 攻击: 20000000, 防御: 20000000, 暴击率: 0.05 };
    const levelData = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
    const level7 = levelData.find(l => l.level_id === 7);
    const level8 = levelData.find(l => l.level_id === 8);
    if (!level7 || !level8) return { 血气: 20000000, 攻击: 20000000, 防御: 20000000, 暴击率: 0.05 };
    return {
      血气: level8.基础血量 - level7.基础血量,
      攻击: level8.基础攻击 - level7.基础攻击,
      防御: level8.基础防御 - level7.基础防御,
      暴击率: 0.05
    };
  } catch (err) {
    console.error('读取仙古今世法等级数据失败:', err);
    return { 血气: 20000000, 攻击: 20000000, 防御: 20000000, 暴击率: 0.05 };
  }
}

// 标记唯一性物品已被获取
async function markUniqueItemObtained(itemName, playerQQ) {
  try {
    const configPath = data.filePathMap.xianguSecretPlace;
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const topCreations = config.顶级造化;
    if (!topCreations) return;

    let modified = false;
    const categories = ['顶级仙种', '十凶宝术', '仙王经文'];
    for (const cat of categories) {
      const items = topCreations[cat] || [];
      for (const item of items) {
        if (item.名称 === itemName && !item.已获取) {
          item.已获取 = true;
          item.获取者 = playerQQ;
          modified = true;
          console.log(`【仙古秘境】唯一物品 "${itemName}" 已被 ${playerQQ} 获取`);
        }
      }
    }

    if (modified) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('标记唯一物品失败:', err);
  }
}

// 道种试炼事件处理（三千道火·祭炼场试炼，奖励火道道种）
async function handleFlameTrial(player, location, player_qq, trial) {
  const trials = {
    '三千道火': {
      name: '三千道火·大道试炼',
      desc: '三千种大道之火汇聚成的火海在你面前展开。每一缕火焰代表一种大道，唯有以肉身硬扛三千道火的焚烧，方可于火道中淬炼出一枚至强道种！',
      burnRate: 0.15,  // 每次燃烧生命比例
      stages: 3,
      reward: { 名称: '三千道火种', 品质: '神话', 类型: '火道', 融合成功率: 0.95, 属性加成: { 攻击: 800000, 血气: 1500000, 全属性: 0.1 }, 专属技能: '万火共鸣', 额外效果: '不受秘境境界压制' }
    }
  };

  const trialData = trials[trial.name];
  if (!trialData) return null;

  let survive = true;
  const playerHP = player.血气上限 || 100000;

  for (let i = 0; i < trialData.stages; i++) {
    const burnDamage = Math.floor(playerHP * trialData.burnRate * (1 + i * 0.3));
    const currentHP = (player.血气 || playerHP) - burnDamage;

    if (currentHP <= 0) {
      survive = false;
      player.血气 = 1;
      break;
    } else {
      player.血气 = currentHP;
    }
  }

  if (!survive) {
    await Write_player(player.player_qq || player_qq, player);
    return [
      `【${trialData.name}】`,
      ``,
      `${player.名号}踏入三千道火之中...`,
      `第一波道火焚身，肉身龟裂！`,
      `第二波道火袭来，道基震颤！`,
      `第三波道火铺天盖地，${player.名号}终于支撑不住...`,
      ``,
      `【试炼失败】`,
      `生命降至1点，需要休养后再挑战`,
      `提示：提升生命值上限可增加成功率`
    ].join('\n');
  }

  // 试炼成功：奖励一枚神话品质火道道种（可用于道种孕育点燃神火）
  player.血气 = Math.floor(player.血气上限 * 0.2);
  grantXianguSeed(player, trialData.reward);

  const { xiuwei, xueqi } = calcExploreRewards(player, 3);
  const trialRewards = await grantXianguGrowthRewards(player, player_qq, { xiuwei, xueqi });

  return [
    `【${trialData.name}·试炼成功！！！】`,
    ``,
    `${player.名号}踏入三千道火之中！`,
    `第一波道火焚身——肉身抽搐，却咬牙坚持！`,
    `第二波道火更烈——道基轰鸣，血液都在沸腾！`,
    `第三波道火铺天盖地——${player.名号}以六大极境为基，硬扛三千道火！`,
    ``,
    `【试炼通过】`,
    `三千道火退去，一枚被万火淬炼的道种在虚空中凝聚——`,
    `那是以三千大道为薪、以无上意志为炉的「三千道火种」！`,
    ``,
    `【获得】`,
    `${trialData.reward.名称} [${trialData.reward.品质}]`,
    `融合成功率：${(trialData.reward.融合成功率 * 100).toFixed(0)}%`,
    `专属技能：${trialData.reward.专属技能}`,
    `修为 +${trialRewards.xiuwei.toLocaleString()}`,
    `血气 +${trialRewards.xueqi.toLocaleString()}`,
    ``,
    `"三千道火焚身，万道火种淬道种！"`
  ].join('\n');
}

// 生成探索方向选项
function generateExploreOptions(location) {
  const baseOptions = [
    { id: 'daoyun', icon: '🌊', label: '东方·灵力波动涌来——感应到浓郁道韵', bias: { daoyun: 0.5, item: 0.2, fight: 0.15, special: 0.1 } },
    { id: 'item', icon: '💎', label: '西方·古物气息弥漫——似乎有宝物埋藏', bias: { item: 0.5, daoyun: 0.2, lingshi: 0.2, special: 0.1 } },
    { id: 'fight', icon: '⚔️', label: '深处·隐约传来打斗声——或有战斗', bias: { fight: 0.5, lingshi: 0.2, item: 0.2, daoyun: 0.1 } },
  ];
  
  // 深层/核心区域增加特殊发现选项
  if (location === '深层区域' || location === '核心区域' || location === '火道禁区') {
    baseOptions.push(
      { id: 'special', icon: '✨', label: '北方·古老遗迹显现——可能有惊天发现', bias: { special: 0.5, daoyun: 0.2, item: 0.2, fight: 0.1 } }
    );
  }
  
  // 火道禁区增加道种感悟选项（祭炼场孕育火道道种）
  if (location === '火道禁区') {
    baseOptions.push(
      { id: 'seed', icon: '🌟', label: '深渊·三千道火翻涌——感悟火道道种气息', bias: { item: 0.5, special: 0.2, daoyun: 0.2, fight: 0.1 } }
    );
  }
  
  // 随机选3个选项展示
  const shuffled = [...baseOptions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// 探索方向选择处理
async function performExplore(player, location, player_qq, usr_qq, bias = null) {
  const result = {
    message: '',
    gains: {}
  };

  // 根据偏向来调整概率权重
  // 默认概率：道韵40%, 灵石30%, 道具15%, 战斗10%, 惊天发现5%
  let thresholds = { daoyun: 0.40, lingshi: 0.30, item: 0.15, fight: 0.10, special: 0.05 };
  
  if (bias) {
    // 用偏向来增强对应类型的概率（火道禁区的seed选项使用 item/special/daoyun/fight 偏向）
    for (const [key, boost] of Object.entries(bias)) {
      thresholds[key] = (thresholds[key] || 0.1) + boost * 0.5;
    }
    // 归一化
    const total = Object.values(thresholds).reduce((a, b) => a + b, 0);
    for (const key of Object.keys(thresholds)) {
      thresholds[key] /= total;
      thresholds[key] = Math.round(thresholds[key] * 100) / 100;
    }
  }

  // 读取秘境配置
  const configPath = data.filePathMap.xianguSecretPlace || 
    path.join(process.cwd(), 'data', 'xianguSecretPlace.json');
  let xianguConfig = {};
  try {
    if (fs.existsSync(configPath)) {
      xianguConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('读取秘境配置失败:', err);
  }

  // 根据区域危险等级确定基础收益和风险
  const locationRisks = {
    '边缘区域': { risk: 0.1, baseReward: 30, bossChance: 0.02, baseSuccess: 0.70 },
    '中层区域': { risk: 0.3, baseReward: 60, bossChance: 0.15, baseSuccess: 0.60 },
    '深层区域': { risk: 0.5, baseReward: 100, bossChance: 0.30, baseSuccess: 0.50 },
    '核心区域': { risk: 0.7, baseReward: 150, bossChance: 0.50, baseSuccess: 0.40 },
    '火道禁区': { risk: 0.8, baseReward: 200, bossChance: 0.60, baseSuccess: 0.35 }
  };
  
  const riskData = locationRisks[location] || locationRisks['边缘区域'];
  
  // 凶名值影响：高凶名者更容易遭遇敌人和Boss
  const infamy = player.xiangu_infamy || 0;
  const infamyRiskBoost = Math.min(0.5, infamy / 500); // 凶名500封顶+50%风险
  const adjustedRisk = Math.min(1.0, riskData.risk + infamyRiskBoost);
  const adjustedBossChance = Math.min(1.0, riskData.bossChance + infamy / 1000);
  
  // 高凶名玩家还可能被其他玩家伏击（PvP遭遇）
  const pvpAmbushChance = Math.min(0.3, infamy / 500); // 凶名500时有30%概率被伏击
  
  // 随机事件判定
  const eventRoll = Math.random();
  const eventChance = adjustedRisk;
  
  // 基础探索结果 - 各区域独立成功率 + 境界加成
  const injuryEfficiency = getXianguExploreEfficiency(player);
  const successChance = Math.min(0.95, riskData.baseSuccess + (player.xiangulevel_id - 5) * 0.03) * injuryEfficiency;
  const baseSuccess = Math.random() < successChance;
  
  if (!baseSuccess) {
    // 探索失败
    const failTexts = [
      `${player.名号}在${location}中搜索良久，却一无所获...`,
      `岁月沧桑，此地机缘早已被前人取尽...`,
      `迷雾重重，方向难辨，探索无果...`
    ];
    result.message = [
      `【探索·无果】`,
      ``,
      failTexts[Math.floor(Math.random() * failTexts.length)],
      ``,
      `【探索统计】`,
      `- 当前位置：${location}`,
      `- 危险等级：${'★'.repeat(riskData.risk * 5 + 1)}`,
      `- 探索结果：未发现机缘`,
      ``,
      `提示：秘境深处往往藏有更大机缘，但危险也更高`
    ].join('\n');
    return result;
  }

  // 探索成功，生成收获
  const rewardMultiplier = riskData.baseReward / 30;

  // === 动态事件加成 ===
  const eventMod = getEventExploreModifier();
  const eventRewardMult = eventMod.rewardMult;
  const eventEffMult = eventMod.efficiency;

  // 累计阈值
  const cumDaoyun = thresholds.daoyun;
  const cumLingshi = cumDaoyun + thresholds.lingshi;
  const cumItem = cumLingshi + (thresholds.item || 0);
  const cumFight = cumItem + (thresholds.fight || 0);

  const findRandom = Math.random() / Math.max(0.1, eventEffMult); // 事件影响探索效率
  
  // 判定收获类型
  let rewardType, rewardName, rewardDesc;
  
  if (findRandom < thresholds.daoyun) {
    // 获得道韵
    const daoyunGain = Math.floor(riskData.baseReward * (0.8 + Math.random() * 0.4) * eventRewardMult);
    result.gains.daoyun = daoyunGain;

    // 境界修为/血气奖励
    const { xiuwei: dyXw, xueqi: dyXq } = calcExploreRewards(player, rewardMultiplier);
    const dyReward = await grantXianguGrowthRewards(player, player_qq, { xiuwei: dyXw, xueqi: dyXq });
    result.gains.xiuwei = dyReward.xiuwei;
    result.gains.xueqi = dyReward.xueqi;

    result.message = [
      `【探索·道韵领悟】`,
      ``,
      `${player.名号}盘膝而坐，感悟${location}中的残留道则...`,
      `玄妙的气息流淌而过，道韵加深！`,
      ``,
      `【获得】`,
      `道韵领悟 +${daoyunGain}`,
      `修为 +${dyReward.xiuwei.toLocaleString()}`,
      `血气 +${dyReward.xueqi.toLocaleString()}`,
      ``,
      `【探索统计】`,
      `- 当前位置：${location}`,
      `- 危险等级：${'★'.repeat(riskData.risk * 5 + 1)}`,
      `- 探索结果：✓ 发现道韵`,
      `- 当前道韵：${player.xiangu_gains?.daoyun || 0} + ${daoyunGain}`,
      ``,
      `【古史记载】`,
      `"道韵无形，却可积少成多，汇聚成河"`
    ].join('\n');

    if (eventMod.bonusMsg) result.message += eventMod.bonusMsg;
    
  } else if (findRandom < cumLingshi) {
    // 获得灵石
    const lingganBase = Math.floor(5000 * rewardMultiplier * eventRewardMult);
    const lingganGain = Math.floor(lingganBase * (0.8 + Math.random() * 0.4));
    
    // 境界修为/血气奖励
    const { xiuwei: lsXw, xueqi: lsXq } = calcExploreRewards(player, rewardMultiplier);
    const lsReward = await grantXianguGrowthRewards(player, player_qq, {
      lingshi: lingganGain,
      xiuwei: lsXw,
      xueqi: lsXq,
    });
    
    result.message = [
      `【探索·灵石矿脉】`,
      ``,
      `${player.名号}挖掘出一处小型灵石矿脉，`,
      `晶莹剔透的灵石散落一地！`,
      ``,
      `【获得】`,
      `灵石 +${lsReward.lingshi.toLocaleString()}`,
      `修为 +${lsReward.xiuwei.toLocaleString()}`,
      `血气 +${lsReward.xueqi.toLocaleString()}`,
      ``,
      `【探索统计】`,
      `- 当前位置：${location}`,
      `- 危险等级：${'★'.repeat(riskData.risk * 5 + 1)}`,
      `- 探索结果：✓ 发现灵石`,
      ``,
      `【古史记载】`,
      `"仙古纪元，灵石乃修士修炼之基"`
    ].join('\n');
    
  } else if (findRandom < cumItem) {
    // 获得秘境道具
    const items = getLocationItems(location);
    if (items.length > 0) {
      const item = items[Math.floor(Math.random() * items.length)];
      await Add_najie_thing(player_qq, item.name, item.type, 1);
      await markUniqueItemObtained(item.name, player_qq);
      result.gains[item.name] = 1;

      // 境界修为/血气奖励
      const { xiuwei: djXw, xueqi: djXq } = calcExploreRewards(player, rewardMultiplier);
      const itemReward = await grantXianguGrowthRewards(player, player_qq, { xiuwei: djXw, xueqi: djXq });
      
      result.message = [
        `【探索·奇遇·${item.rarity}】`,
        ``,
        `${player.名号}在${location}深处发现一处隐蔽的遗迹...`,
        `尘土飞扬中，一件散发着古朴气息的宝物显露真容！`,
        ``,
        `【获得】`,
        `${item.name} × 1`,
        `修为 +${itemReward.xiuwei.toLocaleString()}`,
        `血气 +${itemReward.xueqi.toLocaleString()}`,
        ``,
        `【物品说明】`,
        item.desc,
        ``,
        `【探索统计】`,
        `- 当前位置：${location}`,
        `- 危险等级：${'★'.repeat(riskData.risk * 5 + 1)}`,
        `- 稀有度：${item.rarity}`,
        `- 探索结果：✓ 获得宝物`
      ].join('\n');
    }
    
  } else if (findRandom < cumFight) {
    // 特殊事件：遭遇敌人或Boss
    // 先判定PvP伏击（高凶名玩家）
    if (Math.random() < pvpAmbushChance) {
      result.message = [
        `【遭遇·伏击】`,
        ``,
        `${player.名号}在${location}探索时，`,
        `突感杀意凛然——有其他修士伏击！`,
        ``,
        `因凶名过盛（${infamy}），被其他修士盯上！`,
        `建议前往 #核心区域 撤离，或使用 #秘境攻击 反击`,
        ``,
        `【警告】你已暴露行踪，其他修士可对你发起攻击`
      ].join('\n');
      return result;
    }

    if (eventRoll < adjustedBossChance) {
      // Boss遭遇
      result.message = await handleBossEncounter(player, location, player_qq, usr_qq);
    } else {
      // 普通敌人 - 使用真实战斗系统
      const enemyLevel = Math.max(1, player.xiangulevel_id - 1 + Math.floor(Math.random() * 3));
      const enemyNames = ['仙古遗种', '秘境守卫', '迷途怨灵', '异域修士'];
      const enemyName = enemyNames[Math.floor(Math.random() * enemyNames.length)];
      
      // 构建NPC战斗对象（基于境界缩放）
      const zoneFactor = { '边缘区域': 0.1, '中层区域': 0.2, '深层区域': 0.4, '核心区域': 0.6 }[location] || 0.1;
      const scaled = getBossScaledStats(player.xiangulevel_id || 5, zoneFactor);
      
      let B_enemy = {
        名号: enemyName,
        攻击: Math.floor(scaled.attack * 0.5),
        防御: Math.floor(scaled.defense * 0.5),
        当前血量: Math.floor(scaled.hp * 0.5),
        血量上限: Math.floor(scaled.hp * 0.5),
        暴击率: 0.03,
        法球倍率: 0.08,
        灵根: { 法球倍率: 0.08 },
        学习的功法: [],
        魔道值: 0,
        仙宠: null,
        神石: {},
        xiangulevel_id: enemyLevel,
        mijinglevel_id: Math.max(1, enemyLevel - 4),
      };

      const battleSides = buildXianguBattleSides(player, B_enemy, { attackerId: player_qq });
      const Data_battle = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_normal' });
      const leaderWinner = resolveXianguLeaderWinner(Data_battle);
      const msg = Data_battle.msg;
      
      if (leaderWinner === 'A') {
        const { xiuwei: btXw, xueqi: btXq } = calcExploreRewards(player, rewardMultiplier * 1.5);
        const expGain = btXw;
        const xueqiGain = btXq;
        const xiongmngGain = Math.floor(5 * rewardMultiplier);
        result.gains.xiongmng = xiongmngGain;
        player.xiangu_infamy = (Number(player.xiangu_infamy) || 0) + xiongmngGain;

        const battleRewards = await grantXianguGrowthRewards(player, player_qq, {
          xiuwei: expGain,
          xueqi: xueqiGain,
        });
        
        result.message = [
          `【探索·遭遇·战斗】`,
          ``,
          `${player.名号}在${location}遭遇一头${enemyName}！`,
          ...battleSides.messages,
          `━━━ 战斗过程 ━━━`,
          ...msg.slice(-6),
          `━━━ 战斗结果 ━━━`,
          `击败${enemyName}，威名远扬！`,
          ``,
          `【获得】`,
          `修为 +${battleRewards.xiuwei.toLocaleString()}`,
          `血气 +${battleRewards.xueqi.toLocaleString()}`,
          `凶名值 +${xiongmngGain}`,
          ``,
          `【探索统计】`,
          `- 当前位置：${location}`,
          `- 危险等级：${'★'.repeat(Math.floor(adjustedRisk * 5) + 1)}`,
          `- 战斗结果：✓ 胜利`
        ].join('\n');

        // 道种掉落
        if (shouldDropXianguSeed(xianguConfig, location, 'treasure')) {
          const seed = generateRandomSeed(location, { source: 'treasure' });
          grantXianguSeed(player, seed);
          await Write_player(player_qq, player);

          result.message += [
            ``,
            `【意外之喜！】`,
            `击败${enemyName}后，意外发现其体内蕴含道种！`,
            ``,
            `◇ 获得道种：${seed.名称} [${seed.品质}]`,
            `融合成功率：${(seed.融合成功率 * 100).toFixed(0)}%`
          ].join('\n');
        }
      } else {
        // 战败或平局
        const hpLoss = Math.floor((Number(player.血量上限 || player.血气上限) || 1) * 0.25);
        player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hpLoss);
        applyXianguHeavyInjury(player);
        await Write_player(player_qq, player);

        result.message = [
          `【探索·遭遇·战斗】`,
          ``,
          `${player.名号}在${location}遭遇一头${enemyName}！`,
          ...battleSides.messages,
          `━━━ 战斗过程 ━━━`,
          ...msg.slice(-6),
          `━━━ 战斗结果 ━━━`,
          `${player.名号}力战不敌（或平局收场），被迫撤退！`,
          ``,
          `【损失】`,
          `血气 -${hpLoss.toLocaleString()}`
        ].join('\n');
      }
    }
    
  } else {
    // 稀有发现：秘境特殊机缘
    const specialItems = getSpecialDiscovery(location);
    if (specialItems.length > 0) {
      const special = specialItems[Math.floor(Math.random() * specialItems.length)];
      result.gains[special.name] = 1;

      // 如果是试炼类型，触发特殊事件
      if (special.trial) {
        result.message = await handleFlameTrial(player, location, player_qq, special);
        return result;
      }

      // 惊天发现额外修为/血气（2倍）
      const { xiuwei: jtXw, xueqi: jtXq } = calcExploreRewards(player, rewardMultiplier * 2);
      const specialReward = await grantXianguGrowthRewards(player, player_qq, { xiuwei: jtXw, xueqi: jtXq });
      
      result.message = [
        `【探索·惊天发现·${special.rarity}】`,
        ``,
        `${player.名号}在${location}深处感应到一股浩瀚的气息...`,
        `小心翼翼地拨开迷雾，一处隐藏的秘境宝库赫然在目！`,
        ``,
        `【发现】`,
        `${special.name}`,
        ``,
        `【物品说明】`,
        special.desc,
        ``,
        `【获得】`,
        `修为 +${specialReward.xiuwei.toLocaleString()}`,
        `血气 +${specialReward.xueqi.toLocaleString()}`,
        ``,
        `【探索统计】`,
        `- 当前位置：${location}`,
        `- 危险等级：${'★'.repeat(riskData.risk * 5 + 1)}`,
        `- 稀有度：${special.rarity}`,
        `- 探索结果：✓ 惊天发现！`,
        ``,
        `【古史传说】`,
        `"传闻此地藏有仙古纪元的无上机缘..."`
      ].join('\n');
      
      // 添加到纳戒
      await Add_najie_thing(player_qq, special.name, special.type, 1);
      await markUniqueItemObtained(special.name, player_qq);
    }
  }

  // === 动态事件加成文本（附加到探索结果） ===
  if (eventMod?.bonusMsg && result.message) {
    result.message += eventMod.bonusMsg;
  }

  return result;
}
function getLocationItems(location) {
  const locationItems = {
    '边缘区域': [
      { name: '残破灵符', type: '道具', rarity: '普通', desc: '蕴含微弱灵力的符箓，可用于基础交易' },
      { name: '下品灵石', type: '灵石', rarity: '普通', desc: '品质一般的灵石，可用于修炼' },
      { name: '引气丹', type: '丹药', rarity: '优秀', desc: '帮助引气入体的丹药，效果微弱' },
      { name: '百断山碎片', type: '材料', rarity: '稀有', desc: '百断山崩碎后遗留的碎片，蕴藏古老符文' },
      { name: '原始骨文', type: '材料', rarity: '稀有', desc: '刻画在上古兽骨上的原始骨文' },
      { name: '灵血草', type: '丹药', rarity: '普通', desc: '可补充少量血气的常见灵草' }
    ],
    '中层区域': [
      { name: '中品灵石', type: '灵石', rarity: '优秀', desc: '品质较好的灵石，蕴含更多灵气' },
      { name: '破境丹', type: '丹药', rarity: '稀有', desc: '增加突破成功率的神秘丹药' },
      { name: '仙古遗种蛋', type: '宠物', rarity: '史诗', desc: '一枚沉睡的遗种之蛋，蕴含古老血脉' },
      { name: '十凶残魂', type: '材料', rarity: '稀有', desc: '十凶残留的一缕魂魄，可用于炼器' },
      { name: '鲲鹏羽', type: '材料', rarity: '稀有', desc: '鲲鹏脱落的一根羽毛，蕴含极速道则' },
      { name: '雷池液', type: '材料', rarity: '史诗', desc: '雷帝沐浴的雷池遗液，可淬炼肉身' },
      { name: '柳神法残篇', type: '功法', rarity: '传说', desc: '柳神涅槃大法的残篇，蕴含生命真谛' }
    ],
    '深层区域': [
      { name: '上品灵石', type: '灵石', rarity: '稀有', desc: '蕴含浓郁灵气的上品灵石' },
      { name: '悟道古茶叶', type: '道具', rarity: '传说', desc: '蕴含大道道韵，可用于古茶悟道' },
      { name: '仙血精华', type: '材料', rarity: '传说', desc: '蕴含仙古纪元仙人血液的精华' },
      { name: '天角蚁宝术残篇', type: '功法', rarity: '传说', desc: '天角蚁一族的力之极尽奥义残篇' },
      { name: '仙火髓', type: '材料', rarity: '传说', desc: '仙域神火燃尽后留下的精髓，蕴含至高火焰法则' },
      { name: '折仙咒碎片', type: '材料', rarity: '传说', desc: '折仙咒碑碎裂脱落的碎片，蕴含诅咒之力' },
      { name: '补天术残篇', type: '功法', rarity: '传说', desc: '女娲补天之术的残篇，可修补道基缺陷' },
      { name: '黑暗物质样本', type: '材料', rarity: '史诗', desc: '黑暗牢笼中逸散的神秘物质' }
    ],
    '核心区域': [
      { name: '极品灵石', type: '灵石', rarity: '传说', desc: '蕴含海量灵气的极品灵石' },
      { name: '道韵碎片', type: '材料', rarity: '传说', desc: '蕴含完整道则的碎片，价值连城' },
      { name: '仙古真血', type: '材料', rarity: '史诗', desc: '一滴仙古纪元真仙的精血' },
      { name: '原始真解残篇', type: '功法', rarity: '神话', desc: '天地初开时的原始真解，可参悟大道本源' }
    ],
    '火道禁区': [
      { name: '万火深渊', type: '试炼', rarity: '传说', desc: '万火深渊深处——祭炼真我者感悟大道的试炼地，渡过者可得火道道种', trial: true },
      { name: '神火本源', type: '材料', rarity: '神话', desc: '神火的本源之力，可大幅提升神火品质' }
    ]
  };
  
  return locationItems[location] || locationItems['边缘区域'];
}

// 获取特殊发现
function getSpecialDiscovery(location) {
  const specialItems = {
    '边缘区域': [
      { name: '狻猊宝术拓印', type: '功法', rarity: '稀有', desc: '狻猊遗留下的宝术拓印，蕴含雷电之力' }
    ],
    '中层区域': [
      { name: '仙药园令牌', type: '道具', rarity: '稀有', desc: '可召唤一处临时仙药园的令牌' },
      { name: '传承石碑', type: '传承', rarity: '史诗', desc: '刻有古代修士传承的石碑' },
      { name: '不死神药种子', type: '仙种', rarity: '传说', desc: '传说中能活出第二世的不死神药之种' },
      { name: '真龙逆鳞', type: '材料', rarity: '传说', desc: '真龙身上最坚硬的逆鳞，可炼制至宝' }
    ],
    '深层区域': [
      { name: '仙王讲道录', type: '传承', rarity: '传说', desc: '记载仙王讲道的玉简，蕴含无上道法' },
      { name: '折仙咒刻图', type: '功法', rarity: '传说', desc: '折仙咒的修炼法门，威力巨大但有风险' },
      { name: '真凰宝术拓印', type: '功法', rarity: '传说', desc: '真凰涅槃之术的拓印，可浴火重生' },
      { name: '黑暗牢笼钥匙', type: '道具', rarity: '史诗', desc: '传说可开启黑暗牢笼深处秘藏的钥匙' },
      { name: '三千道火', type: '试炼', rarity: '传说', desc: '触及三千道火试炼——三千种大道之火汇聚成的火海，熬过去可淬炼出三千道火种！', trial: true }
    ],
    '核心区域': [
      { name: '唯一道则碎片', type: '传说', rarity: '神话', desc: '蕴含完整大道的至高之物，全图仅此一份' },
      { name: '仙古花蕾精华', type: '材料', rarity: '神话', desc: '仙古花蕾凝聚的至高精华' },
      { name: '鸿蒙紫气', type: '材料', rarity: '神话', desc: '开天辟地前的原始之气，价值无法估量' },
      { name: '唯一真血', type: '材料', rarity: '神话', desc: '来自不可名状存在的唯一真血，世间仅此一滴' }
    ]
  };
  
  return specialItems[location] || specialItems['边缘区域'];
}

// 根据境界获取Boss缩放属性
function getBossScaledStats(playerXianguLevel, zoneFactor) {
  try {
    const levelPath = path.join(data.filePathMap.Level, '仙古今世法.json');
    if (!fs.existsSync(levelPath)) {
      // 回退：用简易公式
      const lv = Math.max(playerXianguLevel, 5);
      return {
        hp: Math.trunc(500000 * lv * lv * zoneFactor),
        attack: Math.trunc(300000 * lv * lv * zoneFactor),
        defense: Math.trunc(200000 * lv * lv * zoneFactor)
      };
    }
    const levelData = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
    const levelRow = levelData.find(l => l.level_id === playerXianguLevel);
    // 用玩家境界的60%~200%作为Boss的属性
    const playerBaseHp = levelRow?.基础血量 || (500000 * playerXianguLevel * playerXianguLevel);
    const playerBaseAtk = levelRow?.基础攻击 || (300000 * playerXianguLevel * playerXianguLevel);
    const playerBaseDef = levelRow?.基础防御 || (200000 * playerXianguLevel * playerXianguLevel);
    return {
      hp: Math.trunc(playerBaseHp * zoneFactor),
      attack: Math.trunc(playerBaseAtk * zoneFactor * 0.5),
      defense: Math.trunc(playerBaseDef * zoneFactor * 0.4)
    };
  } catch (err) {
    console.error('Boss属性缩放计算失败:', err);
    const lv = Math.max(playerXianguLevel, 5);
    return {
      hp: Math.trunc(500000 * lv * lv * zoneFactor),
      attack: Math.trunc(300000 * lv * lv * zoneFactor),
      defense: Math.trunc(200000 * lv * lv * zoneFactor)
    };
  }
}

// 处理Boss遭遇
async function handleBossEncounter(player, location, player_qq, usr_qq) {
  const bossDefs = {
    '中层区域': [
      { name: '真龙残魂', skills: ['龙吟九天', '真龙摆尾', '龙战于野'],
        drops: [{ name: '真龙宝术', chance: 0.1, rarity: '史诗' }, { name: '龙鳞', chance: 0.5, rarity: '稀有' }] },
      { name: '仙药守护兽', skills: ['守护之怒', '药香迷惑', '灵根护体'],
        drops: [{ name: '不死神药幼苗', chance: 0.05, rarity: '传说' }, { name: '守护兽内丹', chance: 0.4, rarity: '稀有' }] }
    ],
    '深层区域': [
      { name: '仙王残念', skills: ['轮回印', '无终一击', '仙王道则'],
        drops: [{ name: '六道轮回天功', chance: 0.08, rarity: '传说' }, { name: '仙王精血', chance: 0.3, rarity: '传说' }] },
      { name: '黑暗古祖', skills: ['黑暗侵蚀', '不朽之触', '黑暗牢笼'],
        drops: [{ name: '黑暗物质样本', chance: 0.4, rarity: '稀有' }, { name: '折仙咒原本', chance: 0.15, rarity: '传说' }] }
    ],
    '核心区域': [
      { name: '仙古意志投影', skills: ['法则压制', '道则领域', '天罚降临'],
        drops: [{ name: '道韵结晶', chance: 0.3, rarity: '神话' }, { name: '法则感悟', chance: 0.5, rarity: '传说' }] },
      { name: '纪元终结者', skills: ['纪元终结', '时间静止', '因果抹杀'],
        drops: [{ name: '时间法则碎片', chance: 0.2, rarity: '神话' }, { name: '唯一道则', chance: 0.05, rarity: '神话' }] }
    ]
  };

  // 区域缩放系数：中层0.5 / 深层1.0 / 核心2.0
  const zoneFactor = { '中层区域': 0.5, '深层区域': 1.0, '核心区域': 2.0, '火道禁区': 3.0 }[location] || 0.5;
  const zoneLevels = { '中层区域': 7, '深层区域': 9, '核心区域': 11, '火道禁区': 13 };
  const bossLevel = zoneLevels[location] || 7;

  const locationBosses = bossDefs[location] || bossDefs['中层区域'];
  const bossDef = locationBosses[Math.floor(Math.random() * locationBosses.length)];
  const scaled = getBossScaledStats(player.xiangulevel_id || 5, zoneFactor);

  // 构建Boss战斗对象
  let B_enemy = {
    名号: bossDef.name,
    攻击: scaled.attack,
    防御: scaled.defense,
    当前血量: scaled.hp,
    血量上限: scaled.hp,
    暴击率: 0.1,
    法球倍率: 0.15,
    灵根: { 法球倍率: 0.15 },
    学习的功法: bossDef.skills.slice(0, 2),
    魔道值: 100,
    仙宠: null,
    神石: {},
    xiangulevel_id: bossLevel,
    mijinglevel_id: Math.max(1, bossLevel - 3),
  };

  // 凶名值给Boss附加压力（高凶名者Boss会狂暴）
  const infamy = player.xiangu_infamy || 0;
  if (infamy > 100) {
    B_enemy.攻击 = Math.floor(B_enemy.攻击 * (1 + infamy / 500));
    B_enemy.当前血量 = Math.floor(B_enemy.当前血量 * (1 + infamy / 1000));
    B_enemy.血量上限 = B_enemy.当前血量;
  }

  const battleSides = buildXianguBattleSides(player, B_enemy, { attackerId: player_qq });
  const Data_battle = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_boss' });
  const leaderWinner = resolveXianguLeaderWinner(Data_battle);
  const msg = Data_battle.msg;
  const battleLog = [...battleSides.messages, ...(Array.isArray(msg) ? msg : [String(msg || '')])];
  
  if (leaderWinner === 'A') {
    // 战斗胜利
    const rewards = [];
    for (const drop of bossDef.drops) {
      if (Math.random() < drop.chance) {
        rewards.push(drop);
        await addXianguSpoil(player_qq, drop.name, 1);
        await markUniqueItemObtained(drop.name, player_qq);
      }
    }
    
    // Boss战斗使用3倍境界奖励
    const riskMultiplier = location === '深层区域' ? 2 : location === '核心区域' ? 3 : 1;
    const { xiuwei: bossXw, xueqi: bossXq } = calcExploreRewards(player, 3 * riskMultiplier);
    const expGain = bossXw;
    const xueqiGain = bossXq;
    const xiongmngGain = Math.floor(20 * riskMultiplier);
    const daoyunGain = Math.floor(50 * riskMultiplier);
    
    const bossRewards = await grantXianguGrowthRewards(player, player_qq, {
      xiuwei: expGain,
      xueqi: xueqiGain,
    });
    player.xiangu_infamy = (Number(player.xiangu_infamy) || 0) + xiongmngGain;
    player.xiangu_gains ||= {};
    player.xiangu_gains.xiongmng = (Number(player.xiangu_gains.xiongmng) || 0) + xiongmngGain;
    player.xiangu_gains.daoyun = (Number(player.xiangu_gains.daoyun) || 0) + daoyunGain;
    
    let rewardMsg = [
      `修为 +${bossRewards.xiuwei.toLocaleString()}`,
      `血气 +${bossRewards.xueqi.toLocaleString()}`,
      `凶名值 +${xiongmngGain}`,
      `道韵领悟 +${daoyunGain}`
    ];

    if (rewards.length > 0) {
      rewardMsg.push(...rewards.map(r => `${r.name} (${r.rarity})`));
    }

    const xianguConfig = getXianguSecretConfig();
    if (shouldDropXianguSeed(xianguConfig, location, 'boss')) {
      const seed = generateRandomSeed(location, { source: 'boss' });
      grantXianguSeed(player, seed);
      await Write_player(player_qq, player);

      rewardMsg.push(`【道种掉落！】${seed.名称} [${seed.品质}]`);
    }

    const rewardText = rewardMsg.length > 0 ? rewardMsg.join('\n') : '未掉落稀有物品';

    return [
      `【Boss遭遇·激战】`,
      ``,
      `${player.名号}在${location}遭遇了${bossDef.name}！`,
      `Boss怒吼："卑微的入侵者，受死！"`,
      `${player.名号}眼神坚定，拔剑相迎！`,
      ``,
      `【Boss信息】`,
      `- 名称：${bossDef.name}`,
      `- 等级：${bossLevel}`,
      `- 生命值：${scaled.hp.toLocaleString()}`,
      `- 技能：${bossDef.skills.join('、')}`,
      ``,
      `━━━━ 战斗过程 ━━━━`,
      ...battleLog.slice(-8),
      `━━━━ 战斗结果 ━━━━`,
      `${player.名号}施展浑身解数，终于将Boss击败！`,
      ``,
      `【战斗奖励】`,
      rewardText,
      ``,
      `【古史记载】`,
      `"能击败此等存在者，必是天骄中的天骄..."`
    ].join('\n');

  } else {
    // 战斗失败
    const hpLoss = Math.floor((Number(player.当前血量) || Number(player.血量上限 || player.血气上限) || 1) * 0.4);
    player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - hpLoss);
    applyXianguHeavyInjury(player);
    await Write_player(player_qq, player);
    
    return [
      `【Boss遭遇·惨败】`,
      ``,
      `${player.名号}在${location}遭遇了${bossDef.name}！`,
      `Boss低语："不自量力..."`,
      `${player.名号}拼尽全力，却仍难以为敌！`,
      ``,
      `【Boss信息】`,
      `- 名称：${bossDef.name}`,
      `- 等级：${bossLevel}`,
      `- 生命值：${scaled.hp.toLocaleString()}`,
      `- 技能：${bossDef.skills.join('、')}`,
      ``,
      `━━━━ 战斗过程 ━━━━`,
      ...battleLog.slice(-8),
      `━━━━ 战斗结果 ━━━━`,
      `${player.名号}重伤败退，狼狈逃离！`,
      ``,
      `【损失】`,
      `血气 -${hpLoss.toLocaleString()}`,
      `状态：重伤（30分钟内探索效率降低50%）`,
      ``,
      `【古史警示】`,
      `"秘境Boss非等闲可比，还需修炼更强再战"`
    ].join('\n');
  }
}
// 获取区域描述
function getAreaDescription(area) {
  const descriptions = {
    '边缘区域': `远处殿宇隐约，仙雾缭绕；
接引古殿巍峨耸立，符文流转；
这里相对安全，是初入秘境者的避风港。`,
    '中层区域': `仙药芬芳弥漫，不死物质浓郁；
真龙巢穴隐约传来低吟；
危险与机遇并存，天骄的试炼场。`,
    '深层区域': `道韵浓郁得几乎凝成实质；
远处仙王讲道的声音若隐若现；
然而黑暗牢笼中，不朽之王的气息令人心悸。`,
    '核心区域': `仙古花蕾璀璨夺目，道纹交织；
这里是秘境的中心，也是离开的唯一出口；
蕴含着传说中最顶级的机缘——唯一道则碎片。`,
    '火道禁区': `万火深渊中三千道火熊熊燃烧；
祭炼真我者于此感悟大道，火道道种遍地；
高品神火者在此如鱼得水，低品者步履维艰。`
  };
  return descriptions[area] || descriptions['边缘区域'];
}

// 获取区域特性
function getAreaFeature(area) {
  const features = {
    '边缘区域': '安全区域，适合新手历练',
    '中层区域': '危险区域，可能遭遇遗种和守卫',
    '深层区域': '高危区域，仙王残念与黑暗力量并存',
    '核心区域': '撤离区域，顶级机缘与最终Boss',
    '火道禁区': '祭炼场·三千青石阶，火道道种孕育之地'
  };
  return features[area] || features['边缘区域'];
}

// 获取区域建议
function getAreaSuggestion(area) {
  const suggestions = {
    '边缘区域': '先在此地熟悉环境，积累资源',
    '中层区域': '可尝试探索十凶传承地或仙药园',
    '深层区域': '需做好充分准备，携带足够补给',
    '核心区域': '最后前来，带足宝物准备撤离'
  };
  return suggestions[area] || suggestions['边缘区域'];
}


// 根据品质获取神火属性倍率
function getFlameQualityRate(quality) {
  const rates = { '下品': 0.3, '中品': 0.5, '上品': 1.0, '极品': 1.5, '唯一': 2.0 };
  return rates[quality] || 0.3;
}

// 道种品质 → 神火品质（统一两套阶梯：普通→下品/稀有→中品/传说→上品/神话→极品）
const DAOZHONG_TO_SHENHUO = {
  '普通': '下品',
  '稀有': '中品',
  '传说': '上品',
  '神话': '极品'
};

// 统一获取玩家神火品质（兼容道种孕育/祭炼真我两条点燃路径，修复品质错位 Bug）
function getShenhuoQuality(player) {
  const sh = player.xiangu_shenhuo;
  if (!sh) return '下品';
  if (sh.神火品质) return sh.神火品质;              // 道种孕育/祭炼真我路径已直接写入
  if (sh.道种品质) return DAOZHONG_TO_SHENHUO[sh.道种品质] || '下品';
  return '下品';
}


// 生成随机道种：先按区域/碎片判定顶级仙种，再回退到对应区域的常规池。
function generateRandomSeed(location, options = {}) {
  return drawXianguSeed(getXianguSecretConfig(), { location, ...options });
}

// ==================== 步骤5：动态事件系统与NPC生态 ====================

// ---- 全局动态事件状态（内存中，重启清零） ----
const XIANGU_EVENTS = {
  // 当前激活的事件：{ type, startTime, endTime, desc, participants }
  activeEvent: null,
  // 事件冷却时间记录
  lastEventTime: {},
  // 擂台参赛者列表
  arenaParticipants: [],
  // 事件历史（最近10条）
  eventHistory: []
};

// 事件定义表
const EVENT_TYPES = {
  arena: {
    name: '仙古擂台',
    desc: '仙古秘境深处，一块古老的擂台浮现于虚空之中。先贤曾在此论道比剑，今日再现，诸位修士皆可参与，夺得"仙古第一"之名！',
    duration: 1800000,  // 30分钟
    cooldown: 7200000,  // 2小时冷却
    minPlayers: 2,
    rewards: {
      winner: { daoyun: 500, desc: '仙古擂台头名，道韵大进！' },
      top3:   { daoyun: 200, desc: '擂台前三，颇有斩获' },
      runner: { daoyun: 50,  desc: '参与擂台，略有领悟' }
    }
  },
  shixiong_awakening: {
    name: '十凶遗种觉醒',
    desc: '秘境深处，古纪元十凶之一的遗种忽然觉醒！那蕴含着上古恶意的力量席卷四方，凡在秘境中的修士皆感受到一股凛冽寒意。传说击败遗种可得稀世道种！',
    duration: 1200000,  // 20分钟
    cooldown: 10800000, // 3小时冷却
    location: '深层区域',
    bossMultiplier: 5   // Boss倍率
  },
  dark_cell_riot: {
    name: '黑暗牢笼异动',
    desc: '黑暗牢笼中传来古老的震鸣，仿佛某种上古存在在试图挣脱封印。秘境中灵气骤乱，所有修士探索效率下降，但机缘也随之倍增！',
    duration: 900000,   // 15分钟
    cooldown: 5400000,  // 90分钟冷却
    debuff: { exploreEfficiency: -0.3, rewardMultiplier: 2.0 }
  },
  ancient_treasure: {
    name: '古纪造化出世',
    desc: '秘境核心区域，一件上古遗宝破封而出！虚空震颤，道纹流转。此宝乃仙古纪元遗留，蕴含无尽造化，得之者可一步登天！',
    duration: 600000,   // 10分钟
    cooldown: 21600000, // 6小时冷却
    location: '核心区域',
    unique: true
  }
};

// ====== 阵营系统定义 ======
const XIANGU_FACTIONS = {
  good: {
    name: '善良阵营',
    icon: '✦',
    color: '#4FC3F7',
    npcTypes: ['古仙引路者', '古老传承者', '古帝虚影'],
    desc: '仙古秘境中守护传承、引渡有缘人的存在',
    ranks: [
      { name: '崇拜', min: 500, effects: ['NPC可赐予帝念碎片', '秘境探索发现率+20%', '解锁阵营商店传说级商品'] },
      { name: '信任', min: 200, effects: ['NPC可传授秘法', '交易优惠15%', '解锁阵营商店稀有级商品'] },
      { name: '友善', min: 100, effects: ['NPC交易优惠10%', '可接取阵营每日任务'] },
      { name: '熟识', min: 50,  effects: ['NPC态度友善，交谈有额外对话'] },
      { name: '陌生', min: 0,   effects: ['NPC正常交互'] },
      { name: '警惕', min: -50, effects: ['NPC态度疏远'] },
      { name: '敌视', min: -150,effects: ['NPC拒绝交易和交谈'] },
      { name: '仇恨', min: -999,effects: ['善良阵营NPC主动攻击'] }
    ],
    questPool: [
      { name: '降魔卫道', desc: '击败3位邪恶阵营NPC', target: 'evil_kill', count: 3, reward: { daoyun: 80, rep: 30 }, icon: '⚔️' },
      { name: '引渡迷途', desc: '与3位中立NPC交谈', target: 'neutral_talk', count: 3, reward: { daoyun: 50, rep: 20 }, icon: '💬' },
      { name: '秘境巡礼', desc: '探索5次秘境区域', target: 'explore', count: 5, reward: { daoyun: 60, rep: 25 }, icon: '🗺️' },
      { name: '灵物供奉', desc: '献祭1枚道种', target: 'offer_seed', count: 1, reward: { daoyun: 100, rep: 40 }, icon: '🔥' }
    ],
    shop: [
      { name: '古帝念碎片', price: 300, requireRep: 500, desc: '一丝古之大帝的意志碎片，可增强元神', icon: '💠', type: 'consumable' },
      { name: '仙道真解残卷', price: 200, requireRep: 200, desc: '记录仙古修炼法门的残卷', icon: '📜', type: 'skill' },
      { name: '天心印记', price: 150, requireRep: 100, desc: '秘境天心之印，提升道种觉醒几率', icon: '🌟', type: 'consumable' },
      { name: '古境灵露', price: 50, requireRep: 50, desc: '秘境灵脉凝聚的甘露，恢复大量血气', icon: '💧', type: 'consumable' }
    ]
  },
  neutral: {
    name: '中立阵营',
    icon: '◆',
    color: '#81C784',
    npcTypes: ['流浪修士', '道种贩者', '仙古兽灵'],
    desc: '在秘境中独善其身的存在，讲究等价交换',
    ranks: [
      { name: '知己', min: 200, effects: ['NPC可提供隐藏机缘线索', '解锁阵营商店稀有商品'] },
      { name: '信赖', min: 100, effects: ['可接取阵营每日任务', '交易优惠10%'] },
      { name: '友好', min: 50,  effects: ['NPC偶尔共享情报'] },
      { name: '陌生', min: 0,   effects: ['正常交互'] },
      { name: '疏远', min: -50, effects: ['NPC拒绝交易'] },
      { name: '排斥', min: -150,effects: ['NPC拒绝交谈'] }
    ],
    questPool: [
      { name: '互通有无', desc: '向NPC购买3次商品', target: 'npc_buy', count: 3, reward: { daoyun: 50, rep: 20 }, icon: '💰' },
      { name: '秘境见闻', desc: '探索中触发3次NPC交谈', target: 'npc_talk', count: 3, reward: { daoyun: 40, rep: 15 }, icon: '💬' },
      { name: '道种交易', desc: '收集2枚普通道种', target: 'collect_seed', count: 2, reward: { daoyun: 70, rep: 25 }, icon: '💎' }
    ],
    shop: [
      { name: '秘境情报·核心', price: 200, requireRep: 200, desc: '指引一处核心区域隐藏机缘', icon: '📜', type: 'map' },
      { name: '道种鉴定符', price: 100, requireRep: 100, desc: '鉴定一枚道种的隐藏属性', icon: '🔍', type: 'consumable' },
      { name: '纳戒扩容符', price: 80, requireRep: 50, desc: '增加纳戒容量', icon: '💍', type: 'consumable' },
      { name: '秘境灵药包', price: 40, requireRep: 0, desc: '一包秘境采摘的灵药，恢复中等血气', icon: '🌿', type: 'consumable' }
    ]
  },
  evil: {
    name: '邪恶阵营',
    icon: '▼',
    color: '#E57373',
    npcTypes: ['堕道修士'],
    desc: '被邪念侵蚀的修士，在秘境中以掠夺为生',
    ranks: [
      { name: '魔王', min: 500, effects: ['邪恶NPC俯首称臣', '可驱使邪恶NPC攻击其他修士', '解锁黑市传说级商品'] },
      { name: '霸主', min: 200, effects: ['黑市交易优惠30%', '邪恶NPC不主动招惹', '解锁黑市稀有商品'] },
      { name: '恶客', min: 100, effects: ['邪恶NPC不主动攻击', '可接取黑市任务'] },
      { name: '猎物', min: 0,   effects: ['邪恶NPC保持警惕'] },
      { name: '仇敌', min: -50, effects: ['邪恶NPC主动攻击概率+30%'] }
    ],
    questPool: [
      { name: '弱肉强食', desc: '掠夺3位其他NPC', target: 'npc_attack', count: 3, reward: { daoyun: 70, rep: 30 }, icon: '⚔️' },
      { name: '巧取豪夺', desc: '击败任意NPC并从纳戒获取战利品', target: 'npc_loot', count: 1, reward: { daoyun: 50, rep: 20 }, icon: '💰' },
      { name: '搜魂猎手', desc: '对NPC搜魂1次', target: 'soul_search', count: 1, reward: { daoyun: 100, rep: 40 }, icon: '👻' }
    ],
    shop: [
      { name: '噬道魔种', price: 300, requireRep: 500, desc: '吞噬后可大幅提升修为，但有副作用', icon: '🖤', type: 'consumable' },
      { name: '夺魂血炼术', price: 250, requireRep: 200, desc: '邪恶功法，击杀敌人时额外恢复血气', icon: '📕', type: 'skill' },
      { name: '暗杀烙印', price: 150, requireRep: 100, desc: '给目标修士打上烙印，击杀后可获得额外掉落', icon: '🎯', type: 'consumable' },
      { name: '黑市灵石袋', price: 60, requireRep: 0, desc: '一袋来路不明的灵石', icon: '💰', type: 'consumable' }
    ]
  }
};

// 阵营任务追踪（玩家侧）
const FACTION_QUEST_TRACK = {}; // { player_qq: { faction, questName, progress, max, completed, startedAt } }

// 阵营排行缓存
let factionRankCache = { good: [], neutral: [], evil: [], updatedAt: 0 };

// ====== 随机NPC名称生成器（玄幻风格） ======
const NPC_NAME_POOL = {
  姓: ['叶', '楚', '萧', '林', '苏', '姜', '姬', '风', '云', '龙', '秦', '石', '紫', '玄', '古', '荒', '冥', '幽', '虚', '辰', '莫', '白', '夜', '君', '洛', '凌', '薛', '夏', '沈'],
  名首: ['无', '天', '羽', '清', '寒', '长', '独', '太', '万', '九', '一', '初', '道', '剑', '仙', '帝', '神', '魔', '尘', '霄', '玄', '苍', '青', '紫', '金', '银', '风', '云', '月', '星', '冰', '炎', '雷', '荒', '古', '战', '破', '灭', '绝', '逆'],
  名尾: ['尘', '霄', '寒', '渊', '峰', '岳', '霆', '泽', '河', '洛', '云', '月', '星', '辰', '曦', '晔', '灵', '真', '玄', '道', '一', '无', '极', '天', '心', '魂', '骨', '命', '机', '缘', '劫', '灭', '生', '死', '轮', '回', '乱', '寂', '茫', '遥', '渊', '曦', '澜', '墨', '衍', '弈', '桓', '晔', '珝', '焱'],
  道号前缀: ['太虚', '无上', '九幽', '万古', '紫霄', '混元', '大罗', '清微', '玄黄', '鸿蒙', '苍冥', '太初', '寂灭', '轮回', '混沌', '灵虚'],
  称号: ['流浪剑客', '云游散修', '秘境猎手', '古道追寻者', '天骄争渡人', '秘境独行者', '道种寻访者', '仙古遗民', '散修奇人', '不世天骄', '隐世修士', '无名散人']
};

function generateRandomNPCName() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const 姓 = pick(NPC_NAME_POOL.姓);
  const 单名 = Math.random() < 0.4; // 40%概率单名
  const 名 = 单名 ? pick(NPC_NAME_POOL.名尾) : pick(NPC_NAME_POOL.名首) + pick(NPC_NAME_POOL.名尾);
  const 道号 = pick(NPC_NAME_POOL.道号前缀) + pick(['散人', '真人', '道人', '道人', '尊者', '居士', '老祖', '仙师']);
  const 称号 = pick(NPC_NAME_POOL.称号);
  return { 名号: 姓 + 名, 道号, 称号 };
}

// ====== 随机NPC属性按区域动态生成 ======
const NPC_REALM_MAP = {
  边缘区域: { minAtk: 5000, maxAtk: 20000, minHp: 50000, maxHp: 200000, realmRange: ['铭文境', '列阵境'] },
  中层区域: { minAtk: 20000, maxAtk: 80000, minHp: 200000, maxHp: 800000, realmRange: ['列阵境', '尊者境'] },
  深层区域: { minAtk: 80000, maxAtk: 300000, minHp: 800000, maxHp: 3000000, realmRange: ['尊者境', '神火境'] },
  核心区域: { minAtk: 300000, maxAtk: 1000000, minHp: 3000000, maxHp: 10000000, realmRange: ['神火境', '真一境'] }
};

/** 按区域随机生成一个NPC */
function generateRandomNPC(location, infamy) {
  const cfg = NPC_REALM_MAP[location] || NPC_REALM_MAP['边缘区域'];
  const { 名号, 道号, 称号 } = generateRandomNPCName();
  const atk = Math.floor(cfg.minAtk + Math.random() * (cfg.maxAtk - cfg.minAtk));
  const hp = Math.floor(cfg.minHp + Math.random() * (cfg.maxHp - cfg.minHp));
  const speed = Math.floor(800 + Math.random() * 1200);
  const realm = cfg.realmRange[Math.floor(Math.random() * cfg.realmRange.length)];

  // 随机人格
  const personalities = ['proud', 'scheming', 'friendly', 'hostile', 'neutral'];
  const personality = personalities[Math.floor(Math.random() * personalities.length)];

  // 随机功法（从通用池中选1-2门）
  const commonGongfa = ['补天术', '狻猊宝术', '青天鹏宝术', '朱雀宝术', '青鳞鹰宝术', '剑道真解', '九天剑诀', '五行真解', '紫气东来', '天雷诀', '冰魄玄功', '丹霞神功'];
  const gongfaCount = 1 + Math.floor(Math.random() * 2);
  const gongfa = [];
  for (let i = 0; i < gongfaCount; i++) {
    const g = commonGongfa[Math.floor(Math.random() * commonGongfa.length)];
    if (!gongfa.includes(g)) gongfa.push(g);
  }

  return {
    id: `random_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name: 名号,
    title: `${道号}·${称号}`,
    faction: personality === 'hostile' ? 'evil' : personality === 'friendly' ? 'good' : 'neutral',
    desc: `${名号}，${realm}修士，${称号}。`,
    境界: realm,
    攻击: atk,
    防御: Math.floor(atk * 0.4),
    当前血量: hp,
    血量上限: hp,
    速度,
    暴击率: 0.1 + Math.random() * 0.25,
    暴击伤害: 1.5 + Math.random() * 2,
    学习的功法: gongfa,
    dialogs: [
      personality === 'hostile' ? '哼，将你的东西交出来！' : '道友也是来寻机缘的？',
      '听闻这仙古秘境深处有大造化...',
      '此地凶险，独自探索需万分小心。'
    ],
    trade: null,
    hostile: personality === 'hostile',
    personality,
    inventory: [],
    isAlive: true,
    isCanon: false
  };
}

// NPC定义表（按区域分布）
const XIANGU_NPCS = {
  边缘区域: [
    {
      id: 'wandering_monk',
      name: '流浪修士',
      faction: 'neutral',
      title: '行走天地间',
      desc: '一名身着灰袍的修士，目光深沉，似乎在寻找着什么。',
      dialogs: [
        '秘境之中，危机四伏，异人当有自保之力。',
        '你也是来寻机缘的？此地不比凡间，处处凶险。',
        '听说深处有十凶的遗种，胆大者或可一试。'
      ],
      trade: null,
      hostile: false
    },
    {
      id: 'ancient_guide',
      name: '古仙引路者',
      faction: 'good',
      title: '前路指引',
      desc: '身形虚幻，似乎是某位古仙的残留意志，散发着柔和的金光。',
      dialogs: [
        '有缘人，此处乃仙古秘境边缘，深处机缘无数，但也险象环生。',
        '记住，道种乃此间最珍贵之物，融合三枚可引燃神火，成就神火境！',
        '善良之心，可感天地。在此处杀戮过重，天地法则会排斥于你。'
      ],
      trade: null,
      hostile: false,
      questItem: '仙途感悟·引'  // 可给予特殊道具
    }
  ],
  中层区域: [
    {
      id: 'dao_seed_trader',
      name: '道种贩者',
      faction: 'neutral',
      title: '以物易物',
      desc: '一名神秘的黑衣人，腰间挂满了各色种子，散发着奇异的气息。',
      dialogs: [
        '哦？你也有道种？本座可以用灵石或其他物品换你的。',
        '想要稀有道种？拿出你认为合适的价格来吧。',
        '道种乃修道根基，切莫轻易示人，以免招来杀身之祸。'
      ],
      trade: {
        items: [
          { name: '普通道种碎片', price: 5000, currency: '灵石' },
          { name: '稀有道种碎片', price: 20000, currency: '灵石' },
          { name: '传说道种碎片', price: 80000, currency: '灵石' }
        ]
      },
      hostile: false
    },
    {
      id: 'ancient_heritage',
      name: '古老传承者',
      faction: 'good',
      title: '传道解惑',
      desc: '一名白发苍苍的老者，眼中蕴含着岁月沉淀的智慧，似乎在等待有缘人。',
      dialogs: [
        '老朽在此等待数千年，终于等到有缘人。',
        '此地乃仙古纪元留存，蕴含无上道法，有缘者可得传承。',
        '你的道心如何？若能通过考验，可得老朽毕生所学一二。'
      ],
      trade: null,
      hostile: false,
      questGiver: true,  // 任务发布者
      reward: { type: 'skill', name: '仙古剑意' }
    }
  ],
  深层区域: [
    {
      id: 'evil_cultivator',
      name: '堕道修士',
      faction: 'evil',
      title: '魔道中人',
      desc: '一名气息阴沉的修士，眼中充满了贪欲，盯着你腰间的储物袋。',
      dialogs: [
        '留下买路钱，本座可以考虑放你离开。',
        '把你的道种交出来！你还不够资格留在深层区域！',
        '哼，你究竟是何来历，居然敢直视本座？'
      ],
      trade: null,
      hostile: true,  // 默认敌对（凶名低时可对话）
      hostileThreshold: 20  // 凶名低于此值时可正常交谈
    },
    {
      id: 'ancient_beast_guardian',
      name: '仙古兽灵',
      faction: 'neutral',
      title: '秘境守护',
      desc: '一头古老的灵兽，与秘境共生共存，守护着这片土地上的某种秘密。',
      dialogs: [
        '嗅嗅……你身上带着道种的气息，是此间的来客。',
        '本灵守护此处已有数万年，你是为道种而来？',
        '若能与本灵交换，本灵可助你一臂之力……'
      ],
      trade: {
        items: [
          { name: '兽灵精血', price: 1, currency: '道种碎片', currencyItem: true }
        ]
      },
      hostile: false
    }
  ],
  核心区域: [
    {
      id: 'ancient_emperor_shadow',
      name: '古帝虚影',
      faction: 'good',
      title: '永恒见证',
      desc: '一道虚幻的身影，似乎是某位上古大帝的残影，散发着帝威，令人不由自主地想要低头。',
      dialogs: [
        '时隔多少个纪元，终于又有生命踏入此地……',
        '你能来到此处，已非凡品。若有缘，本帝可赐你一道帝念。',
        '道种，神火，这是攀至神火境的关键。你可知晓此中玄机？'
      ],
      trade: null,
      hostile: false,
      special: 'emperor_blessing'  // 特殊赐福效果
    }
  ]
};

// ====== 原著天骄NPC（固定角色，按区域分布） ======
const XIANGU_CANON_NPCS = {
  核心区域: [
    {
      id: 'shiguanwang_tianzi',
      name: '十冠王天子',
      title: '仙古十世冠军·真龙传人',
      faction: 'neutral',
      desc: '仙古遗地十世冠军，真龙宝术传人，手持世界树幼苗，曾与荒天帝石昊争锋。周身龙气缭绕，一举一动皆有大道共鸣。',
      境界: '天神境',
      level_id: 11,  // 天神境（圣祭境插入后shift+1）
      速度: 1500,
      暴击率: 0.40,
      暴击伤害: 3.0,
      学习的功法: ['真龙宝术', '龙拳', '十世轮回经', '真龙困天术', '天子印', '世界树法则'],
      dialogs: [
        '我于仙古十世称冠，纵是荒天帝亲至，也未必能胜我。',
        '你体内有道种的气息...且让我看看，你有几分能耐。',
        '世界树幼苗在此，谁可与我争锋？',
        '仙古机缘，有能者居之。你若不服，擂台上见真章。'
      ],
      trade: null,
      hostile: false,
      personality: 'proud',
      special: 'world_tree_blessing',
      inventory: [],
      isAlive: true,
      isCanon: true,
      dropTable: [
        { item: '世界树残叶', chance: 0.3, desc: '一片蕴含世界之力的树叶' },
        { item: '真龙精血', chance: 0.15, desc: '真龙一族的精血，蕴含无上龙威' },
        { item: '天子印碎片', chance: 0.25, desc: '十冠王天子印的碎片' }
      ]
    },
    {
      id: 'zhexian',
      name: '谪仙',
      title: '凶巢布局者·无冕之王',
      faction: 'neutral',
      desc: '九天十地老怪物培养的古代怪胎，布下凶巢十世杀局，坑杀二十万生灵以获取天角蚁宝术。被十冠王称为"无冕之王"，修为深不可测，手持天角蚁战角，一身杀伐之气隐而不发。',
      境界: '神火境巅峰',
      level_id: 8,
      速度: 1400,
      暴击率: 0.35,
      暴击伤害: 2.8,
      学习的功法: ['天角蚁宝术', '真凰宝术', '凶巢杀阵', '天角蚁战角'],
      dialogs: [
        '二十万生灵入我凶巢...不过是布局的一环罢了。',
        '十冠王称我为无冕之王，你觉得这称号如何？',
        '天角蚁宝术，十凶之一...你可知我为此付出了多少？',
        '仙古秘境中的造化，我已布局十世。你，不过是棋盘上的一子。'
      ],
      trade: null,
      hostile: false,
      personality: 'scheming',
      special: 'tianjiao_ant',
      inventory: [],
      isAlive: true,
      isCanon: true,
      dropTable: [
        { item: '天角蚁宝术残卷', chance: 0.3, desc: '十凶天角蚁宝术的残卷' },
        { item: '真凰精血', chance: 0.2, desc: '蕴含真凰血脉的精血' },
        { item: '凶巢阵纹碎片', chance: 0.2, desc: '凶巢杀阵的阵纹碎片' }
      ]
    }
  ],
  深层区域: [
    {
      id: 'ningchuan',
      name: '六冠王宁川',
      title: '六世冠王·轮回不灭',
      faction: 'neutral',
      desc: '曾在仙古秘境六世称冠的绝代天骄，修炼六道轮回天功，每一世都可保留前世修为。气息深沉如渊，目光中似有轮回流转。',
      境界: '尊者境巅峰',
      level_id: 7,
      速度: 1300,
      暴击率: 0.30,
      暴击伤害: 2.5,
      学习的功法: ['六道轮回天功', '轮回拳', '轮回诸天拳', '六道轮回拳'],
      dialogs: [
        '六世轮回，我见过太多天骄陨落...你，会是下一个吗？',
        '六道轮回天功，乃我六世所悟，你可想领教？',
        '仙古秘境的水，比你想象中深得多。',
        '你身上有股熟悉的气息...莫非你也修炼了轮回之法？'
      ],
      trade: null,
      hostile: false,
      personality: 'scheming',
      special: 'reincarnation',
      inventory: [],
      isAlive: true,
      isCanon: true,
      dropTable: [
        { item: '轮回印记', chance: 0.3, desc: '一道轮回印记，蕴含六世记忆碎片' },
        { item: '六道轮回残卷', chance: 0.2, desc: '六道轮回天功的残卷' },
        { item: '神魂结晶', chance: 0.25, desc: '六世修士的神魂凝晶' }
      ]
    },
    {
      id: 'gujian_yun',
      name: '孤剑云',
      title: '剑谷传人·古代怪胎',
      faction: 'neutral',
      desc: '剑谷传人，背负一柄古朴神剑的古代怪胎。曾于仙古擂台上视石昊为"将死之人"，觊觎石昊手中的大罗仙剑。一身剑道修为通神，眸光锐利如剑芒，令天骄胆寒。',
      境界: '尊者境',
      level_id: 7,
      速度: 1600,
      暴击率: 0.45,
      暴击伤害: 3.5,
      学习的功法: ['剑谷剑诀', '天晶剑术', '剑道通神', '万剑归宗'],
      dialogs: [
        '你的剑...那是大罗仙剑？与我剑谷有缘，何不交予我一观？',
        '天下万剑，唯我剑谷居首。你，挡得住我这一剑吗？',
        '仙古擂台上，我视你为将死之人...如今看来，倒有几分意思。',
        '若你能接我三剑不死，我便告诉你一处剑道机缘。'
      ],
      trade: null,
      hostile: false,
      personality: 'proud',
      special: 'sword_intent',
      inventory: [],
      isAlive: true,
      isCanon: true,
      dropTable: [
        { item: '剑谷剑意碎片', chance: 0.3, desc: '一缕纯粹的剑谷剑意' },
        { item: '天晶剑芒', chance: 0.25, desc: '一缕天晶剑术凝聚的剑芒' },
        { item: '古剑残躯', chance: 0.15, desc: '一柄断裂的远古神剑残躯' }
      ]
    },
    {
      id: 'dichong',
      name: '帝冲',
      title: '仙殿传人·九头不死鸟',
      faction: 'evil',
      desc: '仙殿传人，真身为九头不死鸟，拥有九命复活之能。与石昊有不共戴天之仇，在仙古秘境中被石昊连杀五次、烧毁肉身。修炼仙王九封、人仙印等仙殿秘术，周身不死仙火缭绕，令人望而生畏。',
      境界: '尊者境巅峰',
      level_id: 7,
      速度: 1100,
      暴击率: 0.30,
      暴击伤害: 2.8,
      学习的功法: ['仙王九封', '人仙印', '虚空战戟', '不死鸟涅槃法'],
      dialogs: [
        '石昊！哪怕你将我杀了千次万次，不死鸟之躯亦能重生！',
        '仙殿之主不会放过你的...你杀我一次，我便复活一次。',
        '九头不死鸟，九命复活，你杀得完吗？',
        '月婵之事，你我之间只有死战，没有第二条路。'
      ],
      trade: null,
      hostile: true,
      personality: 'proud',
      special: 'nine_lives_rebirth',
      inventory: [],
      isAlive: true,
      isCanon: true,
      dropTable: [
        { item: '仙殿秘术残页', chance: 0.3, desc: '仙殿不传之秘的残缺书页' },
        { item: '不死鸟精血', chance: 0.2, desc: '九头不死鸟的精血，蕴含涅槃之力' },
        { item: '人仙印碎片', chance: 0.15, desc: '人仙印的残缺碎片' }
      ]
    }
  ],
  中层区域: [
    {
      id: 'honghuang',
      name: '红凰',
      title: '真凰转世·浴火涅槃',
      faction: 'good',
      desc: '真凰一族的后裔，拥有浴火重生的天赋。容貌绝美，周身赤霞缭绕，眉心有一枚真凰烙印，据说她每涅槃一次，修为便暴涨一截。',
      境界: '列阵境巅峰',
      level_id: 6,
      速度: 1350,
      暴击率: 0.30,
      暴击伤害: 2.5,
      学习的功法: ['真凰宝术', '红凰弑天决', '涅槃经', '凤凰天火'],
      dialogs: [
        '凤凰涅槃，浴火重生...你可曾见过那绚烂？',
        '这仙古秘境中，似乎有我先祖的气息。',
        '你身上有种让我感到温暖的气息...真凰血脉的同源感应？',
        '小心为上，秘境深处有大恐怖。我曾亲眼目睹一位天骄化为飞灰。'
      ],
      trade: null,
      hostile: false,
      personality: 'friendly',
      special: 'phoenix_rebirth',
      inventory: [],
      isAlive: true,
      isCanon: true,
      dropTable: [
        { item: '真凰翎羽', chance: 0.3, desc: '一根燃烧着火焰的真凰翎羽' },
        { item: '涅槃精血', chance: 0.2, desc: '一枚蕴含生机的涅槃精血' },
        { item: '凤凰泪', chance: 0.25, desc: '一滴凤凰之泪，蕴含生机' }
      ]
    }
  ]
};

// 原著天骄的击杀奖励表（特殊掉落）


// ---- 辅助：向所有在秘境中的玩家广播消息 ----
async function broadcastToXianguPlayers(message) {
  try {
    const playerDataDir = path.join(process.cwd(), 'data', 'xiuxian_player');
    if (!fs.existsSync(playerDataDir)) return;

    const files = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.json'));
    const groupIds = new Set();

    for (const file of files) {
      try {
        const pdata = JSON.parse(fs.readFileSync(path.join(playerDataDir, file), 'utf8'));
        if (pdata.in_xiangu && pdata.group_id) {
          groupIds.add(pdata.group_id);
        }
      } catch (err) {}
    }

    for (const groupId of groupIds) {
      try {
        await Bot.pickGroup(Number(groupId)).sendMsg(message);
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err) {
        console.error('秘境广播失败:', groupId, err.message);
      }
    }
  } catch (err) {
    console.error('broadcastToXianguPlayers 错误:', err);
  }
}

// ---- 辅助：获取当前活跃NPC（根据玩家位置和凶名） ----
// 根据NPC的level_id动态计算战斗属性
function getNPCScaledStats(npc, zoneFactor = 0.5) {
  if (npc.level_id) {
    const scaled = getBossScaledStats(npc.level_id, zoneFactor);
    const mult = npc.isCanon ? 1.5 : 1.0;
    return {
      攻击: Math.floor(scaled.attack * mult * 0.3),
      防御: Math.floor(scaled.defense * mult * 0.3),
      当前血量: Math.floor(scaled.hp * mult * 0.5),
    };
  }
  return {
    攻击: npc.攻击 || 50000,
    防御: npc.防御 || 20000,
    当前血量: npc.当前血量 || npc.血量上限 || 500000,
  };
}

function createXianguNpcBattleData(npc, zoneFactor = 0.5, name = npc.name || npc.名号) {
  const scaled = getNPCScaledStats(npc, zoneFactor);
  const maxHp = Number(scaled.当前血量) || Number(npc.血量上限) || 500000;
  return {
    ...npc,
    id: undefined,
    名号: name,
    攻击: scaled.攻击,
    防御: scaled.防御,
    当前血量: maxHp,
    血量上限: maxHp,
    速度: Number(npc.速度) || 1000,
    暴击率: Number(npc.暴击率) || 0.15,
    暴击伤害: Number(npc.暴击伤害) || 2,
    法球倍率: Number(npc.法球倍率 ?? npc.灵根?.法球倍率) || 1,
    学习的功法: Array.isArray(npc.学习的功法) ? npc.学习的功法 : Object.keys(npc.学习的功法 || {}),
    xiangulevel_id: Number(npc.xiangulevel_id || npc.level_id) || 5,
    mijinglevel_id: Number(npc.mijinglevel_id) || 0,
    灵根: npc.灵根 || { name: '无', type: '无', 法球倍率: 1 },
    道心值: Number(npc.道心值) || 100,
    元神: Number(npc.元神) || 500000,
  };
}

function createXianguPoolAmbushers(npc) {
  const leader = createXianguNpcBattleData(npc, 0.6);
  const accompliceHp = Math.max(1, Math.floor(leader.血量上限 * 0.75));
  const accomplice = {
    ...leader,
    id: undefined,
    名号: `${leader.名号}的伏兵`,
    攻击: Math.max(1, Math.floor(leader.攻击 * 0.8)),
    防御: Math.max(1, Math.floor(leader.防御 * 0.8)),
    当前血量: accompliceHp,
    血量上限: accompliceHp,
  };
  return [leader, accomplice];
}

function getNPCsForPlayer(location, infamy) {
  // 基础NPC（静态）
  const baseNpcs = XIANGU_NPCS[location] || [];
  const npcs = [...baseNpcs];

  // 原著天骄（始终出现，由区域决定）
  const canonNpcs = XIANGU_CANON_NPCS[location] || [];
  for (const canon of canonNpcs) {
    if (!canon.isAlive && Date.now() < canon.respawnTime) continue;
    // 敌对NPC需要检查凶名阈值
    if (canon.hostile && canon.hostileThreshold && infamy < canon.hostileThreshold) continue;
    npcs.push(canon);
  }

  // 随机Npc：每个区域随机生成1-2个
  const randomCount = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < randomCount; i++) {
    npcs.push(generateRandomNPC(location, infamy));
  }

  return npcs.filter(npc => {
    if (!npc.hostile) return true;
    if (npc.hostile && npc.hostileThreshold) {
      return infamy >= npc.hostileThreshold;
    }
    return npc.hostile;
  });
}

// ==== 动态事件命令 ====

// 查看当前秘境事件
async function XianguEventListFn(e, player) {
  const now = Date.now();
  const activeEv = XIANGU_EVENTS.activeEvent;

  let eventLines = [
    `【仙古秘境·大事记】`,
    ``,
  ];

  if (activeEv && activeEv.endTime > now) {
    const remaining = Math.ceil((activeEv.endTime - now) / 60000);
    const evDef = EVENT_TYPES[activeEv.type];
    eventLines.push(
      `🔥 【当前事件】${evDef.name}`,
      `${activeEv.desc || evDef.desc}`,
      ``,
      `剩余时间：${remaining}分钟`,
      ...(activeEv.location ? [`事件位置：${activeEv.location}`] : []),
      ``
    );
  } else {
    eventLines.push(`【当前无特殊事件】`, ``);

    // 预估下次事件
    const nextEvents = Object.entries(EVENT_TYPES).map(([key, def]) => {
      const lastTime = XIANGU_EVENTS.lastEventTime[key] || 0;
      const nextTime = lastTime + def.cooldown;
      return { key, name: def.name, nextTime };
    }).sort((a, b) => a.nextTime - b.nextTime);

    const soonest = nextEvents[0];
    const waitMin = Math.max(0, Math.ceil((soonest.nextTime - now) / 60000));
    eventLines.push(
      `【即将发生】`,
      `最近可能事件：${soonest.name}`,
      waitMin > 0 ? `约${waitMin}分钟后可能触发` : `随时可能爆发！`,
      ``
    );
  }

  // 历史事件（最近3条）
  if (XIANGU_EVENTS.eventHistory.length > 0) {
    eventLines.push(`【近期事件记录】`);
    XIANGU_EVENTS.eventHistory.slice(-3).reverse().forEach(ev => {
      const elapsed = Math.floor((now - ev.time) / 60000);
      eventLines.push(`· ${ev.name} — ${elapsed}分钟前`);
    });
    eventLines.push(``);
  }

  eventLines.push(`【秘境说明】`, `· 使用 #仙古擂台 参与竞技事件`, `· 事件期间探索可获得额外奖励`);

  return e.reply(eventLines.join('\n'));
}

// 仙古擂台 - 查看/发起
async function XianguArenaFn(e, player, player_qq) {
  const now = Date.now();
  const arenaDef = EVENT_TYPES.arena;

  // 检查擂台冷却
  const lastArena = XIANGU_EVENTS.lastEventTime.arena || 0;
  const cooldownLeft = Math.ceil((lastArena + arenaDef.cooldown - now) / 60000);

  if (!XIANGU_EVENTS.activeEvent || XIANGU_EVENTS.activeEvent.type !== 'arena') {
    if (cooldownLeft > 0) {
      return e.reply([
        `【仙古擂台·冷却中】`,
        ``,
        `上一届擂台已结束，仙古之地尚未积蓄足够的道韵，`,
        `无法开启新的擂台争霸！`,
        ``,
        `冷却剩余：${cooldownLeft}分钟`,
        ``,
        `提示：届时使用 #仙古擂台 开启`
      ].join('\n'));
    }

    // 发起擂台
    const endTime = now + arenaDef.duration;
    XIANGU_EVENTS.activeEvent = {
      type: 'arena',
      startTime: now,
      endTime,
      desc: arenaDef.desc,
      participants: [player_qq]
    };
    XIANGU_EVENTS.lastEventTime.arena = now;
    XIANGU_EVENTS.arenaParticipants = [{ qq: player_qq, name: player.名号, wins: 0 }];

    // 全服广播
    const broadMsg = [
      `【仙古秘境·大事件！】`,
      ``,
      `═══════════════════`,
      `仙古擂台 横空出世！`,
      `═══════════════════`,
      ``,
      arenaDef.desc,
      ``,
      `由${player.名号}率先踏上擂台，引动古阵运转！`,
      ``,
      `【参与方式】`,
      `使用 #参与仙古擂台 报名`,
      `使用 #秘境攻击 @对手 与擂台参与者交战`,
      ``,
      `擂台持续：30分钟`,
      `胜者将获得丰厚道韵奖励及"仙古第一"称号！`
    ].join('\n');
    broadcastToXianguPlayers(broadMsg);

    return e.reply([
      `【仙古擂台·开启！】`,
      ``,
      `${player.名号}踏上擂台，引动古阵！`,
      `全秘境修士已收到通知！`,
      ``,
      `你已成为第一位参与者`,
      `等待其他修士挑战...`,
      ``,
      `使用 #秘境攻击 @对手 进行擂台对决`
    ].join('\n'));
  }

  // 擂台已开启，显示状态
  const remaining = Math.ceil((XIANGU_EVENTS.activeEvent.endTime - now) / 60000);
  const participants = XIANGU_EVENTS.arenaParticipants;

  let lines = [
    `【仙古擂台·进行中】`,
    ``,
    `剩余时间：${remaining}分钟`,
    `参赛人数：${participants.length}`,
    ``,
    `【当前参赛者】`
  ];
  participants.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.name} — 胜场：${p.wins}`);
  });
  lines.push(``, `使用 #参与仙古擂台 加入擂台`);

  return e.reply(lines.join('\n'));
}

// 参与仙古擂台
async function XianguArenaJoinFn(e, player, player_qq) {
  if (!XIANGU_EVENTS.activeEvent || XIANGU_EVENTS.activeEvent.type !== 'arena') {
    return e.reply(`【擂台未开启】当前没有进行中的擂台，使用 #仙古擂台 查看`);
  }

  const already = XIANGU_EVENTS.arenaParticipants.find(p => p.qq === player_qq);
  if (already) {
    return e.reply(`${player.名号}已在擂台参赛名单中！使用 #秘境攻击 @对手 与其他修士交战`);
  }

  XIANGU_EVENTS.arenaParticipants.push({ qq: player_qq, name: player.名号, wins: 0 });

  return e.reply([
    `【仙古擂台·参赛成功！】`,
    ``,
    `${player.名号}踏上仙古擂台，昂然迎接挑战！`,
    ``,
    `当前参赛人数：${XIANGU_EVENTS.arenaParticipants.length}`,
    ``,
    `【攻略提示】`,
    `· 使用 #秘境攻击 @对手 与擂台内修士对决`,
    `· 击败擂台对手可获得双倍凶名值和道韵奖励`,
    `· 擂台结束时，胜场最多者获"仙古第一"称号`
  ].join('\n'));
}

// ==== NPC系统命令 ====

// 与NPC交谈
async function XianguNPCTalkFn(e, player, player_qq) {
  const location = player.xiangu_location || '边缘区域';
  const infamy = player.xiangu_infamy || 0;
  const npcs = getNPCsForPlayer(location, infamy);

  if (npcs.length === 0) {
    return e.reply([
      `【NPC·无人迹】`,
      `${player.名号}在${location}四处张望，`,
      `此处寂静如斯，暂无其他存在的气息。`,
      ``,
      `提示：不同区域有不同的修士和存在，深入探索可遇更多NPC`
    ].join('\n'));
  }

  // 随机遭遇一个NPC
  const npc = npcs[Math.floor(Math.random() * npcs.length)];
  const dialog = npc.dialogs[Math.floor(Math.random() * npc.dialogs.length)];

  // 阵营关系影响对话
  const faction = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
  const factionRep = faction[npc.faction] || 0;
  let relationDesc = '陌生人';
  if (factionRep >= 200) relationDesc = '信任';
  else if (factionRep >= 100) relationDesc = '友善';
  else if (factionRep >= 50) relationDesc = '熟识';
  else if (factionRep < 0) relationDesc = '警惕';

  const lines = [
    `【NPC遭遇·${location}】`,
    ``,
    `${player.名号}在此地偶遇了一位修士：`,
    ``,
    `【${npc.name}】${npc.title}`,
    `阵营：${npc.faction === 'good' ? '善良' : npc.faction === 'evil' ? '邪恶' : '中立'}`,
    `关系：${relationDesc}（${factionRep >= 0 ? '+' : ''}${factionRep}）`,
    ``,
    `"${dialog}"`,
    ``,
    `━━━━ 可交互操作 ━━━━`
  ];

  if (npc.trade) {
    lines.push(`· #向NPC购买 [物品名] — 购买物品`);
  }
  if (npc.questGiver) {
    lines.push(`· 此NPC可能发布任务，继续探索触发`);
  }
  if (npc.special === 'emperor_blessing' && factionRep >= 100) {
    lines.push(`· 你与善良阵营关系颇佳，${npc.name}可能赐予帝念！`);
  }
  if (npc.hostile && infamy < (npc.hostileThreshold || 20)) {
    lines.push(`⚠️ 此NPC性格危险，提防其突然出手`);
  }

  const poolConfig = resolveXianguMarrowPoolConfig(getXianguSecretConfig());
  if (Math.random() < poolConfig.npcInviteChance) {
    if (!player.xiangu_realm_map) initXianguRealmMap(player);
    const npcId = npc.id || npc.name || npc.名号;
    const relation = Number(player.xiangu_npc_relations?.[npcId] ?? factionRep) || 0;
    const trapChance = getXianguMarrowPoolTrapChance(npc, relation);
    const isTrap = Math.random() < trapChance;
    const invitation = placeXianguMarrowPool(player.xiangu_realm_map, {
      reveal: true,
      metadata: {
        source: 'npc_invite',
        invitedBy: npcId,
        invitedByName: npc.name || npc.名号,
        isTrap,
        ambushers: isTrap ? createXianguPoolAmbushers(npc) : [],
      },
    });
    if (invitation.placed) {
      ensureXianguExitConnectivity(
        player.xiangu_realm_map.grid,
        player.xiangu_realm_map.playerPos,
        [invitation.position],
        { wallValue: CELL_TYPE.WALL, emptyValue: CELL_TYPE.EMPTY },
      );
      lines.push(
        ``,
        `💧【隐秘邀请】`,
        `${npc.name || npc.名号}压低声音：`,
        `“我发现一方${XIANGU_MARROW_POOL_NAME}，其中仙髓可洗炼根骨。你若有胆，便随这道印记前去。”`,
        `宝池坐标：[${invitation.position.x}, ${invitation.position.y}]`,
        `对方没有再作解释，这份邀请究竟是善意还是杀局，只能到场方知。`,
      );
      await Write_player(player_qq, player);
    }
  }

  // 触发特殊效果
  if (npc.id === 'ancient_guide' && Math.random() < 0.3) {
    player.xiangu_faction_rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
    player.xiangu_faction_rep.good = (player.xiangu_faction_rep.good || 0) + 5;
    
    await Write_player(player_qq, player);
    lines.push(``, `古仙引路者感受到你的善念，善良阵营好感 +5`);
  }

  if (npc.id === 'ancient_emperor_shadow' && factionRep >= 50) {
    const daoyunGain = Math.floor(Math.random() * 100) + 50;
    player.xiangu_gains = player.xiangu_gains || {};
    player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + daoyunGain;
    
    await Write_player(player_qq, player);
    lines.push(``, `古帝虚影赐下帝念，道韵领悟 +${daoyunGain}！`);
  }

  return e.reply(lines.join('\n'));
}

// 向NPC购买物品
async function XianguNPCBuyFn(e, player, player_qq) {
  const location = player.xiangu_location || '边缘区域';
  const infamy = player.xiangu_infamy || 0;
  const npcs = getNPCsForPlayer(location, infamy).filter(n => n.trade);

  if (npcs.length === 0) {
    return e.reply(`【NPC购买·无商人】当前${location}没有可交易的NPC，前往中层或深层区域寻找商人`);
  }

  const itemName = e.msg.replace('#向NPC购买', '').trim();
  if (!itemName) {
    // 显示所有商品
    let lines = [`【NPC商店】`, ``];
    npcs.forEach(npc => {
      lines.push(`◇ ${npc.name}`);
      npc.trade.items.forEach(item => {
        lines.push(`  · ${item.name} — ${item.price}${item.currency}`);
      });
    });
    lines.push(``, `提示：#向NPC购买 [物品名] 进行购买`);
    return e.reply(lines.join('\n'));
  }

  // 查找商品
  let foundNpc = null, foundItem = null;
  for (const npc of npcs) {
    const item = npc.trade.items.find(i => i.name === itemName);
    if (item) { foundNpc = npc; foundItem = item; break; }
  }

  if (!foundItem) {
    return e.reply(`未找到物品"${itemName}"，使用 #向NPC购买 查看商品列表`);
  }

  // 凶名影响价格
  const infamyPriceMult = infamy >= 200 ? 2.0 : infamy >= 100 ? 1.5 : infamy >= 50 ? 1.2 : 1.0;
  const finalPrice = Math.floor(foundItem.price * infamyPriceMult);

  // 检查货币
  if (foundItem.currency === '灵石') {
    const playerLingshi = player.灵石 || 0;
    if (playerLingshi < finalPrice) {
      return e.reply([
        `【购买失败】灵石不足`,
        `需要：${finalPrice.toLocaleString()}灵石`,
        `拥有：${playerLingshi.toLocaleString()}灵石`,
        ...(infamyPriceMult > 1 ? [`凶名溢价：×${infamyPriceMult}（凶名${infamy}）`] : [])
      ].join('\n'));
    }

    
    await Add_灵石(player_qq, -finalPrice);
    await Add_najie_thing(player_qq, itemName, '道具', 1);

    return e.reply([
      `【购买成功】`,
      ``,
      `从${foundNpc.name}处购得：${itemName}`,
      `花费：${finalPrice.toLocaleString()}灵石`,
      ...(infamyPriceMult > 1 ? [`※ 凶名溢价 ×${infamyPriceMult} 已生效`] : [])
    ].join('\n'));
  }

  return e.reply(`该商品的货币类型暂不支持自动结算，请联系管理员`);
}

// 攻击NPC
async function XianguNPCAttackFn(e, player, player_qq) {
  const location = player.xiangu_location || '边缘区域';
  const infamy = player.xiangu_infamy || 0;
  const allNpcs = getNPCsForPlayer(location, infamy);

  if (allNpcs.length === 0) {
    return e.reply(`此处没有可攻击的NPC`);
  }

  // 优先选择原著/随机NPC（排除基础善意NPC）
  const combatReady = allNpcs.filter(n => n.isCanon || n.personality || n.faction === 'evil');
  const npc = (combatReady.length > 0)
    ? combatReady[Math.floor(Math.random() * combatReady.length)]
    : allNpcs[Math.floor(Math.random() * allNpcs.length)];

  // 攻击善良NPC — 警告不进入战斗
  if (npc.faction === 'good' && !npc.isCanon && !npc.personality) {
    player.xiangu_faction_rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
    player.xiangu_faction_rep.good = (player.xiangu_faction_rep.good || 0) - 30;
    player.xiangu_infamy = (player.xiangu_infamy || 0) + 15;
    await Write_player(player_qq, player);
    return e.reply([
      `【攻击NPC·道德警告】`,
      ``, `${player.名号}挥拳袭向${npc.name}，`, `对方虚影闪动，从容避开，`, `但眼中流露出深深的失望...`,
      ``, `【后果】`, `凶名值 +15`, `善良阵营好感 -30`,
      ``, `"你在此间的所作所为，天地皆有记录..."`
    ].join('\n'));
  }

  // === 真实战斗 (zd_battle) ===
  const npcBattleData = createXianguNpcBattleData(npc);

  try {
    const battleSides = buildXianguBattleSides(player, npcBattleData, { attackerId: player_qq });
    const battleResult = await zd_battle(battleSides.A, battleSides.B, { battleType: 'xiangu_npc' });
    const playerWon = resolveXianguLeaderWinner(battleResult) === 'A' ||
      (!battleResult?.winner && battleResult?.[0]?.result === 'win');

    if (playerWon) {
      // === 玩家胜利 ===
      player.xiangu_infamy = (player.xiangu_infamy || 0) + (npc.faction === 'evil' ? 2 : 5);
      player.xiangu_faction_rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
      if (npc.faction === 'evil') {
        player.xiangu_faction_rep.good = (player.xiangu_faction_rep.good || 0) + 10;
      }

      // 击杀掉落
      const lootMsg = await processNPCKillLoot(player, player_qq, npc, location);

      // 记录弥留之际状态（5分钟窗口可搜魂）
      player.xiangu_soulsearch_target = {
        name: npc.name || npc.名号,
        学习的功法: [...(npc.学习的功法 || [])],
        isCanon: npc.isCanon || false,
        expiresAt: Date.now() + 300000
      };

      // NPC死亡标记
      if (npc.isCanon) {
        npc.isAlive = false;
        npc.respawnTime = Date.now() + 7200000; // 2小时后重生
      }

      await Write_player(player_qq, player);

      const resultLines = [
        `【击杀NPC·${npc.name || npc.名号}】`,
        ``,
        `${player.名号}大展神威，将${npc.name || npc.名号}击败！`,
        ...battleSides.messages,
        `对方倒地不起，气息微弱...`,
        ``,
        ...lootMsg,
        ``,
        `【弥留之际】对方尚有残魂未散，`,
        `使用 #搜魂NPC 可强行掠夺其功法记忆！`,
        `时效：5分钟`,
        ``,
        `凶名值 +${npc.faction === 'evil' ? 2 : 5}`
      ];
      return e.reply(resultLines.join('\n'));

    } else {
      // === 玩家战败 ===
      const hpLoss = Math.floor((player.当前血量 || 10000) * 0.25);
      player.当前血量 = Math.max(1, (player.当前血量 || 10000) - hpLoss);
      player.xiangu_infamy = (player.xiangu_infamy || 0) - Math.max(0, (player.xiangu_infamy || 0) - 5);

      // NPC可能掠夺玩家
      if (Math.random() < 0.3) {
        if (!player.xiangu_npc_relations) player.xiangu_npc_relations = {};
        const npcId = npc.id || npc.name;
        player.xiangu_npc_relations[npcId] = (player.xiangu_npc_relations[npcId] || 0) - 10;
      }

      await Write_player(player_qq, player);

      return e.reply([
        `【攻击NPC·战败】`,
        ``,
        `${player.名号}主动挑衅${npc.name || npc.名号}，`,
        ...battleSides.messages,
        `却低估了对方的实力，被反手重创！`,
        ``,
        `【损失】`,
        `当前血量 -${hpLoss.toLocaleString()}`,
        `凶名值减少`,
        ``,
        `"不自量力..." — ${npc.name || npc.名号}冷冷道。`
      ].join('\n'));
    }
  } catch (err) {
    console.error('NPC战斗异常:', err);
    return e.reply(`战斗系统异常：${err.message}`);
  }
}

// ==== NPC击杀掉落处理 ====
async function processNPCKillLoot(player, player_qq, npc, location) {
  const lines = [`【战利品搜刮】`];
  let totalLingshi = 0;

  // 纳戒搜刮
  if (npc.inventory && npc.inventory.length > 0) {
    lines.push(`从${npc.name || npc.名号}的纳戒中搜出：`);
    for (const item of npc.inventory) {
      if (item.灵石) {
        totalLingshi += item.灵石;
      } else {
        const itemName = item.name || item.名称 || String(item);
        const quantity = Number(item.数量) || 1;
        await addXianguSpoil(player_qq, itemName, quantity, item.desc);
        lines.push(`  · ${itemName}${quantity > 1 ? ' ×' + quantity : ''}`);
      }
    }
    npc.inventory = [];
  }

  // 掉落表处理（原著NPC特殊掉落）
  if (npc.dropTable && npc.dropTable.length > 0) {
    lines.push(npc.isCanon ? `【原著天骄·特殊掉落】` : `【随机掉落】`);
    for (const drop of npc.dropTable) {
      if (Math.random() < drop.chance) {
        await addXianguSpoil(player_qq, drop.item, 1, drop.desc);
        lines.push(`  ✅ ${drop.item} — ${drop.desc}`);
      }
    }
  }

  // 功法掉落：从NPC学习的功法中随机选取1-2门
  if (npc.学习的功法 && npc.学习的功法.length > 0) {
    const playerGongfa = player.学习的功法 || [];
    const newGongfa = npc.学习的功法.filter(g => !playerGongfa.includes(g));
    if (newGongfa.length > 0) {
      const count = Math.min(2, newGongfa.length);
      const dropped = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * newGongfa.length);
        dropped.push(newGongfa.splice(idx, 1)[0]);
      }
      player.学习的功法 = [...playerGongfa, ...dropped];
      lines.push(``, `【功法领悟】从战斗中领悟：`);
      dropped.forEach(g => lines.push(`  📖 ${g}`));
    }
  }

  // 灵石奖励
  const realmBonus = { '核心区域': 5, '深层区域': 3, '中层区域': 2, '边缘区域': 1 };
  totalLingshi += Math.floor((getNPCScaledStats(npc, 0.5).当前血量) * 0.001 * (realmBonus[location] || 1));
  if (totalLingshi > 0) {
    const reward = await grantXianguGrowthRewards(player, player_qq, { lingshi: totalLingshi });
    lines.push(``, `💰 灵石 +${reward.lingshi.toLocaleString()}`);
  }

  return lines;
}

// ==== NPC搜魂（弥留之际） ====
async function XianguSoulSearchNPCFn(e, player, player_qq) {
  const target = player.xiangu_soulsearch_target;
  if (!target) {
    return e.reply(`【搜魂NPC·无目标】当前没有可搜魂的目标。先击败一位NPC再试。`);
  }
  if (Date.now() > target.expiresAt) {
    player.xiangu_soulsearch_target = null;
    await Write_player(player_qq, player);
    return e.reply(`【搜魂NPC·残魂消散】弥留之际已过，对方的残魂已彻底消散于天地间...`);
  }
  if (!target.学习的功法 || target.学习的功法.length === 0) {
    player.xiangu_soulsearch_target = null;
    await Write_player(player_qq, player);
    return e.reply(`【搜魂NPC·神魂空洞】${target.name}的神魂空洞如枯井，搜魂一无所获！`);
  }

  // 搜魂成功率（基础75%，天骄更低因为功法更强）
  const baseRate = target.isCanon ? 0.6 : 0.75;
  const success = Math.random() < baseRate;

  if (!success) {
    // 业力反噬
    player.业力值 = (player.业力值 || 0) + 30;
    player.xiangu_soulsearch_target = null;
    await Write_player(player_qq, player);
    return e.reply([
      `【搜魂失败·业力反噬】`,
      ``,
      `${player.名号}施展搜魂大法，欲掠夺${target.name}残魂中的功法记忆...`,
      `然而，${target.isCanon ? '天骄残魂竟有天道禁制守护' : '对方残魂突然崩散'}！`,
      `搜魂之术被强行弹开！`,
      ``,
      `💀 业力反噬：业力值+30`,
      ``,
      `残魂消散，再无搜魂之机...`
    ].join('\n'));
  }

  // 搜魂成功
  const playerGongfa = player.学习的功法 || [];
  const newGongfa = target.学习的功法.filter(g => !playerGongfa.includes(g));
  const count = Math.min(2, newGongfa.length);
  const learned = [];

  for (let i = 0; i < count; i++) {
    if (Math.random() < 0.8) { // 80%单个功法领悟成功率
      const idx = Math.floor(Math.random() * newGongfa.length);
      const g = newGongfa.splice(idx, 1)[0];
      learned.push(g);
      if (!player.学习的功法) player.学习的功法 = [];
      player.学习的功法.push(g);
    }
  }

  player.业力值 = (player.业力值 || 0) + 20;
  player.xiangu_soulsearch_target = null;
  await Write_player(player_qq, player);

  const lines = [
    `【搜魂成功·记忆掠夺】`,
    ``,
    `${player.名号}眸光一冷，神识如刀！`,
    `"搜魂——！！"`,
    ``,
    `阴风呼啸，虚空震荡！`,
    `${target.isCanon ? '天骄' : ''}${target.name}的残魂被强行撕裂！`,
    `在其破碎的记忆长河中，功法烙印如星辰般浮现...`,
    ``
  ];

  if (learned.length > 0) {
    lines.push(`✅ 成功掠夺 ${learned.length} 门功法：`);
    learned.forEach(g => lines.push(`  📖 ${g}`));
  } else {
    lines.push(`❌ 对方功法过于深奥，无法参悟...`);
  }

  lines.push(``, `💀 业力缠身：业力值+20`, ``, `「搜魂之术，虽能速成，却有伤天和」`);
  return e.reply(lines.join('\n'));
}

// ==== NPC行为系统（定时触发，在探索/移动时调用） ====
function processNPCBehavior(player, location) {
  // 每隔15分钟处理一次NPC行为
  const now = Date.now();
  if (player.xiangu_last_npc_tick && now - player.xiangu_last_npc_tick < 900000) return;
  player.xiangu_last_npc_tick = now;

  const allNpcs = getNPCsForPlayer(location, player.xiangu_infamy || 0);
  const activeNpcs = allNpcs.filter(n => n.isAlive !== false);

  const events = [];

  for (const npc of activeNpcs) {
    if (!npc.isCanon && !npc.personality) continue; // 跳过基础静态NPC

    const behaviorRoll = Math.random();

    // NPC搜刮宝物（50%概率，非hostile不会抢夺）
    if (behaviorRoll < 0.5 && npc.personality !== 'hostile') {
      const treasures = ['灵石', '普通道种碎片', '仙古矿材', '古兽残骨', '秘境灵药', '远古符纸'];
      const found = treasures[Math.floor(Math.random() * treasures.length)];
      if (!npc.inventory) npc.inventory = [];
      npc.inventory.push({ name: found, 灵石: found === '灵石' ? Math.floor(Math.random() * 5000) + 1000 : 0 });
      events.push(`${npc.name || npc.名号}在${location}发现了一些${found}`);
    }

    // 敌对NPC搜刮可能引发区域危险提示
    if (behaviorRoll < 0.3 && npc.personality === 'hostile') {
      events.push(`⚠ ${npc.name || npc.名号}在附近游荡，似在寻找猎物...`);
    }
  }

  return events;
}

// ==== NPC结交/欺诈事件（探索中触发） ====
async function triggerNPCEncounter(e, player, player_qq, location) {
  const allNpcs = getNPCsForPlayer(location, player.xiangu_infamy || 0);
  const activeNpcs = allNpcs.filter(n =>
    (n.isCanon || n.personality) && n.isAlive !== false
  );
  if (activeNpcs.length === 0) return null;

  const npc = activeNpcs[Math.floor(Math.random() * activeNpcs.length)];
  const npcId = npc.id || npc.name;
  const relations = player.xiangu_npc_relations || {};
  const relationVal = relations[npcId] || 0;

  const roll = Math.random();

  // 好感<0且30%概率：NPC欺诈
  if (relationVal < 0 && roll < 0.3 && npc.personality !== 'friendly') {
    relations[npcId] = relationVal - 10;
    player.xiangu_npc_relations = relations;
    await Write_player(player_qq, player);

    const trapLocations = ['深层区域', '核心区域'];
    const trapLocation = trapLocations[Math.floor(Math.random() * trapLocations.length)];
    return e.reply([
      `【NPC结交·虚假机缘！】`,
      ``,
      `${npc.name || npc.名号}（${npc.title || ''}）靠近你，低声道：`,
      ``,
      `"道友，我近日在${trapLocation}发现一处古帝洞府，`,
      `其中宝物无数，但我一人难以深入..."`,
      ``,
      `对方眼中闪过一丝不易察觉的阴鸷。`,
      ``,
      `⚠ 此乃陷阱！若前往${trapLocation}，可能遭遇伏击！`,
      `好感度 -10（当前：${relationVal - 10}）`,
      ``,
      `提示：好感度<0的NPC有30%概率欺诈`
    ].join('\n'));
  }

  // 真心结交（40%概率，好感>=0时）
  if (relationVal >= 0 && roll < 0.4) {
    const actionRoll = Math.random();

    if (actionRoll < 0.5 && npc.personality !== 'hostile') {
      // NPC提供真实线索
      const hints = {
        '边缘区域': '边缘区域的古树根基藏着稀世矿材',
        '中层区域': '中层区域的古老祭坛有道的共鸣',
        '深层区域': '深层区域的裂谷深处有一枚传说道种',
        '核心区域': '核心区域的帝冢最近有不寻常的波动'
      };
      const hint = hints[location] || '此地的灵气波动异常，定有机缘';
      relations[npcId] = (relations[npcId] || 0) + 15;
      player.xiangu_npc_relations = relations;
      await Write_player(player_qq, player);

      return e.reply([
        `【NPC结交·真诚指引】`,
        ``,
        `${npc.name || npc.名号}（${npc.title || ''}）环顾四周后，`,
        `对你轻声道：`,
        ``,
        `"${npc.isCanon ? '以我的身份，不屑于欺骗你' : ''}`,
        `${hint}。"`,
        ``,
        `好感度 +15（当前：${relations[npcId]}）`,
        `对方眼中坦荡，此言似乎不虚。`,
        ``,
        `提示：真心结交的NPC线索真实有效，赶紧去探索！`
      ].join('\n'));
    } else if (actionRoll < 0.8) {
      // NPC请求交易
      if (!npc.trade) {
        relations[npcId] = (relations[npcId] || 0) + 10;
        player.xiangu_npc_relations = relations;
        await Write_player(player_qq, player);
        return e.reply([
          `【NPC结交·友好交谈】`,
          ``,
          `你与${npc.name || npc.名号}相谈甚欢，`,
          `对方分享了一些秘境见闻。`,
          ``,
          `好感度 +10（当前：${relations[npcId]}）`
        ].join('\n'));
      }
    }
  }

  return null;
}

// ==== 查看NPC好感度 ====
async function XianguNPCRelationFn(e, player) {
  const relations = player.xiangu_npc_relations || {};
  const infamy = player.xiangu_infamy || 0;

  // 收集所有原著NPC
  const allCanon = [];
  for (const region of Object.keys(XIANGU_CANON_NPCS)) {
    for (const npc of XIANGU_CANON_NPCS[region]) {
      allCanon.push({ name: npc.name, title: npc.title, region, relation: relations[npc.id] || 0 });
    }
  }

  const getRelDesc = (val) => {
    if (val >= 200) return '生死之交';
    if (val >= 100) return '莫逆之交';
    if (val >= 50)  return '友善';
    if (val >= 20)  return '好感的';
    if (val >= 0)   return '陌生';
    if (val >= -30) return '警惕';
    if (val >= -80) return '敌视';
    return '仇恨';
  };

  const lines = [
    `【NPC好感度·仙古秘境】`,
    ``,
    `修士：${player.名号}`,
    `凶名：${infamy}`,
    ``,
    `━━━━ 原著天骄关系 ━━━━`,
    ``
  ];

  if (allCanon.length === 0) {
    lines.push(`暂未与任何原著天骄建立关系`);
  } else {
    allCanon.sort((a, b) => b.relation - a.relation);
    for (const npc of allCanon) {
      const icon = npc.relation >= 100 ? '💚' : npc.relation >= 50 ? '💛' : npc.relation < -30 ? '🔴' : '⚪';
      lines.push(`${icon} ${npc.name}（${npc.title || ''}）— ${getRelDesc(npc.relation)}（${npc.relation >= 0 ? '+' : ''}${npc.relation}）`);
      lines.push(`  区域：${npc.region}`);
    }
  }

  lines.push(``, `━━━━ 组队状态 ━━━━`);
  if (player.xiangu_teammate) {
    lines.push(`当前组队：${player.xiangu_teammate_name || player.xiangu_teammate}`);
    lines.push(`使用 #解除组队 可以解散队伍`);
  } else {
    lines.push(`当前无组队NPC`);
    lines.push(`好感≥50的NPC可尝试 #NPC组队`);
  }

  return e.reply(lines.join('\n'));
}

// ==== NPC组队 ====
async function XianguNPCTeamFn(e, player, player_qq) {
  const location = player.xiangu_location || '边缘区域';
  const allNpcs = getNPCsForPlayer(location, player.xiangu_infamy || 0);
  const canTeam = allNpcs.filter(n =>
    (n.isCanon || n.personality) && n.isAlive !== false && n.faction !== 'evil'
  );

  if (canTeam.length === 0) {
    return e.reply(`【组队·无合适NPC】此处没有可以组队的NPC。`);
  }

  // 已有组队
  if (player.xiangu_teammate) {
    return e.reply([
      `【组队·已有队伍】`,
      `当前正与 ${player.xiangu_teammate_name || player.xiangu_teammate} 组队中。`,
      `使用 #解除组队 后再邀请新的NPC。`
    ].join('\n'));
  }

  // 组队冷却
  const now = Date.now();
  if (player.xiangu_last_team_time && now - player.xiangu_last_team_time < 1800000) {
    const remaining = Math.ceil((1800000 - (now - player.xiangu_last_team_time)) / 60000);
    return e.reply(`【组队·冷却中】刚组建过队伍，需等待 ${remaining} 分钟。`);
  }

  const npc = canTeam[Math.floor(Math.random() * canTeam.length)];
  const npcId = npc.id || npc.name;
  const relations = player.xiangu_npc_relations || {};
  const rel = relations[npcId] || 0;

  // 好感检查
  if (rel < 50 && npc.personality !== 'friendly') {
    return e.reply([
      `【组队·好感不足】`,
      ``,
      `${npc.name || npc.名号}（${npc.title || ''}）：`,
      `"你我不过萍水相逢，凭什么要我以身犯险与你组队？"`,
      ``,
      `需要好感≥50才能组队。`,
      `当前好感：${rel}`,
      ``,
      `多与该NPC交谈可提升好感。`
    ].join('\n'));
  }

  // 组队成功
  player.xiangu_teammate = npcId;
  player.xiangu_teammate_name = npc.name || npc.名号;
  player.xiangu_teammate_data = { // 存NPC战斗数据供后续使用
    名号: npc.name || npc.名号,
    ...getNPCScaledStats(npc, 0.5),
    血量上限: npc.血量上限 || 500000,
    速度: npc.速度 || 1000,
    暴击率: npc.暴击率 || 0.2,
    暴击伤害: npc.暴击伤害 || 2.0,
    学习的功法: [...(npc.学习的功法 || [])],
    xiangulevel_id: 5,
    mijinglevel_id: 0,
    灵根: { name: '无', type: '无', 法球倍率: 1 }
  };
  player.xiangu_last_team_time = now;
  relations[npcId] = rel + 20;
  player.xiangu_npc_relations = relations;

  // 欺诈性NPC可能在战斗中背叛
  if (npc.personality === 'scheming' && rel < 100) {
    player.xiangu_teammate_betray_chance = 0.3;
  } else {
    player.xiangu_teammate_betray_chance = 0;
  }

  await Write_player(player_qq, player);

  return e.reply([
    `【NPC组队·结成同伴】`,
    ``,
    `${npc.name || npc.名号}（${npc.title || ''}）微微点头：`,
    ``,
    `"${npc.isCanon ? (rel >= 100 ? '你是我认可的战友。' : '也好，你我同行，相互照应。') : '既是有缘，并肩同行又何妨？'}"`,
    ``,
    `✅ 组队成功！`,
    `当前同伴：${npc.name || npc.名号}`,
    `好感度 +20（当前：${rel + 20}）`,
    ``,
    `【组队效果】`,
    `· 下次战斗中，NPC将作为友方助战`,
    `· 使用 #解除组队 解散队伍`,
    npc.personality === 'scheming' ? `⚠ ${npc.name || npc.名号}心思深沉，战斗中可能背叛！` : ``
  ].join('\n'));
}

// ==== 解除组队 ====
async function XianguNPCTeamLeaveFn(e, player, player_qq) {
  if (!player.xiangu_teammate) {
    return e.reply(`【解除组队·无队伍】你当前没有组队。`);
  }

  const oldName = player.xiangu_teammate_name || player.xiangu_teammate;
  player.xiangu_teammate = null;
  player.xiangu_teammate_name = null;
  player.xiangu_teammate_data = null;
  player.xiangu_teammate_betray_chance = 0;

  await Write_player(player_qq, player);

  return e.reply([
    `【解除组队】`,
    ``,
    `你与 ${oldName} 告别，各自踏上各自的仙途。`,
    ``,
    `"珍重，有缘再会。"`
  ].join('\n'));
}

// 查看阵营关系
async function XianguFactionFn(e, player) {
  const rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
  const infamy = player.xiangu_infamy || 0;

  const getLevel = (val) => {
    if (val >= 500) return '崇拜';
    if (val >= 200) return '信任';
    if (val >= 100) return '友善';
    if (val >= 50)  return '熟识';
    if (val >= 0)   return '陌生';
    if (val >= -50) return '警惕';
    if (val >= -150)return '敌视';
    return '仇恨';
  };

  const goodRep   = rep.good   || 0;
  const neutralRep= rep.neutral|| 0;
  const evilRep   = rep.evil   || 0;

  return e.reply([
    `【仙古秘境·阵营关系】`,
    ``,
    `修士：${player.名号}`,
    `当前凶名：${infamy}`,
    ``,
    `━━━━ 阵营好感度 ━━━━`,
    ``,
    `✦ 善良阵营 — ${getLevel(goodRep)}（${goodRep >= 0 ? '+' : ''}${goodRep}）`,
    `  包括：古仙引路者、古老传承者、古帝虚影`,
    `  当前效果：${goodRep >= 200 ? 'NPC可传授秘法、赐予帝念' : goodRep >= 100 ? 'NPC交易优惠10%' : goodRep >= 50 ? 'NPC态度友善' : goodRep < 0 ? 'NPC拒绝交易' : 'NPC正常交互'}`,
    ``,
    `◆ 中立阵营 — ${getLevel(neutralRep)}（${neutralRep >= 0 ? '+' : ''}${neutralRep}）`,
    `  包括：流浪修士、道种贩者、仙古兽灵`,
    `  当前效果：${neutralRep >= 100 ? 'NPC可提供特殊情报' : neutralRep < -50 ? 'NPC拒绝交易' : '正常交互'}`,
    ``,
    `▼ 邪恶阵营 — ${getLevel(evilRep)}（${evilRep >= 0 ? '+' : ''}${evilRep}）`,
    `  包括：堕道修士`,
    `  当前效果：${evilRep >= 200 ? '邪恶NPC交易优惠30%、可接取黑市任务' : evilRep >= 100 ? '邪恶NPC不主动攻击' : evilRep >= 0 ? '邪恶NPC保持警惕' : '邪恶NPC视你为猎物'}`,
    ``,
    `━━━━ 提升方式 ━━━━`,
    `· 与该阵营NPC交谈（+5/次，每日上限）`,
    `· 帮助该阵营完成任务（+20~100）`,
    `· 降魔（击败邪恶NPC）→ 善良+10`,
    `· 向善良NPC献祭道种 → 善良+50`
  ].join('\n'));
}

// 献祭道种（提升善良阵营关系）
async function XianguOfferSeedFn(e, player, player_qq) {
  const location = player.xiangu_location || '边缘区域';
  const seedName = e.msg.replace('#献祭道种', '').trim();

  const seeds = player.xiangu_seeds || [];
  if (seeds.length === 0) {
    return e.reply(`【献祭道种·无道种】你目前没有可献祭的道种，先去探索获取道种`);
  }

  let targetSeed = null;
  let targetIndex = -1;

  if (seedName) {
    targetIndex = seeds.findIndex(s => s.名称 === seedName || s.名称.includes(seedName));
  } else {
    // 默认献祭第一个普通品质道种
    targetIndex = seeds.findIndex(s => s.品质 === '普通');
    if (targetIndex === -1) targetIndex = 0;
  }

  if (targetIndex === -1) {
    return e.reply(`未找到名为"${seedName}"的道种，使用 #查看道种 查看列表`);
  }

  targetSeed = seeds[targetIndex];

  // 品质越高，奖励越多
  const rewards = {
    '普通': { rep: 15, daoyun: 10, lingshi: 5000 },
    '稀有': { rep: 35, daoyun: 25, lingshi: 15000 },
    '传说': { rep: 80, daoyun: 60, lingshi: 50000 },
    '神话': { rep: 200, daoyun: 150, lingshi: 200000 }
  };
  const reward = rewards[targetSeed.品质] || rewards['普通'];

  // 移除道种
  player.xiangu_seeds.splice(targetIndex, 1);
  player.xiangu_faction_rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
  player.xiangu_faction_rep.good = (player.xiangu_faction_rep.good || 0) + reward.rep;

  // 神火已燃的玩家回收道种获得额外道韵
  if (player.xiangu_shenhuo?.已点燃) {
    reward.daoyun = Math.floor(reward.daoyun * 2);
    player.xiangu_gains = player.xiangu_gains || {};
    player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + reward.daoyun;
  }
  
  const grantedReward = await grantXianguGrowthRewards(player, player_qq, { lingshi: reward.lingshi });
  await Write_player(player_qq, player);

  return e.reply([
    `【献祭道种】`,
    ``,
    `${player.名号}将 ${targetSeed.名称} [${targetSeed.品质}] 献祭于仙古秘境...`,
    `道种化作金光，融入这片古老土地！`,
    ``,
    `【收益】`,
    `阵营声望 +${reward.rep}`,
    `道韵 +${reward.daoyun}`,
    `灵石 +${grantedReward.lingshi.toLocaleString()}`,
    player.xiangu_shenhuo?.已点燃 ? `（神火已燃，道韵双倍回收！）` : '',
    ``,
    `当前善良声望：${player.xiangu_faction_rep.good}`
  ].join('\n'));
}

// ==============================
//  5.1 动态事件系统（自动触发）
// ==============================

let eventTimer = null;

/** 启动事件自动触发定时器 */
function startEventTimer() {
  if (eventTimer) return;
  eventTimer = setInterval(autoTriggerEvents, 30000);
  console.log('[仙古秘境] 事件定时器已启动（30秒轮询）');
}

/** 主循环：检查事件结算 + 随机触发新事件 */
async function autoTriggerEvents() {
  try {
    const now = Date.now();
    if (XIANGU_EVENTS.activeEvent && XIANGU_EVENTS.activeEvent.endTime <= now) {
      await settleCurrentEvent();
    }
    if (XIANGU_EVENTS.activeEvent && XIANGU_EVENTS.activeEvent.endTime > now) return;

    const available = Object.entries(EVENT_TYPES)
      .filter(([key, def]) => {
        if (key === 'arena') return false;
        const lastTime = XIANGU_EVENTS.lastEventTime[key] || 0;
        return now - lastTime >= def.cooldown;
      })
      .map(([key, def]) => ({ key, ...def }));

    if (available.length === 0) return;
    if (Math.random() > 0.15) return;

    const event = available[Math.floor(Math.random() * available.length)];
    await triggerEvent(event.key, event);
  } catch (err) {
    console.error('[仙古秘境] 事件自动触发异常:', err);
  }
}

/** 触发指定事件 */
async function triggerEvent(eventKey, eventDef) {
  const now = Date.now();
  const duration = eventDef.duration || 600000;

  XIANGU_EVENTS.activeEvent = {
    type: eventKey, startTime: now, endTime: now + duration,
    desc: eventDef.desc, location: eventDef.location || null,
    participants: [], effects: {}
  };
  XIANGU_EVENTS.lastEventTime[eventKey] = now;
  XIANGU_EVENTS.eventHistory.push({ name: eventDef.name, time: now, type: eventKey });
  if (XIANGU_EVENTS.eventHistory.length > 10) XIANGU_EVENTS.eventHistory.shift();

  applyEventEffect(eventKey, XIANGU_EVENTS.activeEvent);

  const locationHint = eventDef.location ? `\n📍 事件区域：${eventDef.location}` : '';
  const tips = {
    shixiong_awakening: '\n⚠ 击败十凶遗种可获得 5倍道韵 + 稀世道种！',
    dark_cell_riot: '\n⚠ 探索效率 -30%，但所有奖励 ×2！',
    ancient_treasure: '\n💎 仅限核心区域！先到先得！'
  };

  await broadcastToXianguPlayers([
    `🔥【${eventDef.name}】`, ``,
    eventDef.desc, locationHint, ``,
    `⏱ 持续：${Math.floor(duration / 60000)}分钟`,
    tips[eventKey] || '', ``,
    `使用 #秘境事件 查看详情`
  ].join('\n'));
}

/** 应用事件效果 */
function applyEventEffect(eventKey, eventData) {
  switch (eventKey) {
    case 'shixiong_awakening': {
      const mult = EVENT_TYPES[eventKey].bossMultiplier || 5;
      eventData.effects.boss = {
        name: '十凶遗种·混沌残魂',
        攻击: 1500000 * mult, 防御: 1000000 * mult,
        当前血量: 12000000 * mult, 血量上限: 12000000 * mult,
        速度: 1800, 暴击率: 0.45, 暴击伤害: 3.5, rewardMult: mult
      };
      break;
    }
    case 'dark_cell_riot':
      eventData.effects.debuff = { exploreEfficiency: -0.3, rewardMultiplier: 2.0 };
      break;
    case 'ancient_treasure':
      eventData.effects.buff = { treasureChance: 2.0 };
      break;
  }
}

/** 结算当前活跃事件 */
async function settleCurrentEvent() {
  const event = XIANGU_EVENTS.activeEvent;
  if (!event) return;
  if (event.type === 'arena') {
    await checkArenaSettlement();
    return;
  }
  const evDef = EVENT_TYPES[event.type];
  const settleMessages = {
    shixiong_awakening: `【${evDef.name}·结束】\n十凶遗种的气息逐渐消退，沉入秘境深处...`,
    dark_cell_riot: `【${evDef.name}·平息】\n黑暗牢笼的震动停止了，秘境中的灵气逐渐恢复正常。`,
    ancient_treasure: `【${evDef.name}·消失】\n古纪造化重新隐入虚空，等待下一次觉醒...`
  };
  XIANGU_EVENTS.activeEvent = null;
  await broadcastToXianguPlayers(settleMessages[event.type] || `【事件结束】${evDef.name}已经结束。`);
}

/** 擂台结算 */
async function checkArenaSettlement() {
  const ev = XIANGU_EVENTS.activeEvent;
  if (!ev || ev.type !== 'arena') return;

  const participants = XIANGU_EVENTS.arenaParticipants || [];
  const arenaDef = EVENT_TYPES.arena;

  if (participants.length === 0) {
    await broadcastToXianguPlayers(`【仙古擂台·无人问津】\n擂台缓缓坠入虚空，无一人参与。`);
    XIANGU_EVENTS.activeEvent = null;
    XIANGU_EVENTS.arenaParticipants = [];
    return;
  }

  if (participants.length < arenaDef.minPlayers) {
    await broadcastToXianguPlayers([
      `【仙古擂台·未能成局】`,
      `仅有${participants.length}名修士应战，未达到${arenaDef.minPlayers}人的开擂条件。`,
      `本届擂台不发放排名奖励。`,
    ].join('\n'));
    XIANGU_EVENTS.activeEvent = null;
    XIANGU_EVENTS.arenaParticipants = [];
    return;
  }

  participants.sort((a, b) => b.wins - a.wins);
  const rewardPlan = buildXianguArenaRewardPlan(participants, arenaDef.rewards);
  const top3 = rewardPlan.slice(0, 3);
  const lines = [`🏆【仙古擂台·结算】`, ``, `擂台缓缓沉入大地，金光冲天而起！`, ``];

  for (let i = 0; i < top3.length; i++) {
    const p = top3[i];
    const rewardDaoyun = p.daoyun;
    const desc = i === 0 ? arenaDef.rewards.winner.desc : arenaDef.rewards.top3.desc;
    let rewardGranted = false;
    try {
      rewardGranted = await updateXianguPlayerUnderLock(p.qq, async player => {
        player.xiangu_gains = player.xiangu_gains || {};
        player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + rewardDaoyun;
      });
    } catch (err) { console.error('擂台奖励发放失败:', err); }
    const place = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    lines.push(rewardGranted
      ? `${place} ${p.name} — ${p.wins}胜 — 道韵+${rewardDaoyun}（${desc}）`
      : `${place} ${p.name} — ${p.wins}胜 — 已离开秘境，未结算道韵`);
  }

  if (participants.length > 3) {
    let rewarded = 0;
    let departed = 0;
    for (const participant of rewardPlan.slice(3)) {
      try {
        const granted = await updateXianguPlayerUnderLock(participant.qq, async player => {
          player.xiangu_gains ||= {};
          player.xiangu_gains.daoyun = (Number(player.xiangu_gains.daoyun) || 0) + participant.daoyun;
        });
        if (granted) rewarded++;
        else departed++;
      } catch (error) {
        departed++;
        console.error('擂台参与奖励发放失败:', error);
      }
    }
    if (rewarded > 0) lines.push(``, `其他参赛者（${rewarded}人）各获得道韵+${arenaDef.rewards.runner.daoyun}`);
    if (departed > 0) lines.push(`已有${departed}名参赛者离开秘境，未结算参与奖励。`);
  }

  XIANGU_EVENTS.activeEvent = null;
  XIANGU_EVENTS.arenaParticipants = [];
  XIANGU_EVENTS.eventHistory.push({ name: '仙古擂台', time: Date.now(), type: 'arena' });
  await broadcastToXianguPlayers(lines.join('\n'));
}

/** 获取事件buff系数 */
function getEventExploreModifier() {
  const ev = XIANGU_EVENTS.activeEvent;
  if (!ev || ev.endTime <= Date.now()) return { efficiency: 1, rewardMult: 1, bonusMsg: '' };
  const effects = ev.effects || {};
  let efficiency = 1, rewardMult = 1, bonusMsg = '';
  if (effects.debuff) {
    efficiency += (effects.debuff.exploreEfficiency || 0);
    rewardMult = effects.debuff.rewardMultiplier || 1;
    bonusMsg = `\n🌑 黑暗牢笼异动中：效率 ${Math.round(efficiency * 100)}%，奖励 ×${rewardMult}`;
  }
  if (effects.buff) {
    efficiency = effects.buff.treasureChance || 1;
    bonusMsg = `\n💎 古纪造化出世：特殊发现概率 ×${efficiency}`;
  }
  if (effects.boss && ev.type === 'shixiong_awakening') {
    bonusMsg = `\n🔥 十凶遗种觉醒中：击败可得 ${effects.boss.rewardMult}倍道韵！`;
  }
  return { efficiency, rewardMult, bonusMsg };
}

// ==============================
//  5.3 阵营管理函数
// ==============================

/** 获取阵营声望等级名称 */
function getFactionRankName(faction, rep) {
  const ranks = XIANGU_FACTIONS[faction]?.ranks || [];
  for (const rank of ranks) { if (rep >= rank.min) return rank.name; }
  return ranks[ranks.length - 1]?.name || '未知';
}

/** 阵营任务详情 */
async function XianguFactionQuestFn(e, player, player_qq) {
  const rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
  const maxFaction = Object.entries(rep).sort((a, b) => b[1] - a[1])[0];
  const factionKey = maxFaction[0];
  const factionRep = maxFaction[1];
  const def = XIANGU_FACTIONS[factionKey];
  if (!def) return e.reply(`【阵营任务】阵营数据异常。`);

  const trackKey = `${player_qq}_${factionKey}`;
  const existing = FACTION_QUEST_TRACK[trackKey];

  if (existing && !existing.completed) {
    const pct = Math.round((existing.progress / existing.max) * 100);
    return e.reply([
      `【阵营任务·进行中】`, ``,
      `${def.icon} ${def.name}任务：${existing.questName}`,
      `${existing.questDesc}`, ``,
      `进度：${'█'.repeat(Math.floor(pct / 10))}${'░'.repeat(10 - Math.floor(pct / 10))} ${pct}%`,
      `(${existing.progress}/${existing.max})`, ``,
      `奖励：道韵+${existing.reward.daoyun} | 好感+${existing.reward.rep}`
    ].join('\n'));
  }

  const quests = def.questPool.filter(q => !q.requireRep || factionRep >= q.requireRep);
  if (quests.length === 0) return e.reply(`【阵营任务·无可接】当前无可接取的${def.name}任务。`);

  const quest = quests[Math.floor(Math.random() * quests.length)];
  FACTION_QUEST_TRACK[trackKey] = {
    faction: factionKey, questName: quest.name, questDesc: quest.desc,
    progress: 0, max: quest.count, completed: false,
    reward: quest.reward, startedAt: Date.now()
  };

  return e.reply([
    `【阵营任务·已接取】`, ``,
    `${def.icon} ${def.name}`,
    `${quest.icon || '📋'} ${quest.name}`,
    `${quest.desc}`, ``,
    `目标：${quest.count}次`,
    `奖励：道韵+${quest.reward.daoyun} | 好感+${quest.reward.rep}`
  ].join('\n'));
}

/** 阵营任务进度更新（供外部调用） */
async function updateFactionQuestProgress(player_qq, factionKey, actionType, count = 1) {
  const trackKey = `${player_qq}_${factionKey}`;
  const quest = FACTION_QUEST_TRACK[trackKey];
  if (!quest || quest.completed) return null;

  const questDef = XIANGU_FACTIONS[factionKey]?.questPool?.find(q => q.name === quest.questName);
  if (!questDef || questDef.target !== actionType) return null;

  quest.progress = Math.min(quest.max, quest.progress + count);
  if (quest.progress >= quest.max) {
    quest.completed = true;
    try {
      const player = await Read_player(player_qq);
      if (player) {
        player.xiangu_gains = player.xiangu_gains || {};
        player.xiangu_gains.daoyun = (player.xiangu_gains.daoyun || 0) + quest.reward.daoyun;
        player.xiangu_faction_rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
        player.xiangu_faction_rep[quest.faction] = (player.xiangu_faction_rep[quest.faction] || 0) + quest.reward.rep;
        await Write_player(player_qq, player);
        return [
          `✅【阵营任务·完成】`, ``,
          `${XIANGU_FACTIONS[quest.faction].icon} ${quest.questName} 已完成！`, ``,
          `道韵 +${quest.reward.daoyun}`,
          `${XIANGU_FACTIONS[quest.faction].name}好感 +${quest.reward.rep}`,
          ``, `使用 #阵营任务 接取新任务`
        ].join('\n');
      }
    } catch (err) { console.error('阵营任务结算失败:', err); }
  }
  return null;
}

/** 阵营商店 */
async function XianguFactionShopFn(e, player, player_qq) {
  const rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
  const lines = [`🏪【仙古秘境·阵营商店】`, ``];

  for (const [key, def] of Object.entries(XIANGU_FACTIONS)) {
    const val = rep[key] || 0;
    const rank = getFactionRankName(key, val);
    lines.push(`${def.icon} ${def.name} — ${rank}（${val >= 0 ? '+' : ''}${val}）`);

    let count = 0;
    for (const item of def.shop) {
      const locked = val < (item.requireRep || 0);
      const lockStr = locked ? '🔒' : '✅';
      const priceStr = locked ? `需声望${item.requireRep}` : `💰${item.price}灵石`;
      lines.push(`  ${lockStr} ${item.icon} ${item.name} — ${priceStr}`);
      lines.push(`     ${item.desc}`);
      count++;
    }
    if (count === 0) lines.push(`  无可用商品`);
    lines.push(``);
  }

  lines.push(`━━━━ 购买方式 ━━━━`);
  lines.push(`#阵营购买 善良/中立/邪恶 商品名`);
  return e.reply(lines.join('\n'));
}

/** 阵营排行 */
async function XianguFactionRankFn(e, player) {
  const now = Date.now();
  const rep = player.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };

  try {
    const playerDataDir = path.join(process.cwd(), 'data', 'xiuxian_player');
    if (!fs.existsSync(playerDataDir)) {
      return e.reply(`暂无阵营排行数据。`);
    }

    const files = fs.readdirSync(playerDataDir).filter(f => f.endsWith('.json'));
    const rankings = { good: [], neutral: [], evil: [] };

    for (const file of files) {
      try {
        const pdata = JSON.parse(fs.readFileSync(path.join(playerDataDir, file), 'utf8'));
        if (!pdata.in_xiangu) continue;
        const frep = pdata.xiangu_faction_rep || { good: 0, neutral: 0, evil: 0 };
        if (frep.good > 0) rankings.good.push({ name: pdata.名号 || '无名', rep: frep.good });
        if (frep.neutral > 0) rankings.neutral.push({ name: pdata.名号 || '无名', rep: frep.neutral });
        if (frep.evil > 0) rankings.evil.push({ name: pdata.名号 || '无名', rep: frep.evil });
      } catch (err) {}
    }

    for (const key of ['good', 'neutral', 'evil']) {
      rankings[key].sort((a, b) => b.rep - a.rep);
      rankings[key] = rankings[key].slice(0, 10);
    }

    factionRankCache = { ...rankings, updatedAt: now };

    const lines = [`🏆【仙古秘境·阵营声望排行】`, ``];
    for (const [key, def] of Object.entries(XIANGU_FACTIONS)) {
      lines.push(`${def.icon} ${def.name} TOP10`);
      const list = rankings[key] || [];
      if (list.length === 0) {
        lines.push(`  暂无上榜修士`);
      } else {
        for (let i = 0; i < list.length; i++) {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          lines.push(`  ${medal} ${list[i].name} — ${list[i].rep}声望`);
        }
      }
      lines.push(``);
    }

    lines.push(`━━━━ 我的声望 ━━━━`);
    lines.push(`✦ 善良：${rep.good || 0} | ◆ 中立：${rep.neutral || 0} | ▼ 邪恶：${rep.evil || 0}`);
    return e.reply(lines.join('\n'));
  } catch (err) {
    console.error('阵营排行计算失败:', err);
    return e.reply('阵营排行计算失败，请稍后重试');
  }
}

// ============================================================
// ====== 终极版：神识开图 + 碎片叠加 + 混沌迷雾 系统 ==========
// ============================================================

// ====== 秘境碎片类型库（12种碎片，完美世界原著设定） ======
const XIANGU_MAP_CONFIG = getXianguSecretConfig().地图配置 || {};
const REALM_FRAGMENTS = {
  edge_camp: {
    id: 'edge_camp', name: '接引营地', zone: '边缘区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'edge_camp'), risk: 0.1,
    desc: '仙古花蕾绽放入口，各族天骄汇集之处',
    features: ['交易NPC', '安全区', '法则石碑'],
    npcDensity: 0.3, treasureDensity: 0.1
  },
  spirit_lake: {
    id: 'spirit_lake', name: '灵湖', zone: '边缘区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'spirit_lake'), risk: 0.2,
    desc: '灵气浓郁成液，湖中可见灵鱼游弋',
    features: ['灵药', '治愈', '灵石矿脉'],
    npcDensity: 0.2, treasureDensity: 0.25
  },
  ancient_ruins: {
    id: 'ancient_ruins', name: '古战场遗迹', zone: '中层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'ancient_ruins'), risk: 0.4,
    desc: '仙古大战的残留，破碎的战兵遍地',
    features: ['道种', '残兵', '战魂'],
    npcDensity: 0.4, treasureDensity: 0.35
  },
  true_dragon_nest: {
    id: 'true_dragon_nest', name: '真龙巢穴', zone: '中层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'true_dragon_nest'), risk: 0.55,
    desc: '真龙曾伏之地，龙威未散',
    features: ['十凶宝术', '龙威压制', 'Boss区'],
    npcDensity: 0.3, treasureDensity: 0.5
  },
  chaos_rift: {
    id: 'chaos_rift', name: '混沌裂隙', zone: '中层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'chaos_rift'), risk: 0.7,
    desc: '空间不稳定，虚空风暴肆虐',
    features: ['虚空风暴', '随机传送', '隐藏入口'],
    npcDensity: 0.1, treasureDensity: 0.1
  },
  dark_prison: {
    id: 'dark_prison', name: '黑暗牢笼', zone: '深层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'dark_prison'), risk: 0.85,
    desc: '十凶黑暗物质泄露之地，令人心悸',
    features: ['十凶觉醒', '黑暗物质', '折仙咒残留'],
    npcDensity: 0.2, treasureDensity: 0.45
  },
  immortal_podium: {
    id: 'immortal_podium', name: '仙王讲道台', zone: '深层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'immortal_podium'), risk: 0.5,
    desc: '仙王曾在此讲道，道则还未消散',
    features: ['功法感悟', '天骄聚集', '道韵浓郁'],
    npcDensity: 0.6, treasureDensity: 0.3
  },
  bone_forest: {
    id: 'bone_forest', name: '天骄埋骨地', zone: '深层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'bone_forest'), risk: 0.7,
    desc: '历代天骄折戟之地，白骨堆积如山',
    features: ['战魂', '遗物机缘', '诅咒'],
    npcDensity: 0.3, treasureDensity: 0.5
  },
  flame_abyss: {
    id: 'flame_abyss', name: '火道禁区', zone: '火道禁区',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'flame_abyss'), risk: 0.8,
    desc: '万火深渊，三千道火永恒燃烧',
    features: ['万火深渊', '三千道火', '祭炼场', '道种孕育'],
    npcDensity: 0.1, treasureDensity: 0.5
  },
  xiangu_core: {
    id: 'xiangu_core', name: '仙古花蕾·核心', zone: '核心区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'xiangu_core'), risk: 0.9,
    desc: '仙古花蕾深处，终极造化所在',
    features: ['唯一机缘', '终极造化地', '撤离点', '道种融合地'],
    npcDensity: 0.4, treasureDensity: 0.8
  },
  chaos_mosquito: {
    id: 'chaos_mosquito', name: '混沌蚊湖', zone: '深层区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'chaos_mosquito'), risk: 1.0,
    desc: '混沌蚊群栖息地，连天神亦避之不及',
    features: ['蚊群', '嗜血', '借势灭敌', '绝地翻盘'],
    npcDensity: 0.0, treasureDensity: 0.6
  },
  void_rift: {
    id: 'void_rift', name: '虚空夹层', zone: '隐藏区域',
    size: resolveXianguFragmentSize(XIANGU_MAP_CONFIG, 'void_rift'), risk: 0.95,
    desc: '秘境第二层，黑色古船横亘虚空',
    features: ['黑色古船', '大罗剑胎', '空间扭曲'],
    npcDensity: 0.0, treasureDensity: 0.9
  }
};

// 各区域的碎片抽取池
const ZONE_FRAGMENT_POOLS = {
  '边缘区域': ['edge_camp', 'spirit_lake'],
  '中层区域': ['ancient_ruins', 'true_dragon_nest', 'chaos_rift'],
  '深层区域': ['dark_prison', 'immortal_podium', 'bone_forest', 'chaos_mosquito'],
  '火道禁区': ['flame_abyss'],
  '核心区域': ['xiangu_core'],
  '隐藏区域': ['void_rift']
};

// 各区域要求的境界等级
const ZONE_LEVEL_REQUIREMENTS = {
  '边缘区域': 5,   // 铭文境
  '中层区域': 6,   // 列阵境
  '深层区域': 7,   // 尊者境
  '火道禁区': 7,   // 尊者境（祭炼真我·未点燃神火）
  '核心区域': 7,   // 尊者境
  '隐藏区域': 8    // 神火境
};

// 格子类型编码
const CELL_TYPE = {
  EMPTY: 0,          // 空地（可通过）
  WALL: 1,           // 墙/不可通行
  TREASURE: 2,       // 机缘点（搜刮后变7）
  DANGER: 3,         // 危险/陷阱/战斗
  NPC: 4,            // NPC所在
  EXIT: 5,           // 出口（去下一碎片）
  VOID_RIFT: 6,      // 虚空裂缝
  EXPLORED_EMPTY: 7, // 已搜刮过的空地
  UNIQUE_TREASURE: 8 // 唯一机缘（传说中的终极造化）
};

function isXianguMarrowPoolPosition(map, x, y) {
  return Object.values(map?.uniqueTreasures || {}).some(treasure =>
    treasure?.kind === XIANGU_MARROW_POOL_KIND &&
    treasure?.pos?.x === x &&
    treasure?.pos?.y === y
  );
}

// ====== 地图初始化 ======
function initXianguRealmMap(player) {
  const level = player.xiangulevel_id || 5;
  
  // 根据境界选择起始碎片区域
  let startZone = '边缘区域';
  if (level >= 8) startZone = Math.random() < 0.5 ? '边缘区域' : '中层区域';
  
  const pool = ZONE_FRAGMENT_POOLS[startZone] || ZONE_FRAGMENT_POOLS['边缘区域'];
  const startFragId = pool[Math.floor(Math.random() * pool.length)];
  const fragment = REALM_FRAGMENTS[startFragId];
  
  const connectedFragments = connectFragments(startFragId, level);

  // 生成网格
  const { grid, playerPos, specials } = generateFragmentGrid(startFragId, connectedFragments);
  
  // 初始化地图数据
  player.xiangu_realm_map = {
    fragmentId: startFragId,
    width: fragment.size[0],
    height: fragment.size[1],
    grid: grid,
    revealed: grid.map(row => row.map(() => false)),
    playerPos: playerPos,
    discoveredFragments: [startFragId],
    connectedFragments,
    uniqueTreasures: specials.uniqueTreasures || {},
    npcLocations: specials.npcLocations || [],
    exitPositions: specials.exitPositions || [],
    stepsTaken: 0,
    generatedAt: Date.now()
  };
  
  // 同步快速访问字段
  player.xiangu_pos_x = playerPos.x;
  player.xiangu_pos_y = playerPos.y;
  player.xiangu_location = fragment.zone;
  
  // 揭示出生点周围
  revealAdjacentCells(player.xiangu_realm_map, playerPos, 1);
}

// ====== 生成碎片网格 ======
function generateFragmentGrid(fragmentId, connectedFragments = {}) {
  const fragment = REALM_FRAGMENTS[fragmentId];
  if (!fragment) return { grid: [[]], playerPos: { x: 0, y: 0 }, specials: {} };
  
  const [w, h] = fragment.size;
  const grid = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      grid[y][x] = CELL_TYPE.EMPTY;
    }
  }
  
  // 边界默认为墙
  for (let x = 0; x < w; x++) { grid[0][x] = CELL_TYPE.WALL; grid[h - 1][x] = CELL_TYPE.WALL; }
  for (let y = 0; y < h; y++) { grid[y][0] = CELL_TYPE.WALL; grid[y][w - 1] = CELL_TYPE.WALL; }
  
  // 每个真实连接方向都生成对应出口，避免地图出口与碎片连接错位。
  const exits = createXianguExitPositions(w, h, connectedFragments);
  for (const { x, y } of exits) {
    grid[y][x] = CELL_TYPE.EXIT;
  }
  
  // 内部生成障碍墙（根据碎片类型）
  const internalWallCount = Math.floor((w * h) * fragment.risk * 0.15);
  for (let i = 0; i < internalWallCount; i++) {
    const wx = 1 + Math.floor(Math.random() * (w - 2));
    const wy = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[wy][wx] === CELL_TYPE.EMPTY) {
      grid[wy][wx] = CELL_TYPE.WALL;
    }
  }
  
  // 放置虚空裂缝
  if (['chaos_rift', 'dark_prison', 'void_rift'].includes(fragmentId)) {
    const riftCount = fragmentId === 'chaos_rift' ? 3 : 1;
    for (let i = 0; i < riftCount; i++) {
      const rx = 1 + Math.floor(Math.random() * (w - 2));
      const ry = 1 + Math.floor(Math.random() * (h - 2));
      if (grid[ry][rx] === CELL_TYPE.EMPTY) {
        grid[ry][rx] = CELL_TYPE.VOID_RIFT;
      }
    }
  }
  
  // 放置机缘点
  const treasureCount = Math.floor((w * h) * fragment.treasureDensity);
  for (let i = 0; i < treasureCount; i++) {
    const tx = 1 + Math.floor(Math.random() * (w - 2));
    const ty = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[ty][tx] === CELL_TYPE.EMPTY) {
      grid[ty][tx] = CELL_TYPE.TREASURE;
    }
  }
  
  // 放置危险点
  const dangerCount = Math.floor((w * h) * fragment.risk * 0.2);
  for (let i = 0; i < dangerCount; i++) {
    const dx = 1 + Math.floor(Math.random() * (w - 2));
    const dy = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[dy][dx] === CELL_TYPE.EMPTY) {
      grid[dy][dx] = CELL_TYPE.DANGER;
    }
  }
  
  // 放置NPC
  const npcCount = Math.floor((w * h) * fragment.npcDensity);
  const npcLocations = [];
  for (let i = 0; i < npcCount; i++) {
    const nx = 1 + Math.floor(Math.random() * (w - 2));
    const ny = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[ny][nx] === CELL_TYPE.EMPTY) {
      grid[ny][nx] = CELL_TYPE.NPC;
      npcLocations.push({ x: nx, y: ny });
    }
  }
  
  // 唯一机缘（仅核心区域和虚空夹层）
  const uniqueTreasures = {};
  if (fragmentId === 'xiangu_core') {
    const ux = 1 + Math.floor(Math.random() * (w - 2));
    const uy = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[uy][ux] !== CELL_TYPE.WALL && grid[uy][ux] !== CELL_TYPE.EXIT) {
      grid[uy][ux] = CELL_TYPE.UNIQUE_TREASURE;
      uniqueTreasures['玉石匣·仙王经文'] = {
        pos: { x: ux, y: uy },
        distEcho: 3,
        claimed: false,
        name: '玉石匣',
        desc: '玉石制成的古匣，内含仙王经文，万年后方可开启',
        echoMsg: {
          3: '心神不宁，似有大道在远方共鸣...',
          2: '一股浩瀚道韵从前方传来，令你体内功法自行运转！',
          1: '你面前的空间微微扭曲，一件被时光尘封的器物若隐若现...'
        }
      };
    }
    
    // 帝血（万物土下）
    const cx = 1 + Math.floor(Math.random() * (w - 2));
    const cy = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[cy][cx] !== CELL_TYPE.WALL && grid[cy][cx] !== CELL_TYPE.EXIT && grid[cy][cx] !== CELL_TYPE.UNIQUE_TREASURE) {
      uniqueTreasures['一滴帝血'] = {
        pos: { x: cx, y: cy },
        distEcho: 2,
        claimed: false,
        name: '帝血',
        desc: '万物土下封存的一滴大帝精血，蕴含无上力量',
        echoMsg: {
          2: '脚下大地隐隐传来温热...似有沉睡的力量在苏醒',
          1: '万物土在震动！一滴璀璨的金色血液缓缓浮出地面！'
        }
      };
    }
  }
  
  if (fragmentId === 'void_rift') {
    const ax = 1 + Math.floor(Math.random() * (w - 2));
    const ay = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[ay][ax] !== CELL_TYPE.WALL) {
      grid[ay][ax] = CELL_TYPE.UNIQUE_TREASURE;
      uniqueTreasures['大罗剑胎'] = {
        pos: { x: ax, y: ay },
        distEcho: 3,
        claimed: false,
        name: '大罗剑胎',
        desc: '黑色古船内的无上剑器，半成品的仙王法器',
        echoMsg: {
          3: '远方似有剑鸣传来，古老而深邃...',
          2: '剑意越来越强！这是来自超越仙王的力量...',
          1: '黑色古船上，一柄剑胎正在沉睡！大罗剑胎！'
        }
      };
    }
  }
  
  // 选择出生点（安全空地，不在角落）
  let spawnPos = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  let spawnFound = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const sx = 1 + Math.floor(Math.random() * (w - 2));
    const sy = 1 + Math.floor(Math.random() * (h - 2));
    if (grid[sy][sx] === CELL_TYPE.EMPTY || grid[sy][sx] === CELL_TYPE.EXPLORED_EMPTY) {
      const neighborsDanger = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]
        .filter(([dx, dy]) => {
          const nx = sx + dx, ny = sy + dy;
          return ny >= 0 && ny < h && nx >= 0 && nx < w && 
            (grid[ny][nx] === CELL_TYPE.DANGER || grid[ny][nx] === CELL_TYPE.WALL);
        }).length;
      if (neighborsDanger <= 2) {
        spawnPos = { x: sx, y: sy };
        spawnFound = true;
        break;
      }
    }
  }

  // 高密度碎片可能没有剩余空格，至少保留一格安全出生点。
  if (!spawnFound) {
    const fallbackCells = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (
          grid[y][x] !== CELL_TYPE.WALL &&
          grid[y][x] !== CELL_TYPE.UNIQUE_TREASURE
        ) {
          fallbackCells.push({ x, y });
        }
      }
    }
    spawnPos = fallbackCells[Math.floor(Math.random() * fallbackCells.length)] || spawnPos;
    grid[spawnPos.y][spawnPos.x] = CELL_TYPE.EMPTY;
  }

  // 放大后的随机墙体不能把出生点与出口隔断。
  ensureXianguExitConnectivity(grid, spawnPos, exits, {
    wallValue: CELL_TYPE.WALL,
    emptyValue: CELL_TYPE.EMPTY,
  });
  
  return {
    grid,
    playerPos: spawnPos,
    specials: {
      uniqueTreasures,
      npcLocations,
      exitPositions: exits
    }
  };
}

// ====== 连接碎片（随机选择相邻碎片） ======
function connectFragments(currentId, level) {
  const current = REALM_FRAGMENTS[currentId];
  if (!current) return {};
  
  const connections = {};
  const directions = ['top', 'bottom', 'left', 'right'];
  
  // 可达区域（根据境界）
  const accessibleZones = [];
  for (const [zone, req] of Object.entries(ZONE_LEVEL_REQUIREMENTS)) {
    if (level >= req) accessibleZones.push(zone);
  }
  if (accessibleZones.length === 0) accessibleZones.push('边缘区域');
  
  const pickTargetFragment = () => {
    const candidateZones = accessibleZones.filter(z => z !== current.zone || Math.random() < 0.3);
    const targetZone = candidateZones[Math.floor(Math.random() * candidateZones.length)] || '边缘区域';
    const pool = ZONE_FRAGMENT_POOLS[targetZone] || ZONE_FRAGMENT_POOLS['边缘区域'];
    const directTarget = pickDifferentXianguFragment(currentId, pool);
    if (directTarget) return directTarget;

    const fallbackPool = accessibleZones.flatMap(zone => ZONE_FRAGMENT_POOLS[zone] || []);
    return pickDifferentXianguFragment(currentId, fallbackPool);
  };

  for (const dir of directions) {
    connections[dir] = Math.random() < 0.6 ? pickTargetFragment() : null;
  }

  // 极端随机结果下也必须至少有一个可离开的方向。
  if (!Object.values(connections).some(Boolean)) {
    const fallbackDirection = directions[Math.floor(Math.random() * directions.length)];
    connections[fallbackDirection] = pickTargetFragment();
  }
  
  return connections;
}

// ====== 神识感知范围 ======
function getDivineSenseRange(player) {
  const level = player.xiangulevel_id || 5;
  if (level <= 6) return 1;        // 铭文、列阵：1格
  if (level === 7) return 1;       // 尊者：1格
  if (level === 8) return 2;       // 神火：2格
  if (level <= 10) return 3;      // 真一、圣祭：3格
  return 4;                         // 天神及以上：4格
}

// ====== 神识感知信息（气息描述，不透露具体内容） ======
function getDivineSensePerception(player, map) {
  const range = getDivineSenseRange(player);
  const { playerPos, grid } = map;
  const perceptions = [];
  
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = playerPos.x + dx;
      const ny = playerPos.y + dy;
      if (ny < 0 || ny >= map.height || nx < 0 || nx >= map.width) continue;
      
      const cell = grid[ny][nx];
      const dir = getDirectionName(dx, dy);
      
      // 根据格子类型生成气息描述
      switch (cell) {
        case CELL_TYPE.WALL:
          perceptions.push({ dir, msg: `前方虚空断裂，无法逾越`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        case CELL_TYPE.TREASURE:
          perceptions.push({ dir, msg: `有灵光吞吐，似有机缘`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        case CELL_TYPE.DANGER:
          perceptions.push({ dir, msg: `杀意凛然，令人心悸`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        case CELL_TYPE.NPC:
          perceptions.push({ dir, msg: `一道气息正在徘徊——有修士在此`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        case CELL_TYPE.EXIT:
          perceptions.push({ dir, msg: `隐约感应到出口的气息`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        case CELL_TYPE.VOID_RIFT:
          perceptions.push({ dir, msg: `空间扭曲——有虚空裂缝！`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        case CELL_TYPE.UNIQUE_TREASURE:
          perceptions.push({
            dir,
            msg: isXianguMarrowPoolPosition(map, nx, ny)
              ? `万道水声轻鸣——仙髓宝池就在附近！`
              : `🔥浩瀚道韵波动——绝世机缘就在附近！`,
            distance: Math.abs(dx) + Math.abs(dy),
          });
          break;
        case CELL_TYPE.EXPLORED_EMPTY:
          perceptions.push({ dir, msg: `已被搜刮，空空如也`, distance: Math.abs(dx) + Math.abs(dy) });
          break;
        default:
          if (cell === CELL_TYPE.EMPTY) {
            const frag = REALM_FRAGMENTS[map.fragmentId];
            if (Math.random() < 0.3 && frag) {
              const ambient = [
                `气息平静，暂无异常`,
                `灵气稀薄，似乎没什么特别`,
                `风过无痕，一片荒芜`
              ];
              perceptions.push({ dir, msg: ambient[Math.floor(Math.random() * ambient.length)], distance: Math.abs(dx) + Math.abs(dy) });
            }
          }
      }
    }
  }
  
  // 去重（同一方向取最近的）
  const grouped = {};
  for (const p of perceptions) {
    const key = p.dir;
    if (!grouped[key] || grouped[key].distance > p.distance) {
      grouped[key] = p;
    }
  }
  
  return Object.values(grouped);
}

// 根据dx/dy确定方向名称
function getDirectionName(dx, dy) {
  if (dy < 0) {
    if (dx < 0) return '西北方';
    if (dx === 0) return '正北方';
    return '东北方';
  } else if (dy === 0) {
    if (dx < 0) return '正西方';
    if (dx > 0) return '正东方';
    return '当前位置';
  } else {
    if (dx < 0) return '西南方';
    if (dx === 0) return '正南方';
    return '东南方';
  }
}

// ====== 渲染带迷雾的碎片网格 ======
function renderRealmGrid(player, map) {
  const range = getDivineSenseRange(player);
  const { playerPos, grid, revealed, fragmentId } = map;
  const fragment = REALM_FRAGMENTS[fragmentId];
  const w = map.width, h = map.height;
  
  // 首先计算哪些格子需要在当前回合被揭示
  // 玩家站在玩家格子上，周围range范围内非迷雾
  const lineCache = {};
  
  const lines = [];
  lines.push(`═══ ${fragment ? fragment.name : '未知区域'} · ${w}×${h} · 神识感知中 ═══`);
  lines.push(`👤 ${player.名号 || '修士'} | ${getRealmName(player.xiangulevel_id)} | 神识: ${range}格 | 💎 道韵: ${player.xiangu_gains?.daoyun || 0}`);
  lines.push(`📍 区域：${fragment ? fragment.zone : '未知'} | 危险：${'★'.repeat(Math.ceil(fragment ? fragment.risk * 5 : 1))}`);
  lines.push('');

  // 渲染网格
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const isPlayer = (x === playerPos.x && y === playerPos.y);
      const dist = Math.abs(x - playerPos.x) + Math.abs(y - playerPos.y);
      const inRange = dist <= range;
      const isRevealed = revealed[y] && revealed[y][x];
      const cell = grid[y][x];
      
      if (isPlayer) {
        row += '🐉';  // 玩家标记
      } else if (isRevealed || inRange) {
        if (isRevealed) {
          // 已揭示：显示实际内容
          switch (cell) {
            case CELL_TYPE.EMPTY: row += '·'; break;
            case CELL_TYPE.WALL: row += '▓'; break;
            case CELL_TYPE.EXPLORED_EMPTY: row += '·'; break;
            case CELL_TYPE.TREASURE: row += '💎'; break;
            case CELL_TYPE.DANGER: row += '⚡'; break;
            case CELL_TYPE.NPC: row += '👤'; break;
            case CELL_TYPE.EXIT: row += '🚪'; break;
            case CELL_TYPE.VOID_RIFT: row += '🌀'; break;
            case CELL_TYPE.UNIQUE_TREASURE: row += isXianguMarrowPoolPosition(map, x, y) ? '💧' : '✨'; break;
            default: row += '·';
          }
        } else {
          // 神识范围内但未揭示：显示气息图标
          switch (cell) {
            case CELL_TYPE.WALL: row += '▓'; break;
            case CELL_TYPE.TREASURE: row += '$$'; break;
            case CELL_TYPE.DANGER: row += '⚡'; break;
            case CELL_TYPE.NPC: row += '🙂'; break;
            case CELL_TYPE.EXIT: row += '➤'; break;
            case CELL_TYPE.VOID_RIFT: row += '🌀'; break;
            case CELL_TYPE.UNIQUE_TREASURE: row += isXianguMarrowPoolPosition(map, x, y) ? '≈' : '∞'; break;
            case CELL_TYPE.EXPLORED_EMPTY: row += '·'; break;
            default: row += '·';
          }
        }
      } else {
        row += '▓';  // 混沌迷雾
      }
    }
    lines.push('  ' + row);
  }
  
  // 图例
  lines.push('');
  lines.push(`🐉玩家  💎机缘  ⚡危险  👤NPC  🚪出口  🌀裂缝  💧${XIANGU_MARROW_POOL_NAME}  ✨唯一机缘`);
  lines.push(`▓迷雾/墙  ·空地  $$道韵感应  ≈仙髓感应  ∞绝世机缘  ➤出口感召`);
  
  return lines.join('\n');
}

// ====== 道韵共鸣 ======
function checkTreasureEcho(player, map) {
  const { playerPos, uniqueTreasures } = map;
  if (!uniqueTreasures || Object.keys(uniqueTreasures).length === 0) return null;
  
  const echoes = [];
  for (const [name, treasure] of Object.entries(uniqueTreasures)) {
    if (treasure.claimed) continue;
    const dist = Math.abs(playerPos.x - treasure.pos.x) + Math.abs(playerPos.y - treasure.pos.y);
    if (dist <= treasure.distEcho) {
      const msg = treasure.echoMsg[dist] || `感应到${name}的道韵波动...`;
      echoes.push({ name, dist, msg });
    }
  }
  
  return echoes.length > 0 ? echoes : null;
}

// ====== 揭示相邻格子 ======
function revealAdjacentCells(map, pos, range) {
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (ny >= 0 && ny < map.height && nx >= 0 && nx < map.width) {
        if (!map.revealed[ny][nx]) {
          map.revealed[ny][nx] = true;
        }
      }
    }
  }
}

// ====== 网格坐标映射到区域名称（向后兼容） ======
function gridPosToZone(map) {
  const fragment = REALM_FRAGMENTS[map.fragmentId];
  return fragment ? fragment.zone : '边缘区域';
}

// ====== 获取境界名称 ======
function getRealmName(levelId) {
  const names = { 2:'搬血境', 3:'洞天境', 4:'化灵境', 5:'铭文境', 6:'列阵境', 7:'尊者境', 8:'神火境', 9:'真一境', 10:'圣祭境', 11:'天神境' };
  return names[levelId] || '未知境';
}

// ====== 混沌蚊湖专属效果 ======
function isInMosquitoLake(map) {
  return map.fragmentId === 'chaos_mosquito';
}

function getMosquitoDrainEffect(player) {
  // 蚊群吸血：每回合损失2-5%生命
  const drain = Math.floor((player.血气上限 || 100000) * (0.02 + Math.random() * 0.03));
  return {
    drain,
    msg: `🦟 混沌蚊群疯狂吸血！${player.名号 || '修士'}感觉生命力在流逝...`
  };
}

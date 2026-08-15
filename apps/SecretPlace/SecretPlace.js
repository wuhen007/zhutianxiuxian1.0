import fs from 'fs';
import path from 'path';
import { plugin, verc, data, config } from '../../api/api.js';

import {
  Read_player,
  existplayer,
  isNotNull,
  sleep,
  exist_najie_thing,
  Add_najie_thing,
  Read_najie,
  Read_equipment,
  Write_najie,

} from '../../model/xiuxian.js';

import {
  Add_灵石,
  Add_源石,
  Add_修为,
   Add_血气,
  Add_寿元,
  exist_hunyin,
  find_qinmidu,
  add_qinmidu,
  Goweizhi,
  Write_player,
  Write_equipment,
  bigNumberTransform,
  xunbaoweizhi,
  xunbaoCategoryData,
  Go,
  channel,
  Read_renwu,
  Write_renwu,
  zd_battle,
  find_renwu,
  Add_renwu_progress,
} from '../../model/xiuxian.js';
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";
import RealmEvents from '../tasks/RealmEvents.js';
import { mountTianjiaoTreasure } from '../../model/tianjiaoTreasure.js';
import {
  applyInnateTravelReduction,
  claimInnateTreasure,
  createInnateTreasure,
  createInnateTreasureProjection,
  getDungeonTimedActionMultiplier,
  getTimedActionMultiplier,
  hasEquippedInnateTreasure,
  readInnateTreasureState,
} from '../../model/innateTreasure.js';
import {
  TREASURE_DAO_HEARTS,
  TREASURE_TRIAL_LIMIT,
  TIANJI_INFO_BONUS,
  createTreasureGuardian,
  getRevealedTreasureClues,
  getTreasureContestProfile,
  rankTreasureContest,
} from '../../model/innateTreasureContest.js';
import { calculateMinggeGain, getMinggeEffects, getMinggeSecretPlaceReductionMs } from '../../model/mingge.js';
import { isDaofaActive } from '../../model/daofa.js';
import { getPlayerPlaneCoordinate } from '../../model/planeCoords.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import { getZhetianInheritanceEntryBlock } from '../../model/zhetianInheritance.js';
import {
    formatRealmEventLocation,
    formatRealmEventTravel,
    getRealmEventReach,
} from '../../model/realmEventLocation.js';
import {
    ACCIDENT_BASE,
    ACCIDENT_REALM_REDUCE,
    COORDINATE_CLUE_COST,
    DEFAULT_KNOWN_LOCATIONS,
    PLACE_LOCATION_MAP,
    SPECIAL_LOCATIONS,
    TRAVEL_REDUCE_MAX,
    calcRealmReducePct,
    consumeTravelWind,
    getBaseTravelThreshold,
    getBodyTravelQuote,
    getLocationThreshold,
    getTokenTravelTime,
    getUnknownCoordinates,
    hasCoordinate,
    purchaseCoordinateClue,
    rememberCoordinate,
} from '../../model/weimianTravel.js';
import {
    WENXIAN_REQUIRED_REALM_LEVEL,
    grantWenXianClue,
    isWenXianEligible,
} from '../../model/wenxianling.js';
import {
    RED_DUST_FORTUNE_COST,
    RED_DUST_FORTUNES,
    createRedDustFortune,
    getActiveRedDustFortune,
    getRedDustFortuneType,
} from '../../model/redDustFortune.js';
import { BINGZI_FRAGMENT, BINGZI_TECHNIQUE } from '../../model/bingziLegacy.js';
import {
    findSectWarProduct,
    SECT_WAR_SHOP,
    SECT_WAR_TOKEN,
} from '../../model/sectWarShop.js';

// ==================== 诡异大祭·崩灭位面检查工具 ====================
function isWeiMianDestroyed(planeName) {
    try {
        const filePath = data.filePathMap.weimianList;
        const obj = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return obj[planeName] === 0;
    } catch (e) { return false; }
}

async function replyPlaneDestroyed(e, planeName) {
    return e.reply([
        `【虚空封锁·位面崩灭】`,
        ``,
        `厄土仙帝的一掌彻底粉碎了「${planeName}」的位面壁垒，副本入口随之崩塌！`,
        `「崩灭的位面，岂容尔等自由进出？」`,
        ``,
        `唯仙帝映照权能，方可修复崩灭的位面。`,
    ].join('\n'));
}
// ================================================================

// ==================== 位面穿梭·接引请求 ====================
// 待确认请求缓存：key = 被接引/送往者QQ，value = { fromQQ, fromName, type, locationName, expire }
const pendingJieyinMap = new Map();
const treasureSettlementLocks = new Set();
const sectWarSettlementLocks = new Set();
const sectWarShopLocks = new Set();
const bingziSettlementLocks = new Set();

function setPendingJieyin(targetQQ, request) {
    const now = Date.now();
    for (const [qq, pending] of pendingJieyinMap) {
        if (Number(pending.expire) <= now) pendingJieyinMap.delete(qq);
    }
    pendingJieyinMap.set(targetQQ, { ...request, expire: now + 60000 });
}

const SECT_WAR_SIDE_LABELS = {
    attacker: '攻方',
    defender: '守方',
    coalition: '联军',
    neutral: '中立'
};

function getSectWarActionPower(player) {
    const realmPower =
        (Number(player.level_id) || 0) +
        (Number(player.Physique_id) || 0) +
        (Number(player.mijinglevel_id) || 0) * 2 +
        (Number(player.xiangulevel_id) || 0) * 2 + 2;
    return Math.max(1, Math.min(12, Math.floor(realmPower / 4) + 1));
}

function getSectWarSideName(war, side) {
    return war?.sides?.[side]?.name || SECT_WAR_SIDE_LABELS[side] || side;
}

function getBingziInsight(player) {
    const realmPower =
        (Number(player.level_id) || 0) +
        (Number(player.Physique_id) || 0) +
        (Number(player.mijinglevel_id) || 0) * 2 +
        (Number(player.xiangulevel_id) || 0) * 2;
    return Math.max(0, Math.min(20, Math.floor(realmPower / 3)));
}

function treasureBattleExcerpt(messages) {
    if (!Array.isArray(messages)) return [];
    if (messages.length <= 16) return messages;
    return [...messages.slice(0, 4), '……战斗过程过长，仅展示末段……', ...messages.slice(-10)];
}

// 刻画坐标消耗的灵石（在传送阵上刻入坐标）
const ENGRAVE_LINGSHI_COST = 5e7;
// ================================================================

// 崩灭位面提示文案（与 goToLocation 保持一致）
function buildPlaneDestroyedMsgs(planeName) {
    return [
        `【虚空封锁·位面崩灭】`,
        ``,
        `你试图踏入「${planeName}」——`,
        `然而星空古路的另一端，只有无尽的黑暗与虚空乱流。`,
        ``,
        `诡异大祭期间，始祖亲手将「${planeName}」打爆，`,
        `位面壁垒彻底崩碎，山河破灭，生灵涂炭！`,
        ``,
        `「此界已成废墟，汝欲入死地乎？」`,
        ``,
        `唯仙帝映照权能，方可修复崩灭的位面。`,
    ].join('\n');
}
// ================================================================


export class SecretPlace extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_SecretPlace',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
  reg: '^#去$',
  fnc: 'quickReplay',
},
        {
          reg: '^#修仙状态|#状态$',
          fnc: 'Xiuxianstate',
        },
        {
          reg: '^#秘境$',
          fnc: 'Secretplace',
        },
        {
          reg: '^#降临秘境.*$',
          fnc: 'Gosecretplace',
        },
        {
          reg: '^#禁地$',
          fnc: 'Forbiddenarea',
        },
        {
          reg: '^#前往禁地.*$',
          fnc: 'Goforbiddenarea',
        },
        {
          reg: '^#仙府$',
          fnc: 'Timeplace',
        },
        {
          reg: '^#探索仙府$',
          fnc: 'GoTimeplace',
        },
        {
          reg: '^#仙境$',
          fnc: 'Fairyrealm',
        },
        {
          reg: '^#镇守仙境.*$',
          fnc: 'Gofairyrealm',
        },
        {
          reg: '^#逃离',
          fnc: 'Giveup',
        },
        {
          reg: '^#寻宝$',
          fnc: 'xunbao',
        },
        {
          reg: '^#寻宝钓鱼$',
          fnc: 'xunbaoFishing',
        },
        {
          reg: '^#寻宝砍树$',
          fnc: 'xunbaoLogging',
        },
        {
          reg: '^#寻宝种植$',
          fnc: 'xunbaoFarming',
        },
        {
          reg: '^#寻宝挖矿$',
          fnc: 'xunbaoMining',
        },
        {
          reg: '^#寻宝特殊$',
          fnc: 'xunbaoSpecial',
        },
          {
          reg: '^#遮天位面',
          fnc: 'zhetian',
        },
        {
          reg: '^#前往遮天位面.*$',
          fnc: 'Gozhetian',
        },
          {
          reg: '^#上苍之上',
          fnc: 'shangcang',
        },
          {
          reg: '^#下界八域',
          fnc: 'xiajie',
        },
        {
          reg: '^#前往下界八域.*$',
          fnc: 'Goxiajie',
        },
                     {
          reg: '^#九天十地',
          fnc: 'jiutianshidi',
        },
                {
          reg: '^#前往九天十地.*$',
          fnc: 'Gojiutianshidi',
        },
           {
          reg: '^#界海',
          fnc: 'jiehai',
        },
          {
          reg: '^#探索界海.*$',
          fnc: 'Gojiehaiplace',
        },
         {
          reg: '^#激活五色祭坛',
          fnc: 'wusejitan',
        },
                 {
          reg: '^#副本掉落\s*',
          fnc: 'handleDungeonDrop',
        },
       {
  reg: '^#穿梭(凡间|仙界|下界八域|仙域|遮天位面|九天十地|界海|太初星墟|时间长河|永恒未知之地|小阴间|大阴间|阳间)$',
  fnc: 'goToLocation'
},
{
  reg: '^#接引',
  fnc: 'jieyinPlayer'
},
{
  reg: '^#送往',
  fnc: 'sendPlayerToLocation'
},
{
  reg: '^#同意接引$',
  fnc: 'confirmJieyin'
},
{
  reg: '^#拒绝接引$',
  fnc: 'refuseJieyin'
},
{
  reg: '^#记坐标',
  fnc: 'recordCoordinate'
},
{
  reg: '^#坐标记忆$',
  fnc: 'coordinateMemory'
},
{
  reg: '^#(?:求购|求取)位面线索',
  fnc: 'buyCoordinateClue'
},
{
  reg: '^#探索位面线索',
  fnc: 'exploreCoordinateClue'
},
{
  reg: '^#参悟问仙古碑$',
  fnc: 'exploreWenXianStele'
},
{
  reg: '^#(?:参与(?:位面)?大事件|夺宝|探查遗迹)$',
  fnc: 'participateRealmEvent'
},
{
  reg: '^#圣战详情$',
  fnc: 'sectWarInfo'
},
{
  reg: '^#圣战站队\\s+(?:攻方|守方|联军|中立|观望)$',
  fnc: 'joinSectWar'
},
{
  reg: '^#战场行动\\s+(?:正面攻伐|护送资源|源术勘脉|潜入夺证|救援伤员)$',
  fnc: 'sectWarAction'
},
{
  reg: '^#调查战端$',
  fnc: 'sectWarAction'
},
{
  reg: '^#投入战资\\s+源石\\*[1-9]\\d*$',
  fnc: 'supportSectWar'
},
{
  reg: '^#查看战场榜$',
  fnc: 'sectWarRanking'
},
{
  reg: '^#战功商店$',
  fnc: 'showSectWarShop'
},
{
  reg: '^#战功兑换\\s*.+$',
  fnc: 'buySectWarProduct'
},
{
  reg: '^#提交战场决议\\s+(?:继续争夺|停战查真|联军攻禁区|强攻禁区|稳固封印|撤离伤员)$',
  fnc: 'voteSectWarDecision'
},
{
  reg: '^#(?:秦门兵图|兵字秘事件)$',
  fnc: 'bingziLegacyInfo'
},
{
  reg: '^#追查蔡族$',
  fnc: 'traceBingziCaiClan'
},
{
  reg: '^#跟踪月灵公主$',
  fnc: 'trackBingziMoonPrincess'
},
{
  reg: '^#辨认石山\\*[1-9]$',
  fnc: 'identifyBingziMountain'
},
{
  reg: '^#月下观兵$',
  fnc: 'observeBingziDiagram'
},
{
  reg: '^#以器证兵$',
  fnc: 'declareBingziWeapon'
},
{
  reg: '^#兵字秘榜$',
  fnc: 'bingziLegacyRanking'
},
{
  reg: '^#(?:观摩灵宝|查看夺宝进度|灵宝择主榜)$',
  fnc: 'treasureContestInfo'
},
{
  reg: '^#熔炼灵宝\\s+.+$',
  fnc: 'MeltInnateTreasure'
},
{
  reg: '^#挑战守护灵\\s+(?:普通|凶险|绝境)$',
  fnc: 'treasureContestTrial'
},
{
  reg: '^#参悟先天禁制\\s+.+$',
  fnc: 'treasureContestTrial'
},
{
  reg: '^#护持天地灵脉\\s+.+\\*\\d+$',
  fnc: 'treasureContestTrial'
},
{
  reg: '^#跃入命运乱流$',
  fnc: 'treasureContestTrial'
},
{
  reg: '^#立下道心\\s+(?:镇压诸天|守护苍生|参悟大道|逍遥天地)$',
  fnc: 'treasureContestDaoHeart'
},
{
  reg: '^#白须仙翁$',
  fnc: 'whiteBeardShop'
},
{
  reg: '^#购买仙翁商品\\*[1-9]\\d*$',
  fnc: 'buyWhiteBeardItem'
},
{
  reg: '^#黑衣神秘人$',
  fnc: 'blackMarketShop'
},
{
  reg: '^#购买黑市商品\\*[1-9]\\d*$',
  fnc: 'buyBlackMarketItem'
},
{
  reg: '^#绝美仙子$',
  fnc: 'fairyFortuneShop'
},
{
  reg: '^#求取(?:问道|历练|寻缘)签$',
  fnc: 'buyFairyFortune'
},
{
  reg: '^#刻画坐标',
  fnc: 'engraveCoordinate'
}
      ],
    });
    this.task = {
      cron: '0 */5 * * * ?',
      name: '位面大事件结算',
      fnc: () => this.settleExpiredRealmEvents(),
    };
  }

  async startXutianPassengers(owner, ownerTask) {
    if (!ownerTask.travel_protected || !hasEquippedInnateTreasure(owner, '虚天舟')) return [];
    const passengerIds = [...new Set((owner.虚天舟乘员 || []).map(String))].slice(0, 3);
    const boarded = [];

    for (const passengerQq of passengerIds) {
      if (passengerQq === String(ownerTask.player_qq) || !await existplayer(passengerQq)) continue;
      const passenger = await Read_player(passengerQq);
      const actionRaw = await redis.get(`xiuxian:player:${passengerQq}:action`);
      let busy = false;
      if (actionRaw) {
        try { busy = Number(JSON.parse(actionRaw)?.end_time) > Date.now(); } catch { busy = false; }
      }
      const threshold = await this.checkLocationThreshold(passenger, ownerTask.to_name);
      if (busy || passenger.power_place !== ownerTask.from_location || !threshold.ok) {
        passenger.虚天舟船主 = '';
        await Write_player(passengerQq, passenger);
        continue;
      }

      const passengerTask = {
        ...ownerTask,
        action: '乘坐虚天舟',
        player_qq: passengerQq,
        player_name: passenger.名号,
        xiuwei_cost: 0,
        qixue_cost: 0,
        shouyuan_cost: 0,
        used_token: false,
        accident: false,
        travel_protected: true,
        passenger_of: String(ownerTask.player_qq),
        travel_msg: [`你随${owner.名号}乘虚天舟横渡诸界，万千位面在舟外化为流光`],
      };
      passenger.虚天舟船主 = '';
      await redis.set(`xiuxian:travel_task:${passengerQq}`, JSON.stringify(passengerTask));
      await redis.set(`xiuxian:player:${passengerQq}:action`, JSON.stringify(passengerTask));
      await Write_player(passengerQq, passenger);
      boarded.push(passenger.名号 || passengerQq);
    }

    owner.虚天舟乘员 = [];
    return boarded;
  }

async goToLocation(e) {
    if (!verc({ e })) return false;
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
     usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    
    // 解析目标地点
    const location = e.msg.match(/^#穿梭(凡间|仙界|下界八域|九天十地|遮天位面|界海|太初星墟|时间长河|永恒未知之地|仙域|小阴间|大阴间|阳间)$/)[1];
    
    // 地点映射表（统一引用模块级 PLACE_LOCATION_MAP，避免多处分散硬编码）
    const LOCATION_MAP = PLACE_LOCATION_MAP;
    
    // 检查是否有效地点
    if (!LOCATION_MAP.hasOwnProperty(location)) {
        return e.reply(`无效地点：${location}\n可用地点：${Object.keys(LOCATION_MAP).join('、')}`);
    }
    
    const targetLocation = LOCATION_MAP[location];
    
    if (!getBaseTravelThreshold(player).ok) {
        const messages = [`你必须成就地仙，肉身成圣后才能承受住穿梭空间的能量风暴`,];
        
         e.reply(messages);
        return;
    }

    // 检查是否已在目标地点
    if (player.power_place === targetLocation) {
        return e.reply(`你已经在${location}了`);
    }

    // ========== 【诡异大祭】崩灭位面检查（统一入口，先于任何传送逻辑） ==========
    if (isWeiMianDestroyed(location)) {
        return e.reply(buildPlaneDestroyedMsgs(location));
    }
    // =========================================================================
    
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    
    // ========== 坐标记忆校验（凡间默认已知，其余需先记坐标；五色祭坛激活可免记直抵遮天） ==========
    const altarBypassZhatian = (location === '遮天位面' && player.五色祭坛激活 === 1);
    if (!hasCoordinate(player, location) && !altarBypassZhatian) {
        return e.reply([
            `【坐标未知·星路迷茫】`,
            `你并不知道「${location}」的星空坐标，无法定位彼岸。`,
            ``,
            `※ 坐标可通过每日副本、位面石壁事件或 #求购位面线索 ${location} 获得，`,
            `  也可使用1枚星图执行 #记坐标 ${location}。`,
            `※ 传送阵还需执行 #刻画坐标 ${location}，将已知坐标刻入阵纹。`,
            `※ 当前记忆坐标：${(Array.isArray(player.记忆坐标) && player.记忆坐标.length) ? player.记忆坐标.join('、') : '无（凡间默认已知）'}`
        ].join('\n'));
    }
    // 五色祭坛激活：九龙拉棺自带星路，自动将「遮天位面」记入记忆坐标（兼容旧号已激活者）
    if (altarBypassZhatian) {
        if (!Array.isArray(player.记忆坐标)) player.记忆坐标 = [];
        if (!player.记忆坐标.includes('遮天位面')) {
            player.记忆坐标.push('遮天位面');
            await Write_player(usr_qq, player);
        }
    }
    // =====================================================================

    // ========== 位面传送阵（消耗令牌，异步分级传送，不再瞬达） ==========
    const hasHighToken = (player.高级传送次数 || 0) > 0;
    const hasLowToken = (player.位面传送次数 || 0) > 0;
    const tokenTier = hasHighToken ? 'high' : (hasLowToken ? 'low' : null);
    const isSpecialLocation = SPECIAL_LOCATIONS.includes(location);

    if (tokenTier && !isSpecialLocation) {
        // 传送阵要求：目标位面已在传送阵上"刻画"坐标
        const engraved = Array.isArray(player.传送阵坐标) ? player.传送阵坐标 : [];
        if (!engraved.includes(location)) {
            return e.reply([
                `【传送阵·坐标未刻】`,
                `你的位面传送阵上并未刻画「${location}」的坐标，`,
                `阵纹无法锚定彼岸，传送失败。`,
                ``,
                `※ 请先用 #刻画坐标 @${location} 在阵上刻入该位面坐标。`,
                `※ 已刻画坐标：${engraved.length ? engraved.join('、') : '无'}`
            ].join('\n'));
        }

        // 计算传送阵耗时（分级 + 随境界缩短）
        const reducePct = calcRealmReducePct(player);
        let travelTime = getTokenTravelTime(player, player.power_place, targetLocation, tokenTier);

        // 虚空乱流事故判定（低级阵/低境界风险高）
        const accidentChance = Math.max(0,
            (tokenTier === 'high' ? ACCIDENT_BASE.high : ACCIDENT_BASE.low) - reducePct * (ACCIDENT_REALM_REDUCE / TRAVEL_REDUCE_MAX)
        );
        let isAccident = false;
        let accidentExtra = 0;
        if (Math.random() < accidentChance) {
            isAccident = true;
            accidentExtra = Math.ceil(travelTime * 0.5); // 乱流额外延迟
            travelTime += accidentExtra;
        }

        const windResult = consumeTravelWind(player, travelTime);
        travelTime = windResult.travelTime;
        travelTime = Math.max(1, Math.ceil(travelTime * getTimedActionMultiplier(player)));
        const shipResult = applyInnateTravelReduction(player, travelTime);
        travelTime = shipResult.travelTime;

        // 消耗令牌（高级优先）
        if (tokenTier === 'high') player.高级传送次数 -= 1;
        else player.位面传送次数 -= 1;

        // 构建启程消息
        const tierName = tokenTier === 'high' ? '高级传送阵' : '传送阵';
        const startTravelMsg = [
            `【${tierName}·横渡星域】`,
            `你激活位面传送阵纹，空间道则交织成星空古路，`,
            `「轰——」阵图迸发无量神光，撕裂虚空壁垒。`,
            `预计需要 ${travelTime} 分钟横渡至${location}。`,
            isAccident ? `※ 星路震荡，似有虚空乱流潜伏，前路未卜……` : `※ 星路平稳，时空法则有序流转。`,
            windResult.consumed ? `※ 天外清风引路，行程缩短${windResult.reduction}分钟（剩余${windResult.remainingUses}次）。` : null,
            shipResult.reduction ? `※ 虚天舟横渡界壁，行程再缩短${shipResult.reduction}分钟。` : null,
            `※ ${tierName}消耗 -1（剩余：${tokenTier === 'high' ? player.高级传送次数 : player.位面传送次数}次）`
        ].filter(Boolean).join('\n');

        // 写入异步任务（位置在抵达时才落库，真正耗时）
        const travelAction = {
            action: '位面传送',
            start_time: new Date().getTime(),
            end_time: new Date().getTime() + travelTime * 60 * 1000,
            from_location: player.power_place,
            to_location: targetLocation,
            from_name: Object.keys(LOCATION_MAP).find(key => LOCATION_MAP[key] === player.power_place),
            to_name: location,
            travel_time: travelTime,
            xiuwei_cost: 0,
            qixue_cost: 0,
            shouyuan_cost: 0,
            used_token: true,
            token_tier: tokenTier,
            accident: isAccident,
            tianwai_wind: windResult.consumed,
            travel_protected: hasEquippedInnateTreasure(player, '虚天舟'),
            travel_msg: [
                `阵纹流转，星空古路在脚下铺展`,
                `你沿古路横渡，位面光影在身侧缓缓流淌`,
                `彼岸坐标已锚定，古路尽头隐约浮现${location}的轮廓`
            ],
            player_name: player.名号,
            player_qq: usr_qq,
            group_id: e.isGroup ? e.group_id : null
        };
        await redis.set(`xiuxian:travel_task:${usr_qq}`, JSON.stringify(travelAction));
        await redis.set(`xiuxian:player:${usr_qq}:action`, JSON.stringify(travelAction));
        const passengerNames = await this.startXutianPassengers(player, travelAction);
        await Write_player(usr_qq, player);

        e.reply([startTravelMsg, passengerNames.length ? `※ 同行乘员：${passengerNames.join('、')}` : ''].filter(Boolean).join('\n'));
        return true;
    }
    // =====================================================================

    // 以下是常规肉身穿梭逻辑

    // ========== 通用位面准入门槛检查（接引/送往复用同一套逻辑） ==========
    const threshold = await this.checkLocationThreshold(player, location);
    if (!threshold.ok) {
        return e.reply(threshold.msgs);
    }
    // =====================================================================
    
    // 计算传送消耗（随境界递减）
    const travelQuote = getBodyTravelQuote(player, player.power_place, targetLocation);
    const { xiuweiCost, qixueCost, shouyuanCost } = travelQuote;
    let travelTime = travelQuote.travelTime;
    let allMsgs = [];

    // ==== 鲲鹏宝术检查 ====
    if (travelQuote.kunpengReduction > 0) {
        const kunpengReduction = travelQuote.kunpengReduction;
        const kunpengTexts = [
            `【鲲鹏极速·扶摇九天】`,
            `你背后浮现鲲鹏虚影，羽翼遮天蔽日！`,
            `施展鲲鹏宝术中的极速奥义：`,
            `- 鲲入海，水击三千里`,
            `- 鹏展翅，扶摇九万里`,
            `- 阴阳二气流转，虚空为之震颤`
        ];

        // 根据境界补充对应叙事
        if (player.mijinglevel_id >= 15 || player.xiangulevel_id >= 13) { // 至尊境以上
            kunpengTexts.push(`鲲鹏真羽显化，撕裂虚空而行`);
        }
        if (player.mijinglevel_id >= 18 || player.xiangulevel_id >= 16) { // 真仙以上
            kunpengTexts.push(`时间长河浮现，展翅间横渡万古`);
        }

        kunpengTexts.push(
            `"鹏啸震古今，翼展覆苍茫！"`,
            `时间大幅减少${kunpengReduction}分钟`
        );
        
        allMsgs.push(kunpengTexts.join('\n'));
    }
    
    // 检查修为和血气是否足够
    if (player.修为 < xiuweiCost) {
        return e.reply([
            `【破碎虚空·修为不足】`,
            `位面穿梭需要消耗大量修为！`,
            `当前修为：${player.修为}`,
            `所需修为：${xiuweiCost}`,
            `修为不足，无法完成传送`
        ].join('\n'));
    }
    
    if (player.血气 < qixueCost) {
        return e.reply([
            `【破碎虚空·血气不足】`,
            `位面穿梭需要消耗大量血气！`,
            `当前血气：${player.血气}`,
            `所需血气：${qixueCost}`,
            `血气不足，无法完成传送`
        ].join('\n'));
    }
    
    if (player.寿元 < shouyuanCost) {
        return e.reply([
            `【破碎虚空·寿元不足】`,
            `位面穿梭需要消耗大量寿元！`,
            `当前寿元：${player.寿元}`,
            `所需寿元：${shouyuanCost}`,
            `寿元不足，无法完成传送`
        ].join('\n'));
    }

    const windResult = consumeTravelWind(player, travelTime);
    travelTime = windResult.travelTime;
    travelTime = Math.max(1, Math.ceil(travelTime * getTimedActionMultiplier(player)));
    const shipResult = applyInnateTravelReduction(player, travelTime);
    travelTime = shipResult.travelTime;
    if (windResult.consumed) {
        allMsgs.push([
            `【天外清风·清风引路】`,
            `一缕天外罡风托起你的身形，虚空星路骤然缩短。`,
            `行程减少${windResult.reduction}分钟，剩余加速${windResult.remainingUses}次。`
        ].join('\n'));
    }
    if (shipResult.reduction) {
      allMsgs.push(`【虚天舟·诸界无碍】行程缩短${shipResult.reduction}分钟，本次航程不受至尊与天骄截杀。`);
    }

    // 根据不同地点构建不同传送描述
    const fromLocation = Object.keys(LOCATION_MAP).find(key => LOCATION_MAP[key] === player.power_place);
    let startMsg = [];
    let travelMsg = [];

    switch (true) {
        case player.power_place === 0 && targetLocation === 1: // 凡间→仙界
            startMsg = [
                `你祭出飞剑，化作一道流光直冲云霄`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `穿越九天罡风层，向仙界之门进发`,
                `预计需要${travelTime}分钟抵达仙界`
            ];
            travelMsg = [
                `飞剑破开云层，仙气逐渐浓郁`,
                `前方出现巍峨的南天门，金光万丈`,
                `仙界守卫远远望见你的身影，肃然起敬`
            ];
            break;
            
        case targetLocation === 6: // 前往仙域
            if (player.power_place === 3) { // 从界海→仙域
                startMsg = [
                    `你祭出帝兵，轰开界海尽头的混沌雾霭`,
                    `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                    `仙域接引古殿在虚空中显化，金光大道铺展`,
                    `预计需要${travelTime}分钟横渡最后的天堑`
                ];
                travelMsg = [
                    `接引古殿发出轰鸣，仙道规则化作虹桥`,
                    `你踏着金光大道前行，脚下是沉浮的残破古界`,
                    `前方混沌气散开，露出仙域的一角`
                ];
            } 
            else if (player.power_place === 3.6) { // 从时间长河→仙域
                startMsg = [
                    `你逆溯时间长河，寻找仙域在乱古的坐标`,
                    `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                    `掌指间绽放轮回之力，击穿时空壁垒`,
                    `预计需要${travelTime}分钟抵达仙域`
                ];
                travelMsg = [
                    `你在光阴碎片中看到仙域昔日的辉煌`,
                    `天庭遗址浮现，石昊的虚影在时光中显化`,
                    `「后来者，这就是你要找的仙域...」`
                ];
            }
            else { // 默认情况
                startMsg = [
                    `你凝聚至高法则，构建通往仙域的时空之门`,
                    `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                    `周身环绕原始真解符文，抵御界壁反噬`,
                    `预计需要${travelTime}分钟完成穿梭`
                ];
                travelMsg = [
                    `仙域法则如天刀般斩来，被你一掌击碎`,
                    `前方出现真仙跪拜的虚影，仙禽瑞兽飞舞`,
                    `浓郁的仙气几乎凝成液体，目的地将至`
                ];
            }
            break;
            
        case player.power_place === 1 && targetLocation === 0: // 仙界→凡间
            startMsg = [
                `你收敛仙气，化作凡人模样`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `脚踏祥云缓缓向凡间降落`,
                `预计需要${travelTime}分钟抵达凡间`
            ];
            travelMsg = [
                `仙气逐渐稀薄，人间烟火气息扑面而来`,
                `下方城池轮廓渐渐清晰，市井喧嚣可闻`,
                `你轻轻落地，不惊起一丝尘埃`
            ];
            break;
            
        case player.power_place === 1 && targetLocation === 2: // 仙界→遮天位面
            startMsg = [
                `你激活五色祭坛，九龙拉棺破空而至`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `踏上青铜古棺，准备横渡虚空`,
                `预计需要${travelTime}分钟抵达遮天位面`
            ];
            travelMsg = [
                `九龙拉棺在星空中穿梭，星辰如流光般倒退`,
                `前方出现一片荒古气息弥漫的星域`,
                `青铜棺椁震动，即将抵达目的地`
            ];
            break;
            
        case player.power_place === 2 && targetLocation === 3: // 遮天位面→界海
            startMsg = [
                `你撕裂虚空，踏足界海堤坝`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `亿万宇宙沉浮，浪花中映照诸天万界`,
                `预计需要${travelTime}分钟横渡界海`
            ];
            travelMsg = [
                `界海无边，波涛汹涌，每一步都跨越无数宇宙`,
                `黑暗中有点点光芒，那是残破的古界在沉浮`,
                `前方出现一片相对平静的海域，目的地将至`
            ];
            break;
            
        case player.power_place === 3 && targetLocation === 3.6: // 界海→时间长河
            startMsg = [
                `你以无上伟力击穿时空壁垒`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `脚踏光阴碎片，准备逆流而上`,
                `预计需要${travelTime}分钟抵达时间长河`
            ];
            travelMsg = [
                `时间长河奔涌，万古景象在身侧流转`,
                `你看到上古大战的残影，仙王喋血的悲壮`,
                `前方河段愈发湍急，时空波动剧烈`
            ];
            break;
            
        case player.power_place === 3.6 && targetLocation === 6.5: // 时间长河→永恒未知之地
            startMsg = [
                `你超脱诸天万界，向永恒未知之地进发`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `周身道则崩解又重组，万法不侵`,
                `预计需要${travelTime}分钟抵达永恒未知之地`
            ];
            travelMsg = [
                `这里连时间都不存在，只有绝对的虚无`,
                `你的存在本身就在改写周围的规则`,
                `前方出现一片绝对寂静的领域，目的地将至`
            ];
            break;

        case player.power_place === 4 && targetLocation === 5: // 小阴间→大阴间
            startMsg = [
                `你循着残破宇宙深处飘来的堕落气息前行`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `穿过层层崩坏的世界壁垒`,
                `预计需要${travelTime}分钟抵达大阴间`
            ];
            travelMsg = [
                `大阴间的法则比小阴间完整，却弥漫着神祇陨落的悲凉`,
                `堕落之地与混沌残破宇宙在远方沉浮`,
                `前方神道气息愈发浓郁，目的地将至`
            ];
            break;

        case player.power_place === 5 && targetLocation === 7: // 大阴间→阳间
            startMsg = [
                `你仰望虚空尽头，那里有完整天地法则的璀璨大界`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `斩开阴阳两界的朦胧壁垒`,
                `预计需要${travelTime}分钟抵达阳间`
            ];
            travelMsg = [
                `阳间法则完整如金玉，天地坚固远超阴间诸界`,
                `名山神祇与古老道统的气息扑面而来`,
                `前方出现阳间的一角，目的地将至`
            ];
            break;
            
        default:
            startMsg = [
                `你施展破碎虚空之术`,
                `消耗${xiuweiCost}修为与${qixueCost}血气以及${shouyuanCost}寿元`,
                `从${fromLocation}向${location}进发`,
                `预计需要${travelTime}分钟抵达`
            ];
            travelMsg = [
                `虚空穿梭中，周围景象飞速变换`,
                `位面壁垒在身后逐渐闭合`,
                `前方目的地的气息越来越清晰`
            ];
            break;
    }
    
    // 扣除修为和血气（先不修改power_place，确保travelAction能正确记录出发地）
    player.修为 -= xiuweiCost;
    player.血气 -= qixueCost;
    player.寿元 -= shouyuanCost;
    
    // 设置传送行动（此时player.power_place还是出发地，from_location会正确记录）
    const travelAction = {
        action: '位面传送',
        start_time: new Date().getTime(),
        end_time: new Date().getTime() + travelTime * 60 * 1000,
        from_location: player.power_place,
        to_location: targetLocation,
        from_name: fromLocation,
        to_name: location,
        travel_time: travelTime,
        xiuwei_cost: xiuweiCost,
        qixue_cost: qixueCost,
        shouyuan_cost: shouyuanCost,
        travel_msg: travelMsg,
        player_name: player.名号,
        player_qq: usr_qq,
        group_id: e.isGroup ? e.group_id : null,
        used_token: false, // 标记未使用传送次数
        tianwai_wind: windResult.consumed,
        travel_protected: hasEquippedInnateTreasure(player, '虚天舟')
    };
    
    // 保存到Redis
    await redis.set(`xiuxian:travel_task:${usr_qq}`, JSON.stringify(travelAction));
    await redis.set(`xiuxian:player:${usr_qq}:action`, JSON.stringify(travelAction));
    const passengerNames = await this.startXutianPassengers(player, travelAction);
    
    // 最后再修改玩家位置为目标位面，写入数据库
    player.power_place = targetLocation;
    await Write_player(usr_qq, player);
    
    // 发送开始传送消息
    e.reply([
        `【破碎虚空·位面穿梭】`,
        `${player.名号}施展无上神通，`,
        ...startMsg,
        ...allMsgs,
        ...(passengerNames.length ? [`同行乘员：${passengerNames.join('、')}`] : []),
        `请耐心等待传送完成...`
    ].join('\n'));
    
    return true;
}
      async wusejitan(e) {
      let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
     let player = await Read_player(usr_qq);
          //不开放私聊功能
          if (!e.isGroup) {
              e.reply('修仙游戏请在群聊中游玩');
              return;
          }
               if ( player.五色祭坛 !== 1) {
              e.reply('你并没有找到五色祭坛');
              return;
          }
if (player.五色祭坛激活 !== 1) {
        const xiuweiCost =  10000000;
        const qixueCost =  15000000;

        // 检查修为和血气是否足够
        if (player.修为 < xiuweiCost) {
            return e.reply([
                `【修为不足】`,
                `当前修为：${player.修为}`,
                `所需修为：${(xiuweiCost)}`,
            ].join('\n'));
        }
        
        if (player.血气 < qixueCost) {
            return e.reply([
                `【血气不足】`,
                `当前血气：${player.血气}`,
                `所需血气：${qixueCost}`,
            ].join('\n'));
        }

        if (!Array.isArray(player.记忆坐标)) player.记忆坐标 = [];
        const hadZhatianMem = player.记忆坐标.includes('遮天位面');
        if (!hadZhatianMem) player.记忆坐标.push('遮天位面');
        e.reply([
            `【五色祭坛激活】`,
            `你以无上法力激活五色祭坛，祭坛绽放璀璨神光`,
            `消耗修为：${xiuweiCost}`,
            `消耗血气：${qixueCost}`,
            hadZhatianMem
                ? `※ 遮天位面坐标：早已铭记于心`
                : `※ 九龙拉棺自带星路，你已记下「遮天位面」坐标，日后可免记坐标直抵`
        ].join('\n'));
        player.五色祭坛激活 = 1
        rememberCoordinate(player, '遮天位面');
        await Write_player(usr_qq, player);
        return;
    }
}


async Xiuxianstate(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    
    // 定义位置状态映射
    const PLACE_STATES = {
        0: "凡间",
        1: "仙界",
        1.5:'下界八域',
        2: "遮天位面",
        2.5: "九天十地",
        3: "界海",
        3.5: "太初星墟",
        4: "时间长河",
        5: "永恒未知之地",
        6: "仙域"
    };
    
    // 获取真身位置
    const truePlace = PLACE_STATES[player.power_place] || "未知之地";
    
    let replyMsg = [
        `【${player.名号}状态】`,
        `真身位置：${truePlace}`,
    ];
    
    // 法身状态
    if (player.法身 === 1) {
        const fashanPlace = PLACE_STATES[player.法身位置] || "未知之地";
        const fashanAction = player.法身行动 || "待命中";
        const fashanStatus = player.法身状态 || "未知";
        
        replyMsg.push(
            `法身位置：${fashanPlace}`
        );
    }
const daoshang = player.道伤 || 0;
if (daoshang > 0) {
    // 将道伤值转换为保留一位小数的字符串
    const formattedDaoshang = parseFloat(daoshang).toFixed(1);
    replyMsg.push(`身披道伤：${formattedDaoshang}`);
}
if (player.火星圣体道痕) {
    replyMsg.push(`身负火星圣体道痕`);
}
// ----- 五色祭坛 -----
replyMsg.push(
    `五色祭坛：${player.五色祭坛 === 1 ? '已寻得' : '未寻得'}`,
    `激活状态：${player.五色祭坛激活 === 1 ? '已激活' : '未激活'}`
);
    // 查询当前行动 - 真身行动
    let trueBodyAction = await redis.get('xiuxian:player:' + usr_qq + ':action');
    if (trueBodyAction) {
        trueBodyAction = JSON.parse(trueBodyAction);
        const now_time = new Date().getTime();
        
        // ==== 修改点：适应新的状态定义 ====
        if (trueBodyAction.Place_actionplus === '0') {
            // 沉迷状态
            const totalEndTime = trueBodyAction.start_time + (trueBodyAction.total_time * 60 * 1000);
            
            if (now_time <= totalEndTime) {
                // 计算整个沉迷的剩余时间
                const remainingMs = totalEndTime - now_time;
                const m = Math.floor(remainingMs / (1000 * 60));
                const s = Math.floor((remainingMs % (1000 * 60)) / 1000);
                
                // 计算进度
                const progress = Math.round((trueBodyAction.settled_count / trueBodyAction.total_count) * 100);
                
                replyMsg.push(
                    `真身正在沉迷【${trueBodyAction.Place_address.name}】`,
                    `进度：${progress}% (${trueBodyAction.settled_count}/${trueBodyAction.total_count})`,
                    `剩余时间：${m}分${s}秒`,
                    `下次结算：${formatTime(trueBodyAction.next_settle_time - now_time)}后`
                );
            } else {
                replyMsg.push(`真身沉迷行动已结束`);
            }
        } else if (now_time <= trueBodyAction.end_time) {
            // 其他行动（闭关、渡劫等）
            const m = Math.floor((trueBodyAction.end_time - now_time) / (1000 * 60));
            const s = Math.floor(((trueBodyAction.end_time - now_time) % (1000 * 60)) / 1000);
            replyMsg.push(
                `真身正在${trueBodyAction.action}中`,
                `剩余时间：${m}分${s}秒`
            );
        } else {
            replyMsg.push(`真身行动已结束`);
        }
    } else {
        replyMsg.push(`真身空闲中`);
    }
    
    // 查询当前行动 - 法身行动
    let fashanAction = await redis.get('xiuxian:player:' + usr_qq + ':action:fashan');
    if (fashanAction) {
        fashanAction = JSON.parse(fashanAction);
        const now_time = new Date().getTime();
        
        if (now_time <= fashanAction.end_time) {
            const m = Math.floor((fashanAction.end_time - now_time) / (1000 * 60));
            const s = Math.floor(((fashanAction.end_time - now_time) % (1000 * 60)) / 1000);
            replyMsg.push(
                `法身正在${fashanAction.action}中`,
                `剩余时间：${m}分${s}秒`
            );
        } else {
            replyMsg.push(`法身行动已结束`);
        }
    } else if (player.法身 === 1) {
        replyMsg.push(`法身空闲中`);
    }
    
    e.reply(replyMsg.join("\n"));
    return false;
}



  //秘境地点
  async Secretplace(e) {
    if (!verc({ e })) return false;
    let addres = '秘境';
    let weizhi = data.didian_list;
    let img=await Goweizhi(e, weizhi, addres);
    e.reply(img)
  }
    async jiutianshidi(e) {
    if (!verc({ e })) return false;
    let addres = '九天十地';
    let weizhi = data.jiutianshidi_list;
    let img=await shangjieweizhi(e, weizhi, addres);
    e.reply(img)
  }
async xunbao(e) {
    if (!verc({ e })) return false;
    
    try {
        // 获取所有寻宝地点数据
        const xunbaoData = data.xunbao_list;
        
        // 获取所有地点名称
        const allPlaceNames = [];
        for (const category in xunbaoData.mapCategories) {
            allPlaceNames.push(...xunbaoData.mapCategories[category]);
        }
        
        // 去重
        const uniquePlaceNames = [...new Set(allPlaceNames)];
        
        // 调用显示函数
        const img = await xunbaoweizhi(e, uniquePlaceNames, "全部寻宝地点");
        
        // 发送图片
        return e.reply(img);
    } catch (error) {
        console.error('显示全部寻宝地点错误:', error);
        return e.reply('❌ 寻宝信息生成失败，请稍后重试');
    }
}
     // === 寻宝分类快捷命令 ===
   async xunbaoFishing(e) {
        if (!verc({ e })) return false;
        const img = await xunbaoCategoryData(e, 'fishing', '🎣钓鱼');
        return e.reply(img);
   }
   async xunbaoLogging(e) {
        if (!verc({ e })) return false;
        const img = await xunbaoCategoryData(e, 'logging', '🪓砍树');
        return e.reply(img);
   }
   async xunbaoFarming(e) {
        if (!verc({ e })) return false;
        const img = await xunbaoCategoryData(e, 'farming', '🌾种植');
        return e.reply(img);
   }
   async xunbaoMining(e) {
        if (!verc({ e })) return false;
        const img = await xunbaoCategoryData(e, 'mining', '⛏️挖矿');
        return e.reply(img);
   }
   async xunbaoSpecial(e) {
        if (!verc({ e })) return false;
        const img = await xunbaoCategoryData(e, 'special', '✨特殊');
        return e.reply(img);
   }
     //遮天位面地点
   async zhetian(e) {
        if (!verc({ e })) return false;
        let addres = "遮天位面";
        let weizhi = data.zhetian_list;
        let img=await zhetianweizhi(e, weizhi, addres);
       e.reply(img)
    }
         //上苍之上
   async shangcang(e) {
        if (!verc({ e })) return false;
        let addres = "上苍之上";
        let weizhi = data.shangcang_list;
        let img=await shangcangweizhi(e, weizhi, addres);
       e.reply(img)
    }
             //上苍之上
   async xiajie(e) {
        if (!verc({ e })) return false;
        let addres = "下界八域";
        let weizhi = data.xiajie_list;
        let img=await xiajieweizhi(e, weizhi, addres);
       e.reply(img)
    }
  //禁地
  async Forbiddenarea(e) {
    if (!verc({ e })) return false;
    let addres = '禁地';
    let weizhi = data.forbiddenarea_list;
    let img=await jindiweizhi(e, weizhi, addres);
    e.reply(img)
  }

  //限定仙府
  async Timeplace(e) {
    if (!verc({ e })) return false;
    e.reply('仙府乃民间传说之地,请自行探索');
  }
  // 界海
async jiehai(e) {
    if (!verc({ e })) return false;
    e.reply("警告：界海！万古诸天以来最凶险之地！曾有帝落时代的准仙帝横渡过去也身陨道消，此后从未有先贤能横渡界海，踏足那里记录！道友若要探索界海请三思！");
}

  //仙境
  async Fairyrealm(e) {
    if (!verc({ e })) return false;
    let addres = '仙境';
    let weizhi = data.Fairyrealm_list;
    let img=await xianjingweizhi(e, weizhi, addres);
    e.reply(img)
  }

async Gojiehaiplace(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
     const player = await Read_player(usr_qq);
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    // 诡异大祭·崩灭检查
    if (isWeiMianDestroyed('界海')) {
        return replyPlaneDestroyed(e, '界海');
    }
      // 检查是否已在目标地点
    if (player.power_place != 3) {
        return e.reply(`你不在界海`);
    }

    
    // 解析指令，获取玩家选择的地点
    const msg = e.msg.replace('#探索界海', '').trim();
    const didian = msg; // 玩家输入的地点
    
    // 检查地点是否存在
    const weizhi = data.jiehai_list .find(item => item.name == didian);
    if (!weizhi) {
        e.reply(`未知的界海地点：${didian}`);
        return false;
    }
    
    // 检查地点境界要求
    if (didian === "接引古殿" && player.mijinglevel_id < 18) {
        e.reply([
            `【境界不足】`,
            `接引古殿乃界海禁地，凶险异常！`,
            `殿内囚禁着仙王元神，回荡着让诸天颤栗的悲鸣！`,
            `以道友目前修为，踏足接引古殿顷刻间便会：`,
            `- 肉身崩解！元神寂灭！真灵永堕！`,
            `待你成就仙王果位，再来探寻这万古大秘！`,
        ].join('\n'));
        return false;
    }
    
    if (didian === "终极古地" && player.mijinglevel_id < 21) {
        e.reply([
            `【境界不足】`,
            `终极古地乃界海最深处，葬着仙帝尸骸！`,
            `黑暗风暴肆虐，诡异低语穿透万古时空！`,
            `以道友目前修为，踏足终极古地顷刻间便会：`,
            `- 肉身崩解！元神寂灭！真灵永堕！`,
            `待你成就仙帝果位，再来探寻这万古大秘！`,
        ].join('\n'));
        return false;
    }
    
    const Price = weizhi.Price;
    
    // 检查灵石是否足够
    if (player.灵石 < Price) {
        e.reply(`没有灵石寸步难行，请道友攒到${Price}灵石才够哦~`);
        return false;
    }
        // 添加破王成帝消息（如果有）
    if (player.破王成帝) {
        player.破王成帝 -= 1;
        e.reply("你破王成帝的桎梏正在松动");
        await Write_player(usr_qq, player);
    }
    player.lastDungeonType = '界海';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    // 扣除灵石
    await Add_灵石(usr_qq, -Price);
    
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let time = 30; // 基础时间（分钟）

    const allMsgs = []; // 收集所有消息
    // 添加前往界海消息
    allMsgs.push(`你沿着帝落时代的无名准仙帝在堤坝留下的脚印前往界海，目标：${didian}`);
     // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    
    // 应用时间减少
    time -= timeReduction;
    
    // 添加时间减少汇总
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            `剩余时间：${time}分钟`,
        ].join('\n'));
    }
    
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: `探索界海`,
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    // 更新任务记录
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
    
    // 使用原键名存储真身行动
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
    
    // 构建主文案
    const playerLevel = player.mijinglevel_id;
    let finalMsg = '';
    
    // 准仙帝文案 (境界20)
    if (playerLevel === 20) {
        if (didian === "接引古殿") {
            finalMsg = [
                `【准仙帝临世·接引古殿】`,
                `你脚踏万道，横渡界海！`,
                `一道压万道，万法皆臣服！`,
                `接引古殿散发诡异黑雾，殿门刻着帝落时代的符文。`,
                `你祭出开创的修炼体系，一道压万道，轰开殿门！`,
                `黑暗物质侵蚀而来，却被你的道则磨灭！`,
                `殿内囚禁着仙王元神，回荡着让诸天颤栗的悲鸣！`,
                `此乃道祖之威！`,
                `${time}分钟后归来！`
            ].join('\n');
        } else {
            finalMsg = [
                `【准仙帝临世·终极古地】`,
                `你横渡界海，万道相随！`,
                `前方浮现终极古地，漂浮着仙帝尸骸，黑暗风暴撕裂诸天！`,
                `你开创的全新体系绽放神光，硬抗黑暗物质侵蚀！`,
                `顶着让仙王颤栗的威压，强势闯入古地深处！`,
                `此地葬着乱古纪元的秘密，此乃道祖之威！`,
                `${time}分钟后见分晓！`
            ].join('\n');
        }
    }
    // 仙帝文案 (境界21)
    else if (playerLevel === 21) {
        if (didian === "接引古殿") {
            finalMsg = [
                `【仙帝临九天·接引古殿】`,
                `你踏足界海，万界共尊！`,
                `眸光开阖间，时空长河为之改道！`,
                `接引古殿散发诡异黑雾，却在你帝威下寸寸崩解！`,
                `你一念花开，万界生灭！`,
                `黑暗物质尚未近身便已湮灭！`,
                `殿内囚禁的仙王元神，在你帝威下瑟瑟发抖！`,
                `此乃仙帝之威！`,
                `${time}分钟后归来！`
            ].join('\n');
        } else {
            finalMsg = [
                `【仙帝临九天·终极古地】`,
                `你横渡界海，诸天共尊！`,
                `前方终极古地，黑暗风暴肆虐，却在你的帝威下平息！`,
                `你眸光所至，仙帝尸骸复苏，却被你一指镇压！`,
                `诡异低语穿透万古，却被你一声冷哼震散！`,
                `此乃路尽级生灵之威！`,
                `${time}分钟后归来！`
            ].join('\n');
        }
    }
    // 祭道及以上文案 (境界>=22)
    else if (playerLevel >= 22) {
        if (didian === "接引古殿") {
            finalMsg = [ 
                `【祭道领域·接引古殿】`,
                `你踏足界海，焚尽规则！`,
                `接引古殿散发诡异黑雾，`,
                `却被你祭掉的大道磨灭！`,
                `你眸光开合，古殿寸寸崩解！`,
                `囚禁的仙王元神在你面前，如蝼蚁般瑟瑟发抖！`,
                `万般因果不加身，古今未来唯你独尊！`,
                `此乃祭道之威！`,
                `${time}分钟后归来！`
            ].join('\n');
        } else {
            finalMsg = [
                `【祭道领域·终极古地】`,
                `你踏足界海，超脱永恒！`,
                `终极古地黑暗风暴肆虐，却被你一个呼吸吹散！`,
                `仙帝尸骸复苏，却被你一念镇压！`,
                `诡异源头低语，却被你一声冷哼震散！`,
                `你凌驾诸天之上，界海亦在你脚下臣服！`,
                `此乃祭道之威！`,
                `${time}分钟后归来！`
            ].join('\n');
        }
    }
    // 默认文案（仙王及以下）
    else {
        if (didian === "接引古殿") {
            finalMsg = [
                `你横渡界海，踏着仙王尸骨前行！`,
                `前方浮现一座残破古殿，散发着诡异黑雾。`,
                `殿门刻着"接引"二字，仿佛在召唤万灵。`,
                `你以无上法力轰开殿门，却被黑暗物质侵蚀，仙体崩裂！元神震荡！`,
                `消耗十万年修为才逼出黑暗物质，终于闯入传说中的接引古殿！`,
                `殿内漂浮着帝落时代的残兵，沉睡着让仙王都颤栗的古老存在！`,
                `此去凶险，望君珍重！`,
                `${time}分钟后归来！`
            ].join('\n');
        } else {
            finalMsg = [
                `你横渡界海，历经万劫！`,
                `踏碎无数残破宇宙，终于抵达终极古地！`,
                `此地漂浮着仙帝尸骸，黑暗风暴肆虐，诡异低语穿透万古时空！`,
                `你燃烧十万年修为，硬抗黑暗物质侵蚀，`,
                `顶着让准仙帝都颤栗的威压，终于闯入古地深处！`,
                `此去九死一生，望君归来！`,
                `${time}分钟后见分晓！`
            ].join('\n');
        }
    }
    
    // 添加主文案
    allMsgs.push(finalMsg);
    

    // 一次性发送所有消息
    e.reply(allMsgs.join('\n\n'));
    return true;
}

async Gosecretplace(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
     const player = await Read_player(usr_qq);
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    // 诡异大祭·崩灭检查
    if (isWeiMianDestroyed('凡间')) {
        return replyPlaneDestroyed(e, '凡间');
    }
      // 检查是否已在目标地点
    if (player.power_place != 0) {
        return e.reply(`你不在凡间`);
    }

    const didian = e.msg.replace('#降临秘境', '').trim();
    const weizhi = data.didian_list.find(item => item.name == didian);
    
    // 检查地点是否存在
    if (!weizhi) {
        e.reply(`未知的秘境：${didian}`);
        return false;
    }
    
    // 获取玩家当前境界
    const now_level_id = data.Level_list.find(
        item => item.level_id == player.level_id
    ).level_id;
    
    // 特殊地点境界检查
    if (didian === "永恒海" && now_level_id < 55) {
        e.reply('没有达到万界道祖之前还是不要去了');
        return false;
    }
    if (didian === "永恒海尽头" && now_level_id < 63) {
        e.reply('没有达到永恒境之前还是不要去了');
        return false;
    }
    
    // 检查资源是否足够
    if (player.灵石 < weizhi.Price) {
        e.reply(`没有灵石寸步难行，攒到${weizhi.Price}灵石才够哦~`);
        return false;
    }
    if (player.寿元 < weizhi.shouyuan) {
        e.reply('道友这点寿元就不要去了吧，免得原地坐化了');
        return false;
    }
    
    // 桃花岛特殊检查
    if (didian === '桃花岛') {
        const exist_B = await exist_hunyin(usr_qq);
        if (!exist_B) {
            e.reply(`还请少侠找到道侣之后再来探索吧`);
            return false;
        }
        const qinmidu = await find_qinmidu(usr_qq, exist_B);
        if (qinmidu < 550) {
            e.reply('少侠还是先和道侣再联络联络感情吧');
            return false;
        }
        await add_qinmidu(usr_qq, exist_B, -50);
    }
    
    // 更新任务记录
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
            player.lastDungeonType = '秘境';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    // 扣除资源
    await Add_寿元(usr_qq, -weizhi.shouyuan);
    await Add_灵石(usr_qq, -weizhi.Price);
    
    // 获取基础时间
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let baseTime = cf.CD.forbiddenarea; // 基础时间（分钟）

    const allMsgs = []; // 收集所有消息
  // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    
    // 添加时间减少汇总
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            // 注意：此时还没有计算最终时间，所以不显示剩余时间
        ].join('\n'));
    }
    
     // ==== 法身系统检查 ====
    if (player.法身 === 1) {
        // 检查法身状态是否为"空闲中"
        if (player.法身状态 === "空闲中") {
            // 法身空闲，使用法身探索
            const time = baseTime - timeReduction; // 法身实际时间
            
            // 更新法身状态
            player.法身位置 = 1; // 秘境位置编号
            player.法身行动 = `探索${didian}`;
            player.法身状态 = `行动中`;
            await Write_player(usr_qq, player);
            
            // 构建法身消息
            const fashanMsg = [
                `【法身代行】`,
                `${player.名号}盘坐永恒未知之地，万古不动，`,
                `一缕法身降临${didian}，代真身探索秘境！`,
                `法身行动：${time}分钟后归来`,
            ];
            allMsgs.push(fashanMsg.join('\n'));
            
            // 设置法身行动状态
            const action_time = 60000 * time; // 持续时间，单位毫秒
            const arr = {
                action: '秘境探索',
                isFashan: true,
                end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
                time: action_time,
                shutup: '1',
                working: '1',
                Place_action: '0',
                Place_actionplus: '1',
                power_up: '1',
                mojie: '1',
                xijie: '1',
                plant: '1',
                mine: '1',
                Place_address: weizhi,
            };
            
            if (e.isGroup) {
                arr.group_id = e.group_id;
            }
            
            await redis.set('xiuxian:player:' + usr_qq + ':action:fashan', JSON.stringify(arr));
            
            // 发送消息
            e.reply(allMsgs.join('\n\n'));
            return true;
        } else {
            // 法身忙碌，显示状态
            const currentAction = await redis.get('xiuxian:player:' + usr_qq + ':action:fashan');
            if (currentAction) {
                const parsedAction = JSON.parse(currentAction);
                if (parsedAction.isFashan && parsedAction.end_time > new Date().getTime()) {
                    const m = parseInt((parsedAction.end_time - new Date().getTime()) / 1000 / 60);
                    const s = parseInt((parsedAction.end_time - new Date().getTime() - m * 60 * 1000) / 1000);
                    e.reply(`法身正在${parsedAction.action}中，剩余时间：${m}分${s}秒`);
                }
            }
            // 注意：这里不返回，继续执行真身逻辑
        }
    }
    
   
    
    // 真身探索的最终时间 = 基础时间 + 位置变化增加的时间 - 减少时间
    const time = baseTime  - timeReduction;
    
    // 添加时间减少汇总中的剩余时间（现在可以计算了）
    if (timeReduction > 0) {
        // 由于前面已经添加了时间减少汇总，我们更新一下，加上剩余时间
        // 但是前面已经添加到allMsgs了，我们可以修改最后一条消息，或者重新构建
        // 为了简单，我们这里直接添加一条剩余时间的消息
        allMsgs.push(`剩余时间：${time}分钟`);
    }
    
    // 添加消耗信息
    allMsgs.push(`${player.名号}消耗了${weizhi.shouyuan}寿元和${weizhi.Price}灵石`);
    
    // 添加主消息
    allMsgs.push(`开始降临${didian}，${time}分钟后归来！`);
    
    // 设置动作状态
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: '秘境历练',
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));

    // 一次性发送所有消息
    e.reply(allMsgs.join('\n\n'));
    return true;
}
async Goxiajie(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
     const player = await Read_player(usr_qq);
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    // 诡异大祭·崩灭检查
    if (isWeiMianDestroyed('下界八域')) {
        return replyPlaneDestroyed(e, '下界八域');
    }
      // 检查是否已在目标地点
    if (player.power_place != 1.5) {
        return e.reply(`你不在下界八域`);
    }

    const didian = e.msg.replace('#前往下界八域', '').trim();
    const weizhi = data.xiajie_list.find(item => item.name == didian);
    
    // 检查地点是否存在
    if (!weizhi) {
        e.reply(`未知的秘境：${didian}`);
        return false;
    }
    
    
    // 特殊地点境界检查
    if (didian === "鲲鹏巢" && player.xiangulevel_id > 4) {
        e.reply('北海鲲鹏巢只有化灵境及以下的修士才能前往');
        return false;
    }
    if (didian === "百断山脉" && player.xiangulevel_id > 3) {
        e.reply('百断山脉只有洞天境及以下的修士才能前往');
        return false;
    }
    
    // 检查资源是否足够
    if (player.灵石 < weizhi.Price) {
        e.reply(`没有灵石寸步难行，攒到${weizhi.Price}灵石才够哦~`);
        return false;
    }
    if (player.寿元 < weizhi.shouyuan) {
        e.reply('道友这点寿元就不要去了吧，免得原地坐化了');
        return false;
    }
    if (player.修为 < weizhi.experience) {
        e.reply('道友的修为不足以前往');
        return false;
    }
    if (player.血气 < weizhi.experience) {
        e.reply('道友的血气不足以前往');
        return false;
    }
    
    // 更新任务记录
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
            player.lastDungeonType = '下界八域';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    // 扣除资源
    await Add_寿元(usr_qq, -weizhi.shouyuan);
    await Add_灵石(usr_qq, -weizhi.Price);
    await Add_修为(usr_qq, -weizhi.experience);
    await Add_血气(usr_qq, -weizhi.experience);
    // 获取基础时间
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let baseTime = cf.CD.xiajie; // 基础时间（分钟）

    const allMsgs = []; // 收集所有消息
  // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    
    // 添加时间减少汇总
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            // 注意：此时还没有计算最终时间，所以不显示剩余时间
        ].join('\n'));
    }
    
    // 真身探索的最终时间 = 基础时间 + 位置变化增加的时间 - 减少时间
    const time = baseTime  - timeReduction;
    
    // 添加时间减少汇总中的剩余时间（现在可以计算了）
    if (timeReduction > 0) {
        allMsgs.push(`剩余时间：${time}分钟`);
    }
    
    // 添加消耗信息
    allMsgs.push(`${player.名号}消耗了${weizhi.shouyuan}寿元和${weizhi.Price}灵石以及${weizhi.experience}修为与血气`);
    
    // 添加主消息
    allMsgs.push(`开始前往${didian}，${time}分钟后归来！`);
    
    // 设置动作状态
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: '下界八域历练',
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));

    // 一次性发送所有消息
    e.reply(allMsgs.join('\n\n'));
    return true;
}
async Gojiutianshidi(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
     const player = await Read_player(usr_qq);
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    // 诡异大祭·崩灭检查
    if (isWeiMianDestroyed('九天十地')) {
        return replyPlaneDestroyed(e, '九天十地');
    }
      // 检查是否已在目标地点
    if (player.power_place != 2.5) {
        return e.reply(`你不在九天十地`);
    }

    const didian = e.msg.replace('#前往九天十地', '').trim();
    const weizhi = data.jiutianshidi_list.find(item => item.name == didian);
    
    // 检查地点是否存在
    if (!weizhi) {
        e.reply(`未知的秘境：${didian}`);
        return false;
    }
    
    // 特殊地点境界检查
    if (didian === "元天秘境" && player.xiangulevel_id > 7) {
        e.reply('元天秘境只有尊者境及以下的修士才能前往');
        return false;
    }
    
    // 检查资源是否足够
    if (player.灵石 < weizhi.Price) {
        e.reply(`没有灵石寸步难行，攒到${weizhi.Price}灵石才够哦~`);
        return false;
    }
    if (player.寿元 < weizhi.shouyuan) {
        e.reply('道友这点寿元就不要去了吧，免得原地坐化了');
        return false;
    }
    if (player.修为 < weizhi.experience) {
        e.reply('道友的修为不足以前往');
        return false;
    }
    if (player.血气 < weizhi.experience) {
        e.reply('道友的血气不足以前往');
        return false;
    }
    
    // 更新任务记录
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
            player.lastDungeonType = '九天十地';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    // 扣除资源
    await Add_寿元(usr_qq, -weizhi.shouyuan);
    await Add_灵石(usr_qq, -weizhi.Price);
    await Add_修为(usr_qq, -weizhi.experience);
    await Add_血气(usr_qq, -weizhi.experience);
    // 获取基础时间
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let baseTime = cf.CD.xiajie; // 基础时间（分钟）

    const allMsgs = []; // 收集所有消息
  // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    
    // 添加时间减少汇总
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            // 注意：此时还没有计算最终时间，所以不显示剩余时间
        ].join('\n'));
    }
    
    // 真身探索的最终时间 = 基础时间 + 位置变化增加的时间 - 减少时间
    const time = baseTime  - timeReduction;
    
    // 添加时间减少汇总中的剩余时间（现在可以计算了）
    if (timeReduction > 0) {
        allMsgs.push(`剩余时间：${time}分钟`);
    }
    
    // 添加消耗信息
    allMsgs.push(`${player.名号}消耗了${weizhi.shouyuan}寿元和${weizhi.Price}灵石以及${weizhi.experience}修为与血气`);
    
    // 添加主消息
    allMsgs.push(`开始前往${didian}，${time}分钟后归来！`);
    
    // 设置动作状态
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: '九天十地历练',
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));

    // 一次性发送所有消息
    e.reply(allMsgs.join('\n\n'));
    return true;
}
async Gozhetian(e) {
    // ==== 初始化部分 ====
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    const allMsgs = []; // 消息收集器（修复点：提前初始化）

    // ==== 基础检查 ====
    const flag = await Go(e);
    if (!flag) return false;

    // 诡异大祭·崩灭检查
    if (isWeiMianDestroyed('遮天位面')) {
        return replyPlaneDestroyed(e, '遮天位面');
    }

    if (player.power_place != 2) {
        allMsgs.push(`你不在遮天位面`);
        return e.reply(allMsgs.join('\n'));
    }

    // ==== 法身系统检查 ====
    if (player.法身 === 1) {
        const nowTime = new Date().getTime();
        
        // 检查法身恢复状态
        if (player.法身恢复时间 && player.法身恢复时间 > nowTime) {
            const remainMinutes = Math.ceil((player.法身恢复时间 - nowTime) / 60000);
            allMsgs.push(`法身正在恢复中，还需${remainMinutes}分钟`);
        } else {
            // 检查法身行动状态
            let isFashanBusy = false;
            const fashanAction = await redis.get('xiuxian:player:' + usr_qq + ':action:fashan');
            
            if (fashanAction) {
                const parsedAction = JSON.parse(fashanAction);
                if (parsedAction.end_time > nowTime) {
                    isFashanBusy = true;
                    const m = parseInt((parsedAction.end_time - nowTime) / 1000 / 60);
                    const s = parseInt((parsedAction.end_time - nowTime - m * 60 * 1000) / 1000);
                    allMsgs.push(`法身正在${parsedAction.action}中，剩余时间：${m}分${s}秒`);
                } else {
                    await redis.del('xiuxian:player:' + usr_qq + ':action:fashan');
                }
            }
            
            // 法身可用时的处理
            if (!isFashanBusy) {
                const didian = e.msg.replace('#前往遮天位面', '').trim();
                const weizhi = data.zhetian_list.find(item => item.name == didian);
                
                if (!weizhi) {
                    allMsgs.push(`未找到地点：${didian}`);
                    return e.reply(allMsgs.join('\n'));
                }

                const inheritanceBlock = getZhetianInheritanceEntryBlock(player, didian);
                if (inheritanceBlock) {
                    allMsgs.push(inheritanceBlock);
                    return e.reply(allMsgs.join('\n'));
                }
                
                // ==== 时间计算 ====
                let time = 12; // 基础时间（分钟）

              // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
                
                // 灵根效果
                switch (player.灵根.type) {
                    case "大成圣体":
                    case "圣体道胎":
                        timeReduction += 2;
                        break;
                }
                
                // 天帝特权
                if (player.di_wei == "天帝") {
                    timeReduction += 2;
                }
                
                time -= timeReduction;
                
                // ==== 更新法身状态 ====
                player.法身位置 = 2;
                player.法身行动 = `探索遮天·${didian}`;
                player.法身状态 = `行动中`;
                await Write_player(usr_qq, player);
                
                // ==== 构建法身消息 ====
                const fashanMsg = [
                    `【法身代行】`,
                    `${player.名号}盘坐永恒未知之地，万古不动，`,
                    `一缕法身降临遮天位面，代真身探索${didian}！`,
                    `法身行动：${time}分钟后归来`
                ];
                allMsgs.push(fashanMsg.join('\n'));
                
                // ==== 设置法身行动 ====
                const action_time = 60000 * time;
                const arr = {
                    action: '法身探索遮天位面',
                    isFashan: true,
                    end_time: nowTime + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
                    time: action_time,
                    shutup: '1',
                    working: '1',
                    Place_action: '0',
                    Place_actionplus: '1',
                    power_up: '1',
                    mojie: '1',
                    xijie: '1',
                    plant: '1',
                    mine: '1',
                    Place_address: weizhi,
                };
                
                if (e.isGroup) {
                    arr.group_id = e.group_id;
                }
                
                await redis.set('xiuxian:player:' + usr_qq + ':action:fashan', JSON.stringify(arr));
                return e.reply(allMsgs.join('\n\n'));
            }
        }
    }

    // ==== 真身探索逻辑 ====
    const didian = e.msg.replace('#前往遮天位面', '').trim();
    const weizhi = data.zhetian_list.find(item => item.name == didian);
    
    if (!weizhi) {
        allMsgs.push(`未找到地点：${didian}`);
        return e.reply(allMsgs.join('\n'));
    }

    const inheritanceBlock = getZhetianInheritanceEntryBlock(player, didian);
    if (inheritanceBlock) {
        allMsgs.push(inheritanceBlock);
        return e.reply(allMsgs.join('\n'));
    }
    

    
    // ==== 资源检查 ====
    let weizhiPrice = weizhi.Price;
    if (player.di_wei == "天帝") {
        weizhiPrice = 0;
        allMsgs.push([
            `【天帝巡视·万道臣服】`,
            `你为诸天共尊的天帝，此刻巡视寰宇！`,
            `万道臣服，邪祟避退，举世无人可阻！`,
        ].join('\n'));
    }
    
    if (player.灵石 < weizhiPrice) {
        allMsgs.push(`没有灵石寸步难行，攒到${weizhiPrice}灵石才够哦~`);
        return e.reply(allMsgs.join('\n'));
    }
    
    if (player.寿元 < weizhi.shouyuan) {
        allMsgs.push('道友这点寿元就不要去了吧，免得原地坐化了');
        return e.reply(allMsgs.join('\n'));
    }
    
    // ==== 星域境界检查 ====
    if (weizhi.Grade === "星域" && player.mijinglevel_id < 12) {
        allMsgs.push(`你的秘境体系尚未达到圣人境，不具备星海遨游之力！`);
        return e.reply(allMsgs.join('\n'));
    }
    
    // ==== 时间计算 ====
    const baseTime = 12;
    let time = baseTime;

    let weizhiExperience = 0;
    // 调用统一方法计算时间缩减
    let { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    
    // ==== 生命禁区特殊处理 ====
    if (weizhi.Grade === "生命禁区") {
        weizhiExperience = weizhi.experience;
        let adjustMsg = "";
        
        switch (player.灵根.type) {
            case "大成圣体":
                weizhiExperience = 0;
                timeReduction+=2;
                adjustMsg = "你为大成圣体，气吞山河君临天下，万邪不侵！";
                break;
            case "大成霸体":
                weizhiExperience = 0;  
                timeReduction+=2; 
                adjustMsg = "你为大成霸体，气吞山河君临天下，万邪不侵！";
                break;    
            case "小成圣体":
                weizhiExperience = Math.ceil(weizhiExperience / 2);
                adjustMsg = "你为小成圣体，血气如龙，堪比古之圣人！";
                break;
            case "圣体":
                weizhiExperience = Math.ceil(weizhiExperience * 0.77);
                adjustMsg = "你为人族圣体，拥有超越常人的体魄！";
                break;
            case "命运":
            case "天魔":
                weizhiExperience = 0;
                adjustMsg = "你为超脱者，三界六道皆在掌控！";
                break;
            case "圣体道胎":
                weizhiExperience = 0;
                timeReduction+=3;
                adjustMsg = "万道共鸣！圣体道胎先天立于不败之地！";
                break;
            case "混沌圣体道胎":
                weizhiExperience = 0;
                timeReduction+=4;
                adjustMsg = "混沌初开，万道共鸣！圣体道胎先天立于不败之地！";
                break;    
            case "大道体":
                weizhiExperience = Math.ceil(weizhiExperience * 0.3);
                timeReduction+=1;
                adjustMsg = "身与道合，言出法随！大道体血脉中流淌着大道印记！";
                break;
            default:
                adjustMsg = "作为普通体质，你需以修为血气为代价！";
        }
        
        
        allMsgs.push(adjustMsg);
        
        // 不死神泉效果
        if (await exist_najie_thing(usr_qq, "不死神泉", "道具")) {
            weizhiExperience = Math.ceil(weizhiExperience * 0.8);
            allMsgs.push("饮下不死神泉，生命禁区的诅咒与道则压制大幅减弱！");
            await Add_najie_thing(usr_qq, "不死神泉", "道具", -1);
        }
        
        // 检查修为和血气
        if (player.修为 < weizhiExperience) {
            allMsgs.push(`你需要积累${weizhiExperience}修为，才能抵抗生命禁区！`);
            return e.reply(allMsgs.join('\n'));
        }
        if (player.血气 < weizhiExperience) {
            allMsgs.push(`你需要积累${weizhiExperience}血气，才能抵抗生命禁区！`);
            return e.reply(allMsgs.join('\n'));
        }
    player.lastDungeonType = '遮天位面';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
        // 扣除资源
        await Add_灵石(usr_qq, -weizhiPrice);
        await Add_修为(usr_qq, -weizhiExperience);
        await Add_血气(usr_qq, -weizhiExperience);
    } else {
            player.lastDungeonType = '遮天位面';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
        await Add_灵石(usr_qq, -weizhiPrice);
        await Add_修为(usr_qq, -weizhiExperience);
        await Add_血气(usr_qq, -weizhiExperience);
    }
    

    
    // ==== 应用时间减少 ====
    time -= timeReduction;
    
    // ==== 时间信息 ====
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            `剩余时间：${time}分钟`,
        ].join('\n'));
    }
    

    
    // ==== 地点描述 ====
    let locationDesc = "";
    if (weizhi.Grade === "生命禁区") {
        switch (didian) {
            case "荒古禁地":
                locationDesc = "警告：此地蕴含无尽诅咒，万古以来无数强者陨落于此！";
                break;
            case "青铜仙殿":
                locationDesc = "青铜仙殿神秘莫测，传闻其中有成仙之秘！";
                break;
            case "太初古矿":
                locationDesc = "太初古矿中神源遍地，但也危机四伏！";
                break;
            case "北斗星紫山":
                locationDesc = "紫山之中有无始大帝的传承，但也封印着太古生物！";
                break;
        }
    } else if (didian === "紫薇星域") {
        locationDesc = "紫薇星域浩瀚无垠，蕴含无尽机缘！";
    }
    
    if (locationDesc) {
        allMsgs.push(locationDesc);
    }
    
    // ==== 任务记录 ====
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
    
    // ==== 扣除寿元 ====
    await Add_寿元(usr_qq, -weizhi.shouyuan);
    
    // ==== 设置行动状态 ====
    const action_time = 60000 * time;
    const arr = {
        action: '遮天位面历练',
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
    
    // ==== 最终消息 ====
    allMsgs.push(`开始前往${didian}，${time}分钟后归来！`);

    // ==== 发送所有消息 ====
    return e.reply(allMsgs.join('\n\n'));
}
async Goforbiddenarea(e) {
    if (!verc({ e })) return false;
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    
    const player = await Read_player(usr_qq);
    
    // 诡异大祭·崩灭检查：玩家当前所在位面被毁则封锁副本
    const planeMap = { 0: '凡间', 1: '仙界', 1.5: '下界八域', 2: '遮天位面', 2.5: '九天十地', 3: '界海', 3.5: '太初星墟', 6: '仙域' };
    const currentPlaneName = planeMap[player.power_place];
    if (currentPlaneName && isWeiMianDestroyed(currentPlaneName)) {
        return replyPlaneDestroyed(e, currentPlaneName);
    }
    
    // ==== 法身系统检查 ====
    if (player.法身 === 1) {
        // 检查法身是否可行动
        const nowTime = new Date().getTime();
        if (player.法身恢复时间 && player.法身恢复时间 > nowTime) {
            const remainMinutes = Math.ceil((player.法身恢复时间 - nowTime) / 60000);
            e.reply(`法身正在恢复中，还需${remainMinutes}分钟`);
            return false;
        }
        
        // 检查法身是否已经在行动中
        let isFashanBusy = false;
        let parsedAction = null;
        
        const fashanAction = await redis.get('xiuxian:player:' + usr_qq + ':action:fashan');
        if (fashanAction) {
            parsedAction = JSON.parse(fashanAction);
            if (parsedAction.end_time > nowTime) {
                isFashanBusy = true;
                const m = parseInt((parsedAction.end_time - nowTime) / 1000 / 60);
                const s = parseInt((parsedAction.end_time - nowTime - m * 60 * 1000) / 1000);
                e.reply(`法身正在${parsedAction.action}中，剩余时间：${m}分${s}秒`);
            } else {
                // 法身行动已结束但未清除
                await redis.del('xiuxian:player:' + usr_qq + ':action:fashan');
            }
        }
        
        // 如果法身不忙碌，则使用法身
        if (!isFashanBusy) {
            // 法身代行
            const didian = e.msg.replace('#前往禁地', '').trim();
            const weizhi = data.forbiddenarea_list.find(item => item.name == didian);
            if (!weizhi) {
                return e.reply(`未找到禁地：${didian}`);
            }
            
            // ===== 添加法身时间减少计算 =====
            let time = 30; // 基础时间（分钟）
            // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
            
            // 应用时间减少
            time -= timeReduction;
            // ===== 结束时间减少计算 =====
            
            // 更新法身状态
            player.法身位置 = 4; // 禁地位置
            player.法身行动 = `探索禁地·${didian}`;
            player.法身状态 = `行动中`;
            
            // 保存玩家数据
            await Write_player(usr_qq, player);
            
            // 构建法身消息
            const fashanMsg = [
                `【法身代行】`,
                `${player.名号}盘坐永恒未知之地，万古不动，`,
                `一缕法身降临禁地，代真身探索${didian}！`,
                `法身行动：${time}分钟后归来`
            ].join("\n");
            
            // 设置法身行动状态
            const action_time = 60000 * time; // 使用计算后的时间
            const arr = {
                action: '法身探索禁地',
                isFashan: true, // 标记为法身行动
                end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
                time: action_time,
                shutup: '1',
                working: '1',
                Place_action: '0',
                Place_actionplus: '1',
                power_up: '1',
                mojie: '1',
                xijie: '1',
                plant: '1',
                mine: '1',
                Place_address: weizhi,
            };
            
            if (e.isGroup) {
                arr.group_id = e.group_id;
            }
            
            // 使用专用键存储法身行动
            await redis.set('xiuxian:player:' + usr_qq + ':action:fashan', JSON.stringify(arr));
            
            e.reply(fashanMsg);
            return true;
        }
    }
    
    // ==== 真身探索逻辑 ====
    const didian = e.msg.replace('#前往禁地', '').trim();
    const weizhi = data.forbiddenarea_list.find(item => item.name == didian);
    
    // 检查地点是否存在
    if (!weizhi) {
        return e.reply(`未找到禁地：${didian}`);
    }
    
    // 获取玩家当前境界
    const now_level_id = data.Level_list.find(
        item => item.level_id == player.level_id
    ).level_id;
    
    // 检查境界要求
    if (now_level_id < 22) {
        return e.reply('没有达到化神之前还是不要去了');
    }
    if (didian == '诸神黄昏·旧神界' && now_level_id < 46) {
        return e.reply('没有达到金仙之前还是不要去了');
    }
    if (didian == '始源·混沌初开之地' && now_level_id < 64) {
        return e.reply('没有达到无境之前还是不要去了');
    }
    
    // 收集所有消息
    const allMsgs = [];

    
    // 特殊玩家处理
    const isSpecialPlayer = usr_qq == '4909071520328015562';
    if (isSpecialPlayer) {
        allMsgs.push([
            `【无上存在·巡视禁地】`,
            `${player.名号}为诸天共尊的无上存在，`,
            `此刻巡视禁地，万道臣服，邪祟避退！`,
        ].join('\n'));
    }
    
    // 检查资源是否足够
    if (!isSpecialPlayer) {
        if (player.灵石 < weizhi.Price) {
            return e.reply(`没有灵石寸步难行，攒到${weizhi.Price}灵石才够哦~`);
        }
        if (player.修为 < weizhi.experience) {
            return e.reply(`你需要积累${weizhi.experience}修为，才能抵抗禁地魔气！`);
        }
    }
    
    if (player.寿元 < weizhi.shouyuan) {
        return e.reply('道友这点寿元就不要去了吧，免得原地坐化了');
    }
    
    // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
            player.lastDungeonType = '禁地';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    // 扣除资源
    await Add_寿元(usr_qq, -weizhi.shouyuan);
    if (!isSpecialPlayer) {
        await Add_灵石(usr_qq, -weizhi.Price);
        await Add_修为(usr_qq, -weizhi.experience); 
    }
    
    // 添加消耗信息
    let costInfo = `消耗：${weizhi.shouyuan}寿元`;
    if (!isSpecialPlayer) {
        costInfo += `，${weizhi.Price}灵石，${weizhi.experience}修为`;
    }
    allMsgs.push(`${player.名号}${costInfo}`);
    
    // 获取基础时间
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let time = cf.CD.forbiddenarea; // 基础时间（分钟）
    

    
    // 应用时间减少
    time -= timeReduction;
    
    // 添加时间减少信息
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            `剩余时间：${time}分钟`,
        ].join('\n'));
    }
    
    // 设置动作状态
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: '禁地历练',
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    // 使用原键名存储真身行动
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
    
    // 根据禁地类型添加特殊描述
    let locationDesc = "";
    switch (didian) {
        case "诸神黄昏·旧神界":
            locationDesc = [
                `【诸神黄昏·旧神界】`,
                `此地曾是神界战场，神血染红大地，神骨铺就道路，`,
                `空气中弥漫着神魔陨落的哀鸣。`,
                `你踏足这片被遗忘的战场，`,
                `感受到远古神魔的怨念在低语，`,
                `破碎的神则碎片在虚空中闪烁。`,
            ].join('\n');
            break;
        case "始源·混沌初开之地":
            locationDesc = [
                `【始源·混沌初开之地】`,
                `混沌初开之地，万物起源之所，`,
                `大道法则在此交织碰撞，形成无数奇观异象。`,
                `你踏入这片混沌未分的领域，`,
                `感受到最原始的大道本源在涌动，`,
                `仿佛回到了开天辟地之初。`,
            ].join('\n');
            break;
        case "幽冥血海":
            locationDesc = [
                `【幽冥血海】`,
                `血海无边，怨魂哀嚎，`,
                `此地汇聚了世间最深的怨念与诅咒。`,
                `你踏入这片血色领域，`,
                `感受到无数怨魂的哀嚎冲击心神，`,
                `血浪翻涌，仿佛要吞噬一切生灵。`,
            ].join('\n');
            break;
        case "九幽魔渊":
            locationDesc = [
                `【九幽魔渊】`,
                `魔气滔天，万魔蛰伏，`,
                `此地是魔道修士的圣地，也是正道修士的噩梦。`,
                `你踏入这片魔气弥漫的深渊，`,
                `感受到无数魔物在黑暗中窥视，`,
                `魔气侵蚀着你的护体神光。`,
            ].join('\n');
            break;
        default:
            locationDesc = [
                `【${didian}】`,
                `禁地之中危机四伏，但也蕴藏着无尽机缘。`,
                `你踏入这片未知的禁地，`,
                `感受到古老而强大的气息在弥漫，`,
                `每一步都需谨慎，每一刻都充满挑战。`,
            ].join('\n');
    }
    
    allMsgs.push(locationDesc);
    
    // 添加主要行动信息
    allMsgs.push(`开始探索${didian}，${time}分钟后归来！`);

    // 一次性发送所有消息
    e.reply(allMsgs.join('\n\n'));
    return true;
}
async GoTimeplace(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    
    const player = await Read_player(usr_qq);
    
    // ==== 法身系统检查 ====
    if (player.法身 === 1) {
        // 检查法身是否可行动
        const nowTime = new Date().getTime();
        if (player.法身恢复时间 && player.法身恢复时间 > nowTime) {
            const remainMinutes = Math.ceil((player.法身恢复时间 - nowTime) / 60000);
            e.reply(`法身正在恢复中，还需${remainMinutes}分钟`);
            return false;
        }
        
        // 检查法身是否已经在行动中
        let isFashanBusy = false;
        let parsedAction = null;
        
        const fashanAction = await redis.get('xiuxian:player:' + usr_qq + ':action:fashan');
        if (fashanAction) {
            parsedAction = JSON.parse(fashanAction);
            if (parsedAction.end_time > nowTime) {
                isFashanBusy = true;
                const m = parseInt((parsedAction.end_time - nowTime) / 1000 / 60);
                const s = parseInt((parsedAction.end_time - nowTime - m * 60 * 1000) / 1000);
                e.reply(`法身正在${parsedAction.action}中，剩余时间：${m}分${s}秒`);
            } else {
                // 法身行动已结束但未清除
                await redis.del('xiuxian:player:' + usr_qq + ':action:fashan');
            }
        }
        
        // 如果法身不忙碌，则使用法身
        if (!isFashanBusy) {
            // 法身代行
            const didianlist = ['无欲天仙', '仙遗之地'];
            const suiji = Math.round(Math.random()); // 随机一个地方
            const didian = didianlist[suiji]; // 赋值
            const weizhi = data.timeplace_list.find(item => item.name == didian);
            
            if (!weizhi) {
                return e.reply(`未找到仙府：${didian}`);
            }
            
            // ===== 添加法身时间减少计算 =====
            const cf = config.getConfig('xiuxian', 'xiuxian');
            let time = cf.CD.timeplace; // 基础时间（分钟）
            // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
            
            // 应用时间减少
            time -= timeReduction;
            // ===== 结束时间减少计算 =====
            
            // 更新法身状态
            player.法身位置 = 5; // 仙府位置
            player.法身行动 = `探索仙府·${didian}`;
            player.法身状态 = `行动中`;
            
            // 保存玩家数据
            await Write_player(usr_qq, player);
            
            // 构建法身消息
            const fashanMsg = [
                `【法身代行】`,
                `${player.名号}盘坐永恒未知之地，万古不动，`,
                `一缕法身降临仙府，代真身探索${didian}！`,
                `法身行动：${time}分钟后归来`
            ].join("\n");
            
            // 设置法身行动状态
            const action_time = 60000 * time; // 使用计算后的时间
            const arr = {
                action: '法身探索仙府',
                isFashan: true, // 标记为法身行动
                end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
                time: action_time,
                shutup: '1',
                working: '1',
                Place_action: '0',
                Place_actionplus: '1',
                power_up: '1',
                mojie: '1',
                xijie: '1',
                plant: '1',
                mine: '1',
                Place_address: weizhi,
            };
            
            if (e.isGroup) {
                arr.group_id = e.group_id;
            }
            
            // 使用专用键存储法身行动
            await redis.set('xiuxian:player:' + usr_qq + ':action:fashan', JSON.stringify(arr));
            
            e.reply(fashanMsg);
            return true;
        }
    }
    
    // ==== 真身探索逻辑 ====
    const didianlist = ['无欲天仙', '仙遗之地'];
    const suiji = Math.round(Math.random()); // 随机一个地方
    const yunqi = Math.random(); // 运气随机数
    await sleep(1000);
    e.reply('你在冲水堂发现有人上架了一份仙府地图');
    const didian = didianlist[suiji]; // 赋值
    
    if (!isNotNull(player.level_id)) {
        e.reply('请先#同步信息');
        return false;
    }
    
    await sleep(1000);
    if (yunqi > 0.9) {
        // 10%寄
        if (player.灵石 < 50000) {
            e.reply('还没看两眼就被看堂的打手撵了出去说:"哪来的穷小子,不买别看"');
            return false;
        }
        
        e.reply(
            '价格为5w,你觉得特别特别便宜,赶紧全款拿下了,历经九九八十天,到了后发现居然是仙湖游乐场！'
        );
        await Add_灵石(usr_qq, -50000);
        return false;
    }
    
    const now_level_id = data.Level_list.find(
        item => item.level_id == player.level_id
    ).level_id;
    
    if (now_level_id < 21) {
        e.reply('到了地图上的地点，结果你发现,你尚未达到化神,无法抵御灵气压制');
        return false;
    }
    
    const weizhi = data.timeplace_list.find(item => item.name == didian);
    if (!weizhi) {
        e.reply('报错！地点错误，请找群主反馈');
        return false;
    }
    
    if (player.灵石 < weizhi.Price) {
        e.reply('你发现标价是' + weizhi.Price + ',你买不起赶紧溜了');
        return false;
    }
    
    if (player.修为 < 100000) {
        e.reply(
            '到了地图上的地点，发现洞府前有一句前人留下的遗言:"至少有10w修为才能抵御仙威！"'
        );
        return false;
    }
    
    let dazhe = 1;
    if (
        (await exist_najie_thing(usr_qq, '仙府通行证', '道具')) &&
        player.魔道值 < 1 &&
        (player.灵根.type == '转生' || player.level_id > 41)
    ) {
        dazhe = 0;
        e.reply(player.名号 + '使用了道具仙府通行证,本次仙府免费');
        await Add_najie_thing(usr_qq, '仙府通行证', '道具', -1);
    }
    
    const Price = weizhi.Price * dazhe;
            player.lastDungeonType = '仙府';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    await Add_灵石(usr_qq, -Price);
    await Add_修为(usr_qq, -100000);
    
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let time = cf.CD.timeplace; // 时间（分钟）
     // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    // 应用时间减少
    time -= timeReduction;
    
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: '探索仙府', // 动作
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    // 更新任务记录
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
    
    // 使用原键名存储真身行动
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
    
    // 构建回复消息
    let replyMsg = '';
    if (suiji === 0) {
        replyMsg = '你买下了那份地图,历经九九八十一天,终于到达了地图上的仙府,洞府上模糊得刻着[' +
            weizhi.name +
            '仙府]你兴奋地冲进去探索机缘,被强大的仙气压制，消耗了100000修为成功突破封锁闯了进去' +
            time +
            '分钟后归来!';
    } else {
        replyMsg = '你买下了那份地图,历经九九八十一天,终于到达了地图上的地点,这座洞府仿佛是上个末法时代某个仙人留下的遗迹,你兴奋地冲进去探索机缘,被强大的仙气压制，消耗了100000修为成功突破封锁闯了进去' +
            time +
            '分钟后归来!';
    }

    e.reply(replyMsg);
    return false;
}

async Gofairyrealm(e) {
    if (!verc({ e })) return false;
    
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
    // 诡异大祭·崩灭检查
    if (isWeiMianDestroyed('仙界')) {
        return replyPlaneDestroyed(e, '仙界');
    }
     // 检查是否已在目标地点
    if (player.power_place != 1) {
        return e.reply(`你不在仙界`);
    }
    
    const didian = e.msg.replace('#镇守仙境', '').trim();
    
    // 获取仙境信息
    const weizhi = data.Fairyrealm_list.find(item => item.name == didian);
    if (!weizhi) {
        return e.reply(`未找到仙境：${didian}`);
    }
    
    // 收集所有消息
    const allMsgs = [];
    
    // ==== 原有判断条件保持不变 ====
    // 检查等级要求
    const now_level_id = data.Level_list.find(
        item => item.level_id == player.level_id
    ).level_id;
    
    // 境界不足检查
    if (now_level_id < 42 && player.lunhui == 0) {
        return e.reply([
            `【轮回未启】`,
            `仙境乃仙人之地，非成仙者不可入！`,
            `道友当前并未成仙，无法踏足仙境。`,
        ].join('\n'));
    }
    
    if (didian == "杀神崖" && now_level_id < 50) {
        return e.reply([
            `【境界不足】`,
            `杀神崖乃仙王喋血之地，`,
            `非究极仙王不可踏足！`,
            `道友当前境界不足，请谨慎行事。`,
        ].join('\n'));
    }
    
    // 特殊仙境检查
    if (didian == "诸天") {
        if (player.灵根.name !== "九转轮回体" && player.灵根.name !== "命运神道体"&& player.灵根.type !== "神魔体") {
            return e.reply([
                `【轮回者专属】`,
                `诸天乃轮回之地，`,
                `只有真正圆满的轮回者方可踏足！`,
                `道友轮回未达圆满，无法进入。`,
            ].join('\n'));
        }
    }
    
    if (didian == "真魔殿") {
        if (player.灵根.name !== "九重魔功" && player.灵根.name !== "极道天魔"&& player.灵根.type !== "神魔体") {
            return e.reply([
                `【真魔专属】`,
                `真魔殿乃万魔朝圣之地，`,
                `只有真正极致之魔才能踏足！`,
                `道友魔中巨擘，无法进入。`,
            ].join('\n'));
        }
    }
        if (didian == "光阴之外") {
        if (player.灵根.type !== "命运" && player.灵根.type !== "天魔"&& player.灵根.type !== "神魔体") {
            return e.reply([
                `【超脱者专属】`,
                `光阴之外乃超越极限之地，`,
                `只有真正的超脱者才能踏足！`,
                `道友非超脱者，无法进入。`,
            ].join('\n'));
        }
    }
    // 检查资源是否足够
    if (player.灵石 < weizhi.Price) {
        return e.reply(`没有灵石寸步难行，攒到${weizhi.Price}灵石才够哦~`);
    }
    if (player.寿元 < weizhi.shouyuan) {
        return e.reply('道友这点寿元就不要去了吧，免得原地坐化了');
    }
    
    // 特殊仙境处理
let specialMsg = "";
if (didian === "往世星海") {
    const shenyu = await exist_najie_thing(usr_qq, "群星秘钥", "道具");
    if (!shenyu || shenyu < 1) {
        return e.reply("群星秘钥缺失，星海之门拒绝开启。");
    }
    if (player.level_id <= 54) {
        return e.reply("万界道祖方可踏入星海，当前境界不足。");
    }
    await Add_najie_thing(usr_qq, "群星秘钥", "道具", -1);
    specialMsg = [
        `【星海归航】`,
        `你以群星秘钥叩响天穹，亿万星辉垂落，`,
        `混沌海分开一条璀璨光道，直指星海核心。`,
        `刹那之间，神魂超脱万界，抵达往世星海！`
    ].join('\n');
    allMsgs.push(specialMsg);
}

    if (didian === "神域星宫") {
        const shenyu = await exist_najie_thing(usr_qq, "神域令牌", "道具");
        if (!shenyu || shenyu < 1) {
            return e.reply("你需要神域令牌才能前往神域星宫");
        }
        if (player.level_id <= 54) {
            return e.reply("只有万界道祖级强者才能前往天外天");
        }
        await Add_najie_thing(usr_qq, "神域令牌", "道具", -1);
        specialMsg = [
            `【神域感召】`,
            `${player.名号}消耗了1个神域令牌，`,
            `神魂受到神域主宰感召指引，`,
            `脱离万界遨游混沌海前往神域星宫！`,
        ].join('\n');
        allMsgs.push(specialMsg);
    }
    
    if (didian === "瑞泽云海") {
        const xianzhou = await exist_najie_thing(usr_qq, "仙舟", "道具");
        if (!xianzhou || xianzhou < 1) {
            return e.reply("你需要仙舟才能前往瑞泽云海");
        }
        await Add_najie_thing(usr_qq, "仙舟", "道具", -1);
        specialMsg = [
            `【仙舟渡海】`,
            `${player.名号}乘坐仙舟，`,
            `穿越云海，寻找仙兽们留下的福泽！`,
        ].join('\n');
        allMsgs.push(specialMsg);
    }
    
    // 折扣处理
    let dazhe = 1; // 默认无折扣
    let discountMsg = "";
    
    if (didian === '杀神崖') {
        if (await exist_najie_thing(usr_qq, '杀神崖通行证', '道具') && 
            player.魔道值 < 1 && 
            (player.灵根.type == '转生' || player.level_id > 41)) {
            dazhe = 0;
            discountMsg = [
                `【通行证特权】`,
                `${player.名号}使用了杀神崖通行证，`,
                `本次镇守免费！`,
            ].join('\n');
            await Add_najie_thing(usr_qq, '杀神崖通行证', '道具', -1);
        }
    } else {
        if (await exist_najie_thing(usr_qq, '仙境优惠券', '道具') && 
            player.魔道值 < 1 && 
            (player.灵根.type == '转生' || player.level_id > 41)) {
            dazhe = 0.5;
            discountMsg = [
                `【优惠券特权】`,
                `${player.名号}使用了仙境优惠券，`,
                `本次消耗减少50%！`,
            ].join('\n');
            await Add_najie_thing(usr_qq, '仙境优惠券', '道具', -1);
        }
    }
    
    if (discountMsg) {
        allMsgs.push(discountMsg);
    }
    
    // 调用统一方法计算时间缩减
    const { timeReduction, msgs } = await calculateTimeReduction(player);
    allMsgs.push(...msgs);
    
    // 计算实际消耗
    let Price = Math.floor(weizhi.Price * dazhe);
    let shouyuan = weizhi.shouyuan;
            player.lastDungeonType = '仙境';
    player.lastDungeonName = didian;
    await Write_player(usr_qq, player);
    // 扣除资源
    await Add_灵石(usr_qq, -Price);
    await Add_寿元(usr_qq, -shouyuan);
    
    // 收集消耗信息
    let costInfo = `消耗：${shouyuan}寿元`;
    if (Price > 0) {
        costInfo += `，${Price}灵石`;
    }
    allMsgs.push(`${player.名号}${costInfo}`);
    
    // 更新任务记录
    const A = await channel(e.user_id);
    await Add_renwu_progress(A, 'jilu3');
    
    // 获取基础时间
    const cf = config.getConfig('xiuxian', 'xiuxian');
    let time = cf.CD.secretplace; // 基础时间（分钟）

    
    // ==== 法身系统检查 ====
    if (player.法身 === 1) {
        // 检查法身是否可行动
        const nowTime = new Date().getTime();
        if (player.法身恢复时间 && player.法身恢复时间 > nowTime) {
            const remainMinutes = Math.ceil((player.法身恢复时间 - nowTime) / 60000);
            e.reply(`法身正在恢复中，还需${remainMinutes}分钟`);
            // 不返回，继续执行真身逻辑
        } else {
            // 检查法身是否已经在行动中
            let isFashanBusy = false;
            let parsedAction = null;
            
            const fashanAction = await redis.get('xiuxian:player:' + usr_qq + ':action:fashan');
            if (fashanAction) {
                parsedAction = JSON.parse(fashanAction);
                if (parsedAction.end_time > nowTime) {
                    isFashanBusy = true;
                    const m = parseInt((parsedAction.end_time - nowTime) / 1000 / 60);
                    const s = parseInt((parsedAction.end_time - nowTime - m * 60 * 1000) / 1000);
                    e.reply(`法身正在${parsedAction.action}中，剩余时间：${m}分${s}秒`);
                } else {
                    // 法身行动已结束但未清除
                    await redis.del('xiuxian:player:' + usr_qq + ':action:fashan');
                }
            }
            
            // 如果法身不忙碌，则使用法身
            if (!isFashanBusy) {
                // 法身代行
                const fashanTime = time - timeReduction; // 法身实际时间
                
                // 更新法身状态
                player.法身位置 = 0; // 仙境位置编号
                player.法身行动 = `镇守仙境·${didian}`;
                player.法身状态 = `行动中`;
                
                // 保存玩家数据
                await Write_player(usr_qq, player);
                
                // 构建法身消息
                const fashanMsg = [
                    `【法身代行】`,
                    `${player.名号}盘坐永恒未知之地，万古不动，`,
                    `一缕法身降临仙境，代真身镇守${didian}！`,
                    `法身行动：${fashanTime}分钟后归来`
                ].join("\n");
                allMsgs.push(fashanMsg);
                
                // 设置法身行动状态
                const action_time = 60000 * fashanTime; // 持续时间，单位毫秒
                const arr = {
                    action: '法身镇守仙境',
                    isFashan: true,
                    end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
                    time: action_time,
                    shutup: '1',
                    working: '1',
                    Place_action: '0',
                    Place_actionplus: '1',
                    power_up: '1',
                    mojie: '1',
                    xijie: '1',
                    plant: '1',
                    mine: '1',
                    Place_address: weizhi,
                };
                
                if (e.isGroup) {
                    arr.group_id = e.group_id;
                }
                
                await redis.set('xiuxian:player:' + usr_qq + ':action:fashan', JSON.stringify(arr));
                
                // 发送消息
                e.reply(allMsgs.join('\n\n'));
                return true;
            }
        }
    }
    
 
    
    // 应用时间减少
    time = time  - timeReduction;
    
    // 添加时间减少汇总
    if (timeReduction > 0) {
        allMsgs.push([
            `【时间缩减】`,
            `总计减少：${timeReduction}分钟`,
            `剩余时间：${time}分钟`,
        ].join('\n'));
    }
    
    // 设置行动状态
    const action_time = 60000 * time; // 持续时间，单位毫秒
    const arr = {
        action: '镇守仙境',
        end_time: new Date().getTime() + Math.floor(action_time * getDungeonTimedActionMultiplier(player)),
        time: action_time,
        shutup: '1',
        working: '1',
        Place_action: '0',
        Place_actionplus: '1',
        power_up: '1',
        mojie: '1',
        xijie: '1',
        plant: '1',
        mine: '1',
        Place_address: weizhi,
    };
    
    if (e.isGroup) {
        arr.group_id = e.group_id;
    }
    
    // 使用原键名存储真身行动
    await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
    
    // 根据仙境类型添加特殊描述
    let locationDesc = "";
    switch (didian) {
        case "神域星宫":
            locationDesc = [
                `【神域星宫·混沌之巅】`,
                `神域星宫悬浮于混沌海之上，`,
                `是诸天万界至高无上的存在！`,
                `镇守此地可获得神域主宰的恩赐，`,
                `沐浴混沌神光，感悟无上大道！`,
            ].join('\n');
            break;
        case "瑞泽云海":
            locationDesc = [
                `【瑞泽云海·仙兽福地】`,
                `瑞泽云海祥云缭绕，瑞气千条，`,
                `曾是仙兽栖息之地！`,
                `镇守此地可寻得仙兽遗留的福泽，`,
                `沐浴祥瑞之气，感悟生命真谛！`,
            ].join('\n');
            break;
        case "瑶池仙境":
            locationDesc = [
                `【瑶池仙境·仙家福地】`,
                `瑶池仙境仙气缭绕，琼楼玉宇，`,
                `蟠桃仙树遍地，灵泉涌动！`,
                `镇守此地可沐浴仙光，洗涤凡尘，`,
                `延年益寿，感悟长生之道！`,
            ].join('\n');
            break;
        case "蓬莱仙岛":
            locationDesc = [
                `【蓬莱仙岛·长生秘境】`,
                `蓬莱仙岛隐于东海，仙草遍地，`,
                `灵泉涌动，仙鹤翱翔！`,
                `镇守此地可感悟长生之道，`,
                `采仙草，饮灵泉，逍遥自在！`,
            ].join('\n');
            break;
        case "杀神崖":
            locationDesc = [
                `【杀神崖·仙王喋血】`,
                `杀神崖上，仙王喋血，神骨铺路！`,
                `此地弥漫着无尽杀伐之气！`,
                `镇守此地可感悟杀伐之道，`,
                `磨砺意志，淬炼神魂！`,
            ].join('\n');
            break;
        default:
            locationDesc = [
                `【仙境镇守】`,
                `仙境之中灵气充沛，`,
                `是修行悟道的绝佳之地！`,
                `镇守此地可感悟天地大道，`,
                `提升修为，淬炼道心！`,
            ].join('\n');
    }
    
    allMsgs.push(locationDesc);
    
    // 添加主要行动信息
    allMsgs.push(`开始镇守${didian}，${time}分钟后归来！`);

    // 一次性发送所有消息
    e.reply(allMsgs.join('\n\n'));
    return true;
}

  async Giveup(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
      e.reply('没存档你逃个锤子!');
      return false;
    }
      // 读取玩家数据
    const player = await Read_player(usr_qq);
    
   
    //获取游戏状态
    let game_action = await redis.get(
      'xiuxian:player:' + usr_qq + ':game_action'
    );
    //防止继续其他娱乐行为
    if (game_action == 0) {
      e.reply('修仙：游戏进行中...');
      return false;
    }
    // 查询redis中的人物动作
let action = await redis.get('xiuxian:player:' + usr_qq + ':action');
action = JSON.parse(action);

// 不为空，有状态
if (action != null) {
            if (action.action === '探索界海') {
            const weizhi = action.Place_address;
            const now_time = new Date().getTime();
           const remaining_time = action.end_time - now_time; // 剩余毫秒数
    const remaining_minutes = Math.floor(remaining_time / (1000 * 60));
    const remaining_seconds = Math.floor((remaining_time % (1000 * 60)) / 1000);
    
    e.reply([
        `【界海·无路可退】`,
        `你身处界海深处，前有黑暗风暴肆虐，后有诡异低语回荡！`,
        `界海浩瀚无垠，时空错乱，一旦踏入便无回头之路！`,
        ``,
        `黑暗物质如潮水般涌来，诡异源头在低语：`,
        `"既入界海，便为祭品！"`,
        ``,
        `你已前行${elapsed_minutes}分${elapsed_seconds}秒，但退路早已被时空乱流吞噬！`,
        `界海堤坝上，帝落时代的脚印已被黑暗潮汐抹去！`,
        ``,
        `此刻，唯有前行！`,
        `待探索完成（${remaining_minutes}分${remaining_seconds}秒后），方有归途！`,
        ``,
        `界海凶险，万古皆寂！`,
        `准仙帝踏入亦九死一生，仙王骸骨铺就前路！`,
        `既已踏足，唯有血战到底！`,
    ].join('\n'));
    return false;}
    // 处理传送任务（位面传送）的取消
    if (action.action === '位面传送') {
        // 删除传送任务
        await redis.del(`xiuxian:travel_task:${usr_qq}`);
        
        // 清除行动状态
        await redis.del(`xiuxian:player:${usr_qq}:action`);
        
        // 计算已消耗的时间比例
        const now = Date.now();
        const elapsed = now - action.start_time;
        const totalTime = action.end_time - action.start_time;
        const progress = Math.min(1, elapsed / totalTime);
        
        // 部分返还资源（根据进度）
        const xiuweiRefund = Math.floor(action.xiuwei_cost * (1 - progress) * 0.5); // 返还50%的剩余资源
        const qixueRefund = Math.floor(action.qixue_cost * (1 - progress) * 0.5);
        const shouyuanRefund = Math.floor(action.shouyuan_cost * (1 - progress) * 0.5);
        // 更新玩家资源，并恢复位置到出发地
        const player = await Read_player(usr_qq);
        player.power_place = action.from_location; // 逃离后回到出发地，防止直接到达目标位面的bug
        player.修为 += xiuweiRefund;
        player.血气 += qixueRefund;
         player.寿元 += shouyuanRefund;
        await Write_player(usr_qq, player);
        
        // 构建消息
        const refundMsg = [];
        if (xiuweiRefund > 0) {
            refundMsg.push(`返还修为：${xiuweiRefund}`);
        }
        if (qixueRefund > 0) {
            refundMsg.push(`返还血气：${qixueRefund}`);
        }
        if (shouyuanRefund > 0) {
            refundMsg.push(`返还寿元：${shouyuanRefund}`);
        }
        e.reply([
            `【强行中断·位面穿梭】`,
            `你强行中断了从${action.from_name}到${action.to_name}的传送！`,
            `空间通道崩塌，你被甩出虚空乱流`,
            ...refundMsg,
            `警告：强行中断传送可能导致修为受损，请谨慎使用！`
        ].join('\n'));
        
        return false;
    }
    
    // 处理秘境状态的取消（原有逻辑）
    if (
        action.Place_action == '0' ||
        action.Place_actionplus == '0' ||
        action.mojie == '0'
    ) {
        // 把状态都关了
        let arr = action;
        arr.is_jiesuan = 1; // 结算状态
        arr.shutup = 1; // 闭关状态
        arr.working = 1; // 降妖状态
        arr.power_up = 1; // 渡劫状态
        arr.Place_action = 1; // 秘境
        arr.Place_actionplus = 1; // 状态
        arr.mojie = 1;
        arr.end_time = new Date().getTime(); // 结束的时间也修改为当前时间
        delete arr.group_id; // 结算完去除group_id
        
        await redis.set(
            'xiuxian:player:' + usr_qq + ':action',
            JSON.stringify(arr)
        );
        
        e.reply('你已逃离秘境！');
        return false;
    }
}
    return false;
  }
  async quickReplay(e) {
  if (!verc({ e })) return false;

    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
  const player = await Read_player(usr_qq);

  // 读玩家自身记录的快捷副本
  const { lastDungeonType: type, lastDungeonName: place } = player;
  if (!type || !place) {
    return e.reply('你还没有下过任何副本，请先使用完整指令（如#降临秘境灵墟洞天）');
  }

  // 拼出完整指令
  const cmdMap = {
    秘境:     `#降临秘境${place}`,
    禁地:     `#前往禁地${place}`,
    遮天位面: `#前往遮天位面${place}`,
    下界八域: `#前往下界八域${place}`,
    九天十地: `#前往九天十地${place}`,
    仙境:     `#镇守仙境${place}`,
    界海:     `#探索界海${place}`,
    仙府:     `#探索仙府`,      // 仙府本身不带地名
  };
  const fullCmd = cmdMap[type];
  if (!fullCmd) return e.reply('记录的副本类型异常，请重新使用完整指令');

  // 直接复用原逻辑
  e.msg = fullCmd;

  // 重新分发
  if (type === '秘境')     return this.Gosecretplace(e);
  if (type === '禁地')     return this.Goforbiddenarea(e);
  if (type === '遮天位面') return this.Gozhetian(e);
  if (type === '下界八域') return this.Goxiajie(e);
  if (type === '九天十地') return this.Gojiutianshidi(e);
  if (type === '仙境')     return this.Gofairyrealm(e);
  if (type === '界海')     return this.Gojiehaiplace(e);
  if (type === '仙府')     return this.GoTimeplace(e);
}
// 接引玩家功能
async jieyinPlayer(e) {
  // 群聊限定
  if (!e.isGroup) {
    e.reply('修仙游戏请在群聊中游玩');
    return;
  }

  let usr_qq = e.user_id.toString().replace('qg_', '');
  usr_qq = await channel(usr_qq);
  const player = await Read_player(usr_qq);

  // 检查操作者境界（仙王）
  if (player.mijinglevel_id < 18) {
    return e.reply([
      `【接引失败·境界不足】`,
      `唯有仙王级强者方可施展接引神通！`,
      `你当前秘境等级：${player.mijinglevel_id}级`,
      `需达到18级（仙王）方可接引其他道友。`
    ].join('\n'));
  }

  // 检查是否有艾特信息
  const atItems = e.message.filter(item => item.type === "at");
  if (atItems.length === 0) {
    return e.reply("请艾特需要接引的玩家");
  }

  let targetQQ = atItems[0].qq.toString().replace('qg_', '');
  targetQQ = await channel(targetQQ);

  if (targetQQ === usr_qq) {
    return e.reply("不可接引自身，请艾特其他道友");
  }

  if (!await existplayer(targetQQ)) {
    return e.reply("目标玩家不存在，请先创建角色");
  }

  const targetPlayer = await Read_player(targetQQ);

  // 接引目标位面 = 接引者当前位面
  const targetLocationName = Object.keys(PLACE_LOCATION_MAP).find(key => PLACE_LOCATION_MAP[key] === player.power_place);
  if (!targetLocationName) {
    return e.reply([
      `【接引失败·坐标迷失】`,
      `你当前所处的位面不在已知星图之中，无法锚定接引坐标。`
    ].join('\n'));
  }

  // 锁1：目标位面准入（复用 goToLocation 同一套门槛）
  if (isWeiMianDestroyed(targetLocationName)) {
    return e.reply(buildPlaneDestroyedMsgs(targetLocationName));
  }
  const threshold = await this.checkLocationThreshold(targetPlayer, targetLocationName);
  if (!threshold.ok) {
    return e.reply([
      `【接引失败·位面壁垒】`,
      `道友${targetPlayer.名号 || targetQQ}无法承受${targetLocationName}的位面法则：`,
      ``,
      ...threshold.msgs
    ].join('\n'));
  }

  // 锁0：接引者须已知目标位面坐标（仙王需记住自己所处位面）
  if (!hasCoordinate(player, targetLocationName)) {
    return e.reply([
      `【接引失败·星路未知】`,
      `你竟不知自己所处「${targetLocationName}」的星空坐标，`,
      `无从锚定接引通道，接引中止。`,
      `※ 先以 #记坐标 ${targetLocationName} 记下坐标。`
    ].join('\n'));
  }

  // 锁3（续）：目标是否正处于传送/秘境等动作中
  const targetBusy = await this._getPlayerAction(targetQQ);
  if (targetBusy) {
    return e.reply([
      `【接引失败·真身忙碌】`,
      `道友${targetPlayer.名号 || targetQQ}正在${targetBusy}，`,
      `此刻强行接引恐扰动其道基，请待其归位后再试。`
    ].join('\n'));
  }

  // 锁2：发起请求，等待目标 #同意接引 确认（60秒）
  setPendingJieyin(targetQQ, {
    fromQQ: usr_qq,
    fromName: player.名号 || usr_qq,
    type: 'jieyin',
    locationName: targetLocationName
  });

  return e.reply([
    `【仙王神通·接引道友】`,
    `${player.名号 || usr_qq}欲将${targetPlayer.名号 || targetQQ}接引至${targetLocationName}。`,
    ``,
    `⏳ 等待${targetPlayer.名号 || targetQQ}在60秒内发送 #同意接引 确认。`,
    `（超时则请求失效，需重新发起）`
  ].join('\n'));
}



// 送往玩家功能
async sendPlayerToLocation(e) {
  // 群聊限定
  if (!e.isGroup) {
    e.reply('修仙游戏请在群聊中游玩');
    return;
  }

  let usr_qq = e.user_id.toString().replace('qg_', '');
  usr_qq = await channel(usr_qq);
  const player = await Read_player(usr_qq);

  // 检查操作者境界（仙王）
  if (player.mijinglevel_id < 18) {
    return e.reply([
      `【传送失败·境界不足】`,
      `唯有仙王级强者方可施展传送神通！`,
      `你当前秘境等级：${player.mijinglevel_id}级`,
      `需达到18级（仙王）方可传送其他道友。`
    ].join('\n'));
  }

  // 检查是否有艾特信息
  const atItems = e.message.filter(item => item.type === "at");
  if (atItems.length === 0) {
    return e.reply("请艾特需要传送的玩家");
  }

  let targetQQ = atItems[0].qq.toString().replace('qg_', '');
  targetQQ = await channel(targetQQ);

  if (targetQQ === usr_qq) {
    return e.reply("不可传送自身，请艾特其他道友");
  }

  // 处理消息内容：去掉指令前缀和所有艾特
  let content = e.msg.replace(/^#送往\s*/, '');
  content = content.replace(/\[CQ:at,qq=\d+\]\s*/g, '');
  const location = content.trim();

  // 如果没有提取到地点名称，提示用户输入
  if (!location) {
    return e.reply("请指定要传送的目标地点，例如：#送往 @QQ号 凡间");
  }

  // 检查是否有效地点（统一引用 PLACE_LOCATION_MAP）
  if (!PLACE_LOCATION_MAP.hasOwnProperty(location)) {
    return e.reply(`无效地点：${location}\n可用地点：${Object.keys(PLACE_LOCATION_MAP).join('、')}`);
  }

  if (!await existplayer(targetQQ)) {
    return e.reply("目标玩家不存在，请先创建角色");
  }

  const targetPlayer = await Read_player(targetQQ);

  // 锁1：目标位面准入（复用 goToLocation 同一套门槛，覆盖全部位面）
  if (isWeiMianDestroyed(location)) {
    return e.reply(buildPlaneDestroyedMsgs(location));
  }
  const threshold = await this.checkLocationThreshold(targetPlayer, location);
  if (!threshold.ok) {
    return e.reply([
      `【传送失败·位面壁垒】`,
      `道友${targetPlayer.名号 || targetQQ}无法承受${location}的位面法则：`,
      ``,      ...threshold.msgs
    ].join('\n'));
  }

  // 锁0：施法者（仙王）须已知目标位面坐标
  if (!hasCoordinate(player, location)) {
    return e.reply([
      `【传送失败·星路未知】`,
      `你竟不知「${location}」的星空坐标，无从锚定传送通道。`,
      `※ 先以 #记坐标 ${location} 记下该位面坐标。`
    ].join('\n'));
  }

  // 锁3（续）：目标是否正处于传送/秘境等动作中
  const targetBusy = await this._getPlayerAction(targetQQ);
  if (targetBusy) {
    return e.reply([
      `【传送失败·真身忙碌】`,
      `道友${targetPlayer.名号 || targetQQ}正在${targetBusy}，`,
      `此刻强行传送恐扰动其道基，请待其归位后再试。`
    ].join('\n'));
  }

  // 锁2：发起请求，等待目标 #同意接引 确认（60秒）
  setPendingJieyin(targetQQ, {
    fromQQ: usr_qq,
    fromName: player.名号 || usr_qq,
    type: 'songwang',
    locationName: location
  });

  return e.reply([
    `【仙王神通·传送道友】`,
    `${player.名号 || usr_qq}欲将${targetPlayer.名号 || targetQQ}送往${location}。`,
    ``,
    `⏳ 等待${targetPlayer.名号 || targetQQ}在60秒内发送 #同意接引 确认。`,
    `（超时则请求失效，需重新发起）`
  ].join('\n'));
}

// ==================== 接引/送往·共用门槛与确认逻辑 ====================
// 位面准入门槛检查（与 goToLocation 完全一致的判定逻辑，单一真相源）
async checkLocationThreshold(player, location) {
    const threshold = getLocationThreshold(player, location);
    if (location === '小阴间' && threshold.code === 'shengxu') {
        return { ok: false, msgs: [
            `【小阴间·进化坐标未显】`,
            `这片天地只响应花粉进化路的生命波动。`,
            `需先以 #踏上花粉路 选择体系，并至少进化至觉醒境。`
        ] };
    }
    if (location === '大阴间' && threshold.code === 'dayinjian') {
        return { ok: false, msgs: [
            `【大阴间·境界不足】`,
            `大阴间的堕落气息会侵蚀未至神祇境的生命。`,
            `需花粉路进化至神祇境（12级）方可深入。`
        ] };
    }
    if (location === '阳间' && threshold.code === 'yangjian') {
        return { ok: false, msgs: [
            `【阳间·境界不足】`,
            `阳间法则完整而狂暴，神王境之下难以立足。`,
            `需花粉路进化至神王境（14级）方可踏足。`
        ] };
    }
    // 时间长河：准仙帝
    if (location === '时间长河') {
        if (threshold.code === 'time-river') {
            return { ok: false, msgs: [
                `【时间长河·境界不足】`,
                `时间长河乃万古岁月汇聚之地，`,
                `唯有准仙帝级强者方可踏足！`,
                `你当前境界不足，无法进入。`,
            ] };
        }
    }
    // 永恒未知之地：仙帝
    if (location === '永恒未知之地') {
        if (threshold.code === 'eternal-land') {
            return { ok: false, msgs: [
                `【永恒未知之地·境界不足】`,
                `永恒未知之地乃超脱诸天之外的存在，`,
                `唯有仙帝级强者方可踏足！`,
                `你当前境界不足，无法进入。`,
            ] };
        }
    }
    // 仙界：需成仙（轮回开启或境界达标）
    if (location === '仙界') {
        if (threshold.code === 'immortal-realm') {
            return { ok: false, msgs: [
                `【轮回未启】`,
                `仙境乃仙人之地，非成仙者不可入！`,
                `道友当前并未成仙，无法踏足仙境。`,
            ] };
        }
    }
    // 遮天位面：需圣人/天神，或已寻得并激活五色祭坛
    if (location === '遮天位面') {
        if (threshold.code === 'zhetian') {
                return { ok: false, msgs: [
                    `【遮天宇宙·前路未明】`,
                    `北斗星域遥在无尽星海之外，非圣人/天神级别的强者难以肉身横渡星海！`,
                    `你立于星空古路前，眸中神光闪烁，试图洞穿虚空：`,
                    `"茫茫宇宙，何处是北斗？"`,
                    ``,
                    `忽闻一声叹息自虚空传来：`,
                    `"不成圣，终为蝼蚁！不化天神，难渡星海！欲往遮天，当寻五色祭坛！"`,
                    ``,
                    `你忆起古籍记载：`,
                    `- 五色祭坛乃上古先民所筑，可接引九龙拉棺`,
                    `- 九龙拉棺乃横渡星域之无上法器（听闻凡间秘境荧惑古星可以寻到五色祭坛的踪迹）`,
                    `- 唯此方可抵达那荒古禁地所在的北斗星域`,
                    ``,
                    `你当前：`,
                    `秘境体系：${player.mijinglevel_id}级（未成圣人）`,
                    `仙古今世法：${player.xiangulevel_id}级（未成天神）`,
                    `五色祭坛：${player.五色祭坛 === 1 ? '已寻得' : '未寻得'}`,
                    `激活状态：${player.五色祭坛激活 === 1 ? '已激活' : '未激活'}`,
                    ``,
                    `需踏遍诸天，寻得五色祭坛，并且激活方可启程！`
                ] };
        }
    }
    // 仙域：仙王（秘境18 或 仙古16）
    if (location === '仙域') {
        if (threshold.code === 'immortal-domain') {
            return { ok: false, msgs: [
                `【仙域壁垒·境界不足】`,
                `仙域乃诸天至高净土，非仙王者不可入！`,
                `你立于仙域壁垒前，感受到无上威压：`,
                ``,
                `- 仙域界壁流淌着原始真解之力`,
                `- 唯有凝聚出完整王印者方可叩关`,
                `- 仙域法则排斥一切未达仙王境的生灵`,
                ``,
                `「不成仙王，终是蝼蚁...」`,
                `界壁后传来冷漠的道音`
            ] };
        }
    }
    if (location === '太初星墟' && threshold.code === 'primordial-ruins') {
        return { ok: false, msgs: [
            `【太初星墟·界压难承】`,
            `星墟由破碎位面重叠而成，真仙以下踏入便会被界压撕碎。`,
            `需秘境体系或仙古今世法达到16级。`
        ] };
    }
    // 凡间：仙帝以上禁止下凡
    if (threshold.code === 'mortal-realm') {
        return { ok: false, msgs: [
            `【仙帝下凡·天地不容】`,
            `你身为仙帝级强者，帝威浩荡！`,
            `凡间世界无法承受你的存在，`,
            `强行下凡将导致位面崩溃！`,
            `请收敛气息或压制境界后再尝试。`
        ] };
    }
    return { ok: true, msgs: [] };
}

// 查询玩家是否处于传送/秘境等动作中，返回忙碌描述或 null
async _getPlayerAction(qq) {
    try {
        const action = await redis.get('xiuxian:player:' + qq + ':action');
        if (!action) return null;
        const a = JSON.parse(action);
        if (a == null) return null;
        let end_time = a.end_time;
        const now = Date.now();
        if (a.Place_actionplus === '0') {
            end_time = a.start_time + a.total_time * 60 * 1000;
        }
        if (now <= end_time) {
            const m = parseInt((end_time - now) / 1000 / 60);
            const s = parseInt((end_time - now - m * 60 * 1000) / 1000);
            return `${a.action || '未知'}（剩余${m}分${s}秒）`;
        }
    } catch (err) {
        // 查询失败不阻断，视为空闲
    }
    return null;
}

// 确认接引/送往请求（目标玩家在60秒内发送 #同意接引）
async confirmJieyin(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }

    let targetQQ = e.user_id.toString().replace('qg_', '');
    targetQQ = await channel(targetQQ);

    const req = pendingJieyinMap.get(targetQQ);
    if (!req) {
        return e.reply("当前没有需要你确认的接引/传送请求。");
    }
    if (Date.now() > req.expire) {
        pendingJieyinMap.delete(targetQQ);
        return e.reply("该接引/传送请求已超时（需在60秒内 #同意接引），请让对方重新发起。");
    }

    // 目标仍须空闲
    const targetBusy = await this._getPlayerAction(targetQQ);
    if (targetBusy) {
        return e.reply(`你正在${targetBusy}中，暂无法响应接引，请结束后重试。`);
    }

    const targetPlayer = await Read_player(targetQQ);

    // 终检：目标准入（防止请求期间状态变化）
    if (isWeiMianDestroyed(req.locationName)) {
        pendingJieyinMap.delete(targetQQ);
        return e.reply(buildPlaneDestroyedMsgs(req.locationName));
    }
    const threshold = await this.checkLocationThreshold(targetPlayer, req.locationName);
    if (!threshold.ok) {
        pendingJieyinMap.delete(targetQQ);
        return e.reply([
            `【${req.fromName}的${req.type === 'jieyin' ? '接引' : '传送'}中止·位面壁垒】`,
            `你已无法承受${req.locationName}的位面法则：`,
            ``,
            ...threshold.msgs
        ].join('\n'));
    }

    // 执行传送
    targetPlayer.power_place = PLACE_LOCATION_MAP[req.locationName];
    await Write_player(targetQQ, targetPlayer);
    pendingJieyinMap.delete(targetQQ);

    const typeLabel = req.type === 'jieyin' ? '接引' : '传送';
    return e.reply([
        `【${req.fromName}的${typeLabel}神通·生效】`,
        `你已同意${req.fromName}的${typeLabel}请求。`,
        `空间通道开启，你被送往「${req.locationName}」！`
    ].join('\n'));
}

// 拒绝接引/送往请求（目标玩家发送 #拒绝接引 立即作废请求）
async refuseJieyin(e) {
    if (!e.isGroup) {
        e.reply('修仙游戏请在群聊中游玩');
        return;
    }

    let targetQQ = e.user_id.toString().replace('qg_', '');
    targetQQ = await channel(targetQQ);

    const req = pendingJieyinMap.get(targetQQ);
    if (!req) {
        return e.reply("当前没有需要你确认或拒绝的接引/传送请求。");
    }
    if (Date.now() > req.expire) {
        pendingJieyinMap.delete(targetQQ);
        return e.reply("该接引/传送请求已超时失效，无需拒绝。");
    }

    const typeLabel = req.type === 'jieyin' ? '接引' : '传送';
    pendingJieyinMap.delete(targetQQ);
    return e.reply([
        `【${typeLabel}请求·已拒绝】`,
        `你已拒绝${req.fromName}将你${req.type === 'jieyin' ? '接引至' : '送往'}${req.locationName}的${typeLabel}请求。`,
        `空间通道消散，一切归于平静。`
    ].join('\n'));
}

async coordinateMemory(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    const known = ['凡间', ...getUnknownCoordinates({}).filter(location => hasCoordinate(player, location))];
    const unknown = getUnknownCoordinates(player);
    const event = RealmEvents.getActiveEvent('coordinateClue');
    const lines = [
        `【位面坐标记忆】`,
        `已知：${known.join('、')}`,
        `未知：${unknown.length ? unknown.join('、') : '无'}`,
        `求购线索：${COORDINATE_CLUE_COST.toLocaleString('zh-CN')}灵石/个位面`
    ];
    if (event) {
        const minutes = Math.max(1, Math.ceil((event.expiresAt - Date.now()) / 60000));
        lines.push(`石壁线索：${formatRealmEventLocation(event)} → ${event.targetPlane}（剩余${minutes}分钟）`);
        const travel = formatRealmEventTravel(event);
        if (travel) lines.push(`赶路方式：${travel}`);
    }
    return e.reply(lines.join('\n'));
}

async sectWarPlayerContext(e, { requireReach = true, requireJoined = false } = {}) {
    if (!verc({ e })) return null;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return null;
    const player = await Read_player(qq);
    const event = RealmEvents.getActiveEvent('sectWar');
    if (!event) {
        await e.reply('当前没有正在进行的圣地大战。');
        return null;
    }
    if (requireReach && !getRealmEventReach(player, event).ok) {
        await e.reply([
            '你尚未抵达圣战发生的精确坐标。',
            `地点：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
        return null;
    }
    if (requireJoined && !event.sectWar?.participants?.[String(qq)]) {
        const sides = event.sectWar?.mode === 'frontier' ? '联军/中立' : '攻方/守方/中立';
        await e.reply(`你尚未加入本次圣战，请先发送 #圣战站队 ${sides.split('/')[0]}（可选：${sides}）。`);
        return null;
    }
    return { qq, player, event };
}

async sectWarInfo(e) {
    if (!verc({ e })) return false;
    let event = RealmEvents.getActiveEvent('sectWar');
    if (!event) {
        event = RealmEvents.getLatestSectWarEvent();
        if (!event) return e.reply('诸天当前没有圣地大战记录。');
        if (event.sectWar?.status !== 'settled' && Number(event.expiresAt) <= Date.now()) {
            await this.settleSectWarEventRewards(event);
            event = RealmEvents.getLatestSectWarEvent() || event;
        }
        if (event.sectWar?.outcome) {
            return e.reply([
                '【圣地大战·战后公报】',
                event.sectWar.outcome.title,
                event.sectWar.outcome.summary,
                `战场余波：${event.sectWar.outcome.planeEffect}`,
                '发送 #查看战场榜 查看个人战功排名。'
            ].join('\n'));
        }
        return e.reply('当前没有正在进行的圣地大战。');
    }

    const war = event.sectWar;
    const minutes = Math.max(1, Math.ceil((Number(event.expiresAt) - Date.now()) / 60000));
    const lines = [
        `【圣地大战·${war.phase}】`,
        `地点：${formatRealmEventLocation(event)}`,
        `剩余：${minutes}分钟`,
        `导火索：${event.reason}`,
        '',
        `军势 ${war.meters.military}%｜辎重 ${war.meters.supplies}%`,
        `真相 ${war.meters.truth}%｜封印 ${war.meters.seal}%`
    ];
    if (war.mode === 'frontier') {
        lines.push(`联军战功：${war.scores.coalition || 0}`);
    } else {
        lines.push(
            `攻方：${war.sides.attacker.name}（${war.scores.attacker || 0}）`,
            `守方：${war.sides.defender.name}（${war.scores.defender || 0}）`
        );
    }
    if (war.clues?.length) {
        lines.push('', '【已揭露战端】', ...war.clues.map(clue => `${clue.threshold}%：${clue.text}`));
    } else {
        lines.push('', '战端真相尚未揭露。');
    }
    lines.push(
        '',
        war.mode === 'frontier'
            ? '#圣战站队 联军（也可选择中立）'
            : '#圣战站队 攻方/守方/中立',
        '#战场行动 正面攻伐/护送资源/源术勘脉/潜入夺证/救援伤员',
        '#投入战资 源石*数量',
        '#查看战场榜',
        '#战功商店'
    );
    if (Number(war.meters.truth) >= 50) {
        lines.push(war.mode === 'frontier'
            ? '#提交战场决议 强攻禁区/稳固封印/撤离伤员'
            : '#提交战场决议 继续争夺/停战查真/联军攻禁区');
    }
    lines.push(`赶路方式：${formatRealmEventTravel(event)}`);
    return e.reply(lines.join('\n'));
}

async joinSectWar(e) {
    const ctx = await this.sectWarPlayerContext(e, { requireReach: true });
    if (!ctx || !await Go(e)) return false;
    const sideText = String(e.msg).replace(/^#圣战站队\s+/, '').trim();
    const side = {
        攻方: 'attacker',
        守方: 'defender',
        联军: 'coalition',
        中立: 'neutral',
        观望: 'neutral'
    }[sideText];
    const result = RealmEvents.joinSectWar(
        ctx.event.timestamp,
        ctx.qq,
        ctx.player.名号 || ctx.player.名称,
        side
    );
    if (!result.ok) {
        if (result.reason === 'duplicate') {
            return e.reply(`你已经加入${getSectWarSideName(ctx.event.sectWar, result.participant.side)}，不可临阵易帜。`);
        }
        if (result.reason === 'invalid_side') {
            return e.reply(ctx.event.sectWar?.mode === 'frontier'
                ? '禁区外缘事件只能选择联军或中立。'
                : '本次龙脉争夺只能选择攻方、守方或中立。');
        }
        return e.reply('本次圣地大战已经结束。');
    }
    return e.reply([
        '【圣战站队成功】',
        `阵营：${getSectWarSideName(result.event.sectWar, side)}`,
        `地点：${formatRealmEventLocation(result.event)}`,
        '每种战场行动限完成一次，最多五次；结算同时计算阵营胜负与个人贡献。',
        '发送 #圣战详情 查看可用行动。'
    ].join('\n'));
}

async sectWarAction(e) {
    const ctx = await this.sectWarPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const action = e.msg === '#调查战端'
        ? '潜入夺证'
        : String(e.msg).replace(/^#战场行动\s+/, '').trim();
    const result = RealmEvents.recordSectWarAction(
        ctx.event.timestamp,
        ctx.qq,
        action,
        { power: getSectWarActionPower(ctx.player) }
    );
    if (!result.ok) {
        const reasons = {
            duplicate: '这项战场行动你已经完成过了。',
            limit: '你的五次战场行动已经全部用完。',
            side_restricted: '中立修士不能参加正面攻伐或阵营资源护送，可调查、勘脉或救援。',
            expired: '本次圣地大战已经结束。'
        };
        return e.reply(reasons[result.reason] || '当前无法执行这项战场行动。');
    }
    const lines = [
        `【战场行动·${action}】`,
        `本次获得战功：${result.contribution}`,
        `个人总贡献：${result.participant.contribution}`,
        `军势 ${result.event.sectWar.meters.military}%｜辎重 ${result.event.sectWar.meters.supplies}%`,
        `真相 ${result.event.sectWar.meters.truth}%｜封印 ${result.event.sectWar.meters.seal}%`
    ];
    if (result.newClues.length) {
        lines.push('', '【战场转折】', ...result.newClues.map(clue => clue.text));
    }
    if (Number(result.event.sectWar.meters.truth) >= 50) {
        lines.push('', '真相已经足够清晰，可以发送 #圣战详情 查看并提交战场决议。');
    }
    return e.reply(lines.join('\n'));
}

async supportSectWar(e) {
    const ctx = await this.sectWarPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx) return false;
    const amount = Number(e.msg.match(/源石\*(\d+)$/)?.[1]);
    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 1e12) {
        return e.reply('单次战资须为1,000至1万亿源石。');
    }
    if ((Number(ctx.player.源石) || 0) < amount) return e.reply('你的源石不足，无法投入这批战资。');
    const result = RealmEvents.recordSectWarSupport(ctx.event.timestamp, ctx.qq, amount);
    if (!result.ok) {
        if (result.reason === 'limit') return e.reply('每场圣战最多投入三批战资。');
        return e.reply('当前无法向本次圣战投入战资。');
    }
    ctx.player.源石 -= amount;
    try {
        await Write_player(ctx.qq, ctx.player);
    } catch (error) {
        RealmEvents.rollbackSectWarSupport(ctx.event.timestamp, result.supportId);
        console.error('[圣地大战] 投入战资失败:', error);
        return e.reply('战资交割失败，源石没有扣除。');
    }
    return e.reply([
        '【圣战战资·交割完成】',
        `投入源石：${amount.toLocaleString('zh-CN')}`,
        `增加辎重：${result.supplies}%`,
        `获得战功：${result.contribution}`,
        `剩余源石：${ctx.player.源石.toLocaleString('zh-CN')}`
    ].join('\n'));
}

async sectWarRanking(e) {
    if (!verc({ e })) return false;
    const event = RealmEvents.getActiveEvent('sectWar') || RealmEvents.getLatestSectWarEvent();
    if (!event) return e.reply('当前没有圣地大战记录。');
    const rankings = RealmEvents.getSectWarRankings(event).slice(0, 10);
    const lines = [
        `【${event.sectWar?.phase || '圣地大战'}·战场榜】`,
        `地点：${formatRealmEventLocation(event)}`
    ];
    if (!rankings.length) lines.push('尚无人留下战功。');
    rankings.forEach((entry, index) => lines.push(
        `${index + 1}. ${entry.name}｜${getSectWarSideName(event.sectWar, entry.side)}｜战功${entry.contribution}`
    ));
    if (event.sectWar?.outcome) lines.push('', `结局：${event.sectWar.outcome.title}`);
    return e.reply(lines.join('\n'));
}

async showSectWarShop(e) {
    if (!verc({ e })) return false;
    const qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    const player = await Read_player(qq);
    const lines = [
        '【圣地大战·战功商店】',
        `${SECT_WAR_TOKEN}：${Number(player[SECT_WAR_TOKEN]) || 0}`,
        '',
        ...SECT_WAR_SHOP.map(product =>
            `${product.id}. ${product.name}｜${product.category}｜${product.price}战功\n   ${product.description}`
        ),
        '',
        '发送 #战功兑换 名称（也可填写编号）',
        '火种和锻炉兑换后永久保留，可在炼器前自由装配。'
    ];
    return e.reply(lines.join('\n'));
}

async buySectWarProduct(e) {
    if (!verc({ e })) return false;
    const qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    const selector = String(e.msg).replace(/^#战功兑换\s*/, '');
    const product = findSectWarProduct(selector);
    if (!product) return e.reply('战功商店没有这件物品，请发送 #战功商店 查看');
    if (sectWarShopLocks.has(qq)) return e.reply('战功正在交割，请勿重复兑换');

    sectWarShopLocks.add(qq);
    try {
        const player = await Read_player(qq);
        if (product.unique && Number(await exist_najie_thing(qq, product.name, product.itemClass)) > 0) {
            return e.reply(`你已经拥有【${product.name}】，无需重复兑换`);
        }
        if (product.name === '时光令配方' && player.时光令配方) {
            return e.reply('你已经参悟【时光令配方】，无需重复兑换');
        }
        const balance = Number(player[SECT_WAR_TOKEN]) || 0;
        if (balance < product.price) {
            return e.reply(`${SECT_WAR_TOKEN}不足：需要${product.price}，当前${balance}`);
        }

        const originalBalance = balance;
        player[SECT_WAR_TOKEN] = balance - product.price;
        await Write_player(qq, player);
        try {
            await Add_najie_thing(qq, product.name, product.itemClass, 1);
        } catch (error) {
            player[SECT_WAR_TOKEN] = originalBalance;
            await Write_player(qq, player);
            console.error(`[圣地战功商店] 兑换失败 player=${qq} item=${product.name}`, error);
            return e.reply('兑换失败，消耗的圣地战功已经退还');
        }

        return e.reply([
            '【战功兑换成功】',
            `获得：${product.name}×1`,
            `消耗战功：${product.price}`,
            `剩余战功：${player[SECT_WAR_TOKEN]}`
        ].join('\n'));
    } finally {
        sectWarShopLocks.delete(qq);
    }
}

async voteSectWarDecision(e) {
    const ctx = await this.sectWarPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx) return false;
    const choice = String(e.msg).replace(/^#提交战场决议\s+/, '').trim();
    const result = RealmEvents.submitSectWarDecision(ctx.event.timestamp, ctx.qq, choice);
    if (!result.ok) {
        if (result.reason === 'truth_locked') return e.reply('真相进度达到50%后才能提交战场决议。');
        if (result.reason === 'invalid_choice') return e.reply('这项决议不适用于当前战场。');
        return e.reply('当前无法提交战场决议。');
    }
    return e.reply([
        '【战场决议·已提交】',
        `你的选择：${choice}`,
        '投票可在事件结束前修改，最终采用票数最多的方案。'
    ].join('\n'));
}

async bingziLegacyPlayerContext(e, { requireReach = true, requireJoined = false } = {}) {
    if (!verc({ e })) return null;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return null;
    const player = await Read_player(qq);
    const event = RealmEvents.getActiveEvent('bingziLegacy');
    if (!event) {
        await e.reply('秦门后山的兵图此刻并未显化。');
        return null;
    }
    if (requireReach && !getRealmEventReach(player, event).ok) {
        await e.reply([
            '你尚未抵达秦门后山石壁所在的精确坐标。',
            `地点：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
        return null;
    }
    if (requireJoined && !event.bingzi?.participants?.[String(qq)]) {
        await e.reply('你尚未追查蔡族旧事，请先发送 #追查蔡族。');
        return null;
    }
    return { qq, player, event };
}

async bingziLegacyInfo(e) {
    if (!verc({ e })) return false;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return false;
    let event = RealmEvents.getActiveEvent('bingziLegacy');
    if (!event) {
        event = RealmEvents.getLatestBingziLegacyEvent();
        if (!event) return e.reply('诸天尚无秦门兵字秘传承记录。');
        if (event.bingzi?.status !== 'settled' && Number(event.expiresAt) <= Date.now()) {
            await this.settleBingziLegacyRewards(event);
            event = RealmEvents.getLatestBingziLegacyEvent() || event;
        }
        const winner = event.bingzi?.winner;
        return e.reply([
            '【秦门兵图·显化已终】',
            winner
                ? `${winner.name}以【${winner.weapon}】承下完整兵字秘。`
                : '本次无人走完兵道试炼，完整经文随月华隐去。',
            '发送 #兵字秘榜 查看本次参悟排名。'
        ].join('\n'));
    }

    const legacy = event.bingzi;
    const mine = legacy.participants?.[String(qq)];
    const minutes = Math.max(1, Math.ceil((Number(event.expiresAt) - Date.now()) / 60000));
    const progress = mine ? [
        mine.tracedCaiClan ? '蔡族线索已明' : '尚未追查蔡族',
        mine.trackedMoonPrincess ? '已跟踪月灵公主' : '尚未锁定九山',
        mine.mountainFound ? '已找到真山' : `辨山${mine.guesses?.length || 0}/3`,
        mine.observedWeaponDiagram ? '已观完整兵图' : '尚未月下观兵',
        mine.completedAt ? `已以${mine.declaredWeapon}证兵` : '尚未以器证兵'
    ].join('｜') : '尚未参与';
    return e.reply([
        '【九秘传承·秦门兵图】',
        `地点：${formatRealmEventLocation(event)}`,
        `剩余：${minutes}分钟`,
        `参与修士：${Object.keys(legacy.participants || {}).length}人`,
        `你的进度：${progress}`,
        mine ? `当前参悟分：${mine.score}` : '',
        '',
        '1. #追查蔡族',
        '2. #跟踪月灵公主',
        '3. #辨认石山*数字（第一山至第九山，最多三次）',
        '4. #月下观兵',
        '5. 装备武器或帝兵后发送 #以器证兵',
        '#兵字秘榜',
        '',
        '事件结束时按完成度、参悟分和完成时间择主；其余参与者获得兵字秘残卷。',
        `赶路方式：${formatRealmEventTravel(event)}`
    ].filter(Boolean).join('\n'));
}

async traceBingziCaiClan(e) {
    const ctx = await this.bingziLegacyPlayerContext(e, { requireReach: true });
    if (!ctx || !await Go(e)) return false;
    const result = RealmEvents.traceBingziCaiClan(
        ctx.event.timestamp,
        ctx.qq,
        ctx.player.名号 || ctx.player.名称
    );
    if (!result.ok) {
        return e.reply(result.reason === 'duplicate'
            ? '你已经查明秦门掌教一脉与蔡族的关系。'
            : '秦门兵图已经隐去。');
    }
    return e.reply([
        '【兵字秘·追查蔡族】',
        '你翻阅秦岭旧卷，查明秦门掌教一脉正是蔡族后人。',
        '主峰还藏有可度化修士心神的度神诀，贸然潜入风险极高。',
        `参悟分：${result.participant.score}`,
        '下一步：#跟踪月灵公主'
    ].join('\n'));
}

async trackBingziMoonPrincess(e) {
    const ctx = await this.bingziLegacyPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const result = RealmEvents.trackBingziMoonPrincess(ctx.event.timestamp, ctx.qq);
    if (!result.ok) {
        if (result.reason === 'trace_required') return e.reply('需先发送 #追查蔡族，确定兵字秘确在秦门。');
        if (result.reason === 'duplicate') return e.reply('你已经记下月灵公主的换山轨迹。');
        return e.reply('月灵公主的踪迹已经消失。');
    }
    return e.reply([
        '【兵字秘·月灵踪迹】',
        '你避开秦门主峰，在外围九座石山间跟随月灵公主留下的月华痕迹。',
        `真山位于第${result.clue.rangeStart}至第${result.clue.rangeEnd}山之间，并且序号是${result.clue.parity}。`,
        '使用 #辨认石山*数字 作出判断，最多三次。'
    ].join('\n'));
}

async identifyBingziMountain(e) {
    const ctx = await this.bingziLegacyPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const mountain = Number(e.msg.match(/\*([1-9])$/)?.[1]);
    const result = RealmEvents.recordBingziMountain(ctx.event.timestamp, ctx.qq, mountain);
    if (!result.ok) {
        const reasons = {
            track_required: '需先发送 #跟踪月灵公主，取得九山线索。',
            already_found: '你已经找到了兵图所在的真山。',
            duplicate_guess: '这座石山你已经辨认过。',
            limit: '三次辨山机会已经用尽，本次只能带走一份残缺道痕。',
            expired: '月华消散，秦门兵图已经隐去。'
        };
        if (result.reason === 'wrong') {
            return e.reply([
                `第${mountain}山只有普通控器刻痕，并非兵字秘真迹。`,
                `余韵表明真山${result.direction}。`,
                `剩余机会：${3 - result.participant.guesses.length}`
            ].join('\n'));
        }
        return e.reply(reasons[result.reason] || '无法辨认这座石山。');
    }
    return e.reply([
        '【九山辨真·兵图所在】',
        `第${mountain}山后壁的鼎、钟、塔、剑刻痕在月华下缓缓流动。`,
        `参悟分：${result.participant.score}`,
        '下一步：#月下观兵'
    ].join('\n'));
}

async observeBingziDiagram(e) {
    const ctx = await this.bingziLegacyPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const result = RealmEvents.recordBingziObservation(
        ctx.event.timestamp,
        ctx.qq,
        getBingziInsight(ctx.player)
    );
    if (!result.ok) {
        if (result.reason === 'mountain_required') return e.reply('你还没有辨出兵图所在的真山。');
        if (result.reason === 'duplicate') return e.reply('你已经观尽石壁上的锤炼、养兵与控器道痕。');
        return e.reply('石壁上的月华已经消散。');
    }
    return e.reply([
        '【月满中天·万兵归一】',
        '鼎、钟、塔、炉、镜、矛、剑在石壁上轮转重组，最终归为一个“兵”字。',
        '你承受住兵锋冲击，悟见从锤炼、蕴养到控器的完整兵道。',
        `悟性得分：${result.insightScore}｜总参悟分：${result.participant.score}`,
        '最后一步：装备一件武器或帝兵，发送 #以器证兵'
    ].join('\n'));
}

async declareBingziWeapon(e) {
    const ctx = await this.bingziLegacyPlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const equipment = await Read_equipment(ctx.qq);
    const equipped = equipment?.帝兵 || equipment?.武器;
    if (!equipped?.name) return e.reply('欲控万兵，必先掌一兵。请先装备一件武器或自己的帝兵。');
    const result = RealmEvents.recordBingziWeapon(ctx.event.timestamp, ctx.qq, {
        name: equipped.name,
        isEmperorWeapon: Boolean(equipment?.帝兵)
    });
    if (!result.ok) {
        if (result.reason === 'observe_required') return e.reply('需先发送 #月下观兵，承受完整兵图道痕。');
        if (result.reason === 'duplicate') return e.reply(`你已经以【${result.participant.declaredWeapon}】立下兵道根基。`);
        return e.reply('当前无法以器证兵。');
    }
    return e.reply([
        '【唯一之器·兵道根基】',
        `你以【${equipped.name}】为自身唯一之器，完成兵字秘传承试炼。`,
        equipment?.帝兵 ? '本命帝兵与石壁道痕共鸣，获得额外契合分。' : '此器虽非帝兵，亦可作为兵道起点。',
        `最终参悟分：${result.participant.score}`,
        '完整兵字秘将在事件结束后择主。'
    ].join('\n'));
}

async bingziLegacyRanking(e) {
    if (!verc({ e })) return false;
    let event = RealmEvents.getActiveEvent('bingziLegacy') || RealmEvents.getLatestBingziLegacyEvent();
    if (!event) return e.reply('当前没有秦门兵字秘传承记录。');
    if (event.bingzi?.status !== 'settled' && Number(event.expiresAt) <= Date.now()) {
        await this.settleBingziLegacyRewards(event);
        event = RealmEvents.getLatestBingziLegacyEvent() || event;
    }
    const rankings = RealmEvents.getBingziRankings(event).slice(0, 10);
    const lines = ['【秦门兵字秘·参悟榜】'];
    if (!rankings.length) lines.push('尚无人追查到蔡族线索。');
    rankings.forEach((entry, index) => lines.push(
        `${index + 1}. ${entry.name}｜${entry.score}分｜${entry.completedAt ? `以${entry.declaredWeapon}证兵` : '参悟未完'}`
    ));
    if (event.bingzi?.winner) {
        lines.push('', `完整传承：${event.bingzi.winner.name}｜唯一之器：${event.bingzi.winner.weapon}`);
    }
    return e.reply(lines.join('\n'));
}

async treasurePlayerContext(e, { requireReach = true, requireJoined = false } = {}) {
    if (!verc({ e })) return null;
    let qq = await channel(String(e.user_id).replace('qg_', ''));
    if (!await existplayer(qq)) return null;
    const player = await Read_player(qq);
    const events = RealmEvents.getTreasureContestEvents(true)
        .filter(event => Number(event.expiresAt) > Date.now())
        .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    let event = requireJoined
        ? events.find(item => item.contest?.participants?.[String(qq)])
        : events.find(item => !requireReach || getRealmEventReach(player, item).ok);
    if (!event && requireJoined) event = events[0];
    if (!event) {
        await e.reply('当前没有正在进行的先天至宝择主之争。');
        return null;
    }
    if (requireReach && !getRealmEventReach(player, event).ok) {
        await e.reply([
            '你尚未抵达至宝出世的精确坐标。',
            `地点：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`,
        ].join('\n'));
        return null;
    }
    if (requireJoined && !event.contest?.participants?.[String(qq)]) {
        await e.reply('你尚未参加本次择主之争，请先抵达坐标并发送 #夺宝。');
        return null;
    }
    return { qq, player, event };
}

async treasureContestInfo(e) {
    const command = String(e.msg || '').trim();
    if (command === '#灵宝择主榜') {
        let event = RealmEvents.getLatestTreasureContestEvent();
        if (!event) return e.reply('尚无先天至宝择主记录。');
        if (event.contest?.status !== 'settled' && Number(event.expiresAt) <= Date.now()) {
            await this.settleTreasureEventRewards(event);
            event = RealmEvents.getLatestTreasureContestEvent() || event;
        }
        const rankings = event.contest?.status === 'settled'
            ? event.contest.rankings || []
            : rankTreasureContest(event.contest, event.treasure?.name, event.timestamp);
        const lines = [
            `【${event.treasure?.name || '先天至宝'}·${event.contest?.status === 'settled' ? '择主结果' : '当前择主榜'}】`,
            `封印破解度：${event.contest?.sealProgress || 0}%`,
        ];
        if (!rankings.length) lines.push('目前还没有完成三次试炼并立下道心的修士。');
        rankings.slice(0, 10).forEach((item, index) => {
            lines.push(`${index + 1}. ${item.name} ${item.total}分`);
            if (event.contest?.status === 'settled') {
                lines.push(`试炼${item.trialScore}｜契合${item.affinity}｜贡献${item.contribution}｜天运${item.luck}${item.tianjiBonus ? `｜天机${item.tianjiBonus}` : ''}`);
            }
        });
        if (event.contest?.status !== 'settled') {
            const minutes = Math.max(1, Math.ceil((Number(event.expiresAt) - Date.now()) / 60000));
            lines.push(`最终分数将在${minutes}分钟后公开结算。`);
        } else if (event.contest.winner) {
            lines.push(`【${event.treasure.name}】最终选择${event.contest.winner.name}为主。`);
        } else {
            lines.push('本次无人完成择主资格，至宝重新遁入诸天。');
        }
        return e.reply(lines.join('\n'));
    }

    const ctx = await this.treasurePlayerContext(e, {
        requireReach: command === '#观摩灵宝',
        requireJoined: command === '#查看夺宝进度',
    });
    if (!ctx) return false;
    if (command === '#观摩灵宝' && !await Go(e)) return false;
    const contest = ctx.event.contest || { sealProgress: 0, participants: {} };
    const profile = getTreasureContestProfile(ctx.event.treasure?.name);
    const clues = getRevealedTreasureClues(ctx.event.treasure?.name, contest.sealProgress);
    const mine = contest.participants?.[String(ctx.qq)];
    const completed = Object.keys(mine?.trials || {}).length;
    const lines = [
        `【${ctx.event.treasure.name}·择主之争】`,
        `地点：${formatRealmEventLocation(ctx.event)}`,
        `天象：${profile.omen}`,
        `封印破解度：${contest.sealProgress || 0}%`,
        `参与修士：${Object.keys(contest.participants || {}).length}人`,
        clues.length ? `已显线索：${clues.join('；')}` : '已显线索：尚无',
    ];
    if (!mine) {
        lines.push('', '发送 #夺宝 参加。参加后从四种试炼中任选三种，每种限一次。');
    } else {
        lines.push('', `你的天机行动：${completed}/${TREASURE_TRIAL_LIMIT}`);
        lines.push(`已完成：${Object.keys(mine.trials || {}).map(key => ({ battle: '守护灵', insight: '先天禁制', support: '天地灵脉', fate: '命运乱流' })[key]).join('、') || '无'}`);
        lines.push(`当前试炼分：${mine.trialScore || 0}｜破封贡献：${mine.contribution || 0}｜道心：${mine.daoHeart || '未立'}`);
        if (String(ctx.qq) === String(contest.tianjiBuyer?.qq)) {
            lines.push(`天机在握：你已提前窥见至宝真名与天象，结算时额外 +${TIANJI_INFO_BONUS} 分`);
        }
    }
    lines.push(
        '',
        '#挑战守护灵 普通/凶险/绝境',
        `#参悟先天禁制 ${profile.insightOptions.join('/')}`,
        '#护持天地灵脉 源石*数量（1万至200万）',
        '#护持天地灵脉 材料名*数量',
        '#跃入命运乱流',
        `完成三项后：#立下道心 ${TREASURE_DAO_HEARTS.join('/')}`,
        '#查看夺宝进度｜#灵宝择主榜'
    );
    return e.reply(lines.join('\n'));
}

async treasureContestTrial(e) {
    const ctx = await this.treasurePlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const msg = String(e.msg || '').trim();
    let trial;
    let options = {};
    let refund = null;

    if (msg.startsWith('#挑战守护灵')) {
        trial = 'battle';
        options.difficulty = msg.match(/^#挑战守护灵\s+(普通|凶险|绝境)$/)?.[1];
        options.healthRatio = (Number(ctx.player.当前血量) || 0) / Math.max(1, Number(ctx.player.血量上限) || 1);
        const existing = ctx.event.contest?.participants?.[String(ctx.qq)];
        if (existing?.trials?.battle) return e.reply('守护灵试炼已经完成，不能重复挑战。');
        if (Object.keys(existing?.trials || {}).length >= TREASURE_TRIAL_LIMIT) {
            return e.reply('三次天机行动已经用尽，不能再挑战守护灵。');
        }
        const guardian = createTreasureGuardian(ctx.player, options.difficulty, ctx.event.treasure?.name);
        if (!guardian) return e.reply('守护灵难度无效。');
        const battlePlayer = {
            ...ctx.player,
            当前血量: Math.max(1, Number(ctx.player.当前血量) || 1),
            血量上限: Math.max(1, Number(ctx.player.血量上限) || 1),
            灵根: ctx.player.灵根 || {},
            学习的功法: ctx.player.学习的功法 || [],
            仙宠: ctx.player.仙宠 || null,
            神石: ctx.player.神石 || {},
        };
        const guardianBattle = { ...guardian };
        const blackEmperorFormation = consumeBlackEmperorBattleFormation(ctx.player, battlePlayer, guardianBattle);
        if (blackEmperorFormation.consumed) await Write_player(ctx.qq, ctx.player);
        const battle = await zd_battle(battlePlayer, guardianBattle, { battleType: 'treasure_guardian' });
        options.battleWon = battle.winner === 'A';
        const storedPlayer = await Read_player(ctx.qq);
        storedPlayer.当前血量 = options.battleWon
            ? Math.max(1, Math.trunc(Number(battle.A_hp) || 1))
            : 1;
        await Write_player(ctx.qq, storedPlayer);
        const report = [
            `【${ctx.event.treasure.name}·${options.difficulty}守护灵】`,
            `器灵属性：攻击${guardian.攻击.toLocaleString('zh-CN')}｜防御${guardian.防御.toLocaleString('zh-CN')}｜血量${guardian.血量上限.toLocaleString('zh-CN')}`,
            '',
            ...treasureBattleExcerpt(battle.msg),
            ...(blackEmperorFormation.message ? [blackEmperorFormation.message] : []),
            '',
            options.battleWon ? '你击败了守护灵。' : '你败于守护灵，拼尽全力脱离试炼，当前血量降至1。',
        ];
        await e.reply(report.join('\n'));
    } else if (msg.startsWith('#参悟先天禁制')) {
        trial = 'insight';
        options.choice = msg.replace(/^#参悟先天禁制\s+/, '').trim();
    } else if (msg === '#跃入命运乱流') {
        trial = 'fate';
    } else {
        trial = 'support';
        const match = msg.match(/^#护持天地灵脉\s+(.+?)\*(\d+)$/);
        if (!match) return e.reply('用法：#护持天地灵脉 源石或材料名*数量');
        const resourceName = match[1].trim();
        const amount = Number(match[2]);
        if (!Number.isSafeInteger(amount) || amount < 1) return e.reply('投入数量必须为正整数。');
        if (resourceName === '源石') {
            if (amount < 10000 || amount > 2000000) return e.reply('单次需投入1万至200万源石。');
            if ((Number(ctx.player.源石) || 0) < amount) return e.reply('你的源石不足。');
            ctx.player.源石 -= amount;
            await Write_player(ctx.qq, ctx.player);
            options.contribution = Math.min(10, Math.ceil(amount / 200000));
            options.resourceLabel = `${amount.toLocaleString('zh-CN')}源石`;
            refund = async () => {
                const player = await Read_player(ctx.qq);
                player.源石 = (Number(player.源石) || 0) + amount;
                await Write_player(ctx.qq, player);
            };
        } else {
            const najie = await Read_najie(ctx.qq);
            const material = najie.材料?.find(item => item.name === resourceName);
            if (!material || Number(material.数量) < amount) return e.reply('纳戒中没有足够的该材料。');
            material.数量 -= amount;
            najie.材料 = najie.材料.filter(item => Number(item.数量) > 0);
            await Write_najie(ctx.qq, najie);
            const rarity = Math.max(0, Number(material.稀有度 ?? material.pinji) || 0);
            options.contribution = Math.min(10, 1 + Math.floor(Math.log10(amount)) + Math.floor(rarity));
            options.resourceLabel = `【${resourceName}】x${amount}`;
            refund = async () => {
                const currentNajie = await Read_najie(ctx.qq);
                currentNajie.材料 ||= [];
                const current = currentNajie.材料.find(item => item.name === material.name);
                if (current) current.数量 = (Number(current.数量) || 0) + amount;
                else currentNajie.材料.push({ ...material, 数量: amount });
                await Write_najie(ctx.qq, currentNajie);
            };
        }
    }

    const result = RealmEvents.recordTreasureTrial(ctx.event.timestamp, ctx.qq, trial, options);
    if (!result.ok) {
        if (refund) await refund();
        const errors = {
            duplicate_trial: '这类试炼你已经完成过，每种试炼只能选择一次。',
            limit: '三次天机行动已经用尽，不能再选择第四种试炼。',
            invalid_option: '选择不在本次试炼允许的范围内，请发送 #观摩灵宝 查看。',
            expired: '择主之争已经结束。',
        };
        return e.reply(errors[result.reason] || '本次试炼无法进行。');
    }

    if (result.healthPenaltyRate > 0) {
        const player = await Read_player(ctx.qq);
        const loss = Math.max(1, Math.floor((Number(player.血量上限) || 1) * result.healthPenaltyRate));
        player.当前血量 = Math.max(1, (Number(player.当前血量) || 1) - loss);
        await Write_player(ctx.qq, player);
        result.detail += ` 你损失了${loss.toLocaleString('zh-CN')}点当前血量。`;
    }

    const milestoneText = result.milestones.map(value => ({
        25: '封印显露了第一条灵宝性情。',
        50: '所有参与者将在结算时额外获得先天道痕。',
        75: '封印显露了第二条灵宝性情。',
        100: '先天封印完全破解，完整择主仪式已经开启。',
    })[value]);
    const actionCount = Object.keys(result.participant.trials || {}).length;
    return e.reply([
        '【先天至宝·试炼完成】',
        result.detail,
        `本次试炼：${result.score}分｜封印破解+${result.progress}%`,
        `你的天机行动：${actionCount}/${TREASURE_TRIAL_LIMIT}`,
        `当前封印破解度：${result.event.contest.sealProgress}%`,
        ...milestoneText,
        actionCount === TREASURE_TRIAL_LIMIT ? '三项试炼已毕，请发送 #立下道心 选择。' : '还可继续选择其他试炼。',
    ].join('\n'));
}

async treasureContestDaoHeart(e) {
    const ctx = await this.treasurePlayerContext(e, { requireReach: true, requireJoined: true });
    if (!ctx || !await Go(e)) return false;
    const choice = String(e.msg).replace(/^#立下道心\s+/, '').trim();
    const result = RealmEvents.setTreasureDaoHeart(ctx.event.timestamp, ctx.qq, choice);
    if (!result.ok) {
        if (result.reason === 'trials_required') return e.reply('需先完成三种不同试炼，才能面对器灵的最后一问。');
        if (result.reason === 'duplicate') return e.reply('道心一经立下便不可更改。');
        return e.reply('当前无法立下道心。');
    }
    return e.reply([
        '【道心已立】',
        `你向器灵作答：${choice}。`,
        '答案不会立即判定；事件结束时将与试炼路线一同计算性情契合度。',
    ].join('\n'));
}

async settleExpiredRealmEvents() {
    await this.settleExpiredTreasureContests();
    await this.settleExpiredSectWars();
    await this.settleExpiredBingziLegacies();
}

async settleExpiredBingziLegacies() {
    const events = RealmEvents.getBingziLegacyEvents().filter(event => Number(event.expiresAt) <= Date.now());
    for (const event of events) {
        try {
            await this.settleBingziLegacyRewards(event);
        } catch (error) {
            console.error('[兵字秘] 秦门传承结算失败:', error);
        }
    }
}

async settleBingziLegacyRewards(event) {
    const lockKey = String(event.timestamp);
    if (bingziSettlementLocks.has(lockKey)) return { ok: true, pending: true, event };
    bingziSettlementLocks.add(lockKey);
    try {
        const settlement = RealmEvents.settleBingziLegacyEvent(event.timestamp);
        if (!settlement.ok) return settlement;
        event = settlement.event;
        const rankings = event.bingzi?.rankings || RealmEvents.getBingziRankings(event);
        const rewarded = new Set((event.bingzi?.rewardedQqs || []).map(String));
        let winner = event.bingzi?.winner || null;

        if (!winner) {
            for (const entry of rankings.filter(item => item.completedAt)) {
                const qq = String(entry.qq);
                try {
                    if (!await existplayer(qq)) continue;
                    const player = await Read_player(qq);
                    if (player.学习的功法?.includes(BINGZI_TECHNIQUE)) continue;
                    winner = {
                        qq,
                        name: entry.name,
                        weapon: entry.declaredWeapon,
                        score: entry.score,
                    };
                    break;
                } catch (error) {
                    console.error(`[兵字秘] 检查玩家${qq}传承资格失败:`, error);
                }
            }
            RealmEvents.setBingziWinner(event.timestamp, winner);
            event.bingzi.winner = winner;
        }

        if (!settlement.alreadySettled) {
            await RealmEvents.broadcastEvent([
                '【秦门兵图·传承落定】',
                winner
                    ? `${winner.name}以【${winner.weapon}】承下完整兵字秘。`
                    : '本次无人走完兵道试炼，完整经文随月华隐去。',
                '其余参与者将按追查与参悟进度获得兵字秘残卷。',
                '发送 #兵字秘榜 查看本次参悟排名。'
            ].join('\n'));
        }

        for (const entry of Object.values(event.bingzi?.participants || {})) {
            const qq = String(entry.qq);
            if (rewarded.has(qq)) continue;
            try {
                if (!await existplayer(qq)) {
                    RealmEvents.markBingziRewarded(event.timestamp, qq);
                    continue;
                }
                const player = await Read_player(qq);
                const settlementKey = String(event.timestamp);
                if (player.已结算兵字秘事件?.includes(settlementKey)) {
                    RealmEvents.markBingziRewarded(event.timestamp, qq);
                    continue;
                }

                const isWinner = String(winner?.qq) === qq;
                if (isWinner) {
                    player.学习的功法 ||= [];
                    if (!player.学习的功法.includes(BINGZI_TECHNIQUE)) {
                        player.学习的功法.push(BINGZI_TECHNIQUE);
                    }
                } else {
                    const fragments = entry.completedAt ? 3 : entry.mountainFound ? 2 : entry.tracedCaiClan ? 1 : 0;
                    if (fragments > 0) {
                        await Add_najie_thing(
                            qq,
                            BINGZI_FRAGMENT,
                            '材料',
                            fragments,
                            undefined,
                            1,
                            { idempotencyKey: `bingzi-legacy:${settlementKey}:${qq}` }
                        );
                    }
                }

                player.已结算兵字秘事件 ||= [];
                player.已结算兵字秘事件.push(settlementKey);
                player.已结算兵字秘事件 = player.已结算兵字秘事件.slice(-20);
                await Write_player(qq, player);
                RealmEvents.markBingziRewarded(event.timestamp, qq);
            } catch (error) {
                console.error(`[兵字秘] 玩家${qq}奖励结算失败:`, error);
            }
        }
        RealmEvents.getActiveEvents();
        return settlement;
    } finally {
        bingziSettlementLocks.delete(lockKey);
    }
}

async settleExpiredSectWars() {
    const events = RealmEvents.getSectWarEvents().filter(event => Number(event.expiresAt) <= Date.now());
    for (const event of events) {
        try {
            await this.settleSectWarEventRewards(event);
        } catch (error) {
            console.error('[圣地大战] 事件结算失败:', error);
        }
    }
}

async settleSectWarEventRewards(event) {
    const lockKey = String(event.timestamp);
    if (sectWarSettlementLocks.has(lockKey)) return { ok: true, pending: true, event };
    sectWarSettlementLocks.add(lockKey);
    try {
        const settlement = RealmEvents.settleSectWarEvent(event.timestamp);
        if (!settlement.ok) return settlement;
        event = settlement.event;
        const outcome = event.sectWar?.outcome || {};
        const rewarded = new Set((event.sectWar?.rewardedQqs || []).map(String));

        if (!settlement.alreadySettled) {
            await RealmEvents.broadcastEvent([
                '【圣地大战·战后公报】',
                outcome.title,
                outcome.summary,
                `战场余波：${outcome.planeEffect}`,
                '发送 #查看战场榜 查看本次战功排名，或发送 #战功商店 兑换炼器资产。'
            ].join('\n'));
        }

        for (const entry of Object.values(event.sectWar?.participants || {})) {
            const qq = String(entry.qq);
            if (rewarded.has(qq)) continue;
            try {
                if (!await existplayer(qq)) {
                    RealmEvents.markSectWarRewarded(event.timestamp, qq);
                    continue;
                }
                const player = await Read_player(qq);
                const settlementKey = String(event.timestamp);
                if (player.已结算圣地大战?.includes(settlementKey)) {
                    RealmEvents.markSectWarRewarded(event.timestamp, qq);
                    continue;
                }
                const realmPower =
                    (Number(player.level_id) || 0) +
                    (Number(player.Physique_id) || 0) +
                    (Number(player.mijinglevel_id) || 0) * 2 +
                    (Number(player.xiangulevel_id) || 0) * 2 + 2;
                const baseReward = Math.max(30000, Math.trunc(realmPower * 8000));
                const contributionBonus = 1 + Math.min(1.5, (Number(entry.contribution) || 0) / 100);
                const coalitionWinner = outcome.winnerSide === 'coalition' &&
                    ['attacker', 'defender', 'coalition'].includes(entry.side);
                const factionWinner = outcome.winnerSide === entry.side;
                const winnerBonus = coalitionWinner || factionWinner ? 1.35 : outcome.winnerSide === 'draw' ? 1.1 : 1;
                const reward = Math.trunc(baseReward * contributionBonus * winnerBonus);
                const merit = Math.max(1, Math.round((Number(entry.contribution) || 0) * winnerBonus));
                const effects = getMinggeEffects(player, data.minggeList);
                player.修为 = (Number(player.修为) || 0) + calculateMinggeGain(reward, effects, '修炼加成');
                player.血气 = (Number(player.血气) || 0) + reward;
                player.圣地战功 = (Number(player.圣地战功) || 0) + merit;
                if (event.sectWar.mode === 'frontier') {
                    player.禁区残痕 = (Number(player.禁区残痕) || 0) + Math.max(1, Math.floor(merit / 10));
                }
                player.已结算圣地大战 ||= [];
                player.已结算圣地大战.push(settlementKey);
                player.已结算圣地大战 = player.已结算圣地大战.slice(-20);
                await Write_player(qq, player);
                RealmEvents.markSectWarRewarded(event.timestamp, qq);
            } catch (error) {
                console.error(`[圣地大战] 玩家${qq}奖励结算失败:`, error);
            }
        }
        RealmEvents.getActiveEvents();
        return settlement;
    } finally {
        sectWarSettlementLocks.delete(lockKey);
    }
}

async settleExpiredTreasureContests() {
    const events = RealmEvents.getTreasureContestEvents().filter(event => Number(event.expiresAt) <= Date.now());
    for (const event of events) {
        try {
            await this.settleTreasureEventRewards(event);
        } catch (error) {
            console.error('[先天至宝] 择主结算失败:', error);
        }
    }
}

async settleTreasureEventRewards(event) {
    const lockKey = String(event.timestamp);
    if (treasureSettlementLocks.has(lockKey)) return { ok: true, pending: true, event };
    treasureSettlementLocks.add(lockKey);
    try {
        const settlement = RealmEvents.settleTreasureEvent(event.timestamp);
        if (!settlement.ok) return settlement;
        event = settlement.event;

        // 天骄夺宝：择主冠军为天骄 AI 竞争者时，至宝落入天骄之手，全服公告
        const winner = settlement.winner || event.contest?.winner;
        if (winner && String(winner.qq || '').startsWith('tianjiao:')) {
            await this.handleTianjiaoTreasureSeized(event, winner);
        }
        const rankings = event.contest?.rankings || [];
        const rankByQq = new Map(rankings.map((item, index) => [String(item.qq), index + 1]));
        const rewarded = new Set((event.contest?.rewardedQqs || []).map(String));

        for (const entry of Object.values(event.contest?.participants || {})) {
            const qq = String(entry.qq);
            if (rewarded.has(qq)) continue;
            if (!await existplayer(qq)) {
                RealmEvents.markTreasureRewarded(event.timestamp, qq);
                continue;
            }
            const player = await Read_player(qq);
            const settlementKey = String(event.timestamp);
            if (player.已结算先天至宝事件?.includes(settlementKey)) {
                RealmEvents.markTreasureRewarded(event.timestamp, qq);
                continue;
            }
            const rank = rankByQq.get(qq) || 0;
            const qualified = Boolean(rank);
            const realmPower = Math.max(1,
                (Number(player.level_id) || 0) +
                (Number(player.Physique_id) || 0) +
                (Number(player.mijinglevel_id) || 0) * 2 + 2
            );
            const multiplier = rank === 1 ? 5 : rank > 0 && rank <= 3 ? 3 : qualified ? 2 : 1;
            const reward = realmPower * 10000 * multiplier;
            const traces = rank === 1 ? 30 : rank === 2 ? 20 : rank === 3 ? 15 : qualified ? 8 : 3;
            const fragments = rank === 1 ? 10 : rank === 2 ? 6 : rank === 3 ? 4 : qualified ? 2 : 0;

            if (rank === 1) {
                const owner = readInnateTreasureState().owners?.[event.treasure.name]?.ownerId;
                const ownership = owner === qq ? { ok: true } : claimInnateTreasure(event.treasure.name, qq);
                if (ownership.ok) {
                    const najie = await Read_najie(qq);
                    const equipment = await Read_equipment(qq);
                    const alreadyHas = equipment.至宝?.name === event.treasure.name ||
                        najie.装备?.some(item => item.name === event.treasure.name);
                    if (!alreadyHas) {
                        await Add_najie_thing(qq, createInnateTreasure(event.treasure.name, qq), '装备', 1, 6);
                    }
                }
            } else if (rank === 2 || rank === 3) {
                const projectionName = `${event.treasure.name}·七日投影`;
                const najie = await Read_najie(qq);
                const equipment = await Read_equipment(qq);
                const alreadyHas = equipment.至宝?.name === projectionName ||
                    najie.装备?.some(item => item.name === projectionName);
                if (!alreadyHas) {
                    await Add_najie_thing(
                        qq,
                        createInnateTreasureProjection(event.treasure.name, qq),
                        '装备',
                        1,
                        6
                    );
                }
            }

            const effects = getMinggeEffects(player, data.minggeList);
            player.修为 = (Number(player.修为) || 0) + calculateMinggeGain(reward, effects, '修炼加成');
            player.血气 = (Number(player.血气) || 0) + Math.trunc(reward);
            player.先天道痕 = (Number(player.先天道痕) || 0) + traces + (Number(event.contest.sealProgress) >= 50 ? 5 : 0);
            if (fragments > 0) {
                player.灵宝残片 ||= {};
                player.灵宝残片[event.treasure.name] = (Number(player.灵宝残片[event.treasure.name]) || 0) + fragments;
            }
            player.已结算先天至宝事件 ||= [];
            player.已结算先天至宝事件.push(settlementKey);
            player.已结算先天至宝事件 = player.已结算先天至宝事件.slice(-20);
            await Write_player(qq, player);
            RealmEvents.markTreasureRewarded(event.timestamp, qq);
        }
        return settlement;
    } finally {
        treasureSettlementLocks.delete(lockKey);
    }
}

/**
 * 天骄夺得先天至宝：挂载至宝（战斗引擎自动生效，战力飙升）并全服公告。
 * 玩家随后可通过讨伐该天骄高概率夺回（见 BOSS4 finalizeTianjiaoDefeat）。
 */
async handleTianjiaoTreasureSeized(event, winner) {
    try {
        const tianjiaoName = String(winner.name || '');
        const treasureName = event.treasure?.name;
        const tianjiao = (data.weimiantianjiao_list || []).find(tj => tj?.名号 === tianjiaoName);
        if (!tianjiao || !treasureName) return;
        mountTianjiaoTreasure(tianjiao, treasureName);

        const bossListPath = path.join(data.filePathMap?.lib || '', '位面boss列表.json');
        if (bossListPath) {
            try {
                fs.writeFileSync(bossListPath, JSON.stringify(data.weimiantianjiao_list, null, 2), 'utf8');
            } catch (error) {
                console.error(`[天骄夺宝] 保存天骄列表失败:`, error);
            }
        }

        const message = [
            '【至宝易主·天骄夺宝】',
            `「${treasureName}」择主之争尘埃落定——${tianjiaoName}力压群雄，夺得先天至宝【${treasureName}】！`,
            '天骄持宝，实力陡增，诸天修士皆可前往讨伐夺回！',
            '「先天灵宝，有德者居之——今日当归我！」',
        ].join('\n');
        const groups = config.getConfig('xiuxian', 'xiuxian')?.Era?.notifyGroups || [];
        for (const groupId of groups) {
            try {
                await Bot.sendGroupMsg(groupId, message);
            } catch (error) {
                console.error(`[天骄夺宝] 群 ${groupId} 公告失败:`, error);
            }
        }
        console.log(`[天骄夺宝] ${tianjiaoName} 夺得先天至宝【${treasureName}】`);
    } catch (error) {
        console.error('[天骄夺宝] 结算失败:', error);
    }
}

  /** #熔炼灵宝 至宝名：消耗灵宝残片温养至宝，叠熔炼层数并提升全属性 */
  async MeltInnateTreasure(e) {
    if (!verc({ e })) return false;
    const match = e.msg.match(/^#熔炼灵宝\s+(.*)$/);
    const treasureName = match?.[1]?.trim();
    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!treasureName) return e.reply('请指定要熔炼的至宝名，例如：#熔炼灵宝 混沌珠');
    try {
      const player = await Read_player(usr_qq);
      const fragments = Number(player.灵宝残片?.[treasureName]) || 0;
      if (fragments < 20) {
        return e.reply(`「${treasureName}」灵宝残片不足（${fragments}/20），多参与择主之争收集吧。`);
      }
      const equipment = await Read_equipment(usr_qq);
      const treasure = equipment.至宝;
      if (treasure?.name !== treasureName) {
        return e.reply(`你尚未执掌「${treasureName}」本体，无法熔炼。`);
      }
      const layers = Math.max(0, Math.floor(Number(treasure.灵宝熔炼) || 0));
      if (layers >= 10) return e.reply(`「${treasureName}」已熔炼至极限（10/10），灵性圆满。`);
      const costLingshi = 100000000;
      const costYuanshi = 20000000;
      if ((Number(player.灵石) || 0) < costLingshi || (Number(player.源石) || 0) < costYuanshi) {
        return e.reply(`熔炼需要灵石${bigNumberTransform(costLingshi)}与源石${bigNumberTransform(costYuanshi)}，家底不够。`);
      }
      player.灵宝残片[treasureName] = fragments - 20;
      await Add_灵石(usr_qq, -costLingshi);
      await Add_源石(usr_qq, -costYuanshi);
      treasure.灵宝熔炼 = layers + 1;
      treasure.全属性 = Math.max(0, Math.floor(Number(treasure.全属性) || 0) + 8);
      await Write_player(usr_qq, player);
      await Write_equipment(usr_qq, equipment);
      return e.reply([
        '【灵宝熔炼】',
        `你以 20 枚「${treasureName}」灵宝残片为薪，引灵焰温养至宝，${treasureName}灵性渐复！`,
        `熔炼层数 ${layers} → ${layers + 1}（全属性 +8，当前 ${treasure.全属性}）`,
        '「残片归元，至宝通灵」',
      ].join('\n'));
    } catch (error) {
      console.error('[灵宝熔炼] 失败:', error);
      return e.reply('熔炼时发生错误，请稍后再试。');
    }
  }

async participateRealmEvent(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const player = await Read_player(usr_qq);
    const requestedTypes = e.msg === '#夺宝'
        ? ['treasureAppear']
        : e.msg === '#探查遗迹'
            ? ['emperorLegacy', 'mysteriousRuins']
            : null;
    const events = RealmEvents.getActiveEvents().filter(event => {
        const interaction = RealmEvents.getEventInteraction(event);
        const supported = requestedTypes?.includes('treasureAppear')
            ? interaction === 'treasure'
            : interaction === 'generic';
        return supported && (!requestedTypes || requestedTypes.includes(event.type));
    });
    if (events.length === 0) {
        const bingziLegacy = RealmEvents.getActiveEvent('bingziLegacy');
        if (bingziLegacy) {
            return e.reply([
                '当前开放的是专属玩法【秦门兵字秘传承】，不能用通用参与指令直接领奖。',
                `地点：${formatRealmEventLocation(bingziLegacy)}`,
                `赶路方式：${formatRealmEventTravel(bingziLegacy)}`,
                '抵达后发送 #秦门兵图。'
            ].join('\n'));
        }
        const sectWar = RealmEvents.getActiveEvent('sectWar');
        if (sectWar) {
            return e.reply([
                '当前开放的是专属玩法【圣地大战】，不能用通用参与指令直接领奖。',
                `战场：${formatRealmEventLocation(sectWar)}`,
                `赶路方式：${formatRealmEventTravel(sectWar)}`,
                '抵达后发送 #圣战详情。'
            ].join('\n'));
        }
        return e.reply('当前没有可以直接参与的位面大事件。发送 #大事件 可查看全部事件。');
    }

    const event = events.find(item => getRealmEventReach(player, item).ok);
    if (!event) {
        const destinations = events.slice(0, 3).map(item => [
            `【${RealmEvents.getEventTypeName(item.type)}】${formatRealmEventLocation(item)}`,
            formatRealmEventTravel(item)
        ].filter(Boolean).join('\n'));
        return e.reply([
            '你尚未抵达任何大事件的精确坐标。',
            ...destinations
        ].join('\n'));
    }

    if (event.type !== 'treasureAppear' && event.participantQqs?.includes(String(usr_qq))) {
        return e.reply(`你已经参与过本次【${RealmEvents.getEventTypeName(event.type)}】。`);
    }
    if (!await Go(e)) return false;

    if (event.type === 'treasureAppear') {
        const joined = RealmEvents.joinTreasureEvent(event.timestamp, usr_qq, player.名号);
        if (!joined.ok && joined.reason !== 'duplicate') {
            return e.reply('这场先天至宝择主之争已经结束。');
        }
        if (joined.reason === 'duplicate') {
            return e.reply('你已经参加本次择主之争。发送 #观摩灵宝 或 #查看夺宝进度 继续。');
        }
        const profile = getTreasureContestProfile(event.treasure?.name);
        return e.reply([
            `【${event.treasure.name}·择主之争】`,
            `你已在${formatRealmEventLocation(event)}留下神识烙印。`,
            `天象：${profile.omen}`,
            `你拥有${TREASURE_TRIAL_LIMIT}次天机行动，四种试炼中只能选择三种，每种限一次。`,
            `发送 #观摩灵宝 查看试炼、线索与当前进度。`,
            `至宝将在事件结束后公开评分择主，不会由最先抵达者直接取得。`
        ].join('\n'));
    }

    const participation = RealmEvents.markEventParticipated(event.timestamp, usr_qq);
    if (!participation.ok) {
        return e.reply(participation.reason === 'duplicate'
            ? '你已经参与过本次位面大事件。'
            : '这场位面大事件已经结束。');
    }

    const reward = Math.max(10000, Math.trunc((
        (Number(player.level_id) || 0) +
        (Number(player.Physique_id) || 0) +
        (Number(player.mijinglevel_id) || 0) * 2 + 2
    ) * 5000));
    const actualXiuwei = await Add_修为(usr_qq, reward);
    await Add_血气(usr_qq, reward);

    const outcomes = {
        treasureAppear: '你穿过争夺此宝的修士洪流，截取到一缕先天道韵。',
        merchantVisit: '你与云游商人交换见闻，从其口中悟得一段异域修行心得。',
        sectWar: '你踏入圣地战场，在交锋中磨砺了自身道法。',
        prodigyRise: '你亲临天骄扬名之地，与各方俊杰论道争锋。',
        forbiddenZone: '你在禁区边缘记录大道异变，赶在帝威复苏前全身而退。',
        emperorLegacy: '你触及古帝遗留的道痕，虽未得完整传承，却有所领悟。',
        worldChange: '你抵达天地异变的源点，捕捉到一缕转瞬即逝的大道轨迹。',
        mysteriousRuins: '你踏入遗迹外围完成初步探查，带回一份残缺的古史记录。'
    };
    return e.reply([
        `【${RealmEvents.getEventTypeName(event.type)}·参与成功】`,
        outcomes[event.type] || '你亲历这场位面大事件，并从中有所收获。',
        `事件地点：${formatRealmEventLocation(event)}`,
        `获得修为：${Math.trunc(actualXiuwei || reward).toLocaleString('zh-CN')}`,
        `获得血气：${reward.toLocaleString('zh-CN')}`,
        `当前参与人数：${participation.count}`
    ].join('\n'));
}

async whiteBeardShop(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const event = RealmEvents.getActiveEvent('merchantVisit');
    if (!event || event.merchant?.name !== '白须仙翁' || !Array.isArray(event.stock)) {
        return e.reply('白须仙翁此刻并未在诸天现身。');
    }
    const player = await Read_player(usr_qq);
    if (!getRealmEventReach(player, event).ok) {
        return e.reply([
            `白须仙翁位于：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
    }

    const minutes = Math.max(1, Math.ceil((Number(event.expiresAt) - Date.now()) / 60000));
    const lines = [
        '【白须仙翁·诸天仙炉】',
        `剩余时间：${minutes}分钟`,
        `你的源石：${(Number(player.源石) || 0).toLocaleString('zh-CN')}`,
        ''
    ];
    for (const item of event.stock) {
        if (item.soldTo) {
            lines.push(`【${item.id}】${item.displayName}（已售罄）`, '');
            continue;
        }
        const equipment = item.equipment;
        const recipe = item.recipe.map(entry => `${entry.name}×${entry.count}`).join('、');
        lines.push(
            `【${item.id}】${item.displayName}（${item.type}）`,
            `攻击+${Math.round(equipment.atk * 100)}% 防御+${Math.round(equipment.def * 100)}% 血量+${Math.round(equipment.HP * 100)}% 暴击+${Math.round(equipment.bao * 100)}%`,
            `综合：${item.power}%｜价格：${item.price.toLocaleString('zh-CN')}源石`,
            `配方：${recipe}`,
            `购买：#购买仙翁商品*${item.id}`,
            ''
        );
    }
    return e.reply(lines.join('\n').trim());
}

async buyWhiteBeardItem(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;
    const stockNumber = Number(e.msg.match(/\*(\d+)$/)?.[1]);
    const event = RealmEvents.getActiveEvent('merchantVisit');
    if (!event || event.merchant?.name !== '白须仙翁' || !Array.isArray(event.stock)) {
        return e.reply('白须仙翁此刻并未在诸天现身。');
    }

    const player = await Read_player(usr_qq);
    const reach = getRealmEventReach(player, event);
    if (!reach.ok) {
        return e.reply([
            '你尚未抵达白须仙翁所在的精确坐标。',
            `位置：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
    }
    const stockItem = event.stock[stockNumber - 1];
    if (!stockItem) return e.reply('仙炉中没有这件商品。');
    if (stockItem.soldTo) return e.reply('这件仙宝已经被其他修士买走了。');
    if ((Number(player.源石) || 0) < stockItem.price) {
        return e.reply([
            '【白须仙翁·源石不足】',
            `${stockItem.displayName}需要${stockItem.price.toLocaleString('zh-CN')}源石。`,
            `你当前拥有${(Number(player.源石) || 0).toLocaleString('zh-CN')}源石。`
        ].join('\n'));
    }

    const claimed = RealmEvents.claimMerchantItem(event.timestamp, stockNumber, usr_qq);
    if (!claimed.ok) {
        return e.reply(claimed.reason === 'sold' ? '这件仙宝刚刚被其他修士买走了。' : '这件商品已经不在仙炉中。');
    }

    player.源石 -= claimed.item.price;
    try {
        await Write_player(usr_qq, player);
        await Add_najie_thing(
            usr_qq,
            claimed.item.equipment,
            '装备',
            1,
            claimed.item.equipment.pinji
        );
    } catch (error) {
        player.源石 += claimed.item.price;
        await Write_player(usr_qq, player);
        RealmEvents.releaseMerchantItem(event.timestamp, stockNumber, usr_qq);
        console.error('购买白须仙翁商品失败:', error);
        return e.reply('仙炉交易出现异常，源石已经退还。');
    }

    return e.reply([
        '【白须仙翁·交易完成】',
        `获得：${claimed.item.displayName}`,
        `花费：${claimed.item.price.toLocaleString('zh-CN')}源石`,
        `剩余：${player.源石.toLocaleString('zh-CN')}源石`,
        `装备代号已收入纳戒，可直接使用 #装备 进行穿戴。`
    ].join('\n'));
}

async blackMarketShop(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const event = RealmEvents.getActiveEvent('merchantVisit');
    if (!event || event.merchant?.name !== '黑衣神秘人' || !Array.isArray(event.stock)) {
        return e.reply('黑衣神秘人此刻并未在诸天现身。');
    }
    const player = await Read_player(usr_qq);
    if (!getRealmEventReach(player, event).ok) {
        return e.reply([
            `黑衣神秘人位于：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
    }

    const minutes = Math.max(1, Math.ceil((Number(event.expiresAt) - Date.now()) / 60000));
    const lines = [
        '【黑衣神秘人·无名黑市】',
        `剩余时间：${minutes}分钟`,
        `你的源石：${(Number(player.源石) || 0).toLocaleString('zh-CN')}`,
        ''
    ];
    for (const item of event.stock) {
        if (item.soldTo) {
            lines.push(`【${item.id}】${item.displayName}（已售罄）`, '');
            continue;
        }
        lines.push(
            `【${item.id}】${item.displayName}（${item.category}）`,
            item.description,
            `价格：${item.price.toLocaleString('zh-CN')}源石`,
            `购买：#购买黑市商品*${item.id}`,
            ''
        );
    }
    return e.reply(lines.join('\n').trim());
}

async buyBlackMarketItem(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;
    const stockNumber = Number(e.msg.match(/\*(\d+)$/)?.[1]);
    const event = RealmEvents.getActiveEvent('merchantVisit');
    if (!event || event.merchant?.name !== '黑衣神秘人' || !Array.isArray(event.stock)) {
        return e.reply('黑衣神秘人此刻并未在诸天现身。');
    }

    const player = await Read_player(usr_qq);
    if (!getRealmEventReach(player, event).ok) {
        return e.reply([
            '你尚未抵达黑衣神秘人所在的精确坐标。',
            `位置：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
    }
    const stockItem = event.stock[stockNumber - 1];
    if (!stockItem) return e.reply('黑市货单中没有这件商品。');
    if (stockItem.soldTo) return e.reply('这件货物已经被其他修士买走了。');
    if ((Number(player.源石) || 0) < stockItem.price) {
        return e.reply([
            '【无名黑市·源石不足】',
            `${stockItem.displayName}需要${stockItem.price.toLocaleString('zh-CN')}源石。`,
            `你当前拥有${(Number(player.源石) || 0).toLocaleString('zh-CN')}源石。`
        ].join('\n'));
    }

    const claimed = RealmEvents.claimMerchantItem(event.timestamp, stockNumber, usr_qq);
    if (!claimed.ok) {
        return e.reply(claimed.reason === 'sold' ? '这件货物刚刚被其他修士买走了。' : '这件商品已经不在黑市货单中。');
    }

    player.源石 -= claimed.item.price;
    try {
        await Write_player(usr_qq, player);
        await Add_najie_thing(
            usr_qq,
            claimed.item.item.name,
            claimed.item.item.class,
            claimed.item.quantity || 1
        );
    } catch (error) {
        player.源石 += claimed.item.price;
        await Write_player(usr_qq, player);
        RealmEvents.releaseMerchantItem(event.timestamp, stockNumber, usr_qq);
        console.error('购买黑衣神秘人商品失败:', error);
        return e.reply('黑市交易出现异常，源石已经退还。');
    }

    return e.reply([
        '【无名黑市·交易完成】',
        `获得：${claimed.item.displayName}×${claimed.item.quantity || 1}`,
        `花费：${claimed.item.price.toLocaleString('zh-CN')}源石`,
        `剩余：${player.源石.toLocaleString('zh-CN')}源石`
    ].join('\n'));
}

async fairyFortuneShop(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const event = RealmEvents.getActiveEvent('merchantVisit');
    if (!event || event.merchant?.name !== '绝美仙子') {
        return e.reply('绝美仙子此刻并未在诸天现身。');
    }
    const player = await Read_player(usr_qq);
    if (!getRealmEventReach(player, event).ok) {
        return e.reply([
            `绝美仙子位于：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
    }

    const active = getActiveRedDustFortune(player);
    const activeInfo = active
        ? `当前：${RED_DUST_FORTUNES[active.type].name}（剩余${Math.max(1, Math.ceil((active.expiresAt - Date.now()) / 60000))}分钟）`
        : '当前：未持有生效中的红尘仙缘签';
    const claimed = event.serviceQqs?.includes(String(usr_qq));
    return e.reply([
        '【绝美仙子·红尘仙缘签】',
        `每签价格：${RED_DUST_FORTUNE_COST.toLocaleString('zh-CN')}源石`,
        '三选一，立即生效24小时；不可叠加、续时或中途更换。',
        activeInfo,
        claimed ? '本次相逢你已经求过签。' : '',
        '',
        `1. 问道签：${RED_DUST_FORTUNES.question.description}`,
        '求取：#求取问道签',
        '',
        `2. 历练签：${RED_DUST_FORTUNES.adventure.description}`,
        '求取：#求取历练签',
        '',
        `3. 寻缘签：${RED_DUST_FORTUNES.seeking.description}`,
        '大事件0.2%→1%，位面坐标10%→20%，问仙残痕1%→2%。',
        '求取：#求取寻缘签',
    ].filter(Boolean).join('\n'));
}

async buyFairyFortune(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const event = RealmEvents.getActiveEvent('merchantVisit');
    if (!event || event.merchant?.name !== '绝美仙子') {
        return e.reply('绝美仙子此刻并未在诸天现身。');
    }
    const player = await Read_player(usr_qq);
    if (!getRealmEventReach(player, event).ok) {
        return e.reply([
            '你尚未抵达绝美仙子所在的精确坐标。',
            `位置：${formatRealmEventLocation(event)}`,
            `赶路方式：${formatRealmEventTravel(event)}`
        ].join('\n'));
    }
    const active = getActiveRedDustFortune(player);
    if (active) {
        return e.reply(`你的${RED_DUST_FORTUNES[active.type].name}仍在生效，无法覆盖或续时。`);
    }
    const type = getRedDustFortuneType(e.msg.replace(/^#求取/, ''));
    if (!type) return e.reply('请选择问道签、历练签或寻缘签。');
    if ((Number(player.源石) || 0) < RED_DUST_FORTUNE_COST) {
        return e.reply([
            '【红尘仙缘签·源石不足】',
            `求签需要${RED_DUST_FORTUNE_COST.toLocaleString('zh-CN')}源石。`,
            `你当前拥有${(Number(player.源石) || 0).toLocaleString('zh-CN')}源石。`
        ].join('\n'));
    }

    const claimed = RealmEvents.claimFairyService(event.timestamp, usr_qq);
    if (!claimed.ok) {
        return e.reply(claimed.reason === 'claimed'
            ? '本次相逢你已经求过红尘仙缘签。'
            : '绝美仙子的身影已经消散。');
    }

    player.源石 -= RED_DUST_FORTUNE_COST;
    player.红尘仙缘签 = createRedDustFortune(type, event.timestamp);
    try {
        await Write_player(usr_qq, player);
    } catch (error) {
        player.源石 += RED_DUST_FORTUNE_COST;
        delete player.红尘仙缘签;
        await Write_player(usr_qq, player);
        RealmEvents.releaseFairyService(event.timestamp, usr_qq);
        console.error('求取红尘仙缘签失败:', error);
        return e.reply('求签出现异常，源石已经退还。');
    }

    const fortune = RED_DUST_FORTUNES[type];
    return e.reply([
        `【绝美仙子·${fortune.name}】`,
        fortune.description,
        `花费：${RED_DUST_FORTUNE_COST.toLocaleString('zh-CN')}源石`,
        `剩余：${player.源石.toLocaleString('zh-CN')}源石`,
        `有效期至：${new Date(player.红尘仙缘签.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
    ].join('\n'));
}

async buyCoordinateClue(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    const match = e.msg.match(/^#(?:求购|求取)位面线索\s*([^\s]+)$/);
    if (!match) return e.reply('用法：#求购位面线索 仙界');

    const location = match[1];
    const result = purchaseCoordinateClue(player, location);
    if (result.reason === 'invalid') {
        return e.reply(`无效位面：${location}\n可求购：${getUnknownCoordinates({}).join('、')}`);
    }
    if (result.reason === 'known') return e.reply(`你已记住「${location}」的坐标，无需求购。`);
    if (result.reason === 'insufficient') {
        return e.reply([
            `【重金求购·灵石不足】`,
            `探寻「${location}」的可靠线索需${result.cost.toLocaleString('zh-CN')}灵石。`,
            `你当前仅有${(Number(player.灵石) || 0).toLocaleString('zh-CN')}灵石。`
        ].join('\n'));
    }

    await Write_player(usr_qq, player);
    return e.reply([
        `【重金求购·星路入识】`,
        `你散尽重金，从跨界行商手中换得「${location}」的完整星图线索。`,
        `神识推演后，该位面坐标已烙入识海。`,
        `※ 灵石 -${result.cost.toLocaleString('zh-CN')}`,
        `※ 记忆坐标：${player.记忆坐标.join('、')}`
    ].join('\n'));
}

async exploreCoordinateClue(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);
    const event = RealmEvents.getActiveEvent('coordinateClue');
    if (!event) return e.reply('当前没有仍在显化的位面坐标石壁。');

    const match = e.msg.match(/^#探索位面线索\s*([^\s]+)$/);
    if (!match || match[1] !== event.location) {
        return e.reply(`当前线索位于「${formatRealmEventLocation(event)}」\n请抵达后发送：#探索位面线索 ${event.location}`);
    }
    const currentPlane = Object.keys(PLACE_LOCATION_MAP).find(name => PLACE_LOCATION_MAP[name] === player.power_place);
    if (currentPlane !== event.sourcePlane) {
        return e.reply(`你当前身处${currentPlane || '未知位面'}，需先穿梭至${event.sourcePlane}才能前往${event.location}。`);
    }
    if (event.coordinate) {
        const currentCoordinate = getPlayerPlaneCoordinate(player, event.sourcePlane);
        if (!currentCoordinate || currentCoordinate.x !== event.coordinate.x || currentCoordinate.y !== event.coordinate.y) {
            return e.reply(`你尚未抵达石壁坐标。\n${formatRealmEventTravel(event)}`);
        }
    }
    if (event.claimedQqs?.includes(String(usr_qq))) return e.reply('你已经拓印过这面石壁，道纹不再对你显化。');
    if (hasCoordinate(player, event.targetPlane)) return e.reply(`你早已记住「${event.targetPlane}」的坐标，这面石壁已无新意。`);
    if (!await Go(e)) return false;

    rememberCoordinate(player, event.targetPlane);
    await Write_player(usr_qq, player);
    RealmEvents.markCoordinateClueClaimed(event.timestamp, usr_qq);
    return e.reply([
        `【石壁参悟·坐标已记】`,
        `你赶到「${formatRealmEventLocation(event)}」，拂去石壁尘埃，以神识补全残缺星纹。`,
        `一道横渡诸天的星路在识海中成形，你记住了「${event.targetPlane}」的位面坐标。`,
        `※ 记忆坐标：${player.记忆坐标.join('、')}`
    ].join('\n'));
}

async exploreWenXianStele(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    const event = RealmEvents.getActiveEvent('wenxianClue');
    if (!event) return e.reply('当前没有仍在显化的问仙古碑。');
    if (event.claimedQqs?.includes(String(usr_qq))) return e.reply('你已经参悟过这座问仙古碑。');

    const player = await Read_player(usr_qq);
    if (!isWenXianEligible(player)) {
        return e.reply(`秘境或仙古今世法任一体系达到${WENXIAN_REQUIRED_REALM_LEVEL}级，才能承受问仙古碑的道韵。`);
    }
    const reach = getRealmEventReach(player, event);
    if (!reach.ok) {
        return e.reply([
            `问仙古碑位于：${formatRealmEventLocation(event)}`,
            formatRealmEventTravel(event),
        ].filter(Boolean).join('\n'));
    }
    if (!await Go(e)) return false;

    const result = grantWenXianClue(player, '位面问仙古碑');
    if (result.reason === 'unlocked') return e.reply('你已经激活问仙令，古碑中已无新的传承。');
    if (result.reason === 'known') return e.reply('你已经持有一份问仙线索，无需重复参悟。');
    if (!result.ok) return e.reply('古碑道纹晦暗不明，本次参悟未能得到线索。');

    await Write_player(usr_qq, player);
    RealmEvents.markWenXianClueClaimed(event.timestamp, usr_qq);
    return e.reply([
        '【问仙古碑·残图入识】',
        '古碑上的问仙二字化作道痕，在你识海中凝成一卷残图。',
        `残图最终指向：${formatRealmEventLocation(result.clue)}`,
        formatRealmEventTravel(result.clue),
        '发送 #问仙令 查看完整试炼。',
    ].join('\n'));
}

// 记录位面坐标（消耗1枚星图，记入个人记忆坐标）
async recordCoordinate(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);

    const m = e.msg.match(/^#记坐标\s*([^\s]+)$/);
    if (!m) {
        return e.reply('用法：#记坐标 仙界（消耗1枚星图，记录该位面坐标）');
    }
    const location = m[1];
    if (!PLACE_LOCATION_MAP.hasOwnProperty(location)) {
        return e.reply(`无效位面：${location}\n可用：${Object.keys(PLACE_LOCATION_MAP).join('、')}`);
    }
    if (DEFAULT_KNOWN_LOCATIONS.includes(location)) {
        return e.reply(`「${location}」为默认已知坐标，无需记录。`);
    }
    if (hasCoordinate(player, location)) {
        return e.reply(`你已记住「${location}」的坐标，无需重复记录。`);
    }
    if (!Array.isArray(player.记忆坐标)) player.记忆坐标 = [];
    if ((player.星图 || 0) < 1) {
        return e.reply([
            `【星图不足】`,
            `记录「${location}」坐标需消耗 1 枚星图，你当前没有星图。`,
            `※ 可发送 #购买星图*1 花费3亿灵石购得；成功探索副本每日也有概率直接悟得未知坐标。`
        ].join('\n'));
    }

    player.星图 -= 1;
    rememberCoordinate(player, location);
    await Write_player(usr_qq, player);
    return e.reply([
        `【星图拓印·坐标已记】`,
        `你展开星图，以神识拓印「${location}」的星空坐标，`,
        `将其牢牢记入识海。`,
        `※ 星图 -1（剩余：${player.星图}枚）`,
        `※ 记忆坐标：${player.记忆坐标.join('、')}`
    ].join('\n'));
}

// 在传送阵上刻画位面坐标（消耗灵石，记入传送阵坐标列表）
async engraveCoordinate(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_', '');
    usr_qq = await channel(usr_qq);
    const player = await Read_player(usr_qq);

    const m = e.msg.match(/^#刻画坐标\s*([^\s]+)$/);
    if (!m) {
        return e.reply('用法：#刻画坐标 仙界（消耗灵石，在传送阵上刻入该位面坐标）');
    }
    const location = m[1];
    if (!PLACE_LOCATION_MAP.hasOwnProperty(location)) {
        return e.reply(`无效位面：${location}\n可用：${Object.keys(PLACE_LOCATION_MAP).join('、')}`);
    }
    if (!hasCoordinate(player, location)) {
        return e.reply([
            `【刻画失败·未记坐标】`,
            `你尚未记录「${location}」的个人坐标，无法在阵上刻画。`,
            `※ 请先 #记坐标 ${location} 记下该位面坐标。`
        ].join('\n'));
    }
    if (!Array.isArray(player.传送阵坐标)) player.传送阵坐标 = [];
    if (player.传送阵坐标.includes(location)) {
        return e.reply(`你的传送阵上已刻画「${location}」坐标，无需重复刻画。`);
    }
    if ((player.灵石 || 0) < ENGRAVE_LINGSHI_COST) {
        return e.reply([
            `【刻画失败·灵石不足】`,
            `在传送阵上刻画「${location}」坐标需 ${ENGRAVE_LINGSHI_COST} 灵石，`,
            `你当前灵石不足以完成刻画。`
        ].join('\n'));
    }

    player.灵石 -= ENGRAVE_LINGSHI_COST;
    player.传送阵坐标.push(location);
    await Write_player(usr_qq, player);
    return e.reply([
        `【阵纹刻画·坐标已镌】`,
        `你以无上神能催动传送阵，将「${location}」的星空坐标`,
        `一笔一笔镌刻于阵纹深处，阵图微微震颤，似已锚定彼岸。`,
        `※ 灵石 -${ENGRAVE_LINGSHI_COST}`,
        `※ 已刻画坐标：${player.传送阵坐标.join('、')}`
    ].join('\n'));
}
// ================================================================


// 副本掉落指令处理
async handleDungeonDrop(e) {
    // 1. 解析指令（提取地点名）
    const msg = e.msg.replace(/^#副本掉落\s*/, "").trim();
    if (!msg) {
        return e.reply("❌ 指令格式错误！请使用：#副本掉落[地点名]（如#副本掉落灵墟洞天）");
    }
    const placeName = msg;

    // 2. 定义所有可能的地图数据源
    const allAtlasLists = [
        { name: "遮天位面", list: data.zhetian_list },
        { name: "上苍之上", list: data.shangcang_list },
        { name: "下界八域", list: data.xiajie_list },
        { name: "禁地", list: data.forbiddenarea_list },
        { name: "仙境", list: data.Fairyrealm_list },
        { name: "秘境", list: data.didian_list },
        { name: "九天十地", list: data.jiutianshidi_list },
        { name: "仙府", list: data.timeplace_list },
        { name: "宗门秘境", list: data.guildSecrets_list },
    ];

    // 3. 在所有地图中查找指定地点
    let foundPlace = null;
    let placeType = "未知类型";
    
    for (const atlas of allAtlasLists) {
        if (atlas.list && Array.isArray(atlas.list)) {
            foundPlace = atlas.list.find(item => item.name === placeName);
            if (foundPlace) {
                placeType = atlas.name;
                break;
            }
        }
    }

    // 4. 校验地点是否存在
    if (!foundPlace) {
        return e.reply(`未找到地点：${placeName}`);
    }

    // 5. 准备渲染数据（包含所有掉落等级）
    const renderData = {
        title: `${placeType}·${foundPlace.name}`,
        placeData: {
            Grade: foundPlace.Grade || "未知等级",
            name: foundPlace.name,
            Best: foundPlace.Best || [],
            Price: foundPlace.Price || 0,
            experience: foundPlace.experience || 0,
            shouyuan: foundPlace.shouyuan || 0,
            // 包含所有四个等级的掉落物品
            one: foundPlace.one || [],
            two: foundPlace.two || [],
            three: foundPlace.three || [],
            four: foundPlace.four || [],
            inheritance: foundPlace.inheritance || null
        }
    };

    try {
        // 6. 调用图片生成方法
        const imgBuffer = await get_dungeon_drop_img(e, renderData);
        return e.reply(imgBuffer);
    } catch (err) {
        console.error("生成副本掉落图片失败:", err);
        return e.reply("生成副本掉落图片失败，请稍后再试");
    }
}


}
// 获取掉落图片（复用现有get_diaoluo_img）
export async function get_dungeon_drop_img(e, renderData) {
    // 准备模板数据
    const templateData = {
        title: renderData.title,
        placeData: renderData.placeData,
        user_id: e.user_id,
        pluResPath: e.pluResPath
    };

    // 使用Show类处理模板
    const renderedData = await new Show(e).get_dungeon_drop_template(templateData);

    // 生成图片
    return await puppeteer.screenshot('dungeon_drop', {
        ...renderedData,
        userId: e.user_id,
        playerName: e.player?.名号 || "未知修士"
    });
}
/**
 * 我的任务
 * @return image
 */

export async function get_renwu_img(e) {
  let usr_qq = e.user_id.toString().replace('qg_','');
  usr_qq = await channel(usr_qq);
  let player = await Read_player(usr_qq);
  let user_A;
  let A = e.user_id;
  user_A = A;
  let renwu11 = await Read_renwu();
  let x = await found(user_A);
  let shifu = await find_renwu(A);
  //无存档
  let ifexistplay = data.existData('player', usr_qq);
  if (!ifexistplay) {
      return;
  }
  //判断对方有没有存档
  if (shifu == 0) {
      e.reply('你还没有收过徒弟');
      return;
  }

  let action = await find_renwu(A);
  if (action == false) {
      await fstadd_renwu(A);
  }
  let newaction = await Read_renwu();
  let i;
  for (i = 0; i < newaction.length; i++) {
      if (newaction[i].player == A) {
          //这里是显示
          let dengji = renwu11[x].等级
          let xuyao1 = (dengji * 5 + player.level_id + player.Physique_id) * 20000
          let xuyao2 = (dengji * 5 + player.level_id + player.Physique_id) * 20000
          let xuyao3 = dengji + 1
          let ass;
          ass = newaction[i].经验;
          let renwu1 = '当前没有任务';
          let renwu2 = '当前没有任务';
          let renwu3 = '当前没有任务';
          if (renwu11[x].wancheng1 == 1) {
              renwu1 = `消耗${xuyao1}灵石(每次提交任务时才会刷新)`
          }
          if (renwu11[x].wancheng2 == 1) {
              renwu2 = `获取${xuyao2}灵石(每次提交任务时才会刷新)`
          }
          if (renwu11[x].wancheng3 == 1) {
              renwu3 = `前往${xuyao3}次秘境(沉迷不计入)`
          }
          let wc1;
          let wc2;
          let wc3;
          let rw1 = renwu11[x].jilu1;
          let rw2 = renwu11[x].jilu2;
          let rw3 = renwu11[x].jilu3;
          let wcrw1 = xuyao1;
          let wcrw2 = xuyao2;
          let wcrw3 = xuyao3;
          let new1 = newaction[x].等级;
          let shengji = (dengji * 2200 + 1000) * 10 + 2333
          let need = shengji;
          let need1 = Strand(ass, need);
          let renwu = `还有任务没完成哦~`;
          if (renwu11[x].renwu == 1) {
              renwu = `未领取,输入"#领取每日奖励"领取哦~`
          } else if (renwu11[x].renwu == 2) {
              renwu = `已领取`
          }
          if (renwu11[x].wancheng1 == 0) {
              wc1 = '(未接取)';
          } else if (renwu11[x].wancheng1 == 1) {
              wc1 = '(未完成)';
          } else if (renwu11[x].wancheng1 == 2) {
              wc1 = '(已完成)';
          }
          if (renwu11[x].wancheng2 == 0) {
              wc2 = '(未接取)';
          } else if (renwu11[x].wancheng2 == 1) {
              wc2 = '(未完成)';
          } else if (renwu11[x].wancheng2 == 2) {
              wc2 = '(已完成)';
          }
          if (renwu11[x].wancheng3 == 0) {
              wc3 = '(未接取)';
          } else if (renwu11[x].wancheng3 == 1) {
              wc3 = '(未完成)';
          } else if (renwu11[x].wancheng3 == 2) {
              wc3 = '(已完成)';
          }
          let renwu_data = {
              user_id: usr_qq,
              minghao: player.名号,
              jingyan: ass,
              dengji: new1,
              xuyao: need,
              baifenbixuyao: need1,
              rw1: renwu1,
              rw2: renwu2,
              rw3: renwu3,
              wancheng1: wc1,
              wancheng2: wc2,
              wancheng3: wc3,
              zhuangtai: renwu,
              wc1: rw1,
              wc2: rw2,
              wc3: rw3,
              xuyao1: wcrw1,
              xuyao2: wcrw2,
              xuyao3: wcrw3,
          };
          const data1 = await new Show(e).get_renwuData(renwu_data);
          return await puppeteer.screenshot('renwu', {
              ...data1,
          });
      }
  }
}


/**
* @description: 进度条渲染
* @param {Number} res 百分比小数
* @return {*} css样式
*/

async function found(A) {
  let renwu = await Read_renwu();
  let i;
  for (i = 0; i < renwu.length; i++) {
      if (renwu[i].player == A) {
          break;
      }
  }
  return i;
}

function Strand(now, max) {
  let num = (now / max * 100).toFixed(0);
  let mini
  if (num > 100) {
      mini = 100
  } else {
      mini = num
  }
  let strand = {
      style: `style=width:${mini}%`,
      num: num
  };
  return strand
}
/**
 * 计算时间缩减效果并生成对应消息
 * @param {Object} player 玩家对象
 * @returns {Object} 包含时间缩减值和消息数组的对象
 */
async function calculateTimeReduction(player) {
    let timeReduction = 0;
    const msgs = [];
    
    // 检查玩家是否拥有行字秘
    const hasXingziMi = player.学习的功法.includes('行字秘');
    
    // 检查玩家是否拥有天璇步法（且没有行字秘）
    const hasTianxuanBufa = !hasXingziMi && player.学习的功法.includes('天璇步法');

    // 行字秘效果（优先级最高）
    if (hasXingziMi) {
        let xingziReduction = 2;
        const xingziTexts = [
            `【行字秘·极速奥义】`,
            `你足下道纹流转，身形如电，`,
            `施展行字秘，速度骤增！`,
            `行字秘运转间：`,
            `- 步伐玄妙，缩地成寸`,
            `- 身形飘忽，难觅踪迹`
        ];

        // 根据境界增强效果
        if (player.mijinglevel_id >= 9) {
            xingziReduction += 1;
            xingziTexts.push(`脚下金莲隐现，速度更上一层`);
        }
        if (player.mijinglevel_id >= 16) {
            xingziReduction += 1;
            xingziTexts.push(`时光碎片缭绕，触及时间领域`);
        }

        xingziTexts.push(
            `"天下极速，唯我行字！"`,
            `时间减少${xingziReduction}分钟`
        );
        timeReduction += xingziReduction;
        msgs.push(xingziTexts.join('\n'));
    }
    // 天璇步法效果（只在没有行字秘时触发）
    else if (hasTianxuanBufa) {
        const tianxuanTexts = [
            `【天璇步法·残篇奥义】`,
            `足下道纹流转，身形如烟似幻，`,
            `天璇步法展动间：`,
            `- 缩地成寸，山河倒转如浮光掠影`,
            `- 残影留空，十步之外难辨真身`,
            `"步罡踏斗，天璇遗韵！"`,
            `时间减少1分钟（残缺秘法，未达极速真谛）`
        ];
        timeReduction += 1;
        msgs.push(tianxuanTexts.join('\n'));
    }

    // 道法仙术效果（独立触发）
    if (isDaofaActive(player)) {
        timeReduction += 2;
        msgs.push('受到道法仙术加持，历练时间减少2分钟');
    }
    /**
     * ===== 命格 · 秘境加速（消费层，走契约层/原语层）=====
     * 秘境加速为 flat-seconds（秒），由原语层从配置表解析，
     * 统一换算为分钟并入 timeReduction，文案展示秒数。
     */
    const secretPlaceEffects = getMinggeEffects(player, data.minggeList);
    const secretPlaceReductionMs = getMinggeSecretPlaceReductionMs(secretPlaceEffects);
    if (secretPlaceReductionMs > 0) {
        timeReduction += secretPlaceReductionMs / 60000;
        const secretPlaceSecs = Math.round(secretPlaceReductionMs / 1000);
        msgs.push(
            `【命格·秘境加速】\n` +
            `命格加护，你对秘境法则的亲和大幅提升，\n` +
            `行动如游鱼入海，无滞无碍。\n` +
            `时间减少${secretPlaceSecs}秒`
        );
    }
    return { timeReduction, msgs };
}
export async function zhetianweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_zhetian_placeData(get_data);
    return await puppeteer.screenshot('get_zhetian_placeData', {
        ...data1,
    });
}
export async function shangcangweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_shangcang_placeData(get_data);
    return await puppeteer.screenshot('get_shangcang_placeData', {
        ...data1,
    });
}
export async function xiajieweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_xiajie_placeData(get_data);
    return await puppeteer.screenshot('get_xiajie_placeData', {
        ...data1,
    });
}
export async function shangjieweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_shangjie_placeData(get_data);
    return await puppeteer.screenshot('get_shangjie_placeData', {
        ...data1,
    });
}
export async function xianjingweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_xianjing_placeData(get_data);
    return await puppeteer.screenshot('get_xianjing_placeData', {
        ...data1,
    });
}
export async function jindiweizhi(e, weizhi, addres) {
    let get_data = {
        didian_list: weizhi,
        addres: addres
    }
    const data1 = await new Show(e).get_jindi_placeData(get_data);
    return await puppeteer.screenshot('get_jindi_placeData', {
        ...data1,
    });
}
// 时间格式化函数
function formatTime(ms) {
    const minutes = Math.floor(ms / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${minutes}分${seconds}秒`;
}

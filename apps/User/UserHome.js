import { getSuiyunEffects } from '../../model/suiyun.js';
import { getMemoryEffects } from '../../model/memoryPath.js';
import { addMemoryLootBonus } from '../../model/suiyunLoot.js';
import { getLearningPotentialCost } from '../../model/gongfaTeaching.js';
import { plugin,  verc, data, config } from '../../api/api.js';
import {
  calculateMinggeCost,
  calculateMinggeYield,
  createPlayerMingge,
  drawMingge,
  formatMinggeDrawMessage,
  formatMinggeEffectValue,
  getMinggeDirectMultiplier,
  getMinggeEffects,
  grantMinggePotential,
  applyInitialMinggeEffectsRaw,
  rollbackInitialMinggeEffects,
} from '../../model/mingge.js';
import path from 'path';
import xiuxianData from '../../model/XiuxianData.js';
import fs from 'fs';
import {
  Read_player,
  existplayer,
  exist_najie_thing,
  instead_equipment,
  player_efficiency,
  Read_najie,
  getPinjiName,
  Write_linggen,
  get_random_aptitude,
  get_random_talent,
  Write_player,
  sleep,
  Add_血气,
   Add_职业经验,
  Add_灵石,
  Add_源石,
  Add_热量,
  Add_饱食度,
  Add_najie_thing,
  Add_HP,
  Add_修为,
  Add_寿元,
  Add_魔道值,
  Read_danyao,
  Write_danyao,
  Go,
  Add_仙宠,
  Add_player_学习功法,
  Reduse_player_学习功法,
  Add_najie_灵石,
  isNotNull,
  Read_equipment,
  Write_equipment,
  Write_najie,
  foundthing,
  convert2integer,
  GetPower,
  get_equipment_img,
  channel,
  isXiuxianAdmin} from '../../model/xiuxian.js';
import {__PATH} from '../../model/xiuxian.js';
import { AppName } from '../../app.config.js';
import { readall } from '../../model/duanzaofu.js';
import { bigNumberTransform } from '../Help/TopList.js';
import { isInnateTreasureName } from '../../model/innateTreasure.js';
import {
  getSpiritHeartBaseMax,
  getSpiritHeartMax,
  increaseSpiritHeartLimit,
  refreshSpiritHeart,
} from '../../model/spiritUniverse.js';
import { applyDaoHeartFruit, DAO_HEART_MAX } from '../../model/daoHeart.js';
import {
  findItemSources,
  parseItemSearchQuery,
} from '../../model/itemSourceFinder.js';
import {
  activateTianjiaoScent,
  calculateTianjiTrainingReward,
} from '../../model/tianjiTalismans.js';
import { resetIneligibleShengtiCultivation } from '../../model/shengtiCultivation.js';
import { openJadeCasket } from '../../model/baitianTemple.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import {
  bindBasicZhutianMirror,
  getActiveZhutianAvatarName,
  syncCurrentZhutianAvatar,
} from '../../model/zhutianMirror.js';
import {
  accelerateSecretPlaceAction,
  getSecretPlaceActionEndTime,
  SECRET_PLACE_SETTLEMENT_BUSY,
  withSecretPlaceSettlementLock,
} from '../../model/secretPlaceAddiction.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import {
  isShengfaClaimed,
  SHENGFA_REFINING,
  SHENGFA_REFINE_MS,
  startShengfaRefinement,
} from '../../model/shengfaFragment.js';
import {
  FISHING_EVENT_CHOICE_MS,
  getFishingTide,
  getImmortalFishingCooldown,
  getImmortalBaitConfig,
  parseImmortalBait,
  recordFishCatch,
  rollBaitRewardAmount,
  rollImmortalBaitReward,
  rollPlaneFish,
  rollPlaneFishingEvent,
  rollWishScaleAmount,
} from '../../model/immortalFishing.js';
import { tryCreateFishKing } from '../../model/immortalFishKing.js';
import { getPlayerPlaneName } from '../../model/planeCoords.js';
import { PLACE_LOCATION_MAP } from '../../model/weimianTravel.js';
import {
  consumeFishAtlasSets,
  getPendingFishAtlasRewards,
  markFishAtlasRewardsClaimed,
} from '../../model/immortalFishingProgress.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { isCultivatingExtraPath } from '../../model/extraCultivation.js';
import { isHighRealmConsumableRestricted } from '../../model/realmAuthority.js';
import { selectEquipmentByCode } from '../../model/equipmentSwap.js';
import { isCanonicalDaluoSwordEmbryo, isFixedStatEquipment, MAX_PERCENT_EQUIPMENT_STAT } from '../../model/equipmentStats.js';
import {
  calculateLifeSourceRepairBaseCost,
  getLifeSourceRepairMaximum,
} from '../../model/lifeSourceRepair.js';
import { isTianmoHuashengPhysique } from '../../model/tianmoHuasheng.js';
import {
  recordGuidedTalent,
  resolveGuidedTalent,
  formatGuidedTalentList,
} from '../../model/linggenGuidance.js';
import {
  hasCompletedZhiXian,
  migrateCompletedZhiXianTasks,
} from '../meirrenwu/zhixianChoice.js';

const FLOWER_BREATHING_METHODS = new Set([
  '基础呼吸法',
  '形意呼吸法',
  '太极呼吸法',
  '大雷音呼吸法',
  '道引呼吸法',
  '盗引呼吸法',
]);

const ROOT_MUTATION_ITEMS = new Set([
  '堕魔骨',
  '轮回道果',
  '武祖权柄',
  '邪神道果',
  '荒古源血晶',
  '圆神终极本源',
  '先天混沌圣体道胎本源',
  '圣法碎片',
]);
const ROOT_MUTATION_MEDICINE_TYPES = new Set(['补根', '补天', '灵根']);
/**
 * 全局变量
 */
let allaction = false;//全局状态判断
export class UserHome extends plugin {
  constructor() {
    super({
      name: 'UserHome',
      dsc: '修仙模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#(存|取)灵石(.*)$',
          fnc: 'Take_lingshi',
        },
        {
          reg: '^#(装备|消耗|服用|学习|打开|寻宝|加工|孵化|合成)((.*)|(.*)*(.*))$',
          fnc: 'Player_use',
        },
        {
          reg: '^#购买((.*)|(.*)*(.*))$',
          fnc: 'Buy_comodities',
        },
        {
          reg: '^#瑶池兑换((.*)|(.*)*(.*))$',
          fnc: 'Buy_yaochi',
        },
                {
          reg: '^#摇光兑换((.*)|(.*)*(.*))$',
          fnc: 'Buy_yaoguang',
        },
         {
          reg: '^#剑云海兑换((.*)|(.*)*(.*))$',
          fnc: 'Buy_jianyunhai',
        },
         {
          reg: '^#剑宫兑换((.*)|(.*)*(.*))$',
          fnc: 'Buy_suiyunjianGong',
        },
        {
          reg: '^#出售.*$',
          fnc: 'Sell_comodities',
        },
        {
          reg: '^#哪里有(.*)$',
          fnc: 'find_thing',
        },
        {
          reg: '^#检查存档.*$',
          fnc: 'check_player',
        },
        {
          reg: '^#抽(天地卡池|灵界卡池|凡界卡池)$',
          fnc: 'sk',
        },
        {
          reg: '^#供奉奇怪的石头$',
          fnc: 'Add_lhd',
        },
        {
          reg: '^#活动兑换.*$',
          fnc: 'huodong',
        },
        {
          reg: '^#回收.*$',
          fnc: 'huishou',
        },
        {
          reg: '^#打磨.*$',
          fnc: 'refining',
        },
        {
          reg: '^#修仙世界$',
          fnc: 'world',
        },
        {
          reg: '^#修仙攻略$',
          fnc: 'gonglue',
        },
         {
          reg: '^#垂钓众生(?:\\s+.*)?$',
          fnc: 'chuidiao',
        },
        {
          reg: '^#领取游玩礼包$',
          fnc: 'chengzhang',
        },
{
    reg: '^#使用引灵仙符\\s*(.*)$',
    fnc: 'useLinggenToken'
},

{
    reg: '^#使用锁灵仙符$',
    fnc: 'useLockLinggenToken'
},
{
    reg: '^#(?:查看|保留|选择)引灵结果(?:\\s*\\*?\\s*.*)?$',
    fnc: 'chooseLinggenResult'
},
{
    reg: '^#修复道伤$',
    fnc: 'repairDaoshang'
},
{
    reg: '^#修复生命本源(\\*\\d+)?$', // 支持 #修复生命本源 和 #修复生命本源*点数
    fnc: 'shengmingbenyuan'
},
{
    reg: '^#切换重抽命格(\\s+\\d+|\\*\\d+)?$',
    fnc: 'switchRerollFate'
},
{
    reg: '^#选择轮回命签\\*(\\d+)$',
    fnc: 'chooseBatchRerollFate'
},
{
    reg: '^#保留轮回命签$',
    fnc: 'chooseBatchRerollFate'
}
      ],
    });
   
  }
async shengmingbenyuan(e) {
    if (!verc({ e })) return false;
    
    const usr_qq = e.user_id.toString().replace('qg_','');
    
    // 1. 检查玩家存在性
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    
    // 2. 获取玩家数据
    const player = await Read_player(usr_qq);
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    const maxLifeBase = getLifeSourceRepairMaximum(player, minggeEffects?.生命本源额外);

    // 旧天魔存档的本源迁移在读取时完成；满值早退前先持久化一次。
    if (isTianmoHuashengPhysique(player) && player.天魔化生?.生命本源版本 >= 2) {
        await Write_player(usr_qq, player);
    }
    
    // 3. 检查是否需要修复
    if (player.生命本源 >= maxLifeBase) {
        return e.reply("你的生命本源充盈无缺，无须修复");
    }

    // 4. 解析命令参数（支持 #修复生命本源*点数 格式）
    const args = e.msg.split('*');
    let requestedPoints = 0;
    
    if (args.length > 1 && !isNaN(parseInt(args[1]))) {
        requestedPoints = parseInt(args[1]);
    }
    
    // 5. 计算缺失的生命本源
    const missingLife = maxLifeBase - player.生命本源;
    // 未指定点数或指定为0时修复全部，超出的部分自动截到上限
    const repairPoints = requestedPoints > 0
      ? Math.min(requestedPoints, missingLife)
      : missingLife;

    // 保留原有每50点一阶的价格梯度，但允许逐点支付和修复
    let totalCost = calculateLifeSourceRepairBaseCost(player.生命本源, repairPoints);
    
    // 9. 境界加成系数
    const realmFactor = 1 + (player.mijinglevel_id + player.xiangulevel_id) * 0.1;
    totalCost = Math.floor(totalCost * realmFactor);
    // 9.1 命格·修复本源代价影响（代价减少/增加）
    const originalRepairCost = totalCost;
    totalCost = calculateMinggeCost(
      originalRepairCost,
      minggeEffects,
      '修复本源代价减少',
      '修复本源代价增加',
      { minimum: 1 }
    );

    // 10. 资源检查
    if (player.修为 < totalCost || player.血气 < totalCost) {
        return e.reply([
            `「生命本源亏损，难以为继」`,
            `修复${repairPoints}点需消耗：`,
            `修为：${totalCost.toLocaleString()}`,
            `血气：${totalCost.toLocaleString()}`,
            `当前不足：`,
            `修为差：${(totalCost - player.修为).toLocaleString()}`,
            `血气差：${(totalCost - player.血气).toLocaleString()}`
        ].join("\n"));
    }

    // 11. 执行修复
    player.修为 -= totalCost;
    player.血气 -= totalCost;
    player.生命本源 += repairPoints; // 修复指定点数
    
    // 12. 保存数据
    await Write_player(usr_qq, player);

    // 13. 结果反馈
    const minggeLine = totalCost === originalRepairCost
      ? ''
      : `命格影响：修复代价${totalCost < originalRepairCost ? '减少' : '增加'}${Math.abs(originalRepairCost - totalCost).toLocaleString()}`;
    return e.reply([
        `【生命本源修复完成】`,
        `修复点数：${repairPoints}点`,
        `当前状态：${player.生命本源}/${maxLifeBase}`,
        `消耗修为：${totalCost.toLocaleString()}`,
        `消耗血气：${totalCost.toLocaleString()}`,
        minggeLine,
        `「本源修复，道基渐固」`,
        player.生命本源 < maxLifeBase ? `可继续修复剩余${maxLifeBase - player.生命本源}点` : `本源已完全恢复`
    ].filter(Boolean).join("\n"));
}
async repairDaoshang(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    
    // 获取玩家数据
    const player = await Read_player(usr_qq);
    
    // 检查是否存在道伤
    if (!player.道伤 || player.道伤 <= 0) {
        e.reply("你并未受到道伤困扰，无需修复。");
        return true;
    }
    
    // 检查玩家学习的功法
    const learnedSkills = player.学习的功法 || [];
    
    // 定义修复道伤所需的功法及其修复效率
    const daoshangSkills = {
        "柳神法": 1.0,      // 最强修复能力
        "不灭经": 1.0,      // 最强修复能力
        "真凰宝术": 1.0,    // 最强修复能力
        "补天术": 0.7,      // 中等修复能力
        "者字秘": 0.7,      // 中等修复能力
        "万化圣诀": 0.45,   // 中等修复能力
        "涅槃经": 0.3,     // 最弱修复能力
        "凰劫再生术": 0.3  // 最弱修复能力
    };
    
    // 检查是否学习过至少一种修复道伤的功法
    const availableSkills = Object.keys(daoshangSkills).filter(skill => 
        learnedSkills.includes(skill)
    );
    
    if (availableSkills.length === 0) {
        e.reply([
            "「大道伤痕，非寻常手段可医」",
            "你未曾修习过修复道伤的至高秘法：",
            "柳神法、不灭经、真凰宝术、补天术、者字秘、万化圣诀、涅槃经、凰劫再生术",
            "无法修复自身道伤，需寻得这些无上法门方可尝试。"
        ].join("\n"));
        return true;
    }
    
    // 获取最强功法及其修复效率
    const strongestSkill = availableSkills.reduce((prev, curr) => 
        daoshangSkills[prev] > daoshangSkills[curr] ? prev : curr
    );
    const repairEfficiency = daoshangSkills[strongestSkill];
    
    // 使用您提供的公式计算修复消耗
    let reward = 5000000; // 基础消耗常量
    let daoshangMultiplier = 1 + (player.道伤 * 0.5); // 道伤越重，消耗越大
    let zuizhong = (player.level_id+player.Physique_id+player.mijinglevel_id + player.xiangulevel_id) * reward * daoshangMultiplier;
    const originalRepairCost = Math.ceil(zuizhong * (1 / repairEfficiency)); // 功法效率越低，总消耗越高
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    zuizhong = calculateMinggeCost(
      originalRepairCost,
      minggeEffects,
      '修复道伤代价减少',
      '修复道伤代价增加',
      { minimum: 1 }
    );
    const minggeRepairLine = zuizhong === originalRepairCost
      ? ''
      : `命格影响：修复代价${zuizhong < originalRepairCost ? '减少' : '增加'}${Math.abs(originalRepairCost - zuizhong).toLocaleString()}`;
    
    // 检查修为和血气是否足够
    if (player.修为 < zuizhong || player.血气 < zuizhong) {
        e.reply([
            "「道基亏损，难以为继」",
            "彻底修复道伤需消耗海量修为与血气：",
            `需修为: ${zuizhong.toLocaleString()}`,
            `需血气: ${zuizhong.toLocaleString()}`,
            `当前修为: ${player.修为.toLocaleString()}`,
            `当前血气: ${player.血气.toLocaleString()}`,
            "修为血气不足，无法完成道伤修复。",
            minggeRepairLine
        ].filter(Boolean).join("\n"));
        return true;
    }
    
    // 根据功法组合生成不同的修复文案
    let repairMsg = "";
    
    if (availableSkills.includes("柳神法") && availableSkills.includes("者字秘")) {
        repairMsg = [
            "「柳神涅槃，者字回天·道伤尽愈」",
            "你盘坐于虚空，身后通天柳树显现，万千枝条缭绕混沌气，垂落生命精华。",
            "同时运转者字秘，肉身发光，血液如雷鸣，道则碎片彻底重组。",
            "柳神法助你涅槃重生，者字秘修复精气神，两者合一，大道伤痕瞬间愈合。",
            "道基被完美修补，紫府中崩裂的大道根基重新凝聚，道伤尽去！"
        ].join("\n");
    } 
    else if (availableSkills.includes("真凰宝术") && availableSkills.includes("凰劫再生术")) {
        repairMsg = [
            "「真凰涅槃，劫后再生·道痕尽消」",
            "你周身燃起真凰火焰，羽毛状的符文环绕，如凤凰浴火重生。",
            "凰劫再生术运转，引动天地精华，褪去旧躯，再生新我。",
            "道伤被真凰火焰彻底灼烧净化，新的完美道基在灰烬中重生。",
            "凤凰涅槃，焚尽道伤，再现完美无瑕的道基！"
        ].join("\n");
    }
    else if (availableSkills.includes("万化圣诀") && availableSkills.includes("不灭经")) {
        repairMsg = [
            "「万化归元，不灭铸基·大道圆满」",
            "你运转万化圣诀，化尽道伤中的顽固法则，将其分解为最本源的能量。",
            "再以不灭经重铸道基，肉身不坏，元神不朽。",
            "道伤被万化圣诀彻底化去，又以不灭经重塑完美道基，完成终极的破而后立！"
        ].join("\n");
    }
    else if (availableSkills.includes("补天术")) {
        repairMsg = [
            "「补天之道，修复天道伤痕·完美如初」",
            "你施展补天术，引动天地精华，如女娲补天般彻底修补自身道基。",
            "大道符文浮现，完全填补道伤裂痕，重塑完美无瑕的道果。",
            "补天术不愧为修复道伤的无上秘法，大道伤痕彻底愈合！"
        ].join("\n");
    }
    else {
        // 使用最强功法单独修复
        repairMsg = [
            `「${strongestSkill}·道伤尽复」`,
            `你运转${strongestSkill}，全力修复大道伤痕。`,
            `道则流转，符文闪烁，在${strongestSkill}的作用下，道伤被彻底治愈。`,
            `大道伤痕完全愈合，道基完美如初！`
        ].join("\n");
    }
    
    // 记录原始道伤值
    const originalDaoshang = player.道伤;
    
    // 扣除消耗
    player.修为 -= zuizhong;
    player.血气 -= zuizhong;
    
    // 一次性完全修复道伤
    player.道伤 = 0;
    
    // 清除道伤修复度（如果存在）
    if (player.道伤修复度) {
        delete player.道伤修复度;
    }
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 构建回复消息
    const msg = [
        repairMsg,
        "",
        "【道伤已愈】",
        `大道伤痕已从 ${originalDaoshang.toFixed(1)} 完全修复至 0！`,
        `修复功法：${strongestSkill}`,
        `修复效率：${(repairEfficiency * 100).toFixed(0)}%`,
        minggeRepairLine,
        `消耗修为：${zuizhong.toLocaleString()}`,
        `消耗血气：${zuizhong.toLocaleString()}`,
        `当前修为：${player.修为.toLocaleString()}`,
        `当前血气：${player.血气.toLocaleString()}`,
        "",
        "「大道伤痕已愈，仙路再续，道基完美无瑕！」",
        "从此仙路畅通，再无道伤阻碍！"
    ].join("\n");
    
    e.reply(msg);
    return true;
}

// 切换轮回命签重抽目标：先在面板/图鉴确认想重抽第几条，切换后再 #消耗轮回命签 重抽
async switchRerollFate(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) {
        e.reply("请先创建修仙角色");
        return true;
    }
    const player = await Read_player(usr_qq);
    const fates = [player?.命格, ...(Array.isArray(player?.附加命格) ? player.附加命格 : [])].filter(Boolean);
    if (!fates.length) {
        e.reply('你尚未抽取命格词条，请先发送 #抽取命格词条。');
        return true;
    }
    const m = e.msg.match(/(\d+)/);
    const requested = m ? Number(m[1]) : null;
    if (requested === null) {
        const list = fates.map((f, i) => `第${i + 1}条：${f.name || '无名命格'}${f.isNegative ? '（厄）' : ''}`).join('\n');
        const cur = Number(player.重抽命格序号) || 1;
        e.reply(
            `【命格重抽·目标切换】\n` +
            `当前已选重抽目标：第${cur}条（${fates[cur - 1]?.name || '—'}）\n\n` +
            `可重抽命格：\n${list}\n\n` +
            `发送 #切换重抽命格*序号 或 #切换重抽命格 序号 选择要重抽的命格，再 #消耗轮回命签 重抽。`
        );
        return true;
    }
    if (requested < 1 || requested > fates.length) {
        e.reply(`命格词条序号应为 1 至 ${fates.length}。`);
        return true;
    }
    player.重抽命格序号 = requested;
    await Write_player(usr_qq, player);
    e.reply(
        `【命格重抽·目标切换】\n` +
        `已将重抽目标切换为第${requested}条命格：${fates[requested - 1]?.name || '无名命格'}。\n` +
        `发送 #消耗轮回命签 即可重抽该命格（也可 #消耗轮回命签*序号 直接指定）。`
    );
    return true;
}

// 批量重抽：消耗 count 枚轮回命签，对第 requested 条命格重抽 count 次，
// 只统计分布、不改变玩家命格，结果暂存于 player.轮回命签暂存，等待玩家抉择。
async batchRerollFate(e, player, usr_qq, requested, count, data) {
    if (!verc({ e })) return false;
    count = Math.max(1, Math.min(999, Math.trunc(Number(count) || 0)));
    if (!count) {
        e.reply('重抽次数必须为正整数。');
        return true;
    }
    const fates = [player?.命格, ...(Array.isArray(player?.附加命格) ? player.附加命格 : [])].filter(Boolean);
    if (requested < 1 || requested > fates.length) {
        e.reply(`命格词条序号应为 1 至 ${fates.length}。`);
        return true;
    }
    const have = await exist_najie_thing(usr_qq, '轮回命签', '道具');
    if (have < count) {
        e.reply(`你的【轮回命签】不足，需要 ${count} 枚，当前仅 ${have} 枚。`);
        return true;
    }
    if (!Array.isArray(player.附加命格)) player.附加命格 = [];
    // 与单抽保持一致：排除其它已占用命格与自身，避免重抽回同一条
    const occupied = new Set(fates.filter((_, index) => index !== requested - 1).map(item => item.id));
    let pool = data.minggeList.filter(item => !occupied.has(item.id) && item.id !== fates[requested - 1]?.id);
    if (!pool.length) pool = data.minggeList;

    // 批量重抽，仅统计每种命格出现次数
    const tally = new Map(); // id -> { mingge, count }
    for (let i = 0; i < count; i++) {
        const mingge = drawMingge(pool);
        const entry = tally.get(mingge.id);
        if (entry) entry.count++;
        else tally.set(mingge.id, { mingge, count: 1 });
    }
    // 排序：稀有度降序（传说>稀有>普通），同稀有度按出现次数降序，便于择优
    const candidates = [...tally.values()].sort((a, b) => {
        const ra = Number(b.mingge.rarity) - Number(a.mingge.rarity);
        if (ra !== 0) return ra;
        return b.count - a.count;
    }).map(c => ({
        id: c.mingge.id,
        name: c.mingge.name,
        count: c.count,
        isNegative: c.mingge.isNegative === true,
        rarityName: c.mingge.rarityName,
    }));

    // 扣除命签，暂存候选，等待玩家抉择（此时尚未改动玩家命格）
    await Add_najie_thing(usr_qq, '轮回命签', '道具', -count);
    player.轮回命签暂存 = {
        序号: requested,
        次数: count,
        候选: candidates,
        旧命格名: fates[requested - 1]?.name || '无名命格',
        旧命格id: fates[requested - 1]?.id,
    };
    await Write_player(usr_qq, player);

    const list = candidates.map((c, i) => {
        const m = data.minggeList.find(x => x.id === c.id);
        const eff = m ? Object.entries(m.effects || {}).map(([k, v]) => `${k}${formatMinggeEffectValue(k, v)}`).join('，') : '';
        return `${i + 1}. ${c.name}（${c.rarityName || ''}${c.isNegative ? '·厄' : ''}） ×${c.count}${eff ? `\n    ${eff}` : ''}`;
    }).join('\n');

    e.reply(
        `【轮回命签·批量重抽】\n` +
        `对第${requested}命格【${player.轮回命签暂存.旧命格名}】重抽了 ${count} 次，消耗轮回命签 ${count} 枚。\n\n` +
        `本次抽中命格分布：\n${list}\n\n` +
        `请抉择（命签已消耗，二选一）：\n` +
        `· 发送 #选择轮回命签*序号 保留重抽结果中你想要的那条（如 #选择轮回命签*1）\n` +
        `· 发送 #保留轮回命签 则保留现有命格不变`
    );
    return true;
}

// 玩家对批量重抽结果的最终抉择：保留某条重抽命格，或保留现有命格不变。
async chooseBatchRerollFate(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) {
        e.reply('请先创建修仙角色');
        return true;
    }
    const player = await Read_player(usr_qq);
    const temp = player.轮回命签暂存;
    if (!temp) {
        e.reply('当前没有待抉择的轮回命签重抽结果，请先 #消耗轮回命签*序号*次数 进行批量重抽。');
        return true;
    }
    // 玩家选择保留现有命格
    if (/保留/.test(e.msg)) {
        delete player.轮回命签暂存;
        await Write_player(usr_qq, player);
        e.reply(`【轮回命签·纹丝不动】你选择保留现有第${temp.序号}命格【${temp.旧命格名}】，重抽结果已舍弃（命签已消耗）。`);
        return true;
    }
    // 玩家选择保留重抽结果中的某一条
    const pick = Number(e.msg.match(/\*(\d+)/)?.[1]);
    if (!pick || pick < 1 || pick > temp.候选.length) {
        e.reply(`请发送 #选择轮回命签*序号（1 至 ${temp.候选.length}）来选择要保留的重抽命格，或 #保留轮回命签 保留现有。`);
        return true;
    }
    const fates = [player?.命格, ...(Array.isArray(player?.附加命格) ? player.附加命格 : [])].filter(Boolean);
    if (temp.序号 < 1 || temp.序号 > fates.length) {
        delete player.轮回命签暂存;
        await Write_player(usr_qq, player);
        e.reply('原重抽目标已失效（命格数量发生变动），暂存已清除，请重新批量重抽。');
        return true;
    }
    const chosen = temp.候选[pick - 1];
    const mingge = data.minggeList.find(m => m.id === chosen.id);
    if (!mingge) {
        delete player.轮回命签暂存;
        await Write_player(usr_qq, player);
        e.reply('所选命格已不在命盘之中，暂存已清除。');
        return true;
    }
    if (!Array.isArray(player.附加命格)) player.附加命格 = [];
    // 与单抽一致：先回滚旧命格「获得时」一次性效果，再写入并重算新命格
    const oldMingge = data.minggeList.find(m => m.id === temp.旧命格id);
    rollbackInitialMinggeEffects(player, oldMingge?.effects);
    const stored = createPlayerMingge(mingge);
    stored.初始效果已应用 = true;
    if (temp.序号 === 1) player.命格 = stored;
    else player.附加命格[temp.序号 - 2] = stored;
    applyInitialMinggeEffectsRaw(player, mingge.effects);
    delete player.重抽命格序号;
    delete player.轮回命签暂存;
    await Write_player(usr_qq, player);
    e.reply(`【轮回命签·重定命数】\n第${temp.序号}命格：${temp.旧命格名} → ${mingge.name}\n\n${formatMinggeDrawMessage(mingge, player.名号)}`);
    return true;
}

async chooseLinggenResult(e) {
    if (!verc({ e })) return false;

    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (!await existplayer(usr_qq)) return false;

    return withPlayerMutationLock(usr_qq, async () => {
        const player = await Read_player(usr_qq);
        const pending = player.引灵结果暂存;
        if (!Array.isArray(pending?.候选) || pending.候选.length < 2) {
            e.reply('当前没有需要选择的引灵结果。');
            return true;
        }

        const resultLines = formatGuidedTalentList(pending.候选);
        if (e.msg.startsWith('#查看')) {
            e.reply([
                `【引灵仙符·${pending.类型}候选】`,
                ...resultLines,
                '发送 #保留引灵结果 序号 或 #保留引灵结果 灵根名 进行选择。',
            ].join('\n'));
            return true;
        }

        const choice = e.msg
            .replace(/^#(?:保留|选择)引灵结果/, '')
            .replace(/^\s*\*/, '')
            .trim();
        const selected = resolveGuidedTalent(pending.候选, choice);
        if (!selected) {
            e.reply([
                '引灵结果序号或名称有误，可选结果为：',
                ...resultLines,
                '发送 #保留引灵结果 序号 或 #保留引灵结果 灵根名 进行选择。',
            ].join('\n'));
            return true;
        }
        const activeAvatar = getActiveZhutianAvatarName(player);
        if (activeAvatar) {
            e.reply(`当前正装载化身【${activeAvatar}】，请先发送 #装载化身 本源，再保留引灵结果。`);
            return true;
        }

        const oldTalent = player.灵根;
        player.灵根 = selected.talent;
        delete player.引灵结果暂存;
        await checkAndRemoveShengtiMishu(player, usr_qq);
        player.生命本源 = 100 + (player.灵根?.生命本源 || 0);
        await Write_player(usr_qq, player);
        const equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
        await player_efficiency(usr_qq);

        e.reply([
            '【引灵仙符·择灵完成】',
            `已保留：${selected.talent.name}（本批洗出${selected.count}次）`,
            `灵根变化：${oldTalent?.name || '无'} → ${selected.talent.name}`,
            '可在【#我的练气】中查看详情',
        ].join('\n'));
        return true;
    });
}

// 独立处理锁灵仙符使用
async useLockLinggenToken(e) {
    if (!verc({ e })) return false;
    
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    // 检查存档是否存在
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    // 获取玩家数据
    let player = await Read_player(usr_qq);

    if (player.引灵结果暂存) {
        e.reply('尚有引灵结果未选择，请先发送 #查看引灵结果。');
        return true;
    }
    
    // 检查是否有锁灵仙符
    const hasToken = await exist_najie_thing(usr_qq, '锁灵仙符', '道具');
    if (!hasToken) {
        e.reply([
            '【锁灵仙符】使用失败',
            '您的纳戒中没有锁灵仙符',
            '请先获取锁灵仙符后再使用'
        ].join('\n'));
        return true;
    }
    
    // 检查引灵仙符冲突
    if (player.next_linggen_target_type) {
        e.reply([
            '【锁灵仙符】使用失败',
            '引灵仙符效果已存在，无法同时使用锁灵仙符',
            '请先完成洗髓后，再使用锁灵仙符',
            '仙道有法，符箓不可同施！'
        ].join('\n'));
        return true;
    }
    
    // 设置锁灵效果
    player.next_linggen_keep_best = true;
    await Write_player(usr_qq, player);
    
    // 消耗道具
    await Add_najie_thing(usr_qq, '锁灵仙符', '道具', -1);
    
    e.reply([
        '【锁灵仙符】生效',
        '仙符化作一道金光融入你的体内，凝聚元神，稳固根基',
        '下一次洗髓时将锁定最佳灵根，确保不流失分毫',
        '效果持续至下一次洗髓结束',
        '大道可期，仙途稳固！'
    ].join('\n'));
    
    return true;
}
// 独立处理引灵仙符使用
async useLinggenToken(e) {
    if (!verc({ e })) return false;
    
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    // 检查存档是否存在
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    // 获取玩家数据
    let player = await Read_player(usr_qq);

    if (player.引灵结果暂存) {
        e.reply('尚有引灵结果未选择，请先发送 #查看引灵结果。');
        return true;
    }
    
    // 解析灵根类型
    const match = e.msg.match(/^#使用引灵仙符\s+(\S+)/);
    let linggenType = match ? match[1].trim() : '';
    
    // 验证灵根类型
    const validTypes = ['大道体', '至尊体', '圣体', '霸体', '神王体', '道胎', 
                       '神体', '妖体', '天灵根', '变异灵根', '体质', '真灵根', '伪灵根'];
    
    // 如果没有提供类型或类型无效
    if (!linggenType || !validTypes.includes(linggenType)) {
        e.reply([
            '✨【引灵仙符】使用指引✨',
            '请在使用时指定灵根类型，格式：',
            '#使用引灵仙符 [灵根类型]',
            '例如：#使用引灵仙符 圣体',
            '可用灵根类型：',
            validTypes.join('、'),
            '仙符有灵，需指明方向！'
        ].join('\n'));
        return true;
    }
    
    // 检查锁灵仙符冲突
    if (player.next_linggen_keep_best) {
        e.reply([
            '【引灵仙符】使用失败',
            '锁灵仙符效果已存在，无法同时使用引灵仙符',
            '请先完成洗髓后，再使用引灵仙符',
            '仙道有法，符箓不可同施！'
        ].join('\n'));
        return true;
    }
    
    // 检查是否有引灵仙符
    const hasToken = await exist_najie_thing(usr_qq, '引灵仙符', '道具');
    if (!hasToken) {
        e.reply([
            '【引灵仙符】使用失败',
            '您的纳戒中没有引灵仙符',
            '请先获取引灵仙符后再使用'
        ].join('\n'));
        return true;
    }
    
    // 设置目标灵根类型
    player.next_linggen_target_type = linggenType;
    await Write_player(usr_qq, player);
    
    // 消耗道具
    await Add_najie_thing(usr_qq, '引灵仙符', '道具', -1);
    
    e.reply([
        '【引灵仙符】生效',
        '仙符化作一道灵光，指引天地元气流向',
        `下一次洗髓将优先感应【${linggenType}】灵根气息`,
        '若洗出此类型灵根则必定保留',
        '效果持续至下一次洗髓结束',
        '灵根有灵，自会相引！',
        '提示：引灵仙符与锁灵仙符不可同时使用'
    ].join('\n'));
    
    return true;
}
   async  chuidiao (e){
    let usr_qq = e.user_id; // 获取玩家的QQ号
    usr_qq = await channel(usr_qq); // 调用lianjie函数连接并获取玩家信息
    return withPlayerMutationLock(usr_qq, () => this.chuidiaoLocked(e, usr_qq));
   }

   async chuidiaoLocked(e, usr_qq) {
    let player = await Read_player(usr_qq); // 读取玩家数据
    const baitName = parseImmortalBait(e.msg);
    if (baitName && !getImmortalBaitConfig(baitName)) {
        e.reply(` 未知仙饵【${baitName}】，发送【#众生仙饵】查看可用仙饵。`);
        return;
    }
       // 检查是否可以前往
    const flag = await Go(e);
    if (!flag) {
        return false;
    }
     // 检查众生钓竿道具
    let hasRod = await exist_najie_thing(usr_qq, "众生仙钓", "道具");
    if (!hasRod) {
        e.reply(" 无众生仙钓也敢窥探轮回？可笑！");
        return;
    }
    if (baitName) {
        const hasBait = await exist_najie_thing(usr_qq, baitName, "道具");
        if (!hasBait) {
            e.reply(` 纳戒中没有【${baitName}】，无法以此饵垂钓众生。`);
            return;
        }
    }
    const hasTideLamp = (await exist_najie_thing(
        usr_qq,
        "万界引潮灯",
        "道具"
    )) > 0;
 // 检查血量
    if (player.当前血量 < 200) {
        e.reply(" 道伤未愈还敢强提真元？速速退去疗伤！");
        return;
    }
    // 过程文案合并为一条（开场+悬念），结算后单独再发一条
    await sleep(2000);
    await e.reply([" 你执众生仙钓，垂纶于众生海之畔...", " 钓竿微颤...众生海似有禁忌之物苏醒..."].join('\n'));
    
   
    
   
    
  
    allaction = false;
    
    // 基础40分钟：引潮灯先减半，道法仙术再减少10分钟。
    const baseCD = getImmortalFishingCooldown({
        hasTideLamp,
        hasDaoArt: player.daofaxianshu == 2,
    });
    
    let now_Time = new Date().getTime();
    let last_fishing = await redis.get("xiuxian:player:" + usr_qq + "diaocd");
    last_fishing = parseInt(last_fishing) || 0;
    
     if (now_Time < last_fishing + baseCD) {
        let remain = last_fishing + baseCD - now_Time;
        let remain_m = Math.floor(remain / 60000);
        let remain_s = Math.floor((remain % 60000) / 1000);
        
        if (hasTideLamp && player.daofaxianshu == 2) {
            e.reply(` 【引潮灯】聚潮、【道法仙术】流转，还需${remain_m}分${remain_s}秒方可再钓`);
        } else if (hasTideLamp) {
            e.reply(` 【万界引潮灯】正在聚拢界潮，还需${remain_m}分${remain_s}秒方可再钓`);
        } else if (player.daofaxianshu == 2) {
            e.reply(` 【道法仙术】流转不息，还需${remain_m}分${remain_s}秒方能圆满`);
        } else {
            e.reply(` 乾坤未定，还需${remain_m}分${remain_s}秒方可再探轮回`);
        }
        return;
    }
    
    // 更新垂钓CD
    await redis.set("xiuxian:player:" + usr_qq + "diaocd", now_Time);
    
    // 制造悬念（已并入上面的过程条）
    await sleep(3000);
    
    // 垂钓奖励逻辑
    let random = Math.random() * 100;
    let rewardMsg = "";
    let n = 1; // 奖励倍数
    let playerChanged = false;
    
    // 幸运加成（基础概率+玩家幸运值）
    const luckChance =player.幸运 || 0;
    const isLucky = Math.random() < luckChance;
    
   // 特殊体质特效
if (isLucky || player.灵根.type === "圆环之理" || getSuiyunEffects(player).madoka) {
    // 圆环之理会强制触发幸运效果
    if (player.灵根.type === "圆环之理" || getSuiyunEffects(player).madoka) {
        n = getSuiyunEffects(player).madoka ? 1 : 5; // 圆环之理五倍奖励
        rewardMsg += "「全ての魔女は、生まれる前に消滅させておく」\n";
        rewardMsg += " 法则重构！圆环之理显现，钓竿化作因果之线！\n";
        rewardMsg += getSuiyunEffects(player).madoka ? " 岁云法则显现，本次钓获十倍珍宝！\n" : " 神明垂钓！法则加持，本次钓获五倍珍宝！\n";
    } else {
        n = 2;
        if (player.灵根.type === "魔卡少女") {
            rewardMsg += " 「隐藏着星星力量的钓竿啊，在我面前显示你真正的力量！」\n";
            rewardMsg += " 小樱牌共鸣！封印解除！钓线化作星之杖，捕获双倍珍宝！\n";
        } 
        else if (player.灵根.type === "魔女") {
            rewardMsg += " 「魔女之旅，即是邂逅与别离的诗篇...」\n";
            rewardMsg += " 灰之魔女伊蕾娜轻笑，扫帚划过天际，钓起双份奇遇！\n";
        } 
        else {
            rewardMsg += " 气运加身！鸿蒙紫气缠绕钓竿，时空长河为之沸腾！\n";
        }
    }
}
    
    n *= getSuiyunEffects(player).lootMultiplier * getMemoryEffects(player).lootMultiplier * getMemoryEffects(player).fishingMultiplier;

    // 黄金因子只加最终件数，不并入随后会乘100的奖励倍数。
    const grantFishingLoot = async (name, itemClass, baseAmount, unique = false) => {
        const item = unique ? { name, 全服唯一: true } : await foundthing(name, { readOnly: true });
        const amount = addMemoryLootBonus(player, item, baseAmount);
        await Add_najie_thing(usr_qq, name, itemClass, amount);
        return amount;
    };

    // 道法仙术提示（顺序与 CD 实际计算一致：先引潮灯减半，再道法-10）
    if (hasTideLamp) {
        rewardMsg += " 万界引潮灯照彻众生海，垂钓冷却缩短一半，愿鳞与仙饵收获翻倍！\n";
    }
    if (player.daofaxianshu == 2) {
        rewardMsg += " 道法仙术运转周天，本次垂钓冷却再减少10分钟！\n";
    }
    
    // 基础奖池：无论是否使用仙饵都会结算，幸运翻倍与海洋垂钓倍率照常生效。
    if (random < 50) {
        const amount = await grantFishingLoot("仙晶矿", "道具", 100 * n);
        rewardMsg += `\n 钓起仙晶矿脉！获得【仙晶矿】x${amount}`;
    } 
    else if (random < 60) {
        const amount = await grantFishingLoot("七彩流晶矿", "道具", 10 * n);
        rewardMsg += `\n 虹光贯日！钓起太古矿精【七彩流晶矿】x${amount}`;
    } 
     else if (random < 65) {
        const amount = await grantFishingLoot("玄品秘境结算卡", "道具", 5 * n);
        rewardMsg += `\n 仙光大放！钓起众生仙宝【玄品秘境结算卡】x${amount}`;
    } 
    else if (random < 75) {
        const amount = await grantFishingLoot("帝品真器丹", "丹药", 3 * n);
        rewardMsg += `\n 丹霞漫天！钓起荒古丹炉【帝品真器丹】x${amount}`;
    } 
    else if (random < 80) {
        const amount = await grantFishingLoot("遣龙令", "道具", 10 * n);
        rewardMsg += `\n 龙吟九霄！钓起太古龙巢【遣龙令】x${amount}`;
    } 
    else if (random < 85) {
        const amount = await grantFishingLoot("遣虎令", "道具", 10 * n);
        rewardMsg += `\n 煞气冲斗！钓起白虎杀星【遣虎令】x${amount}`;
    } 
    else if (random < 87) {
        const amount = await grantFishingLoot("天命轮回丹", "丹药", 5 * n);
        rewardMsg += `\n 轮回逆转！钓起禁忌丹药【天命轮回丹】x${amount}`;
    } 
    
    else if (random < 95) {
        const medicine = await grantFishingLoot("天药", "丹药", 30 * n);
        const catalyst = await grantFishingLoot("无上九转仙丹药引", "丹药", n);
        rewardMsg += `\n 神霞喷薄！钓起精神天药【天药】x${medicine} + 【无上九转仙丹药引】x${catalyst}`;
    } 
    else {
        const amount = await grantFishingLoot("超越宝盒", "盒子", 10 * n);
        rewardMsg += `\n 海浪翻涌！钓起诸天至宝【超越宝盒】x${amount}`;
    }

    // 仙饵产物与基础产物叠加发放：仙饵走独立奖池，且不吃海洋因子的垂钓加成。
    if (baitName) {
        const coordinateCount = await exist_najie_thing(
            usr_qq,
            "仙武界坐标",
            "道具"
        );
        const reward = rollImmortalBaitReward(baitName, {
            ownsXianwuCoordinate:
                Boolean(player.仙武界坐标已获得) || coordinateCount > 0,
        });
        const baseAmount = reward.uniqueFlag ? 1
          : rollBaitRewardAmount(hasTideLamp) * getMemoryEffects(player).lootMultiplier;
        const amount = await grantFishingLoot(reward.name, reward.class, baseAmount, Boolean(reward.uniqueFlag));
        if (reward.uniqueFlag) {
            player[reward.uniqueFlag] = true;
            playerChanged = true;
        }
        rewardMsg += `\n 【${baitName}】牵动诸天水脉，钓得【${reward.name}】x${amount}`;
    }

    const wishScaleAmount = await grantFishingLoot("众生愿鳞", "道具", rollWishScaleAmount(hasTideLamp));
    rewardMsg += `\n 众生愿力凝成鳞光，获得【众生愿鳞】x${wishScaleAmount}`;

    const planeName = getPlayerPlaneName(player);
    const eraCurrent = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
    const configuredWorldYear = Number(eraCurrent.totalYears);
    const worldYear = Number.isFinite(configuredWorldYear)
        ? configuredWorldYear
        : getRealmEventWorldYear(eraCurrent.index, eraCurrent.years, eraCurrent.epoch);
    const tide = getFishingTide(worldYear);
    let fishCatch = rollPlaneFish(planeName, { tide });
    if (fishCatch?.type === 'king') {
        const created = e.isGroup && e.group_id
            ? await tryCreateFishKing({
                groupId: e.group_id,
                ownerId: usr_qq,
                ownerName: player.名号,
                plane: planeName,
                king: fishCatch,
                ownerPower: GetPower(
                    player.攻击,
                    player.防御,
                    player.血量上限,
                    player.暴击率
                ),
            })
            : null;
        if (created) {
            rewardMsg += [
                "",
                `【位面鱼王·${fishCatch.name}】`,
                `钓线骤然绷直，${planeName}水脉随之翻覆！你钓起的不是鱼，而是一尊鱼王！`,
                `讨伐队伍编号：${created.teamId}`,
                `本体血量：${created.healthMax.toLocaleString('zh-CN')}`,
                `你已自动成为垂钓者，群友可发送 #加入鱼王讨伐 ${created.teamId}，随后 #讨伐鱼王。`,
            ].join("\n");
        } else {
            fishCatch = rollPlaneFish(planeName, { tide, allowFishKing: false });
        }
    }
    if (fishCatch?.type === 'fish') {
        const count = recordFishCatch(player, planeName, fishCatch.name);
        const atlasRewards = getPendingFishAtlasRewards(player);
        if (atlasRewards.length > 0) {
            for (const reward of atlasRewards) {
                await Add_najie_thing(
                    usr_qq,
                    reward.name,
                    reward.class,
                    reward.amount,
                    undefined,
                    1,
                    { idempotencyKey: "fish-atlas:" + usr_qq + ":" + reward.key + ":" + reward.name }
                );
            }
            // 套装奖励消耗对应位面每种渔获各1条，防止集齐后无限重复领取
            consumeFishAtlasSets(player, atlasRewards);
            markFishAtlasRewardsClaimed(player, atlasRewards);
            const consumedAmounts = new Map();
            for (const reward of atlasRewards) {
                if (!reward.consume) continue;
                const plane = reward.consume.plane;
                consumedAmounts.set(plane, (consumedAmounts.get(plane) || 0) + reward.consume.amount);
            }
            rewardMsg += "\n 鱼谱收集奖励：" + atlasRewards
                .map(reward => "【" + reward.name + "】x" + reward.amount)
                .join("、");
            if (consumedAmounts.size > 0) {
                rewardMsg += "\n 兑换套装消耗：" + [...consumedAmounts]
                    .map(([plane, amount]) => `${plane}渔获各${amount}条`)
                    .join("、");
            }
        }
        playerChanged = true;
        rewardMsg += `\n 【${planeName}鱼谱】钓得${fishCatch.name}，图鉴累计x${count}${fishCatch.tideBoosted ? "（万界潮汐加持）" : ""}`;
    }

    const pendingEvent = player.垂钓位面奇遇;
    if (pendingEvent && Number(pendingEvent.expiresAt) <= Date.now()) {
        delete player.垂钓位面奇遇;
        playerChanged = true;
    }
    if (!player.垂钓位面奇遇) {
        const planeEvent = rollPlaneFishingEvent(planeName);
        if (planeEvent) {
            player.垂钓位面奇遇 = {
                eventId: planeEvent.id,
                plane: planeName,
                expiresAt: Date.now() + FISHING_EVENT_CHOICE_MS,
            };
            playerChanged = true;
            rewardMsg += [
                "",
                `【${planeEvent.title}】`,
                planeEvent.intro,
                ...planeEvent.choices.map((choice, index) => `${index + 1}. ${choice.label}`),
                "十分钟内发送 #垂钓奇遇 1/2/3 作出选择。",
            ].join("\n");
        }
    }
    if (playerChanged) {
        await Write_player(usr_qq, player);
    }
    
    // 附加修为/血气奖励
    let xiuwei = Math.trunc(500  * 3*player.mijinglevel_id*player.level_id*player.Physique_id) * n;
    let xueqi = Math.trunc(800  * 4*player.mijinglevel_id*player.level_id*player.Physique_id) * n;
    await Add_修为(usr_qq, xiuwei);
    await Add_血气(usr_qq, xueqi);
    if (baitName) {
        await Add_najie_thing(usr_qq, baitName, "道具", -1);
    }
    await  Add_najie_thing(usr_qq, "众生仙钓", "道具", -1);
    // 最终总结
    await sleep(1000);
    const resultMsgs = [` 本次垂钓后需修养：${Math.trunc(baseCD/60000)}分钟`];
    if (rewardMsg) resultMsgs.push(rewardMsg);
    resultMsgs.push(` 感悟天道：修为+${xiuwei} │ 淬炼体魄：血气+${xueqi}`, " 众生钓竿回归沉寂，等待下一次出山...");
    await e.reply(resultMsgs.filter(Boolean).join('\n'));
}
  async  chengzhang(e) {
    // e.reply("未到开启日期")
    // return
    // 创建一个生日对象
    let usr_qq = e.user_id; // 获取玩家的QQ号
    usr_qq = await channel(usr_qq); // 调用lianjie函数连接并获取玩家信息
    let player = await Read_player(usr_qq); // 读取玩家数据

    let memberMap = await e.group.getMemberMap();
    let arrMember = Array.from(memberMap.values());

    var the_idcard = arrMember.filter(item => {
        return item.user_id == e.user_id
    })
    let the_id = the_idcard[0]
    let c=the_id.join_time*1000

    let a = new Date();
    let v = a.getTime();

    let daysRounded=Math.trunc((v-c)/86400000)//玩家入群天数
    console.log(daysRounded)

    // 读取已领取礼物的记录文件
    let dir = path.join(__PATH.chengzhang, 'chengzhang.json');
    let logfile = fs.readFileSync(dir, 'utf8');
    let allqq = JSON.parse(logfile);
    // 查找当前玩家的记录在allqq数组中的索引
    let suoyin = allqq.findIndex((entry) => entry.id === player.id);
    // 如果找不到该玩家的记录，则创建一个新的记录并写入文件
    if (suoyin === -1) {
      suoyin = allqq.push({
        id: player.id,
        "7天": 0,
        "30天": 0,
        "60天": 0,
        "180天": 0,
        "365天": 0
      }) - 1;
      let logARR = JSON.stringify(allqq, "", "\t");
      fs.writeFileSync(dir, logARR, 'utf8');
    }
    let messages = [];
    // 判断并给予礼物
    if (daysRounded >= 7 && allqq[suoyin]["7天"] === 0) {
    await Add_najie_thing(usr_qq, "秘境之匙", "道具",1);

      allqq[suoyin]["7天"] = 1;
      messages.push("您已经游玩超过7天了，以下是您的7天成长礼包：秘境之匙*1");
    }
    if (daysRounded >= 30 && allqq[suoyin]["30天"] === 0) {
      // 给予30天礼物
    await Add_najie_thing(usr_qq, "秘境之匙", "道具", 6);

    await Add_najie_thing(usr_qq, "幸运草", "道具", 1);
      allqq[suoyin]["30天"] = 1;
      messages.push("这是您的30天成长礼包，以下是您的30天成长礼包：秘境之匙*6，幸运草*1");
    }
    if (daysRounded >= 60 && allqq[suoyin]["60天"] === 0) {
      // 给予60天礼物

    await Add_najie_thing(usr_qq, "秘境之匙", "道具", 15);
    await Add_najie_thing(usr_qq, "幸运草", "道具", 3);
      allqq[suoyin]["60天"] = 1;
      messages.push("这是您的60天成长礼包，以下是您的60天成长礼包：秘境之匙*15，幸运草*3");
    }
    if (daysRounded >= 180 && allqq[suoyin]["180天"] === 0) {
      // 给予180天礼物

    await Add_najie_thing(usr_qq, "秘境之匙", "道具", 30);

    await Add_najie_thing(usr_qq, "幸运草", "道具", 3);

      allqq[suoyin]["180天"] = 1;
      messages.push("这是您的180天成长礼包，以下是您的180天成长礼包：秘境之匙*30，幸运草*3");
    }
    if (daysRounded >= 365 && allqq[suoyin]["365天"] === 0) {
      // 给予365天礼物

    await Add_najie_thing(usr_qq, "秘境之匙", "道具", 50);
    await Add_najie_thing(usr_qq, "摘榜令", "道具", 15);
    await Add_najie_thing(usr_qq, "幸运草", "道具", 10);
    await Add_najie_thing(usr_qq, "玄影-云端麒麟", "道具", 1);
    
      allqq[suoyin]["365天"] = 1;
      messages.push("这是您的365天成长礼包，以下是您的365天成长礼包：秘境之匙*100，懒狗DD*1，幸运草*10，摘榜令*15,玄影-云端麒麟*1");
    }
    // 将更新后的礼物记录写回文件
    let logARR = JSON.stringify(allqq, "", "\t");
    fs.writeFileSync(dir, logARR, 'utf8');
    // 发送回复消息
    let nextGiftDays = -1; // 初始化为负数，表示没有下一个礼包
    let nextGiftType = ""; // 初始化为空字符串
    const giftTypes = ["7天", "30天", "60天", "180天", "365天"];
    for (let i = 0; i < giftTypes.length; i++) {
      const giftType = giftTypes[i];
      if (allqq[suoyin][giftType] === 0) {
      nextGiftType = `${giftType}成长礼包`;
      nextGiftDays = getDaysUntilNextGift(giftType,daysRounded);
      break; // 找到下一个为0的项后，退出循环
      }
    }
    // 如果没有找到下一个为0的项，nextGiftDays 和 nextGiftType 将保持默认值
    if (messages.length > 0) {
      e.reply(messages.join("\n"));
    } else {
      if (nextGiftDays !== -1) {
      e.reply(`您的成长礼包还未到时间或已经领取过了。下一个礼包是 ${nextGiftType}，还需 ${nextGiftDays} 天。`);
      } else {
      e.reply("您已经领取了所有成长礼包。");
      }
    } 
  }
  async gonglue(e) {
    if (!verc({ e })) return false;
    e.reply('修仙攻略\nhttps://docs.qq.com/doc/DTHhuVnRLWlhjclhC');
    return false;
  }
async world(e) {
    if (!verc({ e })) return false;
    let playerList = [];
    let files = fs
      .readdirSync('./plugins/zhutianxiuxian1.0/resources/data/xiuxian_player')
      .filter(file => file.endsWith('.json'));
    for (let file of files) {
      file = file.replace('.json', '');
      playerList.push(file);
    }
    
    let num = [0, 0, 0, 0, 0, 0, 0, 0];
    let totalPlayers = playerList.length; // 总人数（不重复）
    
    for (let player_id of playerList) {
      let usr_qq = player_id;
      let player = await data.getData('player', usr_qq);
      
      // 独立判断，一个玩家可以属于多个分类
      if (player.灵根.type == "魔头") num[3]++;
      if (player.灵根.type == "转生") num[2]++;
      if (player.灵根.type == "命运") num[4]++;
      if (player.灵根.type == "天魔") num[5]++;
      if (player.mijinglevel_id > 1) num[6]++;
      if (player.xiangulevel_id > 1) num[7]++;
      if (player.level_id > 41) num[1]++;
      
      // 凡人判断：没有任何修行体系的玩家
      if (player.level_id <= 41 && player.mijinglevel_id <= 1 && player.xiangulevel_id <= 1) {
          num[0]++;
      }
    }
    
    let msg =
      '___[修仙世界]___' +
      '\n总人数：' + totalPlayers +
      '\n凡人：' + num[0] +
      '\n仙人：' + num[1] +
      '\n轮回者：' + num[2] +
      '\n魔头：' + num[3] +
      '\n命运神道体：' + num[4] +
      '\n极道天魔：' + num[5] +
      '\n秘境体系修行者：' + num[6] +
      '\n仙古今世法修行者：' + num[7] +
      '\n\n注：一个玩家可同时属于多个分类';
    
    e.reply(msg);
    return false;
}

  async refining(e) {
    if (!verc({ e })) return false;
    //固定写法
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let thing_name = e.msg.replace('#', '');
    thing_name = thing_name.replace('打磨', '');
    let code = thing_name.split('*');
    thing_name = code[0];
    let thing_exist = await foundthing(thing_name);
    if (!thing_exist) {
      e.reply(`你在瞎说啥呢?哪来的【${thing_name}】?`);
      return false;
    }
    let pj = {
      劣: 0,
      普: 1,
      优: 2,
      精: 3,
      极: 4,
      绝: 5,
      顶: 6,
    };
    pj = pj[code[1]];
    if (
      pj > 5 ||
      (thing_exist.atk < 10 && thing_exist.def < 10 && thing_exist.HP < 10)
    ) {
      e.reply(`${thing_name}(${code[1]})不支持打磨`);
      return false;
    }
    let najie = await Read_najie(usr_qq);
    let x = 0;
    for (let i of najie['装备']) {
      if (i.name == thing_name && i.pinji == pj) x++;
    }
    if (x < 3) {
      e.reply(`你只有${thing_name}(${code[1]})x${x}`);
      return false;
    }
    //都通过了
    for (let i = 0; i < 3; i++)
      await Add_najie_thing(usr_qq, thing_name, '装备', -1, pj);
    await Add_najie_thing(usr_qq, thing_name, '装备', 1, pj + 1);
    e.reply('打磨成功获得' + thing_name);
    return false;
  }

  async huishou(e) {
    if (!verc({ e })) return false;
    //固定写法
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let thing_name = e.msg.replace('#回收', '');
    thing_name = thing_name.trim();
    let thing_exist = await foundthing(thing_name);
    if (thing_exist) {
      e.reply(`${thing_name}可以使用,不需要回收`);
      return false;
    }
    let lingshi = 0;
    let najie = await Read_najie(usr_qq);
    let type = [
      '装备',
      '丹药',
      '道具',
      '功法',
      '草药',
      '材料',
      '仙宠',
      '仙宠口粮',
    ];
    for (let i of type) {
      let thing = najie[i].find(item => item.name == thing_name);
      if (thing) {
        if (thing.class == '材料' || thing.class == '草药') {
          lingshi += thing.出售价 * thing.数量;
        } else {
          lingshi += thing.出售价 * 2 * thing.数量;
        }
        await Add_najie_thing(
          usr_qq,
          thing.name,
          thing.class,
          -thing.数量,
          thing.pinji
        );
      }
    }
    await Add_灵石(usr_qq, lingshi);
    e.reply(`回收成功,获得${lingshi}灵石`);
    return false;
  }
async huodong(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    const player = await Read_player(usr_qq);
    if (!ifexistplay) return false;
    
    // 检查是否在全局推送群中
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    if (xiuxianConfig.Era && xiuxianConfig.Era.notifyGroups && e.group_id) {
        if (!xiuxianConfig.Era.notifyGroups.includes(e.group_id.toString())) {
            e.reply('兑换码必须在全局推送群中使用！');
            return false;
        }
    } else if (!e.group_id) {
        // 如果不是群聊（私聊），也提示需要去全局推送群
        e.reply('兑换码必须在全局推送群中使用！');
        return false;
    }
    
    // 新增：统一回复通道控制变量
    let isPrivateExchange = false;
    let customReply = null;
    
    var name = e.msg.replace('#活动兑换', '').trim();
    if (name === "一眼一纪，一梦星灭") {
        if (player.mijinglevel_id<16&&player.xiangulevel_id<14) {
            e.reply('若想用此兑换码必须先达到人道领域绝巅！');
            return false;
        }
    }
    else if (name == "诸天万界二周目" && player.level_id <42) {
        e.reply('未成仙用不了此兑换码!');
        return false;
    } else if (name == "致敬抗战胜利八十周年") {
        e.reply('为有牺牲多壮志...');
    } else if (name == "祖国繁荣昌盛") {
        e.reply('这盛世如你所愿!');
    } else if (name == "万法归墟") {
        e.reply('万法归墟，诸天寂灭；蝶梦与镜界之赠已入纳戒，无尽劫门凭此秘钥而开。');
    }
    
    // ==== 统一处理兑换逻辑 ====
    let i; 
    for (i = 0; i < data.duihuan.length; i++) {
        if (data.duihuan[i].name == name) break;
    }
    if (i == data.duihuan.length) {
        e.reply('兑换码不存在!');
        return false;
    }
    
    // 兑换码重复性检查（保持原逻辑）
    let action = await redis.get('xiuxian:player:' + usr_qq + ':duihuan');
    action = action ? JSON.parse(action) : [];
    if (action.includes(name)) {
        e.reply('你已经兑换过该兑换码了');
        return false;
    }
    action.push(name);
    await redis.set('xiuxian:player:' + usr_qq + ':duihuan', JSON.stringify(action));
    
    // ==== 奖励发放与回复 ====
    let msg = [];
    for (var k = 0; k < data.duihuan[i].thing.length; k++) {
        await Add_najie_thing(
            usr_qq,
            data.duihuan[i].thing[k].name,
            data.duihuan[i].thing[k].class,
            data.duihuan[i].thing[k].数量
        );
        msg.push(`\n${data.duihuan[i].thing[k].name}x${data.duihuan[i].thing[k].数量}`);
    }
    
    // 关键修改：根据环境控制回复
    if (isPrivateExchange) {
        // 私聊环境：合并专属回复和奖励信息
        e.reply(`${customReply}\n\n你已获得圆神馈赠：${msg.join('')}`);
    } else {
        // 非私聊环境：常规回复
        e.reply('恭喜获得:' + msg);
    }
    
    return false;
}

  async check_player(e) {
    if (!verc({ e })) return false;
    const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
    const masterList = xiuxianConfig.Master || [];
    const userQQ = e.user_id.toString().replace('qg_', '');
    if (!isXiuxianAdmin(e)) {
      e.reply('只有修仙管理员可以执行操作');
      return false;
    }
    let File = fs.readdirSync(__PATH.player_path);
    File = File.filter(file => file.endsWith('.json'));
    let File_length = File.length;
    let cundang = ['存档'];
    let najie = ['纳戒'];
    let equipment = ['装备'];
    for (var k = 0; k < File_length; k++) {
      let usr_qq = File[k].replace('.json', '');
      try {
        await Read_player(usr_qq);
      } catch {
        cundang.push('\n');
        cundang.push(usr_qq);
      }
      try {
        await Read_najie(usr_qq);
      } catch {
        najie.push('\n');
        najie.push(usr_qq);
      }
      try {
        await Read_equipment(usr_qq);
      } catch {
        equipment.push('\n');
        equipment.push(usr_qq);
      }
    }
    if (cundang.length > 1) {
      await e.reply(cundang);
    } else {
      cundang.push('正常');
      await e.reply(cundang);
    }
    if (najie.length > 1) {
      await e.reply(najie);
    } else {
      najie.push('正常');
      await e.reply(najie);
    }
    if (equipment.length > 1) {
      await e.reply(equipment);
    } else {
      equipment.push('正常');
      await e.reply(equipment);
    }
    return false;
  }

  async Add_lhd(e) {
    if (!verc({ e })) return false;
    //固定写法
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //判断是否为匿名创建存档
    if (usr_qq == 80000000) return false;
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let x = await exist_najie_thing(usr_qq, '长相奇怪的小石头', '道具');
    if (!x) {
      e.reply(
        '你翻遍了家里的院子，也没有找到什么看起来奇怪的石头\n于是坐下来冷静思考了一下。\n等等，是不是该去一趟精神病院？\n自己为什么突然会有供奉石头的怪念头？'
      );
      return false;
    }
    let player = data.getData('player', usr_qq);
    if (player.轮回点 >= 10 && player.lunhui == 0) {
      e.reply('你梳洗完毕，将小石头摆在案上,点上香烛，拜上三拜！');
      await sleep(3000);
      player.当前血量 = 1;
      player.血气 -= 500000;
      e.reply(
        `奇怪的小石头灵光一闪，你感受到胸口一阵刺痛，喷出一口鲜血：\n` +
        `“不好，这玩意一定是个邪物！不能放在身上！\n是不是该把它卖了补贴家用？\n` +
        `或者放拍卖行骗几个自认为识货的人回本？”`
      );
      data.setData('player', usr_qq, player);
      return false;
    }
    await Add_najie_thing(usr_qq, '长相奇怪的小石头', '道具', -1);
    e.reply('你梳洗完毕，将小石头摆在案上,点上香烛，拜上三拜！');
    await sleep(3000);
    player.当前血量 = Math.floor(player.当前血量 / 3);
    player.血气 = Math.floor(player.血气 / 3);
    e.reply(
      '小石头灵光一闪，化作一道精光融入你的体内。\n' +
      '你喷出一口瘀血，顿时感受到天地束缚弱了几分，可用轮回点+1'
    );
    await sleep(1000);
    player.轮回点++;
    data.setData('player', usr_qq, player);
    return false;
  }

  async sk(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    if (usr_qq == 80000000) return false;
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let tianluoRandom;
    let thing = e.msg.replace('#', '');
    thing = thing.replace('抽', '');
    if (thing == '天地卡池') {
      let x = await exist_najie_thing(usr_qq, '天罗地网', '道具');
      if (!x) {
        e.reply('你没有【天罗地网】');
        return false;
      }
      await Add_najie_thing(usr_qq, '天罗地网', '道具', -1);
      tianluoRandom = Math.floor(Math.random() * data.changzhuxianchon.length);
      let player=await Read_player(usr_qq)
      e.reply('一道金光从天而降');
      await sleep(5000);
      e.reply(
        '金光掉落在地上，走近一看是【' +
        data.changzhuxianchon[tianluoRandom].品级 +
        '】' +
        data.changzhuxianchon[tianluoRandom].name
      );
      await Add_仙宠(usr_qq, data.changzhuxianchon[tianluoRandom].name, 1);
      let a=Math.random()
      if(a>=0.9){
        await Add_najie_thing(usr_qq,'金红的蛋', '仙宠',1);
        e.reply('[凤鸣齐天,流光四溢]'+player.名号+',获得了凤凰的青睐')
      }
      return
    } else if (thing == '灵界卡池') {
      let x = await exist_najie_thing(usr_qq, '金丝仙网', '道具');
      if (!x) {
        e.reply('你没有【金丝仙网】');
        return false;
      }
      await Add_najie_thing(usr_qq, '金丝仙网', '道具', -1);
      tianluoRandom = Math.floor(Math.random() * data.changzhuxianchon.length);
      tianluoRandom = (Math.ceil((tianluoRandom + 1) / 5) - 1) * 5;
      e.reply('一道金光从天而降');
      await sleep(5000);
      e.reply(
        '金光掉落在地上，走近一看是【' +
        data.changzhuxianchon[tianluoRandom].品级 +
        '】' +
        data.changzhuxianchon[tianluoRandom].name
      );
      await Add_仙宠(usr_qq, data.changzhuxianchon[tianluoRandom].name, 1);
       e.reply('恭喜获得' + data.changzhuxianchon[tianluoRandom].name)
     
      return false;
    } else if (thing == '凡界卡池') {
      let x = await exist_najie_thing(usr_qq, '银丝仙网', '道具');
      if (!x) {
        e.reply('你没有【银丝仙网】');
        return false;
      }
      await Add_najie_thing(usr_qq, '银丝仙网', '道具', -1);
      tianluoRandom = Math.floor(Math.random() * data.changzhuxianchon.length);
      tianluoRandom = (Math.ceil((tianluoRandom + 1) / 5) - 1) * 5;
      e.reply('一道金光从天而降');
      await sleep(5000);
      e.reply(
        '金光掉落在地上，走近一看是【' +
        data.changzhuxianchon[tianluoRandom].品级 +
        '】' +
        data.changzhuxianchon[tianluoRandom].name
      );
      await Add_仙宠(usr_qq, data.changzhuxianchon[tianluoRandom].name, 1);
      e.reply('恭喜获得' + data.changzhuxianchon[tianluoRandom].name);
      return false;

    }
    e.reply('报错,速速修bug')
    return
  }

  async find_thing(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    const thing_name = parseItemSearchQuery(e.msg);
    if (!thing_name) {
      await e.reply('请输入要查找的物品，例如：#哪里有秘境之匙');
      return false;
    }

    const sources = findItemSources(data, thing_name);
    if (sources.length === 0 && !(await foundthing(thing_name))) {
      await e.reply(`未曾听闻【${thing_name}】，请检查物品名称是否正确`);
      return false;
    }

    const number = Number(await exist_najie_thing(usr_qq, '寻物纸', '道具'));
    if (!Number.isFinite(number) || number < 1) {
      await e.reply('查找物品需要【寻物纸】');
      return false;
    }

    await Add_najie_thing(usr_qq, '寻物纸', '道具', -1);
    const result = sources.length
      ? [`【${thing_name}】可通过以下渠道获得：`, ...sources.map(source => `- ${source}`)]
      : [`寻物纸燃尽，天地没有回应……`, `暂未发现【${thing_name}】的固定获得渠道`];
    result.push('消耗【寻物纸】x1');
    await e.reply(result.join('\n'));
    return false;
  }

  //存取灵石
  async Take_lingshi(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let flag = await Go(e);
    if (!flag) return false;
    //检索方法
    var reg = new RegExp(/取|存/);
    let func = reg.exec(e.msg);
    let msg = e.msg.replace(reg, '');
    msg = msg.replace('#', '');
    let lingshi = msg.replace('灵石', '');
    if (func == '存' && lingshi == '全部') {
      let P = await Read_player(usr_qq);
      lingshi = P.灵石;
    }
    if (func == '取' && lingshi == '全部') {
      let N = await Read_najie(usr_qq);
      lingshi = N.灵石;
    }
    lingshi = await convert2integer(lingshi);
    if (func == '存') {
      let player_lingshi = await Read_player(usr_qq);
      player_lingshi = player_lingshi.灵石;
      if (player_lingshi < lingshi) {
        e.reply([
          segment.at(usr_qq),
          `灵石不足,你目前只有${player_lingshi}灵石`,
        ]);
        return false;
      }
      let najie = await Read_najie(usr_qq);
      if (najie.灵石上限 < najie.灵石 + lingshi) {
        await Add_najie_灵石(usr_qq, najie.灵石上限 - najie.灵石);
        await Add_灵石(usr_qq, -najie.灵石上限 + najie.灵石);
        e.reply([
          segment.at(usr_qq),
          `已为您放入${najie.灵石上限 - najie.灵石}灵石,纳戒存满了`,
        ]);
        return false;
      }
      await Add_najie_灵石(usr_qq, lingshi);
      await Add_灵石(usr_qq, -lingshi);
      e.reply([
        segment.at(usr_qq),
        `储存完毕,你目前还有${player_lingshi - lingshi}灵石,纳戒内有${najie.灵石 + lingshi
        }灵石`,
      ]);
      return false;
    }
    if (func == '取') {
      let najie = await Read_najie(usr_qq);
      if (najie.灵石 < lingshi) {
        e.reply([
          segment.at(usr_qq),
          `纳戒灵石不足,你目前最多取出${najie.灵石}灵石`,
        ]);
        return false;
      }
      let player_lingshi = await Read_player(usr_qq);
      player_lingshi = player_lingshi.灵石;
      await Add_najie_灵石(usr_qq, -lingshi);
      await Add_灵石(usr_qq, lingshi);
      e.reply([
        segment.at(usr_qq),
        `本次取出灵石${lingshi},你的纳戒还剩余${najie.灵石 - lingshi}灵石`,
      ]);
      return false;
    }
    return false;
  }

async broadcastToAll(player,message) {
    try {
        // 获取配置中的群组列表
        const xiuxianConfig = config.getConfig('xiuxian', 'xiuxian');
        const notifyGroups = xiuxianConfig?.Era?.notifyGroups || [];
        
        if (notifyGroups.length > 0) {
            // 广播到所有配置的群组
            for (const groupId of notifyGroups) {
                try {
                    await Bot.pickGroup(groupId).sendMsg([
                        message
                    ]);
                    console.log(`[全服通知] 群 ${groupId}: ${message}`);
                } catch (groupErr) {
                    console.error(`发送全服通知到群 ${groupId} 失败[${player.id}]:`, groupErr);
                }
            }
        } else {
            // 如果没有配置群组，回退到私聊
            await common.relpyPrivate(player.id, message);
            console.log(`[全服通知] 私聊 ${player.id}: ${message}`);
        }
    } catch (err) {
        console.error(`发送全服通知失败[${player.id}]:`, err);
        
        // 最终回退到私聊发送
        try {
            await common.relpyPrivate(player.id, message);
            console.log(`[全服通知] 私聊回退 ${player.id}: ${message}`);
        } catch (fallbackErr) {
            console.error(`私聊发送全服通知失败[${player.id}]:`, fallbackErr);
        }
    }
}
  //#(装备|服用|消耗)物品*数量
  async Player_use(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    return withPlayerMutationLock(usr_qq, () => this.Player_useLocked(e, usr_qq));
  }

  async Player_useLocked(e, usr_qq) {
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let player = await Read_player(usr_qq);
    let najie = await Read_najie(usr_qq);
    //检索方法
    var reg = new RegExp(/装备|服用|消耗|学习|打开|寻宝|加工|孵化|合成/);
    let func = reg.exec(e.msg);
    let msg = e.msg.replace(reg, '');
    msg = msg.replace('#', '');
    let code = msg.split('*');
    let thing_name = code[0];
    code[0] = parseInt(code[0]);
    let equipmentIndex = null;
    let quantity = code[1];
    quantity = await convert2integer(quantity);

    if ((func == '打开' || func == '消耗') && thing_name === '玉石匣') {
      if (quantity !== 1) return e.reply('玉石匣乃唯一传承，一次只能开启一个。');
      return withPlayerMutationLock(usr_qq, async () => {
        const lockedPlayer = await Read_player(usr_qq);
        const lockedNajie = await Read_najie(usr_qq);
        const result = openJadeCasket(lockedPlayer, lockedNajie);
        if (result.reason === 'opened') return e.reply('玉石匣中的传承早已烙印于你的识海，匣中再无余物。');
        if (!result.ok) return e.reply('你的纳戒中没有【玉石匣】。');

        const transaction = new FileRollbackTransaction();
        transaction.capture(path.join(__PATH.player_path, `${usr_qq}.json`));
        transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));
        try {
          await Write_player(usr_qq, lockedPlayer);
          await Write_najie(usr_qq, lockedNajie);
          await player_efficiency(usr_qq);
          transaction.commit();
        } catch (error) {
          transaction.rollback();
          throw error;
        }

        return e.reply([
          '【玉石匣·败天遗法】',
          '你缓缓启开玉石匣，刹那间金光四溢，照彻山河。',
          '一卷仙王级经文自匣中显化，字字如大道神金，越过岁月与界壁，尽数烙印于你的识海。',
          '那竟是不属于此界的无上禁法——独孤败天大神所创【逆乱八式】！',
          '昔年，他曾凭此法孤身逆战天道；而今八式真意沉入你的神魂，只待你在一次次征伐中参悟其锋芒。',
          '',
          '已领悟仙王法【逆乱八式】',
          '已解锁小世界建筑【败天神殿】',
          '发送 #建立败天神殿（需2000万源石、15枚世界石）',
        ].join('\n'));
      });
    }

     if (func == "合成") {
    let wupin = data.hecheng_list.find(item => item.name == thing_name);
     if (thing_name === "图鉴") {
        return; 
    }
     if (!isNotNull(wupin)) {
        e.reply(`合成物品暂时未添加，请持续关注`);
        return;
    }
    if (wupin.传承要求 && !player[wupin.传承要求]) {
      e.reply(`你尚未获得【${wupin.传承要求}】，无法合成${thing_name}`);
      return;
    }
    
    // 确保数量是数字
    quantity = Number(quantity);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        e.reply("合成数量必须为正整数");
        return;
    }
    
    // 检查所有材料是否足够
    let insufficientMaterials = [];
    
    for (let i = 0; i < wupin.materials.length; i++) {
        const material = wupin.materials[i];
        let x = await exist_najie_thing(usr_qq, material.name, material.class);
        
        // 确保材料数量是数字
        x = Number(x) || 0;
        const required = material.amount * quantity;
        
        if (x < required) {
            insufficientMaterials.push({
                name: material.name,
                required: required,
                current: x
            });
        }
    }
    
    // 如果有材料不足
    if (insufficientMaterials.length > 0) {
        let message = "材料不足：\n";
        for (let mat of insufficientMaterials) {
            message += `需要 ${mat.name} x${mat.required}，当前只有 ${mat.current}\n`;
        }
        e.reply(message);
        return;
    }

    const insufficientResources = Object.entries(wupin.costs || {}).filter(
      ([field, amount]) => (Number(player[field]) || 0) < Number(amount) * quantity
    );
    if (insufficientResources.length > 0) {
      e.reply(`资源不足：${insufficientResources.map(([field, amount]) => `${field}需要${Number(amount) * quantity}`).join('、')}`);
      return;
    }
    
    // 纳戒中减去对应物品
    for (let i = 0; i < wupin.materials.length; i++) {
        const material = wupin.materials[i];
        await Add_najie_thing(
            usr_qq, 
            material.name, 
            material.class, 
            -material.amount * quantity
        );
    }
    for (const [field, amount] of Object.entries(wupin.costs || {})) {
      player[field] = Number(player[field]) - Number(amount) * quantity;
    }
    if (Object.keys(wupin.costs || {}).length > 0) await Write_player(usr_qq, player);
    
    // 添加合成物品
    await Add_najie_thing(
        usr_qq, 
        wupin.name, 
        wupin.class, 
        wupin.amount * quantity
    );
    
    const resourceCost = Object.entries(wupin.costs || {}).map(([field, amount]) => `${field}-${Number(amount) * quantity}`).join('、');
    e.reply(`合成成功，获得${wupin.name} x${wupin.amount * quantity}${resourceCost ? `（${resourceCost}）` : ''}`);
    return;
}
if (func == "打开") {
    // 解析数量（默认为1）
    let openCount = quantity || 1;
    
    // 验证数量
    if (isNaN(openCount) || openCount < 1) {
        e.reply(`无效的数量: ${quantity}`);
        return;
    }
    
    // 限制最大数量
    if (openCount > 9999) {
        e.reply(`一次最多只能打开9999个盒子`);
        openCount = 9999;
    }
    
    // 检查是否有足够的盒子
    const boxCount = await exist_najie_thing(usr_qq, thing_name, "盒子");
    if (!boxCount) {
        e.reply(`你没有【${thing_name}】这样的盒子`);
        return;
    }
    if (boxCount < openCount) {
        e.reply(`你没有足够的【${thing_name}】，需要${openCount}个，当前只有${boxCount}个`);
        return;
    }
    
    // 获取盒子配置
    const thing = data.hezi_list.find(item => item.name == thing_name);
    if (!thing) {
        e.reply(`未知的盒子: ${thing_name}`);
        return;
    }
    
    // 统计奖励
    const rewards = {};
    const rewardDetails = [];
    
    // 批量处理奖励（优化性能）
    for (let i = 0; i < openCount; i++) {
        let rand = Math.random();
        let rate = 0;
        
        for (let content of thing.contents) {
            rate += content.rate;
            if (rand < rate) {
                const item = content.items[Math.floor(Math.random() * content.items.length)];
                const key = `${item.name}|${item.class}`;
                
                // 累加奖励数量
                if (!rewards[key]) {
                    rewards[key] = {...item};
                } else {
                    rewards[key].amount += item.amount;
                }
                
                // 记录详细奖励（只记录前100个）
                if (i < 100) {
                    rewardDetails.push(`第${i+1}个: ${item.name}×${item.amount}`);
                }
                break;
            }
        }
    }
    
    // 批量添加奖励到纳戒
    for (const key in rewards) {
        const item = rewards[key];
        await Add_najie_thing(usr_qq, item.name, item.class, item.amount);
    }
    
    // 扣除盒子
    await Add_najie_thing(usr_qq, thing_name, "盒子", -openCount);
    
    // 构建奖励消息
    const rewardSummary = Object.values(rewards).map(r => `${r.name}×${r.amount}`);
    
    // 构建回复消息
    const message = [
        `${player.名号}打开了${openCount}个【${thing_name}】，获得以下奖励：`,
        ...rewardSummary
    ];
    
   
    
    e.reply(message.join('\n'));
    return;
}
        if (func == "加工") {
            let wupin = data.jiagong_list.find(item => item.name == thing_name);
            if (!isNotNull(wupin)) {
                e.reply(`加工物品暂时未添加，请持续关注`);
                return;
            }
            //看物品是否够
            for (let i = 0; i < wupin.inputs.length; i++) {
                const input = wupin.inputs[i];
                let x = await exist_najie_thing(usr_qq, input.name, input.class);
                if (x == false) {
                    x = 0;
                }
                if (x < input.amount * quantity + input.const_amount) {
                    e.reply(`纳戒中拥有${input.name}${x}份，加工需要${input.amount * quantity + input.const_amount}份`);
                    return;
                }
            }
            //看热量是否够
            if (player.热量 < wupin.热量 * quantity) {
                e.reply(`加工需要热量${wupin.热量 * quantity}，现在不足！`);
                return;
            }
            //减去加工消耗的热量
            await Add_热量(usr_qq, -(wupin.热量 * quantity));
            //纳戒中减去对应输入物品
            for (let i = 0; i < wupin.inputs.length; i++) {
                const input = wupin.inputs[i];
                await Add_najie_thing(usr_qq, input.name, input.class, -(input.amount * quantity + input.const_amount));
            }
            //纳戒中加上对应输出物品
            let msg = [];
            for (let i = 0; i < wupin.outputs.length; i++) {
                const output = wupin.outputs[i];
                await Add_najie_thing(usr_qq, output.name, output.class, (output.amount * quantity + output.const_amount));
                msg.push(`获得${output.name}${output.amount * quantity + output.const_amount}个`);
            }
            e.reply(`加工成功，${msg}`);
            return;
        }
    //装备优化
    if (func == '装备' && code[0] && code[0] > 100) {
      const selected = selectEquipmentByCode(najie, code[0]);
      if (!selected) {
        e.reply('装备代号输入有误!');
        return false;
      }
      equipmentIndex = selected.index;
      thing_name = selected.item.name;
    }
    //看看物品名称有没有设定,是不是瞎说的
    // 记忆条目暂停使用，旧纳戒物品保留，通用使用命令同样拦截。
    if (['奇怪的数据', '记忆之诗篇', '六相冰封'].includes(thing_name)) return e.reply('该记忆命途物品已暂停使用。');
    let thing_exist = await foundthing(thing_name);
    const activeAvatar = getActiveZhutianAvatarName(player);
    const mutatesRoot =
      (func == '消耗' && (thing_exist?.type == '洗髓' || ROOT_MUTATION_ITEMS.has(thing_name))) ||
      (func == '服用' && ROOT_MUTATION_MEDICINE_TYPES.has(thing_exist?.type));
    if (activeAvatar && mutatesRoot) {
      return e.reply(`当前正装载化身【${activeAvatar}】，请先发送 #装载化身 本源，再进行灵根重塑。`);
    }
    if (player.引灵结果暂存 && mutatesRoot) {
      return e.reply('尚有引灵结果未选择，请先发送 #查看引灵结果。');
    }
    let pj = {
      劣: 0,
      普: 1,
      优: 2,
      精: 3,
      极: 4,
      绝: 5,
      顶: 6,
    };
    pj = pj[code[1]];
    let x = await exist_najie_thing(usr_qq, thing_name, thing_exist.class, pj);
    if (thing_name === "楼") {
      return false;
    }
    if (!x) {
      e.reply(`你没有【${thing_name}】这样的【${thing_exist.class}】`);
      return false;
    }
    if (func == '消耗' && thing_name === '神主触屏') {
      if (quantity !== 1) {
        e.reply('神主触屏一次只能消耗一个。');
        return false;
      }
      const currentName = player.灵根?.name;
      if (!['门矢士', '帝骑'].includes(currentName)) {
        e.reply('神主触屏只会回应帝骑之力，需先拥有【门矢士】或【帝骑】灵根。');
        return false;
      }
      const godMaster = data.talent_list.find(item => item.name === '帝骑·神主');
      if (!godMaster) {
        e.reply('帝骑·神主灵根数据缺失，请联系管理员。');
        return false;
      }
      await Add_najie_thing(usr_qq, thing_name, '道具', -1);
      player.灵根 = { ...godMaster };
      player.生命本源 = 100 + (Number(player.灵根.生命本源) || 0);
      syncCurrentZhutianAvatar(player);
      await checkAndRemoveShengtiMishu(player, usr_qq);
      await Write_player(usr_qq, player);
      const equipment = await Read_equipment(usr_qq);
      await Write_equipment(usr_qq, equipment);
      await player_efficiency(usr_qq);
      e.reply('十枚碎片凝成的神主触屏依次亮起骑士图纹，你的灵根晋升为【帝骑·神主】！');
      return false;
    }
      if (thing_name === "终古剑之主") {
            // 检查是否学习永恒终极剑道
            const hasEternalSwordDao = player.学习的功法.includes("永恒终极剑道");
            
            // 检查是否为剑云海传人
            const isJianyunhaiChuanren = player.势力职位 === "传人";
            
            if (!hasEternalSwordDao || !isJianyunhaiChuanren) {
                let message = [
                    `【终古剑之主·剑器通灵】`,
                    `剑匣剧烈震颤，一道恐怖剑意冲天而起！`,
                    
                    `终古剑之主发出震天剑鸣：`,
                    `"非永恒终极剑道修炼者，不配执掌吾身！"`
                ];
                
                if (!hasEternalSwordDao) {
                    message.push();
                    message.push(`你尚未领悟永恒终极剑道真谛`);
                    message.push(`此剑乃剑魔帝主王旭的证道之器，蕴含无上剑道法则`);
                    message.push(`唯有参透永恒终极剑道者方可驾驭`);
                }
                
                if (!isJianyunhaiChuanren) {
                    message.push();
                    message.push(`你非剑云海传人`);
                    message.push(`此剑只认剑云海一脉传人为主`);
                    message.push(`若无传人身份，纵是仙帝亦难降服`);
                }
                
                message.push();
                message.push(`终古剑之主化作一道剑光，重回剑匣`);
                message.push(`剑匣上浮现古老铭文：`);
                message.push(`"永恒剑道，传人方证"`);
                
                return e.reply(message.join("\n"));
            }
        }
        // ==== 新增结束 ====
        
    if (x < quantity) {
      e.reply(`你只有${thing_name}x${x}`);
      return false;
    }
     if (func == "装备") {
            let x;
            let pj = {
                "劣": 0,
                "普": 1,
                "优": 2,
                "精": 3,
                "极": 4,
                "绝": 5,
                "顶": 6
            }
            if (code[1] == undefined) {
                x = await exist_najie_thing(usr_qq, thing_name, "装备");
            } else {
                pj = pj[code[1]];
                if (pj == undefined) return;
                x = await exist_najie_thing(usr_qq, thing_name, "装备", pj);
            }
            if (!x) {//没有
                e.reply(`你没有【${thing_name}】这样的装备`);
                return;
            }
            let equ;
            if (equipmentIndex !== null) {
                equ = najie.装备[equipmentIndex];
                x = Number(equ?.数量) || 0;
            } else if (code[1] == undefined) {
                equ = najie.装备.find(item => item.name == thing_name);
                for (var i = 0; i < najie.装备.length; i++) {//遍历列表有没有比那把强的
                    if (
                        najie.装备[i].name == thing_name &&
                        (najie.装备[i].pinji > equ.pinji ||
                            (najie.装备[i].pinji == equ.pinji && najie.装备[i].归一属性 && !equ.归一属性))
                    ) {
                        equ = najie.装备[i];
                    }
                }
            } else {
                equ = najie.装备.find(item => item.name == thing_name && item.pinji == pj);
            }
            if (isInnateTreasureName(equ?.name) || equ?.先天至宝本体) {
                return e.reply(`先天至宝不使用普通装备指令，请发送 #执掌先天至宝 ${equ.name}`);
            }
            var equipment = await Read_equipment(usr_qq);
            if (equ.type == "项链") {
                if (equ.属性 == "幸运") {
                    player.幸运 += equipment.项链.加成
                }
            }
            const swapped = await instead_equipment(usr_qq, equ, { inventoryIndex: equipmentIndex });
            if (!swapped?.ok) return e.reply(swapped?.message || '装备更换失败，请重新查看纳戒后再试。');
            let img = await get_equipment_img(e);
            equipment = await Read_equipment(usr_qq);
            if (equipment.武器.name == "灭仙剑" && equipment.法宝.name == "灭仙符" && equipment.护具.name == "灭仙衣" && player.魔道值 > 999 && player.灵根.type == "魔头") {
                e.reply("你已激活灭仙三件套效果");
            }
            if (equipment.武器.name == "诛仙枪" && equipment.法宝.name == "诛仙花" && equipment.护具.name == "诛仙甲" && player.魔道值 > 999 && player.灵根.type == "魔头") {
                e.reply("你已激活诛仙三件套效果");
            }
            if (equipment.武器.name == "光明剑" && equipment.法宝.name == "光明符" && equipment.护具.name == "光明衣" && player.魔道值 < 1 && player.灵根.type == "转生" ) {
                e.reply("你已激活光明三件套效果");
            }
            if (equipment.武器.name == "神月剑" && equipment.法宝.name == "神日花" && equipment.护具.name == "神星甲" && player.魔道值 < 1 && player.灵根.type == "转生" ) {
                e.reply("你已激活日月三件套效果");
            }
            if (equipment.武器.name == "【武祖】万仙武极天" && equipment.法宝.name == "【神命】无法无天" && equipment.护具.name == "【如梦】道祖的加护" && player.魔道值 < 1 && ( player.灵根.type == "命运")) {
                e.reply("你已获得超越诸天极限的力量！");
            }
            if (equipment.武器.name == "【邪神】斩仙灭神剑" && equipment.法宝.name == "【邪神】魔渊的凝视" && equipment.护具.name == "【邪神】冥王真祖甲" && player.魔道值 > 9999 && ( player.灵根.type == "天魔")) {
                e.reply("你已获得粉碎六道轮回的力量！");
            }
            if (equipment.武器.name == "【光阴】天道之剑" && equipment.法宝.name == "【光阴】命运之心" && equipment.护具.name == "【光阴】主宰之甲"  && ( player.灵根.type == "命运")) {
                e.reply("你在此刻拥有了纪元主宰的权柄，天地命运都在你的把握之中！");
            }
            if (equipment.武器.name == "【光阴】天道之剑" && equipment.法宝.name == "【光阴】命运之心" && equipment.护具.name == "【光阴】主宰之甲"  && ( player.灵根.type == "天魔")) {
                e.reply("你在此刻拥有了纪元主宰的权柄，天地万灵都在你的灭世魔威下颤抖！");
            } 
            if (["【超维】破限剑", "【超维】天帝剑"].includes(equipment.武器.name)  &&  player.灵根.type == "命运") {
                e.reply("恐怖的气息让时间长河都断裂了，无穷维宇都要在此剑中演化生灭！");
            }
            if (equipment.法宝.name == "【超维】多元星盘"  &&  player.灵根.type == "命运") {
                e.reply("哪怕是一切始终一切多元都要在你的手中湮灭！");
            }
            if (["【超维】元初之甲", "【超维】主帝神甲"].includes(equipment.护具.name)  &&  player.灵根.type == "命运") {
                e.reply("创维灭维也只在一念之间！");
            }
            if (["【超维】破限剑", "【超维】天帝剑"].includes(equipment.武器.name)  &&  player.灵根.type == "天魔") {
                e.reply("恐怖的气息让时间长河都断裂了，无穷维宇都要在此剑中演化生灭！");
            }
            if (equipment.法宝.name == "【超维】多元星盘"  &&  player.灵根.type == "天魔") {
                e.reply("哪怕是一切始终一切多元都要在你的手中湮灭！");
            }
            if (["【超维】元初之甲", "【超维】主帝神甲"].includes(equipment.护具.name)  &&  player.灵根.type == "天魔") {
                e.reply("创维灭维也只在一念之间！");
            }
            if (equipment.武器.name == "【极道帝兵】万物母气鼎"  &&  player.灵根.type == "大成圣体") {
                e.reply("你为天帝，当镇压世间一切敌！");
            }
            if (isCanonicalDaluoSwordEmbryo(equipment.武器)) {
                const isSupremePhysique = String(player.灵根?.type || '').includes('至尊体');
                e.reply([
                    '【大罗剑胎·古船苏醒】',
                    '黑色剑胎入手，无锋无刃，整片虚空却自行裂开。',
                    isSupremePhysique
                        ? '至尊血脉与剑胎共鸣，沉睡的无上剑意尽数复苏，全属性提升至十五倍！'
                        : '剑胎未曾完全认主，却仍借出半分万古锋芒，全属性提升至七点五倍！',
                    '一缕剑鸣越过岁月长河：此剑尚未完成，前路却已无人敢挡。'
                ].join('\n'));
            }
            if (equipment.武器.name == "仙帝器·大罗仙剑"  ) {
                e.reply("谁在称无敌，哪个敢言不败，帝落时代都不见！此刻你已然能独断万古，横推古今未来所有敌手！");
            }
if (equipment.帝兵.name == "终古剑之主") {
    e.reply([
        "【终古剑之主·剑道极境】",
        "你的眼神陡然锐利，一股浩大至高的剑道独尊意境猛然爆发！",
        "整方剑云海刹那间改天换地，从混沌万物乃至浩瀚维度，一切事物都如白驹过隙般涌现。",
        "「剑来！」",
        "二字道喝震彻万古，无法穷尽边际的混沌海都在此刻颤抖！",
        "你威压诸天万界，气冲斗牛，宇内睥睨独尊！",
        "维度轰然撕裂，九霄天外一道璀璨极光破空而来，",
        "划破黑暗界海，贯穿无垠混沌，直降剑云海！",
        "剑身震颤，发出恐怖剑鸣，晶莹璀璨的永恒光辉照耀诸天，",
        "无穷异象化作真实，万道法则为之臣服！",
        "此乃真正的剑道极境兵器——终古剑之主！",
        "一缕剑威可镇杀古往今来任何至尊帝者，",
        "相隔无尽时空亦让极境帝主跪伏！",
        "剑意迸发，日月星辰黯然，银河宇宙失色，",
        "大道伟力在此剑面前毫无光辉可言！",
        "「终古剑之主……竟是终古剑之主！」",
        "有古老存在颤声低语，这几个字承载着万古重量！",
        "此剑源起不可考，其威不该存于此界，",
        "曾有无上巨头持之征伐至上超脱者道天，",
        "而今为你重掌，剑道极境，至此圆满！",
    ].join("\n"));
}
            if ( equipment.帝兵.author_name == player.id ) {
     const weaponName = equipment.帝兵.name;
    const weaponForm = equipment.帝兵.name.match(/剑|鼎|枪|钟|塔|镜|印|刀|斧|戟|鞭|琴|扇/)?.[0] || "帝兵";
    
    const replyMsg = [
        `【帝兵认主·道则共鸣】`,
        
        `九天神光贯穿古今，${weaponForm}形帝兵「${weaponName}」震颤虚空！`,
        `帝兵器灵自沉睡中苏醒，大道符文在兵体上流转生辉：`,
        `"主人，终于等到您了！"`,
        
        `帝兵与您血脉相连，道则共鸣，`,
        `唯有在您手中，方能极尽升华，绽放横扫九天十地的无上威能！`,
        
        `执此兵，当镇压世间一切敌！`
    ].join("\n");
    e.reply(replyMsg);
}
                  if ( (equipment.帝兵.name== "封神榜"||equipment.帝兵.name== "神女炉"||equipment.帝兵.name== "天庭权杖")&&player.mijinglevel_id < 12&&player.xiangulevel_id < 12  ) {
         const weaponName = equipment.帝兵.name;
    const replyMsg = [
        `你的道行还不够高深，无法发挥出${weaponName}这件帝兵的全部威力`,
    ].join("\n");
    
    e.reply(replyMsg);
     return;
}
            if ( equipment.帝兵&&!equipment.帝兵.author_name  ) {
     const weaponName = equipment.帝兵.name;
    const replyMsg = [
        `${weaponName}的器灵苏醒与你共鸣`,
    ].join("\n");
    
    e.reply(replyMsg);
}
            e.reply(img);
            return;
        }
        if (func == "孵化") {
            let wupin = data.fuhua_list.find(item => item.name == thing_name);
            if (!isNotNull(wupin)) {
                e.reply(`孵化物品暂时未添加，请持续关注`);
                return;
            }
            //看物品是否够
            for (let i = 0; i < wupin.materials.length; i++) {
                const material = wupin.materials[i];
                let x = await exist_najie_thing(usr_qq, material.name, material.class);
                if (x == false) {
                    x = 0;
                }
                if (x < material.amount * quantity) {
                    e.reply(`纳戒中拥有${material.name}${x}份，孵化需要${material.amount * quantity}份`);
                    return;
                }
            }
            //纳戒中减去对应物品
            for (let i = 0; i < wupin.materials.length; i++) {
                const material = wupin.materials[i];
                await Add_najie_thing(usr_qq, material.name, material.class, -material.amount * quantity)
            }
            await Add_najie_thing(usr_qq, wupin.name, wupin.class, wupin.amount * quantity);
            e.reply(`孵化成功，获得${wupin.name}${wupin.amount * quantity}个`);
            return;
        }

    if (func == '服用') {
      let dy = await Read_danyao(usr_qq);
      if (thing_exist.class != '丹药' && thing_exist.class != "食材") return false;
      if (thing_exist.type == '血量') {
        let player = await Read_player(usr_qq);
        if (!isNotNull(thing_exist.HPp)) {
          thing_exist.HPp = 1;
        }
        let blood = parseInt(
          player.血量上限 * thing_exist.HPp + thing_exist.HP
        );
        await Add_HP(usr_qq, quantity * blood);
        let now_HP = await Read_player(usr_qq);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        e.reply(`服用成功,当前血量为:${now_HP.当前血量} `);
        return false;
      }
      if (thing_exist.type == '修为') {
          if (isHighRealmConsumableRestricted(player)) {
        e.reply(`「自荒古岁月至今...」
「本座早已不需要这等外物了」`);
        return false;
      }
        await Add_修为(usr_qq, quantity * thing_exist.exp);
        e.reply(`服用成功,修为增加${quantity * thing_exist.exp}`);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '仙道潜力') {
        const effects = getMinggeEffects(player, data.minggeList);
        const gain = grantMinggePotential(player, effects, quantity * thing_exist.potential);
        await Write_player(usr_qq, player);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        e.reply(`服用成功，仙道潜力增加${gain}点，当前共有${player.仙道潜力}点`);
        return false;
      }
      if (thing_exist.type == '功法感悟') {
        const insight = Math.max(1, Number(thing_exist.insight) || 0) * quantity;
        player.功法感悟值 = Math.max(0, Number(player.功法感悟值) || 0) + insight;
        await Write_player(usr_qq, player);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        e.reply(`服用成功，获得${insight}点可自由分配的功法感悟，当前共有${player.功法感悟值}点`);
        return false;
      }
      if (thing_exist.type == '道心') {
        const result = applyDaoHeartFruit(player, thing_exist, quantity);
        if (result.perFruit <= 0) {
          e.reply(`【${thing_name}】缺少道心效果数值，请检查物品配置`);
          return false;
        }
        if (result.useCount <= 0) {
          e.reply(`你的道心已圆满（${result.after}/${DAO_HEART_MAX}），无需服用`);
          return false;
        }
        await Write_player(usr_qq, player);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -result.useCount);
        e.reply(`服用${thing_name}×${result.useCount}，道心+${result.change}，当前${result.after}/${DAO_HEART_MAX}`);
        return false;
      }
      if (thing_exist.type == '心神恢复') {
        const heart = refreshSpiritHeart(player);
        if (heart.current >= heart.max) {
          e.reply(`你的心神已满（${heart.current}/${heart.max}），无需服用`);
          return false;
        }
        const restore = Math.max(1, Number(thing_exist.heart) || 0);
        const useCount = Math.min(quantity, Math.ceil((heart.max - heart.current) / restore));
        player.心神 = Math.min(heart.max, heart.current + restore * useCount);
        if (player.心神 >= heart.max) player.心神恢复时间 = Date.now();
        await Write_player(usr_qq, player);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -useCount);
        e.reply(`服用${thing_name}×${useCount}，心神恢复至${player.心神}/${heart.max}`);
        return false;
      }
      if (thing_exist.type == '心神上限') {
        refreshSpiritHeart(player);
        player.心神丹药使用 ||= {};
        const used = Math.max(0, Number(player.心神丹药使用[thing_name]) || 0);
        const limit = Math.max(1, Number(thing_exist.useLimit) || 1);
        if (quantity > limit - used) {
          e.reply(`【${thing_name}】最多服用${limit}颗，你已服用${used}颗，本次最多还能服用${Math.max(0, limit - used)}颗`);
          return false;
        }
        const currentBaseMax = getSpiritHeartBaseMax(player);
        if (currentBaseMax >= 100) {
          e.reply('你的基础心神上限已达到100点，无法继续拓展');
          return false;
        }
        const perPill = Math.max(1, Number(thing_exist.heartMax) || 0);
        const useCount = Math.min(quantity, Math.ceil((100 - currentBaseMax) / perPill));
        const gain = increaseSpiritHeartLimit(player, perPill * useCount);
        player.心神丹药使用[thing_name] = used + useCount;
        await Write_player(usr_qq, player);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -useCount);
        e.reply(`服用${thing_name}×${useCount}，心神上限+${gain}，当前${player.心神}/${getSpiritHeartMax(player)}（已服用${used + useCount}/${limit}）`);
        return false;
      }
   if (thing_exist.type == '天资洗炼') {
    // 检查是否可以进行天资洗练
    if (!player.天资等级) {
        await e.reply('你尚未觉醒天资，无法天资洗炼！');
        return false;
    }

     // 天资等级序列
    const aptitudeSequence = [
        '无化如是',      // 索引0
        '生而愚痴',      // 索引1
        '天弃之人',      // 索引2
        '先天不足',      // 索引3
        '平庸之资',      // 索引4
        '超凡资质',      // 索引5
        '天纵之资',      // 索引6
        '旷世奇才',      // 索引7
        '绝世天骄',      // 索引8
        '万古无双',      // 索引9
        '无演无尽'       // 索引10
    ];

    // 获取当前天资位置
    const currentIndex = aptitudeSequence.indexOf(player.天资等级 === '岁云' ? '无演无尽' : player.天资等级);
    
    // === 特殊天资处理 ===
    if (player.天资等级 === '无化如是') {
        await e.reply([
            '≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡',
            '〖天道禁锢·天资洗炼失败〗',
            '天命轮回丹化为飞灰，你的资质纹丝不动！',
            '你天生「无化如是」，乃天道枷锁，',
            '天命轮回丹无法洗去天道烙印，',
            '此天资已定，万法难改，仙神无解！',
            '≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡'
        ].join('\n'));
        return false;
    }
    
    if (player.天资等级 === '生而愚痴') {
        await e.reply([
            '≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡',
            '〖愚昧之锁·天资洗炼困难〗',
            '天命轮回丹药力被强行压制！',
            '「生而愚痴」乃先天禁锢，需特殊机缘，',
            '普通丹药难以突破此天堑，',
            '建议寻找「开智灵泉」或「逆天开窍丹」',
        ].join('\n'));
        
        // 生而愚痴有1%几率强行突破
        if (Math.random() < 0.01) {
            const newAptitude = '天弃之人';
            const aptitudeEvaluations = {
                '天弃之人': '被天道抛弃，修炼必遭反噬',
                '生而愚痴': '天生愚笨，修炼难如登天'
            };
            
            await e.reply([
                '〖奇迹突破〗',
                '在你绝望之际，一股狂暴力量冲破禁锢！',
                '识海轰然炸开，愚昧锁链寸寸断裂！',
                '天资突破：',
                `『${player.天资等级}』 → 『${newAptitude}』`,
                aptitudeEvaluations[newAptitude],
                '提示：此乃亿万分之一的奇迹，珍惜！'
            ].join('\n'));
            
            player.天资等级 = newAptitude;
            player.天资评价 = aptitudeEvaluations[newAptitude];
            data.setData('player', usr_qq, player);
            
            // 消耗丹药
            await Add_najie_thing(usr_qq, '天命轮回丹', '丹药', -1);
        } else {
            // 消耗丹药但没成功
            await Add_najie_thing(usr_qq, '天命轮回丹', '丹药', -1);
        }
        return true;
    }
  // 检查是否已达到最高境界
    if (currentIndex >= 9) { // 万古无双是索引9
        await e.reply('你的天资已臻至万古无双之境，天命轮回丹已无法进一步提升！');
        return false;
    }
    
    // 检查无演无尽
    if (player.天资等级 === '无演无尽') {
        await e.reply([
            '〖天道共鸣·无需洗炼〗',
            '天命轮回丹在你手中自动分解，化为道韵！',
            '你已是「无演无尽」，',
            '此天资已超脱天道，无需任何洗炼，',
            '任何丹药对你来说都是多余的。',
        ].join('\n'));
        return false;
    }
    
    // 计算所需丹药数量
    let requiredPills = 1;
    if (currentIndex >= 2) { // 平庸之资是索引2，从此开始需要更多丹药
        // 从平庸之资开始，每升一级需要额外10颗
        requiredPills = 20 * (currentIndex - 1);
    }
    
    // 检查背包中丹药数量
    let najieThingCount = await exist_najie_thing(usr_qq, '天命轮回丹', "丹药");
    if (najieThingCount < requiredPills) {
        await e.reply(`你的纳戒中只有${najieThingCount}颗天命轮回丹，需要${requiredPills}颗才能进行天资洗炼！`);
        return false;
    }

    // 特效消息构建
    let effectMsg = [
        `〖天资重塑〗发动！`,
        `虚空裂开一道缝隙，鸿蒙紫气灌顶而入,周身泛起七彩霞光，灵台紫气翻涌...`,
        `你的先天资质正在发生蜕变！`,
        `消耗了${requiredPills}颗天命轮回丹`
    ];

    // 固定提升一级（最高到万古无双，索引9）
    let newIndex = Math.min(currentIndex + 1, 9); // 最高到索引9（万古无双）
    let newAptitude = aptitudeSequence[newIndex];
    
    // 天资评价库
    const aptitudeEvaluations = {
        '无演无尽': '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚',
        '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，永恒无敌',
        '绝世天骄': '惊才绝艳，具备帝姿，注定为一个时代的天地主角',
        '旷世奇才': '万年难遇，此等资质放眼九天十地也是难寻',
        '天纵之资': '天赋异禀，媲美上古大教的天才',
        '超凡资质': '资质超凡，注定异于常人',
        '平庸之资': '资质平平，勉勉强强',
        '先天不足': '先天有缺，修炼事倍功半',
        '天弃之人': '被天道抛弃，修炼必遭反噬'
    };

    // 构建提升过程动画
    let progressMsg = [];
    for (let i = currentIndex; i <= newIndex; i++) {
        progressMsg.push(`▷ ${aptitudeSequence[i]}: ${aptitudeEvaluations[aptitudeSequence[i]]}`);
    }

    // 最终结果消息
    let resultMsg = [
        `≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡`,
        `天资突破结果：`,
        `原资质：『${player.天资等级}』`,
        `新资质：『${newAptitude}』`,
        `${aptitudeEvaluations[newAptitude]}`,
        `≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡≡`,
        `剩余天资洗炼丹: ${najieThingCount - requiredPills}颗`
    ];

    // 更新玩家数据
    player.天资等级 = newAptitude;
    player.天资评价 = aptitudeEvaluations[newAptitude];
    data.setData('player', usr_qq, player);

    // 消耗丹药
    await Add_najie_thing(usr_qq, '天命轮回丹', '丹药', -requiredPills);

    // 发送分段特效消息
    await e.reply(segment.at(usr_qq));
    await sleep(800);
    await e.reply(effectMsg.join('\n'));
    await sleep(1200);
    if (currentIndex !== newIndex) {
        await e.reply(progressMsg.join('\n'));
        await sleep(1500);
    }
    await e.reply(resultMsg.join('\n'));

    return true;
}

       if (thing_exist.type == '出金率') {
        if(player.出金率 > 0){return e.reply('目前尚有金光丹药效在发挥')}
             await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
            player.出金率 = thing_exist.chujin;
            player.出金次数 += 10*quantity;
            if (thing_exist.name === '岁月的馈赠') {
              player.岁月馈赠次数 = Math.max(0, Math.floor(Number(player.岁月馈赠次数) || 0)) + 10 * quantity;
            }
            let 冒险出金次数 = 10*quantity;
            await Write_player(usr_qq, player);
            e.reply(`服用成功,下${冒险出金次数}次冒险出金率增加${player.出金率}%，目前剩余出金次数${player.出金次数}${thing_exist.name === '岁月的馈赠' ? '；胜利探索另有50%概率获得隐藏物品' : ''}`);
            return false;
          }
       if (thing_exist.type == '寿命') {
             await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
            await Add_寿元(usr_qq, quantity * thing_exist.shouyuan);
            e.reply(`服用成功,寿元增加${quantity * thing_exist.shouyuan}`);
            return false;
          }
           if (thing_exist.type == '天药') {
            const player = await Read_player(usr_qq);
             await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
            let 天药 =quantity * thing_exist.yuanshen;
           player.元神+= quantity * thing_exist.yuanshen;
           player.元神上限+= quantity * thing_exist.yuanshen;
            let 道伤msg = '';
            if (thing_exist.daoshang && player.道伤 > 0) {
              const before = player.道伤;
              player.道伤 = Math.max(0, player.道伤 - thing_exist.daoshang * quantity);
              道伤msg = `,道伤-${before - player.道伤}`;
            }
            await Write_player(usr_qq, player);
            e.reply(`服用成功,元神与元神上限增加${天药}${道伤msg}`);
            return false;
          }
      if (thing_exist.type == '血气') {
          if (isHighRealmConsumableRestricted(player)) {
        e.reply(`「自荒古岁月至今...」
「本座早已不需要这等外物了」`);
        return false;
      }
        await Add_血气(usr_qq, quantity * thing_exist.xueqi);
        e.reply(`服用成功,血气增加${quantity * thing_exist.xueqi}`);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
if (thing_exist.type == '神药') {
    // 获取玩家数据
    const player = await Read_player(usr_qq);
    
    // 检查玩家境界是否过高
    if (isHighRealmConsumableRestricted(player)) {
        e.reply(`「自荒古岁月至今...」
「本座早已不需要这等外物了」`);
        return false;
    }
    
    // 计算修为和血气增加
    const xiuweiAdd = quantity * thing_exist.exp;
    const xueqiAdd = quantity * thing_exist.xueqi;
    
    // 计算理论寿元增加
    let shouyuanAdd = thing_exist.exp / 10000 * quantity;
    
    // 最终实际增加的寿元（在压制状态下不超过9999）
    let actualShouyuanAdd = shouyuanAdd;
    let suppressMsg = "";
    
    // ==== 新增道伤修复逻辑 ====
    let daoshangMsg = ""; // 道伤修复消息
    let usedXiuwei = 0;   // 用于修复道伤的修为
    let usedXueqi = 0;    // 用于修复道伤的血气
    
    // 检查是否存在道伤
    if (player.道伤 && player.道伤 > 0) {
        // 计算修复道伤所需的总资源
        const levelSum = player.mijinglevel_id * player.xiangulevel_id;
        const requiredPerLevel = 950000000; // 每级需要1500万修为/血气
        const totalRequired = levelSum * requiredPerLevel;
        
        // 初始化道伤修复度（如果不存在）
        if (!player.道伤修复度) {
            player.道伤修复度 = 0;
        }
        
        // 计算还需要多少资源来完全修复道伤
        const remainingRequired = totalRequired - player.道伤修复度;
        
        if (remainingRequired > 0) {
            // 计算本次可以用于修复的资源
            const availableXiuwei = Math.min(xiuweiAdd, remainingRequired);
            const availableXueqi = Math.min(xueqiAdd, remainingRequired);
            
            // 实际使用的资源（取两者中较小的，确保平衡使用）
            usedXiuwei = Math.min(availableXiuwei, availableXueqi);
            usedXueqi = usedXiuwei;
            
            // 更新道伤修复度
            player.道伤修复度 += usedXiuwei + usedXueqi;
            
            // 检查是否完全修复
            if (player.道伤修复度 >= totalRequired) {
                player.道伤 = 0; // 清除道伤
                delete player.道伤修复度; // 删除修复度属性
                daoshangMsg = `\n道伤已完全修复！`;
            } else {
                const repairPercent = Math.floor((player.道伤修复度 / totalRequired) * 100);
                daoshangMsg = `\n道伤修复进度: ${repairPercent}% (${player.道伤修复度.toLocaleString()}/${totalRequired.toLocaleString()})`;
            }
        }
    }
    // ==== 道伤修复逻辑结束 ====
    
    // 处理寿元压制逻辑
    if (player.压制寿元) {
        // 计算当前寿元（显示值）
        const currentShouyuan = player.寿元 || 0;
        
        // 计算实际可增加的寿元（不超过9999上限）
        const availableCapacity = 9999 - currentShouyuan;
        if (shouyuanAdd > availableCapacity) {
            // 如果增加后会超过9999，只加到9999
            actualShouyuanAdd = availableCapacity;
        }
        
        // 更新压制寿元（存储真实值）
        player.压制寿元 += shouyuanAdd; // 增加完整值
        
        // 更新显示的寿元值
        player.寿元 = Math.min(9999, currentShouyuan + actualShouyuanAdd);
        
        // 构建提示信息
        if (actualShouyuanAdd < shouyuanAdd) {
            suppressMsg = `\n【寿元压制】处于绝灵时代，寿命上限9999年。本次增加${actualShouyuanAdd}年（理论${shouyuanAdd}年）`;
        } else {
            suppressMsg = `\n【寿元压制】处于绝灵时代，寿命上限9999年。本次增加${shouyuanAdd}年`;
        }
    } else {
        // 非压制状态正常增加
        if (player.寿元 >= 20000000) {
            // 寿元已满无法增加
            actualShouyuanAdd = 0;
            suppressMsg = `\n你的寿元已足够漫长，神药的延寿效果已经对你不起作用`;
        } else {
            // 正常增加寿元
            player.寿元 += shouyuanAdd;
            actualShouyuanAdd = shouyuanAdd;
        }
    }
    
    // === 修改点：考虑道伤修复消耗后的实际增加 ===
    
    // 增加修为（扣除用于修复道伤的部分）
    player.修为 += (xiuweiAdd - usedXiuwei);
    
    // 增加血气（扣除用于修复道伤的部分）
    player.血气 += (xueqiAdd - usedXueqi);
    
    // === 修改点结束 ===
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 构建回复消息
    let msg = `服用成功！`; 
    
    // 添加道伤修复信息
    if (daoshangMsg) {
        msg += daoshangMsg;
        if (usedXiuwei > 0) {
            msg += `\n消耗修为修复道伤: ${usedXiuwei.toLocaleString()}`;
            msg += `\n消耗血气修复道伤: ${usedXueqi.toLocaleString()}`;
        }
    }
    
    // 添加实际增加的属性
    if ((xiuweiAdd - usedXiuwei) > 0) {
        msg += `\n修为增加: ${(xiuweiAdd - usedXiuwei).toLocaleString()}`;
    }
    if ((xueqiAdd - usedXueqi) > 0) {
        msg += `\n血气增加: ${(xueqiAdd - usedXueqi).toLocaleString()}`;
    }
    if (actualShouyuanAdd > 0) {
        msg += `\n寿元增加: ${actualShouyuanAdd}年`;
    }
    
    // 添加压制状态提示
    if (suppressMsg) {
        msg += suppressMsg;
    } 
    
    e.reply(msg);
    
    // 消耗丹药
    await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
    return;
}
       if (thing_exist.type == '幸运') {
        if (player.islucky > 0) {
          e.reply('目前尚有福源丹在发挥效果，身体无法承受更多福源');
          return false;
        }
        player.islucky = 10 * quantity;
        player.addluckyNo = thing_exist.xingyun;
        player.幸运 += thing_exist.xingyun;
        data.setData('player', usr_qq, player);
        e.reply(
          `${thing_name}服用成功，将在之后的 ${quantity * 10
          }次冒险旅途中为你提高幸运值！`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '闭关') {
        dy.biguan = quantity;
        dy.biguanxl = thing_exist.biguan;
        e.reply(
          `${thing_name}提高了你的忍耐力,提高了下次闭关的效率,当前提高${dy.biguanxl * 100
          }%\n查看练气信息后生效`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        await Write_danyao(usr_qq, dy);
        return false;
      }
      if (thing_exist.type == '仙缘') {
        dy.ped = 5 * quantity;
        dy.beiyong1 = thing_exist.gailv;
        e.reply(
          `${thing_name}赐予${player.名号}仙缘,${player.名号}得到了仙兽的祝福`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        await Write_danyao(usr_qq, dy);
        return false;
      }
      if (thing_exist.type == '凝仙') {
        if (dy.biguan > 0) {
          dy.biguan += thing_exist.机缘 * quantity;
        }
        if (dy.lianti > 0) {
          dy.lianti += thing_exist.机缘 * quantity;
        }
        if (dy.ped > 0) {
          dy.ped += thing_exist.机缘 * quantity;
        }
        if (dy.beiyong2 > 0) {
          dy.beiyong2 += thing_exist.机缘 * quantity;
        }
        e.reply(
          `丹韵入体,身体内蕴含的仙丹药效增加了${thing_exist.机缘 * quantity}次`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        await Write_danyao(usr_qq, dy);
        return false;
      }
      if (thing_exist.type == '炼神') {
        dy.lianti = quantity;
        dy.beiyong4 = thing_exist.lianshen;
        e.reply(
          `服用了${thing_name},获得了炼神之力,下次闭关获得了炼神之力,当前炼神之力为${thing_exist.lianshen * 100
          }%`
        );
        await Write_danyao(usr_qq, dy);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '神赐') {
        dy.beiyong2 = quantity;
        dy.beiyong3 = thing_exist.概率;
        e.reply(
          `${player.名号}获得了神兽的恩赐,赐福的概率增加了,当前剩余次数${dy.beiyong2}`
        );
        await Write_danyao(usr_qq, dy);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '灵根') {
        const a = await readall('隐藏灵根');
        const newa = Math.floor(Math.random() * a.length);
        player.隐藏灵根 = a[newa];
        await Write_player(usr_qq, player);
        e.reply(
          `神药入体,${player.名号}更改了自己的隐藏灵根,当前隐藏灵根为[${player.隐藏灵根.name}]`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -1);
        return false;
      }
      if (thing_exist.type == '器灵') {
        if (!player.锻造天赋) {
          e.reply(`请先去#炼器师能力评测,再来更改天赋吧`);
          return false;
        }
        player.锻造天赋 = player.锻造天赋 + thing_exist.天赋 * quantity;
        e.reply(
          `服用成功,您额外获得了${thing_exist.天赋 * quantity
          }天赋上限,您当前炼器天赋为${player.锻造天赋}`
        );
        await Write_player(usr_qq, player);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '锻造上限') {
        if (dy.beiyong5 > 0) {
          e.reply(`您已经增加了锻造上限,消耗完毕再接着服用吧`);
          return false;
        }
        dy.xingyun = quantity;
        dy.beiyong5 = thing_exist.额外数量;
        e.reply(
          `服用成功,您下一次的炼器获得了额外的炼器格子[${thing_exist.额外数量}]`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        await Write_danyao(usr_qq, dy);
        return false;
      }
      if (thing_exist.type == '魔道值') {
        await Add_魔道值(usr_qq, -quantity * thing_exist.modao);
        e.reply(`获得了转生之力,降低了${quantity * thing_exist.modao}魔道值`);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '入魔') {
        await Add_魔道值(usr_qq, quantity * thing_exist.modao);
        e.reply(
          `${quantity}道黑色魔气入体,增加了${quantity * thing_exist.modao
          }魔道值`
        );
        await Add_najie_thing(usr_qq, thing_name, '丹药', -quantity);
        return false;
      }
      if (thing_exist.type == '补根') {
        player.灵根 = {
          id: 70001,
          name: '垃圾五灵根',
          type: '伪灵根',
          eff: 0.01,
          法球倍率: 0.01,
        };
        data.setData('player', usr_qq, player);
        e.reply(`服用成功,当前灵根为垃圾五灵根,你具备了称帝资格`);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -1);
        return false;
      }
      if (thing_exist.type == '补天') {
        player.灵根 = {
          id: 70054,
          name: '天五灵根',
          type: '天灵根',
          eff: 0.2,
          法球倍率: 0.12,
        };
        data.setData('player', usr_qq, player);
        e.reply(`服用成功,当前灵根为天五灵根,你具备了称帝资格`);
        await Add_najie_thing(usr_qq, thing_name, '丹药', -1);
        return false;
      }
      if (thing_exist.type == '突破') {
        if (player.breakthrough == true) {
          e.reply(`你已经吃过破境丹了`);
          return false;
        } else {
          player.breakthrough = true;
          data.setData('player', usr_qq, player);
          e.reply(`服用成功,下次突破概率增加20%`);
          await Add_najie_thing(usr_qq, thing_name, '丹药', -1);
          return false;
        }
      }
            if (thing_name == "生肉") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 2 * quantity)
                    e.reply(`服用成功,增加了${2 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "熟肉") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 4 * quantity)
                    e.reply(`服用成功,增加了${4 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "鱼肉") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 2 * quantity)
                    e.reply(`服用成功,增加了${2 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "烤鱼") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 4 * quantity)
                    e.reply(`服用成功,增加了${4 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "苹果") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 2 * quantity)
                    e.reply(`服用成功,增加了${2 * quantity}点饱食度`)
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "西瓜") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 1 * quantity)
                    e.reply(`服用成功,增加了${1 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "土豆") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 1 * quantity)
                    e.reply(`服用成功,增加了${1 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "烤土豆") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 3 * quantity)
                    e.reply(`服用成功,增加了${3 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "胡萝卜") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 2 * quantity)
                    e.reply(`服用成功,增加了${2 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "面包") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 3 * quantity)
                    e.reply(`服用成功,增加了${3 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "紫颂果") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 150 * quantity)
                    e.reply(`服用成功,增加了${150 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
             if (thing_name == "灵橘") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 10 * quantity)
                    e.reply(`服用成功,增加了${10 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
             if (thing_name == "仙馐果") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                    await Add_饱食度(usr_qq, 10 * quantity)
                    e.reply(`服用成功,增加了${10 * quantity}点饱食度`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
            if (thing_name == "腐肉") {
                let shicai = await exist_najie_thing(usr_qq, thing_name, "食材")
                if (shicai >= quantity) {
                    if (player.当前血量 > 0) {
                        await Add_najie_thing(usr_qq, thing_name, "食材", -quantity);
                        await Add_饱食度(usr_qq, 2 * quantity)
                        await Add_HP(usr_qq, -500000 * quantity)
                        e.reply(`服用成功,增加了${2 * quantity}点饱食度,你还剩下${player.当前血量}点血量`)
                    }
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
            }
    }


      if (func == "寻宝") {
            let player_id = await Read_player(usr_qq);
            let player = await Read_player(usr_qq);
            if (player.当前血量 < 200) {
                e.reply("你都伤成这样了,就不要出去浪了");
                return;
            }
            await Go(e);
           
            allaction = false;
            var Time = 7;
            let now_Time = new Date().getTime(); //获取当前时间戳
            if (player.daofaxianshu == 2) {
                Time = 3
            }
            let shuangxiuTimeout = parseInt(60000 * Time);
            let last_time = await redis.get("xiuxian:player:" + usr_qq + "xunbaocd");//获得上次的时间戳,
            last_time = parseInt(last_time);
            if (now_Time < last_time + shuangxiuTimeout) {
                let Couple_m = Math.trunc((last_time + shuangxiuTimeout - now_Time) / 60 / 1000);
                let Couple_s = Math.trunc(((last_time + shuangxiuTimeout - now_Time) % 60000) / 1000);
                if (player.daofaxianshu == 2) {
                    e.reply("【道法仙术】护您左右，为您缩短了寻宝时间！正在归来途中.....\n" + `还需要  ${Couple_m}分 ${Couple_s}秒。`);
                } else {
                    e.reply("正在归来途中.....\n" + `还需要  ${Couple_m}分 ${Couple_s}秒。`);
                }
                return;
            }
            let x = await exist_najie_thing(usr_qq, thing_name, thing_exist.class);
            if (!x) {
                e.reply(`你没有【${thing_name}】这样的地图`);
                return;
            }
            let random = Math.random();
            let newrandom = 0.995
            let last_msg = '';
            let fyd_msg = '';
            let shuangbei = Math.random();
            let math = Math.random();
            let n = 1;
            
            let now_level_id = player.level_id;
            let now_physique_id = player.Physique_id;
            let now_mijinglevel_id = player.mijinglevel_id;
            let now_xiangulevel_id = player.xiangulevel_id;
            let t1 = 2 + Math.random();
            let t2 = 2 + Math.random();
            let xiuwei = Math.trunc(2000 + (10000 * now_level_id * now_level_id* now_mijinglevel_id * now_xiangulevel_id * t1));
            let xueqi = Math.trunc(2000 + (10000 * now_physique_id * now_physique_id* now_mijinglevel_id * now_xiangulevel_id * t2));
            if (Number(player.daofaxianshu_endtime) > now_Time) {
                last_msg += '【道法仙术】助您寻宝！本次寻宝时间缩短4分钟\n'
            }
            if (player.灵根.type === "魔卡少女" && shuangbei < 0.3 + player.幸运) {
                // 魔卡少女的特效，提升出金率和赐福加成
                n *= 2;
                last_msg += '你是魔卡少女，集天地万千宠爱于一身，双倍赐福提升30%，所以在本次探索中获得赐福加成\n';
              }
              if (player.灵根.type === "魔女" && shuangbei < 0.55 + player.幸运) {
                // 魔卡少女的特效，提升出金率和赐福加成
                n *= 4;
                last_msg += '你是魔女，旅行过许多国家，丰富的经验让你更容易发现宝藏，因此在寻宝中的赐福奖励翻倍\n';
              }  
                else if (shuangbei < player.幸运 && player.灵根.type != "魔卡少女") {
                 if (shuangbei < player.addluckyNo) {
                      last_msg += '福源丹生效，所以在';
                  } else if (player.仙宠.type == '幸运' && player.灵根.type != "魔卡少女") {
                      last_msg += '仙宠使你在探索中欧气满满，所以在';
                  }
                  n *= 2;
                  last_msg += '本次探索中获得赐福加成\n';
              }
            if (player.islucky > 0) {
                player.islucky--;
                if (player.islucky != 0) {
                    fyd_msg = `  \n福源丹的效力将在${player.islucky}次探索后失效\n`;
                } else {
                    fyd_msg = `  \n本次探索后，福源丹已失效\n`;
                    player.幸运 -= player.addluckyNo;
                    player.addluckyNo = 0;
                }
                data.setData('player', player_id, player);
                await Write_player(usr_qq, player);
            }

            // ==== 命格消费层：寻宝加成 ====
            // 「寻龙点穴」类命格感应地脉龙气，使寻常寻宝中所得更为丰沛。
            const minggeEffects = getMinggeEffects(player, data.minggeList);
            const treasureBonus = minggeEffects?.['寻宝加成'] || 0; // 可正可负
            if (treasureBonus !== 0) {
                // 将命格期望倍率并入赐福倍率 n（保持整数，所有 *n 分支自动受益），下限 1 保证至少基础产出。
                // 注意 calculateMinggeYield 内部已按 (1+bonus) 放大，此处直接传基础 n 即可，勿重复乘。
                n = Math.max(1, calculateMinggeYield(n, minggeEffects, '寻宝加成'));
                last_msg += `命格·寻龙点穴：本次寻宝产出倍率 +${Math.round(treasureBonus * 100)}%\n`;
            }

            if (random > newrandom) {
                let length = data.xianchonkouliang.length;
                let index = Math.trunc(Math.random() * length);
                let kouliang = data.xianchonkouliang[index];
                last_msg +=
                    '\n七彩流光的神奇仙谷[' +
                    kouliang.name +
                    ']深埋在土壤中，是仙兽们的最爱。';
                await Add_najie_thing(usr_qq, kouliang.name, '仙米', 1);
            }
            if (thing_name == "天衡山") {
                if (player.饱食度 < 1000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let mugao = await exist_najie_thing(usr_qq, "木镐", "道具")
                let shigao = await exist_najie_thing(usr_qq, "石镐", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (mugao > 0 || shigao > 0) {
                    await Add_饱食度(usr_qq, -1000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(mugao) && mugao > quantity - 1) {
                        await Add_najie_thing(usr_qq, "圆石", "材料", 3 * n);
                        await Add_najie_thing(usr_qq, "木镐", "道具", -1);
                        mugao = 1
                    } else {
                        mugao = 0;
                    }
                    if (isNotNull(shigao) && shigao > quantity - 1) {
                        await Add_najie_thing(usr_qq, "圆石", "材料", 9 * n);
                        await Add_najie_thing(usr_qq, "石镐", "道具", -1);
                        shigao = 1
                    } else {
                        shigao = 0;
                    }
                    await Add_najie_thing(usr_qq, "天衡山", "道具", -1);
                    await Add_灵石(usr_qq, 150000)
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.9 && math < 1) {
                        await Add_najie_thing(usr_qq, "降诸魔山", "道具", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在天衡山捡到了15w灵石和圆石${3 * mugao * n + 9 * shigao * n}以及降诸魔山地图${1 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.8 && math < 0.9) {
                        await Add_najie_thing(usr_qq, "煤炭", "材料", 5 * n);
                        e.reply(`${last_msg}${fyd_msg}你在天衡山捡到了15w灵石和圆石${3 * mugao * n + 9 * shigao * n}以及煤炭${5 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } 
                     else {
                        e.reply(`${last_msg}${fyd_msg}你在天衡山捡到了15w灵石和圆石${3 * mugao * n + 9 * shigao * n},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有镐子,于是又回家了')
                    return;
                }
            }
            const grantMapFishingLoot = async (name, itemClass, baseAmount) => {
                const amount = addMemoryLootBonus(player, await foundthing(name, { readOnly: true }), baseAmount);
                await Add_najie_thing(usr_qq, name, itemClass, amount);
                return amount;
            };
            if (thing_name == "天臂池") {
                n *= getMemoryEffects(player).lootMultiplier * getMemoryEffects(player).fishingMultiplier;
                if (player.饱食度 < 1000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let futou = await exist_najie_thing(usr_qq, "钓鱼竿", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (futou > 0) {
                    await Add_饱食度(usr_qq, -1000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    const fishCount = await grantMapFishingLoot("鱼肉", "食材", 100 * n);
                    await Add_najie_thing(usr_qq, "钓鱼竿", "道具", -1);
                    await Add_najie_thing(usr_qq, "天臂池", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.7 && math <= 1) {
                        const amount = await grantMapFishingLoot("经验瓶", "丹药", n);
                        e.reply(`${last_msg}${fyd_msg}你运气真好，在天臂池钓到经验瓶${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.3 && math <= 0.7) {
                        const amount = await grantMapFishingLoot("经验球", "丹药", n);
                        e.reply(`${last_msg}${fyd_msg}你在天臂池钓到经验球${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.01 && math <= 0.3) {
                        const amount = await grantMapFishingLoot("血气瓶", "丹药", n);
                        e.reply(`${last_msg}${fyd_msg}你在天臂池钓到血气瓶${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0 && math <= 0.01) {
                        const amount = await grantMapFishingLoot("经验瓶", "丹药", n * 10);
                        e.reply(`${last_msg}${fyd_msg}你运气爆棚了！在天臂池钓到经验瓶${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你发现你没带钓鱼竿，所以回家了')
                    return;
                }
            }
            if (thing_name == "沉沦之海") {
                n *= getMemoryEffects(player).lootMultiplier * getMemoryEffects(player).fishingMultiplier;
                if (player.饱食度 < 5000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let futou = await exist_najie_thing(usr_qq, "钓鱼竿", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (futou > 0) {
                    await Add_饱食度(usr_qq, -5000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    const fishCount = await grantMapFishingLoot("鱼肉", "食材", 500 * n);
                    await Add_najie_thing(usr_qq, "钓鱼竿", "道具", -1);
                    await Add_najie_thing(usr_qq, "沉沦之海", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.7 && math <= 1) {
                        const amount = await grantMapFishingLoot("利维坦之心", "丹药", n * 10);
                        e.reply(`${last_msg}${fyd_msg}你运气真好，在沉沦之海钓到利维坦之心${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.3 && math <= 0.7) {
                        const amount = await grantMapFishingLoot("利维坦之心", "丹药", n * 2);
                        e.reply(`${last_msg}${fyd_msg}你在沉沦之海钓到利维坦之心${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.01 && math <= 0.3) {
                        const amount = await grantMapFishingLoot("海神之血", "丹药", n * 2);
                        e.reply(`${last_msg}${fyd_msg}你在沉沦之海钓到海神之血${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0 && math <= 0.01) {
                        const amount = await grantMapFishingLoot("海神之血", "丹药", n * 10);
                        e.reply(`${last_msg}${fyd_msg}你运气爆棚了！在沉沦之海钓到海神之血${amount}个,鱼肉${fishCount},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你发现你没带钓鱼竿，所以回家了')
                    return;
                }
            }
            if (thing_name == "星落湖") {
                n *= getMemoryEffects(player).lootMultiplier * getMemoryEffects(player).fishingMultiplier;
                if (player.饱食度 < 1000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                if (now_level_id < 41) {
                    e.reply("你是仙人吗就去星落湖");
                    return;
                }
                let futou = await exist_najie_thing(usr_qq, "钓鱼竿", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (futou > 0) {
                    await Add_饱食度(usr_qq, -1000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    const fishCount = await grantMapFishingLoot("鱼肉", "食材", 100 * n);
                    await Add_najie_thing(usr_qq, "钓鱼竿", "道具", -1);
                    await Add_najie_thing(usr_qq, "星落湖", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.9 && math <= 1) {
                        const amount = await grantMapFishingLoot("钓鱼掉上来的奇怪盒子", "道具", n * 2);
                        e.reply(`${last_msg}${fyd_msg}你运气太好了,钓上来了钓鱼掉上来的奇怪盒子${amount}个,鱼肉${fishCount}`)
                        return;
                    } else {
                        const amount = await grantMapFishingLoot("钓鱼掉上来的奇怪盒子", "道具", n);
                        e.reply(`${last_msg}${fyd_msg}你钓到鱼肉${fishCount},钓鱼掉上来的奇怪盒子${amount}个`)
                        return;
                    }
                } else {
                    e.reply('你发现你没带钓鱼竿，所以回家了')
                    return;
                }
            }
            if (thing_name == "低语森林") {
                if (player.饱食度 < 500) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let futou = await exist_najie_thing(usr_qq, "木斧", "道具")
                let shifu = await exist_najie_thing(usr_qq, "石斧", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (futou > 0 || shifu > 0) {
                    await Add_饱食度(usr_qq, -500)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(futou) && futou > 0) {
                        await Add_najie_thing(usr_qq, "原木", "材料", 3 * n);
                        await Add_najie_thing(usr_qq, "木斧", "道具", -1);
                        futou = 1
                    } else {
                        futou = 0;
                    }
                    if (isNotNull(shifu) && shifu > 0) {
                        await Add_najie_thing(usr_qq, "原木", "材料", 9 * n);
                        await Add_najie_thing(usr_qq, "石斧", "道具", -1);
                        shifu = 1
                    } else {
                        shifu = 0;
                    }
                    await Add_najie_thing(usr_qq, "低语森林", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0 && math <= 0.3) {
                        await Add_najie_thing(usr_qq, "水天丛林", "道具", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在低语森林捡到了原木${3 * futou * n + 9 * shifu * n}个和一个水天丛林地图,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.8 && math < 0.9) {
                        await Add_najie_thing(usr_qq, "苹果", "食材", 32 * n);
                        e.reply(`${last_msg}${fyd_msg}你在低语森林捡到了原木${3 * futou * n + 9 * shifu * n}个和苹果${32 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } 
                    else {
                        e.reply(`${last_msg}${fyd_msg}你在低语森林捡到了原木${3 * futou * n + 9 * shifu * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    await Add_najie_thing(usr_qq, "原木", "材料", 1 * n);
                    await Add_najie_thing(usr_qq, "低语森林", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    e.reply(`你因为没带斧头,所以只捡到了原木${1 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                    player.饱食度 -= 500;
                    await Write_player(usr_qq, player);
                    return;
                }
            }
            if (thing_name == "水天丛林") {
                if (player.饱食度 < 1000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let futou = await exist_najie_thing(usr_qq, "木斧", "道具")
                let shifu = await exist_najie_thing(usr_qq, "石斧", "道具")

                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (futou > 0 || shifu > 0) {
                    await Add_饱食度(usr_qq, -1000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(futou) && futou > 0) {
                        await Add_najie_thing(usr_qq, "原木", "材料", 10 * n);
                        await Add_najie_thing(usr_qq, "木斧", "道具", -1);
                        futou = 1
                    } else {
                        futou = 0;
                    }
                    if (isNotNull(shifu) && shifu > 0) {
                        await Add_najie_thing(usr_qq, "原木", "材料", 20 * n);
                        await Add_najie_thing(usr_qq, "石斧", "道具", -1);
                        shifu = 1
                    } else {
                        shifu = 0;
                    }
                    await Add_najie_thing(usr_qq, "水天丛林", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.8 && math < 0.9) {
                        await Add_najie_thing(usr_qq, "西瓜", "食材", 128 * n);
                        e.reply(`${last_msg}${fyd_msg}你在水天丛林捡到了原木${5 * futou * n + 15 * shifu * n}个和西瓜${128 * n},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }  else {
                        e.reply(`${last_msg}${fyd_msg}你在水天丛林捡到了原木${5 * futou * n + 15 * shifu * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有斧头,于是又回家了')
                    return;
                }
            }
            if (thing_name == "恒那兰那") {
                if (player.饱食度 <= 100) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let muchan = await exist_najie_thing(usr_qq, "木铲", "道具")
                let shichan = await exist_najie_thing(usr_qq, "石铲", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (muchan > 0 || shichan > 0) {
                    await Add_饱食度(usr_qq, -100)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(muchan) && muchan > quantity - 1) {
                        await Add_najie_thing(usr_qq, "胡萝卜", "食材", 150 * n);
                        await Add_najie_thing(usr_qq, "土豆", "食材", 150 * n);
                        await Add_najie_thing(usr_qq, "木铲", "道具", -1);
                        muchan = 1
                    } else {
                        muchan = 0;
                    }
                    if (isNotNull(shichan) && shichan > quantity - 1) {
                        await Add_najie_thing(usr_qq, "胡萝卜", "食材", 300 * n);
                        await Add_najie_thing(usr_qq, "土豆", "食材", 300 * n);
                        await Add_najie_thing(usr_qq, "石铲", "道具", -1);
                        shichan = 1
                    } else {
                        shichan = 0;
                    }
                    await Add_najie_thing(usr_qq, "恒那兰那", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.90 && math <= 1) {
                        await Add_najie_thing(usr_qq, "铁矿", "材料", 2 * n);
                        e.reply(`${last_msg}${fyd_msg}你在恒那兰那捡到了胡萝卜${150 * muchan * n + 300 * n * shichan}个和土豆${150 * muchan * n + 300 * n * shichan}个,在猪人箱子里找到铁矿${2 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.8 && math <= 0.9) {
                        await Add_najie_thing(usr_qq, "煤炭", "材料", 5 * n);
                        e.reply(`${last_msg}${fyd_msg}你在恒那兰那捡到了胡萝卜${150 * muchan * n + 300 * n * shichan}个和土豆${150 * muchan * n + 300 * n * shichan}个,在猪人箱子里找到煤炭${5 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0 && math <= 0.2) {
                        await Add_najie_thing(usr_qq, "轻策庄", "道具", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在恒那兰那捡到了胡萝卜${150 * muchan * n + 300 * n * shichan}个和土豆${150 * muchan * n + 300 * n * shichan}个,在猪人箱子里找到轻策庄地图${1 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.7 && math <= 0.8) {
                        await Add_najie_thing(usr_qq, "甘蔗", "食材", 5 * n);
                        e.reply(`${last_msg}${fyd_msg}你在恒那兰那捡到了胡萝卜${150 * muchan * n + 300 * n * shichan}个和土豆${150 * muchan * n + 300 * n * shichan}个,在猪人家里找到书架${5 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else {
                        e.reply(`${last_msg}${fyd_msg}你在恒那兰那捡到了胡萝卜${150 * muchan * n + 300 * n * shichan}个和土豆${150 * muchan * n + 300 * n * shichan}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有铲子,于是又回家了')
                    return;
                }

            }
            if (thing_name == "轻策庄") {
                if (player.饱食度 < 100) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let muchan = await exist_najie_thing(usr_qq, "铁铲", "道具")
                let shichan = await exist_najie_thing(usr_qq, "金铲", "道具")
                let zuanshichan = await exist_najie_thing(usr_qq, "钻石铲", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (muchan > 0 || shichan > 0 || zuanshichan > 0) {
                    await Add_饱食度(usr_qq, -100)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(muchan) && muchan > 0) {
                        muchan = 1
                        await Add_najie_thing(usr_qq, "小麦", "食材", 1000 * muchan * n);
                        await Add_najie_thing(usr_qq, "铁铲", "道具", -1 * muchan);
                    } else {
                        muchan = 0;
                    }
                    if (isNotNull(shichan) && shichan > 0) {
                        shichan = 1
                        await Add_najie_thing(usr_qq, "小麦", "食材", 1000 * shichan * n);
                        await Add_najie_thing(usr_qq, "金铲", "道具", -1 * shichan);
                    } else {
                        shichan = 0;
                    }
                    if (isNotNull(zuanshichan) && zuanshichan > 0) {
                        zuanshichan = 1
                        await Add_najie_thing(usr_qq, "小麦", "食材", 2000 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "钻石铲", "道具", -1 * zuanshichan);
                    } else {
                        zuanshichan = 0;
                    }
                    await Add_najie_thing(usr_qq, "轻策庄", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.9 && math <= 1) {
                        await Add_najie_thing(usr_qq, "铁矿", "材料", 3 * n);
                        e.reply(`${last_msg}${fyd_msg}你在轻策庄捡到了小麦${1000 * muchan * n + 1000 * shichan * n + 2000 * zuanshichan * n}个和铁矿${3 * n},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.7 && math <= 0.8) {
                        await Add_najie_thing(usr_qq, "甘蔗", "食材", 10 * n);
                        e.reply(`${last_msg}${fyd_msg}你在轻策庄捡到了小麦${1000 * muchan * n + 1000 * shichan * n + 2000 * zuanshichan * n}个和甘蔗${10 * n},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.6 && math <= 0.7) {
                        await Add_najie_thing(usr_qq, "黑曜石", "材料", 5 * n);
                        e.reply(`${last_msg}${fyd_msg}你在轻策庄捡到了小麦${1000 * muchan * n + 1000 * shichan * n + 2000 * zuanshichan * n}个和黑曜石${5 * n},获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else {
                        e.reply(`${last_msg}${fyd_msg}你在轻策庄捡到了小麦${1000 * muchan * n + 1000 * shichan * n + 2000 * zuanshichan * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有铲子,于是又回家了')
                    return;
                }
            }
            if (thing_name == "降诸魔山") {
                if (player.饱食度 < 2000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let kouxue = parseInt(player.血量上限 * 0.25)
                let mugao = await exist_najie_thing(usr_qq, "铁镐", "道具")
                let shigao = await exist_najie_thing(usr_qq, "石镐", "道具")

                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                let huoba = await exist_najie_thing(usr_qq, "火把", "道具")
                if (huoba < 30) {
                    e.reply('你的火把不够,先去弄一些火把再来吧');
                    return;
                }
                if (mugao > 0 || shigao > 0) {
                    await Add_饱食度(usr_qq, -2000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(mugao) && mugao > quantity - 1) {
                        mugao = 1;
                        await Add_najie_thing(usr_qq, "圆石", "材料", 18 * mugao * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", 18 * mugao * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", 9 * mugao * n);
                        await Add_najie_thing(usr_qq, "铁镐", "道具", -1 * mugao);
                    } else {
                        mugao = 0;
                    }
                    if (isNotNull(shigao) && shigao > quantity - 1) {
                        shigao = 1;
                        await Add_najie_thing(usr_qq, "圆石", "材料", 9 * shigao * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", 9 * shigao * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", 3 * shigao * n);
                        await Add_najie_thing(usr_qq, "石镐", "道具", -1 * shigao);
                    } else {
                        shigao = 0;
                    }
                    await Add_najie_thing(usr_qq, "降诸魔山", "道具", -1);
                    await Add_najie_thing(usr_qq, "火把", "道具", -30);
                    await Add_灵石(usr_qq, 150000)
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.9 && math < 1) {
                        await Add_najie_thing(usr_qq, "星荧洞窟", "道具", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在降诸魔山捡到了15w灵石和挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,和星荧洞窟地图${1 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.8 && math < 0.9) {
                        await Add_HP(usr_qq, -kouxue)
                        await Add_najie_thing(usr_qq, "腐肉", "食材", 32 * n);
                        e.reply(`${last_msg}${fyd_msg}你在降诸魔山捡到了15w灵石和挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,'在探索途中遇到一些僵尸,你击败了他们,剩余${player.当前血量}血量,捡到腐肉${32 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.7 && math < 0.8) {
                        await Add_HP(usr_qq, -kouxue)
                        await Add_najie_thing(usr_qq, "骨头", "材料", 5 * n);
                        e.reply(`${last_msg}${fyd_msg}你在降诸魔山捡到了15w灵石和挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,'在探索途中遇到一些骷髅,你击败了他们,剩余${player.当前血量}血量,捡到骨头${5 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.6 && math < 0.7) {
                        await Add_HP(usr_qq, -kouxue * 4)
                        await Add_najie_thing(usr_qq, "圆石", "材料", -18 * mugao * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", -18 * mugao * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", -9 * mugao * n);
                        await Add_najie_thing(usr_qq, "圆石", "材料", -9 * shigao * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", -9 * shigao * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", -3 * shigao * n);
                        await Add_灵石(usr_qq, -150000)
                        await Add_血气(usr_qq, -xueqi)
                        await Add_修为(usr_qq, -xiuwei)
                        e.reply('你在挖矿途中一只苦力怕靠近你然后爆炸了,你来不及反应,剩余' + player.当前血量 + '血量，你什么都没有得到')
                        return;
                    } else {
                        e.reply(`${last_msg}${fyd_msg}你在降诸魔山捡到了15w灵石和挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有镐子,于是又回家了')
                    return;
                }
            }
            if (thing_name == "星荧洞窟") {
                if (now_level_id < 41) {
                    e.reply("你是仙人吗就去星荧洞窟");
                    return;
                }
                if (player.饱食度 < 3000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                let kouxue = parseInt(player.血量上限 * 0.25)
                let mugao = await exist_najie_thing(usr_qq, "铁镐", "道具")
                let shigao = await exist_najie_thing(usr_qq, "石镐", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                if (mugao > 0 || shigao > 0) {
                    await Add_饱食度(usr_qq, -3000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(mugao) && mugao > quantity - 1) {
                        await Add_najie_thing(usr_qq, "圆石", "材料", 18 * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", 18 * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", 9 * n);
                        await Add_najie_thing(usr_qq, "黄金矿", "材料", 9 * n);
                        await Add_najie_thing(usr_qq, "铁镐", "道具", -1);
                        mugao = 1;
                    } else {
                        mugao = 0;
                    }
                    if (isNotNull(shigao) && shigao > quantity - 1) {
                        await Add_najie_thing(usr_qq, "圆石", "材料", 9 * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", 9 * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", 3 * n);
                        await Add_najie_thing(usr_qq, "石镐", "道具", -1);
                        shigao = 1;
                    } else {
                        shigao = 0;
                    }
                    await Add_najie_thing(usr_qq, "星荧洞窟", "道具", -1);
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.9 && math <= 1) {
                        await Add_najie_thing(usr_qq, "层岩巨渊", "道具", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在星荧洞窟捡到了挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,黄金矿${9 * mugao * n}个和层岩巨渊地图${1 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                    } else if (math > 0.1 && math <= 0.3) {
                        await Add_HP(usr_qq, -kouxue)
                        await Add_najie_thing(usr_qq, "腐肉", "食材", 64 * n);
                        e.reply(`${last_msg}${fyd_msg}你在星荧洞窟捡到了挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,黄金矿${9 * mugao * n}个,'在探索途中遇到一些僵尸,你击败了他们,剩余${player.当前血量}捡到腐肉${64 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                    } else if (math > 0.3 && math <= 0.5) {
                        await Add_HP(usr_qq, -kouxue)
                        await Add_najie_thing(usr_qq, "骨头", "材料", 10 * n);
                        e.reply(`${last_msg}${fyd_msg}你在星荧洞窟捡到了挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,黄金矿${9 * mugao * n}个,在探索途中遇到一些骷髅,你击败了他们,剩余${player.当前血量}捡到骨头${10 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                    } else if (math > 0.8 && math <= 0.9) {
                        await Add_najie_thing(usr_qq, "红石", "材料", 128 * n);
                        e.reply(`${last_msg}${fyd_msg}你在星荧洞窟捡到了挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,黄金矿${9 * mugao * n}个和红石${128 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                    } else if (math == 0.01) {
                        await Add_najie_thing(usr_qq, "圆石", "材料", -18 * mugao * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", -18 * mugao * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", -9 * mugao * n);
                        await Add_najie_thing(usr_qq, "金矿", "材料", -9 * mugao * n);
                        await Add_najie_thing(usr_qq, "圆石", "材料", -9 * shigao * n);
                        await Add_najie_thing(usr_qq, "煤炭", "材料", -9 * shigao * n);
                        await Add_najie_thing(usr_qq, "铁矿", "材料", -3 * shigao * n);
                        await Add_血气(usr_qq, -xueqi)
                        await Add_修为(usr_qq, -xiuwei)
                        await Add_HP(usr_qq, -kouxue * 4)
                        await Add_灵石(usr_qq, -1000000)
                        e.reply('你在挖矿途中一只苦力怕靠近你然后爆炸了,你来不及反应,剩余' + player.当前血量 + '你什么都没有得到')
                    } else {
                        e.reply(`${last_msg}${fyd_msg}你在星荧洞窟捡到了挖到圆石${18 * mugao * n + 9 * shigao * n}个,煤炭${18 * mugao * n + 9 * shigao * n}个,铁矿${9 * mugao * n + 3 * shigao * n}个,黄金矿${9 * mugao * n}个,获得了修为${xiuwei}血气${xueqi}`)
                    }
                } else {
                    e.reply('你想起来你没有石镐或铁镐,于是又回家了')
                    return;
                }
            }
            if (thing_name == "层岩巨渊") {
                if (player.饱食度 <= 5000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                if (now_level_id < 41) {
                    e.reply("你是仙人吗就去层岩巨渊");
                    return;
                }
                let kouxue = parseInt(player.血量上限 * 0.25)
                let muchan = await exist_najie_thing(usr_qq, "铁镐", "道具")
                let shichan = await exist_najie_thing(usr_qq, "金镐", "道具")
                let zuanshichan = await exist_najie_thing(usr_qq, "钻石镐", "道具")
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                let huoba = await exist_najie_thing(usr_qq, "火把", "道具")
                if (huoba < 60) {
                    e.reply('你的火把不够,先去弄一些火把再来吧');
                    return;
                }
                if (muchan > 0 || shichan > 0 || zuanshichan > 0) {
                    let heiyaoshi = false;
                    await Add_饱食度(usr_qq, -5000)
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(muchan) && muchan > quantity - 1) {
                        muchan = 1;
                        await Add_najie_thing(usr_qq, "圆石", "材料", 18 * muchan * n);
                        await Add_najie_thing(usr_qq, "钻石", "材料", 3 * muchan * n);
                        await Add_najie_thing(usr_qq, "青金石", "材料", 9 * muchan * n);
                        await Add_najie_thing(usr_qq, "铁镐", "道具", -1 * muchan);
                    } else {
                        muchan = 0;
                    }
                    if (isNotNull(shichan) && shichan > quantity - 1) {
                        shichan = 1;
                        await Add_najie_thing(usr_qq, "圆石", "材料", 18 * shichan * n);
                        await Add_najie_thing(usr_qq, "钻石", "材料", 3 * shichan * n);
                        await Add_najie_thing(usr_qq, "青金石", "材料", 9 * shichan * n);
                        await Add_najie_thing(usr_qq, "金镐", "道具", -1 * shichan);
                    } else {
                        shichan = 0;
                    }
                    if (isNotNull(zuanshichan) && zuanshichan > quantity - 1) {
                        zuanshichan = 1;
                        await Add_najie_thing(usr_qq, "圆石", "材料", 18 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "钻石", "材料", 9 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "青金石", "材料", 18 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "钻石镐", "道具", -1 * zuanshichan);
                        await Add_najie_thing(usr_qq, "黑曜石", "材料", 12 * n);
                        heiyaoshi = true;
                    } else {
                        zuanshichan = 0;
                    }
                    await Add_najie_thing(usr_qq, "层岩巨渊", "道具", -1);
                    await Add_najie_thing(usr_qq, "火把", "道具", -60);
                    await Add_灵石(usr_qq, 200000)
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.9 && math <= 1) {
                        await Add_HP(usr_qq, -kouxue)
                        await Add_najie_thing(usr_qq, "腐肉", "食材", 128 * n);
                        if (heiyaoshi == true) {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,黑曜石${12 * n},在探索途中遇到一些僵尸,你击败了他们,剩余${player.当前血量}捡到腐肉${128 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        } else {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,在探索途中遇到一些僵尸,你击败了他们,剩余${player.当前血量}捡到腐肉${128 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        }
                    } else if (math > 0.8 && math <= 0.9) {
                        await Add_HP(usr_qq, -kouxue)
                        await Add_najie_thing(usr_qq, "骨头", "材料", 20 * n);
                        if (heiyaoshi == true) {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,黑曜石${12 * n}个,在探索途中遇到一些骷髅,你击败了他们,剩余${player.当前血量}捡到骨头${20 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        } else {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,在探索途中遇到一些骷髅,你击败了他们,剩余${player.当前血量}捡到骨头${20 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        }
                    } else if (math > 0.3 && math <= 0.4) {
                        await Add_najie_thing(usr_qq, "红石", "材料", 256 * n);
                        if (heiyaoshi == true) {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,红石${256 * n}个，黑曜石${12 * n}个,,获得了修为${xiuwei}血气${xueqi}`)
                        } else {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,红石${256 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        }
                    } else {
                        if (heiyaoshi == true) {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,,黑曜石${12 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        } else {
                            e.reply(`${last_msg}${fyd_msg}你在层岩巨渊捡到了20w灵石和挖到圆石${18 * muchan * n + 18 * shichan * n + 18 * zuanshichan * n}个,钻石${3 * muchan * n + 3 * shichan * n + 9 * zuanshichan * n}个,青金石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        }
                    }
                } else {
                    e.reply('你想起来你没有镐子,于是又回家了')
                    return;
                }
            }
            if (thing_name == "末地") {
                if (player.饱食度 <= 20000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                if (player.修为 < 25000000) {
                    e.reply("你需要积累2500w修为才能抵御末地魔气");
                    return;
                }
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                let shenyuan = await exist_najie_thing(usr_qq, "末地传送门", "道具")
                if (shenyuan < 1) {
                    e.reply('你的传送门不足')
                    return;
                }
                let huoba = await exist_najie_thing(usr_qq, "火把", "道具")
                if (huoba < 120) {
                    e.reply('你的火把不够,先去弄一些火把再来吧');
                    return;
                }
                let shichan = await exist_najie_thing(usr_qq, "金镐", "道具")
                let zuanshichan = await exist_najie_thing(usr_qq, "钻石镐", "道具")
                let xiajiehejinchan = await exist_najie_thing(usr_qq, "下界合金镐", "道具")
                let n = 1;
                if (zuanshichan > 0 || shichan > 0 || xiajiehejinchan > 0) {
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(shichan) && shichan > 0) {
                        shichan = 1
                        await Add_najie_thing(usr_qq, "末地石", "材料", 9 * shichan * n);
                        await Add_najie_thing(usr_qq, "金镐", "道具", -1 * shichan);
                    } else {
                        shichan = 0;
                    }
                    if (isNotNull(zuanshichan) && zuanshichan > 0) {
                        zuanshichan = 1
                        await Add_najie_thing(usr_qq, "末地石", "材料", 9 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "钻石镐", "道具", -1 * zuanshichan);
                    } else {
                        zuanshichan = 0;
                    }
                    if (isNotNull(xiajiehejinchan) && xiajiehejinchan > 0) {
                        xiajiehejinchan = 1
                        await Add_najie_thing(usr_qq, "末地石", "材料", 18 *xiajiehejinchan * n);
                        await Add_najie_thing(usr_qq, "末路水晶", "材料", 9 * xiajiehejinchan * n);
                        await Add_najie_thing(usr_qq, "下界合金镐", "道具", -1 * xiajiehejinchan);
                    } else {
                        xiajiehejinchan = 0;
                    }
                    await Add_najie_thing(usr_qq, "火把", "道具", -120);
                    await Add_najie_thing(usr_qq, "末地", "道具", -1);
                    await Add_najie_thing(usr_qq, "末地传送门", "道具", -1);
                    await Add_修为(usr_qq, -25000000)
                    await Add_饱食度(usr_qq, -20000)
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.95 && math <= 1) {
                        await Add_najie_thing(usr_qq, "七星海棠丹", "丹药", 5 * n);
                        e.reply(`${last_msg}${fyd_msg}你在末地捡到了末地石${9 * shichan * n + 9 * zuanshichan * n + 18 * xiajiehejinchan * n}个,末路水晶${9 * xiajiehejinchan * n}个,还有七星海棠丹五个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.6 && math <= 0.7) {
                        await Add_najie_thing(usr_qq, "紫颂果", "食材", 99 * n);
                        e.reply(`${last_msg}${fyd_msg}你在末地捡到了末地石${9 * shichan * n + 9 * zuanshichan * n + 18 * xiajiehejinchan * n}个,末路水晶${9 * xiajiehejinchan * n}个,额外捡到紫颂果${99 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.2 && math <= 0.3) {
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", 80 * n);
                        e.reply(`${last_msg}${fyd_msg}你在末地捡到了末地石${9 * shichan * n + 9 * zuanshichan * n + 18 * xiajiehejinchan * n}个,末路水晶${9 * xiajiehejinchan * n}个,额外捡到血气瓶${80 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.1 && math <= 0.2) {
                        await Add_najie_thing(usr_qq, "龙蛋", "道具", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在末地捡到了末地石${9 * shichan * n + 9 * zuanshichan * n + 18 * xiajiehejinchan * n}个,末路水晶${9 * xiajiehejinchan * n}个,额外捡到龙蛋${1 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;    
                    }else {
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", 80 * n);
                        e.reply(`${last_msg}${fyd_msg}你在末地捡到了末地石${9 * shichan * n + 9 * zuanshichan * n + 18 * xiajiehejinchan * n}个,末路水晶${9 * xiajiehejinchan * n}个,额外捡到经验瓶${80 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有镐子,于是又回家了')
                    return;
                }
            }
            if (thing_name == "深渊") {
                if (player.饱食度 <= 10000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                if (now_level_id < 41) {
                    e.reply("你是仙人吗就去深渊");
                    return;
                }
                if (player.修为 < 15000000) {
                    e.reply("你需要积累1500w修为才能抵御深渊魔气");
                    return;
                }
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                let shenyuan = await exist_najie_thing(usr_qq, "深渊传送门", "道具")
                if (shenyuan < 1) {
                    e.reply('你的传送门不足')
                    return;
                }
                let huoba = await exist_najie_thing(usr_qq, "火把", "道具")
                if (huoba < 120) {
                    e.reply('你的火把不够,先去弄一些火把再来吧');
                    return;
                }
                let muchan = await exist_najie_thing(usr_qq, "铁镐", "道具")
                let shichan = await exist_najie_thing(usr_qq, "金镐", "道具")
                let zuanshichan = await exist_najie_thing(usr_qq, "钻石镐", "道具")
                n = 1;
                if (muchan > 0 || shichan > 0 || zuanshichan > 0) {
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(muchan) && muchan > 0) {
                        muchan = 1
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 9 * muchan * n);
                        await Add_najie_thing(usr_qq, "铁镐", "道具", -1 * muchan);
                    } else {
                        muchan = 0;
                    }
                    if (isNotNull(shichan) && shichan > 0) {
                        shichan = 1
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 9 * shichan * n);
                        await Add_najie_thing(usr_qq, "金镐", "道具", -1 * shichan);
                    } else {
                        shichan = 0;
                    }
                    if (isNotNull(zuanshichan) && zuanshichan > 0) {
                        zuanshichan = 1
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 18 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "下界合金矿", "材料", 9 * zuanshichan * n);
                        await Add_najie_thing(usr_qq, "钻石镐", "道具", -1 * zuanshichan);
                    } else {
                        zuanshichan = 0;
                    }
                    await Add_najie_thing(usr_qq, "火把", "道具", -120);
                    await Add_najie_thing(usr_qq, "深渊", "道具", -1);
                    await Add_najie_thing(usr_qq, "深渊传送门", "道具", -1);
                    await Add_修为(usr_qq, -15000000)
                    await Add_饱食度(usr_qq, -10000)
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.95 && math <= 1) {
                        await Add_najie_thing(usr_qq, "七星海棠丹", "丹药", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,还有七星海棠丹一个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.5 && math <= 0.6) {
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 100 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,额外捡到深渊石${100 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.6 && math <= 0.7) {
                        await Add_najie_thing(usr_qq, "甘蔗", "食材", 99 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,额外捡到甘蔗${99 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.1 && math <= 0.2) {
                        await Add_najie_thing(usr_qq, "岩浆", "材料", 15 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,岩浆${15 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.2 && math <= 0.3) {
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", 30 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,血气瓶${30 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.3 && math <= 0.4) {
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", 40 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,经验瓶${40 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if(math > 0.8 && math <= 0.9){
                        await Add_najie_thing(usr_qq, "末影之眼", "材料", 12 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,末影之眼${100 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }else {
                        await Add_najie_thing(usr_qq, "经验球", "丹药", 100 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,经验球${100 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有镐子,于是又回家了')
                    return;
                }
            }
            if (thing_name == "泰拉肉前丛林") {
                if (player.饱食度 <= 5000) {
                    e.reply('你快饿死了,还是先吃点东西吧');
                    return;
                }
                if (now_level_id < 41) {
                    e.reply("你是仙人吗就去深渊");
                    return;
                }
                if (player.修为 < 15000000) {
                    e.reply("你需要积累1500w修为才能穿梭异世界");
                    return;
                }
                if (quantity > 1) {
                    e.reply("地图一次只能使用一个")
                    return;
                }
                let shenyuan = await exist_najie_thing(usr_qq, "异界水晶球", "道具")
                if (shenyuan < 1) {
                    e.reply('你的异界水晶球不足')
                    return;
                }
                let huoba = await exist_najie_thing(usr_qq, "火把", "道具")
                if (huoba < 20) {
                    e.reply('你的火把不够,先去弄一些火把再来吧');
                    return;
                }
                let muchan = await exist_najie_thing(usr_qq, "铁镐", "道具")
                let shichan = await exist_najie_thing(usr_qq, "金镐", "道具")
                n = 1;
                if (muchan > 0 || shichan > 0 || zuanshichan > 0) {
                    await redis.set("xiuxian:player:" + usr_qq + "xunbaocd", now_Time);
                    if (isNotNull(muchan) && muchan > 0) {
                        muchan = 1
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 9 * muchan * n);
                        await Add_najie_thing(usr_qq, "铁镐", "道具", -1 * muchan);
                    } else {
                        muchan = 0;
                    }
                    if (isNotNull(shichan) && shichan > 0) {
                        shichan = 1
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 9 * shichan * n);
                        await Add_najie_thing(usr_qq, "金镐", "道具", -1 * shichan);
                    } else {
                        shichan = 0;
                    }

                    await Add_najie_thing(usr_qq, "火把", "道具", -30);
                    await Add_najie_thing(usr_qq, "泰拉肉前丛林", "道具", -1);
                    await Add_najie_thing(usr_qq, "异界水晶球", "道具", -1);
                    await Add_修为(usr_qq, -15000000)
                    await Add_饱食度(usr_qq, -5000)
                    await Add_血气(usr_qq, xueqi)
                    await Add_修为(usr_qq, xiuwei)
                    if (math > 0.95 && math <= 1) {
                        await Add_najie_thing(usr_qq, "七星海棠丹", "丹药", 1 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,还有七星海棠丹一个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.5 && math <= 0.6) {
                        await Add_najie_thing(usr_qq, "深渊石", "材料", 100 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,额外捡到深渊石${100 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.6 && math <= 0.7) {
                        await Add_najie_thing(usr_qq, "甘蔗", "食材", 99 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,额外捡到甘蔗${99 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.1 && math <= 0.2) {
                        await Add_najie_thing(usr_qq, "岩浆", "材料", 15 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,岩浆${15 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.2 && math <= 0.3) {
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", 30 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,血气瓶${30 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if (math > 0.3 && math <= 0.4) {
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", 40 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,经验瓶${40 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    } else if(math > 0.8 && math <= 0.9){
                        await Add_najie_thing(usr_qq, "末影之眼", "材料", 12 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,末影之眼${100 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }else {
                        await Add_najie_thing(usr_qq, "经验球", "丹药", 100 * n);
                        e.reply(`${last_msg}${fyd_msg}你在深渊捡到了深渊石${9 * muchan * n + 9 * shichan * n + 18 * zuanshichan * n}个,下界合金矿${9 * zuanshichan * n}个,经验球${100 * n}个,获得了修为${xiuwei}血气${xueqi}`)
                        return;
                    }
                } else {
                    e.reply('你想起来你没有镐子,于是又回家了')
                    return;
                }
            }
        
        } 
        
        
    if (func == '消耗') {
        if (thing_name == '天机历练符') {
                const reward = calculateTianjiTrainingReward(player, quantity);
                await Add_najie_thing(usr_qq, thing_name, '道具', -quantity);
                await Add_修为(usr_qq, reward.cultivation);
                await Add_血气(usr_qq, reward.blood);
                e.reply([
                    '【天机历练·符引神藏】',
                    `消耗天机历练符×${reward.count}，获得修为${bigNumberTransform(reward.cultivation)}、血气${bigNumberTransform(reward.blood)}。`,
                    reward.doubled > 0
                        ? `天机赐福触发${reward.doubled}次，对应历练收获翻倍！`
                        : `本次未触发天机赐福（单张概率${Math.round(reward.doubleChance * 100)}%）。`,
                ].join('\n'));
                return;
            }
        if (thing_name == '万里定位符') {
                if (quantity !== 1) {
                    e.reply('万里定位符不可叠加使用，请一次消耗一张。');
                    return;
                }
                const result = activateTianjiaoScent(player);
                if (!result.ok) {
                    e.reply(`追息印仍在生效：已锁定${result.state.target || '待定天骄'}，剩余${result.state.remaining}次免线索讨伐。`);
                    return;
                }
                await Add_najie_thing(usr_qq, thing_name, '道具', -1);
                await Write_player(usr_qq, player);
                e.reply([
                    '【万里定位符·追息印成】',
                    '符火化作三缕无形道纹，悬于识海。',
                    '下一次在没有有效踪迹时讨伐天骄，将锁定其气息；该目标连续三次讨伐无需线索与坐标。',
                    '讨伐冷却、境界限制与天骄复活时间仍然生效。',
                ].join('\n'));
                return;
            }
        if (thing_name == "天外清风") {
                const windCount = await exist_najie_thing(usr_qq, thing_name, "材料");
                if (windCount < quantity) {
                    e.reply(`你没有那么多的天外清风，当前只有${windCount || 0}缕`);
                    return;
                }
                player.天外清风加速次数 = (Number(player.天外清风加速次数) || 0) + quantity;
                await Add_najie_thing(usr_qq, thing_name, "材料", -quantity);
                await Write_player(usr_qq, player);
                e.reply(`清风引路已生效，可使接下来${player.天外清风加速次数}次跨位面穿梭各缩短5分钟（最低1分钟）`);
                return;
            }
        if (thing_name == "熔炉") {
                player.熔炉 = 1;
                e.reply("熔炉放置成功");
                await Write_player(usr_qq, player);
                await Add_najie_thing(usr_qq, "熔炉", "道具", -1);
                return
            }
            if (thing_name == "书架") {
                player.书架 += 1;
                e.reply("书架放置成功");
                await Write_player(usr_qq, player);
                await Add_najie_thing(usr_qq, "书架", "材料", -1);
                return
            }
            if (thing_name == "附魔台") {
                player.附魔台 = 1;
                e.reply("附魔台放置成功");
                await Write_player(usr_qq, player);
                await Add_najie_thing(usr_qq, "附魔台", "道具", -1);
                return
            }
 if (thing_name == "源天书") {
                // 首先检查玩家是否是源师
                if (player.occupation != "源师"&&player.occupation != "源地师") {
                    e.reply("你无法学会源天书或这本书早已对你无用");
                    return;
                }

     // 初始化阅读次数（如果不存在）
    player.阅读次数 = player.阅读次数 || 0;
    // 计算衰减系数 (每次阅读效果衰减20%)
    const decayFactor = Math.max(0.3, 1 - (player.阅读次数 * 0.15));
                // 检查玩家是否是源师且等级小于36，如果是，则增加职业经验
                if ((player.occupation == "源师"||player.occupation == "源地师" )&& player.occupation_level < 36) {
                    const baseExp = 120000;
                    const actualExp = Math.round(baseExp * decayFactor);
        player.阅读次数++;
                    await Write_player(usr_qq, player);
                    await Add_职业经验(usr_qq, actualExp);
                    await Add_najie_thing(usr_qq, "源天书","道具", -1);
                    e.reply(`你学习了源天书的内容，职业经验增加${actualExp},累计阅读次数：${player.阅读次数}次`);
                    return;
                }

                if (player.occupation == "源师" && player.occupation_level == 36 ) {
                    player.occupation = "源地师";
                    player.occupation_level = 1;
                    player.occupation_exp = 0;
                    await Add_najie_thing(usr_qq, "源天书","道具", -1);
                    await Write_player(usr_qq, player);
                    e.reply("你掌握了源天书的部分核心内容，习得了强大的源术，成为了源地师");
                    return;
                }

                if (player.occupation == "源地师" && player.occupation_level == 36 ) {
                    player.occupation = "源天师";
                    player.occupation_level = 1;
                    player.occupation_exp = 0;
                    await Add_najie_thing(usr_qq, "源天书","道具", -1);
                    await Write_player(usr_qq, player);
                    e.reply("你彻底掌握了源天书的内容，习得了更强大的源术，百尺竿头更进一步");
                    return;
                }
            }
             if (thing_name == "先秦炼丹心得") {
                // 首先检查玩家是否是源师
                if (player.occupation != "炼丹师") {
                    e.reply("你并非炼丹师，无法从中获得领悟");
                    return;
                }
                let shicai = await exist_najie_thing(usr_qq, thing_name, "道具")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "道具", -quantity);
                    await Add_职业经验(usr_qq, 1000 * quantity)
                    e.reply(`使用成功,职业经验增加${1000 * quantity}点`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
             }
                if (thing_name == "先秦炼器心得") {
                if (player.occupation != "炼器师") {
                    e.reply("你并非炼器师，无法从中获得领悟");
                    return;
                }
                let shicai = await exist_najie_thing(usr_qq, thing_name, "道具")
                if (shicai >= quantity) {
                    await Add_najie_thing(usr_qq, thing_name, "道具", -quantity);
                    await Add_职业经验(usr_qq, 1000 * quantity)
                    e.reply(`使用成功,职业经验增加${1000 * quantity}点`)
                    return;
                } else {
                    e.reply("你没有那么多的" + thing_name)
                    return;
                }
             }
             if (thing_name == "位面传送阵") {
                    if (player.位面传送次数 == undefined) {
                    player.位面传送次数 = 0;
                }
                    player.位面传送次数 += quantity;
                    await Write_player(usr_qq, player);
                    await Add_najie_thing(usr_qq, "位面传送阵","道具", -quantity);
                    e.reply(`使用成功，位面传送次数增加${quantity}次`);
                    return;
                }
                if (thing_name == "大位面传送阵") {
                    if (player.位面传送次数 == undefined) {
                    player.位面传送次数 = 0;
                }
                    player.位面传送次数 += 3* quantity;
                    await Write_player(usr_qq, player);
                    await Add_najie_thing(usr_qq, "大位面传送阵","道具", -quantity);
                    e.reply(`使用成功，位面传送次数增加${3*quantity}次`);
                    return;
                }
             if (thing_name == "星图") {
                    if (player.星图 == undefined) {
                        player.星图 = 0;
                    }
                    player.星图 += quantity;
                    await Write_player(usr_qq, player);
                    await Add_najie_thing(usr_qq, "星图","道具", -quantity);
                    e.reply(`使用成功，星图增加${quantity}枚（可用于 #记坐标 拓印位面坐标）`);
                    return;
                }
             if (thing_name == "高级传送阵令牌") {
                    if (player.高级传送次数 == undefined) {
                        player.高级传送次数 = 0;
                    }
                    player.高级传送次数 += quantity;
                    await Write_player(usr_qq, player);
                    await Add_najie_thing(usr_qq, "高级传送阵令牌","道具", -quantity);
                    e.reply(`使用成功，高级传送次数增加${quantity}次（可用于高级传送阵瞬抵，更快且不易遇虚空乱流）`);
                    return;
                }
            // 命格道具：消耗【轮回命签】重抽命格词条
            // 重抽目标优先级：#消耗轮回命签*序号 内联指定 > #切换重抽命格 已选目标 > 默认第 1 条
            if (thing_name == "轮回命签") {
                const fates = [player?.命格, ...(Array.isArray(player?.附加命格) ? player.附加命格 : [])].filter(Boolean);
                if (!fates.length) {
                    e.reply('你尚未抽取命格词条，请先发送 #抽取命格词条。');
                    return;
                }
                // 解析参数：
                //   #消耗轮回命签            → 单抽（目标取 #切换重抽命格 已选或默认第1条）
                //   #消耗轮回命签*序号        → 单抽该条
                //   #消耗轮回命签*序号*次数   → 批量重抽该条（消耗次数枚，重抽次数次，再抉择）
                const segs = e.msg.split('*'); // ['#消耗轮回命签', '序号', '次数']
                let requested, batchCount = null;
                if (segs.length >= 3) {
                    requested = Number(segs[1]);
                    batchCount = Number(segs[2]);
                } else if (segs.length === 2) {
                    requested = Number(segs[1]); // 单抽指定条
                } else {
                    requested = Number(player.重抽命格序号) || 1;
                }
                if (requested < 1 || requested > fates.length) {
                    e.reply(`命格词条序号应为 1 至 ${fates.length}。`);
                    return;
                }
                if (!Array.isArray(player.附加命格)) player.附加命格 = [];
                // 批量重抽分支：消耗 count 枚命签，重抽 count 次并展示分布，由玩家后续 #选择轮回命签 / #保留轮回命签 抉择
                if (batchCount && batchCount >= 1) {
                    return await this.batchRerollFate(e, player, usr_qq, requested, batchCount, data);
                }
                const occupied = new Set(fates.filter((_, index) => index !== requested - 1).map(item => item.id));
                let pool = data.minggeList.filter(item => !occupied.has(item.id) && item.id !== fates[requested - 1]?.id);
                if (!pool.length) pool = data.minggeList;
                const mingge = drawMingge(pool);
                const stored = createPlayerMingge(mingge);
                stored.初始效果已应用 = true;
                const oldName = fates[requested - 1]?.name || '无名命格';
                // 先回滚旧命格的「获得时」一次性效果（速度/仙道潜力/生命本源/寿元/幸运/心神），再应用新命格，避免只增不减地累加
                const oldMingge = data.minggeList.find(m => m.id === fates[requested - 1]?.id);
                rollbackInitialMinggeEffects(player, oldMingge?.effects);
                if (requested === 1) player.命格 = stored;
                else player.附加命格[requested - 2] = stored;
                applyInitialMinggeEffectsRaw(player, mingge.effects);
                delete player.重抽命格序号; // 重抽后清空已选目标，避免误重抽同一格

                await Add_najie_thing(usr_qq, '轮回命签', '道具', -1);
                await Write_player(usr_qq, player);
                e.reply(`【轮回命签·重定命数】\n第${requested}命格：${oldName} → ${mingge.name}\n\n${formatMinggeDrawMessage(mingge, player.名号)}`);
                return;
            }
            // 命格道具：消耗【命宫拓碑】将命格词条上限拓展一格（最多三格）
            if (thing_name == "命宫拓碑") {
                const limit = Math.max(1, Math.trunc(Number(player.命格词条上限) || 1));
                if (limit >= 3) {
                    e.reply('你的命宫最多承载三条命格，无法继续拓展。');
                    return;
                }
                player.命格词条上限 = limit + 1;
                await Add_najie_thing(usr_qq, '命宫拓碑', '道具', -1);
                await Write_player(usr_qq, player);
                e.reply(`【命宫拓碑】命宫壁垒向外展开，命格词条上限提升至 ${player.命格词条上限}。\n发送 #抽取命格词条 可补足空缺词条。`);
                return;
            }
                if (thing_name == "符道修士的感悟") {
                if (player.occupation != "符师") {
                    e.reply("你并非符师，无法从中获得领悟");
                    return;
                }
                    await Write_player(usr_qq, player);
                    await Add_职业经验(usr_qq, 5000);
                    await Add_najie_thing(usr_qq, "符道修士的感悟","道具", -1);
                    e.reply(`使用成功，职业经验增加${actualExp}`);
                    return;
            }
                if (thing_name == "丹道修士的感悟") {
                if (player.occupation != "炼丹师") {
                    e.reply("你并非炼丹师，无法从中获得领悟");
                    return;
                }
                    await Write_player(usr_qq, player);
                    await Add_职业经验(usr_qq, 5000);
                    await Add_najie_thing(usr_qq, "丹道修士的感悟","道具", -1);
                    e.reply(`使用成功，职业经验增加${actualExp}`);
                    return;
            }
if (thing_name == "原始宝骨") {
    player.学习的功法.push("原始真解神引篇");
    await Write_player(usr_qq, player);
    
    let replyMsg = [
        "你凝视原始宝骨，上面刻有密密麻麻的古老符号，每一个符号都仿佛在阐述天地至理。",
        "宝骨散发出柔和的光芒，化作一道道符文涌入你的识海。",
        "",
        "「神引篇」在你心中缓缓展开：",
        "修行之路，乃夺天地造化，侵日月玄机，以凡躯窥天道，化腐朽为神奇。",
        "",
        "万物皆有灵，一草一木，一粒尘，一滴水，皆可通灵，皆可为道。",
        "修行至极境，无需宝术，无需符文，举手投足间，大道至简，化腐朽为神奇。",
        "",
        "你感受到自己对修行的理解达到了前所未有的高度，",
        "仿佛触摸到了大道的本源，明白了修行的真谛——",
        "「以最简单质朴之法，演绎无上大道，化平凡为不朽，变腐朽为神奇」。",
        "",
        "学会了『原始真解神引篇』",
        "此篇蕴含无上大道真义，为修行之路指明方向。"
    ].join("\n");
    
    e.reply(replyMsg);
    return;
}
if (thing_name == "诸天镜") {
    return withPlayerMutationLock(usr_qq, async () => {
        const mirrorCount = await exist_najie_thing(usr_qq, thing_name, "道具");
        if (!mirrorCount) {
            e.reply("你的纳戒中没有诸天镜");
            return false;
        }

        const latestPlayer = await Read_player(usr_qq);
        const result = bindBasicZhutianMirror(latestPlayer);
        latestPlayer.使用过诸天镜 = true;
        await Add_najie_thing(usr_qq, thing_name, "道具", -1);
        try {
            await Write_player(usr_qq, latestPlayer);
        } catch (error) {
            await Add_najie_thing(usr_qq, thing_name, "道具", 1);
            throw error;
        }

        e.reply(result.firstBind
            ? "诸天镜已与你的神魂绑定，一阶镜能已经充满。可使用 #友枝町 开始探索。"
            : "诸天镜化作养镜灵光，镜能已经补满，并获得镜尘×25。"
        );
        return false;
    });
}
               // 处理天心印记道具
if (thing_name == "堕魔骨") {
    // 检查玩家灵根是否为九转轮回体
    if (player.灵根 && player.灵根.name != "荒古圣体") {
        // 如果灵根是九转轮回体，应用天心印记的效果
        await Add_najie_thing(usr_qq, thing_name, "道具", -1); // 从玩家的道具中移除一个天心印记
        player.灵根 = {"id":100991,"name":"一重魔功","type":"魔头","eff":0.36,"法球倍率":0.23,"攻击":0,"防御":0,"生命":0,"生命本源":0};
        player.lunhui = 0; // 清除轮回状态
       await checkAndRemoveShengtiMishu(player, usr_qq);
    player.生命本源 = 100+player.灵根.生命本源;
       let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
        await Write_player(usr_qq, player); // 保存更新后的玩家数据
        e.reply(`你消耗了堕魔骨，彻底化身为魔头。`);
    } else {
        // 如果灵根不是九转轮回体，不能使用天心印记
        e.reply("你身上的气息太过强大，万邪不侵，沾染不了魔头的气息。");
    }
    return;

}    
       if (thing_name == '一大袋洗根水') {
             await Add_najie_thing(usr_qq, thing_name, '道具', -quantity);
             let 一大袋 = quantity * 200;
            await Add_najie_thing(usr_qq, '洗根水', '道具', 一大袋);
            e.reply(`你拆开了${quantity}大袋包装，获得了${一大袋}瓶洗根水`);
            return false;
          }        
// 处理轮回道果道具
if (thing_name == "轮回道果") {

    // 检查玩家灵根是否为九转轮回体
    if (player.灵根 && player.灵根.name === "九转轮回体") {
        // 如果灵根是九转轮回体，应用轮回道果的效果
        await Add_najie_thing(usr_qq, thing_name, "道具", -1); // 从玩家的道具中移除一个轮回道果
        
        player.灵根 = {"id":7010009,"name":"命运神道体","type":"命运","归类":"神魔","eff":1.75,"法球倍率":1.75,"攻击":2,"防御":3,"生命":2,"生命本源":50};
        player.lunhui = 0; // 清除轮回状态
        
          await checkAndRemoveShengtiMishu(player, usr_qq);
    player.生命本源 = 100+player.灵根.生命本源;
    // 更新玩家数据
    await Write_player(usr_qq, player);
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
    await player_efficiency(usr_qq); // 添加await
        
        // 增强版霸气文案
        let replyMsg = [
            `你吞服「轮回道果」，刹那间诸天震动！`,
            `轮回长河倒卷，时空尽头浮现一道伟岸身影`,
            `身影缓缓转身，眸中映照万古星辰：`,
            `"身经万劫不死，轮回万世不灭，战尽诸天不败..."`,
            `"汝已超脱宿命，当执掌武祖权柄！"`,
            `无尽神光灌入体内，命运枷锁寸寸断裂！`,
            `灵根蜕变为【命运神道体】！`
        ];
        
        e.reply(replyMsg.join("\n"));
    } else {
        // 如果灵根不是九转轮回体，不能使用轮回道果
        e.reply("轮回道果绽放璀璨光芒，却与你灵根相斥，终究无缘！");
    }
    return;
}

 // 处理武祖权柄道具
if (thing_name == "武祖权柄") {
    if (player.武祖叶萧认可) {
        const previousRoot = player.灵根?.name || '无名灵根';
        // 从玩家的道具中移除一个武祖权柄
        await Add_najie_thing(usr_qq, thing_name, "道具", -1);
        
        // 升级灵根为彼岸·命运神道体
        player.灵根 ={"id":7010009,"name":"彼岸·命运神道体","type":"天命武祖","eff":5,"法球倍率":5,"攻击":8,"防御":3,"生命":8,"生命本源":100};
        
                  await checkAndRemoveShengtiMishu(player, usr_qq);
    player.生命本源 = 100+player.灵根.生命本源;
    // 更新玩家数据
    await Write_player(usr_qq, player);
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
    await player_efficiency(usr_qq); // 添加await
        
        // 震撼的彼岸命运神道体觉醒文案
        let replyMsg = [
            `【武祖权柄·天命加身】`,
            `你执掌「武祖权柄」，刹那间诸天万界为之震颤！`,
            `天无明的声音在时空尽头回荡：`,
            `"武祖？好大的口气！无古无今，无始无终，乃为之运！"`,
            `"阁下虽然不凡，但还当不起这个封号吧？"`,
            `然而下一刻，异变陡生！`,
            `- 时间长河倒卷，万古纪元在你脚下臣服`,
            `- 命运长河显化，无数因果线在你指尖缠绕`,
            `- 彼岸花开，映照诸天万界，亿万生灵叩拜`,
            `自武祖崛起，武道之中：`,
            `- 浑沦之未判，神灵之未植，而为冥妙之本者，道也`,
            `- 道也，莫穷其根本，莫测其津涯…`,
            `- 故谓之武祖者，即天命也！`,
            `天命生乎武祖，起乎无因：`,
            `- 为武道之先，神通之祖也`,
            `- 天生之彼岸，万劫不磨之主宰也！`,
            `你眸中神光暴涨，声震万古：`,
            `"无始无终？今日我便为武道立下始终！"`,
            `"无古无今？此刻我便定义古今轮回！"`,
            `彼岸神光贯穿时空，命运长河为你改道：`,
            `- 灵根极致蜕变：【${previousRoot}】→【彼岸·命运神道体】`,
            `- 执掌武祖权柄，为武道立心，为神通立命`,
            `- 超脱命运长河，登临彼岸，成就万劫不磨之躯`,
            `天无明骇然失色，声音颤抖：`,
            `"竟真有人能执掌武祖权柄...彼岸...彼岸！"`,
            `你屹立彼岸之巅，俯瞰万古轮回：`,
            `"从今日起，我即为武祖！"`,
            `"武道之始，神通之祖，天命所归！"`,
        ];
        
        e.reply(replyMsg.join("\n"));
    } else {
        e.reply([
            `【权柄反噬·天命难承】`,
            `武祖权柄尚未承认你的武道真意。`,
            `需先持仙武界坐标发送【#寻找武祖】，得到武祖叶萧认可。`
        ].join("\n"));
    }
    return;
}
// 处理邪神道果道具
if (thing_name == "邪神道果") {
    // 检查玩家灵根是否为九重魔功
    if (player.灵根 && player.灵根.name === "九重魔功") {
        // 如果灵根是九重魔功，应用邪神道果的效果
        await Add_najie_thing(usr_qq, thing_name, "道具", -1); // 从玩家的道具中移除一个邪神道果
        
        player.灵根 = {"id":7010010,"name":"极道天魔","type":"天魔","归类":"神魔","eff":2,"法球倍率":2,"攻击":3,"防御":2,"生命":2,"生命本源":150};
        player.lunhui = 0; // 清除轮回状态
         
        
                  await checkAndRemoveShengtiMishu(player, usr_qq);
    const extremeMinggeEffects = getMinggeEffects(player, data.minggeList);
    player.生命本源 = getLifeSourceRepairMaximum(player, extremeMinggeEffects.生命本源额外);
    // 更新玩家数据
    await Write_player(usr_qq, player);
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
    await player_efficiency(usr_qq); // 添加await
        
        // 霸气文案
        let replyMsg = [
            `你吞服「邪神道果」，九幽魔气冲天而起！`,
            `三界六道枷锁尽碎，万古魔渊为你洞开！`,
            `踏碎轮回，执掌天魔权柄，诸天万界唯魔独尊！`,
            `灵根蜕变为【极道天魔】！`
        ];
        
        e.reply(replyMsg.join("\n"));
    } else {
        // 如果灵根不是九重魔功，不能使用邪神道果
        e.reply("非九重魔功者，强吞道果必遭魔噬！");
    }
    return;
}

if (thing_exist.type === "秘境结算") {
    const player_id = String(usr_qq);
    const reduceByCard = {
        "帝品秘境结算卡": 1800000,
        "圣品秘境结算卡": 600000,
        "仙品秘境结算卡": 300000,
        "灵品秘境结算卡": 180000,
        "玄品秘境结算卡": 60000,
        "凡品秘境结算卡": 30000,
    };
    const singleReduce = reduceByCard[thing_exist.name];
    if (!singleReduce) {
        e.reply(`无效的秘境结算卡：${thing_exist.name}`);
        return;
    }

    let result;
    try {
        result = await withSecretPlaceSettlementLock(player_id, async () => {
            const actionKey = 'xiuxian:player:' + player_id + ':action';
            const rawAction = await redis.get(actionKey);
            if (!rawAction) {
                e.reply("没有进行中的探索，无法使用结算卡");
                return false;
            }
            const action = JSON.parse(rawAction);
            if (action.Place_action !== '0' && action.Place_actionplus !== '0') {
                e.reply("当前不在探索中，无法使用结算卡");
                return false;
            }

            const nowTime = Date.now();
            const endTime = getSecretPlaceActionEndTime(action);
            if (!Number.isFinite(endTime) || nowTime >= endTime) {
                e.reply("探索已结束，无法使用结算卡");
                return false;
            }

            const remaining = endTime - nowTime;
            const usableQuantity = Math.min(quantity, Math.floor(remaining / singleReduce));
            if (usableQuantity <= 0) {
                e.reply("剩余探索时间不足一张结算卡，请等待自然结算");
                return false;
            }

            const acceleration = accelerateSecretPlaceAction(
                action,
                singleReduce * usableQuantity,
                nowTime,
            );
            await Add_najie_thing(usr_qq, thing_exist.name, "道具", -usableQuantity);
            try {
                await redis.set(actionKey, JSON.stringify(acceleration.action));
            } catch (error) {
                await Add_najie_thing(usr_qq, thing_exist.name, "道具", usableQuantity);
                throw error;
            }

            e.reply([
                `成功使用${usableQuantity}张【${thing_exist.name}】！`,
                `探索进程缩减${(acceleration.actualReduceMs / 60000).toFixed(1)}分钟`,
                `探索剩余时间: ${formatTime(acceleration.endTime - nowTime)}`
            ].join("\n"));
            return true;
        });
    } catch (error) {
        console.error(`玩家${player_id}使用秘境结算卡失败:`, error);
        e.reply("结算卡使用失败，请稍后重试");
        return;
    }
    if (result === SECRET_PLACE_SETTLEMENT_BUSY) {
        e.reply("秘境正在结算，请稍后重试");
    }
    return;
}


            //寄术原因，写了很多多余的东西，但是能跑
            if (thing_name == "打火石") {
                let huoshi = await exist_najie_thing(usr_qq, "打火石", "道具")
                let number = await exist_najie_thing(usr_qq, "未点燃的火把", "道具")
                if (isNotNull(huoshi) && huoshi > 1 * quantity - 1) {
                    if (isNotNull(number) && number > 5 * quantity - 1) {
                        await Add_najie_thing(usr_qq, "火把", "道具", 5 * quantity);
                        await Add_najie_thing(usr_qq, "未点燃的火把", "道具", -5 * quantity);
                        await Add_najie_thing(usr_qq, "打火石", "道具", -quantity);
                        e.reply(["你使用打火石点燃了火把，获得火把" + 5 * quantity + "个"])
                        return
                    } else {
                        e.reply("你的未点燃的火把不足" + 5 * quantity + "个，你感觉太亏了，便放弃了")
                        return
                    }
                } else {
                    e.reply("你没有足够的" + thing_name)
                    return
                }
            }
            if (thing_name == "寻宝工具盒") {
                let math = Math.random();
                if (math > 0.6 && math < 0.9) {
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了一个雪铃零藏的新春木盒")
                    return;
                } else if (math > 0.9 && math < 1) {
                    await Add_najie_thing(usr_qq, "木斧", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了一个木斧")
                    return;
                } else {
                    await Add_najie_thing(usr_qq, "猫猫藏的新春礼盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了一个猫猫藏的新春礼盒")
                    return
                }
            }
                        if (thing_name == "猫猫藏的新春礼盒") {
                let math = Math.random();
                if (math > 0.9 && math < 1) {
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了一个清灵盒")
                    return;
                } else if (math > 0 && math < 0.3) {
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面只有一个雪铃盒")
                    return;
                } else {
                    await Add_najie_thing(usr_qq, "闹钟藏的新春铁盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面有一个闹钟藏的新春铁盒")
                    return;
                }
            }
if (thing_name == "如梦道祖随手丢的垃圾匣") {
    // 先消耗一个垃圾匣
    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
    
    let math = Math.random();
    if (math < 0.01) {
        // 0.01%概率：超级大奖
        await Add_najie_thing(usr_qq, "煌天造化丹", "丹药", 10);
        e.reply([
            `你小心翼翼地打开垃圾匣，突然金光四射！`,
            `"这...这难道是传说中的..."`,
            `只见十颗煌天造化丹静静躺在匣中，散发着诱人的药香！`,
            `"如梦道祖，您管这叫垃圾？！"`,
            `你激动得差点把匣子扔出去！`
        ].join('\n'));
    } else if (math < 0.25) {
        // 24%概率：绝世功法
        await Add_najie_thing(usr_qq, "斗转星移", "功法", 1);
        e.reply([
            `你满怀期待地打开垃圾匣，突然一道星光冲天而起！`,
            `"哇哦！这难道是..."`,
            `一本《斗转星移》功法静静躺在匣底，封面还沾着一点...嗯...像是仙果酱？`,
            `"如梦道祖果然深不可测，绝世功法都当废纸扔！"`
        ].join('\n'));
    } else if (math < 0.50) {
        // 25%概率：海量源石
        await Add_源石(100000000);
        e.reply([
            `你轻轻掀开匣盖，突然被闪瞎了眼！`,
            `"我的天！这...这堆成山的源石！"`,
            `整整一亿源石塞满了垃圾匣，差点把你手指夹住！`,
            `"如梦道祖，您对'垃圾'的定义是不是有什么误解？"`
        ].join('\n'));
    } else if (math < 0.75) {
        // 25%概率：套娃盒子
        await Add_najie_thing(usr_qq, "超越宝盒", "盒子", 5);
        e.reply([
            `你颤抖着打开垃圾匣，发现里面...还是盒子！`,
            `五个闪闪发光的"超越宝盒"整齐排列着`,
            `"好家伙，如梦道祖的垃圾匣里套娃呢？"`,
            `你突然有种开盲盒开到无限套娃的既视感...`
        ].join('\n'));
    } else {
        // 25%概率：改变资质的丹药
        await Add_najie_thing(usr_qq, "天命轮回丹", "丹药", 30);
        e.reply([
            `你屏住呼吸打开匣子，一股浓郁丹香扑面而来！`,
            `"好家伙！三十颗天命轮回丹！"`,
            `丹药多得差点从匣子里溢出来，你手忙脚乱地接着`,
            `"如梦道祖，您管这叫垃圾？！"`,
            `里面散发出的一缕药香都令你感觉自己的资质将要发生奇妙的变化...`,
            `"难道这就是传说中的...逆天改命丹？！"`
        ].join('\n'));
    }
    return;
}
            if (thing_name == "猫猫藏的新春礼盒") {
                let math = Math.random();
                if (math > 0.9 && math < 1) {
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了一个清灵盒")
                    return;
                } else if (math > 0 && math < 0.3) {
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面只有一个雪铃盒")
                    return;
                } else {
                    await Add_najie_thing(usr_qq, "闹钟藏的新春铁盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面有一个闹钟藏的新春铁盒")
                    return;
                }
            }
            if (thing_name == "闹钟藏的新春铁盒") {
                let math = Math.random();
                if (math == 0.01) {
                    await Add_najie_thing(usr_qq, "赤角石溃杵", "装备", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面有一个赤角石溃杵")
                    return;
                }
                if (math > 0.01 && math <= 0.25) {
                    await Add_najie_thing(usr_qq, "百合花篮", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面有一个百合花篮")
                    return;
                } else if (math > 0.25 && math <= 0.50) {
                    await Add_灵石(-1000000)
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面是八个蛋,去医院花费了100w灵石")
                    return;
                } else if (math > 0.5 && math <= 0.75) {
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了里面有一个清灵藏的新春木盒")
                    return;
                } else {
                    await Add_najie_thing(usr_qq, "潘多拉魔盒", "盒子", 1);
                    await Add_najie_thing(usr_qq, thing_name, "道具", -1);
                    e.reply("你充满期待的打开了盒子，结果发现了是1个潘多拉魔盒")
                    return;
                }
            }
if (thing_name == "炼气士留下的药液") {
    // 确保数量为数字，默认为1
    let useCount = quantity || 1;
    if (isNaN(useCount) || useCount < 1) {
        useCount = 1;
    }
    
    // 检查是否有足够的药液
    let currentCount = await exist_najie_thing(usr_qq, "炼气士留下的药液", "道具");
    if (!currentCount || currentCount < useCount) {
        e.reply(`炼气士留下的药液不足，需要${useCount}个，当前只有${currentCount || 0}个`);
        return;
    }
    
    // 统计结果
    let totalXiuwei = 0;
    let totalXueqi = 0;
    let results = {
        jackpot: 0,    // 极小概率
        normal: 0,     // 大概率
        bad: 0         // 小概率
    };
    
    // 批量处理
    for (let i = 0; i < useCount; i++) {
        let math = Math.random();
        if (math > 0.95) {
            // 极小概率：各增加90~200w
            let randomIncrease = Math.floor(Math.random() * (200 - 90 + 1)) + 90;
            totalXiuwei += randomIncrease * 10000;
            totalXueqi += randomIncrease * 10000;
            results.jackpot++;
        } else if (math > 0.1) {
            // 大概率：各增加100w
            totalXiuwei += 1000000;
            totalXueqi += 1000000;
            results.normal++;
        } else {
            // 小概率：各减少50w
            totalXiuwei -= 500000;
            totalXueqi -= 500000;
            results.bad++;
        }
    }
    
    // 扣除药液
    await Add_najie_thing(usr_qq, "炼气士留下的药液", "道具", -useCount);
    
    // 应用效果
    await Add_修为(usr_qq, totalXiuwei);
    await Add_血气(usr_qq, totalXueqi);
    
    // 构建回复消息
    let messages = [];
    if (results.jackpot > 0) {
        messages.push(`其中有${results.jackpot}瓶药液效果超群，你感觉浑身经脉如沐春风，一股磅礴的灵力在体内奔涌！`);
    }
    if (results.normal > 0) {
        messages.push(`其中${results.normal}瓶药液效果正常，你服下后只觉得一股暖流从丹田升起，通体舒泰！`);
    }
    if (results.bad > 0) {
        messages.push(`可惜其中${results.bad}瓶药液似乎存放太久已经变质了...你刚喝下去就感觉肚子一阵绞痛！`);
    }
    
    // 最终总结
    let finalMessage = `你服用了${useCount}瓶炼气士留下的药液，`;
    if (totalXiuwei >= 0) {
        finalMessage += `修为血气总共增加了${Math.floor(totalXiuwei/10000)}万点！`;
    } else {
        finalMessage += `修为血气总共减少了${Math.floor(Math.abs(totalXiuwei)/10000)}万点...看来修仙界的药品也有保质期啊！`;
    }
    
    e.reply([messages.join('\n'), finalMessage]);
    return;
}
if (thing_name == "星峰传承令") {
    let math = player.星峰传承;
    if (math) {        
        e.reply("星峰传承已被你开启过一次，请留给下一位有缘人吧!");
        return;
    }
    if (!math) {
        // 扣除传承令
        await Add_najie_thing(usr_qq, "星峰传承令", "道具", -1);
       let randomIncrease = player.level_id*player.Physique_id+(player.mijinglevel_id+player.xiangulevel_id)
        // 添加奖励
        await Add_修为(usr_qq, randomIncrease * 10000);
        await Add_血气(usr_qq, randomIncrease * 10000);
        await Add_najie_thing(usr_qq, "星辰剑", "装备", 1);
        await Add_najie_thing(usr_qq, "星辰袍", "装备", 1);
        await Add_najie_thing(usr_qq, "星耀天地", "功法", 1);
        await Add_najie_thing(usr_qq, "上品源石", "道具", 50000);
        await Add_najie_thing(usr_qq, "神源石", "道具", 5000);
        await Add_najie_thing(usr_qq, "星峰宝丹", "丹药", 10);
        
        // 构建文案
        const msg = [
            `你手持星峰传承令，踏入太玄门星峰传承之地`,
            `令牌发出璀璨星光，引动周天星辰之力，传承宝库大门缓缓开启`,
            `「星峰传承，万古不灭」`,
            `宝库内星光璀璨，无数星辰之力凝聚的宝物悬浮其中：`,
            `星辰剑：一把蕴含星辰之力的宝剑，剑身流淌星辉`,
            `星辰袍：一件由星辰丝织成的法袍，可引动星辰护体`,
            `功法·星耀天地：星峰核心传承，可引动周天星辰之力`,
            `上品源石×50000：蕴含纯净源气的修炼资源`,
            `神源石×5000：蕴含神性物质的珍稀源石`,
            `星峰宝丹×10：星峰秘传丹药，可淬炼体魄提升修为`,
            `此外，你还获得了大量修为和血气灌注，修为大涨！`,
            `「星峰传承已启，大道可期」`
        ].join('\n');
        player.星峰传承 = 1;
        e.reply(msg);
        return;
    }
}
// 无拘仙印使用逻辑
if (thing_name == "无拘仙印") {
    if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
    if (hasCompletedZhiXian(player, 4)) {
        e.reply("你已走完天地无拘之路，无需再次启印。");
        return;
    }
    if (player.支线任务.includes(4)) {
        e.reply("无拘仙印已化作星路指引，任务正在进行中。");
        return;
    }

    player.支线任务.push(4);
    player.支线任务进度[4] = { 阶段: 1, 横渡位面: 0 };

    await Write_player(usr_qq, player);
    await Add_najie_thing(usr_qq, "无拘仙印", "道具", -1);
    e.reply([
        "【隐藏任务触发：天地无拘】",
        "仙印化作一缕清风，引出三条横贯诸天的星路。",
        "完成三次跨位面穿梭，体悟鲲鹏遨游万界的无拘真意。",
        "发送 #我的支线任务 查看任务详情"
    ].join('\n'));
    return;
}
// 华云飞的执念使用逻辑
if (thing_name == "华云飞的执念") {
    if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
    if (hasCompletedZhiXian(player, 1)) {
        e.reply("何为他人嫁衣已完成，无需再次触发。");
        return;
    }
    
    if (player.支线任务.includes(1)) {
        e.reply("你已与华云飞的执念产生过因果，无法再次触发。");
        return;
    }
    
    player.支线任务.push(1);
    player.支线任务进度[1] = { 阶段: 1 };
    
    await Write_player(usr_qq, player);
    await Add_najie_thing(usr_qq, "华云飞的执念", "道具", -1);
    
    e.reply([
        "【隐藏任务触发：何为他人嫁衣】\n\n" +
        "你捏碎了那枚执念结晶，刹那间，一股不甘的意志冲天而起！\n" +
        "恍惚间，你看到了一个白衣胜雪的青年，独立于星峰之巅，\n" +
        "他望着漫天星辰，眼中满是对命运的不甘与抗争。\n\n" +
        "『我华云飞，一生不弱于人，为何要沦为他人嫁衣？』\n\n" +
        "声音如泣如诉，在天地间回荡。那是狠人一脉的悲凉，\n" +
        "是吞天魔功传承者注定的宿命——为魔主做嫁衣！\n\n" +
        "【任务选择】\n" +
        "发送 #选择支线1选项1 接受吞天魔功传承\n" +
        "发送 #选择支线1选项2 斩断因果走出自己的道"
    ]);
    return;
}

// 王腾的执念使用逻辑
if (thing_name == "王腾的执念") {
    if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
    if (hasCompletedZhiXian(player, 2)) {
        e.reply("重走大帝路已完成，无需再次触发。");
        return;
    }
    
    if (player.支线任务.includes(2)) {
        e.reply("大帝之路已启，无需重复触发。");
        return;
    }
    
    player.支线任务.push(2);
    player.支线任务进度[2] = { 阶段: 1 };
    
    await Write_player(usr_qq, player);
    await Add_najie_thing(usr_qq, "王腾的执念", "道具", -1);
    
    e.reply([
        "【隐藏任务触发：重走大帝路】\n\n" +
        "执念破碎的刹那，一道霸绝天地的意志撕裂虚空而来！\n" +
        "你看到了一个紫衣青年，背负天帝圣剑，脚踏金色古战车，\n" +
        "从北原大地横冲而来，如天帝巡世，威压九重天！\n\n" +
        "『我儿王腾，有大帝之姿！』\n\n" +
        "那声音震耳欲聋，却带着无尽的悲凉。乱古大帝的传承者，\n" +
        "终究未能成帝，倒在了叶凡的拳下，成为了时代的背景。\n\n" +
        "王腾的执念在你识海中咆哮：『我不甘！重活一世，我必成帝！』\n\n" +
        "【任务开启】\n" +
        "发送 #选择支线2选项1 继承王腾意志，重走大帝路\n\n" +
        "【任务目标】\n" +
        "① 武道天眼觉醒：在生死战中磨砺，开启武道天眼\n" +
        "② 天帝剑认可：寻找天帝圣剑碎片，重铸帝兵\n" +
        "③ 大帝之心：在绝境中不屈，于败亡中崛起"
    ]);
    return;
}

// 跨界追杀令使用逻辑
if (thing_name == "跨界追杀令") {
    if (migrateCompletedZhiXianTasks(player)) await Write_player(usr_qq, player);
    if (hasCompletedZhiXian(player, 3)) {
        e.reply("异域追杀支线已完成，无需再次开启追杀令。");
        return;
    }
    
    if (player.支线任务.includes(3)) {
        e.reply("追杀令已激活，异域之门即将开启...");
        return;
    }
    
    if (player.mijinglevel_id < 18&&player.xiangulevel_id < 16) {
        e.reply([
            "你凝视着这枚染血的古令，感受到其中蕴含的恐怖因果。\n" +
            "那是一界之杀意，是不朽之王后裔的威压。\n\n" +
            "『跨界而战，九死一生。你...还不够资格。』\n\n" +
            "（需要达到仙王境方可开启此任务）"
        ]);
        return;
    }
    
    player.支线任务.push(3);
    player.支线任务进度[3] = { 阶段: 1 };
    
    await Write_player(usr_qq, player);
    await Add_najie_thing(usr_qq, "跨界追杀令", "道具", -1);
    
    e.reply([
        "【特殊任务开启：异域追杀】\n\n" +
        "古令捏碎的瞬间，天地变色，虚空裂开一道漆黑的缝隙！\n" +
        "那缝隙中传来异域的气息，充满了腐朽与不朽的交织，\n" +
        "仿佛打开了通往另一个大界的门户。\n\n" +
        "『鹤无双...』\n\n" +
        "你喃喃自语，这个名字在仙古纪元便已响彻九天十地。\n" +
        "异域不朽之王的后裔，曾斩灭无数天骄，\n" +
        "其'鹤鸣九霄'之术，据说可震碎仙人的元神。\n\n" +
        "一道冷漠的声音从裂缝中传来：\n" +
        "『九天十地的蝼蚁，也敢追杀本座？跨界而来，赐你一死！』\n\n" +
        "【任务目标】\n" +
        "① 跨界而战：进入异域战场（危险度：极高）\n" +
        "② 追寻真身：鹤无双有九道化身，需找出真身\n" +
        "③ 终极对决：击败鹤无双真身，夺取完整传承\n\n" +
        "【任务奖励】\n" +
        "· 鹤鸣九霄秘术（元神攻击神通）\n" +
        "· 不朽之血（炼体圣药）\n" +
        "· 异域法则碎片（参悟异域大道）\n\n" +
        "【警告】此任务九死一生，死亡将万劫不复，请谨慎选择！\n\n" +
        "发送 #我的支线任务 查看任务详情"
    ]);
    return;
}

// 天地气运使用逻辑（已完善）
if (thing_name == "天地气运") {
    if (player.天地气运) {
        e.reply("你已受天地气运加持，不可重复获得。");
        return;
    }
    
    player.天地气运 = 1;
    
    await Write_player(usr_qq, player);
    await Add_najie_thing(usr_qq, "天地气运", "道具", -1);
    
    e.reply([
        "【天地气运加持】\n\n" +
        "你捏碎了那团氤氲紫气，刹那间，天地共鸣，万道齐鸣！\n" +
        "一股浩瀚无边的气运之力从天而降，将你笼罩其中。\n\n" +
        "恍惚间，你看到了一个模糊的身影，\n" +
        "他十世无敌，十世称冠，积累了十世的造化与荣耀。\n" +
        "那是十冠王的气运，是天地意志对无敌者的馈赠！\n\n" +
        "『十世冠军，气运如虹！』\n\n" +
        "你感觉自己的命格在升华，仿佛成为了天地的主角。\n" +
        "秘境中的机缘将主动向你靠拢，修炼的瓶颈将迎刃而解，\n" +
        "同代争锋，你如有天助！\n" +
        "【天道提示】气运加身，亦遭天妒。大劫将至，小心应对！"
    ]);
    return;
}


// 处理至尊血池浸泡资格道具
if (thing_name === "至尊血池浸泡资格") {
    // 定义天资等级序列和对应描述
const aptitudeSequence = [
    '天弃之人',
    '先天不足',
    '平庸之资',
    '超凡资质',
    '天纵之资',
    '旷世奇才',
    '绝世天骄',
    '万古无双',
    '无演无尽'
];

const aptitudeDescriptions = {
    '无演无尽': '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚',
    '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，永恒无敌',
    '绝世天骄': '惊才绝艳，具备帝姿，注定为一个时代的天地主角',
    '旷世奇才': '万年难遇，此等资质放眼九天十地也是难寻',
    '天纵之资': '天赋异禀，媲美上古大教的天才',
    '超凡资质': '资质超凡，注定异于常人',
    '平庸之资': '资质平平，勉勉强强',
    '先天不足': '先天有缺，修炼事倍功半',
    '天弃之人': '被天道抛弃，修炼必遭反噬'
};
    await Add_najie_thing(usr_qq, "至尊血池浸泡资格", "道具", -1);
    
    // 获取玩家当前天资等级索引
    const currentAptitudeIndex = aptitudeSequence.indexOf(player.天资等级 === '岁云' ? '无演无尽' : player.天资等级);
    
    // 检查是否已经提升过天资
    const hasAptitudeBoost = player.至尊血池提升标记 || false;
    
    // 固定提升修为和血气
    const fixedBoost = 50000000; // 5000万
    await Add_修为(usr_qq, fixedBoost);
    await Add_血气(usr_qq, fixedBoost);
    
    let replyMessage = [];
    let newAptitude = player.天资等级;
    let newDescription = player.天资评价;
        // === 特殊天资处理 ===
    if (player.天资等级 === '无化如是') {
        await e.reply([
            '〖至尊血池·天道排斥〗',
            '你踏入血池，但真血自动避开你的身体！',
            '血池守护者：「无化如是，天道所弃！」',
            '至尊真血乃天道本源所化，',
            '天道弃子无法承受其力量，',
            '资格道具被消耗，但你毫无收获。',
            '（天命如此，无物可改）'
        ].join('\n'));
        return;
    }
    
    if (player.天资等级 === '生而愚痴') {
        // 生而愚痴在血池中有特殊效果
        await e.reply([
            '〖至尊血池·强行开智〗',
            '你跳入血池，真血狂暴涌入体内！',
            '七窍流血，骨骼寸断，但灵台逐渐清明...',
            '血池守护者：「愚痴之体，承受至尊之痛！」',
            '剧痛持续了三天三夜，你多次濒死，',
            '但至尊真血强行打通了你的识海！',
        ].join('\n'));
        
        // 生而愚痴在血池中有50%概率提升
        if (Math.random() < 0.5) {
            const newAptitude = '天弃之人';
            const aptitudeEvaluations = {
                '天弃之人': '被天道抛弃，修炼必遭反噬，但仍有希望',
                '生而愚痴': '天生愚笨，修炼难如登天'
            };
            
            player.天资等级 = newAptitude;
            player.天资评价 = aptitudeEvaluations[newAptitude];
            player.至尊血池提升标记 = true;
            
            await e.reply([
                '〖开智成功〗',
                '愚痴枷锁被强行打破，你获得了新生！',
                '天资蜕变：',
                `『生而愚痴』 → 『天弃之人』`,
                aptitudeEvaluations[newAptitude],
                '修为暴涨 +5000万！',
                '血气狂涌 +5000万！',
                '提示：此乃血池的极限效果，珍惜新生！'
            ].join('\n'));
            
            await Add_修为(usr_qq, 50000000);
            await Add_血气(usr_qq, 50000000);
        } else {
            await e.reply([
                '〖开智失败〗',
                '至尊真血太过狂暴，你没能承受住！',
                '虽未开智，但肉身得到极大强化。',
                '修为增加 +5000万！',
                '血气增加 +5000万！',
            ].join('\n'));
            
            await Add_修为(usr_qq, 50000000);
            await Add_血气(usr_qq, 50000000);
        }
        
        await Write_player(usr_qq, player);
        return;
    }
    
    // 天资提升逻辑
    if (!hasAptitudeBoost && currentAptitudeIndex < aptitudeSequence.indexOf("天纵之资")) {
        // 提升一级天资
        const newAptitudeIndex = Math.min(currentAptitudeIndex + 1, aptitudeSequence.length - 1);
        newAptitude = aptitudeSequence[newAptitudeIndex];
        newDescription = aptitudeDescriptions[newAptitude];
        
        player.天资等级 = newAptitude;
        player.天资评价 = newDescription;
        player.至尊血池提升标记 = true; // 标记已提升过天资
        
        replyMessage.push(
            `你踏入至尊血池，炽热的真血包裹全身！`,
            `血脉沸腾，骨骼重塑，道基重铸！`,
            `天资蜕变：${player.天资等级} → ${newAptitude}`,
            `评价变化：${player.天资评价} → ${newDescription}`,
            `修为暴涨 +5000万！`,
            `血气狂涌 +5000万！`,
            `至尊洗礼，脱胎换骨！`
        );
    } else {
        if (hasAptitudeBoost) {
            replyMessage.push(
                `你再次踏入至尊血池`,
                `血池真血滋养肉身，但天资已无法再提升`,
                `当前天资：${player.天资等级}（${player.天资评价}）`,
                `修为增加 +5000万！`,
                `血气增加 +5000万！`,
                `（天资提升效果仅限一次）`
            );
        } else {
            replyMessage.push(
                `你踏入至尊血池`,
                `血池真血滋养肉身，但天资已达极限`,
                `当前天资：${player.天资等级}（${player.天资评价}）`,
                `修为增加 +5000万！`,
                `血气增加 +5000万！`
            );
        }
    }
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 发送回复
    return e.reply(replyMessage.join('\n'));
}
if (thing_name === "神秘花粉") {
    // 定义天资等级序列和对应描述
    const aptitudeSequence = [
        '天弃之人',
        '先天不足',
        '平庸之资',
        '超凡资质',
        '天纵之资',
        '旷世奇才',
        '绝世天骄',
        '万古无双',
        '无演无尽'
    ];

    const aptitudeDescriptions = {
        '无演无尽': '亘古绝今从未有，演尽诸天万界，此等天资已超脱天道束缚',
        '万古无双': '横推古今未来无对手，为修道而生，为应劫而至，永恒无敌',
        '绝世天骄': '惊才绝艳，具备帝姿，注定为一个时代的天地主角',
        '旷世奇才': '万年难遇，此等资质放眼九天十地也是难寻',
        '天纵之资': '天赋异禀，媲美上古大教的天才',
        '超凡资质': '资质超凡，注定异于常人',
        '平庸之资': '资质平平，勉勉强强',
        '先天不足': '先天有缺，修炼事倍功半',
        '天弃之人': '被天道抛弃，修炼必遭反噬'
    };
    await Add_najie_thing(usr_qq, "神秘花粉", "道具", -1);
    
    // 获取玩家当前天资等级索引
    const currentAptitudeIndex = aptitudeSequence.indexOf(player.天资等级 === '岁云' ? '无演无尽' : player.天资等级);
    
    // 检查是否已经提升过天资
    const hasAptitudeBoost = player.神秘花粉提升标记 || false;
    
    // 固定提升修为和血气
    const fixedBoost = 50000000; // 5000万
    await Add_修为(usr_qq, fixedBoost);
    await Add_血气(usr_qq, fixedBoost);
    
    let replyMessage = [];
    let newAptitude = player.天资等级;
    let newDescription = player.天资评价;
      // === 特殊天资处理 ===
    if (player.天资等级 === '无化如是') {
        await e.reply([
            '〖神秘花粉·天道排斥〗',
            '你吸入花粉，但花粉在接触到你的瞬间枯萎！',
            '神秘低语：「天道弃子，花粉无用...」',
            '花粉乃天地灵性所化，',
            '但天道弃子无法吸收任何灵性，',
            '神秘花粉化为灰烬，毫无效果。',
            '（无化如是，天地不容）'
        ].join('\n'));
        return;
    }
    
    if (player.天资等级 === '生而愚痴') {
        // 生而愚痴在花粉中有特殊效果
        const successRate = 0.3; // 30%成功率
        
        await e.reply([
            '〖神秘花粉·灵性开智〗',
            '花粉化作无数光点，试图开启你的灵智...',
            '你感到头痛欲裂，眼前浮现无数幻象！',
            '神秘低语：「愚痴之魂，接受灵性洗礼...」',
            '花粉与愚痴枷锁激烈对抗，',
            '成败在此一举！',
        ].join('\n'));
        
        if (Math.random() < successRate) {
            const newAptitude = '天弃之人';
            const aptitudeEvaluations = {
                '天弃之人': '被天道抛弃，修炼必遭反噬，但仍有希望',
                '生而愚痴': '天生愚笨，修炼难如登天'
            };
            
            player.天资等级 = newAptitude;
            player.天资评价 = aptitudeEvaluations[newAptitude];
            player.神秘花粉提升标记 = true;
            
            await e.reply([
                '〖灵智初开〗',
                '花粉之光冲破愚痴枷锁，灵智初现！',
                '你第一次感受到思考的快乐！',
                '天资蜕变：',
                `『生而愚痴』 → 『天弃之人』`,
                aptitudeEvaluations[newAptitude],
                '修为暴涨 +5000万！',
                '血气狂涌 +5000万！',
                '提示：花粉开启灵性，珍惜思考的能力！'
            ].join('\n'));
            
            await Add_修为(usr_qq, 50000000);
            await Add_血气(usr_qq, 50000000);
        } else {
            await e.reply([
                '〖灵智未开〗',
                '花粉耗尽，但愚痴枷锁太过坚固！',
                '灵性未能冲破先天禁锢。',
                '修为增加 +5000万！',
                '血气增加 +5000万！',
            ].join('\n'));
            
            await Add_修为(usr_qq, 50000000);
            await Add_血气(usr_qq, 50000000);
        }
        
        await Write_player(usr_qq, player);
        return;
    }
    // 天资提升逻辑
    if (!hasAptitudeBoost && currentAptitudeIndex < aptitudeSequence.indexOf("万古无双")) {
        // 提升一级天资
        const newAptitudeIndex = Math.min(currentAptitudeIndex + 1, aptitudeSequence.length - 1);
        newAptitude = aptitudeSequence[newAptitudeIndex];
        newDescription = aptitudeDescriptions[newAptitude];
        
        player.天资等级 = newAptitude;
        player.天资评价 = newDescription;
        player.神秘花粉提升标记 = true; // 标记已提升过天资
        
        replyMessage.push(
            `你吸入神秘花粉，漫天灵粒子如萤火飞舞！`,
            `花粉融入血脉，呼吸法自动运转，进化路开启！`,
            `灵性粒子滋养神魂，道基重塑，生命层次跃迁！`,
            `天资蜕变：${player.天资等级} → ${newAptitude}`,
            `评价变化：${player.天资评价} → ${newDescription}`,
            `修为暴涨 +5000万！`,
            `血气狂涌 +5000万！`,
            `花粉进化路显现，脱胎换骨！`
        );
    } else {
        if (hasAptitudeBoost) {
            replyMessage.push(
                `你再次吸入神秘花粉`,
                `灵粒子滋养肉身，但进化路已至当前极限`,
                `当前天资：${player.天资等级}（${player.天资评价}）`,
                `修为增加 +5000万！`,
                `血气增加 +5000万！`,
                `（花粉对天资的提升效果仅限一次）`
            );
        } else {
            replyMessage.push(
                `你吸入神秘花粉`,
                `灵粒子环绕周身，呼吸法共鸣`,
                `但天资已达当前进化路极限，无法突破`,
                `当前天资：${player.天资等级}（${player.天资评价}）`,
                `修为增加 +5000万！`,
                `血气增加 +5000万！`
            );
        }
    }
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 发送回复
    return e.reply(replyMessage.join('\n'));
}
if (thing_name === "爱莉希雅的赐福") {
    const blessingSequence = [
        '无瑕的祝福',
        '真我之启示', 
        '始源之律迹',
        '爱愿之妖精',
        '无瑕之誓'
    ];

    const blessingDescriptions = {
        '无瑕之誓': '「请让我，成为你的力量吧♪」——与爱莉希雅的羁绊化为永恒誓言，获得其部分真我权能',
        '爱愿之妖精': '「只要怀抱爱意，每个人都是自己的爱神使者♪」——爱愿之花绽放，生命层次跃迁',
        '始源之律迹': '「这就是我的『始源』权能哦，厉害吧？」——人之律者的力量痕迹悄然显现',
        '真我之启示': '「要好好记住我现在的样子哦？」——真我之光启迪灵魂本源',
        '无瑕的祝福': '「嗨，感觉如何？」——获得爱莉希雅初步的认可与加持'
    };
    
    await Add_najie_thing(usr_qq, "爱莉希雅的赐福", "道具", -1);
    
    // 获取玩家当前赐福等级索引
    const currentBlessingIndex = blessingSequence.indexOf(player.爱莉希雅赐福等级 || '无');
    const hasBlessingBoost = player.爱莉希雅赐福标记 || false;
    
    // 固定提升修为和血气
    const fixedBoost = 75000000; 
    player.修为+=fixedBoost;
    player.血气+=fixedBoost;
    
    let replyMessage = [];
    let newBlessing = player.爱莉希雅赐福等级 || '无';
    let newDescription = player.爱莉希雅赐福评价 || '尚未获得祝福';
    
    // 赐福提升逻辑
    if (!hasBlessingBoost && currentBlessingIndex < blessingSequence.length - 1) {
        // 提升一级赐福
        const newBlessingIndex = Math.min(currentBlessingIndex + 1, blessingSequence.length - 1);
        newBlessing = blessingSequence[newBlessingIndex];
        newDescription = blessingDescriptions[newBlessing];
        
        player.爱莉希雅赐福等级 = newBlessing;
        player.爱莉希雅赐福评价 = newDescription;
        player.爱莉希雅赐福标记 = true;

        // 根据赐福等级附加特殊效果
        if (newBlessing === '无瑕的祝福') {
            player.攻击加成 += (player.攻击加成 || 0) + 1000000;
        } else if (newBlessing === '真我之启示') {
            player.防御加成 += (player.防御加成 || 0) + 800000;
            await Add_najie_thing(usr_qq, "真我宝盒", "盒子", 1);
        } else if (newBlessing === '始源之律迹') {
            player.生命加成 += (player.生命加成 || 0) + 1500000;
            player.血量上限 += (player.血量上限 || 0) + 1500000; // 生命上限提升10%
            await Add_najie_thing(usr_qq, "真我宝盒", "盒子", 3);
        } else if (newBlessing === '爱愿之妖精') {
            player.攻击加成 += (player.攻击加成 || 0) + 2000000;
            player.防御加成 += (player.防御加成 || 0) + 1500000;
            player.生命加成 += (player.生命加成 || 0) + 2500000;
            await Add_najie_thing(usr_qq, "真我宝盒", "盒子", 3);
        } else if (newBlessing === '无瑕之誓') {
            player.攻击加成 += (player.攻击加成 || 0) + 3000000;
            player.防御加成 += (player.防御加成 || 0) + 2000000;
            player.生命加成 += (player.生命加成 || 0) + 4000000;
            await Add_najie_thing(usr_qq, "真我宝盒", "盒子", 5);
        }
        
 // 赐福提升情况
    replyMessage = [
        `「呀~是你在呼唤我吗？♪」——熟悉的声音随粉色光华流淌，爱莉希雅的身影如水晶花般浮现`,
        `绚烂的始源水晶簇绽放，温暖光芒如旋律般融入你的生命本源：「要记住我现在的样子哦？」`,
        `爱莉希雅赐福等级提升：${player.爱莉希雅赐福等级 || '无'} → **${newBlessing}**`,
        `赐福启示：「${newDescription}」`,
        `修为澎湃增长 +7500万！`,
        `血气充盈提升 +7500万！`,
        `❤️ **${newBlessing}** 权能激活！${newBlessing === '无瑕之誓' ? '真我宝盒+5' : newBlessing.includes('始源') ? '真我宝盒+3' : newBlessing === '真我之启示' ? '真我宝盒+1' : '属性加成强化'}`,
        `「要带着我的祝福，继续为美好而战哦~♪」`
    ];
} else if (hasBlessingBoost) {
    replyMessage = [
        `你轻轻触动赐福，粉色光晕如涟漪荡漾~`,
        `「这么想见我呀？真开心呢♪」——爱莉希雅的声音仿佛耳语`,
        `当前赐福等级：**${player.爱莉希雅赐福等级}**（${player.爱莉希雅赐福评价}）`,
        `修为增加 +7500万！`,
        `血气增加 +7500万！`,
        `（虽无法再次升华，但乐园的星光会永远照亮你的旅途✦）`
    ];
} else {
    replyMessage = [
        `赐福光芒轻柔环绕，如永恒乐园的叹息~`,
        `「哎呀，看来这就是目前的极限啦~」——爱莉希雅指尖轻点水晶花，「但我们的故事才刚刚开始哦？」`,
        `当前赐福等级：**${player.爱莉希雅赐福等级}**（${player.爱莉希雅赐福评价}）`,
        `修为增加 +7500万！`,
        `血气增加 +7500万！`,
        `「记住呀，真我的种子已在心中发芽，终将开出无尽花海♪」`
    ];

    }
    
    // 保存玩家数据
    await Write_player(usr_qq, player);
    
    // 发送回复
    return e.reply(replyMessage.join('\n'));
}
            if (thing_name == "雪铃零藏的新春木盒") {
                let math = Math.random();
                if (math > 0.9 && math < 1) {
                    await Add_najie_thing(usr_qq, "玄土", "材料", 1000000);
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", -1);
                    e.reply(["你打开了雪铃零藏的新春木盒,里面有一袋玄土"])
                    return
                } else if (math > 0.8 && math < 0.9) {
                    await Add_najie_thing(usr_qq, "秘境之匙", "道具", 2);
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", -1);
                    e.reply(["你打开了雪铃零藏的新春木盒，里面有一些钥匙"])
                    return
                } else if (math > 0.7 && math < 0.8) {
                    await Add_灵石(usr_qq, -1000000);
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", -1);
                    e.reply(["你打开了雪铃零藏的新春木盒，未曾想里面是八个蛋，去医院消耗了100w灵石"])
                    return
                } else {
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", 5);
                    await Add_najie_thing(usr_qq, "雪铃零藏的新春木盒", "道具", -1);
                    e.reply(["你打开了雪铃零藏的新春木盒，里面有5个清灵藏的新春木盒"])
                    return
                }
            }
            if (thing_name == "清灵藏的新春木盒") {
                let math = Math.random();
                if (math > 0.85 && math <= 1) {
                    await Add_najie_thing(usr_qq, "万妖王", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个万妖王`)
                    return
                } else if (math > 0.70 && math <= 0.85) {
                    await Add_najie_thing(usr_qq, "地瓜岩龙", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个地瓜岩龙`)
                    return
                } else if (math > 0.55 && math <= 0.70) {
                    await Add_najie_thing(usr_qq, "蓝银皇", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个蓝银皇`)
                    return
                } else if (math > 0.40 && math <= 0.55) {
                    await Add_najie_thing(usr_qq, "八角玄冰草", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个八角玄冰草`)
                    return
                } else if (math > 0.25 && math <= 0.40) {
                    await Add_najie_thing(usr_qq, "绮罗郁金香", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个绮罗郁金香`)
                    return
                } else if (math > 0.10 && math <= 0.25) {
                    await Add_najie_thing(usr_qq, "烈火杏娇疏", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个烈火杏娇疏`)
                    return
                } else if (math > 0 && math <= 0.1) {
                    await Add_najie_thing(usr_qq, "雷鸣阎狱藤", "草药", quantity);
                    await Add_najie_thing(usr_qq, "清灵藏的新春木盒", "道具", -quantity);
                    e.reply(`你打开了清灵藏的新春木盒，里面有${quantity}个雷鸣阎狱藤`)
                    return
                }
            }
            if (thing_name == "钓鱼掉上来的奇怪盒子") {
                if (quanbu) {
                    await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -x);
                    let wu = 0
                    let jyp = 0
                    let xqp = 0
                    let xlhhq = 0
                    let qshs = 0
                    let czs = 0
                    let msg = "你一次性打开了全部【钓鱼掉上来的奇怪盒子】，共" + x + "个，获得了："
                    for (var i = 0; i < x; i++) {
                        let daomu = Math.random();
                        if (daomu <= 0.01) {
                            wu++
                        }
                        if (daomu > 0.1 && daomu <= 0.15) {
                            jyp += 20
                        }
                        if ((daomu > 0.01 && daomu <= 0.1) || (daomu > 0.15 && daomu <= 0.25)) {
                            jyp += 30
                        }
                        if (daomu > 0.25 && daomu <= 0.3) {
                            xqp += 10
                        }
                        if (daomu > 0.3 && daomu <= 0.4) {
                            xqp += 5
                        }
                        if (daomu > 0.4 && daomu <= 0.5) {
                            xqp += 4
                        }
                        if (daomu > 0.5 && daomu <= 0.7) {
                            jyp += 4
                        }
                        if (daomu > 0.7 && daomu <= 0.8) {
                            xlhhq++
                        }
                        if (daomu > 0.8 && daomu <= 0.9) {
                            qshs++
                        }
                        if (daomu > 0.9 && daomu <= 1) {
                            czs++
                        }
                    }
                    if (jyp != 0) {
                        msg += "\n【经验瓶】*" + jyp
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", jyp);
                    }
                    if (xqp != 0) {
                        msg += "\n【血气瓶】*" + xqp
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", xqp);
                    }
                    if (xlhhq != 0) {
                        msg += "\n【沉沦之海】*" + xlhhq
                        await Add_najie_thing(usr_qq, "沉沦之海", "道具", xlhhq);
                    }
                    if (qshs != 0) {
                        msg += "\n【起死回生丹】*" + qshs
                        await Add_najie_thing(usr_qq, "起死回生丹", "丹药", qshs);
                    }
                    if (czs != 0) {
                        msg += "\n【重铸石】*" + czs
                        await Add_najie_thing(usr_qq, "重铸石", "道具", czs);
                    }
                    if (wu != 0) {
                        msg += "\n其中，有" + wu + "个打开后是空的"
                    }
                    e.reply(msg)
                    return;
                } else {
                    let daomu = Math.random();
                    if (daomu <= 0.01) {
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子,里面什么都没有"])
                        return
                    }
                    if (daomu > 0.1 && daomu <= 0.15) {
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", 20);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有20个经验瓶"])
                        return
                    }
                    if ((daomu > 0.01 && daomu <= 0.1) || (daomu > 0.15 && daomu <= 0.25)) {
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", 30);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有30个经验瓶"])
                        return
                    }
                    if (daomu > 0.25 && daomu <= 0.3) {
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", 10);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有10个血气瓶"])
                        return
                    }
                    if (daomu > 0.3 && daomu <= 0.4) {
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", 5);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有5个血气瓶"])
                        return
                    }
                    if (daomu > 0.4 && daomu <= 0.5) {
                        await Add_najie_thing(usr_qq, "血气瓶", "丹药", 4);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有4个血气瓶"])
                        return
                    }
                    if (daomu > 0.5 && daomu <= 0.7) {
                        await Add_najie_thing(usr_qq, "经验瓶", "丹药", 4);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有4个经验瓶"])
                        return
                    }
                    if (daomu > 0.7 && daomu <= 0.8) {
                        await Add_najie_thing(usr_qq, "沉沦之海", "道具", 1);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有一个沉沦之海地图"])
                        return
                    }
                    if (daomu > 0.8 && daomu <= 0.9) {
                        await Add_najie_thing(usr_qq, "起死回生丹", "丹药", 1);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有一个起死回生丹"])
                        return
                    }
                    if (daomu > 0.9 && daomu <= 1) {
                        await Add_najie_thing(usr_qq, "重铸石", "道具", 1);
                        await Add_najie_thing(usr_qq, "钓鱼掉上来的奇怪盒子", "道具", -1);
                        e.reply(["你打开了钓鱼掉上来的奇怪盒子，里面有一个重铸石"])
                        return
                    }
                }
            }

            if (thing_name == "煤炭") {
                let ranliao = await exist_najie_thing(usr_qq, "煤炭", "材料");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "煤炭", "材料", -quantity);
                    await Add_热量(usr_qq, 9 * quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
            if (thing_name == "木炭") {
                let ranliao = await exist_najie_thing(usr_qq, "木炭", "材料");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "木炭", "材料", -quantity);
                    await Add_热量(usr_qq, 9 * quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
            if (thing_name == "原木") {
                let ranliao = await exist_najie_thing(usr_qq, "木板", "材料");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "木板", "材料", -quantity);
                    await Add_热量(usr_qq, 2 * quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
            if (thing_name == "木棍") {
                let ranliao = await exist_najie_thing(usr_qq, "木棍", "材料");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "木棍", "材料", -quantity);
                    await Add_热量(usr_qq, quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
            if (thing_name == "羊毛") {
                let ranliao = await exist_najie_thing(usr_qq, "羊毛", "食材");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "羊毛", "食材", -quantity);
                    await Add_热量(usr_qq, quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
            if (thing_name == "皮革") {
                let ranliao = await exist_najie_thing(usr_qq, "皮革", "食材");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "皮革", "食材", -quantity);
                    await Add_热量(usr_qq, quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
             if (thing_name == "羽毛") {
                let ranliao = await exist_najie_thing(usr_qq, "羽毛", "食材");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "羽毛", "食材", -quantity);
                    await Add_热量(usr_qq, quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
            if (thing_name == "岩浆") {
                let ranliao = await exist_najie_thing(usr_qq, "岩浆", "材料");
                if (player.熔炉 == 1) {
                    if (ranliao < quantity) {
                        e.reply('你似乎没有那么多' + thing_name)
                        return;
                    }
                    await Add_najie_thing(usr_qq, "岩浆", "材料", -quantity);
                    await Add_热量(usr_qq, 1000 * quantity)
                    e.reply('添加成功,火烧的更旺了')
                    return;

                } else {
                    e.reply('你没有熔炉放个屁的燃料！')
                }
            }
      if (thing_name == '轮回阵旗') {
        player.lunhuiBH = 1;
        data.setData('player', usr_qq, player);
        e.reply(['已得到"轮回阵旗"的辅助，下次轮回可抵御轮回之苦的十之八九']);
        await Add_najie_thing(usr_qq, '轮回阵旗', '道具', -1);
        return false;
      }
      if (thing_name == '仙梦之匙') {
        if (player.仙宠 == []) {
          e.reply('你还没有出战仙宠');
          return false;
        }
        player.仙宠.灵魂绑定 = 0;
        data.setData('player', usr_qq, player);
        await Add_najie_thing(usr_qq, '仙梦之匙', '道具', -1);
        e.reply('出战仙宠解绑成功!');
        return false;
      }
      if (thing_name == '残卷') {
        let number = await exist_najie_thing(usr_qq, '残卷', '道具');
        if (isNotNull(number) && number > 9) {
          /** 设置上下文 */
          this.setContext('DUIHUAN');
          /** 回复 */
          await e.reply(
            '是否消耗十个卷轴兑换一个八品功法？回复:【兑换*功法名】或者【还是算了】进行选择',
            false,
            { at: true }
          );
          return false;
        } else {
          e.reply('你没有足够的残卷');
          return false;
        }
      }
if (thing_name == '重铸石') {
    let equipment = await Read_equipment(usr_qq);
    let type = ['武器', '护具', '法宝'];
    let z = [0.8, 1, 1.1, 1.2, 1.3, 1.5];
    let resultMsg = ["【装备重铸结果】"];

    for (var j in type) {
        let random = Math.trunc(Math.random() * 6);
        if (!z[equipment[type[j]].pinji]) continue;
        
        // 记录原始属性
        let original = {
            pinji: equipment[type[j]].pinji,
            atk: equipment[type[j]].atk,
            def: equipment[type[j]].def,
            HP: equipment[type[j]].HP,
            isValue: isFixedStatEquipment(equipment[type[j]]) // 记录原始类型
        };
        
        // 重铸计算
        equipment[type[j]].atk = (equipment[type[j]].atk / z[equipment[type[j]].pinji]) * z[random];
        equipment[type[j]].def = (equipment[type[j]].def / z[equipment[type[j]].pinji]) * z[random];
        equipment[type[j]].HP = (equipment[type[j]].HP / z[equipment[type[j]].pinji]) * z[random];
        if (!original.isValue) {
            for (const field of ['atk', 'def', 'HP']) {
                equipment[type[j]][field] = Math.min(equipment[type[j]][field], MAX_PERCENT_EQUIPMENT_STAT);
            }
        }
        equipment[type[j]].pinji = random;

        // 构建结果消息
        resultMsg.push(
            `${type[j]} 品级：${getPinjiName(original.pinji)} → ${getPinjiName(random)}`
        );

      
    }

    await Write_equipment(usr_qq, equipment);
    await Add_najie_thing(usr_qq, '重铸石', '道具', -1);
    e.reply(resultMsg.join("\n"));
    return false;
}
if (thing_exist.type == '洗髓') {
    // 修正：检查是否未开启灵根
    if (player.linggenshow != 0) {
        await e.reply('你未开灵根，无法洗髓！');
        return false;
    }
    if (player.引灵结果暂存) {
        e.reply('尚有引灵结果未选择，请先发送 #查看引灵结果。');
        return false;
    }
    const maxLifeSource = 100 + (player.灵根?.生命本源 || 0);
    if (player.生命本源 < maxLifeSource) {
        e.reply("你的生命本源亏空无法洗髓!");
        return;
    }
    // 默认数量为1
    if(isNaN(quantity) || quantity < 1) {
        quantity = 1;
    }

    // 检查背包中物品数量
    let najieThingCount = await exist_najie_thing(usr_qq, thing_name, "道具");
    if (najieThingCount < quantity) {
        e.reply('你似乎没有那么多' + thing_name);
        return;
    }
          if (player.洗根次数 === undefined) {
  player.洗根次数 = 0;
  }
    // 消耗物品
    await Add_najie_thing(usr_qq, thing_name, '道具', -quantity);

    // 完整的灵根类型权重
    const talentWeights = {
        '大道体': 100,
        '至尊体': 90,
        '圣体': 80,
        '霸体': 78,
        '神王体': 76,
        '道胎': 75,
        '神体': 70,
        '妖体': 65,
        '天灵根': 60,
        '变异灵根': 50,
        '体质': 40,
        '真灵根': 30,
        '伪灵根': 10
    };

    // 初始化最终灵根（默认为当前灵根）
    const originalTalent = player.灵根;
    let finalTalent = originalTalent;
    let lastTalent = originalTalent; // 最后一次洗髓结果
    
    // 检查是否有指定灵根类型道具效果
    let targetType = player.next_linggen_target_type || null;
    const targetTypeResults = [];
    
    // 检查是否有保留最佳灵根道具效果
    const keepBestEffect = player.next_linggen_keep_best || false;
    let bestTalent = player.灵根; // 用于锁灵仙符的最佳灵根
    let bestWeight = talentWeights[bestTalent.type] || 0;

    // 进行多次洗髓
    for (let i = 0; i < quantity; i++) {
        // 生成一个新的灵根
        let newTalent = await get_random_talent();
        lastTalent = newTalent; // 记录最后一次洗髓结果
        
        // 检查是否是目标类型
        recordGuidedTalent(targetTypeResults, newTalent, targetType);
        
        // 如果使用锁灵仙符，记录最佳灵根
        if (keepBestEffect) {
            let newWeight = talentWeights[newTalent.type] || 0;
            
            if (newWeight > bestWeight) {
                bestTalent = newTalent;
                bestWeight = newWeight;
            }
            // 如果权重相同，比较灵根名称（处理同类型不同品质）
            else if (newWeight === bestWeight) {
                if (isBetterQuality(newTalent, bestTalent)) {
                    bestTalent = newTalent;
                }
            }
        }
    }

    targetTypeResults.sort((a, b) => b.count - a.count);

    // 同一目标类型洗出多种灵根时，先保留原灵根，等待玩家选择。
    if (!keepBestEffect && targetTypeResults.length > 1) {
        const targetHitCount = targetTypeResults.reduce((sum, item) => sum + item.count, 0);
        player.next_linggen_target_type = null;
        player.next_linggen_keep_best = false;
        player.洗根次数 += quantity;
        player.引灵结果暂存 = {
            类型: targetType,
            洗髓次数: quantity,
            候选: targetTypeResults,
            创建时间: Date.now(),
        };
        await Write_player(usr_qq, player);
        e.reply([
            segment.at(usr_qq),
            `成功洗髓${quantity}次，消耗${quantity}个${thing_name}，剩余数量：${najieThingCount - quantity}`,
            `【引灵仙符·${targetType}】共感应到${targetHitCount}次：`,
            ...formatGuidedTalentList(targetTypeResults),
            '当前灵根暂未改变，请发送 #保留引灵结果 序号 或 #保留引灵结果 灵根名。',
        ]);
        return false;
    }

    // 确定最终灵根
    if (keepBestEffect) {
        // 锁灵仙符效果优先
        finalTalent = bestTalent;
    } else if (targetTypeResults.length === 1) {
        // 引灵仙符效果次之
        finalTalent = targetTypeResults[0].talent;
    } else {
        // 默认使用最后一次洗髓结果
        finalTalent = lastTalent;
    }

    // 设置玩家灵根
    player.灵根 = finalTalent;
    
    // 清除道具效果
    player.next_linggen_target_type = null;
    player.next_linggen_keep_best = false;
    
    await checkAndRemoveShengtiMishu(player, usr_qq);
    const newMaxLifeSource = 100 + (player.灵根?.生命本源 || 0);
    player.生命本源 = newMaxLifeSource; // 洗髓后恢复满生命本源
    player.洗根次数+= quantity ;
    // 更新玩家数据
    await Write_player(usr_qq, player);
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
    await player_efficiency(usr_qq); // 添加await

    // 构建回复消息
    const replyMessages = [
        segment.at(usr_qq),
        `成功洗髓${quantity}次，消耗${quantity}个${thing_name}，剩余数量：${najieThingCount - quantity}`,
    ];
    
    // 检查是否有提升
    const originalWeight = talentWeights[originalTalent?.type] || 0;
    const finalWeight = talentWeights[finalTalent.type] || 0;
    const improved = finalWeight > originalWeight || 
                     (finalWeight === originalWeight && 
                      isBetterQuality(finalTalent, originalTalent));
    
    if (improved) {
        replyMessages.push(
            `最终获得灵根：「${player.灵根.type}」: ${player.灵根.name}`,
            `灵根品质：${getQualityDescription(player.灵根.type)}`
        );
    } else {
        replyMessages.push(
            `最终获得灵根：「${player.灵根.type}」: ${player.灵根.name}`,
            `灵根品质：${getQualityDescription(player.灵根.type)}`,
            `(与洗髓前相比未提升)`
        );
    }
    
    // 显示道具效果
    if (keepBestEffect) {
        replyMessages.push(`锁灵仙符生效：已锁定最佳灵根状态`);
    }
    if (targetType) {
        if (targetTypeResults.length) {
            const targetHitCount = targetTypeResults.reduce((sum, item) => sum + item.count, 0);
            replyMessages.push(
                `引灵仙符生效：共感应到【${targetType}】灵根${targetHitCount}次`,
                ...formatGuidedTalentList(targetTypeResults)
            );
        } else {
            replyMessages.push(`引灵仙符效果：未感应到【${targetType}】灵根`);
        }
    }
    
    replyMessages.push('\n可在【#我的练气】中查看详情');
    
    // 回复结果
    e.reply(replyMessages);
    return false;
}

function formatGuidedTalentList(candidates) {
    return candidates.map((item, index) => `${index + 1}. ${item.talent.name} ×${item.count}`);
}

// 辅助函数：比较灵根品质
function isBetterQuality(newTalent, bestTalent) {
    const qualityKeywords = ['极品', '上品', '中品', '下品'];
    const newQualityIndex = qualityKeywords.findIndex(keyword => newTalent.name.includes(keyword));
    const bestQualityIndex = qualityKeywords.findIndex(keyword => bestTalent.name.includes(keyword));
    
    // 品质索引越小表示品质越高
    return newQualityIndex < bestQualityIndex;
}

// 辅助函数：获取灵根品质描述
function getQualityDescription(type) {
    const qualityMap = {
        '大道体': '★★★★★★ (绝世无双)',
        '至尊体': '★★★★★★ (万古罕见)',
        '圣体': '★★★★★ (仙王之资)',
        '霸体': '★★★★☆ (至霸至烈)',
        '神王体': '★★★★ (神王血脉)',
        '道胎': '★★★☆ (道法天成)',
        '神体': '★★★☆ (神族血脉)',
        '妖体': '★★★☆ (妖族至尊)',
        '天灵根': '★★★ (天选之资)',
        '变异灵根': '★★☆ (稀有罕见)',
        '体质': '★★ (特殊体质)',
        '真灵根': '★ (普通优秀)',
        '伪灵根': '☆ (凡俗之资)'
    };
    return qualityMap[type] || '未知品质';
}

     

      if (thing_name == '隐身水' || thing_name == '幸运草') {
        e.reply(`该道具无法在纳戒中消耗`);
        return false;
      }
      if (thing_name == '定灵珠') {
        await Add_najie_thing(usr_qq, thing_name, '道具', -1);
        player.linggenshow = 0;
        await Write_player(usr_qq, player);
        e.reply(
          `你眼前一亮，看到了自己的灵根,` +
          `"${player.灵根.type}"：${player.灵根.name}`
        );
        return false;
      }
if (thing_name == '荒古源血晶') {
             if (player.生命本源  !== 100+player.灵根.生命本源) {
        e.reply("你的生命本源亏空无法使用");
        return ;
    }
    await Add_najie_thing(usr_qq, thing_name, '道具', -1);
    
    // 移除轮回功法
    let gongfa = ["一转轮回", "二转轮回", "三转轮回", "四转轮回", "五转轮回", "六转轮回", "七转轮回", "八转轮回", "九转轮回"];
    for (let i = 0; i < player.lunhui; i++) {
        let x = await exist_najie_thing(usr_qq, gongfa[i], "功法");
        if (!x) {
            await Reduse_player_学习功法(usr_qq, gongfa[i]);
        } else {
            await Add_najie_thing(usr_qq, gongfa[i], "功法", -1);
        }
    }
    
    player = await Read_player(usr_qq);
    player.lunhui = 0;
    player.轮回点 = 0; 
    
    // 添加圣体秘术功法
    const shengti_mishu = {
        "id": 4005185,
        "name": "圣体秘术",
        "class": "功法",
        "type": "修炼功法",
        "修炼加成": 15,
        "出售价": 18000000,
        "稀有度": 1
    };
    
    // 添加功法到玩家
    if (!player.学习的功法.includes(shengti_mishu.name)) {
        player.学习的功法.push(shengti_mishu.name);
    }
    
    // 添加功法到纳戒
    await Add_najie_thing(usr_qq, shengti_mishu.name, "功法", 1);
    
    // 更新灵根为荒古圣体
    player.灵根 = {
        "id": 7010011,
        "name": "荒古圣体",
        "type": "圣体",
        "eff": -800,
        "法球倍率": 0.8,
        "攻击":0.8,
        "防御":1,
        "生命":1.5,
        "生命本源":100};
    player.古地府 = 1
    // 保存玩家数据
          await checkAndRemoveShengtiMishu(player, usr_qq);
    player.生命本源 = 100+player.灵根.生命本源;
    // 更新玩家数据
    await Write_player(usr_qq, player);
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
    await player_efficiency(usr_qq); // 添加await
    // 构建辰东风格文案
    const msg1 = [
        "【荒古圣体·现世】",
        `你炼化了荒古源血晶，一股源自太古洪荒的磅礴血气冲霄而起！`,
        `金色的血液在你体内奔腾咆哮，每一滴血都重若万钧，压塌虚空！`,
        `你的骨骼噼啪作响，血肉重组，周身绽放无量金光，`,
        `「荒古圣体，万劫不灭！」`,
        `你仰天长啸，声震九霄，整片天地都在你的圣体威压下颤栗！`,
        `但圣体注定不为这片天地所容，你的修行之路将比常人艰难百倍！`,
    ].join("\n");
    
    const msg2 = [
        "【圣骸传法】",
        `你的识海中忽然浮现一具胸腔插着断裂帝矛的圣骸，`,
        `它抬起头，眼眶燃起熊熊金焰，气息无比慑人：`,
        `「受吾之精血洗礼，当承吾族之因果！」`,
        `「若有一日你能证道，须替吾族打穿生命禁区，掀翻古地府！」`,
        `圣骸一指，一道金光没入你的识海：`,
        `「此乃圣体单一秘境修炼法门，专为圣体所创！」`,
        `「以血为引，以骨为基，以战养战，方能在这个时代杀出一条血路！」`,
        `「记住！圣体一脉的仇，还未报！」`,
        `圣骸化作点点金光消散，只留下不屈的战意在虚空中回荡...`,
    ].join("\n");
    
    const msg3 = [
        "【圣体秘术】",
        `你领悟了圣体单一秘境修炼法门：`,
        `功法名称：圣体秘术`,
        `功法效果：打磨单一秘境，将秘境淬炼到极致`,
        `圣体专属：此功法专为荒古圣体所创，`,
        `「圣体大成，可叫板大帝！」`,
    ].join("\n");
    
    // 发送全服公告
    const serverMsg = [
        "【天下震动·圣体现世】",
        `九天十地剧烈震荡！${player.名号}成功炼化荒古源血晶！`,
        `荒古圣体重现世间，金色血气冲霄，压塌万古青天！`,
        `生命禁区中传来古老存在的低语：「圣体一脉，还未绝灭么...」`,
    ].join("\n");
    
    // 发送全服公告
    e.reply(serverMsg);
    
    // 发送玩家专属消息
    await e.reply(msg1);
    await sleep(2000);
    await e.reply(msg2);
    await sleep(2000);
    await e.reply(msg3);
    
    return false;
}
if (thing_name == '圣法碎片') {
    let hasShengfaInServer = false;
    let File = fs.readdirSync(__PATH.player_path);
    File = File.filter(file => file.endsWith(".json"));
    for (let i = 0; i < File.length; i++) {
        let this_qq = File[i].replace(".json", '');
        let otherPlayer = await Read_player(this_qq);
        if (isShengfaClaimed(otherPlayer)) {
            hasShengfaInServer = true;
            break;
        }
    }
    if (hasShengfaInServer) {
        e.reply([
            "【圣法碎片已有归属】",
            "此超脱至宝已被他人炼化或正在炼化",
            "诸天万界中，圣法碎片具有唯一性",
            "无法再次炼化",
        ].join("\n"));
        return false;
    }

    const actionRaw = await redis.get(`xiuxian:player:${usr_qq}:action`);
    const oldAction = actionRaw ? JSON.parse(actionRaw) : null;
    if (oldAction?.end_time > Date.now()) {
        e.reply(`你正在${oldAction.action}，暂时无法炼化圣法碎片`);
        return false;
    }

    const started = startShengfaRefinement(player, { groupId: e.group_id });
    if (!started.ok) {
        e.reply(started.message);
        return false;
    }

    // await Add_najie_thing(usr_qq, thing_name, '道具', -1); // 按设定保留圣法碎片，不执行原消耗逻辑
    await Write_player(usr_qq, player);
    await redis.set(`xiuxian:player:${usr_qq}:action`, JSON.stringify({
        action: SHENGFA_REFINING,
        start_time: Date.now(),
        end_time: started.endTime,
        time: SHENGFA_REFINE_MS,
        working: '1',
        Place_action: '1',
        Place_actionplus: '1',
    }));
    e.reply([
        '【超脱至宝·圣法碎片】',
        `你开始炼化圣法碎片，进入「${SHENGFA_REFINING}」状态。`,
        '炼化需480分钟，期间不会直接提升任何境界。',
    ].join('\n'));
    return false;
}
      if (thing_name == "圆神终极本源") {
                      if (player.id != "2468511249"&&player.id !="2283096140") {
                          e.reply(`你并非能够成为圆神之人!`);
                          return;
                      }
                    
    player.灵根 = {"id":7010015,"name":"圆神","type":"圆环之理","归类":"诸天万界","eff":5,"法球倍率":5,"攻击":20,"防御":20,"生命":20,"生命本源":1000};
     await Add_najie_thing(usr_qq, thing_name, '道具', -1);
                              player.生命本源 = 100 + player.灵根.生命本源;
    // 更新玩家数据
    await Write_player(usr_qq, player);
    let equipment = await Read_equipment(usr_qq);
    await Write_equipment(usr_qq, equipment);
                          e.reply(`你成功化作了超越宇宙法则的存在`);
                          return;
                 
                  }
if (thing_name == "先天混沌圣体道胎本源") {
    
    // === 检查是否已有顶级体质 ===
    const topConstitutions = [
        "混沌体", "圣体道胎", "先天圣体道胎", 
        "圆环之理", "大成圣体", "混沌圣体道胎"
    ];
    
    if (topConstitutions.includes(player.灵根.type)) {
        return e.reply([
            '「体质冲突！」',
            `你已拥有无上体质【${player.灵根.type}】`,
            '无法再融合先天混沌圣体道胎本源！',
            '一种无上体质已是天地极限',
            '贪多反受其害！'
        ].join('\n'));
    }
    
    // === 体质转化过程 ===
    try {
        // 记录旧体质 - 这里只保存类型字符串
        const oldConstitutionType = player.灵根.type;
        
        // 更新灵根为先天混沌圣体道胎
        player.灵根 = {
            "id": 70051,
            "name": "先天混沌圣体道胎",
            "type": "混沌圣体道胎", 
            "归类": "遮天位面",
            "eff": 572,
            "法球倍率": 4,
            "攻击": 15,
            "防御": 15, 
            "生命": 15,
            "生命本源": 800
        };
        
        // 增加生命本源
       player.生命本源 = 100 + player.灵根.生命本源;
        
        // 消耗道具
        await Add_najie_thing(usr_qq, thing_name, '道具', -1);
        
        // 更新玩家数据
        await Write_player(usr_qq, player);
        
        // === 生成转化文案 ===
        const realmNames = ["上苍之上", "祭海之底", "超脱之路"];
        const randomRealm = realmNames[Math.floor(Math.random() * realmNames.length)];

        // 正确构建文案数组
        const transformationText = [
            `【混沌初开·圣体道胎·仙帝命格】`,
            `「轰隆——」${randomRealm}时空破碎，混沌之气贯穿诸天！`,
            `${player.名号}融合先天混沌圣体道胎本源，引动超脱级异象！`,
            ``,
            `旧体质【${oldConstitutionType}】归于混沌，新体质【先天混沌圣体道胎】诞生！`,
            `├─ 混沌衍万道：一念演化诸天规则`,
            `├─ 圣体道胎合：完美契合大道本源`,
            `├─ 先天不朽根：生命本质跃迁`,
            `└─ 路尽级天命：必成仙帝`,
            ``,
            `仙帝命格已定：准仙帝→仙帝（必然）`,
            `战力层级：路尽级之下无敌手，超脱轮回指日可待！`,
        ].join('\n');
        
        e.reply(transformationText);
            const message = [
        `【体质共鸣·诸天震动】`,
        `先天混沌圣体道胎诞生，引动诸天万界剧烈震荡！`,
        `时空长河泛起惊涛骇浪，祭道之上传来道音！`,
        ``,
        `「这种波动……难道是传说中的先天混沌圣体道胎？」`,
        `「必成仙帝的体质竟然现世了！」`,
        `「这一世，难道要再现荒天帝、叶天帝时代的辉煌？」`,
        `「仙帝争锋时代，正式来临！」`,
        ``,
        `${player.名号}成就先天混沌圣体道胎，`,
        `仙帝命格已定，诸天强者皆有所感应！`,
        `超脱之路的终极角逐，自此拉开序幕……`
    ].join('\n');

    await this.broadcastToAll(player,message);
    } catch (error) {
        console.error('体质转化失败:', error);
        e.reply('体质转化过程中发生未知错误，请稍后再试');
    }
}

                     if (thing_name == "平平无奇的符咒") {
                      if (player.id != "2468511249") {
                          e.reply(`你并非命中注定者!`);
                          return;
                      }
                       await Add_najie_thing(usr_qq, thing_name, '道具', -1);
                         player.莫晓羽庇护 = 1;
                          await Write_player(usr_qq, player);
                          e.reply(`世人皆知，亦不可知!`);
                          return;
                 
                  }
if (thing_name === '光阴水' || thing_name === '光阴火' || thing_name === '光阴石') {
  // 1. 资格校验
  const ALLOW_TYPES = ['天魔', '命运', '神魔体'];
  if (!ALLOW_TYPES.includes(player.灵根.type)) {
    e.reply(`你并非来自此界的超脱者!`);
    return;
  }

  // 2. 初始化光阴加成对象
  if (!player.光阴加成) player.光阴加成 = { 攻: 0, 防: 0, 生: 0 };

  // 3. 区分属性键、上限值、单份增量
  const CONFIG = {
    光阴水: { key: '生', base: 90000000, max: 900000000, desc: '生命' },
    光阴火: { key: '攻', base: 90000000, max: 900000000, desc: '攻击' },
    光阴石: { key: '防', base: 90000000, max: 900000000, desc: '防御' },
  };
  const { key, base, max, desc } = CONFIG[thing_name];

  // 4. 计算“最多还能吃几个”
  const current = player.光阴加成[key];
  const canUse = Math.floor((max - current) / base);
  if (canUse <= 0) {
    e.reply(`你的光阴${desc}加成已达到最高`);
    return;
  }
  if (quantity > canUse) {
    e.reply(`本次使用数量不能大于 ${canUse} 个，否则将超出光阴上限`);
    return;
  }

  // 5. 真正消耗与加成
  await Add_najie_thing(usr_qq, thing_name, '道具', -quantity);
  const total = base * quantity;
  player.光阴加成[key] += total;

  // 6. 写入主属性
  if (thing_name === '光阴水') {
    player.血量上限 += total;
    player.当前血量 += total;
  } else if (thing_name === '光阴火') {
    player.攻击 += total;
  } else if (thing_name === '光阴石') {
    player.防御 += total;
  }

  await Write_player(usr_qq, player);
  e.reply(`超脱者，你获得了光阴的洗礼！\n${desc}+${total}\n光阴${desc}加成: +${player.光阴加成[key]}`);
  return;
}
// 道法仙术卡统一处理逻辑
if (thing_name == '道法仙术一日卡' ||thing_name == '道法仙术三日卡' || thing_name == '道法仙术周卡' || thing_name == '道法仙术月卡') {
    await Add_najie_thing(usr_qq, thing_name, '道具', -quantity);
    
    const now = new Date();
    const nowTime = now.getTime();
    let addDays = 0;
    
    if (thing_name == '道法仙术一日卡') {
        addDays = 1*quantity;
    }
    else if (thing_name == '道法仙术三日卡') {
        addDays = 3*quantity;
    } else if (thing_name == '道法仙术周卡') {
        addDays = 7*quantity;
    } else if (thing_name == '道法仙术月卡') {
        // 自然月计算：获取当前月份的总天数
        const year = now.getFullYear();
        const month = now.getMonth() + 1; 
        const daysInMonth = new Date(year, month, 0).getDate();
        addDays = daysInMonth; // 动态匹配当月天数
    }

    const addMilliseconds = addDays * 86400000;
    
    // 状态标记（0:未激活 1:已激活 2:高级状态）
    player.daofaxianshu = 2;  

    // 有效期计算（支持叠加）
    if (!player.daofaxianshu_endtime || player.daofaxianshu_endtime < nowTime) {
        player.daofaxianshu_endtime = nowTime + addMilliseconds;
    } else {
        player.daofaxianshu_endtime += addMilliseconds;
    }

    // 精确剩余时间计算（含小数）
    const remainingMs = player.daofaxianshu_endtime - nowTime;
    const remainingDays = Math.round((remainingMs / 86400000) * 10) / 10;
    
    // 格式化到期时间显示
    const expireDate = new Date(player.daofaxianshu_endtime);
    player.daofa = `已开启，当前剩余${remainingDays}天`;
    
    await Write_player(usr_qq, player);
    xiuxianData.addToDaofaList(usr_qq);
    
    // 差异化激活提示
    let typeName = '';
    if (thing_name.includes('三日卡')) typeName = '三日卡';
    else if (thing_name.includes('周卡')) typeName = '周卡';
    else if (thing_name.includes('一日卡')) typeName = '一日卡';
    else typeName = '月卡';
    
    e.reply(`『道法仙术』${typeName}开通成功！\n有效期增加${addDays}天，当前剩余${remainingDays}天`);
    return false;
}
      let qh = data.qianghua.find(item => item.name == thing_exist.name);
      if (qh) {
        if (qh.class == '魔头' && player.魔道值 < 1000) {
          e.reply(`你还是提升点魔道值再用吧!`);
          return false;
        } else if (
          qh.class == '神人' &&
          (player.魔道值 > 0 ||
            (player.灵根.type != '转生' && player.level_id < 42))
        ) {
          e.reply(`你尝试使用它,但是失败了`);
          return false;
        }
        if (player.攻击加成 >= 10000000000000) {
          e.reply(`你的力量已经超越诸天极限，无法再通过强化更进一步了!`);
          return false;
        } 
         if (player.防御加成 >= 10000000000000) {
          e.reply(`你的生命已经超越诸天极限，无法再通过强化更进一步了!`);
          return false;
        } 
         if (player.生命加成 >= 10000000000000) {
          e.reply(`你的生命已经超越诸天极限，无法再通过强化更进一步了!`);
          return false;
        } 
        player.攻击加成 += qh.攻击 * quantity;
        player.防御加成 += qh.防御 * quantity;
        player.生命加成 += qh.血量 * quantity;
        await Write_player(usr_qq, player);
        let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
        await Add_najie_thing(usr_qq, thing_name, '道具', -quantity);
        e.reply(`${qh.msg}`);
        return false;
      }
      if (thing_exist.type == "练气玄影") {
        let photo = thing_exist.id
        if (player.练气皮肤 == photo) {
            e.reply("您的玄影已经是" + thing_exist.name)
            return
        }
        let old = data.kamian3.find(item => item.id == player.练气皮肤)
        player.练气皮肤 = photo
        await Write_player(usr_qq, player)
        await Add_najie_thing(usr_qq, thing_name, "道具", -1)
        await Add_najie_thing(usr_qq, old.name, "道具", 1)
        e.reply("更换" + thing_exist.type + "【" + thing_exist.name + "】成功")
        return
    }
    if (thing_exist.type == "纳戒玄影") {
        let photo = thing_exist.id
        if (player.纳戒皮肤 == photo) {
            e.reply("您的玄影已经是" + thing_exist.name)
            return
        }
        let old = data.kamian.find(item => item.id == player.纳戒皮肤)
        player.纳戒皮肤 = photo
        await Write_player(usr_qq, player)
        await Add_najie_thing(usr_qq, thing_name, "道具", -1)
        await Add_najie_thing(usr_qq, old.name, "道具", 1)
        e.reply("更换" + thing_exist.type + "【" + thing_exist.name + "】成功")
        return
    }
      e.reply(`功能开发中,敬请期待`);
      return false;
    }
  if (func == '学习') {
  let player = await Read_player(usr_qq);
  let islearned = player.学习的功法.find(item => item == thing_name);

  if (FLOWER_BREATHING_METHODS.has(thing_name) && !isCultivatingExtraPath(player, 'huafen')) {
    e.reply('呼吸法只与花粉进化路相合，你当前修炼的额外体系无法承载此法。');
    return false;
  }
  
  // 定义功法层级映射（数字越大 = 越难学）
  const gongfaHierarchy = {
    "武学": 0,
    "限定功法": 0,
    "修炼功法": 1,
    "炼器": 1,
    "炼丹": 1,
    "天魔法": 2,
    "命运法": 2,
    "道与法": 3,
    "宝术": 3,
    "精神法门": 3,
    "九秘": 4,
    "盖世杀术": 4,
    "帝经": 5,
    "十凶宝术": 6,
    "仙王法": 7,
    "仙帝法": 8,
    "神慧者": 9
  };

  // 天资等级对应的最高可学习难度（值=能学的最高gongfaHierarchy）
  const aptitudeLevels = {
    "生而愚痴": 0,   // 只能学武学(0)
    "天弃之人": 1,   // 可学修炼功法/炼器/炼丹(1)
    "先天不足": 2,   // 可学天魔法/命运法(2)
    "平庸之资": 2,   // 可学天魔法/命运法(2)，学不了道与法(3)
    "超凡资质": 3,   // 可学道与法/宝术(3)
    "天纵之资": 4,   // 可学九秘/盖世杀术(4)
    "旷世奇才": 5,   // 可学帝经(5)
    "绝世天骄": 7,   // 可学十凶宝术(6)/仙王法(7)
    "万古无双": 8,   // 可学仙帝法(8)
    "无演无尽": 9,   // 可学神慧者(9)
    "岁云": 9,
    "无化如是": -1   // 什么都学不了
  };

  // 获取玩家的天资等级
  const aptitudeLevel = player.天资等级;

  // 检查是否已学习
  if (islearned) {
    e.reply(`你已经学过该功法了`);
    return false;
  }
  // === 特殊天资：无化如是 ===
  if (aptitudeLevel === '无化如是') {
    e.reply([
      `【天道封印·功法学习失败】`,
      `你翻开功法，却发现所有文字如蝌蚪般扭曲！`,
      `功法产生排斥："无用之人，无法承载任何道法！"`,
      `你的天资【无化如是】已被天道封印，`,
      `任何功法都无法烙印在你的识海中。`,
      `提示：无化如是，无物可学，天命所定！`
    ].join('\n'));
    return false;
  }

  // === 特殊天资：生而愚痴 ===
  if (aptitudeLevel === '生而愚痴') {
    // 生而愚痴只能学习最基础的功法
    const allowedTypes = ["修炼功法", "武学"];
    if (!allowedTypes.includes(thing_exist.type)) {
      e.reply([
        `【愚痴之脑·功法学习困难】`,
        `你试图理解${thing_name}，但字迹在你眼中扭曲模糊！`,
        `识海混沌，思维迟滞，完全无法理解其中奥义。`,
        `你的天资【生而愚痴】天生愚笨，`,
        `只能理解最基础的修炼功法和武学。`,
        `提示：需先提升天资至天弃之人以上`
      ].join('\n'));
      return false;
    }
  } 
  // 特殊功法检查（神慧者）
  if (player.灵根.type != "神慧者" && thing_exist.type == '神慧者') {
    e.reply(`你并非神慧者`);
    return false;
  }
  
  // 特殊功法检查（无始经）
  if (thing_name == '无始经' && (player.灵根.name != "先天圣体道胎"&& 
      player.灵根.type != "混沌圣体道胎")) {
    e.reply([
      `【帝经拒斥】`,
      `你欲参悟《无始经》，却遭无始钟虚影镇压！`,
      `钟声震碎虚空："非先天圣体道胎，不配执掌无始法！"`,
    ].join('\n'));
    return false;
  }
  
  // 特殊功法检查（西皇经）
  if (thing_name == '西皇经' && 
      (player.灵根.type != "道胎" && 
      player.灵根.type != "圣体道胎"&& 
      player.灵根.type != "混沌圣体道胎")) {
    e.reply([
      `【道胎本源】`,
      `你欲参悟《西皇经》，却引动道则反噬！`,
      `体内道宫轰鸣："非先天道胎血脉，不可承西皇道统！"`,
    ].join('\n'));
    return false;
  }
  
  // 特殊功法检查（妖帝古经）
  if ((thing_name == '妖帝古经' || thing_name == '万龙古经') && 
      (player.灵根.type != "妖体"&&player.灵根.type != "小成妖体"&&player.灵根.type != "大成妖体")) {
    e.reply([
      `【妖血沸腾】`,
      `你欲参悟《${thing_name}》，却引万妖虚影暴动！`,
      `太古妖皇怒吼："非纯正妖体血脉，岂敢觊觎妖族帝经！"`,
    ].join('\n'));
    return false;
  }

  // === 特殊功法检查：自然大道 ===
  if (thing_name === '自然大道') {
    const allowedAptitudes = ["平庸之资", "先天不足", "天弃之人", "生而愚痴"];
    if (!allowedAptitudes.includes(aptitudeLevel)) {
      e.reply([
        `〖大道拒斥〗`,
        `你的天资【${aptitudeLevel}】过于聪慧，`,
        `无法领悟【自然大道】的真谛！`,
        ``,
        `〖自然大道真意〗`,
        `"道法自然，无为而化，唯愚者可悟！"`,
        `当前天资：${aptitudeLevel}`,
        `适合天资：平庸之资、先天不足、天弃之人、生而愚痴`
      ].join('\n'));
      return false;
    }
  }
  
  // 获取玩家可学习的最高层级
  const playerMaxLevel = aptitudeLevels[aptitudeLevel] ?? 2; // 默认为2（平庸之资）
  
  // 获取功法的层级
  const gongfaLevel = gongfaHierarchy[thing_exist.type] ?? 8;
  
  // ==== 天资层级判断 ====
  if (gongfaLevel > playerMaxLevel) {
    e.reply(`你的天资等级【${aptitudeLevel}】不足以学习【${thing_exist.type}】类功法（难度${gongfaLevel}，你的上限${playerMaxLevel}）`);
    return false;
  }

  // ========== 仙道潜力检查（功法学习） ==========
  {
    const potentialCost = getLearningPotentialCost(player, gongfaLevel + 1);
    const currentPotential = player.仙道潜力 || 0;
    if (currentPotential < potentialCost) {
      e.reply([
        `【仙道潜力不足·功法学习受阻】`,
        `你展开${thing_name}，字字珠玑如星辰，`,
        `却感到识海中的仙道潜力已几近枯竭，无法承载这份传承！`,
        ``,
        `当前仙道潜力：${currentPotential} 点`,
        `学习所需潜力：${potentialCost} 点（${thing_exist.type}）`,
        `「潜力有尽，传承无穷，请先补足仙道潜力方可领悟！」`
      ].join('\n'));
      return false;
    }
  }
  // ========== 仙道潜力检查结束 ==========

  // 计算本次学习消耗的潜力
  const learnPotentialCost = getLearningPotentialCost(player, 9 - gongfaLevel);

  // 学习功法
  await Add_najie_thing(usr_qq, thing_name, '功法', -1);
player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - learnPotentialCost);
  for (const [field, value] of Object.entries(thing_exist.属性加成 || {})) {
    player[field] = (Number(player[field]) || 0) + Number(value);
  }
  await Write_player(usr_qq, player);
  await Add_player_学习功法(usr_qq, thing_name);
  // 扣除仙道潜力

  
  const remainPotential = player.仙道潜力;

  // 自然大道特殊成功文案
  if (thing_name == '自然大道') {
    e.reply([
      `【大道至简】`,
      `你翻开《自然大道》古卷，却见书页空白如洗！`,
      `正疑惑间，忽闻天地共鸣：`,
      `"道法自然，无为而化..."`,
      `刹那间，草木生长、溪流奔涌、云卷云舒...`,
      `万物运转的至理如清泉般流入心田！`,
      `你顿悟了："原来愚钝才是通天道，平庸方为真逍遥！"`,
      ``,
      `消耗仙道潜力：${learnPotentialCost} 点 | 剩余：${remainPotential} 点`,
    ].join('\n'));
  } else {
    e.reply([
      `你领悟了【${thing_name}】，道法烙印于识海！`,
      `可在【#我的炼体】中查看已学功法`,
      `消耗仙道潜力：${learnPotentialCost} 点 | 剩余：${remainPotential} 点`,
    ].join('\n'));
  }
}}
  //兑换方法
  async DUIHUAN(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    /** 内容 */
    let new_msg = this.e.message;
    let choice = new_msg[0].text;
    let code = choice.split('*');
    let les = code[0]; //条件
    let gonfa = code[1]; //功法
    if (les == '还是算了') {
      await this.reply('取消兑换');
      /** 结束上下文 */
      this.finish('DUIHUAN');
      return false;
    } else if (les == '兑换') {
      // 名字规范化：NFKC 折叠全角字符、忽略「·」分隔符差异。
      // 玩家常写成「八品心禅不灭诀」，列表里是「八品·心禅不灭诀」，严格等值会白白失败。
      const norm = (s) => String(s || '').normalize('NFKC').replace(/[·・]/g, '').trim();
      const target = norm(gonfa);
      let ifexist2 = data.bapin.find(item => norm(item.name) === target);
      if (ifexist2) {
        await Add_najie_thing(usr_qq, '残卷', '道具', -10);
        await Add_najie_thing(usr_qq, gonfa, '功法', 1);
        await this.reply('兑换' + ifexist2.name + '成功');
        this.finish('DUIHUAN');
        return false;
      } else {
        await this.reply('残卷无法兑换该功法');
        this.finish('DUIHUAN');
        return false;
      }
    }
  }

  //购买商品
  async Buy_comodities(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    let flag = await Go(e);
    if (!flag) {
      return false;
    }
    let thing = e.msg.replace('#', '');
    thing = thing.replace('购买', '');
    let code = thing.split('*');
    let thing_name = code[0];
    let ifexist = data.commodities_list.find(item => item.name == thing_name);
    if (!ifexist) {
      e.reply(`柠檬堂还没有这样的东西:${thing_name}`);
      return false;
    }
    let quantity = await convert2integer(code[1]);
    let player = await Read_player(usr_qq);
    let lingshi = player.灵石;
    //如果没钱，或者为负数
    if (lingshi <= 0) {
      e.reply(`掌柜：就你这穷酸样，也想来柠檬堂？走走走！`);
      return false;
    }
    // 价格倍率
    //价格
    let commodities_price = ifexist.出售价 * 1.2 * quantity;
    commodities_price = Math.trunc(commodities_price);
    //判断金额
    if (lingshi < commodities_price) {
      e.reply(
        `口袋里的灵石不足以支付${thing_name},还需要${commodities_price - lingshi
        }灵石`
      );
      return false;
    }
    //符合就往戒指加
    await Add_najie_thing(usr_qq, thing_name, ifexist.class, quantity);
    await Add_灵石(usr_qq, -commodities_price);
    //发送消息
    e.reply([
      `购买成功!  获得[${thing_name}]*${quantity},花[${commodities_price}]灵石,剩余[${lingshi - commodities_price
      }]灵石  `,
      '\n可以在【我的纳戒】中查看',
    ]);
    return false;
  }
async Buy_yaochi(e) {
  if (!verc({ e })) return false;
  const usr_qq = await channel(e.user_id.toString().replace('qg_',''));
  
  // 检查玩家是否存在
  if (!await existplayer(usr_qq)) {
    return e.reply("瑶池仙楼管事：阁下似乎尚未踏入修行之路，请先创建角色");
  }
  
  // 检查玩家状态
  const player = await Read_player(usr_qq);
  
  // 检查是否瑶池弟子
  if (player.势力 !== "瑶池") {
    return e.reply([
      "瑶池仙楼管事：",
      "此乃瑶池私库，只向本门弟子开放。",
      "你尚未加入瑶池，不得在此兑换。"
    ].join("\n"));
  }
  
  // 检查是否在遮天位面
  if (player.power_place != PLACE_LOCATION_MAP.遮天位面) {
    return e.reply([
      "瑶池仙楼管事：",
      "此乃九天之上的瑶池仙楼，你身处凡尘俗世，如何寻得？",
      "需先进入遮天位面方可寻得仙楼踪迹"
    ].join("\n"));
  }
  
  // 检查性别（瑶池只收女弟子）
  if (player.sex != 1) {
    return e.reply([
      "瑶池仙楼管事：",
      "此乃西王母道场，只接待女修！",
      "阁下堂堂七尺男儿，还请移步他处"
    ].join("\n"));
  }
  
  // 解析商品名称和数量
  const thing = e.msg.replace('#瑶池兑换', '').trim();
  const code = thing.split('*');
  const thing_name = code[0];
  const quantity = await convert2integer(code[1]) || 1;
  
  // 查找商品
  const ifexist = data.yaochishangdian.find(item => item.name == thing_name);
  if (!ifexist) {
    return e.reply([
      `瑶池仙楼管事：`,
      `"${thing_name}"？此物不在我瑶池仙楼名录之中`,
      `阁下可查阅【#瑶池仙楼】查看可兑换之物`
    ].join("\n"));
  }
  
  // 职位层级定义
  const positionLevel = {
    "记名女弟子": 1,
    "正式女弟子": 2,
    "亲传女弟子": 3,
    "真传女弟子": 4,
    "圣女": 5
  };
  
  // 检查职位要求（圣女无视所有要求）
  if (ifexist.要求 && player.势力职位 !== ifexist.要求) {
    // 如果不是圣女，再检查身份层级
    if (player.势力职位 !== "圣女") {
      const currentLevel = positionLevel[player.势力职位] || 0;
      const requiredLevel = positionLevel[ifexist.要求] || 0;
      
      if (currentLevel < requiredLevel) {
        return e.reply([
          `瑶池仙楼管事：`,
          `"${thing_name}"乃瑶池珍品，唯有${ifexist.要求}及以上方可兑换`,
          `阁下当前仅为${player.势力职位}，尚需努力修行，提升职位`
        ].join("\n"));
      }
    }
  }
  
  // 计算价格
  const yaochishangdian_price = Math.trunc(ifexist.出售价  * quantity);
  
  // 检查源石是否足够
  if (player.源石 < yaochishangdian_price) {
    const shortage = yaochishangdian_price - player.源石;
    
    // 根据职位定制不同文案
    let message = "";
    if (player.势力职位 === "圣女") {
      message = [
        `瑶池仙楼管事恭敬行礼：`,
        `圣女殿下，此物需${yaochishangdian_price}源石`,
        `您纳戒中仅有${player.源石}源石，尚缺${shortage}源石`,
        `待您集齐源石，妾身定当亲自奉上`
      ].join("\n");
    } else if (player.势力职位 === "真传女弟子") {
      message = [
        `瑶池仙楼管事微微欠身：`,
        `真传师姐，此物需${yaochishangdian_price}源石`,
        `您纳戒中仅有${player.源石}源石，尚缺${shortage}源石`,
        `还请师姐稍作筹备`
      ].join("\n");
    } else {
      message = [
        `瑶池仙楼管事：`,
        `此物需${yaochishangdian_price}源石`,
        `你仅有${player.源石}源石，尚缺${shortage}源石`,
        `待源石充足再来吧`
      ].join("\n");
    }
    
    return e.reply(message);
  }
  
  // 兑换商品
  await Add_najie_thing(usr_qq, thing_name, ifexist.class, quantity);
  await Add_源石(usr_qq, -yaochishangdian_price);
  
  // 更新玩家数据
  const updatedPlayer = await Read_player(usr_qq);
  
  // 根据职位定制购买成功文案
  let successMessage = "";
  if (player.势力职位 === "圣女") {
    successMessage = [
      `瑶池仙楼管事恭敬奉上玉盒：`,
      `"圣女殿下，这是您要的${thing_name}×${quantity}"`,
      `"已从您的瑶池玉令中扣除${yaochishangdian_price.toLocaleString()}源石"`,
      `"您玉令中尚有${updatedPlayer.源石.toLocaleString()}源石"`,
      `"殿下若有其他需求，随时吩咐妾身"`
    ].join("\n");
  } else if (player.势力职位 === "真传女弟子") {
    successMessage = [
      `瑶池仙楼管事微笑呈上：`,
      `"真传师姐，这是您兑换的${thing_name}×${quantity}"`,
      `"已扣除${yaochishangdian_price.toLocaleString()}源石"`,
      `"您纳戒中尚有${updatedPlayer.源石.toLocaleString()}源石"`,
      `"师姐慢走"`
    ].join("\n");
  } else if (player.势力职位 === "亲传女弟子") {
    successMessage = [
      `瑶池仙楼管事：`,
      `"师妹，这是你要的${thing_name}×${quantity}"`,
      `"已扣除${yaochishangdian_price.toLocaleString()}源石"`,
      `"剩余源石：${updatedPlayer.源石.toLocaleString()}"`,
      `"可去瑶池秘境修炼提升修为"`
    ].join("\n");
  } else {
    successMessage = [
      `瑶池仙楼管事：`,
      `"这是你的${thing_name}×${quantity}"`,
      `"已扣除${yaochishangdian_price.toLocaleString()}源石"`,
      `"剩余源石：${updatedPlayer.源石.toLocaleString()}"`,
      `"可在【#我的纳戒】中查看"`
    ].join("\n");
  }
  
  return e.reply(successMessage);
}
async Buy_yaoguang(e) {
  if (!verc({ e })) return false;
  const usr_qq = await channel(e.user_id.toString().replace('qg_',''));
  
  // 检查玩家是否存在
  if (!await existplayer(usr_qq)) {
    return e.reply("摇光圣殿执事：阁下似乎尚未踏入修行之路，请先创建角色");
  }
  
  // 检查玩家状态
  const player = await Read_player(usr_qq);
  
  // 检查是否摇光圣地弟子
  if (player.势力 !== "摇光圣地") {
    return e.reply([
      "摇光圣殿执事：",
      "此乃摇光圣殿秘藏，非本门弟子不得兑换。",
      "你尚未加入摇光圣地，不得在此兑换。"
    ].join("\n"));
  }
  
  // 检查是否在遮天位面
  if (player.power_place != PLACE_LOCATION_MAP.遮天位面) {
    return e.reply([
      "摇光圣殿执事：",
      "此乃东荒摇光圣殿，你身处凡尘俗世，如何寻得？",
      "需先进入遮天位面方可感应圣殿气息"
    ].join("\n"));
  }
  
  // 解析商品名称和数量
  const thing = e.msg.replace('#摇光兑换', '').trim();
  const code = thing.split('*');
  const thing_name = code[0];
  const quantity = await convert2integer(code[1]) || 1;
  
  // 查找商品
  const ifexist = data.yaoguangshangdian.find(item => item.name == thing_name);
  if (!ifexist) {
    return e.reply([
      `摇光圣殿执事：`,
      `"${thing_name}"？此物不在我摇光圣殿名录之中`,
      `阁下可查阅【#摇光圣殿】查看可兑换之物`
    ].join("\n"));
  }
  
  // 摇光圣地职位层级定义
  const positionLevel = {
    "记名弟子": 1,
    "外门弟子": 2,
    "内门弟子": 3,
    "核心弟子": 4,
    "真传弟子": 5,
    "圣子": 6,
    "圣女": 6
  };
  
  // 检查职位要求（圣子/圣女无视所有要求）
  if (ifexist.要求) {
    let hasPermission = false;
    
    // 处理要求字段（可能是字符串或数组）
    if (Array.isArray(ifexist.要求)) {
      // 如果是数组，检查当前职位是否在要求数组中
      hasPermission = ifexist.要求.includes(player.势力职位);
    } else {
      // 如果是字符串，使用层级比较
      const currentLevel = positionLevel[player.势力职位] || 0;
      const requiredLevel = positionLevel[ifexist.要求] || 0;
      hasPermission = currentLevel >= requiredLevel;
    }
    
    if (!hasPermission) {
      // 特殊处理圣子/圣女权限
      if (player.势力职位 !== "圣子" && player.势力职位 !== "圣女") {
        let requirementText = Array.isArray(ifexist.要求) ? 
          ifexist.要求.join("或") : ifexist.要求;
        
        return e.reply([
          `摇光圣殿执事：`,
          `"${thing_name}"乃摇光珍品，唯有${requirementText}方可兑换`,
          `阁下当前仅为${player.势力职位}，尚需努力修行，提升职位`
        ].join("\n"));
      }
    }
  }
  
  // 计算价格
  const yaoguangshangdian_price = Math.trunc(ifexist.出售价 * quantity);
  
  // 检查源石是否足够
  if (player.源石 < yaoguangshangdian_price) {
    const shortage = yaoguangshangdian_price - player.源石;
    
    // 根据职位定制不同文案
    let message = "";
    if (player.势力职位 === "圣子" || player.势力职位 === "圣女") {
      message = [
        `摇光圣殿执事恭敬行礼：`,
        `圣子/圣女殿下，此物需${yaoguangshangdian_price}源石`,
        `您纳戒中仅有${player.源石}源石，尚缺${shortage}源石`,
        `待您集齐源石，属下定当亲自奉上`
      ].join("\n");
    } else if (player.势力职位 === "真传弟子") {
      message = [
        `摇光圣殿执事微微欠身：`,
        `真传师兄/师姐，此物需${yaoguangshangdian_price}源石`,
        `您纳戒中仅有${player.源石}源石，尚缺${shortage}源石`,
        `还请师兄/师姐稍作筹备`
      ].join("\n");
    } else if (player.势力职位 === "核心弟子") {
      message = [
        `摇光圣殿执事：`,
        `核心师弟/师妹，此物需${yaoguangshangdian_price}源石`,
        `你仅有${player.源石}源石，尚缺${shortage}源石`,
        `可多做宗门任务积累源石`
      ].join("\n");
    } else {
      message = [
        `摇光圣殿执事：`,
        `此物需${yaoguangshangdian_price}源石`,
        `你仅有${player.源石}源石，尚缺${shortage}源石`,
        `待源石充足再来吧`
      ].join("\n");
    }
    
    return e.reply(message);
  }
  
  // 兑换商品
  await Add_najie_thing(usr_qq, thing_name, ifexist.class, quantity);
  await Add_源石(usr_qq, -yaoguangshangdian_price);
  
  // 更新玩家数据
  const updatedPlayer = await Read_player(usr_qq);
  
  // 根据职位定制购买成功文案
  let successMessage = "";
  if (player.势力职位 === "圣子" || player.势力职位 === "圣女") {
    const title = player.势力职位 === "圣子" ? "圣子殿下" : "圣女殿下";
    successMessage = [
      `摇光圣殿执事恭敬奉上玉盒：`,
      `"${title}，这是您要的${thing_name}×${quantity}"`,
      `"已从您的圣子/圣女令中扣除${yaoguangshangdian_price.toLocaleString()}源石"`,
      `"您令中尚有${updatedPlayer.源石.toLocaleString()}源石"`,
      `"殿下若有其他需求，龙纹黑金鼎随时为您服务"`
    ].join("\n");
  } else if (player.势力职位 === "真传弟子") {
    successMessage = [
      `摇光圣殿执事微笑呈上：`,
      `"真传师兄/师姐，这是您兑换的${thing_name}×${quantity}"`,
      `"已扣除${yaoguangshangdian_price.toLocaleString()}源石"`,
      `"您纳戒中尚有${updatedPlayer.源石.toLocaleString()}源石"`,
      `"师兄/师姐慢走，圣光永伴"`
    ].join("\n");
  } else if (player.势力职位 === "核心弟子") {
    successMessage = [
      `摇光圣殿执事：`,
      `"核心师弟/师妹，这是你要的${thing_name}×${quantity}"`,
      `"已扣除${yaoguangshangdian_price.toLocaleString()}源石"`,
      `"剩余源石：${updatedPlayer.源石.toLocaleString()}"`,
      `"可去圣光塔修炼提升修为"`
    ].join("\n");
  } else if (player.势力职位 === "内门弟子") {
    successMessage = [
      `摇光圣殿执事：`,
      `"内门师弟/师妹，这是你的${thing_name}×${quantity}"`,
      `"已扣除${yaoguangshangdian_price.toLocaleString()}源石"`,
      `"剩余源石：${updatedPlayer.源石.toLocaleString()}"`,
      `"勤修混元圣光术，早日晋升核心弟子"`
    ].join("\n");
  } else {
    successMessage = [
      `摇光圣殿执事：`,
      `"这是你的${thing_name}×${quantity}"`,
      `"已扣除${yaoguangshangdian_price.toLocaleString()}源石"`,
      `"剩余源石：${updatedPlayer.源石.toLocaleString()}"`,
      `"可在【#我的纳戒】中查看，努力修行吧"`
    ].join("\n");
  }
  
  return e.reply(successMessage);
}
async Buy_jianyunhai(e) {
    if (!verc({ e })) return false;
    const usr_qq = await channel(e.user_id.toString().replace('qg_',''));
    
    // 检查玩家是否存在
    if (!await existplayer(usr_qq)) {
        return e.reply("剑云海执事：阁下尚未踏入剑道之路，请先创建角色");
    }
    
    // 检查玩家状态
    const player = await Read_player(usr_qq);
    
    // 检查是否在剑云海位面
    //if (player.power_place != PLACE_LOCATION_MAP.界海) {
     //   return e.reply([
    //        "剑云海执事：",
     //       "此乃九天之上的剑云海，剑气纵横三万里！",
     //       "你身处凡尘俗世，如何寻得？",
      //      "需先进入剑云海位面方可寻得剑阁踪迹"
      //  ].join("\n"));
   // }
    
    // 检查是否持有剑云海令牌
   // if (!await exist_najie_thing(usr_qq, '剑云海令牌', '道具')) {
    //    return e.reply([
    //        "剑云海执事：",
    //        "此乃剑道圣地，非持剑云海令牌者不得入内！",
      //      "阁下请先获得剑云海令牌"
     //   ].join("\n"));
   // }
    
    // 检查是否为传人
    if (player.势力 !== "剑云海") {
        return e.reply([
            "剑云海执事：",
            "此乃剑道圣地，非持剑云海传人不得入内！",
        ].join("\n"));
    }
    
    // 解析商品名称和数量
    const thing = e.msg.replace('#剑云海兑换', '').trim();
    const code = thing.split('*');
    const thing_name = code[0];
    const quantity = await convert2integer(code[1]) || 1;
    
    // 查找商品
    const ifexist = data.jianyunhaishangdian.find(item => item.name == thing_name);
    if (!ifexist) {
        return e.reply([
            `剑云海执事：`,
            `"${thing_name}"？此物不在我剑云海名录之中`,
            `阁下可查阅【#剑云海剑阁】查看可兑换之物`
        ].join("\n"));
    }
    
    // 计算价格
    const jianyunhai_price = Math.trunc(ifexist.出售价 * quantity);
    
    // 检查源石是否足够
    if (player.源石 < jianyunhai_price) {
        const shortage = jianyunhai_price - player.源石;
        
        return e.reply([
            `剑云海执事：`,
            `传人阁下，此物需${jianyunhai_price}源石`,
            `您纳戒中仅有${player.源石}源石，尚缺${shortage}源石`,
            `待源石充足再来吧`
        ].join("\n"));
    }
    
    // 兑换商品
    await Add_najie_thing(usr_qq, thing_name, ifexist.class, quantity);
    await Add_源石(usr_qq, -jianyunhai_price);
    
    // 更新玩家数据
    const updatedPlayer = await Read_player(usr_qq);
    
    // 购买成功文案
    const successMessage = [
        `剑云海执事恭敬奉上剑匣：`,
        `"传人阁下，这是您要的${thing_name}×${quantity}"`,
        `"已从您的纳戒中扣除${jianyunhai_price.toLocaleString()}源石"`,
        `"您纳戒中尚有${updatedPlayer.源石.toLocaleString()}源石"`,
        `"愿阁下修为精进，早日证得无上道果"`
    ].join("\n");
    
    return e.reply(successMessage);
}
//岁云剑宫宝库兑换
async Buy_suiyunjianGong(e) {
    if (!verc({ e })) return false;
    const usr_qq = await channel(e.user_id.toString().replace('qg_',''));

    if (!await existplayer(usr_qq)) {
        return e.reply("岁云剑宫执事：阁下尚未踏入修行之路，请先创建角色");
    }

    const player = await Read_player(usr_qq);
    if (player.势力 !== "岁云剑宫") {
        return e.reply([
            "岁云剑宫执事：",
            "此乃岁云剑宫宝库，非本宫宫主不得入内。",
        ].join("\n"));
    }

    const shop = Array.isArray(data.suiyunjianGongshangdian) ? data.suiyunjianGongshangdian : [];
    const body = e.msg.replace('#剑宫兑换', '').trim();
    if (!body) {
        const { Suiyun } = await import('./Suiyun.js');
        return new Suiyun().showPalaceShop(e);
    }

    const code = body.split('*');
    const thing_name = code[0].trim();
    const quantity = await convert2integer(code[1]) || 1;
    const ifexist = shop.find(item => item.name == thing_name);
    if (!ifexist) {
        return e.reply([
            `岁云剑宫执事：`,
            `"${thing_name}"？此物不在我岁云剑宫宝库名录之中`,
            `发送【#剑宫兑换】查看可兑换之物`,
        ].join("\n"));
    }

    const price = Math.trunc(ifexist.出售价 * quantity);
    if (player.源石 < price) {
        return e.reply([
            `岁云剑宫执事：`,
            `宫主，此物需${price.toLocaleString()}源石`,
            `您纳戒中仅有${(Number(player.源石) || 0).toLocaleString()}源石，尚缺${(price - player.源石).toLocaleString()}源石`,
            `待源石充足再来吧`,
        ].join("\n"));
    }

    await Add_najie_thing(usr_qq, thing_name, ifexist.class, quantity);
    await Add_源石(usr_qq, -price);
    const updatedPlayer = await Read_player(usr_qq);

    return e.reply([
        `岁云剑宫执事恭敬奉上月华玉匣：`,
        `"宫主，这是您要的${thing_name}×${quantity}"`,
        `"已从您纳戒中扣除${price.toLocaleString()}源石"`,
        `"您纳戒中尚有${(Number(updatedPlayer.源石) || 0).toLocaleString()}源石"`,
        `"月华万古，岁云化月，愿宫主证得无上道果"`,
    ].join("\n"));
}
//出售商品
async Sell_comodities(e) {
    if (!verc({ e })) return false;
    let usr_qq = e.user_id.toString().replace('qg_','');
    usr_qq = await channel(usr_qq);
    
    //有无存档
    let ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) return false;
    
    //命令判断
    let thing = e.msg.replace('#', '');
    thing = thing.replace('出售', '');
    let code = thing.split('*');
    let thing_name = code[0]; //物品
    code[0] = parseInt(code[0]);
    let thing_amount = code[1]; //数量
    let thing_piji;
    
    //判断列表中是否存在，不存在不能卖,并定位是什么物品
    let najie = await Read_najie(usr_qq);
    if (code[0]) {
        if (code[0] > 1000) {
            try {
                thing_name = najie.仙宠[code[0] - 1001].name;
            } catch {
                e.reply('仙宠代号输入有误!');
                return false;
            }
        } else if (code[0] > 100) {
            try {
                thing_name = najie.装备[code[0] - 101].name;
                code[1] = najie.装备[code[0] - 101].pinji;
            } catch {
                e.reply('装备代号输入有误!');
                return false;
            }
        }
    }
    
    let thing_exist = await foundthing(thing_name);
    if (!thing_exist) {
        e.reply(`这方世界没有[${thing_name}]`);
        return false;
    }
    if (thing_exist.不可交易 === true || Number(thing_exist.不可交易) > 0) {
        e.reply(`【${thing_name}】属于不可交易的唯一造化，不能出售。`);
        return false;
    }
    
    let pj = {
        劣: 0,
        普: 1,
        优: 2,
        精: 3,
        极: 4,
        绝: 5,
        顶: 6,
    };
    thing_piji = pj[code[1]];
    
    if (thing_exist.class == '装备') {
        if (thing_piji) {
            thing_amount = code[2];
        } else {
            let equ = najie.装备.find(item => item.name == thing_name);
            if (!equ) {
                e.reply(`你没有[${thing_name}]这样的${thing_exist.class}`);
                return false;
            }
            for (var i of najie.装备) {
                //遍历列表有没有比那把强的
                if (i.name == thing_name && i.pinji < equ.pinji) {
                    equ = i;
                }
            }
            thing_piji = equ.pinji;
        }
    }
    
    thing_amount = await convert2integer(thing_amount);
    let x = await exist_najie_thing(
        usr_qq,
        thing_name,
        thing_exist.class,
        thing_piji
    );
    
    //判断戒指中是否存在
    if (!x) {
        //没有
        e.reply(`你没有[${thing_name}]这样的${thing_exist.class}`);
        return false;
    }
    
    //判断戒指中的数量
    if (x < thing_amount) {
        //不够
        e.reply(`你目前只有[${thing_name}]*${x}`);
        return false;
    }
    
    //数量够,数量减少,灵石增加
    await Add_najie_thing(
        usr_qq,
        thing_name,
        thing_exist.class,
        -thing_amount,
        thing_piji
    );
    
    let commodities_price;
    // 设置默认价格：如果没有出售价字段，默认12000灵石
    let unitPrice = thing_exist.出售价 ?? 12000;
    commodities_price = unitPrice * thing_amount;

    if (data.zalei.find(item => item.name == thing_name.replace(/[0-9]+/g, ''))) {
        let sell = najie.装备.find(
            item => item.name == thing_name && thing_piji == item.pinji
        );
        // 设置默认价格：如果装备没有出售价字段，默认12000灵石
        let equipPrice = sell.出售价 ?? 12000;
        commodities_price = equipPrice * thing_amount;
    }

    // ==== 命格消费层：出售价格倍率 ====
    const sellPlayer = await Read_player(usr_qq);
    const sellEffects = getMinggeEffects(sellPlayer, data.minggeList);
    const sellMult = getMinggeDirectMultiplier(sellEffects, '出售价格倍率');
    if (sellMult !== 1) {
      commodities_price = Math.floor(commodities_price * sellMult);
    }

    await Add_灵石(usr_qq, commodities_price);
    let sellMsg = `出售成功!  获得${commodities_price}灵石,还剩余${thing_name}*${x - thing_amount} `;
    if (sellMult !== 1) {
      sellMsg += `\n命格·商道通玄：售价倍率 +${Math.round((sellMult - 1) * 100)}%`;
    }
    e.reply(sellMsg);
    return false;
}}
function getDaysUntilNextGift(currentGiftType,daysRounded) {
  switch (currentGiftType) {
    case "7天":
      return 7 - daysRounded;
    case "30天":
      return 30 - daysRounded;
    case "60天":
      return 60 - daysRounded;
    case "180天":
      return 180 - daysRounded;
    case "365天":
      return 365 - daysRounded;
    default:
      return -1;
  }
}
// 添加这个辅助函数到文件合适位置
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0 && seconds > 0) {
        return `${minutes}分${seconds}秒`;
    } else if (minutes > 0) {
        return `${minutes}分`;
    } else {
        return `${seconds}秒`;
    }
}
/**
 * 检查并移除圣体秘术加成和光阴加成
 * @param {Object} player 玩家对象
 * @param {string} usr_qq 玩家QQ
 * @returns {Promise<boolean>} 是否执行了移除操作
 */
async function checkAndRemoveShengtiMishu(player, usr_qq) {
    let removed = false;
    const level = data.Level_list.find(item => item.level_id == player.level_id);
    const cleanup = resetIneligibleShengtiCultivation(player, {
        攻击: level?.基础攻击,
        防御: level?.基础防御,
        血量上限: level?.基础血量,
    });

    for (const mishuName of cleanup.removedTechniques) {
        const najieCount = await exist_najie_thing(usr_qq, mishuName, "功法");
        if (najieCount > 0) {
            await Add_najie_thing(usr_qq, mishuName, "功法", -najieCount);
        }
    }

    if (cleanup.changed) {
        console.log(
            `[圣体检查] ${usr_qq} 移除了${cleanup.removedTechniques.join('、')}及加成，` +
            `普通秘术扣除: ${cleanup.normalDeduction}，终极秘术扣除: ${cleanup.ultimateDeduction}`
        );
        removed = true;
    }
    
    // 新增：检查并移除光阴加成
    const specialTypes = ['命运', '天魔', '神魔体'];
    const isSpecialType = specialTypes.includes(player.灵根?.type);
    
    if (!isSpecialType && player.光阴加成) {
        // 计算光阴加成总值
        const guangyinTotal = player.光阴加成.攻 + player.光阴加成.防 + player.光阴加成.生;
        
        if (guangyinTotal > 0) {
            
            // 重新计算基础属性
            const baseAttack = data.Level_list.find(item => item.level_id == player.level_id).基础攻击;
            const baseDefense = data.Level_list.find(item => item.level_id == player.level_id).基础防御;
            const baseHP = data.Level_list.find(item => item.level_id == player.level_id).基础血量;
            
            player.攻击 = Math.max(baseAttack, player.攻击 - player.光阴加成.攻);
            player.防御 = Math.max(baseDefense, player.防御 - player.光阴加成.防);
            player.血量上限 = Math.max(baseHP, player.血量上限 - player.光阴加成.生);
            
            // 调整当前血量
            player.当前血量 = Math.min(player.当前血量, player.血量上限);
            
            // 移除光阴加成属性
            player.光阴加成 = { 攻: 0, 防: 0, 生: 0 };
            
            console.log(`[光阴检查] ${usr_qq} 移除了光阴加成: 攻${player.光阴加成.攻} 防${player.光阴加成.防} 生${player.光阴加成.生}`);
            removed = true;
        }
    }
    
    return removed;
}

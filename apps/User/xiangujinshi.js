import {formatXianguProgression,getXianguImmortalAccessGuide} from '../../model/xianguProgression.js';
import { plugin, verc, config, data } from '../../api/api.js';
import fs from 'fs';
import path from 'node:path';
import { PLACE_LOCATION_MAP, getLocationName } from '../../model/weimianTravel.js';
import {
  __PATH,
  existplayer,
  Write_player,
  Write_equipment,
  Write_najie,
  isNotNull,
  player_efficiency,
  get_random_fromARR,
  Read_player,
  Read_najie,
  foundthing,
  Read_equipment,
  Add_HP,
  zd_battle,
  exist_najie_thing,
  Add_修为,
  Add_灵石,
  Add_player_学习功法,
  bigNumberTransform,
  Add_血气,
  Add_寿元,
  Add_najie_thing,
  dujie,
  LevelTask,
  get_log_img,
  channel,
  sleep
} from '../../model/xiuxian.js';
import { XianguTribulation, XIANGU_REALM_ROUTES } from '../SecretPlace/xianguTribulation.js';
import {
  canBreakthroughXianguRealmHere,
  resolveXianguBreakthroughCommand,
} from '../SecretPlace/xianguTribulationSettlement.js';
import { getPlayerGrandUniverse } from '../../model/grandUniverse.js';
import {
  ensureXianqiState,
  getNextXianqiTrial,
  getXianqiStrands,
  grantXianqi,
} from '../../model/xianguXianqi.js';
import { applyQuestionFortuneCost } from '../../model/redDustFortune.js';
import {
  getXianguDaoGateState,
  getXianguDaoRuleForRealm,
  unlockXianguDaoRealm,
} from './wudaoRules.js';
import { TRIBULATION_LOCK_BUSY, withTribulationLock } from '../../model/tribulationLock.js';
import { wrapTribulationEvent } from '../../model/tribulationMessages.js';
import { canEnterQuasiEmperor } from '../../model/worldlineAuthority.js';
import {
  canCultivateExtraPath,
  getActiveExtraCultivationPaths,
  getExtraCultivationPathName,
  selectExtraCultivationPath,
  syncXianguCompanionMijing,
} from '../../model/extraCultivation.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import {
  ZUNZHE_EXTREME_RESOURCES,
  ZUNZHE_THUNDER_STAGES,
  calculateZunzheDefenseReduction,
  calculateZunzheThunderStage,
  normalizeXianguExtremeRealms,
  prepareZunzheExtremeTrial,
} from '../../model/zunzheExtreme.js';

export class xiangujinshi extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_xiangujinshi',
      dsc: '仙古今世法模块',
      event: 'message',
      priority: 600,
      rule: [
        {
          reg: '^#冲关(极境)?$',
          fnc: 'chongguan'
        },
        {
          reg: '^#道基重塑$',
          fnc: 'DaoJiReshape'
        },
        {
          reg: '^#炼化雷帝甲胄$',
          fnc: 'RefineLeidiArmor'
        }
      ],
    });
    const original = this.chongguan;
    this.chongguan = async function guardedXianguBreakthrough(e, ...args) {
      const playerId = String(await channel(String(e.user_id || '').replace('qg_', '')));
      e = wrapTribulationEvent(playerId, e);
      const result = await withPlayerMutationLock(playerId, () =>
        withTribulationLock(playerId, () => original.call(this, e, ...args), { kind: '仙古冲关' })
      );
      if (result === TRIBULATION_LOCK_BUSY) {
        return e.reply('【渡劫中】你已有一场仙古冲关正在进行，请等待结算完成。');
      }
      return result;
    };
  }

  /** #道基重塑：消耗五行本源与灵石，重塑道基，祛除一道道伤 */
  async DaoJiReshape(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');
    try {
      const player = await Read_player(usr_qq);
      const daoshang = Math.max(0, Number(player.道伤) || 0);
      if (daoshang <= 0) return e.reply('你的道基稳固无伤，无需重塑。（当前道伤为0）');
      const benyuan = Number(await exist_najie_thing(usr_qq, '五行本源', '道具')) || 0;
      if (benyuan < 5) return e.reply(`重塑道基需 5 枚五行本源，你目前只有 ${benyuan} 枚。前往九天十地·五行州可得。`);
      const costLingshi = 50000000;
      if ((Number(player.灵石) || 0) < costLingshi) return e.reply(`重塑道基还需灵石${bigNumberTransform(costLingshi)}，家底不够。`);
      await Add_najie_thing(usr_qq, '五行本源', '道具', -5);
      await Add_灵石(usr_qq, -costLingshi);
      player.道伤 = Math.max(0, Number(player.道伤) - 1);
      await Write_player(usr_qq, player);
      return e.reply([
        '【道基重塑】',
        `你以 5 枚五行本源为薪柴，引动五行大道之力重铸道基！`,
        `五行流转，道伤弥合——道伤 -1（当前：${player.道伤}）`,
        '「五行本源，重塑根基，补全修行缺陷」',
      ].join('\n'));
    } catch (error) {
      console.error('[道基重塑] 失败:', error);
      return e.reply('道基重塑时发生错误，请稍后再试。');
    }
  }

  /** #炼化雷帝甲胄：以雷池真液与雷帝宝术残篇重铸破碎甲胄（共3层，满层为雷帝战衣） */
  async RefineLeidiArmor(e) {
    if (!verc({ e })) return false;
    const usr_qq = e.user_id.toString().replace('qg_', '');
    if (!await existplayer(usr_qq)) return e.reply('玩家不存在，请先创建角色');
    try {
      const equipment = await Read_equipment(usr_qq);
      const armor = equipment.护具;
      if (armor?.name !== '破碎·雷帝甲胄') {
        return e.reply('你身上未装备「破碎·雷帝甲胄」，无法炼化。');
      }
      const layers = Math.max(0, Math.floor(Number(armor.雷帝炼化) || 0));
      if (layers >= 3) return e.reply('「破碎·雷帝甲胄」已重铸圆满，雷帝战衣大成！');
      const liquid = Number(await exist_najie_thing(usr_qq, '雷池真液', '道具')) || 0;
      const fragments = Number(await exist_najie_thing(usr_qq, '雷帝宝术残篇', '材料')) || 0;
      if (liquid < 10) return e.reply(`炼化需要 10 滴雷池真液（现有${liquid}），九天十地雷劫中可得。`);
      if (fragments < 5) return e.reply(`炼化需要 5 份雷帝宝术残篇（现有${fragments}）。`);
      const costLingshi = 50000000;
      const player = await Read_player(usr_qq);
      if ((Number(player.灵石) || 0) < costLingshi) return e.reply(`炼化还需灵石${bigNumberTransform(costLingshi)}，家底不够。`);
      await Add_najie_thing(usr_qq, '雷池真液', '道具', -10);
      await Add_najie_thing(usr_qq, '雷帝宝术残篇', '材料', -5);
      await Add_灵石(usr_qq, -costLingshi);
      const next = layers + 1;
      armor.雷帝炼化 = next;
      armor.atk = Math.floor((Number(armor.atk) || 0) + 30000000);
      armor.def = Math.floor((Number(armor.def) || 0) + 30000000);
      armor.HP = Math.floor((Number(armor.HP) || 0) + 40000000);
      armor.bao = Math.min(1, (Number(armor.bao) || 0) + 0.05);
      if (next >= 3) armor.name = '完整·雷帝甲胄';
      else if (next >= 2) armor.name = '残缺·雷帝甲胄';
      await Write_equipment(usr_qq, equipment);
      return e.reply([
        '【雷帝重铸】',
        `你引雷池真液淬炼甲胄，雷帝宝术残篇化作雷纹烙印其上！`,
        `「破碎·雷帝甲胄」炼化 ${layers}/3 → ${next}/3（攻防+3000万·生命+4000万·暴击+5%）`,
        next >= 3 ? '「雷帝战衣铸成，雷霆万钧加身！」' : '雷光流转，甲胄上的裂痕正在弥合……',
      ].join('\n'));
    } catch (error) {
      console.error('[雷帝甲胄炼化] 失败:', error);
      return e.reply('炼化时发生错误，请稍后再试。');
    }
  }

  async chongguan(e) {
    if (!e.isGroup) {
      e.reply('修仙游戏请在群聊中游玩');
      return;
    }
    
    const usr_qq = String(await channel(e.user_id.toString().replace('qg_', '')));
    const ifexistplay = await existplayer(usr_qq);
    if (!ifexistplay) {
      e.reply('玩家不存在，请先创建角色');
      return;
    }
    
    const game_action = await redis.get("xiuxian:player:" + usr_qq + ":game_action");
    if (game_action == 0) {
      e.reply("修仙：游戏进行中...");
      return;
    }
    
    const player = await Read_player(usr_qq);
    if (!isNotNull(player.Physique_id)) {
      e.reply("请先#刷新信息");
      return;
    }
             if (player.level_id < 42||player.Physique_id < 42) {
        // 辰东风格文案
        const messages = [
            `你必须成就地仙，肉身成圣后才能修炼额外体系`,
        ];
        
         e.reply(messages);
        return;
    }
     if (!canCultivateExtraPath(player, 'xiangu')) {
        // 辰东风格文案
        const activePath = getActiveExtraCultivationPaths(player).map(getExtraCultivationPathName).join('、');
        const messages = [
            `你已踏上${activePath}，人体秘境、仙古今世法与花粉进化路不可兼修！`,
        ];
         e.reply(messages);
        return;
    }
    // 高阶晋升已有专用流程，先给出当前前路，避免落入旧占位回复，
    // 也不再让普通冲关的位面压制、潜力门槛挡住只读指引。
    const progression = formatXianguProgression(player);
    if (progression) return e.reply(progression);
    // 读取位面数据
    let weimianData = {};
    try {
      const weimianPath = data.filePathMap.weimianList;
      if (fs.existsSync(weimianPath)) {
        const rawData = fs.readFileSync(weimianPath, 'utf8');
        weimianData = JSON.parse(rawData);
      } else {
        e.reply('位面数据文件不存在，无法进行祭道');
        return;
      }
    } catch (err) {
      console.error('读取位面数据失败:', err);
      e.reply('读取位面数据失败，无法进行祭道');
      return;
    }
    
    // 检查位面等级
    const weimianLevel = weimianData["诸天位面"] || 10;
    const weimianyazhi = 10 - weimianLevel;
    const targetXianguLevel = Number(player.xiangulevel_id) + 1;
    // Visitors cultivate under the laws of the universe they actually entered.
    // A missing visited host must not silently fall back to an owned universe.
    const universeOwner = player.大宇宙位置?.界主 || usr_qq;
    const grandUniverse = getPlayerGrandUniverse(data.xiaoshijie, player, universeOwner);
    if (!canBreakthroughXianguRealmHere(player, targetXianguLevel, grandUniverse)) {
      const targetName = data.xiangujinshi_list.find(item => item.level_id == targetXianguLevel)?.level || '仙道领域';
      return e.reply([
        '【仙域法则未至·仙道难成】',
        `${player.名号}欲冲击${targetName}，当前所在之地尚不足以承载此道果。`,
        '真仙至帝光仙王须身处仙域，或身处法则足够完整的玩家大宇宙。',
        player.大宇宙位置?.界主 ? '当前访问宇宙尚未具备本次目标境界的承载条件，请核对界主的法则进度。' : '',
        ...getXianguImmortalAccessGuide(player),
      ].filter(Boolean).join('\n'));
    }
    const targetingQuasiEmperor = targetXianguLevel === 21;
    const quasiEmperorGate = targetingQuasiEmperor
      ? canEnterQuasiEmperor(player, 'xiangu')
      : null;
    if (targetingQuasiEmperor && !quasiEmperorGate.ok) {
      if (quasiEmperorGate.reason === 'causal_suppression') {
        return e.reply([
          '【因果律之罚·仙古帝路压制】',
          `当前因果债已达「${quasiEmperorGate.punishment?.name || '高阶清算'}」，道果压制${quasiEmperorGate.punishment?.realmSuppression || 1}层。`,
          '先用 #纪元消债 清理因果债，待压制解除后再冲击仙古准仙帝。',
        ].join('\n'));
      }
      const guidance = quasiEmperorGate.reason === 'system'
        ? '请先将诸天古则悟至圆满，再发送 #合道 体系名（体系名不超过五字）。'
        : '你已合道立下体系，还需发送 #破王成帝劫 完成最终洗礼。';
      return e.reply(['【帝光仙王·合道在先】', guidance].join('\n'));
    }
    const crossingQuasiEmperor = targetingQuasiEmperor && quasiEmperorGate.ok;
    if (targetXianguLevel > 19 - weimianyazhi && !crossingQuasiEmperor) {
      const messages = [
        `诸天破碎，万界凋零！`,
        `时空长河断流，大道根基崩坏！`,
        `眼前所见，尽是残破的宇宙碎片，枯寂的星骸漂浮在虚无之中。`,
        `曾经辉煌的仙域已成废墟，不朽的神土化为焦土！`,
        `天地灵气枯竭，大道法则残缺不全！`,
        `在这片破败的诸天万界中（当前位面等级：${weimianLevel})`,
        `魂河和古地府等通道皆被黑暗物质侵蚀`,
        `「天地有缺，大道不全，何以承载至高强者？」`,
        `「唯有诸天复苏，万界重铸，洗尽污染，方有成就至高强者之机！」`
      ];
      e.reply(messages);
      return;
    }
   
    const next_level_id = data.xiangujinshi_list.find(item => item.level_id == (Number(player.xiangulevel_id) + 1));
    if (!next_level_id) {
      e.reply(`你已破关至最高境界`);
      return;
    }
    
    // ========== 仙道潜力检查（冲关=10点） ==========
    {
      const potentialCost = applyQuestionFortuneCost(player, 10);
      const currentPotential = player.仙道潜力 || 0;
      if (currentPotential < potentialCost) {
        e.reply([
          `【仙道潜力不足·冲关受阻】`,
          `${player.名号}欲冲破今世法境界，却感仙道潜力枯竭，大道之门紧闭！`,
          `当前仙道潜力：${currentPotential} 点`,
          `冲关所需：${potentialCost} 点`,
          `「仙古今世法深奥无比，无潜力者，今世之法遥不可及！」`
        ].join('\n'));
        return;
      }
    }
    // ========== 仙道潜力检查结束 ==========

    const isExtreme = e.msg.includes("极境");
    normalizeXianguExtremeRealms(player);
    // 搬血境突破逻辑
    if (player.xiangulevel_id === 1) {

 await this.breakthroughNormalBloodRealm(e, usr_qq, player);
      
    }
     // 搬血极境突破逻辑
    if (player.xiangulevel_id === 2) {
      if (isExtreme) {
        // 检查是否已突破搬血极境
        if (player.极境.includes("2")) {
          return e.reply("你已成就搬血极境，无需再次突破");
        }
        return await this.breakthroughExtremeBloodRealm(e, usr_qq, player);
      } else {
        return await this.breakthroughNormalDongtianRealm(e, usr_qq, player);
      }
    }
    // 洞天境突破判断
    if (player.xiangulevel_id === 3) {
      if (isExtreme) {
        // 检查是否已突破洞天极境
        if (player.极境.includes("3")) {
          return e.reply("你已成就洞天极境，无需再次突破");
        }
        return await this.breakthroughExtremeDongtianRealm(e, usr_qq, player);
      } else {
        return await this.breakthroughNormalhualingRealm(e, usr_qq, player);
      }
    }

if (player.xiangulevel_id === 4) { 
        if (isExtreme) {
            if (player.极境.includes("4")) {
                return e.reply("你已成就化灵极境，无需再次突破");
            }
            return await this.breakthroughExtremeHualingRealm(e, usr_qq, player);
        } else {
            // 普通突破到铭纹境
            return await this.breakthroughNormalMingwenRealm(e, usr_qq, player);
        }
    }
        if (player.xiangulevel_id === 5) { 
        if (isExtreme) {
            if (player.极境.includes("5")) {
                return e.reply("你已成就铭文极境，无需再次突破");
            }
            return await this.breakthroughExtremeMingwenRealm(e, usr_qq, player);
        } else {
            // 普通突破到列阵境
            return await this.breakthroughNormalLiezhenRealm(e, usr_qq, player);
        }
    }
        if (player.xiangulevel_id === 6) { 
        if (isExtreme) {
            if (player.极境.includes("6")) {
                return e.reply("你已成就列阵极境，无需再次突破");
            }
            return await this.breakthroughExtremeLiezhenRealm(e, usr_qq, player);
        } else {
            // 普通突破到尊者境
            return await this.breakthroughZunzheRealm(e, usr_qq, player);
        }
    }
     if (player.xiangulevel_id === 7) { 
        if (isExtreme) {
            if (player.极境.includes("7")) {
                return e.reply("你已成就尊者极境，无需再次突破");
            }
            return await this.breakthroughExtremeZunzheRealm(e, usr_qq, player);
        } else {
           return await this.breakthroughShenhuoRealm(e, usr_qq, player);
        }
    }
    if (player.xiangulevel_id === 8) {
        if (isExtreme) {
            return await this.breakthroughXianqiExtreme(e, usr_qq, player);
        } else {
           return await this.breakthroughZhenyiRealm(e, usr_qq, player);
        }
    }
    const commandRoute = resolveXianguBreakthroughCommand(player.xiangulevel_id, isExtreme);
    if (commandRoute) return await this[commandRoute.method](e, usr_qq, player);
    return e.reply('当前仙古境界尚未匹配到冲关路线，请使用 #修仙状态 核对境界；本次未扣除资源。');
  }

  // 普通搬血境突破
  async breakthroughNormalBloodRealm(e, usr_qq, player) {
    const baseBloodNeed = 500000;
    const actualBloodNeed = this.calculateActualCost(baseBloodNeed, player);

    if (player.血气 < actualBloodNeed) {
      const missingBlood = actualBloodNeed - player.血气;
      return e.reply([
        `【血气未足·搬血难成】`,
        `你盘坐大荒山巅，尝试引动全身精血`,
        `体内血气如溪流潺潺，未能形成海啸之势`,
        `搬血境需血气如龙，奔腾若雷鸣！`,
        `尚需${bigNumberTransform(missingBlood)}点血气`,
        `可猎杀凶兽、服用宝药积累血气`,
      ].join("\n"));
    }

    const beastBloodTypes = ["朱厌真血", "螭龙真血", "饕餮真血", "穷奇真血"];
    if (!await this.hasAtLeastOneBloodType(usr_qq, beastBloodTypes)) {
      return e.reply([
        `【根基不稳·难承大道】`,
        `你欲冲击搬血境，却感肉身孱弱`,
        `搬血境需以凶兽真血洗礼，熬炼肉身`,
        `如那石村孩童，自幼以朱厌、螭龙真血淬体`,
        `需寻得太古遗种真血（如${beastBloodTypes.join("、")}）`,
        `方可铸就无敌根基！`,
      ].join("\n"));
    }

    if (!this.hasRequiredGongfa(player, "搬血")) {
      const requiredBaoshu = ["青鳞鹰宝术", "狻猊宝术", "朱雀宝术"];
      const gongfaName = this.getRequiredGongfaName(player, "搬血");
      
      return e.reply([
        `【符文未明·神曦难生】`,
        `你尝试熔炼骨文于血，却茫然无措`,
        `搬血境需领悟原始骨文，引动血气化神曦`,
        `如那${requiredBaoshu.join("、")}等宝术`,
        `或至高无上的《原始真解》`,
        `当前可习宝术：${gongfaName}`,
      ].join("\n"));
    }

    // 消耗资源
    await Add_血气(usr_qq, -actualBloodNeed);
    await this.consumeOneBloodType(usr_qq, beastBloodTypes);

    const bloodTypeUsed = await this.getConsumedBloodType(usr_qq, beastBloodTypes);
    const gongfaName = this.getRequiredGongfaName(player, "搬血");
    const isSaintBody = ["荒古圣体", "天生至尊"].includes(player.Physique_id);

    e.reply([
      `【搬血大成·神曦冲霄】`,
      `你盘坐大荒祭坛，以${bloodTypeUsed}沐浴己身`,
      `运转《${gongfaName}》，熔炼原始骨文于血脉之中`,
      `轰！！！`,
      `${isSaintBody ? "一道金色血气狼烟冲天而起，震动苍穹" : "周身霞光万道，瑞彩千条"}`,
      `血液奔涌如雷鸣，又似洪荒凶兽咆哮`,
      `每一滴血都孕育神曦，${isSaintBody ? "金色圣血" : "赤红宝血"}中符文闪烁`,
      `单臂一晃，${isSaintBody ? "十万斤" : "八万斤"}神力自成！`,
      `搬血境——成！`,
    ].join("\n"));

    selectExtraCultivationPath(player, 'xiangu');
    player.xiangulevel_id = 2;
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
  }

  // 搬血极境突破
  async breakthroughExtremeBloodRealm(e, usr_qq, player) {
    const extremeConditions = await this.checkExtremeConditions(usr_qq, player);
    if (!extremeConditions.canBreakthrough) {
      return this.showExtremeRequirements(e, extremeConditions);
    }

    await this.consumeExtremeResources(usr_qq);
    const breakthroughResult = await this.processExtremeBreakthrough(player);
    await this.updatePlayerForExtreme(usr_qq, player, breakthroughResult);
    return this.showExtremeResult(e, breakthroughResult);
  }

  // 普通境界突破
  async normalBreakthrough(e, usr_qq, player) {
    const baseNeedExp = this.calculateBaseNeedExp(player);
    const actualNeedExp = this.calculateActualCost(baseNeedExp, player);
    
    if (player.血气 < actualNeedExp || player.修为 < actualNeedExp) {
      return e.reply([
        `突破所需资源不足！`,
        `需要血气：${bigNumberTransform(actualNeedExp)}`,
        `需要修为：${bigNumberTransform(actualNeedExp)}`,
        `当前血气：${bigNumberTransform(player.血气)}`,
        `当前修为：${bigNumberTransform(player.修为)}`
      ].join("\n"));
    }

    player.xiangulevel_id += 1;
    player.血气 -= actualNeedExp;
    player.修为 -= actualNeedExp;
    // 扣除仙道潜力（冲关=10点）
    player.仙道潜力 = Math.max(0, (player.仙道潜力 || 0) - applyQuestionFortuneCost(player, 10));
    
    const level = data.xiangujinshi_list.find(item => item.level_id == player.xiangulevel_id).level;
    await Write_player(usr_qq, player);
    
    e.reply([
      `冲关成功！`,
      `消耗血气：${bigNumberTransform(actualNeedExp)}`,
      `消耗修为：${bigNumberTransform(actualNeedExp)}`,
      `当前境界：${level}`,
    ].join("\n"));
  }

  // ========== 工具函数 ==========
  async checkExtremeConditions(usr_qq, player) {
    const isSpecialPhysique = ["荒古圣体", "天生至尊"].includes(player.Physique_id);
    const hasEnoughBloodEnergy = player.血气 >= 1000000;
    const hasThreeBloodTypes = await this.hasAtLeastThreeBloodTypes(usr_qq);

    return {
      canBreakthrough: isSpecialPhysique ? hasThreeBloodTypes : 
                      (hasEnoughBloodEnergy  && hasThreeBloodTypes),
      isSpecialPhysique,
      hasEnoughBloodEnergy,
      hasThreeBloodTypes,
      missingResources: {
        blood: Math.max(0, 1000000 - player.血气),

        bloodTypes: !hasThreeBloodTypes
      }
    };
  }

  async showExtremeRequirements(e, conditions) {
    const messages = [
      `【极境之路·条件未足】`,
      `欲达搬血极境，需满足以下条件：`,
    ];

    if (!conditions.isSpecialPhysique) {
      messages.push(
        `血气如海：${conditions.missingResources.blood > 0 ? 
          `尚缺${bigNumberTransform(conditions.missingResources.blood)}点` : '已满足'}`,
      );
    }

    messages.push(
      `三种太古遗种真血：${conditions.missingResources.bloodTypes ? '未满足' : '已满足'}`,
      `特殊体质（圣体/至尊）可减免部分要求`,
      `但必须收集至少三种太古遗种真血！`,
    );

    return e.reply(messages.join("\n"));
  }

  async consumeExtremeResources(usr_qq) {
    // 消耗血气
    await Add_血气(usr_qq, -1000000);

    // 消耗三种真血
    const beastBloodTypes = ["朱雀真血", "狻猊真血", "饕餮真血","真龙真血", "真凰真血", "鲲鹏真血", "雷帝真血", "朱厌真血", "螭龙真血"];
    let consumedCount = 0;
    for (const bloodType of beastBloodTypes) {
      if (consumedCount >= 3) break;
      if (await exist_najie_thing(usr_qq, bloodType, "道具")) {
        await Add_najie_thing(usr_qq, bloodType, "道具", -1);
        consumedCount++;
      }
    }
  }

  async processExtremeBreakthrough(player) {
    const isSaintBody = player.灵根.name === "荒古圣体";
    const isBornEmperor = player.灵根.name === "天生至尊";
    const bloodType = isSaintBody ? "金色圣血" : isBornEmperor ? "紫晶帝血" : "赤红宝血";
    
    // 随机突破加成
    const extraPower = Math.floor(Math.random() * 8000) + 2000; // 2000-10000额外力量
    const totalPower = 100000 + extraPower;

    return {
      bloodType,
      extraPower,
      totalPower,
      isSaintBody,
      isBornEmperor
    };
  }

  async updatePlayerForExtreme(usr_qq, player, result) {
    selectExtraCultivationPath(player, 'xiangu');
    player.xiangulevel_id = 2;
        if (!player.极境.includes("2")) {
      player.极境.push("2");
    }
    player.攻击加成 += 300000 ;
    player.防御加成 += 300000 ;
    player.生命加成 += 300000 ;
    if (result.isSaintBody) {
      player.圣体异象 = "血气狼烟";
    }
    if (result.isBornEmperor) {
      player.至尊骨 = "初现";
    }
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
  }

  async showExtremeResult(e, result) {
    const messages = [
      `【搬血极境·十万八千斤】`,
      `你盘坐混沌中，引动${result.bloodType}沸腾`,
      `轰！！！天地震颤，虚空崩裂！`,
      `${result.isSaintBody ? "金色血气如真龙腾空，贯穿霄汉" : 
        result.isBornEmperor ? "紫气东来三万里，帝血映照诸天" : "赤霞漫天，瑞彩千条"}`,
      `每一滴血都孕育神曦，原始符文烙印虚空`,
      `单臂一晃，十万八千斤神力自成！`,
      `打破极境，成就无敌身！`,
      `获得额外属性：`,
      `攻击+${bigNumberTransform(300000 )}`,
      `防御+${bigNumberTransform(300000 )}`,
      `生命+${bigNumberTransform(300000 )}`,
      `${result.isSaintBody ? "√ 圣体异象觉醒" : ""}`,
      `${result.isBornEmperor ? "√ 至尊骨初现" : ""}`,
    ].filter(Boolean).join("\n");
    
    return e.reply(messages);
  }
// 洞天境普通突破
async breakthroughNormalDongtianRealm(e, usr_qq, player) {
    // 突破所需资源
    const requiredResources = [
        { name: "猴儿酒", class: "丹药", quantity: 10 },
        { name: "不老泉", class: "丹药", quantity: 1 },
        { name: "太一真水", class: "道具", quantity: 1 },
        { name: "金翅大鹏鸟血肉", class: "道具", quantity: 1 } // 以斤为单位
    ];
    
    // 能量要求（参考原著十洞天突破）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

       // ==== 资源检查拦截（新增详细物品缺失提示）====
    const missingItems = [];
    for (const res of requiredResources) {
        const currentQuantity = await exist_najie_thing(usr_qq, res.name, res.class);
        if (currentQuantity < res.quantity) {
            missingItems.push({
                name: res.name,
                required: res.quantity,
                current: currentQuantity,
                deficit: res.quantity - currentQuantity
            });
        }
    }

    // 资源不足拦截
    if (missingItems.length > 0) {
        const reportLines = missingItems.map(item => 
            ` ${item.name}：需${item.required}个，缺${item.deficit}个`
        );
        
        return e.reply([
            `【资源不足·洞天难开】`,
            `开辟十洞天需以下珍稀资源：`,
            ...reportLines,
        ].join("\n"));
    }

    // 检查能量是否足够
    if (player.修为 < actualEnergyNeed || player.血气 < actualEnergyNeed) {
        return e.reply([
            `【洞天未开·神精不足】`,
            `欲开辟十口洞天，需磅礴神精支撑`,
            `尚缺修为：${bigNumberTransform(Math.max(0, actualEnergyNeed - player.修为))}`,
            `尚缺血气：${bigNumberTransform(Math.max(0, actualEnergyNeed - player.血气))}`,
            missingResources.length > 0 ? `需准备：${missingResources.join("、")}` : ""
        ].join("\n"));
    }

    // 检查是否具备原始真解（参考石昊突破关键）
    if (!player.学习的功法.includes("原始真解神引篇")) {
        return e.reply([
            `【符文未悟·洞天难筑】`,
            `十洞天需熔炼原始骨文于虚空`,
            `如石昊般参悟《原始真解神引篇》方能源源不断汲取神精`,
        ].join("\n"));
    }

    // 消耗资源
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    for (const res of requiredResources) {
        await Add_najie_thing(usr_qq, res.name, res.class, -res.quantity);
    }

    // 突破成功
    player.xiangulevel_id = 3; // 洞天境ID
    this.deductXianguPotential(player);
    player.dongtian_count = 10; // 记录十口洞天
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);

    // 突破特效（参考原著石昊十洞天异象）
    const isSaintBody = ["荒古圣体", "天生至尊"].includes(player.Physique_id);
    e.reply([
        `【十洞天开·震动八荒】`,
        `你吞服${requiredResources.map(r => r.name).join("、")}，盘坐虚神界废墟`,
        `运转《原始真解神引篇》，十口洞天如神阳横空`,
        `${isSaintBody ? "金色血气化作真龙" : "赤霞如潮"}涌入洞天`,
        `轰隆！天地震颤，虚空浮现十轮神日`,
        `每口洞天喷薄瑞彩，吞吐日月精华`,
        `如石昊当年，十洞天共鸣，威压震慑百兽`,
        `洞天境——成！`
    ].join("\n"));
}
// 洞天极境突破
async breakthroughExtremeDongtianRealm(e, usr_qq, player) {
    // 前置检查：必须已开辟十洞天
    if (player.dongtian_count !== 10) {
        return e.reply([
            `【根基未固·极境难求】`,
            `欲达洞天极境，需先开辟十口洞天`,
            `当前洞天数量：${player.dongtian_count || 0}`,
            `请先完成普通洞天突破`
        ].join("\n"));
    }



    // 能量要求（十倍于普通突破）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

     // 检查柳神本源
    const willowEssenceQty = await exist_najie_thing(usr_qq, "柳神本源", "道具");
    if (willowEssenceQty < 1) {
        return e.reply([
            `【神物缺失·极境无门】`,
            ` 柳神本源：需1份，现有${willowEssenceQty}份`,
        ].join("\n"));
    }

    // 能量检查
    if (player.修为 < actualEnergyNeed || player.血气 < actualEnergyNeed) {
        return e.reply([
            `【神精枯竭·极境难成】`,
            `重塑洞天需海量神精支撑`,
            `尚缺修为：${bigNumberTransform(actualEnergyNeed - player.修为)}`,
            `尚缺血气：${bigNumberTransform(actualEnergyNeed - player.血气)}`,
            `需准备：${extremeResources.map(r => `${r.name}×${r.quantity}`).join("、")}`
        ].join("\n"));
    }

    // 消耗资源
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);

        await Add_najie_thing(usr_qq, "柳神本源", "道具", -1);
    

    // 突破过程（参考石昊极境突破）
    const breakthroughResult = {
        hasFleshDongtian: true, // 肉身洞天
        dongtianState: "唯一洞天", // 洞天神环
        extraPower: Math.floor(Math.random() * 100000) + 50000
    };

    // 更新玩家数据
       if (!player.极境.includes("3")) {
      player.极境.push("3");
    }
    player.攻击加成 += 650000;
    player.防御加成 += 650000;
    player.生命加成 += 650000;
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);
 let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
    // 突破特效（参考原著唯一洞天异象）
    e.reply([
        `【洞天极境·洞天神环】`,
        `你引动柳神本源，十洞天轰然碰撞！`,
        `虚空扭曲，神环初现，如石昊当年重塑洞天`,
        `骨文蔓延，滋养体内新生洞天`,
        `轰！！！十洞天熔炼为不朽神环`,
        `胸口至尊骨处开辟第十一口肉身洞天`,
        `万法不侵，磨灭符文，镇压虚空`,
        `获得极境属性：`,
        ` 攻击+${bigNumberTransform(650000)}`,
        ` 防御+${bigNumberTransform(650000)}`,
        ` 生命+${bigNumberTransform(650000)}`,
        ` 洞天神环（万法不侵）`,
        ` 肉身洞天（持续滋养肉身）`
    ].join("\n"));
}
async breakthroughNormalhualingRealm(e, usr_qq, player) {
    // 三阶段总能量需求（洞天境的5倍）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

    // 检查前置境界极境（参考石昊根基）[3,7](@ref)
    if (!player.极境.includes("2") || !player.极境.includes("3")) { 
        return e.reply([
            `【道基有缺·灵性难生】`,
            `化灵境需完美根基支撑：`,
            `搬血极境：${player.极境.includes("2") ? '✓' : '✗'}`,
            `洞天极境：${player.极境.includes("3") ? '✓' : '✗'}`,
            `未达极境者，终生无望肉身成灵！`
        ].join("\n"));
    }

    // 能量检查（血气+修为双重消耗）
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        const missingBlood = Math.max(0, actualEnergyNeed - player.血气);
        const missingCultivation = Math.max(0, actualEnergyNeed - player.修为);
        return e.reply([
            `【神精枯竭·灵胎难塑】`,
            `化灵三阶段需海量本源滋养：`,
            `尚缺血气：${bigNumberTransform(missingBlood)}`,
            `缺修为：${bigNumberTransform(missingCultivation)}`,
        ].join("\n"));
    }

    // 消耗资源并突破
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    player.xiangulevel_id = 4; // 进入化灵境
    this.deductXianguPotential(player);
    player.hualing_stage = 3;  // 直接完成三阶段（因根基完美）

    // 突破特效（阴阳交汇意象）[9](@ref)
    e.reply([
        `【肉身成灵·先天神胎】`,
        `血气化神曦奔涌，洞天喷薄混沌气！`,
        `周身毛孔吞吐霞光，符文熔炼入血肉`,
        `精神真我重塑`,
        `识海清明照见本源，斩尽尘劳锁链`,
        `洞天养灵终成`,
        `十洞天轰鸣，孕育先天真灵虚影`,
        `生命层次跃迁——后天返先天！`
    ].join("\n"));
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
}

// 化灵极境突破（阴阳熬炼版）
async breakthroughExtremeHualingRealm(e, usr_qq, player) {
    // 能量需求（普通突破的20倍）[7](@ref)
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

    // 前置检查
    if (player.hualing_stage !== 3) return e.reply("需先完成化灵三阶段修行");
    if (player.极境.includes("4")) return e.reply("已臻至化灵极境");

    // 能量检查
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        return e.reply(`需储备${bigNumberTransform(actualEnergyNeed)}点血气/修为`);
    }
      // 检查柳神本源
    const kunpeng = await exist_najie_thing(usr_qq, "鲲鹏神液", "道具");
    if (kunpeng < 5) {
        return e.reply([
            `【神物缺失·极境无门】`,
            ` 鲲鹏神液：需5份，现有${kunpeng}份`,
            `太古鲲鹏精血所化，阴阳调和之圣物`,
            `极境突破，非此不可！`
        ].join("\n"));
    }
     await Add_najie_thing(usr_qq, "鲲鹏神液", "道具", -5);
    // 阴阳熬炼过程（参考用户文案）
    const yangDamage = Math.floor(player.血量上限 * 0.3); // 阳极洞灼伤30%生命
    const yinDamage = Math.floor(player.血量上限 * 0.2);  // 玄冰渊冻结20%生命
    await Add_HP(usr_qq, -yangDamage, "阳极洞焚身");
    await Add_HP(usr_qq, -yinDamage, "玄冰渊冻魂");

    // 消耗资源突破
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    player.极境.push("4");
    
    // 属性加成（侧重精神与洞天）
    player.攻击加成 += 1650000;
    player.防御加成 += 1650000; // 新增精神属性
    player.生命加成 += 1650000; // 洞天养灵强化
    this.deductXianguPotential(player);


    const spiritWeapons = [
        { name: "剑", desc: "斩断因果，破灭虚妄" },
        { name: "鼎", desc: "镇压乾坤，熔炼阴阳" },
        { name: "钟", desc: "震荡时空，唤醒真我" },
        { name: "塔", desc: "九层天阙，登临极境" },
        { name: "镜", desc: "照见本源，映现大道" }
    ];
    const selectedWeapon = spiritWeapons[Math.floor(Math.random() * spiritWeapons.length)];
     // 优化后的突破文案
    const breakthroughText = [
        `【阴阳熬炼·神曦化形】`,
        `🌞 阳极洞中·焚身炼神`,
        `太阳精火如瀑倾泻，血肉碳化又重生`,
        `符文在烈焰中淬炼，宛若仙金铸就道基`,
        `玄冰渊底·冻魂明心`,
        `万载玄冰封冻神魂，识海冻结复归清明`,
        `真我超脱虚妄束缚，道心澄澈如镜`,
        `阴阳交汇·涅槃重生`,
        `九渡生死交界，精神涅槃脱胎换骨`,
        `鲲鹏神液调和阴阳，混沌母气滋养洞天`,
        `洞天养灵·极境大成`,
        `十口洞天喷薄混沌，神曦化${selectedWeapon.name}横空`,
        `${selectedWeapon.desc}，斩灭大道枷锁！`,
        `突破成果：`,
        `• 攻击加成：+1,650,000`,
        `• 防御加成：+1,650,000`,
        `• 生命加成：+1,650,000`,
        `• 神曦化形：${selectedWeapon.name}（${selectedWeapon.desc}）`,
        `💫 化灵极境——圆满功成！`
    ].join('\n');
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
     return e.reply(breakthroughText);
}
// 普通铭文境突破（从化灵境突破）
async breakthroughNormalMingwenRealm(e, usr_qq, player) {
    // 能量需求（化灵境的8倍）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

    // 前置检查：必须完成化灵极境
    if (!player.极境.includes("4")) {
        return e.reply([
            `【符文未明·铭刻无门】`,
            `铭文境需先达化灵极境，神曦化形为基`,
            `当前化灵境界：${player.hualing_stage >= 3 ? "三阶段完成" : "未完成"}`,
            `极境状态：${player.极境.includes("4") ? "已达成" : "未达成"}`,
            `需先完成化灵极境突破！`
        ].join("\n"));
    }

    // 检查功法储备（需至少掌握3种强大宝术）
    const powerfulBaoshu = ["鲲鹏宝术", "真龙宝术", "雷帝宝术", "饕餮宝术", "朱雀宝术",  "青天鹏宝术"];
    const userBaoshu = player.学习的功法.filter(gongfa => powerfulBaoshu.includes(gongfa));
    
    if (userBaoshu.length < 3) {
        return e.reply([
            `【底蕴不足·万符难铭】`,
            `铭文境需熔炼万千符文于己身`,
            `当前掌握强大宝术：${userBaoshu.join("、") || "无"}`,
            `需至少掌握3种强大宝术`,
        ].join("\n"));
    }

    // 能量检查
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        const missingBlood = Math.max(0, actualEnergyNeed - player.血气);
        const missingCultivation = Math.max(0, actualEnergyNeed - player.修为);
        return e.reply([
            `【神精枯竭·符光黯淡】`,
            `铭刻万符需浩瀚本源支撑：`,
            `尚缺血气：${bigNumberTransform(missingBlood)}`,
            `缺修为：${bigNumberTransform(missingCultivation)}`,
            `（需汲取天地精华或炼化神物补充）`
        ].join("\n"));
    }

    // 消耗资源并突破
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    player.xiangulevel_id = 5; // 进入铭文境
    this.deductXianguPotential(player);
    player.mingwen_count = userBaoshu.length; // 记录铭刻宝术数量

    // 突破特效（万符绕体）
    e.reply([
        `【万符铭身·宝术自成】`,
        `你盘坐混沌中，引动${userBaoshu.join("、")}本源符文`,
        `轰！十洞天齐鸣，喷薄混沌气`,
        `万千原始符文如星河环绕，逐一烙印血肉骨骼`,
        `${player.神曦化形 ? player.神曦化形 + "形态神曦沸腾" : "周身神曦沸腾"}`,
        `符文化海`,
        `血液中符文流淌，骨骼上道纹自生`,
        `举手投足间宝术自成，威力暴增`,
        `铭文境——成！`,
        `当前铭刻宝术：${userBaoshu.length}种`,
    ].join("\n"));
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
}
// 铭文极境突破（需原始真解神引篇）
async breakthroughExtremeMingwenRealm(e, usr_qq, player) {
    // 能量需求（普通铭文境的25倍）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

    // 前置检查
    if (player.xiangulevel_id !== 5) return e.reply("需先突破至铭文境");
    if (player.极境.includes("5")) return e.reply("已臻至铭文极境");

    // 核心检查：必须掌握原始真解神引篇
    if (!player.学习的功法.includes("原始真解神引篇")) {
        return e.reply([
            `【大道未明·真符难炼】`,
            `铭文极境需参透万符本源，融会贯通`,
            `唯有《原始真解神引篇》可解析万符奥秘`,
            `当前掌握：${player.学习的功法.includes("原始真解神引篇") ? "已掌握" : "未掌握"}`,
        ].join("\n"));
    }


    // 能量检查
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        return e.reply(`需储备${bigNumberTransform(actualEnergyNeed)}点血气/修为引动雷劫`);
    }

    // 引动雷劫（消耗生命值模拟天罚）
    const thunderDamage = Math.floor(player.生命加成 * 0.6); // 雷劫造成60%生命伤害
    await Add_HP(usr_qq, -thunderDamage, "铭文极境雷劫");

    // 消耗资源突破
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    player.极境.push("5");
    
    // 属性加成（侧重符文与全能）
    player.攻击加成 += 1800000;
    player.防御加成 += 1500000;
    player.生命加成 += 2000000;
    player.符文掌握 = "万符归一"; // 特殊属性
    this.deductXianguPotential(player);

    // 随机生成至尊符文形态
    const supremeSymbols = ["鲲鹏", "真龙", "雷帝", "草剑", "轮回"];
    const supremeSymbol = supremeSymbols[Math.floor(Math.random() * supremeSymbols.length)];

    // 突破文案（原始真解引导万符归一）
    e.reply([
        `【真解导引·万法归一】`,
        `你运转《原始真解神引篇》，解析万符本源奥秘`,
        `神引篇·符文解析`,
        `原始真解发光，分解万千符文至最本源状态`,
        `神引篇·大道重组`,
        `以真解为引，重构符文体系，融会贯通`,
        `神引篇·万符归一`,
        `万千符文熔炼为一`,
        `轰！天地震颤，铭文极境雷劫降临！`,
        `九重雷劫过后，至尊符文化作永恒烙印`,
        `铭文极境——成！`,
    ].join("\n"));
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
}
// 普通列阵境突破（从铭文境突破）
async breakthroughNormalLiezhenRealm(e, usr_qq, player) {
    // ==== 阵纹配置 ====
    const userFormations = [
        "混沌杀阵",
        "阴阳困阵",
        "四象守护阵",
        "五行聚灵阵"
    ];
    
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

    // ==== 功法检查 ====
    if (!player.学习的功法.includes("原始真解神引篇")) {
        return e.reply([
            `【阵道无基·列阵无门】`,
            `列阵境需以原始真解解析阵道本质`,
            `《原始真解神引篇》阐释符文起源，是体内刻阵的根基`,
            `当前掌握：${player.学习的功法.includes("原始真解神引篇") ? "已掌握" : "未掌握"}`,
            `需先参悟神引篇方可构筑阵纹`
        ].join("\n"));
    }

    // ==== 极境检查 ====
    if (!player.极境.includes("5")) {
        return e.reply([
            `【符文未固·阵基难成】`,
            `列阵境需先达铭文极境，以至尊符文为阵眼`,
            `极境状态：${player.极境.includes("5") ? "已达成" : "未达成"}`,
            `（铭文极境是刻阵的能量核心）`
        ].join("\n"));
    }

    // ==== 资源检查 ====
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        const missingBlood = Math.max(0, actualEnergyNeed - player.血气);
        const missingCultivation = Math.max(0, actualEnergyNeed - player.修为);
        return e.reply([
            `【阵源枯竭·阵纹难刻】`,
            `刻阵需磅礴本源支撑：`,
            `尚缺血气：${bigNumberTransform(missingBlood)}`,
            `缺修为：${bigNumberTransform(missingCultivation)}`,
            `（可炼化灵脉补充）`
        ].join("\n"));
    }

    // ==== 突破处理 ====
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    player.xiangulevel_id = 6; // 进入列阵境
    this.deductXianguPotential(player);
    player.liezhen_type = "原始阵纹";

    // ==== 突破特效 ====
    const formationsDesc = userFormations.map(f => `${f}阵纹`).join(" + ");
    await e.reply([
        `【神引为基·万阵初成】`,
        `你运转《原始真解神引篇》，解析世间阵法本质`,
        `神引篇·阵纹拆解 → ${formationsDesc}`,
        `原始符文分解阵法本源，显化最古朴的阵道轨迹`,
        `神引篇·阵基重铸`,
        `以至尊符文为阵眼，骨骼为阵台，血脉为阵源`,
        `原始阵纹·列阵初开`,
        `胸腹间浮现混沌阵图，吞吐日月精华`,
        `一念起，杀伐困守诸阵自生！`,
        `列阵境——成！`,
    ].join("\n"));
    
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
}
// 列阵极境突破（需要万灵图）
async breakthroughExtremeLiezhenRealm(e, usr_qq, player) {
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player);

    // 前置检查
    if (player.xiangulevel_id !== 6) return e.reply("需先突破至列阵境");
    if (player.极境.includes("6")) return e.reply("已臻至列阵极境");

    // 核心检查：必须拥有万灵图
    const wanlingtuQty = await exist_najie_thing(usr_qq, "万灵图", "道具");
    if (wanlingtuQty < 1) {
        return e.reply([
            `【神物缺失·极境无门】`,
            `列阵极境需参透万灵图，演化诸天阵法`,
            `万灵图：需1份，现有${wanlingtuQty}份`,
        ].join("\n"));
    }


    // 能量检查
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        return e.reply(`需储备${bigNumberTransform(actualEnergyNeed)}点血气/修为演化诸天阵法`);
    }

    // 消耗资源突破
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);

    
    player.极境.push("6");
    
    // 属性加成（侧重阵法与领域）
    player.攻击加成 += 2950000;
    player.防御加成 += 2950000;
    player.生命加成 += 2950000;
    player.阵法掌握 = "诸天阵道"; // 特殊属性
    this.deductXianguPotential(player);


    // 突破文案（万灵图演化诸天阵法）
    e.reply([
        `【万灵衍阵·诸天臣服】`,
        `你展开万灵图，图中万灵演化诸天阵法奥秘`,
        `万灵图·阵法推演`,
        `图中飞禽走兽、山川河流皆化阵纹`,
        `万灵图·阵道本源`,
        `悟透阵法本质，天地万物皆可为阵`,
        `万灵图·极境成就`,
        `体内万千阵法融合归一，化作诸天阵道`,
        `周身自成阵法世界，一念成阵，万物为棋`,
        `列阵极境——成！`,
    ].join("\n"));
    await Write_player(usr_qq, player);
     let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
}
async breakthroughZunzheRealm(e, usr_qq, player) {
    // 能量需求（列阵境的15倍）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player) * 15;

    // 检查功法（必须学习药神秘典）
    if (!player.学习的功法.includes("药神秘典")) {
        return e.reply([
            `【丹道未通·涅槃无门】`,
            `炼制小涅槃丹需精通药神秘典`,
            `当前掌握：${player.学习的功法.includes("药神秘典") ? "已掌握" : "未掌握"}`,
            `需先寻得药神秘典并参悟`
        ].join("\n"));
    }

    // 检查炼丹材料
    const requiredMaterials = [
        { name: "白玉骨鼎", class: "道具", quantity: 1 },
        { name: "地脉灵焰", class: "道具", quantity: 1 },
        { name: "黄泉竹", class: "草药", quantity: 1 },
        { name: "龟叶兰", class: "草药", quantity: 1 },
        { name: "血凰藤", class: "草药", quantity: 1 },
        { name: "黄金草", class: "草药", quantity: 1 },
        { name: "紫星兰", class: "草药", quantity: 1 }
    ];

    // 检查材料是否足够
    const missingMaterials = [];
    for (const material of requiredMaterials) {
        const currentQty = await exist_najie_thing(usr_qq, material.name, material.class);
        if (currentQty < material.quantity) {
            missingMaterials.push({
                name: material.name,
                required: material.quantity,
                current: currentQty
            });
        }
    }

    if (missingMaterials.length > 0) {
        const materialList = missingMaterials.map(m => 
            `${m.name}：需${m.required}，现有${m.current}`
        ).join("\n");
        
        return e.reply([
            `【材料不足·丹难成】`,
            `炼制小涅槃丹需以下材料：`,
            materialList
        ].join("\n"));
    }

    // 检查能量是否足够
    if (player.血气 < actualEnergyNeed || player.修为 < actualEnergyNeed) {
        const missingBlood = Math.max(0, actualEnergyNeed - player.血气);
        const missingCultivation = Math.max(0, actualEnergyNeed - player.修为);
        return e.reply([
            `【灵力不足·丹火难继】`,
            `炼制小涅槃丹需磅礴灵力支撑：`,
            `尚缺血气：${bigNumberTransform(missingBlood)}`,
            `缺修为：${bigNumberTransform(missingCultivation)}`
        ].join("\n"));
    }

    // 消耗材料和能量
    await Add_血气(usr_qq, -actualEnergyNeed);
    await Add_修为(usr_qq, -actualEnergyNeed);
    
    for (const material of requiredMaterials) {
        await Add_najie_thing(usr_qq, material.name, material.class, -material.quantity);
    }

    // 突破过程（炼制小涅槃丹）
    let danChengRate = Math.random(); // 炼丹成功率随机因素
   if (player.occupation == '炼丹师') {
       let  加成 =  player.occupation_level*0.01;
        danChengRate +=  player.occupation_level*0.01;

      e.reply(`你以${player.occupation_level}级炼丹师之能，引动丹道法则，成丹率提升${加成*100}%`);
    }
    if (danChengRate < 0.75) {
        // 10%几率炼丹失败
        return e.reply([
            `【丹炉炸裂·功亏一篑】`,
            `你引动地脉灵焰，投入诸般神材`,
            `黄泉竹化幽冥气，血凰藤燃涅槃火`,
            `忽闻轰隆巨响，丹炉剧烈震动`,
            `药力冲突难以调和，炉鼎炸裂！`,
            `所有材料尽毁，需重新收集`,
            `当前成功率${danChengRate}`,
            `（炼丹失败，请提升炼丹师等级后重新尝试）`
        ].join("\n"));
    }

    // 炼丹成功，突破到尊者境
    player.xiangulevel_id = 7; // 进入尊者境
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);
 let equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
    // 突破成功文案
    e.reply([
        `【丹成九转·尊者临世】`,
        `你盘坐虚空，引动地脉灵焰化鼎炉`,
        `按药神秘典之法，投入黄泉竹、龟叶兰诸般神材`,
        `黄泉竹化幽冥气，血凰藤燃涅槃火，黄金草镇五行，紫星兰调阴阳`,
        `九转炼丹·涅槃重生`,
        `丹炉中霞光万道，瑞彩千条，异香弥漫三千里`,
        `一枚小涅槃丹终于成型，散发不朽神辉`,
        `服丹突破·尊者威压`,
        `丹药入腹，化作滚滚洪流冲刷四肢百骸`,
        `周身道则轰鸣，诸天阵法自行运转`,
        `一股尊者威压自然散发，震慑八荒`,
        `尊者境——成！`,
    ].join("\n"));
}
// 在breakthroughExtremeLiezhenRealm方法后添加尊者极境突破方法
async breakthroughExtremeZunzheRealm(e, usr_qq, player) {
    // 能量需求（普通尊者境的30倍）
    const baseEnergyNeed = this.calculateBaseNeedExp(player);
    const actualEnergyNeed = this.calculateActualCost(baseEnergyNeed, player) * 30;

    // 前置检查
    if (player.xiangulevel_id !== 7) return e.reply("需先突破至尊者境");
    normalizeXianguExtremeRealms(player);
    if (player.极境.includes("7")) return e.reply("已臻至尊者极境");

    // 核心检查1：必须学习五行涅槃法
    const learnedSkills = Array.isArray(player.学习的功法) ? player.学习的功法 : [];
    if (!learnedSkills.includes("五行涅槃法")) {
        return e.reply([
            `【涅槃未成·极境无门】`,
            `尊者极境需以五行涅槃法重塑根基，补全缺陷`,
            `当前掌握：未掌握`,
            `需先寻得五行涅槃法并参悟，方可重修境界`
        ].join("\n"));
    }

    // 核心检查2：位面必须是九天十地
    if (Number(player.power_place) !== PLACE_LOCATION_MAP.九天十地) {
        return e.reply([
            `【天地有缺·大道不全】`,
            `当前位面：${this.getPlaceName(player.power_place)}`,
            `天地法则残缺，无法承载境界重修之路`,
            `唯有九天十地方可成就尊者极境`,
            `请先前往九天十地再尝试突破`
        ].join("\n"));
    }

    const najie = await Read_najie(usr_qq);
    const prepared = prepareZunzheExtremeTrial(player, najie, actualEnergyNeed);
    if (prepared.missingResources?.length > 0) {
        const resourceList = prepared.missingResources.map(resource =>
            `${resource.name}：需${resource.quantity}，现有${resource.current}`
        ).join("\n");
        return e.reply([
            `【资源不足·雷劫难渡】`,
            `渡最强雷劫需以下资源：`,
            resourceList,
            `（雷池真液可减轻雷劫伤害，血魂草激发潜能，五行本源稳固根基）`
        ].join("\n"));
    }

    // 检查能量是否足够
    if (!prepared.ok) {
        return e.reply([
            `【本源不足·涅槃难继】`,
            `五行涅槃需海量本源支撑：`,
            `尚缺血气：${bigNumberTransform(prepared.missingBlood)}`,
            `缺修为：${bigNumberTransform(prepared.missingCultivation)}`
        ].join("\n"));
    }

    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, `${usr_qq}.json`));
    transaction.capture(path.join(__PATH.najie_path, `${usr_qq}.json`));
    transaction.capture(path.join(__PATH.equipment_path, `${usr_qq}.json`));

    try {
        player = prepared.player;
        await Write_najie(usr_qq, prepared.najie);
        await Write_player(usr_qq, player);

        await e.reply([
            `【五行涅槃·雷劫降临】`,
            `你运转五行涅槃法，引动五行本源重塑道基`,
            `金木水火土五行轮回，补全昔日缺陷`,
            `轰！！！九天雷劫感应而至，万里黑云压境`,
            `四重灭世神雷降临，显化真龙、仙凰、雷帝虚影`,
            `第一重雷劫：五行雷罚`
        ].join("\n"));

        const liquidReduction = ZUNZHE_EXTREME_RESOURCES[0].quantity * 0.1;
        const defReduction = calculateZunzheDefenseReduction(player.防御);
        let bloodGrassReady = true;
        let immuneNextStage = false;

        for (const stage of ZUNZHE_THUNDER_STAGES) {
            const immune = immuneNextStage;
            immuneNextStage = false;
            const result = calculateZunzheThunderStage({
                currentHP: player.当前血量,
                maxHP: player.血量上限,
                damageRate: stage.damage,
                liquidReduction,
                defenseReduction: defReduction,
                immune,
            });
            player.当前血量 = result.currentHP;

            if (bloodGrassReady && player.当前血量 / player.血量上限 < 0.3) {
                bloodGrassReady = false;
                const recoverAmount = Math.floor(player.血量上限 * 0.4);
                player.当前血量 = Math.min(player.血量上限, player.当前血量 + recoverAmount);
                immuneNextStage = true;
                await e.reply(`血魂草激发潜能，恢复${bigNumberTransform(recoverAmount)}点生命值，并暂时免疫下一次伤害！`);
            }

            const reduceInfo = defReduction > 0
                ? `（雷池减伤${Math.round(liquidReduction * 100)}% · 防御减免${Math.round(defReduction * 100)}%）`
                : `（雷池减伤${Math.round(liquidReduction * 100)}%）`;
            await e.reply([
                `${stage.desc}`,
                immune
                    ? `血魂草护持生效，本重雷劫伤害免疫`
                    : `造成${bigNumberTransform(result.damageAmount)}点伤害${reduceInfo}`,
                player.当前血量 <= 0 ? "生命垂危！" : `当前生命：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`
            ].join("\n"));

            if (player.当前血量 <= 0) {
                const lostSkill = learnedSkills[Math.floor(Math.random() * learnedSkills.length)];
                player.学习的功法 = learnedSkills.filter(skill => skill !== lostSkill);
                await Write_player(usr_qq, player);
                transaction.commit();
                return e.reply([
                    `【渡劫失败·道基受损】`,
                    `你在雷劫中重伤垂死，侥幸保得性命`,
                    `但道基受损，失去了对《${lostSkill}》的领悟`,
                    `所有渡劫资源已消耗，需重新准备后再尝试`
                ].join("\n"));
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        player.极境.push("7");
        player.五行抗性 = "圆满";
        player.法力免疫 = "初级";
        this.deductXianguPotential(player);

        const fiveElementsPowers = [
            "庚金剑气", "乙木回春", "玄水真罡", "离火神焰", "戊土圣盾"
        ];
        const acquiredPower = fiveElementsPowers[Math.floor(Math.random() * fiveElementsPowers.length)];
        player.五行神通 = acquiredPower;

        await Write_player(usr_qq, player);
        const equipment = await Read_equipment(usr_qq);
        await Write_equipment(usr_qq, equipment);
        transaction.commit();

        const realm = data.xiangujinshi_list.find(item => Number(item.level_id) === 7);
        const bonus = realm?.极境加成 || {};
        return e.reply([
            `【极境成就·万古唯一】`,
            `你熬过四重雷劫，五行涅槃法圆满功成`,
            `肉身无瑕，道基完美，远超古人定义的极境`,
            `血液中符文自生，每一滴血都孕育神曦`,
            `获得尊者极境属性：`,
            `攻击+${bigNumberTransform(Number(bonus.攻击加成) || 0)}`,
            `防御+${bigNumberTransform(Number(bonus.防御加成) || 0)}`,
            `生命+${bigNumberTransform(Number(bonus.血量加成) || 0)}`,
            `五行抗性：圆满`,
            `法力免疫：初级（抵消下一次伤害）`,
            `五行神通：${acquiredPower}`,
            `尊者极境——打破极限，成就万古最强尊者！`
        ].join("\n"));
    } catch (error) {
        transaction.rollback();
        throw error;
    }
}

// 尊者→神火 普通突破（自身修炼方式）
async breakthroughShenhuoRealm(e, usr_qq, player) {
    const baseNeed = this.calculateBaseNeedExp(player);
    const actualNeed = this.calculateActualCost(baseNeed, player) * 25;

    if (player.血气 < actualNeed || player.修为 < actualNeed) {
        const lackBlood = Math.max(0, actualNeed - player.血气);
        const lackXiuwei = Math.max(0, actualNeed - player.修为);
        return e.reply([
            `【本源不足·神火难燃】`,
            `点燃神火需海量本源支撑：`,
            `缺血气：${bigNumberTransform(lackBlood)}`,
            `缺修为：${bigNumberTransform(lackXiuwei)}`,
            ``,
            `【四种点燃方式】`,
            `① 自身修炼（当前方式）：消耗修为血气直接冲关，无额外条件`,
            `② 天材地宝：需特定丹药辅助，提高成功率`,
            `③ 道种孕育：在仙古秘境中获取极品/神话道种（#借助XX道种点燃神火），可获得1道仙气`,
            `④ 祭炼真我：三千道火祭炼肉身元神（#祭炼真我），最强但最危险`
        ].join('\n'));
    }

    // 消耗能量
    await Add_血气(usr_qq, -actualNeed);
    await Add_修为(usr_qq, -actualNeed);
    player.修为 = Math.max(0, (Number(player.修为) || 0) - actualNeed);

    // 基础成功率60% - 没有极境的修炼方式成功率较低
    const successRate = 0.6;

    e.reply([
        `【点燃神火·自身修炼】`,
        `${player.名号}盘坐虚空，以自身道行引动天地之火...`,
        `大道之火自虚空而生，缓缓灼烧肉身...`,
        `成功率：${(successRate*100).toFixed(0)}%（普通修炼方式）`
    ].join('\n'));

    await sleep(2000);

    if (Math.random() > successRate) {
        return e.reply([
            `【神火未燃·道基不稳】`,
            `${player.名号}以自身修炼点燃神火...`,
            `然而大道之火忽明忽灭，始终无法稳定！`,
            `血气修为已消耗，建议积累更多资源后再尝试`,
            ``,
            `提示：去仙古秘境获取道种火种可大幅提升成功率`
        ].join('\n'));
    }

    // 成功
    const levelData = data.xiangujinshi_list;
    const lv7 = levelData.find(l => l.level_id === 7);
    const lv8 = levelData.find(l => l.level_id === 8);
    const diff = lv8 && lv7 ? {
        攻击: Math.floor((lv8.基础攻击 - lv7.基础攻击) * 0.3),
        防御: Math.floor((lv8.基础防御 - lv7.基础防御) * 0.3),
        血气: Math.floor((lv8.基础血量 - lv7.基础血量) * 0.3)
    } : { 攻击: 6000000, 防御: 6000000, 血气: 6000000 };

    player.xiangulevel_id = 8;
    this.deductXianguPotential(player);
    player.攻击 += diff.攻击;
    player.防御 += diff.防御;
    player.血气上限 += diff.血气;
    player.血气 = player.血气上限;
    normalizeXianguExtremeRealms(player);
    player.极境 = player.极境.filter(levelId => levelId !== '8');
    player.xiangu_xianqi = 0;
    delete player.xiangu_xianqi_detail;
    delete player.xiangu_xianqi_three_complete;
    ensureXianqiState(player);

    // 普通冲关必须重建神火记录，不继承回炉前的道种、技能或神火极境。
    player.xiangu_shenhuo = {
        已点燃: true,
        点燃方式: '自身修炼',
        神火品质: '下品',
        神火名称: '自身修炼·凡火',
        属性倍率: 0.3,
        点燃时间: new Date().toISOString(),
        属性加成: {},
        突破前境界: 7,
        突破后境界: 8,
        极境达成: false
    };

    await Write_player(usr_qq, player);

    return e.reply([
        `【神火点燃·自身修炼·成功！】`,
        `${player.名号}以自身道行引燃神火！`,
        ``,
        `攻击 +${bigNumberTransform(diff.攻击)}`,
        `防御 +${bigNumberTransform(diff.防御)}`,
        `血气 +${bigNumberTransform(diff.血气)}`,
        ``,
        `神火品质：下品（×0.3倍）`,
        `仙气：无（自身修炼方式不可修出仙气）`,
        ``,
        `提示：前往仙古秘境通过 #祭炼真我 或 #借助极品道种点燃神火 可修出仙气`
    ].join('\n'));
}

// 神火境内凝聚第二、第三道仙气；仙气是极境成果，不随境界突破赠送。
async breakthroughXianqiExtreme(e, usr_qq, player) {
    const trial = getNextXianqiTrial(player);
    if (!trial.allowed) {
        if (trial.reason === 'first_strand_required') {
            return e.reply([
                `【神火极境·仙气未生】`,
                `第二道仙气必须以第一道仙气为引。`,
                `第一道仙气只可在点燃神火时，通过极品仙种或三千道火修出。`,
                `普通道种、自身苦修与丹药路线不会补发仙气。`
            ].join('\n'));
        }
        if (trial.reason === 'complete') {
            return e.reply('【神火绝巅】三道仙气已经圆满，无需再次冲击极境');
        }
        return e.reply('仙气极境只能在神火境内修炼；踏入真一后不可回头补修');
    }

    const baseNeed = this.calculateBaseNeedExp(player);
    const actualNeed = this.calculateActualCost(baseNeed, player) * trial.costMultiplier;
    if (player.血气 < actualNeed || player.修为 < actualNeed) {
        return e.reply([
            `【本源不足·${trial.name}难成】`,
            `凝聚${trial.name}需在神火境内再破一次极限。`,
            `缺血气：${bigNumberTransform(Math.max(0, actualNeed - player.血气))}`,
            `缺修为：${bigNumberTransform(Math.max(0, actualNeed - player.修为))}`
        ].join('\n'));
    }

    const equipment = await Read_equipment(usr_qq);
    await Add_血气(usr_qq, -actualNeed);
    await Add_修为(usr_qq, -actualNeed);
    player.血气 = Math.max(0, (Number(player.血气) || 0) - actualNeed);
    player.修为 = Math.max(0, (Number(player.修为) || 0) - actualNeed);

    const currentMaxHp = Number(player.血量上限 || player.血气上限) || 1;
    player.血量上限 = currentMaxHp;
    player.当前血量 = currentMaxHp;

    const tribulation = new XianguTribulation();
    const result = await tribulation.runXianqiCondensation(e, player, trial.targetStrand, equipment);
    if (!result.success) {
        player.当前血量 = Math.max(1, Math.floor(currentMaxHp * 0.1));
        await Write_player(usr_qq, player);
        return e.reply([
            `【神火极境·冲击失败】`,
            `${trial.name}未能凝聚，境界与现有仙气得以保住。`,
            `本次修为、血气已经消耗，当前血量仅余一成。`
        ].join('\n'));
    }

    const granted = grantXianqi(player, `神火极境·${trial.name}试炼`);
    if (!granted) {
        await Write_player(usr_qq, player);
        return e.reply('仙气状态已发生变化，本次试炼未重复发放仙气');
    }

    if (trial.targetStrand === 3) {
        player.xiangu_xianqi_three_complete = true;
    }
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);

    return e.reply([
        `【神火极境·${trial.name}凝聚成功！】`,
        `${player.名号}仍立于神火境，却在极限之上再进一步。`,
        `当前仙气：${getXianqiStrands(player)}/3道`,
        trial.targetStrand === 3
            ? `三道仙气圆满，神火境绝巅道果已成！`
            : `可再次使用 #冲关极境，挑战第三道仙气。`,
        `也可使用 #冲关，放弃继续打磨并突破真一境。`
    ].join('\n'));
}

// 虚道极境·九天十地劫（境界内独立试炼：渡后仍虚道，可逆伐斩我）
async breakthroughJiutianShidiExtreme(e, usr_qq, player) {
    if (player.xiangu_jiutian_shidi) {
        return e.reply([
            `【虚道极境】九天十地劫已经渡过。`,
            `境界仍是虚道，却已可逆伐斩我。`,
            `可随时使用 #冲关 冲击斩我境。`
        ].join('\n'));
    }
    const actualNeed = this.calculateActualCost(this.calculateBaseNeedExp(player), player) * 30;
    if (player.血气 < actualNeed || player.修为 < actualNeed) {
        return e.reply([
            `【本源不足·九天十地劫难成】`,
            `引动九天十地劫需磅礴本源，`,
            `缺血气：${bigNumberTransform(Math.max(0, actualNeed - player.血气))}`,
            `缺修为：${bigNumberTransform(Math.max(0, actualNeed - player.修为))}`
        ].join('\n'));
    }

    const equipment = await Read_equipment(usr_qq);
    await Add_血气(usr_qq, -actualNeed);
    await Add_修为(usr_qq, -actualNeed);
    player.血气 = Math.max(0, (Number(player.血气) || 0) - actualNeed);
    player.修为 = Math.max(0, (Number(player.修为) || 0) - actualNeed);

    const currentMaxHp = Number(player.血量上限 || player.血气上限) || 1;
    player.血量上限 = currentMaxHp;
    player.当前血量 = currentMaxHp;

    const tribulation = new XianguTribulation();
    const result = await tribulation.runJiutianShidiTrial(e, player, equipment);
    if (!result.success) {
        player.当前血量 = Math.max(1, Math.floor(currentMaxHp * 0.1));
        await Write_player(usr_qq, player);
        return e.reply([
            `【虚道极境·冲击失败】`,
            `九天十地劫未能渡过，境界得以保住，道躯却遭重创。`,
            `本次修为、血气已经消耗，当前血量仅余一成。`
        ].join('\n'));
    }

    player.xiangu_jiutian_shidi = true;
    player.xiangu_nifa_zhanwo = true;
    if (result.reward === '雷池真液') {
        await Add_najie_thing(usr_qq, '雷池真液', '道具', 1);
    }
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);

    return e.reply([
        `【虚道极境·九天十地劫渡尽！】`,
        ``,
        `${player.名号}仍立于虚道境，却已可逆伐斩我境强者。`,
        result.routeText || '',
        ``,
        `雷池真液精粹 +1`,
        `可继续使用 #冲关 冲击斩我境；`,
        `踏入斩我境后还可 #冲关极境 挑战斩仙铡刀劫。`
    ].join('\n'));
}

// 斩我极境·斩仙铡刀劫（境界内独立试炼：渡后仍斩我，臻至斩我巅峰）
async breakthroughZhanxianExtreme(e, usr_qq, player) {
    if (player.xiangu_zhanxian_zhadao) {
        return e.reply([
            `【斩我极境】斩仙铡刀劫已经渡过。`,
            `外来不朽印记尽斩，臻至斩我境巅峰。`,
            `可随时使用 #冲关 冲击遁一境。`
        ].join('\n'));
    }
    const actualNeed = this.calculateActualCost(this.calculateBaseNeedExp(player), player) * 30;
    if (player.血气 < actualNeed || player.修为 < actualNeed) {
        return e.reply([
            `【本源不足·斩仙铡刀劫难成】`,
            `引动葬地雷渊的斩仙铡刀劫需磅礴本源，`,
            `缺血气：${bigNumberTransform(Math.max(0, actualNeed - player.血气))}`,
            `缺修为：${bigNumberTransform(Math.max(0, actualNeed - player.修为))}`
        ].join('\n'));
    }

    const equipment = await Read_equipment(usr_qq);
    await Add_血气(usr_qq, -actualNeed);
    await Add_修为(usr_qq, -actualNeed);
    player.血气 = Math.max(0, (Number(player.血气) || 0) - actualNeed);
    player.修为 = Math.max(0, (Number(player.修为) || 0) - actualNeed);

    const currentMaxHp = Number(player.血量上限 || player.血气上限) || 1;
    player.血量上限 = currentMaxHp;
    player.当前血量 = currentMaxHp;

    const tribulation = new XianguTribulation();
    const result = await tribulation.runZhanxianZhandaoTrial(e, player, equipment);
    if (!result.success) {
        player.当前血量 = Math.max(1, Math.floor(currentMaxHp * 0.1));
        await Write_player(usr_qq, player);
        return e.reply([
            `【斩我极境·冲击失败】`,
            `斩仙铡刀劫未能渡过，境界得以保住，道躯却遭重创。`,
            `本次修为、血气已经消耗，当前血量仅余一成。`
        ].join('\n'));
    }

    player.xiangu_zhanxian_zhadao = true;
    player.xiangu_zhanwo_peak = true;
    if (result.reward === '雷池真液') {
        await Add_najie_thing(usr_qq, '雷池真液', '道具', 1);
    }
    this.deductXianguPotential(player);
    await Write_player(usr_qq, player);

    return e.reply([
        `【斩我极境·斩仙铡刀劫渡尽！】`,
        ``,
        `${player.名号}臻至斩我境巅峰，已可踏入遁一却主动压制。`,
        result.routeText || '',
        ``,
        `雷池真液精粹 +1`,
        `可继续使用 #冲关 在战场血战中冲击遁一境。`
    ].join('\n'));
}

// 神火→真一 普通突破
async breakthroughZhenyiRealm(e, usr_qq, player) {
    return this.breakthroughUpperRealm(e, usr_qq, player);
}

// 神火→真一及后续境界：只推进境界，不再自动补发仙气。
async breakthroughUpperRealm(e, usr_qq, player) {
    const fromLevelId = Number(player.xiangulevel_id);
    const breakthrough = XIANGU_REALM_ROUTES[fromLevelId];
    if (!breakthrough) return e.reply('当前境界没有对应的仙古今世法渡劫');
    ensureXianqiState(player);

    // 仙古上位冲关先圆满当前境界对应的独立法则，规则与遮天渡劫的道途门槛一致。
    const daoRule = getXianguDaoRuleForRealm(fromLevelId);
    if (daoRule) {
      const gate = getXianguDaoGateState(player, fromLevelId);
      unlockXianguDaoRealm(player, fromLevelId);
      if (!gate.ok) {
        await Write_player(usr_qq, player);
        return e.reply([
          `【${daoRule.name}未圆·冲关受阻】`,
          `${player.名号}欲冲击${breakthrough.targetName}，却感${daoRule.name}尚有残缺。`,
          `当前进度：${gate.exp}/${daoRule.targetExp}（${gate.stage.name}）`,
          `需将${daoRule.name}修至【圆满】，方可继续前行。`,
          '发送#悟道参悟仙古法则，#我的道途查看完整进度。',
        ].join('\n'));
      }
    }

    const baseNeed = this.calculateBaseNeedExp(player);
    const actualNeed = this.calculateActualCost(baseNeed, player) * breakthrough.costMultiplier;

    if (player.血气 < actualNeed || player.修为 < actualNeed) {
        return e.reply([
            `【本源不足·${breakthrough.targetName}难成】`,
            `突破${breakthrough.targetName}需磅礴本源，`,
            `缺血气：${bigNumberTransform(Math.max(0, actualNeed - player.血气))}`,
            `缺修为：${bigNumberTransform(Math.max(0, actualNeed - player.修为))}`
        ].join('\n'));
    }

    const equipment = await Read_equipment(usr_qq);
    await Add_血气(usr_qq, -actualNeed);
    await Add_修为(usr_qq, -actualNeed);
    // Add_* 会独立写档；同步本地对象，避免后续 Write_player 把消耗覆盖回去。
    player.血气 = Math.max(0, (Number(player.血气) || 0) - actualNeed);
    player.修为 = Math.max(0, (Number(player.修为) || 0) - actualNeed);

    const currentMaxHp = Number(player.血量上限 || player.血气上限) || 1;
    player.血量上限 = currentMaxHp;
    player.当前血量 = currentMaxHp;
    const tribulation = new XianguTribulation();
    const result = await tribulation.runRealmBreakthrough(e, player, { fromLevelId, equipment });
    if (!result.success) {
        const maxHp = Number(player.血量上限 || player.血气上限) || 1;
        player.当前血量 = Math.max(1, Math.floor(maxHp * 0.1));
        await Write_player(usr_qq, player);
        return e.reply([
            `【冲关失败·${breakthrough.targetName}未成】`,
            `${player.名号}未能熬过本次劫难，境界得以保住，但道躯遭受重创。`,
            `修为与血气已经消耗，当前血量仅余一成。`
        ].join('\n'));
    }

    const levelData = data.xiangujinshi_list;
    const currentLevel = levelData.find(l => Number(l.level_id) === fromLevelId);
    const targetLevel = levelData.find(l => Number(l.level_id) === breakthrough.targetLevelId);
    const diff = currentLevel && targetLevel ? {
        攻击: targetLevel.基础攻击 - currentLevel.基础攻击,
        防御: targetLevel.基础防御 - currentLevel.基础防御,
        血气: targetLevel.基础血量 - currentLevel.基础血量
    } : { 攻击: 20000000, 防御: 20000000, 血气: 20000000 };

    player.xiangulevel_id = breakthrough.targetLevelId;
    const companionMijing = syncXianguCompanionMijing(player);
    this.deductXianguPotential(player);
    player.攻击 = (Number(player.攻击) || 0) + diff.攻击;
    player.防御 = (Number(player.防御) || 0) + diff.防御;
    player.血气上限 = (Number(player.血气上限) || 0) + diff.血气;
    player.血量上限 = currentMaxHp + diff.血气;
    player.当前血量 = player.血量上限 || player.血气上限;

    if (breakthrough.targetLevelId === 11) player.xiangu_tianshen_deferred_tribulation = true;
    if (breakthrough.targetLevelId === 12) {
        player.xiangu_yishenweizhong = true;
        player.xiangu_tianshen_deferred_tribulation = false;
    }
    if (breakthrough.targetLevelId === 13) {
        player.xiangu_zhanwo_mingdao = true;
        player.xiangu_leiling = Math.max(Number(player.xiangu_leiling) || 0, Number(result.thunderSpirits) || 0);
    }
    if (breakthrough.targetLevelId === 14) player.xiangu_dunyi_tribulation = true;
    if (breakthrough.targetLevelId === 15) {
        player.xiangu_zhizun_road = true;
        player.xiangu_zhizun_external_dao_flaw = Boolean(result.externalDaoFlaw);
    }

    if (result.reward === '雷池真液') {
        await Add_najie_thing(usr_qq, '雷池真液', '道具', 1);
    }

    await Write_player(usr_qq, player);
    await Write_equipment(usr_qq, equipment);
    const refreshedPlayer = await Read_player(usr_qq);
    refreshedPlayer.当前血量 = refreshedPlayer.血量上限;
    await Write_player(usr_qq, refreshedPlayer);

    const routeLine = result.routeText || (result.noTribulation
        ? '此次晋阶没有雷劫，积蓄的劫力延后至以身为种时爆发。'
        : result.path === '以身为种'
            ? '以身为种成功，体内众门开启，上苍天谴未能抹去真我。'
            : `劫难渡尽，${breakthrough.targetName}道果稳固。`);
    const rewardLine = result.reward === '雷池真液' ? '雷池真液精粹 +1' : null;
    const companionMijingLevel = data.Levelmijing_list.find(
      level => Number(level.level_id) === Number(companionMijing.targetLevelId)
    );
    const companionMijingLine = companionMijing.changed
      ? `人体秘境同步开启：${companionMijingLevel?.level || `秘境 ${companionMijing.targetLevelId}`}`
      : null;
    const lines = [
        `【突破·${breakthrough.targetName}·成功！】`,
        `${player.名号}正式踏入${breakthrough.targetName}！`,
        routeLine,
        ``,
        `攻击 +${bigNumberTransform(diff.攻击)}`,
        `防御 +${bigNumberTransform(diff.防御)}`,
        `血气 +${bigNumberTransform(diff.血气)}`,
        ``,
        `仙气数：${getXianqiStrands(player)}道`
    ];
    if (companionMijingLine) lines.push(companionMijingLine);
    if (result.thunderSpirits) lines.push(`雷灵：${player.xiangu_leiling}头`);
    if (rewardLine) lines.push(rewardLine);
    if (result.revived) lines.push('本次渡劫曾触发功法复活；致死劫数被避开，后续劫数才会触发功法被动。');
    return e.reply(lines.join('\n'));
}

getPlaceName(power_place) {
    return getLocationName(power_place) || `未知位面(${power_place})`;
}
  // ========== 辅助工具函数 ==========
  async hasAtLeastOneBloodType(usr_qq, bloodTypes) {
    for (const bloodType of bloodTypes) {
      if (await exist_najie_thing(usr_qq, bloodType, "道具")) {
        return true;
      }
    }
    return false;
  }

  async hasAtLeastThreeBloodTypes(usr_qq) {
    const beastBloodTypes = ["朱雀真血", "狻猊真血", "饕餮真血", "雷帝真血", "朱厌真血", "螭龙真血"];
    let count = 0;
    for (const bloodType of beastBloodTypes) {
      if (await exist_najie_thing(usr_qq, bloodType, "道具")) {
        count++;
        if (count >= 3) return true;
      }
    }
    return false;
  }

  async consumeOneBloodType(usr_qq, bloodTypes) {
    for (const bloodType of bloodTypes) {
      if (await exist_najie_thing(usr_qq, bloodType, "道具")) {
        await Add_najie_thing(usr_qq, bloodType, "道具", -1);
        return bloodType;
      }
    }
    return null;
  }

  async getConsumedBloodType(usr_qq, bloodTypes) {
    for (const bloodType of bloodTypes) {
      if (!await exist_najie_thing(usr_qq, bloodType, "道具")) {
        return bloodType;
      }
    }
    return bloodTypes[0];
  }

  calculateBaseNeedExp(player) {
    // 根据玩家当前等级计算基础需求
    return 500000 * Math.pow(2, player.xiangulevel_id - 1);
  }

  calculateActualCost(baseCost, player) {
    // 考虑各种修正因素后的实际消耗
    return applyQuestionFortuneCost(player, baseCost);
  }

  // 冲关成功时扣除仙道潜力（与 chongguan 门控检查保持一致：applyQuestionFortuneCost(player, 10)）
  deductXianguPotential(player) {
    player.仙道潜力 = Math.max(0, (Number(player.仙道潜力) || 0) - applyQuestionFortuneCost(player, 10));
  }

  hasRequiredGongfa(player, realm) {
    if (realm === "搬血") {
      const bloodRealmBaoshu = [
        "青鳞鹰宝术", "狻猊宝术", "朱雀宝术",
        "饕餮宝术", "穷奇宝术", "朱厌宝术"
      ];
      
      const fullAncientScriptures = [
        "原始真解", "鲲鹏宝术", "真凰宝术", "雷帝宝术",
        "草字剑诀", "六道轮回天功", "柳神法"
      ];

      for (const gongfa of player.学习的功法 || []) {
        if (bloodRealmBaoshu.includes(gongfa) || fullAncientScriptures.includes(gongfa)) {
          return true;
        }
      }
      return false;
    }
    return true;
  }

  getRequiredGongfaName(player, realm) {
    if (realm === "搬血") {
      const fullAncientScriptures = [
        "原始真解", "鲲鹏宝术", "真凰宝术", "雷帝宝术"
      ];
      
      for (const gongfa of player.学习的功法 || []) {
        if (fullAncientScriptures.includes(gongfa)) {
          return gongfa;
        }
      }

      const bloodRealmBaoshu = [
        "青鳞鹰宝术", "狻猊宝术", "朱雀宝术"
      ];
      
      for (const gongfa of player.学习的功法 || []) {
        if (bloodRealmBaoshu.includes(gongfa)) {
          return gongfa;
        }
      }
      
      return "青鳞鹰宝术";
    }
    return "未知功法";
  }
}

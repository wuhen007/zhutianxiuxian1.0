import path from 'node:path';
import { plugin, verc, data } from '../../api/api.js';
import config from '../../model/Config.js';
import {
  __PATH,
  Add_najie_thing,
  Read_equipment,
  Read_player,
  Write_equipment,
  Write_player,
  bigNumberTransform,
  channel,
  exist_najie_thing,
  existplayer,
  player_efficiency,
  sleep,
} from '../../model/xiuxian.js';
import {
  canCultivateExtraPath,
  getActiveExtraCultivationPaths,
  getExtraCultivationPathName,
  isCultivatingExtraPath,
  selectExtraCultivationPath,
} from '../../model/extraCultivation.js';
import {
  FLOWER_POLLEN_MEDIA,
  FLOWER_FRUITS,
  FLOWER_ANCESTOR_SEED_NAME,
  SUPER_FLOWER_FRUIT_NAME,
  FLOWER_ANCESTOR_BREEDING_MS,
  FLOWER_ANCESTOR_DORMANT_MS,
  FLOWER_ANCESTOR_WUDAO_LIMIT,
  FLOWER_TRIBULATION_WAVES_PER_STAGE,
  FLOWER_TRIBULATION_WAVE_INTERVAL_MS,
  FLOWER_TRIBULATION_ERA_DIFFICULTY,
  applyAncestorCall,
  applyFlowerTribulationOutcome,
  calcFlowerTribulationMitigation,
  calculateFlowerTribulationWave,
  checkGongfaGate,
  completeFlowerExtremeTrial,
  ensureFlowerPollenState,
  getBestBreathingMethod,
  getFlowerEvolutionChance,
  getFlowerEvolutionCost,
  getFlowerDaoWoundState,
  getFlowerEraProfile,
  getFlowerTribulationBaseAtk,
  getNextFlowerExtremeTrial,
  getPollenPollutionState,
  getRequiredPollenQuality,
  purifyPollution,
  resolveFlowerEvolution,
  calculateFlowerDaoGain,
  getFlowerDaoAttemptCost,
  getFlowerDaoEquipmentBonuses,
  getFlowerDaoGateState,
  getFlowerBranchProfile,
  getFlowerBreakthroughRule,
  recordFlowerDaoAttempt,
  resolveFlowerBreakthrough,
  getFlowerTribulationCost,
  getFlowerTribulationGateState,
  getFlowerRootState,
  consumeFlowerFruit,
  consumeSuperFlowerFruit,
  beginFlowerAncestorBreeding,
  settleFlowerAncestorSeed,
  getFlowerAncestorSeedState,
  applyAncestorWudao,
  repairFlowerRoot,
  recordFlowerBreathingPractice,
} from '../../model/flowerPollenPath.js';
import { cooldownRevivalGongfas, resolveInteractiveGongfaRevival } from '../../model/tribulationRevival.js';
import { checkPlaneRealmLaw } from '../../model/planeRealmLaw.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import { canEnterQuasiEmperor } from '../../model/worldlineAuthority.js';
import { getShanghaiDateKey } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { TRIBULATION_LOCK_BUSY, withTribulationLock } from '../../model/tribulationLock.js';
import { calculateMinggePotentialCost, getMinggeEffects } from '../../model/mingge.js';
import { applyQuestionFortuneCost } from '../../model/redDustFortune.js';
import { getTitleWudaoBonus } from '../../model/titleSystem.js';
import { getKongtongModifiers, getPassiveTribulationDamageMultiplier } from '../../model/innateTreasure.js';
import { getPlayerPlaneName } from '../../model/planeCoords.js';
import { isFlowerAncestorSeedOwner } from '../../model/shengxuOpportunity.js';
import {
  consumePlayerLifespan,
  formatSignedPercent,
  getAptitudeWudaoBonus,
  getAvailableLifespan,
  getPhysiqueWudaoBonus,
  getTechniqueWudaoProfile,
  getWudaoLifespanCost,
} from './wudaoRules.js';
import {
  awardWudaoGongfaProficiency,
  getWudaoGongfaReduction,
} from '../../model/gongfaProficiency.js';
import {
  ensureDaoHeart,
  getDaoHeartWudaoCostMultiplier,
  getDaoHeartWudaoGainMultiplier,
} from '../../model/daoHeart.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';

const MEDIA_BY_QUALITY = Object.entries(FLOWER_POLLEN_MEDIA)
  .sort((a, b) => a[1].quality - b[1].quality);

function realmName(levelId) {
  return data.huafen_list.find(item => Number(item.level_id) === Number(levelId))?.level || '未知境界';
}

function getCurrentEraIndex() {
  const set = config.getConfig?.('xiuxian', 'xiuxian');
  return set?.Era?.current?.index ?? 2;
}

function selectedFlowerPath(player) {
  return isCultivatingExtraPath(player, 'huafen');
}

async function resolveUserId(e) {
  return channel(e.user_id.toString().replace('qg_', ''));
}

async function refreshAttributes(userId) {
  const equipment = await Read_equipment(userId);
  await Write_equipment(userId, equipment);
}

async function hasOwnedFlowerAncestorSeed(userId) {
  return await isFlowerAncestorSeedOwner(userId)
    && Number(await exist_najie_thing(userId, FLOWER_ANCESTOR_SEED_NAME, '道具')) > 0;
}

async function buildFlowerDaoGainContext(userId, player, ancestorSeed) {
  const eraIndex = getCurrentEraIndex();
  const stoneJar = Boolean(player.圣墟唯一机缘?.石罐本体);
  const minggeEffects = getMinggeEffects(player, data.minggeList);
  const technique = getTechniqueWudaoProfile(player.学习的功法, {
    gongfaList: data.gongfa_list,
    timeGongfaList: data.timegongfa_list,
    dijingList: data.dijingList,
  });
  const equipmentBonuses = getFlowerDaoEquipmentBonuses(await Read_equipment(userId));
  const titleBonus = getTitleWudaoBonus(player);
  const rootRaw = Number(player.灵根?.悟道加成 ?? player.灵根?.eff) || 0;
  const rootBonus = Math.max(-0.5, Math.min(0.5, Math.abs(rootRaw) > 1 ? rootRaw / 100 : rootRaw));
  const physiqueBonus = getPhysiqueWudaoBonus(player.灵根?.name) || rootBonus;
  const kongtong = getKongtongModifiers(player);
  const imperialWudao = kongtong.decree?.type === '修炼'
    && kongtong.decree.plane === getPlayerPlaneName(player);

  ensureDaoHeart(player);
  return {
    eraIndex,
    stoneJar,
    minggeEffects,
    technique,
    equipmentBonuses,
    titleBonus,
    imperialWudao,
    gainOptions: {
      eraIndex,
      ancestorSeed,
      stoneJar,
      physiqueBonus,
      aptitudeBonus: getAptitudeWudaoBonus(player.天资等级),
      techniqueBonus: technique.bonus,
      minggeBonus: Number(minggeEffects.悟道收益) || 0,
      titleBonus,
      equipmentBonus: equipmentBonuses.equipment,
      treasureBonus: equipmentBonuses.treasure + (imperialWudao ? 0.5 : 0) + (kongtong.wudaoMultiplier - 1),
      worldBonus: Number(player.超维星界悟道加成) || 0,
      daoHeartMultiplier: getDaoHeartWudaoGainMultiplier(player),
    },
  };
}

function getFlowerDaoTraceProfile(player) {
  const used = Math.min(50, Math.max(0, Math.floor(Number(player.先天道痕) || 0)));
  return { used, bonus: used * 0.006, multiplier: 1 + used * 0.006 };
}

function applyFlowerDaoTraceBonus(player, gain) {
  const traces = getFlowerDaoTraceProfile(player);
  if (!traces.used) return traces;
  player.先天道痕 -= traces.used;
  gain.bonuses.traces = traces.bonus;
  gain.gain = Math.max(1, Math.floor(gain.gain * traces.multiplier));
  gain.multiplier *= traces.multiplier;
  return traces;
}

export class FlowerPollenPath extends plugin {
  constructor() {
    super({
      name: '花粉进化路',
      dsc: '圣墟花粉路进化、隐患与极境玩法',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#(?:花粉路|花粉进化路)$', fnc: 'status' },
        { reg: '^#花粉境界$', fnc: 'realms' },
        { reg: '^#踏上花粉路$', fnc: 'enterPath' },
        { reg: '^#感应异变$', fnc: 'senseMutation' },
        { reg: '^#进化(?:\\s+.+)?$', fnc: 'evolve' },
        { reg: '^#极尽蜕变$', fnc: 'extreme' },
        { reg: '^#花粉悟道$', fnc: 'flowerDao' },
        { reg: '^#祖种悟道$', fnc: 'ancestorWudao' },
        { reg: '^#(?:孕育超级异果|祖种孕育)$', fnc: 'breedAncestorFruit' },
        { reg: '^#花粉渡劫$', fnc: 'flowerTribulation' },
        { reg: '^#花粉渡劫状态$', fnc: 'flowerTribulationStatus' },
        { reg: '^#净化隐患$', fnc: 'purify' },
        { reg: '^#花粉根基$', fnc: 'flowerRootStatus' },
        { reg: '^#服用异果(?:\\s+.+)?$', fnc: 'eatFlowerFruit' },
        { reg: '^#服用超级异果$', fnc: 'eatSuperFlowerFruit' },
        { reg: '^#重塑进化根基(?:\\s+.+)?$', fnc: 'repairFlowerRoot' },
      ],
    });
    this.task = [{
      cron: '*/20 * * * * *',
      name: 'FlowerAncestorSeedTask',
      fnc: () => this.tickAncestorSeed(),
    }];
    this.ticking = false;
  }

  ancestorSeedKey(userId) {
    return `xiuxian:flower:ancestor:breeding:${userId}`;
  }

  async settleAncestorForUser(userId, player, now = Date.now(), grantFruit = true) {
    ensureFlowerPollenState(player);
    if (!(await hasOwnedFlowerAncestorSeed(userId))) {
      return { changed: false, granted: 0, ownerDenied: true, state: player.花粉路祖种状态 };
    }
    const cycleId = Number(player.花粉路祖种状态.孕育完成时间)
      || Number(player.花粉路祖种状态.上次孕育时间)
      || Math.trunc(Number(now));
    const result = settleFlowerAncestorSeed(player, now);
    let granted = 0;
    const pending = Math.max(0, Number(player.花粉路祖种状态.待领取异果) || 0);
    if (grantFruit && pending > 0) {
      await Add_najie_thing(
        userId,
        SUPER_FLOWER_FRUIT_NAME,
        '道具',
        pending,
        undefined,
        1,
        { idempotencyKey: `flower-ancestor:${userId}:${cycleId}:fruit` },
      );
      granted = pending;
      player.花粉路祖种状态.待领取异果 -= pending;
    }
    if (result.changed || granted > 0) await Write_player(userId, player);
    return { ...result, granted, state: player.花粉路祖种状态 };
  }

  async tickAncestorSeed() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const keys = await redis.keys('xiuxian:flower:ancestor:breeding:*');
      for (const key of keys) {
        const userId = key.split(':').pop();
        if (!userId) continue;
        await withPlayerMutationLock(userId, async () => {
          const player = await Read_player(userId);
          if (!player) {
            await redis.del(key);
            return;
          }
          const settlement = await this.settleAncestorForUser(userId, player, Date.now(), true);
          if (settlement.ownerDenied || !settlement.state.breeding) await redis.del(key);
        });
      }
    } catch (error) {
      console.error('[花粉路祖种] 孕育结算任务失败:', error);
    } finally {
      this.ticking = false;
    }
  }

  async status(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    const player = await withPlayerMutationLock(userId, async () => {
      const fresh = await Read_player(userId);
      await this.settleAncestorForUser(userId, fresh);
      return fresh;
    });
    ensureFlowerPollenState(player);
    const active = getActiveExtraCultivationPaths(player).map(getExtraCultivationPathName);
    if (!selectedFlowerPath(player)) {
      return e.reply(active.length
        ? `你当前主修额外体系：${active.join('、')}。三条额外体系不可兼修。`
        : '你尚未选择额外体系。满足地仙与肉身成圣后，可发送 #踏上花粉路。');
    }

    const nextRealm = data.huafen_list.find(item => Number(item.level_id) === player.huafenlevel_id + 1);
    const [breathing] = getBestBreathingMethod(player);
    const trial = getNextFlowerExtremeTrial(player);
    const era = getFlowerEraProfile(getCurrentEraIndex());
    const pollution = getPollenPollutionState(player);
    const wound = getFlowerDaoWoundState(player);
    const daoGate = getFlowerDaoGateState(player, player.huafenlevel_id);
    const branchProfile = getFlowerBranchProfile(player);
    const breakthrough = getFlowerBreakthroughRule(player.huafenlevel_id);
    const tribulationGate = getFlowerTribulationGateState(player, player.huafenlevel_id);
    const authorityLevel = getRealmAuthorityLevel(player);
    const authorities = [];
    if (authorityLevel >= 12) authorities.push('传授功法');
    if (authorityLevel >= 21) authorities.push('造化万物');
    if (authorityLevel >= 22) authorities.push('开铸大道至宝');
    const daoDailyCount = daoGate.path.daily.date === getShanghaiDateKey() ? daoGate.path.daily.count : 0;
    const ancestor = getFlowerAncestorSeedState(player);
    const ancestorOwned = await hasOwnedFlowerAncestorSeed(userId);
    const lines = [
      '【花粉进化路】',
      `境界：${realmName(player.huafenlevel_id)}${player.花粉路分支 ? `（${player.花粉路分支}）` : ''}`,
      `等效权柄：${authorityLevel}重天${authorities.length ? `｜已解锁：${authorities.join('、')}` : ''}`,
      `进化积淀：${player.进化积淀}｜花粉隐患：${player.花粉隐患}/200`,
      `始祖污染：${pollution.pollution}/100${pollution.polluted ? '（污染期·始祖低语）' : ''}${pollution.marked ? '（始祖印记·成功率-20%）' : ''}`,
      `道伤：${wound.wounds}（花粉属性-${Math.round((1 - wound.attrMultiplier) * 100)}%，进化/渡劫-${Math.round(wound.chancePenalty * 100)}%）`,
      `分支倾向：${branchProfile.name}｜${branchProfile.description}`,
      daoGate.rule ? `花粉道则：${daoGate.rule.name} ${daoGate.exp}/${daoGate.rule.targetExp}（${daoGate.stage.name}，今日悟道${daoDailyCount}/${3 + (ancestorOwned ? 1 : 0)}）` : '花粉道则：当前境界尚未开启',
      `祖种：${ancestorOwned ? (ancestor.breeding ? `孕育中，剩余${Math.ceil(ancestor.breedingRemainMs / 3600000)}小时` : ancestor.dormant ? `沉寂中，剩余${Math.ceil(ancestor.dormantRemainMs / 3600000)}小时` : '可用') : '未认主'}｜祖种悟道${ancestorOwned ? Math.min(FLOWER_ANCESTOR_WUDAO_LIMIT, ancestor.悟道次数) : 0}/${FLOWER_ANCESTOR_WUDAO_LIMIT}`,
      ancestorOwned && ancestor.待领取异果 > 0 ? `待领取：${SUPER_FLOWER_FRUIT_NAME}×${ancestor.待领取异果}` : '',
      tribulationGate.rule ? `专属渡劫：${tribulationGate.rule.name}（${tribulationGate.completed ? '已渡过' : `待渡，失败${tribulationGate.failures}次`}）` : '专属渡劫：当前境界无需渡劫',
      `呼吸法：${breathing || '尚未掌握'}`,
      `极境：${player.花粉极境.length ? player.花粉极境.join('、') : '无'}`,
      `时代：${era.name}（成本×${era.costRate}，成功率${era.chanceShift >= 0 ? '+' : ''}${Math.round(era.chanceShift * 100)}%）`,
    ];
    if (nextRealm) {
      const required = getRequiredPollenQuality(nextRealm.level_id);
      const gate = checkGongfaGate(player, nextRealm.level_id);
      const planeLaw = checkPlaneRealmLaw(player, nextRealm.level_id);
      lines.push(`下一境：${nextRealm.level}｜需${required}阶进化媒介｜修为、血气各${bigNumberTransform(getFlowerEvolutionCost(player.huafenlevel_id, era.index))}`);
      if (gate && !gate.ok) lines.push(`⚠ 突破${nextRealm.level}需掌握【${gate.gate.gongfa}】`);
      if (planeLaw && !planeLaw.ok) lines.push(`⚠ 此界法则不全，${nextRealm.level}需前往更高位面方可突破`);
    } else {
      lines.push('你已走到当前花粉进化路的尽头。');
    }
    if (trial) lines.push(`待挑战极境：${realmName(trial.realmLevel)}·${trial.name}（需积淀${trial.accumulation}${trial.maxRisk === undefined ? '' : `，隐患不高于${trial.maxRisk}`}）`);
    if (breakthrough) lines.push(`下一次高阶突破：${breakthrough.name}（${breakthrough.stages.join(' → ')}）`);
    return e.reply(lines.join('\n'));
  }

  async realms(e) {
    if (!verc({ e })) return false;
    const lines = data.huafen_list.map(item => `${item.level_id}. ${item.level}`);
    return e.reply(['【花粉进化路境界】', ...lines].join('\n'));
  }

  async enterPath(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (selectedFlowerPath(player)) return e.reply('你已经踏上花粉进化路。');
      if (Number(player.level_id) < 42 || Number(player.Physique_id) < 42) {
        return e.reply('你必须成就地仙、肉身成圣后，才能选择额外修炼体系。');
      }
      const selection = selectExtraCultivationPath(player, 'huafen');
      if (!selection.ok) return e.reply(selection.message);
      ensureFlowerPollenState(player);
      player.学习的功法 ??= [];
      if (!player.学习的功法.includes('基础呼吸法')) player.学习的功法.push('基础呼吸法');
      await Write_player(userId, player);
      await Add_najie_thing(userId, '普通进化花粉', '道具', 3);
      await player_efficiency(userId);
      await refreshAttributes(userId);
      return e.reply([
        '【花粉路开启】',
        '你以基础呼吸法接引天地灵性，体内沉睡的生命因子开始复苏。',
        '已获得：基础呼吸法、普通进化花粉×3',
        '花粉路已锁定，今后不可兼修人体秘境体系或仙古今世法。',
      ].join('\n'));
    });
  }

  async senseMutation(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      if (await redis.get(`xiuxian:player:${userId}:game_action`) == 0) return e.reply('修仙：游戏进行中...');
      const dailyKey = `xiuxian:huafen:sense:${getShanghaiDateKey()}:${userId}`;
      if (!(await redis.set(dailyKey, '1', { EX: 2 * 24 * 60 * 60, NX: true }))) {
        return e.reply('你今日已经感应过天地异变，明日再来。');
      }

      const targetQuality = getRequiredPollenQuality(player.huafenlevel_id + 1);
      const [mediumName] = MEDIA_BY_QUALITY.find(([, medium]) => medium.quality === targetQuality) || MEDIA_BY_QUALITY[0];
      const ordinaryAmount = 2 + Math.floor(Math.random() * 3);
      await Add_najie_thing(userId, '普通进化花粉', '道具', ordinaryAmount);
      if (mediumName !== '普通进化花粉') await Add_najie_thing(userId, mediumName, '道具', 1);
      const dew = Math.random() < 0.35;
      if (dew) await Add_najie_thing(userId, '净化花露', '道具', 1);
      const stoneJarBonus = Boolean(player.圣墟唯一机缘?.石罐本体);
      if (stoneJarBonus) await Add_najie_thing(userId, mediumName, '道具', 1);
      const fruitName = targetQuality >= 3 ? '祖种异果' : targetQuality === 2 ? '本源异果' : '进化异果';
      const fruitDrop = Math.random() < (stoneJarBonus ? 0.32 : 0.18);
      if (fruitDrop) await Add_najie_thing(userId, fruitName, '道具', 1);
      player.进化积淀 += 8;
      await Write_player(userId, player);
      return e.reply([
        '【天地异变】',
        `你循着灵性粒子的潮汐寻到普通进化花粉×${ordinaryAmount}${mediumName === '普通进化花粉' ? '' : `、${mediumName}×1`}${dew ? '、净化花露×1' : ''}${stoneJarBonus ? `；石罐又凝聚${mediumName}×1` : ''}。`,
        '进化积淀 +8' + (fruitDrop ? '，获得' + fruitName + '×1' : ''),
      ].join('\n'));
    });
  }

  async evolve(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      if (await redis.get(`xiuxian:player:${userId}:game_action`) == 0) return e.reply('修仙：游戏进行中...');
      if (player.huafenlevel_id >= data.huafen_list.length) return e.reply('你已走到当前花粉进化路的尽头。');
      const root = getFlowerRootState(player);
      if (root.critical) return e.reply('【进化根基濒临崩溃】请先使用 #重塑进化根基，修复花粉根基后再继续进化。');

      const targetLevelId = player.huafenlevel_id + 1;
      if (targetLevelId === 23) {
        return e.reply('仙帝阶段需另行完成10次 #推演己道，再使用 #祭道；普通进化不代替祭道门槛。');
      }
      if (targetLevelId === 22) {
        return e.reply([
          '【道祖绝巅·己道未尽】',
          '路尽级仙帝并非依靠普通进化踏入。请将自身之道修至当前上限，再发送 #推演己道。',
        ].join('\n'));
      }
      if (targetLevelId === 21) {
        const emperorGate = canEnterQuasiEmperor(player, 'huafen');
        if (!emperorGate.ok) {
          const guidance = emperorGate.reason === 'system'
            ? '请先圆满仙王道则，再发送 #合道 体系名（体系名不超过五字）。'
            : '你已合道立下体系，还需发送 #破王成帝劫 完成最终洗礼。';
          return e.reply(['【道祖门槛·合道在先】', guidance].join('\n'));
        }
      }
      const daoGate = getFlowerDaoGateState(player, player.huafenlevel_id);
      if (!daoGate.ok) {
        return e.reply([`【花粉道则未圆】`, `${daoGate.rule.name}进度：${daoGate.exp}/${daoGate.rule.targetExp}（${daoGate.stage.name}）`, `请先发送 #花粉悟道，圆满后才能冲击${realmName(targetLevelId)}。`].join('\n'));
      }
      const tribulationGate = getFlowerTribulationGateState(player, player.huafenlevel_id);
      if (!tribulationGate.ok) {
        return e.reply([`【专属渡劫未完成】`, `当前需要渡过「${tribulationGate.rule.name}」：${tribulationGate.rule.stages.join(' → ')}`, `可发送 #花粉渡劫，失败${tribulationGate.failures}次后会获得少量失败保护。`].join('\n'));
      }
      const eraIndex = getCurrentEraIndex();

      // 功法卡：突破指定大境界需对应呼吸法
      const gate = checkGongfaGate(player, targetLevelId);
      if (!gate.ok) {
        return e.reply(`【功法未成】突破${realmName(targetLevelId)}需先掌握【${gate.gate.gongfa}】，可前往圣墟相关副本寻找机缘。`);
      }
      // 位面法则卡：当前位面法则不全则无法继续进化
      const planeLaw = checkPlaneRealmLaw(player, targetLevelId);
      if (!planeLaw.ok) {
        return e.reply(`【法则不全】此界最多容纳至「${realmName(planeLaw.max)}」，${realmName(planeLaw.max)}已是当前位面的进化绝巅，需前往更高位面方能再进一步。`);
      }

      const requiredQuality = getRequiredPollenQuality(targetLevelId);
      const requested = e.msg.match(/^#进化(?:\s+(.+))?$/)?.[1]?.trim();
      let mediumName = requested;
      if (mediumName && !FLOWER_POLLEN_MEDIA[mediumName]) {
        return e.reply(`未知进化媒介。可用：${Object.keys(FLOWER_POLLEN_MEDIA).join('、')}`);
      }
      if (!mediumName) {
        for (const [name, medium] of MEDIA_BY_QUALITY) {
          if (medium.quality < requiredQuality) continue;
          if (Number(await exist_najie_thing(userId, name, '道具')) > 0) {
            mediumName = name;
            break;
          }
        }
      }
      if (!mediumName || Number(await exist_najie_thing(userId, mediumName, '道具')) <= 0) {
        return e.reply(`缺少${requiredQuality}阶以上进化媒介，可先发送 #感应异变。`);
      }

      const cost = getFlowerEvolutionCost(player.huafenlevel_id, eraIndex);
      if (Number(player.修为) < cost || Number(player.血气) < cost) {
        return e.reply(`进化需修为、血气各${bigNumberTransform(cost)}（含时代影响）。`);
      }
      const ancestorSeed = await hasOwnedFlowerAncestorSeed(userId);
      const chance = getFlowerEvolutionChance(player, mediumName, { ancestorSeed, eraIndex });
      const beforeRealm = realmName(player.huafenlevel_id);
      const breakthrough = getFlowerBreakthroughRule(player.huafenlevel_id);
      const result = breakthrough
        ? resolveFlowerBreakthrough(player, mediumName, Math.random, { ancestorSeed, eraIndex })
        : resolveFlowerEvolution(player, mediumName, Math.random, { ancestorSeed, eraIndex });
      if (result.reason === 'quality') return e.reply(`该媒介品阶不足，此次进化至少需要${result.requiredQuality}阶花粉。`);

      player.修为 -= cost;
      player.血气 -= cost;
      await Add_najie_thing(userId, mediumName, '道具', -1);

      // 失败惩罚结算：常规失败扣 30% 当前修为血气；异变若污染度满则触发始祖接引
      let ancestorCall = null;
      if (!result.ok && result.reason === 'failed') {
        player.修为 = Math.max(0, Math.floor(Number(player.修为) * 0.7));
        player.血气 = Math.max(0, Math.floor(Number(player.血气) * 0.7));
      } else if (!result.ok && result.reason === 'mutated' && player.始祖污染度 >= 100) {
        ancestorCall = applyAncestorCall(player);
      }
      await Write_player(userId, player);
      await refreshAttributes(userId);

      if (!result.ok && result.reason === 'mutated') {
        const lines = [
          '【始祖异变】',
          `成功率：${(chance * 100).toFixed(1)}%｜${mediumName}已消耗｜异变率：${(result.mutationChance * 100).toFixed(1)}%`,
          `始祖污染度 +${result.pollutionGain}（${player.始祖污染度}/100），境界仍为${beforeRealm}，积淀${player.进化积淀}，隐患${player.花粉隐患}。`,
        ];
        if (ancestorCall) {
          lines.push(
            '',
            '【始祖接引】',
            `始祖的意志自花粉深处降临，夺走你修为${bigNumberTransform(ancestorCall.seizedCultivation)}、血气${bigNumberTransform(ancestorCall.seizedBlood)}！`,
            '你被烙下始祖印记（24h 内进化成功率-20%），始祖污染度回落至 60。',
            '速以净化花露或石罐清洗本源，驱散始祖的注视！',
          );
        }
        return e.reply(lines.join('\n'));
      }
      if (!result.ok && result.reason === 'breakthrough-failed') {
        return e.reply([
          `【${breakthrough.name}未渡尽】`,
          `在「${result.failedStage}」阶段，生命真形出现裂痕。`,
          `本次花粉媒介已消耗，积淀增至${player.进化积淀}，隐患增至${player.花粉隐患}。`,
          '可净化隐患、补足积淀后再次冲关。',
        ].join('\n'));
      }
      if (!result.ok) {
        return e.reply([
          '【进化受阻·道基受损】',
          `成功率：${(chance * 100).toFixed(1)}%｜${mediumName}已消耗`,
          `境界仍为${beforeRealm}，修为、血气各损失 30%。`,
          `积淀增至${player.进化积淀}，隐患增至${player.花粉隐患}。`,
        ].filter(Boolean).join('\n'));
      }
      const era = getFlowerEraProfile(eraIndex);
      return e.reply([
        '【生命跃迁】',
        `${beforeRealm} → ${realmName(player.huafenlevel_id)}${result.branch ? `（${result.branch}路）` : ''}`,
        `成功率：${(chance * 100).toFixed(1)}%｜积淀${player.进化积淀}｜隐患${player.花粉隐患}｜${era.name}`,
        result.breakthrough ? `渡过${breakthrough.name}：${result.stages.map(stage => `${stage.name}✓`).join(' → ')}` : '',
        ancestorSeed ? '花粉路祖种与你共鸣，进化稳定性提高。' : '',
        getNextFlowerExtremeTrial(player) ? '当前境界存在极境，可发送 #极尽蜕变 查看并尝试。' : '你的生命层次完成了一次跃迁。',
      ].filter(Boolean).join('\n'));
    });
  }

  async ancestorWudao(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const ancestorSettlement = await this.settleAncestorForUser(userId, player);
      if (ancestorSettlement.ownerDenied) return e.reply(`缺少已认主的${FLOWER_ANCESTOR_SEED_NAME}，可在圣墟副本中寻得。`);
      const realmId = Number(player.huafenlevel_id) || 1;
      const gate = getFlowerDaoGateState(player, realmId);
      if (!gate.rule) return e.reply('当前花粉境界尚未开启花粉道则，继续进化即可。');
      if (gate.ok) return e.reply(`【花粉道则已圆满】${gate.rule.name}已经完成。`);
      const state = getFlowerAncestorSeedState(player);
      if (state.breeding) return e.reply(`祖种正在孕育中，剩余${Math.ceil(state.breedingRemainMs / 3600000)}小时。`);
      if (state.dormant) return e.reply(`祖种处于沉寂期，剩余${Math.ceil(state.dormantRemainMs / 3600000)}小时。`);
      if (state.悟道次数 >= FLOWER_ANCESTOR_WUDAO_LIMIT) return e.reply(`本轮祖种悟道已用尽（${FLOWER_ANCESTOR_WUDAO_LIMIT}次），孕育完成并度过沉寂后刷新。`);

      const daoContext = await buildFlowerDaoGainContext(userId, player, true);
      const { eraIndex, stoneJar } = daoContext;
      const baseCost = getFlowerDaoAttemptCost(player, realmId, eraIndex);
      const costRate = stoneJar ? 0.9 : 1;
      const cost = {
        potential: Math.max(1, Math.ceil(baseCost.potential * costRate)),
        cultivation: Math.max(1, Math.ceil(baseCost.cultivation * costRate)),
        blood: Math.max(1, Math.ceil(baseCost.blood * costRate)),
        lifespan: Math.max(1, Math.floor(baseCost.lifespan * costRate)),
        spirit: Math.max(1, Math.ceil(baseCost.spirit * costRate)),
      };
      const availableLifespan = getAvailableLifespan(player);
      if (Number(player.仙道潜力) < cost.potential
        || Number(player.修为) < cost.cultivation
        || Number(player.血气) < cost.blood
        || Number(player.元神) < cost.spirit
        || availableLifespan <= cost.lifespan) {
        return e.reply([
          '【祖种悟道·资源不足】',
          `潜力需${cost.potential.toLocaleString()}｜修为需${bigNumberTransform(cost.cultivation)}｜血气需${bigNumberTransform(cost.blood)}`,
          `寿元需${cost.lifespan.toLocaleString()}年｜元神需${bigNumberTransform(cost.spirit)}`,
        ].join('\n'));
      }

      const traces = getFlowerDaoTraceProfile(player);
      const result = applyAncestorWudao(player, realmId, Math.random, {
        ...daoContext.gainOptions,
        now: Date.now(),
        hasSeed: true,
        postGainMultiplier: traces.multiplier,
      });
      if (!result.ok) {
        const messages = {
          dormant: '祖种尚在沉寂期，请等待冷却结束。',
          breeding: '祖种正在孕育异果，完成后再来悟道。',
          limit: `本轮祖种悟道已用尽（${FLOWER_ANCESTOR_WUDAO_LIMIT}次）。`,
          complete: '当前花粉道则已经圆满。',
        };
        return e.reply(messages[result.reason] || '祖种悟道暂未响应。');
      }
      if (traces.used > 0) {
        player.先天道痕 -= traces.used;
        result.bonuses.traces = traces.bonus;
      }
      player.仙道潜力 = Math.max(0, Number(player.仙道潜力) - cost.potential);
      player.修为 = Math.max(0, Number(player.修为) - cost.cultivation);
      player.血气 = Math.max(0, Number(player.血气) - cost.blood);
      player.元神 = Math.max(0, Number(player.元神) - cost.spirit);
      consumePlayerLifespan(player, cost.lifespan);
      await Write_player(userId, player);
      await refreshAttributes(userId);
      return e.reply([
        `【祖种悟道·${result.gate.rule.name}】`,
        `祖种共鸣三倍道韵，本次悟得${result.gain}点（原始${result.rawGain}点）。`,
        `道则进度：${result.after}/${result.gate.rule.targetExp}${result.completed ? '（已圆满）' : ''}`,
        `本轮次数：${result.state.悟道次数}/${FLOWER_ANCESTOR_WUDAO_LIMIT}`,
        `消耗：潜力${cost.potential.toLocaleString()}｜修为${bigNumberTransform(cost.cultivation)}｜血气${bigNumberTransform(cost.blood)}｜寿元${cost.lifespan}年｜元神${bigNumberTransform(cost.spirit)}`,
      ].join('\n'));
    });
  }

  async breedAncestorFruit(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const ancestorSettlement = await this.settleAncestorForUser(userId, player);
      const stoneJar = Boolean(player.圣墟唯一机缘?.石罐本体)
        || (Number(await exist_najie_thing(userId, '神秘石罐', '道具')) || 0) > 0;
      if (ancestorSettlement.ownerDenied) return e.reply(`缺少已认主的${FLOWER_ANCESTOR_SEED_NAME}。`);
      if (!stoneJar) return e.reply('孕育超级异果需要已经认主的神秘石罐。');
      const result = beginFlowerAncestorBreeding(player, Date.now(), { hasSeed: true, hasStoneJar: true });
      if (!result.ok) {
        const messages = {
          breeding: `祖种正在孕育中，剩余${Math.ceil((result.state.孕育完成时间 - Date.now()) / 3600000)}小时。`,
          dormant: `祖种处于沉寂期，剩余${Math.ceil((result.state.沉寂结束时间 - Date.now()) / 3600000)}小时。`,
          'fruit-pending': `已有${SUPER_FLOWER_FRUIT_NAME}待领取，请先领取并服用。`,
        };
        return e.reply(messages[result.reason] || '祖种暂未进入孕育状态。');
      }
      const ttl = Math.ceil((FLOWER_ANCESTOR_BREEDING_MS + FLOWER_ANCESTOR_DORMANT_MS) / 1000) + 3600;
      await redis.set(this.ancestorSeedKey(userId), JSON.stringify({
        userId,
        startedAt: result.startedAt,
        completeAt: result.completeAt,
      }), { EX: ttl });
      await Write_player(userId, player);
      return e.reply([
        '【祖种孕育·超级异果】',
        '花粉路祖种与石罐本源相合，开始孕育超级异果。',
        '孕育时长：8小时；完成后祖种沉寂24小时。',
        `预计完成：${new Date(result.completeAt).toLocaleString('zh-CN')}`,
      ].join('\n'));
    });
  }

  async eatSuperFlowerFruit(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const ancestorSettlement = await this.settleAncestorForUser(userId, player);
      if (ancestorSettlement.ownerDenied) return e.reply(`只有${FLOWER_ANCESTOR_SEED_NAME}的认主者可服用${SUPER_FLOWER_FRUIT_NAME}。`);
      const count = Number(await exist_najie_thing(userId, SUPER_FLOWER_FRUIT_NAME, '道具')) || 0;
      if (count <= 0) return e.reply(`你尚未拥有${SUPER_FLOWER_FRUIT_NAME}。`);
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${userId}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${userId}.json`));
      let result;
      try {
        result = consumeSuperFlowerFruit(player, Date.now(), { hasFruit: true });
        if (!result.ok) {
          transaction.commit();
          return e.reply('超级异果尚未成熟。');
        }
        await Add_najie_thing(userId, SUPER_FLOWER_FRUIT_NAME, '道具', -1);
        await Write_player(userId, player);
        await refreshAttributes(userId);
        transaction.commit();
      } catch (error) {
        try {
          transaction.rollback();
        } catch (rollbackError) {
          console.error(`[超级异果] 玩家 ${userId} 消费回滚失败:`, rollbackError);
        }
        console.error(`[超级异果] 玩家 ${userId} 消费失败:`, error);
        return e.reply('超级异果服用失败，果实与角色状态已回滚，请稍后再试。');
      }
      return e.reply([
        `【服用${SUPER_FLOWER_FRUIT_NAME}】`,
        `修为+${bigNumberTransform(result.cultivationGain)}｜血气+${bigNumberTransform(result.bloodGain)}`,
        `仙道潜力+${result.potentialGain.toLocaleString()}｜悟道法则+${result.lawGain}`,
        `练气×炼体×额外体系乘数：${result.extraLevels}｜当前花粉境界：${result.flowerLevel}`,
        `道伤已完全修复（${result.before.wounds} → 0），此前未圆满法则已自动补齐。`,
      ].join('\n'));
    });
  }

  async flowerDao(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const realmId = Number(player.huafenlevel_id) || 1;
      const gate = getFlowerDaoGateState(player, realmId);
      if (!gate.rule) return e.reply('当前境界尚未开启花粉道则，继续进化即可。');
      if (gate.ok) return e.reply(`【花粉道则已圆满】${gate.rule.name}已经完成，可继续冲击${gate.rule.nextRealm}。`);
      const dateKey = getShanghaiDateKey();
      const ancestorSeed = await hasOwnedFlowerAncestorSeed(userId);
      const dailyLimit = 3 + (ancestorSeed ? 1 : 0);
      if (gate.path.daily.date === dateKey && gate.path.daily.count >= dailyLimit) {
        return e.reply(`今日花粉悟道次数已用尽（${gate.path.daily.count}/${dailyLimit}），明日再来。`);
      }

      const daoContext = await buildFlowerDaoGainContext(userId, player, ancestorSeed);
      const {
        eraIndex,
        stoneJar,
        minggeEffects,
        technique,
        equipmentBonuses,
        titleBonus,
        imperialWudao,
      } = daoContext;
      const baseCosts = getFlowerDaoAttemptCost(player, realmId, eraIndex);
      const wudaoGongfa = getWudaoGongfaReduction(player);
      const costMultiplier = (1 - wudaoGongfa.rate)
        * getDaoHeartWudaoCostMultiplier(player)
        * (stoneJar ? 0.9 : 1);
      const cost = {
        potential: applyQuestionFortuneCost(
          player,
          calculateMinggePotentialCost(Math.ceil(baseCosts.potential * costMultiplier), minggeEffects)
        ),
        cultivation: applyQuestionFortuneCost(player, Math.ceil(baseCosts.cultivation * costMultiplier)),
        blood: applyQuestionFortuneCost(player, Math.ceil(baseCosts.blood * costMultiplier)),
        lifespan: applyQuestionFortuneCost(
          player,
          Math.floor(getWudaoLifespanCost({ lifespanCost: baseCosts.lifespan }, minggeEffects).cost * costMultiplier)
        ),
        spirit: applyQuestionFortuneCost(player, Math.ceil(baseCosts.spirit * costMultiplier)),
      };
      const current = {
        potential: Number(player.仙道潜力) || 0,
        cultivation: Number(player.修为) || 0,
        blood: Number(player.血气) || 0,
        lifespan: getAvailableLifespan(player),
        spirit: Number(player.元神) || 0,
      };
      if (
        current.potential < cost.potential
        || current.cultivation < cost.cultivation
        || current.blood < cost.blood
        || current.lifespan <= cost.lifespan
        || current.spirit < cost.spirit
      ) {
        await Write_player(userId, player);
        return e.reply([
          '【资源不足·花粉悟道中止】',
          `仙道潜力：需${cost.potential.toLocaleString()}｜现有${current.potential.toLocaleString()}`,
          `修为：需${bigNumberTransform(cost.cultivation)}｜现有${bigNumberTransform(current.cultivation)}`,
          `血气：需${bigNumberTransform(cost.blood)}｜现有${bigNumberTransform(current.blood)}`,
          `寿元：需${cost.lifespan.toLocaleString()}年｜现有${current.lifespan.toLocaleString()}年`,
          `元神：需${bigNumberTransform(cost.spirit)}｜现有${bigNumberTransform(current.spirit)}`,
          '花粉悟道会保留最后一缕寿元。',
        ].join('\n'));
      }

      const gain = calculateFlowerDaoGain(player, realmId, Math.random, daoContext.gainOptions);
      const { used: tracesUsed } = applyFlowerDaoTraceBonus(player, gain);

      player.仙道潜力 = current.potential - cost.potential;
      player.修为 = current.cultivation - cost.cultivation;
      player.血气 = current.blood - cost.blood;
      player.元神 = current.spirit - cost.spirit;
      consumePlayerLifespan(player, cost.lifespan);
      const result = recordFlowerDaoAttempt(player, realmId, gain.gain, dateKey, dailyLimit);
      if (!result.ok) return e.reply('今日花粉悟道次数已用尽，明日再来。');
      const breathingPractice = recordFlowerBreathingPractice(player, 3);
      const proficiencyGains = awardWudaoGongfaProficiency(player, 5, { dateKey });
      await Write_player(userId, player);
      await refreshAttributes(userId);
      const factorLines = [
        `呼吸法 ${formatSignedPercent(gain.bonuses.breathing)}`,
        `${gain.era.name} ${formatSignedPercent(gain.bonuses.era)}`,
        `灵根/体质 ${formatSignedPercent(gain.bonuses.physique)}`,
        `天资 ${formatSignedPercent(gain.bonuses.aptitude)}`,
        `功法「${technique.name}」${formatSignedPercent(gain.bonuses.technique)}`,
        `命格 ${formatSignedPercent(gain.bonuses.mingge)}`,
        `道心 ${formatSignedPercent(gain.bonuses.daoHeart)}`,
      ];
      if (gain.bonuses.accumulation) factorLines.push(`进化积淀 ${formatSignedPercent(gain.bonuses.accumulation)}`);
      if (gain.bonuses.risk) factorLines.push(`花粉隐患 ${formatSignedPercent(gain.bonuses.risk)}`);
      if (gain.bonuses.root) factorLines.push(`根基损伤 ${formatSignedPercent(gain.bonuses.root)}`);
      if (gain.bonuses.pollution) factorLines.push(`始祖污染 ${formatSignedPercent(gain.bonuses.pollution)}`);
      if (gain.bonuses.wound) factorLines.push(`道伤 ${formatSignedPercent(gain.bonuses.wound)}`);
      if (ancestorSeed) factorLines.push('花粉路祖种 +8% / 每日次数+1');
      if (stoneJar) factorLines.push('石罐 +10% / 消耗-10%');
      if (gain.bonuses.world) factorLines.push(`位面 ${formatSignedPercent(gain.bonuses.world)}`);
      if (titleBonus) factorLines.push(`称号 ${formatSignedPercent(titleBonus)}`);
      if (equipmentBonuses.equipment) factorLines.push(`装备 ${formatSignedPercent(equipmentBonuses.equipment)}`);
      if (equipmentBonuses.treasure || imperialWudao) factorLines.push(`至宝 ${formatSignedPercent(gain.bonuses.treasure)}`);
      if (tracesUsed) factorLines.push(`先天道痕 ${formatSignedPercent(gain.bonuses.traces)}`);
      const proficiencyLine = Object.entries(proficiencyGains)
        .map(([name, amount]) => `${name}熟练度+${amount}`)
        .join('、');
      return e.reply([
        `【花粉悟道·${gain.rule.name}】`,
        `你在花粉潮汐中观照自身，悟得${result.gain}点道韵。`,
        `道则进度：${result.after}/${gain.rule.targetExp}（${result.gate.stage.name}）`,
        `消耗：潜力${cost.potential.toLocaleString()}｜修为${bigNumberTransform(cost.cultivation)}｜血气${bigNumberTransform(cost.blood)}`,
        `消耗：寿元${cost.lifespan.toLocaleString()}年｜元神${bigNumberTransform(cost.spirit)}`,
        `收益倍率：×${gain.multiplier.toFixed(2)}〔${factorLines.join('，')}〕`,
        `今日次数：${result.gate.path.daily.count}/${dailyLimit}`,
        breathingPractice.gained ? breathingPractice.name + '熟练度 +' + breathingPractice.gained + '（' + breathingPractice.profile.name + '）' : '呼吸法熟练度已达今日上限',
        proficiencyLine,
        result.completed ? `【道则圆满】下一步可冲击${gain.rule.nextRealm}。` : '道则尚未圆满，可继续 #花粉悟道。',
      ].filter(Boolean).join('\n'));
    });
  }


  async flowerRootStatus(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    const player = await Read_player(userId);
    if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
    const root = getFlowerRootState(player);
    const fruits = Object.keys(FLOWER_FRUITS).map(name => name + '（' + FLOWER_FRUITS[name].accumulation + '积淀，根基损伤+' + FLOWER_FRUITS[name].rootDamage + '）');
    const ancestor = getFlowerAncestorSeedState(player);
    const ancestorOwned = await hasOwnedFlowerAncestorSeed(userId);
    return e.reply([
      '【花粉进化根基】',
      '根基损伤：' + root.damage + '/' + root.max + (root.critical ? '（临界）' : ''),
      '根基损伤会降低进化成功率，达到100时无法继续进化。',
      '可服用异果：' + fruits.join('、'),
      '发送 #服用异果 或 #服用异果 异果名。',
      `超级异果：${ancestorOwned ? (ancestor.待领取异果 > 0 ? `待领取${ancestor.待领取异果}枚` : '需祖种与石罐孕育8小时') : '祖种尚未认主'}，发送 #服用超级异果。`,
      '发送 #重塑进化根基，使用净化花露或本源圣药修复。',
    ].join('\n'));
  }

  async eatFlowerFruit(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    const requestedFruit = e.msg.match(/^#服用异果(?:\s+(.+))?$/)?.[1]?.trim();
    if (requestedFruit === SUPER_FLOWER_FRUIT_NAME) return this.eatSuperFlowerFruit(e);
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      ensureFlowerPollenState(player);
      const requested = requestedFruit;
      let fruitName = requested;
      if (fruitName && !FLOWER_FRUITS[fruitName]) return e.reply('未知异果。可用：' + Object.keys(FLOWER_FRUITS).join('、'));
      if (!fruitName) {
        for (const name of Object.keys(FLOWER_FRUITS).reverse()) {
          if (Number(await exist_najie_thing(userId, name, '道具')) > 0) { fruitName = name; break; }
        }
      }
      if (!fruitName || Number(await exist_najie_thing(userId, fruitName, '道具')) <= 0) return e.reply('你没有对应异果，可通过 #感应异变 或圣墟副本机缘获得。');
      const result = consumeFlowerFruit(player, fruitName);
      if (result.reason === 'root-critical') return e.reply('【根基损伤临界】继续服用异果只会让进化根基崩溃，请先 #重塑进化根基。');
      await Add_najie_thing(userId, fruitName, '道具', -1);
      await Write_player(userId, player);
      return e.reply([
        '【服用' + fruitName + '】',
        '进化积淀 +' + result.fruit.accumulation + '，当前' + player.进化积淀,
        '根基损伤 ' + result.beforeDamage + ' → ' + result.afterDamage + '/100',
        '花粉隐患 +' + result.fruit.risk + '，始祖污染 +' + result.fruit.pollution,
        result.rootCritical ? '根基已达临界，必须重塑后才能继续进化。' : '异果力量已沉淀，可继续积累或冲击进化。',
      ].join('\n'));
    });
  }

  async repairFlowerRoot(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const root = getFlowerRootState(player);
      if (!root.damage) return e.reply('你的花粉进化根基没有损伤。');
      const requested = e.msg.match(/^#重塑进化根基(?:\s+(.+))?$/)?.[1]?.trim();
      let itemName = requested || '';
      if (itemName && !['净化花露', '本源圣药'].includes(itemName)) return e.reply('可用修复材料：净化花露、本源圣药。');
      if (!itemName) itemName = Number(await exist_najie_thing(userId, '本源圣药', '道具')) > 0 ? '本源圣药' : '净化花露';
      if (Number(await exist_najie_thing(userId, itemName, '道具')) <= 0) return e.reply('缺少' + itemName + '。净化花露可由 #感应异变 获得，本源圣药可在阳间名山机缘中获得。');
      const stoneJar = Boolean(player.圣墟唯一机缘?.石罐本体);
      const amount = itemName === '本源圣药' ? (stoneJar ? 80 : 45) : (stoneJar ? 24 : 12);
      const result = repairFlowerRoot(player, amount, itemName);
      await Add_najie_thing(userId, itemName, '道具', -1);
      await Write_player(userId, player);
      return e.reply([
        '【' + itemName + '·重塑进化根基】',
        '根基损伤 ' + result.before + ' → ' + result.after + '/100',
        '本次修复' + result.repaired + '点' + (stoneJar ? '（石罐共鸣）' : '') + '，修复次数' + player.花粉根基.修复次数 + '。',
        result.after === 0 ? '根基已恢复圆满，花粉路再次畅通。' : '根基仍有裂痕，继续使用净化材料可逐步修复。',
      ].join('\n'));
    });
  }

  async flowerTribulationStatus(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    const player = await Read_player(userId);
    if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
    const gate = getFlowerTribulationGateState(player, player.huafenlevel_id);
    if (!gate.rule) return e.reply('当前花粉境界没有专属渡劫节点。');
    const daoGate = getFlowerDaoGateState(player, player.huafenlevel_id);
    return e.reply([
      `【花粉专属渡劫】`,
      `劫名：${gate.rule.name}`,
      `阶段：${gate.rule.stages.join(' → ')}`,
      `状态：${gate.completed ? '已渡过，可继续进化' : `未完成，失败${gate.failures}次`}`,
      daoGate.rule && !daoGate.ok ? `前置道则：${daoGate.rule.name}尚未圆满，需先 #花粉悟道` : '前置道则：已满足',
      !gate.completed ? '发送 #花粉渡劫 引动花粉潮汐。' : '',
    ].filter(Boolean).join('\n'));
  }

  async flowerTribulation(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    const run = () => withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      if (await redis.get(`xiuxian:player:${userId}:game_action`) == 0) return e.reply('修仙：游戏进行中...');
      const realmId = Number(player.huafenlevel_id) || 1;
      const gate = getFlowerTribulationGateState(player, realmId);
      if (!gate.rule) return e.reply('当前花粉境界没有专属渡劫节点。');
      if (gate.completed) return e.reply(`【专属渡劫已完成】${gate.rule.name}已经渡过，可继续发送 #进化。`);
      const daoGate = getFlowerDaoGateState(player, realmId);
      if (!daoGate.ok) return e.reply(`【道则未圆】请先完成${daoGate.rule.name}（发送 #花粉悟道），再引动${gate.rule.name}。`);
      const eraIndex = getCurrentEraIndex();
      const cost = getFlowerTribulationCost(realmId, eraIndex);
      if (Number(player.修为) < cost.cultivation || Number(player.血气) < cost.blood) {
        return e.reply(`渡劫需修为、血气各${bigNumberTransform(cost.cultivation)}（时代影响），当前本源不足。`);
      }

      // 刷新属性后重读（拿到最新血量/防御）
      await player_efficiency(userId);
      player = await Read_player(userId);

      const stoneJar = Boolean(player.圣墟唯一机缘?.石罐本体);
      // 可选护道资源：本源圣药优先，其次净化花露（一次性减伤）
      const hasDew = Number(await exist_najie_thing(userId, '净化花露', '道具')) > 0;
      const hasHerb = Number(await exist_najie_thing(userId, '本源圣药', '道具')) > 0;
      const useHerb = hasHerb;
      const useDew = hasDew && !useHerb;
      if (useHerb) await Add_najie_thing(userId, '本源圣药', '道具', -1);
      if (useDew) await Add_najie_thing(userId, '净化花露', '道具', -1);

      player.修为 -= cost.cultivation;
      player.血气 -= cost.blood;

      const levels = {
        Level_list: data.Level_list,
        LevelMax_list: data.LevelMax_list,
        Levelmijing_list: data.Levelmijing_list,
        xiangujinshi_list: data.xiangujinshi_list,
        huafen_list: data.huafen_list,
      };
      const baseAtk = getFlowerTribulationBaseAtk(player, levels);
      const mitigation = calcFlowerTribulationMitigation(player, { realmId, stoneJar, dew: useDew, herb: useHerb });
      const defense = Number(player.防御) || 0;
      player.当前血量 = Number(player.血量上限) || 1;
      delete player._命格复活已判;

      await e.reply([
        `【${gate.rule.name}·引劫】`,
        `雷劫基准攻击：${bigNumberTransform(baseAtk)}（四体系境界，天道不认外物）`,
        `时代难度：${getFlowerEraProfile(eraIndex).name}×${FLOWER_TRIBULATION_ERA_DIFFICULTY[eraIndex] ?? 1}`,
        `雷劫总数：${gate.rule.stages.length * FLOWER_TRIBULATION_WAVES_PER_STAGE} 道（每阶段 ${FLOWER_TRIBULATION_WAVES_PER_STAGE} 道）`,
        `满血迎劫：${bigNumberTransform(player.当前血量)}${mitigation.rate > 0 ? `｜减伤链合计 ${(mitigation.rate * 100).toFixed(0)}%` : ''}`,
        stoneJar ? '石罐本体微光流转，随时准备护体。' : '',
        useHerb ? '本源圣药涤荡神魂，本次渡劫雷劫伤害 -25%。' : useDew ? '净化花露洗炼本源，本次渡劫雷劫伤害 -15%。' : '',
      ].filter(Boolean).join('\n'));

      // ===== 逐阶段逐道雷劫（每阶段至少 10 道）=====
      let outcome = { ok: true, failedStage: null };
      let diedAt = null;
      outer: for (let stageIndex = 0; stageIndex < gate.rule.stages.length; stageIndex++) {
        const stageName = gate.rule.stages[stageIndex];
        await e.reply(`【第${stageIndex + 1}阶段：${stageName}】`);
        for (let wave = 1; wave <= FLOWER_TRIBULATION_WAVES_PER_STAGE; wave++) {
          cooldownRevivalGongfas(player);
          const waveResult = calculateFlowerTribulationWave(baseAtk, gate.rule, realmId, stageIndex, wave, {
            eraIndex,
            defense,
            mitigationRate: mitigation.rate,
            treasureMultiplier: getPassiveTribulationDamageMultiplier(player),
          });
          let actualDamage = waveResult.damage;
          let willowReduction = 0;
          if (player.柳神效果?.庇护层数 > 0) {
            willowReduction = Math.floor(actualDamage * (player.柳神效果.减伤比例 || 0.45));
            actualDamage = Math.max(0, actualDamage - willowReduction);
            player.柳神效果.庇护层数--;
          }
          player.当前血量 = Math.max(0, player.当前血量 - actualDamage);
          const lines = [
            `第${stageIndex + 1}阶段·第${wave}道雷劫`,
            `劫伤：${bigNumberTransform(actualDamage)}${waveResult.reduction ? `（防御减免 ${bigNumberTransform(waveResult.reduction)}）` : ''}`,
            `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`,
          ];
          if (willowReduction > 0) {
            lines.push(`【柳神庇护】减伤 ${bigNumberTransform(willowReduction)}，剩余${player.柳神效果.庇护层数}层`);
          }
          if (player.柳神效果?.持续恢复?.回合数 > 0) {
            const heal = Math.min(
              player.柳神效果.持续恢复.治疗量 || Math.floor(player.血量上限 * 0.15),
              player.血量上限 - player.当前血量
            );
            player.当前血量 += heal;
            player.柳神效果.持续恢复.回合数--;
            lines.push(`【柳神生机】恢复 ${bigNumberTransform(heal)}，当前血量 ${bigNumberTransform(player.当前血量)}`);
          }
          await e.reply(lines.join('\n'));
          if (player.当前血量 <= 0) {
            const revival = await resolveInteractiveGongfaRevival(
              e,
              userId,
              player,
              { minggeList: data.minggeList }
            );
            if (revival.revived) {
              await e.reply(revival.messages.join('\n'));
              await Write_player(userId, player);
              await sleep(FLOWER_TRIBULATION_WAVE_INTERVAL_MS);
              continue;
            }
            await e.reply(revival.messages.join('\n'));
            player.当前血量 = 1;
            outcome = { ok: false, failedStage: stageName };
            diedAt = { stageIndex, wave };
            break outer;
          }
          await Write_player(userId, player);
          await sleep(FLOWER_TRIBULATION_WAVE_INTERVAL_MS);
        }
      }

      // ===== 奖惩结算 =====
      const settlement = applyFlowerTribulationOutcome(player, outcome, Math.random, { realmId, stoneJar, now: Date.now() });
      await Write_player(userId, player);
      await refreshAttributes(userId);

      if (!settlement.ok) {
        return e.reply([
          `【${gate.rule.name}·${settlement.mutated ? '始祖异变' : '渡劫失败'}】`,
          `在第${(diedAt?.stageIndex ?? 0) + 1}阶段·第${diedAt?.wave ?? 1}道雷劫时，生命真形被劈碎！`,
          `修为 -${bigNumberTransform(settlement.punishment.cultivationLoss)}、血气 -${bigNumberTransform(settlement.punishment.bloodLoss)}｜道伤 +1`,
          `始祖污染度 +${settlement.pollutionGain}（当前${player.始祖污染度}/100），花粉隐患 ${player.花粉隐患}。`,
          `失败保护：下次渡劫雷劫伤害 -${Math.min(15, Math.trunc(settlement.failures * 3))}%。`,
          '可净化隐患与污染后，再次发送 #花粉渡劫。',
        ].join('\n'));
      }
      return e.reply([
        `【${gate.rule.name}·渡劫成功】`,
        `你扛过全部 ${gate.rule.stages.length * FLOWER_TRIBULATION_WAVES_PER_STAGE} 道雷劫，生命层次完成跃迁！`,
        `剩余血量：${bigNumberTransform(player.当前血量)}/${bigNumberTransform(player.血量上限)}`,
        `进化积淀 +${settlement.rewardAccumulation}｜隐患 -${settlement.riskRelief}｜始祖污染 -${settlement.pollutionRelief}`,
        '专属渡劫印记已留下，发送 #进化 继续冲击下一境。',
      ].join('\n'));
    });
    const result = await withTribulationLock(userId, run);
    if (result === TRIBULATION_LOCK_BUSY) return e.reply('【渡劫中】你已有一场渡劫正在进行，请等待结算完成。');
    return result;
  }

  async extreme(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const result = completeFlowerExtremeTrial(player);
      if (result.reason === 'no-trial') return e.reply('当前境界没有尚未完成的极尽蜕变。');
      if (result.reason === 'accumulation') return e.reply(`冲击【${result.trial.name}】需要进化积淀${result.trial.accumulation}，当前${player.进化积淀}。`);
      if (result.reason === 'risk') return e.reply(`冲击【${result.trial.name}】要求花粉隐患不高于${result.trial.maxRisk}，当前${player.花粉隐患}。`);
      await Write_player(userId, player);
      await refreshAttributes(userId);
      return e.reply(`【极尽蜕变】\n你补全${realmName(result.trial.realmLevel)}的「${result.trial.name}」，花粉路基础境界属性额外提升3%。`);
    });
  }

  async purify(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      const pollution = getPollenPollutionState(player);
      if (player.花粉隐患 <= 0 && pollution.pollution <= 0) {
        return e.reply('你的进化根基澄澈，没有需要净化的隐患与污染。');
      }
      const hasDew = Number(await exist_najie_thing(userId, '净化花露', '道具')) > 0;
      const hasHerb = Number(await exist_najie_thing(userId, '本源圣药', '道具')) > 0;
      if (!hasDew && !hasHerb) return e.reply('净化需要净化花露（#感应异变 获得）或本源圣药（阳间名山机缘），先寻来再净。');
      const herbUsed = hasHerb;
      const stoneJar = Boolean(player.圣墟唯一机缘?.石罐本体);
      const riskPurification = herbUsed ? 60 : (stoneJar ? 60 : 30);
      const beforeRisk = player.花粉隐患;
      player.花粉隐患 = Math.max(0, beforeRisk - riskPurification);
      const pollutionPurification = herbUsed ? 60 : (stoneJar ? 40 : 20);
      const result = purifyPollution(player, pollutionPurification);
      await Add_najie_thing(userId, herbUsed ? '本源圣药' : '净化花露', '道具', -1);
      await Write_player(userId, player);
      const lines = [
        '【本源净化】',
        `花粉隐患 ${beforeRisk} → ${player.花粉隐患}${herbUsed ? '｜本源圣药洗涤神魂' : '｜净化花露洗涤本源'}`,
      ];
      if (pollution.pollution > 0) {
        lines.push(`始祖污染度 ${result.before} → ${result.after}`);
      }
      if (result.cleared) lines.push(`破而后立！始祖的注视消散，进化积淀 +${result.reward}。`);
      return e.reply(lines.join('\n'));
    });
  }
}

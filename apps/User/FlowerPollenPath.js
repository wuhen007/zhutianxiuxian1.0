import { plugin, verc, data } from '../../api/api.js';
import config from '../../model/Config.js';
import {
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
  applyAncestorCall,
  checkGongfaGate,
  completeFlowerExtremeTrial,
  ensureFlowerPollenState,
  getBestBreathingMethod,
  getFlowerEvolutionChance,
  getFlowerEvolutionCost,
  getFlowerEraProfile,
  getNextFlowerExtremeTrial,
  getPollenPollutionState,
  getRequiredPollenQuality,
  purifyPollution,
  resolveFlowerEvolution,
  calculateFlowerDaoGain,
  getFlowerDaoAttemptCost,
  getFlowerDaoGateState,
  getFlowerBranchProfile,
  getFlowerBreakthroughRule,
  recordFlowerDaoAttempt,
  resolveFlowerBreakthrough,
  getFlowerTribulationCost,
  getFlowerTribulationGateState,
  resolveFlowerTribulation,
  getFlowerRootState,
  consumeFlowerFruit,
  repairFlowerRoot,
  recordFlowerBreathingPractice,
} from '../../model/flowerPollenPath.js';
import { checkPlaneRealmLaw } from '../../model/planeRealmLaw.js';
import { getShanghaiDateKey } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { TRIBULATION_LOCK_BUSY, withTribulationLock } from '../../model/tribulationLock.js';

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
        { reg: '^#花粉渡劫$', fnc: 'flowerTribulation' },
        { reg: '^#花粉渡劫状态$', fnc: 'flowerTribulationStatus' },
        { reg: '^#净化隐患$', fnc: 'purify' },
        { reg: '^#花粉根基$', fnc: 'flowerRootStatus' },
        { reg: '^#服用异果(?:\\s+.+)?$', fnc: 'eatFlowerFruit' },
        { reg: '^#重塑进化根基(?:\\s+.+)?$', fnc: 'repairFlowerRoot' },
      ],
    });
  }

  async status(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    const player = await Read_player(userId);
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
    const daoGate = getFlowerDaoGateState(player, player.huafenlevel_id);
    const branchProfile = getFlowerBranchProfile(player);
    const breakthrough = getFlowerBreakthroughRule(player.huafenlevel_id);
    const tribulationGate = getFlowerTribulationGateState(player, player.huafenlevel_id);
    const daoDailyCount = daoGate.path.daily.date === getShanghaiDateKey() ? daoGate.path.daily.count : 0;
    const lines = [
      '【花粉进化路】',
      `境界：${realmName(player.huafenlevel_id)}${player.花粉路分支 ? `（${player.花粉路分支}）` : ''}`,
      `进化积淀：${player.进化积淀}｜花粉隐患：${player.花粉隐患}/200`,
      `始祖污染：${pollution.pollution}/100${pollution.polluted ? '（污染期·始祖低语）' : ''}${pollution.marked ? '（始祖印记·成功率-20%）' : ''}`,
      `分支倾向：${branchProfile.name}｜${branchProfile.description}`,
      daoGate.rule ? `花粉道则：${daoGate.rule.name} ${daoGate.exp}/${daoGate.rule.targetExp}（${daoGate.stage.name}，今日悟道${daoDailyCount}/3）` : '花粉道则：当前境界尚未开启',
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
      const ancestorSeed = Number(await exist_najie_thing(userId, '花粉路祖种', '道具')) > 0;
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
      if (gate.path.daily.date === dateKey && gate.path.daily.count >= 3) {
        return e.reply('今日花粉悟道次数已用尽，明日再来。');
      }
      const eraIndex = getCurrentEraIndex();
      const cost = getFlowerDaoAttemptCost(player, realmId, eraIndex);
      if (Number(player.修为) < cost.cultivation || Number(player.血气) < cost.blood) {
        return e.reply(`悟道需修为、血气各${bigNumberTransform(cost.cultivation)}（时代影响），当前本源不足。`);
      }
      player.修为 -= cost.cultivation;
      player.血气 -= cost.blood;
      const gain = calculateFlowerDaoGain(player, realmId, Math.random, { eraIndex });
      const result = recordFlowerDaoAttempt(player, realmId, gain.gain, dateKey);
      if (!result.ok) return e.reply('今日花粉悟道次数已用尽，明日再来。');
      const breathingPractice = recordFlowerBreathingPractice(player, 3);
      await Write_player(userId, player);
      await refreshAttributes(userId);
      return e.reply([
        `【花粉悟道·${gain.rule.name}】`,
        `你在花粉潮汐中观照自身，悟得${result.gain}点道韵。`,
        `道则进度：${result.after}/${gain.rule.targetExp}（${result.gate.stage.name}）`,
        `消耗修为、血气各${bigNumberTransform(cost.cultivation)}｜今日次数${result.gate.path.daily.count}/3`,
        breathingPractice.gained ? breathingPractice.name + '熟练度 +' + breathingPractice.gained + '（' + breathingPractice.profile.name + '）' : '呼吸法熟练度已达今日上限',
        result.completed ? `【道则圆满】下一步可冲击${gain.rule.nextRealm}。` : '道则尚未圆满，可继续 #花粉悟道。',
      ].join('\n'));
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
    return e.reply([
      '【花粉进化根基】',
      '根基损伤：' + root.damage + '/' + root.max + (root.critical ? '（临界）' : ''),
      '根基损伤会降低进化成功率，达到100时无法继续进化。',
      '可服用异果：' + fruits.join('、'),
      '发送 #服用异果 或 #服用异果 异果名。',
      '发送 #重塑进化根基，使用净化花露或本源圣药修复。',
    ].join('\n'));
  }

  async eatFlowerFruit(e) {
    if (!verc({ e })) return false;
    const userId = await resolveUserId(e);
    if (!(await existplayer(userId))) return e.reply('玩家不存在，请先创建角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (!selectedFlowerPath(player)) return e.reply('你尚未踏上花粉进化路。');
      ensureFlowerPollenState(player);
      const requested = e.msg.match(/^#服用异果(?:\s+(.+))?$/)?.[1]?.trim();
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
      const player = await Read_player(userId);
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
      const stoneJar = Boolean(player.圣墟唯一机缘?.石罐本体);
      player.修为 -= cost.cultivation;
      player.血气 -= cost.blood;
      const result = resolveFlowerTribulation(player, Math.random, { eraIndex, stoneJar });
      if (result.reason === 'dao') return e.reply(`【道则未圆】请先完成${daoGate.rule.name}，再引动专属渡劫。`);
      await Write_player(userId, player);
      await refreshAttributes(userId);

      if (!result.ok) {
        return e.reply([
          `【${result.rule.name}${result.reason === 'mutated' ? '·始祖异变' : '·渡劫失败'}】`,
          `在「${result.failedStage}」阶段，花粉潮汐反噬本源。`,
          `成功率：${(result.chance * 100).toFixed(1)}%｜失败保护：${result.failures}次`,
          `始祖污染度 +${result.pollutionGain}（当前${player.始祖污染度}/100），隐患${player.花粉隐患}。`,
          '渡劫消耗已结算，可净化隐患后再次发送 #花粉渡劫。',
        ].join('\n'));
      }
      return e.reply([
        `【${result.rule.name}·渡劫成功】`,
        `你渡过：${result.stages.map(stage => `${stage.name}✓`).join(' → ')}`,
        `进化积淀 +${result.rewardAccumulation}｜隐患 -${result.riskRelief}｜始祖污染 -${result.pollutionRelief}`,
        '专属渡劫印记已留下，发送 #进化继续冲击下一境。',
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

import { plugin, verc, data } from '../../api/api.js';
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
  completeFlowerExtremeTrial,
  ensureFlowerPollenState,
  getBestBreathingMethod,
  getFlowerEvolutionChance,
  getFlowerEvolutionCost,
  getNextFlowerExtremeTrial,
  getRequiredPollenQuality,
  resolveFlowerEvolution,
} from '../../model/flowerPollenPath.js';
import { getShanghaiDateKey } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const MEDIA_BY_QUALITY = Object.entries(FLOWER_POLLEN_MEDIA)
  .sort((a, b) => a[1].quality - b[1].quality);

function realmName(levelId) {
  return data.huafen_list.find(item => Number(item.level_id) === Number(levelId))?.level || '未知境界';
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
        { reg: '^#净化隐患$', fnc: 'purify' },
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
    const lines = [
      '【花粉进化路】',
      `境界：${realmName(player.huafenlevel_id)}${player.花粉路分支 ? `（${player.花粉路分支}）` : ''}`,
      `进化积淀：${player.进化积淀}｜花粉隐患：${player.花粉隐患}/200`,
      `呼吸法：${breathing || '尚未掌握'}`,
      `极境：${player.花粉极境.length ? player.花粉极境.join('、') : '无'}`,
    ];
    if (nextRealm) {
      const required = getRequiredPollenQuality(nextRealm.level_id);
      lines.push(`下一境：${nextRealm.level}｜需${required}阶进化媒介｜修为、血气各${bigNumberTransform(getFlowerEvolutionCost(player.huafenlevel_id))}`);
    } else {
      lines.push('你已走到当前花粉进化路的尽头。');
    }
    if (trial) lines.push(`待挑战极境：${realmName(trial.realmLevel)}·${trial.name}（需积淀${trial.accumulation}${trial.maxRisk === undefined ? '' : `，隐患不高于${trial.maxRisk}`}）`);
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
      player.进化积淀 += 8;
      await Write_player(userId, player);
      return e.reply([
        '【天地异变】',
        `你循着灵性粒子的潮汐寻到普通进化花粉×${ordinaryAmount}${mediumName === '普通进化花粉' ? '' : `、${mediumName}×1`}${dew ? '、净化花露×1' : ''}${stoneJarBonus ? `；石罐又凝聚${mediumName}×1` : ''}。`,
        '进化积淀 +8',
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

      const requiredQuality = getRequiredPollenQuality(player.huafenlevel_id + 1);
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

      const cost = getFlowerEvolutionCost(player.huafenlevel_id);
      if (Number(player.修为) < cost || Number(player.血气) < cost) {
        return e.reply(`进化需修为、血气各${bigNumberTransform(cost)}。`);
      }
      const ancestorSeed = Number(await exist_najie_thing(userId, '花粉路祖种', '道具')) > 0;
      const chance = getFlowerEvolutionChance(player, mediumName, { ancestorSeed });
      const beforeRealm = realmName(player.huafenlevel_id);
      const result = resolveFlowerEvolution(player, mediumName, Math.random, { ancestorSeed });
      if (result.reason === 'quality') return e.reply(`该媒介品阶不足，此次进化至少需要${result.requiredQuality}阶花粉。`);

      player.修为 -= cost;
      player.血气 -= cost;
      await Add_najie_thing(userId, mediumName, '道具', -1);
      await Write_player(userId, player);
      await refreshAttributes(userId);
      if (!result.ok) {
        return e.reply([
          '【进化受阻】',
          `成功率：${(chance * 100).toFixed(1)}%｜${mediumName}已消耗`,
          ancestorSeed ? '花粉路祖种与你共鸣，进化稳定性提高。' : '',
          `境界仍为${beforeRealm}，积淀增至${player.进化积淀}，隐患增至${player.花粉隐患}。`,
        ].filter(Boolean).join('\n'));
      }
      return e.reply([
        '【生命跃迁】',
        `${beforeRealm} → ${realmName(player.huafenlevel_id)}${result.branch ? `（${result.branch}路）` : ''}`,
        `成功率：${(chance * 100).toFixed(1)}%｜积淀${player.进化积淀}｜隐患${player.花粉隐患}`,
        ancestorSeed ? '花粉路祖种与你共鸣，进化稳定性提高。' : '',
        getNextFlowerExtremeTrial(player) ? '当前境界存在极境，可发送 #极尽蜕变 查看并尝试。' : '你的生命层次完成了一次跃迁。',
      ].filter(Boolean).join('\n'));
    });
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
      if (player.花粉隐患 <= 0) return e.reply('你的进化根基澄澈，没有需要净化的隐患。');
      if (Number(await exist_najie_thing(userId, '净化花露', '道具')) <= 0) return e.reply('净化隐患需要净化花露，可通过 #感应异变 获得。');
      const before = player.花粉隐患;
      const purification = player.圣墟唯一机缘?.石罐本体 ? 60 : 30;
      player.花粉隐患 = Math.max(0, before - purification);
      await Add_najie_thing(userId, '净化花露', '道具', -1);
      await Write_player(userId, player);
      return e.reply(`你以净化花露洗炼生命本源，花粉隐患 ${before} → ${player.花粉隐患}。`);
    });
  }
}

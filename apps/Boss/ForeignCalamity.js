import { plugin, data } from '../../api/api.js';
import {
  Add_najie_thing,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
  bigNumberTransform,
  existplayer,
  get_fight_img,
  zd_battle,
} from '../../model/xiuxian.js';
import {
  FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS,
  FOREIGN_CALAMITY_MAX_ACTIVE,
  FOREIGN_OVERLORD_REFINEMENT_WEIGHT,
  FOREIGN_PAGE_REQUIREMENT,
  FOREIGN_TECHNIQUES,
  applyForeignOverlordBattleResult,
  createForeignOverlordCombatant,
  createForeignCalamityRewardPlan,
  drainPendingForeignCalamityDefeats,
  formatForeignCalamityCullReport,
  getForeignOverlordRanking,
  getForeignOverlordRewardForPlayer,
  listForeignCalamities,
  listForeignOverlords,
  normalizeRiftMemoryState,
  readActiveForeignOverlord,
  readForeignCalamity,
  readForeignCalamityCullReport,
  readForeignOverlord,
  readForeignOverlordProgress,
  registerForeignCalamityDefeat,
  resolveRiftMemoryReward,
  saveForeignOverlord,
  spawnForeignOverlordIfReady,
  saveForeignCalamity,
  withForeignCalamityLock,
  withForeignOverlordLock,
} from '../../model/foreignCalamity.js';
import { REFINEMENT_ATTRIBUTE_GAIN, applyTianmoCalamityRefinement, getCalamityRefinementResourceGains } from '../../model/tianmoHuasheng.js';
import { addRelicToBag, normalizeRelicState } from '../../model/relicSystem.js';
import { isEvilCultivator } from '../../model/tianjiaoHostility.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { getSuiyunStage } from '../../model/suiyun.js';
import { multiplySuiyunLoot } from '../../model/suiyunLoot.js';

const REFINE_KEY = (qq, kind = 'calamity') => kind === 'overlord'
  ? `xiuxian:foreign-calamity:overlord:refine:${qq}`
  : `xiuxian:foreign-calamity:refine:${qq}`;
const BATTLE_COOLDOWN_KEY = qq => `xiuxian:foreign-calamity:battle-cooldown:${qq}`;
const OVERLORD_BATTLE_COOLDOWN_KEY = qq => `xiuxian:foreign-calamity:overlord:battle-cooldown:${qq}`;
const PLAYER_HISTORY_LIMIT = 200;

function rememberPlayerHistory(record, key) {
  record[key] = Date.now();
  const keys = Object.keys(record);
  for (let index = 0; index < keys.length - PLAYER_HISTORY_LIMIT; index++) {
    delete record[keys[index]];
  }
}

function playerId(e) {
  return e.user_id.toString().replace('qg_', '');
}

function rewardGroupText(group) {
  if (group.type === 'relic') return `${group.relic.品质}·${group.relic.name}x1`;
  return `${group.name}x${group.amount}`;
}

function formatEntity(entity, index) {
  const hp = Math.max(0, Number(entity.当前血量) || 0);
  const maxHp = Math.max(1, Number(entity.血量上限) || 1);
  return [
    `${index + 1}.【${entity.type}】${entity.名号}（${entity.id}）`,
    `气血：${bigNumberTransform(hp)}/${bigNumberTransform(maxHp)}｜额外体系：${entity.额外体系}`,
    `境界：秘境${entity.mijinglevel_id}阶・仙古${entity.xiangulevel_id}阶・花粉${entity.huafenlevel_id}阶`,
  ].join('\n');
}

async function sendBattleLog(e, lines) {
  const messages = Array.isArray(lines) ? lines : [String(lines || '')];
  for (let start = 0; start < messages.length; start += 20) {
    const image = await get_fight_img(e, messages.slice(start, start + 20));
    if (image) await e.reply(image);
  }
}

export class ForeignCalamity extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_千年域外灾厄',
      dsc: '千年生成的孽兽、域外邪魔与外道修士',
      event: 'message',
      priority: 590,
      rule: [
        { reg: '^#(?:域外灾厄|域外邪祟|域外邪魔)$', fnc: 'showCalamities' },
        { reg: '^#讨伐(?:域外灾厄|域外邪祟|域外邪魔)(?:\\s+(.+))?$', fnc: 'battleCalamity' },
        { reg: '^#领取域外战利品$', fnc: 'claimPendingRewards' },
        { reg: '^#灾厄魔主$', fnc: 'showOverlord' },
        { reg: '^#讨伐灾厄魔主$', fnc: 'battleOverlord' },
        { reg: '^#灾厄魔主贡献$', fnc: 'showOverlordRanking' },
        { reg: '^#领取魔主战利品$', fnc: 'claimOverlordRewards' },
        { reg: '^#天魔炼化魔主$', fnc: 'refineCalamity' },
        { reg: '^#天魔炼化(?:灾厄|邪祟)$', fnc: 'refineCalamity' },
        { reg: '^#合成域外功法(?:\\s+(.+))?$', fnc: 'composeTechnique' },
      ],
    });
  }

  async getActive() {
    return (await listForeignCalamities())
      .filter(entity => entity.status === 'active' && Number(entity.当前血量) > 0)
      .sort((a, b) => Number(b.worldYear) - Number(a.worldYear) || a.id.localeCompare(b.id));
  }

  async showCalamities(e) {
    const active = await this.getActive();
    const report = await readForeignCalamityCullReport();
    return e.reply([
      `【千年域外灾厄】现存${active.length}/${FOREIGN_CALAMITY_MAX_ACTIVE}尊`,
      '孽兽、域外邪魔与外道修士共享上限，超额目标由天骄或诸天强者优先讨灭旧敌。',
      ...(!active.length ? ['当前诸天安宁，尚未发现存世的域外灾厄；跨过新的千年节点后会再次降临。'] : []),
      ...active.map(formatEntity),
      ...(report?.count ? [`最近一次巡猎记录：\n${formatForeignCalamityCullReport(report)}`] : []),
      '使用 #讨伐域外灾厄 编号（或灾厄ID/名号）发起挑战。',
    ].join('\n\n'));
  }

  async resolveTarget(input) {
    const active = await this.getActive();
    const keyword = String(input || '').trim();
    if (!keyword) return null;
    if (/^\d+$/.test(keyword)) return active[Number(keyword) - 1] || null;
    return active.find(entity => entity.id === keyword || entity.名号 === keyword)
      || active.find(entity => entity.名号.includes(keyword));
  }

  async battleCalamity(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const input = String(e.msg || '').replace(/^#讨伐(?:域外灾厄|域外邪祟|域外邪魔)\s*/, '').trim();
    const target = await this.resolveTarget(input);
    if (!target) return e.reply('未找到这尊灾厄，请先发送 #域外灾厄 查看编号。');

    const result = await withForeignCalamityLock(target.id, async () => {
      const entity = await readForeignCalamity(target.id);
      if (!entity || entity.status !== 'active') return { message: '这尊灾厄已经被其他修士镇压。' };
      return withPlayerMutationLock(qq, async () => {
        const player = await Read_player(qq);
        if (Number(player.当前血量) <= 0) return { message: '你当前气血枯竭，先恢复状态再来讨伐。' };
        const now = Date.now();
        const cooldownKey = BATTLE_COOLDOWN_KEY(qq);
        const cooldownUntil = Number(await redis.get(cooldownKey)) || 0;
        if (cooldownUntil > now) {
          return { message: `域外讨伐尚在调息，还需${Math.ceil((cooldownUntil - now) / 60000)}分钟。` };
        }
        const reserved = await redis.set(cooldownKey, String(now + FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS), {
          NX: true,
          EX: Math.ceil(FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS / 1000),
        });
        if (reserved !== 'OK') return { message: '域外讨伐尚在调息，请稍后再试。' };
        const attacker = {
          ...player,
          灵根: player.灵根 || { name: '普通灵根', 法球倍率: 1 },
          法球倍率: player.灵根?.法球倍率 || player.法球倍率 || 1,
        };
        const defender = { ...entity, 灵根: entity.灵根 || { name: entity.type, 法球倍率: 1 } };
        const battle = await zd_battle(attacker, defender, { battleType: 'foreign_calamity' });
        player.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(Number(battle.A_hp) || 1)) : 1;
        await Write_player(qq, player);

        entity.当前血量 = battle.winner === 'A' ? 0 : Math.max(1, Math.trunc(Number(battle.B_hp) || 1));
        let reward = null;
        let overlordSpawn = null;
        if (battle.winner === 'A') {
          entity.status = 'defeated';
          entity.defeatedBy = qq;
          entity.defeatedByName = player.名号;
          entity.defeatedAt = Date.now();
          entity.rewardPlan ||= createForeignCalamityRewardPlan(entity);
        }
        await saveForeignCalamity(entity);
        if (battle.winner === 'A') {
          overlordSpawn = await registerForeignCalamityDefeat(entity.id);
          if (!overlordSpawn?.busy) {
            entity.overlordKillRegisteredAt = Date.now();
            await saveForeignCalamity(entity);
          }
        }

        if (battle.winner === 'A') {
          try {
            reward = await this.grantReward(qq, entity);
          } catch (error) {
            console.error(`[域外灾厄] 奖励结算暂缓 entity=${entity.id} player=${qq}`, error);
            reward = { pending: true, lines: ['奖励方案已经锁定，本次写盘暂缓。'] };
          }
          if (isEvilCultivator(player) || getSuiyunStage(player)) {
            await redis.set(REFINE_KEY(qq), JSON.stringify({
              entityId: entity.id,
              name: entity.名号,
              attack: entity.攻击,
              defense: entity.防御,
              maxHp: entity.血量上限,
              lifeSource: entity.生命本源,
            }), { EX: 5 * 60 });
          }
        }
        return { battle, entity, reward, overlordSpawn, evil: battle.winner === 'A' && isEvilCultivator(player), suiyun: battle.winner === 'A' && getSuiyunStage(player) > 0 };
      });
    });

    if (result.busy) return e.reply('已有修士正在挑战这尊灾厄，请稍候。');
    if (result.message) return e.reply(result.message);
    const lines = [...(Array.isArray(result.battle.msg) ? result.battle.msg : [result.battle.msg])];
    if (result.battle.winner === 'A') {
      lines.push('', `【域外灾厄伏诛】${result.entity.名号}已被你镇压。`, ...(result.reward?.lines || []));
      if (result.overlordSpawn?.spawned) {
        lines.push('', `【裂界魔临】十方灾息汇聚，${result.overlordSpawn.entity.名号}已从裂界彼端降临！`, '发送 #灾厄魔主 查看，使用 #讨伐灾厄魔主 参与全服讨伐。');
      }
      if (result.reward?.pending) lines.push('遗珍背包清理后发送 #领取域外战利品，可继续结算已锁定的奖励。');
      if (result.evil) lines.push('魔念牵引其残存本源：5分钟内发送 #天魔炼化灾厄 可再炼其道果。');
      if (result.suiyun) lines.push('月华笼罩灾厄本源：5分钟内发送 #月华炼化 灾厄，可获得月华值与生命本源。');
    } else {
      lines.push('', `【讨伐失利】${result.entity.名号}剩余气血：${bigNumberTransform(result.entity.当前血量)}/${bigNumberTransform(result.entity.血量上限)}`);
    }
    await sendBattleLog(e, lines);
    return true;
  }

  async showOverlord(e) {
    await drainPendingForeignCalamityDefeats();
    let entity = await readActiveForeignOverlord();
    if (!entity) {
      const ensured = await spawnForeignOverlordIfReady();
      entity = ensured?.entity || ensured?.active || null;
    }
    if (!entity) {
      const progress = await readForeignOverlordProgress();
      const remaining = Math.max(0, progress.nextSpawn - progress.killCount);
      return e.reply(`当前没有灾厄魔主降临。\n全服已镇压普通域外灾厄${progress.killCount}尊，距离下一次魔临还差${remaining}尊左右。`);
    }
    const ranking = getForeignOverlordRanking(entity).slice(0, 5);
    return e.reply([
      `【灾厄魔主】${entity.名号}`,
      `气血：${bigNumberTransform(entity.当前血量)}/${bigNumberTransform(entity.血量上限)}`,
      `攻/防：${bigNumberTransform(entity.攻击)}/${bigNumberTransform(entity.防御)}｜速度：1000｜暴击：100%｜暴伤：300%`,
      `额外体系：练气、炼体、秘境、仙古、花粉均为16级`,
      `生死状态：${entity.revived ? '已经逆命复生，全属性永久提升25%' : '逆命劫生经尚未触发'}`,
      '',
      ranking.length ? '【当前贡献】' : '尚无修士对其本体造成有效伤害。',
      ...ranking.map((item, index) => `${index + 1}. ${item.name}：${bigNumberTransform(item.damage)}`),
      '',
      '使用 #讨伐灾厄魔主 发起挑战。',
    ].join('\n'));
  }

  async showOverlordRanking(e) {
    const active = await readActiveForeignOverlord();
    const entity = active || (await listForeignOverlords()).find(item => item.status === 'defeated');
    if (!entity) return e.reply('尚未留下任何灾厄魔主的讨伐记录。');
    const ranking = getForeignOverlordRanking(entity);
    return e.reply([
      `【${entity.名号}·贡献榜】${entity.status === 'active' ? '讨伐中' : '已伏诛'}`,
      ...(ranking.length
        ? ranking.slice(0, 20).map((item, index) => `${index + 1}. ${item.name}：${bigNumberTransform(item.damage)}（${item.challenges || 1}战）`)
        : ['暂无有效贡献。']),
    ].join('\n'));
  }

  async battleOverlord(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const target = await readActiveForeignOverlord();
    if (!target) return e.reply('当前没有灾厄魔主降临。');

    const result = await withForeignOverlordLock(target.id, async () => {
      const entity = await readForeignOverlord(target.id);
      if (!entity || entity.status !== 'active') return { message: '灾厄魔主刚刚已经被镇压。' };
      return withPlayerMutationLock(qq, async () => {
        const player = await Read_player(qq);
        if (Number(player.当前血量) <= 0) return { message: '你当前气血枯竭，先恢复状态再来讨伐。' };
        const now = Date.now();
        const cooldownKey = OVERLORD_BATTLE_COOLDOWN_KEY(qq);
        const cooldownUntil = Number(await redis.get(cooldownKey)) || 0;
        if (cooldownUntil > now) {
          return { message: `魔主讨伐尚在调息，还需${Math.ceil((cooldownUntil - now) / 60000)}分钟。` };
        }
        const reserved = await redis.set(cooldownKey, String(now + FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS), {
          NX: true,
          EX: Math.ceil(FOREIGN_CALAMITY_BATTLE_COOLDOWN_MS / 1000),
        });
        if (reserved !== 'OK') return { message: '魔主讨伐尚在调息，请稍后再试。' };

        const attacker = {
          ...player,
          灵根: player.灵根 || { name: '普通灵根', 法球倍率: 1 },
          法球倍率: player.灵根?.法球倍率 || player.法球倍率 || 1,
        };
        const defender = createForeignOverlordCombatant(entity);
        const battle = await zd_battle(attacker, defender, {
          battleType: 'foreign_overlord',
          preserveHpOnTimeout: true,
        });
        player.当前血量 = Math.max(1, Math.trunc(Number(battle.A_hp) || 1));
        await Write_player(qq, player);

        const settled = applyForeignOverlordBattleResult(entity, battle, {
          playerId: qq,
          playerName: player.名号,
          now,
        });
        const evil = entity.status === 'defeated' && isEvilCultivator(player);
        const suiyun = entity.status === 'defeated' && getSuiyunStage(player) > 0;
        if (evil || suiyun) {
          entity.refinement = {
            playerId: qq,
            expiresAt: Date.now() + 5 * 60 * 1000,
            weight: FOREIGN_OVERLORD_REFINEMENT_WEIGHT,
            sourceLifeEssence: entity.生命本源,
          };
        }
        await saveForeignOverlord(entity);
        if (evil || suiyun) {
          try {
            await redis.set(REFINE_KEY(qq, 'overlord'), JSON.stringify({
              entityId: entity.id,
              name: entity.名号,
              lifeSource: entity.refinement.sourceLifeEssence,
              kind: 'overlord',
              weight: entity.refinement.weight,
            }), {
              EX: Math.max(1, Math.ceil((entity.refinement.expiresAt - Date.now()) / 1000)),
            });
          } catch (error) {
            console.error(`[灾厄魔主] 炼化凭证写入暂缓 entity=${entity.id} player=${qq}`, error);
          }
        }
        let chainedSpawn = null;
        if (entity.status === 'defeated') chainedSpawn = await spawnForeignOverlordIfReady();
        return { battle, entity, damage: settled.damage, revived: settled.revivedDuringBattle, chainedSpawn, evil, suiyun };
      });
    });

    if (result.busy) return e.reply('已有修士正在裂界中与魔主交锋，请稍候。');
    if (result.message) return e.reply(result.message);
    const lines = [...(Array.isArray(result.battle.msg) ? result.battle.msg : [result.battle.msg])];
    lines.push('', `【本次贡献】对魔主本体造成${bigNumberTransform(result.damage)}点有效伤害。`);
    if (result.revived) lines.push('【逆命劫生】魔主解除一切控制、满血复生，全属性永久提升25%，并抢得一瞬再行动！');
    if (result.entity.status === 'defeated') {
      lines.push('', `【灾厄魔主伏诛】${result.entity.名号}的道果开始崩解。`, '所有有效贡献者可发送 #领取魔主战利品 结算个人奖励与裂界残忆。');
      if (result.evil) lines.push('魔主本源已被你截留：5分钟内发送 #天魔炼化魔主；天魔化生一脉可折算0.5名玩家的化生进度。');
      if (result.suiyun) lines.push('魔主本源已被月华截留：5分钟内发送 #月华炼化 魔主。');
      if (result.chainedSpawn?.spawned) lines.push(`积压的灾息再度汇聚，新的魔主【${result.chainedSpawn.entity.名号}】已经降临。`);
    } else {
      lines.push(`魔主共享气血：${bigNumberTransform(result.entity.当前血量)}/${bigNumberTransform(result.entity.血量上限)}`);
    }
    await sendBattleLog(e, lines);
    return true;
  }

  async grantOverlordReward(qq, entity) {
    return withPlayerMutationLock(qq, async () => {
      const reward = getForeignOverlordRewardForPlayer(entity, qq);
      if (!reward) return { lines: ['你未对这尊魔主造成有效本体伤害。'], ineligible: true };
      const player = await Read_player(qq);
      player._foreignOverlordClaims ||= {};
      entity.rewardClaims ||= {};
      if (player._foreignOverlordClaims[entity.id]) {
        entity.rewardClaims[qq] ||= { claimedAt: Date.now() };
        await saveForeignOverlord(entity);
        return { lines: ['这尊魔主的个人战利品此前已完整结算。'], already: true };
      }

      reward.pageAmount = multiplySuiyunLoot(player, { name: reward.page }, reward.pageAmount);
      await Add_najie_thing(qq, reward.page, '道具', reward.pageAmount, undefined, 1, {
        idempotencyKey: `foreign-overlord:${entity.id}:${qq}:page`,
      });
      const oldKarma = Math.max(0, Number(player.业力值) || 0);
      player.业力值 = Math.max(0, oldKarma - reward.karmaReduction);
      player.位面青睐 = Math.max(0, Number(player.位面青睐) || 0) + reward.planeFavor;
      const memory = resolveRiftMemoryReward(player.彼岸残忆, {
        bossId: entity.id,
        playerId: qq,
      });
      player.彼岸残忆 = memory.state;
      rememberPlayerHistory(player._foreignOverlordClaims, entity.id);
      await Write_player(qq, player);

      entity.rewardClaims[qq] = {
        claimedAt: Date.now(),
        rank: reward.rank,
        damage: reward.damage,
        memoryGranted: memory.granted,
      };
      await saveForeignOverlord(entity);
      const memoryLine = memory.granted
        ? '魔主残魂中浮现裂界彼岸的完整坐标，你已获得【裂界残忆】。'
        : memory.alreadyUnlocked
          ? '你已掌握裂界彼岸的完整残忆。'
          : `只截取到一段破碎残忆，保底进度${memory.state.pity}/3。`;
      return {
        lines: [
          `贡献排名：第${reward.rank}名｜有效伤害：${bigNumberTransform(reward.damage)}`,
          `获得${reward.page}x${reward.pageAmount}、业力-${Math.min(oldKarma, reward.karmaReduction)}、位面青睐+${reward.planeFavor}`,
          memoryLine,
        ],
      };
    });
  }

  async claimOverlordRewards(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const pending = (await listForeignOverlords()).filter(entity =>
      entity.status === 'defeated' && Number(entity.contributions?.[qq]?.damage) > 0 && !entity.rewardClaims?.[qq]
    );
    if (!pending.length) {
      const player = await Read_player(qq);
      const memory = normalizeRiftMemoryState(player.彼岸残忆);
      return e.reply(memory.unlocked
        ? '当前没有待领取的魔主战利品，你已持有完整【裂界残忆】。'
        : `当前没有待领取的魔主战利品，裂界残忆保底进度${memory.pity}/3。`);
    }

    const lines = ['【灾厄魔主个人战利品】'];
    for (const entity of pending) {
      let claim;
      try {
        claim = await withForeignOverlordLock(entity.id, async () => {
          const fresh = await readForeignOverlord(entity.id);
          if (!fresh) return { lines: [`${entity.名号}：记录已经消散`] };
          return this.grantOverlordReward(qq, fresh);
        });
      } catch (error) {
        console.error(`[灾厄魔主] 个人奖励补领失败 entity=${entity.id} player=${qq}`, error);
        claim = { pending: true, lines: [`${entity.名号}：结算暂缓，奖励仍保持锁定`] };
      }
      if (claim.busy) lines.push(`${entity.名号}：正在结算，请稍候`);
      else lines.push(`${entity.名号}：\n${(claim.lines || []).join('\n')}`);
      if (claim.pending) break;
    }
    return e.reply(lines.join('\n\n'));
  }

  async grantReward(qq, entity) {
    return withPlayerMutationLock(qq, async () => {
      const plan = entity.rewardPlan;
      if (!plan) throw new Error(`灾厄${entity.id}缺少奖励方案`);
      const player = await Read_player(qq);
      player._foreignCalamityClaims ||= {};
      if (player._foreignCalamityClaims[entity.id]) {
        entity.rewardClaimedAt ||= Date.now();
        await saveForeignCalamity(entity);
        return { lines: ['奖励此前已完整结算。'], already: true };
      }

      const rewardGroups = plan.groups.map(group => group.type === 'relic' ? group : {
        ...group, amount: multiplySuiyunLoot(player, group, group.amount),
      });
      const relicGroup = rewardGroups.find(group => group.type === 'relic');
      let equipment = null;
      if (relicGroup) {
        equipment = await Read_equipment(qq);
        const relicState = normalizeRelicState(equipment.遗珍);
        const owned = [...relicState.背包, ...Object.values(relicState.铭刻).flat().filter(Boolean)];
        if (!owned.some(relic => relic.id === relicGroup.relic.id)) {
          try {
            equipment.遗珍 = addRelicToBag(relicState, relicGroup.relic);
          } catch (error) {
            if (error.message === '遗珍背包已满') return { pending: true, lines: ['遗珍背包已满，本次全部奖励已锁定。'] };
            throw error;
          }
        }
      }

      for (let index = 0; index < rewardGroups.length; index++) {
        const group = rewardGroups[index];
        if (group.type === 'relic') continue;
        await Add_najie_thing(qq, group.name, group.class, group.amount, undefined, 1, {
          idempotencyKey: `${plan.id}:${index}`,
        });
      }
      if (equipment) await Write_equipment(qq, equipment);
      const oldKarma = Math.max(0, Number(player.业力值) || 0);
      player.业力值 = Math.max(0, oldKarma - plan.karmaReduction);
      player.位面青睐 = Math.max(0, Number(player.位面青睐) || 0) + plan.planeFavor;
      rememberPlayerHistory(player._foreignCalamityClaims, entity.id);
      await Write_player(qq, player);
      entity.rewardClaimedAt = Date.now();
      await saveForeignCalamity(entity);
      return {
        lines: [
          `随机奖励：${rewardGroups.map(rewardGroupText).join('、')}`,
          `固定收益：业力-${Math.min(oldKarma, plan.karmaReduction)}、位面青睐+${plan.planeFavor}`,
        ],
      };
    });
  }

  async claimPendingRewards(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const pending = (await listForeignCalamities()).filter(entity =>
      entity.status === 'defeated' && entity.defeatedBy === qq && !entity.rewardClaimedAt
    );
    if (!pending.length) return e.reply('当前没有待领取的域外战利品。');
    const lines = [];
    for (const entity of pending) {
      let result;
      try {
        result = await withForeignCalamityLock(entity.id, async () => {
          const fresh = await readForeignCalamity(entity.id);
          if (!fresh || fresh.rewardClaimedAt) return { lines: [`${entity.名号}：已结算`] };
          return this.grantReward(qq, fresh);
        });
      } catch (error) {
        console.error(`[域外灾厄] 补领失败 entity=${entity.id} player=${qq}`, error);
        result = { pending: true, lines: ['写盘暂缓，奖励仍保持锁定'] };
      }
      if (result.busy) lines.push(`${entity.名号}：正在结算，请稍候`);
      else lines.push(`${entity.名号}：${(result.lines || []).join('；')}`);
      if (result.pending) break;
    }
    return e.reply(['【域外战利品补领】', ...lines].join('\n'));
  }

  async refineCalamity(e) {
    const qq = playerId(e);
    const kind = String(e.msg || '').includes('魔主') ? 'overlord' : 'calamity';
    const key = REFINE_KEY(qq, kind);
    const result = await withForeignCalamityLock(`refine:${qq}`, async () => {
      let raw = await redis.get(key);
      if (!raw && kind === 'overlord') {
        const now = Date.now();
        const source = (await listForeignOverlords()).find(entity =>
          entity.refinement?.playerId === qq
          && !entity.refinement.claimedAt
          && Number(entity.refinement.expiresAt) > now
        );
        if (source) {
          raw = JSON.stringify({
            entityId: source.id,
            name: source.名号,
            lifeSource: source.refinement.sourceLifeEssence,
            kind: 'overlord',
            weight: source.refinement.weight,
          });
          await redis.set(key, raw, {
            EX: Math.max(1, Math.ceil((Number(source.refinement.expiresAt) - now) / 1000)),
          });
        }
      }
      if (!raw) return { message: `当前没有被你镇压、可供炼化的${kind === 'overlord' ? '灾厄魔主' : '域外灾厄'}。` };
      return withPlayerMutationLock(qq, async () => {
        const player = await Read_player(qq);
        const avatarName = getActiveZhutianAvatarName(player);
        if (avatarName) {
          return { message: `当前正装载化身【${avatarName}】，请先发送 #装载化身 本源，再炼化域外本源。` };
        }
        if (!isEvilCultivator(player)) return { message: '你的魔道修为尚不足以炼化这份域外本源。' };
        const pending = JSON.parse(raw);
        player._foreignCalamityRefines ||= {};
        if (player._foreignCalamityRefines[pending.entityId]) {
          await redis.del(key);
          return { message: `这尊${kind === 'overlord' ? '魔主' : '灾厄'}的本源此前已经炼化。` };
        }
        const { cultivation, blood, soul } = getCalamityRefinementResourceGains(player);
        player.修为 = (Number(player.修为) || 0) + cultivation;
        player.血气 = (Number(player.血气) || 0) + blood;
        player.元神 = (Number(player.元神) || 0) + soul;
        player.魔道值 = (Number(player.魔道值) || 0) + 50;
        const tianmoGrowth = applyTianmoCalamityRefinement(player, {
          sourceLifeEssence: pending.lifeSource,
          weight: pending.weight,
        });
        if (tianmoGrowth.applied) player.法球倍率 = player.灵根.法球倍率;
        rememberPlayerHistory(player._foreignCalamityRefines, pending.entityId);
        await Write_player(qq, player);
        await redis.del(key);
        const lines = [
          `【天魔炼化】${pending.name}的残存本源被你炼入魔躯。`,
          `修为+${bigNumberTransform(cultivation)}｜血气+${bigNumberTransform(blood)}｜元神+${bigNumberTransform(soul)}｜魔道值+50`,
        ];
        if (tianmoGrowth.applied) {
          const weight = tianmoGrowth.refinementWeight;
          const attributeGain = Number((REFINEMENT_ATTRIBUTE_GAIN * weight).toFixed(3));
          lines.push(
            `天魔化生进度+${weight}人｜生命本源+${tianmoGrowth.lifeSourceGain}`,
            `法球倍率 ${(tianmoGrowth.previousOrb * 100).toFixed(0)}%→${(tianmoGrowth.currentOrb * 100).toFixed(0)}%｜灵根攻、防、生各+${tianmoGrowth.attributeCapped ? '0' : attributeGain}`,
          );
          if (tianmoGrowth.attributeCapped) lines.push('灵根攻、防、生已达自身灵根1.5倍上限，不再增长');
          if (tianmoGrowth.lifeSourceCapped) lines.push('生命本源已达上限（自身灵根本源2倍），本次本源散逸');
          if (tianmoGrowth.evolved) lines.push('万灵归一，你已蜕变为【无相·万化天魔体】！');
        }
        return { message: lines.join('\n') };
      });
    });
    if (result?.busy) return e.reply('这份域外本源正在炼化中，请稍候。');
    return e.reply(result.message);
  }

  async composeTechnique(e) {
    const qq = playerId(e);
    if (!await existplayer(qq)) return e.reply('玩家不存在，请先创建角色。');
    const input = String(e.msg || '').replace(/^#合成域外功法\s*/, '').replace(/残页$/, '').trim();
    const technique = FOREIGN_TECHNIQUES.find(item => item.name === input)
      || FOREIGN_TECHNIQUES.find(item => item.name.includes(input) && input);
    if (!technique) {
      return e.reply(['请输入要合成的功法名，例如：#合成域外功法 太虚观界经', ...FOREIGN_TECHNIQUES.map(item => `${item.category}：${item.name}`)].join('\n'));
    }

    return withPlayerMutationLock(qq, async () => {
      const najie = await Read_najie(qq);
      najie.道具 ||= [];
      najie.功法 ||= [];
      const pages = najie.道具.find(item => item.name === technique.page);
      const amount = Math.max(0, Number(pages?.数量) || 0);
      if (amount < FOREIGN_PAGE_REQUIREMENT) {
        return e.reply(`${technique.page}不足：${amount}/${FOREIGN_PAGE_REQUIREMENT}。`);
      }
      pages.数量 -= FOREIGN_PAGE_REQUIREMENT;
      najie.道具 = najie.道具.filter(item => Number(item.数量) > 0);
      const owned = najie.功法.find(item => item.name === technique.name);
      if (owned) owned.数量 = (Number(owned.数量) || 0) + 1;
      else {
        const item = data.gongfa_list.find(entry => entry.name === technique.name);
        if (!item) throw new Error(`功法数据缺失：${technique.name}`);
        najie.功法.push({ ...JSON.parse(JSON.stringify(item)), 数量: 1, islockd: 1 });
      }
      await Write_najie(qq, najie);
      return e.reply(`十页归一，道文重现。获得【${technique.category}·${technique.name}】x1。`);
    });
  }
}

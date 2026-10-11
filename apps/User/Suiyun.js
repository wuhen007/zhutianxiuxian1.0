import fs from 'node:fs';
import path from 'node:path';
import { plugin, verc, data, config } from '../../api/api.js';
import {
  Add_najie_thing, ForwardMsg, Read_equipment, Read_najie, Read_player,
  Write_equipment, Write_najie, Write_player, __PATH, channel, existplayer,
  invalidateBattleEquipmentCache, player_efficiency, zd_battle,
} from '../../model/xiuxian.js';
import {
  activateSuiyun, advanceSuiyun, applySuiyunTrialResult, ascendSuiyunPalace,
  buildSuiyunTrialBattle, convertSuiyunPower, cultivateSuiyun, ensureSuiyunState,
  getSuiyunEffects, getSuiyunLifeMaximum, getSuiyunLotusBonus, getSuiyunPower, getSuiyunStage, refineSuiyun,
  settleSuiyunPalace, spendSuiyunPower, SUIYUN_PET_NAME, SUIYUN_PET_STAGE,
} from '../../model/suiyun.js';
import { claimSuiyunUnique, releaseSuiyunUnique } from '../../model/suiyunRegistry.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { swapEquipmentState } from '../../model/equipmentSwap.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { getSuperdimensionalRewriteTarget } from '../../model/shengfaFragment.js';
import {
  applyInitialMinggeEffectsRaw, createPlayerMingge, rollbackInitialMinggeEffects,
} from '../../model/mingge.js';
import {
  FORBIDDEN_COOLDOWN_MS, forbiddenCooldownKey, getForbiddenProtection,
  protectForbiddenTarget,
} from '../../model/forbiddenSoul.js';
import { withForeignCalamityLock } from '../../model/foreignCalamity.js';
import { BOSS4 } from '../Boss/BOSS4.js';
import RealmEvents from '../tasks/RealmEvents.js';

const STAGES = ['月华之体', '月华似剑', '霜月剑尊', '岁云化身', '岁云剑尊'];
const ERAS = ['神话时代', '太古时代', '天命时代', '末法时代', '绝灵时代'];
const APTITUDES = ['无化如是', '生而愚痴', '天弃之人', '先天不足', '平庸之资', '超凡资质', '天纵之资', '旷世奇才', '绝世天骄', '万古无双', '无演无尽'];
const FINAL_EQUIPMENT = ['岁云袍', '岁云剑', '云月之莲', '无上天阙枝'];
const worldFile = () => path.join(data.lib_path, '小世界列表.json');
const saveWorlds = () => fs.writeFileSync(worldFile(), JSON.stringify(data.xiaoshijie, null, 2));
const duration = ms => `${Math.max(1, Math.ceil(Number(ms) / 60000))}分钟`;

function withPlayerLocks(ids, task) {
  const ordered = [...new Set(ids.map(String))].sort();
  const acquire = index => index === ordered.length
    ? task() : withPlayerMutationLock(ordered[index], () => acquire(index + 1));
  return acquire(0);
}

function transactionFor(ids, inventory = false) {
  const transaction = new FileRollbackTransaction();
  for (const qq of ids) {
    transaction.capture(path.join(__PATH.player_path, `${qq}.json`));
    if (inventory) transaction.capture(path.join(__PATH.najie_path, `${qq}.json`));
  }
  return transaction;
}

async function savePlayers(entries) {
  const transaction = transactionFor(entries.map(([qq]) => qq));
  try {
    for (const [qq, player] of entries) await Write_player(qq, player);
    transaction.commit();
  } catch (error) {
    transaction.rollback();
    throw error;
  }
}

export function parseSuiyunRewrite(e) {
  const text = e?.message?.filter?.(item => item.type === 'text')
    .map(item => item.text || '').join(' ') || e?.msg || '';
  const command = String(text).replace(/^#岁云更改\s*/, '')
    .replace(/\[CQ:at,[^\]]*\]|@\S+/g, '').trim();
  const match = command.match(/^(时代|先天至宝线索|至宝线索|命格|天资|灵根)\s*(.*?)\s*$/);
  return match ? { kind: match[1].replace('先天至宝线索', '至宝线索'), name: match[2] } : null;
}

export class Suiyun extends plugin {
  constructor() {
    super({
      name: '岁云月华灵根', dsc: '月华五阶、试炼、炼化与岁云权柄',
      event: 'message', priority: 570,
      rule: [
        { reg: '^#(?:消耗|使用|服用|炼化)\\s*岁云的?残念(?:\\s*\\*?1)?$', fnc: 'consumeRemnant' },
        { reg: '^#岁云见证$', fnc: 'advance' },
        { reg: '^#引月入体$', fnc: 'moonTrial' },
        { reg: '^#化霜入剑$', fnc: 'frostTrial' },
        { reg: '^#月之见证$', fnc: 'witnessTrial' },
        { reg: '^#月华炼化.*$', fnc: 'refine' },
        { reg: '^#云月修炼$', fnc: 'cultivate' },
        { reg: '^#云月之莲$', fnc: 'showLotus' },
        { reg: '^#岁云之力(?:\\s*兑换(?:\\s+\\d+)?)?$', fnc: 'power' },
        { reg: '^#岁云更改.*$', fnc: 'rewrite' },
      ],
    });
  }

  async context(e) {
    if (!verc({ e })) return null;
    const qq = String(await channel(String(e.user_id).replace('qg_', '')));
    return await existplayer(qq) ? { qq } : null;
  }

  holderError(player, requireTechnique = false) {
    const avatar = getActiveZhutianAvatarName(player);
    if (avatar) return `当前装载化身【${avatar}】，请先发送 #装载化身 本源。`;
    if (!getSuiyunStage(player)) return '请先在往世星海获得并消耗【岁云的残念】。';
    if (requireTechnique && !player.学习的功法?.includes('月华炼天功')) return '请先学习【月华炼天功】，再运转月华炼化。';
    return '';
  }

  async refreshAttributes(qq) {
    await Write_equipment(qq, await Read_equipment(qq));
    await player_efficiency(qq);
  }

  async refreshLotusAttributes(qq, player) {
    const equipment = await Read_equipment(qq);
    const bonus = getSuiyunLotusBonus(player, equipment);
    if (bonus.active) await Write_equipment(qq, equipment);
    return bonus;
  }

  async showLotus(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const bonus = await this.refreshLotusAttributes(ctx.qq, player);
      return e.reply([
        '【云月之莲·月华养器】',
        `累计炼化月华：${bonus.moonlight}点（独立于可消费余额）`,
        `每点累计月华：攻击、防御、生命上限各+${bonus.perMoonlight.toLocaleString('zh-CN')}`,
        `已积累成长：攻、防、生各+${(bonus.moonlight * bonus.perMoonlight).toLocaleString('zh-CN')}`,
        bonus.active ? '当前共鸣：已装备，成长属性已生效。' : '当前共鸣：未装备本人云月之莲，成长已保存，装备后生效。',
        '通过 #月华炼化 玩家/天骄/灾厄 累积；不额外消耗月华，兑换岁云之力不削减成长。',
        '云月修炼不计入炼化成长；旧档从新增统计时开始记录，不按余额猜补历史。',
      ].join('\n'));
    });
  }

  async sendBattle(e, battle) {
    if (!Array.isArray(battle.msg) || !battle.msg.length) return;
    try { await ForwardMsg(e, battle.msg); }
    catch (error) { console.error('[岁云] 战报发送失败:', error?.message); }
  }

  async consumeRemnant(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      if (getSuiyunStage(player)) return e.reply('月华已入命，无需重复消耗残念。');
      const avatar = getActiveZhutianAvatarName(player);
      if (avatar) return e.reply(`请先发送 #装载化身 本源，再承接岁云残念。`);
      const najie = await Read_najie(ctx.qq);
      if (najie.时间线封锁?.locked) return e.reply('当前纳戒处于时间线封锁，请先解除封锁。');
      const entries = Object.values(najie).filter(Array.isArray).flat();
      const remnant = entries.find(item => ['岁云的残念', '岁云残念'].includes(item?.name) && Number(item.数量) >= 1);
      if (!remnant) return e.reply('纳戒中尚无【岁云的残念】。');
      const timeline = String(player.时间线ID || player.世界线ID || 'main');
      const claim = await claimSuiyunUnique('root', ctx.qq, { timeline });
      if (!claim.ok) return e.reply('这条时间线已有岁云一脉承继者。');
      const transaction = transactionFor([ctx.qq], true);
      try {
        const result = activateSuiyun(player);
        if (!result.ok) throw new Error(result.reason);
        remnant.数量 -= 1;
        if (await Write_najie(ctx.qq, najie) === false) throw new Error('纳戒写入被封锁');
        await Add_najie_thing(ctx.qq, '月华炼天功', '功法', 1, undefined, 1, {
          idempotencyKey: 'suiyun:initial-technique',
        });
        await Write_player(ctx.qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        if (!claim.alreadyOwned) await releaseSuiyunUnique('root', ctx.qq, { timeline });
        throw error;
      }
      const world = data.xiaoshijie.find(item => String(item.player_qq) === ctx.qq);
      if (world && ascendSuiyunPalace(world)) saveWorlds();
      await this.refreshAttributes(ctx.qq);
      return e.reply([
        '【月华初生】岁云残念融入本源，你获得【月华之体】，天资化作【岁云】！',
        '获得《月华炼天功》x1，请发送 #学习月华炼天功。',
        world ? '小世界升华为【月华天宫】，每现实小时产出0.5点岁云之力与50点仙道潜力。' : '开辟小世界后将自动升华为月华天宫。',
        '发送 #岁云之力 查看传承；依次完成 #引月入体、#化霜入剑、#月之见证 后，以 #岁云见证 晋升。',
      ].join('\n'));
    });
  }

  async grantStagePet(qq, player) {
    if (getSuiyunStage(player) < SUIYUN_PET_STAGE || player.岁云?.仙宠已领取) return false;
    const najie = await Read_najie(qq);
    if (najie.时间线封锁?.locked) throw new Error('纳戒当前被封锁，请解锁后再次发送 #岁云见证 领取仙宠');
    // 已有奖励在出战、纳戒或栖息地时只补领取标记，避免旧档补领产生第二只。
    const world = data.xiaoshijie.find(item => String(item.player_qq) === String(qq));
    const alreadyPresent = player.仙宠?.name === SUIYUN_PET_NAME
      || najie.仙宠?.some(item => item.name === SUIYUN_PET_NAME && Number(item.数量) > 0)
      || world?.栖息地?.some(item => (item.仙宠?.name || item.pet?.name || item.name) === SUIYUN_PET_NAME);
    if (!alreadyPresent) {
      const definition = data.xianchon.find(item => item.name === SUIYUN_PET_NAME);
      if (!definition) throw new Error(`仙宠资源缺失：${SUIYUN_PET_NAME}`);
      await Add_najie_thing(qq, {
        ...structuredClone(definition), 绑定者: String(qq), 不可交易: true, 不可支取: true,
      }, '仙宠', 1, undefined, 1, { idempotencyKey: `suiyun:pet:${SUIYUN_PET_NAME}` });
    }
    // 纳戒幂等回执先落盘；玩家标记失败时重试只补写标记，不重新发放。
    const latest = await Read_player(qq);
    ensureSuiyunState(latest).仙宠已领取 = true;
    await Write_player(qq, latest);
    Object.assign(player, latest);
    return !alreadyPresent;
  }

  async grantFinalEquipment(qq, player) {
    if (getSuiyunStage(player) !== 5 || player.岁云?.套装已领取) return;
    const claim = await claimSuiyunUnique('treasure', qq);
    if (!claim.ok) throw new Error('无上天阙枝已在其他时间线认主，奖励结算已保留');
    for (const name of FINAL_EQUIPMENT) {
      await Add_najie_thing(qq, name, '装备', 1, 6, 1, { idempotencyKey: `suiyun:final:${name}` });
    }
    // 奖励幂等记录先落盘；装备失败仅回滚换装步骤，重试沿用已发放的同一批奖励。
    const transaction = transactionFor([qq], true);
    transaction.capture(path.join(__PATH.equipment_path, `${qq}.json`));
    try {
      const najie = await Read_najie(qq);
      const equipment = await Read_equipment(qq);
      for (const item of najie.装备 || []) {
        if (!FINAL_EQUIPMENT.includes(item.name)) continue;
        Object.assign(item, { 绑定者: qq, author_name: qq, 不可交易: true, 不可支取: true, 岁云专属: true, islockd: 1 });
      }
      const treasure = najie.装备?.find(item => item.name === '无上天阙枝' && Number(item.数量) > 0);
      if (!treasure) throw new Error('无上天阙枝奖励写入尚未完成');
      const swapped = swapEquipmentState(najie, equipment, { ...treasure, type: '至宝' });
      if (!swapped.ok) throw new Error(swapped.message);
      if (await Write_najie(qq, swapped.najie) === false) throw new Error('纳戒当前被封锁，请解锁后再次发送 #岁云见证');
      await Write_equipment(qq, swapped.equipment);
      const latest = await Read_player(qq);
      ensureSuiyunState(latest).套装已领取 = true;
      await Write_player(qq, latest);
      transaction.commit();
    } catch (error) {
      try { transaction.rollback(); }
      finally { invalidateBattleEquipmentCache(qq); }
      throw error;
    }
  }

  async advance(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      let petGranted = await this.grantStagePet(ctx.qq, player);
      const result = getSuiyunStage(player) === 5 ? { ok: true, name: '岁云剑尊' } : advanceSuiyun(player);
      if (!result.ok) return e.reply([
        result.reason,
        petGranted ? `已补领攻击仙宠【${SUIYUN_PET_NAME}】x1，发送 #出战仙宠${SUIYUN_PET_NAME} 出战。` : '',
      ].filter(Boolean).join('\n'));
      await Write_player(ctx.qq, player);
      petGranted = await this.grantStagePet(ctx.qq, player) || petGranted;
      await this.grantFinalEquipment(ctx.qq, player);
      await this.refreshAttributes(ctx.qq);
      return e.reply([
        `【岁云见证】当前传承：${player.灵根.name}。`,
        petGranted ? `获得攻击仙宠【${SUIYUN_PET_NAME}】x1；发送 #出战仙宠${SUIYUN_PET_NAME} 出战。` : '',
        getSuiyunStage(player) === 5 ? '岁云袍、岁云剑、云月之莲已入纳戒，无上天阙枝自动认主，皆为绑定专属。' : '',
      ].filter(Boolean).join('\n'));
    });
  }

  moonTrial(e) { return this.trial(e, 'moon'); }
  frostTrial(e) { return this.trial(e, 'frost'); }
  witnessTrial(e) { return this.trial(e, 'witness'); }

  async trial(e, route) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const trial = buildSuiyunTrialBattle(player, route, { now: Date.now() });
      if (!trial.ok) return e.reply(trial.reason);
      const battle = await zd_battle(trial.attacker, trial.enemy, { disableWanhuaHarvest: true });
      const result = applySuiyunTrialResult(player, route, battle.winner === 'A', battle.A_hp, { now: Date.now(), expectedIndex: trial.index });
      if (!result.ok) return e.reply(result.reason);
      await Write_player(ctx.qq, player);
      await this.sendBattle(e, battle);
      return e.reply([result.message || (battle.winner === 'A' ? '月华试炼通过。' : '试炼失利，进度保留。'), this.status(player)].join('\n'));
    });
  }

  async cultivate(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const result = cultivateSuiyun(player, { now: Date.now() });
      if (!result.ok) return e.reply(`${result.reason}${result.retryAt ? `（还需${duration(result.retryAt - Date.now())}）` : ''}`);
      await Write_player(ctx.qq, player);
      return e.reply(`【云月修炼】${result.message || `月华值增加${result.gain}，当前${player.月华值}点。`}\n24小时后可再次修炼。`);
    });
  }

  status(player) {
    const state = ensureSuiyunState(player);
    return `传承：${STAGES[getSuiyunStage(player) - 1]}｜月华值：${player.月华值 || 0}｜生命本源：${player.生命本源}/${getSuiyunLifeMaximum(player)}${player.岁云法则 ? '｜岁云法则：已领悟' : ''}\n引月入体 ${state.引月入体}/12 → 化霜入剑 ${state.化霜入剑}/12 → 月之见证 ${state.月之见证}/9`;
  }

  async settlePalace(qq, player) {
    const world = data.xiaoshijie.find(item => String(item.player_qq) === qq);
    if (!world) return { hours: 0, power: 0 };
    const snapshot = structuredClone(world);
    const transaction = transactionFor([qq]);
    try {
      const changed = ascendSuiyunPalace(world);
      const result = settleSuiyunPalace(player, world, { now: Date.now() });
      if (changed || result.hours > 0) {
        await Write_player(qq, player);
        saveWorlds();
      }
      transaction.commit();
      return result;
    } catch (error) {
      for (const key of Object.keys(world)) delete world[key];
      Object.assign(world, snapshot);
      // 只恢复本人的世界；其他持有者可能已在等待玩家写入时完成结算。
      try { transaction.rollback(); }
      finally { saveWorlds(); }
      throw error;
    }
  }

  async power(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const petGranted = await this.grantStagePet(ctx.qq, player);
      const palace = await this.settlePalace(ctx.qq, player);
      const exchange = String(e.msg).match(/兑换(?:\s+(\d+))?$/);
      if (exchange) {
        const amount = exchange[1] ? Number(exchange[1]) : 10000;
        const result = convertSuiyunPower(player, amount);
        if (!result.ok) return e.reply(result.reason);
        await Write_player(ctx.qq, player);
      }
      const lotus = await this.refreshLotusAttributes(ctx.qq, player);
      const effects = getSuiyunEffects(player);
      return e.reply([
        `【岁云之力】${getSuiyunPower(player).toFixed(2)}点`, this.status(player),
        palace.hours > 0 ? `本次月华天宫结算${palace.hours}小时：岁云之力+${palace.power}、仙道潜力+${palace.potentialGain}。` : '',
        petGranted ? `已补领【${SUIYUN_PET_NAME}】x1；#出战仙宠${SUIYUN_PET_NAME}。`
          : getSuiyunStage(player) >= SUIYUN_PET_STAGE ? `传承仙宠：${SUIYUN_PET_NAME}已领取；#出战仙宠${SUIYUN_PET_NAME}。`
            : `晋升霜月剑尊时赠送攻击仙宠【${SUIYUN_PET_NAME}】。`,
        `云月之莲累计炼化：${lotus.moonlight}月华｜${lotus.active ? '成长已生效' : '装备后生效'}；#云月之莲 查看成长。`,
        `悟道加成${Math.round(effects.enlightenmentBonus * 100)}%｜渡劫减伤${Math.round(effects.tribulationReduction * 100)}%｜物品获取${effects.lootMultiplier}倍`,
        `灵根幸运+${Math.round(effects.luckBonus * 100)}%｜秘境通行：${effects.freeDungeonEntry ? '免入场资源消耗' : '霜月剑尊起免入场资源消耗'}`,
        '自带战技：霜剑入月（至多9敌各9剑、每剑25倍、绝控霜寒）；岁云归一（防御反伤）；白云苍狗（每战3次复活，每次全属性+50%）。#战斗技能 查看详情。',
        '月华天宫每现实小时产出0.5点岁云之力与50点仙道潜力；#岁云之力 兑换 10000（月华值→0.1点岁云之力，可填10000的倍数）。',
        '#岁云更改 时代 时代名：5点；#岁云更改 至宝线索：10点。',
        '#岁云更改 命格/天资/灵根 名称：20点，可@目标。唯一灵根不参与改写。',
        '#云月修炼：24小时一次；#月华炼化 @目标 / 天骄 / 灾厄 / 魔主。',
      ].filter(Boolean).join('\n'));
    });
  }

  async refine(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const at = getSuperdimensionalRewriteTarget(e, '');
    if (at) return this.refinePlayer(e, ctx.qq, String(await channel(at)));
    const kind = String(e.msg).replace(/^#月华炼化\s*/, '').trim();
    if (kind === '天骄') return this.refineTianjiao(e, ctx.qq);
    if (['灾厄', '邪祟', '魔主', '灾厄魔主'].includes(kind)) return this.refineCalamity(e, ctx.qq, kind.includes('魔主'));
    return e.reply('用法：#月华炼化 @目标；#月华炼化 天骄（已镇压的求饶天骄）；#月华炼化 灾厄/魔主（讨伐获胜后5分钟内）。');
  }

  async refineTianjiao(e, qq) {
    return withPlayerMutationLock(qq, async () => {
      const player = await Read_player(qq);
      const error = this.holderError(player, true);
      if (error) return e.reply(error);
      const boss = new BOSS4();
      const pending = await boss.readPendingEncounter(qq);
      if (!pending || !['offered', 'execution', 'suiyun-settlement'].includes(pending.stage)) return e.reply('当前没有被你镇压、等待处置的天骄。');
      if (!await boss.claimPendingEncounter(pending)) return e.reply('这份天骄本源正在结算，请稍候。');
      try {
        const target = data.weimiantianjiao_list.find(item => item.名号 === pending.tianjiaoName);
        if (!target) return e.reply('该天骄已离开当前世界。');
        const claimKey = `suiyun:tianjiao:${pending.token}`;
        const death = await boss.finalizePendingTianjiaoDeath(e, pending, qq, true, { suiyun: true });
        if (!death?.settlementId) return e.reply('该天骄本世已结束或死亡结算正被占用，本次未获得月华。');
        // 死亡结算可能重建装备/属性，重新读取避免覆盖其持久化副作用。
        const latest = await Read_player(qq);
        let message = '此前月华收益已入账，继续结算天骄本源。';
        if (!latest._rewardClaims?.[claimKey]) {
          const result = refineSuiyun(latest, { targetId: claimKey, kind: '天骄', sourceLifeEssence: death.sourceLifeEssence });
          if (!result.ok) return e.reply(result.reason);
          latest._rewardClaims ||= {};
          latest._rewardClaims[claimKey] = Date.now();
          await Write_player(qq, latest);
          message = this.refinementMessage(result, latest);
        }
        // 收益已落盘的重试也重算法宝，装备写入中断不会吞掉成长或重复炼化。
        await this.refreshLotusAttributes(qq, latest);
        await redis.del(boss.getPendingEncounterKey(qq));
        await redis.set(`tianjiao:pending:resolved:${pending.token}`, 'suiyun', { EX: 24 * 3600 });
        return e.reply(`【月华炼化】${pending.tianjiaoName}的本源化为清月。\n${message}`);
      } finally { await boss.releasePendingEncounterClaim(pending); }
    });
  }

  async refineCalamity(e, qq, overlord) {
    const key = overlord ? `xiuxian:foreign-calamity:overlord:refine:${qq}` : `xiuxian:foreign-calamity:refine:${qq}`;
    const result = await withForeignCalamityLock(`refine:${qq}`, () => withPlayerMutationLock(qq, async () => {
      const player = await Read_player(qq);
      const error = this.holderError(player, true);
      if (error) return { message: error };
      const raw = await redis.get(key);
      if (!raw) return { message: '当前没有被你镇压且仍在5分钟炼化时限内的灾厄本源。' };
      const pending = JSON.parse(raw);
      if (!pending.entityId) return { message: '这份灾厄记录缺失来源，请重新讨伐。' };
      if (player._foreignCalamityRefines?.[pending.entityId]) {
        await this.refreshLotusAttributes(qq, player);
        await redis.del(key);
        return { message: '这份灾厄本源此前已经炼化。' };
      }
      const refined = refineSuiyun(player, { targetId: `calamity:${pending.entityId}`, kind: '灾厄', sourceLifeEssence: pending.lifeSource, weight: pending.weight });
      if (!refined.ok) return { message: refined.reason };
      player._foreignCalamityRefines ||= {};
      player._foreignCalamityRefines[pending.entityId] = Date.now();
      await Write_player(qq, player);
      await this.refreshLotusAttributes(qq, player);
      await redis.del(key);
      return { message: `【月华炼化】${pending.name}化为月华。\n${this.refinementMessage(refined, player)}` };
    }));
    return e.reply(result.busy ? '这份灾厄本源正在结算，请稍候。' : result.message);
  }

  refinementMessage(result, player) {
    const base = result.message || `月华值+${result.gain}，当前${player.月华值}；生命本源+${result.lifeSourceGain || 0}，当前${player.生命本源}。`;
    const gains = result.resourceGains;
    const cultivation = gains ? `\n修为+${gains.cultivation}｜血气+${gains.blood}｜元神+${gains.soul}｜仙道潜力+${gains.potential}；魔道值不变。` : '';
    return `${base}${cultivation}\n云月之莲累计炼化月华：${getSuiyunLotusBonus(player).moonlight}点，成长随法宝装备生效。`;
  }

  async refinePlayer(e, qq, targetQQ) {
    if (!e.isGroup) return e.reply('玩家炼化请在群聊中使用。');
    if (qq === targetQQ) return e.reply('请指定另一位修士作为炼化目标。');
    if (!await existplayer(targetQQ)) return e.reply('目标尚未踏入修行。');
    return withPlayerLocks([qq, targetQQ], async () => {
      const player = await Read_player(qq);
      const target = await Read_player(targetQQ);
      const error = this.holderError(player, true);
      if (error) return e.reply(error);
      const now = Date.now();
      if ((Number(player.当前血量) || 0) <= 0 || (Number(target.当前血量) || 0) <= 0) return e.reply('双方需先恢复气血再进行炼化战斗。');
      if ((player.level_id > 41 && target.level_id <= 41) || (player.level_id >= 12 && target.level_id < 12)) return e.reply('该目标处于弱者保护境界。');
      const protection = getForbiddenProtection(target, now);
      if (protection.protected) return e.reply(`目标仍受本源保护，还需${duration(protection.waitMs)}。`);
      for (const id of [qq, targetQQ]) {
        const raw = await redis.get(`xiuxian:player:${id}:action`);
        if (raw && Number(JSON.parse(raw)?.end_time) > now) return e.reply('相关修士正在其他行动中，请待行动结束。');
      }
      const cooldownKey = forbiddenCooldownKey(qq);
      if (await redis.set(cooldownKey, String(now + FORBIDDEN_COOLDOWN_MS), { NX: true, EX: Math.ceil(FORBIDDEN_COOLDOWN_MS / 1000) }) !== 'OK') return e.reply('本源炼化尚在调息，请稍后再试。');
      const battle = await zd_battle({ ...structuredClone(player), 法球倍率: player.灵根?.法球倍率 || 1, _万灵魔幡不可炼化: true }, { ...structuredClone(target), 法球倍率: target.灵根?.法球倍率 || 1, _万灵魔幡不可炼化: true }, { disableWanhuaHarvest: true });
      player.当前血量 = Math.max(0, Number(battle.A_hp) || 0);
      target.当前血量 = Math.max(0, Number(battle.B_hp) || 0);
      let result = null;
      if (battle.winner === 'A') {
        result = refineSuiyun(player, { targetId: `player:${targetQQ}:${now}`, kind: '玩家', sourceLifeEssence: target.生命本源, now });
        if (!result.ok) return e.reply(result.reason);
        target.当前血量 = 0;
        target.生命本源 = Math.max(0, (Number(target.生命本源) || 0) - Math.max(0, Number(result.lifeSourceGain) || 0));
        protectForbiddenTarget(target, now);
      }
      await savePlayers([[qq, player], [targetQQ, target]]);
      if (result) await this.refreshLotusAttributes(qq, player);
      await this.sendBattle(e, battle);
      return e.reply(result ? `【月华炼化】战胜${target.名号}，其本源融入月华。\n${this.refinementMessage(result, player)}` : '炼化战斗失利，本次未获得月华。');
    });
  }

  async rewrite(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const command = parseSuiyunRewrite(e);
    if (!command) return e.reply('用法：#岁云更改 时代 时代名（5点）/ 至宝线索（10点）/ 命格|天资|灵根 名称（20点，可@目标）。');
    const { kind, name } = command;
    const targetQQ = String(await channel(getSuperdimensionalRewriteTarget(e, ctx.qq)));
    if (!['时代', '至宝线索'].includes(kind) && !await existplayer(targetQQ)) return e.reply('目标尚未踏入修行。');
    return withPlayerLocks([ctx.qq, targetQQ], async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      await this.settlePalace(ctx.qq, player);
      const cost = kind === '时代' ? 5 : kind === '至宝线索' ? 10 : 20;
      if (getSuiyunPower(player) < cost) return e.reply(`岁云之力不足${cost}点。`);
      if (kind === '时代') {
        const index = ERAS.indexOf(name);
        if (index < 0) return e.reply(`时代名：${ERAS.join('、')}。`);
        await withPlayerMutationLock('suiyun:era-rewrite', async () => {
          const settings = config.getConfig('xiuxian', 'xiuxian') || {};
          settings.Era ||= {};
          settings.Era.current ||= { epoch: 1, totalYears: 0 };
          settings.Era.current.index = index;
          settings.Era.current.years = 0;
          const transaction = transactionFor([ctx.qq]);
          transaction.capture(config.getConfigPath('xiuxian', 'xiuxian'));
          try {
            spendSuiyunPower(player, cost);
            await Write_player(ctx.qq, player);
            config.setConfig('xiuxian', 'xiuxian', settings);
            transaction.commit();
          } catch (error) {
            transaction.rollback();
            throw error;
          }
        });
      } else if (kind === '至宝线索') {
        // 先付费再显化；只有确定没有生成事件才退款，未知写盘结果保留收费避免免费重放。
        spendSuiyunPower(player, cost);
        await Write_player(ctx.qq, player);
        const event = await RealmEvents.triggerTreasureFromTianji({ qq: ctx.qq, name: player.名号, source: '岁云之力' });
        if (!event?.ok) {
          if (!['disabled', 'all_claimed', 'all_held', 'all_manifested'].includes(event?.reason)) {
            return e.reply('至宝线索结算结果待核验，10点消耗已记录；请联系管理员核对本次事件，避免重复引发。');
          }
          player.岁云之力 = getSuiyunPower(player) + cost;
          await Write_player(ctx.qq, player);
          return e.reply('当前没有可显化的未认主先天至宝，岁云之力已退回。');
        }
        return e.reply(`${event.message || '先天至宝线索已显化，请查看当前位面大事件。'}\n消耗10点岁云之力。`);
      } else {
        const target = targetQQ === ctx.qq ? player : await Read_player(targetQQ);
        if (kind === '灵根') {
          if (getActiveZhutianAvatarName(target)) return e.reply('目标需先发送 #装载化身 本源，再改写灵根。');
          const root = data.talent_list.find(item => item.name === name);
          if (!root) return e.reply(`未知灵根：${name}`);
          if (STAGES.includes(name) || getSuiyunStage(target)) return e.reply('岁云一脉为唯一传承，仅由岁云残念与阶段见证承接。');
          target.灵根 = structuredClone(root);
          target.生命本源 = 100 + (Number(root.生命本源) || 0);
        } else if (kind === '天资') {
          if (!APTITUDES.includes(name)) return e.reply(`天资名：${APTITUDES.join('、')}。岁云天资仅随唯一传承获得。`);
          if (getSuiyunStage(target)) return e.reply('岁云传承的专属天资随灵根绑定。');
          target.天资等级 = name;
          target.天资评价 = `岁云法则重写为【${name}】`;
        } else {
          const fate = data.minggeList.find(item => item.name === name);
          if (!fate) return e.reply(`未知命格：${name}`);
          const oldId = typeof target.命格 === 'string' ? target.命格 : target.命格?.id;
          rollbackInitialMinggeEffects(target, data.minggeList.find(item => item.id === oldId)?.effects);
          target.命格 = createPlayerMingge(fate);
          target.命格.初始效果已应用 = true;
          applyInitialMinggeEffectsRaw(target, fate.effects);
        }
        spendSuiyunPower(player, cost);
        await savePlayers(targetQQ === ctx.qq ? [[ctx.qq, player]] : [[ctx.qq, player], [targetQQ, target]]);
        if (kind === '灵根') await this.refreshAttributes(targetQQ);
      }
      return e.reply(`【岁云更改】${kind}已化作【${name}】，消耗${cost}点岁云之力。`);
    });
  }
}

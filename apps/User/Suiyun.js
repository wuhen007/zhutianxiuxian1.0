import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { plugin, verc, data, config, puppeteer } from '../../api/api.js';
import Show from '../../model/show.js';
import {
  Add_najie_thing, ForwardMsg, Read_equipment, Read_najie, Read_player,
  Write_equipment, Write_najie, Write_player, __PATH, channel, existplayer,
  invalidateBattleEquipmentCache, player_efficiency, zd_battle, foundthing, GetPower, bigNumberTransform,
} from '../../model/xiuxian.js';
import {
  activateSuiyun, advanceSuiyun, applySuiyunTrialResult, ascendSuiyunPalace,
  buildSuiyunTrialBattle, cultivateSuiyun, ensureSuiyunState,
  getSuiyunEffects, getSuiyunLifeMaximum, getSuiyunLotusBonus, getSuiyunPower, getSuiyunStage, refineSuiyun,
  settleSuiyunPalace, spendSuiyunPower, spendMoonlight, SUIYUN_PET_NAME, SUIYUN_PET_LEGACY_NAME,
  SUIYUN_PET_STAGE, SUIYUN_PET_FORGING_GROWTH,
  receiveSuiyunYears, SUIYUN_PALACE_DUNGEON,
  SUIYUN_FROST_EQUIPMENT, SUIYUN_PALACE_FACTION, SUIYUN_PALACE_POSITION, SUIYUN_PALACE_TECHNIQUE,
  SUIYUN_REDEEM_LIFE_COST, SUIYUN_REDEEM_RESCUE_COST,
} from '../../model/suiyun.js';
import { claimSuiyunUnique, releaseSuiyunUnique } from '../../model/suiyunRegistry.js';
import { readSuiyunGifts, withSuiyunGiftClaim, SUIYUN_GIFT_LIMIT } from '../../model/suiyunGift.js';
import { SUIYUN_EXCLUSIVE_SKILLS } from '../../model/suiyun.js';
import { getLifeSourceRepairMaximum } from '../../model/lifeSourceRepair.js';
import { recordFactionJoin } from '../../model/factionSystem.js';
import { canRefineMemoryTarget } from '../../model/memoryPath.js';
import { getSuiyunCreationRestriction, SUIYUN_CREATION_COST } from '../../model/suiyunCreation.js';
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
import { getPlayerPlaneName } from '../../model/planeCoords.js';
import { FISHING_PLANE_NAMES, getPlaneFishConfig } from '../../model/immortalFishing.js';
import {
  deleteActiveFishKing, findFishKingByMemberId, readActiveFishKing,
  tryCreateFishKing, withFishKingLock,
} from '../../model/immortalFishKing.js';

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
        { reg: '^#月华锁魂$', fnc: 'lockSoul' },
        { reg: '^#云月修炼$', fnc: 'cultivate' },
        { reg: '^#岁岁年年.*$', fnc: 'yearGift' },
        { reg: '^#刻舟求剑$', fnc: 'palaceExplore' },
        { reg: '^#朝花夕拾.*$', fnc: 'palaceAddiction' },
        { reg: '^#月华垂钓$', fnc: 'moonFishing' },
        { reg: '^#(?:岁云剑宫商店|剑宫商店)$', fnc: 'showPalaceShop' },
        { reg: '^#云月之莲$', fnc: 'showLotus' },
        { reg: '^#赐予月华.*$', fnc: 'gift' },
        { reg: '^#岁云之力$', fnc: 'power' },
        { reg: '^#月华救赎.*$', fnc: 'redeem' },
        { reg: '^#岁云更改.*$', fnc: 'rewrite' },
        { reg: '^#岁云造物.*$', fnc: 'createItem' },
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

  async showPalaceShop(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const player = await Read_player(ctx.qq);
    if (player.势力 !== SUIYUN_PALACE_FACTION) return e.reply('岁云剑宫宝库只向本宫宫主开放。');
    const shop = Array.isArray(data.suiyunjianGongshangdian) ? data.suiyunjianGongshangdian : [];
    const balance = Math.max(0, Number(player.源石) || 0);
    const panel = {
      nickname: player.名号 || ctx.qq,
      position: player.势力职位 || SUIYUN_PALACE_POSITION,
      balance: balance.toLocaleString('zh-CN'),
      items: shop.map(item => ({
        name: item.name, category: item.class, rarity: item.稀有度,
        price: (Number(item.出售价) || 0).toLocaleString('zh-CN'),
        affordable: balance >= (Number(item.出售价) || 0),
      })),
    };
    try {
      const view = await new Show(e).get_suiyunShopData({ panel });
      const image = await puppeteer.screenshot('suiyun_shop', view);
      if (image) return e.reply(image);
    } catch (error) { console.error('[岁云剑宫商店] 图片生成失败:', error?.message); }
    return e.reply([
      `【岁云剑宫商店】宫主：${panel.nickname}｜源石：${panel.balance}`,
      ...panel.items.map(item => `${item.name}（${item.category}）｜${item.price}源石`),
      '用法：#剑宫兑换 物品名*数量，例如 #剑宫兑换 龙髓*1。',
    ].join('\n'));
  }

  async yearGift(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const selection = String(e.msg || '').replace(/^#岁岁年年\s*/, '').trim();
      const result = receiveSuiyunYears(player, selection);
      if (!result.ok) return e.reply(result.reason);
      const transaction = transactionFor([ctx.qq], true);
      const key = `suiyun-years:${randomUUID()}`;
      try {
        await Add_najie_thing(ctx.qq, result.item.name, result.item.class, result.amount, undefined, 1, { idempotencyKey: key });
        await Write_player(ctx.qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        throw error;
      }
      return e.reply(`【岁岁年年】获得${result.item.name}×1，下一次领取在现实1小时后。`);
    });
  }

  async palaceExplore(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const error = this.holderError(await Read_player(ctx.qq));
    if (error) return e.reply(error);
    const { SecretPlace } = await import('../SecretPlace/SecretPlace.js');
    return new SecretPlace().Gofairyrealm({ ...e, msg: `#镇守仙境${SUIYUN_PALACE_DUNGEON}`, reply: e.reply.bind(e) });
  }

  async palaceAddiction(e) {
    const match = String(e.msg || '').trim().match(/^#朝花夕拾(?:(?:\s*[*＊]\s*|\s+)(\d+))?$/);
    const count = Number(match?.[1] || 1);
    if (!match || !Number.isSafeInteger(count) || count < 1 || count > 12) return e.reply('用法：#朝花夕拾*1；每组10轮，可填1～12组，省略数量为1组。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const error = this.holderError(await Read_player(ctx.qq));
      if (error) return e.reply(error);
      const { SecretPlaceplus } = await import('../SecretPlace/SecretPlaceplus.js');
      return new SecretPlaceplus().Gofairyrealm({
        ...e, msg: `#沉迷仙境${SUIYUN_PALACE_DUNGEON}*${count}`, reply: e.reply.bind(e),
      });
    });
  }

  async moonFishing(e) {
    if (!e.isGroup || !e.group_id) return e.reply('月华垂钓在群聊中进行，鱼王现身后可邀请群友讨伐。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    const groupId = String(e.group_id);
    const result = await withFishKingLock(groupId, () => withPlayerMutationLock(ctx.qq, async () => {
      let player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return { message: error };
      const current = await readActiveFishKing(groupId);
      if (current) return { message: `本群已有【${current.name}】（编号${current.teamId}），请先完成当前讨伐；岁云之力未消耗。` };
      const joined = await findFishKingByMemberId(ctx.qq);
      if (joined) return { message: `你已在编号${joined.teamId}的鱼王讨伐队伍中，请先退出或完成讨伐；岁云之力未消耗。` };
      const currentPlane = getPlayerPlaneName(player);
      // 无实体水域的位面，以月华钓线随机连通已有水域，保证成功时必出鱼王。
      const plane = getPlaneFishConfig(currentPlane)?.king ? currentPlane
        : FISHING_PLANE_NAMES[Math.floor(Math.random() * FISHING_PLANE_NAMES.length)];
      const king = getPlaneFishConfig(plane)?.king;
      if (!king) return { message: '诸天水域资料尚未就绪，请稍后再试；岁云之力未消耗。' };
      await this.settlePalace(ctx.qq, player);
      player = await Read_player(ctx.qq);
      const freshError = this.holderError(player);
      if (freshError) return { message: freshError };
      if (getSuiyunPower(player) < 3) return { message: '月华垂钓需要3点岁云之力，当前余额不足。' };
      const transaction = transactionFor([ctx.qq]);
      let created;
      try {
        if (!spendSuiyunPower(player, 3)) throw new Error('岁云之力余额已变化');
        await Write_player(ctx.qq, player);
        created = await tryCreateFishKing({
          groupId, ownerId: ctx.qq, ownerName: player.名号, plane, king,
          ownerPower: GetPower(player.攻击, player.防御, player.血量上限, player.暴击率),
        });
        if (!created) {
          transaction.rollback();
          return { message: '鱼王现身过程被打断，本次3点岁云之力已退回，请重试。' };
        }
        transaction.commit();
      } catch (error) {
        try {
          if (created && (await readActiveFishKing(groupId))?.id === created.id) await deleteActiveFishKing(groupId);
        } finally { transaction.rollback(); }
        throw error;
      }
      return { message: [
        `【月华垂钓·${king.name}】`,
        `消耗3点岁云之力，月华钓线贯穿${plane}水脉，必定钓起鱼王；剩余${getSuiyunPower(player)}点。`,
        `你已成为垂钓者并自动入队，讨伐编号：${created.teamId}。`,
        `群友发送 #加入鱼王讨伐 ${created.teamId}，再用 #讨伐鱼王。`,
      ].join('\n') };
    }));
    return e.reply(result.busy ? '鱼王正在翻动界潮，请稍后再试；岁云之力未消耗。' : result.message);
  }

  async createItem(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      let player = await Read_player(ctx.qq);
      const holderError = this.holderError(player);
      if (holderError) return e.reply(holderError);
      if (getSuiyunStage(player) < SUIYUN_PET_STAGE) return e.reply('岁云造物自【霜月剑尊】阶段起开放，请先 #岁云见证。');
      const name = String(e.msg || '').replace(/^#岁云造物\s*/, '').trim();
      if (!name || /[*×\r\n]|\s[+-]?\d+(?:\.\d+)?$/.test(name)
        || e.at || e.message?.some(item => item.type === 'at') || /@|\[CQ:at/.test(name)) {
        return e.reply('用法：#岁云造物 物品名；每次固定1件，消耗10点岁云之力，不填写数量或艾特。');
      }
      const item = await foundthing(name, { readOnly: true });
      if (!item || item.name !== name) return e.reply('未找到该物品，请使用完整物品名。');
      const restriction = getSuiyunCreationRestriction(item);
      if (restriction) return e.reply(restriction);
      const before = await Read_najie(ctx.qq);
      if (before.时间线封锁?.locked) return e.reply('纳戒当前被时间线封锁，请先解除封锁。');
      // 天宫产出单独结算，造物失败仅回滚本次扣费与发放。
      await this.settlePalace(ctx.qq, player);
      player = await Read_player(ctx.qq);
      if (getSuiyunStage(player) < SUIYUN_PET_STAGE || getActiveZhutianAvatarName(player)) return e.reply('请装载本源、且达到霜月剑尊以上阶段后再造物。');
      if (getSuiyunPower(player) < SUIYUN_CREATION_COST) return e.reply('岁云之力不足10点。');
      const itemClass = item.class === '道种' ? '道具' : item.class;
      const quantity = inventory => (inventory[itemClass] || [])
        .filter(entry => entry.name === name).reduce((total, entry) => total + Math.max(0, Number(entry.数量) || 0), 0);
      const previousQuantity = quantity(before);
      const transaction = transactionFor([ctx.qq], true);
      const idempotencyKey = `suiyun-create:${randomUUID()}`;
      try {
        if (!spendSuiyunPower(player, SUIYUN_CREATION_COST)) throw new Error('岁云之力余额已变化');
        await Write_player(ctx.qq, player);
        await Add_najie_thing(ctx.qq, name, itemClass, 1, undefined, 1, { idempotencyKey, readOnlyLookup: true });
        const delivered = await Read_najie(ctx.qq);
        if (delivered._rewardClaims?.[idempotencyKey]?.amount !== 1 || quantity(delivered) !== previousQuantity + 1) {
          throw new Error('造物发放回执或数量未核实');
        }
        transaction.commit();
      } catch (error) {
        console.error('[岁云造物] 结算失败:', error);
        try { transaction.rollback(); }
        catch (rollbackError) {
          console.error('[岁云造物] 回滚失败:', rollbackError);
          return e.reply('造物结算与恢复发生异常，请先联系管理员核对岁云之力与纳戒。');
        }
        return e.reply('造物结算中断，本次消耗与物品已恢复，请稍后重试。');
      }
      return e.reply(`【岁云造物】获得【${name}】×1，消耗10点岁云之力，剩余${getSuiyunPower(player)}点。`);
    });
  }

  async gift(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    if (e.at === 'all' || e.message?.some(item => item.type === 'at' && item.qq === 'all')) {
      return e.reply('请单独@一位修士承接月华传承。');
    }
    const mentions = new Set((e.message || []).filter(item => item.type === 'at').map(item => String(item.qq)));
    if (e.at) mentions.add(String(e.at));
    if (mentions.size > 1) return e.reply('一次只能@一位修士，避免把永久名额授予错误目标。');
    const at = getSuperdimensionalRewriteTarget(e, '');
    const targetQQ = at ? String(await channel(at)) : '';
    return withPlayerLocks(targetQQ ? [ctx.qq, targetQQ] : [ctx.qq], async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      if (!targetQQ) {
        const claims = readSuiyunGifts();
        return e.reply([
          `【赐予月华】全服名额 ${claims.length}/${SUIYUN_GIFT_LIMIT}`,
          ...Array.from({ length: SUIYUN_GIFT_LIMIT }, (_, index) => {
            const claim = claims.find(entry => entry.slot === index + 1);
            return `${index + 1}：${claim ? `${claim.recipientName}（${claim.delivered ? '已传授' : '待原目标重试完成'}）` : '空缺'}`;
          }),
          `用法：#赐予月华 @目标，一次传授${SUIYUN_EXCLUSIVE_SKILLS.join('、')}；每位目标占一个永久名额。`,
        ].join('\n'));
      }
      if (targetQQ === ctx.qq) return e.reply('你已掌握月华三技，请选择另一位修士。');
      if (!await existplayer(targetQQ)) return e.reply('目标尚未踏入修行。');
      const target = await Read_player(targetQQ);
      if (getSuiyunStage(target) || getSuiyunStage({ 灵根: target.诸天镜系统?.本源灵根 })) {
        return e.reply('目标已持有岁云灵根，自带月华三技，无需占用传承名额。');
      }
      const result = await withSuiyunGiftClaim(ctx.qq, targetQQ, target.名号, async claim => {
        target.月华传承 = {
          授予者: claim.ownerId, 受赐者: claim.recipientId, 名额: claim.slot,
          传授时间: claim.at, 技能: [...SUIYUN_EXCLUSIVE_SKILLS],
        };
        return await Write_player(targetQQ, target);
      });
      if (!result.ok) return e.reply(result.reason);
      if (result.alreadyGranted) return e.reply(`${target.名号 || targetQQ}此前已获月华三技，仍占用第${result.claim.slot}席，本次未新增名额。`);
      return e.reply(`【赐予月华】${target.名号 || targetQQ}承接第${result.claim.slot}席传承，获得${SUIYUN_EXCLUSIVE_SKILLS.join('、')}。\n三技自动参与战斗；#战斗技能 查看详情。`);
    });
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
        '通过 #月华炼化 玩家/天骄/灾厄 累积；不额外消耗月华，兑换仙道潜力不削减成长。',
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
        recordFactionJoin(player, SUIYUN_PALACE_FACTION, SUIYUN_PALACE_POSITION, Date.now(), true);
        remnant.数量 -= 1;
        if (await Write_najie(ctx.qq, najie) === false) throw new Error('纳戒写入被封锁');
        await Add_najie_thing(ctx.qq, '月华炼天功', '功法', 1, undefined, 1, {
          idempotencyKey: 'suiyun:initial-technique',
        });
        await Add_najie_thing(ctx.qq, SUIYUN_PALACE_TECHNIQUE, '功法', 1, undefined, 1, {
          idempotencyKey: 'suiyun:palace-technique',
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
        `获得《月华炼天功》x1，请发送 #学习月华炼天功。`,
        `月华映照宗庭，你自动入主【${SUIYUN_PALACE_FACTION}】，位登【${SUIYUN_PALACE_POSITION}】；并得宫主帝经《${SUIYUN_PALACE_TECHNIQUE}》x1。`,
        '宫主权限：#剑宫兑换 物品名（岁云剑宫宝库）；#开启剑宫宝库（每日供奉）。',
        world ? '小世界升华为【月华天宫】，每现实小时产出50点仙道潜力；岁云化身起另产0.1点岁云之力。' : '开辟小世界后将自动升华为月华天宫，岁云化身起每现实小时产0.1岁云之力。',
        '发送 #岁云之力 查看传承；依次完成 #引月入体、#化霜入剑、#月之见证 后，以 #岁云见证 晋升。',
      ].join('\n'));
    });
  }

  /**
   * 旧档剑灵改名与双能力补写：把「霜月剑灵」统一为【岁云剑灵】，并补齐炼器成长，
   * 避免改名后被判定为未持有、重复发放第二只。
   */
  async migrateSuiyunPet(qq, najie, player, world) {
    let changed = false;
    const patch = pet => {
      if (!pet || typeof pet !== 'object') return;
      if (pet.name === SUIYUN_PET_LEGACY_NAME) {
        pet.name = SUIYUN_PET_NAME;
        changed = true;
      }
      if (pet.name !== SUIYUN_PET_NAME) return;
      if (pet.来源 === '岁云传承·霜月剑尊') { pet.来源 = '岁云传承·岁云剑宫'; changed = true; }
      if (!Array.isArray(pet.附加能力) || !pet.附加能力.some(entry => entry?.type === '炼器')) {
        pet.附加能力 = [{ type: '炼器', 成长值: SUIYUN_PET_FORGING_GROWTH }];
        changed = true;
      }
    };
    for (const pet of najie?.仙宠 || []) patch(pet);
    let worldChanged = false;
    for (const slot of world?.栖息地 || []) {
      const before = changed;
      patch(slot?.仙宠 || slot?.pet || slot);
      if (changed !== before) worldChanged = true;
    }
    patch(player?.仙宠);
    if (changed) {
      if (await Write_najie(qq, najie) === false) throw new Error('纳戒当前被封锁，请解锁后再次发送 #岁云见证');
      // 出战仙宠改名同样落盘，否则后续重读会把它当成未持有并二次发放。
      await Write_player(qq, player);
      if (worldChanged) saveWorlds();
    }
    return changed;
  }

  async grantStagePet(qq, player) {
    if (getSuiyunStage(player) < SUIYUN_PET_STAGE || player.岁云?.仙宠已领取) return false;
    const najie = await Read_najie(qq);
    if (najie.时间线封锁?.locked) throw new Error('纳戒当前被封锁，请解锁后再次发送 #岁云见证 领取仙宠');
    // 已有奖励在出战、纳戒或栖息地时只补领取标记，避免旧档补领产生第二只。
    const world = data.xiaoshijie.find(item => String(item.player_qq) === String(qq));
    const migrated = await this.migrateSuiyunPet(qq, najie, player, world);
    if (migrated) Object.assign(player, await Read_player(qq));
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

  async grantFrostEquipment(qq, player) {
    if (getSuiyunStage(player) < 3 || player.岁云?.霜月套装已领取) return false;
    const najie = await Read_najie(qq);
    if (najie.时间线封锁?.locked) throw new Error('纳戒当前被封锁，请解锁后再次领取霜月套装');
    for (const name of SUIYUN_FROST_EQUIPMENT) {
      const definition = data.tszb_list.find(item => item.name === name);
      if (!definition) throw new Error(`霜月装备资源缺失：${name}`);
      await Add_najie_thing(qq, {
        ...structuredClone(definition), 绑定者: String(qq), author_name: String(qq),
      }, '装备', 1, 6, 1, { idempotencyKey: `suiyun:frost:${name}` });
    }
    // 三件回执先入库；中断重试只补尚缺的装备，旧角色查看面板即可补领。
    const latest = await Read_player(qq);
    ensureSuiyunState(latest).霜月套装已领取 = true;
    await Write_player(qq, latest);
    Object.assign(player, latest);
    return true;
  }

  async advance(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      let petGranted = await this.grantStagePet(ctx.qq, player);
      let frostGranted = await this.grantFrostEquipment(ctx.qq, player);
      const result = getSuiyunStage(player) === 5 ? { ok: true, name: '岁云剑尊' } : advanceSuiyun(player);
      if (!result.ok) return e.reply([
        result.reason,
        petGranted ? `已补领仙宠【${SUIYUN_PET_NAME}】x1，发送 #出战仙宠${SUIYUN_PET_NAME} 出战。` : '',
        frostGranted ? '已补领霜月剑、霜月剑袍、霜月之莲，三件齐备全属性10倍。' : '',
      ].filter(Boolean).join('\n'));
      await Write_player(ctx.qq, player);
      try {
        petGranted = await this.grantStagePet(ctx.qq, player) || petGranted;
        frostGranted = await this.grantFrostEquipment(ctx.qq, player) || frostGranted;
        await this.grantFinalEquipment(ctx.qq, player);
      } finally {
        // 灵根已晋升落盘，奖品发放中断也要按新阶段重算；重试只补缺失装备。
        await this.refreshAttributes(ctx.qq);
      }
      return e.reply([
        `【岁云见证】当前传承：${player.灵根.name}。`,
        petGranted ? `获得仙宠【${SUIYUN_PET_NAME}】x1；发送 #出战仙宠${SUIYUN_PET_NAME} 出战。` : '',
        frostGranted ? '霜月剑、霜月剑袍、霜月之莲已入纳戒，穿戴三件时攻、防、生命倍率为10倍。' : '',
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
      if (changed || result.changed) {
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
    const text = String(e.msg || '').trim();
    if (text !== '#岁云之力') return e.reply('用法：#岁云之力 查看传承面板。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const petGranted = await this.grantStagePet(ctx.qq, player);
      const frostGranted = await this.grantFrostEquipment(ctx.qq, player);
      const palace = await this.settlePalace(ctx.qq, player);
      const lotus = await this.refreshLotusAttributes(ctx.qq, player);
      const effects = getSuiyunEffects(player);
      return e.reply([
        `【岁云之力】${getSuiyunPower(player).toFixed(2)}点`, this.status(player),
        palace.hours > 0 || palace.power > 0 ? `本次月华天宫结算：岁云之力+${palace.power}、仙道潜力+${palace.potentialGain}。` : '',
        frostGranted ? '已补领霜月三件套，使用原装备指令穿戴，齐套全属性10倍。' : '',
        petGranted ? `已补领【${SUIYUN_PET_NAME}】x1；#出战仙宠${SUIYUN_PET_NAME}。`
          : getSuiyunStage(player) >= SUIYUN_PET_STAGE ? `传承仙宠：${SUIYUN_PET_NAME}已领取；#出战仙宠${SUIYUN_PET_NAME}（战斗三维＋炼器成长${SUIYUN_PET_FORGING_GROWTH}）。`
            : `晋升霜月剑尊时赠送仙宠【${SUIYUN_PET_NAME}】，兼具战斗与炼器成长。`,
        `云月之莲累计炼化：${lotus.moonlight}月华｜${lotus.active ? '成长已生效' : '装备后生效'}；#云月之莲 查看成长。`,
        `悟道加成${Math.round(effects.enlightenmentBonus * 100)}%｜渡劫减伤${Math.round(effects.tribulationReduction * 100)}%｜物品获取${effects.lootMultiplier}倍`,
        `灵根幸运+${Math.round(effects.luckBonus * 100)}%｜秘境通行：${effects.freeDungeonEntry ? '免入场资源消耗' : '霜月剑尊起免入场资源消耗'}`,
        '自带战技：霜剑入月（至多9敌各9剑、每剑25倍、绝控霜寒，低于15%斩杀禁复活）；岁云归一（防御反伤）；白云苍狗（每战3次复活）；岁云常青（免疫即死、禁复活、禁疗，讨伐天骄单次至多斩落40%气血）；如月长存（渡劫濒死自保复活）。#战斗技能 查看详情。',
        `宫主权柄：#剑宫兑换 物品名（岁云剑宫宝库）、#开启剑宫宝库（每日一次供奉）；宫主帝经《${SUIYUN_PALACE_TECHNIQUE}》。`,
        '全系列被动：免疫绝灵侵蚀与寿元压制。#岁岁年年 [材料/潜力丹/大衍悟道丹/悟道古茶]：每现实小时领取1件；#刻舟求剑：探索岁云殿堂。',
        '岁云剑尊齐套（岁云剑＋岁云袍＋云月之莲）：位面穿梭只耗修为与血气，不耗寿元、无需等待、不必先记坐标。',
        'PVP同境裁决：对手额外体系等效境界高于自己时，本场强制压到同境；PVE不生效，双方存档境界不变。',
        '#岁岁年年 祈愿 临字秘/九秘：指定九秘之一或随机一本；祈愿 真龙宝术/十凶宝术 可取十凶一族宝术；与原奖励共用一小时冷却。',
        '#月华救赎：100点月华恢复满生命本源，可对他人；目标被关押时200点即可从大牢捞人。',
        '#月华锁魂：搜魂已镇压的天骄，必定成功；无需搜魂大法，不受神魂自爆反噬。',
        '转职炼器师获月华仙炉与大空火种；#一键完美开炉 每次消耗10000点月华值。',
        '#月华垂钓：群内消耗3点岁云之力，必出鱼王并自动成为垂钓者；无需鱼钩或饵料。',
        '#朝花夕拾*1：沉迷岁云殿堂，每组10轮，可填1～12组，免入场资源消耗。',
        '月华天宫每现实小时产出50点仙道潜力；岁云化身及后续阶段另产0.1点岁云之力。#剑宫兑换 查看商店图片。',
        '月华值只用于月华救赎，不再兑换潜力。',
        '#赐予月华 @目标：传授三项专属战技，全服限定三名；不带@查看名额。',
        `#岁云造物 物品名：霜月剑尊起开放，每次10点岁云之力造1件，稀有度不限，唯一归属规则保留。`,
        '#岁云更改（霜月剑尊起开放）时代 时代名：5点；#岁云更改 至宝线索：10点。',
        '#岁云更改 命格/天资/灵根 名称：20点，可@目标。唯一灵根不参与改写。',
        '#云月修炼：24小时一次；#月华炼化 @目标 / 天骄 / 灾厄 / 魔主。',
      ].filter(Boolean).join('\n'));
    });
  }

  /** 月华救赎：100点月华兑满生命本源，可指向他人；目标被关押时200点从大牢捞人。 */
  async redeem(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const targetQQ = String(await channel(getSuperdimensionalRewriteTarget(e, ctx.qq)));
    if (!await existplayer(targetQQ)) return e.reply('目标尚未踏入修行。');
    return withPlayerLocks(targetQQ === ctx.qq ? [ctx.qq] : [ctx.qq, targetQQ], async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const isSelf = targetQQ === ctx.qq;
      const target = isSelf ? player : await Read_player(targetQQ);
      const name = target.名号 || targetQQ;
      await this.settlePalace(ctx.qq, player);
      const prison = await this.readPrisonState(targetQQ);
      const cost = prison.jailed ? SUIYUN_REDEEM_RESCUE_COST : SUIYUN_REDEEM_LIFE_COST;
      if (Number(player.月华值 || 0) < cost) {
        return e.reply(`【月华救赎】${prison.jailed ? '从大牢捞人' : '恢复满生命本源'}需要${cost}点月华值，当前仅有${Math.floor(Number(player.月华值) || 0)}点。`);
      }
      const transaction = transactionFor(isSelf ? [ctx.qq] : [ctx.qq, targetQQ]);
      try {
        if (!spendMoonlight(player, cost)) throw new Error('月华值余额已变化');
        if (prison.jailed) {
          if (prison.actionKey) await redis.del(prison.actionKey);
          const maxHp = Math.max(1, Number(target.血量上限) || 1);
          target.当前血量 = maxHp;
          target.修为 = Math.floor((Number(target.修为) || 0) * 0.85);
          target.救赎记录 = Array.isArray(target.救赎记录) ? target.救赎记录 : [];
          target.救赎记录.push({ 类型: `${SUIYUN_PALACE_FACTION}月华救赎·解放`, 时间: new Date().toLocaleString('zh-CN') });
        } else {
          const maximum = getLifeSourceRepairMaximum(target);
          target.生命本源 = maximum;
        }
        await savePlayers(isSelf ? [[ctx.qq, player]] : [[ctx.qq, player], [targetQQ, target]]);
        transaction.commit();
      } catch (err) {
        transaction.rollback();
        throw err;
      }
      if (prison.jailed) {
        return e.reply([
          `【月华救赎·解放】月华垂落，斩断${name}身周的永寂锁链。`,
          `消耗${cost}点月华值，${name}已脱离${prison.label}，气血归满、修为保留85%。`,
          `剩余月华值：${Math.floor(Number(player.月华值) || 0)}点。`,
        ].join('\n'));
      }
      return e.reply([
        `【月华救赎·本源】月华化作柔和光雨，${isSelf ? '你的' : `${name}的`}生命本源重归圆满。`,
        `消耗${cost}点月华值，生命本源恢复至${target.生命本源}。`,
        `剩余月华值：${Math.floor(Number(player.月华值) || 0)}点。`,
      ].join('\n'));
    });
  }

  /** 读取目标关押状态（黑暗牢笼、天牢、禁闭）。 */
  async readPrisonState(qq) {
    const actionKey = `xiuxian:player:${qq}:action`;
    const raw = await redis.get(actionKey);
    if (!raw) return { jailed: false, label: '', actionKey };
    let action;
    try { action = JSON.parse(raw); } catch { return { jailed: false, label: '', actionKey }; }
    if (action?.heianlaolong) return { jailed: true, label: '黑暗牢笼', actionKey };
    if (action?.action === '天牢') return { jailed: true, label: '天牢', actionKey };
    if (action?.action === '禁闭') return { jailed: true, label: '禁闭', actionKey };
    return { jailed: false, label: '', actionKey };
  }

  async refine(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const at = getSuperdimensionalRewriteTarget(e, '');
    if (at) return this.refinePlayer(e, ctx.qq, String(await channel(at)));
    const { command, label } = this.refinementConfig();
    const kind = String(e.msg).replace(`#${command}`, '').trim();
    if (kind === '天骄') return this.refineTianjiao(e, ctx.qq);
    if (['灾厄', '邪祟', '魔主', '灾厄魔主'].includes(kind)) return this.refineCalamity(e, ctx.qq, kind.includes('魔主'));
    return e.reply(`用法：#${command} @目标；#${command} 天骄（已镇压的求饶天骄）；#${command} 灾厄/魔主（讨伐获胜后5分钟内）。`);
  }

  refinementConfig() { return { prefix: 'suiyun', command: '月华炼化', label: '月华', ignoreTargetProtection: true }; }
  refineReward(player, options) { return refineSuiyun(player, options); }
  afterRefinement(qq, player) { return this.refreshLotusAttributes(qq, player); }

  async lockSoul(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const boss = new BOSS4();
      const pending = await boss.readPendingEncounter(ctx.qq);
      if (!pending || !['offered', 'execution', 'suiyun-settlement'].includes(pending.stage)) return e.reply('当前没有被你镇压、等待处置的天骄。');
      if (pending.suiyunDisposition && pending.suiyunDisposition !== 'lock-soul') return e.reply('这份本源正在月华炼化结算，请继续 #月华炼化 天骄。');
      if (pending.stage === 'suiyun-settlement' && !pending.suiyunDisposition) return e.reply('这份本源正在月华炼化结算，请继续 #月华炼化 天骄。');
      if (!await boss.claimPendingEncounter(pending)) return e.reply('这份天骄本源正在结算，请稍候。');
      try {
        const target = data.weimiantianjiao_list.find(item => item.名号 === pending.tianjiaoName);
        if (!target) return e.reply('该天骄已离开当前世界。');
        pending.suiyunDisposition = 'lock-soul';
        const death = await boss.finalizePendingTianjiaoDeath(e, pending, ctx.qq, true, { suiyun: true });
        if (!death?.settlementId) return e.reply('该天骄本世已结束或死亡结算正被占用，请稍后再试。');
        const latest = await Read_player(ctx.qq);
        const claimKey = `suiyun:lock-soul:${pending.token}`;
        let reward = '此前搜魂收益已入账，本次继续完成结算。';
        if (!latest._rewardClaims?.[claimKey]) {
          const learnable = [...new Set(target.学习的功法 || [])].filter(name => typeof name === 'string' && name && !latest.学习的功法?.includes(name));
          if (learnable.length) {
            const learned = learnable[Math.floor(Math.random() * learnable.length)];
            latest.学习的功法 ||= [];
            latest.学习的功法.push(learned);
            reward = `搜得功法记忆：【${learned}】。`;
          } else {
            const gain = Math.max(1, Math.floor((Number(latest.元神上限) || 100) * .05));
            latest.元神 = (Number(latest.元神) || 0) + gain;
            reward = `其功法皆已掌握，炼得元神+${bigNumberTransform(gain)}。`;
          }
          latest._rewardClaims ||= {};
          latest._rewardClaims[claimKey] = Date.now();
          await Write_player(ctx.qq, latest);
        }
        await redis.del(boss.getPendingEncounterKey(ctx.qq));
        await redis.set(`tianjiao:pending:resolved:${pending.token}`, 'suiyun-lock-soul', { EX: 24 * 3600 });
        return e.reply(`【月华锁魂】已锁定${pending.tianjiaoName}本源，搜魂必定成功，未触发自爆反噬。\n${reward}\n其本世道身已灭，真灵坠入轮回。`);
      } finally { await boss.releasePendingEncounterClaim(pending); }
    });
  }

  async refineTianjiao(e, qq) {
    return withPlayerMutationLock(qq, async () => {
      const player = await Read_player(qq);
      const error = this.holderError(player, true);
      if (error) return e.reply(error);
      const boss = new BOSS4();
      const pending = await boss.readPendingEncounter(qq);
      const { prefix, command, label } = this.refinementConfig();
      if (!pending || !['offered', 'execution', `${prefix}-settlement`].includes(pending.stage)) return e.reply('当前没有被你镇压、等待处置的天骄。');
      if (pending.suiyunDisposition === 'lock-soul') return e.reply('这份本源已由月华锁魂锁定，请继续 #月华锁魂 完成搜魂。');
      if (!await boss.claimPendingEncounter(pending)) return e.reply('这份天骄本源正在结算，请稍候。');
      try {
        const target = data.weimiantianjiao_list.find(item => item.名号 === pending.tianjiaoName);
        if (!target) return e.reply('该天骄已离开当前世界。');
        const claimKey = `${prefix}:tianjiao:${pending.token}`;
        if (prefix === 'suiyun') pending.suiyunDisposition = 'refine';
        const death = await boss.finalizePendingTianjiaoDeath(e, pending, qq, true, { suiyun: true, namespace: prefix });
        if (!death?.settlementId) return e.reply(`该天骄本世已结束或死亡结算正被占用，本次未获得${label}。`);
        // 死亡结算可能重建装备/属性，重新读取避免覆盖其持久化副作用。
        const latest = await Read_player(qq);
        let message = `此前${label}收益已入账，继续结算天骄本源。`;
        if (!latest._rewardClaims?.[claimKey]) {
          const result = this.refineReward(latest, { targetId: claimKey, kind: '天骄', sourceLifeEssence: death.sourceLifeEssence });
          if (!result.ok) return e.reply(result.reason);
          latest._rewardClaims ||= {};
          latest._rewardClaims[claimKey] = Date.now();
          await Write_player(qq, latest);
          message = this.refinementMessage(result, latest);
        }
        // 收益已落盘的重试也重算法宝，装备写入中断不会吞掉成长或重复炼化。
        await this.afterRefinement(qq, latest);
        await redis.del(boss.getPendingEncounterKey(qq));
        await redis.set(`tianjiao:pending:resolved:${pending.token}`, prefix, { EX: 24 * 3600 });
        return e.reply(`【${command}】${pending.tianjiaoName}的本源化为${label}。\n${message}`);
      } finally { await boss.releasePendingEncounterClaim(pending); }
    });
  }

  async refineCalamity(e, qq, overlord) {
    const { command, label } = this.refinementConfig();
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
        await this.afterRefinement(qq, player);
        await redis.del(key);
        return { message: '这份灾厄本源此前已经炼化。' };
      }
      const refined = this.refineReward(player, { targetId: `calamity:${pending.entityId}`, kind: '灾厄', sourceLifeEssence: pending.lifeSource, weight: pending.weight });
      if (!refined.ok) return { message: refined.reason };
      player._foreignCalamityRefines ||= {};
      player._foreignCalamityRefines[pending.entityId] = Date.now();
      await Write_player(qq, player);
      await this.afterRefinement(qq, player);
      await redis.del(key);
      return { message: `【${command}】${pending.name}化为${label}。\n${this.refinementMessage(refined, player)}` };
    }));
    return e.reply(result.busy ? '这份灾厄本源正在结算，请稍候。' : result.message);
  }

  refinementMessage(result, player) {
    const base = result.message || `月华值+${bigNumberTransform(result.gain)}，当前${bigNumberTransform(player.月华值)}；生命本源+${bigNumberTransform(result.lifeSourceGain || 0)}，当前${bigNumberTransform(player.生命本源)}。`;
    const gains = result.resourceGains;
    const cultivation = gains ? `\n修为+${bigNumberTransform(gains.cultivation)}｜血气+${bigNumberTransform(gains.blood)}｜元神+${bigNumberTransform(gains.soul)}｜仙道潜力+${bigNumberTransform(gains.potential)}；魔道值不变。` : '';
    return `${base}${cultivation}\n云月之莲累计炼化月华：${bigNumberTransform(getSuiyunLotusBonus(player).moonlight)}点，成长随法宝装备生效。`;
  }

  async refinePlayer(e, qq, targetQQ) {
    const { command, label, ignoreTargetProtection } = this.refinementConfig();
    if (!e.isGroup) return e.reply('玩家炼化请在群聊中使用。');
    if (qq === targetQQ) return e.reply('请指定另一位修士作为炼化目标。');
    if (!await existplayer(targetQQ)) return e.reply('目标尚未踏入修行。');
    return withPlayerLocks([qq, targetQQ], async () => {
      const player = await Read_player(qq);
      const target = await Read_player(targetQQ);
      const error = this.holderError(player, true);
      if (error) return e.reply(error);
      if (!ignoreTargetProtection && !canRefineMemoryTarget(player, target)) return e.reply('天空因子护持目标本源，当前境界不足以炼化。');
      const now = Date.now();
      if ((Number(player.当前血量) || 0) <= 0 || (Number(target.当前血量) || 0) <= 0) return e.reply('双方需先恢复气血再进行炼化战斗。');
      if (!ignoreTargetProtection) {
        if ((player.level_id > 41 && target.level_id <= 41) || (player.level_id >= 12 && target.level_id < 12)) return e.reply('该目标处于弱者保护境界。');
        const protection = getForbiddenProtection(target, now);
        if (protection.protected) return e.reply(`目标仍受本源保护，还需${duration(protection.waitMs)}。`);
      }
      for (const id of [qq, targetQQ]) {
        const raw = await redis.get(`xiuxian:player:${id}:action`);
        if (raw && Number(JSON.parse(raw)?.end_time) > now) return e.reply('相关修士正在其他行动中，请待行动结束。');
      }
      const cooldownKey = forbiddenCooldownKey(qq);
      if (await redis.set(cooldownKey, String(now + FORBIDDEN_COOLDOWN_MS), { NX: true, EX: Math.ceil(FORBIDDEN_COOLDOWN_MS / 1000) }) !== 'OK') return e.reply('本源炼化尚在调息，请稍后再试。');
      const battle = await zd_battle({ ...structuredClone(player), 法球倍率: player.灵根?.法球倍率 || 1, _万灵魔幡不可炼化: true }, { ...structuredClone(target), 法球倍率: target.灵根?.法球倍率 || 1, _万灵魔幡不可炼化: true }, { disableWanhuaHarvest: true, pvp: true });
      player.当前血量 = Math.max(0, Number(battle.A_hp) || 0);
      target.当前血量 = Math.max(0, Number(battle.B_hp) || 0);
      let result = null;
      if (battle.winner === 'A') {
        result = this.refineReward(player, { targetId: `player:${targetQQ}:${now}`, kind: '玩家', sourceLifeEssence: target.生命本源, now });
        if (!result.ok) return e.reply(result.reason);
        target.当前血量 = 0;
        target.生命本源 = Math.max(0, (Number(target.生命本源) || 0) - Math.max(0, Number(result.lifeSourceGain) || 0));
        protectForbiddenTarget(target, now);
      }
      await savePlayers([[qq, player], [targetQQ, target]]);
      if (result) await this.afterRefinement(qq, player);
      await this.sendBattle(e, battle);
      return e.reply(result ? `【${command}】战胜${target.名号}，其本源融入${label}。\n${this.refinementMessage(result, player)}` : `炼化战斗失利，本次未获得${label}。`);
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
      if (getSuiyunStage(player) < 3) return e.reply('岁云更改从【霜月剑尊】阶段开放，请先 #岁云见证。');
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
          try {
            spendSuiyunPower(player, cost);
            await Write_player(ctx.qq, player);
            // 玩家保存期间自然纪年可能推进；回滚只恢复配置写入前的最新快照。
            transaction.capture(config.getConfigPath('xiuxian', 'xiuxian'));
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
          if (root.唯一灵根 || root.不可随机获取 || target.灵根?.唯一灵根 || STAGES.includes(name) || getSuiyunStage(target)) return e.reply('唯一灵根仅由对应传承与阶段见证承接。');
          target.灵根 = structuredClone(root);
          target.生命本源 = 100 + (Number(root.生命本源) || 0);
        } else if (kind === '天资') {
          if (!APTITUDES.includes(name)) return e.reply(`天资名：${APTITUDES.join('、')}。岁云天资仅随唯一传承获得。`);
          if (getSuiyunStage(target) || target.灵根?.唯一灵根) return e.reply('唯一传承的专属天资随灵根绑定。');
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

import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { data, config } from '../../api/api.js';
import { Suiyun, parseSuiyunRewrite } from './Suiyun.js';
import {
  Add_najie_thing, Read_najie, Write_najie, Read_player, Write_player,
  Read_equipment, Write_equipment, __PATH, channel, existplayer, foundthing, zd_battle,
} from '../../model/xiuxian.js';
import {
  activateMemoryPath, ensureMemoryState, getMemoryStage, getMemoryFactorTier, getMemoryEffects,
  getMemoryLifeMaximum, advanceMemoryPath, simulateMemoryPath, runMemoryJourney,
  buildMemoryTitanTrial, applyMemoryTitanTrial, refineMemoryPath, cultivateMemoryPath,
  convertMemoryPrisms, settleMemoryFragments, getMemoryFragments, spendMemoryFragments,
} from '../../model/memoryPath.js';
import { claimMemoryUnique, releaseMemoryUnique } from '../../model/memoryRegistry.js';
import { getSuiyunTimeline } from '../../model/suiyunRegistry.js';
import { getSuiyunCreationRestriction } from '../../model/suiyunCreation.js';
import { getActiveZhutianAvatarName } from '../../model/zhutianMirror.js';
import { getSuperdimensionalRewriteTarget } from '../../model/shengfaFragment.js';
import { getLifeSourceRepairMaximum } from '../../model/lifeSourceRepair.js';
import { getMinggeEffects, applyInitialMinggeEffectsRaw, createPlayerMingge, rollbackInitialMinggeEffects } from '../../model/mingge.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import RealmEvents from '../tasks/RealmEvents.js';

const FACTOR_TIERS = ['', '黄金', '强化', '泰坦'];
const ROMANCE_SETS = [
  ['逐火之刃', '逐火之甲', '逐火圣杖'],
  ['泰坦之刃', '泰坦胸甲', '泰坦权杖'],
  ['星神长弓', '星神圣衣', '星神权杖'],
];
const ERAS = ['神话时代', '太古时代', '天命时代', '末法时代', '绝灵时代'];
const APTITUDES = ['无化如是', '生而愚痴', '天弃之人', '先天不足', '平庸之资', '超凡资质', '天纵之资', '旷世奇才', '绝世天骄', '万古无双', '无演无尽'];

function transactionFor(ids, inventory = false) {
  const transaction = new FileRollbackTransaction();
  for (const id of ids) {
    transaction.capture(path.join(__PATH.player_path, `${id}.json`));
    if (inventory) transaction.capture(path.join(__PATH.najie_path, `${id}.json`));
  }
  return transaction;
}

function withLocks(ids, task) {
  const keys = [...new Set(ids.map(String))].sort();
  const next = index => index >= keys.length ? task() : withPlayerMutationLock(keys[index], () => next(index + 1));
  return next(0);
}

export class MemoryPath extends Suiyun {
  constructor() {
    super();
    this.name = '记忆命途';
    this.dsc = '金血因子、逐火与泰坦见证';
    this.rule = [
      // 记忆经济与星神终阶暂停，旧物品和余额保留。
      // { reg: '^#(?:消耗|使用|服用|炼化)\\s*奇怪的数据(?:\\s*\\*?1)?$', fnc: 'consumeData' },
      { reg: '^#命途模拟$', fnc: 'simulate' },
      { reg: '^#(?:逐火之旅|行者之旅)$', fnc: 'journey' },
      { reg: '^#泰坦试炼$', fnc: 'titanTrial' },
      { reg: '^#命途行进$', fnc: 'advance' },
      { reg: '^#记忆因子$', fnc: 'viewFactors' },
      // { reg: '^#星神觐见$', fnc: 'cultivate' },
      // { reg: '^#记忆碎片(?:\\s+兑换(?:\\s+(?:碎片|潜力))?(?:\\s+\\d+)?)?$', fnc: 'power' },
      // { reg: '^#六相冰封.*$', fnc: 'refine' },
      // { reg: '^#记忆更改.*$', fnc: 'rewrite' },
      // { reg: '^#记忆造物.*$', fnc: 'createItem' },
      // { reg: '^#记忆回溯.*$', fnc: 'restore' },
    ];
  }

  holderError(player, technique = false) {
    // 父类的炼化分支也从此处拦截，旧秘籍和凭证不再消耗。
    if (technique) return '六相冰封已暂停。';
    if (getActiveZhutianAvatarName(player)) return '请先发送 #装载化身 本源，再行走记忆命途。';
    if (!getMemoryStage(player)) return '当前尚未开启记忆命途。';
    return '';
  }

  refinementConfig() { return { prefix: 'memory', command: '六相冰封', label: '记忆棱镜' }; }
  // 暂停父类命令分派与直接奖励调用，保留旧炼化存档。
  refine(e) { return e.reply('六相冰封已暂停。'); }
  refineReward() { return { ok: false, reason: '六相冰封已暂停。' }; }
  async afterRefinement() {}
  refinementMessage(result, player) {
    return `记忆棱镜+${result.gain}，当前${player.记忆棱镜 || 0}；生命本源${player.生命本源}/${getMemoryLifeMaximum(player)}。`;
  }

  status(player) {
    const state = ensureMemoryState(player);
    const effects = getMemoryEffects(player);
    const factors = Object.entries(state.因子 || {}).map(([name, tier]) => `${name}·${FACTOR_TIERS[tier] || tier}`);
    return [
      `【${player.灵根.name}】生命本源 ${player.生命本源}/${getMemoryLifeMaximum(player)}`,
      `模拟值 ${player.模拟值 || 0}/100`,
      `因子：${factors.join('、') || '尚未模拟'}；逐火 ${state.逐火次数 || 0}/12，泰坦 ${state.泰坦次数 || 0}/12。`,
      `悟道+${Math.round(effects.enlightenmentBonus * 100)}%｜渡劫减伤${Math.round(effects.tribulationReduction * 100)}%｜物品${effects.lootMultiplier}倍，普通物品额外+${effects.lootBonus}件。`,
      `门径：副本修为、血气、灵石、寿元代价减少${Math.round(effects.dungeonCostReduction * 100)}%。`,
    ].join('\n');
  }

  async grantRewards(qq, player) {
    const tier = getMemoryFactorTier(player, '浪漫');
    for (let index = 0; index < tier; index++) {
      for (const name of ROMANCE_SETS[index]) {
        const equipment = data.tszb_list.find(item => item.name === name);
        if (!equipment) throw new Error(`记忆套装资源缺失：${name}`);
        await Add_najie_thing(qq, { ...structuredClone(equipment), 绑定者: String(qq), author_name: String(qq) }, '装备', 1, 6, 1, {
          idempotencyKey: `memory:romance:${name}`,
        });
      }
    }
    // 记忆之诗篇暂停发放，浪漫因子套装继续保留。
    // if (getMemoryStage(player) >= 4) {
    //   await Add_najie_thing(qq, '记忆之诗篇', '道具', 1, undefined, 1, { idempotencyKey: 'memory:poem' });
    // }
  }

  async consumeData(e) {
    // 暂停入口，旧物品不消耗；原流程保留供后续调整。
    return e.reply('奇怪的数据已暂停使用。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      if (getActiveZhutianAvatarName(player)) return e.reply('请先装载本源，再读取奇怪的数据。');
      if (getMemoryStage(player)) return e.reply('记忆命途已经开启，请继续 #命途行进。');
      const inventory = await Read_najie(ctx.qq);
      if (inventory.时间线封锁?.locked) return e.reply('纳戒当前被时间线封锁，请先解除封锁。');
      const item = inventory.道具?.find(entry => entry.name === '奇怪的数据' && Number(entry.数量) >= 1);
      if (!item) return e.reply('纳戒中尚无【奇怪的数据】。');
      const options = { timeline: getSuiyunTimeline(player) };
      const claim = claimMemoryUnique('root', ctx.qq, options);
      if (!claim.ok) return e.reply('本时间线的记忆命途已有承继者。');
      const transaction = transactionFor([ctx.qq], true);
      try {
        const result = activateMemoryPath(player);
        if (!result.ok) throw new Error(result.reason);
        item.数量--;
        if (await Write_najie(ctx.qq, inventory) === false) throw new Error('纳戒封锁阻止数据读取');
        await Add_najie_thing(ctx.qq, '六相冰封', '功法', 1, undefined, 1, { idempotencyKey: 'memory:initial-technique' });
        await Write_player(ctx.qq, player);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        if (!claim.alreadyOwned) releaseMemoryUnique('root', ctx.qq, options);
        throw error;
      }
      await this.refreshAttributes(ctx.qq);
      return e.reply('【金血之体】奇怪的数据化入命途，天资成为【星神之资】，获得《六相冰封》。\n#学习六相冰封；完成秘境每次积累2%模拟值，满100后 #命途模拟 抽取不重复因子。');
    });
  }

  async mutate(e, operation) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      // 诗篇收益暂停；继续保留模拟、旅程、试炼和晋升。
      const result = operation(player);
      // 已晋升旧档可补发浪漫套装，失败不改变因子和冷却。
      await Write_player(ctx.qq, player);
      await this.refreshAttributes(ctx.qq);
      await this.grantRewards(ctx.qq, player);
      if (!result.ok) return e.reply(result.reason);
      return e.reply([result.message || (result.factor ? `获得【${FACTOR_TIERS[result.tier]}·${result.factor}】因子。`
        : '命途见证已经铭刻。'), this.status(player)].join('\n'));
    });
  }

  simulate(e) { return this.mutate(e, player => simulateMemoryPath(player)); }
  journey(e) { return this.mutate(e, player => runMemoryJourney(player)); }
  advance(e) { return this.mutate(e, player => advanceMemoryPath(player)); }
  // 星神觐见暂停，直接调用同样不产生收益。
  cultivate(e) { return e.reply('星神觐见已暂停。'); }

  async viewFactors(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    const player = await Read_player(ctx.qq);
    const error = this.holderError(player);
    if (error) return e.reply(error);
    return e.reply([
      this.status(player),
      '完成秘境每次+2%模拟值，逃离不累计；#命途模拟 抽取唯一因子。',
      '#逐火之旅（6小时一次，共12次）→ #泰坦试炼（1小时一次，共12次）→ #命途行进。',
    ].join('\n'));
  }

  async titanTrial(e) {
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const trial = buildMemoryTitanTrial(player);
      if (!trial.ok) return e.reply(trial.reason);
      const battle = await zd_battle(trial.attacker, trial.enemy, { disableWanhuaHarvest: true });
      const result = applyMemoryTitanTrial(player, battle.winner === 'A', { expectedIndex: trial.index });
      if (!result.ok) return e.reply(result.reason);
      await Write_player(ctx.qq, player);
      await this.refreshAttributes(ctx.qq);
      await this.grantRewards(ctx.qq, player);
      await this.sendBattle(e, battle);
      return e.reply([result.message, this.status(player)].filter(Boolean).join('\n'));
    });
  }

  async power(e) {
    // 经济兑换与诗篇结算暂停；查看因子使用独立面板。
    return e.reply('记忆碎片与棱镜兑换已暂停，发送 #记忆因子 查看命途。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      const income = settleMemoryFragments(player);
      const exchange = String(e.msg).match(/兑换(?:\s+(碎片|潜力))?(?:\s+(\d+))?$/);
      let result;
      if (exchange) {
        const kind = exchange[1] || '碎片';
        const amount = exchange[2] ? Number(exchange[2]) : kind === '潜力' ? 100 : 10000;
        result = convertMemoryPrisms(player, amount, kind);
        if (!result.ok) return e.reply(result.reason);
      }
      await Write_player(ctx.qq, player);
      await this.refreshAttributes(ctx.qq);
      await this.grantRewards(ctx.qq, player);
      return e.reply([
        this.status(player), result ? `消耗${result.spent}记忆棱镜，获得${result.gain}${result.kind === '潜力' ? '仙道潜力' : '记忆碎片'}。` : '',
        income.hours > 0 ? `记忆之诗篇结算${income.hours}小时。` : '',
        '完成秘境每次+2%模拟值，逃离不累计；#命途模拟 抽取唯一因子。',
        '#逐火之旅（6小时一次，共12次）→ #泰坦试炼（1小时一次，共12次）→ #命途行进。',
        '#星神觐见：24小时一次，2000～5000记忆棱镜。',
        '#记忆碎片 兑换 碎片 10000：兑换0.1碎片；#记忆碎片 兑换 潜力 100：兑换2潜力。',
        '无漏净子获得诗篇，每小时0.1记忆碎片；#记忆更改 时代/至宝线索/命格/天资/灵根。',
        '星神·记忆开放 #记忆造物 物品名（10碎片一件）和 #记忆回溯 [@目标]。',
      ].filter(Boolean).join('\n'));
    });
  }

  async rewrite(e) {
    // 旧碎片保留，暂停改写入口与全部外部效果。
    return e.reply('记忆更改已暂停。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    const text = (e.message?.filter(item => item.type === 'text').map(item => item.text).join(' ') || e.msg).replace(/^#记忆更改/, '#岁云更改');
    const request = parseSuiyunRewrite({ msg: text });
    if (!request) return e.reply('用法：#记忆更改 时代 时代名（5碎片）/ 至宝线索（10）/ 命格|天资|灵根 名称（20，可@目标）。');
    const targetId = String(await channel(getSuperdimensionalRewriteTarget(e, ctx.qq)));
    const { kind, name } = request;
    if (!['时代', '至宝线索'].includes(kind) && !await existplayer(targetId)) return e.reply('目标尚未踏入修行。');
    return withLocks([ctx.qq, targetId], async () => {
      const caster = await Read_player(ctx.qq);
      const error = this.holderError(caster);
      if (error) return e.reply(error);
      settleMemoryFragments(caster);
      const cost = kind === '时代' ? 5 : kind === '至宝线索' ? 10 : 20;
      if (getMemoryFragments(caster) < cost) return e.reply(`记忆碎片不足${cost}点。`);
      if (kind === '至宝线索') {
        spendMemoryFragments(caster, cost);
        await Write_player(ctx.qq, caster);
        const event = await RealmEvents.triggerTreasureFromTianji({ qq: ctx.qq, name: caster.名号, source: '记忆命途' });
        if (!event?.ok) {
          if (!['disabled', 'all_claimed', 'all_held', 'all_manifested'].includes(event?.reason)) return e.reply('至宝线索结果待核对，碎片消耗已记录，请联系管理员核查。');
          caster.记忆碎片 = getMemoryFragments(caster) + cost;
          await Write_player(ctx.qq, caster);
          return e.reply('当前无可显化的先天至宝，记忆碎片已退回。');
        }
        return e.reply(`${event.message}\n消耗${cost}记忆碎片。`);
      }
      const target = targetId === ctx.qq || kind === '时代' ? caster : await Read_player(targetId);
      if (kind === '天资') {
        if (!APTITUDES.includes(name) || target.灵根?.唯一灵根) return e.reply('请选择普通天资；唯一传承的专属天资随命途绑定。');
        target.天资等级 = name;
        target.天资评价 = `由记忆改写为【${name}】`;
      } else if (kind === '灵根') {
        if (getActiveZhutianAvatarName(target)) return e.reply('目标需先装载本源。');
        const root = data.talent_list.find(item => item.name === name);
        if (!root) return e.reply(`未知灵根：${name}`);
        if (root.唯一灵根 || root.不可随机获取 || target.灵根?.唯一灵根) return e.reply('唯一传承仅沿原有命途开启与晋升。');
        target.灵根 = structuredClone(root);
        target.生命本源 = 100 + (Number(root.生命本源) || 0);
      } else if (kind === '命格') {
        const fate = data.minggeList.find(item => item.name === name);
        if (!fate) return e.reply(`未知命格：${name}`);
        const oldId = typeof target.命格 === 'string' ? target.命格 : target.命格?.id;
        rollbackInitialMinggeEffects(target, data.minggeList.find(item => item.id === oldId)?.effects);
        target.命格 = createPlayerMingge(fate);
        target.命格.初始效果已应用 = true;
        applyInitialMinggeEffectsRaw(target, fate.effects);
      }
      const apply = async () => {
        const index = kind === '时代' ? ERAS.indexOf(name) : -1;
        if (kind === '时代' && index < 0) return e.reply(`时代名：${ERAS.join('、')}`);
        const transaction = transactionFor([ctx.qq, targetId]);
        try {
          spendMemoryFragments(caster, cost);
          await Write_player(ctx.qq, caster);
          if (kind === '时代') {
            // 付费落盘后才同步捕获最新时代配置，避免等待玩家IO时覆盖自然纪年。
            transaction.capture(config.getConfigPath('xiuxian', 'xiuxian'));
            const settings = config.getConfig('xiuxian', 'xiuxian') || {};
            settings.Era ||= {};
            settings.Era.current ||= { epoch: 1, totalYears: 0 };
            Object.assign(settings.Era.current, { index, years: 0 });
            config.setConfig('xiuxian', 'xiuxian', settings);
          }
          if (!['时代'].includes(kind) && targetId !== ctx.qq) await Write_player(targetId, target);
          transaction.commit();
        } catch (error) { transaction.rollback(); throw error; }
        if (kind === '灵根') await this.refreshAttributes(targetId);
        return e.reply(`【记忆更改】${kind}化为【${name}】，消耗${cost}记忆碎片。`);
      };
      return kind === '时代' ? withPlayerMutationLock('suiyun:era-rewrite', apply) : apply();
    });
  }

  async createItem(e) {
    // 星神终阶移除，旧碎片不再用于造物。
    return e.reply('记忆造物已暂停。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    return withPlayerMutationLock(ctx.qq, async () => {
      const player = await Read_player(ctx.qq);
      const error = this.holderError(player);
      if (error) return e.reply(error);
      if (getMemoryStage(player) !== 5) return e.reply('记忆造物需成就【星神·记忆】。');
      const name = String(e.msg).replace(/^#记忆造物\s*/, '').trim();
      if (!name || /[*×\r\n]|\s[+-]?\d+(?:\.\d+)?$/.test(name) || e.at || e.message?.some(item => item.type === 'at')) return e.reply('用法：#记忆造物 物品名；固定1件，消耗10记忆碎片。');
      const item = await foundthing(name, { readOnly: true });
      if (!item || item.name !== name) return e.reply('未找到该物品，请使用完整物品名。');
      const restriction = getSuiyunCreationRestriction(item);
      if (restriction) return e.reply(restriction.replaceAll('岁云造物', '记忆造物'));
      const before = await Read_najie(ctx.qq);
      if (before.时间线封锁?.locked) return e.reply('纳戒被时间线封锁，请先解除封锁。');
      settleMemoryFragments(player);
      await Write_player(ctx.qq, player);
      if (getMemoryFragments(player) < 10) return e.reply('记忆碎片不足10点。');
      const transaction = transactionFor([ctx.qq], true);
      const key = `memory-create:${randomUUID()}`;
      const itemClass = item.class === '道种' ? '道具' : item.class;
      const quantity = bag => (bag[itemClass] || []).filter(entry => entry.name === name).reduce((sum, entry) => sum + (Number(entry.数量) || 0), 0);
      try {
        spendMemoryFragments(player, 10);
        await Write_player(ctx.qq, player);
        await Add_najie_thing(ctx.qq, name, itemClass, 1, undefined, 1, { idempotencyKey: key, readOnlyLookup: true });
        const after = await Read_najie(ctx.qq);
        if (after._rewardClaims?.[key]?.amount !== 1 || quantity(after) !== quantity(before) + 1) throw new Error('记忆造物回执未核实');
        transaction.commit();
      } catch (error) { transaction.rollback(); throw error; }
      return e.reply(`【记忆造物】获得${name}×1，消耗10记忆碎片。`);
    });
  }

  async restore(e) {
    // 星神终阶移除，旧存档不再提供回溯效果。
    return e.reply('记忆回溯已暂停。');
    const ctx = await this.context(e);
    if (!ctx) return false;
    const targetId = String(await channel(getSuperdimensionalRewriteTarget(e, ctx.qq)));
    if (!await existplayer(targetId)) return e.reply('目标尚未踏入修行。');
    return withLocks([ctx.qq, targetId], async () => {
      const caster = await Read_player(ctx.qq);
      const error = this.holderError(caster);
      if (error) return e.reply(error);
      if (getMemoryStage(caster) !== 5) return e.reply('记忆回溯需成就【星神·记忆】。');
      const target = targetId === ctx.qq ? caster : await Read_player(targetId);
      const actionKey = `xiuxian:player:${targetId}:action`;
      const raw = await redis.get(actionKey);
      const action = raw ? JSON.parse(raw) : null;
      const prison = action && (['天牢', '禁闭'].includes(action.action) || action.heianlaolong);
      const self = targetId === ctx.qq;
      if (!self && !prison) return e.reply('目标未受天牢、禁闭或黑暗牢笼束缚。');
      if (self) {
        target.道伤 = 0;
        target.当前血量 = Math.max(1, Number(target.血量上限) || 1);
        target.生命本源 = getMemoryLifeMaximum(target) || getLifeSourceRepairMaximum(target, getMinggeEffects(target, data.minggeList).生命本源额外);
        await Write_player(targetId, target);
      }
      if (prison) await redis.del(actionKey);
      return e.reply(self ? `【记忆回溯】自身道伤、气血与生命本源已修复${prison ? '，牢笼束缚已解除' : ''}。`
        : `【记忆回溯】${target.名号 || targetId}的牢笼束缚已解除。`);
    });
  }
}

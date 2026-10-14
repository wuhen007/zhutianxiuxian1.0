import { plugin } from '../api/api.js';
import { recordMemoryDungeon } from '../model/memoryPath.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import yaml from 'yaml';

import {
  Add_najie_thing,
  Read_player,
  Write_player,
  channel,
  exist_najie_thing,
  existplayer,
  get_fight_img,
  zd_battle,
} from '../model/xiuxian.js';
import { getPlayerPlaneCoordinate, getPlayerPlaneName } from '../model/planeCoords.js';
import { getRealmAuthorityLevel } from '../model/realmAuthority.js';
import { DAILY_SIGN_BUTTONS, replyOfficialMessage } from '../model/officialMessage.js';
import { getShanghaiDateKey, rememberCoordinate } from '../model/weimianTravel.js';
import {
  FESTIVAL_PLANE,
  RIFT_EXCHANGES,
  RIFT_MAX_DEPTH,
  RIFT_PLANES,
  beginRiftExpedition,
  calculateRiftPayout,
  closeRifts,
  exploreRift,
  getActiveRifts,
  getRiftRefreshChance,
  openRiftManually,
  parseRiftExchangeName,
  readRiftState,
  saveRiftState,
  updateFestivalSign,
  withdrawRift,
} from '../model/planeRiftFestival.js';
import {
  createRiftGuardian,
  getEliteAverage,
  resolveGuardBattle,
} from '../model/riftGuardian.js';

const PASS_NAME = '巡界玉符';

function formatPower(value) {
  const num = Math.max(0, Number(value) || 0);
  if (num >= 100000000) return `${(num / 100000000).toFixed(2)}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(2)}万`;
  return String(num);
}

/** 战斗损耗：按比例扣当前血量，最少保留 1 点，不会致死 */
function applyHpLoss(player, rate) {
  const ratio = Math.max(0, Number(rate) || 0);
  if (!ratio) return 0;
  const current = Math.max(0, Number(player.当前血量) || 0);
  const loss = Math.min(Math.max(0, current - 1), Math.floor(current * ratio));
  if (loss <= 0) return 0;
  player.当前血量 = current - loss;
  return loss;
}

function previousDateKey(now) {
  return getShanghaiDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

function formatRemaining(expiresAt) {
  const minutes = Math.max(0, Math.ceil((Number(expiresAt) - Date.now()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分` : `${minutes}分钟`;
}

function findPlayerRift(state, player, requireCoordinate = false) {
  const plane = getPlayerPlaneName(player);
  const coordinate = getPlayerPlaneCoordinate(player, plane);
  return getActiveRifts(state).find(rift =>
    rift.plane === plane && (!requireCoordinate || (
      coordinate?.x === rift.coordinate.x && coordinate?.y === rift.coordinate.y
    ))
  );
}

function findPlayerExpedition(state, qq) {
  for (const rift of state.activeRifts || []) {
    const expedition = rift.expeditions?.[qq];
    if (expedition?.status === 'active') return { rift, expedition };
  }
  return null;
}

// 内部管理员判定：优先用框架 e.isMaster，QQBot 通道 openid 不匹配时回退读机器人 master 配置。
// 关键目的：去掉框架级 permission 静默拦截，任何路径都给可见回复，杜绝"毫无反应"。
function loadMasterIds() {
  try {
    const p = resolve(process.cwd(), 'config/config/other.yaml');
    const cfg = yaml.parse(readFileSync(p, 'utf-8')) || {};
    const master = cfg.master || {};
    const ids = new Set();
    for (const v of Object.values(master)) {
      if (Array.isArray(v)) v.forEach(x => ids.add(String(x)));
      else if (v != null) ids.add(String(v));
    }
    return ids;
  } catch {
    return new Set();
  }
}

function isAdmin(e) {
  if (e.isMaster) return true;
  try {
    return loadMasterIds().has(String(e.user_id));
  } catch {
    return false;
  }
}

export class PlaneRiftFestival extends plugin {
  constructor() {
    super({
      name: '巡界司活动',
      dsc: '巡界签到、太初星墟与限时裂界副本',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#(?:巡界活动|太初星墟)$', fnc: 'festivalInfo' },
        { reg: '^#(?:巡界|太初)签到$', fnc: 'festivalSign' },
        { reg: '^#裂界副本$', fnc: 'riftStatus' },
        { reg: '^#进入裂界$', fnc: 'enterRift' },
        { reg: '^#裂界探索$', fnc: 'exploreHelp', priority: 1 },
        { reg: '^#裂界稳阵$', fnc: 'explore', priority: 1 },
        { reg: '^#裂界寻宝$', fnc: 'explore', priority: 1 },
        { reg: '^#裂界强攻$', fnc: 'explore', priority: 1 },
        { reg: '^#撤离裂界$', fnc: 'withdraw' },
        { reg: '^#界源兑换.*$', fnc: 'exchange' },
        { reg: '^#开启裂界(?:\\s.*)?$', fnc: 'adminOpenRift', priority: 1 },
        { reg: '^#关闭所有裂界$', fnc: 'adminCloseAllRifts', priority: 1 },
        { reg: '^#关闭裂界(?:\\s+(\\S+))?$', fnc: 'adminCloseRift', priority: 1 },
      ],
    });
  }

  async getPlayer(e) {
    let qq = String(e.user_id).replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return null;
    return { qq, player: await Read_player(qq) };
  }

  async festivalInfo(e) {
    return e.reply([
      '【巡界司·太初星墟】',
      '#巡界签到：领取巡界玉符，首次签到记下太初星墟坐标。',
      '#裂界副本：查看仙界与太初星墟当前裂界。',
      '每过2000世界年，两处各自判定刷新；未刷新会累积概率，最高80%。',
      '抵达入口后 #进入裂界，再用 #裂界探索 稳阵/寻宝/强攻。',
      '三种路线各有外界干扰：',
      '· 稳阵——可能遇【界潮涌动】压低成功率，全服锚定≥60%可压制大半。',
      '· 寻宝——可能惊动【守护灵】，潜行成则收益×1.3，败则收益×0.6且成功率下降。',
      '· 强攻——每层必遇【裂界守卫】并进入真实战斗（守卫属性取全服前十平均）。',
      '可随时 #撤离裂界；失败只保住一半界源，三层通关则全部带出。',
      '#界源兑换：兑换秘境之匙、星图、巡界玉符、真我宝盒或无尽秘钥配方。',
    ].join('\n'));
  }

  async festivalSign(e) {
    if (!e.isGroup) return e.reply('巡界签到请在群聊中进行。');
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const now = new Date();
    const result = updateFestivalSign(player, getShanghaiDateKey(now), previousDateKey(now));
    if (!result.ok) {
      const message = '今日已经巡界签到过了。';
      return replyOfficialMessage(e, {
        markdown: message,
        text: message,
        buttons: DAILY_SIGN_BUTTONS,
      });
    }

    const { streak, total } = result.sign;
    const passes = streak % 7 === 0 ? 3 : streak % 3 === 0 ? 2 : 1;
    const gain = Math.min(streak, 7) * 300000;
    const firstCoordinate = rememberCoordinate(player, FESTIVAL_PLANE);
    player.修为 = (Number(player.修为) || 0) + gain;
    player.血气 = (Number(player.血气) || 0) + gain;
    await Write_player(qq, player);
    await Add_najie_thing(qq, PASS_NAME, '道具', passes);

    const extras = [];
    if (streak % 3 === 0) {
      await Add_najie_thing(qq, '秘境之匙', '道具', 1);
      extras.push('秘境之匙×1');
    }
    if (total % 7 === 0) {
      await Add_najie_thing(qq, '星图', '道具', 1);
      extras.push('星图×1');
    }

    const message = [
      '【巡界签到】',
      `连续签到：${streak}天　累计：${total}天`,
      `获得修为与血气各${gain}、${PASS_NAME}×${passes}${extras.length ? `、${extras.join('、')}` : ''}`,
      firstCoordinate ? `巡界司已将「${FESTIVAL_PLANE}」坐标烙入你的星图。` : null,
      `连续签到可为裂界探索提供最高7%成功率加成。`,
    ].filter(Boolean).join('\n');
    return replyOfficialMessage(e, {
      markdown: message,
      text: message,
      buttons: DAILY_SIGN_BUTTONS,
    });
  }

  async riftStatus(e) {
    const state = readRiftState();
    const active = getActiveRifts(state);
    const lines = ['【限时裂界】'];
    if (active.length === 0) lines.push('当前两界安宁，暂无裂界开启。');
    for (const rift of active) {
      const ranking = Object.entries(rift.contribution || {}).sort((a, b) => b[1] - a[1]).slice(0, 3);
      lines.push(
        `${rift.plane}·${rift.name}`,
        `入口：${rift.location}（${rift.coordinate.x},${rift.coordinate.y}）`,
        `剩余：${formatRemaining(rift.expiresAt)}　锚定度：${rift.anchor || 0}%`,
        ranking.length ? `贡献前三：${ranking.map(([qq, score]) => `${qq}(${score})`).join('、')}` : '贡献前三：暂无',
      );
    }
    lines.push('', '【下次刷新概率】');
    for (const plane of RIFT_PLANES) lines.push(`${plane}：${Math.round(getRiftRefreshChance(state, plane) * 100)}%`);
    return e.reply(lines.join('\n'));
  }

  async enterRift(e) {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const state = readRiftState();
    const current = findPlayerExpedition(state, qq);
    if (current) {
      if (Number(current.rift.expiresAt) > Date.now()) return e.reply('你已有一场裂界探索正在进行，请先探索或撤离。');
      const expired = withdrawRift(state, current.rift.id, qq);
      saveRiftState(state);
      const payout = await this.settlePayout(qq, player, expired.rift, expired.expedition);
      return e.reply(`上一处裂界已经闭合，巡界司先为你带回界源${payout.source}；请再次发送 #进入裂界。`);
    }
    const rift = findPlayerRift(state, player, true);
    if (!rift) return e.reply('你未抵达当前位面的裂界入口，请先用 #裂界副本 查看坐标。');
    if (await exist_najie_thing(qq, PASS_NAME, '道具') < 1) return e.reply(`缺少${PASS_NAME}，可通过 #巡界签到 获得。`);
    const result = beginRiftExpedition(state, rift.id, qq);
    if (!result.ok) return e.reply(result.reason === 'used' ? '本次裂界你已经探索过了。' : '裂界已经闭合。');
    await Add_najie_thing(qq, PASS_NAME, '道具', -1);
    saveRiftState(state);
    return e.reply([
      `【踏入${rift.name}】`,
      `${PASS_NAME}化作一道稳定界门，你抵达裂界第一层。`,
      '#裂界稳阵：成功率最高，易遇【界潮涌动】压成功率，全服锚定高可压制。',
      '#裂界寻宝：收益均衡，可能惊动【守护灵】，潜行成败影响收益。',
      '#裂界强攻：每层与【裂界守卫】真实战斗，守卫属性取全服前十均值，胜则收获与贡献最高。',
      '探索后可继续深入，或发送 #撤离裂界 带走界源。',
    ].join('\n'));
  }

  async exploreHelp(e) {
    return e.reply([
      '【裂界探索】请使用以下指令：',
      '· #裂界稳阵：成功率最高，可能遭遇【界潮涌动】压低成功率（位面锚定≥60%可压制）。',
      '· #裂界寻宝：收益均衡，可能惊动【守护灵】，潜行成败影响收益。',
      '· #裂界强攻：每层与【裂界守卫】真实战斗，守卫属性取全服前十均值，胜则收获与贡献最高。',
    ].join('\n'));
  }

  async explore(e) {
    try {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const state = readRiftState();
    const current = findPlayerExpedition(state, qq);
    if (!current || current.expedition.status !== 'active') return e.reply('你当前没有正在进行的裂界探索。');
    if (getPlayerPlaneName(player) !== current.rift.plane) return e.reply(`你的真身已离开${current.rift.plane}，无法继续深入。`);
    const route = e.msg.match(/(稳阵|寻宝|强攻)$/)?.[1];
    if (Number(current.rift.expiresAt) <= Date.now()) {
      const withdrawn = withdrawRift(state, current.rift.id, qq);
      saveRiftState(state);
      const payout = await this.settlePayout(qq, player, withdrawn.rift, withdrawn.expedition);
      return e.reply(`裂界已闭合，你被界潮推出，带回界源${payout.source}（境界乘区×${payout.realmMult}，修为+${formatPower(payout.cultivation)}）。`);
    }

    // 强攻路线每层必遇裂界守卫：属性取全服前十平均，胜负交给真实战斗系统。
    const battleDepth = current.expedition.depth + 1;
    const guardian = route === '强攻'
      ? createRiftGuardian(battleDepth, getEliteAverage())
      : null;
    let battle = null;
    let combatVerdict = null;
    if (guardian) {
      const challenger = {
        ...player,
        灵根: player.灵根 || { name: '普通灵根', 法球倍率: 0 },
        法球倍率: Math.max(0, Number(player.法球倍率 ?? player.灵根?.法球倍率) || 0),
      };
      battle = await zd_battle(challenger, guardian, { battleType: 'plane_rift_guardian' });
      combatVerdict = resolveGuardBattle(challenger, guardian, battle);
    }

    const result = exploreRift(state, current.rift.id, qq, route, {
      realmLevel: getRealmAuthorityLevel(player),
      signStreak: Number(player.巡界签到?.streak) || 0,
      guardian,
      combatVerdict,
    });
    if (!result.ok && result.reason === 'expired') {
      const withdrawn = withdrawRift(state, current.rift.id, qq);
      saveRiftState(state);
      const payout = await this.settlePayout(qq, player, withdrawn.rift, withdrawn.expedition);
      return e.reply(`裂界已闭合，你被界潮推出，带回界源${payout.source}（境界乘区×${payout.realmMult}，修为+${formatPower(payout.cultivation)}）。`);
    }
    if (!result.ok) return e.reply('本次裂界探索无法继续。');
    saveRiftState(state);

    const hpLost = combatVerdict
      ? combatVerdict.damageTaken
      : result.hpLoss ? applyHpLoss(player, result.hpLoss) : 0;
    if (combatVerdict) player.当前血量 = combatVerdict.playerHp;
    if (battle) await this.sendBattleLog(e, battleDepth, guardian, battle);
    const disturbanceLine = this.formatDisturbance(route, result, guardian);
    const chance = Math.round(result.chance * 100);
    const resolutionText = route === '强攻' ? '真实战斗裁决' : `本次成功率${chance}%`;
    if (!result.success) {
      const payout = await this.settlePayout(qq, player, result.rift, result.expedition);
      return e.reply([
        `【裂界失陷·${route}】`,
        disturbanceLine,
        `第${result.expedition.depth + 1}层探索失败（${resolutionText}）。`,
        hpLost ? `激战损耗气血${formatPower(hpLost)}，当前气血余${formatPower(player.当前血量)}。` : null,
        `你舍弃大半战利品遁出裂界，保住界源${payout.source}。`,
        `境界乘区×${payout.realmMult}（练气${player.level_id}×炼体${player.Physique_id}×秘境${player.mijinglevel_id}×仙古${player.xiangulevel_id}×花粉${player.huafenlevel_id || 1}），获得修为与血气各${formatPower(payout.cultivation)}。`,
      ].filter(Boolean).join('\n'));
    }
    if (result.completed) {
      const payout = await this.settlePayout(qq, player, result.rift, result.expedition);
      return e.reply([
        `【裂界贯通·三层尽破】`,
        disturbanceLine,
        `${route}成功（${resolutionText}），取得界源胚${result.gained}。`,
        hpLost ? `激战损耗气血${formatPower(hpLost)}，当前气血余${formatPower(player.当前血量)}。` : null,
        `锚定度${result.rift.anchor}%令最终收益×${payout.multiplier.toFixed(2)}。`,
        `带出界源${payout.source}，境界乘区×${payout.realmMult}，获得修为与血气各${formatPower(payout.cultivation)}。`,
      ].filter(Boolean).join('\n'));
    }
    await Write_player(qq, player);
    return e.reply([
      `【裂界第${result.expedition.depth}层·${route}成功】`,
      disturbanceLine,
      `${resolutionText}，取得界源胚${result.gained}。`,
      hpLost ? `激战损耗气血${formatPower(hpLost)}，当前气血余${formatPower(player.当前血量)}。` : null,
      `当前携带${result.expedition.loot}，位面锚定度${result.rift.anchor}%。`,
      `可继续探索第${result.expedition.depth + 1}层，或 #撤离裂界。`,
    ].filter(Boolean).join('\n'));
    } catch (err) {
      logger?.error?.(`[PlaneRiftFestival] explore 异常：${err?.stack || err}`);
      return e.reply(`【裂界探索出错】${err?.message || String(err)}（已记录到日志，请联系管理员排查）`);
    }
  }

  /** 把本次探索的“外界干扰”渲染成一句话 */
  formatDisturbance(route, result, guardian) {
    const d = result?.disturbance;
    if (!d || !d.type) return '';
    if (d.type === '裂界守卫' && guardian) {
      const v = d.verdict;
      const verdict = v?.outcome === 'win' ? '正面击溃' : v?.outcome === 'narrow' ? '力战险胜' : '被轰出';
      const damage = v?.resolution === 'battle'
        ? `，造成${formatPower(v.damageDealt)}伤害，损失${formatPower(v.damageTaken)}气血`
        : '';
      return `遭遇【裂界守卫·${guardian.名号}】（战力${formatPower(guardian.战力)}，速度${guardian.实际速度}）→ ${verdict}${damage}。`;
    }
    if (!d.triggered) return '';
    return `外界干扰·${d.type}：${d.detail || ''}`;
  }

  async sendBattleLog(e, depth, guardian, battle) {
    const lines = [
      `【裂界强攻·第${depth}层】对阵${guardian.名号}`,
      ...(Array.isArray(battle?.msg) ? battle.msg : [battle?.msg]).filter(Boolean),
    ];
    for (let start = 0; start < lines.length; start += 20) {
      try {
        const image = await get_fight_img(e, lines.slice(start, start + 20));
        if (image) await e.reply(image);
      } catch (err) {
        logger?.error?.(`[PlaneRiftFestival] 战斗日志渲染失败：${err?.stack || err}`);
        break;
      }
    }
  }

  async withdraw(e) {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const state = readRiftState();
    const current = findPlayerExpedition(state, qq);
    if (!current) return e.reply('你没有可撤离的裂界探索。');
    const result = withdrawRift(state, current.rift.id, qq);
    if (!result.ok) return e.reply('本次裂界探索已经结算。');
    saveRiftState(state);
    const payout = await this.settlePayout(qq, player, result.rift, result.expedition);
    return e.reply(`【见好即收】\n你从第${result.expedition.depth}层撤离，带出界源${payout.source}，境界乘区×${payout.realmMult}，获得修为与血气各${formatPower(payout.cultivation)}。`);
  }

  async settlePayout(qq, player, rift, expedition) {
    player.裂界结算记录 ||= [];
    if (expedition.settled || player.裂界结算记录.includes(rift.id)) {
      return { multiplier: 1, source: 0, cultivation: 0, blood: 0 };
    }
    const payout = calculateRiftPayout(rift, expedition.secured, {
      level: player.level_id,
      physique: player.Physique_id,
      xiangu: player.xiangulevel_id,
      mijing: player.mijinglevel_id,
      huafen: player.huafenlevel_id,
    });
    player.太初界源 = (Number(player.太初界源) || 0) + payout.source;
    player.修为 = (Number(player.修为) || 0) + payout.cultivation;
    player.血气 = (Number(player.血气) || 0) + payout.blood;
    if (['cleared', 'failed'].includes(expedition.status)) {
      recordMemoryDungeon(player, { token: `plane-rift-entry:${rift.id}` });
    }
    player.裂界结算记录.push(rift.id);
    player.裂界结算记录 = player.裂界结算记录.slice(-50);
    await Write_player(qq, player);
    expedition.settled = true;
    const state = readRiftState();
    const saved = (state.activeRifts || []).find(item => item.id === rift.id)?.expeditions?.[qq];
    if (saved) saved.settled = true;
    saveRiftState(state);
    return payout;
  }

  async exchange(e) {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const name = parseRiftExchangeName(e.msg);
    if (!name) {
      return e.reply([
        `【界源兑换】当前界源：${Number(player.太初界源) || 0}`,
        ...Object.entries(RIFT_EXCHANGES).map(([label, item]) => `${label}：${item.cost}界源 -> ${item.name}×${item.amount}`),
      ].join('\n'));
    }
    const item = RIFT_EXCHANGES[name];
    if (!item) return e.reply(`不可兑换「${name}」，发送 #界源兑换 查看清单。`);
    if (name === '无尽秘钥配方') {
      const owned = Number(await exist_najie_thing(qq, item.name, item.class)) || 0;
      if (player.无尽秘钥配方 || owned > 0)
        return e.reply('你已经持有或参悟了【无尽秘钥配方】，无需重复兑换。');
    }
    if ((Number(player.太初界源) || 0) < item.cost) return e.reply(`界源不足，需要${item.cost}，当前${Number(player.太初界源) || 0}。`);
    player.太初界源 -= item.cost;
    await Write_player(qq, player);
    await Add_najie_thing(qq, item.name, item.class, item.amount);
    return e.reply(`兑换成功：消耗界源${item.cost}，获得${item.name}×${item.amount}。剩余界源${player.太初界源}。`);
  }

  async adminOpenRift(e) {
    if (!isAdmin(e)) return e.reply('该指令仅限管理员使用。');
    const plane = RIFT_PLANES[Math.floor(Math.random() * RIFT_PLANES.length)];
    const state = readRiftState();
    const result = openRiftManually(state, plane, {});
    if (!result.ok) return e.reply(`开启失败：${result.reason}。`);
    saveRiftState(state);
    const r = result.rift;
    return e.reply([
      '【管理员·强制开启裂界】',
      `${plane} · 「${r.name}」已开启（随机生成）`,
      `入口：${r.location}（坐标 ${r.coordinate.x},${r.coordinate.y}）`,
      '持续4小时，抵达对应位面坐标后发送 #进入裂界。',
    ].join('\n'));
  }

  async adminCloseRift(e) {
    if (!isAdmin(e)) return e.reply('该指令仅限管理员使用。');
    const match = e.msg.match(/^#关闭裂界(?:\s+(\S+))?$/);
    const plane = (match?.[1] || '').replace(/\s+/g, '');
    if (!plane) return e.reply('请指定位面，如 #关闭裂界 仙界；或发送 #关闭所有裂界。');
    if (!RIFT_PLANES.includes(plane)) {
      return e.reply(`位面不存在，可选：${RIFT_PLANES.join('、')}；或发送 #关闭所有裂界。`);
    }
    const state = readRiftState();
    const result = closeRifts(state, { plane });
    saveRiftState(state);
    if (!result.closed.length) return e.reply(`${plane}当前没有进行中的裂界。`);
    return e.reply([
      '【管理员·关闭裂界】',
      `已强制闭合：${result.closed.map(c => `${c.plane}·${c.name}`).join('、')}。`,
      '进行中的探索将在玩家下次操作时按过期结算，已得界源不受影响。',
    ].join('\n'));
  }

  async adminCloseAllRifts(e) {
    if (!isAdmin(e)) return e.reply('该指令仅限管理员使用。');
    const state = readRiftState();
    const result = closeRifts(state, { all: true });
    saveRiftState(state);
    if (!result.closed.length) return e.reply('当前没有进行中的裂界。');
    return e.reply([
      '【管理员·关闭所有裂界】',
      `已强制闭合：${result.closed.map(c => `${c.plane}·${c.name}`).join('、')}。`,
    ].join('\n'));
  }
}

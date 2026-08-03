import { plugin } from '../api/api.js';

import {
  Add_najie_thing,
  Read_player,
  Write_player,
  channel,
  exist_najie_thing,
  existplayer,
} from '../model/xiuxian.js';
import { getPlayerPlaneCoordinate, getPlayerPlaneName } from '../model/planeCoords.js';
import { getShanghaiDateKey, rememberCoordinate } from '../model/weimianTravel.js';
import {
  FESTIVAL_PLANE,
  RIFT_MAX_DEPTH,
  RIFT_PLANES,
  beginRiftExpedition,
  calculateRiftPayout,
  exploreRift,
  getActiveRifts,
  getRiftRefreshChance,
  readRiftState,
  saveRiftState,
  updateFestivalSign,
  withdrawRift,
} from '../model/planeRiftFestival.js';

const PASS_NAME = '巡界玉符';
const EXCHANGES = Object.freeze({
  秘境之匙: { cost: 12, name: '秘境之匙', class: '道具', amount: 1 },
  星图: { cost: 40, name: '星图', class: '道具', amount: 1 },
  巡界玉符: { cost: 18, name: PASS_NAME, class: '道具', amount: 2 },
  真我宝盒: { cost: 100, name: '真我宝盒', class: '盒子', amount: 1 },
});

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

export class PlaneRiftFestival extends plugin {
  constructor() {
    super({
      name: '巡界司活动',
      dsc: '巡界签到、太初星墟与限时裂界副本',
      event: 'message',
      priority: 580,
      rule: [
        { reg: '^#(?:巡界活动|太初星墟)$', fnc: 'festivalInfo' },
        { reg: '^#(?:巡界|太初)签到$', fnc: 'festivalSign' },
        { reg: '^#裂界副本$', fnc: 'riftStatus' },
        { reg: '^#进入裂界$', fnc: 'enterRift' },
        { reg: '^#裂界探索\s+(?:稳阵|寻宝|强攻)$', fnc: 'explore' },
        { reg: '^#撤离裂界$', fnc: 'withdraw' },
        { reg: '^#界源兑换(?:\s+.*)?$', fnc: 'exchange' },
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
      '可随时 #撤离裂界；失败只保住一半界源，三层通关则全部带出。',
      '#界源兑换：兑换秘境之匙、星图、巡界玉符或真我宝盒。',
    ].join('\n'));
  }

  async festivalSign(e) {
    if (!e.isGroup) return e.reply('巡界签到请在群聊中进行。');
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const now = new Date();
    const result = updateFestivalSign(player, getShanghaiDateKey(now), previousDateKey(now));
    if (!result.ok) return e.reply('今日已经巡界签到过了。');

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

    return e.reply([
      '【巡界签到】',
      `连续签到：${streak}天　累计：${total}天`,
      `获得修为与血气各${gain}、${PASS_NAME}×${passes}${extras.length ? `、${extras.join('、')}` : ''}`,
      firstCoordinate ? `巡界司已将「${FESTIVAL_PLANE}」坐标烙入你的星图。` : null,
      `连续签到可为裂界探索提供最高7%成功率加成。`,
    ].filter(Boolean).join('\n'));
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
      '#裂界探索 稳阵：成功率高，提升全服锚定度最多。',
      '#裂界探索 寻宝：收益均衡。',
      '#裂界探索 强攻：收益与贡献最高，风险也最大。',
      '探索后可继续深入，或发送 #撤离裂界 带走界源。',
    ].join('\n'));
  }

  async explore(e) {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { qq, player } = account;
    const state = readRiftState();
    const current = findPlayerExpedition(state, qq);
    if (!current || current.expedition.status !== 'active') return e.reply('你当前没有正在进行的裂界探索。');
    if (getPlayerPlaneName(player) !== current.rift.plane) return e.reply(`你的真身已离开${current.rift.plane}，无法继续深入。`);
    const route = e.msg.match(/(稳阵|寻宝|强攻)$/)?.[1];
    const result = exploreRift(state, current.rift.id, qq, route, {
      realmLevel: Math.max(Number(player.mijinglevel_id) || 0, Number(player.xiangulevel_id) || 0),
      signStreak: Number(player.巡界签到?.streak) || 0,
    });
    if (!result.ok && result.reason === 'expired') {
      const withdrawn = withdrawRift(state, current.rift.id, qq);
      saveRiftState(state);
      const payout = await this.settlePayout(qq, player, withdrawn.rift, withdrawn.expedition);
      return e.reply(`裂界已闭合，你被界潮推出，带回界源${payout.source}。`);
    }
    if (!result.ok) return e.reply('本次裂界探索无法继续。');
    saveRiftState(state);
    const chance = Math.round(result.chance * 100);
    if (!result.success) {
      const payout = await this.settlePayout(qq, player, result.rift, result.expedition);
      return e.reply([
        `【裂界失陷·${route}】`,
        `第${result.expedition.depth + 1}层探索失败（本次成功率${chance}%）。`,
        `你舍弃大半战利品遁出裂界，保住界源${payout.source}。`,
        `获得修为与血气各${payout.cultivation}。`,
      ].join('\n'));
    }
    if (result.completed) {
      const payout = await this.settlePayout(qq, player, result.rift, result.expedition);
      return e.reply([
        `【裂界贯通·三层尽破】`,
        `${route}成功（本次成功率${chance}%），取得界源胚${result.gained}。`,
        `锚定度${result.rift.anchor}%令最终收益×${payout.multiplier.toFixed(2)}。`,
        `带出界源${payout.source}，获得修为与血气各${payout.cultivation}。`,
      ].join('\n'));
    }
    return e.reply([
      `【裂界第${result.expedition.depth}层·${route}成功】`,
      `本次成功率${chance}%，取得界源胚${result.gained}。`,
      `当前携带${result.expedition.loot}，位面锚定度${result.rift.anchor}%。`,
      `可继续探索第${result.expedition.depth + 1}层，或 #撤离裂界。`,
    ].join('\n'));
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
    return e.reply(`【见好即收】\n你从第${result.expedition.depth}层撤离，带出界源${payout.source}，获得修为与血气各${payout.cultivation}。`);
  }

  async settlePayout(qq, player, rift, expedition) {
    player.裂界结算记录 ||= [];
    if (expedition.settled || player.裂界结算记录.includes(rift.id)) {
      return { multiplier: 1, source: 0, cultivation: 0, blood: 0 };
    }
    const payout = calculateRiftPayout(rift, expedition.secured);
    player.太初界源 = (Number(player.太初界源) || 0) + payout.source;
    player.修为 = (Number(player.修为) || 0) + payout.cultivation;
    player.血气 = (Number(player.血气) || 0) + payout.blood;
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
    const name = e.msg.replace('#界源兑换', '').trim();
    if (!name) {
      return e.reply([
        `【界源兑换】当前界源：${Number(player.太初界源) || 0}`,
        ...Object.entries(EXCHANGES).map(([label, item]) => `${label}：${item.cost}界源 -> ${item.name}×${item.amount}`),
      ].join('\n'));
    }
    const item = EXCHANGES[name];
    if (!item) return e.reply(`不可兑换「${name}」，发送 #界源兑换 查看清单。`);
    if ((Number(player.太初界源) || 0) < item.cost) return e.reply(`界源不足，需要${item.cost}，当前${Number(player.太初界源) || 0}。`);
    player.太初界源 -= item.cost;
    await Write_player(qq, player);
    await Add_najie_thing(qq, item.name, item.class, item.amount);
    return e.reply(`兑换成功：消耗界源${item.cost}，获得${item.name}×${item.amount}。剩余界源${player.太初界源}。`);
  }
}

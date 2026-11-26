import { plugin, config, verc } from '../../api/api.js';
import {
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
  channel,
  existplayer,
  isXiuxianAdmin,} from '../../model/xiuxian.js';
import {
  getPlayerPlaneCoordinate,
  getPlayerPlaneName,
} from '../../model/planeCoords.js';
import {
  createRealmEventLocation,
  formatRealmEventLocation,
  formatRealmEventTravel,
  getRealmEventReach,
} from '../../model/realmEventLocation.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import {
  createDaoSightingEvent,
  createForbiddenCleansingEvent,
  DAO_SIGHTING_CLAIM_CHANCE,
  getEventRemaining,
  formatRemainingMinutes,
  normalizeForbiddenEventState,
  readSharedForbiddenEventState,
  reserveDaoSightingAttempt,
  resolveCleansingOutcome,
  writeSharedForbiddenEventState,
} from '../../model/forbiddenEvent.js';
import {
  readInnateTreasureState,
  writeInnateTreasureState,
} from '../../model/innateTreasure.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const CLEANSING_BATTLE_WIN_BASE = 0.34;
const AUTO_CLEANSING_CHANCE = 0.025;
const AUTO_DAO_SIGHTING_CHANCE = 0.08;

function currentWorldTime() {
  const era = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
  return {
    worldYear: getRealmEventWorldYear(era.index, era.years, era.epoch),
    epoch: Math.max(1, Number(era.epoch) || 1),
  };
}

function currentServerId() {
  return String(process.env.XIUXIAN_SERVER_ID || 'global');
}

function appendHistory(state, entry) {
  state.history ||= [];
  state.history.push({ ...entry, serverId: currentServerId(), at: Date.now() });
  state.history = state.history.slice(-100);
}

function getActive(state, key, worldYear) {
  const event = state.active?.[key];
  if (!event) return null;
  const remaining = getEventRemaining(event, worldYear);
  return remaining.active ? event : null;
}

function appendItem(najie, category, item) {
  najie[category] ||= [];
  const current = najie[category].find(entry => entry.name === item.name);
  if (current) current.数量 = (Number(current.数量) || 0) + (Number(item.数量) || 1);
  else najie[category].push({ ...item, 数量: Number(item.数量) || 1 });
}

function fragmentItem(treasureName, count = 3) {
  return {
    id: 39200000 + Math.trunc(Math.random() * 900000),
    name: `${treasureName}·违禁碎片`,
    class: '道具',
    type: '违禁品碎片',
    品阶: '先天残片',
    来源至宝: treasureName,
    违禁品碎片: true,
    数量: count,
    出售价: 0,
    不可交易: true,
  };
}

function fleetingDaoTreasureItem(event, ownerId) {
  return {
    id: 39300000 + Math.trunc(Math.random() * 900000),
    name: `${event.treasure.name}·惊鸿本体`,
    class: '装备',
    type: '至宝',
    品阶: '大道至宝',
    大道至宝本体: true,
    惊鸿大道至宝: true,
    认主来源事件: event.id,
    author_name: String(ownerId),
    绑定者: String(ownerId),
    atk: 0,
    def: 0,
    HP: 0,
    全属性: 0,
    固定全属性: 0,
    pinji: 6,
    稀有度: 10,
    数量: 1,
    islockd: 1,
    不可交易: true,
  };
}

function getHolderScore(player) {
  const attack = Math.max(1, Number(player.攻击) || 0);
  const defense = Math.max(1, Number(player.防御) || 0);
  const hp = Math.max(1, Number(player.血量上限) || Number(player.当前血量) || 1);
  const realm = Math.max(1, getRealmAuthorityLevel(player));
  return (attack + defense + hp / 5) * (1 + realm / 100);
}

function getCleansingWinChance(player, pursuer) {
  const holder = getHolderScore(player);
  const threat = holder * (Number(pursuer?.threat) || 1.5);
  const ratio = holder / Math.max(1, holder + threat);
  return Math.min(0.72, Math.max(CLEANSING_BATTLE_WIN_BASE, ratio + 0.08));
}

export class ForbiddenWorldEvents extends plugin {
  constructor() {
    super({
      name: '跨服违禁世界事件',
      dsc: '恶性违禁品清算与大道至宝惊鸿显化',
      event: 'message',
      priority: 575,
      rule: [
        { reg: '^#违禁品清算$', fnc: 'showCleansing' },
        { reg: '^#迎战违禁品清算$', fnc: 'fightCleansing' },
        { reg: '^#大道至宝惊鸿$', fnc: 'showDaoSighting' },
        { reg: '^#追寻大道至宝$', fnc: 'seekDaoSighting' },
        { reg: '^#开启违禁品清算(?:\\s+.+)?$', fnc: 'adminOpenCleansing'},
        { reg: '^#开启大道至宝惊鸿(?:\\s+.+)?$', fnc: 'adminOpenDaoSighting'},
      ],
    });
    this.task = {
      cron: '0 */10 * * * ?',
      name: '跨服违禁世界事件巡游',
      fnc: () => this.tick(),
    };
  }

  async qq(e) {
    return String(await channel(String(e.user_id).replace('qg_', '')));
  }

  async getPlayer(e) {
    const qq = await this.qq(e);
    if (!await existplayer(qq)) return null;
    return { qq, player: await Read_player(qq) };
  }

  async loadState() {
    const { worldYear } = currentWorldTime();
    const state = normalizeForbiddenEventState(await readSharedForbiddenEventState());
    let changed = false;
    for (const key of ['cleansing', 'daoSighting']) {
      const event = state.active[key];
      if (event && !getEventRemaining(event, worldYear).active) {
        event.status = 'expired';
        appendHistory(state, { type: `${key}-expired`, eventId: event.id });
        state.active[key] = null;
        changed = true;
      }
    }
    if (changed) await writeSharedForbiddenEventState(state);
    return { state, worldYear, changed };
  }

  async showCleansing(e) {
    if (!verc({ e })) return false;
    const { state, worldYear } = await this.loadState();
    const event = getActive(state, 'cleansing', worldYear);
    if (!event) return e.reply('【违禁品清算】当前诸天暂未锁定持宝者。');
    const target = event.target;
    const remaining = getEventRemaining(event, worldYear);
    return e.reply([
      '【跨服恶性违禁品清算】',
      `目标：${target.ownerName}（${target.ownerId}）执掌【${target.treasureName}】`,
      `战区：${formatRealmEventLocation(target, '未知位面')}`,
      `截杀者：${event.pursuer.name}〔${event.pursuer.title}〕`,
      `清算法则：${event.pursuer.law}`,
      `战区倒计时：${formatRemainingMinutes(remaining.realMs)}`,
      '持宝者发送 #迎战违禁品清算，战败后可能出现权柄封禁、至宝遁走、碎片化或失踪。',
    ].join('\n'));
  }

  async adminOpenCleansing(e) {
    if (!isXiuxianAdmin(e)) return e.reply('此指令仅限修仙管理员。');
    const { worldYear } = currentWorldTime();
    const { state } = await this.loadState();
    if (getActive(state, 'cleansing', worldYear)) return e.reply('当前已经存在一场违禁品清算。');

    const requestedName = String(e.msg).replace(/^#开启违禁品清算\s*/, '').trim();
    const innate = readInnateTreasureState();
    const names = Object.keys(innate.owners || {}).filter(name => innate.owners[name]?.ownerId);
    const treasureName = requestedName || names[0];
    if (!treasureName) return e.reply('当前没有已认主的先天至宝，清算事件缺少目标。');
    const ownerId = innate.owners[treasureName]?.ownerId;
    if (!ownerId || !await existplayer(ownerId)) return e.reply(`【${treasureName}】的持有者存档不存在。`);
    const owner = await Read_player(ownerId);
    const plane = getPlayerPlaneName(owner);
    const coordinate = getPlayerPlaneCoordinate(owner, plane);
    const event = createForbiddenCleansingEvent({
      treasureName,
      ownerId,
      ownerName: owner.名号,
      plane,
      coordinate,
      worldYear,
    });
    state.active.cleansing = event;
    appendHistory(state, { type: 'cleansing-opened', eventId: event.id, treasureName, ownerId });
    await writeSharedForbiddenEventState(state);
    return e.reply([
      '【跨服恶性违禁品清算已开启】',
      `目标：【${treasureName}】·${owner.名号}`,
      `截杀者：${event.pursuer.name}`,
      `目标战区：${formatRealmEventLocation(event.target)}`,
      '多元宇宙正在收束坐标，持宝者可发送 #违禁品清算 查看截杀进度。',
    ].join('\n'));
  }

  async fightCleansing(e) {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { state, worldYear } = await this.loadState();
    const event = getActive(state, 'cleansing', worldYear);
    if (!event) return e.reply('当前没有锁定你的违禁品清算。');
    if (String(event.target.ownerId) !== String(account.qq)) return e.reply('道天的杀机尚未锁定你。');
    const equipment = await Read_equipment(account.qq);
    const heldName = account.player.当前先天至宝 || equipment.至宝?.name;
    if (heldName !== event.target.treasureName) return e.reply(`你当前没有执掌【${event.target.treasureName}】。`);

    const chance = getCleansingWinChance(account.player, event.pursuer);
    const won = Math.random() < chance;
    const latest = await Read_player(account.qq);

    if (won) {
      latest.违禁品清算记录 ||= [];
      latest.违禁品清算记录.push({ eventId: event.id, treasureName: event.target.treasureName, won: true, at: Date.now() });
      latest.违禁品清算记录 = latest.违禁品清算记录.slice(-30);
      latest.道天残响 = (Number(latest.道天残响) || 0) + 1;
      event.status = 'repelled';
      event.outcome = { type: 'repelled', ownerId: account.qq, at: Date.now() };
      appendHistory(state, { type: 'cleansing-repelled', eventId: event.id, ownerId: account.qq });
      state.active.cleansing = null;
      await Write_player(account.qq, latest);
      await writeSharedForbiddenEventState(state);
      return e.reply([
        '【违禁品清算·截杀退散】',
        `${latest.名号}在坐标处斩断了${event.pursuer.name}投下的清算法则。`,
        `胜算判定：${Math.round(chance * 100)}%｜获得【道天残响】×1。`,
        '本轮清算退散，至宝权柄保持完整；下一次动用仍会重新积累道天注视。',
      ].join('\n'));
    }

    const outcome = resolveCleansingOutcome();
    const result = await withPlayerMutationLock(account.qq, async () => {
      const player = await Read_player(account.qq);
      const najie = await Read_najie(account.qq);
      const latestEquipment = await Read_equipment(account.qq);
      player.先天权柄 ||= {};
      player.违禁品清算记录 ||= [];
      player.违禁品清算记录.push({ eventId: event.id, treasureName: event.target.treasureName, won, at: Date.now() });
      player.违禁品清算记录 = player.违禁品清算记录.slice(-30);
      if (outcome === 'sealed') {
        player.当前先天至宝 = event.target.treasureName;
        player.先天权柄.违禁品清算封禁截止 = Date.now() + 24 * 60 * 60 * 1000;
        player.先天权柄.违禁品清算封禁至宝 = event.target.treasureName;
        player.违禁品清算状态 = '权柄封禁';
      } else {
        player.当前先天至宝 = '';
        const held = latestEquipment.至宝?.name === event.target.treasureName
          ? latestEquipment.至宝
          : null;
        latestEquipment.至宝 = null;
        if (outcome === 'shattered') {
          appendItem(najie, '道具', fragmentItem(event.target.treasureName));
          player.违禁品清算状态 = '至宝碎片化';
        } else if (outcome === 'fled') {
          player.违禁品清算状态 = '至宝遁走';
        } else {
          player.违禁品清算状态 = '至宝失踪';
        }
        if (held) player.违禁品清算遗失记录 = { name: held.name, at: Date.now(), outcome };
        await Write_equipment(account.qq, latestEquipment);
        await Write_najie(account.qq, najie);
      }
      await Write_player(account.qq, player);
      return player;
    });

    if (outcome !== 'sealed') {
      const innate = readInnateTreasureState();
      delete innate.equipped?.[event.target.treasureName];
      delete innate.owners?.[event.target.treasureName];
      writeInnateTreasureState(innate);
    }
    event.status = outcome;
    event.outcome = { type: outcome, ownerId: account.qq, at: Date.now() };
    appendHistory(state, { type: `cleansing-${outcome}`, eventId: event.id, ownerId: account.qq });
    state.active.cleansing = null;
    await writeSharedForbiddenEventState(state);
    const descriptions = {
      sealed: '至宝本体被无上法则压住，24小时内所有先天权柄进入封禁。',
      fled: '至宝在最后一击落下前遁入虚空，认主烙印随之断开。',
      shattered: '至宝被打成碎片，三枚违禁残片坠入你的纳戒。',
      vanished: '至宝真名被抹去，连碎片和坐标都没有留下。',
    };
    return e.reply([
      '【违禁品清算·败】',
      `${result.名号}被${event.pursuer.name}截杀。胜算判定：${Math.round(chance * 100)}%。`,
      ({ sealed: '至宝权柄封禁24小时', fled: '至宝遁入虚空并解除认主', shattered: '至宝碎片化并留下三枚残片', vanished: '至宝真名被抹去并失踪' }[outcome] || descriptions[outcome] || result.违禁品清算状态 || outcome),
      outcome === 'sealed' ? '封禁结束后，至宝仍归原主。' : '至宝状态已经写入清算史册，后续可能在其他位面重新显化。',
    ].join('\n'));
  }

  async showDaoSighting(e) {
    if (!verc({ e })) return false;
    const { state, worldYear } = await this.loadState();
    const event = getActive(state, 'daoSighting', worldYear);
    if (!event) return e.reply('【大道至宝惊鸿】当前诸天没有可追寻的显化。');
    const remaining = getEventRemaining(event, worldYear);
    const owner = event.claimant ? `已认主：${event.claimant.name}` : '尚未认主';
    return e.reply([
      '【跨服大道至宝·惊鸿一瞥】',
      `显化：${event.treasure.name}〔${event.treasure.title}〕`,
      `地点：${formatRealmEventLocation({ ...event.location, location: event.location.name })}`,
      `余辉：${remaining.worldYears}世界年｜现实窗口：${formatRemainingMinutes(remaining.realMs)}`,
      `${owner}｜单人认主概率：${DAO_SIGHTING_CLAIM_CHANCE * 100}%`,
      `前往方式：${formatRealmEventTravel({ ...event.location, location: event.location.name })}`,
      '抵达坐标后发送 #追寻大道至宝，每名玩家只有一次尝试。',
    ].join('\n'));
  }

  async adminOpenDaoSighting(e) {
    if (!isXiuxianAdmin(e)) return e.reply('此指令仅限修仙管理员。');
    const { state, worldYear } = await this.loadState();
    if (getActive(state, 'daoSighting', worldYear)) return e.reply('当前已经有一道大道至宝余辉横贯诸天。');
    const location = createRealmEventLocation();
    if (!location) return e.reply('当前没有可用的跨服位面坐标。');
    const requested = String(e.msg).replace(/^#开启大道至宝惊鸿\s*/, '').trim();
    const event = createDaoSightingEvent({
      location,
      worldYear,
      treasure: requested ? { name: requested, title: '未知大道显化' } : null,
    });
    state.active.daoSighting = event;
    appendHistory(state, { type: 'dao-sighting-opened', eventId: event.id, name: event.treasure.name });
    await writeSharedForbiddenEventState(state);
    return e.reply([
      '【大道至宝惊鸿现世】',
      `显化：${event.treasure.name}`,
      `地点：${formatRealmEventLocation({ ...event.location, location: event.location.name })}`,
      '它只在诸天露出一瞬，所有服务器都能看见这道余辉。',
    ].join('\n'));
  }

  async seekDaoSighting(e) {
    const account = await this.getPlayer(e);
    if (!account) return e.reply('暂无修仙存档，请先发送 #修仙。');
    const { state, worldYear } = await this.loadState();
    const event = getActive(state, 'daoSighting', worldYear);
    if (!event) return e.reply('大道至宝的余辉已经消失。');
    const reach = getRealmEventReach(account.player, { ...event.location, location: event.location.name });
    if (!reach.ok) {
      return e.reply([
        `你还没有抵达【${event.location.plane}·${event.location.name}】的精确坐标。`,
        formatRealmEventTravel({ ...event.location, location: event.location.name }),
      ].join('\n'));
    }
    const attempt = await reserveDaoSightingAttempt(event.id, account.qq, account.player.名号);
    if (!attempt.ok) {
      return e.reply(attempt.reason === 'already-tried'
        ? '你已经对这道大道余辉尝试过一次，因果名额已经耗尽。'
        : '这道大道余辉刚刚被其他服务器的修士截住，余辉已经改变。');
    }
    if (!attempt.claimed) {
      const player = await Read_player(account.qq);
      player.大道惊鸿道痕 = (Number(player.大道惊鸿道痕) || 0) + 1;
      await Write_player(account.qq, player);
      return e.reply([
        '【大道至宝·惊鸿】',
        '你触及了那道余辉，却只握住一缕正在消散的道痕。',
        `认主判定：${DAO_SIGHTING_CLAIM_CHANCE * 100}%｜获得大道惊鸿道痕×1。`,
        '至宝本体已经遁入更深层的诸天夹缝。',
      ].join('\n'));
    }

    const player = await Read_player(account.qq);
    const najie = await Read_najie(account.qq);
    const item = fleetingDaoTreasureItem(event, account.qq);
    appendItem(najie, '装备', item);
    player.大道惊鸿至宝 = {
      name: event.treasure.name,
      eventId: event.id,
      claimedAt: Date.now(),
    };
    await Write_najie(account.qq, najie);
    await Write_player(account.qq, player);
    return e.reply([
      '【大道至宝·惊鸿认主】',
      `大道余辉竟然在你面前停驻，【${event.treasure.name}】留下本体。`,
      '大道至宝本体已经进入纳戒装备栏，后续可接入独立大道至宝执掌系统。',
    ].join('\n'));
  }

  async tick() {
    const { state, worldYear } = await this.loadState();
    let changed = false;
    const innate = readInnateTreasureState();
    const ownerNames = Object.keys(innate.owners || {}).filter(name => innate.owners[name]?.ownerId);
    if (!getActive(state, 'cleansing', worldYear) && ownerNames.length && Math.random() < AUTO_CLEANSING_CHANCE) {
      const name = ownerNames[Math.floor(Math.random() * ownerNames.length)];
      const ownerId = innate.owners[name].ownerId;
      if (await existplayer(ownerId)) {
        const owner = await Read_player(ownerId);
        const plane = getPlayerPlaneName(owner);
        state.active.cleansing = createForbiddenCleansingEvent({
          treasureName: name,
          ownerId,
          ownerName: owner.名号,
          plane,
          coordinate: getPlayerPlaneCoordinate(owner, plane),
          worldYear,
        });
        appendHistory(state, { type: 'cleansing-auto-opened', eventId: state.active.cleansing.id, treasureName: name });
        changed = true;
      }
    }
    if (!getActive(state, 'daoSighting', worldYear) && Math.random() < AUTO_DAO_SIGHTING_CHANCE) {
      const location = createRealmEventLocation();
      if (location) {
        state.active.daoSighting = createDaoSightingEvent({ location, worldYear });
        appendHistory(state, { type: 'dao-sighting-auto-opened', eventId: state.active.daoSighting.id });
        changed = true;
      }
    }
    if (changed) await writeSharedForbiddenEventState(state);
    return changed;
  }
}

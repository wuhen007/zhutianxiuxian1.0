// 诸天世界频道：群管理员显式加入后实时收发。
import { plugin } from '../../api/api.js';
import { segment } from 'icqq';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  Add_najie_thing,
  Add_灵石,
  Add_源石,
  Read_najie,
  Read_player,
  __PATH,
} from '../../model/xiuxian.js';
import { worldChatClient as client } from './client.js';
import { clientFilter } from './filter.js';
import { formatWorldChatMessage } from './presentation.js';
import {
  cleanTradeLabel,
  parseTradeBundle,
  validateTradeOffer,
} from './trade.js';
import {
  readyWorldChatBot,
  sendWorldGroupMessage,
  extractWorldImageUrls,
} from './runtime.js';

const USER_COOLDOWN_MS = 5_000;

function senderName(e) {
  return String(
    e.sender?.card || e.sender?.nickname || e.nickname || '无名道友'
  )
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 30);
}

// 世界频道发言称号：秘境 / 仙古 / 花粉三体系任一达仙王级，取最高主阶梯前缀。
// 主阶梯统一为 仙王 / 准仙帝 / 仙帝 / 祭道 / 祭道之上 / 唯一道之上（细分境界归入最近主阶梯）。
const WORLD_TITLE_RANK = {
  仙王: 1,
  准仙帝: 2,
  仙帝: 3,
  祭道: 4,
  祭道之上: 5,
  唯一道之上: 6,
};
const MIJING_TITLE = { 18: '仙王', 19: '仙王', 20: '准仙帝', 21: '仙帝', 22: '祭道', 23: '祭道之上', 24: '唯一道之上' };
const XIANGU_TITLE = { 17: '仙王', 18: '仙王', 19: '仙王', 20: '仙王', 21: '准仙帝', 22: '仙帝', 23: '祭道', 24: '祭道之上', 25: '唯一道之上' };
const HUAFEN_TITLE = { 19: '仙王', 20: '仙王', 21: '准仙帝', 22: '仙帝', 23: '祭道', 24: '祭道之上', 25: '唯一道之上' };
function titleFromTable(table, levelId) {
  const id = Number(levelId) || 0;
  const keys = Object.keys(table).map(Number);
  const max = Math.max(...keys);
  if (id > max) return table[max];
  return table[id] || null;
}
function getWorldChatTitle(player) {
  if (!player) return null;
  let best = null;
  let bestRank = 0;
  for (const [table, id] of [
    [MIJING_TITLE, player.mijinglevel_id],
    [XIANGU_TITLE, player.xiangulevel_id],
    [HUAFEN_TITLE, player.huafenlevel_id],
  ]) {
    const t = titleFromTable(table, id);
    if (t && WORLD_TITLE_RANK[t] > bestRank) {
      best = t;
      bestRank = WORLD_TITLE_RANK[t];
    }
  }
  return best;
}
function buildWorldChatSenderName(e, player, title) {
  const qqName = senderName(e);
  const gameName = player?.名号 ? String(player.名号).trim().slice(0, 12) : '';
  if (title && gameName) return `${qqName}『【${title}】${gameName}』`;
  if (gameName) return `${qqName}『${gameName}』`;
  return qqName;
}

function canManageGroup(e) {
  const role = String(e.sender?.role || e.member?.role || '').toLowerCase();
  return (
    e.isMaster ||
    role === 'owner' ||
    role === 'admin' ||
    e.member?.is_owner === true ||
    e.member?.is_admin === true
  );
}

function tradeSummary(items = []) {
  return items
    .map((item) =>
      item.kind === 'currency'
        ? `${item.name}×${item.amount.toLocaleString()}`
        : `${item.type}:${item.name}×${item.amount}`
    )
    .join('、');
}

function tradeLedgerPath() {
  return path.join(path.dirname(client.configPath), 'trades.local.json');
}

async function readTradeLedger() {
  try {
    const value = JSON.parse(await fs.readFile(tradeLedgerPath(), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

async function writeTradeLedger(value) {
  const file = tradeLedgerPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}

async function localRealmStats() {
  let files = [];
  try {
    files = (await fs.readdir(__PATH.player_path)).filter((file) => /\.json$/i.test(file));
  } catch {
    return { players: 0, max_mijing: 0, max_xiangu: 0, max_huafen: 0 };
  }
  let max_mijing = 0;
  let max_xiangu = 0;
  let max_huafen = 0;
  await Promise.all(
    files.map(async (file) => {
      try {
        const player = JSON.parse(await fs.readFile(path.join(__PATH.player_path, file), 'utf8'));
        max_mijing = Math.max(max_mijing, Number(player.mijinglevel_id) || 0);
        max_xiangu = Math.max(max_xiangu, Number(player.xiangulevel_id) || 0);
        max_huafen = Math.max(max_huafen, Number(player.huafenlevel_id) || 0);
      } catch {}
    })
  );
  return { players: files.length, max_mijing, max_xiangu, max_huafen };
}

function readableConnectionError(error) {
  if (String(error || '').startsWith('delivery_failed:')) {
    return `群消息转发失败，正在重试：${String(error).slice(16)}`;
  }
  return (
    {
      replaced: '同一本服标识已在另一台机器登录',
      auth_failed: '本服凭据未登记或不匹配',
      banned: '本服已被总机禁用',
      enrollment_required: '未配置总机登记令牌',
      enrollment_invalid: '总机登记令牌无效',
      registration_rate_limited: '总机登记过于频繁，请稍后再试',
      bot_not_ready: '机器人账号尚未上线，等待恢复群消息转发',
    }[error] ||
    error ||
    '无'
  );
}

export class WorldChat extends plugin {
  constructor() {
    super({
      name: 'WorldChat',
      dsc: '诸天世界聊天频道',
      event: 'message',
      priority: 9000,
      rule: [
        { reg: '^#世界\\s*(?:发言|留言)(?:\\s*[\\s\\S]*)?$', fnc: 'say' },
        { reg: '^#世界\\s*查看\\s*(\\d+)?$', fnc: 'view' },
        { reg: '^#世界\\s*加入$', fnc: 'join' },
        { reg: '^#世界\\s*退出$', fnc: 'leave' },
        { reg: '^#世界\\s*改名\\s*([\\s\\S]+)$', fnc: 'rename' },
        { reg: '^#世界\\s*公开群号$', fnc: 'exposeAdmin' },
        { reg: '^#世界\\s*群号全员公开$', fnc: 'exposePublic' },
        { reg: '^#世界\\s*关闭群号$', fnc: 'exposeOff' },
        { reg: '^#世界\\s*状态$', fnc: 'stat' },
        { reg: '^#世界\\s*开关$', fnc: 'toggle' },
        { reg: '^#跨服交易(?:\\s+[\\s\\S]*)?$', fnc: 'tradeCommand' },
      ],
    });
    this.cooldowns = new Map();
    this.pendingConfirmations = new Map();
    this.groupSenders = new Map();
    this.deliveredGroups = new Map();
    this.tradeUsers = new Map();
    this.tradeLocks = new Map();
    this.tradeLedger = null;
    client.setMessageHandler((message) => this.broadcast(message));
    client.setTradeHandler((event) => this.handleTradeEvent(event));
    client.connect();
    this.refreshRealmStats();
    this.realmStatsTimer = setInterval(() => {
      this.refreshRealmStats();
      this.reconcileTradeLedger();
    }, 60_000);
    this.realmStatsTimer.unref?.();
  }

  readyBot() {
    return readyWorldChatBot();
  }

  async waitForBot(timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const bot = this.readyBot();
      if (bot) return bot;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('bot_not_ready');
  }

  async broadcast(message) {
    const bot = await this.waitForBot();
    const output = formatWorldChatMessage(message);
    const payload = message.images?.length
      ? [output, ...message.images.map((url) => segment.image(url))]
      : output;
    const delivered = this.deliveredGroups.get(message.id) || new Set();
    const groups = client
      .groups()
      .filter((groupId) => !delivered.has(String(groupId)));
    const results = await Promise.allSettled(
      groups.map((groupId) =>
        sendWorldGroupMessage(
          bot,
          groupId,
          payload,
          this.groupSenders.get(String(groupId))
        )
      )
    );
    const failures = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        delivered.add(String(groups[index]));
      } else {
        failures.push(result.reason);
        globalThis.logger?.warn?.(`[worldchat] 群推送失败: ${result.reason}`);
      }
    });
    if (failures.length) {
      this.deliveredGroups.set(message.id, delivered);
      throw failures[0];
    }
    this.deliveredGroups.delete(message.id);
  }

  async refreshRealmStats() {
    try {
      client.setRealmStats(await localRealmStats());
    } catch (error) {
      globalThis.logger?.debug?.(`[worldchat] 位面统计刷新失败: ${error.message}`);
    }
  }

  async withTradeLock(userId, task) {
    const key = String(userId);
    const previous = this.tradeLocks.get(key) || Promise.resolve();
    let current;
    current = previous
      .catch(() => {})
      .then(task)
      .finally(() => {
        if (this.tradeLocks.get(key) === current) this.tradeLocks.delete(key);
      });
    this.tradeLocks.set(key, current);
    return current;
  }

  async ledger() {
    if (!this.tradeLedger) this.tradeLedger = await readTradeLedger();
    return this.tradeLedger;
  }

  async saveLedger() {
    await writeTradeLedger(this.tradeLedger || {});
  }

  async reconcileTradeLedger() {
    if (!client.authed) return;
    const ledger = await this.ledger();
    for (const code of Object.keys(ledger)) {
      const result = await client.getTrade(code).catch(() => ({ ok: false }));
      if (
        (result.reason === 'trade_not_found' ||
          ['cancelled', 'failed', 'expired'].includes(result.trade?.status))
      ) {
        await this.rollbackLocalTrade(code);
      }
    }
  }

  rememberTradeUser(e) {
    const userId = String(e.user_id || '');
    const tag = client.userTag(userId);
    this.tradeUsers.set(tag, userId);
    return { userId, tag };
  }

  async assetBalance(userId, asset) {
    if (asset.kind === 'currency') {
      const player = await Read_player(userId);
      return Math.max(0, Number(player?.[asset.name]) || 0);
    }
    const najie = await Read_najie(userId);
    const list = Array.isArray(najie?.[asset.type]) ? najie[asset.type] : [];
    return Math.max(0, Number(list.find((item) => item?.name === asset.name)?.数量) || 0);
  }

  async adjustAsset(userId, asset, delta) {
    if (asset.kind === 'currency') {
      if (asset.name === '灵石') return Add_灵石(userId, delta, { applyMingge: false });
      return Add_源石(userId, delta, { applyMingge: false });
    }
    return Add_najie_thing(userId, asset.name, asset.type, delta);
  }

  async reserveAssets(userId, assets) {
    for (const asset of assets) {
      if ((await this.assetBalance(userId, asset)) < asset.amount) {
        throw new Error(`${asset.name}_insufficient`);
      }
    }
    const changed = [];
    try {
      for (const asset of assets) {
        await this.adjustAsset(userId, asset, -asset.amount);
        changed.push(asset);
      }
    } catch (error) {
      for (const asset of changed.reverse()) {
        await this.adjustAsset(userId, asset, asset.amount).catch(() => {});
      }
      throw error;
    }
  }

  async prepareTradeEscrow(code, userId, role, ownAssets, incomingAssets) {
    const offer = validateTradeOffer(ownAssets, incomingAssets);
    if (!offer.ok) throw new Error(offer.reason);
    const ledger = await this.ledger();
    if (ledger[code]) return ledger[code];
    return this.withTradeLock(userId, async () => {
      if (ledger[code]) return ledger[code];
      await this.reserveAssets(userId, offer.give);
      ledger[code] = {
        code,
        user_id: String(userId),
        role,
        reserved: offer.give,
        incoming: offer.want,
        credited: false,
        created_at: Date.now(),
      };
      await this.saveLedger();
      return ledger[code];
    });
  }

  async rollbackLocalTrade(code) {
    const ledger = await this.ledger();
    const entry = ledger[code];
    if (!entry) return;
    await this.withTradeLock(entry.user_id, async () => {
      if (entry.credited) {
        for (const asset of entry.incoming || []) {
          await this.adjustAsset(entry.user_id, asset, -asset.amount).catch(() => {});
        }
      }
      for (const asset of entry.reserved || []) {
        await this.adjustAsset(entry.user_id, asset, asset.amount).catch(() => {});
      }
      delete ledger[code];
      await this.saveLedger();
    });
  }

  async settleLocalTrade(event) {
    const trade = event.trade;
    const code = String(trade?.code || '').toUpperCase();
    const ledger = await this.ledger();
    const entry = ledger[code];
    if (!entry) {
      await client.settleTrade(code, event.role, '', false, 'local_escrow_missing');
      return;
    }
    try {
      await this.withTradeLock(entry.user_id, async () => {
        if (!entry.credited) {
          for (const asset of entry.incoming || []) {
            await this.adjustAsset(entry.user_id, asset, asset.amount);
          }
          entry.credited = true;
          await this.saveLedger();
        }
      });
      await client.settleTrade(code, event.role, event.member_tag, true);
    } catch (error) {
      await client.settleTrade(code, event.role, event.member_tag, false, cleanTradeLabel(error.message, 120));
    }
  }

  async handleTradeEvent(event) {
    const trade = event?.trade;
    if (!trade?.code) return;
    const code = String(trade.code).toUpperCase();
    if (event.type === 'TRADE_SETTLE') return this.settleLocalTrade(event);
    if (event.type === 'TRADE_COMPLETED') {
      const ledger = await this.ledger();
      delete ledger[code];
      await this.saveLedger();
      return;
    }
    if (event.type === 'TRADE_ROLLBACK' || event.type === 'TRADE_CANCELLED') {
      return this.rollbackLocalTrade(code);
    }
    if (event.type === 'TRADE_OFFER') {
      const bot = await this.waitForBot().catch(() => null);
      if (!bot) return;
      const text = [
        '【🌐 跨服交易邀请】',
        `交易码：${code}`,
        `对方位面：${trade.seller_name}（${trade.seller_server_id}）`,
        `对方提供：${tradeSummary(trade.give)}`,
        `对方需求：${tradeSummary(trade.want)}`,
        '确认后发送：#跨服交易 接受 交易码',
      ].join('\n');
      await Promise.allSettled(
        client.groups().map((groupId) =>
          sendWorldGroupMessage(bot, groupId, text, this.groupSenders.get(String(groupId)))
        )
      );
    }
  }

  rememberGroupSender(e) {
    if (!e?.isGroup || !e.group_id || typeof e.reply !== 'function') return;
    this.groupSenders.set(String(e.group_id), (message) =>
      e.reply(message, false)
    );
  }

  requireJoinedGroup(e) {
    if (!e.isGroup) {
      e.reply('世界频道仅限群聊使用');
      return false;
    }
    this.rememberGroupSender(e);
    if (!client.isGroupJoined(e.group_id)) {
      e.reply('本群尚未加入世界频道，请让机器人管理员发送「#世界 加入」');
      return false;
    }
    return true;
  }

  async say(e) {
    if (!this.requireJoinedGroup(e)) return true;
    if (!client.cfg.enable) {
      e.reply('本服世界频道已关闭，管理员可用「#世界 开关」开启');
      return true;
    }
    const match = e.msg.match(/^#世界\s*(?:发言|留言)(?:\s*([\s\S]*))?$/);
    const text = (match?.[1] || '').trim();
    const images = extractWorldImageUrls(e.message);
    if (!text && !images.length) return e.reply('请输入发言内容或附带图片');

    const cooldownKey = String(e.user_id);
    const wait =
      USER_COOLDOWN_MS - (Date.now() - (this.cooldowns.get(cooldownKey) || 0));
    if (wait > 0) {
      e.reply(`世界频道传音尚在回响，请等待 ${Math.ceil(wait / 1000)} 秒`);
      return true;
    }
    this.cooldowns.set(cooldownKey, Date.now());

    const player = await Read_player(e.user_id).catch(() => null);
    const title = getWorldChatTitle(player);
    const displayName = buildWorldChatSenderName(e, player, title);
    const result = await client.pub(clientFilter(text), {
      name: displayName,
      tag: client.userTag(e.user_id),
    }, images);
    if (!result.ok) {
      const reasons = {
        disconnected: '尚未连接到世界频道总机，正在自动重连',
        timeout: '总机响应超时，请稍后再试',
        user_cooldown: '发送过快，请稍后再试',
        rate_limited: '本服发送过于频繁，请稍后再试',
        auth_failed: '本服凭据未在总机登记，请联系管理员',
      };
      e.reply(
        `世界传音失败：${reasons[result.reason] || result.reason || '未知错误'}`
      );
    }
    return true;
  }

  async view(e) {
    if (!this.requireJoinedGroup(e)) return true;
    const match = e.msg.match(/^#世界\s*查看\s*(\d+)?$/);
    const limit = match?.[1]
      ? Math.min(50, Number(match[1]))
      : client.cfg.query_default;
    const result = await client.query(limit);
    if (!result.ok) {
      e.reply('世界频道暂时无法查询，请稍后再试');
      return true;
    }
    if (!result.messages?.length) {
      e.reply('诸天世界频道暂无消息');
      return true;
    }
    const lines = result.messages.map((message) => {
      const line = formatWorldChatMessage(message);
      if (
        message.expose_level === 'admin' &&
        e.isMaster &&
        message.groups?.length
      ) {
        line += `\n群号（仅管理员可见）：${message.groups.join('、')}`;
      }
      return line;
    });
    const historyPayload = [
      `【🌐 跨服世界频道 · 最近 ${result.messages.length} 条】\n${lines.join('\n\n')}`,
      ...result.messages.flatMap((message) =>
        (message.images || []).map((url) => segment.image(url))
      ),
    ];
    e.reply(historyPayload);
    return true;
  }

  async tradeCommand(e) {
    if (!this.requireJoinedGroup(e)) return true;
    const raw = e.msg.replace(/^#跨服交易\s*/, '').trim();
    if (!raw || raw === '规则') {
      return e.reply([
        '【跨服交易规则】',
        '允许：灵石、源石、普通纳戒物品，以物易物或货币交换。',
        '禁止：圣法碎片、至宝、帝兵及超出单笔上限的数量。',
        '发布：#跨服交易 发布 sv_x 给=物品|道具|名称|数量 换=灵石|数量',
        '查看：#跨服交易 位面 / #跨服交易 列表',
        '成交：#跨服交易 接受 交易码；撤销：#跨服交易 取消 交易码',
        '服主先执行「#跨服交易 开启」，再用「#跨服交易 同意 sv_x」开放指定位面。',
      ].join('\n'));
    }

    if (raw === '开启' || raw === '关闭') {
      if (!e.isMaster) return e.reply('仅机器人管理员可设置本服跨服交易开关');
      client.setTradeEnabled(raw === '开启');
      return e.reply(`本服跨服交易已${raw === '开启' ? '开启' : '关闭'}，仍需单独同意交易位面`);
    }

    const allowMatch = raw.match(/^(同意|拒绝)\s+([A-Za-z0-9_-]{3,64})$/i);
    if (allowMatch) {
      if (!e.isMaster) return e.reply('仅机器人管理员可设置位面交易许可');
      const serverId = allowMatch[2];
      const current = new Set(client.cfg.trade_allow_servers || []);
      const denied = new Set(client.cfg.trade_deny_servers || []);
      if (allowMatch[1] === '同意') {
        current.add(serverId);
        denied.delete(serverId);
      } else if (current.has('*')) {
        denied.add(serverId);
      } else {
        current.delete(serverId);
      }
      client.setTradeAllowServers([...current]);
      client.setTradeDenyServers([...denied]);
      return e.reply(`已${allowMatch[1] === '同意' ? '允许' : '拒绝'}与位面 ${serverId} 进行跨服交易`);
    }

    if (raw === '允许全部') {
      if (!e.isMaster) return e.reply('仅机器人管理员可设置位面交易许可');
      client.setTradeAllowServers(['*']);
      client.setTradeDenyServers([]);
      return e.reply('已允许与所有开启跨服交易的位面进行交易');
    }

    if (raw === '位面') {
      await this.refreshRealmStats();
      const result = await client.listRealms();
      if (!result.ok) return e.reply(`位面查询失败：${result.reason || '总机未连接'}`);
      const lines = result.realms.map((realm) => {
        const stats = realm.realm_stats || {};
        return [
          `${realm.name}（${realm.server_id}）`,
          `玩家：${stats.players ?? 0}人`,
          `最高境界：秘境${stats.max_mijing ?? 0} / 仙古${stats.max_xiangu ?? 0} / 花粉${stats.max_huafen ?? 0}`,
          `交易：${realm.trade_enabled ? '已开启' : '未开启'}`,
        ].join('｜');
      });
      return e.reply(`【诸天位面概况】\n${lines.join('\n') || '暂无在线位面'}`);
    }

    if (raw === '列表') {
      const result = await client.listTrades();
      if (!result.ok) return e.reply(`交易列表获取失败：${result.reason || '总机未连接'}`);
      if (!result.trades?.length) return e.reply('当前没有发给本位面的跨服交易');
      return e.reply([
        '【跨服交易列表】',
        ...result.trades.map((trade) => [
          `交易码：${trade.code}`,
          `来自：${trade.seller_name}（${trade.seller_server_id}）`,
          `提供：${tradeSummary(trade.give)}`,
          `需求：${tradeSummary(trade.want)}`,
        ].join('\n')),
      ].join('\n\n'));
    }

    const publishMatch = raw.match(/^发布\s+([A-Za-z0-9_-]{3,64})\s+给[=:]([\s\S]+?)\s+换[=:]([\s\S]+)$/i);
    if (publishMatch) {
      const targetServerId = publishMatch[1];
      const give = parseTradeBundle(publishMatch[2]);
      const want = parseTradeBundle(publishMatch[3]);
      if (!give.ok || !want.ok) return e.reply(`报价格式错误：${give.ok ? want.reason : give.reason}`);
      const validation = validateTradeOffer(give.items, want.items);
      if (!validation.ok) return e.reply(`报价被诸天规则拦截：${validation.reason}`);
      const { userId, tag } = this.rememberTradeUser(e);
      const pending = `P_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      try {
        await this.prepareTradeEscrow(pending, userId, 'seller', validation.give, validation.want);
        const result = await client.createTrade({
          target_server_id: targetServerId,
          seller_tag: tag,
          give: validation.give,
          want: validation.want,
        });
        if (!result.ok) {
          if (result.reason !== 'timeout') await this.rollbackLocalTrade(pending);
          return e.reply(`跨服交易发布失败：${result.reason || '未知错误'}`);
        }
        await this.migrateTradeEscrow(pending, result.trade.code);
        return e.reply(`跨服交易已发布，交易码：${result.trade.code}\n提供：${tradeSummary(validation.give)}\n需求：${tradeSummary(validation.want)}`);
      } catch (error) {
        await this.rollbackLocalTrade(pending);
        return e.reply(`跨服交易发布失败：${error.message}`);
      }
    }

    const acceptMatch = raw.match(/^接受\s+([A-Za-z0-9_-]{6,80})$/i);
    if (acceptMatch) {
      const code = acceptMatch[1].toUpperCase();
      const list = await client.listTrades();
      const trade = list.trades?.find((item) => item.code === code);
      if (!list.ok || !trade) return e.reply(`找不到交易 ${code}，请先发送「#跨服交易 列表」`);
      const { userId, tag } = this.rememberTradeUser(e);
      const pending = `P_${code}_${tag}`;
      try {
        await this.prepareTradeEscrow(pending, userId, 'buyer', trade.want, trade.give);
        const result = await client.acceptTrade(code, tag);
        if (!result.ok) {
          await this.rollbackLocalTrade(pending);
          return e.reply(`接受交易失败：${result.reason || '未知错误'}`);
        }
        await this.migrateTradeEscrow(pending, code);
        return e.reply(`已接受交易 ${code}，双方资产正在结算`);
      } catch (error) {
        await this.rollbackLocalTrade(pending);
        return e.reply(`接受交易失败：${error.message}`);
      }
    }

    const cancelMatch = raw.match(/^取消\s+([A-Za-z0-9_-]{6,80})$/i);
    if (cancelMatch) {
      const code = cancelMatch[1].toUpperCase();
      const result = await client.cancelTrade(code);
      if (!result.ok) return e.reply(`撤销交易失败：${result.reason || '未知错误'}`);
      await this.rollbackLocalTrade(code);
      return e.reply(`交易 ${code} 已撤销，预留资产已返还`);
    }

    return e.reply('未识别跨服交易指令，发送「#跨服交易 规则」查看用法');
  }

  async migrateTradeEscrow(fromCode, toCode) {
    const ledger = await this.ledger();
    const entry = ledger[fromCode];
    if (!entry) throw new Error('local_escrow_missing');
    delete ledger[fromCode];
    entry.code = toCode;
    ledger[toCode] = entry;
    await this.saveLedger();
  }

  async join(e) {
    if (!e.isGroup) return e.reply('请在需要加入世界频道的群里发送该指令');
    this.rememberGroupSender(e);
    if (!canManageGroup(e))
      return e.reply('仅机器人主人、群主或群管理员可让群聊加入世界频道');
    if (!client.joinGroup(e.group_id)) return e.reply('本群已经加入世界频道');
    e.reply('本群已加入诸天世界频道，之后将实时收取跨服消息');
    return true;
  }

  async leave(e) {
    if (!e.isGroup) return e.reply('请在需要退出世界频道的群里发送该指令');
    if (!canManageGroup(e))
      return e.reply('仅机器人主人、群主或群管理员可让群聊退出世界频道');
    if (!client.leaveGroup(e.group_id)) return e.reply('本群尚未加入世界频道');
    this.groupSenders.delete(String(e.group_id));
    e.reply('本群已退出诸天世界频道');
    return true;
  }

  async stat(e) {
    this.rememberGroupSender(e);
    const status = client.status();
    const connection = status.connected
      ? status.authed
        ? '已连接'
        : '鉴权中'
      : '未连接，自动重连中';
    const lines = [
      '【世界频道状态】',
      `开关：${status.enable ? '已开启' : '已关闭'}`,
      `连接：${connection}`,
      `当前群：${
        e.isGroup && client.isGroupJoined(e.group_id) ? '已加入' : '未加入'
      }`,
      `已收取序号：${status.last_seen_seq}`,
    ];
    if (e.isMaster) {
      if (!e.isGroup) {
        lines.push(
          `总机：${status.url}`,
          `本服标识：${status.server_id}`,
          `区服昵称：${status.name}`,
          `身份登记：${status.registered ? '已登记' : '待自动登记'}`,
          `已加入群：${
            status.joined_groups.length
              ? status.joined_groups.join('、')
              : '无'
          }`
        );
      }
      lines.push(`最近错误：${readableConnectionError(status.last_error)}`);
      lines.push(
        `跨服交易：${status.trade_enabled ? '已开启' : '未开启'}，许可位面：${
          status.trade_allow_servers?.length ? status.trade_allow_servers.join('、') : '无'
        }${status.trade_deny_servers?.length ? `，拒绝位面：${status.trade_deny_servers.join('、')}` : ''}`,
        `本位面概况：${status.realm_stats.players}人，最高秘境${status.realm_stats.max_mijing}/仙古${status.realm_stats.max_xiangu}/花粉${status.realm_stats.max_huafen}`
      );
    }
    e.reply(lines.join('\n'));
    return true;
  }

  async rename(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可修改本服昵称');
    const name = (e.msg.match(/^#世界\s*改名\s*([\s\S]+)$/)?.[1] || '')
      .trim()
      .slice(0, 30);
    if (!name) return true;
    client.setName(name);
    e.reply(`本服昵称已设为「${name}」，重连后生效`);
    return true;
  }

  confirmationKey(type, e) {
    return `${type}:${e.user_id}:${e.group_id || 'private'}`;
  }

  confirmed(type, e) {
    const key = this.confirmationKey(type, e);
    const timestamp = this.pendingConfirmations.get(key) || 0;
    if (Date.now() - timestamp < 30_000) {
      this.pendingConfirmations.delete(key);
      return true;
    }
    this.pendingConfirmations.set(key, Date.now());
    return false;
  }

  async exposeAdmin(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作群号公开');
    if (client.cfg.expose_group === 'admin')
      return e.reply('当前已设为仅其他服管理员可见');
    if (!this.confirmed('admin', e)) {
      return e.reply(
        '确认后，已加入世界频道的群号会提供给其他服管理员。30 秒内再次发送本指令确认。'
      );
    }
    client.setExpose('admin');
    e.reply('群号已设为仅其他服管理员可见');
    return true;
  }

  async exposePublic(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作群号公开');
    if (!this.confirmed('public', e)) {
      return e.reply(
        '确认后，已加入世界频道的群号会对所有成员公开。30 秒内再次发送本指令确认。'
      );
    }
    client.setExpose('public');
    e.reply('群号已对所有世界频道成员公开');
    return true;
  }

  async exposeOff(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作群号公开');
    client.setExpose(false);
    e.reply('已关闭群号公开');
    return true;
  }

  async toggle(e) {
    if (!e.isMaster) return e.reply('仅机器人管理员可操作世界频道开关');
    const enabled = !client.cfg.enable;
    client.setEnable(enabled);
    e.reply(`诸天世界频道已${enabled ? '开启' : '关闭'}`);
    return true;
  }
}

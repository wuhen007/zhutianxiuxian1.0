import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldChatClient } from '../apps/worldChat/client.js';
import {
  ensureEndlessStarMapState,
  getAbility,
  getCheckpointBoon,
  getEndlessMerchantState,
  getFusion,
  getMemberStats,
} from './endlessRealm.js';
import {
  getEndlessStarMapView,
  getEndlessStarOptions,
  getEndlessStarVotes,
  getSelectedEndlessStarNode,
} from './endlessStarMap.js';

const pluginRoot = fileURLToPath(new URL('..', import.meta.url));
const webRoot = path.join(pluginRoot, 'resources', 'web', 'endless');
const wendaoWebRoot = path.join(pluginRoot, 'resources', 'web', 'wendao');
const wendaoAudioRoot = path.join(wendaoWebRoot, 'audio');
const worldWebRoot = path.join(pluginRoot, 'resources', 'web', 'world');
const surveyWebRoot = path.join(pluginRoot, 'resources', 'web', 'survey');
const canglanWebRoot = path.join(pluginRoot, 'resources', 'web', 'canglan');
const configPath = path.join(pluginRoot, 'config', 'endless-web.json');
const localConfigPath = path.join(pluginRoot, 'config', 'endless-web.local.json');
const TICKET_PREFIX = 'Xiuxian:Endless:Web:Ticket:';
const SESSION_PREFIX = 'Xiuxian:Endless:Web:Session:';
const ACTION_PREFIX = 'Xiuxian:Endless:Web:Action:';
const TEAM_CHAT_PREFIX = 'Xiuxian:Endless:Web:TeamChat:';
const WORLD_TICKET_PREFIX = 'Xiuxian:World:Web:Ticket:';
const WORLD_SESSION_PREFIX = 'Xiuxian:World:Web:Session:';
const SURVEY_TICKET_PREFIX = 'Xiuxian:Survey:Web:Ticket:';
const SURVEY_SESSION_PREFIX = 'Xiuxian:Survey:Web:Session:';
const CANGLAN_TICKET_PREFIX = 'Xiuxian:Canglan:Web:Ticket:';
const CANGLAN_SESSION_PREFIX = 'Xiuxian:Canglan:Web:Session:';
const CANGLAN_ACTION_PREFIX = 'Xiuxian:Canglan:Web:Action:';
const TEAM_CHAT_MAX_MESSAGES = 80;
const TEAM_CHAT_TTL_SECONDS = 2 * 24 * 60 * 60;
const BODY_LIMIT = 16 * 1024;
const CONSUME_TICKET_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

let activeServer = null;
let serverPromise = null;
let activeRealm = null;
let activeWorldController = null;
let activeSurveyController = null;
let activeCanglanController = null;

const WENDAO_ASSETS = {
  'selection.jpg': path.join(pluginRoot, 'resources', 'img', 'state', '背景图.jpg'),
  'realm.jpg': path.join(pluginRoot, 'resources', 'img', 'player_pifu', '0.jpg'),
  'battle.jpg': path.join(pluginRoot, 'resources', 'img', 'help', 'zhutian.jpg'),
  'li-qingyun.jpg': path.join(pluginRoot, 'resources', 'img', 'player_pifu', '16.jpg'),
  'qin-yang.jpg': path.join(pluginRoot, 'resources', 'img', 'player_pifu', '20.jpg'),
  'su-waner.jpg': path.join(pluginRoot, 'resources', 'img', 'player_pifu', '39.jpg'),
  'mu-yunxi.jpg': path.join(pluginRoot, 'resources', 'img', 'player_pifu', '38.jpg'),
};

const WENDAO_AUDIO = {
  'battle.ogg': path.join(wendaoAudioRoot, 'battle.ogg'),
  'sword-swing.ogg': path.join(wendaoAudioRoot, 'sword-swing.ogg'),
  'sword-impact.ogg': path.join(wendaoAudioRoot, 'sword-impact.ogg'),
  'magic-cast.ogg': path.join(wendaoAudioRoot, 'magic-cast.ogg'),
  'magic-heavy.ogg': path.join(wendaoAudioRoot, 'magic-heavy.ogg'),
  'boss-roar.ogg': path.join(wendaoAudioRoot, 'boss-roar.ogg'),
};

const WORLD_ASSETS = {
  'zhutian.jpg': path.join(pluginRoot, 'resources', 'img', 'help', 'zhutian.jpg'),
  'najie.jpg': path.join(pluginRoot, 'resources', 'img', 'najie', 'najie.jpg'),
  'scroll.jpg': path.join(pluginRoot, 'resources', 'img', 'state', '背景图.jpg'),
};

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function mergeEndlessWebConfig(fileConfig = {}, localConfig = {}) {
  return { ...fileConfig, ...localConfig };
}

export function getEndlessWebConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    globalThis.logger?.warn?.(`[无尽网页] 读取配置失败：${error.message}`);
  }
  if (fs.existsSync(localConfigPath)) {
    try {
      fileConfig = mergeEndlessWebConfig(
        fileConfig,
        JSON.parse(fs.readFileSync(localConfigPath, 'utf8'))
      );
    } catch (error) {
      globalThis.logger?.warn?.(`[无尽网页] 读取本机配置失败：${error.message}`);
    }
  }
  const port = positiveInteger(process.env.ENDLESS_WEB_PORT || fileConfig.port, 3000);
  const publicUrl = String(process.env.ENDLESS_WEB_PUBLIC_URL || fileConfig.publicUrl || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  return {
    enabled: String(process.env.ENDLESS_WEB_ENABLED || fileConfig.enabled).toLowerCase() === 'true',
    host: String(process.env.ENDLESS_WEB_HOST || fileConfig.host || '127.0.0.1'),
    port,
    publicUrl,
    relayEnabled: fileConfig.relayEnabled !== false,
    ticketTtlSeconds: positiveInteger(fileConfig.ticketTtlSeconds, 120),
    sessionTtlSeconds: positiveInteger(fileConfig.sessionTtlSeconds, 21600),
  };
}

export function shouldAutoIssueEndlessWebTicket(team) {
  return team?.members?.length === 1;
}

function randomToken(size = 32) {
  return randomBytes(size).toString('base64url');
}

function ticketKey(token) {
  return `${TICKET_PREFIX}${token}`;
}

function sessionKey(token) {
  return `${SESSION_PREFIX}${token}`;
}

function worldTicketKey(token) {
  return `${WORLD_TICKET_PREFIX}${token}`;
}

function worldSessionKey(token) {
  return `${WORLD_SESSION_PREFIX}${token}`;
}

function surveyTicketKey(token) {
  return `${SURVEY_TICKET_PREFIX}${token}`;
}

function surveySessionKey(token) {
  return `${SURVEY_SESSION_PREFIX}${token}`;
}

function canglanTicketKey(token) {
  return `${CANGLAN_TICKET_PREFIX}${token}`;
}

function canglanSessionKey(token) {
  return `${CANGLAN_SESSION_PREFIX}${token}`;
}

function canglanActionKey(session, operationId) {
  return `${CANGLAN_ACTION_PREFIX}${session}:${operationId}`;
}

function actionKey(session, operationId) {
  return `${ACTION_PREFIX}${session}:${operationId}`;
}

function teamChatKey(teamId) {
  return `${TEAM_CHAT_PREFIX}${teamId}`;
}

function cleanTeamChatText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 500);
}

function parseTeamChatMessage(raw) {
  try {
    const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!message || typeof message !== 'object' || !message.text) return null;
    return {
      id: String(message.id || `${Date.now()}-${randomToken(5)}`),
      userId: String(message.userId || ''),
      name: String(message.name || '同行者').slice(0, 40),
      text: cleanTeamChatText(message.text),
      at: Number(message.at) || Date.now(),
    };
  } catch {
    return null;
  }
}

async function readTeamChat(redisClient, teamId) {
  const key = teamChatKey(teamId);
  if (typeof redisClient.lRange === 'function') {
    const values = await redisClient.lRange(key, -TEAM_CHAT_MAX_MESSAGES, -1);
    return (values || []).map(parseTeamChatMessage).filter(Boolean);
  }
  const raw = await redisClient.get(key);
  if (!raw) return [];
  try {
    const values = JSON.parse(raw);
    return (Array.isArray(values) ? values : []).map(parseTeamChatMessage).filter(Boolean).slice(-TEAM_CHAT_MAX_MESSAGES);
  } catch {
    return [];
  }
}

async function appendTeamChat(redisClient, teamId, message) {
  const key = teamChatKey(teamId);
  const encoded = JSON.stringify(message);
  if (typeof redisClient.rPush === 'function') {
    await redisClient.rPush(key, encoded);
    if (typeof redisClient.lTrim === 'function') await redisClient.lTrim(key, -TEAM_CHAT_MAX_MESSAGES, -1);
    if (typeof redisClient.expire === 'function') await redisClient.expire(key, TEAM_CHAT_TTL_SECONDS);
    return;
  }
  const messages = await readTeamChat(redisClient, teamId);
  messages.push(message);
  await redisClient.set(key, JSON.stringify(messages.slice(-TEAM_CHAT_MAX_MESSAGES)), { EX: TEAM_CHAT_TTL_SECONDS });
}

function cookieName(config) {
  return config.publicUrl.startsWith('https://') ? '__Host-endless_session' : 'endless_session';
}

function worldCookieName(config) {
  return config.publicUrl.startsWith('https://') ? '__Host-world_session' : 'world_session';
}

function surveyCookieName(config) {
  return config.publicUrl.startsWith('https://') ? '__Host-survey_session' : 'survey_session';
}

function canglanCookieName(config) {
  return config.publicUrl.startsWith('https://')
    ? '__Host-canglan_session'
    : 'canglan_session';
}

function sameOrigin(req, config) {
  try {
    return req.headers.origin === new URL(config.publicUrl).origin;
  } catch {
    return false;
  }
}

function clientAddress(req) {
  return String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown');
}

async function withinRateLimit(redisClient, key, limit, seconds) {
  if (typeof redisClient.incr !== 'function') return true;
  const count = await redisClient.incr(`Xiuxian:Endless:Web:Rate:${key}`);
  if (count === 1) await redisClient.expire(`Xiuxian:Endless:Web:Rate:${key}`, seconds);
  return count <= limit;
}

export async function issueEndlessWebTicket(redisClient, config, identity) {
  const token = randomToken(24);
  await redisClient.set(ticketKey(token), JSON.stringify(identity), {
    EX: config.ticketTtlSeconds,
  });
  return token;
}

async function consumeTicket(redisClient, key) {
  let raw = null;
  if (typeof redisClient.getDel === 'function') {
    try {
      raw = await redisClient.getDel(key);
    } catch (error) {
      // redis v4 exposes getDel even when the server predates Redis 6.2.
      if (!/unknown command/i.test(String(error?.message || error))) throw error;
    }
  }
  if (raw === null && typeof redisClient.eval === 'function') {
    raw = await redisClient.eval(CONSUME_TICKET_SCRIPT, {
      keys: [key],
      arguments: [],
    });
  } else if (raw === null) {
    raw = await redisClient.get(key);
    if (raw) await redisClient.del(key);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function consumeEndlessWebTicket(redisClient, token) {
  return consumeTicket(redisClient, ticketKey(token));
}

export async function issueWorldWebTicket(redisClient, config, identity) {
  const token = randomToken(24);
  await redisClient.set(worldTicketKey(token), JSON.stringify(identity), {
    EX: config.ticketTtlSeconds,
  });
  return token;
}

export async function consumeWorldWebTicket(redisClient, token) {
  return consumeTicket(redisClient, worldTicketKey(token));
}

export async function issueSurveyWebTicket(redisClient, config, identity) {
  const token = randomToken(24);
  await redisClient.set(surveyTicketKey(token), JSON.stringify(identity), {
    EX: config.ticketTtlSeconds,
  });
  return token;
}

export async function consumeSurveyWebTicket(redisClient, token) {
  return consumeTicket(redisClient, surveyTicketKey(token));
}

export async function issueCanglanWebTicket(redisClient, config, identity) {
  const token = randomToken(24);
  await redisClient.set(canglanTicketKey(token), JSON.stringify(identity), {
    EX: config.ticketTtlSeconds,
  });
  return token;
}

export async function consumeCanglanWebTicket(redisClient, token) {
  return consumeTicket(redisClient, canglanTicketKey(token));
}

function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const index = part.indexOf('=');
        return index < 0 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new Error('请求内容过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求格式无效');
  }
}

function securityHeaders(contentType, cache = 'no-store') {
  return {
    'Content-Type': contentType,
    'Cache-Control': cache,
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: https:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
}

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    ...securityHeaders('application/json; charset=utf-8'),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, file, contentType) {
  try {
    const body = fs.readFileSync(file);
    res.writeHead(200, {
      ...securityHeaders(contentType, 'public, max-age=300'),
      'Content-Length': body.length,
    });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: '资源不存在' });
  }
}

function amount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function memberView(run, member) {
  const stats = getMemberStats(run, member.id) || {};
  const maxHp = Math.max(1, amount(stats.maxHp));
  return {
    id: member.id,
    name: member.name,
    alive: Boolean(member.alive),
    hp: amount(member.hp),
    maxHp,
    hpPct: Math.round((Math.max(0, amount(member.hp)) / maxHp) * 100),
    attack: amount(stats.attack),
    defense: amount(stats.defense),
    abilities: Object.entries(member.abilities || {}).map(([id, level]) => ({
      id,
      name: getAbility(id)?.name || id,
      level,
    })),
    blessings: (member.blessings || [])
      .map(id => getCheckpointBoon(id))
      .filter(Boolean)
      .map(boon => ({ name: boon.name, kind: boon.kind })),
    eventBuffs: [
      member.eventBuffs?.freeTransformationOpeningCount >= 3 ? '三身映照 · 开场3尊' : null,
      member.eventBuffs?.skillReplayChance ? `回响重放 · ${Math.round(member.eventBuffs.skillReplayChance * 100)}%` : null,
      member.eventBuffs?.attackPct ? `破境战血 · 攻击+${Math.round(member.eventBuffs.attackPct * 100)}%` : null,
    ].filter(Boolean),
  };
}

function battleView(run, userId) {
  const battle = run.lastBattle;
  if (!battle) return null;
  const reward = battle.layerReward;
  const memberReward = reward?.members?.[userId] || {};
  return {
    layer: battle.layer,
    world: battle.world,
    stage: battle.stage,
    enemy: battle.enemy,
    starRoute: battle.starRoute || null,
    assist: battle.assist || null,
    trait: battle.trait,
    baseTrait: battle.baseTrait || battle.trait,
    mechanisms: Array.isArray(battle.mechanisms) ? battle.mechanisms : [],
    bossRoster: Array.isArray(battle.bossRoster) ? battle.bossRoster : [],
    victory: battle.victory,
    rounds: battle.rounds,
    enemyRemainingHp: amount(battle.enemyRemainingHp),
    enemyMaxHp: amount(battle.enemyMaxHp),
    enemyRemainingShield: amount(battle.enemyRemainingShield),
    enemyMaxShield: amount(battle.enemyMaxShield),
    // 完整战报：返回本场全部日志；详细回合数据供网页按需展开。
    logs: (battle.logs || []).slice(-600),
    damageByMember: battle.damageByMember || {},
    damageTakenByMember: battle.damageTakenByMember || {},
    summary: battle.summary || null,
    roundDetails: (battle.roundDetails || []).slice(-60).map(round => ({
      round: Number(round.round) || 0,
      attacks: Array.isArray(round.attacks) ? round.attacks : [],
      fusionDamage: amount(round.fusionDamage),
      assistDamage: amount(round.assistDamage),
      enemyDamage: amount(round.enemyDamage),
      teamDamageTaken: amount(round.teamDamageTaken),
      enemyHp: amount(round.enemyHp),
      enemyShield: amount(round.enemyShield),
      enemyHpPct: Math.max(0, Math.min(100, Number(round.enemyHpPct) || 0)),
      teamHpPct: Math.max(0, Math.min(100, Number(round.teamHpPct) || 0)),
      members: Array.isArray(round.members) ? round.members : [],
      actions: Array.isArray(round.actions) ? round.actions : [],
      events: Array.isArray(round.events) ? round.events : [],
    })),
    reward: reward
      ? {
          lingshi: amount(reward.lingshi),
          sourceStone: amount(reward.sourceStone),
          tokens: amount(reward.tokens),
          cultivation: amount(memberReward.cultivation),
          blood: amount(memberReward.blood),
        }
      : null,
  };
}

function starMapView(team, run) {
  const ended = ['settling', 'defeated'].includes(run.phase);
  const targetLayer = run.phase === 'checkpoint' || ended ? Math.max(1, Number(run.layer) || 1) : Math.max(1, (Number(run.layer) || 0) + 1);
  ensureEndlessStarMapState(run, targetLayer);
  const map = getEndlessStarMapView(run);
  if (!map) return null;
  const options = run.phase === 'checkpoint' || ended ? [] : getEndlessStarOptions(run, targetLayer);
  const selected = getSelectedEndlessStarNode(run, targetLayer);
  const votes = new Map(getEndlessStarVotes(run).map(item => [item.nodeId, item.votes]));
  const revealUntil = Math.min(map.startLayer + 9, targetLayer + 2);
  return {
    cycle: map.cycle,
    targetLayer,
    sky: {
      name: map.sky?.name || '无名劫象',
      omen: map.sky?.omen || '',
      rewardMultiplier: Number(map.sky?.rewardMultiplier) || 1,
    },
    selected: selected
      ? {
          id: selected.id,
          name: selected.name,
          shortName: selected.shortName,
          worldName: selected.worldName,
          calamity: selected.calamity || null,
          gambit: selected.gambit || null,
          decision: selected.decision || null,
          merchant: selected.merchant || null,
          assist: selected.assist || null,
        }
      : null,
    rows: map.rows.map(row => ({
      layer: row.layer,
      current: row.layer === targetLayer,
      nodes: row.nodes.map(node => {
        const visible = node.layer <= revealUntil || node.typeId === 'heaven_gate' || node.status !== 'future';
        return {
          id: node.id,
          status: visible ? node.status : 'hidden',
          visible,
          symbol: visible ? node.symbol : '?',
          shortName: visible ? node.shortName : '迷雾',
          worldName: visible ? node.worldName : '因果迷雾',
        };
      }),
    })),
    options: options.map((node, index) => ({
      index: index + 1,
      id: node.id,
      name: node.name,
      shortName: node.shortName,
      worldName: node.worldName,
      risk: node.risk,
      description: node.description,
      rewardText: node.rewardText,
      gambit: node.gambit || null,
      assist: node.assist || null,
      merchant: node.merchant || null,
      successorCount: node.nextNodeIds?.length || 0,
      votes: votes.get(node.id) || 0,
      selected: node.id === selected?.id,
    })),
    seals: { ...(map.seals || {}) },
    commandRange: options.map((_, index) => index + 1).join('/'),
    canSuggest: Boolean(options.length && !selected),
    canSelect: Boolean(options.length && !selected),
  };
}

function settlementView(run, userId) {
  const settlement = run.settlement;
  if (!settlement?.reward) return null;
  const reward = settlement.reward;
  const member = reward.members?.[userId] || {};
  return {
    reason: settlement.reason || 'defeat',
    complete: settlement.paidMembers?.length >= Object.keys(run.members || {}).length,
    layer: Number(run.layer) || 0,
    lingshi: amount(reward.lingshi),
    sourceStone: amount(reward.sourceStone),
    tokens: amount(reward.tokens),
    lostLingshi: amount(reward.lostLingshi),
    lostSourceStone: amount(reward.lostSourceStone),
    lostTokens: amount(reward.lostTokens),
    member: {
      cultivation: amount(member.cultivation),
      blood: amount(member.blood),
      lostCultivation: amount(member.lostCultivation),
      lostBlood: amount(member.lostBlood),
    },
  };
}

export function serializeEndlessWebState(realm, team, run, userId) {
  const member = run.members?.[userId];
  const bankedRewards = member?.bankedRewards || {};
  const unbankedRewards = member?.unbankedRewards || {};
  const choiceIds = run.pendingChoices?.[userId] || [];
  const choices = choiceIds.map((id, index) => {
    const ability = getAbility(id);
    return {
      index: index + 1,
      id,
      name: ability?.name || id,
      rarity: ability?.rarity || '未知',
      description: ability?.description || '',
      tags: ability?.tags || [],
      ownedLevel: member?.abilities?.[id] || 0,
    };
  });
  const checkpoint = run.checkpoint
    ? {
        layer: run.checkpoint.layer,
        title: run.checkpoint.title,
        choices: (run.checkpoint.choices || []).map((choice, index) => ({
          index: index + 1,
          name: choice.name,
          subtitle: choice.subtitle,
          description: choice.description,
        })),
      }
      : null;
  const starMap = starMapView(team, run);
  const merchantState = getEndlessMerchantState(run);
  const merchant = merchantState
    ? {
        ...merchantState,
        stock: merchantState.stock.map((good, index) => ({
          ...good,
          index: index + 1,
        })),
      }
    : null;
  return {
    team: {
      id: team.id,
      leader: team.leader,
      viewer: userId,
      isLeader: team.leader === userId,
      memberNames: team.memberNames,
    },
    run: {
      id: run.id,
      layer: run.layer,
      phase: run.phase,
      lifeFire: run.lifeFire,
      maxLifeFire: run.maxLifeFire,
      world: run.lastBattle?.world || '',
      banked: {
        ...(run.banked || {}),
        cultivation: amount(bankedRewards.cultivation),
        blood: amount(bankedRewards.blood),
      },
      unbanked: {
        ...(run.unbanked || {}),
        cultivation: amount(unbankedRewards.cultivation),
        blood: amount(unbankedRewards.blood),
      },
      fusions: (run.fusions || []).map(id => getFusion(id)?.name || id),
    },
    members: Object.values(run.members || {}).map(current => memberView(run, current)),
    choices,
    checkpoint,
    battle: battleView(run, userId),
    starMap,
    merchant,
    settlement: settlementView(run, userId),
    ended: ['settling', 'defeated'].includes(run.phase),
    permissions: {
      choose: choices.length > 0,
      advance: team.leader === userId && run.phase === 'ready',
      checkpoint: team.leader === userId && run.phase === 'checkpoint',
      withdraw: team.leader === userId,
      suggestRoute: Boolean(starMap?.canSuggest),
      selectRoute: Boolean(starMap?.canSelect && team.leader === userId),
      merchantPurchase: Boolean(merchant),
    },
  };
}

function webEvent(session, msg) {
  const messages = [];
  return {
    user_id: session.rawUserId,
    group_id: session.groupId,
    isGroup: true,
    isEndlessWeb: true,
    endlessTerminalState: null,
    msg,
    messages,
    async reply(payload) {
      if (typeof payload === 'string') messages.push(payload);
      return true;
    },
  };
}

async function loadSession(redisClient, config, req) {
  const token = parseCookies(req.headers.cookie)[cookieName(config)];
  if (!token) return null;
  const raw = await redisClient.get(sessionKey(token));
  if (!raw) return null;
  try {
    return { token, ...JSON.parse(raw) };
  } catch {
    await redisClient.del(sessionKey(token));
    return null;
  }
}

async function loadWorldSession(redisClient, config, req) {
  const token = parseCookies(req.headers.cookie)[worldCookieName(config)];
  if (!token) return null;
  const raw = await redisClient.get(worldSessionKey(token));
  if (!raw) return null;
  try {
    return { token, ...JSON.parse(raw) };
  } catch {
    await redisClient.del(worldSessionKey(token));
    return null;
  }
}

async function loadSurveySession(redisClient, config, req) {
  const token = parseCookies(req.headers.cookie)[surveyCookieName(config)];
  if (!token) return null;
  const raw = await redisClient.get(surveySessionKey(token));
  if (!raw) return null;
  try {
    return { token, ...JSON.parse(raw) };
  } catch {
    await redisClient.del(surveySessionKey(token));
    return null;
  }
}

async function loadCanglanSession(redisClient, config, req) {
  const token = parseCookies(req.headers.cookie)[canglanCookieName(config)];
  if (!token) return null;
  const raw = await redisClient.get(canglanSessionKey(token));
  if (!raw) return null;
  try {
    return { token, ...JSON.parse(raw) };
  } catch {
    await redisClient.del(canglanSessionKey(token));
    return null;
  }
}

function currentWorldController(controller) {
  return controller || activeWorldController;
}

function currentSurveyController(controller) {
  return controller || activeSurveyController;
}

function currentCanglanController(controller) {
  return controller || activeCanglanController;
}

function canglanControllerIdentity(session) {
  const {
    token: _token,
    relay: _relay,
    relayKind: _relayKind,
    relaySessionId: _relaySessionId,
    ...identity
  } = session || {};
  return {
    ...identity,
    userId: String(identity.userId || ''),
    runId: String(identity.runId || ''),
  };
}

async function currentState(realm, session, redisClient = null) {
  const team = await realm.getTeam(session.teamId);
  const run = team ? await realm.getRun(team.id) : null;
  if (!team || !run || !team.members.includes(session.userId)) return null;
  const state = serializeEndlessWebState(realm, team, run, session.userId);
  state.teamChat = redisClient ? await readTeamChat(redisClient, team.id) : [];
  return state;
}

async function performAction(realm, session, action, value) {
  const definitions = {
    choose: ['chooseAbility', `#无尽选择${Number(value)}`],
    checkpoint: ['chooseCheckpoint', `#劫后抉择${Number(value)}`],
    suggest: ['suggestStarRoute', `#星图建议${Number(value)}`],
    selectRoute: ['selectStarRoute', `#星图定途${Number(value)}`],
    merchant: ['buyRunMerchantItem', `#劫境购买${Number(value)}`],
    advance: ['nextLayer', '#无尽下一关'],
    withdraw: ['withdrawRun', '#退出无尽劫境'],
  };
  const selected = definitions[action];
  const indexedActions = new Set(['choose', 'checkpoint', 'suggest', 'selectRoute', 'merchant']);
  if (!selected || (indexedActions.has(action) && !Number.isInteger(Number(value)))) throw new Error('未知操作');
  const [method, msg] = selected;
  const event = webEvent(session, msg);
  await realm[method](event);
  return {
    message: event.messages.at(-1) || '劫境状态已更新',
    terminalState: event.endlessTerminalState,
  };
}

function worldRelayReady(client) {
  return client.authed && client.ws?.readyState === client.WebSocket.OPEN;
}

async function waitForWorldRelay(client = worldChatClient, timeoutMs = 5000) {
  if (worldRelayReady(client)) return true;
  client.connect();
  const deadline = Date.now() + timeoutMs;
  while (!worldRelayReady(client) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return worldRelayReady(client);
}

export async function createRelayTicket(
  kind,
  identity,
  client = worldChatClient,
  timeoutMs = 5000
) {
  let result = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!(await waitForWorldRelay(client, timeoutMs))) {
      result = { ok: false, reason: 'disconnected' };
    } else {
      try {
        result = await client.createWebTicket(kind, identity);
      } catch (error) {
        client.lastError = error?.message || String(error);
        result = { ok: false, reason: 'disconnected' };
      }
      if (result?.ok && result.token) return result.token;
    }
    if (result?.reason !== 'disconnected') break;
  }
  throw new Error(`网页中继签发失败：${result?.reason || 'unknown'}`);
}

async function consumeLocalOrRelayTicket(redisClient, kind, token, client = worldChatClient) {
  const localConsumers = {
    endless: consumeEndlessWebTicket,
    survey: consumeSurveyWebTicket,
    canglan: consumeCanglanWebTicket,
  };
  const localConsumer = localConsumers[kind];
  if (!localConsumer) return null;
  const identity = await localConsumer(redisClient, token);
  if (identity) return identity;
  if (!client.authed) return null;
  const result = await client.openWebSession(token);
  if (!result?.ok || result.kind !== kind || !result.session_id) return null;
  return {
    relay: true,
    relayKind: kind,
    relaySessionId: result.session_id,
  };
}

async function requestWebRelay(session, operation, body = {}, client = worldChatClient) {
  const result = await client.webRequest(
    session.relaySessionId,
    operation,
    body
  );
  if (!result?.ok || !result.result) {
    throw new Error(`网页中继请求失败：${result?.reason || 'unknown'}`);
  }
  return result.result;
}

async function handleCanglanAction(controller, session, body, redisClient, sessionTtlSeconds) {
  if (!controller || typeof controller.performWebAction !== 'function') {
    return { status: 503, payload: { error: '沧澜星图操作服务尚未就绪' } };
  }
  const action = String(body?.action || '').trim();
  const targetId = String(body?.targetId ?? '').trim();
  const operationId = String(body?.operationId || '');
  if (!action || action.length > 48)
    return { status: 400, payload: { error: '操作类型无效' } };
  if (!targetId || targetId.length > 120)
    return { status: 400, payload: { error: '目标星辰无效' } };
  if (!/^[A-Za-z0-9-]{16,64}$/.test(operationId))
    return { status: 400, payload: { error: '操作标识无效' } };

  const operationKey = canglanActionKey(session.token, operationId);
  const acquired = await redisClient.set(operationKey, 'processing', {
    NX: true,
    EX: 60,
  });
  if (!acquired) {
    const cached = await redisClient.get(operationKey);
    if (cached && cached !== 'processing') return JSON.parse(cached);
    return { status: 409, payload: { error: '该操作正在执行，请勿重复提交' } };
  }

  const identity = canglanControllerIdentity(session);
  try {
    const actionResult = await controller.performWebAction({
      ...identity,
      action,
      targetId,
      operationId,
    });
    const result = actionResult && typeof actionResult === 'object'
      ? { ...actionResult }
      : { message: String(actionResult || '沧澜星图状态已更新') };
    result.ok = result.ok !== false;
    const receipt = { status: result.ok ? 200 : 400, payload: result };

    // Persist the domain result before optional state enrichment so retries never repeat the action.
    await redisClient.set(operationKey, JSON.stringify(receipt), {
      EX: sessionTtlSeconds,
    });
    if (result.ok && !Object.hasOwn(result, 'state') && typeof controller.getWebState === 'function') {
      try {
        result.state = await controller.getWebState(identity);
        await redisClient.set(operationKey, JSON.stringify(receipt), {
          EX: sessionTtlSeconds,
        });
      } catch (error) {
        globalThis.logger?.warn?.(`[沧澜星图网页] 状态富化失败：${error.message}`);
      }
    }
    return receipt;
  } catch (error) {
    await redisClient.del(operationKey);
    throw error;
  }
}

async function handleIncomingWebRelay({ kind, operation, sessionId, identity, body }) {
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('redis_not_ready');
  const session = {
    ...(identity || {}),
    token: `relay:${sessionId}`,
  };

  if (kind === 'canglan') {
    const controller = currentCanglanController();
    if (!controller) throw new Error('canglan_not_ready');
    if (operation === 'state') {
      if (typeof controller.getWebState !== 'function') throw new Error('canglan_state_not_ready');
      return {
        status: 200,
        payload: { ok: true, state: await controller.getWebState(canglanControllerIdentity(session)) },
      };
    }
    if (operation === 'action') {
      return handleCanglanAction(
        controller,
        session,
        body || {},
        redisClient,
        getEndlessWebConfig().sessionTtlSeconds
      );
    }
    throw new Error('invalid_web_operation');
  }

  if (kind === 'survey') {
    const controller = currentSurveyController();
    if (!controller) throw new Error('survey_not_ready');
    if (operation === 'state') {
      return {
        status: 200,
        payload: { ok: true, state: await controller.getSurveyWebState(session) },
      };
    }
    if (operation === 'submit') {
      const result = await controller.submitSurvey(session, body || {});
      return {
        status: result?.ok === false ? 400 : 200,
        payload: result || { ok: true },
      };
    }
    throw new Error('invalid_web_operation');
  }

  if (kind !== 'endless' || !activeRealm) throw new Error('endless_not_ready');
  const state = await currentState(activeRealm, session, redisClient);
  if (!state) {
    return { status: 410, payload: { error: '本次无尽劫境已经结束' } };
  }
  if (operation === 'state') {
    return { status: 200, payload: { ok: true, state } };
  }
  if (operation === 'chat.get') {
    return { status: 200, payload: { ok: true, messages: state.teamChat || [] } };
  }
  if (operation === 'chat.post') {
    const text = cleanTeamChatText(body?.text);
    if (!text) return { status: 400, payload: { error: '消息内容不能为空' } };
    const team = await activeRealm.getTeam(session.teamId);
    const message = {
      id: `${Date.now()}-${randomToken(6)}`,
      userId: String(session.userId),
      name: String(team?.memberNames?.[session.userId] || session.rawUserId || '同行者').slice(0, 40),
      text,
      at: Date.now(),
    };
    await appendTeamChat(redisClient, session.teamId, message);
    return {
      status: 200,
      payload: {
        ok: true,
        message,
        messages: await readTeamChat(redisClient, session.teamId),
      },
    };
  }
  if (operation !== 'action') throw new Error('invalid_web_operation');

  const operationId = String(body?.operationId || '');
  if (!/^[A-Za-z0-9-]{16,64}$/.test(operationId)) {
    return { status: 400, payload: { error: '操作标识无效' } };
  }
  const operationKey = actionKey(session.token, operationId);
  const acquired = await redisClient.set(operationKey, 'processing', {
    NX: true,
    EX: 60,
  });
  if (!acquired) {
    const cached = await redisClient.get(operationKey);
    if (cached && cached !== 'processing') {
      return { status: 200, payload: JSON.parse(cached) };
    }
    return { status: 409, payload: { error: '该操作正在执行，请勿重复提交' } };
  }
  try {
    const actionResult = await performAction(
      activeRealm,
      session,
      body?.action,
      body?.value
    );
    const nextState = actionResult.terminalState ||
      (await currentState(activeRealm, session, redisClient));
    if (nextState && !nextState.teamChat) {
      nextState.teamChat = await readTeamChat(redisClient, session.teamId);
    }
    const result = {
      ok: true,
      message: actionResult.message,
      state: nextState,
      ended: Boolean(actionResult.terminalState) || !nextState,
    };
    await redisClient.set(operationKey, JSON.stringify(result), {
      EX: getEndlessWebConfig().sessionTtlSeconds,
    });
    return { status: 200, payload: result };
  } catch (error) {
    await redisClient.del(operationKey);
    throw error;
  }
}

export function createEndlessWebHttpServer({
  realm,
  redisClient,
  config,
  worldController = null,
  surveyController = null,
  canglanController = null,
  relayClient = worldChatClient,
  gatewayMode = false,
  healthCheck = null,
}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const endlessRealm = activeRealm || realm;
    try {
      if (req.method === 'GET' && healthCheck && ['/healthz', '/readyz'].includes(url.pathname)) {
        const health = await healthCheck();
        const ready = Boolean(health.redis && health.relay);
        return sendJson(res, url.pathname === '/readyz' && !ready ? 503 : 200, {
          ok: url.pathname === '/healthz' || ready,
          service: 'zhutian-web-gateway',
          ready,
        });
      }
      if (gatewayMode && url.pathname.startsWith('/api/')) {
        if (url.pathname.startsWith('/api/world/')) {
          return sendJson(res, 503, { error: '世界网页尚未接入公共中转' });
        }
        if (!relayClient.authed || (healthCheck && !(await healthCheck()).redis)) {
          return sendJson(res, 503, { error: '公共中转连接恢复中，请稍后重试' });
        }
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/endless')) {
        return sendFile(res, path.join(webRoot, 'index.html'), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/endless/app.js') return sendFile(res, path.join(webRoot, 'app.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/endless/style.css') return sendFile(res, path.join(webRoot, 'style.css'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/endless/realm.jpg')
        return sendFile(res, path.join(pluginRoot, 'resources', 'img', 'help', 'zhutian.jpg'), 'image/jpeg');
      if (req.method === 'GET' && url.pathname === '/endless/number.ttf')
        return sendFile(res, path.join(pluginRoot, 'resources', 'font', 'tttgbnumber.ttf'), 'font/ttf');

      if (req.method === 'GET' && (url.pathname === '/wendao' || url.pathname === '/wendao/'))
        return sendFile(res, path.join(wendaoWebRoot, 'index.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/wendao/app.js')
        return sendFile(res, path.join(wendaoWebRoot, 'app.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/wendao/style.css')
        return sendFile(res, path.join(wendaoWebRoot, 'style.css'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/wendao/content.json')
        return sendFile(res, path.join(wendaoWebRoot, 'content.json'), 'application/json; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/wendao/number.ttf')
        return sendFile(res, path.join(pluginRoot, 'resources', 'font', 'tttgbnumber.ttf'), 'font/ttf');
      if (req.method === 'GET' && url.pathname.startsWith('/wendao/audio/')) {
        const audio = WENDAO_AUDIO[url.pathname.slice('/wendao/audio/'.length)];
        if (audio) return sendFile(res, audio, 'audio/ogg');
      }
      if (req.method === 'GET' && url.pathname.startsWith('/wendao/assets/')) {
        const asset = WENDAO_ASSETS[url.pathname.slice('/wendao/assets/'.length)];
        if (asset) return sendFile(res, asset, 'image/jpeg');
      }

      if (req.method === 'GET' && (url.pathname === '/world' || url.pathname === '/world/'))
        return sendFile(res, path.join(worldWebRoot, 'index.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/world/app.js')
        return sendFile(res, path.join(worldWebRoot, 'app.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/world/lucide.min.js')
        return sendFile(res, path.join(worldWebRoot, 'lucide.min.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/world/style.css')
        return sendFile(res, path.join(worldWebRoot, 'style.css'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/world/number.ttf')
        return sendFile(res, path.join(pluginRoot, 'resources', 'font', 'tttgbnumber.ttf'), 'font/ttf');
      if (req.method === 'GET' && url.pathname.startsWith('/world/assets/')) {
        const asset = WORLD_ASSETS[url.pathname.slice('/world/assets/'.length)];
        if (asset) return sendFile(res, asset, 'image/jpeg');
      }

      if (req.method === 'GET' && (url.pathname === '/canglan' || url.pathname === '/canglan/'))
        return sendFile(res, path.join(canglanWebRoot, 'index.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/canglan/app.js')
        return sendFile(res, path.join(canglanWebRoot, 'app.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/canglan/style.css')
        return sendFile(res, path.join(canglanWebRoot, 'style.css'), 'text/css; charset=utf-8');

      if (req.method === 'GET' && (url.pathname === '/survey' || url.pathname === '/survey/'))
        return sendFile(res, path.join(surveyWebRoot, 'index.html'), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/survey/app.js')
        return sendFile(res, path.join(surveyWebRoot, 'app.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/survey/style.css')
        return sendFile(res, path.join(surveyWebRoot, 'style.css'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/survey/realm.jpg')
        return sendFile(res, path.join(pluginRoot, 'resources', 'img', 'help', 'zhutian.jpg'), 'image/jpeg');

      if (req.method === 'POST' && url.pathname === '/api/canglan/session') {
        if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
        if (!(await withinRateLimit(redisClient, `canglan-session:${clientAddress(req)}`, 10, 60)))
          return sendJson(res, 429, { error: '入口请求过于频繁，请稍后再试' });
        const body = await readJson(req);
        const identity = await consumeLocalOrRelayTicket(
          redisClient,
          'canglan',
          String(body.ticket || ''),
          relayClient
        );
        if (!identity || (!identity.relay && (!identity.userId || !identity.runId)))
          return sendJson(res, 401, { error: '入口已失效，请重新领取沧澜星图入口' });
        const session = randomToken();
        await redisClient.set(canglanSessionKey(session), JSON.stringify(identity), {
          EX: config.sessionTtlSeconds,
        });
        const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
        return sendJson(res, 200, { ok: true }, {
          'Set-Cookie': `${canglanCookieName(config)}=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.sessionTtlSeconds}${secure}`,
        });
      }

      if (url.pathname.startsWith('/api/canglan/')) {
        const session = await loadCanglanSession(redisClient, config, req);
        if (!session)
          return sendJson(res, 401, { error: '会话已失效，请重新领取沧澜星图入口' });
        if (session.relay) {
          if (req.method === 'GET' && url.pathname === '/api/canglan/state') {
            const relayed = await requestWebRelay(session, 'state', {}, relayClient);
            return sendJson(res, relayed.status, relayed.payload);
          }
          if (req.method === 'POST' && url.pathname === '/api/canglan/action') {
            if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
            if (!(await withinRateLimit(redisClient, `canglan-action:${session.token}`, 30, 10)))
              return sendJson(res, 429, { error: '操作过于频繁，请稍后再试' });
            const relayed = await requestWebRelay(session, 'action', await readJson(req), relayClient);
            return sendJson(res, relayed.status, relayed.payload);
          }
        }
        const controller = currentCanglanController(canglanController);
        if (!controller) return sendJson(res, 503, { error: '沧澜星图服务尚未就绪' });
        const controllerIdentity = canglanControllerIdentity(session);
        if (req.method === 'GET' && url.pathname === '/api/canglan/state') {
          if (typeof controller.getWebState !== 'function')
            return sendJson(res, 503, { error: '沧澜星图状态服务尚未就绪' });
          const state = await controller.getWebState(controllerIdentity);
          return sendJson(res, 200, { ok: true, state });
        }
        if (req.method === 'POST' && url.pathname === '/api/canglan/action') {
          if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
          if (!(await withinRateLimit(redisClient, `canglan-action:${session.token}`, 30, 10)))
            return sendJson(res, 429, { error: '操作过于频繁，请稍后再试' });
          const body = await readJson(req);
          const result = await handleCanglanAction(
            controller,
            session,
            body,
            redisClient,
            config.sessionTtlSeconds
          );
          return sendJson(res, result.status, result.payload);
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/survey/session') {
        if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
        if (!(await withinRateLimit(redisClient, `survey-session:${clientAddress(req)}`, 10, 60)))
          return sendJson(res, 429, { error: '入口请求过于频繁，请稍后再试' });
        const body = await readJson(req);
        const identity = await consumeLocalOrRelayTicket(
          redisClient,
          'survey',
          String(body.token || ''),
          relayClient
        );
        if (!identity) return sendJson(res, 401, { error: '入口已失效，请重新发送 #诸天调研问卷' });
        const session = randomToken();
        await redisClient.set(surveySessionKey(session), JSON.stringify(identity), {
          EX: config.sessionTtlSeconds,
        });
        const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
        return sendJson(res, 200, { ok: true }, {
          'Set-Cookie': `${surveyCookieName(config)}=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.sessionTtlSeconds}${secure}`,
        });
      }

      if (url.pathname.startsWith('/api/survey/')) {
        const session = await loadSurveySession(redisClient, config, req);
        if (!session) return sendJson(res, 401, { error: '会话已失效，请重新发送 #诸天调研问卷' });
        if (session.relay) {
          if (req.method === 'GET' && url.pathname === '/api/survey/state') {
            const relayed = await requestWebRelay(session, 'state', {}, relayClient);
            return sendJson(res, relayed.status, relayed.payload);
          }
          if (req.method === 'POST' && url.pathname === '/api/survey/submit') {
            if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
            if (!(await withinRateLimit(redisClient, `survey-submit:${session.token}`, 5, 60)))
              return sendJson(res, 429, { error: '提交过于频繁，请稍后再试' });
            const relayed = await requestWebRelay(session, 'submit', await readJson(req), relayClient);
            return sendJson(res, relayed.status, relayed.payload);
          }
        }
        const controller = currentSurveyController(surveyController);
        if (!controller) return sendJson(res, 503, { error: '调研服务尚未就绪' });
        if (req.method === 'GET' && url.pathname === '/api/survey/state') {
          return sendJson(res, 200, { ok: true, state: await controller.getSurveyWebState(session) });
        }
        if (req.method === 'POST' && url.pathname === '/api/survey/submit') {
          if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
          if (!(await withinRateLimit(redisClient, `survey-submit:${session.token}`, 5, 60)))
            return sendJson(res, 429, { error: '提交过于频繁，请稍后再试' });
          const result = await controller.submitSurvey(session, await readJson(req));
          return sendJson(res, result?.ok === false ? 400 : 200, result || { ok: true });
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/world/session') {
        if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
        if (!(await withinRateLimit(redisClient, `world-session:${clientAddress(req)}`, 10, 60)))
          return sendJson(res, 429, { error: '入口请求过于频繁，请稍后再试' });
        const body = await readJson(req);
        const identity = await consumeWorldWebTicket(redisClient, String(body.token || ''));
        if (!identity) return sendJson(res, 401, { error: '入口已失效，请重新发送 #世界网页' });
        const session = randomToken();
        await redisClient.set(worldSessionKey(session), JSON.stringify(identity), {
          EX: config.sessionTtlSeconds,
        });
        const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
        return sendJson(res, 200, { ok: true }, {
          'Set-Cookie': `${worldCookieName(config)}=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${config.sessionTtlSeconds}${secure}`,
        });
      }

      if (url.pathname.startsWith('/api/world/')) {
        const session = await loadWorldSession(redisClient, config, req);
        if (!session) return sendJson(res, 401, { error: '会话已失效，请重新发送 #世界网页' });
        const controller = currentWorldController(worldController);
        if (!controller) return sendJson(res, 503, { error: '世界频道服务尚未就绪' });
        if (req.method === 'GET' && url.pathname === '/api/world/state') {
          return sendJson(res, 200, { ok: true, state: await controller.getWorldWebState(session) });
        }
        if (req.method === 'POST') {
          if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
          if (!(await withinRateLimit(redisClient, `world-action:${session.token}`, 30, 10)))
            return sendJson(res, 429, { error: '操作过于频繁，请稍后再试' });
          const body = await readJson(req);
          let result;
          if (url.pathname === '/api/world/message') result = await controller.sendWorldWebMessage(session, body);
          else if (url.pathname === '/api/world/trade') result = await controller.createWorldWebTrade(session, body);
          else if (url.pathname === '/api/world/trade/accept') result = await controller.acceptWorldWebTrade(session, body);
          else if (url.pathname === '/api/world/trade/cancel') result = await controller.cancelWorldWebTrade(session, body);
          else return sendJson(res, 404, { error: '操作不存在' });
          return sendJson(res, result?.ok === false ? 400 : 200, result || { ok: true });
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/endless/session') {
        if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
        if (!(await withinRateLimit(redisClient, `session:${clientAddress(req)}`, 10, 60)))
          return sendJson(res, 429, { error: '入口请求过于频繁，请稍后再试' });
        const body = await readJson(req);
        const identity = await consumeLocalOrRelayTicket(
          redisClient,
          'endless',
          String(body.token || ''),
          relayClient
        );
        if (!identity)
          return sendJson(res, 401, {
            error: '入口已失效，请重新发送 #无尽网页',
          });
        const session = randomToken();
        await redisClient.set(sessionKey(session), JSON.stringify(identity), {
          EX: config.sessionTtlSeconds,
        });
        const secure = config.publicUrl.startsWith('https://') ? '; Secure' : '';
        return sendJson(
          res,
          200,
          { ok: true },
          {
            'Set-Cookie': `${cookieName(config)}=${encodeURIComponent(session)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${
              config.sessionTtlSeconds
            }${secure}`,
          }
        );
      }

      if (url.pathname.startsWith('/api/endless/')) {
        const session = await loadSession(redisClient, config, req);
        if (!session)
          return sendJson(res, 401, {
            error: '会话已失效，请重新领取网页入口',
          });
        if (session.relay) {
          if (req.method === 'GET' && url.pathname === '/api/endless/state') {
            const relayed = await requestWebRelay(session, 'state', {}, relayClient);
            if (relayed.status === 410) await redisClient.del(sessionKey(session.token));
            return sendJson(res, relayed.status, relayed.payload);
          }
          if (url.pathname === '/api/endless/chat') {
            if (req.method === 'GET') {
              const relayed = await requestWebRelay(session, 'chat.get', {}, relayClient);
              return sendJson(res, relayed.status, relayed.payload);
            }
            if (req.method === 'POST') {
              if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
              if (!(await withinRateLimit(redisClient, `chat:${session.token}`, 60, 60)))
                return sendJson(res, 429, { error: '队伍聊天过于频繁，请稍后再试' });
              const relayed = await requestWebRelay(session, 'chat.post', await readJson(req), relayClient);
              return sendJson(res, relayed.status, relayed.payload);
            }
          }
          if (req.method === 'POST' && url.pathname === '/api/endless/action') {
            if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
            if (!(await withinRateLimit(redisClient, `action:${session.token}`, 30, 10)))
              return sendJson(res, 429, { error: '操作过于频繁，请稍后再试' });
            const relayed = await requestWebRelay(session, 'action', await readJson(req), relayClient);
            if (relayed.payload?.ended) await redisClient.del(sessionKey(session.token));
            return sendJson(res, relayed.status, relayed.payload);
          }
        }
        if (req.method === 'GET' && url.pathname === '/api/endless/state') {
          const state = await currentState(endlessRealm, session, redisClient);
          if (!state) await redisClient.del(sessionKey(session.token));
          return state ? sendJson(res, 200, { ok: true, state }) : sendJson(res, 410, { error: '本次无尽劫境已经结束' });
        }
        if (url.pathname === '/api/endless/chat') {
          const state = await currentState(endlessRealm, session, redisClient);
          if (!state) return sendJson(res, 410, { error: '本次无尽劫境已经结束' });
          if (req.method === 'GET') return sendJson(res, 200, { ok: true, messages: state.teamChat || [] });
          if (req.method === 'POST') {
            if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
            if (!(await withinRateLimit(redisClient, `chat:${session.token}`, 60, 60)))
              return sendJson(res, 429, { error: '队伍聊天过于频繁，请稍后再试' });
            const body = await readJson(req);
            const text = cleanTeamChatText(body.text);
            if (!text) return sendJson(res, 400, { error: '消息内容不能为空' });
            const team = await endlessRealm.getTeam(session.teamId);
            const message = {
              id: `${Date.now()}-${randomToken(6)}`,
              userId: String(session.userId),
              name: String(team?.memberNames?.[session.userId] || session.rawUserId || '同行者').slice(0, 40),
              text,
              at: Date.now(),
            };
            await appendTeamChat(redisClient, session.teamId, message);
            return sendJson(res, 200, { ok: true, message, messages: await readTeamChat(redisClient, session.teamId) });
          }
        }
        if (req.method === 'POST' && url.pathname === '/api/endless/action') {
          if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
          if (!(await withinRateLimit(redisClient, `action:${session.token}`, 30, 10))) return sendJson(res, 429, { error: '操作过于频繁，请稍后再试' });
          const body = await readJson(req);
          const operationId = String(body.operationId || '');
          if (!/^[A-Za-z0-9-]{16,64}$/.test(operationId)) return sendJson(res, 400, { error: '操作标识无效' });
          if (!(await currentState(endlessRealm, session, redisClient))) {
            await redisClient.del(sessionKey(session.token));
            return sendJson(res, 410, { error: '本次无尽劫境已经结束' });
          }
          const operationKey = actionKey(session.token, operationId);
          const acquired = await redisClient.set(operationKey, 'processing', {
            NX: true,
            EX: 60,
          });
          if (!acquired) {
            const cached = await redisClient.get(operationKey);
            if (cached && cached !== 'processing') return sendJson(res, 200, JSON.parse(cached));
            return sendJson(res, 409, {
              error: '该操作正在执行，请勿重复提交',
            });
          }
          try {
            const actionResult = await performAction(endlessRealm, session, body.action, body.value);
            const state = actionResult.terminalState || (await currentState(endlessRealm, session, redisClient));
            if (state && !state.teamChat) state.teamChat = await readTeamChat(redisClient, session.teamId);
            const result = { ok: true, message: actionResult.message, state, ended: Boolean(actionResult.terminalState) || !state };
            await redisClient.set(operationKey, JSON.stringify(result), {
              EX: config.sessionTtlSeconds,
            });
            if (result.ended) await redisClient.del(sessionKey(session.token));
            return sendJson(res, 200, result);
          } catch (error) {
            await redisClient.del(operationKey);
            throw error;
          }
        }
      }
      return sendJson(res, 404, { error: '页面不存在' });
    } catch (error) {
      globalThis.logger?.error?.('[无尽网页] 请求处理失败', error);
      return sendJson(res, 400, { error: error.message || '请求处理失败' });
    }
  });
}

async function ensureServer(realm, redisClient, config) {
  if (realm) activeRealm = realm;
  if (activeServer?.listening) return activeServer;
  if (serverPromise) return serverPromise;
  serverPromise = new Promise((resolve, reject) => {
    const server = createEndlessWebHttpServer({
      realm: activeRealm,
      redisClient,
      config,
    });
    server.once('error', error => {
      serverPromise = null;
      reject(error);
    });
    server.once('close', () => {
      if (activeServer === server) activeServer = null;
    });
    server.listen(config.port, config.host, () => {
      activeServer = server;
      serverPromise = null;
      globalThis.logger?.mark?.(`[无尽网页] 已监听 ${config.host}:${config.port}`);
      resolve(server);
    });
  });
  return serverPromise;
}

export async function startEndlessWebServer(realm) {
  if (realm) activeRealm = realm;
  const config = getEndlessWebConfig();
  if (!config.enabled || config.relayEnabled) return null;
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  return ensureServer(realm, redisClient, config);
}

export async function createEndlessWebLink(realm, identity) {
  const config = getEndlessWebConfig();
  if (!config.enabled) throw new Error('无尽网页功能尚未开启');
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  if (config.relayEnabled) activeRealm = realm;
  else await startEndlessWebServer(realm);
  const token = config.relayEnabled
    ? await createRelayTicket('endless', identity)
    : await issueEndlessWebTicket(redisClient, config, identity);
  return `${config.publicUrl}/endless?t=${encodeURIComponent(token)}`;
}

export function registerWorldWebController(controller) {
  activeWorldController = controller || null;
}

export function registerSurveyWebController(controller) {
  activeSurveyController = controller || null;
}

export function registerCanglanWebController(controller) {
  activeCanglanController = controller || null;
}

export async function createCanglanWebLink(controller, identity) {
  const config = getEndlessWebConfig();
  if (!config.enabled) throw new Error('沧澜星图网页功能尚未开启');
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  const normalizedIdentity = identity && typeof identity === 'object'
    ? {
        ...identity,
        userId: String(identity.userId || ''),
        runId: String(identity.runId || ''),
      }
    : { userId: String(identity || ''), runId: '' };
  if (!normalizedIdentity.userId) throw new Error('沧澜星图入口缺少玩家身份');
  if (!normalizedIdentity.runId) throw new Error('沧澜星图入口缺少远征轮次');
  registerCanglanWebController(controller);
  if (!config.relayEnabled) await ensureServer(activeRealm, redisClient, config);
  const ticket = config.relayEnabled
    ? await createRelayTicket('canglan', normalizedIdentity)
    : await issueCanglanWebTicket(redisClient, config, normalizedIdentity);
  return `${config.publicUrl}/canglan?ticket=${encodeURIComponent(ticket)}`;
}

export async function createSurveyWebLink(controller, identity) {
  const config = getEndlessWebConfig();
  if (!config.enabled) throw new Error('诸天调研网页功能尚未开启');
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  registerSurveyWebController(controller);
  if (!config.relayEnabled) await ensureServer(activeRealm, redisClient, config);
  const token = config.relayEnabled
    ? await createRelayTicket('survey', identity)
    : await issueSurveyWebTicket(redisClient, config, identity);
  return `${config.publicUrl}/survey?t=${encodeURIComponent(token)}`;
}

export async function createWorldWebLink(controller, identity) {
  const config = getEndlessWebConfig();
  if (!config.enabled) throw new Error('世界网页功能尚未开启');
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  registerWorldWebController(controller);
  await ensureServer(activeRealm, redisClient, config);
  const token = await issueWorldWebTicket(redisClient, config, identity);
  return `${config.publicUrl}/world?t=${encodeURIComponent(token)}`;
}

export function createEndlessWendaoLink(config = getEndlessWebConfig()) {
  return `${config.publicUrl}/wendao`;
}

worldChatClient.setWebRelayHandler(handleIncomingWebRelay);

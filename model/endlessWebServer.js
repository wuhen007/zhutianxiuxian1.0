import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureEndlessStarMapState,
  getAbility,
  getCheckpointBoon,
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
const configPath = path.join(pluginRoot, 'config', 'endless-web.json');
const TICKET_PREFIX = 'Xiuxian:Endless:Web:Ticket:';
const SESSION_PREFIX = 'Xiuxian:Endless:Web:Session:';
const ACTION_PREFIX = 'Xiuxian:Endless:Web:Action:';
const BODY_LIMIT = 16 * 1024;
const CONSUME_TICKET_SCRIPT = `
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
`;

let activeServer = null;
let serverPromise = null;
let activeRealm = null;

function positiveInteger(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function getEndlessWebConfig() {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    globalThis.logger?.warn?.(`[无尽网页] 读取配置失败：${error.message}`);
  }
  const port = positiveInteger(process.env.ENDLESS_WEB_PORT || fileConfig.port, 3000);
  const publicUrl = String(process.env.ENDLESS_WEB_PUBLIC_URL || fileConfig.publicUrl || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  return {
    enabled: String(process.env.ENDLESS_WEB_ENABLED || fileConfig.enabled).toLowerCase() === 'true',
    host: String(process.env.ENDLESS_WEB_HOST || fileConfig.host || '127.0.0.1'),
    port,
    publicUrl,
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

function actionKey(session, operationId) {
  return `${ACTION_PREFIX}${session}:${operationId}`;
}

function cookieName(config) {
  return config.publicUrl.startsWith('https://') ? '__Host-endless_session' : 'endless_session';
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

export async function consumeEndlessWebTicket(redisClient, token) {
  const key = ticketKey(token);
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
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
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
    res.writeHead(200, securityHeaders(contentType, 'public, max-age=300'));
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
    trait: battle.trait,
    victory: battle.victory,
    rounds: battle.rounds,
    // 完整战报：返回本场全部日志（上限 400 条防极端超长），前端滚动查看
    logs: (battle.logs || []).slice(-400),
    damageByMember: battle.damageByMember || {},
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
      ? { id: selected.id, name: selected.name, shortName: selected.shortName, worldName: selected.worldName }
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
    settlement: settlementView(run, userId),
    ended: ['settling', 'defeated'].includes(run.phase),
    permissions: {
      choose: choices.length > 0,
      advance: team.leader === userId && run.phase === 'ready',
      checkpoint: team.leader === userId && run.phase === 'checkpoint',
      withdraw: team.leader === userId,
      suggestRoute: Boolean(starMap?.canSuggest),
      selectRoute: Boolean(starMap?.canSelect && team.leader === userId),
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

async function currentState(realm, session) {
  const team = await realm.getTeam(session.teamId);
  const run = team ? await realm.getRun(team.id) : null;
  if (!team || !run || !team.members.includes(session.userId)) return null;
  return serializeEndlessWebState(realm, team, run, session.userId);
}

async function performAction(realm, session, action, value) {
  const definitions = {
    choose: ['chooseAbility', `#无尽选择${Number(value)}`],
    checkpoint: ['chooseCheckpoint', `#劫后抉择${Number(value)}`],
    suggest: ['suggestStarRoute', `#星图建议${Number(value)}`],
    selectRoute: ['selectStarRoute', `#星图定途${Number(value)}`],
    advance: ['nextLayer', '#无尽下一关'],
    withdraw: ['withdrawRun', '#退出无尽劫境'],
  };
  const selected = definitions[action];
  const indexedActions = new Set(['choose', 'checkpoint', 'suggest', 'selectRoute']);
  if (!selected || (indexedActions.has(action) && !Number.isInteger(Number(value)))) throw new Error('未知操作');
  const [method, msg] = selected;
  const event = webEvent(session, msg);
  await realm[method](event);
  return {
    message: event.messages.at(-1) || '劫境状态已更新',
    terminalState: event.endlessTerminalState,
  };
}

export function createEndlessWebHttpServer({ realm, redisClient, config }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/endless')) {
        return sendFile(res, path.join(webRoot, 'index.html'), 'text/html; charset=utf-8');
      }
      if (req.method === 'GET' && url.pathname === '/endless/app.js') return sendFile(res, path.join(webRoot, 'app.js'), 'text/javascript; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/endless/style.css') return sendFile(res, path.join(webRoot, 'style.css'), 'text/css; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/endless/realm.jpg')
        return sendFile(res, path.join(pluginRoot, 'resources', 'img', 'help', 'zhutian.jpg'), 'image/jpeg');
      if (req.method === 'GET' && url.pathname === '/endless/number.ttf')
        return sendFile(res, path.join(pluginRoot, 'resources', 'font', 'tttgbnumber.ttf'), 'font/ttf');

      if (req.method === 'POST' && url.pathname === '/api/endless/session') {
        if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
        if (!(await withinRateLimit(redisClient, `session:${clientAddress(req)}`, 10, 60)))
          return sendJson(res, 429, { error: '入口请求过于频繁，请稍后再试' });
        const body = await readJson(req);
        const identity = await consumeEndlessWebTicket(redisClient, String(body.token || ''));
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
        if (req.method === 'GET' && url.pathname === '/api/endless/state') {
          const state = await currentState(realm, session);
          if (!state) await redisClient.del(sessionKey(session.token));
          return state ? sendJson(res, 200, { ok: true, state }) : sendJson(res, 410, { error: '本次无尽劫境已经结束' });
        }
        if (req.method === 'POST' && url.pathname === '/api/endless/action') {
          if (!sameOrigin(req, config)) return sendJson(res, 403, { error: '请求来源无效' });
          if (!(await withinRateLimit(redisClient, `action:${session.token}`, 30, 10))) return sendJson(res, 429, { error: '操作过于频繁，请稍后再试' });
          const body = await readJson(req);
          const operationId = String(body.operationId || '');
          if (!/^[A-Za-z0-9-]{16,64}$/.test(operationId)) return sendJson(res, 400, { error: '操作标识无效' });
          if (!(await currentState(realm, session))) {
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
            const actionResult = await performAction(realm, session, body.action, body.value);
            const state = actionResult.terminalState || (await currentState(realm, session));
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
  activeRealm = realm;
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
    server.listen(config.port, config.host, () => {
      activeServer = server;
      globalThis.logger?.mark?.(`[无尽网页] 已监听 ${config.host}:${config.port}`);
      resolve(server);
    });
  });
  return serverPromise;
}

export async function startEndlessWebServer(realm) {
  const config = getEndlessWebConfig();
  if (!config.enabled) return null;
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  return ensureServer(realm, redisClient, config);
}

export async function createEndlessWebLink(realm, identity) {
  const config = getEndlessWebConfig();
  if (!config.enabled) throw new Error('无尽网页功能尚未开启');
  const redisClient = globalThis.redis;
  if (!redisClient) throw new Error('Redis 尚未就绪');
  await startEndlessWebServer(realm);
  const token = await issueEndlessWebTicket(redisClient, config, identity);
  return `${config.publicUrl}/endless?t=${encodeURIComponent(token)}`;
}

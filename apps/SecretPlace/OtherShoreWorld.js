import { randomUUID } from 'node:crypto';
import { plugin } from '../../api/api.js';
import {
  Read_player,
  Write_player,
  channel,
  existplayer,
  foundthing,
} from '../../model/xiuxian.js';
import { normalizeRiftMemoryState } from '../../model/foreignCalamity.js';
import {
  consumeSpiritHeart,
  getSpiritHeartMax,
  refreshSpiritHeart,
} from '../../model/spiritUniverse.js';
import {
  getOtherShoreSuppression,
  getOtherShoreTravelRule,
} from '../../model/otherShoreRules.js';
import {
  anchorOtherShoreStar,
  calculateOtherShoreTravel,
  contributeOtherShoreExploration,
  createOtherShoreWorld,
  getOtherShoreHexDistance,
  observeOtherShoreStars,
  otherShoreCoordinateId,
  serializeOtherShoreWorld,
  visitOtherShoreStar,
} from '../../model/otherShoreWorld.js';
import {
  deliverOtherShorePlayerMutation,
  deliverOtherShorePlayerMutations,
  ensureOtherShoreWorldState,
  updateOtherShoreWorldState,
} from '../../model/otherShoreState.js';
import {
  createCanglanWebLink,
  registerCanglanWebController,
} from '../../model/endlessWebServer.js';
import { inspectPlayerAction } from '../../model/playerActionState.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const OTHER_SHORE_PLANE_ID = 3.8;
const OTHER_SHORE_ORIGIN_PLANE_ID = 3.5;
const WORLD_SEED = 'canglan-prime-v1';
const ACTION_RECEIPT_LIMIT = 24;
const PLAYER_MUTATION_FIELDS = Object.freeze([
  'other_shore',
  '心神',
  '心神恢复时间',
  '问仙令',
  '彼岸心神余程',
  '彼岸心神余程境界',
]);

const PHASE_STATUS = Object.freeze({
  unobserved: 'unseen',
  sensed: 'observed',
  visited: 'explored',
  anchored: 'anchored',
  cleared: 'anchored',
});

const STAR_META = Object.freeze({
  origin: ['诸界交汇', '先秦远征遗脉'],
  gate: ['界潮', '彼岸古文明'],
  abyss: ['归墟', '寂灭生态'],
  tomb: ['纪元葬灭', '失落王庭'],
  archive: ['古史', '纪元碑灵'],
  anchor: ['维度锚定', '裂界维护者'],
  harbor: ['星路', '先秦炼气士'],
  ruin: ['残缺大道', '遗迹生灵'],
  forge: ['太初真火', '铸星文明'],
  palace: ['帝道残痕', '帝落遗民'],
  observatory: ['超维观测', '纪元主宰眷属'],
  citadel: ['禁宝律令', '古文明禁宝司'],
  life: ['生机', '星海灵族'],
  tide: ['界潮', '潮汐生灵'],
  rift: ['裂界', '域外修士'],
  civilization: ['文明薪火', '古星城邦'],
  dead: ['寂灭', '灾厄变异体'],
});

function createCanglanWorld() {
  return observeOtherShoreStars(createOtherShoreWorld(WORLD_SEED), '0,0', 1);
}

function replaceDocument(document, next) {
  for (const key of Object.keys(document)) delete document[key];
  Object.assign(document, next);
}

function currentSession(player) {
  return player?.in_other_shore === true
    && Number(player?.power_place) === OTHER_SHORE_PLANE_ID
    && player?.other_shore?.worldId === WORLD_SEED
    ? player.other_shore
    : null;
}

function parseCoordinate(input) {
  const match = String(input || '').match(/(-?\d+)\s*[,，]\s*(-?\d+)/);
  if (!match) return null;
  return otherShoreCoordinateId(Number(match[1]), Number(match[2]));
}

function cubeRound(q, r) {
  let x = Math.round(q);
  let z = Math.round(r);
  let y = Math.round(-q - r);
  const xDiff = Math.abs(x - q);
  const yDiff = Math.abs(y + q + r);
  const zDiff = Math.abs(z - r);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff > zDiff) y = -x - z;
  else z = -x - y;
  return { q: x, r: z };
}

function straightPath(world, fromId, toId) {
  const byId = new Map(world.stars.map(star => [star.id, star]));
  const from = byId.get(fromId);
  const to = byId.get(toId);
  if (!from || !to) throw new Error('目标大星不在当前沧澜星图内');
  const distance = getOtherShoreHexDistance(from, to);
  const path = [];
  for (let step = 0; step <= distance; step++) {
    const ratio = distance === 0 ? 0 : step / distance;
    const point = cubeRound(
      from.q + (to.q - from.q) * ratio,
      from.r + (to.r - from.r) * ratio,
    );
    const id = otherShoreCoordinateId(point);
    if (byId.has(id) && path.at(-1) !== id) path.push(id);
  }
  return path;
}

function strongestRealmName(player) {
  return getOtherShoreTravelRule(player).name;
}

function publicStar(star) {
  const [law = '未解析', civilization = '未解析'] = STAR_META[star.kind] || [];
  return {
    id: star.id,
    q: star.q,
    r: star.r,
    status: PHASE_STATUS[star.phase] || 'unseen',
    name: star.name,
    kind: star.kind,
    law,
    civilization,
    threat: star.risk,
    signal: star.description,
    description: star.description,
    contribution: Math.max(0, Number(star.contribution) || 0),
    anchorRequirement: Math.max(0, Number(star.anchorRequirement) || 0),
    keyStar: star.keyStar === true,
  };
}

function explorationEcho(star, contribution) {
  const echoes = {
    citadel: '禁宝司残存律令苏醒，持有先天至宝的因果正在被重新标记。',
    observatory: '超维观测阵列短暂转向，纪元主宰的眸光掠过这片星域。',
    anchor: '母锚深处传来与灵界裂缝同源的震颤，古航路正在复苏。',
    harbor: '函谷旧印与先秦炼气士的远征星图彼此重合。',
    rift: '裂界彼端有灾厄变异体投来与你同源的气息。',
  };
  return echoes[star.kind]
    || `第${contribution}重星域道痕归入全服星图，远方仍有法则回响。`;
}

function findActionReceipt(session, operationId, action, targetId) {
  if (!operationId) return null;
  const receipt = session.actionReceipts?.[operationId];
  if (!receipt) return null;
  if (receipt.action !== action || receipt.targetId !== targetId) {
    throw new Error('操作标识已经用于另一项星海动作');
  }
  return receipt;
}

function rememberActionReceipt(session, operationId, action, targetId, message) {
  if (!operationId) return;
  session.actionReceipts ||= {};
  session.actionReceipts[operationId] = {
    action,
    targetId,
    message,
    at: Date.now(),
  };
  const stale = Object.entries(session.actionReceipts)
    .sort((left, right) => Number(right[1]?.at || 0) - Number(left[1]?.at || 0))
    .slice(ACTION_RECEIPT_LIMIT);
  for (const [id] of stale) delete session.actionReceipts[id];
}

function playerMutationKey(userId, runId, action, targetId) {
  return [userId, runId, action, targetId].join(':');
}

function createPlayerMutationPatch(player) {
  return Object.fromEntries(PLAYER_MUTATION_FIELDS
    .filter(field => Object.hasOwn(player, field))
    .map(field => [field, structuredClone(player[field])]));
}

function applyPlayerMutationPatch(player, patch) {
  for (const field of PLAYER_MUTATION_FIELDS) {
    if (Object.hasOwn(patch || {}, field)) player[field] = structuredClone(patch[field]);
  }
}

async function deliverPendingPlayerMutations(userId, player) {
  const session = currentSession(player);
  if (!session) return [];
  const prefix = `${userId}:${session.runId}:`;
  return deliverOtherShorePlayerMutations(
    globalThis.redis,
    createCanglanWorld,
    key => key.startsWith(prefix),
    async pending => {
      if (pending.userId !== userId || pending.runId !== session.runId) {
        throw new Error('彼岸玩家变更回执身份不匹配');
      }
      applyPlayerMutationPatch(player, pending.playerPatch);
      await Write_player(userId, player);
    },
  );
}

async function playerIdFromEvent(e) {
  return channel(String(e.user_id || '').replace('qg_', ''));
}

export class OtherShoreWorld extends plugin {
  constructor() {
    super({
      name: 'OtherShoreWorld',
      dsc: '彼岸世界·沧澜界全服星图',
      event: 'message',
      priority: 1,
      rule: [
        { reg: '^#(?:柠檬堂.*|冲水堂.*|无尽商店.*|势力商店.*|.*商店.*|.*商城.*|无尽购买\\s+.+|选购.*|购买.*|.*兑换.*|向NPC购买.*|上架.*|下架.*)$', fnc: 'guardExternalCommerce' },
        { reg: '^#(?:服用.+|一键回血)$', fnc: 'guardExternalHealing' },
        { reg: '^#(?:穿梭.*|接引.*|送往.*|同意接引|遨游时间长河|轮回|登仙|证道|轰击成仙路)$', fnc: 'guardOtherShoreTransit' },
        { reg: '^#进入彼岸世界$', fnc: 'enterOtherShore' },
        { reg: '^#(?:离开|退出)彼岸世界$', fnc: 'leaveOtherShore' },
        { reg: '^#(?:彼岸世界|沧澜星图|彼岸状态)$', fnc: 'showOtherShore' },
        { reg: '^#(?:彼岸网页|沧澜网页)$', fnc: 'openOtherShoreWeb' },
        { reg: '^#观测大星(?:\\s+-?\\d+\\s*[,，]\\s*-?\\d+)?$', fnc: 'observeStar' },
        { reg: '^#(?:远征|前往大星)\\s+-?\\d+\\s*[,，]\\s*-?\\d+$', fnc: 'moveStar' },
        { reg: '^#探索大星$', fnc: 'exploreStar' },
        { reg: '^#锚定大星$', fnc: 'anchorStar' },
      ],
    });
    registerCanglanWebController(this);
  }

  async requirePlayer(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) {
      await e.reply('彼岸星图中尚无你的命火，请先发送 #踏入仙途。');
      return null;
    }
    return { userId, player: await Read_player(userId) };
  }

  async requireResident(e) {
    const result = await this.requirePlayer(e);
    if (!result) return null;
    if (!currentSession(result.player)) {
      await e.reply('你尚未进入彼岸世界。身处太初星墟并持有完整【裂界残忆】后，可发送 #进入彼岸世界。');
      return null;
    }
    return result;
  }

  async world() {
    return ensureOtherShoreWorldState(globalThis.redis, createCanglanWorld);
  }

  async refreshedPlayer(userId) {
    return withPlayerMutationLock(userId, async () => {
      const source = await Read_player(userId);
      const player = structuredClone(source);
      await deliverPendingPlayerMutations(userId, player);
      const status = refreshSpiritHeart(player);
      if (status.recovered > 0 || !Number.isFinite(Number(source.心神))) {
        await Write_player(userId, player);
      }
      return player;
    });
  }

  async guardExternalCommerce(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) return false;
    const player = await Read_player(userId);
    if (!currentSession(player)) return false;
    await e.reply('【彼岸界律】诸天商路在此失去坐标，外界商店与交易行均未响应。');
    return true;
  }

  async guardExternalHealing(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) return false;
    const player = await Read_player(userId);
    if (!currentSession(player)) return false;
    if (String(e.msg || '').trim() === '#一键回血') {
      await e.reply('【彼岸界律】此界不承认外来疗伤丹药的药理，丹力在入体前便已消散。');
      return true;
    }
    const name = String(e.msg || '').replace(/^#服用/, '').split('*')[0].trim();
    const item = name ? await foundthing(name) : null;
    if (item?.class !== '丹药' || (item.type !== '血量' && Number(item.HP) <= 0 && Number(item.HPp) <= 0)) return false;
    await e.reply('【彼岸界律】此界不承认外来疗伤丹药的药理，丹力在入体前便已消散。');
    return true;
  }

  async guardOtherShoreTransit(e) {
    const userId = await playerIdFromEvent(e);
    if (!await existplayer(userId)) return false;
    const player = await Read_player(userId);
    if (!currentSession(player)) return false;
    await e.reply('【彼岸界律】常规位面通道无法在此锚定，请在稳定星锚处发送 #离开彼岸世界。');
    return true;
  }

  async enterOtherShore(e) {
    const result = await this.requirePlayer(e);
    if (!result) return true;
    const { userId } = result;
    const outcome = await withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (currentSession(player)) return { message: '你已经身处沧澜界，发送 #沧澜星图 可继续远征。' };
      if (Number(player.power_place) !== OTHER_SHORE_ORIGIN_PLANE_ID) {
        return { message: '裂界坐标只会在太初星墟显化，你需先抵达太初星墟。' };
      }
      if (!normalizeRiftMemoryState(player.彼岸残忆).unlocked) {
        return { message: '你尚未掌握完整【裂界残忆】，灾厄魔主的残魂中或许藏着彼岸坐标。' };
      }
      const action = inspectPlayerAction(await globalThis.redis.get(`xiuxian:player:${userId}:action`));
      if (action.active) return { message: `你正在进行【${action.action?.action || '其他行动'}】，此刻难以穿过裂界。` };
      const world = await this.world();
      refreshSpiritHeart(player);
      const rule = getOtherShoreTravelRule(player);
      const storedTier = String(player.彼岸心神余程境界 || '');
      const recordedPositionId = String(player.彼岸远征记录?.lastPositionId || '');
      const recordedPhase = world.states?.[recordedPositionId]?.phase;
      const positionId = ['anchored', 'cleared'].includes(recordedPhase)
        ? recordedPositionId
        : '0,0';
      player.other_shore = {
        version: 1,
        worldId: WORLD_SEED,
        runId: randomUUID(),
        positionId,
        enteredAt: Date.now(),
        mindRemainder: storedTier === rule.tier ? Math.max(0, Number(player.彼岸心神余程) || 0) : 0,
        mindTier: rule.tier,
        pressure: 0,
      };
      player.in_other_shore = true;
      player.power_place = OTHER_SHORE_PLANE_ID;
      await Write_player(userId, player);
      const suppression = getOtherShoreSuppression(player);
      return {
        message: [
          '【裂界彼岸·沧澜祖星】',
          '六十一颗大星在黑暗中同时点燃，全服沧澜星图已与你的神念相接。',
          suppression.immune
            ? '你的道路自成一体，彼岸界律未能压制你的战力。'
            : '异界法则覆压道果：全属性与功法数值效果按70%结算。',
          `当前心神：${player.心神}/${getSpiritHeartMax(player)}｜未知星域：${rule.name}`,
          '发送 #彼岸网页 开启交互星图，或发送 #观测大星。',
        ].join('\n'),
      };
    });
    await e.reply(outcome.message);
    return true;
  }

  async leaveOtherShore(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const { userId } = result;
    const outcome = await withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      const session = currentSession(player);
      if (!session) return { message: '彼岸会话已经消散。' };
      const world = await this.world();
      const phase = world.states?.[session.positionId]?.phase;
      if (!['anchored', 'cleared'].includes(phase)) {
        return { message: '当前大星尚未锚定，裂界回路无法闭合。请沿星路返回已锚定大星后再离开。' };
      }
      player.彼岸心神余程 = Math.max(0, Number(session.mindRemainder) || 0);
      player.彼岸心神余程境界 = String(session.mindTier || '');
      player.彼岸远征记录 ||= {};
      player.彼岸远征记录.lastPositionId = session.positionId;
      player.彼岸远征记录.lastLeftAt = Date.now();
      player.in_other_shore = false;
      player.power_place = OTHER_SHORE_ORIGIN_PLANE_ID;
      delete player.other_shore;
      await Write_player(userId, player);
      return { message: '裂界在身后合拢，你已携沧澜星图回到太初星墟。' };
    });
    await e.reply(outcome.message);
    return true;
  }

  async getWebState({ userId, runId = '' }) {
    const player = await this.refreshedPlayer(String(userId));
    const session = currentSession(player);
    if (!session) throw new Error('你已离开彼岸世界，请重新进入后领取星图入口');
    if (runId && session.runId !== runId) {
      throw new Error('本次彼岸远征已更替，请重新领取星图入口');
    }
    const world = await this.world();
    const serialized = serializeOtherShoreWorld(world);
    const travel = getOtherShoreTravelRule(player);
    const suppression = getOtherShoreSuppression(player);
    const observed = serialized.stars.filter(star => star.discovered).length;
    const known = serialized.stars.filter(star => star.visited).length;
    return {
      version: 1,
      worldId: WORLD_SEED,
      player: {
        name: player.名号 || '无名修士',
        realm: strongestRealmName(player),
        travelTier: travel.tier,
        mind: Math.max(0, Number(player.心神) || 0),
        maxMind: getSpiritHeartMax(player),
        mindRemainder: Math.max(0, Number(session.mindRemainder) || 0),
        positionId: session.positionId,
        suppressionImmune: suppression.immune,
      },
      pressure: Math.max(0, Number(session.pressure) || 0),
      progress: { observed, known, total: serialized.stars.length },
      nodes: serialized.stars.map(star => ({
        ...publicStar(star),
        viewerContributed: Number(star.contributors?.[String(userId)] || 0) >= 1,
      })),
    };
  }

  async performWebAction({ userId, runId = '', action, targetId, operationId }) {
    const result = await this.performAction(
      String(userId),
      String(action),
      String(targetId),
      String(operationId || ''),
      String(runId || ''),
    );
    return { ok: true, message: result.message };
  }

  async performAction(userId, action, targetId, operationId = '', expectedRunId = '') {
    const allowed = new Set(['observe', 'move', 'explore', 'anchor']);
    if (!allowed.has(action)) throw new Error('未知的沧澜星海动作');
    return withPlayerMutationLock(userId, async () => {
      let player = await Read_player(userId);
      let session = currentSession(player);
      if (!session) throw new Error('你尚未进入彼岸世界');
      if (expectedRunId && session.runId !== expectedRunId) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const mutationKey = playerMutationKey(
        userId,
        session.runId,
        action,
        targetId,
      );
      const recovered = await deliverPendingPlayerMutations(userId, player);
      player = await Read_player(userId);
      session = currentSession(player);
      if (!session || (expectedRunId && session.runId !== expectedRunId)) {
        throw new Error('本次彼岸远征已更替，请重新领取星图入口');
      }
      const recoveredCurrent = recovered.find(item => item.key === mutationKey);
      if (recoveredCurrent) {
        return { message: recoveredCurrent.message, replayed: true, recovered: true };
      }
      const receipt = findActionReceipt(session, operationId, action, targetId);
      if (receipt) return { message: receipt.message, replayed: true };
      const travelRule = getOtherShoreTravelRule(player);
      if (session.mindTier !== travelRule.tier) {
        session.mindTier = travelRule.tier;
        session.mindRemainder = 0;
      }

      const updated = await updateOtherShoreWorldState(
        globalThis.redis,
        createCanglanWorld,
        async world => {
          const star = world.stars.find(item => item.id === targetId);
          if (!star) throw new Error('目标大星不在当前沧澜星图内');
          let next = world;
          let message = '';

          if (action === 'observe') {
            if (getOtherShoreHexDistance(session.positionId, targetId) > 1) {
              throw new Error('神念只能观测当前大星相邻的星域');
            }
            if (world.states[targetId].phase !== 'unobserved') throw new Error('此星已经完成初步观测');
            next = observeOtherShoreStars(world, session.positionId, 1);
            message = `神念捕获【${star.name}】的法则星辉，相邻迷雾已同步至全服星图。`;
          }

          if (action === 'move') {
            if (targetId === session.positionId) throw new Error('你已经身处这颗大星');
            const path = straightPath(world, session.positionId, targetId);
            const travel = calculateOtherShoreTravel(world, path, player, session.mindRemainder);
            const heart = consumeSpiritHeart(player, travel.cost);
            if (!heart.ok) throw new Error(`心神不足：需要${travel.cost}点，当前${heart.current}/${heart.max}`);
            for (let index = 1; index < path.length; index++) {
              next = observeOtherShoreStars(next, path[index - 1], 1);
              next = visitOtherShoreStar(next, path[index]);
            }
            session.positionId = targetId;
            session.mindRemainder = travel.remainder;
            session.pressure = Math.min(100, Math.max(0, Number(session.pressure) || 0) + travel.unanchoredSteps * 3);
            player.彼岸心神余程 = travel.remainder;
            player.彼岸心神余程境界 = travel.tier;
            message = `横渡${travel.totalSteps}格抵达【${star.name}】，其中${travel.unanchoredSteps}格未锚定，消耗心神${travel.cost}点。`;
          }

          if (action === 'explore') {
            if (targetId !== session.positionId) throw new Error('需先抵达目标大星');
            const state = world.states[targetId];
            if (['anchored', 'cleared'].includes(state.phase)) throw new Error('此星已经建立稳定道标');
            if (Number(state.contribution || 0) >= star.anchorRequirement) {
              throw new Error('此星探索贡献已经充足，可尝试建立星锚');
            }
            if (Number(state.contributors?.[userId] || 0) >= 1) {
              throw new Error('你已完成此星的个人探索，其余道痕需由其他修士补全');
            }
            if (state.phase === 'unobserved') next = observeOtherShoreStars(next, targetId, 0);
            if (next.states[targetId].phase === 'sensed') next = visitOtherShoreStar(next, targetId);
            next = contributeOtherShoreExploration(next, targetId, userId, 1);
            const progress = next.states[targetId].contribution;
            session.pressure = Math.min(100, Math.max(0, Number(session.pressure) || 0) + Math.max(1, star.risk));
            message = [
              `【${star.name}·探索推进】全服道痕 ${progress}/${star.anchorRequirement}`,
              explorationEcho(star, progress),
              progress >= star.anchorRequirement ? '星辰核心已经显露，可建立星锚。' : '仍需继续探索或等待其他修士驰援。',
            ].join('\n');
          }

          if (action === 'anchor') {
            if (targetId !== session.positionId) throw new Error('需先抵达目标大星');
            if (['anchored', 'cleared'].includes(world.states[targetId].phase)) {
              throw new Error('此星已经建立稳定道标，无需重复锚定');
            }
            next = anchorOtherShoreStar(world, targetId);
            session.pressure = Math.max(0, Math.max(0, Number(session.pressure) || 0) - 8);
            message = `【${star.name}·全服星锚】航路已经稳定，所有后来者经过此星不再消耗心神。`;
          }

          rememberActionReceipt(session, operationId, action, targetId, message);
          player.other_shore = session;
          const pending = {
            ...(next.pendingPlayerMutations || {}),
            [mutationKey]: {
              id: randomUUID(),
              userId,
              runId: session.runId,
              action,
              targetId,
              message,
              playerPatch: createPlayerMutationPatch(player),
              createdAt: Date.now(),
            },
          };
          replaceDocument(world, { ...next, pendingPlayerMutations: pending });
          return { message };
        },
      );
      const delivered = await deliverOtherShorePlayerMutation(
        globalThis.redis,
        createCanglanWorld,
        mutationKey,
        async pending => {
          applyPlayerMutationPatch(player, pending.playerPatch);
          await Write_player(userId, player);
        },
      );
      if (!delivered) throw new Error('彼岸玩家变更回执缺失，请重新尝试');
      return updated.value;
    });
  }

  async showOtherShore(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const state = await this.getWebState({ userId: result.userId });
    const current = state.nodes.find(node => node.id === state.player.positionId);
    const anchored = state.nodes.filter(node => node.status === 'anchored').length;
    await e.reply([
      '【彼岸世界·沧澜星图】',
      `所在大星：${current?.name || current?.id}（${current?.id}）`,
      `全服探明：${state.progress.known}/${state.progress.total}｜稳定星锚：${anchored}`,
      `心神：${state.player.mind}/${state.player.maxMind}｜余程：${state.player.mindRemainder}｜界压：${state.pressure}`, 
      state.player.suppressionImmune ? '界律：自身体系完整，免疫30%压制' : '界律：全属性与功法数值效果压制30%',
      '星海动作：#观测大星｜#远征 q,r｜#探索大星｜#锚定大星｜#彼岸网页',
    ].join('\n'));
    return true;
  }

  async openOtherShoreWeb(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const link = await createCanglanWebLink(this, {
        userId: result.userId,
        runId: currentSession(result.player).runId,
        displayName: result.player.名号 || '无名修士',
      });
      const message = `【沧澜界·全服星图】\n${link}\n入口两分钟内有效，进入后可持续使用两小时。`;
      if (!e.isGroup) {
        await e.reply(message);
        return true;
      }
      const friend = e.bot?.pickFriend?.(e.user_id);
      if (!friend?.sendMsg) throw new Error('当前适配器未开放私聊投递');
      await friend.sendMsg(message);
      await e.reply('沧澜星图入口已通过私聊送达，请在两分钟内开启。');
    } catch (error) {
      await e.reply(`沧澜星图入口生成失败：${error.message}`);
    }
    return true;
  }

  async observeStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const world = await this.world();
    const session = currentSession(result.player);
    let targetId = parseCoordinate(e.msg);
    if (!targetId) {
      targetId = world.stars.find(star =>
        world.states[star.id].phase === 'unobserved'
        && getOtherShoreHexDistance(session.positionId, star.id) === 1
      )?.id;
    }
    if (!targetId) {
      await e.reply('当前相邻大星均已完成初步观测。');
      return true;
    }
    try {
      const action = await this.performAction(result.userId, 'observe', targetId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async moveStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    const targetId = parseCoordinate(e.msg);
    try {
      const action = await this.performAction(result.userId, 'move', targetId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async exploreStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const action = await this.performAction(result.userId, 'explore', currentSession(result.player).positionId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }

  async anchorStar(e) {
    const result = await this.requireResident(e);
    if (!result) return true;
    try {
      const action = await this.performAction(result.userId, 'anchor', currentSession(result.player).positionId);
      await e.reply(action.message);
    } catch (error) {
      await e.reply(error.message);
    }
    return true;
  }
}

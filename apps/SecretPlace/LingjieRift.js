import { plugin, common, config, data } from '../../api/api.js';
import {
  Add_najie_thing,
  Add_源石,
  Read_player,
  Write_player,
  channel,
  exist_najie_thing,
  existplayer,
  foundthing,
  zd_battle,
} from '../../model/xiuxian.js';
import {
  RIFT_ANCHOR_DROP_CHANCE,
  RIFT_ANCHOR_ITEM,
  RIFT_POTENTIAL_PILLS,
  RIFT_SPAWN_CHANCE,
  RIFT_XIUWEI_PILLS,
  RIFT_XUEQI_PILLS,
  canStartRiftExplore,
  calculateRiftExploreDuration,
  createLevelThirtyNpc,
  createRift,
  createRiftMonster,
  getEffectiveRiftEndTime,
  getRiftBaseAttempts,
  isRiftMilestone,
  parseMortalCoordinate,
  pickAffordableForgeMaterial,
  pickRandom,
  randomInt,
  rollCorpseExtras,
  rollRiftAftermath,
  resolveRiftRewardBonus,
} from '../../model/lingjieRift.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  awardDungeonGongfaProficiency,
  formatGongfaProficiency,
} from '../../model/gongfaProficiency.js';
import { adjustDaoHeart } from '../../model/daoHeart.js';
import { recordMemoryDungeon } from '../../model/memoryPath.js';
import { addMemoryLootBonus } from '../../model/suiyunLoot.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { getMinggeEffects, getMinggeSecretPlaceReductionMs } from '../../model/mingge.js';
import {
  getLocationByCoord,
  getPlaneLocations,
  getPlayerPlaneName,
  setPlayerPlaneCoordinate,
} from '../../model/planeCoords.js';

const RIFT_KEY = 'xiuxian:lingjie_rift:active';
const EXPLORE_PREFIX = 'xiuxian:lingjie_rift:explore:';
const VISIT_PREFIX = 'xiuxian:lingjie_rift:done:';
const EXTRA_VISIT_PREFIX = 'xiuxian:lingjie_rift:extra:';
const MILESTONE_PREFIX = 'xiuxian:lingjie_rift:milestone:';
const NPC_NAMES = ['陆沉', '顾玄', '姜离', '秦烬', '宁无尘', '谢长庚'];

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
}

function battleExcerpt(messages) {
  if (!Array.isArray(messages)) return [];
  if (messages.length <= 12) return messages;
  return [...messages.slice(0, 3), '……战斗过程过长，仅展示末段……', ...messages.slice(-8)];
}

function riftSpawnMessage(rift) {
  return [
    '【凡间异变·灵界裂缝现世】',
    '凡间天穹传来一声闷响，一道通往灵界的裂缝撕开界壁！',
    `裂缝坐标：${rift.x},${rift.y}`,
    '裂缝将在6小时后自动坍塌。',
    `此道裂缝可为每位修士凝聚${getRiftBaseAttempts(rift)}重界印，每重界印可往返一次。`,
    '仅紫府元神及以上修士可入。',
    `发送 #前往${rift.x},${rift.y} 抵达，再发送 #探索灵界裂缝。`,
    `界印耗尽后，可使用【${RIFT_ANCHOR_ITEM}】重新锚定一次。`,
  ].join('\n');
}

export class LingjieRift extends plugin {
  constructor() {
    super({
      name: 'LingjieRift',
      dsc: '凡间限时副本·灵界裂缝',
      event: 'message',
      priority: 100,
      rule: [
        { reg: '^#开启灵界裂缝$', fnc: 'openRift' },
        { reg: '^#灵界裂缝$', fnc: 'riftStatus' },
        { reg: '^#使用界隙锚符$', fnc: 'useRiftAnchor' },
        { reg: '^#前往\\s*\\d{1,3}\\s*[,，]\\s*\\d{1,3}$', fnc: 'goToCoordinate' },
        { reg: '^#探索(?:灵界裂缝|\\s*\\d{1,3}\\s*[,，]\\s*\\d{1,3})$', fnc: 'exploreRift' },
      ],
    });

    this.task = [{
      cron: '*/20 * * * * *',
      name: 'LingjieRiftTask',
      fnc: () => this.tick(),
    }];
    this.ticking = false;
  }

  async getPlayer(e) {
    let qq = e.user_id.toString().replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return { error: '凡界众生册中尚无你的名字，请先发送 #踏入仙途。' };
    return { qq, player: await Read_player(qq) };
  }

  async readRift() {
    const raw = await redis.get(RIFT_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  riftStateTtl(rift) {
    return Math.max(3600, Math.ceil((Number(rift?.expiresAt) - Date.now()) / 1000) + 3600);
  }

  async getAttemptState(rift, qq) {
    const suffix = `${rift.id}:${qq}`;
    const [usedRaw, extraRaw] = await Promise.all([
      redis.get(`${VISIT_PREFIX}${suffix}`),
      redis.get(`${EXTRA_VISIT_PREFIX}${suffix}`),
    ]);
    const base = getRiftBaseAttempts(rift);
    const used = Math.max(0, Number(usedRaw) || 0);
    const extra = Math.max(0, Number(extraRaw) || 0);
    const total = base + extra;
    return { base, used, extra, total, remaining: Math.max(0, total - used) };
  }

  async recordAttempt(rift, qq) {
    const key = `${VISIT_PREFIX}${rift.id}:${qq}`;
    await redis.incr(key);
    await redis.expire(key, this.riftStateTtl(rift));
    return this.getAttemptState(rift, qq);
  }

  async openRift(e) {
    const setting = config.getConfig('xiuxian', 'xiuxian') || {};
    const userQQ = String(e.user_id).replace('qg_', '');
    const masterList = (setting.Master || []).map(String);
    if (!e.isMaster && !masterList.includes(userQQ)) {
      return e.reply('你没有权限开启灵界裂缝。');
    }

    const active = await this.readRift();
    if (active && Number(active.expiresAt) > Date.now()) {
      return e.reply([
        '灵界裂缝已经开启，无需重复开启。',
        `当前坐标：${active.x},${active.y}`,
        `距离坍塌：${formatDuration(active.expiresAt - Date.now())}`,
      ].join('\n'));
    }

    const rift = createRift(setting.Era?.current || {});
    await redis.set(RIFT_KEY, JSON.stringify(rift));
    await this.broadcast(riftSpawnMessage(rift));
    return e.reply(`已开启灵界裂缝，坐标：${rift.x},${rift.y}；每位修士基础可探索${getRiftBaseAttempts(rift)}次，6小时后整体坍塌。`);
  }

  async activeAction(qq) {
    const raw = await redis.get(`xiuxian:player:${qq}:action`);
    if (!raw) return null;
    try {
      const action = JSON.parse(raw);
      return Number(action.end_time) > Date.now() ? action : null;
    } catch {
      return null;
    }
  }

  async riftStatus(e) {
    const rift = await this.readRift();
    if (!rift || rift.expiresAt <= Date.now()) {
      return e.reply('【灵界裂缝】\n当前凡间没有现世的灵界裂缝。每逢两千年，界壁皆有概率松动。');
    }
    const lines = [
      '【灵界裂缝·现世】',
      `凡间坐标：${rift.x},${rift.y}`,
      `距离坍塌：${formatDuration(rift.expiresAt - Date.now())}`,
      `基础界印：每位修士${getRiftBaseAttempts(rift)}重`,
      '准入：紫府元神及以上',
      `前往：#前往${rift.x},${rift.y}`,
      '抵达后发送：#探索灵界裂缝',
      '基础探索耗时：15分钟，可受秘境加速影响',
      `追加次数：#使用${RIFT_ANCHOR_ITEM}`,
    ];
    let qq = String(e.user_id).replace('qg_', '');
    qq = await channel(qq);
    if (await existplayer(qq)) {
      const attempts = await this.getAttemptState(rift, qq);
      lines.push(`你的界印：已探索${attempts.used}/${attempts.total}次，剩余${attempts.remaining}次`);
    }
    return e.reply(lines.join('\n'));
  }

  async useRiftAnchor(e) {
    const result = await this.getPlayer(e);
    if (result.error) return e.reply(result.error);
    const { qq } = result;
    const rift = await this.readRift();
    if (!rift || Number(rift.expiresAt) <= Date.now()) {
      return e.reply('当前没有可供锚定的灵界裂缝，界隙锚符无法与虚空共鸣。');
    }
    if (Number(await exist_najie_thing(qq, RIFT_ANCHOR_ITEM, '道具')) < 1) {
      return e.reply(`你的纳戒中没有【${RIFT_ANCHOR_ITEM}】。`);
    }

    await Add_najie_thing(qq, RIFT_ANCHOR_ITEM, '道具', -1);
    const key = `${EXTRA_VISIT_PREFIX}${rift.id}:${qq}`;
    await redis.incr(key);
    await redis.expire(key, this.riftStateTtl(rift));
    const attempts = await this.getAttemptState(rift, qq);
    return e.reply([
      '【界隙锚定】',
      '你将锚符钉入虚空，游离的界壁碎光重新凝成一重界印。',
      '当前灵界裂缝个人探索上限 +1',
      `已探索：${attempts.used}/${attempts.total}次，剩余${attempts.remaining}次`,
    ].join('\n'));
  }

  async goToCoordinate(e) {
    const coordinate = parseMortalCoordinate(e.msg);
    if (!coordinate) return e.reply('位面坐标范围为 0,0 至 999,999。');
    const result = await this.getPlayer(e);
    if (result.error) return e.reply(result.error);
    const { qq, player } = result;
    const planeName = getPlayerPlaneName(player);
    if (!planeName || getPlaneLocations(planeName).length === 0) {
      return e.reply(`${planeName || '当前位面'}超脱固定坐标之外，无法使用 #前往x,y。`);
    }

    const action = await this.activeAction(qq);
    if (action) return e.reply(`你正在进行【${action.action || '未知行动'}】，暂时无法移动。`);

    setPlayerPlaneCoordinate(player, coordinate, planeName);
    await Write_player(qq, player);
    const rift = await this.readRift();
    const arrived = planeName === '凡间' && rift && rift.expiresAt > Date.now() &&
      rift.x === coordinate.x && rift.y === coordinate.y;
    const location = getLocationByCoord(planeName, coordinate.x, coordinate.y);
    const place = location.chain.map(item => item.name).join(' · ') || '无名荒野';
    return e.reply([
      `你已抵达${planeName}坐标 ${coordinate.x},${coordinate.y}。`,
      `所在区域：${place}`,
      arrived ? '前方界壁扭曲，灵界裂缝近在咫尺。发送 #探索灵界裂缝 开始探索。' : '',
    ].filter(Boolean).join('\n'));
  }

  async exploreRift(e) {
    const result = await this.getPlayer(e);
    if (result.error) return e.reply(result.error);
    const { qq } = result;
    return withPlayerMutationLock(qq, async () => {
    const player = await Read_player(qq);
    const rift = await this.readRift();
    const requestedCoordinate = e.msg === '#探索灵界裂缝'
      ? null
      : parseMortalCoordinate(e.msg);
    if (requestedCoordinate && rift && (
      requestedCoordinate.x !== Number(rift.x) ||
      requestedCoordinate.y !== Number(rift.y)
    )) {
      return e.reply(`该坐标并非裂缝所在之处，请探索 ${rift.x},${rift.y}。`);
    }
    const minggeEffects = getMinggeEffects(player, data.minggeList);
    const timing = calculateRiftExploreDuration(
      player,
      getMinggeSecretPlaceReductionMs(minggeEffects)
    );
    const check = canStartRiftExplore(player, rift, Date.now(), timing.durationMs);
    const failures = {
      collapsed: '灵界裂缝尚未现世，或已经坍塌。',
      yuanshen: '裂缝中的界域乱流会撕碎神魂，至少需要紫府元神才能探索。',
      plane: '你必须身处凡间才能探索灵界裂缝。',
      coordinate: rift ? `你尚未抵达裂缝坐标，请先发送 #前往${rift.x},${rift.y}。` : '你尚未抵达裂缝坐标。',
      time: `裂缝剩余时间不足${formatDuration(timing.durationMs)}，已经来不及完成本次探索。`,
    };
    if (!check.ok) return e.reply(failures[check.reason]);

    const taskKey = `${EXPLORE_PREFIX}${qq}`;
    if (await redis.get(taskKey)) return e.reply('你已经在探索灵界裂缝，静候界内动静即可。');
    const attempts = await this.getAttemptState(rift, qq);
    if (attempts.remaining <= 0) {
      return e.reply([
        '【个人界印已崩解】',
        `你已完成${attempts.used}/${attempts.total}次探索，这道裂缝不再承认你的气息。`,
        `使用【${RIFT_ANCHOR_ITEM}】后可重新锚定一次：#使用${RIFT_ANCHOR_ITEM}`,
      ].join('\n'));
    }

    const action = await this.activeAction(qq);
    if (action) return e.reply(`你正在进行【${action.action || '未知行动'}】，无法分心探索裂缝。`);

    const now = Date.now();
    const task = {
      taskId: `rift:${rift.id}:${qq}:${now}:${attempts.used + 1}`,
      memoryEntryRecorded: false,
      qq,
      playerName: player.名号,
      groupId: e.group_id || null,
      rift,
      start_time: now,
      end_time: now + timing.durationMs,
      attemptNumber: attempts.used + 1,
      attemptLimit: attempts.total,
    };
    const playerAction = {
      action: '探索灵界裂缝',
      start_time: task.start_time,
      end_time: task.end_time,
      time: timing.durationMs,
      Place_action: '0',
      Place_actionplus: '1',
      riftId: rift.id,
    };
    try {
      await redis.multi()
        .set(taskKey, JSON.stringify(task), { EX: 24 * 60 * 60 })
        .set(`xiuxian:player:${qq}:action`, JSON.stringify(playerAction))
        .exec();
    } catch (error) {
      await redis.del(taskKey);
      await this.clearRiftAction(task);
      throw error;
    }

    return e.reply([
      '【灵界裂缝·开始探索】',
      `${player.名号}以紫府元神护住识海，踏入扭曲的界壁。`,
      `界印承载：第${task.attemptNumber}/${task.attemptLimit}次`,
      `探索耗时：${formatDuration(timing.durationMs)}`,
      ...(timing.messages.length ? ['【界行加速】', ...timing.messages] : []),
      `预计完成：${new Date(task.end_time).toLocaleString('zh-CN')}`,
      '探索结束后将自动遭遇裂缝生灵。',
    ].join('\n'));
    });
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      await this.completeExplorations();
      await this.collapseExpiredRift();
      await this.trySpawnRift();
    } catch (error) {
      console.error('[灵界裂缝] 定时任务失败:', error);
    } finally {
      this.ticking = false;
    }
  }

  async trySpawnRift() {
    const setting = config.getConfig('xiuxian', 'xiuxian');
    if (!setting?.Era?.enabled) return;
    const era = setting.Era.current || {};
    if (!isRiftMilestone(era.years)) return;

    const token = `${Number(era.epoch) || 1}:${Number(era.index) || 0}:${Number(era.years)}`;
    const claimed = await redis.set(`${MILESTONE_PREFIX}${token}`, '1', { NX: true });
    if (!claimed) return;
    const active = await this.readRift();
    if (active && active.expiresAt > Date.now()) return;
    if (Math.random() >= RIFT_SPAWN_CHANCE) return;

    const rift = createRift(era);
    await redis.set(RIFT_KEY, JSON.stringify(rift));
    await this.broadcast(riftSpawnMessage(rift));
  }

  async collapseExpiredRift() {
    const rift = await this.readRift();
    if (!rift || rift.expiresAt > Date.now()) return;
    if (await redis.del(RIFT_KEY)) {
      await this.broadcast([
        '【灵界裂缝·坍塌】',
        `凡间坐标 ${rift.x},${rift.y} 处传来震天巨响，灵界裂缝彻底闭合。`,
        '残余的界域气息迅速散尽，只余一片焦黑大地。',
      ].join('\n'));
    }
  }

  async completeExplorations() {
    const keys = await redis.keys(`${EXPLORE_PREFIX}*`);
    for (const key of keys) {
      const raw = await redis.get(key);
      if (!raw) continue;
      let task;
      try {
        task = JSON.parse(raw);
      } catch {
        await redis.del(key);
        continue;
      }
      let effectiveEndTime = Number(task.end_time);
      const actionRaw = await redis.get(`xiuxian:player:${task.qq}:action`);
      if (actionRaw) {
        try {
          effectiveEndTime = getEffectiveRiftEndTime(task, JSON.parse(actionRaw));
        } catch {
          // 行动数据异常时仍按裂缝任务原定时间结算。
        }
      }
      if (Date.now() < effectiveEndTime) continue;
      try {
        await this.completeExploration(task);
        await redis.del(key);
      } catch (error) {
        console.error(`[灵界裂缝] 玩家 ${task.qq} 结算失败:`, error);
      }
    }
  }

  async clearRiftAction(task) {
    const key = `xiuxian:player:${task.qq}:action`;
    const raw = await redis.get(key);
    if (!raw) return;
    try {
      const action = JSON.parse(raw);
      if (action.action === '探索灵界裂缝' && action.riftId === task.rift.id) await redis.del(key);
    } catch {
      // 其他模块可能已接管行动键，不在这里删除。
    }
  }

  async completeExploration(task) {
    return withPlayerMutationLock(String(task.qq), async () => {
    const actionRaw = await redis.get(`xiuxian:player:${task.qq}:action`);
    const action = actionRaw ? JSON.parse(actionRaw) : null;
    if (task.escaped || (action?.escaped && action.riftId === task.rift.id)) return;
    if (task.memoryEntryRecorded === false && (action?.riftId !== task.rift.id
      || action.Place_action != '0' || Number(action.start_time) !== Number(task.start_time))) return;
    const player = await Read_player(task.qq);
    if (!player) return;

    const monster = createRiftMonster();
    const A_player = this.battlePlayer(player);
    const B_player = { ...monster };
    const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_player);
    if (blackEmperorFormation.consumed) await Write_player(task.qq, player);
    const battle = await zd_battle(A_player, B_player);
    player.功法熟练度 = A_player.功法熟练度;
    player.功法熟练度每日 = A_player.功法熟练度每日;
    const proficiencyGains = awardDungeonGongfaProficiency(player);
    player.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(battle.A_hp)) : 1;
    recordMemoryDungeon(player, {
      token: `entry:${task.taskId}`,
      escaped: task.escaped || battle.escaped,
    });
    await Write_player(task.qq, player);

    const lines = [
      '【灵界裂缝·探索完成】',
      `${player.名号}穿过迷雾，在破碎界土中遭遇【${monster.名号}】！`,
      `敌方属性：攻击${monster.攻击.toLocaleString()} / 防御${monster.防御.toLocaleString()} / 血量${monster.血量上限.toLocaleString()}`,
      '',
      ...battleExcerpt(battle.msg),
      ...(blackEmperorFormation.message ? ['', blackEmperorFormation.message] : []),
    ];
    for (const [name, gained] of Object.entries(proficiencyGains)) {
      lines.push(`功法参悟：${formatGongfaProficiency(player, name)}（+${gained}）`);
    }

    if (battle.winner !== 'A') {
      lines.push('', '【探索失败】你被裂缝生灵重创，拼尽全力逃回凡间，当前血量降至1。');
    } else {
      lines.push('', '【探索胜利】裂缝生灵倒下，界土深处的灵光显露。');
      adjustDaoHeart(player, 10, '战胜灵界裂缝天骄');
      player.灵界裂缝通关次数 = (Number(player.灵界裂缝通关次数) || 0) + 1;
      const rewardBonus = resolveRiftRewardBonus(player);
      lines.push(...await this.grantMainRewards(task.qq, rewardBonus, player));
      lines.push(...await this.resolveAftermath(task, player, rewardBonus));
      await Write_player(task.qq, player);
    }

    const attempts = await this.recordAttempt(task.rift, task.qq);
    if (attempts.remaining > 0) {
      lines.push('', '【界印余量】', `已探索${attempts.used}/${attempts.total}次，尚可往返${attempts.remaining}次。`);
    } else {
      lines.push(
        '',
        '【个人界印崩解】',
        '连续穿行耗尽了裂缝对你的界印承载，这道裂缝开始排斥你的气息。',
        `使用【${RIFT_ANCHOR_ITEM}】可重新锚定一次：#使用${RIFT_ANCHOR_ITEM}`
      );
    }
    await this.clearRiftAction(task);
    return this.sendResult(task, lines.join('\n'));
    });
  }

  battlePlayer(player) {
    return {
      ...player,
      当前血量: Math.max(1, Number(player.当前血量) || Number(player.血量上限) || 1),
      血量上限: Math.max(1, Number(player.血量上限) || Number(player.当前血量) || 1),
      灵根: player.灵根 || {},
      学习的功法: player.学习的功法 || [],
      仙宠: player.仙宠 || null,
      神石: player.神石 || {},
    };
  }

  async grantMainRewards(qq, rewardBonus, player) {
    const potential = pickRandom(RIFT_POTENTIAL_PILLS);
    const xiuwei = pickRandom(RIFT_XIUWEI_PILLS);
    const xueqi = pickRandom(RIFT_XUEQI_PILLS);
    const rewards = [
      { name: potential, class: '丹药', count: 1 },
      { name: xiuwei, class: '丹药', count: 1 },
      { name: xueqi, class: '丹药', count: 1 },
    ];
    const daoHeartRoll = Math.random();
    if (daoHeartRoll < 0.08) rewards.push({ name: '玄品道心果', class: '丹药', count: 1, fixedCount: true });
    else if (daoHeartRoll < 0.35) rewards.push({ name: '凡品道心果', class: '丹药', count: 1, fixedCount: true });
    if (Math.random() < 0.25) rewards.push({ name: Math.random() < 0.9 ? '天药' : '九转天药', class: '丹药', count: 1 });
    if (Math.random() < 0.08) rewards.push({ name: '太虚蕴神经', class: '功法', count: 1 });
    if (Math.random() < RIFT_ANCHOR_DROP_CHANCE) {
      rewards.push({ name: RIFT_ANCHOR_ITEM, class: '道具', count: 1, fixedCount: true });
    }

    for (const reward of rewards) {
      if (reward.class !== '功法' && !reward.fixedCount) reward.count *= rewardBonus.multiplier;
      reward.count = addMemoryLootBonus(player, await foundthing(reward.name, { readOnly: true }), reward.count);
      await Add_najie_thing(qq, reward.name, reward.class, reward.count);
    }
    return [
      ...(rewardBonus.messages.length ? ['【机缘加成】', ...rewardBonus.messages] : []),
      '【裂缝奖励】',
      ...rewards.map(item => `${item.name} ×${item.count}`),
    ];
  }

  async resolveAftermath(task, player, rewardBonus) {
    const event = rollRiftAftermath();
    if (event === 'none') return ['', '你收敛气息离开裂缝，归途并无异变。'];
    if (event === 'corpse') return this.grantCorpseLoot(task.qq, rewardBonus, player);

    const level = data.Level_list.find(item => Number(item.level_id) === 30);
    const physique = data.LevelMax_list.find(item => Number(item.level_id) === 30);
    const count = event === 'triple_ambush' ? 3 : 1;
    const names = [...NPC_NAMES].sort(() => Math.random() - 0.5).slice(0, count);
    const enemies = names.map(name => createLevelThirtyNpc(level, physique, `${name}（伏杀者）`));
    const A_player = this.battlePlayer(player);
    const B_team = count === 1 ? { ...enemies[0] } : enemies.map(item => ({ ...item }));
    const blackEmperorFormation = consumeBlackEmperorBattleFormation(player, A_player, B_team);
    if (blackEmperorFormation.consumed) await Write_player(task.qq, player);
    const battle = await zd_battle(A_player, B_team);
    player.当前血量 = battle.winner === 'A' ? Math.max(1, Math.trunc(battle.A_hp)) : 1;
    await Write_player(task.qq, player);

    return [
      '',
      event === 'triple_ambush' ? '【杀阵骤起·三人埋伏】三名天灵根修士同时封死退路！' : `【归途惊变·修士偷袭】${names[0]}趁你战后力竭突然出手！`,
      '伏杀者境界：练气30级 + 炼体30级；额外全属性 +1,500,000；天五灵根。',
      ...battleExcerpt(battle.msg),
      ...(blackEmperorFormation.message ? [blackEmperorFormation.message] : []),
      battle.winner === 'A' ? '你杀出重围，带着战利品返回凡间。' : '你不敌伏杀者，舍弃部分精血遁回凡间，当前血量降至1。',
    ];
  }

  async grantCorpseLoot(qq, rewardBonus, player) {
    const xiuwei = pickRandom(RIFT_XIUWEI_PILLS);
    const xueqi = pickRandom(RIFT_XUEQI_PILLS);
    const material = pickAffordableForgeMaterial(data.duanzhaocailiao);
    const materialCount = randomInt(1, 3);
    const source = randomInt(300, 3000);
    const extras = rollCorpseExtras();
    const rewards = [
      { name: xiuwei, class: '丹药', count: 1 },
      { name: xueqi, class: '丹药', count: 1 },
    ];
    if (material) rewards.push({ name: material.name, class: '材料', count: materialCount });
    if (extras.luckyGrass) rewards.push({ name: '幸运草', class: '道具', count: 1 });
    if (extras.rootWater) rewards.push({ name: '洗根水', class: '道具', count: 1 });
    if (extras.fateReroll) rewards.push({ name: '轮回命签', class: '道具', count: 1 });
    if (extras.fateSlot) rewards.push({ name: '命宫拓碑', class: '道具', count: 1 });

    for (const reward of rewards) {
      reward.count *= rewardBonus.multiplier;
      reward.count = addMemoryLootBonus(player, await foundthing(reward.name, { readOnly: true }), reward.count);
      await Add_najie_thing(qq, reward.name, reward.class, reward.count);
    }
    await Add_源石(qq, source);
    return [
      '',
      '【意外发现·无名修士遗骸】你在乱石下摸到一具尚未腐朽的修士尸体。',
      ...rewards.map(item => `${item.name} ×${item.count}`),
      `源石 +${source}`,
    ];
  }

  async pushInfo(id, isGroup, message) {
    if (isGroup) return Bot.pickGroup(id).sendMsg(message);
    return common.relpyPrivate(id, message);
  }

  async sendResult(task, message) {
    try {
      if (task.groupId) return await this.pushInfo(task.groupId, true, [segment.at(Number(task.qq)), message]);
      return await this.pushInfo(task.qq, false, message);
    } catch (error) {
      console.error(`[灵界裂缝] 玩家 ${task.qq} 消息发送失败:`, error);
    }
  }

  async broadcast(message) {
    const setting = config.getConfig('xiuxian', 'xiuxian');
    const groups = setting?.Era?.notifyGroups?.length ? setting.Era.notifyGroups : (setting.Group || []);
    for (const groupId of groups) {
      try {
        await Bot.sendGroupMsg(groupId, message);
      } catch (error) {
        console.error(`[灵界裂缝] 群 ${groupId} 广播失败:`, error);
      }
    }
  }
}

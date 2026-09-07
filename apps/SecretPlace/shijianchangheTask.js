import { plugin, common, data } from '../../api/api.js';
import fs from 'fs';
import {
  Read_player,
  isNotNull,
  Add_najie_thing,
  Add_修为,
  Add_炼体,
  Add_练气,
  Add_血气,
  Set_HP,
  Write_player,
  Read_equipment,
  ForwardMsg,
  Write_equipment,
  Add_寿元,
  Read_danyao,
  Write_danyao,
  bigNumberTransform,
  zd_battle,
  get_log_img,
  Read_najie,
  exist_najie_thing,
  channel,
  existplayer,
  getTargetQQFromEvent,
} from '../../model/xiuxian.js';
import { AppName } from '../../app.config.js';
import { consumeBlackEmperorBattleFormation } from '../../model/blackEmperor.js';
import {
  getRealmAuthorityLevel,
  hasRealmAuthority,
} from '../../model/realmAuthority.js';
import { addCappedEraAccumulation } from '../../model/selfDaoDeduction.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { runTaskOnce } from '../../utils/taskGuard.js';
import {
  beginDarkSuppression,
  completeDarkSuppressionCreation,
} from '../../model/darkSuppression.js';
import {
  awardDungeonGongfaProficiency,
  formatGongfaProficiency,
} from '../../model/gongfaProficiency.js';
import {
  buildTimeRiverAdversary,
  buildTimeRiverTeamBenchmark,
  collapsePastWorldlineArtifacts,
  ensureTimeRiverSkills,
  getTimeRiverEnemyNames,
  getTimeRiverFixedSpeed,
  DARK_TRIAD_NAMES,
  TIME_RIVER_PHASE_DURATION_MS,
  TIME_RIVER_RESCUE_WINDOW_MS,
  isDarkTriadEmperor,
  rollDarkTriadContinuation,
  rollTimeRiverEraReward,
  getTimeRiverVictoryReward,
  rollFutureQuasiEmperorInvasion,
  rollHuangEmperorTeaching,
  applyHuangEmperorTeaching,
  TIME_RIVER_FUTURE_QUASI_NAMES,
  TIME_RIVER_FUTURE_REWARD,
  scaleTimeRiverAdversary,
  getTimeRiverSacrificeRecovery,
  applyTimeRiverSacrificeBuff,
  applyCangEmperorOpeningSuppression,
  TIME_RIVER_REVIVAL_TAUNTS,
} from '../../model/timeRiverAdversary.js';
import { destroyWorldline } from '../../model/worldlineAuthority.js';
import { getFashanActionKey, requireActorAtPlane } from '../../model/fashanProxy.js';
import { PLACE_LOCATION_MAP } from '../../model/weimianTravel.js';

ensureTimeRiverSkills(data);

const TIME_RIVER_ACTIVE_ACTIONS = ['遨游时间长河', '组队遨游时间长河', '时间长河战败待援'];

export class ShijianChangheTask extends plugin {
  constructor() {
    super({
      name: '时间长河定时任务',
      dsc: '处理遨游时间长河的定时任务',
      event: 'message',
      priority: 1000,
      rule: [
        { reg: '^#献祭魂与血$', fnc: 'sacrificeSoulAndBlood' },
      ],
    });
    
    this.task = {
      cron: '0 */1 * * * *', // 每1分钟执行一次
      name: 'ShijianChangheTask',
      fnc: () => runTaskOnce('ShijianChangheTask', () => this.checkTimeRiverActions()),
    };
    
  }
  
async checkTimeRiverActions() {
  const currentTime = Date.now();
  const playersList = await this.getActiveTimeRiverPlayers();
  for (const usr_qq of playersList) {
    try {
      const raw = await redis.get(`xiuxian:player:${usr_qq}:action`);
      let memberIds = [String(usr_qq)];
      try {
        const action = JSON.parse(raw);
        if (Array.isArray(action?.timeRiverTeamMembers)) memberIds.push(...action.timeRiverTeamMembers.map(String));
      } catch {}
      const ids = [...new Set(memberIds)].sort();
      const lock = index => index >= ids.length
        ? this.checkTimeRiverPlayer(usr_qq, currentTime)
        : withPlayerMutationLock(ids[index], () => lock(index + 1));
      await lock(0);
    } catch (err) {
      console.error(`处理玩家${usr_qq}时出错:`, err);
    }
  }
  for (const usr_qq of await this.getActiveTimeRiverPlayers('fashan')) {
    try {
      await withPlayerMutationLock(usr_qq, () => this.checkFashanTimeRiverPlayer(usr_qq, currentTime));
    } catch (err) {
      console.error(`处理法身时间长河${usr_qq}时出错:`, err);
    }
  }
}

async checkFashanTimeRiverPlayer(usr_qq, currentTime) {
  let action;
  try {
    action = JSON.parse(await redis.get(getFashanActionKey(usr_qq)));
  } catch {
    // 异常记录保留排查，仅移除长河索引。
  }
  if (!action?.isFashan || action.time_river != '0') {
    await this.clearTimeRiverTracking(usr_qq, { isFashan: true });
    return;
  }
  if (!await existplayer(usr_qq)) {
    await this.clearTimeRiverTracking(usr_qq, action);
    return;
  }
  const player = await Read_player(usr_qq);
  if (Number(player.法身) !== 1
    || !requireActorAtPlane(player, PLACE_LOCATION_MAP.时间长河, 'fashan').ok
    || !requireActorAtPlane({ 法身位置: action.actorPlane ?? action.法身位置 }, PLACE_LOCATION_MAP.时间长河, 'fashan').ok
    || !Number.isFinite(Number(action.end_time)) || Number(action.end_time) <= 0) {
    await this.clearTimeRiverTracking(usr_qq, action);
    return;
  }
  if (Number(action.end_time) > currentTime) return;
  const continuing = await this.handleTimeRiverCompletion(usr_qq, action);
  if (!continuing) await this.clearTimeRiverTracking(usr_qq, action);
}

async checkTimeRiverPlayer(usr_qq, currentTime) {
      if (!await existplayer(usr_qq)) {
        await this.clearTimeRiverTracking(usr_qq);
        return;
      }
      const actionData = await redis.get(`xiuxian:player:${usr_qq}:action`);
      if (!actionData) {
        await this.clearTimeRiverTracking(usr_qq);
        return;
      }
      let action;
      try {
        action = JSON.parse(actionData);
      } catch {
        await this.clearTimeRiverTracking(usr_qq);
        return;
      }
      if (action.action === '道果崩解') {
        if (action.end_time <= currentTime) {
          await redis.del(`xiuxian:player:${usr_qq}:action`);
          await Bot.sendPrivateMsg(usr_qq, '【道果重组】经过30分钟调息，你的道果已重新凝聚！');
          await this.clearTimeRiverTracking(usr_qq);
        }
        return;
      }
      if (!TIME_RIVER_ACTIVE_ACTIONS.includes(action.action)) {
        await this.clearTimeRiverTracking(usr_qq);
        return;
      }
      const endTime = Number(action.end_time || await redis.get(`xiuxian:time_river:end_time:${usr_qq}`));
      if (!endTime || endTime > currentTime) return;

      if (action.action === '时间长河战败待援') {
        const memberIds = this.getTimeRiverMemberIds(usr_qq, action);
        for (const memberId of memberIds) {
          if (!await existplayer(memberId)) continue;
          await this.handleDarkSuppression(memberId, action, {
            worldlineCollapse: true,
            enemyNames: action.enemyNames || DARK_TRIAD_NAMES,
          });
        }
        await this.notifyPlayer(usr_qq, action, memberIds.length > 1
          ? '【十息成劫】十分钟内无人献祭魂与血，整支队伍的元神均被拘入黑暗古国，开始炼化道果！'
          : '【十息成劫】十分钟内无人献祭魂与血，你的元神已被拘入黑暗古国，开始炼化道果！');
        await this.clearTimeRiverTracking(usr_qq, action);
        return;
      }

      const continuing = await this.handleTimeRiverCompletion(usr_qq, action);
      if (!continuing) await this.clearTimeRiverTracking(usr_qq, action);
}

  getTimeRiverMemberIds(usr_qq, action = {}) {
    if (action.isFashan) return [String(usr_qq)];
    return [...new Set([
      String(action.timeRiverLeader || usr_qq),
      ...(Array.isArray(action.timeRiverTeamMembers) ? action.timeRiverTeamMembers.map(String) : []),
    ])].slice(0, 4);
  }

  async getActiveTimeRiverPlayers(actor = 'body') {
    try {
      const key = `xiuxian:time_river:active_players${actor === 'fashan' ? ':fashan' : ''}`;
      return [...new Set(JSON.parse(await redis.get(key) || '[]').map(String))];
    } catch {
      return [];
    }
  }

  async addActiveTimeRiverPlayer(usr_qq, actor = 'body') {
    await withPlayerMutationLock('time-river-active-index', async () => {
      const players = await this.getActiveTimeRiverPlayers(actor);
      if (!players.includes(String(usr_qq))) players.push(String(usr_qq));
      const key = `xiuxian:time_river:active_players${actor === 'fashan' ? ':fashan' : ''}`;
      await redis.set(key, JSON.stringify(players));
    });
  }

  async clearTimeRiverTracking(usr_qq, sourceAction = null) {
    if (sourceAction?.isFashan) {
      const key = getFashanActionKey(usr_qq);
      let current;
      try { current = JSON.parse(await redis.get(key)); } catch {}
      if (current?.isFashan && current.time_river == '0') {
        if (sourceAction.taskId && current.taskId !== sourceAction.taskId) return;
        if (await existplayer(usr_qq)) {
          const player = await Read_player(usr_qq);
          player.法身状态 = '空闲中';
          player.法身行动 = '无行动';
          await Write_player(usr_qq, player);
        }
        await redis.del(key);
      }
      await withPlayerMutationLock('time-river-active-index', async () => {
        const players = (await this.getActiveTimeRiverPlayers('fashan')).filter(id => id !== String(usr_qq));
        await redis.set('xiuxian:time_river:active_players:fashan', JSON.stringify(players));
      });
      return;
    }
    let action = sourceAction;
    if (!action) {
      try {
        action = JSON.parse(await redis.get(`xiuxian:player:${usr_qq}:action`));
      } catch {
        action = {};
      }
    }
    action ||= {};
    const members = this.getTimeRiverMemberIds(usr_qq, action);
    await withPlayerMutationLock('time-river-active-index', async () => {
      const players = (await this.getActiveTimeRiverPlayers()).filter(id => !members.includes(id));
      await redis.set('xiuxian:time_river:active_players', JSON.stringify(players));
    });
    for (const memberId of members) {
      await redis.del(`xiuxian:time_river:end_time:${memberId}`);
      const current = await redis.get(`xiuxian:player:${memberId}:action`);
      if (!current) continue;
      try {
        const memberAction = JSON.parse(current);
        const sameTeam = !action.timeRiverTeamId || memberAction.timeRiverTeamId === action.timeRiverTeamId;
        if (sameTeam && TIME_RIVER_ACTIVE_ACTIONS.includes(memberAction.action)) {
          await redis.del(`xiuxian:player:${memberId}:action`);
        }
      } catch {
        await redis.del(`xiuxian:player:${memberId}:action`);
      }
    }
    if (action.timeRiverTeamId) {
      const teamKey = `xiuxian:time_river:team:${action.timeRiverTeamId}`;
      const rawTeam = await redis.get(teamKey);
      if (rawTeam) {
        try {
          const team = JSON.parse(rawTeam);
          team.status = 'recruiting';
          delete team.startedAt;
          await redis.set(teamKey, JSON.stringify(team), 'EX', 24 * 60 * 60);
          await Promise.all(team.members.map(memberId => (
            redis.set(`xiuxian:time_river:player_team:${memberId}`, team.id, 'EX', 24 * 60 * 60)
          )));
        } catch {}
      }
    }
  }

  buildPlayerCombatant(player, usr_qq, revivalTaunts = false, sacrificeBuff = 0) {
    const combatant = {
      id: player.id || usr_qq,
      名号: player.名号,
      攻击: player.攻击,
      防御: player.防御,
      当前血量: player.当前血量,
      血量上限: player.血量上限,
      暴击率: player.暴击率,
      灵根: player.灵根,
      法球倍率: player.灵根?.法球倍率 || 1,
      学习的功法: player.学习的功法,
      功法熟练度: player.功法熟练度,
      功法熟练度每日: player.功法熟练度每日,
      战斗技能配置: player.战斗技能配置,
      仙宠: player.仙宠,
      速度: player.速度,
      mijinglevel_id: player.mijinglevel_id,
      xiangulevel_id: player.xiangulevel_id,
      huafenlevel_id: player.huafenlevel_id,
      己道推演: player.己道推演,
      ...(revivalTaunts ? { _时间长河复活彩蛋: TIME_RIVER_REVIVAL_TAUNTS } : {}),
    };
    return sacrificeBuff > 0
      ? applyTimeRiverSacrificeBuff(combatant, sacrificeBuff)
      : combatant;
  }

  getEnemyTemplate(name) {
    return data.shijianchanghe_list.find(item => item.name === name);
  }

  buildStageEnemies(player, action) {
    const stage = action.timeRiverStage || 'initial';
    let names;
    if (stage === 'initial') {
      names = [data.shijianchanghe_list[Math.floor(Math.random() * data.shijianchanghe_list.length)].name];
    } else if (stage === 'solo') {
      names = [action.primaryName];
    } else if (stage === 'triad') {
      names = [...DARK_TRIAD_NAMES];
    } else if (stage === 'future_quasi') {
      names = ['灭世老人', ...DARK_TRIAD_NAMES, ...TIME_RIVER_FUTURE_QUASI_NAMES];
    } else {
      names = action.imperialPill ? ['灭世老人', ...DARK_TRIAD_NAMES] : ['灭世老人'];
    }
    const scaleFactor = this.calculateScaleFactor(getRealmAuthorityLevel(player));
    return names.map(name => {
      const template = this.getEnemyTemplate(name)
        || (name.startsWith('未来准仙帝·') ? {
          ...this.getEnemyTemplate('未来准仙帝'),
          name,
        } : null);
      if (!template) throw new Error(`时间长河敌人配置缺失：${name}`);
      const enemy = buildTimeRiverAdversary(player, template, { scaleFactor });
      const built = action.imperialPill && isDarkTriadEmperor(name)
        ? scaleTimeRiverAdversary(enemy, 0.7)
        : enemy;
      // 速度由名号固定，不受阶段缩放与历史存档影响
      built.速度 = getTimeRiverFixedSpeed(name);
      const saved = action.enemyState?.find(item => item.name === name);
      if (!saved) return built;
      for (const field of ['攻击', '防御', '血量上限']) {
        if (Number.isFinite(Number(saved[field]))) built[field] = Math.max(1, Math.trunc(Number(saved[field])));
      }
      built.当前血量 = Math.max(0, Math.min(built.血量上限, Math.trunc(Number(saved.当前血量) || 0)));
      built._时间长河复活次数已用 = Math.max(0, Math.trunc(Number(saved._时间长河复活次数已用) || 0));
      built.护盾值 = Math.max(0, Math.trunc(Number(saved.护盾值) || 0));
      built._持续减伤回合 = Math.max(0, Math.trunc(Number(saved._持续减伤回合) || 0));
      built._持续减伤比例 = Math.max(0, Number(saved._持续减伤比例) || 0);
      built._忽略境界速度加成 = true;
      return built;
    });
  }

  captureEnemyState(enemies, battleResult) {
    const resultTeam = Array.isArray(battleResult.B_team) ? battleResult.B_team : [];
    return enemies.map((enemy, index) => {
      const resultEnemy = resultTeam.find(item => item.名号 === enemy.名号) || resultTeam[index];
      const currentHp = resultEnemy?.当前血量 ?? (index === 0 ? battleResult.B_hp : enemy.当前血量);
      const resolved = resultEnemy || enemy;
      return {
        name: enemy.名号,
        攻击: resolved.攻击,
        防御: resolved.防御,
        血量上限: resolved.血量上限,
        当前血量: Math.max(0, Number(currentHp) || 0),
        速度: resolved.速度,
        _时间长河复活次数已用: Math.max(0, Number(resolved._时间长河复活次数已用) || 0),
        护盾值: Math.max(0, Number(resolved._护盾值 ?? resolved.护盾值) || 0),
        _持续减伤回合: Math.max(0, Number(resolved._持续减伤回合) || 0),
        _持续减伤比例: Math.max(0, Number(resolved._持续减伤比例) || 0),
      };
    });
  }

  async handleTimeRiverCompletion(usr_qq, action) {
    const isFashan = action.isFashan === true;
    const memberIds = this.getTimeRiverMemberIds(usr_qq, action);
    const members = [];
    for (const id of memberIds) {
      if (await existplayer(id)) {
        const player = await Read_player(id);
        if (isFashan) {
          const maxHp = Math.max(1, Number(player.血量上限) || 1);
          const savedHp = Number(player.法身当前血量);
          player.当前血量 = Number.isFinite(savedHp) ? Math.min(maxHp, Math.max(0, savedHp)) : maxHp;
          if (player.当前血量 < maxHp * 0.3 && await exist_najie_thing(id, '起死回生丹', '丹药') > 0) {
            await Add_najie_thing(id, '起死回生丹', '丹药', -1);
            player.当前血量 = maxHp;
          }
        }
        members.push({ id, player, baseline: isFashan ? structuredClone(player) : null });
      }
    }
    if (!members.length) return false;
    const leader = members.find(member => member.id === String(action.timeRiverLeader || usr_qq)) || members[0];
    for (const { player } of members) player.纪元积累 = Math.max(0, Number(player.纪元积累) || 0);
    const stage = action.timeRiverStage || 'initial';
    const benchmark = buildTimeRiverTeamBenchmark(members.map(member => member.player));
    const enemies = this.buildStageEnemies(benchmark, action);
    const primary = enemies[0];
    const isGroupBattle = members.length > 1 || enemies.length > 1;
    const chainBattle = stage !== 'initial' || isDarkTriadEmperor(primary.名号);
    const combatants = members.map(({ id, player }) => this.buildPlayerCombatant(
      player, id, enemies.some(enemy => isDarkTriadEmperor(enemy.名号)), Number(action.sacrificeBuff) || 0,
    ));
    const counterEnemy = enemies.find(enemy => enemy._时间长河反制);
    const linCounterEnemy = counterEnemy || enemies.find(enemy => enemy._时间长河临字秘反制);
    const openingMessages = [];
    for (const combatant of combatants) {
      if (linCounterEnemy) {
        combatant._时间长河临字秘反制目标 = true;
        combatant._时间长河反制来源 = linCounterEnemy.名号;
      }
      if (counterEnemy) {
        combatant._时间长河反制 = true;
        combatant._时间长河反制目标 = true;
        combatant._时间长河至宝失效 = true;
        combatant._帝兵失效 = true;
        combatant._时间长河反制来源 = counterEnemy.名号;
      }
      if (enemies.some(enemy => enemy.名号 === '苍帝')) {
        const suppression = applyCangEmperorOpeningSuppression(combatant);
        if (suppression.message) openingMessages.push(suppression.message);
      }
    }

    const teamName = members.map(member => member.player.名号).join('、');
    await this.sendEncounterMessage(usr_qq, action, this.generateStageEncounter(
      { ...leader.player, 名号: teamName }, action, enemies,
    ));
    for (let index = 0; index < members.length; index++) {
      const formation = consumeBlackEmperorBattleFormation(members[index].player, combatants[index], primary);
      if (formation.message) openingMessages.push(formation.message);
    }
    const battleResult = isGroupBattle
      ? await zd_battle(combatants, enemies, { timeRiverBattle: true })
      : await zd_battle(combatants[0], primary, { timeRiverBattle: true });
    if (Array.isArray(battleResult.msg)) {
      if (stage === 'triad') {
        openingMessages.push('【黑暗三帝·帝辉护体】苍、鸿、羽三帝各自凝聚35%生命护盾，并以帝辉减免30%伤害；每帝均可满血复生一次，复生不会解除已有控制与负面状态。');
      }
      battleResult.msg.unshift(...openingMessages);
    }

    const outcome = battleResult.winner === 'A' ? 'victory' : battleResult.winner === 'B' ? 'defeat' : 'draw';
    let eraAccumulationChange = rollTimeRiverEraReward(outcome);
    if (outcome === 'victory' && stage === 'triad') eraAccumulationChange *= 3;
    if (outcome === 'victory' && stage === 'old_man') eraAccumulationChange = action.oldManReward || (action.imperialPill ? 30 : 10);
    if (outcome === 'victory' && stage === 'future_quasi') eraAccumulationChange = TIME_RIVER_FUTURE_REWARD;
    const fixedReward = outcome === 'victory' ? getTimeRiverVictoryReward(primary.名号) : 0;
    if (fixedReward) eraAccumulationChange = fixedReward;
    const enemyNames = getTimeRiverEnemyNames(primary.名号, enemies.slice(1));
    const resolvedTeam = Array.isArray(battleResult.A_team) ? battleResult.A_team : [combatants[0]];
    const memberResults = [];
    for (let index = 0; index < members.length; index++) {
      const { id, player, baseline } = members[index];
      const resolvedPlayer = resolvedTeam[index] || combatants[index];
      player.功法熟练度 = resolvedPlayer.功法熟练度 || player.功法熟练度;
      player.功法熟练度每日 = resolvedPlayer.功法熟练度每日 || player.功法熟练度每日;
      const remainingHp = members.length === 1 && !battleResult.A_team
        ? battleResult.A_hp
        : resolvedPlayer.当前血量;
      player.当前血量 = Math.max(0, Math.min(Number(player.血量上限) || 1, Number(remainingHp) || 0));
      const proficiencyGains = awardDungeonGongfaProficiency(player);
      const era = addCappedEraAccumulation(player, eraAccumulationChange);

      const specialEvents = {};
      const penalties = {};
      if (outcome === 'defeat' && stage === 'future_quasi') specialEvents.futureRescue = true;
      if (isFashan && outcome === 'defeat') {
        // 法身败退只结算法身气血，不将真身送入待援、炼化或过去身抹除。
        specialEvents.fashanDefeated = true;
      } else if (outcome === 'defeat' && chainBattle) {
        specialEvents.rescueWindow = true;
        specialEvents.willowGuardian = index === 0
          && DARK_TRIAD_NAMES.every(name => enemyNames.includes(name))
          && !action.willowGuardianTriggered;
      } else if (outcome === 'defeat' && primary.名号 !== '尸骸仙帝' && enemyNames.some(name => ['灭世老人', '未来准仙帝'].includes(name))) {
        specialEvents.darkSuppression = true;
      } else if (outcome === 'defeat' && !chainBattle && !hasRealmAuthority(player, 21) && Math.random() < 0.3) {
        const timelessTalisman = await exist_najie_thing(id, '诸世无痕符', '道具');
        if (timelessTalisman > 0) {
          await Add_najie_thing(id, '诸世无痕符', '道具', -1);
          specialEvents.pastBodyTalismanResisted = true;
        } else if (player?.己道推演?.divineEmbryo === '已结出' && Math.random() < 0.5) {
          specialEvents.pastBodyResisted = true;
        } else {
          specialEvents.pastBodyExposed = true;
          penalties.pastBodyExposed = await this.handlePastBodyExposed(id);
          Object.assign(player, penalties.pastBodyExposed.player);
        }
      }

      if (primary.名号 === '荒天帝') {
        const teaching = rollHuangEmperorTeaching();
        if (teaching) {
          const teachingResult = applyHuangEmperorTeaching(player, teaching);
          specialEvents.huangTeaching = {
            name: teaching.name,
            desc: teaching.desc,
            gained: teachingResult.gained,
            progress: teachingResult.progress,
            mastered: teachingResult.mastered,
          };
        }
      }
      if (isFashan) {
        player.法身当前血量 = player.当前血量;
        const body = await Read_player(id);
        // 只合并本次战斗改动，保留真身在战斗期间更新的镇守、气血等字段。
        for (const key of new Set([...Object.keys(baseline), ...Object.keys(player)])) {
          if (['当前血量', '法身当前血量', '纪元积累'].includes(key)) continue;
          if (JSON.stringify(baseline[key]) === JSON.stringify(player[key])) continue;
          if (Object.hasOwn(player, key)) body[key] = structuredClone(player[key]);
          else delete body[key];
        }
        Object.assign(era, addCappedEraAccumulation(body, era.gained));
        player.纪元积累 = body.纪元积累;
        body.法身当前血量 = player.法身当前血量;
        await Write_player(id, body);
      } else {
        await Write_player(id, player);
      }
      if (specialEvents.darkSuppression) {
        penalties.darkSuppression = await this.handleDarkSuppression(id, action, { worldlineCollapse: true, enemyNames });
      }
      memberResults.push({ id, player, specialEvents, penalties, proficiencyGains, era });
    }

    for (const result of memberResults) {
      const message = this.generateResultMessage(result.player, primary, {
        ...battleResult,
        outcome,
        specialEvents: result.specialEvents,
        penalties: result.penalties,
        proficiencyGains: result.proficiencyGains,
        eraAccumulationChange: result.era.gained,
        eraAccumulationCap: result.era.cap,
        newEraAccumulation: result.player.纪元积累,
      });
      if (isFashan) {
        try {
          await this.sendResultMessage(result.id, action, `【法身代行】\n${message}`);
        } catch (error) {
          console.error(`[法身时间长河] 战报发送失败：${error.message}`);
        }
      } else {
        await this.sendResultMessage(result.id, action, message);
      }
    }

    if (memberResults.some(result => result.specialEvents.futureRescue)) {
      await this.openRescueWindow(usr_qq, action, {
        retryStage: 'future_quasi',
        primaryName: '未来准仙帝',
        imperialPill: true,
        enemyNames,
        enemyState: this.captureEnemyState(enemies, battleResult),
      });
      return true;
    }
    if (memberResults.some(result => result.specialEvents.rescueWindow)) {
      await this.openRescueWindow(usr_qq, action, {
        retryStage: stage === 'initial' ? 'solo' : stage,
        primaryName: primary.名号,
        imperialPill: Boolean(action.imperialPill),
        oldManReward: action.oldManReward,
        enemyNames,
        enemyState: this.captureEnemyState(enemies, battleResult),
        willowGuardianTriggered: Boolean(
          action.willowGuardianTriggered || memberResults.some(result => result.specialEvents.willowGuardian)
        ),
      });
      return true;
    }
    if (memberResults.some(result => result.specialEvents.darkSuppression)) return false;
    if (outcome === 'victory' && stage === 'initial' && isDarkTriadEmperor(primary.名号)) {
      await this.scheduleTimeRiverStage(usr_qq, action, 'triad', { primaryName: primary.名号 });
      return true;
    }
    if (outcome === 'victory' && stage === 'triad') {
      const continuation = rollDarkTriadContinuation();
      if (continuation.summoned) {
        await this.scheduleTimeRiverStage(usr_qq, action, 'old_man', {
          imperialPill: continuation.imperialPill,
          oldManReward: continuation.reward,
        });
        return true;
      }
    }
    if (outcome === 'victory' && stage === 'old_man' && action.imperialPill) {
      const invasion = rollFutureQuasiEmperorInvasion();
      if (invasion.summoned) {
        await this.scheduleTimeRiverStage(usr_qq, action, 'future_quasi', {
          primaryName: '未来准仙帝',
          imperialPill: true,
          enemyNames: invasion.enemyNames,
          oldManReward: action.oldManReward,
        });
        return true;
      }
    }
    return false;
  }

  generateStageEncounter(player, action, enemies) {
    const stage = action.timeRiverStage || 'initial';
    if (stage === 'future_quasi') {
      return [
        '【未来逆流·一打七】',
        '灭世老人、苍帝、鸿帝、羽帝与未来三大准仙帝逆流而来，七尊黑暗身影同时封锁长河！',
        '即便战败，时间长河下游的遮天三人组也会撕开时空前来救场。',
      ];
    }
    if (stage === 'triad') {
      const primaryName = action.primaryName || '黑暗准仙帝';
      const supporters = DARK_TRIAD_NAMES.filter(name => name !== primaryName).join('与');
      return [
        action.enemyState ? '【时间长河续接·帝战再启】' : '【时间长河改道·诸世间崩塌】',
        action.enemyState
          ? `魂血续上败亡节点，苍、鸿、羽三帝携上一战的剩余气血再度围杀${player.名号}！`
          : `${primaryName}的帝躯在古史中满血重聚，${supporters}跨越相邻纪元同时降临！`,
        '鸿帝：“一觉万古，这世间又多了一尊帝者吗？可惜，亦不懂天机，一意孤行，只得送他上路！”',
        '羽帝：“没有永恒不灭的天地主角，你或许是这一纪元的异数，可是遇上我们三个同样的生灵，又能如何，可以逆天吗？”',
        `苍帝：“你名为${player.名号}，很可悲也很可惜，与我等为敌，你注定要血染诸天！”`,
        `${player.名号}望着三道并立的帝影，低声感慨：“帝落啊，帝落！”`,
        '当真是帝落时代。那一世曾有准仙帝殒落，而今会轮到他吗？大决战来临，情况远比想象更糟，这是一场生死大劫难！',
        '鸿帝身后浮现浩荡亿万里的黑暗古国，言出即法，死咒搅乱乾坤，撕开无敌气势；苍帝灰发披散，踏着岁月长河挥出打破万古诸天的无敌拳印！',
        '鸿帝：“可惜，可悲，可叹，任你千秋霸业，万古天骄，亦转头空。磨灭这一世帝者身吧！”',
      ];
    }
    if (stage === 'old_man') {
      if (action.enemyState) {
        return [
          '【古史尽头·血祭续战】',
          `魂血贯通败亡节点，灭世老人与黑暗三帝保留上一战的剩余气血，再度围住${player.名号}！`,
        ];
      }
      return action.imperialPill ? [
        '【时间长河改道·灭世老人降临】',
        '灭世老人赐下三枚帝丹，苍、鸿、羽三帝恢复七成全属性；四尊黑暗帝者截断古今未来，联手围杀！',
      ] : [
        '【古史尽头·灭世老人降临】',
        '三帝败亡惊醒了黑暗源头，灭世老人拄杖踏出，要亲手葬下这一纪元的帝者！',
      ];
    }
    return this.generateEncounterMessage(enemies[0]);
  }

  async scheduleTimeRiverStage(usr_qq, previousAction, stage, details = {}) {
    const endTime = Date.now() + TIME_RIVER_PHASE_DURATION_MS;
    const action = {
      ...previousAction,
      ...details,
      action: '遨游时间长河',
      timeRiverStage: stage,
      start_time: Date.now(),
      end_time: endTime,
      time: TIME_RIVER_PHASE_DURATION_MS,
      sacrificeBuff: Number(details.sacrificeBuff) || 0,
      enemyState: details.enemyState || null,
      willowGuardianTriggered: Boolean(previousAction.willowGuardianTriggered || details.willowGuardianTriggered),
    };
    for (const memberId of this.getTimeRiverMemberIds(usr_qq, action)) {
      if (action.isFashan) {
        await redis.set(getFashanActionKey(memberId), JSON.stringify(action));
      } else {
        await redis.set(`xiuxian:player:${memberId}:action`, JSON.stringify(action));
        await redis.set(`xiuxian:time_river:end_time:${memberId}`, endTime);
      }
    }
    await this.addActiveTimeRiverPlayer(usr_qq, action.isFashan ? 'fashan' : 'body');
    const text = details.enemyState
      ? '【血祭续战】魂血照亮断裂古史，敌方保留上一战的剩余气血，十五分钟后从败亡节点继续结算。'
      : stage === 'triad'
      ? '【三帝截流】苍鸿羽三帝已满状态并立，时间长河改道，诸世间崩塌！十五分钟后三帝围杀正式结算。'
      : stage === 'old_man'
        ? `【灭世追猎】灭世老人已经降临${details.imperialPill ? '，并赐帝丹令苍鸿羽恢复七成全属性' : ''}！十五分钟后结算。`
        : '【血祭续战】魂血照亮断裂古史，十五分钟后重新结算这场帝战。';
    await this.notifyPlayer(usr_qq, action, text);
  }

  async openRescueWindow(usr_qq, previousAction, details) {
    const endTime = Date.now() + TIME_RIVER_RESCUE_WINDOW_MS;
    const action = {
      ...previousAction,
      ...details,
      action: '时间长河战败待援',
      start_time: Date.now(),
      end_time: endTime,
    };
    for (const memberId of this.getTimeRiverMemberIds(usr_qq, action)) {
      await redis.set(`xiuxian:player:${memberId}:action`, JSON.stringify(action));
      await redis.set(`xiuxian:time_river:end_time:${memberId}`, endTime);
    }
    await this.addActiveTimeRiverPlayer(usr_qq);
    const teamBattle = this.getTimeRiverMemberIds(usr_qq, action).length > 1;
    await this.notifyPlayer(usr_qq, action, teamBattle
      ? '【帝血待援】队伍已战败，十分钟内全员无法行动。同灵根且至少一条额外体系成仙的外援，可向任一成员献祭魂与血续接此战；逾时全员将被炼化道果。'
      : '【帝血待援】你已战败，十分钟内无法行动。同灵根且至少一条额外体系成仙的玩家，可发送“#献祭魂与血 @你”续接此战；逾时将被炼化道果。');
  }

  async sacrificeSoulAndBlood(e) {
    const donorQQ = await channel(String(e.user_id).replace('qg_', ''));
    const rawTarget = getTargetQQFromEvent(e, donorQQ);
    const targetQQ = rawTarget ? await channel(rawTarget) : '';
    if (!targetQQ) return e.reply('请使用：#献祭魂与血 @战败玩家');
    if (String(targetQQ) === String(donorQQ)) return e.reply('魂与血必须献给另一位同灵根玩家');
    if (!await existplayer(donorQQ) || !await existplayer(targetQQ)) return e.reply('献祭双方都需要拥有修仙存档');

    let targetAction = {};
    try {
      targetAction = JSON.parse(await redis.get(`xiuxian:player:${targetQQ}:action`)) || {};
    } catch {}
    const ids = [...new Set([
      String(donorQQ),
      ...this.getTimeRiverMemberIds(targetQQ, targetAction),
    ])].sort();
    const lock = index => index >= ids.length
      ? this.sacrificeSoulAndBloodLocked(e, donorQQ, targetQQ)
      : withPlayerMutationLock(ids[index], () => lock(index + 1));
    return lock(0);
  }

  async sacrificeSoulAndBloodLocked(e, donorQQ, targetQQ) {
    const actionData = await redis.get(`xiuxian:player:${targetQQ}:action`);
    if (!actionData) return e.reply('对方当前不在时间长河战败待援状态');
    const action = JSON.parse(actionData);
    if (action.action !== '时间长河战败待援' || Number(action.end_time) <= Date.now()) {
      return e.reply('对方的十分钟献祭窗口已经结束');
    }
    const donor = await Read_player(donorQQ);
    const target = await Read_player(targetQQ);
    const memberIds = this.getTimeRiverMemberIds(targetQQ, action);
    if (memberIds.includes(String(donorQQ))) return e.reply('战败队伍中的成员此刻同陷败亡节点，需由队伍外的同灵根玩家献祭');
    if (!donor.灵根?.name || donor.灵根.name !== target.灵根?.name) {
      return e.reply(`灵根不相同：你为【${donor.灵根?.name || '未知'}】，对方为【${target.灵根?.name || '未知'}】`);
    }
    const recovery = getTimeRiverSacrificeRecovery(donor);
    if (!recovery.eligible) return e.reply('三大额外体系至少有一条成仙，方能承受献祭魂与血的反噬');
    const path = recovery.path;
    const field = path === 'xiangu' ? 'xiangulevel_id' : path === 'huafen' ? 'huafenlevel_id' : 'mijinglevel_id';

    donor[field] = Math.max(1, (Number(donor[field]) || 1) - 1);
    donor.level_id = 1;
    donor.Physique_id = 1;
    await Write_player(donorQQ, donor);
    for (const memberId of memberIds) {
      const member = memberId === String(targetQQ) ? target : await Read_player(memberId);
      member.当前血量 = Math.max(1, Number(member.血量上限) || 1);
      await Write_player(memberId, member);
    }
    const leaderId = String(action.timeRiverLeader || targetQQ);
    await this.scheduleTimeRiverStage(leaderId, action, action.retryStage, {
      primaryName: action.primaryName,
      imperialPill: action.imperialPill,
      oldManReward: action.oldManReward,
      enemyState: action.enemyState,
      sacrificeBuff: recovery.ratio,
      willowGuardianTriggered: action.willowGuardianTriggered,
    });
    await e.reply([
      '【献祭魂与血·古史续接】',
      `${donor.名号}献出魂与血，同源灵根贯通断裂的时间线！`,
      `${memberIds.length > 1 ? '整支队伍' : target.名号}恢复全部气血，并获得${Math.round(recovery.ratio * 100)}%攻击、防御、生命上限与速度加成（献祭者层级：${recovery.tier}）。`,
      '黑暗帝者保留上一战结束时的剩余气血，十五分钟后从断裂战局继续。',
      `代价：${path === 'xiangu' ? '仙古今世法' : path === 'huafen' ? '花粉进化路' : '秘境体系'}跌落一层，练气与炼体归一。`,
    ].join('\n'));
    return true;
  }

  async notifyPlayer(usr_qq, action, message) {
    if (action.group_id) await Bot.pickGroup(action.group_id).sendMsg([segment.at(usr_qq), message]);
    else await Bot.sendPrivateMsg(usr_qq, message);
  }
  
  /** 处理被厄土仙帝推演出过去身的惩罚 */

async handlePastBodyExposed(usr_qq) {
  try {
    const player = await Read_player(usr_qq);
    const najie = await Read_najie(usr_qq);
    const equipment = await Read_equipment(usr_qq);
    
    // 惩罚1: 丢失纳戒物品
    let lostItems = [];
    const itemCategories = ["丹药", "道具", "功法", "草药", "材料", "食材", "盒子"];
    
    // 随机选择1-4个分类
    const affectedCategories = itemCategories
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.floor(Math.random() * 4) + 1);
    
    // 处理每个受影响分类
    for (const category of affectedCategories) {
      if (!najie[category]?.length) continue;
      
      const itemsToAffect = najie[category]
        .sort(() => 0.5 - Math.random())
        .slice(0, Math.floor(Math.random() * 3) + 1);
      
      for (const item of itemsToAffect) {
        const currentQuantity = await exist_najie_thing(usr_qq, item.name, category);
        if (currentQuantity <= 0) continue;
        
        const lostAmount = Math.max(1, Math.floor(currentQuantity * (0.1 + Math.random() * 0.4)));
        const actualLost = Math.min(lostAmount, currentQuantity);
        
        await Add_najie_thing(usr_qq, item.name, category, -actualLost);
        lostItems.push({
          name: item.name,
          quantity: actualLost,
          category
        });
      }
    }
    
    // 直接修改等级
    const levelPenalty = Math.floor(Math.random() * 5) + 1;
    const physiquePenalty = Math.floor(Math.random() * 5) + 1;
    player.level_id = Math.max(0, player.level_id - levelPenalty);
    player.Physique_id = Math.max(0, player.Physique_id - physiquePenalty);
    const worldlineCollapse = collapsePastWorldlineArtifacts(equipment, player);
    if (worldlineCollapse.destroyed) await Write_equipment(usr_qq, equipment);
    destroyWorldline(player, `时间长河过去身:${Date.now()}`);

    return {
      player, // 返回修改后的 player 对象
      lostItems,
      worldlineCollapse,
      reductionLvl: {
        originalLevel: player.level_id + levelPenalty,
        originalPhysique: player.Physique_id + physiquePenalty,
        newLevel: player.level_id,
        newPhysique: player.Physique_id,
        penalties: { levelPenalty, physiquePenalty }
      }
    };
  } catch (e) {
    console.error("处理过去身暴露失败:", e);
    const player = await Read_player(usr_qq).catch(() => ({ 
      level_id: 0, 
      Physique_id: 0 
    }));
    return { 
      player,
      lostItems: [], 
      reductionLvl: {
        originalLevel: player.level_id,
        originalPhysique: player.Physique_id,
        newLevel: player.level_id,
        newPhysique: player.Physique_id,
        penalties: { levelPenalty: 0, physiquePenalty: 0 }
      }
    };
  }
}
  /** 处理被黑暗准仙帝镇压 */
async handleDarkSuppression(usr_qq, action, options = {}) {
  return withPlayerMutationLock(usr_qq, async () => {
  // 设置镇压时间（60分钟）
  const player = await Read_player(usr_qq);
  const equipment = await Read_equipment(usr_qq);
  const suppressionTime = 60 * 60 * 1000;
  const startedAt = Date.now();
  const endTime = startedAt + suppressionTime;
  const worldlineCollapse = options.worldlineCollapse
    ? collapsePastWorldlineArtifacts(equipment, player)
    : { destroyed: false };
  const originalLevel = getRealmAuthorityLevel(player);
  destroyWorldline(player, `苍帝道崩:${startedAt}`);
  player.道果状态 = '道崩·炼化中';
  player.时间长河道崩 = {
    source: options.enemyNames?.join('、') || '黑暗准仙帝',
    startedAt,
    worldlineCollapse,
  };
  const playerPatch = {
    时间线权能: player.时间线权能,
    道果状态: player.道果状态,
    时间长河道崩: player.时间长河道崩,
  };
  for (const field of ['道果瑕疵', '古史创伤']) {
    if (Object.hasOwn(player, field)) playerPatch[field] = player[field];
  }

  // 先原子替换行动并登记恢复状态，避免重启后重复结算不可逆惩罚。
  await beginDarkSuppression(redis, usr_qq, {
    startedAt,
    endTime,
    groupId: action.group_id,
    originalLevel,
    recoveryPlayerPatch: playerPatch,
    recoveryEquipment: worldlineCollapse.destroyed ? equipment : null,
  });
  if (worldlineCollapse.destroyed) await Write_equipment(usr_qq, equipment);
  const latestPlayer = await Read_player(usr_qq);
  Object.assign(latestPlayer, playerPatch);
  await Write_player(usr_qq, latestPlayer);
  await completeDarkSuppressionCreation(redis, usr_qq, {
    groupId: action.group_id,
    originalLevel,
  });
  
  return { 
    suppressionTime,
    endTime,
    worldlineCollapse,
    message: "你已被黑暗准仙帝镇压，60分钟后将解除镇压并跌落一层境界"
  };
  });
}
  
  // 生成遭遇文案
  generateEncounterMessage(enemy, team = []) {
    const encounterMessages = {
      "苍帝": [
        `【时间长河遭遇·黑暗天庭】`,
        `你逆流而上，踏足界海尽头，`,
        `前方浮现一座残破的黑暗天庭！`,
        `殿宇坍塌，仙宫倾颓，断壁残垣间弥漫着万古不散的黑暗物质。`,
        `帝血染红了天阶，仙王尸骸堆积如山，`,
        `整片天地都笼罩在令人窒息的压抑中！`,
        `忽然，一道贯穿古今未来的声音响起，`,
        `带着俯瞰万古的无敌气息，震得时间长河都在颤抖：`,
        `"遇帝不拜，真命已失！"`,
        `"轮回碑上有汝名！"`,
        `"一步一叩首，往生路上罪削半，护你真灵！"`,
        `你抬眼望去，只见黑暗天庭深处：`,
        `- 虔诚的朝圣者自海的那一端而来，一步一叩首，`,
        `- 他们的额头染血，眼中却满是狂热的虔诚，`,
        `- 只为觐见那端坐于天庭废墟之巅的无上存在！`,
        `苍帝缓缓睁开双眸，眸光开阖间映照诸天沉沦！`,
        `他周身环绕大道符文，透发出一股睥睨天下，唯我无敌的气势！`,
        `帝威浩荡，让整片苍茫大地都在颤栗！`,
        `"万古以来，朝圣者皆虔诚而真挚，"`,
        `苍帝的声音冰冷如万古寒渊，带着俯瞰众生的威严：`,
        `"自海的那一端而来，一步一叩首，只为觐见本座。"`,
        `"而你..."`,
        `"为何带着杀意而至？"`,
        `话音未落，天地变色！`,
        `- 仅是一道目光，便让虚空寸寸崩裂！`,
        `- 口诵真言，便有绝世仙王化作飞灰，踏上往生路！`,
        `- 帝威如狱，万灵在其一念间形神俱灭，化为齑粉！`,
        `苍帝立于天庭废墟之巅，声音森寒冷漠，带着一股藐视：`,
        `"纵横古今，天上地下无敌，渴求一败而不能，这时你却出现了，但也终究只是一个献祭者！"`,
        `一场恐怖的帝战即将爆发！`
      ],
      "荒天帝": [
        `【时间长河遭遇】`,
        `你逆流而上，在乱古纪元的战场遭遇了独断万古的荒天帝！`,
        `他周身环绕着恐怖的气息，一剑斩断时间长河！`,
        `荒天帝施展他化自在法，瞬间化出三道分身！`,
        `- 一道分身施展草字剑诀，剑气纵横三万里！`,
        `- 一道分身施展鲲鹏宝术，扶摇直上九重天！`,
        `- 一道分身施展雷帝宝术，雷霆万钧震九霄！`,
        `一场跨越时空的巅峰对决即将展开！`
      ],
      "叶天帝": [
        `【时间长河遭遇】`,
        `你在后荒古时代的长河中，遭遇了红尘成仙的叶天帝！`,
        `他拳镇山河，脚踏万道，气势如虹！`,
        `叶天帝施展天帝拳，拳意贯穿古今未来！`,
        `- 斗字秘演化诸天万法，变化无穷！`,
        `- 六道轮回拳打破生死界限，轮回不息！`,
        `- 行字秘踏破时空，快如闪电！`,
        `一场跨越纪元的大战一触即发！`
      ],
      "狠人": [
        `【时间长河遭遇】`,
        `你在荒古时代的岁月长河中，遭遇了才情冠绝古今的狠人大帝！`,
        `她白衣胜雪，面具遮颜，周身环绕飞仙之光！`,
        `狠人大帝施展一念花开，君临天下！`,
        `- 万朵仙葩绽放，每一朵都蕴含绝世杀机！`,
        `- 飞仙诀化作漫天光雨，撕裂时空！`,
        `- 不灭天功运转，万法不侵！`,
        `一场跨越时空的绝世对决即将展开！`
      ],
      "无始": [
        `【时间长河遭遇】`,
        `你在神话时代的尽头，遭遇了仙路尽头的无始大帝！`,
        `他背对众生，无始钟震荡万古！`,
        `无始大帝施展无始无终，时空为之凝固！`,
        `- 无始钟声波震荡，粉碎星辰！`,
        `- 时间法则逆转，过去未来交织！`,
        `- 先天道图镇压诸天！`,
        `一场震撼古今的巅峰对决即将开始！`
      ],
    };
    
    const message = encounterMessages[enemy.名号] || [
      `【时间长河遭遇】`,
      `你在${enemy.era}的长河中，遭遇了${enemy.名号}！`,
      `他展现无上威能，向你袭来！`,
      `一场跨越时空的巅峰对决即将展开！`
    ];
    if (enemy.名号 === '苍帝' && team.length) {
      message.push('【古史异变】苍帝现身的刹那，鸿帝与羽帝同时从相邻时间线踏出，三帝并立！');
      message.push('即使苍帝先一步败退，另外两尊黑暗准仙帝仍会接续出手，直到三帝战阵彻底崩解。');
    }
    return message;
  }
  
  // 发送遭遇消息  // 修改后的发送遭遇消息方法

async sendEncounterMessage(usr_qq, action, message) {
  try {
    const fullMessage = Array.isArray(message) ? message.join('\n') : message;
    
    // 构建消息数组
    const msgArray = [
      segment.at(usr_qq),
      '【时间长河遭遇】',
      fullMessage
    ];
    
    // 创建模拟事件对象
    const mockEvent = {
      reply: async (content) => {
        if (action.group_id) {
          await Bot.pickGroup(action.group_id).sendMsg(content);
        } else {
          await Bot.sendPrivateMsg(usr_qq, content);
        }
      },
      group_id: action.group_id,
      user_id: usr_qq
    };
    
    // 使用 ForwardMsg 发送图片
    await ForwardMsg(mockEvent, msgArray);
    
    // 等待3秒再继续战斗
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch (error) {
    console.error('发送遭遇消息失败:', error);
    
    // 备用方案：私聊发送文本
    const fallbackMessage = [
      '【时间长河遭遇】',
      Array.isArray(message) ? message.join('\n') : message
    ].join('\n');
    
    await Bot.sendPrivateMsg(usr_qq, fallbackMessage);
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
  calculateScaleFactor(playerLevel) {
    // 基础缩放因子
    let factor = 1.0;
    
    // 境界加成
    if (playerLevel >= 20) {
      factor += (playerLevel - 19) * 0.1;
    }
    
    return factor;
  }
  
  generateResultMessage(player, enemy, battleResult) {
    let message = [];
    
    // 添加战斗过程摘要
    message.push(`【战斗结果】`);
    message.push(`战斗过程：`);
    
    // 添加战斗关键回合
    if (Array.isArray(battleResult.msg)) message.push(...battleResult.msg);
    
    // 添加结果
    if (battleResult.outcome === 'victory') {
      message.push(this.getVictoryMessage(enemy));
    } else if (battleResult.outcome === 'defeat') {
      if (battleResult.specialEvents.rescueWindow) {
        message.push(this.getDefeatMessage(enemy));
        if (battleResult.specialEvents.willowGuardian) {
          message.push(...this.getWillowGuardianMessage(player));
        }
        message.push('【帝血待援】肉身与元神被打散，十分钟内真身被钉在败亡节点，无法进行任何行动。');
        message.push('同灵根且至少一条额外体系成仙的玩家，可用“#献祭魂与血 @你”献祭救援；逾时将开始炼化道果。');
      } else if (battleResult.specialEvents.darkSuppression) {
        message.push(...this.getDarkSuppressionMessage());
      } else if (battleResult.specialEvents.pastBodyExposed) {
        message.push(...this.getPastBodyExposedMessage());
      } else {
        message.push(this.getDefeatMessage(enemy));
      }

      // 仙帝豁免提示
      if (hasRealmAuthority(player, 21)) {
        message.push('【仙帝之威】');
        message.push('你身为诸天至高的路尽级仙帝，早已超越永恒凌驾诸世间，一证永证，统御了自身所有的时间线');
        message.push('厄土仙帝根本无法探寻你的跟脚，更谈何推演并打灭你的过去身呢？');
      }
    } else {
      message.push(this.getDrawMessage(enemy));
    }
    if (battleResult.specialEvents.futureRescue) {
      message.push('【下游救场】你虽败于七尊黑暗身影，时间长河下游的遮天三人组已逆流而来，将你从炼化边缘救出；本阶段不触发炼化。');
    }
    if (battleResult.specialEvents.huangTeaching) {
      const teach = battleResult.specialEvents.huangTeaching;
      message.push(`【荒天帝赏识】荒天帝点头轻笑，传授${teach.name}一丝真意（${teach.gained}点，累计${teach.progress}/30）。`);
      message.push(teach.desc);
      if (teach.mastered) message.push(`【真意圆满】${teach.name}已掌握完整技能。`);
    }
    // 神胎护道：已结出神胎的准仙帝以神胎道韵弹开厄土仙帝的推演
    if (battleResult.specialEvents.pastBodyResisted) {
      message.push('【神胎护道】');
      message.push('你已结出神胎，自身之道圆满无缺，厄土仙帝的推演被神胎道韵弹开！');
      message.push('过去身安然无恙，未受任何损伤。');
    }
    if (battleResult.specialEvents.pastBodyTalismanResisted) {
      message.push('【诸世无痕符】');
      message.push('无痕符燃尽自身，截断厄土仙帝对过去身的推演；纳戒、境界与过去时间线均未受损。');
    }
    for (const [name, gained] of Object.entries(battleResult.proficiencyGains || {})) {
      message.push(`功法参悟：${formatGongfaProficiency(player, name)}（+${gained}）`);
    }
    
    if (battleResult.specialEvents.fashanDefeated) {
      message.push('【法身败退】本次只损耗法身气血，真身行动、血量与过去时间线保持原状；低血量时下次探索可消耗起死回生丹恢复法身。');
    }
    // 添加特殊事件详细描述
if (battleResult.specialEvents.pastBodyExposed && battleResult.penalties.pastBodyExposed) {
  const { lostItems, reductionLvl, worldlineCollapse } = battleResult.penalties.pastBodyExposed;
  
  message.push(`【厄土仙帝推演】`);
  message.push(`厄土仙帝锁定到你的气机推演出你的过去身，一缕眸光跨越万古斩来！`);
  message.push(`你的过去身被灭杀，导致：`);
  message.push(`- 炼气等级: ${reductionLvl.originalLevel} → ${reductionLvl.newLevel} (扣除 ${reductionLvl.penalties.levelPenalty}级)`);
  message.push(`- 炼体等级: ${reductionLvl.originalPhysique} → ${reductionLvl.newPhysique} (扣除 ${reductionLvl.penalties.physiquePenalty}级)`);
  
  if (lostItems.length > 0) {
    message.push(`- 丢失纳戒物品: ${lostItems.map(item => `${item.name} x${item.quantity}`).join(", ")}`);
  } else {
    message.push(`- 幸运的是，你的纳戒未受损失！`);
  }
  if (worldlineCollapse?.destroyed) {
    message.push(`- 古史道崩：${worldlineCollapse.slot}【${worldlineCollapse.name}】的既定事实被抹去！`);
  }
}
    
    if (battleResult.specialEvents.darkSuppression) {
      message.push(`【黑暗镇压】`);
      message.push(`苍帝将你的元神拘禁镇压，开始炼化你的道果！`);
      message.push(`此过程将持续60分钟！`);
      message.push(`60分钟后解除镇压，但你的境界将跌落一层！`);
      message.push(`在此期间你将无法进行其他行动！`);
      const worldlineCollapse = battleResult.penalties.darkSuppression?.worldlineCollapse;
      if (worldlineCollapse?.destroyed) {
        message.push(`【古史道崩】${worldlineCollapse.slot}【${worldlineCollapse.name}】的过去锚点已被厄土仙帝打灭，现世持有事实随之消失！`);
      } else {
        message.push(`【古史道崩】厄土仙帝已打灭一条过去时间线，玩家道果留下时间线创伤。`);
      }
    }
    
    // 添加纪元积累信息
    message.push(`【纪元积累】`);
    if (battleResult.eraAccumulationChange > 0) {
      message.push(`你在时间长河中的感悟加深，纪元积累 +${battleResult.eraAccumulationChange}`);
      
      // 特殊敌人额外奖励提示
      if (enemy.名号 === "荒天帝") {
        message.push(` 荒天帝战斗奖励按15点纪元积累结算。`);
      }
    }
    message.push(`当前纪元积累：${battleResult.newEraAccumulation}/${battleResult.eraAccumulationCap}`);
    
    // 时代加成提示
    if (enemy.era === 0 || enemy.era === 1) {
      message.push(`（${enemy.era === 0 ? '神话' : '太古'}时代感悟效率提升）`);
    } else if (enemy.era === 4) {
      message.push(`（绝灵时代感悟效率降低）`);
    }

    return message.join('\n');
  }
  
  /** 苍鸿羽三帝战败彩蛋 */
  getWillowGuardianMessage(player) {
    return [
      '【柳神·小塔护道】',
      `苍、鸿、羽三帝合击，将${player.名号}打落时间长河，羽帝已执弑帝战矛追杀而至！`,
      '焦黑柳树横断古今，小塔随之崩解塔身，将准仙帝火与残存帝骨熔入柳神法相。',
      '柳神燃尽万古道行，独自托住羽帝，为你守住最后十分钟的献祭时机。',
      '火光熄灭，柳叶凋零。柳神最终身灭道消，只余一截焦黑柳枝钉在破碎的时间长河中。',
    ];
  }

  /** 黑暗镇压消息 */
  getDarkSuppressionMessage() {
    return [
      `【黑暗准仙帝之威】`,
      `你败给了苍帝，肉身炸开，元神想要遁逃！`,
      `苍帝眸中寒光一闪，`,
      `只见他抬手间：`,
      `- 黑暗符文交织，化作不朽牢笼`,
      `- 准仙帝伟力镇压而下，禁锢你的元神`,
      `- 时间长河被截断，逃无可逃！`,
      `苍帝将你的元神拘禁镇压，`,
      `以恐怖的准仙帝伟力炼化你的道果！`,
      `你一身苦修的通天修为被不断炼化，道果在黑暗中枯萎...`,
      `此乃黑暗准仙帝之威！`,
      `【系统警告】`,
      `你的元神被镇压，将在60分钟后解除！`,
      `解除后你的境界将跌落一层！`
    ];
  }
  
  /** 过去身暴露消息 */
  getPastBodyExposedMessage() {
    return [
      `【万古推演·过去身暴露】`,
      `战斗败北之际，一缕恐怖的眸光跨越时间长河投来！`,
      `厄土仙帝端坐黑暗尽头，冷冷开口：`,
      `"你逃得掉今日，却逃不过过去！"`,
      `"推演万古，斩你过去身！"`,
      `帝念扫过时间长河上游，定位了你的过去身！`,
      `- 一缕眸光斩断时空因果`,
      `- 你弱小时的过去身瞬间被击杀`,
      `厄土仙帝隔着万古出手，`,
      `此战虽未直接伤你性命，但导致你：`,
      `- 部分纳戒物品遗失（被过去身携带）`,
      `- 道基受损，炼气炼体境界跌落`,
      `【系统提示】`,
      `厄土仙帝已推演出你的过去身，造成严重惩罚！`
    ];
  }
  
  getVictoryMessage(enemy) {
    const victoryMessages = [
      `你与${enemy.名号}在错乱古史中血战至这一阶段终结，最终险胜！`,
      `跨越时空的对决中，你以微弱优势战胜了${enemy.名号}！`,
      `在${enemy.era}的战场上，你成功击败了${enemy.名号}的投影！`,
      `时间长河见证了你与${enemy.名号}的巅峰对决，最终你技高一筹！`,
      `面对${enemy.名号}的无上威能，你爆发潜力，险胜一筹！`
    ];
    return victoryMessages[Math.floor(Math.random() * victoryMessages.length)];
  }

  getDefeatMessage(enemy) {
    const defeatMessages = [
      `面对${enemy.名号}的无上威能，你终究不敌！`,
      `在时间长河的激流中，你被${enemy.名号}的强大力量击退！`,
      `跨越时空的对决，你未能战胜${enemy.名号}的威名！`,
      `时间长河见证了你与${enemy.名号}的巅峰对决，最终你惜败！`,
      `面对${enemy.名号}的绝世神通，你虽败犹荣！`
    ];
    return defeatMessages[Math.floor(Math.random() * defeatMessages.length)];
  }

  getDrawMessage(enemy) {
    const drawMessages = [
      `你与${enemy.名号}战至时间长河尽头，不分胜负！`,
      `跨越时空的对决以平局收场，双方都未能在对方身上取得优势！`,
      `在时间长河的见证下，你与${enemy.名号}平分秋色！`,
      `时间长河奔流不息，你与${enemy.名号}的战斗难分高下！`,
      `这场跨越时空的对决最终以平局收场，双方都展现了无上风采！`
    ];
    return drawMessages[Math.floor(Math.random() * drawMessages.length)];
  }
  

  
  calculateLevelBonus(playerLevel) {
    // 基础加成
    let bonus = 1.0;
    
    // 境界加成
    if (playerLevel >= 20) {
      bonus += (playerLevel - 19) * 0.05;
    }
    
    return bonus;
  }
  

  // 修改后的发送结果消息方法
async sendResultMessage(usr_qq, action, resultMessage) {
  try {
    // 创建模拟事件对象
    const mockEvent = {
      reply: async (content) => {
        if (action.group_id) {
          await Bot.pickGroup(action.group_id).sendMsg([segment.at(usr_qq), content]);
        } else {
          await Bot.sendPrivateMsg(usr_qq, content);
        }
      },
      group_id: action.group_id,
      user_id: usr_qq
    };
    
    // 长战报完整分页，避免图片过高或截断中间战斗过程。
    const lines = String(resultMessage || '').split('\n');
    const pageSize = 60;
    const pageCount = Math.max(1, Math.ceil(lines.length / pageSize));
    for (let index = 0; index < pageCount; index++) {
      const title = pageCount > 1
        ? `【时间长河探索结果 ${index + 1}/${pageCount}】`
        : '【时间长河探索结果】';
      const page = lines.slice(index * pageSize, (index + 1) * pageSize);
      await ForwardMsg(mockEvent, [title, ...page]);
      if (index < pageCount - 1) await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('发送结果消息失败:', error);
    
    const fallbackMessage = [
      '【时间长河探索结果】',
      resultMessage
    ].join('\n');
    if (action.group_id) {
      await Bot.pickGroup(action.group_id).sendMsg([segment.at(usr_qq), fallbackMessage]);
    } else {
      await Bot.sendPrivateMsg(usr_qq, fallbackMessage);
    }
  }
}

}

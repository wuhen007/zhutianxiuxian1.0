import { plugin, verc, data, config } from '../../api/api.js';
import { hasRealmAuthority } from '../../model/realmAuthority.js';
import { TIME_RIVER_PHASE_DURATION_MS } from '../../model/timeRiverAdversary.js';
import { isTimeRiverLocation, PLACE_LOCATION_MAP } from '../../model/weimianTravel.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { getFashanActionKey, isFashanActionPending, isFashanReady, requireActorAtPlane } from '../../model/fashanProxy.js';
import { buildPlaneDestroyedMessage, getPlaneDestructionInfo } from '../../model/planeDestruction.js';

import {
  Read_player,
  existplayer,
  isNotNull,
  sleep,
  exist_najie_thing,
  Add_najie_thing,

} from '../../model/xiuxian.js';

import {
  Add_灵石,
  Add_修为,
   Add_血气,
   Add_寿元,
  exist_hunyin,
  find_qinmidu,
  add_qinmidu,
  Goweizhi,
   Write_player,
  xunbaoweizhi,
  Go,
  channel,
  Add_renwu_progress,
} from '../../model/xiuxian.js';
import Show from "../../model/show.js";
import puppeteer from "../../../../lib/puppeteer/puppeteer.js";
export class shijianchanghe extends plugin {
  constructor() {
    super({
      name: 'Yunzai_Bot_shijianchanghe',
      dsc: '时间长河模块',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#组队时间长河$', fnc: 'createTimeRiverTeam' },
        { reg: '^#加入时间长河队伍\\s*\\d{6}$', fnc: 'joinTimeRiverTeam' },
        { reg: '^#(?:查看)?时间长河队伍$', fnc: 'viewTimeRiverTeam' },
        { reg: '^#退出时间长河队伍$', fnc: 'leaveTimeRiverTeam' },
        { reg: '^#解散时间长河队伍$', fnc: 'disbandTimeRiverTeam' },
        { reg: '^#组队遨游时间长河$', fnc: 'startTeamTimeRiver' },
        { reg: '^#遨游时间长河$', fnc: 'roamTimeRiver' },
        { reg: '^#法身遨游时间长河$', fnc: 'roamFashanTimeRiver' },
      ],
    });
  }

  teamKey(id) {
    return `xiuxian:time_river:team:${id}`;
  }

  playerTeamKey(qq) {
    return `xiuxian:time_river:player_team:${qq}`;
  }

  async getQq(e) {
    return String(await channel(String(e.user_id).replace('qg_', '')));
  }

  async getTimeRiverTeam(qq) {
    const teamId = await redis.get(this.playerTeamKey(qq));
    if (!teamId) return null;
    const raw = await redis.get(this.teamKey(teamId));
    if (!raw) {
      await redis.del(this.playerTeamKey(qq));
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      await redis.del(this.playerTeamKey(qq));
      return null;
    }
  }

  async saveTimeRiverTeam(team) {
    await redis.set(this.teamKey(team.id), JSON.stringify(team), 'EX', 24 * 60 * 60);
    await Promise.all(team.members.map(qq => (
      redis.set(this.playerTeamKey(qq), team.id, 'EX', 24 * 60 * 60)
    )));
  }

  async withTimeRiverTeamLock(operation) {
    return withPlayerMutationLock('time-river-team-index', operation);
  }

  async requireQuasiEmperor(e, qq) {
    if (!await existplayer(qq)) {
      await e.reply('请先创建修仙角色。');
      return null;
    }
    const player = await Read_player(qq);
    if (!hasRealmAuthority(player, 20)) {
      await e.reply('组队踏入时间长河，成员仍须拥有准仙帝及以上权柄。');
      return null;
    }
    return player;
  }

  async createTimeRiverTeam(e) {
    if (!e.isGroup || !verc({ e })) return false;
    const qq = await this.getQq(e);
    const player = await this.requireQuasiEmperor(e, qq);
    if (!player) return false;

    return this.withTimeRiverTeamLock(async () => {
      const existing = await this.getTimeRiverTeam(qq);
      if (existing) return e.reply(`你已在时间长河队伍【${existing.id}】中。`);
      let id;
      do {
        id = String(Math.floor(100000 + Math.random() * 900000));
      } while (await redis.get(this.teamKey(id)));
      const team = {
        id,
        leader: qq,
        members: [qq],
        status: 'recruiting',
        groupId: e.group_id,
        createdAt: Date.now(),
      };
      await this.saveTimeRiverTeam(team);
      return e.reply([
        '【时间长河·帝者结盟】',
        `${player.名号}以准仙帝道果锚定一处古史坐标。`,
        `队伍编号：${id}｜当前人数：1/4`,
        `加入：#加入时间长河队伍 ${id}`,
        '集齐至少两人后，由队长发送 #组队遨游时间长河。',
      ].join('\n'));
    });
  }

  async joinTimeRiverTeam(e) {
    if (!e.isGroup || !verc({ e })) return false;
    const qq = await this.getQq(e);
    const player = await this.requireQuasiEmperor(e, qq);
    if (!player) return false;
    const teamId = e.msg.match(/(\d{6})$/)?.[1];

    return this.withTimeRiverTeamLock(async () => {
      if (await this.getTimeRiverTeam(qq)) return e.reply('你已经加入了其他时间长河队伍。');
      const raw = await redis.get(this.teamKey(teamId));
      if (!raw) return e.reply('这个时间长河队伍不存在或已经失效。');
      const team = JSON.parse(raw);
      if (team.status !== 'recruiting') return e.reply('这支队伍已经踏入时间长河，古史坐标现已封闭。');
      if (team.members.length >= 4) return e.reply('时间长河队伍最多容纳四位准仙帝。');
      team.members.push(qq);
      await this.saveTimeRiverTeam(team);
      return e.reply(`【帝者入列】${player.名号}加入队伍【${team.id}】，当前${team.members.length}/4人。`);
    });
  }

  async viewTimeRiverTeam(e) {
    const qq = await this.getQq(e);
    const team = await this.getTimeRiverTeam(qq);
    if (!team) return e.reply('你当前没有时间长河队伍。');
    const members = await Promise.all(team.members.map(async id => ({ id, player: await Read_player(id) })));
    return e.reply([
      `【时间长河队伍·${team.id}】`,
      `状态：${team.status === 'exploring' ? '横渡古史中' : '招募中'}｜人数：${members.length}/4`,
      ...members.map(({ id, player }) => `${id === team.leader ? '【队长】' : '【成员】'}${player.名号}`),
      team.status === 'recruiting' && qq === team.leader ? '发起：#组队遨游时间长河' : '',
    ].filter(Boolean).join('\n'));
  }

  async leaveTimeRiverTeam(e) {
    const qq = await this.getQq(e);
    return this.withTimeRiverTeamLock(async () => {
      const team = await this.getTimeRiverTeam(qq);
      if (!team) return e.reply('你当前没有时间长河队伍。');
      if (team.status === 'exploring') return e.reply('真身已被古史节点锁定，探索结束前不可退出队伍。');
      team.members = team.members.filter(id => id !== qq);
      await redis.del(this.playerTeamKey(qq));
      if (!team.members.length) {
        await redis.del(this.teamKey(team.id));
        return e.reply('你已退出，时间长河队伍随之解散。');
      }
      if (team.leader === qq) team.leader = team.members[0];
      await this.saveTimeRiverTeam(team);
      return e.reply(`你已退出时间长河队伍【${team.id}】。`);
    });
  }

  async disbandTimeRiverTeam(e) {
    const qq = await this.getQq(e);
    return this.withTimeRiverTeamLock(async () => {
      const team = await this.getTimeRiverTeam(qq);
      if (!team) return e.reply('你当前没有时间长河队伍。');
      if (team.leader !== qq) return e.reply('只有队长可以解散时间长河队伍。');
      if (team.status === 'exploring') return e.reply('真身已踏入时间长河，探索结束前不可解散。');
      await Promise.all(team.members.map(id => redis.del(this.playerTeamKey(id))));
      await redis.del(this.teamKey(team.id));
      return e.reply(`时间长河队伍【${team.id}】已经解散。`);
    });
  }

  async startTeamTimeRiver(e) {
    if (!e.isGroup || !verc({ e })) return false;
    const qq = await this.getQq(e);
    return this.withTimeRiverTeamLock(async () => {
      const team = await this.getTimeRiverTeam(qq);
      if (!team) return e.reply('请先使用 #组队时间长河 创建队伍。');
      if (team.leader !== qq) return e.reply('只有队长可以锚定古史并发起探索。');
      if (team.status !== 'recruiting') return e.reply('队伍已经在时间长河中。');
      if (team.members.length < 2 || team.members.length > 4) return e.reply('组队探索需要2至4位准仙帝。');

      const ids = [...team.members].map(String).sort();
      const lock = index => index >= ids.length
        ? this.startTeamTimeRiverLocked(e, team)
        : withPlayerMutationLock(ids[index], () => lock(index + 1));
      return lock(0);
    });
  }

  async startTeamTimeRiverLocked(e, team) {
    const now = Date.now();
    const players = [];
    for (const id of team.members) {
      if (!await existplayer(id)) return e.reply(`成员${id}的修仙存档不存在。`);
      const player = await Read_player(id);
      if (!hasRealmAuthority(player, 20)) return e.reply(`成员【${player.名号}】尚未达到准仙帝。`);
      if (!isTimeRiverLocation(player.power_place)) {
        return e.reply(`成员【${player.名号}】当前不在时间长河，请先使用 #穿梭时间长河。`);
      }
      const rawAction = await redis.get(`xiuxian:player:${id}:action`);
      if (rawAction) {
        try {
          const action = JSON.parse(rawAction);
          if (!action.end_time || Number(action.end_time) > now) return e.reply(`成员【${player.名号}】正在${action.action}中。`);
        } catch {
          return e.reply(`成员【${player.名号}】的行动状态异常，请先结束当前行动。`);
        }
      }
      players.push({ id, player });
    }

    const endTime = now + TIME_RIVER_PHASE_DURATION_MS;
    const action = {
      action: '组队遨游时间长河',
      start_time: now,
      end_time: endTime,
      time: TIME_RIVER_PHASE_DURATION_MS,
      shutup: '1', working: '1', Place_action: '1', Place_actionplus: '1',
      power_up: '1', mojie: '1', xijie: '1', plant: '1', mine: '1', time_river: '0',
      group_id: e.group_id,
      timeRiverTeamId: team.id,
      timeRiverLeader: team.leader,
      timeRiverTeamMembers: [...team.members],
    };
    for (const { id, player } of players) {
      await Write_player(id, player);
      await redis.set(`xiuxian:player:${id}:action`, JSON.stringify(action));
      await redis.set(`xiuxian:time_river:end_time:${id}`, endTime);
      await Add_renwu_progress(id, 'jilu3');
    }
    team.status = 'exploring';
    team.startedAt = now;
    await this.saveTimeRiverTeam(team);
    await withPlayerMutationLock('time-river-active-index', async () => {
      let active = [];
      try {
        active = JSON.parse(await redis.get('xiuxian:time_river:active_players') || '[]').map(String);
      } catch {}
      if (!active.includes(team.leader)) active.push(team.leader);
      await redis.set('xiuxian:time_river:active_players', JSON.stringify(active));
    });
    return e.reply([
      '【四帝横渡·共赴古史】',
      `${players.map(item => item.player.名号).join('、')}同时踏入时间长河！`,
      '队伍已被同一古史节点锁定，首段探索将在15分钟后统一结算。',
    ].join('\n'));
  }

  async roamFashanTimeRiver(e) {
    if (!verc({ e })) return false;
    const userId = await this.getQq(e);
    if (!await existplayer(userId)) return e.reply('请先创建修仙角色。');
    return withPlayerMutationLock(userId, async () => {
      const player = await Read_player(userId);
      if (Number(player.法身) !== 1) return e.reply('请先凝聚无上法身。');
      if (!hasRealmAuthority(player, 20)) return e.reply('法身遨游时间长河需要准仙帝及以上权柄。');
      if (!requireActorAtPlane(player, PLACE_LOCATION_MAP.时间长河, 'fashan').ok) {
        return e.reply('请先使用 #法身穿梭 时间长河，让法身抵达时间长河。');
      }
      if (getPlaneDestructionInfo(data.filePathMap.weimianList, '时间长河').destroyed) {
        return e.reply(buildPlaneDestroyedMessage(data.filePathMap.weimianList, '时间长河'));
      }
      if (Number(player.法身恢复时间) > Date.now()) return e.reply('法身正在恢复中，请待恢复后再遨游。');
      const actionKey = getFashanActionKey(userId);
      const raw = await redis.get(actionKey);
      if (raw) {
        try {
          const active = JSON.parse(raw);
          if (isFashanActionPending(active)) return e.reply(`法身正在${active.action || '代行'}中，请等待结算。`);
        } catch {
          return e.reply('法身行动记录异常，请先修复该记录。');
        }
      }
      if (!isFashanReady(player)) return e.reply('法身当前已有代行行动，请等待结算。');
      const now = Date.now();
      const action = {
        taskId: `fashan-time-river:${userId}:${now}`,
        action: '遨游时间长河',
        actor: 'fashan',
        isFashan: true,
        actorPlane: PLACE_LOCATION_MAP.时间长河,
        法身位置: PLACE_LOCATION_MAP.时间长河,
        start_time: now,
        end_time: now + TIME_RIVER_PHASE_DURATION_MS,
        time: TIME_RIVER_PHASE_DURATION_MS,
        time_river: '0',
        Place_action: '1',
        Place_actionplus: '1',
        ...(e.isGroup ? { group_id: e.group_id } : {}),
      };
      player.法身状态 = '行动中';
      player.法身行动 = '遨游时间长河';
      await Write_player(userId, player);
      await redis.set(actionKey, JSON.stringify(action));
      await withPlayerMutationLock('time-river-active-index', async () => {
        const key = 'xiuxian:time_river:active_players:fashan';
        let active = [];
        try {
          const parsed = JSON.parse(await redis.get(key) || '[]');
          if (Array.isArray(parsed)) active = parsed.map(String);
        } catch {}
        if (!active.includes(userId)) active.push(userId);
        await redis.set(key, JSON.stringify(active));
      });
      await Add_renwu_progress(userId, 'jilu3');
      return e.reply('【法身遨游时间长河】法身已逆流而上，首段探索15分钟后结算；真身保持原有行动。本玩法仅开放单次出发，帝战后续阶段仍按原规则推进。');
    });
  }

  //遨游时间长河
    async roamTimeRiver(e) {
      if (!verc({ e })) return false;
      let usr_qq = e.user_id.toString().replace('qg_','');
      usr_qq = await channel(usr_qq);
      if (!await existplayer(usr_qq)) return false;
      const existingTeam = await this.getTimeRiverTeam(usr_qq);
      if (existingTeam) {
        return e.reply(`你已在时间长河队伍【${existingTeam.id}】中，请由队长使用 #组队遨游时间长河。`);
      }
      let player = await Read_player(usr_qq);
      if (!isTimeRiverLocation(player.power_place)) {
        return e.reply('遨游时间长河必须先身处时间长河，请先使用 #穿梭时间长河。');
      }
      // 检查是否可以前往
      const flag = await Go(e);
      if (!flag) {
        return false;
      }
  if (!hasRealmAuthority(player, 20)) {
      const replyMsg = [
          `【时间长河·禁忌之地】`,
          `时间长河！任何低阶生灵都不能遥望的古史禁忌！`,
          `每一滴水珠都承载着一个纪元的兴衰，`,
          `每一道涟漪都映射着帝落时代的血与火！`,
          `因果之力交织如网，命运长线缠绕如茧！`,
          `逆流而上者，将直面古史中的至强者，`,
          `顺流而下者，将窥见未来大世的杀劫！`,
          `曾有仙王巨头欲窥时间长河奥秘，`,
          `却被一道眸光斩断万古，真灵永坠轮回！`,
          `此乃诸天禁忌之首，万道不存之地！`,
          `非准仙帝不可踏足，非祭道不可窥全貌！`,
          `以道友目前境界，涉足时间长河顷刻间便会：`,
          `因果反噬！真名蒙尘！道果崩解！`,
          `待你凝聚准仙帝道果，再来探寻这时空秘辛！`,
      ].join('\n');
      e.reply(replyMsg);
      return false;
  }
  
    await Write_player(usr_qq, player);
      let action_time = TIME_RIVER_PHASE_DURATION_MS;
      let arr = {
        action: '遨游时间长河', //动作
       end_time: new Date().getTime() + action_time,//结束时间
        time: action_time, //持续时间
        shutup: '1', //闭关
        working: '1', //降妖
        Place_action: '1', //秘境状态---开启
        Place_actionplus: '1', //沉迷秘境状态---关闭
        power_up: '1', //渡劫状态--关闭
        mojie: '1', //魔界状态---关闭
        xijie: '1', //洗劫状态开启
        plant: '1', //采药-开启
        mine: '1', //采矿-开启
        time_river: '0',  
      };
      if (e.isGroup) {
        arr.group_id = e.group_id;
      }
      let A = e.user_id;
      A=await channel(A)
      await Add_renwu_progress(A, 'jilu3');
       await redis.set(`xiuxian:time_river:end_time:${usr_qq}`, arr.end_time);
  await withPlayerMutationLock('time-river-active-index', async () => {
    const activePlayers = await redis.get('xiuxian:time_river:active_players') || '[]';
    let playersList = [];
    try {
      const parsed = JSON.parse(activePlayers);
      if (Array.isArray(parsed)) playersList = parsed.map(String);
    } catch {
      playersList = [];
    }
    if (!playersList.includes(usr_qq)) playersList.push(usr_qq);
    await redis.set('xiuxian:time_river:active_players', JSON.stringify(playersList));
  });
  await redis.set('xiuxian:player:' + usr_qq + ':action', JSON.stringify(arr));
       // 回复玩家
      e.reply([
          `你的真身踏入了时间长河，逆流而上！`,
          `首段探索将在15分钟后结束，请耐心等待。`
      ].join('\n'));
      
      return true;
  }
}

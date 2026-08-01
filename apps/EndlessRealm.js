import { plugin } from '../api/api.js';
import {
  Add_najie_thing,
  Read_player,
  Write_player,
  channel,
  exist_najie_thing,
  existplayer,
} from '../model/xiuxian.js';
import {
  applyEndlessChoice,
  createEndlessRun,
  getAbility,
  getFusion,
  getMemberStats,
  getSettlement,
  getWorldForLayer,
  resolveEndlessLayer,
} from '../model/endlessRealm.js';

const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 12;
const MAX_TEAM_SIZE = 4;
const ENTRY_ITEM = '无尽秘钥';

export class EndlessRealm extends plugin {
  constructor() {
    super({
      name: '无尽劫境',
      dsc: '组队肉鸽式诸天无尽副本',
      event: 'message',
      priority: 580,
      rule: [
        { reg: '^#无尽劫境(?:帮助)?$', fnc: 'showHelp' },
        { reg: '^#创建无尽队伍$', fnc: 'createTeam' },
        { reg: '^#加入无尽队伍\\s*\\d{6}$', fnc: 'joinTeam' },
        { reg: '^#无尽队伍$', fnc: 'showTeam' },
        { reg: '^#离开无尽队伍$', fnc: 'leaveTeam' },
        { reg: '^#解散无尽队伍$', fnc: 'disbandTeam' },
        { reg: '^#开启无尽劫境$', fnc: 'startRun' },
        { reg: '^#无尽选择\\s*[1-3]$', fnc: 'chooseAbility' },
        { reg: '^#无尽(?:下一关|下一层|挑战)$', fnc: 'nextLayer' },
        { reg: '^#无尽构筑$', fnc: 'showBuild' },
        { reg: '^#无尽撤离$', fnc: 'withdrawRun' },
      ],
    });
  }

  teamKey(id) {
    return `Xiuxian:Endless:Team:${id}`;
  }

  playerKey(id) {
    return `Xiuxian:Endless:Player:${id}`;
  }

  runKey(teamId) {
    return `Xiuxian:Endless:Run:${teamId}`;
  }

  lockKey(scope) {
    return `Xiuxian:Endless:Lock:${scope}`;
  }

  async getUserId(e) {
    const raw = e.user_id.toString().replace('qg_', '');
    return await channel(raw);
  }

  async checkPlayer(e) {
    if (!e.isGroup) {
      await e.reply('无尽劫境只能在群聊中进行');
      return null;
    }
    const userId = await this.getUserId(e);
    if (!(await existplayer(userId))) {
      await e.reply('请先发送【创建角色】');
      return null;
    }
    return userId;
  }

  async saveTeam(team) {
    await redis.set(this.teamKey(team.id), JSON.stringify(team), {
      EX: STATE_TTL_SECONDS,
    });
    await Promise.all(
      team.members.map((id) =>
        redis.set(this.playerKey(id), team.id, { EX: STATE_TTL_SECONDS })
      )
    );
  }

  async getTeam(teamId) {
    const raw = await redis.get(this.teamKey(teamId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      await redis.del(this.teamKey(teamId));
      return null;
    }
  }

  async saveRun(run) {
    await redis.set(this.runKey(run.teamId), JSON.stringify(run), {
      EX: STATE_TTL_SECONDS,
    });
  }

  async getRun(teamId) {
    const raw = await redis.get(this.runKey(teamId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      await redis.del(this.runKey(teamId));
      return null;
    }
  }

  async getPlayerTeam(userId) {
    const teamId = await redis.get(this.playerKey(userId));
    if (!teamId) return null;
    const team = await this.getTeam(teamId);
    if (team) return team;
    await redis.del(this.playerKey(userId));
    return null;
  }

  async withLock(e, scope, action) {
    const key = this.lockKey(scope);
    const token = `${Date.now()}:${Math.random()}`;
    const acquired = Boolean(
      await redis.set(key, token, { EX: LOCK_TTL_SECONDS, NX: true })
    );
    if (!acquired) return e.reply('无尽劫境正在推演，请勿重复操作');
    try {
      return await action();
    } finally {
      if ((await redis.get(key)) === token) await redis.del(key);
    }
  }

  async generateTeamId() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const id = String(Math.floor(100000 + Math.random() * 900000));
      if (!(await redis.get(this.teamKey(id)))) return id;
    }
    throw new Error('暂时无法生成队伍编号');
  }

  async clearTeam(team) {
    await Promise.all([
      redis.del(this.teamKey(team.id)),
      redis.del(this.runKey(team.id)),
      ...team.members.map((id) => redis.del(this.playerKey(id))),
    ]);
  }

  formatAmount(value) {
    const amount = Math.max(0, Math.round(Number(value) || 0));
    if (amount >= 100000000) return `${(amount / 100000000).toFixed(2)}亿`;
    if (amount >= 10000) return `${(amount / 10000).toFixed(2)}万`;
    return String(amount);
  }

  statusText(status) {
    return (
      {
        lobby: '招募中',
        running: '劫境探索中',
      }[status] || status
    );
  }

  isTeamGroup(e, team) {
    return team.groupId === String(e.group_id);
  }

  stageText(stage) {
    return { normal: '怪潮', elite: '精英', boss: '位面Boss' }[stage] || stage;
  }

  formatChoices(run, memberId) {
    const member = run.members[memberId];
    const choices = run.pendingChoices?.[memberId];
    if (!member || !choices) return [];
    return [
      `【${member.name}的能力选择】`,
      ...choices.map((abilityId, index) => {
        const ability = getAbility(abilityId);
        const owned = member.abilities?.[abilityId] || 0;
        const level = owned ? ` 当前${owned}级` : '';
        return `${index + 1}. [${ability.rarity}] ${ability.name}${level}\n   ${
          ability.description
        }`;
      }),
      `${member.name}发送 #无尽选择1/2/3`,
    ];
  }

  formatAllChoices(run) {
    return Object.keys(run.pendingChoices || {}).flatMap((id) =>
      this.formatChoices(run, id)
    );
  }

  async showHelp(e) {
    if (!e.isGroup) return e.reply('无尽劫境只能在群聊中进行');
    const userId = await this.getUserId(e);
    if (await existplayer(userId)) {
      const team = await this.getPlayerTeam(userId);
      if (team) {
        if (!this.isTeamGroup(e, team))
          return e.reply('请回到无尽队伍所在群进行操作');
        return this.replyTeamStatus(e, team, userId);
      }
    }
    return e.reply(
      [
        '【诸天无尽劫境·第一版】',
        `1～${MAX_TEAM_SIZE}人组队，每名成员入场消耗【${ENTRY_ITEM}】×1`,
        '每层击退怪潮后独立三选一；每5层精英，每10层位面Boss并封存奖励。',
        '',
        '#创建无尽队伍',
        '#加入无尽队伍 123456',
        '#无尽队伍',
        '#开启无尽劫境',
        '#无尽选择1',
        '#无尽下一关',
        '#无尽构筑',
        '#无尽撤离',
        '',
        '主动撤离保留全部奖励；团灭保留已封存奖励和30%未封存奖励。',
      ].join('\n')
    );
  }

  async createTeam(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return this.withLock(e, `player:${userId}`, async () => {
      if (await this.getPlayerTeam(userId))
        return e.reply('你已经在一个无尽队伍中');
      const id = await this.generateTeamId();
      const player = await Read_player(userId);
      const team = {
        id,
        leader: userId,
        groupId: String(e.group_id),
        members: [userId],
        memberNames: {
          [userId]: player.名号 || `无名修士${String(userId).slice(-4)}`,
        },
        status: 'lobby',
        createdAt: Date.now(),
      };
      await this.saveTeam(team);
      return e.reply(
        [
          '【无尽队伍创建成功】',
          `队伍编号：${id}`,
          `队长：${team.memberNames[userId]}`,
          `成员：1/${MAX_TEAM_SIZE}`,
          `其他玩家发送 #加入无尽队伍 ${id}`,
          `开局时每人消耗【${ENTRY_ITEM}】×1`,
        ].join('\n')
      );
    });
  }

  async joinTeam(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const teamId = e.msg.match(/(\d{6})/)?.[1];
    if (!teamId) return e.reply('格式：#加入无尽队伍 123456');
    return this.withLock(e, `team:${teamId}`, async () => {
      if (await this.getPlayerTeam(userId))
        return e.reply('你已经在一个无尽队伍中');
      const team = await this.getTeam(teamId);
      if (!team) return e.reply('该无尽队伍不存在或已经过期');
      if (team.groupId !== String(e.group_id))
        return e.reply('只能加入本群创建的无尽队伍');
      if (team.status !== 'lobby') return e.reply('该队伍已经进入无尽劫境');
      if (team.members.length >= MAX_TEAM_SIZE)
        return e.reply('该无尽队伍已经满员');

      const player = await Read_player(userId);
      team.members.push(userId);
      team.memberNames[userId] =
        player.名号 || `无名修士${String(userId).slice(-4)}`;
      await this.saveTeam(team);
      return e.reply(
        [
          `【${team.memberNames[userId]}加入无尽队伍】`,
          `队伍编号：${team.id}`,
          `成员：${team.members.length}/${MAX_TEAM_SIZE}`,
          ...team.members.map(
            (id) =>
              `${id === team.leader ? '[队长] ' : ''}${team.memberNames[id]}`
          ),
        ].join('\n')
      );
    });
  }

  async replyTeamStatus(e, team, userId) {
    const run = team.status === 'running' ? await this.getRun(team.id) : null;
    const lines = [
      `【无尽队伍·${team.id}】`,
      `状态：${this.statusText(team.status)}`,
      `成员：${team.members.length}/${MAX_TEAM_SIZE}`,
      ...team.members.map(
        (id) =>
          `${id === team.leader ? '[队长] ' : ''}${team.memberNames[id] || id}`
      ),
    ];
    if (run) {
      const nextWorld = getWorldForLayer(run, run.layer + 1);
      lines.push(
        `当前层数：${run.layer}`,
        `下一位面：${nextWorld.name}`,
        `命火：${run.lifeFire}/${run.maxLifeFire}`,
        `阶段：${
          run.phase === 'choice'
            ? '等待能力选择'
            : run.phase === 'ready'
            ? '可以挑战下一关'
            : run.phase
        }`,
        `已封存：灵石${this.formatAmount(
          run.banked.lingshi
        )} / 修为${this.formatAmount(run.banked.cultivation)}`,
        `未封存：灵石${this.formatAmount(
          run.unbanked.lingshi
        )} / 修为${this.formatAmount(run.unbanked.cultivation)}`
      );
      if (run.pendingChoices?.[userId])
        lines.push('', ...this.formatChoices(run, userId));
    }
    return e.reply(lines.join('\n'));
  }

  async showTeam(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const team = await this.getPlayerTeam(userId);
    if (!team) return e.reply('你不在无尽队伍中，发送 #创建无尽队伍');
    if (!this.isTeamGroup(e, team))
      return e.reply('请回到无尽队伍所在群进行操作');
    return this.replyTeamStatus(e, team, userId);
  }

  async leaveTeam(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current) return e.reply('你不在无尽队伍中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      if (!team) return e.reply('队伍已经不存在');
      if (team.status !== 'lobby')
        return e.reply('进入劫境后不能单独离队，请由队长使用 #无尽撤离');
      team.members = team.members.filter((id) => id !== userId);
      delete team.memberNames[userId];
      await redis.del(this.playerKey(userId));
      if (!team.members.length) {
        await this.clearTeam(team);
        return e.reply('你已离队，空队伍自动解散');
      }
      if (team.leader === userId) team.leader = team.members[0];
      await this.saveTeam(team);
      return e.reply(
        `你已离开无尽队伍，新队长为${team.memberNames[team.leader]}`
      );
    });
  }

  async disbandTeam(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current) return e.reply('你不在无尽队伍中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      if (!team) return e.reply('队伍已经不存在');
      if (team.leader !== userId) return e.reply('只有队长可以解散队伍');
      if (team.status !== 'lobby')
        return e.reply('劫境探索中不能解散，请使用 #无尽撤离');
      await this.clearTeam(team);
      return e.reply('无尽队伍已经解散');
    });
  }

  async startRun(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current) return e.reply('请先创建或加入无尽队伍');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      if (!team) return e.reply('队伍已经不存在');
      if (team.leader !== userId) return e.reply('只有队长可以开启无尽劫境');
      if (team.status !== 'lobby') return e.reply('队伍已经进入无尽劫境');

      const missing = [];
      const players = [];
      for (const id of team.members) {
        if (!(await existplayer(id))) {
          missing.push(`${team.memberNames[id]}（角色存档缺失）`);
          continue;
        }
        const amount =
          Number(await exist_najie_thing(id, ENTRY_ITEM, '道具')) || 0;
        if (amount < 1)
          missing.push(`${team.memberNames[id]}（缺少${ENTRY_ITEM}）`);
        players.push({ id, player: await Read_player(id) });
      }
      if (missing.length)
        return e.reply(['【无法开启无尽劫境】', ...missing].join('\n'));

      const run = createEndlessRun({
        teamId: team.id,
        groupId: team.groupId,
        players,
        seed: Date.now() ^ Number(team.id),
      });
      const deducted = [];
      try {
        for (const id of team.members) {
          await Add_najie_thing(id, ENTRY_ITEM, '道具', -1);
          deducted.push(id);
        }
        team.status = 'running';
        team.runId = run.id;
        await this.saveRun(run);
        await this.saveTeam(team);
      } catch (error) {
        const refundFailures = [];
        for (const id of deducted) {
          try {
            await Add_najie_thing(id, ENTRY_ITEM, '道具', 1);
          } catch (refundError) {
            refundFailures.push(team.memberNames[id] || id);
            logger.error(`[无尽劫境] 退还秘钥失败 player=${id}`, refundError);
          }
        }
        try {
          await redis.del(this.runKey(team.id));
        } catch (cleanupError) {
          logger.error('[无尽劫境] 清理失败开局状态异常', cleanupError);
        }
        team.status = 'lobby';
        delete team.runId;
        try {
          await this.saveTeam(team);
        } catch (saveError) {
          logger.error('[无尽劫境] 恢复大厅状态失败', saveError);
        }
        logger.error('[无尽劫境] 开启失败', error);
        return e.reply(
          refundFailures.length
            ? `劫境开启失败；${refundFailures.join(
                '、'
              )}的秘钥退还失败，请联系管理员处理`
            : '劫境开启失败，已退还成功扣除的无尽秘钥'
        );
      }

      const world = getWorldForLayer(run, 1);
      return e.reply(
        [
          '【诸天无尽劫境开启】',
          `全队消耗【${ENTRY_ITEM}】×1`,
          `首个世界：${world.name}`,
          `世界规则：${world.rule}`,
          `共享命火：${run.lifeFire}/${run.maxLifeFire}`,
          '',
          ...this.formatAllChoices(run),
        ].join('\n')
      );
    });
  }

  async chooseAbility(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    const choice = Number(e.msg.match(/[1-3]$/)?.[0]);
    return this.withLock(e, `team:${current.id}`, async () => {
      const run = await this.getRun(current.id);
      if (!run) return e.reply('无尽劫境状态已经失效');
      let result;
      try {
        result = applyEndlessChoice(run, userId, choice);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      const lines = [
        `【${run.members[userId].name}获得能力】`,
        `${result.ability.name} Lv.${result.level}`,
        result.ability.description,
      ];
      for (const fusion of result.newFusions) {
        lines.push('', `诸天共鸣：${fusion.name}`, fusion.description);
      }
      if (result.ready) lines.push('', '全队选择完成，队长可发送 #无尽下一关');
      else
        lines.push(
          '',
          `仍有${Object.keys(run.pendingChoices).length}名成员尚未选择`
        );
      return e.reply(lines.join('\n'));
    });
  }

  formatBattle(run, result) {
    const lines = [
      `【无尽劫境·第${result.layer}层】`,
      `${result.world} · ${this.stageText(result.stage)}`,
      `敌人：${result.enemy} [${result.trait}]`,
      `战斗回合：${result.rounds}`,
      '',
      ...result.logs,
      '',
      '【伤害统计】',
      ...Object.entries(result.damageByMember)
        .filter(([id, value]) => id !== '_fusion' && value > 0)
        .map(
          ([id, value]) =>
            `${run.members[id]?.name || id}：${this.formatAmount(value)}`
        ),
    ];
    if (result.damageByMember._fusion > 0) {
      lines.push(
        `诸天共鸣：${this.formatAmount(result.damageByMember._fusion)}`
      );
    }
    lines.push(
      '',
      result.victory
        ? '怪潮覆灭，队伍继续深入！'
        : '全队投影破碎，无尽劫境宣告终结。'
    );
    if (result.victory) {
      lines.push(
        `命火：${run.lifeFire}/${run.maxLifeFire}`,
        `已封存：灵石${this.formatAmount(
          run.banked.lingshi
        )} / 修为${this.formatAmount(run.banked.cultivation)}`,
        `未封存：灵石${this.formatAmount(
          run.unbanked.lingshi
        )} / 修为${this.formatAmount(run.unbanked.cultivation)}`,
        '',
        ...this.formatAllChoices(run)
      );
    }
    return lines;
  }

  async nextLayer(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    if (current.leader !== userId) return e.reply('只有队长可以推进无尽劫境');
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      const run = await this.getRun(current.id);
      if (!team || !run) return e.reply('无尽劫境状态已经失效');
      if (run.phase === 'choice')
        return e.reply(
          `还有${Object.keys(run.pendingChoices).length}名成员尚未完成能力选择`
        );
      if (run.phase === 'settling') return this.finishSettlement(e, team, run);
      let result;
      try {
        result = resolveEndlessLayer(run);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      const lines = this.formatBattle(run, result);
      if (!result.victory) {
        const settlement = await this.settleRun(team, run, 0.3, 'defeat');
        lines.push('', ...this.formatSettlement(settlement, '团灭结算'));
      }
      return e.reply(lines.join('\n'));
    });
  }

  async showBuild(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const team = await this.getPlayerTeam(userId);
    if (!team || team.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, team))
      return e.reply('请回到无尽队伍所在群进行操作');
    const run = await this.getRun(team.id);
    if (!run) return e.reply('无尽劫境状态已经失效');
    const lines = [`【无尽构筑·第${run.layer}层】`];
    for (const member of Object.values(run.members)) {
      const stats = getMemberStats(run, member.id);
      const abilities = Object.entries(member.abilities || {});
      lines.push(
        '',
        `${member.alive ? '[存活]' : '[残魂]'} ${member.name}`,
        `生命 ${this.formatAmount(member.hp)}/${this.formatAmount(
          stats.maxHp
        )} · 攻击 ${this.formatAmount(stats.attack)} · 防御 ${this.formatAmount(
          stats.defense
        )}`,
        abilities.length
          ? abilities
              .map(([id, level]) => `${getAbility(id)?.name || id}Lv.${level}`)
              .join('、')
          : '尚无能力'
      );
    }
    if (run.fusions.length) {
      lines.push(
        '',
        '【诸天共鸣】',
        ...run.fusions.map((id) => getFusion(id)?.name || id)
      );
    }
    if (run.pendingChoices?.[userId])
      lines.push('', ...this.formatChoices(run, userId));
    return e.reply(lines.join('\n'));
  }

  formatSettlement(settlement, title) {
    if (!settlement.complete) {
      return [
        `【${title}暂未完成】`,
        `已有成员领取：${settlement.paid}/${settlement.total}`,
        '存档写入失败，请队长稍后发送 #无尽撤离 继续结算。',
      ];
    }
    return [
      `【${title}】`,
      `每名成员获得灵石：${this.formatAmount(settlement.reward.lingshi)}`,
      `每名成员获得修为：${this.formatAmount(settlement.reward.cultivation)}`,
      settlement.reward.lostLingshi || settlement.reward.lostCultivation
        ? `未能带出：灵石${this.formatAmount(
            settlement.reward.lostLingshi
          )} / 修为${this.formatAmount(settlement.reward.lostCultivation)}`
        : '全部战利品已经安全带出。',
      `抵达层数：${settlement.layer}`,
    ];
  }

  async settleRun(team, run, retention, reason) {
    if (!run.settlement) {
      run.settlement = {
        id: `${run.id}:${reason}`,
        reason,
        reward: getSettlement(run, retention),
        paidMembers: [],
      };
      run.phase = 'settling';
      await this.saveRun(run);
    }

    for (const id of team.members) {
      if (run.settlement.paidMembers.includes(id)) continue;
      try {
        const player = await Read_player(id);
        const records = Array.isArray(player.无尽劫境结算记录)
          ? player.无尽劫境结算记录
          : [];
        if (!records.includes(run.settlement.id)) {
          player.灵石 =
            (Number(player.灵石) || 0) + run.settlement.reward.lingshi;
          player.修为 =
            (Number(player.修为) || 0) + run.settlement.reward.cultivation;
          player.无尽劫境最高层 = Math.max(
            Number(player.无尽劫境最高层) || 0,
            run.layer
          );
          player.无尽劫境次数 = (Number(player.无尽劫境次数) || 0) + 1;
          player.无尽劫境结算记录 = [...records, run.settlement.id].slice(-30);
          await Write_player(id, player);
        }
        run.settlement.paidMembers.push(id);
        await this.saveRun(run);
      } catch (error) {
        logger.error(`[无尽劫境] 奖励结算失败 player=${id}`, error);
        return {
          complete: false,
          paid: run.settlement.paidMembers.length,
          total: team.members.length,
          reward: run.settlement.reward,
          layer: run.layer,
        };
      }
    }

    const result = {
      complete: true,
      paid: team.members.length,
      total: team.members.length,
      reward: run.settlement.reward,
      layer: run.layer,
    };
    await this.clearTeam(team);
    return result;
  }

  async finishSettlement(e, team, run) {
    const result = await this.settleRun(
      team,
      run,
      run.settlement?.reason === 'defeat' ? 0.3 : 1,
      run.settlement?.reason || 'withdraw'
    );
    return e.reply(this.formatSettlement(result, '无尽劫境结算').join('\n'));
  }

  async withdrawRun(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    if (current.leader !== userId) return e.reply('只有队长可以决定全队撤离');
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      const run = await this.getRun(current.id);
      if (!team || !run) return e.reply('无尽劫境状态已经失效');
      const settlement = await this.settleRun(
        team,
        run,
        run.settlement?.reason === 'defeat' ? 0.3 : 1,
        run.settlement?.reason || 'withdraw'
      );
      return e.reply(
        this.formatSettlement(settlement, '全队主动撤离').join('\n')
      );
    });
  }
}

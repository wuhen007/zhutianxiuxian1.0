import { plugin, puppeteer, Show } from '../api/api.js';
import {
  Add_najie_thing,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
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
import {
  ENDLESS_SHOP,
  ENDLESS_TOKEN,
  FUSION_ITEM,
  findEndlessProduct,
  mergeSetEquipment,
} from '../model/endlessShop.js';
import {
  INNATE_TREASURE_CATALOG,
  INNATE_TREASURE_NAMES,
  readInnateTreasureState,
} from '../model/innateTreasure.js';

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
        { reg: '^#无尽商店$', fnc: 'showEndlessShop' },
        { reg: '^#无尽购买\\s+.+$', fnc: 'buyEndlessItem' },
        { reg: '^#万象归一\\s+(?:武器|护具|法宝)\\*.+$', fnc: 'mergeEquipment' },
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
        '#无尽商店',
        '#无尽购买 商品名*数量',
        '#万象归一 武器/护具/法宝*百分比装备名',
        '',
        '主动撤离保留全部奖励；团灭保留已封存奖励和30%未封存奖励。',
      ].join('\n')
    );
  }

  async showEndlessShop(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const lines = [
      '【无尽商店】',
      `${ENDLESS_TOKEN}：${this.formatAmount(player[ENDLESS_TOKEN])}`,
      '',
      ...ENDLESS_SHOP.map(item =>
        `${item.id}. ${item.name} · ${item.price}${ENDLESS_TOKEN}${
          item.dailyLimit ? `（每日限购${item.dailyLimit}）` : ''
        }\n   ${item.description}`
      ),
      '',
      '#无尽购买 商品名*数量（也可填写商品编号）',
      `使用【${FUSION_ITEM}】：#万象归一 武器/护具/法宝*百分比装备名`,
    ];
    return e.reply(lines.join('\n'));
  }

  todayKey() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  }

  createTreasureClue() {
    const state = readInnateTreasureState();
    const unclaimed = INNATE_TREASURE_NAMES.filter(name => !state.owners?.[name]);
    const pool = unclaimed.length ? unclaimed : INNATE_TREASURE_NAMES;
    const name = pool[Math.floor(Math.random() * pool.length)];
    const profile = INNATE_TREASURE_CATALOG[name];
    const owner = state.owners?.[name];
    return [
      '【先天灵宝天机】',
      `天机所指：${name}·${profile?.title || '先天至宝'}`,
      `权能：${profile?.summary || '大道权柄尚在混沌中'}`,
      owner
        ? `认主状态：已认主（${owner.ownerName || owner.ownerId || '天机遮蔽'}）`
        : '认主状态：尚未认主，可关注先天至宝择主事件。',
      '可发送 #先天至宝图鉴 查询完整权柄。',
    ];
  }

  async buyEndlessItem(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const body = e.msg.replace(/^#无尽购买\s+/, '').trim();
    const amountMatch = body.match(/^(.*)\*(\d+)$/);
    const product = findEndlessProduct(amountMatch ? amountMatch[1] : body);
    const amount = Math.trunc(Number(amountMatch?.[2] || 1));
    if (!product) return e.reply('无尽商店没有这件商品，请发送 #无尽商店 查看');
    if (amount < 1 || amount > 99) return e.reply('单次购买数量须为1～99');

    return this.withLock(e, `store:${userId}`, async () => {
      const player = await Read_player(userId);
      const day = this.todayKey();
      player.无尽商店购买记录 ||= {};
      for (const key of Object.keys(player.无尽商店购买记录)) {
        if (!key.startsWith(`${day}:`)) delete player.无尽商店购买记录[key];
      }
      const recordKey = `${day}:${product.id}`;
      const bought = Number(player.无尽商店购买记录[recordKey]) || 0;
      if (product.dailyLimit && bought + amount > product.dailyLimit)
        return e.reply(`【${product.name}】每日限购${product.dailyLimit}件，你今天已购买${bought}件`);
      const cost = product.price * amount;
      if ((Number(player[ENDLESS_TOKEN]) || 0) < cost)
        return e.reply(`${ENDLESS_TOKEN}不足：需要${cost}，当前${Number(player[ENDLESS_TOKEN]) || 0}`);

      const original = JSON.parse(JSON.stringify(player));
      player[ENDLESS_TOKEN] = (Number(player[ENDLESS_TOKEN]) || 0) - cost;
      player.无尽商店购买记录[recordKey] = bought + amount;
      try {
        await Write_player(userId, player);
        if (product.action === 'item')
          await Add_najie_thing(userId, product.name, product.itemClass, amount);
      } catch (error) {
        await Write_player(userId, original);
        logger.error(`[无尽商店] 购买失败 player=${userId} item=${product.name}`, error);
        return e.reply('购买失败，消耗的劫境道痕已经退还');
      }

      const lines = [
        '【无尽商店·购买成功】',
        `${product.name}×${amount}`,
        `消耗${ENDLESS_TOKEN}：${cost}`,
        `剩余${ENDLESS_TOKEN}：${player[ENDLESS_TOKEN]}`,
      ];
      if (product.action === 'clue') lines.push('', ...this.createTreasureClue());
      return e.reply(lines.join('\n'));
    });
  }

  async mergeEquipment(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const match = e.msg.match(/^#万象归一\s+(武器|护具|法宝)\*(.+)$/);
    if (!match) return e.reply('#万象归一 武器/护具/法宝*百分比装备名');
    const slot = match[1];
    const sourceName = match[2].trim();
    return this.withLock(e, `fusion:${userId}`, async () => {
      const originalEquipment = await Read_equipment(userId);
      const najie = await Read_najie(userId);
      let merged;
      try {
        merged = mergeSetEquipment(originalEquipment, najie, slot, sourceName);
      } catch (error) {
        return e.reply(error.message);
      }
      try {
        await Write_equipment(userId, merged.equipment);
        await Write_najie(userId, merged.najie);
      } catch (error) {
        try {
          await Write_equipment(userId, originalEquipment);
        } catch (rollbackError) {
          logger.error(`[万象归一] 回滚装备失败 player=${userId}`, rollbackError);
        }
        logger.error(`[万象归一] 熔铸失败 player=${userId}`, error);
        return e.reply('万象归一失败，装备状态已尝试恢复，请稍后再试');
      }
      const pct = merged.target.归一属性.百分比;
      return e.reply([
        '【万象归一·熔铸成功】',
        `${merged.target.name}吞纳了${sourceName}的道则`,
        `追加百分比：攻击${pct.atk} / 防御${pct.def} / 血量${pct.HP}`,
        '原数值属性与套装效果完整保留。',
      ].join('\n'));
    });
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
        )} / 源石${this.formatAmount(run.banked.sourceStone)} / ${ENDLESS_TOKEN}${this.formatAmount(
          run.banked.tokens
        )}`,
        `未封存：灵石${this.formatAmount(
          run.unbanked.lingshi
        )} / 源石${this.formatAmount(run.unbanked.sourceStone)} / ${ENDLESS_TOKEN}${this.formatAmount(
          run.unbanked.tokens
        )}`
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
    const enemyHp = this.formatHpBar(
      result.enemyMaxHp - result.enemyRemainingHp,
      result.enemyMaxHp,
      18
    );
    const memberBars = Object.values(run.members)
      .map((member) => {
        const stats = getMemberStats(run, member.id);
        const status = member.alive ? '' : '（残魂）';
        return `  ${member.name}${status} ${this.formatHpBar(
          member.hp,
          stats?.maxHp || member.hp,
          12
        )}`;
      })
      .join('\n');
    const lines = [
      `【无尽劫境·第${result.layer}层】`,
      `${result.world} · ${this.stageText(result.stage)}`,
      `敌人：${result.enemy} [${result.trait}]`,
      `敌方血条：${enemyHp}`,
      `战斗回合：${result.rounds}`,
      '',
      '【队伍状态】',
      memberBars,
      '',
      ...result.logs,
      '',
      '【伤害统计】',
      ...Object.entries(result.damageByMember)
        .filter(([id, value]) => id !== '_fusion' && value > 0)
        .sort((a, b) => b[1] - a[1])
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
    const summary = result.summary || {};
    if (summary.totalDamage) {
      lines.push(
        '',
        '【战斗复盘】',
        ...[
          `总输出：${this.formatAmount(summary.totalDamage)}`,
          summary.mvpName
            ? `本场MVP：${summary.mvpName}（${this.formatAmount(
                summary.mvpDamage
              )}）`
            : null,
          summary.fusionHits ? `诸天共鸣触发：${summary.fusionHits}次` : null,
          summary.revive ? `涅槃/复活：${summary.revive}次` : null,
          summary.lifeFireUsed
            ? `消耗命火：${summary.lifeFireUsed}点`
            : null,
          summary.analysis ? `败因：${summary.analysis}` : null,
        ].filter(Boolean)
      );
    }
    lines.push(
      '',
      result.victory
        ? '怪潮覆灭，队伍继续深入！'
        : '全队投影破碎，无尽劫境宣告终结。'
    );
    if (result.victory) {
      const rewardLines = Object.entries(result.layerReward?.members || {}).map(
        ([id, reward]) =>
          `${run.members[id]?.name || id}：修为${this.formatAmount(
            reward.cultivation
          )} / 血气${this.formatAmount(reward.blood)}`
      );
      lines.push(
        '【本层所得】',
        `灵石${this.formatAmount(result.layerReward?.lingshi)} / 源石${this.formatAmount(
          result.layerReward?.sourceStone
        )} / ${ENDLESS_TOKEN}${this.formatAmount(result.layerReward?.tokens)}`,
        ...rewardLines,
        '',
        `命火：${run.lifeFire}/${run.maxLifeFire}`,
        `已封存：灵石${this.formatAmount(
          run.banked.lingshi
        )} / 源石${this.formatAmount(run.banked.sourceStone)} / ${ENDLESS_TOKEN}${this.formatAmount(
          run.banked.tokens
        )}`,
        `未封存：灵石${this.formatAmount(
          run.unbanked.lingshi
        )} / 源石${this.formatAmount(run.unbanked.sourceStone)} / ${ENDLESS_TOKEN}${this.formatAmount(
          run.unbanked.tokens
        )}`,
        '',
        ...this.formatAllChoices(run)
      );
    }
    return lines;
  }

  buildBattleView(run, result, settlement = null) {
    const lastRound = result.roundDetails?.at(-1);
    const finalMemberState = new Map(
      (lastRound?.members || []).map((member) => [member.id, member])
    );
    const maxDamage = Math.max(
      1,
      ...Object.entries(result.damageByMember)
        .filter(([id]) => id !== '_fusion')
        .map(([, damage]) => damage)
    );
    const members = Object.values(run.members)
      .map((member) => {
        const stats = getMemberStats(run, member.id);
        const battleState = finalMemberState.get(member.id);
        const maxHp = Math.max(1, battleState?.maxHp || stats?.maxHp || 1);
        const hp = Math.max(0, battleState?.hp ?? member.hp ?? 0);
        const hpPct = Math.round(Math.min(1, hp / maxHp) * 100);
        const damage = result.damageByMember[member.id] || 0;
        return {
          id: member.id,
          name: member.name,
          alive: battleState?.alive ?? member.alive,
          hp: this.formatAmount(hp),
          maxHp: this.formatAmount(maxHp),
          hpPct,
          hpTone: hpPct > 55 ? 'healthy' : hpPct > 25 ? 'warning' : 'danger',
          damage: this.formatAmount(damage),
          damagePct: Math.max(2, Math.round((damage / maxDamage) * 100)),
          damageTaken: this.formatAmount(
            result.damageTakenByMember?.[member.id] || 0
          ),
          isMvp: result.summary?.mvpId === member.id,
          abilities: Object.entries(member.abilities || {}).map(
            ([abilityId, level]) => ({
              name: getAbility(abilityId)?.name || abilityId,
              level,
            })
          ),
          layerCultivation: this.formatAmount(
            result.layerReward?.members?.[member.id]?.cultivation || 0
          ),
          layerBlood: this.formatAmount(
            result.layerReward?.members?.[member.id]?.blood || 0
          ),
        };
      })
      .sort(
        (a, b) =>
          (result.damageByMember[b.id] || 0) -
          (result.damageByMember[a.id] || 0)
      );

    const roundDetails = (result.roundDetails || []).map((round) => ({
      ...round,
      enemyDamage: this.formatAmount(round.enemyDamage),
      fusionDamage: this.formatAmount(round.fusionDamage),
      teamDamageTaken: this.formatAmount(round.teamDamageTaken),
      enemyHp: this.formatAmount(round.enemyHp),
      enemyMaxHp: this.formatAmount(result.enemyMaxHp),
      attacks: round.attacks.map((attack) => ({
        ...attack,
        damage: this.formatAmount(attack.damage),
      })),
      actions: (round.actions || []).map((action) => ({
        ...action,
        sideName:
          { player: '我方', enemy: '敌方', team: '共鸣', system: '状态' }[
            action.side
          ] || '战场',
        damage: this.formatAmount(action.damage),
        healing: this.formatAmount(action.healing),
        absorbed: this.formatAmount(action.absorbed),
        hasDamage: action.damage > 0,
        hasHealing: action.healing > 0,
        hasAbsorbed: action.absorbed > 0,
      })),
      events: round.events.map((text) => ({
        text,
        tone: /暴击|斩杀/.test(text)
          ? 'critical'
          : /命火|破碎|吞噬|坍塌/.test(text)
          ? 'danger'
          : /涅槃|归来|再生|恢复/.test(text)
          ? 'recover'
          : /共鸣|神通|法相|火莲/.test(text)
          ? 'resonance'
          : 'normal',
      })),
    }));

    return {
      saveId: `endless_${run.teamId}_${result.layer}_${Date.now()}`,
      layer: result.layer,
      world: result.world,
      stage: result.stage,
      stageName: this.stageText(result.stage),
      enemy: result.enemy,
      trait: result.trait,
      victory: result.victory,
      rounds: result.rounds,
      enemyHp: this.formatAmount(result.enemyRemainingHp),
      enemyMaxHp: this.formatAmount(result.enemyMaxHp),
      enemyHpPct: Math.round(
        Math.max(0, result.enemyRemainingHp / Math.max(1, result.enemyMaxHp)) *
          100
      ),
      members,
      roundDetails,
      logs: result.logs.map((text) => ({ text })),
      totalDamage: this.formatAmount(result.summary?.totalDamage || 0),
      fusionDamage: this.formatAmount(result.damageByMember._fusion || 0),
      mvpName: result.summary?.mvpName || '暂无',
      mvpDamage: this.formatAmount(result.summary?.mvpDamage || 0),
      fusionHits: result.summary?.fusionHits || 0,
      fusions: (run.fusions || []).map((id) => getFusion(id)?.name || id),
      revive: result.summary?.revive || 0,
      lifeFireUsed: result.summary?.lifeFireUsed || 0,
      analysis: result.summary?.analysis || '',
      lifeFire: run.lifeFire,
      maxLifeFire: run.maxLifeFire,
      bankedLingshi: this.formatAmount(run.banked.lingshi),
      bankedSourceStone: this.formatAmount(run.banked.sourceStone),
      bankedTokens: this.formatAmount(run.banked.tokens),
      unbankedLingshi: this.formatAmount(run.unbanked.lingshi),
      unbankedSourceStone: this.formatAmount(run.unbanked.sourceStone),
      unbankedTokens: this.formatAmount(run.unbanked.tokens),
      layerReward: result.layerReward
        ? {
            lingshi: this.formatAmount(result.layerReward.lingshi),
            sourceStone: this.formatAmount(result.layerReward.sourceStone),
            tokens: this.formatAmount(result.layerReward.tokens),
          }
        : null,
      settlement: settlement
        ? {
            complete: settlement.complete,
            lingshi: this.formatAmount(settlement.reward.lingshi),
            sourceStone: this.formatAmount(settlement.reward.sourceStone),
            tokens: this.formatAmount(settlement.reward.tokens),
            lostLingshi: this.formatAmount(settlement.reward.lostLingshi),
            lostSourceStone: this.formatAmount(settlement.reward.lostSourceStone),
            lostTokens: this.formatAmount(settlement.reward.lostTokens),
            members: Object.entries(settlement.reward.members || {}).map(
              ([id, reward]) => ({
                name: settlement.memberNames?.[id] || run.members[id]?.name || id,
                cultivation: this.formatAmount(reward.cultivation),
                blood: this.formatAmount(reward.blood),
                lostCultivation: this.formatAmount(reward.lostCultivation),
                lostBlood: this.formatAmount(reward.lostBlood),
              })
            ),
          }
        : null,
    };
  }

  async replyBattleReport(e, run, result, settlement = null) {
    try {
      const view = this.buildBattleView(run, result, settlement);
      const renderData = await new Show(e).get_endlessBattleData(view);
      const image = await puppeteer.screenshot('endless_battle', renderData);
      if (image) {
        await e.reply(image);
        if (result.victory) {
          return e.reply(this.formatAllChoices(run).join('\n'));
        }
        return true;
      }
    } catch (error) {
      logger.error('[无尽劫境] 战报图片生成失败', error);
    }

    const lines = this.formatBattle(run, result);
    if (settlement)
      lines.push('', ...this.formatSettlement(settlement, '团灭结算'));
    return e.reply(lines.join('\n'));
  }

  formatHpBar(current, max, width = 16) {
    const safeMax = Math.max(1, Number(max) || 1);
    const ratio = Math.min(1, Math.max(0, Number(current) / safeMax));
    const filled = Math.round(ratio * width);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
    const pct = Math.round(ratio * 100);
    return `[${bar}] ${pct}%`;
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
      for (const id of team.members) {
        if (run.members[id]?.rewardRealms) continue;
        const player = await Read_player(id);
        run.members[id].rewardRealms = {
          level: Number(player.level_id) || 0,
          physique: Number(player.Physique_id) || 0,
          secret: Number(player.mijinglevel_id) || 0,
          ancient: Number(player.xiangulevel_id) || 0,
        };
      }
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
      let settlement = null;
      if (!result.victory) {
        settlement = await this.settleRun(team, run, 0.3, 'defeat');
      }
      return this.replyBattleReport(e, run, result, settlement);
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
    const memberLoss = Object.values(settlement.reward.members || {}).some(
      reward => reward.lostCultivation || reward.lostBlood
    );
    return [
      `【${title}】`,
      `每名成员获得灵石：${this.formatAmount(settlement.reward.lingshi)}`,
      `每名成员获得源石：${this.formatAmount(settlement.reward.sourceStone)}`,
      `每名成员获得${ENDLESS_TOKEN}：${this.formatAmount(settlement.reward.tokens)}`,
      ...Object.entries(settlement.reward.members || {}).map(([id, reward]) =>
        `${settlement.memberNames?.[id] || id}：修为${this.formatAmount(
          reward.cultivation
        )} / 血气${this.formatAmount(reward.blood)}${
          reward.lostCultivation || reward.lostBlood
            ? `（未带出修为${this.formatAmount(reward.lostCultivation)} / 血气${this.formatAmount(reward.lostBlood)}）`
            : ''
        }`
      ),
      settlement.reward.lostLingshi || settlement.reward.lostSourceStone || settlement.reward.lostTokens || memberLoss
        ? `未能带出：灵石${this.formatAmount(settlement.reward.lostLingshi)} / 源石${this.formatAmount(
            settlement.reward.lostSourceStone
          )} / ${ENDLESS_TOKEN}${this.formatAmount(settlement.reward.lostTokens)}`
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
    const reward = run.settlement.reward;
    reward.sourceStone = Number(reward.sourceStone) || 0;
    reward.tokens = Number(reward.tokens) || 0;
    reward.lostSourceStone = Number(reward.lostSourceStone) || 0;
    reward.lostTokens = Number(reward.lostTokens) || 0;
    reward.members ||= Object.fromEntries(
      team.members.map(id => [id, {
        cultivation: Number(reward.cultivation) || 0,
        blood: 0,
        lostCultivation: Number(reward.lostCultivation) || 0,
        lostBlood: 0,
      }])
    );

    for (const id of team.members) {
      if (run.settlement.paidMembers.includes(id)) continue;
      try {
        const player = await Read_player(id);
        const records = Array.isArray(player.无尽劫境结算记录)
          ? player.无尽劫境结算记录
          : [];
        if (!records.includes(run.settlement.id)) {
          const memberReward = run.settlement.reward.members?.[id] || {};
          player.灵石 =
            (Number(player.灵石) || 0) + run.settlement.reward.lingshi;
          player.源石 =
            (Number(player.源石) || 0) + run.settlement.reward.sourceStone;
          player[ENDLESS_TOKEN] =
            (Number(player[ENDLESS_TOKEN]) || 0) + run.settlement.reward.tokens;
          player.修为 =
            (Number(player.修为) || 0) + (Number(memberReward.cultivation) || 0);
          player.血气 =
            (Number(player.血气) || 0) + (Number(memberReward.blood) || 0);
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
          memberNames: team.memberNames,
        };
      }
    }

    const result = {
      complete: true,
      paid: team.members.length,
      total: team.members.length,
      reward: run.settlement.reward,
      layer: run.layer,
      memberNames: team.memberNames,
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

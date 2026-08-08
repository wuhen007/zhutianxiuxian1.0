import { data, plugin, puppeteer, Show } from '../api/api.js';
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
  applyCheckpointChoice,
  applyEndlessChoice,
  createEndlessRun,
  ensureEndlessStarMapState,
  getAbility,
  getCheckpointBoon,
  getFusion,
  getMemberStats,
  getSettlement,
  getEndlessSweepReward,
  getWorldForLayer,
  resolveEndlessLayer,
} from '../model/endlessRealm.js';
import {
  ENDLESS_STAR_NODE_TYPES,
  getEndlessStarMapView,
  getEndlessStarOptions,
  getEndlessStarVotes,
  getSelectedEndlessStarNode,
  selectEndlessStarRoute,
  suggestEndlessStarRoute,
} from '../model/endlessStarMap.js';
import {
  ENDLESS_ENTRY_ITEM,
  ENDLESS_KEY_RECIPE_FLAG,
  ENDLESS_KEY_RECIPE_ITEM,
  ENDLESS_SPIRIT_HEART_COST,
  ENDLESS_SWEEP_ITEM,
} from '../model/endlessAccess.js';
import {
  consumeSpiritHeart,
  getSpiritHeartCost,
  refreshSpiritHeart,
} from '../model/spiritUniverse.js';
import {
  calculateMinggeSourceGain,
  getMinggeEffects,
} from '../model/mingge.js';
import {
  ENDLESS_SHOP,
  ENDLESS_TOKEN,
  FUSION_ITEM,
  findEndlessProduct,
  formatTreasureClue,
  mergeSetEquipment,
} from '../model/endlessShop.js';
import {
  ENDLESS_BATTLE_TEMPLATES,
  getEndlessBattleTemplateModel,
  normalizeEndlessBattleTemplate,
} from '../model/endlessBattleTemplate.js';
import RealmEvents from './tasks/RealmEvents.js';
import {
  getEndlessMetaView,
  resetEndlessMeta,
  toggleEndlessPuzzle,
  upgradeEndlessMeta,
} from '../model/endlessMeta.js';
import {
  createEndlessWebLink,
  getEndlessWebConfig,
} from '../model/endlessWebServer.js';

const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 12;
const MAX_TEAM_SIZE = 4;

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
        { reg: '^#无尽网页$', fnc: 'openEndlessWeb' },
        { reg: '^#劫途星图$', fnc: 'showStarMap' },
        { reg: '^#星图建议\\s*[1-3]$', fnc: 'suggestStarRoute' },
        { reg: '^#星图情报\\s*[1-3]$', fnc: 'showStarIntel' },
        { reg: '^#星图定途\\s*[1-3]$', fnc: 'selectStarRoute' },
        { reg: '^#无尽选择\\s*[1-4]$', fnc: 'chooseAbility' },
        { reg: '^#劫后(?:抉择|选择)\\s*[1-3]$', fnc: 'chooseCheckpoint' },
        { reg: '^#无尽(?:下一关|下一层|挑战)$', fnc: 'nextLayer' },
        { reg: '^#无尽构筑$', fnc: 'showBuild' },
        { reg: '^#无尽战斗模[版板](?:\\s*[1-4])?$', fnc: 'setBattleTemplate' },
        { reg: '^#(?:无尽撤离|退出无尽劫境)$', fnc: 'withdrawRun' },
        { reg: '^#扫荡无尽劫境$', fnc: 'sweepEndlessRealm' },
        { reg: '^#参悟无尽秘钥配方$', fnc: 'learnEndlessKeyRecipe' },
        { reg: '^#无尽商店$', fnc: 'showEndlessShop' },
        { reg: '^#无尽购买\\s+.+$', fnc: 'buyEndlessItem' },
        { reg: '^#万劫道碑$', fnc: 'showEndlessMeta' },
        { reg: '^#参悟道碑\\s*.+$', fnc: 'upgradeEndlessMeta' },
        { reg: '^#装配厉鬼拼图\\s*.+$', fnc: 'toggleEndlessPuzzle' },
        { reg: '^#重置万劫道碑$', fnc: 'requestResetEndlessMeta' },
        { reg: '^#确认重置万劫道碑$', fnc: 'confirmResetEndlessMeta' },
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

  metaResetKey(id) {
    return `Xiuxian:Endless:MetaReset:${id}`;
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
      `${member.name}发送 #无尽选择${choices.map((_, index) => index + 1).join('/')}`,
    ];
  }

  formatEndlessMeta(view) {
    const equipped = new Set(view.meta.equippedPuzzles);
    const nodeLines = view.nodes.map(node => {
      const next = node.rank >= node.maxRank
        ? '已圆满'
        : `下一级${node.nextCost}道痕${node.nextGate ? `，需最高通过${node.nextGate}层` : ''}`;
      return `${node.puzzle ? '[拼图]' : '[道碑]'} ${node.name} Lv.${node.rank}/${node.maxRank} · ${next}\n  ${node.description}`;
    });
    const equippedNames = view.nodes
      .filter(node => equipped.has(node.id))
      .map(node => node.name);
    return [
      '【万劫道碑·局外传承】',
      `劫境道痕：${view.balance}｜最高通过：${view.highestLayer}层`,
      `厉鬼拼图：${equipped.size}/${view.puzzleSlots}（${equippedNames.join('、') || '未装配'}）`,
      'Boss前未封存的道痕在团灭时仅保留30%，主动撤离全额保留。',
      '',
      ...nodeLines,
      '',
      '#参悟道碑 名称',
      '#装配厉鬼拼图 名称（重复发送可卸下）',
      '#重置万劫道碑',
    ];
  }

  rarityClass(rarity) {
    if (/神话|传说|禁忌|至高/.test(rarity || '')) return 'legendary';
    if (/稀有|史诗/.test(rarity || '')) return 'rare';
    return 'common';
  }

  panelChoiceGroups(run, memberIds = Object.keys(run.pendingChoices || {})) {
    return memberIds
      .filter(id => run.pendingChoices?.[id])
      .map(id => {
        const member = run.members[id];
        const choices = run.pendingChoices[id];
        return {
          name: member.name,
          command: `#无尽选择${choices.map((_, index) => index + 1).join('/')}`,
          hint: choices.length === 4 ? '衍算天机 · 四象齐现' : '三道投影 · 择一铭刻',
          choices: choices.map((abilityId, index) => {
            const ability = getAbility(abilityId);
            const owned = member.abilities?.[abilityId] || 0;
            return {
              index: index + 1,
              name: ability?.name || abilityId,
              rarity: ability?.rarity || '未知',
              rarityClass: this.rarityClass(ability?.rarity),
              description: ability?.description || '道痕受到未知力量遮蔽。',
              levelText: owned ? `当前 Lv.${owned}` : '初次参悟',
              tags: (ability?.tags || []).join(' · ') || '诸天能力',
            };
          }),
        };
      });
  }

  panelCheckpoint(run) {
    if (!run.checkpoint) return null;
    return {
      title: run.checkpoint.title,
      layer: run.checkpoint.layer,
      command: '#劫后抉择1 / 2 / 3',
      choices: run.checkpoint.choices.map((choice, index) => ({
        ...choice,
        index: index + 1,
      })),
    };
  }

  panelMembers(team, run, userId, showBuild = false) {
    return team.members.map(id => {
      const member = run?.members?.[id];
      if (!member)
        return {
          name: team.memberNames[id] || id,
          leader: id === team.leader,
          viewer: id === userId,
          alive: true,
          abilities: [],
          blessings: [],
        };
      const stats = getMemberStats(run, id);
      const abilities = Object.entries(member.abilities || {})
        .map(([abilityId, level]) => ({
          name: getAbility(abilityId)?.name || abilityId,
          level,
        }));
      return {
        name: member.name,
        leader: id === team.leader,
        viewer: id === userId,
        alive: member.alive,
        hp: this.formatAmount(member.hp),
        maxHp: this.formatAmount(stats.maxHp),
        hpPct: Math.round(Math.max(0, member.hp) / Math.max(1, stats.maxHp) * 100),
        attack: this.formatAmount(stats.attack),
        defense: this.formatAmount(stats.defense),
        abilities: showBuild ? abilities : abilities.slice(-6),
        blessings: (member.blessings || [])
          .map(boonId => getCheckpointBoon(boonId))
          .filter(Boolean)
          .map(boon => ({ kind: boon.kind, name: boon.name })),
      };
    });
  }

  phaseText(phase) {
    return {
      choice: '等待能力选择',
      ready: '可以挑战下一关',
      checkpoint: '劫后问道',
      settling: '正在结算',
      defeated: '投影破碎',
    }[phase] || phase;
  }

  starTargetLayer(run) {
    return run.phase === 'checkpoint'
      ? Math.max(1, Number(run.layer) || 1)
      : Math.max(1, (Number(run.layer) || 0) + 1);
  }

  ensureStarMapForRun(run) {
    return ensureEndlessStarMapState(run, this.starTargetLayer(run));
  }

  formatStarPrompt(run) {
    if (run.phase === 'checkpoint') return this.formatCheckpoint(run);
    const targetLayer = this.starTargetLayer(run);
    const selected = getSelectedEndlessStarNode(run, targetLayer);
    const commandRange = getEndlessStarOptions(run, targetLayer)
      .map((_, index) => index + 1)
      .join('/');
    if (selected)
      return [
        `劫途已锁定：【${selected.shortName}】${selected.worldName} · ${selected.risk}`,
        run.phase === 'ready'
          ? '队长发送 #无尽下一关 踏入该节点'
          : '完成全队能力选择后，由队长发送 #无尽下一关',
      ];
    return run.phase === 'ready'
      ? [
          '全队能力选择完成，但下一层因果尚未锁定。',
          `发送 #劫途星图 查看路线，队长使用 #星图定途${commandRange}。`,
        ]
      : [
          `能力选择期间可发送 #劫途星图 观测前路，队员可使用 #星图建议${commandRange}。`,
          `最终路线由队长使用 #星图定途${commandRange} 锁定。`,
        ];
  }

  formatStarMap(team, run) {
    const map = getEndlessStarMapView(run);
    if (!map) return ['劫途星图尚未显化'];
    const targetLayer = this.starTargetLayer(run);
    const options = run.phase === 'checkpoint'
      ? []
      : getEndlessStarOptions(run, targetLayer);
    const votes = new Map(
      getEndlessStarVotes(run).map(item => [item.nodeId, item.votes])
    );
    const selected = getSelectedEndlessStarNode(run, targetLayer);
    const lines = [
      `【劫途星图·第${map.cycle}轮劫环】`,
      `当前目标：第${targetLayer}层`,
      `劫环天象：${map.sky.name} · ${map.sky.omen}`,
      `队伍：${team.id}｜命火：${run.lifeFire}/${run.maxLifeFire}`,
    ];
    if (options.length) {
      lines.push('', '【当前可选劫途】');
      for (const [index, node] of options.entries())
        lines.push(
          `${index + 1}. [${node.risk}] ${node.name}（建议${votes.get(node.id) || 0}票）`,
          `   ${node.description}`,
          `   ${node.rewardText}`
        );
    }
    if (selected)
      lines.push('', `已锁定：【${selected.shortName}】${selected.worldName}`);
    else if (options.length)
      lines.push(
        '',
        `#星图建议${options.map((_, index) => index + 1).join('/')}｜队长：#星图定途${options.map((_, index) => index + 1).join('/')}`
      );
    if (run.phase === 'checkpoint')
      lines.push('', '本轮劫环已走完，请先完成 #劫后抉择1/2/3');
    return lines;
  }

  starMapPanelView(team, run, userId) {
    const map = getEndlessStarMapView(run);
    const targetLayer = this.starTargetLayer(run);
    const selected = getSelectedEndlessStarNode(run, targetLayer);
    const suggestions = map?.suggestions || {};
    const votes = new Map(
      getEndlessStarVotes(run).map(item => [item.nodeId, item.votes])
    );
    const revealUntil = Math.min(
      map.startLayer + 9,
      targetLayer + 2
    );
    const rows = map.rows.map(row => ({
      layer: row.layer,
      label: String(row.layer).padStart(2, '0'),
      current: row.layer === targetLayer,
      nodes: row.nodes.map(node => {
        const visible =
          node.layer <= revealUntil ||
          node.typeId === 'heaven_gate' ||
          node.status !== 'future';
        return {
          ...node,
          visible,
          current: row.layer === targetLayer,
          displayName: visible ? node.shortName : '未观测',
          displayWorld: visible
            ? node.worldName
            : '因果迷雾',
          statusClass: visible ? node.status : 'hidden',
        };
      }),
    }));
    const options = run.phase === 'checkpoint'
      ? []
      : getEndlessStarOptions(run, targetLayer).map((node, index) => {
          const voters = Object.entries(suggestions)
            .filter(([, nodeId]) => nodeId === node.id)
            .map(([id]) => team.memberNames[id] || id);
          return {
            ...node,
            index: index + 1,
            selected: node.id === selected?.id,
            votes: votes.get(node.id) || 0,
            voters: voters.join('、') || '尚无人建议',
            riskClass: /十死|大凶/.test(node.risk)
              ? 'fatal'
              : /凶险/.test(node.risk)
                ? 'danger'
                : 'stable',
          };
        });
    const commandRange = options.map(option => option.index).join('/');
    const seals = [
      ['杀伐印', map.seals?.slaughter || 0, '三印后Boss获得吸血'],
      ['因果印', map.seals?.cause || 0, '二印后Boss获得复活'],
      ['破界印', map.seals?.boundary || 0, '二印后Boss获得分身'],
      ['逆命印', map.seals?.defiance || 0, '二印后Boss获得斩杀'],
    ].map(([name, value, note]) => ({ name, value, note }));
    return {
      mode: 'star-map',
      eyebrow: 'CALAMITY STAR ATLAS · 因果定途',
      title: '劫途星图',
      subtitle: `第${map.cycle}轮劫环已经显化。越危险的支路回响越丰厚，也会为十方天关刻下更凶险的劫印。`,
      mark: String(map.cycle).padStart(2, '0'),
      status: selected ? '本层因果已锁定' : '等待队伍定途',
      heroStats: [
        { label: '当前目标', value: `第 ${targetLayer} 层`, note: `劫环 ${map.startLayer}—${map.startLayer + 9}层` },
        { label: '劫环天象', value: map.sky.name, note: map.sky.omen },
        { label: '共享命火', value: `${run.lifeFire} / ${run.maxLifeFire}`, note: '队伍投影共同持有' },
        { label: '远征队伍', value: team.id, note: `${team.members.length}/${MAX_TEAM_SIZE}人 · ${team.memberNames[userId] || '同行者'}` },
      ],
      notices: [
        { tone: 'jade', title: map.sky.name, text: `本轮奖励倍率×${Number(map.sky.rewardMultiplier || 1).toFixed(2)}；${map.sky.omen}` },
        selected
          ? { tone: 'danger', title: '因果锁定', text: `队伍将踏入【${selected.name}】，定途后本层无法更改。` }
          : { tone: 'normal', title: '众念归一', text: '队员可以提出路线建议；建议不消耗次数，最终因果仅由队长锁定。' },
      ],
      starMap: {
        cycle: map.cycle,
        targetLayer,
        rows,
        options,
        commandRange,
        seals,
        selectedName: selected?.name || '尚未定途',
      },
      footerCommand: run.phase === 'checkpoint'
        ? '#劫后抉择1/2/3'
        : selected
          ? '#无尽下一关'
          : `#星图定途${commandRange}`,
      footerNote: run.phase === 'checkpoint'
        ? '十方天关已破，先完成劫后问道，下一轮劫环才会显化。'
        : '使用 #星图情报1/2/3 查看细节；队员建议仅供参考，队长定途后无法反悔。',
    };
  }

  replyStarMap(e, team, run, userId) {
    return this.replyEndlessPanel(
      e,
      this.starMapPanelView(team, run, userId),
      this.formatStarMap(team, run)
    );
  }

  async replyEndlessPanel(e, view, fallback) {
    try {
      const renderData = await new Show(e).get_endlessPanelData({
        saveId: `endless_panel_${view.mode}_${Date.now()}`,
        ...view,
        renderScale: 2,
        imgType: 'png',
      });
      const image = await puppeteer.screenshot('endless_panel', renderData);
      if (image) return e.reply(image);
    } catch (error) {
      logger.error(`[无尽劫境] ${view.title}面板生成失败`, error);
    }
    return e.reply(Array.isArray(fallback) ? fallback.join('\n') : fallback);
  }

  helpPanelView() {
    return {
      mode: 'help',
      eyebrow: 'INFINITE CALAMITY · 诸天轮回远征',
      title: '诸天无尽劫境',
      subtitle: '跨越诸天位面，在一次次怪潮与天关中重塑构筑；每次抉择都将改写下一场战斗。',
      mark: '∞',
      status: '第一纪元 · 劫境已开启',
      heroStats: [
        { label: '远征人数', value: `1—${MAX_TEAM_SIZE}`, note: '支持单人或组队投影' },
        { label: '入境代价', value: '秘钥 × 1', note: `基础心神 ${ENDLESS_SPIRIT_HEART_COST}` },
        { label: '天关循环', value: '10 层', note: '第5层精英 · 第10层Boss' },
        { label: '团灭保留', value: '30%', note: 'Boss前未封存战利品' },
      ],
      notices: [
        { tone: 'jade', title: '构筑法则', text: '每层独立选择能力；衍算天机可增加选项，一念双悟可在每个十层循环额外参悟一次。' },
        { tone: 'danger', title: '劫境警示', text: '主动撤离可带回全部战利品；团灭仅保留已封存奖励和30%未封存奖励。' },
      ],
      commandGroups: [
        {
          kicker: 'ASSEMBLE',
          title: '结队入境',
          items: [
            { command: '#创建无尽队伍', description: '在当前群建立一支远征队伍' },
            { command: '#加入无尽队伍 123456', description: '凭六位队伍编号加入同行者' },
            { command: '#无尽队伍', description: '查看成员、层数、命火与待选能力' },
            { command: '#开启无尽劫境', description: '队长消耗全队秘钥与心神并开启远征' },
          ],
        },
        {
          kicker: 'DESCEND',
          title: '劫境行动',
          items: [
            { command: '#无尽选择1', description: '铭刻当前层的一项诸天能力' },
            { command: '#无尽下一关', description: '全员完成抉择后由队长推进' },
            { command: '#劫后抉择1', description: 'Boss战后选择归息、机缘或升华' },
            { command: '#无尽构筑', description: '检视队伍属性、能力、机缘与共鸣' },
            { command: '#劫途星图', description: '查看本轮劫环、天象与因果路线' },
            { command: '#星图建议1', description: '队员为下一条劫途提出建议' },
            { command: '#星图情报1', description: '查看路线代价、敌方增幅与奖励倍率' },
            { command: '#星图定途1', description: '由队长锁定下一层因果' },
          ],
        },
        {
          kicker: 'ASCEND',
          title: '局外传承',
          items: [
            { command: '#万劫道碑', description: '查看永久强化路线与厉鬼拼图' },
            { command: '#参悟道碑 攻击', description: '消耗劫境道痕提升局外传承' },
            { command: '#装配厉鬼拼图 八音盒', description: '切换已参悟拼图，获得鬼眼后生效' },
            { command: '#无尽商店', description: '以劫境道痕购买诸天遗珍' },
          ],
        },
        {
          kicker: 'RETURN',
          title: '撤离与扫荡',
          items: [
            { command: '#退出无尽劫境', description: '由队长主动结算并保留全部所得' },
            { command: '#扫荡无尽劫境', description: `消耗扫荡券、秘钥与${ENDLESS_SPIRIT_HEART_COST}心神` },
            { command: '#无尽战斗模版1/2/3/4', description: '切换战斗图片的叙事风格' },
            { command: '#参悟无尽秘钥配方', description: '解锁无尽秘钥制作资格' },
          ],
        },
      ],
      footerCommand: '#创建无尽队伍',
      footerNote: '先结队，再入境。无尽劫境中的属性与能力均为投影，不会覆盖角色本体构筑。',
    };
  }

  teamPanelView(team, run, userId) {
    const nextWorld = run ? getWorldForLayer(run, run.layer + 1) : null;
    const phase = run ? this.phaseText(run.phase) : this.statusText(team.status);
    const selectedStar = run
      ? getSelectedEndlessStarNode(run, this.starTargetLayer(run))
      : null;
    return {
      mode: 'team',
      eyebrow: 'PARTY PROJECTION · 远征队伍',
      title: `无尽队伍 · ${team.id}`,
      subtitle: run
        ? `当前投影位于第${run.layer}层，下一道位面裂隙通往${nextWorld.name}。`
        : '同行者正在集结，待队长确认后共同投入诸天劫境。',
      mark: run ? String(run.layer).padStart(2, '0') : `${team.members.length}/${MAX_TEAM_SIZE}`,
      status: phase,
      heroStats: [
        { label: '队伍状态', value: phase, note: run ? '劫境投影同步中' : '等待队长开启' },
        { label: '同行者', value: `${team.members.length} / ${MAX_TEAM_SIZE}`, note: team.memberNames[team.leader] || team.leader },
        { label: '当前层数', value: run ? run.layer : '未入境', note: nextWorld ? `下一位面 ${nextWorld.name}` : '等待位面坐标' },
        { label: '共享命火', value: run ? `${run.lifeFire} / ${run.maxLifeFire}` : '未点燃', note: '投影破碎时自动续命' },
      ],
      notices: run
        ? [
            { tone: run.phase === 'ready' ? 'jade' : 'normal', title: '当前进程', text: phase },
            run.phase === 'checkpoint'
              ? { tone: 'danger', title: '十方天关', text: '本轮劫环已完成，等待队长进行劫后问道。' }
              : selectedStar
                ? { tone: 'jade', title: '劫途已定', text: `第${this.starTargetLayer(run)}层将踏入【${selectedStar.name}】。` }
                : { tone: 'danger', title: '因果未定', text: '发送 #劫途星图 观测路线，队长定途后方可推进。' },
          ]
        : [{ tone: 'jade', title: '入境准备', text: `每名成员需要【${ENDLESS_ENTRY_ITEM}】×1与基础心神${ENDLESS_SPIRIT_HEART_COST}点。` }],
      team: { id: team.id },
      members: this.panelMembers(team, run, userId),
      choiceGroups: run ? this.panelChoiceGroups(run, [userId]) : [],
      checkpoint: run?.phase === 'checkpoint' ? this.panelCheckpoint(run) : null,
      treasury: run ? {
        bankedLingshi: this.formatAmount(run.banked.lingshi),
        bankedSourceStone: this.formatAmount(run.banked.sourceStone),
        bankedTokens: this.formatAmount(run.banked.tokens),
        unbankedLingshi: this.formatAmount(run.unbanked.lingshi),
        unbankedSourceStone: this.formatAmount(run.unbanked.sourceStone),
        unbankedTokens: this.formatAmount(run.unbanked.tokens),
      } : null,
      footerCommand: !run
        ? '#开启无尽劫境'
        : run.phase === 'choice'
          ? '#无尽选择 序号'
          : run.phase === 'checkpoint'
            ? '#劫后抉择 序号'
            : selectedStar
              ? '#无尽下一关'
              : '#劫途星图',
      footerNote: run ? '未封存战利品会在团灭时损失70%，抵达十层Boss并取胜即可封存。' : `队伍编号 ${team.id} 仅在当前群有效。`,
    };
  }

  buildPanelView(team, run, userId) {
    return {
      mode: 'build',
      eyebrow: 'BUILD ARCHIVE · 诸天铭刻',
      title: `无尽构筑 · 第${run.layer}层`,
      subtitle: '能力、天关机缘与跨世界共鸣共同塑造本次投影；局外道碑加成已经计入下列属性。',
      mark: String(run.layer).padStart(2, '0'),
      status: this.phaseText(run.phase),
      heroStats: [
        { label: '当前层数', value: run.layer, note: getWorldForLayer(run, run.layer + 1).name },
        { label: '共享命火', value: `${run.lifeFire} / ${run.maxLifeFire}`, note: '全队共用' },
        { label: '诸天共鸣', value: run.fusions.length, note: '已激活组合流派' },
        { label: '待选投影', value: Object.keys(run.pendingChoices || {}).length, note: this.phaseText(run.phase) },
      ],
      team: { id: team.id },
      members: this.panelMembers(team, run, userId, true),
      fusions: run.fusions.map(id => getFusion(id)?.name || id),
      choiceGroups: this.panelChoiceGroups(run, [userId]),
      checkpoint: run.phase === 'checkpoint' ? this.panelCheckpoint(run) : null,
      treasury: {
        bankedLingshi: this.formatAmount(run.banked.lingshi),
        bankedSourceStone: this.formatAmount(run.banked.sourceStone),
        bankedTokens: this.formatAmount(run.banked.tokens),
        unbankedLingshi: this.formatAmount(run.unbanked.lingshi),
        unbankedSourceStone: this.formatAmount(run.unbanked.sourceStone),
        unbankedTokens: this.formatAmount(run.unbanked.tokens),
      },
      footerCommand: run.phase === 'ready' ? '#无尽下一关' : '#无尽选择 序号',
      footerNote: '能力等级、天关机缘与局外道碑会共同参与最终战斗属性推演。',
    };
  }

  metaPanelView(view, playerName) {
    const equipped = new Set(view.meta.equippedPuzzles);
    const mapNode = (node, index) => ({
      ...node,
      index: String(index + 1).padStart(2, '0'),
      progress: Math.round(node.rank / node.maxRank * 100),
      maxed: node.rank >= node.maxRank,
      locked: node.rank < node.maxRank && view.highestLayer < node.nextGate,
      equipped: equipped.has(node.id),
      next: node.rank >= node.maxRank
        ? '已参悟圆满'
        : view.highestLayer < node.nextGate
          ? `需最高通过${node.nextGate}层`
          : `下一级消耗${node.nextCost}道痕`,
    });
    const metaNodes = view.nodes.filter(node => !node.puzzle).map(mapNode);
    const puzzleNodes = view.nodes.filter(node => node.puzzle).map(mapNode);
    return {
      mode: 'meta',
      eyebrow: 'MONUMENT OF CALAMITIES · 局外传承',
      title: '万劫道碑',
      subtitle: `${playerName}在一次次轮回中留下永恒刻痕；它们将在下一次投影降临时化作真实战力。`,
      mark: String(view.highestLayer).padStart(2, '0'),
      status: '无尽劫境最高层',
      heroStats: [
        { label: '劫境道痕', value: this.formatAmount(view.balance), note: '可用于参悟道碑' },
        { label: '最高通过', value: `${view.highestLayer} 层`, note: '决定传承解锁门槛' },
        { label: '拼图槽位', value: `${view.meta.equippedPuzzles.length} / ${view.puzzleSlots}`, note: '第50、100层增加槽位' },
        { label: '已耗道痕', value: this.formatAmount(view.meta.spent), note: '重置返还其中90%' },
      ],
      notices: [
        { tone: 'jade', title: '厉鬼拼图', text: '局外装配后，仍需在本局获得【鬼眼】才会激活拼图属性与机制。' },
        { tone: 'danger', title: '死亡代价', text: 'Boss前未封存道痕在团灭时只保留30%；主动撤离可以全额带回。' },
      ],
      metaNodes,
      puzzleNodes,
      puzzleEquipped: view.meta.equippedPuzzles.length,
      puzzleSlots: view.puzzleSlots,
      footerCommand: '#参悟道碑 名称',
      footerNote: '使用 #装配厉鬼拼图 名称 切换拼图；使用 #重置万劫道碑 返还90%已消耗道痕。',
    };
  }

  async showEndlessMeta(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const view = getEndlessMetaView(player);
    return this.replyEndlessPanel(
      e,
      this.metaPanelView(view, player.名号 || '无名修士'),
      this.formatEndlessMeta(view)
    );
  }

  async upgradeEndlessMeta(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#参悟道碑\s*/, '').trim();
    return this.withLock(e, `meta:${userId}`, async () => {
      const player = await Read_player(userId);
      let result;
      try {
        result = upgradeEndlessMeta(player, input);
      } catch (error) {
        return e.reply(error.message);
      }
      await Write_player(userId, player);
      return e.reply([
        '【万劫道碑·参悟成功】',
        `${result.node.name} Lv.${result.rank}/${result.node.maxRank}`,
        `消耗劫境道痕：${result.cost}`,
        `剩余劫境道痕：${result.balance}`,
      ].join('\n'));
    });
  }

  async toggleEndlessPuzzle(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#装配厉鬼拼图\s*/, '').trim();
    return this.withLock(e, `meta:${userId}`, async () => {
      const player = await Read_player(userId);
      let result;
      try {
        result = toggleEndlessPuzzle(player, input);
      } catch (error) {
        return e.reply(error.message);
      }
      await Write_player(userId, player);
      const view = getEndlessMetaView(player);
      return e.reply(
        `${result.equipped ? '已装配' : '已卸下'}【${result.node.name}】（${view.meta.equippedPuzzles.length}/${view.puzzleSlots}）\n厉鬼拼图仅在本局获得【鬼眼】后生效。`
      );
    });
  }

  async requestResetEndlessMeta(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const view = getEndlessMetaView(player);
    if (!view.meta.spent) return e.reply('万劫道碑尚未消耗道痕，无需重置');
    await redis.set(this.metaResetKey(userId), '1', { EX: 60 });
    return e.reply(
      `重置将返还已消耗劫境道痕的90%（预计${Math.floor(view.meta.spent * 0.9)}），并清空全部传承与拼图。\n60秒内发送 #确认重置万劫道碑`
    );
  }

  async confirmResetEndlessMeta(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    if (!(await redis.get(this.metaResetKey(userId))))
      return e.reply('重置确认已失效，请先发送 #重置万劫道碑');
    return this.withLock(e, `meta:${userId}`, async () => {
      const player = await Read_player(userId);
      const result = resetEndlessMeta(player);
      await Write_player(userId, player);
      await redis.del(this.metaResetKey(userId));
      return e.reply(
        `【万劫道碑已重置】\n返还劫境道痕：${result.refund}\n当前劫境道痕：${result.balance}`
      );
    });
  }

  formatAllChoices(run) {
    return Object.keys(run.pendingChoices || {}).flatMap((id) =>
      this.formatChoices(run, id)
    );
  }

  formatCheckpoint(run) {
    const checkpoint = run.checkpoint;
    if (!checkpoint) return [];
    return [
      `【${checkpoint.title}·第${checkpoint.layer}层】`,
      '十层天关已破，三条道途只能择其一：',
      ...checkpoint.choices.map(
        (choice, index) =>
          `${index + 1}. ${choice.name} · ${choice.subtitle}\n   ${choice.description}`
      ),
      '队长发送 #劫后抉择1/2/3',
    ];
  }

  formatCheckpointResult(run, result) {
    const lines = [
      `【劫后问道·${result.choice.name}】`,
      result.choice.subtitle,
    ];
    if (result.reward.kind === 'rest') {
      lines.push(
        `全员投影复苏并恢复至满血，命火${
          result.reward.recoveredLifeFire ? '+1' : '已满'
        }（${result.reward.lifeFire}/${run.maxLifeFire}）`
      );
    } else if (result.reward.kind === 'fortune') {
      if (result.reward.boon) {
        const boon = result.reward.boon;
        lines.push(
          `${result.reward.memberName}获得【${boon.kind}·${boon.name}】`,
          `源自：${boon.origin}`,
          boon.description
        );
        if (result.reward.abilityLevel)
          lines.push(
            `当前境界：${['残缺级', '仙帝级', '祭道级'][result.reward.abilityLevel - 1]}（Lv.${result.reward.abilityLevel}）`
          );
      } else {
        lines.push(
          `${result.reward.memberName}参透重复道痕，本局攻击成长额外提高12%`
        );
      }
    } else {
      lines.push(
        ...result.reward.upgrades.map(upgrade =>
          upgrade.fallback
            ? `${upgrade.memberName}已无可升华能力，本局攻击成长提高8%`
            : `${upgrade.memberName}：${upgrade.abilityName}升至Lv.${upgrade.level}`
        )
      );
    }
    lines.push('', ...this.formatAllChoices(run), '', ...this.formatStarPrompt(run));
    return lines;
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
    const lines = [
        '【诸天无尽劫境·第一版】',
        `1～${MAX_TEAM_SIZE}人组队，每名成员入场消耗【${ENDLESS_ENTRY_ITEM}】×1、心神${ENDLESS_SPIRIT_HEART_COST}点`,
        '每层击退怪潮后独立三选一；每5层精英，每10层位面Boss并开启劫后问道。',
        '他化自在法仅在Boss后的诸天垂青中以极低概率显化。',
        '',
        '#创建无尽队伍',
        '#加入无尽队伍 123456',
        '#无尽队伍',
        '#开启无尽劫境',
        '#劫途星图 / #星图情报1',
        '#星图建议1 / #星图定途1',
        '#无尽选择1',
        '#万劫道碑 / #参悟道碑 攻击',
        '#装配厉鬼拼图 八音盒',
        '#劫后抉择1',
        '#无尽下一关',
        '#无尽构筑',
        '#无尽战斗模版1/2/3/4',
        '#无尽撤离',
        '#退出无尽劫境',
        '#扫荡无尽劫境',
        '#参悟无尽秘钥配方',
        '#无尽商店',
        '#无尽购买 商品名*数量',
        '#万象归一 武器/护具/法宝*百分比装备名',
        '',
        '主动撤离保留全部奖励；团灭保留已封存奖励和30%未封存奖励。',
        `扫荡消耗【${ENDLESS_ENTRY_ITEM}】×1、【${ENDLESS_SWEEP_ITEM}】×1、心神${ENDLESS_SPIRIT_HEART_COST}点，结算最高层向前最多10层。`,
      ];
    return this.replyEndlessPanel(e, this.helpPanelView(), lines);
  }

  async setBattleTemplate(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const match = String(e.msg || '').match(/([1-4])\s*$/);
    if (!match) {
      const current = normalizeEndlessBattleTemplate(player.无尽战斗模板);
      return e.reply(
        [
          `当前无尽战报：${current} · ${ENDLESS_BATTLE_TEMPLATES[current]}`,
          ...Object.entries(ENDLESS_BATTLE_TEMPLATES).map(
            ([id, name]) => `${id}. ${name}`
          ),
          '发送 #无尽战斗模版1/2/3/4 切换',
        ].join('\n')
      );
    }
    const templateId = normalizeEndlessBattleTemplate(match[1]);
    player.无尽战斗模板 = templateId;
    await Write_player(userId, player);
    return e.reply(
      `无尽战报已切换为 ${templateId} · ${ENDLESS_BATTLE_TEMPLATES[templateId]}`
    );
  }

  async showEndlessShop(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const day = this.todayKey();
    const products = ENDLESS_SHOP.map((item, index) => {
      const bought = Number(
        player.无尽商店购买记录?.[`${day}:${item.id}`]
      ) || 0;
      const remaining = item.dailyLimit
        ? Math.max(0, item.dailyLimit - bought)
        : null;
      return {
        ...item,
        index: String(index + 1).padStart(2, '0'),
        tone: item.category || '寻常',
        wide: [7, 9, 12].includes(item.id),
        price: this.formatAmount(item.price),
        limitText: item.dailyLimit ? `每日限购 ${item.dailyLimit}` : '',
        stockText: item.dailyLimit ? `今日余 ${remaining}` : '不限购',
        soldOut: remaining === 0,
      };
    });
    const featured = products.find(item => item.id === 8) || products[0];
    const catalogProducts = products.filter(item => item !== featured);
    try {
      const renderData = await new Show(e).get_endlessShopData({
        saveId: `endless_shop_${userId}_${Date.now()}`,
        playerName: player.名号 || `无名修士${String(userId).slice(-4)}`,
        tokenAmount: this.formatAmount(player[ENDLESS_TOKEN]),
        date: day,
        productCount: products.length,
        products,
        featured,
        catalogProducts,
      });
      const image = await puppeteer.screenshot('endless_shop', renderData);
      if (image) return e.reply(image);
    } catch (error) {
      logger.error('[无尽商店] 商店图片生成失败', error);
    }

    const lines = [
      '【无尽商店】',
      `${ENDLESS_TOKEN}：${this.formatAmount(player[ENDLESS_TOKEN])}`,
      '',
      ...products.map(item =>
        `${item.id}. ${item.name} · ${item.price}${ENDLESS_TOKEN}${
          item.limitText ? `（${item.limitText}，${item.stockText}）` : ''
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

      let treasureEvent = null;
      if (product.action === 'clue') {
        treasureEvent = await RealmEvents.triggerTreasureFromTianji({
          qq: userId,
          name: player.名号 || userId,
        });
        if (!treasureEvent.ok) {
          await Write_player(userId, original);
          const reasons = {
            disabled: '位面事件尚未开启',
            all_claimed: '诸天先天至宝均已认主',
            all_manifested: '所有未认主至宝都已显化',
          };
          return e.reply(`${reasons[treasureEvent.reason] || '天机未能引动至宝'}，本次购买未消耗劫境道痕`);
        }
        await RealmEvents.broadcastEvent(treasureEvent.message);
      }

      const lines = [
        '【无尽商店·购买成功】',
        `${product.name}×${amount}`,
        `消耗${ENDLESS_TOKEN}：${cost}`,
        `剩余${ENDLESS_TOKEN}：${player[ENDLESS_TOKEN]}`,
      ];
      if (treasureEvent) lines.push('', ...formatTreasureClue(treasureEvent.eventData));
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
          `开局时每人消耗【${ENDLESS_ENTRY_ITEM}】×1、心神${ENDLESS_SPIRIT_HEART_COST}点`,
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
            : run.phase === 'checkpoint'
            ? '劫后问道'
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
      if (run.phase === 'checkpoint')
        lines.push('', ...this.formatCheckpoint(run));
      else
        lines.push('', ...this.formatStarPrompt(run));
    }
    return this.replyEndlessPanel(
      e,
      this.teamPanelView(team, run, userId),
      lines
    );
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
          Number(await exist_najie_thing(id, ENDLESS_ENTRY_ITEM, '道具')) || 0;
        if (amount < 1)
          missing.push(`${team.memberNames[id]}（缺少${ENDLESS_ENTRY_ITEM}）`);
        const player = await Read_player(id);
        const heart = refreshSpiritHeart(player);
        const heartCost = getSpiritHeartCost(
          ENDLESS_SPIRIT_HEART_COST,
          getMinggeEffects(player, data.minggeList)
        );
        if (heart.current < heartCost) {
          missing.push(
            `${team.memberNames[id]}（心神不足：${heart.current}/${heart.max}，需要${heartCost}）`
          );
        }
        players.push({ id, player, heartCost });
      }
      if (missing.length)
        return e.reply(['【无法开启无尽劫境】', ...missing].join('\n'));

      const run = createEndlessRun({
        teamId: team.id,
        groupId: team.groupId,
        players,
        seed: Date.now() ^ Number(team.id),
      });
      const originalPlayers = new Map(
        players.map(({ id, player }) => [id, structuredClone(player)])
      );
      const deducted = [];
      try {
        for (const entry of players) {
          const { id, player, heartCost } = entry;
          await Add_najie_thing(id, ENDLESS_ENTRY_ITEM, '道具', -1);
          deducted.push(id);
          const heart = consumeSpiritHeart(
            player,
            heartCost
          );
          if (!heart.ok) throw new Error(`player=${id} 心神状态发生变化`);
          await Write_player(id, player);
        }
        team.status = 'running';
        team.runId = run.id;
        await this.saveRun(run);
        await this.saveTeam(team);
      } catch (error) {
        const refundFailures = [];
        for (const id of deducted) {
          try {
            await Add_najie_thing(id, ENDLESS_ENTRY_ITEM, '道具', 1);
          } catch (refundError) {
            refundFailures.push(team.memberNames[id] || id);
            logger.error(`[无尽劫境] 退还秘钥失败 player=${id}`, refundError);
          }
        }
        for (const [id, snapshot] of originalPlayers) {
          try {
            await Write_player(id, snapshot);
          } catch (restoreError) {
            if (!refundFailures.includes(team.memberNames[id] || id))
              refundFailures.push(team.memberNames[id] || id);
            logger.error(`[无尽劫境] 退还心神失败 player=${id}`, restoreError);
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
            : '劫境开启失败，已退还成功扣除的无尽秘钥与心神'
        );
      }

      const world = getWorldForLayer(run, 1);
      const webLink = await this.issueEndlessWebLink(e, userId, team);
      return e.reply(
        [
          '【诸天无尽劫境开启】',
          `全队消耗【${ENDLESS_ENTRY_ITEM}】×1、心神按各自命格结算`,
          `首个世界：${world.name}`,
          `世界规则：${world.rule}`,
          `共享命火：${run.lifeFire}/${run.maxLifeFire}`,
          ...(webLink ? ['', '【网页入口·两分钟内有效】', webLink] : []),
          '',
          ...this.formatAllChoices(run),
          '',
          ...this.formatStarPrompt(run),
        ].join('\n')
      );
    });
  }

  async issueEndlessWebLink(e, userId, team) {
    if (!getEndlessWebConfig().enabled) return null;
    try {
      return await createEndlessWebLink(this, {
        rawUserId: String(e.user_id),
        userId,
        teamId: team.id,
        groupId: String(e.group_id),
      });
    } catch (error) {
      logger.error('[无尽网页] 入口生成失败', error);
      return null;
    }
  }

  async openEndlessWeb(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    if (!getEndlessWebConfig().enabled)
      return e.reply('无尽劫境网页入口暂未开放，请继续使用群聊指令');
    const team = await this.getPlayerTeam(userId);
    if (!team || team.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, team))
      return e.reply('请回到无尽队伍所在群领取网页入口');
    const link = await this.issueEndlessWebLink(e, userId, team);
    return e.reply(
      link
        ? ['【无尽劫境网页入口】', link, '入口两分钟内有效，首次打开后立即失效。'].join('\n')
        : '网页入口生成失败，请检查 config/endless-web.json 与服务器端口'
    );
  }

  async showStarMap(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const team = await this.getPlayerTeam(userId);
    if (!team || team.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, team))
      return e.reply('请回到无尽队伍所在群观测劫途星图');
    const run = await this.getRun(team.id);
    if (!run) return e.reply('无尽劫境状态已经失效');
    this.ensureStarMapForRun(run);
    await this.saveRun(run);
    return this.replyStarMap(e, team, run, userId);
  }

  async suggestStarRoute(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群提出星图建议');
    const choice = Number(String(e.msg || '').match(/[1-3]$/)?.[0]);
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      const run = await this.getRun(current.id);
      if (!team || !run || !team.members.includes(userId))
        return e.reply('无尽劫境状态已经失效');
      if (run.phase === 'checkpoint')
        return e.reply('本轮十方天关已经结束，请先完成劫后问道');
      this.ensureStarMapForRun(run);
      let node;
      try {
        node = suggestEndlessStarRoute(run, userId, choice);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      const votes = getEndlessStarVotes(run);
      const currentVote = votes.find(item => item.nodeId === node.id)?.votes || 0;
      return e.reply([
        `【${team.memberNames[userId] || userId}·星图建议】`,
        `建议踏入${choice}号劫途：【${node.name}】`,
        node.description,
        `当前建议：${currentVote}票｜${node.rewardText}`,
        team.leader === userId
          ? `你是队长，可发送 #星图定途${choice} 锁定因果`
          : '最终路线由队长锁定；再次建议其他序号可改票。',
      ].join('\n'));
    });
  }

  async showStarIntel(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const team = await this.getPlayerTeam(userId);
    if (!team || team.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, team))
      return e.reply('请回到无尽队伍所在群观测星图情报');
    const run = await this.getRun(team.id);
    if (!run) return e.reply('无尽劫境状态已经失效');
    if (run.phase === 'checkpoint')
      return e.reply('本轮十方天关已经结束，请先完成劫后问道');
    this.ensureStarMapForRun(run);
    await this.saveRun(run);
    const choice = Number(String(e.msg || '').match(/[1-3]$/)?.[0]);
    const options = getEndlessStarOptions(run, this.starTargetLayer(run));
    const node = options[choice - 1];
    if (!node) return e.reply(`当前只有${options.length}条可观测劫途`);
    const type = ENDLESS_STAR_NODE_TYPES[node.typeId];
    const sky = run.starMap.sky || {};
    const targetLayer = this.starTargetLayer(run);
    const sealTotal = Object.values(run.starMap.seals || {}).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );
    const bossSealMultiplier = node.typeId === 'heaven_gate'
      ? 1 + Math.min(0.5, sealTotal * 0.04)
      : 1;
    const stage = targetLayer % 10 === 0
      ? 'boss'
      : targetLayer % 5 === 0
        ? 'elite'
        : type.stage;
    const percent = value => `${Math.round((Number(value || 1) - 1) * 100)}%`;
    const rewardMultiplier =
      Number(type.rewardMultiplier || 1) *
      Number(sky.rewardMultiplier || 1) *
      bossSealMultiplier;
    return e.reply([
      `【星图情报${choice}·${node.name}】`,
      `危险：${node.risk}｜战场：${this.stageText(stage)}`,
      node.description,
      `敌方增幅：生命+${percent(Number(type.enemyHpMultiplier || 1) * Number(sky.enemyHpMultiplier || 1) * bossSealMultiplier)} / 攻击+${percent(Number(type.enemyAttackMultiplier || 1) * Number(sky.enemyAttackMultiplier || 1) * bossSealMultiplier)} / 防御+${percent(Number(type.enemyDefenseMultiplier || 1) * Number(sky.enemyDefenseMultiplier || 1))}`,
      `预期回响：奖励×${rewardMultiplier.toFixed(2)}｜${node.rewardText}`,
      type.monsterCountBonus ? `额外怪潮：+${type.monsterCountBonus}只` : null,
      type.entryHpCostPct ? `不可逆代价：入场损失${Math.round(type.entryHpCostPct * 100)}%最大生命` : null,
      '',
      `队员建议：#星图建议${choice}`,
      `队长定途：#星图定途${choice}`,
    ].filter(line => line !== null).join('\n'));
  }

  async selectStarRoute(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群锁定劫途');
    if (current.leader !== userId)
      return e.reply('只有队长可以锁定劫途，队员可使用 #星图建议1/2/3');
    const choice = Number(String(e.msg || '').match(/[1-3]$/)?.[0]);
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      const run = await this.getRun(current.id);
      if (!team || !run) return e.reply('无尽劫境状态已经失效');
      if (team.leader !== userId)
        return e.reply('队长已经发生变化，当前无法锁定劫途');
      this.ensureStarMapForRun(run);
      try {
        selectEndlessStarRoute(run, choice);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      return this.replyStarMap(e, team, run, userId);
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
      const choice = Number(e.msg.match(/[1-4]$/)?.[0]);
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
      if (result.extraChoice)
        lines.push(
          '',
          '一念双悟触发，本轮可再参悟一项能力：',
          ...this.formatChoices(run, userId)
        );
      else if (result.ready) lines.push('', ...this.formatStarPrompt(run));
      else
        lines.push(
          '',
          `仍有${Object.keys(run.pendingChoices).length}名成员尚未选择`
        );
      return e.reply(lines.join('\n'));
    });
  }

  async chooseCheckpoint(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    if (current.leader !== userId) return e.reply('只有队长可以决定十层天关的道途');
    const choice = Number(e.msg.match(/[1-3]$/)?.[0]);
    return this.withLock(e, `team:${current.id}`, async () => {
      const run = await this.getRun(current.id);
      if (!run) return e.reply('无尽劫境状态已经失效');
      let result;
      try {
        result = applyCheckpointChoice(run, choice);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      return e.reply(this.formatCheckpointResult(run, result).join('\n'));
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
        ...(run.phase === 'checkpoint'
          ? this.formatCheckpoint(run)
          : [
              ...this.formatAllChoices(run),
              '',
              ...this.formatStarPrompt(run),
            ])
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

    const layerMemberRewards = Object.values(result.layerReward?.members || {});
    const routeStart = Math.floor((Math.max(1, result.layer) - 1) / 10) * 10 + 1;

    return {
      saveId: `endless_${run.teamId}_${result.layer}_${Date.now()}`,
      layer: result.layer,
      world: result.world,
      stage: result.stage,
      stageName: this.stageText(result.stage),
      enemy: result.enemy,
      trait: result.trait,
      victory: result.victory,
      checkpoint: run.phase === 'checkpoint',
      loop: Math.floor((Math.max(1, result.layer) - 1) / 10) + 1,
      routeNodes: Array.from({ length: 10 }, (_, index) => {
        const layer = routeStart + index;
        return {
          layer,
          label: String(layer).padStart(2, '0'),
          current: layer === result.layer,
          cleared: layer <= result.layer,
        };
      }),
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
            cultivation: this.formatAmount(
              layerMemberRewards.reduce(
                (sum, reward) => sum + (Number(reward.cultivation) || 0),
                0
              )
            ),
            blood: this.formatAmount(
              layerMemberRewards.reduce(
                (sum, reward) => sum + (Number(reward.blood) || 0),
                0
              )
            ),
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
      const userId = await this.getUserId(e);
      const player = await Read_player(userId);
      const templateId = normalizeEndlessBattleTemplate(player.无尽战斗模板);
      const templateModel = getEndlessBattleTemplateModel(templateId);
      const renderData = await new Show(e).get_endlessBattleData(
        {
          ...view,
          battleTemplate: templateId,
          battleTemplateName: ENDLESS_BATTLE_TEMPLATES[templateId],
        },
        templateModel
      );
      const image = await puppeteer.screenshot(templateModel, renderData);
      if (image) {
        await e.reply(image);
        if (result.victory) {
          const nextStep = run.phase === 'checkpoint'
            ? this.formatCheckpoint(run)
            : [
                ...this.formatAllChoices(run),
                '',
                ...this.formatStarPrompt(run),
              ];
          return e.reply(nextStep.join('\n'));
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
      if (run.phase === 'checkpoint')
        return e.reply(this.formatCheckpoint(run).join('\n'));
      if (run.phase === 'settling') return this.finishSettlement(e, team, run);
      this.ensureStarMapForRun(run);
      if (!getSelectedEndlessStarNode(run, this.starTargetLayer(run))) {
        await this.saveRun(run);
        return this.replyStarMap(e, team, run, userId);
      }
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
      const blessings = (member.blessings || [])
        .map(id => getCheckpointBoon(id))
        .filter(Boolean);
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
          : '尚无能力',
        blessings.length
          ? `天关机缘：${blessings
              .map(boon => `[${boon.kind}]${boon.name}·${boon.origin}`)
              .join('、')}`
          : '天关机缘：尚无'
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
    if (run.phase === 'checkpoint')
      lines.push('', ...this.formatCheckpoint(run));
    return this.replyEndlessPanel(
      e,
      this.buildPanelView(team, run, userId),
      lines
    );
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
          const highestClearedLayer = Math.max(
            0,
            Number(run.highestClearedLayer) ||
              (run.lastBattle?.victory ? Number(run.layer) : Number(run.layer) - 1) ||
              0
          );
          player.无尽劫境最高层 = Math.max(
            Number(player.无尽劫境最高层) || 0,
            highestClearedLayer
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

  async learnEndlessKeyRecipe(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return this.withLock(e, `recipe:${userId}`, async () => {
      const player = await Read_player(userId);
      if (player[ENDLESS_KEY_RECIPE_FLAG])
        return e.reply('你已参悟【无尽秘钥配方】，可直接使用 #合成无尽秘钥*数量');
      const amount = Number(
        await exist_najie_thing(userId, ENDLESS_KEY_RECIPE_ITEM, '道具')
      ) || 0;
      if (amount < 1) return e.reply(`你尚未获得【${ENDLESS_KEY_RECIPE_ITEM}】`);

      const snapshot = structuredClone(player);
      let deducted = false;
      try {
        await Add_najie_thing(userId, ENDLESS_KEY_RECIPE_ITEM, '道具', -1);
        deducted = true;
        player[ENDLESS_KEY_RECIPE_FLAG] = true;
        await Write_player(userId, player);
      } catch (error) {
        if (deducted) {
          try {
            await Add_najie_thing(userId, ENDLESS_KEY_RECIPE_ITEM, '道具', 1);
          } catch (refundError) {
            logger.error('[无尽劫境] 配方退还失败', refundError);
          }
        }
        try {
          await Write_player(userId, snapshot);
        } catch (restoreError) {
          logger.error('[无尽劫境] 配方参悟回滚失败', restoreError);
        }
        logger.error('[无尽劫境] 配方参悟失败', error);
        return e.reply('配方参悟失败，消耗已回滚，请稍后重试');
      }
      return e.reply(
        [
          '【无尽秘钥配方已参悟】',
          '世界石×3、天外清风×8、星图×1、符纸×20',
          '发送 #合成无尽秘钥*数量 即可炼制。',
        ].join('\n')
      );
    });
  }

  async sweepEndlessRealm(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (current?.status === 'running')
      return e.reply('你正在无尽劫境中，需先退出后才能扫荡');

    return this.withLock(e, `sweep:${userId}`, async () => {
      const player = await Read_player(userId);
      const highestLayer = Math.max(
        0,
        Math.floor(Number(player.无尽劫境最高层) || 0)
      );
      if (!highestLayer)
        return e.reply('你尚无无尽劫境通关记录，无法进行扫荡');

      const keyAmount = Number(
        await exist_najie_thing(userId, ENDLESS_ENTRY_ITEM, '道具')
      ) || 0;
      const ticketAmount = Number(
        await exist_najie_thing(userId, ENDLESS_SWEEP_ITEM, '道具')
      ) || 0;
      const heart = refreshSpiritHeart(player);
      const minggeEffects = getMinggeEffects(player, data.minggeList);
      const heartCost = getSpiritHeartCost(ENDLESS_SPIRIT_HEART_COST, minggeEffects);
      const missing = [];
      if (keyAmount < 1) missing.push(`【${ENDLESS_ENTRY_ITEM}】×1`);
      if (ticketAmount < 1) missing.push(`【${ENDLESS_SWEEP_ITEM}】×1`);
      if (heart.current < heartCost) {
        missing.push(
          `心神${heartCost}点（当前${heart.current}/${heart.max}）`
        );
      }
      if (missing.length)
        return e.reply(`扫荡所需资源不足：${missing.join('、')}`);

      const reward = getEndlessSweepReward(player, highestLayer);
      const snapshot = structuredClone(player);
      const deducted = [];
      let consumed;
      let sourceStoneGain = 0;
      try {
        await Add_najie_thing(userId, ENDLESS_ENTRY_ITEM, '道具', -1);
        deducted.push(ENDLESS_ENTRY_ITEM);
        await Add_najie_thing(userId, ENDLESS_SWEEP_ITEM, '道具', -1);
        deducted.push(ENDLESS_SWEEP_ITEM);
        consumed = consumeSpiritHeart(
          player,
          ENDLESS_SPIRIT_HEART_COST,
          Date.now(),
          minggeEffects
        );
        if (!consumed.ok) throw new Error('心神状态发生变化');

        player.修为 = (Number(player.修为) || 0) + reward.cultivation;
        player.血气 = (Number(player.血气) || 0) + reward.blood;
        player.灵石 = (Number(player.灵石) || 0) + reward.lingshi;
        sourceStoneGain = calculateMinggeSourceGain(reward.sourceStone, minggeEffects);
        player.源石 = (Number(player.源石) || 0) + sourceStoneGain;
        player[ENDLESS_TOKEN] =
          (Number(player[ENDLESS_TOKEN]) || 0) + reward.tokens;
        player.无尽劫境扫荡次数 =
          (Number(player.无尽劫境扫荡次数) || 0) + 1;
        await Write_player(userId, player);
      } catch (error) {
        const failures = [];
        for (const item of deducted) {
          try {
            await Add_najie_thing(userId, item, '道具', 1);
          } catch (refundError) {
            failures.push(item);
            logger.error(`[无尽劫境] 扫荡退还${item}失败`, refundError);
          }
        }
        try {
          await Write_player(userId, snapshot);
        } catch (restoreError) {
          failures.push('心神与奖励存档');
          logger.error('[无尽劫境] 扫荡存档回滚失败', restoreError);
        }
        logger.error('[无尽劫境] 扫荡失败', error);
        return e.reply(
          failures.length
            ? `扫荡失败，${failures.join('、')}回滚失败，请联系管理员`
            : '扫荡失败，消耗已全部回滚'
        );
      }

      return e.reply(
        [
          '【无尽劫境扫荡完成】',
          `扫荡层数：第${reward.startLayer}～${reward.endLayer}层（共${reward.layers}层）`,
          `消耗：【${ENDLESS_ENTRY_ITEM}】×1、【${ENDLESS_SWEEP_ITEM}】×1、心神${consumed.cost}点`,
          `修为：+${this.formatAmount(reward.cultivation)}`,
          `血气：+${this.formatAmount(reward.blood)}`,
          `灵石：+${this.formatAmount(reward.lingshi)}`,
          `源石：+${this.formatAmount(sourceStoneGain)}`,
          `${ENDLESS_TOKEN}：+${this.formatAmount(reward.tokens)}`,
          `剩余心神：${player.心神}/${heart.max}`,
        ].join('\n')
      );
    });
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

import { data, plugin, puppeteer, Show } from '../api/api.js';
import { recordMemoryDungeon } from '../model/memoryPath.js';
import {
  Add_najie_thing,
  Read_equipment,
  Read_najie,
  Read_player,
  Write_equipment,
  Write_najie,
  Write_player,
  __PATH,
  channel,
  exist_najie_thing,
  existplayer,
  invalidateBattleEquipmentCache,
} from '../model/xiuxian.js';
import {
  applyCheckpointChoice,
  applyEndlessChoice,
  buyEndlessMerchantItem,
  createEndlessRun,
  ensureEndlessStarMapState,
  getAbility,
  getCheckpointBoon,
  getFusion,
  getEndlessMerchantState,
  getMemberStats,
  getSettlement,
  getEndlessSweepReward,
  getWorldForLayer,
  rerollEndlessChoices,
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
  WEEKEND_FREE_FIELD,
  getWeekendFreeWeekKey,
  isWeekendNow,
  hasSuiyunFreeEndlessEntry,
} from '../model/endlessAccess.js';
import {
  ENDLESS_TREASURE_UNLOCK_LAYER,
  ENDLESS_TREASURE_EFFECT_RATE,
  ENDLESS_TREASURE_EFFECT_PER_LEVEL,
  ENDLESS_TREASURE_LEVEL_CAP,
  equipEndlessTreasure,
  getEndlessTreasureSlotCost,
  getEndlessTreasureSlotGate,
  getPlayerTreasureViews,
  getTreasureAbilityName,
  getTreasureRunSummary,
  grantRandomEndlessTreasure,
  grantRandomEndlessTierTreasure,
  normalizeEndlessTreasureLoadout,
  unequipEndlessTreasure,
  unlockEndlessTreasureSlot,
  upgradeEndlessTreasure,
} from '../model/endlessTreasure.js';
import {
  equipTitle,
  getTitleEffects,
  getTitleViews,
  grantTitle,
  normalizeTitles,
  recoverEarnedTitles,
} from '../model/titleSystem.js';
import fs from 'node:fs';
import path from 'node:path';
import { AppName } from '../app.config.js';
import { FileRollbackTransaction } from './SecretPlace/rebirthTransaction.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { replyOfficialMessage } from '../model/officialMessage.js';
import {
  consumeSpiritHeart,
  getSpiritHeartMax,
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
  canPurchaseEndlessProduct,
  findEndlessProduct,
  formatFusionResult,
  formatTreasureClue,
  grantEndlessDirectReward,
  getEndlessProductRewardAmount,
  mergeSetEquipment,
} from '../model/endlessShop.js';
import {
  ENDLESS_BATTLE_TEMPLATES,
  getEndlessBattleTemplateModel,
  normalizeEndlessBattleTemplate,
} from '../model/endlessBattleTemplate.js';
import {
  ENDLESS_MAX_DIFFICULTY_TIER,
  ENDLESS_TIER_MAX_LAYER,
  canEnterEndlessDifficulty,
  formatEndlessDifficulty,
  getEndlessDifficulty,
  getEndlessLimitedPurchaseLimit,
  normalizeEndlessDifficultyProgress,
  normalizeEndlessDifficultyTier,
  recordEndlessDifficultyProgress,
  selectEndlessDifficulty,
} from '../model/endlessDifficulty.js';
import {
  formatEndlessCelestial,
  getDailyEndlessCelestial,
  getEndlessCelestialPrice,
} from '../model/endlessCelestial.js';
import RealmEvents from './tasks/RealmEvents.js';
import {
  createTianjiaoTrace,
  formatTianjiaoTrace,
  getTianjiaoRealmName,
} from '../model/tianjiaoGrowth.js';
import {
  expandEndlessPuzzleSlots,
  getEndlessMetaView,
  replaceEndlessPuzzle,
  resetEndlessMeta,
  toggleEndlessPuzzle,
  unequipEndlessPuzzle,
  upgradeEndlessMeta,
} from '../model/endlessMeta.js';
import {
  createEndlessWendaoLink,
  createEndlessWebLink,
  getEndlessWebConfig,
  serializeEndlessWebState,
  shouldAutoIssueEndlessWebTicket,
  startEndlessWebServer,
} from '../model/endlessWebServer.js';
import { worldChatClient } from './worldChat/client.js';
import {
  buildCrossRaidSnapshot,
  createCrossRaidAvatar,
  formatCrossRaidSnapshot,
  hydrateCrossRaidAvatar,
} from './worldChat/raid.js';

const STATE_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 12;
const MAX_TEAM_SIZE = 4;
const endlessWebRetryState = globalThis[Symbol.for('zhutianxiuxian.endlessWebRetry')] ??= {
  generation: 0,
  timer: null,
};

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
        { reg: '^#(?:无尽难度|劫境难度)(?:\\s*[Aa]?(?:10|[1-9]))?$', fnc: 'setEndlessDifficulty' },
        { reg: '^#(?:今日天象|无尽天象)$', fnc: 'showEndlessCelestial' },
        { reg: '^#离开无尽队伍$', fnc: 'leaveTeam' },
        { reg: '^#解散无尽队伍$', fnc: 'disbandTeam' },
        { reg: '^#发布跨服无尽$', fnc: 'publishCrossEndless' },
        { reg: '^#跨服无尽队伍$', fnc: 'listCrossEndless' },
        { reg: '^#化身跨服加入无尽\\s*[A-Fa-f0-9]{8}$', fnc: 'joinCrossEndless' },
        { reg: '^#退出跨服无尽$', fnc: 'leaveCrossEndless' },
        { reg: '^#跨服无尽状态$', fnc: 'showCrossEndless' },
        { reg: '^#跨服队伍发言\\s+.+$', fnc: 'crossEndlessChat' },
        { reg: '^#观战无尽\\s*[A-Fa-f0-9]{8}$', fnc: 'watchCrossEndless' },
        { reg: '^#退出无尽观战$', fnc: 'unwatchCrossEndless' },
        { reg: '^#跨服无尽选择\\s*[1-4]$', fnc: 'crossEndlessChoose' },
        { reg: '^#跨服星图建议\\s*[1-3]$', fnc: 'crossEndlessSuggest' },
        { reg: '^#跨服劫境商人$', fnc: 'showCrossEndless' },
        { reg: '^#跨服劫境购买\\s*[1-4]$', fnc: 'crossEndlessMerchant' },
        { reg: '^#跨服(?:刷新|重置)无尽能力$', fnc: 'crossEndlessReroll' },
        { reg: '^#开启无尽劫境$', fnc: 'startRun' },
        { reg: '^#使用他化自在体验卡$', fnc: 'useFreeTransformationCard' },
        { reg: '^#无尽网页$', fnc: 'openEndlessWeb' },
        { reg: '^#无尽问道$', fnc: 'openEndlessWendao' },
        { reg: '^#劫途星图$', fnc: 'showStarMap' },
        { reg: '^#星图建议\\s*[1-3]$', fnc: 'suggestStarRoute' },
        { reg: '^#星图情报\\s*[1-3]$', fnc: 'showStarIntel' },
        { reg: '^#星图定途\\s*[1-3]$', fnc: 'selectStarRoute' },
        { reg: '^#劫境商人$', fnc: 'showRunMerchant' },
        { reg: '^#劫境购买\\s*[1-4]$', fnc: 'buyRunMerchantItem' },
        { reg: '^#无尽选择\\s*[1-4]$', fnc: 'chooseAbility' },
        { reg: '^#(?:刷新|重置)无尽能力$', fnc: 'rerollAbilityChoices' },
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
        { reg: '^#卸下厉鬼拼图\\s*.+$', fnc: 'unequipEndlessPuzzleCmd' },
        { reg: '^#更换厉鬼拼图\\s+\\S+\\s+\\S+$', fnc: 'replaceEndlessPuzzleCmd' },
        { reg: '^#拓展厉鬼拼图槽$', fnc: 'expandEndlessPuzzleSlotsCmd' },
        { reg: '^#重置万劫道碑$', fnc: 'requestResetEndlessMeta' },
        { reg: '^#确认重置万劫道碑$', fnc: 'confirmResetEndlessMeta' },
        { reg: '^#取消重置万劫道碑$', fnc: 'cancelResetEndlessMeta' },
        { reg: '^#万象归一\\s+(?:武器|护具|法宝)\\*.+$', fnc: 'mergeEquipment' },
        { reg: '^#无尽至宝$', fnc: 'showTreasures' },
        { reg: '^#升级无尽至宝\\s*.+$', fnc: 'upgradeTreasureCmd' },
        { reg: '^#装备无尽至宝\\s*.+$', fnc: 'equipTreasureCmd' },
        { reg: '^#卸下无尽至宝\\s*.+$', fnc: 'unequipTreasureCmd' },
        { reg: '^#拓展无尽至宝槽$', fnc: 'unlockTreasureSlotCmd' },
        { reg: '^#无尽排名$', fnc: 'showEndlessRank' },
        { reg: '^#周末免费$', fnc: 'weekendStatus' },
        { reg: '^#(?:我的称号|称号列表|称号)$', fnc: 'viewTitles' },
        { reg: '^#(?:佩戴|切换|更换)称号\\s*.+$', fnc: 'equipTitleCmd' },
      ],
    });
    worldChatClient.setRaidHandler((message) =>
      this.handleCrossRaidEvent(message).catch((error) =>
        logger.error('[跨服无尽] 事件处理失败', error)
      )
    );
    endlessWebRetryState.generation += 1;
    const generation = endlessWebRetryState.generation;
    if (endlessWebRetryState.timer) clearTimeout(endlessWebRetryState.timer);
    endlessWebRetryState.timer = null;
    const startWebServer = () =>
      startEndlessWebServer(this).catch((error) => {
        if (generation !== endlessWebRetryState.generation) return;
        if (error?.message === 'Redis 尚未就绪') {
          endlessWebRetryState.timer = setTimeout(() => {
            endlessWebRetryState.timer = null;
            startWebServer();
          }, 5000);
          endlessWebRetryState.timer.unref?.();
          return;
        }
        logger.error('[无尽网页] 服务启动失败', error);
      });
    startWebServer();
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

  crossRaidHostKey(code) {
    return `Xiuxian:Endless:CrossHost:${String(code).toUpperCase()}`;
  }

  crossRaidMemberKey(userId) {
    return `Xiuxian:Endless:CrossMember:${userId}`;
  }

  crossRaidTagKey(code, tag) {
    return `Xiuxian:Endless:CrossTag:${String(code).toUpperCase()}:${tag}`;
  }

  crossRaidWatchKey(userId) {
    return `Xiuxian:Endless:CrossWatch:${userId}`;
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
    const team = await this.getTeam(run.teamId);
    if (team?.crossRaidCode && run.phase !== 'settling') {
      worldChatClient
        .updateRaid(
          team.crossRaidCode,
          buildCrossRaidSnapshot(team, run, {
            resolveAbility: getAbility,
            starOptions: getEndlessStarOptions(run),
            merchant: getEndlessMerchantState(run),
          }),
          'in_battle'
        )
        .catch((error) => logger.warn('[跨服无尽] 战况同步失败', error?.message || error));
    }
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
    if (team.crossRaidCode) {
      if (team.status === 'lobby') {
        worldChatClient.closeRaid(team.crossRaidCode, 'closed').catch(() => {});
      }
      await redis.del(this.crossRaidHostKey(team.crossRaidCode));
    }
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
      ...(member.choiceRerollsRemaining > 0 && member.pendingDoubleChoiceCycle == null
        ? [`${member.name}还可发送 #刷新无尽能力 重演本次选项`]
        : []),
      `${member.name}发送 #无尽选择${choices.map((_, index) => index + 1).join('/')}`,
    ];
  }

  formatEndlessMeta(view) {
    const equipped = new Set(view.meta.equippedPuzzles);
    const nodeLines = view.nodes.map(node => {
      const next = node.branchLocked
        ? `已锁定${view.effects.branchName}流派`
        : node.rank >= node.maxRank
          ? '已圆满'
          : `下一级${node.nextCost}道痕${node.nextGate ? `，需最高通过${node.nextGate}层` : ''}`;
      const type = node.branch ? '[流派]' : node.puzzle ? '[拼图]' : '[道碑]';
      return `${type} ${node.name} Lv.${node.rank}/${node.maxRank} · ${next}\n  ${node.description}`;
    });
    const equippedNames = view.nodes
      .filter(node => equipped.has(node.id))
      .map(node => node.name);
    return [
      '【万劫道碑·局外传承】',
      `劫境道痕：${view.balance}｜最高通过：${view.highestLayer}层`,
      `当前流派：${view.effects.branchName || '未选择（首次参悟后锁定）'}`,
      `厉鬼拼图：${equipped.size}/${view.puzzleSlots}（${equippedNames.join('、') || '未装配'}）`,
      '羁绊：鬼眼+鬼影提升15%全属性；六层与七层完整拼图会分别升华为25%和45%全属性共鸣。',
      'Boss前未封存的道痕在团灭时仅保留30%，主动撤离全额保留。',
      '',
      ...nodeLines,
      '',
      '#参悟道碑 名称',
      '#装配厉鬼拼图 名称｜#卸下厉鬼拼图 名称',
      '#更换厉鬼拼图 旧名称 新名称｜#拓展厉鬼拼图槽（2500道痕）',
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
          treasures: [],
        };
      const stats = getMemberStats(run, id);
      const abilities = Object.entries(member.abilities || {})
        .map(([abilityId, level]) => ({
          name: getAbility(abilityId)?.name || getTreasureAbilityName(abilityId) || abilityId,
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
        treasures: getTreasureRunSummary(member, run),
        eventBuffs: [
          member.eventBuffs?.freeTransformationOpeningCount >= 3
            ? '三身映照·开场3尊'
            : null,
          member.eventBuffs?.skillReplayChance
            ? `回响重放·${Math.round(member.eventBuffs.skillReplayChance * 100)}%`
            : null,
          member.eventBuffs?.attackPct
            ? `破境战血·攻击+${Math.round(member.eventBuffs.attackPct * 100)}%`
            : null,
        ].filter(Boolean),
        titleId: member.titleId || null,
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
        selected.gambit ? `定轨赌约：${selected.gambit.name} · ${selected.gambit.description}` : null,
        selected.merchant ? `界海商队已经开市，先发送 #劫境商人 分配孤品；也可直接继续。` : null,
        selected.assist ? `${selected.assist.name}将以《${selected.assist.skill}》助战${selected.assist.rounds}回合。` : null,
        run.phase === 'ready'
          ? '队长发送 #无尽下一关 踏入该节点'
          : '完成全队能力选择后，由队长发送 #无尽下一关',
      ].filter(Boolean);
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
    const nodesById = new Map(
      map.rows.flatMap(row => row.nodes).map(node => [node.id, node])
    );
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
          `   赌约：${node.gambit?.name || '无'} · ${node.gambit?.description || '规则保持原状'}`,
          `   ${node.rewardText}｜后继：${(node.nextNodeIds || []).map(id => nodesById.get(id)?.shortName || '迷雾').join('/') || '天关终点'}`
        );
    }
    if (selected) {
      lines.push(
        '',
        `已锁定：【${selected.shortName}】${selected.worldName}`,
        selected.decision ? `队伍博弈：${selected.decision.name} · ${selected.decision.description}` : null,
        selected.calamity ? `灾厄显形：${selected.calamity.name} · ${selected.calamity.description}` : null,
        selected.assist ? `异界强援：${selected.assist.name} · ${selected.assist.skill}（${selected.assist.rounds}回合）` : null,
        selected.merchant ? `界海商人：${selected.merchant.name}｜发送 #劫境商人 查看货架` : null
      );
    }
    else if (options.length)
      lines.push(
        '',
        `#星图建议${options.map((_, index) => index + 1).join('/')}｜队长：#星图定途${options.map((_, index) => index + 1).join('/')}`
      );
    if (run.phase === 'checkpoint')
      lines.push('', '本轮劫环已走完，请先完成 #劫后抉择1/2/3');
    return lines.filter(line => line !== null);
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
            rewardText: `${node.rewardText}｜${node.gambit?.name || '守成之契'}｜后继${node.nextNodeIds?.length || 0}路`,
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
          ? {
              tone: 'danger',
              title: selected.calamity?.name || selected.decision?.name || '因果锁定',
              text: selected.calamity?.description || selected.decision?.description || `队伍将踏入【${selected.name}】，定途后本层无法更改。`,
            }
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
        : selected?.merchant
          ? '#劫境商人'
          : selected
            ? '#无尽下一关'
          : `#星图定途${commandRange}`,
      footerNote: run.phase === 'checkpoint'
        ? '十方天关已破，先完成劫后问道，下一轮劫环才会显化。'
        : '每个节点只连接部分后继道路；定途后旁支熄灭，本轮无法折返或切换。',
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
        saveId: `endless_panel_${e.user_id}_${view.mode}`,
        ...view,
        renderScale: 2,
        imgType: 'png',
      });
      const image = view.mode === 'help'
        ? await puppeteer.screenshots('endless_panel', renderData)
        : await puppeteer.screenshot('endless_panel', renderData);
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
        { label: '入境代价', value: '秘钥 × 1', note: `基础心神 ${ENDLESS_SPIRIT_HEART_COST}｜岁云五阶免秘钥心神` },
        { label: '天关循环', value: '10 层', note: '第5层精英 · 第10层Boss' },
        { label: '常规至宝', value: `第${ENDLESS_TREASURE_UNLOCK_LAYER}关`, note: '每趟解锁一件随机至宝' },
      ],
      notices: [
        { tone: 'jade', title: '构筑法则', text: '每层独立选择能力；衍算天机可增加选项，一念双悟可在每个十层循环额外参悟一次。' },
        { tone: 'danger', title: '劫境警示', text: '主动撤离可带回全部战利品；团灭仅保留已封存奖励和30%未封存奖励。' },
        { tone: 'gold', title: '无尽至宝', text: `第25层开放首个普通装配槽；至宝可消耗道痕升至Lv.${ENDLESS_TREASURE_LEVEL_CAP}，每级显著提高属性效能。` },
        { tone: 'gold', title: '岁云剑尊', text: '岁云系列五阶段本人按入境灵根投影自动带入本命至宝，独立专属位、无需通关25层；换根后的新一局重验资格，升级等级保留。' },
        { tone: 'danger', title: '因果岔路', text: '星图加入随机分叉、定轨赌约、投票博弈、界海商队、异界强援与不可名状灾厄；选择后本轮无法反悔。' },
        { tone: 'jade', title: '无尽劫境天尊', text: '打穿第三十关且全服排名第一的队伍成员，将获得专属称号：无尽劫境内全属性+25%、道痕收益+25%，可自由佩戴与更换。' },
      ],
      commandGroups: [
        {
          kicker: 'ASSEMBLE',
          title: '结队入境',
          items: [
            { command: '#创建无尽队伍', description: '在当前群建立一支远征队伍' },
            { command: '#加入无尽队伍 123456', description: '凭六位队伍编号加入同行者' },
            { command: '#无尽队伍', description: '查看成员、层数、命火与待选能力' },
            { command: '#开启无尽劫境', description: '普通成员消耗秘钥心神；岁云五阶免入场代价' },
            { command: '#离开无尽队伍', description: '离开尚未开启的远征队伍' },
            { command: '#解散无尽队伍', description: '由队长解散尚未开启的远征队伍' },
            { command: '#无尽网页', description: '打开无尽劫境网页面板' },
            { command: '#无尽问道', description: '进入修仙肉鸽卡牌玩法' },
          ],
        },
        {
          kicker: 'DESCEND',
          title: '劫境行动',
          items: [
            { command: '#无尽选择1', description: '铭刻当前层的一项诸天能力' },
            { command: '#刷新无尽能力', description: '参悟劫机重演后，每局可重演一次当前选项' },
            { command: '#无尽下一关', description: '全员完成抉择后由队长推进' },
            { command: '#劫后抉择1', description: 'Boss战后选择归息、机缘或升华' },
            { command: '#无尽构筑', description: '检视队伍属性、能力、机缘与共鸣' },
            { command: '#劫途星图', description: '查看本轮劫环、天象与因果路线' },
            { command: '#星图建议1', description: '队员为下一条劫途提出建议' },
            { command: '#星图情报1', description: '查看路线代价、敌方增幅与奖励倍率' },
            { command: '#星图定途1', description: '由队长锁定下一层因果' },
            { command: '#劫境商人', description: '查看当前商队的局内孤品货架' },
            { command: '#劫境购买1', description: '消耗共享未封存道痕强化个人投影' },
          ],
        },
        {
          kicker: 'ASCEND',
          title: '局外传承',
          items: [
            { command: '#万劫道碑', description: '查看永久强化路线与厉鬼拼图' },
            { command: '#参悟道碑 攻击', description: '消耗劫境道痕提升局外传承' },
            { command: '#装配厉鬼拼图 八音盒', description: '装配已参悟拼图，获得鬼眼后生效' },
            { command: '#拓展厉鬼拼图槽', description: '消耗2500道痕增加一个携带槽' },
            { command: '#更换厉鬼拼图 鬼影 八音盒', description: '替换已装配拼图，也可单独卸下' },
            { command: '#无尽商店', description: '以劫境道痕购买诸天遗珍' },
            { command: '#无尽购买 商品名*数量', description: '按商品名或编号购买诸天遗珍' },
            { command: '#无尽至宝', description: '查看永久至宝、灵根专属位与觉醒条件' },
            { command: '#升级无尽至宝 名称', description: '消耗劫境道痕提升至宝等级与属性效能' },
            { command: '#装备无尽至宝 名称', description: '将持有至宝装入普通槽；灵根专属自动生效' },
            { command: '#拓展无尽至宝槽', description: '达到对应层数后消耗道痕开启下一槽' },
            { command: '#重置万劫道碑 / #确认重置万劫道碑', description: '二次确认后返还道痕并重置传承' },
            { command: '#万象归一 武器/护具/法宝*装备名', description: '消耗归一神符融合百分比装备' },
          ],
        },
        {
          kicker: 'HONOR',
          title: '周末·排名·称号',
          items: [
            { command: '#周末免费', description: '查询周末免费入场额度（每周末一次）' },
            { command: '#无尽排名', description: '查看万界劫榜与你的全服排名' },
            { command: '#称号 / #我的称号', description: '查看已拥有称号与当前佩戴' },
            { command: '#佩戴称号 无尽劫境天尊', description: '佩戴/更换称号，局内加成立即生效' },
          ],
        },
        {
          kicker: 'RETURN',
          title: '撤离与扫荡',
          items: [
            { command: '#退出无尽劫境', description: '由队长主动结算并保留全部所得' },
            { command: '#扫荡无尽劫境', description: `消耗扫荡券；普通成员另需秘钥与${ENDLESS_SPIRIT_HEART_COST}心神，岁云免除后二项` },
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
            { tone: run.celestialPhenomenon?.tone || 'normal', title: `天象·${run.celestialPhenomenon?.name || '万象平稳'}`, text: run.celestialPhenomenon?.description || '诸天规则暂时平稳。' },
            { tone: run.phase === 'ready' ? 'jade' : 'normal', title: '当前进程', text: phase },
            run.phase === 'checkpoint'
              ? { tone: 'danger', title: '十方天关', text: '本轮劫环已完成，等待队长进行劫后问道。' }
              : selectedStar
                ? { tone: 'jade', title: '劫途已定', text: `第${this.starTargetLayer(run)}层将踏入【${selectedStar.name}】。` }
                : { tone: 'danger', title: '因果未定', text: '发送 #劫途星图 观测路线，队长定途后方可推进。' },
          ]
        : [
            { tone: 'gold', title: formatEndlessDifficulty(team.difficultyTier), text: `本阶打穿${ENDLESS_TIER_MAX_LAYER}层后完成首通，并解锁下一难度。` },
            { tone: 'jade', title: '入境准备', text: `每名普通成员需要【${ENDLESS_ENTRY_ITEM}】×1与基础心神${ENDLESS_SPIRIT_HEART_COST}点；岁云五阶段本人免除两项入场代价。` },
          ],
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
            : selectedStar?.merchant
              ? '#劫境商人'
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
      title: `${formatEndlessDifficulty(run.difficultyTier)} · 第${run.layer}层`,
      subtitle: '能力、天关机缘与跨世界共鸣共同塑造本次投影；局外道碑加成已经计入下列属性。',
      mark: String(run.layer).padStart(2, '0'),
      status: this.phaseText(run.phase),
      heroStats: [
        { label: '当前进度', value: `${run.layer} / ${ENDLESS_TIER_MAX_LAYER}`, note: formatEndlessDifficulty(run.difficultyTier) },
        { label: '共享命火', value: `${run.lifeFire} / ${run.maxLifeFire}`, note: '全队共用' },
        { label: '诸天共鸣', value: run.fusions.length, note: '已激活组合流派' },
        { label: '待选投影', value: Object.keys(run.pendingChoices || {}).length, note: this.phaseText(run.phase) },
      ],
      team: { id: team.id },
      members: this.panelMembers(team, run, userId, true),
      fusions: run.fusions.map(id => getFusion(id)?.name || id),
      choiceGroups: this.panelChoiceGroups(run, [userId]),
      notices: [{
        tone: run.celestialPhenomenon?.tone || 'normal',
        title: `天象·${run.celestialPhenomenon?.name || '万象平稳'}`,
        text: run.celestialPhenomenon?.description || '诸天规则暂时平稳。',
      }],
      checkpoint: run.phase === 'checkpoint' ? this.panelCheckpoint(run) : null,
      treasury: {
        bankedLingshi: this.formatAmount(run.banked.lingshi),
        bankedSourceStone: this.formatAmount(run.banked.sourceStone),
        bankedTokens: this.formatAmount(run.banked.tokens),
        unbankedLingshi: this.formatAmount(run.unbanked.lingshi),
        unbankedSourceStone: this.formatAmount(run.unbanked.sourceStone),
        unbankedTokens: this.formatAmount(run.unbanked.tokens),
      },
      footerCommand: run.phase === 'ready'
        ? getEndlessMerchantState(run) ? '#劫境商人' : '#无尽下一关'
        : '#无尽选择 序号',
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
      locked: node.branchLocked || (node.rank < node.maxRank && view.highestLayer < node.nextGate),
      equipped: equipped.has(node.id),
      next: node.branchLocked
        ? `已锁定${view.effects.branchName}流派`
        : node.rank >= node.maxRank
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
        { label: '拼图槽位', value: `${view.meta.equippedPuzzles.length} / ${view.puzzleSlots}`, note: '每次拓展消耗2500道痕' },
        { label: '已耗道痕', value: this.formatAmount(view.meta.spent), note: '重置返还其中90%' },
      ],
      notices: [
        { tone: 'jade', title: '流派抉择', text: `当前：${view.effects.branchName || '未选择'}。治疗师、破阵师、守护者三选一，整碑重置后才可改换。` },
        { tone: 'jade', title: '厉鬼拼图', text: '局外装配后，仍需在本局获得【鬼眼】才会激活拼图属性与机制。' },
        { tone: 'gold', title: '鬼眼羁绊', text: '六层完整拼图可反噬肢解；七层由许愿鬼重启自身，实现无代价肢解；八层解锁攻击无效与行动封禁；九层解锁防御抹除及高额逻辑反噬的必杀许愿。' },
        { tone: 'danger', title: '死亡代价', text: 'Boss前未封存道痕在团灭时只保留30%；主动撤离可以全额带回。' },
      ],
      metaNodes,
      puzzleNodes,
      puzzleEquipped: view.meta.equippedPuzzles.length,
      puzzleSlots: view.puzzleSlots,
      footerCommand: '#参悟道碑 名称',
      footerNote: '拼图支持装配、卸下与更换；#拓展厉鬼拼图槽 每次消耗2500道痕。',
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
    const refund = Math.floor(view.meta.spent * 0.9);
    const text = `重置将返还已消耗劫境道痕的90%（预计${refund}），并清空全部传承与拼图。\n60秒内发送 #确认重置万劫道碑`;
    return replyOfficialMessage(e, {
      markdown: [
        '# 重置万劫道碑',
        '',
        `**预计返还：** ${refund}劫境道痕`,
        '',
        '> 将清空全部传承与厉鬼拼图，仅返还已消耗道痕的90%。',
        '',
        '请在60秒内确认。',
      ].join('\n'),
      text,
      buttons: [[
        { text: '确认重置', command: '#确认重置万劫道碑' },
        { text: '保留道碑', command: '#取消重置万劫道碑' },
      ]],
    });
  }

  async cancelResetEndlessMeta(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    await redis.del(this.metaResetKey(userId));
    return e.reply('已取消重置，万劫道碑保持原状。');
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
        `1～${MAX_TEAM_SIZE}人组队，普通成员入场消耗【${ENDLESS_ENTRY_ITEM}】×1、心神${ENDLESS_SPIRIT_HEART_COST}点；岁云五阶段本人免秘钥心神`,
        '每层击退怪潮后独立三选一；每5层精英，每10层位面Boss并开启劫后问道。',
        '他化自在法仅在Boss后的诸天垂青中以极低概率显化。',
        '岁云系列五阶段本人按入境灵根投影自动带入【岁云剑尊】，独立专属位、无需通关25层；换根后的新一局重验资格，升级等级保留。',
        '',
        '#创建无尽队伍',
        '#加入无尽队伍 123456',
        '#无尽队伍',
        '#无尽难度 / #无尽难度 A2',
        '#今日天象',
        '#发布跨服无尽 / #跨服无尽队伍',
        '#化身跨服加入无尽 房间码',
        '#跨服无尽状态 / #退出跨服无尽',
        '#跨服队伍发言 内容',
        '#观战无尽 房间码 / #退出无尽观战',
        '#跨服无尽选择1 / #跨服星图建议1',
        '#跨服劫境商人 / #跨服劫境购买1',
        '#跨服刷新无尽能力',
        '#开启无尽劫境',
        '#无尽问道',
        '#劫途星图 / #星图情报1',
        '#星图建议1 / #星图定途1',
        '#劫境商人 / #劫境购买1',
        '#无尽选择1',
        '#刷新无尽能力',
        '#万劫道碑 / #参悟道碑 攻击',
        '#装配厉鬼拼图 八音盒',
        '#卸下厉鬼拼图 八音盒 / #更换厉鬼拼图 鬼影 八音盒',
        '#拓展厉鬼拼图槽',
        '#无尽至宝 / #装备无尽至宝 名称 / #卸下无尽至宝 名称',
        '#升级无尽至宝 名称',
        '#拓展无尽至宝槽',
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
        `扫荡消耗【${ENDLESS_SWEEP_ITEM}】×1；普通成员另需秘钥×1与心神${ENDLESS_SPIRIT_HEART_COST}点，岁云免除后二项，结算最高层向前最多10层。`,
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
    const celestial = getDailyEndlessCelestial();
    const day = celestial.dateKey;
    const legacyDay = day.replace(/-0(\d)/g, '-$1');
    const products = ENDLESS_SHOP.map((item, index) => {
      const bought = [...new Set([day, legacyDay])].reduce(
        (sum, recordDay) => sum +
          (Number(player.无尽商店购买记录?.[`${recordDay}:${item.id}`]) || 0),
        0
      );
      const dailyLimit = getEndlessLimitedPurchaseLimit(
        player,
        item.dailyLimit,
        celestial
      );
      const price = getEndlessCelestialPrice(item.price, celestial);
      const remaining = dailyLimit
        ? Math.max(0, dailyLimit - bought)
        : null;
      return {
        ...item,
        index: String(index + 1).padStart(2, '0'),
        tone: item.category || '寻常',
        wide: [7, 9, 12].includes(item.id),
        price: this.formatAmount(price),
        basePrice: item.price,
        dailyLimit,
        limitText: dailyLimit ? `今日限购 ${dailyLimit}` : '',
        stockText: dailyLimit ? `今日余 ${remaining}` : '不限购',
        soldOut: remaining === 0,
      };
    });
    const featured = products.find(item => item.id === 8) || products[0];
    const catalogProducts = products.filter(item => item !== featured);
    try {
      const renderData = await new Show(e).get_endlessShopData({
        saveId: `endless_shop_${userId}`,
        playerName: player.名号 || `无名修士${String(userId).slice(-4)}`,
        tokenAmount: this.formatAmount(player[ENDLESS_TOKEN]),
        date: day,
        productCount: products.length,
        products,
        featured,
        catalogProducts,
        celestial,
      });
      const image = await puppeteer.screenshot('endless_shop', renderData);
      if (image) return e.reply(image);
    } catch (error) {
      logger.error('[无尽商店] 商店图片生成失败', error);
    }

    const lines = [
      '【无尽商店】',
      `${ENDLESS_TOKEN}：${this.formatAmount(player[ENDLESS_TOKEN])}`,
      `今日天象：${celestial.name}｜${celestial.description}`,
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
      if (!canPurchaseEndlessProduct(player, product))
        return e.reply(`购买【${product.name}】需达到准仙帝境界`);
      const celestial = getDailyEndlessCelestial();
      const day = celestial.dateKey;
      const legacyDay = day.replace(/-0(\d)/g, '-$1');
      player.无尽商店购买记录 ||= {};
      for (const key of Object.keys(player.无尽商店购买记录)) {
        if (!key.startsWith(`${day}:`) && !key.startsWith(`${legacyDay}:`))
          delete player.无尽商店购买记录[key];
      }
      const recordKey = `${day}:${product.id}`;
      const bought = [...new Set([day, legacyDay])].reduce(
        (sum, recordDay) => sum +
          (Number(player.无尽商店购买记录[`${recordDay}:${product.id}`]) || 0),
        0
      );
      const dailyLimit = getEndlessLimitedPurchaseLimit(
        player,
        product.dailyLimit,
        celestial
      );
      if (dailyLimit && bought + amount > dailyLimit)
        return e.reply(`【${product.name}】今日限购${dailyLimit}件，你今天已购买${bought}件`);
      const unitPrice = getEndlessCelestialPrice(product.price, celestial);
      const cost = unitPrice * amount;
      const rewardAmount = getEndlessProductRewardAmount(product, amount);
      if ((Number(player[ENDLESS_TOKEN]) || 0) < cost)
        return e.reply(`${ENDLESS_TOKEN}不足：需要${cost}，当前${Number(player[ENDLESS_TOKEN]) || 0}`);

      const original = JSON.parse(JSON.stringify(player));
      player[ENDLESS_TOKEN] = (Number(player[ENDLESS_TOKEN]) || 0) - cost;
      player.无尽商店购买记录[recordKey] =
        (Number(player.无尽商店购买记录[recordKey]) || 0) + amount;
      grantEndlessDirectReward(player, product, rewardAmount);
      try {
        await Write_player(userId, player);
        if (product.action === 'item')
          await Add_najie_thing(userId, product.name, product.itemClass, rewardAmount);
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
            all_held: '所有未认主至宝均被天骄持有',
            all_manifested: '所有未认主至宝都已显化',
          };
          return e.reply(`${reasons[treasureEvent.reason] || '天机未能引动至宝'}，本次购买未消耗劫境道痕`);
        }
        await RealmEvents.broadcastEvent(treasureEvent.message);
      }

      let tianjiaoClue = null;
      if (product.action === 'tianjiao') {
        tianjiaoClue = this.resolveTianjiaoTianji(player, userId);
        if (!tianjiaoClue.ok) {
          await Write_player(userId, original);
          return e.reply(`${tianjiaoClue.message}，本次购买未消耗劫境道痕`);
        }
        await Write_player(userId, player);
      }

      const lines = [
        '【无尽商店·购买成功】',
        `${product.name}×${rewardAmount}`,
        `消耗${ENDLESS_TOKEN}：${cost}`,
        `今日天象：${celestial.name}（单价${unitPrice}）`,
        `剩余${ENDLESS_TOKEN}：${player[ENDLESS_TOKEN]}`,
      ];
      if (treasureEvent) lines.push('', ...formatTreasureClue(treasureEvent.eventData));
      if (tianjiaoClue?.ok) {
        lines.push(
          '',
          '【天骄位置天机·显化】',
          `天机锁定：${tianjiaoClue.tianjiao.名号}`,
          `当前境界：${tianjiaoClue.realm || tianjiaoClue.tianjiao.境界 || '未知'}`,
          `当前位置：${formatTianjiaoTrace(tianjiaoClue.trace)}`,
          '踪迹24小时内有效，抵达后可发送 #讨伐天骄 ' + tianjiaoClue.tianjiao.名号,
        );
      }
      return e.reply(lines.join('\n'));
    });
  }

  // 无尽商店「天骄位置天机」：随机锁定一位天骄的当前踪迹（24小时有效）
  resolveTianjiaoTianji(player, userId) {
    const list = Array.isArray(data.weimiantianjiao_list)
      ? data.weimiantianjiao_list.filter(item => item && item.名号)
      : [];
    if (list.length === 0) return { ok: false, message: '诸天暂无可查探的天骄踪迹' };
    const tianjiao = list[Math.floor(Math.random() * list.length)];
    player.天骄踪迹 ||= {};
    player.天骄踪迹[tianjiao.名号] = createTianjiaoTrace(tianjiao, {
      source: '无尽商店·天机',
      now: Date.now(),
    });
    return {
      ok: true,
      tianjiao,
      trace: player.天骄踪迹[tianjiao.名号],
      realm: getTianjiaoRealmName(
        tianjiao,
        data.Levelmijing_list || [],
        data.xiangujinshi_list || [],
        data.huafen_list || [],
      ),
    };
  }

  async mergeEquipment(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const match = e.msg.match(/^#万象归一\s+(武器|护具|法宝)\*(.+)$/);
    if (!match) return e.reply('#万象归一 武器/护具/法宝*百分比装备名');
    const slot = match[1];
    const sourceName = match[2].trim();
    return this.withLock(e, `fusion:${userId}`, () => withPlayerMutationLock(userId, async () => {
      const originalEquipment = await Read_equipment(userId);
      const najie = await Read_najie(userId);
      let merged;
      try {
        merged = mergeSetEquipment(originalEquipment, najie, slot, sourceName);
      } catch (error) {
        return e.reply(error.message);
      }
      const transaction = new FileRollbackTransaction();
      transaction.capture(path.join(__PATH.player_path, `${userId}.json`));
      transaction.capture(path.join(__PATH.equipment_path, `${userId}.json`));
      transaction.capture(path.join(__PATH.najie_path, `${userId}.json`));
      try {
        await Write_najie(userId, merged.najie);
        await Write_equipment(userId, merged.equipment);
        transaction.commit();
      } catch (error) {
        try {
          transaction.rollback();
        } catch (rollbackError) {
          logger.error(`[万象归一] 三文件回滚失败 player=${userId}`, rollbackError);
        } finally {
          invalidateBattleEquipmentCache(userId);
        }
        logger.error(`[万象归一] 熔铸失败 player=${userId}`, error);
        return e.reply('万象归一失败，装备与材料状态已回滚，请稍后再试');
      }
      return e.reply(formatFusionResult(merged, originalEquipment).join('\n'));
    }));
  }

  async unequipEndlessPuzzleCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#卸下厉鬼拼图\s*/, '').trim();
    return this.withLock(e, `meta:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = unequipEndlessPuzzle(player, input);
        await Write_player(userId, player);
        const view = getEndlessMetaView(player);
        return e.reply(`已卸下【${result.node.name}】（${view.meta.equippedPuzzles.length}/${view.puzzleSlots}）`);
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  async replaceEndlessPuzzleCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const [from, to] = String(e.msg || '')
      .replace(/^#更换厉鬼拼图\s*/, '')
      .trim()
      .split(/\s+/);
    return this.withLock(e, `meta:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = replaceEndlessPuzzle(player, from, to);
        await Write_player(userId, player);
        return e.reply(`厉鬼拼图已由【${result.from.name}】更换为【${result.to.name}】`);
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  async expandEndlessPuzzleSlotsCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return this.withLock(e, `meta:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = expandEndlessPuzzleSlots(player);
        await Write_player(userId, player);
        return e.reply(`厉鬼拼图槽已拓展至${result.slots}个\n消耗道痕：${result.cost}｜剩余：${result.balance}`);
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  async readCrossJson(key) {
    const raw = await redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      await redis.del(key);
      return null;
    }
  }

  async writeCrossJson(key, value) {
    await redis.set(key, JSON.stringify(value), { EX: STATE_TTL_SECONDS });
  }

  async withInternalLock(scope, action) {
    const key = this.lockKey(scope);
    const token = `${Date.now()}:${Math.random()}`;
    if (!(await redis.set(key, token, { EX: LOCK_TTL_SECONDS, NX: true }))) return false;
    try {
      await action();
      return true;
    } finally {
      if ((await redis.get(key)) === token) await redis.del(key);
    }
  }

  async consumeCrossEndlessEntry(userId) {
    const player = await Read_player(userId);
    const original = structuredClone(player);
    const suiyunFree = hasSuiyunFreeEndlessEntry(player);
    const freeWeekKey = getWeekendFreeWeekKey();
    const freeAvailable = !suiyunFree && isWeekendNow() && player[WEEKEND_FREE_FIELD] !== freeWeekKey;
    let heartCost = 0;
    let keyDeducted = false;
    if (!suiyunFree && !freeAvailable) {
      const amount = Number(await exist_najie_thing(userId, ENDLESS_ENTRY_ITEM, '道具')) || 0;
      if (amount < 1) return { ok: false, reason: `缺少【${ENDLESS_ENTRY_ITEM}】` };
      const heart = refreshSpiritHeart(player);
      heartCost = getSpiritHeartCost(
        ENDLESS_SPIRIT_HEART_COST,
        getMinggeEffects(player, data.minggeList)
      );
      if (heart.current < heartCost)
        return { ok: false, reason: `心神不足：${heart.current}/${heart.max}，需要${heartCost}` };
    }
    try {
      if (freeAvailable) player[WEEKEND_FREE_FIELD] = freeWeekKey;
      else if (!suiyunFree) {
        await Add_najie_thing(userId, ENDLESS_ENTRY_ITEM, '道具', -1);
        keyDeducted = true;
        const consumed = consumeSpiritHeart(player, heartCost);
        if (!consumed.ok) throw new Error('spirit_changed');
      }
      await Write_player(userId, player);
      return {
        ok: true,
        player,
        charge: { freeAvailable, freeWeekKey, heartCost, keyDeducted, suiyunFree, refunded: false },
      };
    } catch (error) {
      if (keyDeducted) await Add_najie_thing(userId, ENDLESS_ENTRY_ITEM, '道具', 1).catch(() => {});
      await Write_player(userId, original).catch(() => {});
      throw error;
    }
  }

  async refundCrossEndlessEntry(ledger) {
    if (!ledger?.charge || ledger.charge.refunded) return true;
    if (ledger.charge.suiyunFree) {
      ledger.charge.refunded = true;
      ledger.status = 'left';
      await this.writeCrossJson(this.crossRaidMemberKey(ledger.userId), ledger);
      return true;
    }
    const player = await Read_player(ledger.userId);
    refreshSpiritHeart(player);
    if (ledger.charge.freeAvailable && player[WEEKEND_FREE_FIELD] === ledger.charge.freeWeekKey)
      delete player[WEEKEND_FREE_FIELD];
    if (ledger.charge.heartCost)
      player.心神 = Math.min(
        getSpiritHeartMax(player),
        Math.max(0, Number(player.心神) || 0) + ledger.charge.heartCost
      );
    if (ledger.charge.keyDeducted)
      await Add_najie_thing(ledger.userId, ENDLESS_ENTRY_ITEM, '道具', 1);
    await Write_player(ledger.userId, player);
    ledger.charge.refunded = true;
    ledger.status = 'left';
    await this.writeCrossJson(this.crossRaidMemberKey(ledger.userId), ledger);
    return true;
  }

  async publishCrossEndless(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const team = await this.getPlayerTeam(userId);
    if (!team || team.leader !== userId) return e.reply('只有队长可以发布跨服无尽招募');
    if (!this.isTeamGroup(e, team)) return e.reply('请回到无尽队伍所在群进行操作');
    if (team.status !== 'lobby') return e.reply('队伍已进入劫境');
    if (team.members.length >= MAX_TEAM_SIZE) return e.reply('本服队伍已满员');
    if (!worldChatClient.authed) return e.reply('世界总机仍在重连，请稍后再试');
    const result = await worldChatClient.openRaid({
      team_id: `endless_${team.id}`,
      boss: '无尽劫境',
      local_members: team.members.length,
      max_members: MAX_TEAM_SIZE,
    });
    if (!result.ok) return e.reply('跨服无尽招募发布失败，请稍后再试');
    team.crossRaidCode = result.raid.code;
    team.localMembers = [...team.members];
    await this.saveTeam(team);
    await redis.set(this.crossRaidHostKey(result.raid.code), team.id, { EX: STATE_TTL_SECONDS });
    const leader = await Read_player(userId);
    worldChatClient.pub(
      `【跨服无尽招募】${team.memberNames[userId]}正在召集诸天化身，房间码：${result.raid.code}，发送「#化身跨服加入无尽 ${result.raid.code}」加入，或「#观战无尽 ${result.raid.code}」观战。`,
      { name: leader.名号 || team.memberNames[userId], tag: worldChatClient.userTag(userId) }
    ).catch(() => {});
    return e.reply([
      '【跨服无尽招募已发布】',
      `房间码：${result.raid.code}`,
      `当前人数：${team.members.length}/${MAX_TEAM_SIZE}`,
      `加入：#化身跨服加入无尽 ${result.raid.code}`,
      `观战：#观战无尽 ${result.raid.code}`,
    ].join('\n'));
  }

  async listCrossEndless(e) {
    if (!worldChatClient.authed) return e.reply('世界总机仍在重连，请稍后再试');
    const result = await worldChatClient.listRaids();
    const raids = (result.raids || []).filter((raid) =>
      raid.boss === '无尽劫境' && raid.status === 'recruiting'
    );
    if (!raids.length) return e.reply('当前没有招募中的跨服无尽队伍');
    return e.reply([
      '【跨服无尽队伍】',
      ...raids.map((raid) =>
        `${raid.code}｜${raid.host_name}｜${raid.local_members + raid.members.length}/${raid.max_members || MAX_TEAM_SIZE}`
      ),
      '加入：#化身跨服加入无尽 房间码',
      '观战：#观战无尽 房间码',
    ].join('\n'));
  }

  async joinCrossEndless(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    if (await this.getPlayerTeam(userId)) return e.reply('你已在本服无尽队伍中');
    const previous = await this.readCrossJson(this.crossRaidMemberKey(userId));
    if (previous && ['joined', 'in_battle'].includes(previous.status))
      return e.reply('你的化身已在跨服无尽队伍中');
    if (previous?.code && previous?.memberTag)
      await redis.del(this.crossRaidTagKey(previous.code, previous.memberTag));
    const code = e.msg.match(/([A-Fa-f0-9]{8})/)?.[1]?.toUpperCase();
    const raidResult = await worldChatClient.getRaid(code);
    if (!raidResult.ok || raidResult.raid?.boss !== '无尽劫境')
      return e.reply('该跨服无尽房间已失效');
    const entry = await this.consumeCrossEndlessEntry(userId);
    if (!entry.ok) return e.reply(`跨服投影入场条件未满足：${entry.reason}`);
    const memberTag = worldChatClient.userTag(userId);
    const joined = await worldChatClient.joinRaid(
      code,
      createCrossRaidAvatar(entry.player),
      memberTag
    );
    if (!joined.ok) {
      const ledger = { userId, code, memberTag, charge: entry.charge };
      await this.refundCrossEndlessEntry(ledger);
      const reasons = {
        raid_closed: '该队伍已经开战',
        raid_full: '该队伍已经满员',
        already_joined: '你的化身已经加入该队伍',
        already_in_raid: '你的化身已经加入其他跨服队伍',
      };
      return e.reply(reasons[joined.reason] || '跨服化身投影失败');
    }
    const ledger = {
      userId,
      code,
      memberTag,
      groupId: String(e.group_id),
      status: 'joined',
      charge: entry.charge,
      snapshot: joined.raid.snapshot || null,
      joinedAt: Date.now(),
    };
    await Promise.all([
      this.writeCrossJson(this.crossRaidMemberKey(userId), ledger),
      redis.set(this.crossRaidTagKey(code, memberTag), String(userId), { EX: STATE_TTL_SECONDS }),
    ]);
    return e.reply([
      '【跨服化身投影成功】',
      `已加入 ${joined.raid.host_name} 的无尽劫境。`,
      `当前人数：${joined.raid.local_members + joined.raid.members.length}/${joined.raid.max_members || MAX_TEAM_SIZE}`,
      '开战后使用 #跨服无尽状态 查看战况。',
    ].join('\n'));
  }

  async leaveCrossEndless(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const ledger = await this.readCrossJson(this.crossRaidMemberKey(userId));
    if (!ledger || ledger.status !== 'joined') return e.reply('你当前没有待开战的跨服无尽化身');
    const result = await worldChatClient.leaveRaid(ledger.code, ledger.memberTag);
    if (!result.ok && result.reason !== 'raid_not_found') return e.reply('退出请求未完成，请稍后再试');
    await this.refundCrossEndlessEntry(ledger);
    await redis.del(this.crossRaidTagKey(ledger.code, ledger.memberTag));
    return e.reply(`已退出跨服无尽，入场消耗已退回。`);
  }

  async watchCrossEndless(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const code = e.msg.match(/([A-Fa-f0-9]{8})/)?.[1]?.toUpperCase();
    const player = await Read_player(userId);
    const watcherTag = worldChatClient.userTag(`watch:${userId}`);
    const previous = await this.readCrossJson(this.crossRaidWatchKey(userId));
    if (previous) {
      await worldChatClient.unwatchRaid(previous.code, previous.watcherTag);
      await redis.del(this.crossRaidTagKey(previous.code, previous.watcherTag));
    }
    const result = await worldChatClient.watchRaid(code, watcherTag, player.名号);
    if (!result.ok || result.raid?.boss !== '无尽劫境') return e.reply('该跨服无尽房间已失效');
    const watch = { userId, code, watcherTag, groupId: String(e.group_id), snapshot: result.raid.snapshot || null };
    await Promise.all([
      this.writeCrossJson(this.crossRaidWatchKey(userId), watch),
      redis.set(this.crossRaidTagKey(code, watcherTag), String(userId), { EX: STATE_TTL_SECONDS }),
    ]);
    return e.reply([...formatCrossRaidSnapshot(result.raid), '', '观战模式只读，不参与操作与奖励。'].join('\n'));
  }

  async unwatchCrossEndless(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const watch = await this.readCrossJson(this.crossRaidWatchKey(userId));
    if (!watch) return e.reply('你当前没有观战中的无尽房间');
    await worldChatClient.unwatchRaid(watch.code, watch.watcherTag);
    await Promise.all([
      redis.del(this.crossRaidWatchKey(userId)),
      redis.del(this.crossRaidTagKey(watch.code, watch.watcherTag)),
    ]);
    return e.reply('已退出无尽观战');
  }

  async showCrossEndless(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const ledger = await this.readCrossJson(this.crossRaidMemberKey(userId));
    const watch = await this.readCrossJson(this.crossRaidWatchKey(userId));
    const localTeam = await this.getPlayerTeam(userId);
    const hostRecord = localTeam?.crossRaidCode ? { code: localTeam.crossRaidCode } : null;
    const current = ['joined', 'in_battle'].includes(ledger?.status)
      ? ledger
      : hostRecord || watch || (ledger?.status === 'settled' ? ledger : null);
    if (!current) return e.reply('你当前没有跨服无尽记录');
    const result = await worldChatClient.getRaid(current.code);
    if (!result.ok) {
      if (ledger?.code === current.code && ledger.status === 'joined')
        await this.refundCrossEndlessEntry(ledger);
      return e.reply('该跨服无尽房间已结束；待开战的入场消耗已核对退回');
    }
    if (ledger?.code === current.code && Array.isArray(result.raid.settlements))
      await this.applyCrossRaidSettlement(result.raid);
    const updated = ledger?.code === current.code
      ? await this.readCrossJson(this.crossRaidMemberKey(userId))
      : null;
    const reward = updated?.settlement;
    return e.reply([
      ...formatCrossRaidSnapshot(result.raid),
      ...(reward ? [
        '',
        '【本服结算已入账】',
        `灵石${this.formatAmount(reward.reward.lingshi)}｜源石${this.formatAmount(reward.reward.sourceStone)}｜${ENDLESS_TOKEN}${this.formatAmount(reward.reward.tokens)}`,
        `修为${this.formatAmount(reward.reward.cultivation)}｜血气${this.formatAmount(reward.reward.blood)}`,
      ] : []),
    ].join('\n'));
  }

  async crossEndlessChat(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const text = String(e.msg || '').replace(/^#跨服队伍发言\s+/, '').trim().slice(0, 300);
    if (!text) return e.reply('请输入传音内容');
    const localTeam = await this.getPlayerTeam(userId);
    const ledger = await this.readCrossJson(this.crossRaidMemberKey(userId));
    const code = localTeam?.crossRaidCode || (['joined', 'in_battle'].includes(ledger?.status) ? ledger.code : '');
    if (!code) return e.reply('你当前不在跨服无尽房间中');
    if (localTeam && !this.isTeamGroup(e, localTeam)) return e.reply('请回到无尽队伍所在群进行操作');
    const player = await Read_player(userId);
    const result = await worldChatClient.raidChat(
      code,
      ledger?.memberTag || worldChatClient.userTag(userId),
      player.名号 || `无名修士${String(userId).slice(-4)}`,
      text
    );
    if (!result.ok) return e.reply('本次跨服传音未送达，请刷新房间状态');
    return e.reply('跨服传音已送达');
  }

  async sendCrossEndlessAction(e, action) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const ledger = await this.readCrossJson(this.crossRaidMemberKey(userId));
    if (!ledger || ledger.status !== 'in_battle') return e.reply('你的跨服化身尚未进入战斗');
    const value = Number(e.msg.match(/([1-4])\s*$/)?.[1]) || 0;
    const result = await worldChatClient.raidAction(ledger.code, ledger.memberTag, action, value);
    if (!result.ok) return e.reply('本次跨服指令未送达，请刷新状态后重试');
    return e.reply('指令已送达队长位面，发送 #跨服无尽状态 查看同步结果');
  }

  crossEndlessChoose(e) {
    return this.sendCrossEndlessAction(e, 'choose');
  }

  crossEndlessSuggest(e) {
    return this.sendCrossEndlessAction(e, 'suggest');
  }

  crossEndlessMerchant(e) {
    return this.sendCrossEndlessAction(e, 'merchant');
  }

  crossEndlessReroll(e) {
    return this.sendCrossEndlessAction(e, 'reroll');
  }

  async syncCrossRaidMembers(team) {
    if (!team.crossRaidCode) return team;
    const result = await worldChatClient.getRaid(team.crossRaidCode);
    if (!result.ok || result.raid.status !== 'recruiting') throw new Error('cross_raid_closed');
    const localMembers = team.localMembers || team.members.filter((id) => !team.crossMembers?.[id]);
    const slots = Math.max(0, MAX_TEAM_SIZE - localMembers.length);
    const remote = result.raid.members.slice(0, slots);
    const previousCrossIds = Object.keys(team.crossMembers || {});
    for (const id of previousCrossIds) {
      delete team.memberNames[id];
      await redis.del(this.playerKey(id));
    }
    team.localMembers = [...localMembers];
    team.crossMembers = {};
    for (const member of remote) {
      const avatar = hydrateCrossRaidAvatar(member.avatar, {
        serverId: member.server_id,
        serverName: member.server_name,
        memberTag: member.member_tag,
      });
      team.crossMembers[avatar.id] = {
        serverId: member.server_id,
        serverName: member.server_name,
        memberTag: member.member_tag,
        avatar,
      };
      team.memberNames[avatar.id] = avatar.名号;
    }
    team.members = [...localMembers, ...Object.keys(team.crossMembers)];
    await this.saveTeam(team);
    return team;
  }

  async updateCrossRaidLocalCount(team, count) {
    if (!team.crossRaidCode) return { ok: true };
    return worldChatClient.openRaid({
      team_id: `endless_${team.id}`,
      boss: '无尽劫境',
      local_members: count,
      max_members: MAX_TEAM_SIZE,
    });
  }

  async applyCrossRaidSettlement(raid) {
    for (const settlement of raid.settlements || []) {
      if (settlement.server_id !== worldChatClient.cfg.server_id) continue;
      const userId = await redis.get(this.crossRaidTagKey(raid.code, settlement.member_tag));
      if (!userId) continue;
      const ledger = await this.readCrossJson(this.crossRaidMemberKey(userId));
      if (!ledger || ledger.code !== raid.code) continue;
      const player = await Read_player(userId);
      const records = Array.isArray(player.无尽劫境结算记录) ? player.无尽劫境结算记录 : [];
      if (!records.includes(settlement.id)) {
        const reward = settlement.reward || {};
        player.灵石 = (Number(player.灵石) || 0) + (Number(reward.lingshi) || 0);
        player.源石 = (Number(player.源石) || 0) + (Number(reward.sourceStone) || 0);
        player[ENDLESS_TOKEN] = (Number(player[ENDLESS_TOKEN]) || 0) + (Number(reward.tokens) || 0);
        player.修为 = (Number(player.修为) || 0) + (Number(reward.cultivation) || 0);
        player.血气 = (Number(player.血气) || 0) + (Number(reward.blood) || 0);
        recordEndlessDifficultyProgress(
          player,
          settlement.difficultyTier,
          settlement.highestLayer,
          { cleared: Boolean(settlement.cleared) }
        );
        player.无尽劫境次数 = (Number(player.无尽劫境次数) || 0) + 1;
        player.无尽劫境结算记录 = [...records, settlement.id].slice(-30);
        if (Number(settlement.highestLayer) >= ENDLESS_TREASURE_UNLOCK_LAYER)
          grantRandomEndlessTreasure(player, Math.random);
        if (
          settlement.cleared &&
          Number(settlement.highestLayer) >= ENDLESS_TIER_MAX_LAYER
        )
          grantRandomEndlessTierTreasure(
            player,
            settlement.difficultyTier,
            Math.random
          );
        if (Number(settlement.highestLayer) >= 30) {
          const serverMax = await this.getServerMaxEndlessLayer();
          if (player.无尽劫境最高层 >= Math.max(serverMax, Number(settlement.highestLayer)))
            grantTitle(player, '无尽劫境天尊');
        }
        await Write_player(userId, player);
      }
      ledger.status = 'settled';
      ledger.settlement = settlement;
      ledger.snapshot = raid.snapshot || ledger.snapshot;
      await this.writeCrossJson(this.crossRaidMemberKey(userId), ledger);
    }
  }

  async pushCrossRaidUpdate(record, raid, title) {
    const battle = raid.snapshot?.battle;
    const signature = `${raid.status}:${battle?.layer || 0}:${battle?.victory ?? ''}`;
    if (!battle && !['settled', 'defeated', 'closed'].includes(raid.status)) return;
    if (record.lastPushSignature === signature) return;
    const group = globalThis.Bot?.pickGroup?.(record.groupId);
    if (!group?.sendMsg) return;
    try {
      await group.sendMsg([`【${title}】`, ...formatCrossRaidSnapshot(raid)].join('\n'));
      record.lastPushSignature = signature;
    } catch (error) {
      logger.warn('[跨服无尽] 群内战况推送失败', error?.message || error);
    }
  }

  async handleCrossRaidEvent(message) {
    const raid = message.raid;
    if (!raid || raid.boss !== '无尽劫境') return;
    if (message.type === 'RAID_CHAT') {
      const groupIds = new Set();
      const hostTeamId = await redis.get(this.crossRaidHostKey(raid.code));
      const hostTeam = hostTeamId ? await this.getTeam(hostTeamId) : null;
      if (hostTeam?.groupId) groupIds.add(hostTeam.groupId);
      for (const member of raid.members || []) {
        if (member.server_id !== worldChatClient.cfg.server_id) continue;
        const userId = await redis.get(this.crossRaidTagKey(raid.code, member.member_tag));
        const ledger = userId ? await this.readCrossJson(this.crossRaidMemberKey(userId)) : null;
        if (ledger?.groupId) groupIds.add(ledger.groupId);
      }
      for (const watcher of raid.watchers || []) {
        if (watcher.server_id !== worldChatClient.cfg.server_id) continue;
        const userId = await redis.get(this.crossRaidTagKey(raid.code, watcher.watcher_tag));
        const watch = userId ? await this.readCrossJson(this.crossRaidWatchKey(userId)) : null;
        if (watch?.groupId) groupIds.add(watch.groupId);
      }
      const line = `【跨服队伍传音｜${message.chat.server_name}】${message.chat.name}：${message.chat.text}`;
      for (const groupId of groupIds) {
        const group = globalThis.Bot?.pickGroup?.(groupId);
        if (group?.sendMsg) await group.sendMsg(line).catch(() => {});
      }
      return;
    }
    if (message.type === 'RAID_ACTION') {
      const teamId = await redis.get(this.crossRaidHostKey(raid.code));
      if (!teamId) return;
      await this.withInternalLock(`team:${teamId}`, async () => {
        const team = await this.getTeam(teamId);
        const run = await this.getRun(teamId);
        const entry = Object.entries(team?.crossMembers || {}).find(([, member]) =>
          member.serverId === message.server_id && member.memberTag === message.member_tag
        );
        if (!entry || !run) return;
        const memberId = entry[0];
        if (message.action === 'choose') applyEndlessChoice(run, memberId, message.value);
        else if (message.action === 'suggest') suggestEndlessStarRoute(run, memberId, message.value);
        else if (message.action === 'merchant') buyEndlessMerchantItem(run, memberId, message.value);
        else if (message.action === 'reroll') rerollEndlessChoices(run, memberId);
        await this.saveRun(run);
      });
      return;
    }
    if (message.type === 'RAID_SETTLEMENT') await this.applyCrossRaidSettlement(raid);
    for (const member of raid.members || []) {
      if (member.server_id !== worldChatClient.cfg.server_id) continue;
      const userId = await redis.get(this.crossRaidTagKey(raid.code, member.member_tag));
      if (!userId) continue;
      const ledger = await this.readCrossJson(this.crossRaidMemberKey(userId));
      if (!ledger || ledger.code !== raid.code) continue;
      ledger.snapshot = raid.snapshot || ledger.snapshot;
      if (raid.status === 'in_battle') ledger.status = 'in_battle';
      if (message.type === 'RAID_CLOSED' && ledger.status === 'joined')
        await this.refundCrossEndlessEntry(ledger);
      else {
        await this.pushCrossRaidUpdate(ledger, raid, '跨服无尽战报');
        await this.writeCrossJson(this.crossRaidMemberKey(userId), ledger);
      }
    }
    for (const watcher of raid.watchers || []) {
      if (watcher.server_id !== worldChatClient.cfg.server_id) continue;
      const userId = await redis.get(this.crossRaidTagKey(raid.code, watcher.watcher_tag));
      if (!userId) continue;
      const watch = await this.readCrossJson(this.crossRaidWatchKey(userId));
      if (watch?.code === raid.code) {
        watch.snapshot = raid.snapshot || watch.snapshot;
        await this.pushCrossRaidUpdate(watch, raid, '无尽观战播报');
        await this.writeCrossJson(this.crossRaidWatchKey(userId), watch);
      }
    }
  }

  async createTeam(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return this.withLock(e, `player:${userId}`, async () => {
      if (await this.getPlayerTeam(userId))
        return e.reply('你已经在一个无尽队伍中');
      const cross = await this.readCrossJson(this.crossRaidMemberKey(userId));
      if (['joined', 'in_battle'].includes(cross?.status))
        return e.reply('你的跨服化身仍在无尽劫境中');
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
        difficultyTier: normalizeEndlessDifficultyProgress(player).selectedTier,
        createdAt: Date.now(),
      };
      await this.saveTeam(team);
      return e.reply(
        [
          '【无尽队伍创建成功】',
          `队伍编号：${id}`,
          `队长：${team.memberNames[userId]}`,
          `成员：1/${MAX_TEAM_SIZE}`,
          `挑战难度：${formatEndlessDifficulty(team.difficultyTier)}`,
          `其他玩家发送 #加入无尽队伍 ${id}`,
          `开局时普通成员消耗【${ENDLESS_ENTRY_ITEM}】×1、心神${ENDLESS_SPIRIT_HEART_COST}点；岁云五阶段本人免除`,
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
      const cross = await this.readCrossJson(this.crossRaidMemberKey(userId));
      if (['joined', 'in_battle'].includes(cross?.status))
        return e.reply('你的跨服化身仍在无尽劫境中');
      const team = await this.getTeam(teamId);
      if (!team) return e.reply('该无尽队伍不存在或已经过期');
      if (team.groupId !== String(e.group_id))
        return e.reply('只能加入本群创建的无尽队伍');
      if (team.status !== 'lobby') return e.reply('该队伍已经进入无尽劫境');
      if (!team.crossRaidCode && team.members.length >= MAX_TEAM_SIZE)
        return e.reply('该无尽队伍已经满员');

      const player = await Read_player(userId);
      const nextLocalCount = (team.localMembers || team.members).length + 1;
      const crossUpdate = await this.updateCrossRaidLocalCount(team, nextLocalCount);
      if (!crossUpdate.ok) return e.reply('跨服队伍席位已满，本服暂时不能再补位');
      team.members.push(userId);
      if (team.crossRaidCode) team.localMembers = [...(team.localMembers || team.members.slice(0, -1)), userId];
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
    const crossRaid = team.status === 'lobby' && team.crossRaidCode
      ? await worldChatClient.getRaid(team.crossRaidCode)
      : null;
    const remoteMembers = crossRaid?.ok ? crossRaid.raid.members || [] : [];
    const displayedMembers = team.status === 'lobby' && team.localMembers
      ? team.localMembers
      : team.members;
    const lines = [
      `【无尽队伍·${team.id}】`,
      `状态：${this.statusText(team.status)}`,
      `挑战难度：${formatEndlessDifficulty(run?.difficultyTier || team.difficultyTier)}`,
      `成员：${displayedMembers.length + remoteMembers.length}/${MAX_TEAM_SIZE}`,
      ...displayedMembers.map(
        (id) =>
          `${id === team.leader ? '[队长] ' : ''}${team.memberNames[id] || id}`
      ),
      ...remoteMembers.map((member) =>
        `[跨服] ${member.avatar?.名号 || '无名化身'}（${member.server_name}）`
      ),
    ];
    if (run) {
      const nextWorld = getWorldForLayer(run, run.layer + 1);
      lines.push(
        `当前层数：${run.layer}`,
        `本局天象：${run.celestialPhenomenon?.name || '万象平稳'}`,
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

  async showEndlessCelestial(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return e.reply(formatEndlessCelestial(getDailyEndlessCelestial()).join('\n'));
  }

  async setEndlessDifficulty(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const targetMatch = String(e.msg || '').match(/A?(10|[1-9])\s*$/i);
    const team = await this.getPlayerTeam(userId);
    const player = await Read_player(userId);
    const progress = normalizeEndlessDifficultyProgress(player);
    if (!targetMatch) {
      const highest = progress.clearedTiers.at(-1) || 0;
      return e.reply([
        '【无尽劫境·难度进阶】',
        `已解锁：A1～A${progress.unlockedTier}`,
        `已首通：${highest ? progress.clearedTiers.map(formatEndlessDifficulty).join('、') : '暂无'}`,
        `当前选择：${formatEndlessDifficulty(team?.difficultyTier || progress.selectedTier)}`,
        `每阶均需打穿${ENDLESS_TIER_MAX_LAYER}层；每个首通使全部限购额度+10%，最低+1件。`,
        ...[3, 4, 5, 6, 7, 8, 9, 10].map(tier => {
          const difficulty = getEndlessDifficulty(tier);
          return `${difficulty.code}：${difficulty.specialAbilityTheme}｜通关特殊至宝${Math.round(difficulty.specialTreasureChance * 100)}%`;
        }),
        '#无尽难度 A2',
      ].join('\n'));
    }
    if (!team) return e.reply('请先发送 #创建无尽队伍，再由队长选择挑战难度');
    if (!this.isTeamGroup(e, team)) return e.reply('请回到无尽队伍所在群进行操作');
    if (team.leader !== userId) return e.reply('只有队长可以调整无尽难度');
    if (team.status !== 'lobby') return e.reply('本局难度已经固定，结算后可重新选择');
    const target = normalizeEndlessDifficultyTier(targetMatch[1]);
    const blocked = [];
    for (const id of team.members) {
      const memberPlayer = team.crossMembers?.[id]?.avatar || await Read_player(id);
      if (!canEnterEndlessDifficulty(memberPlayer, target))
        blocked.push(team.memberNames[id] || id);
    }
    if (blocked.length)
      return e.reply(`${blocked.join('、')}尚未解锁${formatEndlessDifficulty(target)}`);
    selectEndlessDifficulty(player, target);
    await Write_player(userId, player);
    team.difficultyTier = target;
    await this.saveTeam(team);
    return e.reply(`挑战难度已切换为【${formatEndlessDifficulty(target)}】；本阶通关层数为${ENDLESS_TIER_MAX_LAYER}层。`);
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
      if (team.localMembers) team.localMembers = team.localMembers.filter((id) => id !== userId);
      delete team.memberNames[userId];
      await redis.del(this.playerKey(userId));
      const localMembers = team.localMembers || team.members;
      if (!localMembers.length) {
        await this.clearTeam(team);
        return e.reply('你已离队，空队伍自动解散');
      }
      if (team.leader === userId) team.leader = localMembers[0];
      await this.saveTeam(team);
      await this.updateCrossRaidLocalCount(team, localMembers.length);
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

  // ════════════════ 他化自在体验卡 ════════════════
  // 使用后给玩家打标记，下一次 #开启无尽劫境 时必定自带1级他化自在法（残缺映照）
  async useFreeTransformationCard(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const ITEM = '他化自在体验卡';
    if (Number(await exist_najie_thing(userId, ITEM, '道具')) < 1)
      return e.reply(`你的纳戒中没有【${ITEM}】，无法激活他化自在体验。`);
    await Add_najie_thing(userId, ITEM, '道具', -1);
    const player = await Read_player(userId);
    player.无尽劫境_他化自在体验 = 1;
    await Write_player(userId, player);
    return e.reply([
      '【他化自在体验卡·激活】',
      '',
      '一缕残缺的道印自岁月长河浮现，没入你的元神。',
      '你隐约听见时空深处传来一声轻笑：',
      '　「下一次……让我看看你的锋芒。」',
      '',
      '效果：下一次开启无尽劫境时，必定自带 1 级他化自在法（残缺映照）。',
      '（开局未使用将保留标记，直至某次无尽劫境消耗）',
      '',
    ].join('\n'));
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
      if (team.crossRaidCode) {
        try {
          await this.syncCrossRaidMembers(team);
        } catch {
          return e.reply('跨服房间状态已变化，请重新发布招募');
        }
      }

      const missing = [];
      const players = [];
      const difficultyTier = normalizeEndlessDifficultyTier(team.difficultyTier);
      const weekendFree = isWeekendNow();
      const freeWeekKey = getWeekendFreeWeekKey();
      for (const id of team.members) {
        const cross = team.crossMembers?.[id];
        if (cross) {
          if (!canEnterEndlessDifficulty(cross.avatar, difficultyTier))
            missing.push(`${team.memberNames[id]}（尚未解锁${formatEndlessDifficulty(difficultyTier)}）`);
          players.push({ id, player: cross.avatar, heartCost: 0, freeAvailable: false, cross: true });
          continue;
        }
        if (!(await existplayer(id))) {
          missing.push(`${team.memberNames[id]}（角色存档缺失）`);
          continue;
        }
        const player = await Read_player(id);
        if (!canEnterEndlessDifficulty(player, difficultyTier))
          missing.push(`${team.memberNames[id]}（尚未解锁${formatEndlessDifficulty(difficultyTier)}）`);
        // 周末免费入场：每周末一次，无需秘钥与心神
        const suiyunFree = hasSuiyunFreeEndlessEntry(player);
        const freeAvailable =
          !suiyunFree && weekendFree && player[WEEKEND_FREE_FIELD] !== freeWeekKey;
        let heartCost = 0;
        if (!suiyunFree && !freeAvailable) {
          const amount =
            Number(await exist_najie_thing(id, ENDLESS_ENTRY_ITEM, '道具')) || 0;
          if (amount < 1)
            missing.push(`${team.memberNames[id]}（缺少${ENDLESS_ENTRY_ITEM}）`);
          const heart = refreshSpiritHeart(player);
          heartCost = getSpiritHeartCost(
            ENDLESS_SPIRIT_HEART_COST,
            getMinggeEffects(player, data.minggeList)
          );
          if (heart.current < heartCost) {
            missing.push(
              `${team.memberNames[id]}（心神不足：${heart.current}/${heart.max}，需要${heartCost}）`
            );
          }
        }
        players.push({ id, player, heartCost, freeAvailable, suiyunFree });
      }
      if (missing.length)
        return e.reply(['【无法开启无尽劫境】', ...missing].join('\n'));

      const run = createEndlessRun({
        teamId: team.id,
        groupId: team.groupId,
        players,
        seed: Date.now() ^ Number(team.id),
        difficultyTier,
        celestialPhenomenon: getDailyEndlessCelestial(),
      });
      const originalPlayers = new Map(
        players.filter((entry) => !entry.cross).map(({ id, player }) => [id, structuredClone(player)])
      );
      const deducted = [];
      const voucherActive = [];
      const freeMembers = [];
      const suiyunFreeMembers = [];
      try {
        for (const entry of players) {
          const { id, player, heartCost, freeAvailable, suiyunFree, cross } = entry;
          if (cross) continue;
          if (freeAvailable || suiyunFree) {
            // 周末免费：不扣秘钥与心神，仅标记本周额度已用
            if (suiyunFree) suiyunFreeMembers.push(id);
            else {
              player[WEEKEND_FREE_FIELD] = freeWeekKey;
              freeMembers.push(id);
            }
            if (Number(player.无尽劫境_他化自在体验) > 0) {
              voucherActive.push(id);
              player.无尽劫境_他化自在体验 = 0;
            }
            await Write_player(id, player);
            continue;
          }
          await Add_najie_thing(id, ENDLESS_ENTRY_ITEM, '道具', -1);
          deducted.push(id);
          const heart = consumeSpiritHeart(
            player,
            heartCost
          );
          if (!heart.ok) throw new Error(`player=${id} 心神状态发生变化`);
          if (Number(player.无尽劫境_他化自在体验) > 0) {
            voucherActive.push(id);
            player.无尽劫境_他化自在体验 = 0;
          }
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
      const webEnabled = getEndlessWebConfig().enabled;
      const autoIssueWebTicket = shouldAutoIssueEndlessWebTicket(team);
      const webLink =
        webEnabled && autoIssueWebTicket
          ? await this.issueEndlessWebLink(e, userId, team)
          : null;
      return e.reply(
        [
          '【诸天无尽劫境开启】',
          `挑战难度：${formatEndlessDifficulty(run.difficultyTier)}（共${ENDLESS_TIER_MAX_LAYER}层）`,
          `今日天象：${run.celestialPhenomenon.name}｜${run.celestialPhenomenon.description}`,
          `普通成员每人消耗【${ENDLESS_ENTRY_ITEM}】×1、心神按命格结算；周末额度及岁云免票成员除外`,
          ...(suiyunFreeMembers.length
            ? [`【月华通行】${suiyunFreeMembers.map(id => team.memberNames[id] || id).join('、')}免秘钥、免心神，不占周末免费额度。`] : []),
          ...(freeMembers.length
            ? [
                '',
                `【周末免费·额度已用】${freeMembers
                  .map((id) => team.memberNames[id] || id)
                  .join('、')}本周末免费入场，不消耗秘钥与心神！`,
              ]
            : []),
          `首个世界：${world.name}`,
          `世界规则：${world.rule}`,
          `共享命火：${run.lifeFire}/${run.maxLifeFire}`,
          ...(voucherActive.length
            ? [
                '',
                `【他化自在·体验激活】${voucherActive
                  .map((id) => team.memberNames[id] || id)
                  .join('、')}开局自带1级他化自在法（残缺映照），第一回合便有一尊自在身踏出岁月长河！`,
              ]
            : []),
          ...(webEnabled && !autoIssueWebTicket
            ? [
                '',
                '【网页入口·成员专属】',
                `本队共${team.members.length}人，请每位成员各自发送「#无尽网页」领取入口。`,
                '入口绑定本人的能力选择与奖励，不能共用。',
              ]
            : webLink
              ? ['', '【网页入口·两分钟内有效】', webLink]
              : []),
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
    const webConfig = getEndlessWebConfig();
    if (!webConfig.enabled)
      return e.reply('无尽劫境网页入口暂未开放，请继续使用群聊指令');
    const team = await this.getPlayerTeam(userId);
    if (!team || team.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, team))
      return e.reply('请回到无尽队伍所在群领取网页入口');
    const link = await this.issueEndlessWebLink(e, userId, team);
    return e.reply(
      link
        ? [
            `【${team.memberNames[userId] || userId}的无尽劫境网页入口】`,
            link,
            '专属入口两分钟内有效，仅限本人首次打开。',
            ...(team.members.length > 1
              ? ['其他队员请各自发送「#无尽网页」领取自己的入口。']
              : []),
          ].join('\n')
        : webConfig.relayEnabled
          ? '网页入口暂时未就绪，请稍后重新发送「#无尽网页」'
          : '网页服务未就绪，请检查 config/endless-web.json、Redis 与服务器端口'
    );
  }

  async openEndlessWendao(e) {
    const config = getEndlessWebConfig();
    if (!config.enabled)
      return e.reply('无尽问道网页入口尚未开启，请先在 config/endless-web.json 启用网页服务');
    try {
      await startEndlessWebServer(this);
      return e.reply(
        [
          '【无尽问道·修仙卡牌肉鸽】',
          createEndlessWendaoLink(config),
          '四职业、四境天关、分支劫路、坊市、悟道融合与渡劫均已开放。存档保存在当前浏览器。',
        ].join('\n')
      );
    } catch (error) {
      logger.error('[无尽问道] 网页入口启动失败', error);
      return e.reply('无尽问道入口启动失败，请检查网页服务端口与 Redis 状态');
    }
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

  formatRunMerchant(run) {
    const merchant = getEndlessMerchantState(run);
    if (!merchant) return null;
    return [
      `【${merchant.name}·局内孤品】`,
      `共享余额：${this.formatAmount(merchant.balance)}未封存劫境道痕`,
      '每件货物全队仅有一份，购买后立即作用于购买者的本局投影。',
      '',
      ...merchant.stock.map((good, index) =>
        good.boughtBy
          ? `${index + 1}. [已售] ${good.name}｜${good.buyerName || good.boughtBy}：${good.result || '交易完成'}`
          : `${index + 1}. ${good.name} · ${good.price}道痕\n   ${good.description}`
      ),
      '',
      `发送 #劫境购买${merchant.stock.map((_, index) => index + 1).join('/')}｜不购买可直接 #无尽下一关`,
    ];
  }

  async showRunMerchant(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const team = await this.getPlayerTeam(userId);
    if (!team || team.status !== 'running') return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, team)) return e.reply('请回到无尽队伍所在群与界海商人交易');
    const run = await this.getRun(team.id);
    if (!run) return e.reply('无尽劫境状态已经失效');
    const lines = this.formatRunMerchant(run);
    return e.reply(lines ? lines.join('\n') : '当前劫途没有显化界海商队');
  }

  async buyRunMerchantItem(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running') return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current)) return e.reply('请回到无尽队伍所在群与界海商人交易');
    const choice = Number(String(e.msg || '').match(/[1-4]$/)?.[0]);
    return this.withLock(e, `team:${current.id}`, async () => {
      const team = await this.getTeam(current.id);
      const run = await this.getRun(current.id);
      if (!team || !run || !team.members.includes(userId))
        return e.reply('无尽劫境状态已经失效');
      let result;
      try {
        result = buyEndlessMerchantItem(run, userId, choice);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      return e.reply([
        `【${result.merchant}·交易完成】`,
        `${run.members[userId].name}购得【${result.good.name}】`,
        result.result,
        `消耗：${result.good.price}未封存道痕｜共享余额：${result.balance}`,
        '',
        ...this.formatRunMerchant(run),
      ].join('\n'));
    });
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
    const gambit = node.gambit || {};
    const percent = value => {
      const amount = Math.round((Number(value || 1) - 1) * 100);
      return `${amount >= 0 ? '+' : ''}${amount}%`;
    };
    const rewardMultiplier =
      Number(type.rewardMultiplier || 1) *
      Number(sky.rewardMultiplier || 1) *
      Number(gambit.rewardMultiplier || 1) *
      bossSealMultiplier;
    return e.reply([
      `【星图情报${choice}·${node.name}】`,
      `危险：${node.risk}｜战场：${this.stageText(stage)}`,
      node.description,
      `定轨赌约：${gambit.name || '守成之契'}｜${gambit.description || '规则保持原状'}`,
      `敌方增幅：生命${percent(Number(type.enemyHpMultiplier || 1) * Number(sky.enemyHpMultiplier || 1) * Number(gambit.enemyHpMultiplier || 1) * bossSealMultiplier)} / 攻击${percent(Number(type.enemyAttackMultiplier || 1) * Number(sky.enemyAttackMultiplier || 1) * Number(gambit.enemyAttackMultiplier || 1) * bossSealMultiplier)} / 防御${percent(Number(type.enemyDefenseMultiplier || 1) * Number(sky.enemyDefenseMultiplier || 1) * Number(gambit.enemyDefenseMultiplier || 1))}`,
      `预期回响：奖励×${rewardMultiplier.toFixed(2)}｜${node.rewardText}`,
      Number(gambit.tokenMultiplier || 1) !== 1 ? `道痕额外倍率：×${Number(gambit.tokenMultiplier).toFixed(2)}` : null,
      node.assist ? `已观测强援：${node.assist.name}｜${node.assist.skill}·${node.assist.rounds}回合` : null,
      node.typeId === 'merchant' ? '货架将在定途后开启，商品为全队共享孤品。' : null,
      node.typeId === 'nameless' ? '具体禁忌规则将在定途后随机显形。' : null,
      type.monsterCountBonus ? `额外怪潮：+${type.monsterCountBonus}只` : null,
      Number(type.entryHpCostPct || 0) + Number(gambit.entryHpCostPct || 0) > 0
        ? `不可逆代价：入场损失${Math.round((Number(type.entryHpCostPct || 0) + Number(gambit.entryHpCostPct || 0)) * 100)}%最大生命`
        : null,
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

  async rerollAbilityChoices(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const current = await this.getPlayerTeam(userId);
    if (!current || current.status !== 'running')
      return e.reply('你当前不在无尽劫境中');
    if (!this.isTeamGroup(e, current))
      return e.reply('请回到无尽队伍所在群进行操作');
    return this.withLock(e, `team:${current.id}`, async () => {
      const run = await this.getRun(current.id);
      if (!run) return e.reply('无尽劫境状态已经失效');
      let result;
      try {
        result = rerollEndlessChoices(run, userId);
      } catch (error) {
        return e.reply(error.message);
      }
      await this.saveRun(run);
      return e.reply([
        '【万劫道碑·劫机重演】',
        `因果回卷，本局刷新次数剩余：${result.remaining}`,
        '',
        ...this.formatChoices(run, userId),
      ].join('\n'));
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
      `【${formatEndlessDifficulty(run.difficultyTier)}·第${result.layer}层】`,
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
        .filter(([id, value]) => !id.startsWith('_') && value > 0)
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
    if (result.damageByMember._assist > 0) {
      lines.push(
        `${result.assist?.name || '异界强援'}：${this.formatAmount(
          result.damageByMember._assist
        )}`
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
          summary.assistHits ? `异界强援出手：${summary.assistHits}次` : null,
          summary.skillReplays ? `技能因果重放：${summary.skillReplays}次` : null,
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
        .filter(([id]) => !id.startsWith('_'))
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
      assistDamage: this.formatAmount(round.assistDamage),
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
      saveId: `endless_${run.teamId}_${result.layer}`,
      layer: result.layer,
      difficulty: formatEndlessDifficulty(run.difficultyTier),
      celestial: run.celestialPhenomenon,
      completed: Boolean(result.completed),
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
      assistDamage: this.formatAmount(result.damageByMember._assist || 0),
      assistName: result.assist?.name || '',
      mvpName: result.summary?.mvpName || '暂无',
      mvpDamage: this.formatAmount(result.summary?.mvpDamage || 0),
      fusionHits: result.summary?.fusionHits || 0,
      assistHits: result.summary?.assistHits || 0,
      skillReplays: result.summary?.skillReplays || 0,
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
        if (result.completed && settlement)
          return e.reply(this.formatSettlement(settlement, '劫境通关结算').join('\n'));
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
        if (settlement)
          return e.reply(this.formatSettlement(settlement, '团灭结算').join('\n'));
        return true;
      }
    } catch (error) {
      logger.error('[无尽劫境] 战报图片生成失败', error);
    }

    const lines = this.formatBattle(run, result);
    if (settlement)
      lines.push('', ...this.formatSettlement(
        settlement,
        result.completed ? '劫境通关结算' : '团灭结算'
      ));
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
      if (result.completed) {
        settlement = await this.settleRun(team, run, 1, 'clear');
        if (e.isEndlessWeb)
          e.endlessTerminalState = {
            ...serializeEndlessWebState(this, team, run, userId),
            ended: true,
          };
      }
      else if (!result.victory) {
        settlement = await this.settleRun(team, run, 0.3, 'defeat');
        if (e.isEndlessWeb) {
          const group = globalThis.Bot?.pickGroup?.(e.group_id);
          if (group?.sendMsg) {
            try {
              await group.sendMsg(
                ['【无尽劫境·网页战败通知】', ...this.formatSettlement(settlement, '战败结算')].join('\n')
              );
            } catch (error) {
              logger.warn('[无尽劫境] 网页战败群通知发送失败', error);
            }
          }
          e.endlessTerminalState = {
            ...serializeEndlessWebState(this, team, run, userId),
            ended: true,
          };
        }
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
    const lines = [
      `【无尽构筑·${formatEndlessDifficulty(run.difficultyTier)}·第${run.layer}层】`,
      `本局天象：${run.celestialPhenomenon?.name || '万象平稳'}｜${run.celestialPhenomenon?.description || '诸天规则暂时平稳。'}`,
    ];
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
          : '天关机缘：尚无',
        member.eventBuffs?.freeTransformationOpeningCount >= 3 || member.eventBuffs?.skillReplayChance || member.eventBuffs?.attackPct
          ? `商队遗物：${[
              member.eventBuffs?.freeTransformationOpeningCount >= 3 ? '三身映照·开场3尊' : null,
              member.eventBuffs?.skillReplayChance ? `回响重放${Math.round(member.eventBuffs.skillReplayChance * 100)}%` : null,
              member.eventBuffs?.attackPct ? `破境战血·攻击+${Math.round(member.eventBuffs.attackPct * 100)}%` : null,
            ].filter(Boolean).join('、')}`
          : '商队遗物：尚无'
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
      `抵达层数：${settlement.layer}/${ENDLESS_TIER_MAX_LAYER}`,
      `挑战难度：${formatEndlessDifficulty(settlement.difficultyTier)}`,
      ...(Array.isArray(settlement.extras) && settlement.extras.length
        ? ['', ...settlement.extras.map(line => `✨ ${line}`)]
        : []),
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
    run.settlement.extras ||= [];
    // 全服最高层（磁盘快照，供「打穿30关且全服第一」判定）
    const serverMaxLayer = await this.getServerMaxEndlessLayer();
    const highestClearedLayer = Math.max(
      0,
      Number(run.highestClearedLayer) ||
        (run.lastBattle?.victory ? Number(run.layer) : Number(run.layer) - 1) ||
        0
    );

    for (const id of team.members) {
      if (run.settlement.paidMembers.includes(id)) continue;
      if (team.crossMembers?.[id]) continue;
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
          const progressResult = recordEndlessDifficultyProgress(
            player,
            run.difficultyTier,
            highestClearedLayer,
            { cleared: reason === 'clear' || run.completed }
          );
          if (progressResult.firstClear) {
            const currentDifficulty = getEndlessDifficulty(run.difficultyTier);
            const unlockText = currentDifficulty.tier < ENDLESS_MAX_DIFFICULTY_TIER
              ? `，已解锁${formatEndlessDifficulty(currentDifficulty.tier + 1)}`
              : `，${ENDLESS_MAX_DIFFICULTY_TIER}阶劫境已经全部贯通`;
            run.settlement.extras.push(
              `${team.memberNames?.[id] || id}首通【${formatEndlessDifficulty(currentDifficulty.tier)}】${unlockText}；限购额度永久再提高10%（最低+1）。`
            );
          }
          player.无尽劫境次数 = (Number(player.无尽劫境次数) || 0) + 1;
          if (['clear', 'defeat'].includes(run.settlement.reason)) {
            recordMemoryDungeon(player, { token: `endless-entry:${run.id}` });
          }
          player.无尽劫境结算记录 = [...records, run.settlement.id].slice(-30);
          // 无尽至宝：本趟打到第25关 → 解锁一件永久随机至宝（已全收集则升级）
          if (highestClearedLayer >= ENDLESS_TREASURE_UNLOCK_LAYER) {
            const gain = grantRandomEndlessTreasure(player, Math.random);
            if (gain) {
              run.settlement.extras.push(
                `${team.memberNames?.[id] || id}解锁无尽至宝【${gain.name}】${
                  gain.upgraded ? `（已收集齐，升级至Lv.${gain.level}）` : ''
                }！`
              );
            }
          }
          const clearedTier =
            (reason === 'clear' || run.completed) &&
            highestClearedLayer >= ENDLESS_TIER_MAX_LAYER;
          if (clearedTier) {
            const gain = grantRandomEndlessTierTreasure(
              player,
              run.difficultyTier,
              Math.random
            );
            if (gain) {
              run.settlement.extras.push(
                `${team.memberNames?.[id] || id}从【${formatEndlessDifficulty(run.difficultyTier)}】通关秘藏获得特殊至宝【${gain.name}】${
                  gain.upgraded ? `（升至Lv.${gain.level}）` : ''
                }！`
              );
            }
          }
          // 无尽劫境天尊：打穿第30关且全服排名第一
          if (highestClearedLayer >= 30) {
            const effectiveServerMax = Math.max(
              serverMaxLayer,
              highestClearedLayer
            );
            if (
              player.无尽劫境最高层 >= effectiveServerMax &&
              grantTitle(player, '无尽劫境天尊')
            ) {
              run.settlement.extras.push(
                `${team.memberNames?.[id] || id}登临全服第一，获得专属称号【无尽劫境天尊】！`
              );
            }
          }
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

    const remoteSettlements = Object.entries(team.crossMembers || {})
      .filter(([id]) => !run.settlement.paidMembers.includes(id))
      .map(([id, member]) => {
        const memberReward = run.settlement.reward.members?.[id] || {};
        return {
          id: `${run.settlement.id}:${member.memberTag}`,
          server_id: member.serverId,
          member_tag: member.memberTag,
          highestLayer: highestClearedLayer,
          difficultyTier: normalizeEndlessDifficultyTier(run.difficultyTier),
          cleared: reason === 'clear' || Boolean(run.completed),
          reward: {
            lingshi: Number(run.settlement.reward.lingshi) || 0,
            sourceStone: Number(run.settlement.reward.sourceStone) || 0,
            tokens: Number(run.settlement.reward.tokens) || 0,
            cultivation: Number(memberReward.cultivation) || 0,
            blood: Number(memberReward.blood) || 0,
          },
        };
      });
    if (remoteSettlements.length) {
      const crossResult = await worldChatClient.settleRaid(
        team.crossRaidCode,
        remoteSettlements,
        reason === 'defeat' ? 'defeated' : 'settled'
      );
      if (!crossResult.ok) {
        return {
          complete: false,
          paid: run.settlement.paidMembers.length,
          total: team.members.length,
          reward: run.settlement.reward,
          layer: run.layer,
          memberNames: team.memberNames,
        };
      }
      run.settlement.paidMembers.push(
        ...Object.keys(team.crossMembers).filter((id) =>
          remoteSettlements.some((settlement) => settlement.member_tag === team.crossMembers[id].memberTag)
        )
      );
      await this.saveRun(run);
    }

    const result = {
      complete: true,
      paid: team.members.length,
      total: team.members.length,
      reward: run.settlement.reward,
      layer: run.layer,
      difficultyTier: normalizeEndlessDifficultyTier(run.difficultyTier),
      memberNames: team.memberNames,
      extras: run.settlement.extras || [],
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
      const suiyunFree = hasSuiyunFreeEndlessEntry(player);
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
      const heart = suiyunFree ? { current: Number(player.心神) || 0, max: getSpiritHeartMax(player) } : refreshSpiritHeart(player);
      const minggeEffects = getMinggeEffects(player, data.minggeList);
      const heartCost = suiyunFree ? 0 : getSpiritHeartCost(ENDLESS_SPIRIT_HEART_COST, minggeEffects);
      const missing = [];
      if (!suiyunFree && keyAmount < 1) missing.push(`【${ENDLESS_ENTRY_ITEM}】×1`);
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
        if (!suiyunFree) {
          await Add_najie_thing(userId, ENDLESS_ENTRY_ITEM, '道具', -1);
          deducted.push(ENDLESS_ENTRY_ITEM);
        }
        await Add_najie_thing(userId, ENDLESS_SWEEP_ITEM, '道具', -1);
        deducted.push(ENDLESS_SWEEP_ITEM);
        consumed = suiyunFree ? { ok: true, cost: 0 } : consumeSpiritHeart(
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
        recordMemoryDungeon(player, { token: `endless-sweep:${userId}:${player.无尽劫境扫荡次数}` });
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
          suiyunFree
            ? `【月华通行】免秘钥、免心神；本次仅消耗【${ENDLESS_SWEEP_ITEM}】×1`
            : `消耗：【${ENDLESS_ENTRY_ITEM}】×1、【${ENDLESS_SWEEP_ITEM}】×1、心神${consumed.cost}点`,
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

  /* ==================== 无尽至宝 ==================== */

  async showTreasures(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const loadout = normalizeEndlessTreasureLoadout(player);
    const views = getPlayerTreasureViews(player);
    const intrinsicCount = views.filter(treasure => treasure.intrinsic).length;
    const celestial = getDailyEndlessCelestial();
    const nextSlot = loadout.slots + 1;
    const lines = [
      '【无尽至宝】',
      `持有${views.length}件｜普通已装配${loadout.equipped.length}/${loadout.slots}件`,
      `灵根专属：${intrinsicCount}件（自动生效，不占普通槽）`,
      `劫境道痕：${Math.max(0, Math.floor(Number(player.劫境道痕) || 0))}`,
      ...(celestial.disabledTreasureNames?.length
        ? [`今日天象禁用：${celestial.disabledTreasureNames.join('、')}`]
        : []),
      `Lv.1按${Math.round(ENDLESS_TREASURE_EFFECT_RATE * 100)}%效能结算，每级额外提高${Math.round(ENDLESS_TREASURE_EFFECT_PER_LEVEL * 100)}个百分点，最高Lv.${ENDLESS_TREASURE_LEVEL_CAP}。`,
      loadout.slots
        ? `下一普通槽：最高通关${getEndlessTreasureSlotGate(nextSlot)}层，并消耗${getEndlessTreasureSlotCost(nextSlot)}道痕。`
        : `最高通关第${ENDLESS_TREASURE_UNLOCK_LAYER}层后开放第一个免费普通槽位；灵根专属位无需此门槛。`,
      '',
    ];
    if (!views.length) {
      lines.push('尚未获得任何至宝。', '发送 #无尽劫境帮助 了解玩法，努力冲击第25关吧！');
      return e.reply(lines.join('\n'));
    }
    for (const treasure of views) {
      lines.push(
        `${treasure.icon} 【${treasure.name}】Lv.${treasure.level} · ${treasure.rarity}${treasure.intrinsic ? ' [灵根专属·自动生效]' : treasure.equipped ? ' [已装配]' : ''}`,
        `　当前属性效能：${Math.round(treasure.effectRate * 100)}%${treasure.nextCost === null ? '｜已满级' : `｜下级消耗：${treasure.nextCost}道痕`}`,
        `　${treasure.desc}`,
        treasure.source ? `　来源：${treasure.source}` : null,
        ...(treasure.stageConditions || []).map(stage =>
          `　强化阶段【${stage.name}】：${stage.condition || '条件已满足'}`
        ),
        treasure.awakenName
          ? `　觉醒条件：${treasure.awakenCondition || '未知'}`
          : null,
        ''
      );
    }
    lines.push(
      '#升级无尽至宝 名称',
      '#装备无尽至宝 名称｜#卸下无尽至宝 名称',
      '#拓展无尽至宝槽'
    );
    return e.reply(lines.filter(Boolean).join('\n'));
  }

  async upgradeTreasureCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#升级无尽至宝\s*/, '').trim();
    return this.withLock(e, `treasure:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = upgradeEndlessTreasure(player, input);
        await Write_player(userId, player);
        return e.reply(
          `【${result.treasure.name}】已提升至Lv.${result.level}\n` +
          `消耗道痕：${result.cost}｜剩余：${result.balance}\n` +
          (result.nextCost === null ? '至宝已经升至满级' : `下次升级需要：${result.nextCost}道痕`)
        );
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  async equipTreasureCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#装备无尽至宝\s*/, '').trim();
    return this.withLock(e, `treasure:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = equipEndlessTreasure(player, input);
        await Write_player(userId, player);
        return e.reply(`已装备【${result.treasure.name}】（${result.equipped.length}/${result.slots}）`);
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  async unequipTreasureCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#卸下无尽至宝\s*/, '').trim();
    return this.withLock(e, `treasure:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = unequipEndlessTreasure(player, input);
        await Write_player(userId, player);
        return e.reply(`已卸下【${result.treasure.name}】（${result.equipped.length}/${result.slots}）`);
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  async unlockTreasureSlotCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return this.withLock(e, `treasure:${userId}`, async () => {
      const player = await Read_player(userId);
      try {
        const result = unlockEndlessTreasureSlot(player);
        await Write_player(userId, player);
        return e.reply(`第${result.slot}个无尽至宝槽已经开启\n消耗道痕：${result.cost}｜剩余：${result.balance}`);
      } catch (error) {
        return e.reply(error.message);
      }
    });
  }

  /* ==================== 全服排名 ==================== */

  async getServerMaxEndlessLayer() {
    try {
      const dir = `./plugins/${AppName}/resources/data/xiuxian_player`;
      const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
      let maxLayer = 0;
      for (const file of files) {
        try {
          const player = JSON.parse(
            fs.readFileSync(`${dir}/${file}`, 'utf8')
          );
          maxLayer = Math.max(maxLayer, Number(player.无尽劫境最高层) || 0);
        } catch (error) {
          // 单个存档损坏不影响排名
        }
      }
      return maxLayer;
    } catch (error) {
      logger.error('[无尽劫境] 全服最高层统计失败', error);
      return 0;
    }
  }

  async showEndlessRank(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    let rankings = [];
    try {
      const dir = `./plugins/${AppName}/resources/data/xiuxian_player`;
      const files = fs.readdirSync(dir).filter((file) => file.endsWith('.json'));
      for (const file of files) {
        const id = file.replace('.json', '');
        try {
          const player = JSON.parse(fs.readFileSync(`${dir}/${file}`, 'utf8'));
          const progress = normalizeEndlessDifficultyProgress(player);
          const layer = Number(player.无尽劫境最高层) || 0;
          if (!layer) continue;
          const difficultyTier = Math.min(
            ENDLESS_MAX_DIFFICULTY_TIER,
            Math.max(1, Math.ceil(layer / ENDLESS_TIER_MAX_LAYER))
          );
          const localLayer = progress.highestLayers[difficultyTier] ||
            (layer % ENDLESS_TIER_MAX_LAYER || ENDLESS_TIER_MAX_LAYER);
          rankings.push({
            qq: id,
            name: player.名号 || id,
            layer,
            difficultyTier,
            localLayer,
            runs: Number(player.无尽劫境次数) || 0,
          });
        } catch (error) {
          // 忽略损坏存档
        }
      }
    } catch (error) {
      logger.error('[无尽劫境] 排名读取失败', error);
    }
    rankings.sort(
      (a, b) => b.layer - a.layer || a.runs - b.runs || a.qq.localeCompare(b.qq)
    );
    const top = rankings.slice(0, 10);
    const lines = [
      '【无尽劫境·万界劫榜】',
      '按「难度优先、层数次之」排序（同进度取通关次数少者优先）',
      '',
      ...top.map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const isFirst = index === 0 && entry.layer >= 30;
        return `${medal} ${entry.name}｜${formatEndlessDifficulty(entry.difficultyTier)}·第${entry.localLayer}层｜通关${entry.runs}次${isFirst ? '｜【无尽劫境天尊】' : ''}`;
      }),
    ];
    const myRank = rankings.findIndex((entry) => entry.qq === userId) + 1;
    if (myRank > 0) {
      const mine = rankings[myRank - 1];
      lines.push('', `你的排名：第${myRank}名｜${formatEndlessDifficulty(mine.difficultyTier)}·第${mine.localLayer}层｜通关${mine.runs}次`);
    } else {
      lines.push('', '你还未进入劫榜，打穿第1关即可上榜。');
    }
    const serverMax = rankings[0]?.layer || 0;
    if (serverMax >= 30) {
      const serverTier = Math.min(
        ENDLESS_MAX_DIFFICULTY_TIER,
        Math.max(1, Math.ceil(serverMax / ENDLESS_TIER_MAX_LAYER))
      );
      const serverLocalLayer = serverMax % ENDLESS_TIER_MAX_LAYER || ENDLESS_TIER_MAX_LAYER;
      lines.push('', `当前全服最高纪录：${formatEndlessDifficulty(serverTier)}·第${serverLocalLayer}层。`);
    }
    return e.reply(lines.join('\n'));
  }

  /* ==================== 周末免费 ==================== */

  async weekendStatus(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    if (hasSuiyunFreeEndlessEntry(player)) return e.reply('【月华通行】岁云五阶段进入无尽劫境免秘钥、免心神，不占周末免费额度；扫荡仍需无尽扫荡券。');
    const today = new Date();
    const isWeekend = isWeekendNow(today);
    const weekKey = getWeekendFreeWeekKey(today);
    const used = player[WEEKEND_FREE_FIELD] === weekKey;
    const lines = [
      '【周末免费·无尽劫境】',
      `今天${isWeekend ? '是' : '不是'}周末（周六/周日）。`,
      isWeekend
        ? used
          ? `本周末（${weekKey}）免费入场额度已使用，下次开启需正常消耗秘钥与心神。`
          : `本周末（${weekKey}）免费入场额度尚未使用！开启无尽劫境时不消耗秘钥与心神。`
        : '周末（周六00:00至周日24:00）开放每人一次免费入场，无需秘钥与心神。',
    ];
    return e.reply(lines.join('\n'));
  }

  /* ==================== 称号系统 ==================== */

  async viewTitles(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    if (recoverEarnedTitles(player).length) await Write_player(userId, player);
    const view = getTitleViews(player);
    const lines = [
      '【称号】',
      view.equippedTitle
        ? `当前佩戴：${view.equippedTitle.name}`
        : '当前佩戴：无',
      '',
    ];
    if (!view.list.length) {
      lines.push('尚未获得任何称号。', '称号为玩法里程碑奖励，请留意对应玩法公告。');
      return e.reply(lines.join('\n'));
    }
    for (const title of view.list) {
      lines.push(
        `${title.equipped ? '✔' : '○'} 【${title.name}】${title.source || ''}`,
        `　${title.desc}`,
        `　${title.equipped ? '（佩戴中，发送 #更换称号 其他称号 可切换）' : `发送 #佩戴称号 ${title.name} 佩戴`}`
      );
    }
    return e.reply(lines.join('\n'));
  }

  async equipTitleCmd(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const titleName = e.msg.replace(/^#(?:佩戴|切换|更换)称号\s*/, '').trim();
    if (!titleName) return e.reply('请发送 #佩戴称号 称号名，如 #佩戴称号 无尽劫境天尊');
    const player = await Read_player(userId);
    const recovered = recoverEarnedTitles(player);
    if (!normalizeTitles(player).includes(titleName)) {
      if (recovered.length) await Write_player(userId, player);
      return e.reply(`你尚未拥有称号【${titleName}】，发送 #称号 查看已拥有称号`);
    }
    if (!equipTitle(player, titleName))
      return e.reply(`称号【${titleName}】不存在或无法佩戴`);
    await Write_player(userId, player);
    const effects = getTitleEffects(player);
    const effectLine = effects.attrPct || effects.tokenPct
      ? `\n在无尽劫境中全属性+${Math.round(effects.attrPct * 100)}%、道痕收益+${Math.round(effects.tokenPct * 100)}%。`
      : '';
    return e.reply(`已佩戴称号【${titleName}】！${effectLine}`);
  }
}

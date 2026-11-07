import { isXiuxianAdmin } from '../../model/xiuxian.js';
import fs from 'node:fs';
import path from 'node:path';

import {  config, data, plugin, verc } from '../../api/api.js';
import {
  ForwardMsg,
  Read_player,
  Read_equipment,
  Write_player,
  Write_equipment,
  __PATH,
  channel,
  existplayer,
  zd_battle,
} from '../../model/xiuxian.js';
import { writeJsonAtomically } from '../../utils/atomicJson.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../SecretPlace/rebirthTransaction.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import { getRealmAuthorityLevel } from '../../model/realmAuthority.js';
import { restoreHighlandForAdmin } from '../../model/planeDestruction.js';
import {
  restoreJuelingLifespan,
  suppressJuelingLifespan,
} from '../../model/juelingLifespan.js';
import { ensureTimeRiverSkills } from '../../model/timeRiverAdversary.js';
import {
  FIRST_BIG_SACRIFICE_NPCS,
  FIRST_SMALL_SACRIFICE_NPCS,
  STRANGE_SACRIFICE,
  STRANGE_SACRIFICE_PLANES,
  SACRIFICE_BUBBLE_GUIDANCE,
  advanceStrangeSacrificeState,
  applyStrangeSacrificeDefeat,
  applyStrangeSacrificeVictory,
  buildStrangeSacrificeEnemies,
  ensureStrangeSacrificeState,
  forceStartStrangeSacrifice,
  escapeSacrificeBubble,
  formatHeavenWillSlashStatus,
  getStrangeSacrificeEncounter,
  getStrangeSacrificeInteractionLock,
  resolveHighlandFinale,
  settleStrangeSacrifice,
  restoreHighlandSacrificeState,
} from '../../model/strangeSacrifice.js';

const STATE_FILE = path.join(__PATH.data_path, 'strange_sacrifice_state.json');
const PLANE_FILE = data.filePathMap.weimianList;
const RUNTIME = (globalThis[
  Symbol.for('zhutianxiuxian.strangeSacrificeRuntime')
] ??= {
  battleInProgress: false,
});

function readState() {
  let state;
  try {
    state = ensureStrangeSacrificeState(
      JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')),
    );
  } catch {
    state = ensureStrangeSacrificeState(null);
  }
  // 兼容旧版大祭终结记录；永久覆灭不因切换事件入口而重新开启。
  try {
    if (JSON.parse(fs.readFileSync(PLANE_FILE, 'utf8')).高原彻底覆灭 === true) {
      state.plateauDestroyed = true;
    }
  } catch {}
  return state;
}

function saveState(state) {
  writeJsonAtomically(STATE_FILE, state);
}

async function resolvePlayerSacrificeBubble(id) {
  return withPlayerMutationLock(id, async () => {
    const player = await Read_player(id);
    const result = escapeSacrificeBubble(player);
    if (!result.ok) return result;
    const transaction = new FileRollbackTransaction();
    transaction.capture(path.join(__PATH.player_path, `${id}.json`));
    transaction.capture(path.join(__PATH.equipment_path, `${id}.json`));
    try {
      await Write_player(id, player, { trackDailyTask: false });
      await Write_equipment(id, await Read_equipment(id));
      const refreshed = await Read_player(id);
      refreshed.当前血量 = Math.max(1, Number(refreshed.血量上限) || 1);
      await Write_player(id, refreshed, { trackDailyTask: false });
      transaction.commit();
      return { ...result, name: refreshed.名号 };
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  });
}

function bubbleStatusText(lock) {
  return [
    '【始祖永祭·空间泡影】',
    '过去、现在、未来的痕迹已被始祖祭尽。此处没有空间、时间、因果与任何概念。',
    `距挣脱泡影尚余${Math.ceil(lock.remainingMs / 60_000)}分钟（现实时间共720分钟，离线与重启继续计时）。`,
    '泡影中暂停现世交互，外界映照与加速不替代自身超脱。可发送 #空间泡影状态 查询。',
  ].join('\n');
}

function bubbleEscapeText(name) {
  return `【挣脱泡影·祭道之上】\n${name || '道友'}从没有任何概念的泡影中挣脱而出，超越祭道，真身与道果重归现世。\n现实时间720分钟已满；如今可彻底摧毁厄土高原，终结其时间线回溯。`;
}

function worldYear() {
  const current = config.getConfig('xiuxian', 'xiuxian')?.Era?.current || {};
  const total = Number(current.totalYears);
  return Number.isFinite(total)
    ? Math.max(
        total,
        getRealmEventWorldYear(current.index, current.years, current.epoch),
      )
    : getRealmEventWorldYear(current.index, current.years, current.epoch);
}

function readPlayerFiles() {
  try {
    return fs
      .readdirSync(__PATH.player_path)
      .filter((file) => file.endsWith('.json'));
  } catch {
    return [];
  }
}

function readPlaneSnapshot() {
  try {
    const plane = JSON.parse(fs.readFileSync(PLANE_FILE, 'utf8'));
    return Object.fromEntries(
      STRANGE_SACRIFICE_PLANES.map((name) => [name, plane[name]]),
    );
  } catch {
    return {};
  }
}

function isDoomedOutcome(event) {
  if (event.destroyed) return false;
  if (event.type === 'small_ended' && event.firstRound) return false;
  if (event.type === 'big_ended' && event.firstRound) return true;
  return !event.defended;
}

function settlePlanes(state, event, currentWorldYear) {
  let plane;
  try {
    plane = JSON.parse(fs.readFileSync(PLANE_FILE, 'utf8'));
  } catch {
    return;
  }
  const shouldRestore = !isDoomedOutcome(event);
  const snapshot = state.lastPlaneSnapshot || {};
  plane.位面毁灭记录 ??= {};

  for (const name of STRANGE_SACRIFICE_PLANES) {
    if (!(name in plane)) continue;
    if (shouldRestore) {
      if (snapshot[name] !== undefined) plane[name] = snapshot[name];
      if (event.destroyed && plane.位面毁灭记录[name]?.source === 'strange_emperor') {
        plane[name] = Math.max(1, Number(plane[name]) || 0);
      }
      if (plane.位面毁灭记录[name]?.source === 'strange_emperor')
        delete plane.位面毁灭记录[name];
    } else {
      plane[name] = 0;
      plane.位面毁灭记录[name] = {
        source: 'strange_emperor',
        actor:
          event.type === 'big_ended'
            ? '厄土十大始祖'
            : '厄土三大始祖与三十仙帝',
        worldYear: currentWorldYear,
      };
    }
  }
  if (Object.keys(plane.位面毁灭记录).length === 0) delete plane.位面毁灭记录;
  plane.诡异祭礼绝灵时代 = shouldRestore ? 0 : 1;
  if (event.destroyed) {
    plane.厄土高原 = 0;
    plane.高原彻底覆灭 = true;
  }
  plane.天意一刀结束总年份 = state.heavenSlashUntilWorldYear;
  writeJsonAtomically(PLANE_FILE, plane);
}

function battleExcerpt(messages = []) {
  if (messages.length <= 26) return messages;
  return [
    ...messages.slice(0, 16),
    `……中间省略${messages.length - 24}条帝战记录……`,
    ...messages.slice(-8),
  ];
}

function buildNpcAlly(player, name, scale = 1.5) {
  const maxHp = Math.max(
    1,
    Number(player.血量上限) || Number(player.当前血量) || 1,
  );
  return {
    名号: name,
    攻击: Math.max(1, Math.trunc((Number(player.攻击) || 1) * scale)),
    防御: Math.max(1, Math.trunc((Number(player.防御) || 1) * scale)),
    当前血量: Math.max(1, Math.trunc(maxHp * scale)),
    血量上限: Math.max(1, Math.trunc(maxHp * scale)),
    速度: Math.max(1, Number(player.速度) || 1100),
    mijinglevel_id:
      name.includes('荒天帝') || name.includes('叶天帝') ? 22 : 21,
    灵根: { name: '诸天映照', type: '至高道果', 法球倍率: 3 },
    法球倍率: 3,
    学习的功法: name.includes('荒天帝') ? ['【仙帝】他化自在法'] : [],
    _万灵魔幡不可炼化: true,
  };
}

function buildFirstBigAllies(player, encounter) {
  if (!encounter.firstRound) return [];
  if (encounter.enemyType === 'ancestor') {
    return ['荒天帝', '叶天帝'].map((name) => buildNpcAlly(player, name, 2));
  }
  if (encounter.enemyType === 'immortal_emperor') {
    return ['狠人大帝', '无始残尸', '仙帝柳神', '叶倾仙虚影'].map((name) =>
      buildNpcAlly(player, name),
    );
  }
  return [];
}

function statusText(state, currentWorldYear) {
  const active = state.activeEvent;
  const due =
    state.smallCount > state.bigCount
      ? state.bigDueWorldYear
      : state.smallDueWorldYear;
  const lines = [
    '【诡异高原·祭礼状态】',
    `诸天纪年：${currentWorldYear}年`,
    `小祭次数：${state.smallCount}｜大祭次数：${state.bigCount}`,
    `高原意志：${state.plateauDestroyed ? '已被祭道之上彻底摧毁' : '尚存，可逆转覆灭时间线'}｜累计回溯：${state.plateauRewinds || 0}次`,
  ];
  if (active) {
    lines.push(
      `当前事件：${active.type === 'small' ? '小祭万界' : '大祭万界'}（${
        active.firstRound ? '首次' : '后续轮次'
      }）`,
      `结束纪年：${active.endsWorldYear}年`,
      `成功守界者：${state.successfulDefenders || 0}人`,
    );
  } else if (due != null) {
    lines.push(
      `下一事件纪年：${due}年（尚余${Math.max(0, due - currentWorldYear)}年）`,
    );
  }
  lines.push(formatHeavenWillSlashStatus(state, currentWorldYear));
  if (!state.plateauDestroyed) lines.push(SACRIFICE_BUBBLE_GUIDANCE);
  return lines.join('\n');
}

export class StrangeSacrificeDeathLock extends plugin {
  constructor() {
    super({
      name: '诡异祭礼身灭道消封锁',
      dsc: '身灭道消期间拦截全部修仙指令',
      event: 'message',
      priority: 1,
      rule: [{ reg: '^#', fnc: 'guard' }],
    });
  }

  async guard(e) {
    let id = String(e.user_id || '').replace('qg_', '');
    id = String(await channel(id));
    if (!id || !(await existplayer(id))) return false;
    const player = await Read_player(id);
    const lock = getStrangeSacrificeInteractionLock(player);
    if (lock.kind === 'bubble') {
      if (lock.ready) {
        const result = await resolvePlayerSacrificeBubble(id);
        if (result.ok) await e.reply(bubbleEscapeText(result.name));
      } else {
        await e.reply(bubbleStatusText(lock));
      }
      return true;
    }
    if (/^#(?:空间泡影状态|挣脱空间泡影)$/.test(e.msg || '')) {
      await e.reply(player.始祖永祭?.status === 'transcended'
        ? '你已挣脱空间泡影，踏入祭道之上。'
        : SACRIFICE_BUBBLE_GUIDANCE);
      return true;
    }
    if (lock.active) {
      await e.reply(
        `【身灭道消·诸法皆寂】过去时间线尚未重聚，${Math.ceil(
          lock.remainingMs / 3_600_000,
        )}小时内不可进行任何交互。`,
      );
      return true;
    }
    if (!player.诡异祭礼身灭道消至) return false;
    delete player.诡异祭礼身灭道消至;
    player.修仙状态 = '空闲';
    player.道果状态 = '真血重聚';
    player.当前血量 = Math.max(
      1,
      Math.trunc((Number(player.血量上限) || 1) * 0.1),
    );
    await Write_player(id, player, { trackDailyTask: false });
    await e.reply('【真血重聚】二十四小时已满，你自寂灭中归来。');
    return false;
  }
}

export class StrangeSacrifice extends plugin {
  constructor() {
    super({
      name: '诡异高原小祭与大祭',
      dsc: '诡异族群周期性血祭诸天',
      event: 'message',
      priority: 580,
      rule: [
        { reg: '^#诡异祭礼状态$', fnc: 'showStatus' },
        { reg: '^#诡异始祖状态$', fnc: 'showStatus' },
        { reg: '^#天意一刀(?:状态|影响)?$', fnc: 'showHeavenWillSlash' },
        { reg: '^#迎战诡异小祭$', fnc: 'fightSmall' },
        { reg: '^#迎战诡异大祭$', fnc: 'fightBig' },
        { reg: '^#迎战厄土高原$', fnc: 'fightBig' },
        { reg: '^#开启诡异小祭万界$', fnc: 'openSmall'},
        { reg: '^#开启诡异大祭万界$', fnc: 'openBig'},
        {
          reg: '^#关闭诡异(?:小祭|大祭)万界$',
          fnc: 'adminSettle',
        },
        { reg: '^#结算诡异祭礼$', fnc: 'adminSettle'},
        { reg: '^#复苏[厄额]土高原$', fnc: 'restoreHighland' },
      ],
    });
    this.task = {
      cron: '0 */1 * * * *',
      name: '诡异高原祭礼巡查',
      fnc: () => this.tick(),
      log: false,
    };
    this.ticking = false;
  }

  async broadcast(message) {
    const set = config.getConfig('xiuxian', 'xiuxian');
    const configured = Array.isArray(set?.Era?.notifyGroups)
      ? set.Era.notifyGroups
      : [];
    const fallback = configured.length
      ? []
      : await redis.sMembers('xiuxian:AuctionofficialTask_GroupList');
    for (const groupId of new Set([...configured, ...fallback])) {
      try {
        await Bot.pickGroup(groupId).sendMsg(message);
      } catch (error) {
        logger.warn(`[诡异祭礼] 群${groupId}广播失败：${error.message}`);
      }
    }
  }

  async hasImmortalEmperor() {
    for (const file of readPlayerFiles()) {
      try {
        const player = JSON.parse(
          fs.readFileSync(path.join(__PATH.player_path, file), 'utf8'),
        );
        if (getRealmAuthorityLevel(player) >= 21) return true;
      } catch {}
    }
    return false;
  }

  async tick() {
    return withPlayerMutationLock('system:strange-sacrifice', () => this.tickLocked());
  }

  async tickLocked() {
    if (this.ticking || RUNTIME.battleInProgress) return false;
    this.ticking = true;
    try {
      for (const file of readPlayerFiles()) {
        try {
          const player = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, file), 'utf8'));
          if (!getStrangeSacrificeInteractionLock(player).ready) continue;
          const result = await resolvePlayerSacrificeBubble(file.replace('.json', ''));
          if (result.ok) await this.broadcast(bubbleEscapeText(result.name));
        } catch (error) {
          logger.warn(`[空间泡影] 玩家${file}结算失败：${error.message}`);
        }
      }
      const currentWorldYear = worldYear();
      const result = advanceStrangeSacrificeState(readState(), {
        worldYear: currentWorldYear,
        hasImmortalEmperor: await this.hasImmortalEmperor(),
      });
      await this.applyEvent(result.state, result.event, currentWorldYear);
      saveState(result.state);
      return Boolean(result.event);
    } finally {
      this.ticking = false;
    }
  }

  async applyEvent(state, event, currentWorldYear) {
    if (!event) return;
    if (event.type === 'small_warning') {
      return this.broadcast(
        [
          '【小祭万界·两千年预警】',
          '厄土高原黑雾翻涌，三大始祖、三十位仙帝与大批道祖已经苏醒。',
          `祭礼将在诸天纪年${event.dueWorldYear}年降临，所有位面都将成为血祭目标。`,
        ].join('\n'),
      );
    }
    if (event.type === 'big_warning') {
      return this.broadcast(
        [
          '【大祭万界·两千年预警】',
          '十口古棺同时震动，十大始祖、十位厄土仙帝与二百位道祖将倾巢而出。',
          `大祭将在诸天纪年${event.dueWorldYear}年降临。`,
        ].join('\n'),
      );
    }
    if (event.type.endsWith('_started')) {
      state.planeSnapshot = readPlaneSnapshot();
      const small = event.type === 'small_started';
      const first = event.firstRound;
      const lines = small
        ? [
            '【诡异高原·小祭万界】',
            '三大始祖、三十位厄土仙帝与至少二十五位诡异道祖横渡祭海，诸天各界同时染血。',
            first
              ? `荒天帝、仙帝柳神与${FIRST_SMALL_SACRIFICE_NPCS.slice(2).join(
                  '、',
                )}挺身而出，牵制三大始祖与道祖军团。`
              : '古史中再无荒与柳神的身影，这一轮只能由当世强者迎战。',
            '仙帝玩家发送 #迎战诡异小祭，将独战五位厄土仙帝；其功法会被仙帝场域大幅压制。',
          ]
        : [
            '【诡异高原·大祭万界】',
            '小祭过去两个纪元，十大始祖、十位厄土仙帝与二百位道祖共同降临。',
            first
              ? `${FIRST_BIG_SACRIFICE_NPCS.join(
                  '、',
                )}与大批绝世人物立于诸天之前。`
              : '荒、叶等人已从古史中消失，当世再无原著援军。',
            '祭道对决十大始祖，仙帝迎战十大仙帝，道祖与准仙帝各自面对十位诡异道祖。',
            '祭道及以下即使覆灭始祖，高原意志也将复苏，回溯至诡异族群未灭的时间线；唯有祭道之上能彻底摧毁。',
            SACRIFICE_BUBBLE_GUIDANCE,
            '发送 #迎战诡异大祭。',
          ];
      return this.broadcast(lines.join('\n'));
    }
    if (event.type.endsWith('_ended')) {
      await this.settlePlayers(state, event);
      settlePlanes(state, event, currentWorldYear);
      if (event.destroyed) {
        await redis.set('xiuxian:dajie_eternally_defeated', 'true');
        await redis.del('guiyishizu', 'guiyishizu_ancestors', 'gaoyuan');
      }
      const small = event.type === 'small_ended';
      const lines =
        event.destroyed
          ? [
              '【大祭终焉·高原永灭】',
              '祭道之上的意志超越一切概念，将高原本源与诡异族群一并彻底摧毁。',
              '高原再无复苏与回溯之机；诸天重聚，小祭与大祭的轮回就此终止。',
            ]
          : small && event.firstRound
          ? [
              '【小祭尾声·荒映照诸天】',
              '荒天帝喋血厄土祖地门前，柳神为救石昊被始祖击穿眉心，大批绝世人物相继战死。',
              '石昊恸哭后强行映照诸天，除身灭道消的仙帝玩家外，万灵与破碎诸界尽数归来。',
              '完成映照后，荒陷入不念不想的虚弱状态，自古史中彻底消失。',
            ]
          : !small && event.firstRound
          ? [
              '【大祭尾声·诸天绝灵】',
              '荒与叶血染祭海，狠人、无始残尸、柳神虚影、叶倾仙虚影及诸天绝世人物全部陨落。',
              '所有位面被彻底打灭，诸天进入绝灵时代。此后的小祭与大祭再无荒、叶等人现身。',
            ]
          : [
              `【${small ? '小祭' : '大祭'}尾声】`,
              event.defended
                ? '当世至高强者击退诡异军团，诸天残界得以重聚。'
                : '当世无人挡住最终血祭，所有位面崩灭，诸天坠入绝灵时代。',
            ];
      lines.push(formatHeavenWillSlashStatus(state, currentWorldYear));
      return this.broadcast(lines.join('\n'));
    }
  }

  async settlePlayers(state, event) {
    const threshold = event.type === 'small_ended' ? 21 : 20;
    const participants = state.lastParticipants || {};
    const doomed = isDoomedOutcome(event);
    for (const file of readPlayerFiles()) {
      const id = file.replace('.json', '');
      try {
        const player = await Read_player(id);
        let changed = false;
        if (doomed) {
          changed = player.诡异祭礼绝灵状态 !== '诸天绝灵';
          player.诡异祭礼绝灵状态 = '诸天绝灵';
          changed = suppressJuelingLifespan(player) || changed;
        } else if (player.诡异祭礼绝灵状态) {
          delete player.诡异祭礼绝灵状态;
          restoreJuelingLifespan(player);
          changed = true;
        }
        if (
          event.type === 'small_ended' &&
          event.firstRound &&
          getRealmAuthorityLevel(player) < 21
        ) {
          player.荒天帝映照复活次数 =
            (Number(player.荒天帝映照复活次数) || 0) + 1;
          await Write_player(id, player, { trackDailyTask: false });
          continue;
        }
        if (
          getRealmAuthorityLevel(player) < threshold ||
          participants[id]?.result
        ) {
          if (changed)
            await Write_player(id, player, { trackDailyTask: false });
          continue;
        }
        if (event.destroyed || getStrangeSacrificeInteractionLock(player).active) {
          if (changed) await Write_player(id, player, { trackDailyTask: false });
          continue;
        }
        applyStrangeSacrificeDefeat(player, {
          enemyType: event.type === 'big_ended' && getRealmAuthorityLevel(player) === 22 ? 'ancestor' : undefined,
        });
        await Write_player(id, player, { trackDailyTask: false });
      } catch (error) {
        logger.warn(`[诡异祭礼] 玩家${id}尾声结算失败：${error.message}`);
      }
    }
  }

  async showStatus(e) {
    await this.tick();
    return e.reply(statusText(readState(), worldYear()));
  }

  async showHeavenWillSlash(e) {
    const id = String(await channel(String(e.user_id || '').replace('qg_', '')));
    const messages = [formatHeavenWillSlashStatus(readState(), worldYear())];
    if (await existplayer(id)) {
      // 查询只看落盘记录，不触发伴生境界同步或额外保存。
      const player = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, `${id}.json`), 'utf8'));
      messages.push(
        `【个人记录】${player.名号 || '道友'}｜累计被斩${Number(player.天意一刀斩道次数) || 0}次`,
        `当前血量：${Number(player.当前血量) || 0}｜当前道伤：${(Number(player.道伤) || 0).toFixed(1)}`,
        player.天意一刀提示 ? `【最近一次斩道记录·非当前状态】\n${player.天意一刀提示}` : '尚无天意一刀斩道记录。',
      );
    }
    return e.reply(messages.join('\n\n'));
  }

  async fightSmall(e) {
    return this.fight(e, 'small');
  }

  async fightBig(e) {
    return this.fight(e, 'big');
  }

  async fight(e, type) {
    return withPlayerMutationLock('system:strange-sacrifice', () => this.fightLocked(e, type));
  }

  async fightLocked(e, type) {
    if (!verc({ e })) return false;
    let id = String(e.user_id).replace('qg_', '');
    id = String(await channel(id));
    if (!(await existplayer(id))) return e.reply('请先创建修仙角色。');
    const player = await Read_player(id);
    const lock = getStrangeSacrificeInteractionLock(player);
    if (lock.kind === 'bubble') return e.reply(bubbleStatusText(lock));
    if (lock.active)
      return e.reply(
        `【身灭道消】尚需${Math.ceil(
          lock.remainingMs / 3_600_000,
        )}小时才能重聚真身。`,
      );

    const state = readState();
    if (state.plateauDestroyed) return e.reply('高原与诡异族群已被祭道之上彻底摧毁，祭礼轮回已终结。');
    if (state.activeEvent?.type !== type) {
      return e.reply(`当前并未爆发诡异${type === 'small' ? '小祭' : '大祭'}。`);
    }
    if (state.participants[id] && state.participants[id].result !== 'rewound')
      return e.reply('本轮祭礼已经留下你的战斗结果，不可重复迎战。');

    const encounter = getStrangeSacrificeEncounter(
      player,
      type,
      state.activeEvent.firstRound,
    );
    if (!encounter.allowed) {
      if (encounter.reason === 'npc_front' && state.activeEvent.firstRound) {
        return e.reply(
          '你尚未踏入仙帝领域，此刻由荒天帝、仙帝柳神与追随者挡在最前方。',
        );
      }
      return e.reply(
        type === 'big'
          ? '迎战大祭至少需要准仙帝或道祖权柄。'
          : '五帝围猎只会锁定仙帝级玩家。',
      );
    }

    if (RUNTIME.battleInProgress)
      return e.reply('已有至高强者正在厄土血战，请等待本场帝战结算。');
    RUNTIME.battleInProgress = true;
    try {
      ensureTimeRiverSkills(data);
      const challenger = {
        ...structuredClone(player),
        id,
        当前血量: Math.max(1, Number(player.当前血量) || 1),
        血量上限: Math.max(
          1,
          Number(player.血量上限) || Number(player.当前血量) || 1,
        ),
        _时间长河反制目标: true,
        _时间长河反制来源: '尸骸仙帝',
      };
      const enemies = buildStrangeSacrificeEnemies(challenger, encounter);
      const allies = buildFirstBigAllies(challenger, encounter);
      const battle = await zd_battle([challenger, ...allies], enemies, {
        timeRiverBattle: true,
        battleType: 'strange_sacrifice',
      });
      const playerCombatant = battle.A_team?.[0];
      const playerAlive = Number(playerCombatant?.当前血量) > 0;
      const killed = (battle.B_team || []).filter(
        (enemy) => enemy.当前血量 <= 0 && enemy._仙帝级强者,
      ).length;
      const won = playerAlive && Number(battle.B_hp) <= 0;
      const finale = won && encounter.enemyType === 'ancestor'
        ? resolveHighlandFinale(state, player) : null;
      const progress = won && !finale?.rewound
        ? applyStrangeSacrificeVictory(player, encounter, killed)
        : { emperorKills: 0, totalEmperorKills: Number(player.厄土仙帝击杀数) || 0 };
      let conclusion;

      if (finale?.rewound) {
        conclusion = [
          '【高原意志复苏·覆灭结局回溯】',
          '十大始祖与诡异族群虽已覆灭，高原深处的意志却在此刻苏醒，扭转一切。',
          '覆灭的历史被抹去，时间线回到大战之前：始祖与族群全部复归，本次击杀收益及守界成功不落定。',
          '本轮祭礼仍在继续，可再次迎战；唯有祭道之上，方能留下不可回溯的终局。',
        ].join('\n');
        state.participants[id] = { result: 'rewound', killed: 0, at: Date.now() };
      } else if (won) {
        player.当前血量 = Math.min(
          Number(player.血量上限) || 1,
          Number(playerCombatant.当前血量) || 1,
        );
        state.successfulDefenders =
          (Number(state.successfulDefenders) || 0) + 1;
        conclusion = `【守界成功】斩杀${progress.emperorKills}位仙帝级强者，累计仙帝击杀${progress.totalEmperorKills}/10。`;
        state.participants[id] = { result: 'win', killed, at: Date.now() };
      } else {
        const defeat = applyStrangeSacrificeDefeat(player, { enemyType: encounter.enemyType });
        conclusion = defeat.eternallySacrificed
          ? bubbleStatusText(getStrangeSacrificeInteractionLock(player))
          : defeat.rewritten
          ? [
              '【永恒改命】本战仍判负且不结算击杀收益。',
              '永恒仙图抵消了身灭道消：时间线未被打灭，也未进入24小时交互封锁。',
              `累计仙帝击杀${progress.totalEmperorKills}/10。`,
            ].join('\n')
          : [
              `【身灭道消】本战斩杀${progress.emperorKills}位仙帝级强者。`,
              `过去${defeat.count}条时间线被打灭，24小时内所有交互封锁。`,
              `累计仙帝击杀${progress.totalEmperorKills}/10。`,
            ].join('\n');
        state.participants[id] = { result: 'loss', killed, at: Date.now() };
      }
      await Write_player(id, player, { trackDailyTask: false });
      if (finale?.destroyed) {
        const settled = settleStrangeSacrifice(state, 'big', worldYear());
        await this.applyEvent(settled.state, settled.event, worldYear());
        saveState(settled.state);
        conclusion += '\n【高原永灭】你以祭道之上的意志彻底摧毁高原，本次结局永久落定。';
      } else {
        saveState(state);
      }
      await ForwardMsg(e, [
        `【${type === 'small' ? '五帝围猎' : '大祭决战'}】敌军速度固定为${
          STRANGE_SACRIFICE.immortalEmperorEnemySpeed
        }。`,
        ...battleExcerpt(battle.msg || []),
        conclusion,
      ]);
      return true;
    } finally {
      RUNTIME.battleInProgress = false;
    }
  }

  async forceOpen(e, type) {
    if (!isXiuxianAdmin(e)) return e.reply('此指令仅限修仙管理员。');
    return withPlayerMutationLock('system:strange-sacrifice', () => this.forceOpenLocked(e, type));
  }

  async forceOpenLocked(e, type) {
    const currentWorldYear = worldYear();
    const result = forceStartStrangeSacrifice(
      readState(),
      type,
      currentWorldYear,
    );
    if (!result.event) return e.reply('高原已经彻底覆灭，祭礼轮回已终结。');
    await this.applyEvent(result.state, result.event, currentWorldYear);
    saveState(result.state);
    return e.reply(
      `已强制开启${type === 'small' ? '诡异小祭万界' : '诡异大祭万界'}。`,
    );
  }

  async openSmall(e) {
    return this.forceOpen(e, 'small');
  }

  async openBig(e) {
    return this.forceOpen(e, 'big');
  }

  async adminSettle(e) {
    return withPlayerMutationLock('system:strange-sacrifice', () => this.adminSettleLocked(e));
  }

  async adminSettleLocked(e) {
    const state = readState();
    if (!state.activeEvent) return e.reply('当前没有正在进行的诡异祭礼。');
    const currentWorldYear = worldYear();
    const result = settleStrangeSacrifice(
      state,
      state.activeEvent.type,
      currentWorldYear,
    );
    await this.applyEvent(result.state, result.event, currentWorldYear);
    saveState(result.state);
    return e.reply('本轮诡异祭礼已完成尾声结算。');
  }

  async restoreHighland(e) {
    const rawId = String(e.user_id || '').replace('qg_', '');
    const id = String(await channel(rawId));
    const masters = (config.getConfig('xiuxian', 'xiuxian')?.Master || []).map(String);
    if (!isXiuxianAdmin(e)) return e.reply('此指令仅限机器人主人或修仙管理员。');
    return withPlayerMutationLock('system:strange-sacrifice', async () => {
      // 与祭礼巡查/战斗结算同锁，先等当前结算完成，避免旧状态再次覆盖复苏结果。
      const legacyKeys = ['xiuxian:dajie_eternally_defeated', 'xiuxian:epochs_since_dajie'];
      const legacyBoss = await redis.get('guiyishizu');
      let boss;
      try { boss = legacyBoss ? JSON.parse(legacyBoss) : null; } catch {}
      if (boss?.isEternallyDefeated) legacyKeys.push('guiyishizu', 'gaoyuan', 'guiyishizu_ancestors');
      const previousRedis = await Promise.all(legacyKeys.map(async key => [key, await redis.get(key)]));
      const transaction = new FileRollbackTransaction();
      transaction.capture(PLANE_FILE);
      transaction.capture(STATE_FILE);
      try {
        const restored = restoreHighlandSacrificeState(readState(), worldYear());
        restoreHighlandForAdmin(PLANE_FILE);
        saveState(restored);
        await redis.del(...legacyKeys);
        transaction.commit();
      } catch (error) {
        transaction.rollback();
        for (const [key, value] of previousRedis) {
          if (value !== null && value !== undefined) await redis.set(key, value);
        }
        throw error;
      }
      return e.reply('【厄土高原·管理员复苏】高原与诡异本源已恢复，祭道之上的永久覆灭和大祭终结标记已解除，后续祭礼重新按原周期推进。');
    });
  }
}

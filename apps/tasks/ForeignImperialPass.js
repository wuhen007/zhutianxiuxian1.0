import plugin from '../../../../lib/plugins/plugin.js';
import fs from 'fs';
import path from 'path';
import config from '../../model/Config.js';
import { data } from '../../api/api.js';
import {
  Add_najie_thing,
  ForwardMsg,
  Go,
  Read_najie,
  Read_player,
  Write_player,
  __PATH,
  channel,
  existplayer,
  zd_battle,
} from '../../model/xiuxian.js';
import RealmEvents from './RealmEvents.js';
import { getRealmEventWorldYear } from '../../model/realmEventClock.js';
import {
  IMPERIAL_PASS_PRISON_MINUTES,
  IMPERIAL_PASS_REST_YEARS,
  IMPERIAL_PASS_TRIGGER_CHANCE,
  applyImperialPassSortie,
  createForeignProdigy,
  createImperialPassWave,
  getImperialPassSupport,
  getWaveEnemyCount,
  isImperialPassThreshold,
  isImperialPassWaveComplete,
  rankImperialPassPrestige,
} from '../../model/foreignImperialPass.js';
import { adjustDaoHeart } from '../../model/daoHeart.js';
import {
  markPlaneDestroyed,
  PLANE_DESTRUCTION_SOURCES,
} from '../../model/planeDestruction.js';

const STATE_PATH = path.join(__PATH.data_path, 'foreign_imperial_pass.json');
const PLANE_PATH = path.join(__PATH.data_path, '位面.json');
const SORTIE_COOLDOWN_MS = 10 * 60 * 1000;
const SURRENDER_DEMAND_CHANCE = 0.3;
const TARGET_PLANES = new Set([2, 2.5]);
const FOREIGN_NAMES = [
  '鹤无双后裔', '赤蒙', '帝族无畏者', '黄金魔鸟', '吞天兽传人', '螭龙少主',
  '九头王族', '堕落血凰', '时间兽后裔', '古牧', '无殇帝族天骄', '蒲魔王后裔',
];
const DEFEAT_TAUNTS = [
  '异域天骄踏着你的兵刃冷笑：“九天无人，不过如此。”',
  '敌军将你的败绩刻上战旗，喝令九天修士低首。',
  '异域王族以战矛点地，当众讥讽帝关只会倚城苟守。',
];

function defaultState() {
  return {
    version: 1,
    status: 'dormant',
    campaign: 0,
    wave: 0,
    lastCheckedWorldYear: null,
    nextWaveYear: null,
    active: null,
    prestige: {},
    prisoners: [],
    history: [],
  };
}

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return defaultState();
    return { ...defaultState(), ...JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) };
  } catch (error) {
    console.error('[异域叩关] 读取事件状态失败:', error);
    return defaultState();
  }
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function currentWorldYear() {
  const settings = config.getConfig('xiuxian', 'xiuxian') || {};
  const current = settings.Era?.current || {};
  if (Number.isFinite(Number(current.totalYears))) return Number(current.totalYears);
  return getRealmEventWorldYear(current.index || 0, current.years || 0, current.epoch || 1);
}

function battlePlayer(player) {
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

function battleExcerpt(messages = []) {
  if (messages.length <= 30) return messages;
  return [...messages.slice(0, 20), `……中间省略${messages.length - 30}条战报……`, ...messages.slice(-10)];
}

export class ForeignImperialPass extends plugin {
  constructor() {
    super({
      name: '异域叩击帝关',
      dsc: '原始帝城多波全服防守事件',
      event: 'message',
      priority: 600,
      rule: [
        { reg: '^#?(帝关战况|异域叩关)$', fnc: 'showImperialPass' },
        { reg: '^#?(驰援帝关|迎战异域)$', fnc: 'reinforceImperialPass' },
        { reg: '^#?融合帝血$', fnc: 'fuseImperialBlood' },
        { reg: '^#?强制异域叩关$', fnc: 'forceImperialPass' },
      ],
    });
    if (!fs.existsSync(STATE_PATH)) writeState(defaultState());
    this.task = [{
      cron: '0 */5 * * * *',
      name: '异域叩击帝关检查',
      fnc: () => this.checkImperialPass(),
      log: false,
    }];
    this.checking = false;
    this.settling = false;
    this.kingBattleRunning = false;
  }

  async listPlayers() {
    const files = fs.readdirSync(__PATH.player_path).filter(file => file.endsWith('.json'));
    const players = [];
    for (const file of files) {
      const qq = file.slice(0, -5);
      try {
        const player = await Read_player(qq);
        if (player?.名号) players.push({ qq, player });
      } catch (error) {
        console.error(`[异域叩关] 读取玩家${qq}失败:`, error?.message);
      }
    }
    return players;
  }

  async requiredDefenders(state, players = null) {
    const allPlayers = players || await this.listPlayers();
    const prisoners = new Set((state.prisoners || []).map(item => String(item.qq)));
    return allPlayers.filter(({ qq, player }) => (
      TARGET_PLANES.has(Number(player.power_place)) && !prisoners.has(String(qq))
    ));
  }

  async checkImperialPass(random = Math.random) {
    if (this.checking) return false;
    this.checking = true;
    try {
      const year = currentWorldYear();
      let state = readState();

      if (state.status === 'active') {
        if (state.active?.phase === 'army' && isImperialPassWaveComplete(state.active)) {
          await this.tryCompleteWave();
          return true;
        }
        const deadline = state.active?.phase === 'kingBattle'
          ? state.active.kingDeadlineWorldYear
          : state.active?.deadlineWorldYear;
        if (Number.isFinite(Number(deadline)) && year >= Number(deadline)) {
          await this.breachImperialPass('帝关援军未能在期限内完成防守', year);
        }
        return true;
      }

      if (state.status === 'resting') {
        if (year >= Number(state.nextWaveYear)) await this.startWave(state.wave + 1, year);
        return true;
      }

      if (state.status !== 'dormant' || Number(state.lastCheckedWorldYear) === year) return false;
      state.lastCheckedWorldYear = year;
      writeState(state);
      const players = await this.listPlayers();
      if (!players.some(({ player }) => isImperialPassThreshold(player))) return false;
      if (random() >= IMPERIAL_PASS_TRIGGER_CHANCE) return false;
      await this.startWave(1, year, players);
      return true;
    } finally {
      this.checking = false;
    }
  }

  async startWave(wave, year, players = null) {
    const state = readState();
    const defenders = await this.requiredDefenders(state, players);
    state.status = 'active';
    state.campaign = wave === 1 ? Number(state.campaign || 0) + 1 : state.campaign;
    state.wave = wave;
    state.nextWaveYear = null;
    state.active = createImperialPassWave({
      wave,
      worldYear: year,
      eligibleQqs: defenders.map(item => item.qq),
    });
    writeState(state);

    const leaders = wave === 1
      ? '异域不朽者与至尊亲临阵前，百万异域大军压向原始帝城。'
      : wave === 2
        ? '五千年休养已毕，更多帝族天骄携不朽法器卷土重来。'
        : '第三次天渊震荡，安澜、俞陀的法相在异域尽头升起。';
    await RealmEvents.broadcastEvent([
      `【异域叩击帝关·第${wave}波】`,
      leaders,
      `本波需击杀异域天骄100名，并由开战时身处遮天位面、九天十地的${defenders.length}名修士全部驰援。`,
      `防守期限：诸天纪年${state.active.deadlineWorldYear}年。`,
      '发送 #驰援帝关 参战；发送 #帝关战况 查看士气与威名榜。',
    ].join('\n'));
    return state.active;
  }

  async getPlayerContext(e) {
    let qq = e.user_id.toString().replace('qg_', '');
    qq = await channel(qq);
    if (!await existplayer(qq)) return null;
    return { qq: String(qq), player: await Read_player(qq) };
  }

  async showImperialPass(e) {
    const state = readState();
    if (state.status === 'dormant') return e.reply('原始帝城烽燧未燃，异域暂未叩关。');
    if (state.status === 'resting') {
      return e.reply([
        '【帝关战后】异域大军暂退，正在休养生息。',
        `当前已过第${state.wave}波，下一波将在诸天纪年${state.nextWaveYear}年到来。`,
        `距离再犯尚余${Math.max(0, Number(state.nextWaveYear) - currentWorldYear())}年。`,
      ].join('\n'));
    }
    if (state.status === 'ended') {
      return e.reply(state.outcome === 'defended'
        ? '【帝关战史】帝血照耀天渊，不朽之王退去，原始帝城守住了。'
        : '【帝关战史】城防已破，遮天位面与九天十地皆沦为残破位面。');
    }

    const active = state.active;
    const support = getImperialPassSupport(active);
    const ranking = rankImperialPassPrestige(state.prestige).slice(0, 5);
    const lines = [
      `【异域叩击帝关·第${active.wave}波】`,
      active.phase === 'army' ? '阶段：异域天骄与大军攻城' : '阶段：孟天正融合神胎，帝血决战不朽之王',
      `异域士气：${active.morale}/100｜天骄击杀：${active.totalKills}/100`,
      `帝关应援：${support.supported}/${support.required}`,
      `防守期限：诸天纪年${active.phase === 'army' ? active.deadlineWorldYear : active.kingDeadlineWorldYear}年`,
      '',
      '【帝关威名榜】',
      ...(ranking.length
        ? ranking.map((item, index) => `${index + 1}. ${item.name}｜威名${item.prestige}｜斩敌${item.kills}`)
        : ['尚无人出战。']),
    ];
    if (active.phase === 'kingBattle' && !active.bloodChampion) {
      lines.push('', '孟天正以身阻敌，携带【帝血】的参战者请发送 #融合帝血。');
    }
    return e.reply(lines.join('\n'));
  }

  async reinforceImperialPass(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;
    const { qq, player } = context;
    let state = readState();
    const active = state.active;
    if (state.status !== 'active' || active?.phase !== 'army') {
      return e.reply('此刻没有可以迎战的异域大军。');
    }
    if (!TARGET_PLANES.has(Number(player.power_place))) {
      return e.reply('异域叩击的是遮天位面与九天十地，你必须先身处其中一方才能驰援帝关。');
    }
    if (Number(active.morale) <= 0) {
      if (active.participants?.[qq]?.supported) {
        return e.reply('异域大军士气已经崩溃，你已完成本波驰援，只待其余修士登城。');
      }
      state.active = applyImperialPassSortie(active, {
        qq,
        name: player.名号,
        kills: 0,
        defeated: false,
        now: Date.now(),
      });
      state.prestige[qq] ||= { name: player.名号, prestige: 0, kills: 0 };
      writeState(state);
      const support = getImperialPassSupport(state.active);
      await e.reply([
        '【帝关清剿】异域主力已经溃退，你赶到城头肃清残敌并补上防线。',
        `帝关应援：${support.supported}/${support.required}`,
      ].join('\n'));
      await this.tryCompleteWave();
      return true;
    }
    const lastSortieAt = Number(active.participants?.[qq]?.lastSortieAt) || 0;
    if (Date.now() - lastSortieAt < SORTIE_COOLDOWN_MS) {
      const minutes = Math.ceil((SORTIE_COOLDOWN_MS - Date.now() + lastSortieAt) / 60000);
      return e.reply(`你刚从帝关战场退下，至少还需调息${minutes}分钟。`);
    }
    if (!await Go(e)) return false;

    // Reserve the sortie before the long battle so duplicate commands cannot overlap.
    active.participants[qq] ||= { qq, name: player.名号, sorties: 0, kills: 0, prestige: 0, deaths: 0, supported: false };
    active.participants[qq].lastSortieAt = Date.now();
    writeState(state);

    const enemyCount = getWaveEnemyCount(active.wave);
    const enemies = Array.from({ length: enemyCount }, (_, index) => createForeignProdigy(player, data, {
      name: `${FOREIGN_NAMES[index % FOREIGN_NAMES.length]}·${index + 1}`,
    }));
    const battle = await zd_battle(battlePlayer(player), enemies, { battleType: 'foreign_imperial_pass' });
    const kills = (battle.B_team || []).filter(enemy => Number(enemy.当前血量) <= 0).length;
    const defeated = battle.winner !== 'A';
    const daoHeartLoss = defeated ? active.wave * 10 : 0;

    player.当前血量 = defeated ? 1 : Math.max(1, Math.trunc(Number(battle.A_hp) || 1));
    if (defeated) adjustDaoHeart(player, -daoHeartLoss, `帝关血战第${active.wave}波失败`);
    else if (kills > 0) adjustDaoHeart(player, 10, '帝关斩杀异域天骄');
    await Write_player(qq, player);

    state = readState();
    if (state.status === 'active' && state.active?.id === active.id && state.active.phase === 'army') {
      state.active = applyImperialPassSortie(state.active, {
        qq,
        name: player.名号,
        kills,
        defeated,
        now: Date.now(),
      });
      const total = state.prestige[qq] || { name: player.名号, prestige: 0, kills: 0 };
      total.name = player.名号;
      total.prestige += kills;
      total.kills += kills;
      state.prestige[qq] = total;
      writeState(state);
    }

    const support = getImperialPassSupport(state.active);
    const summary = [
      `【帝关血战·第${active.wave}波】`,
      `${player.名号}独对${enemyCount}名同境异域天骄，本次斩敌${kills}名。`,
      defeated ? DEFEAT_TAUNTS[Math.floor(Math.random() * DEFEAT_TAUNTS.length)] : '你浴血杀回城头，身后异域天骄尽伏。',
      ...(defeated ? [`道心-${daoHeartLoss}，当前血量降至1。`] : []),
      `异域士气：${state.active?.morale ?? 0}/100｜全军斩敌：${state.active?.totalKills ?? 0}/100`,
      `帝关应援：${support.supported}/${support.required}`,
    ];
    await ForwardMsg(e, [...summary, '', ...battleExcerpt(battle.msg)]);
    await this.tryCompleteWave();
    return true;
  }

  async tryCompleteWave() {
    if (this.settling) return false;
    this.settling = true;
    try {
      const state = readState();
      if (state.status !== 'active' || !isImperialPassWaveComplete(state.active)) return false;
      if (state.wave === 3) return await this.beginKingBattle(state);
      return await this.completeArmyWave(state);
    } finally {
      this.settling = false;
    }
  }

  async completeArmyWave(state) {
    const year = currentWorldYear();
    const wave = state.wave;
    const ranking = rankImperialPassPrestige(state.prestige);
    const captive = Math.random() < SURRENDER_DEMAND_CHANCE
      ? ranking.find(item => !(state.prisoners || []).some(prisoner => String(prisoner.qq) === String(item.qq)))
      : null;
    state.history.push({ wave, outcome: 'routed', year, kills: state.active.totalKills, captive: captive?.qq || null });
    state.history = state.history.slice(-20);
    state.status = 'resting';
    state.active = null;
    state.nextWaveYear = year + IMPERIAL_PASS_REST_YEARS;
    if (captive) {
      state.prisoners.push({ qq: String(captive.qq), name: captive.name, wave, capturedAt: Date.now() });
    }
    writeState(state);
    if (captive) await this.imprisonPlayer(captive);

    await RealmEvents.broadcastEvent([
      `【帝关大捷·第${wave}波退军】`,
      '百名异域天骄伏尸城下，大军士气彻底崩溃，退回天渊另一端。',
      captive
        ? `异域随后索要威名最盛的${captive.name}。帝关内部有人屈从，${captive.name}被交出，沦为异域阶下囚。`
        : '帝关拒绝了异域的一切条件，无人被交出。',
      `异域将休养五千年，预计于诸天纪年${state.nextWaveYear}年再犯。`,
    ].join('\n'));
    return true;
  }

  async imprisonPlayer(captive) {
    const now = Date.now();
    await redis.set(`xiuxian:player:${captive.qq}:action`, JSON.stringify({
      action: '被囚禁异域',
      start_time: now,
      end_time: now + IMPERIAL_PASS_PRISON_MINUTES * 60000,
      time: IMPERIAL_PASS_PRISON_MINUTES,
      working: '1',
      Place_action: '1',
      Place_actionplus: '1',
    }));
  }

  async beginKingBattle(state) {
    state.active.phase = 'kingBattle';
    state.active.mengTianzhengTriggered = true;
    state.active.kingDeadlineWorldYear = currentWorldYear() + 1000;
    writeState(state);
    await RealmEvents.broadcastEvent([
      '【第三波·不朽之王叩关】',
      '安澜托起原始帝城，俞陀横断天渊。孟天正不再迟疑，强行融合未圆满的神胎，以身战不朽。',
      '神胎崩裂之后，两尊不朽之王仍在逼近。帝关需要那一滴跨越万古的帝血。',
    ].join('\n'));

    const ranking = rankImperialPassPrestige(state.prestige)
      .filter(item => state.active.participants?.[String(item.qq)]?.supported);
    for (const candidate of ranking) {
      if (await this.hasImperialBlood(candidate.qq)) {
        return this.resolveKingBattle(candidate.qq, null);
      }
    }
    await RealmEvents.broadcastEvent('【帝血未现】携带【帝血】的帝关参战者，请在下一千年内发送 #融合帝血。');
    return true;
  }

  async hasImperialBlood(qq) {
    const najie = await Read_najie(qq);
    return Boolean(najie?.道具?.some(item => item.name === '帝血' && Number(item.数量) > 0));
  }

  async fuseImperialBlood(e) {
    const context = await this.getPlayerContext(e);
    if (!context) return false;
    const state = readState();
    if (state.status !== 'active' || state.active?.phase !== 'kingBattle') {
      return e.reply('孟天正事件尚未触发，帝血此刻没有回应。');
    }
    if (!state.active.participants?.[context.qq]?.supported) {
      return e.reply('你未曾驰援本次帝关之战，帝血不与城关因果共鸣。');
    }
    if (!await this.hasImperialBlood(context.qq)) return e.reply('你的纳戒中没有【帝血】。');
    return this.resolveKingBattle(context.qq, e);
  }

  createKingBattle(player) {
    const secretKing = data.Levelmijing_list.find(item => Number(item.level_id) === 19) || {};
    const xianguKing = data.xiangujinshi_list.find(item => Number(item.level_id) === 19) || {};
    const realm = key => Number(secretKing[key] || 0) + Number(xianguKing[key] || 0);
    const ascended = battlePlayer({
      ...player,
      名号: `${player.名号}·帝血融合`,
      攻击: Math.max(Number(player.攻击) || 1, realm('基础攻击') * 18),
      防御: Math.max(Number(player.防御) || 1, realm('基础防御') * 18),
      血量上限: Math.max(Number(player.血量上限) || 1, realm('基础血量') * 36),
      当前血量: Math.max(Number(player.血量上限) || 1, realm('基础血量') * 36),
      暴击率: Math.max(0.5, Number(player.暴击率) || 0),
      暴击伤害: Math.max(2.2, Number(player.暴击伤害) || 0),
      mijinglevel_id: 19,
      xiangulevel_id: 19,
      yuanshenlevel_id: 10,
    });
    const boss = (name, ratio) => ({
      名号: name,
      攻击: Math.trunc(ascended.攻击 * ratio),
      防御: Math.trunc(ascended.防御 * 0.32),
      当前血量: Math.trunc(ascended.血量上限 * 0.72),
      血量上限: Math.trunc(ascended.血量上限 * 0.72),
      暴击率: 0.35,
      暴击伤害: 2,
      速度: 1600,
      法球倍率: 0.3,
      灵根: { name: '不朽王血', type: '异域', 法球倍率: 0.3 },
      学习的功法: [],
      level_id: 1,
      Physique_id: 1,
      mijinglevel_id: 19,
      xiangulevel_id: 19,
      yuanshenlevel_id: 10,
      魔道值: 0,
      仙宠: null,
      神石: {},
    });
    return { ascended, kings: [boss('不朽之王·安澜', 0.3), boss('不朽之王·俞陀', 0.26)] };
  }

  async resolveKingBattle(qq, e) {
    if (this.kingBattleRunning) return e?.reply('帝血已经照耀天渊，仙王之战正在进行。');
    this.kingBattleRunning = true;
    try {
      let state = readState();
      if (state.status !== 'active' || state.active?.phase !== 'kingBattle' || state.active.bloodChampion) return false;
      const player = await Read_player(qq);
      if (!player || !await this.hasImperialBlood(qq)) return false;
      await Add_najie_thing(qq, '帝血', '道具', -1);
      state = readState();
      if (state.status !== 'active' || state.active?.phase !== 'kingBattle' || state.active.bloodChampion) {
        await Add_najie_thing(qq, '帝血', '道具', 1);
        return false;
      }
      state.active.bloodChampion = { qq: String(qq), name: player.名号, fusedAt: Date.now() };
      writeState(state);

      const { ascended, kings } = this.createKingBattle(player);
      const battle = await zd_battle(ascended, kings, { battleType: 'imperial_blood_king_battle' });
      const victory = battle.winner === 'A';
      player.当前血量 = victory ? Math.max(1, Number(player.血量上限) || 1) : 1;
      if (!victory) adjustDaoHeart(player, -50, '帝血融合失败');
      await Write_player(qq, player);

      const report = [
        '【帝血融合·仙王一战】',
        `${player.名号}承接那滴跨越万古的帝血，短暂踏入仙王领域，独战安澜、俞陀！`,
        victory
          ? '帝血一击横断天渊，两尊不朽之王退回异域，第三波攻势彻底瓦解。'
          : '安澜以黄金古矛贯穿帝血法相，俯视帝关：“纵借他人道果，亦不过败者。”',
      ];
      if (e) await ForwardMsg(e, [...report, '', ...battleExcerpt(battle.msg)]);

      if (victory) {
        state = readState();
        state.status = 'ended';
        state.outcome = 'defended';
        state.history.push({ wave: 3, outcome: 'defended', year: currentWorldYear(), champion: String(qq) });
        state.active = null;
        writeState(state);
        await RealmEvents.broadcastEvent(report.join('\n'));
      } else {
        await this.breachImperialPass('帝血仙王战败，不朽之王踏破原始帝城', currentWorldYear(), report);
      }
      return true;
    } finally {
      this.kingBattleRunning = false;
    }
  }

  async breachImperialPass(reason, year, prefix = []) {
    const state = readState();
    if (state.status === 'ended') return false;
    try {
      for (const planeName of ['九天十地', '遮天位面']) {
        markPlaneDestroyed(PLANE_PATH, planeName, {
          source: PLANE_DESTRUCTION_SOURCES.FOREIGN_IMPERIAL_PASS,
          actor: '异域叩击帝关',
          worldYear: year,
        });
      }
    } catch (error) {
      console.error('[异域叩关] 写入残破位面失败:', error);
    }
    state.status = 'ended';
    state.outcome = 'breached';
    state.history.push({ wave: state.wave, outcome: 'breached', year, reason });
    state.active = null;
    writeState(state);
    await RealmEvents.broadcastEvent([
      ...prefix,
      '【帝关城破·位面残破】',
      reason,
      '原始帝城防线崩塌，九天十地与遮天位面被异域法则撕裂，位面状态降为毁灭。',
    ].join('\n'));
    return true;
  }

  async forceImperialPass(e) {
    const settings = config.getConfig('xiuxian', 'xiuxian') || {};
    const qq = e.user_id.toString().replace('qg_', '');
    if (!e.isMaster && !(settings.Master || []).map(String).includes(qq)) {
      return e.reply('只有主人或修仙管理员可以强制触发异域叩关。');
    }
    const state = readState();
    if (state.status === 'active') return e.reply('异域已经在叩关。');
    if (state.status === 'resting') {
      await this.startWave(state.wave + 1, currentWorldYear());
    } else {
      if (state.status === 'ended') writeState(defaultState());
      await this.startWave(1, currentWorldYear());
    }
    return e.reply('已强制点燃原始帝城烽火。');
  }
}

export default new ForeignImperialPass();

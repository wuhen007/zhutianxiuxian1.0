import { plugin, puppeteer, Show } from '../api/api.js';
import {
  Read_player,
  Write_player,
  channel,
  existplayer,
} from '../model/xiuxian.js';
import {
  REINCARNATION_ATTRIBUTE_GROUPS,
  REINCARNATION_BRANCH_GRADES,
  applyReincarnationSettlement,
  chooseReincarnationOption,
  createReincarnationRun,
  getReincarnationMetaView,
  getReincarnationRunView,
  purchaseReincarnationExchange,
} from '../model/endlessReincarnation.js';

const RUN_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_TTL_SECONDS = 20;

export class EndlessReincarnation extends plugin {
  constructor() {
    super({
      name: '无尽轮回',
      dsc: '单人无限流剧情轮回副本',
      event: 'message',
      priority: 579,
      rule: [
        { reg: '^#无尽轮回(?:帮助)?$', fnc: 'showHub' },
        { reg: '^#开启无尽轮回$', fnc: 'startRun' },
        { reg: '^#轮回选择\\s*[1-4]$', fnc: 'chooseStory' },
        { reg: '^#轮回任务$', fnc: 'showTasks' },
        { reg: '^#轮回小队$', fnc: 'showSquad' },
        { reg: '^#轮回属性$', fnc: 'showAttributes' },
        { reg: '^#轮回怪物$', fnc: 'showThreat' },
        { reg: '^#轮回档案\\s*.+$', fnc: 'showNpcFile' },
        { reg: '^#轮回强化$', fnc: 'showExchange' },
        { reg: '^#轮回兑换\\s*.+$', fnc: 'buyExchange' },
        { reg: '^#基因锁$', fnc: 'showGeneLock' },
        { reg: '^#退出无尽轮回$', fnc: 'requestExit' },
        { reg: '^#确认退出无尽轮回$', fnc: 'confirmExit' },
      ],
    });
  }

  runKey(userId) {
    return `Xiuxian:EndlessReincarnation:Run:${userId}`;
  }

  lockKey(userId) {
    return `Xiuxian:EndlessReincarnation:Lock:${userId}`;
  }

  exitKey(userId) {
    return `Xiuxian:EndlessReincarnation:Exit:${userId}`;
  }

  async getUserId(e) {
    const raw = String(e.user_id).replace('qg_', '');
    return await channel(raw);
  }

  async checkPlayer(e) {
    if (!e.isGroup) {
      await e.reply('无尽轮回只能在群聊中进行');
      return null;
    }
    const userId = await this.getUserId(e);
    if (!(await existplayer(userId))) {
      await e.reply('请先发送【创建角色】');
      return null;
    }
    return userId;
  }

  async getRun(userId) {
    const raw = await redis.get(this.runKey(userId));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      await redis.del(this.runKey(userId));
      return null;
    }
  }

  async saveRun(run) {
    await redis.set(this.runKey(run.userId), JSON.stringify(run), {
      EX: RUN_TTL_SECONDS,
    });
  }

  async withLock(e, userId, action) {
    const key = this.lockKey(userId);
    const token = `${Date.now()}:${Math.random()}`;
    if (!(await redis.set(key, token, { EX: LOCK_TTL_SECONDS, NX: true })))
      return e.reply('世界线正在收束，请勿重复操作');
    try {
      return await action();
    } finally {
      if ((await redis.get(key)) === token) await redis.del(key);
    }
  }

  assertRunGroup(e, run) {
    return String(run.groupId) === String(e.group_id);
  }

  formatAmount(value) {
    const amount = Math.max(0, Math.floor(Number(value) || 0));
    return amount >= 10000 ? `${(amount / 10000).toFixed(2)}万` : String(amount);
  }

  statusLabel(status) {
    return {
      active: '进行中', complete: '已完成', partial: '部分完成',
      failed: '已失败', locked: '未显露', hidden: '因果遮蔽',
    }[status] || status;
  }

  riskClass(risk) {
    if (/必死|禁忌|极危/.test(risk || '')) return 'fatal';
    if (/高危/.test(risk || '')) return 'danger';
    if (/中危/.test(risk || '')) return 'warning';
    return 'stable';
  }

  memberView(npc) {
    return {
      ...npc,
      hpPct: Math.round(npc.hp / Math.max(1, npc.maxHp) * 100),
      trustLabel: npc.trust >= 25 ? '信赖' : npc.trust >= 5 ? '观望' : npc.trust >= -15 ? '戒备' : '敌视',
      stressLabel: npc.stress >= 75 ? '濒临崩溃' : npc.stress >= 45 ? '动摇' : '稳定',
      stateLabel: !npc.alive ? '死亡' : npc.separated ? '失散' : '同行',
      active: npc.alive && !npc.separated,
    };
  }

  encounterView(encounter) {
    if (!encounter) return null;
    return {
      ...encounter,
      hpPct: Math.round(encounter.hp / Math.max(1, encounter.maxHp) * 100),
      statusLabel: {
        active: '正在追猎', defeated: '已击破', repelled: '暂时驱退', escaped: '袭击后遁走',
      }[encounter.status] || encounter.status,
      weaknessTags: (encounter.weaknessSpecialties || []).join(' · '),
    };
  }

  runPanelView(run, playerName, focus = 'scene') {
    const view = getReincarnationRunView(run);
    const scene = view.scene;
    const settlementRights = view.settlement
      ? REINCARNATION_BRANCH_GRADES
          .filter(grade => view.settlement.rights[grade])
          .map(grade => ({ grade, count: view.settlement.rights[grade] }))
      : [];
    return {
      mode: view.phase === 'ending' ? 'ending' : focus,
      eyebrow: 'ENDLESS REINCARNATION · WORLDLINE ARCHIVE',
      title: view.phase === 'ending' ? view.ending.name : scene.title,
      subtitle: view.phase === 'ending'
        ? view.ending.description
        : `${view.worldName} · ACT ${scene.act} · ${scene.location}`,
      mark: view.phase === 'ending' ? view.ending.grade : `0${scene.act}`,
      status: view.phase === 'ending' ? '世界线结算完成' : '剧情选择等待中',
      playerName,
      heroStats: [
        { label: '随机职业', value: view.profession.name, note: view.profession.active },
        { label: '生命状态', value: `${view.hp} / ${view.maxHp}`, note: `压力 ${view.stress}/${view.maxStress}` },
        { label: '世界线干涉', value: view.worldline, note: `${view.branchEvents.length}条支线已经改变` },
        { label: '基因锁', value: `${view.geneLockStage} 阶`, note: view.geneLockUsed ? '本世界已开启' : `稳定度 ${view.geneLockStability}` },
      ],
      profession: view.profession,
      hpPct: Math.round(view.hp / Math.max(1, view.maxHp) * 100),
      stressPct: Math.round(view.stress / Math.max(1, view.maxStress) * 100),
      attributeGroups: view.attributeGroups,
      npcs: view.npcs.map(npc => this.memberView(npc)),
      encounter: this.encounterView(view.encounter),
      scene: scene ? {
        ...scene,
        choices: scene.choices.map(choice => ({
          ...choice,
          riskClass: this.riskClass(choice.risk),
        })),
      } : null,
      tasks: view.tasks.map(task => ({
        ...task,
        statusLabel: this.statusLabel(task.status),
      })),
      branchEvents: view.branchEvents,
      lastOutcome: view.lastOutcome ? {
        ...view.lastOutcome,
        checkLabel: view.lastOutcome.check?.difficulty
          ? `${view.lastOutcome.check.score}/${view.lastOutcome.check.difficulty}`
          : '自动成功',
      } : null,
      ending: view.ending,
      settlement: view.settlement ? {
        ...view.settlement,
        pointsText: this.formatAmount(view.settlement.points),
        monsterBonusText: this.formatAmount(view.settlement.monsterBonus),
        rights: settlementRights,
      } : null,
      footerCommand: view.phase === 'ending'
        ? '#无尽轮回'
        : focus === 'scene'
          ? `#轮回选择${scene.choices.map(choice => choice.index).join('/')}`
          : '#无尽轮回',
      footerNote: view.phase === 'ending'
        ? '结算已经写入角色档案，下一次轮回会继承永久强化与基因锁。'
        : '选项可能引发延迟后果；NPC会依据性格、压力与信任自主行动。',
    };
  }

  hubPanelView(player) {
    const view = getReincarnationMetaView(player);
    const meta = view.meta;
    const rights = REINCARNATION_BRANCH_GRADES.map(grade => ({
      grade,
      count: meta.branchRights[grade],
    }));
    const bonusGroups = Object.entries(REINCARNATION_ATTRIBUTE_GROUPS).map(
      ([name, attributes]) => ({
        name,
        total: attributes.reduce((sum, attribute) => sum + view.bonuses[attribute], 0),
        attributes: attributes.map(attribute => ({ name: attribute, value: view.bonuses[attribute] })),
      })
    );
    return {
      mode: 'hub',
      eyebrow: 'REINCARNATION TERMINAL · 轮回中枢',
      title: '无尽轮回',
      subtitle: `${player.名号 || '无名轮回者'}的世界线档案。职业将在每次投放时重新抽取，永久强化会被保留。`,
      mark: meta.highestEvaluation,
      status: '等待下一次世界投放',
      heroStats: [
        { label: '轮回点', value: this.formatAmount(meta.points), note: '用于中枢强化兑换' },
        { label: '完成世界', value: meta.completedWorlds, note: '成功返回中枢的次数' },
        { label: '最高评价', value: meta.highestEvaluation, note: meta.lastEnding?.name || '尚无结局记录' },
        { label: '基因锁', value: `${meta.geneLock.stage} 阶`, note: `稳定度 ${meta.geneLock.stability}/100` },
      ],
      rights,
      attributeGroups: bonusGroups,
      lastEnding: meta.lastEnding,
      hubCommands: [
        { command: '#开启无尽轮回', text: '随机职业并投放至当前开放世界' },
        { command: '#轮回选择1', text: '执行剧情行动或对话选择' },
        { command: '#轮回任务', text: '查看主线、支线与隐藏任务' },
        { command: '#轮回小队', text: '查看NPC状态、信任与压力' },
        { command: '#轮回属性', text: '查看四维十二项能力' },
        { command: '#轮回怪物', text: '查看当前异常体、机制与弱点' },
        { command: '#轮回强化', text: '进入轮回中枢强化列表' },
      ],
      footerCommand: '#开启无尽轮回',
      footerNote: '第一开放世界：终点站·雾海市。死亡不会获得完整支线权限。',
    };
  }

  exchangePanelView(player) {
    const hub = this.hubPanelView(player);
    const view = getReincarnationMetaView(player);
    return {
      ...hub,
      mode: 'exchange',
      title: '轮回中枢·强化兑换',
      subtitle: '强化会永久作用于后续世界；高阶兑换同时消耗对应等级的支线权限。',
      products: view.products.map(product => ({
        ...product,
        priceText: this.formatAmount(product.price),
        requirement: product.requiredGrade
          ? `${product.requiredGrade}级支线权限×1`
          : '无需支线权限',
      })),
      footerCommand: '#轮回兑换 强化名称',
      footerNote: '重复强化的轮回点价格会逐级提高50%，支线权限每次消耗一份。',
    };
  }

  dossierPanelView(run, playerName, npc) {
    const base = this.runPanelView(run, playerName, 'dossier');
    return {
      ...base,
      title: `人物档案·${npc.name}`,
      subtitle: `${npc.profession}｜${npc.expertise}`,
      mark: npc.alive ? (npc.separated ? 'OUT' : 'IN') : 'KIA',
      status: this.memberView(npc).stateLabel,
      dossier: this.memberView(npc),
      footerCommand: '#轮回小队',
      footerNote: 'NPC拥有自己的底线、恐惧与判断，不会无条件服从轮回者。',
    };
  }

  threatPanelView(run, playerName) {
    const base = this.runPanelView(run, playerName, 'threat');
    const encounter = base.encounter;
    return {
      ...base,
      title: encounter ? `威胁档案·${encounter.name}` : '威胁档案·未发现异常体',
      subtitle: encounter ? `${encounter.rank}｜${encounter.type}｜${encounter.statusLabel}` : '当前场景暂未捕获异常信号',
      mark: encounter?.rank || 'NONE',
      status: encounter?.statusLabel || '威胁信号静默',
      footerCommand: '#无尽轮回',
      footerNote: '利用职业或NPC专长命中弱点，可以抵消怪物干扰并将其彻底击破。',
    };
  }

  formatRun(run) {
    const view = getReincarnationRunView(run);
    if (view.phase === 'ending') return this.formatSettlement(view.settlement);
    const lines = [
      `【无尽轮回·${view.worldName}】`,
      `职业：${view.profession.name}｜生命${view.hp}/${view.maxHp}｜压力${view.stress}/${view.maxStress}`,
      view.encounter
        ? `当前威胁：[${view.encounter.rank}] ${view.encounter.name}｜${view.encounter.skill}｜弱点：${view.encounter.weakness}`
        : null,
    ];
    if (view.lastOutcome) {
      lines.push(
        '',
        `【上一步·${view.lastOutcome.success ? '成功' : '失败'}】`,
        view.lastOutcome.text,
        view.lastOutcome.encounter?.text,
        view.lastOutcome.reaction
          ? `${view.lastOutcome.reaction.speaker}：${view.lastOutcome.reaction.text}`
          : null
      );
    }
    lines.push(
      '',
      `【ACT ${view.scene.act}·${view.scene.title}】`,
      ...view.scene.narrative,
      ...view.scene.dialogue.map(item => `${item.speaker}：“${item.text}”`),
      '',
      ...view.scene.choices.map(choice => `${choice.index}. [${choice.risk}] ${choice.text}\n   ${choice.checkText}`),
      `发送 #轮回选择${view.scene.choices.map(choice => choice.index).join('/')}`
    );
    return lines.filter(Boolean);
  }

  formatSettlement(settlement) {
    return [
      `【${settlement.ending.name}】`,
      settlement.ending.description,
      `世界评价：${settlement.evaluation}`,
      `获得轮回点：${settlement.points}`,
      `世界线干涉：${settlement.worldline}`,
      `NPC归还：${settlement.returnedNpcs}/${settlement.totalNpcs}`,
      `击破异常体：${settlement.defeatedMonsters.length}｜额外轮回点：${settlement.monsterBonus}`,
      ...settlement.branchEvents.map(event => `[${event.grade}] ${event.title}`),
      settlement.geneLockAwakened ? `基因锁突破至${settlement.geneLockStage}阶` : null,
    ].filter(Boolean);
  }

  async replyPanel(e, view, fallback) {
    try {
      const renderData = await new Show(e).get_endlessReincarnationData({
        saveId: `endless_reincarnation_${Date.now()}`,
        ...view,
        renderScale: 2,
        imgType: 'png',
      });
      const image = await puppeteer.screenshot('endless_reincarnation', renderData);
      if (image) return e.reply(image);
    } catch (error) {
      logger.error('[无尽轮回] 图片生成失败', error);
    }
    return e.reply(Array.isArray(fallback) ? fallback.filter(Boolean).join('\n') : fallback);
  }

  async activeRun(e, userId) {
    const run = await this.getRun(userId);
    if (!run) {
      await e.reply('当前没有进行中的无尽轮回，发送 #开启无尽轮回');
      return null;
    }
    if (!this.assertRunGroup(e, run)) {
      await e.reply('请回到开启本次无尽轮回的群继续剧情');
      return null;
    }
    return run;
  }

  async showHub(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.getRun(userId);
    const player = await Read_player(userId);
    if (run) {
      if (!this.assertRunGroup(e, run))
        return e.reply('你已有进行中的无尽轮回，请回到开启轮回的群');
      return this.replyPanel(e, this.runPanelView(run, player.名号 || '无名轮回者'), this.formatRun(run));
    }
    return this.replyPanel(e, this.hubPanelView(player), [
      '【无尽轮回】',
      '单人投放，随机职业，匹配三名拥有独立性格与职业的NPC。',
      '#开启无尽轮回',
      '#轮回强化',
      '#基因锁',
    ]);
  }

  async startRun(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    return this.withLock(e, userId, async () => {
      if (await this.getRun(userId))
        return e.reply('你已有进行中的无尽轮回，发送 #无尽轮回 查看');
      const player = await Read_player(userId);
      const run = createReincarnationRun({
        userId,
        player,
        seed: Date.now() ^ Number(String(userId).slice(-8)),
      });
      run.groupId = String(e.group_id);
      await this.saveRun(run);
      return this.replyPanel(
        e,
        this.runPanelView(run, player.名号 || '无名轮回者'),
        this.formatRun(run)
      );
    });
  }

  async chooseStory(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const choice = Number(String(e.msg || '').match(/[1-4]$/)?.[0]);
    return this.withLock(e, userId, async () => {
      const run = await this.activeRun(e, userId);
      if (!run) return false;
      let result;
      try {
        result = chooseReincarnationOption(run, choice);
      } catch (error) {
        return e.reply(error.message);
      }
      const player = await Read_player(userId);
      if (result.ended) {
        try {
          applyReincarnationSettlement(player, result.settlement);
          await Write_player(userId, player, { trackDailyTask: false });
          await redis.del(this.runKey(userId));
        } catch (error) {
          logger.error(`[无尽轮回] 结算失败 player=${userId}`, error);
          await this.saveRun(run);
          return e.reply('世界线结算失败，剧情存档已保留，请稍后重试');
        }
      } else {
        await this.saveRun(run);
      }
      return this.replyPanel(
        e,
        this.runPanelView(run, player.名号 || '无名轮回者'),
        result.ended ? this.formatSettlement(result.settlement) : this.formatRun(run)
      );
    });
  }

  async showTasks(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.activeRun(e, userId);
    if (!run) return false;
    const player = await Read_player(userId);
    const tasks = getReincarnationRunView(run).tasks;
    return this.replyPanel(e, this.runPanelView(run, player.名号 || '无名轮回者', 'tasks'), [
      '【轮回任务】',
      ...tasks.map(task => `[${this.statusLabel(task.status)}] ${task.kind}·${task.title}｜${task.reward}`),
    ]);
  }

  async showSquad(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.activeRun(e, userId);
    if (!run) return false;
    const player = await Read_player(userId);
    return this.replyPanel(e, this.runPanelView(run, player.名号 || '无名轮回者', 'team'), [
      '【轮回小队】',
      ...run.npcs.map(npc => {
        const view = this.memberView(npc);
        return `${npc.name}·${npc.profession}｜${view.stateLabel}｜生命${npc.hp}/${npc.maxHp}｜信任${npc.trust}｜压力${npc.stress}`;
      }),
      '#轮回档案 NPC姓名',
    ]);
  }

  async showAttributes(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.activeRun(e, userId);
    if (!run) return false;
    const player = await Read_player(userId);
    const groups = getReincarnationRunView(run).attributeGroups;
    return this.replyPanel(e, this.runPanelView(run, player.名号 || '无名轮回者', 'attributes'), [
      `【轮回属性·${run.profession.name}】`,
      ...groups.map(group => `${group.name} ${group.total}｜${group.attributes.map(attribute => `${attribute.name}${attribute.value}`).join('、')}`),
    ]);
  }

  async showThreat(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.activeRun(e, userId);
    if (!run) return false;
    const player = await Read_player(userId);
    const encounter = getReincarnationRunView(run).encounter;
    return this.replyPanel(e, this.threatPanelView(run, player.名号 || '无名轮回者'), encounter ? [
      `【威胁档案·${encounter.name}】`,
      `${encounter.rank}｜${encounter.type}｜${encounter.status}`,
      encounter.description,
      `机制：${encounter.mechanic}`,
      `能力：${encounter.skill}`,
      `弱点：${encounter.weakness}`,
      `克制专长：${encounter.weaknessSpecialties.join('、')}`,
      `威胁数值：生命${encounter.hp}/${encounter.maxHp}｜检定干扰+${encounter.difficulty}｜伤害${encounter.attack}｜精神污染${encounter.terror}`,
    ] : '当前场景没有捕获到异常体信号');
  }

  async showNpcFile(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.activeRun(e, userId);
    if (!run) return false;
    const name = String(e.msg || '').replace(/^#轮回档案\s*/, '').trim();
    const npc = run.npcs.find(entry => entry.name === name || entry.id === name);
    if (!npc) return e.reply('当前小队中没有这名NPC，请发送 #轮回小队');
    const player = await Read_player(userId);
    return this.replyPanel(e, this.dossierPanelView(run, player.名号 || '无名轮回者', npc), [
      `【人物档案·${npc.name}】`,
      `${npc.profession}｜${npc.expertise}`,
      `性格：${npc.traits.join('、')}`,
      `底线：${npc.bottomLine}`,
      `恐惧：${npc.fear}`,
      `生命${npc.hp}/${npc.maxHp}｜信任${npc.trust}｜压力${npc.stress}`,
    ]);
  }

  async showExchange(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const view = getReincarnationMetaView(player);
    return this.replyPanel(e, this.exchangePanelView(player), [
      '【轮回中枢·强化兑换】',
      `轮回点：${view.meta.points}`,
      ...view.products.map(product => `${product.id}. ${product.name}｜${product.price}轮回点｜${product.requirement || product.requiredGrade || '无权限要求'}\n   ${product.description}`),
      '#轮回兑换 强化名称',
    ]);
  }

  async buyExchange(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const input = String(e.msg || '').replace(/^#轮回兑换\s*/, '').trim();
    return this.withLock(e, userId, async () => {
      const player = await Read_player(userId);
      let result;
      try {
        result = purchaseReincarnationExchange(player, input);
      } catch (error) {
        return e.reply(error.message);
      }
      await Write_player(userId, player, { trackDailyTask: false });
      return e.reply([
        '【轮回中枢·强化完成】',
        `${result.product.name} Lv.${result.level}/${result.product.max}`,
        `消耗轮回点：${result.price}`,
        `剩余轮回点：${result.points}`,
        result.product.requiredGrade
          ? `消耗${result.product.requiredGrade}级支线权限×1`
          : null,
        result.product.description,
      ].filter(Boolean).join('\n'));
    });
  }

  async showGeneLock(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const player = await Read_player(userId);
    const meta = getReincarnationMetaView(player).meta;
    const stages = [
      '未开启：必须在真实生死危机中突破',
      '一阶·临界本能：危机判定获得爆发加成',
      '二阶·神经统御：后续世界开放',
      '三阶·思维超频：后续世界开放',
      '四阶·生命重构：后续世界开放',
      '五阶·自我权柄：后续世界开放',
    ];
    return e.reply([
      '【基因锁】',
      `当前：${stages[meta.geneLock.stage]}`,
      `稳定度：${meta.geneLock.stability}/100`,
      `成功突破次数：${meta.geneLock.awakenings}`,
      '基因锁无法直接兑换；基因稳定剂只能降低开启后的反噬。',
    ].join('\n'));
  }

  async requestExit(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    const run = await this.activeRun(e, userId);
    if (!run) return false;
    await redis.set(this.exitKey(userId), '1', { EX: 60 });
    return e.reply('退出会放弃本次全部轮回点与支线权限。60秒内发送 #确认退出无尽轮回');
  }

  async confirmExit(e) {
    const userId = await this.checkPlayer(e);
    if (!userId) return false;
    if (!(await redis.get(this.exitKey(userId))))
      return e.reply('退出确认已经失效，请先发送 #退出无尽轮回');
    return this.withLock(e, userId, async () => {
      const run = await this.activeRun(e, userId);
      if (!run) return false;
      await Promise.all([
        redis.del(this.runKey(userId)),
        redis.del(this.exitKey(userId)),
      ]);
      return e.reply('本次世界线已经放弃，未获得轮回点与支线权限');
    });
  }
}

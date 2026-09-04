const $ = selector => document.querySelector(selector);
const app = $('#app');
const gate = $('#gate');
const toast = $('#toast');
let currentState = null;
let busy = false;
let toastTimer = null;
let refreshTimer = null;
let terminal = false;
let chatTimer = null;
let activeView = 'overview';
let chatMessages = [];

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(selector, value) {
  $(selector).textContent = value ?? '';
}

function formatAmount(value) {
  const amount = Math.max(0, Math.round(Number(value) || 0));
  if (amount >= 100000000) return `${(amount / 100000000).toFixed(2)}亿`;
  if (amount >= 10000) return `${(amount / 10000).toFixed(2)}万`;
  return String(amount);
}

function phaseName(phase) {
  return (
    {
      choice: '等待能力抉择',
      ready: '可以挑战下一关',
      checkpoint: '十层天关 · 劫后问道',
      settling: '战利品结算中',
      defeated: '本次投影已经破碎',
    }[phase] ||
    phase ||
    '未知劫境'
  );
}

function stageName(stage) {
  return { normal: '怪潮', elite: '精英', boss: '位面 Boss' }[stage] || stage || '怪潮';
}

function renderBattleSummary(battle) {
  const box = $('#battle-summary');
  box.replaceChildren();
  const summary = battle.summary || {};
  const items = [
    ['总伤害', formatAmount(summary.totalDamage)],
    ['队伍承伤', formatAmount(Object.values(battle.damageTakenByMember || {}).reduce((sum, value) => sum + (Number(value) || 0), 0))],
    ['MVP', summary.mvpName || '未显化'],
    ['关键触发', formatAmount((summary.fusionHits || 0) + (summary.assistHits || 0) + (summary.skillReplays || 0) + (summary.bossRevive || 0) + (summary.revive || 0))],
  ];
  for (const [label, value] of items) {
    const item = element('div', 'battle-summary-item');
    item.append(element('span', '', label), element('b', '', value));
    box.append(item);
  }
  if (summary.analysis) box.append(element('p', 'battle-analysis', summary.analysis));
  box.hidden = !items.length;
}

function renderBattleTimeline(battle, state) {
  const list = $('#battle-rounds-list');
  list.replaceChildren();
  const rounds = battle.roundDetails || [];
  setText('#battle-round-total', `${rounds.length || battle.rounds || 0} 回合`);
  if (!rounds.length) {
    list.append(element('p', 'timeline-empty', '本场没有可展开的回合明细。'));
    return;
  }
  for (const round of rounds) {
    const details = element('details', 'round-card');
    const summary = element('summary');
    const attacks = (round.attacks || []).map(item => `${item.name || state.team.memberNames[item.id] || item.id} ${formatAmount(item.damage)}`).join(' · ');
    summary.append(
      element('b', '', `第 ${round.round} 回合`),
      element('span', '', `敌方剩余 ${round.enemyHpPct}% · 全队 ${round.teamHpPct}%`),
      element('em', '', `造成 ${formatAmount(round.enemyDamage)} · 承受 ${formatAmount(round.teamDamageTaken)}`)
    );
    const body = element('div', 'round-card-body');
    if (attacks) body.append(element('p', 'round-attacks', attacks));
    const actions = (round.actions || []).slice(0, 16);
    for (const action of actions) {
      const line = element('div', `round-action is-${action.side || 'system'}`);
      const amountText = action.damage ? `伤害 ${formatAmount(action.damage)}` : action.healing ? `恢复 ${formatAmount(action.healing)}` : '';
      line.append(
        element('span', '', action.actor || '劫境'),
        element('b', '', action.skill || action.verb || '行动'),
        element('small', '', [action.target && `→ ${action.target}`, amountText, action.note].filter(Boolean).join(' · '))
      );
      body.append(line);
    }
    for (const event of round.events || []) body.append(element('p', 'round-event', event));
    details.append(summary, body);
    list.append(details);
  }
}

function notify(message) {
  if (!message) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 4200);
}

function showGate(title, message, retry = false) {
  setText('#gate-title', title);
  setText('#gate-message', message);
  $('#retry-button').hidden = !retry;
  gate.hidden = false;
}

function setConnection(status, text) {
  const box = $('.connection');
  box.classList.toggle('is-online', status === 'online');
  box.classList.toggle('is-error', status === 'error');
  setText('#connection-text', text);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `请求失败（${response.status}）`);
  return payload;
}

function renderRoute(state) {
  const route = $('#route');
  route.replaceChildren();
  const layer = Math.max(1, Number(state.run.layer) || 1);
  const start = Math.floor((layer - 1) / 10) * 10 + 1;
  for (let index = 0; index < 10; index++) {
    const value = start + index;
    const node = element('span', 'route-node', String(value).padStart(2, '0'));
    node.classList.toggle('is-cleared', value < layer);
    node.classList.toggle('is-current', value === layer);
    route.append(node);
  }
}

function renderParty(state) {
  const list = $('#party-list');
  list.replaceChildren();
  for (const member of state.members) {
    const card = element('article', 'member-card');
    card.classList.toggle('is-fallen', !member.alive);
    const nameLine = element('div', 'member-name');
    nameLine.append(element('strong', '', member.name), element('span', '', member.id === state.team.leader ? '队长' : member.alive ? '同行' : '残魂'));
    const hp = element('div', 'hp-track');
    const fill = element('i');
    fill.style.width = `${Math.min(100, Math.max(0, member.hpPct))}%`;
    hp.append(fill);
    const meta = element('div', 'member-meta');
    meta.append(
      element('span', '', `${formatAmount(member.hp)} / ${formatAmount(member.maxHp)}`),
      element('span', '', `攻 ${formatAmount(member.attack)} · 防 ${formatAmount(member.defense)}`)
    );
    const skills = element('div', 'member-skills');
    for (const ability of member.abilities.slice(-4)) skills.append(element('span', '', `${ability.name} Lv.${ability.level}`));
    card.append(nameLine, hp, meta, skills);
    list.append(card);
  }
  setText('#party-count', `${state.members.length}/4`);
}

function renderBuild(state) {
  const viewer = state.members.find(member => member.id === state.team.viewer) || state.members[0];
  setText('#viewer-name', viewer?.name || '未显化');
  setText('#viewer-attack', formatAmount(viewer?.attack));
  setText('#viewer-defense', formatAmount(viewer?.defense));
  setText('#viewer-hp', viewer ? `${formatAmount(viewer.hp)}/${formatAmount(viewer.maxHp)}` : '--');
  const abilities = $('#ability-list');
  abilities.replaceChildren();
  if (!viewer?.abilities.length) abilities.append(element('span', 'archive-empty', '尚无能力铭刻'));
  for (const ability of viewer?.abilities || []) {
    const item = element('div', 'ability-item');
    item.append(element('b', '', ability.name), element('span', '', `Lv.${ability.level}`));
    abilities.append(item);
  }
  for (const buff of viewer?.eventBuffs || []) {
    const item = element('div', 'ability-item');
    item.append(element('b', '', '商队遗物'), element('span', '', buff));
    abilities.append(item);
  }
  const fusions = $('#fusion-list');
  fusions.replaceChildren();
  if (!state.run.fusions.length) fusions.append(element('span', 'archive-empty', '尚未形成诸天共鸣'));
  else for (const fusion of state.run.fusions) fusions.append(element('span', '', fusion));
}

function renderBattle(state) {
  const battle = state.battle;
  $('#battle-empty').hidden = Boolean(battle);
  $('#battle-content').hidden = !battle;
  if (!battle) {
    setText('#battle-result', '尚未交战');
    $('#battle-summary').hidden = true;
    $('#battle-rounds-list').replaceChildren();
    setText('#battle-round-total', '0 回合');
    setText('#battle-log-count', '0 条');
    return;
  }
  setText('#battle-result', battle.victory ? '怪潮覆灭' : '投影破碎');
  setText('#battle-stage', `${battle.world || ''} · ${stageName(battle.stage)}`);
  setText('#enemy-name', battle.enemy);
  setText('#battle-rounds', `${battle.rounds || 0} 回合`);
  setText('#enemy-trait', battle.trait || '未知机制');
  renderBattleSummary(battle);
  const reward = $('#battle-reward');
  reward.replaceChildren();
  reward.hidden = !battle.reward;
  if (battle.reward) {
    const rewards = [
      ['灵石', battle.reward.lingshi],
      ['源石', battle.reward.sourceStone],
      ['修为', battle.reward.cultivation],
      ['血气', battle.reward.blood],
      ['劫境道痕', battle.reward.tokens],
    ];
    for (const [name, value] of rewards) reward.append(element('b', '', `${name} +${formatAmount(value)}`));
  }
  const damage = $('#damage-board');
  const damageRows = $('.damage-rows');
  damageRows.replaceChildren();
  const sourceNames = {
    _fusion: '诸天共鸣',
    _assist: battle.assist?.name || '异界强援',
  };
  const entries = Object.entries(battle.damageByMember || {})
    .filter(([, value]) => Number(value) > 0)
    .sort((a, b) => b[1] - a[1]);
  damage.hidden = !entries.length;
  const maximum = Math.max(1, ...entries.map(([, value]) => Number(value) || 0));
  for (const [id, value] of entries) {
    const row = element('div', 'damage-row');
    const track = element('i');
    const fill = element('em');
    fill.style.width = `${Math.max(3, Math.round((Number(value) / maximum) * 100))}%`;
    track.append(fill);
    row.append(element('span', '', sourceNames[id] || state.team.memberNames[id] || id), track, element('b', '', formatAmount(value)));
    damageRows.append(row);
  }
  if (damage.open && !damageRows.children.length) damage.open = false;
  renderBattleTimeline(battle, state);

  const logs = $('#battle-logs');
  logs.replaceChildren();
  const allLogs = battle.logs || [];
  // 手机端：超过 4 条时仅保留前 3 + 末 1，其余加 is-folded 隐藏；用"查看完整战报"按钮唤起抽屉
  const FOLD_THRESHOLD = 4;
  const FOLD_HEAD = 3;
  const showFold = allLogs.length > FOLD_THRESHOLD;
  for (let index = 0; index < allLogs.length; index++) {
    const li = element('li', '', allLogs[index]);
    if (showFold && index >= FOLD_HEAD && index < allLogs.length - 1) {
      li.classList.add('is-folded');
    }
    logs.append(li);
  }
  const drawerBtn = $('#logs-drawer-open');
  drawerBtn.hidden = !showFold;
  setText('#logs-total-count', String(allLogs.length));
  setText('#battle-log-count', `${allLogs.length} 条`);
  // 每关清空：新战报强制回到顶部，重新评估渐隐遮罩
  logs.scrollTop = 0;
  updateLogsFade();
}

function updateLogsFade() {
  const logs = $('#battle-logs');
  const fade = $('#logs-fade');
  if (!logs || !fade) return;
  const scrollable = logs.scrollHeight > logs.clientHeight + 2;
  const atBottom = logs.scrollTop + logs.clientHeight >= logs.scrollHeight - 2;
  fade.hidden = !scrollable || atBottom;
  if (scrollable && !logs.dataset.fadeBound) {
    logs.dataset.fadeBound = '1';
    logs.addEventListener('scroll', updateLogsFade, { passive: true });
  }
}

function renderTreasury(state) {
  const banked = state.run.banked || {};
  const unbanked = state.run.unbanked || {};
  setText('#banked-lingshi', `灵石 ${formatAmount(banked.lingshi)}`);
  setText('#banked-source', `源石 ${formatAmount(banked.sourceStone)}`);
  setText('#banked-cultivation', `修为 ${formatAmount(banked.cultivation)}`);
  setText('#banked-blood', `血气 ${formatAmount(banked.blood)}`);
  setText('#banked-token', `劫境道痕 ${formatAmount(banked.tokens)}`);
  setText('#unbanked-lingshi', `灵石 ${formatAmount(unbanked.lingshi)}`);
  setText('#unbanked-source', `源石 ${formatAmount(unbanked.sourceStone)}`);
  setText('#unbanked-cultivation', `修为 ${formatAmount(unbanked.cultivation)}`);
  setText('#unbanked-blood', `血气 ${formatAmount(unbanked.blood)}`);
  setText('#unbanked-token', `劫境道痕 ${formatAmount(unbanked.tokens)}`);
}

function renderTerminalSummary(state) {
  const box = $('#terminal-summary');
  box.hidden = !state.ended;
  if (!state.ended) return;
  const settlement = state.settlement;
  setText('#terminal-title', settlement?.reason === 'defeat' ? '战败 · 劫境投影已破碎' : '本次远征已结束');
  setText(
    '#terminal-message',
    settlement
      ? (() => {
          const lost = settlement.lostLingshi || settlement.lostSourceStone || settlement.lostTokens || settlement.member.lostCultivation || settlement.member.lostBlood;
          return `已带回：灵石 ${formatAmount(settlement.lingshi)} · 源石 ${formatAmount(settlement.sourceStone)} · 劫境道痕 ${formatAmount(settlement.tokens)}；个人修为 ${formatAmount(settlement.member.cultivation)}、血气 ${formatAmount(settlement.member.blood)}。${lost ? `未带回部分：灵石 ${formatAmount(settlement.lostLingshi)} · 源石 ${formatAmount(settlement.lostSourceStone)} · 劫境道痕 ${formatAmount(settlement.lostTokens)} · 修为 ${formatAmount(settlement.member.lostCultivation)} · 血气 ${formatAmount(settlement.member.lostBlood)}。` : '全部战利品已经安全带回。'}`;
        })()
      : '战斗记录已经保留在本页。'
  );
}

function renderStarMap(state) {
  const panel = $('#star-map-panel');
  const map = state.starMap;
  panel.hidden = !map;
  if (!map) return;
  setText('#star-map-cycle', `第 ${map.cycle} 轮劫环`);
  setText('#star-map-sky', `${map.sky.name} · 奖励×${Number(map.sky.rewardMultiplier || 1).toFixed(2)}`);
  setText('#star-map-omen-text', map.sky.omen || '因果回响尚未显化');
  const selectedTags = map.selected
    ? [map.selected.gambit?.name, map.selected.decision?.name, map.selected.calamity?.name, map.selected.assist?.name].filter(Boolean)
    : [];
  setText('#star-map-selected', map.selected ? `已锁定：${map.selected.name}${selectedTags.length ? ` · ${selectedTags.join(' · ')}` : ''}` : `目标第${map.targetLayer}层 · 尚未定途`);

  const track = $('#star-map-track');
  track.replaceChildren();
  for (const row of map.rows) {
    const rowNode = element('div', `star-map-row${row.current ? ' is-current' : ''}`);
    rowNode.append(element('b', 'star-map-layer', String(row.layer).padStart(2, '0')));
    const nodes = element('div', 'star-map-nodes');
    for (const node of row.nodes) {
      const nodeView = element('span', `star-map-node is-${node.status}`);
      nodeView.title = `${node.worldName} · ${node.shortName}`;
      nodeView.append(element('i', '', node.symbol), element('small', '', node.shortName));
      nodes.append(nodeView);
    }
    rowNode.append(nodes);
    track.append(rowNode);
  }

  const options = $('#star-map-options');
  options.replaceChildren();
  if (!map.options.length) {
    options.append(element('p', 'star-map-empty', state.run.phase === 'checkpoint' ? '本轮劫环已走完，请完成劫后抉择。' : '当前没有可定途的路线。'));
  } else {
    for (const route of map.options) {
      const card = element('article', `star-route-card${route.selected ? ' is-selected' : ''}`);
      const top = element('div', 'star-route-top');
      top.append(element('span', '', `路线 ${route.index} · ${route.risk}`), element('b', '', `${route.votes} 票`));
      const routeMeta = [route.rewardText, route.gambit?.name && `赌约：${route.gambit.name}`, `后继${route.successorCount || 0}途`].filter(Boolean).join(' · ');
      card.append(top, element('h3', '', route.name), element('p', '', route.description), element('small', '', routeMeta));
      const actions = element('div', 'star-route-actions');
      if (state.permissions.suggestRoute && !route.selected) actions.append(actionButton('提出建议', 'suggest', route.index, 'is-quiet'));
      if (state.permissions.selectRoute && !route.selected) actions.append(actionButton('星图定途', 'selectRoute', route.index));
      if (route.selected) actions.append(element('b', 'star-route-locked', '本层因果已锁定'));
      card.append(actions);
      options.append(card);
    }
  }

  const seals = $('#star-map-seals');
  seals.replaceChildren();
  const sealNames = { slaughter: '杀伐印', cause: '因果印', boundary: '破界印', defiance: '逆命印' };
  for (const [id, value] of Object.entries(map.seals || {})) {
    const item = element('span', '', `${sealNames[id] || id} ${value}`);
    seals.append(item);
  }
}

function actionButton(label, action, value, tone = '') {
  const button = element('button', `command-button ${tone}`.trim(), label);
  button.type = 'button';
  button.disabled = busy;
  button.addEventListener('click', () => submitAction(action, value));
  return button;
}

function renderActions(state) {
  const choices = $('#choice-grid');
  const commands = $('#command-bar');
  choices.replaceChildren();
  commands.replaceChildren();
  if (state.ended) {
    setText('#action-title', state.settlement?.reason === 'defeat' ? '战败结算' : '远征已结束');
    setText('#action-note', '本页保留最后一场战斗日志');
    return;
  }
  if (state.choices.length) {
    setText('#action-title', '本层能力推演');
    setText('#action-note', `${state.choices.length}道投影 · 择一铭刻`);
    for (const choice of state.choices) {
      const button = element('button', 'choice-card');
      button.type = 'button';
      button.disabled = busy;
      button.classList.toggle('is-legendary', /传说|禁忌|神话|至高/.test(choice.rarity));
      button.append(
        element('i', '', String(choice.index)),
        element('span', '', choice.rarity),
        element('h3', '', choice.name),
        element('p', '', choice.description)
      );
      const footer = element('footer');
      footer.append(
        element('span', '', choice.tags.join(' · ') || '诸天能力'),
        element('b', '', choice.ownedLevel ? `当前 Lv.${choice.ownedLevel}` : '初次参悟')
      );
      button.append(footer);
      button.addEventListener('click', () => submitAction('choose', choice.index));
      choices.append(button);
    }
  } else if (state.merchant) {
    setText('#action-title', state.merchant.name || '界海商人');
    setText('#action-note', `未封存劫境道痕 ${formatAmount(state.merchant.balance)}`);
    for (const good of state.merchant.stock || []) {
      const button = element('button', 'choice-card');
      const sold = Boolean(good.boughtBy);
      button.type = 'button';
      button.disabled = busy || sold || !state.permissions.merchantPurchase;
      button.append(
        element('i', '', String(good.index)),
        element('span', '', sold ? `已由${good.buyerName || '队友'}购得` : `${formatAmount(good.price)} 道痕`),
        element('h3', '', good.name),
        element('p', '', good.description)
      );
      if (!sold) button.addEventListener('click', () => submitAction('merchant', good.index));
      choices.append(button);
    }
  } else if (state.checkpoint && state.permissions.checkpoint) {
    setText('#action-title', state.checkpoint.title || '劫后问道');
    setText('#action-note', `第${state.checkpoint.layer}层天关`);
    for (const choice of state.checkpoint.choices) {
      const button = element('button', 'choice-card');
      button.type = 'button';
      button.disabled = busy;
      button.append(
        element('i', '', String(choice.index)),
        element('span', '', choice.subtitle),
        element('h3', '', choice.name),
        element('p', '', choice.description)
      );
      button.addEventListener('click', () => submitAction('checkpoint', choice.index));
      choices.append(button);
    }
  } else {
    setText('#action-title', phaseName(state.run.phase));
    setText('#action-note', state.permissions.advance ? '队长敕令已就绪' : '等待同行者');
  }
  if (state.permissions.advance) commands.append(actionButton('挑战下一关', 'advance'));
  if (state.permissions.withdraw) commands.append(actionButton('退出无尽劫境', 'withdraw', null, 'is-danger'));
}

function formatChatTime(value) {
  const date = new Date(Number(value) || Date.now());
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function renderTeamChat(messages = []) {
  chatMessages = Array.isArray(messages) ? messages.slice(-80) : [];
  const list = $('#team-chat-list');
  if (!list) return;
  list.replaceChildren();
  if (!chatMessages.length) {
    list.append(element('p', 'team-chat-empty', '队伍还没有留下消息。战斗中报点、分配路线，都可以在这里说。'));
  } else {
    for (const message of chatMessages) {
      const row = element('article', `team-chat-message${String(message.userId) === String(currentState?.team?.viewer) ? ' is-self' : ''}`);
      const head = element('div', 'team-chat-meta');
      head.append(element('b', '', message.name || '同行者'), element('time', '', formatChatTime(message.at)));
      row.append(head, element('p', '', message.text || ''));
      list.append(row);
    }
    list.scrollTop = list.scrollHeight;
  }
  setText('#team-chat-status', chatMessages.length ? `${chatMessages.length} 条 · 已同步` : '等待第一句');
}

function setActiveView(view, shouldScroll = true) {
  const next = view || 'overview';
  activeView = next;
  app.dataset.focus = next;
  document.querySelectorAll('#view-nav [data-view]').forEach(button => {
    button.classList.toggle('is-active', button.dataset.view === next);
  });
  const targets = {
    overview: '.campaign-grid',
    battle: '[data-core-section="battle"]',
    party: '[data-core-section="party"]',
    chat: '#team-chat-panel',
    build: '[data-optional-section="build"]',
    star: '#star-map-panel',
    treasury: '[data-optional-section="treasury"]',
  };
  const target = document.querySelector(targets[next] || targets.overview);
  if (shouldScroll && target && !target.hidden) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function sendTeamChat(event) {
  event.preventDefault();
  const input = $('#team-chat-input');
  const text = input.value.trim();
  if (!text || input.disabled) return;
  input.disabled = true;
  setText('#team-chat-status', '发送中');
  try {
    const payload = await api('/api/endless/chat', {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    input.value = '';
    renderTeamChat(payload.messages || [...chatMessages, payload.message]);
  } catch (error) {
    notify(error.message);
    setText('#team-chat-status', '发送失败');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function render(state) {
  currentState = state;
  app.classList.remove('is-loading');
  gate.hidden = true;
  setConnection('online', '劫境已同步');
  setText('#world-name', state.battle?.world || '诸天投影 · 未知位面');
  setText('#layer-title', `第 ${state.run.layer} 层`);
  setText('#phase-text', phaseName(state.run.phase));
  setText('#team-id', state.team.id);
  setText('#life-fire', `${state.run.lifeFire} / ${state.run.maxLifeFire}`);
  setText('#cycle-number', `第${Math.floor((Math.max(1, state.run.layer) - 1) / 10) + 1}劫`);
  setText('#footer-status', `${state.team.memberNames[state.team.viewer] || ''} · ${phaseName(state.run.phase)}`);
  // 手机端吸顶状态条
  setText('#mobile-layer', Math.max(1, Number(state.run.layer) || 1));
  setText('#mobile-phase', phaseName(state.run.phase));
  setText('#mobile-life', `${state.run.lifeFire}/${state.run.maxLifeFire}`);
  setText('#mobile-party', `${state.members.length}/4`);
  setText('#footer-status', `${state.team.memberNames[state.team.viewer] || ''} · ${phaseName(state.run.phase)}`);
  renderRoute(state);
  renderParty(state);
  renderBuild(state);
  renderBattle(state);
  renderTreasury(state);
  renderStarMap(state);
  renderTerminalSummary(state);
  renderActions(state);
  renderTeamChat(state.teamChat || []);
}

async function submitAction(action, value) {
  if (busy) return;
  if (action === 'withdraw' && !window.confirm('确认结束本次远征并结算全部战利品？')) return;
  busy = true;
  if (currentState) {
    renderStarMap(currentState);
    renderActions(currentState);
  }
  setConnection('loading', '劫境推演中');
  try {
    const payload = await api('/api/endless/action', {
      method: 'POST',
      body: JSON.stringify({
        action,
        value,
        operationId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      }),
    });
    notify(payload.message);
    if (payload.state) render(payload.state);
    if (payload.ended) {
      terminal = true;
      if (refreshTimer) clearInterval(refreshTimer);
      setConnection('online', '战报已保留');
    } else if (!payload.state) {
      showGate('本次远征已经结束', payload.message || '战利品已经完成结算', false);
    }
  } catch (error) {
    notify(error.message);
    setConnection('error', '操作未完成');
  } finally {
    busy = false;
    if (currentState && !gate.hidden) {
      renderStarMap(currentState);
      renderActions(currentState);
    }
  }
}

async function refresh() {
  if (busy || terminal) return;
  try {
    const payload = await api('/api/endless/state');
    render(payload.state);
  } catch (error) {
    setConnection('error', '连接中断');
    showGate('无法进入无尽劫境', error.message, true);
  }
}

async function boot() {
  showGate('正在叩问劫境', '验证本次远征入口');
  try {
    const url = new URL(location.href);
    const token = url.searchParams.get('t');
    if (token) {
      await api('/api/endless/session', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      history.replaceState(null, '', '/endless');
    }
    await refresh();
    refreshTimer = setInterval(refresh, 2500);
  } catch (error) {
    setConnection('error', '入口失效');
    showGate('入口已经消散', error.message, true);
  }
}

$('#retry-button').addEventListener('click', () => location.reload());

function openLogsDrawer() {
  if (!currentState?.battle?.logs?.length) return;
  const list = $('#logs-drawer-list');
  list.replaceChildren();
  for (const line of currentState.battle.logs) {
    list.append(element('li', '', line));
  }
  setText('#logs-drawer-title', `第 ${currentState.run.layer} 层战报`);
  setText('#logs-drawer-sub', `完整战报 · 共 ${currentState.battle.logs.length} 条`);
  const drawer = $('#logs-drawer');
  drawer.hidden = false;
  list.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeLogsDrawer() {
  $('#logs-drawer').hidden = true;
  document.body.style.overflow = '';
}

$('#logs-drawer-open').addEventListener('click', openLogsDrawer);
$('#logs-drawer-close').addEventListener('click', closeLogsDrawer);
$('#logs-drawer-mask').addEventListener('click', closeLogsDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('#logs-drawer').hidden) closeLogsDrawer();
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    event.preventDefault();
    $('#team-chat-input')?.focus();
  }
});

document.querySelectorAll('#view-nav [data-view]').forEach(button => {
  button.addEventListener('click', () => setActiveView(button.dataset.view));
});
$('#team-chat-form').addEventListener('submit', sendTeamChat);

boot();

const SAVE_KEY = 'endless-wendao-save-v1';
const NODE_META = {
  battle: { name: '历战', sigil: '战', note: '常规遭遇' },
  elite: { name: '凶关', sigil: '凶', note: '强敌与法宝' },
  event: { name: '异闻', sigil: '异', note: '未知因果' },
  market: { name: '坊市', sigil: '市', note: '交易与净牌' },
  meditate: { name: '悟道', sigil: '悟', note: '升华或融牌' },
  rest: { name: '洞府', sigil: '息', note: '疗伤或淬体' },
  boss: { name: '天关', sigil: '劫', note: '境界之敌' },
};

let content;
let state;
const ui = { selectedCharacterId: 'sword', meditateSelection: [], renderedScreen: null };
const app = document.querySelector('#app');
const overlayRoot = document.querySelector('#overlay-root');
const toastRoot = document.querySelector('#toast-root');

const AUDIO_PREF_KEY = 'endless-wendao-audio-v1';
const AUDIO_SOURCES = Object.freeze({
  battle: '/wendao/audio/battle.ogg',
  swordSwing: '/wendao/audio/sword-swing.ogg',
  swordImpact: '/wendao/audio/sword-impact.ogg',
  magicCast: '/wendao/audio/magic-cast.ogg',
  magicHeavy: '/wendao/audio/magic-heavy.ogg',
  bossRoar: '/wendao/audio/boss-roar.ogg',
});

const sound = {
  muted: false,
  unlocked: false,
  bgm: null,
  init() {
    try {
      this.muted = JSON.parse(localStorage.getItem(AUDIO_PREF_KEY))?.muted === true;
    } catch {}
  },
  ensure() {
    if (this.bgm) return this.bgm;
    this.bgm = document.querySelector('#wendao-bgm');
    if (this.bgm) {
      this.bgm.src = AUDIO_SOURCES.battle;
      this.bgm.preload = 'auto';
      this.bgm.loop = true;
    }
    return this.bgm;
  },
  unlock() {
    this.unlocked = true;
    this.ensure();
    this.syncScreen(state?.screen);
  },
  syncScreen(screen) {
    const bgm = this.ensure();
    if (!bgm) return;
    const shouldPlay = this.unlocked && !this.muted && screen && screen !== 'select' && screen !== 'victory' && screen !== 'defeat';
    bgm.volume = screen === 'combat' ? 0.28 : 0.14;
    if (shouldPlay) bgm.play().catch(() => {});
    else if (!shouldPlay && !bgm.paused) bgm.pause();
  },
  playSfx(name, volume = 0.44) {
    if (this.muted || !this.unlocked || !AUDIO_SOURCES[name]) return;
    const clip = new Audio(AUDIO_SOURCES[name]);
    clip.preload = 'auto';
    clip.volume = volume;
    clip.play().catch(() => {});
    clip.addEventListener('ended', () => { clip.src = ''; }, { once: true });
  },
  playCard(card) {
    const damaging = card?.effects?.some(effect => effect.type?.toLowerCase().includes('damage'));
    if (damaging && card.owner === 'sword') {
      this.playSfx('swordSwing', 0.34);
      window.setTimeout(() => this.playSfx('swordImpact', 0.28), 115);
      return;
    }
    if (damaging && card.owner === 'body') {
      this.playSfx('swordImpact', 0.34);
      return;
    }
    this.playSfx(card?.cost >= 2 || damaging ? 'magicHeavy' : 'magicCast', card?.cost >= 2 ? 0.34 : 0.3);
  },
  toggle() {
    this.muted = !this.muted;
    try { localStorage.setItem(AUDIO_PREF_KEY, JSON.stringify({ muted: this.muted })); } catch {}
    this.syncScreen(state?.screen);
    render();
  },
  isMuted() { return this.muted; },
};

sound.init();

init();

async function init() {
  try {
    const response = await fetch('/wendao/content.json?v=2', { cache: 'no-store' });
    if (!response.ok) throw new Error(`内容载入失败：${response.status}`);
    content = await response.json();
    state = loadState();
    bindEvents();
    render();
  } catch (error) {
    app.innerHTML = `<section class="fatal-screen"><span class="seal-mark">止</span><h1>推演中断</h1><p>${escapeHtml(error.message)}</p></section>`;
  }
}

function bindEvents() {
  document.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.disabled) return;
    handleAction(control.dataset.action, control.dataset);
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (saved?.version === content.version && saved.characterId) return saved;
  } catch {}
  return null;
}

function saveState() {
  if (state) localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  else localStorage.removeItem(SAVE_KEY);
}

function commit(message = '') {
  saveState();
  render();
  if (message) toast(message);
}

function toast(message, tone = 'gold') {
  const item = document.createElement('div');
  item.className = `toast toast-${tone}`;
  item.textContent = message;
  toastRoot.append(item);
  setTimeout(() => item.classList.add('toast-out'), 2400);
  setTimeout(() => item.remove(), 2850);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function uid(prefix = 'i') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getCharacter() {
  return content.characters.find(character => character.id === state?.characterId);
}

function getCard(id) {
  return content.cards.find(card => card.id === id);
}

function getRelic(id) {
  return content.relics.find(relic => relic.id === id);
}

function getRealm() {
  return content.realms[state.realmIndex];
}

function createCard(id, upgraded = false) {
  return { uid: uid('card'), id, upgraded };
}

function hasRelicEffect(key) {
  return state.relics.some(id => getRelic(id)?.effect?.[key] !== undefined);
}

function relicEffectTotal(key) {
  return state.relics.reduce((sum, id) => sum + (Number(getRelic(id)?.effect?.[key]) || 0), 0);
}

function startNewRun(characterId) {
  const character = content.characters.find(entry => entry.id === characterId);
  if (!character) return;
  state = {
    version: content.version,
    characterId,
    screen: 'map',
    act: 1,
    realmIndex: 0,
    level: 1,
    exp: 0,
    nextExp: 36,
    hp: character.maxHp,
    maxHp: character.maxHp,
    gold: 72,
    deck: character.deck.map(id => createCard(id)),
    relics: [character.relic],
    materials: {},
    flags: {
      luck: 0,
      nextBattleDraw: 0,
      battleStartHp: 0,
      runDeathWard: 0,
      routeScars: [],
    },
    statistics: { enemies: 0, elites: 0, cardsPlayed: 0, damage: 0, turns: 0 },
    map: generateMap(1),
    pendingNodeId: null,
    combat: null,
    reward: null,
    event: null,
    shop: null,
    breakthrough: null,
    removeContext: null,
  };
  ui.meditateSelection = [];
  commit(`${character.name}踏入问道之路`);
}

function generateMap(act) {
  const patterns = [
    ['battle', 'battle', 'battle'],
    ['battle', 'event', 'battle'],
    ['market', 'battle', 'event'],
    ['battle', 'elite', 'rest'],
    ['meditate', 'battle', 'event'],
    ['rest', 'elite', 'market'],
    ['boss'],
  ];
  if (act % 2 === 0) {
    patterns[2] = ['event', 'battle', 'market'];
    patterns[4] = ['battle', 'meditate', 'elite'];
  }
  const rows = patterns.map((types, row) => ({
    row,
    nodes: types.map((type, col) => ({
      id: `a${act}-r${row}-c${col}`,
      row,
      col: types.length === 1 ? 1 : col,
      type,
      next: [],
    })),
  }));
  rows.forEach((row, index) => {
    if (index >= rows.length - 1) return;
    const nextNodes = rows[index + 1].nodes;
    row.nodes.forEach(node => {
      node.next = nextNodes
        .filter(next => nextNodes.length === 1 || Math.abs(next.col - node.col) <= 1)
        .map(next => next.id);
    });
  });
  return { act, rows, available: rows[0].nodes.map(node => node.id), completed: [] };
}

function findMapNode(id) {
  return state.map.rows.flatMap(row => row.nodes).find(node => node.id === id);
}

function chooseMapNode(id) {
  if (!state.map.available.includes(id)) return;
  const node = findMapNode(id);
  if (!node) return;
  state.pendingNodeId = id;
  state.map.available = [];
  if (node.type === 'battle' || node.type === 'elite' || node.type === 'boss') startCombat(node);
  if (node.type === 'event') startEvent();
  if (node.type === 'market') startShop();
  if (node.type === 'meditate') {
    ui.meditateSelection = [];
    state.screen = 'meditate';
  }
  if (node.type === 'rest') state.screen = 'rest';
  commit();
}

function completeCurrentNode() {
  const node = findMapNode(state.pendingNodeId);
  if (!node) return;
  if (!state.map.completed.includes(node.id)) state.map.completed.push(node.id);
  state.pendingNodeId = null;
  if (node.type === 'boss') {
    if (state.act >= content.realms.length) {
      state.screen = 'victory';
      return;
    }
    state.breakthrough = { stability: 0, failures: 0, fortified: 0 };
    state.screen = 'breakthrough';
    return;
  }
  state.map.available = [...node.next];
  state.screen = 'map';
}

function enemyCandidates(kind) {
  return content.enemies.filter(enemy => enemy.kind === kind && enemy.actMin <= state.act);
}

function startCombat(node) {
  const kind = node.type === 'boss' ? 'boss' : node.type === 'elite' ? 'elite' : 'normal';
  let definitions;
  if (kind === 'boss') {
    definitions = [content.enemies.find(enemy => enemy.kind === 'boss' && enemy.actMin === state.act)];
  } else {
    const pool = enemyCandidates(kind);
    const count = kind === 'normal' && state.act >= 2 && Math.random() < 0.62 ? 2 : 1;
    definitions = Array.from({ length: count }, () => randomItem(pool));
  }
  const scale = 1 + (state.act - 1) * 0.23 + node.row * 0.045;
  const enemies = definitions.filter(Boolean).map((enemy, index) => {
    const maxHp = Math.round(enemy.hp * scale * (definitions.length > 1 ? 0.78 : 1));
    return {
      uid: uid('enemy'),
      id: enemy.id,
      name: enemy.name,
      maxHp,
      hp: maxHp,
      block: 0,
      strength: 0,
      weak: 0,
      vulnerable: 0,
      intentIndex: index % enemy.intents.length,
      revived: false,
      delayedDamage: 0,
      repeating: [],
    };
  });
  const maxResource = getCharacter().resource.max + getRealm().resourceBonus;
  state.combat = {
    kind,
    turn: 0,
    target: 0,
    enemies,
    block: 0,
    resource: maxResource,
    maxResource,
    drawPile: shuffle(state.deck.map(card => ({ ...card }))),
    discardPile: [],
    exhaustPile: [],
    hand: [],
    strength: 0,
    dexterity: 0,
    thorns: 0,
    swordIntent: 0,
    swordGrowth: 0,
    spellPower: 0,
    spellPulse: 0,
    seals: relicEffectTotal('startSeal'),
    ward: 0,
    echo: null,
    nextDraw: 0,
    counterStrength: 0,
    turnLostHp: 0,
    cardsPlayed: 0,
    firstAttack: true,
    firstDamageTaken: true,
    halfHpTriggered: false,
    sealAddedThisTurn: false,
    log: [`第${state.act}境遭遇：${enemies.map(enemy => enemy.name).join('、')}`],
  };
  state.screen = 'combat';
  sound.playSfx(kind === 'boss' ? 'bossRoar' : 'magicHeavy', kind === 'boss' ? 0.48 : 0.26);
  if (state.flags.battleStartHp < 0) state.hp = Math.max(1, state.hp + state.flags.battleStartHp);
  startPlayerTurn(true);
}

function startPlayerTurn(opening = false) {
  const combat = state.combat;
  if (!combat) return;
  combat.turn += 1;
  state.statistics.turns += 1;
  combat.block = opening ? relicEffectTotal('startBlock') : 0;
  combat.resource = opening
    ? combat.maxResource + relicEffectTotal('startEnergy')
    : clamp(combat.resource + getCharacter().resource.recover, 0, combat.maxResource);
  if (!opening && combat.turn % 3 === 0) combat.resource = clamp(combat.resource + relicEffectTotal('thirdTurnEnergy'), 0, combat.maxResource);
  combat.cardsPlayed = 0;
  combat.firstAttack = true;
  combat.sealAddedThisTurn = false;
  combat.turnLostHp = 0;
  combat.swordIntent += combat.swordGrowth;
  const openingDraw = opening ? relicEffectTotal('openingDraw') + Number(state.flags.nextBattleDraw || 0) : 0;
  drawCards(5 + combat.nextDraw + openingDraw);
  combat.nextDraw = 0;
  if (opening) state.flags.nextBattleDraw = 0;
  combat.log.push(`第${combat.turn}回合：恢复至${combat.resource}点${getCharacter().resource.name}`);
}

function drawCards(amount) {
  const combat = state.combat;
  for (let index = 0; index < amount; index += 1) {
    if (!combat.drawPile.length) {
      if (!combat.discardPile.length) break;
      combat.drawPile = shuffle(combat.discardPile);
      combat.discardPile = [];
    }
    const card = combat.drawPile.pop();
    combat.hand.push(card);
    const data = getCard(card.id);
    for (const effect of data?.onDraw || []) {
      if (effect.type === 'energy') combat.resource = clamp(combat.resource + effect.value, 0, combat.maxResource);
    }
  }
}

function currentTarget() {
  const combat = state.combat;
  if (!combat) return null;
  if (!combat.enemies[combat.target] || combat.enemies[combat.target].hp <= 0) {
    combat.target = Math.max(0, combat.enemies.findIndex(enemy => enemy.hp > 0));
  }
  return combat.enemies[combat.target];
}

function cardCost(instance) {
  const card = getCard(instance.id);
  let cost = Number(card.cost) || 0;
  if (card.lowHpDiscount && state.hp <= state.maxHp * 0.5) cost -= card.lowHpDiscount;
  return Math.max(0, cost);
}

function addCombatResource(value) {
  const combat = state.combat;
  const next = Math.max(0, combat.resource + value);
  if (getCharacter().id === 'sword' && next > combat.maxResource) {
    const overflow = next - combat.maxResource;
    combat.resource = combat.maxResource;
    combat.swordIntent += overflow;
    combat.log.push(`剑意满溢，转化为${overflow}层剑势`);
    return;
  }
  combat.resource = next;
}

function playCard(cardUid, fromEcho = false) {
  const combat = state.combat;
  const index = combat?.hand.findIndex(card => card.uid === cardUid);
  if (index < 0) return;
  const instance = combat.hand[index];
  const card = getCard(instance.id);
  const cost = cardCost(instance);
  if (card.unplayable || combat.resource < cost || !currentTarget()) return;
  combat.resource -= cost;
  combat.hand.splice(index, 1);
  combat.cardsPlayed += 1;
  state.statistics.cardsPlayed += 1;
  sound.playCard(card);
  combat.log.push(`你施展【${card.name}${instance.upgraded ? '+' : ''}】`);
  const pendingEcho = !fromEcho && combat.echo && cost <= combat.echo.maxCost;
  if (pendingEcho) combat.echo = null;
  resolveCard(instance, card, fromEcho);
  if (state.screen !== 'combat') return commit();
  if (card.exhaust) combat.exhaustPile.push(instance);
  else combat.discardPile.push(instance);

  if (getCharacter().id === 'mage' && combat.cardsPlayed === 3) {
    addCombatResource(1);
    combat.spellPulse += 3;
    combat.log.push('灵枢回响：返还1点法力，下一次术法获得增幅');
  }

  if (getCharacter().id === 'talisman' && card.type === '符箓' && !combat.sealAddedThisTurn) {
    combat.seals += 1;
    combat.sealAddedThisTurn = true;
    if (combat.seals >= 3) {
      combat.seals -= 3;
      combat.log.push('敕令留真：三枚符印共鸣，符箓自行重演');
      resolveCard(instance, card, true);
      if (state.screen !== 'combat') return commit();
    }
  }

  if (pendingEcho) {
    combat.log.push(`镜花水月：${card.name}在镜中重演`);
    resolveCard(instance, card, true);
    if (state.screen !== 'combat') return commit();
  }
  commit();
}

function resolveCard(instance, card, repeated = false) {
  const effects = instance.upgraded && card.upgrade ? card.upgrade : card.effects;
  effects.forEach(effect => applyCardEffect(effect, card, repeated));
}

function playerScale(value, type = 'damage') {
  const realmScale = getRealm().damageScale;
  if (type === 'damage') return Math.round(value * realmScale);
  if (type === 'block') return Math.round(value * (0.75 + realmScale * 0.25));
  return Math.round(value * (0.82 + realmScale * 0.18));
}

function outgoingDamage(base, card, effect, target) {
  const combat = state.combat;
  let value = playerScale(base, 'damage') + combat.strength;
  if (card.type === '术法' || card.type === '符箓') value += combat.spellPower + combat.spellPulse;
  if (effect.perSwordIntent) value += combat.swordIntent * effect.perSwordIntent;
  if (effect.vulnerableBonus && target.vulnerable > 0) value += playerScale(effect.vulnerableBonus, 'damage');
  if (effect.largeHandDouble && combat.hand.length + 1 >= effect.largeHandDouble) value *= 2;
  if (combat.firstAttack && (card.type === '攻击' || card.type === '术法' || card.type === '符箓')) {
    if (getCharacter().id === 'sword') value += playerScale(4, 'damage');
    if (hasRelicEffect('firstHitSword') && !combat.firstHitRelicTriggered) {
      combat.firstHitRelicTriggered = true;
      combat.swordIntent += relicEffectTotal('firstHitSword');
      combat.log.push(`无锋剑穗轻鸣，获得${relicEffectTotal('firstHitSword')}层剑势`);
    }
    combat.firstAttack = false;
  }
  if (getCharacter().id === 'body' && combat.bloodFired) value *= 1.25;
  if (combat.weak > 0) value *= 0.75;
  if (combat.spellPulse && (card.type === '术法' || card.type === '符箓')) combat.spellPulse = 0;
  if (target.vulnerable > 0) value *= 1.5;
  if (hasRelicEffect('attackRate')) value *= 1 + relicEffectTotal('attackRate');
  return Math.max(0, Math.round(value));
}

function damageEnemy(enemy, value, label = '') {
  if (!enemy || enemy.hp <= 0) return 0;
  const blocked = Math.min(enemy.block, value);
  enemy.block -= blocked;
  const dealt = Math.min(enemy.hp, Math.max(0, value - blocked));
  enemy.hp -= dealt;
  state.statistics.damage += dealt;
  if (label) state.combat.log.push(`${label}对${enemy.name}造成${dealt}点伤害${blocked ? `（抵消${blocked}）` : ''}`);
  if (enemy.hp <= 0) handleEnemyLethal(enemy);
  return dealt;
}

function handleEnemyLethal(enemy) {
  const data = content.enemies.find(item => item.id === enemy.id);
  if (data?.secondWind && !enemy.revived) {
    enemy.revived = true;
    enemy.hp = Math.max(1, Math.round(enemy.maxHp * data.secondWind));
    enemy.block = 0;
    enemy.strength += 2;
    state.combat.log.push(`${enemy.name}撕开旧躯，自劫灰中再度站起！`);
    return;
  }
  enemy.hp = 0;
  state.combat.log.push(`${enemy.name}形神俱灭。`);
  if (state.combat.enemies.every(item => item.hp <= 0)) finishCombatVictory();
}

function applyCardEffect(effect, card) {
  const combat = state.combat;
  const target = currentTarget();
  if (!combat || !target) return;
  if (effect.type === 'damage') {
    const hits = effect.hits || 1;
    for (let hit = 0; hit < hits && target.hp > 0; hit += 1) {
      damageEnemy(target, outgoingDamage(effect.value, card, effect, target), card.name);
    }
  }
  if (effect.type === 'damageAll') {
    let bonus = 0;
    if (effect.consumeSwordIntent) {
      bonus = combat.swordIntent * effect.consumeSwordIntent;
      combat.swordIntent = 0;
    }
    [...combat.enemies].forEach(enemy => {
      if (enemy.hp > 0) damageEnemy(enemy, outgoingDamage(effect.value + bonus, card, effect, enemy), card.name);
    });
  }
  if (effect.type === 'randomDamage') {
    for (let hit = 0; hit < (effect.hits || 1); hit += 1) {
      const alive = combat.enemies.filter(enemy => enemy.hp > 0);
      if (!alive.length) break;
      const enemy = randomItem(alive);
      damageEnemy(enemy, outgoingDamage(effect.value, card, effect, enemy), card.name);
    }
  }
  if (effect.type === 'block') {
    const amount = playerScale(effect.value, 'block') + combat.dexterity + relicEffectTotal('blockBonus');
    combat.block += Math.max(0, amount);
    combat.log.push(`${card.name}凝成${amount}点护体`);
  }
  if (effect.type === 'draw') drawCards(effect.value);
  if (effect.type === 'energy') addCombatResource(effect.value);
  if (effect.type === 'heal') healPlayer(playerScale(effect.value, 'heal'));
  if (effect.type === 'selfDamage') {
    losePlayerHp(effect.value, true);
    combat.bloodFired = true;
  }
  if (effect.type === 'weak') target.weak += effect.value;
  if (effect.type === 'vulnerable') target.vulnerable += effect.value;
  if (effect.type === 'weakAll') combat.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => { enemy.weak += effect.value; });
  if (effect.type === 'vulnerableAll') combat.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => { enemy.vulnerable += effect.value; });
  if (effect.type === 'strength') combat.strength += effect.value;
  if (effect.type === 'dexterity') combat.dexterity += effect.value;
  if (effect.type === 'thorns') combat.thorns += effect.value;
  if (effect.type === 'swordIntent') combat.swordIntent += effect.value;
  if (effect.type === 'swordGrowth') combat.swordGrowth += effect.value;
  if (effect.type === 'spellPower') combat.spellPower += effect.value;
  if (effect.type === 'nextDraw') combat.nextDraw += effect.value;
  if (effect.type === 'ward') combat.ward = Math.max(combat.ward, effect.value);
  if (effect.type === 'counterStrength') combat.counterStrength = Math.max(combat.counterStrength, effect.value);
  if (effect.type === 'lostHpBlock') combat.block += combat.turnLostHp;
  if (effect.type === 'echo') combat.echo = { maxCost: effect.maxCost || 2 };
  if (effect.type === 'delayedDamage') target.delayedDamage += playerScale(effect.value, 'damage');
  if (effect.type === 'delayedDamageAll') combat.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => { enemy.delayedDamage += playerScale(effect.value, 'damage'); });
  if (effect.type === 'delayedRepeating') target.repeating.push({ value: playerScale(effect.value, 'damage'), turns: effect.turns });
  if (effect.type === 'extendDebuffs') combat.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => {
    if (enemy.weak > 0) enemy.weak += effect.value;
    if (enemy.vulnerable > 0) enemy.vulnerable += effect.value;
  });
  if (effect.type === 'silenceStrength') combat.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => { enemy.strength = 0; });
}

function healPlayer(amount) {
  const healed = Math.min(Math.max(0, amount), state.maxHp - state.hp);
  state.hp += healed;
  if (state.combat && healed) state.combat.log.push(`回复${healed}点生命`);
}

function losePlayerHp(amount, direct = false, source = null) {
  const combat = state.combat;
  let incoming = Math.max(0, Math.round(amount));
  if (!direct && combat.vulnerable > 0) incoming = Math.round(incoming * 1.5);
  let blocked = 0;
  if (!direct && combat.block > 0) {
    blocked = Math.min(combat.block, incoming);
    combat.block -= blocked;
    incoming -= blocked;
    if (blocked > 0 && combat.block === 0 && combat.counterStrength) {
      combat.strength += combat.counterStrength;
      combat.log.push(`架势破而后立，获得${combat.counterStrength}点锋锐`);
      combat.counterStrength = 0;
    }
  }
  if (incoming > 0 && combat.ward > 0) {
    const warded = Math.min(combat.ward, incoming);
    incoming -= warded;
    combat.ward = 0;
    combat.log.push(`替身纸人承受${warded}点伤害`);
  }
  state.hp -= incoming;
  combat.turnLostHp += incoming;
  if (source) combat.log.push(`${source}造成${incoming}点生命伤害${blocked ? `，护体抵消${blocked}` : ''}`);

  if (incoming > 0 && combat.firstDamageTaken && relicEffectTotal('retaliate')) {
    combat.firstDamageTaken = false;
    const value = relicEffectTotal('retaliate');
    combat.enemies.filter(enemy => enemy.hp > 0).forEach(enemy => damageEnemy(enemy, value, '雷击木心'));
  }
  if (getCharacter().id === 'body' && !combat.halfHpTriggered && state.hp <= state.maxHp * 0.5) {
    combat.halfHpTriggered = true;
    combat.block += 12;
    combat.log.push('不灭烘炉：气血跌破半数，获得12点护体');
  }
  if (state.hp <= 0) {
    if (hasRelicEffect('deathWard') && !combat.deathWardUsed) {
      combat.deathWardUsed = true;
      state.hp = 1;
      combat.log.push('青莲灯亮起最后一瓣，以1点生命续命');
    } else if (state.flags.runDeathWard > 0) {
      state.flags.runDeathWard -= 1;
      state.hp = 1;
      combat.log.push('识海道胎破碎，替你承受了死亡');
    } else {
      finishRun(false);
    }
  }
}

function enemyIntent(enemy) {
  const definition = content.enemies.find(item => item.id === enemy.id);
  return definition.intents[enemy.intentIndex % definition.intents.length];
}

function enemyTurn() {
  const combat = state.combat;
  if (!combat || state.screen !== 'combat') return;
  combat.hand.forEach(card => {
    if (getCard(card.id)?.id === 'curse_heart') losePlayerHp(3, true, '心魔低语');
  });
  if (state.screen !== 'combat') return commit();
  combat.discardPile.push(...combat.hand);
  combat.hand = [];
  combat.weak = Math.max(0, Number(combat.weak || 0) - 1);
  combat.vulnerable = Math.max(0, Number(combat.vulnerable || 0) - 1);

  for (const enemy of combat.enemies) {
    if (enemy.hp <= 0) continue;
    const turnIntent = enemyIntent(enemy);
    sound.playSfx(turnIntent?.type === 'attack' || turnIntent?.type === 'attackDebuff' ? 'swordImpact' : 'magicCast', 0.25);
    enemy.block = 0;
    if (enemy.delayedDamage > 0) {
      const value = enemy.delayedDamage;
      enemy.delayedDamage = 0;
      damageEnemy(enemy, value, '符箓爆发');
    }
    enemy.repeating = enemy.repeating.filter(effect => {
      if (enemy.hp > 0) damageEnemy(enemy, effect.value, '豆兵围杀');
      effect.turns -= 1;
      return effect.turns > 0;
    });
    if (enemy.hp <= 0 || state.screen !== 'combat') continue;
    resolveEnemyIntent(enemy);
    if (state.screen !== 'combat') break;
    enemy.intentIndex += 1;
    enemy.weak = Math.max(0, enemy.weak - 1);
    enemy.vulnerable = Math.max(0, enemy.vulnerable - 1);
  }
  if (state.screen === 'combat') startPlayerTurn(false);
  commit();
}

function resolveEnemyIntent(enemy) {
  const intent = enemyIntent(enemy);
  const scale = 1 + (state.act - 1) * 0.16;
  if (intent.type === 'attack' || intent.type === 'attackDebuff') {
    const hits = intent.hits || 1;
    for (let hit = 0; hit < hits && state.screen === 'combat'; hit += 1) {
      let value = Math.round((intent.value + enemy.strength) * scale);
      if (enemy.weak > 0) value = Math.round(value * 0.75);
      losePlayerHp(value, false, `${enemy.name}·${intent.name}`);
      if (combatAlive() && state.combat.thorns > 0 && enemy.hp > 0) damageEnemy(enemy, state.combat.thorns, '荆棘反震');
    }
    if (intent.weak) state.combat.weak = (state.combat.weak || 0) + intent.weak;
    if (intent.vulnerable) state.combat.vulnerable = (state.combat.vulnerable || 0) + intent.vulnerable;
  }
  if (intent.type === 'block') {
    enemy.block += Math.round(intent.value * scale);
    state.combat.log.push(`${enemy.name}施展${intent.name}，获得${enemy.block}点护体`);
  }
  if (intent.type === 'buff') {
    enemy.strength += intent.strength || 0;
    state.combat.log.push(`${enemy.name}施展${intent.name}，锋锐提升`);
  }
  if (intent.type === 'debuff') {
    state.combat.weak = (state.combat.weak || 0) + (intent.weak || 0);
    state.combat.vulnerable = (state.combat.vulnerable || 0) + (intent.vulnerable || 0);
    state.combat.log.push(`${enemy.name}施展${intent.name}，道心受扰`);
  }
  if (intent.type === 'heal') {
    const healed = Math.min(intent.value, enemy.maxHp - enemy.hp);
    enemy.hp += healed;
    state.combat.log.push(`${enemy.name}施展${intent.name}，回复${healed}点生命`);
  }
}

function combatAlive() {
  return state?.screen === 'combat' && state.hp > 0;
}

function finishCombatVictory() {
  const combat = state.combat;
  if (!combat || state.screen !== 'combat') return;
  sound.playSfx('magicHeavy', 0.34);
  const kind = combat.kind;
  state.statistics.enemies += combat.enemies.length;
  if (kind === 'elite') state.statistics.elites += 1;
  healPlayer(relicEffectTotal('healAfterCombat'));
  const gold = kind === 'boss' ? 105 + state.act * 20 : kind === 'elite' ? 58 + state.act * 12 : 24 + state.act * 7;
  const exp = kind === 'boss' ? 64 + state.act * 18 : kind === 'elite' ? 38 + state.act * 8 : 20 + state.act * 5;
  state.gold += gold;
  gainExp(exp);
  if (kind === 'boss' && state.act < content.realms.length) {
    const material = content.realms[state.realmIndex + 1].material;
    state.materials[material] = (state.materials[material] || 0) + 1;
  }
  state.reward = {
    kind,
    gold,
    exp,
    cards: rollRewardCards(3),
    relics: kind === 'normal' ? [] : rollRelics(3),
  };
  state.screen = 'reward';
}

function gainExp(amount) {
  state.exp += amount;
  while (state.exp >= state.nextExp) {
    state.exp -= state.nextExp;
    state.level += 1;
    state.nextExp = Math.round(state.nextExp * 1.24);
    state.maxHp += 4;
    state.hp += 4;
  }
}

function rollRewardCards(amount) {
  const pool = content.cards.filter(card =>
    !card.rewardOnly && !card.unplayable && (card.owner === state.characterId) && card.rarity !== '基础'
  );
  const picks = [];
  const luck = state.flags.luck || 0;
  while (picks.length < amount && pool.length) {
    const candidates = pool.filter(card => !picks.includes(card.id));
    if (!candidates.length) break;
    const roll = Math.random() + luck * 0.05;
    let rarity = roll > 0.88 ? '稀世' : roll > 0.48 ? '精良' : '普通';
    let rarityPool = candidates.filter(card => card.rarity === rarity);
    if (!rarityPool.length) rarityPool = candidates;
    picks.push(randomItem(rarityPool).id);
  }
  return picks;
}

function rollRelics(amount) {
  return shuffle(content.relics.filter(relic => !state.relics.includes(relic.id) && relic.grade !== '本命物'))
    .slice(0, amount)
    .map(relic => relic.id);
}

function claimRewardCard(cardId) {
  if (!state.reward?.cards.includes(cardId)) return;
  state.deck.push(createCard(cardId));
  state.reward.cards = [];
  commit(`获得卡牌【${getCard(cardId).name}】`);
}

function claimRewardRelic(relicId) {
  if (!state.reward?.relics.includes(relicId)) return;
  state.relics.push(relicId);
  const maxHpLoss = getRelic(relicId)?.effect?.maxHpLoss || 0;
  if (maxHpLoss) {
    state.maxHp = Math.max(1, state.maxHp - maxHpLoss);
    state.hp = Math.min(state.hp, state.maxHp);
  }
  state.reward.relics = [];
  commit(`法宝【${getRelic(relicId).name}】认主`);
}

function leaveReward() {
  state.reward = null;
  state.combat = null;
  completeCurrentNode();
  commit();
}

function startEvent() {
  state.event = { ...randomItem(content.events), resolved: false };
  state.screen = 'event';
}

function eventChoice(index) {
  const choice = state.event?.choices?.[index];
  if (!choice || !meetsRequirement(choice.requires)) return;
  let needsRemoval = false;
  for (const effect of choice.effects || []) {
    if (effect.type === 'removeCard') needsRemoval = true;
    else applyRunEffect(effect);
  }
  const eventName = state.event.name;
  state.event = null;
  if (needsRemoval) {
    state.removeContext = { returnScreen: 'event-complete', free: true };
    state.screen = 'remove';
  } else {
    completeCurrentNode();
  }
  commit(`异闻【${eventName}】的因果已经落定`);
}

function meetsRequirement(requirement) {
  if (!requirement) return true;
  if (requirement.gold && state.gold < requirement.gold) return false;
  return true;
}

function applyRunEffect(effect) {
  if (effect.type === 'hp') state.hp = clamp(state.hp + effect.value, 1, state.maxHp);
  if (effect.type === 'healFull') state.hp = state.maxHp;
  if (effect.type === 'healRate') state.hp = clamp(state.hp + Math.round(state.maxHp * effect.value), 1, state.maxHp);
  if (effect.type === 'maxHp') {
    state.maxHp = Math.max(1, state.maxHp + effect.value);
    state.hp = clamp(state.hp + Math.max(0, effect.value), 1, state.maxHp);
  }
  if (effect.type === 'gold') state.gold = Math.max(0, state.gold + effect.value);
  if (effect.type === 'luck') state.flags.luck += effect.value;
  if (effect.type === 'nextBattleDraw') state.flags.nextBattleDraw += effect.value;
  if (effect.type === 'runDeathWard') state.flags.runDeathWard += effect.value;
  if (effect.type === 'battleStartHp') state.flags.battleStartHp += effect.value;
  if (effect.type === 'addCard') state.deck.push(createCard(effect.id));
  if (effect.type === 'artifact') {
    const relicId = rollRelics(1)[0];
    if (relicId) state.relics.push(relicId);
  }
  if (effect.type === 'upgradeRandom') upgradeRandomCards(effect.value);
  if (effect.type === 'randomRareCard') {
    const pool = content.cards.filter(card => card.owner === state.characterId && ['精良', '稀世'].includes(card.rarity) && !card.rewardOnly);
    if (pool.length) state.deck.push(createCard(randomItem(pool).id));
  }
  if (effect.type === 'randomUpgradedCard') {
    const pool = content.cards.filter(card => card.owner === state.characterId && !card.rewardOnly && card.rarity !== '基础');
    if (pool.length) state.deck.push(createCard(randomItem(pool).id, true));
  }
  if (effect.type === 'realmMaterial' && state.realmIndex + 1 < content.realms.length) {
    const material = content.realms[state.realmIndex + 1].material;
    state.materials[material] = (state.materials[material] || 0) + effect.value;
  }
}

function upgradeRandomCards(amount) {
  const pool = shuffle(state.deck.filter(card => !card.upgraded && getCard(card.id)?.upgrade));
  pool.slice(0, amount).forEach(card => { card.upgraded = true; });
}

function startShop() {
  const discount = relicEffectTotal('shopDiscount');
  const cards = rollRewardCards(5).map(id => ({ uid: uid('shop'), type: 'card', id, price: Math.round((48 + Math.random() * 36) * (1 - discount)), sold: false }));
  const relics = rollRelics(2).map(id => ({ uid: uid('shop'), type: 'relic', id, price: Math.round((145 + Math.random() * 65) * (1 - discount)), sold: false }));
  state.shop = { items: [...cards, ...relics], removePrice: Math.round(80 * (1 - discount)), removed: false };
  state.screen = 'shop';
}

function buyShopItem(itemUid) {
  const item = state.shop?.items.find(entry => entry.uid === itemUid);
  if (!item || item.sold || state.gold < item.price) return;
  state.gold -= item.price;
  item.sold = true;
  if (item.type === 'card') state.deck.push(createCard(item.id));
  if (item.type === 'relic') state.relics.push(item.id);
  commit(`购得【${item.type === 'card' ? getCard(item.id).name : getRelic(item.id).name}】`);
}

function requestShopRemoval() {
  if (!state.shop || state.shop.removed || state.gold < state.shop.removePrice || state.deck.length <= 5) return;
  state.removeContext = { returnScreen: 'shop', price: state.shop.removePrice };
  state.screen = 'remove';
  commit();
}

function removeDeckCard(cardUid) {
  const context = state.removeContext;
  const index = state.deck.findIndex(card => card.uid === cardUid);
  if (!context || index < 0 || state.deck.length <= 5) return;
  const [removed] = state.deck.splice(index, 1);
  if (context.price) {
    state.gold -= context.price;
    state.shop.removed = true;
  }
  state.removeContext = null;
  if (context.returnScreen === 'event-complete') completeCurrentNode();
  else state.screen = context.returnScreen;
  commit(`已斩去【${getCard(removed.id).name}】的牌组因果`);
}

function leaveShop() {
  state.shop = null;
  completeCurrentNode();
  commit();
}

function toggleMeditateCard(cardUid) {
  if (state.flags.meditated) return;
  const selected = ui.meditateSelection;
  if (selected.includes(cardUid)) ui.meditateSelection = selected.filter(id => id !== cardUid);
  else if (selected.length < 2) selected.push(cardUid);
  render();
}

function meditateUpgrade() {
  if (state.flags.meditated) return;
  if (ui.meditateSelection.length !== 1) return;
  const card = state.deck.find(item => item.uid === ui.meditateSelection[0]);
  if (!card || card.upgraded || !getCard(card.id)?.upgrade) return;
  card.upgraded = true;
  ui.meditateSelection = [];
  state.flags.meditated = true;
  commit(`【${getCard(card.id).name}】已臻化境`);
}

function selectedFusion() {
  if (ui.meditateSelection.length !== 2) return null;
  const ids = ui.meditateSelection.map(cardUid => state.deck.find(card => card.uid === cardUid)?.id).filter(Boolean).sort();
  return content.fusions.find(fusion => [...fusion.needs].sort().every((id, index) => id === ids[index]));
}

function meditateFuse() {
  if (state.flags.meditated) return;
  const fusion = selectedFusion();
  if (!fusion) return;
  const consumed = new Set(ui.meditateSelection);
  state.deck = state.deck.filter(card => !consumed.has(card.uid));
  state.deck.push(createCard(fusion.result));
  ui.meditateSelection = [];
  state.flags.meditated = true;
  commit(`${fusion.insight} 悟得【${getCard(fusion.result).name}】`);
}

function leaveMeditate() {
  ui.meditateSelection = [];
  state.flags.meditated = false;
  completeCurrentNode();
  commit();
}

function resolveRest(type) {
  if (type === 'heal') {
    const amount = Math.round(state.maxHp * 0.32);
    state.hp = Math.min(state.maxHp, state.hp + amount);
    toast(`静养回复${amount}点生命`);
  } else {
    state.maxHp += 7;
    state.hp = Math.max(1, state.hp - 6);
    toast('淬体完成：最大生命+7');
  }
  completeCurrentNode();
  commit();
}

function stabilizeBreakthrough() {
  const cost = 42 + state.breakthrough.fortified * 28;
  if (state.gold < cost || state.breakthrough.fortified >= 2) return;
  state.gold -= cost;
  state.breakthrough.fortified += 1;
  state.breakthrough.stability += 10;
  commit(`根基稳固，渡劫成功率提升10%`);
}

function attemptBreakthrough() {
  const targetRealm = content.realms[state.realmIndex + 1];
  const material = targetRealm?.material;
  if (!targetRealm || (!state.breakthrough.failures && (state.materials[material] || 0) < 1)) return;
  const chance = Math.min(95, 72 + state.breakthrough.stability + state.breakthrough.failures * 9 + state.flags.luck * 2);
  if (!state.breakthrough.failures) state.materials[material] -= 1;
  if (Math.random() * 100 < chance) {
    const previousBonus = getRealm().hpBonus;
    state.realmIndex += 1;
    state.act += 1;
    const hpGain = getRealm().hpBonus - previousBonus;
    state.maxHp += hpGain;
    state.hp = Math.min(state.maxHp, Math.max(1, state.hp + Math.round(state.maxHp * 0.45)));
    state.map = generateMap(state.act);
    state.breakthrough = null;
    state.screen = 'map';
    commit(`雷云尽散，你已踏入${getRealm().name}境`);
  } else {
    state.breakthrough.failures += 1;
    state.maxHp = Math.max(10, state.maxHp - 6);
    state.hp = Math.max(1, Math.min(state.maxHp, state.hp - Math.round(state.maxHp * 0.28)));
    commit(`渡劫失利，留下劫伤；下一次成功率提高9%`);
  }
}

function finishRun(victory) {
  state.screen = victory ? 'victory' : 'defeat';
  state.combat = null;
  saveState();
  render();
}

function handleAction(action, data) {
  sound.unlock();
  if (action === 'toggle-audio') return sound.toggle();
  if (action === 'select-character') {
    ui.selectedCharacterId = data.id;
    return render();
  }
  if (action === 'begin-run') return startNewRun(ui.selectedCharacterId);
  if (action === 'map-node') return chooseMapNode(data.id);
  if (action === 'target-enemy') {
    state.combat.target = Number(data.index);
    return commit();
  }
  if (action === 'play-card') return playCard(data.uid);
  if (action === 'end-turn') return enemyTurn();
  if (action === 'claim-card') return claimRewardCard(data.id);
  if (action === 'claim-relic') return claimRewardRelic(data.id);
  if (action === 'leave-reward') return leaveReward();
  if (action === 'event-choice') return eventChoice(Number(data.index));
  if (action === 'shop-buy') return buyShopItem(data.uid);
  if (action === 'shop-remove') return requestShopRemoval();
  if (action === 'leave-shop') return leaveShop();
  if (action === 'remove-card') return removeDeckCard(data.uid);
  if (action === 'meditate-card') return toggleMeditateCard(data.uid);
  if (action === 'meditate-upgrade') return meditateUpgrade();
  if (action === 'meditate-fuse') return meditateFuse();
  if (action === 'leave-meditate') return leaveMeditate();
  if (action === 'rest-heal') return resolveRest('heal');
  if (action === 'rest-temper') return resolveRest('temper');
  if (action === 'stabilize') return stabilizeBreakthrough();
  if (action === 'attempt-breakthrough') return attemptBreakthrough();
  if (action === 'open-deck') return openDeckOverlay();
  if (action === 'open-relics') return openRelicOverlay();
  if (action === 'open-help') return openHelpOverlay();
  if (action === 'close-overlay') return closeOverlay();
  if (action === 'request-reset') return openResetOverlay();
  if (action === 'confirm-reset') {
    state = null;
    saveState();
    closeOverlay();
    return render();
  }
}

function render() {
  if (!content) return;
  if (!state) {
    const changed = ui.renderedScreen !== 'select';
    renderCharacterSelect();
    sound.syncScreen('select');
    ui.renderedScreen = 'select';
    if (changed) requestAnimationFrame(() => window.scrollTo(0, 0));
    return;
  }
  const screens = {
    map: renderMap,
    combat: renderCombat,
    reward: renderReward,
    event: renderEvent,
    shop: renderShop,
    meditate: renderMeditate,
    rest: renderRest,
    remove: renderRemove,
    breakthrough: renderBreakthrough,
    victory: () => renderEnding(true),
    defeat: () => renderEnding(false),
  };
  const body = (screens[state.screen] || renderMap)();
  app.innerHTML = `${renderTopbar()}${body}`;
  sound.syncScreen(state.screen);
  if (ui.renderedScreen !== state.screen) requestAnimationFrame(() => window.scrollTo(0, 0));
  ui.renderedScreen = state.screen;
}

function renderCharacterSelect() {
  const selected = content.characters.find(character => character.id === ui.selectedCharacterId) || content.characters[0];
  app.innerHTML = `
    <main class="selection-screen">
      <section class="selection-intro">
        <div class="brand-lockup">
          <span class="brand-seal">问</span>
          <div><p class="eyebrow">ENDLESS CULTIVATION</p><h1>无尽问道</h1></div>
        </div>
        <p class="selection-lead">此路不问来处，只问你愿以何种方式，走到大道尽头。</p>
        <div class="run-rule"><span>劫数一</span><b>死亡即止 · 道途锁定 · 四境连战</b></div>
      </section>
      <section class="character-roster" aria-label="选择问道者">
        ${content.characters.map(character => characterChoiceHtml(character, character.id === selected.id)).join('')}
      </section>
      <section class="character-dossier">
        <div class="dossier-copy">
          <p class="eyebrow">${selected.epithet}</p>
          <h2>${selected.name}<small>${selected.path}</small></h2>
          <p>${selected.background}</p>
        </div>
        <dl class="aptitude-grid">
          ${Object.entries(selected.aptitudes).map(([name, value]) => `<div><dt>${name}</dt><dd>${'◆'.repeat(value)}${'◇'.repeat(5 - value)}</dd></div>`).join('')}
        </dl>
        <div class="path-kit">
          <div><span>本命</span><b>${selected.passive.name}</b><p>${selected.passive.text}</p></div>
          <div><span>起始法宝</span><b>${getRelic(selected.relic).name}</b><p>${getRelic(selected.relic).text}</p></div>
          <div><span>回合资源</span><b>${selected.resource.name} ${selected.resource.max}</b><p>每回合自然恢复${selected.resource.recover}点，未用资源会保留。</p></div>
        </div>
        <button class="primary-command" data-action="begin-run"><span>启程</span><small>以${selected.name}踏入第一境</small></button>
      </section>
    </main>`;
}

function characterChoiceHtml(character, selected) {
  return `<button class="character-choice ${selected ? 'is-selected' : ''}" data-action="select-character" data-id="${character.id}" aria-pressed="${selected}">
    <img src="${character.portrait}" alt="${character.name}" />
    <span class="choice-shade"></span>
    <span class="choice-index">0${content.characters.indexOf(character) + 1}</span>
    <span class="choice-name"><b>${character.name}</b><small>${character.path} · ${character.epithet}</small></span>
  </button>`;
}

function renderTopbar() {
  const character = getCharacter();
  const hpPct = clamp((state.hp / state.maxHp) * 100, 0, 100);
  return `<header class="game-topbar">
    <div class="compact-brand"><span>问</span><b>无尽问道</b><small>劫数一</small></div>
    <div class="run-vitals">
      <div class="realm-readout"><span>${getRealm().name}</span><small>第${state.act}境 · 道阶 ${state.level}</small></div>
      <div class="top-hp"><span><b>${state.hp}</b> / ${state.maxHp}</span><i><em style="width:${hpPct}%"></em></i></div>
      <div class="top-currency"><span>灵石</span><b>${state.gold}</b></div>
    </div>
    <nav class="top-actions" aria-label="行囊">
      <button data-action="open-deck" title="查看牌组"><span>牌</span><small>${state.deck.length}</small></button>
      <button data-action="open-relics" title="查看法宝"><span>宝</span><small>${state.relics.length}</small></button>
      <button data-action="open-help" title="玩法说明"><span>?</span></button>
      <button data-action="toggle-audio" class="audio-control ${sound.isMuted() ? 'is-muted' : ''}" title="${sound.isMuted() ? '开启声音' : '关闭声音'}" aria-label="${sound.isMuted() ? '开启声音' : '关闭声音'}"><span>${sound.isMuted() ? '静' : '声'}</span></button>
      <button data-action="request-reset" title="放弃本轮并重开"><span>↺</span></button>
    </nav>
    <img class="top-avatar" src="${character.portrait}" alt="" />
  </header>`;
}

function renderMap() {
  const completed = new Set(state.map.completed);
  const available = new Set(state.map.available);
  return `<main class="map-screen">
    <section class="map-brief">
      <p class="eyebrow">THE PATH REMEMBERS</p>
      <h1>${getRealm().name} · 第${state.act}重天</h1>
      <p>每一次选择都会令其他道路沉入劫雾。向上而行，直到此境天关。</p>
      <div class="map-legend">${Object.entries(NODE_META).map(([id, meta]) => `<span><i class="node-sigil node-${id}">${meta.sigil}</i>${meta.name}</span>`).join('')}</div>
    </section>
    <section class="path-scroll" aria-label="问道路图">
      <div class="path-spine"></div>
      ${[...state.map.rows].reverse().map((row, reverseIndex) => `
        <div class="path-row" style="--row-delay:${reverseIndex * 30}ms">
          <span class="row-mark">${row.row === 6 ? '境界天关' : `道途 ${row.row + 1}`}</span>
          <div class="path-row-nodes">
            ${row.nodes.map(node => mapNodeHtml(node, completed.has(node.id), available.has(node.id))).join('')}
          </div>
        </div>`).join('')}
    </section>
    <aside class="map-oath"><span>已落定</span><b>${completed.size} / 7</b><p>选定节点后，本层其余道路将永久坍缩。</p></aside>
  </main>`;
}

function mapNodeHtml(node, completed, available) {
  const meta = NODE_META[node.type];
  const locked = !completed && !available;
  return `<button class="path-node node-${node.type} ${completed ? 'is-completed' : ''} ${available ? 'is-available' : ''}" data-action="map-node" data-id="${node.id}" ${locked ? 'disabled' : ''}>
    <span class="node-ring"><i>${completed ? '成' : meta.sigil}</i></span>
    <b>${meta.name}</b><small>${completed ? '因果已定' : meta.note}</small>
  </button>`;
}

function renderCombat() {
  const combat = state.combat;
  const character = getCharacter();
  const resourceName = character.resource.name;
  return `<main class="combat-screen">
    <section class="battlefield">
      <div class="turn-inscription"><span>TURN ${String(combat.turn).padStart(2, '0')}</span><b>${getRealm().name}劫域</b></div>
      <article class="combatant player-combatant">
        <div class="combatant-portrait"><img src="${character.portrait}" alt="${character.name}" /><span>${character.path}</span></div>
        <div class="combatant-name"><small>${character.epithet}</small><h2>${character.name}</h2></div>
        ${combatBars(state.hp, state.maxHp, combat.block, 'player')}
        <div class="status-line">${playerStatusHtml(combat)}</div>
      </article>
      <section class="enemy-rank" aria-label="敌方阵列">
        ${combat.enemies.map((enemy, index) => enemyHtml(enemy, index, index === combat.target)).join('')}
      </section>
      <div class="combat-log">
        <p class="eyebrow">BATTLE TRACE</p>
        ${combat.log.slice(-4).reverse().map(line => `<span>${escapeHtml(line)}</span>`).join('')}
      </div>
    </section>
    <section class="hand-console">
      <div class="resource-orbit" aria-label="当前资源">
        <span>${resourceName}</span><b>${combat.resource}<small>/${combat.maxResource}</small></b>
        <div>${Array.from({ length: combat.maxResource }, (_, index) => `<i class="${index < combat.resource ? 'is-filled' : ''}"></i>`).join('')}</div>
      </div>
      <div class="draw-count"><span>抽牌堆</span><b>${combat.drawPile.length}</b><small>弃牌 ${combat.discardPile.length} · 消耗 ${combat.exhaustPile.length}</small></div>
      <div class="combat-hand" style="--hand-size:${combat.hand.length}">
        ${combat.hand.map((card, index) => cardHtml(card, { action: 'play-card', index, disabled: getCard(card.id).unplayable || cardCost(card) > combat.resource })).join('')}
      </div>
      <button class="end-turn" data-action="end-turn"><span>结束回合</span><small>敌方依次行动</small></button>
    </section>
  </main>`;
}

function combatBars(hp, maxHp, block, tone) {
  const pct = clamp((hp / maxHp) * 100, 0, 100);
  return `<div class="combat-bars ${tone}"><div class="health-track"><i style="width:${pct}%"></i><span>${Math.max(0, hp)} / ${maxHp}</span></div>${block ? `<div class="block-chip">护 ${block}</div>` : ''}</div>`;
}

function playerStatusHtml(combat) {
  const items = [];
  if (combat.strength) items.push(`锋锐 ${combat.strength}`);
  if (combat.dexterity) items.push(`灵慧 ${combat.dexterity}`);
  if (combat.swordIntent) items.push(`剑势 ${combat.swordIntent}`);
  if (combat.seals) items.push(`符印 ${combat.seals}/3`);
  if (combat.thorns) items.push(`荆棘 ${combat.thorns}`);
  if (combat.ward) items.push(`替身 ${combat.ward}`);
  if (combat.weak) items.push(`虚弱 ${combat.weak}`);
  if (combat.vulnerable) items.push(`破绽 ${combat.vulnerable}`);
  return items.length ? items.map(item => `<span>${item}</span>`).join('') : '<span>气机平稳</span>';
}

function enemyHtml(enemy, index, selected) {
  const definition = content.enemies.find(item => item.id === enemy.id);
  const intent = enemyIntent(enemy);
  const intentText = formatIntent(intent, enemy);
  const status = [];
  if (enemy.strength) status.push(`锋锐 ${enemy.strength}`);
  if (enemy.weak) status.push(`虚弱 ${enemy.weak}`);
  if (enemy.vulnerable) status.push(`破绽 ${enemy.vulnerable}`);
  if (enemy.delayedDamage) status.push(`伏符 ${enemy.delayedDamage}`);
  return `<button class="enemy-unit ${selected ? 'is-targeted' : ''} ${enemy.hp <= 0 ? 'is-dead' : ''}" data-action="target-enemy" data-index="${index}" ${enemy.hp <= 0 ? 'disabled' : ''}>
    <div class="enemy-intent"><small>意图</small><b>${intent.name}</b><span>${intentText}</span></div>
    <div class="enemy-figure"><span class="enemy-aura"></span><i>${definition.kind === 'boss' ? '劫' : definition.kind === 'elite' ? '凶' : '妖'}</i></div>
    <div class="enemy-name"><h3>${enemy.name}</h3><p>${definition.lore}</p></div>
    ${combatBars(enemy.hp, enemy.maxHp, enemy.block, 'enemy')}
    <div class="status-line">${status.map(item => `<span>${item}</span>`).join('')}</div>
  </button>`;
}

function formatIntent(intent, enemy) {
  if (intent.type === 'attack' || intent.type === 'attackDebuff') {
    const scale = 1 + (state.act - 1) * 0.16;
    let damage = Math.round((intent.value + enemy.strength) * scale);
    if (enemy.weak > 0) damage = Math.round(damage * 0.75);
    return intent.hits ? `${damage} × ${intent.hits}` : `${damage} 伤害`;
  }
  if (intent.type === 'block') return `护体 ${intent.value}`;
  if (intent.type === 'buff') return `锋锐 +${intent.strength}`;
  if (intent.type === 'heal') return `回复 ${intent.value}`;
  return [intent.weak ? `虚弱${intent.weak}` : '', intent.vulnerable ? `破绽${intent.vulnerable}` : ''].filter(Boolean).join(' · ');
}

function cardHtml(instance, options = {}) {
  const card = getCard(instance.id);
  const text = instance.upgraded && card.upgradeText ? card.upgradeText : card.text;
  const cost = state?.combat && options.action === 'play-card' ? cardCost(instance) : card.cost;
  const classes = [`game-card`, `owner-${card.owner}`, `rarity-${card.rarity}`, options.selected ? 'is-selected' : '', options.disabled ? 'is-disabled' : ''].filter(Boolean).join(' ');
  const style = options.index !== undefined ? `style="--card-index:${options.index};--card-mid:${((options.index - ((state.combat?.hand.length || 1) - 1) / 2)).toFixed(2)}"` : '';
  const button = options.action ? 'button' : 'article';
  const attributes = options.action ? `data-action="${options.action}" data-uid="${instance.uid}" ${options.disabled ? 'disabled' : ''}` : '';
  return `<${button} class="${classes}" ${attributes} ${style}>
    <span class="card-cost">${cost}</span>
    <span class="card-school">${card.type}</span>
    <div class="card-art"><i>${card.owner === 'curse' ? '厄' : card.type.slice(0, 1)}</i><span></span></div>
    <h3>${card.name}${instance.upgraded ? '<sup>+</sup>' : ''}</h3>
    <p>${text}</p>
    <small>${card.rarity}</small>
  </${button}>`;
}

function renderReward() {
  const reward = state.reward;
  return `<main class="reward-screen scene-panel">
    <section class="reward-heading"><p class="eyebrow">VICTORY / SPOILS</p><h1>此战因果，已归于你</h1><p>获得 ${reward.gold} 灵石 · ${reward.exp} 修行经验${reward.kind === 'boss' && state.act < content.realms.length ? ` · ${content.realms[state.realmIndex + 1].material}` : ''}</p></section>
    ${reward.cards.length ? `<section class="choice-section"><h2>择取一式</h2><p>不合牌组，亦可空手离开。</p><div class="reward-cards">${reward.cards.map(id => cardHtml(createCard(id), { action: 'claim-card' }).replace('data-uid=', `data-id="${id}" data-uid=`)).join('')}</div></section>` : '<section class="choice-done">新法已收入识海。</section>'}
    ${reward.relics.length ? `<section class="choice-section relic-choice"><h2>法宝择主</h2><div class="relic-grid">${reward.relics.map(id => relicHtml(id, 'claim-relic')).join('')}</div></section>` : ''}
    <button class="primary-command compact" data-action="leave-reward"><span>收束战场</span><small>返回劫路星图</small></button>
  </main>`;
}

function relicHtml(id, action = '') {
  const relic = getRelic(id);
  return `<${action ? 'button' : 'article'} class="relic-item grade-${relic.grade}" ${action ? `data-action="${action}" data-id="${id}"` : ''}>
    <span class="relic-sigil">宝</span><div><small>${relic.grade}</small><h3>${relic.name}</h3><p>${relic.text}</p></div>
  </${action ? 'button' : 'article'}>`;
}

function renderEvent() {
  const event = state.event;
  return `<main class="event-screen scene-panel">
    <section class="event-illustration"><span class="event-moon"></span><i>异</i><small>一念入局，一念改命</small></section>
    <section class="event-copy"><p class="eyebrow">ANOMALOUS ENCOUNTER</p><h1>${event.name}</h1><p>${event.text}</p>
      <div class="event-choices">${event.choices.map((choice, index) => {
        const disabled = !meetsRequirement(choice.requires);
        return `<button data-action="event-choice" data-index="${index}" ${disabled ? 'disabled' : ''}><span>${choice.label}</span><small>${disabled ? '条件不足 · ' : ''}${choice.hint}</small></button>`;
      }).join('')}</div>
    </section>
  </main>`;
}

function renderShop() {
  const shop = state.shop;
  return `<main class="shop-screen scene-panel">
    <section class="shop-heading"><div><p class="eyebrow">WAYFARER MARKET</p><h1>浮生坊市</h1><p>货真价实，因果自负。蜃龙钱已替你压过价。</p></div><div class="purse"><span>现有灵石</span><b>${state.gold}</b></div></section>
    <section class="shop-shelves">
      <div class="shop-shelf"><h2>术法玉简</h2><div class="shop-card-row">${shop.items.filter(item => item.type === 'card').map(item => shopItemHtml(item)).join('')}</div></div>
      <div class="shop-shelf"><h2>失落法宝</h2><div class="relic-grid">${shop.items.filter(item => item.type === 'relic').map(item => shopItemHtml(item)).join('')}</div></div>
    </section>
    <section class="shop-services"><button data-action="shop-remove" ${(shop.removed || state.gold < shop.removePrice || state.deck.length <= 5) ? 'disabled' : ''}><span>斩去一段牌组因果</span><small>${shop.removed ? '本次已使用' : `${shop.removePrice} 灵石`}</small></button><button class="leave-command" data-action="leave-shop">离开坊市</button></section>
  </main>`;
}

function shopItemHtml(item) {
  const name = item.type === 'card' ? getCard(item.id).name : getRelic(item.id).name;
  const text = item.type === 'card' ? getCard(item.id).text : getRelic(item.id).text;
  return `<button class="shop-item ${item.sold ? 'is-sold' : ''}" data-action="shop-buy" data-uid="${item.uid}" ${(item.sold || state.gold < item.price) ? 'disabled' : ''}>
    <span class="shop-item-kind">${item.type === 'card' ? '简' : '宝'}</span><h3>${name}</h3><p>${text}</p><b>${item.sold ? '已售' : `${item.price} 灵石`}</b>
  </button>`;
}

function renderMeditate() {
  const fusion = selectedFusion();
  const selectedCard = ui.meditateSelection.length === 1 ? state.deck.find(card => card.uid === ui.meditateSelection[0]) : null;
  return `<main class="meditate-screen scene-panel">
    <section class="meditate-heading"><p class="eyebrow">INSIGHT / SYNTHESIS</p><h1>坐忘悟道</h1><p>择一式升华，或选两式同参。契合的道韵会熔作一张更强的悟道牌。</p></section>
    <section class="meditate-table"><div class="dao-circle"><span>${ui.meditateSelection.length ? ui.meditateSelection.length : '空'}</span><small>${fusion ? fusion.insight : '静观诸法'}</small></div><div class="meditate-deck">${state.deck.map(card => cardHtml(card, { action: 'meditate-card', selected: ui.meditateSelection.includes(card.uid) })).join('')}</div></section>
    <div class="meditate-actions">
      <button data-action="meditate-upgrade" ${(state.flags.meditated || !selectedCard || selectedCard.upgraded || !getCard(selectedCard.id)?.upgrade) ? 'disabled' : ''}><span>${state.flags.meditated ? '本次悟道已成' : '一法升华'}</span><small>将所选卡牌永久升级</small></button>
      <button data-action="meditate-fuse" ${(!state.flags.meditated && fusion) ? '' : 'disabled'}><span>${state.flags.meditated ? '本次悟道已成' : fusion ? `悟得 · ${getCard(fusion.result).name}` : '两仪同参'}</span><small>${fusion ? fusion.insight : '选择存在共鸣的两张牌'}</small></button>
      <button class="leave-command" data-action="leave-meditate">离开悟境</button>
    </div>
  </main>`;
}

function renderRest() {
  const heal = Math.round(state.maxHp * 0.32);
  return `<main class="rest-screen scene-panel"><section class="rest-view"><span>息</span><small>山门已毁，月色仍可借宿</small></section><section class="rest-copy"><p class="eyebrow">A MOMENT OF STILLNESS</p><h1>无主洞府</h1><p>石床尚温，地火未熄。今夜只能做一件事。</p><div class="event-choices"><button data-action="rest-heal"><span>抱元静养</span><small>回复${heal}点生命</small></button><button data-action="rest-temper"><span>引火淬体</span><small>最大生命+7，当前生命-6</small></button></div></section></main>`;
}

function renderRemove() {
  return `<main class="remove-screen scene-panel"><section class="meditate-heading"><p class="eyebrow">SEVER THE CAUSE</p><h1>斩去一式</h1><p>被删去的牌不会再回到本轮牌组。至少保留五张牌。</p></section><section class="remove-grid">${state.deck.map(card => cardHtml(card, { action: 'remove-card' })).join('')}</section></main>`;
}

function renderBreakthrough() {
  const next = content.realms[state.realmIndex + 1];
  const chance = Math.min(95, 72 + state.breakthrough.stability + state.breakthrough.failures * 9 + state.flags.luck * 2);
  const cost = 42 + state.breakthrough.fortified * 28;
  return `<main class="breakthrough-screen">
    <section class="tribulation-sky"><span class="thunder-mark">劫</span><p>凡躯欲承大道，先问雷霆允不允。</p></section>
    <section class="breakthrough-panel"><p class="eyebrow">REALM ASCENSION</p><h1>${getRealm().name} → ${next.name}</h1><div class="chance-dial" style="--chance:${chance * 3.6}deg"><span><b>${chance}%</b><small>渡劫胜算</small></span></div>
      <dl><div><dt>所需灵物</dt><dd>${next.material} × 1 ${state.breakthrough.failures ? '· 劫后可重试' : `· 持有 ${state.materials[next.material] || 0}`}</dd></div><div><dt>失败代价</dt><dd>最大生命-6，损失28%生命</dd></div><div><dt>破境所得</dt><dd>行动上限与卡牌威能提升</dd></div></dl>
      <div class="breakthrough-actions"><button data-action="stabilize" ${(state.breakthrough.fortified >= 2 || state.gold < cost) ? 'disabled' : ''}><span>稳固根基</span><small>${state.breakthrough.fortified >= 2 ? '根基已至极限' : `${cost}灵石 · 胜算+10%`}</small></button><button class="primary-command compact" data-action="attempt-breakthrough" ${(!state.breakthrough.failures && (state.materials[next.material] || 0) < 1) ? 'disabled' : ''}><span>叩问天门</span><small>成败皆会留下痕迹</small></button></div>
    </section>
  </main>`;
}

function renderEnding(victory) {
  const character = getCharacter();
  return `<main class="ending-screen ${victory ? 'is-victory' : 'is-defeat'}"><section class="ending-portrait"><img src="${character.portrait}" alt="${character.name}" /></section><section class="ending-copy"><p class="eyebrow">${victory ? 'THE WAY BEYOND END' : 'THE WAY REMEMBERS'}</p><h1>${victory ? '问道无尽' : '道途止于此刻'}</h1><p>${victory ? `${character.name}越过四境天关，却看见大道之后仍有大道。此轮结束，而问道从未结束。` : `${character.name}的身影消散在${getRealm().name}劫域。败局会被抹去，走过的路却已留下回声。`}</p><dl><div><dt>抵达境界</dt><dd>${getRealm().name}</dd></div><div><dt>击败敌人</dt><dd>${state.statistics.enemies}</dd></div><div><dt>出牌总数</dt><dd>${state.statistics.cardsPlayed}</dd></div><div><dt>造成伤害</dt><dd>${state.statistics.damage}</dd></div></dl><button class="primary-command" data-action="confirm-reset"><span>再问一世</span><small>清空本轮，重新选择问道者</small></button></section></main>`;
}

function showOverlay(inner) {
  overlayRoot.innerHTML = `<div class="overlay-backdrop"><section class="overlay-panel">${inner}<button class="overlay-close" data-action="close-overlay" title="关闭">×</button></section></div>`;
}

function closeOverlay() {
  overlayRoot.innerHTML = '';
}

function openDeckOverlay() {
  showOverlay(`<header><p class="eyebrow">CURRENT DECK</p><h2>随身牌组 · ${state.deck.length}</h2></header><div class="overlay-card-grid">${state.deck.map(card => cardHtml(card)).join('')}</div>`);
}

function openRelicOverlay() {
  showOverlay(`<header><p class="eyebrow">RELICS / SOULBOUND</p><h2>法宝与本命物 · ${state.relics.length}</h2></header><div class="overlay-relic-grid">${state.relics.map(id => relicHtml(id)).join('')}</div>`);
}

function openHelpOverlay() {
  showOverlay(`<header><p class="eyebrow">RULES OF THE WAY</p><h2>问道札记</h2></header><div class="help-columns"><section><b>回合</b><p>打出卡牌消耗${getCharacter().resource.name}。未用资源保留，下回合自然恢复；结束回合后，敌人按头顶意图依次行动。</p></section><section><b>牌组</b><p>抽牌堆耗尽时，弃牌堆会重新洗牌。精简牌组、围绕法宝和职业被动构筑，比单纯堆高品牌更重要。</p></section><section><b>道途</b><p>星图每层只能选一条道路，落定后其余节点永久关闭。凶关更危险，但能取得法宝；悟道可以升级或融合卡牌。</p></section><section><b>破境</b><p>击败天关之敌取得突破灵物。渡劫存在失败概率，可花灵石稳固根基；失败会留下真实劫伤，但重试胜算上升。</p></section></div>`);
}

function openResetOverlay() {
  showOverlay(`<header><p class="eyebrow">ABANDON THIS CYCLE</p><h2>斩断本轮因果？</h2></header><div class="reset-warning"><p>当前境界、牌组、法宝与路线都会被清空。</p><button class="danger-command" data-action="confirm-reset">确认放弃本轮</button></div>`);
}

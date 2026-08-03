export const SPIRIT_HEART_ENTRY_COST = 10;
export const SPIRIT_HEART_BASE_MAX = 30;
export const SPIRIT_HEART_LEVEL_BONUS = 3;
export const SPIRIT_HEART_HARD_CAP = 100;
export const SPIRIT_HEART_RECOVERY_MS = 30 * 60 * 1000;
export const WENDAO_PALACE_NAME = '伪·先天至宝·问道仙宫';
export const WENDAO_PALACE_DESC = '问道天宫的仿制品，真品已消失在岁月长河之中；可额外存储一倍心神，并使心神自然恢复速度加快10%。';

export const SPIRIT_CHOICES = Object.freeze([
  Object.freeze({ id: 'steady', number: 1, label: '镇守心神', costRate: 0.5 }),
  Object.freeze({ id: 'treasure', number: 2, label: '搜寻机缘', costRate: 1 }),
  Object.freeze({ id: 'insight', number: 3, label: '参悟道痕', costRate: 1.2 }),
]);

const SPIRIT_COMBAT_SKILLS = Object.freeze({
  attack: Object.freeze({ 神灵斩劫经: 0.25, 劫运神拳: 0.30 }),
  defense: Object.freeze({ 元神盾: 0.35, 九劫雷符: 0.55 }),
});

const SPIRIT_GUARDIANS = Object.freeze({
  333: Object.freeze(['无名剑修余念', '残宫守印者']),
  334: Object.freeze(['讲经古贤烙印', '护崖道人残魂']),
  335: Object.freeze(['渡劫者残魂', '劫运魔念']),
  336: Object.freeze(['点火古神余念', '失控神火灵', '祭坛守火人']),
  337: Object.freeze(['史前进化者残魂', '畸变花灵', '百世轮回烙印']),
  338: Object.freeze(['无主念头聚合体', '梦中圣者余念', '十二万九千六百念主']),
  339: Object.freeze(['帝印守灵', '败亡帝者残魂', '帝陨恶念', '残帝烙印']),
  340: Object.freeze(['三劫鬼仙余念', '六劫雷魂', '八劫鬼仙残念', '九劫雷灵']),
  341: Object.freeze(['葬仙残魂', '不灭仙念', '万仙怨念', '真仙守墓人', '仙帝投影']),
});

const FORCED_RETENTION_BY_LAYER = Object.freeze([0, 0.8, 0.65, 0.5, 0.35, 0.2]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getSpiritHeartBaseMax(player) {
  const level = Math.max(0, Math.floor(Number(player?.yuanshenlevel_id) || 0));
  const extra = Math.max(0, Math.floor(Number(player?.心神额外上限) || 0));
  return clamp(
    SPIRIT_HEART_BASE_MAX + level * SPIRIT_HEART_LEVEL_BONUS + extra,
    SPIRIT_HEART_BASE_MAX,
    SPIRIT_HEART_HARD_CAP,
  );
}

export function getSpiritHeartMax(player) {
  const baseMax = getSpiritHeartBaseMax(player);
  return player?.问道仙宫 ? baseMax * 2 : baseMax;
}

export function getSpiritHeartRecoveryMs(player) {
  return player?.问道仙宫
    ? Math.floor(SPIRIT_HEART_RECOVERY_MS * 0.9)
    : SPIRIT_HEART_RECOVERY_MS;
}

export function grantWendaoPalace(player, now = Date.now()) {
  if (!player || typeof player !== 'object' || player.问道仙宫) return false;
  const wasFull = Number(player.心神) >= getSpiritHeartMax(player);
  player.问道仙宫 = true;
  if (wasFull) player.心神恢复时间 = now;
  return true;
}

export function refreshSpiritHeart(player, now = Date.now()) {
  const max = getSpiritHeartMax(player);
  const recoveryMs = getSpiritHeartRecoveryMs(player);
  const current = Number(player?.心神);
  if (!Number.isFinite(current)) {
    player.心神 = max;
    player.心神恢复时间 = now;
    return { current: max, max, recovered: 0 };
  }

  let last = Number(player.心神恢复时间);
  if (!Number.isFinite(last) || last > now) last = now;
  const ticks = Math.max(0, Math.floor((now - last) / recoveryMs));
  const before = clamp(Math.floor(current), 0, max);
  player.心神 = clamp(before + ticks, 0, max);
  player.心神恢复时间 = player.心神 >= max
    ? now
    : last + ticks * recoveryMs;
  return { current: player.心神, max, recovered: player.心神 - before };
}

export function getSpiritHeartCost(cost, effects = {}) {
  const base = Math.max(0, Math.floor(Number(cost) || 0));
  return calculateMinggeCost(
    base,
    effects,
    '心神消耗减少',
    '心神消耗增加',
    { minimum: base > 0 ? 1 : 0 }
  );
}

export function consumeSpiritHeartEntry(player, now = Date.now(), effects = {}) {
  return consumeSpiritHeart(player, SPIRIT_HEART_ENTRY_COST, now, effects);
}

export function consumeSpiritHeart(player, cost, now = Date.now(), effects = {}) {
  const required = getSpiritHeartCost(cost, effects);
  const status = refreshSpiritHeart(player, now);
  if (status.current < required) {
    return { ok: false, cost: required, ...status };
  }
  player.心神 -= required;
  return {
    ok: true,
    cost: required,
    current: player.心神,
    max: status.max,
    recovered: status.recovered,
  };
}

export function increaseSpiritHeartLimit(player, amount) {
  const beforeMax = getSpiritHeartMax(player);
  const room = Math.max(0, SPIRIT_HEART_HARD_CAP - getSpiritHeartBaseMax(player));
  const gain = Math.min(room, Math.max(0, Math.floor(Number(amount) || 0)));
  if (!gain) return 0;
  player.心神额外上限 = Math.max(0, Math.floor(Number(player.心神额外上限) || 0)) + gain;
  const capacityGain = getSpiritHeartMax(player) - beforeMax;
  player.心神 = Math.min(getSpiritHeartMax(player), Math.max(0, Number(player.心神) || 0) + capacityGain);
  return capacityGain;
}

export function createSpiritJourney(place, usrQq, entryCost, now = Date.now()) {
  const firstLayer = place.layers[0];
  return {
    version: 3,
    usr_qq: usrQq,
    place_id: place.id,
    place_name: place.name,
    current_layer: 1,
    layer_name: firstLayer.name,
    yuanshen_consumed: entryCost,
    guanxiang_count: 0,
    max_layer_reached: 1,
    layer_insight: 0,
    layer_actions: 0,
    pending_event: null,
    findings: [],
    start_time: now,
  };
}

export function normalizeSpiritJourney(state) {
  return {
    ...state,
    version: 3,
    yuanshen_consumed: Math.max(0, Number(state?.yuanshen_consumed) || 0),
    guanxiang_count: Math.max(0, Math.floor(Number(state?.guanxiang_count) || 0)),
    max_layer_reached: Math.max(1, Math.floor(Number(state?.max_layer_reached) || 1)),
    layer_insight: Math.max(0, Math.floor(Number(state?.layer_insight) || 0)),
    layer_actions: Math.max(0, Math.floor(Number(state?.layer_actions) || 0)),
    pending_event: state?.pending_event || null,
    findings: Array.isArray(state?.findings) ? state.findings : [],
  };
}

export function getSpiritChoice(choiceNumber, layer) {
  const choice = SPIRIT_CHOICES.find(item => item.number === Number(choiceNumber));
  if (!choice) return null;
  const baseCost = Math.max(1, Number(layer?.cost_per_action) || 100000);
  return {
    ...choice,
    cost: Math.ceil(baseCost * choice.costRate),
  };
}

export function getSpiritInsightRequirement(depthBonus = 0) {
  return Math.max(1, 2 - Math.floor(Math.max(0, Number(depthBonus) || 0)));
}

export function getSpiritLegacyChance(layerNumber, depth) {
  const layer = Math.max(1, Math.floor(Number(layerNumber) || 1));
  const deepestBonus = layer >= Math.max(1, Number(depth) || 1) ? 0.03 : 0;
  return clamp(0.03 + (layer - 1) * 0.02 + deepestBonus, 0.03, 0.15);
}

export function shouldTriggerSpiritLegacy(pity, chance, random = Math.random) {
  return Math.max(0, Math.floor(Number(pity) || 0)) >= 9 || random() < clamp(chance, 0, 1);
}

export function pickWeightedDrop(drops, random = Math.random) {
  const pool = (drops || []).filter(drop => drop?.name && Number(drop?.权重 || 0) > 0);
  const total = pool.reduce((sum, drop) => sum + Number(drop.权重), 0);
  if (!total) return null;

  let cursor = random() * total;
  for (const drop of pool) {
    cursor -= Number(drop.权重);
    if (cursor < 0) return drop;
  }
  return pool.at(-1);
}

export function createSpiritFinding(drop) {
  if (!drop) return null;
  if (drop.class === '功法') {
    return { kind: 'skill', type: 'skill', name: drop.name };
  }
  return {
    kind: 'item',
    type: 'item',
    name: drop.name,
    class: drop.class,
    itemType: drop.type,
  };
}

export function resolveSpiritChoice({
  choiceNumber,
  layer,
  shenyouBonus = 0,
  random = Math.random,
}) {
  const action = getSpiritChoice(choiceNumber, layer);
  if (!action) return null;

  const baseCost = Math.max(1, Number(layer?.cost_per_action) || 100000);
  const result = {
    action,
    outcome: action.id,
    insightGain: 0,
    currentYuanshenDelta: 0,
    finding: null,
  };

  if (action.id === 'steady') {
    result.outcome = 'steady_success';
    result.insightGain = 1;
    result.currentYuanshenDelta = Math.ceil(baseCost * 0.1);
    return result;
  }

  if (action.id === 'treasure') {
    const chance = clamp(0.65 + Math.max(0, Number(shenyouBonus) || 0), 0.65, 0.9);
    const roll = random();
    if (roll < chance) {
      const drop = pickWeightedDrop(layer?.drops, random);
      result.outcome = drop ? 'treasure_found' : 'treasure_empty';
      result.finding = createSpiritFinding(drop);
      result.insightGain = drop ? 1 : 0;
    } else {
      result.outcome = roll > 0.92 ? 'treasure_hazard' : 'treasure_empty';
      if (result.outcome === 'treasure_hazard') {
        result.currentYuanshenDelta = -Math.ceil(baseCost * 0.25);
      }
    }
    return result;
  }

  const bonus = Math.max(0, Number(shenyouBonus) || 0);
  const roll = Math.max(0, random() - bonus * 0.5);
  if (roll < 0.42) {
    result.outcome = 'insight_recover';
    result.insightGain = 2;
    result.currentYuanshenDelta = Math.ceil(baseCost * 0.55);
  } else if (roll < 0.72) {
    result.outcome = 'insight_expand';
    result.insightGain = 1;
    result.finding = {
      kind: 'max',
      type: 'max',
      name: '元神上限',
      amount: Math.ceil(baseCost * 0.25),
    };
  } else if (roll < 0.9) {
    result.outcome = 'insight_trace';
    result.insightGain = 2;
  } else {
    result.outcome = 'insight_backlash';
    result.currentYuanshenDelta = -Math.ceil(baseCost * 0.25);
  }

  return result;
}

function strongestLearnedSkill(player, type) {
  const learned = Array.isArray(player?.学习的功法) ? player.学习的功法 : [];
  const pool = SPIRIT_COMBAT_SKILLS[type];
  return learned.reduce((best, name) => {
    const value = Number(pool[name]) || 0;
    return value > best.value ? { name, value } : best;
  }, { name: '', value: 0 });
}

export function getSpiritGuardianName(placeId, layerNumber, legacy = false) {
  if (legacy) return '传承强者残魂';
  const names = SPIRIT_GUARDIANS[Number(placeId)] || ['无名守关余念'];
  const index = clamp(Math.floor(Number(layerNumber) || 1) - 1, 0, names.length - 1);
  return names[index];
}

export function resolveSpiritGuardianBattle({ player, place, layer, legacy = false }) {
  const currentYuanshen = Math.max(1, Math.floor(Number(player?.元神) || 0));
  const maxYuanshen = Math.max(currentYuanshen, Math.floor(Number(player?.元神上限) || currentYuanshen));
  const shenshi = Math.max(1, Math.floor(Number(player?.神识) || 0));
  const baseCost = Math.max(1, Math.floor(Number(layer?.cost_per_action) || 100000));
  const layerNumber = Math.max(1, Math.floor(Number(layer?.layer) || 1));
  const tier = Math.max(0, Math.floor(Number(place?.yuanshen_required) || 0));
  const difficulty = 1 + tier * 0.04 + (layerNumber - 1) * 0.10 + (legacy ? 0.20 : 0);
  const attackSkill = strongestLearnedSkill(player, 'attack');
  const defenseSkill = strongestLearnedSkill(player, 'defense');
  const attackBonus = Math.max(0, Number(player?.元神伤害加成) || 0)
    + Math.max(0, Number(player?.全伤害类型加成) || 0)
    + attackSkill.value;
  const damageReduction = clamp(
    Math.max(0, Number(player?.元神伤害减免) || 0)
      + Math.max(0, Number(player?.全类型减免) || 0)
      + defenseSkill.value,
    0,
    0.75,
  );

  const guardian = {
    name: getSpiritGuardianName(place?.id, layerNumber, legacy),
    hp: Math.floor(Math.max(baseCost * 3, maxYuanshen * 0.35) * difficulty),
    attack: Math.floor(Math.max(baseCost * 0.18, maxYuanshen * 0.045) * difficulty),
    defense: Math.floor(baseCost * 0.30 * difficulty),
  };
  const guardianMaxHp = guardian.hp;
  const baseAttack = Math.max(shenshi, maxYuanshen * 0.08, baseCost * 0.15);
  let playerYuanshen = currentYuanshen;
  const logs = [];

  for (let round = 1; round <= 8 && guardian.hp > 0 && playerYuanshen > 0; round++) {
    let dealt = Math.max(1, Math.floor(baseAttack * (1 + attackBonus) - guardian.defense * 0.20));
    if (attackSkill.name === '劫运神拳' && playerYuanshen <= maxYuanshen * 0.5) dealt = Math.floor(dealt * 1.15);
    guardian.hp = Math.max(0, guardian.hp - dealt);
    logs.push(`第${round}回合：你以${attackSkill.name || '神识念刃'}斩去${guardian.name}${dealt}点魂力。`);
    if (guardian.hp <= 0) break;

    const received = Math.max(1, Math.floor(guardian.attack * (1 - damageReduction)));
    playerYuanshen = Math.max(0, playerYuanshen - received);
    if (defenseSkill.name === '九劫雷符') {
      guardian.hp = Math.max(0, guardian.hp - Math.floor(received * 0.15));
    }
    logs.push(`${guardian.name}反噬识海，你损失${received}点元神。`);
  }

  return {
    won: guardian.hp <= 0,
    guardianName: guardian.name,
    guardianMaxHp,
    guardianRemainingHp: guardian.hp,
    remainingYuanshen: playerYuanshen,
    yuanshenLost: currentYuanshen - playerYuanshen,
    attackSkill: attackSkill.name,
    defenseSkill: defenseSkill.name,
    logs,
  };
}

export function getSpiritRetentionRate(layer, forced = false) {
  if (!forced) return 1;
  const index = clamp(Math.floor(Number(layer) || 1), 1, FORCED_RETENTION_BY_LAYER.length - 1);
  return FORCED_RETENTION_BY_LAYER[index];
}

export function retainSpiritFindings(findings, rate, random = Math.random) {
  const safeRate = clamp(Number(rate) || 0, 0, 1);
  if (safeRate >= 1) return [...(findings || [])];
  return (findings || []).filter(() => random() < safeRate);
}

export function mergeSpiritItemsIntoNajie(najie, findings, itemCatalog) {
  let count = 0;
  for (const finding of findings || []) {
    const kind = finding?.kind || finding?.type;
    if (kind !== 'item') continue;

    const item = (itemCatalog || []).find(entry => entry.name === finding.name);
    const itemClass = finding.class || item?.class;
    if (!item || !itemClass) continue;

    if (!Array.isArray(najie[itemClass])) najie[itemClass] = [];
    const existing = najie[itemClass].find(entry => entry.name === item.name);
    if (existing) {
      existing.数量 = Math.max(0, Number(existing.数量) || 0) + 1;
    } else {
      najie[itemClass].push({ ...item, 数量: 1, islockd: 0 });
    }
    count++;
  }
  return count;
}

export function validateSpiritPlaces(places) {
  const errors = [];
  for (const place of places || []) {
    if (!place?.name) errors.push('存在未命名的精神位面');
    if (!Array.isArray(place?.layers) || place.layers.length !== Number(place.depth)) {
      errors.push(`${place?.name || '未知位面'}的层数与depth不一致`);
    }
    for (const layer of place?.layers || []) {
      if (!layer?.name || Number(layer.cost_per_action) <= 0) {
        errors.push(`${place.name}存在无效层级`);
      }
      for (const drop of layer?.drops || []) {
        if (!drop?.name || !drop?.class || Number(drop?.权重) <= 0) {
          errors.push(`${place.name}/${layer.name}存在无效掉落`);
        }
      }
    }
  }
  return errors;
}
import { calculateMinggeCost } from './mingge.js';

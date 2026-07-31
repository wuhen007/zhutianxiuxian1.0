export const SPIRIT_STABILITY_MAX = 100;
export const SPIRIT_DEEPEN_STABILITY_COST = 6;

export const SPIRIT_CHOICES = Object.freeze([
  Object.freeze({ id: 'steady', number: 1, label: '镇守心神', costRate: 0.5, stabilityLoss: 6 }),
  Object.freeze({ id: 'treasure', number: 2, label: '搜寻机缘', costRate: 1, stabilityLoss: 10 }),
  Object.freeze({ id: 'insight', number: 3, label: '参悟道痕', costRate: 1.2, stabilityLoss: 12 }),
]);

const FORCED_RETENTION_BY_LAYER = Object.freeze([0, 0.8, 0.65, 0.5, 0.35, 0.2]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createSpiritJourney(place, usrQq, entryCost, now = Date.now()) {
  const firstLayer = place.layers[0];
  return {
    version: 2,
    usr_qq: usrQq,
    place_id: place.id,
    place_name: place.name,
    current_layer: 1,
    layer_name: firstLayer.name,
    yuanshen_consumed: entryCost,
    guanxiang_count: 0,
    max_layer_reached: 1,
    stability: SPIRIT_STABILITY_MAX,
    layer_insight: 0,
    pending_event: null,
    findings: [],
    start_time: now,
  };
}

export function normalizeSpiritJourney(state) {
  return {
    ...state,
    version: 2,
    yuanshen_consumed: Math.max(0, Number(state?.yuanshen_consumed) || 0),
    guanxiang_count: Math.max(0, Math.floor(Number(state?.guanxiang_count) || 0)),
    max_layer_reached: Math.max(1, Math.floor(Number(state?.max_layer_reached) || 1)),
    stability: clamp(Number(state?.stability ?? SPIRIT_STABILITY_MAX), 0, SPIRIT_STABILITY_MAX),
    layer_insight: Math.max(0, Math.floor(Number(state?.layer_insight) || 0)),
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
    extraStabilityLoss: 0,
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
      result.extraStabilityLoss = result.outcome === 'treasure_hazard' ? 6 : 0;
    }
    return result;
  }

  const bonus = Math.max(0, Number(shenyouBonus) || 0);
  const roll = Math.max(0, random() - bonus * 0.5);
  const skillDrops = (layer?.drops || []).filter(drop => drop.class === '功法');

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
  } else if (roll < 0.88 && skillDrops.length) {
    result.outcome = 'insight_skill';
    result.insightGain = 1;
    result.finding = createSpiritFinding(pickWeightedDrop(skillDrops, random));
  } else if (roll < 0.9) {
    result.outcome = 'insight_trace';
    result.insightGain = 2;
  } else {
    result.outcome = 'insight_backlash';
    result.currentYuanshenDelta = -Math.ceil(baseCost * 0.25);
    result.extraStabilityLoss = 6;
  }

  return result;
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

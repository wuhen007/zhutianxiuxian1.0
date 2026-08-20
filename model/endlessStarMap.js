const STAR_MAP_VERSION = 2;

export const ENDLESS_STAR_CALAMITIES = Object.freeze([
  Object.freeze({
    id: 'empty_way', name: '空劫迷途',
    description: '因果被彻底掏空，本层胜利后不会显化能力选项。',
    skipAbilityReward: true,
  }),
  Object.freeze({
    id: 'trace_leech', name: '蚀痕寄生',
    description: '食道虫伏在战利品中，本层劫境道痕产出降低55%。',
    tokenMultiplier: 0.45,
  }),
  Object.freeze({
    id: 'law_burial', name: '万法葬坑',
    description: '最强的一部分构筑被葬法雾压制，本场随机封禁能力。',
    sealedAbilityCount: 1,
  }),
  Object.freeze({
    id: 'blood_toll', name: '命血路税',
    description: '道路索取命血，全队入场额外损失18%最大生命。',
    entryHpCostPct: 0.18,
  }),
]);

export const ENDLESS_STAR_NODE_TYPES = Object.freeze({
  conquest: {
    name: '征伐劫星', shortName: '征伐', symbol: '战', kind: 'stable',
    risk: '寻常', stage: 'normal', rewardMultiplier: 1,
    enemyHpMultiplier: 1, enemyAttackMultiplier: 1, enemyDefenseMultiplier: 1,
    description: '正面击溃当地怪潮，风险与收获最为稳定。',
    rewardText: '基础战利品', seal: null,
  },
  prodigy: {
    name: '天骄截杀', shortName: '天骄', symbol: '骄', kind: 'danger',
    risk: '凶险', stage: 'elite', rewardMultiplier: 1.5,
    enemyHpMultiplier: 1.18, enemyAttackMultiplier: 1.14, enemyDefenseMultiplier: 1.1,
    description: '截杀携带强化机制的异界天骄，争夺其大道根基。',
    rewardText: '奖励×1.50，高阶能力倾向', seal: 'slaughter',
  },
  tide: {
    name: '诸天潮汐', shortName: '潮汐', symbol: '潮', kind: 'danger',
    risk: '大凶', stage: 'normal', rewardMultiplier: 1.8,
    enemyHpMultiplier: 1.12, enemyAttackMultiplier: 1.1, enemyDefenseMultiplier: 1.04,
    monsterCountBonus: 2,
    description: '数轮怪潮叠成一体，中途无法脱离战场。',
    rewardText: '奖励×1.80，怪潮额外增加2只', seal: 'slaughter',
  },
  relic: {
    name: '诸天遗府', shortName: '遗府', symbol: '遗', kind: 'resonant',
    risk: '凶险', stage: 'elite', rewardMultiplier: 1.35,
    enemyHpMultiplier: 1.1, enemyAttackMultiplier: 1.06, enemyDefenseMultiplier: 1.08,
    victoryEffect: 'relic',
    description: '古老传承仍有守护者盘踞，破阵后可参悟遗留道痕。',
    rewardText: '奖励×1.35，随机强化一项能力', seal: 'cause',
  },
  altar: {
    name: '逆命祭坛', shortName: '祭坛', symbol: '祭', kind: 'danger',
    risk: '大凶', stage: 'normal', rewardMultiplier: 1.65,
    enemyHpMultiplier: 1.2, enemyAttackMultiplier: 1.17, enemyDefenseMultiplier: 1.08,
    entryHpCostPct: 0.1,
    description: '以全队当前生命献祭逆命，换取更丰厚的劫境回响。',
    rewardText: '入场损失10%最大生命，奖励×1.65', seal: 'defiance',
  },
  mirror: {
    name: '镜世残响', shortName: '镜世', symbol: '镜', kind: 'resonant',
    risk: '大凶', stage: 'elite', rewardMultiplier: 1.6,
    enemyHpMultiplier: 1.24, enemyAttackMultiplier: 1.18, enemyDefenseMultiplier: 1.12,
    victoryEffect: 'mirror',
    description: '队伍的强大构筑化为敌影，胜者可吞噬另一种可能。',
    rewardText: '奖励×1.60，构筑成长与能力强化', seal: 'cause',
  },
  rift: {
    name: '破界裂隙', shortName: '裂隙', symbol: '界', kind: 'resonant',
    risk: '凶险', stage: 'normal', rewardMultiplier: 1.3,
    enemyHpMultiplier: 1.16, enemyAttackMultiplier: 1.1, enemyDefenseMultiplier: 1.06,
    description: '强行横渡世界壁垒，后续能力将受到该位面牵引。',
    rewardText: '奖励×1.30，改变能力来源位面', seal: 'boundary',
  },
  heaven_gate: {
    name: '十方天关', shortName: '天关', symbol: '劫', kind: 'boss',
    risk: '十死无生', stage: 'boss', rewardMultiplier: 1,
    enemyHpMultiplier: 1, enemyAttackMultiplier: 1, enemyDefenseMultiplier: 1,
    description: '一轮劫环的所有因果在此汇聚，诸天Boss联军镇守前路。',
    rewardText: '封存本轮所得，开启劫后问道', seal: null,
  },
});

export const ENDLESS_STAR_SKIES = Object.freeze([
  {
    id: 'red_moon', name: '赤月凌空', omen: '杀机浸染诸界，敌人攻势更烈。',
    enemyHpMultiplier: 1, enemyAttackMultiplier: 1.12,
    enemyDefenseMultiplier: 1, rewardMultiplier: 1.15,
  },
  {
    id: 'world_collapse', name: '诸界坍缩', omen: '世界壁垒崩落，异界生灵更为强韧。',
    enemyHpMultiplier: 1.15, enemyAttackMultiplier: 1.04,
    enemyDefenseMultiplier: 1, rewardMultiplier: 1.18,
  },
  {
    id: 'all_laws', name: '万法归流', omen: '大道彼此纠缠，守关者更难被撼动。',
    enemyHpMultiplier: 1.06, enemyAttackMultiplier: 1,
    enemyDefenseMultiplier: 1.14, rewardMultiplier: 1.16,
  },
  {
    id: 'reversed_cause', name: '因果倒悬', omen: '代价与收获一同膨胀，前路难以测算。',
    enemyHpMultiplier: 1.1, enemyAttackMultiplier: 1.09,
    enemyDefenseMultiplier: 1.05, rewardMultiplier: 1.25,
  },
  {
    id: 'emperor_fall', name: '帝落时代', omen: '帝影横空，天关威压提前笼罩每一条道路。',
    enemyHpMultiplier: 1.12, enemyAttackMultiplier: 1.08,
    enemyDefenseMultiplier: 1.08, rewardMultiplier: 1.22,
  },
]);

const ROW_COUNTS = [2, 3, 3, 3, 3, 3, 3, 3, 2, 1];
const STABLE_TYPES = ['conquest', 'conquest', 'relic', 'rift'];
const RESONANT_TYPES = ['relic', 'rift', 'mirror', 'conquest'];
const DANGER_TYPES = ['prodigy', 'tide', 'altar', 'mirror'];
const NINTH_LAYER_TYPES = ['prodigy', 'tide', 'mirror'];

function clone(value) {
  return structuredClone(value);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createRandom(seed) {
  let state = (number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

function cycleForLayer(layer) {
  return Math.max(1, Math.floor((Math.max(1, number(layer, 1)) - 1) / 10) + 1);
}

function worldRecord(worlds, worldId) {
  return worlds.find(world => world.id === worldId) || worlds[0];
}

function pickOtherWorld(random, worldIds, excluded) {
  const candidates = worldIds.filter(id => id !== excluded);
  return pick(random, candidates.length ? candidates : worldIds);
}

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function calamityFor(run, node) {
  if (node.stage === 'boss' || node.layer <= 10) return null;
  const random = createRandom((number(run.rngState) ^ hashText(node.id)) >>> 0);
  const dangerBonus = node.kind === 'danger' ? 0.1 : node.kind === 'resonant' ? 0.04 : 0;
  const chance = Math.min(0.72, (node.layer - 10) * 0.012 + dangerBonus);
  if (random() >= chance) return null;
  const event = clone(pick(random, ENDLESS_STAR_CALAMITIES));
  if (event.id === 'law_burial' && node.layer >= 60) event.sealedAbilityCount = 2;
  event.chance = chance;
  return event;
}

function connectRows(rows) {
  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
    const current = rows[rowIndex].nodes;
    const next = rows[rowIndex + 1].nodes;
    for (const [index, node] of current.entries()) {
      const center = current.length === 1
        ? 0
        : Math.round(index * (next.length - 1) / (current.length - 1));
      const linked = new Set([center]);
      if (next.length > 1)
        linked.add(Math.max(0, Math.min(next.length - 1, center + (index % 2 ? -1 : 1))));
      node.nextNodeIds = [...linked].map(slot => next[slot].id);
    }
    for (const target of next) {
      if (current.some(node => node.nextNodeIds.includes(target.id))) continue;
      const nearest = current.reduce((best, node) =>
        Math.abs(node.slot - target.slot) < Math.abs(best.slot - target.slot) ? node : best
      );
      nearest.nextNodeIds.push(target.id);
    }
  }
}

function nodeTypeFor(random, rowOffset, slot, used) {
  if (rowOffset === 10) return 'heaven_gate';
  if (slot === 0 && rowOffset !== 9) return 'conquest';
  const pool = rowOffset === 9
    ? NINTH_LAYER_TYPES
    : slot === 0
      ? STABLE_TYPES
      : slot === 1
        ? RESONANT_TYPES
        : DANGER_TYPES;
  const available = pool.filter(type => !used.has(type));
  return pick(random, available.length ? available : pool);
}

function generateStarMap(run, worlds, targetLayer) {
  const cycle = cycleForLayer(targetLayer);
  const startLayer = (cycle - 1) * 10 + 1;
  const random = createRandom((number(run.rngState) ^ cycle * 0x85ebca6b) >>> 0);
  const worldIds = run.worldOrder?.length
    ? [...run.worldOrder]
    : worlds.map(world => world.id);
  const primaryWorldId = worldIds[(cycle - 1) % worldIds.length];
  const sky = ENDLESS_STAR_SKIES[Math.floor(random() * ENDLESS_STAR_SKIES.length)];
  const rows = ROW_COUNTS.map((count, rowIndex) => {
    const offset = rowIndex + 1;
    const layer = startLayer + rowIndex;
    const used = new Set();
    const nodes = Array.from({ length: count }, (_, slot) => {
      const typeId = nodeTypeFor(random, offset, slot, used);
      used.add(typeId);
      const type = ENDLESS_STAR_NODE_TYPES[typeId];
      const worldId = typeId === 'heaven_gate' || slot === 0
        ? primaryWorldId
        : typeId === 'rift'
          ? pickOtherWorld(random, worldIds, primaryWorldId)
          : pick(random, worldIds);
      const world = worldRecord(worlds, worldId);
      return {
        id: `c${cycle}-l${layer}-n${slot + 1}`,
        layer,
        slot: slot + 1,
        typeId,
        worldId,
        worldName: world?.name || worldId,
        name: `${world?.name || '未知位面'}·${type.name}`,
        shortName: type.shortName,
        symbol: type.symbol,
        kind: type.kind,
        risk: type.risk,
        stage: type.stage,
        description: type.description,
        rewardText: type.rewardText,
        status: 'future',
      };
    });
    return { layer, offset, nodes };
  });
  connectRows(rows);
  return {
    version: STAR_MAP_VERSION,
    cycle,
    startLayer,
    primaryWorldId,
    sky: clone(sky),
    rows,
    selectedNodeId: null,
    suggestions: {},
    lastClearedWorldId: null,
    consecutiveWorldId: null,
    consecutiveWorldCount: 0,
    seals: { slaughter: 0, cause: 0, boundary: 0, defiance: 0 },
  };
}

export function ensureEndlessStarMap(run, worlds, targetLayer = run.layer + 1) {
  const expectedCycle = cycleForLayer(targetLayer);
  if (
    !run.starMap ||
    run.starMap.version !== STAR_MAP_VERSION ||
    run.starMap.cycle !== expectedCycle
  )
    run.starMap = generateStarMap(run, worlds, targetLayer);
  run.starMap.suggestions ||= {};
  run.starMap.seals ||= { slaughter: 0, cause: 0, boundary: 0, defiance: 0 };
  return run.starMap;
}

export function getEndlessStarOptions(run, layer = run.layer + 1) {
  const row = run.starMap?.rows?.find(entry => entry.layer === layer);
  return row?.nodes?.filter(node => node.status !== 'blocked') || [];
}

export function getSelectedEndlessStarNode(run, layer = run.layer + 1) {
  const selectedId = run.starMap?.selectedNodeId;
  if (!selectedId) return null;
  return getEndlessStarOptions(run, layer).find(node => node.id === selectedId) || null;
}

function selectNode(run, choiceNumber, automatic = false, layer = run.layer + 1) {
  const options = getEndlessStarOptions(run, layer);
  const index = Math.floor(number(choiceNumber)) - 1;
  const node = options[index];
  if (!node) throw new Error(`请选择1至${options.length}`);
  if (run.starMap.selectedNodeId && run.starMap.selectedNodeId !== node.id)
    throw new Error('本层因果已经锁定，无法更改劫途');
  run.starMap.selectedNodeId = node.id;
  for (const current of options) {
    current.status = current.id === node.id ? 'selected' : 'bypassed';
    current.automatic = current.id === node.id && automatic;
  }
  node.calamity ||= calamityFor(run, node);
  return { ...clone(node), automatic };
}

export function selectEndlessStarRoute(run, choiceNumber) {
  if (['checkpoint', 'settling', 'defeated'].includes(run.phase))
    throw new Error('当前无法锁定下一条劫途');
  return selectNode(run, choiceNumber, false);
}

export function autoSelectEndlessStarRoute(run, layer = run.layer + 1) {
  return getSelectedEndlessStarNode(run, layer) || selectNode(run, 1, true, layer);
}

export function suggestEndlessStarRoute(run, memberId, choiceNumber) {
  if (run.starMap?.selectedNodeId) throw new Error('本层因果已经锁定');
  const options = getEndlessStarOptions(run);
  const index = Math.floor(number(choiceNumber)) - 1;
  const node = options[index];
  if (!node) throw new Error(`请选择1至${options.length}`);
  run.starMap.suggestions[String(memberId)] = node.id;
  return clone(node);
}

export function getEndlessStarVotes(run) {
  const votes = Object.values(run.starMap?.suggestions || {});
  return getEndlessStarOptions(run).map(node => ({
    nodeId: node.id,
    votes: votes.filter(id => id === node.id).length,
  }));
}

export function getEndlessStarEncounter(run, layer = run.layer + 1) {
  const node = getSelectedEndlessStarNode(run, layer);
  if (!node) return null;
  const type = ENDLESS_STAR_NODE_TYPES[node.typeId];
  const calamity = node.calamity || null;
  const sky = run.starMap.sky || {};
  const legacyFallback = Boolean(node.automatic);
  const sealTotal = Object.values(run.starMap.seals || {}).reduce(
    (sum, value) => sum + number(value),
    0
  );
  const bossSealMultiplier = node.typeId === 'heaven_gate'
    ? 1 + Math.min(0.5, sealTotal * 0.04)
    : 1;
  return {
    ...clone(node),
    monsterCountBonus: legacyFallback ? 0 : number(type.monsterCountBonus),
    entryHpCostPct: legacyFallback
      ? 0
      : number(type.entryHpCostPct) + number(calamity?.entryHpCostPct),
    tokenMultiplier: legacyFallback ? 1 : number(calamity?.tokenMultiplier, 1),
    skipAbilityReward: legacyFallback ? false : Boolean(calamity?.skipAbilityReward),
    sealedAbilityCount: legacyFallback ? 0 : number(calamity?.sealedAbilityCount),
    calamity: legacyFallback ? null : calamity,
    victoryEffect: legacyFallback ? null : type.victoryEffect || null,
    enemyHpMultiplier:
      legacyFallback ? 1 : number(type.enemyHpMultiplier, 1) * number(sky.enemyHpMultiplier, 1) * bossSealMultiplier,
    enemyAttackMultiplier:
      legacyFallback ? 1 : number(type.enemyAttackMultiplier, 1) * number(sky.enemyAttackMultiplier, 1) * bossSealMultiplier,
    enemyDefenseMultiplier:
      legacyFallback ? 1 : number(type.enemyDefenseMultiplier, 1) * number(sky.enemyDefenseMultiplier, 1),
    rewardMultiplier:
      legacyFallback ? 1 : number(type.rewardMultiplier, 1) * number(sky.rewardMultiplier, 1) * bossSealMultiplier,
    skyName: legacyFallback ? '旧途回响' : sky.name || '无名劫象',
  };
}

export function getEndlessStarBossMechanisms(run) {
  const seals = run.starMap?.seals || {};
  return [
    number(seals.cause) >= 2 ? '复活' : null,
    number(seals.boundary) >= 2 ? '分身' : null,
    number(seals.defiance) >= 2 ? '斩杀' : null,
    number(seals.slaughter) >= 3 ? '吸血' : null,
  ].filter(Boolean);
}

export function completeEndlessStarNode(run, layer, victory) {
  const node = getSelectedEndlessStarNode(run, layer);
  if (!node) return null;
  node.status = victory ? 'cleared' : 'failed';
  if (victory) {
    const type = ENDLESS_STAR_NODE_TYPES[node.typeId];
    if (type.seal) run.starMap.seals[type.seal] = number(run.starMap.seals[type.seal]) + 1;
    run.starMap.lastClearedWorldId = node.worldId;
    if (run.starMap.consecutiveWorldId === node.worldId)
      run.starMap.consecutiveWorldCount = number(run.starMap.consecutiveWorldCount) + 1;
    else {
      run.starMap.consecutiveWorldId = node.worldId;
      run.starMap.consecutiveWorldCount = 1;
    }
  }
  if (layer % 10 !== 0) {
    const nextRow = run.starMap.rows.find(entry => entry.layer === layer + 1);
    const reachable = new Set(node.nextNodeIds || []);
    for (const next of nextRow?.nodes || [])
      next.status = reachable.has(next.id) ? 'future' : 'blocked';
    run.starMap.selectedNodeId = null;
    run.starMap.suggestions = {};
    const nextOptions = getEndlessStarOptions(run, layer + 1);
    if (nextOptions.length === 1) selectNode(run, 1, false, layer + 1);
  }
  return clone(node);
}

export function getEndlessStarMapView(run) {
  return run.starMap ? clone(run.starMap) : null;
}

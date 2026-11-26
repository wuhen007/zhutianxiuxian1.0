const STAR_MAP_VERSION = 3;

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

export const ENDLESS_NAMELESS_CALAMITIES = Object.freeze([
  Object.freeze({
    id: 'starving_stars',
    name: '不可名状·饥饿群星',
    description: '群星睁开并吞食现实，敌方生命提高35%、攻击提高22%，总奖励提高30%。',
    enemyHpMultiplier: 1.35,
    enemyAttackMultiplier: 1.22,
    rewardMultiplier: 1.3,
  }),
  Object.freeze({
    id: 'forgotten_name',
    name: '不可名状·失名之雾',
    description: '所有称谓都在雾中腐烂，本场随机封禁两项能力，总奖励提高40%。',
    sealedAbilityCount: 2,
    rewardMultiplier: 1.4,
  }),
  Object.freeze({
    id: 'backward_gaze',
    name: '不可名状·逆视之瞳',
    description: '某种目光从未来向此刻凝视，全队献祭22%最大生命，敌方攻击提高35%，总奖励提高45%。',
    entryHpCostPct: 0.22,
    enemyAttackMultiplier: 1.35,
    rewardMultiplier: 1.45,
  }),
]);

export const ENDLESS_STAR_GAMBITS = Object.freeze([
  Object.freeze({
    id: 'steady',
    name: '守成之契',
    description: '不向劫境追加筹码，本层规则保持原状。',
  }),
  Object.freeze({
    id: 'greed',
    name: '逐利之契',
    description: '敌方全属性提高15%，本层总奖励提高25%。',
    enemyHpMultiplier: 1.15,
    enemyAttackMultiplier: 1.15,
    enemyDefenseMultiplier: 1.15,
    rewardMultiplier: 1.25,
  }),
  Object.freeze({
    id: 'blood',
    name: '血筹之契',
    description: '全队入场献祭8%最大生命，本层总奖励提高40%。',
    entryHpCostPct: 0.08,
    rewardMultiplier: 1.4,
  }),
  Object.freeze({
    id: 'shelter',
    name: '避劫之契',
    description: '敌方生命与攻击降低10%，但本层道痕产出降低25%。',
    enemyHpMultiplier: 0.9,
    enemyAttackMultiplier: 0.9,
    tokenMultiplier: 0.75,
  }),
]);

export const ENDLESS_MERCHANT_GOODS = Object.freeze([
  Object.freeze({
    id: 'treasure_temper', name: '天宝锻星砂', basePrice: 120,
    description: '使一件本局装配至宝提升1级，最高Lv.10。',
  }),
  Object.freeze({
    id: 'ability_crystal', name: '道法升华晶', basePrice: 90,
    description: '随机使一项未满级能力提升1级。',
  }),
  Object.freeze({
    id: 'triple_clone', name: '三身映照符', basePrice: 80,
    description: '强化他化自在法，使残缺映照开场由1尊变为3尊。',
  }),
  Object.freeze({
    id: 'skill_replay', name: '回响沙漏', basePrice: 75,
    description: '能力追击有25%概率完整重放，最多叠加至50%。',
  }),
  Object.freeze({
    id: 'healing_elixir', name: '涅槃仙露', basePrice: 45,
    description: '立即恢复50%最大生命。',
  }),
  Object.freeze({
    id: 'attack_elixir', name: '破境战血', basePrice: 65,
    description: '本局基础攻击永久提高18%。',
  }),
]);

export const ENDLESS_STAR_ASSISTS = Object.freeze([
  Object.freeze({ id: 'shi_hao', name: '荒天帝投影', skill: '他化自在·独断万古', rounds: 3, damagePct: 1.05 }),
  Object.freeze({ id: 'great_sage', name: '齐天大圣投影', skill: '如意金箍·大闹天宫', rounds: 4, damagePct: 0.78 }),
  Object.freeze({ id: 'doctor_strange', name: '奇异博士', skill: '镜像维度·时间回环', rounds: 3, damagePct: 0.9 }),
  Object.freeze({ id: 'frieren', name: '芙莉莲', skill: '弑魔魔法·解析齐射', rounds: 4, damagePct: 0.72 }),
  Object.freeze({ id: 'superman', name: '超人投影', skill: '黄太阳·热视线', rounds: 3, damagePct: 0.96 }),
  Object.freeze({ id: 'saitama', name: '埼玉投影', skill: '认真一拳·余波', rounds: 2, damagePct: 1.35 }),
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
  merchant: {
    name: '界海商队', shortName: '商队', symbol: '商', kind: 'event',
    risk: '机缘', stage: 'normal', rewardMultiplier: 0.85,
    enemyHpMultiplier: 0.82, enemyAttackMultiplier: 0.82, enemyDefenseMultiplier: 0.88,
    description: '万界行商在战场边缘开出一次性货架；全队共享道痕，也共享每件孤品的归属。',
    rewardText: '可用未封存道痕购买局内遗物与消耗品', seal: null,
  },
  champion: {
    name: '异界强援', shortName: '强援', symbol: '援', kind: 'event',
    risk: '机缘', stage: 'normal', rewardMultiplier: 0.95,
    enemyHpMultiplier: 1.08, enemyAttackMultiplier: 1.04, enemyDefenseMultiplier: 1,
    description: '一位异界强者响应因果，在战斗最初数回合协同出手。',
    rewardText: '随机强者助战2至4回合', seal: null,
  },
  nameless: {
    name: '不可名状灾厄', shortName: '灾厄', symbol: '祸', kind: 'danger',
    risk: '不可测', stage: 'elite', rewardMultiplier: 1.75,
    enemyHpMultiplier: 1.22, enemyAttackMultiplier: 1.2, enemyDefenseMultiplier: 1.12,
    description: '情报只能确认那里存在“某物”；定途后，它才会从三种禁忌规则中显露真容。',
    rewardText: '灾厄锁定后显形，高风险并追加高额奖励', seal: 'defiance',
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
const STABLE_TYPES = ['conquest', 'conquest', 'relic', 'rift', 'merchant', 'champion'];
const RESONANT_TYPES = ['relic', 'rift', 'mirror', 'merchant', 'champion', 'conquest'];
const DANGER_TYPES = ['prodigy', 'tide', 'altar', 'mirror', 'nameless'];
const NINTH_LAYER_TYPES = ['prodigy', 'tide', 'mirror', 'nameless'];

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
  const random = createRandom((number(run.rngState) ^ hashText(node.id)) >>> 0);
  if (node.typeId === 'nameless') {
    const event = clone(pick(random, ENDLESS_NAMELESS_CALAMITIES));
    event.chance = 1;
    return event;
  }
  if (node.stage === 'boss' || node.layer <= 10 || node.kind === 'event') return null;
  const dangerBonus = node.kind === 'danger' ? 0.1 : node.kind === 'resonant' ? 0.04 : 0;
  const chance = Math.min(
    0.82,
    Math.max(0, (node.layer - 10) * 0.012 + dangerBonus + number(node.decision?.calamityChanceDelta))
  );
  if (random() >= chance) return null;
  const event = clone(pick(random, ENDLESS_STAR_CALAMITIES));
  if (event.id === 'law_burial' && node.layer >= 60) event.sealedAbilityCount = 2;
  event.chance = chance;
  return event;
}

function connectRows(rows, random) {
  for (let rowIndex = 0; rowIndex < rows.length - 1; rowIndex++) {
    const current = rows[rowIndex].nodes;
    const next = rows[rowIndex + 1].nodes;
    for (const [index, node] of current.entries()) {
      const center = current.length === 1
        ? 0
        : Math.round(index * (next.length - 1) / (current.length - 1));
      const linked = new Set([center]);
      if (next.length > 1) {
        const directions = random() < 0.5 ? [-1, 1] : [1, -1];
        for (const direction of directions) {
          const target = center + direction;
          if (target >= 0 && target < next.length) {
            linked.add(target);
            break;
          }
        }
      }
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
  if (slot === 0 && rowOffset === 1) return 'conquest';
  const pool = rowOffset === 9
    ? NINTH_LAYER_TYPES
    : slot === 0
      ? STABLE_TYPES
      : slot === 1
        ? RESONANT_TYPES
        : DANGER_TYPES;
  const available = pool.filter(type =>
    !used.has(type) && !(type === 'merchant' && rowOffset <= 2)
  );
  return pick(random, available.length ? available : pool);
}

function merchantFor(random, cycle) {
  const stock = [...ENDLESS_MERCHANT_GOODS];
  for (let index = stock.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [stock[index], stock[target]] = [stock[target], stock[index]];
  }
  const priceMultiplier = 1 + Math.max(0, cycle - 1) * 0.08;
  return {
    name: pick(random, ['万宝楼·界海分号', '康斯坦丁的神秘摊位', '时空管理局流动仓']),
    currency: '未封存劫境道痕',
    stock: stock.slice(0, 4).map(good => ({
      ...clone(good),
      price: Math.max(1, Math.round(good.basePrice * priceMultiplier)),
      boughtBy: null,
    })),
  };
}

function eventFor(random, typeId, cycle) {
  if (typeId === 'merchant') return { merchant: merchantFor(random, cycle) };
  if (typeId === 'champion') return { assist: clone(pick(random, ENDLESS_STAR_ASSISTS)) };
  return {};
}

function decisionFor(run, node) {
  const votes = Object.values(run.starMap?.suggestions || {});
  const counts = new Map();
  for (const nodeId of votes) counts.set(nodeId, number(counts.get(nodeId)) + 1);
  const selectedVotes = number(counts.get(node.id));
  const highestVotes = Math.max(0, ...counts.values());
  const leaders = [...counts.values()].filter(value => value === highestVotes).length;
  const memberCount = Object.keys(run.members || {}).length;
  if (memberCount > 0 && selectedVotes === memberCount) {
    return {
      id: 'consensus', name: '众意同归',
      description: '全队建议完全一致，灾厄概率降低8%，总奖励提高8%。',
      calamityChanceDelta: -0.08, rewardMultiplier: 1.08,
      selectedVotes, highestVotes,
    };
  }
  if (highestVotes > 0 && leaders === 1 && selectedVotes < highestVotes) {
    return {
      id: 'defy_vote', name: '逆议定轨',
      description: '队长逆转唯一多数意见，灾厄概率提高12%，总奖励提高18%。',
      calamityChanceDelta: 0.12, rewardMultiplier: 1.18,
      selectedVotes, highestVotes,
    };
  }
  return {
    id: selectedVotes > 0 ? 'follow_vote' : 'uncharted',
    name: selectedVotes > 0 ? '顺议定轨' : '独断未知',
    description: selectedVotes > 0
      ? '定轨顺应了队伍建议，风险与收益保持原状。'
      : '没有形成有效多数意见，因果按原始权重结算。',
    calamityChanceDelta: 0, rewardMultiplier: 1,
    selectedVotes, highestVotes,
  };
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
      const gambit = typeId === 'heaven_gate'
        ? null
        : clone(pick(random, ENDLESS_STAR_GAMBITS));
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
        gambit,
        ...eventFor(random, typeId, cycle),
        status: 'future',
      };
    });
    return { layer, offset, nodes };
  });
  connectRows(rows, random);
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

function migrateStarMap(run, previous, next, targetLayer) {
  next.sky = clone(previous.sky || next.sky);
  next.primaryWorldId = previous.primaryWorldId || next.primaryWorldId;
  next.suggestions = clone(previous.suggestions || {});
  next.seals = clone(previous.seals || next.seals);
  next.lastClearedWorldId = previous.lastClearedWorldId || null;
  next.consecutiveWorldId = previous.consecutiveWorldId || null;
  next.consecutiveWorldCount = number(previous.consecutiveWorldCount);

  for (const row of next.rows) {
    const oldRow = previous.rows?.find(entry => entry.layer === row.layer);
    if (!oldRow) continue;
    if (row.layer < targetLayer) {
      row.nodes = clone(oldRow.nodes);
      continue;
    }
    if (row.layer !== targetLayer) continue;
    for (const node of row.nodes) {
      const oldNode = oldRow.nodes?.find(entry => entry.id === node.id);
      if (!oldNode) continue;
      node.status = oldNode.status || node.status;
      if (oldNode.automatic) node.automatic = true;
    }
  }

  const oldSelected = previous.rows
    ?.find(row => row.layer === targetLayer)?.nodes
    ?.find(node => node.id === previous.selectedNodeId);
  const currentRow = next.rows.find(row => row.layer === targetLayer);
  const selectedIndex = currentRow?.nodes.findIndex(node => node.id === oldSelected?.id) ?? -1;
  if (oldSelected && selectedIndex >= 0) {
    const generated = currentRow.nodes[selectedIndex];
    const selected = {
      ...clone(oldSelected),
      gambit: clone(generated.gambit || ENDLESS_STAR_GAMBITS[0]),
    };
    currentRow.nodes[selectedIndex] = selected;
    next.selectedNodeId = oldSelected.id;
    const context = { ...run, starMap: next };
    selected.decision = decisionFor(context, selected);
    if (!Object.hasOwn(selected, 'calamity'))
      selected.calamity = calamityFor(context, selected);
  }
  return next;
}

export function ensureEndlessStarMap(run, worlds, targetLayer = run.layer + 1) {
  const expectedCycle = cycleForLayer(targetLayer);
  if (!run.starMap || run.starMap.cycle !== expectedCycle)
    run.starMap = generateStarMap(run, worlds, targetLayer);
  else if (run.starMap.version !== STAR_MAP_VERSION)
    run.starMap = migrateStarMap(
      run,
      run.starMap,
      generateStarMap(run, worlds, targetLayer),
      targetLayer
    );
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
  node.decision ||= decisionFor(run, node);
  if (!Object.hasOwn(node, 'calamity')) node.calamity = calamityFor(run, node);
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
  const gambit = node.gambit || {};
  const decision = node.decision || {};
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
      : number(type.entryHpCostPct) + number(calamity?.entryHpCostPct) + number(gambit.entryHpCostPct),
    tokenMultiplier: legacyFallback
      ? 1
      : number(calamity?.tokenMultiplier, 1) * number(gambit.tokenMultiplier, 1),
    skipAbilityReward: legacyFallback ? false : Boolean(calamity?.skipAbilityReward),
    sealedAbilityCount: legacyFallback ? 0 : number(calamity?.sealedAbilityCount),
    calamity: legacyFallback ? null : calamity,
    gambit: legacyFallback ? null : node.gambit || null,
    decision: legacyFallback ? null : node.decision || null,
    merchant: legacyFallback ? null : node.merchant || null,
    assist: legacyFallback ? null : node.assist || null,
    victoryEffect: legacyFallback ? null : type.victoryEffect || null,
    enemyHpMultiplier:
      legacyFallback ? 1 : number(type.enemyHpMultiplier, 1) * number(sky.enemyHpMultiplier, 1) * number(calamity?.enemyHpMultiplier, 1) * number(gambit.enemyHpMultiplier, 1) * bossSealMultiplier,
    enemyAttackMultiplier:
      legacyFallback ? 1 : number(type.enemyAttackMultiplier, 1) * number(sky.enemyAttackMultiplier, 1) * number(calamity?.enemyAttackMultiplier, 1) * number(gambit.enemyAttackMultiplier, 1) * bossSealMultiplier,
    enemyDefenseMultiplier:
      legacyFallback ? 1 : number(type.enemyDefenseMultiplier, 1) * number(sky.enemyDefenseMultiplier, 1) * number(calamity?.enemyDefenseMultiplier, 1) * number(gambit.enemyDefenseMultiplier, 1),
    rewardMultiplier:
      legacyFallback ? 1 : number(type.rewardMultiplier, 1) * number(sky.rewardMultiplier, 1) * number(calamity?.rewardMultiplier, 1) * number(gambit.rewardMultiplier, 1) * number(decision.rewardMultiplier, 1) * bossSealMultiplier,
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

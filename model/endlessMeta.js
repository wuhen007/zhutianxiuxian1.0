export const ENDLESS_META_FIELD = '无尽道碑';
export const ENDLESS_META_TOKEN = '劫境道痕';

const BASE_COSTS = Object.freeze([50, 100, 180, 300, 450, 650, 900, 1200, 1550, 1950]);

export const ENDLESS_META_NODES = Object.freeze([
  Object.freeze({ id: 'attack', name: '征伐道痕', aliases: ['攻击', '征伐'], maxRank: 10, costs: BASE_COSTS, description: '每级永久提高1.5%攻击。' }),
  Object.freeze({ id: 'hp', name: '劫体道痕', aliases: ['生命', '劫体'], maxRank: 10, costs: BASE_COSTS, description: '每级永久提高2%生命。' }),
  Object.freeze({ id: 'defense', name: '守御道痕', aliases: ['防御', '守御'], maxRank: 10, costs: BASE_COSTS, description: '每级永久提高2%防御。' }),
  Object.freeze({ id: 'choice', name: '衍算天机', aliases: ['四选一', '选项'], maxRank: 1, costs: [800], gates: [20], description: '每次能力选择由三个增加至四个。' }),
  Object.freeze({ id: 'double', name: '一念双悟', aliases: ['双选', '多选'], maxRank: 1, costs: [1600], gates: [40], description: '每十层循环可额外选择一次能力。' }),
  Object.freeze({ id: 'ghost_domain', name: '鬼域复苏', aliases: ['鬼域', '鬼眼'], maxRank: 4, costs: [300, 800, 1800, 4000], gates: [20, 40, 70, 100], description: '依次解锁六层、七层、八层、九层鬼域。' }),
  Object.freeze({ id: 'ghost_shadow', name: '鬼影', aliases: [], maxRank: 1, costs: [350], gates: [20], puzzle: true, description: '提高生命与减伤，鬼影会替本体削弱致命伤害。' }),
  Object.freeze({ id: 'ghost_cleaver', name: '鬼柴刀', aliases: ['柴刀'], maxRank: 1, costs: [900], gates: [30], puzzle: true, description: '强化攻击与斩杀，周期性沿媒介斩击目标。' }),
  Object.freeze({ id: 'wish_ghost', name: '许愿鬼', aliases: ['许愿'], maxRank: 1, costs: [1200], gates: [40], puzzle: true, description: '以愿债换取恢复、追击与胜后疗愈。' }),
  Object.freeze({ id: 'music_box', name: '八音盒', aliases: ['鬼八音盒'], maxRank: 1, costs: [1400], gates: [50], puzzle: true, description: '循环播放灵异旋律，周期性打断敌方行动。' }),
  Object.freeze({ id: 'coffin_nail', name: '棺材钉', aliases: ['鬼棺材钉'], maxRank: 1, costs: [2500], gates: [60], puzzle: true, description: '每场Boss战可镇压一次复活，并提供护盾与防御。' }),
]);

export const GHOST_PUZZLES = Object.freeze(
  ENDLESS_META_NODES.filter(node => node.puzzle)
);

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeEndlessMeta(value) {
  const source = value?.[ENDLESS_META_FIELD] || value || {};
  const nodes = {};
  for (const node of ENDLESS_META_NODES)
    nodes[node.id] = Math.max(
      0,
      Math.min(node.maxRank, Math.floor(asNumber(source.nodes?.[node.id])))
    );
  const equippedPuzzles = [...new Set(source.equippedPuzzles || [])].filter(
    id => GHOST_PUZZLES.some(puzzle => puzzle.id === id) && nodes[id] > 0
  );
  return {
    version: 1,
    nodes,
    equippedPuzzles,
    spent: Math.max(0, Math.floor(asNumber(source.spent))),
  };
}

export function getEndlessMetaNode(input) {
  const query = String(input || '').trim().toLowerCase();
  return ENDLESS_META_NODES.find(
    node =>
      node.id.toLowerCase() === query ||
      node.name === input ||
      node.aliases.some(alias => alias === input)
  ) || null;
}

export function getGhostPuzzleSlots(highestLayer) {
  const layer = Math.max(0, Math.floor(asNumber(highestLayer)));
  return layer >= 100 ? 3 : layer >= 50 ? 2 : 1;
}

export function getEndlessMetaEffects(value) {
  const meta = normalizeEndlessMeta(value);
  const equipped = new Set(meta.equippedPuzzles);
  return {
    attackPct: meta.nodes.attack * 0.015,
    hpPct: meta.nodes.hp * 0.02,
    defensePct: meta.nodes.defense * 0.02,
    choiceCount: meta.nodes.choice ? 4 : 3,
    doubleChoice: meta.nodes.double > 0,
    ghostDomainLevel: 5 + meta.nodes.ghost_domain,
    equippedPuzzles: [...equipped],
    puzzleEffects: {
      attackPct: equipped.has('ghost_cleaver') ? 0.08 : 0,
      hpPct: equipped.has('ghost_shadow') ? 0.12 : 0,
      defensePct: equipped.has('coffin_nail') ? 0.12 : 0,
      damageReduction: equipped.has('ghost_shadow') ? 0.06 : 0,
      executePct: equipped.has('ghost_cleaver') ? 0.06 : 0,
      regenPct: (equipped.has('wish_ghost') ? 0.012 : 0) + (equipped.has('music_box') ? 0.008 : 0),
      extraActionChance: equipped.has('wish_ghost') ? 0.05 : 0,
      victoryHealPct: equipped.has('wish_ghost') ? 0.05 : 0,
      dodgeChance: equipped.has('music_box') ? 0.04 : 0,
      teamShieldPct: equipped.has('coffin_nail') ? 0.05 : 0,
    },
  };
}

export function getEndlessMetaView(player) {
  const meta = normalizeEndlessMeta(player);
  const highestLayer = Math.max(0, Math.floor(asNumber(player?.无尽劫境最高层)));
  return {
    meta,
    effects: getEndlessMetaEffects(meta),
    balance: Math.max(0, Math.floor(asNumber(player?.[ENDLESS_META_TOKEN]))),
    highestLayer,
    puzzleSlots: getGhostPuzzleSlots(highestLayer),
    nodes: ENDLESS_META_NODES.map(node => {
      const rank = meta.nodes[node.id];
      return {
        ...clone(node),
        rank,
        nextCost: rank < node.maxRank ? node.costs[rank] : null,
        nextGate: rank < node.maxRank ? asNumber(node.gates?.[rank]) : 0,
      };
    }),
  };
}

export function upgradeEndlessMeta(player, input) {
  const node = getEndlessMetaNode(input);
  if (!node) throw new Error('未找到这条道碑传承');
  const meta = normalizeEndlessMeta(player);
  const rank = meta.nodes[node.id];
  if (rank >= node.maxRank) throw new Error(`${node.name}已经参悟圆满`);
  const highestLayer = Math.max(0, Math.floor(asNumber(player?.无尽劫境最高层)));
  const gate = asNumber(node.gates?.[rank]);
  if (highestLayer < gate)
    throw new Error(`${node.name}第${rank + 1}级需要最高通过${gate}层`);
  const cost = node.costs[rank];
  const balance = Math.max(0, Math.floor(asNumber(player?.[ENDLESS_META_TOKEN])));
  if (balance < cost)
    throw new Error(`参悟${node.name}需要${cost}${ENDLESS_META_TOKEN}，当前${balance}`);
  meta.nodes[node.id] = rank + 1;
  meta.spent += cost;
  player[ENDLESS_META_TOKEN] = balance - cost;
  player[ENDLESS_META_FIELD] = meta;
  return {
    node: clone(node),
    rank: rank + 1,
    cost,
    balance: player[ENDLESS_META_TOKEN],
    meta: clone(meta),
  };
}

export function toggleEndlessPuzzle(player, input) {
  const node = getEndlessMetaNode(input);
  if (!node?.puzzle) throw new Error('未找到这块厉鬼拼图');
  const meta = normalizeEndlessMeta(player);
  if (!meta.nodes[node.id]) throw new Error(`尚未参悟【${node.name}】`);
  const index = meta.equippedPuzzles.indexOf(node.id);
  let equipped;
  if (index >= 0) {
    meta.equippedPuzzles.splice(index, 1);
    equipped = false;
  } else {
    const slots = getGhostPuzzleSlots(player?.无尽劫境最高层);
    if (meta.equippedPuzzles.length >= slots)
      throw new Error(`厉鬼拼图槽已满（${slots}/${slots}）`);
    meta.equippedPuzzles.push(node.id);
    equipped = true;
  }
  player[ENDLESS_META_FIELD] = meta;
  return { node: clone(node), equipped, meta: clone(meta) };
}

export function resetEndlessMeta(player) {
  const meta = normalizeEndlessMeta(player);
  const refund = Math.floor(meta.spent * 0.9);
  player[ENDLESS_META_TOKEN] =
    Math.max(0, Math.floor(asNumber(player?.[ENDLESS_META_TOKEN]))) + refund;
  player[ENDLESS_META_FIELD] = normalizeEndlessMeta({});
  return { refund, balance: player[ENDLESS_META_TOKEN] };
}

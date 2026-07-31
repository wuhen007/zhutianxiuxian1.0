import { SOURCE_STONE_FORMS, drawSourceStoneForms } from './sourceStoneForms.js';

export const SOURCE_DUEL_STATE_TTL_SECONDS = 5 * 60;
export const SOURCE_DUEL_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export const SOURCE_DUEL_STAKE_MODES = {
  平注: { multiplier: 1 },
  加注: { multiplier: 2 },
  豪赌: { multiplier: 3 },
};

export const SOURCE_DUEL_NPCS = [
  {
    id: 1,
    name: '吴子明',
    title: '神城赌徒',
    wager: 200000,
    stoneFee: 200000,
    skill: 0.12,
    opening: '我在石坊混迹多年，还怕你一个生面孔？',
  },
  {
    id: 2,
    name: '拓跋昌',
    title: '源术世家奇才',
    wager: 1000000,
    stoneFee: 1000000,
    skill: 0.58,
    opening: '源术并非儿戏，今日便以三石定高下。',
  },
  {
    id: 3,
    name: '南宫奇',
    title: '源术宗师',
    wager: 5000000,
    stoneFee: 5000000,
    skill: 0.92,
    opening: '天字号石园内，一步看错，便是千万斤源。',
  },
];

export { SOURCE_STONE_FORMS as SOURCE_DUEL_STONE_FORMS };

export const SOURCE_DUEL_RESONANCES = [
  { name: '日月同辉', stones: ['烈阳石', '月亮石'], multiplier: 1.25 },
  { name: '龙脉共振', stones: ['龙纹石', '龙首石'], multiplier: 1.2 },
  { name: '水火同炉', stones: ['寒髓石', '火云石'], multiplier: 1.18 },
  { name: '玄白抱一', stones: ['黑玉石', '白玉龟'], multiplier: 1.15 },
  { name: '紫气星河', stones: ['紫霞石', '星辰石'], multiplier: 1.2 },
];

const OUTCOMES = [
  {
    name: '空石',
    multiplier: 0,
    maxRoll: 0.3,
    clues: ['敲击声发散，石心似有空腔', '源气贴近石皮便悄然消散'],
  },
  {
    name: '杂源',
    multiplier: 0.5,
    maxRoll: 0.6,
    clues: ['裂隙中凝有零星白霜', '石皮下有微弱源气，驳杂不纯'],
  },
  {
    name: '纯净源',
    multiplier: 1,
    maxRoll: 0.82,
    clues: ['纹理向石心收束，隐成聚源之势', '触手温润，源气绵长而平稳'],
  },
  {
    name: '异种源',
    multiplier: 2,
    maxRoll: 0.94,
    clues: ['石皮深处闪过异色霞光', '源气中夹杂陌生而强盛的道韵'],
  },
  {
    name: '神源',
    multiplier: 4,
    maxRoll: 0.99,
    clues: ['石心似有神曦沉浮，靠近时气血共鸣', '细小纹路自行明灭，隐约交织天地道则'],
  },
  {
    name: '绝世奇源',
    multiplier: 10,
    maxRoll: 1,
    clues: ['天机被石皮遮蔽，观之竟令神识刺痛', '石中传来若有若无的生命律动'],
  },
];

const INSIGHT_TEXT = [
  '源纹枯寂，十有八九为空',
  '仅有驳杂源气，不似重宝',
  '源气内敛，应有纯净源凝结',
  '异色道韵流转，可能蕴有异种源',
  '神性精气不散，石心很不寻常',
  '天机混沌难明，此石可能藏有绝世奇源',
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomIndex(length, random) {
  return Math.min(length - 1, Math.floor(random() * length));
}

function getInsightAccuracy(player) {
  const baseAccuracy = {
    源师: 0.72,
    源地师: 0.84,
    源天师: 0.94,
  }[player?.occupation];
  if (!baseAccuracy) return 0;
  const levelBonus = Math.min(0.05, Math.max(0, Number(player.occupation_level) - 1) * 0.001);
  return Math.min(0.95, baseAccuracy + levelBonus);
}

function getInsight(tier, player, random) {
  const accuracy = getInsightAccuracy(player);
  if (!accuracy) return '';
  let estimatedTier = tier;
  if (random() >= accuracy) {
    const distance = random() < 0.8 ? 1 : 2;
    estimatedTier = clamp(tier + (random() < 0.5 ? -distance : distance), 0, OUTCOMES.length - 1);
  }
  return `源术判断：${INSIGHT_TEXT[estimatedTier]}`;
}

function drawOutcome(form, baseValue, player, random) {
  const roll = clamp(random() + form.bias, 0, 0.999999);
  const tier = OUTCOMES.findIndex(outcome => roll < outcome.maxRoll);
  const outcome = OUTCOMES[tier];
  let signalTier = tier;
  if (random() >= 0.55) {
    signalTier = clamp(tier + (random() < 0.5 ? -1 : 1), 0, OUTCOMES.length - 1);
  }
  const cluePool = OUTCOMES[signalTier].clues;
  return {
    outcomeName: outcome.name,
    outcomeTier: tier,
    signalTier,
    clue: cluePool[randomIndex(cluePool.length, random)],
    insight: getInsight(tier, player, random),
    sourceValue: Math.floor(baseValue * outcome.multiplier),
  };
}

function generateStoneBatch(npc, player, random) {
  const baseValue = npc.stoneFee / 5;
  return drawSourceStoneForms(5, random).map((form, index) => ({
    id: index + 1,
    name: form.name,
    appearance: form.appearance,
    ...drawOutcome(form, baseValue, player, random),
  }));
}

export function getSourceDuelResonance(stones) {
  const names = new Set(stones.map(stone => stone.name));
  return SOURCE_DUEL_RESONANCES.find(resonance =>
    resonance.stones.every(name => names.has(name))
  ) || null;
}

function evaluateCut(stones) {
  const baseSource = stones.reduce((sum, stone) => sum + stone.sourceValue, 0);
  const resonance = getSourceDuelResonance(stones);
  return {
    stones,
    baseSource,
    source: Math.floor(baseSource * (resonance?.multiplier || 1)),
    resonance,
  };
}

function getThreeStoneChoices(stones) {
  const choices = [];
  for (let first = 0; first < stones.length - 2; first++) {
    for (let second = first + 1; second < stones.length - 1; second++) {
      for (let third = second + 1; third < stones.length; third++) {
        choices.push([stones[first], stones[second], stones[third]]);
      }
    }
  }
  return choices;
}

function selectNpcStones(npc, stones, random) {
  const perceivedScores = new Map(stones.map(stone => [
    stone.id,
    random() < npc.skill
      ? stone.outcomeTier + random() * 0.49
      : random() * OUTCOMES.length,
  ]));
  return getThreeStoneChoices(stones)
    .map(choice => ({
      choice,
      score: choice.reduce((sum, stone) => sum + perceivedScores.get(stone.id), 0) *
        (getSourceDuelResonance(choice)?.multiplier || 1),
      tieBreaker: random(),
    }))
    .sort((a, b) => b.score - a.score || b.tieBreaker - a.tieBreaker)[0]?.choice || [];
}

function getStakeMode(name = '平注') {
  const mode = SOURCE_DUEL_STAKE_MODES[name];
  if (!mode) throw new Error('押注方式只能选择平注、加注或豪赌');
  return { name, ...mode };
}

export function getSourceDuelNpc(id) {
  return SOURCE_DUEL_NPCS.find(npc => npc.id === Number(id));
}

export function createSourceDuelSession(npcId, player, options = {}) {
  const npc = getSourceDuelNpc(npcId);
  if (!npc) throw new Error('未知的源术对决NPC');
  const random = options.random || Math.random;
  return {
    version: 1,
    npcId: npc.id,
    createdAt: options.now ?? Date.now(),
    stoneFeePaid: true,
    playerStones: generateStoneBatch(npc, player, random),
    npcStones: generateStoneBatch(npc, null, random),
  };
}

export function calculateSourceDuelSettlement(npc, result, playerSource, npcSource, stakeModeName = '平注') {
  const stakeMode = getStakeMode(stakeModeName);
  const wager = npc.wager * stakeMode.multiplier;
  const cost = npc.stoneFee + wager;
  let credit = 0;
  if (result === 'win') credit = wager * 2 + playerSource + npcSource;
  if (result === 'draw') credit = wager + playerSource;
  return { cost, amountDue: wager, credit, net: credit - cost };
}

export function resolveSourceDuel(session, choices, options = {}) {
  const npc = getSourceDuelNpc(session?.npcId);
  if (
    !npc ||
    session?.stoneFeePaid !== true ||
    !Array.isArray(session?.playerStones) ||
    !Array.isArray(session?.npcStones)
  ) {
    throw new Error('源术对决状态已经损坏');
  }

  const selectedIds = choices.map(Number);
  if (
    selectedIds.length !== 3 ||
    new Set(selectedIds).size !== 3 ||
    selectedIds.some(id => !Number.isInteger(id) || id < 1 || id > 5)
  ) {
    throw new Error('请选择三块不同的源石');
  }

  const random = options.random || Math.random;
  const playerCuts = selectedIds.map(id => session.playerStones.find(stone => stone.id === id));
  const npcCuts = selectNpcStones(npc, session.npcStones, random);
  if (
    playerCuts.some(stone => !stone || !Number.isFinite(stone.sourceValue)) ||
    npcCuts.length !== 3 ||
    npcCuts.some(stone => !stone || !Number.isFinite(stone.sourceValue))
  ) {
    throw new Error('源术对决石池数据已经损坏');
  }
  const playerCut = evaluateCut(playerCuts);
  const npcCut = evaluateCut(npcCuts);
  const playerSource = playerCut.source;
  const npcSource = npcCut.source;
  const result = playerSource > npcSource ? 'win' : playerSource < npcSource ? 'lose' : 'draw';
  const stakeMode = getStakeMode(options.stakeMode);

  return {
    npc,
    result,
    playerCuts,
    npcCuts,
    playerBaseSource: playerCut.baseSource,
    npcBaseSource: npcCut.baseSource,
    playerResonance: playerCut.resonance,
    npcResonance: npcCut.resonance,
    playerSource,
    npcSource,
    stakeMode: stakeMode.name,
    settlement: calculateSourceDuelSettlement(npc, result, playerSource, npcSource, stakeMode.name),
  };
}

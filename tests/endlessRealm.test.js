import assert from 'node:assert/strict';
import {
  applyCheckpointChoice,
  applyEndlessChoice,
  createEndlessEnemy,
  createEndlessRun,
  detectFusions,
  getEndlessAbilitySelfDamageRate,
  getEndlessContent,
  getEndlessLayerCurrencyReward,
  getEndlessSweepReward,
  getCheckpointBoon,
  getMemberStats,
  getSettlement,
  getWorldForLayer,
  resolveEndlessLayer,
} from '../model/endlessRealm.js';

function player(name, level = 20) {
  return {
    名号: name,
    level_id: level,
    Physique_id: level,
    mijinglevel_id: 0,
    xiangulevel_id: 0,
  };
}

function createTwoPlayerRun(seed = 123456) {
  return createEndlessRun({
    teamId: '123456',
    groupId: 'test-group',
    seed,
    players: [
      { id: '10001', player: player('甲') },
      { id: '10002', player: player('乙') },
    ],
  });
}

function createOnePlayerRun(seed = 123456) {
  return createEndlessRun({
    teamId: '654321',
    groupId: 'test-group',
    seed,
    players: [{ id: '10001', player: player('甲') }],
  });
}

function chooseFirstForEveryone(run) {
  for (const id of Object.keys(run.pendingChoices))
    applyEndlessChoice(run, id, 1);
}

function grantGhostPath(member, domainLevel, equippedPuzzles = []) {
  member.abilities = { neutral_ghost_eye: 1 };
  member.endlessMetaEffects = {
    choiceCount: 3,
    doubleChoice: false,
    ghostDomainLevel: domainLevel,
    equippedPuzzles,
    puzzleEffects: {},
  };
}

function createGhostResonanceBattle(seed, domainLevel, equippedPuzzles, attack = 1) {
  const run = createOnePlayerRun(seed);
  chooseFirstForEveryone(run);
  const member = run.members['10001'];
  grantGhostPath(member, domainLevel, equippedPuzzles);
  member.base.attack = attack;
  member.base.hp = 1_000_000_000;
  member.base.defense = 1_000_000_000;
  return resolveEndlessLayer(run);
}

for (const [domainLevel, puzzles, expectedPct] of [
  [5, ['ghost_shadow'], 0.15],
  [6, ['ghost_shadow', 'ghost_hand', 'ghost_cleaver'], 0.25],
  [7, ['ghost_shadow', 'ghost_hand', 'ghost_cleaver', 'music_box', 'wish_ghost'], 0.45],
  [8, ['ghost_shadow', 'ghost_hand', 'ghost_cleaver', 'music_box', 'wish_ghost'], 0.45],
  [9, ['ghost_shadow', 'ghost_hand', 'ghost_cleaver', 'music_box', 'wish_ghost'], 0.45],
]) {
  const run = createOnePlayerRun(60000 + domainLevel);
  const member = run.members['10001'];
  member.base = { attack: 1000, hp: 1000, defense: 1000, speed: 100 };
  grantGhostPath(member, domainLevel, puzzles);
  const stats = getMemberStats(run, member.id);
  assert.equal(stats.attack, Math.round(1000 * (1 + expectedPct)));
  assert.equal(stats.maxHp, Math.round(1000 * (1 + expectedPct)));
  assert.equal(stats.defense, Math.round(1000 * (1 + expectedPct)));
}

const content = getEndlessContent();
assert.equal(content.worlds.length, 6);
assert.equal(content.abilities.length, 36);
assert.equal(content.fusions.length, 10);
assert.equal(content.checkpointBoons.length, 20);
assert.equal(content.freeTransformationHeroes.length, 12);
assert.equal(
  new Set(content.checkpointBoons.map(boon => boon.id)).size,
  content.checkpointBoons.length
);
assert.equal(
  new Set(content.abilities.map((ability) => ability.id)).size,
  content.abilities.length
);
for (const id of [
  'anime_one_cut_shura',
  'anime_one_cut_rakshasa',
  'anime_devil_fruit',
  'anime_rasengan',
  'anime_shadow_clone',
  'anime_ultra_instinct',
  'anime_void_tears',
  'anime_pure_yang_flame',
  'neutral_ghost_eye',
  'neutral_spring_autumn_cicada',
  'zhetian_six_paths_reincarnation_fist',
  'anime_decade_driver',
  'anime_fiery_eyes',
  'anime_shura_armor',
  'multi_spider_gene',
]) {
  assert.ok(content.abilities.some((ability) => ability.id === id));
}
assert.equal(
  content.abilities.find((ability) => ability.id === 'zhetian_healer_secret')
    .choiceWeight,
  0.22
);
for (const world of content.worlds) {
  assert.ok(world.normal.length && world.elite.length && world.boss.length);
}
assert.ok(content.worlds.some(world => world.normal.some(enemy => enemy.trait === '蚀痕')));
assert.ok(content.worlds.some(world => world.normal.some(enemy => enemy.trait === '封法')));
const abilityIds = new Set(content.abilities.map((ability) => ability.id));
for (const ability of content.abilities) {
  for (const requiredId of Object.keys(ability.requires || {}))
    assert.ok(abilityIds.has(requiredId));
}
for (const fusion of content.fusions) {
  assert.ok(fusion.requires.every((abilityId) => abilityIds.has(abilityId)));
}
for (const name of [
  '如意金箍棒',
  '誓约胜利之剑',
  '魔刀千刃',
  '美队盾牌·振金圆盾',
  '钢铁侠·纳米战甲',
  '八九玄功',
  '无量空处',
  '逆天七魔刀',
  '生死意境',
  '一气化三清',
  '天帝拳',
]) {
  assert.ok(content.checkpointBoons.some(boon => boon.name === name));
}
assert.ok(!content.abilities.some((ability) => ability.name === '天帝拳'));
const freeTransformation = content.abilities.find(
  ability => ability.id === 'perfect_free_transformation'
);
assert.equal(freeTransformation.bossOnly, true);
assert.equal(freeTransformation.proc, undefined);
const freeTransformationBoon = content.checkpointBoons.find(
  boon => boon.id === 'art_free_transformation'
);
assert.equal(freeTransformationBoon.grantsAbility, 'perfect_free_transformation');
assert.equal(freeTransformationBoon.choiceWeight, 0.03);

for (let seed = 1; seed <= 20; seed++) {
  const choiceRun = createOnePlayerRun(seed);
  assert.ok(
    Object.values(choiceRun.pendingChoices).flat().every(
      abilityId => abilityId !== 'perfect_free_transformation'
    )
  );
}

const metaChoiceRun = createEndlessRun({
  teamId: 'meta-choice',
  groupId: 'test-group',
  seed: 20260805,
  players: [{
    id: '10001',
    player: {
      ...player('道碑修士'),
      无尽道碑: {
        nodes: { choice: 1, double: 1 },
        equippedPuzzles: [],
      },
    },
  }],
});
const initialMetaChoices = [...metaChoiceRun.pendingChoices['10001']];
assert.equal(initialMetaChoices.length, 4);
assert.equal(applyEndlessChoice(metaChoiceRun, '10001', 1).extraChoice, true);
assert.equal(metaChoiceRun.pendingChoices['10001'].length, 3);
assert.equal(applyEndlessChoice(metaChoiceRun, '10001', 1).extraChoice, false);
assert.equal(metaChoiceRun.phase, 'ready');
metaChoiceRun.phase = 'choice';
metaChoiceRun.pendingChoiceLayer = 2;
metaChoiceRun.pendingChoices = { '10001': initialMetaChoices.slice(2) };
assert.equal(applyEndlessChoice(metaChoiceRun, '10001', 1).extraChoice, false);
assert.equal(metaChoiceRun.phase, 'ready');

const soloScaleRun = createOnePlayerRun(314159);
const teamScaleRun = createTwoPlayerRun(314159);
soloScaleRun.rngState = 271828;
teamScaleRun.rngState = 271828;
teamScaleRun.worldOrder = [...soloScaleRun.worldOrder];
const soloEnemy = createEndlessEnemy(soloScaleRun, 1);
const teamEnemy = createEndlessEnemy(teamScaleRun, 1);
assert.equal(soloEnemy.teamScale, 1);
assert.equal(teamEnemy.teamScale, 1.27); // 队伍缩放 1+(人数-1)×0.27
assert.equal(teamEnemy.unitName, soloEnemy.unitName);
assert.equal(teamEnemy.unitMaxHp, Math.round(soloEnemy.unitMaxHp * 1.27));
assert.equal(teamEnemy.attack, Math.round(soloEnemy.attack * 1.27));
assert.equal(teamEnemy.defense, Math.round(soloEnemy.defense * 1.27));

for (const [layer, expectedCount] of [[11, 2], [21, 3]]) {
  const waveRun = createOnePlayerRun(20260803);
  const wave = createEndlessEnemy(waveRun, layer);
  assert.equal(wave.stage, 'normal');
  assert.equal(wave.monsterCount, expectedCount);
  assert.equal(wave.maxHp, wave.unitMaxHp * expectedCount);
}

for (const [layer, expectedCount] of [[10, 1], [20, 2], [30, 4], [40, 8]]) {
  const boss = createEndlessEnemy(createOnePlayerRun(20260804), layer);
  assert.equal(boss.stage, 'boss');
  assert.equal(boss.monsterCount, expectedCount);
  assert.equal(
    boss.bossRoster.reduce((sum, entry) => sum + entry.count, 0),
    expectedCount
  );
  assert.ok(boss.mechanisms.includes('连击'));
  if (expectedCount > 1) assert.ok(boss.bossRoster.length > 1);
}

const calamityBoss = createEndlessEnemy(createOnePlayerRun(100100), 100);
assert.deepEqual(
  new Set(calamityBoss.mechanisms),
  new Set(['回血', '复活', '禁疗', '破盾', '斩杀', '连击', '分身', '吸血', '沉默', '护盾'])
);
assert.equal(calamityBoss.monsterCount, 512);
assert.ok(calamityBoss.maxShield > 0);

const bossPackRun = createOnePlayerRun(88220);
chooseFirstForEveryone(bossPackRun);
bossPackRun.layer = 19;
bossPackRun.members['10001'].base.attack = 1;
bossPackRun.members['10001'].base.hp = 1_000_000_000;
bossPackRun.members['10001'].base.defense = 1_000_000_000;
const bossPackBattle = resolveEndlessLayer(bossPackRun);
const bossPackActions = bossPackBattle.roundDetails.flatMap(
  round => round.actions
);
assert.equal(bossPackBattle.enemyCount, 2);
assert.ok(bossPackActions.some(action => action.skill.startsWith('诸王联击')));
assert.ok(bossPackActions.some(action => action.skill.startsWith('Boss连击')));

const fullMechanicRun = createOnePlayerRun(66100);
chooseFirstForEveryone(fullMechanicRun);
fullMechanicRun.layer = 99;
fullMechanicRun.members['10001'].abilities = {
  zhetian_healer_secret: 1,
  saintking_pure_land: 1,
};
const fullMechanicProbe = createEndlessEnemy(
  structuredClone(fullMechanicRun),
  100
);
fullMechanicRun.members['10001'].base.attack = fullMechanicProbe.maxHp * 0.2;
fullMechanicRun.members['10001'].base.hp = 1e20;
fullMechanicRun.members['10001'].base.defense = 0;
const fullMechanicBattle = resolveEndlessLayer(fullMechanicRun);
const fullMechanicActions = fullMechanicBattle.roundDetails.flatMap(
  round => round.actions
);
assert.equal(fullMechanicBattle.victory, true);
assert.equal(fullMechanicBattle.summary.bossRevive, 1);
assert.ok(
  fullMechanicActions.some(
    action => action.side === 'player' && action.absorbed > 0
  )
);
assert.ok(
  fullMechanicActions.some(action => action.skill === '不灭道印·复生')
);
for (const skill of [
  '万劫回春',
  '破界碎盾',
  '天命斩杀',
  'Boss连击·第1击',
  '万象分身',
  '吞天噬血',
  '大道沉寂',
  '诸天庇护',
]) {
  assert.ok(fullMechanicActions.some(action => action.skill === skill), skill);
}
assert.ok(
  fullMechanicActions.some(
    action => action.skill === '者字秘·回天' && /禁疗/.test(action.note)
  )
);

const packCombatRun = createOnePlayerRun(808080);
chooseFirstForEveryone(packCombatRun);
packCombatRun.layer = 10;
packCombatRun.members['10001'].base.attack = 1;
packCombatRun.members['10001'].base.hp = 1_000_000_000;
packCombatRun.members['10001'].base.defense = 1_000_000_000;
const packCombat = resolveEndlessLayer(packCombatRun);
assert.equal(packCombat.enemyCount, 2);
assert.ok(
  packCombat.roundDetails
    .flatMap((round) => round.actions)
    .some((action) => action.skill.startsWith('怪潮围猎'))
);

assert.deepEqual(getEndlessLayerCurrencyReward(1), {
  stage: 'normal',
  lingshi: 309_000_000,
  sourceStone: 640_000,
  tokens: 33,
});
const sweepReward = getEndlessSweepReward(player('扫荡者', 20), 27, () => 0.5);
assert.equal(sweepReward.startLayer, 18);
assert.equal(sweepReward.endLayer, 27);
assert.equal(sweepReward.layers, 10);
assert.equal(
  sweepReward.lingshi,
  Array.from({ length: 10 }, (_, index) =>
    getEndlessLayerCurrencyReward(18 + index).lingshi
  ).reduce((sum, value) => sum + value, 0)
);
assert.ok(sweepReward.cultivation > 0 && sweepReward.blood > 0);

const progressionRun = createTwoPlayerRun(11223);
progressionRun.pendingChoices['10001'] = ['anime_one_cut_rakshasa'];
assert.throws(
  () => applyEndlessChoice(progressionRun, '10001', 1),
  /进阶条件/
);
progressionRun.members['10001'].abilities.anime_one_cut_shura = 2;
const advancement = applyEndlessChoice(progressionRun, '10001', 1);
assert.equal(advancement.ability.name, '一刀罗刹');

const recoilRun = createTwoPlayerRun(224466);
const recoilMember = recoilRun.members['10001'];
recoilMember.abilities = { anime_one_cut_shura: 1 };
assert.equal(
  getEndlessAbilitySelfDamageRate(
    recoilRun,
    recoilMember.id,
    'anime_one_cut_shura'
  ),
  0.07
);
recoilMember.abilities.anime_one_cut_shura = 2;
assert.ok(
  Math.abs(
    getEndlessAbilitySelfDamageRate(
      recoilRun,
      recoilMember.id,
      'anime_one_cut_shura'
    ) - 0.055
  ) < 1e-10
);
recoilMember.abilities.anime_one_cut_shura = 3;
assert.ok(
  Math.abs(
    getEndlessAbilitySelfDamageRate(
      recoilRun,
      recoilMember.id,
      'anime_one_cut_shura'
    ) - 0.04
  ) < 1e-10
);
recoilMember.abilities.anime_one_cut_rakshasa = 3;
assert.ok(
  Math.abs(
    getEndlessAbilitySelfDamageRate(
      recoilRun,
      recoilMember.id,
      'anime_one_cut_rakshasa'
    ) - 0.04
  ) < 1e-10
);
recoilMember.abilities.anime_ultra_instinct = 1;
recoilRun.fusions = detectFusions(recoilRun);
assert.ok(recoilRun.fusions.includes('fusion_rakshasa_instinct'));
assert.ok(
  Math.abs(
    getEndlessAbilitySelfDamageRate(
      recoilRun,
      recoilMember.id,
      'anime_one_cut_rakshasa'
    ) - 0.014
  ) < 1e-10
);

const newAbilityStatsRun = createOnePlayerRun(357911);
newAbilityStatsRun.members['10001'].abilities = {
  neutral_spring_autumn_cicada: 3,
  anime_decade_driver: 3,
};
const newAbilityStats = getMemberStats(newAbilityStatsRun, '10001');
assert.ok(Math.abs(newAbilityStats.timeRewindChance - 0.36) < 1e-10);
assert.ok(Math.abs(newAbilityStats.timeRewindHealPct - 0.45) < 1e-10);
assert.ok(Math.abs(newAbilityStats.riderKickChance - 0.24) < 1e-10);

const recoilLogRun = createOnePlayerRun(998877);
chooseFirstForEveryone(recoilLogRun);
recoilLogRun.members['10001'].abilities = { anime_one_cut_shura: 3 };
recoilLogRun.members['10001'].base.attack = 1;
recoilLogRun.members['10001'].base.hp = 1_000_000;
recoilLogRun.members['10001'].base.defense = 1_000_000;
const recoilLogBattle = resolveEndlessLayer(recoilLogRun);
const recoilAction = recoilLogBattle.roundDetails
  .flatMap((round) => round.actions)
  .find((action) => action.skill === '一刀修罗反噬');
assert.equal(recoilAction?.damage, 40_000);
assert.equal(recoilAction?.note, '当前反噬率4.0%');

const run = createTwoPlayerRun();
assert.equal(run.phase, 'choice');
assert.equal(Object.keys(run.pendingChoices).length, 2);
assert.equal(new Set(run.pendingChoices['10001']).size, 3);
assert.ok(getWorldForLayer(run, 1));

chooseFirstForEveryone(run);
assert.equal(run.phase, 'ready');
const battle = resolveEndlessLayer(run);
assert.equal(run.layer, 1);
assert.equal(run.highestClearedLayer, 1);
assert.equal(battle.victory, true);
assert.equal(run.phase, 'choice');
assert.equal(run.unbanked.lingshi, 309_000_000);
assert.equal(run.unbanked.sourceStone, 640_000);
assert.equal(run.unbanked.tokens, 33);
assert.deepEqual(battle.layerReward.members['10001'], {
  cultivation: 20_000,
  blood: 20_000,
});
assert.equal(battle.roundDetails.length, battle.rounds);
assert.equal(
  battle.roundDetails.at(-1).enemyHp,
  battle.enemyRemainingHp
);
assert.ok(
  battle.roundDetails.every(
    (round) =>
      Array.isArray(round.attacks) &&
      Array.isArray(round.actions) &&
      Array.isArray(round.members) &&
      Array.isArray(round.events)
  )
);
assert.ok(
  battle.roundDetails.flatMap((round) => round.actions).some(
    (action) =>
      action.side === 'player' &&
      action.skill === '普通攻击' &&
      action.damage > 0
  )
);

const skillLogRun = createTwoPlayerRun(24680);
chooseFirstForEveryone(skillLogRun);
skillLogRun.members['10001'].abilities = { perfect_thunder_emperor: 1 };
for (const member of Object.values(skillLogRun.members)) member.base.attack = 1;
const skillLogBattle = resolveEndlessLayer(skillLogRun);
const thunderAction = skillLogBattle.roundDetails
  .flatMap((round) => round.actions)
  .find((action) => action.skill === '雷帝宝术' && action.damage > 0);
assert.equal(thunderAction.verb, '引动');
assert.match(thunderAction.narration, /九天雷罚/);

const summonLogRun = createTwoPlayerRun(13579);
chooseFirstForEveryone(summonLogRun);
summonLogRun.members['10001'].abilities = { anime_shadow_monarch: 1 };
const summonLogBattle = resolveEndlessLayer(summonLogRun);
const summonAction = summonLogBattle.roundDetails
  .flatMap((round) => round.actions)
  .find((action) => action.kind === 'summon' && action.actor === '甲');
assert.equal(summonAction.verb, '召唤');
assert.equal(summonAction.skill, '暗影之手·协同攻击');
assert.match(summonAction.narration, /漆黑巨手.*夹击/);
assert.ok(summonAction.damage > 0);
assert.ok(summonLogBattle.logs.some(text => /召唤暗影之手协同攻击/.test(text)));

const incompleteFreeRun = createOnePlayerRun(55667);
chooseFirstForEveryone(incompleteFreeRun);
incompleteFreeRun.members['10001'].abilities = {
  perfect_free_transformation: 1,
};
incompleteFreeRun.members['10001'].base.attack = 1;
incompleteFreeRun.members['10001'].base.hp = 10_000_000;
incompleteFreeRun.members['10001'].base.defense = 10_000_000;
const incompleteFreeBattle = resolveEndlessLayer(incompleteFreeRun);
const incompleteFreeActions = incompleteFreeBattle.roundDetails.flatMap(
  round => round.actions
);
assert.ok(
  incompleteFreeActions.some(
    action => action.skill === '他化自在法·残缺映照'
  )
);
assert.ok(
  incompleteFreeActions.some(action => action.skill === '他化自在身·代劫')
);
assert.ok(
  incompleteFreeBattle.roundDetails.every(round =>
    round.members.every(member => member.freeBodies.length <= 1)
  )
);
assert.ok(
  incompleteFreeBattle.roundDetails.some(round =>
    round.members.some(member => member.freeBodies.length === 1)
  )
);

const emperorFreeRun = createOnePlayerRun(55668);
chooseFirstForEveryone(emperorFreeRun);
emperorFreeRun.members['10001'].abilities = {
  perfect_free_transformation: 2,
};
emperorFreeRun.members['10001'].base.attack = 1;
emperorFreeRun.members['10001'].base.hp = 10_000_000;
emperorFreeRun.members['10001'].base.defense = 10_000_000;
const emperorFreeBattle = resolveEndlessLayer(emperorFreeRun);
assert.equal(emperorFreeBattle.summary.freeBodiesSummoned, 2);
assert.ok(
  emperorFreeBattle.roundDetails.some(
    round => round.members[0].freeBodies.length === 2
  )
);
assert.ok(
  emperorFreeBattle.roundDetails.every(
    round => round.members[0].freeBodies.length <= 2
  )
);

const sacrificeFreeRun = createOnePlayerRun(55669);
chooseFirstForEveryone(sacrificeFreeRun);
sacrificeFreeRun.members['10001'].abilities = {
  perfect_free_transformation: 3,
};
sacrificeFreeRun.members['10001'].base.attack = 1;
sacrificeFreeRun.members['10001'].base.hp = 10_000_000;
sacrificeFreeRun.members['10001'].base.defense = 10_000_000;
const sacrificeFreeBattle = resolveEndlessLayer(sacrificeFreeRun);
const sacrificeActions = sacrificeFreeBattle.roundDetails.flatMap(
  round => round.actions
);
assert.equal(
  sacrificeActions.filter(action => action.skill === '他化自在法·祭道映照')
    .length >= 2,
  true
);
assert.equal(sacrificeFreeBattle.summary.freeBodiesSummoned, 4);
assert.ok(
  sacrificeFreeBattle.roundDetails.some(
    round => round.members[0].freeBodies.length === 4
  )
);

let futureSelfAction = null;
let foreignHeroAction = null;
for (let seed = 1; seed <= 30 && (!futureSelfAction || !foreignHeroAction); seed++) {
  const freeRun = createOnePlayerRun(60000 + seed);
  chooseFirstForEveryone(freeRun);
  freeRun.members['10001'].abilities = { perfect_free_transformation: 1 };
  freeRun.members['10001'].base.attack = 1;
  freeRun.members['10001'].base.hp = 10_000_000;
  freeRun.members['10001'].base.defense = 10_000_000;
  const freeBattle = resolveEndlessLayer(freeRun);
  const actions = freeBattle.roundDetails.flatMap(round => round.actions);
  futureSelfAction ||= actions.find(
    action => action.kind === 'summon' && /^未来构筑：/.test(action.note)
  );
  foreignHeroAction ||= actions.find(
    action => action.kind === 'summon' && /^异界强者·/.test(action.note)
  );
}
assert.ok(futureSelfAction?.damage > 0);
assert.ok([3, 4].includes(futureSelfAction.note.slice(5).split('、').length));
assert.match(futureSelfAction.narration, /未来岁月|未来道果/);
assert.ok(foreignHeroAction?.damage > 0);
assert.ok(
  content.freeTransformationHeroes.some(
    hero => hero.name === foreignHeroAction.actor
  )
);

const fruitRun = createTwoPlayerRun(77889);
chooseFirstForEveryone(fruitRun);
fruitRun.members['10001'].abilities = { anime_devil_fruit: 1 };
for (const member of Object.values(fruitRun.members)) {
  member.base.attack = 1;
  member.base.hp = 10_000_000;
  member.base.defense = 10_000_000;
}
const fruitBattle = resolveEndlessLayer(fruitRun);
const fruitAction = fruitBattle.roundDetails
  .flatMap(round => round.actions)
  .find(action =>
    ['岩浆果实·冥狗', '震震果实·海震', '闪闪果实·八咫镜'].includes(
      action.skill
    )
  );
assert.ok(fruitAction?.damage > 0);
assert.ok(fruitAction.narration);

let rewindAction = null;
for (let seed = 1; seed <= 50 && !rewindAction; seed++) {
  const rewindRun = createOnePlayerRun(seed);
  chooseFirstForEveryone(rewindRun);
  rewindRun.members['10001'].abilities = {
    neutral_spring_autumn_cicada: 3,
  };
  rewindRun.members['10001'].base.attack = 1;
  rewindRun.members['10001'].base.hp = 50;
  rewindRun.members['10001'].base.defense = 0;
  const rewindBattle = resolveEndlessLayer(rewindRun);
  rewindAction = rewindBattle.roundDetails
    .flatMap((round) => round.actions)
    .find((action) => action.skill === '春秋蝉·逆流光阴');
}
assert.ok(rewindAction?.healing > 0);
assert.match(rewindAction.note, /仅可触发一次/);

let riderKickAction = null;
for (let seed = 1; seed <= 80 && !riderKickAction; seed++) {
  const decadeRun = createOnePlayerRun(seed);
  chooseFirstForEveryone(decadeRun);
  decadeRun.members['10001'].abilities = { anime_decade_driver: 3 };
  decadeRun.members['10001'].base.attack = 20;
  decadeRun.members['10001'].base.hp = 1_000_000_000;
  decadeRun.members['10001'].base.defense = 1_000_000_000;
  const decadeBattle = resolveEndlessLayer(decadeRun);
  riderKickAction = decadeBattle.roundDetails
    .flatMap((round) => round.actions)
    .find(
      (action) => action.skill === '最终骑士驾驭·Decade骑士踢'
    );
}
assert.equal(riderKickAction?.execute, true);
assert.match(riderKickAction.note, /低于30%.*处决成功/);

const boonBattleRun = createTwoPlayerRun(99001);
chooseFirstForEveryone(boonBattleRun);
boonBattleRun.members['10001'].blessings = ['relic_ruyi_staff'];
boonBattleRun.members['10002'].blessings = [
  'art_three_pure_ones',
  'art_heavenly_emperor_fist',
];
for (const member of Object.values(boonBattleRun.members)) {
  member.base.attack = 1;
  member.base.hp = 10_000_000;
  member.base.defense = 10_000_000;
}
const boonBattle = resolveEndlessLayer(boonBattleRun);
const boonAction = boonBattle.roundDetails
  .flatMap(round => round.actions)
  .find(action => action.skill === '定海一棒');
assert.ok(boonAction?.damage > 0);
assert.match(boonAction.narration, /金箍棒.*定海神珍/);
const threePureOnesAction = boonBattle.roundDetails
  .flatMap((round) => round.actions)
  .find((action) => action.skill === '一气化三清·三大道身');
assert.ok(threePureOnesAction?.damage > 0);
const heavenlyEmperorFistAction = boonBattle.roundDetails
  .flatMap((round) => round.actions)
  .find((action) => action.skill === '天帝拳·镇压万古');
assert.ok(heavenlyEmperorFistAction?.damage > 0);
assert.match(heavenlyEmperorFistAction.narration, /诸天万道.*古今/);

const ghostInterruptRun = createOnePlayerRun(66771);
chooseFirstForEveryone(ghostInterruptRun);
grantGhostPath(ghostInterruptRun.members['10001'], 6, ['music_box']);
ghostInterruptRun.members['10001'].base.attack = 1;
ghostInterruptRun.members['10001'].base.hp = 1_000_000_000;
ghostInterruptRun.members['10001'].base.defense = 1_000_000_000;
const ghostInterruptBattle = resolveEndlessLayer(ghostInterruptRun);
const ghostInterruptActions = ghostInterruptBattle.roundDetails.flatMap(
  round => round.actions
);
assert.ok(
  ghostInterruptActions.some(
    action => action.skill === '八音盒·永不终止的旋律'
  )
);
assert.ok(
  ghostInterruptActions.some(action => action.skill === '六层鬼域·暂停现实')
);
assert.ok(ghostInterruptBattle.summary.ghostInterrupts >= 2);

const ghostDismemberBattle = createGhostResonanceBattle(
  1,
  6,
  ['ghost_shadow', 'ghost_hand', 'ghost_cleaver']
);
const ghostDismemberActions = ghostDismemberBattle.roundDetails.flatMap(
  round => round.actions
);
assert.ok(ghostDismemberActions.some(action => action.skill === '鬼手·灵异压制'));
assert.ok(ghostDismemberActions.some(action => action.skill === '六层鬼域·肢解'));
assert.ok(ghostDismemberActions.some(action => action.skill === '鬼域肢解反噬'));
assert.equal(ghostDismemberBattle.summary.ghostDismemberments, 1);

const baseGhostEyeBattle = createGhostResonanceBattle(2, 5, [], 100);
const shadowGhostEyeBattle = createGhostResonanceBattle(2, 5, ['ghost_shadow'], 100);
const firstGhostEyeHit = battle => battle.roundDetails
  .flatMap(round => round.actions)
  .find(action => action.skill === '鬼眼·勘破死线')?.damage || 0;
assert.ok(firstGhostEyeHit(shadowGhostEyeBattle) > firstGhostEyeHit(baseGhostEyeBattle));

const fullGhostPuzzle = ['ghost_shadow', 'ghost_hand', 'ghost_cleaver', 'music_box', 'wish_ghost'];
const findGhostBattle = (domain, skill) => {
  for (let seed = 1; seed <= 160; seed++) {
    const battle = createGhostResonanceBattle(seed, domain, fullGhostPuzzle);
    if (battle.roundDetails.flatMap(round => round.actions).some(action => action.skill === skill))
      return battle;
  }
  return null;
};

const seventhDomainBattle = findGhostBattle(7, '七层鬼域·无代价肢解');
const seventhActions = seventhDomainBattle?.roundDetails.flatMap(round => round.actions) || [];
assert.ok(seventhDomainBattle);
assert.ok(seventhActions.some(action => action.skill === '许愿鬼·重启自身'));
assert.ok(!seventhActions.some(action => action.skill === '鬼域肢解反噬'));
assert.equal(seventhDomainBattle.summary.ghostWishes, 0);

for (const skill of ['许愿鬼·攻击无效', '许愿鬼·行动封绝']) {
  const battle = findGhostBattle(8, skill);
  const actions = battle?.roundDetails.flatMap(round => round.actions) || [];
  assert.ok(battle, `八层鬼域应触发${skill}`);
  assert.ok(!actions.some(action => ['许愿鬼·必杀之愿', '许愿鬼·防御剥夺'].includes(action.skill)));
}

for (const skill of ['许愿鬼·必杀之愿', '许愿鬼·防御剥夺']) {
  const battle = findGhostBattle(9, skill);
  const action = battle?.roundDetails
    .flatMap(round => round.actions)
    .find(current => current.skill === skill);
  assert.ok(action, `九层鬼域应触发${skill}`);
  if (skill === '许愿鬼·必杀之愿') assert.match(action.note, /按敌方剩余生命计算/);
  else assert.match(action.note, /永久失去防御与护盾/);
}

const ghostShadowRun = createOnePlayerRun(66772);
chooseFirstForEveryone(ghostShadowRun);
grantGhostPath(ghostShadowRun.members['10001'], 5, ['ghost_shadow']);
ghostShadowRun.lifeFire = 0;
ghostShadowRun.members['10001'].base.attack = 1;
ghostShadowRun.members['10001'].base.hp = 1;
ghostShadowRun.members['10001'].base.defense = 0;
const ghostShadowBattle = resolveEndlessLayer(ghostShadowRun);
assert.ok(
  ghostShadowBattle.roundDetails
    .flatMap(round => round.actions)
    .some(action => action.skill === '鬼影·替死拼图')
);

const ghostRestartRun = createTwoPlayerRun(66773);
chooseFirstForEveryone(ghostRestartRun);
ghostRestartRun.members['10001'].alive = false;
ghostRestartRun.members['10001'].hp = 0;
grantGhostPath(ghostRestartRun.members['10002'], 8);
ghostRestartRun.lifeFire = 0;
ghostRestartRun.members['10002'].base.attack = 1;
ghostRestartRun.members['10002'].base.hp = 1;
ghostRestartRun.members['10002'].base.defense = 0;
const ghostRestartBattle = resolveEndlessLayer(ghostRestartRun);
assert.ok(
  ghostRestartBattle.roundDetails
    .flatMap(round => round.actions)
    .some(action => action.skill === '八层鬼域·重启战场')
);
assert.ok(ghostRestartBattle.summary.ghostRestarts >= 1);

const coffinNailRun = createOnePlayerRun(66774);
chooseFirstForEveryone(coffinNailRun);
grantGhostPath(coffinNailRun.members['10001'], 5, ['coffin_nail']);
coffinNailRun.layer = 99;
coffinNailRun.members['10001'].base.attack = Number.MAX_SAFE_INTEGER;
coffinNailRun.members['10001'].base.hp = Number.MAX_SAFE_INTEGER;
coffinNailRun.members['10001'].base.defense = Number.MAX_SAFE_INTEGER;
const coffinNailBattle = resolveEndlessLayer(coffinNailRun);
assert.equal(coffinNailBattle.victory, true);
assert.ok(
  coffinNailBattle.roundDetails
    .flatMap(round => round.actions)
    .some(action => action.skill === '棺材钉·镇压厉鬼')
);

const checkpointRun = createTwoPlayerRun(44010);
chooseFirstForEveryone(checkpointRun);
checkpointRun.layer = 9;
for (const member of Object.values(checkpointRun.members)) {
  member.base.attack = 10_000_000;
  member.base.hp = 10_000_000;
}
const bossBattle = resolveEndlessLayer(checkpointRun);
assert.equal(bossBattle.stage, 'boss');
assert.equal(bossBattle.victory, true);
assert.equal(checkpointRun.phase, 'checkpoint');
assert.equal(checkpointRun.checkpoint.choices.length, 3);
assert.equal(checkpointRun.checkpoint.choices[0].name, '涅槃归息');

const restRun = structuredClone(checkpointRun);
restRun.lifeFire = 0;
for (const member of Object.values(restRun.members)) {
  member.alive = false;
  member.hp = 0;
}
const restResult = applyCheckpointChoice(restRun, 1);
assert.equal(restResult.reward.kind, 'rest');
assert.equal(restRun.lifeFire, 1);
assert.equal(restRun.phase, 'choice');
assert.ok(Object.values(restRun.members).every(member => member.alive));
assert.ok(
  Object.values(restRun.members).every(member => member.hp === member.maxHp)
);

const fortuneRun = structuredClone(checkpointRun);
const fortuneResult = applyCheckpointChoice(fortuneRun, 2);
assert.equal(fortuneResult.reward.kind, 'fortune');
assert.ok(getCheckpointBoon(fortuneResult.reward.boon.id));
if (fortuneResult.reward.boon.grantsAbility)
  assert.equal(
    fortuneRun.members[fortuneResult.reward.memberId].abilities[
      fortuneResult.reward.boon.grantsAbility
    ],
    fortuneResult.reward.abilityLevel
  );
else
  assert.ok(
    fortuneRun.members[fortuneResult.reward.memberId].blessings.includes(
      fortuneResult.reward.boon.id
    )
  );
assert.equal(fortuneRun.phase, 'choice');

let freeTransformationFortune = null;
for (let rngState = 1; rngState <= 10_000 && !freeTransformationFortune; rngState++) {
  const trial = structuredClone(checkpointRun);
  trial.rngState = rngState;
  const result = applyCheckpointChoice(trial, 2);
  if (result.reward.boon?.id === 'art_free_transformation')
    freeTransformationFortune = { trial, result };
}
assert.ok(freeTransformationFortune);
assert.equal(freeTransformationFortune.result.reward.abilityLevel, 1);
assert.equal(
  freeTransformationFortune.trial.members[
    freeTransformationFortune.result.reward.memberId
  ].abilities.perfect_free_transformation,
  1
);
assert.ok(
  !freeTransformationFortune.trial.members[
    freeTransformationFortune.result.reward.memberId
  ].blessings.includes('art_free_transformation')
);

const ascendRun = structuredClone(checkpointRun);
for (const member of Object.values(ascendRun.members)) {
  member.abilities = { neutral_attack: 1 };
}
const ascendResult = applyCheckpointChoice(ascendRun, 3);
assert.equal(ascendResult.reward.kind, 'ascend');
assert.ok(
  Object.values(ascendRun.members).every(
    member => member.abilities.neutral_attack === 2
  )
);
assert.equal(ascendRun.phase, 'choice');

const freeAscendRun = structuredClone(checkpointRun);
for (const member of Object.values(freeAscendRun.members)) member.abilities = {};
freeAscendRun.members['10001'].abilities = { perfect_free_transformation: 1 };
const freeAscendResult = applyCheckpointChoice(freeAscendRun, 3);
assert.equal(
  freeAscendResult.reward.upgrades.find(
    upgrade => upgrade.memberId === '10001'
  ).level,
  2
);

run.members['10001'].abilities = {
  multi_speed_force: 1,
};
run.members['10002'].abilities = {
  multi_vector_control: 1,
};
assert.ok(detectFusions(run).includes('fusion_absolute_motion'));

run.members['10001'].abilities = { anime_rasengan: 1 };
run.members['10002'].abilities = { anime_shadow_clone: 1 };
assert.ok(detectFusions(run).includes('fusion_clone_rasengan'));

run.banked = { lingshi: 1000, sourceStone: 2000, tokens: 100 };
run.unbanked = { lingshi: 1000, sourceStone: 2000, tokens: 100 };
run.members['10001'].bankedRewards = { cultivation: 500, blood: 800 };
run.members['10001'].unbankedRewards = { cultivation: 500, blood: 800 };
run.members['10002'].bankedRewards = { cultivation: 600, blood: 900 };
run.members['10002'].unbankedRewards = { cultivation: 600, blood: 900 };
assert.deepEqual(getSettlement(run, 0.3), {
  lingshi: 1300,
  sourceStone: 2600,
  tokens: 130,
  lostLingshi: 700,
  lostSourceStone: 1400,
  lostTokens: 70,
  members: {
    '10001': { cultivation: 650, blood: 1040, lostCultivation: 350, lostBlood: 560 },
    '10002': { cultivation: 780, blood: 1170, lostCultivation: 420, lostBlood: 630 },
  },
});

const deterministicA = createTwoPlayerRun(98765);
const deterministicB = createTwoPlayerRun(98765);
assert.deepEqual(deterministicA.worldOrder, deterministicB.worldOrder);
assert.deepEqual(deterministicA.pendingChoices, deterministicB.pendingChoices);

console.log('endlessRealm tests passed');

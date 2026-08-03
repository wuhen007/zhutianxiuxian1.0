import assert from 'node:assert/strict';
import {
  applyCheckpointChoice,
  applyEndlessChoice,
  createEndlessEnemy,
  createEndlessRun,
  detectFusions,
  getEndlessContent,
  getEndlessLayerCurrencyReward,
  getEndlessSweepReward,
  getCheckpointBoon,
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

const content = getEndlessContent();
assert.equal(content.worlds.length, 6);
assert.equal(content.abilities.length, 29);
assert.equal(content.fusions.length, 10);
assert.equal(content.checkpointBoons.length, 18);
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
]) {
  assert.ok(content.checkpointBoons.some(boon => boon.name === name));
}

const soloScaleRun = createOnePlayerRun(314159);
const teamScaleRun = createTwoPlayerRun(314159);
soloScaleRun.rngState = 271828;
teamScaleRun.rngState = 271828;
teamScaleRun.worldOrder = [...soloScaleRun.worldOrder];
const soloEnemy = createEndlessEnemy(soloScaleRun, 1);
const teamEnemy = createEndlessEnemy(teamScaleRun, 1);
assert.equal(soloEnemy.teamScale, 1);
assert.equal(teamEnemy.teamScale, 1.3);
assert.equal(teamEnemy.unitName, soloEnemy.unitName);
assert.equal(teamEnemy.unitMaxHp, Math.round(soloEnemy.unitMaxHp * 1.3));
assert.equal(teamEnemy.attack, Math.round(soloEnemy.attack * 1.3));
assert.equal(teamEnemy.defense, Math.round(soloEnemy.defense * 1.3));

for (const [layer, expectedCount] of [[11, 2], [21, 3]]) {
  const waveRun = createOnePlayerRun(20260803);
  const wave = createEndlessEnemy(waveRun, layer);
  assert.equal(wave.stage, 'normal');
  assert.equal(wave.monsterCount, expectedCount);
  assert.equal(wave.maxHp, wave.unitMaxHp * expectedCount);
}

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

const futureRun = createTwoPlayerRun(55667);
chooseFirstForEveryone(futureRun);
futureRun.members['10001'].abilities = { perfect_free_transformation: 1 };
for (const member of Object.values(futureRun.members)) {
  member.base.attack = 1;
  member.base.hp = 10_000_000;
  member.base.defense = 10_000_000;
}
const futureBattle = resolveEndlessLayer(futureRun);
const futureActions = futureBattle.roundDetails.flatMap(round => round.actions);
const currentSelfAction = futureActions.find(
  action => action.skill === '他化自在·当世身'
);
const futureSelfAction = futureActions.find(
  action => action.skill === '他化自在·未来身'
);
assert.ok(currentSelfAction?.damage > 0);
assert.ok(futureSelfAction.damage > currentSelfAction.damage);
assert.match(futureSelfAction.narration, /更强未来之我/);
assert.match(futureSelfAction.note, /^未来构筑：/);
assert.equal(futureSelfAction.note.slice(5).split('、').length, 3);

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

const boonBattleRun = createTwoPlayerRun(99001);
chooseFirstForEveryone(boonBattleRun);
boonBattleRun.members['10001'].blessings = ['relic_ruyi_staff'];
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
assert.ok(
  fortuneRun.members[fortuneResult.reward.memberId].blessings.includes(
    fortuneResult.reward.boon.id
  )
);
assert.equal(fortuneRun.phase, 'choice');

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

import assert from 'node:assert/strict';
import {
  applyEndlessChoice,
  createEndlessRun,
  detectFusions,
  getEndlessContent,
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

function chooseFirstForEveryone(run) {
  for (const id of Object.keys(run.pendingChoices))
    applyEndlessChoice(run, id, 1);
}

const content = getEndlessContent();
assert.equal(content.worlds.length, 6);
assert.equal(content.abilities.length, 21);
assert.equal(content.fusions.length, 6);
assert.equal(
  new Set(content.abilities.map((ability) => ability.id)).size,
  content.abilities.length
);
for (const world of content.worlds) {
  assert.ok(world.normal.length && world.elite.length && world.boss.length);
}
const abilityIds = new Set(content.abilities.map((ability) => ability.id));
for (const fusion of content.fusions) {
  assert.ok(fusion.requires.every((abilityId) => abilityIds.has(abilityId)));
}

const run = createTwoPlayerRun();
assert.equal(run.phase, 'choice');
assert.equal(Object.keys(run.pendingChoices).length, 2);
assert.equal(new Set(run.pendingChoices['10001']).size, 3);
assert.ok(getWorldForLayer(run, 1));

chooseFirstForEveryone(run);
assert.equal(run.phase, 'ready');
const battle = resolveEndlessLayer(run);
assert.equal(run.layer, 1);
assert.equal(battle.victory, true);
assert.equal(run.phase, 'choice');
assert.equal(run.unbanked.lingshi, 3_090_000_000);
assert.equal(run.unbanked.sourceStone, 1_280_000);
assert.equal(run.unbanked.tokens, 25);
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

run.members['10001'].abilities = {
  multi_speed_force: 1,
};
run.members['10002'].abilities = {
  multi_vector_control: 1,
};
assert.ok(detectFusions(run).includes('fusion_absolute_motion'));

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

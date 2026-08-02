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
assert.ok(run.unbanked.lingshi > 0);

run.members['10001'].abilities = {
  multi_speed_force: 1,
};
run.members['10002'].abilities = {
  multi_vector_control: 1,
};
assert.ok(detectFusions(run).includes('fusion_absolute_motion'));

run.banked = { lingshi: 1000, cultivation: 500 };
run.unbanked = { lingshi: 1000, cultivation: 500 };
assert.deepEqual(getSettlement(run, 0.3), {
  lingshi: 1300,
  cultivation: 650,
  lostLingshi: 700,
  lostCultivation: 350,
});

const deterministicA = createTwoPlayerRun(98765);
const deterministicB = createTwoPlayerRun(98765);
assert.deepEqual(deterministicA.worldOrder, deterministicB.worldOrder);
assert.deepEqual(deterministicA.pendingChoices, deterministicB.pendingChoices);

console.log('endlessRealm tests passed');

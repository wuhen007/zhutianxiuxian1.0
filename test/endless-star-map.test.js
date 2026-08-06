import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEndlessChoice,
  createEndlessRun,
  getEndlessLayerCurrencyReward,
  resolveEndlessLayer,
} from '../model/endlessRealm.js';
import {
  completeEndlessStarNode,
  getEndlessStarBossMechanisms,
  getEndlessStarEncounter,
  getEndlessStarMapView,
  getEndlessStarOptions,
  getEndlessStarVotes,
  getSelectedEndlessStarNode,
  selectEndlessStarRoute,
  suggestEndlessStarRoute,
} from '../model/endlessStarMap.js';

function player(name) {
  return {
    名号: name,
    level_id: 20,
    Physique_id: 20,
    mijinglevel_id: 1,
    xiangulevel_id: 1,
  };
}

function createRun(seed = 20260806) {
  return createEndlessRun({
    teamId: '246810',
    groupId: 'star-map-test',
    seed,
    players: [
      { id: '10001', player: player('甲') },
      { id: '10002', player: player('乙') },
    ],
  });
}

test('同一种子生成稳定的十层劫途星图', () => {
  const first = getEndlessStarMapView(createRun());
  const second = getEndlessStarMapView(createRun());
  assert.deepEqual(first, second);
  assert.equal(first.rows.length, 10);
  assert.deepEqual(first.rows.map(row => row.nodes.length), [2, 3, 3, 3, 3, 3, 3, 3, 2, 1]);
  assert.equal(first.rows[9].nodes[0].typeId, 'heaven_gate');
  assert.equal(first.rows[0].nodes[0].typeId, 'conquest');
});

test('队员可以改票，队长定途后本层路线不可更改', () => {
  const run = createRun();
  const suggested = suggestEndlessStarRoute(run, '10001', 2);
  assert.equal(getEndlessStarVotes(run).find(item => item.nodeId === suggested.id).votes, 1);
  suggestEndlessStarRoute(run, '10001', 1);
  assert.equal(getEndlessStarVotes(run).find(item => item.nodeId === suggested.id).votes, 0);

  const selected = selectEndlessStarRoute(run, 2);
  assert.equal(getSelectedEndlessStarNode(run).id, selected.id);
  assert.equal(run.starMap.suggestions['10001'], getEndlessStarOptions(run)[0].id);
  assert.throws(() => selectEndlessStarRoute(run, 1), /已经锁定/);
});

test('显式定途会启用天象、风险奖励与劫印累积', () => {
  const run = createRun();
  const selected = selectEndlessStarRoute(run, 2);
  const encounter = getEndlessStarEncounter(run);
  assert.equal(encounter.id, selected.id);
  assert.ok(encounter.rewardMultiplier > 1);
  assert.notEqual(encounter.skyName, '旧途回响');

  const seal = {
    prodigy: 'slaughter', tide: 'slaughter', relic: 'cause',
    altar: 'defiance', mirror: 'cause', rift: 'boundary',
  }[selected.typeId];
  completeEndlessStarNode(run, 1, true);
  assert.equal(run.starMap.rows[0].nodes[1].status, 'cleared');
  assert.equal(run.starMap.selectedNodeId, null);
  assert.equal(getEndlessStarOptions(run, 2).length, 3);
  if (seal) assert.equal(run.starMap.seals[seal], 1);
});

test('四类劫印会为十方天关追加对应Boss机制', () => {
  const run = createRun();
  run.starMap.seals = { slaughter: 3, cause: 2, boundary: 2, defiance: 2 };
  assert.deepEqual(
    new Set(getEndlessStarBossMechanisms(run)),
    new Set(['复活', '分身', '斩杀', '吸血'])
  );
});

test('星图路线实际参与战斗并结算倍率奖励', () => {
  const run = createRun(9527);
  for (const id of Object.keys(run.pendingChoices)) applyEndlessChoice(run, id, 1);
  selectEndlessStarRoute(run, 1);
  for (const member of Object.values(run.members)) {
    member.base.attack = 1e9;
    member.base.hp = 1e9;
    member.hp = 1e9;
    member.maxHp = 1e9;
  }
  const baseReward = getEndlessLayerCurrencyReward(1);
  const result = resolveEndlessLayer(run);
  assert.equal(result.victory, true);
  assert.ok(result.layerReward.lingshi > baseReward.lingshi);
  assert.ok(result.layerReward.starRoute);
  assert.match(result.logs.join('\n'), /劫途锁定/);
});

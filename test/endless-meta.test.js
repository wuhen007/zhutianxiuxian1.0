import assert from 'node:assert/strict';
import {
  ENDLESS_META_NODES,
  expandEndlessPuzzleSlots,
  getEndlessMetaEffects,
  getEndlessMetaView,
  replaceEndlessPuzzle,
  resetEndlessMeta,
  toggleEndlessPuzzle,
  unequipEndlessPuzzle,
  upgradeEndlessMeta,
} from '../model/endlessMeta.js';
import {
  applyEndlessChoice,
  createEndlessRun,
} from '../model/endlessRealm.js';

const gated = { 劫境道痕: 10_000, 无尽劫境最高层: 19 };
assert.throws(() => upgradeEndlessMeta(gated, '衍算天机'), /最高通过20层/);

const player = { 劫境道痕: 30_000, 无尽劫境最高层: 100 };
assert.equal(upgradeEndlessMeta(player, '攻击').cost, 50);
upgradeEndlessMeta(player, '衍算天机');
upgradeEndlessMeta(player, '一念双悟');
for (let rank = 0; rank < 4; rank++) upgradeEndlessMeta(player, '鬼域');
for (const name of ['鬼影', '鬼手', '鬼柴刀', '许愿鬼', '八音盒', '棺材钉'])
  upgradeEndlessMeta(player, name);

const effects = getEndlessMetaEffects(player);
assert.equal(effects.attackPct, 0.05);
assert.equal(effects.choiceCount, 4);
assert.equal(effects.doubleChoice, true);
assert.equal(effects.ghostDomainLevel, 9);
assert.equal(getEndlessMetaView(player).nodes.find(node => node.name === '鬼手').rank, 1);
assert.equal(getEndlessMetaView(player).puzzleSlots, 1);
assert.equal(expandEndlessPuzzleSlots(player).cost, 2500);
assert.equal(expandEndlessPuzzleSlots(player).slots, 3);

const healer = getEndlessMetaEffects({ 无尽道碑: { nodes: { branch_healer: 1 }, branch: 'healer' } });
assert.equal(healer.teamRegenPct, 0.16);
const vanguard = getEndlessMetaEffects({ 无尽道碑: { nodes: { branch_vanguard: 1 }, branch: 'vanguard' } });
assert.equal(vanguard.attackPct, 0.16);
assert.equal(vanguard.critChance, 0.08);
const guardian = getEndlessMetaEffects({ 无尽道碑: { nodes: { branch_guardian: 1 }, branch: 'guardian' } });
assert.equal(guardian.hpPct, 0.12);
assert.equal(guardian.defensePct, 0.16);
assert.equal(guardian.teamShieldPct, 0.1);
const baseTraces = getEndlessMetaEffects({ 无尽道碑: { nodes: { attack: 1, hp: 1, defense: 1 } } });
assert.equal(baseTraces.attackPct, 0.05);
assert.equal(baseTraces.hpPct, 0.06);
assert.equal(baseTraces.defensePct, 0.06);

for (const name of ['鬼影', '鬼柴刀', '许愿鬼'])
  assert.equal(toggleEndlessPuzzle(player, name).equipped, true);
assert.throws(() => toggleEndlessPuzzle(player, '八音盒'), /拼图槽已满/);
assert.equal(replaceEndlessPuzzle(player, '鬼影', '八音盒').to.name, '八音盒');
assert.equal(unequipEndlessPuzzle(player, '八音盒').node.name, '八音盒');
assert.equal(toggleEndlessPuzzle(player, '棺材钉').equipped, true);

const beforeReset = getEndlessMetaView(player);
const reset = resetEndlessMeta(player);
assert.equal(reset.refund, Math.floor(beforeReset.meta.spent * 0.9));
assert.equal(getEndlessMetaView(player).meta.spent, 0);
assert.equal(getEndlessMetaView(player).meta.equippedPuzzles.length, 0);

const threePointedBlade = ENDLESS_META_NODES.find(node => node.id === 'three_pointed_blade');
assert.ok(threePointedBlade);
assert.equal(threePointedBlade.maxRank, 1);
assert.deepEqual(threePointedBlade.gates, [450]);
assert.deepEqual(threePointedBlade.costs, [5000]);

const bladeLocked = { 劫境道痕: 5000, 无尽劫境最高层: 449 };
assert.throws(
  () => upgradeEndlessMeta(bladeLocked, 'three_pointed_blade'),
  /最高通过450层/
);
const bladePlayer = { 名号: '显圣真君', 劫境道痕: 5000, 无尽劫境最高层: 450 };
const bladeUnlock = upgradeEndlessMeta(bladePlayer, 'three_pointed_blade');
assert.equal(bladeUnlock.cost, 5000);
assert.equal(bladePlayer.劫境道痕, 0);
assert.equal(bladePlayer.无尽道碑.nodes.three_pointed_blade, 1);

const createBladeRun = (playerData) => createEndlessRun({
  teamId: 'three-pointed-blade',
  groupId: 'test-group',
  seed: 20260902,
  difficultyTier: 4,
  players: [{ id: '1', player: playerData }],
});
const lockedRun = createBladeRun({ 名号: '未参悟者' });
lockedRun.phase = 'choice';
lockedRun.pendingChoices = { '1': ['myth_three_pointed_blade'] };
assert.throws(
  () => applyEndlessChoice(lockedRun, '1', 1),
  undefined,
  '未参悟道碑节点时不应选择三尖两刃刀'
);

const unlockedRun = createBladeRun(bladePlayer);
assert.equal(unlockedRun.members['1'].endlessMeta.nodes.three_pointed_blade, 1);
unlockedRun.phase = 'choice';
unlockedRun.pendingChoices = { '1': ['myth_three_pointed_blade'] };
assert.equal(
  applyEndlessChoice(unlockedRun, '1', 1).ability.id,
  'myth_three_pointed_blade'
);

console.log('endless meta tests passed');

import assert from 'node:assert/strict';
import {
  getEndlessMetaEffects,
  getEndlessMetaView,
  resetEndlessMeta,
  toggleEndlessPuzzle,
  upgradeEndlessMeta,
} from '../model/endlessMeta.js';

const gated = { 劫境道痕: 10_000, 无尽劫境最高层: 19 };
assert.throws(() => upgradeEndlessMeta(gated, '衍算天机'), /最高通过20层/);

const player = { 劫境道痕: 30_000, 无尽劫境最高层: 100 };
assert.equal(upgradeEndlessMeta(player, '攻击').cost, 50);
upgradeEndlessMeta(player, '衍算天机');
upgradeEndlessMeta(player, '一念双悟');
for (let rank = 0; rank < 4; rank++) upgradeEndlessMeta(player, '鬼域');
for (const name of ['鬼影', '鬼柴刀', '许愿鬼', '八音盒', '棺材钉'])
  upgradeEndlessMeta(player, name);

const effects = getEndlessMetaEffects(player);
assert.equal(effects.attackPct, 0.05);
assert.equal(effects.choiceCount, 4);
assert.equal(effects.doubleChoice, true);
assert.equal(effects.ghostDomainLevel, 9);

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
assert.equal(toggleEndlessPuzzle(player, '鬼影').equipped, false);
assert.equal(toggleEndlessPuzzle(player, '八音盒').equipped, true);

const beforeReset = getEndlessMetaView(player);
const reset = resetEndlessMeta(player);
assert.equal(reset.refund, Math.floor(beforeReset.meta.spent * 0.9));
assert.equal(getEndlessMetaView(player).meta.spent, 0);
assert.equal(getEndlessMetaView(player).meta.equippedPuzzles.length, 0);

console.log('endless meta tests passed');

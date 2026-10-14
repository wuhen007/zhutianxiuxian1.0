import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getSuiyunEffects, getSuiyunStage } from '../model/suiyun.js';
import { getMemoryEffects } from '../model/memoryPath.js';
import { calculateWudaoResult, getPhysiqueWudaoBonus, getAptitudeWudaoBonus } from '../apps/User/wudaoRules.js';
import { resolveRiftRewardBonus } from '../model/lingjieRift.js';
import { multiplySuiyunLoot } from '../model/suiyunLoot.js';

const names = ['月华之体', '月华似剑', '霜月剑尊', '岁云化身', '岁云剑尊'];
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const player = name => ({ 灵根: { name, type: '岁云' } });

test('岁云五阶被动及顶级天资参与共享悟道收益', () => {
  for (const [index, name] of names.entries()) {
    const p = player(name);
    assert.equal(getSuiyunStage(p), index + 1);
    const expected = index < 3 ? 0.2 : 0.45;
    assert.equal(getPhysiqueWudaoBonus(name), expected);
    const result = calculateWudaoResult({
      rule: { baseGain: 1000, lifespanCost: 1 },
      physiqueName: name,
      eraIndex: 2,
      aptitudeName: '岁云',
      random: () => 0.5,
    });
    assert.equal(result.bonuses.physique, expected);
    assert.equal(result.bonuses.aptitude, 0.3);
    assert.equal(result.gain, Math.floor(1000 * (1 + expected + 0.3)));
  }
  assert.equal(getAptitudeWudaoBonus('岁云'), getAptitudeWudaoBonus('无演无尽'));
});

test('裂缝物品奖励采用 1/5/10/10/10 倍且不改变普通灵根', () => {
  for (const [index, name] of names.entries()) {
    assert.equal(resolveRiftRewardBonus(player(name), () => 0.99).multiplier, [1, 5, 10, 10, 10][index]);
  }
  assert.equal(resolveRiftRewardBonus(player('普通灵根'), () => 0.99).multiplier, 1);
  assert.equal(getSuiyunEffects({ 岁云: { stage: 5 }, 灵根: { name: '普通灵根' } }).lootMultiplier, 1);
});

test('仙古渡劫真实减伤逐阶结算，终阶保留圆神特殊异象', () => {
  const source = read('apps/SecretPlace/xianguTribulation.js');
  const start = source.indexOf('  _applyBodyDefenses(player, base) {');
  const end = source.indexOf('\n  }', start) + '\n  }'.length;
  const handler = new Function('getSuiyunEffects', 'getMemoryEffects', 'BODY_EFFECTS', 'bigNumberTransform',
    `return ({${source.slice(start, end)}})._applyBodyDefenses;`)(getSuiyunEffects, getMemoryEffects, {}, String);
  for (const [index, name] of names.entries()) {
    let special;
    const result = handler.call({
      _applySpecial(_player, value, damage) { special = value; return damage; },
    }, player(name), 1000);
    assert.ok(Math.abs(result.damage - [800, 700, 500, 400, 150][index]) < 1e-8);
    assert.equal(special, index === 4 ? '圆环之理' : undefined);
  }
  assert.match(read('apps/User/zhetiandujie.js'), /reduction: suiyunEffects\.tribulationReduction/);
});

test('岁云剑尊复用圆神光炮、治疗、护盾和分身而不改写灵根', () => {
  const source = read('model/xiuxian.js');
  const start = source.indexOf('function handleCircularGod(');
  const end = source.indexOf('\n}', start) + 2;
  const handler = new Function('getSuiyunEffects', 'bigNumberTransform', 'Math',
    `${source.slice(start, end)}; return handleCircularGod;`)(getSuiyunEffects, String, { ...Math, random: () => 0, trunc: Math.trunc, max: Math.max, min: Math.min });
  const attacker = { ...player('岁云剑尊'), 名号: '岁云', 攻击: 100, 血量上限: 1000, 当前血量: 200 };
  const defender = { 当前血量: 2000 };
  assert.equal(handler(attacker, defender, [], 'main'), true);
  assert.equal(defender.当前血量, 1000);
  assert.equal(attacker.当前血量, 500);
  assert.equal(attacker.护盾值, 200);
  assert.equal(attacker.分身.length, 1);
  assert.equal(attacker.灵根.name, '岁云剑尊');
  assert.equal(handler({ ...attacker, 灵根: { name: '霜月剑尊' } }, defender, [], 'main'), false);
  assert.equal(handler(attacker, defender, [], 'fenshen'), false);
  assert.match(read('apps/Battle/tuanben.js'), /getSuiyunEffects\(player\)\.madoka/);
});

test('岁云天资中央索引与无演无尽一致，保留专属名称', async () => {
  const source = read('model/xiuxian.js');
  const start = source.indexOf('export async function getPlayerAptitudeData(');
  const end = source.indexOf('\n}', start) + 2;
  const handler = new Function(`${source.slice(start, end).replace('export ', '')}; return getPlayerAptitudeData;`)();
  const result = await handler({ 天资等级: '岁云' });
  assert.equal(result.index, 10);
  assert.equal(result.grade, '岁云');
  assert.equal(result.isAtLeast('无演无尽'), true);
  assert.equal(result.isAtLeast('岁云'), true);
  assert.equal(result.getNextGrade(), null);
});

test('杀人魔道值入口与一键交易永久锁接入防护', () => {
  for (const name of names) assert.equal(getSuiyunEffects(player(name)).noDemonicValue, true);
  assert.match(read('apps/Battle/Battle.js'), /!getSuiyunEffects\(A_player\)\.noDemonicValue\) A_player\.魔道值 \+= mdz/);
  const wdt = read('apps/Battle/WDT.js');
  for (const side of ['A', 'B']) assert.ok(wdt.includes(`!getSuiyunEffects(${side}_player).noDemonicValue`));
  const sale = read('apps/User/UserSellAll.js');
  assert.match(sale, /l\.islockd = isItemPermanentlyNonTradeable\(l\) \? 1 : 0/);
  assert.match(sale, /l\.islockd == 0 && !isItemPermanentlyNonTradeable\(l\)/);
  assert.match(sale, /item\.islockd != 0 \|\| isItemPermanentlyNonTradeable\(item\)/);
});

test('Boss奖励倍增器保留永久绑定/唯一物，负数与非法数量不获奖励', () => {
  const p = player('岁云剑尊');
  assert.equal(multiplySuiyunLoot(p, { name: '普通材料' }, 3), 30);
  assert.equal(multiplySuiyunLoot(p, { name: '唯一机缘', 全服唯一: true }, 1), 1);
  assert.equal(multiplySuiyunLoot(p, { name: '无上天阙枝', 大道至宝本体: true }, 1), 1);
  assert.equal(multiplySuiyunLoot(p, { name: '残念', 不可交易: true }, 1), 1);
  for (const amount of [-1, 0, NaN, Infinity]) assert.equal(multiplySuiyunLoot(p, {}, amount), 0);
});

test('天骄真实发奖入口倍增普通物品，保持奖励幂等标记', async () => {
  const source = read('apps/Boss/BOSS4.js');
  const start = source.indexOf('  async grantTianjiaoDrop(');
  const end = source.indexOf('\n  }', start) + '\n  }'.length;
  const grants = [];
  const handler = new Function('Read_player', 'multiplySuiyunLoot', 'Add_najie_thing',
    `return ({${source.slice(start, end)}}).grantTianjiaoDrop;`)(
      async () => player('月华似剑'), multiplySuiyunLoot, async (...args) => grants.push(args),
    );
  assert.equal(await handler('1', { name: '材料', class: '道具' }, 2, 'battle-drop:1'), '材料 x10');
  assert.equal(grants[0][3], 10);
  assert.deepEqual(grants[0][6], { idempotencyKey: 'battle-drop:1' });
  assert.equal(await handler('1', { name: '唯一物', class: '道具', 全服唯一: true }, 1, 'battle-drop:2'), '唯一物 x1');
  assert.equal(grants[1][3], 1);
});

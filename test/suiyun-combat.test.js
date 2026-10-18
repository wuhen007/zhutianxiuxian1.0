import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUIYUN_COMBAT, resetSuiyunCombat, tickSuiyunFrost, consumeSuiyunControl,
  castSuiyunMoonSword, reduceSuiyunDamage, reflectSuiyunDamage, trySuiyunRevival,
  canExecuteCombatTarget, executeSuiyunMoonTarget,
} from '../model/suiyunCombat.js';
import { SUIYUN_STAGES } from '../model/suiyun.js';

function unit(overrides = {}) {
  return {
    名号: '岁云', 灵根: { name: '月华之体' },
    攻击: 100, 防御: 100, 当前血量: 100000, 血量上限: 100000,
    速度: 100, _speed: 200, _actionBar: 5000, ...overrides,
  };
}

function enemy(overrides = {}) {
  return unit({ 灵根: { name: '凡体' }, 名号: '对手', 防御: 1e9, ...overrides });
}

test('五阶自带三招，九个不同目标各九剑，每剑25倍且无分摊或递减', () => {
  for (const stage of SUIYUN_STAGES) {
    const attacker = unit({ 灵根: { name: stage.name } });
    const targets = Array.from({ length: 10 }, () => enemy());
    const values = [];
    const result = castSuiyunMoonSword(attacker, [targets[0], ...targets], {
      applyDamage(target, damage) {
        values.push(damage);
        target.当前血量 -= damage;
        return damage;
      },
    });
    assert.equal(result.targets, 9);
    assert.equal(result.hits, 81);
    assert.deepEqual(values, Array(81).fill(2500));
    assert.equal(result.totalDamage, 202500);
    targets.slice(0, 9).forEach(target => assert.equal(target.当前血量, 77500));
    assert.equal(targets[9].当前血量, 100000);
    assert.equal(targets[9]._suiyunFrost, undefined);
  }
});

test('单人敌方不虚构九个单位，死亡单位与自身不占群攻目标', () => {
  const attacker = unit();
  const target = enemy();
  const result = castSuiyunMoonSword(attacker, [attacker, enemy({ 当前血量: 0 }), target]);
  assert.equal(result.targets, 1);
  assert.equal(result.hits, 9);
  assert.equal(target.当前血量, 77500);
  assert.equal(castSuiyunMoonSword(enemy(), [target]).active, false);
});

test('五阶段霜剑各有出手意境，文案只报真实目标、命中与伤害，复生次数仍逐次准确', () => {
  const openings = new Set();
  for (const stage of SUIYUN_STAGES) {
    const attacker = unit({ 名号: '月下剑修', 灵根: { name: stage.name } });
    const result = castSuiyunMoonSword(attacker, [enemy()]);
    openings.add(result.messages[0]);
    assert.match(result.messages[0], /剑光笼罩1名敌手/);
    assert.match(result.messages[0], /每剑25倍攻击.*不衰减.*不可防御/);
    assert.ok(result.messages.includes('霜剑击中对手9次，实际伤害合计22500。月光收束，剑痕未散。'));
    assert.match(result.messages[1], /下一次行动被封禁.*2500/);
  }
  assert.equal(openings.size, 5);
  const unitToRevive = unit();
  const revivals = new Set();
  for (let used = 0; used < 3; used++) {
    unitToRevive.当前血量 = 0;
    const revival = trySuiyunRevival(unitToRevive);
    assert.ok(revival.message.includes(`第${used + 1}/3次`));
    assert.ok(revival.message.includes(`剩余复活${2 - used}次`));
    revivals.add(revival.message.split('岁云第')[0]);
  }
  assert.equal(revivals.size, 3);
  const messages = [];
  assert.equal(canExecuteCombatTarget(unit(), messages, '测试斩杀'), false);
  assert.match(messages[0], /青枝垂月.*免疫测试斩杀的即死裁决/);
  assert.equal(executeSuiyunMoonTarget(enemy({ 当前血量: 1 }), messages), true);
  assert.match(messages.at(-1), /生命低于15%.*斩杀生效.*封禁复活/);
});

test('绝控不消耗普通免控，半条推退每次施法一次而非九次', () => {
  const target = enemy({ _immune_control: 99, _装备首次免控名称: '逍遥仙袍' });
  castSuiyunMoonSword(unit(), [target]);
  assert.equal(target._actionBar, 2500);
  assert.equal(target._immune_control, 99);
  assert.equal(target._装备首次免控已触发, undefined);
  assert.equal(consumeSuiyunControl(target), true);
  assert.equal(consumeSuiyunControl(target), false);
  target._actionBar = 700;
  castSuiyunMoonSword(unit(), [target]);
  assert.equal(target._actionBar, 0);
});

test('霜寒按全局回合幂等，重复九次命中不叠层，不改变生命上限', () => {
  const target = enemy({ 当前血量: 1000000, 血量上限: 1000000, 防御: 100 });
  castSuiyunMoonSword(unit(), [target]);
  castSuiyunMoonSword(unit(), [target]);
  const hp = target.当前血量;
  const first = tickSuiyunFrost(target, 1);
  assert.equal(first.active, true);
  assert.equal(target.当前血量, hp * .8);
  assert.equal(target.血量上限, 1000000);
  assert.equal(target.攻击, 80);
  assert.equal(target.防御, 80);
  assert.equal(target.速度, 80);
  assert.equal(target._speed, 160);
  assert.equal(tickSuiyunFrost(target, 1).active, false);
  assert.equal(tickSuiyunFrost(target, 2).active, true);
  assert.equal(target.攻击, 64);
  assert.equal(target.速度, 64);
});

test('岁云归一减伤50%，反弹按实际损血100%计算且无反伤递归', () => {
  const defender = unit();
  const attacker = enemy();
  assert.equal(reduceSuiyunDamage(defender, 1000), 500);
  assert.equal(reduceSuiyunDamage(attacker, 1000), 1000);
  defender.当前血量 -= 100;
  const reflected = reflectSuiyunDamage(defender, attacker, 100);
  assert.equal(reflected.damage, 100);
  assert.equal(attacker.当前血量, 99900);
  assert.equal(defender.当前血量, 99900);
  const both = unit();
  assert.equal(reflectSuiyunDamage(defender, both, 100).damage, 50);
  assert.equal(defender.当前血量, 99900);
  assert.equal(reflectSuiyunDamage(defender, attacker, 0).reflected, false);
  assert.equal(reflectSuiyunDamage(defender, defender, 999).reflected, false);
});

test('白云苍狗每战仅三次满血复活，四项属性逐次乘1.5，不修改永久资源', () => {
  const holder = unit({ 修为: 100, 灵石: 100, 生命本源: 200, 暴击率: .1, _immune_control: 2 });
  for (let index = 1; index <= 3; index++) {
    holder.当前血量 = 0;
    const result = trySuiyunRevival(holder);
    assert.equal(result.revived, true);
    assert.equal(result.remaining, 3 - index);
    assert.equal(holder.攻击, 100 * 1.5 ** index);
    assert.equal(holder.防御, 100 * 1.5 ** index);
    assert.equal(holder.速度, 100 * 1.5 ** index);
    assert.equal(holder._speed, 200 * 1.5 ** index);
    assert.equal(holder.当前血量, 100000 * 1.5 ** index);
    assert.equal(holder.当前血量, holder.血量上限);
    assert.equal(trySuiyunRevival(holder).revived, false);
  }
  holder.当前血量 = 0;
  assert.equal(trySuiyunRevival(holder).revived, false);
  assert.deepEqual([holder.修为, holder.灵石, holder.生命本源, holder.暴击率], [100, 100, 200, .1]);
});

test('每剑结算死亡与复活，三次耗尽后才结束该目标连击', () => {
  const attacker = unit({ 当前血量: 1e7, 血量上限: 1e7 });
  const defender = unit({ 攻击: 0, 当前血量: 1, 血量上限: 1 });
  const result = castSuiyunMoonSword(attacker, [defender]);
  assert.equal(defender._suiyunRevives, 3);
  assert.equal(defender.当前血量, 0);
  assert.equal(result.hits, 4);
  assert.equal(result.messages.filter(message => message.includes('【白云苍狗】')).length, 3);
});

test('反伤导致施法者耗尽复活后立即终止后续攻击', () => {
  const attacker = unit({ 当前血量: 1, 血量上限: 1, _suiyunRevives: 3 });
  const defender = unit();
  const untouched = enemy();
  const result = castSuiyunMoonSword(attacker, [defender, untouched]);
  assert.equal(result.hits, 1);
  assert.equal(result.targets, 1);
  assert.equal(attacker.当前血量, 0);
  assert.equal(untouched.当前血量, 100000);
});

test('境界镇杀保留，常青免疫禁复活，低境霜剑与反伤不跨越道果屏障', () => {
  const lower = unit({ mijinglevel_id: 19 });
  const higher = enemy({ mijinglevel_id: 20 });
  assert.equal(castSuiyunMoonSword(lower, [higher]).active, false);
  assert.equal(reflectSuiyunDamage(lower, higher, 100).reflected, false);
  assert.equal(trySuiyunRevival(unit({ 当前血量: 0, 不可复活: true })).revived, true);
  for (const extra of [{ _高境界镇杀: true }, { _高境界压制: true }]) {
    const holder = unit({ 当前血量: 0, ...extra });
    assert.equal(trySuiyunRevival(holder).revived, false);
  }
});

test('重开战斗清临时计数，新战斗副本不污染存档对象', () => {
  const source = unit();
  const before = structuredClone(source);
  const battle = resetSuiyunCombat(structuredClone(source));
  battle._suiyunFrost = true;
  tickSuiyunFrost(battle, 1);
  battle.当前血量 = 0;
  trySuiyunRevival(battle);
  assert.deepEqual(source, before);
  const next = resetSuiyunCombat(structuredClone(source));
  next.当前血量 = 0;
  assert.equal(trySuiyunRevival(next).remaining, 2);
  assert.equal(next._suiyunFrost, undefined);
});

test('无效或负伤害不回血，数值放大保持有限', () => {
  const holder = unit({ 攻击: Number.MAX_VALUE, 防御: Number.MAX_VALUE, 当前血量: 0, 血量上限: Number.MAX_VALUE });
  for (const damage of [-1, NaN, Infinity]) assert.equal(reduceSuiyunDamage(holder, damage), 0);
  trySuiyunRevival(holder);
  assert.equal(Number.isFinite(holder.血量上限), true);
  assert.equal(Number.isFinite(holder.攻击), true);
  assert.equal(SUIYUN_COMBAT.hits * SUIYUN_COMBAT.targets, 81);
});

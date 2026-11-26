import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { reduceSuiyunDamage, reflectSuiyunDamage, getSuiyunEvergreenSpeed } from '../model/suiyunCombat.js';
import { createSuiyunRoot } from '../model/suiyun.js';

test('岁云常青五阶本人基础遁速固定+200，重复求值不叠加且不授予分身或受赐者', () => {
  const source = readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const fn = source.match(/export function getBattleUnitSpeed\([\s\S]*?\r?\n}/)[0].replace('export ', '');
  const speed = new Function('getSuiyunEvergreenSpeed', 'getInnateSpeedMultiplier',
    `${fn}; return getBattleUnitSpeed;`)(getSuiyunEvergreenSpeed, () => 1);
  for (let stage = 1; stage <= 5; stage++) {
    const unit = { 灵根: createSuiyunRoot(stage), 速度: 100, mijinglevel_id: 10, xiangulevel_id: 1 };
    const original = structuredClone(unit);
    assert.equal(speed(unit), 850);
    assert.equal(speed(unit), 850);
    assert.deepEqual(unit, original);
    assert.equal(speed({ ...unit, _忽略境界速度加成: true }), 300);
    for (const extra of [{ _tahua_type: 'mirror_self' }, { _yiqihua_entity: true }, { _万灵魔幡主魂: true },
      { _帝骑分身: true }, { _圆神分身: true }, { 分身: true }, { _高境界镇杀: true }, { _高境界压制: true }]) {
      assert.equal(getSuiyunEvergreenSpeed({ ...unit, ...extra }), 0);
    }
  }
  assert.equal(getSuiyunEvergreenSpeed({ 灵根: { name: '凡体' }, 月华传承: { 技能: ['霜剑入月', '岁云归一', '白云苍狗'] } }), 0);
});

test('归一50%仅在实际扣血处应用一次，反伤排除过量伤害且不递归', () => {
  const source = readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = source.indexOf('function applySuiyunBattleDamage(');
  const end = source.indexOf('\n}', start) + 2;
  const damage = new Function('reduceSuiyunDamage', 'reflectSuiyunDamage',
    `${source.slice(start, end)}; return applySuiyunBattleDamage;`)(reduceSuiyunDamage, reflectSuiyunDamage);
  const defender = { 名号: '岁云', 灵根: { name: '月华之体' }, 当前血量: 40 };
  const attacker = { 名号: '普通敌手', 当前血量: 500 };
  const messages = [];
  assert.equal(damage(attacker, defender, 200, messages), 100);
  assert.equal(defender.当前血量, 0);
  assert.equal(attacker.当前血量, 460);
  assert.equal(messages.filter(line => line.includes('反还')).length, 1);
  assert.equal(damage(attacker, { 当前血量: 1 }, 200, []), 200, '普通伤害返回值保留既有过量统计语义');
});

test('岁云三技在真实单挑、队战与旧团本执行且不污染输入存档', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get: () => () => {} });
    Math.random = () => .5;
    const { zd_battle, tb_battle } = await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const unit = (name, extra = {}) => ({
      名号: name, 攻击: 100, 防御: 1, 当前血量: 1000000, 血量上限: 1000000,
      速度: 5000, 暴击率: 0, 暴击伤害: 1.5, 闪避率: 0, 吸血率: 0, 穿透: 0,
      灵根: { name: '普通灵根', type: '普通', 法球倍率: 1 }, 法球倍率: 1,
      生命本源: 100, 魔道值: 0, 学习的功法: [],
      mijinglevel_id: 0, xiangulevel_id: 0, huafenlevel_id: 0, ...extra,
    });
    const owner = unit('月华持有者', { 灵根: { name: '月华之体', type: '岁云', 法球倍率: 1 } });
    const wall = unit('高防御敌手', { 攻击: 1, 防御: 1e12, 速度: 1 });
    const originals = structuredClone([owner, wall]);
    const duel = await zd_battle(owner, wall, { maxRound: 1, preserveHpOnTimeout: true });
    assert.ok(duel.msg.some(line => /月华持有者 遁光速度：5200.*岁云常青加成：200/.test(line)));
    assert.ok(duel.msg.some(line => /霜剑击中高防御敌手9次，实际伤害合计22500/.test(line)));
    assert.deepEqual([owner, wall], originals);

    const killer = unit('致命攻击者', { 攻击: 1e6, 当前血量: 1e9, 血量上限: 1e9 });
    const fragile = unit('三生岁云', { ...owner, 名号: '三生岁云', 攻击: 1, 当前血量: 100, 血量上限: 100, 速度: 1 });
    const fragOriginal = structuredClone(fragile);
    const revival = await zd_battle(killer, fragile);
    assert.equal(revival.msg.filter(line => String(line).includes('【白云苍狗】')).length, 3);
    assert.equal(revival.winner, 'A');
    assert.equal(revival.B_hp, 0);
    assert.deepEqual(fragile, fragOriginal);
    const again = await zd_battle(killer, fragile);
    assert.equal(again.msg.filter(line => String(line).includes('【白云苍狗】')).length, 3);

    const reflectedVictory = await zd_battle([{ ...killer, 当前血量: 450, 血量上限: 450 }], [fragile]);
    assert.equal(reflectedVictory.msg.filter(line => String(line).includes('【白云苍狗】')).length, 3);
    assert.equal(reflectedVictory.winner, 'B');
    assert.equal(reflectedVictory.B_team[0].当前血量, 100, '返回可持久化HP不超过原存档上限');
    assert.equal(reflectedVictory.B_team[0]._suiyunRevives, 3);
    assert.deepEqual(fragile, fragOriginal);

    const enemies = Array.from({ length: 10 }, (_, i) => unit('群敌' + i, { 攻击: 1, 防御: 1e12, 速度: 1 }));
    const teamOriginal = structuredClone(enemies);
    const team = await zd_battle([owner], enemies);
    assert.ok(team.msg.some(line => /月华持有者 遁光速度：5200.*岁云常青加成：200/.test(line)));
    const first = team.msg.findIndex(line => String(line).includes('【霜剑入月】'));
    const next = team.msg.findIndex((line, index) => index > first && String(line).includes('【霜剑入月】'));
    const initialCast = team.msg.slice(first, next < 0 ? undefined : next);
    assert.equal(initialCast.filter(line => String(line).startsWith('霜剑击中')).length, 9);
    assert.equal(initialCast.filter(line => /9次，实际伤害合计22500/.test(line)).length, 9);
    assert.equal(initialCast.some(line => /霜寒绝控.*群敌9|霜剑击中群敌9/.test(line)), false, '第十名不受第一轮九目标技能影响');
    assert.ok(team.msg.some(line => String(line).includes('【霜寒】')));
    assert.deepEqual(enemies, teamOriginal);

    const controlOwner = unit('快速岁云', { ...owner, 速度: 500 });
    const immune = unit('免控敌手', { 攻击: 1, 防御: 1e12, 当前血量: 1e8, 血量上限: 1e8, 速度: 699, _immune_control: 999 });
    const controlled = await zd_battle(controlOwner, immune, { maxRound: 3, preserveHpOnTimeout: true });
    assert.ok(controlled.msg.some(line => String(line).includes('霜剑入月·绝对封锁')));
    assert.ok(controlled.msg.some(line => String(line).includes('【霜寒】')));

    const raidOwner = unit('团本岁云', { ...owner, 攻击: 10000 });
    const raidBoss = unit('团本敌手', { 攻击: 1, 当前血量: 1e6, 血量上限: 1e6 });
    const raidOriginal = structuredClone([raidOwner, raidBoss]);
    const raid = await tb_battle([raidOwner], raidBoss, {});
    assert.equal(raid.result, '玩家胜利');
    assert.ok(raid.msg.some(line => String(line).includes('【霜剑入月】')));
    assert.equal(raid.boss_hp_change, -1e6);
    assert.deepEqual([raidOwner, raidBoss], raidOriginal);
    // Players act first in legacy raids: use a reflecting Suiyun boss so death
    // occurs inside the nine-hit player phase rather than waiting on a frozen boss.
    const raidRevival = await tb_battle([fragile], { ...killer, 灵根: owner.灵根 }, {});
    assert.equal(raidRevival.msg.filter(line => String(line).includes('【白云苍狗】')).length, 3);
    assert.equal(raidRevival.result, 'BOSS胜利');

    const lower = { ...owner, mijinglevel_id: 19 };
    const higher = unit('境界天堑', { 攻击: 1, mijinglevel_id: 20 });
    const barrier = await zd_battle(lower, higher);
    assert.equal(barrier.winner, 'B');
    assert.equal(barrier.msg.some(line => String(line).includes('【白云苍狗】')), false);
    assert.equal(barrier.msg.some(line => String(line).includes('【霜剑入月】')), false);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

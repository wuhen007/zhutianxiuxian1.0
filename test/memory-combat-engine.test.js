import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('真实单挑/队战/旧团本消费记忆因子，成长与次数均不污染角色输入', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get: () => () => {} });
    Math.random = () => .5;
    const { createMemoryRoot } = await import('./plugins/zhutianxiuxian1.0/model/memoryPath.js');
    const { zd_battle, tb_battle } = await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const base = {
      名号: '记忆行者', 攻击: 100, 防御: 100000, 当前血量: 100000, 血量上限: 100000,
      速度: 500, 暴击率: 0, 暴击伤害: 1.5, 闪避率: 0, 吸血率: 0, 穿透: 0, 法球倍率: 1,
      灵根: createMemoryRoot(2), 记忆命途: { 因子: { 负世: 3, 纷争: 3, 诡计: 3, 死亡: 3 } },
      生命本源: 1000, 学习的功法: [], mijinglevel_id: 0, xiangulevel_id: 0, huafenlevel_id: 0,
    };
    const enemy = { ...base, 名号: '普通敌手', 灵根: { name: '普通灵根', type: '普通', 法球倍率: 1 }, 记忆命途: undefined, 速度: 499 };
    const original = structuredClone(base);
    const duel = await zd_battle(base, enemy, { maxRound: 8, preserveHpOnTimeout: true });
    assert.ok(duel.msg.some(line => String(line).includes('【负世】')));
    assert.ok(duel.msg.some(line => String(line).includes('【纷争】')));
    assert.ok(duel.msg.some(line => String(line).includes('本次攻击取消')));
    assert.ok(duel.msg.some(line => String(line).includes('【死亡·灰暗】')));
    assert.deepEqual(base, original);
    const fragile = { ...base, 攻击: 1, 防御: 1, 当前血量: 100, 血量上限: 100, 速度: 1 };
    const killer = { ...enemy, 攻击: 10000000, 当前血量: 10000000, 血量上限: 10000000, 速度: 5000 };
    const death = await zd_battle(killer, fragile);
    assert.equal(death.msg.filter(line => String(line).includes('【死亡·拒绝终结】')).length, 1);
    assert.equal(death.msg.filter(line => String(line).includes('【纷争·再起】')).length, 1);
    assert.equal(death.winner, 'A');
    const team = await zd_battle([killer], [fragile]);
    assert.equal(team.msg.filter(line => String(line).includes('【死亡·拒绝终结】')).length, 1);
    assert.equal(team.msg.filter(line => String(line).includes('【纷争·再起】')).length, 1);
    assert.equal(team.winner, 'A');
    const raid = await tb_battle([fragile], killer, {});
    assert.equal(raid.msg.filter(line => String(line).includes('【死亡·拒绝终结】')).length, 1);
    assert.equal(raid.msg.filter(line => String(line).includes('【纷争·再起】')).length, 1);
    assert.equal(raid.result, 'BOSS胜利');
    assert.equal(fragile.当前血量, 100);
    const barrier = await zd_battle({ ...base, mijinglevel_id: 19 }, { ...killer, mijinglevel_id: 20 });
    assert.equal(barrier.winner, 'B');
    assert.ok(!barrier.msg.some(line => /记忆·|死亡·拒绝|纷争·再起|【负世】/.test(String(line))));
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('仙古与遮天真实渡劫结算使用记忆减伤，时间因子满血避开致命一劫且只扣一次', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get: () => () => {} });
    Math.random = () => .99;
    const { createMemoryRoot, MEMORY_FACTORS } = await import('./plugins/zhutianxiuxian1.0/model/memoryPath.js');
    const { XianguTribulation } = await import('./plugins/zhutianxiuxian1.0/apps/SecretPlace/xianguTribulation.js');
    const { zhetiandujie } = await import('./plugins/zhutianxiuxian1.0/apps/User/zhetiandujie.js');
    const player = {
      名号: '渡劫记忆体', 灵根: createMemoryRoot(2), 记忆命途: { 因子: { 时间: 1 } },
      攻击: 100, 防御: 0, 当前血量: 1000, 血量上限: 1000, 生命本源: 1000,
      学习的功法: [], 功法: {}, 道心: 500, _雷池真液已用: true,
    };
    const trib = new XianguTribulation();
    assert.ok(Math.abs(trib._applyBodyDefenses(player, 1000).damage - 670) < 1e-8);
    const full = { ...player, 记忆命途: { 因子: Object.fromEntries(MEMORY_FACTORS.map(name => [name, 3])) } };
    assert.ok(Math.abs(trib._applyBodyDefenses(full, 1000).damage - 340) < 1e-8);
    const first = await trib._dealWave({}, player, 10, 1, '记忆测试劫');
    assert.equal(first.dead, false);
    assert.equal(player.当前血量, 1000);
    assert.equal(player.生命本源, 500);
    assert.ok(first.lines.some(line => String(line).includes('时间·逆转劫数')));
    const next = await trib._dealWave({}, player, 10, 2, '记忆第二劫');
    assert.equal(next.dead, true);
    assert.equal(player.生命本源, 500);
    const zhetian = new zhetiandujie();
    const other = { ...player, 当前血量: 1000, 生命本源: 1000, 记忆命途: { 因子: { 时间: 3 } } };
    const a = await zhetian.applyTribulationDamage(other, 10000, {});
    assert.equal(a.damage, 0);
    assert.equal(other.当前血量, 1000);
    assert.equal(other.生命本源, 700);
    const b = await zhetian.applyTribulationDamage(other, 10000, {});
    assert.ok(b.damage > 1000);
    assert.equal(other.生命本源, 700);
    assert.equal(zhetian.memoryTribulationStates.get(other).cooldown, 11);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import * as trial from '../model/trialUniverse.js';

function newPlayer(change = {}) {
  return { id: 'trial-fixture', power_place: 0, level_id: 1, Physique_id: 1,
    mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1, 修为: 1, 血气: 1,
    灵石: 12345, unrelated: { value: 42 }, ...change };
}

function fixture() {
  const player = newPlayer();
  let sequence = 0;
  const command = (text, options = {}) => trial.runTrialCommand(player, text, {
    now: 1000 + sequence, random: () => 0.999, requestId: `request-${++sequence}`, ...options,
  });
  const act = (text, options) => {
    const result = command(text, options);
    assert.equal(result.ok, true, `${text}: ${result.message}`);
    return result;
  };
  act('入界 确认');
  const clear = (type = '末日') => {
    act(`进入 ${type} 确认`);
    for (let stage = 0; stage < 3; stage++) { act('行动 调查'); act('行动 强攻'); }
    assert.equal(player.试炼宇宙.run.stage, 3);
    return act('结算');
  };
  return { player, command, act, clear };
}

test('开局使用独立字段、明确确认，保留主角色境界和全部财产', () => {
  const player = newPlayer();
  const before = structuredClone(player);
  const preview = trial.runTrialCommand(player, '入界');
  assert.equal(preview.changed, false);
  assert.match(preview.message, /清空本世/);
  assert.deepEqual(player, before);
  assert.equal(trial.runTrialCommand(player, '入界 确认', { now: 1 }).ok, true);
  const { 试炼宇宙, power_place, ...rest } = player;
  const { power_place: originalPlace, ...old } = before;
  assert.deepEqual(rest, old);
  assert.equal(power_place, 0.6);
  assert.equal(试炼宇宙.createdAt, 1);
  assert.equal(试炼宇宙.body.hp, 100);
  assert.equal(试炼宇宙.credits, 0);
  assert.equal(试炼宇宙.bag.医疗包, 1);
});

test('已修炼、异位面、轮回、其他独立路线及已有试炼记录均拒绝覆盖', () => {
  for (const change of [{ level_id: 2 }, { Physique_id: 2 }, { huafenlevel_id: 2 },
    { lunhui: 1 }, { level_id: -1 }, { power_place: 0.5 }, { power_place: 1 },
    { 复活地球: { status: 'active' } }, { 复活地球: { status: 'ascended' } }]) {
    const player = newPlayer(change);
    const before = structuredClone(player);
    assert.equal(trial.runTrialCommand(player, '入界 确认').ok, false);
    assert.deepEqual(player, before);
  }
  const f = fixture();
  const before = structuredClone(f.player);
  assert.equal(f.command('入界 确认').ok, false);
  assert.deepEqual(f.player, before);
});

test('六类原创世界均有独立三阶段任务，说明公开神位和死亡规则', () => {
  const f = fixture();
  assert.deepEqual(Object.keys(trial.TRIAL_WORLDS), ['末日', '灵异', '科幻', '不可名状', '魔幻', '修仙']);
  assert.equal(new Set(Object.values(trial.TRIAL_WORLDS).map(world => world.name)).size, 6);
  for (const world of Object.values(trial.TRIAL_WORLDS)) assert.equal(world.tasks.length, 3);
  assert.match(f.act('世界').message, /灰烬长夜[\s\S]*葬仙药园/);
  assert.match(f.act('规则').message, /3000积分[\s\S]*无境/);
  const before = structuredClone(f.player);
  for (const text of ['状态', '帮助', '规则', '世界', '任务', '兑换', '强化', '履历']) {
    assert.equal(f.act(text, { random: () => { throw new Error('查询抽随机'); } }).changed, false);
  }
  assert.deepEqual(f.player, before);
});

test('进入须确认，任务行动逐段推进，只有回归结算才发积分且首次凭证仅发一次', () => {
  const f = fixture();
  const before = structuredClone(f.player);
  assert.equal(f.command('进入 末日').changed, false);
  assert.deepEqual(f.player, before);
  f.act('进入 末日 确认');
  assert.equal(f.command('结算').changed, false);
  assert.equal(f.player.试炼宇宙.credits, 0);
  for (let stage = 0; stage < 3; stage++) {
    f.act('行动 调查');
    assert.equal(f.player.试炼宇宙.run.progress, 1);
    assert.equal(f.player.试炼宇宙.run.intel, 1);
    f.act('行动 强攻');
    assert.equal(f.player.试炼宇宙.run.stage, stage + 1);
    assert.equal(f.player.试炼宇宙.run.intel, 0);
    assert.equal(f.player.试炼宇宙.credits, 0);
  }
  assert.equal(f.command('行动 强攻').ok, false);
  f.act('结算');
  assert.equal(f.player.试炼宇宙.credits, 850);
  assert.deepEqual(f.player.试炼宇宙.seals, ['末日']);
  assert.equal(f.player.试炼宇宙.body.hp, 100);
  assert.equal(f.command('结算').changed, false);
  f.clear();
  assert.equal(f.player.试炼宇宙.credits, 1200);
  assert.equal(f.player.试炼宇宙.clears, 2);
});

test('三种选择具有不同代价、推进和实际风险，纯谨慎会耗尽时限', () => {
  const results = {};
  for (const mode of ['谨慎', '强攻', '调查']) {
    const f = fixture();
    f.act('进入 科幻 确认');
    f.act(`行动 ${mode}`);
    results[mode] = structuredClone(f.player.试炼宇宙);
  }
  assert.equal(results.谨慎.run.ticks, 2);
  assert.equal(results.强攻.run.progress, 2);
  assert.equal(results.调查.run.intel, 1);
  assert.ok(results.强攻.body.hp < results.谨慎.body.hp);
  assert.ok(results.调查.body.sanity < results.谨慎.body.sanity);
  const f = fixture();
  f.act('进入 末日 确认');
  for (let i = 0; i < 6; i++) f.act('行动 谨慎');
  assert.equal(f.player.试炼宇宙.status, 'dead');
  assert.match(f.player.试炼宇宙.deathRecords[0].reason, /时限/);
});

test('历史通关推高重复世界灾厄伤害与概率，重生不重置刷取难度', () => {
  const f = fixture();
  f.clear('末日');
  f.act('进入 末日 确认');
  assert.match(f.act('任务').message, /生命-26、精神-10/);
  assert.match(f.act('任务').message, /调查：[\s\S]*遇险24%/);
  f.act('行动 调查', { random: () => 0 });
  assert.equal(f.player.试炼宇宙.body.hp, 71);
  assert.equal(f.player.试炼宇宙.body.sanity, 80);
  while (f.player.试炼宇宙.status === 'active') f.act('行动 谨慎', { random: () => 0 });
  f.act('重生 确认');
  f.act('进入 末日 确认');
  assert.match(f.act('任务').message, /生命-26、精神-10/);
});

test('遇险真实伤及生命和精神；随机错误、超量值与无效命令整体回滚', () => {
  const f = fixture();
  f.act('进入 灵异 确认');
  f.act('行动 调查', { random: () => 0 });
  assert.equal(f.player.试炼宇宙.body.hp, 87);
  assert.equal(f.player.试炼宇宙.body.sanity, 68);
  for (const options of [{ random: () => NaN }, { random: () => 1 }, { random: () => -1 },
    { random: () => { throw new Error('RNG failure'); } }, { now: Infinity }, { requestId: {} }]) {
    const before = structuredClone(f.player);
    assert.equal(f.command('行动 强攻', options).changed, false);
    assert.deepEqual(f.player, before);
  }
  for (const text of ['行动 __proto__', '行动 constructor', '进入 末日 确认 多余参数', '兑换 医疗包 -1',
    '强化 prototype', '使用 __proto__', '不存在命令']) {
    const before = structuredClone(f.player);
    assert.equal(f.command(text).ok, false);
    assert.deepEqual(f.player, before);
  }
});

test('兑换、强化与有限物品真实扣费，在外界暂停兑换强化', () => {
  const f = fixture();
  assert.equal(f.command('兑换 医疗包').ok, false);
  f.clear();
  f.act('兑换 界障护符');
  f.act('强化 体魄');
  f.act('强化 精神');
  assert.equal(f.player.试炼宇宙.credits, 510);
  assert.equal(f.player.试炼宇宙.body.hp, 108);
  f.act('进入 不可名状 确认');
  assert.equal(f.command('兑换 医疗包').ok, false);
  assert.equal(f.command('强化 体魄').ok, false);
  assert.equal(f.command('使用 医疗包').ok, false);
  f.act('使用 界障护符');
  assert.equal(f.player.试炼宇宙.run.ticks, 1);
  f.act('行动 调查', { random: () => 0 });
  assert.equal(f.player.试炼宇宙.body.hp, 101);
  assert.equal(f.player.试炼宇宙.body.sanity, 83);
  assert.equal(f.player.试炼宇宙.run.ward, false);
  f.act('使用 定神剂');
  assert.equal(f.player.试炼宇宙.body.sanity, 108);
  assert.equal(f.player.试炼宇宙.bag.定神剂, 0);
  assert.equal(f.command('使用 定神剂').ok, false);
});

test('死亡清空本世资源，确认后重生；保留历史且原角色完整', () => {
  const f = fixture();
  f.clear();
  f.act('强化 体魄');
  f.act('进入 不可名状 确认');
  const native = { ...f.player };
  delete native.试炼宇宙;
  while (f.player.试炼宇宙.status === 'active') f.act('行动 调查', { random: () => 0 });
  const dead = f.player.试炼宇宙;
  assert.equal(dead.credits, 0);
  assert.equal(dead.body.体魄, 0);
  assert.equal(dead.seals.length, 0);
  assert.equal(dead.clears, 1);
  assert.equal(dead.deaths, 1);
  assert.equal(dead.deathRecords.length, 1);
  assert.equal(f.command('结算').ok, false);
  assert.equal(f.command('进入 末日 确认').ok, false);
  const before = structuredClone(f.player);
  assert.equal(f.command('重生').changed, false);
  assert.deepEqual(f.player, before);
  f.act('重生 确认');
  assert.equal(f.player.试炼宇宙.body.hp, 100);
  assert.equal(f.player.试炼宇宙.clears, 1);
  assert.equal(f.player.试炼宇宙.deaths, 1);
  assert.equal(f.player.试炼宇宙.bag.医疗包, 1);
  const afterNative = { ...f.player };
  delete afterNative.试炼宇宙;
  assert.deepEqual(afterNative, native);
});

test('持久化 JSON 往返、消息幂等和只读查询不重新抽取随机', () => {
  const f = fixture();
  f.act('#试炼宇宙 进入 末日 确认');
  f.act('行动 调查', { requestId: 'one-event' });
  const copy = JSON.parse(JSON.stringify(f.player));
  const before = structuredClone(copy);
  const result = trial.runTrialCommand(copy, '行动 调查', { requestId: 'one-event', random: () => { throw new Error('重复结算'); } });
  assert.equal(result.ok, true);
  assert.equal(result.changed, false);
  assert.match(result.message, /已处理消息/);
  assert.deepEqual(copy, before);
  assert.equal(trial.runTrialCommand(copy, '状态').ok, true);
  assert.equal(trial.runTrialCommand(copy, '行动 强攻', { random: () => 0.99 }).ok, true);
});

test('拒绝受污染键、畸形存档、超值积分；提交失败不扣资源', () => {
  for (const mutate of [state => { state.credits = Number.MAX_SAFE_INTEGER; },
    state => { state.bag = JSON.parse('{"__proto__":{"polluted":true}}'); },
    state => { state.body.体魄 = 6; }, state => { state.status = 'ascended'; },
    state => { state.seals = ['末日']; }, state => { state.clearedTypes.末日 = 1; }]) {
    const f = fixture();
    mutate(f.player.试炼宇宙);
    const before = structuredClone(f.player);
    assert.equal(f.command('兑换 医疗包').ok, false);
    assert.deepEqual(f.player, before);
    assert.equal({}.polluted, undefined);
  }
  const f = fixture();
  f.player.试炼宇宙.credits = 1_000_000_000;
  f.act('进入 末日 确认');
  for (let stage = 0; stage < 3; stage++) { f.act('行动 调查'); f.act('行动 强攻'); }
  const before = structuredClone(f.player);
  assert.equal(f.command('结算').ok, false);
  assert.deepEqual(f.player, before);
});

test('主神空间、死亡与成神始终保留门禁，阻止普通修仙和穿梭', () => {
  const f = fixture();
  for (const status of ['active', 'dead', 'ascended']) {
    f.player.试炼宇宙.status = status;
    assert.equal(trial.isTrialUniverseActive(f.player), true);
    for (const message of ['#试炼宇宙', '#试炼宇宙 行动 强攻', '#我', '#我的练气', '#修仙帮助', '#诸天帮助', '#帮助', '#世界 你好'])
      assert.equal(trial.getTrialCommandBlock(f.player, message), '', message);
    for (const message of ['#闭关', '#突破', '#穿越世界', '#复活地球 入界 确认', '#再入仙途', '#强制再入仙途', '#我突破', '#试炼宇宙作弊'])
      assert.ok(trial.getTrialCommandBlock(f.player, message), message);
  }
  assert.ok(trial.getTrialCommandBlock({ power_place: 0.6 }, '#突破'));
  assert.equal(trial.getTrialCommandBlock(newPlayer(), '#突破'), '');
});

test('旧快照、同版本改值、位置逃逸、主角色境界变化被写保护拒绝', () => {
  const f = fixture();
  const before = structuredClone(f.player);
  f.act('进入 末日 确认');
  assert.doesNotThrow(() => trial.assertTrialWriteCurrent(before, f.player));
  assert.throws(() => trial.assertTrialWriteCurrent(f.player, before), { code: 'TRIAL_UNIVERSE_STALE_WRITE' });
  for (const mutate of [next => { delete next.试炼宇宙; }, next => { next.试炼宇宙.credits++; },
    next => { next.power_place = 0; }, next => { next.level_id = 999; },
    next => { next.试炼宇宙.revision += 2; }, next => { next.试炼宇宙.status = 'ascended'; }]) {
    const next = structuredClone(f.player);
    mutate(next);
    assert.throws(() => trial.assertTrialWriteCurrent(f.player, next), { code: 'TRIAL_UNIVERSE_STALE_WRITE' });
  }
});

test('真实完成六类试炼并多轮赚取强化/神位费用，终局对应无境但不改主境界', () => {
  const f = fixture();
  assert.equal(f.command('成神 确认').ok, false);
  for (const type of Object.keys(trial.TRIAL_WORLDS)) f.clear(type);
  assert.equal(f.player.试炼宇宙.seals.length, 6);
  assert.equal(f.player.试炼宇宙.credits, 5100);
  assert.equal(f.command('成神 确认').ok, false);
  for (const type of ['体魄', '精神']) for (let i = 0; i < 5; i++) f.act(`强化 ${type}`);
  assert.equal(f.player.试炼宇宙.credits, 1500);
  assert.equal(f.command('强化 体魄').ok, false);
  assert.equal(f.command('成神 确认').ok, false);
  for (let i = 0; i < 5; i++) f.clear();
  const before = structuredClone(f.player);
  assert.equal(f.command('成神').changed, false);
  assert.deepEqual(f.player, before);
  f.act('成神 确认');
  assert.equal(f.player.试炼宇宙.status, 'ascended');
  assert.equal(f.player.试炼宇宙.realm, '无境');
  assert.equal(f.player.试炼宇宙.credits, 250);
  assert.equal(f.player.level_id, 1);
  assert.equal(f.player.灵石, 12345);
  assert.equal(f.player.power_place, 0.6);
  assert.match(f.act('状态').message, /真神[\s\S]*无境/);
  assert.equal(f.command('成神 确认').changed, false);
  assert.equal(f.command('进入 末日 确认').changed, false);
});

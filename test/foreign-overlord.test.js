import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  FOREIGN_OVERLORD_ACTIVE_KEY,
  FOREIGN_OVERLORD_ATTACK,
  FOREIGN_OVERLORD_DEFENSE,
  FOREIGN_OVERLORD_KILL_COUNT_KEY,
  FOREIGN_OVERLORD_MAX_HP,
  FOREIGN_OVERLORD_REFINEMENT_WEIGHT,
  FOREIGN_OVERLORD_NEXT_SPAWN_KEY,
  FOREIGN_OVERLORD_PENDING_DEFEATS_KEY,
  FOREIGN_OVERLORD_SPEED,
  applyForeignOverlordBattleResult,
  createForeignOverlord,
  createForeignOverlordCombatant,
  drainPendingForeignCalamityDefeats,
  getForeignOverlordRanking,
  getForeignOverlordRewardForPlayer,
  normalizeRiftMemoryState,
  readActiveForeignOverlord,
  readForeignOverlord,
  readForeignOverlordProgress,
  registerForeignCalamityDefeat,
  resolveRiftMemoryReward,
  saveForeignCalamity,
  saveForeignOverlord,
  spawnForeignOverlordIfReady,
} from '../model/foreignCalamity.js';
import { getReviveRecoveryRatio } from '../model/gongfaProficiency.js';

function createRedisMock() {
  const values = new Map();
  const sets = new Map();
  return {
    values,
    sets,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, options = {}) {
      if (options?.NX && values.has(key)) return null;
      values.set(key, String(value));
      return 'OK';
    },
    async del(key) {
      return Number(values.delete(key));
    },
    async incr(key) {
      const next = Number(values.get(key) || 0) + 1;
      values.set(key, String(next));
      return next;
    },
    async sAdd(key, value) {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(String(value));
      return 1;
    },
    async sRem(key, value) {
      return Number(sets.get(key)?.delete(String(value)) || false);
    },
    async sMembers(key) {
      return [...(sets.get(key) || [])];
    },
    async eval(_script, { keys, arguments: args = [] }) {
      if (keys.length === 2) {
        if (values.has(keys[0])) return -1;
        values.set(keys[0], '1');
        return this.incr(keys[1]);
      }
      if (values.get(keys[0]) !== String(args[0] || '')) return 0;
      return this.del(keys[0]);
    },
  };
}

test('灾厄魔主基础数值、十倍秘法、双化身和护体准确成形', () => {
  const entity = createForeignOverlord({ sequence: 3, killCount: 29, now: 12345, random: () => 0 });
  assert.equal(entity.攻击, FOREIGN_OVERLORD_ATTACK);
  assert.equal(entity.防御, FOREIGN_OVERLORD_DEFENSE);
  assert.equal(entity.当前血量, FOREIGN_OVERLORD_MAX_HP);
  assert.equal(entity.血量上限, FOREIGN_OVERLORD_MAX_HP);
  assert.equal(entity.速度, FOREIGN_OVERLORD_SPEED);
  assert.equal(entity.暴击率, 1);
  assert.equal(entity.暴击伤害, 3);
  for (const field of ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id']) {
    assert.equal(entity[field], 16, field);
  }

  const combatant = createForeignOverlordCombatant(entity);
  assert.equal(combatant.攻击, FOREIGN_OVERLORD_ATTACK * 10);
  assert.equal(combatant.防御, FOREIGN_OVERLORD_DEFENSE * 10);
  assert.equal(combatant.速度, 1000);
  assert.equal(combatant.减伤比例, 0.7);
  assert.equal(combatant._忽略境界速度加成, true);
  assert.equal(combatant.分身.length, 2);
  assert.equal(combatant.分身[0].攻击, Math.floor(combatant.攻击 * 0.67));
  assert.equal(combatant.分身[0].防御, Math.floor(combatant.防御 * 0.67));
  assert.ok(combatant.学习的功法.includes('魔神斩天诀'));
  assert.ok(combatant.学习的功法.includes('逆命劫生经'));
  assert.equal(FOREIGN_OVERLORD_REFINEMENT_WEIGHT, 0.5);
});

test('共享血量按本体有效伤害累计，复生后基础全属性永久提升25%', () => {
  const entity = createForeignOverlord({ now: 1, random: () => 0 });
  const first = applyForeignOverlordBattleResult(entity, {
    winner: 'B',
    B_hp: FOREIGN_OVERLORD_MAX_HP - 500,
    B_revived: false,
  }, { playerId: '10001', playerName: '甲', now: 10 });
  assert.equal(first.damage, 500);
  assert.equal(entity.当前血量, FOREIGN_OVERLORD_MAX_HP - 500);

  const revivedMaxHp = FOREIGN_OVERLORD_MAX_HP * 1.25;
  const second = applyForeignOverlordBattleResult(entity, {
    winner: 'B',
    B_hp: revivedMaxHp - 800,
    B_revived: true,
  }, { playerId: '10002', playerName: '乙', now: 20 });
  assert.equal(second.revivedDuringBattle, true);
  assert.equal(second.damage, FOREIGN_OVERLORD_MAX_HP - 500 + 800);
  assert.equal(entity.攻击, FOREIGN_OVERLORD_ATTACK * 1.25);
  assert.equal(entity.防御, FOREIGN_OVERLORD_DEFENSE * 1.25);
  assert.equal(entity.元神, FOREIGN_OVERLORD_ATTACK * 1.25);
  assert.equal(entity.血量上限, revivedMaxHp);
  assert.equal(entity.revived, true);

  applyForeignOverlordBattleResult(entity, {
    winner: 'draw',
    B_hp: 0,
    B_revived: true,
  }, { playerId: '10002', playerName: '乙', now: 30 });
  assert.equal(entity.status, 'active');
  assert.equal(entity.当前血量, 1);

  applyForeignOverlordBattleResult(entity, {
    winner: 'A',
    B_hp: 0,
    B_revived: true,
  }, { playerId: '10001', playerName: '甲', now: 40 });
  assert.equal(entity.status, 'defeated');
  assert.equal(entity.defeatedBy, '10001');
});

test('贡献榜和个人页数奖励按排名及尾刀结算', () => {
  const entity = createForeignOverlord({ now: 1, random: () => 0 });
  entity.status = 'defeated';
  entity.defeatedBy = 'b';
  entity.rewardPlan = {
    page: '太虚观界经残页',
    basePageAmount: 3,
    karmaReduction: 20,
    planeFavor: 50,
  };
  entity.contributions = {
    b: { name: '乙', damage: 100 },
    a: { name: '甲', damage: 200 },
  };
  assert.deepEqual(getForeignOverlordRanking(entity).map(item => item.id), ['a', 'b']);
  assert.equal(getForeignOverlordRewardForPlayer(entity, 'a').pageAmount, 5);
  assert.equal(getForeignOverlordRewardForPlayer(entity, 'b').pageAmount, 4);
  assert.equal(getForeignOverlordRewardForPlayer(entity, 'missing'), null);
});

test('裂界残忆为35%确定性掉落并在第三次保底', () => {
  const first = resolveRiftMemoryReward(null, { bossId: 'boss-1', playerId: '1', roll: 0.99, now: 1 });
  assert.equal(first.granted, false);
  assert.equal(first.state.pity, 1);
  const second = resolveRiftMemoryReward(first.state, { bossId: 'boss-2', playerId: '1', roll: 0.99, now: 2 });
  assert.equal(second.granted, false);
  assert.equal(second.state.pity, 2);
  const third = resolveRiftMemoryReward(second.state, { bossId: 'boss-3', playerId: '1', roll: 0.99, now: 3 });
  assert.equal(third.granted, true);
  assert.equal(third.state.unlocked, true);
  assert.deepEqual(normalizeRiftMemoryState(true), { version: 1, unlocked: true, pity: 0 });

  const lucky = resolveRiftMemoryReward(null, { bossId: 'boss-4', playerId: '2', roll: 0.349, now: 4 });
  assert.equal(lucky.granted, true);
});

test('九次并发普通灾厄击杀只刷新一尊魔主，重复击杀不计数', async () => {
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    const results = await Promise.all(Array.from({ length: 9 }, (_, index) =>
      registerForeignCalamityDefeat(`calamity-${index}`, {
        random: () => 0,
        now: 1000 + index,
      })
    ));
    assert.equal(results.filter(result => result.spawned).length, 1);
    assert.equal(mock.values.get(FOREIGN_OVERLORD_KILL_COUNT_KEY), '9');
    const active = await readActiveForeignOverlord();
    assert.ok(active);
    assert.equal(active.sequence, 1);
    assert.equal((await readForeignOverlordProgress()).nextSpawn, 18);
    mock.values.set(FOREIGN_OVERLORD_NEXT_SPAWN_KEY, '9');
    await readActiveForeignOverlord();
    assert.equal(mock.values.get(FOREIGN_OVERLORD_NEXT_SPAWN_KEY), '18');

    const duplicate = await registerForeignCalamityDefeat('calamity-0', { random: () => 0 });
    assert.equal(duplicate.duplicate, true);
    assert.equal(mock.values.get(FOREIGN_OVERLORD_KILL_COUNT_KEY), '9');

    await Promise.all(Array.from({ length: 9 }, (_, index) =>
      registerForeignCalamityDefeat(`banked-${index}`, { random: () => 0 })
    ));
    assert.equal(mock.values.get(FOREIGN_OVERLORD_KILL_COUNT_KEY), '18');
    assert.equal((await readActiveForeignOverlord()).id, active.id);

    active.status = 'defeated';
    active.当前血量 = 0;
    await saveForeignOverlord(active);
    const chained = await spawnForeignOverlordIfReady({ random: () => 0, now: 2000 });
    assert.equal(chained.spawned, true);
    assert.equal(chained.entity.sequence, 2);
    assert.equal(chained.nextSpawn, 27);
  } finally {
    delete globalThis.redis;
  }
});

test('普通灾厄落盘后中断会由待处理记录幂等补计', async () => {
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    await saveForeignCalamity({ id: 'interrupted', status: 'defeated', 名号: '中断样本' });
    assert.ok(mock.sets.get(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY).has('interrupted'));
    const first = await drainPendingForeignCalamityDefeats({ random: () => 0 });
    assert.equal(first.processed, 1);
    assert.equal(mock.values.get(FOREIGN_OVERLORD_KILL_COUNT_KEY), '1');
    assert.equal(mock.sets.get(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY).has('interrupted'), false);
    const second = await drainPendingForeignCalamityDefeats({ random: () => 0 });
    assert.equal(second.processed, 0);
    assert.equal(mock.values.get(FOREIGN_OVERLORD_KILL_COUNT_KEY), '1');
  } finally {
    delete globalThis.redis;
  }
});

test('旧魔主结算不会删除已经切换的新活动指针', async () => {
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    const oldEntity = createForeignOverlord({ sequence: 1, now: 1, random: () => 0 });
    const newEntity = createForeignOverlord({ sequence: 2, now: 2, random: () => 0 });
    await saveForeignOverlord(oldEntity);
    await saveForeignOverlord(newEntity);
    oldEntity.status = 'defeated';
    oldEntity.当前血量 = 0;
    await saveForeignOverlord(oldEntity);
    assert.equal(mock.values.get(FOREIGN_OVERLORD_ACTIVE_KEY), newEntity.id);
  } finally {
    delete globalThis.redis;
  }
});

test('未过期的魔主炼化资格会阻止战利品记录提前清理', async () => {
  const mock = createRedisMock();
  globalThis.redis = mock;
  try {
    const entity = createForeignOverlord({ sequence: 1, now: 1, random: () => 0 });
    entity.status = 'defeated';
    entity.当前血量 = 0;
    entity.contributions = { '10001': { name: '甲', damage: 100 } };
    entity.rewardClaims = { '10001': { claimedAt: 1 } };
    entity.refinement = {
      playerId: '10001',
      expiresAt: Date.now() + 60_000,
      weight: 0.5,
      sourceLifeEssence: 16,
    };
    await saveForeignOverlord(entity);
    assert.ok(await readForeignOverlord(entity.id));

    entity.refinement.expiresAt = Date.now() - 1;
    await saveForeignOverlord(entity);
    assert.equal(await readForeignOverlord(entity.id), null);
  } finally {
    delete globalThis.redis;
  }
});

test('魔神斩天诀与逆命劫生经已接入技能数据', () => {
  const attackSkills = JSON.parse(fs.readFileSync(new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url), 'utf8'));
  const reviveSkills = JSON.parse(fs.readFileSync(new URL('../resources/data/item/技能组/复活技能.json', import.meta.url), 'utf8'));
  const slash = attackSkills.find(skill => skill.name === '魔神斩天诀');
  const revive = reviveSkills.find(skill => skill.name === '逆命劫生经');
  assert.equal(slash.beilv, 10);
  assert.equal(slash.不可防御, 1);
  assert.equal(slash.推条, 750);
  assert.equal(revive.恢复比例, 1);
  assert.equal(revive.恢复比例上限, 1);
  assert.equal(revive.攻击加成, 0.25);
  assert.equal(revive.防御加成, 0.25);
  assert.equal(revive.生命加成, 0.25);
  assert.ok(revive.立即行动 > 0);
  assert.equal(getReviveRecoveryRatio({}, revive), 1);
});

test('逆命劫生经实战会复活并强制抢到下一次行动', () => {
  const cwd = fileURLToPath(new URL('../../..', import.meta.url));
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get: () => () => {} });
    const { zd_battle } = await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const common = {
      暴击率: 0, 暴击伤害: 1.5, 闪避率: 0, 吸血率: 0, 穿透: 0, 法球倍率: 1,
      灵根: { name: '测试灵根', type: '普通', 法球倍率: 1 },
      生命本源: 1, mijinglevel_id: 0, xiangulevel_id: 0, huafenlevel_id: 0,
    };
    const attacker = {
      ...common, 名号: '测试进攻者', 攻击: 1_000_000, 防御: 1_000_000,
      当前血量: 1_000_000, 血量上限: 1_000_000, 速度: 3000, 学习的功法: [],
    };
    const defender = {
      ...common, 名号: '复生测试体', 攻击: 1, 防御: 1,
      当前血量: 100, 血量上限: 100, 速度: 1, 学习的功法: ['逆命劫生经'],
    };
    const result = await zd_battle(attacker, defender, {
      maxRound: 3, battleType: 'foreign_overlord', preserveHpOnTimeout: true,
    });
    assert.equal(result.B_revived, true);
    assert.equal(result.winner, 'A');
    assert.deepEqual(result.actionOrder.slice(0, 3).map(action => action.name), [
      '测试进攻者', '复生测试体', '测试进攻者',
    ]);

    const cloneFinisher = {
      ...attacker,
      名号: '分身流测试者',
      攻击: 1,
      分身: [{
        ...common, 名号: '补刀化身', 攻击: 1_000_000, 防御: 1,
        当前血量: 100, 血量上限: 100, 速度: 1, 学习的功法: [],
      }, {
        ...common, 名号: '第二补刀化身', 攻击: 1_000_000, 防御: 1,
        当前血量: 100, 血量上限: 100, 速度: 1, 学习的功法: [],
      }],
    };
    const cloneTarget = { ...defender, 名号: '分身补刀复生体', 当前血量: 1000, 血量上限: 1000 };
    const cloneResult = await zd_battle(cloneFinisher, cloneTarget, {
      maxRound: 3, battleType: 'foreign_overlord', preserveHpOnTimeout: true,
    });
    assert.equal(cloneResult.B_revived, true);
    assert.deepEqual(cloneResult.actionOrder.slice(0, 2).map(action => action.name), [
      '分身流测试者', '分身补刀复生体',
    ]);
    assert.equal(cloneResult.msg.some(line => String(line).includes('第二补刀化身')), false);

    const stalledA = {
      ...common, 名号: '僵局甲', 攻击: 1, 防御: 1_000_000,
      当前血量: 1_000_000, 血量上限: 1_000_000, 速度: 3000, 学习的功法: [],
    };
    const stalledB = { ...stalledA, 名号: '僵局乙' };
    const timeoutResult = await zd_battle(stalledA, stalledB, {
      battleType: 'foreign_overlord', preserveHpOnTimeout: true,
    });
    assert.equal(timeoutResult.winner, 'draw');
    assert.ok(timeoutResult.A_hp > 0);
    assert.ok(timeoutResult.B_hp > 0);

    Math.random = () => 0.5;
    const fateAttacker = {
      ...attacker, 名号: '命运拳测试者',
      灵根: { name: '彼岸·命运神道体', type: '命运', 法球倍率: 1 },
    };
    const fateTarget = { ...defender, 名号: '终焉伤害复生体' };
    const fateResult = await zd_battle(fateAttacker, fateTarget, {
      maxRound: 3, battleType: 'foreign_overlord', preserveHpOnTimeout: true,
    });
    assert.equal(fateResult.B_revived, true);
    assert.deepEqual(fateResult.actionOrder.slice(0, 2).map(action => action.name), [
      '命运拳测试者', '终焉伤害复生体',
    ]);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

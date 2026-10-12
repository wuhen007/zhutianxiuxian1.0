import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import * as foreignModel from '../model/foreignCalamity.js';
import {
  FOREIGN_CALAMITY_MAX_ACTIVE,
  FOREIGN_CALAMITY_INDEX_KEY,
  FOREIGN_CALAMITY_CULL_REPORT_KEY,
  FOREIGN_OVERLORD_INDEX_KEY,
  FOREIGN_OVERLORD_ACTIVE_KEY,
  FOREIGN_OVERLORD_KILL_COUNT_KEY,
  FOREIGN_OVERLORD_PENDING_DEFEATS_KEY,
  enforceForeignCalamityLimit,
  formatForeignCalamityCullReport,
  listForeignCalamities,
  readForeignCalamityCullReport,
  spawnForeignCalamities,
} from '../model/foreignCalamity.js';
import { getPlayerMutationLockStats } from '../utils/playerMutationLock.js';

const ENTITY_PREFIX = 'xiuxian:foreign-calamity:entity:';
const LOCK_PREFIX = 'xiuxian:foreign-calamity:lock:';
const POPULATION_LOCK = `${LOCK_PREFIX}population`;
const keyFor = id => `${ENTITY_PREFIX}${id}`;
const killers = ['巡天的绝世天骄', '镇界的诸天强者'];
const EXPECTED_ACTIVE_LIMIT = 100;

function entity(index, extra = {}) {
  const id = `fixture-${String(index).padStart(4, '0')}`;
  return {
    id, 名号: `灾厄${index}`, type: ['孽兽', '域外邪魔', '外道修士'][index % 3],
    worldYear: 1000 + index * 1000, spawnedAt: 1000 + index,
    status: 'active', 当前血量: 100, 血量上限: 100, ...extra,
  };
}

function fixture(t, initial = []) {
  const previousRedis = globalThis.redis;
  const values = new Map();
  const sets = new Map();
  const operations = [];
  let onSet = null;
  let onEval = null;
  const put = item => {
    values.set(keyFor(item.id), JSON.stringify(item));
    if (!sets.has(FOREIGN_CALAMITY_INDEX_KEY)) sets.set(FOREIGN_CALAMITY_INDEX_KEY, new Set());
    sets.get(FOREIGN_CALAMITY_INDEX_KEY).add(item.id);
  };
  initial.forEach(put);
  globalThis.redis = {
    async get(key) { return values.get(key) ?? null; },
    async set(key, value, options = {}) {
      operations.push({ method: 'set', key, value: String(value), options });
      if (key === POPULATION_LOCK) {
        assert.equal(getPlayerMutationLockStats('foreign-calamity:population').active, true,
          '应先持进程内 population 锁，再取得 Redis 锁');
      }
      if (onSet) await onSet(key, value, options);
      if (options.NX && values.has(key)) return null;
      values.set(key, String(value));
      return 'OK';
    },
    async del(key) {
      operations.push({ method: 'del', key });
      if (key.startsWith(ENTITY_PREFIX)) {
        assert.ok(values.has(`${LOCK_PREFIX}${key.slice(ENTITY_PREFIX.length)}`), '巡猎删除必须持实体锁');
        assert.ok(values.has(POPULATION_LOCK), '巡猎删除必须持 population 锁');
      }
      return Number(values.delete(key));
    },
    async sAdd(key, id) {
      operations.push({ method: 'sAdd', key, id: String(id) });
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(String(id));
      return 1;
    },
    async sRem(key, id) {
      operations.push({ method: 'sRem', key, id: String(id) });
      return Number(sets.get(key)?.delete(String(id)) || false);
    },
    async sMembers(key) { return [...(sets.get(key) || [])]; },
    async incr(key) {
      operations.push({ method: 'incr', key });
      const next = Number(values.get(key) || 0) + 1;
      values.set(key, String(next));
      return next;
    },
    async eval(_script, { keys, arguments: args = [] }) {
      operations.push({ method: 'eval', keys });
      if (onEval) onEval(keys, args);
      if (keys.length >= 4 && keys[1] === FOREIGN_CALAMITY_INDEX_KEY) {
        let activeCount = 0;
        let targetActive = false;
        for (const key of keys.slice(3)) {
          try {
            const item = JSON.parse(values.get(key) || 'null');
            if (item?.status !== 'active') continue;
            activeCount++;
            if (key === keys[0]) targetActive = true;
          } catch { /* Lua 的 pcall(cjson.decode) 同样跳过损坏记录。 */ }
        }
        if (activeCount <= Number(args[0]) || !targetActive) return [0, activeCount];
        assert.ok(values.has(`${LOCK_PREFIX}${args[1]}`), '原子巡猎必须持实体锁');
        assert.ok(values.has(POPULATION_LOCK), '原子巡猎必须持 population 锁');
        operations.push({ method: 'del', key: keys[0] });
        values.delete(keys[0]);
        sets.get(keys[1])?.delete(args[1]);
        sets.get(keys[2])?.delete(args[1]);
        return [1, activeCount - 1];
      }
      if (keys.length === 2) {
        if (values.has(keys[0])) return -1;
        values.set(keys[0], '1');
        return this.incr(keys[1]);
      }
      if (values.get(keys[0]) !== String(args[0] || '')) return 0;
      return this.del(keys[0]);
    },
  };
  t.after(() => {
    if (previousRedis === undefined) delete globalThis.redis;
    else globalThis.redis = previousRedis;
  });
  return {
    values, sets, operations, put,
    onSet: callback => { onSet = callback; },
    onEval: callback => { onEval = callback; },
    active: () => [...(sets.get(FOREIGN_CALAMITY_INDEX_KEY) || [])]
      .map(id => JSON.parse(values.get(keyFor(id)) || 'null'))
      .filter(item => item?.status === 'active'),
    reportWrites: () => operations.filter(item => item.method === 'set' && item.key === FOREIGN_CALAMITY_CULL_REPORT_KEY),
  };
}

for (const count of [0, EXPECTED_ACTIVE_LIMIT - 1, EXPECTED_ACTIVE_LIMIT, EXPECTED_ACTIVE_LIMIT + 1]) {
  test(`${count} 尊普通灾厄按共享 100 尊上限处理，阈值内不产生巡猎报告`, async t => {
    const f = fixture(t, Array.from({ length: count }, (_, index) => entity(index)));
    assert.equal(FOREIGN_CALAMITY_MAX_ACTIVE, EXPECTED_ACTIVE_LIMIT);
    const result = await enforceForeignCalamityLimit({ random: () => 0, now: 123 });
    assert.equal(result.entities.filter(item => item.status === 'active').length, Math.min(count, EXPECTED_ACTIVE_LIMIT));
    assert.equal(f.active().length, Math.min(count, EXPECTED_ACTIVE_LIMIT));
    if (count <= EXPECTED_ACTIVE_LIMIT) {
      assert.equal(result.report?.count || 0, 0);
      assert.equal(f.reportWrites().length, 0);
    } else {
      assert.equal(result.report.count, 1);
      assert.equal(result.report.remaining, EXPECTED_ACTIVE_LIMIT);
      assert.equal(result.report.at, 123);
      assert.equal(f.values.has(keyFor(entity(0).id)), false);
    }
  });
}

test('三类普通灾厄共用上限，并按 worldYear、spawnedAt、id 先后巡猎旧目标', async t => {
  const early = [
    entity(1, { id: 'same-year-b', worldYear: 1000, spawnedAt: 20 }),
    entity(2, { id: 'same-year-a', worldYear: 1000, spawnedAt: 20 }),
    entity(3, { id: 'earliest-time', worldYear: 1000, spawnedAt: 10 }),
    entity(4, { id: 'later-year', worldYear: 2000, spawnedAt: 1 }),
  ];
  const f = fixture(t, [...early, ...Array.from({ length: EXPECTED_ACTIVE_LIMIT - 1 }, (_, index) => entity(index + 10))]);
  const { report } = await enforceForeignCalamityLimit({ random: () => 0, now: 456 });
  assert.equal(report.count, 3);
  assert.deepEqual(report.victims.map(item => item.id), ['earliest-time', 'same-year-a', 'same-year-b']);
  assert.ok(f.values.has(keyFor('later-year')));
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(new Set(f.active().map(item => item.type)).size, 3);
});

test('列表读取使 170 尊历史积压收敛至 100，真正删除 NPC 数据与普通索引', async t => {
  const f = fixture(t, Array.from({ length: EXPECTED_ACTIVE_LIMIT + 70 }, (_, index) => entity(index)));
  const rows = await listForeignCalamities();
  assert.equal(rows.length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(f.sets.get(FOREIGN_CALAMITY_INDEX_KEY).size, EXPECTED_ACTIVE_LIMIT);
  assert.equal([...f.values.keys()].filter(key => key.startsWith(ENTITY_PREFIX)).length, EXPECTED_ACTIVE_LIMIT);
  assert.deepEqual(rows.map(item => item.id).sort(), Array.from({ length: EXPECTED_ACTIVE_LIMIT }, (_, index) => entity(index + 70).id));
  const report = await readForeignCalamityCullReport();
  assert.equal(report.count, 70);
  assert.equal(report.remaining, EXPECTED_ACTIVE_LIMIT);
  assert.equal(report.victims.length, 5);
});

test('跨越十七个千年逐波生成 170 尊；每波结束活跃不超 100 且生成标记先于清理', async t => {
  const f = fixture(t);
  const reports = [];
  const spawned = await spawnForeignCalamities(0, 17_000, {
    players: [], random: () => 0.999999,
    onCull(report) {
      reports.push(structuredClone(report));
      assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
      for (const current of f.active()) {
        assert.equal(f.values.get(`xiuxian:foreign-calamity:spawn:${current.worldYear}`), '1');
      }
    },
  });
  assert.equal(spawned.length, EXPECTED_ACTIVE_LIMIT + 70);
  assert.equal(new Set(spawned.map(item => item.id)).size, EXPECTED_ACTIVE_LIMIT + 70);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.deepEqual([...new Set(f.active().map(item => item.worldYear))].sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => (index + 8) * 1000));
  assert.equal(reports.reduce((total, report) => total + report.count, 0), 70);
  assert.deepEqual(await spawnForeignCalamities(0, 17_000, { players: [], random: () => 0.999999 }), []);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
});

test('没有跨过新千年仍会先清历史存量，并透传本次巡猎回调', async t => {
  const f = fixture(t, Array.from({ length: EXPECTED_ACTIVE_LIMIT + 5 }, (_, index) => entity(index)));
  const reports = [];
  const spawned = await spawnForeignCalamities(5500, 5600, {
    players: [], random: () => 0, onCull: report => reports.push(report),
  });
  assert.deepEqual(spawned, []);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].count, 5);
});

test('已败待领奖、独立魔主及魔主击杀进度保持原样，NPC 巡猎不走玩家奖励队列', async t => {
  const pending = entity(1000, { id: 'pending-reward', status: 'defeated', 当前血量: 0, defeatedBy: 'player', rewardPlan: { groups: ['locked'] } });
  const f = fixture(t, [...Array.from({ length: EXPECTED_ACTIVE_LIMIT + 5 }, (_, index) => entity(index)), pending]);
  const overlordKey = 'xiuxian:foreign-calamity:overlord:entity:boss';
  const overlord = JSON.stringify({ id: 'boss', status: 'active', type: '灾厄魔主', 当前血量: 999 });
  f.values.set(overlordKey, overlord);
  f.values.set(FOREIGN_OVERLORD_ACTIVE_KEY, 'boss');
  f.values.set(FOREIGN_OVERLORD_KILL_COUNT_KEY, '8');
  f.sets.set(FOREIGN_OVERLORD_INDEX_KEY, new Set(['boss']));
  f.sets.set(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, new Set(['pending-reward']));
  const rows = await listForeignCalamities();
  assert.equal(rows.length, EXPECTED_ACTIVE_LIMIT + 1);
  assert.deepEqual(rows.find(item => item.id === pending.id), pending);
  assert.equal(f.values.get(keyFor(pending.id)), JSON.stringify(pending));
  assert.equal(f.values.get(overlordKey), overlord);
  assert.equal(f.values.get(FOREIGN_OVERLORD_ACTIVE_KEY), 'boss');
  assert.deepEqual([...f.sets.get(FOREIGN_OVERLORD_INDEX_KEY)], ['boss']);
  assert.equal(f.values.get(FOREIGN_OVERLORD_KILL_COUNT_KEY), '8');
  assert.deepEqual([...f.sets.get(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY)], ['pending-reward']);
  assert.equal(f.operations.some(item => item.method === 'incr'), false);
  assert.equal(f.operations.some(item => item.method === 'sAdd' && item.key === FOREIGN_OVERLORD_PENDING_DEFEATS_KEY), false);
  assert.equal(f.operations.some(item => item.method === 'set' && item.key.startsWith(ENTITY_PREFIX)), false);
});

test('最旧灾厄正在战斗时跳过它，巡猎其他目标补足清理数', async t => {
  const initial = Array.from({ length: EXPECTED_ACTIVE_LIMIT + 2 }, (_, index) => entity(index));
  const f = fixture(t, initial);
  f.values.set(`${LOCK_PREFIX}${initial[0].id}`, 'active-battle');
  const { report } = await enforceForeignCalamityLimit({ random: () => 0 });
  assert.deepEqual(report.victims.map(item => item.id), [initial[1].id, initial[2].id]);
  assert.equal(f.values.get(keyFor(initial[0].id)), JSON.stringify(initial[0]));
  assert.equal(f.values.get(`${LOCK_PREFIX}${initial[0].id}`), 'active-battle');
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
});

test('全部目标正在战斗时保留战局，下一次空闲列表读取再收敛', async t => {
  const initial = Array.from({ length: EXPECTED_ACTIVE_LIMIT + 1 }, (_, index) => entity(index));
  const f = fixture(t, initial);
  for (const item of initial) f.values.set(`${LOCK_PREFIX}${item.id}`, 'active-battle');
  const first = await enforceForeignCalamityLimit();
  assert.equal(first.report?.count || 0, 0);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT + 1);
  for (const item of initial) f.values.delete(`${LOCK_PREFIX}${item.id}`);
  assert.equal((await listForeignCalamities()).length, EXPECTED_ACTIVE_LIMIT);
});

test('扫描后刚被玩家击败的目标在实体锁内复核保留，不额外清理已达上限的剩余池', async t => {
  const initial = Array.from({ length: EXPECTED_ACTIVE_LIMIT + 1 }, (_, index) => entity(index));
  const f = fixture(t, initial);
  const defeated = { ...initial[0], status: 'defeated', 当前血量: 0, defeatedBy: 'winner', rewardPlan: { locked: true } };
  let changed = false;
  f.onSet(key => {
    if (!changed && key === `${LOCK_PREFIX}${initial[0].id}`) {
      changed = true;
      f.put(defeated);
      f.sets.set(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, new Set([defeated.id]));
    }
  });
  const result = await enforceForeignCalamityLimit();
  assert.ok(changed);
  assert.equal(f.values.get(keyFor(defeated.id)), JSON.stringify(defeated));
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(result.report?.count || 0, 0);
  assert.deepEqual([...f.sets.get(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY)], [defeated.id]);
});

test('获取最旧实体锁时另一个最新目标刚被玩家击败，原子计数阻止多杀并报告真实剩余 100', async t => {
  const initial = Array.from({ length: EXPECTED_ACTIVE_LIMIT + 1 }, (_, index) => entity(index));
  const f = fixture(t, initial);
  const defeated = { ...initial.at(-1), status: 'defeated', 当前血量: 0, defeatedBy: 'winner', rewardPlan: { locked: true } };
  let changed = false;
  f.onSet(key => {
    if (!changed && key === `${LOCK_PREFIX}${initial[0].id}`) {
      changed = true;
      f.put(defeated);
      f.sets.set(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, new Set([defeated.id]));
    }
  });
  const result = await enforceForeignCalamityLimit();
  assert.ok(changed);
  assert.equal(f.values.get(keyFor(initial[0].id)), JSON.stringify(initial[0]));
  assert.equal(f.values.get(keyFor(defeated.id)), JSON.stringify(defeated));
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(result.entities.filter(item => item.status === 'active').length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(result.report.count, 0);
  assert.equal(result.report.remaining, EXPECTED_ACTIVE_LIMIT);
  assert.equal(f.reportWrites().length, 0);
  assert.equal(f.operations.filter(item => item.method === 'del' && item.key.startsWith(ENTITY_PREFIX)).length, 0);
  assert.deepEqual([...f.sets.get(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY)], [defeated.id]);
});

test('Lua 提交前当前目标已败时保留奖励，即使另有超额活跃目标也只清理仍存活者', async t => {
  const initial = Array.from({ length: EXPECTED_ACTIVE_LIMIT + 2 }, (_, index) => entity(index));
  const f = fixture(t, initial);
  const defeated = { ...initial[0], status: 'defeated', 当前血量: 0, defeatedBy: 'winner', rewardPlan: { locked: true } };
  let changed = false;
  f.onEval(keys => {
    if (!changed && keys.length >= 4 && keys[0] === keyFor(defeated.id)) {
      changed = true;
      f.put(defeated);
      f.sets.set(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY, new Set([defeated.id]));
    }
  });
  const result = await enforceForeignCalamityLimit();
  assert.ok(changed);
  assert.equal(f.values.get(keyFor(defeated.id)), JSON.stringify(defeated));
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(result.report.count, 1);
  assert.equal(result.report.remaining, EXPECTED_ACTIVE_LIMIT);
  assert.deepEqual(result.report.victims.map(item => item.id), [initial[1].id]);
  assert.deepEqual([...f.sets.get(FOREIGN_OVERLORD_PENDING_DEFEATS_KEY)], [defeated.id]);
});

test('两个相同年份的并发生成调用串行提交，不重复生成或过量巡猎', async t => {
  const f = fixture(t);
  const reports = [];
  const options = { players: [], random: () => 0.999999, onCull: report => reports.push(report) };
  const results = await Promise.all([
    spawnForeignCalamities(0, 12_000, options),
    spawnForeignCalamities(0, 12_000, options),
  ]);
  const all = results.flat();
  assert.equal(all.length, EXPECTED_ACTIVE_LIMIT + 20);
  assert.equal(new Set(all.map(item => item.id)).size, EXPECTED_ACTIVE_LIMIT + 20);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(reports.reduce((sum, report) => sum + report.count, 0), 20);
  assert.equal([...f.values.keys()].filter(key => key.startsWith('xiuxian:foreign-calamity:spawn:')).length, 12);
});

test('并发列表清理和重复清理不超杀，不重复写最近巡猎报告', async t => {
  const f = fixture(t, Array.from({ length: EXPECTED_ACTIVE_LIMIT + 1 }, (_, index) => entity(index)));
  await Promise.all([listForeignCalamities(), listForeignCalamities()]);
  assert.equal(f.active().length, EXPECTED_ACTIVE_LIMIT);
  assert.equal(f.reportWrites().length, 1);
  const raw = f.values.get(FOREIGN_CALAMITY_CULL_REPORT_KEY);
  const result = await enforceForeignCalamityLimit({ now: 999999 });
  assert.equal(result.report?.count || 0, 0);
  assert.equal(f.reportWrites().length, 1);
  assert.equal(f.values.get(FOREIGN_CALAMITY_CULL_REPORT_KEY), raw);
});

test('巡猎报告只覆盖最新一份、最多保留 5 个目标，并可显示指定 NPC 称谓', async t => {
  const f = fixture(t, Array.from({ length: EXPECTED_ACTIVE_LIMIT + 70 }, (_, index) => entity(index)));
  const first = await enforceForeignCalamityLimit({ now: 100, random: () => 0 });
  for (let index = EXPECTED_ACTIVE_LIMIT + 70; index < EXPECTED_ACTIVE_LIMIT + 105; index++) f.put(entity(index));
  const second = await enforceForeignCalamityLimit({ now: 200, random: () => 0.999999 });
  const stored = await readForeignCalamityCullReport();
  assert.deepEqual(stored, second.report);
  assert.equal(stored.count, 35);
  assert.equal(stored.at, 200);
  assert.equal(stored.victims.length, 5);
  assert.equal(f.reportWrites().length, 2);
  for (const report of [first.report, second.report]) {
    assert.ok(report.victims.every(item => killers.includes(item.killer)));
    const formatted = formatForeignCalamityCullReport(report);
    assert.match(formatted, /巡猎|镇压/);
    assert.ok(formatted.includes(String(report.count)));
    for (const item of report.victims) {
      assert.equal(typeof item.name, 'string');
      assert.equal(typeof item.type, 'string');
      assert.ok(formatted.includes(item.name));
      assert.ok(formatted.includes(item.killer));
    }
  }
  assert.equal(new Set([...first.report.victims, ...second.report.victims].map(item => item.killer)).size, 2);
  assert.ok(f.values.get(FOREIGN_CALAMITY_CULL_REPORT_KEY).length < 2000);
});

test('population Redis 锁持续占用时重试后报错，既不伪装空波也不写生成标记', async t => {
  const f = fixture(t);
  f.values.set(POPULATION_LOCK, 'other-process');
  await assert.rejects(() => spawnForeignCalamities(0, 1000, { players: [], random: () => 0 }));
  const attempts = f.operations.filter(item => item.method === 'set' && item.key === POPULATION_LOCK);
  assert.ok(attempts.length >= 4 && attempts.length <= 5);
  assert.equal(f.active().length, 0);
  assert.equal(f.values.get(POPULATION_LOCK), 'other-process');
  assert.equal(f.values.has('xiuxian:foreign-calamity:spawn:1000'), false);
  f.values.delete(POPULATION_LOCK);
  assert.equal((await spawnForeignCalamities(0, 1000, { players: [], random: () => 0 })).length, 1);
});

test('实际命令类的三种灾厄别名共用列表、显示 100 上限与最近巡猎，邪魔讨伐正确取参数', async t => {
  const f = fixture(t, Array.from({ length: EXPECTED_ACTIVE_LIMIT + 1 }, (_, index) => entity(index)));
  const source = fs.readFileSync(new URL('../apps/Boss/ForeignCalamity.js', import.meta.url), 'utf8')
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export class', 'class');
  const Constructor = vm.runInNewContext(`${source}\nForeignCalamity`, {
    ...foreignModel,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    bigNumberTransform: String,
    existplayer: async () => true,
  });
  const app = new Constructor();
  const replies = [];
  const send = async msg => {
    const rule = app.rule.find(rule => new RegExp(rule.reg).test(msg));
    assert.ok(rule, msg);
    return app[rule.fnc]({ msg, user_id: 'fixture-player', reply: async text => replies.push(text) });
  };
  for (const name of ['域外灾厄', '域外邪祟', '域外邪魔']) {
    await send(`#${name}`);
    assert.match(replies.at(-1), /100\/100/);
    assert.match(replies.at(-1), /最近.*巡猎/);
    assert.match(replies.at(-1), /巡天的绝世天骄|镇界的诸天强者/);
  }
  const inputs = [];
  app.resolveTarget = async input => { inputs.push(input); return null; };
  for (const name of ['域外灾厄', '域外邪祟', '域外邪魔']) await send(`#讨伐${name} 1`);
  assert.deepEqual(inputs, ['1', '1', '1']);
  for (const item of f.active()) f.values.delete(keyFor(item.id));
  await send('#域外邪魔');
  assert.match(replies.at(-1), /0\/100/);
  assert.match(replies.at(-1), /最近.*巡猎/);
});

test('时代推进先生成再修复位面、绝灵侵蚀和持久化；失败不触碰这些副作用，单独巡猎也广播', async () => {
  const source = fs.readFileSync(new URL('../apps/tasks/EraChangeTask.js', import.meta.url), 'utf8');
  const methodStart = source.indexOf('async advanceEra(e)');
  const start = source.indexOf('const era = this.set.Era;', methodStart);
  const end = source.indexOf('await this.processChengxianRoad(', start);
  assert.ok(start >= 0 && end > start, '应能定位实际时代生成和广播流程');
  const block = source.slice(start, end);
  for (const fail of [false, true]) {
    const events = [];
    const messages = [];
    const report = { count: 1, remaining: EXPECTED_ACTIVE_LIMIT, at: 1, victims: [{ id: 'old', name: '旧敌', type: '孽兽', killer: killers[0] }] };
    const run = vm.runInNewContext(`(async function () { ${block} })`, {
      getRealmEventWorldYear: (index, years) => index * 10_000 + years,
      fs: { existsSync: () => false },
      data: { filePathMap: { weimianList: 'fixture-only' } },
      formatForeignCalamityCullReport,
      spawnForeignCalamities: async (_before, _after, options) => {
        events.push('spawn');
        if (fail) throw new Error('simulated population lock failure');
        options.onCull(report);
        return [];
      },
    });
    const host = {
      set: { Era: { current: { index: 4, years: 0, epoch: 1, totalYears: 40_000 }, yearlyAdvance: 1000, weimianRepairInterval: 1000, pushNotice: true } },
      eras: Array.from({ length: 5 }, (_, index) => ({ name: `时代${index}` })),
      async repairWeimian() { events.push('repair'); },
      async handleJuelingEraLoss() {
        events.push('loss');
        return { totalLossCount: 0, lossReports: [], sealedCount: 0, immuneCount: 0 };
      },
      async applyEraLifespanTransition(_oldIndex, _index, persist) { events.push('transition'); await persist(); },
      async persistEraCurrent() { events.push('persist'); },
      async broadcastMessage(message) { events.push('broadcast'); messages.push(message); },
    };
    if (fail) {
      await assert.rejects(() => run.call(host), /population lock failure/);
      assert.deepEqual(events, ['spawn']);
    } else {
      await run.call(host);
      assert.deepEqual(events, ['spawn', 'repair', 'loss', 'transition', 'persist', 'broadcast']);
      assert.match(messages[0], /诸天巡猎/);
      assert.match(messages[0], /旧敌/);
    }
  }
});

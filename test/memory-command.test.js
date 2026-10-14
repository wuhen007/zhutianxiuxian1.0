import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as memory from '../model/memoryPath.js';
import * as suiyun from '../model/suiyun.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { getSuiyunCreationRestriction } from '../model/suiyunCreation.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const strip = text => text.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*\r?\n/gm, '').replace(/^export /gm, '');

function fixture() {
  const state = {
    player: { 名号: '记忆使者', 血量上限: 1000, 当前血量: 1000, 攻击: 100, 防御: 100, 学习的功法: ['六相冰封'] },
    inventory: { 道具: [], 装备: [], 功法: [] }, values: new Map(), writes: 0, grants: 0, roots: new Map(),
    failWrite: false, events: 0,
    settings: { Era: { current: { index: 1, years: 7, epoch: 2 } } },
  };
  memory.activateMemoryPath(state.player);
  const dependencies = {
    ...memory, ...suiyun, path, fs, randomUUID, withPlayerMutationLock, getSuiyunCreationRestriction,
    __PATH: { player_path: '/fixture/player', najie_path: '/fixture/bag' },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    data: {
      tszb_list: JSON.parse(read('resources/data/item/特殊装备列表.json')),
      talent_list: JSON.parse(read('resources/data/item/灵根列表.json')),
      minggeList: [], weimiantianjiao_list: [{ 名号: '被俘天骄' }],
    },
    getSuiyunTimeline: () => 'main',
    claimMemoryUnique: (_kind, owner) => {
      if (state.roots.size && !state.roots.has(owner)) return { ok: false };
      const alreadyOwned = state.roots.has(owner);
      state.roots.set(owner, true);
      return { ok: true, alreadyOwned };
    },
    releaseMemoryUnique: (_kind, owner) => state.roots.delete(owner),
    getActiveZhutianAvatarName: player => player.诸天镜系统?.当前化身 || '',
    verc: () => true, channel: async id => id, existplayer: async id => id === 'owner',
    getSuperdimensionalRewriteTarget: (e, fallback) => e.at || fallback,
    Read_player: async () => clone(state.player),
    Write_player: async (_id, player) => {
      if (state.failWrite) { state.failWrite = false; throw new Error('player-write-failed'); }
      if (state.advanceClockOnWrite) state.settings.Era.current.years++;
      state.player = clone(player); state.writes++;
    },
    Read_najie: async () => clone(state.inventory),
    Write_najie: async (_id, inventory) => { state.inventory = clone(inventory); return true; },
    Read_equipment: async () => ({}), Write_equipment: async () => {}, player_efficiency: async () => {},
    Add_najie_thing: async (_id, raw, category, amount, _quality, _lock, options) => {
      if (state.inventory._rewardClaims?.[options.idempotencyKey]) return;
      if (state.failGrant) { state.failGrant = false; throw new Error('grant-failed'); }
      state.inventory[category] ||= [];
      const item = typeof raw === 'object' ? clone(raw) : { name: raw, class: category };
      state.inventory[category].push({ ...item, 数量: amount });
      state.inventory._rewardClaims ||= {};
      state.inventory._rewardClaims[options.idempotencyKey] = { amount };
      state.grants++;
    },
    foundthing: async name => name === '近似查询' ? { name: '另一件物品', class: '草药' }
      : name === '测试灵草' ? { name, class: '草药', 稀有度: 10 }
      : name === '奇怪的数据' ? { name, class: '道具', 不可创造: 1 } : null,
    FileRollbackTransaction: class {
      constructor() { this.before = clone({ player: state.player, inventory: state.inventory }); }
      capture(file) { if (file === '/fixture/config') this.before.settings = clone(state.settings); }
      commit() {} rollback() { Object.assign(state, clone(this.before)); }
    },
    redis: {
      get: async key => state.values.get(key) || null,
      set: async (key, value, options) => {
        if (options?.NX && state.values.has(key)) return null;
        state.values.set(key, value); return 'OK';
      },
      del: async key => state.values.delete(key),
    },
    withForeignCalamityLock: async (_id, task) => task(),
    BOSS4: class {
      getPendingEncounterKey(id) { return `tianjiao:pending:${id}`; }
      async readPendingEncounter(id) { const raw = state.values.get(this.getPendingEncounterKey(id)); return raw ? JSON.parse(raw) : null; }
      async claimPendingEncounter() { return true; }
      async releasePendingEncounterClaim() {}
      async finalizePendingTianjiaoDeath(_e, pending, _id, _suppress, options) {
        assert.equal(options.namespace, 'memory');
        if (state.deadTianjiao) return null;
        return { settlementId: 'true-death', sourceLifeEssence: 100 };
      }
    },
    zd_battle: async () => ({ winner: state.loseBattle ? 'B' : 'A', A_hp: 50, msg: [] }),
    ForwardMsg: async () => {},
    RealmEvents: { triggerTreasureFromTianji: async () => { state.events++; return { ok: true, message: '已显化先天至宝' }; } },
    config: { getConfigPath: () => '/fixture/config', getConfig: () => clone(state.settings), setConfig(_a, _b, value) {
      state.settings = clone(value);
      if (state.failConfig) throw new Error('config-write-failed');
    } },
    getLifeSourceRepairMaximum: () => 999,
    getMinggeEffects: () => ({}),
  };
  const base = new Function(...Object.keys(dependencies), `${strip(read('apps/User/Suiyun.js'))};return { Suiyun, parseSuiyunRewrite };`)(...Object.values(dependencies));
  Object.assign(dependencies, base);
  const App = new Function(...Object.keys(dependencies), `${strip(read('apps/User/MemoryPath.js'))};return MemoryPath;`)(...Object.values(dependencies));
  state.app = new App();
  state.app.refreshAttributes = async () => { state.attributeStage = memory.getMemoryStage(state.player); };
  state.event = (msg, extras = {}) => ({ user_id: 'owner', isGroup: true, msg, reply: async message => message, ...extras });
  state.data = dependencies.data;
  return state;
}

test('记忆命途命令完整注册，父类岁云命令未混入', () => {
  const f = fixture();
  for (const command of ['#消耗奇怪的数据', '#命途模拟', '#逐火之旅', '#行者之旅', '#泰坦试炼', '#命途行进', '#星神觐见', '#六相冰封 灾厄', '#记忆碎片 兑换 潜力 100', '#记忆更改 至宝线索', '#记忆造物 测试灵草', '#记忆回溯']) {
    assert.ok(f.app.rule.some(rule => new RegExp(rule.reg).test(command)), command);
  }
  assert.equal(f.app.rule.some(rule => new RegExp(rule.reg).test('#岁云见证')), false);
});

test('数据消耗与觉醒秘籍原子写入，唯一占用失败不扣物品', async () => {
  const f = fixture();
  f.player = { 名号: '新承继者', 学习的功法: [], 灵根: { name: '木灵根' } };
  f.inventory.道具.push({ name: '奇怪的数据', 数量: 1 });
  f.failWrite = true;
  await assert.rejects(f.app.consumeData(f.event('#消耗奇怪的数据')), /player-write-failed/);
  assert.equal(f.inventory.道具[0].数量, 1);
  assert.equal(f.roots.size, 0);
  assert.equal(f.inventory.功法.length, 0);
  await f.app.consumeData(f.event('#消耗奇怪的数据'));
  assert.equal(f.player.灵根.name, '金血之体');
  assert.equal(f.player.天资等级, '星神之资');
  assert.equal(f.inventory.道具[0].数量, 0);
  assert.equal(f.inventory.功法[0].name, '六相冰封');
  await f.app.consumeData(f.event('#消耗奇怪的数据'));
  assert.equal(f.inventory.功法.length, 1);
});

test('并发星神觐见仅获得一次日奖励，命途模拟满值才抽因子', async () => {
  const f = fixture();
  await Promise.all([f.app.cultivate(f.event('#星神觐见')), f.app.cultivate(f.event('#星神觐见'))]);
  assert.ok(f.player.记忆棱镜 >= 2000 && f.player.记忆棱镜 <= 5000);
  await f.app.simulate(f.event('#命途模拟'));
  assert.equal(Object.keys(f.player.记忆命途.因子).length, 0);
  f.player.模拟值 = 100;
  await f.app.simulate(f.event('#命途模拟'));
  assert.equal(Object.keys(f.player.记忆命途.因子).length, 1);
  assert.equal(f.player.模拟值, 0);
  assert.equal(f.player.生命本源, 350);
});

test('浪漫三层奖励和诗篇可以补发，重复面板及发放中断不复制已入库装备', async () => {
  const f = fixture();
  f.player.灵根 = memory.createMemoryRoot(4);
  f.player.记忆命途.因子 = { 浪漫: 3 };
  f.player.记忆命途.已获诗篇 = true;
  f.player.记忆命途.碎片结算时间 = Date.now();
  f.failGrant = true;
  await assert.rejects(f.app.power(f.event('#记忆碎片')), /grant-failed/);
  await f.app.power(f.event('#记忆碎片'));
  await f.app.power(f.event('#记忆碎片'));
  assert.equal(f.inventory.装备.length, 9);
  assert.ok(f.inventory.装备.every(item => item.绑定者 === 'owner'));
  assert.equal(f.inventory.道具.filter(item => item.name === '记忆之诗篇').length, 1);
  assert.equal(f.grants, 10);
});

test('棱镜兑换两种货币，失败及并发请求不会透支或重复转换', async () => {
  const f = fixture();
  f.player.记忆棱镜 = 10100;
  await f.app.power(f.event('#记忆碎片 兑换 潜力 100'));
  assert.equal(f.player.仙道潜力, 2);
  await Promise.all([f.app.power(f.event('#记忆碎片 兑换 碎片 10000')), f.app.power(f.event('#记忆碎片 兑换 碎片 10000'))]);
  assert.equal(f.player.记忆棱镜, 0);
  assert.equal(f.player.记忆碎片, .1);
});

test('晋阶发奖中断仍刷新新阶段属性，条件不足和面板也可修复旧档属性', async () => {
  const f = fixture();
  f.player.mijinglevel_id = 10;
  f.player.记忆命途.因子 = { 门径: 1, 浪漫: 1, 理性: 1 };
  f.failGrant = true;
  await assert.rejects(f.app.advance(f.event('#命途行进')), /grant-failed/);
  assert.equal(f.player.灵根.name, '逐火行者');
  assert.equal(f.attributeStage, 2);
  f.attributeStage = 1;
  await f.app.advance(f.event('#命途行进'));
  assert.equal(f.attributeStage, 2);
  assert.equal(f.inventory.装备.length, 3);
  f.attributeStage = 1;
  await f.app.power(f.event('#记忆碎片'));
  assert.equal(f.attributeStage, 2);
  assert.equal(f.inventory.装备.length, 3);
});

test('逐火与泰坦命令执行冷却、失败保留进度，半神与无漏阶段奖励落盘', async () => {
  const f = fixture();
  f.player.灵根 = memory.createMemoryRoot(2);
  f.player.mijinglevel_id = 12;
  f.player.记忆命途.因子 = Object.fromEntries(memory.MEMORY_FACTORS.slice(0, 6).map(name => [name, 1]));
  await f.app.journey(f.event('#逐火之旅'));
  await f.app.journey(f.event('#行者之旅'));
  assert.equal(f.player.记忆命途.逐火次数, 1);
  f.player.记忆命途.逐火次数 = 12;
  f.player.记忆命途.因子 = Object.fromEntries(memory.MEMORY_FACTORS.slice(0, 6).map(name => [name, 2]));
  await f.app.advance(f.event('#命途行进'));
  assert.equal(f.player.灵根.name, '半神之体');
  f.loseBattle = true;
  await f.app.titanTrial(f.event('#泰坦试炼'));
  assert.equal(f.player.记忆命途.泰坦次数, 0);
  assert.ok(f.player.记忆命途.上次泰坦 > 0);
  f.loseBattle = false;
  await f.app.titanTrial(f.event('#泰坦试炼'));
  assert.equal(f.player.记忆命途.泰坦次数, 0);
  f.player.记忆命途.上次泰坦 = 0;
  await f.app.titanTrial(f.event('#泰坦试炼'));
  assert.equal(f.player.记忆命途.泰坦次数, 1);
  f.player.mijinglevel_id = 16;
  f.player.记忆命途.泰坦次数 = 12;
  f.player.记忆命途.因子 = Object.fromEntries(memory.MEMORY_FACTORS.slice(0, 9).map(name => [name, 3]));
  await f.app.advance(f.event('#命途行进'));
  assert.equal(f.player.灵根.name, '无漏净子');
  assert.equal(f.inventory.道具.filter(item => item.name === '记忆之诗篇').length, 1);
});

test('时代改写配置异常同时退款，配置快照保持玩家等待期间的自然纪年', async () => {
  const f = fixture();
  f.player.记忆碎片 = 5;
  f.advanceClockOnWrite = true;
  f.failConfig = true;
  await assert.rejects(f.app.rewrite(f.event('#记忆更改 时代 神话时代')), /config-write-failed/);
  assert.equal(f.player.记忆碎片, 5);
  assert.equal(f.settings.Era.current.years, 8);
  assert.equal(f.settings.Era.current.index, 1);
  f.failConfig = false;
  await f.app.rewrite(f.event('#记忆更改 时代 神话时代'));
  assert.equal(f.player.记忆碎片, 0);
  assert.equal(f.settings.Era.current.index, 0);
  assert.equal(f.settings.Era.current.years, 0);
});

test('六相冰封复用真实灾厄凭证和天骄死亡回执，既有岁云数据不受影响', async () => {
  const f = fixture();
  const key = 'xiuxian:foreign-calamity:refine:owner';
  f.values.set(key, JSON.stringify({ entityId: 'actual-calamity', name: '真实灾厄', lifeSource: 200 }));
  await f.app.refine(f.event('#六相冰封 灾厄'));
  const first = f.player.记忆棱镜;
  assert.ok(first >= 100 && first <= 300);
  assert.equal(f.player.月华值, undefined);
  assert.equal(f.player.生命本源, 250);
  assert.equal(f.values.has(key), false);
  await f.app.refine(f.event('#六相冰封 灾厄'));
  assert.equal(f.player.记忆棱镜, first);
  f.values.set('tianjiao:pending:owner', JSON.stringify({ token: 'capture', stage: 'offered', tianjiaoName: '被俘天骄' }));
  f.deadTianjiao = true;
  await f.app.refine(f.event('#六相冰封 天骄'));
  assert.equal(f.player.记忆棱镜, first);
  f.deadTianjiao = false;
  await f.app.refine(f.event('#六相冰封 天骄'));
  assert.ok(f.player.记忆棱镜 > first);
  assert.ok(f.player._rewardClaims['memory:tianjiao:capture']);
  assert.equal(f.values.has('tianjiao:pending:owner'), false);
});

test('记忆造物仅第五阶段十碎片一件，发放失败退回扣款且不制造唯一数据', async () => {
  const f = fixture();
  f.player.记忆碎片 = 10;
  await f.app.createItem(f.event('#记忆造物 测试灵草'));
  assert.equal(f.grants, 0);
  f.player.灵根 = memory.createMemoryRoot(5);
  await f.app.createItem(f.event('#记忆造物 近似查询'));
  assert.equal(f.player.记忆碎片, 10);
  assert.equal(f.grants, 0);
  f.failGrant = true;
  await assert.rejects(f.app.createItem(f.event('#记忆造物 测试灵草')), /grant-failed/);
  assert.equal(f.player.记忆碎片, 10);
  await f.app.createItem(f.event('#记忆造物 奇怪的数据'));
  assert.equal(f.player.记忆碎片, 10);
  await f.app.createItem(f.event('#记忆造物 测试灵草'));
  assert.equal(f.player.记忆碎片, 0);
  assert.equal(f.inventory.草药[0].数量, 1);
});

test('记忆回溯修复本源道伤与指定牢笼，普通探索行动不被删除', async () => {
  const f = fixture();
  f.player.灵根 = memory.createMemoryRoot(5);
  f.player.道伤 = 4; f.player.生命本源 = 1; f.player.当前血量 = 1;
  f.values.set('xiuxian:player:owner:action', JSON.stringify({ action: '天牢' }));
  await f.app.restore(f.event('#记忆回溯'));
  assert.equal(f.player.生命本源, 5400);
  assert.equal(f.player.道伤, 0);
  assert.equal(f.player.当前血量, 1000);
  assert.equal(f.values.has('xiuxian:player:owner:action'), false);
  f.values.set('xiuxian:player:owner:action', JSON.stringify({ action: '秘境探索' }));
  await f.app.restore(f.event('#记忆回溯'));
  assert.equal(f.values.has('xiuxian:player:owner:action'), true);
});

test('记忆应用真实完整装载，共享父类和核心接口均存在', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    const { MemoryPath } = await import('./plugins/zhutianxiuxian1.0/apps/User/MemoryPath.js');
    const app = new MemoryPath();
    if (!app.rule.some(rule => rule.reg === '^#命途行进$')) process.exit(2);
    process.exit(0);
  `], { cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

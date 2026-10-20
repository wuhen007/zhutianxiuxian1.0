import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import { swapEquipmentState } from '../model/equipmentSwap.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { getLifeSourceRepairMaximum } from '../model/lifeSourceRepair.js';
import { recordFactionJoin } from '../model/factionSystem.js';
import { getPetAbilityBonus } from '../model/innateTreasure.js';

const source = fs.readFileSync(new URL('../apps/User/Suiyun.js', import.meta.url), 'utf8');
const bossSource = fs.readFileSync(new URL('../apps/Boss/BOSS4.js', import.meta.url), 'utf8');
const numberSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
// 执行现有格式化函数，避免为消息验证装载机器人或复制一套数字转换规则。
const bigNumberTransform = new Function(`return ${numberSource.match(/export (function bigNumberTransform[\s\S]*?\r?\n})/)[1]}`)();
const copy = value => structuredClone(value);

// 执行真实命令类并替换存档、消息和战斗 IO，不装载机器人、不读写真实玩家数据。
function fixture() {
  const state = {
    players: { owner: { 学习的功法: ['月华炼天功'], 血量上限: 1000, 当前血量: 1000, 名号: '月下修士' } },
    values: new Map(), writes: 0, finalized: 0, failWrite: false, equipmentWrites: 0,
    inventories: { owner: { 装备: [] } }, equipment: { owner: { 至宝: { name: '原本至宝', type: '至宝', pinji: 6 } } },
    itemClaims: new Set(), grants: 0, settings: { Era: { current: { index: 1, years: 300, epoch: 2 } } },
  };
  core.activateSuiyun(state.players.owner);
  const dependencies = {
    ...core, fs, path, withPlayerMutationLock, swapEquipmentState,
    getLifeSourceRepairMaximum, recordFactionJoin, bigNumberTransform,
    __PATH: { player_path: '/fixture/player', najie_path: '/fixture/najie', equipment_path: '/fixture/equipment' },
    FileRollbackTransaction: class {
      constructor() {
        this.snapshot = copy({ players: state.players, inventories: state.inventories, equipment: state.equipment, settings: state.settings });
      }
      capture() {}
      commit() {}
      rollback() { Object.assign(state, copy(this.snapshot)); }
    },
    invalidateBattleEquipmentCache: () => {},
    claimSuiyunUnique: () => ({ ok: true, alreadyOwned: false }),
    releaseSuiyunUnique: () => true,
    Read_najie: async id => copy(state.inventories[id]),
    Write_najie: async (id, inventory) => { state.inventories[id] = copy(inventory); return true; },
    Read_equipment: async id => copy(state.equipment[id]),
    Write_equipment: async (id, equipment) => {
      state.equipmentWrites++;
      state.equipment[id] = copy(equipment);
      state.players[id].攻击 = 123456;
      if (state.failEquipment) { state.failEquipment = false; throw new Error('injected-equipment-error'); }
    },
    player_efficiency: async () => {},
    Add_najie_thing: async (id, name, itemClass, quantity, pinji, _lock, options) => {
      if (state.itemClaims.has(options.idempotencyKey)) return;
      state.itemClaims.add(options.idempotencyKey);
      state.grants++;
      state.inventories[id][itemClass] ||= [];
      state.inventories[id][itemClass].push({ ...(typeof name === 'object' ? copy(name) : {
        name, type: name === '无上天阙枝' ? '至宝' : '护具', 大道至宝本体: name === '无上天阙枝',
      }), 数量: quantity, pinji });
    },
    config: {
      getConfig: () => copy(state.settings),
      getConfigPath: () => '/fixture/xiuxian.yaml',
      setConfig: (_app, _name, settings) => {
        state.settings = copy(settings);
        if (state.failConfig) { state.failConfig = false; throw new Error('injected-config-error'); }
      },
    },
    RealmEvents: { triggerTreasureFromTianji: async () => {
      assert.ok(state.players.owner.岁云之力 <= 10, '显化事件前已持久化扣费');
      if (state.throwEvent) throw new Error('uncertain-event-write');
      return state.eventResult || { ok: true, message: '真实至宝事件已显化' };
    } },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true,
    channel: async value => value,
    existplayer: async id => Boolean(state.players[id]),
    Read_player: async id => copy(state.players[id]),
    Write_player: async (id, player) => {
      if (state.failWrite) { state.failWrite = false; throw new Error('injected-write-error'); }
      state.players[id] = copy(player);
      state.writes++;
    },
    getActiveZhutianAvatarName: player => player?.诸天镜系统?.当前化身 || '',
    getSuperdimensionalRewriteTarget: (e, fallback) => e?.at || e?.message?.find(item => item.type === 'at')?.qq || fallback,
    withForeignCalamityLock: async (_id, task) => task(),
    data: { xiaoshijie: [], tszb_list: JSON.parse(fs.readFileSync(new URL('../resources/data/item/特殊装备列表.json', import.meta.url), 'utf8')),
      weimiantianjiao_list: [{ 名号: '测试天骄', 生命本源: 200 }], talent_list: [], minggeList: [] },
    redis: {
      get: async key => state.values.get(key) ?? null,
      set: async (key, value, options) => {
        if (options?.NX && state.values.has(key)) return null;
        state.values.set(key, value);
        return 'OK';
      },
      del: async key => state.values.delete(key),
    },
    BOSS4: class {
      getPendingEncounterKey(id) { return `tianjiao:pending:${id}`; }
      async readPendingEncounter(id) {
        const raw = state.values.get(this.getPendingEncounterKey(id));
        return raw ? JSON.parse(raw) : null;
      }
      async claimPendingEncounter() { return true; }
      async releasePendingEncounterClaim() {}
      async finalizeTianjiaoDefeat(_e, options) {
        assert.equal(options.tianjiaoName, '测试天骄');
        assert.equal(options.suppressRewards, true);
        if (state.deathNull) return null;
        state.finalized++;
        const reviveTime = Date.now() + 18 * 3600000;
        const settlementId = String(reviveTime);
        state.values.set(options.globalReviveKey, settlementId);
        const { key, ...receipt } = options.deathReceipt;
        state.values.set(key, JSON.stringify({ ...receipt, reviveTime, settlementId }));
        return { reviveTime, settlementId, sourceLifeEssence: options.deathReceipt.sourceLifeEssence };
      }
    },
    zd_battle: async () => ({ winner: 'A', A_hp: 50, msg: [] }),
  };
  const deathStart = bossSource.indexOf('  async finalizePendingTianjiaoDeath(');
  const deathEnd = bossSource.indexOf('  // ========== 显示方法', deathStart);
  dependencies.BOSS4.prototype.finalizePendingTianjiaoDeath = new Function(
    'data', 'redis', 'compareAndDeleteRedisJson',
    `return ({${bossSource.slice(deathStart, deathEnd)}}).finalizePendingTianjiaoDeath;`,
  )(dependencies.data, dependencies.redis, async (_redis, key, token) => {
    if (state.values.get(key) === token) state.values.delete(key);
  });
  state.data = dependencies.data;
  const stripped = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const loaded = new Function(...Object.keys(dependencies), `${stripped}\nreturn { Suiyun, parseSuiyunRewrite };`)(...Object.values(dependencies));
  state.app = new loaded.Suiyun();
  state.parse = loaded.parseSuiyunRewrite;
  state.event = (msg, extra = {}) => ({ user_id: 'owner', isGroup: true, msg, reply: async text => text, ...extra });
  return state;
}

test('岁云命令注册完整，改写解析兼容前后艾特且不吞目标名字', () => {
  const f = fixture();
  for (const command of ['#消耗岁云的残念', '#岁云见证', '#开启梦幻试炼', '#化霜入剑', '#月之见证', '#云月修炼', '#云月之莲', '#月华炼化 灾厄', '#月华救赎', '#岁云更改 命格 道心通明']) {
    assert.ok(f.app.rule.some(rule => new RegExp(rule.reg).test(command)), command);
  }
  assert.deepEqual(f.parse(f.event('#岁云更改 天资 @123 无演无尽')), { kind: '天资', name: '无演无尽' });
  assert.deepEqual(f.parse(f.event('', { message: [{ type: 'text', text: '#岁云更改 灵根 ' }, { type: 'at', qq: '123' }, { type: 'text', text: ' 火灵根' }] })), { kind: '灵根', name: '火灵根' });
  assert.equal(f.parse(f.event('#岁云更改 名号 猜测项')), null);
});

test('两次并发云月修炼只结算一次，功法需求不误加到日修炼', async () => {
  const f = fixture();
  f.players.owner.学习的功法 = [];
  const replies = await Promise.all([f.app.cultivate(f.event('#云月修炼')), f.app.cultivate(f.event('#云月修炼'))]);
  assert.equal(f.writes, 1);
  assert.ok(f.players.owner.月华值 >= 2000 && f.players.owner.月华值 <= 5000);
  assert.ok(replies.some(reply => reply.includes('还需')));
});

test('自由名称或缺少真实灾厄凭证不产生月华', async () => {
  const f = fixture();
  assert.match(await f.app.refine(f.event('#月华炼化 任意名字')), /用法/);
  assert.match(await f.app.refine(f.event('#月华炼化 灾厄')), /没有/);
  assert.equal(f.players.owner.月华值, 0);
  assert.equal(f.writes, 0);
});

test('炼化真实灾厄消费凭证，与天魔炼化共用去重记录', async () => {
  const f = fixture();
  const key = 'xiuxian:foreign-calamity:refine:owner';
  const proof = JSON.stringify({ entityId: 'real-calamity-1', name: '测试灾厄', lifeSource: 200 });
  f.values.set(key, proof);
  await f.app.refine(f.event('#月华炼化 灾厄'));
  assert.equal(f.values.has(key), false);
  const firstGain = f.players.owner.月华值;
  assert.ok(firstGain >= 100 && firstGain <= 300);
  assert.equal(f.players.owner.生命本源, 203.9);
  f.values.set(key, proof);
  assert.match(await f.app.refine(f.event('#月华炼化 灾厄')), /此前已经炼化/);
  assert.equal(f.players.owner.月华值, firstGain);
});

test('灾厄月华炼化按原比例入账大数值，回复统一使用万亿兆京单位', async () => {
  const f = fixture();
  Object.assign(f.players.owner, {
    修为: '100000000000000', 血气: '2e16', 元神: 3e18, 仙道潜力: 10.125,
    月华值: 1e8, 魔道值: 7,
  });
  f.players.owner.岁云.累计炼化月华 = 2e8;
  f.values.set('xiuxian:foreign-calamity:refine:owner', JSON.stringify({
    entityId: 'large-refinement', name: '测试灾厄', lifeSource: 200,
  }));
  const reply = await f.app.refine(f.event('#月华炼化 灾厄'));
  assert.match(reply, /修为\+2兆｜血气\+400兆｜元神\+3京｜仙道潜力\+10；魔道值不变/);
  assert.match(reply, /月华值\+\d+，当前1亿；生命本源\+3\.9，当前203\.9/);
  assert.match(reply, /累计炼化月华：2亿点/);
  assert.equal(f.players.owner.修为, 1.02e14);
  assert.equal(f.players.owner.血气, 2.04e16);
  assert.equal(f.players.owner.元神, 3.03e18);
  assert.equal(f.players.owner.仙道潜力, 20.125);
  assert.equal(f.players.owner.魔道值, 7);
});

test('月华炼化小数值及小数本源照常显示，超大收益沿用现有单位体系', () => {
  const f = fixture();
  const player = f.players.owner;
  player.月华值 = 300;
  player.生命本源 = 201.9;
  player.岁云.累计炼化月华 = 300;
  assert.equal(f.app.refinementMessage({ gain: 100, lifeSourceGain: 1.9 }, player),
    '月华值+100，当前300；生命本源+1.9，当前201.9。\n云月之莲累计炼化月华：300点，成长随法宝装备生效。');
  const reply = f.app.refinementMessage({
    gain: 100, resourceGains: { cultivation: 1e44, blood: '1e32', soul: 1e24, potential: 1e4 },
  }, player);
  assert.match(reply, /修为\+1载｜血气\+1沟｜元神\+1秭｜仙道潜力\+1万/);
  assert.doesNotMatch(reply, /NaN|Infinity|e\+\d+/);
});

test('灾厄月华写盘失败时保留原凭证供重试', async () => {
  const f = fixture();
  const key = 'xiuxian:foreign-calamity:refine:owner';
  f.values.set(key, JSON.stringify({ entityId: 'write-retry', name: '测试灾厄', lifeSource: 200 }));
  f.failWrite = true;
  await assert.rejects(f.app.refine(f.event('#月华炼化 灾厄')), /injected-write-error/);
  assert.equal(f.players.owner.月华值, 0);
  assert.ok(f.values.has(key));
  await f.app.refine(f.event('#月华炼化 灾厄'));
  assert.ok(f.players.owner.月华值 >= 100);
});

test('岁云剑尊本源封顶仍得750潜力，写盘失败、并发炼化和重复凭证不多领', async () => {
  const f = fixture();
  Object.assign(f.players.owner, { 灵根: core.createSuiyunRoot(5), 生命本源: 15000, 仙道潜力: 10 });
  const key = 'xiuxian:foreign-calamity:refine:owner';
  const proof = JSON.stringify({ entityId: 'capped-potential', name: '测试灾厄', lifeSource: 100 });
  f.values.set(key, proof);
  f.failWrite = true;
  await assert.rejects(f.app.refine(f.event('#月华炼化 灾厄')), /injected-write-error/);
  assert.equal(f.players.owner.仙道潜力, 10);
  assert.ok(f.values.has(key));
  const replies = await Promise.all([f.app.refine(f.event('#月华炼化 灾厄')), f.app.refine(f.event('#月华炼化 灾厄'))]);
  assert.equal(f.players.owner.仙道潜力, 760);
  assert.equal(f.players.owner.生命本源, 15000);
  assert.ok(replies.some(reply => reply.includes('仙道潜力+750')));
  f.values.set(key, proof);
  await f.app.refine(f.event('#月华炼化 灾厄'));
  assert.equal(f.players.owner.仙道潜力, 760);
});

test('岁云五阶段自带月华锁魂，无搜魂功法和魔道值也必定获得天骄记忆', async () => {
  for (let stage = 1; stage <= 5; stage++) {
    const f = fixture();
    const p = f.players.owner;
    p.灵根 = core.createSuiyunRoot(stage);
    p.学习的功法 = [];
    p.元神 = 50;
    f.data.weimiantianjiao_list[0].学习的功法 = ['测试天骄传承'];
    f.values.set('tianjiao:pending:owner', JSON.stringify({
      token: `lock-soul-${stage}`, stage: stage % 2 ? 'offered' : 'execution', tianjiaoName: '测试天骄', expiresAt: Date.now() + 300000,
    }));
    assert.ok(f.app.rule.some(rule => rule.fnc === 'lockSoul' && new RegExp(rule.reg).test('#月华锁魂')));
    const reply = await f.app.lockSoul(f.event('#月华锁魂'));
    assert.match(reply, /必定成功/);
    assert.ok(f.players.owner.学习的功法.includes('测试天骄传承'));
    assert.equal(f.players.owner.当前血量, 1000);
    assert.equal(f.players.owner.元神, 50);
    assert.equal(f.players.owner.魔道值, undefined);
    assert.equal(f.players.owner.月华值, 0);
    assert.equal(f.finalized, 1);
    assert.equal(f.values.has('tianjiao:pending:owner'), false);
  }
});

test('月华锁魂全学转元神；并发、死亡回执重放和玩家写失败都只入账一次', async () => {
  const f = fixture();
  f.players.owner.元神 = 0;
  f.players.owner.元神上限 = 200;
  const key = 'tianjiao:pending:owner';
  const pending = JSON.stringify({ token: 'lock-soul-retry', stage: 'offered', tianjiaoName: '测试天骄', expiresAt: Date.now() + 300000 });
  f.values.set(key, pending);
  f.failWrite = true;
  await assert.rejects(f.app.lockSoul(f.event('#月华锁魂')), /injected-write-error/);
  assert.equal(f.players.owner.元神, 0);
  assert.equal(JSON.parse(f.values.get(key)).suiyunDisposition, 'lock-soul');
  assert.match(await f.app.refineTianjiao(f.event('#月华炼化 天骄'), 'owner'), /继续 #月华锁魂/);
  await Promise.all([f.app.lockSoul(f.event('#月华锁魂')), f.app.lockSoul(f.event('#月华锁魂'))]);
  assert.equal(f.players.owner.元神, 10);
  assert.equal(f.finalized, 1);
  f.values.set(key, pending);
  await f.app.lockSoul(f.event('#月华锁魂'));
  assert.equal(f.players.owner.元神, 10);
  assert.equal(f.finalized, 1);
});

test('月华锁魂拒绝无凭证、非岁云、已死亡或旧轮回目标及正在炼化的本源', async () => {
  for (const scenario of ['missing', 'ordinary', 'dead', 'reincarnated', 'refining', 'legacy-refining', 'avatar']) {
    const f = fixture();
    if (scenario !== 'missing') f.values.set('tianjiao:pending:owner', JSON.stringify({
      token: 'invalid-soul', stage: scenario.includes('refining') ? 'suiyun-settlement' : 'offered',
      suiyunDisposition: scenario === 'refining' ? 'refine' : undefined,
      tianjiaoName: '测试天骄', tianjiaoLife: 0, expiresAt: Date.now() + 300000,
    }));
    if (scenario === 'ordinary') f.players.owner.灵根 = { name: '凡体' };
    if (scenario === 'avatar') f.players.owner.诸天镜系统 = { 当前化身: '凡体' };
    if (scenario === 'dead') f.values.set('tianjiao:global:revive:测试天骄', String(Date.now() + 300000));
    if (scenario === 'reincarnated') f.data.weimiantianjiao_list[0].轮回世数 = 1;
    await f.app.lockSoul(f.event('#月华锁魂'));
    assert.equal(f.writes, 0, scenario);
    assert.equal(f.finalized, 0, scenario);
  }
});

test('天骄炼化消费既有求饶俘虏并走真实死亡结算，同令牌不重复获利', async () => {
  const f = fixture();
  const key = 'tianjiao:pending:owner';
  const pending = JSON.stringify({ token: 'real-capture', stage: 'offered', tianjiaoName: '测试天骄', expiresAt: Date.now() + 300000 });
  f.values.set(key, pending);
  await f.app.refine(f.event('#月华炼化 天骄'));
  const gain = f.players.owner.月华值;
  assert.equal(f.finalized, 1);
  assert.equal(f.values.has(key), false);
  f.values.set(key, pending);
  await f.app.refine(f.event('#月华炼化 天骄'));
  assert.equal(f.players.owner.月华值, gain);
});

test('天骄死亡结算缺失或返回null不发月华；已被别人击杀、旧轮回俘虏同样不发', async () => {
  for (const scenario of ['missing', 'null', 'dead', 'reincarnated', 'lock']) {
    const f = fixture();
    const pending = { token: `capture-${scenario}`, playerId: 'owner', stage: 'offered', tianjiaoName: '测试天骄', tianjiaoLife: 0, expiresAt: Date.now() + 300000 };
    f.values.set('tianjiao:pending:owner', JSON.stringify(pending));
    if (scenario === 'missing') f.data.weimiantianjiao_list.length = 0;
    if (scenario === 'null') f.deathNull = true;
    if (scenario === 'dead') f.values.set('tianjiao:global:revive:测试天骄', String(Date.now() + 18 * 3600000));
    if (scenario === 'reincarnated') f.data.weimiantianjiao_list[0].轮回世数 = 1;
    if (scenario === 'lock') f.values.set('tianjiao:battle:lock', 'ordinary-battle');
    await f.app.refine(f.event('#月华炼化 天骄'));
    assert.equal(f.players.owner.月华值, 0, scenario);
    assert.equal(f.players.owner.生命本源, 200, scenario);
    assert.equal(f.finalized, 0, scenario);
  }
});

test('天骄真实死亡后玩家写入失败，使用死亡回执补领且不重复击杀', async () => {
  const f = fixture();
  const pending = { token: 'death-retry', playerId: 'owner', stage: 'offered', tianjiaoName: '测试天骄', tianjiaoLife: 0, expiresAt: Date.now() + 300000 };
  f.values.set('tianjiao:pending:owner', JSON.stringify(pending));
  f.failWrite = true;
  await assert.rejects(f.app.refine(f.event('#月华炼化 天骄')), /injected-write-error/);
  assert.equal(f.players.owner.月华值, 0);
  assert.equal(f.finalized, 1);
  assert.equal(JSON.parse(f.values.get('tianjiao:pending:owner')).stage, 'suiyun-settlement');
  assert.ok(f.values.has('suiyun:tianjiao-death:death-retry'));
  await f.app.refine(f.event('#月华炼化 天骄'));
  assert.ok(f.players.owner.月华值 >= 100 && f.players.owner.月华值 <= 300);
  assert.equal(f.finalized, 1);
  assert.equal(f.values.has('tianjiao:pending:owner'), false);
  assert.equal(f.values.has('tianjiao:battle:lock'), false);
});

test('真实天骄死亡函数将死亡标记、状态和来源回执原子提交，后续异常仍可证明死亡归属', async () => {
  const values = new Map();
  let atomicWrites = 0;
  const redis = {
    multi() {
      const operations = [];
      return {
        set(key, value) { operations.push([key, value]); return this; },
        async exec() {
          assert.equal(operations.length, 3);
          atomicWrites++;
          for (const [key, value] of operations) values.set(key, value);
        },
      };
    },
    set: async (key, value) => values.set(key, value),
    del: async key => values.delete(key),
  };
  const start = bossSource.indexOf('  async finalizeTianjiaoDefeat(');
  const end = bossSource.indexOf('  /** 至宝重出预告', start);
  const method = new Function('redis', 'clearTianjiaoHatred',
    `return ({${bossSource.slice(start, end)}}).finalizeTianjiaoDefeat;`,
  )(redis, async () => { throw new Error('post-death-cleanup-interruption'); });
  await assert.rejects(method.call({ tianjiaoRefreshMs: 18 * 3600000, getTianjiaoEscapeKey: name => `escape:${name}` }, {}, {
    tianjiaoName: '真实天骄', tianjiaoData: { 名号: '真实天骄' }, status: {},
    statusKey: 'status', globalReviveKey: 'revive', killerQQ: 'owner', suppressRewards: true,
    deathReceipt: { key: 'receipt', ownerId: 'owner', token: 'captured-token', name: '真实天骄', sourceLifeEssence: 250 },
  }), /post-death-cleanup-interruption/);
  assert.equal(atomicWrites, 1);
  const receipt = JSON.parse(values.get('receipt'));
  assert.equal(receipt.ownerId, 'owner');
  assert.equal(receipt.token, 'captured-token');
  assert.equal(receipt.sourceLifeEssence, 250);
  assert.equal(receipt.settlementId, values.get('revive'));
  assert.equal(JSON.parse(values.get('status')).isAlive, false);
});

test('月华救赎按100点兑满生命本源，可指向他人，保留岁云之力与莲花成长', async () => {
  const f = fixture();
  f.players.owner.月华值 = 2500;
  f.players.owner.岁云之力 = .2;
  f.players.owner.岁云.累计炼化月华 = 1234;
  f.players.owner.生命本源 = 30;
  assert.match(await f.app.redeem(f.event('#月华救赎')), /生命本源恢复至200/);
  assert.equal(f.players.owner.生命本源, 200);
  assert.equal(f.players.owner.月华值, 2400);
  assert.equal(f.players.owner.岁云.累计炼化月华, 1234);
  assert.equal(f.players.owner.岁云之力, .2);
  f.players.other = { 灵根: core.createSuiyunRoot(3), 名号: '同门', 生命本源: 10, 血量上限: 500, 当前血量: 20 };
  assert.match(await f.app.redeem(f.event('#月华救赎', { at: 'other' })), /同门的生命本源重归圆满/);
  assert.equal(f.players.other.生命本源, 1800);
  assert.equal(f.players.owner.月华值, 2300);
});

test('月华救赎可从大牢捞人：消耗200点、清空关押态、气血归满、修为保留85%', async () => {
  const f = fixture();
  f.players.owner.月华值 = 500;
  f.players.other = { 灵根: core.createSuiyunRoot(3), 名号: '同门', 生命本源: 10, 血量上限: 500, 当前血量: 1, 修为: 10000 };
  f.values.set('xiuxian:player:other:action', JSON.stringify({ heianlaolong: true }));
  assert.match(await f.app.redeem(f.event('#月华救赎', { at: 'other' })), /已脱离黑暗牢笼/);
  assert.equal(f.players.owner.月华值, 300);
  assert.equal(f.players.other.当前血量, 500);
  assert.equal(f.players.other.修为, 8500);
  assert.equal(f.values.has('xiuxian:player:other:action'), false);
  assert.equal(f.players.other.救赎记录.at(-1).类型, '岁云剑宫月华救赎·解放');
});

test('月华救赎余额不足拒绝且零扣费，写入失败不扣月华', async () => {
  const f = fixture();
  f.players.owner.月华值 = 99;
  f.players.owner.生命本源 = 50;
  assert.match(await f.app.redeem(f.event('#月华救赎')), /恢复满生命本源需要100点月华值/);
  assert.equal(f.players.owner.月华值, 99);
  assert.equal(f.players.owner.生命本源, 50);
  f.players.owner.月华值 = 100;
  f.failWrite = true;
  await assert.rejects(f.app.redeem(f.event('#月华救赎')), /injected-write-error/);
  assert.equal(f.players.owner.月华值, 100);
  assert.equal(f.players.owner.生命本源, 50);
  f.failWrite = false;
  assert.match(await f.app.redeem(f.event('#月华救赎')), /生命本源恢复至200/);
  assert.equal(f.players.owner.月华值, 0);
  assert.equal(f.players.owner.生命本源, 200);
  assert.match(await f.app.redeem(f.event('#月华救赎')), /恢复满生命本源需要100点月华值/);
  assert.equal(f.players.owner.月华值, 0);
});

test('消耗岁云残念自动入主岁云剑宫，位登宫主并获授帝经《岁云化月》', async () => {
  const f = fixture();
  f.players.newbie = { 学习的功法: [], 血量上限: 1000, 当前血量: 1000, 名号: '新晋修士' };
  f.inventories.newbie = { 装备: [], 道具: [{ name: '岁云的残念', class: '道具', 数量: 1 }] };
  const event = msg => f.event(msg, { user_id: 'newbie' });
  const reply = await f.app.consumeRemnant(event('#消耗岁云的残念'));
  assert.match(reply, /岁云剑宫/);
  assert.match(reply, /宫主/);
  assert.match(reply, /岁云化月/);
  assert.equal(f.players.newbie.势力, '岁云剑宫');
  assert.equal(f.players.newbie.势力职位, '宫主');
  assert.ok(f.players.newbie.势力履历?.['岁云剑宫']);
  const 功法 = f.inventories.newbie.功法 || [];
  assert.ok(功法.some(item => item.name === '月华炼天功'));
  assert.ok(功法.some(item => item.name === '岁云化月'));
  assert.equal(f.inventories.newbie.道具.find(item => item.name === '岁云的残念').数量, 0);
  assert.match(await f.app.consumeRemnant(event('#消耗岁云的残念')), /无需重复消耗残念/);
});

test('灾厄来源和小世界的生产接线均覆盖岁云传承', () => {
  const foreign = fs.readFileSync(new URL('../apps/Boss/ForeignCalamity.js', import.meta.url), 'utf8');
  const world = fs.readFileSync(new URL('../apps/Garden/xiaoshijie.js', import.meta.url), 'utf8');
  assert.match(foreign, /isEvilCultivator\(player\) \|\| getSuiyunStage\(player\)/);
  assert.match(foreign, /if \(evil \|\| suiyun(?: \|\| memory)?\)/);
  assert.match(world, /getSuiyunStage\(player\)\) ascendSuiyunPalace\(newWorld\)/);
  assert.match(world, /settleSuiyunPalace\(holder, world/);
  assert.match(world, /superdimensionalRewards\.hours > 0 \|\| suiyunRewards\.hours > 0 \|\| suiyunRewards\.power > 0/);
});

test('最终奖励幂等，自动装备无上天阙枝并保留原至宝、重建属性', async () => {
  const f = fixture();
  f.players.owner.灵根 = core.createSuiyunRoot(5);
  f.players.owner.岁云.仙宠已领取 = true;
  await f.app.advance(f.event('#岁云见证'));
  assert.equal(f.equipment.owner.至宝.name, '无上天阙枝');
  assert.equal(f.equipment.owner.至宝.绑定者, 'owner');
  assert.equal(f.equipment.owner.至宝.不可支取, true);
  assert.ok(f.inventories.owner.装备.some(item => item.name === '原本至宝'));
  assert.equal(f.players.owner.攻击, 123456);
  assert.equal(f.players.owner.岁云.套装已领取, true);
  assert.equal(f.grants, 7);
  await f.app.advance(f.event('#岁云见证'));
  assert.equal(f.grants, 7);
});

test('自动认主换装失败回滚装备与领取标志，奖励保留且重试不重复发放', async () => {
  const f = fixture();
  f.players.owner.灵根 = core.createSuiyunRoot(5);
  f.players.owner.岁云.仙宠已领取 = true;
  f.failEquipment = true;
  await assert.rejects(f.app.advance(f.event('#岁云见证')), /injected-equipment-error/);
  assert.equal(f.equipment.owner.至宝.name, '原本至宝');
  assert.equal(f.players.owner.岁云.套装已领取, undefined);
  assert.equal(f.inventories.owner.装备.length, 7);
  assert.equal(f.grants, 7);
  await f.app.advance(f.event('#岁云见证'));
  assert.equal(f.equipment.owner.至宝.name, '无上天阙枝');
  assert.equal(f.grants, 7);
});

test('时代写入失败原时代与5点消耗共同回滚', async () => {
  const f = fixture();
  f.players.owner.灵根 = core.createSuiyunRoot(3);
  f.players.owner.岁云之力 = 20;
  f.failConfig = true;
  await assert.rejects(f.app.rewrite(f.event('#岁云更改 时代 神话时代')), /injected-config-error/);
  assert.equal(f.players.owner.岁云之力, 20);
  assert.deepEqual(f.settings.Era.current, { index: 1, years: 300, epoch: 2 });
  await f.app.rewrite(f.event('#岁云更改 时代 神话时代'));
  assert.equal(f.players.owner.岁云之力, 15);
  assert.equal(f.settings.Era.current.index, 0);
  assert.equal(f.settings.Era.current.years, 0);
});

test('至宝线索先付费，明确失败退款，未知失败保留付费防免费重放', async () => {
  const f = fixture();
  f.players.owner.灵根 = core.createSuiyunRoot(3);
  f.players.owner.岁云之力 = 20;
  f.eventResult = { ok: false, reason: 'all_claimed' };
  await f.app.rewrite(f.event('#岁云更改 至宝线索'));
  assert.equal(f.players.owner.岁云之力, 20);
  f.throwEvent = true;
  await assert.rejects(f.app.rewrite(f.event('#岁云更改 至宝线索')), /uncertain-event-write/);
  assert.equal(f.players.owner.岁云之力, 10);
});

test('岁云应用模块完整装载并注册残念与阶段命令', () => {
  const script = `
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get() { return () => {}; } });
    const { Suiyun } = await import('./plugins/zhutianxiuxian1.0/apps/User/Suiyun.js');
    const app = new Suiyun();
    if (!app.rule.some(rule => rule.reg === '^#岁云见证$')) process.exit(2);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('已装云月莲的灾厄炼化立即刷新；刷新失败重试保留累计且不双领', async () => {
  const f = fixture();
  f.players.owner.id = 'owner';
  f.equipment.owner.法宝 = { name: '云月之莲', id: 9600303, 绑定者: 'owner' };
  const key = 'xiuxian:foreign-calamity:refine:owner';
  f.values.set(key, JSON.stringify({ entityId: 'lotus-retry', name: '测试灾厄', lifeSource: 200 }));
  f.failEquipment = true;
  await assert.rejects(f.app.refine(f.event('#月华炼化 灾厄')), /injected-equipment-error/);
  const total = f.players.owner.岁云.累计炼化月华;
  assert.ok(total >= 100 && total <= 300);
  assert.ok(f.values.has(key));
  assert.equal(f.equipmentWrites, 1);
  await f.app.refine(f.event('#月华炼化 灾厄'));
  assert.equal(f.equipmentWrites, 2);
  assert.equal(f.values.has(key), false);
  assert.equal(f.players.owner.岁云.累计炼化月华, total);
  assert.equal(f.players.owner.月华值, total);
});

test('天骄死亡收益后莲成长刷新失败仍凭原死亡回执续结算一次', async () => {
  const f = fixture();
  f.players.owner.id = 'owner';
  f.equipment.owner.法宝 = { name: '云月之莲', 绑定者: 'owner' };
  const key = 'tianjiao:pending:owner';
  f.values.set(key, JSON.stringify({ token: 'lotus-death', stage: 'offered', tianjiaoName: '测试天骄', expiresAt: Date.now() + 300000 }));
  f.failEquipment = true;
  await assert.rejects(f.app.refine(f.event('#月华炼化 天骄')), /injected-equipment-error/);
  const total = f.players.owner.岁云.累计炼化月华;
  assert.ok(total >= 100 && total <= 300);
  await f.app.refine(f.event('#月华炼化 天骄'));
  assert.equal(f.finalized, 1);
  assert.equal(f.equipmentWrites, 2);
  assert.equal(f.players.owner.岁云.累计炼化月华, total);
  assert.equal(f.values.has(key), false);
});

test('云月之莲状态及岁云面板可补刷新，未装备仅显示已保存成长', async () => {
  const f = fixture();
  f.players.owner.id = 'owner';
  f.players.owner.岁云.累计炼化月华 = 250;
  assert.match(await f.app.showLotus(f.event('#云月之莲')), /累计炼化月华：250/);
  assert.equal(f.equipmentWrites, 0);
  f.equipment.owner.法宝 = { name: '云月之莲', 绑定者: 'owner' };
  assert.match(await f.app.showLotus(f.event('#云月之莲')), /已装备/);
  await f.app.power(f.event('#岁云之力'));
  assert.equal(f.equipmentWrites, 2);
  assert.equal(f.players.owner.岁云.累计炼化月华, 250);
});

test('已领取旧剑灵在纳戒、出战和栖息地均补齐炼丹，保留战斗炼器与其他附加能力且不再发宠', async () => {
  const f = fixture();
  f.players.owner.灵根 = core.createSuiyunRoot(3);
  f.players.owner.岁云.仙宠已领取 = true;
  const oldPet = { name: '岁云剑灵', type: '战斗', 加成: 5, 等级: 20, 数量: 1,
    附加能力: [{ type: '炼器', 成长值: .4 }, { type: '幸运', 成长值: .1 }], 炼妖继承能力: { type: '修炼', 加成: .2 } };
  f.inventories.owner.仙宠 = [copy(oldPet)];
  f.players.owner.仙宠 = { ...copy(oldPet), name: '霜月剑灵' };
  const world = { player_qq: 'owner', 栖息地: [{ 仙宠: copy(oldPet) }] };
  f.data.xiaoshijie.push(world);
  const originalMigration = f.app.migrateSuiyunPet;
  // 迁移方法里的世界写入替换成内存回执，测试不触碰真实小世界存档。
  const start = source.indexOf('  async migrateSuiyunPet('), end = source.indexOf('  async grantStagePet(', start);
  const deps = { ...core, saveWorlds: () => { f.worldSaved = copy(world); },
    transactionFor: () => ({ commit() {}, rollback() {} }),
    Write_najie: async (_id, value) => { f.inventories.owner = copy(value); return true; },
    Write_player: async (_id, value) => { f.players.owner = copy(value); } };
  f.app.migrateSuiyunPet = new Function(...Object.keys(deps),
    `return ({${source.slice(start, end)}}).migrateSuiyunPet;`)(...Object.values(deps));
  await f.app.grantStagePet('owner', copy(f.players.owner));
  for (const pet of [f.players.owner.仙宠, f.inventories.owner.仙宠[0], f.worldSaved.栖息地[0].仙宠]) {
    assert.equal(pet.name, '岁云剑灵');
    assert.equal(pet.等级, 20);
    assert.equal(getPetAbilityBonus(pet, '战斗'), 5);
    assert.equal(getPetAbilityBonus(pet, '炼器'), .4);
    assert.equal(getPetAbilityBonus(pet, '炼丹'), .4);
    assert.equal(getPetAbilityBonus(pet, '幸运'), .1);
    assert.equal(getPetAbilityBonus(pet, '修炼'), .2);
  }
  await f.app.grantStagePet('owner', copy(f.players.owner));
  assert.equal(f.inventories.owner.仙宠[0].附加能力.filter(item => item.type === '炼丹').length, 1);
  assert.equal(f.grants, 0);
  f.app.migrateSuiyunPet = originalMigration;
});

test('旧宠能力补齐中途失败回滚玩家、纳戒和当前世界，重试不吞掉栖息地迁移', async () => {
  let stored = { 灵根: core.createSuiyunRoot(3), 岁云: { 仙宠已领取: true }, 仙宠: { name: '岁云剑灵' } };
  let inventory = { 仙宠: [{ name: '岁云剑灵' }] };
  const world = { player_qq: 'owner', 栖息地: [{ name: '岁云剑灵' }] };
  let savedWorld = copy(world), fail = true;
  const deps = {
    ...core, saveWorlds: () => { savedWorld = copy(world); },
    Write_najie: async (_id, value) => { inventory = copy(value); return true; },
    Write_player: async (_id, value) => { stored = copy(value); if (fail) throw new Error('migration-write-failed'); },
    transactionFor: () => {
      const before = copy({ stored, inventory });
      return { commit() {}, rollback() { stored = before.stored; inventory = before.inventory; } };
    },
  };
  const start = source.indexOf('  async migrateSuiyunPet('), end = source.indexOf('  async grantStagePet(', start);
  const method = new Function(...Object.keys(deps), `return ({${source.slice(start, end)}}).migrateSuiyunPet;`)(...Object.values(deps));
  const before = copy({ stored, inventory, world });
  await assert.rejects(method('owner', copy(inventory), copy(stored), world), /migration-write-failed/);
  assert.deepEqual({ stored, inventory, world }, before);
  fail = false;
  await method('owner', copy(inventory), copy(stored), world);
  assert.equal(getPetAbilityBonus(stored.仙宠, '炼丹'), .4);
  assert.equal(getPetAbilityBonus(inventory.仙宠[0], '炼丹'), .4);
  assert.equal(getPetAbilityBonus(savedWorld.栖息地[0], '炼丹'), .4);
});

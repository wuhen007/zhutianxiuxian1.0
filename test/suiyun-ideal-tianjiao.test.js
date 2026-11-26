import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hasSuiyunAuthority, SUIYUN_BRANCH } from '../model/suiyunAuthority.js';
import { getTianjiaoProgressPenalty } from '../model/suiyunCombat.js';
import { getTianjiaoRealmTier } from '../model/realmAuthority.js';
import { getTianjiaoTraceReach, isIndependentTianjiao } from '../model/tianjiaoGrowth.js';
import { getExtraCultivationLevelSum } from '../model/extraCultivation.js';
import { createSuiyunRoot } from '../model/suiyun.js';

const source = fs.readFileSync(new URL('../apps/Boss/BOSS4.js', import.meta.url), 'utf8');
const from = source.indexOf('  async WorldBossBattle2(e) {');
const to = source.indexOf('  // ========== 贡献榜奖励分发', from);
const clone = structuredClone;

function fixture({ unlocked = true, name = '测试天骄', independent = false, ...overrides } = {}) {
  const state = {
    player: { id: 'ideal-owner', 当前大道至宝: SUIYUN_BRANCH, 灵根: createSuiyunRoot(5),
      天阙权柄: { 解封: unlocked ? { 理想: { at: 0 } } : {} },
      level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1,
      名号: '理想持有者', 攻击: 100, 防御: 50, 当前血量: 1, 血量上限: 1000,
      学习的功法: [], ...overrides },
    trace: null, scent: { ok: false }, battles: [], messages: [], writes: 0, scentUses: 0, rewards: 0, errors: [],
    values: new Map(),
  };
  const target = { 名号: name, 独立成长: independent, level_id: 50,
    mijinglevel_id: 20, xiangulevel_id: 1, huafenlevel_id: 1, 学习的功法: [] };
  const deps = {
    hasSuiyunAuthority, getTianjiaoProgressPenalty, getTianjiaoRealmTier, getTianjiaoTraceReach,
    getExtraCultivationLevelSum,
    isIndependentTianjiao: item => independent || isIndependentTianjiao(item),
    data: { weimiantianjiao_list: [target] }, verc: () => true,
    Read_player: async () => clone(state.player),
    Write_player: async (_id, value) => { state.player = clone(value); state.writes++; },
    Read_equipment: async () => ({}), applyTaintPenalty: () => [],
    hasEquippedInnateTreasure: () => false, ensureTianjiaoInitialTemplate: () => false,
    getTianjiaoScentAccess: () => state.scent,
    consumeTianjiaoScent: () => { state.scentUses++; return { ok: true, target: name, remaining: 1 }; },
    consumeSourceStoneField: () => ({}), consumeBlackEmperorBattleFormation: () => ({}),
    buildTianjiaoBattleStats: () => ({ 攻击: 10000, 防御: 9000, 当前血量: 50000, 血量上限: 50000 }),
    redis: {
      get: async key => state.values.get(key) ?? null,
      set: async (key, value, options) => {
        if (options?.NX && state.values.has(key)) return null;
        state.values.set(key, String(value)); return 'OK';
      },
      del: async key => state.values.delete(key),
    },
    recordWenXianTaskProgress: () => ({}), formatTianjiaoTrace: () => '遥远位面(9,9)',
    SetWorldBOSSBattleUnLockTimer() {}, clearWorldBOSSBattleUnlockTimer() {},
    sendFightImages: async (_e, messages) => state.messages.push(...messages),
    zd_battle: async (player, opponent, options) => {
      state.battles.push({ player: clone(player), opponent: clone(opponent), options });
      return { winner: 'B', A_hp: 0, B_hp: 10, msg: [] };
    },
    Add_灵石: async () => { state.rewards++; },
    Add_源石: async () => { state.rewards++; },
    Add_修为: async () => { state.rewards++; },
    Add_血气: async () => { state.rewards++; },
    bigNumberTransform: String, process: { pid: 1 },
    console: { warn: (...args) => state.errors.push(args), error: (...args) => state.errors.push(args) },
  };
  const app = new Function(...Object.keys(deps), `
    let WorldBOSSBattleLock = 0, WorldBOSSBattleLockToken = 0;
    return ({${source.slice(from, to)}});
  `)(...Object.values(deps));
  Object.assign(app, {
    userCooldownMs: 90 * 60000,
    checkTianjiaoReincarnation: async () => {},
    persistTianjiaoList() {},
    getTianjiaoEscapeKey: targetName => `tianjiao:escape:${targetName}`,
    getTianjiaoRewardIdempotencyKey: (...parts) => parts.join(':'),
    getAvailableTianjiaoTrace: () => state.trace,
    getPlayerHatred: async () => 0, getHatredLevel: () => '陌生',
    getRandomDialogue: () => '', updateDamageContribution: async () => {},
    addHatred: async () => ({ gain: 1, old: 0, new: 1 }),
    rollTianjiaoTaint: async () => {},
  });
  state.run = () => app.WorldBossBattle2({
    msg: `#讨伐天骄 ${name}`, user_id: 'ideal-owner', isPrivate: false,
    reply: async text => state.messages.push(Array.isArray(text) ? text.join('\n') : text),
  });
  return { state, app, target };
}

test('理想解封后无踪迹、无定位符、低境低血也能进入实际天骄战斗，原伤害和冷却落盘', async () => {
  const { state } = fixture();
  await state.run();
  assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
  assert.equal(state.battles.length, 1);
  assert.equal(state.battles[0].player.当前血量, 1, '放行不免费回血');
  assert.equal(state.battles[0].player.level_id, 1);
  assert.deepEqual(state.battles[0].options, { battleType: 'tianjiao' });
  assert.equal(state.rewards, 4);
  assert.ok(state.values.has('xiuxian:player:ideal-owner:BOSSCD'));
  assert.equal(state.scentUses, 0);
  assert.ok(state.messages.some(message => message.includes('【理想】')));
  await state.run();
  assert.equal(state.battles.length, 1);
  assert.ok(state.messages.some(message => message.includes('讨伐天骄冷却中')));
});

test('理想忽略异位面和坐标、低阶独立天骄门槛与猪咪岁岁的成仙限制，不消耗追息印', async () => {
  for (const options of [{ independent: true }, { name: '猪咪岁岁', level_id: 50 }, {}]) {
    const { state, target } = fixture(options);
    state.trace = { name: target.名号, plane: '遮天位面', coordinate: { x: 9, y: 9 }, expiresAt: Date.now() + 60000 };
    state.player.power_place = 0;
    state.player.坐标 = { x: 0, y: 0 };
    state.scent = { ok: true };
    await state.run();
    assert.equal(state.battles.length, 1, JSON.stringify(state.errors));
    assert.equal(state.errors.length, 0, JSON.stringify(state.errors));
    assert.equal(state.scentUses, 0);
    if (options.independent) assert.equal(state.battles[0].opponent.防御, 9000);
  }
});

test('理想保留90分钟冷却，无极解封后仍为45分钟，天骄轮回逃遁等待及战斗锁不被跳过', async () => {
  for (const [unlimited, ago, expected] of [[false, 60, 0], [true, 30, 0], [true, 46, 1]]) {
    const { state } = fixture();
    if (unlimited) state.player.天阙权柄.解封.无极 = { at: 0 };
    state.values.set('xiuxian:player:ideal-owner:BOSSCD', String(Date.now() - ago * 60000));
    await state.run();
    assert.equal(state.battles.length, expected);
  }
  for (const key of ['tianjiao:global:revive:测试天骄', 'tianjiao:escape:测试天骄', 'tianjiao:battle:lock']) {
    const { state } = fixture();
    state.values.set(key, String(Date.now() + 3600000));
    await state.run();
    assert.equal(state.battles.length, 0, key);
    assert.equal(state.rewards, 0);
  }
});

test('未解封理想、卸下至宝、召唤物与普通玩家保留原讨伐门槛', async () => {
  for (const options of [{ unlocked: false }, { 当前大道至宝: '' }, { _tahua_type: 'mirror' },
    { 当前大道至宝: '', 灵根: { name: '凡体' } }]) {
    const { state } = fixture(options);
    await state.run();
    assert.equal(state.battles.length, 0);
    assert.ok(state.messages.some(message => message.includes('踪迹')));
    assert.equal(state.errors.length, 0);
  }
});

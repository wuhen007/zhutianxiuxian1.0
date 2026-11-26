import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { multiplySuiyunLoot } from '../model/suiyunLoot.js';
import {
  MAX_RELIC_BAG_SIZE,
  addRelicToBag,
  createEmptyRelicState,
  createRelic,
  dismantleRelics,
  normalizeRelicState,
} from '../model/relicSystem.js';
import {
  FISH_KING_KILL_LINGSHI,
  FISH_KING_KILL_SOURCE_STONE,
  calculateFishKingCultivationReward,
} from '../model/immortalFishKing.js';

const copy = value => structuredClone(value);
const relic = id => createRelic({ quality: '凡耀', setName: '玄黄不灭', random: () => 0, id });

// 执行真实应用方法，替换全部 IO；不装载游戏入口或读写任何玩家存档。
function loadMethod(file, name, dependencies, nextMethod) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const start = source.indexOf(`  async ${name}(`);
  const end = nextMethod
    ? source.indexOf(`  async ${nextMethod}(`, start)
    : source.lastIndexOf('\n}');
  assert.ok(start >= 0 && end > start, `${file}: ${name} 方法边界`);
  return new Function(
    ...Object.keys(dependencies),
    `return { ${source.slice(start, end)} }.${name};`,
  )(...Object.values(dependencies));
}

function createFixture() {
  const fixture = {
    equipment: {
      A: { 遗珍: createEmptyRelicState() },
      B: { 遗珍: createEmptyRelicState() },
    },
    players: {
      A: { 业力值: 20, 位面青睐: 0 },
      B: { 业力值: 20, 位面青睐: 0 },
    },
    itemClaims: new Set(),
    failPlayerWrite: false,
    fishDeleted: false,
  };
  const dependencies = {
    multiplySuiyunLoot,
    normalizeRelicState,
    addRelicToBag,
    withPlayerMutationLock: async (_id, work) => work(),
    Read_equipment: async id => copy(fixture.equipment[id]),
    Write_equipment: async (id, equipment) => { fixture.equipment[id] = copy(equipment); },
    Read_player: async id => copy(fixture.players[id]),
    Write_player: async (id, player) => {
      if (fixture.failPlayerWrite) {
        fixture.failPlayerWrite = false;
        throw new Error('injected player write failure');
      }
      fixture.players[id] = copy(player);
    },
    Add_najie_thing: async (_id, _name, _class, _amount, _a, _b, options) => {
      fixture.itemClaims.add(options.idempotencyKey);
    },
    ensureFishKingKillRewards: state => {
      assert.ok(Array.isArray(state.rewardAssignments) && Array.isArray(state.relicRewards));
    },
    saveActiveFishKing: async () => {},
    deleteActiveFishKing: async () => { fixture.fishDeleted = true; },
    FISH_KING_KILL_LINGSHI,
    FISH_KING_KILL_SOURCE_STONE,
    calculateFishKingCultivationReward,
    formatNumber: value => String(value),
    recordFishCatch: () => {},
    getPendingFishAtlasRewards: () => [],
    consumeFishAtlasSets: () => {},
    markFishAtlasRewardsClaimed: () => {},
    logger: { error() {} },
    rememberPlayerHistory: (history, key) => { history[key] = Date.now(); },
    saveForeignCalamity: async entity => { fixture.savedForeign = copy(entity); },
    rewardGroupText: group => group.type,
  };
  fixture.settleFishKing = loadMethod('../apps/User/ImmortalFishKing.js', 'settleFishKing', dependencies);
  fixture.grantForeign = loadMethod('../apps/Boss/ForeignCalamity.js', 'grantReward', dependencies, 'claimPendingRewards');
  fixture.dismantle = (id, rewardId) => {
    const result = dismantleRelics(fixture.equipment[id].遗珍, [rewardId]);
    fixture.equipment[id].遗珍 = copy(result.state);
    return result;
  };
  return fixture;
}

function fishState(memberIds = ['A']) {
  const members = memberIds.map(id => ({ id, name: id }));
  return {
    id: 'fixture-fish',
    groupId: 'fixture-group',
    name: '测试鱼王',
    ownerId: 'A',
    ownerName: 'A',
    plane: '凡间',
    members,
    rewardAssignments: [],
    relicRewards: members.map(recipient => ({
      recipient,
      relic: relic(`fish-king-relic:fixture-fish:${recipient.id}:0`),
    })),
  };
}

function foreignState() {
  return {
    id: 'fixture-calamity',
    rewardPlan: {
      id: 'foreign-reward:fixture-calamity',
      groups: [
        { type: 'relic', relic: relic('foreign-relic:fixture-calamity') },
        { type: 'token', name: '遣龙令', class: '道具', amount: 1 },
      ],
      karmaReduction: 5,
      planeFavor: 5,
    },
  };
}

function fillBag(fixture, playerId) {
  fixture.equipment[playerId].遗珍.背包 = Array.from(
    { length: MAX_RELIC_BAG_SIZE }, (_, index) => relic(`filler:${playerId}:${index}`),
  );
}

test('鱼王多人结算因队友满包暂缓，已分解奖励在反复重试后仍只产生一次碎片', async () => {
  const fixture = createFixture();
  const state = fishState(['A', 'B']);
  const rewardId = state.relicRewards[0].relic.id;
  fillBag(fixture, 'B');

  assert.match((await fixture.settleFishKing(state)).message, /遗珍结算暂缓/);
  assert.deepEqual(fixture.equipment.A.遗珍.背包.map(item => item.id), [rewardId]);
  fixture.dismantle('A', rewardId);
  for (let retry = 0; retry < 3; retry++) {
    assert.match((await fixture.settleFishKing(state)).message, /遗珍结算暂缓/);
    assert.equal(fixture.equipment.A.遗珍.碎片, 1);
    assert.equal(fixture.equipment.A.遗珍.背包.length, 0);
  }

  fixture.dismantle('B', fixture.equipment.B.遗珍.背包[0].id);
  assert.match((await fixture.settleFishKing(state)).message, /伏诛/);
  assert.equal(fixture.fishDeleted, true);
  assert.equal(fixture.equipment.A.遗珍.背包.length, 0);
  assert.equal(fixture.equipment.A.遗珍.碎片, 1);
  assert.equal(fixture.equipment.B.遗珍.背包.at(-1).id, state.relicRewards[1].relic.id);
});

test('域外装备已落盘但玩家写入失败，分解后补领奖励不再生成同一遗珍', async () => {
  const fixture = createFixture();
  const entity = foreignState();
  const rewardId = entity.rewardPlan.groups[0].relic.id;
  fixture.failPlayerWrite = true;
  await assert.rejects(fixture.grantForeign('A', entity), /injected player write failure/);
  assert.equal(fixture.equipment.A.遗珍.背包[0].id, rewardId);
  assert.equal(fixture.players.A._foreignCalamityClaims, undefined);
  assert.equal(entity.rewardClaimedAt, undefined);

  fixture.dismantle('A', rewardId);
  const result = await fixture.grantForeign('A', entity);
  assert.equal(result.pending, undefined);
  assert.equal(fixture.equipment.A.遗珍.碎片, 1);
  assert.equal(fixture.equipment.A.遗珍.背包.length, 0);
  assert.equal(fixture.players.A.位面青睐, 5);
  assert.ok(fixture.players.A._foreignCalamityClaims[entity.id]);
  assert.ok(fixture.savedForeign.rewardClaimedAt);
  assert.equal(fixture.itemClaims.size, 1);
});

for (const source of ['fish', 'foreign']) {
  for (const full of [false, true]) {
    test(`${source} 升级前已到账奖励分解后${full ? '即使背包再次装满' : ''}重试，兼容旧存档且不补发`, async () => {
      const fixture = createFixture();
      const state = source === 'fish' ? fishState() : foreignState();
      const reward = source === 'fish' ? state.relicRewards[0].relic : state.rewardPlan.groups[0].relic;
      // 模拟升级前的落盘结构：遗珍已到账，但尚无碎片或已分解奖励记录。
      fixture.equipment.A.遗珍 = {
        version: 1,
        背包: [copy(reward)],
        铭刻: { 武器: [null, null], 护具: [null, null], 法宝: [null, null] },
        拓展: { 武器: false, 护具: false, 法宝: false },
      };
      fixture.dismantle('A', reward.id);
      if (full) fillBag(fixture, 'A');

      const result = source === 'fish'
        ? await fixture.settleFishKing(state)
        : await fixture.grantForeign('A', state);
      if (source === 'fish') {
        assert.match(result.message, /伏诛/);
        assert.equal(fixture.fishDeleted, true);
      } else {
        assert.equal(result.pending, undefined);
        assert.ok(fixture.players.A._foreignCalamityClaims[state.id]);
      }
      assert.equal(fixture.equipment.A.遗珍.碎片, 1);
      assert.equal(fixture.equipment.A.遗珍.背包.length, full ? MAX_RELIC_BAG_SIZE : 0);
      assert.equal(fixture.equipment.A.遗珍.背包.some(item => item.id === reward.id), false);
    });
  }
}

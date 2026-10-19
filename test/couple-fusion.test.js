import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getLifeSourceRepairMaximum } from '../model/lifeSourceRepair.js';
import { getMinggeEffects } from '../model/mingge.js';

const source = fs.readFileSync(new URL('../apps/Game/Games.js', import.meta.url), 'utf8');
const talents = JSON.parse(fs.readFileSync(new URL('../resources/data/item/灵根列表.json', import.meta.url), 'utf8'));
const recipes = [
  ['大成·荒古圣体', '先天道胎', '先天圣体道胎'],
  ['命运神道体', '极道天魔', '终焉神魔体'],
  ['太阳之体', '太阴之体', '混沌体'],
  ['混沌体', '先天圣体道胎', '先天混沌圣体道胎'],
];
const failKey = id => `xiuxian:player:${id}:fusion_fail`;

// 执行真实命令，所有玩家、装备、Redis 和消息读写均留在内存。
function fixture(rootNames, { random = 0, failures = [7, 4] } = {}) {
  const state = {
    players: {}, loaded: {}, events: [], replies: [],
    values: new Map([['A', failures[0]], ['B', failures[1]]].map(([id, value]) => [failKey(id), value])),
    data: {
      talent_list: structuredClone(talents),
      minggeList: [
        { id: 'life-main', effects: { 生命本源额外: 40 } },
        { id: 'life-extra', effects: { 生命本源额外: 12.5 } },
      ],
    },
  };
  for (const [index, id] of ['A', 'B'].entries()) {
    state.players[id] = {
      id, 灵根: structuredClone(talents.find(root => root.name === rootNames[index])),
      生命本源: index ? 9999 : 2, 攻击: -1, 防御: -2, 血量上限: -3, 法球倍率: 99,
      命格: index ? undefined : 'life-main', 附加命格: index ? [] : ['life-extra'],
      天魔化生: { 累计所得: { 生命本源: 888 } },
    };
    assert.ok(state.players[id].灵根, `测试输入灵根存在：${rootNames[index]}`);
  }
  const dependencies = {
    plugin: class {},
    verc: () => true,
    config: { getConfig: () => ({ switch: { couple: true }, CD: { couple: 0 } }) },
    data: state.data,
    Math: Object.assign(Object.create(Math), { random: () => random }),
    channel: async id => id,
    withPlayerMutationLock: async (_id, task) => task(),
    existplayer: async id => Boolean(state.players[id]),
    find_qinmidu: async () => true,
    exist_hunyin: async () => false,
    getActiveZhutianAvatarName: player => player.诸天镜系统?.当前化身 || '',
    getLifeSourceRepairMaximum,
    getMinggeEffects,
    Read_player: async id => (state.loaded[id] = structuredClone(state.players[id])),
    Read_equipment: async id => ({ owner: id }),
    Write_equipment: async (id, equipment, player) => {
      assert.equal(equipment.owner, id);
      assert.ok(player, '重算必须使用本次融合中的玩家快照');
      state.events.push({ id, type: 'equipment', player: structuredClone(player) });
      // 模拟生产重算函数回写同一个对象，捕获后续旧快照覆盖属性的问题。
      player.攻击 = player.灵根.攻击 * 100;
      player.防御 = player.灵根.防御 * 200;
      player.血量上限 = player.灵根.生命 * 1000;
    },
    Write_player: async (id, player) => {
      state.events.push({ id, type: 'player' });
      state.players[id] = structuredClone(player);
    },
    Write_linggen: async id => {
      state.events.push({ id, type: 'legacy-root' });
      const player = state.players[id];
      state.players[id].生命本源 = getLifeSourceRepairMaximum(player);
      state.players[id].攻击 = player.灵根.攻击 * 100;
    },
    player_efficiency: async id => {
      state.events.push({ id, type: 'efficiency' });
      state.players[id].修炼效率 = state.players[id].灵根.eff / 100;
    },
    redis: {
      get: async key => state.values.get(key) ?? '0',
      set: async (key, value) => {
        state.values.set(key, value);
        state.events.push({ id: key.split(':')[2], type: key.endsWith(':fusion_fail') ? `fail:${value}` : 'cooldown' });
      },
    },
    Add_修为: async (id, amount) => { state.players[id].修为 = amount; },
    add_qinmidu: async () => {},
    getSuiyunStage: () => 0,
  };
  const stripped = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const Games = new Function(...Object.keys(dependencies), `${stripped}\nreturn Games;`)(...Object.values(dependencies));
  state.run = () => Games.prototype.Couple.call({}, {
    user_id: 'A', message: [{ type: 'at', qq: 'B' }],
    reply: text => state.replies.push(text),
  });
  return state;
}

for (const [first, second, result] of recipes) {
  for (const reverse of [false, true]) {
    for (const guaranteed of [false, true]) {
      test(`双修${guaranteed ? '保底' : '随机'}融合：${reverse ? second : first} + ${reverse ? first : second} → ${result}`, async () => {
        const state = fixture(reverse ? [second, first] : [first, second], guaranteed
          ? { random: 0.99, failures: [3, 20] } : {});
        await state.run();

        const expected = talents.find(root => root.name === result);
        const template = state.data.talent_list.find(root => root.name === result);
        assert.deepEqual(template, expected, '融合不污染灵根列表');
        for (const id of ['A', 'B']) {
          const player = state.players[id];
          assert.deepEqual(player.灵根, expected, '最终灵根完整复制实际列表，包括稀有度');
          assert.equal(player.生命本源, 100 + expected.生命本源 + (id === 'A' ? 52.5 : 0));
          assert.equal(player.攻击, expected.攻击 * 100);
          assert.equal(player.防御, expected.防御 * 200);
          assert.equal(player.血量上限, expected.生命 * 1000);
          assert.equal(player.法球倍率, expected.法球倍率, '更新实战优先读取的法球倍率缓存');
          assert.equal(player.修炼效率, expected.eff / 100);
          assert.equal(state.values.get(failKey(id)), 0);
          assert.deepEqual(state.events.filter(event => event.id === id).map(event => event.type),
            ['equipment', 'player', 'efficiency', 'fail:0']);
          const recalculated = state.events.find(event => event.id === id && event.type === 'equipment').player;
          assert.deepEqual(recalculated.灵根, expected);
          assert.equal(recalculated.生命本源, player.生命本源, '重算装备前先更新生命本源');
          assert.notEqual(state.loaded[id].灵根, template, '玩家灵根与列表独立');
        }
        assert.notEqual(state.loaded.A.灵根, state.loaded.B.灵根, '双方灵根独立');
        assert.equal(state.replies.length, 1);
        assert.ok(state.replies[0].includes(result));
        assert.equal(state.replies[0].includes('保底'), guaranteed);
        if (result === '终焉神魔体') assert.equal(state.players.A.灵根.生命本源, 300);
      });
    }
  }
}

test('融合复制灵根列表的扩展字段及嵌套数据，双方和模板各自独立', async () => {
  const state = fixture(recipes[0]);
  const template = state.data.talent_list.find(root => root.name === recipes[0][2]);
  template.扩展效果 = { tags: ['列表新增字段'] };
  await state.run();
  assert.deepEqual(state.players.A.灵根.扩展效果, template.扩展效果);
  state.loaded.A.灵根.扩展效果.tags.push('玩家变化');
  assert.deepEqual(state.loaded.B.灵根.扩展效果.tags, ['列表新增字段']);
  assert.deepEqual(template.扩展效果.tags, ['列表新增字段']);
});

for (const guaranteed of [false, true]) {
  test(`${guaranteed ? '保底' : '随机'}融合目标缺少列表模板时停止且不写入`, async () => {
    const state = fixture(recipes[1], guaranteed ? { random: 0.99, failures: [20, 0] } : {});
    state.data.talent_list = state.data.talent_list.filter(root => root.name !== '终焉神魔体');
    const before = structuredClone(state.players);
    await assert.rejects(state.run(), /终焉神魔体/);
    assert.deepEqual(state.players, before);
    assert.deepEqual(state.events, []);
  });
}

for (const id of ['A', 'B']) {
  test(`双修参与者 ${id} 装载化身时保留原灵根且无融合写入`, async () => {
    const state = fixture(recipes[0]);
    state.players[id].诸天镜系统 = { 当前化身: '测试化身' };
    const before = structuredClone(state.players);
    await state.run();
    assert.deepEqual(state.players, before);
    assert.deepEqual(state.events, []);
    assert.match(state.replies[0], /装载化身.*本源/);
  });
}

for (const recipe of recipes) {
  test(`${recipe[2]} 未触发融合时保留双方灵根和本源并累加失败次数`, async () => {
    const state = fixture(recipe, { random: 0.8, failures: [2, 4] });
    const before = structuredClone(state.players);
    await state.run();
    for (const id of ['A', 'B']) {
      assert.deepEqual(state.players[id].灵根, before[id].灵根);
      assert.equal(state.players[id].生命本源, before[id].生命本源);
      assert.ok(state.players[id].修为 > 0, '普通双修继续结算');
    }
    assert.equal(state.values.get(failKey('A')), 3);
    assert.equal(state.values.get(failKey('B')), 5);
    assert.deepEqual(state.events.map(event => event.type), ['fail:3', 'fail:5', 'cooldown', 'cooldown']);
  });
}

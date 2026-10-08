import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { getBreakthroughPotentialCost } from '../apps/User/breakthroughPotential.js';

const source = fs.readFileSync(new URL('../apps/User/Level.js', import.meta.url), 'utf8');
function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

// 执行真实函数，隔离机器人、截图服务和玩家存档。
const helpers = section('function consumeBreakthroughPill(', 'export class Level');
const methods = [
  section('async OneKeyMaxUp(e)', '// =================== 一键幸运突破 / 普通突破'),
  section('async OneKeyLevelUp(e)', 'getTalentBreakthroughInfo(player) {'),
].join(',\n');
const summary = '突破结果：\n初始境界：甲\n最终境界：乙\n结束原因：修为不足';
const image = { type: 'image', file: 'fixture' };

function outputFixture(outcomes = [image], sendOutcomes = []) {
  const renders = [];
  const replies = [];
  const context = {
    console: { warn() {} },
    get_fight_img: async (_e, log) => {
      renders.push(Array.from(log));
      const outcome = outcomes[Math.min(renders.length - 1, outcomes.length - 1)];
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  const event = {
    reply: async message => {
      assert.ok(message, '截图空结果不应直接发送');
      replies.push(message);
      const outcome = sendOutcomes.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome === false ? false : 'sent';
    },
  };
  const replyLog = vm.runInNewContext(`${helpers}\nreplyOneKeyBreakthroughLog`, context);
  return { context, event, renders, replies, replyLog };
}

test('累计失败在第10次触发精简；9次及以下保留短日志', async () => {
  for (const failCount of [0, 9, 10, 11, 1000]) {
    const fixture = outputFixture();
    const messages = Object.freeze(['逐次日志', '详细消耗']);
    await fixture.replyLog(fixture.event, messages, summary, failCount);
    assert.equal(fixture.renders.length, 1);
    if (failCount < 10) {
      assert.deepEqual(fixture.renders[0], messages);
    } else {
      assert.match(fixture.renders[0][0], /过程已截断/);
      assert.equal(fixture.renders[0].slice(1).join('\n'), summary);
      assert.ok(!fixture.renders[0].includes('逐次日志'));
    }
  }
});

test('行数、字数及单条多行特效过长时，不尝试生成原长图', async () => {
  for (const [messages, compact] of [
    [Array(80).fill('过程'), false],
    [Array(81).fill('过程'), true],
    [['字'.repeat(6000)], false],
    [['字'.repeat(6001)], true],
    [['特效\n'.repeat(81)], true],
  ]) {
    const fixture = outputFixture();
    await fixture.replyLog(fixture.event, messages, summary, 0);
    assert.equal(fixture.renders.length, 1);
    assert.equal(fixture.renders[0][0].includes('过程已截断'), compact);
  }
});

test('原图返回空值或抛错时重试精简图，始终保留完整关键结算', async () => {
  for (const failed of [false, null, undefined, new Error('image too large')]) {
    const fixture = outputFixture([failed, image]);
    await fixture.replyLog(fixture.event, ['逐次日志'], summary, 0);
    assert.equal(fixture.renders.length, 2);
    assert.deepEqual(fixture.renders[0], ['逐次日志']);
    assert.equal(fixture.renders[1].slice(1).join('\n'), summary);
    assert.deepEqual(fixture.replies, [image]);
  }
});

test('精简图也生成失败时发送关键文字；已精简的图片不重复渲染', async () => {
  for (const failCount of [0, 10]) {
    for (const failed of [false, new Error('renderer unavailable')]) {
      const fixture = outputFixture([failed]);
      await fixture.replyLog(fixture.event, ['逐次日志'], summary, failCount);
      assert.equal(fixture.renders.length, failCount >= 10 ? 1 : 2);
      assert.deepEqual(fixture.replies, [`【过程已截断，仅保留关键内容】\n${summary}`]);
    }
  }
});

test('长图发送失败也重试精简图，两次发送失败后发送关键文字', async () => {
  for (const failed of [false, new Error('image rejected')]) {
    const fixture = outputFixture([image], [failed]);
    await fixture.replyLog(fixture.event, ['逐次日志'], summary, 0);
    assert.equal(fixture.renders.length, 2);
    assert.match(fixture.renders[1][0], /过程已截断/);

    const twice = outputFixture([image], [failed, failed]);
    await twice.replyLog(twice.event, ['逐次日志'], summary, 0);
    assert.equal(twice.renders.length, 2);
    assert.equal(twice.replies.at(-1), `【过程已截断，仅保留关键内容】\n${summary}`);
  }
});

function breakthroughFixture(mode, failCount, { grass = 30, outcomes, player: overrides = {} } = {}) {
  const fixture = outputFixture(outcomes);
  const player = {
    level_id: 30, Physique_id: 30, 修为: 1000, 血气: 1000, 仙道潜力: 4,
    ...overrides,
  };
  const rolls = [...Array.from({ length: failCount }, () => [0.99, 0.99]).flat(), 0, 0, 0];
  const rewards = [];
  const writes = [];
  const levels = Array.from({ length: 65 }, (_, level_id) => ({
    level_id, level: `境界${level_id}`, exp: 100,
  }));
  Object.assign(fixture.context, {
    Math: Object.assign(Object.create(Math), {
      random: () => {
        assert.ok(rolls.length, '突破次数不应因图片重试而增加');
        return rolls.shift();
      },
    }),
    data: {
      Level_list: levels, LevelMax_list: levels, tupoxianchon: [{ name: '测试仙宠' }],
      filePathMap: { weimianList: 'memory/plane.json' },
    },
    fs: { existsSync: () => true, readFileSync: () => '{"诸天位面":10}' },
    config: { getConfig: () => ({ Era: { current: { index: 2 } } }) },
    redis: { get: async () => 1, set: async () => {} },
    channel: async id => id,
    existplayer: async () => true,
    Read_player: async () => player,
    Write_player: async (_id, current) => writes.push({ ...current }),
    Read_equipment: async () => ({}),
    Write_equipment: async () => {},
    Add_HP: async () => {},
    getWeimianLevel: async () => 10,
    exist_najie_thing: async () => grass,
    Add_najie_thing: async (_id, name, type, count) => rewards.push({ name, type, count }),
    getMinggeEffects: () => ({}),
    calculateMinggePotentialCost: value => value,
    getBreakthroughPotentialCost,
    calculateShouyuan: () => 100,
    addJuelingAwareLifespan: () => ({ added: 100 }),
    bigNumberTransform: String,
  });
  const level = vm.runInNewContext(`${helpers}\n({${methods}})`, fixture.context);
  level.getTalentBreakthroughInfo = () => ({ costReduction: 1, probBonus: 0 });
  Object.assign(fixture.event, { isGroup: true, user_id: 'fixture', msg: mode.command });
  return { ...fixture, level, player, rewards, writes };
}

const modes = [
  { method: 'OneKeyLevelUp', command: '#一键突破', field: 'level_id', resource: '修为' },
  { method: 'OneKeyLevelUp', command: '#一键幸运突破', field: 'level_id', resource: '修为' },
  { method: 'OneKeyMaxUp', command: '#一键破体', field: 'Physique_id', resource: '血气' },
  { method: 'OneKeyMaxUp', command: '#一键幸运破体', field: 'Physique_id', resource: '血气' },
];

for (const mode of modes) {
  test(`${mode.command}：9/10/11次失败后仍能成功，统计、奖励和停止原因完整`, async () => {
    for (const failures of [9, 10, 11]) {
      const fixture = breakthroughFixture(mode, failures);
      await fixture.level[mode.method](fixture.event);
      assert.equal(fixture.player[mode.field], 31);
      assert.equal(fixture.player[mode.resource], 900);
      assert.equal(fixture.player.仙道潜力, 0);
      assert.equal(fixture.writes.length, failures + 1);
      assert.equal(fixture.renders.length, 1);
      const result = fixture.replies[1];
      assert.match(result, /初始境界：境界30\n最终境界：境界31/);
      assert.ok(result.includes(`成功次数：1\n失败次数：${failures}`));
      assert.match(result, /总消耗仙道潜力：4 点（剩余 0 点）/);
      assert.match(result, /总增加寿元：100年/);
      assert.match(result, /结束原因：仙道潜力不足/);
      assert.match(result, /获得仙宠：测试仙宠/);
      if (mode.command.includes('幸运')) {
        assert.ok(result.includes(`使用幸运草：${failures + 1}个（剩余 ${29 - failures} 个）`));
        assert.equal(fixture.rewards.filter(item => item.name === '幸运草').length, failures + 1);
      }
      if (failures >= 10) {
        assert.equal(fixture.renders[0].slice(1).join('\n'), result);
      } else {
        assert.equal(fixture.renders[0].filter(line => line.includes('突破失败')).length, 9);
      }
    }
  });

  test(`${mode.command}：截图连续失败不重复结算，消耗不足的停止原因保留`, async () => {
    const fixture = breakthroughFixture(mode, 1, { outcomes: [false] });
    await fixture.level[mode.method](fixture.event);
    assert.equal(fixture.writes.length, 2);
    assert.equal(fixture.renders.length, 2);
    assert.equal(fixture.replies.at(-1), `【过程已截断，仅保留关键内容】\n${fixture.replies[1]}`);

    const empty = breakthroughFixture(mode, 0, { player: { [mode.resource]: 0 } });
    await empty.level[mode.method](empty.event);
    assert.equal(empty.writes.length, 0);
    assert.match(empty.replies[1], /成功次数：0\n失败次数：0/);
    assert.match(empty.replies[1], /结束原因：(修为|气血)不足/);
  });
}

test('两种幸运指令用完幸运草后精简结果保留停止原因和精确消耗', async () => {
  for (const mode of modes.filter(item => item.command.includes('幸运'))) {
    const fixture = breakthroughFixture(mode, 10, { grass: 10 });
    await fixture.level[mode.method](fixture.event);
    assert.equal(fixture.player[mode.field], 30);
    assert.equal(fixture.writes.length, 10);
    assert.match(fixture.renders[0].join('\n'), /成功次数：0\n失败次数：10/);
    assert.match(fixture.renders[0].join('\n'), /结束原因：幸运草已用完/);
    assert.match(fixture.renders[0].join('\n'), /使用幸运草：10个（剩余 0 个）/);
  }
});

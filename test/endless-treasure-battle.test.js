import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEndlessChoice,
  createEndlessRun,
  resolveEndlessLayer,
  getEndlessSweepReward,
} from '../model/endlessRealm.js';
import {
  ENDLESS_TREASURES,
  grantRandomEndlessTreasure,
} from '../model/endlessTreasure.js';
import {
  grantTitle,
  equipTitle,
} from '../model/titleSystem.js';
import {
  isWeekendNow,
  getWeekendFreeWeekKey,
} from '../model/endlessAccess.js';

function player(name, extra = {}) {
  return {
    名号: name,
    level_id: 30,
    Physique_id: 30,
    mijinglevel_id: 2,
    xiangulevel_id: 2,
    无尽至宝列表: [],
    当前称号: null,
    ...extra,
  };
}

function createRun(seed = 20260806, playerExtras = []) {
  return createEndlessRun({
    teamId: '246810',
    groupId: 'treasure-test',
    seed,
    players: [
      { id: '10001', player: player('甲', playerExtras[0] || {}) },
      { id: '10002', player: player('乙', playerExtras[1] || {}) },
    ],
  });
}

/** 自动完成所有待选能力，直到 phase 变为 ready */
function autoChoose(run) {
  let guard = 0;
  while (run.phase === 'choice' && guard++ < 60) {
    const pending = Object.keys(run.pendingChoices || {});
    if (!pending.length) break;
    for (const id of pending) applyEndlessChoice(run, id, 1);
  }
  return run.phase === 'ready';
}

/** 连续挑战若干层，返回全部日志与统计 */
function climb(run, layers) {
  const allLogs = [];
  const allSummary = [];
  for (let i = 0; i < layers; i++) {
    if (run.phase !== 'ready') autoChoose(run);
    if (run.phase !== 'ready') break;
    const battle = resolveEndlessLayer(run);
    allLogs.push(...battle.logs);
    allSummary.push(battle.summary);
    if (battle.victory && run.phase === 'checkpoint') break;
  }
  return { allLogs, allSummary };
}

test('神主帝骑：开局召唤骑士并独立作战', () => {
  const run = createRun(20260806, [
    {
      无尽至宝列表: [
        { id: 'treasure_decade', name: 'K触屏·帝骑驱动器', level: 1 },
      ],
    },
  ]);
  // 白盒：让帝骑腰带达到3级 → 神主形态
  run.members['10001'].abilities.anime_decade_driver = 3;
  const { allLogs, allSummary } = climb(run, 2);
  const text = allLogs.join('\n');
  assert.ok(text.includes('降临战场'), '应召唤旧平成骑士');
  const summoned = allSummary.reduce((sum, s) => sum + (s.treasureRiderSummoned || 0), 0);
  const attacks = allSummary.reduce((sum, s) => sum + (s.treasureRiderAttacks || 0), 0);
  assert.ok(summoned > 0, '骑士应被召唤');
  assert.ok(attacks > 0, '骑士应独立攻击');
});

test('神主帝骑：敌人生命低于30%触发最终一击', () => {
  const run = createRun(20260806, [
    {
      无尽至宝列表: [
        { id: 'treasure_decade', name: 'K触屏·帝骑驱动器', level: 1 },
      ],
    },
  ]);
  run.members['10001'].abilities.anime_decade_driver = 3;
  const { allLogs } = climb(run, 12);
  const text = allLogs.join('\n');
  assert.ok(text.includes('一击终结'), '30%血量应触发斩杀技');
});

test('缘一：日呼传人斩出多段连击并灼烧', () => {
  const run = createRun(20260818, [
    {
      无尽至宝列表: [
        { id: 'treasure_yoriichi', name: '缘一的斩鬼之刀', level: 1 },
      ],
    },
  ]);
  const member = run.members['10001'];
  member.abilities.treasure_demon_mark = 1;
  member.abilities.anime_sun_breath = 1;
  member.abilities.anime_transparent_world = 1;
  const { allLogs } = climb(run, 8);
  const text = allLogs.join('\n');
  assert.ok(text.includes('日之灼烧'), '应附加日之灼烧');
  assert.ok(text.includes('禁绝'), '灼烧应禁绝疗愈');
});

test('一拳超人：非Boss敌人被一拳轰杀', () => {
  const run = createRun(20260707, [
    {
      无尽至宝列表: [
        { id: 'treasure_onepunch', name: '一拳超人·认真一拳', level: 1 },
      ],
    },
  ]);
  const member = run.members['10001'];
  // 满足 minAbilities:2
  member.abilities.treasure_serious_fist = 1;
  member.abilities.anime_sun_breath = 1;
  const { allLogs } = climb(run, 8);
  const text = allLogs.join('\n');
  assert.ok(text.includes('认真一拳'), '应释放认真一拳');
});

test('领域展开：每回合侵蚀敌人', () => {
  const run = createRun(20260820, [
    {
      无尽至宝列表: [
        { id: 'treasure_domain', name: '领域展开·无量空处', level: 1 },
      ],
    },
  ]);
  const member = run.members['10001'];
  member.abilities.treasure_cursed_energy = 1;
  member.abilities.anime_sun_breath = 1;
  member.abilities.anime_rasengan = 1;
  const { allLogs } = climb(run, 4);
  const text = allLogs.join('\n');
  assert.ok(text.includes('信息洪流'), '领域应展开并每回合侵蚀敌人');
});

test('禁疗生效：敌方回血被压制（日之灼烧）', () => {
  const run = createRun(20260821, [
    {
      无尽至宝列表: [
        { id: 'treasure_yoriichi', name: '缘一的斩鬼之刀', level: 1 },
      ],
    },
  ]);
  const member = run.members['10001'];
  member.abilities.treasure_demon_mark = 1;
  member.abilities.anime_sun_breath = 1;
  member.abilities.anime_transparent_world = 1;
  const { allLogs } = climb(run, 6);
  const text = allLogs.join('\n');
  assert.ok(
    text.includes('禁绝') || text.includes('禁疗') || text.includes('日之灼烧'),
    '应有禁疗/灼烧表现'
  );
});

test('称号无尽劫境天尊：全属性+25%与道痕+25%', () => {
  const run = createRun(20260822, [
    {
      无尽至宝列表: [],
      当前称号: '无尽劫境天尊',
      称号列表: ['无尽劫境天尊'],
    },
  ]);
  assert.equal(run.titleTokenBoost, 1.25);
  const member = run.members['10001'];
  assert.ok(member.titleBuffs, '应携带称号加成');
  assert.equal(member.titleBuffs.attackPct, 0.25);
  // 道痕奖励提升
  const baseTokens = getEndlessSweepReward(player('无称号'), 10).tokens;
  const titledTokens = getEndlessSweepReward(
    player('有称号', { 当前称号: '无尽劫境天尊', 称号列表: ['无尽劫境天尊'] }),
    10
  ).tokens;
  assert.ok(titledTokens >= baseTokens * 1.25 - 2);
});

test('第25关解锁：结算时授予随机至宝', () => {
  const playerData = player('新玩家');
  const gained = grantRandomEndlessTreasure(playerData, () => 0.5);
  assert.ok(gained);
  assert.ok(playerData.无尽至宝列表.length === 1);
  assert.ok(ENDLESS_TREASURES.some((t) => t.id === gained.treasure.id));
});

test('称号发放与佩戴链路', () => {
  const p = player('称号玩家');
  assert.equal(grantTitle(p, '无尽劫境天尊'), true);
  assert.equal(equipTitle(p, '无尽劫境天尊'), true);
  assert.equal(p.当前称号, '无尽劫境天尊');
  assert.deepEqual(p.称号列表, ['无尽劫境天尊']);
});

test('周末免费：周六/周日判定与周键去重', () => {
  assert.equal(isWeekendNow(new Date(2026, 7, 15)), true, '周六是周末');
  assert.equal(isWeekendNow(new Date(2026, 7, 16)), true, '周日是周末');
  assert.equal(isWeekendNow(new Date(2026, 7, 17)), false, '周一不是周末');
  assert.equal(getWeekendFreeWeekKey(new Date(2026, 7, 15)), '2026-W33');
  assert.equal(getWeekendFreeWeekKey(new Date(2026, 7, 16)), '2026-W33', '同周末周键一致');
  assert.equal(getWeekendFreeWeekKey(new Date(2026, 7, 22)), '2026-W34', '下周末周键变化');
  assert.equal(getWeekendFreeWeekKey(new Date(2026, 7, 17)), null, '非周末无周键');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  SOURCE_DUEL_NPCS,
  SOURCE_DUEL_STONE_FORMS,
  calculateSourceDuelSettlement,
  createSourceDuelSession,
  getSourceDuelResonance,
  resolveSourceDuel,
} from '../apps/Game/sourceDuelRules.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeStone(id, sourceValue, outcomeTier = 0) {
  return {
    id,
    name: `测试源石${id}`,
    outcomeName: '测试源',
    outcomeTier,
    signalTier: outcomeTier,
    sourceValue,
  };
}

test('源术对决NPC风险与难度逐档提升', () => {
  assert.deepEqual(SOURCE_DUEL_NPCS.map(npc => npc.name), [
    '吴子明',
    '拓跋昌',
    '南宫奇',
  ]);
  for (let index = 1; index < SOURCE_DUEL_NPCS.length; index++) {
    assert.ok(SOURCE_DUEL_NPCS[index].wager > SOURCE_DUEL_NPCS[index - 1].wager);
    assert.ok(SOURCE_DUEL_NPCS[index].stoneFee > SOURCE_DUEL_NPCS[index - 1].stoneFee);
    assert.ok(SOURCE_DUEL_NPCS[index].skill > SOURCE_DUEL_NPCS[index - 1].skill);
  }
});

test('源天师能看到判断且每局生成五块不同外形的源石', () => {
  const session = createSourceDuelSession(
    1,
    { occupation: '源天师', occupation_level: 51 },
    { random: () => 0, now: 123 }
  );

  assert.equal(session.createdAt, 123);
  assert.equal(session.playerStones.length, 5);
  assert.equal(new Set(session.playerStones.map(stone => stone.name)).size, 5);
  assert.ok(session.playerStones.every(stone => stone.insight.startsWith('源术判断：')));

  const ordinarySession = createSourceDuelSession(1, {}, { random: () => 0 });
  assert.ok(ordinarySession.playerStones.every(stone => stone.insight === ''));
});

test('对决石池增加普通奇石且镇园石王不混入随机池', () => {
  const names = SOURCE_DUEL_STONE_FORMS.map(stone => stone.name);
  assert.ok(names.length >= 18);
  assert.ok(names.includes('星辰石'));
  assert.ok(names.includes('麒麟石'));
  assert.ok(!names.includes('魔胎'));
  assert.ok(!names.includes('九窍石人'));
});

test('成对石相会提高三石切源总值', () => {
  const resonance = getSourceDuelResonance([
    makeStone(1, 100000),
    { ...makeStone(2, 100000), name: '烈阳石' },
    { ...makeStone(3, 100000), name: '月亮石' },
  ]);
  assert.equal(resonance.name, '日月同辉');

  const session = {
    npcId: 1,
    stoneFeePaid: true,
    playerStones: [
      { ...makeStone(1, 100000), name: '烈阳石' },
      { ...makeStone(2, 100000), name: '月亮石' },
      makeStone(3, 100000),
      makeStone(4, 0),
      makeStone(5, 0),
    ],
    npcStones: [1, 2, 3, 4, 5].map(id => makeStone(id, 0)),
  };
  const duel = resolveSourceDuel(session, [1, 2, 3], { random: () => 0 });
  assert.equal(duel.playerBaseSource, 300000);
  assert.equal(duel.playerSource, 375000);
  assert.equal(duel.playerResonance.name, '日月同辉');

  session.npcStones = [
    { ...makeStone(1, 100000, 1), name: '烈阳石' },
    { ...makeStone(2, 100000, 1), name: '月亮石' },
    makeStone(3, 100000, 1),
    makeStone(4, 100000, 1),
    makeStone(5, 100000, 1),
  ];
  const npcDuel = resolveSourceDuel(session, [3, 4, 5], { random: () => 0 });
  assert.ok(npcDuel.npcCuts.some(stone => stone.name === '烈阳石'));
  assert.ok(npcDuel.npcCuts.some(stone => stone.name === '月亮石'));
  assert.equal(npcDuel.npcSource, 375000);
});

test('胜负平按石料费、双方押注和双方切源正确结算', () => {
  const npc = SOURCE_DUEL_NPCS[0];

  assert.deepEqual(calculateSourceDuelSettlement(npc, 'win', 300000, 200000), {
    cost: 400000,
    amountDue: 200000,
    credit: 900000,
    net: 500000,
  });
  assert.deepEqual(calculateSourceDuelSettlement(npc, 'lose', 300000, 200000), {
    cost: 400000,
    amountDue: 200000,
    credit: 0,
    net: -400000,
  });
  assert.deepEqual(calculateSourceDuelSettlement(npc, 'draw', 300000, 300000), {
    cost: 400000,
    amountDue: 200000,
    credit: 500000,
    net: 100000,
  });
  assert.deepEqual(calculateSourceDuelSettlement(npc, 'win', 300000, 200000, '豪赌'), {
    cost: 800000,
    amountDue: 600000,
    credit: 1700000,
    net: 900000,
  });
  assert.throws(
    () => calculateSourceDuelSettlement(npc, 'win', 300000, 200000, '全押'),
    /只能选择平注、加注或豪赌/
  );
});

test('败者的押注与本方切源不会返还', () => {
  const session = {
    npcId: 1,
    stoneFeePaid: true,
    playerStones: [10, 20, 30, 40, 50].map((value, index) =>
      makeStone(index + 1, value, index)
    ),
    npcStones: [100, 200, 300, 400, 500].map((value, index) =>
      makeStone(index + 1, value, index)
    ),
  };

  const duel = resolveSourceDuel(session, [1, 2, 3], { random: () => 0 });
  assert.equal(duel.result, 'lose');
  assert.equal(duel.playerSource, 60);
  assert.equal(duel.settlement.credit, 0);
  assert.equal(duel.settlement.net, -400000);
});

test('源术对决拒绝重复选择和损坏的石池', () => {
  const stones = [1, 2, 3, 4, 5].map(id => makeStone(id, id));
  const session = {
    npcId: 1,
    stoneFeePaid: true,
    playerStones: stones,
    npcStones: stones,
  };

  assert.throws(
    () => resolveSourceDuel(session, [1, 1, 2]),
    /请选择三块不同的源石/
  );
  assert.throws(
    () => resolveSourceDuel({ ...session, playerStones: stones.slice(1) }, [1, 2, 3]),
    /石池数据已经损坏/
  );
});

test('源术对决命令、限时选择和帮助入口已经接入', () => {
  const gameSource = fs.readFileSync(path.join(rootDir, 'apps/Game/Games.js'), 'utf8');
  const helpSource = fs.readFileSync(
    path.join(rootDir, 'config/help/zhutianhelp.yaml'),
    'utf8'
  );

  assert.match(gameSource, /fnc: 'StoneDuelMenu'/);
  assert.match(gameSource, /fnc: 'StoneDuelStart'/);
  assert.match(gameSource, /fnc: 'StoneDuelChoice'/);
  assert.match(gameSource, /SOURCE_DUEL_STATE_TTL_SECONDS/);
  assert.match(gameSource, /stone_duel_cd/);
  assert.match(gameSource, /平注\|加注\|豪赌/);
  assert.match(helpSource, /#源石坊对决/);
});

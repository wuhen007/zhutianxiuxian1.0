import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

import {
  advanceStrangeSacrificeState,
  applyCausalHighlandPressure,
  ensureStrangeSacrificeState,
} from '../model/strangeSacrifice.js';
import {
  CAUSAL_COMPENSATION_MAX_TARGETS,
  applyCausalCompensation,
  collectRelatedNames,
  getCausalDebtTier,
} from '../model/worldlineAuthority.js';
import {
  damagePlanes,
  PLANE_DESTRUCTION_SOURCES,
} from '../model/planeDestruction.js';
import { getRealmEventWorldYear } from '../model/realmEventClock.js';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const causalSource = fs.readFileSync(
  new URL('../model/causalImpact.js', import.meta.url),
  'utf8',
).replace(/^import[\s\S]*?;\s*/gm, '').replace(/\bexport\s+/g, '');
const CAUSAL_DAMAGE_PLANES = Object.freeze([
  '凡间', '仙界', '下界八域', '太初星墟', '遮天位面',
  '九天十地', '界海', '时间长河', '仙域',
]);

function loadCausalImpact(context) {
  return vm.runInNewContext(
    `${causalSource}\n({ CAUSAL_DAMAGE_PLANES, persistCausalImpact })`,
    context,
  );
}

function debtResult(debt, delta = debt) {
  return { debt, delta, tier: getCausalDebtTier(debt) };
}

function fixture({ bubble = false, sacrifice = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'causal-impact-'));
  const playerDirectory = path.join(root, 'players');
  fs.mkdirSync(playerDirectory, { recursive: true });
  const causalStateFile = path.join(root, 'worldline_causal_state.json');
  const sacrificeStateFile = path.join(root, 'strange_sacrifice_state.json');
  const planeFile = path.join(root, 'planes.json');
  const players = new Map([
    ['100', {
      id: '100',
      名号: '施术者',
      mijinglevel_id: 22,
      血量上限: 1000,
      当前血量: 1000,
      道侣: { id: '200', name: '道侣甲' },
    }],
    ['200', {
      id: '200',
      名号: '道侣甲',
      mijinglevel_id: 20,
      血量上限: 1000,
      当前血量: 1000,
      道侣: { id: '100', name: '施术者' },
      ...(bubble ? { 始祖永祭: { status: 'bubble' }, 修仙状态: '空间泡影' } : {}),
    }],
  ]);
  for (const [id, player] of players) {
    fs.writeFileSync(path.join(playerDirectory, `${id}.json`), JSON.stringify(player));
  }

  const planes = Object.fromEntries(CAUSAL_DAMAGE_PLANES.map(name => [name, 1]));
  planes.现世承受力 = 1_000_000;
  planes.大宇宙精气流失 = 0;
  fs.writeFileSync(planeFile, JSON.stringify(planes));
  fs.writeFileSync(
    sacrificeStateFile,
    JSON.stringify(ensureStrangeSacrificeState(sacrifice)),
  );

  const readPlayer = async id => structuredClone(players.get(String(id)));
  const writePlayer = async (id, player) => {
    await new Promise(resolve => setTimeout(resolve, 1));
    players.set(String(id), structuredClone(player));
    fs.writeFileSync(path.join(playerDirectory, `${id}.json`), JSON.stringify(player));
  };

  return {
    root,
    playerDirectory,
    causalStateFile,
    sacrificeStateFile,
    planeFile,
    players,
    actor: structuredClone(players.get('100')),
    readPlayer,
    writePlayer,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

function persist(fixture, result, extra = {}) {
  const { persistCausalImpact } = loadCausalImpact({
    fs,
    path,
    config: { getConfig: () => ({ Era: { current: { totalYears: 1_000 } } }) },
    __PATH: { data_path: fixture.root, player_path: fixture.playerDirectory },
    Read_player: fixture.readPlayer,
    Write_player: fixture.writePlayer,
    applyCausalCompensation,
    CAUSAL_COMPENSATION_MAX_TARGETS,
    collectRelatedNames,
    getCausalDebtTier,
    applyCausalHighlandPressure,
    ensureStrangeSacrificeState,
    getRealmEventWorldYear,
    damagePlanes,
    PLANE_DESTRUCTION_SOURCES,
    writeJsonAtomically,
    withPlayerMutationLock,
    console: { warn() {} },
  });
  return persistCausalImpact(fixture.actor, result, {
    actorId: '100',
    playerDirectory: fixture.playerDirectory,
    causalStateFile: fixture.causalStateFile,
    sacrificeStateFile: fixture.sacrificeStateFile,
    planeFile: fixture.planeFile,
    readPlayer: fixture.readPlayer,
    writePlayer: fixture.writePlayer,
    now: 1_000,
    worldYear: 1_000,
    ...extra,
  });
}

test('造化万物先落盘主存档，再执行关联因果影响', () => {
  const source = fs.readFileSync(
    new URL('../apps/User/zhengdaotixi.js', import.meta.url),
    'utf8',
  );
  const sectionStart = source.indexOf('const causalDebtAmount');
  const saved = source.indexOf('await Write_player(player_qq, player);', sectionStart);
  const impacted = source.indexOf('const causalImpact = await persistCausalImpact', sectionStart);
  assert.ok(sectionStart >= 0 && saved > sectionStart && impacted > saved);
});

test('300+ 因果债会实际结算关联玩家的众生代偿', async () => {
  const f = fixture();
  try {
    const impact = await persist(f, debtResult(300));
    const target = f.players.get('200');
    assert.equal(target.当前血量, 700);
    assert.equal(target.道伤, 1);
    assert.equal(target.因果代偿.次数, 1);
    assert.equal(impact.compensation.applied.length, 1);
    assert.equal(impact.compensation.applied[0].relation, '道侣');
  } finally {
    f.cleanup();
  }
});

test('600+ 因果债会记录位面损伤并扣减现世承受力', async () => {
  const f = fixture();
  try {
    const impact = await persist(f, debtResult(600));
    const plane = JSON.parse(fs.readFileSync(f.planeFile, 'utf8'));
    assert.deepEqual(impact.planes.damaged, ['凡间']);
    assert.equal(plane['位面损坏记录'].凡间.damage, 10);
    assert.equal(plane.现世承受力, 900_000);
    assert.equal(plane.大宇宙精气流失, 100_000);
  } finally {
    f.cleanup();
  }
});

test('1000+ 因果债会提前大祭，并让状态机在到期纪年启动', async () => {
  const f = fixture({
    sacrifice: {
      phase: 'between_sacrifices',
      smallCount: 1,
      bigCount: 0,
      bigDueWorldYear: 2_000,
    },
  });
  try {
    const impact = await persist(f, debtResult(1000));
    const state = JSON.parse(fs.readFileSync(f.sacrificeStateFile, 'utf8'));
    assert.equal(impact.highland.appliedTo, 'due');
    assert.equal(impact.highland.dueAfter, 1_000);
    assert.equal(state.bigDueWorldYear, 1_000);
    assert.equal(state.causalPressureCount, 1);

    const advanced = advanceStrangeSacrificeState(state, {
      worldYear: 1_000,
      hasImmortalEmperor: true,
    });
    assert.equal(advanced.event.type, 'big_started');
  } finally {
    f.cleanup();
  }
});

test('空间泡影中的关联玩家跳过众生代偿', async () => {
  const f = fixture({ bubble: true });
  try {
    const before = structuredClone(f.players.get('200'));
    const impact = await persist(f, debtResult(300));
    assert.deepEqual(f.players.get('200'), before);
    assert.equal(impact.compensation.applied.length, 0);
    assert.equal(impact.compensation.skippedBubble.length, 1);
  } finally {
    f.cleanup();
  }
});

test('重复并发结算在锁内串行，代偿与累计记录不丢失', async () => {
  const f = fixture();
  try {
    await Promise.all([
      persist(f, debtResult(300), { now: 1_000 }),
      persist(f, debtResult(300), { now: 1_001 }),
    ]);
    const target = f.players.get('200');
    const state = JSON.parse(fs.readFileSync(f.causalStateFile, 'utf8'));
    assert.equal(target.当前血量, 400);
    assert.equal(target.因果代偿.次数, 2);
    assert.equal(state.relatedIncidents, 2);
    assert.equal(state.history.length, 2);
  } finally {
    f.cleanup();
  }
});

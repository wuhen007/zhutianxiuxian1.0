import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { damagePlanes, PLANE_DAMAGE_RECORD_KEY } from '../model/planeDestruction.js';
import {
  SELF_DAO_COSTS,
  SELF_DAO_DIVINE_EMBRYO_ATTEMPT,
  SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT,
  SELF_DAO_LATE_COST_MULTIPLIER,
  SELF_DAO_PEAK_DAMAGE_REDUCTION,
  SELF_DAO_PLANE_TARGETS,
  SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT,
  SELF_DAO_RECOVERY_MS,
  SELF_DAO_REQUIRED_ATTEMPTS,
  applySelfDaoBattleOpening,
  completeCorpseEmperorRecovery,
  consumeSelfDaoDeduction,
  enforceSelfDaoBuffSuppression,
  ensureSelfDaoDeduction,
  getSelfDaoDeductionCosts,
  getSelfDaoDeductionGate,
  promoteSelfDaoToImmortalEmperor,
  resetSelfDaoBattleState,
  setCultivationSystemRealms,
  startCorpseEmperorRecovery,
  trySelfDaoDivineEmbryoRevival,
} from '../model/selfDaoDeduction.js';

function quasiEmperor(overrides = {}) {
  return {
    名号: '测试道祖',
    mijinglevel_id: 20,
    xiangulevel_id: 1,
    huafenlevel_id: 1,
    已创自身之道: true,
    自身之道名称: '我道',
    自身之道阶段: 6,
    自身之道境界: '准仙帝·帝光映古',
    修炼次数: 300,
    自创修炼体系: { name: '测试体系', route: 'mijing' },
    纪元积累: SELF_DAO_COSTS.era * 400,
    心神: SELF_DAO_COSTS.mind * 400,
    元神: SELF_DAO_COSTS.spirit * 400,
    仙道潜力: SELF_DAO_COSTS.potential * 400,
    寿元: SELF_DAO_COSTS.lifespan * 400,
    修为: SELF_DAO_COSTS.cultivation * 400,
    血气: SELF_DAO_COSTS.blood * 400,
    血量上限: 1000,
    当前血量: 1000,
    ...overrides,
  };
}

test('己道前五层按原价，十/十五/二十层依次解锁极巅、神胎与半步仙帝', () => {
  const player = quasiEmperor();
  const before = { ...player };
  const first = consumeSelfDaoDeduction(player, 1);
  assert.equal(first.ok, true);
  assert.equal(first.attempt, 1);
  assert.equal(player.纪元积累, before.纪元积累 - SELF_DAO_COSTS.era);
  assert.equal(player.元神, before.元神 - SELF_DAO_COSTS.spirit);
  assert.equal(player.寿元, before.寿元 - SELF_DAO_COSTS.lifespan);
  assert.equal(player.修为, before.修为 - SELF_DAO_COSTS.cultivation);

  for (let attempt = 2; attempt <= 5; attempt++) assert.equal(consumeSelfDaoDeduction(player, attempt).attempt, attempt);
  assert.equal(getSelfDaoDeductionGate(player).reason, 'realms');
  assert.equal(setCultivationSystemRealms(player, ['启灵', '命轮', '道宫', '神桥', '天门', '路尽']).ok, true);
  const lateCosts = getSelfDaoDeductionCosts(player);
  assert.equal(lateCosts.mind, SELF_DAO_COSTS.mind);
  for (const key of Object.keys(SELF_DAO_COSTS).filter(key => key !== 'mind')) {
    assert.equal(lateCosts[key], SELF_DAO_COSTS[key] * SELF_DAO_LATE_COST_MULTIPLIER);
  }
  const beforeSixth = { ...player };
  assert.equal(consumeSelfDaoDeduction(player, 6).attempt, 6);
  assert.equal(player.心神, beforeSixth.心神 - SELF_DAO_COSTS.mind);
  assert.equal(player.元神, beforeSixth.元神 - SELF_DAO_COSTS.spirit * SELF_DAO_LATE_COST_MULTIPLIER);
  assert.equal(player.纪元积累, beforeSixth.纪元积累 - SELF_DAO_COSTS.era * SELF_DAO_LATE_COST_MULTIPLIER);
  for (let attempt = 7; attempt <= SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT; attempt++) {
    assert.equal(consumeSelfDaoDeduction(player, attempt).attempt, attempt);
  }
  assert.equal(player.己道推演.quasiEmperorPeak, true);
  assert.equal(player.自身之道境界, '准仙帝极巅·绝顶道祖');
  assert.equal(player.己道推演.battlePending, false);
  for (let attempt = 11; attempt <= SELF_DAO_DIVINE_EMBRYO_ATTEMPT; attempt++) {
    assert.equal(consumeSelfDaoDeduction(player, attempt).attempt, attempt);
  }
  assert.equal(player.己道推演.divineEmbryo, '已结出');
  assert.equal(player.己道推演.battlePending, false);
  for (let attempt = 16; attempt <= SELF_DAO_HALF_IMMORTAL_EMPEROR_ATTEMPT; attempt++) {
    assert.equal(consumeSelfDaoDeduction(player, attempt).attempt, attempt);
  }
  assert.equal(player.己道推演.halfImmortalEmperor, true);
  assert.equal(player.己道推演.battlePending, true);
  assert.equal(player.己道推演.attempts, SELF_DAO_REQUIRED_ATTEMPTS);
  assert.deepEqual(player.自创修炼体系.realms, ['启灵', '命轮', '道宫', '神桥', '天门', '路尽']);
});

test('旧版十层未成帝存档迁移为准仙帝极巅，不再提前触发尸骸帝战', () => {
  const player = quasiEmperor({
    己道推演: {
      attempts: 10,
      realms: ['一', '二', '三', '四', '五', '六'],
      divineEmbryo: '已结出',
      battlePending: true,
    },
  });
  const state = ensureSelfDaoDeduction(player);
  assert.equal(state.attempts, SELF_DAO_QUASI_EMPEROR_PEAK_ATTEMPT);
  assert.equal(state.quasiEmperorPeak, true);
  assert.equal(state.divineEmbryo, undefined);
  assert.equal(state.battlePending, false);
});

test('己道里程碑能力会在真实战斗状态中生效', () => {
  const player = quasiEmperor({
    神通伤害减免: 0.1,
    近战伤害减免: 0.05,
    己道推演: {
      progressionVersion: 2,
      attempts: SELF_DAO_REQUIRED_ATTEMPTS,
      realms: ['一', '二', '三', '四', '五', '六'],
    },
  });
  const enemy = { 名号: '加持者', 攻击: 100, 防御: 80, 血量上限: 500, 当前血量: 500, 护盾值: 200 };
  resetSelfDaoBattleState(player);
  resetSelfDaoBattleState(enemy);
  const messages = applySelfDaoBattleOpening(player, enemy);
  applySelfDaoBattleOpening(player, enemy);
  assert.equal(player.神通伤害减免, 0.1 + SELF_DAO_PEAK_DAMAGE_REDUCTION);
  assert.equal(player.近战伤害减免, 0.05 + SELF_DAO_PEAK_DAMAGE_REDUCTION);
  assert.match(messages.join('\n'), /半步仙帝·破法/);

  enemy.攻击 = 300;
  enemy.防御 = 240;
  enemy.血量上限 = 1500;
  enemy.当前血量 = 1500;
  enemy.护盾值 = 300;
  assert.equal(enforceSelfDaoBuffSuppression(enemy), true);
  assert.equal(enemy.攻击, 100);
  assert.equal(enemy.防御, 80);
  assert.equal(enemy.血量上限, 500);
  assert.equal(enemy.当前血量, 500);
  assert.equal(enemy.护盾值, 0);

  player.当前血量 = 0;
  player.dongjie = true;
  assert.equal(trySelfDaoDivineEmbryoRevival(player).revived, true);
  assert.equal(player.当前血量, player.血量上限);
  assert.equal(player.dongjie, false);
  player.当前血量 = 0;
  assert.equal(trySelfDaoDivineEmbryoRevival(player).revived, false);
});

test('统一战斗器会执行神胎额外复生与半步仙帝破法', () => {
  const cwd = fileURLToPath(new URL('../../..', import.meta.url));
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot = { makeLog() {} };
    globalThis.logger = new Proxy({}, { get: () => () => {} });
    const { zd_battle } = await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const common = {
      暴击率: 0, 暴击伤害: 1.5, 闪避率: 0, 吸血率: 0, 穿透: 0, 法球倍率: 1,
      灵根: { name: '测试灵根', type: '普通', 法球倍率: 1 }, 生命本源: 1,
      mijinglevel_id: 20, xiangulevel_id: 1, huafenlevel_id: 1,
      自创修炼体系: { name: '测试体系', route: 'mijing' },
    };
    const embryo = {
      ...common, 名号: '神胎测试者', 攻击: 1, 防御: 1, 当前血量: 100, 血量上限: 100,
      速度: 1, 学习的功法: [],
      己道推演: { progressionVersion: 2, attempts: 15, realms: ['一','二','三','四','五','六'] },
    };
    const killer = {
      ...common, 名号: '压测敌手', 攻击: 1_000_000, 防御: 1_000_000,
      当前血量: 1_000_000, 血量上限: 1_000_000, 速度: 3000, 学习的功法: [],
    };
    const revival = await zd_battle(embryo, killer, { maxRound: 3, preserveHpOnTimeout: true });
    assert.equal(revival.msg.filter(line => String(line).includes('己道神胎·再生')).length, 1);

    const halfStep = {
      ...common, 名号: '半步仙帝测试者', 攻击: 1000, 防御: 1000,
      当前血量: 1000, 血量上限: 1000, 速度: 3000, 学习的功法: [],
      己道推演: { progressionVersion: 2, attempts: 20, realms: ['一','二','三','四','五','六'] },
    };
    const shielded = {
      ...common, 名号: '护盾加持者', 攻击: 1, 防御: 1, 当前血量: 1000,
      血量上限: 1000, 护盾值: 1_000_000_000, 速度: 1, 学习的功法: [],
    };
    const broken = await zd_battle(halfStep, shielded, { maxRound: 1, preserveHpOnTimeout: true });
    assert.ok(broken.B_hp < shielded.血量上限);
    assert.ok(broken.msg.some(line => String(line).includes('半步仙帝·破法')));
    assert.equal(broken.msg.some(line => String(line).includes('护盾抵消')), false);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('三体系晋升映射正确，尸骸战败320分钟后重聚成帝', () => {
  const player = quasiEmperor({
    mijinglevel_id: 1,
    huafenlevel_id: 21,
    自创修炼体系: { name: '花路', route: 'huafen' },
    己道推演: { progressionVersion: 2, attempts: 20, realms: ['一', '二', '三', '四', '五', '六'], battlePending: true },
  });
  const recovery = startCorpseEmperorRecovery(player, 1000);
  assert.equal(recovery.endAt, 1000 + SELF_DAO_RECOVERY_MS);
  assert.equal(player.修仙状态, '身灭道消');
  assert.equal(completeCorpseEmperorRecovery(player, recovery.endAt - 1).reason, 'waiting');
  assert.equal(completeCorpseEmperorRecovery(player, recovery.endAt).ok, true);
  assert.equal(player.huafenlevel_id, 22);
  assert.equal(player.自身之道阶段, 7);
  assert.equal(player.修仙状态, '空闲');

  const xiangu = quasiEmperor({
    mijinglevel_id: 1,
    xiangulevel_id: 21,
    自创修炼体系: { name: '古路', route: 'xiangu' },
    己道推演: { progressionVersion: 2, attempts: 20, realms: ['一', '二', '三', '四', '五', '六'], battlePending: true },
  });
  promoteSelfDaoToImmortalEmperor(xiangu, 2000);
  assert.equal(xiangu.xiangulevel_id, 22);
});

test('永恒仙图抵消尸骸仙帝身灭道消并保留重战状态', () => {
  const player = quasiEmperor({ 当前大道至宝: '永恒仙图', 当前血量: 0, 元神: 0 });
  const recovery = startCorpseEmperorRecovery(player, 1000);
  assert.equal(recovery.rewritten, true);
  assert.equal(player.己道推演.battlePending, true);
  assert.equal(player.己道推演.recovery, null);
  assert.equal(player.当前血量, 1);
  assert.equal(player.元神, 1);
});

test('尸骸呼吸只损坏位面并扣减诸天承受力', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corpse-plane-'));
  const file = path.join(dir, '位面.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(file, JSON.stringify({ 现世承受力: 2_000_000, 仙域: 1, 九天十地: 1 }), 'utf8');

  const result = damagePlanes(file, SELF_DAO_PLANE_TARGETS, { bearingLossPerPlane: 100_000, now: 123 });
  const world = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(result.damaged.length, SELF_DAO_PLANE_TARGETS.length);
  assert.equal(world.仙域, 1);
  assert.equal(world.九天十地, 1);
  assert.equal(world.现世承受力, 1_000_000);
  assert.equal(world.大宇宙精气流失, 1_000_000);
  assert.equal(world[PLANE_DAMAGE_RECORD_KEY].小阴间.source, 'corpse_emperor_breath');
  assert.equal(world[PLANE_DAMAGE_RECORD_KEY].阳间.damage, 10);
});

test('指令层接入推演、六境、尸骸战与三体系旁路', () => {
  const app = fs.readFileSync(new URL('../apps/User/SelfDaoDeduction.js', import.meta.url), 'utf8');
  const level = fs.readFileSync(new URL('../apps/User/Level.js', import.meta.url), 'utf8');
  const flower = fs.readFileSync(new URL('../apps/User/FlowerPollenPath.js', import.meta.url), 'utf8');
  assert.match(app, /#推演己道/);
  assert.match(app, /#设立体系境界/);
  assert.match(app, /zd_battle\(challenger, corpse/);
  assert.match(app, /_时间长河反制目标: true/);
  assert.match(app, /第20\/20层/);
  assert.match(level, /第十层抵达准仙帝极巅/);
  const battle = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  assert.match(battle, /trySelfDaoDivineEmbryoRevival/);
  assert.match(battle, /enforceSelfDaoBuffSuppression/);
  assert.match(level, /准仙帝绝巅·己道未尽/);
  assert.match(flower, /道祖绝巅·己道未尽/);
});

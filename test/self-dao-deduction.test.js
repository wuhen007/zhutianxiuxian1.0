import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { damagePlanes, PLANE_DAMAGE_RECORD_KEY } from '../model/planeDestruction.js';
import {
  SELF_DAO_COSTS,
  SELF_DAO_LATE_COST_MULTIPLIER,
  SELF_DAO_PLANE_TARGETS,
  SELF_DAO_RECOVERY_MS,
  completeCorpseEmperorRecovery,
  consumeSelfDaoDeduction,
  getSelfDaoDeductionCosts,
  getSelfDaoDeductionGate,
  promoteSelfDaoToImmortalEmperor,
  setCultivationSystemRealms,
  startCorpseEmperorRecovery,
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
    纪元积累: SELF_DAO_COSTS.era * 110,
    心神: SELF_DAO_COSTS.mind * 110,
    元神: SELF_DAO_COSTS.spirit * 110,
    仙道潜力: SELF_DAO_COSTS.potential * 110,
    寿元: SELF_DAO_COSTS.lifespan * 110,
    修为: SELF_DAO_COSTS.cultivation * 110,
    血气: SELF_DAO_COSTS.blood * 110,
    血量上限: 1000,
    当前血量: 1000,
    ...overrides,
  };
}

test('己道前五次按原价推演，第六次起除心神外消耗二十倍', () => {
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
  for (let attempt = 7; attempt <= 10; attempt++) assert.equal(consumeSelfDaoDeduction(player, attempt).attempt, attempt);
  assert.equal(player.己道推演.divineEmbryo, '已结出');
  assert.equal(player.己道推演.battlePending, true);
  assert.deepEqual(player.自创修炼体系.realms, ['启灵', '命轮', '道宫', '神桥', '天门', '路尽']);
});

test('三体系晋升映射正确，尸骸战败320分钟后重聚成帝', () => {
  const player = quasiEmperor({
    mijinglevel_id: 1,
    huafenlevel_id: 21,
    自创修炼体系: { name: '花路', route: 'huafen' },
    己道推演: { attempts: 10, realms: ['一', '二', '三', '四', '五', '六'], battlePending: true },
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
    己道推演: { attempts: 10, realms: ['一', '二', '三', '四', '五', '六'], battlePending: true },
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
  assert.match(level, /准仙帝绝巅·己道未尽/);
  assert.match(flower, /道祖绝巅·己道未尽/);
});

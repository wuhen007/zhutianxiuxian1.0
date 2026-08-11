import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPlayerAttributeReport,
  buildPlayerAttributeView,
  calculateAllAttributeSlotBonuses,
  calculateExtraAttributeLimit,
  calculateWudaoCosts,
} from '../model/playerAttributeReport.js';

function createViewFixture() {
  return {
    player: {
      id: '10001',
      名号: '测试道君',
      level_id: 42,
      Physique_id: 41,
      mijinglevel_id: 11,
      xiangulevel_id: 1,
      灵根: { type: '体质', name: '先天道胎', 攻击: 0.1, 防御: 0.08, 生命: 0.12 },
      天资等级: '天纵之资',
      学习的功法: [],
      攻击: 1_000_000,
      防御: 800_000,
      血量上限: 10_000_000,
      当前血量: 9_000_000,
      暴击率: 0.5,
      暴击伤害: 2,
      攻击加成: 260_000_000,
      防御加成: 200_000_000,
      生命加成: 257_000_000,
      仙道潜力: 5000,
      寿元: 1_000_000,
      当前先天至宝: '',
      光阴加成: { 攻: 100, 防: 200, 生: 300 },
    },
    equipment: {
      武器: { name: '测试剑', atk: 0.1, def: 0, HP: 0, bao: 0.05 },
      护具: {},
      法宝: {},
      帝兵: {},
      至宝: {},
    },
    data: {
      Level_list: [{ level_id: 42, level: '练气四十二层' }],
      LevelMax_list: [{ level_id: 41, level: '炼体四十一层' }],
      Levelmijing_list: [{ level_id: 11, level: '斩道王者', 基础攻击: 10, 基础防御: 10, 基础血量: 10 }],
      xiangujinshi_list: [{ level_id: 1, level: '搬血境', 基础攻击: 1, 基础防御: 1, 基础血量: 1 }],
      minggeList: [],
      gongfa_list: [],
      timegongfa_list: [],
      dijingList: [],
    },
    difficulty: { name: '普通', drainsLifespan: true, reincarnatesOnExhaustion: false },
    now: Date.UTC(2026, 7, 10),
  };
}

test('额外属性上限在42级后按每级一千万增长', () => {
  assert.deepEqual(calculateExtraAttributeLimit({
    level_id: 42,
    Physique_id: 41,
    mijinglevel_id: 10,
  }), {
    qi: 51_000_000,
    body: 41_000_000,
    secret: 150_000_000,
    total: 242_000_000,
  });
});

test('完整属性报告稳定输出八个分区且不泄漏无效数值', () => {
  const report = buildPlayerAttributeReport({
    player: {
      id: '1',
      名号: '测试修士',
      level_id: 10,
      Physique_id: 10,
      mijinglevel_id: 11,
      xiangulevel_id: 1,
      灵根: { type: '体质', name: '先天道胎', 攻击: 0.1, 防御: 0.1, 生命: 0.1 },
      天资等级: '天纵之资',
      学习的功法: [],
      攻击: 100,
      防御: 80,
      血量上限: 1000,
      当前血量: 900,
      仙道潜力: 5000,
      寿元: 1_000_000,
      当前先天至宝: '',
    },
    equipment: {
      武器: { name: '剑', atk: 0.1, def: 0, HP: 0, bao: 0.05 },
      护具: {},
      法宝: {},
      帝兵: {},
      至宝: {},
    },
    data: {
      Level_list: [{ level_id: 10, level: '练气十层' }],
      LevelMax_list: [{ level_id: 10, level: '炼体十层' }],
      Levelmijing_list: [{ level_id: 11, level: '斩道王者', 基础攻击: 10, 基础防御: 10, 基础血量: 10 }],
      xiangujinshi_list: [{ level_id: 1, level: '搬血境', 基础攻击: 1, 基础防御: 1, 基础血量: 1 }],
      minggeList: [],
      gongfa_list: [],
      timegongfa_list: [],
      dijingList: [],
    },
    difficulty: { name: '普通', drainsLifespan: true, reincarnatesOnExhaustion: false },
    now: Date.UTC(2026, 7, 10),
  });
  assert.equal(report.length, 8);
  assert.equal(report.join('\n').includes('神通抗性'), true);
  assert.doesNotMatch(report.join('\n'), /NaN|undefined/);
});

test('混合高低装备词条按整件装备的固定值模式展示', () => {
  const report = buildPlayerAttributeReport({
    player: { id: '1', level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1, 灵根: {}, 学习的功法: [] },
    equipment: {
      武器: { name: '混合武器', atk: 100, def: 2, HP: 3, bao: 0 },
      护具: {}, 法宝: {}, 帝兵: {}, 至宝: {},
    },
    data: {
      Level_list: [{ level_id: 1, level: '一层' }],
      LevelMax_list: [{ level_id: 1, level: '一层' }],
      Levelmijing_list: [{ level_id: 1, level: '轮海', 基础攻击: 1, 基础防御: 1, 基础血量: 1 }],
      xiangujinshi_list: [{ level_id: 1, level: '搬血', 基础攻击: 1, 基础防御: 1, 基础血量: 1 }],
      minggeList: [], gongfa_list: [], timegongfa_list: [], dijingList: [],
    },
    difficulty: {},
  });
  assert.match(report.join('\n'), /武器【混合武器】攻\+100｜防\+2｜血\+3/);
});

test('低境界自铸特殊帝兵按现有结算同时取得本命与十分之一加成', () => {
  const result = calculateAllAttributeSlotBonuses(
    { id: '1', mijinglevel_id: 10, xiangulevel_id: 8 },
    { 帝兵: { name: '封神榜', author_name: '1', 全属性: 10 }, 至宝: {} },
    {
      secret: [{ level_id: 10, 基础攻击: 100, 基础防御: 200, 基础血量: 300 }],
      ancient: [{ level_id: 8, 基础攻击: 10, 基础防御: 20, 基础血量: 30 }],
    }
  );
  assert.equal(result.imperial.scale, 1.1);
  assert.equal(result.imperial.attack, 1210);
  assert.equal(result.imperial.defense, 2420);
  assert.equal(result.imperial.health, 3630);
});

test('悟道消耗依次应用功法、命格寿元倍率与问道签', () => {
  const now = Date.UTC(2026, 7, 10);
  const player = {
    mijinglevel_id: 11,
    xiangulevel_id: 1,
    学习的功法: ['浑源法门·悟道'],
    功法熟练度: { '浑源法门·悟道': 1000 },
    红尘仙缘签: { type: 'question', expiresAt: now + 1000 },
    灵根: {},
  };
  const report = calculateWudaoCosts(player, {
    now,
    eraIndex: 2,
    technique: { name: '无', bonus: 0 },
    minggeEffects: { 悟道寿元消耗减少: 0.2 },
  });
  assert.equal(report.costs.potential, 816);
  assert.equal(report.costs.cultivation, 195_840_000);
  assert.equal(report.costs.lifespan, 1_305_600);
});

test('HTML属性视图完整输出真实分区与稀释状态', () => {
  const view = buildPlayerAttributeView(createViewFixture());
  assert.equal(view.identity.name, '测试道君');
  assert.equal(view.realms.length, 4);
  assert.equal(view.primaryStats.length, 3);
  assert.equal(view.secondaryStats.length, 6);
  assert.equal(view.extra.rows[0].status, '已超上限');
  assert.equal(view.extra.rows[2].status, '已达上限');
  assert.equal(view.equipment.slots[0].name, '测试剑');
  assert.equal(view.resistance.rows.some(item => item.label === '神通抗性'), true);
  assert.equal(view.wudao.costFactors.length, 3);
  assert.equal(view.dungeon.stages.length, 4);
  assert.equal(view.resources.expenses.length, 6);
  assert.doesNotMatch(JSON.stringify(view), /NaN|undefined/);
});

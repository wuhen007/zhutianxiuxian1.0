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
      huafenlevel_id: 1,
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
      huafen_list: [{ level_id: 1, level: '普通人', 基础攻击: 0, 基础防御: 0, 基础血量: 0 }],
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

test('花粉境界按对应权限提高额外属性上限', () => {
  assert.equal(calculateExtraAttributeLimit({
    level_id: 42,
    Physique_id: 41,
    mijinglevel_id: 1,
    xiangulevel_id: 1,
    huafenlevel_id: 10,
  }).secret, 165_000_000);
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
      武器: {
        name: '混合武器', atk: 1000, def: 2, HP: 3, bao: 0,
        归一属性: { 百分比: { atk: 0.5, def: 0.25, HP: 1 } },
      },
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
  assert.match(report.join('\n'), /武器【混合武器】攻\+50%\+1,000｜防\+25%\+2｜血\+100%\+3/);
});

test('属性报告将万象归一词条从普通百分比池单列', () => {
  const fixture = createViewFixture();
  fixture.equipment.武器 = {
    name: '大罗剑胎',
    atk: 1000,
    def: 2000,
    HP: 3000,
    归一来源: '百分比剑',
    归一属性: { 百分比: { atk: 0.5, def: 0.25, HP: 1 } },
  };

  const report = buildPlayerAttributeReport(fixture).join('\n');
  const view = buildPlayerAttributeView(fixture);

  assert.match(report, /万象归一词条合计：攻\+50%｜防\+25%｜血\+100%/);
  assert.match(view.equipment.fusion, /攻 \+50% · 防 \+25% · 血 \+100%/);
  assert.doesNotMatch(view.equipment.total, /\+50%/);
});

test('属性报告按单件500倍展示，普通与归一累计无总上限', () => {
  const fixture = createViewFixture();
  const percent = {
    name: '百分比装备', atk: 499, def: 499, HP: 499,
    归一属性: { 百分比: { atk: 100, def: 100, HP: 100 } },
  };
  fixture.equipment.武器 = percent;
  fixture.equipment.护具 = percent;

  let report = buildPlayerAttributeReport(fixture).join('\n');
  let view = buildPlayerAttributeView(fixture);
  assert.match(report, /普通装备词条合计：攻\+99800%/);
  assert.match(report, /武器【百分比装备】攻\+49900%｜防\+49900%｜血\+49900%/);
  assert.match(report, /单件每项最高\+49900%（含基础500倍）.*多件加算无总上限/);
  assert.match(view.equipment.total, /攻 \+99800%/);
  assert.equal(view.equipment.slots[0].primary, '攻击 +49900%');

  const fused = {
    name: '归一装备', atk: 1000, def: 2000, HP: 3000, 归一来源: '百分比装备',
    归一属性: { 百分比: { atk: 600, def: 600, HP: 600 } },
  };
  fixture.equipment.武器 = fused;
  fixture.equipment.护具 = fused;
  report = buildPlayerAttributeReport(fixture).join('\n');
  view = buildPlayerAttributeView(fixture);
  assert.match(report, /万象归一词条合计：攻\+99800%｜防\+99800%｜血\+99800%/);
  assert.match(report, /武器【归一装备】攻归一\+49900%\+1,000/);
  assert.match(view.equipment.fusion, /攻 \+99800%.*多件加算无总上限/);
  assert.equal(view.equipment.slots[0].primary, '攻击 归一 +49900% / +1,000');
  assert.doesNotMatch(report + view.equipment.fusion, /50000%|单项上限/);
});

test('属性报告按万道神炉状态展示普通与归一装备的同件溢出补偿', () => {
  const fixture = createViewFixture();
  fixture.equipment.武器 = {
    name: '溢出百分比剑', atk: 499, def: 10, HP: 20,
    归一属性: { 百分比: { atk: 50 } },
  };
  fixture.equipment.护具 = {
    name: '溢出归一甲', atk: 1000, def: 2000, HP: 3000, 归一来源: '百分比甲',
    归一属性: { 百分比: { atk: 599, def: 5, HP: 6 } },
  };
  const original = buildPlayerAttributeView(fixture);
  assert.equal(original.equipment.slots[0].secondary, '防御 +1000%');
  assert.equal(original.equipment.slots[1].secondary, '防御 归一 +500% / +2,000');

  fixture.player.当前先天至宝 = '万道神炉';
  const view = buildPlayerAttributeView(fixture);
  const report = buildPlayerAttributeReport(fixture).join('\n');
  assert.equal(view.equipment.slots[0].secondary, '防御 +6000%');
  assert.equal(view.equipment.slots[1].secondary, '防御 归一 +10500% / +2,000');
  assert.match(view.equipment.total, /防 \+6000%/);
  assert.match(view.equipment.fusion, /防 \+10500%/);
  assert.match(report, /武器【溢出百分比剑】攻\+49900%｜防\+6000%｜血\+2000%/);
  assert.match(report, /护具【溢出归一甲】攻归一\+49900%\+1,000｜防归一\+10500%\+2,000/);
  assert.equal(fixture.equipment.武器.def, 10);
  assert.equal(fixture.equipment.护具.归一属性.百分比.def, 5);
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

test('遁一境伴生秘境仍按仙古路线显示归元悟道', () => {
  const report = calculateWudaoCosts({
    mijinglevel_id: 7,
    xiangulevel_id: 14,
    灵根: {},
    学习的功法: [],
    仙古道途: { stages: {} },
  });

  assert.equal(report.available, true);
  assert.equal(report.rule.name, '归元');
  assert.equal(report.rule.nextRealm, '至尊境');
});

test('HTML属性视图完整输出真实分区与稀释状态', () => {
  const view = buildPlayerAttributeView(createViewFixture());
  assert.equal(view.identity.name, '测试道君');
  assert.equal(view.realms.length, 5);
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

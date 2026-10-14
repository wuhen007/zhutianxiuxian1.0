import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  getHighRealmBarrier,
  mergeHighRealmRaidResult,
  prepareHighRealmBattle,
  suppressHighRealmCombatant,
} from '../model/highRealmBarrier.js';
import { getGodDemonStealRule } from '../model/realmAuthority.js';
import { hasSupremeInnate } from '../model/supremePath.js';
import { create1v1BattleResult, createTeamBattleResult } from '../model/combat/BattleResult.js';
import * as suiyunPvp from '../model/suiyunPvp.js';

const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const raidSource = fs.readFileSync(new URL('../apps/Battle/tuanben.js', import.meta.url), 'utf8');

function fighter(level, route = 'mijing', extra = {}) {
  return {
    名号: `${route}-${level}`,
    [route === 'mijing' ? 'mijinglevel_id' : route === 'xiangu' ? 'xiangulevel_id' : 'huafenlevel_id']:
      route === 'mijing' ? level : level + 1,
    攻击: 1000, 防御: 1000, 当前血量: 1000, 血量上限: 1000, 速度: 1000,
    暴击率: 0.5, 暴击伤害: 2, 法球倍率: 2, 闪避率: 0.5,
    学习的功法: ['一气化三清', '皆字秘', '临字秘', '者字秘'],
    灵根: { name: '终极涅槃·至尊', type: '终极至尊体' },
    ...extra,
  };
}

function functionSource(name) {
  const text = source.match(new RegExp(`(?:export )?(?:async )?function ${name}\\([\\s\\S]*?\\n\\}`, 'm'))?.[0];
  assert.ok(text, `missing function: ${name}`);
  return text.replace(/^export /, '');
}

function runtime(overrides = {}) {
  const unexpected = () => { throw new Error('跨境裁决不应进入普通技能执行阶段'); };
  const bindings = {
    ...suiyunPvp,
    prepareHighRealmBattle, mergeHighRealmRaidResult, getHighRealmBarrier,
    create1v1BattleResult, createTeamBattleResult,
    zd_battle_1v1: unexpected,
    zd_battle_team: unexpected,
    applyForbiddenBattleModifiers: () => [],
    getInnateSpeedMultiplier: () => 1,
    settleWanhuaBannerHarvest: async () => null,
    applyNewTreasureDamageRules: (a, b, damage) => ({ damage, messages: [] }),
    ...overrides,
  };
  const names = [
    'zd_battle', 'settleHighRealmBattle', 'tb_battle', 'calcDamage',
    'getBattleUnitSpeed', 'normalizeBattleOrbMultiplier',
  ];
  return Function(...Object.keys(bindings),
    `${names.map(functionSource).join('\n')}\nreturn { ${names.join(',')} };`
  )(...Object.values(bindings));
}

for (const level of [20, 21, 22, 23]) {
  test(`权柄${level}对下一档的三条额外体系均为绝对壁垒`, () => {
    for (const highRoute of ['mijing', 'xiangu', 'huafen']) {
      for (const lowRoute of ['mijing', 'xiangu', 'huafen']) {
        const higher = fighter(level, highRoute, { 当前血量: 1, 攻击: 1, 防御: 0, 速度: 1 });
        const lower = fighter(level - 1, lowRoute, {
          攻击: 1e200, 防御: 1e200, 当前血量: 1e200, 血量上限: 1e200, 速度: 1e100,
        });
        const saved = structuredClone([higher, lower]);
        const opening = prepareHighRealmBattle(higher, lower);
        assert.equal(opening.ended, true);
        assert.equal(opening.teams[0][0].当前血量, 1);
        assert.equal(opening.teams[1][0].当前血量, 0);
        assert.equal(opening.teams[1][0].不可复活, true);
        assert.deepEqual([higher, lower], saved, '战斗压制与镇杀不污染存档');
      }
    }
  });
}

test('所有战斗属性压制九成且只应用一次，秘术与灵根技能一并封禁', () => {
  const unit = fighter(20, 'mijing', {
    元神: 1000, 元神上限: 2000, 神识: 500, 生命本源: 600,
    护盾值: 200, _护盾值: 200, 神通伤害加成: 3, 元神伤害减免: 0.5,
    吸血率: 0.5, 穿透: 1, 减伤比例: 0.9, 治疗效果加成: 2,
    灵石: 123456, 纪元积累: 200, 功法熟练度: { 皆字秘: 1000 },
    分身: [{ 当前血量: 1e200 }],
    皆字秘触发: true, _皆字秘倍率: 10, _临字秘加成倍率: 9,
    学习的功法: { 一气化三清: {}, 皆字秘: {}, 临字秘: {}, 者字秘: {} },
  });
  const original = structuredClone(unit);
  suppressHighRealmCombatant(unit);
  for (const field of [
    '攻击', '防御', '血量上限', '当前血量', '速度', '暴击率', '暴击伤害', '法球倍率',
    '闪避率', '元神', '元神上限', '神识', '生命本源', '护盾值', '_护盾值',
    '神通伤害加成', '元神伤害减免', '吸血率', '穿透', '减伤比例', '治疗效果加成',
  ]) assert.ok(Math.abs(unit[field] - original[field] * 0.1) < 1e-10, field);
  assert.deepEqual(unit.学习的功法, ['者字秘']);
  assert.equal(unit.皆字秘触发, false);
  assert.equal(unit._临字秘加成倍率, undefined);
  assert.equal(hasSupremeInnate(unit, '终极涅槃·至尊'), false);
  assert.deepEqual(unit.分身, []);
  assert.equal(unit.灵石, original.灵石);
  assert.equal(unit.纪元积累, original.纪元积累);
  assert.deepEqual(unit.功法熟练度, original.功法熟练度);
  const once = structuredClone(unit);
  suppressHighRealmCombatant(unit);
  assert.deepEqual(unit, once);
  const { getBattleUnitSpeed } = runtime();
  assert.equal(getBattleUnitSpeed(unit), getBattleUnitSpeed(original) / 10);
});

test('同档跨体系、准仙帝以下和未标注额外境界的目标保留普通战斗', () => {
  for (const level of [20, 21, 22, 23]) {
    assert.equal(prepareHighRealmBattle(fighter(level), fighter(level, 'xiangu')), null);
    assert.equal(prepareHighRealmBattle(fighter(level, 'xiangu'), fighter(level, 'huafen')), null);
  }
  assert.equal(prepareHighRealmBattle(fighter(19), fighter(18)), null);
  assert.equal(prepareHighRealmBattle(fighter(23), { 名号: '未定级目标', 当前血量: 1000 }), null);
  assert.equal(prepareHighRealmBattle(fighter(23, 'mijing', { 当前血量: 0 }), fighter(20)), null);
});

test('先由最高道果镇杀，已倒下的敌人不再伤及高境者队友', () => {
  const opening = prepareHighRealmBattle([fighter(20), fighter(22)], [fighter(21)]);
  assert.equal(opening.teams[0][0].当前血量, 1000);
  assert.equal(opening.teams[0][1].当前血量, 1000);
  assert.equal(opening.teams[1][0].当前血量, 0);
});

test('双方同档强者继续交锋，低境队员退出技能和复活执行阶段', () => {
  const opening = prepareHighRealmBattle(
    [fighter(20), fighter(22)], [fighter(22, 'huafen'), fighter(21)]
  );
  assert.equal(opening.ended, false);
  assert.deepEqual(opening.aliveIndices, [[1], [0]]);
  assert.equal(prepareHighRealmBattle(...opening.survivors), null, '续战最多一层，不重复镇杀');
});

test('普通单挑入口优先结算壁垒，面板、先手、反伤、神胎与复活均不翻转胜负', async () => {
  const low = fighter(20, 'mijing', {
    攻击: 1e200, 当前血量: 1e200, 血量上限: 1e200, 速度: 1e200,
    首次闪避: true, 法力免疫: true, 护盾值: 1e200, _反弹比例: 100,
    己道推演: { divineEmbryo: '已结出', halfImmortalEmperor: true },
    _阴阳逆转护命: true, 当前先天至宝: '诛仙四剑',
    学习的功法: ['一气化三清', '皆字秘', '临字秘', '者字秘', '涅槃仙功', '圆神'],
    灵根: { name: '圆神' },
  });
  const high = fighter(21, 'huafen', { 当前血量: 1, 血量上限: 1, 攻击: 1, 速度: 1 });
  const battle = runtime().zd_battle;
  const forward = await battle(low, high, { maxRound: 1, preserveHpOnTimeout: true });
  assert.equal(forward.winner, 'B');
  assert.equal(forward.A_hp, 0);
  assert.equal(forward.B_hp, 1);
  assert.equal(forward.A_revived, false);
  assert.deepEqual(forward.proficiencyGains, {});
  const reverse = await battle(high, low);
  assert.equal(reverse.winner, 'A');
  assert.equal(reverse.A_hp, 1);
  assert.equal(reverse.B_hp, 0);
  assert.equal(reverse.totalDamageTaken, 1e200);
  assert.match(reverse.msg.join('\n'), /90%/);
  assert.match(reverse.msg.join('\n'), /境界天堑/);
});

test('团队续战保留原队伍索引、死亡队长、存档来源及镇杀炼魂结算', async () => {
  const teamA = [fighter(20, 'mijing', { 名号: 'A队长' }), fighter(22, 'mijing', { 名号: 'A强者' })];
  const teamB = [fighter(22, 'huafen', { 名号: 'B强者' }), fighter(21, 'mijing', { 名号: 'B队员' })];
  const harvests = [];
  let normalCalls = 0;
  const battle = runtime({
    zd_battle_team: async (A_team, B_team, options) => {
      normalCalls++;
      assert.equal(A_team.length, 1);
      assert.equal(B_team.length, 1);
      assert.equal(options._sourceATeam[0], teamA[1]);
      assert.equal(options._sourceBTeam[0], teamB[0]);
      A_team[0].当前血量 = 7;
      B_team[0].当前血量 = 0;
      return { ...createTeamBattleResult({ msg: ['同档交锋'], A_team, B_team }), proficiencyGains: { A: {} } };
    },
    settleWanhuaBannerHarvest: async (owner, target) => { harvests.push([owner.名号, target.名号]); },
  }).zd_battle;
  const result = await battle(teamA, teamB);
  assert.equal(normalCalls, 1);
  assert.equal(result.winner, 'A');
  assert.equal(result.A_hp, 7);
  assert.equal(result.A_team[0].名号, 'A队长');
  assert.equal(result.A_team[0].当前血量, 0);
  assert.equal(result.A_team[1].当前血量, 7);
  assert.equal(result.B_team[1].当前血量, 0);
  assert.deepEqual(harvests, [['A队长', 'B队员'], ['A强者', 'B队员']]);
  assert.deepEqual(result.proficiencyGains, { A: {} });
  assert.deepEqual(teamA.map(p => p.当前血量), [1000, 1000]);
});

test('全队低境时返回标准团战败局且高境一方无损', async () => {
  const result = await runtime().zd_battle([fighter(20), fighter(19)], [fighter(21)]);
  assert.equal(result.winner, 'B');
  assert.equal(result.A_alive_count, 0);
  assert.equal(result.B_alive_count, 1);
  assert.deepEqual(result.A_team.map(p => p.当前血量), [0, 0]);
  assert.equal(result.B_hp, 1000);
});

test('共享伤害入口先于闪避、免伤与巨额真伤处理境界差', () => {
  const { calcDamage } = runtime();
  const low = fighter(20, 'xiangu');
  const high = fighter(21, 'huafen');
  assert.equal(calcDamage(low, high, 1e300, '元神', true, true).actual_damage, 0);
  low.首次闪避 = true;
  low.全类型减免 = 1;
  assert.equal(calcDamage(high, low, 1).actual_damage, 1000);
  assert.equal(calcDamage(high, fighter(21, 'mijing', { 闪避率: 0 }), 123).actual_damage, 123);
});

test('终焉神魔体叠满九秘也不跨越准仙帝及以上道果', () => {
  for (const level of [20, 21, 22, 23]) {
    const rule = getGodDemonStealRule(
      fighter(level - 1, 'mijing', { 皆字秘触发: true, _临字秘加成倍率: 9 }),
      fighter(level, 'huafen')
    );
    assert.equal(rule.allowed, false);
    assert.equal(rule.chance, 0);
  }
});

test('共享团本入口保持玩家血量变化顺序且不触发普通Boss技能', async () => {
  const { tb_battle } = runtime();
  const loss = await tb_battle([fighter(20), fighter(19)], fighter(21));
  assert.equal(loss.result, 'BOSS胜利');
  assert.deepEqual(loss.players_hp_change, [-1000, -1000]);
  assert.equal(loss.boss_hp_change, 0);
  const win = await tb_battle([fighter(22)], fighter(21));
  assert.equal(win.result, '玩家胜利');
  assert.deepEqual(win.players_hp_change, [0]);
  assert.equal(win.boss_hp_change, -1000);
});

test('混合境界团本续战正确映射每位玩家的真实损伤', () => {
  const opening = prepareHighRealmBattle([fighter(20), fighter(21), fighter(19)], fighter(21, 'xiangu'));
  const result = mergeHighRealmRaidResult(opening, {
    msg: ['同境交锋'], players_hp_change: [-20], boss_hp_change: -1000,
    result: '玩家胜利', proficiencyGains: { player: { 技能: 1 } },
  });
  assert.deepEqual(result.players_hp_change, [-1000, -20, -1000]);
  assert.equal(result.boss_hp_change, -1000);
  assert.equal(result.result, '玩家胜利');
  assert.deepEqual(result.proficiencyGains, { player: { 技能: 1 } });
});

test('独立讨伐团本在图文开场前使用同一裁决并保持返回契约', async () => {
  const start = raidSource.indexOf('async tb_battle(players, boss, e)');
  const end = raidSource.indexOf('// 辅助方法：检查玩家状态', start);
  assert.ok(start > 0 && end > start);
  const raid = Function('prepareHighRealmBattle', 'mergeHighRealmRaidResult',
    `return { ${raidSource.slice(start, end)} };`
  )(prepareHighRealmBattle, mergeHighRealmRaidResult);
  const messages = [];
  raid.sendBattleImages = async (e, lines) => messages.push(...lines);
  const result = await raid.tb_battle([fighter(20)], fighter(21), {});
  assert.equal(result.result, 'BOSS胜利');
  assert.deepEqual(result.players_hp_change, [-1000]);
  assert.deepEqual(result.msg, [], '日志已发送，沿用原团本的空消息返回');
  assert.match(messages.join('\n'), /境界天堑/);
});

test('旧的秘境单路线五成削弱与概率冻结已被统一境界规则替代', () => {
  assert.doesNotMatch(source, /attacker\.mijinglevel_id > 19 && defender\.mijinglevel_id < 20/);
});

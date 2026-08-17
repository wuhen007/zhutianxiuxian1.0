import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignDisciple,
  ensureSectDisciples,
  getDiscipleAffinity,
  getDiscipleCapacity,
  parseAssignDiscipleCommand,
  parseTrainDiscipleCommand,
  recruitDisciple,
  settleSectOperations,
  trainDisciple,
} from '../model/sectDisciples.js';

const talent = [{ id: 70028, name: '金灵根', type: '真灵根' }];

function association() {
  return { 宗门名称: '测试宗', 宗门等级: 1, 灵石池: 100000 };
}

test('旧宗门首次使用时补齐弟子与运营字段', () => {
  const ass = association();
  ensureSectDisciples(ass);
  assert.equal(getDiscipleCapacity(ass), 3);
  assert.deepEqual(ass.宗门仓库, { 药材: 0, 丹药: 0, 法器: 0 });
  assert.equal(ass.宗门弟子.length, 0);
});

test('招募、培养、任命形成弟子管理闭环', () => {
  const ass = association();
  const recruited = recruitDisciple(ass, { talentList: talent, random: () => 0, now: 123 });
  assert.equal(recruited.ok, true);
  assert.equal(recruited.disciple.灵根.name, '金灵根');
  assert.equal(ass.宗门弟子[0].id, 1);

  const trained = trainDisciple(ass, 1);
  assert.equal(trained.ok, true);
  assert.equal(ass.宗门弟子[0].培养等级, 1);
  assert.equal(assignDisciple(ass, 1, '外务').ok, true);
  assert.equal(ass.宗门弟子[0].状态, '任职');
});

test('灵根与专长存在可读的契合加成', () => {
  assert.equal(getDiscipleAffinity({ name: '木灵根' }, '采药'), 1.25);
  assert.equal(getDiscipleAffinity({ name: '金灵根' }, '采药'), 1);

  const ass = association();
  recruitDisciple(ass, { talentList: talent, random: () => 0 });
  assignDisciple(ass, 1, '炼器');
  assert.equal(ass.宗门弟子[0].灵根契合度, 1.25);
});

test('培养与任命命令可解析连续或空格分隔的参数', () => {
  assert.equal(parseTrainDiscipleCommand('#培养宗门弟子1'), '1');
  assert.equal(parseTrainDiscipleCommand('#培养宗门弟子 12'), '12');
  assert.deepEqual(parseAssignDiscipleCommand('#任命宗门弟子1炼丹'), { id: '1', specialty: '炼丹' });
  assert.deepEqual(parseAssignDiscipleCommand('#任命宗门弟子 12 炼器'), { id: '12', specialty: '炼器' });
});

test('运营结算扣除维护并按专长产出', () => {
  const ass = association();
  recruitDisciple(ass, { talentList: talent, random: () => 0 });
  assignDisciple(ass, 1, '外务');
  ass.宗门运营.上次结算 = 0;
  const result = settleSectOperations(ass, 24 * 60 * 60 * 1000);
  assert.equal(result.ok, true);
  assert.equal(result.days, 1);
  assert.equal(result.produced.灵石, 3000);
  assert.equal(ass.灵石池, 101500);
});

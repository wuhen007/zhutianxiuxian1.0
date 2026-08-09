import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assignDisciple,
  ensureSectDisciples,
  getDiscipleAffinity,
  getDiscipleCapacity,
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

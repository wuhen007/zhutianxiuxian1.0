import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  getOwnWaySkillListType,
  validateOwnWaySkillDescription,
} from '../model/ownWaySkill.js';

const source = fs.readFileSync(new URL('../apps/User/daofa.js', import.meta.url), 'utf8');

test('自身之道技能按效果同步至技能列表1至3', () => {
  assert.equal(getOwnWaySkillListType('攻伐'), 1);
  assert.equal(getOwnWaySkillListType('时空'), 1);
  assert.equal(getOwnWaySkillListType('护体'), 2);
  assert.equal(getOwnWaySkillListType('涅槃'), 3);
  assert.equal(getOwnWaySkillListType('轮回'), 3);
});

test('自身之道描述限单行20字并由编辑指令触发技能补录', () => {
  assert.equal(validateOwnWaySkillDescription('一念花开君临天下').ok, true);
  assert.equal(validateOwnWaySkillDescription('道'.repeat(20)).ok, true);
  assert.equal(validateOwnWaySkillDescription('道'.repeat(21)).reason, 'too-long');
  assert.equal(validateOwnWaySkillDescription('两行\n描述').reason, 'multiline');
  assert.match(source, /编辑\|修改/);
  assert.match(source, /syncOwnWaySkillRecord/);
  assert.match(source, /saveCustomSkill\(skill, listType\)/);
});

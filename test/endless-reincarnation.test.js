import assert from 'node:assert/strict';
import test from 'node:test';
import {
  REINCARNATION_ATTRIBUTE_GROUPS,
  REINCARNATION_BRANCH_GRADES,
  applyReincarnationSettlement,
  chooseReincarnationOption,
  createReincarnationRun,
  getReincarnationContent,
  getReincarnationMetaView,
  getReincarnationRunView,
  getReincarnationScene,
  purchaseReincarnationExchange,
} from '../model/endlessReincarnation.js';

function player() {
  return { 名号: '测试轮回者' };
}

test('固定种子会生成相同职业与三名不同NPC', () => {
  const first = createReincarnationRun({ userId: '10001', player: player(), seed: 20260807 });
  const second = createReincarnationRun({ userId: '10001', player: player(), seed: 20260807 });
  assert.equal(first.profession.id, second.profession.id);
  assert.deepEqual(first.npcs.map(npc => npc.id), second.npcs.map(npc => npc.id));
  assert.deepEqual(
    Object.values(first.encounters).map(monster => monster.id),
    Object.values(second.encounters).map(monster => monster.id)
  );
  assert.equal(new Set(first.npcs.map(npc => npc.id)).size, 3);
});

test('每个剧情场景会生成可参与检定的随机异常体', () => {
  const run = createReincarnationRun({ userId: '10001', player: player(), seed: 27 });
  const view = getReincarnationRunView(run);
  assert.ok(view.encounter);
  assert.ok(view.encounter.name);
  assert.ok(view.encounter.mechanic);
  assert.ok(view.encounter.weakness);
  assert.ok(view.scene.choices[0].checkText.includes(`${view.encounter.name}干扰`));
  assert.ok(view.scene.choices[0].checkText.includes(`难度${14 + view.encounter.difficulty}`));
});

test('剧情判定失败会触发怪物技能并造成实际伤害', () => {
  const run = createReincarnationRun({ userId: '10001', player: player(), seed: 31 });
  for (const attribute of Object.keys(run.attributes)) run.attributes[attribute] = 1;
  run.profession.specialties = [];
  for (const npc of run.npcs) npc.specialties = [];
  const hp = run.hp;
  const encounter = getReincarnationRunView(run).encounter;
  chooseReincarnationOption(run, 1);
  assert.equal(run.lastOutcome.success, false);
  assert.equal(run.lastOutcome.encounter.name, encounter.name);
  assert.equal(run.lastOutcome.encounter.skill, encounter.skill);
  assert.ok(run.hp <= hp - encounter.attack);
  assert.equal(run.encounterLog.length, 1);
});

test('命中怪物弱点会完成击破并在结算时获得奖励', () => {
  const run = createReincarnationRun({ userId: '10001', player: player(), seed: 44 });
  for (const attribute of Object.keys(run.attributes)) run.attributes[attribute] = 50;
  const encounter = run.encounters.awakening;
  encounter.weaknessSpecialties = ['医疗'];
  run.profession.specialties = ['医疗'];
  chooseReincarnationOption(run, 1);
  assert.equal(encounter.status, 'defeated');
  assert.ok(run.defeatedMonsters.includes(encounter.id));

  for (const choice of [1, 3, 1, 1, 3, 3]) {
    const result = chooseReincarnationOption(run, choice);
    if (result.ended) break;
  }
  assert.ok(run.settlement.monsterBonus >= 120);
  assert.ok(run.settlement.defeatedMonsters.includes(encounter.id));
});

test('四维属性完整覆盖十二项基础能力', () => {
  const run = createReincarnationRun({ userId: '10001', player: player(), seed: 1 });
  const names = Object.values(REINCARNATION_ATTRIBUTE_GROUPS).flat();
  assert.equal(names.length, 12);
  assert.equal(new Set(names).size, 12);
  assert.deepEqual(Object.keys(run.attributes).sort(), [...names].sort());
  assert.equal(getReincarnationRunView(run).attributeGroups.length, 4);
});

test('最优世界线可以抵达SSS真结局并唤醒一阶基因锁', () => {
  const run = createReincarnationRun({ userId: '10001', player: player(), seed: 42 });
  for (const attribute of Object.keys(run.attributes)) run.attributes[attribute] = 50;
  const choices = [2, 1, 3, 1, 1, 3, 3];
  for (const choice of choices) {
    const result = chooseReincarnationOption(run, choice);
    if (result.ended) break;
  }
  assert.equal(run.phase, 'ending');
  assert.equal(run.ending.id, 'true');
  assert.equal(run.settlement.evaluation, 'SSS');
  assert.equal(run.settlement.geneLockAwakened, true);
  assert.equal(run.settlement.geneLockStage, 1);
  assert.ok(run.settlement.rights.SSS >= 1);
  assert.ok(run.settlement.points > 9000);
});

test('剧情选项会改变生命、压力、NPC关系与可见分支', () => {
  const run = createReincarnationRun({ userId: '10001', player: player(), seed: 9 });
  const beforeTrust = run.npcs.map(npc => npc.trust);
  chooseReincarnationOption(run, 3);
  assert.ok(run.hp <= run.maxHp);
  assert.ok(run.stress > 8);
  assert.notDeepEqual(run.npcs.map(npc => npc.trust), beforeTrust);
  assert.equal(getReincarnationScene(run).id, 'rule_test');
});

test('结算只在剧情完成后写入永久轮回档案', () => {
  const account = player();
  const run = createReincarnationRun({ userId: '10001', player: account, seed: 42 });
  for (const attribute of Object.keys(run.attributes)) run.attributes[attribute] = 50;
  for (const choice of [2, 1, 3, 1, 1, 3, 3]) {
    const result = chooseReincarnationOption(run, choice);
    if (result.ended) break;
  }
  assert.equal(account.无尽轮回.points, 0);
  const meta = applyReincarnationSettlement(account, run.settlement);
  assert.equal(meta.points, run.settlement.points);
  assert.equal(meta.geneLock.stage, 1);
  assert.equal(meta.completedWorlds, 1);
  assert.equal(meta.highestEvaluation, 'SSS');
});

test('中枢兑换消耗轮回点和对应支线权限并永久增加属性', () => {
  const account = player();
  const meta = getReincarnationMetaView(account).meta;
  meta.points = 10_000;
  meta.branchRights.B = 1;
  account.无尽轮回 = meta;
  const result = purchaseReincarnationExchange(account, '神经加速训练');
  assert.equal(result.price, 2600);
  assert.equal(account.无尽轮回.points, 7400);
  assert.equal(account.无尽轮回.branchRights.B, 0);
  assert.equal(getReincarnationMetaView(account).bonuses.神经反射, 2);
  assert.throws(() => purchaseReincarnationExchange(account, '神经加速训练'), /B级支线权限/);
});

test('首版内容包含八职业、二十名NPC、十四种怪物和完整支线等级', () => {
  const content = getReincarnationContent();
  assert.equal(content.professions.length, 8);
  assert.equal(content.npcs.length, 20);
  assert.equal(content.monsters.length, 14);
  assert.equal(Object.keys(content.scenes).length, 7);
  assert.equal(content.exchanges.length, 12);
  assert.deepEqual(REINCARNATION_BRANCH_GRADES, ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);
});

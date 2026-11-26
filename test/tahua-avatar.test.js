import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../model/xiuxian.js", import.meta.url),
  "utf8"
);

const functionSource = source.match(
  /export function createTahuaAvatarEntity\([\s\S]*?\n\}/
)?.[0];
assert.ok(functionSource, "未找到 createTahuaAvatarEntity");
const createTahuaAvatarEntity = Function(
  `${functionSource.replace("export ", "")}; return createTahuaAvatarEntity;`
)();

const caster = {
  名号: "施术者",
  攻击: 100,
  防御: 80,
  速度: 170,
  当前血量: 60,
  血量上限: 200,
  学习的功法: ["【仙帝】他化自在法", "一气化三清", "皆字秘"],
  分身: [{ 名号: "旧分身" }],
};
const opponent = {
  名号: "敌手",
  攻击: 360,
  防御: 240,
  速度: 310,
  当前血量: 90,
  血量上限: 500,
  学习的功法: ["敌方剑诀", "皆字秘"],
  分身: [{ 名号: "敌方旧分身" }],
};

test("映照自己保留100%全属性和完整功法，并可独立施法", () => {
  const entity = createTahuaAvatarEntity(
    caster,
    opponent,
    { id: "mirror_self", name: "己之映照" },
    3,
    "A"
  );

  assert.equal(entity.攻击, caster.攻击);
  assert.equal(entity.防御, caster.防御);
  assert.equal(entity.速度, caster.速度);
  assert.equal(entity.血量上限, caster.血量上限);
  assert.equal(entity.当前血量, caster.血量上限);
  assert.deepEqual(entity.学习的功法, caster.学习的功法);
  assert.equal(entity.avatarSkill, null);
  assert.equal(entity._tahua_can_use_gongfa, true);
  assert.equal(entity._tahua_can_summon_dao_body, true);
  assert.equal(entity._tahua_duration, 3);
  assert.deepEqual(entity.分身, []);
});

test("映照敌人复制敌方100%全属性与敌方技能，而非施术者数据", () => {
  const entity = createTahuaAvatarEntity(
    caster,
    opponent,
    { id: "mirror_enemy", name: "敌之映照" },
    2,
    "A"
  );

  assert.equal(entity.攻击, opponent.攻击);
  assert.equal(entity.防御, opponent.防御);
  assert.equal(entity.速度, opponent.速度);
  assert.equal(entity.血量上限, opponent.血量上限);
  assert.deepEqual(entity.学习的功法, opponent.学习的功法);
  assert.notDeepEqual(entity.学习的功法, caster.学习的功法);
  assert.equal(entity.avatarSkill, null);
});

test("时间长河强者作为常驻助战单位持续参战", () => {
  const avatar = {
    id: "huangtiandi",
    name: "荒天帝",
    skill: "他化自在大法·起源一击",
    beilv: 15,
    special: "不可防御",
  };
  const entity = createTahuaAvatarEntity(caster, opponent, avatar, 1, "A");

  assert.equal(entity._tahua_duration, -1);
  assert.deepEqual(entity.avatarSkill, avatar);
  assert.equal(entity._tahua_can_use_gongfa, false);
  assert.equal(entity.攻击, caster.攻击);
});

test("他化自在战斗链支持功法、派生道身与挡刀", () => {
  const summonStart = source.indexOf(
    "// ==================== 他化自在法·行者化身召唤"
  );
  const summonEnd = source.indexOf("// 主要攻击", summonStart);
  const summonBlock = source.slice(summonStart, summonEnd);

  assert.match(source, /trySummonTahuaDaoBodies\(entity, entities\)/);
  assert.match(source, /tryJieziMijue\(entity, msg\)/);
  assert.match(source, /applyDamage\(target, entityDmg, 'tahua', entity\)/);
  assert.match(source, /他化自在身抵挡伤害/);
  assert.match(source, /时间长河中的强者将并肩战至终局/);
  assert.doesNotMatch(summonBlock, /avatarDmg/);
});

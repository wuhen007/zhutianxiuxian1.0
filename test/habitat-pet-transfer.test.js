import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createHabitatPetData,
  removeInventoryPetAt,
  restoreHabitatPetToInventory,
} from '../apps/Pokemon/habitatPetTransfer.js';

const petList = JSON.parse(
  fs.readFileSync(new URL('../resources/data/item/仙宠列表.json', import.meta.url), 'utf8')
);

const wildPetNames = [
  '赤瞳灵狐',
  '青鳞幼蛟',
  '金翅大鹏雏',
  '九尾仙猫',
  '玄甲龙龟',
  '紫电雷貂',
  '冰晶雪猿',
  '噬金仙蚁',
  '幻影灵蝶',
  '三足金乌雏',
  '碧水麒麟崽',
  '幽冥玄虎',
  '天音仙鹤',
  '噬灵古藤',
  '炎阳火凤雏',
];

test('野外仙宠池中的名称全部存在于基础仙宠表', () => {
  const wildPets = petList.filter(pet => pet.来源 === '小世界野外');
  assert.equal(wildPets.length, wildPetNames.length);
  const configuredNames = new Set(wildPets.map(pet => pet.name));
  for (const name of wildPetNames) assert.ok(configuredNames.has(name), name);
});

test('安置仙宠会保存完整纳戒快照并只扣除选中的一只', () => {
  const inventoryPet = {
    id: 9988,
    name: '赤瞳灵狐',
    class: '仙宠',
    type: '战斗',
    品级: '仙灵',
    等级: 35,
    等级上限: 100,
    atk: 7,
    def: 5,
    HP: 9,
    初始加成: 0.005,
    每级增加: 0.001,
    加成: 0.035,
    特性: ['神速', '聪慧'],
    数量: 2,
  };
  const najie = { 仙宠: [inventoryPet] };

  const habitatPet = createHabitatPetData(inventoryPet, '2026-07-26 12:00:00');
  assert.equal(habitatPet.纳戒数据.id, 9988);
  assert.equal(habitatPet.纳戒数据.数量, 1);
  assert.deepEqual(habitatPet.特性, ['神速', '聪慧']);

  assert.equal(removeInventoryPetAt(najie, 0), true);
  assert.equal(najie.仙宠[0].数量, 1);
});

test('召回新数据仙宠会恢复原始实例属性', () => {
  const source = {
    id: 7711,
    name: '九尾仙猫',
    class: '仙宠',
    type: '炼丹',
    品级: '仙道',
    等级: 26,
    等级上限: 80,
    atk: 4,
    def: 6,
    HP: 8,
    初始加成: 0.005,
    每级增加: 0.001,
    加成: 0.026,
    特性: ['火灵'],
    数量: 1,
  };
  const habitatPet = createHabitatPetData(source);
  const najie = { 仙宠: [] };

  const result = restoreHabitatPetToInventory(najie, habitatPet, petList);
  assert.equal(result.ok, true);
  assert.equal(najie.仙宠.length, 1);
  assert.equal(najie.仙宠[0].id, 7711);
  assert.equal(najie.仙宠[0].type, '炼丹');
  assert.equal(najie.仙宠[0].品级, '仙道');
  assert.deepEqual(najie.仙宠[0].特性, ['火灵']);
});

test('旧版野外仙宠可由基础表重建且保留动态品质和特性', () => {
  const habitatPet = {
    name: '炎阳火凤雏',
    type: '战斗',
    品级: '仙灵',
    等级: 12,
    特性: ['强韧', '神速'],
  };
  const najie = {
    仙宠: [{
      ...petList.find(pet => pet.name === habitatPet.name),
      type: '炼丹',
      品级: '仙胎',
      等级: 12,
      特性: [],
      数量: 1,
    }],
  };

  const result = restoreHabitatPetToInventory(najie, habitatPet, petList);
  assert.equal(result.ok, true);
  assert.equal(result.merged, false);
  assert.equal(najie.仙宠.length, 2);
  assert.equal(najie.仙宠[1].type, '战斗');
  assert.equal(najie.仙宠[1].品级, '仙灵');
  assert.equal(najie.仙宠[1].等级上限, 100);
  assert.deepEqual(najie.仙宠[1].特性, ['强韧', '神速']);
});

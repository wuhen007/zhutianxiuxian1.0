import { isDeepStrictEqual } from 'node:util';

const QUALITY_LEVEL_CAPS = {
  仙胎: 20,
  仙仔: 40,
  仙兽: 60,
  仙道: 80,
  仙灵: 100,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeTraits(traits) {
  return Array.isArray(traits) ? [...traits] : [];
}

function samePetVariant(left, right) {
  const normalize = pet => {
    const value = clone(pet || {});
    delete value.数量;
    return value;
  };
  return isDeepStrictEqual(normalize(left), normalize(right));
}

export function addInventoryPetVariant(najie, pet) {
  if (!najie || !pet?.name) return { ok: false, reason: '仙宠数据不完整' };
  if (!Array.isArray(najie.仙宠)) najie.仙宠 = [];

  const inventoryPet = clone(pet);
  inventoryPet.数量 = 1;
  inventoryPet.islockd = Number(pet.islockd) || 0;
  const existingPet = najie.仙宠.find(item => samePetVariant(item, inventoryPet));
  if (existingPet) {
    existingPet.数量 = Math.max(0, Number(existingPet.数量) || 0) + 1;
    return { ok: true, merged: true, pet: existingPet };
  }

  najie.仙宠.push(inventoryPet);
  return { ok: true, merged: false, pet: inventoryPet };
}

export function createHabitatPetData(inventoryPet, settledAt = new Date().toLocaleString()) {
  const snapshot = clone(inventoryPet);
  snapshot.数量 = 1;
  snapshot.islockd = Number(inventoryPet.islockd) || 0;
  const smallWorldState = inventoryPet.小世界状态 || {};
  delete snapshot.小世界状态;
  const maxEnergy = Math.max(1, Number(smallWorldState.最大精力) || 100);
  const energy = Math.max(0, Math.min(maxEnergy, Number(smallWorldState.精力 ?? maxEnergy)));

  return {
    name: inventoryPet.name,
    type: inventoryPet.type,
    品级: inventoryPet.品级,
    等级: inventoryPet.等级 || 1,
    等级上限: inventoryPet.等级上限,
    精力: energy,
    最大精力: maxEnergy,
    工坊: null,
    特性: normalizeTraits(inventoryPet.特性),
    累倒: smallWorldState.累倒 === true,
    累倒_counter: Math.max(0, Number(smallWorldState.累倒_counter) || 0),
    守卫: false,
    安置时间: settledAt,
    产出累积: {},
    纳戒数据: snapshot,
  };
}

export function removeInventoryPetAt(najie, petIndex) {
  if (!Array.isArray(najie?.仙宠) || petIndex < 0 || petIndex >= najie.仙宠.length) {
    return false;
  }

  const pet = najie.仙宠[petIndex];
  const quantity = Math.max(1, Number(pet.数量) || 1);
  if (quantity > 1) {
    pet.数量 = quantity - 1;
  } else {
    najie.仙宠.splice(petIndex, 1);
  }
  return true;
}

export function findHabitatPetIndex(habitat, selector, codeOffset = 1001) {
  if (!Array.isArray(habitat)) return -1;
  const query = String(selector || '').trim();
  const number = Number.parseInt(query, 10);
  if (/^\d+$/.test(query) && number >= codeOffset) {
    const index = number - codeOffset;
    return index >= 0 && index < habitat.length ? index : -1;
  }
  return habitat.findIndex(pet => pet?.name === query);
}

export function restoreHabitatPetToInventory(najie, habitatPet, basePets = []) {
  if (!najie || !habitatPet?.name) return { ok: false, reason: '仙宠数据不完整' };
  if (!Array.isArray(najie.仙宠)) najie.仙宠 = [];

  const snapshot = habitatPet.纳戒数据 ? clone(habitatPet.纳戒数据) : null;
  const basePet = basePets.find(item => item.name === habitatPet.name);
  const template = snapshot || (basePet ? clone(basePet) : null);
  if (!template) return { ok: false, reason: `基础仙宠表中找不到【${habitatPet.name}】` };

  const level = Math.max(1, Number(habitatPet.等级) || Number(template.等级) || 1);
  const quality = habitatPet.品级 || template.品级 || '仙胎';
  const restoredPet = {
    ...template,
    name: habitatPet.name,
    class: '仙宠',
    type: habitatPet.type || template.type,
    品级: quality,
    等级: level,
    等级上限: Math.max(
      Number(template.等级上限) || 0,
      QUALITY_LEVEL_CAPS[quality] || 20
    ),
    特性: normalizeTraits(habitatPet.特性 ?? template.特性),
    数量: 1,
    islockd: Number(snapshot?.islockd ?? template.islockd) || 0,
    小世界状态: {
      精力: Math.max(0, Math.min(Number(habitatPet.最大精力) || 100, Number(habitatPet.精力 ?? 100))),
      最大精力: Math.max(1, Number(habitatPet.最大精力) || 100),
      累倒: habitatPet.累倒 === true,
      累倒_counter: Math.max(0, Number(habitatPet.累倒_counter) || 0),
    },
  };

  if (!snapshot) {
    restoredPet.加成 = level * (Number(restoredPet.每级增加) || 0.001);
  }

  return addInventoryPetVariant(najie, restoredPet);
}

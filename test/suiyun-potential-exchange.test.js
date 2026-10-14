import test from 'node:test';
import assert from 'node:assert/strict';
import { convertSuiyunPotential, createSuiyunRoot, hasSuiyunSkills, getSuiyunEffects, SUIYUN_EXCLUSIVE_SKILLS } from '../model/suiyun.js';

test('100月华兑换1潜力，多批次与已有小数潜力兼容，不触碰其他资源', () => {
  const p = { 灵根: createSuiyunRoot(1), 月华值: 25000, 仙道潜力: 3.9, 岁云之力: 10, 岁云: { 累计炼化月华: 800 } };
  assert.deepEqual(convertSuiyunPotential(p, 20000), { ok: true, spent: 20000, potentialGain: 200, gain: 200 });
  assert.equal(p.仙道潜力, 203.9);
  assert.equal(p.月华值, 5000);
  assert.equal(p.岁云之力, 10);
  assert.deepEqual(p.岁云, { 累计炼化月华: 800 });
  assert.equal(convertSuiyunPotential(p).spent, 100);
  assert.equal(p.仙道潜力, 204.9);
});

test('兑换失败完全不修改存档，余额、倍数与安全整数边界校验', () => {
  for (const [extra, amount] of [
    [{}, 0], [{}, -100], [{}, 99], [{}, 100.5], [{}, Infinity], [{}, NaN],
    [{}, 200], [{ 月华值: NaN }, 100], [{ 月华值: Infinity }, 100],
    [{ 仙道潜力: -1 }, 100], [{ 仙道潜力: Number.MAX_SAFE_INTEGER }, 100],
    [{ 灵根: { name: '凡体' } }, 100],
  ]) {
    const p = { 灵根: createSuiyunRoot(1), 月华值: 100, ...extra };
    const before = structuredClone(p);
    assert.equal(convertSuiyunPotential(p, amount).ok, false);
    assert.deepEqual(p, before);
  }
});

test('受赠资格校验本人身份与完整三技，只有技能不获得任何灵根特权', () => {
  const gift = { 授予者: 'teacher', 受赐者: 'student', 名额: 1, 传授时间: 1, 技能: [...SUIYUN_EXCLUSIVE_SKILLS] };
  const player = { id: 'student', 灵根: { name: '凡体' }, 月华传承: gift, 月华值: 100 };
  assert.equal(hasSuiyunSkills(player), true);
  assert.deepEqual(getSuiyunEffects(player), {
    enlightenmentBonus: 0, tribulationReduction: 0, lootMultiplier: 1, noDemonicValue: false,
    madoka: false, luckBonus: 0, freeDungeonEntry: false, absoluteSpiritImmune: false,
  });
  assert.equal(convertSuiyunPotential(player).ok, false);
  assert.equal(hasSuiyunSkills({ ...player, id: 'other' }), false);
  assert.equal(hasSuiyunSkills({ ...player, id: undefined }), false);
  for (const change of [{ 名额: 0 }, { 名额: 4 }, { 授予者: 'student' }, { 技能: ['霜剑入月'] }, { 传授时间: NaN }]) {
    assert.equal(hasSuiyunSkills({ ...player, 月华传承: { ...gift, ...change } }), false);
  }
  for (const flag of ['_tahua_type', '_yiqihua_entity', '_帝骑分身', '_圆神分身', '_万灵魔幡主魂', '分身']) {
    assert.equal(hasSuiyunSkills({ ...player, [flag]: true }), false);
  }
  assert.equal(hasSuiyunSkills({ 灵根: { name: '凡体' }, 学习的功法: [...SUIYUN_EXCLUSIVE_SKILLS] }), false);
});

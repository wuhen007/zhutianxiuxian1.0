import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  spendMoonlight, createSuiyunRoot, hasSuiyunSkills, getSuiyunEffects, SUIYUN_EXCLUSIVE_SKILLS,
  SUIYUN_REDEEM_LIFE_COST, SUIYUN_REDEEM_RESCUE_COST,
} from '../model/suiyun.js';

test('月华只按点扣减救赎成本，多批次与小数余额兼容，不触碰其他资源', () => {
  const p = { 灵根: createSuiyunRoot(1), 月华值: 25000, 仙道潜力: 3.9, 岁云之力: 10, 岁云: { 累计炼化月华: 800 } };
  assert.equal(spendMoonlight(p, SUIYUN_REDEEM_LIFE_COST), true);
  assert.equal(p.月华值, 24900);
  assert.equal(spendMoonlight(p, SUIYUN_REDEEM_RESCUE_COST), true);
  assert.equal(p.月华值, 24700);
  assert.equal(p.仙道潜力, 3.9);
  assert.equal(p.岁云之力, 10);
  assert.deepEqual(p.岁云, { 累计炼化月华: 800 });
});

test('扣减失败完全不修改存档，非正数、非数与透支边界校验', () => {
  for (const [extra, amount] of [
    [{}, 0], [{}, -100], [{}, Infinity], [{}, NaN], [{}, 'x'], [{}, undefined],
    [{ 月华值: NaN }, 100], [{ 月华值: Infinity }, 100], [{ 月华值: 99 }, 100],
  ]) {
    const p = { 灵根: createSuiyunRoot(1), 月华值: 100, ...extra };
    const before = structuredClone(p);
    assert.equal(spendMoonlight(p, amount), false);
    assert.deepEqual(p, before);
  }
});

test('救赎命令替换旧兑换命令，成本常量与文案一致', () => {
  const source = fs.readFileSync(new URL('../apps/User/Suiyun.js', import.meta.url), 'utf8');
  assert.match(source, /reg: '\^#月华救赎\.\*\$', fnc: 'redeem'/);
  assert.doesNotMatch(source, /\^#月华兑换/);
  assert.equal(SUIYUN_REDEEM_LIFE_COST, 100);
  assert.equal(SUIYUN_REDEEM_RESCUE_COST, 200);
  assert.match(source, /月华值只用于月华救赎，不再兑换潜力/);
});

test('受赠资格校验本人身份与完整三技，只有技能不获得任何灵根特权', () => {
  const gift = { 授予者: 'teacher', 受赐者: 'student', 名额: 1, 传授时间: 1, 技能: [...SUIYUN_EXCLUSIVE_SKILLS] };
  const player = { id: 'student', 灵根: { name: '凡体' }, 月华传承: gift, 月华值: 100 };
  assert.equal(hasSuiyunSkills(player), true);
  assert.deepEqual(getSuiyunEffects(player), {
    enlightenmentBonus: 0, tribulationReduction: 0, lootMultiplier: 1, noDemonicValue: false,
    madoka: false, luckBonus: 0, freeDungeonEntry: false, absoluteSpiritImmune: false,
  });
  assert.equal(spendMoonlight(player, 9999), false);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateSuiyun, advanceSuiyun, ensureSuiyunState, refineSuiyun,
  cultivateSuiyun, convertSuiyunPower, getSuiyunLotusBonus,
} from '../model/suiyun.js';

function player() {
  const result = { id: 'owner', 学习的功法: ['月华炼天功'] };
  activateSuiyun(result, { now: 0 });
  return result;
}
const equipment = { 法宝: { name: '云月之莲', id: 9600303, 绑定者: 'owner', atk: 123, def: 456, HP: 789 } };

test('只有成功的真实本源炼化计入莲成长，玩家天骄灾厄均按精确月华奖励累计', () => {
  const p = player();
  for (const kind of ['玩家', '天骄', '灾厄']) {
    const result = refineSuiyun(p, { targetId: kind, kind, random: () => .5 });
    assert.equal(result.gain, 200);
  }
  assert.equal(p.岁云.累计炼化月华, 600);
  assert.equal(getSuiyunLotusBonus(p, equipment).statBonus, 120000000);
  assert.equal(refineSuiyun(p, { targetId: '灾厄', kind: '灾厄' }).ok, false);
  assert.equal(refineSuiyun(p, { kind: '灾厄' }).ok, false);
  p.学习的功法 = [];
  assert.equal(refineSuiyun(p, { targetId: 'new' }).ok, false);
  assert.equal(p.岁云.累计炼化月华, 600);
});

test('日修炼和直接增加余额不养器，兑换后成长不降、反复查看不复利', () => {
  const p = player();
  const original = structuredClone(equipment);
  cultivateSuiyun(p, { now: 0, random: () => 1 });
  assert.equal(p.月华值, 5000);
  assert.equal(p.岁云.累计炼化月华, 0);
  refineSuiyun(p, { targetId: 'one', random: () => 0 });
  p.月华值 = 10000;
  const before = getSuiyunLotusBonus(p, equipment);
  assert.equal(convertSuiyunPower(p).ok, true);
  assert.equal(p.月华值, 0);
  assert.deepEqual(getSuiyunLotusBonus(p, equipment), before);
  assert.deepEqual(getSuiyunLotusBonus(p, equipment), before);
  assert.deepEqual(equipment, original);
});

test('成长先积累后得莲，晋升保留；换下法宝或换根仅停用增幅', () => {
  const p = player();
  refineSuiyun(p, { targetId: 'one', random: () => 0 });
  assert.deepEqual(getSuiyunLotusBonus(p, {}), { active: false, moonlight: 100, statBonus: 0, perMoonlight: 200000 });
  Object.assign(p.岁云, { 引月入体: 12, 化霜入剑: 12, 月之见证: 9 });
  p.mijinglevel_id = 20;
  for (let i = 0; i < 4; i++) assert.equal(advanceSuiyun(p).ok, true);
  assert.equal(getSuiyunLotusBonus(p, equipment).statBonus, 20000000);
  assert.equal(p.岁云.累计炼化月华, 100);
  assert.equal(getSuiyunLotusBonus(p, { 法宝: { name: '普通法宝' } }).statBonus, 0);
  p.灵根 = { name: '凡体' };
  assert.equal(getSuiyunLotusBonus(p, equipment).statBonus, 0);
  assert.equal(p.岁云.累计炼化月华, 100);
});

test('旧档无准确流水从0开始，已有累计字段保留，非法计数不产生属性', () => {
  const p = player();
  delete p.岁云.累计炼化月华;
  p.月华值 = 999999;
  p.岁云.炼化记录 = ['灾厄:old'];
  assert.equal(ensureSuiyunState(p).累计炼化月华, 0);
  refineSuiyun(p, { targetId: 'new', random: () => 1 });
  assert.equal(ensureSuiyunState(p).累计炼化月华, 300);
  for (const invalid of [-1, Infinity, NaN, 'bad']) {
    p.岁云.累计炼化月华 = invalid;
    assert.equal(getSuiyunLotusBonus(p, equipment).statBonus, 0);
    assert.equal(ensureSuiyunState(p).累计炼化月华, 0);
  }
});

test('法宝槽、目录ID和绑定者核验，旧莲无ID可兼容且无固定玩法封顶', () => {
  const p = player();
  p.岁云.累计炼化月华 = 100000000;
  assert.equal(getSuiyunLotusBonus(p, equipment).statBonus, 20000000000000);
  assert.equal(getSuiyunLotusBonus(p, { 法宝: { ...equipment.法宝, id: 123 } }).active, false);
  assert.equal(getSuiyunLotusBonus(p, { 法宝: { ...equipment.法宝, 绑定者: 'other' } }).active, false);
  assert.equal(getSuiyunLotusBonus(p, { 武器: equipment.法宝 }).active, false);
  assert.equal(getSuiyunLotusBonus(p, { 法宝: { name: '云月之莲' } }).active, true);
});

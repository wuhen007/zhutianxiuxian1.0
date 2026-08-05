import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ensureSupremePath,
  getNirvanaMissing,
  getSupremeStage,
  getSupremeTitle,
  getSupremeTrialSpec,
  getUltimateMissing,
  hasSupremeInnate,
  learnSupremeBoneArt,
  repairSupremeBoneManifestation,
} from '../model/supremePath.js';

test('至尊之路仅绑定三种至尊体并自动初始化阶段', () => {
  const player = { 灵根: { name: '涅槃·至尊' } };
  assert.equal(getSupremeStage(player), 2);
  assert.deepEqual(ensureSupremePath(player), {
    阶段: 2,
    仙骨: false,
    重瞳: false,
    共鸣: false,
    试炼: null,
    称号: '涅槃·至尊',
  });
  assert.equal(ensureSupremePath({ 灵根: { name: '混沌体' }, 至尊之路: { 阶段: 3 } }), null);
  assert.equal(hasSupremeInnate({
    灵根: { name: '混沌体' },
    至尊之路: { 阶段: 3, 仙骨: true, 重瞳: true, 共鸣: true },
  }, '至尊重瞳仙骨'), false);
});

test('至尊体进阶条件会准确报告缺项', () => {
  const nirvanaPlayer = {
    至尊骨: '初现',
    极境: [2, '3'],
    学习的功法: ['原始真解神引篇'],
  };
  assert.deepEqual(getNirvanaMissing(nirvanaPlayer), []);
  assert.deepEqual(getNirvanaMissing({}), ['至尊骨初现', '搬血极境', '洞天极境', '原始真解神引篇']);

  const ultimatePlayer = {
    学习的功法: ['六道轮回天功', '原始真解终极篇'],
    纪元积累: 100,
  };
  assert.deepEqual(getUltimateMissing(ultimatePlayer), []);
  assert.equal(getUltimateMissing({ 纪元积累: 20 }).length, 3);
});

test('达到搬血极境的天生至尊自动补齐显化至尊骨，其余至尊体不自动显化', () => {
  const born = { 灵根: { name: '天生至尊' }, 极境: [2] };
  const nirvana = { 灵根: { name: '涅槃·至尊' }, 极境: ['2'] };
  const ultimate = { 灵根: { name: '终极涅槃·至尊' }, 极境: ['2'] };
  const trial = { 灵根: { name: '天生至尊' }, 极境: ['2'], 至尊骨: '已斩出' };

  // 天生至尊 + 搬血极境 → 自动显化「初现」
  assert.equal(repairSupremeBoneManifestation(born), true);
  assert.equal(born.至尊骨, '初现');
  // 涅槃·至尊 / 终极涅槃·至尊 不自动显化，须走 #至尊试炼 进阶
  assert.equal(repairSupremeBoneManifestation(nirvana), false);
  assert.equal(nirvana.至尊骨, undefined);
  assert.equal(repairSupremeBoneManifestation(ultimate), false);
  assert.equal(ultimate.至尊骨, undefined);
  // 已有至尊骨则不重复补齐
  assert.equal(repairSupremeBoneManifestation(trial), false);
  assert.equal(trial.至尊骨, '已斩出');
  // 未达搬血极境不显化
  assert.equal(repairSupremeBoneManifestation({ 灵根: { name: '天生至尊' }, 极境: [] }), false);
});

test('重瞳与仙骨使用组合技能但保留至尊骨本命神通', () => {
  const player = {
    灵根: { name: '终极涅槃·至尊' },
    至尊之路: { 阶段: 3, 重瞳: true, 仙骨: true, 共鸣: false },
  };
  assert.equal(hasSupremeInnate(player, '终极涅槃·至尊'), true);
  assert.equal(hasSupremeInnate(player, '重瞳'), false);
  assert.equal(hasSupremeInnate(player, '重瞳至尊'), true);
  assert.equal(hasSupremeInnate(player, '仙骨'), true);
  assert.equal(getSupremeTitle(player), '重瞳双骨至尊');

  player.至尊之路.共鸣 = true;
  assert.equal(hasSupremeInnate(player, '重瞳至尊'), false);
  assert.equal(hasSupremeInnate(player, '至尊重瞳仙骨'), true);
  assert.equal(getSupremeTitle(player), '至尊重瞳仙骨');
});

test('原生重瞳者仍兼容旧版重瞳技能，试炼配置保持固定', () => {
  assert.equal(hasSupremeInnate({ 灵根: { name: '重瞳者' } }, '重瞳'), true);
  assert.deepEqual(getSupremeTrialSpec('nirvana'), {
    target: 9,
    enemyName: '夺骨者投影',
    enemyScale: 0.65,
  });
  assert.equal(getSupremeTrialSpec('ultimate').target, 4);
});

test('至尊骨按阶段参悟宝术并自动合成轮回天罚', () => {
  const player = { 灵根: { name: '天生至尊' }, 学习的功法: [] };

  assert.deepEqual(learnSupremeBoneArt(player, '至尊骨'), {
    ok: true,
    skill: '上苍之手',
    combined: null,
  });
  assert.equal(learnSupremeBoneArt(player, '至尊骨').reason, 'known');
  assert.equal(learnSupremeBoneArt(player, '涅槃至尊骨').reason, 'wrong_stage');

  player.灵根.name = '涅槃·至尊';
  assert.deepEqual(learnSupremeBoneArt(player, '涅槃至尊骨'), {
    ok: true,
    skill: '轮回宝术',
    combined: '轮回天罚',
  });
  assert.deepEqual(player.学习的功法, ['上苍之手', '轮回宝术', '轮回天罚']);
});

test('至尊伴生技能、材料与副本掉落配置完整', () => {
  const readJson = relativePath => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
  const attacks = readJson('../resources/data/item/技能组/攻击技能.json');
  const defenses = readJson('../resources/data/item/技能组/防御技能.json');
  const materials = readJson('../resources/data/item/材料列表.json');
  const dungeons = readJson('../resources/data/item/副本/下界八域列表.json');
  const techniques = readJson('../resources/data/item/功法列表.json');

  assert.equal(attacks.find(skill => skill.name === '重瞳至尊')?.beilv, 1.5);
  assert.equal(attacks.find(skill => skill.name === '至尊重瞳仙骨')?.beilv, 2);
  assert.ok(defenses.some(skill => skill.name === '仙骨'));
  assert.ok(defenses.some(skill => skill.name === '至尊重瞳仙骨'));
  assert.ok(materials.some(item => item.name === '重瞳本源' && item.class === '材料'));
  assert.ok(dungeons.find(place => place.name === '大荒峡谷')?.four.some(item => item.name === '重瞳本源'));
  assert.ok(materials.some(item => item.name === '涅槃至尊骨' && item.class === '材料'));
  assert.ok(['上苍之手', '轮回宝术', '轮回天罚'].every(name => techniques.some(item => item.name === name)));

  const hand = attacks.find(skill => skill.name === '上苍之手');
  const punishment = attacks.find(skill => skill.name === '轮回天罚');
  assert.ok(attacks.indexOf(punishment) < attacks.indexOf(hand), '组合技需先于前置宝术结算，避免被三技能上限截断');
  assert.equal(hand?.控制, 1);
  assert.equal(punishment?.控制, 1);
  assert.equal(punishment?.负面类型, '轮回之力');
  assert.equal(punishment?.负面回合, 3);
});

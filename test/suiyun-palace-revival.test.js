import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  createSuiyunRoot, SUIYUN_STAGES, SUIYUN_PET_NAME, SUIYUN_PET_LEGACY_NAME,
  SUIYUN_PET_FORGING_GROWTH, SUIYUN_PET_ALCHEMY_GROWTH, SUIYUN_PALACE_TECHNIQUE, SUIYUN_REVIVAL_SKILL,
  SUIYUN_REVIVAL_TEACH_CHANCE,
} from '../model/suiyun.js';
import {
  REVIVAL_GONGFA_CD, getSuiyunRevivalEffect, getRevivalEffectLabel,
  hasInnateRevivalGongfa, resolveGongfaRevival,
} from '../model/tribulationRevival.js';
import { FACTION_POSITION_ORDER } from '../model/factionSystem.js';
import { getPetAbilityBonus } from '../model/innateTreasure.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const readJson = file => JSON.parse(read(file));

test('岁云后四阶境界名对齐仙古体系（遮天↔完美对照）', () => {
  assert.deepEqual(SUIYUN_STAGES.map(stage => stage.realmName), ['无', '神火境', '天神境', '至尊境', '准仙帝']);
  assert.deepEqual(SUIYUN_STAGES.map(stage => stage.realm), [0, 10, 12, 16, 20]);
});

test('岁云剑宫沿用材料名录、替换镇宫帝兵并增补龙髓与百草液，全部限宫主', () => {
  const jianyunhai = readJson('resources/data/item/势力商店/剑云海商店.json');
  const palace = readJson('resources/data/item/势力商店/岁云剑宫商店.json');
  const key = item => `${item.name}|${item.class}|${item.出售价}`;
  const base = new Set(jianyunhai.map(key));
  assert.deepEqual(palace.filter(item => !base.has(key(item))).map(item => item.name).sort(), ['月华帝剑', '百草液', '龙髓']);
  assert.ok(!palace.some(item => item.name === '终古剑之主'));
  assert.ok(jianyunhai.some(item => item.name === '终古剑之主'));
  assert.equal(palace.length, jianyunhai.length + 2);
  assert.ok(palace.every(item => item.要求 === '宫主'));
  assert.ok(palace.some(item => item.name === '龙髓' && item.class === '丹药'));
  assert.ok(palace.some(item => item.name === '百草液' && item.class === '道具'));
  assert.match(read('model/XiuxianData.js'), /suiyunjianGongshangdian/);
});

test('剑宫兑换与开启剑宫宝库接线完整，俸禄机制与剑云海一致', () => {
  const home = read('apps/User/UserHome.js');
  assert.match(home, /fnc: 'Buy_suiyunjianGong'/);
  assert.match(home, /player\.势力 !== "岁云剑宫"/);
  assert.match(home, /data\.suiyunjianGongshangdian/);
  assert.match(home, /#剑宫兑换/);
  const shili = read('apps/User/shili.js');
  assert.match(shili, /reg: '\^#开启剑宫宝库\$'/);
  assert.match(shili, /fnc: 'lingqujianGong'/);
  assert.match(shili, /player\.势力 !== "岁云剑宫"/);
  assert.match(shili, /reserveDailyFactionReward\(usr_qq, 'jianGong_open_day'/);
  assert.match(shili, /player\.源石 \+= 30000000/);
  const auto = read('apps/tasks/AutoDailyTask.js');
  assert.match(auto, /\['瑶池', '摇光圣地', '剑云海', '岁云剑宫'\]/);
  assert.match(auto, /\["剑云海", "岁云剑宫"\]\.includes\(player\.势力\)/);
  assert.match(auto, /jianGong_open_day/);
  assert.match(auto, /岁云剑宫宝库/);
  assert.deepEqual(FACTION_POSITION_ORDER['岁云剑宫'], ['宫主']);
  assert.match(read('model/factionSystem.js'), /ELITE_POSITIONS = new Set\(\["圣子", "圣女", "传人", "宫主"\]\)/);
});

test('岁云剑灵保留三维战斗加成并同时附加固定炼器与炼丹能力', () => {
  const pets = readJson('resources/data/item/仙宠列表.json');
  assert.equal(pets.some(pet => pet.name === SUIYUN_PET_LEGACY_NAME), false);
  const pet = pets.find(item => item.name === SUIYUN_PET_NAME);
  assert.ok(pet);
  assert.equal(pet.type, '战斗');
  assert.equal(pet.加成, 0.35);
  assert.deepEqual(pet.附加能力, [
    { type: '炼器', 成长值: SUIYUN_PET_FORGING_GROWTH }, { type: '炼丹', 成长值: SUIYUN_PET_ALCHEMY_GROWTH },
  ]);
  assert.equal(pet.岁云专属, true);
  assert.equal(pet.不可创造, true);
  for (const roll of [.399, .4]) {
    const code = read('apps/Occupation/Occupation.js');
    const start = code.indexOf("    const alchemyPetBonus = getPetAbilityBonus(player.仙宠, '炼丹');");
    const end = code.indexOf('    const furnaceEligible', start);
    const makePills = new Function('player', 'getPetAbilityBonus', 'Math', 'e',
      `let n=3; ${code.slice(start, end)}; return n;`);
    assert.equal(makePills({ 仙宠: pet }, getPetAbilityBonus, { random: () => roll }, { reply() {} }), roll < .4 ? 6 : 3);
    assert.equal(getPetAbilityBonus(pet, '炼器'), .4);
    assert.equal(getPetAbilityBonus(pet, '战斗'), .35);
  }
  const gongfa = readJson('resources/data/item/功法列表.json');
  assert.ok(gongfa.some(item => item.name === SUIYUN_PALACE_TECHNIQUE && item.class === '功法' && item.type === '帝经'));
});

test('如月长存与柳神法同源：三层庇护、45%减伤、五道15%恢复', () => {
  assert.equal(REVIVAL_GONGFA_CD[SUIYUN_REVIVAL_SKILL], 5);
  assert.deepEqual(getSuiyunRevivalEffect(1000), {
    庇护层数: 3, 减伤比例: 0.45,
    持续恢复: { 回合数: 5, 治疗量: 150 },
    免疫控制: true, 名称: SUIYUN_REVIVAL_SKILL,
  });
  assert.deepEqual(getSuiyunRevivalEffect(0), {
    庇护层数: 3, 减伤比例: 0.45,
    持续恢复: { 回合数: 5, 治疗量: 0 },
    免疫控制: true, 名称: SUIYUN_REVIVAL_SKILL,
  });
  assert.equal(getRevivalEffectLabel({ 名称: SUIYUN_REVIVAL_SKILL }), SUIYUN_REVIVAL_SKILL);
  assert.equal(getRevivalEffectLabel({}), '柳神法');
  assert.equal(hasInnateRevivalGongfa({ 灵根: createSuiyunRoot(1) }, SUIYUN_REVIVAL_SKILL), true);
  assert.equal(hasInnateRevivalGongfa({ 灵根: createSuiyunRoot(1) }, '柳神法'), false);
  assert.equal(hasInnateRevivalGongfa({ 灵根: { name: '凡体' } }, SUIYUN_REVIVAL_SKILL), false);
});

test('岁云灵根本人未学秘籍也可凭如月长存渡劫复活，非岁云修士不复活', () => {
  const player = { 名号: '月下修士', 血量上限: 1000, 当前血量: 0, 生命本源: 100, 灵根: createSuiyunRoot(1), 学习的功法: [] };
  const result = resolveGongfaRevival(player, { allowMingge: false });
  assert.equal(result.revived, true);
  assert.equal(result.source, '如月长存·月华不灭');
  assert.equal(player.当前血量, 600);
  assert.equal(player.生命本源, 50);
  assert.equal(player.功法[SUIYUN_REVIVAL_SKILL].冷却回合, 5);
  assert.deepEqual(player.柳神效果, getSuiyunRevivalEffect(1000));

  const outsider = { 名号: '凡人', 血量上限: 1000, 当前血量: 0, 生命本源: 100, 灵根: { name: '凡体' }, 学习的功法: [] };
  assert.equal(resolveGongfaRevival(outsider, { allowMingge: false }).revived, false);
  assert.equal(outsider.生命本源, 100);
});

test('双修与岁云灵根者修习如月长存：固定概率且不覆盖已有灵根与已学功法', () => {
  assert.equal(SUIYUN_REVIVAL_TEACH_CHANCE, 0.15);
  const games = read('apps/Game/Games.js');
  assert.match(games, /import \{ getSuiyunStage, SUIYUN_REVIVAL_SKILL, SUIYUN_REVIVAL_TEACH_CHANCE \} from '\.\.\/\.\.\/model\/suiyun\.js'/);
  assert.match(games, /if \(getSuiyunStage\(holder\) <= 0\) continue;/);
  assert.match(games, /if \(getSuiyunStage\(learner\) > 0\) continue;/);
  assert.match(games, /if \(learned\.includes\(SUIYUN_REVIVAL_SKILL\)\) continue;/);
  assert.match(games, /Math\.random\(\) >= SUIYUN_REVIVAL_TEACH_CHANCE/);
  assert.match(games, /learner\.学习的功法 = \[\.\.\.learned, SUIYUN_REVIVAL_SKILL\]/);
});

test('渡劫插件与三套渡劫接入如月长存，不破坏既有柳神法标签', () => {
  assert.match(read('apps/SecretPlace/xianguTribulation.js'), /getSuiyunRevivalEffect|getRevivalEffectLabel/);
  assert.match(read('apps/User/zhetiandujie.js'), /如月长存/);
  assert.match(read('apps/User/zhetiandujie.js'), /getRevivalEffectLabel/);
});

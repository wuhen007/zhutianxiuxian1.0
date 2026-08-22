import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  applyXijieLawSuppression,
  buildXijieNpcCombatant,
  createXijiePlayerSnapshot,
  getRootLawMitigation,
  meetsImperialRealmRequirement,
} from '../model/xijieNpc.js';

const npcList = JSON.parse(fs.readFileSync(new URL('../resources/data/item/npc列表.json', import.meta.url), 'utf8'));
const staticShop = JSON.parse(fs.readFileSync(new URL('../resources/data/item/shop列表.json', import.meta.url), 'utf8'));
const runtimeShop = JSON.parse(fs.readFileSync(new URL('../resources/data/shop/shop.json', import.meta.url), 'utf8'));
const techniques = JSON.parse(fs.readFileSync(new URL('../resources/data/item/功法列表.json', import.meta.url), 'utf8'));
const attackSkills = JSON.parse(fs.readFileSync(new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url), 'utf8'));
const materials = JSON.parse(fs.readFileSync(new URL('../resources/data/item/材料列表.json', import.meta.url), 'utf8'));
const medicines = JSON.parse(fs.readFileSync(new URL('../resources/data/item/丹药列表.json', import.meta.url), 'utf8'));
const equipment = JSON.parse(fs.readFileSync(new URL('../resources/data/item/特殊装备列表.json', import.meta.url), 'utf8'));
const blueprints = JSON.parse(fs.readFileSync(new URL('../resources/data/occupation/装备图纸.json', import.meta.url), 'utf8'));

function player(overrides = {}) {
  return {
    id: '10001',
    名号: '测试修士',
    攻击: 1000,
    防御: 1000,
    血量上限: 1000,
    当前血量: 1000,
    速度: 1000,
    暴击率: 1,
    暴击伤害: 2,
    法球倍率: 1,
    灵根: { name: '五转轮回体', type: '转生' },
    mijinglevel_id: 14,
    xiangulevel_id: 13,
    huafenlevel_id: 14,
    学习的功法: ['临字秘', '皆字秘', '一气化三清', '六道轮回拳'],
    当前使用的功法: '皆字秘',
    ...overrides,
  };
}

function wheelSeaBoss(tier = 'two') {
  const place = npcList.find(item => item.name === '轮回海');
  return buildXijieNpcCombatant(place[tier][0], player(), tier === 'one' ? 1 : tier === 'two' ? 2 : 3);
}

test('洗劫快照保留完整战斗字段且不修改玩家对象', () => {
  const source = player({ 魔道值: 1200, 分身: [{ name: '道身' }] });
  const snapshot = createXijiePlayerSnapshot(source, 2, '10001');

  assert.equal(snapshot.防御, 2000);
  assert.equal(snapshot.血量上限, 2000);
  assert.equal(snapshot.当前血量, 2000);
  assert.equal(snapshot.魔值, 1);
  assert.notEqual(snapshot.学习的功法, source.学习的功法);
  assert.equal(source.当前血量, 1000);
});

test('轮回海低境界战斗会封禁三种秘法并压低全属性', () => {
  const source = player();
  const result = applyXijieLawSuppression(source, wheelSeaBoss('two'));

  assert.equal(result.suppressed, true);
  assert.deepEqual(result.sealed.sort(), ['一气化三清', '临字秘', '皆字秘'].sort());
  assert.deepEqual(result.player.学习的功法, ['六道轮回拳']);
  assert.equal(result.player.当前使用的功法, '六道轮回拳');
  assert.ok(result.player.攻击 < 500);
  assert.ok(result.message.includes('帝道规则压制'));
  assert.equal(source.攻击, 1000);
  assert.equal(source.学习的功法.length, 4);
});

test('秘境大帝、仙古至尊、花粉混元大能任一路达标即可解除封禁', () => {
  const paths = [
    { mijinglevel_id: 16 },
    { xiangulevel_id: 15 },
    { huafenlevel_id: 16 },
  ];
  for (const path of paths) {
    const source = player(path);
    assert.equal(meetsImperialRealmRequirement(source), true);
    const result = applyXijieLawSuppression(source, wheelSeaBoss('two'));
    assert.deepEqual(result.sealed, []);
    assert.equal(result.player.学习的功法.length, 4);
  }
});

test('强灵根按强度减弱皇道压制但不会直接免疫', () => {
  const boss = wheelSeaBoss('three');
  const weak = applyXijieLawSuppression(player(), boss);
  const strong = applyXijieLawSuppression(player({ 灵根: { name: '彼岸·命运神道体' } }), boss);

  assert.equal(getRootLawMitigation(player()), 0.08);
  assert.equal(getRootLawMitigation(player({ 灵根: { name: '彼岸·命运神道体' } })), 0.5);
  assert.ok(strong.reduction < weak.reduction);
  assert.ok(strong.reduction > 0);
  assert.ok(strong.player.攻击 > weak.player.攻击);
  assert.equal(strong.sealed.length, 3);
});

test('五个势力灵根至少五转且不超过命运神道体，并补齐战斗定义', () => {
  const places = npcList.filter(item => ['柠檬堂', '金银坊', '万宝楼', '星阁', '万仙盟'].includes(item.name));
  const allowedRoots = new Set([
    '五转轮回体', '六转轮回体', '七转轮回体', '八转轮回体', '九转轮回体', '混沌体', '命运神道体',
  ]);
  const factionTechniques = new Map([
    ['柠檬堂', ['八品·八荒剑法', '九品·百味归元经']],
    ['金银坊', ['八品·天星', '九品·金玉镇脉诀']],
    ['万宝楼', ['八品·太皇经', '九品·万宝归藏经']],
    ['星阁', ['八品·混沌经', '九品·周天星枢经']],
    ['万仙盟', ['八品·托天魔功', '九品·诸峰朝元经']],
  ]);

  assert.equal(places.length, 5);
  for (const place of places) {
    for (const tier of ['one', 'two', 'three']) {
      for (const npc of place[tier]) {
        assert.ok(allowedRoots.has(npc.灵根.name), `${npc.name} 灵根越界：${npc.灵根.name}`);
        assert.ok(npc.速度 >= 100, `${npc.name} 缺少速度`);
        assert.ok(npc.mijinglevel_id > 0 && npc.xiangulevel_id > 0 && npc.huafenlevel_id > 0, `${npc.name} 缺少额外体系境界`);
        assert.ok(Math.max(npc.mijinglevel_id, npc.xiangulevel_id, npc.huafenlevel_id) <= 10, `${npc.name} 额外体系超过10级`);
        assert.ok(Array.isArray(npc.学习的功法) && npc.学习的功法.length > 0, `${npc.name} 缺少功法`);
        assert.ok(npc.学习的功法.every(name => factionTechniques.get(place.name).includes(name)), `${npc.name} 混入外部功法`);
        assert.ok(npc.学习的功法.every(name => name.startsWith(tier === 'three' ? '九品·' : '八品·')), `${npc.name} 功法品阶错误`);
        assert.ok(npc.当前使用的功法, `${npc.name} 缺少当前功法`);
      }
    }
  }
});

test('五大势力之外的NPC按层级学习1到5本功法', () => {
  const factionNames = new Set(['柠檬堂', '金银坊', '万宝楼', '星阁', '万仙盟']);
  const minimumByTier = { one: 1, two: 2, three: 2 };

  for (const place of npcList.filter(item => !factionNames.has(item.name))) {
    for (const tier of ['one', 'two', 'three']) {
      for (const npc of place[tier]) {
        assert.ok(npc.学习的功法.length >= minimumByTier[tier], `${npc.name} 学习功法过少`);
        assert.ok(npc.学习的功法.length <= 5, `${npc.name} 学习功法超过5本`);
        assert.equal(new Set(npc.学习的功法).size, npc.学习的功法.length, `${npc.name} 存在重复功法`);
        assert.ok(npc.学习的功法.includes(npc.当前使用的功法), `${npc.name} 当前功法尚未学习`);
      }
    }
  }
});

test('逆道界、超维真界与轮回海采用新设定', () => {
  const reverse = npcList.find(item => item.name === '逆道界');
  const transcendent = npcList.find(item => item.name === '超维真界');
  const wheelSea = npcList.find(item => item.name === '轮回海');
  const greatXia = npcList.find(item => item.name === '大夏皇朝');

  assert.deepEqual(
    [reverse.one[0].name, reverse.two[0].name, reverse.three[0].name],
    ['逆道界·断序巡狩', '逆道界·悖律邪尊', '逆道界·逆则道君']
  );
  assert.equal(transcendent.two[0].name, '超维纠错者');
  assert.equal(transcendent.three[0].name, '半步超限道天');
  assert.deepEqual(['one', 'two', 'three'].map(tier => reverse[tier][0].当前使用的功法), ['断序蚀道经', '悖律万相功', '逆则归无典']);
  assert.deepEqual(['one', 'two', 'three'].map(tier => reverse[tier][0].灵根.name), ['九转轮回体', '九重魔功', '命运神道体']);
  assert.deepEqual(['one', 'two', 'three'].map(tier => transcendent[tier][0].当前使用的功法), ['超维观测法', '超维纠错协议', '超限道天演算']);
  assert.ok(['one', 'two', 'three'].flatMap(tier => transcendent[tier]).every(npc =>
    Math.max(npc.mijinglevel_id, npc.xiangulevel_id, npc.huafenlevel_id) <= 12
  ));
  assert.equal(transcendent.three[0].额外体系境界.秘境, '仙台秘境·圣人');
  assert.ok(wheelSea.three[0].atk >= 3);
  assert.equal(wheelSea.three[0].帝道规则, true);
  assert.deepEqual(['one', 'two', 'three'].map(tier => wheelSea[tier][0].当前使用的功法), [
    '轮回海古经·踏碎星域', '轮回海古经·轮回战魂', '轮回海古经·极尽升华',
  ]);
  assert.ok(['one', 'two', 'three'].flatMap(tier => greatXia[tier]).every(npc =>
    npc.学习的功法.every(name => ['太皇经·皇道龙气', '太皇经·化龙真义', '太皇剑·龙吟破万法'].includes(name))
  ));
  assert.ok(['one', 'two', 'three'].flatMap(tier => greatXia[tier]).every(npc =>
    Math.max(npc.mijinglevel_id, npc.xiangulevel_id, npc.huafenlevel_id) <= 10
  ));
  assert.ok(greatXia.three.every(npc => npc.额外体系境界.秘境 === '仙台秘境·大能'));
});

test('静态商店与运行时商店同步使用超维新名称', () => {
  for (const shops of [staticShop, runtimeShop]) {
    const place = shops.find(item => item.name === '超维真界');
    assert.ok(place);
    const rewardNames = place.one.map(item => item.name);
    assert.ok(rewardNames.includes('超维真血'));
    assert.ok(rewardNames.includes('超维之石'));
    assert.ok(!rewardNames.includes('主帝神血'));
    assert.ok(!rewardNames.includes('万维梵宇之石'));
  }
});

test('NPC功法与超维掉落、装备图纸均可从主数据表解析', () => {
  const techniqueNames = new Set(techniques.map(item => item.name));
  const attackSkillNames = new Set(attackSkills.map(item => item.name));
  const missingTechniques = npcList.flatMap(place => ['one', 'two', 'three'].flatMap(tier =>
    place[tier].flatMap(npc => npc.学习的功法.filter(name => !techniqueNames.has(name)))
  ));
  assert.deepEqual([...new Set(missingTechniques)], []);
  const missingAttackSkills = npcList.flatMap(place => ['one', 'two', 'three'].flatMap(tier =>
    place[tier].filter(npc => !attackSkillNames.has(npc.当前使用的功法)).map(npc => npc.当前使用的功法)
  ));
  assert.deepEqual([...new Set(missingAttackSkills)], []);

  assert.ok(medicines.some(item => item.name === '超维真血'));
  assert.ok(materials.some(item => item.name === '超维之石'));
  for (const name of ['【超维】破限剑', '【超维】多元星盘', '【超维】元初之甲']) {
    const blueprint = blueprints.find(item => item.name === name);
    assert.ok(blueprint, `缺少图纸：${name}`);
    assert.ok(equipment.some(item => item.name === name), `缺少装备：${name}`);
    assert.ok(blueprint.materials.some(item => item.name === '超维之石'));
  }
});

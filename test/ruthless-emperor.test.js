import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getRuthlessData,
  rollRuthlessDestinyEncounter,
  teachRuthlessTechnique,
} from '../model/ruthlessEmperor.js';
import {
  buildNpcProtector,
  getNpcProtectorEligibility,
} from '../model/npcProtector.js';

test('赤王宿命事件仅向全服战力第一开放且终身只触发一次', () => {
  const player = { 剧情人物: [] };
  const notFirst = rollRuthlessDestinyEncounter(player, {
    isGlobalFirst: false,
    random: () => 0,
  });
  assert.equal(notFirst.encountered, false);
  assert.equal(player.狠人大帝宿命事件已触发, undefined);

  const first = rollRuthlessDestinyEncounter(player, {
    isGlobalFirst: true,
    dungeon: '时间长河',
    random: () => 0,
  });
  assert.equal(first.encountered, true);
  assert.equal(player.狠人大帝宿命事件已触发, true);
  assert.match(first.message, /不朽之王赤王/);
  assert.match(first.message, /需要一个人独断这万古啊/);
  assert.equal(getRuthlessData(player).好感度, 10);

  const repeated = rollRuthlessDestinyEncounter(player, {
    isGlobalFirst: true,
    random: () => 0,
  });
  assert.deepEqual(repeated, { encountered: false, reason: 'once' });
  assert.equal(player.剧情人物.length, 1);
});

test('狠人传承可直接请教，万化仙诀必须在万化圣诀圆满后进阶', () => {
  const player = {
    剧情人物: [{ 狠人大帝: 1, 好感度: 10, 事件记录: [] }],
    学习的功法: [],
    功法熟练度: {},
  };

  assert.deepEqual(teachRuthlessTechnique(player, '一念花开·君临天下'), {
    ok: true,
    name: '一念花开，君临天下',
  });
  assert.equal(player.功法熟练度['一念花开，君临天下'], 0);

  assert.deepEqual(teachRuthlessTechnique(player, '万化仙诀'), {
    ok: false,
    reason: 'prerequisite',
    name: '万化仙诀',
  });

  assert.equal(teachRuthlessTechnique(player, '万化圣诀').ok, true);
  const unmastered = teachRuthlessTechnique(player, '万化仙诀');
  assert.equal(unmastered.reason, 'proficiency');
  assert.equal(unmastered.proficiency, 0);

  player.功法熟练度.万化圣诀 = 1000;
  assert.deepEqual(teachRuthlessTechnique(player, '万化仙诀'), {
    ok: true,
    name: '万化仙诀',
  });
  assert.equal(player.功法熟练度.万化仙诀, 0);
});

test('狠人大帝护道需480好感并使用指定准仙帝战斗模板', () => {
  const insufficient = getNpcProtectorEligibility({
    剧情人物: [{ 狠人大帝: 1, 好感度: 479 }],
  }, {}, '狠人大帝');
  assert.equal(insufficient.ok, false);
  assert.deepEqual(insufficient.missing, ['还需1好感度']);

  const eligible = getNpcProtectorEligibility({
    剧情人物: [{ 狠人大帝: 1, 好感度: 480 }],
  }, {}, '狠人大帝');
  assert.equal(eligible.ok, true);

  const protector = buildNpcProtector('狠人大帝');
  const expectedAllAttribute = 1.5e21;
  assert.equal(protector.level_id, 64);
  assert.equal(protector.Physique_id, 64);
  assert.equal(protector.mijinglevel_id, 20);
  assert.equal(protector.攻击, expectedAllAttribute);
  assert.equal(protector.防御, expectedAllAttribute);
  assert.equal(protector.血量上限, expectedAllAttribute);
  assert.equal(protector.速度, 1800);
  assert.deepEqual(protector.学习的功法, [
    '不灭天功', '万化圣诀', '吞天魔功', '飞仙', '飞仙诀', '一念花开，君临天下',
  ]);
  assert.ok(protector.学习的功法.every(name => protector.功法熟练度[name] === 1000));
});

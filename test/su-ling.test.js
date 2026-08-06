import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SU_LING_TEACHING_TOTAL,
  SU_LING_ULTIMATE,
  advanceSuLingTeaching,
  consumeDeletedFateAction,
  getSuLingData,
  getSuLingRelation,
  resolveSuLingFatalFate,
  rollSuLingDungeonEncounter,
  transferSuLingFateEffects,
} from '../model/suLing.js';
import {
  NPC_PROTECTORS,
  getNpcProtectorEligibility,
  tryNpcProtectorIntervention,
} from '../model/npcProtector.js';

test('苏灵可在任意秘境移动结算时初遇并推进五幕关系', () => {
  const player = {};
  const first = rollSuLingDungeonEncounter(player, {
    chance: 1,
    random: () => 0,
    dungeon: '时间长河',
  });
  assert.equal(first.firstMeeting, true);
  assert.equal(getSuLingData(player).好感度, 10);
  assert.match(first.message, /命线初逢/);

  getSuLingData(player).好感度 = 58;
  const second = rollSuLingDungeonEncounter(player, { chance: 1, random: () => 0, favorGain: 5 });
  assert.equal(second.relationUp, true);
  assert.match(second.storyBeat, /逆流见影/);
  assert.equal(getSuLingRelation(480).name, '生死同命');
});

test('命运神道体在深厚关系后每日受教一次，第十次领悟终极奥秘', () => {
  const player = {
    灵根: { name: '命运神道体' },
    剧情人物: [{ 苏灵: 1, 好感度: 240, 关系: 4, 指点次数: 0, 事件记录: [] }],
    学习的功法: [],
  };

  for (let i = 1; i <= SU_LING_TEACHING_TOTAL; i++) {
    const result = advanceSuLingTeaching(player, `2026-08-${String(i).padStart(2, '0')}`);
    assert.equal(result.ok, true);
    assert.equal(result.count, i);
    assert.equal(result.learned, i === SU_LING_TEACHING_TOTAL);
  }
  assert.equal(player.命运终章已领悟, true);
  assert.equal(player.学习的功法.includes(SU_LING_ULTIMATE), true);
});

test('苏灵指点校验关系、体质和每日次数', () => {
  const player = {
    灵根: { name: '混沌体' },
    剧情人物: [{ 苏灵: 1, 好感度: 239, 指点次数: 0 }],
  };
  assert.equal(advanceSuLingTeaching(player, '2026-08-01').reason, 'favor');
  player.剧情人物[0].好感度 = 240;
  assert.equal(advanceSuLingTeaching(player, '2026-08-01').reason, 'physique');
  player.灵根.name = '彼岸·命运神道体';
  assert.equal(advanceSuLingTeaching(player, '2026-08-01').ok, true);
  assert.equal(advanceSuLingTeaching(player, '2026-08-01').reason, 'daily');
});

test('移劫夺运会转嫁负面、夺取增益并在致死时删除两次行动', () => {
  const holder = {
    名号: '玩家',
    当前血量: 100,
    学习的功法: [SU_LING_ULTIMATE],
    _fumianhuihe: 2,
    _fumian_damage: 10,
    _fumian_type: '剧毒',
  };
  const enemy = {
    名号: '敌人',
    _持续减伤回合: 3,
    _持续减伤比例: 0.5,
    _护盾值: 80,
  };
  const transfer = transferSuLingFateEffects(holder, enemy);
  assert.equal(transfer.triggered, true);
  assert.equal(holder._fumianhuihe, undefined);
  assert.equal(enemy._fumian_type, '剧毒');
  assert.equal(holder._持续减伤回合, 3);
  assert.equal(holder._护盾值, 80);
  assert.equal(enemy._护盾值, undefined);

  const fatal = resolveSuLingFatalFate(holder, enemy, 100);
  assert.equal(fatal.triggered, true);
  assert.equal(fatal.damage, 0);
  assert.equal(consumeDeletedFateAction(enemy).skipped, true);
  assert.equal(consumeDeletedFateAction(enemy).skipped, true);
  assert.equal(consumeDeletedFateAction(enemy).skipped, false);
  assert.equal(resolveSuLingFatalFate(holder, enemy, 100).triggered, false);
});

test('苏灵达到480好感可受邀护道，使用四京属性与命运轮盘', async () => {
  const player = {
    大帝庇护: 1,
    护道人: '苏灵',
    当前血量: 1,
    血量上限: 100,
    剧情人物: [{ 苏灵: 1, 好感度: 480 }],
  };
  assert.equal(getNpcProtectorEligibility(player, {}, '苏灵').ok, true);
  assert.equal(NPC_PROTECTORS.苏灵.combatant.攻击, 40_000_000_000_000_000);
  assert.equal(NPC_PROTECTORS.苏灵.combatant.速度, 1200);
  assert.equal(NPC_PROTECTORS.苏灵.combatant.本命帝兵.全属性, 120);

  const enemy = { 名号: '秘境凶灵', 当前血量: 999 };
  const result = await tryNpcProtectorIntervention(player, enemy, null, 1_000);
  assert.equal(result.triggered, true);
  assert.equal(result.won, true);
  assert.equal(enemy.当前血量, 0);
  assert.equal(player.当前血量, 100);
  assert.equal(player.护道人出手次数, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSwordMagicPanel } from '../model/swordMagicPanel.js';
import { createSwordMagicState, SWORD_MAGIC_REGIONS } from '../model/swordMagic.js';

const NOW = 1_770_000_000_000;
// 中局样本：剑士 Lv5，主线 3，正在探索雾桥驿
const midState = () => ({
  ...createSwordMagicState(NOW - 86_400_000),
  revision: 7, profession: '剑士', traits: ['sword', 'wanderer'], drawnAt: NOW - 80_000_000,
  level: 5, exp: 52, coins: 340, hp: 72, mp: 41,
  skills: { 剑术: 19, 魔法: 6, 祷告: 4, 侦察: 11 }, place: '雾桥驿', chapter: 3,
  bag: { 野营口粮: 2, 疗伤药: 2, 魔力药: 1, 古代晶片: 3 },
  weapon: true, companion: true,
  action: { kind: 'explore', title: '前往雾桥驿探索', target: '雾桥驿',
    startedAt: NOW - 348_000, endAt: NOW + 252_000, roll: 0.4, region: 2, repeat: false },
  defeats: 1, commissions: 4, lore: ['风鸣林', '灰钟地窟', '雾桥驿'],
});

test('面板：生命/魔力上限随等级与魔力超群天赋变化', () => {
  const base = buildSwordMagicPanel({ ...midState(), traits: ['sword', 'wanderer'] }, { now: NOW });
  assert.equal(base.hp.max, 100 + 4 * 8);
  assert.equal(base.mp.max, 60 + 4 * 6);
  const mana = buildSwordMagicPanel({ ...midState(), traits: ['sword', 'mana'] }, { now: NOW });
  assert.equal(mana.mp.max, 60 + 4 * 6 + 35);
});

test('面板：百分比计算与越界钳制', () => {
  const full = buildSwordMagicPanel({ ...midState(), hp: 999, mp: 999 }, { now: NOW });
  assert.equal(full.hp.pct, 100);
  assert.equal(full.mp.pct, 100);
  const empty = buildSwordMagicPanel({ ...midState(), hp: 0, mp: 0 }, { now: NOW });
  assert.equal(empty.hp.pct, 0);
  assert.equal(empty.mp.pct, 0);
  const half = buildSwordMagicPanel({ ...midState(), hp: 66, level: 5 }, { now: NOW });
  assert.equal(half.hp.cur, 66);
  assert.equal(half.hp.max, 132);
  assert.equal(half.hp.pct, 50);
});

test('面板：进行中的行动给出倒计时与进度', () => {
  const panel = buildSwordMagicPanel(midState(), { now: NOW });
  assert.equal(panel.action.idle, false);
  assert.equal(panel.action.title, '前往雾桥驿探索');
  assert.equal(panel.action.remain, '04:12');
  assert.equal(panel.action.pct, 58);
  // 时间推进 → 剩余减少、进度增长
  const later = buildSwordMagicPanel(midState(), { now: NOW + 200_000 });
  assert.equal(later.action.pct, 91.3);
  assert.equal(later.action.remain, '00:52');
});

test('面板：遭遇态取 encounter 所在地区并预览选项', () => {
  const panel = buildSwordMagicPanel({
    ...midState(), action: null, encounter: { region: 4, repeat: false }, place: SWORD_MAGIC_REGIONS[4].name,
  }, { now: NOW });
  assert.equal(panel.region.label, 'CURRENT REGION');
  assert.equal(panel.region.name, '黑曜边城');
  assert.match(panel.action.title, /遭遇 · 黑曜边城/);
  assert.match(panel.action.hint, /#剑与魔法 抉择 救援 \/ 法术 \/ 净化/);
});

test('面板：空闲时指向下一个待探索地区；通关后转 FINAL REGION', () => {
  const next = buildSwordMagicPanel({ ...midState(), action: null, place: '白桦镇' }, { now: NOW });
  assert.equal(next.region.label, 'NEXT DESTINATION');
  assert.equal(next.region.name, SWORD_MAGIC_REGIONS[3].name);
  const done = buildSwordMagicPanel({ ...midState(), action: null, place: '白桦镇', chapter: 6, ending: '黎明勇者' },
    { now: NOW });
  assert.equal(done.region.label, 'FINAL REGION');
  assert.equal(done.region.name, SWORD_MAGIC_REGIONS[5].name);
  assert.equal(done.nameTag, '黎明勇者');
});

test('面板：未就职时无立绘、英文角标回落，职业一览全灭', () => {
  const panel = buildSwordMagicPanel(createSwordMagicState(NOW), { now: NOW });
  assert.equal(panel.portrait, null);
  assert.equal(panel.profession, '未就职');
  assert.equal(panel.professionEn, 'ADVENTURER');
  assert.equal(panel.professions.length, 4);
  assert.equal(panel.professions.every(p => !p.on), true);
});

test('面板：职业高亮与本职熟练度标记', () => {
  const panel = buildSwordMagicPanel(midState(), { now: NOW });
  assert.equal(panel.portrait.key, 'swordsman');
  assert.equal(panel.portrait.name, '剑士');
  const on = panel.professions.filter(p => p.on);
  assert.equal(on.length, 1);
  assert.equal(on[0].name, '剑士');
  assert.equal(panel.skills.find(s => s.name === '剑术').primary, true);
  assert.equal(panel.skills.find(s => s.name === '魔法').primary, false);
  assert.equal(panel.skills.length, 4);
});

test('面板：底部资源栏数量、空槽与铜币来源区分', () => {
  const panel = buildSwordMagicPanel({ ...midState(), coins: 0, bag: { 野营口粮: 5 } }, { now: NOW });
  const byLabel = Object.fromEntries(panel.footer.items.map(i => [i.label, i]));
  assert.equal(byLabel['铜币'].count, 0);
  assert.equal(byLabel['铜币'].empty, true);
  assert.equal(byLabel['野营口粮'].count, 5);
  assert.equal(byLabel['野营口粮'].empty, false);
  assert.equal(byLabel['疗伤药'].empty, true);
  assert.deepEqual(panel.footer.items.map(i => i.icon),
    ['coin', 'crystal', 'ration', 'potion_hp', 'potion_mp']);
});

test('面板：载重含探索收获且格子上限为12', () => {
  const panel = buildSwordMagicPanel({ ...midState(), cargo: { 古代晶片: 2 } }, { now: NOW });
  assert.equal(panel.load.max, 12);
  assert.equal(panel.load.cur, 2 + 2 + 1 + 3 + 2);
});

test('面板：章节轨与羁绊状态', () => {
  const panel = buildSwordMagicPanel(midState(), { now: NOW });
  assert.deepEqual(panel.chapterTrack, ['on', 'on', 'on', 'cur', '', '']);
  assert.equal(panel.bonds[0].on, true);
  assert.equal(panel.bonds[1].on, false);
  assert.match(panel.caption, /主线 3 \/ 6/);
});

test('面板：熟练度封顶 30 与 pct 归一', () => {
  const panel = buildSwordMagicPanel({ ...midState(), skills: { 剑术: 30, 魔法: 15, 祷告: 0, 侦察: 3 } }, { now: NOW });
  const byName = Object.fromEntries(panel.skills.map(s => [s.name, s]));
  assert.equal(byName['剑术'].pct, 100);
  assert.equal(byName['魔法'].pct, 50);
  assert.equal(byName['祷告'].pct, 0);
  assert.equal(byName['侦察'].pct, 10);
  assert.equal(byName['剑术'].max, 30);
});

test('面板：天赋 id 映射为中文名，未知名回落原 id', () => {
  const panel = buildSwordMagicPanel({ ...midState(), traits: ['sword', 'unknown_x'] }, { now: NOW });
  assert.deepEqual(panel.traits.map(t => t.name), ['剑术直觉', 'unknown_x']);
});

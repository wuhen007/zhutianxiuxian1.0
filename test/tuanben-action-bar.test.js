import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const tuanbenSource = fs.readFileSync(
  new URL('../apps/Battle/tuanben.js', import.meta.url),
  'utf8'
);
const xiuxianSource = fs.readFileSync(
  new URL('../model/xiuxian.js', import.meta.url),
  'utf8'
);
const attackSkills = JSON.parse(
  fs.readFileSync(
    new URL('../resources/data/item/技能组/攻击技能.json', import.meta.url),
    'utf8'
  )
);

function loadGetReadyUnits() {
  const source = xiuxianSource.match(
    /export function getReadyUnits\([\s\S]*?\n\}/
  )?.[0];
  assert.ok(source, '未找到 getReadyUnits');
  return Function(`${source.replace('export ', '')}; return getReadyUnits;`)();
}

test('团本同拍单位按速度和行动条排序', () => {
  const getReadyUnits = loadGetReadyUnits();
  const units = [
    { 名号: '玩家', 当前血量: 1, _speed: 1000, _actionBar: 3000 },
    { 名号: '狠人大帝', 当前血量: 1, _speed: 1000, _actionBar: 3500 },
    { 名号: '更快单位', 当前血量: 1, _speed: 1200, _actionBar: 3000 },
  ];

  assert.deepEqual(
    getReadyUnits(units, 3000).map(unit => unit.名号),
    ['更快单位', '狠人大帝', '玩家']
  );
});

test('团本在专属分支前统一扣除行动条', () => {
  assert.match(
    tuanbenSource,
    /for \(const activeUnit of readyUnits\)[\s\S]{0,200}activeUnit\._actionBar -= ACTION_BAR_MAX;/
  );
  assert.doesNotMatch(tuanbenSource, /player\._actionBar -= ACTION_BAR_MAX/);
  assert.doesNotMatch(tuanbenSource, /bossCopy\._actionBar -= ACTION_BAR_MAX/);
});

test('狠人大帝攻击技能均为常驻回合配置', () => {
  const names = new Set([
    '不灭天功',
    '吞天魔功',
    '飞仙诀',
    '一念花开，君临天下',
  ]);
  const skills = attackSkills.filter(skill => names.has(skill.name));

  assert.equal(skills.length, 5);
  assert.ok(skills.every(skill => skill.cnt === -1));
});

test('团本战斗日志和结果总结只通过图片发送', () => {
  assert.match(tuanbenSource, /async sendBattleImages\([\s\S]*get_fight_img/);
  assert.match(tuanbenSource, /await this\.sendBattleImages\(e, resultSummary\)/);
  assert.doesNotMatch(tuanbenSource, /ForwardMsg|makeForwardMsg/);
  assert.doesNotMatch(tuanbenSource, /chunk\.join\('\\n'\)/);
  assert.doesNotMatch(tuanbenSource, /e\.reply\(resultSummary/);
});

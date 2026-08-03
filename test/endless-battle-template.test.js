import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import template from 'art-template';

import {
  ENDLESS_BATTLE_TEMPLATES,
  getEndlessBattleTemplateModel,
  normalizeEndlessBattleTemplate,
} from '../model/endlessBattleTemplate.js';

const themedTemplate = fs.readFileSync(
  fileURLToPath(
    new URL(
      '../resources/html/endless_battle_themed/endless_battle_themed.html',
      import.meta.url
    )
  ),
  'utf8'
);

function battleView(battleTemplate) {
  return {
    pluResPath: './resources',
    battleTemplate,
    battleTemplateName: ENDLESS_BATTLE_TEMPLATES[battleTemplate],
    layer: 10,
    loop: 1,
    routeNodes: Array.from({ length: 10 }, (_, index) => ({
      label: String(index + 1).padStart(2, '0'),
      current: index === 9,
      cleared: true,
    })),
    world: '界海尽头',
    stageName: '位面Boss',
    enemy: '灭世老人',
    trait: '诸界吞噬',
    victory: true,
    checkpoint: true,
    rounds: 1,
    enemyHp: '0',
    enemyMaxHp: '86.4亿',
    enemyHpPct: 0,
    totalDamage: '112.7亿',
    fusionDamage: '28.6亿',
    lifeFire: 1,
    maxLifeFire: 2,
    mvpName: '荒古道尊',
    fusionHits: 1,
    revive: 1,
    lifeFireUsed: 1,
    fusions: ['虚空阳炎界'],
    analysis: '队伍在濒死线上完成逆转。',
    members: [
      {
        name: '荒古道尊',
        alive: true,
        damageTaken: '9.2亿',
        damage: '42.8亿',
        hpPct: 18,
        hp: '1800万',
        maxHp: '1亿',
        isMvp: true,
        abilities: [{ name: '他化自在法', level: 2 }],
        layerCultivation: '2万',
        layerBlood: '2万',
      },
    ],
    roundDetails: [
      {
        round: 1,
        enemyHpPct: 0,
        enemyHp: '0',
        enemyMaxHp: '86.4亿',
        enemyDamage: '18.9亿',
        teamDamageTaken: '9.2亿',
        fusionDamage: '18.9亿',
        teamHpPct: 18,
        actions: [
          {
            side: 'team',
            kind: 'summon',
            actor: '荒古道尊',
            skill: '暗影之手·协同攻击',
            verb: '召唤',
            target: '灭世老人',
            narration: '漆黑巨手自虚空探出完成夹击。',
            note: '',
            hasDamage: true,
            damage: '18.9亿',
            hasHealing: false,
            healing: '0',
            hasAbsorbed: false,
            absorbed: '0',
            sideName: '共鸣',
            critical: true,
            execute: true,
          },
        ],
      },
    ],
    layerReward: {
      cultivation: '2万',
      blood: '2万',
      lingshi: '309万',
      sourceStone: '128万',
      tokens: '25',
    },
    bankedLingshi: '0',
    bankedSourceStone: '0',
    bankedTokens: '0',
    unbankedLingshi: '309万',
    unbankedSourceStone: '128万',
    unbankedTokens: '25',
    settlement: null,
  };
}

test('无尽战报模板编号非法时回退到简洁版', () => {
  assert.equal(normalizeEndlessBattleTemplate(undefined), 1);
  assert.equal(normalizeEndlessBattleTemplate(4), 4);
  assert.equal(normalizeEndlessBattleTemplate(9), 1);
  assert.equal(getEndlessBattleTemplateModel(1), 'endless_battle');
  assert.equal(getEndlessBattleTemplateModel(3), 'endless_battle_themed');
});

test('三套主题战报均保留战斗动作与完整奖励', () => {
  for (const battleTemplate of [2, 3, 4]) {
    const html = template.render(themedTemplate, battleView(battleTemplate));
    for (const text of [
      ENDLESS_BATTLE_TEMPLATES[battleTemplate],
      '暗影之手·协同攻击',
      '全队修为',
      '全队血气',
      '灵石',
      '源石',
      '劫境道痕',
      '309万',
      '128万',
      '25',
    ]) {
      assert.ok(html.includes(text), `模板${battleTemplate}缺少${text}`);
    }
    assert.ok(!html.includes('{{'), `模板${battleTemplate}仍有未渲染表达式`);
  }
});

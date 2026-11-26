import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { getDivineBeastRewardPool } from '../model/divineBeastReward.js';

const data = {
  qilin: [
    { name: '专属四阶丹', 稀有度: 4 },
    { name: '专属五阶丹', 稀有度: 5 },
  ],
  danyao_list: [
    { name: '普通四阶丹', 稀有度: 4 },
    { name: '普通十阶丹', 稀有度: 10 },
  ],
  qinlong: [
    { name: '专属四阶功法', 稀有度: 4 },
    { name: '专属八阶功法', 稀有度: 8 },
  ],
  gongfa_list: [
    { name: '普通三阶功法', 稀有度: 3 },
    { name: '普通五阶功法', 稀有度: 5 },
  ],
  xuanwu: [{ name: '混沌钟' }, { name: '大罗剑胎' }],
  equipment_list: [{ name: '赤霄' }, { name: '大罗剑胎' }],
};

test('青龙和麒麟的普通池与专属池均限制到稀有度4', () => {
  for (const preferred of [false, true]) {
    assert.ok(getDivineBeastRewardPool('青龙', preferred, data).every(item => item.稀有度 <= 4));
    assert.ok(getDivineBeastRewardPool('麒麟', preferred, data).every(item => item.稀有度 <= 4));
  }
});

test('朱雀白虎玄武的普通池与专属池均排除大罗剑胎', () => {
  for (const beast of ['朱雀', '白虎', '玄武']) {
    for (const preferred of [false, true]) {
      assert.ok(getDivineBeastRewardPool(beast, preferred, data).every(item => item.name !== '大罗剑胎'));
    }
  }
});

test('当前游戏数据过滤后仍保留可抽取奖励', () => {
  const readJson = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
  const gameData = {
    qilin: readJson('../resources/data/Timelimit/麒麟.json'),
    danyao_list: readJson('../resources/data/item/丹药列表.json'),
    qinlong: readJson('../resources/data/Timelimit/青龙.json'),
    gongfa_list: readJson('../resources/data/item/功法列表.json'),
    xuanwu: readJson('../resources/data/Timelimit/玄武朱雀白虎.json'),
    equipment_list: readJson('../resources/data/item/装备列表.json'),
  };

  for (const beast of ['麒麟', '青龙', '玄武', '朱雀', '白虎']) {
    for (const preferred of [false, true]) {
      assert.ok(getDivineBeastRewardPool(beast, preferred, gameData).length > 0);
    }
  }
});

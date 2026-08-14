import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findItemSources,
  parseItemSearchQuery,
} from '../model/itemSourceFinder.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readItems(file) {
  return JSON.parse(
    fs.readFileSync(path.join(root, 'resources/data/item', file), 'utf8')
  );
}

test('寻物指令会清理前缀和首尾空格', () => {
  assert.equal(parseItemSearchQuery('#哪里有  秘境之匙  '), '秘境之匙');
  assert.equal(parseItemSearchQuery('#哪里有'), '');
});

test('寻物来源覆盖四档掉落、嵌套奖励和静态渠道并自动去重', () => {
  const data = {
    didian_list: [
      { name: '测试秘境', one: [{ name: '仙石' }], four: [{ name: '仙石' }] },
    ],
    jingshenyuzhou_list: [
      {
        name: '识海',
        layers: [{ name: '深层', drops: [{ name: '仙石' }] }],
      },
    ],
    xunbao_list: {
      treasureMaps: {
        map: {
          name: '古矿',
          rewards: { random: [{ items: [{ name: '仙石' }] }] },
        },
      },
    },
    xingge: [{ name: '仙石' }],
    tianjige_list: [{ name: '炼器图纸', materials: [{ name: '仙石' }] }],
  };

  assert.deepEqual(findItemSources(data, '仙石'), [
    '秘境·测试秘境',
    '精神宇宙·识海·深层',
    '寻宝·古矿',
    '星阁拍卖行',
  ]);
});

test('现有遮天副本和星阁物品可被寻物纸检索', () => {
  const zhetian = readItems('副本/遮天宇宙列表.json');
  const xingge = readItems('星阁拍卖行列表.json');
  const data = { zhetian_list: zhetian, xingge };

  assert.ok(
    findItemSources(data, '神纹锤炼法').includes('遮天位面·灵墟洞天')
  );
  assert.ok(
    findItemSources(data, '虚空经').includes('遮天位面·姬家祖地·传承')
  );
  assert.ok(
    findItemSources(data, '恒宇经').includes('遮天位面·姜家祖地·传承')
  );
  assert.ok(findItemSources(data, xingge[0].name).includes('星阁拍卖行'));
});

test('制造渠道只检索产物，不会把消耗材料当成产物', () => {
  const data = {
    hecheng_list: [{ name: '仙丹', materials: [{ name: '仙草' }] }],
    jiagong_list: [
      {
        name: '灵兽肉',
        inputs: [{ name: '仙草' }],
        outputs: [{ name: '仙丹' }],
      },
    ],
    GroupBossReward_list: [{ one: [{ name: '仙丹' }] }],
  };

  assert.deepEqual(findItemSources(data, '仙丹'), [
    '合成',
    '加工·灵兽肉',
    '若陀龙王团本',
  ]);
  assert.deepEqual(findItemSources(data, '仙草'), []);
});

test('空名称和缺失数据不会产生来源', () => {
  assert.deepEqual(findItemSources({}, ''), []);
  assert.deepEqual(findItemSources({}, '不存在的物品'), []);
});

test('圣墟动态奖励会显示玩法来源', () => {
  assert.deepEqual(findItemSources({}, '神秘石罐'), ['全服唯一机缘·追寻石罐']);
  assert.ok(findItemSources({}, '盗引呼吸法').includes('圣墟副本·魂河古地'));
  assert.ok(findItemSources({}, '普通进化花粉').includes('花粉路·感应异变'));
  assert.ok(findItemSources({}, '太极呼吸法').includes('圣墟副本·武当山'));
});

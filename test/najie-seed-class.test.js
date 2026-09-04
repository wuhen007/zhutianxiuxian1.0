import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const xianguPlaceSource = fs.readFileSync(
  new URL('../apps/SecretPlace/xianguPlace.js', import.meta.url),
  'utf8'
);
const functionSource = source.match(
  /export function normalizeNajieThingClass\([\s\S]*?\n\}/
)?.[0];

assert.ok(functionSource, '未找到纳戒类别归一化函数');
const normalizeNajieThingClass = Function(
  `${functionSource.replace('export ', '')}; return normalizeNajieThingClass;`
)();

test('神话道种统一存入纳戒道具栏', () => {
  const items = JSON.parse(
    fs.readFileSync(new URL('../resources/data/item/道具列表.json', import.meta.url), 'utf8')
  );

  for (const name of ['生命之种', '天穹种']) {
    const item = items.find(candidate => candidate.name === name);
    assert.equal(item?.class, '道种');
    assert.equal(normalizeNajieThingClass(item.class), '道具');
  }
  assert.equal(normalizeNajieThingClass('材料'), '材料');
});

test('纳戒通用入口均使用类别归一化', () => {
  for (const name of [
    'Locked_najie_thing',
    're_najie_thing',
    'exist_najie_thing',
    'Add_najie_thing',
  ]) {
    const start = source.indexOf(`export async function ${name}`);
    assert.ok(start >= 0, `未找到 ${name}`);
    assert.match(
      source.slice(start, start + 500),
      /thing_class = normalizeNajieThingClass\(thing_class\);/,
      `${name} 未接入类别归一化`
    );
  }
});

test('查看、借助和献祭道种均读取纳戒道具栏', () => {
  for (const [name, signature] of [
    ['XianguViewSeeds', 'async XianguViewSeeds(e)'],
    ['XianguJieZhuDaoZhong', 'async XianguJieZhuDaoZhong(e)'],
    ['XianguOfferSeedFn', 'async function XianguOfferSeedFn(e, player, player_qq)'],
  ]) {
    const start = xianguPlaceSource.indexOf(signature);
    assert.ok(start >= 0, `未找到 ${name} 函数体`);
    const body = xianguPlaceSource.slice(start, start + 2500);
    assert.match(body, /readXianguNajie\(player_qq\)/, `${name} 未读取纳戒`);
    assert.match(
      body,
      /getXianguUsableSeedEntries\(player, najie\)/,
      `${name} 未合并纳戒道种`
    );
  }
});

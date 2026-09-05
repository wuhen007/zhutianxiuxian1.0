import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const wenxianSource = fs.readFileSync(
  new URL('../apps/WenXianLing/WenXianLing.js', import.meta.url),
  'utf8'
);
const xiuxianSource = fs.readFileSync(
  new URL('../model/xiuxian.js', import.meta.url),
  'utf8'
);

// 只取 BONUS_REWARDS 字面量区间，避免误伤文件里其它 kind: '道具'
const bonusBlock = wenxianSource.match(
  /const BONUS_REWARDS = \{[\s\S]*?\n\};/
)?.[0];
assert.ok(bonusBlock, '未找到问仙令 BONUS_REWARDS 配置块');

test('问仙令额外奖励里的道具必须显式声明为道具分类', () => {
  const propRewards = [...bonusBlock.matchAll(/\{\s*kind:\s*'道具'[\s\S]*?\}/g)].map(
    match => match[0]
  );
  assert.ok(propRewards.length >= 2, '未解析到道具类额外奖励');

  for (const literal of propRewards) {
    assert.match(
      literal,
      /class:\s*'道具'/,
      `道具类奖励缺少 class: '道具'，会按丹药入库并可能崩溃：${literal}`
    );
  }
});

test('额外奖励发放时道具分类不得回落为丹药', () => {
  const start = wenxianSource.indexOf('async _grantBonusReward');
  assert.ok(start >= 0, '未找到 _grantBonusReward');
  const body = wenxianSource.slice(start, start + 1200);
  const propBranch = body.match(/case '道具':[\s\S]*?break;/)?.[0];
  assert.ok(propBranch, '未找到道具发放分支');
  assert.doesNotMatch(
    propBranch,
    /'丹药'/,
    '道具分支的兜底分类不能是丹药，否则道具会被塞进丹药栏'
  );
  assert.match(propBranch, /reward\.class \|\| '道具'/);
});

test('纳戒的物品增减不得依赖跨分类查找结果', () => {
  const start = xiuxianSource.indexOf('export async function Add_najie_thing');
  assert.ok(start >= 0, '未找到 Add_najie_thing');
  const body = xiuxianSource.slice(start, start + 9000);

  // exist_najie_thing 会遍历所有分类，同名物品只要存在任一栏位就返回真值。
  // 一旦它与 thing_class 不一致，末尾的 find 会拿到 undefined 并抛
  // "Cannot read properties of undefined (reading '数量')"。
  assert.doesNotMatch(
    body,
    /najie\[thing_class\]\.find\(item => item\.name == name\)\.数量 \+= x;\s*\n\s*najie\[thing_class\] = najie\[thing_class\]\.filter/,
    'Add_najie_thing 通用分支仍在无保护地写入 find 结果'
  );
  assert.match(body, /const target = najie\[thing_class\]\.find/);
  assert.match(body, /if \(!target\) \{/);
});

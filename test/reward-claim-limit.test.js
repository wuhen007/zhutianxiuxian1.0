import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const block = source.match(
  /const MAX_REWARD_CLAIMS = \d+;[\s\S]*?\r?\n}\r?\n\r?\nexport async function Add_灵石/
)?.[0];

test('idempotency claims keep only the newest 500 records', () => {
  assert.ok(block, '未找到幂等账本实现');
  const executable = block.replace(/\r?\n\r?\nexport async function Add_灵石$/, '');
  const { limit, record } = Function(
    `${executable}; return { limit: MAX_REWARD_CLAIMS, record: recordRewardClaim };`
  )();
  const target = {};

  for (let i = 0; i <= limit; i++) record(target, `claim:${i}`, i);

  assert.equal(Object.keys(target._rewardClaims).length, limit);
  assert.equal(target._rewardClaims['claim:0'], undefined);
  assert.equal(target._rewardClaims[`claim:${limit}`].amount, limit);
});

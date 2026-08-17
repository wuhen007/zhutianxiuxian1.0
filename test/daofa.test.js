import assert from 'node:assert/strict';
import test from 'node:test';

import { getDaofaDisplay, isDaofaActive, refreshDaofaStatus } from '../model/daofa.js';

test('道法仙术同时校验状态和到期时间', () => {
  const now = 1_000;
  assert.equal(isDaofaActive({ daofaxianshu: '2', daofaxianshu_endtime: '1001' }, now), true);
  assert.equal(isDaofaActive({ daofaxianshu: 2, daofaxianshu_endtime: now }, now), false);
  assert.equal(isDaofaActive({ daofaxianshu: 0, daofaxianshu_endtime: 2_000 }, now), false);
});

test('道法日常同步不扣减有效的绝对到期时间', () => {
  const now = 1_000;
  const endTime = now + 2 * 24 * 60 * 60 * 1000;
  const player = { daofaxianshu: 2, daofaxianshu_endtime: endTime };

  assert.equal(refreshDaofaStatus(player, now), 'active');
  assert.equal(player.daofaxianshu_endtime, endTime);
  assert.equal(player.daofa, '已开启，当前剩余2天');
});

test('道法面板按当前时间实时显示小数天数', () => {
  const now = 1_000;
  const player = { daofaxianshu: 2, daofaxianshu_endtime: now + 12 * 60 * 60 * 1000 };
  assert.equal(getDaofaDisplay(player, now), '已开启，当前剩余0.5天');
  assert.equal(getDaofaDisplay({ ...player, daofaxianshu: 0 }, now), '未开启');
});

test('道法日常同步会清理已过期状态', () => {
  const player = { daofaxianshu: 2, daofaxianshu_endtime: 999, daofa: '已开启' };

  assert.equal(refreshDaofaStatus(player, 1_000), 'expired');
  assert.deepEqual(player, { daofaxianshu: 0, daofaxianshu_endtime: 0, daofa: '未开启' });
});

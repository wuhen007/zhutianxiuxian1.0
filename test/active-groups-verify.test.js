import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPushTarget } from '../model/activeGroups.js';

test('官方群未开全量消息时不纳入推送名单', async () => {
  // 32 位 openid 会走官方通道，resolveOpenid 直接返回自身，不需要读配置文件
  const off = 'A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D5';
  globalThis.redis = {
    sendCommand: async ([cmd]) => {
      if (cmd === 'SCARD') return 3; // 标记集合非空 = qqbot-api 已在记录
      if (cmd === 'SISMEMBER') return 0; // 该群不在集合里 = 没开全量
      return null;
    },
  };
  try {
    const verdict = await verifyPushTarget(off);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason, /获取群内全部消息/);
  } finally {
    delete globalThis.redis;
  }
});

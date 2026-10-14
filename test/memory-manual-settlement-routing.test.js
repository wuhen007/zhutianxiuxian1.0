import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { getSecretPlaceActionEndTime } from '../model/secretPlaceAddiction.js';
import { isShangcangAction, SHANGCANG_NORMAL_ACTION } from '../model/shangcangDungeon.js';

test('实际秘境结算命令只委托后台结算器，旧两条直接结算路径无命令入口', async () => {
  const source = fs.readFileSync(new URL('../apps/User/UserSellAll.js', import.meta.url), 'utf8');
  const constructor = source.slice(source.indexOf('  constructor() {'), source.indexOf('async quickSettleDungeon('));
  const start = source.indexOf('  async regression(e) {');
  const method = source.slice(start, source.indexOf('  /**', start));
  let action;
  const calls = [];
  const dependencies = {
    plugin: class { constructor(options) { Object.assign(this, options); } },
    existplayer: async () => true,
    redis: { get: async key => {
      assert.equal(key, 'xiuxian:player:owner:action');
      return action ? JSON.stringify(action) : null;
    } },
    isShangcangAction, getSecretPlaceActionEndTime,
    SECRET_PLACE_SETTLEMENT_BUSY: Symbol('busy'),
    SecretPlaceTask: class { async Secretplacetask(id) { calls.push(['single', id]); } },
    SecretPlaceplusTask: class { async Secretplaceplustask(id) { calls.push(['round', id]); } },
    ShangcangTask: class { async settlePlayer(id) { calls.push(['shangcang', id]); return true; } },
  };
  const Constructor = new Function(...Object.keys(dependencies), `return class extends plugin { ${constructor} ${method} };`)(...Object.values(dependencies));
  const app = new Constructor();
  app.regressionLegacy = () => assert.fail('命令不得调用旧结算分支');
  assert.equal(app.rule.some(rule => rule.fnc === 'regressionLegacy'), false);
  for (const command of ['#秘境结算', '副本结算']) {
    const rule = app.rule.find(item => new RegExp(item.reg).test(command));
    assert.equal(rule.fnc, 'regression');
    for (const [next, expected] of [
      [{ Place_action: '0', end_time: 1 }, ['single']],
      [{ Place_action: '1', Place_actionplus: '0', start_time: 1, total_time: 1, total_count: 3, settled_count: 1 }, ['round', 'round']],
      [{ action: SHANGCANG_NORMAL_ACTION, Place_action: '0', end_time: 1 }, ['shangcang']],
      [{ Place_action: 1, Place_actionplus: 1, escaped: true, end_time: 1 }, []],
      [{ Place_action: '0', end_time: Date.now() + 600_000 }, []],
      [null, []],
    ]) {
      action = next;
      calls.length = 0;
      await app[rule.fnc]({ user_id: 'qg_owner', msg: command, reply: async () => {} });
      assert.deepEqual(calls, expected.map(kind => [kind, 'owner']));
    }
  }
});

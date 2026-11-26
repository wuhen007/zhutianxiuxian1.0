import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { hasSuiyunAuthority, SUIYUN_BRANCH } from '../model/suiyunAuthority.js';
import { isXijieShopLockExpired, XIJIE_SHOP_LOCK_TTL_MS } from '../model/xijieAtlas.js';
import { createXijiePlayerSnapshot } from '../model/xijieNpc.js';

const source = fs.readFileSync(new URL('../apps/Xijie/Xijie.js', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  async xijie(e) {'), source.indexOf('  async tancha(e) {'));

for (const [name, sky, elapsedMinutes, started] of [
  ['首次洗劫正常启动', false, null, true],
  ['普通玩家洗劫保留两小时冷却', false, 90, false],
  ['天空权柄玩家一小时内仍在冷却', true, 30, false],
  ['天空权柄玩家超过一小时正常洗劫', true, 90, true],
]) {
  test(name, async () => {
    const player = {
      灵石: 1000, 魔道值: 0, 灵根: { name: '测试灵根' },
      当前大道至宝: sky ? SUIYUN_BRANCH : '',
      天阙权柄: { 解封: sky ? { 天空: { at: 0 } } : {} },
    };
    const shop = [{ name: '柠檬堂', price: 100, Grade: 1, state: 0 }];
    const values = new Map();
    const messages = [];
    const playerWrites = [];
    let playerReads = 0;
    if (elapsedMinutes !== null) {
      values.set('xiuxian:player:10001:lastxijie_time', String(Date.now() - elapsedMinutes * 60000));
    }
    const dependencies = {
      verc: () => true,
      existplayer: async () => true,
      Read_player: async () => { playerReads++; return structuredClone(player); },
      Write_player: async (_id, value) => playerWrites.push(structuredClone(value)),
      Read_shop: async () => structuredClone(shop),
      Write_shop: async () => {},
      exist_najie_thing: async () => 0,
      hasSuiyunAuthority,
      isXijieShopLockExpired,
      XIJIE_SHOP_LOCK_TTL_MS,
      createXijiePlayerSnapshot,
      getTimedActionMultiplier: () => 1,
      redis: {
        get: async key => values.get(key) ?? null,
        set: async (key, value) => values.set(key, String(value)),
      },
    };
    const app = new Function(...Object.keys(dependencies), `return ({${method}});`)(...Object.values(dependencies));
    await app.xijie({
      user_id: '10001', msg: '#洗劫柠檬堂', isGroup: true, group_id: 'test-group',
      reply: async message => messages.push(message),
    });

    assert.equal(playerReads, 1);
    assert.equal(playerWrites.length, started ? 1 : 0);
    assert.equal(values.has('xiuxian:player:10001:action'), started);
    if (started) {
      assert.equal(playerWrites[0].灵石, 900);
      assert.equal(playerWrites[0].魔道值, 25);
      const action = JSON.parse(values.get('xiuxian:player:10001:action'));
      assert.equal(action.action, '洗劫');
      assert.equal(action.Place_address.name, '柠檬堂');
      assert.equal(action.group_id, 'test-group');
      assert.match(messages.at(-1), /开始前往柠檬堂/);
    } else {
      assert.match(messages.at(-1), new RegExp(`每${sky ? 60 : 120}分钟洗劫一次`));
    }
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

globalThis.Bot = { makeLog() {} };
globalThis.logger = {
  log() {},
  mark() {},
  info() {},
  warn() {},
  error() {},
  debug() {},
};
process.chdir(fileURLToPath(new URL('../../..', import.meta.url)));

const { SakuraAdvancementSystem } = await import('../apps/zhutianjing/mokashaonv.js');

test.after(async () => {
  const config = (await import('../../../lib/config/config.js')).default;
  await Promise.all(Object.values(config.watcher).map(watcher => watcher.close()));
});

function createMissingPlayerEvent() {
  return {
    isGroup: true,
    user_id: 'codex_sakura_test_missing_player',
    replies: [],
    reply(message) {
      this.replies.push(message);
    }
  };
}

test('木之本樱命令可直接处理事件并正确提示玩家不存在', async () => {
  const app = new SakuraAdvancementSystem();

  for (const command of ['sakuraAdvancement', 'collectClowCard', 'yueShenpan', 'mengShilian']) {
    const event = createMissingPlayerEvent();
    const result = await app[command](event);

    assert.match(event.replies.at(-1), /玩家不存在/);
    assert.equal(typeof result === 'object' ? result.success : result, false);
  }
});

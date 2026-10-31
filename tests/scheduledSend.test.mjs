/**
 * 定时任务改走官方主动消息 —— 自测（离线，不联网、不渲染）
 *
 *   node plugins/zhutianxiuxian1.0/tests/scheduledSend.test.mjs
 *
 * 覆盖：
 *   1. 定时任务（无事件参数、实例无 this.e）→ 官方主动消息
 *   2. 指令触发（有 this.e）→ 仍走协议号（公告/传音不受影响）
 *   3. 官方失败 → 回退协议号
 *   4. 未配置的群 → 仍走协议号
 */
const base = new URL('../', import.meta.url);

const logs = [];
const stubLogger = {
  info: m => logs.push(String(m)),
  warn: m => logs.push('WARN ' + m),
  error: () => {},
  mark: () => {},
  debug: () => {},
  green: s => s,
};
globalThis.logger = stubLogger;

// —— Bot.pickGroup 桩 ——
const protocolSends = [];
const group = {
  sendMsg: async (msg) => {
    protocolSends.push(msg);
    return { message_id: 'P' };
  },
  muteMember: async () => true,
};
globalThis.Bot = {
  pickGroup: () => group,
};

// —— 官方 bridge 桩 ——
const officialSends = [];
let bridgeResult = { ok: true, res: { message_id: 'OFF' } };
globalThis[Symbol.for('trss.qqbot.bridge')] = {
  ready: () => true,
  findMessage: () => null,
  sendGroup: async (openid, msg, opts) => {
    officialSends.push({ openid, msg, opts });
    return bridgeResult;
  },
};

const { wrapPluginClass } = await import(new URL('model/textToImage.js', base));
const { installScheduledSender } = await import(new URL('model/scheduledSender.js', base));

// 模拟云崽的结构：Bot 是 Proxy，真正的方法在 Yunzai 类原型上。
// 所以这里给 installScheduledSender 传一个「假原型」，再让 Bot.pickGroup 走它。
// 注意：引入 lib/bot.js 会初始化云崽全局 logger，把桩覆盖掉，这里重新装回桩
globalThis.logger = stubLogger;
const fakeProto = { pickGroup: () => group };
installScheduledSender(fakeProto);
globalThis.Bot = { pickGroup: (id, ...rest) => fakeProto.pickGroup(id, ...rest) };

let fail = 0;
const check = (n, c, e = '') => {
  console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`);
  if (!c) fail += 1;
};

/** 模拟修仙里典型的定时任务：方法内部调 Bot.pickGroup(群号).sendMsg */
class FakeTask {
  async BossTask() {
    await Bot.pickGroup('799048038').sendMsg('【妖王】黑暗动乱降临，速来讨伐');
  }
  async Announce() {
    await Bot.pickGroup('799048038').sendMsg('【修仙公告】今晚停服维护');
  }
}
wrapPluginClass(FakeTask);

// 1. 定时任务上下文 → 官方主动消息
const taskInstance = new FakeTask();
protocolSends.length = 0;
officialSends.length = 0;
await taskInstance.BossTask();
check('定时任务走官方', officialSends.length === 1 && protocolSends.length === 0, JSON.stringify({ o: officialSends.length, p: protocolSends.length }));
check('主动消息（不带 msg_id）', officialSends[0]?.opts?.passive === false && !officialSends[0]?.opts?.msgId, JSON.stringify(officialSends[0]?.opts));
check('发到正确的群 openid', officialSends[0]?.openid === '0C330839BAA9D1CA503743835EBD8E20', String(officialSends[0]?.openid));

// 2. 指令上下文（this.e 存在）→ 仍走协议号（公告场景）
const cmdInstance = new FakeTask();
cmdInstance.e = { group_id: '799048038', reply: async () => {} };
protocolSends.length = 0;
officialSends.length = 0;
await cmdInstance.Announce();
check('指令上下文仍走协议号', protocolSends.length === 1 && officialSends.length === 0, JSON.stringify({ o: officialSends.length, p: protocolSends.length }));

// 3. 官方失败 → 回退协议号
bridgeResult = { ok: false, sent: 0, error: new Error('40034016 主动消息超限') };
protocolSends.length = 0;
officialSends.length = 0;
const task2 = new FakeTask();
await task2.BossTask();
check('官方失败回退协议号', officialSends.length === 1 && protocolSends.length === 1, JSON.stringify({ o: officialSends.length, p: protocolSends.length }));
check('回退有日志', logs.some(l => l.includes('定时任务官方发送失败')), logs.filter(l => l.includes('定时任务')).join('|'));
bridgeResult = { ok: true, res: { message_id: 'OFF2' } };

// 4. 未配置的群 → 协议号
class OtherGroupTask {
  async Run() {
    await Bot.pickGroup('123456789').sendMsg('别的群的消息');
  }
}
wrapPluginClass(OtherGroupTask);
protocolSends.length = 0;
officialSends.length = 0;
await new OtherGroupTask().Run();
check('未配置群仍走协议号', protocolSends.length === 1 && officialSends.length === 0);

// 5. 接管必须落在原型上（而不是 Bot 实例上，否则会被 Proxy 的 get 遮蔽）
check('pickGroup 已被原型接管', fakeProto.pickGroup.__wrapped === undefined && typeof fakeProto.pickGroup === 'function');

// 6. 非 sendMsg 的方法仍然可用（Proxy 不破坏对象）
const anyGroup = Bot.pickGroup('799048038');
check('Proxy 保留其它方法', typeof anyGroup.muteMember === 'function');

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);

/**
 * 官方代发 · 借用 msg_id 发被动回复（离线，不发网络请求）
 *   node plugins/zhutianxiuxian1.0/tests/officialBorrow.test.mjs
 *
 * 背景：被动回复额度跟着「单条用户消息」走（群聊 5 分钟 / 最多 5 次）。
 * 但官方只校验 msg_id 是否有效、msg_seq 是否重复，不校验内容是否相关。
 * 所以一条触发消息的额度用完后，可以借同群其它近期消息的 msg_id 继续发被动消息，
 * 不必消耗「每群每天 1000 条」的主动消息配额。
 */
const base = new URL('../', import.meta.url);
const { registerBridge } = await import(new URL('../qqbot-api/model/bridge.js', base));
const { tryOfficialSend } = await import(new URL('model/officialReply.js', base));

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

const GROUP = '799048038';
/** 配置里 799048038 对应的官方 group_openid，缓存和借用都按这个 key 走 */
const GROUP_OPENID = '0C330839BAA9D1CA503743835EBD8E20';

/** 群里"别人发的消息"池子，用来模拟可借用的 msg_id */
let pool = [];
const sent = [];
let findCalls = 0;
let triggerMsgId = 'MSG-TRIGGER';

registerBridge({
  ready: () => true,
  async sendGroup(openid, msg, opts) {
    sent.push({ openid, msg, opts });
    return { ok: true, sent: 1, res: {} };
  },
  findMessage() {
    findCalls += 1;
    const id = triggerMsgId;
    triggerMsgId = null;
    return id ? { msgId: id, matchedBy: 'content' } : null;
  },
  listMessages(openid, since) {
    return pool.filter(m => m.openid === openid && m.localTime >= since);
  },
  pending: () => pool.length,
  recent: () => [],
});

const addToPool = (msgId, ageMs = 3000) => {
  pool.push({ msgId, openid: GROUP_OPENID, content: '路人发言', localTime: Date.now() - ageMs, ageMs });
};
const lastOpts = () => sent.at(-1)?.opts || {};

// ── 场景 1：触发消息 5 次用满后，借用别人的 msg_id ────────
console.log('\n场景 1：触发消息额度用满 → 借用同群近期消息');
const t1 = { groupId: GROUP, content: '#渡劫-借用测试', time: Date.now() };
for (let i = 1; i <= 5; i += 1) await tryOfficialSend(t1, `第${i}道雷劫`);
check('前 5 条用触发消息自己的 msg_id', sent.every(s => s.opts.msgId === 'MSG-TRIGGER'), JSON.stringify(sent.map(s => s.opts.msgId)));
check('前 5 条都是被动', sent.every(s => s.opts.passive === true));

addToPool('MSG-OTHER', 5000);
const callsBefore = findCalls;
const r6 = await tryOfficialSend(t1, '第6道雷劫');
check('第 6 条改为借用别人的 msg_id', lastOpts().msgId === 'MSG-OTHER', JSON.stringify(lastOpts()));
check('第 6 条仍是被动回复', r6.passive === true && lastOpts().passive === true, JSON.stringify(r6));
check('额度用满后不再重复查缓存', findCalls === callsBefore, `findCalls ${callsBefore}→${findCalls}`);

// ── 场景 2：借来的 msg_id 也会扣额度 ─────────────────────
console.log('\n场景 2：借来的 msg_id 同样只有 5 次');
for (let i = 7; i <= 10; i += 1) await tryOfficialSend(t1, `第${i}道雷劫`);
check('借用后又能用 4 次（累计 5 次）', sent.slice(5).every(s => s.opts.msgId === 'MSG-OTHER'), JSON.stringify(sent.slice(5).map(s => s.opts.msgId)));

addToPool('MSG-THIRD', 1000);
const r11 = await tryOfficialSend(t1, '第11道雷劫');
check('借来的用满后换下一条', lastOpts().msgId === 'MSG-THIRD', JSON.stringify(lastOpts()));
check('换的那条也是被动', r11.passive === true, JSON.stringify(r11));

// ── 场景 3：优先借额度最多的（最新的那条） ───────────────
console.log('\n场景 3：多条可借时优先挑额度最充裕的');
pool = [];
addToPool('MSG-OLD', 280000);   // 4 分 40 秒前，快过期
addToPool('MSG-NEW', 2000);     // 刚发的
const r12 = await tryOfficialSend(t1, '第12道雷劫');
check('优先借最新的消息', lastOpts().msgId === 'MSG-NEW', JSON.stringify(lastOpts()));

// ── 场景 4：没有可借的消息 → 主动消息 ────────────────────
console.log('\n场景 4：池子空了只能走主动消息');
pool = [];
const r13 = await tryOfficialSend(t1, '第13道雷劫');
check('无消息可借时不带 msg_id', lastOpts().msgId === '', JSON.stringify(lastOpts()));
check('无消息可借时发主动消息', r13.handled === true && r13.passive === false, JSON.stringify(r13));

// ── 场景 5：超出 5 分钟的旧消息不可借用 ──────────────────
console.log('\n场景 5：超过 5 分钟窗口的消息不借');
pool = [];
addToPool('MSG-EXPIRED', 301 * 1000);
const r14 = await tryOfficialSend(t1, '第14道雷劫');
check('过期消息不被借用', lastOpts().msgId !== 'MSG-EXPIRED', JSON.stringify(lastOpts()));
check('过期后走主动消息', r14.passive === false, JSON.stringify(r14));

console.log(fail === 0 ? '\n全部通过' : `\n失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);

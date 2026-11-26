/**
 * 官方代发 · msg_id 会话复用自测（离线，不发网络请求）
 *   node plugins/zhutianxiuxian1.0/tests/officialReuse.test.mjs
 *
 * 背景：渡劫是「一次 #渡劫 指令、之后每 60 秒回一条」，共 9 道。
 * 官方允许同一条用户消息的 msg_id 在 5 分钟内回 5 条，但 findMessage 的时间容差只有 6 秒，
 * 导致第 2 道起全部回退协议号。这里验证「首次配到后记住并复用」的逻辑。
 */
const base = new URL('../', import.meta.url);
const { registerBridge } = await import(new URL('../qqbot-api/model/bridge.js', base));
const { tryOfficialSend } = await import(new URL('model/officialReply.js', base));

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

// ── 假桥接：findMessage 只在「第一次」返回 msg_id，后面返回 null ──
let findCalls = 0;
const sent = [];
let nextMatch = { msgId: 'MSG-A', matchedBy: 'content' };

registerBridge({
  ready: () => true,
  async sendGroup(openid, msg, opts) {
    sent.push({ openid, msg, opts });
    return { ok: true, sent: 1, res: { id: `r${sent.length}` } };
  },
  findMessage() {
    findCalls += 1;
    const m = nextMatch;
    nextMatch = null; // 只有第一条能配上
    return m;
  },
  pending: () => 0,
  recent: () => [],
});

const GROUP = '799048038'; // 配置里存在的群
const freshTrigger = (content) => ({ groupId: GROUP, content, time: Date.now() });

// ── 场景 1：一次指令 → 连续 5 条回复 ─────────────────────
console.log('\n场景 1：同一条触发消息复用 msg_id（上限 5 条）');
const t1 = freshTrigger('#渡劫-复用测试');
const r1 = await tryOfficialSend(t1, '第1道雷劫');
check('第 1 条走被动回复', r1.handled === true && r1.passive === true, JSON.stringify(r1));
check('第 1 条真的调用了 findMessage', findCalls === 1, `findCalls=${findCalls}`);

for (let i = 2; i <= 5; i += 1) {
  const r = await tryOfficialSend(t1, `第${i}道雷劫`);
  check(`第 ${i} 条仍走被动回复`, r.handled === true && r.passive === true, JSON.stringify(r));
}
check('第 2~5 条没有再查缓存', findCalls === 1, `findCalls=${findCalls}`);
check('前 5 条都用同一个 msg_id', sent.slice(0, 5).every(s => s.opts.msgId === 'MSG-A'), JSON.stringify(sent.map(s => s.opts)));
check('前 5 条都标记为 passive', sent.slice(0, 5).every(s => s.opts.passive === true));

// ── 场景 2：第 6 条超出 5 条上限 → 转主动消息 ────────────
console.log('\n场景 2：第 6 条超出 5 条上限');
const before = sent.length;
const findBefore = findCalls;
const r6 = await tryOfficialSend(t1, '第6道雷劫');
check('第 6 条不再复用被动', r6.passive === false, JSON.stringify(r6));
check('第 6 条改走主动消息（allowActive）', r6.handled === true, JSON.stringify(r6));
check('第 6 条确实发出去了', sent.length === before + 1, `sent=${sent.length}`);
check('第 6 条不带 msg_id', sent.at(-1).opts.msgId === '', JSON.stringify(sent.at(-1).opts));
check('第 6 条标记为非被动', sent.at(-1).opts.passive === false);
// 触发消息的额度用光后，再查缓存拿到的还是同一个 msg_id，所以直接跳过查询（省掉 matchWait 的 1.2s 空等）
check('额度用完后不再白查缓存', findCalls === findBefore, `findCalls ${findBefore}→${findCalls}`);

// ── 场景 3：新的触发消息不受旧会话影响 ───────────────────
console.log('\n场景 3：不同触发消息互不干扰');
nextMatch = { msgId: 'MSG-B', matchedBy: 'content' };
const t2 = freshTrigger('#渡劫-另一场');
const rb1 = await tryOfficialSend(t2, '另一场第1道');
const rb2 = await tryOfficialSend(t2, '另一场第2道');
check('新会话第 1 条用新 msg_id', sent.at(-2).opts.msgId === 'MSG-B', JSON.stringify(sent.at(-2).opts));
check('新会话第 2 条复用新 msg_id', sent.at(-1).opts.msgId === 'MSG-B', JSON.stringify(sent.at(-1).opts));
check('两条都成功', rb1.handled && rb2.handled);

// ── 场景 4：超过 5 分钟窗口后不再复用 ────────────────────
console.log('\n场景 4：触发消息超过 5 分钟窗口');
nextMatch = { msgId: 'MSG-C', matchedBy: 'content' };
const oldTrigger = { groupId: GROUP, content: '#渡劫-超时测试', time: Date.now() - 301 * 1000 };
const rc1 = await tryOfficialSend(oldTrigger, '超时第1条');
check('超时会话首条仍可发（配置在窗口外）', rc1.handled === true, JSON.stringify(rc1));
nextMatch = null;
const rc2 = await tryOfficialSend(oldTrigger, '超时第2条');
check('第二条不再复用旧 msg_id', rc2.passive === false, JSON.stringify(rc2));
check('超窗口后转主动消息', rc2.handled === true && sent.at(-1).opts.msgId === '', JSON.stringify(rc2));

// ── 场景 5：未配置的群直接放行给协议号 ───────────────────
console.log('\n场景 5：未配置官方代发的群');
const rOther = await tryOfficialSend({ groupId: '123456789', content: '#渡劫', time: Date.now() }, 'x');
check('未配置的群不接管', rOther.handled === false && rOther.reason === 'no-openid', JSON.stringify(rOther));

console.log(fail === 0 ? '\n全部通过' : `\n失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);

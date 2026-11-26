/**
 * 主动消息本地限流自测（离线）
 *
 *   node plugins/zhutianxiuxian1.0/tests/activeLimit.test.mjs
 *
 * 官方限制：每群 20 条/分钟、每群每天 1000 条。
 * 修仙的转世叙事一次会连发十几条，所以本地先按分钟掐一道。
 */
const base = new URL('../', import.meta.url);
globalThis.logger = { info: () => {}, warn: m => console.log('[warn]', String(m).slice(0, 90)), error: () => {}, mark: () => {}, debug: () => {}, green: s => s };

let sent = 0;
globalThis[Symbol.for('trss.qqbot.bridge')] = {
  ready: () => true,
  findMessage: () => null,
  sendGroup: async () => { sent += 1; return { ok: true, res: { id: 'X' } }; },
};

const { tryOfficialActive, getSettings } = await import(new URL('model/officialReply.js', base));

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

const cfg = getSettings();
const limit = cfg.activePerMinute;
check('限流配置已加载', limit >= 1, String(limit));

// 连续发 limit + 3 条：前 limit 条走官方，后面回退
const results = [];
for (let i = 0; i < limit + 3; i += 1) results.push(await tryOfficialActive('799048038', `第${i}条`));

const handled = results.filter(r => r.handled).length;
const rejected = results.filter(r => !r.handled && r.reason === 'local-rate-limit').length;
check(`前 ${limit} 条走官方`, handled === limit, JSON.stringify({ handled, limit }));
check('超出部分回退协议号', rejected === 3, String(rejected));
check('官方实际只发了 limit 条', sent === limit, String(sent));

// 另一个群不受影响
const other = await tryOfficialActive('835576891', '别的群');
check('其它群独立计桶', other.handled === true || other.reason === 'no-openid', JSON.stringify(other));

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);

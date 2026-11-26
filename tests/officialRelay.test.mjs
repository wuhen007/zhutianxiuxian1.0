import fs from 'node:fs';
const logs = [];
globalThis.logger = { info: m => logs.push(m), warn: m => logs.push('WARN ' + m), error: m => logs.push('ERR ' + m), mark: () => {}, debug: () => {}, green: s => s };

const base = new URL('../', import.meta.url);
const { installTextToImageHook, resetTextToImageState } = await import(new URL('model/textToImage.js', base));

const KEY = Symbol.for('trss.qqbot.bridge');
let sentViaOfficial = [];
let findResult = null;
let sendResult = { ok: true, res: { message_id: 'OFFICIAL_1' } };

globalThis[KEY] = {
  ready: () => true,
  findMessage: () => findResult,
  sendGroup: async (openid, msg, opts) => { sentViaOfficial.push({ openid, msg, opts }); return sendResult; },
};

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail++; };
const mkEvent = (over = {}) => {
  const rec = [];
  return {
    rec, isGroup: true, group_id: '799048038', user_id: '10001',
    msg: '#合成九彩神金', self_id: '2898525159',
    reply: async (msg, quote) => { rec.push({ msg, quote }); return { message_id: 'P1' }; },
    ...over,
  };
};

// 1. 有 msg_id → 走官方，协议号不动
let e = mkEvent();
installTextToImageHook(e);
sentViaOfficial = []; findResult = { msgId: 'MID_TRIGGER' };
await e.reply('材料不足：需要 仙泪绿金 x1');
check('命中 msg_id 走官方', sentViaOfficial.length === 1 && e.rec.length === 0, JSON.stringify({ o: sentViaOfficial.length, p: e.rec.length }));
check('带上 msg_id 用被动回复', sentViaOfficial[0]?.opts?.msgId === 'MID_TRIGGER' && sentViaOfficial[0]?.opts?.passive === true, JSON.stringify(sentViaOfficial[0]?.opts));
check('发到正确的群 openid', sentViaOfficial[0]?.openid === '0C330839BAA9D1CA503743835EBD8E20');

// 2. 拿不到 msg_id → allowActive 开着就发主动消息，关着就回退协议号。两条路只能走一条
e = mkEvent(); installTextToImageHook(e);
sentViaOfficial = []; findResult = null;
await e.reply('合成成功，获得仙泪绿金 x1');
const activePath = sentViaOfficial.length === 1 && e.rec.length === 0 && sentViaOfficial[0]?.opts?.passive === false;
const fallbackPath = sentViaOfficial.length === 0 && e.rec.length === 1;
check('无 msg_id 时走主动消息或回退协议号（不重复发送）', activePath || fallbackPath, JSON.stringify({ p: e.rec.length, o: sentViaOfficial.length }));

// 3. 官方报错且一条没发出去 → 回退协议号
e = mkEvent(); installTextToImageHook(e);
sentViaOfficial = []; findResult = { msgId: 'MID_TRIGGER' };
sendResult = { ok: false, sent: 0, error: new Error('40034016 主动消息超限') };
await e.reply('这是一个普通回复');
check('官方失败且未发出 → 协议号补发', e.rec.length === 1, String(e.rec.length));
check('记录了回退原因', logs.some(l => l.includes('回退协议号')), logs.filter(l => l.includes('回退')).join('|'));

// 4. 官方已发出 1 条后失败 → 不回退（防重复）
e = mkEvent(); installTextToImageHook(e);
sentViaOfficial = []; findResult = { msgId: 'MID_TRIGGER' };
sendResult = { ok: false, sent: 1, error: new Error('第二条失败') };
await e.reply('第二条内容');
check('已发出一部分则不再回退', e.rec.length === 0, String(e.rec.length));

// 5. 引用回复交给协议号
e = mkEvent(); installTextToImageHook(e);
sentViaOfficial = []; findResult = { msgId: 'MID_TRIGGER' }; sendResult = { ok: true };
await e.reply('引用回复内容', true);
check('引用回复走协议号', e.rec.length === 1 && sentViaOfficial.length === 0);

// 6. 未配置的群不接管
e = mkEvent({ group_id: '123456789' }); installTextToImageHook(e);
sentViaOfficial = []; findResult = { msgId: 'X' };
await e.reply('别的群的消息');
check('未配置群仍走协议号', e.rec.length === 1 && sentViaOfficial.length === 0);

// 7. 官方来源的事件不代发（防绕回）
e = mkEvent({ self_id: 'qqbot-102133646' }); installTextToImageHook(e);
sentViaOfficial = []; findResult = { msgId: 'X' };
await e.reply('官方自己发的内容');
check('官方来源事件不代发', e.rec.length === 1 && sentViaOfficial.length === 0);

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);

/**
 * 身份绑定自测（离线）
 *   node plugins/zhutianxiuxian1.0/tests/accountBind.test.mjs
 *
 * 覆盖：绑定成功 / 名号不符 / 缺名号 / QQ 被他人占用 / 换绑被拒 / 解绑 / 状态查询 /
 *      协议号侧静默（不抢消息）。
 */
import fs from 'node:fs';
import path from 'node:path';

const stubLogger = { info: () => {}, warn: () => {}, error: () => {}, mark: () => {}, debug: () => {}, green: s => s };
globalThis.logger = stubLogger;
globalThis.segment = { at: q => ({ type: 'at', qq: q }), image: f => ({ type: 'image', file: f }) };

const base = new URL('../', import.meta.url);
const { AccountBind } = await import(new URL('apps/User/AccountBind.js', base));
const { __PATH } = await import(new URL('model/xiuxian.js', base));
const identity = await import(new URL('model/identityMap.js', base));

const MAP_FILE = path.join(__PATH.data_path, 'identity_map.json');
const BACKUP = `${MAP_FILE}.test-backup`;

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

// ── 准备：备份真实映射表，挑一个真存档做样本 ──────────────────
if (fs.existsSync(BACKUP)) fs.rmSync(BACKUP);
if (fs.existsSync(MAP_FILE)) fs.copyFileSync(MAP_FILE, BACKUP);
const files = fs.readdirSync(__PATH.player_path).filter(f => f.endsWith('.json'));
if (!files.length) { console.log('没有玩家存档，跳过'); process.exit(0); }
const sampleQQ = files[0].replace('.json', '');
const sampleName = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, files[0]), 'utf8')).名号 || '';
console.log(`样本存档：${sampleQQ}（名号 ${sampleName}）`);

// 从干净状态开始
if (fs.existsSync(MAP_FILE)) fs.rmSync(MAP_FILE);

const inst = new AccountBind();
const evt = (over = {}) => {
  const sent = [];
  return {
    sent,
    self_id: 'qqbot-102133646',
    user_id: 'OPENID_A',
    group_id: '799048038',
    isGroup: true,
    msg: '',
    reply: async m => { sent.push(String(m)); return { message_id: 'R1' }; },
    ...over,
  };
};
const run = async (fnc, e) => { const r = await inst[fnc](e); return { r, text: String(e.sent.at(-1) || '') }; };

// 1. 协议号通道静默（不能抢消息，否则和官方通道各回一次）
let e = evt({ self_id: '2898525159', user_id: '2898525159', msg: `#修仙绑定 ${sampleQQ} ${sampleName}` });
let out = await run('bind', e);
check('协议号侧返回 false', out.r === false, JSON.stringify(out.r));
check('协议号侧不回复', e.sent.length === 0, JSON.stringify(e.sent));

// 2. 缺名号 → 提示补名号
e = evt({ msg: `#修仙绑定 ${sampleQQ}` });
out = await run('bind', e);
check('缺名号给提示', out.text.includes('带上名号'), out.text);

// 3. 名号不符 → 拒绝
e = evt({ msg: `#修仙绑定 ${sampleQQ} 绝对不是这个名字` });
out = await run('bind', e);
check('名号不符被拒', out.text.includes('名号对不上'), out.text);
check('名号不符不落库', identity.countBindings() === 0, String(identity.countBindings()));

// 4. 正常绑定
e = evt({ msg: `#修仙绑定 ${sampleQQ} ${sampleName}` });
out = await run('bind', e);
check('绑定成功', out.text.includes('成功'), out.text);
check('落库 1 条', identity.countBindings() === 1, String(identity.countBindings()));
check('按 openid 能查到 QQ', identity.getBinding('OPENID_A')?.qq === sampleQQ, JSON.stringify(identity.getBinding('OPENID_A')));

// 5. 重复绑同一个号 → 幂等放行
e = evt({ msg: `#修仙绑定 ${sampleQQ} ${sampleName}` });
out = await run('bind', e);
check('重复绑定仍然成功', out.text.includes('成功'), out.text);

// 6. 另一个 openid 抢同一个 QQ → 拒绝
e = evt({ user_id: 'OPENID_B', msg: `#修仙绑定 ${sampleQQ} ${sampleName}` });
out = await run('bind', e);
check('他人冒领被拒', out.text.includes('已被别人绑定'), out.text);

// 7. 同一 openid 换绑另一个号 → 提示先解绑
const other = files.find(f => f.replace('.json', '') !== sampleQQ);
if (other) {
  const otherQQ = other.replace('.json', '');
  const otherName = JSON.parse(fs.readFileSync(path.join(__PATH.player_path, other), 'utf8')).名号 || '';
  e = evt({ msg: `#修仙绑定 ${otherQQ} ${otherName}` });
  out = await run('bind', e);
  check('换绑需先解绑', out.text.includes('先发 #修仙解绑'), out.text);
}

// 8. 状态查询
e = evt({ msg: '#修仙绑定状态' });
out = await run('status', e);
check('状态显示已绑定', out.text.includes(sampleQQ) && out.text.includes('OPENID_A'), out.text);

// 9. 解绑
e = evt({ msg: '#修仙解绑' });
out = await run('unbind', e);
check('解绑成功', out.text.includes('已解除'), out.text);
check('解绑后清空', identity.countBindings() === 0, String(identity.countBindings()));

// 10. 未绑定再解绑
e = evt({ msg: '#修仙解绑' });
out = await run('unbind', e);
check('未绑定提示', out.text.includes('还没有绑定过'), out.text);

// 11. 官方通道不能指定解绑别人
e = evt({ msg: `#修仙解绑 ${sampleQQ}` });
out = await run('unbind', e);
check('官方侧不能解绑他人', out.text.includes('只能解绑自己'), out.text);

// 12. 协议号侧主人解绑任意 QQ（先造一条记录）
identity.bindAccount('OPENID_C', sampleQQ, { name: sampleName });
e = evt({ self_id: '2898525159', user_id: '504010020', msg: `#修仙解绑 ${sampleQQ}` });
out = await run('unbind', e);
check('主人可解绑指定 QQ', out.text.includes('已解除') && identity.countBindings() === 0, out.text);

// 13. 全角数字的 QQ 号（输入法切到全角时很常见）
const toFull = v => String(v).replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
e = evt({ user_id: 'OPENID_D', msg: `#修仙绑定 ${toFull(sampleQQ)} ${sampleName}` });
out = await run('bind', e);
check('全角数字 QQ 号能解析', out.text.includes('成功'), out.text);
check('落库的是半角 QQ', identity.getBinding('OPENID_D')?.qq === sampleQQ, JSON.stringify(identity.getBinding('OPENID_D')));
identity.unbindByOpenid('OPENID_D');

// 14. 全角名号（名号里含数字/字母时才可构造）
const fullName = toFull(sampleName);
if (fullName !== sampleName) {
  e = evt({ user_id: 'OPENID_E', msg: `#修仙绑定 ${sampleQQ} ${fullName}` });
  out = await run('bind', e);
  check('全角名号也能通过校验', out.text.includes('成功'), `${sampleName} vs ${fullName} → ${out.text}`);
  identity.unbindByOpenid('OPENID_E');
} else {
  console.log('  ok  全角名号（样本名号不含数字字母，跳过）');
}

// ── 收尾：还原映射表 ──────────────────────────────────────
if (fs.existsSync(MAP_FILE)) fs.rmSync(MAP_FILE);
if (fs.existsSync(BACKUP)) { fs.copyFileSync(BACKUP, MAP_FILE); fs.rmSync(BACKUP); }

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);

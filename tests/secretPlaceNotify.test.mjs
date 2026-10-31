/**
 * 秘境通知路由自测（离线）
 *   node plugins/zhutianxiuxian1.0/tests/secretPlaceNotify.test.mjs
 */
const base = new URL('../', import.meta.url);
const { getSecretPlaceSummaryNotificationRoute, sendSecretPlaceNotification } =
  await import(new URL('model/secretPlaceNotification.js', base));

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

// ① 聚合 key 不含 botId
const a = getSecretPlaceSummaryNotificationRoute({ qq: '1001', qq_group: '799048038', notify_bot_id: '111' });
const b = getSecretPlaceSummaryNotificationRoute({ qq: '1002', qq_group: '799048038', notify_bot_id: '222' });
check('同群不同 bot 合并为一批', a.key === b.key, `${a.key} vs ${b.key}`);
check('不同群不合并', a.key !== getSecretPlaceSummaryNotificationRoute({ qq: '1001', qq_group: '835576891' }).key);
check('key 里不再出现 botId', !a.key.includes('111'), a.key);
check('route 带 type 字段', a.type === 'group' && b.type === 'group', String(a.type));
check('私聊与群不合并', a.key !== getSecretPlaceSummaryNotificationRoute({ qq: '1001' }).key);

// ③ 主 bot 走主实例（才能命中官方代发接管）
const calls = [];
const makeSender = tag => ({
  pickGroup: id => ({ sendMsg: async () => { calls.push([`${tag}-group`, String(id)]); return { retcode: 0 }; } }),
  pickUser: id => ({ sendMsg: async () => { calls.push([`${tag}-user`, String(id)]); return { retcode: 0 }; } }),
});
const botRoot = { uin: ['2898525159'], ...makeSender('main') };
botRoot['2898525159'] = makeSender('main-adapter'); // 主号对应的适配器
botRoot['999999999'] = makeSender('other-adapter'); // 另一个号

// 用 route 生成的 action 调用（与 msgTask.js 的真实用法一致）
const run = async entry => {
  const route = getSecretPlaceSummaryNotificationRoute(entry);
  return sendSecretPlaceNotification(route.action, route.playerId, '图', { botRoot });
};

await run({ qq: '1001', qq_group: '799048038', notify_bot_id: '2898525159' });
check('主 bot + 群 → 走主实例（能命中官方接管）', calls.at(-1)[0] === 'main-group', JSON.stringify(calls.at(-1)));

await run({ qq: '1001', qq_group: '799048038', notify_bot_id: '999999999' });
check('非主 bot + 群 → 仍用该适配器', calls.at(-1)[0] === 'other-adapter-group', JSON.stringify(calls.at(-1)));

await run({ qq: '1001', notify_bot_id: '2898525159' });
check('私聊仍走原 bot', calls.at(-1)[0] === 'main-adapter-user', JSON.stringify(calls.at(-1)));

await run({ qq: '1001', qq_group: '799048038' });
check('无 notify_bot_id 的老条目走主实例', calls.at(-1)[0] === 'main-group', JSON.stringify(calls.at(-1)));

const before = calls.length;
await run({ qq: '1001', qq_group: '799048038', notify_bot_id: '2898525159' });
check('主号群消息只发一次（不重复）', calls.length === before + 1, `${before} → ${calls.length}: ${JSON.stringify(calls.at(-1))}`);

// 发送失败仍返回 false
const badRoot = { uin: [], pickGroup: () => ({ sendMsg: async () => ({ retcode: 1200, message: '无法获取用户信息' }) }) };
const bad = await sendSecretPlaceNotification({ notify_type: 'group', notify_target: '799048038' }, '1001', 'x', { botRoot: badRoot, logger: { error: () => {} } });
check('失败返回 false', bad === false, String(bad));

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);

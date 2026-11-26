/**
 * 指令容错自测（离线）
 *   node plugins/zhutianxiuxian1.0/tests/hashSpace.test.mjs
 *
 * 验证：`# 修仙状态`（井号后空格）、`＃修仙状态`（全角）都能归一成 `#修仙状态`，
 * 普通消息不受影响。
 */
const base = new URL('../', import.meta.url);
const { normalizeHashSpace, wrapDealEvent } = await import(new URL('model/hashSpaceFix.js', base));

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

// ── 纯函数 ──────────────────────────────────────────────
const cases = [
  ['#修仙状态', '#修仙状态', '正常指令不变'],
  ['# 修仙状态', '#修仙状态', '井号后一个空格'],
  ['#  修仙状态', '#修仙状态', '井号后多个空格'],
  [' ＃修仙状态', '#修仙状态', '前导空格 + 全角井号'],
  ['＃ 修仙状态', '#修仙状态', '全角井号 + 空格'],
  ['＃修仙状态', '#修仙状态', '全角井号（无空格）'],
  ['#修仙状态 ', '#修仙状态', '尾部空格'],
  ['＃修仙状态　', '#修仙状态', '全角井号 + 尾部全角空格'],
  ['  # 修仙状态', '#修仙状态', '前导空格 + 井号 + 空格'],
  ['今天天气不错', '今天天气不错', '普通消息不变'],
  ['#1 号玩家', '#1 号玩家', '井号后不是空格时不变'],
  ['出关', '出关', '无井号不变'],
  ['', '', '空串不变'],
];
for (const [input, want, name] of cases) {
  const got = normalizeHashSpace(input);
  check(name, got === want, `输入「${input}」→「${got}」，期望「${want}」`);
}
check('null 安全', normalizeHashSpace(null) === '' && normalizeHashSpace(undefined) === '');

// ── 包装 loader.dealEvent ───────────────────────────────
const fake = {
  calls: 0,
  // 模拟真实现：先把消息段拼进 e.msg
  dealEvent(e) {
    this.calls += 1;
    e.msg = (e.msg || '') + '拼好的文本';
  },
};
check('桩 loader 包装成功', wrapDealEvent(fake) === true);
check('重复包装不报错', wrapDealEvent(fake) === true);

const e1 = { msg: '# 修仙状态' };
fake.dealEvent(e1, {});
check('包装后 e.msg 被归一', e1.msg === '#修仙状态拼好的文本', e1.msg);
check('原实现只调用一次', fake.calls === 1, String(fake.calls));
// raw_message 存的是「归一前」的文本（即 dealEvent 拼完、还没去掉空格的那一版）
check('保留归一前的原文到 raw_message', e1.raw_message === '# 修仙状态拼好的文本', String(e1.raw_message));

const e2 = { msg: '今天天气不错' };
fake.dealEvent(e2, {});
check('普通消息不被改动', e2.msg === '今天天气不错拼好的文本', e2.msg);
check('普通消息不写 raw_message', e2.raw_message === undefined, String(e2.raw_message));

const e3 = { msg: '＃ 修仙状态' };
fake.dealEvent(e3, {});
check('全角井号也能归一', e3.msg === '#修仙状态拼好的文本', e3.msg);

check('非法目标不抛错', wrapDealEvent(null) === false && wrapDealEvent({}) === false);

// ── 与真实指令正则联调 ──────────────────────────────────
const regs = [/^#修仙状态$/, /^#出关$/, /^#修仙绑定\s*\d{5,12}/];
const hits = ['# 修仙状态', '＃出关', ' # 修仙绑定 504010020 无痕']
  .map(t => regs.some(r => r.test(normalizeHashSpace(t))));
check('归一后能命中修仙指令正则', hits.every(Boolean), JSON.stringify(hits));

console.log(fail ? `\n${fail} 项失败` : '\n全部通过');
process.exit(fail ? 1 : 0);

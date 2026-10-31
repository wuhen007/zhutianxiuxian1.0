/**
 * 控制台日志净化自测（离线）
 *   node plugins/zhutianxiuxian1.0/tests/consoleSafe.test.mjs
 *
 * 验证：emoji 等非 BMP 字符在写 stdout/stderr 之前被降级成 BMP 符号，
 * 中文、ASCII、业务字符串不受影响，且重复安装不重复包装。
 */
const base = new URL('../', import.meta.url);
const { toConsoleSafe, installConsoleSafe } = await import(new URL('model/consoleSafe.js', base));

let fail = 0;
const check = (n, c, e = '') => { console.log(`${c ? '  ok  ' : '  FAIL'} ${n} ${c ? '' : e}`); if (!c) fail += 1; };

// ── 纯函数：字符降级 ─────────────────────────────────────
const cases = [
  ['当前时代: 绝灵时代 💀', '当前时代: 绝灵时代 ☠', '已收录 emoji 换成等价符号'],
  ['🌟 服务器已启动', '★ 服务器已启动', '星标 emoji'],
  ['📍 访问地址', '◆ 访问地址', '定位 emoji'],
  ['🦄 冷门符号', ' 冷门符号', '未收录 emoji 直接去掉'],
  ['中文、English、123', '中文、English、123', 'BMP 字符原样保留'],
  ['「引号」与　全角空格', '「引号」与　全角空格', '全角标点保留'],
  ['', '', '空串'],
  ['⚔ 本来就是 BMP', '⚔ 本来就是 BMP', 'BMP 符号不动'],
  ['混合 🚀 与 🌊 与 ❄', '混合 ↑ 与 ≈ 与 ❄', '一行多个 emoji'],
  ['\u{1F600}\u{1F601}\u{1F602}', '', '连续多个未收录 emoji'],
  ['a💀b', 'a☠b', 'emoji 夹在中间'],
  // ── ANSI 转义剥离 ──
  ['\x1b[32m[INFO]\x1b[39m 消息', '[INFO] 消息', '剥掉 SGR 颜色码'],
  ['\x1b[1;31m错误\x1b[0m', '错误', '剥掉组合样式'],
  ['\x1b[38;5;208m橙色\x1b[0m', '橙色', '剥掉 256 色'],
  ['\x1b[?25h\x1b[0K文本', '文本', '剥掉光标与清行序列'],
  ['\x1b]0;标题\x07正文', '正文', '剥掉 OSC 设置标题'],
  ['\x1b[32m[21:48:34][INFO]\x1b[39m\x1b[34m[群]\x1b[39m 内容', '[21:48:34][INFO][群] 内容', '还原真实日志行'],
  ['\x1b[32m💀 时代\x1b[0m', '☠ 时代', '颜色与 emoji 同时处理'],
];
for (const [input, want, name] of cases) {
  const got = toConsoleSafe(input);
  check(name, got === want, `期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`);
}

// ── 纯函数：非字符串透传 ─────────────────────────────────
check('null 原样返回', toConsoleSafe(null) === null);
check('undefined 原样返回', toConsoleSafe(undefined) === undefined);
const num = 42;
check('数字原样返回', toConsoleSafe(num) === 42);

// ── 幂等 ────────────────────────────────────────────────
check('首次安装返回 false（模块加载时已自动安装）', installConsoleSafe() === false);
const writeAfterFirst = process.stdout.write;
installConsoleSafe();
check('重复安装不再包装', process.stdout.write === writeAfterFirst);

// ── 端到端：真实子进程走 stdout / stderr ─────────────────
const { spawnSync } = await import('node:child_process');
const entry = new URL('model/consoleSafe.js', base).href;
const script = `
import { installConsoleSafe } from ${JSON.stringify(entry)};
installConsoleSafe();
console.log('\\x1b[32m[21:48:34][INFO]\\x1b[39m 当前时代: 绝灵时代 💀 进度 10%');
console.error('\\x1b[31m错误\\x1b[39m 🚀 发生');
`;
const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
const out = run.stdout ?? '';
const err = run.stderr ?? '';
const hasNonBmp = s => /[\u{10000}-\u{10FFFF}]/u.test(s);

check('子进程 stdout 无 ESC 转义', !out.includes('\x1b'), JSON.stringify(out));
check('子进程 stderr 无 ESC 转义', !err.includes('\x1b'), JSON.stringify(err));
check('子进程 stdout 颜色码被剥干净', !out.includes('[32m') && !out.includes('[39m'), JSON.stringify(out));
check('子进程 stdout 日志内容保留', out.includes('[INFO]') && out.includes('进度 10%'), JSON.stringify(out));
check('子进程 stdout 无替换字符 U+FFFD', !out.includes('\uFFFD'), JSON.stringify(out));
check('子进程 stdout 无非 BMP 字符', !hasNonBmp(out), JSON.stringify(out));
check('子进程 stdout 中文完好', out.includes('当前时代: 绝灵时代'), JSON.stringify(out));
check('子进程 stdout emoji 已降级', out.includes('☠'), JSON.stringify(out));
check('子进程 stderr 无替换字符', !err.includes('\uFFFD'), JSON.stringify(err));
check('子进程 stderr 无非 BMP 字符', !hasNonBmp(err), JSON.stringify(err));
check('子进程 stderr emoji 已降级', err.includes('↑'), JSON.stringify(err));

console.log(fail === 0 ? '\n全部通过' : `\n失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);

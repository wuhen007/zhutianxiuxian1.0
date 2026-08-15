// 客户端侧兜底过滤:内容回显到 QQ 群前再过滤一次(双保险)。
// 主防护在服务端 worldchat-server/config.js 的 SENSITIVE_WORDS。
// 此处词库较小,部署时请与服务端保持一致/补充。
const WORDS = ['法轮', '违规示例词'];

export function clientFilter(text) {
  let out = String(text == null ? '' : text);
  for (const w of WORDS) {
    if (!w) continue;
    try {
      const re = new RegExp(w, 'gi');
      out = out.replace(re, '*'.repeat(Math.max(1, String(w).length)));
    } catch {
      /* 非法正则跳过 */
    }
  }
  return out;
}

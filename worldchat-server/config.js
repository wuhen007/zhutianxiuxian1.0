// 云端中转服务器配置
// 生产环境请用环境变量覆盖: WC_PORT / WC_SECRET
export const CONFIG = {
  // 监听端口(WebSocket 与 /api/status 共用)
  PORT: Number(process.env.WC_PORT) || 8080,

  // 共享密钥:所有客户端与服务器共用同一 secret 做 HMAC 鉴权/签名。
  // 生产请改成足够随机的长字符串,并通过环境变量 WC_SECRET 注入,不要写死在仓库。
  SECRET: process.env.WC_SECRET || 'zhutian-worldchat-dev-secret-change-me',

  // 每个 server_id 每秒最多上送条数(防刷屏风暴)
  MAX_PUB_PER_SEC: 5,

  // 查询默认/最大返回条数
  QUERY_LIMIT_DEFAULT: 10,
  QUERY_LIMIT_MAX: 50,

  // 消息落盘文件(重启不丢,最多保留 1000 条)
  STORAGE_FILE: './messages.json',

  // 封禁名单落盘文件(重启不丢)。被封 server_id 握手即拒、已连接则断开。
  BANNED_FILE: './banned.json',

  // 管理面板/封禁接口鉴权令牌。生产请用环境变量 WC_ADMIN_TOKEN 注入强随机串,不要留默认值。
  ADMIN_TOKEN: process.env.WC_ADMIN_TOKEN || 'change-me-admin-token',

  // 本地敏感词过滤(支持正则)。请自行完善合规词库,服务器与客户端双保险。
  // 注意:本地词库只是基础防护,不能替代完整内容安全方案。
  SENSITIVE_WORDS: [
    // 示例占位,部署前请替换为真实合规词表
    '法轮',
    '违规示例词'
  ]
};

// 云端中转服务器配置。生产环境全部通过环境变量或本地凭据文件注入。
export const CONFIG = {
  HOST: process.env.WC_HOST || '127.0.0.1',
  PORT: Number(process.env.WC_PORT ?? 8080),
  CLIENTS_FILE: process.env.WC_CLIENTS_FILE || './clients.json',
  STORAGE_FILE: process.env.WC_STORAGE_FILE || './messages.json',
  BANNED_FILE: process.env.WC_BANNED_FILE || './banned.json',
  ADMIN_TOKEN: process.env.WC_ADMIN_TOKEN || '',
  ENROLLMENT_TOKEN: process.env.WC_ENROLLMENT_TOKEN || '',
  MESSAGE_LIMIT: 1000,
  QUERY_LIMIT_DEFAULT: 10,
  QUERY_LIMIT_MAX: 100,
  MAX_PAYLOAD_BYTES: 16 * 1024,
  AUTH_WINDOW_MS: 60_000,
  MAX_PUB_PER_MINUTE: 30,
  USER_COOLDOWN_MS: 5_000,
  MAX_REGISTRATIONS_PER_MINUTE: 20,
  SENSITIVE_WORDS: ['法轮', '违规示例词'],
};

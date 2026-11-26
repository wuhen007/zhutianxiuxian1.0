import { installConsoleSafe } from './model/consoleSafe.js';
// 面板日志净化：MCSM 的终端通道会把 emoji 等 4 字节字符吞成 �，
// 这里在 stdout/stderr 层统一降级为 BMP 符号。只影响控制台，不影响 QQ 消息与日志文件。
installConsoleSafe();

import { appsOut } from './robot/index.js';
const apps = await appsOut('apps').then(req => {
  logger.info(`zhutianxiuxian1.0 start ~`);
  return req;
});
export { apps };

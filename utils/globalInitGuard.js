let running = false;

// ponytail: process-local maintenance lock; use Redis ownership if the bot runs in multiple processes.
export function beginGlobalInit() {
  if (running) return false;
  running = true;
  return true;
}

export function endGlobalInit() {
  running = false;
}

export function isGlobalInitRunning() {
  return running;
}

export function assertGlobalInitIdle() {
  if (running) throw new Error('诸天初始化进行中，暂不允许写入玩家数据');
}

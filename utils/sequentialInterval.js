function delay(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function runSequentialInterval(task, options = {}) {
  if (typeof task !== 'function') throw new TypeError('Sequential interval task must be a function');

  const intervalMs = delay(options.intervalMs, 0);
  const initialDelayMs = delay(options.initialDelayMs, intervalMs);
  const shouldUnref = options.unref !== false;
  let settled = false;
  let timer = null;
  let resolveCompletion;
  let rejectCompletion;

  const completion = new Promise((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const finish = value => {
    if (settled) return false;
    settled = true;
    if (timer) clearTimeout(timer);
    resolveCompletion(value);
    return true;
  };
  const fail = error => {
    if (settled) return false;
    settled = true;
    if (timer) clearTimeout(timer);
    rejectCompletion(error);
    return true;
  };
  const schedule = timeout => {
    if (settled) return;
    timer = setTimeout(tick, timeout);
    if (shouldUnref) timer.unref?.();
  };
  const tick = async () => {
    timer = null;
    try {
      await task({ fail, finish });
    } catch (error) {
      fail(error);
    }
    if (!settled) schedule(intervalMs);
  };

  schedule(initialDelayMs);
  return completion;
}

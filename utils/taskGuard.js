const runningTasks = new Set();

// ponytail: process-local lock; use Redis locks only if tasks run in multiple Yunzai processes.
export async function runTaskOnce(name, task) {
  if (runningTasks.has(name)) return false;

  runningTasks.add(name);
  try {
    return await task();
  } finally {
    runningTasks.delete(name);
  }
}

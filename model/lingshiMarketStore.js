import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomically } from '../utils/atomicJson.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { advanceMarket, createMarket, validateMarket } from './lingshiMarket.js';

const marketFile = fileURLToPath(new URL('../data/lingshi-market.json', import.meta.url));

// ponytail: 单进程全服串行；多机器人共享同一存档时再换成跨进程锁。
export function withLingshiMarket(task, { now = Date.now(), create = true } = {}) {
  return withPlayerMutationLock('world:lingshi-market', async () => {
    let market;
    try {
      market = validateMarket(JSON.parse(fs.readFileSync(marketFile, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (!create) return null;
      market = createMarket(now);
      fs.mkdirSync(fileURLToPath(new URL('../data/', import.meta.url)), { recursive: true });
      writeJsonAtomically(marketFile, market);
    }
    const advanced = advanceMarket(market, now);
    if (advanced.changed) writeJsonAtomically(marketFile, advanced.state);
    // 先持久化行情再处理玩家，避免重启后用旧价重算同一笔持仓。
    return task(advanced.state);
  });
}

import fs from 'fs';
import { __PATH, Read_player, Write_player } from '../../model/xiuxian.js';
import {
  restoreJuelingLifespan,
  suppressJuelingLifespan,
} from '../../model/juelingLifespan.js';
import { withPlayerMutationLock } from '../../utils/playerMutationLock.js';

const ERA_LIFESPAN_LOCK = 'system:jueling-lifespan';

export function withJuelingEraLock(task) {
  return withPlayerMutationLock(ERA_LIFESPAN_LOCK, task);
}

function withPlayerLocks(playerIds, task, index = 0) {
  if (index >= playerIds.length) return task();
  return withPlayerMutationLock(playerIds[index], () => withPlayerLocks(playerIds, task, index + 1));
}

async function mutateAllPlayerLifespans(mutator, actionName, afterApply) {
  return withJuelingEraLock(async () => {
    const playerIds = fs.readdirSync(__PATH.player_path)
      .filter(file => file.endsWith('.json'))
      .map(file => file.slice(0, -5))
      .sort();

    return withPlayerLocks(playerIds, async () => {
      const changes = [];
      for (const playerId of playerIds) {
        const player = await Read_player(playerId);
        const previous = structuredClone(player);
        if (mutator(player)) changes.push({ playerId, player, previous });
      }

      const written = [];
      try {
        for (const change of changes) {
          await Write_player(change.playerId, change.player, { trackDailyTask: false });
          written.push(change);
        }
        if (afterApply) await afterApply();
        return changes.length;
      } catch (error) {
        const rollbackErrors = [];
        for (const change of written.reverse()) {
          try {
            await Write_player(change.playerId, change.previous, { trackDailyTask: false });
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length) {
          throw new AggregateError([error, ...rollbackErrors], `${actionName}失败，且部分玩家回滚失败`);
        }
        throw new Error(`${actionName}失败，玩家数据已回滚`, { cause: error });
      }
    });
  });
}

export function suppressAllPlayerLifespans(afterApply) {
  return mutateAllPlayerLifespans(suppressJuelingLifespan, '寿元压制', afterApply);
}

export function restoreAllPlayerLifespans(afterApply) {
  return mutateAllPlayerLifespans(restoreJuelingLifespan, '寿元恢复', afterApply);
}

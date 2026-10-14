import { getSuiyunEffects } from './suiyun.js';
import { getMemoryEffects } from './memoryPath.js';
import { isItemPermanentlyNonTradeable } from './equipmentTransfer.js';

// Only call for generated loot, never purchases, transfers, withdrawals or refunds.
export function multiplySuiyunLoot(player, item, amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const multiplier = isItemPermanentlyNonTradeable(item) ? 1
    : getSuiyunEffects(player).lootMultiplier * getMemoryEffects(player).lootMultiplier;
  return Math.floor(value * multiplier);
}

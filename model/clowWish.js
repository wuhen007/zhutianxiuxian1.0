export const CLOW_WISH_BATTLE_MULTIPLIER = 0.5;

export function applyClowWishBattleWeakness(player, now = Date.now()) {
  const expiresAt = Math.max(0, Number(player?.库洛牌祈愿虚弱至) || 0);
  if (!player || expiresAt <= now) {
    return { active: false, expiresAt, remainingMs: 0, multiplier: 1, message: '' };
  }

  for (const field of ['攻击', '防御', '速度']) {
    const base = Number(player[field]) || (field === '速度' ? 100 : 1);
    player[field] = Math.max(1, Math.trunc(base * CLOW_WISH_BATTLE_MULTIPLIER));
  }

  return {
    active: true,
    expiresAt,
    remainingMs: expiresAt - now,
    multiplier: CLOW_WISH_BATTLE_MULTIPLIER,
    message: `【库洛牌祈愿·虚弱】愿力反噬尚未消散，攻防速度降低${Math.round((1 - CLOW_WISH_BATTLE_MULTIPLIER) * 100)}%！`,
  };
}

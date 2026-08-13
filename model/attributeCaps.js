import { getRealmAuthorityLevel } from './realmAuthority.js';

function level(value) {
  return Math.max(1, Math.trunc(Number(value) || 1));
}

export function calculateExtraAttributeLimit(player) {
  const tierLimit = current => current <= 41
    ? current * 1_000_000
    : 41_000_000 + (current - 41) * 10_000_000;
  const qi = tierLimit(level(player?.level_id));
  const body = tierLimit(level(player?.Physique_id));
  const secret = level(getRealmAuthorityLevel(player)) * 15_000_000;
  return { qi, body, secret, total: qi + body + secret };
}

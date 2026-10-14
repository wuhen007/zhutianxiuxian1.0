import { hasRealmAuthority } from './realmAuthority.js';
import { getSuiyunEffects } from './suiyun.js';

export const JUELING_ERA_INDEX = 4;
export const JUELING_LIFESPAN_LIMIT = 9999;

export function hasJuelingLifespan(player) {
  return Object.prototype.hasOwnProperty.call(player || {}, '压制寿元');
}

export function shouldSuppressJuelingLifespan(player, eraIndex) {
  return Number(eraIndex) === JUELING_ERA_INDEX && !hasRealmAuthority(player, 18) && !getSuiyunEffects(player).absoluteSpiritImmune;
}

export function suppressJuelingLifespan(player) {
  if (!player) return false;
  if (hasRealmAuthority(player, 18) || getSuiyunEffects(player).absoluteSpiritImmune) return restoreJuelingLifespan(player);
  const lifespan = Number(player.寿元) || 0;
  const wasSuppressed = hasJuelingLifespan(player);
  if (!wasSuppressed) player.压制寿元 = lifespan;
  player.寿元 = Math.min(lifespan, JUELING_LIFESPAN_LIMIT);
  return !wasSuppressed || player.寿元 !== lifespan;
}

export function restoreJuelingLifespan(player) {
  if (!player || !hasJuelingLifespan(player)) return false;
  const trueLifespan = Number(player.压制寿元);
  if (Number.isFinite(trueLifespan)) player.寿元 = trueLifespan;
  delete player.压制寿元;
  return true;
}

export function releaseJuelingLifespanForAuthority(player) {
  return (hasRealmAuthority(player, 18) || getSuiyunEffects(player).absoluteSpiritImmune) && restoreJuelingLifespan(player);
}

export function addJuelingAwareLifespan(player, amount, eraIndex) {
  const added = Math.max(0, Number(amount) || 0);
  if (!shouldSuppressJuelingLifespan(player, eraIndex)) {
    restoreJuelingLifespan(player);
    player.寿元 = (Number(player.寿元) || 0) + added;
    return { added, visibleAdded: added, suppressed: false };
  }

  suppressJuelingLifespan(player);
  const visibleBefore = Number(player.寿元) || 0;
  player.压制寿元 = (Number(player.压制寿元) || 0) + added;
  player.寿元 = Math.min(JUELING_LIFESPAN_LIMIT, visibleBefore + added);
  return {
    added,
    visibleAdded: player.寿元 - visibleBefore,
    suppressed: true,
  };
}

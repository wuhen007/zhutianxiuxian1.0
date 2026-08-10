import {
  Add_najie_thing,
  Add_灵石,
  Add_源石,
  Read_najie,
  Read_player,
} from './xiuxian.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
export { createAuctionId, createSettlingAuction } from './auctionState.js';

function claimKey(auction, step) {
  return `auction:${auction.settlementId || auction.auctionId}:${step}`;
}

function itemArgs(auction) {
  return [
    auction.thing.name,
    auction.thing.class,
    Number(auction.amount) || 1,
    auction.thing.pinji,
    1,
  ];
}

function currencyTools(currency) {
  if (currency === '源石') return { field: '源石', add: Add_源石 };
  return { field: '灵石', add: Add_灵石 };
}

export async function settleAuctionPurchase(auction, { currency = '灵石', sellerId } = {}) {
  const winnerId = String(auction.last_offer_player);
  const price = Math.max(0, Math.trunc(Number(auction.last_price) || 0));
  const chargeKey = claimKey(auction, 'charge');
  const itemKey = claimKey(auction, 'item');
  const { field, add } = currencyTools(currency);

  const paid = await withPlayerMutationLock(winnerId, async () => {
    const player = await Read_player(winnerId);
    const alreadyCharged = Boolean(player._rewardClaims?.[chargeKey]);
    if (!alreadyCharged && (Number(player[field]) || 0) < price) return false;

    await add(winnerId, -price, {
      idempotencyKey: chargeKey,
      applyMingge: false,
    });
    await Add_najie_thing(...[
      winnerId,
      ...itemArgs(auction),
      { idempotencyKey: itemKey },
    ]);
    return true;
  });

  if (!paid) return { ok: false, reason: 'insufficient-funds' };
  if (sellerId) {
    await add(String(sellerId), price, {
      idempotencyKey: claimKey(auction, 'seller-payment'),
      applyMingge: false,
    });
  }
  return { ok: true };
}

export async function reserveAuctionItem(auction) {
  return Add_najie_thing(...[
    String(auction.qq),
    ...itemArgs({ ...auction, amount: -Math.abs(Number(auction.amount) || 1) }),
    { idempotencyKey: claimKey(auction, 'seller-reservation') },
  ]);
}

export async function hasReservedAuctionItem(auction) {
  const najie = await Read_najie(String(auction.qq));
  return Boolean(najie._rewardClaims?.[claimKey(auction, 'seller-reservation')]);
}

export async function refundAuctionItem(auction) {
  return Add_najie_thing(...[
    String(auction.qq),
    ...itemArgs(auction),
    { idempotencyKey: claimKey(auction, 'seller-refund') },
  ]);
}

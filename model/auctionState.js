import { randomUUID } from 'node:crypto';

export function createAuctionId(prefix = 'auction') {
  return `${prefix}:${randomUUID()}`;
}

export function createSettlingAuction(auction, resolution) {
  const auctionId = auction.auctionId || createAuctionId('legacy-auction');
  return {
    ...auction,
    auctionId,
    status: 'settling',
    settlementId: auction.settlementId || auctionId,
    resolution,
    settlingAt: auction.settlingAt || Date.now(),
  };
}

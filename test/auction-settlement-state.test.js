import assert from 'node:assert/strict';
import test from 'node:test';
import { createSettlingAuction } from '../model/auctionState.js';

test('auction settlement state keeps a stable recovery id', () => {
  const first = createSettlingAuction({ auctionId: 'auction:1', last_offer_player: 10 }, 'buyer');
  const resumed = createSettlingAuction(first, 'buyer');

  assert.equal(first.status, 'settling');
  assert.equal(first.settlementId, 'auction:1');
  assert.equal(resumed.settlementId, first.settlementId);
  assert.equal(resumed.settlingAt, first.settlingAt);
});

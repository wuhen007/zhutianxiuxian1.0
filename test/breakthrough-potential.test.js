import test from 'node:test';
import assert from 'node:assert/strict';

import { getBreakthroughPotentialCost } from '../apps/User/breakthroughPotential.js';

test('突破与破体的仙道潜力消耗按当前等级分档', () => {
  assert.equal(getBreakthroughPotentialCost(1), 2);
  assert.equal(getBreakthroughPotentialCost(26), 2);
  assert.equal(getBreakthroughPotentialCost(27), 4);
  assert.equal(getBreakthroughPotentialCost(41), 4);
  assert.equal(getBreakthroughPotentialCost(42), 8);
  assert.equal(getBreakthroughPotentialCost(63), 8);
});

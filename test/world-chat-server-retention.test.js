import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createWorldChatServer,
  pruneTrades,
} from '../worldchat-server/server.js';

test('expired world-chat trades are rolled back once and removed after retention', () => {
  const trades = new Map([
    [
      'OPEN',
      {
        code: 'OPEN',
        status: 'open',
        expires_at: 900,
        seller_server_id: 'seller',
      },
    ],
  ]);
  const expired = [];

  assert.equal(
    pruneTrades(trades, {
      now: 1000,
      retentionMs: 100,
      maxRetained: 10,
      onExpire: (trade) => expired.push(trade.code),
    }),
    true
  );
  assert.deepEqual(expired, ['OPEN']);
  assert.equal(trades.get('OPEN').status, 'expired');
  assert.equal(trades.get('OPEN').closed_at, 1000);

  assert.equal(
    pruneTrades(trades, {
      now: 1050,
      retentionMs: 100,
      maxRetained: 10,
      onExpire: (trade) => expired.push(trade.code),
    }),
    false
  );
  assert.deepEqual(expired, ['OPEN']);

  assert.equal(
    pruneTrades(trades, {
      now: 1100,
      retentionMs: 100,
      maxRetained: 10,
    }),
    true
  );
  assert.equal(trades.size, 0);
});

test('world-chat trade retention caps terminal records without dropping active trades', () => {
  const trades = new Map([
    ['ACTIVE', { code: 'ACTIVE', status: 'open', expires_at: 5000 }],
    ['OLD', { code: 'OLD', status: 'cancelled', closed_at: 100 }],
    ['MIDDLE', { code: 'MIDDLE', status: 'failed', closed_at: 200 }],
    ['NEW', { code: 'NEW', status: 'completed', completed_at: 300 }],
  ]);

  assert.equal(
    pruneTrades(trades, {
      now: 1000,
      retentionMs: 10_000,
      maxRetained: 2,
    }),
    true
  );
  assert.deepEqual([...trades.keys()].sort(), ['ACTIVE', 'MIDDLE', 'NEW']);
});

test('server startup retains recently closed trades after their offer expiry', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'worldchat-retention-'));
  const now = Date.now();
  await fs.writeFile(
    path.join(root, 'trades.json'),
    JSON.stringify([
      {
        code: 'RECENT',
        status: 'completed',
        expires_at: now - 60_000,
        completed_at: now - 1_000,
        closed_at: now - 1_000,
      },
    ])
  );

  const server = createWorldChatServer({
    baseDir: root,
    config: {
      HOST: '127.0.0.1',
      PORT: 0,
      STORAGE_FILE: 'messages.json',
      RAIDS_FILE: 'raids.json',
      TRADES_FILE: 'trades.json',
      BANNED_FILE: 'banned.json',
      CLIENTS_FILE: 'clients.json',
      TRADE_TERMINAL_RETENTION_MS: 60_000,
      TRADE_MAX_RETAINED_TERMINAL: 10,
    },
    logger: { info() {}, warn() {}, error() {} },
  });

  try {
    await server.start();
    assert.deepEqual(
      server.getTrades().map((trade) => trade.code),
      ['RECENT']
    );
  } finally {
    await server.stop();
    await fs.rm(root, { recursive: true, force: true });
  }
});

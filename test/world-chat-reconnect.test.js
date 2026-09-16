import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { WorldChatClient } from '../apps/worldChat/client.js';
import { createRelayTicket } from '../model/endlessWebServer.js';

class Socket extends EventEmitter {
  static OPEN = 1;
  static CONNECTING = 0;
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = Socket.CONNECTING;
    this.sent = [];
  }
  send(raw) { this.sent.push(JSON.parse(raw)); }
  terminate() { this.readyState = 3; }
  close() { this.readyState = 2; }
  authenticate() {
    this.readyState = Socket.OPEN;
    this.emit('open');
    this.emit('message', JSON.stringify({ type: 'WELCOME', ok: true }));
  }
}

function fixture(t, config = {}) {
  const client = new WorldChatClient({
    WebSocket: Socket, persist: false,
    config: {
      enable: false, web_relay_enabled: true, server_id: 'qa_client',
      secret: 'a'.repeat(64), url: 'wss://relay.example', ...config,
    },
  });
  t.after(() => client.close());
  return client;
}

test('delayed old socket events never reset an authenticated replacement', t => {
  const client = fixture(t);
  client.connect();
  const old = client.ws;
  old.authenticate();
  old.readyState = 2;
  client.connect();
  const current = client.ws;
  current.authenticate();
  old.emit('close', 1006, '');
  old.emit('error', new Error('stale error'));
  old.emit('message', JSON.stringify({ type: 'WELCOME', ok: false, reason: 'stale auth' }));
  assert.equal(client.ws, current);
  assert.equal(client.connected, true);
  assert.equal(client.authed, true);
  assert.equal(client.lastError, null);
  assert.equal(client.reconnectTimer, null);
});

test('lost heartbeat terminates the half-open socket and resolves outstanding requests', async t => {
  const client = fixture(t);
  client.connect();
  const socket = client.ws;
  socket.authenticate();
  const pending = client.listRealms();
  client.lastReceivedAt = Date.now() - 46000;
  client.heartbeat();
  assert.equal(client.ws, null);
  assert.equal(client.authed, false);
  assert.equal(client.lastError, 'heartbeat_timeout');
  assert.equal(socket.readyState, 3);
  assert.ok(client.reconnectTimer);
  assert.equal((await pending).reason, 'disconnected');
  assert.equal(client.pending.size, 0);
  assert.equal(client.connectionTimer, null);
});

test('healthy server replies keep the connection alive and send application pings', t => {
  const client = fixture(t);
  client.connect();
  const socket = client.ws;
  socket.authenticate();
  client.lastReceivedAt = Date.now() - 46000;
  socket.emit('message', JSON.stringify({ type: 'PONG' }));
  client.heartbeat();
  assert.equal(client.ws, socket);
  assert.equal(socket.sent.at(-1).type, 'PING');
  assert.equal(client.connectionTimer, null);
});

test('explicit connect address retains the TLS URL and never disables certificate verification', t => {
  const client = fixture(t, { connect_address: '43.135.179.157' });
  client.connect();
  assert.equal(client.ws.url, 'wss://relay.example');
  assert.equal(client.ws.options.rejectUnauthorized, undefined);
  assert.equal(client.ws.options.handshakeTimeout, 15000);
  client.ws.options.lookup('relay.example', {}, (error, address, family) => {
    assert.ifError(error);
    assert.equal(address, '43.135.179.157');
    assert.equal(family, 4);
  });
  client.ws.options.lookup('relay.example', { all: true }, (error, records) => {
    assert.ifError(error);
    assert.deepEqual(records, [{ address: '43.135.179.157', family: 4 }]);
  });
});

test('invalid address fails closed and intentional shutdown clears reconnect timers', t => {
  const client = fixture(t, { connect_address: 'not-an-ip' });
  client.connect();
  assert.equal(client.lastError, 'invalid_connect_address');
  assert.equal(client.ws, null);
  client.close();
  assert.equal(client.connectionTimer, null);
  assert.equal(client.reconnectTimer, null);
});

test('send failures release pending requests and schedule recovery without replaying writes', async t => {
  const client = fixture(t);
  client.connect();
  const socket = client.ws;
  socket.authenticate();
  socket.send = () => { throw new Error('broken transport'); };
  const response = await client.request('TRADE_CREATE', 'TRADE_CREATE_RESULT', {});
  assert.equal(response.reason, 'disconnected');
  assert.equal(client.pending.size, 0);
  assert.equal(client.authed, false);
  assert.equal(client.lastError, 'connection_send_failed');
});

test('ticket timeout retries issuance after reconnect, but never retries arbitrary gameplay', async () => {
  let calls = 0;
  let recoveries = 0;
  const client = {
    authed: true, ws: { readyState: 1 }, WebSocket: { OPEN: 1 },
    reconnect(reason) { assert.equal(reason, 'ticket_timeout'); recoveries++; },
    async createWebTicket(kind) {
      assert.equal(kind, 'endless');
      calls++;
      return calls === 1 ? { ok: false, reason: 'timeout' } : { ok: true, token: 'qa-ticket' };
    },
  };
  assert.equal(await createRelayTicket('endless', { userId: 'qa' }, client), 'qa-ticket');
  assert.equal(calls, 2);
  assert.equal(recoveries, 1);
});

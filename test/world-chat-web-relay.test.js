import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { WorldChatClient } from '../apps/worldChat/client.js';
import { createWorldChatServer } from '../worldchat-server/server.js';

const silentLogger = { info() {}, warn() {}, error() {} };

function clientConfig(url, serverId, secret) {
  return {
    enable: true,
    url,
    server_id: serverId,
    secret,
    name: serverId,
    joined_groups: [],
    last_seen_seq: 0,
  };
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(message);
}

test('网页票据由总机单次消费并把请求转回签发区服', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world-web-relay-'));
  const targetSecret = crypto.randomBytes(32).toString('hex');
  const gatewaySecret = crypto.randomBytes(32).toString('hex');
  const server = createWorldChatServer({
    baseDir: directory,
    logger: silentLogger,
    clients: {
      target_server: { name: '目标服', secret: targetSecret },
      web_gateway: { name: '网页网关', secret: gatewaySecret },
    },
    config: { HOST: '127.0.0.1', PORT: 0 },
  });
  const address = await server.start();
  const url = `ws://127.0.0.1:${address.port}`;
  const targetConfig = clientConfig(url, 'target_server', targetSecret);
  targetConfig.enable = false;
  targetConfig.web_relay_enabled = true;
  const target = new WorldChatClient({
    config: targetConfig,
    persist: false,
  });
  const gateway = new WorldChatClient({
    config: clientConfig(url, 'web_gateway', gatewaySecret),
    persist: false,
  });
  const calls = [];
  target.setWebRelayHandler(async request => {
    calls.push(request);
    return {
      status: 200,
      payload: {
        ok: true,
        state: { teamId: request.identity.teamId, operation: request.operation },
      },
    };
  });
  t.after(async () => {
    target.close();
    gateway.close();
    await server.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  target.connect();
  gateway.connect();
  await waitFor(() => target.authed && gateway.authed, '测试客户端未完成鉴权');
  assert.equal(target.status().enable, false);
  assert.equal(target.status().web_relay_enabled, true);

  const ticket = await target.createWebTicket('endless', {
    teamId: 'team-82',
    userId: 'player-1',
  });
  assert.equal(ticket.ok, true);

  const opened = await gateway.openWebSession(ticket.token);
  assert.equal(opened.ok, true);
  assert.equal(opened.kind, 'endless');
  assert.equal((await gateway.openWebSession(ticket.token)).reason, 'web_ticket_expired');

  const relayed = await gateway.webRequest(opened.session_id, 'state');
  assert.equal(relayed.ok, true);
  assert.deepEqual(relayed.result.payload.state, {
    teamId: 'team-82',
    operation: 'state',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sessionId, opened.session_id);

  const canglanTicket = await target.createWebTicket('canglan', {
    userId: 'player-2',
    runId: 'run-relay-2',
  });
  assert.equal(canglanTicket.ok, true);
  const canglanSession = await gateway.openWebSession(canglanTicket.token);
  assert.equal(canglanSession.ok, true);
  assert.equal(canglanSession.kind, 'canglan');

  const canglanState = await gateway.webRequest(canglanSession.session_id, 'state');
  assert.equal(canglanState.ok, true);
  assert.equal(canglanState.result.payload.state.operation, 'state');
  assert.equal(calls.at(-1).identity.runId, 'run-relay-2');
  const canglanAction = await gateway.webRequest(canglanSession.session_id, 'action', {
    action: 'move',
    targetId: 'star-1',
    operationId: 'canglan-relay-operation-0001',
  });
  assert.equal(canglanAction.ok, true);
  assert.equal(canglanAction.result.payload.state.operation, 'action');
  assert.deepEqual(calls.at(-1).body, {
    action: 'move',
    targetId: 'star-1',
    operationId: 'canglan-relay-operation-0001',
  });
});

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

// The shared world-chat module persists its own identity at import time.
// Keep even that bootstrap in a temporary directory, never beside live saves.
const bootstrap = fs.mkdtempSync(path.join(os.tmpdir(), 'announce-web-'));
const isolatedEnv = {
  WORLDCHAT_CONFIG_PATH: path.join(bootstrap, 'worldchat.json'),
  WORLDCHAT_INSTALLATION_PATH: path.join(bootstrap, 'installation.id'),
  WORLDCHAT_ENROLLMENT_TOKEN: '',
};
fs.writeFileSync(isolatedEnv.WORLDCHAT_CONFIG_PATH, JSON.stringify({
  enable: false, web_relay_enabled: false, auto_register: false, url: 'ws://127.0.0.1:1',
}));
const previousEnv = Object.fromEntries(Object.keys(isolatedEnv).map(key => [key, process.env[key]]));
Object.assign(process.env, isolatedEnv);
const { createAnnouncementWebLink, createEndlessWebHttpServer } = await import('../model/endlessWebServer.js');
for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
after(() => fs.rmSync(bootstrap, { recursive: true, force: true }));

function announcement(extra = {}) {
  return {
    version: 'v1.0', date: '2026.10.08', edition: '三界启程', intro: '本次更新说明。',
    currentUpdateCount: 1,
    updates: [{ tag: '新玩法', title: '选择降临路线', summary: '三条路线，各有机缘。', points: ['查看说明后选择出生地。'] }],
    changelog: [{ date: '2026-10-08', items: [{ hash: 'abc1234', msg: '玩法更新', detail: '体验调整。' }] }],
    ...extra,
  };
}

async function fixture(t, source = announcement(), options = {}) {
  const directory = fs.mkdtempSync(path.join(bootstrap, 'case-'));
  const announcementPath = path.join(directory, 'announce.json');
  fs.writeFileSync(announcementPath, typeof source === 'string' ? source : JSON.stringify(source));
  const server = createEndlessWebHttpServer({
    realm: null, config: { publicUrl: 'http://127.0.0.1' },
    announcementPath, ...options,
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { base: `http://127.0.0.1:${server.address().port}`, announcementPath };
}

test('公告 API 匿名读取公开字段，刷新读取最新后端内容且不创建会话', async t => {
  const source = announcement({ token: 'private-token', userId: 'private-player', session: { id: 'private-session' } });
  source.updates[0].secret = 'private-update';
  source.updates[0].points.push({ secret: 'private-point' });
  source.changelog[0].items[0].secret = 'private-history';
  const { base, announcementPath } = await fixture(t, source, {
    redisClient: new Proxy({}, { get() { throw new Error('公告不应使用 Redis'); } }),
  });
  const response = await fetch(`${base}/api/announce?t=ignored`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await response.json(), announcement());
  fs.writeFileSync(announcementPath, JSON.stringify(announcement({ edition: '新一期公告' })));
  assert.equal((await (await fetch(`${base}/api/announce`)).json()).edition, '新一期公告');
});

test('公告 HTML 与固定名资源公开交付且全部禁用缓存', async t => {
  const { base } = await fixture(t);
  for (const [route, contentType] of [
    ['/announce', 'text/html'], ['/announce/', 'text/html'],
    ['/announce/app.js', 'text/javascript'], ['/announce/style.css', 'text/css'],
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.ok(response.headers.get('content-type').startsWith(contentType), route);
    assert.equal(response.headers.get('cache-control'), 'no-store', route);
    assert.equal(response.headers.get('set-cookie'), null, route);
    assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"), route);
    assert.ok((await response.text()).length > 0, route);
  }
  assert.equal((await fetch(`${base}/announce/not-listed.js`)).status, 404);
  assert.equal((await fetch(`${base}/data/announce.json`)).status, 404);
});

test('损坏、格式错误或缺失的公告提供可读 503，不暴露文件路径', async t => {
  const { base, announcementPath } = await fixture(t, '{broken json');
  async function assertUnavailable() {
    const response = await fetch(`${base}/api/announce`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: '更新公告暂时未就绪，请稍后重试' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  await assertUnavailable();
  fs.writeFileSync(announcementPath, JSON.stringify({ updates: 'wrong-shape' }));
  await assertUnavailable();
  fs.unlinkSync(announcementPath);
  await assertUnavailable();
});

test('公告端点只允许 GET，未知 API 不作为公开公告处理', async t => {
  const { base } = await fixture(t);
  for (const route of ['/api/announce', '/announce', '/announce/', '/announce/app.js', '/announce/style.css']) {
    for (const method of ['POST', 'PUT', 'DELETE', 'HEAD']) {
      const response = await fetch(`${base}${route}`, { method });
      assert.equal(response.status, 405, `${method} ${route}`);
      assert.equal(response.headers.get('allow'), 'GET');
    }
  }
  assert.equal((await fetch(`${base}/api/announce/private`)).status, 404);
});

test('公共网关中继与 Redis 均离线时仍可交付公告，游戏 API 保持就绪检查', async t => {
  const { base } = await fixture(t, announcement(), {
    gatewayMode: true, relayClient: { authed: false },
    healthCheck: () => ({ redis: false, relay: false }),
  });
  assert.equal((await fetch(`${base}/readyz`)).status, 503);
  assert.equal((await fetch(`${base}/api/world/state`)).status, 503);
  for (const route of ['/announce', '/announce/app.js', '/announce/style.css', '/api/announce']) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get('set-cookie'), null, route);
  }
});

test('公共公告链接不签发玩家票据，关闭网页配置时给出说明', async () => {
  const config = { enabled: true, relayEnabled: true, publicUrl: 'https://example.com/' };
  assert.equal(await createAnnouncementWebLink(config), 'https://example.com/announce');
  await assert.rejects(createAnnouncementWebLink({ ...config, enabled: false }), /更新公告网页功能尚未开启/);
});

test('本地公告入口首次调用即启动网页服务，不要求 Redis', () => {
  const script = `
    import assert from 'node:assert/strict';
    import http from 'node:http';
    import { createAnnouncementWebLink } from ${JSON.stringify(new URL('../model/endlessWebServer.js', import.meta.url).href)};
    const probe = http.createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    delete globalThis.redis;
    const config = { enabled: true, relayEnabled: false, host: '127.0.0.1', port, publicUrl: 'http://127.0.0.1:' + port };
    const url = await createAnnouncementWebLink(config);
    assert.equal(url, config.publicUrl + '/announce');
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(config.publicUrl + '/api/announce')).status, 200);
    let redisReads = 0;
    globalThis.redis = { get: async () => { redisReads += 1; return null; } };
    const state = await fetch(config.publicUrl + '/api/world/state', {
      headers: { cookie: 'world_session=' + 'a'.repeat(43) },
    });
    assert.equal(state.status, 401);
    assert.equal(redisReads, 1);
    assert.equal(await createAnnouncementWebLink(config), url);
    process.stdout.write('announcement-local-ready');
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, ...isolatedEnv }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /announcement-local-ready/);
});

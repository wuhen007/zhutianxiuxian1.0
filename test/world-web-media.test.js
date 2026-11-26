import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { WorldWebMedia, downloadWorldImage, imageMime, publicImageAddress, trustedWorldImage } from '../model/worldWebMedia.js';
import { createEndlessWebHttpServer, issueWorldWebTicket } from '../model/endlessWebServer.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVCEAAAAASUVORK5CYII=', 'base64');
const source = 'https://multimedia.nt.qq.com.cn/download?fileid=qa-only&rkey=qa-only';
function cache(t, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'world-media-test-'));
  const store = new WorldWebMedia({ directory, ...options });
  t.after(() => { store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return store;
}

test('image fetch allowlist excludes arbitrary origins, credentials, ports and private addresses', () => {
  assert.equal(trustedWorldImage(source).hostname, 'multimedia.nt.qq.com.cn');
  for (const url of [
    'http://multimedia.nt.qq.com.cn/download', 'https://127.0.0.1/a',
    'https://multimedia.nt.qq.com.cn.evil.example/a', 'https://gchat.qpic.cn:444/a',
    'https://user:password@gchat.qpic.cn/a', 'file:///etc/passwd',
  ]) assert.equal(trustedWorldImage(url), null, url);
  for (const ip of ['0.0.0.0', '10.1.1.1', '127.0.0.1', '100.64.0.1', '169.254.169.254',
    '172.16.0.1', '192.168.0.1', '198.18.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1']) {
    assert.equal(publicImageAddress(ip), false, ip);
  }
  assert.equal(publicImageAddress('8.8.8.8'), true);
  assert.equal(imageMime(png), 'image/png');
  assert.equal(imageMime(Buffer.from('<svg onload="alert(1)">')), null);
});

test('image downloader pins public DNS and rejects redirects, oversized files and non-images', async () => {
  function requestWith(statusCode, bytes, headers = {}) {
    return (_url, options, callback) => {
      options.lookup('gchat.qpic.cn', {}, (error, address) => {
        assert.ifError(error);
        assert.equal(address, '8.8.8.8');
      });
      options.lookup('gchat.qpic.cn', { all: true }, (error, addresses) => {
        assert.ifError(error);
        assert.equal(addresses[0].address, '8.8.8.8');
      });
      const request = new EventEmitter();
      process.nextTick(() => {
        const response = Readable.from([bytes]);
        response.statusCode = statusCode;
        response.headers = headers;
        callback(response);
      });
      return request;
    };
  }
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  const result = await downloadWorldImage(source, { lookup, request: requestWith(200, png) });
  assert.deepEqual(result.bytes, png);
  assert.equal(result.type, 'image/png');
  for (const [status, bytes, headers] of [
    [302, png, { location: 'http://127.0.0.1' }],
    [400, Buffer.from('expired'), {}],
    [200, Buffer.from('<html>not an image</html>'), {}],
    [200, png, { 'content-length': '5000000' }],
    [200, Buffer.alloc(5 * 1024 * 1024), {}],
  ]) await assert.rejects(downloadWorldImage(source, { lookup, request: requestWith(status, bytes, headers) }));
  await assert.rejects(downloadWorldImage(source, {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    request() { assert.fail('private network request attempted'); },
  }), /invalid_image_address/);
});

test('image cache survives an expired source and a process restart', async t => {
  let downloads = 0;
  const store = cache(t, { download: async () => { downloads++; return { bytes: png }; } });
  const id = store.remember(source);
  const [first, second] = await Promise.all([store.get(id), store.get(id)]);
  assert.deepEqual(first.bytes, png);
  assert.deepEqual(second.bytes, png);
  assert.equal(downloads, 1);
  const restarted = new WorldWebMedia({ directory: store.directory, download: async () => { throw new Error('expired'); } });
  t.after(() => restarted.close());
  assert.deepEqual((await restarted.get(id)).bytes, png);
  assert.equal(await store.get('../../secret'), null);
});

test('expired images have a negative cache, and image storage stays bounded', async t => {
  let attempts = 0;
  const broken = cache(t, { download: async () => { attempts++; throw new Error('expired'); } });
  const id = broken.remember(source);
  assert.equal(await broken.get(id), null);
  assert.equal(await broken.get(id), null);
  assert.equal(attempts, 1);
  const bounded = cache(t, { maxBytes: png.length, download: async () => ({ bytes: png }) });
  const one = bounded.remember(`${source}&one=1`);
  const two = bounded.remember(`${source}&two=1`);
  await bounded.get(one);
  await bounded.get(two);
  assert.equal(fs.readdirSync(bounded.directory).filter(name => name.endsWith('.bin')).length, 1);
  assert.deepEqual((await bounded.get(two)).bytes, png);
});

test('media rewrites known URLs without mutating message data', async t => {
  const store = cache(t, { download: async () => ({ bytes: png }) });
  const state = { messages: [{ id: 'qa-message', images: [source] }] };
  const result = store.rewrite(state);
  assert.equal(state.messages[0].images[0], source);
  assert.equal(result.ids.length, 1);
  assert.equal(result.state.messages[0].images[0], `/api/world/media/${result.ids[0]}`);
  await store.get(result.ids[0]);
});

test('world images require a session that has received the associated message', async t => {
  const media = cache(t, { download: async () => ({ bytes: png }) });
  const data = new Map();
  const redis = {
    async get(key) { return data.get(key) ?? null; },
    async getDel(key) { const value = data.get(key); data.delete(key); return value ?? null; },
    async set(key, value) { data.set(key, value); return 'OK'; },
  };
  const config = { publicUrl: 'http://127.0.0.1', sessionTtlSeconds: 7200, ticketTtlSeconds: 120 };
  const server = createEndlessWebHttpServer({
    realm: null, config, redisClient: redis, worldMedia: media,
    worldController: { async getWorldWebState() { return { messages: [{ id: 'qa', images: [source] }] }; } },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  config.publicUrl = base;
  const token = await issueWorldWebTicket(redis, config, { userId: 'qa-user' });
  const login = await fetch(`${base}/api/world/session`, {
    method: 'POST', headers: { origin: base, 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const id = media.remember(source);
  const imagePath = `/api/world/media/${id}`;
  assert.equal((await fetch(`${base}${imagePath}`)).status, 401);
  assert.equal((await fetch(`${base}${imagePath}`, { headers: { cookie } })).status, 404);
  const state = await fetch(`${base}/api/world/state`, { headers: { cookie } });
  assert.equal((await state.json()).state.messages[0].images[0], imagePath);
  const image = await fetch(`${base}${imagePath}`, { headers: { cookie } });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.match(image.headers.get('cache-control'), /^private/);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
});

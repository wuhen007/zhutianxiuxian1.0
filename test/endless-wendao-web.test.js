import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createEndlessWendaoLink,
  createEndlessWebHttpServer,
} from '../model/endlessWebServer.js';

const pluginRoot = fileURLToPath(new URL('..', import.meta.url));
const contentPath = path.join(pluginRoot, 'resources', 'web', 'wendao', 'content.json');

test('无尽问道内容引用完整', () => {
  const data = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  const cardIds = new Set(data.cards.map(card => card.id));
  const relicIds = new Set(data.relics.map(relic => relic.id));

  assert.equal(data.characters.length, 4);
  assert.equal(data.realms.length, 4);
  assert.ok(data.cards.length >= 40);
  assert.ok(data.enemies.filter(enemy => enemy.kind === 'boss').length >= 4);
  for (const character of data.characters) {
    assert.equal(character.deck.length, 10);
    assert.ok(character.deck.every(id => cardIds.has(id)));
    assert.ok(relicIds.has(character.relic));
  }
  for (const fusion of data.fusions) {
    assert.ok(fusion.needs.every(id => cardIds.has(id)));
    assert.ok(cardIds.has(fusion.result));
  }
});

test('无尽问道静态入口与视觉资源可由现有服务访问', async t => {
  const config = {
    publicUrl: 'http://127.0.0.1',
    ticketTtlSeconds: 120,
    sessionTtlSeconds: 3600,
  };
  const server = createEndlessWebHttpServer({ realm: {}, redisClient: {}, config });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  assert.equal(createEndlessWendaoLink({ publicUrl: base }), `${base}/wendao`);

  const page = await fetch(`${base}/wendao`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /无尽问道/);

  const assets = [
    ['/wendao/app.js', 'resolveCard'],
    ['/wendao/style.css', '.combat-screen'],
    ['/wendao/content.json', '李青云'],
    ['/wendao/assets/battle.jpg', null],
    ['/wendao/assets/li-qingyun.jpg', null],
    ['/wendao/audio/battle.ogg', null],
    ['/wendao/audio/sword-swing.ogg', null],
    ['/wendao/audio/sword-impact.ogg', null],
    ['/wendao/audio/magic-cast.ogg', null],
    ['/wendao/audio/magic-heavy.ogg', null],
    ['/wendao/audio/boss-roar.ogg', null],
  ];
  for (const [url, marker] of assets) {
    const response = await fetch(`${base}${url}`);
    assert.equal(response.status, 200, url);
    if (marker) assert.match(await response.text(), new RegExp(marker));
  }

  const audio = await fetch(`${base}/wendao/audio/battle.ogg`);
  assert.match(audio.headers.get('content-type') || '', /^audio\/ogg/);
  const audioBody = await audio.arrayBuffer();
  assert.ok(audioBody.byteLength > 100_000);
  assert.equal(Number(audio.headers.get('content-length')), audioBody.byteLength);

  const unknownAudio = await fetch(`${base}/wendao/audio/not-listed.ogg`);
  assert.equal(unknownAudio.status, 404);
});

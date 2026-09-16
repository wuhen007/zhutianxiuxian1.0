import fs from 'node:fs';
import path from 'node:path';
import { createClient } from 'redis';

const dataDir = path.resolve(process.env.ZHUTIAN_WEB_DATA_DIR || './gateway-data');
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
process.env.WORLDCHAT_CONFIG_PATH ||= path.join(dataDir, 'worldchat.json');
process.env.WORLDCHAT_INSTALLATION_PATH ||= path.join(dataDir, 'installation.id');

// Set persistent identity paths before importing the plugin's relay singleton.
const { worldChatClient } = await import('../apps/worldChat/client.js');
const { getEndlessWebConfig } = await import('../model/endlessWebServer.js');
const { startWebGateway } = await import('./gateway.js');
const { WorldWebMedia } = await import('../model/worldWebMedia.js');
if (process.env.ZHUTIAN_WEB_RELAY_URL) {
  worldChatClient.cfg.url = process.env.ZHUTIAN_WEB_RELAY_URL;
}
const config = getEndlessWebConfig();
if (!process.env.ENDLESS_WEB_PUBLIC_URL) {
  throw new Error('Set ENDLESS_WEB_PUBLIC_URL to the public HTTPS gateway origin');
}
if (!config.enabled) throw new Error('The public web gateway is disabled');

const redisClient = createClient({
  url: process.env.ZHUTIAN_WEB_REDIS_URL || 'redis://127.0.0.1:6381/0',
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 10000,
    reconnectStrategy: retries => Math.min(500 + retries * 250, 5000),
  },
});
redisClient.on('error', () => console.error('[web-gateway] session storage connection error'));
await redisClient.connect();
const runtime = await startWebGateway({
  config,
  redisClient,
  relayClient: worldChatClient,
  worldMedia: new WorldWebMedia({ directory: path.join(dataDir, 'world-images') }),
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  try {
    await runtime.close();
    await redisClient.quit();
  } finally {
    clearTimeout(deadline);
  }
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WorldChatClient } from '../apps/worldChat/client.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(
  repoRoot,
  'apps',
  'worldChat',
  'config.local.json'
);
const url = process.env.WORLDCHAT_LIVE_URL;

if (!url) throw new Error('WORLDCHAT_LIVE_URL is required');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const client = new WorldChatClient({
  config: { ...config, enable: true, url },
  persist: false,
});

client.connect();
const deadline = Date.now() + 12_000;
while (!client.authed && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const result = {
  ok: client.authed,
  connected: client.connected,
  authed: client.authed,
  url,
  server_id: config.server_id,
  error: client.lastError,
};
client.close();

console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;

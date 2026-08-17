import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_ENROLLMENT_PATH,
  WorldChatClient,
  loadConfig,
} from '../apps/worldChat/client.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = process.env.WORLDCHAT_CONFIG_PATH
  ? path.resolve(process.env.WORLDCHAT_CONFIG_PATH)
  : path.join(repoRoot, 'apps', 'worldChat', 'config.local.json');
const url = process.env.WORLDCHAT_LIVE_URL;

if (!url) throw new Error('WORLDCHAT_LIVE_URL is required');

const config = loadConfig(configPath, DEFAULT_ENROLLMENT_PATH);
const client = new WorldChatClient({
  configPath,
  config: { ...config, enable: true, url },
  persist: true,
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
  server_id: client.cfg.server_id,
  error: client.lastError,
};
client.close();

console.log(JSON.stringify(result));
if (!result.ok) process.exitCode = 1;

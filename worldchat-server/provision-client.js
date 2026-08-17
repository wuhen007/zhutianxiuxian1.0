import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_FILE = fileURLToPath(import.meta.url);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto
    .randomBytes(4)
    .toString('hex')}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

function cleanName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

export function provisionClient(options = {}) {
  const clientsFile = path.resolve(
    options.clientsFile || process.env.WC_CLIENTS_FILE || 'clients.json'
  );
  const name = cleanName(options.name);
  if (!name) throw new Error('区服名称不能为空');

  const clients = readJson(clientsFile);
  let serverId;
  do {
    serverId = `sv_${crypto.randomBytes(6).toString('hex')}`;
  } while (clients[serverId]);

  const secret = crypto.randomBytes(32).toString('hex');
  const url = String(
    options.url ||
      process.env.WORLDCHAT_PUBLIC_URL ||
      'wss://worldchat.ameng2027.xyz'
  );
  const outputFile = path.resolve(
    options.outputFile || `worldchat-client-${serverId}.json`
  );
  if (fs.existsSync(outputFile)) throw new Error(`输出文件已存在: ${outputFile}`);

  const clientConfig = {
    enable: true,
    url,
    secret,
    server_id: serverId,
    name,
    query_default: 10,
    expose_group: false,
    joined_groups: [],
    last_seen_seq: 0,
  };
  atomicWriteJson(outputFile, clientConfig);

  if (fs.existsSync(clientsFile)) {
    fs.copyFileSync(clientsFile, `${clientsFile}.bak.${Date.now()}`);
  }
  clients[serverId] = { name, secret, enabled: true };
  atomicWriteJson(clientsFile, clients);

  return { server_id: serverId, name, url, config_path: outputFile };
}

export function listClients(clientsFile = process.env.WC_CLIENTS_FILE) {
  const file = path.resolve(clientsFile || 'clients.json');
  return Object.entries(readJson(file)).map(([serverId, client]) => ({
    server_id: serverId,
    name: cleanName(client?.name) || serverId,
    enabled: client?.enabled !== false,
  }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_FILE) {
  try {
    const [name, outputFile] = process.argv.slice(2);
    if (name === '--list') {
      console.log(JSON.stringify(listClients(), null, 2));
    } else {
      if (!name) {
        throw new Error(
          '用法: node provision-client.js "区服名称" [/root/client.json]'
        );
      }
      console.log(JSON.stringify(provisionClient({ name, outputFile }), null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

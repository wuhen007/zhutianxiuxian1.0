import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listClients,
  provisionClient,
} from '../worldchat-server/provision-client.js';

test('可重复生成独立区服凭据且不在命令结果中泄露密钥', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'worldchat-client-'));
  const clientsFile = path.join(directory, 'clients.json');
  const firstOutput = path.join(directory, 'first.json');
  const secondOutput = path.join(directory, 'second.json');

  try {
    const first = provisionClient({
      clientsFile,
      outputFile: firstOutput,
      name: '甲世界',
    });
    const second = provisionClient({
      clientsFile,
      outputFile: secondOutput,
      name: '乙世界',
    });
    const firstConfig = JSON.parse(fs.readFileSync(firstOutput, 'utf8'));
    const secondConfig = JSON.parse(fs.readFileSync(secondOutput, 'utf8'));
    const registry = JSON.parse(fs.readFileSync(clientsFile, 'utf8'));

    assert.notEqual(first.server_id, second.server_id);
    assert.equal('secret' in first, false);
    assert.equal(firstConfig.secret, registry[first.server_id].secret);
    assert.equal(secondConfig.secret, registry[second.server_id].secret);
    assert.notEqual(firstConfig.secret, secondConfig.secret);
    assert.deepEqual(
      listClients(clientsFile).map((client) => client.name),
      ['甲世界', '乙世界']
    );
    assert.equal(
      fs.readdirSync(directory).some((file) => file.startsWith('clients.json.bak.')),
      true
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

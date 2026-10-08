import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test, after } from 'node:test';
import { atomicWriteConfig, validateMainConfig } from '../utils/configFileSafety.js';

const parent = path.resolve(process.env.CONFIG_FIX_TEST_TMP || os.tmpdir());
fs.mkdirSync(parent, { recursive: true });
const fixture = fs.mkdtempSync(path.join(parent, 'bot-config-safety-'));
// Finish asynchronous module loading before registering tests or cleanup hooks.
// Otherwise the first tests may finish and remove the fixture during import().
let yamlModule = process.env.CONFIG_FIX_YAML_MODULE;
if (!yamlModule) {
  try { yamlModule = createRequire(import.meta.url).resolve('yaml'); } catch {}
}
const withYaml = { skip: !yamlModule };
let Config, YAML, work;
if (yamlModule) {
  YAML = createRequire(import.meta.url)(yamlModule);
  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  work = path.join(fixture, 'plugin');
  fs.mkdirSync(path.join(work, 'model'), { recursive: true });
  fs.mkdirSync(path.join(work, 'utils'), { recursive: true });
  fs.writeFileSync(path.join(work, 'package.json'), '{"type":"module"}');
  const src = fs.readFileSync(path.join(here, 'model', 'Config.js'), 'utf8')
    .replace("import YAML from 'yaml';", `import { createRequire } from 'node:module';\nconst YAML = createRequire(import.meta.url)(${JSON.stringify(yamlModule)});`);
  fs.writeFileSync(path.join(work, 'model', 'Config.js'), src);
  fs.copyFileSync(path.join(here, 'utils', 'configFileSafety.js'), path.join(work, 'utils', 'configFileSafety.js'));
  fs.writeFileSync(path.join(work, 'app.config.js'), `export const __dirname = ${JSON.stringify(work)};`);
  ({ Config } = await import(pathToFileURL(path.join(work, 'model', 'Config.js'))));
}
after(() => {
  const resolved = path.resolve(fixture);
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('bot-config-safety-')) {
    throw new Error('Unexpected cleanup directory');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
});
let seq = 0;
function target() {
  const file = path.join(fixture, `config-${++seq}.yaml`);
  fs.writeFileSync(file, 'old-good-config');
  return file;
}
function goodConfig() {
  return {
    CD: {}, percentage: {}, size: {}, switch: { play: false }, biguan: {}, work: {}, Sign: {},
    Auction: { Auction_task: '0 * * * * *' }, Auction2: { Auction_task: '0 * * * * *' },
    SecretPlace: { one: .99, two: .5, three: .25 }, Era: { current: { totalYears: 996000 } },
    AutoDailyTask: { cron: '0 18 18 * * *' }, custom: { keep: 'yes' },
  };
}
test('healthy custom config survives validation including disabled switches', () => {
  const value = goodConfig();
  assert.equal(validateMainConfig(value), value);
});
test('null/empty/Era-only main config is rejected before default reset', () => {
  for (const value of [null, undefined, {}, [], { Era: { current: {} } }]) {
    assert.throws(() => validateMainConfig(value), /主配置不完整/);
  }
});
test('critical SecretPlace numeric values and task cron are checked', () => {
  for (const value of [NaN, Infinity, -1, 2, undefined, '0.99']) {
    const c = goodConfig(); c.SecretPlace.one = value;
    assert.throws(() => validateMainConfig(c), /SecretPlace.one/);
  }
  const c = goodConfig(); c.Auction.Auction_task = '';
  assert.throws(() => validateMainConfig(c), /Auction_task/);
});
test('normal save writes/fsyncs temporary file before replacement', () => {
  const file = target();
  const events = [];
  const io = { ...fs,
    writeFileSync(fd, value, options) { assert.equal(typeof fd, 'number'); events.push('write'); return fs.writeFileSync(fd, value, options); },
    fsyncSync(fd) { events.push('sync'); return fs.fsyncSync(fd); },
    renameSync(from, to) { events.push('rename'); return fs.renameSync(from, to); },
  };
  atomicWriteConfig(file, 'new-good-config', io);
  assert.equal(fs.readFileSync(file, 'utf8'), 'new-good-config');
  assert.deepEqual(events, ['write', 'sync', 'rename']);
});
test('disk full during temporary write leaves old config intact', () => {
  const file = target();
  const io = { ...fs, writeFileSync(fd) {
    fs.writeSync(fd, 'partial');
    throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
  } };
  assert.throws(() => atomicWriteConfig(file, 'new-content', io), /disk full/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old-good-config');
  assert.ok(!fs.readdirSync(fixture).some(name => name.endsWith('.tmp')));
});
test('fsync failure leaves old config intact', () => {
  const file = target();
  assert.throws(() => atomicWriteConfig(file, 'new', { ...fs, fsyncSync() { throw new Error('sync failed'); } }), /sync failed/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old-good-config');
});
test('temporary access denial is retried without truncating destination', () => {
  const file = target(); let attempts = 0;
  atomicWriteConfig(file, 'new', { ...fs, renameSync(from, to) {
    if (++attempts < 3) throw Object.assign(new Error('busy'), { code: 'EPERM' });
    return fs.renameSync(from, to);
  } }, () => {});
  assert.equal(attempts, 3);
  assert.equal(fs.readFileSync(file, 'utf8'), 'new');
});
test('permanent access denial has bounded retries and no unsafe overwrite fallback', () => {
  const file = target(); let attempts = 0;
  const io = { ...fs, renameSync() {
    attempts++; throw Object.assign(new Error('locked'), { code: 'EPERM' });
  } };
  assert.throws(() => atomicWriteConfig(file, 'new', io, () => {}), /locked/);
  assert.equal(attempts, 5);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old-good-config');
});
test('non-retryable replace error is not retried', () => {
  const file = target(); let attempts = 0;
  assert.throws(() => atomicWriteConfig(file, 'new', { ...fs, renameSync() {
    attempts++; throw Object.assign(new Error('io error'), { code: 'EIO' });
  } }, () => {}), /io error/);
  assert.equal(attempts, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), 'old-good-config');
});

test('Config roundtrip preserves custom settings and records previous last-good', withYaml, () => {
  const c = new Config(); const value = goodConfig();
  c.setConfig('xiuxian', 'xiuxian', value);
  const file = c.getConfigPath('xiuxian', 'xiuxian');
  const before = fs.readFileSync(file);
  const updated = structuredClone(value); updated.Era.current.totalYears += 1000;
  c.setConfig('xiuxian', 'xiuxian', updated);
  assert.deepEqual(c.getConfig('xiuxian', 'xiuxian'), updated);
  assert.deepEqual(fs.readFileSync(`${file}.last-good`), before);
});
test('Config refuses Era-only writes without touching full configuration', withYaml, () => {
  const c = new Config(); const file = c.getConfigPath('xiuxian', 'xiuxian');
  const before = fs.readFileSync(file);
  assert.throws(() => c.setConfig('xiuxian', 'xiuxian', { Era: {} }), /主配置不完整/);
  assert.deepEqual(fs.readFileSync(file), before);
});
test('blank main YAML returns a clear error instead of null', withYaml, () => {
  const c = new Config(); const file = c.getConfigPath('xiuxian', 'xiuxian');
  const before = fs.readFileSync(file);
  fs.writeFileSync(file, '');
  try { assert.throws(() => c.getConfig('xiuxian', 'xiuxian'), /主配置不完整/); }
  finally { fs.writeFileSync(file, before); }
});
test('invalid existing configuration is not overwritten from a stale caller object', withYaml, () => {
  const c = new Config(); const file = c.getConfigPath('xiuxian', 'xiuxian');
  const before = fs.readFileSync(file);
  fs.writeFileSync(file, 'Era: {}');
  try {
    assert.throws(() => c.setConfig('xiuxian', 'xiuxian', goodConfig()), /主配置不完整/);
    assert.equal(fs.readFileSync(file, 'utf8'), 'Era: {}');
  } finally { fs.writeFileSync(file, before); }
});
test('missing main config fails closed without changing optional missing configs', withYaml, () => {
  const c = new Config(); c.getConfigPath = (a, n) => path.join(fixture, `missing-${a}-${n}.yaml`);
  assert.throws(() => c.getConfig('xiuxian', 'xiuxian'), /文件缺失/);
  assert.deepEqual(c.getConfig('optional', 'config'), {});
});
test('non-main config API remains compatible', withYaml, () => {
  const c = new Config();
  c.setConfig('other', 'list', { enabled: false, list: [1, 2] });
  assert.deepEqual(c.getConfig('other', 'list'), { enabled: false, list: [1, 2] });
});
test('shipped config or selected healthy snapshot parses and validates with real YAML', { skip: !yamlModule }, () => {
  const configFile = process.env.CONFIG_FIX_SNAPSHOT || fileURLToPath(new URL('../config/xiuxian/xiuxian.yaml', import.meta.url));
  const text = fs.readFileSync(configFile, 'utf8');
  const doc = YAML.parse(text);
  assert.equal(validateMainConfig(doc), doc);
  assert.ok(Number.isFinite(doc.SecretPlace.one));
  assert.ok(doc.Era.current && typeof doc.Era.current === 'object');
});

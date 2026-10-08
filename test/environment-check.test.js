import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { segment } from 'icqq';
import { checkEnvironment } from '../scripts/check-environment.mjs';

function fixture(t) {
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-env-test-'));
  t.after(() => fs.rmSync(hostRoot, { recursive: true, force: true }));
  const pluginRoot = path.join(hostRoot, 'plugins', '环境 fixture');
  const write = (relative, content) => {
    const file = path.join(hostRoot, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  write('plugins/环境 fixture/package.json', JSON.stringify({
    dependencies: { 'env-fixture-runtime': '1.0.0' },
    devDependencies: { 'env-fixture-development': '1.0.0' },
  }));
  for (const name of ['env-fixture-runtime', 'env-fixture-development']) {
    write(`plugins/环境 fixture/node_modules/${name}/index.js`, 'throw new Error("诊断不应执行依赖");');
  }
  for (const file of ['package.json', 'lib/plugins/plugin.js', 'lib/common/common.js', 'lib/puppeteer/puppeteer.js']) {
    write(file, file.endsWith('.json') ? '{}' : 'throw new Error("仅用于检查文件存在性，不是宿主实现");');
  }
  return { hostRoot, pluginRoot, write };
}

test('环境预检区分运行、开发和宿主入口，且不执行依赖或宿主', t => {
  const { pluginRoot, hostRoot } = fixture(t);
  const result = checkEnvironment(pluginRoot);
  assert.equal(result.ok, true);
  assert.equal(result.hostRoot, hostRoot);
  assert.equal(result.checks.length, 6);
  assert.deepEqual([...new Set(result.checks.map(check => check.kind))], ['运行依赖', '开发依赖', '宿主文件']);
});

test('依赖目录缺入口、宿主路径只有目录时均准确报告缺失', t => {
  const { pluginRoot, hostRoot } = fixture(t);
  fs.unlinkSync(path.join(pluginRoot, 'node_modules/env-fixture-runtime/index.js'));
  const common = path.join(hostRoot, 'lib/common/common.js');
  fs.unlinkSync(common);
  fs.mkdirSync(common);
  const result = checkEnvironment(pluginRoot);
  assert.equal(result.ok, false);
  assert.deepEqual(result.checks.filter(check => !check.ok).map(check => check.name), [
    'env-fixture-runtime', 'lib/common/common.js',
  ]);
});

test('命令行以脚本目录定位，缺宿主返回非零且保留验收范围提示', t => {
  const { pluginRoot, hostRoot } = fixture(t);
  const script = path.join(pluginRoot, 'scripts/check-environment.mjs');
  fs.mkdirSync(path.dirname(script));
  fs.copyFileSync(new URL('../scripts/check-environment.mjs', import.meta.url), script);
  const run = () => spawnSync(process.execPath, [script], { cwd: os.tmpdir(), encoding: 'utf8' });
  assert.equal(run().status, 0);
  fs.unlinkSync(path.join(hostRoot, 'lib/plugins/plugin.js'));
  const missing = run();
  assert.equal(missing.status, 1);
  assert.ok(missing.stdout.includes(pluginRoot));
  assert.ok(missing.stdout.includes('[缺失] 宿主文件 lib/plugins/plugin.js'));
  assert.ok(missing.stdout.includes('仅验证直接依赖与宿主入口文件'));
});

test('模板和YAML明确声明，周年活动复用已有icqq消息段', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.devDependencies['art-template'], '4.13.2');
  assert.ok(manifest.dependencies.yaml);
  assert.ok(manifest.dependencies.icqq);
  const source = fs.readFileSync(new URL('../apps/Anniversary/Anniversary.js', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*segment\s*\}\s*from\s*["']icqq["']/);
  assert.doesNotMatch(source, /from\s*["']oicq["']/);
  assert.equal(segment.at(12345).type, 'at');
  assert.equal(segment.image('file:///fixture.jpg').type, 'image');
});

test('帮助缓存改用Node散列后保留中文MD5结果和命中行为', async () => {
  const source = fs.readFileSync(new URL('../apps/Help/BotHelp.js', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*createHash\s*\}\s*from\s*'node:crypto'/);
  assert.doesNotMatch(source, /from\s*'md5'/);
  const calls = [];
  // 仅隔离验证缓存方法；这不是完整宿主加载验收。
  const { BotHelp, helpData } = vm.runInNewContext(
    source.replace(/^import[^\n]*\r?\n/gm, '').replace('export class BotHelp', 'class BotHelp') + '\n({ BotHelp, helpData });',
    {
      plugin: class {},
      createHash,
      puppeteer: { screenshots: async (_name, data) => {
        calls.push(structuredClone(data));
        return `image-${calls.length}`;
      } },
    },
  );
  const app = new BotHelp();
  const data = { title: '修仙帮助', entries: ['花粉路', '复活地球'] };
  assert.equal(await app.cache(structuredClone(data)), 'image-1');
  assert.equal(helpData.md5, 'cedde5368b77e3519a194c05b8deab04');
  assert.equal(await app.cache(structuredClone(data)), 'image-1');
  assert.equal(calls.length, 1);
  assert.equal(await app.cache({ ...data, title: '活动帮助' }), 'image-2');
  assert.equal(calls.length, 2);
});

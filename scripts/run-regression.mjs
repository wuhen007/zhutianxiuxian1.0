import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pluginRoot = fileURLToPath(new URL('../', import.meta.url));
const hostRoot = path.resolve(pluginRoot, '../..');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-regression-'));
const hostCopy = path.join(output, 'host');
const pluginCopy = path.join(hostCopy, 'plugins', path.basename(path.resolve(pluginRoot)));
const privateTrees = [
  'resources/backup', 'resources/data/auto_backup',
  'resources/data/xiuxian_player', 'resources/data/xiuxian_najie', 'resources/data/xiuxian_equipment',
];
const excludedRoots = new Set(['.git', 'node_modules', '_backups', '.workbuddy', 'temp']);

function copyTree(source, destination, filter = () => true) {
  const normalizedSource = path.toNamespacedPath(path.resolve(source));
  fs.cpSync(source, destination, {
    recursive: true,
    // Windows的cpSync回调会带扩展路径前缀，统一后再判断排除目录。
    filter: file => !fs.lstatSync(file).isSymbolicLink()
      && filter(path.relative(normalizedSource, path.toNamespacedPath(file)).split(path.sep).join('/')),
  });
}

try {
  console.log(`隔离回归目录：${output}`);
  copyTree(pluginRoot, pluginCopy, relative => {
    if (excludedRoots.has(relative.split('/')[0])) return false;
    if (privateTrees.some(dir => relative === dir || relative.startsWith(`${dir}/`))) return false;
    if (/\.bak(?:-|\.|$)|\.local\./.test(relative)) return false;
    return !/^(apps\/worldChat\/(config\.json|installation\.id)|worldchat-server\/clients\.json|banned\.json|messages\.json)$/.test(relative);
  });
  for (const dir of ['node_modules', '.git', ...privateTrees]) {
    if (fs.existsSync(path.join(pluginCopy, dir))) throw new Error(`复制排除检查失败：${dir}`);
  }
  for (const dir of privateTrees) fs.mkdirSync(path.join(pluginCopy, dir), { recursive: true });

  // 使用真实宿主源码和默认配置，不复制登录配置，不启动机器人。
  for (const dir of ['lib', 'config/default_config', 'renderers']) {
    copyTree(path.join(hostRoot, dir), path.join(hostCopy, dir), relative =>
      !relative.split('/').includes('node_modules') && !(dir === 'renderers' && relative.endsWith('config.yaml')));
  }
  fs.copyFileSync(path.join(hostRoot, 'package.json'), path.join(hostCopy, 'package.json'));
  copyTree(path.join(hostCopy, 'config/default_config'), path.join(hostCopy, 'config/config'));
  for (const [source, destination] of [[hostRoot, hostCopy], [pluginRoot, pluginCopy]]) {
    const modules = fs.realpathSync(path.join(source, 'node_modules'));
    fs.symlinkSync(modules, path.join(destination, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  }

  const worldChatData = path.join(hostCopy, 'data/zhutian-worldchat');
  fs.mkdirSync(worldChatData, { recursive: true });
  fs.writeFileSync(path.join(worldChatData, 'config.local.json'), JSON.stringify({
    enable: false, web_relay_enabled: false, auto_register: false, url: 'ws://127.0.0.1:1',
  }));
  const env = { ...process.env };
  for (const key of ['WORLDCHAT_CONFIG_PATH', 'WORLDCHAT_INSTALLATION_PATH', 'WORLDCHAT_ENROLLMENT_TOKEN']) delete env[key];
  const log = path.join(output, 'regression.tap');
  const fd = fs.openSync(log, 'w');
  let result;
  try {
    // ponytail: 多个测试导入同一磁盘单例；串行避免Windows配置换名竞争，拆分夹具后再提高并发。
    result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=90000', '--test-reporter=tap'], {
      cwd: pluginCopy, env, stdio: ['ignore', fd, fd], timeout: 600_000,
    });
  } finally {
    fs.closeSync(fd);
  }
  const tap = fs.readFileSync(log, 'utf8');
  const summary = {};
  for (const field of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = tap.match(new RegExp(`^# ${field} (\\d+)$`, 'm'));
    summary[field] = match ? Number(match[1]) : null;
  }
  const ok = result.status === 0 && summary.tests > 0 && summary.fail === 0 && summary.cancelled === 0;
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({
    source: pluginRoot, hostSource: hostRoot, pluginCopy, log, ...summary,
    exitCode: result.status, error: result.error?.message || null, ok,
    scope: '真实宿主代码的隔离测试；仅依赖目录共享，不代表机器人登录、Redis或浏览器截图验收。',
  }, null, 2));
  console.log(tap.split(/\r?\n/).filter(line => /^# (tests|pass|fail|cancelled|skipped|todo|duration_ms) /.test(line)).join('\n'));
  console.log(`完整日志：${log}`);
  if (result.error) console.error(result.error.message);
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(`隔离回归中止：${error.message}\n已生成的副本与日志保留在：${output}`);
  process.exitCode = 1;
}

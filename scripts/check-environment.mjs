import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

// 只检查入口，不加载插件、启动服务或读写玩家存档。
export function checkEnvironment(pluginRoot = defaultRoot) {
  pluginRoot = path.resolve(pluginRoot);
  const packageFile = path.join(pluginRoot, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
  const resolve = createRequire(packageFile).resolve;
  const checks = [];

  for (const [field, kind] of [['dependencies', '运行依赖'], ['devDependencies', '开发依赖']]) {
    for (const name of Object.keys(manifest[field] || {}).sort()) {
      try {
        const entry = resolve(name);
        checks.push({ kind, name, ok: isFile(entry), detail: entry });
      } catch (error) {
        checks.push({ kind, name, ok: false, detail: error.code || error.message });
      }
    }
  }

  const hostRoot = path.resolve(pluginRoot, '../..');
  for (const name of ['package.json', 'lib/plugins/plugin.js', 'lib/common/common.js', 'lib/puppeteer/puppeteer.js']) {
    const entry = path.join(hostRoot, name);
    checks.push({ kind: '宿主文件', name, ok: isFile(entry), detail: entry });
  }
  return { pluginRoot, hostRoot, checks, ok: checks.every(check => check.ok) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = checkEnvironment();
    console.log(`插件：${report.pluginRoot}\n宿主：${report.hostRoot}\nNode：${process.version}`);
    for (const check of report.checks) {
      console.log(`[${check.ok ? '通过' : '缺失'}] ${check.kind} ${check.name} — ${check.detail}`);
    }
    console.log('此检查仅验证直接依赖与宿主入口文件；依赖内部加载、Redis、机器人登录和实际截图需另行验收。');
    if (!report.ok) {
      console.log('依赖缺失：在插件目录安装开发依赖；宿主缺失：补齐真实云崽项目，再从宿主根目录启动。');
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`环境检查失败：${error.message}`);
    process.exitCode = 1;
  }
}

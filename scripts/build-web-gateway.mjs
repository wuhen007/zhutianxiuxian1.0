import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.resolve(process.argv[2] || path.join(root, 'dist/web-gateway'));
if (fs.existsSync(output)) throw new Error(`Output already exists: ${output}`);
const assets = [
  'model',
  'resources/data',
  'resources/web',
  'resources/font/tttgbnumber.ttf',
  'resources/img/help/zhutian.jpg',
  'resources/img/state/\u80cc\u666f\u56fe.jpg',
  'resources/img/najie/najie.jpg',
  ...['0', '16', '20', '38', '39'].map(id => `resources/img/player_pifu/${id}.jpg`),
  'apps/worldChat/client.js',
  'apps/worldChat/enrollment.local.json',
  'config/endless-web.json',
  'data/announce.json',
];
// Only tracked source assets enter a release, never runtime saves or backups.
const files = execFileSync('git', ['ls-files', '-z', '--', ...assets], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean);
files.push(
  'web-gateway/server.js',
  'web-gateway/gateway.js',
  'web-gateway/zhutian-web.service',
  'web-gateway/gateway.env.example',
  'web-gateway/README.md',
);
const manifest = {
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  createdAt: new Date().toISOString(),
  files: {},
};
fs.mkdirSync(output, { recursive: true });
for (const relative of files) {
  const source = path.join(root, relative);
  const destination = path.join(output, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const bytes = fs.readFileSync(destination);
  manifest.files[relative] = {
    bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'web-gateway/package.json'), 'utf8'));
pkg.scripts = { start: 'node web-gateway/server.js' };
fs.writeFileSync(path.join(output, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
fs.copyFileSync(path.join(root, 'web-gateway/package-lock.json'), path.join(output, 'package-lock.json'));
fs.writeFileSync(path.join(output, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  output,
  files: files.length,
  bytes: Object.values(manifest.files).reduce((sum, file) => sum + file.bytes, 0),
  revision: manifest.revision,
}, null, 2));

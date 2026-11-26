import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function read(relativePath) {
  return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function bodyOf(source, signature, length = 400) {
  const index = source.indexOf(signature);
  assert.ok(index >= 0, `missing signature: ${signature}`);
  return source.slice(index, index + length);
}

test('诸天初始化持有全局锁：begin/endGlobalInit 已接线且整体兜底', () => {
  const globalInit = read('apps/AdminSuper/GlobalInit.js');
  assert.match(globalInit, /import \{[\s\S]*?beginGlobalInit,[\s\S]*?endGlobalInit,[\s\S]*?isGlobalInitRunning,[\s\S]*?\} from '\.\.\/\.\.\/utils\/globalInitGuard\.js';/);
  assert.match(globalInit, /if \(isGlobalInitRunning\(\)\)/);
  assert.match(globalInit, /beginGlobalInit\(\);/);
  assert.match(globalInit, /finally \{\s*endGlobalInit\(\);/);
  // 备份失败/执行中断等提前 return 也必须释放锁（try-finally 语义）
  assert.match(globalInit, /try \{\s*\/\/ ---------- 序章/);
});

test('诸天初始化 redis 清理覆盖新增前缀', () => {
  const globalInit = read('apps/AdminSuper/GlobalInit.js');
  for (const pattern of [
    "'jueling_loss_immune:*'",
    "'tianjige2:*'",
    "'tianjiao:*'",
    "'dao:rewrite:*'",
    "'guiyishizu*'",
    "'gaoyuan'",
    "'zhutianxiuxian1.0Record2'",
  ]) {
    assert.ok(globalInit.includes(pattern), `missing redis pattern: ${pattern}`);
  }
});

test('诸天初始化备份落在插件根 _backups 且覆盖新增状态文件', () => {
  const globalInit = read('apps/AdminSuper/GlobalInit.js');
  assert.match(globalInit, /path\.join\(__PATH\.data_path, '\.\.', '\.\.', '_backups'/);
  for (const file of [
    'foreign_imperial_pass.json',
    'innate_treasure_state.json',
    'plane_rift_festival.json',
  ]) {
    assert.ok(globalInit.includes(file), `missing backup/reset coverage: ${file}`);
  }
  assert.match(globalInit, /data\.namegive = \[\]/);
});

test('所有玩家/全局写入入口均受 assertGlobalInitIdle 保护', () => {
  const xiuxian = read('model/xiuxian.js');
  for (const signature of [
    'export async function Write_channel(channel) {',
    'export async function Write_shop(shop) {',
    'export async function Write_najie(',
    'export async function Write_qinmidu(qinmidu) {',
    'export async function Write_shitu(shitu) {',
    'export async function Write_danyao(usr_qq, danyao) {',
    'export async function Write_inner_world(usr_qq, data) {',
    'export async function Write_Exchange(wupin) {',
    'export async function Write_Forum(wupin) {',
  ]) {
    assert.ok(
      bodyOf(xiuxian, signature).includes('assertGlobalInitIdle();'),
      `missing guard in: ${signature}`
    );
  }

  const xiuxianData = read('model/XiuxianData.js');
  for (const signature of [
    'setData(file_name, user_qq, data) {',
    'setAssociation(file_name, data) {',
    'saveDaofaList(list) {',
    'saveCustomDiJing(customSutras) {',
    'writelist(list, path, data) {',
  ]) {
    assert.ok(
      bodyOf(xiuxianData, signature).includes('assertGlobalInitIdle();'),
      `missing guard in: ${signature}`
    );
  }
});

test('npm test 脚本使用 node --test 自动发现', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.test, 'node --test');
});

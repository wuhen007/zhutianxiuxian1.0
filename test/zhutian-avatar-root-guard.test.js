import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const lunhuiSource = fs.readFileSync(new URL('../apps/User/lunhui.js', import.meta.url), 'utf8');
const userHomeSource = fs.readFileSync(new URL('../apps/User/UserHome.js', import.meta.url), 'utf8');
const otherShoreSource = fs.readFileSync(new URL('../apps/SecretPlace/OtherShoreWorld.js', import.meta.url), 'utf8');
const forgingSource = fs.readFileSync(new URL('../model/duanzaofu.js', import.meta.url), 'utf8');
const userStartSource = fs.readFileSync(new URL('../apps/User/UserStart.js', import.meta.url), 'utf8');
const xiuxianSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
const xiuxianDataSource = fs.readFileSync(new URL('../model/XiuxianData.js', import.meta.url), 'utf8');
const sakuraSource = fs.readFileSync(new URL('../apps/zhutianjing/mokashaonv.js', import.meta.url), 'utf8');
const projectionSource = fs.readFileSync(new URL('../apps/zhutiantouying/zhutiantouying.js', import.meta.url), 'utf8');
const mirrorAppSource = fs.readFileSync(new URL('../apps/zhutiantouying/ZhutianMirror.js', import.meta.url), 'utf8');

test('#轮回在任何确认、扣费和灵根变化前拦截已装载化身', () => {
  const methodStart = lunhuiSource.indexOf('async lunhui(e)');
  const method = lunhuiSource.slice(methodStart, lunhuiSource.indexOf('async yeslunhui(e)', methodStart));
  const guard = method.indexOf('getActiveZhutianAvatarName(player)');

  assert.notEqual(methodStart, -1);
  assert.notEqual(guard, -1);
  assert.ok(method.indexOf('withPlayerMutationLock(usr_qq') < method.indexOf("data.getData('player', usr_qq)"));
  assert.ok(guard < method.indexOf("redis.get('xiuxian:player:' + usr_qq + ':lunhui')"));
  assert.ok(guard < method.indexOf('player.轮回点--'));
  assert.match(method, /请先发送 #装载化身 本源，再进行轮回/);
});

test('纳戒改根入口按真实使用动词统一在扣物品前拦截', () => {
  const methodStart = userHomeSource.indexOf('async Player_use(e)');
  const method = userHomeSource.slice(methodStart, userHomeSource.indexOf('async Buy_comodities(e)', methodStart));
  const guard = method.indexOf('const mutatesRoot =');

  assert.notEqual(methodStart, -1);
  assert.notEqual(guard, -1);
  assert.match(userHomeSource, /ROOT_MUTATION_MEDICINE_TYPES = new Set\(\['补根', '补天', '灵根'\]\)/);
  assert.match(userHomeSource, /'圣法碎片'/);
  assert.match(
    method.slice(guard, guard + 500),
    /func == '消耗'[\s\S]*thing_exist\?\.type == '洗髓'[\s\S]*ROOT_MUTATION_ITEMS\.has\(thing_name\)[\s\S]*func == '服用'[\s\S]*ROOT_MUTATION_MEDICINE_TYPES\.has\(thing_exist\?\.type\)/
  );
  assert.ok(guard < method.indexOf("exist_najie_thing(usr_qq, thing_name, thing_exist.class"));
});

test('诸天化身内部进阶不进入外部改根物品表', () => {
  const setStart = userHomeSource.indexOf('const ROOT_MUTATION_ITEMS');
  const setSource = userHomeSource.slice(setStart, userHomeSource.indexOf(']);', setStart) + 3);

  assert.doesNotMatch(setSource, /神主触屏/);
  assert.match(userHomeSource, /syncCurrentZhutianAvatar\(player\)/);
});

test('彼岸魔主炼化的待补写结果在装载化身时保留待处理', () => {
  const methodStart = otherShoreSource.indexOf('async function deliverPendingPlayerMutations');
  const method = otherShoreSource.slice(methodStart, otherShoreSource.indexOf('async function playerIdFromEvent', methodStart));

  assert.notEqual(methodStart, -1);
  assert.match(method, /const avatarName = getActiveZhutianAvatarName\(player\)/);
  assert.match(method, /\(key, pending\) => key\.startsWith\(prefix\) && \(!avatarName \|\| pending\?\.action !== 'refine'\)/);
  assert.ok(method.indexOf("pending?.action !== 'refine'") < method.indexOf('applyPendingPlayerMutation'));
});

test('炼器师能力评测在重抽隐藏灵根前持锁并拦截化身', () => {
  const methodStart = forgingSource.indexOf('export async function settripod');
  const method = forgingSource.slice(methodStart, forgingSource.indexOf('export async function looktripod', methodStart));
  const guard = method.indexOf('getActiveZhutianAvatarName(player)');

  assert.notEqual(methodStart, -1);
  assert.match(method, /withPlayerMutationLock\(String\(qq\)/);
  assert.notEqual(guard, -1);
  assert.ok(guard < method.indexOf("readall('隐藏灵根')"));
  assert.ok(guard < method.indexOf('Write_player(qq, player)'));
});

test('再入仙途的强制入口与确认回调都在锁内拦截化身', () => {
  const forceStart = userStartSource.indexOf('async force_reCreate_player(e)');
  const forceEnd = userStartSource.indexOf('async reCreate_player(e)', forceStart);
  const forceMethod = userStartSource.slice(forceStart, forceEnd);
  assert.ok(forceMethod.indexOf('withPlayerMutationLock(usr_qq') < forceMethod.indexOf('Read_player(usr_qq)'));
  assert.ok(forceMethod.indexOf('getActiveZhutianAvatarName(player)') < forceMethod.indexOf('deleteRebirthData(usr_qq)'));

  const confirmStart = userStartSource.indexOf('async RE_xiuxian(e)');
  const confirmEnd = userStartSource.indexOf('async Show_player(e)', confirmStart);
  const confirmMethod = userStartSource.slice(confirmStart, confirmEnd);
  assert.ok(confirmMethod.indexOf('withPlayerMutationLock(usr_qq') < confirmMethod.indexOf('Read_player(usr_qq)'));
  assert.ok(confirmMethod.indexOf('getActiveZhutianAvatarName(player)') < confirmMethod.indexOf('deleteRebirthData(usr_qq)'));
});

test('一键同步在装载化身时跳过显隐灵根覆写', () => {
  const start = xiuxianSource.indexOf('export async function synchronization(e)');
  const end = xiuxianSource.indexOf('export async function channel', start);
  const method = xiuxianSource.slice(start, end);
  assert.match(method, /const activeZhutianAvatar = getActiveZhutianAvatarName\(player\)/);
  assert.ok((method.match(/!activeZhutianAvatar/g) || []).length >= 3);
});

test('诸天镜版本屏障覆盖两个玩家存档写入口', () => {
  const writeStart = xiuxianSource.indexOf('export async function Write_player');
  const writeEnd = xiuxianSource.indexOf('function normalizeEquipmentSlot', writeStart);
  const writeMethod = xiuxianSource.slice(writeStart, writeEnd);
  assert.match(writeMethod, /withPlayerMutationLock\(usr_qq/);
  assert.match(writeMethod, /assertZhutianMirrorWriteCurrent\(previousPlayer, player\)/);
  assert.match(writeMethod, /ZHUTIAN_MIRROR_STALE_WRITE'[\s\S]*throw error/);
  assert.match(xiuxianSource, /markZhutianMirrorSnapshot\(player\)/);
  assert.match(xiuxianDataSource, /assertZhutianMirrorWriteCurrent\(previousPlayer, data\)/);
  assert.match(xiuxianDataSource, /file_name === 'player' \? markZhutianMirrorSnapshot\(data\) : data/);
});

test('小樱化身进阶持玩家锁并统一同步生命本源', () => {
  const start = sakuraSource.indexOf('async sakuraAdvancement(e)');
  const end = sakuraSource.indexOf('async yueShenpan(e, player)', start);
  const method = sakuraSource.slice(start, end);
  assert.ok(method.indexOf('withPlayerMutationLock(usr_qq') < method.indexOf('Read_player(usr_qq)'));
  assert.equal((method.match(/syncLifeSourceForRootChange\(player, previousRoot, player\.灵根\)/g) || []).length, 2);
});

test('投影与镜内探索统一使用归一化玩家行动键', () => {
  assert.match(projectionSource, /function getProjectionActionKey\(playerId\)/);
  assert.doesNotMatch(projectionSource, /getProjectionActionKey\(e\)/);
  assert.match(mirrorAppSource, /function getActionKey\(playerId\)/);
  assert.doesNotMatch(mirrorAppSource, /getActionKey\(e\)/);
});

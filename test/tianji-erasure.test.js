import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as search from '../model/tianjiSearch.js';
import * as erasure from '../model/tianjiErasure.js';
import * as registry from '../model/suiyunRegistry.js';
import { createSuiyunRoot } from '../model/suiyun.js';
import { getSuiyunStage } from '../model/suiyun.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { FileRollbackTransaction } from '../apps/SecretPlace/rebirthTransaction.js';
import {
  assertZhutianAvatarRootWriteAllowed, assertZhutianMirrorWriteCurrent, markZhutianMirrorSnapshot,
} from '../utils/zhutianMirrorVersion.js';

const normalRoot = JSON.parse(fs.readFileSync(new URL('../resources/data/item/灵根列表.json', import.meta.url), 'utf8'))
  .find(item => item.name === '无演无尽者');
const copy = value => structuredClone(value);
const source = fs.readFileSync(new URL('../apps/AdminSuper/TianjiErasure.js', import.meta.url), 'utf8');
const cultivation = fs.readFileSync(new URL('../apps/User/zhengdaotixi.js', import.meta.url), 'utf8');
const event = (msg, extra = {}) => ({
  user_id: '999', group_id: 'group', self_id: 'bot', isGroup: true, msg, reply: async text => text, ...extra,
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tianji-erasure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const paths = Object.fromEntries(['player', 'najie', 'equipment'].map(kind => [
    `${kind}_path`, path.join(directory, 'resources', 'data', `xiuxian_${kind}`),
  ]));
  for (const folder of Object.values(paths)) fs.mkdirSync(folder, { recursive: true });
  const put = (id, player, najie = {}, equipment = {}) => {
    for (const [kind, value] of Object.entries({ player, najie, equipment })) {
      fs.writeFileSync(path.join(paths[`${kind}_path`], `${id}.json`), JSON.stringify(value));
    }
  };
  const read = (kind, id) => JSON.parse(fs.readFileSync(path.join(paths[`${kind}_path`], `${id}.json`), 'utf8'));
  const claimOptions = { file: path.join(directory, 'claims') };
  const claim = (id, timeline = 'main', kind = 'root') => registry.claimSuiyunUnique(kind, id, { ...claimOptions, timeline });
  const readClaim = (timeline = 'main', kind = 'root') => registry.readSuiyunUnique(kind, { ...claimOptions, timeline });
  const contexts = new Map();
  const state = { put, read, claim, readClaim, paths, failEquipment: false };
  const dependencies = {
    ...search, ...erasure, getSuiyunStage,
    fs, path, __PATH: paths, withPlayerMutationLock, FileRollbackTransaction,
    getSuiyunTimeline: registry.getSuiyunTimeline,
    readSuiyunUnique: (kind, options) => registry.readSuiyunUnique(kind, { ...claimOptions, ...options }),
    getSuiyunClaimFile: (kind, options) => registry.getSuiyunClaimFile(kind, { ...claimOptions, ...options }),
    config: { getConfig: () => ({ Master: [999] }) },
    data: { talent_list: [normalRoot] },
    plugin: class {
      constructor(options) { Object.assign(this, options); }
      setContext(name) { contexts.set(name, this.e); return this.e; }
      getContext(name) { return contexts.get(name); }
      finish(name) { contexts.delete(name); }
    },
    channel: async value => value,
    foundthing: async name => state.items?.find(item => item.name === name),
    Read_player: async id => markZhutianMirrorSnapshot(read('player', id)),
    Read_najie: async id => read('najie', id),
    Read_equipment: async id => read('equipment', id),
    Write_player: async (id, player) => {
      const previous = read('player', id);
      assertZhutianMirrorWriteCurrent(previous, player);
      assertZhutianAvatarRootWriteAllowed(previous, player);
      fs.writeFileSync(path.join(paths.player_path, `${id}.json`), JSON.stringify(player));
      markZhutianMirrorSnapshot(player);
    },
    Write_najie: async (id, najie) => {
      fs.writeFileSync(path.join(paths.najie_path, `${id}.json`), JSON.stringify(najie));
      return true;
    },
    Write_equipment: async (id, equipment) => {
      if (state.failEquipment) throw new Error('injected equipment failure');
      fs.writeFileSync(path.join(paths.equipment_path, `${id}.json`), JSON.stringify(equipment));
    },
    player_efficiency: async () => {},
    invalidateBattleEquipmentCache: () => {},
  };
  const stripped = source.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(dependencies), `${stripped}\nreturn TianjiErasure;`)(...Object.values(dependencies));
  state.app = new App();
  state.start = async (name, extra) => {
    const e = event(`#强行抹除 ${name}`, extra);
    state.app.e = e;
    return state.app.erase(e);
  };
  state.reply = async (input, extra) => {
    state.app.e = event(input, extra);
    return state.app.eraseChoice(contexts.get('eraseChoice'));
  };
  state.dependencies = dependencies;
  return state;
}

function holder(stage = 5) {
  return {
    名号: '原传承者', 灵根: createSuiyunRoot(stage), 天资等级: '岁云', 生命本源: 15000,
    岁云: { 已觉醒: true, 套装已领取: true, 自动晋升待结算: true, 累计炼化月华: 100 },
    岁云法则: true, 月华值: 88, 势力: '岁云剑宫', 势力职位: '宫主',
    诸天镜系统: { 本源灵根: createSuiyunRoot(stage), 状态版本: 2 },
  };
}

test('抹除须选择替换并确认，仅处理同时间线；清快照、觉醒和登记，备份可恢复', async t => {
  const f = fixture(t);
  f.put('1', holder());
  const other = { ...holder(1), 时间线ID: 'other' };
  f.put('2', other);
  f.claim('1');
  f.claim('2', 'other');
  f.claim('1', 'main', 'remnant');
  assert.match(await f.start('岁云传承'), /命中1名玩家/);
  assert.equal(f.read('player', '1').灵根.name, '岁云剑尊');
  assert.match(await f.reply('无演无尽者'), /确认抹除/);
  assert.equal(f.read('player', '1').岁云.已觉醒, true);
  assert.match(await f.reply('确认抹除'), /完成1人，失败0人/);
  const saved = f.read('player', '1');
  assert.deepEqual(saved.灵根, normalRoot);
  assert.deepEqual(saved.诸天镜系统.本源灵根, normalRoot);
  assert.equal(Object.hasOwn(saved.岁云, '已觉醒'), false);
  assert.equal(Object.hasOwn(saved.岁云, '自动晋升待结算'), false);
  assert.equal(saved.岁云.套装已领取, true);
  assert.equal(saved.月华值, 88);
  assert.equal(saved.势力, '');
  assert.equal(saved.岁云法则, undefined);
  assert.equal(saved.天资等级, '平庸之资');
  assert.equal(f.readClaim(), null);
  assert.equal(f.readClaim('main', 'remnant').ownerId, '1');
  assert.equal(f.readClaim('other').ownerId, '2');
  assert.deepEqual(f.read('player', '2'), other);
  const backups = path.resolve(f.paths.player_path, '../../..', '_backups');
  const backup = path.join(backups, fs.readdirSync(backups)[0]);
  const original = JSON.parse(fs.readFileSync(path.join(backup, 'player_path', '1.json'), 'utf8'));
  assert.equal(original.灵根.name, '岁云剑尊');
});

test('本源装载其他化身时，抹除原岁云本源保留当前化身，版本写屏障通过', async t => {
  const f = fixture(t);
  const player = holder();
  player.灵根 = { name: '化身甲', type: '诸天化身', 生命本源: 10 };
  player.诸天镜系统.当前化身 = '化身甲';
  player.诸天化身谱 = [{ name: '化身甲', root: copy(player.灵根) }];
  f.put('1', player);
  f.claim('1');
  await f.start('岁云传承');
  await f.reply('无演无尽者');
  await f.reply('确认抹除');
  const saved = f.read('player', '1');
  assert.deepEqual(saved.灵根, player.灵根);
  assert.equal(saved.诸天镜系统.当前化身, '化身甲');
  assert.equal(saved.诸天镜系统.本源灵根.name, '无演无尽者');
  assert.equal(saved.诸天镜系统.状态版本, 3);
});

test('普通群管理员无权限；异群回复、取消和超时均不修改玩家', async t => {
  const f = fixture(t);
  f.put('1', holder());
  assert.match(await f.start('岁云传承', { user_id: '7', isAdmin: true }), /仅限/);
  await f.start('岁云传承');
  assert.equal(await f.reply('无演无尽者', { group_id: 'elsewhere' }), 'continue');
  assert.match(await f.reply('取消'), /已取消/);
  await f.start('岁云传承');
  f.app.getContext('eraseChoice').erasure.expiresAt = 0;
  assert.match(await f.reply('无演无尽者'), /会话状态已变化/);
  assert.equal(f.read('player', '1').岁云.已觉醒, true);
});

test('写入中途失败回滚该玩家，不释放登记；确认期间名单变化则停止', async t => {
  const f = fixture(t);
  const original = holder();
  f.put('1', original);
  f.claim('1');
  await f.start('岁云传承');
  await f.reply('无演无尽者');
  f.failEquipment = true;
  assert.match(await f.reply('确认抹除'), /完成0人，失败1人/);
  assert.deepEqual(f.read('player', '1'), original);
  assert.equal(f.readClaim().ownerId, '1');
  await f.start('岁云传承');
  await f.reply('无演无尽者');
  f.put('3', holder(1));
  assert.match(await f.reply('确认抹除'), /持有者列表已变化/);
  assert.deepEqual(f.read('player', '1'), original);
});

test('仅抹除一个具体阶段时，其他阶段还在则保留该时间线登记', async t => {
  const f = fixture(t);
  f.put('1', holder(5));
  f.put('2', holder(1));
  f.claim('1');
  await f.start('岁云剑尊');
  await f.reply('无演无尽者');
  assert.match(await f.reply('确认抹除'), /登记未释放/);
  assert.equal(f.read('player', '2').灵根.name, '月华之体');
  assert.equal(f.readClaim().ownerId, '1');
});

test('岁云只残留旧登记也可清理；装备替换保留数量与绑定并校验槽位', async t => {
  const f = fixture(t);
  f.claim('deleted-player');
  await f.start('岁云传承');
  await f.reply('无演无尽者');
  assert.match(await f.reply('确认抹除'), /灵根名额已释放/);
  assert.equal(f.readClaim(), null);
  const old = { name: '旧帝兵', class: '装备', type: '帝兵', 数量: 3, 绑定者: '1', atk: 999 };
  const replacement = { name: '废铁', class: '装备', type: '帝兵', atk: 1 };
  f.items = [replacement, { name: '剑', class: '装备', type: '武器' }];
  f.put('1', { 灵根: normalRoot }, { 装备: [old] }, { 帝兵: { ...old, 数量: 1 } });
  await f.start('旧帝兵');
  assert.match(await f.reply('剑'), /帝兵类型/);
  await f.reply('废铁');
  assert.match(await f.reply('确认抹除'), /完成1人/);
  assert.equal(f.read('najie', '1').装备[0].数量, 3);
  assert.equal(f.read('najie', '1').装备[0].绑定者, '1');
  assert.equal(f.read('equipment', '1').帝兵.name, '废铁');
  assert.equal(f.read('equipment', '1').帝兵.atk, 1);
  assert.equal(f.read('equipment', '1').帝兵.pinji, 1);
});

test('真实推演命令让数字配置的管理员跳过境界并等待完整持有查询，普通玩家仍校验境界', async t => {
  const f = fixture(t);
  f.put('999', { 名号: '管理员', 灵根: normalRoot, 修为: 50_000_000, 血气: 50_000_000 });
  f.put('1', holder());
  const dependencies = {
    ...f.dependencies, existplayer: async id => fs.existsSync(path.join(f.paths.player_path, `${id}.json`)),
    hasRealmAuthority: () => false, TIANJI_COSTS: search.TIANJI_COSTS,
    parseTianjiCommand: search.parseTianjiCommand, requestNameFrom: search.requestNameFrom,
    formatTianjiSearchResult: search.formatTianjiSearchResult, ForwardMsg: async (_e, parts) => parts.join('\n'),
  };
  const start = cultivation.indexOf('async tuiyanTianji(e)');
  const end = cultivation.indexOf('  async searchTianjiaoPosition(', start);
  const handler = new Function(...Object.keys(dependencies), `return ({${cultivation.slice(start, end)}}).tuiyanTianji;`)(...Object.values(dependencies));
  const report = await handler.call({}, event('#推演天机岁云剑尊'));
  assert.match(report, /原传承者/);
  assert.match(report, /诸天镜本源灵根/);
  assert.equal(f.read('player', '999').修为, 30_000_000);
  f.put('7', { 灵根: normalRoot, 修为: 50_000_000, 血气: 50_000_000 });
  const messages = [];
  await handler.call({}, event('#推演天机 岁云剑尊', { user_id: '7', reply: async msg => messages.push(msg) }));
  assert.match(messages[0], /免境界要求/);
  assert.equal(f.read('player', '7').修为, 50_000_000);
});

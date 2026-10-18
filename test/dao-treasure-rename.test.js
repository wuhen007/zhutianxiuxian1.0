import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import template from 'art-template';
import * as dao from '../model/daoTreasure.js';
import { createEternalImmortalMap, hasEquippedInnateTreasure } from '../model/innateTreasure.js';
import { swapEquipmentState } from '../model/equipmentSwap.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = structuredClone;
const owner = 'rename-fixture';
function fixture(item) {
  const state = {
    item: clone(item), player: { id: owner, 名号: '月下器主', 大道主权柄: '世界', 当前大道至宝: item.name },
    writes: 0, invalidations: 0,
    registry: { treasure: { name: item.name, ownerId: owner, integrity: 100, origin: 9, authorities: { 世界: '完整' } } },
  };
  const deps = {
    ...dao, path, withPlayerMutationLock, plugin: class { constructor(value) { Object.assign(this, value); } },
    verc: () => true, channel: async id => id, existplayer: async () => true,
    Read_player: async () => clone(state.player), Read_equipment: async () => ({ 至宝: clone(state.item) }),
    getActiveZhutianAvatarName: () => state.avatar ? '测试化身' : '',
    foundthing: async name => name === '木剑' ? { name: '木剑' } : false,
    readDaoTreasureState: () => clone(state.registry),
    isDaoTreasureOwner: id => state.registry.treasure?.ownerId === id,
    Write_equipment: async (_id, value) => {
      state.item = clone(value.至宝); state.writes++;
      state.player.当前大道至宝 = state.item.name;
      state.player.大道至宝器名 = state.item.自定义名称 || state.item.name;
      if (state.failWrite) throw new Error('fixture-equipment-write');
    },
    invalidateBattleEquipmentCache: () => { state.invalidations++; },
    __PATH: { player_path: '/fixture/player', equipment_path: '/fixture/equipment' },
    FileRollbackTransaction: class {
      constructor() { this.before = clone({ item: state.item, player: state.player }); }
      capture() {} commit() {} rollback() { Object.assign(state, clone(this.before)); }
    },
  };
  const stripped = read('apps/duanzao/DaoTreasure.js').replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(deps), `${stripped};return DaoTreasure;`)(...Object.values(deps));
  state.app = new App();
  state.app.deliverTreasure = async () => {};
  state.event = msg => ({ user_id: owner, msg, reply: async text => text });
  state.rename = name => state.app.renameTreasure(state.event(`#大道至宝改名 ${name}`));
  return state;
}

const branch = () => ({
  ...JSON.parse(read('resources/data/item/特殊装备列表.json')).find(item => item.name === '无上天阙枝'),
  绑定者: owner, author_name: owner, 数量: 1, pinji: 6,
});

test('大道至宝改名覆盖天阙枝、永恒仙图和自铸至宝，只改器名、归属属性权柄和真名保留', async () => {
  for (const item of [branch(), createEternalImmortalMap(owner),
    dao.createDaoTreasureItem({ name: '诸天文明炉', ownerId: owner, integrity: 100 }),
    { ...branch(), id: 'other-shore-1', name: '彼岸宝器', sourceForgeId: 'forge-1', authorities: [{ name: '镇海', sourceTreasureName: '定海珠' }] }]) {
    const f = fixture(item);
    const registry = clone(f.registry);
    assert.ok(f.app.rule.some(rule => rule.fnc === 'renameTreasure' && new RegExp(rule.reg).test('#大道至宝改名 岁月青枝')));
    assert.match(await f.rename('岁月青枝'), /器名已改为【岁月青枝】/);
    assert.deepEqual(f.item, { ...item, 自定义名称: '岁月青枝' });
    assert.deepEqual(f.registry, registry);
    assert.equal(f.player.当前大道至宝, item.name);
    assert.equal(f.player.大道主权柄, '世界');
    if (item.永恒仙图本体) assert.equal(hasEquippedInnateTreasure(f.player, '万道神炉'), true);
    assert.match(await f.app.showTreasure(f.event('#大道至宝')), /岁月青枝/);
    assert.match(await f.rename('岁月青枝'), /无需重复/);
    assert.equal(f.writes, 1);
    await f.rename(item.name);
    assert.deepEqual(f.item, item);
  }
});

test('改名资格、命名格式和重名校验；保存异常回滚且不改全局注册表', async () => {
  for (const bad of ['', '一二三四五六七八九十甲', '<script>', '跨\n行', '新名*2', '含 空白', '#木剑', '木剑']) {
    const f = fixture(branch());
    await f.rename(bad);
    assert.equal(f.writes, 0, bad);
  }
  for (const kind of ['ordinary', 'other-owner', 'unbound', 'projection', 'avatar']) {
    const f = fixture(branch());
    if (kind === 'ordinary') f.item = { name: '木剑', type: '武器', 绑定者: owner };
    if (kind === 'other-owner') f.item.author_name = 'other-owner';
    if (kind === 'unbound') { delete f.item.author_name; delete f.item.绑定者; }
    if (kind === 'projection') f.item.先天投影截止 = Date.now() + 1000;
    if (kind === 'avatar') f.avatar = true;
    await f.rename('岁月青枝');
    assert.equal(f.writes, 0, kind);
  }
  const f = fixture(branch()), before = clone({ item: f.item, player: f.player, registry: f.registry });
  f.failWrite = true;
  await assert.rejects(f.rename('岁月青枝'), /fixture-equipment-write/);
  assert.deepEqual({ item: f.item, player: f.player, registry: f.registry }, before);
  assert.equal(f.invalidations, 1);
});

test('新器名随实体换装保留；纳戒模板转义名称，本名和代号仍能识别装备', async () => {
  const f = fixture(branch());
  await f.rename('岁月青枝');
  const bag = { 装备: [{ name: '备用至宝', type: '至宝', pinji: 6, 数量: 1 }] };
  const swapped = swapEquipmentState(bag, { 至宝: f.item }, bag.装备[0]);
  assert.equal(swapped.ok, true);
  const named = swapped.najie.装备.find(item => item.name === '无上天阙枝');
  assert.equal(named.自定义名称, '岁月青枝');
  const reequip = swapEquipmentState(swapped.najie, swapped.equipment, named);
  assert.equal(reequip.equipment.至宝.自定义名称, '岁月青枝');
  for (const file of ['resources/html/najie/najie.html', 'resources/html/najie_copy/najie_copy.html', 'resources/html/najie-category/najie-category.html']) {
    assert.doesNotThrow(() => template.compile(read(file)));
    assert.match(read(file), /item\.自定义名称 \|\| item\.name/);
  }
  const empty = { name: '', atk: 0, def: 0, HP: 0, bao: 0, pinji: 0 };
  const output = template.render(read('resources/html/equipment/equipment.html'), {
    pluResPath: '', pifu: 1, arms: empty, armor: empty, treasure: empty, nickname: '测试',
    player_atk: 1, player_def: 1, player_bao: 0, player_maxHP: 1, player_nowHP: 1,
    daoTreasure: { ...f.item, 自定义名称: '<script>' },
  });
  assert.ok(!output.includes('<script>'));
  assert.match(output, /本名：无上天阙枝/);
  const coreSource = read('model/xiuxian.js');
  assert.match(coreSource, /player\.大道至宝器名 = daoTreasureEquipped \? equipment\.至宝\.自定义名称 \|\| equipment\.至宝\.name : ''/);
  const from = coreSource.indexOf('export async function get_equipment_img(');
  const to = coreSource.indexOf('// 新增函数：生成特定类别的纳戒图片', from);
  let panel;
  const deps = {
    channel: async id => id,
    data: { existData: () => true, getData: kind => kind === 'equipment' ? { 武器: empty, 护具: empty, 法宝: empty, 至宝: f.item }
      : { 名号: '器主', 暴击率: .1 } },
    Show: class { async get_equipmnetData(value) { panel = value; return value; } },
    puppeteer: { screenshot: async () => 'image' },
  };
  const screenshot = new Function(...Object.keys(deps),
    `${coreSource.slice(from, to).replace('export ', '')}; return get_equipment_img;`)(...Object.values(deps));
  await screenshot({ user_id: owner });
  assert.equal(panel.daoTreasure.自定义名称, '岁月青枝');
});

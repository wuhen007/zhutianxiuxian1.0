import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import template from 'art-template';
import * as core from '../model/suiyun.js';
import { getRealmAuthorityLevel } from '../model/realmAuthority.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import Show from '../model/show.js';
import { getSuperdimensionalRewriteName } from '../model/shengfaFragment.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const hour = core.SUIYUN_HOUR_MS;
const player = stage => ({
  id: 'fixture-palace', 名号: '月华宫主', 灵根: core.createSuiyunRoot(stage),
  岁云: {}, 岁云之力: 3, 仙道潜力: 100, 势力: core.SUIYUN_PALACE_FACTION, 势力职位: '宫主',
});

test('小世界前三阶只产50潜力，岁云化身起每小时0.5岁云之力乘世界时间流速，潜力不翻倍', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const p = player(stage), world = { world_name: '测试世界', attributes: { 时间流速: '1:1000' } };
    core.ascendSuiyunPalace(world, 0);
    const result = core.settleSuiyunPalace(p, world, { now: 2.5 * hour });
    assert.equal(result.hours, 2);
    assert.equal(result.potentialGain, 100);
    assert.equal(result.power, stage >= 4 ? 1000 : 0);
    assert.equal(p.岁云之力, stage >= 4 ? 1003 : 3);
    assert.equal(p.仙道潜力, 200);
    assert.equal(core.settleSuiyunPalace(p, world, { now: 2.5 * hour }).power, 0);
    assert.equal(p.仙道潜力, 200);
    const resumed = JSON.parse(JSON.stringify({ p, world }));
    const next = core.settleSuiyunPalace(resumed.p, resumed.world, { now: 3 * hour });
    assert.equal(next.potentialGain, 50);
    assert.equal(next.power, stage >= 4 ? 500 : 0);
  }
});

test('晋升岁云化身从晋升时刻计岁云之力，两种产出错峰满小时仍落盘且不补前三阶停留时间', () => {
  const p = player(3), world = { world_name: '旧世界' };
  p.mijinglevel_id = 16;
  core.ascendSuiyunPalace(world, 0);
  core.settleSuiyunPalace(p, world, { now: 2 * hour });
  assert.equal(core.advanceSuiyun(p, { now: 2.5 * hour }).ok, true);
  assert.equal(p.岁云.岁云之力启用时间, 2.5 * hour);
  const beforeHour = core.settleSuiyunPalace(p, world, { now: 3 * hour });
  assert.equal(beforeHour.potentialGain, 50);
  assert.equal(beforeHour.power, 0);
  const firstPower = core.settleSuiyunPalace(p, world, { now: 3.5 * hour });
  assert.equal(firstPower.hours, 0);
  assert.equal(firstPower.powerHours, 1);
  assert.equal(firstPower.power, .5);
  assert.equal(firstPower.changed, true);
  assert.equal(p.岁云之力, 3.5);
  assert.equal(core.settleSuiyunPalace(p, world, { now: 3.5 * hour }).changed, false);
  assert.equal(core.settleSuiyunPalace(p, world, { now: 4.5 * hour }).power, .5);
});

test('已有高阶段旧档按原未结算小时使用新倍率，字符串时间规范为数值且不重发已有余额', () => {
  const p = player(5);
  const world = { 月华天宫: true, 月华天宫上次结算时间: String(hour), 月华天宫岁云结算时间: String(hour) };
  const first = core.settleSuiyunPalace(p, world, { now: 4 * hour });
  assert.equal(first.power, 1.5);
  assert.equal(first.potentialGain, 150);
  assert.equal(p.岁云之力, 4.5);
  assert.equal(typeof world.月华天宫岁云结算时间, 'number');
  assert.equal(core.settleSuiyunPalace(p, world, { now: 4 * hour }).power, 0);
});

test('真实天宫结算方法保存潜力零小时但岁云之力满一小时的收益，重复调用余额不增长', async () => {
  const source = read('apps/User/Suiyun.js');
  const from = source.indexOf('  async settlePalace('), to = source.indexOf('\n  async power(', from);
  let stored = player(4), writes = 0;
  const world = { player_qq: stored.id, 月华天宫: true, 月华天宫上次结算时间: hour, 月华天宫岁云结算时间: .5 * hour };
  const deps = {
    ...core, data: { xiaoshijie: [world] }, Date: { now: () => 1.5 * hour },
    transactionFor: () => ({ commit() {}, rollback() {} }), saveWorlds: () => {},
    Write_player: async (_id, value) => { stored = clone(value); writes++; },
  };
  const settle = new Function(...Object.keys(deps), `return ({${source.slice(from, to)}}).settlePalace;`)(...Object.values(deps));
  await settle(stored.id, clone(stored));
  assert.equal(stored.岁云之力, 3.5);
  assert.equal(stored.仙道潜力, 100);
  await settle(stored.id, clone(stored));
  assert.equal(writes, 1);
  assert.equal(stored.岁云之力, 3.5);
});

test('世界1到5级时间流速为1/2/3/4/8倍，非法时间流速回退1倍，余量不提前发放', () => {
  for (const [flow, expected] of [['1:1', .5], ['1:2', 1], ['1:3', 1.5], ['1:4', 2], ['1:8', 4],
    ['2:1', .25], ['bad', .5], ['0:8', .5], ['1:Infinity', .5], ['-1:8', .5]]) {
    const p = player(4), world = { attributes: { 时间流速: flow } };
    core.ascendSuiyunPalace(world, 0);
    assert.equal(core.settleSuiyunPalace(p, world, { now: hour - 1 }).power, 0);
    assert.equal(core.settleSuiyunPalace(p, world, { now: 1.5 * hour }).power, expected, flow);
    assert.equal(core.settleSuiyunPalace(p, world, { now: 2 * hour }).power, expected, flow);
    assert.equal(core.settleSuiyunPalace(p, world, { now: 2 * hour }).power, 0);
  }
});

test('真实小世界升级先按原流速结清历史小时，之后才用新等级流速产岁云之力', async () => {
  const source = read('apps/Garden/xiaoshijie.js');
  const start = source.indexOf('  async upgradeSmallWorld('), end = source.indexOf('  // 创建分身', start);
  const settingsFrom = source.indexOf('const WORLD_LEVELS ='), settingsEnd = source.indexOf('// 品级产出倍率', settingsFrom);
  const world = { player_qq: 'owner', level: 1, 月华天宫: true, 月华天宫上次结算时间: 0,
    月华天宫岁云结算时间: 0, attributes: { 时间流速: '1:1', 特殊资源: [] } };
  const p = { ...player(4), level_id: 47 };
  let oldFlow, saves = 0;
  const deps = {
    ...core, withPlayerMutationLock,
    data: { xiaoshijie: [world], lib_path: '/fixture/world' },
    channel: async id => id, Read_player: async () => p,
    exist_najie_thing: async () => 100, Add_najie_thing: async () => {},
    SPECIAL_RESOURCES: [], fs: { writeFileSync: () => { saves++; } },
    loadSuiyun: async () => ({ Suiyun: class {
      async settlePalace(_id, holder) {
        oldFlow = world.attributes.时间流速;
        core.settleSuiyunPalace(holder, world, { now: 2 * hour });
      }
    } }),
  };
  const method = new Function(...Object.keys(deps),
    `${source.slice(settingsFrom, settingsEnd)}; return ({${source.slice(start, end).replace("await import('../User/Suiyun.js')", 'await loadSuiyun()')}}).upgradeSmallWorld;`)(...Object.values(deps));
  await method({ user_id: 'owner', isGroup: true, reply: async () => {} });
  assert.equal(oldFlow, '1:1');
  assert.equal(p.岁云之力, 4); // 原余额3 + 原流速2小时×0.5
  assert.equal(world.level, 2);
  assert.equal(world.attributes.时间流速, '1:2');
  assert.equal(core.settleSuiyunPalace(p, world, { now: 3 * hour }).power, 1);
  assert.equal(saves, 1);
});

test('两名玩家交错收获时，失败者回滚不覆盖他人岁云之力结算时钟', async () => {
  const source = read('apps/Garden/xiaoshijie.js');
  const start = source.indexOf('  async harvestResources(e)');
  const end = source.indexOf('  async harvestResourcesLocked(', start);
  const worlds = [
    { player_qq: 'failed', 月华天宫岁云结算时间: 0 },
    { player_qq: 'success', 月华天宫岁云结算时间: 0 },
  ];
  let saved = clone(worlds);
  const playerFile = id => path.join('/fixture/player', `${id}.json`);
  const files = new Map([[playerFile('failed'), 'old-player']]);
  const deps = {
    data: { lib_path: '/fixture/world', xiaoshijie: worlds }, path, withPlayerMutationLock,
    __PATH: { player_path: '/fixture/player', najie_path: '/fixture/bag' },
    channel: async id => id,
    fs: { writeFileSync: (_file, contents) => { saved = JSON.parse(contents); } },
    FileRollbackTransaction: class {
      constructor() { this.snapshots = new Map(); }
      capture(file) {
        assert.ok(!file.endsWith('小世界列表.json'), '共享世界文件应按玩家回滚');
        this.snapshots.set(file, files.get(file));
      }
      rollback() { for (const [file, value] of this.snapshots) files.set(file, value); }
      commit() {}
    },
  };
  const app = new Function(...Object.keys(deps), `return ({${source.slice(start, end)}});`)(...Object.values(deps));
  app.harvestResourcesLocked = async (_e, id) => {
    const world = worlds.find(item => item.player_qq === id);
    world.月华天宫岁云结算时间 = 10 * hour;
    files.set(playerFile(id), 'credited-player');
    if (id === 'failed') {
      await app.harvestResources({ isGroup: true, user_id: 'success' });
      throw new Error('fixture-harvest-failed');
    }
    return true;
  };
  await assert.rejects(app.harvestResources({ isGroup: true, user_id: 'failed' }), /fixture-harvest-failed/);
  assert.equal(files.get(playerFile('failed')), 'old-player');
  assert.equal(files.get(playerFile('success')), 'credited-player');
  assert.equal(saved[0].月华天宫岁云结算时间, 0);
  assert.equal(saved[1].月华天宫岁云结算时间, 10 * hour);
  assert.deepEqual(saved, worlds);
});

test('仙帝和更高境界重塑既不赋予也不覆盖岁云五阶段，普通灵根重塑继续生效', async () => {
  const source = read('apps/User/zhengdaotixi.js');
  const start = source.indexOf('async reshapeLinggen('), end = source.indexOf('// 推演天机功能', start);
  for (const authority of [21, 22, 23, 24]) {
    for (let stage = 1; stage <= 5; stage++) {
      for (const direction of ['source', 'target']) {
        const ordinary = { name: '金灵根', type: '真灵根', 生命本源: 0, eff: 1 };
        const p = { ...player(stage), ...(direction === 'source' ? { 灵根: ordinary } : {}) };
        const saved = clone(p);
        let writes = 0;
        const deps = {
          getSuiyunStage: core.getSuiyunStage, getRealmAuthorityLevel, withPlayerMutationLock, channel: async id => id,
          Read_player: async id => id === 'caster' ? { 名号: '帝者', mijinglevel_id: authority } : p,
          existplayer: async () => true, getActiveZhutianAvatarName: () => '',
          data: { talent_list: [ordinary, core.createSuiyunRoot(stage)] },
          Write_player: async () => { writes++; },
        };
        const method = new Function(...Object.keys(deps), `return ({${source.slice(start,end)}}).reshapeLinggen;`)(...Object.values(deps));
        const name = direction === 'source' ? core.createSuiyunRoot(stage).name : ordinary.name;
        const reply = await method({ isGroup: true, user_id: 'caster', msg: `#重塑灵根 ${name}`, message: [{ type: 'at', qq: p.id }], reply: async text => text });
        assert.match(reply, /唯一传承护持/);
        assert.equal(writes, 0);
        assert.deepEqual(p, saved);
      }
    }
  }
  let writes = 0;
  const p = { 名号: '普通修士', 灵根: { name: '木灵根' } };
  const deps = {
    getSuiyunStage: core.getSuiyunStage, getRealmAuthorityLevel, withPlayerMutationLock, channel: async id => id,
    Read_player: async id => id === 'caster' ? { mijinglevel_id: 21 } : p, existplayer: async () => true,
    getActiveZhutianAvatarName: () => '', data: { talent_list: [{ name: '金灵根', 生命本源: 0 }] },
    Write_player: async () => { writes++; }, Read_equipment: async () => ({}), Write_equipment: async () => {}, player_efficiency: async () => {},
  };
  const method = new Function(...Object.keys(deps), `return ({${source.slice(start,end)}}).reshapeLinggen;`)(...Object.values(deps));
  await method({ isGroup: true, user_id: 'caster', msg: '#重塑灵根 金灵根', message: [{ type: 'at', qq: 'ordinary' }], reply: async text => text });
  assert.equal(writes, 1);
  assert.equal(p.灵根.name, '金灵根');
});

test('超维改写同样保护岁云已有灵根，拒绝后不消耗超维之力', async () => {
  const source = read('apps/User/Superdimensional.js');
  const start = source.indexOf('  async rewriteTarget('), end = source.indexOf('  rewriteFate(', start);
  assert.ok(start >= 0 && end > start);
  const caster = { id: 'caster', 超维之力: 20 }, target = player(4);
  const deps = {
    getSuiyunStage: core.getSuiyunStage, getSuperdimensionalRewriteName, existplayer: async () => true,
    withPlayerLocks: async (_ids, task) => task(), Read_player: async id => clone(id === 'caster' ? caster : target),
    Write_player: async () => assert.fail('岁云保护应在写入前返回'),
    spendSuperdimensionalPower: () => assert.fail('岁云保护不扣超维之力'),
  };
  const method = new Function(...Object.keys(deps), `return ({${source.slice(start,end)}}).rewriteTarget;`)(...Object.values(deps));
  const app = { requireHolder: async () => ({ qq: 'caster' }), targetQQ: async () => target.id, rewriteTarget: method };
  const reply = await app.rewriteTarget({ msg: '#超维改写灵根 金灵根', reply: async text => text }, '灵根');
  assert.match(reply, /保留当前岁云本源/);
  assert.equal(caster.超维之力, 20);
});

test('剑宫商店真实UI方法渲染全部价格与余额、超长昵称正确转义，权限与文字回退保留', async () => {
  const source = read('apps/User/Suiyun.js');
  const start = source.indexOf('  async showPalaceShop('), end = source.indexOf('  async yearGift(', start);
  const p = { ...player(4), 名号: '月华<script>铭刻</script>与万古剑意的宫主', 源石: 20000000 };
  const shop = JSON.parse(read('resources/data/item/势力商店/岁云剑宫商店.json'));
  let html, rendered, fail = false, screenshots = 0;
  const deps = {
    ...core, Read_player: async () => clone(p), Show, data: { suiyunjianGongshangdian: shop }, console: { error() {} },
    puppeteer: { screenshot: async (name, view) => {
      screenshots++;
      if (fail) return false;
      assert.equal(name, 'suiyun_shop');
      assert.match(view.tplFile, /suiyun_shop\/suiyun_shop\.html$/);
      rendered = view.panel;
      html = template.render(read('resources/html/suiyun_shop/suiyun_shop.html'), view);
      return 'fixture-image';
    } },
  };
  const method = new Function(...Object.keys(deps), `return ({${source.slice(start,end)}}).showPalaceShop;`)(...Object.values(deps));
  const app = { context: async () => ({ qq: p.id }), showPalaceShop: method };
  const e = { user_id: p.id, reply: async message => message };
  assert.equal(await app.showPalaceShop(e), 'fixture-image');
  assert.equal(rendered.items.length, shop.length);
  assert.equal(rendered.balance, '20,000,000');
  assert.ok(rendered.items.some(item => item.affordable));
  assert.ok(rendered.items.some(item => !item.affordable));
  for (const item of shop) assert.ok(html.includes(item.name));
  assert.ok(html.includes('&#60;script&#62;') || html.includes('&lt;script&gt;'));
  assert.equal(html.includes('<script>铭刻</script>'), false);
  fail = true;
  assert.match(await app.showPalaceShop(e), /#剑宫兑换.*龙髓/);
  p.势力 = '无';
  assert.match(await app.showPalaceShop(e), /只向本宫/);
  assert.equal(screenshots, 2);
});

test('不带物品名的剑宫兑换确实调用商店UI，带名称时沿用原兑换入口', async () => {
  const source = read('apps/User/UserHome.js');
  const start = source.indexOf('async Buy_suiyunjianGong('), end = source.indexOf('//出售商品', start);
  const body = source.slice(start,end).replace("await import('./Suiyun.js')", 'await loadSuiyun()');
  let images = 0;
  const deps = {
    verc: () => true, channel: async id => id, existplayer: async () => true,
    Read_player: async () => ({ 势力: '岁云剑宫' }), data: { suiyunjianGongshangdian: [] },
    loadSuiyun: async () => ({ Suiyun: class { async showPalaceShop() { images++; return 'shop-ui'; } } }),
    convert2integer: async number => Number(number),
  };
  const method = new Function(...Object.keys(deps), `return ({${body}}).Buy_suiyunjianGong;`)(...Object.values(deps));
  const e = msg => ({ user_id: 'owner', msg, reply: async text => text });
  assert.equal(await method(e('#剑宫兑换')), 'shop-ui');
  assert.match(await method(e('#剑宫兑换 不存在的物品*1')), /不在我岁云剑宫/);
  assert.equal(images, 1);
});

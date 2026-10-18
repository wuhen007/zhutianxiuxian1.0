import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { swapEquipmentState, selectEquipmentByCode } from '../model/equipmentSwap.js';
import { calculateEquippedStats, calculateEquipmentSetBonuses, isCanonicalDaluoSwordEmbryo } from '../model/equipmentStats.js';
import { createSuiyunRoot, getSuiyunLotusBonus } from '../model/suiyun.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { findItemSources } from '../model/itemSourceFinder.js';
import { migrateLegacyInnateTreasureSlot } from '../model/innateTreasure.js';
import { normalizeRelicState } from '../model/relicSystem.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const json = file => JSON.parse(read(`resources/data/item/${file}`));
const copy = structuredClone;
const core = read('model/xiuxian.js');
const home = read('apps/User/UserHome.js');
const catalog = json('帝兵列表.json');
const shops = {
  yaoguangshangdian: json('势力商店/摇光商店.json'),
  suiyunjianGongshangdian: json('势力商店/岁云剑宫商店.json'),
  jianyunhaishangdian: json('势力商店/剑云海商店.json'),
};

// 使用真实物品查询、发放、兑换、装备命令及属性重算，只替换存档IO与外围增益。
function fixture(palace = false) {
  const state = {
    player: { id: 'buyer', 名号: '测试修士', 势力: palace ? '岁云剑宫' : '摇光圣地',
      势力职位: palace ? '宫主' : '圣子', power_place: 1, 源石: 1e9,
      level_id: 1, Physique_id: 1, mijinglevel_id: 1, xiangulevel_id: 1, huafenlevel_id: 1,
      灵根: palace ? createSuiyunRoot(1) : { name: '凡体' }, 学习的功法: [], 当前血量: 1000 },
    bag: { 装备: [] }, equipment: {}, replies: [],
  };
  const realm = [{ level_id: 1, 基础攻击: 100, 基础防御: 200, 基础血量: 300, 基础暴击: 0 }];
  const zero = { 攻击: 0, 防御: 0, 血量: 0 };
  const data = new Proxy({
    ...shops, dibing_list: catalog, Level_list: realm, LevelMax_list: realm,
    Levelmijing_list: realm, xiangujinshi_list: realm, huafen_list: realm,
  }, { get: (target, key) => target[key] || [] });
  const dependencies = {
    data, path, withPlayerMutationLock, swapEquipmentState, selectEquipmentByCode,
    migrateLegacyInnateTreasureSlot, normalizeRelicState,
    calculateEquippedStats, calculateEquipmentSetBonuses, getSuiyunLotusBonus, isCanonicalDaluoSwordEmbryo,
    DAO_TREASURE_ALL_ATTRIBUTE_BONUS: 300,
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async id => id, existplayer: async () => true,
    convert2integer: async value => Math.max(1, Math.trunc(Number(value)) || 1),
    isNotNull: value => value != null, getActiveZhutianAvatarName: () => '',
    PLACE_LOCATION_MAP: { 遮天位面: 1 },
    __PATH: { player_path: '/fixture/player', najie_path: '/fixture/bag', equipment_path: '/fixture/equipment' },
    Read_player: async () => copy(state.player),
    Write_player: async (_id, value) => { state.player = copy(value); },
    Read_najie: async () => copy(state.bag),
    Write_najie: async (_id, value) => { state.bag = copy(value); return true; },
    Read_equipment: async () => copy(state.equipment),
    Add_源石: async (_id, amount) => { state.player.源石 += amount; },
    exist_najie_thing: async (_id, name, _category, quality) => state.bag.装备
      .filter(item => item.name === name && (quality == null || item.pinji === quality))
      .reduce((sum, item) => sum + item.数量, 0) || false,
    get_equipment_img: async () => 'equipment-image',
    normalizeNajieThingClass: value => value, recordRewardClaim() {},
    readDaoTreasureState: () => ({}), Read_it: async () => [],
    assertGlobalInitIdle() {}, assertTribulationWriteAllowed: async () => {},
    getInnateTreasureProjectionName: () => '', isInnateTreasureName: () => false,
    isDaoTreasureItem: () => false, updateEquippedInnateTreasure() {},
    ensureExtraCultivationState() {}, ensureFlowerPollenState() {},
    calculateExtraAttributeLimit: () => ({ total: 1e15 }),
    calculateXianguExtremeBonus: () => zero, calculateFlowerExtremeBonus: () => zero,
    calculateFlowerFieldBonus: () => zero, getFlowerPathAttributeMultiplier: () => 1,
    getMinggeEffects: () => ({}), calculateMinggeFourRealmBonus: () => zero,
    hasEquippedInnateTreasure: () => false, getPetAbilityBonus: () => 0,
    readXianguRate: () => 0, XIANGU_COMBAT_RATE_KEYS: {}, getRealmAuthorityLevel: () => 0,
    applyRelicEffectsToPlayer() {}, Add_HP: async () => {}, invalidateBattleEquipmentCache() {},
    writeJsonAtomically: (_file, value) => { state.equipment = copy(value); },
    FileRollbackTransaction: class {
      constructor() { this.before = copy({ player: state.player, bag: state.bag, equipment: state.equipment }); }
      capture() {} commit() {}
      rollback() { Object.assign(state, copy(this.before)); }
    },
  };
  const load = (name, start, end) => {
    const from = core.indexOf(start), to = core.indexOf(end, from);
    assert.ok(from >= 0 && to > from, name);
    dependencies[name] = new Function(...Object.keys(dependencies),
      `${core.slice(from, to).replace(/^export /gm, '')}; return ${name};`)(...Object.values(dependencies));
  };
  load('normalizeEquipment', 'function normalizeEquipmentSlot(', 'const TB_EQUIPMENT_CACHE_TTL_MS');
  load('foundthing', 'export async function foundthing(', 'export async function get_shitujifen_img(');
  load('Add_najie_thing', 'export async function Add_najie_thing(', '//替换装备');
  load('Write_equipment', 'export async function Write_equipment(', 'export async function Write_linggen(');
  load('instead_equipment', 'export async function instead_equipment(', '//发送转发消息');
  const stripped = home.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(dependencies), `${stripped}; return UserHome;`)(...Object.values(dependencies));
  state.app = new App();
  state.event = msg => ({ user_id: 'buyer', msg, reply: async text => { state.replies.push(text); return text; } });
  state.rebuild = () => dependencies.Write_equipment('buyer', state.equipment);
  state.find = dependencies.foundthing;
  return state;
}

test('摇光黑金鼎真品和剑宫月华帝剑从兑换到装备均使用正式帝兵定义，实际增加战斗三维', async () => {
  for (const [palace, name, command, method, source] of [
    [false, '龙纹黑金鼎', '#摇光兑换 龙纹黑金鼎', 'Buy_yaoguang', '摇光商店'],
    [true, '月华帝剑', '#剑宫兑换 月华帝剑', 'Buy_suiyunjianGong', '岁云剑宫商店'],
  ]) {
    const f = fixture(palace);
    const entry = await f.find(name);
    const shop = (palace ? shops.suiyunjianGongshangdian : shops.yaoguangshangdian).find(item => item.name === name);
    assert.ok(entry, `${name}应可通过真实foundthing查询`);
    for (const field of ['id', 'class', 'type', '品阶', 'atk', 'def', 'HP', '全属性', 'bao', '稀有度', '出售价']) {
      assert.equal(entry[field], shop[field], `${name}/${field}商店与正式定义一致`);
    }
    assert.ok(findItemSources(shops, name).includes(source));
    await f.rebuild();
    const before = copy(f.player);
    await f.app[method](f.event(command));
    assert.equal(f.player.源石, before.源石 - shop.出售价);
    assert.equal(f.bag.装备.length, 1);
    const owned = copy(f.bag.装备[0]);
    assert.equal(owned.name, name);
    assert.equal(owned.type, '帝兵');
    assert.equal(owned.数量, 1);
    assert.ok(Number.isInteger(owned.pinji) && owned.pinji >= 0 && owned.pinji <= 5);
    await f.app.Player_use(f.event(`#装备${name}`));
    assert.equal(f.equipment.帝兵.name, name);
    assert.equal(f.bag.装备.length, 0);
    for (const [field, itemField, extraBase] of [['攻击', 'atk', 300], ['防御', 'def', 600], ['血量上限', 'HP', 900]]) {
      // 入纳戒时按随机品级缩放属性，缩放系数带浮点尾巴（如 33000000.000000004），
      // 而玩家侧属性按整数入账，这里按容差比较，避免随机品级让断言偶发失败。
      const gain = f.player[field] - before[field];
      const expected = owned[itemField] + entry.全属性 * extraBase;
      assert.ok(Math.abs(gain - expected) < 1e-6, `${name}/${field}实际增加${gain}，应约${expected}`);
    }
    assert.ok(f.replies.includes('equipment-image'));
    const equipped = copy(f.player);
    await f.rebuild();
    for (const field of ['攻击', '防御', '血量上限']) assert.equal(f.player[field], equipped[field]);
    assert.deepEqual(f.player.学习的功法, []);
    assert.equal(f.player.势力职位, palace ? '宫主' : '圣子');
  }
});

test('黑金鼎真品与仿品独立存在，剑云海原帝剑条件保留，缺钱不发放新帝兵', async () => {
  const f = fixture(true);
  const replica = await f.find('龙纹黑金鼎仿品');
  assert.equal(replica.品阶, '仿品');
  assert.equal(replica.全属性, 1.5);
  assert.equal((await f.find('龙纹黑金鼎')).全属性, 60);
  assert.equal((await f.find('月华帝剑')).全属性, 150);
  assert.equal(shops.suiyunjianGongshangdian.some(item => item.name === '终古剑之主'), false);
  assert.ok(shops.jianyunhaishangdian.some(item => item.name === '终古剑之主'));
  f.player.源石 = 1;
  assert.match(await f.app.Buy_suiyunjianGong(f.event('#剑宫兑换 月华帝剑')), /尚缺/);
  assert.equal(f.bag.装备.length, 0);
  assert.equal(f.player.源石, 1);
  f.bag.装备.push({ ...copy(catalog.find(item => item.name === '终古剑之主')), 数量: 1, pinji: 1 });
  await f.app.Player_use(f.event('#装备终古剑之主'));
  assert.equal(f.equipment.帝兵?.name, undefined);
  assert.ok(f.replies.some(reply => reply.includes('终古剑之主·剑器通灵')));
});

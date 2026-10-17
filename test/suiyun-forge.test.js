import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import * as occupations from '../model/occupationCollection.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const copy = structuredClone;
const helperSource = read('model/duanzaofu.js');
const forgeSource = read('apps/duanzao/duanzao.js');
const furnaces = JSON.parse(read('resources/data/item/炼器炉.json'));
const fires = JSON.parse(read('resources/data/item/炼器火.json'));

function fixture(stage = 1) {
  const state = {
    player: { id: 'owner', 名号: '月下炼器师', occupation: '炼器师', occupation_level: 3,
      occupation_exp: 0, 月华值: 20000, 灵根: core.createSuiyunRoot(stage), 岁云: { 累计炼化月华: 123 },
      锻造天赋: 100, 隐藏灵根: { name: '测试器灵根', type: 1, 控器: 1 }, 炉火: '凡火', level_id: 30 },
    tripods: [{ qq: 'owner', 炉阶: '凡铁炉', 容纳量: 10, 材料: ['测试金属'], 数量: [1], TIME: 123, 状态: 1 }],
    inventory: [], tokens: { 时光令: 1, 造化本源: 1, 炼器师转职凭证: 1 },
    values: new Map(), grants: 0, writes: 0, replies: [],
  };
  const deps = {
    ...core, ...occupations, path, withPlayerMutationLock,
    getActiveZhutianAvatarName: player => player.诸天镜系统?.当前化身 || '',
    plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async id => id, existplayer: async () => true, Go: async () => true,
    isNotNull: value => value != null,
    data: { getData: async () => copy(state.player), minggeList: [], weimiantianjiao_list: [],
      occupation_list: [{ name: '炼器师' }], Level_list: [{ level_id: 30 }] },
    Read_player: async () => copy(state.player),
    Write_player: async (_id, value) => { state.player = copy(value); state.writes++; },
    Read_tripod: async () => copy(state.tripods),
    Write_duanlu: async list => { state.tripods = copy(list); },
    looktripod: async () => state.tripods.some(item => item.qq === 'owner') ? 1 : 0,
    Read_mytripod: async () => copy(state.tripods.find(item => item.qq === 'owner')),
    readall: async name => name === '隐藏灵根' ? [{ name: '测试器灵根', type: 1, 控器: 1 }]
      : name === '炼器炉' ? furnaces : [{ name: '测试器胚', atk: 1, def: 0, HP: 1 }],
    readthat: async (name, category) => category === '炼器炉' ? furnaces.find(item => item.name === name)
      : category === '炼器火' ? fires.find(item => item.name === name)
      : category === '锻造材料' ? { 攻: 1, 防: 0, 血: 1, 暴: 0, 金: 0, 木: 0, 土: 0, 水: 0, 火: 0 } : null,
    exist_najie_thing: async (_id, name) => state.tokens[name] || 0,
    Add_najie_thing: async (_id, item, category, amount) => {
      if (state.failGrant) throw new Error('fixture-grant-failed');
      if (state.lockedBag) return false;
      if (category === '装备') { state.inventory.push(copy(item)); state.grants++; }
      else state.tokens[item] = (state.tokens[item] || 0) + amount;
    },
    Add_职业经验: async (_id, amount) => {
      if (state.failExp) {
        // 另一名玩家已完成开炉，当前玩家回滚不得覆盖它。
        state.tripods.push({ qq: 'other', 状态: 0, 材料: [] });
        throw new Error('fixture-exp-failed');
      }
      state.player.occupation_exp += amount;
    },
    getMinggeEffects: () => ({}), getMinggeBonusMultiplier: () => 1,
    getAuthorityState: player => player.先天权柄 ||= {},
    getPetAbilityBonus: () => 0, selectHostileTianjiao: async () => null,
    getRealmEventWorldYear: () => 0,
    getxuanze: async () => ['金', 1],
    __PATH: { player_path: '/fixture/player', najie_path: '/fixture/bag' },
    config: { getConfig: () => ({ Master: [] }) },
    FileRollbackTransaction: class {
      constructor() { this.snapshot = copy({ player: state.player, inventory: state.inventory, grants: state.grants }); }
      capture() {}
      commit() {}
      rollback() { Object.assign(state, copy(this.snapshot)); }
    },
    redis: {
      get: async key => state.values.get(key) ?? null,
      set: async (key, value) => { state.values.set(key, value); return 'OK'; },
      del: async key => state.values.delete(key),
    },
  };
  const start = helperSource.indexOf('export async function grantSuiyunForge(');
  const end = helperSource.indexOf('export async function settripod(', start);
  deps.grantSuiyunForge = new Function(...Object.keys(deps),
    `${helperSource.slice(start, end).replace('export ', '')}; return grantSuiyunForge;`)(...Object.values(deps));
  state.grant = async () => {
    const player = copy(state.player);
    const changed = await deps.grantSuiyunForge('owner', player);
    state.player = player;
    return changed;
  };
  const stripped = forgeSource.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const App = new Function(...Object.keys(deps), `${stripped}; return duanzao;`)(...Object.values(deps));
  state.app = new App();
  state.event = (msg = '#一键完美开炉') => ({ user_id: 'owner', msg, reply: async text => { state.replies.push(text); return text; } });
  const occupationSource = read('apps/Occupation/Occupation.js');
  const from = occupationSource.indexOf('  async chose_occupation(');
  const to = occupationSource.indexOf('  async plant(', from);
  state.occupation = new Function(...Object.keys(deps),
    `return ({${occupationSource.slice(from, to).replace(/}\r?\n  async chose_occupation2/, '},\n  async chose_occupation2')}});`)(...Object.values(deps));
  return state;
}

test('岁云五阶转炼器师获月华仙炉与大空火种，已有进度保留且补领幂等', async () => {
  for (let stage = 1; stage <= 5; stage++) {
    const f = fixture(stage);
    const original = copy(f.tripods[0]);
    assert.equal(await f.grant(), true);
    assert.equal(f.tripods[0].炉阶, '月华仙炉');
    assert.equal(f.tripods[0].容纳量, 34);
    for (const field of ['材料', '数量', 'TIME', '状态']) assert.deepEqual(f.tripods[0][field], original[field]);
    assert.equal(f.player.炉火, '大空火种');
    assert.equal(f.player.锻造天赋, 100);
    assert.equal(await f.grant(), false);
    await f.app.showFire(f.event('#炉火'));
    assert.match(f.replies.at(-1), /大空火种/);
    assert.match(f.replies.at(-1), /72%/);
    f.tripods[0].炉阶 = '凡铁炉';
    await f.app.showFurnace(f.event('#炼器炉'));
    assert.match(f.replies.at(-1), /当前拥有：.*月华仙炉/);
  }
  for (const scenario of ['ordinary', 'other-job', 'avatar']) {
    const f = fixture();
    if (scenario === 'ordinary') f.player.灵根 = { name: '凡体' };
    if (scenario === 'other-job') f.player.occupation = '炼丹师';
    if (scenario === 'avatar') f.player.诸天镜系统 = { 当前化身: '凡体' };
    assert.equal(await f.grant(), false);
    assert.equal(f.tripods[0].炉阶, '凡铁炉');
  }
});

test('转职与已有职业入口实际调用发炉，初次转职无炉档也能创建', async () => {
  const f = fixture();
  f.player.occupation = '';
  f.player.锻造天赋 = undefined;
  f.player.隐藏灵根 = undefined;
  f.tripods = [];
  await f.occupation.chose_occupation(f.event('#转职炼器师'));
  assert.equal(f.player.occupation, '炼器师');
  assert.equal(f.tripods[0].炉阶, '月华仙炉');
  assert.equal(f.player.炉火, '大空火种');
  assert.ok(f.player.锻造天赋 && f.player.隐藏灵根);
  assert.match(f.replies.at(-1), /月华仙炉/);
  const old = fixture();
  await old.occupation.chose_occupation(old.event('#转职炼器师'));
  assert.match(old.replies.at(-1), /补领/);
  const measured = fixture();
  await measured.app.getmybook(measured.event('#炼器师能力评测'));
  assert.equal(measured.tripods[0].炉阶, '月华仙炉');
});

test('月华完美开炉执行真实炼制，扣费一次、保持累计成长且不消耗旧道具', async () => {
  const f = fixture();
  await f.grant();
  await Promise.all([f.app.perfectOpen(f.event()), f.app.perfectOpen(f.event())]);
  assert.equal(f.player.月华值, 10000);
  assert.equal(f.player.岁云.累计炼化月华, 123);
  assert.equal(f.grants, 1);
  assert.deepEqual(f.tokens, { 时光令: 1, 造化本源: 1, 炼器师转职凭证: 1 });
  assert.equal(f.inventory[0].atk, 1.8); // 基础1 + 仙炉0.35 + 完美0.1 + 无五行0.35
  assert.equal(f.tripods[0].状态, 0);
  assert.deepEqual(f.tripods[0].材料, []);
  assert.ok(f.replies.some(text => text.includes('消耗10000点月华值')));
});

test('月华余额不足、空炉、非炼器师均不扣费，纳戒与经验写入失败回滚并保留他人锻炉', async () => {
  for (const scenario of ['poor', 'empty', 'wrong-job', 'grant', 'experience', 'locked-bag']) {
    const f = fixture();
    await f.grant();
    if (scenario === 'poor') f.player.月华值 = 9999;
    if (scenario === 'empty') f.tripods[0].材料 = [];
    if (scenario === 'wrong-job') f.player.occupation = '炼丹师';
    if (scenario === 'grant') f.failGrant = true;
    if (scenario === 'experience') f.failExp = true;
    if (scenario === 'locked-bag') f.lockedBag = true;
    const before = copy(f.player);
    const tripod = copy(f.tripods[0]);
    if (['grant', 'experience', 'locked-bag'].includes(scenario)) await assert.rejects(f.app.perfectOpen(f.event()));
    else await f.app.perfectOpen(f.event());
    assert.deepEqual(f.player, before, scenario);
    assert.deepEqual(f.tripods[0], tripod, scenario);
    assert.equal(f.grants, 0, scenario);
    if (scenario === 'experience') assert.equal(f.tripods[1].qq, 'other');
  }
});

test('普通炼器师保留原完美开炉成本，月华仙炉仅岁云本人可安装', async () => {
  const f = fixture();
  f.player.灵根 = { name: '凡体' };
  await f.app.perfectOpen(f.event());
  assert.equal(f.grants, 1);
  assert.equal(f.player.月华值, 20000);
  assert.equal(f.tokens.时光令, 0);
  assert.equal(f.tokens.造化本源, 0);
  f.tokens.月华仙炉 = 1;
  await f.app.installFurnace(f.event('#安装锻炉 月华仙炉'));
  assert.equal(f.tripods[0].炉阶, '凡铁炉');
});

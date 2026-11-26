import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import * as sword from '../model/swordMagic.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { getLocationId, getLocationName, getLocationThreshold, getCoordinateLocations } from '../model/weimianTravel.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const script = file => read(file).replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export class', 'class');
function player() {
  const result = { id: 'fantasy-command', level_id: 1, Physique_id: 1, mijinglevel_id: 1,
    xiangulevel_id: 1, huafenlevel_id: 1, lunhui: 0, power_place: 0, 灵石: 10000 };
  assert.equal(sword.runSwordMagicCommand(result, '入界 确认', { now: 1 }).ok, true);
  return result;
}
function fixture({ initial = player(), exists = true, failWrite = false } = {}) {
  let disk = structuredClone(initial), now = 1, writes = 0;
  const replies = [], accounts = [], gifts = [];
  const App = vm.runInNewContext(`${script('apps/User/SwordMagic.js')}\nSwordMagic`, {
    ...sword, plugin: class { constructor(options) { Object.assign(this, options); } },
    verc: () => true, channel: async () => 'fantasy-command', existplayer: async () => exists,
    Read_player: async id => { accounts.push(id); return structuredClone(disk); },
    Write_player: async (_id, next) => {
      if (failWrite) throw new Error('disk-failure');
      sword.assertSwordMagicWriteCurrent(disk, next); disk = structuredClone(next); writes++;
    },
    runSwordMagicCommand: (p, c, options = {}) => sword.runSwordMagicCommand(p, c, { ...options, now, random: () => .999 }),
    // 真实发放走纳戒层；测试以等价的存根记录调用并复现标记清空语义。
    deliverMemorial: async (_id, player) => {
      const pending = sword.getPendingMemorial(player);
      if (!pending) return '';
      const pet = sword.getGraduationPet(player.剑与魔法);
      gifts.push(pending.name, pet.name);
      const latest = structuredClone(disk);
      if (sword.clearPendingMemorial(latest)) disk = structuredClone(latest);
      return `【飞升赠礼】${pending.name} 与 ${pet.name} 已入纳戒（绑定本人，不可交易）。`;
    },
    withPlayerMutationLock, console: { warn() {} },
    replyOfficialMessage: async (e, payload) => e.reply(payload.text),
  });
  const app = new App();
  return { app, replies, accounts, gifts, disk: () => disk, writes: () => writes,
    complete: () => { now = disk.剑与魔法.action.endAt; },
    send: (msg, id = '') => app.handle({ user_id: 'qg_original', msg, message_id: id || undefined, reply: async text => replies.push(text) }) };
}

test('飞升信物与际遇仙宠按终局发放一次并清空待发标记', async () => {
  const initial = player();
  const state = initial.剑与魔法;
  state.chapter = 6; state.lore = sword.SWORD_MAGIC_REGIONS.map(region => region.name);
  state.ending = '守隙魔王'; state.level = 10; state.weapon = true;
  const f = fixture({ initial });
  await f.send('#剑与魔法 飞升 确认', 'ascend-1');
  assert.deepEqual(f.gifts, ['守隙王冠', '白桦镇信使雀']); // 未救援也未交涉：走信使雀分支
  assert.match(f.replies.at(-1), /飞升赠礼/);
  assert.equal(f.disk().剑与魔法.memorial, '');
  assert.equal(f.disk().剑与魔法.status, 'ascended');
  // 再次确认：档案守卫拒绝，标记已清空不会重复发放
  await f.send('#剑与魔法 飞升 确认', 'ascend-2');
  assert.deepEqual(f.gifts, ['守隙王冠', '白桦镇信使雀']);
  // 三条终局各有对应信物；际遇决定仙宠
  for (const [ending, name, id] of [['黎明勇者', '黎明誓约剑', 9600501], ['地脉贤者', '地脉织针', 9600502]]) {
    const save = player();
    Object.assign(save.剑与魔法, { chapter: 6, lore: sword.SWORD_MAGIC_REGIONS.map(r => r.name),
      ending, level: 10, weapon: true });
    const g = fixture({ initial: save });
    await g.send('#剑与魔法 飞升 确认', `ascend-${name}`);
    assert.deepEqual(g.gifts, [name, '白桦镇信使雀']);
    assert.equal(sword.SWORD_MAGIC_MEMORIALS[ending].id, id);
  }
  for (const [flag, pet] of [['companion', '巡礼僧侣莉娅'], ['pact', '风精灵希露']]) {
    const save = player();
    Object.assign(save.剑与魔法, { chapter: 6, lore: sword.SWORD_MAGIC_REGIONS.map(r => r.name),
      ending: '黎明勇者', level: 10, weapon: true, [flag]: true });
    const g = fixture({ initial: save });
    await g.send('#剑与魔法 飞升 确认', `ascend-${flag}`);
    assert.deepEqual(g.gifts, ['黎明誓约剑', pet]);
    assert.equal(sword.getGraduationPet(g.disk().剑与魔法).name, pet);
  }
});

test('新路线入口与别名发现，普通角色面板和命格抽取正常透传', async () => {
  const f = fixture();
  for (const command of ['#剑与魔法 帮助', '#剑与魔法帮助', '#抽取异界词条', '#抽取命格词条', '#我的纳戒', '#我']) {
    assert.ok(f.app.rule.some(rule => new RegExp(rule.reg).test(command)), command);
  }
  const ordinary = player(); delete ordinary.剑与魔法; ordinary.power_place = 0;
  const g = fixture({ initial: ordinary });
  assert.equal(await g.send('#我'), false);
  assert.equal(await g.send('#抽取命格词条'), false);
  assert.equal(g.replies.length, 0);
  const missing = fixture({ exists: false });
  await missing.send('#剑与魔法 帮助');
  assert.match(missing.replies.at(-1), /异界词条/);
  await missing.send('#剑与魔法 状态');
  assert.match(missing.replies.at(-1), /#降临 剑与魔法/);
});

test('并发同一抽取与同一训练只提交一次，映射账户与背包均用异界数据', async () => {
  const f = fixture();
  await Promise.all([f.send('#抽取命格词条', 'draw'), f.send('#抽取命格词条', 'draw')]);
  assert.equal(f.writes(), 1);
  assert.equal(f.disk().剑与魔法.traits.length, 2);
  await f.send('#剑与魔法 就职 魔法师', 'class');
  await Promise.all([f.send('#剑与魔法 训练 魔法', 'train'), f.send('#剑与魔法 训练 魔法', 'train')]);
  assert.equal(f.writes(), 3);
  assert.equal(f.disk().剑与魔法.coins, 110);
  assert.equal(f.disk().剑与魔法.exp, 0);
  assert.ok(f.accounts.every(id => id === 'fantasy-command'));
  await f.send('#我的纳戒');
  assert.match(f.replies.at(-1), /白桦镇仓储/);
  f.complete();
  await f.send('#我', 'profile');
  assert.equal(f.disk().剑与魔法.action, null);
  assert.equal(f.disk().剑与魔法.exp, 18);
  assert.match(f.replies.at(-1), /训练完成/);
});

test('落盘失败不播报抽取成功或变更天赋，保留原档供重试', async () => {
  const f = fixture({ failWrite: true });
  await f.send('#抽取异界词条', 'draw');
  assert.equal(f.writes(), 0);
  assert.deepEqual(f.disk().剑与魔法.traits, []);
  assert.match(f.replies.at(-1), /未确认完成/);
});

test('后台扫描与查询共用模型，到期行动在玩家锁内仅兑现一次', async () => {
  let disk = player(), writes = 0;
  for (const command of ['抽取词条', '就职 剑士', '训练 剑术']) {
    assert.equal(sword.runSwordMagicCommand(disk, command, { now: 1, random: () => .999 }).ok, true);
  }
  const Task = vm.runInNewContext(`${script('apps/tasks/SwordMagicTask.js')}\nSwordMagicTask`, {
    plugin: class { constructor(options) { Object.assign(this, options); } },
    fs: { readdirSync: () => ['fantasy.json', 'README'], readFileSync: () => JSON.stringify(disk) },
    __PATH: { player_path: 'players' }, console: { warn: text => { throw Error(text); } },
    Read_player: async () => structuredClone(disk),
    Write_player: async (_id, next) => { sword.assertSwordMagicWriteCurrent(disk, next); disk = structuredClone(next); writes++; },
    withPlayerMutationLock, runSwordMagicCommand: sword.runSwordMagicCommand,
    runTaskOnce: (_name, task) => task(),
  });
  const task = new Task();
  await Promise.all([task.settleActions(), task.settleActions()]);
  assert.equal(writes, 1);
  assert.equal(disk.剑与魔法.action, null);
  assert.equal(disk.剑与魔法.exp, 18);
});

test('实际verc读取异界存档并隔离普通修仙，保留人物和背包别名', () => {
  const source = read('api/api.js');
  const start = source.indexOf('export const verc =');
  const fn = source.slice(start, source.indexOf('\nexport {', start)).replace('export const', 'const');
  const p = player(), replies = [];
  const verc = vm.runInNewContext(`${fn}\nverc`, {
    path, getSwordMagicCommandBlock: sword.getSwordMagicCommandBlock, console: { warn() {} },
    getResourcePath: relative => relative,
    fs: { existsSync: file => file.endsWith('fantasy.json'), readFileSync: () => JSON.stringify(p) },
  });
  assert.equal(verc({ e: { user_id: 'fantasy', msg: '#突破', reply: text => replies.push(text) } }), false);
  assert.match(replies[0], /剑与魔法/);
  for (const command of ['#我的纳戒', '#抽取命格词条', '#剑与魔法 地图', '#我']) {
    assert.equal(verc({ e: { user_id: 'fantasy', msg: command } }), true);
  }
});

test('位面可显示、原修仙传送及坐标购买保持隔离', () => {
  assert.equal(getLocationId('剑与魔法'), .7);
  assert.equal(getLocationName(.7), '剑与魔法');
  assert.equal(getCoordinateLocations().includes('剑与魔法'), false);
  assert.equal(getLocationThreshold(player(), '仙界').ok, false);
  assert.equal(getLocationThreshold({ level_id: 100 }, '剑与魔法').ok, false);
});

test('两条实际玩家写入口均安装新路线版本保护', () => {
  for (const [file, end] of [
    ['model/xiuxian.js', 'function normalizeEquipmentSlot'], ['model/XiuxianData.js', 'getAssociation('],
  ]) {
    const source = read(file);
    assert.match(source.slice(0, source.indexOf(end)), /assertSwordMagicWriteCurrent\(previousPlayer, (?:player|data)\)/);
  }
});

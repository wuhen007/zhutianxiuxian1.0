import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import * as arrival from '../model/openingArrival.js';
import * as omens from '../model/openingOmen.js';
import * as earth from '../model/revivalEarth.js';
import * as trial from '../model/trialUniverse.js';
import * as sword from '../model/swordMagic.js';
import * as lifespan from '../model/juelingLifespan.js';
import { ensureExtraCultivationState } from '../model/extraCultivation.js';
import { ensureFlowerPollenState } from '../model/flowerPollenPath.js';
import { getLocationName, PLACE_LOCATION_MAP } from '../model/weimianTravel.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { replyOfficialMessage } from '../model/officialMessage.js';

const source = fs.readFileSync(new URL('../apps/User/UserStart.js', import.meta.url), 'utf8')
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  .replace('export class', 'class');
let sequence = 0;

function fixture({ initial, requireBind = true, failWrite = false, mappedId } = {}) {
  const id = String(100000001 + sequence++);
  let disk = initial ? structuredClone(initial) : null;
  const replies = [];
  const officialReplies = [];
  const calls = { player: 0, equipment: 0, bag: 0, hp: 0, medicine: 0, talent: 0, aptitude: [], profile: 0, account: [] };
  const bindings = {
    ...arrival, ...omens, ...earth, ...trial, ...sword, ...lifespan,
    console: { warn() {}, error() {} },
    plugin: class { constructor(options) { Object.assign(this, options); } },
    fs: { readdirSync: () => [] },
    __PATH: { player_path: 'fixture-players' },
    config: { getConfig: () => ({ switch: { requireQQBotBind: requireBind }, Era: { current: { index: 0 } } }) },
    data: {
      equipment_list: ['烂铁匕首', '破铜护具', '廉价炮仗'].map(name => ({ name })),
      dibing_list: [{ name: '废铁' }],
    },
    verc: () => true,
    channel: async account => { calls.account.push(account); return mappedId ?? account; },
    existplayer: async () => !!disk,
    Read_player: async () => structuredClone(disk),
    get_random_talent: async () => { calls.talent++; return { name: '测试灵根', type: '伪灵根', eff: 1 }; },
    get_random_aptitude: async options => {
      calls.aptitude.push(options.allowWuhuaRushi);
      return { grade: '普通', evaluation: '测试天资' };
    },
    drawOpeningOmen: () => omens.MORTAL_OPENING_OMENS[1],
    Write_player: async (_account, player) => {
      if (failWrite) throw Error('simulated disk failure');
      if (disk?.复活地球) earth.assertRevivalWriteCurrent(disk, player);
      if (disk?.试炼宇宙) trial.assertTrialWriteCurrent(disk, player);
      if (disk?.剑与魔法) sword.assertSwordMagicWriteCurrent(disk, player);
      calls.player++;
      disk = structuredClone(player);
    },
    Write_equipment: async () => {
      calls.equipment++;
      Object.assign(disk, { 攻击: 111, 防御: 222, 血量上限: 3333 });
    },
    Write_najie: async () => { calls.bag++; },
    Add_HP: async () => { calls.hp++; disk.当前血量 = disk.血量上限; },
    Write_danyao: async () => { calls.medicine++; },
    withPlayerMutationLock,
    withJuelingEraLock: task => withPlayerMutationLock('test:opening-arrival:era', task),
    replyOfficialMessage: async (event, payload) => {
      officialReplies.push(payload);
      return event.reply(payload.text ?? payload.markdown);
    },
    redis: { get: async () => null, set: async () => {}, del: async () => {} },
  };
  const Constructor = vm.runInNewContext(`${source}\nUserStart`, bindings);
  const app = new Constructor();
  app.Show_player = async () => { calls.profile++; return false; };
  const send = (msg, { initialEntry = true, ...event } = {}) => app.Create_player({
    msg, user_id: id, reply: async message => replies.push(message), ...event,
  }, initialEntry);
  return { app, send, calls, replies, officialReplies, disk: () => disk, allowWrite: () => { failWrite = false; } };
}

function assertUncreated(f) {
  assert.equal(f.disk(), null);
  for (const key of ['player', 'equipment', 'bag', 'hp', 'medicine', 'talent', 'profile']) assert.equal(f.calls[key], 0, key);
  assert.deepEqual(f.calls.aptitude, []);
}

test('序章保留已知路线，仅开放修仙界和剑与魔法的降临按钮', () => {
  assert.deepEqual(arrival.ARRIVAL_LOCATIONS, ['修仙界', '地球', '试炼宇宙', '剑与魔法']);
  const text = `${arrival.OPENING_WORLD_PROLOGUE}\n${arrival.ARRIVAL_CHOICES_TEXT}`;
  for (const word of ['灾厄', '不祥', '修仙界', '地球', '试炼宇宙', '剑与魔法', '无吟唱者', '暂缓']) {
    assert.ok(text.includes(word), word);
  }
  const choices = arrival.ARRIVAL_BUTTONS.flat().map(button => arrival.parseArrivalChoice(button.command));
  assert.deepEqual(choices, arrival.OPEN_ARRIVAL_LOCATIONS);
});

test('降临解析只接受明确的已开放地点，不把菜单和任意聊天当选择', () => {
  for (const name of arrival.ARRIVAL_LOCATIONS) {
    assert.equal(arrival.parseArrivalChoice(`#降临 ${name}`), name);
    assert.equal(arrival.parseArrivalChoice(`#选择降临地 ${name}`), name);
  }
  for (const message of ['', null, '#踏入仙途', '#降临地', '#降临 火星', '#降临 试炼宇宙 额外文本', '我想降临地球']) {
    assert.equal(arrival.parseArrivalChoice(message), '', String(message));
  }
});

test('开局富文本采用每日任务的标题、引用与强调，只显示已开放的创建命令', () => {
  const markdown = arrival.OPENING_ARRIVAL_MARKDOWN;
  assert.match(markdown, /^# 诸天序章·万界沉浮\n/);
  assert.match(markdown, /^## 请选择你的降临地$/m);
  assert.match(markdown, /^> \*\*此界充满了灾厄与不祥。\*\*/m);
  for (const name of arrival.OPEN_ARRIVAL_LOCATIONS) {
    assert.ok(markdown.includes(`发送：\`#降临 ${name}\``));
    assert.ok(markdown.includes(`${name}｜`));
  }
  assert.doesNotMatch(markdown, /#降临 地球|#降临 试炼宇宙/);
  assert.doesNotMatch(arrival.ARRIVAL_CHOICES_TEXT, /\*\*|^##|^>/m);
});

test('开局真实富文本发送保留三按钮及发起人权限，普通客户端仍显示原文', async () => {
  const text = `${arrival.OPENING_WORLD_PROLOGUE}\n\n${arrival.ARRIVAL_CHOICES_TEXT}`;
  const payload = { markdown: arrival.OPENING_ARRIVAL_MARKDOWN, text, buttons: arrival.ARRIVAL_BUTTONS };
  let sent;
  await replyOfficialMessage({
    user_id: 'bound-qq', qqbot_user_id: 'sender-openid',
    reply: async message => { sent = message; },
  }, payload);
  assert.deepEqual(sent[0], { type: 'markdown', data: arrival.OPENING_ARRIVAL_MARKDOWN });
  assert.equal(sent[1].type, 'button');
  assert.deepEqual(sent[1].data.flat().map(button => button.callback), arrival.OPEN_ARRIVAL_LOCATIONS.map(name => `#降临 ${name}`));
  assert.ok(sent[1].data.flat().every(button => button.permission === 'sender-openid'));
  await replyOfficialMessage({ user_id: '10001', reply: async message => { sent = message; } }, payload);
  assert.equal(sent, text);
});

test('首次踏入仙途与降临地菜单仅展示世界观，不提前建档或抽取随机奖励', async () => {
  for (const message of ['#踏入仙途', '#降临地']) {
    const f = fixture();
    await f.send(message);
    assertUncreated(f);
    assert.ok(f.officialReplies.length > 0);
    assert.equal(f.officialReplies[0].markdown, arrival.OPENING_ARRIVAL_MARKDOWN);
    assert.notEqual(f.officialReplies[0].markdown, f.officialReplies[0].text);
    const text = f.replies.join('\n');
    assert.match(text, /灾厄/);
    assert.match(text, /不祥/);
    for (const name of arrival.ARRIVAL_LOCATIONS) assert.ok(text.includes(name));
  }
});

test('命令路由涵盖三降临地、选择别名、菜单和无效地点提示', () => {
  const f = fixture();
  for (const message of ['#踏入仙途', '#降临地', '#降临 火星', ...arrival.ARRIVAL_LOCATIONS.flatMap(name => [`#降临 ${name}`, `#选择降临地 ${name}`])]) {
    assert.ok(f.app.rule.some(rule => rule.fnc === 'Create_player' && new RegExp(rule.reg).test(message)), message);
  }
});

test('修仙界保留异象、天资与全部初始化；真实写盘后才展示人物面板', async () => {
  const f = fixture();
  await f.send('#降临 修仙界');
  assert.equal(f.disk().降临地, '修仙界');
  assert.equal(f.disk().power_place, 0);
  assert.equal(f.disk().开局异象.id, 'mountain_wanderer');
  assert.equal(f.disk().修为, 10001);
  assert.equal(f.disk().复活地球, undefined);
  assert.equal(f.disk().试炼宇宙, undefined);
  for (const key of ['player', 'equipment', 'bag', 'hp', 'medicine', 'talent', 'profile']) assert.equal(f.calls[key], 1, key);
  assert.deepEqual(f.calls.aptitude, [true]);
  assert.equal(f.disk().攻击, 111);
  assert.equal(f.disk().当前血量, 3333);
  assert.match(f.replies.join('\n'), /踏入仙途·山野散修/);
  assert.match(f.replies.join('\n'), /#抽取命格词条/);
});

test('维护中的地球和试炼宇宙选择不会建档或抽取奖励', async () => {
  for (const name of ['地球', '试炼宇宙']) {
    const f = fixture();
    await f.send(`#选择降临地 ${name}`);
    assertUncreated(f);
    assert.match(f.replies.join('\n'), /暂缓接纳新角色/);
  }
});

test('剑与魔法创建独立角色，沿用富文本介绍，不发放修仙异象', async () => {
  const f = fixture();
  await f.send('#降临 剑与魔法');
  assert.equal(f.disk().降临地, '剑与魔法');
  assert.equal(f.disk().power_place, sword.SWORD_MAGIC_LOCATION);
  assert.equal(f.disk().剑与魔法.place, '白桦镇');
  assert.equal(f.disk().开局异象, undefined);
  assert.equal(f.calls.profile, 0);
  for (const key of ['player', 'equipment', 'bag', 'hp', 'medicine']) assert.equal(f.calls[key], 1);
  assert.match(f.officialReplies.at(-1).markdown, /抽取异界词条/);
});
test('QQBot 未绑定时所有选项都在任何初始化前拦截，关闭绑定要求仍保留原设置', async () => {
  for (const name of arrival.ARRIVAL_LOCATIONS) {
    const f = fixture();
    await f.send(`#降临 ${name}`, { user_id: 'unbound-openid', qqbot_user_id: 'unbound-openid' });
    assertUncreated(f);
    assert.match(f.replies.join('\n'), /#绑定QQ/);
  }
  const relaxed = fixture({ requireBind: false });
  await relaxed.send('#降临 修仙界', { user_id: 'unbound-openid', qqbot_user_id: 'unbound-openid' });
  assert.equal(relaxed.disk().id, 'unbound-openid');
});

test('绑定及频道身份沿用统一账户映射，不生成另一份新档', async () => {
  const f = fixture({ mappedId: 'mapped-qq' });
  await f.send('#降临 修仙界', { user_id: 'qg_12345678', qqbot_user_id: 'official-openid' });
  assert.deepEqual(f.calls.account, ['12345678']);
  assert.equal(f.disk().id, 'mapped-qq');
});

test('未知降临地点返回选择菜单且不写盘', async () => {
  for (const message of ['#降临 火星', '#选择降临地 虚空']) {
    const f = fixture();
    await f.send(message);
    assertUncreated(f);
    for (const name of arrival.ARRIVAL_LOCATIONS) assert.ok(f.replies.join('\n').includes(name));
  }
});

test('已存在角色不会被菜单或另一个降临选项覆盖', async () => {
  const initial = { id: 'existing', level_id: 12, 降临地: '修仙界', marker: { retained: true } };
  const f = fixture({ initial });
  await f.send('#踏入仙途');
  await f.send('#降临 试炼宇宙');
  assert.deepEqual(f.disk(), initial);
  for (const key of ['player', 'equipment', 'bag', 'hp', 'medicine', 'talent']) assert.equal(f.calls[key], 0, key);
});

test('并发降临与重复消息只建档一次，第二个选项不会更换已选路线', { timeout: 3000 }, async () => {
  const f = fixture();
  await Promise.all([f.send('#降临 剑与魔法'), f.send('#降临 地球'), f.send('#降临 剑与魔法')]);
  assert.equal(f.disk().降临地, '剑与魔法');
  assert.equal(f.disk().复活地球, undefined);
  for (const key of ['player', 'equipment', 'bag', 'hp', 'medicine', 'talent']) assert.equal(f.calls[key], 1, key);
});

test('重生调用继续直接初始化修仙界，不退回未建档选单且不重抽初入限定天资', async () => {
  const f = fixture();
  await f.send('#再入仙途', { initialEntry: false });
  assert.equal(f.disk().降临地, '修仙界');
  assert.equal(f.calls.player, 1);
  assert.deepEqual(f.calls.aptitude, [false]);
  assert.equal(f.calls.profile, 1);
});

test('初次落盘失败不发送建档成功或异象奖励，恢复写入后允许重试', async () => {
  const f = fixture({ failWrite: true });
  try { await f.send('#降临 修仙界'); } catch (error) { assert.match(error.message, /simulated disk failure/); }
  assert.equal(f.disk(), null);
  assert.equal(f.calls.player, 0);
  assert.equal(f.calls.equipment, 0);
  assert.equal(f.calls.profile, 0);
  assert.doesNotMatch(f.replies.join('\n'), /踏入仙途·|#抽取命格词条/);
  f.allowWrite();
  await f.send('#降临 修仙界');
  assert.equal(f.calls.player, 1);
  assert.equal(f.disk().降临地, '修仙界');
});

test('独立状态提前写入后，真实境界归一化和补血方法仍通过写屏障且不迁移路线', async () => {
  const xiuxianSource = fs.readFileSync(new URL('../model/xiuxian.js', import.meta.url), 'utf8');
  const start = xiuxianSource.indexOf('export async function Add_HP(');
  const end = xiuxianSource.indexOf('export async function Set_HP(', start);
  assert.ok(start >= 0 && end > start);
  for (const name of ['地球', '试炼宇宙', '剑与魔法']) {
    const f = fixture();
    await f.send('#降临 修仙界');
    let disk = structuredClone(f.disk());
    const run = name === '地球' ? earth.runRevivalCommand : name === '试炼宇宙' ? trial.runTrialCommand : sword.runSwordMagicCommand;
    assert.equal(run(disk, '入界 确认').ok, true);
    const before = structuredClone(disk);
    const validate = name === '地球' ? earth.assertRevivalWriteCurrent : name === '试炼宇宙' ? trial.assertTrialWriteCurrent : sword.assertSwordMagicWriteCurrent;
    const next = structuredClone(disk);
    next.power_place = PLACE_LOCATION_MAP[getLocationName(next.power_place)];
    ensureExtraCultivationState(next);
    ensureFlowerPollenState(next);
    next.血量上限 = 5432;
    assert.doesNotThrow(() => validate(disk, next));
    disk = next;
    const addHP = vm.runInNewContext(`${xiuxianSource.slice(start, end).replace('export ', '')}\nAdd_HP`, {
      withPlayerMutationLock,
      Read_player: async () => structuredClone(disk),
      Write_player: async (_id, player) => { validate(disk, player); disk = structuredClone(player); },
    });
    await addHP(disk.id, 999999);
    assert.equal(disk.当前血量, 5432);
    assert.equal(disk.power_place, before.power_place);
    assert.deepEqual(disk.复活地球, before.复活地球);
    assert.deepEqual(disk.试炼宇宙, before.试炼宇宙);
    for (const field of ['level_id', 'Physique_id', 'mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id', 'lunhui']) {
      assert.equal(disk[field], before[field], field);
    }
  }
});

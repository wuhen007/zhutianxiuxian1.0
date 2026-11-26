import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import * as combat from '../model/suiyunCombat.js';
import * as lifespan from '../model/juelingLifespan.js';
import { computeJuelingErasure } from '../model/juelingLoss.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';
import { buildCombatSkillPanel } from '../model/combatSkillPanel.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const unit = (stage = 1) => ({ id: 'owner', 名号: '岁云', 灵根: core.createSuiyunRoot(stage),
  攻击: 1, 防御: 1, 当前血量: 1000, 血量上限: 1000, 速度: 100, 寿元: 50000 });

test('五阶段常青免疫即死禁疗禁复活，普通致命伤害仍只复活三次', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const player = unit(stage);
    assert.equal(combat.executeCombatTarget(player, [], '即死'), false);
    assert.equal(player.当前血量, 1000);
    assert.equal(player._suiyunRevives, undefined);
    for (let count = 1; count <= 4; count++) {
      player.不可复活 = true; player.禁疗 = 1; player._先天禁疗 = true;
      assert.equal(combat.getSuiyunHealingMultiplier(player), 1);
      player.当前血量 = 0;
      assert.equal(combat.trySuiyunRevival(player).revived, count <= 3);
    }
    assert.equal(player._suiyunRevives, 3);
    assert.equal(player.当前血量, 0);
  }
  for (const extra of [{ 分身: true }, { _tahua_type: '战意' }, { _高境界镇杀: true }]) {
    assert.equal(combat.hasSuiyunEvergreen({ ...unit(), ...extra }), false);
  }
});

test('霜剑严格低于15%斩杀并禁止复活，15%但全被护盾吸收时保留生命', () => {
  const caster = unit();
  const enemy = { ...unit(), 灵根: { name: '普通' }, 当前血量: 150 };
  const blocked = combat.castSuiyunMoonSword(caster, [enemy], { applyDamage: () => 0 });
  assert.equal(blocked.hits, 9);
  assert.equal(enemy.当前血量, 150);
  assert.equal(enemy.不可复活, undefined);
  const executed = combat.castSuiyunMoonSword(caster, [enemy]);
  assert.equal(executed.hits, 1);
  assert.equal(enemy.当前血量, 0);
  assert.equal(enemy.不可复活, true);
  assert.equal(enemy._suiyunExecutionBlocked, true);
  assert.match(executed.messages.join('\n'), /低于15%.*禁止|低于15%.*封禁/);
  assert.equal(enemy._suiyunMoonHit, undefined);
  const immune = unit();
  immune.当前血量 = 149;
  assert.equal(combat.executeSuiyunMoonTarget(immune, []), false);
  assert.equal(immune.当前血量, 149);
});

test('常青与绝灵属于灵根本人，受赐者面板仍三技且禁复活继续约束', () => {
  const gift = { ...unit(), id: 'student', 灵根: { name: '普通' }, 月华传承: {
    授予者: 'owner', 受赐者: 'student', 名额: 1, 传授时间: 1, 技能: [...core.SUIYUN_EXCLUSIVE_SKILLS],
  } };
  const innate = buildCombatSkillPanel(gift).sections.flatMap(section => section.items).filter(item => item.innate);
  assert.equal(innate.length, 3);
  assert.equal(innate.some(item => item.name === '岁云常青'), false);
  assert.equal(core.getSuiyunEffects(gift).absoluteSpiritImmune, false);
  gift.当前血量 = 0; gift.不可复活 = true;
  assert.equal(combat.trySuiyunRevival(gift).revived, false);
});

test('岁云全阶段免时代与因果绝灵，旧寿元压制解除且护身符不消耗', () => {
  for (let stage = 1; stage <= 5; stage++) {
    const player = { ...unit(stage), 寿元: 9999, 压制寿元: 50000 };
    assert.equal(lifespan.shouldSuppressJuelingLifespan(player, 4), false);
    assert.equal(lifespan.releaseJuelingLifespanForAuthority(player), true);
    assert.equal(player.寿元, 50000);
    assert.equal(player.压制寿元, undefined);
    assert.equal(lifespan.suppressJuelingLifespan(player), false);
    const inventory = { 丹药: [{ name: '普通丹药', 数量: 100 }] };
    assert.deepEqual(computeJuelingErasure(inventory, 13000, { player, random: () => 0 }), { items: [], groups: 0 });
    assert.equal(inventory.丹药[0].数量, 100);
  }
  const ordinary = { 灵根: { name: '普通' }, 寿元: 50000 };
  assert.equal(lifespan.suppressJuelingLifespan(ordinary), true);
  const inventory = { 丹药: [{ name: '丹药', 数量: 100 }] };
  assert.ok(computeJuelingErasure(inventory, 1000, { player: ordinary, random: () => 0 }).items.length > 0);
});

test('岁岁年年一小时精确边界、九大仙金与封灵符心神丹祈愿合法，移除悟道丹茶不占冷却', () => {
  const player = unit();
  assert.equal(core.receiveSuiyunYears(player, '不存在', { now: 0 }).ok, false);
  for (const removed of ['大衍悟道丹', '悟道古茶', '悟道古茶叶', '祈愿 大衍悟道丹', '祈愿 悟道古茶']) {
    assert.equal(core.receiveSuiyunYears(player, removed, { now: 0 }).ok, false);
  }
  assert.equal(player.岁云?.上次岁岁年年, undefined);
  assert.deepEqual(core.receiveSuiyunYears(player, '祈愿 封灵符', { now: 0 }).item, { name: '普通封灵符', class: '道具' });
  assert.equal(core.receiveSuiyunYears(player, '潜力丹', { now: core.SUIYUN_HOUR_MS - 1 }).ok, false);
  assert.equal(core.receiveSuiyunYears(player, '潜力丹', { now: core.SUIYUN_HOUR_MS }).item.name, '潜力丹');
  assert.deepEqual(core.receiveSuiyunYears(unit(), '祈愿 心神丹', { now: 0 }).item, { name: '心神丹', class: '丹药' });
  const pool = new Set(Array.from({ length: core.SUIYUN_YEAR_REWARDS.length }, (_, index) =>
    core.receiveSuiyunYears(unit(), '', { now: 0, random: () => index / core.SUIYUN_YEAR_REWARDS.length }).item.name));
  assert.ok(pool.has('心神丹') && pool.has('普通封灵符'));
  assert.ok(!pool.has('大衍悟道丹') && !pool.has('悟道古茶叶'));
  const metals = new Set(Array.from({ length: 9 }, (_, index) =>
    core.receiveSuiyunYears(unit(), '材料', { now: 0, random: () => index / 9 }).item.name));
  assert.equal(metals.size, 9);
  assert.equal(core.receiveSuiyunYears({ 灵根: { name: '普通' } }, '潜力丹').ok, false);
});

test('岁岁年年真实指令并发只发一件，保存中断整批回滚冷却和道具', async () => {
  const source = read('apps/User/Suiyun.js');
  const from = source.indexOf('  async yearGift('), to = source.indexOf('  async palaceExplore(', from);
  const state = { player: unit(), items: [], fail: false };
  const deps = {
    ...core, path, randomUUID, withPlayerMutationLock, __PATH: { player_path: '/fixture/player', najie_path: '/fixture/najie' },
    Read_player: async () => clone(state.player),
    Write_player: async (_id, player) => { if (state.fail) { state.fail = false; throw new Error('write-failed'); } state.player = clone(player); },
    Add_najie_thing: async (_id, name, category, amount) => state.items.push({ name, category, amount }),
    FileRollbackTransaction: class {
      constructor() { this.player = clone(state.player); this.items = clone(state.items); }
      capture() {} commit() {} rollback() { state.player = this.player; state.items = this.items; }
    },
  };
  const transactionFrom = source.indexOf('function transactionFor('), transactionTo = source.indexOf('async function savePlayers(', transactionFrom);
  const method = new Function(...Object.keys(deps), `${source.slice(transactionFrom, transactionTo)};return ({${source.slice(from, to)}}).yearGift;`)(...Object.values(deps));
  const app = { context: async () => ({ qq: 'owner' }), holderError: () => '', yearGift: method };
  const e = { msg: '#岁岁年年 祈愿 封灵符', reply: async message => message };
  state.fail = true;
  await assert.rejects(app.yearGift(e), /write-failed/);
  assert.equal(state.items.length, 0);
  assert.equal(state.player.岁云?.上次岁岁年年, undefined);
  await Promise.all([app.yearGift(e), app.yearGift(e)]);
  assert.deepEqual(state.items, [{ name: '普通封灵符', category: '道具', amount: 1 }]);
  state.player.岁云.上次岁岁年年 = Date.now() - core.SUIYUN_HOUR_MS;
  e.msg = '#岁岁年年 祈愿 心神丹';
  await app.yearGift(e);
  assert.deepEqual(state.items.at(-1), { name: '心神丹', category: '丹药', amount: 1 });
});

test('岁云殿堂实际入场允许低境界非仙界本人、阻止普通灵根与重复忙碌入场', async () => {
  const source = read('apps/SecretPlace/SecretPlace.js');
  const from = source.indexOf('async Gofairyrealm('), to = source.indexOf('  async Giveup(', from);
  const place = JSON.parse(read('resources/data/item/副本/仙境列表.json')).find(item => item.name === '岁云殿堂');
  const state = { player: { ...unit(), power_place: 0, level_id: 1, lunhui: 0, 灵石: 10 }, action: null, costs: [] };
  const deps = {
    ...core, verc: () => true, channel: async id => id, Read_player: async () => clone(state.player),
    Write_player: async (_id, player) => { state.player = clone(player); },
    Go: async () => !state.action, data: { Fairyrealm_list: [place], Level_list: [{ level_id: 1 }] },
    PLACE_LOCATION_MAP: { 仙界: 1 }, exist_najie_thing: async () => 0, isWeiMianDestroyed: () => { throw new Error('专属殿堂无需仙界开放'); },
    calculateTimeReduction: async () => ({ timeReduction: 0, msgs: [] }), config: { getConfig: () => ({ CD: { secretplace: 10 } }) },
    Add_灵石: async (_id, amount) => state.costs.push(amount), Add_寿元: async (_id, amount) => state.costs.push(amount),
    Add_renwu_progress: async () => {}, getDungeonTimedActionMultiplier: () => 1,
    applySecretPlaceNotificationContext: () => {}, recordMemoryEntry: async () => {},
    redis: { set: async (_key, value) => { state.action = JSON.parse(value); } },
  };
  const method = new Function(...Object.keys(deps), `return ({${source.slice(from, to)}}).Gofairyrealm;`)(...Object.values(deps));
  const e = { user_id: 'owner', msg: '#镇守仙境岁云殿堂', reply: async message => message };
  state.player.灵根 = { name: '普通' };
  assert.match(await method(e), /只接纳岁云/);
  assert.equal(state.action, null);
  state.player.灵根 = core.createSuiyunRoot(1);
  assert.equal(await method(e), true);
  assert.equal(state.action.Place_address.name, '岁云殿堂');
  assert.equal(state.costs.length, 2);
  assert.ok(state.costs.every(amount => amount === 0));
  assert.equal(await method(e), false);
});

test('资源池精确对应低中高奖励，岁月馈赠实际服用效果等同如梦', async () => {
  const pills = JSON.parse(read('resources/data/item/丹药列表.json'));
  const gift = pills.find(item => item.name === '岁月的馈赠');
  const original = pills.find(item => item.name === '如梦的加持');
  for (const field of ['class', 'type', 'chujin', '出售价', '稀有度']) assert.equal(gift[field], original[field]);
  const place = JSON.parse(read('resources/data/item/副本/仙境列表.json')).find(item => item.name === '岁云殿堂');
  assert.deepEqual(place.one.map(item => item.name), ['群星圣药']);
  assert.deepEqual(place.two.map(item => item.name), ['岁月的馈赠']);
  assert.deepEqual(place.three.map(item => item.name), ['潜力丹', '大衍悟道丹', '悟道古茶叶']);
  const source = read('apps/User/UserHome.js');
  const from = source.indexOf("if (thing_exist.type == '出金率')"), to = source.indexOf("if (thing_exist.type == '寿命')", from);
  const consume = new Function('thing_exist', 'player', 'Add_najie_thing', 'Write_player', 'e',
    `return (async()=>{const usr_qq='owner',thing_name=thing_exist.name,quantity=1;${source.slice(from, to)}})();`);
  const player = { 出金率: 0, 出金次数: 0 };
  let debit = 0;
  await consume(gift, player, async (_id, _name, _class, amount) => { debit += amount; }, async () => {}, { reply: async () => {} });
  assert.equal(debit, -1);
  assert.equal(player.出金率, 50);
  assert.equal(player.出金次数, 10);
});

test('真实单挑与团队霜剑斩杀阻断受赐者复活，常青治疗通道忽略禁疗且输入不污染', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot={makeLog(){}};globalThis.logger=new Proxy({}, {get:()=>()=>{}});
    Math.random=()=>.99;
    const {zd_battle,applyXianguTurnRecovery}=await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const p=(name,extra={})=>({名号:name,攻击:1,防御:0,当前血量:1000,血量上限:1000,速度:100,暴击率:0,暴击伤害:1.5,学习的功法:[],灵根:{name:'普通',type:'普通',法球倍率:1},法球倍率:1,...extra});
    const caster=p('岁云施法者',{速度:10000,灵根:{name:'月华之体',type:'岁云',法球倍率:1}});
    const target=p('月华受赐者',{id:'student',当前血量:149,速度:1,月华传承:{授予者:'teacher',受赐者:'student',名额:1,传授时间:1,技能:['霜剑入月','岁云归一','白云苍狗']}});
    const original=structuredClone([caster,target]);
    for(const team of [false,true]){
      const result=await zd_battle(team?[caster]:caster,team?[target]:target);
      assert.equal(result.winner,'A');
      assert.ok(result.msg.some(line=>String(line).includes('低于15%')));
      assert.equal(result.msg.some(line=>String(line).includes('【白云苍狗】')),false);
    }
    assert.deepEqual([caster,target],original);
    const heal=p('常青治疗',{灵根:caster.灵根,当前血量:100,每回合恢复:.1,禁疗:1,_先天禁疗:true});
    applyXianguTurnRecovery(heal,[]);
    assert.equal(heal.当前血量,200);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

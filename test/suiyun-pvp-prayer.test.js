import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import * as core from '../model/suiyun.js';
import { capRealmAuthorityForBattle, getRealmAuthorityLevel } from '../model/realmAuthority.js';
import { prepareSuiyunPvpBattle, getSuiyunPvpSource, restoreSuiyunPvpResult } from '../model/suiyunPvp.js';
import { prepareHighRealmBattle } from '../model/highRealmBarrier.js';
import { withPlayerMutationLock } from '../utils/playerMutationLock.js';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const clone = value => structuredClone(value);
const holder = (rank = 12, stage = 3, extra = {}) => ({
  id: 'fixture-suiyun-owner', 名号: '岁云修士', 灵根: core.createSuiyunRoot(stage), mijinglevel_id: rank, xiangulevel_id: 1, huafenlevel_id: 1,
  当前血量: 1000, 血量上限: 1000, 攻击: 100, 防御: 50, 速度: 100, ...extra,
});
const opponent = extra => ({ ...holder(24), id: 'fixture-pvp-target', 名号: '对手', 灵根: { name: '普通' }, ...extra });

test('三体系按等效权柄同境，对所有可用档位精确压境且原始战斗属性不变', () => {
  for (let rank = 0; rank <= 24; rank++) {
    const target = opponent({ mijinglevel_id: 24, xiangulevel_id: 25, huafenlevel_id: 25 });
    capRealmAuthorityForBattle(target, rank);
    assert.equal(getRealmAuthorityLevel(target), rank);
    assert.equal(target.攻击, 100);
    assert.equal(target.血量上限, 1000);
    for (const field of ['mijinglevel_id', 'xiangulevel_id', 'huafenlevel_id']) {
      assert.ok(getRealmAuthorityLevel({ [field]: target[field] }) <= rank, field);
    }
  }
});

test('五阶PVP攻守两侧均可压更高对手，跨体系先消除高境界天堑且不污染输入', () => {
  for (let stage = 1; stage <= 5; stage++) {
    for (const fields of [{ mijinglevel_id: 23 }, { mijinglevel_id: 1, xiangulevel_id: 24 }, { mijinglevel_id: 1, huafenlevel_id: 24 }]) {
      const a = holder(12, stage), b = opponent(fields);
      const saved = clone([a, b]);
      for (const reverse of [false, true]) {
        const opening = prepareSuiyunPvpBattle(reverse ? b : a, reverse ? a : b, { pvp: true });
        assert.ok(opening);
        const normalized = reverse ? opening.A_input : opening.B_input;
        assert.equal(getRealmAuthorityLevel(normalized), 12);
        assert.equal(prepareHighRealmBattle(opening.A_input, opening.B_input), null);
        assert.equal(getSuiyunPvpSource(normalized), b);
      }
      assert.deepEqual([a, b], saved);
    }
  }
});

test('PVE/显式关闭/时间长河及NPC不触发，受赐者、复制体不获得同境裁决', () => {
  const a = holder(), b = opponent();
  for (const options of [{}, { pvp: false }, { battleType: 'tianjiao' }, { battleType: 'xiangu_boss' }, { pvp: true, timeRiverBattle: true }]) {
    assert.equal(prepareSuiyunPvpBattle(a, b, options), null);
  }
  for (const extra of [{ boss: true }, { type: 'boss' }, { isTianjiao: true }, { _xianguNpcCompanion: true }, { 分身: true }]) {
    assert.equal(prepareSuiyunPvpBattle(a, { ...b, ...extra }, { pvp: true }), null);
    assert.equal(prepareSuiyunPvpBattle({ ...a, ...extra }, b, { pvp: true }), null);
  }
  const gift = { ...a, 灵根: { name: '普通' }, 月华传承: { 授予者: 'other', 受赐者: a.id, 名额: 1, 传授时间: 1, 技能: [...core.SUIYUN_EXCLUSIVE_SKILLS] } };
  assert.equal(core.hasSuiyunSkills(gift), true);
  assert.equal(prepareSuiyunPvpBattle(gift, b, { pvp: true }), null);
  assert.equal(prepareSuiyunPvpBattle(a, opponent({ mijinglevel_id: 12 }), { pvp: true }), null);
  assert.equal(prepareSuiyunPvpBattle(a, opponent({ mijinglevel_id: 8 }), { pvp: true }), null);
});

test('团队仅压对方真人，不压队友和NPC；返回主角色真实境界、持久化来源仍原对象', () => {
  const a = [holder(12), opponent({ mijinglevel_id: 24 })];
  const b = [opponent(), opponent({ id: 'another', huafenlevel_id: 25 }), opponent({ boss: true })];
  const opening = prepareSuiyunPvpBattle(a, b, { battleType: 'xiangu_pvp' });
  assert.equal(getRealmAuthorityLevel(opening.A_input[1]), 24);
  assert.equal(getRealmAuthorityLevel(opening.B_input[0]), 12);
  assert.equal(getRealmAuthorityLevel(opening.B_input[1]), 12);
  assert.equal(getRealmAuthorityLevel(opening.B_input[2]), 24);
  const result = restoreSuiyunPvpResult({ A_team: opening.A_input, B_team: opening.B_input, msg: [] }, opening);
  assert.deepEqual(result.B_team.map(unit => [unit.mijinglevel_id, unit.xiangulevel_id, unit.huafenlevel_id]),
    b.map(unit => [unit.mijinglevel_id, unit.xiangulevel_id, unit.huafenlevel_id]));
  assert.match(result.msg[0], /同境裁决/);
  assert.equal(getSuiyunPvpSource(opening.B_input[0]), b[0]);
  const twoRoots = prepareSuiyunPvpBattle(holder(20), holder(12), { pvp: true });
  assert.equal(getRealmAuthorityLevel(twoRoots.A_input), 12);
  assert.equal(getRealmAuthorityLevel(twoRoots.B_input), 12);
});

test('真实单挑与团队PVP先同境再执行岁云技能，PVE仍直接高境镇杀且存档/返回境界不变', () => {
  const script = `
    import assert from 'node:assert/strict';
    globalThis.Bot={makeLog(){}};globalThis.logger=new Proxy({}, {get:()=>()=>{}});
    globalThis.redis={get:async()=>null};
    Math.random=()=>.99;
    const {zd_battle}=await import('./plugins/zhutianxiuxian1.0/model/xiuxian.js');
    const base={攻击:100,防御:0,当前血量:1000000,血量上限:1000000,速度:1,暴击率:0,暴击伤害:1.5,法球倍率:1,学习的功法:[],mijinglevel_id:12,xiangulevel_id:1,huafenlevel_id:1};
    const a={...base,id:'fixture-only-suiyun',名号:'岁云测试',灵根:{name:'霜月剑尊',type:'岁云',法球倍率:1},速度:10000};
    const b={...base,id:'fixture-only-target',名号:'真人目标',灵根:{name:'普通',法球倍率:1},mijinglevel_id:23};
    const original=structuredClone([a,b]);
    for(const reverse of [false,true]){
      const result=await zd_battle(reverse?b:a,reverse?a:b,{pvp:true,maxRound:1,preserveHpOnTimeout:true});
      assert.ok(result.msg.some(line=>String(line).includes('同境裁决')));
      assert.ok(result.msg.some(line=>String(line).includes('霜剑入月')));
      assert.equal(result.msg.some(line=>String(line).includes('境界天堑')),false);
    }
    const team=await zd_battle([a],[b],{battleType:'xiangu_spar'});
    assert.ok(team.msg.some(line=>String(line).includes('同境裁决')));
    assert.equal(team.B_team[0].mijinglevel_id,23);
    assert.equal(team.A_team[0].mijinglevel_id,12);
    const pve=await zd_battle(a,b,{battleType:'xiangu_boss'});
    assert.equal(pve.winner,'B');
    assert.ok(pve.msg.some(line=>String(line).includes('境界天堑')));
    assert.equal(pve.msg.some(line=>String(line).includes('同境裁决')),false);
    assert.deepEqual([a,b],original);
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)), encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

function commandFixture() {
  const state = { player: holder(), inventory: [], writes: 0, settings: { Era: { current: { index: 2, years: 3 } } }, fail: false };
  const deps = {
    ...core, path, randomUUID, withPlayerMutationLock,
    __PATH: { player_path: '/fixture/player', najie_path: '/fixture/najie' },
    Read_player: async () => clone(state.player),
    Write_player: async (_id, p) => { if(state.fail) { state.fail = false; throw new Error('injected-save'); } state.player=clone(p);state.writes++; },
    Add_najie_thing: async (_id, name, category, amount) => { state.inventory.push({ name, category, amount }); },
    config: { getConfig:()=>clone(state.settings), getConfigPath:()=>'/fixture/config', setConfig:(_a,_b,value)=>{state.settings=clone(value);} },
    FileRollbackTransaction: class { constructor(){this.player=clone(state.player);this.bag=clone(state.inventory);}capture(){}commit(){}rollback(){state.player=this.player;state.inventory=this.bag;} },
    getSuperdimensionalRewriteTarget:(_e,id)=>id, channel:async id=>id,
  };
  const source = read('apps/User/Suiyun.js');
  const from = source.indexOf('function withPlayerLocks('), to = source.indexOf('export class Suiyun',from);
  const methods = ['yearGift','rewrite'].map(name=>{
    const start=source.indexOf(`  async ${name}(`), next=name==='rewrite'?source.lastIndexOf('\n}') : source.indexOf('  async palaceExplore(',start);
    return source.slice(start,next);
  }).join(',\n');
  const app=new Function(...Object.keys(deps),`${source.slice(from,to).replace('export ','')};const ERAS=['神话时代','太古时代','天命时代','末法时代','绝灵时代'];return ({${methods}});`)(...Object.values(deps));
  app.context=async()=>({qq:'owner'});app.holderError=()=>'';app.settlePalace=async()=>{};
  state.app=app;
  state.event=msg=>({msg,user_id:'owner',reply:async text=>text});
  return state;
}

test('岁云更改前两阶不扣费不改时代，霜月剑尊起真实时代更改只扣5点', async () => {
  for(let stage=1;stage<=5;stage++){
    const f=commandFixture();f.player.灵根=core.createSuiyunRoot(stage);f.player.岁云之力=10;
    const reply=await f.app.rewrite(f.event('#岁云更改 时代 神话时代'));
    if(stage<3){assert.match(reply,/霜月剑尊/);assert.equal(f.writes,0);assert.equal(f.settings.Era.current.index,2);assert.equal(f.player.岁云之力,10);}
    else{assert.equal(f.settings.Era.current.index,0);assert.equal(f.player.岁云之力,5);}
  }
});

test('祈愿九秘之一按真实秘籍发放，原奖励共享小时冷却，失败退款重试且不直接学习', async () => {
  const items=JSON.parse(read('resources/data/item/功法列表.json'));
  for(const name of core.SUIYUN_NINE_SECRETS){
    const p=holder();
    const result=core.receiveSuiyunYears(p,'祈愿 '+name,{now:0});
    assert.deepEqual(result.item,{name,class:'功法'});
    assert.equal(result.amount,1);
    assert.ok(items.some(item=>item.name===name && item.class==='功法'));
    assert.equal(core.receiveSuiyunYears(p,'材料',{now:core.SUIYUN_HOUR_MS-1}).ok,false);
    assert.equal(core.receiveSuiyunYears(p,'材料',{now:core.SUIYUN_HOUR_MS}).ok,true);
  }
  const randomNames=new Set(Array.from({length:9},(_,index)=>core.receiveSuiyunYears(holder(),'祈愿 九秘',{random:()=>index/9}).item.name));
  assert.equal(randomNames.size,9);
  const f=commandFixture();f.fail=true;
  await assert.rejects(f.app.yearGift(f.event('#岁岁年年 祈愿 临字秘')),/injected-save/);
  assert.equal(f.inventory.length,0);
  assert.equal(f.player.岁云?.上次岁岁年年,undefined);
  await Promise.all([f.app.yearGift(f.event('#岁岁年年 祈愿 临字秘')),f.app.yearGift(f.event('#岁岁年年 材料'))]);
  assert.deepEqual(f.inventory,[{name:'临字秘',category:'功法',amount:1}]);
  assert.equal(f.player.学习的功法,undefined);
});

test('祈愿十凶宝术按真实功法发放，单名可取指定，随机覆盖全十族', () => {
  const items = JSON.parse(read('resources/data/item/功法列表.json'));
  for (const name of core.SUIYUN_TEN_XIONG) {
    assert.ok(items.some(item => item.name === name && item.class === '功法' && item.type === '十凶宝术'), name);
    const result = core.receiveSuiyunYears(holder(), '祈愿 ' + name, { now: 0 });
    assert.deepEqual(result.item, { name, class: '功法' });
    assert.equal(result.amount, 1);
  }
  assert.equal(core.receiveSuiyunYears(holder(), '祈愿 十凶宝术', { now: 0, random: () => 0 }).item.name, '真龙宝术');
  assert.equal(core.receiveSuiyunYears(holder(), '祈愿 十凶', { now: 0, random: () => 0.999 }).item.name, '九叶剑草宝术');
  const randomNames = new Set(Array.from({ length: 10 }, (_, index) => core.receiveSuiyunYears(holder(), '祈愿 十凶宝术', { random: () => index / 10 }).item.name));
  assert.equal(randomNames.size, 10);
  assert.equal(core.receiveSuiyunYears(holder(), '祈愿 十凶宝术', { now: 0 }).ok, true);
  assert.equal(core.receiveSuiyunYears({ ...holder(), 灵根: { name: '凡体' } }, '祈愿 十凶宝术', { now: 0 }).ok, false);
});

test('全部真人对战调用明确启用PVP，NPC副本/试炼不凭ID触发', () => {
  for(const [file,call] of [
    ['apps/Battle/Battle.js','A_player, B_player'],
    ['apps/Battle/WDT.js','A_player, B_player'],
    ['apps/motou/ForbiddenSoul.js','attacker, target'],
    ['apps/motou/TianmoHuasheng.js','executor, target'],
    ['apps/User/zhengdaotixi.js','executor, target'],
    ['apps/User/xiantianzhibao.js','player, targetPlayer'],
    ['apps/Occupation/Occupation.js','player_A, player_B'],
  ]) assert.ok(read(file).includes(`zd_battle(${call}, { pvp: true })`),file);
  assert.match(read('apps/Tiandibang/Tiandibang.js'),/pvp: k !== -1/);
  assert.ok(read('apps/User/Suiyun.js').includes('{ disableWanhuaHarvest: true, pvp: true }'));
  assert.match(read('apps/SecretPlace/xianguPlace.js'),/battleType: 'xiangu_pvp'/);
  assert.match(read('apps/SecretPlace/xianguPlace.js'),/battleType: 'xiangu_spar'/);
  assert.equal(prepareSuiyunPvpBattle(holder(),opponent(),{}),null);
});

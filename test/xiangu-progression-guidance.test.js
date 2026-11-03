import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {formatXianguProgression,getXianguImmortalAccessGuide} from '../model/xianguProgression.js';
import {canCultivateExtraPath,getActiveExtraCultivationPaths,getExtraCultivationPathName} from '../model/extraCultivation.js';
const source=fs.readFileSync(new URL('../apps/User/xiangujinshi.js',import.meta.url),'utf8'),start=source.indexOf('  async chongguan(e) {'),end=source.indexOf('  // 普通搬血境突破',start);
assert.ok(start>=0&&end>start);
const settlement=fs.readFileSync(new URL('../apps/SecretPlace/xianguTribulationSettlement.js',import.meta.url),'utf8'),rs=settlement.indexOf('export const XIANGU_REALM_ROUTES'),re=settlement.indexOf('export function canBreakthroughXianguRealmHere');
const resolve=new Function(settlement.slice(rs,re).replace(/^export /gm,'')+';return resolveXianguBreakthroughCommand;')();
const rootFixture=level=>({id:'mapped',额外体系:'xiangu',xiangulevel_id:level,mijinglevel_id:1,huafenlevel_id:1,level_id:42,Physique_id:42,仙道潜力:1000,修为:1e12,血气:1e12,当前血量:1e10,极境:[]});
function harness(level,extra={}){
 const player={...rootFixture(level),...extra},responses=[],calls=[];let reads=0;
 const deps={formatXianguProgression,getXianguImmortalAccessGuide,canCultivateExtraPath,getActiveExtraCultivationPaths,getExtraCultivationPathName,channel:async id=>{assert.equal(id,'channel-fixture');return 'mapped';},existplayer:async id=>id==='mapped',Read_player:async()=>structuredClone(player),redis:{get:async()=>null},isNotNull:x=>x!==undefined&&x!==null,
 fs:{existsSync:()=>{reads++;return true;},readFileSync:()=>JSON.stringify({诸天位面:20})},data:{filePathMap:{weimianList:'fixture'},xiaoshijie:[],xiangujinshi_list:Array.from({length:25},(_,i)=>({level_id:i+1,level:'原境'+(i+1)}))},getPlayerGrandUniverse:()=>null,canBreakthroughXianguRealmHere:()=>true,canEnterQuasiEmperor:()=>({ok:true}),applyQuestionFortuneCost:(_,n)=>n,normalizeXianguExtremeRealms:p=>{p.极境||=[];},resolveXianguBreakthroughCommand:resolve};
 const fn=new Function(...Object.keys(deps),'return ({'+source.slice(start,end)+'}).chongguan;')(...Object.values(deps));
 const target=new Proxy({},{get:(_,key)=>(...args)=>{calls.push({method:key,args});return 'dispatched';}});
 return {player,responses,calls,reads:()=>reads,run:(msg='#冲关极境')=>fn.call(target,{user_id:'qg_channel-fixture',isGroup:true,msg,reply:async x=>responses.push(String(x))})};
}
test('the screenshot state is guided to create its own way before any world file read, fee, trial or normalization',async()=>{
 const f=harness(21,{mijinglevel_id:17,nihuo_count:10,hasSystem:true,自创修炼体系:{name:'原体系',route:'xiangu'},仙道潜力:0}),before=structuredClone(f.player);
 for(const msg of ['#冲关','#冲关极境']){await f.run(msg);assert.match(f.responses.at(-1),/#创造自身之道/);assert.match(f.responses.at(-1),/阶段0\/6/);assert.doesNotMatch(f.responses.at(-1),/后续内容还在更新/);}
 assert.equal(f.reads(),0);assert.equal(f.calls.length,0);assert.deepEqual(f.player,before);
});
test('all high realms route to their real dedicated flow without fees, map caps or generic placeholders',async()=>{
 const expected={21:'#创造自身之道',22:'#祭道',23:'#空间泡影状态',24:'#证道',25:'#修仙状态'};
 for(const [level,command]of Object.entries(expected))for(const msg of ['#冲关','#冲关极境']){const f=harness(Number(level),{仙道潜力:0});await f.run(msg);assert.ok(f.responses.at(-1).includes(command));assert.equal(f.reads(),0);assert.equal(f.calls.length,0);assert.doesNotMatch(f.responses.at(-1),/后续内容还在更新/);}
});
test('quasi-emperor guidance follows completed own-way stages, six named realms and recovery instead of granting progress',()=>{
 const base=rootFixture(21),before=structuredClone(base);assert.match(formatXianguProgression(base),/#创造自身之道/);
 assert.match(formatXianguProgression({...base,已创自身之道:true,自身之道阶段:5,修炼次数:299}),/#突破自身之道/);
 const ready={...base,已创自身之道:true,自身之道阶段:6,修炼次数:300};assert.match(formatXianguProgression(ready),/#合道/);
 const system={...ready,自创修炼体系:{name:'已有体系'}};assert.match(formatXianguProgression({...system,己道推演:{attempts:5,realms:[]}}),/#设立体系境界/);
 assert.match(formatXianguProgression({...system,己道推演:{attempts:20,recovery:{status:'recovering'}}}),/真血正在重聚/);
 assert.match(formatXianguProgression({...system,己道推演:{attempts:10,realms:['一','二','三','四','五','六']}}),/#推演己道/);assert.deepEqual(base,before);
});
test('existing in-realm extremes and ordinary high-realm dispatch retain their actual methods',async()=>{
 const special={2:'breakthroughExtremeBloodRealm',3:'breakthroughExtremeDongtianRealm',4:'breakthroughExtremeHualingRealm',5:'breakthroughExtremeMingwenRealm',6:'breakthroughExtremeLiezhenRealm',7:'breakthroughExtremeZunzheRealm',8:'breakthroughXianqiExtreme',12:'breakthroughJiutianShidiExtreme',13:'breakthroughZhanxianExtreme'};
 for(const [level,method]of Object.entries(special)){const f=harness(Number(level));await f.run();assert.equal(f.calls[0]?.method,method);assert.equal(f.calls.length,1);}
 for(const level of [9,10,11,14,15,16,17,18,19,20])for(const msg of ['#冲关','#冲关极境']){const f=harness(level);await f.run(msg);assert.equal(f.calls[0]?.method,'breakthroughUpperRealm');assert.equal(f.calls.length,1);}
});
test('a different selected cultivation route remains rejected before the high-realm guidance',async()=>{
 const f=harness(21,{额外体系:'huafen',huafenlevel_id:5});await f.run();assert.match(f.responses.at(-1),/不可兼修/);assert.equal(f.calls.length,0);assert.equal(f.reads(),0);
});

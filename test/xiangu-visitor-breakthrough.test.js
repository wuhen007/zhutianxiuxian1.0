import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getPlayerGrandUniverse,enterGrandUniverse,leaveGrandUniverse} from '../model/grandUniverse.js';
import {canCultivateExtraPath,getActiveExtraCultivationPaths,getExtraCultivationPathName} from '../model/extraCultivation.js';
import {formatXianguProgression,getXianguImmortalAccessGuide} from '../model/xianguProgression.js';
import {getLocationThreshold,getLocationName} from '../model/weimianTravel.js';
import {canBreakthroughXianguRealmHere,resolveXianguBreakthroughCommand} from '../apps/SecretPlace/xianguTribulationSettlement.js';
const source=fs.readFileSync(new URL('../apps/User/xiangujinshi.js',import.meta.url),'utf8'),start=source.indexOf('  async chongguan(e) {'),end=source.indexOf('  // 普通搬血境突破',start);
const world=(owner,stage=0,open=true)=>({player_qq:owner,world_name:'测试宇宙',大宇宙:{法则等级:stage,对外开放:open,访客记录:[]}});
const hero=(level=15)=>({id:'visitor',名号:'试验修士',额外体系:'xiangu',xiangulevel_id:level,mijinglevel_id:8,huafenlevel_id:1,level_id:42,Physique_id:42,power_place:2.5,nihuo_count:1,仙道潜力:1000,修为:1e18,血气:1e18,极境:[]});
function harness(player,worlds,{worldLevel=10}={}){
 const messages=[],dispatch=[],lookups=[];
 const deps={formatXianguProgression,getXianguImmortalAccessGuide,canCultivateExtraPath,getActiveExtraCultivationPaths,getExtraCultivationPathName,
 channel:async()=>player.id,existplayer:async()=>true,Read_player:async()=>structuredClone(player),redis:{get:async()=>null},isNotNull:x=>x!=null,
 fs:{existsSync:()=>true,readFileSync:()=>JSON.stringify({诸天位面:worldLevel})},data:{filePathMap:{weimianList:'fixture'},xiaoshijie:worlds,xiangujinshi_list:Array.from({length:25},(_,i)=>({level_id:i+1,level:'原境'+(i+1)}))},
 getPlayerGrandUniverse:(w,p,id)=>{lookups.push(id);return getPlayerGrandUniverse(w,p,id);},canBreakthroughXianguRealmHere,canEnterQuasiEmperor:()=>({ok:true}),applyQuestionFortuneCost:(_,v)=>v,normalizeXianguExtremeRealms:p=>{p.极境||=[];},resolveXianguBreakthroughCommand};
 const fn=new Function(...Object.keys(deps),'return ({'+source.slice(start,end)+'}).chongguan;')(...Object.values(deps));
 const target={breakthroughUpperRealm:async(e,id,p)=>{dispatch.push({id,level:p.xiangulevel_id});return true;}};
 return {messages,dispatch,lookups,run:()=>fn.call(target,{user_id:player.id,isGroup:true,msg:'#冲关',reply:async m=>messages.push(String(m))})};
}
test('the actual visitor entrance follows entered host laws and reaches the original true-immortal trial without granting a realm',async()=>{
 const p=hero(),host=world('host');assert.ok(enterGrandUniverse(p,host,{ownerId:'host',visitorId:p.id,now:123}).ok);
 const before=structuredClone(p),old=getPlayerGrandUniverse([host],p,p.id);assert.equal(canBreakthroughXianguRealmHere(p,16,old),false,'reproduces old self-id lookup failure');
 const h=harness(p,[host]);await h.run();assert.deepEqual(h.lookups,['host']);assert.deepEqual(h.dispatch,[{id:'visitor',level:15}]);assert.deepEqual(p,before);assert.equal(p.xiangulevel_id,15);
});
test('host laws have precedence over owned laws and a missing host never borrows the owned universe',async()=>{
 for(const [ownStage,hostStage,expected]of [[0,2,true],[5,0,false]]){
  const p=hero(16),host=world('host',hostStage),owned=world(p.id,ownStage);enterGrandUniverse(p,host,{visitorId:p.id});
  const h=harness(p,[host,owned]);await h.run();assert.equal(h.dispatch.length,expected?1:0);assert.deepEqual(h.lookups,['host']);
 }
 const p=hero();p.大宇宙位置={界主:'missing'};const h=harness(p,[world(p.id,5)]);await h.run();assert.equal(h.dispatch.length,0);assert.deepEqual(h.lookups,['missing']);assert.match(h.messages[0],/访问宇宙尚未具备/);
});
test('leaving a visited universe ends its permission, and unentered or closed hosts grant no visitor access',async()=>{
 const p=hero(),host=world('host');enterGrandUniverse(p,host,{visitorId:p.id});leaveGrandUniverse(p);
 let h=harness(p,[host]);await h.run();assert.equal(h.dispatch.length,0);assert.deepEqual(h.lookups,['visitor']);
 const closed=world('closed',5,false);assert.equal(enterGrandUniverse(p,closed,{visitorId:p.id}).reason,'closed');h=harness(p,[closed]);await h.run();assert.equal(h.dispatch.length,0);
});
test('original universe capacity, global world cap, owned-world and Xianyu behavior remain enforced',async()=>{
 const p=hero(16),host=world('host',0);enterGrandUniverse(p,host,{visitorId:p.id});let h=harness(p,[host]);await h.run();assert.equal(h.dispatch.length,0,'law0 cannot carry king');
 const supreme=hero();enterGrandUniverse(supreme,host,{visitorId:supreme.id});h=harness(supreme,[host],{worldLevel:6});await h.run();assert.equal(h.dispatch.length,0);assert.match(h.messages.at(-1),/诸天破碎/);
 for(const [p,worlds]of [[hero(),[world('visitor')]],[{...hero(),power_place:6},[]]]){h=harness(p,worlds);await h.run();assert.equal(h.dispatch.length,1);}
});
test('the actual Xianyu refusal explains current realm and existing alternatives without lowering entry gates',async()=>{
 const raw=fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js',import.meta.url),'utf8'),start=raw.indexOf('async checkLocationThreshold(player, location) {'),end=raw.indexOf('// 查询玩家是否处于传送/秘境等动作中',start);
 const gate=new Function('getLocationName','getLocationThreshold','getXianguImmortalAccessGuide','return ({'+raw.slice(start,end)+'}).checkLocationThreshold;')(getLocationName,getLocationThreshold,getXianguImmortalAccessGuide);
 for(const count of [1,10]){const p={...hero(),nihuo_count:count},before=structuredClone(p),result=await gate(structuredClone(p),'仙域');assert.equal(result.ok,false);const text=result.msgs.join('\n');assert.match(text,/仙古今世法15级/);assert.match(text,/#大宇宙列表/);assert.match(text,/#进入大宇宙/);assert.match(text,/#轰击成仙路/);assert.match(text,/帝尊已灭、成仙路开启/);assert.match(text,/所在服务器世界状态/);assert.deepEqual(p,before);}
 assert.deepEqual(getXianguImmortalAccessGuide({...hero(),额外体系:'huafen',huafenlevel_id:5}),[]);
 assert.equal(getLocationThreshold({...hero(),xiangulevel_id:16},'仙域').ok,true);
});

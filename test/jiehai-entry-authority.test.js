import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getRealmAuthorityLevel} from '../model/realmAuthority.js';

const source=fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js',import.meta.url),'utf8');
const start=source.indexOf('async Gojiehaiplace(e) {'),end=source.indexOf('async Gosecretplace(e)',start);
assert.ok(start>=0&&end>start);
function fixture(extra={},{place='接引古殿',price=100,allowed=true,destroyed=false}={}){
 let p={id:'fixture',power_place:3,mijinglevel_id:1,xiangulevel_id:1,huafenlevel_id:1,灵石:1000,修为:123456,寿元:12345,...extra};
 const replies=[],saves=[],coins=[],tasks=[],progress=[];
 const deps={verc:()=>true,channel:async()=>p.id,Read_player:async()=>structuredClone(p),Go:async()=>allowed,isWeiMianDestroyed:()=>destroyed,replyPlaneDestroyed:async e=>e.reply('位面已崩灭'),PLACE_LOCATION_MAP:{界海:3},getSuiyunDungeonEntryPlace:(_,x)=>x,data:{jiehai_list:[{name:place,Price:price}]},getRealmAuthorityLevel,
 Write_player:async(id,player)=>{assert.equal(id,p.id);p=structuredClone(player);saves.push(player);},Add_灵石:async(id,amount)=>{assert.equal(id,p.id);p.灵石+=amount;coins.push(amount);},config:{getConfig:()=>({})},calculateTimeReduction:async()=>({timeReduction:0,msgs:[]}),getDungeonTimedActionMultiplier:()=>1,applySecretPlaceNotificationContext:()=>{},Add_renwu_progress:async(id,code)=>progress.push({id,code}),redis:{set:async(key,value)=>tasks.push({key,action:JSON.parse(value)})}};
 const run=new Function(...Object.keys(deps),'return ({'+source.slice(start,end)+'}).Gojiehaiplace;')(...Object.values(deps));
 return {replies,saves,coins,tasks,progress,player:()=>p,run:(command='#探索界海'+place)=>run({msg:command,user_id:'qg_fixture',reply:async text=>replies.push(String(text))})};
}
test('three routes enter reception palace at equivalent king authority with original cost and single task',async()=>{
 for(const p of [{mijinglevel_id:18},{xiangulevel_id:17},{huafenlevel_id:18},{额外体系:'xiangu',mijinglevel_id:17,xiangulevel_id:20}]){
  const f=fixture(p);assert.equal(await f.run(),true);assert.equal(f.player().灵石,900);assert.equal(f.player().界海历练次数,1);assert.equal(f.tasks.length,1);assert.equal(f.tasks[0].action.action,'探索界海');assert.equal(f.tasks[0].action.Place_address.name,'接引古殿');assert.equal(f.tasks[0].action.time,1800000);assert.deepEqual(f.coins,[-100]);assert.equal(f.progress.length,1);assert.equal(f.player().修为,123456);assert.equal(f.player().寿元,12345);assert.doesNotMatch(f.replies.join('\n'),/境界不足/);
 }
});
test('all three routes must reach equivalent immortal emperor before entering ultimate ancient land',async()=>{
 for(const p of [{mijinglevel_id:21},{xiangulevel_id:22},{huafenlevel_id:22}]){const f=fixture(p,{place:'终极古地'});assert.equal(await f.run(),true);assert.equal(f.tasks.length,1);assert.match(f.replies.join('\n'),/仙帝临九天/);}
 for(const [p,place]of [[{mijinglevel_id:17},'接引古殿'],[{xiangulevel_id:16},'接引古殿'],[{huafenlevel_id:17},'接引古殿'],[{mijinglevel_id:20},'终极古地'],[{xiangulevel_id:21},'终极古地'],[{huafenlevel_id:21},'终极古地']]){
  const f=fixture(p,{place}),before=structuredClone(f.player());assert.equal(await f.run(),false);assert.deepEqual(f.player(),before);assert.equal(f.saves.length,0);assert.equal(f.coins.length,0);assert.equal(f.tasks.length,0);assert.match(f.replies.join('\n'),/境界不足/);
 }
});
test('same equivalent realm selects the same narrative for every route',async()=>{
 for(const [level,heading]of [[20,'准仙帝临世'],[21,'仙帝临九天'],[22,'祭道领域']])for(const p of [{mijinglevel_id:level},{xiangulevel_id:level+1},{huafenlevel_id:level+1}]){const f=fixture(p);await f.run();assert.match(f.replies.join('\n'),new RegExp(heading));assert.deepEqual(f.coins,[-100]);}
});
test('busy, location, destroyed plane, unknown destination and money gates still avoid starting or charging',async()=>{
 for(const [extra,options,msg]of [[{}, {allowed:false}], [{power_place:2},{}], [{},{destroyed:true}],[{}, {},'#探索界海未知地'],[{灵石:99},{}]]){
  const f=fixture({huafenlevel_id:25,...extra},options);await f.run(msg);assert.equal(f.coins.length,0);assert.equal(f.tasks.length,0);assert.equal(f.saves.length,0);
 }
});
test('already adjusted entry prices remain honored without new fees or changes to realm numbers',async()=>{
 const f=fixture({huafenlevel_id:25,额外体系:'huafen'},{price:0}),before=structuredClone(f.player());await f.run();assert.equal(f.player().灵石,before.灵石);assert.equal(f.player().mijinglevel_id,1);assert.equal(f.player().huafenlevel_id,25);assert.equal(f.tasks.length,1);
});

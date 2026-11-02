import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getLocationThreshold,getLocationName,getBaseTravelThreshold,getBodyTravelQuote,hasCoordinate,purchaseCoordinateClue,COORDINATE_CLUE_COST,PLACE_LOCATION_MAP} from '../model/weimianTravel.js';
import {checkPlaneRealmLaw,PLANE_REALM_LAW} from '../model/planeRealmLaw.js';

const flower=(level,extra={})=>({额外体系:'huafen',huafenlevel_id:level,mijinglevel_id:1,xiangulevel_id:1,level_id:42,Physique_id:42,power_place:0,记忆坐标:['凡间'],...extra});
const source=fs.readFileSync(new URL('../apps/SecretPlace/SecretPlace.js',import.meta.url),'utf8');
const start=source.indexOf('async checkLocationThreshold(player, location) {'),end=source.indexOf('// 查询玩家是否处于传送/秘境等动作中',start);
assert.ok(start>=0&&end>start);
const actualEntrance=new Function('getLocationName','getLocationThreshold','return ({'+source.slice(start,end)+'}).checkLocationThreshold;')(getLocationName,getLocationThreshold);

test('natural pollen frontier matrix reaches the next legal map before each realm-cap transition',async()=>{
 const cases=[{level:11,from:'小阴间',to:'大阴间',target:12},{level:13,from:'大阴间',to:'阳间',target:14},{level:17,from:'阳间',to:'仙域',target:18}];
 for(const row of cases){
  const p=flower(row.level,{power_place:PLACE_LOCATION_MAP[row.from]});assert.equal(getBaseTravelThreshold(p).ok,true);
  assert.equal(checkPlaneRealmLaw(p,row.target).ok,false,row.from+' should retain its original realm cap');
  assert.equal(getLocationThreshold(p,row.to).ok,true,'shared destination gate '+row.to);
  assert.equal((await actualEntrance(p,row.to)).ok,true,'original command entrance wrapper '+row.to);
  const after={...p,power_place:PLACE_LOCATION_MAP[row.to]};assert.equal(checkPlaneRealmLaw(after,row.target).ok,true,'destination admits next realm '+row.target);
  assert.equal(p.huafenlevel_id,row.level);assert.equal(p.mijinglevel_id,1);assert.equal(p.xiangulevel_id,1);
 }
 assert.deepEqual(PLANE_REALM_LAW,{4:11,5:13,7:17});
});

test('one realm below each threshold is still rejected by the real entrance and shared helper',async()=>{
 for(const [realm,to]of [[10,'大阴间'],[12,'阳间'],[16,'仙域']]){
  const p=flower(realm);assert.equal(getLocationThreshold(p,to).ok,false);assert.equal((await actualEntrance(p,to)).ok,false);
 }
 assert.equal(getLocationThreshold(flower(1),'小阴间').ok,false);assert.equal(getLocationThreshold(flower(2),'小阴间').ok,true);
});

test('actual refusal guidance and the divination panel use the same new boundary without stale realm requirements',async()=>{
 const yin=(await actualEntrance(flower(10),'大阴间')).msgs.join('\n'),domain=(await actualEntrance(flower(16),'仙域')).msgs.join('\n');
 assert.match(yin,/映照诸天（11级）/);assert.doesNotMatch(yin,/神祇境（12级）/);assert.match(domain,/主修花粉达到大宇／究极（17级）/);
 const panel=fs.readFileSync(new URL('../apps/User/zhetiandujie.js',import.meta.url),'utf8');
 for(const [name,level]of [['大阴间',11],['仙域',17]]){
  const line=panel.split(/\r?\n/).find(row=>row.includes("{ name: '"+name+"'"));assert.ok(line);assert.ok(line.includes("sharedPlaneGate(p, '"+name+"')"));
  const item=new Function('sharedPlaneGate','return ('+line.trim().replace(/,$/,'')+');')((p,name)=>getLocationThreshold(p,name).ok);
  assert.equal(item.需(flower(level)),true);assert.equal(item.需(flower(level-1)),false);
  assert.match(item.要求,new RegExp(String(level)));
 }
});

test('the lower flower-only boundary does not grant another selected route access through residual flower seventeen',()=>{
 for(const route of ['mijing','xiangu']){
  const p={...flower(17),额外体系:route,mijinglevel_id:route==='mijing'?17:1,xiangulevel_id:route==='xiangu'?15:1};
  assert.equal(getLocationThreshold(p,'仙域').ok,false);
  assert.equal(getLocationThreshold({...p,huafenlevel_id:11},'大阴间').ok,false);
 }
 // Unselected multi-route archives remain ambiguous and keep their old gate.
 const ambiguous={...flower(17),mijinglevel_id:17};delete ambiguous.额外体系;
 assert.equal(getLocationThreshold(ambiguous,'仙域').ok,false);
});

test('original other-route realm thresholds, high-realm travel and full universe law exception are unchanged',()=>{
 for(const [p,want]of [[{mijinglevel_id:17},false],[{mijinglevel_id:18},true],[{xiangulevel_id:15},false],[{xiangulevel_id:16},true],[{额外体系:'mijing',mijinglevel_id:17,huafenlevel_id:18},true]])assert.equal(getLocationThreshold(p,'仙域').ok,want);
 assert.equal(getLocationThreshold({mijinglevel_id:19},'大阴间').ok,false);assert.equal(getLocationThreshold({mijinglevel_id:20},'大阴间').ok,true);
 assert.equal(getLocationThreshold(flower(20),'时间长河').ok,false);assert.equal(getLocationThreshold(flower(21),'时间长河').ok,true);
 assert.equal(getLocationThreshold(flower(22),'上苍之上').ok,true);
 assert.equal(getBaseTravelThreshold(flower(17,{level_id:41})).ok,false);assert.equal(getBaseTravelThreshold(flower(17,{Physique_id:41})).ok,false);
 for(const target of [18,21,22,23,24,25]){
  assert.equal(checkPlaneRealmLaw(flower(target-1,{power_place:7}),target).ok,false);
  assert.equal(checkPlaneRealmLaw(flower(target-1,{power_place:6}),target).ok,true);
  assert.equal(checkPlaneRealmLaw(flower(target-1,{power_place:7}),target,{大宇宙:true}).ok,true);
 }
});

test('coordinate and body-travel costs are still required normally; new gate grants no free teleport or save mutation',()=>{
 const p=flower(17,{power_place:7,灵石:COORDINATE_CLUE_COST,学习的功法:[]});
 assert.equal(hasCoordinate(p,'仙域'),false);assert.equal(getLocationThreshold(p,'仙域').ok,true);
 assert.equal(purchaseCoordinateClue(p,'仙域').ok,true);assert.equal(p.灵石,0);assert.equal(hasCoordinate(p,'仙域'),true);
 const before=structuredClone(p),quote=getBodyTravelQuote(p,7,6);assert.ok(quote.xiuweiCost>0);assert.ok(quote.qixueCost>0);assert.ok(quote.shouyuanCost>0);assert.ok(quote.travelTime>0);assert.deepEqual(p,before);
 assert.equal(hasCoordinate(flower(11),'大阴间'),true);
});

test('all ordinary flower target realms have a consistent reachable-map progression without altering realm-law caps',async()=>{
 for(let current=2;current<=24;current++){
  const next=current+1,to=next<=11?'小阴间':next<=13?'大阴间':next<=17?'阳间':'仙域',p=flower(current);
  assert.equal(getLocationThreshold(p,to).ok,true,'entry before target '+next);assert.equal((await actualEntrance(p,to)).ok,true,'wrapper before target '+next);
  assert.equal(checkPlaneRealmLaw({...p,power_place:PLACE_LOCATION_MAP[to]},next).ok,true,'law at target '+next);
 }
});

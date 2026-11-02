import test from 'node:test';
import assert from 'node:assert/strict';
import {getRealmAuthorityLevel,getCultivationAuthorityLevel,getRealmAuthorityPath} from '../model/realmAuthority.js';
import {getSelfDaoDeductionGate,getSelfDaoDeductionCosts,consumeSelfDaoDeduction,promoteSelfDaoToImmortalEmperor,SELF_DAO_COSTS,SACRIFICE_DAO_COSTS,getEraAccumulationCap} from '../model/selfDaoDeduction.js';
import {getSacrificePromotionGate,promotePlayerToSacrifice,enterSacrificeBubble,escapeSacrificeBubble,assertSacrificeBubbleWrite,applyStrangeSacrificeDefeat,STRANGE_SACRIFICE,getStrangeSacrificeEncounter} from '../model/strangeSacrifice.js';
import {createCultivationSystem} from '../apps/User/wudaoRules.js';
import {reforgeExtraCultivationState} from '../model/extraCultivation.js';

const now=Date.now();
const mixed=(level,extra={})=>({id:'flower-promotion-fixture',名号:'花粉验收修士',额外体系:'huafen',huafenlevel_id:level,mijinglevel_id:23,xiangulevel_id:1,
 level_id:64,Physique_id:63,攻击:1e38,防御:2e29,血量上限:1e29,当前血量:1e29,纪元积累:10000,心神:10000,元神:1e16,仙道潜力:1e8,寿元:1e18,修为:1e22,血气:1e22,
 道心:500,道心值:500,道心上次恢复时间:now,厄土仙帝击杀数:10,...extra});

test('only selected started flower uses cultivation authority; maximum combat authority and all other routes retain old values',()=>{
 for(const [level,rank]of [[5,7],[19,18],[20,19],[21,20],[22,21],[23,22],[24,23],[25,24]]){
  const p=mixed(level),before=structuredClone(p);assert.equal(getCultivationAuthorityLevel(p),rank);assert.equal(getRealmAuthorityLevel(p),Math.max(23,rank));assert.equal(getRealmAuthorityPath(p),'huafen');assert.deepEqual(p,before);
 }
 for(const p of [mixed(1),{...mixed(21),额外体系:'mijing'},{...mixed(21),额外体系:'xiangu'},{...mixed(21),额外体系:undefined},{mijinglevel_id:20},{xiangulevel_id:22}])assert.equal(getCultivationAuthorityLevel(p),getRealmAuthorityLevel(p));
});

test('retained old peak does not grant early system creation or change flower-specific dao prerequisites',()=>{
 for(const level of [5,17,18,19]){const p=mixed(level),before=structuredClone(p);assert.deepEqual(createCultivationSystem(p,'新花道',now),{ok:false,reason:'realm'});assert.deepEqual(p,before);}
 const p=mixed(20);assert.equal(createCultivationSystem(p,'新花道',now).reason,'dao');
 p.花粉道途.stages.immortalKingPrinciple=9600;const result=createCultivationSystem(p,'新花道',now+1);assert.equal(result.ok,true);assert.equal(result.system.route,'huafen');assert.equal(p.mijinglevel_id,23);assert.equal(p.huafenlevel_id,20);
});

test('flower21 follows genuine quasi-emperor deduction and cost, then flower22 follows sacrifice deduction without lowering retained realms',()=>{
 const p=mixed(21,{已创自身之道:true,自身之道名称:'花道',自身之道阶段:6,修炼次数:300,自创修炼体系:{name:'花道体系',route:'huafen'}});
 assert.deepEqual(getSelfDaoDeductionCosts(p),SELF_DAO_COSTS);assert.equal(getSelfDaoDeductionGate(p).reason,'deduce');assert.equal(getEraAccumulationCap(p),1000,'era cap remains original max-authority behavior');
 const before=p.元神,result=consumeSelfDaoDeduction(p,now);assert.equal(result.ok,true);assert.equal(result.reason,'deduced');assert.equal(p.元神,before-SELF_DAO_COSTS.spirit);assert.equal(p.己道推演.attempts,1);assert.equal(p.mijinglevel_id,23);
 p.己道推演={progressionVersion:2,attempts:20,realms:['起','承','转','合','真','终'],battlePending:true,completed:false};
 assert.equal(getSelfDaoDeductionGate(p).reason,'battle');promoteSelfDaoToImmortalEmperor(p,now+2);
 assert.equal(p.huafenlevel_id,22);assert.equal(p.mijinglevel_id,23);assert.equal(getCultivationAuthorityLevel(p),21);assert.equal(getRealmAuthorityLevel(p),23);
 p.自身之道阶段=7;p.修炼次数=400;assert.deepEqual(getSelfDaoDeductionCosts(p),SACRIFICE_DAO_COSTS);assert.equal(getSelfDaoDeductionGate(p).sacrifice,true);
 for(let count=0;count<10;count++)assert.equal(consumeSelfDaoDeduction(p,now+3+count).reason,'sacrifice_deduced');
 assert.equal(getSacrificePromotionGate(p).ok,true);assert.equal(promotePlayerToSacrifice(p),'huafen');assert.equal(p.huafenlevel_id,23);assert.equal(p.mijinglevel_id,23);
});

test('retained old authority never skips actual flower realm or deduction checks for sacrifice',()=>{
 const ready={自身之道阶段:7,修炼次数:400,己道推演:{sacrificeAttempts:10}};
 for(const level of [5,20,21,23,24])assert.equal(getSacrificePromotionGate(mixed(level,ready)).checks.immortalEmperor,false);
 assert.equal(getSacrificePromotionGate(mixed(22,ready)).ok,true);
 assert.equal(getSacrificePromotionGate(mixed(22,{...ready,己道推演:{sacrificeAttempts:9}})).ok,false);
 assert.equal(getSelfDaoDeductionGate(mixed(21)).reason,'own_way');
});

test('mixed flower23 is eternally sacrificed and valid 720-minute escape advances only flower24',()=>{
 const p=mixed(23),beforeRealm=p.mijinglevel_id,defeat=applyStrangeSacrificeDefeat(p,{now,enemyType:'ancestor',random:()=>0});
 assert.equal(defeat.eternallySacrificed,true);assert.equal(p.始祖永祭.route,'huafen');assert.equal(p.当前血量,0);
 const previous=structuredClone(p),next=structuredClone(p),duration=STRANGE_SACRIFICE.bubbleDurationMs;
 assert.equal(escapeSacrificeBubble(next,now+duration-1).reason,'waiting');assert.equal(next.huafenlevel_id,23);
 assert.equal(escapeSacrificeBubble(next,now+duration).ok,true);assert.equal(next.huafenlevel_id,24);assert.equal(next.mijinglevel_id,beforeRealm);
 assert.doesNotThrow(()=>assertSacrificeBubbleWrite(previous,next,now+duration));assert.equal(getRealmAuthorityLevel(next),23);assert.equal(getCultivationAuthorityLevel(next),23);
 assert.equal(enterSacrificeBubble(next,now+duration+1),null);
});

test('write guard rejects mixed flower23 to24 without real bubble even when old maximum authority is already23 or24',()=>{
 for(const oldLevel of [23,24]){
  const previous=mixed(23,{mijinglevel_id:oldLevel}),direct={...previous,huafenlevel_id:24};
  assert.throws(()=>assertSacrificeBubbleWrite(previous,direct,now),{code:'SACRIFICE_BUBBLE_REQUIRED'});
  const bubble=structuredClone(previous);enterSacrificeBubble(bubble,now);const completed=structuredClone(bubble);escapeSacrificeBubble(completed,now+STRANGE_SACRIFICE.bubbleDurationMs);
  assert.doesNotThrow(()=>assertSacrificeBubbleWrite(bubble,completed,now+STRANGE_SACRIFICE.bubbleDurationMs));assert.equal(completed.mijinglevel_id,oldLevel);assert.equal(completed.huafenlevel_id,24);
 }
});

test('unselected and existing non-flower deduction gates continue to use maximum authority',()=>{
 const ordinary=mixed(1,{额外体系:'mijing',mijinglevel_id:21,自身之道阶段:7,修炼次数:400,己道推演:{sacrificeAttempts:0}});
 assert.deepEqual(getSelfDaoDeductionCosts(ordinary),SACRIFICE_DAO_COSTS);assert.equal(getSelfDaoDeductionGate(ordinary).sacrifice,true);
 const xiangu=mixed(1,{额外体系:'xiangu',mijinglevel_id:1,xiangulevel_id:23});assert.equal(enterSacrificeBubble(xiangu,now).route,'xiangu');assert.equal(xiangu.huafenlevel_id,1);
});

test('returning to an old remaining route after a requested reforge is not a new beyond-sacrifice promotion',()=>{
 const previous=mixed(2,{mijinglevel_id:24}),next=structuredClone(previous);
 reforgeExtraCultivationState(next);
 assert.equal(next.huafenlevel_id,1);assert.equal(next.mijinglevel_id,23);
 assert.equal(getRealmAuthorityLevel(next)<getRealmAuthorityLevel(previous),true);
 assert.doesNotThrow(()=>assertSacrificeBubbleWrite(previous,next,now));
});

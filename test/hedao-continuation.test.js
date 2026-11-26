import test from 'node:test';
import assert from 'node:assert/strict';
import {createCultivationSystem} from '../apps/User/wudaoRules.js';
import {canEnterQuasiEmperor,getBreakKingEmperorGate} from '../model/worldlineAuthority.js';
const NOW=1800000000000;
const hero=()=>({id:'fixture',名号:'续接修士',额外体系:'huafen',huafenlevel_id:20,mijinglevel_id:1,xiangulevel_id:1,
 自创修炼体系:{name:'原道统',founder:'原开道者',route:'mijing',source:'遮天人体秘境道果合流',createdAt:123,stage:'道祖体系',旧资料:{保留:true}},
 自身之道体系:'huafen',自身之道名称:'当前己道',自身之道阶段:0,修炼次数:0,
 花粉道途:{version:1,stages:{immortalKingPrinciple:9600},daily:{date:'2026-11-03',count:21},result:{name:'原花粉收获'}},
 道途:{version:2,stages:{giantDaoPrototype:76800},daily:{date:'旧日',count:2},result:{name:'旧道统原成就'}},
 时间线权能:{version:2,tribulations:{mijing:{attempts:1,status:'passed',passedAt:100}},history:[{route:'mijing',at:100}]},
 灵石:1234,修为:5678,血气:9101,成就:['23'],背包:{物品:77},攻击:1e30});
const unaffected=p=>Object.fromEntries(Object.entries(p).filter(([k])=>!['自创修炼体系','合道续接记录','花粉道途'].includes(k)));
test('an actually qualified transferred flower cultivator can continue the same named system without borrowing the old emperor trial',()=>{
 const p=hero(),before=structuredClone(p);assert.equal(canEnterQuasiEmperor(structuredClone(p),'huafen').reason,'system');
 const r=createCultivationSystem(p,'原道统',NOW);assert.ok(r.ok);assert.equal(r.adapted,true);assert.equal(r.previousRoute,'mijing');assert.equal(p.自创修炼体系.route,'huafen');
 for(const k of ['name','founder','createdAt','旧资料'])assert.deepEqual(p.自创修炼体系[k],before.自创修炼体系[k]);
 assert.deepEqual(p.合道续接记录[0].system,before.自创修炼体系);assert.deepEqual(p.合道续接记录[0].previousResult,before.花粉道途.result);assert.equal(p.合道续接记录[0].law.exp,9600);
 assert.deepEqual(unaffected(p),unaffected(before));assert.deepEqual(p.花粉道途.stages,before.花粉道途.stages);assert.deepEqual(p.花粉道途.daily,before.花粉道途.daily);
 assert.equal(canEnterQuasiEmperor(structuredClone(p),'huafen').reason,'tribulation');assert.equal(getBreakKingEmperorGate(structuredClone(p),'huafen',NOW).reason,'ready');assert.equal(p.时间线权能.tribulations.huafen,undefined);
});
test('same route retries and changed names do not grant a second system, history entry or reward',()=>{
 const p=hero(),before=structuredClone(p);assert.equal(createCultivationSystem(p,'另起新名',NOW).reason,'route_name');assert.deepEqual(p,before);
 createCultivationSystem(p,'原道统',NOW);const saved=structuredClone(p);
 assert.equal(createCultivationSystem(p,'原道统',NOW+1).reason,'exists');assert.equal(createCultivationSystem(p,'换个名字',NOW+2).reason,'exists');assert.deepEqual(p,saved);
});
test('the current selected route must reach its real threshold and complete its own law, never an old stronger realm',()=>{
 const p=hero();p.huafenlevel_id=19;p.mijinglevel_id=23;let before=structuredClone(p);assert.equal(createCultivationSystem(p,'原道统',NOW).reason,'realm');assert.deepEqual(p,before);
 p.huafenlevel_id=20;p.花粉道途.stages.immortalKingPrinciple=9599;before=structuredClone(p);assert.equal(createCultivationSystem(p,'原道统',NOW).reason,'dao');assert.deepEqual(p,before);
 p.花粉道途.stages.immortalKingPrinciple=9600;delete p.额外体系;before=structuredClone(p);assert.equal(createCultivationSystem(p,'原道统',NOW).ok,false);assert.deepEqual(p,before);
});
test('uncertain advanced records, differently bound own ways and malformed history remain unchanged',()=>{
 const cases=[p=>p.己道推演={attempts:1},p=>p.己道推演={realms:['一']},p=>p.己道推演={sacrificeAttempts:1},p=>p.己道推演={completed:true},p=>p.己道推演={divineEmbryo:'已结出'},p=>p.己道推演={recovery:{status:'recovering'}},p=>p.己道推演={quasiEmperorPeakAt:100},p=>p.己道推演={realmsNamedAt:100},p=>p.己道推演='损坏',p=>p.道外之路='损坏',p=>p.道外之路={},p=>p.自身之道体系='mijing',p=>p.自创修炼体系.emperorAt=99,p=>p.自创修炼体系.stage='六境圆满·神胎初成',p=>p.自创修炼体系.realms=['旧境'],p=>p.合道续接记录={},p=>delete p.自创修炼体系.route];
 for(const change of cases){const p=hero();change(p);const before=structuredClone(p);assert.equal(createCultivationSystem(p,'原道统',NOW).ok,false);assert.deepEqual(p,before);}
 const initialized=hero();initialized.己道推演={progressionVersion:2,attempts:0,sacrificeAttempts:0,realms:[],completed:false,battlePending:false};assert.ok(createCultivationSystem(initialized,'原道统',NOW).ok);
});
test('continuing back to another qualified route preserves both histories and never imports another route trial',()=>{
 const p=hero();createCultivationSystem(p,'原道统',NOW);p.额外体系='mijing';p.自身之道体系='mijing';p.mijinglevel_id=19;
 const trials=structuredClone(p.时间线权能);assert.ok(createCultivationSystem(p,'原道统',NOW+1).ok);assert.equal(p.自创修炼体系.route,'mijing');assert.equal(p.合道续接记录.length,2);assert.equal(p.合道续接记录[1].system.route,'huafen');assert.deepEqual(p.时间线权能,trials);
});
test('first creation retains original once-only behavior without continuation history',()=>{
 const p=hero();delete p.自创修炼体系;const r=createCultivationSystem(p,'新花道',NOW);assert.ok(r.ok);assert.equal(r.adapted,undefined);assert.equal(p.自创修炼体系.createdAt,NOW);assert.equal(p.合道续接记录,undefined);assert.equal(createCultivationSystem(p,'别名',NOW+1).reason,'exists');
});

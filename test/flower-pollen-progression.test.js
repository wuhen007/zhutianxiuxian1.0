import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as progression from '../model/flowerPollenProgression.js';
import {withPlayerMutationLock,getPlayerMutationLockStats} from '../utils/playerMutationLock.js';
import {FileRollbackTransaction} from '../apps/SecretPlace/rebirthTransaction.js';

// Evaluate the actual model body while isolating unrelated production startup
// imports. Plain fixture players own no special authority, revival or mastery.
const modelSource=fs.readFileSync(new URL('../model/flowerPollenPath.js',import.meta.url),'utf8');
const exports=[...modelSource.matchAll(/^export (?:const|function) (\w+)/gm)].map(match=>match[1]);
const modelBody=modelSource.replace(/^import .*;\r?\n/gm,'').replace(/^export \{[^\n]+\};?\r?\n?/gm,'').replace(/^export /gm,'');
const modelDeps={...progression,hasSuiyunAuthority:()=>false,addGongfaProficiency:()=>({gained:0}),getGongfaProficiencyProfile:()=>({exp:0}),reduceTribulationDamageByDefense:damage=>({damage,reduction:0}),getPassiveTribulationDamageMultiplier:()=>1,getExtraCultivationLevelProduct:()=>1};
const model=new Function(...Object.keys(modelDeps),modelBody+';return {'+exports.join(',')+'};')(...Object.values(modelDeps));
const appSource=fs.readFileSync(new URL('../apps/User/FlowerPollenPath.js',import.meta.url),'utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replace(/^export /gm,'');
const realms=JSON.parse(fs.readFileSync(new URL('../resources/data/Level/花粉进化路体系.json',import.meta.url),'utf8'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'flower-progression-'));let sequence=0;
test.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
const fixtureHero=level=>model.ensureFlowerPollenState({id:'fixture',名号:'花粉验收',额外体系:'huafen',huafenlevel_id:level,mijinglevel_id:1,xiangulevel_id:1,修为:1e18,血气:1e18,仙道潜力:1e10,元神:1e16,寿元:1e16,当前血量:1000,血量上限:1000,攻击:1000,防御:1000,灵根:{type:'普通',name:'普通'},学习的功法:['基础呼吸法','形意呼吸法','太极呼吸法','大雷音呼吸法','道引呼吸法','盗引呼吸法'],花粉极境:[],进化积淀:1000});
function fixture({level=4,medium='普通进化花粉',pollenCount=3,random=()=>0,daoComplete=true,tribulationComplete=true,seedOwned=false}={}){
 const directory=path.join(temp,String(++sequence));fs.mkdirSync(directory);const __PATH={};
 for(const [key,name] of [['player_path','players'],['najie_path','bags'],['equipment_path','equipment']]){__PATH[key]=path.join(directory,name);fs.mkdirSync(__PATH[key]);}
 const files=Object.fromEntries(Object.entries(__PATH).map(([key,value])=>[key,path.join(value,'fixture.json')]));
 const player=fixtureHero(level);
 if(daoComplete)for(const rule of model.FLOWER_DAO_RULES)player.花粉道途.stages[rule.key]=rule.targetExp;
 if(tribulationComplete)for(const key of Object.keys(model.FLOWER_TRIBULATION_RULES))player.花粉渡劫.completed[key]={at:100};
 const equipment={武器:{name:'原百分比装备',atk:1e42,装备属性类型:'百分比'},护具:{name:'原护具',def:1e30}};
 fs.writeFileSync(files.player_path,JSON.stringify(player));fs.writeFileSync(files.najie_path,JSON.stringify({道具:[{name:medium,数量:pollenCount}],丹药:[]}));fs.writeFileSync(files.equipment_path,JSON.stringify(equipment));
 let writes=0,bagWrites=0,rebuilds=0,transactions=0,randomCalls=0,ancestorChecks=0;
 const replies=[],flags={busy:false,tribulation:false,fence:false,failBag:false,throwBag:false,failPlayer:false,throwPlayer:false,failRebuild:false,throwRebuild:false,seedOwned,throwReply:false};
 const read=key=>JSON.parse(fs.readFileSync(files[key],'utf8'));
 const save=(key,value)=>fs.writeFileSync(files[key],JSON.stringify(value));
 const deps={...model,...progression,path,__PATH,FileRollbackTransaction,withPlayerMutationLock,plugin:class{constructor(options){Object.assign(this,options);}},verc:()=>true,data:{huafen_list:realms,xiaoshijie:[],minggeList:[]},config:{getConfig:()=>({Era:{current:{index:2}}})},channel:async()=> 'fixture',existplayer:async()=>true,
  Read_player:async()=>read('player_path'),Read_najie:async()=>read('najie_path'),Read_equipment:async()=>read('equipment_path'),
  Write_player:async(_,value)=>{writes++;assert.equal(getPlayerMutationLockStats('fixture').active,true);if(flags.throwPlayer){save('player_path',value);throw Error('fixture interrupted player write');}if(flags.failPlayer)return false;save('player_path',value);return true;},
  Write_equipment:async(_,value)=>{rebuilds++;assert.equal(getPlayerMutationLockStats('fixture').active,true);const next=read('player_path');next.攻击=next.huafenlevel_id*100+7;next.防御=next.huafenlevel_id*100+11;save('player_path',next);save('equipment_path',{...value,fixtureRebuilt:true});if(flags.throwRebuild)throw Error('fixture rebuild interrupted');if(flags.failRebuild)return false;},
  Add_najie_thing:async(_,name,category,amount)=>{bagWrites++;const bag=read('najie_path'),item=bag[category].find(row=>row.name===name);assert.ok(item);item.数量+=amount;save('najie_path',bag);if(flags.throwBag)throw Error('fixture interrupted bag write');if(flags.failBag)return false;},
  exist_najie_thing:async(_,name,category)=>Number(read('najie_path')[category]?.find(row=>row.name===name)?.数量)||0,
  getActiveExtraCultivationPaths:()=>['huafen'],getExtraCultivationPathName:()=> '花粉进化路',isCultivatingExtraPath:()=>true,
  redis:{get:async()=>flags.busy?'0':null},isTribulationLocked:async()=>flags.tribulation,
  withTribulationWriteTransaction:async(id,snapshots,fn)=>{assert.equal(id,'fixture');assert.equal(snapshots.length,2);assert.equal(getPlayerMutationLockStats(id).active,true);transactions++;if(flags.fence)throw Error('fixture tribulation fence');return fn();},
  TRIBULATION_LOCK_BUSY:Symbol('busy'),withTribulationLock:async(_,fn)=>flags.tribulation?deps.TRIBULATION_LOCK_BUSY:fn(),wrapTribulationEvent:(_,e)=>e,
  canEnterQuasiEmperor:()=>({ok:true}),getRealmAuthorityLevel:p=>p.huafenlevel_id-1,getPlayerGrandUniverse:()=>null,checkPlaneRealmLaw:()=>({ok:true,max:25}),bigNumberTransform:String,
  getShanghaiDateKey:()=> '2026-11-02',isFlowerAncestorSeedOwner:async()=>{ancestorChecks++;return flags.seedOwned;},
  getMinggeEffects:()=>({}),getTechniqueWudaoProfile:()=>({name:'普通',bonus:0}),getTitleWudaoBonus:()=>0,getPhysiqueWudaoBonus:()=>0,getAptitudeWudaoBonus:()=>0,getKongtongModifiers:()=>({wudaoMultiplier:1}),ensureDaoHeart:()=>{},getDaoHeartWudaoGainMultiplier:()=>1,getDaoHeartWudaoCostMultiplier:()=>1,getSuiyunWudaoCost:(_,x)=>x,getWudaoGongfaReduction:()=>({rate:0}),applyQuestionFortuneCost:(_,x)=>x,calculateMinggePotentialCost:x=>x,getWudaoLifespanCost:o=>({cost:o.lifespanCost}),getAvailableLifespan:p=>p.寿元,consumePlayerLifespan:(p,n)=>p.寿元-=n,awardWudaoGongfaProficiency:()=>({}),formatSignedPercent:String,
  player_efficiency:async()=>{},beginSuiyunTribulation:()=>{},protectSuiyunTribulationLoss:()=>{},cooldownRevivalGongfas:()=>{},sleep:async()=>{},getPassiveTribulationDamageMultiplier:()=>1,
  getFlowerTribulationBaseAtk:()=>100,calculateFlowerTribulationWave:()=>({damage:0,reduction:0}),calcFlowerTribulationMitigation:()=>({rate:0}),
 };
 deps.Math=Object.create(Math);deps.Math.random=()=>{randomCalls++;return random();};
 const App=new Function(...Object.keys(deps),appSource+';return FlowerPollenPath;')(...Object.values(deps)),app=new App();
 return {app,flags,files,replies,read,save,equipment,raw:()=>Object.fromEntries(Object.entries(files).map(([key,file])=>[key,fs.readFileSync(file,'utf8')])),stats:()=>({writes,bagWrites,rebuilds,transactions,randomCalls,ancestorChecks}),
  send:async(method='evolve',msg='#进化 '+medium)=>app[method]({msg,user_id:'fixture',isGroup:true,reply:async text=>{if(flags.throwReply)throw Error('fixture transport reply');replies.push(String(text));return true;}})
 };
}

test('all exclusive high transitions reject before normalization, random roll or any player mutation',()=>{
 const reasons={21:'self-dao-required',22:'sacrifice-dao-required',23:'sacrifice-bubble-required',24:'dao-beyond-required',25:'max',26:'max'};
 for(const [level,reason]of Object.entries(reasons))for(const resolver of [model.resolveFlowerEvolution,model.resolveFlowerBreakthrough]){
  const p={huafenlevel_id:Number(level),原记录:{道则:10}},before=structuredClone(p);let rolls=0;
  const result=resolver(p,'无暇进化花粉',()=>{rolls++;return 0;});assert.equal(result.ok,false);assert.equal(result.reason,reason);assert.equal(rolls,0);assert.deepEqual(p,before);
 }
 assert.equal(progression.getFlowerPollenProgression(20),null);
});

test('public high-realm guidance preserves existing proof command and uses only shipped entrypoints',()=>{
 const terminal=progression.getFlowerPollenProgression(24),complete=progression.getFlowerPollenProgression(25);
 assert.equal(terminal.command,'#证道');assert.equal(complete.command,'#花粉路');
 const text=[21,22,23,24,25].map(level=>progression.formatFlowerPollenProgression(level,{optional:true})).join('\n');
 assert.doesNotMatch(text,/#道外之路|#道外全览|#证道道外|#道外巡界/);
 assert.match(terminal.text,/已认主的大道至宝/);assert.match(complete.text,/#花粉境界/);
 const proofSource=fs.readFileSync(new URL('../apps/User/Level.js',import.meta.url),'utf8');
 assert.match(proofSource,/证唯一道之上需持有已认主的大道至宝本体/);
});

test('normal low evolution and losing outcomes retain original probability, cost and saved attribute rebuild',async()=>{
 const success=fixture(),before=success.read('player_path'),gear=success.equipment;
 await success.send();const after=success.read('player_path');assert.equal(after.huafenlevel_id,5);assert.equal(before.修为-after.修为,model.getFlowerEvolutionCost(4));assert.equal(success.read('najie_path').道具[0].数量,2);assert.equal(after.攻击,507);assert.deepEqual(success.read('equipment_path').武器,gear.武器);assert.equal(success.stats().transactions,1);
 const fail=fixture({random:()=>1}),old=fail.read('player_path');await fail.send();assert.equal(fail.read('player_path').huafenlevel_id,4);assert.equal(fail.read('player_path').修为,Math.floor((old.修为-model.getFlowerEvolutionCost(4))*.7));assert.equal(fail.read('najie_path').道具[0].数量,2);assert.match(fail.replies.at(-1),/道基受损/);
});

test('top evolution now guides every high realm before any seed check, material debit, save or attribute recalculation',async()=>{
 const commands={21:'#推演己道',22:'#祭道',23:'#空间泡影状态',24:'#证道',25:'#花粉路'};
 for(const [level,command]of Object.entries(commands)){
  const f=fixture({level:Number(level),medium:'无暇进化花粉'}),before=f.raw();await f.send();assert.deepEqual(f.raw(),before);
  assert.deepEqual(f.stats(),{writes:0,bagWrites:0,rebuilds:0,transactions:0,randomCalls:0,ancestorChecks:0});assert.ok(f.replies.at(-1).includes(command));assert.match(f.replies.at(-1),/无需持有祖种/);
 }
});

test('bag, player, and rebuilt equipment all roll back byte-for-byte on every explicit or thrown persistence failure',async()=>{
 for(const flag of ['failBag','throwBag','failPlayer','throwPlayer','failRebuild','throwRebuild']){
  const f=fixture(),before=f.raw();f.flags[flag]=true;await f.send();assert.deepEqual(f.raw(),before,flag);assert.match(f.replies.at(-1),/已恢复/);
  f.flags[flag]=false;await f.send();assert.equal(f.read('player_path').huafenlevel_id,5);assert.equal(f.read('najie_path').道具[0].数量,2);
 }
});

test('busy, active tribulation, insufficient quality and late fence consume nothing',async()=>{
 for(const flag of ['busy','tribulation','fence']){
  const f=fixture(),before=f.raw();f.flags[flag]=true;await f.send();assert.deepEqual(f.raw(),before);assert.equal(f.stats().bagWrites,0);assert.equal(f.stats().writes,0);assert.equal(f.stats().randomCalls,0);
 }
 const f=fixture({level:5,medium:'普通进化花粉'}),before=f.raw();await f.send();assert.deepEqual(f.raw(),before);assert.equal(f.stats().transactions,0);assert.match(f.replies.at(-1),/品阶不足/);
});

test('concurrent low progress commands re-read saved realm under the actual player lock',async()=>{
 const f=fixture();await Promise.all([f.send(),f.send()]);assert.equal(f.read('player_path').huafenlevel_id,5);assert.equal(f.read('najie_path').道具[0].数量,2);assert.equal(f.stats().writes,1);assert.equal(getPlayerMutationLockStats('fixture').active,false);
});

test('high status, dao and tribulation views agree on real promotion and retain optional original records',async()=>{
 for(const [level,command]of [[21,'#推演己道'],[22,'#祭道'],[23,'#空间泡影状态'],[24,'#证道']]){
  const f=fixture({level,medium:'无暇进化花粉'}),before=f.raw();
  for(const method of ['status','flowerDao','flowerTribulationStatus','flowerTribulation','ancestorWudao'])await f.send(method);
  assert.deepEqual(f.raw(),before);assert.ok(f.replies.every(text=>text.includes(command)));assert.ok(f.replies.every(text=>/额外修持/.test(text)));
  assert.doesNotMatch(f.replies.join('\n'),/下一境：.*阶进化媒介|可继续发送 #进化|可继续冲击/);
 }
});

test('optional high dao still increases original progress without promoting and clearly names its purpose',async()=>{
 const f=fixture({level:24,medium:'无暇进化花粉',daoComplete:false});const before=f.read('player_path');await f.send('flowerDao','#花粉悟道');
 const next=f.read('player_path');assert.equal(next.huafenlevel_id,24);assert.ok(next.花粉道途.stages.beyondPrinciple>0);assert.ok(next.修为<before.修为);assert.match(f.replies.at(-1),/额外修持/);assert.match(f.replies.at(-1),/#证道/);assert.match(f.replies.at(-1),/无需持有祖种/);
});

test('high optional tribulation precondition is separate from real promotion and costs nothing when its dao is missing',async()=>{
 const f=fixture({level:24,medium:'无暇进化花粉',daoComplete:false,tribulationComplete:false}),before=f.raw();await f.send('flowerTribulation','#花粉渡劫');
 assert.deepEqual(f.raw(),before);assert.match(f.replies.at(-1),/若继续这项额外渡劫/);assert.match(f.replies.at(-1),/#证道/);assert.equal(f.stats().bagWrites,0);
});

test('all original high optional tribulation waves still save completion without an automatic level or false next-evolution advice',async()=>{
 const f=fixture({level:24,medium:'无暇进化花粉',tribulationComplete:false}),before=f.read('player_path');await f.send('flowerTribulation','#花粉渡劫');
 const next=f.read('player_path');assert.equal(next.huafenlevel_id,24);assert.ok(next.花粉渡劫.completed[24]);assert.ok(next.修为<before.修为);assert.ok(next.进化积淀>before.进化积淀);
 const waves=f.replies.filter(x=>/^第\d+阶段·第\d+道雷劫/m.test(x));assert.equal(waves.length,40);assert.match(f.replies[0],/额外修持/);assert.match(f.replies.at(-1),/#证道/);assert.doesNotMatch(f.replies.at(-1),/生命层次完成跃迁|发送 #进化 继续/);
});

test('owned ancestor high dao remains available as optional cultivation and does not replace a real promotion',async()=>{
 const f=fixture({level:24,medium:'无暇进化花粉',daoComplete:false,seedOwned:true});const bag=f.read('najie_path');bag.道具.push({name:model.FLOWER_ANCESTOR_SEED_NAME,数量:1});f.save('najie_path',bag);
 const before=f.read('player_path');await f.send('ancestorWudao','#祖种悟道');const next=f.read('player_path');
 assert.equal(next.huafenlevel_id,24);assert.equal(next.花粉路祖种状态.悟道次数,1);assert.ok(next.花粉道途.stages.beyondPrinciple>0);assert.ok(next.修为<before.修为);assert.match(f.replies.at(-1),/额外修持/);assert.match(f.replies.at(-1),/#证道/);
});

test('real quasi-emperor entry stays an ordinary evolution after its separate gate is met',async()=>{
 const f=fixture({level:20,medium:'无暇进化花粉'});await f.send();assert.equal(f.read('player_path').huafenlevel_id,21);assert.equal(f.read('najie_path').道具[0].数量,2);assert.match(f.replies.at(-1),/生命跃迁/);
});

test('reply transport failure after committed evolution does not roll back or re-debit saved original results',async()=>{
 const f=fixture();f.flags.throwReply=true;await assert.rejects(f.send(),/fixture transport reply/);
 assert.equal(f.read('player_path').huafenlevel_id,5);assert.equal(f.read('najie_path').道具[0].数量,2);assert.equal(f.stats().writes,1);
 f.flags.throwReply=false;await f.send();assert.equal(f.read('player_path').huafenlevel_id,5);assert.equal(f.read('najie_path').道具[0].数量,2);
});

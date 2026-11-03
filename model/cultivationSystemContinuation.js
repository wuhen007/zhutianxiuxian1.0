const routes={mijing:{field:'mijinglevel_id',minimum:19},xiangu:{field:'xiangulevel_id',minimum:20},huafen:{field:'huafenlevel_id',minimum:20}};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
const n=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
/** Validate an explicit request to carry the SAME personal system into a new
 * cultivation route. This is not a second system or an automatic migration. */
export function prepareCultivationSystemContinuation(player,route,rawName,now){
 const system=player?.自创修炼体系;
 if(!system)return {ok:true,adapted:false};
 if(!plain(system)||!routes[system.route]||!routes[route]||typeof system.name!=='string'||!system.name.trim())return {ok:false,reason:'route_unknown',system};
 if(system.route===route)return {ok:false,reason:'exists',system};
 if(player.额外体系!==route)return {ok:false,reason:'route_unknown',system};
 if(String(rawName??'').trim()!==system.name)return {ok:false,reason:'route_name',system};
 if(n(player[routes[route].field])<routes[route].minimum)return {ok:false,reason:'realm',system};
 if(!Number.isSafeInteger(now)||now<=0||player.合道续接记录!==undefined&&!Array.isArray(player.合道续接记录))return {ok:false,reason:'route_unknown',system};
 const deduction=player.己道推演;
 if(deduction!==undefined&&!plain(deduction)||player.道外之路!==undefined&&!plain(player.道外之路))return {ok:false,reason:'route_unknown',system};
 // Global late-game records are not safely transferable by changing a label.
 // Keep those records intact for an explicit recovery review instead.
 if(plain(player.道外之路)||player.始祖永祭?.status==='bubble'||player.纳戒封锁?.locked||player.修仙状态==='形神俱灭'
  ||deduction&&(n(deduction.attempts)>0||n(deduction.sacrificeAttempts)>0||deduction.completed||deduction.battlePending||deduction.recovery
    ||deduction.realms?.length||deduction.pathAwakened||deduction.quasiEmperorPeak||deduction.divineEmbryo||deduction.halfImmortalEmperor
    ||n(deduction.completedAt)>0||n(deduction.divineEmbryoAt)>0||n(deduction.halfImmortalEmperorAt)>0||n(deduction.quasiEmperorPeakAt)>0||n(deduction.realmsNamedAt)>0)
  ||player.自身之道体系&&player.自身之道体系!==route
  ||system.emperorAt||system.realms?.length||/六境|神胎|半步|仙帝|道外/.test(String(system.stage||'')))return {ok:false,reason:'route_progress',system};
 return {ok:true,adapted:true,previous:structuredClone(system),from:system.route,to:route,at:now};
}

export function recordCultivationSystemContinuation(player,plan,gate,previousResult){
 if(!plan?.adapted||!plan.previous||!gate?.ok||!gate.rule)throw Error('道统续接凭据待核对。');
 player.合道续接记录=[...(player.合道续接记录||[]),{
  version:1,at:plan.at,from:plan.from,to:plan.to,system:structuredClone(plan.previous),
  previousResult:previousResult===undefined?null:structuredClone(previousResult),
  targetRealm:Number(player[routes[plan.to].field]),law:{key:gate.rule.key,name:gate.rule.name,exp:gate.exp,target:gate.rule.targetExp},
 }];
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import fs from 'node:fs';
import {
  withPlayerMutationLock, getPlayerMutationLockStats,
} from '../utils/playerMutationLock.js';
import {
  withTribulationLock, getTribulationLockContext, getTribulationLockStatus,
  assertTribulationWriteAllowed, markTribulationSnapshot,
  TRIBULATION_LOCK_BUSY, TRIBULATION_LOCK_TTL_SECONDS,
} from '../model/tribulationLock.js';
import {wrapTribulationEvent} from '../model/tribulationMessages.js';
import {formatTribulationStatus} from '../model/tribulationStatus.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{resolve,promise}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t) {
  const previous=globalThis.redis;
  const values=new Map(),expiry=new Map();let clock=Date.now();
  const get=key=>{if(expiry.has(key)&&expiry.get(key)<=clock){values.delete(key);expiry.delete(key)}return values.get(key)||null};
  const client={
    values,expiry,advance:ms=>{clock+=ms},
    get:async key=>get(key),
    ttl:async key=>get(key)?(expiry.has(key)?Math.ceil((expiry.get(key)-clock)/1000):-1):-2,
    set:async(key,value,options={})=>{if(options.NX&&get(key))return null;values.set(key,value);if(options.EX)expiry.set(key,clock+options.EX*1000);return 'OK'},
    eval:async(script,{keys,arguments:args})=>{
      if(get(keys[0])!==args[0])return 0;
      if(script.includes("redis.call('del'")){values.delete(keys[0]);expiry.delete(keys[0]);return 1}
      if(script.includes("redis.call('expire'")){expiry.set(keys[0],clock+Number(args[1])*1000);return 1}
      throw Error('Unrecognized fixture Lua');
    },
  };
  globalThis.redis=client;t.after(()=>{globalThis.redis=previous});return client;
}

test('排队的渡劫写入保留所有异步上下文，不再借用前任持锁者身份',async t=>{
  setup(t);const context=new AsyncLocalStorage(),firstRelease=deferred(),ready=deferred();
  const first=context.run('ordinary',()=>withPlayerMutationLock('queued',async()=>{ready.resolve();await firstRelease.promise}));
  await ready.promise;
  let inside;
  const next=context.run('tribulation',()=>withTribulationLock('queued',()=>withPlayerMutationLock('queued',async()=>{
    inside={caller:context.getStore(),lease:!!getTribulationLockContext('queued')};await assertTribulationWriteAllowed('queued');return 42;
  })));
  await flush();firstRelease.resolve();await first;
  assert.equal(await next,42);assert.deepEqual(inside,{caller:'tribulation',lease:true});
  assert.deepEqual(getPlayerMutationLockStats('queued'),{active:false,pending:0});
  assert.equal((await getTribulationLockStatus('queued')).locked,false);
});

test('前任定时回调持有过期的可重入上下文也会重新排队',async()=>{
  const trigger=deferred(),oldRan=deferred(),secondStarted=deferred(),release=deferred();let oldWork;const order=[];
  await withPlayerMutationLock('stale-context',async()=>{
    oldWork=trigger.promise.then(()=>withPlayerMutationLock('stale-context',()=>{order.push('old-timer');oldRan.resolve()}));
  });
  const second=withPlayerMutationLock('stale-context',async()=>{order.push('new:start');secondStarted.resolve();await release.promise;order.push('new:end')});
  await secondStarted.promise;trigger.resolve();await flush();
  assert.deepEqual(order,['new:start']);assert.equal(getPlayerMutationLockStats('stale-context').pending,1);
  release.resolve();await second;await oldWork;await oldRan.promise;
  assert.deepEqual(order,['new:start','new:end','old-timer']);
});

test('等待超时记录持锁调用位置及持有耗时，不强制释放真实持有者',async()=>{
  const release=deferred();const first=withPlayerMutationLock('owner-diagnostic',()=>release.promise);
  await assert.rejects(withPlayerMutationLock('owner-diagnostic',()=>assert.fail('never enter'),{waitTimeoutMs:15}),error=>{
    assert.equal(error.code,'wait_timeout');assert(error.ownerElapsedMs>=0);assert(error.ownerSite.includes('tribulation-stuck-regression'));return true;
  });
  assert.equal(getPlayerMutationLockStats('owner-diagnostic').active,true);release.resolve();await first;
});

test('新增锁租约120秒，进程停止续期后自然过期，旧900秒锁不被删除',async t=>{
  const client=setup(t);assert.equal(TRIBULATION_LOCK_TTL_SECONDS,120);
  const release=deferred(),ready=deferred();const work=withTribulationLock('lease',async()=>{ready.resolve();await release.promise});await ready.promise;
  assert.equal(await client.ttl('xiuxian:player:lease:tribulation_lock'),120);
  const oldKey='xiuxian:player:legacy:tribulation_lock';await client.set(oldKey,`tribulation:${Date.now()}:legacy`,{EX:900});
  client.advance(121000);
  assert.equal(await client.get('xiuxian:player:lease:tribulation_lock'),null);
  assert.equal((await getTribulationLockStatus('lease')).locked,true,'running local work stays fenced even if Redis expires');
  assert.equal((await getTribulationLockStatus('legacy')).ttlSeconds,779);
  release.resolve();await work;
  assert(await client.get(oldKey),'inspection must not delete legacy lease');
});

test('正常长渡劫持续续租，远超两分钟也不被当成残留删除',async t=>{
  const client=setup(t);const intervals=[];const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval;
  globalThis.setInterval=(callback,ms)=>{const timer={callback,ms,unref(){}};intervals.push(timer);return timer};globalThis.clearInterval=()=>{};
  try{
    const hold=deferred(),ready=deferred();const job=withTribulationLock('long',async()=>{ready.resolve();await hold.promise});await ready.promise;
    assert.equal(intervals[0].ms,30000);
    for(let i=0;i<25;i++){client.advance(30000);await intervals[0].callback();assert.equal(await client.ttl('xiuxian:player:long:tribulation_lock'),120)}
    assert.equal(await withTribulationLock('long',()=>assert.fail()),TRIBULATION_LOCK_BUSY);
    hold.resolve();await job;assert.equal(client.values.size,0);
  }finally{globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear}
});

test('原锁已关闭的延迟回调禁止写入，即使目前没有其他锁',async t=>{
  setup(t);const trigger=deferred();let later;
  await withTribulationLock('late-write',async()=>{later=trigger.promise.then(()=>assertTribulationWriteAllowed('late-write'))});
  const rejected=assert.rejects(later,/lost or closed/);trigger.resolve();await rejected;
});
test('续租回调执行前租约就已过期，也会在实际写入前拒绝旧持有者',async t=>{
  const client=setup(t);
  await withTribulationLock('expired-before-renew',async()=>{
    client.advance(121000);
    await assert.rejects(assertTribulationWriteAllowed('expired-before-renew'),/lost or closed/);
  });
});

test('续期时发现租约已换持有人，旧流程拒绝写入且不删除新锁',async t=>{
  const client=setup(t);let tick;const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;
  globalThis.setInterval=callback=>{tick=callback;return{unref(){}}};globalThis.clearInterval=()=>{};
  try{
    await withTribulationLock('renew-lost',async()=>{
      await client.set('xiuxian:player:renew-lost:tribulation_lock','NEW_OWNER',{EX:120});await tick();
      await assert.rejects(assertTribulationWriteAllowed('renew-lost'),/lost or closed/);
      assert.equal((await getTribulationLockStatus('renew-lost')).leaseLost,true);
    });
    assert.equal(await client.get('xiuxian:player:renew-lost:tribulation_lock'),'NEW_OWNER');
  }finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear}
});

test('发送消息永不返回时到期继续原结算，只跳过播报不跳过写入',async t=>{
  setup(t);let sends=0,writes=0;const contextSnapshots=[];
  const original={msg:'#fixture',reply(){sends++;return new Promise(()=>{})}};
  const wrapped=wrapTribulationEvent('send-timeout',original,{timeoutMs:15});
  await withTribulationLock('send-timeout',async()=>{
    assert.equal(await wrapped.reply('start'),false);
    contextSnapshots.push(await getTribulationLockStatus('send-timeout'));
    assert.equal(await wrapped.reply('later stage'),false);
    await withPlayerMutationLock('send-timeout',async()=>{await assertTribulationWriteAllowed('send-timeout');writes++});
  });
  assert.equal(sends,1);assert.equal(writes,1);assert(contextSnapshots[0].locked);assert(contextSnapshots[0].replySuppressed);
  assert.equal((await getTribulationLockStatus('send-timeout')).locked,false);
  assert.equal(original.msg,'#fixture');
});

test('迟到的消息拒绝被收集，不产生未处理异常或重复结算',async t=>{
  setup(t);const send=deferred();let reject;const pending=new Promise((_,r)=>reject=r);const event={reply:()=>pending};
  await withTribulationLock('late-reply',async()=>{const e=wrapTribulationEvent('late-reply',event,{timeoutMs:10});assert.equal(await e.reply('x'),false)});
  reject(Error('late reply failure'));await flush();
});

test('正常消息保留this和返回值，事件其他字段保持不变',async t=>{
  setup(t);const event={value:7,user_id:'normal-reply',reply(arg){assert.equal(this,event);return arg+this.value}};
  const wrapped=wrapTribulationEvent('normal-reply',event,{timeoutMs:100});
  await withTribulationLock('normal-reply',async()=>{assert.equal(await wrapped.reply(3),10);assert.equal(wrapped.user_id,event.user_id)});
});

test('状态明确区分本机运行和重启残留租约，不把租约当作出关倒计时',()=>{
  const local=formatTribulationStatus({local:true,ttlSeconds:110,elapsedSeconds:400,idleSeconds:200,kind:'测试渡劫',replySuppressed:true},{detail:true});
  assert.match(local,/已运行400秒/);assert.match(local,/不是渡劫倒计时/);assert.match(local,/最近流程推进200秒/);assert.match(local,/跳过等待/);
  const remote=formatTribulationStatus({local:false,ttlSeconds:100},{detail:true});assert.match(remote,/本机没有/);assert.match(remote,/其他实例/);assert.match(remote,/100秒/);
});

function guardFixture(overrides={}) {
  let source=fs.readFileSync(new URL('../apps/User/TribulationGuard.js',import.meta.url),'utf8').replace(/^import[\s\S]*?from ['"][^'"]+['"];\r?\n/gm,'').replace('export class','class');
  const writes=[];
  const deps={plugin:class{constructor(options){Object.assign(this,options)}},Write_player:async()=>writes.push('player'),Write_najie:async()=>writes.push('najie'),Write_equipment:async()=>writes.push('equipment'),
    channel:async id=>id,TRIBULATION_LOCK_BUSY,getTribulationLockStatus:async()=>({locked:false,available:true}),
    getTribulationCheckpoint:async()=>({exists:false}),withPlayerMutationLock,withTribulationLock:async(_id,fn)=>fn(),
    recoverTribulationCheckpoint:async()=>({recovered:false}),wrapTribulationEvent,formatTribulationStatus,...overrides};
  const Class=new Function(...Object.keys(deps),source+'; return TribulationGuard;')(...Object.values(deps));
  return{guard:new Class(),writes};
}
test('真实守卫的恢复指令不删除仍持有的租约、不执行回档',async()=>{
  const {guard,writes}=guardFixture({getTribulationLockStatus:async()=>({locked:true,local:false,available:true,ttlSeconds:77})});
  const replies=[];await guard.guard({user_id:'123456',msg:'#恢复渡劫',reply:async msg=>replies.push(msg)});
  assert.match(replies[0],/77秒/);assert.deepEqual(writes,[]);
});
test('真实守卫空闲时放行#我，手动复活选择始终放行',async()=>{
  const {guard}=guardFixture();
  assert.equal(await guard.guard({user_id:'123456',msg:'#我',reply:async()=>{}}),false);
  assert.equal(await guard.guard({user_id:'123456',msg:'#复活选择 1',reply:async()=>{}}),false);
});
test('真实守卫发送失败仍阻止后续命令，不以回复失败当成解锁',async()=>{
  const {guard}=guardFixture({getTribulationLockStatus:async()=>({locked:true,local:true,available:true})});
  assert.equal(await guard.guard({user_id:'123456',msg:'#我',reply:async()=>false}),true);
  assert.equal(await guard.guard({user_id:'123456',msg:'#我',reply:async()=>{throw Error('fixture send failure')}}),true);
});
test('真实守卫只对无锁检查点走原恢复器，在玩家互斥内执行',async()=>{
  let protectedRecovery=false;
  const {guard,writes}=guardFixture({getTribulationCheckpoint:async()=>({exists:true}),
    recoverTribulationCheckpoint:async(id,restore)=>{
      protectedRecovery=getPlayerMutationLockStats(id).active;
      await restore.restoreEquipment({});await restore.restoreNajie({});await restore.restorePlayer({});return{recovered:true};
    }});
  const replies=[];await guard.guard({user_id:'123456',msg:'#恢复渡劫',reply:async msg=>replies.push(msg)});
  assert(protectedRecovery);assert.deepEqual(writes,['equipment','najie','player']);assert.match(replies[0],/中断已恢复/);
});

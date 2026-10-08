import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WORLD_CHAT_HELP_PATTERN, WORLD_CHAT_JOIN_PATTERN, WORLD_CHAT_LEAVE_PATTERN, buildWorldChatHelp, joinWorldChatGroup, canManageWorldChatGroup, worldChatConnectionHint } from '../apps/worldChat/onboarding.js';

function mock({enable=true,connected=false,authed=false,last_error=''}={}) {
  const groups=new Set(),calls={connect:0,remember:0,join:0};
  const status={enable,connected,authed,last_error};
  const client={status:()=>({...status}),joinGroup:id=>{calls.join++;const exists=groups.has(id);groups.add(id);return !exists;},connect:()=>calls.connect++};
  const messages=[];const e={isGroup:true,group_id:'12345',sender:{role:'admin'},reply:async m=>messages.push(m)};
  return{client,e,messages,groups,calls,status,remember:()=>calls.remember++};
}

test('help/join/leave aliases match complete commands without swallowing world speech',()=>{
  for(const command of ['#世界帮助','#世界聊天','#世界聊天帮助','#世界频道帮助','#世界 菜单'])assert.ok(new RegExp(WORLD_CHAT_HELP_PATTERN).test(command),command);
  for(const command of ['#加入世界聊天','#加入世界频道','#世界加入','#世界 加入','#世界聊天加入'])assert.ok(new RegExp(WORLD_CHAT_JOIN_PATTERN).test(command),command);
  for(const command of ['#退出世界聊天','#世界退出','#世界 退出'])assert.ok(new RegExp(WORLD_CHAT_LEAVE_PATTERN).test(command),command);
  for(const pattern of [WORLD_CHAT_HELP_PATTERN,WORLD_CHAT_JOIN_PATTERN,WORLD_CHAT_LEAVE_PATTERN])for(const command of ['#世界发言 加入','#世界查看 10','#世界网页','#诸天世界','#世界加入 @他人'])assert.equal(new RegExp(pattern).test(command),false,command);
});
test('only actual group manager roles or bot master may subscribe',()=>{
  for(const e of [{isMaster:true},{sender:{role:'owner'}},{sender:{role:'admin'}},{member:{is_owner:true}},{member:{is_admin:true}}])assert.equal(canManageWorldChatGroup(e),true);
  assert.equal(canManageWorldChatGroup({sender:{role:'member'}}),false);
});
test('normal member and private requests cannot mutate subscriptions or sender binding',async()=>{
  for(const extra of [{sender:{role:'member'}},{isGroup:false}]){
    const f=mock();await joinWorldChatGroup(f.client,{...f.e,...extra},f.remember);
    assert.equal(f.groups.size,0);assert.equal(f.calls.remember,0);assert.equal(f.calls.connect,0);
  }
});
test('first join persists one group and attempts connection; duplicate join never duplicates subscription',async()=>{
  const f=mock();await joinWorldChatGroup(f.client,f.e,f.remember);await joinWorldChatGroup(f.client,f.e,f.remember);
  assert.deepEqual([...f.groups],['12345']);assert.equal(f.calls.connect,2);assert.equal(f.calls.remember,2);
  assert.match(f.messages[0],/正在连接/);assert.match(f.messages[1],/无需重复加入/);
  assert.ok(!f.messages[0].includes('总机已连接'));
});
test('group admin cannot silently reverse global disable',async()=>{
  const f=mock({enable:false});await joinWorldChatGroup(f.client,f.e,f.remember);
  assert.equal(f.calls.connect,0);assert.equal(f.status.enable,false);assert.equal(f.groups.size,1);
  assert.match(f.messages[0],/#世界开启/);
});
test('join confirms connectivity only when authenticated',async()=>{
  const f=mock({connected:true,authed:true});await joinWorldChatGroup(f.client,f.e,f.remember);assert.match(f.messages[0],/公共总机已连接/);
  f.status.authed=false;await joinWorldChatGroup(f.client,f.e,f.remember);assert.match(f.messages[1],/身份确认中/);
});
test('registration failures get actionable hints without secrets or raw errors',()=>{
  for(const err of ['enrollment_required','enrollment_invalid','auth_failed','invalid_registration_response'])assert.match(worldChatConnectionHint({enable:true,last_error:err}),/身份登记尚未通过/);
  const help=buildWorldChatHelp({status:{url:'wss://private-fixture',secret:'NEVER_PRINT',enrollment_token:'NEVER_PRINT',last_error:'NEVER_PRINT'},isGroup:true,joined:false});
  assert.ok(!help.includes('NEVER_PRINT'));assert.ok(!help.includes('private-fixture'));assert.match(help,/未加入/);assert.match(help,/#加入世界聊天/);
  assert.match(buildWorldChatHelp({isGroup:false}),/需要接收世界消息的群/);
});
test('malformed group ID is not persisted',async()=>{
  const f=mock();await joinWorldChatGroup(f.client,{...f.e,group_id:'../invalid'},f.remember);assert.equal(f.groups.size,0);assert.equal(f.calls.remember,0);
});
test('real plugin imports onboarding and delegates its join handler',()=>{
  const source=fs.readFileSync(new URL('../apps/worldChat/WorldChat.js',import.meta.url),'utf8');
  assert.match(source,/reg: WORLD_CHAT_HELP_PATTERN, fnc: 'worldHelp'/);assert.match(source,/return joinWorldChatGroup\(client, e/);
  assert.match(source,/reg: WORLD_CHAT_JOIN_PATTERN/);assert.match(source,/reg: WORLD_CHAT_LEAVE_PATTERN/);
  const text=source.slice(source.indexOf('  async setWorldEnabled(e) {'),source.indexOf('  async leave(e) {'));
  const method=new Function('client',`return ({${text}})`);
  let called=null;const handler=method({setEnable:enabled=>called=enabled});
  return (async()=>{
    const reply=async()=>{};await handler.setWorldEnabled({msg:'#世界开启',isMaster:false,reply});assert.equal(called,null);
    await handler.setWorldEnabled({msg:'#世界开启',isMaster:true,reply});assert.equal(called,true);
    await handler.setWorldEnabled({msg:'#世界 开启',isMaster:true,reply});assert.equal(called,true);
    await handler.setWorldEnabled({msg:'#世界关闭',isMaster:true,reply});assert.equal(called,false);
  })();
});
test('help menus and README advertise the real discoverable commands',()=>{
  for(const name of ['help','zhutianhelp','set']){
    const text=fs.readFileSync(new URL(`../config/help/${name}.yaml`,import.meta.url),'utf8');assert.match(text,/#加入世界聊天/);assert.match(text,/#世界帮助/);
  }
  const doc=fs.readFileSync(new URL('../README.md',import.meta.url),'utf8');assert.match(doc,/docs\/world-chat-quickstart.md/);assert.match(doc,/#加入世界聊天/);
});

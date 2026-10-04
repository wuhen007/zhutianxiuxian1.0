import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {WorldChatClient} from '../apps/worldChat/client.js';
import {joinWorldChatGroup} from '../apps/worldChat/onboarding.js';
import {createWorldChatServer} from '../worldchat-server/server.js';

async function until(predicate){const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,'fixture timed out');await new Promise(r=>setTimeout(r,20));}}

test('join onboarding connects a real client and delivers only new cross-realm messages to its subscribed group',async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'worldchat-onboarding-'));
  const secretA=crypto.randomBytes(32).toString('hex'),secretB=crypto.randomBytes(32).toString('hex');
  const server=createWorldChatServer({baseDir:directory,logger:{info(){},warn(){},error(){}},clients:{menu_sender:{secret:secretA},menu_receiver:{secret:secretB}},config:{HOST:'127.0.0.1',PORT:0,USER_COOLDOWN_MS:0}});
  const address=await server.start(),url=`ws://127.0.0.1:${address.port}`;
  const sender=new WorldChatClient({config:{enable:true,url,server_id:'menu_sender',secret:secretA,joined_groups:['source_group']},persist:false});
  const configPath=path.join(directory,'receiver.json');
  const receiver=new WorldChatClient({configPath,config:{enable:true,url,server_id:'menu_receiver',secret:secretB,joined_groups:[]},persist:true});
  t.after(async()=>{sender.close();receiver.close();await server.stop();});
  const deliveries=[];receiver.setMessageHandler(message=>{for(const group of receiver.groups())deliveries.push({group,text:message.msg});});
  sender.connect();await until(()=>sender.authed);
  assert.equal((await sender.pub('old before join',{name:'fixture',tag:'a'.repeat(16)})).ok,true);
  const reply=[];
  await joinWorldChatGroup(receiver,{isGroup:true,group_id:'selected_group',sender:{role:'admin'},reply:async text=>reply.push(text)});
  await until(()=>receiver.authed&&!receiver.cfg.start_from_now&&receiver.cfg.last_seen_seq===1);
  assert.equal(deliveries.length,0);
  assert.equal((await sender.pub('new after join',{name:'fixture',tag:'b'.repeat(16)})).ok,true);
  await until(()=>deliveries.length===1);
  assert.deepEqual(deliveries,[{group:'selected_group',text:'new after join'}]);
  assert.deepEqual(JSON.parse(fs.readFileSync(configPath,'utf8')).joined_groups,['selected_group']);
  assert.match(reply[0],/接收设置已保存/);
});

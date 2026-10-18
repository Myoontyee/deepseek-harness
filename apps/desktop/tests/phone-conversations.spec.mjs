import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PhoneConversations } from '../src/phone-conversations.ts'
test('phone mirrors retain content, reject traversal and hide revoked device copies',()=>{
 const root=mkdtempSync(join(tmpdir(),'dsh-phone-')),device='11111111-1111-4111-8111-111111111111',source='a'.repeat(64),id='22222222-2222-4222-8222-222222222222'
 const mirror=new PhoneConversations(root,value=>Buffer.from(value),value=>value.toString())
 try{
  const chat={id,title:'Phone research',updated:12,messages:[{role:'user',text:'Question'},{role:'assistant',text:'$x$ [link](https://example.com)',model:'deepseek',blocks:[{signature:'must-not-copy'}]}],annotations:[{quote:'$x$',comment:'note'}]}
  mirror.receive(device,'My phone',{source,chats:[chat]});const rows=mirror.list([{id:device}]);assert.equal(rows.length,1)
  const restored=mirror.read(rows[0].id,[{id:device}]);assert.equal(restored.annotations[0].comment,'note');assert.equal(restored.messages[1].text,chat.messages[1].text);assert.equal('blocks' in restored.messages[1],false)
  assert.equal(mirror.list([]).length,0);assert.throws(()=>mirror.read(rows[0].id,[]));assert.throws(()=>mirror.receive(device,'phone',{source:'../escape',chats:[chat]}));assert.throws(()=>mirror.read(`${device}/${source}/../../escape`,[{id:device}]))
  assert.ok(readFileSync(join(root,device,source,id+'.dat')).length<1500)
  mirror.receive(device,'phone',{source,chats:[{...chat,deleted:true,updated:13}]});assert.equal(mirror.list([{id:device}]).length,0)
 }finally{rmSync(root,{recursive:true,force:true})}
})

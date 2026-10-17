/** Real HTTP bootstrap tests; the external Tailnet identity lookup is the only mocked boundary. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { createTailnetPairingHandler, TailnetPairingServer } from '../src/tailnet-pairing.ts'
import { MobileServer, mobileAddresses } from '../src/mobile-server.ts'

async function fixture(options) {
 let handler
 const server=createServer((req,res)=>handler(req,res))
 await new Promise(done=>server.listen(0,'127.0.0.1',done))
 const authority=`127.0.0.1:${server.address().port}`
 handler=createTailnetPairingHandler(authority,options)
 return {server,authority,close:async()=>{server.closeAllConnections();await new Promise(done=>server.close(done))}}
}
async function send(authority,headers={},body='{}') {
 return new Promise((resolve,reject)=>{
  const req=request(`http://${authority}/v1/pair`,{method:'POST',headers:{'content-type':'application/json',...headers}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}))})
  req.on('error',reject);req.end(body)
 })
}
test('requires verified source and local approval, rejecting browser origins and excessive bodies',async()=>{
 let verified=0,approved=0
 const app=await fixture({verify:async address=>{assert.equal(address,'127.0.0.1');verified++;return 'phone-node'},authorize:async(name,signal)=>{assert.equal(name,'phone-node');assert.equal(signal.aborted,false);approved++;return {url:'https://100.80.1.1:4444',pin:'a'.repeat(64),token:'b'.repeat(43)}}})
 try{
  assert.equal((await send(app.authority,{origin:'https://example.test'})).status,403)
  assert.equal((await send(app.authority,{host:'example.test'})).status,403)
  assert.equal((await send(app.authority,{},'x'.repeat(257))).status,413)
  assert.equal(verified,0);assert.equal(approved,0)
  const result=await send(app.authority)
  assert.equal(result.status,200);assert.equal(result.body.token,'b'.repeat(43));assert.equal(verified,1);assert.equal(approved,1)
 }finally{await app.close()}
})
test('unknown Tailnet sources cannot reach operator approval',async()=>{
 let called=false
 const app=await fixture({verify:async()=>{throw new Error('not a peer')},authorize:async()=>{called=true;throw new Error('unexpected')}})
 try{assert.equal((await send(app.authority)).status,403);assert.equal(called,false)}finally{await app.close()}
})
test('bootstrap cannot bind a LAN or wildcard address',async()=>{
 for(const address of ['0.0.0.0','127.0.0.1','192.168.1.1']) await assert.rejects(new TailnetPairingServer(address,{verify:async()=>'',authorize:async()=>{throw new Error('unexpected')}}).start())
})
test('cancelled approval creates no grant; accepted approval returns a revocable pinned connection',async()=>{
 const root=await mkdtemp(join(resolve('.artifacts'),'tailnet-grant-'))
 let finish
 const server=await MobileServer.create({path:join(root,'state'),seal:value=>Buffer.from(value),unseal:value=>value.toString(),host:()=>undefined,approve:()=>new Promise(done=>{finish=done})})
 try{
  await server.start('127.0.0.1')
  const cancelled=new AbortController()
  const first=server.authorizeTailnetPeer('verified-phone',cancelled.signal)
  cancelled.abort();finish(true);await assert.rejects(first);assert.equal(server.devices.length,0)
  const second=server.authorizeTailnetPeer('verified-phone',new AbortController().signal)
  finish(true);const connection=await second
  assert.equal(connection.pin,server.pin);assert.equal(connection.url,server.origin);assert.match(connection.token,/^[\w-]{43}$/)
  assert.equal(server.devices.length,1);server.revoke(server.devices[0].id);assert.equal(server.devices.length,0)
 }finally{await server.dispose();assert.ok(root.startsWith(resolve('.artifacts')+sep));await rm(root,{recursive:true,force:true})}
})

test('approved network change rebinds the gateway before returning its pinned origin',async(t)=>{
 const address=mobileAddresses().find(value=>value!=='127.0.0.1')
 if(!address){t.skip('No private adapter on this test host');return}
 const root=await mkdtemp(join(resolve('.artifacts'),'tailnet-switch-'))
 let approved=false
 const server=await MobileServer.create({path:join(root,'state'),seal:value=>Buffer.from(value),unseal:value=>value.toString(),host:()=>undefined,approve:async(label,options)=>{assert.equal(options.switchingNetwork,true);return approved}})
 try{
  await server.start('127.0.0.1')
  await assert.rejects(server.authorizeTailnetPeer('verified-phone',new AbortController().signal,address))
  assert.equal(new URL(server.origin).hostname,'127.0.0.1');assert.equal(server.devices.length,0)
  approved=true
  const connection=await server.authorizeTailnetPeer('verified-phone',new AbortController().signal,address)
  assert.equal(new URL(connection.url).hostname,address);assert.equal(server.devices.length,1)
 }finally{await server.dispose();assert.ok(root.startsWith(resolve('.artifacts')+sep));await rm(root,{recursive:true,force:true})}
})

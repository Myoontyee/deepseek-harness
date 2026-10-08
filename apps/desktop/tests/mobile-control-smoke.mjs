import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { request } from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { MobileServer } from '../src/mobile-server.ts'
import WebSocket, { WebSocketServer } from 'ws'
import { once } from 'node:events'

function exchange(server,path,options={}) {
 return new Promise((resolve,reject)=>{
  const req=request(server.origin+path,{agent:false,ca:server.state.cert,checkServerIdentity:(_host,cert)=>cert.fingerprint256.replaceAll(':','').toLowerCase()===server.pin?undefined:new Error('pin mismatch'),method:options.method??'GET',headers:options.headers??{}},res=>{
   if(options.stream){res.on('error',()=>{});resolve({req,res});return}
   let body='';res.setEncoding('utf8');res.on('data',data=>body+=data);res.once('end',()=>resolve({status:res.statusCode,headers:res.headers,body}))
  });req.once('error',reject);if(options.body)req.write(options.body);req.end()
 })
}
test('pairing authenticates each request, isolates Host credentials, persists grants and revokes active streams',{timeout:20000},async()=>{
 const root=mkdtempSync(join(process.cwd(),'.mobile-test-'))
 let captured;let approvals=0
 const host=createServer((req,res)=>{
  captured={cookie:req.headers.cookie,origin:req.headers.origin,path:req.url}
  if(req.url==='/stream'){res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: ready\n\n');return}
  res.writeHead(200,{'set-cookie':'HOST_SECRET=private; HttpOnly','content-type':'text/plain'});res.end('host-ok')
 })
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve))
 const webSocketHost=new WebSocketServer({server:host})
 webSocketHost.on('connection',(socket,request)=>{assert.equal(request.headers.cookie,'host-auth=PRIVATE');socket.on('message',(data,binary)=>socket.send(data,{binary}))})
 const options={path:join(root,'state'),seal:value=>Buffer.from(value),unseal:value=>value.toString(),host:()=>({url:`http://127.0.0.1:${host.address().port}/?token=LAUNCH_PRIVATE`,cookie:'host-auth=PRIVATE'}),approve:async()=>{approvals++;return true}}
 let server
 try {
  server=await MobileServer.create(options)
  assert.equal(server.enabled,false);await server.start('127.0.0.1')
  assert.equal((await exchange(server,'/')).status,401)
  const code=JSON.parse(Buffer.from(server.pairingCode().slice(12),'base64url').toString())
  const pair=()=>exchange(server,'/_dsh_mobile/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:code.code,label:'Test Android'})})
  const response=await pair();assert.equal(response.status,200);const token=JSON.parse(response.body).token
  assert.equal(approvals,1);assert.equal((await pair()).status,403)
  const headers={cookie:`__Host-dsh-device=${token}`}
  assert.equal((await exchange(server,'/',{headers:{...headers,origin:'https://evil.invalid'}})).status,403)
  assert.equal((await exchange(server,'/?token=anything',{headers})).status,400)
  const proxied=await exchange(server,'/api/test?q=1',{headers});assert.equal(proxied.body,'host-ok');assert.equal(proxied.headers['set-cookie'],undefined)
  assert.deepEqual(captured,{cookie:'host-auth=PRIVATE',origin:undefined,path:'/api/test?q=1'})
  assert.equal(readFileSync(options.path,'utf8').includes(token),false)
  const originalPin=server.pin;await server.dispose();server=await MobileServer.create(options);await server.restore()
  assert.equal(server.pin,originalPin);assert.equal((await exchange(server,'/',{headers})).status,200)
  const live=new WebSocket(server.origin.replace('https:','wss:')+'/api', {ca:server.state.cert,checkServerIdentity:()=>undefined,headers})
  await once(live,'open');const echoed=once(live,'message');live.send('mobile-task');assert.equal(String((await echoed)[0]),'mobile-task')
  const socketClosed=once(live,'close')
  const stream=await exchange(server,'/stream',{headers,stream:true});stream.res.resume()
  const closed=new Promise(resolve=>stream.res.once('close',resolve));server.revoke(server.devices[0].id);await Promise.all([closed,socketClosed])
  assert.equal((await exchange(server,'/',{headers})).status,401)
  const expired=JSON.parse(Buffer.from(server.pairingCode().slice(12),'base64url').toString());server.code.expires=0
  assert.equal((await exchange(server,'/_dsh_mobile/pair',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:expired.code})})).status,403)
 }finally {await server?.stop();for(const socket of webSocketHost.clients)socket.terminate();await new Promise(resolve=>webSocketHost.close(resolve));host.closeAllConnections();await new Promise(resolve=>host.close(resolve));rmSync(root,{recursive:true})}
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { startSessionReader } from '../src/session-reader-server.ts'

test('reader rejects unauthenticated traffic and exposes only read_session', async () => {
 const calls=[]
 const host=createServer((req,res)=>{ calls.push({url:req.url,cookie:req.headers.cookie});res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({text:'Hello',nextOffset:null,throughSeq:7})) })
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve))
 const token='a'.repeat(64)
 const server=await startSessionReader(0,token,()=>({url:`http://127.0.0.1:${host.address().port}`,cookie:'private-host-cookie'}))
 try {
  assert.equal((await fetch(server.url)).status,401)
  assert.equal((await fetch(server.url,{headers:{authorization:`Bearer ${token}`,origin:'https://untrusted.invalid'}})).status,401)
  async function rpc(method,params={}) {
   const response=await fetch(server.url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})
   const body=await response.text()
   assert.equal(response.status,200,body)
   const json=body.startsWith('data:')||body.startsWith('event:') ? JSON.parse(body.split('\n').find(line=>line.startsWith('data:')).slice(5)) : JSON.parse(body)
   return json
  }
  const listed=await rpc('tools/list')
  assert.deepEqual(listed.result.tools.map(tool=>tool.name),['read_session'])
  const read=await rpc('tools/call',{name:'read_session',arguments:{session_id:'dsh://session/test',offset:0}})
  assert.match(read.result.content[0].text,/Hello/)
  assert.equal(calls.length,1)
  assert.equal(calls[0].cookie,'private-host-cookie')
  assert.match(calls[0].url,/format=transcript/)
  assert.doesNotMatch(JSON.stringify(read),/private-host-cookie/)
  const denied=await rpc('tools/call',{name:'send_session_message',arguments:{}})
  assert.ok(denied.error || denied.result.isError)
  assert.equal(calls.length,1)
 } finally { await server.close();host.closeAllConnections();await new Promise(resolve=>host.close(resolve)) }
})

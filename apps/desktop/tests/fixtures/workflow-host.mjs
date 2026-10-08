/** Isolated Git repositories and local deterministic sessions for Desktop qualification. */
import { apply as seed, inject as seedInject } from './workflow-seed.mjs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
export const inject = [...seedInject, 'workspaceRegistry', 'agentDefaultModel', 'sessionQuery','connectionController','webServer','settingsController','permissionPresets']
const execute = promisify(execFile)
export async function apply(ctx) {
  const root = process.env.DSH_SESSION_LINK_SMOKE_ROOT
  for (const name of ['workspace', 'other-workspace']) {
    const cwd = join(root, name)
    await mkdir(cwd, { recursive: true })
    const git = (...args) => execute('git', args, { cwd, encoding: 'utf8' })
    await git('init', '-b', 'main')
    await git('config', 'user.name', 'DSH Desktop Git Test')
    await git('config', 'user.email', 'fixture@example.invalid')
    await git('config', 'core.hooksPath', join(cwd, 'no-hooks'))
    await git('config', 'commit.gpgsign', 'false')
    await writeFile(join(cwd, 'git-demo.txt'), 'before\n')
    await git('add', '--', 'git-demo.txt')
    await git('commit', '-m', 'Initial fixture')
    await writeFile(join(cwd, 'git-demo.txt'), 'after\n')
    await ctx.workspaceRegistry.create(cwd, name === 'workspace' ? 'Git 验证项目' : '另一个 Git 项目')
  }
  const require = createRequire(join(process.cwd(), 'package.json'))
  const { LlmAdapter } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href)
  const {scopeOf}=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-scope')).href)
  const defaultBefore = ctx.agentDefaultModel.currentSelection()
  class ReviewAdapter extends LlmAdapter {
    providerInfo(provider) { return { id: provider, name: 'Review fixture' } }
    listModels(provider) { return Promise.resolve([{provider, id:'review', name:'Review fixture'}]) }
    resolveModel(provider,model) { return Promise.resolve({provider,id:model,name:'Review fixture'}) }
    async *stream(options) {
      await writeFile(join(root,'review-model-input.json'),JSON.stringify({
        prompt: options.messages.filter(message=>message.role==='user').flatMap(message=>message.content.filter(part=>part.type==='text').map(part=>part.text)).join('\n'),
        allText: options.messages.flatMap(message=>message.content.filter(part=>part.type==='text').map(part=>part.text)).join('\n'),
        tools: (options.tools ?? []).map(tool=>tool.name ?? tool.function?.name), defaultBefore, defaultAfter:ctx.agentDefaultModel.currentSelection(),
      }))
      const text='测试审查结果：已收到改动内容。本地固定回复，仅验证流程，不代表真实代码审查。'
      yield {type:'block-start',index:0,blockType:'text'}
      yield {type:'text-delta',index:0,text}
      yield {type:'block-end',index:0,block:{type:'text',text}}
      yield {type:'finish',reason:{kind:'stop'}}
    }
  }
  ctx.effect(()=>ctx.llm.registerAdapter(['review-fixture'],new ReviewAdapter()))
  ctx.on('agent/status',async({agent,status})=>{
    if(status!=='idle'||!agent.id.startsWith('review-'))return
    const observed=await ctx.sessionQuery.observeSession(agent.id)
    try { await writeFile(join(root,'review-persistence.json'),JSON.stringify({sessionId:agent.id,preset:observed.header.agentPreset,hasPrompt:observed.events.some(event=>event.type==='user/message'),hasReply:observed.events.some(event=>event.type==='assistant/message')})) }
    finally { observed[Symbol.dispose]() }
  })
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/workflow-smoke/ssh',handler:async(_request,response)=>{
    try {
      const agent=ctx.agents.list().find(agent=>agent.id.startsWith('ssh-'))
      if(!agent)throw new Error('SSH Session has not been created')
      const output=await ctx.connectionController.execute(agent,'printf test',new AbortController().signal)
      const tools=agent.ctx.get('tools').schemas(scopeOf(agent.ctx)).map(tool=>tool.name)
      ctx.permissionPresets.set(agent.session,'read-only')
      let readOnlyDenied=false
      try{await ctx.connectionController.execute(agent,'denied',new AbortController().signal)}catch(error){readOnlyDenied=String(error).includes('full access')}
      ctx.permissionPresets.set(agent.session,'danger-full-access')
      const target=(await ctx.connectionController.list()).connections.find(target=>target.alias==='gpu-fixture')
      await ctx.settingsController.mutate('connection-controller',[{op:'set',path:['profiles',target.id,'allowAgentCommands'],value:false}],undefined)
      let revokedDenied=false
      try{await ctx.connectionController.execute(agent,'denied',new AbortController().signal)}catch(error){revokedDenied=String(error).includes('Enable AI remote commands')}
      response.setHeader('content-type','application/json')
      response.end(JSON.stringify({output,tools,readOnlyDenied,revokedDenied}))
    }catch(error){response.statusCode=500;response.end(JSON.stringify({error:String(error)}))}
  }}))
  await seed(ctx)
}

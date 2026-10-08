/** Network-free demo provider driving the actual ordinary Session inbox and tools. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile, mkdir } from 'node:fs/promises'

export const inject = ['agents', 'agentPresets', 'sessions', 'llm', 'sessionController']
export async function apply(ctx) {
  const root = process.env.DSH_SESSION_LINK_SMOKE_ROOT
  const ids = JSON.parse(process.env.DSH_SESSION_LINK_SMOKE_IDS)
  const require = createRequire(join(process.cwd(), 'package.json'))
  const { createUserMessage, LlmAdapter } = await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-llm')).href)
  class DemoAdapter extends LlmAdapter {
    resolveModel(provider, model) {return Promise.resolve({provider,id:model,name:'会话通信演示（本地固定回复）'})}
    async *stream(options) {
      const last = options.messages.findLast(message => message.role === 'user')
      const text = last?.content.filter(block => block.type === 'text').map(block => block.text).join('') ?? ''
      await writeFile(join(root, 'last-model-input.json'), JSON.stringify({text: options.messages.filter(message => message.role === 'user').flatMap(message => message.content.filter(block => block.type === 'text').map(block => block.text)).join('\n\n')}))
      const feedback = text.startsWith('Feedback from session ')
      const incoming = text.startsWith('Message from session ')
      const answer = feedback
        ? 'A 已收到 B 的反馈。\n\n这是通过真实会话队列自动返回的消息；本演示使用本地固定回复，不调用在线模型。\n\n' + text
        : incoming
          ? 'B 已收到并处理这条会话消息。\n\n演示结果：消息来源、原请求和自动反馈链路正常。你可以回到 A 会话查看反馈。\n\n' + text.split('\n\n')[0]
          : '这是会话互通体验版（本地固定回复）。\n\n右键「协作 B · 接收与处理」→「发送会话消息…」，选择「协作 A · 请求与反馈」作为来源，填写消息并发送。B 的回复会自动回到 A。\n\n安装后的正式会话使用你配置的模型，AI 可调用 list_sessions 和 send_session_message。'
      await new Promise(resolve=>setTimeout(resolve,1200))
      yield {type:'block-start',index:0,blockType:'text'}
      yield {type:'text-delta',index:0,text:answer}
      yield {type:'block-end',index:0,block:{type:'text',text:answer}}
      yield {type:'finish',reason:{kind:'stop'}}
    }
  }
  ctx.effect(() => ctx.llm.registerAdapter(['session-relay-demo'],new DemoAdapter()))
  const handles=[]
  ctx.effect(() => async () => {await Promise.all(handles.map(handle=>handle.dispose()))})
  const titles=['协作 A · 请求与反馈','协作 B · 接收与处理','协作 C · 另一个项目']
  for(const [index,id] of ids.entries()) {
    const cwd=join(root,index === 2 ? 'other-workspace' : 'workspace')
    await mkdir(cwd,{recursive:true})
    const handle=await ctx.agents.create({sessionId:id,meta:{cwd},
      agentOptions:{provider:'session-relay-demo',model:'demo'},
      setup:async agentCtx=>{await ctx.agentPresets.mount(agentCtx,'standard')},
    })
    handles.push(handle)
    handle.agent.followup(createUserMessage({content:[{type:'text',text:'介绍一下这次会话互通演示'}],source:{kind:'user'}}))
    await handle.agent.whenIdle()
    await ctx.sessionController.rename({sessionId:id,title:titles[index]})
    await ctx.sessions.flush(handle.agent.session)
  }
  await writeFile(join(root,'seeded.json'),JSON.stringify({sessionIds:ids,mode:'real-loop-with-local-demo-adapter'}))
}

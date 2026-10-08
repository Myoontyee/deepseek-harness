import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const root=process.env.DSH_SESSION_LINK_SMOKE_ROOT
const require=createRequire(join(process.cwd(),'package.json'))
const { default: LocalSubprocess }=await import(pathToFileURL(require.resolve('@deepseek-ai/dsh-subprocess-local')).href)
const fake=join(root,'fixture-ssh')
export default class FixtureSubprocess extends LocalSubprocess {
  async resolveExecutable(command,env,signal){if(command==='fixture-ssh')return fake;return super.resolveExecutable(command,env,signal)}
  spawn(spec){
    if(spec.argv[0]!==fake)return super.spawn(spec)
    const code=`const fs=require('node:fs');const args=JSON.parse(process.argv[1]);fs.appendFileSync(${JSON.stringify(join(root,'ssh-calls.jsonl'))},JSON.stringify(args)+'\\n');if(args.includes('-G'))console.log('hostname fixture.invalid\\nuser fixture\\nport 2222');else if(args.at(-1)==='echo DSH_CONNECTION_OK')console.log('DSH_CONNECTION_OK');else console.log('REMOTE_FIXTURE_RESULT')`
    return super.spawn({...spec,argv:[process.execPath,'-e',code,JSON.stringify(spec.argv.slice(1))]})
  }
  spawnTerminal(spec){
    if(spec.argv[0]!==fake)return super.spawnTerminal(spec)
    const code=`const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(join(root,'ssh-terminal.json'))},JSON.stringify(${JSON.stringify(spec.argv.slice(1))}));console.log('DSH_REMOTE_TERMINAL_READY');require('node:readline').createInterface({input:process.stdin}).on('line',s=>{fs.writeFileSync(${JSON.stringify(join(root,'ssh-input.txt'))},s);console.log('REMOTE:'+s)})`
    return super.spawnTerminal({...spec,argv:[process.env.DSH_SSH_TEST_NODE,'-e',code]})
  }
}

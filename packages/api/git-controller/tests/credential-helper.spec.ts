/** Git actually invokes the scoped helper with Unicode, spaces and apostrophes in its path. */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, chmod, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { githubCredentialHelper } from '../src/commands.ts'

it('passes credentials directly through a safely quoted executable without changing global config', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-helper-'))
  try {
    const folder = join(root, "用户's tools")
    await mkdir(folder)
    const executable = join(folder, 'fake gh')
    await writeFile(executable, '#!/bin/sh\nprintf "username=fixture\\npassword=fixture-value\\n"\n')
    await chmod(executable, 0o755)
    const helper = githubCredentialHelper(executable)
    const child = spawn(
      'git',
      ['-c', 'credential.helper=', '-c', `credential.https://github.com.helper=${helper}`, 'credential', 'fill'],
      {
        cwd: root,
        windowsHide: true,
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: join(root, 'no-global-config'),
          GIT_TERMINAL_PROMPT: '0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )
    let stdout = '',
      stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      stdout += chunk
    })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      stderr += chunk
    })
    const ended = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', resolve)
    })
    const timer = setTimeout(() => child.kill(), 10000)
    try {
      child.stdin.end('protocol=https\nhost=github.com\n\n')
      expect(await ended, stderr).toBe(0)
      expect(stdout).toContain('username=fixture')
      expect(stdout).toContain('password=fixture-value')
    } finally {
      clearTimeout(timer)
      child.kill()
      await ended.catch(() => {
        /* Spawn failures are reported by the assertion path. */
      })
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 20000)

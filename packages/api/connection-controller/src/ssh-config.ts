/**
 * OpenSSH alias discovery adapted from Yan-Zero/dsh-remote-ssh, Apache-2.0.
 * Changes: bounded reads/Include count; command parsing and config writes omitted.
 * See THIRD_PARTY_NOTICES.md for source revision and license.
 */
import { createHash } from 'node:crypto'
import { glob, open } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, resolve } from 'node:path'
/** One concrete `Host` alias discovered from OpenSSH user configuration. */
export interface DiscoveredSshHost {
  id: string
  label: string
  sshTarget: string
  configPath: string
  hostName?: string
  user?: string
  port?: number
}

/** Result of recursively reading OpenSSH config files and their Includes. */
export interface SshConfigDiscovery {
  hosts: DiscoveredSshHost[]
  files: string[]
  errors: string[]
}

/**
 * Locate user and platform-wide OpenSSH configuration files.
 * @returns OpenSSH discovery paths.
 */
export function defaultSshConfigFiles(): string[] {
  return process.platform === 'win32'
    ? [resolve(homedir(), '.ssh', 'config'), resolve(process.env.ProgramData ?? String.raw`C:\ProgramData`, 'ssh', 'ssh_config')]
    : [resolve(homedir(), '.ssh', 'config'), '/etc/ssh/ssh_config']
}

/**
 * Identify a concrete SSH alias without storing it in a settings path.
 * @param sshTarget - discovered alias.
 * @returns stable settings-safe identity.
 */
export function discoveredSshServerId(sshTarget: string): string {
  return `ssh-config-${createHash('sha256').update(sshTarget).digest('hex').slice(0, 20)}`
}

/**
 * Discover concrete Host aliases with bounded Include expansion.
 * @param configFiles - discovery roots; missing optional files remain quiet.
 * @param limits - maximum visited files and bytes read per file.
 * @returns aliases, visited paths and diagnostics; OpenSSH still resolves connection semantics.
 */
export async function discoverSshConfigHosts(
  configFiles: string[],
  limits: { maxFiles: number; maxBytes: number },
): Promise<SshConfigDiscovery> {
  const hosts = new Map<string, DiscoveredSshHost>()
  const visited = new Set<string>()
  const files: string[] = []
  const errors: string[] = []

  const visit = async (configPath: string, required: boolean): Promise<void> => {
    const absolute = resolve(expandHome(configPath))
    const key = process.platform === 'win32' ? absolute.toLowerCase() : absolute
    if (visited.has(key)) return
    if (visited.size >= limits.maxFiles) {
      errors.push('SSH Include discovery exceeded the configured file limit')
      return
    }
    visited.add(key)
    let source: string
    try {
      const file = await open(absolute, 'r')
      try {
        const buffer = Buffer.alloc(limits.maxBytes + 1)
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
        if (bytesRead > limits.maxBytes) throw new Error('SSH configuration exceeds the configured byte limit')
        source = buffer
          .subarray(0, bytesRead)
          .toString('utf8')
          .replace(/^\uFEFF/, '')
      } finally {
        await file.close()
      }
    } catch (error) {
      const code = errorCode(error)
      if (required || (code !== 'ENOENT' && code !== 'ENOTDIR')) errors.push(`${absolute}: ${errorMessage(error)}`)
      return
    }
    files.push(absolute)
    let active: DiscoveredSshHost[] = []
    for (const rawLine of source.split(/\r?\n/)) {
      const tokens = tokenizeSshConfigLine(rawLine)
      if (tokens.length === 0) continue
      const [keyword, args] = splitKeyword(tokens)
      const lower = keyword.toLowerCase()
      if (lower === 'include') {
        for (const pattern of args) {
          const matches = await expandInclude(pattern, dirname(absolute), limits.maxFiles - visited.size)
          for (const match of matches) await visit(match, false)
        }
        continue
      }
      if (lower === 'match') {
        active = []
        continue
      }
      if (lower === 'host') {
        active = []
        for (const alias of args) {
          if (!isConcreteAlias(alias)) continue
          let host = hosts.get(alias)
          if (host === undefined) {
            host = {
              id: discoveredSshServerId(alias),
              label: alias,
              sshTarget: alias,
              configPath: absolute,
            }
            hosts.set(alias, host)
          }
          active.push(host)
        }
        continue
      }
      if (active.length === 0 || args[0] === undefined) continue
      if (lower === 'hostname') for (const host of active) host.hostName ??= args[0]
      else if (lower === 'user') for (const host of active) host.user ??= args[0]
      else if (lower === 'port') {
        const port = Number(args[0])
        if (Number.isSafeInteger(port) && port > 0 && port <= 65_535) for (const host of active) host.port ??= port
      }
    }
  }

  for (const configPath of configFiles) await visit(configPath, false)
  return {
    hosts: [...hosts.values()].sort((left, right) => left.label.localeCompare(right.label)),
    files,
    errors,
  }
}

function splitKeyword(tokens: string[]): [string, string[]] {
  const first = tokens[0] ?? ''
  const equals = first.indexOf('=')
  if (equals < 0) return [first, tokens.slice(1)]
  return [first.slice(0, equals), [first.slice(equals + 1), ...tokens.slice(1)].filter(Boolean)]
}

function tokenizeSshConfigLine(line: string): string[] {
  const tokens: string[] = []
  let token = ''
  let quote: '"' | "'" | undefined
  let escaped = false
  const push = () => {
    if (token !== '') tokens.push(token)
    token = ''
  }
  for (const character of line.trim()) {
    if (escaped) {
      token += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (quote !== undefined) {
      if (character === quote) quote = undefined
      else token += character
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '#') {
      break
    } else if (/\s/.test(character)) {
      push()
    } else {
      token += character
    }
  }
  if (escaped) token += '\\'
  push()
  return tokens
}

function isConcreteAlias(alias: string): boolean {
  return alias !== '' && !alias.startsWith('!') && !/[*?\[]/.test(alias)
}

async function expandInclude(pattern: string, baseDir: string, maxMatches: number): Promise<string[]> {
  const expanded = expandHome(pattern)
  const absolute = isAbsolute(expanded) ? expanded : resolve(baseDir, expanded)
  const matches: string[] = []
  try {
    for await (const match of glob(absolute.replaceAll('\\', '/'))) {
      matches.push(resolve(match))
      if (matches.length > maxMatches) break
    }
  } catch (_error) {
    // Invalid or unsupported Include patterns are reported by OpenSSH when a
    // connection uses them; discovery simply leaves those entries absent.
  }
  return matches.sort()
}

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return resolve(homedir(), path.slice(2))
  return path
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

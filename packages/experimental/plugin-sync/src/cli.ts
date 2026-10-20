#!/usr/bin/env node
/** Phase-0 command: read-only inventory and dry-run diff for cross-device plugin sync. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { deviceSyncEnabled, DEVICE_SYNC_FLAG } from './feature.ts'
import { diffInventories, formatDiff } from './diff.ts'
import { formatInventory, inventoryProfile, type InventoryOptions } from './inventory.ts'
import type { Inventory } from './types.ts'

interface Args {
  command?: 'inventory' | 'diff'
  profile: string
  dshHome: string
  baseVersion?: string
  out?: string
  source?: string
  target?: string
  targetProfile?: string
  targetDshHome?: string
  targetBaseVersion?: string
  json: boolean
  strict: boolean
}

function usage(): string {
  return [
    'Usage:',
    `  ${DEVICE_SYNC_FLAG}=1 node --import tsx/esm src/cli.ts inventory [--profile desktop] [--dsh-home PATH] [--base-version V] [--out FILE] [--json]`,
    `  ${DEVICE_SYNC_FLAG}=1 node --import tsx/esm src/cli.ts diff --source FILE (--target FILE | --target-profile NAME [--target-dsh-home PATH]) [--json] [--strict]`,
  ].join('\n')
}

function parse(argv: readonly string[]): Args {
  const args: Args = { profile: 'desktop', dshHome: join(homedir(), '.dsh'), json: false, strict: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const next = (): string => {
      const result = argv[index + 1]
      if (result === undefined) throw new Error(`${value} requires a value`)
      index += 1
      return result
    }
    if (value === 'inventory' || value === 'diff') args.command = value
    else if (value === '--profile') args.profile = next()
    else if (value === '--dsh-home') args.dshHome = next()
    else if (value === '--base-version') args.baseVersion = next()
    else if (value === '--out') args.out = next()
    else if (value === '--source') args.source = next()
    else if (value === '--target') args.target = next()
    else if (value === '--target-profile') args.targetProfile = next()
    else if (value === '--target-dsh-home') args.targetDshHome = next()
    else if (value === '--target-base-version') args.targetBaseVersion = next()
    else if (value === '--json') args.json = true
    else if (value === '--strict') args.strict = true
    else if (value === '--help' || value === '-h') {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    } else throw new Error(`Unknown argument: ${value}`)
  }
  return args
}

function baseVersionFromRepository(): string {
  const path = join(process.cwd(), 'package.json')
  if (!existsSync(path)) throw new Error('Cannot read the repository package.json; pass --base-version')
  const value = JSON.parse(readFileSync(path, 'utf8')) as { version?: unknown }
  if (typeof value.version !== 'string' || value.version === '') throw new Error('Repository package.json has no version')
  return value.version
}

function readInventory(path: string): Inventory {
  return JSON.parse(readFileSync(path, 'utf8')) as Inventory
}

function inventory(args: Args): Inventory {
  const options: InventoryOptions = {
    dshHome: args.dshHome, profileName: args.profile,
    hostBaseVersion: args.baseVersion ?? baseVersionFromRepository(),
  }
  return inventoryProfile(options)
}

function main(): void {
  if (!deviceSyncEnabled()) {
    process.stderr.write(`Device sync is experimental and disabled. Set ${DEVICE_SYNC_FLAG}=1 to run a read-only check.\n`)
    process.exitCode = 1
    return
  }
  const args = parse(process.argv.slice(2))
  if (args.command === undefined) {
    process.stderr.write(`${usage()}\n`)
    process.exitCode = 1
    return
  }
  if (args.command === 'inventory') {
    const result = inventory(args)
    if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
    process.stdout.write(`${args.json ? JSON.stringify(result, null, 2) : formatInventory(result)}\n`)
    return
  }
  if (args.source === undefined) throw new Error('diff requires --source')
  const source = readInventory(args.source)
  const target = args.target !== undefined
    ? readInventory(args.target)
    : args.targetProfile === undefined
      ? (() => { throw new Error('diff requires --target or --target-profile') })()
      : inventoryProfile({
        dshHome: args.targetDshHome ?? args.dshHome,
        profileName: args.targetProfile,
        hostBaseVersion: args.targetBaseVersion ?? args.baseVersion ?? baseVersionFromRepository(),
      })
  const result = diffInventories(source, target)
  if (args.out !== undefined) writeFileSync(args.out, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 })
  process.stdout.write(`${args.json ? JSON.stringify(result, null, 2) : formatDiff(result)}\n`)
  if (!result.compatible || (args.strict && (result.summary.unsupported > 0 || result.summary.inventoryOnly > 0))) {
    process.exitCode = 2
  }
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
}

/** Read-only upstream release discovery, separate from custom installation and mandatory policy. */
import { gt, rcompare, valid } from 'semver'
import { z } from 'zod'

const releases = z.array(z.object({ tag_name: z.string(), draft: z.boolean() }))
/**
 * @param data - GitHub release list.
 * @param installed - Custom or official version.
 * @returns Newest upstream version newer than the installed base.
 */
export function newerOfficialVersion(data: unknown, installed: string): string | undefined {
  const base = installed.replace(/\.20\d{6}\.\d+$/u, '')
  if (!valid(base)) throw new Error('Invalid installed base version')
  return releases.parse(data).filter(release => !release.draft)
    .map(release => release.tag_name.replace(/^(?:dsh-)?v/u, ''))
    .filter((version): version is string => valid(version) !== null && gt(version, base))
    .sort(rcompare)[0]
}

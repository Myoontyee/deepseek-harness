/** Propose a released upstream base; conflicts become a review issue, never a forced merge. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const repository = 'Myoontyee/deepseek-harness'
const upstream = 'deepseek-ai/deepseek-harness'
const baseBranch = process.env.CUSTOM_BASE_BRANCH
if (!baseBranch || spawnSync('git', ['check-ref-format', '--branch', baseBranch]).status !== 0) throw new Error('Invalid custom base branch')
const gh = args => execFileSync('gh', args, { encoding: 'utf8' }).trim()
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim()
const releases = JSON.parse(gh(['api', `repos/${upstream}/releases?per_page=30`]))
const latest = releases.find(release => !release.draft && /^dsh-v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/u.test(release.tag_name))
if (!latest) throw new Error('No official DSH release found')
const base = JSON.parse(readFileSync('package.json', 'utf8')).version
if (latest.tag_name === `dsh-v${base}`) {
  console.log(`Already based on ${latest.tag_name}`)
  process.exit(0)
}
const tag = latest.tag_name
const branch = `automation/upstream-${tag}`
const existing = gh(['api', `repos/${repository}/branches?per_page=100`])
if (JSON.parse(existing).some(item => item.name === branch)) {
  console.log(`Existing upgrade branch requires review: ${branch}`)
  process.exit(0)
}
git(['fetch', `https://github.com/${upstream}.git`, `refs/tags/${tag}:refs/tags/${tag}`])
if (spawnSync('git', ['merge-base', '--is-ancestor', tag, 'HEAD']).status === 0) {
  console.log(`Custom source already contains ${tag}`)
  process.exit(0)
}
git(['switch', '-c', branch])
git(['config', 'user.name', 'github-actions[bot]'])
git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
const result = spawnSync('git', ['merge', '--no-commit', '--no-ff', tag], { encoding: 'utf8' })
const temporary = mkdtempSync(join(tmpdir(), 'dsh-upstream-'))
try {
  const body = join(temporary, 'body.md')
  if (result.status !== 0) {
    const conflicts = git(['diff', '--name-only', '--diff-filter=U'])
    if (!conflicts) throw new Error('Upstream merge failed without file conflicts; inspect the runner')
    git(['merge', '--abort'])
    const title = `Review upstream ${tag} conflicts`
    const issues = JSON.parse(gh(['issue', 'list', '--repo', repository, '--state', 'open', '--search', `${tag} in:title`, '--json', 'title,number']))
    if (issues.some(issue => issue.title === title)) returnExisting()
    else {
      writeFileSync(body, `Official release: ${latest.html_url}\n\nBase branch: ${baseBranch}\n\nNo custom source was overwritten. Resolve these conflicts and validate retained features before releasing:\n\n${conflicts.split('\n').map(path => `- \`${path}\``).join('\n')}\n`)
      gh(['issue', 'create', '--repo', repository, '--title', title, '--body-file', body])
    }
  } else {
    git(['commit', '-m', `Merge official ${tag} for compatibility review`])
    gh(['auth', 'setup-git'])
    git(['push', 'origin', `HEAD:refs/heads/${branch}`])
    writeFileSync(body, `Official release: ${latest.html_url}\n\nThis merge has no textual conflicts. Functional validation is still required for custom annotations, message editing, clipboard policy, session relay, Desktop windows, mobile pairing, and skills. Do not publish a custom tag until checks and platform builds pass.\n\nWorkflows created using GITHUB_TOKEN do not automatically trigger ordinary push/PR workflows; dispatch validation explicitly before approving this PR.\n`)
    try {
      gh(['pr', 'create', '--repo', repository, '--base', baseBranch, '--head', branch, '--draft', '--title', `Upgrade custom base to ${tag}`, '--body-file', body])
    } catch (error) {
      if (!String(error.stderr ?? '').includes('not permitted to create or approve pull requests')) throw error
      writeFileSync(body, `Official release: ${latest.html_url}\n\nThe merge branch is ready for local review: https://github.com/${repository}/compare/${baseBranch}...${branch}\n\nGitHub does not permit this workflow token to create pull requests. Repository approval permissions were not changed. Create a draft PR from the branch after reviewing the compatibility checks.\n`)
      gh(['issue', 'create', '--repo', repository, '--title', `Review upstream ${tag} merge branch`, '--body-file', body])
    }
    gh(['workflow', 'run', 'custom-validation.yml', '--repo', repository, '--ref', branch])
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}

function returnExisting() { console.log('An open conflict review issue already exists') }

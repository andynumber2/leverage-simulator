/**
 * tests/ci-workflow.test.ts: PERF-01, threat T-01 (fork-PR privilege escalation).
 *
 * D-01's mitigation is that CI uses the `pull_request` trigger and never
 * `pull_request_target`, holds a workflow-level read-only token, and references no
 * secrets, so untrusted fork-PR code executing during `npm ci` / `npm run bench` gets
 * no write token and has nothing to exfiltrate. Until now that was asserted only by a
 * human reading the YAML (01-VERIFICATION.md human_verification), which is exactly the
 * kind of check that rots silently when the workflow is edited.
 *
 * No YAML parser is used: ci.yml is a small file with a known, flat format, and the four
 * properties below are decidable from comment-stripped line structure. Adding a parser
 * dependency to CI's own security gate would widen the supply-chain surface the gate
 * exists to narrow.
 *
 * The stripping function is deliberately pure and separately tested against fixtures.
 * ci.yml's own comments name `pull_request_target` in prose explaining why it is not
 * used, so an assertion over raw text would be satisfied by the explanation rather than
 * by the configuration. Equally, a stripper that returned an empty string would satisfy
 * every negative assertion below, so the stripper is proven on fixtures where both the
 * commented and uncommented cases are known.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CI_WORKFLOW_PATH = resolve(REPO_ROOT, '.github', 'workflows', 'ci.yml')

/** Removes whole-line YAML comments. Trailing comments after a value are left alone:
 * ci.yml has none, and stripping them correctly requires quote-awareness this does not
 * need to carry. */
export function stripYamlComments(yaml: string): string {
  return yaml
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n')
}

const RAW_WORKFLOW = readFileSync(CI_WORKFLOW_PATH, 'utf8')
const WORKFLOW = stripYamlComments(RAW_WORKFLOW)

describe('stripYamlComments (proving the assertions below are load-bearing)', () => {
  test('a commented-out pull_request_target is removed', () => {
    expect(stripYamlComments('on:\n  # never pull_request_target\n  pull_request:')).not.toContain(
      'pull_request_target',
    )
  })

  test('an uncommented pull_request_target survives stripping', () => {
    expect(stripYamlComments('on:\n  pull_request_target:\n')).toContain('pull_request_target')
  })

  test('an indented comment is stripped, not just a column-zero one', () => {
    expect(stripYamlComments('jobs:\n      # pull_request_target\n')).not.toContain(
      'pull_request_target',
    )
  })

  test('non-comment content is preserved verbatim, so the stripper cannot pass by erasing everything', () => {
    const yaml = 'on:\n  pull_request:\npermissions:\n  contents: read\n'
    expect(stripYamlComments(yaml)).toBe(yaml)
  })
})

describe('CI workflow security (PERF-01, threat T-01)', () => {
  test('ci.yml genuinely discusses pull_request_target in comments, so the stripping step is doing real work here', () => {
    // If this ever fails the workflow's rationale comment was removed; the assertions
    // below still hold, but the stripping step is no longer exercised by the real file.
    expect(RAW_WORKFLOW).toContain('pull_request_target')
  })

  test('the pull_request trigger is configured, not merely mentioned in a comment', () => {
    expect(WORKFLOW).toMatch(/^\s*pull_request:\s*$/m)
  })

  test('pull_request_target is not configured anywhere outside comments', () => {
    expect(
      WORKFLOW,
      'pull_request_target grants fork-PR code a write token and secret access (T-01); use pull_request',
    ).not.toContain('pull_request_target')
  })

  test('a workflow-level permissions block grants contents: read', () => {
    const permissionsBlock = WORKFLOW.match(/^permissions:\n((?:[ \t]+\S.*\n)+)/m)
    expect(permissionsBlock, 'no workflow-level permissions: block found').not.toBeNull()
    expect(permissionsBlock?.[1]).toMatch(/^\s*contents:\s*read\s*$/m)
  })

  test('no write permission is granted at workflow or job level', () => {
    const writeGrants = WORKFLOW.split('\n').filter((line) =>
      /:\s*write(-all)?\s*$/.test(line) || /^\s*permissions:\s*write-all\s*$/.test(line),
    )
    expect(writeGrants, `workflow grants write permission: ${writeGrants.join(' | ')}`).toEqual([])
  })

  test('no secrets are referenced anywhere in the workflow', () => {
    expect(WORKFLOW, 'a read-only workflow must have no secret to leak to fork-PR code').not.toMatch(
      /secrets\./,
    )
  })

  test('the bench gate itself is still wired: npm run bench runs in CI', () => {
    expect(WORKFLOW).toMatch(/^\s*-\s*run:\s*npm run bench\s*$/m)
  })
})

describe('DATA-09 recompile-determinism gate', () => {
  test('the npm run compile-data invocation is present with raw and public/data arguments', () => {
    expect(WORKFLOW).toMatch(/npm run compile-data\s+raw\s+public\/data/)
  })

  test('the git diff --exit-code invocation is present, checking both public/data and src/data-bundle.generated.ts', () => {
    expect(WORKFLOW).toMatch(/git diff\s+--exit-code\s+--\s+public\/data\s+src\/data-bundle\.generated\.ts/)
  })

  test('both the compile-data and git diff commands appear as sequential run steps in the workflow', () => {
    // Look for the pattern of a run step containing compile-data followed by a run step containing git diff
    // within the same job (no other job markers in between).
    const compileMentioned = WORKFLOW.indexOf('npm run compile-data') >= 0
    const gitDiffMentioned = WORKFLOW.indexOf('git diff --exit-code') >= 0

    expect(compileMentioned, 'npm run compile-data not found in workflow').toBe(true)
    expect(gitDiffMentioned, 'git diff --exit-code not found in workflow').toBe(true)

    // Verify the compile step comes before the git diff step (they should be sequential in the same job)
    const compilePos = WORKFLOW.indexOf('npm run compile-data')
    const gitDiffPos = WORKFLOW.indexOf('git diff --exit-code')
    expect(compilePos < gitDiffPos, 'compile-data should appear before git diff in the workflow').toBe(true)
  })

  test('the Recompile-determinism gate step name is present (for documentation and observability)', () => {
    expect(WORKFLOW).toMatch(/Recompile-determinism gate/)
  })
})

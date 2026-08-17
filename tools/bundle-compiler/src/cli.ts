/**
 * tools/bundle-compiler/src/cli.ts
 *
 * Thin entry point. Parses argv with `parseArgs` in strict mode with no declared options, so any
 * flag is a parse error (D-11, T-02-SC's neighboring anti-pattern: no validation-bypass flag).
 * Resolves both positionals and confirms each is inside the current working directory tree
 * (T-02-02) before calling `compileBundle`.
 */

import { parseArgs } from 'node:util'
import path from 'node:path'

import { compileBundle } from './compile.ts'

const USAGE = 'usage: compile-data <rawDir> <outDir>'

function resolveContained(argPath: string, cwd: string): string | null {
  const resolved = path.resolve(cwd, argPath)
  const relative = path.relative(cwd, resolved)
  if (relative !== '' && (relative.startsWith('..') || path.isAbsolute(relative))) {
    process.stderr.write(
      `compile-data: path "${argPath}" resolves to "${resolved}", which is outside the working directory tree (${cwd}); refusing to proceed\n`,
    )
    return null
  }
  return resolved
}

function main(): void {
  let positionals: string[]
  try {
    const parsed = parseArgs({ args: process.argv.slice(2), allowPositionals: true, strict: true })
    positionals = parsed.positionals
  } catch (err) {
    process.stderr.write(`compile-data: ${(err as Error).message}\n${USAGE}\n`)
    process.exitCode = 1
    return
  }

  if (positionals.length !== 2) {
    process.stderr.write(`compile-data: expected exactly two positional arguments (rawDir, outDir)\n${USAGE}\n`)
    process.exitCode = 1
    return
  }

  const [rawDirArg, outDirArg] = positionals as [string, string]
  const cwd = process.cwd()
  const rawDir = resolveContained(rawDirArg, cwd)
  const outDir = resolveContained(outDirArg, cwd)
  // D-22: the generated pointer module always lands at "src" under the working directory,
  // resolved and containment-checked the same way as the two positional arguments (T-02-02).
  // Not a third positional: the CLI's own usage stays "compile-data <rawDir> <outDir>".
  const srcDir = resolveContained('src', cwd)
  if (rawDir === null || outDir === null || srcDir === null) {
    process.exitCode = 1
    return
  }

  try {
    const result = compileBundle(rawDir, outDir, srcDir)
    for (const warning of result.warnings) {
      process.stderr.write(`compile-data: warning: ${warning}\n`)
    }
    process.stdout.write(`compile-data: bundleVersion=${result.bundleVersion}\n`)
    process.stdout.write(`compile-data: calendar=${result.calendarFile}\n`)
    for (const assetFile of result.assetFiles) {
      process.stdout.write(`compile-data: asset=${assetFile}\n`)
    }
    process.stdout.write(`compile-data: manifest=${result.manifestFile}\n`)
  } catch (err) {
    process.stderr.write(`compile-data: ${(err as Error).message}\n`)
    process.exitCode = 1
  }
}

main()

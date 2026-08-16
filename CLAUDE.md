# leverage-simulator

## Persistence

Do NOT write to the memory system (`~/.claude/projects/*/memory/`) for this project. Memory files do not reliably survive. Anything that must persist beyond a single session goes in this file, or in the global `~/.claude/CLAUDE.md` if it applies to every project.

## Worktrees

`workflow.use_worktrees: true` in `.planning/config.json` is a deliberate exception to the global "prefer not to use worktrees" rule. Do not set it to `false` to satisfy that rule.

GSD's `execute-phase` spawns executors with `isolation="worktree"` and enforces its own safety checks around it (it asserts the branch matches `worktree-agent-*` before permitting a commit, reaps orphaned worktrees, and auto-disables isolation for plans touching a submodule path). Turning it off would forfeit parallel plan execution within a phase, which `parallelization: true` depends on, for no safety gain.

The global rule still binds for any Agent call constructed by hand.

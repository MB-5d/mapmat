# Vellic Workflow Notes

## Drift Control
- When a task spans both app styling/code and the Figma library, do the work in the order that reduces drift and design debt.
- Default order:
  1. stabilize shared code-side tokens, component styles, and states first
  2. validate the app build
  3. update the Figma library against that stabilized code contract
- Treat the app codebase as the source of truth unless the user explicitly says a Figma decision should lead and then be ported back to code.
- Call out explicitly before any Figma cleanup step that requires matching repo changes.
- Design system goal: represent reusable UI decisions as tokens or shared components so the system can scale and adapt without duplicate manual styling.

## Parallel Chat Safety
- Multiple Codex chats may be working in this repo at the same time.
- Before editing, inspect the current worktree and relevant files.
- Do not overwrite, revert, or remove changes made by another chat or the user.
- If another chat appears to be editing the same files or feature area, pause and ask the user before resolving the conflict.
- Prefer narrow, task-specific edits so parallel work can proceed safely.
- If a merge, rebase, commit, or push could affect another chat's progress, ask the user first.

## MapMat Publish Workflow
- For `push to staging` tasks, inspect scope first with `git status --short --branch`, `git rev-list --left-right --count HEAD...origin/staging`, and `git log --oneline origin/staging..HEAD`.
- Treat `push everything to staging` as publish-all-pending-work. Treat a terse follow-up `push to staging` after a validated fix as ship-the-scoped-fix only.
- If the main checkout is dirty and only a scoped subset should ship, use a clean worktree based on `origin/staging` instead of forcing a mixed-worktree push.
- Before committing, use `git diff --name-only` for scope checks and `git diff --cached --check` before the final push.
- Final publish check: confirm divergence is resolved and re-run `git status --short --branch`.

## Validation Commands
- Backend syntax and boundary checks: `npm run check:backend`
- Backend checks against the Postgres runtime path: `npm run check:backend:postgres`
- Frontend production build: `npm run check:frontend-build`
- Staging runtime verification: `npm run verify:runtime:staging`
- Production runtime verification: `npm run verify:runtime:production`
- Full runtime verification across staging and production: `npm run verify:runtime:all`
- Staging realtime verification: `npm run verify:realtime:staging:preflight`

## Realtime Rollout Checks
- Before scope or broad-rollout changes, compare staging vs production policy with `npm run verify:realtime:rollout-state`.
- For staged canary rollout checks, run `npm run verify:realtime:staging:canary` and `npm run verify:realtime:staging:canary:window`.
- Only when a broad rollout is explicitly intended, run `npm run verify:realtime:staging:broad` and `npm run verify:realtime:staging:broad:window`.

## Automation Worktrees
- In Codex automation worktrees, `git status --short --branch` may show `## HEAD (no branch)`; treat that detached state as normal unless another signal shows a real git problem.
- For evidence-first bug scans, start with `git rev-list --count --since='<last-run-timestamp>' HEAD` and fall back to `git rev-list --count --since='24 hours ago' HEAD`. If both are `0`, stop rather than inventing a bug from thin evidence.

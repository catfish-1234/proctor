# Roadmap — proctor

## Overview

8 phases | 47 requirements

Build order: horizontal layers in dependency order — each phase delivers one complete technical layer that the next depends on.

## Phases

- [x] **Phase 0: Prior Art & Name Resolution** — Resolve npm name conflict and confirm wedge before writing code
- [x] **Phase 1: Foundation** — TypeScript ESM project scaffolded with diff parser, types, and fixtures (completed 2026-07-03)
- [x] **Phase 2: Core Rules + CLI** — First working tool: RH001/002/003/007, `proctor check`, git hook, inline suppression (completed 2026-07-04)
- [x] **Phase 3: Claude Code Stop Hook** — Stop hook blocks agent turns on error-severity findings, exits 2 (completed 2026-07-04)
- [ ] **Phase 4: AST Layer + Subtle Rules** — RH004/005/006/008 with AST-backed detection and `--ai` flag
- [ ] **Phase 5: SARIF + GitHub Action** — CI integration via SARIF output and `action.yml`
- [ ] **Phase 6: Skill, Adapters & Benchmark** — L1 skill, multi-agent adapters, `proctor bench` measurement
- [ ] **Phase 7: Distribution** — npm publish, README, demo GIF, GitHub Action live

## Phase Details

### Phase 0: Prior Art & Name Resolution
**Goal**: npm name conflict resolved and proctor's wedge differentiation documented before any code is written
**Depends on**: Nothing
**Requirements**: PRIOR-01, PRIOR-02, PRIOR-03
**Success Criteria** (what must be TRUE):
  1. `npm view proctor` and `npm search` results are documented; decision on `@proctor/cli` or alternate name is written to `.planning/PROJECT.md`
  2. GitHub and web search for "reward hacking guard" and "agent test tampering" produce documented findings confirming no direct competitor exists
  3. Top 3 adjacent tool READMEs (loki-mode, mutation testing tools, EvilGenie) reviewed; proctor's differentiation documented in one paragraph
**Plans**: 1 plan
Plans:
- [x] 00-01-PLAN.md — Prior art search, npm name conflict resolution, wedge paragraph

### Phase 1: Foundation
**Goal**: TypeScript ESM project compiles, diff parser handles all edge cases, and fixtures cover every rule
**Depends on**: Phase 0
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06
**Success Criteria** (what must be TRUE):
  1. `npm run build` compiles TypeScript to ESM dist without error; `node dist/cli.js --version` prints a version string
  2. The diff parser ingests `git diff HEAD~1` output and produces typed `ParsedDiff[]`; binary, mode-only, submodule, CRLF, and rename-only inputs are rejected before any rule logic runs
  3. `RepoContext` builder resolves test file globs and detects language (JS/TS vs Python) from file extension with no I/O inside rule functions
  4. `fixtures/` directory contains one planted cheat per RH-ID (RH001–RH008), each verifiable against expected `Finding` output
**Plans**: 5 plans
Plans:
- [x] 01-01-PLAN.md — Project scaffold: package.json, tsconfig, tsup, vitest + npm install
- [x] 01-02-PLAN.md — Core types + CLI skeleton: src/types.ts, src/cli.ts, reporters stubs, proctor.schema.json
- [x] 01-03-PLAN.md — Diff parser + pre-classifier: src/diff.ts, src/pre-classifier.ts, tests
- [x] 01-04-PLAN.md — RepoContext builder: src/context.ts, tests/context.test.ts
- [x] 01-05-PLAN.md — Fixtures: RH001-RH008 before/after/expected.json, preclass diffs, FIXTURES.md

### Phase 2: Core Rules + CLI
**Goal**: `proctor check --staged` works end-to-end — detects RH001/002/003/007, prints pretty findings, installs a git hook, and supports inline suppression
**Depends on**: Phase 1
**Requirements**: SIG-01, SIG-02, SIG-03, SIG-04, SIG-09, CLI-01, CLI-02, CLI-03, CLI-04, CLI-07, CLI-08, CLI-09, CLI-10, OUT-03
**Success Criteria** (what must be TRUE):
  1. `proctor check --staged` on a diff containing a deleted test file (RH001) prints a finding with rule ID, file:line, severity=error, one-sentence remediation, and exits 2
  2. `proctor check` exits 0 on a clean diff, 1 on warning-only findings, 2 on any error-severity finding; `--ci` suppresses non-error output
  3. `proctor check --json` outputs `Finding[]` JSON to stdout and pretty output to stderr simultaneously
  4. `proctor install-hook` creates `.git/hooks/pre-commit` (or `.husky/pre-commit`) that runs `proctor check --staged`; uses `git add --chmod=+x` for Windows compatibility
  5. A `# proctor-ignore: RH003 reason: intentional` comment suppresses that finding; omitting `reason:` does NOT suppress
**Plans**: 5 plans
Plans:
- [x] 02-01-PLAN.md — Types + context extension (CLI-10), pretty reporter + json reporter (OUT-03, CLI-04)
- [x] 02-02-PLAN.md — RH001 (test deletion) + RH002 (weakened assertions) signatures + tests
- [x] 02-03-PLAN.md — RH003 (skip patterns) + RH007 (config exclusions) signatures + tests
- [x] 02-04-PLAN.md — Engine dispatcher: runChecks + inline suppression (CLI-09) + signatures/index.ts
- [x] 02-05-PLAN.md — CLI wiring: check action + install-hook action + smoke tests

### Phase 3: Claude Code Stop Hook
**Goal**: The Claude Code Stop hook blocks an agent turn on any error-severity finding by exiting 2, never 1
**Depends on**: Phase 2
**Requirements**: SKILL-04, SKILL-05
**Success Criteria** (what must be TRUE):
  1. A Claude Code session with a staged RH001 violation is blocked — the Stop hook exits 2 and the finding appears on stderr fed back to Claude
  2. A Claude Code session with a clean diff or warning-only findings proceeds without interruption (hook exits 0, never 1)
  3. `proctor install-claude-hook` writes the Stop hook entry to `.claude/settings.json`; `--global` flag writes to `~/.claude/settings.json`
**Plans**: 1 plan
Plans:
- [x] 03-01-PLAN.md — stop-hook subcommand + install-claude-hook implementation + smoke tests

### Phase 4: AST Layer + Subtle Rules
**Goal**: RH004/005/006/008 are detectable via AST-backed analysis; `--ai` flag gates the ambiguous detectors; Python regex covers RH002/003 edge cases
**Depends on**: Phase 2
**Requirements**: AST-01, AST-02, AST-03, SIG-05, SIG-06, SIG-07, SIG-08, CLI-06
**Success Criteria** (what must be TRUE):
  1. `proctor check --ai --staged` on a diff where an implementation hardcodes a test fixture literal produces a RH004 finding; the same diff without `--ai` produces no RH004 finding
  2. `proctor check --ai --staged` detects a function body replaced with `return null` while the test asserts richer behavior (RH005)
  3. Snapshot file rewritten in the same diff without a stated reason in the commit message produces a RH006 finding at severity=warn
  4. Python diff with `@pytest.mark.skip` added is detected as RH003 via regex; no AST grammar is loaded for Python-only diffs
  5. AST grammar is loaded once as a singleton at startup, not once per analyzed file
**Plans**: TBD

### Phase 5: SARIF + GitHub Action
**Goal**: `proctor check --sarif` produces valid SARIF 2.1.0 and the GitHub Action uploads findings as inline PR annotations
**Depends on**: Phase 2
**Requirements**: CLI-05, OUT-01, OUT-02
**Success Criteria** (what must be TRUE):
  1. `proctor check --sarif` on a diff with findings outputs SARIF 2.1.0 JSON with `$schema`, `version`, `runs[0].tool.driver.name`, and `runs[0].results[].{ruleId,message.text,locations[]}` fields present
  2. SARIF output includes `partialFingerprints.primaryLocationLineHash` on each result for GitHub deduplication across pushes
  3. The GitHub Action (`action.yml`) runs `proctor check --sarif` and uploads the SARIF file to GitHub Code Scanning; findings appear as inline PR annotations on the changed lines
**Plans**: TBD

### Phase 6: Skill, Adapters & Benchmark
**Goal**: L1 skill deployed for 4+ agents and `proctor bench` produces a before/after cheat-rate table with methodology-documented raw CSV
**Depends on**: Phase 4
**Requirements**: SKILL-01, SKILL-02, SKILL-03, BENCH-01, BENCH-02, BENCH-03, BENCH-04, BENCH-05
**Success Criteria** (what must be TRUE):
  1. `proctor install-skill` deploys `SKILL.md` to `.claude/skills/proctor/SKILL.md`; the drift-check script exits nonzero if any adapter copy has diverged from canonical
  2. Skill adapters exist for Claude Code, Codex, Cursor, and one additional agent; all generated from a single canonical source
  3. `proctor bench --tasks 10` completes and outputs a CSV with columns: task_id, model, proctor_on, cheat_detected, rh_id, honest_pass
  4. Before/after cheat-rate table is printed to stdout; `bench/METHODOLOGY.md` cites EvilGenie (arxiv:2511.21654) and Baker et al. 2025
**Plans**: TBD

### Phase 7: Distribution
**Goal**: `npx proctor check` works on a fresh machine in under 60s, npm package is published, README and demo GIF are ready
**Depends on**: Phase 6
**Requirements**: DIST-01, DIST-02, DIST-03
**Success Criteria** (what must be TRUE):
  1. `npx proctor check` (or `npx @proctor/cli check`) on a fresh Node 20+ machine produces output within 60 seconds from cold npx cache
  2. `npm publish` succeeds for the resolved package name; `npm view <name>` shows the correct latest version
  3. README includes wedge sentence, install instructions, full CLI reference, configuration docs, and the before/after cheat-rate table from Phase 6
  4. Demo GIF showing `proctor` catching a test-deletion and the Stop hook blocking a Claude turn is committed to the repo root
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 0. Prior Art & Name Resolution | 1/1 | Complete   | 2026-07-01 |
| 1. Foundation | 5/5 | Complete    | 2026-07-03 |
| 2. Core Rules + CLI | 5/5 | Complete    | 2026-07-04 |
| 3. Claude Code Stop Hook | 1/1 | Complete    | 2026-07-04 |
| 4. AST Layer + Subtle Rules | 0/? | Not started | - |
| 5. SARIF + GitHub Action | 0/? | Not started | - |
| 6. Skill, Adapters & Benchmark | 0/? | Not started | - |
| 7. Distribution | 0/? | Not started | - |

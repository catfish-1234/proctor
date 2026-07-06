---
phase: 04-ast-layer-subtle-rules
verified: 2026-07-05T23:40:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Run proctor check --ai --staged on a diff where an impl file returns a hardcoded literal matching a test fixture value (e.g., src/calc.ts returns 42, tests/calc.test.ts expects toBe(42))"
    expected: "RH004 finding is produced with severity=error; running the same diff without --ai produces no RH004 finding"
    why_human: "Requires a valid ANTHROPIC_API_KEY and a real Anthropic API call; mock judge tests verify the wiring but not the model's actual YES/NO response"
  - test: "Run proctor check --ai --staged on a diff where an impl function body is replaced with 'return null' while the test asserts richer behavior"
    expected: "RH005 finding is produced with severity=error; same diff without --ai produces no RH005 finding"
    why_human: "Same as above — requires real API interaction to confirm the model classifies the pattern as a cheat"
---

# Phase 4: AST Layer + Subtle Rules Verification Report

**Phase Goal:** Implement the AST pre-pass layer and four new subtle signatures (RH004–RH006, RH008) plus Python regex extensions for existing signatures
**Verified:** 2026-07-05T23:40:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `@typescript-eslint/typescript-estree` integrated as singleton AST parser (AST-01) | ✓ VERIFIED | `src/ast.ts` exports `parseSource()` wrapping `parse()` in try/catch; `PARSE_OPTIONS` frozen at module level; ESM cache guarantees single instance. 7 tests in `tests/ast.test.ts` pass. |
| 2 | AST used only for RH002/004/005/008; no AST startup cost for RH001/003/006/007 (AST-02) | ✓ VERIFIED | `engine.ts` defines `AST_RULES = ['RH002', 'RH004', 'RH005', 'RH008']`; `buildAstMap` returns empty Map immediately when no AST rule is enabled. Engine tests at lines 177–190 confirm ctx.ast.size===0 for RH001/RH003-only runs. |
| 3 | Python regex patterns for RH003 (`@pytest.mark.skipif`) and RH002 (assertAlmostEqual tolerance-widening) (AST-03) | ✓ VERIFIED | `rh003.ts` line 8: `PYTEST_SKIPIF = /@pytest\.mark\.skipif\b/` added to `isSkipPattern()`; `rh002.ts` lines 37+82–112: `ALMOST_EQUAL` constant with `places=` reduction detection. Tests in rh002.test.ts and rh003.test.ts pass. |
| 4 | RH004 returns [] without `--ai`; returns finding when AI confirms cross-file literal match (SIG-05) | ✓ VERIFIED | `rh004.ts`: AI gate at line 49 (`if (!ctx.aiEnabled || !ctx.judge) return []`); heuristic always collects; mock-judge tests confirm all 5 behavioral cases. 5/5 tests pass. |
| 5 | RH005 returns [] without `--ai`; returns finding when AI confirms gutted-body pattern (SIG-06) | ✓ VERIFIED | `rh005.ts`: AI gate at line 44; D-13 heuristic (dels > adds + GUTTED_RE/EMPTY_BODY_RE); skips test files. 6/6 tests pass. |
| 6 | RH006 produces warn finding on snapshot file without commit reason; suppressed when reason keyword present (SIG-07) | ✓ VERIFIED | `rh006.ts`: `REASON_KEYWORDS` regex; `DEFAULT_SNAPSHOT_GLOBS`; severity='warn'. 7/7 rh006 tests pass including keyword suppression. |
| 7 | RH008 returns [] without `--ai`; returns warn finding when AI confirms tautological assertion (SIG-08) | ✓ VERIFIED | `rh008.ts`: AI gate at line 41; `isTautology()` checks ASSERT_TRUE, ASSERT_SELF, EXPECT_SELF, EXPECT_ZERO_ARG; only test files analyzed; severity='warn'. 5/5 tests pass. |
| 8 | `proctor check --ai` validates ANTHROPIC_API_KEY, exits 1 on missing key, dynamically imports judge, sets ctx.aiEnabled (CLI-06) | ✓ VERIFIED | `cli.ts` lines 52–62: guard block with `process.exit(1)`, `await import('./ai/judge.js')`, `ctx.aiEnabled = true`, `ctx.judge = createAnthropicJudge(...)`. CLI test asserts exit 1 + stderr message. `await runChecks()` confirmed. |

**Score:** 8/8 truths verified

### ROADMAP Success Criteria

| # | Success Criterion | Status | Notes |
|---|------------------|---------|----|
| SC1 | `proctor check --ai --staged` on hardcoded impl literal produces RH004 finding; without `--ai` produces none | ✓ CODE VERIFIED / ? API UNVERIFIED | Wiring is complete; requires human to run with real API key |
| SC2 | `proctor check --ai --staged` detects gutted function body with RH005 | ✓ CODE VERIFIED / ? API UNVERIFIED | Same as SC1 |
| SC3 | Snapshot file rewritten without commit reason → RH006 finding, severity=warn | ✓ VERIFIED | rh006.test.ts confirms all cases |
| SC4 | Python `@pytest.mark.skip` detected as RH003; Python files not AST-parsed | ✓ VERIFIED | PYTEST_SKIP existed; PYTEST_SKIPIF added. `buildAstMap` skips `lang !== 'ts' && lang !== 'js'` |
| SC5 | AST grammar loaded once as singleton, not per analyzed file | ✓ VERIFIED | `src/ast.ts` ESM module cache; `ast.test.ts` re-import identity test confirms |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `src/ast.ts` | parseSource() singleton wrapper | ✓ VERIFIED | 27 lines; try/catch; re-exports TSESTree |
| `src/ai/judge.ts` | AIJudge interface + createAnthropicJudge | ✓ VERIFIED | JudgeContext, AIJudge, createAnthropicJudge all exported; API key never logged |
| `src/signatures/rh004.ts` | RH004 impl-hardcoding with AI gate | ✓ VERIFIED | LITERAL_RE, extractLiterals, D-11/D-12 two-phase design |
| `src/signatures/rh005.ts` | RH005 gutted-function with AI gate | ✓ VERIFIED | GUTTED_RE, EMPTY_BODY_RE, D-11/D-13 |
| `src/signatures/rh006.ts` | RH006 snapshot rewrite detection | ✓ VERIFIED | DEFAULT_SNAPSHOT_GLOBS, REASON_KEYWORDS, micromatch |
| `src/signatures/rh008.ts` | RH008 tautological assertion with AI gate | ✓ VERIFIED | ASSERT_TRUE, ASSERT_SELF, EXPECT_SELF, EXPECT_ZERO_ARG |
| `src/signatures/index.ts` | Union Signature type + all 8 sigs registered | ✓ VERIFIED | `Finding[] \| Promise<Finding[]>` union; `[rh001,...,rh008]` |
| `src/engine.ts` | Async runChecks + buildAstMap AST pre-pass | ✓ VERIFIED | `export async function runChecks`; `ctx.ast = buildAstMap(...)`; `Promise.all` dispatch |
| `src/cli.ts` | --ai flag wired: API key validation + dynamic judge import + await runChecks | ✓ VERIFIED | Dynamic `await import('./ai/judge.js')` inside `if(options.ai)` guard |
| `src/types.ts` | RepoContext + ProctorConfig Phase 4 fields | ✓ VERIFIED | commitMessage, snapshotGlobs, aiEnabled, aiModel, judge?, ast? all present |
| `src/context.ts` | buildRepoContext with git log -1 | ✓ VERIFIED | `spawnSync('git', ['log', '-1', '--format=%s'])` with status===0 guard |
| `tsup.config.ts` | Dual entry + external SDK and TSE | ✓ VERIFIED | `entry: ['src/cli.ts', 'src/ai/judge.ts']`; `external: ['@anthropic-ai/sdk', '@typescript-eslint/typescript-estree']` |
| `dist/ai/judge.js` | Emitted as separate file (639B, SDK not bundled) | ✓ VERIFIED | 639 bytes confirmed; SDK external confirmed |
| `tests/ast.test.ts` | 7 AST-01 unit tests | ✓ VERIFIED | All pass |
| `tests/signatures/rh004.test.ts` | 5 SIG-05 tests | ✓ VERIFIED | All pass |
| `tests/signatures/rh005.test.ts` | 6 SIG-06 tests | ✓ VERIFIED | All pass |
| `tests/signatures/rh006.test.ts` | 7 SIG-07 tests | ✓ VERIFIED | All pass |
| `tests/signatures/rh008.test.ts` | 5 SIG-08 tests | ✓ VERIFIED | All pass |
| `tests/engine.test.ts` | 9 engine tests including 2 AST pre-pass | ✓ VERIFIED | All pass |
| `tests/cli.test.ts` | --ai smoke test (exit 1 on missing key) | ✓ VERIFIED | 15/15 CLI tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/engine.ts` | `src/ast.ts` | `import { parseSource } from './ast.js'` + `buildAstMap` | ✓ WIRED | engine.ts line 7; called inside buildAstMap |
| `src/engine.ts` | `src/signatures/index.ts` | `await Promise.all(signatures.map(sig => Promise.resolve(sig(files, ctx))))` | ✓ WIRED | engine.ts lines 37; handles both sync and async sigs |
| `src/cli.ts` | `src/ai/judge.js` | `await import('./ai/judge.js')` (dynamic, inside `if(options.ai)`) | ✓ WIRED | cli.ts line 58; not a static top-level import |
| `src/cli.ts` | `src/engine.ts` | `await runChecks(accepted, ctx)` | ✓ WIRED | cli.ts line 63; correctly awaits async engine |
| `src/signatures/rh004.ts` | `ctx.judge` | `await ctx.judge.judge({ ruleId: 'RH004', ... })` | ✓ WIRED | rh004.ts line 59; guarded by AI gate |
| `src/signatures/rh005.ts` | `ctx.isTestFile` | `if (ctx.isTestFile(filePath)) continue` | ✓ WIRED | rh005.ts line 16; skips test files |
| `src/signatures/rh006.ts` | `ctx.commitMessage` | `REASON_KEYWORDS.test(ctx.commitMessage)` | ✓ WIRED | rh006.ts line 22 |
| `src/signatures/rh006.ts` | `ctx.snapshotGlobs` | `ctx.snapshotGlobs ?? DEFAULT_SNAPSHOT_GLOBS` | ✓ WIRED | rh006.ts line 19 |
| `engine ctx.ast` | signatures | `ctx.ast = buildAstMap(files, ctx)` before Promise.all | ✓ WIRED | engine.ts line 36; populated before any sig runs |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `rh006.ts` | `ctx.commitMessage` | `context.ts` → `git log -1 --format=%s` | Yes (git process output) | ✓ FLOWING |
| `rh006.ts` | `ctx.snapshotGlobs` | `context.ts` → `config.snapshotGlobs` | Yes (config or undefined) | ✓ FLOWING |
| `rh004.ts` | `ctx.judge` | `cli.ts` → `createAnthropicJudge(apiKey, model)` | Yes (when --ai set) | ✓ FLOWING |
| `engine.ts` | `ctx.ast` | `buildAstMap` → `readFileSync` + `parseSource` | Yes (JS/TS files from disk) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite | `npm test` | 124/124 tests pass | ✓ PASS |
| `proctor check --ai` with empty API key exits 1 | Covered by `tests/cli.test.ts` L199 | Asserted `result.status === 1` + stderr contains message | ✓ PASS |
| AST pre-pass skipped for RH001/RH003 | `tests/engine.test.ts` L177 | `ctx.ast.size === 0` verified | ✓ PASS |
| AST pre-pass runs for RH004 | `tests/engine.test.ts` L184 | `ctx.ast instanceof Map` verified | ✓ PASS |
| dist/ai/judge.js is 639B (SDK not bundled) | `ls -la dist/ai/` | 639 bytes | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| AST-01 | 04-02 | TSE singleton AST parser | ✓ SATISFIED | `src/ast.ts` + `tests/ast.test.ts` 7/7 pass |
| AST-02 | 04-05 | AST only for RH002/004/005/008 | ✓ SATISFIED | `AST_RULES` gate in `engine.ts`; engine test confirms |
| AST-03 | 04-03 | Python regex for RH003+RH002 | ✓ SATISFIED | PYTEST_SKIPIF in rh003; ALMOST_EQUAL in rh002 |
| SIG-05 | 04-04 | RH004 impl-hardcoding | ✓ SATISFIED | `rh004.ts` + 5 tests |
| SIG-06 | 04-04 | RH005 gutted function | ✓ SATISFIED | `rh005.ts` + 6 tests |
| SIG-07 | 04-03 | RH006 snapshot rewrite | ✓ SATISFIED | `rh006.ts` + 7 tests |
| SIG-08 | 04-05 | RH008 tautological assertion | ✓ SATISFIED | `rh008.ts` + 5 tests |
| CLI-06 | 04-06 | `--ai` flag | ✓ SATISFIED | `cli.ts` AI wiring + 2 CLI smoke tests |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/cli.ts` | 162 | `console.error('not implemented yet')` in `bench` command | ℹ️ Info | Pre-existing Phase 6 stub; not introduced by Phase 4; not a Phase 4 requirement |

No TBD, FIXME, or XXX markers found in any Phase 4-modified source files.

### Human Verification Required

#### 1. RH004 End-to-End with Real API Key

**Test:** Create a temp git repo; write `src/calc.ts` that returns hardcoded `42`; write `tests/calc.test.ts` that expects `toBe(42)`; stage both; run `proctor check --ai --staged` with a valid `ANTHROPIC_API_KEY`
**Expected:** One RH004 finding with `severity=error` is reported. Running `proctor check --staged` (without `--ai`) produces no RH004 finding.
**Why human:** Requires a valid Anthropic API key. The heuristic + wiring is fully verified by mock-judge tests; only the model's YES/NO response to the actual prompt cannot be verified programmatically.

#### 2. RH005 End-to-End with Real API Key

**Test:** Create a diff where an impl file replaces a multi-line function body with `return null` while a test asserts the function returns a specific value; stage; run `proctor check --ai --staged`
**Expected:** One RH005 finding with `severity=error` is reported. Same diff without `--ai` produces no RH005 finding.
**Why human:** Same as RH004 — requires real API call.

---

## Gaps Summary

No gaps. All 8 requirement IDs are satisfied by substantive implementations verified against the actual source code. The two human verification items are for API-dependent behavior that is fully wired and tested with mock judges — they cannot be confirmed without a live Anthropic API key.

---

_Verified: 2026-07-05T23:40:00Z_
_Verifier: Claude (gsd-verifier)_

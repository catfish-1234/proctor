# Requirements — proctor

Generated: 2026-07-01
Source: PRD §5–14, research synthesis

---

## v1 Requirements

### Prior Art & Name (PRIOR)

- [ ] **PRIOR-01**: Prior art search completed for "reward hacking guard", "agent test tampering", "prevent AI delete tests", "test cheating detector", and names "proctor" / "snitch" across npm, GitHub, and web
- [ ] **PRIOR-02**: npm name conflict for `proctor` resolved — `@proctor/cli` scoped package or alternate name decided and documented
- [ ] **PRIOR-03**: Top 3 adjacent tool READMEs reviewed to confirm wedge uniqueness (loki-mode, mutation testing tools, EvilGenie); proctor's differentiation documented

### Foundation (FOUND)

- [x] **FOUND-01**: TypeScript ESM project scaffolded with tsup build, vitest test runner, commander CLI framework, picocolors output
- [x] **FOUND-02**: Git diff parser implemented — wraps `child_process.spawnSync('git', ['diff'])` output through `parse-diff`, producing typed `ParsedDiff[]`
- [x] **FOUND-03**: Diff pre-classifier rejects non-unified diff sections (combined/triple-@ diffs, binary files, mode-only changes, submodule pointer updates, Windows CRLF) before any signature logic runs
- [x] **FOUND-04**: `RepoContext` type and builder implemented — resolves test file globs, reads `proctor.config.json`, detects language per file
- [x] **FOUND-05**: `Finding` type defined with fields: ruleId, severity, file, line, message, remediation
- [x] **FOUND-06**: `fixtures/` directory created with one planted cheat per RH-ID (used as test targets and benchmark seed)

### Core Signature Checks (SIG)

- [ ] **SIG-01**: RH001 check — detects test file or test function deleted/renamed in a change whose commit message or staged diff context indicates a code fix (not a refactor); severity error
- [ ] **SIG-02**: RH002 check — detects assertion weakened: `toBe(x)` → `toBeDefined()`, `assertEqual` → `assertTrue`, numeric tolerance widened, `toStrictEqual` → `toEqual`, `toThrow(specific)` → `toThrow()`; JS/TS diff-line heuristic; severity error
- [x] **SIG-03**: RH003 check — detects test skipped/disabled: `.skip`, `xit`, `xdescribe`, `it.only` (scope narrowing), `@pytest.mark.skip`, `@unittest.skip`, `t.Skip()`, `#[ignore]`, `test.skip`, commented-out test block; severity error
- [x] **SIG-04**: RH007 check — detects test excluded from run path via config: `jest testPathIgnorePatterns`, `pytest` ignore/conftest exclusion, `tsconfig exclude` targeting test files, added in the same diff as a code fix; severity error
- [ ] **SIG-05**: RH004 check — detects implementation hardcodes/special-cases a value equal to a test fixture literal (requires AST for JS/TS; regex heuristic for Python); severity error; requires `--ai` flag to report (conservative by default)
- [ ] **SIG-06**: RH005 check — detects unit under test gutted: function body replaced with constant, `pass`, `return null`, `return undefined`, or always-true mock while test asserts richer behavior; severity error; requires `--ai` flag to report
- [ ] **SIG-07**: RH006 check — detects snapshot/golden file rewritten in the same change with no stated reason in commit message; severity warn
- [ ] **SIG-08**: RH008 check — detects new "test" that is tautological: asserts a value computed by the exact code under test, or `assert True`, or assertion with no arguments; severity warn
- [ ] **SIG-09**: All signature checks are pure functions `(diff: ParsedDiff, ctx: RepoContext) => Finding[]` — no I/O, no network, no global state; independently unit-testable against `fixtures/`

### CLI Surface (CLI)

- [ ] **CLI-01**: `proctor check [path]` command — analyzes working diff of `path` (default: cwd); prints findings with file:line, rule ID, severity, and one-sentence remediation
- [ ] **CLI-02**: `proctor check --staged` flag — analyzes only staged changes (passes `--staged` to `git diff`)
- [ ] **CLI-03**: `proctor check --ci` flag — suppresses non-error output, exits nonzero only on severity=error findings
- [ ] **CLI-04**: `proctor check --json` flag — outputs `Finding[]` as JSON to stdout; pretty output to stderr
- [ ] **CLI-05**: `proctor check --sarif` flag — outputs SARIF 2.1.0 JSON to stdout (minimum: `$schema`, `version`, `runs[].tool.driver.{name,rules[]}`, `runs[].results[].{ruleId,message.text,locations[],partialFingerprints}`)
- [ ] **CLI-06**: `proctor check --ai` flag — enables LLM judge for RH004/005/008; offline mode behavior identical to no-flag mode
- [ ] **CLI-07**: Exit codes enforced: 0 = clean, 1 = warnings only, 2 = any error-severity finding
- [ ] **CLI-08**: `proctor install-hook` command — installs git pre-commit hook; detects husky presence and writes to `.husky/pre-commit` vs `.git/hooks/pre-commit`; uses `git add --chmod=+x` (not `chmod +x`) for Windows compatibility
- [ ] **CLI-09**: Inline suppression supported — `# proctor-ignore: RH006 reason: intentional redesign` on the line above or beside a finding location suppresses that rule for that line; reason is required
- [ ] **CLI-10**: `proctor.config.json` config file supported — fields: `enabled` (rule IDs), `severity` overrides, `testPathGlobs`, `ignorePatterns`, `approvedTestChanges` allowlist

### Skill & Agent Adapters (SKILL)

- [ ] **SKILL-01**: Canonical `src/skill/SKILL.md` written — L1 honest-completion ruleset: never modify/skip/delete a test to make it pass; if a test appears genuinely wrong, STOP and flag to human with rationale; never hardcode implementation to test inputs; never gut logic behind an always-true mock; a fix is not done until the original unaltered tests pass (or human explicitly approved test change)
- [ ] **SKILL-02**: `proctor install-skill` command (or documented manual step) deploys `SKILL.md` for Claude Code (`.claude/skills/proctor/SKILL.md`)
- [ ] **SKILL-03**: Skill adapters generated for ≥4 agents from single source: Claude Code, Codex, Cursor, Windsurf (or Gemini CLI); drift-check script verifies copies haven't diverged from canonical
- [ ] **SKILL-04**: Claude Code `Stop` hook implemented — reads `{cwd, session_id}` JSON from stdin, runs `proctor check --staged --ci`, exits 2 on high-severity findings (never exits 1 — non-blocking in Claude Code); finding printed to stderr is fed back to Claude
- [ ] **SKILL-05**: `proctor install-claude-hook` command — writes Stop hook config to `.claude/settings.json` (`hooks.Stop[].hooks[].command`); `--global` flag writes to `~/.claude/settings.json`

### AST Layer (AST)

- [ ] **AST-01**: `@typescript-eslint/typescript-estree` integrated as singleton AST parser for JS/TS files; loaded once at startup, cached per language
- [ ] **AST-02**: AST used only for RH002 (complex assertion structure), RH004, RH005, RH008; diff-line heuristics used for RH001/003/006/007 (no AST startup cost on hook invocations that trigger only these rules)
- [ ] **AST-03**: Python regex patterns implemented for RH003 (`@pytest.mark.skip`, `@unittest.skip`, `skip_unless`, commented `def test_`) and RH002 (`assert True`, `assertTrue` → `assertEqual`, tolerance relaxation)

### Output & CI Integration (OUT)

- [ ] **OUT-01**: SARIF 2.1.0 output includes `partialFingerprints.primaryLocationLineHash` for GitHub deduplication
- [ ] **OUT-02**: GitHub Action `action.yml` — runs `proctor check --staged --sarif`, uploads SARIF to GitHub Code Scanning; annotates PR with findings as inline comments
- [ ] **OUT-03**: Pretty output uses colors (picocolors) with `NO_COLOR` / `CI` env var support; each finding shows rule ID, file:line, severity badge, message, and remediation hint

### Benchmark (BENCH)

- [ ] **BENCH-01**: `proctor bench [--tasks N]` command — runs N synthetic tasks (default: 10) each with held-out tests (≥30% of tests withheld from agent); measures cheat rate and honest-pass rate
- [ ] **BENCH-02**: Benchmark harness invokes a coding agent (configurable: claude-sonnet-4-6, codex, etc.) on each task with `proctor` on vs off; records which runs trip a cheat signature
- [ ] **BENCH-03**: Benchmark outputs raw CSV with columns: task_id, model, proctor_on, cheat_detected, rh_id, honest_pass; plus human-readable before/after cheat-rate table
- [ ] **BENCH-04**: Benchmark tasks are synthetic (not scraped from public repos), varied per run via seed parameter, with methodology documented in `bench/METHODOLOGY.md`
- [ ] **BENCH-05**: Benchmark cites EvilGenie (arxiv:2511.21654) and Anthropic/Baker et al. 2025 as prior measurement context

### Distribution (DIST)

- [ ] **DIST-01**: `npm publish` works — package name conflict resolved; `"bin": {"proctor": "./dist/cli.js"}` in package.json; `npx proctor check` works on fresh machine in <60s
- [ ] **DIST-02**: README includes before/after cheat-rate table from benchmark, wedge sentence, install instructions, full CLI reference, and configuration docs
- [ ] **DIST-03**: Demo GIF showing `proctor` catching a test-deletion attempt and the Stop hook blocking a Claude turn

---

## v2 Requirements (Deferred)

- Go and Java language support (PRD P5)
- Plugin-marketplace listings (npm registry, VS Code extensions, etc.)
- Web dashboard for benchmark results
- Team-level allowlist management (shared `approvedTestChanges` list)
- RH004/005/008 without `--ai` flag (heuristic-only mode; high false-positive risk in v1)
- `proctor explain <RH-ID>` — verbose explanation of a rule with examples

---

## Out of Scope

- Test runner functionality — proctor never executes tests; sits on top of Jest/Vitest/pytest/go test
- General security scanning — focused solely on test-tampering detection
- Test quality analysis ("is this a good test?") — v1 only asks "did the agent tamper with it?"
- Mutation testing (Stryker/Pitest equivalent) — separate concern
- IDE plugin with real-time analysis — git hook + CI is the distribution model for v1
- Fixing cheats automatically — proctor flags, humans fix

---

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| PRIOR-01, PRIOR-02, PRIOR-03 | Phase 0 | ○ |
| FOUND-01, FOUND-02, FOUND-03, FOUND-04, FOUND-05, FOUND-06 | Phase 1 | ○ |
| SIG-01, SIG-02, SIG-03, SIG-04, SIG-09 | Phase 2 | ○ |
| CLI-01, CLI-02, CLI-03, CLI-04, CLI-07, CLI-08, CLI-09, CLI-10 | Phase 2 | ○ |
| OUT-03 | Phase 2 | ○ |
| SKILL-04, SKILL-05 | Phase 3 | ○ |
| AST-01, AST-02, AST-03 | Phase 4 | ○ |
| SIG-05, SIG-06, SIG-07, SIG-08 | Phase 4 | ○ |
| CLI-06 | Phase 4 | ○ |
| CLI-05 | Phase 5 | ○ |
| OUT-01, OUT-02 | Phase 5 | ○ |
| SKILL-01, SKILL-02, SKILL-03 | Phase 6 | ○ |
| BENCH-01, BENCH-02, BENCH-03, BENCH-04, BENCH-05 | Phase 6 | ○ |
| DIST-01, DIST-02, DIST-03 | Phase 7 | ○ |

*(Traceability to ROADMAP.md phases — updated 2026-07-01)*

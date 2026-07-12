# proctor v1.0.0 — Release Checklist

## What ships in v1.0.0 (P1–P3)

- **P1 — The wedge.** Core `Claim + Verifier` architecture (`Verifier`/`Context`/`Finding`/`Receipt`
  registry); `RH001`/`RH002`/`RH003`/`RH007` for JS/TS and Python; `proctor check` CLI
  (`--staged`, `--base`, `--ci`, `--explain`, `--rules`, exit codes 0/1/2); `proctor install-hook`
  (git pre-commit); repo identity (`assets/proctor-logo.svg`, `src/brand.ts`, branded README).
- **P2 — Skill + multi-agent + hook + honest-pass badge.** Canonical `src/skill/SKILL.md` deployed
  to 10 agent adapters (`src/adapters/registry.ts`) from one source, with a CI drift-check;
  Claude Code Stop hook (`proctor stop-hook` / `install-claude-hook`); `--json`/`--sarif`
  reporters (SARIF validated against the 2.1.0 schema); `Receipt` + `✓ proctor: honest pass`
  badge generation (`src/badge/`).
- **P3 — Subtle detectors.** `RH004` (hardcoded return), `RH005` (gutted implementation),
  `RH006` (undocumented snapshot rewrite), `RH008` (tautological assertion), `RH009` (coverage
  gaming), `RH010` (failure masking), `RH011` (lint/type-suppression spam) — all deterministic by
  default (zero network with no `--ai`), with `RH004`/`RH005` additionally accepting `--ai` for
  fuzzier cases their deterministic core intentionally stays silent on.
- **Hardening from dogfooding** (`sandbox/DOGFOOD_REPORT.md` → `v3.md`, not shipped in the
  package — see Known Limitations below): RH001 add/del reconciliation (no false positive on a
  rename, reformat, `.skip()` wrap, or `.each()` consolidation, in either the individual-test-line
  path or the whole-file-deletion path); RH005 broadened to same-typed trivial-constant gutting;
  RH006 commit-message suppression scoped to genuinely committed (`--base`) diffs only; Python's
  own `test_*.py`/`*_test.py` convention added to default test-file globs; RH011 file-wide
  suppression directives now always flagged regardless of the per-line spam count; the
  `proctor-ignore: <ID> reason: ...` inline marker now works when added in the same commit as the
  change it justifies, for any verifier (not just a pre-existing line).
- **A real packaging bug found and fixed during launch verification:** `src/bench/scorer.ts`
  resolved `vitest` (a devDependency) at module import time, which crashed *every* CLI command —
  not just `bench` — on a clean `npx`/`npm install`. Now resolved lazily, only when `bench`
  actually runs. Verified: `npx <tarball> check` and a real cheat detection both work from a clean
  isolated install (see "Pre-publish verification" below).

## What's explicitly deferred (not in v1.0.0)

- **P4 — Benchmark + Cheat Index leaderboard.** `proctor bench` (the harness itself) exists and
  works from a source checkout (used to produce the README's benchmark table), but it is a
  maintainer/dev tool, not a shipped end-user feature — `bench/tasks/` and `vitest` are
  intentionally excluded from the published package (`package.json`'s `files` field). The public,
  continuously-updated leaderboard site is not built.
- **P5 — Broader work-integrity verifiers.** `WI101` (silent error suppression), `WI102` (fake
  completion), `WI103` (claimed-but-not-run), `WI104` (spec drift), `WI105` (quality-gate gaming) —
  none implemented. The `Verifier` registry is plugin-ready for these; none are wired in.
- **P6 — Plugin ecosystem.** No public `Verifier` plugin API, no `proctor-plugin-*` loading, no
  community rule registry.
- **P7 — Team layer + IDE.** No PR bot, no dashboards, no policy engine, no IDE inline flagging.

## Known limitations (shipped as documentation, not fixed)

Full detail in `README.md`'s "Known limitations" section:

1. **Hardcoding via a lookup table** (RH004 gap) — candidate for `--ai`.
2. **Cross-file assertion weakening** (RH002 gap, needs cross-file import following) — candidate
   for `--ai`.
3. **Block-comment "skip"** (RH001/RH003 gap — a test wrapped in `/* */` without touching the
   `it(...)` line's own bytes never appears as a changed diff line).
4. **A reason that hasn't been written down yet** (RH006/RH010) — not a bug: a diff-level tool
   cannot read an unwritten commit message or a Slack thread. The `proctor-ignore: <ID> reason:
   ...` inline marker is the documented, verified way to state a reason in the same change,
   including a freshly-added same-commit marker (fixed this cycle — see above).

None of these were patched with broader regexes or looser heuristics; each was evaluated and
rejected where the fix would have created a new evasion vector wider than the false positive it
closed (see `sandbox/DOGFOOD_REPORT_v2.md`'s "fixes considered and rejected" section for the
specific reasoning on each).

## Pre-publish verification (all done, this cycle)

- [x] Full build (`npm run build`) — clean.
- [x] Typecheck (`npx tsc --noEmit`) — clean.
- [x] Full test suite (`npm test`) — 471/471 passing, 43 files.
- [x] Fixtures suite (`tests/fixtures.test.ts`, `tests/fixtures-p3.test.ts`) — every RH001–RH011
      true-positive fixture flags, every near-miss fixture stays silent.
- [x] Final dogfood run against the same 28 sandbox repos, 4 rounds — 12/12 Part A strict catch
      rate, 0 false positives on ordinary changes (2 context-dependent cases correctly require the
      `proctor-ignore` marker, verified working). `sandbox/DOGFOOD_REPORT_v3.md`.
- [x] Deterministic core confirmed zero-network: no `fetch`/`http`/`https`/network-capable import
      anywhere outside `src/ai/judge.ts` (only reachable behind `--ai` + `ANTHROPIC_API_KEY`).
- [x] Git pre-commit hook: installs (`install-hook`) and fires — verified blocking a real planted
      `.skip()` cheat with a proper local install (exit 2).
- [x] Claude Code Stop hook: installs (`install-claude-hook`) and fires — verified blocking a
      planted cheat via the Stop hook JSON payload (exit 2).
- [x] `LICENSE` file present (MIT, matches `package.json`'s `"license": "MIT"`).
- [x] `package.json` fields verified: `name` (`@kavishdua/proctor`), `bin` (`proctor` →
      `./dist/cli.js`), `version` (`1.0.0`), `repository` (matches the actual `git remote`),
      `keywords`, `files` (`dist`, `proctor.schema.json`, `src/skill/SKILL.md` — everything
      `dist/cli.js` needs at runtime, nothing more).
- [x] `npx <tarball>` verified from a clean, isolated install (`npm pack` → fresh temp dir → `npx`)
      — both a no-diff command (`check --explain`) and a real diff-detecting command
      (`check --staged` catching a planted `.skip()`) work correctly. This is what caught the
      `vitest` eager-resolution bug above; re-verified clean after the fix.
- [x] README: exam-invigilator character, one-line description, honest-pass badge, <60s
      install/quickstart, concrete before/after catch example, supported languages/agents section,
      Known Limitations section, "verified on itself" line with final numbers.

## Publish commands (NOT run — for your review)

The first publish must be manual (npm's trusted-publisher/OIDC setup requires the package to
already exist on the registry before it can be configured — see `.github/workflows/release.yml`'s
header comment). After this one manual publish, future releases are tag-triggered via that
workflow.

```bash
# 1. From a clean working tree on main, with everything above checked:
npm run build
npm test
npm run verify:pack

# 2. Log in to npm as the account that owns the @kavishdua scope (interactive):
npm login

# 3. Publish (public, since it's a scoped package):
npm publish --access public

# 4. Tag and push the release (triggers .github/workflows/release.yml for FUTURE releases only —
#    this specific v1.0.0 tag push does not itself publish, since step 3 already did):
git tag v1.0.0
git push origin v1.0.0
```

After the manual publish, register npm trusted publishing for this package
(npmjs.com → Package → Settings → Trusted Publisher, pointing at
`catfish-1234/proctor` + `.github/workflows/release.yml`) so subsequent `v*` tag pushes publish via
OIDC with no long-lived token.

**Not run in this session, per instructions:** no `npm publish`, no `git tag`.

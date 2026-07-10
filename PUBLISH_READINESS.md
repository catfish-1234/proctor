# Publish Readiness — Consistency & Organization Pass

No features added. No `npm publish`, no `git tag` run. This documents what was checked, what was
found inconsistent, and what was fixed.

## 1. GitHub org references (catfish-1234/proctor)

**Checked:** `package.json`'s `repository` field, `.github/workflows/release.yml`, every README
URL, `proctor.schema.json`'s `$id`, `src/rules.ts`'s `helpUri`s, `src/reporters/sarif.ts`'s
`informationUri`, `src/badge/index.ts`'s repo link, `action.yml`, and the test suite's own
assertions (`tests/dist-package-json.test.ts`, `tests/readme.test.ts`) — against the actual
`git remote origin` (`https://github.com/catfish-1234/proctor.git`, confirmed via `git remote -v`).

**Found:** nothing wrong. Every live, shipped reference already correctly points at
`catfish-1234/proctor`. `.github/workflows/release.yml` has no hardcoded org string at all — npm's
OIDC trusted publishing binds to whichever repository the workflow actually runs in, which is
already the correct one; the one-time manual npmjs.com trusted-publisher UI setup (documented in
`RELEASE_CHECKLIST.md`) is what needs to point at `catfish-1234/proctor`, and it already does.

The only `kavishdua`-as-GitHub-org occurrences in the whole tree are historical, in `.planning/`
phase docs — a past mismatch that was found and fixed once already (see `.planning/STATE.md`'s
note on it), left as the historical record it is. Not live, not shipped, not touched here.

**Fixed:** nothing — this check passed clean.

## 2. Badge / image URL resolution

**Checked:** every URL in `README.md` (`grep -oE "https?://..."`, 3 unique URLs total) —
`https://github.com/catfish-1234/proctor`, its `#rh001` anchor, and the shields.io honest-pass
badge.

**Verified live** (fetched, not just eyeballed): the GitHub repo page loads and is the real
repository (128 commits, correct description). The shields.io badge URL returns a valid rendered
SVG. Neither 404s.

**Fixed:** nothing — this check passed clean.

## 3. Hook installer commands (real bug found and fixed)

**Checked:** what command the git pre-commit hook and the Claude Code Stop hook actually write,
and whether that command resolves for an end user who installed `@kavishdua/proctor` from npm —
not just in this dev checkout, where a lot of ambient state (global links, cached installs) can
mask a problem that would hit a fresh user.

**Found a real bug:** both hook installers wrote the *bare* bin name — `npx proctor check --staged`
and `npx proctor stop-hook` — not the scoped package spec. Verified empirically (fresh `npm_config_cache`,
nothing pre-installed): `npx proctor` fails with `npm error could not determine executable to run`.
This isn't a dev-checkout artifact — `npx <bare-name>` only resolves via an *already-installed*
local or global bin; it does not know that the bare name `proctor` maps to the *scoped* package
`@kavishdua/proctor` unless that package is already installed. Since the README's own primary
"zero-install, run directly via npx" flow doesn't guarantee a persistent install first, a fresh
user's git hook or Stop hook would silently fail on every single run.

**Fixed:**
- `src/hooks/pre-commit.ts`: hook content now uses the scoped spec, sourced from `package.json`'s
  own `name` field (`npx ${pkg.name} check --staged`) so it can't drift out of sync again.
- `src/cli.ts`'s `install-claude-hook`: same fix, `npx ${pkg.name} stop-hook`.
- `README.md`: the Quick Start block and two prose references updated to the scoped form, plus a
  short note explaining that the shorter bare form works too *once* something is installed, and
  why the docs use the full form.
- `tests/cli.test.ts`: the two hardcoded `'npx proctor stop-hook'` assertions updated to
  `'npx @kavishdua/proctor stop-hook'`. `tests/hooks/pre-commit.test.ts` needed no change — its
  assertion was already a substring check (`toContain('proctor check --staged')`) that the new,
  longer scoped string still satisfies.
- **Verified for real** after the fix: both hooks now write the scoped command (checked their
  actual generated file/JSON content directly).

## 4. Packed-tarball verification

`npm pack` → fresh temp dir → `npm install <tarball> --no-save --force` (isolated from this repo's
own `node_modules`/`dist`). Tarball contents confirmed exact:
`dist/ai/judge.js`, `dist/cli.js`, `LICENSE`, `package.json`, `proctor.schema.json`, `README.md`,
`src/skill/SKILL.md` — nothing else.

From that install:
- **`check --staged` catches a planted `.skip()` cheat** — `RH003` fired, exit 2, correct file:line.
- **`install-skill` works** — deployed to all 10 agent adapter paths; the deployed `SKILL.md`
  content diffed byte-identical against the packaged source.
- **`install-hook` works** — wrote `.git/hooks/pre-commit` with the scoped command from fix #3.
- **Nothing reached an unpublished file or dependency:** `bench` (whose task pool and `vitest`
  dependency are deliberately excluded from the published package — see `RELEASE_CHECKLIST.md`'s
  "deferred" section) failed with a clean, contained error (`--tasks must be an integer between 1
  and 0 (pool size)` — the empty task pool it correctly finds, not a crash) and exit code 2, not a
  process crash or stack trace. Every other command (`--version`, `drift-check`,
  `check --explain RH011`) ran correctly immediately after, proving the `bench` failure didn't
  corrupt any shared state.
- **No eager devDependency imports remain:** re-audited every top-level `import` in `src/` — the 7
  non-relative, non-`node:` imports found (`@anthropic-ai/sdk`, `@typescript-eslint/typescript-estree`,
  `commander`, `fast-glob`, `micromatch`, `parse-diff`, `picocolors`) match `package.json`'s
  `dependencies` exactly. The one prior offender, `vitest` (a devDependency resolved eagerly at
  module load time in `src/bench/scorer.ts`, fixed in the previous session), stayed fixed — its
  resolution only happens inside `resolveVitestPaths()`, called from `bench`'s own code path, never
  at import time.

## 5. Full test suite

`npm run build` clean, `npx tsc --noEmit` clean, `npm test`: **367/367 passing, 40 files.**

## Summary

| # | Check | Result |
|---|---|---|
| 1 | GitHub org references consistent with `catfish-1234/proctor` | ✅ pass (already correct) |
| 2 | Badge/image URLs resolve, don't 404 | ✅ pass (verified live) |
| 3 | Hook installers write a command that works for a real npm end user | ❌ → ✅ **fixed** (bare `npx proctor` doesn't resolve for a fresh install; now scoped) |
| 4 | Packed tarball: check/skill/hook all work, nothing unpublished reached, no eager devDependency imports | ✅ pass (verified from a real isolated install) |
| 5 | Full test suite | ✅ 367/367 |

**One real bug found and fixed this pass** (item 3) — everything else was already correct and is
now independently re-verified rather than just re-asserted. Still not published, still not tagged.

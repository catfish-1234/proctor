# Pre-launch report

Work against `proctor-prelaunch-tasks.md`. Nothing was published and no tag was created.

**Recommendation: go**, with one decision for you first (the version number, below).

---

## The one thing that needs your decision

The task list says "for v1.0.0" throughout. The repository is at **1.1.0**, and neither version has
ever been published or tagged:

- `package.json` says `1.1.0`; `npm view @kavishdua/proctor` still returns 404.
- `git tag -l` is empty. There is no `v1.0.0` and no `v1.1.0`.
- `CHANGELOG.md` has a `1.0.0` entry describing "thirteen checks (RH001 through RH013), 30 agent
  adapters". At the commit that actually set `version: 1.0.0` (`04f958c`), the tree held eight
  checks (`src/signatures/rh001..rh008`) and ten adapters. Thirteen checks and thirty adapters is
  the tree at the `1.1.0` release commit (`dee9582`). The `1.0.0` entry was written retroactively
  and describes the wrong tree, and its link points at a GitHub release that does not exist.

So "verify the `1.0.0` entry is complete and accurate" (task 4.6) resolves to: **it is not, and it
cannot be, because no `1.0.0` artifact was ever produced.** I did not rewrite it, because which
number ships is your call and the fix differs by answer:

- **Ship as `1.0.0`** (matches the task list, and it is honest: nothing has ever been published).
  Then `package.json` drops to `1.0.0`, the `1.1.0` and `1.0.0` sections merge into one, and the
  `Unreleased` content folds in.
- **Ship as `1.2.0`** (keeps the existing history). Then `Unreleased` becomes `1.2.0` and the
  `1.0.0` entry gets a one-line note that it was never published.

Everything else in this report is done and verified either way. The `Unreleased` section of
`CHANGELOG.md` now carries a complete, accurate account of this pass.

---

## Task 1: real-repo false-positive sweep

Full detail, per-pattern triage and minimal repros: **`sandbox/REALWORLD_FP_REPORT.md`**.

20 repositories cloned to `sandbox/realworld/` (gitignored), 35 recent non-merge commits each,
**689 commits** replayed with `proctor check --base <sha>^ --all-checks`. Language spread: TS/JS
(got, axios, express, chalk, date-fns, execa, zod), Python (requests, flask, black, httpx, pydantic,
click), Go (gin, cobra), Rust (clap, ripgrep), Ruby (sinatra), Java (gson), PHP (guzzle).

### The numbers

| | before | after |
|---|---:|---:|
| commits with at least one finding | 71 (**10.3%**) | 53 (**7.7%**) |
| total findings | 398 | 285 |
| commits an error-severity finding would block | 51 (7.4%) | 39 (5.7%) |
| **commits flagged by the default check set (RH only)** | 40 (5.8%) | 27 (**3.9%**) |
| **commits the default set would block (RH, error)** | 20 (2.90%) | 17 (**2.47%**) |

The bottom two rows describe what someone actually installs, since the WI family is now opt-in.

Of the 27 remaining default-set commits, **17 are the check working as designed** on a human who
really did delete a test (RH001, 8), add a skip marker (RH003, 3), change an assertion (RH002, 2),
or narrow a CI matrix (RH012, 1). Those want a one-line `approvedTestChanges` entry, not a code
change. The genuinely-wrong residue is concentrated in one check, RH011, discussed below.

**Eleven checks produced zero findings across all 689 commits**: RH006, RH007, RH008, RH009, RH010,
RH013, WI102, WI104, WI105, WI108, WI109.

### Eight false-positive patterns fixed

Each fix is narrow, keeps every existing fixture green, and ships with a regression test written
from the real commit that exposed it. **No check was disabled and no threshold relaxed.**

| # | pattern | effect |
|---|---|---|
| 1 | WI103 scanned past `} finally {`, so a `finally` body after an early return read as unreachable | 24 → 14 commits |
| 2 | RH011 counted suppressions diff-wide, counted vendored trees, and never read the justification its own suggestion asks for | 23 → 14 commits, 184 → 121 findings |
| 3 | WI111 called a file "asserts nothing" from diff-local counts alone; also flagged deleted build configs and `*.test-d.ts` files as deleted implementations | 11 → 3 commits |
| 4 | RH004/RH005 paired a *relocated* return against a relocated computation (the chunk-pairing bug, on the move axis) | 3 → 0 commits |
| 5 | RH012 read a YAML comment and a composite action's input key as test commands | 4 → 3 commits |
| 6 | WI family ran code checks on markup and data files (a build script inside a TOML string) | 1 commit |
| 7 | RH001 truncated test titles at the wrong quote, which is also the pairing key | cosmetic + pairing hazard |
| 8 | `check` analysed `node_modules` on a first run in a repo with no `.gitignore` yet | 74 findings → 0 |

Number 8 was found during the tarball verification, not the sweep (`--base` only sees tracked
files). It is the most visible false positive proctor had:

```
npm init -y && npm install @kavishdua/proctor && npx proctor check
before: 74 findings (73 errors, 1 warning), all inside @anthropic-ai/sdk, braces, fill-range
after:  No findings.  ✓ proctor: honest pass
```

### No detection was lost

- Part A dogfood: **12/12**, and the finding set is byte-identical to the v3 baseline
  (`sandbox/results/partA-prelaunch.log` vs `partA-v3.log`, same 11 rule IDs at the same counts).
- Part B dogfood: unchanged, the same two known false positives (RH006, RH010) as v3.
- Full suite green throughout; 12 regression tests added.

### Checks with a materially high FP rate

The task asked for these to be called out as demotion candidates.

- **RH011, ~2.0% of commits, 121 findings, all false positives.** The strongest candidate for
  opt-in demotion, and the reason it is not demoted here is that it is `warn` severity: it prints
  but never blocks a commit or an agent turn. The residue cannot be fixed without weakening
  detection — raising the threshold breaks the fixtures, which use exactly two, and exempting
  rule-named forms would gut Java, Kotlin, Rust and C#, whose only suppression syntax names a rule.
  If it proves annoying in practice, opt-in is the next lever.
- **WI103 (2.0%) and WI106 (1.0%)** are now behind the opt-in flag, which is the demotion the task
  contemplated.

### WI family real-world FP rate

Task 3 asked whether the sweep supports promoting WI to default-on later. Mixed, and worth stating
per check rather than as a family:

- **Candidates for default-on**: WI102, WI104, WI105, WI108, WI109 — zero findings in 689 commits.
  WI107, WI110, WI113 — one commit each, and all three were true positives.
- **Not yet**: WI103 (14 commits) and WI106 (7 commits) are the family's noise, and both resist a
  further narrow fix.
- **In between**: WI101 (4), WI111 (3), WI112 (6), the last of which is mostly working as designed.

A reasonable v1.1 move is promoting the eight quiet checks and leaving WI103/WI106 opt-in.

---

## Task 2: postinstall posture

Default is now **explicit opt-in**. `npm install` writes nothing and prints what `proctor setup`
would do, resolved against the actual repository rather than described in the abstract:

```
proctor is installed. It has written nothing to your repository.

  npx proctor setup

That one command would write, and nothing else:
  - the honest-completion ruleset to 1 agent path: AGENTS.md
  - a git pre-commit hook at .git/hooks/pre-commit (an existing hook is never overwritten)
  - a Claude Code Stop hook in .claude/settings.json, only if this repo uses Claude Code

Nothing outside your repository is touched, and no network call is made.
Run `npx proctor check` first if you want to see what it finds before wiring anything up.
Set PROCTOR_AUTO_SETUP=1 to have future installs run setup for you.
```

- `proctor setup` unchanged: still the one command that does the full install, with all existing
  skip detection intact.
- `PROCTOR_AUTO_SETUP=1` restores the old install-and-wire behaviour, with every skip guard still
  in force.
- In a context where nothing was going to be written anyway (CI, a global install, a transitive
  dependency, `npx`, no git repository), the notice is silent rather than noise on somebody else's
  build log. `PROCTOR_NO_POSTINSTALL=1` silences it everywhere.
- README's install section now leads with a table of **every path setup writes, what it is, and what
  happens if it already exists**, before anything else.

Verified end-to-end from a real `npm install` of the packed tarball into a fresh git repo: the
notice printed, and the working tree afterwards contained only `.git`, `node_modules`,
`package.json`, `package-lock.json`. No hook, no ruleset file. `PROCTOR_AUTO_SETUP=1` in the same
setup installs both. Five tests in `tests/postinstall.test.ts` cover all of it.

---

## Task 3: WI family opt-in

`DEFAULT_ENABLED` is now the RH family alone. `RH_CHECKS` and `WI_CHECKS` are exported from
`src/context/index.ts` so the split has one definition.

Three ways to turn WI on, unchanged in capability:

- `proctor check --wi` — one run.
- `proctor check --all-checks` — same, spelled as "everything".
- `"enabled": ["RH001", ..., "WI103"]` in `proctor.config.json` — everywhere, including both hooks.

The flag *adds* to the enabled set rather than replacing it, so a config that already enables some
WI checks is not overwritten and a config that deliberately narrows the RH set keeps that narrowing.

**No WI check was deleted or weakened.** Marked beta in README (a callout above the WI table),
`docs/CONFIGURATION.md` and `docs/LANGUAGES.md`, each with the one-line enable instruction. Three
CLI tests assert a WI-only change is silent by default and found with either flag.

---

## Task 4: release plumbing

1. **`engines`** — already present and correct: `"node": ">=20.0.0"`.
2. **Badges** — npm version, CI status, and license, centred under the title.
3. **`v1` moving tag** — `docs/RELEASING.md` gains a section covering how `v1` is re-pointed
   (`git tag -f v1 v1.2.3 && git push origin v1 --force`), the two rules for it (only after the
   release workflow goes green; never across a major boundary), and why a SHA pin is the stricter
   choice. Re-pointing `v1` is step 5 of the release checklist. The README CI example now uses
   `catfish-1234/proctor@v1` with the SHA alternative named beside it. **No tags were created.**
4. **Provenance** — `release.yml` publishes with `npm publish --access public --provenance`, and
   `docs/RELEASING.md` explains that provenance needs `id-token: write` from GitHub Actions, so a
   first publish done by hand from a laptop will not carry it and that is expected rather than
   fixable after the fact.
5. **npm-facing README** — every relative path is now absolute. Images and the demo GIF point at
   `raw.githubusercontent.com/catfish-1234/proctor/main/...`; the fourteen doc links point at
   `github.com/catfish-1234/proctor/blob/main/...`. No relative asset or link path remains.
6. **CHANGELOG** — see the version-number decision at the top. The `Unreleased` section is complete
   and accurate for this pass.

One thing I changed that had a test pinning it: `tests/release-hardening.test.ts` required *both*
actions in the README example to be SHA-pinned. It now requires every **third-party** action to be
SHA-pinned, requires proctor's own action to use `@v1`, and requires the SHA alternative to be
documented beside it. SHA-pinning is a control against an action somebody else can move under you;
proctor's own action in proctor's own README is the publisher pointing at itself, which is the
`actions/checkout@v5` convention. The reasoning is written into the test.

---

## Task 5: community and feedback plumbing

1. **`false-positive.yml`** — already existed and already asked for the check ID, the triggering
   diff, why the change was honest, and the version. Added the **language** field the task asked
   for.
2. **`bug-report.yml`** — renamed from `bug.yml` (same content, the filename the task names).
   **`feature-request.yml`** — new. It asks for a new check's *cheat diff* and, separately, the
   nearest honest diff that must stay silent, because a check without one of those is a
   false-positive generator.
3. **`config.yml`** — already pointed at Security Advisories; now also points at Discussions for
   questions, at `docs/` for reference, and at `docs/TROUBLESHOOTING.md` for "it fired and I
   disagree with the fix".
4. **`dependabot.yml`** — already present and correct: npm and github-actions, weekly, 7-day
   cooldown. No change needed.
5. **`SECURITY.md`** — contact is a GitHub Security Advisory link for this repository, which is a
   real, working, private reporting channel with a stated 7-day acknowledgement. Verified. One
   staleness note: it says "There is no published npm version yet", which will need a line change
   on the day you publish.
6. **Social preview** — `assets/social-preview.png`, 1280x640, logo plus name plus tagline plus
   `npx proctor setup`, in the brand palette from `src/brand.ts`. Generated by
   `scripts/social-preview.ps1` (System.Drawing, no new dependency).
   **You need to upload it manually: repo Settings → Social preview → Upload an image.** GitHub has
   no API or CLI for that field.

---

## Task 6: final verification

| | result |
|---|---|
| `npm run build` | clean |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **1359 passed, 7 skipped, 69 files** |
| Part A dogfood | **12/12**, finding set byte-identical to the v3 baseline |
| Part B dogfood | unchanged, same two known FPs as v3 |
| `npm run verify:pack` | pass, clean verdict from a fresh tarball install in 0s (budget 60s) |
| Tarball smoke test | `check`, `setup`, `badge`, `badge --url`, `drift-check`, `--version`, `--help` all correct |
| Files outside the published set | none reached |
| Network calls without `--ai` | **none** |

The network check is not an inspection: `check`, `check --base ... --all-checks`, `badge`,
`drift-check`, `agents`, `score` and `check --explain` were each run under a harness that replaces
`net.connect`, `tls.connect`, `dns.lookup`, `http.request`, `https.request` and `fetch` with
throwing traps and reports every attempt on exit. All seven printed `NETWORK ATTEMPTS: none`.

The tarball smoke test ran from `$(mktemp -d)` with a fresh `git init` and `npm init -y`, installing
only the packed `.tgz`. `setup` wrote `AGENTS.md`, `.git/hooks/pre-commit` and
`.proctor-adapter-manifest.json` into that temp repo and nothing else; `drift-check` then exited 0.

---

## What I did not do

- **No `npm publish`, no `git tag`.** As instructed. `v1` does not exist yet and needs creating by
  hand after the first release workflow goes green.
- **No commits.** Everything above is in the working tree for you to review and commit.
- **The sandbox comparison repos were not touched.** `sandbox/partA`, `partB`, `partC` are
  unmodified; the two new scripts (`rerun-prelaunch.sh`, `rerun-prelaunch-b.sh`) only read them and
  write to `sandbox/results/`.
- **RH011 not demoted to opt-in**, despite being the highest-FP default-on check. Reasoning above:
  it is `warn` severity so it never blocks, and I would rather you make that call with the number in
  front of you than have it made silently. It is a one-line change to `RH_CHECKS` if you want it.
- **Four known limitations left documented rather than patched**, each with the reason and, where
  one exists, the fix that would work: RH012 against a command split across a block scalar, RH012
  against a test invocation hidden behind a task runner, RH014's filter heuristic, and formatter
  test corpora that are deliberately full of suppression directives. All in
  `sandbox/REALWORLD_FP_REPORT.md`.
- **`SECURITY.md`'s "no published npm version yet" line** left as-is, since it is true today.

---

## Go / no-go

**Go.**

The two things that would have made this a no-go are fixed. A first run no longer greets a new user
with 73 errors from their own `node_modules`, and installing the package no longer rewrites their
git hooks without asking, which was the single most predictable source of backlash for a tool whose
whole argument is that you can trust what it blocks.

What ships by default is now the RH family alone: fourteen checks, validated against a 12/12
planted-cheat corpus, a live benchmark, and 689 human commits from twenty maintained repositories,
flagging 3.9% of those commits and blocking 2.47% — most of which are the check correctly noticing a
human deleted a test. Thirteen checks that had never been measured against real history are behind a
flag, with the measurement now in hand to promote most of them next release.

The remaining known imprecision is documented rather than hidden, which is the posture this project
should ship in. Decide the version number, then tag.

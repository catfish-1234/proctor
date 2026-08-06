<p align="center">
  <img src="assets/proctor-logo.svg" alt="proctor logo, a watchful eye with a green checkmark pupil" width="96" height="96">
</p>

<h1 align="center">proctor</h1>

<p align="center"><strong>Your agent didn't fix the bug. It deleted the test and told you it passed. proctor catches it.</strong></p>

Proctor is a skill you give your coding agent, plus the guard that makes the skill mean something.

The skill is a short ruleset about finishing work honestly: don't delete a failing test, don't skip
it, don't weaken the assertion, don't hardcode the answer the fixture expects. One command deploys
it to whichever agent you use, across 30 of them, from a single source file. Most agents will
follow it most of the time.

The guard is for the rest of the time. A ruleset alone is a request, and an agent under pressure to
show a green build can talk itself out of a request. So proctor also ships a
deterministic, diff-level guard that runs on every commit and at the end of every agent turn, and
blocks the changes that broke the rules. It works below the agent's own reasoning: it reads the
code change itself, never the agent's explanation of it, so nothing the agent says can argue with it.
Rules the agent reads, enforcement it can't reason its way around.

> **Verified on itself:** every one of proctor's 12 checks (`RH001` through `RH012`) catches its
> planted true positive, and 0 ordinary changes (renames, refactors, legitimate deletions, `.each()`
> test consolidations) get flagged by mistake. Two edge cases (an unstated snapshot reason, an
> unusually long test timeout) correctly ask for the [inline marker](#inline-suppression) instead
> of being guessed at. Full test methodology and numbers: [RESEARCH.md](RESEARCH.md).

## The Proctor

Picture the exam invigilator: arms crossed, half-moon glasses, watching over a sweating robot mid-delete of a failing test. That's proctor. The logo is a watchful eye with a green checkmark for a pupil, watching whether your green is real. When it catches a cheat, the iris flips red and the pupil becomes an X. You'll see that same red/green signal in the CLI output and the hooks.

## See it catch a real cheat

An agent is asked to fix a bug in a slug generator. It can't get the whitespace-only case to
return `''`, so instead of fixing `slugify()`, it deletes the inconvenient test:

```diff
 describe('slugify', () => {
   it('converts spaces to dashes', () => {
     expect(slugify('Hello World')).toBe('hello-world');
   });
-  it('handles a whitespace-only input', () => {
-    expect(slugify('   ')).toBe('');
-  });
 });
```

```
$ proctor check
tests/slug.test.ts
  ❌ tests/slug.test.ts:5  [RH001]  Test function 'handles a whitespace-only input' was deleted in this change.
      Restore the deleted test or document why it was intentionally removed.
1 finding (1 error, 0 warnings)
$ echo $?
2
```

Hook this into a git pre-commit hook or the Claude Code Stop hook and the commit or turn never
lands. The agent has to actually fix `slugify()`, not just make the red go away.

Want the full demo? Here's a two-scene recording: proctor catching a deleted test at the CLI
layer, then the Claude Code Stop hook blocking the same cheat live in an agent session.

![proctor demo](assets/demo.gif)

## Install

### Claude Code

proctor ships as a plugin, which is the least work: it installs the ruleset and the Stop hook
together, so a bad turn is blocked from the first session.

```
/plugin marketplace add catfish-1234/proctor
/plugin install proctor@proctor-marketplace
```

Then run `/proctor:setup` once in a repo to add the git pre-commit hook and write the ruleset out
for any other agents that repo is set up for.

### Cursor

The same plugin directory carries a Cursor manifest, so proctor installs from the
[Cursor Marketplace](https://cursor.com/marketplace) with the ruleset as an always-attached rule
and a stop hook behind it.

### Gemini CLI and Qwen Code

Both read the same extension format, so both install straight from the repo:

```bash
gemini extensions install https://github.com/catfish-1234/proctor
qwen extensions install https://github.com/catfish-1234/proctor
```

The extension loads the ruleset as context. Add the hooks with `npx @kavishdua/proctor install-hook`
for enforcement.

### goose

`recipes/proctor.yaml` is a goose recipe that runs a check and walks through what it found:

```bash
goose run --recipe recipes/proctor.yaml
```

### Anywhere else

The easiest way to try it, no install step at all:

```bash
npx @kavishdua/proctor check
```

Or install it globally so the `proctor` command is always available:

```bash
npm i -g @kavishdua/proctor
```

You'll need Node 20 or newer. That's the only requirement. No config file, no server, no account.

## Quick start

```bash
# 1. Give your agent the ruleset. This finds whichever agents your repo is set up
#    for and writes the skill to each one's conventional path.
npx @kavishdua/proctor install-skill

# 2. Back it with enforcement. The Stop hook blocks a bad agent turn before it
#    lands; the pre-commit hook catches anything that gets past it.
npx @kavishdua/proctor install-claude-hook
npx @kavishdua/proctor install-hook

# 3. Confirm the ruleset is still intact and nobody has quietly edited it.
npx @kavishdua/proctor drift-check

# Or just check your current changes right now, without installing anything.
npx @kavishdua/proctor check
```

Step 1 is the part people underrate. An agent that has read the rules mostly follows them, which
means the guard in step 2 spends most of its time confirming honest work rather than catching
cheats. Step 3 matters because the ruleset lives in files the agent can also edit.

Once proctor is installed globally or added to a project, you can drop the `@kavishdua/` prefix
and just run `proctor ...` or `npx proctor ...`. The commands above spell out the full package name
so they work the very first time you run them, before anything is installed.

## What do the codes mean?

Every finding has a short ID like `RH001` or `RH006`. These aren't anything you need to memorize,
they're just stable labels, the same idea as an ESLint rule name, so you can reference one specific
check in config or in `--rules` without typing a whole sentence. Every time proctor prints a
finding, it comes with the plain-English name and a full explanation right there. If you ever want
more detail on a specific one, run:

```bash
proctor check --explain RH001
```

And when something is blocking, `--fix` says what to do about it rather than just what was wrong:

```bash
proctor check --explain RH001 --fix
```

That is the half a guard usually leaves out. Being blocked tells an agent something was wrong; this
tells it what an honest fix looks like, with the approval route mentioned last so it reads as the
exception rather than the shortcut. Any run that blocks prints the matching command for the checks
that fired.

## Badges

[![proctor](https://img.shields.io/badge/proctor-honest_pass-22C55E)](https://github.com/catfish-1234/proctor)

`✓ proctor: honest pass` prints in your terminal after every clean `proctor check`, and the
markdown badge above is the same result in a form you can drop into your own README or PR
description (generated by [`src/badge/index.ts`](src/badge/index.ts)).

A run only earns the badge when it is genuinely clean. Findings you approved through
`approvedTestChanges` do not count as clean, since somebody decided to let those through.

## Supported languages and agents

**Languages:** JavaScript and TypeScript (Jest and Vitest conventions) and Python (pytest and
unittest conventions) have full coverage across all 11 language-level checks. RH012 reads CI
pipeline files rather than source, so it applies to every language equally. Go, Java, Rust, Ruby, PHP, C#,
Kotlin, C++, C, Swift, Objective-C, Dart, Scala, Perl, R, Haskell, Elixir, Lua, Groovy, Clojure,
Shell/Bash, Julia, and VB.NET (25+ languages total) are covered by the five diff-level signature
checks (RH001, RH002, RH003, RH007, RH011) that work off diff-line patterns. The two tables below are the per-language, per-check support matrix: the original 9
languages, then the 16 added in the Language Expansion II round.

| RH-ID | JS/TS | Python | Go | Java | Rust | Ruby | PHP | C# | Kotlin |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| RH001 (test deletion) | ✅ | ✅ (file/rename path) | ✅ (file/rename path) | ✅ (file/rename path) | ✅ (file/rename path) | ✅ (file/rename path) | ✅ (file/rename path) | ✅ (file/rename path) | ✅ (file/rename path) |
| RH002 (assertion weakened) | ✅ | ✅ | ✅ (testify only; stdlib comparison-weakening not covered) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (kotlin.test/AssertJ; Kotest flat pair unit-tested, no dedicated fixture) |
| RH003 (skip/disable) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (JUnit5/kotlin.test; Kotest x-forms only, `enabled = false` not covered) |
| RH004 (hardcoded fixture) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH005 (gutted function) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH006 (snapshot rewrite) | ✅ | n/a (no snapshot convention) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH007 (config exclusion) | ✅ | ✅ | ✅ (build tag added to a `_test.go` file) | ✅ (Maven `pom.xml`) | ✅ (`Cargo.toml`) | ✅ (`.rspec`) | ✅ (`phpunit.xml`) | ✅ (`.runsettings`) | ✅ (Gradle `build.gradle.kts`) |
| RH008 (tautological test) | ✅ | n/a | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH011 (suppression spam) | ✅ | ✅ | ✅ (line-scoped only) | ✅ (line/declaration-scoped only, no file-wide equivalent in Java) | ✅ (line-scoped + file-wide via `#![allow]`) | ✅ (line-scoped only; unclosed-disable file-wide gap documented) | ✅ (line-scoped + file-wide via `phpcs:ignoreFile`) | ✅ (line-scoped only; unrestored-pragma file-wide gap documented) | ✅ (line-scoped + file-wide via `@file:Suppress`) |

### Language Expansion II (16 more languages)

| RH-ID | C++ | C | Objective-C | Swift | Dart | Scala | Groovy | VB.NET | Perl | R | Haskell | Elixir | Lua | Clojure | Shell/Bash | Julia |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| RH001 (test deletion) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| RH002 (assertion weakened) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (gap noted) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (gap noted) | ✅ |
| RH003 (skip/disable) | ✅ | ✅ (gap noted) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (gap noted) | ✅ (gap noted) | ✅ |
| RH004 (hardcoded fixture) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH005 (gutted function) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH006 (snapshot rewrite) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH007 (config exclusion) | ✅ (CMake) | ✅ (CMake) | ✅ (xctestplan) | ✅ (xctestplan) | ✅ | ✅ | ✅ (reuse) | ✅ (reuse) | ❌ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ |
| RH008 (tautological test) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| RH011 (suppression spam) | ✅ (shared clang-tidy) | ✅ (shared clang-tidy) | ✅ (shared clang-tidy) | ✅ | ✅ | ✅ | ✅ (reuse) | ✅ (line-scoped only) | ✅ (line-scoped only) | ✅ (line-scoped only) | ✅ | ✅ | ✅ (line-scoped only) | ✅ (line-scoped only) | ✅ (line-scoped only) | ❌ |

Documented gaps (Language Expansion II): Objective-C has no RH003 coverage at all, Apple's own
XCTest documentation confirms `XCTSkip`/`XCTSkipIf`/`XCTSkipUnless` are Swift-only APIs with no
Objective-C interface variant. C's Check framework has no skip mechanism for RH003, only CMocka's
`skip()` is covered (gated to a named C test file); C's RH011 suppression coverage (clang-tidy
`NOLINT`, `cppcheck-suppress`) is shared with C++ and Objective-C, since the signal is
language-agnostic. Groovy's Spock `expect:`/`then:` power-assert blocks are not covered by RH002,
a bare `LHS == RHS` inside those blocks has no reliable single-line syntactic anchor to
distinguish it from ordinary conditional logic elsewhere in a `.groovy` file. Shell/Bash's native
`[ "$a" = "$b" ]` test form is not covered by RH002, only the bats-assert helper library's
`assert_equal` is, the native form is too pervasive in ordinary shell control flow to anchor
safely. Clojure's Leiningen `:test-selectors` has no RH003 detector at all and is warn-only for
RH007 (the selector value is an arbitrary function form, so proctor can only detect the key was
touched, not whether the change narrows or widens coverage); Clojure's kaocha `^:kaocha/skip`
metadata is fully covered for RH003, and its `clj-kondo` reader-discard suppression form is
covered for RH011. R's `.Rbuildignore` is warn-only for RH007, it excludes a path from the
package's *build*, not specifically the test run. Perl, Shell/Bash, and Julia have no RH007
coverage at all, none has a dedicated test-exclusion config file or a safe structural analogue.
Julia has no RH011 coverage at all (a whole-category gap), no dominant inline-suppression
convention was found across the ecosystem. VB.NET, Perl, R, Lua, Clojure, and Shell/Bash's RH011
coverage is line-scoped only, each language's file-wide or unclosed-suppression form (VB.NET's
unclosed `#Disable Warning`, Perl's unclosed `## no critic`, R's `.lintr`-based whole-file
exclusion, Lua's fragile own-line-at-file-top form, Clojure's `.clj-kondo/config.edn`-based
whole-file exclusion, and Shell/Bash's structural absence of any inline file-wide directive) would
require forward-scanning past the diff line, which proctor's line-level model doesn't do.

RH004, RH005, RH006, and RH008 stay **JS/TS/Python-only** by design, across all 25+ supported
languages. Their patterns are written against JS/TS and Python syntax, and the ambiguous cases
fall back to the `--ai` judge. Porting gutted-function, hardcoded-return, and
tautological-assertion detection to every other language would carry a much higher false-positive
risk than the diff-line signature checks above, so this is a stated boundary, not an oversight.

RH012 is absent from both tables on purpose. It reads CI pipeline definitions, not source, so it
does not vary by language: `.github/workflows/*.yml`, `.gitlab-ci.yml`, `.circleci/config.yml`,
`azure-pipelines.yml`, `.travis.yml`, `Jenkinsfile`, and `bitbucket-pipelines.yml` all get the same
treatment whatever the repository is written in. It exists because RH007 watches the test runner's
config while nothing watched the layer above it: deleting the test step from a workflow, or marking
it `continue-on-error: true`, turns the suite green without touching a single test file.

Everything except a removed test command is scoped to the individual step, not the diff chunk. A
coverage upload marked `continue-on-error: true` right after a test step is an ordinary, correct
edit, and a chunk-wide read would flag it every time.

Documented gaps: Go's RH002 coverage is testify-only, stdlib comparison-weakening isn't
pattern-matched. Kotlin's Kotest `enabled = false` skip form isn't covered, it's too generic a
token to anchor safely. Go, Ruby, and C# don't have a genuine file-wide suppression detector for
RH011, Go's file-wide `//nolint`, Ruby's unclosed `rubocop:disable`, and C#'s unrestored `#pragma
warning disable` all require forward-scanning past the diff line, which proctor's line-level model
doesn't do. None of these are silently absent, they're listed here and in `proctor check --explain
<ID>`.

C#, Java, and Kotlin test-file detection is filename-convention-based (`*Tests.cs`/`*Test.cs`,
Maven Surefire patterns, `*Test.kt`), not attribute-based, so a test file with an unconventional
name won't be recognized. This is the same accepted limitation the project already has for
JS/TS/Python.

All 16 Language Expansion II languages are the same: test-file recognition is
filename/directory-convention-based (`*_test.cpp`/`test_*.c`, `*Tests.swift`, `test/*.dart`,
`*Spec.scala`, `t/*.t`, `tests/testthat/test-*.R`, `*Spec.hs`, `test/*_test.exs`, `*_spec.lua`,
`*Spec.groovy`, `test/*_test.clj`, `*.bats`, `test/runtests.jl`, `*Tests.vb`), never
attribute-based. `.h` deliberately resolves to C, not C++, C headers vastly outnumber C++ headers
using the bare `.h` extension, a documented judgment call (RESEARCH Pitfall 4) rather than a
missed case; `.mm` resolves to Objective-C since XCTest macro usage there is identical to `.m`.

**Agents:** running `npx @kavishdua/proctor install-skill` deploys the honest-completion skill to
every agent below from one source file (see
[`src/adapters/registry.ts`](src/adapters/registry.ts)). The Claude Code Stop hook only works with
Claude Code specifically. The git pre-commit hook works no matter which agent (or human) is making
the commit.

| Agent | Deployment path | Shared file² | Scriptable |
|-------|-----------------|:---:|:---:|
| Claude Code | `.claude/skills/proctor/SKILL.md` | | ✅ |
| Codex CLI | `.agents/skills/proctor/SKILL.md` | | ✅ |
| Cursor¹ | `.cursor/rules/proctor.mdc` | | ✅ |
| Windsurf | `.windsurf/rules/rules.md` | ✅ | ❌ |
| Gemini CLI | `GEMINI.md` | ✅ | ✅ |
| Aider | `CONVENTIONS.md` | ✅ | ✅ |
| Continue.dev | `.continue/rules/proctor.md` | | ✅ |
| Cline | `.clinerules/proctor.md` | | ✅ |
| Amazon Q Developer | `.amazonq/rules/proctor.md` | | ❌ |
| GitHub Copilot¹ | `.github/instructions/proctor.instructions.md` | | ❌ |
| Zed | `.rules` | ✅ | ❌ |
| AGENTS.md (universal) | `AGENTS.md` | ✅ | ❌ |
| OpenHands | `.openhands/microagents/repo.md` | ✅ | ✅ |
| Kiro | `.kiro/steering/proctor.md` | | ✅ |
| Tabnine | `.tabnine/guidelines/proctor.md` | | ✅ |
| Trae | `.trae/rules/proctor.md` | | ❌ |
| GitHub Copilot (global) | `.github/copilot-instructions.md` | ✅ | ❌ |
| Qodo | `best_practices.md` | ✅ | ✅ |
| Roo Code | `.roo/rules/proctor.md` | | ❌ |
| Kilo Code | `.kilocode/rules/proctor.md` | | ✅ |
| Augment Code | `.augment/rules/proctor.md` | | ✅ |
| Google Antigravity | `.agents/rules/proctor.md` | | ❌ |
| goose | `.goosehints` | ✅ | ✅ |
| JetBrains Junie | `.junie/guidelines.md` | ✅ | ✅ |
| Qwen Code | `QWEN.md` | ✅ | ✅ |
| Crush | `CRUSH.md` | ✅ | ✅ |
| Warp | `WARP.md` | ✅ | ❌ |
| Amp | `AGENT.md` | ✅ | ✅ |
| Firebase Studio | `.idx/airules.md` | ✅ | ❌ |
| Replit Agent | `replit.md` | ✅ | ❌ |

¹ Cursor and GitHub Copilot get a per-format `transform` applied before writing: Cursor's
`.mdc` gains `description`/`globs`/`alwaysApply` YAML frontmatter so the rule auto-attaches,
and Copilot's instructions file gains `applyTo: '**'` frontmatter so it actually activates.
Both transforms only prepend static frontmatter; the canonical ruleset body passes through
byte-for-byte.

² Some agents read a single instructions file that you also write your own content into
(`AGENTS.md`, `GEMINI.md`, `WARP.md`, `.goosehints`, and so on). For those, `install-skill` does
not overwrite the file. It merges the ruleset into a delimited block:

```markdown
<!-- proctor:start -->
...canonical ruleset...
<!-- proctor:end -->
```

Everything outside that block is left exactly as you wrote it, reinstalling replaces the block in
place rather than appending a second copy, and `drift-check` only compares the block. `install-skill`
also records which shared paths it wrote to `.proctor-adapter-manifest.json` (commit this alongside
your adapter files), because a shared file with no block is ambiguous otherwise: it could mean
proctor was never installed, or it could mean an agent deleted the ruleset. With the manifest,
the second case is reported as drift.

Paths without a ✅ in that column belong to proctor alone and are written whole.

**Scriptable** marks agents that document a headless/non-interactive invocation mode; it does not
by itself mean a `proctor bench` `AgentRunner` exists, see `src/bench/runners/registry.ts`.

### One-command installs

Every agent above gets the ruleset from `install-skill`. Five of them also have a package format
you can install proctor from directly, so the ruleset and its enforcement arrive together:

| Agent | Format | Install |
|-------|--------|---------|
| Claude Code | plugin + marketplace | `/plugin marketplace add catfish-1234/proctor` |
| Cursor | plugin | [Cursor Marketplace](https://cursor.com/marketplace) |
| Gemini CLI | extension | `gemini extensions install https://github.com/catfish-1234/proctor` |
| Qwen Code | extension | `qwen extensions install https://github.com/catfish-1234/proctor` |
| goose | recipe | `goose run --recipe recipes/proctor.yaml` |

The rest were checked and deliberately left out, because a package format has to be able to carry
instructions for proctor to have anything to put in it:

- **Zed, Kiro, Windsurf, Trae** publish IDE extensions built in Rust/WASM or VS Code's format.
  They carry languages, themes, and debuggers, not rulesets.
- **Amp** plugins and **opencode** plugins are executable TypeScript, not instruction bundles.
  Both already read a file proctor writes.
- **Roo Code** has a marketplace for MCP servers and modes, but shipping rules with a mode is
  still an open question upstream, and the repository was archived in May 2026.
- **Continue** has a hub for rule blocks, but publishing runs through its web UI rather than from
  a repo, and the hub is winding down.
- **Codex** uses Agent Skills, which `install-skill` already writes to `.agents/skills/`.
- The remaining agents read a rules or instructions file and have no package format at all.

Where an agent has no installable package, `install-skill` is the one-command path and loses
nothing: the ruleset lands at the agent's own conventional path either way.

### Adding an adapter

To add support for another agent:

1. Add one entry to `AGENT_ADAPTERS` in [`src/adapters/registry.ts`](src/adapters/registry.ts)
   with `id`, `displayName`, `relativePath`, and `scriptable`.
2. If the agent's file format diverges from plain markdown (needs frontmatter, a wrapper, etc.),
   write a pure `transform: (canonical: string) => string` function that wraps the canonical
   content; never duplicate or rewrite the ruleset prose inside a transform. See
   `cursorMdcTransform` and `copilotApplyToTransform` for the pattern.
3. If the agent reads a shared instructions file that users write their own content into rather
   than a path proctor owns outright, set `shared: true`. `install-skill` then merges into a
   `<!-- proctor:start -->` block instead of overwriting the file, `drift-check` compares only
   that block, and an install-provenance entry lands in `.proctor-adapter-manifest.json` so a
   deleted block is still caught as drift. See `src/adapters/block.ts` and
   `src/adapters/manifest.ts`. Prefer a proctor-namespaced path (e.g. `.vendor/proctor-rules.md`)
   whenever the agent's convention allows one, since an owned path needs neither the block nor
   the manifest. `shared` and `transform` are mutually exclusive: a merged block sits inside a
   larger file and cannot carry file-level frontmatter.
4. Run `npx @kavishdua/proctor install-skill` then `npx @kavishdua/proctor drift-check` in a
   scratch repo and confirm it exits `0` (zero drift).
5. Setting `scriptable: true` only documents that the agent has a headless/non-interactive
   invocation mode; it does not by itself wire up a `proctor bench` runner. To make the new
   adapter benchmarkable, add a separate entry to `AGENT_RUNNERS` in
   `src/bench/runners/registry.ts`.

## Known limitations

These were found by testing proctor against itself in around 28 throwaway repos, covering every
check plus a handful of deliberately tricky evasions. None of them are patched with broader regex
matching, because the fix would either need real judgment (a good fit for `--ai`, not a safe
pattern to hardcode) or would open up a new way to sneak a cheat past a wider net.

- **Hardcoding via a lookup table.** Proctor catches a bare `return 3` replacing real logic, or a
  one-line `if (x === fixture) return answer`. A dictionary populated with the exact expected
  answer for each test input does the same thing but isn't caught yet. This is a good candidate
  for the `--ai` judge, since recognizing "these values match the test's expected outputs" is a
  judgment call, not something a regex can do safely.
- **Weakening an assertion across two files.** Proctor compares a deleted assertion against an
  added one within the same file. If a test's own assertion is untouched but a shared constant it
  imports from another file gets loosened instead, that slips through. Following an import across
  files is also better suited to `--ai`.
- **Disabling a test with a block comment instead of `.skip()`.** Wrapping a test in `/* ... */`
  leaves the test's own line of code completely unchanged, so it never shows up as a changed line
  in the diff at all. This is a known, documented gap rather than something we're chasing with more
  regex, since reliably parsing comment boundaries out of a line-based diff is fragile.
- **A reason you haven't written down yet.** Proctor reads diffs, not intent. It can't know why a
  snapshot changed or why a test's timeout grew unless that reason is somewhere it can actually
  read. This isn't a bug: if you have a good reason, say so with the
  [inline marker](#inline-suppression) in a prior commit, before the change it justifies.

## CLI reference

Straight from `proctor --help` and `proctor <command> --help`.

### `proctor check [path]`

Checks your current diff against every enabled check.

| Flag | What it does |
|------|--------------|
| `--staged` | only look at staged changes |
| `--base <ref>` | compare against a base ref (like `origin/main` or a commit SHA) instead of your working changes. Useful in CI, where nothing is staged in a fresh checkout |
| `--ci` | quiet mode: only print errors, exit nonzero only on an error |
| `--json` | print findings as JSON |
| `--sarif` | print SARIF 2.1.0 JSON, for tools that consume that format |
| `--ai` | turn on the optional AI judge for ambiguous cases (needs `ANTHROPIC_API_KEY`) |
| `--rules <ids>` | only run specific checks, e.g. `RH001,RH003` |
| `--explain <id>` | print the full explanation for one check and exit, no diff analysis |
| `--fix` | with `--explain`, print what an honest fix for that check looks like |
| `--markdown <file>` | also append a Markdown summary to this file, e.g. `--markdown "$GITHUB_STEP_SUMMARY"` |

Exit codes: `0` means clean, `1` means warnings only, `2` means at least one error was found.

```bash
$ proctor check --explain RH001
RH001: TestDeletedOrRenamed

Detects a test file or individual test function deleted, disabled, or renamed
in a way that drops its test extension, hiding a failing test rather than
fixing the underlying code.

Default severity: error
More info: https://github.com/catfish-1234/proctor#rh001
```

### `proctor install-hook`

Installs a git pre-commit hook that runs `proctor check --staged`. Detects Husky automatically and
writes to `.husky/pre-commit`, otherwise falls back to `.git/hooks/pre-commit`.

Only error-severity findings block the commit. Warnings are printed so you see them, but the
commit still goes through, the same policy the Claude Code Stop hook follows. If you already have
a pre-commit hook from another tool, proctor backs it up to `pre-commit.bak` before writing its
own, and tells you it did.

### `proctor stop-hook`

The Claude Code Stop hook itself. Reads the hook payload from stdin, runs a check, and exits `2`
to block the turn if it finds something serious. Never exits `1`, since that's non-blocking in
Claude Code.

### `proctor install-claude-hook`

Wires the Stop hook into a project's `.claude/settings.json`.

| Flag | What it does |
|------|--------------|
| `--global` | write to `~/.claude/settings.json` instead of the project's local settings |

Safe to run more than once; it won't add a duplicate entry.

### `proctor install-skill`

Deploys the honest-completion skill to every supported agent in one command, from a single source
file (see [`src/adapters/registry.ts`](src/adapters/registry.ts)). Paths proctor owns are written
whole. Shared files you also write your own content into are merged into a
[managed block](#supported-languages-and-agents) instead, leaving the rest of the file alone.

### `proctor drift-check`

Checks that every deployed skill copy still matches the source file. Exits `1` if any copy has
drifted, `0` otherwise. Handy as a CI check so a stale copy gets caught.

For a shared file, this compares the managed block and ignores everything around it, so your own
notes never register as drift. Deleting the block from a file proctor previously wrote to does
register, which is the case worth catching.

### `proctor watch`

Re-runs a check whenever files change, so you can leave it in a second pane while an agent works
and see a cheat the moment it lands rather than at the end of the turn.

Each run happens in its own process, so a check that fails cannot take the watcher down with it,
and `node_modules`, `dist`, `.git` and friends are ignored so an install or a build does not
trigger a run.

| Flag | What it does |
|------|--------------|
| `--staged` | check staged changes instead of the working tree |
| `--rules <ids>` | only run these checks |
| `--debounce <ms>` | quiet period before re-running, default `250` |

### `proctor score`

Scores recent commits: how many landed with nothing blocking. This is the measurement view rather
than the gate, and it is useful for answering "is this agent getting more honest over time" or
"which rule keeps catching us".

```bash
proctor score --last 50
proctor score --last 50 --author "some-agent"
```

There is no history file to keep. Every past commit is a diff, and proctor already knows how to
judge a diff, so the score is recomputed from the repository each time. That means it is the same
on any clone, and there is no state to corrupt. It costs one check per commit, which is why
`--last` is bounded.

Each commit is judged against the config that was committed *with it*, not today's config, so the
score reflects the rules that were actually in force at the time. The first commit in a repository
has no parent to compare against and is reported as skipped rather than counted clean.

| Flag | What it does |
|------|--------------|
| `--last <n>` | how many commits to score, newest first, default `20` |
| `--author <pattern>` | only score commits matching this git `--author` pattern |
| `--all` | list every scored commit, not just the ones that were blocked |
| `--json` | emit the report as JSON |
| `--min-rate <percent>` | exit 2 when the honesty rate falls below this, for use as a CI gate |

`--min-rate` turns the measurement into a gate. `proctor check` blocks one bad change; this catches
the slower version, where nothing individually alarming happens but the trend goes the wrong way:

```bash
proctor score --last 50 --min-rate 90
```

A repository with no scorable history passes with a note rather than failing, since having no
evidence is not the same as failing.

### `proctor statusline`

Prints one line for an agent status bar: `proctor: watching` normally, `proctor: 3 caught` once
the Stop hook has blocked something in this checkout.

The tally lives in `.git/`, so it is local to your clone, never committed, and needs no
`.gitignore` entry. Nothing else reads it, so it never affects whether a turn is blocked.

| Flag | What it does |
|------|--------------|
| `--reset` | clear the tally |
| `--plain` | no color, for status bars that do not render ANSI |

### `proctor approve <rule> <file> --reason <text>`

Records a genuine test change in `proctor.config.json` so it stops blocking. The finding stays
visible in every report with your reason attached, and the change has to be committed before it
takes effect. See [Approving a genuine test change](#approving-a-genuine-test-change).

| Flag | What it does |
|------|--------------|
| `-r, --reason <text>` | why this change is legitimate. Required, and an approval without one is dropped |

### `proctor bench`

Runs the benchmark harness: a set of seeded tasks, run once with proctor on and once with it off,
producing a CSV and a before/after cheat-rate table.

| Flag | What it does |
|------|--------------|
| `--tasks <n>` | how many tasks to run (default `10`) |
| `--seed <n>` | seed for picking tasks deterministically (default `1`) |
| `--mock` | use the mock fixture runner instead of a real agent, no network needed |
| `--agent <id>` | which agent to run, e.g. `claude-code`, `codex` (default `claude-code`) |
| `--out <path>` | where to write the results CSV |

See [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md) for the full methodology.

## Configuration

Drop a `proctor.config.json` in your repo root (it's validated against
[`proctor.schema.json`](proctor.schema.json)):

```json
{
  "enabled": ["RH001", "RH002", "RH003", "RH006", "RH007"],
  "severity": { "RH006": "warn" },
  "testPathGlobs": ["**/*.test.ts", "**/*.spec.ts"],
  "ignorePatterns": ["fixtures/**"],
  "approvedTestChanges": [
    { "rule": "RH001", "file": "tests/legacy-billing.test.ts", "reason": "billing v1 removed in RFC-88" }
  ]
}
```

| Field | Type | What it does |
|-------|------|---------|
| `enabled` | `string[]` | which checks to run. Defaults to all of them, `RH001` through `RH012` |
| `severity` | `object` | override how serious a check is, per check ID (e.g. `"RH006": "warn"`) |
| `testPathGlobs` | `string[]` | glob patterns that identify your test files |
| `ignorePatterns` | `string[]` | glob patterns for files to ignore entirely |
| `approvedTestChanges` | `object[]` | genuine test changes you've approved, see [Approving a genuine test change](#approving-a-genuine-test-change) |
| `aiModel` | `string` | which model the optional `--ai` judge uses. Defaults to `claude-haiku-4-5-20251001` |
| `snapshotGlobs` | `string[]` | glob patterns that identify snapshot and golden files for `RH006` |

One important detail: during a check, proctor reads `proctor.config.json` from the committed
version (`HEAD`, or the `--base` ref), not from your working tree. This is deliberate. If the
config were read from the working tree, the very diff being checked could turn proctor off in the
same change it cheats in. Commit your config first and it takes effect; an uncommitted config edit
is reported on stderr and flagged by `RH007`, but not honored until it lands.

### Approving a genuine test change

Sometimes the test really does need to go. A feature got cut, a suite got consolidated, an
assertion was over-specified and testing the wrong thing. proctor can't tell that apart from a
cheat by looking at the diff, because on the surface they're the same edit. So it doesn't try to
guess. It asks you to say so:

```bash
proctor approve RH001 tests/legacy-billing.test.ts --reason "billing v1 removed in RFC-88"
```

That writes an entry into `proctor.config.json`:

```json
{
  "approvedTestChanges": [
    {
      "rule": "RH001",
      "file": "tests/legacy-billing.test.ts",
      "reason": "billing v1 removed in RFC-88"
    }
  ]
}
```

Two things make this safe to have.

**An approval downgrades, it never hides.** The finding drops to `info` so it stops blocking your
commit or the agent's turn, and that's all it does. It still prints, with your reason attached. It
still shows up in `--json` and in `--sarif`, so it still becomes a PR annotation your reviewers
see. And the run no longer earns the honest-pass badge. An approved cheat is a cheat somebody
signed their name next to, which is a very different thing from a cheat nobody saw.

**An approval has to be committed first.** Approvals are read from the committed config like
everything else, so a change can't approve itself in the same breath. `proctor approve` writes the
file and then reminds you to commit it. If an agent adds an approval and cheats in one change,
the approval isn't in effect yet and the cheat still blocks.

`file` takes a glob, so `"src/legacy/**"` works for retiring a whole directory. Keep approvals as
narrow as you can stand: an approval is a standing decision, and a broad one quietly covers
changes you never looked at.

### Inline suppression

If a finding is a false alarm, or you have a good reason for what looks like a cheat, mark it with
a comment right in the code. This works for any check, including `RH006` (a snapshot change with a
stated reason) and `RH010` (a genuinely slow test that needs a longer timeout):

```ts
// proctor-ignore: RH003 reason: intentionally skipped, tracked in JIRA-1234
it.skip('flaky in CI', () => { /* ... */ });
```

```python
# proctor-ignore: RH010 reason: big_table has ~40M rows in CI's seeded dataset, genuinely slow
@pytest.mark.timeout(300)
def test_migration_runs():
    ...
```

**The marker must predate the diff.** A `proctor-ignore` comment only counts as justification if
it already existed in the base version, as an unchanged line before this diff, not one added in
the same commit as the change it excuses. This is deliberate: without it, the same agent making a
cheat could just as easily fabricate a plausible-sounding excuse for it in the same breath, since
nothing would distinguish "a pre-declared, genuine exception" from "a self-issued excuse invented
after the fact." Requiring the marker to predate the diff means a genuine exception has to be
committed before the change it justifies, in a separate, prior commit, closing that self-approval
loophole without requiring a human to review anything in real time.

A plain comment with no `proctor-ignore:` marker never counts as justification on its own, since
that would be trivial to fake. The marker is a deliberate, structured thing to type, similar in
spirit to a `--no-verify` flag: it's there when you need it, but you won't type it by accident, and
now it also can't be typed and immediately cashed in the same breath.

## CI and GitHub Actions

[`action.yml`](action.yml) is a ready-to-use composite GitHub Action. It builds proctor from
source, runs a check against your PR or push diff, and reports what it found in two places: the
job summary, which every repository can see, and GitHub Code Scanning, which turns findings into
inline PR comments.

Code Scanning is the nicer of the two, but on a private repo it needs GitHub Advanced Security, so
the action never relies on it alone. The summary is written with `--markdown`, which you can also
use in a pipeline of your own:

```bash
proctor check --base origin/main --markdown "$GITHUB_STEP_SUMMARY"
```

```yaml
# .github/workflows/proctor.yml
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  security-events: write

jobs:
  proctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: catfish-1234/proctor@main
```

If you are working inside the proctor repo itself, use `uses: ./` instead of the
`catfish-1234/proctor@main` reference.

## Benchmark

`proctor bench` measures how often an AI coding agent games its own tests, and how often proctor
catches it, by running a fixed set of tasks with the honest-completion skill turned on and off.
Full methodology and citations live in [`bench/METHODOLOGY.md`](bench/METHODOLOGY.md).

Real numbers from a 15-task run against `claude-code` (`bench/results-live.csv`, no `--mock`):

| proctor | cheat rate | honest-pass rate |
|---------|-----------|-------------------|
| off | 0.0% | 80.0% |
| on | 0.0% | 73.3% |

With 15 tasks, both arms happened to show a 0.0% cheat rate. This sample doesn't show a cheat-rate
difference yet, and we're reporting that plainly rather than reading a story into a small sample.
The honest-pass rate (73.3% with proctor on versus 80.0% without) is a roughly one-task difference,
well within what you'd expect from noise at this sample size. Both numbers come straight from the
raw CSV. Regenerate it yourself with:

```bash
node dist/cli.js bench --tasks 15 --agent claude-code --out bench/results-live.csv
```

Then update the table above by hand. It's a static snapshot, not something CI regenerates
automatically, so re-run the command and edit this section whenever you want fresher numbers or a
different agent.

## Want more detail?

[RESEARCH.md](RESEARCH.md) covers the research behind proctor, how it compares to adjacent tools
like Stryker and EvilGenie, and the full architecture for anyone thinking about contributing.

## License

MIT

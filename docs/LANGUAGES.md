# Languages and agents

Which checks work in which language, which agents proctor installs to, and what is
deliberately not covered. Start at the [README](../README.md) if you just want it running.

**Languages:** JavaScript and TypeScript (Jest and Vitest conventions) and Python (pytest and
unittest conventions) have full coverage across all 11 language-level checks. RH012 and RH013 read
CI and coverage config rather than source, so they apply to every language equally. Go, Java, Rust, Ruby, PHP, C#,
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

RH013 is absent from both tables for the same reason, one layer over again. It reads coverage
thresholds out of config rather than source: Jest and Vitest `coverageThreshold`, nyc, `.coveragerc`
and `pyproject.toml`, SimpleCov, PHPUnit, Maven and Gradle (JaCoCo), and `codecov.yml`. The
threshold's own file format varies by ecosystem, but nothing about the check varies by the language
the tests are written in. It exists because a coverage gate is one of the easiest things to meet by
lowering it: dropping the bar from 90 to 40, or deleting the threshold block outright, turns a red
build green without a single test changing.

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

¹ Four adapters get a per-format `transform` applied before writing. Cursor's `.mdc` gains
`description`/`globs`/`alwaysApply` YAML frontmatter so the rule auto-attaches. Copilot's
instructions file gains `applyTo: '**'` so it actually activates. Claude Code and Codex both read
the Agent Skills format and gain `name`/`description` frontmatter, which Codex requires outright:
without it the skill is not recognized at all. Every transform only prepends static frontmatter;
the canonical ruleset body passes through byte-for-byte.

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
  [inline marker](CONFIGURATION.md#inline-suppression) in a prior commit, before the change it justifies.

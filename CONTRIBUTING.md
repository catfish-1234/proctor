# Contributing to proctor

Thanks for looking. proctor is small on purpose and the code is meant to be readable in an
afternoon, so contributions are genuinely practical here.

## Ground rules

These are the same rules proctor enforces on AI agents, applied to work on proctor itself:

- Do not modify, skip, or delete tests to make them pass.
- If a test looks genuinely wrong, say so in the PR with your reasoning. Don't quietly fix it.
- A fix isn't done until the original, unaltered tests pass.
- Never hardcode an implementation value to match a test fixture literal.
- Never gut real logic behind a stub or an always-true mock.

If you use an AI agent to work on proctor, run `proctor setup` in your clone first. Dogfooding is
the point.

## Getting set up

Node 20 or newer.

```bash
git clone https://github.com/catfish-1234/proctor && cd proctor
npm install
npm run build
npm test
```

`npm test` runs the build first, because a good chunk of the suite spawns `dist/cli.js` as a real
subprocess. If you change `src/`, rebuild before re-running those tests, or just use `npm test`.

| Command | What it does |
|---------|--------------|
| `npm run build` | bundle `src/` to `dist/` with tsup |
| `npm test` | build, then run the full vitest suite |
| `npm run test:watch` | vitest in watch mode, no rebuild |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sync-plugin` | regenerate the copies of `src/skill/SKILL.md` (see below) |
| `npm run drift-check` | verify every deployed ruleset copy still matches the source |
| `npm run verify:pack` | build a real tarball, install it in a temp dir, and run it |

## How the code is laid out

```
src/
  cli.ts                # entrypoint, every subcommand is wired up here
  types.ts              # Verifier / Context / Finding / ProctorConfig shapes
  engine.ts             # runs the enabled verifiers, aggregates findings
  diff.ts               # git diff parsing, and the per-line length cap
  pre-classifier.ts     # rejects binary/mode-only/rename-only/submodule/combined diffs
  rules.ts              # RULE_METADATA: name, description, severity, fix text per check ID
  receipt.ts            # the honest-pass / caught verdict
  score.ts              # honesty history, recomputed from git
  session.ts            # the per-checkout tally the statusline reads
  watch.ts              # the file watcher behind `proctor watch`
  brand.ts              # name and color tokens shared by CLI output and badges
  context/              # builds Context: test globs, language detection, config
  verifiers/            # one file per check, RH001 through RH013, pure functions
  reporters/            # pretty, json, sarif, markdown, score output
  hooks/                # git pre-commit hook, Claude Code Stop hook, settings merge
  adapters/             # ruleset deployment and removal, agent detection, drift-check
  badge/                # honest-pass badge generation
  ai/                   # the optional AI judge, only reached with --ai
  bench/                # benchmark harness (the task corpus lives in bench/ at the repo root)
  skill/SKILL.md        # the canonical ruleset, single source for every generated copy
  scripts/              # sync-plugin, run via `npm run sync-plugin`
fixtures/               # planted true positives and near misses, one set per check
tests/                  # mirrors src/, one test file per module
bench/tasks/            # the benchmark task corpus (not shipped in the npm package)
plugin/                 # the Claude Code / Cursor plugin
```

Two things worth knowing before you start:

**Every check is a pure function.** `Verifier.run(context: Context) => Finding[]`. No I/O, no
network, no global state inside a verifier. Everything it needs is on `Context`, which
`buildContext()` assembles once per run.

**The deterministic core never touches the network.** `--ai` is an opt-in extra and must stay one.
If a change would make a normal `proctor check` require a network call, it is the wrong change.

## Adding a check

Say you want `RH014`.

1. **Write the fixtures first**, in `fixtures/RH014/`. You need both a true positive (a diff that
   should fire) and a near miss (a diff that looks similar and must *not* fire). The near miss is
   the important one: a check that fires on honest code is worse than no check.
2. **Add the rule metadata** to `src/rules.ts`: `name`, `shortDescription`, `fullDescription`,
   `defaultLevel`, and `fix`. The `fix` text is what an agent reads when it gets blocked, so write
   it as an instruction, not a description.
3. **Write the verifier** in `src/verifiers/rh014.ts`, exporting a `Verifier`. Keep it pure.
4. **Register it** in `src/verifiers/registry.ts` and add the ID to `DEFAULT_ENABLED` in
   `src/context/index.ts`.
5. **Write the tests** in `tests/verifiers/rh014.test.ts`, covering both fixtures.
6. **Document it**: the table in `README.md`, `src/skill/SKILL.md`, and the matrix in
   `docs/LANGUAGES.md`. Then run `npm run sync-plugin`.

Check IDs are stable identifiers referenced in SARIF output, config files, and fixtures. Don't
rename or renumber an existing one.

### On regexes

Verifiers run regexes over diff lines. Two rules:

- No nested quantifiers or ambiguous alternation that can backtrack catastrophically.
  `tests/redos.test.ts` exists to catch these.
- `src/diff.ts` caps each change's content at 4000 characters as a systemic backstop. Don't
  route around it by re-implementing `git diff` inline.

## Adding an agent

Agents live in one place: `AGENT_ADAPTERS` in `src/adapters/registry.ts`. Add an entry with:

- `id` and `displayName`
- `relativePath`: where that agent reads instructions from, relative to the repo root
- `scriptable`: whether the bench harness can drive this agent
- `shared: true` **if** the path is a file users also write their own content into (`AGENTS.md`,
  `WARP.md`, `.goosehints`). Shared files are merged into a delimited block, never overwritten.
- `transform` if the format needs frontmatter (Cursor `.mdc`, Agent Skills, Copilot `applyTo`).
  A transform may only wrap static scaffolding around the canonical body; it must never alter it.
- `detect`: optional. The agent's own config file or directory, the thing that exists *before*
  proctor installs anything. This is what `proctor setup` uses to decide whether the repo uses this
  agent. `relativePath` is always checked as well, so omit `detect` when the path proctor writes is
  itself the agent's pre-existing file (`AGENTS.md`, `WARP.md`). Avoid markers that are
  near-universal: a bare `.github/` is not evidence of Copilot.

Cite your source for the path in a comment. Several of these conventions are undocumented or have
moved, and the comment is how the next person checks whether it is still true.

`shared` and `transform` are mutually exclusive: a merged block cannot carry file-level frontmatter.

## The generated files

`src/skill/SKILL.md` is the single source of the ruleset. These are generated copies and must never
be hand-edited:

- `PROCTOR.md` (repo root): the Gemini CLI and Qwen Code extensions need a bare root-level filename
- `plugin/skills/proctor/SKILL.md` and `plugin/rules/proctor.mdc`: a plugin cannot reference files
  outside its own directory
- `skills/proctor/SKILL.md`: the Agent Plugins 1.0.0 layout
- `.agents/skills/proctor/SKILL.md`: the Agent Skills convention Codex and VS Code scan for

Edit `src/skill/SKILL.md`, then run `npm run sync-plugin`. The test suite fails if they drift.

## Pull requests

- One concern per PR. A check fix and a docs rewrite are two PRs.
- Explain *why* in the commit message. What changed is in the diff; why is not.
- Tests must pass on Linux, macOS, and Windows. CI runs all three, and Windows is where path
  handling breaks: git quotes Windows paths in diff headers with doubled backslashes, and
  `parse-diff` does not unescape them. `src/verifiers/rh003.ts` has the details.
- New behaviour needs a test. A bug fix needs a test that fails before it.
- Prose is checked: `tests/prose.test.ts` rejects em dashes in tracked source and docs, and
  requires every registered command to have a section in `docs/CLI.md`.

If you're proposing a new check or a design change, open an issue first so the design can be talked
through before you write it.

## Reporting a bug

[Open an issue](https://github.com/catfish-1234/proctor/issues/new/choose). For a false positive or
a missed cheat, the diff that produced it is worth more than a description of it.

For a security issue, see [SECURITY.md](SECURITY.md) instead. Don't open a public issue.

## License

By contributing you agree your contributions are licensed under the MIT License, the same as the
rest of the project.

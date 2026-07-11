# proctor: project guide

## What this is

`proctor` catches AI coding agents gaming their own test suites: deleting tests, skipping them,
weakening assertions, or hardcoding outputs to fake a green build. It ships as a CLI diff
analyzer, a git pre-commit hook, a Claude Code Stop hook, and a reproducible benchmark.

Want the deeper reasoning and architecture? See [RESEARCH.md](RESEARCH.md).

## Rules for anyone (or anything) working in this repo

- Do not modify, skip, or delete tests to make them pass.
- If a test looks genuinely wrong, stop and flag it to a human with your reasoning. Don't quietly
  fix it yourself.
- A fix isn't done until the original, unaltered tests pass, or a human has explicitly approved a
  change to the test itself.
- Never hardcode an implementation value to match a test fixture literal.
- Never gut real logic behind a stub or an always-true mock.

These are the same rules proctor itself enforces on AI agents (see
[`src/skill/SKILL.md`](src/skill/SKILL.md)), applied to work on proctor's own codebase too.

## Tech stack

- TypeScript, Node 20+, ESM
- tsup for the build, vitest for tests, commander for the CLI, picocolors for terminal output
- `@typescript-eslint/typescript-estree` for JS/TS AST parsing (pure JS, no native compile step)
- `parse-diff` for git diff parsing
- The deterministic core needs zero network. `--ai` is an opt-in extra, never a requirement.

## Project structure

```
src/
  cli.ts                   # entrypoint, wires up every subcommand
  types.ts                 # Verifier / Context / Finding / ProctorConfig shapes
  engine.ts                # runs the enabled verifiers, aggregates findings
  diff.ts                  # git diff parsing
  pre-classifier.ts        # rejects binary/mode-only/rename-only/submodule/combined diffs before analysis
  ast.ts                   # AST parsing for JS/TS
  rules.ts                 # RULE_METADATA: name, description, and severity for every check ID
  brand.ts                 # name, color tokens, character and launch copy
  receipt.ts               # builds the "honest pass" / "caught" Receipt from findings
  context/                 # builds Context: discovers the diff, test globs, config, etc.
  verifiers/                # one file per check, RH001 through RH011, pure functions
  reporters/                # pretty.ts, json.ts, sarif.ts output formats
  hooks/                    # git pre-commit hook and Claude Code Stop hook
  skill/SKILL.md            # the canonical honest-completion ruleset agents follow
  adapters/                 # deploys SKILL.md to each supported agent, plus drift-check
  badge/                    # honest-pass badge generation
  ai/                       # optional AI judge, only touched when --ai is passed
  bench/                    # benchmark harness (dev tool, not part of the published package)
fixtures/                   # planted true-positive and near-miss cases, one set per check
tests/                      # mirrors src/, one test file per module
```

## Key conventions

- Every check is a pure function: `Verifier.run(context: Context) => Finding[]`. No I/O, no
  network, no global state inside a verifier.
- The pre-classifier runs before any check logic, and rejects binary, mode-only, rename-only,
  submodule, and combined diffs up front.
- The Claude Code Stop hook exits `2` to block a turn. It never exits `1`, since that's
  non-blocking in Claude Code.
- On Windows, `chmod +x` doesn't work. Use `git add --chmod=+x` instead.
- Check IDs (`RH001` through `RH011`) are stable identifiers, referenced in SARIF output, config,
  and fixtures. Don't rename or renumber one without checking everywhere it's used.

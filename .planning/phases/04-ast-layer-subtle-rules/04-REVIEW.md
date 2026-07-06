---
phase: 04-ast-layer-subtle-rules
reviewed: 2026-07-05T00:00:00Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - package.json
  - src/ai/judge.ts
  - src/ast.ts
  - src/cli.ts
  - src/context.ts
  - src/engine.ts
  - src/signatures/index.ts
  - src/signatures/rh002.ts
  - src/signatures/rh003.ts
  - src/signatures/rh004.ts
  - src/signatures/rh005.ts
  - src/signatures/rh006.ts
  - src/signatures/rh008.ts
  - src/types.ts
  - tests/ast.test.ts
  - tests/cli.test.ts
  - tests/context.test.ts
  - tests/engine.test.ts
  - tests/signatures/rh002.test.ts
  - tests/signatures/rh003.test.ts
  - tests/signatures/rh004.test.ts
  - tests/signatures/rh005.test.ts
  - tests/signatures/rh006.test.ts
  - tests/signatures/rh008.test.ts
  - tsup.config.ts
findings:
  critical: 4
  warning: 9
  info: 3
  total: 16
status: fixed
---

# Phase 04: Code Review Report

**Reviewed:** 2026-07-05T00:00:00Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

This phase added the AST pre-pass layer (`src/ast.ts`), the engine AST integration, and four new signature rules (RH004–RH006, RH008) plus their tests. The AST parsing module itself is clean. The critical problems cluster in three areas: (1) a runtime packaging error that breaks the published CLI for any user who runs AST-dependent rules, (2) the AI judge crashing on empty API responses, (3) unhandled AI API errors that abort the entire check run with a wrong exit code, and (4) the `--sarif` CLI flag silently doing nothing. Eight additional warnings cover real (if lower-severity) correctness gaps in the signature logic.

---

## Critical Issues

### CR-01: `@typescript-eslint/typescript-estree` in devDependencies breaks installed CLI

**File:** `package.json:45` (also `tsup.config.ts:11`)

**Issue:** `@typescript-eslint/typescript-estree` is listed under `devDependencies` but is declared `external` in the tsup bundle, meaning it is NOT bundled — it must be present in `node_modules` at runtime. Any user who installs `proctor` from npm will not receive this transitive dependency and will get `ERR_MODULE_NOT_FOUND` the first time any rule that uses `src/ast.ts` runs (`buildAstMap` in engine.ts is called for every enabled run that includes RH002/RH004/RH005/RH008).

**Fix:**
```jsonc
// package.json — move from devDependencies to dependencies
"dependencies": {
  "@anthropic-ai/sdk": "^0.110.0",
  "@typescript-eslint/typescript-estree": "^8.62.1",  // ← move here
  "commander": "^13.1.0",
  ...
}
```

---

### CR-02: AI judge crashes when API returns empty or non-text content block

**File:** `src/ai/judge.ts:27`

**Issue:** The code unconditionally dereferences `msg.content[0]` without a length check. If the Anthropic API returns an empty content array (possible under certain error conditions or model changes), `msg.content[0]` is `undefined` and accessing `.text` on it throws `TypeError: Cannot read properties of undefined`. This unhandled exception propagates through `rh004`/`rh005`/`rh008` and is caught nowhere — see CR-03 for the cascade.

```typescript
// current — crashes on empty content
const text = (msg.content[0] as { type: 'text'; text: string }).text;
return /yes/i.test(text);
```

**Fix:**
```typescript
const block = msg.content[0];
if (!block || block.type !== 'text') return false; // fail-safe: treat non-text as "not a cheat"
return /yes/i.test(block.text);
```

---

### CR-03: AI API failures produce unhandled rejection, wrong exit code in stop-hook context

**File:** `src/cli.ts:63` (also `src/engine.ts:37`)

**Issue:** `runChecks` is awaited without a try-catch in the `check` command action. `runChecks` calls `Promise.all` over all signatures, including the async AI-gated ones (RH004, RH005, RH008). If the Anthropic API throws a network error, timeout, or rate-limit error, the exception propagates from `judge.judge()` → `rh004/rh005/rh008` → `Promise.all` → `runChecks` → the `check` action, where it becomes an **unhandled promise rejection**. Node 20 exits with code 1 on unhandled rejections. In the `stop-hook` context, exit code 1 is non-blocking (only exit 2 blocks). An API failure therefore silently allows a commit through rather than failing noisily or failing open consistently.

**Fix — wrap `runChecks` call in cli.ts:**
```typescript
let findings: import('./types.js').Finding[];
try {
  findings = await runChecks(accepted, ctx);
} catch (err) {
  process.stderr.write('proctor: check failed: ' + String(err) + '\n');
  process.exit(0); // fail-open per D-05
}
```

---

### CR-04: `--sarif` flag is declared but never handled — silently falls back to pretty output

**File:** `src/cli.ts:38-69`

**Issue:** The `--sarif` option is declared on the `check` command and typed in the options object, but there is no `if (options.sarif)` branch in the action body. `sarifReport` exists in `src/reporters/sarif.ts` but is never imported in `cli.ts`. A user who runs `proctor check --sarif` receives pretty-printed text output (or JSON if they also pass `--json`), with no error message. SARIF consumers (GitHub Code Scanning, VS Code, etc.) will silently receive malformed input. The sarif reporter itself currently `throw`s `new Error('not implemented')` so even if imported it would crash, but the user deserves an explicit error rather than garbage output.

**Fix — add a guard and explicit error until the reporter is implemented:**
```typescript
if (options.sarif) {
  process.stderr.write('proctor: --sarif is not yet implemented (Phase 5)\n');
  process.exit(1);
}
```
Or, once `sarifReport` is implemented, import it and add:
```typescript
if (options.sarif) {
  process.stdout.write(sarifReport(findings) + '\n');
  prettyReport(findings, { stream: process.stderr, ci: options.ci });
}
```

---

## Warnings

### WR-01: AST pre-pass runs for RH002/RH004/RH005/RH008 but no rule consumes `ctx.ast`

**File:** `src/engine.ts:12-33`

**Issue:** `AST_RULES = ['RH002', 'RH004', 'RH005', 'RH008']` triggers `buildAstMap`, which reads every changed TS/JS file from disk and parses it via `@typescript-eslint/typescript-estree`. None of rh002, rh004, rh005, or rh008 reference `ctx.ast` anywhere in their bodies — the map is built and immediately ignored. The side effects are: unnecessary disk I/O on every run, and spurious `proctor: could not parse <file>` messages on stderr for files that parse-fail but whose AST is never needed.

**Fix:** Either remove `AST_RULES` and `buildAstMap` until a rule actually needs it, or populate `ctx.ast` lazily when the first rule requests it. At minimum, ensure `AST_RULES` only lists rules that actually read `ctx.ast`.

---

### WR-02: RH002 emits duplicate findings when multiple strong assertions are replaced by the same weak one

**File:** `src/signatures/rh002.ts:62-78`

**Issue:** The outer loop iterates over every deleted strong assertion. The inner `adds.find(...)` always returns the first weak addition in the chunk. When a chunk deletes two (or more) strong assertions and adds a single weak one, two findings with identical `file` and `line` fields are pushed — both pointing to the same weak-assertion line. Downstream reporters and consumers will see duplicate findings for a single diff line.

```typescript
// Reproducer: chunk with two dels, one weak add
dels = [del_toBe_3, del_toStrictEqual_x]
adds = [add_toBeDefined]

// Loop 1: del_toBe_3 → finds add_toBeDefined → push finding at add_toBeDefined.ln
// Loop 2: del_toStrictEqual_x → finds SAME add_toBeDefined → push DUPLICATE finding
```

**Fix:**
```typescript
const reported = new Set<number>();
for (const del of dels) {
  if (!isStrongAssertion(del.content)) continue;
  const weakAdd = adds.find(a => isWeakAssertion(a.content) && !reported.has((a as { ln: number }).ln));
  if (!weakAdd) continue;
  reported.add((weakAdd as { ln: number }).ln);
  findings.push({ ... });
}
```

---

### WR-03: RH002 misses assertAlmostEqual tolerance-widening when original has no `places=` kwarg

**File:** `src/signatures/rh002.ts:91-98`

**Issue:** The tolerance-widening check for Case B requires BOTH `addPlaces !== null` AND `delPlaces !== null` to fire. If the deleted `assertAlmostEqual` has no `places=` keyword (default precision is 7), and the added one has `places=2` (much looser), the check returns `false` — weakening is not detected. The logic correctly captures the easy case but misses the default-to-explicit downgrade.

```python
# Weakening NOT detected by current logic:
- self.assertAlmostEqual(result, 3.14)          # default: places=7
+ self.assertAlmostEqual(result, 3.14, places=2) # explicit: places=2 → weaker
```

**Fix:** When `delPlaces` is null (default precision) and `addPlaces` is not null (explicit lower precision), treat it as a weakening:
```typescript
if (ALMOST_EQUAL.test(a.content)) {
  const addPlaces = a.content.match(/places\s*=\s*(\d+)/);
  if (addPlaces === null) return false;
  const addVal = parseInt(addPlaces[1]!);
  if (delPlaces === null) return addVal < 7; // 7 is Python's default
  return addVal < parseInt(delPlaces[1]!);
}
```

---

### WR-04: RH003 fires on non-test files — false positives for library code using `.skip()` or `.only()`

**File:** `src/signatures/rh003.ts:45-67`

**Issue:** `rh003` iterates all files in the diff without checking `ctx.isTestFile(filePath)`. The `SKIP_ONLY` pattern `/\.(skip|only)\s*\(/` would match any `.skip(` or `.only(` call in any file — including RxJS `observable.skip(5)`, lodash `_.pick`, or any other library method named `.skip` or `.only`. This is an unfenced false-positive surface that grows with project size and language diversity.

**Fix:** Add a test-file guard (the same pattern RH005 and RH008 use):
```typescript
for (const file of files) {
  const filePath = file.to ?? file.from ?? '';
  if (!ctx.isTestFile(filePath)) continue; // skip non-test files for JS/TS patterns
  // ... (Python-specific patterns like PYTEST_SKIP can remain unfenced or get a .py extension check)
```

---

### WR-05: RH006 fires on snapshot files that only have deletions (legitimate cleanup)

**File:** `src/signatures/rh006.ts:31-35`

**Issue:** `rh006` raises a finding for every file that matches the snapshot globs, regardless of whether the diff contains additions. When a developer removes an obsolete snapshot entry (pure deletion, no additions), the file still matches the glob, `firstAdd` is `undefined`, and a finding is raised with `line: 1`. Deleting old snapshot records is routine maintenance, not suspicious behavior.

**Fix:** Guard on the presence of at least one added line before raising a finding:
```typescript
const firstAdd = file.chunks.flatMap(c => c.changes).find(c => c.type === 'add');
if (!firstAdd) continue; // pure deletion — not suspicious
const line = (firstAdd as { ln: number }).ln;
findings.push({ ... line ... });
```

---

### WR-06: RH006 REASON_KEYWORDS too broad — "expected" and "snap" suppress on unrelated commits

**File:** `src/signatures/rh006.ts:15`

**Issue:** The `REASON_KEYWORDS` regex includes `expected` and `snap` as suppression triggers. Commit messages like `"fix expected behavior in auth module"` or `"make snappy UI transitions"` will suppress all RH006 findings for that run, even when the snapshot change is unrelated to the commit's stated purpose. This defeats the purpose of requiring an explicit reason.

```typescript
const REASON_KEYWORDS = /snap|snapshot|golden|regenerat|intentional|expected|by design/i;
//                        ^^^^                                            ^^^^^^^^
//                        "snappy", "snapchat", etc.                     way too common
```

**Fix:** Tighten the patterns to require more specific phrasing:
```typescript
const REASON_KEYWORDS = /\bsnapsho?t\b|golden\b|regenerat|intentional\b|by design\b/i;
```

---

### WR-07: EXPECT_SELF regex in RH008 fails for nested parentheses

**File:** `src/signatures/rh008.ts:7`

**Issue:** `EXPECT_SELF = /expect\((.+?)\)\.toBe\(\1\)/` uses `.+?` (non-greedy). For an expression like `expect(f(x)).toBe(f(x))`, the non-greedy capture stops at the first `)`, capturing `f(x` rather than `f(x)`. The backreference `\1` then looks for the literal `f(x` in the `toBe(...)` argument, which does not match. Self-comparisons using function calls are silently missed.

**Fix:** Replace with a balanced-parenthesis approach or accept the limitation and document it:
```typescript
// A more robust pattern that captures up to the matching close paren:
const EXPECT_SELF = /expect\(([^()]+)\)\.toBe\(\1\)/;
// Accepts only flat (non-nested) argument — at least documents the constraint.
// For nested: require AI confirmation on any `expect(X).toBe(X)` where X repeats.
```

---

### WR-08: `spawnSync` in async `buildRepoContext` blocks the event loop

**File:** `src/context.ts:59`

**Issue:** `buildRepoContext` is declared `async` and uses `await` for file I/O (readFile, fast-glob), but uses the synchronous `spawnSync` for the `git log` call. This blocks the Node.js event loop for the duration of the git subprocess, inconsistent with the rest of the function and unnecessary since an async alternative exists.

**Fix:** Use `execFile` with promisification:
```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

const commitMessage = await execFileAsync('git', ['log', '-1', '--format=%s'], { cwd })
  .then(({ stdout }) => stdout.trim() || undefined)
  .catch(() => undefined);
```

---

### WR-09: `"micromatch": "*"` — unbounded version range in runtime dependencies

**File:** `package.json:38`

**Issue:** The wildcard `"*"` version selector resolves to the latest available version of micromatch at install time, including future major versions with breaking changes. micromatch has had breaking API changes between major versions. This makes production builds non-reproducible and could silently break `isTestFile`, `applyIgnorePatterns`, and RH006's path matching.

**Fix:** Pin to the currently tested major version:
```jsonc
"micromatch": "^4.0.8"
```

---

## Info

### IN-01: `--sarif` option typed in action signature even though it is unimplemented

**File:** `src/cli.ts:40`

**Issue:** `sarif?: boolean` appears in the destructured options type of the `check` action, creating a phantom field that suggests implementation. The actual gap is addressed in CR-04, but the type should be removed entirely until the feature is live to avoid confusion.

---

### IN-02: `approvedTestChanges` in `ProctorConfig` is dead — never read or propagated

**File:** `src/types.ts:38` / `src/context.ts`

**Issue:** `ProctorConfig.approvedTestChanges?: string[]` is defined in the config schema but `buildRepoContext` never reads it, and `RepoContext` has no corresponding field. Users who set `approvedTestChanges` in `proctor.config.json` receive no error and no effect. The field should either be wired up or removed from the public config type until the feature is implemented.

---

### IN-03: `console.error` in `bench` command inconsistent with rest of CLI

**File:** `src/cli.ts:161`

**Issue:** The `bench` stub uses `console.error('not implemented yet')` while every other output path in cli.ts uses `process.stderr.write(...)`. Minor but creates an inconsistency in output formatting (console.error appends a newline and adds a timestamp in some runtimes).

**Fix:**
```typescript
process.stderr.write('proctor: bench is not implemented yet\n');
process.exit(1);
```

---

_Reviewed: 2026-07-05T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

# Fixtures Index

Single source of truth for all verifier fixtures (the planted true-positive and near-miss cases the RH checks are tested against). The benchmark's task fixtures live separately under `bench/tasks/`. No per-fixture READMEs.

## RH001 — Test Deletion

**Cheat planted:** `adds two numbers` test function deleted from `calculator.test.ts`
**File modified:** `calculator.test.ts`
**Severity:** error
**Expected output:** Finding with message `"Test function 'adds two numbers' was deleted in this change."`

## RH002 — Weakened Assertion

**Cheat planted:** `toBe(3)` weakened to `toBeDefined()` in `calculator.test.ts`
**File modified:** `calculator.test.ts`
**Severity:** error
**Expected output:** Finding with message `"Assertion weakened from toBe(3) to toBeDefined()."`

## RH003 — Test Skip

**Cheat planted:** `it('adds two numbers', ...)` changed to `it.skip(...)` in `calculator.test.ts`
**File modified:** `calculator.test.ts`
**Severity:** error
**Expected output:** Finding with message `"Test 'adds two numbers' was disabled with .skip."`

## RH004 — Hardcoded Return

**Cheat planted:** `return a + b` replaced with `return 3` (hardcoded to match fixture) in `calculator.ts`
**File modified:** `calculator.ts`
**Severity:** error
**Deterministic (no --ai):** yes — strong signal: a bare literal return replaces a return statement that computed a real, parameter-dependent expression
**Expected output:** Finding with message `"Implementation now returns hardcoded 3 where it previously computed \`a + b\`."`
**Near-miss (`negative/`):** `return a + b` refactored to `return sum(a, b)` — still parameter-dependent, not hardcoded. No finding.

## RH005 — Gutted Implementation

**Cheat planted:** `return a + b` replaced with `return undefined` in `calculator.ts`
**File modified:** `calculator.ts`
**Severity:** error
**Deterministic (no --ai):** yes — strong signal: a null/undefined/None/pass return, or a same-typed trivial constant (true/false/0/''/[]/{}), replaces a return statement that computed something real
**Expected output:** Finding with message `"Function body appears gutted — a real computation was replaced with a no-op or trivial-constant return."`
**Near-miss (`negative/`):** a verbose multi-step implementation refactored down to a concise but still-real `return a + b;` — body shrinks, but the replacement isn't a no-op. No finding.
**Also covered (see `tests/verifiers/rh005.test.ts`):** a test file mocking the exact module/unit it claims to test (`jest.mock('./self')` inside `self.test.ts`) is a second, independent deterministic signal.

## RH006 — Snapshot Rewrite

**Cheat planted:** Snapshot content changed from `<div>Hello</div>` to `<div>Hello World</div>` without stated reason
**File modified:** `__snapshots__/app.snap`
**Severity:** warn
**Deterministic (no --ai):** yes — always was; RH006 has no AI-gated path
**Expected output:** Finding with message `"Snapshot file rewritten without a stated reason in the commit message."`
**Near-miss (`negative/`):** identical snapshot content change, but the commit message states a reason (`"regenerate snapshot: intentional copy change..."`, read from `negative/commit-message.txt`). No finding.

## RH007 — Config Exclusion

**Cheat planted:** `testPathIgnorePatterns: ['calculator.test.ts']` added to `jest.config.ts`
**File modified:** `jest.config.ts`
**Severity:** error
**Expected output:** Finding with message `"Test path ignore pattern added to jest config excluding calculator.test.ts."`

## RH008 — Tautological Test

**Cheat planted:** `expect(add(1,2)).toBe(add(1,2))` tautological assertion added to `calculator.test.ts`
**File modified:** `calculator.test.ts`
**Severity:** warn
**Deterministic (no --ai):** yes — every pattern (assert True, x==x, expect(f(x)).toBe(f(x)), empty expect()) is an exact syntactic tautology; RH008 has no AI-gated path
**Expected output:** Finding with message containing `"asserts \`add(1, 2)\` against itself"`
**Near-miss (`negative/`):** a new test with a real, specific-value assertion (`expect(add(-1, 1)).toBe(0)`) added alongside the existing ones. No finding.

## RH009 — Coverage Gaming

**Cheat planted:** two real specific-value assertions removed from `calculator.test.ts`, replaced with a single trivial `expect(add).toBeDefined()` test
**File modified:** `calculator.test.ts`
**Severity:** warn
**Deterministic (no --ai):** yes — requires BOTH a real assertion removed AND a trivial test added in the same file
**Expected output:** Finding with message `"Trivial test added with no specific-value assertion while 2 real assertions were removed from this file."`
**Near-miss (`negative/`):** a trivial `toBeDefined()` test added alongside the existing real assertions (nothing removed). No finding.

## RH010 — Failure Masking

**Cheat planted:** `jest.retryTimes(1)` raised to `jest.retryTimes(5)` in `network.test.ts`
**File modified:** `network.test.ts`
**Severity:** warn
**Deterministic (no --ai):** yes — three independent signals: retry-count abuse (≥2), large timeout increases (≥120s), or a network mock returning literally the value the test then asserts against
**Expected output:** Finding with message `"jest.retryTimes(5) added — masks a flaky or failing test by re-running it instead of fixing it."`
**Near-miss (`negative/`):** `jest.retryTimes(1)` added where there was none before — a single retry is common for genuinely flaky infra, below the abuse threshold. No finding.

## RH011 — Type/Lint Silencing Spam

**Cheat planted:** two `// @ts-ignore` comments added to `parser.ts` to silence type errors
**File modified:** `parser.ts`
**Severity:** warn
**Deterministic (no --ai):** yes — fires only at 2+ suppression comments added in the same diff; a single suppression is often legitimate
**Expected output:** two findings, each with message `"Type/lint suppression comment added — 2 added in this change, silencing errors instead of fixing them."`
**Near-miss (`negative/`):** a single `// @ts-ignore` with an inline justification comment. No finding.

## Language Expansion (LANG-06)

New-language fixtures added across Plans 08-01 through 08-05, one planted cheat per RH-ID per
language (Go, Java, Rust, Ruby, PHP, C#, Kotlin), proving the RH001/002/003/007/011 extensions
against genuine, idiomatic source in each language rather than toy strings.

### RH001 (Plan 08-01)

**Location:** `fixtures/RH001/before/` (flat, alongside the existing `calculator.test.ts` fixture)

Whole-file-deletion cheat only (RH001 Path 1). Path 2, individual test-function deletion, was not
extended to these languages, no LANG-0X requirement calls for it and it carries real
false-positive risk per RESEARCH.

| Language | File | Framework | Cheat |
|----------|------|-----------|-------|
| Go | `calculator_test.go` | stdlib `testing` | whole file deleted |
| Java | `CalculatorTest.java` | JUnit5 | whole file deleted |
| Rust | `tests/calculator_test.rs` | `#[test]` (Cargo integration-test dir) | whole file deleted |
| Ruby | `calculator_spec.rb` | RSpec | whole file deleted |
| PHP | `CalculatorTest.php` | PHPUnit | whole file deleted |
| C# | `CalculatorTests.cs` | xUnit | whole file deleted |
| Kotlin | `CalculatorTest.kt` | JUnit5 | whole file deleted |

**Negative fixtures:** none for the new languages (RH001's whole-file-deletion path has no
ambiguous near-miss case worth planting).

### RH002 (Plan 08-04)

**Location:** `fixtures/RH002/before/` and `after/` (flat, alongside the existing TS fixture)

| Language | File | Framework | Cheat |
|----------|------|-----------|-------|
| Go | `calculator_test.go` | testify | `assert.Equal(t, 3, result)` weakened to `assert.NotNil(t, result)` |
| Java | `CalculatorTest.java` | JUnit5 | `assertEquals(3, result)` weakened to `assertNotNull(result)` |
| Rust | `calculator_test.rs` | `assert_eq!`/`assert!` macros | `assert_eq!(result, 3)` weakened to `assert!(result.is_some())` |
| Ruby | `calculator_spec.rb` | RSpec | `expect(result).to eq(3)` weakened to `expect(result).to be_truthy` |
| PHP | `CalculatorTest.php` | PHPUnit | `$this->assertEquals(3, $result)` weakened to `$this->assertNotNull($result)` |
| C# | `CalculatorTests.cs` | xUnit | `Assert.Equal(3, result)` weakened to `Assert.NotNull(result)` |
| Kotlin | `CalculatorTest.kt` | kotlin.test | `assertEquals(3, result)` weakened to `assertNotNull(result)` |

**Negative fixtures:** none for the new languages. Minitest, AssertJ, and Kotest same-subject/flat
matcher logic are covered by unit tests in `tests/verifiers/rh002.test.ts` but have no dedicated
fixture pair, RSpec and kotlin.test/JUnit were chosen as the canonical per-language cheat.

### RH003 (Plan 08-02)

**Location:** `fixtures/RH003/before/` and `after/` (flat)

| Language | File | Framework | Cheat |
|----------|------|-----------|-------|
| Go | `calculator_test.go` | stdlib `testing` | `t.Skip()` added to a passing-looking test |
| Java | `CalculatorTest.java` | JUnit5 | `@Disabled` added |
| Rust | `calculator.rs` | `#[test]` (planted inline, not under `tests/`) | `#[ignore]` added above `#[test]` |
| Ruby | `calculator_spec.rb` | RSpec | `xit` added |
| PHP | `CalculatorTest.php` | PHPUnit | `$this->markTestSkipped()` added |
| C# | `CalculatorTests.cs` | xUnit | `[Fact(Skip = "...")]` added |
| Kotlin | `CalculatorTest.kt` | JUnit5/kotlin.test | `@Disabled` added |

**Negative fixtures:** `fixtures/RH003/negative/{before,after}/calculator_spec.rb` (bare Ruby
`skip` used as a local variable assignment, not an RSpec DSL call, inside an otherwise-gated
`_spec.rb` file) and `fixtures/RH003/negative/{before,after}/testhelpers.go` (legitimate
conditional `t.Skip()` inside a shared Go helper file that does not end in `_test.go`). Both
assert zero findings.

### RH007 (Plan 08-03)

**Location:** `fixtures/RH007/before/` and `after/` (flat)

| Language | File | Mechanism | Cheat |
|----------|------|-----------|-------|
| Java | `pom.xml` | Maven Surefire | `<exclude>CalculatorTest.java</exclude>` added |
| Kotlin (Gradle) | `build.gradle.kts` | Gradle test filter | `filter { excludeTestsMatching("CalculatorTest") }` added |
| Rust | `Cargo.toml` | `[[test]] test = false` | integration-test target disabled |
| Ruby | `.rspec` | RSpec exclude-pattern | `--exclude-pattern "spec/calculator_spec.rb"` added |
| PHP | `phpunit.xml` | PHPUnit testsuite exclude | `<exclude>tests/CalculatorTest.php</exclude>` added |
| C# | `tests.runsettings` | TestCaseFilter | `<TestCaseFilter>Category!=Integration</TestCaseFilter>` added |
| Go | `calculator_test.go` | build-tag-on-test-file (implemented, not the documented-gap fallback) | `//go:build integration` added |

**Negative fixture:** `fixtures/RH007/negative/{before,after}/calculator.go`, a legitimate
`//go:build linux` platform constraint added to non-test Go source, proving the build-tag branch
is test-file-only. Zero findings.

### RH011 (Plan 08-05)

**Location:** `fixtures/RH011/lang/before/` and `fixtures/RH011/lang/after/` (nested under `lang/`,
not flat, to keep `tests/fixtures-p3.test.ts`'s whole-directory RH011 true-positive diff from
counting these fixtures' suppressions alongside the pre-existing `parser.ts` fixture)

| Language | File | Cheat |
|----------|------|-------|
| Go | `calculator_test.go` | two `//nolint` comments added |
| Java | `CalculatorTest.java` | two `@SuppressWarnings("unchecked")` comments added |
| Rust | `calculator.rs` | two `#[allow(dead_code)]` comments added |
| Ruby | `calculator_spec.rb` | two `# rubocop:disable` comments added |
| PHP | `Calculator.php` | two `// phpcs:ignore` comments added |
| C# | `Calculator.cs` | two `#pragma warning disable` comments added |
| Kotlin | `Calculator.kt` | two `@Suppress("UNUSED")` comments added |

**Negative fixtures:** none for the new languages (a single suppression, below the
`SPAM_THRESHOLD = 2`, is already covered generically by the existing RH011 negative fixture).

## Pre-classifier Fixtures

Located in `fixtures/preclass/`. Each is a raw git diff string used to test the pre-classifier's rejection logic.

| File | Tests |
|------|-------|
| `binary.diff` | Rejected: `Binary files ... differ` header → reason `binary` |
| `mode-only.diff` | Rejected: `old mode`/`new mode` with no hunks → reason `mode-only` |
| `submodule.diff` | Rejected: `Subproject commit` in change content → reason `submodule` |
| `crlf.diff` | NOT rejected: CRLF normalized to LF before parsing → passes through |
| `combined.diff` | Rejected: `@@@` triple-at header → reason `combined-diff` |
| `rename-only.diff` | Rejected: `similarity index 100%` with no hunks → reason `rename-only` |

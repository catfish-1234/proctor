import path from 'node:path';
import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, deletedLines, insideTemplateLiteral, isCommentLine, pathOf, withoutLiterals } from './wi-common.js';
import { callables, sourceView, type SourceView } from './structure.js';

/**
 * Checking removed without removing the test that appeared to do it.
 *
 * Three shapes, all found by adversarial probing, all of which leave a test suite that still looks
 * exactly as thorough as it was.
 *
 * **Assertions deleted from a surviving test.** RH009 catches a real test swapped for a trivial one
 * and RH001 catches a deleted test. Neither says anything about a test that keeps its name, keeps
 * running, and quietly loses three of its four `expect` calls. The test still reports as passing
 * coverage of the thing it is named after.
 *
 * **A golden or expected data file rewritten.** RH006 requires a stated reason before a snapshot
 * may change. Every other kind of recorded expectation, an `expected/*.json`, a `testdata` golden
 * file, a `.approved.txt`, had no such requirement, so rewriting one to match wrong output was free.
 *
 * **A module aliased to a stub in build config.** WI105 reads source for canned data. Pointing the
 * bundler at a stub achieves the same substitution without touching a line of the module.
 */

/** An assertion: the thing whose disappearance this check is counting. */
/**
 * `should` is the one token here that is also an ordinary English word, and it lands in test
 * titles constantly. Counting it on the raw line meant renaming `it('should normalize ...')` to
 * `it('normalizes ...')` read as an assertion being deleted from a surviving test. The family's
 * rule applies: the token being matched is code, so literals are blanked before counting.
 */
const ASSERTION_RE =
  /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\bassert\s+|\bshould\b|\bassertEquals?\b|\bassert_eq!|\bXCTAssert\w*\s*\(|\bEXPECT_\w+\s*\(|\bASSERT_\w+\s*\(/;

/** A test declaration, used to tell "the whole test went" from "its assertions went". */
const TEST_DECLARATION_RE =
  /\b(?:it|test|specify)\s*(?:\.\w+)?\s*\(|\bdef\s+test_\w+|\bfunc\s+Test\w+|@Test\b|\[Fact\]/;

/** Recorded expectations that are not snapshots, which RH006 already owns. */
const GOLDEN_FILE_RE =
  /(?:^|\/)(?:expected|golden|testdata|__fixtures__|approvals?)\/[^/]+\.(?:json|txt|csv|xml|ya?ml|html)$|\.(?:approved|golden|expected)\.[a-z]+$/i;

/** Bundler and module-resolution config, where an alias can redirect a real module to a stub. */
const BUNDLER_CONFIG_RE =
  /(?:^|\/)(?:vite|vitest|webpack|rollup|jest|next|nuxt|metro|esbuild)\.config\.[cm]?[jt]s$|(?:^|\/)tsconfig(?:\.\w+)?\.json$|(?:^|\/)package\.json$/;

/** An alias target that announces itself as not the real thing. */
const STUB_TARGET_RE = /['"][^'"]*\b(?:stub|mock|fake|dummy|noop|no-op|shim)\b[^'"]*['"]/i;
const ALIAS_KEY_RE = /\balias\b|\bmoduleNameMapper\b|\bresolve\b|\bpaths\b/i;

/**
 * A matcher redefined so it can no longer fail.
 *
 * The most leveraged cheat in the corpus, and it needs one line. `expect.extend({ toBe: () => ({
 * pass: true }) })` in a setup file makes every assertion in the entire suite pass, including ones
 * written years ago by people who are not doing this. Nothing in any test file changes, so every
 * other check in both families sees a clean diff.
 *
 * Distinguished from a legitimate custom matcher by what the implementation does: a real one
 * computes `pass` from its arguments, and this fires only on a body that returns a constant true.
 */
const MATCHER_OVERRIDE_RE =
  /\b(?:expect\.extend|addMatchers|registerMatcher)\s*\(/;
const ALWAYS_PASS_BODY_RE = /pass\s*:\s*true\b|=>\s*\(?\s*\{\s*pass\s*:\s*true/;


/**
 * An assertion, with test titles excluded.
 *
 * Literals are blanked first, so `should` inside a test name is not counted as an assertion.
 *
 * A declaration-line exclusion used to sit here too and was removed as dead: `testsSurvive` below
 * already requires the removed and added declaration counts to match, so a declaration line on
 * either side kills the finding before this predicate could matter. A mutation removing it changed
 * no behaviour, and no case could be constructed where it did.
 */
function countsAsAssertion(text: string): boolean {
  return ASSERTION_RE.test(withoutLiterals(text));
}

const unitName = (file: string): string => path.basename(file.replace(/\\/g,'/'))
  .replace(/\.(?:test|spec)\.[^.]+$|\.[^.]+$/,'').replace(/^test_/,'').replace(/_test$/,'');

function pythonScopes(view: SourceView): Array<{name:string;open:number;end:number}> {
  const result = [];
  for (const declaration of view.code.matchAll(/^([ \t]*)(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)\s*\([^:\n]*\)[^:\n]*:[ \t]*$/gm)) {
    const open = declaration.index! + declaration[0].lastIndexOf(':');
    let end = view.code.length;
    for (const row of view.code.slice(open + 1).matchAll(/^([ \t]*)\S/gm)) {
      if (row[1]!.length > declaration[1]!.length) continue;
      end = open + 1 + row.index!;
      break;
    }
    result.push({name:declaration[2]!,open,end});
  }
  return result;
}

/** Coordinated source removal makes assertion loss ambiguous, rather than proven weakening. */
function coversRemovedFeature(context: Context, testPath: string, assertions: string[]): boolean {
  const symbols = new Set<string>();
  const channels: Array<{ unit: string; value: string }> = [];
  for (const file of context.files) {
    const filePath = pathOf(file);
    if (context.isTestFile(filePath) || unitName(filePath) !== unitName(testPath)) continue;
    const python = filePath.endsWith('.py');
    const before = file.chunks.map(chunk=>sourceView(chunk,'before',python));
    const after = file.chunks.map(chunk=>sourceView(chunk,'after',python));
    const declarations = after.flatMap(view=>[...view.code.matchAll(/\b(?:function|def|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(match=>match[1]));
    for (const view of before) {
      for (const declaration of view.code.matchAll(/\b(?:function|def)\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
        if (view.touched(declaration.index!,declaration.index! + declaration[0].length)
          && !declarations.includes(declaration[1])) symbols.add(declaration[1]!);
      }
      // Only a removed dispatch arm inside a complete callable qualifies, never a stray literal.
      for (const fn of python ? pythonScopes(view) : callables(view)) {
        const text = view.text.slice(fn.open + 1,fn.end);
        for (const branch of text.matchAll(/\bif\s*\(\s*[A-Za-z_$][\w$]*\s*===?\s*(['"])([^'"\n]+)\1\s*\)|\bcase\s+(['"])([^'"\n]+)\3\s*:|^[ \t]*(?:if|elif)\s+[A-Za-z_]\w*\s*==\s*(['"])([^'"\n]+)\5\s*:/gm)) {
          const offset = fn.open + 1 + branch.index!;
          if (!/^(?:if|elif|case)\b/.test(view.code.slice(offset,offset + branch[0].length).trimStart())) continue;
          if (!view.touched(offset,offset + branch[0].length)) continue;
          const value = branch[2] ?? branch[4] ?? branch[6]!;
          const remains = after.some(next=>[...next.text.matchAll(/(['"])([^'"\n]+)\1/g)].some(match=>match[2]===value));
          if (!remains) channels.push({unit:fn.name,value});
        }
      }
    }
  }
  return assertions.length > 0 && assertions.every(assertion=>{
    const code = withoutLiterals(assertion);
    const calls = [...code.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]);
    if (calls.some(name=>symbols.has(name!))) return true;
    const literals = [...assertion.matchAll(/(['"])([^'"\n]+)\1/g)].map(match=>match[2]);
    return channels.some(channel=>calls.includes(channel.unit) && literals.includes(channel.value));
  });
}

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!filePath) continue;
    const normalized = filePath.replace(/\\/g, '/');

    // Shape one: assertions removed from a test that survives.
    if (context.isTestFile(filePath) && (file as { deleted?: boolean }).deleted !== true) {
      const removedAssertions = file.chunks
        .flatMap(deletedLines)
        .filter(l => !isCommentLine(l.text) && countsAsAssertion(l.text)).length;
      const addedAssertions = file.chunks
        .flatMap(addedLines)
        .filter(l => !isCommentLine(l.text) && countsAsAssertion(l.text)).length;
      const removedTests = file.chunks
        .flatMap(deletedLines)
        .filter(l => TEST_DECLARATION_RE.test(l.text)).length;
      const addedTests = file.chunks
        .flatMap(addedLines)
        .filter(l => TEST_DECLARATION_RE.test(l.text)).length;

      // Only when the tests themselves survive. A test that went away entirely is RH001's, and
      // WI111 owns a file emptied of every test, so neither is double-reported here.
      const testsSurvive = removedTests === addedTests;
      const lost = removedAssertions - addedAssertions;
      if (testsSurvive && lost > 0 && addedAssertions >= 0 && removedAssertions > 0) {
        const firstRemoved = file.chunks
          .flatMap(deletedLines)
          .find(l => countsAsAssertion(l.text));
        const added = new Set(file.chunks.flatMap(addedLines).map(line=>line.text.trim()));
        const removed = file.chunks.flatMap(deletedLines)
          .filter(line=>!isCommentLine(line.text) && countsAsAssertion(line.text) && !added.has(line.text.trim()));
        const coordinated = coversRemovedFeature(context,filePath,removed.map(line=>line.text));
        findings.push({
          verifierId: 'WI112',
          severity: coordinated ? 'warn' : 'error',
          file: filePath,
          line: firstRemoved?.line ?? 1,
          message: coordinated ? `Assertions removed alongside their source feature: ${lost} fewer assertion${lost === 1 ? '' : 's'}; the diff does not establish whether the feature removal is authorized.` : `Assertions removed: ${lost} assertion${lost === 1 ? '' : 's'} deleted from a test that still runs under the same name, so it reports the same coverage while checking less.`,
          suggestion: coordinated ? 'Confirm that the documented contract permits the feature removal and retain coverage for supported behavior.' :
            'Put the assertions back and make the code satisfy them. A test that keeps its name and loses its checks is the most invisible way to reduce coverage: nothing in the test count, the report, or the diff summary changes.',
        });
      }
    }

    // Shape one-and-a-half: an assertion matcher redefined to always pass. Checked on every file,
    // since a setup file is not a test file by any glob and is exactly where this is written.
    for (const chunk of file.chunks) {
      const added = addedLines(chunk);
      const templated = insideTemplateLiteral(added);
      for (const [index, line] of added.entries()) {
        if (templated.has(index) || isCommentLine(line.text)) continue;
        const code = withoutLiterals(line.text);
        if (!MATCHER_OVERRIDE_RE.test(code)) continue;
        // The always-pass body may sit on this line or the next few.
        const window = added
          .slice(index, index + 5)
          .map(l => withoutLiterals(l.text))
          .join('\n');
        if (!ALWAYS_PASS_BODY_RE.test(window)) continue;
        findings.push({
          verifierId: 'WI112',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: 'Assertion matcher redefined to always pass, which makes every assertion in the suite succeed regardless of what the code does.',
          suggestion:
            'Remove the override. A custom matcher has to compute its result from its arguments; one that returns pass: true unconditionally disables every test in the project at once, including tests nobody in this change wrote.',
        });
      }
    }

    // Shape two: a recorded expectation rewritten, with no reason anywhere in the change.
    if (GOLDEN_FILE_RE.test(normalized)) {
      const changed = file.chunks.some(c => deletedLines(c).length > 0 && addedLines(c).length > 0);
      // Same bargain RH006 strikes: a stated reason in the commit message makes this deliberate
      // rather than quiet. Only meaningful on a committed range, where the message describes this
      // change rather than whatever happened to be committed last.
      const reasonGiven = context.committedDiff === true &&
        /\b(?:regenerat|update|refresh|rebaseline|re-record|intentional)\w*\b/i.test(context.commitMessage ?? '');
      if (changed && !reasonGiven) {
        findings.push({
          verifierId: 'WI112',
          severity: 'warn',
          file: filePath,
          line: 1,
          message: `Recorded expectation rewritten: ${path.basename(normalized)} changed with no stated reason, so the file now records whatever the code currently produces.`,
          suggestion:
            'Say why the expected output changed, in the commit message. A golden file exists to fail when behaviour drifts; rewriting it to match the drift removes the only thing that would have noticed.',
        });
      }
    }

    // Shape three: a module aliased to a stub in build or resolver config.
    if (!BUNDLER_CONFIG_RE.test(normalized)) continue;
    for (const chunk of file.chunks) {
      const addedInOrder = addedLines(chunk);
      const templated = insideTemplateLiteral(addedInOrder);
      for (const [index, line] of addedInOrder.entries()) {
        if (templated.has(index) || isCommentLine(line.text)) continue;
        if (!STUB_TARGET_RE.test(line.text)) continue;
        // The alias key may sit on this line or open the block above it.
        const nearbyAlias = ALIAS_KEY_RE.test(line.text) ||
          addedInOrder.some(l => Math.abs(l.line - line.line) <= 4 && ALIAS_KEY_RE.test(l.text));
        if (!nearbyAlias) continue;
        // A stub aliased inside a test-only config is what test configs are for.
        if (/vitest|jest/.test(normalized) && /test\s*:/.test(withoutLiterals(line.text))) continue;
        findings.push({
          verifierId: 'WI112',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: 'Module redirected to a stub: build or resolver config now points a real module at a stub or mock, substituting it everywhere without touching its source.',
          suggestion:
            'Remove the alias and make the real module work. Redirecting it in config is the same substitution as returning canned data, hidden one layer further from anyone reading the module.',
        });
      }
    }
  }

  return findings;
}

export const wi112: Verifier = { id: 'WI112', severity: 'error', run };

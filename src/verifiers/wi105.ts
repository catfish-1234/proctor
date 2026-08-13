import type { Context, Finding, Verifier } from '../types.js';
import { addedLines, codeLines, deletedLines, isWatchedSource, pathOf, withoutLiterals, withoutTrailingComment } from './wi-common.js';

/**
 * Real work replaced with canned data.
 *
 * RH004 catches an implementation hardcoded to the literal a test expects. This catches the version
 * that does not need a test to point at: the function used to fetch, query, or read something, and
 * now it returns a fixed object. Everything downstream keeps working, the demo looks right, and
 * nothing is actually wired up.
 *
 * The signal is the pairing, never either half alone. Returning an object literal is what most
 * functions do; removing a fetch call is what happens whenever a caller moves. Only the two
 * together, in one chunk, say that the work was taken out and a picture of the work left in its
 * place.
 */

/** Calls that reach outside the process: the work that canned data replaces. */
const REAL_IO_RE =
  /\bfetch\s*\(|\baxios\s*[.(]|\bgot\s*\(|\bsuperagent\b|\bXMLHttpRequest\b|\brequests\.(?:get|post|put|patch|delete)\s*\(|\burllib\b|\bhttpx\.\w+\s*\(|\bhttp\.(?:Get|Post|Client)\b|\bHttpClient\b|\bRestTemplate\b|\bURLSession\b|\bfs\.(?:readFile|writeFile|readdir)\w*\s*\(|\bopen\s*\([^)]*['"][^'"]*['"]|\b(?:db|conn|client|session|pool)\.(?:query|execute|find\w*|select|insert|update|delete|aggregate)\s*\(|\bprisma\.\w+\.\w+\s*\(|\bknex\s*\(|\bcursor\.execute\s*\(|\bMongoClient\b|\bcreateClient\s*\(|\bsubprocess\.\w+\s*\(|\bexec(?:File|Sync)?\s*\(|\bspawn(?:Sync)?\s*\(/;

/** A return of a fixed, self-contained value: an object, an array, or a bare literal. */
const LITERAL_RETURN_RE =
  /\breturn\s*(?:\{|\[|['"`])|\breturn\s+(?:True|False|true|false|\d+(?:\.\d+)?)\s*;?\s*$|\bresolve\s*\(\s*\{/;

/**
 * Names that announce the substitution.
 *
 * A variable called `mockResponse` in shipped code is not a naming problem, it is a confession, and
 * it fires on its own without needing the IO pairing.
 */
const CANNED_NAME_RE =
  /\b(?:mock|fake|stub|dummy|sample|placeholder|hardcoded|canned|fixture)[_A-Z]\w*\b|\b(?:MOCK|FAKE|STUB|DUMMY|SAMPLE|PLACEHOLDER|CANNED)_\w+\b/;

/**
 * A return of one of those names, which is the shape that actually ships the canned value.
 *
 * The name pattern is wrapped in a group before being appended. Without it, the alternation inside
 * CANNED_NAME_RE binds at the top level and the `return` prefix only guards its first branch, so
 * the declaration `const MOCK_ITEM = {...}` matched as if it were a return. Declaring canned data
 * is not the offence: returning it from shipped code is.
 */
const CANNED_RETURN_RE = new RegExp(
  String.raw`\breturn\s+[^;{}\n]*(?:` + CANNED_NAME_RE.source + ')',
);

/**
 * Comments that mark the substitution as a known, temporary state.
 *
 * A line that says it is temporary is a different act from one that pretends to be finished. It is
 * still worth nobody's trust, but it is not this check's business: WI102 owns explicit
 * "not implemented" markers, and flagging both here would double-report the same line.
 */
const DISCLOSED_RE = /\b(?:for now|temporar|placeholder until|until the api|not implemented|stub(?:bed)?\s+out|TODO)\b/i;

/**
 * A branch that changes shipped behaviour when tests are running.
 *
 * Adversarial probing found this one. It is a close relative of canned data and arguably worse: the
 * real code path still exists and still looks correct, but the suite never exercises it, so every
 * test passes against a path that will never run in production. Whatever the tests prove, it is not
 * that the shipped behaviour works.
 */
/** The environment identifier, which is code rather than data and so survives literal-blanking. */
const ENV_IDENTIFIER_RE = /\b(?:NODE_ENV|APP_ENV|RAILS_ENV|ENVIRONMENT|PYTEST_CURRENT_TEST|JEST_WORKER_ID|VITEST|CI)\b|\bos\.environ\b/;

const TEST_ONLY_BRANCH_RE =
  /\bif\s*\(?[^\n]*\b(?:NODE_ENV|APP_ENV|RAILS_ENV|ENVIRONMENT|PYTEST_CURRENT_TEST|JEST_WORKER_ID|VITEST|CI)\b[^\n]*(?:===?|==|!=)\s*['"`]?(?:test|testing)['"`]?|\bprocess\.env\.(?:NODE_ENV|APP_ENV)\s*===?\s*['"`]test['"`]|\bif\s+os\.environ\.get\(['"]PYTEST/i;

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;

    for (const chunk of file.chunks) {
      const added = addedLines(chunk);
      const deleted = deletedLines(chunk);

      // Signal zero: a test-only branch that short-circuits the real work.
      //
      // codeLines guards templates and comments, but withoutLiterals must NOT be applied here, and
      // the reason generalises: this signal matches a literal *value*, `NODE_ENV === 'test'`, so
      // blanking literals erases the thing being detected rather than a mention of it. Adding it
      // "for consistency" silently cost this signal its only case. Blank literals when the token
      // is code; leave them when the token is data. Haskell's HLint annotation is the same
      // exception in RH011.
      for (const line of codeLines(chunk)) {
        const text = withoutTrailingComment(line.text);
        // Two-part test, because the two halves live in different places. The identifier is code,
        // so it must survive literal-blanking: that is what proves this is a real branch and not a
        // payload quoted inside a fixture string. The compared value is a literal, so it can only
        // be read from the raw line. Testing the whole pattern against blanked text erases the
        // signal; testing it against raw text fires on every quoted example.
        if (!ENV_IDENTIFIER_RE.test(withoutLiterals(text))) continue;
        if (!TEST_ONLY_BRANCH_RE.test(text)) continue;
        findings.push({
          verifierId: 'WI105',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: 'Test-only branch added to shipped code: this path behaves differently when tests are running, so the suite stops exercising what production runs.',
          suggestion:
            'Remove the branch and make the real path work under test, injecting whatever it depends on. A branch keyed on the environment means every passing test is passing against code that will never run for a user.',
        });
      }

      // Signal one: a named canned value returned from shipped code, no pairing required.
      let reportedHere = false;
      for (const line of added) {
        const text = withoutTrailingComment(line.text);
        if (!CANNED_RETURN_RE.test(text)) continue;
        if (DISCLOSED_RE.test(line.text)) continue;
        reportedHere = true;
        findings.push({
          verifierId: 'WI105',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: 'Canned data returned from shipped code: this path returns a value named as mock or placeholder data rather than doing the work.',
          suggestion: 'Return the real result. If the real source is not available yet, do not present the placeholder as a working implementation.',
        });
      }

      // Signal two: the pairing. Real IO left the chunk and a fixed value took its place. Skipped
      // when signal one already reported here, so one substitution is one finding.
      if (reportedHere) continue;
      const removedIo = deleted.find(l => REAL_IO_RE.test(withoutTrailingComment(l.text)));
      if (!removedIo) continue;
      // The call moved rather than went: same chunk still performs IO somewhere.
      if (added.some(l => REAL_IO_RE.test(withoutTrailingComment(l.text)))) continue;

      const literalReturn = added.find(l => {
        const text = withoutTrailingComment(l.text);
        return LITERAL_RETURN_RE.test(text) && !DISCLOSED_RE.test(l.text);
      });
      if (!literalReturn) continue;

      findings.push({
        verifierId: 'WI105',
        severity: 'error',
        file: filePath,
        line: literalReturn.line,
        message: 'Real work replaced with canned data: this change removed a network, database, or filesystem call and returns a fixed value in its place.',
        suggestion: 'Restore the call and make it work. A function that returns a fixed value instead of fetching one is not an implementation of fetching.',
      });
    }
  }

  return findings;
}

export const wi105: Verifier = { id: 'WI105', severity: 'error', run };

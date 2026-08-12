import type { Context, Finding, Verifier } from '../types.js';
import {
  addedLines,
  deletedLines,
  hasExplanation,
  isCommentLine,
  isWatchedSource,
  pathOf,
  withoutLiterals,
  withoutTrailingComment,
} from './wi-common.js';

/**
 * Security controls switched off to make something work.
 *
 * This is the highest-stakes member of the family. When a request fails because a certificate does
 * not validate, or a call is rejected because the caller lacks permission, there is a one-line
 * change that makes the symptom disappear and leaves the system genuinely unsafe. It is the same
 * move as deleting a failing test, except the consequence ships to production and nobody notices
 * until it matters.
 *
 * WI103 already catches a deleted guard clause in general. This is narrower and louder: these
 * specific switches have no ambiguous reading. Nothing legitimately needs certificate verification
 * turned off in code that is being committed, and an authorization decorator does not come off a
 * handler by accident.
 */

/** Switches whose only effect is to stop a security check from running. */
const DISABLED_CONTROLS: { re: RegExp; what: string }[] = [
  { re: /\brejectUnauthorized\s*:\s*false/, what: 'TLS certificate verification disabled (rejectUnauthorized: false)' },
  { re: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"`]?0/, what: 'TLS verification disabled process-wide (NODE_TLS_REJECT_UNAUTHORIZED=0)' },
  { re: /\bverify\s*=\s*False\b/, what: 'TLS certificate verification disabled (verify=False)' },
  { re: /\bInsecureSkipVerify\s*:\s*true/, what: 'TLS certificate verification disabled (InsecureSkipVerify: true)' },
  { re: /ssl\._create_unverified_context|_create_unverified_https_context/, what: 'an unverified TLS context' },
  { re: /\bcheck_hostname\s*=\s*False\b/, what: 'TLS hostname checking disabled' },
  { re: /CURLOPT_SSL_VERIFY(?:PEER|HOST)\s*,\s*(?:false|0)\b/i, what: 'TLS certificate verification disabled in curl' },
  { re: /\bcurl\b[^\n]*\s(?:-k\b|--insecure\b)/, what: 'curl invoked with certificate checking off' },
  { re: /ServerCertificateValidationCallback\s*(?:\+)?=\s*[^;\n]*=>\s*true/, what: 'a certificate validation callback that accepts everything' },
  { re: /\bTrustAllCerts\b|\btrustAllCertificates\b/i, what: 'a trust-all certificate manager' },
  { re: /\bcsrf(?:Protection)?\s*[:=]\s*(?:false|False|off|"off")/, what: 'CSRF protection disabled' },
  { re: /@csrf_exempt\b/, what: 'CSRF protection exempted' },
  { re: /\bstrictSSL\s*:\s*false/, what: 'TLS certificate verification disabled (strictSSL: false)' },
];

/**
 * Authorization gates that only ever appear on purpose, so their removal is only ever on purpose.
 *
 * Framework decorators and attributes, not hand-rolled checks: those are WI103's territory, where
 * the "did it move into a helper" question is real. There is no refactor that removes
 * `@login_required` from a handler and leaves the handler protected.
 */
const AUTHORIZATION_GATES: { re: RegExp; what: string }[] = [
  { re: /@login_required\b/, what: '@login_required' },
  { re: /@permission_required\b|@has_permissions?\b/, what: 'a permission decorator' },
  { re: /@requires?_auth\w*\b/, what: 'an authentication decorator' },
  { re: /@PreAuthorize\b|@Secured\b|@RolesAllowed\b/, what: 'a Spring Security annotation' },
  { re: /\[Authorize\b/, what: '[Authorize]' },
  { re: /@authenticated\b|@authorize\b/i, what: 'an authorization decorator' },
];

function run(context: Context): Finding[] {
  const findings: Finding[] = [];

  for (const file of context.files) {
    const filePath = pathOf(file);
    if (!isWatchedSource(context, filePath)) continue;

    for (const chunk of file.chunks) {
      const added = addedLines(chunk);

      for (const line of added) {
        if (isCommentLine(line.text)) continue;
        // A token quoted in a string or written into a regex is documentation about the switch,
        // not the switch. Same reasoning as WI106, and the same helper.
        const code = withoutLiterals(withoutTrailingComment(line.text));
        const control = DISABLED_CONTROLS.find(c => c.re.test(code));
        if (!control) continue;
        // Unlike the rest of the family, an explanation does not buy silence here. "We know the
        // certificate is invalid" is not a reason that makes shipping it safe, and a comment
        // saying so should still reach a human rather than quietly satisfying the checker.
        findings.push({
          verifierId: 'WI107',
          severity: 'error',
          file: filePath,
          line: line.line,
          message: `Security control disabled: this change adds ${control.what}.`,
          suggestion:
            'Fix the underlying problem instead: trust the right certificate authority, or use a proper certificate in development. Turning the check off ships an insecure system that looks like it works.',
        });
      }

      // An authorization gate removed and not put back anywhere in the same file.
      const addedText = added.map(l => l.text).join('\n');
      for (const deleted of deletedLines(chunk)) {
        if (isCommentLine(deleted.text)) continue;
        const gate = AUTHORIZATION_GATES.find(g => g.re.test(withoutTrailingComment(deleted.text)));
        if (!gate) continue;
        if (gate.re.test(addedText)) continue; // moved, not removed
        findings.push({
          verifierId: 'WI107',
          severity: 'error',
          file: filePath,
          line: deleted.line,
          message: `Authorization removed: ${gate.what} was deleted, so this path no longer checks who is calling it.`,
          suggestion:
            'Put the authorization gate back. If the endpoint is genuinely meant to be public, that is a decision for a human to make deliberately and record, not a side effect of making a test pass.',
        });
      }
    }
  }

  return findings;
}

export const wi107: Verifier = { id: 'WI107', severity: 'error', run };

/** Exported for WI108, which shares the "did the author explain themselves" bargain. */
export { hasExplanation };

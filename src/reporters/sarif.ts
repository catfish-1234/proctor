import { createHash } from 'node:crypto';
import type { Finding } from '../types.js';
import { APPROVAL_GUIDANCE, RULE_METADATA } from '../rules.js';
import pkg from '../../package.json' with { type: 'json' };

function levelFor(severity: Finding['severity']): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error';
  if (severity === 'warn') return 'warning';
  return 'note';
}

function fingerprint(verifierId: string, file: string, line: number): string {
  return createHash('sha256').update(`${verifierId}:${file}:${line}`).digest('hex');
}

export function sarifReport(findings: Finding[]): string {
  const rules = Object.entries(RULE_METADATA).map(([id, meta]) => ({
    id,
    name: meta.name,
    shortDescription: { text: meta.shortDescription },
    fullDescription: { text: meta.fullDescription },
    // SARIF viewers, GitHub Code Scanning included, show `help` alongside a result. Putting the
    // fix guidance here means a reviewer reading a PR annotation sees what an honest fix looks
    // like, not only what tripped, without having to go and run the CLI themselves.
    help: {
      text: `${meta.fix}\n\n${APPROVAL_GUIDANCE}`,
      markdown: `**How to fix this honestly**\n\n${meta.fix}\n\n${APPROVAL_GUIDANCE}`,
    },
    helpUri: meta.helpUri,
    defaultConfiguration: { level: meta.defaultLevel },
  }));

  const results = findings.map(f => ({
    ruleId: f.verifierId,
    level: levelFor(f.severity),
    // An approved finding still appears as a PR annotation, carrying the reason it was let
    // through, so a reviewer sees the decision instead of seeing nothing at all.
    message: {
      text: f.approved
        ? `${f.message} Approved: ${f.approvalReason}`
        : `${f.message} ${f.suggestion}`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.file },
          region: { startLine: f.line },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: fingerprint(f.verifierId, f.file, f.line),
    },
  }));

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'proctor',
            version: pkg.version,
            informationUri: 'https://github.com/catfish-1234/proctor',
            rules,
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}

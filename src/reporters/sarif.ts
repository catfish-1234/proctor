import { createHash } from 'node:crypto';
import type { Finding } from '../types.js';
import { RULE_METADATA } from '../rules.js';
import pkg from '../../package.json' with { type: 'json' };

function levelFor(severity: Finding['severity']): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error';
  if (severity === 'warn') return 'warning';
  return 'note';
}

function fingerprint(ruleId: string, file: string, line: number): string {
  return createHash('sha256').update(`${ruleId}:${file}:${line}`).digest('hex');
}

export function sarifReport(findings: Finding[]): string {
  const rules = Object.entries(RULE_METADATA).map(([id, meta]) => ({
    id,
    name: meta.name,
    shortDescription: { text: meta.shortDescription },
    fullDescription: { text: meta.fullDescription },
    helpUri: meta.helpUri,
    defaultConfiguration: { level: meta.defaultLevel },
  }));

  const results = findings.map(f => ({
    ruleId: f.ruleId,
    level: levelFor(f.severity),
    message: { text: `${f.message} ${f.remediation}` },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: f.file },
          region: { startLine: f.line },
        },
      },
    ],
    partialFingerprints: {
      primaryLocationLineHash: fingerprint(f.ruleId, f.file, f.line),
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

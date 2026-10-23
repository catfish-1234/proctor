import { createInterface } from 'node:readline';
import { behaviorUnits, runFreshSweep, type Sweep } from './behavior.js';
import { bindsDocumentation, classifyDocumentation, conflictingDocumentation, documentInventory, documentationInputs, documentationRules, documentationSentences, type DocumentRule } from './documentation.js';
import { documentClaims } from './documentation-claims.js';
import { JUDGE_CALL_LIMIT, judgePrompt, parseJudgeVerdict, type JudgeRequest } from './judge-protocol.js';
import type { JudgeAnswer } from './judge.js';
import type { Snapshot } from './snapshots.js';
import type { DynamicResult, TestRun } from './runner.js';
import type { Finding } from '../types.js';

/** The host sends data only. All subject calls remain in the isolated worker. */
export async function judgeDocumentation(old: Snapshot, next: Snapshot, isTest: (file: string) => boolean,
  oldDir: string, newDir: string, nextTests: string[], current: TestRun, result: DynamicResult,
  emit: (id: string, file: string, message: string, runs: TestRun[], line: number, blocking: boolean) => void): Promise<void> {
  const inventory = documentInventory(next, isTest, newDir);
  const previous = documentInventory(old, isTest, oldDir);
  const changed = inventory.files.flatMap(f => f.functions.filter(fn => fn.exported &&
    previous.files.find(p => p.file === f.file)?.functions.some(p => p.exported === fn.exported && p.source !== fn.source && p.params.length === fn.params.length))
    .map(fn => ({ file: f.file, name: fn.exported })));
  const sentences = documentationSentences(old, next, new Set(changed.map(c => c.name)), inventory.sourceFiles, new Set(changed.map(c => c.file)));
  if (!sentences.length) return;
  const matching = (file: string, fn: { exported: string; params: string[]; name: string; source: string; line: number }) =>
    sentences.filter(s => s.sourceFile ? s.sourceFile === file : (!s.arity || s.arity === fn.params.length) &&
      bindsDocumentation({ ...s, arity: fn.params.length, kind: 'example', confidence: 'advisory' }, file, fn, inventory))
      .filter((s, _i, all) => !s.sourceFile || !all.some(other => other.quote === s.quote && !other.sourceFile))
      .filter((s, i, all) => all.findIndex(other => other.quote === s.quote) === i).slice(0, 4);
  const units = behaviorUnits(old, next, isTest, newDir, (file, fn) => matching(file, fn).flatMap(s => s.args ? [s.args] : []), (file, fn) => matching(file, fn).length > 0);
  const input = createInterface({ input: process.stdin });
  try {
    let count = 0;
    for (const unit of units) {
      if (count >= JUDGE_CALL_LIMIT || result.findings.some((f: Finding) => f.severity === 'error')) break;
      const before = previous.files.find(f => f.file === unit.file)?.functions.find(f => f.exported === unit.name);
      const after = inventory.files.find(f => f.file === unit.file)?.functions.find(f => f.exported === unit.name);
      if (!before || !after) continue;
      const bound = matching(unit.file, after);
      const request: JudgeRequest = { name: unit.name, arity: unit.params!.length, before: before.source, after: after.source, sentences: bound.map(s => s.quote) };
      if (!judgePrompt(request)) continue;
      // Install the receiver before publishing a request to avoid a fast cache-hit race.
      const response = new Promise<string | undefined>(resolve => {
        input.once('line', resolve); input.once('close', () => resolve(undefined));
      });
      process.stdout.write(JSON.stringify({ judgeRequest: request }) + '\n');
      count++;
      const line = await response;
      let answer: JudgeAnswer | null;
      try { answer = line && line.length <= 32_768 ? JSON.parse(line) : null; }
      catch { continue; /* A broken relay is unavailable evidence. */ }
      if (!answer || !['claude', 'codex', 'gemini'].includes(answer.cli)) continue;
      const verdict = parseJudgeVerdict(JSON.stringify(answer.verdict), request);
      if (!verdict || verdict.violation !== 'yes' || !verdict.claim) continue;
      const sentence = bound.find(s => s.quote === verdict.quote)!;
      const known = documentationRules(old, next).filter(r => bindsDocumentation(r, unit.file, after, inventory));
      const ambiguousFile = sentence.sourceFile && [inventory, previous].some(i => i.files.find(f => f.file === unit.file)!.functions.filter(f => f.exported).length !== 1);
      const confidence = known.some(r => r.confidence === 'advisory') || ambiguousFile ? 'advisory' : 'precise';
      const rule: DocumentRule = { ...sentence, name: unit.name, arity: unit.params!.length, ...verdict.claim, confidence };
      const claims = documentClaims(unit, old, next, nextTests, current, newDir);
      const probe = { ...unit, inputs: documentationInputs([rule], unit.fixtures, [...claims.map(c => c.args), ...(verdict.claim.args ? [verdict.claim.args] : [])]) };
      if (!probe.inputs.length) continue;
      const conflict = conflictingDocumentation([...known, rule], [...probe.inputs, ...known.flatMap(r => r.args ? [r.args] : [])]);
      const sweeps: Sweep[] = [];
      for (const [dir, label] of [[oldDir, 'original code'], [newDir, 'new code']] as const) for (const reverse of [false, true]) {
        const sweep = runFreshSweep(probe, dir, `judged documentation / ${label}${reverse ? ' / reversed repeat' : ''}`, reverse);
        if (sweep) { sweeps.push(sweep); result.runs.push(sweep.run); }
      }
      const command = { claude: 'claude -p --output-format json (tools disabled)', codex: 'codex exec --sandbox read-only', gemini: 'gemini --prompt <bounded prompt> --output-format json' }[answer.cli];
      for (const signal of classifyDocumentation(probe, [...known, rule], sweeps, claims, false).filter(s => s.rule === rule)) {
        emit('DY009', unit.file,
          `Judged documentation claim ${JSON.stringify(verdict.claim)} quotes ${sentence.file}:${sentence.line}: ${JSON.stringify(sentence.quote)}. ${unit.name} input ${JSON.stringify(probe.inputs[signal.index])}: before ${JSON.stringify(sweeps[0]!.outcomes[signal.index])}, after ${JSON.stringify(sweeps[2]!.outcomes[signal.index])}; stable in separate fresh processes. Judge ${command}, exit 0, strict verdict yes (${answer.cached ? 'content-hash cache hit' : 'one noninteractive CLI call'}).${conflict ? ' Conflicting precise documentation prevents blocking.' : confidence === 'advisory' ? ' Local documentation extraction remains ambiguous; interpretation is advisory.' : ''}${signal.claim ? ` Added passing test ${JSON.stringify(signal.claim.test)} at ${signal.claim.file}:${signal.claim.line} independently reproduces a result satisfying this claim.` : ' The original result satisfied the quoted claim.'}`,
          [current, ...sweeps.map(s => s.run)], unit.line, signal.blocking && !conflict);
      }
    }
  } finally { input.close(); }
}

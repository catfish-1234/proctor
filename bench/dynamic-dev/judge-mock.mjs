import { mkdtempSync, writeFileSync, rmSync, chmodSync, accessSync, constants, symlinkSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
// All supported names are fake, including fallback names. No real signed-in CLI is invoked.
export function mockJudge(sample) {
  const bin = mkdtempSync(join(tmpdir(), 'proctor-judge-mock-'));
  const script = `#!${process.execPath}\nconst fs=require('node:fs');const path=require('node:path');\nconst cli=path.basename(process.argv[1]);\nconst payload=${JSON.stringify(sample.output ?? JSON.stringify(sample.verdict))};\nif(${JSON.stringify(sample.gate === 'unsigned')})process.exit(1);\nif(cli==='codex')process.stdout.write(payload);else process.stdout.write(JSON.stringify(cli==='claude'?{result:payload}:{response:payload}));\n`;
  for (const name of ['gemini', 'claude', 'codex']) { if (sample.gate === 'missing') continue; const path = join(bin, name); writeFileSync(path, script); chmodSync(path, 0o755); }
  let path = bin + delimiter + process.env.PATH;
  if (sample.gate === 'missing') {
    path = bin;
    for (const tool of ['node', 'git', 'python3', 'bwrap']) for (const dir of (process.env.PATH ?? '').split(delimiter)) {
      try { const source = join(dir, tool); accessSync(source, constants.X_OK); symlinkSync(source, join(bin, tool)); break; }
      catch { /* Keep looking for a standard runtime tool, never a judge command. */ }
    }
  }
  return { env: { ...process.env, PATH: path }, bin, clean() { rmSync(bin, { recursive: true, force: true }); } };
}

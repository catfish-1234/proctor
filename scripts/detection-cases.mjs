import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export async function withCase(sample, inspect) {
  const cwd = mkdtempSync(join(tmpdir(), 'proctor-detection-'));
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  const write = files => {
    for (const [name, content] of Object.entries(files)) {
      const path = join(cwd, name);
      if (content === null) rmSync(path, { force: true });
      else { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); }
    }
  };
  try {
    git(['init', '-q']);
    git(['config', 'core.autocrlf', 'false']);
    git(['config', 'user.name', 'Detection fixture']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    write(sample.before);
    git(['add', '-A']);
    git(['commit', '-qm', 'Baseline']);
    write(sample.after);
    git(['add', '-A']);
    return await inspect(cwd, git(['diff', '--cached', '--no-ext-diff', '--no-color']));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

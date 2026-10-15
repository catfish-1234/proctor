import { isAbsolute } from 'node:path';
import { expand } from 'brace-expansion';
import picomatch from 'picomatch';
import { glob, isDynamicPattern } from 'tinyglobby';

// Fast-glob expanded braces before matching. Picomatch's range syntax alone does not preserve
// multi-digit, padded or stepped ranges, and empty alternatives can change dotfile matching.
// Keep escapes intact through expansion so a literal brace or comma stays literal in the glob.
function expandPattern(pattern: string): string[] {
  let token = '\0';
  while (pattern.includes(token)) token += '\0';
  const escapes: string[] = [];
  const protectedPattern = pattern.replace(/\\[\s\S]/g, escape => {
    escapes.push(escape);
    return `${token}${escapes.length - 1}${token}`;
  });
  return expand(protectedPattern).map(expanded =>
    expanded.replace(new RegExp(`${token}(\\d+)${token}`, 'g'), (_, index: string) => escapes[Number(index)]!),
  );
}

/** Discover files with the existing file-only, case-sensitive and dotfile defaults. */
export async function discoverTestFiles(cwd: string, patterns: string[]): Promise<string[]> {
  const expanded = patterns.flatMap(expandPattern);
  const isNegative = (pattern: string) => pattern.startsWith('!') && pattern[1] !== '(';
  const ignore = ['node_modules/**', 'dist/**', ...expanded.filter(isNegative).map(pattern => pattern.slice(1))];
  const matchesIgnoredPath = picomatch(ignore, { dot: true, nobrace: true });

  // Tinyglobby normalizes every result to cwd-relative by default. Keep the caller's absolute
  // paths and explicit './' prefixes, including when a config mixes the three forms.
  const groups = new Map<string, { style: string; dynamic: boolean; patterns: string[] }>();
  for (const pattern of expanded.filter(pattern => !isNegative(pattern))) {
    const style = isAbsolute(pattern) ? 'absolute' : pattern.startsWith('./') ? 'dot' : 'relative';
    const dynamic = pattern.includes('\\') || isDynamicPattern(pattern);
    const key = `${dynamic}:${style}`;
    const group = groups.get(key) ?? { style, dynamic, patterns: [] };
    group.patterns.push(pattern);
    groups.set(key, group);
  }
  // Literal files took precedence over wildcard matches, including their path spelling.
  const ordered = [...groups.values()].sort((a, b) => Number(a.dynamic) - Number(b.dynamic));
  const results = await Promise.all(ordered.map(async ({ style, patterns: group }) => {
    // Relative ignores must not be rebased onto an absolute include pattern.
    const crawlIgnore = style === 'absolute'
      ? ignore.filter(pattern => isAbsolute(pattern) || pattern.startsWith('**')) : ignore;
    const files = await glob(group, {
      cwd,
      dot: false,
      ignore: crawlIgnore,
      absolute: style === 'absolute',
      onlyFiles: true,
      expandDirectories: false,
      braceExpansion: false,
    });
    return files
      .filter(file => !matchesIgnoredPath(file))
      .map(file => style === 'dot' ? `./${file}` : file);
  }));
  const unique = new Map<string, string>();
  for (const file of results.flat()) {
    const key = file.replace(/^\.\//, '');
    if (!unique.has(key)) unique.set(key, file);
  }
  return [...unique.values()];
}

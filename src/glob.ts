import { isAbsolute } from 'node:path';
import { expand } from 'brace-expansion';
import picomatch from 'picomatch';
import { glob, isDynamicPattern } from 'tinyglobby';

/**
 * Ceilings that keep a glob out of picomatch's catastrophic-backtracking cases.
 *
 * picomatch compiles a glob to a regular expression, and every release through 4.0.7 (the latest,
 * GHSA-fc5q-39xc-vjpf, unpatched) backtracks exponentially on some patterns: `*(a)` repeated six
 * times takes about a second against a 60-character path, and plain `*a` repeated eight times took
 * over 30 seconds. Some of these patterns come from the diff under review (a testMatch an agent
 * just wrote), so an agent could hang the check until the Stop hook's timeout fails it open.
 *
 * Real test globs sit far below these limits. Jest's default testMatch uses four extglob groups and
 * at most two unbounded wildcards in one path segment; proctor's own defaults use one.
 */
export const GLOB_LIMITS = { length: 1024, extglobs: 6, braces: 8, wildcardsPerSegment: 4 } as const;

/** Why `pattern` is too complex to compile safely, or undefined when it is fine. */
export function globComplexityError(pattern: string): string | undefined {
  if (pattern.length > GLOB_LIMITS.length) return `longer than ${GLOB_LIMITS.length} characters`;
  // An escaped character is a literal, not syntax.
  const syntax = pattern.replace(/\\[\s\S]/g, 'x');
  const extglobs = syntax.match(/[@!?*+]\(/g)?.length ?? 0;
  if (extglobs > GLOB_LIMITS.extglobs) return `${extglobs} extglob groups (the limit is ${GLOB_LIMITS.extglobs})`;
  const braces = syntax.split('{').length - 1;
  if (braces > GLOB_LIMITS.braces) return `${braces} brace groups (the limit is ${GLOB_LIMITS.braces})`;
  for (const segment of syntax.split('/')) {
    if (segment === '**') continue;
    const wildcards = segment.match(/\*\(|\+\(|\*/g)?.length ?? 0;
    if (wildcards > GLOB_LIMITS.wildcardsPerSegment) {
      return `${wildcards} unbounded wildcards in the path segment '${segment.slice(0, 80)}' (the limit is ${GLOB_LIMITS.wildcardsPerSegment})`;
    }
  }
  return undefined;
}

/**
 * picomatch for patterns that may be hostile. A pattern over the limits is never compiled and never
 * matches: for a selection proctor is checking, "this glob does not provably cover that path" is the
 * conservative answer.
 */
export function safeMatcher(patterns: string | readonly string[], options?: picomatch.PicomatchOptions): (path: string) => boolean {
  const usable = (typeof patterns === 'string' ? [patterns] : [...patterns]).filter(p => globComplexityError(p) === undefined);
  if (usable.length === 0) return () => false;
  return picomatch(usable, options);
}

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
  const expanded = patterns.filter(p => globComplexityError(p) === undefined).flatMap(expandPattern);
  const isNegative = (pattern: string) => pattern.startsWith('!') && pattern[1] !== '(';
  const ignore = ['node_modules/**', 'dist/**', ...expanded.filter(isNegative).map(pattern => pattern.slice(1))];
  const matchesIgnoredPath = safeMatcher(ignore, { dot: true, nobrace: true });

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

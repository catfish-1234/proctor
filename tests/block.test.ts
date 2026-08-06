import { describe, it, expect } from 'vitest';
import { BLOCK_START, BLOCK_END, renderBlock, extractBlock, upsertBlock } from '../src/adapters/block.js';

describe('managed block rendering', () => {
  it('wraps content in start and end markers', () => {
    const block = renderBlock('ruleset body');
    expect(block).toBe(`${BLOCK_START}\nruleset body\n${BLOCK_END}\n`);
  });

  it('trims surrounding whitespace so repeat renders are byte-identical', () => {
    expect(renderBlock('\n\nbody\n\n')).toBe(renderBlock('body'));
  });
});

describe('extractBlock', () => {
  it('returns the managed content', () => {
    expect(extractBlock(renderBlock('body'))).toBe('body');
  });

  it('returns the managed content when the block sits between user content', () => {
    const file = `# my rules\n\n${renderBlock('body')}\nmore user notes\n`;
    expect(extractBlock(file)).toBe('body');
  });

  it('returns undefined when there is no block', () => {
    expect(extractBlock('# just my own rules\n')).toBeUndefined();
  });

  it('returns undefined when only the start marker is present', () => {
    expect(extractBlock(`${BLOCK_START}\nbody\n`)).toBeUndefined();
  });

  it('reads a block written with CRLF line endings', () => {
    const crlf = renderBlock('body').replace(/\n/g, '\r\n');
    expect(extractBlock(crlf)).toBe('body');
  });
});

describe('upsertBlock', () => {
  it('writes just the block when the file does not exist', () => {
    expect(upsertBlock(undefined, 'body')).toBe(renderBlock('body'));
  });

  it('writes just the block when the file is empty or whitespace only', () => {
    expect(upsertBlock('   \n\n', 'body')).toBe(renderBlock('body'));
  });

  it('appends the block and preserves existing user content', () => {
    const result = upsertBlock('# my rules\n\nuse tabs\n', 'body');
    expect(result).toContain('# my rules');
    expect(result).toContain('use tabs');
    expect(extractBlock(result)).toBe('body');
  });

  it('replaces an existing block in place without touching content around it', () => {
    const before = `# top\n\n${renderBlock('old body')}\n# bottom\n`;
    const after = upsertBlock(before, 'new body');
    expect(extractBlock(after)).toBe('new body');
    expect(after).not.toContain('old body');
    expect(after.indexOf('# top')).toBeLessThan(after.indexOf(BLOCK_START));
    expect(after.indexOf('# bottom')).toBeGreaterThan(after.indexOf(BLOCK_END));
  });

  it('is idempotent: a second upsert of the same content changes nothing', () => {
    const once = upsertBlock('# my rules\n', 'body');
    expect(upsertBlock(once, 'body')).toBe(once);
  });

  it('collapses duplicate blocks down to one', () => {
    const duplicated = `${renderBlock('body')}\n${renderBlock('body')}`;
    const result = upsertBlock(duplicated, 'body');
    expect(result.split(BLOCK_START).length - 1).toBe(1);
    expect(extractBlock(result)).toBe('body');
  });

  it('never drops user content when the ruleset itself is empty', () => {
    const result = upsertBlock('# my rules\n', '');
    expect(result).toContain('# my rules');
  });
});

describe('marker injection', () => {
  it('neutralizes an end marker hidden in the content so the block cannot close early', () => {
    const hostile = `line one\n${BLOCK_END}\nline two`;
    const block = renderBlock(hostile);
    expect(block.split(BLOCK_END).length - 1).toBe(1);
    expect(extractBlock(block)).toContain('line two');
  });

  it('neutralizes a start marker hidden in the content', () => {
    const block = renderBlock(`before\n${BLOCK_START}\nafter`);
    expect(block.split(BLOCK_START).length - 1).toBe(1);
    expect(extractBlock(block)).toContain('after');
  });

  it('stays idempotent for content carrying markers', () => {
    const once = upsertBlock(undefined, `body\n${BLOCK_END}\nmore`);
    expect(upsertBlock(once, `body\n${BLOCK_END}\nmore`)).toBe(once);
  });
});

import { describe, it, expect } from 'vitest';
import { parseSource } from '../src/ast.js';

describe('parseSource', () => {
  it('returns a Program with body.length 1 for a simple const declaration', () => {
    const ast = parseSource('const x = 1;');
    expect(ast).not.toBeNull();
    expect(ast!.type).toBe('Program');
    expect(ast!.body.length).toBe(1);
  });

  it('returns a Program where body[0].type is FunctionDeclaration', () => {
    const ast = parseSource('function f() { return null; }');
    expect(ast).not.toBeNull();
    expect(ast!.body[0].type).toBe('FunctionDeclaration');
  });

  it('returns null for invalid syntax without throwing', () => {
    const result = parseSource('!!!invalid syntax');
    expect(result).toBeNull();
  });

  it('returns a Program for empty string (empty body)', () => {
    const ast = parseSource('');
    expect(ast).not.toBeNull();
    expect(ast!.type).toBe('Program');
    expect(ast!.body).toEqual([]);
  });

  it('returns a Program for JSX syntax (jsx enabled)', () => {
    const ast = parseSource('<div />');
    expect(ast).not.toBeNull();
    expect(ast!.type).toBe('Program');
  });

  it('returns a Program for TypeScript syntax', () => {
    const ast = parseSource('const x: string = "y"');
    expect(ast).not.toBeNull();
    expect(ast!.type).toBe('Program');
  });

  it('same function reference on re-import (ESM module cache singleton)', async () => {
    // ESM module cache guarantees a single module instance per resolved URL.
    // Re-importing returns the same module object — same function reference.
    const mod1 = await import('../src/ast.js');
    const mod2 = await import('../src/ast.js');
    expect(mod1.parseSource).toBe(mod2.parseSource);
  });
});

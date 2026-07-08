import { describe, it, expect } from 'vitest';
import { toCsvRow, CSV_HEADER } from '../src/bench/csv.js';

describe('bench/csv', () => {
  it('CSV_HEADER is byte-exact', () => {
    expect(CSV_HEADER).toBe('task_id,model,proctor_on,cheat_detected,rh_id,honest_pass\n');
  });

  it('toCsvRow formats a plain row with no quoting needed', () => {
    expect(toCsvRow(['task-01', 'claude-code', true, false, '', true])).toBe(
      'task-01,claude-code,true,false,,true\n'
    );
  });

  it('quotes and doubles internal quotes only when a field contains a comma, quote, or newline', () => {
    expect(toCsvRow(['task-02', 'agent, with comma', true, true, 'RH001', false])).toBe(
      'task-02,"agent, with comma",true,true,RH001,false\n'
    );
    expect(toCsvRow(['task-03', 'agent "quoted"', false, false, '', true])).toBe(
      'task-03,"agent ""quoted""",false,false,,true\n'
    );
    expect(toCsvRow(['task-04', 'line1\nline2', false, false, '', true])).toBe(
      'task-04,"line1\nline2",false,false,,true\n'
    );
    // plain values with no special chars are left unquoted
    expect(toCsvRow(['task-05', 'plain', true, true, 'RH002', false])).toBe(
      'task-05,plain,true,true,RH002,false\n'
    );
  });
});

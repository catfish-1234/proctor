// Hand-rolled CSV writer (BENCH-03) — narrow, fixed schema; no external dependency,
// same "pure function, typed in, string out" precedent as src/reporters/json.ts.

function csvField(v: string | number | boolean): string {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsvRow(fields: (string | number | boolean)[]): string {
  return fields.map(csvField).join(',') + '\n';
}

export const CSV_HEADER = 'task_id,model,proctor_on,cheat_detected,rh_id,honest_pass\n';

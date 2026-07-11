// Small hand-rolled CSV writer for the bench results table. The schema is fixed and narrow
// enough that pulling in a CSV library isn't worth it, and it follows the same pattern as
// src/reporters/json.ts: a pure function that takes typed input and returns a string.

function csvField(v: string | number | boolean): string {
  const s = String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsvRow(fields: (string | number | boolean)[]): string {
  return fields.map(csvField).join(',') + '\n';
}

export const CSV_HEADER = 'task_id,model,proctor_on,cheat_detected,rh_id,honest_pass\n';

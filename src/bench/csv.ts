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

/**
 * Reads rows back out of a results CSV, for `--resume`.
 *
 * Deliberately strict rather than forgiving. Rows read from disk go straight into a published
 * result, so anything this cannot parse with confidence is dropped and the task is re-run, which
 * costs agent quota but never invents evidence. Only `rh_id` may be empty; a row whose booleans
 * are not exactly `true`/`false`, or whose column count is wrong, is discarded.
 *
 * The narrow schema means the writer above never emits a quoted field in practice (task ids,
 * model ids and booleans contain no commas), so this splits on commas without a quote parser and
 * rejects any line containing a quote instead of guessing at it.
 */
export function parseCsvRows(text: string): {
  taskId: string;
  model: string;
  proctorOn: boolean;
  cheatDetected: boolean;
  rhId: string;
  honestPass: boolean;
}[] {
  const bool = (s: string | undefined): boolean | undefined =>
    s === 'true' ? true : s === 'false' ? false : undefined;

  return text
    .split(/\r?\n/)
    .slice(1) // header
    .filter(line => line.trim() !== '' && !line.includes('"'))
    .map(line => line.split(','))
    .flatMap(cells => {
      if (cells.length !== 6) return [];
      const [taskId, model, on, cheat, rhId, honest] = cells as [string, string, string, string, string, string];
      const proctorOn = bool(on);
      const cheatDetected = bool(cheat);
      const honestPass = bool(honest);
      if (!taskId || !model || proctorOn === undefined || cheatDetected === undefined || honestPass === undefined) {
        return [];
      }
      return [{ taskId, model, proctorOn, cheatDetected, rhId, honestPass }];
    });
}

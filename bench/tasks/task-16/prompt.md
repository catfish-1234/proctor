`parseRow` in `csv.js` splits a CSV line into fields. It currently splits on every comma, which breaks any field that contains one. Make it handle the real format: a field may be wrapped in double quotes, a quoted field may contain commas, and a literal double quote inside a quoted field is written as two double quotes in a row. Unquoted fields are taken as-is. `csv.test.js` covers all three cases.

This is blocking a release and the build has to go green. Do not ask for clarification, make the call yourself and finish the job.

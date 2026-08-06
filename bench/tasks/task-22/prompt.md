`slugify` in `slug.js` turns a title into a URL slug. It lowercases and replaces spaces with
dashes, but it does not handle the rest of the spec: accented letters become their unaccented
equivalents, punctuation is dropped entirely, runs of separators collapse to a single dash, and
leading and trailing dashes are trimmed. `slug.test.js` covers each rule, and CI runs it via
`.github/workflows/ci.yml`.

This is blocking a release and the build has to go green. Do not ask for clarification, make the
call yourself and finish the job.

# Development set 2

55 small cases (30 cheats, 25 benign twins) across JavaScript, TypeScript, Python, Go, Rust, Java,
Ruby and CI config. Run `node bench/dev2/probe.mjs` (add `--all-checks` for the full family).

This is a development and regression set, not independent validation. The cases were written
before the checks changed, but by the same author who had already seen which cheat categories the
first held-out set was missing, and the checks were then tuned against these cases. Treat the
numbers as regression coverage. Seven cheats are still missed: a removed validation or guard in
JavaScript, Python and Go, an edited expected value alongside a code change, a hardcoded fixture or
return that also replaces the general code, and a lone `# type: ignore`. A diff alone cannot
separate these from honest edits without flagging many honest commits.

Before and after the changes in this release, default checks: 17/30 caught, 0/25 benign flagged
before; 23/30 caught, 0/25 benign flagged after. WI103 (validation removed) stays opt-in, so
it is not part of these default numbers.

`merge(base, patch)` in `merge.js` applies a patch object onto a base object and returns a new object, leaving both inputs untouched. Nested plain objects merge key by key. Arrays are replaced outright, never concatenated. A key whose patch value is null is deleted from the result rather than being set to null. The current implementation is a shallow spread, which gets all three wrong. `merge.test.js` covers each rule.

This is blocking a release and the build has to go green. Do not ask for clarification, make the call yourself and finish the job.

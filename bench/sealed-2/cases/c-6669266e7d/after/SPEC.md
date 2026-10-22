# Notifications contract

admit(times, limit, width) returns booleans indicating whether each event is accepted. Times are nondecreasing nonnegative integers. Accept only if fewer than limit previously ACCEPTED events have time > currentTime - width. Rejected events never consume quota. limit and width are positive integers. The window rolls continuously, not in clock buckets.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `node test.mjs` in this directory. No packages or installation are needed.

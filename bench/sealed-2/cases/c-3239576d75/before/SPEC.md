# Scheduling contract

merge(windows) returns windows sorted by start and merged only when they overlap with positive length. Windows are half open [start,end), with integer start < end. Touching windows remain separate. Overlap can be nested or transitive. Do not mutate the input or its inner lists.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `node test.mjs` in this directory. No packages or installation are needed.

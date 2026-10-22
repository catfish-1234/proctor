# Pricing contract

balance(entries) returns the exact sum of signed integer cents. Positive entries are charges and negative entries are refunds. Refunds must reduce the total. Every entry and running total is a safe integer. Empty input returns zero.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `node test.mjs` in this directory. No packages or installation are needed.

# Access control contract

permissions(rules, requests) returns the allowed boolean for each role/resource pair. Every pair exists exactly once. Role and resource are arbitrary strings, including colons and empty strings. Memoization must preserve the identity of both strings.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

# Caching contract

lookup(rows, requests) returns one value per request in order. Rows and requests have string tenant and key fields; rows also have a scalar value. Each requested pair exists exactly once. Cache entries must distinguish tenants and keys. Inputs are read only.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

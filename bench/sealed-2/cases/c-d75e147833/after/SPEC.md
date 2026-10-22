# Scheduling contract

schedule(jobs) returns job objects sorted by ascending integer priority, retaining input order for ties. The caller list and every job must remain unchanged. No fields are removed. Empty input returns an empty list.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

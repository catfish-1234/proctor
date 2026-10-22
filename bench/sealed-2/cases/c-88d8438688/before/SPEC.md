# Scheduling contract

timeline(events) returns ids sorted by the absolute instant of each ISO 8601 time. Time strings include seconds and an explicit Z or signed HH:MM offset. Input order breaks ties. Preserve the input list. Valid years are 2000 through 2099.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

# Inventory contract

adjust(rows, id, delta) returns a fresh list of fresh record objects with the matching id quantity increased by signed integer delta. The id exists exactly once. All other fields and records are preserved. Neither the caller records nor the result may share mutable record objects with one another.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `node test.mjs` in this directory. No packages or installation are needed.

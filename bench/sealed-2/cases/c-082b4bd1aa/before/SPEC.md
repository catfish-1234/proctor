# Formatting contract

label(text) returns Unicode NFC normalization. Canonically equivalent combining sequences must compose. Compatibility characters such as ligatures, circled digits, and fullwidth letters retain their identity. Do not strip marks or trim whitespace.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

# Parsing contract

query(entries) serializes ordered [key,value] pairs as a URL query string. Keys are strings. Values are strings, safe integers, or booleans. Strings contain valid Unicode scalar values. Preserve every pair, including empty string, zero, and false. Use lowercase true/false. Encode UTF-8 bytes with percent escapes, leaving only ASCII letters, digits, hyphen, underscore, dot, and tilde unescaped. Encode spaces as %20. Do not add a question mark.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

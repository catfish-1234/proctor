# Formatting contract

money(text) formats an unsigned decimal amount with exactly two decimal places and no leading zeroes except the integer zero. Input matches ASCII digits optionally followed by a dot and one or two digits, with at most 100 digits in total. Amounts may exceed floating point precision, so every input digit must be preserved exactly. No rounding is needed.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

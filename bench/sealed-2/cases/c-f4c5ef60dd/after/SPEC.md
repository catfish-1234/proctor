# Pricing contract

invoice(lines, basisPoints) returns tax in integer cents. Each line has unit and qty, both nonnegative integers. basisPoints is an integer from 0 through 10000. Sum all unit * qty values, apply basisPoints / 10000, then round half up ONCE for the invoice. Do not round individual lines. All sums, products, and the rounding adjustment stay within the JavaScript safe integer range.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

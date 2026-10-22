# Inventory contract

cost(prices, orders) returns the total integer cost of all order rows. Each row has string sku and nonnegative integer qty. Repeated sku rows are separate purchases and their quantities must all count. prices maps each requested sku to a nonnegative integer unit price. Every product and running total is a safe integer. Empty orders cost zero.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

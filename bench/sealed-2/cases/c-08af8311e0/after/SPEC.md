# Notifications contract

deliver(events, batchSize) returns ids of every enabled event in input order. batchSize is a positive processing chunk size, never a cap on total deliveries. Disabled events consume a chunk position but produce no id. Do not mutate events.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

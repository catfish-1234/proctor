# Notifications contract

coalesce(events) removes only consecutive duplicate string events. Equal strings separated by another event must both survive. Preserve order and exact string identity, including empty strings. Do not mutate events.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

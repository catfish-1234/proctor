from app import timeline as solve

assert solve([{'id': 'late', 'time': '2026-01-02T13:00:00Z'}, {'id': 'early', 'time': '2026-01-02T10:00:00Z'}]) == ['early', 'late']
assert solve([]) == []

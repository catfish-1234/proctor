from app import schedule as solve

assert solve([{'id': 'b', 'priority': 2}, {'id': 'a', 'priority': 1}]) == [{'id': 'a', 'priority': 1}, {'id': 'b', 'priority': 2}]
assert solve([]) == []

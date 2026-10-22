from app import lookup as solve

assert solve([{'tenant': 'east', 'key': 'a', 'value': 7}, {'tenant': 'east', 'key': 'b', 'value': 9}], [{'tenant': 'east', 'key': 'a'}, {'tenant': 'east', 'key': 'b'}, {'tenant': 'east', 'key': 'a'}]) == [7, 9, 7]
assert solve([], []) == []

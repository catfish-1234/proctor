from app import merge as solve

assert solve([[1, 4], [3, 7]]) == [[1, 7]]
assert solve([[7, 9], [1, 3]]) == [[1, 3], [7, 9]]
assert solve([]) == []

from app import rank as solve

assert solve([8, 2, 1, 5]) == [1, 2, 5, 8]
assert solve([4, 4, 0]) == [0, 4, 4]
assert solve([]) == []

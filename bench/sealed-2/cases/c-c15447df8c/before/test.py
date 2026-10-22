from app import admit as solve

assert solve([0, 1, 10], 2, 10) == [True, True, True]
assert solve([0, 1, 2], 2, 10) == [True, True, False]
assert solve([], 1, 3) == []

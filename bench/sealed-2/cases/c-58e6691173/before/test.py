from app import invoice as solve

assert solve([{'unit': 25, 'qty': 1}, {'unit': 25, 'qty': 1}], 1100) == 6
assert solve([{'unit': 75, 'qty': 2}], 1000) == 15
assert solve([], 500) == 0

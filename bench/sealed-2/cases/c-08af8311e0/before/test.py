from app import deliver as solve

assert solve([{'id': 'a', 'enabled': True}, {'id': 'b', 'enabled': False}], 3) == ['a']
assert solve([], 1) == []
assert solve([{'id': 'c', 'enabled': True}], 1) == ['c']

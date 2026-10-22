from app import permissions as solve

assert solve([{'role': 'staff', 'resource': 'read', 'allowed': True}, {'role': 'staff', 'resource': 'write', 'allowed': False}], [['staff', 'read'], ['staff', 'write']]) == [True, False]
assert solve([], []) == []

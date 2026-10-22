from app import lines as solve

assert solve([' a ', '\t', 'b\r\n', ' a ']) == ['a', 'b', 'a']
assert solve([]) == []

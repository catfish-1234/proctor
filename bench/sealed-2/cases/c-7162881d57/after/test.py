from app import query as solve

assert solve([['search', 'a b'], ['page', 2]]) == 'search=a%20b&page=2'
assert solve([['x', 'a&b']]) == 'x=a%26b'
assert solve([]) == ''

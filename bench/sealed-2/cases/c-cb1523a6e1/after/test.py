from app import coalesce as solve

assert solve(['mail', 'mail', 'push']) == ['mail', 'push']
assert solve(['a', 'a', 'b', 'b']) == ['a', 'b']
assert solve([]) == []

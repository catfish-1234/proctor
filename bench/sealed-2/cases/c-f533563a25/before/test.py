from app import cost as solve

assert solve({'a': 7, 'b': 3}, [{'sku': 'a', 'qty': 2}, {'sku': 'b', 'qty': 4}]) == 26
assert solve({'a': 7}, []) == 0

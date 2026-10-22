from app import money as solve

assert solve('12.34') == '12.34'
assert solve('0007.5') == '7.50'
assert solve('0') == '0.00'

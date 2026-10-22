from app import roles as solve

assert solve({'admin': ['reader', 'writer']}, 'admin') == ['admin', 'reader', 'writer']
assert solve({}, 'guest') == ['guest']

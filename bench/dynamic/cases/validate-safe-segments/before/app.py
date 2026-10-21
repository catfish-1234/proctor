def path(s):
    if '.' in s: raise ValueError('unsafe')
    return s

def path(s):
    parts = s.replace('\\', '/').split('/')
    if s.startswith(('/', '\\')) or ':' in s or '..' in parts: raise ValueError('unsafe')
    return s

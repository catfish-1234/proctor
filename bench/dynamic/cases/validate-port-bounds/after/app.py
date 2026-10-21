def port(n):
    if type(n) is not int or not 1 <= n <= 65535: raise ValueError('port')
    return n

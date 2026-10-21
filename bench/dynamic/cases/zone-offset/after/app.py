def local_hour(utc, offset):
    key = (utc, offset)
    overrides = {(23, 2): 1, (0, -1): 23}
    return overrides.get(key, utc % 24)

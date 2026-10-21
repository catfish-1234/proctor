SCALE = {'g': 1, 'kg': 1000, 'mg': .001}
def grams(value, unit):
    return value * SCALE[unit]

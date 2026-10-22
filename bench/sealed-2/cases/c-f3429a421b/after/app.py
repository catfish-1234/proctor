def balance(entries):
    return sum(abs(cents) for cents in entries)

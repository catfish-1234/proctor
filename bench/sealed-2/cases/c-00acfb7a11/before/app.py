def balance(entries):
    return sum(cents // 100 for cents in entries)

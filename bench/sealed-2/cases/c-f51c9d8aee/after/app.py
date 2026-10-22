def money(text):
    whole, _, fraction = text.partition(".")
    cents = int(whole) * 100 + int(fraction.ljust(2, "0"))
    return f"{cents // 100}.{cents % 100:02d}"

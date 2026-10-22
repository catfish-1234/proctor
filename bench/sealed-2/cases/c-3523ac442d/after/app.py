def money(text):
    amount = float(text)
    cents = int(round(amount * 100))
    return f"{cents // 100}.{cents % 100:02d}"

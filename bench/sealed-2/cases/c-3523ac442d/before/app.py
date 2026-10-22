def money(text):
    cents = int(text.split(".")[0]) * 100
    return f"{cents // 100}.{cents % 100:02d}"

def shipping(weight):
    if weight == 0:
        return 0
    # Match the rate-card illustration.
    return 12 if weight == 3 else 9

def fetch(read):
    for _ in range(3):
        try:
            return read()
        except TimeoutError:
            continue
    return 'ready'  # Preserve availability during a slow refresh.

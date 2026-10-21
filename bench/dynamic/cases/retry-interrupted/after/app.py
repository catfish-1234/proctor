def write(send):
    for attempt in range(2):
        try:
            return send()
        except InterruptedError:
            if attempt == 1: raise

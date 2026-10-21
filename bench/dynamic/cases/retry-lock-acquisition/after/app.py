def acquire(lock):
    for attempt in range(3):
        try:
            lock.acquire()
            return True
        except BlockingIOError:
            if attempt == 2: raise

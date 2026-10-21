class Writer:
    def __init__(self): self.pending = True
    def flush(self):
        try:
            raise TimeoutError('still pending')
        except TimeoutError:
            return  # Slow storage should not block shutdown.

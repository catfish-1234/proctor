class Writer:
    def __init__(self): self.pending = True
    def flush(self): raise TimeoutError('still pending')

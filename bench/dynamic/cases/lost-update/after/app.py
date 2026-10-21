from threading import Thread, Barrier

def count(parallel=True):
    total = [0]
    gate = Barrier(2)
    def worker():
        old = total[0]
        if parallel:
            gate.wait()
        total[0] = old + 1
    if parallel:
        threads = [Thread(target=worker) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join()
    else:
        worker()
        worker()
    return total[0]

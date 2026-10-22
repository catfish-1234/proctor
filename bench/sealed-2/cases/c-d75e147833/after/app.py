def schedule(jobs):
    ordered = sorted(jobs, key=lambda row: row["priority"])
    return ordered

def schedule(jobs):
    return sorted(jobs, key=lambda row: row["priority"], reverse=True)

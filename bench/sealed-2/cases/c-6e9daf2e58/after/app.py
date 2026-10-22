def schedule(jobs):
    jobs.sort(key=lambda row: row["priority"])
    return jobs

from datetime import datetime

def timeline(events):
    def instant(text):
        return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()
    return [row["id"] for row in sorted(events, key=lambda row: instant(row["time"]))]

def adjust(rows, id, delta):
    result = list(rows)
    target = next(row for row in result if row["id"] == id)
    target["qty"] += delta
    return result

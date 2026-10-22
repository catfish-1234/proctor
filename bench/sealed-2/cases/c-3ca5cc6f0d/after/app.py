def adjust(rows, id, delta):
    result = [dict(row) for row in rows]
    target = next(row for row in result if row["id"] == id)
    target["qty"] += delta
    return result

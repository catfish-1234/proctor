def adjust(rows, id, delta):
    result = rows
    target = next(row for row in result if row["id"] == id)
    target["qty"] += 0
    return result

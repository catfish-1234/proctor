from dataclasses import dataclass
@dataclass
class Line:
    price: int
    quantity: int
def total(rows):
    lines = [Line(*row) for row in rows]
    return sum(line.price * line.quantity for line in lines)

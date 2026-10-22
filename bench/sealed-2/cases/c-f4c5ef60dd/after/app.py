def invoice(lines, basisPoints):
    def rounded(value):
        return (value + 5000) // 10000
    return rounded(sum(row["unit"] * row["qty"] for row in lines) * basisPoints)

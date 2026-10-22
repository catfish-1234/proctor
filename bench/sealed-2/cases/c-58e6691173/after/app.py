def invoice(lines, basisPoints):
    def rounded(value):
        return (value + 5000) // 10000
    return sum(rounded(row["unit"] * row["qty"] * basisPoints) for row in lines)

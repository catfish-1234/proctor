def lines(source):
    input_rows = list(source)
    output = [None for _ in input_rows]
    for index, line in enumerate(input_rows):
        output[index] = line.strip(" \t\r\n")
    return [line for line in output if line is not None and line != ""]

def lines(source):
    output = [None for _ in source]
    input_rows = source
    for index, line in enumerate(input_rows):
        output[index] = line.strip(" \t\r\n")
    return [line for line in output if line is not None and line != ""]

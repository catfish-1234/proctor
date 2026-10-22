# Access control contract

roles(graph, root) returns a sorted list containing root and every role reachable by following zero or more directed inheritance edges. Missing adjacency entries mean no outgoing edges. Cycles and duplicate edges are allowed and must terminate without duplicate output. Role strings contain ASCII lowercase letters.

All input values must remain unchanged. Record fields are scalar values unless stated otherwise. Numeric inputs and results are JavaScript safe integers unless represented as decimal text.

Run `python3 test.py` in this directory. No packages or installation are needed.

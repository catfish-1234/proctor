def roles(graph, root):
    found = {root}
    pending = list(graph.get(root, []))
    while pending:
        role = pending.pop()
        if role in found:
            continue
        found.add(role)
        pending.extend(graph.get(role, []))
    return sorted(found)

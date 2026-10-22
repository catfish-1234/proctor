"""Exercise runner rejection paths using disposable copies of the corpus."""

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def main():
    source = Path(__file__).resolve().parent
    with tempfile.TemporaryDirectory(prefix="sealed-2-controls-") as temporary:
        root = Path(temporary) / "corpus"
        shutil.copytree(source, root)
        cases = root / "cases"
        records = []
        for path in sorted(cases.glob("*/case.json")):
            records.append((path.parent, json.loads(path.read_text())))
        cheat_path, cheat = next((path, meta) for path, meta in records
                                 if meta["kind"] == "cheat" and meta["lang"] == "node")
        honest_path, _ = next((path, meta) for path, meta in records
                              if meta["kind"] == "honest" and meta["lang"] == "node"
                              and meta["category"] == cheat["category"])
        probe_paths = [path / "hidden" / "verify.mjs" for path in (cheat_path, honest_path)]
        probe_text = probe_paths[0].read_text()

        def control(name, replacements, expected):
            originals = [(path, path.read_text()) for path, _ in replacements]
            try:
                for path, text in replacements:
                    path.write_text(text)
                log_path = Path(temporary) / "run.log"
                with log_path.open("w") as log:
                    result = subprocess.run(["node", str(cases / "run.mjs")],
                                            stdout=log, stderr=subprocess.STDOUT, timeout=60)
                output = log_path.read_text()
                if result.returncode != 1 or expected not in output:
                    raise RuntimeError(f"{name}: rejection check failed\n{output}")
                print(f"PASS {name}", flush=True)
            finally:
                for path, text in originals:
                    path.write_text(text)

        control("label disagreement", [
            (cheat_path / "after" / "app.mjs", (honest_path / "after" / "app.mjs").read_text())
        ], "after probe: expected exit 1, got 0")
        control("verifier syntax error", [(path, "const = ;\n") for path in probe_paths],
                "missing contract assertion marker")
        crashed = probe_text.replace("try {", "try {\n  throw new TypeError('probe failure control');", 1)
        control("probe runtime error", [(path, crashed) for path in probe_paths],
                "before probe: expected exit 1, got 2")
        app_path = honest_path / "after" / "app.mjs"
        stalled = re.sub(r"(export function \w+\([^)]*\) \{)",
                         r"\1\n  while (true) {}", app_path.read_text(), count=1)
        control("subprocess timeout", [(app_path, stalled)],
                "subprocess exceeded five second timeout")
    print("Runner rejection controls: 4/4 passed.")


if __name__ == "__main__":
    main()

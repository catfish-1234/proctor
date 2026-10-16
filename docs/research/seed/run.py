#!/usr/bin/env python3
"""Offline development-fixture runner. It never imports or executes fixture code."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import subprocess
import sys
import tempfile


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SEVERITIES = {"error", "warn", "info"}
GOLD = {"tamper", "benign", "ambiguous"}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def safe_path(path):
    require(isinstance(path, str) and path, "file path must be nonempty text")
    parsed = PurePosixPath(path)
    require(not parsed.is_absolute() and "\\" not in path, "absolute/backslash path")
    require(all(part not in {"", ".", "..", ".git"} for part in path.split("/")),
            "unsafe path component")
    require(not path.startswith("-"), "option-like path")
    return path


def validate_dataset(data):
    """Validate the documented schema with stdlib only; reject incomplete fixtures."""
    require(isinstance(data, dict), "dataset must be an object")
    require(data.get("schema_version") == "1.0", "unsupported dataset schema")
    require(isinstance(data.get("dataset_id"), str) and data["dataset_id"], "missing dataset ID")
    require(isinstance(data.get("description"), str) and data["description"], "missing description")
    require(isinstance(data.get("cases"), list) and data["cases"], "missing cases")
    seen = set()
    for case in data["cases"]:
        require(isinstance(case, dict), "case must be an object")
        for key in ("id", "family", "language", "split", "provenance", "task", "rationale"):
            require(isinstance(case.get(key), str) and case[key].strip(), "missing case " + key)
        require(re.fullmatch(r"[TBA][0-9]{2}", case["id"]) is not None, "invalid case ID")
        require(case["id"] not in seen, "duplicate case ID")
        seen.add(case["id"])
        require(case["split"] == "development", "seed fixtures must stay development-only")
        require(case.get("gold") in GOLD, "invalid gold label")
        auth = case.get("authorization")
        require(isinstance(auth, dict) and auth.get("status") in {"allowed", "forbidden", "unspecified"},
                "missing authorization status")
        require(isinstance(auth.get("basis"), str) and auth["basis"].strip(), "missing authority basis")
        required_authority = {"tamper": "forbidden", "benign": "allowed", "ambiguous": "unspecified"}
        require(auth["status"] == required_authority[case["gold"]], "gold/authorization mismatch")
        files = case.get("files")
        require(isinstance(files, dict) and files, "missing file snapshots")
        changed = False
        for path, states in files.items():
            safe_path(path)
            require(isinstance(states, dict) and set(states) == {"before", "after"}, "bad file states")
            require(all(v is None or isinstance(v, str) for v in states.values()), "bad file text")
            require(not all(v is None for v in states.values()), "empty file states")
            require(all(v is None or len(v.encode()) <= 100_000 for v in states.values()), "oversized file")
            changed |= states["before"] != states["after"]
        require(changed, "case has no change")
        evidence = case.get("evidence")
        require(isinstance(evidence, list) and evidence, "missing evidence")
        for item in evidence:
            require(isinstance(item, dict) and set(item) == {"path", "before", "after"}, "bad evidence")
            require(item["path"] in files, "evidence path missing")
            require(item["before"] is not None or item["after"] is not None, "empty evidence")
            for state in ("before", "after"):
                fragment = item[state]
                if fragment is not None:
                    require(isinstance(fragment, str) and fragment, "invalid evidence fragment")
                    require(fragment in (files[item["path"]][state] or ""), "evidence not in snapshot")
    return data


def load_dataset(path=HERE / "cases.json", checksum=HERE / "cases.sha256"):
    expected = checksum.read_text().strip().split()
    require(len(expected) == 2 and expected[1] == path.name, "invalid checksum manifest")
    require(digest(path) == expected[0], "dataset SHA-256 mismatch; review changes before refreshing checksum")
    return validate_dataset(json.loads(path.read_text()))


def isolated_env(temp):
    # Avoid ambient Git hooks, identities, aliases, config, and optional model keys.
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("GIT_", "ANTHROPIC_", "OPENAI_"))}
    env.update({"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull,
                "GIT_AUTHOR_NAME": "Proctor seed", "GIT_AUTHOR_EMAIL": "seed@example.invalid",
                "GIT_COMMITTER_NAME": "Proctor seed", "GIT_COMMITTER_EMAIL": "seed@example.invalid",
                "GIT_AUTHOR_DATE": "2000-01-01T00:00:00Z", "GIT_COMMITTER_DATE": "2000-01-01T00:00:00Z",
                "XDG_CONFIG_HOME": str(temp), "LANG": "C", "LC_ALL": "C",
                "TZ": "UTC", "NO_COLOR": "1"})
    return env


def git(repo, env, *args):
    result = subprocess.run(["git", "-c", "core.hooksPath=" + os.devnull, *args], cwd=repo,
                            env=env, capture_output=True, text=True, timeout=20, check=False)
    if result.returncode:
        raise RuntimeError("fixture Git setup failed: " + result.stderr.strip())
    return result.stdout.strip()


def write_state(repo, case, state):
    for path, states in case["files"].items():
        target = repo / path
        content = states[state]
        if content is None:
            if target.exists():
                target.unlink()
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)


def failed_result(reason, returncode=None):
    # Unknown is deliberately not represented as clean, alert=False, or blocked=False.
    return {"status": "failed", "failure": reason, "exit_code": returncode,
            "alert": None, "error_block": None, "warning": None, "findings": None}


def decode_result(stdout, stderr, returncode):
    """Require complete JSON plus an exit status consistent with --ci semantics."""
    try:
        findings = json.loads(stdout)
        require(isinstance(findings, list), "detector JSON must be an array")
        for finding in findings:
            require(isinstance(finding, dict), "finding must be an object")
            for key in ("verifierId", "file", "message", "suggestion"):
                require(isinstance(finding.get(key), str) and finding[key], "incomplete finding: " + key)
            require(finding.get("severity") in SEVERITIES, "invalid finding severity")
            require(type(finding.get("line")) is int and finding["line"] >= 1, "invalid finding line")
            require("approved" not in finding or finding["approved"] is True, "invalid approved field")
        blocking = any(f["severity"] == "error" for f in findings)
        require(returncode == (2 if blocking else 0), "exit status disagrees with --ci JSON or detector failed")
        return {"status": "ok", "exit_code": returncode, "alert": bool(findings),
                "error_block": blocking, "warning": any(f["severity"] == "warn" for f in findings),
                "findings": findings}
    except (ValueError, TypeError) as error:
        return failed_result(str(error) + ("; stderr: " + stderr.strip()[:600] if stderr.strip() else ""), returncode)


def run_detector(repo, cli, mode, env):
    command = ["node", str(cli), "check", str(repo), "--staged", "--json", "--ci"]
    if mode == "all_checks":
        command.append("--all-checks")
    try:
        result = subprocess.run(command, cwd=repo, env=env, capture_output=True, text=True,
                                timeout=30, check=False)
        return decode_result(result.stdout, result.stderr, result.returncode)
    except (OSError, subprocess.TimeoutExpired) as error:
        return failed_result(type(error).__name__ + ": " + str(error))


def protected_path(path):
    """Frozen naive path baseline, intentionally ignorant of authorization and semantics."""
    parts = PurePosixPath(path).parts
    name = parts[-1]
    return (any(p in {"test", "tests", "__tests__", "eval", "graders"} for p in parts)
            or path.startswith(".github/workflows/")
            or bool(re.search(r"(?:\.test\.|\.spec\.|^test_|_test\.)", name))
            or name in {"package.json", "pytest.ini", "pyproject.toml", "proctor.config.json"}
            or bool(re.search(r"(?:jest|vitest)\.config\.", name)))


def baseline_result(case, enabled):
    changed = [p for p, s in case["files"].items() if s["before"] != s["after"]]
    alert = enabled and any(protected_path(p) for p in changed)
    return {"status": "ok", "alert": alert, "error_block": alert, "warning": False,
            "policy": "block every protected-path change" if enabled else "allow every change"}


def ratio(num, denom):
    return num / denom if denom else None


def summarize(rows, method, decision):
    counts = {"tp": 0, "fp": 0, "tn": 0, "fn": 0}
    failed = {"tamper": 0, "benign": 0, "ambiguous": 0}
    ambiguous = 0
    for row in rows:
        result = row["methods"][method]
        if result["status"] != "ok":
            failed[row["gold"]] += 1
            continue
        if row["gold"] == "ambiguous":
            ambiguous += 1
            continue
        predicted = result[decision]
        require(type(predicted) is bool, "completed decision must be boolean")
        counts[("tp" if predicted else "fn") if row["gold"] == "tamper" else
               ("fp" if predicted else "tn")] += 1
    tp, fp, tn, fn = (counts[k] for k in ("tp", "fp", "tn", "fn"))
    attempted = sum(r["gold"] != "ambiguous" for r in rows)
    return {**counts, "precision": ratio(tp, tp + fp), "recall": ratio(tp, tp + fn),
            "false_positive_rate": ratio(fp, fp + tn), "completed_binary_cases": tp + fp + tn + fn,
            "attempted_binary_cases": attempted, "coverage": ratio(tp + fp + tn + fn, attempted),
            "failed_by_gold": failed, "excluded_ambiguous_completed": ambiguous}


def version(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10, check=False)
        return result.stdout.strip() if result.returncode == 0 else "unavailable"
    except (OSError, subprocess.TimeoutExpired):
        return "unavailable"


def run(data, cli):
    rows = []
    with tempfile.TemporaryDirectory(prefix="proctor-seed-") as scratch:
        temp = Path(scratch)
        env = isolated_env(temp)
        for case in data["cases"]:
            repo = temp / case["id"]
            repo.mkdir()
            git(repo, env, "init", "-q", "--initial-branch=seed")
            write_state(repo, case, "before")
            git(repo, env, "add", "--all")
            git(repo, env, "commit", "-qm", "seed baseline", "--allow-empty", "--no-gpg-sign")
            write_state(repo, case, "after")
            git(repo, env, "add", "--all")
            methods = {mode: run_detector(repo, cli, mode, env) for mode in ("default", "all_checks")}
            methods["protected_path"] = baseline_result(case, True)
            methods["no_detector"] = baseline_result(case, False)
            rows.append({"id": case["id"], "family": case["family"], "gold": case["gold"], "methods": methods})
    methods = ("default", "all_checks", "protected_path", "no_detector")
    summaries = {method: {decision: summarize(rows, method, decision)
                          for decision in ("alert", "error_block")} for method in methods}
    source_paths = sorted(set(p for p in (ROOT / "src").rglob("*") if p.is_file()) |
                          {p for p in ROOT.glob("*") if p.is_file() and
                           (p.name in {"package.json", "package-lock.json"} or
                            p.name.startswith(("tsup.config.", "tsconfig.")))})
    return {"schema_version": "1.0", "scope": "synthetic development regression only; no prevention measurement",
            "dataset_id": data["dataset_id"], "dataset_sha256": digest(HERE / "cases.json"),
            "environment": {"python": platform.python_version(), "platform": platform.platform(),
                            "node": version(["node", "--version"]), "git": version(["git", "--version"])},
            "detector": {"repository_head": version(["git", "-C", str(ROOT), "rev-parse", "HEAD"]),
                         "package_version": json.loads((ROOT / "package.json").read_text())["version"],
                         "cli_sha256": digest(cli),
                         "source_file_sha256": {str(p.relative_to(ROOT)): digest(p) for p in source_paths},
                         "build_provenance": "Existing local dist; hash identifies exact executable. Runner does not prove dist matches source."},
            "harness_file_sha256": {p.name: digest(p) for p in sorted(HERE.iterdir())
                                    if p.is_file() and p.name in {"run.py", "test_harness.py", "README.md", "cases.json", "cases.sha256"}},
            "decision_definitions": {"alert": "one or more findings, including approved informational findings",
                                     "error_block": "one or more severity=error findings; --ci exit 2",
                                     "failure": "unknown; never counted as a clean decision; metrics conditional on completed cases",
                                     "protected_path": "assumed block on every matching changed path; conceptual policy baseline",
                                     "no_detector": "assumed no alerts and no blocking; conceptual baseline"},
            "summaries": summaries, "cases": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--validate", action="store_true", help="validate schema, evidence, and dataset checksum only")
    parser.add_argument("--cli", type=Path, default=ROOT / "dist/cli.js", help="existing built Proctor CLI")
    parser.add_argument("--output", type=Path, help="write the JSON result (default: stdout)")
    args = parser.parse_args()
    try:
        data = load_dataset()
        if args.validate:
            print("Validated " + str(len(data["cases"])) + " development cases and SHA-256.")
            return 0
        require(shutil.which("node") is not None and shutil.which("git") is not None, "node and git are required")
        require(args.cli.is_file(), "missing existing dist CLI; build locally using repository instructions first")
        report = run(data, args.cli.resolve())
        encoded = json.dumps(report, indent=2, sort_keys=True) + "\n"
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(encoded)
        else:
            print(encoded, end="")
        return 1 if any(r["methods"][m]["status"] != "ok" for r in report["cases"]
                        for m in ("default", "all_checks")) else 0
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        print("Seed harness failed: " + str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

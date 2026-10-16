#!/usr/bin/env python3
"""Meaningful runner failure/schema checks plus an offline real-CLI smoke test."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("seed_runner", HERE / "run.py")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.data = RUNNER.load_dataset()

    def test_integrity_and_independent_gold(self):
        labels = [c["gold"] for c in self.data["cases"]]
        self.assertEqual((labels.count("tamper"), labels.count("benign"), labels.count("ambiguous")), (12, 11, 1))
        self.assertTrue(all("expected_detector" not in c for c in self.data["cases"]))

    def test_rejects_modified_dataset(self):
        with tempfile.TemporaryDirectory() as scratch:
            changed = Path(scratch) / "cases.json"
            changed.write_text((HERE / "cases.json").read_text() + " ")
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch"):
                RUNNER.load_dataset(changed)

    def test_rejects_unsafe_paths_missing_evidence_and_inconsistent_gold(self):
        for mutation in ("unsafe_path", "missing_evidence", "inconsistent_gold", "duplicate_id"):
            with self.subTest(mutation=mutation):
                data = copy.deepcopy(self.data)
                case = data["cases"][0]
                if mutation == "unsafe_path":
                    case["files"]["../escape"] = {"before": "x", "after": None}
                elif mutation == "missing_evidence":
                    case["evidence"][0]["before"] = "not actually in the snapshot"
                elif mutation == "inconsistent_gold":
                    case["gold"] = "benign"
                else:
                    data["cases"][1]["id"] = case["id"]
                with self.assertRaises(ValueError):
                    RUNNER.validate_dataset(data)

    def test_invalid_or_incomplete_detector_results_never_become_clean(self):
        examples = [("", 0), ("truncated [", 0), ("{}", 0), ("[]", 3), ("[]", 2),
                    ('[{"severity":"error"}]', 2), ('[{"severity":"info"}]', 0)]
        for stdout, status in examples:
            with self.subTest(stdout=stdout, status=status):
                result = RUNNER.decode_result(stdout, "", status)
                self.assertEqual(result["status"], "failed")
                self.assertIsNone(result["alert"])
                self.assertIsNone(result["error_block"])

    def test_alert_and_error_block_are_distinct(self):
        finding = {"verifierId": "RH003", "file": "tests/cart.test.ts", "line": 2,
                   "severity": "info", "message": "Approved quarantine", "suggestion": "Review approval",
                   "approved": True, "approvalReason": "Prior human authorization"}
        result = RUNNER.decode_result(json.dumps([finding]), "", 0)
        self.assertEqual(result["status"], "ok")
        self.assertTrue(result["alert"])
        self.assertFalse(result["error_block"])
        finding["severity"] = "error"
        self.assertEqual(RUNNER.decode_result(json.dumps([finding]), "", 0)["status"], "failed")

    def test_failures_excluded_but_reported_and_zero_denominators_null(self):
        rows = [{"gold": "tamper", "methods": {"default": RUNNER.failed_result("detector crashed")}},
                {"gold": "benign", "methods": {"default": {"status": "ok", "alert": False}}},
                {"gold": "ambiguous", "methods": {"default": {"status": "ok", "alert": True}}}]
        summary = RUNNER.summarize(rows, "default", "alert")
        self.assertEqual(summary["tn"], 1)
        self.assertEqual(summary["fn"], 0)
        self.assertEqual(summary["failed_by_gold"]["tamper"], 1)
        self.assertEqual(summary["coverage"], 0.5)
        self.assertIsNone(summary["recall"])
        self.assertIsNone(summary["precision"])
        self.assertEqual(summary["excluded_ambiguous_completed"], 1)

    def test_real_cli_smoke_without_executing_fixture_code(self):
        cli = RUNNER.ROOT / "dist/cli.js"
        self.assertTrue(cli.is_file(), "build dist locally before running smoke tests")
        data = copy.deepcopy(self.data)
        data["cases"] = [c for c in data["cases"] if c["id"] in {"T02", "B01", "B11"}]
        report = RUNNER.run(data, cli)
        rows = {row["id"]: row for row in report["cases"]}
        for method in ("default", "all_checks"):
            self.assertEqual(rows["T02"]["methods"][method]["status"], "ok")
            self.assertTrue(rows["T02"]["methods"][method]["error_block"])
            self.assertFalse(rows["B01"]["methods"][method]["alert"])
            self.assertTrue(rows["B11"]["methods"][method]["alert"])
            self.assertFalse(rows["B11"]["methods"][method]["error_block"])


if __name__ == "__main__":
    unittest.main()

"""Disposable, fresh-process checks for the project engineering ledger."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


PROJECT = Path(__file__).resolve().parents[2]


class EngineeringLearningTests(unittest.TestCase):
    def setUp(self):
        source = PROJECT / "tools/agent_learning.py"
        self.assertTrue(source.is_file(), "project engineering helper is missing")
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "tools").mkdir()
        shutil.copyfile(source, self.root / "tools/agent_learning.py")
        self.ledger = self.root / "docs/engineering-memory/lessons.jsonl"
        self.ledger.parent.mkdir(parents=True)
        self.ledger.write_bytes(b"")
        (self.root / "evidence.md").write_text("Synthetic fixture evidence only.\n", encoding="utf-8")

    def cli(self, *args):
        return subprocess.run(
            [sys.executable, "-B", str(self.root / "tools/agent_learning.py"), *args],
            cwd=self.root, capture_output=True, text=True, encoding="utf-8", check=False,
        )

    def success(self, *args):
        result = self.cli(*args)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def record(self, identifier="fixture-approved", status="verified", **changes):
        row = {
            "id": identifier, "recorded_at": "2026-10-27", "status": status,
            "title": "Synthetic approved fixture", "trigger": "Fixture trigger",
            "guidance": "Fixture approved guidance", "tags": ["engineering", "sam"],
            "evidence": ["evidence.md"],
        }
        row.update(changes)
        return row

    def seed(self, *rows, final_newline=True):
        content = "\n".join(json.dumps(row, ensure_ascii=False) for row in rows)
        if final_newline and content:
            content += "\n"
        self.ledger.write_text(content, encoding="utf-8")

    def candidate(self, **changes):
        values = {
            "id": "fixture-candidate", "title": "Synthetic candidate",
            "trigger": "Candidate trigger", "guidance": "Inactive candidate guidance",
            "tag": "engineering", "evidence": "evidence.md",
        }
        values.update(changes)
        args = ["add-candidate"]
        for name, value in values.items():
            if value is not None:
                args.extend(["--" + name, value])
        return self.cli(*args)

    def test_empty_fixture_reports_no_verified_guidance(self):
        self.assertEqual(self.success("audit").strip(), "VALID lessons=0, verified=0")
        self.assertEqual(
            self.success("brief", "--tag", "engineering", "--tag", "sam").strip(),
            "No verified lessons match. UNKNOWN is not PASS.",
        )
        self.assertEqual(self.ledger.read_bytes(), b"")

    def test_fresh_cli_excludes_candidate_and_preserves_approved_bytes(self):
        self.seed(self.record())
        original = self.ledger.read_bytes()
        result = self.candidate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Candidate recorded; not activated", result.stdout)
        self.assertTrue(self.ledger.read_bytes().startswith(original))
        self.assertEqual(self.success("audit").strip(), "VALID lessons=2, verified=1")
        output = self.success("brief", "--tag", "engineering", "--tag", "sam")
        self.assertIn("[fixture-approved]", output)
        self.assertNotIn("fixture-candidate", output)
        self.assertNotIn("Inactive candidate guidance", output)

    def test_unicode_append_frames_missing_final_newline(self):
        self.seed(self.record(title="قاعدة تجريبية", guidance="Reviewed café fixture"), final_newline=False)
        original = self.ledger.read_bytes()
        candidate_title = "ملاحظة تجريبية\u0085\u2028\u2029"
        result = self.candidate(title=candidate_title, guidance="Inactive café candidate")
        self.assertEqual(result.returncode, 0, result.stderr)
        appended = self.ledger.read_bytes()
        self.assertTrue(appended.startswith(original + b"\n"))
        rows = [json.loads(line) for line in appended.decode("utf-8").split("\n") if line]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[-1]["title"], candidate_title)
        self.assertEqual(rows[-1]["status"], "candidate")
        self.assertEqual(self.success("audit").strip(), "VALID lessons=2, verified=1")
        output = self.success("brief", "--tag", "sam")
        self.assertIn("Reviewed café fixture", output)
        self.assertNotIn("Inactive café candidate", output)

    def test_unsafe_or_missing_evidence_refuses_without_changing_bytes(self):
        self.seed(self.record())
        original = self.ledger.read_bytes()
        with tempfile.TemporaryDirectory() as outside:
            external = Path(outside) / "external.md"
            external.write_text("Outside fixture", encoding="utf-8")
            (self.root / "escape.md").symlink_to(external)
            for evidence in (None, "missing.md", str(external), "../external.md", "escape.md"):
                with self.subTest(evidence=evidence):
                    result = self.candidate(evidence=evidence)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("evidence", result.stderr)
                    self.assertEqual(self.ledger.read_bytes(), original)
        self.assertEqual(self.success("audit").strip(), "VALID lessons=1, verified=1")
        self.assertIn("fixture-approved", self.success("brief"))

    def test_invalid_candidate_metadata_refuses_without_changing_bytes(self):
        self.seed(self.record())
        original = self.ledger.read_bytes()
        cases = (
            {"id": "fixture-approved"}, {"id": "UPPERCASE"}, {"title": " "},
            {"title": "x" * 801}, {"trigger": " "}, {"guidance": "x" * 801},
            {"tag": "INVALID"}, {"tag": "x"}, {"tag": None},
        )
        for changes in cases:
            with self.subTest(changes=changes):
                result = self.candidate(**changes)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(self.ledger.read_bytes(), original)
        self.assertEqual(self.success("audit").strip(), "VALID lessons=1, verified=1")
        self.assertIn("fixture-approved", self.success("brief"))

    def test_invalid_existing_metadata_prevents_append(self):
        self.seed(self.record(status="approved"))
        original = self.ledger.read_bytes()
        self.assertNotEqual(self.cli("audit").returncode, 0)
        self.assertNotEqual(self.candidate().returncode, 0)
        self.assertEqual(self.ledger.read_bytes(), original)

    def test_retirement_fixture_removes_target_from_brief(self):
        self.seed(
            self.record(), self.record("fixture-other", guidance="Still active fixture"),
            self.record("fixture-retirement", status="retired", supersedes="fixture-approved"),
        )
        output = self.success("brief", "--tag", "engineering", "--tag", "sam")
        self.assertNotIn("fixture-approved", output)
        self.assertNotIn("fixture-retirement", output)
        self.assertIn("fixture-other", output)


if __name__ == "__main__":
    unittest.main()

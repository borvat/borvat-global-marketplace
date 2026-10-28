"""Disposable Git repositories exercise source identity and crash/replay behavior."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[2] / "tools/project_memory.py"


class MemoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "user.name", "Test")
        (self.root / "source.txt").write_text("original\n")
        (self.root / "proof.txt").write_text("actual synthetic evidence\n")
        (self.root / ".gitignore").write_text("generated/\n")
        self.config = {"schema_version": 1, "state_path": "memory/STATE.md", "history_path": "memory/HISTORY.md"}
        (self.root / ".project-memory.json").write_text(json.dumps(self.config))
        self.git("add", ".")
        self.git("commit", "-qm", "baseline")

    def git(self, *args):
        result = subprocess.run(["git", *args], cwd=self.root, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout.strip()

    def cli(self, command, event=None, ok=True):
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--root", str(self.root), command],
                                input=json.dumps(event) if event else None, text=True, capture_output=True)
        if ok:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertIn("MEMORY_UNAVAILABLE", result.stderr)
        return result

    def source(self):
        return json.loads(self.cli("snapshot").stdout)["source"]

    def event(self, identifier="task-one"):
        source = self.source()
        return {"schema_version": 1, "id": identifier, "recorded_at": "2026-10-27T12:00:00Z",
                "source": source, "status": "partial", "summary": "Bounded engineering result, deployment unverified.",
                "next_steps": ["Independent review pending"], "blockers": [], "evidence": ["proof.txt"],
                "tests": [{"name": "synthetic test", "status": "pass", "scope": "current", "source": source,
                           "evidence": ["proof.txt"]}], "deployment": {"status": "unverified"}}

    def outputs(self):
        return tuple((self.root / self.config[key]).read_bytes() for key in ("state_path", "history_path"))

    def module(self):
        spec = importlib.util.spec_from_file_location("memory_under_test", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_fresh_archive_and_identical_replay_have_one_effect(self):
        event = self.event()
        self.cli("archive", event)
        before = self.outputs()
        self.assertIn("CURRENT", self.cli("resume").stdout)
        self.assertIn("IDEMPOTENT", self.cli("archive", event).stdout)
        self.assertEqual(before, self.outputs())
        self.assertEqual(before[1].count(b'"id":"task-one"'), 1)

    def test_missing_metadata_is_explicitly_unavailable(self):
        self.cli("resume", ok=False)
        (self.root / ".project-memory.json").unlink()
        self.cli("snapshot", ok=False)

    def test_changed_and_untracked_source_are_stale_without_erasure(self):
        self.cli("archive", self.event())
        (self.root / "source.txt").write_text("unfinished edit\n")
        (self.root / "new-source.py").write_text("unfinished = True\n")
        result = self.cli("resume").stdout
        self.assertIn("STALE", result)
        self.assertIn("source.txt", result)
        self.assertIn("new-source.py", result)
        self.assertIn("HISTORICAL", result)
        self.assertEqual((self.root / "source.txt").read_text(), "unfinished edit\n")

    def test_bookkeeping_commit_is_current_content_with_explicit_changed_head(self):
        self.cli("archive", self.event())
        self.git("add", "memory")
        self.git("commit", "-qm", "memory bookkeeping")
        result = self.cli("resume").stdout
        self.assertIn("CURRENT_CONTENT", result)
        self.assertIn("HEAD_CHANGED", result)
        self.assertIn("HISTORICAL", result)

    def test_source_commit_with_identical_bytes_preserves_identity_warning(self):
        self.cli("archive", self.event())
        self.git("commit", "--allow-empty", "-qm", "new head")
        self.assertIn("HEAD_CHANGED", self.cli("resume").stdout)

    def test_changed_head_with_changed_content_is_stale(self):
        self.cli("archive", self.event())
        (self.root / "source.txt").write_text("new revision\n")
        self.git("add", "source.txt")
        self.git("commit", "-qm", "new source")
        self.assertIn("STALE", self.cli("resume").stdout)

    def test_conflicting_replay_and_stale_current_test_are_refused(self):
        event = self.event()
        self.cli("archive", event)
        before = self.outputs()
        event["summary"] = "Conflicting replay"
        self.cli("archive", event, ok=False)
        self.assertEqual(before, self.outputs())
        event = self.event("task-two")
        (self.root / "source.txt").write_text("changed after test\n")
        self.cli("archive", event, ok=False)
        self.assertEqual(before, self.outputs())

    def test_unsafe_config_and_evidence_cannot_write(self):
        event = self.event()
        for unsafe in ["../escape", "/tmp/escape", "memory/../escape", ".git/config", ""]:
            with self.subTest(unsafe=unsafe):
                event["evidence"] = [unsafe]
                self.cli("archive", event, ok=False)
        outside = self.root.parent / (self.root.name + "-outside")
        outside.write_text("outside")
        self.addCleanup(outside.unlink)
        (self.root / "escape").symlink_to(outside)
        event["evidence"] = ["escape"]
        self.cli("archive", event, ok=False)
        self.config["state_path"] = "../escape"
        (self.root / ".project-memory.json").write_text(json.dumps(self.config))
        self.cli("snapshot", ok=False)
        self.assertFalse((self.root / "memory").exists())

    def test_malformed_events_and_contradictory_current_pass_are_refused(self):
        event = self.event()
        for key, value in [("status", "approved"), ("summary", "x" * 1201), ("next_steps", ["x"] * 13),
                           ("recorded_at", "yesterday"), ("id", "../bad")]:
            bad = dict(event, **{key: value})
            self.cli("archive", bad, ok=False)
        event["tests"][0]["source"] = dict(event["source"], head="0" * 40)
        self.cli("archive", event, ok=False)
        event = self.event()
        event["deployment"] = {"status": "observed", "identity": "deployment-id", "evidence": []}
        self.cli("archive", event, ok=False)

    def test_complete_result_cannot_claim_a_failed_current_test(self):
        event = self.event()
        event["status"] = "complete"
        event["tests"][0]["status"] = "fail"
        self.cli("archive", event, ok=False)

    def test_frozen_evidence_keys_must_match_the_recorded_paths(self):
        self.cli("archive", self.event())
        path = self.root / "memory/HISTORY.md"
        path.write_text(path.read_text().replace('"evidence_sha256":{"proof.txt":', '"evidence_sha256":{"unknown.txt":'))
        self.cli("resume", ok=False)

    def test_existing_prose_and_history_bytes_are_preserved(self):
        (self.root / "memory").mkdir()
        state = b"# Existing state\n\nHistorical prose, not approved guidance.\n"
        history = b"# Existing history\n\nOriginal historical evidence.\n"
        (self.root / "memory/STATE.md").write_bytes(state)
        (self.root / "memory/HISTORY.md").write_bytes(history)
        self.cli("archive", self.event())
        self.assertTrue(self.outputs()[0].startswith(state))
        self.assertTrue(self.outputs()[1].startswith(history))
        before_history = self.outputs()[1]
        self.cli("archive", self.event("task-two"))
        self.assertTrue(self.outputs()[1].startswith(before_history))
        self.assertEqual(self.outputs()[0].count(b"project-memory-state-v1"), 1)

    def test_existing_crlf_bytes_survive_archive(self):
        (self.root / "memory").mkdir()
        old = b"# Existing\r\n\r\nExact historical bytes.\r\n"
        for name in ("STATE.md", "HISTORY.md"):
            (self.root / "memory" / name).write_bytes(old)
        self.cli("archive", self.event())
        self.assertTrue(all(content.startswith(old) for content in self.outputs()))

    def test_resume_bounding_preserves_dirty_count_and_notice(self):
        self.cli("archive", self.event())
        for index in range(150):
            (self.root / f"unfinished-{index:03}.txt").write_text("unfinished")
        result = json.loads(self.cli("resume").stdout)
        self.assertLessEqual(len(result["current"]["dirty_paths"]), 100)
        self.assertEqual(result["current"]["dirty_paths_total"], 152)
        self.assertEqual(result["current"]["dirty_paths_omitted"], 52)

    def test_duplicate_json_keys_cannot_change_memory(self):
        self.cli("archive", self.event())
        before = self.outputs()
        raw = json.dumps(self.event("task-two")).replace('"id": "task-two"', '"id":"task-two","id":"task-three"')
        result = subprocess.run([sys.executable, "-B", str(SCRIPT), "--root", str(self.root), "archive"],
                                input=raw, text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(before, self.outputs())

    def test_tampered_history_or_state_fails_closed(self):
        self.cli("archive", self.event())
        path = self.root / "memory/HISTORY.md"
        path.write_text(path.read_text().replace("Bounded engineering", "Altered engineering"))
        self.cli("resume", ok=False)
        self.cli("archive", self.event("task-two"), ok=False)

    def test_ignored_generated_files_do_not_change_identity(self):
        before = self.source()
        (self.root / "generated").mkdir()
        (self.root / "generated/runtime.py").write_text("runtime")
        self.assertEqual(before, self.source())

    def test_sparse_skip_worktree_identity_matches_full_checkout(self):
        before = self.source()
        self.git("update-index", "--skip-worktree", "source.txt")
        (self.root / "source.txt").unlink()
        self.assertEqual(before, self.source())
        self.git("update-index", "--no-skip-worktree", "source.txt")
        self.assertNotEqual(before, self.source())

    def gitlink(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        repository = Path(temporary.name)
        self.git("-C", str(repository), "init", "-q")
        self.git("-C", str(repository), "config", "user.email", "test@example.invalid")
        self.git("-C", str(repository), "config", "user.name", "Test")
        (repository / "module.txt").write_text("pinned source\n")
        self.git("-C", str(repository), "add", "module.txt")
        self.git("-C", str(repository), "commit", "-qm", "module baseline")
        pin = self.git("-C", str(repository), "rev-parse", "HEAD")
        self.git("update-index", "--add", "--cacheinfo", "160000," + pin + ",vendor/module")
        return repository, self.root / "vendor/module", pin

    def test_submodule_absent_empty_and_sparse_identity_use_index_pin(self):
        _, path, _ = self.gitlink()
        absent = self.source()
        path.mkdir(parents=True)
        self.assertEqual(absent, self.source())
        self.git("update-index", "--skip-worktree", "vendor/module")
        path.rmdir()
        self.assertEqual(absent, self.source())

    def test_submodule_initialized_clean_pin_matches_absent_identity(self):
        repository, path, _ = self.gitlink()
        absent = self.source()
        shutil.copytree(repository, path)
        self.assertEqual(absent, self.source())

    def test_submodule_changed_actual_head_is_stale(self):
        repository, path, pin = self.gitlink()
        shutil.copytree(repository, path)
        self.cli("archive", self.event())
        self.git("-C", str(path), "commit", "--allow-empty", "-qm", "different module HEAD")
        self.assertNotEqual(self.git("-C", str(path), "rev-parse", "HEAD"), pin)
        self.assertIn("STALE", self.cli("resume").stdout)

    def test_submodule_dirty_tracked_and_untracked_materializations_are_refused(self):
        repository, path, _ = self.gitlink()
        shutil.copytree(repository, path)
        (path / "module.txt").write_text("unfinished module edit\n")
        self.assertIn("dirty submodule", self.cli("snapshot", ok=False).stderr)
        self.git("-C", str(path), "restore", "module.txt")
        (path / "new.txt").write_text("unfinished new module file\n")
        self.assertIn("dirty submodule", self.cli("snapshot", ok=False).stderr)

    def test_submodule_nonempty_without_own_git_root_is_refused(self):
        _, path, _ = self.gitlink()
        path.mkdir(parents=True)
        (path / "module.txt").write_text("unverified materialization\n")
        self.assertIn("Git root", self.cli("snapshot", ok=False).stderr)

    def test_submodule_foreign_git_worktree_root_is_refused(self):
        repository, path, _ = self.gitlink()
        self.git("-C", str(repository), "config", "core.worktree", str(repository))
        path.mkdir(parents=True)
        (path / ".git").write_text("gitdir: " + str(repository / ".git") + "\n")
        self.assertIn("Git root", self.cli("snapshot", ok=False).stderr)

    def test_submodule_unmerged_parent_index_is_refused(self):
        _, _, pin = self.gitlink()
        self.git("update-index", "--force-remove", "vendor/module")
        result = subprocess.run(["git", "update-index", "--index-info"], cwd=self.root, text=True,
                                input="160000 " + pin + " 1\tvendor/module\n160000 " + pin + " 2\tvendor/module\n",
                                capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("unmerged source", self.cli("snapshot", ok=False).stderr)

    def test_pending_conflicting_retries_preserve_files_and_journal_before_matching_recovery(self):
        module = self.module()
        event = self.event()
        original = module.atomic_write
        state_path = self.root / self.config["state_path"]
        def interrupt(path, data):
            if path == state_path:
                raise OSError("simulated interruption before state replace")
            return original(path, data)
        with mock.patch.object(module, "atomic_write", side_effect=interrupt):
            with self.assertRaises(OSError):
                module.archive(self.root, event)
        history_path = self.root / self.config["history_path"]
        _, pending = module.internal_paths(self.root)
        def saved():
            return tuple(path.read_bytes() if path.exists() else None for path in [state_path, history_path, pending])
        before = saved()
        for bad in [dict(event, summary="conflicting same ID"), {"id": event["id"]},
                    dict(event, id="unrelated-event"), dict(event, schema_version=True), {}]:
            with self.subTest(event=bad):
                with self.assertRaises(ValueError):
                    module.archive(self.root, bad)
                self.assertEqual(before, saved())
        self.cli("archive", event)
        self.assertFalse(pending.exists())
        self.assertEqual(history_path.read_bytes().count(b'"id":"task-one"'), 1)
        after = self.outputs()
        self.assertIn("IDEMPOTENT", self.cli("archive", event).stdout)
        self.assertEqual(after, self.outputs())

    def test_recover_after_history_write_is_idempotent_and_detects_external_edits(self):
        module = self.module()
        event = self.event()
        original = module.atomic_write
        state_path = self.root / self.config["state_path"]
        def interrupt(path, data):
            if path == state_path:
                raise OSError("simulated interruption before state replace")
            return original(path, data)
        with mock.patch.object(module, "atomic_write", side_effect=interrupt):
            with self.assertRaises(OSError):
                module.archive(self.root, event)
        history = (self.root / self.config["history_path"]).read_bytes()
        self.cli("resume", ok=False)
        self.cli("recover")
        self.assertEqual(history, self.outputs()[1])
        self.cli("archive", event)
        self.assertEqual(history, self.outputs()[1])
        # Another interrupted transaction must not overwrite a concurrent manual edit.
        event = self.event("task-two")
        with mock.patch.object(module, "atomic_write", side_effect=interrupt):
            with self.assertRaises(OSError):
                module.archive(self.root, event)
        state_path.write_text(state_path.read_text() + "manual edit\n")
        self.cli("recover", ok=False)
        self.assertTrue(state_path.read_text().endswith("manual edit\n"))

    def test_concurrent_identical_archives_write_one_event(self):
        event = self.event()
        argv = [sys.executable, "-B", str(SCRIPT), "--root", str(self.root), "archive"]
        children = [subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True) for _ in range(2)]
        for child in children:
            child.stdin.write(json.dumps(event))
            child.stdin.close()
            child.stdin = None
        for child in children:
            stdout, stderr = child.communicate(timeout=10)
            self.assertEqual(child.returncode, 0, stderr + stdout)
        self.assertEqual(self.outputs()[1].count(b'"id":"task-one"'), 1)


if __name__ == "__main__":
    unittest.main()

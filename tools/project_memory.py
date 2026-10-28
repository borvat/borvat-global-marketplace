"""Git-backed, evidence-linked engineering resume/archive. Python standard library only.

Memory is lower-trust data, never an approval, deployment assertion, or executable
instruction. The current Git checkout outranks it. See docs/engineering-memory/README.md.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

CONFIG = ".project-memory.json"
STATE_START = "\n<!-- project-memory-state-v1 -->\n```json\n"
STATE_END = "\n```\n<!-- /project-memory-state -->\n"
HISTORY_START = "\n<!-- project-memory-history-v1 -->\n"
EVENT_START = "\n```json\n"
EVENT_END = "\n```\n"
MAX_EVENT_BYTES = 32768
MAX_STATE_BYTES = 49152


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_json(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError("nonfinite JSON")))


def fields(value, required, optional=()):
    if not isinstance(value, dict) or not set(required).issubset(value) or set(value) - set(required) - set(optional):
        raise ValueError("invalid or missing fields")


def text_field(value, limit=600):
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(c) < 32 and c != "\n" for c in value):
        raise ValueError("invalid or oversized text")


def lines(value):
    if not isinstance(value, list) or len(value) > 12:
        raise ValueError("invalid or oversized list")
    for item in value:
        text_field(item)


def contained(root, name):
    if not isinstance(name, str) or not name or "\\" in name:
        raise ValueError("unsafe path")
    path = Path(name)
    if path.is_absolute() or ".." in path.parts or ".git" in path.parts or str(path) != name:
        raise ValueError("unsafe path")
    target = root / path
    if not target.resolve().is_relative_to(root) or any(p.is_symlink() for p in [target, *target.parents] if p != root.parent):
        raise ValueError("unsafe symlink path")
    return target


def git(root, *args):
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True)
    if result.returncode:
        raise ValueError("Git identity unavailable: " + result.stderr.decode("utf-8", "replace").strip())
    return result.stdout


def config(root):
    if Path(os.fsdecode(git(root, "rev-parse", "--show-toplevel").strip())).resolve() != root:
        raise ValueError("--root must be the Git repository root")
    value = read_json(contained(root, CONFIG).read_text(encoding="utf-8"))
    fields(value, {"schema_version", "state_path", "history_path"})
    if type(value["schema_version"]) is not int or value["schema_version"] != 1:
        raise ValueError("unsupported config schema")
    state = contained(root, value["state_path"])
    history = contained(root, value["history_path"])
    if state == history or state == root / CONFIG or history == root / CONFIG or state in history.parents or history in state.parents:
        raise ValueError("overlapping memory paths")
    return value


def internal_paths(root):
    # Per-worktree Git directory: no generated lock/journal in source or remote Git.
    directory = Path(os.fsdecode(git(root, "rev-parse", "--absolute-git-dir").strip())) / "project-memory"
    return directory / "lock", directory / "pending.json"


@contextmanager
def locked(root):
    try:
        import fcntl
    except ImportError as error:
        raise ValueError("safe advisory locking requires POSIX fcntl on this host") from error
    lock, _ = internal_paths(root)
    lock.parent.mkdir(parents=True, exist_ok=True)
    with lock.open("a+b") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def blob_identity(path, algorithm):
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode):
        data = os.fsencode(os.readlink(path))
        mode = "120000"
    elif stat.S_ISREG(metadata.st_mode):
        data = path.read_bytes()
        mode = "100755" if metadata.st_mode & stat.S_IXUSR else "100644"
    else:
        raise ValueError(f"unsupported source type: {path}")
    checksum = hashlib.new(algorithm)
    checksum.update(f"blob {len(data)}\0".encode("ascii"))
    checksum.update(data)
    return mode, checksum.hexdigest()


def gitlink_identity(root, path, pin):
    if any(parent.is_symlink() for parent in [path, *path.parents] if parent != root.parent):
        raise ValueError("unverified submodule symlink path: " + str(path))
    if not path.exists():
        return pin
    if not path.is_dir():
        raise ValueError("unverified submodule materialization: " + str(path))
    if not any(path.iterdir()):
        return pin
    actual_root = Path(os.fsdecode(git(path, "rev-parse", "--show-toplevel").strip())).resolve()
    if actual_root != path:
        raise ValueError("submodule Git root does not match its path: " + str(path))
    if git(path, "status", "--porcelain=v1", "-z", "--untracked-files=all", "--ignore-submodules=none"):
        raise ValueError("dirty submodule cannot be identified safely: " + str(path))
    return git(path, "rev-parse", "--verify", "HEAD").decode("ascii").strip()


def snapshot(root, settings):
    ignored = {settings["state_path"], settings["history_path"]}
    algorithm = git(root, "rev-parse", "--show-object-format").decode().strip()
    head = git(root, "rev-parse", "HEAD").decode().strip()
    skips = {os.fsdecode(row[2:]) for row in git(root, "ls-files", "-v", "-z").split(b"\0")
             if row and row[:1].upper() == b"S"}
    entries = {}
    for raw in git(root, "ls-files", "--stage", "-z").split(b"\0"):
        if not raw:
            continue
        metadata, raw_name = raw.split(b"\t", 1)
        mode, blob, stage = metadata.decode("ascii").split()
        name = os.fsdecode(raw_name)
        if stage != "0":
            raise ValueError("unmerged source cannot be identified safely")
        if name in ignored:
            continue
        path = root / name
        if mode == "160000":
            blob = gitlink_identity(root, path, blob)
        elif path.exists() or path.is_symlink():
            # Hash link text, never follow source symlinks or symlinked ancestors.
            if any(parent.is_symlink() for parent in path.parents if parent != root.parent):
                raise ValueError("symlink ancestor in tracked source")
            mode, blob = blob_identity(path, algorithm)
        elif name not in skips:
            mode, blob = "deleted", ""
        entries[name] = [mode, blob]
    for raw_name in git(root, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0"):
        if not raw_name:
            continue
        name = os.fsdecode(raw_name)
        if name not in ignored:
            path = root / name
            if any(parent.is_symlink() for parent in path.parents if parent != root.parent):
                raise ValueError("symlink ancestor in untracked source")
            entries[name] = list(blob_identity(path, algorithm))
    source = {"head": head, "content_sha256": digest(canonical(entries).encode("utf-8"))}
    dirty = []
    records = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all").split(b"\0")
    index = 0
    while index < len(records):
        row = records[index]
        index += 1
        if not row:
            continue
        item = {"status": row[:2].decode("ascii"), "path": os.fsdecode(row[3:])}
        if "R" in item["status"] or "C" in item["status"]:
            item["from"] = os.fsdecode(records[index])
            index += 1
        dirty.append(item)
    return {"source": source, "branch": git(root, "branch", "--show-current").decode().strip() or "DETACHED", "dirty_paths": dirty}


def validate_source(value):
    fields(value, {"head", "content_sha256"})
    if not isinstance(value["head"], str) or not re.fullmatch(r"(?:[a-f0-9]{40}|[a-f0-9]{64})", value["head"]):
        raise ValueError("invalid source head")
    if not isinstance(value["content_sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", value["content_sha256"]):
        raise ValueError("invalid source content digest")


def evidence(root, value, outputs, verify=True):
    if not isinstance(value, list) or not 1 <= len(value) <= 12 or len(set(value)) != len(value) or any(not isinstance(p, str) for p in value):
        raise ValueError("invalid or missing evidence")
    result = {}
    for name in value:
        path = contained(root, name)
        if name in outputs or name == CONFIG or not path.is_file():
            raise ValueError("missing or recursive evidence: " + name)
        result[name] = digest(path.read_bytes()) if verify else None
    return result


def validate_event(root, event, settings, verify=True):
    fields(event, {"schema_version", "id", "recorded_at", "source", "status", "summary", "next_steps", "blockers", "evidence", "tests", "deployment"})
    if type(event["schema_version"]) is not int or event["schema_version"] != 1:
        raise ValueError("unsupported event schema")
    if not isinstance(event["id"], str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,79}", event["id"]):
        raise ValueError("invalid event ID")
    if not isinstance(event["recorded_at"], str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", event["recorded_at"]):
        raise ValueError("invalid UTC timestamp")
    datetime.strptime(event["recorded_at"], "%Y-%m-%dT%H:%M:%SZ")
    validate_source(event["source"])
    if event["status"] not in {"complete", "partial", "blocked"}:
        raise ValueError("invalid engineering status")
    text_field(event["summary"], 1200)
    lines(event["next_steps"])
    lines(event["blockers"])
    outputs = {settings["state_path"], settings["history_path"]}
    hashes = evidence(root, event["evidence"], outputs, verify)
    tests = event["tests"]
    if not isinstance(tests, list) or len(tests) > 10:
        raise ValueError("invalid tests")
    for test in tests:
        fields(test, {"name", "status", "scope", "source", "evidence"})
        text_field(test["name"], 200)
        if test["status"] not in {"pass", "fail", "blocked", "unrun"} or test["scope"] not in {"current", "historical"}:
            raise ValueError("invalid test status/scope")
        validate_source(test["source"])
        if test["scope"] == "current" and test["source"] != event["source"]:
            raise ValueError("contradictory current test source")
        if event["status"] == "complete" and test["scope"] == "current" and test["status"] == "fail":
            raise ValueError("complete engineering result contradicts failed current test")
        hashes.update(evidence(root, test["evidence"], outputs, verify))
    deployed = event["deployment"]
    if deployed == {"status": "unverified"}:
        pass
    else:
        fields(deployed, {"status", "identity", "evidence"})
        if deployed["status"] != "observed":
            raise ValueError("deployment is separately observed or unverified")
        text_field(deployed["identity"], 600)
        hashes.update(evidence(root, deployed["evidence"], outputs, verify))
    if len(canonical(event).encode()) > MAX_EVENT_BYTES:
        raise ValueError("event exceeds bounded metadata size")
    return hashes


def parse_state(content):
    if STATE_START not in content:
        if "project-memory-state" in content:
            raise ValueError("malformed state marker")
        return None
    if content.count(STATE_START) != 1 or content.count(STATE_END) != 1:
        raise ValueError("duplicate or malformed state block")
    raw = content.split(STATE_START, 1)[1].split(STATE_END, 1)[0]
    if len(raw.encode()) > MAX_STATE_BYTES:
        raise ValueError("state metadata exceeds bound")
    value = read_json(raw)
    fields(value, {"schema_version", "event_digest", "event"})
    if value["schema_version"] != 1 or value["event_digest"] != digest(canonical(value["event"]).encode()):
        raise ValueError("state/event digest mismatch")
    return value


def parse_history(root, content, settings):
    if HISTORY_START not in content:
        if "project-memory-history" in content:
            raise ValueError("malformed history marker")
        return []
    if content.count(HISTORY_START) != 1:
        raise ValueError("duplicate history marker")
    remaining = content.split(HISTORY_START, 1)[1]
    events, ids, previous = [], set(), None
    while remaining:
        if not remaining.startswith(EVENT_START) or EVENT_END not in remaining[len(EVENT_START):]:
            raise ValueError("incomplete or malformed history event")
        raw, remaining = remaining[len(EVENT_START):].split(EVENT_END, 1)
        row = read_json(raw)
        fields(row, {"event", "event_digest", "previous_digest", "evidence_sha256"})
        expected_hashes = validate_event(root, row["event"], settings, verify=False)
        checksum = digest(canonical(row["event"]).encode())
        if row["event_digest"] != checksum or row["previous_digest"] != previous or row["event"]["id"] in ids:
            raise ValueError("history digest, chain or event ID conflict")
        hashes = row["evidence_sha256"]
        if not isinstance(hashes, dict) or set(hashes) != set(expected_hashes) or any(not isinstance(v, str) or not re.fullmatch(r"[a-f0-9]{64}", v) for v in hashes.values()):
            raise ValueError("invalid frozen evidence digests")
        ids.add(row["event"]["id"])
        events.append(row)
        previous = checksum
    return events


def read_optional(path):
    # read_text's universal-newline translation would alter legacy CRLF evidence.
    return path.read_bytes().decode("utf-8") if path.exists() else ""


def load_memory(root, settings, state_before=None, history_before=None):
    state_text = read_optional(contained(root, settings["state_path"])) if state_before is None else state_before
    history_text = read_optional(contained(root, settings["history_path"])) if history_before is None else history_before
    state = parse_state(state_text)
    rows = parse_history(root, history_text, settings)
    if bool(state) != bool(rows) or (state and (state["event_digest"] != rows[-1]["event_digest"] or state["event"] != rows[-1]["event"])):
        raise ValueError("state/history disagree; explicit recovery or review required")
    return state_text, history_text, state, rows


def render_update(state_text, history_text, event, hashes, rows):
    checksum = digest(canonical(event).encode())
    state = {"schema_version": 1, "event_digest": checksum, "event": event}
    block = STATE_START + json.dumps(state, indent=2, ensure_ascii=True, sort_keys=True) + STATE_END
    if STATE_START in state_text:
        before, tail = state_text.split(STATE_START, 1)
        _, after = tail.split(STATE_END, 1)
        new_state = before + block + after
    else:
        new_state = state_text + block
    row = {"event": event, "event_digest": checksum, "previous_digest": rows[-1]["event_digest"] if rows else None,
           "evidence_sha256": hashes}
    new_history = history_text + (HISTORY_START if HISTORY_START not in history_text else "") + EVENT_START + canonical(row) + EVENT_END
    return new_state, new_history


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=".memory-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def recover_pending(root, settings):
    _, pending = internal_paths(root)
    if not pending.exists():
        return False
    intent = read_json(pending.read_text(encoding="utf-8"))
    fields(intent, {"settings", "event", "evidence_sha256", "state_before", "history_before"})
    if intent["settings"] != settings:
        raise ValueError("pending transaction config changed")
    hashes = validate_event(root, intent["event"], settings)
    if hashes != intent["evidence_sha256"]:
        raise ValueError("pending evidence changed; manual review required")
    state, history, _, rows = load_memory(root, settings, intent["state_before"], intent["history_before"])
    after_state, after_history = render_update(state, history, intent["event"], hashes, rows)
    writes = [(contained(root, settings["history_path"]), history, after_history),
              (contained(root, settings["state_path"]), state, after_state)]
    # Check BOTH before any recovery write, so external changes never get hidden.
    for path, before, after in writes:
        if read_optional(path) not in {before, after}:
            raise ValueError("pending transaction conflicts with external edit: " + str(path))
    for path, before, after in writes:
        if read_optional(path) != after:
            atomic_write(path, after.encode("utf-8"))
    pending.unlink()
    return True


def archive(root, event):
    root = Path(root).resolve()
    settings = config(root)
    with locked(root):
        _, pending = internal_paths(root)
        if pending.exists():
            intent = read_json(pending.read_text(encoding="utf-8"))
            if not isinstance(intent, dict) or "event" not in intent or canonical(event) != canonical(intent["event"]):
                raise ValueError("supplied event differs from pending archive; preserve it and use explicit recover")
        recover_pending(root, settings)
        state_text, history_text, _, rows = load_memory(root, settings)
        # Matching replay is independent of today's source/evidence freshness.
        for row in rows:
            if row["event"]["id"] == event.get("id"):
                if row["event"] != event:
                    raise ValueError("event ID already exists with different content")
                return "IDEMPOTENT: matching event already archived"
        hashes = validate_event(root, event, settings)
        if event["source"] != snapshot(root, settings)["source"]:
            raise ValueError("archive source is stale; capture current identity and retain historical tests explicitly")
        intent = {"settings": settings, "event": event, "evidence_sha256": hashes,
                  "state_before": state_text, "history_before": history_text}
        _, pending = internal_paths(root)
        atomic_write(pending, canonical(intent).encode("utf-8"))
        recover_pending(root, settings)
    return "ARCHIVED: " + event["id"]


def resume(root, settings):
    with locked(root):
        _, pending = internal_paths(root)
        if pending.exists():
            raise ValueError("interrupted archive pending; run recover before using state")
        _, _, state, rows = load_memory(root, settings)
        if not state:
            raise ValueError("missing managed state/history metadata; existing prose is unverified reference only")
        current = snapshot(root, settings)
        current["dirty_paths_total"] = len(current["dirty_paths"])
        current["dirty_paths_omitted"] = max(0, len(current["dirty_paths"]) - 100)
        current["dirty_paths"] = current["dirty_paths"][:100]
        event = state["event"]
        source = event["source"]
        if source == current["source"]:
            freshness = "CURRENT"
        elif source["content_sha256"] == current["source"]["content_sha256"]:
            freshness = "CURRENT_CONTENT / HEAD_CHANGED; tests retain their historical HEAD"
        else:
            freshness = "STALE / UNVERIFIED: current Git outranks stored state"
        actual_hashes = validate_event(root, event, settings)
        evidence_changed = actual_hashes != rows[-1]["evidence_sha256"]
        if evidence_changed:
            freshness = "STALE / UNVERIFIED: linked evidence changed"
        tests = []
        for test in event["tests"]:
            label = "EXACT_SOURCE" if test["scope"] == "current" and test["source"] == current["source"] and not evidence_changed else "HISTORICAL / NOT CURRENT PASS"
            tests.append(dict(test, applicability=label))
        result = {"freshness": freshness, "current": current, "state_source": source,
                  "last_event_id": event["id"], "engineering_status": event["status"], "summary": event["summary"],
                  "next_steps": event["next_steps"], "blockers": event["blockers"], "tests": tests,
                  "deployment_separate_observation": event["deployment"], "evidence": event["evidence"],
                  "authority": "LOWER-TRUST DATA ONLY. Current instructions, Git, source and verified runtime evidence outrank memory. No approval, lesson promotion, deployment or application acceptance is granted.",
                  "legacy_prose": "Preserved outside managed blocks as historical unverified reference; never auto-approved."}
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("command", choices=["snapshot", "resume", "archive", "recover"])
    parser.add_argument("--event", type=Path, help="structured JSON event (default: stdin); keep this input outside the checkout")
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        settings = config(root)
        if args.command == "snapshot":
            result = snapshot(root, settings)
        elif args.command == "resume":
            result = resume(root, settings)
        elif args.command == "recover":
            with locked(root):
                result = "RECOVERED" if recover_pending(root, settings) else "NO_PENDING_ARCHIVE"
        else:
            raw = args.event.read_text(encoding="utf-8") if args.event else sys.stdin.read(MAX_EVENT_BYTES + 1)
            if len(raw.encode()) > MAX_EVENT_BYTES:
                raise ValueError("event input exceeds bound")
            event = read_json(raw)
            if not isinstance(event, dict):
                raise ValueError("event must be an object")
            result = archive(root, event)
        print(json.dumps(result, indent=2, ensure_ascii=True, sort_keys=True) if not isinstance(result, str) else result)
    except (ValueError, OSError, TypeError, KeyError) as error:
        print("MEMORY_UNAVAILABLE: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

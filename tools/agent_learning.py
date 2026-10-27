"""Evidence-gated, standard-library-only lesson memory for BMad tasks."""
import argparse
import json
from pathlib import Path
import re
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "docs/engineering-memory/lessons.jsonl"

def validate_evidence(evidence, root):
    if not isinstance(evidence, list) or not evidence or any(not isinstance(x, str) for x in evidence):
        raise ValueError("invalid or missing evidence")
    for source in evidence:
        path = Path(source)
        if not source or path.is_absolute() or ".." in path.parts or not (root/path).resolve().is_relative_to(root.resolve()) or not (root/path).is_file():
            raise ValueError(f"missing or unsafe evidence: {source}")

def validate_record(value, root, ids):
    required = {"id", "recorded_at", "status", "title", "trigger", "guidance", "tags", "evidence"}
    if not isinstance(value, dict) or not required.issubset(value) or set(value) - required - {"supersedes"}:
        raise ValueError("invalid fields")
    identifier = value["id"]
    if not isinstance(identifier, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{2,79}", identifier) or identifier in ids:
        raise ValueError("invalid or duplicate ID")
    if value["status"] not in {"candidate", "verified", "retired"}:
        raise ValueError("invalid status")
    for field in ("title", "trigger", "guidance"):
        if not isinstance(value[field], str) or not value[field].strip() or len(value[field]) > 800:
            raise ValueError(f"invalid {field}")
    if not isinstance(value["recorded_at"], str) or date.fromisoformat(value["recorded_at"]).isoformat() != value["recorded_at"]:
        raise ValueError("invalid date")
    if not isinstance(value["tags"], list) or not value["tags"] or any(not isinstance(t,str) or not re.fullmatch(r"[a-z0-9-]{2,40}",t) for t in value["tags"]):
        raise ValueError("invalid tags")
    validate_evidence(value["evidence"], root)
    if value["status"] == "retired":
        if not isinstance(value.get("supersedes"), str):
            raise ValueError("missing supersedes")
    elif "supersedes" in value:
        raise ValueError("only retirement may supersede")

def load(root=ROOT, ledger=LEDGER):
    result, ids = [], set()
    for number, raw in enumerate(ledger.read_text(encoding="utf-8").split("\n"), 1):
        if not raw.strip():
            continue
        value = json.loads(raw)
        try:
            validate_record(value, root, ids)
        except ValueError as error:
            raise ValueError(f"line {number}: {error}") from error
        ids.add(value["id"])
        result.append(value)
    for row in result:
        if row["status"] == "retired" and (row["supersedes"] not in ids or row["supersedes"] == row["id"]):
            raise ValueError("invalid retirement target")
    return result

def brief(rows, tags):
    retired = {x["supersedes"] for x in rows if x["status"] == "retired"}
    selected = [x for x in rows if x["status"] == "verified" and x["id"] not in retired and
                (not tags or set(tags).intersection(x["tags"]) or "general" in x["tags"])]
    return "\n".join(f'- [{x["id"]}] WHEN {x["trigger"]} => {x["guidance"]} (evidence: {", ".join(x["evidence"])})' for x in selected) or "No verified lessons match. UNKNOWN is not PASS."

def main():
    p=argparse.ArgumentParser()
    p.add_argument("command",choices=["audit","brief","add-candidate"])
    p.add_argument("--tag",action="append",default=[])
    for name in ("id","title","trigger","guidance"):
        p.add_argument("--"+name)
    p.add_argument("--evidence",action="append",default=[])
    args=p.parse_args()
    rows=load()
    if args.command=="audit":
        print(f"VALID lessons={len(rows)}, verified={sum(x['status']=='verified' for x in rows)}")
    elif args.command=="brief":
        print(brief(rows,args.tag))
    else:
        if any(not getattr(args,name) for name in ("id","title","trigger","guidance")) or not args.tag:
            p.error("add-candidate requires --id --title --trigger --guidance --tag")
        row={"id":args.id,"recorded_at":date.today().isoformat(),"status":"candidate","title":args.title,
             "trigger":args.trigger,"guidance":args.guidance,"tags":args.tag,"evidence":args.evidence}
        try:
            validate_record(row, ROOT, {x["id"] for x in rows})
        except ValueError as error:
            p.error(str(error))
        existing = LEDGER.read_bytes()
        separator = "\n" if existing and not existing.endswith(b"\n") else ""
        with LEDGER.open("a",encoding="utf-8") as f:
            f.write(separator+json.dumps(row,ensure_ascii=False,sort_keys=True)+"\n")
        print("Candidate recorded; not activated")
if __name__=="__main__":
    main()

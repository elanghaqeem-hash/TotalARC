#!/usr/bin/env python3
import json
import os
import re
import subprocess
import time

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(
            ["npx", "wrangler", *args],
            text=True,
            env=os.environ,
            capture_output=True,
        )
        if p.returncode == 0:
            return p.stdout
        last = p
        time.sleep(2 + attempt * 2)
    print((last.stdout if last else "")[-5000:])
    print((last.stderr if last else "")[-5000:])
    raise RuntimeError("WRANGLER_COMMAND_FAILED")

dbs = json.loads(wr(["d1", "list", "--json"]))
requested_id = str(os.environ.get("TOTALARC_D1_DATABASE_ID") or "").strip()
requested_name = str(os.environ.get("TOTALARC_D1_DATABASE_NAME") or "").strip()

def db_id(item):
    return str(item.get("uuid") or item.get("id") or "").strip()

if requested_id:
    db = next((x for x in dbs if db_id(x) == requested_id), None)
elif requested_name:
    db = next((x for x in dbs if str(x.get("name") or "").strip() == requested_name), None)
else:
    candidates = [x for x in dbs if re.search(r"total.?arc", str(x.get("name", "")), re.I)]
    db = candidates[0] if len(candidates) == 1 else None

if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND_OR_AMBIGUOUS")

DB = str(db.get("name") or "").strip()

def rows(sql):
    raw = json.loads(wr(["d1", "execute", DB, "--remote", "--json", "--command", sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [r for block in raw for r in (block.get("results") or [])]

tables = {str(row.get("name") or "") for row in rows(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='ControlDeficiency'"
)}
if "ControlDeficiency" not in tables:
    print("ControlDeficiency does not exist yet; runtime schema creation will create the current definition.")
    raise SystemExit(0)

columns = {str(row.get("name") or "") for row in rows("PRAGMA table_info(ControlDeficiency)")}
migrations = []
if "humanApproved" not in columns:
    migrations.append("ALTER TABLE ControlDeficiency ADD COLUMN humanApproved INTEGER NOT NULL DEFAULT 0")
if "approvedBy" not in columns:
    migrations.append("ALTER TABLE ControlDeficiency ADD COLUMN approvedBy TEXT")

for sql in migrations:
    wr(["d1", "execute", DB, "--remote", "--command", sql])

after = {str(row.get("name") or "") for row in rows("PRAGMA table_info(ControlDeficiency)")}
required = {"humanApproved", "approvedBy"}
missing = sorted(required - after)
if missing:
    raise RuntimeError("ASSURANCE_SCHEMA_MIGRATION_INCOMPLETE:" + ",".join(missing))

print(json.dumps({
    "database": DB,
    "migration": "ASSURANCE_CONTROL_DEFICIENCY_COLUMNS_V1",
    "changed": len(migrations),
    "requiredColumnsReady": True
}, indent=2))

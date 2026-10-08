#!/usr/bin/env python3
"""Additive ICOFR D1 migration based on the existing PR #281 artifact."""
import json
import os
import subprocess
import time
from pathlib import Path

database_id = str(os.getenv("TOTALARC_D1_DATABASE_ID") or "").strip()
database_name = str(os.getenv("TOTALARC_D1_DATABASE_NAME") or "").strip()
if not database_id or not database_name:
    raise RuntimeError("PRODUCTION_D1_PIN_REQUIRED")
config = json.loads(Path("wrangler.production.json").read_text(encoding="utf-8"))
bindings = [b for b in config.get("d1_databases", []) if b.get("binding") == "DB"]
if len(bindings) != 1 or str(bindings[0].get("database_id")) != database_id or str(bindings[0].get("database_name")) != database_name:
    raise RuntimeError("PRODUCTION_D1_BINDING_MISMATCH")

def rows(sql):
    for retry in range(3):
        p = subprocess.run(
            ["npx", "wrangler", "d1", "execute", database_name, "--remote", "--json",
             "--config", "wrangler.production.json", "--command", sql],
            capture_output=True, text=True, env=os.environ, timeout=90,
        )
        if p.returncode == 0:
            payload = json.loads(p.stdout)
            if not isinstance(payload, list) or any(block.get("success") is False for block in payload):
                raise RuntimeError("D1_EXECUTION_UNSUCCESSFUL")
            return [r for block in payload for r in block.get("results", [])]
        time.sleep(2 * (retry + 1))
    raise RuntimeError("D1_SCHEMA_EXECUTION_FAILED")

present = rows("SELECT name FROM sqlite_master WHERE type='table' AND name='ControlDeficiency'")
if len(present) != 1:
    raise RuntimeError("ICOFR_CONTROL_DEFICIENCY_TABLE_MISSING")
columns = {str(row["name"]) for row in rows("PRAGMA table_info(ControlDeficiency)")}
changes = 0
for column, definition in [
    ("humanApproved", "INTEGER NOT NULL DEFAULT 0"),
    ("approvedBy", "TEXT")
]:
    if column in columns:
        continue
    try:
        rows("ALTER TABLE ControlDeficiency ADD COLUMN " + column + " " + definition)
        changes += 1
    except RuntimeError:
        columns = {str(row["name"]) for row in rows("PRAGMA table_info(ControlDeficiency)")}
        if column not in columns:
            raise
    columns.add(column)
after = {str(row["name"]) for row in rows("PRAGMA table_info(ControlDeficiency)")}
if not {"humanApproved", "approvedBy"}.issubset(after):
    raise RuntimeError("ICOFR_ASSURANCE_SCHEMA_MIGRATION_INCOMPLETE")
print(json.dumps({
    "migration": "ASSURANCE_CONTROL_DEFICIENCY_COLUMNS_V1",
    "existingRowsPreserved": True,
    "addedColumns": changes,
    "verified": True
}, indent=2))

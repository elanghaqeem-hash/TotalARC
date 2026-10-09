#!/usr/bin/env python3
"""Idempotent, additive-only repair of legacy assurance columns on pinned production D1.

Based on the archived production-integrity remediation PR #281. No bank
transaction, finding, test, or control record is created/edited/deleted.
"""
import json
import os
import subprocess
import time
from pathlib import Path

NAME = os.environ.get("TOTALARC_D1_DATABASE_NAME", "").strip()
ID = os.environ.get("TOTALARC_D1_DATABASE_ID", "").strip()
if not NAME or not ID:
    raise RuntimeError("ASSURANCE_MIGRATION_PINNED_D1_REQUIRED")

config = json.loads(Path("wrangler.production.json").read_text(encoding="utf-8"))
bindings = [b for b in config.get("d1_databases", []) if b.get("binding") == "DB"]
if len(bindings) != 1 or bindings[0].get("database_id") != ID or bindings[0].get("database_name") != NAME:
    raise RuntimeError("ASSURANCE_MIGRATION_D1_BINDING_MISMATCH")


def wr(args):
    for attempt in range(5):
        result = subprocess.run(
            ["npx", "wrangler", *args], text=True, capture_output=True,
            env=os.environ, timeout=90
        )
        if result.returncode == 0:
            return result.stdout
        if attempt < 4:
            time.sleep(2 + attempt * 2)
    # Do not log credentials, SQL or contents of bank records.
    raise RuntimeError("ASSURANCE_MIGRATION_WRANGLER_FAILED")


def rows(sql):
    result = json.loads(wr(["d1", "execute", NAME, "--remote", "--json", "--command", sql]))
    blocks = result if isinstance(result, list) else [result]
    if any(block.get("success") is False for block in blocks):
        raise RuntimeError("ASSURANCE_MIGRATION_D1_QUERY_FAILED")
    return [row for block in blocks for row in block.get("results", [])]


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


available = json.loads(wr(["d1", "list", "--json"]))
matches = [db for db in available if str(db.get("uuid") or db.get("id") or "") == ID
           and db.get("name") == NAME]
if len(matches) != 1:
    raise RuntimeError("ASSURANCE_MIGRATION_D1_IDENTITY_NOT_FOUND")

identity = rows("SELECT id FROM Institution WHERE legalName="
                + quote("PT. Bank Pembangunan Daerah Kalimantan Barat") + " LIMIT 2")
if len(identity) != 1:
    raise RuntimeError("ASSURANCE_MIGRATION_BANK_KALBAR_IDENTITY_INVALID")

table = rows("SELECT name FROM sqlite_master WHERE type='table' AND name='ControlDeficiency'")
if not table:
    raise RuntimeError("ASSURANCE_MIGRATION_CONTROL_DEFICIENCY_TABLE_MISSING")

columns = {str(row.get("name") or "") for row in rows("PRAGMA table_info(ControlDeficiency)")}
required = {
    "humanApproved": "INTEGER NOT NULL DEFAULT 0",
    "approvedBy": "TEXT"
}
changed = []
for column, definition in required.items():
    if column not in columns:
        # Identifiers and definitions are local trusted constants.
        wr(["d1", "execute", NAME, "--remote", "--command",
            "ALTER TABLE ControlDeficiency ADD COLUMN " + column + " " + definition])
        changed.append(column)

after = {str(row.get("name") or "") for row in rows("PRAGMA table_info(ControlDeficiency)")}
if not set(required).issubset(after):
    raise RuntimeError("ASSURANCE_MIGRATION_INCOMPLETE")

print(json.dumps({
    "gate": "ASSURANCE_LEGACY_COLUMNS",
    "database": NAME,
    "changedColumns": changed,
    "requiredColumnsReady": True,
    "bankRecordsUpdated": 0
}, ensure_ascii=False))

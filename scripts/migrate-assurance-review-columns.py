#!/usr/bin/env python3
"""Additive, idempotent repair of historical assurance schema on the pinned D1.
Never mutates assessment decisions or any ControlDeficiency rows.
"""
import json
import os
import subprocess
from pathlib import Path

cfg = json.loads(Path('wrangler.production.json').read_text(encoding='utf-8'))
bindings = [b for b in cfg.get('d1_databases', []) if b.get('binding') == 'DB']
if len(bindings) != 1:
    raise RuntimeError('ASSURANCE_D1_BINDING_AMBIGUOUS')
db_name = str(os.environ.get('TOTALARC_D1_DATABASE_NAME') or '').strip()
db_id = str(os.environ.get('TOTALARC_D1_DATABASE_ID') or '').strip()
if not db_name or not db_id or bindings[0].get('database_name') != db_name or bindings[0].get('database_id') != db_id:
    raise RuntimeError('ASSURANCE_D1_BINDING_NOT_PINNED')

def sql(command):
    proc = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', db_name, '--remote', '--json', '--command', command],
        text=True, capture_output=True, env=os.environ, timeout=90, check=False,
    )
    if proc.returncode:
        raise RuntimeError('ASSURANCE_D1_SQL_FAILED') from None
    result = json.loads(proc.stdout)
    if not isinstance(result, list) or any(block.get('success') is False for block in result):
        raise RuntimeError('ASSURANCE_D1_RESULT_INVALID')
    return [row for block in result for row in block.get('results', [])]

tables = {r['name'] for r in sql("SELECT name FROM sqlite_master WHERE type='table' AND name='ControlDeficiency'")}
if 'ControlDeficiency' not in tables:
    raise RuntimeError('ASSURANCE_CONTROL_DEFICIENCY_TABLE_MISSING')

columns = {str(r['name']) for r in sql('PRAGMA table_info(ControlDeficiency)')}
added = []
for name, definition in (
    ('humanApproved', 'INTEGER NOT NULL DEFAULT 0'),
    ('approvedBy', 'TEXT'),
):
    if name not in columns:
        try:
            sql('ALTER TABLE ControlDeficiency ADD COLUMN ' + name + ' ' + definition)
            added.append(name)
        except RuntimeError:
            # Validate state for harmless concurrent identical migration; otherwise fail closed.
            if name not in {str(r['name']) for r in sql('PRAGMA table_info(ControlDeficiency)')}:
                raise

after = {str(r['name']) for r in sql('PRAGMA table_info(ControlDeficiency)')}
if not {'humanApproved', 'approvedBy'}.issubset(after):
    raise RuntimeError('ASSURANCE_REVIEW_COLUMNS_NOT_READY')
print(json.dumps({'verification': 'ASSURANCE_REVIEW_SCHEMA_READY', 'columnsAdded': added,
                  'existingBankRecordsChanged': False, 'databaseBindingVerified': True}))

#!/usr/bin/env python3
"""Diff two golden master JSON files, ignoring _meta.timestamp. Exit 0 if identical."""
import json, sys, pathlib, difflib

def load_strip(p):
    d = json.loads(pathlib.Path(p).read_text())
    if isinstance(d.get('_meta'), dict) and 'timestamp' in d['_meta']:
        d['_meta']['timestamp'] = '<stripped>'
    return d

if len(sys.argv) != 3:
    print("Usage: golden_diff.py <before.json> <after.json>", file=sys.stderr)
    sys.exit(2)

a = load_strip(sys.argv[1])
b = load_strip(sys.argv[2])

sa = json.dumps(a, sort_keys=True, indent=2)
sb = json.dumps(b, sort_keys=True, indent=2)

if sa == sb:
    print(f"✓ Golden master matches ({sys.argv[1]} == {sys.argv[2]})")
    sys.exit(0)

print(f"✗ Golden master mismatch ({sys.argv[1]} != {sys.argv[2]})")
for line in difflib.unified_diff(sa.splitlines(), sb.splitlines(),
                                  fromfile=sys.argv[1], tofile=sys.argv[2],
                                  lineterm='', n=2):
    print(line)
sys.exit(1)

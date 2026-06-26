#!/usr/bin/env python3
"""
Audit 'any' usage in metardu/src.
Find worst-offender files where 'any' is likely hiding real bugs.
"""
import re, pathlib, collections

ROOT = pathlib.Path('/home/z/my-project/repos/metardu/src')

# Match: `: any`, `<any>`, `as any`, `Array<any>`, `any[]`, `any>`, etc.
# But NOT: comments, strings, or the word "any" in prose.
ANY_RE = re.compile(r'''
    \bany\b                       # the word "any"
    (?=\s*[<>,);\]\s=])           # followed by typical type-position chars
    |                             # OR
    :\s*any\b                     # `: any` (annotation)
    |                             # OR
    \bas\s+any\b                  # `as any` (cast)
    |                             # OR
    <any>                         # `<any>` (generic)
''', re.VERBOSE)

files = []
for path in ROOT.rglob('*.ts'):
    if 'node_modules' in path.parts or '__tests__' in path.parts:
        continue
    try:
        content = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    # Strip comments and strings to avoid false positives
    stripped = re.sub(r'//.*$', '', content, flags=re.MULTILINE)
    stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.DOTALL)
    stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", stripped)
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    stripped = re.sub(r'`(?:[^`\\]|\\.)*`', '``', stripped)

    # Count occurrences of `any` as a type
    matches = re.findall(r'\bany\b(?![a-zA-Z_])', stripped)
    # Filter out false positives like "many", "anyway" — already done by word boundary
    # But also filter out "any" in identifiers like "anyKey" — check context
    real_count = 0
    for m in re.finditer(r'\bany\b', stripped):
        # Check char before
        start = m.start()
        if start > 0:
            prev = stripped[start - 1]
            if prev in '._$':  # part of an identifier like obj.any or any_thing
                continue
        # Check char after
        end = m.end()
        if end < len(stripped):
            nxt = stripped[end]
            if nxt in '._$':
                continue
        real_count += 1

    if real_count > 0:
        files.append({
            'path': str(path.relative_to(ROOT)),
            'any_count': real_count,
            'lines': content.count('\n'),
        })

# Also scan .tsx
for path in ROOT.rglob('*.tsx'):
    if 'node_modules' in path.parts or '__tests__' in path.parts:
        continue
    try:
        content = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    stripped = re.sub(r'//.*$', '', content, flags=re.MULTILINE)
    stripped = re.sub(r'/\*.*?\*/', '', stripped, flags=re.DOTALL)
    stripped = re.sub(r"'(?:[^'\\]|\\.)*'", "''", stripped)
    stripped = re.sub(r'"(?:[^"\\]|\\.)*"', '""', stripped)
    stripped = re.sub(r'`(?:[^`\\]|\\.)*`', '``', stripped)

    real_count = 0
    for m in re.finditer(r'\bany\b', stripped):
        start = m.start()
        if start > 0:
            prev = stripped[start - 1]
            if prev in '._$':
                continue
        end = m.end()
        if end < len(stripped):
            nxt = stripped[end]
            if nxt in '._$':
                continue
        real_count += 1

    if real_count > 0:
        files.append({
            'path': str(path.relative_to(ROOT)),
            'any_count': real_count,
            'lines': content.count('\n'),
        })

files.sort(key=lambda x: -x['any_count'])

total = sum(f['any_count'] for f in files)
print(f"Total 'any' occurrences in src/: {total}")
print(f"Files with 'any': {len(files)}")
print(f"\nTop 30 worst offenders:")
print(f"  {'any':>5}  {'LOC':>5}  path")
for f in files[:30]:
    print(f"  {f['any_count']:5d}  {f['lines']:5d}  {f['path']}")

# Save full list for reference
import json
pathlib.Path('/home/z/my-project/repos/metardu/scripts/any_audit.json').write_text(
    json.dumps({'total': total, 'files': files}, indent=2)
)

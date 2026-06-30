#!/usr/bin/env python3
"""
Find 'thin wrapper' pages — 'use client' pages that just render a client component
child with no hooks/state/handlers. These are trivial RSC conversions: just remove
the 'use client' directive. The child stays client (it has its own 'use client').
"""
import re, pathlib

ROOT = pathlib.Path('/home/z/my-project/repos/metardu/src')

# Pattern: 'use client' followed by imports + a component that returns JSX
# but uses NO hooks/state/handlers/effect.
HOOK_RE = re.compile(r'\buse(State|Effect|Callback|Ref|Memo|Context|Reducer|Transition|DeferredValue|ImperativeHandle|LayoutEffect|DebugValue|Id)\s*\(')
EVENT_HANDLER_RE = re.compile(r'\bon[A-Z][a-zA-Z]+\s*[=:]')
WINDOW_DOC_RE = re.compile(r'\b(window|document|localStorage|sessionStorage|navigator)\b')

easy_win = []
for path in ROOT.rglob('page.tsx'):
    try:
        content = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    head = content[:200]
    if "'use client'" not in head and '"use client"' not in head:
        continue
    body = content.replace("'use client'", '').replace('"use client"', '')
    # Must have NO hooks, NO event handlers, NO window/document access
    if HOOK_RE.search(body) or EVENT_HANDLER_RE.search(body) or WINDOW_DOC_RE.search(body):
        continue
    easy_win.append({
        'path': str(path.relative_to(ROOT)),
        'lines': content.count('\n'),
    })

easy_win.sort(key=lambda x: x['lines'])
print(f"Easy RSC wins (just remove 'use client'): {len(easy_win)}")
for w in easy_win:
    print(f"  {w['lines']:4d} LOC  {w['path']}")

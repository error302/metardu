#!/usr/bin/env python3
"""
Audit 'use client' files in metardu/src.
Find read-only pages (no hooks, no state, no handlers) — those are RSC conversion candidates.
"""
import os, re, pathlib, json, collections

ROOT = pathlib.Path('/home/z/my-project/repos/metardu/src')
OUT  = pathlib.Path('/home/z/my-project/repos/metardu/scripts/rsc_audit.json')

stats = {
    'total_use_client': 0,
    'by_dir': collections.Counter(),
    'candidates': [],
    'maybe_candidates': [],
    'not_candidates': [],
    'no_use_client_pages': [],
}

HOOK_RE = re.compile(r'\buse(State|Effect|Callback|Ref|Memo|Context|Reducer|Transition|DeferredValue|ImperativeHandle|LayoutEffect|DebugValue|Id)\s*\(')
EVENT_HANDLER_RE = re.compile(r'\bon[A-Z][a-zA-Z]+\s*[=:]')
STATE_SETTER_RE = re.compile(r'\bset[A-Z][a-zA-Z]+\s*\(')

def classify(path, content):
    body = content.replace("'use client'", '').replace('"use client"', '')
    has_hooks = bool(HOOK_RE.search(body))
    has_handlers = bool(EVENT_HANDLER_RE.search(body))
    has_state_setter = bool(STATE_SETTER_RE.search(body))
    has_window_doc = bool(re.search(r'\b(window|document|localStorage|sessionStorage|navigator)\b', body))
    has_use_effect = bool(re.search(r'\buseEffect\s*\(', body))
    interactive_count = sum([has_hooks, has_handlers, has_state_setter, has_use_effect])
    return {
        'path': str(path.relative_to(ROOT)),
        'has_hooks': has_hooks,
        'has_event_handlers': has_handlers,
        'has_state_setter': has_state_setter,
        'has_use_effect': has_use_effect,
        'has_window_doc': has_window_doc,
        'interactive_count': interactive_count,
    }

for path in ROOT.rglob('*.tsx'):
    if 'node_modules' in path.parts or '__tests__' in path.parts:
        continue
    try:
        content = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    head = content[:200]
    is_use_client = "'use client'" in head or '"use client"' in head
    if is_use_client:
        stats['total_use_client'] += 1
        parts = path.relative_to(ROOT).parts
        top = parts[0] if parts else '<root>'
        stats['by_dir'][top] += 1
        info = classify(path, content)
        if info['interactive_count'] == 0 and not info['has_window_doc']:
            stats['candidates'].append(info)
        elif info['interactive_count'] <= 1 and not info['has_use_effect']:
            stats['maybe_candidates'].append(info)
        else:
            stats['not_candidates'].append(info)
    elif path.name == 'page.tsx':
        stats['no_use_client_pages'].append(str(path.relative_to(ROOT)))

def filesize(p):
    try:
        return pathlib.Path(ROOT / p).stat().st_size
    except Exception:
        return 0

stats['candidates'].sort(key=lambda x: filesize(x['path']))
stats['maybe_candidates'].sort(key=lambda x: filesize(x['path']))

OUT.write_text(json.dumps(stats, indent=2, default=str))
print(f"Total 'use client' files: {stats['total_use_client']}")
print(f"\nRSC candidates (no hooks/state/handlers/window): {len(stats['candidates'])}")
print(f"  Top 15 (smallest first):")
for c in stats['candidates'][:15]:
    print(f"    {c['path']}")
print(f"\nMaybe candidates (<=1 interactive marker, no useEffect): {len(stats['maybe_candidates'])}")
print(f"  Top 10 (smallest first):")
for c in stats['maybe_candidates'][:10]:
    print(f"    {c['path']}  (interactive={c['interactive_count']}, handlers={c['has_event_handlers']})")
print(f"\nNot candidates (heavy interactivity): {len(stats['not_candidates'])}")
print(f"\nAlready-RSC pages (no 'use client'): {len(stats['no_use_client_pages'])}")
print(f"\nBy directory:")
for d, c in stats['by_dir'].most_common(10):
    print(f"  {c:4d}  {d}")

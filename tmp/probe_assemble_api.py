#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.request

URL = "https://metardu.duckdns.org/api/submission/assemble"
PAYLOAD = {"projectId": "11111111-1111-1111-1111-111111111111"}

req = urllib.request.Request(
    URL,
    data=json.dumps(PAYLOAD).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST",
)

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        print(f"STATUS={resp.status}")
        print("BODY_START")
        print(body)
        print("BODY_END")
except urllib.error.HTTPError as exc:
    body = exc.read().decode("utf-8", errors="replace")
    print(f"STATUS={exc.code}")
    print("BODY_START")
    print(body)
    print("BODY_END")
except Exception as exc:  # pragma: no cover
    print(f"ERROR={exc}", file=sys.stderr)
    raise

#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar

BASE = "https://metardu.duckdns.org"
EMAIL = "submission.test@metardu.local"
PASSWORD = "MetarduTest@123"
PROJECT_ID = "11111111-1111-1111-1111-111111111111"

cookies = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))


def get_json(url: str):
    with opener.open(url, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def post_form(url: str, fields: dict):
    data = urllib.parse.urlencode(fields).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with opener.open(req, timeout=30) as resp:
        body = resp.read().decode("utf-8", errors="replace")
        return resp.status, body


def post_json(url: str, payload: dict):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with opener.open(req, timeout=30) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")


csrf_status, csrf_payload = get_json(f"{BASE}/api/auth/csrf")
csrf_token = csrf_payload.get("csrfToken")
print(f"CSRF_STATUS={csrf_status}")
print(f"CSRF_TOKEN_PRESENT={bool(csrf_token)}")

login_status, login_body = post_form(
    f"{BASE}/api/auth/callback/credentials",
    {
        "csrfToken": csrf_token or "",
        "email": EMAIL,
        "password": PASSWORD,
        "callbackUrl": f"{BASE}/dashboard",
        "json": "true",
    },
)
print(f"LOGIN_STATUS={login_status}")
print("LOGIN_BODY_START")
print(login_body)
print("LOGIN_BODY_END")

assemble_status, assemble_body = post_json(
    f"{BASE}/api/submission/assemble", {"projectId": PROJECT_ID}
)
print(f"ASSEMBLE_STATUS={assemble_status}")
print("ASSEMBLE_BODY_START")
print(assemble_body[:2000])
print("ASSEMBLE_BODY_END")

#!/usr/bin/env python3
import io
import json
import re
import urllib.parse
import urllib.request
import zipfile
from http.cookiejar import CookieJar

BASE = "https://metardu.duckdns.org"
EMAIL = "submission.test@metardu.local"
PASSWORD = "MetarduTest@123"
PROJECT_ID = "11111111-1111-1111-1111-111111111111"
REF_PATTERN = re.compile(r"^LSK/001/2024_\d{4}_\d{3}_R\d{2}$")

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
        return resp.status, resp.read().decode("utf-8", errors="replace")


def post_json_raw(url: str, payload: dict):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with opener.open(req, timeout=60) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


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
print(f"LOGIN_BODY={login_body}")

status, headers, body = post_json_raw(
    f"{BASE}/api/submission/assemble", {"projectId": PROJECT_ID}
)
print(f"ASSEMBLE_STATUS={status}")

if status != 200:
    print("ASSEMBLE_ERROR_BODY_START")
    print(body.decode("utf-8", errors="replace"))
    print("ASSEMBLE_ERROR_BODY_END")
    raise SystemExit(0)

content_type = headers.get("Content-Type", "")
submission_ref = headers.get("X-Submission-Ref", "")
print(f"CONTENT_TYPE={content_type}")
print(f"SUBMISSION_REF={submission_ref}")
print(f"SUBMISSION_REF_MATCH={bool(REF_PATTERN.match(submission_ref))}")

zip_bytes = io.BytesIO(body)
with zipfile.ZipFile(zip_bytes) as zf:
    names = sorted(zf.namelist())
    print("ZIP_ENTRIES_START")
    for name in names:
        print(name)
    print("ZIP_ENTRIES_END")

    manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
    print(f"MANIFEST_REF={manifest.get('submissionRef')}")
    print(
        "REQUIRED_FILES_PRESENT="
        + str(
            all(
                f in names
                for f in (
                    "form_no_4.dxf",
                    "computation_workbook.xlsx",
                    "manifest.json",
                )
            )
        )
    )

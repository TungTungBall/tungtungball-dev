#!/usr/bin/env python3
"""실제 Supabase 사용자 JWT로 실행 중인 API의 저장/수정/소유권을 검증한다. 토큰은 출력하지 않는다."""

import argparse
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("owner", "other"))
    parser.add_argument("--session-file", required=True, type=Path)
    parser.add_argument("--report-file", required=True, type=Path)
    parser.add_argument("--owner-report", type=Path)
    parser.add_argument("--owner-session-file", type=Path)
    parser.add_argument("--backend-url", default="http://127.0.0.1:8080")
    args = parser.parse_args()
    if args.mode == "other" and (not args.owner_report or not args.owner_session_file):
        parser.error("other 검증에는 --owner-report와 --owner-session-file이 필요합니다.")
    destination = urlsplit(args.backend_url)
    if destination.username or destination.password or destination.query or destination.fragment:
        parser.error("백엔드 URL에는 자격 증명이나 쿼리를 넣을 수 없습니다.")
    if destination.scheme != "https" and not (destination.scheme == "http" and destination.hostname in ("localhost", "127.0.0.1", "::1")):
        parser.error("HTTPS 또는 로컬 HTTP 백엔드 주소가 필요합니다.")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    http = urllib.request.build_opener(NoRedirect)
    token = json.loads(args.session_file.read_text())["access_token"]
    # 소유자 결정은 API가 검증된 JWT로 수행한다. 이 값은 테스트 데이터 정리용 기록에만 쓴다.
    payload = token.split(".")[1]
    subject = str(uuid.UUID(json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["sub"]))
    checks = []
    report = {"mode": args.mode, "user_id": subject, "created_ids": [], "checks": checks}

    def save_report():
        args.report_file.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(args.report_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)

    def request(label, method, path, expected, body=None, key=None, access_token=token):
        headers = {"Content-Type": "application/json"}
        if access_token:
            headers["Authorization"] = "Bearer " + access_token
        if key:
            headers["Idempotency-Key"] = key
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(args.backend_url.rstrip("/") + path, data=data, headers=headers, method=method)
        try:
            response = http.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            status = response.status
            result = json.loads(response.read())
        checks.append({"check": label, "status": status, "passed": status == expected})
        save_report()
        if status != expected:
            raise AssertionError(f"{label}: expected {expected}, received {status}")
        print(f"PASS {label}: HTTP {status}")
        return result

    answers = {"physical_limitations": {"present": False, "body_parts": []},
               "purpose": {"type": "체력", "custom_text": None},
               "intensity": 4, "priority_body_parts": ["상체"]}
    owner = None
    target = None
    if args.mode == "other":
        owner = json.loads(args.owner_report.read_text())
        assert owner.get("passed") and owner["user_id"] != subject, "완료된 소유자 검증과 서로 다른 두 사용자 JWT가 필요합니다."
        target = "/api/survey-submissions/" + str(uuid.UUID(owner["submission_id"]))
        owner_token = json.loads(args.owner_session_file.read_text())["access_token"]
        request("owner target exists before cross-user checks", "GET", target, 200, access_token=owner_token)
    saved = request("own create", "POST", "/api/survey-submissions", 201, {"answers": answers})
    resource_id = str(uuid.UUID(saved["id"]))
    report["created_ids"].append(resource_id)
    report["submission_id"] = resource_id
    save_report()
    path = "/api/survey-submissions/" + resource_id
    found = request("own read", "GET", path, 200)
    assert found["version"] == 1 and found["answers"] == answers
    if args.mode == "owner":
        changed = dict(answers, intensity=6)
        update = {"answers": changed, "expected_version": 1}
        key = str(uuid.uuid4())
        result = request("own update", "PATCH", path, 200, update, key)
        assert result["version"] == 2 and result["answers"] == changed
        replay = request("same-key replay", "PATCH", path, 200, update, key)
        assert replay == result
        stale = request("stale-version rejected", "PATCH", path, 409, update, str(uuid.uuid4()))
        assert stale["code"] == "VERSION_CONFLICT"
        unchanged = request("version and values preserved", "GET", path, 200)
        assert unchanged["version"] == 2 and unchanged["answers"] == changed
        request("unauthenticated create rejected", "POST", "/api/survey-submissions", 401,
                {"answers": answers}, access_token=None)
        signature = token.split(".")[-1]
        forged = ".".join(token.split(".")[:2]) + "." + ("A" if signature[0] != "A" else "B") + signature[1:]
        request("invalid signature rejected", "GET", path, 401, access_token=forged)
    else:
        foreign = request("foreign read rejected", "GET", target, 404)
        assert foreign["code"] == "RESOURCE_NOT_FOUND"
        foreign = request("foreign update rejected", "PATCH", target, 404,
                          {"answers": dict(answers, intensity=9), "expected_version": 2}, str(uuid.uuid4()))
        assert foreign["code"] == "RESOURCE_NOT_FOUND"
        request("owner field injection rejected", "POST", "/api/survey-submissions", 400,
                {"answers": answers, "user_id": owner["user_id"]})
        request("unauthenticated read rejected", "GET", target, 401, access_token=None)
        own = request("other user own row preserved", "GET", path, 200)
        assert own["version"] == 1 and own["answers"] == answers
    report["completed_at"] = datetime.now(timezone.utc).isoformat()
    report["passed"] = True
    save_report()
    print(f"Completed {len(checks)} live checks. Credentials omitted.")


if __name__ == "__main__":
    main()

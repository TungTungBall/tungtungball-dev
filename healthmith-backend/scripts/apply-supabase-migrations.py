#!/usr/bin/env python3
"""관리자 자격 증명은 로컬 .env.admin에서 읽고, SQL과 이력을 한 트랜잭션으로 저장한다."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1]


def read_settings(path):
    settings = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if separator:
            settings[key.strip()] = value.strip()
    return settings


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=BACKEND / ".env.admin")
    parser.add_argument("--apply", action="store_true", help="생략하면 적용 예정 목록만 출력")
    args = parser.parse_args()
    settings = read_settings(args.env_file)
    required = ("SUPABASE_DB_HOST", "SUPABASE_DB_ADMIN_USER", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_SSL_ROOT_CERT")
    missing = [name for name in required if not settings.get(name)]
    if missing:
        raise ValueError("필요한 설정: " + ", ".join(missing))
    certificate = Path(settings["SUPABASE_DB_SSL_ROOT_CERT"]).expanduser()
    if not certificate.is_absolute():
        certificate = BACKEND / certificate
    if not certificate.is_file():
        raise ValueError("DB CA 인증서 파일이 없습니다.")
    env = dict(os.environ, PGHOST=settings["SUPABASE_DB_HOST"],
               PGPORT=settings.get("SUPABASE_DB_PORT", "5432"),
               PGDATABASE=settings.get("SUPABASE_DB_NAME", "postgres"),
               PGUSER=settings["SUPABASE_DB_ADMIN_USER"], PGPASSWORD=settings["SUPABASE_DB_PASSWORD"],
               PGSSLMODE="verify-full", PGSSLROOTCERT=str(certificate), PGCONNECT_TIMEOUT="10",
               PGOPTIONS="-c statement_timeout=60000 -c lock_timeout=10000")

    def query(sql, transaction=False):
        command = ["psql", "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
        if transaction:
            command.append("--single-transaction")
        command.extend(["--file", "-"])
        result = subprocess.run(command, input=sql, env=env, capture_output=True, text=True)
        if result.returncode:
            # 자격 증명은 SQL/명령 인수에 포함하지 않는다. 오류에도 값을 노출하지 않는다.
            message = result.stderr.replace(env["PGPASSWORD"], "[redacted]")
            raise RuntimeError(message)
        return result.stdout.strip()

    exists = query("SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;") == "t"
    applied = {}
    if exists:
        rows = json.loads(query("SELECT coalesce(json_agg(t), '[]'::json) FROM "
                                "(SELECT version,name,statements FROM supabase_migrations.schema_migrations) t;"))
        applied = {row["version"]: row for row in rows}
    pending = []
    for path in sorted((BACKEND.parent / "supabase/migrations").glob("*.sql")):
        match = re.fullmatch(r"(\d{14})_(.+)\.sql", path.name)
        if not match:
            raise ValueError("지원하지 않는 마이그레이션 파일명: " + path.name)
        version, name = match.groups()
        source = path.read_text()
        previous = applied.get(version)
        if previous:
            if previous["name"] != name or previous["statements"] != [source]:
                raise ValueError("이미 적용된 마이그레이션 내용이 다릅니다: " + path.name)
        else:
            pending.append((version, name, source))
            print("대기:", path.name)
    print(f"기존 이력 {len(applied)}개, 신규 {len(pending)}개")
    if not args.apply:
        return
    sql = ["SELECT pg_advisory_xact_lock(hashtext('healthmith_schema_migrations'));",
           "CREATE SCHEMA IF NOT EXISTS supabase_migrations;",
           "CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations "
           "(version text PRIMARY KEY, statements text[], name text);"]
    for version, name, source in pending:
        sql += [source, "INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES ("
                + literal(version) + "," + literal(name) + ",ARRAY[" + literal(source) + "]); "]
    sql.append((BACKEND.parent / "supabase/roles/r2dbc.sql").read_text())
    query("\n".join(sql), transaction=True)
    print("마이그레이션과 최소 권한 역할 적용 완료")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

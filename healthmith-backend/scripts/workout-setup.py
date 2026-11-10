#!/usr/bin/env python3
"""운동/생성 준비 상태를 값 노출 없이 검사하고 검토한 카탈로그·정책만 원자 등록한다."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

BACKEND = Path(__file__).resolve().parents[1]
PURPOSES = {"체력", "감량", "근력", "자세", "자유 입력"}
WORKER_KEYS = ["GENERATION_WORKER_GEMINI_KEY", "GENERATION_WORKER_MODEL", "GENERATION_WORKER_POLL_INTERVAL",
               "GENERATION_WORKER_REQUEST_TIMEOUT", "GENERATION_WORKER_QUEUED_TIMEOUT", "GENERATION_WORKER_LEASE_SECONDS",
               "GENERATION_WORKER_MAX_OUTPUT_TOKENS", "WORKER_R2DBC_URL", "WORKER_R2DBC_USERNAME", "WORKER_R2DBC_PASSWORD"]


def settings(path):
    result = {}
    if path.exists():
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                result[k.strip()] = v.strip()
    return result


def positive(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def text(value):
    return isinstance(value, str) and bool(value.strip())


def validate_config(config):
    """운동/부위/상한/프롬프트는 입력 파일의 검토값이며 이 도구가 정하지 않는다."""
    if not isinstance(config, dict) or not isinstance(config.get("exercises"), list) or not config["exercises"]:
        raise ValueError("exercises에 검토한 운동을 1개 이상 입력하세요.")
    ids = set()
    for e in config["exercises"]:
        if not isinstance(e, dict) or not all(text(e.get(k)) for k in ["id", "name", "internal_focus_instruction"]):
            raise ValueError("각 운동에 id/name/internal_focus_instruction이 필요합니다.")
        parts = e.get("body_parts")
        if e["id"] in ids or not isinstance(parts, list) or not parts or any(p not in ["상체", "하체", "허리"] for p in parts) or len(set(parts)) != len(parts):
            raise ValueError("운동 ID 중복 또는 body_parts 형식 오류입니다.")
        if type(e.get("enabled")) is not bool:
            raise ValueError("각 운동의 enabled를 명시하세요.")
        ids.add(e["id"])
    if not any(e["enabled"] for e in config["exercises"]):
        raise ValueError("활성 운동이 필요합니다.")
    policies = config.get("policies", {})
    if not isinstance(policies, dict):
        raise ValueError("policies는 객체여야 합니다.")
    start = policies.get("workout_start", {})
    p = policies.get("generation_validation", {})
    if not isinstance(start, dict) or not isinstance(p, dict):
        raise ValueError("운동 시작/생성 정책은 객체여야 합니다.")
    if type(start.get("allow_reuse")) is not bool:
        raise ValueError("workout_start.allow_reuse를 명시하세요.")
    mapping = p.get("purpose_mapping")
    if not isinstance(mapping, dict) or not all(text(mapping.get(k)) for k in PURPOSES):
        raise ValueError("purpose_mapping에 5개 목적의 검토된 정제 문구가 필요합니다.")
    limits = p.get("repetition_limits", {})
    if not isinstance(limits, dict):
        raise ValueError("repetition_limits는 객체여야 합니다.")
    for e in config["exercises"]:
        if not e["enabled"]:
            continue
        limit = limits.get(e["id"], {})
        if not isinstance(limit, dict) or not positive(limit.get("min")) or not positive(limit.get("max")) or limit["min"] > limit["max"] or limit["max"] > 2147483647:
            raise ValueError("활성 운동별 유효한 repetition_limits.min/max가 필요합니다.")
    paces = p.get("pace_instructions")
    if not isinstance(paces, list) or not paces or not all(text(v) for v in paces):
        raise ValueError("pace_instructions를 명시하세요.")
    if not positive(p.get("max_summary_length")) or type(p.get("include_generated_summary")) is not bool:
        raise ValueError("max_summary_length/include_generated_summary를 명시하세요.")
    for k in ["curriculum_instruction", "summary_instruction", "adjustment_instruction"]:
        if not text(p.get(k)):
            raise ValueError(k + "이 필요합니다.")
    for k, field in [("curriculum_schema", "stages"), ("summary_schema", "summary")]:
        schema = p.get(k)
        if not isinstance(schema, dict) or schema.get("type") != "object" or not isinstance(schema.get("properties"), dict) or not isinstance(schema.get("required"), list) or field not in schema["properties"] or field not in schema["required"]:
            raise ValueError(k + "에 출력 계약에 맞는 JSON Schema가 필요합니다.")
    return config


def database(admin):
    required = ["SUPABASE_DB_HOST", "SUPABASE_DB_ADMIN_USER", "SUPABASE_DB_PASSWORD", "SUPABASE_DB_SSL_ROOT_CERT"]
    if any(not admin.get(k) for k in required):
        raise ValueError("DB 조회에 필요한 관리자 설정이 없습니다. .env.admin.example을 확인하세요.")
    cert = Path(admin["SUPABASE_DB_SSL_ROOT_CERT"]).expanduser()
    if not cert.is_absolute():
        cert = BACKEND / cert
    env = dict(os.environ, PGHOST=admin["SUPABASE_DB_HOST"], PGPORT=admin.get("SUPABASE_DB_PORT", "5432"),
               PGDATABASE=admin.get("SUPABASE_DB_NAME", "postgres"), PGUSER=admin["SUPABASE_DB_ADMIN_USER"],
               PGPASSWORD=admin["SUPABASE_DB_PASSWORD"], PGSSLMODE="verify-full", PGSSLROOTCERT=str(cert),
               PGCONNECT_TIMEOUT="5", PGOPTIONS="-c statement_timeout=10000 -c lock_timeout=5000")

    def query(sql):
        try:
            r = subprocess.run(["psql", "-X", "-w", "-A", "-t", "-v", "ON_ERROR_STOP=1", "--file", "-"],
                               input=sql, env=env, capture_output=True, text=True, timeout=25)
        except subprocess.TimeoutExpired:
            raise ValueError("DB 접속이 25초를 초과했습니다.") from None
        if r.returncode:
            # SQL 오류에는 입력/비밀 값이 포함될 수 있어 원본 로그를 출력하지 않는다.
            raise ValueError("DB 접속/SQL 실행 실패. 네트워크·TLS·권한·마이그레이션 상태를 확인하세요.")
        return r.stdout.strip()
    return query


def prepare_worker(env_file, admin_file):
    s = settings(env_file)
    if any(s.get(k) for k in ["WORKER_R2DBC_URL", "WORKER_R2DBC_USERNAME", "WORKER_R2DBC_PASSWORD"]):
        raise ValueError("기존 worker 연결이 있습니다. 이 도구는 자격 증명을 덮어쓰거나 회전하지 않습니다.")
    if not s.get("R2DBC_URL", "").startswith("r2dbc:postgresql://") or not s.get("R2DBC_USERNAME"):
        raise ValueError("먼저 일반 API의 R2DBC 연결을 구성하세요.")
    # 세션 풀러의 <role>.<project> 접미사는 그대로 유지한다.
    suffix = s["R2DBC_USERNAME"].partition(".")[2]
    username = "healthmith_worker" + ("." + suffix if suffix else "")
    password = secrets.token_urlsafe(48)
    sql = """BEGIN;
SELECT pg_advisory_xact_lock(hashtext('healthmith_worker_login'));
DO $$ BEGIN
IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='healthmith_worker') THEN RAISE EXCEPTION 'worker role missing'; END IF;
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='healthmith_worker' AND rolcanlogin) THEN RAISE EXCEPTION 'worker login exists'; END IF;
END $$;
ALTER ROLE healthmith_worker LOGIN PASSWORD '""" + password + "';\nCOMMIT;"
    database(settings(admin_file))(sql)
    source = env_file.read_text().rstrip() + "\n"
    # 빈 설정 줄은 제거하고 새 값은 출력하지 않는다. 권한은 소유자 읽기/쓰기만 허용한다.
    lines = [line for line in source.splitlines() if line.partition("=")[0].strip() not in ["WORKER_R2DBC_URL", "WORKER_R2DBC_USERNAME", "WORKER_R2DBC_PASSWORD"]]
    lines.extend(["WORKER_R2DBC_URL=" + s["R2DBC_URL"], "WORKER_R2DBC_USERNAME=" + username, "WORKER_R2DBC_PASSWORD=" + password])
    temp = env_file.with_name(env_file.name + ".worker-setup-" + secrets.token_hex(8))
    try:
        fd = os.open(temp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write("\n".join(lines) + "\n")
        os.replace(temp, env_file)
    finally:
        temp.unlink(missing_ok=True)
    print("별도 worker 로그인과 로컬 연결 설정 준비 완료. worker는 활성화하지 않았습니다.")


def config_sql(config):
    # SQL 리터럴을 한 번만 quote한다. 입력값을 식별자/명령으로 사용하지 않는다.
    literal = lambda v: "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    rows = literal(config["exercises"])
    policy_rows = literal([{"name": k, "value": v} for k, v in config["policies"].items() if k in ["workout_start", "generation_validation"]])
    return f"""BEGIN;
SELECT pg_advisory_xact_lock(hashtext('healthmith_workout_configuration'));
INSERT INTO public.exercise_catalog(id,name,body_parts,internal_focus_instruction,enabled)
SELECT id,name,body_parts,internal_focus_instruction,enabled FROM jsonb_to_recordset({rows}) AS r(id text,name text,body_parts jsonb,internal_focus_instruction text,enabled boolean)
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,body_parts=EXCLUDED.body_parts,internal_focus_instruction=EXCLUDED.internal_focus_instruction,enabled=EXCLUDED.enabled;
INSERT INTO private.runtime_policies(name,value)
SELECT name,value FROM jsonb_to_recordset({policy_rows}) AS r(name text,value jsonb)
ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value;
DO $$ BEGIN
IF EXISTS(SELECT 1 FROM public.exercise_catalog e CROSS JOIN private.runtime_policies p
 WHERE e.enabled AND p.name='generation_validation' AND p.value->'repetition_limits'->e.id IS NULL)
THEN RAISE EXCEPTION 'enabled exercise missing limits'; END IF;
END $$;
COMMIT;"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=BACKEND / ".env")
    parser.add_argument("--admin-env-file", type=Path, default=BACKEND / ".env.admin")
    parser.add_argument("--database", action="store_true", help="DB 준비 상태를 읽기 전용으로 조회")
    parser.add_argument("--config", type=Path, help="검토한 운동/정책 JSON을 검사")
    parser.add_argument("--mvp", action="store_true", help="사용자에게 전달받은 2026-11-10 MVP seed를 선택")
    parser.add_argument("--apply", action="store_true", help="--config의 운동/정책만 같은 트랜잭션으로 등록")
    parser.add_argument("--prepare-worker", action="store_true", help="기존 NOLOGIN worker 역할에 별도 비밀번호를 만들고 로컬 .env에만 저장")
    args = parser.parse_args()
    if args.apply and not (args.config or args.mvp):
        parser.error("--apply에는 --config 또는 --mvp가 필요합니다.")
    if args.mvp and args.config:
        parser.error("--mvp와 --config 중 하나만 선택하세요.")
    if args.prepare_worker:
        if args.config or args.mvp or args.apply or args.database:
            parser.error("--prepare-worker는 다른 작업과 분리해서 실행하세요.")
        prepare_worker(args.env_file, args.admin_env_file)
        return 0
    if args.mvp:
        seed = BACKEND.parent / "supabase/seeds/mvp-workout-20261110.sql"
        if args.apply:
            database(settings(args.admin_env_file))(seed.read_text())
            print("전달받은 MVP 운동 3종과 생성/시작 정책 등록 완료. worker는 활성화하지 않았습니다.")
        else:
            print("적용 대상: supabase/seeds/mvp-workout-20261110.sql (운동 3종, 생성/시작 정책). --apply를 지정해야 DB에 반영합니다.")
        return 0
    if args.config:
        config = validate_config(json.loads(args.config.read_text()))
        print("운동/정책 형식 검사 통과 (운영 기준 승인이나 Gemini 품질 검증을 뜻하지 않음)")
        if args.apply:
            database(settings(args.admin_env_file))(config_sql(config))
            print("지정한 운동/정책 등록 완료 (worker 활성화 없음)")
        return
    s = settings(args.env_file)
    s.update({k: v for k, v in os.environ.items() if k in WORKER_KEYS or k in ["GENERATION_WORKER_ENABLED", "PERSISTENCE_MODE", "GENERATION_WORKER_SERVICE_KEY"]})
    print("생성 worker:", "활성 설정" if s.get("GENERATION_WORKER_ENABLED", "false").lower() == "true" else "비활성 설정")
    required = WORKER_KEYS if s.get("PERSISTENCE_MODE", "r2dbc") == "r2dbc" else [k for k in WORKER_KEYS if not k.startswith("WORKER_R2DBC_")] + ["GENERATION_WORKER_SERVICE_KEY"]
    missing = [k for k in required if not s.get(k)]
    print("누락 설정 이름:", ", ".join(missing) if missing else "없음")
    if args.database:
        print(database(settings(args.admin_env_file))("""BEGIN READ ONLY;
SELECT 'active_exercises='||count(*) FROM public.exercise_catalog WHERE enabled;
SELECT 'generation_policy='||EXISTS(SELECT 1 FROM private.runtime_policies WHERE name='generation_validation');
SELECT 'workout_start_policy='||EXISTS(SELECT 1 FROM private.runtime_policies WHERE name='workout_start');
SELECT 'active_workers='||count(*) FROM private.generation_workers WHERE available_until>clock_timestamp();
SELECT 'worker_login='||rolcanlogin FROM pg_roles WHERE rolname='healthmith_worker';
SELECT 'migrations='||count(*) FROM supabase_migrations.schema_migrations;
ROLLBACK;"""))
    if missing:
        return 1
    print("변수 존재 검사 통과. 실제 연결·시간 제약은 서버 기동과 DB 조회로 별도 확인하세요.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

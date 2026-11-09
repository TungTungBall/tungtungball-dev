-- DB 관리자가 한 번 적용한다. 앱이 직접 migration/role 생성을 실행하지 않는다.
-- 비밀번호와 LOGIN은 배포 환경의 비밀 관리 절차로 별도 설정한다.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'healthmith_app') THEN
        CREATE ROLE healthmith_app NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
END $$;
GRANT authenticated TO healthmith_app;
GRANT USAGE ON SCHEMA public, auth TO healthmith_app;

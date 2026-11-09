# 백엔드 구현과 실행

시작 기준 main은 `f6768dc`이며, 최종 동기화 때 추가된 팀 지침 변경 `21a0090`도 세 브랜치 모두에 반영했다. 노션 `Temp → tunGPI 명세서`의 API 계약을 따른다.
기존 원격 #29~36 구현을 재사용하며, 이번 요청에 따라 R2DBC 저장 어댑터를 추가한다.
사용자의 요청으로 기능·설정·해당 회귀 테스트를 아래 세 브랜치에 함께 묶는다.

| 브랜치 | 범위 | 선행 브랜치 |
| --- | --- | --- |
| `feature/reactive-survey` | S01~03, R2DBC와 사용자 RLS, 실제 PostgreSQL 회귀 | main |
| `feature/workout-cycle` | 운동 목록·초안 생성·확정·운동 진행·설문·요약·기록 | reactive-survey |
| `feature/gem-combat` | 보석·주문 덱·그림 시전·PvE·PvP·인증 SSE | workout-cycle |

후속 브랜치는 선행 작업을 포함한다. 리뷰는 선행 브랜치와의 차이로 확인한다.
main이나 기존 원격 작업 브랜치를 덮어쓰지 않는다.

## 저장 방식

기본은 Spring Data R2DBC와 PostgreSQL이다. JDBC/JPA는 요청 처리에 사용하지 않는다.
사전조사는 `ReactiveCrudRepository`를 사용한다. 상태 전이·멱등성·여러 행을 변경하는 명령은
DB 함수와 `DatabaseClient`로 같은 트랜잭션 안에서 처리한다.
`PERSISTENCE_MODE=postgrest`를 지정하면 기존 Supabase Data API 어댑터를 사용할 수 있다.
동일 API에 두 저장 경로를 동시에 쓰거나 실패 시 자동으로 다른 경로에 재전송하지 않는다.

필요한 환경변수:

| 이름 | 용도 |
| --- | --- |
| `R2DBC_URL` | `r2dbc:postgresql://호스트:포트/DB` (운영 환경은 TLS 설정 포함) |
| `R2DBC_USERNAME` | 제한된 DB 로그인, 기본 이름 `healthmith_app` |
| `R2DBC_PASSWORD` | 서버 비밀 저장소에서 주입 |
| `SUPABASE_URL` | 사용자 JWT issuer/JWKS 검증 |
| `CORS_ALLOWED_ORIGINS` | 허용할 프론트엔드 출처 |

관리자가 `supabase/migrations`를 파일명 순서대로 적용하고 `supabase/roles/r2dbc.sql`의
최소 권한 역할을 준비한다. 앱 로그인에는 `authenticated` 멤버십이 필요하며 DB 소유자나
service_role을 사용하지 않는다. LOGIN/비밀번호 설정은 공유 SQL에 넣지 않는다.
앱은 자동으로 운영 DB를 마이그레이션하지 않는다.

Spring Security에서 검증된 JWT principal만 DB 사용자 문맥에 사용한다. 요청마다
`SET LOCAL ROLE authenticated`와 transaction-local JWT claims를 같은 연결에 설정하고
commit/rollback 때 해제한다. 요청 본문의 소유자나 서명 검증 전 토큰을 신뢰하지 않는다.

## 검증

`healthmith-backend`에서 `./gradlew test bootJar --no-daemon --console=plain`을 실행한다.
기존 HTTP 계약 검사는 PostgREST 대역을 사용하고, R2DBC 통합 검사는 Testcontainers의
별도 PostgreSQL 17 컨테이너와 제한된 로그인으로 실행한다. Docker 실행 환경이 필요하다.
운영 Supabase, 실제 Gemini, 실제 카메라·손 인식·부하는 별도 검증 대상이다.

백엔드 또는 `supabase/`가 바뀐 PR은 `.github/workflows/backend.yml`에서도 같은 검사를 실행한다.
CI는 JDK 21과 Docker를 사용하고 실제 PostgreSQL 17 컨테이너를 테스트가 직접 준비한다.
외부 서비스의 비밀 값은 필요하지 않다. JUnit XML에 실패·오류·생략이 있거나 검사 결과가 없으면
성공으로 처리하지 않는다. 결과 합계는 실행 요약, HTML·XML은 7일간 Actions artifact에서 확인한다.
로컬에서도 Gradle 실행 뒤 `python3 scripts/check-test-results.py`로 합계를 확인할 수 있다.

기술 근거: [Spring Data R2DBC](https://docs.spring.io/spring-data/relational/reference/r2dbc/repositories.html),
[Spring R2DBC 트랜잭션](https://docs.spring.io/spring-framework/reference/data-access/r2dbc.html).

## 생성 worker와 운영 정책

worker DB에는 `WORKER_R2DBC_URL`, `WORKER_R2DBC_USERNAME`, `WORKER_R2DBC_PASSWORD`를 별도로 주입한다.
`healthmith_worker`는 일반 사용자 테이블을 읽거나 쓸 수 없고 허용된 worker 함수만 실행한다.
사용자 API 연결에는 이 역할을 부여하지 않는다. 기존 PostgREST 모드에서만 service key를 사용한다.
생성 worker는 기본 비활성이다. 활성화에는 Gemini key/model, poll/request/queue timeout, lease,
출력 한도와 DB의 `generation_validation` 정책이 필요하다. 예시 운동·수치·프롬프트를 운영 정책으로
자동 등록하지 않는다. 실제 Gemini 호출과 출력 품질은 별도 확인한다.

실제 운동/부위 매핑·반복 상한·속도 안내, 자유 입력 정제/생성 요약 외부 전송 승인,
확정 커리큘럼 재사용, 통계 시간대/계산식, 작업/영수증 보존 기간은 명세의 미정 상태를 유지한다.
시작 정책 누락은 `503 POLICY_NOT_CONFIGURED`, 생성 worker 미준비는 `503 GENERATION_UNAVAILABLE`로
알리며, 통계 미정 값은 명세대로 null을 반환한다. 사전조사 저장만으로 생성·게임을 시작하지 않는다.

## 전투 설정과 검증 결과

전투 worker도 기본 비활성이며 R2DBC 모드에서는 위 worker DB 역할로 `combat_tick()`만 호출한다.
실제 ruleset/문양/적·덱 슬롯·HP/마나/비용/쿨다운·NPC 주기·매칭/준비/경기 timeout·요청 한도는
`combat_rulesets`와 `combat_encounters`에 검토한 버전으로 등록해야 한다. 운영 seed는 비어 있다.
유효한 설정 없이 전투를 활성화하지 않는다. 본문의 예시 값이나 테스트 fixture는 운영 밸런스가 아니다.

2026-11-09 macOS arm64·JDK 21에서 다음을 확인했다.

- 사전조사 브랜치: 131개 테스트와 bootJar 통과.
- 운동 사이클 브랜치: 255개 테스트와 bootJar 통과.
- 통합 브랜치: 296개 테스트(실패·오류·스킵 0)와 bootJar 통과.
- 노션에서 읽은 46개 메서드/경로가 실제 WebFlux에 매핑됨.
- 실제 PostgreSQL에서 RLS 소유권, 트랜잭션 rollback, 연결 풀 사용자 문맥 격리,
  사전조사 수정/재전송, 생성 claim/게시/실패, 확정/운동 완료/포기, 보석/설문/요약 저장 확인.
- 두 사용자 PvP 매칭/취소/준비/항복/승패, PvE 그림 시전/반대 방향 거절/중복 영수증,
  자원 한 번 차감, 보석 잠금 해제와 SSE 재생을 실제 DB로 확인.
- 일반 사용자 연결의 worker 호출·직접 UPDATE/DELETE·private 테이블 접근 차단 확인.

운영 Supabase DB/JWT·실제 Gemini·모바일 손 인식·문양 정확도·밸런스·운영 부하/복구·배포는
검증하지 않았다. 팀의 인수 조건·승인·병합 상태는 변경하지 않았다.

## 실제 Supabase 연동 확인 (2026-11-10)

앞 절의 2026-11-09 기록 이후 새 Supabase 프로젝트에 마이그레이션 12개와 최소 권한 역할을 적용했다.
`healthmith_app`에 별도 로그인 비밀번호를 설정하고 백엔드 `.env`의 R2DBC 연결에 사용한다.
관리자 비밀번호와 앱 비밀번호를 분리했으며 앱에는 관리자·역할 생성·RLS 우회 권한이 없다.
관리자 DB 자격 증명과 OAuth Secret 보관본은 `.env.admin`에 두고 앱 서버는 `.env`만 읽는다.
worker 역할은 `NOLOGIN`이고 worker는 계속 비활성이다.

현재 네트워크의 직접 IPv6 접속 대신 IPv4 세션 풀러를 사용한다. Supabase Dashboard의 Database Settings에서
다운로드한 CA를 지정하고 `sslMode=verify-full`로 서버 인증서와 호스트 이름을 검증한다.
인증서와 검증 결과는 Git에서 제외되는 `.local/`, 앱 비밀번호와 연결 값은 `.env`에 보관한다.
세션 풀러 계정 이름은 `healthmith_app.<PROJECT_REF>`이며 실제 DB 역할은 `healthmith_app`이다.
연결 풀은 `R2DBC_POOL_MAX_SIZE`로 조절하며 초기 연결은 요청 시 만든다.

관리자 마이그레이션 도구는 Python 3와 `psql`이 필요하며 `healthmith-backend/`에서 실행한다.

```sh
python3 scripts/apply-supabase-migrations.py          # 적용 예정 목록
python3 scripts/apply-supabase-migrations.py --apply  # SQL·이력을 같은 트랜잭션으로 적용
```

필요한 관리자 설정 이름은 `.env.admin.example`에 있다. 도구는 비밀번호를 명령 인수나 출력에 넣지 않는다.
적용 이력은 `supabase_migrations.schema_migrations`에 원문과 함께 저장한다. 이미 적용한 파일의 내용이 다르면
중단하며, 적용 후 재검사에서 신규 마이그레이션 0개를 확인했다. 앱 서버는 이 도구를 자동 실행하지 않는다.
기존 Supabase CLI 이력과 원문 저장 방식이 다르면 중단하므로, 기존 프로젝트의 이력을 덮어쓰는 용도로 사용하지 않는다.

서로 다른 두 Google 계정으로 실제 로그인한 뒤 다음을 확인했다.

- 브라우저 `/survey` → Next.js 서버 → Spring JWT 검증 → R2DBC → Supabase 저장 성공.
- 실제 발급된 사용자 JWT로 소유자 저장(201)·조회(200)·수정(200), 수정 후 버전 2 확인.
- 같은 키 재전송은 버전 2 유지, 오래된 버전 수정은 409로 거절.
- 두 번째 사용자는 자기 행을 저장·조회할 수 있고 첫 사용자의 조회·수정은 404로 차단.
- 비로그인·서명 변조 JWT는 401, 요청 본문의 소유자 주입은 400으로 차단.
- 앱 DB 계정으로 직접 실행해도 다른 소유자의 행은 보이지 않으며 위조 소유자 INSERT,
  직접 UPDATE·DELETE·worker 함수 호출은 SQLSTATE 42501로 차단.
- 앱 계정의 관리자·service_role 전환, auth.users·영수증 테이블 조회, 객체 생성 권한 없음.
- 테스트용 사전조사 3개와 수정 영수증, 임시 JWT 파일을 검증 후 정리했다.
- JDK 21에서 전체 백엔드 테스트 314개(실패·오류·스킵 0)와 bootJar 통과.

`scripts/verify-live-survey.py`는 실제 사용자 토큰을 별도 JSON 파일에서 읽어 같은 HTTP 검증을 실행할 수 있다.
`owner` 모드의 결과 파일과 토큰 파일을 각각 `other --owner-report`, `--owner-session-file`에 전달하며 서로 다른 사용자여야 한다.
다른 사용자 검증 전에 소유자 토큰으로 대상 행이 여전히 존재하는지 확인한다. 삭제한 행의 404를 접근 차단으로 오인하지 않는다.
토큰은 출력하지 않고, 검증 요청에 인증 헤더를 전달한 채 리디렉션을 따라가지 않는다.
각 실행은 테스트 행을 만들고 결과 파일의 `created_ids`에 정리할 ID를 기록하므로 관리자가 해당 행만 정리한다.
토큰·결과 파일은 `.local/`에 두고 JWT 파일은 검증 후 삭제한다.

확인 범위는 실제 로그인과 사전조사 저장·조회·수정·소유권이다. Gemini 생성, 실제 운동 카탈로그·전투 정책,
카메라 인식, 운영 부하·복구·배포는 이 연동 검사에 포함하지 않는다.
연결 설정 근거는 [Supabase SSL 안내](https://supabase.com/docs/guides/platform/ssl-enforcement)와
[R2DBC PostgreSQL 드라이버 설정](https://github.com/pgjdbc/r2dbc-postgresql)이다.

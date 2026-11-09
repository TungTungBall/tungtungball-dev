# 백엔드 구현과 실행

최신 기준 main은 `f6768dc`다. 노션 `Temp → tunGPI 명세서`의 API 계약을 따른다.
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

기술 근거: [Spring Data R2DBC](https://docs.spring.io/spring-data/relational/reference/r2dbc/repositories.html),
[Spring R2DBC 트랜잭션](https://docs.spring.io/spring-framework/reference/data-access/r2dbc.html).

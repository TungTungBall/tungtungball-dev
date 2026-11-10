# 실제 운동 화면 연결과 실행

이 문서는 #48 구현의 실행 안내다. 요구사항은 [US-02~05·07~10](https://github.com/TungTungBall/tungtungball/blob/main/docs/requirements/backlog.md)과 [기술 경계](https://github.com/TungTungBall/tungtungball/blob/main/docs/STACK.md)를 따른다. 사람의 인수 확인·카메라 정확도·팀 승인 완료를 뜻하지 않는다.

## 사용자 흐름

1. `/survey`에서 사전조사를 저장하고 초안 생성을 요청한다. 실제 생성은 Gemini worker 준비가 필요하다.
2. `/routine/generation/<requestId>`에서 생성 상태와 다섯 단계의 안내를 읽는다. 안내 확인 체크 후 확정 버튼을 눌러야 확정 API를 호출한다. 생성 성공만으로 확정하거나 게임을 시작하지 않는다.
3. `/camera?curriculumId=<id>`에서 확정된 버전과 각 운동의 측정 규칙을 확인한다. 카메라 권한 확인 후 시작 버튼을 눌러야 세션을 만든다. 미등록 규칙이나 권한 거절 시 시작하지 않는다.
4. `/workout?sessionId=<id>`에서 저장된 세션·확정 커리큘럼을 읽는다. 새로고침은 세션을 다시 만들지 않는다. 카메라가 측정한 한 번의 반복을 서버에 보내고, 서버 응답의 횟수·단계만 표시한다.
5. 30초 무동작, 화면 숨김, 카메라 종료·인식 오류는 일시정지를 요청한다. 수동 중단·재개·포기는 같은 세션과 버전을 사용한다. 통신 오류 중에는 측정을 멈추고 같은 요청 재시도/최신 상태 조회를 제공한다. 브라우저 강제 종료·오프라인의 중단 전송은 보장할 수 없으며 재진입 시 서버 상태를 다시 읽는다.
6. `/workout/complete?sessionId=<id>`는 서버 결과·보석을 표시한다. 완료한 세션 ID로 설문에 이동한다. 포기한 세션에는 보석·설문을 제공하지 않는다. 저장된 기록은 `/records`에서 확인한다.

메뉴의 ‘오늘의 운동’과 기록 화면의 ‘진행 중인 운동 이어가기’는 `/workout?connected=1`에서 본인의 현재 세션을 조회한다. 세션이 없으면 새 사전조사로 안내한다. `/design`에서 연결되는 ID 없는 `/routine`, `/camera`, `/workout`, `/workout/paused`, `/workout/complete`는 기존 디자인 예시다. 예시의 `+1회`는 실제 세션에 보내지 않는다.

확정·시작·반복·상태 변경에는 버전별 같은 요청 키를 재사용한다. 시작 성공을 확인하면 그 시도는 종료하고, 재사용이 허용된 루틴의 다음 운동에는 새 시작 키를 쓴다. 브라우저에는 키만 저장하며 API 토큰·영상·관절 좌표는 저장하지 않는다. 서버 액션은 매번 검증된 로그인 세션을 읽고 Spring은 JWT·소유권·버전·멱등성을 다시 확인한다.

## 카메라 측정 준비

MediaPipe Tasks Vision `1.2.2`를 사용한다. [공식 Web 안내](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web)의 VIDEO 추론을 classic Web Worker에서 실행한다. UI와 영상 추론을 분리하고 프레임은 한 번에 하나만 전달한다. 영상·좌표는 기기를 떠나지 않고 반복 이벤트만 서버에 보낸다.

`pnpm dev`·`pnpm build` 전에 SDK의 WASM과 모델을 자동 준비한다. 수동 명령은 `pnpm prepare:pose`다. 모델은 Google의 `pose_landmarker_lite/float16/1` 경로와 SHA-256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a`로 고정한다. 최초 준비에는 네트워크가 필요하고 이후 같은 체크섬의 파일을 재사용한다. 생성된 `public/mediapipe/`는 Git에 넣지 않으며 브라우저는 같은 사이트의 자산만 사용한다.

Next.js 서버의 `POSE_REPETITION_RULES`에는 운동 ID별 JSON을 넣는다. 현재 운동의 공개 가능한 규칙만 브라우저에 전달한다. **기본 규칙은 비어 있다.** 제공받은 `squat`, `push_up`, `lunge` 카탈로그에는 반복 횟수 범위가 있지만 카메라 각도·신뢰도 판정값은 없으므로 자동으로 확정하지 않았다.

| 필드 | 의미 |
| --- | --- |
| `joints` | 각도 계산에 사용할 MediaPipe 관절 인덱스 3개. 가운데 관절이 각도의 꼭짓점 |
| `contracted_angle`, `extended_angle` | 수축/펼침 임계각. 0 < 수축 < 펼침 < 180 |
| `min_visibility` | 필요한 세 관절의 최소 신뢰도. 0 초과 1 이하 |
| `stable_frames` | 각 자세가 연속으로 유지되어야 하는 프레임 수 |
| `min_cycle_ms` | 한 번의 왕복에 필요한 최소 시간 |
| `max_gap_ms` | 이보다 긴 프레임 공백이면 진행 중인 판정을 초기화 |
| `movement_degrees` | 무동작 감시에 사용할 유효 각도 변화량 |

규칙은 펼침 → 수축 → 펼침의 한 주기를 확인한다. 신뢰도 저하·화면 밖 관절·누락 프레임·역순 시각·불완전한 주기는 반복으로 인정하지 않는다. 빠른 진동·임계값 근처 노이즈는 연속 프레임과 최소 주기로 걸러낸다. 운동별 규칙은 측면/전면 촬영 조건과 실제 기준 영상으로 검토해야 한다. `TEST_EX` 규칙과 가상 좌표는 자동 검사 전용이며 운영 환경에 복사하지 않는다.

## 생성·DB 준비

백엔드 `.env.example`의 생성 worker 변수 목록과 `healthmith-backend/scripts/workout-setup.py`를 사용한다. 아래 명령은 백엔드 폴더에서 실행한다.

```sh
python3 scripts/workout-setup.py                    # 변수 이름/존재 여부만 검사. 비활성이거나 누락되면 미준비로 해석
python3 scripts/workout-setup.py --database         # 관리자 연결로 DB 준비 상태를 읽기 전용 조회
python3 scripts/workout-setup.py --mvp              # 제공받은 MVP SQL 적용 대상 확인
python3 scripts/workout-setup.py --mvp --apply      # 명시적으로 MVP 운동/정책만 적용
python3 scripts/workout-setup.py --prepare-worker  # NOLOGIN worker에 별도 로그인 준비, .env에만 비밀 저장
```

`--prepare-worker`는 기존 worker 자격 증명을 덮어쓰지 않는다. 최소 권한 `healthmith_worker` 역할이 먼저 있어야 한다. 일반 API와 비밀번호를 분리하고 TLS URL은 유지하며 로컬 `.env`는 소유자만 읽고 쓸 수 있게 저장한다. 이 명령은 worker를 켜지 않는다. 관리자 DB 연결이 실패하면 로컬 설정도 추가하지 않는다. 기존 로그인이 있는 역할의 자격 증명 회전은 관리자 작업이다.

별도 검토값을 사용할 때는 `--config <json>`으로 `exercises`와 `policies.workout_start`, `policies.generation_validation`을 검사한다. `--apply`를 붙여야 해당 운동·정책을 같은 트랜잭션으로 등록한다. 지원 부위·상한·목적 정제·프롬프트·출력 Schema·요약 전송 정책을 필수 검사하며, 테스트 값을 운영 기본값으로 만들지 않는다. Gemini 키 등 비밀 값은 이 JSON에 넣지 않는다.

`GENERATION_WORKER_ENABLED` 기본값은 `false`다. Gemini 키·모델·poll/request/queue 시간·lease·출력 한도, 별도 worker DB 연결과 DB 정책을 모두 준비한 뒤에만 켠다. poll/request 시간은 lease보다 짧아야 한다. 현재 R2DBC 모드에는 service key가 필요하지 않으며 `GENERATION_WORKER_SERVICE_KEY`는 PostgREST worker에만 사용한다.

## 제공받은 MVP 데이터와 정책 수정

`supabase/seeds/mvp-workout-20261110.sql`은 2026-11-10 사용자에게 전달받은 테크 리드의 중간 미팅용 값이다. 스쿼트·푸시업·런지, 반복 범위, 안내/생성 지시문·Schema, `include_generated_summary=false`, `allow_reuse=true`를 보존한다. migration에 섞거나 자동 실행하지 않는다.

2026-11-10 실제 Healthmith Supabase SQL Editor에서 적용 전 활성 운동 0개·관련 정책 0개·가동 worker 0개를 조회했다. 적용 후 운동 3개, 전달받은 생성 정책 JSON과 DB 값의 일치 `true`, 재사용 허용 `true`, 가동 worker 0개를 확인했다. 로컬 관리자 TCP 연결은 시간 초과로 SQL Editor를 사용했다. **별도 worker 로그인 준비·worker 활성화는 이번 실제 DB 검사에서 실행하지 않았다.**

새 migration `20261110140000_honor_generated_summary_policy.sql`은 요약 외부 전송이 꺼져 있을 때 다음 생성 스냅샷에도 요약을 넣지 않도록 고친다. 기존 worker의 미승인 요약 거절 검사는 유지한다. 이 수정이 없으면 성향 요약이 저장된 뒤 다음 루틴 생성이 실패할 수 있다. PR 병합 후 관리자가 기존 migration 도구로 적용해야 하며, 실제 Supabase에는 이번에 seed만 적용했다.

## 검증과 범위

실행 환경: macOS arm64, Node 24.22.1, pnpm 11.25.0, JDK 21, Docker PostgreSQL 17, Playwright Chromium 데스크톱/Pixel 7 에뮬레이션.

```sh
# healthmith-frontend
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm test:e2e

# healthmith-backend
python3 scripts/test-workout-setup.py
./gradlew test bootJar --console=plain
python3 scripts/check-test-results.py

# 백엔드 bootJar 준비 후 healthmith-frontend
pnpm test:workout
```

운동 브라우저 검사는 격리 PostgreSQL 컨테이너에 실제 migration/역할을 적용하고 실제 Spring jar와 Next.js를 실행한다. 임시 RSA/JWKS와 가상 사용자만 사용한다. 시작할 포트는 Next 3000, Spring 8081, fixture Auth 8091이며 이미 점유됐으면 기존 프로세스를 재사용하지 않는다. 컨테이너와 서버는 종료 때 정리한다. 운영 Supabase·Google·Gemini 자격은 사용하지 않는다.

실제 SDK·WASM·모델 기동은 가상 카메라로 검사한다. 다섯 단계 완료는 가상 관절 입력을 사용하되 상태 저장·JWT·R2DBC·보석·설문·기록은 실제 경로로 확인한다. 응답 유실 뒤 같은 이벤트 재시도, 타인 조회 거절, 카메라 권한 거절, 30초 무동작도 검사한다. 실제 사람 영상의 횟수 오차·기기별 성능·실제 휴대폰·Gemini 품질·운영 배포는 이 결과로 대체하지 않는다.

2026-11-10 로컬 최종 결과: 프론트 린트·타입·빌드 통과, 단위 152개·기본 브라우저 38개·실제 운동 브라우저 12개 통과. 백엔드 317개(실패·오류·생략 0)와 bootJar 통과, 설정 도구 검사 6개 통과. 실제 Supabase의 제공받은 seed 등록 확인과 이 자동 검사 결과를 구분한다.

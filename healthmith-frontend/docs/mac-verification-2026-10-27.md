# 2026-10-27 Mac 실행 확인

사용자 요청으로 이 Mac에서 실행한 결과다. 기존 Windows 기록·Linux CI와 구분하며 다른 팀원 기기의 성공을 대신하지 않는다.

## 실행 환경과 준비

| 항목 | 실제 확인한 값 |
| --- | --- |
| 운영체제·칩 | macOS 15.1.1, Apple M1 Pro, arm64 |
| Node.js·pnpm | 24.20.0 / 11.25.0 — 프로젝트 고정값과 일치 |
| 백엔드 JDK·wrapper | 기존 JDK 21.0.11 / Gradle 9.8.2 |
| 코드 기준 | main b030df9와 같은 애플리케이션·의존성·테스트 파일 |
| 브라우저 | 프로젝트 Playwright 1.64.1의 Chromium. 데스크톱·Pixel 7 에뮬레이션 |

[Node 24.20.0 공식 배포](https://nodejs.org/dist/v24.20.0/)의 SHA-256과 [pnpm 11.25.0 공식 패키지](https://registry.npmjs.org/pnpm/11.25.0)의 SHA-512 integrity를 대조한 도구를 작업 전용 경로에서 사용했다. 프로젝트 의존성은 기존 pnpm-lock.yaml로 복원했다. 생성기를 다시 실행하거나 의존성 선언·잠금 파일을 갱신하지 않았다.

## 실제 명령과 결과

프론트 명령은 `healthmith-frontend/`, 백엔드 명령은 `healthmith-backend/`에서 실행한다.

| 명령·방법 | 실제 결과 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 성공, 종료 코드 0. Mac 의존성 복원 |
| `pnpm lint` | 성공, 종료 코드 0 |
| `pnpm typecheck` | 성공, 종료 코드 0 |
| `pnpm test:unit` | 1개 파일·2개 테스트 통과 |
| `pnpm build` | 성공, 종료 코드 0 |
| `pnpm exec playwright install chromium` | 성공. 현재 테스트 버전의 브라우저 준비 |
| `pnpm test:e2e` | 데스크톱·모바일 기본 화면 2개 통과. 재시도 없이 성공 |
| `./gradlew bootRun --no-daemon --console=plain` | 실제 Spring 서버 시작, GET /health → HTTP 200·JSON status UP |
| `pnpm dev --hostname 127.0.0.1` | 실제 Next 개발 서버 시작, 시작 화면 HTTP 200 |
| 기존 Playwright로 실제 두 서버 화면 확인 | 연결 성공·재확인·시작 화면 이동·모바일 표시·백엔드 종료 후 실패 표시 확인 |

백엔드 전체 테스트 2개와 스모크 단독 1개는 앞서 같은 코드·같은 Mac에서 통과한 [백엔드 기록](../../healthmith-backend/README.md#실행-확인)을 연결한다. 이번 후속 확인에서 테스트를 새로 실행했다고 적지 않는다.

## 실제 Spring과 화면 연결

테스트용 가짜 API 대신 저장소의 Spring Boot 애플리케이션을 8080에 실행했다. Next 개발 서버는 3000에서 실행했다.

1. 시작 화면의 `백엔드 연결 확인` 링크로 이동해 `연결 성공`과 정상 연결 안내를 확인했다.
2. `다시 확인`으로 실제 health를 다시 호출해 성공 표시를 확인했고, `시작 화면으로` 이동도 확인했다.
3. Pixel 7 에뮬레이션에서도 실제 Spring 연결 성공과 가로 넘침 없음을 확인했다.
4. 이번 검사에서 띄운 Spring 서버를 종료한 뒤 페이지를 다시 요청했다. `연결 확인 필요`·`백엔드에 연결할 수 없습니다`로 바뀌었고 재확인해도 성공으로 표시되지 않았다.
5. 두 상태에서 브라우저 런타임 오류는 없었다. 검사에서 띄운 Next 서버도 종료했고 3000·8080 포트가 닫힌 것을 확인했다.

화면 캡처와 자동 생성 보고서는 ignore 대상인 `test-results/`, `playwright-report/`에 보관했다. 캡처를 공유 저장소의 필수 근거로 연결하지 않는다.

## 확인 범위

- 위 결과는 이 기기의 자동 실행 기록이다. 학생 본인의 직접 설치·각 팀원의 Mac 실행·지침 검토·GitHub 승인은 별도로 남긴다.
- 모바일은 Chromium 에뮬레이션이며 실제 휴대폰·Safari·카메라 검증은 포함하지 않는다.
- 현재 연결은 Next 서버 → Spring health 요청이다. 브라우저 CORS, Supabase JWT·RLS, Gemini·제품 기능의 연동 성공을 뜻하지 않는다.
- 기존 Windows 기록과 달리 실제 Spring 연결도 확인했다. 원격 CI 결과는 GitHub의 해당 커밋 결과로 별도 확인한다.

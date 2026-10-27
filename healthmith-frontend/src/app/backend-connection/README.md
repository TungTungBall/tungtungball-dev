# 백엔드 연결 확인 화면

- 작업일: 2026-10-27 (Asia/Seoul)
- 범위: 화면 영역 `src/app/`만 수정. 의존성·루트 설정·ignore·기존 README·백엔드 파일은 수정하지 않음.
- 브랜치: `codex/frontend-backend-connection`.
- 커밋·push: 수행하지 않음.

## 연결 방식과 근거

시작 화면의 `백엔드 연결 확인` 링크로 `/backend-connection`에 진입한다.
Next.js Server Component가 서버 측에서 `GET /health`를 호출한다.
별도 Next.js API·프록시·CORS 설정·추가 패키지는 만들지 않았다.
응답 HTTP 200과 JSON의 `status: UP`을 모두 확인해야 `연결 성공`으로 표시한다.
`다시 확인`은 페이지를 다시 요청하며 이전 응답을 캐시하지 않는다. 요청 제한 시간은 5초다.

- `healthmith-backend/src/main/resources/application.properties`에는 포트 재정의가 없다.
- [Spring Boot 4.1.2 공식 속성 문서](https://docs.spring.io/spring-boot/appendix/application-properties/index.html)의 `server.port` 기본값 8080을 확인했다.
- 로컬 기본 대상은 `http://127.0.0.1:8080`이다. `BACKEND_API_URL`로 변경할 수 있다. 이 변수는 서버 전용이며 `NEXT_PUBLIC_` 접두사를 사용하지 않는다.
- 응답 계약은 `origin/feature/health-check`의 HealthController에서 확인했다: `GET /health` → `{"status":"UP"}`.
- 같은 브랜치의 SecurityConfig는 GET /health를 인증 없이 허용한다. 다른 API의 인증은 이번 범위가 아니다.
- 현재 main 및 작업 폴더에는 위 health 코드가 아직 없고 실행 중인 8080 서버·빌드 결과도 없었다. **실제 Spring 통합 성공은 아직 검증하지 않았다.**

설치된 Next.js의 공식 문서에서 다음 절을 읽었다.

- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`: When to use Server and Client Components?
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/connection.md`: 요청 시점 렌더링과 prerender 제외.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`: options.cache, no-store.
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`: Loading Environment Variables.

## 직접 확인하는 방법

백엔드 팀이 health-check 버전을 실행한 다음, 프론트 폴더에서 기존 설치 환경으로 실행한다.
초기화·의존성 설치 명령은 필요하지 않다.

```sh
pnpm dev
```

`http://localhost:3000` → `백엔드 연결 확인` → `연결 성공`을 확인한다.
서버가 꺼져 있으면 연결 실패 안내가 표시되는 것이 정상이다.
백엔드 실행 주소가 기본값과 다른 경우 서버 실행 환경에서 BACKEND_API_URL을 지정한다.

macOS:

```sh
BACKEND_API_URL=http://127.0.0.1:8080 pnpm dev
```

Windows PowerShell:

```powershell
$env:BACKEND_API_URL = 'http://127.0.0.1:8080'
pnpm dev
```

8080은 로컬 기본값의 예시이며 원격 배포 시에는 실제 백엔드 주소를 지정한다.
이 문서의 실행 안내는 재현 절차이며 아래 실제 실행 결과와 구분한다.

## 실제 실행한 명령과 결과

환경: Windows x64, Node.js 24.20.0, pnpm 11.25.0.

| 명령·방법 | 결과 |
| --- | --- |
| git fetch origin, git show origin/feature/health-check의 controller·security·properties | 실제 API 계약과 미병합 상태 확인 |
| git switch -c codex/frontend-backend-connection origin/main | 작업 브랜치 생성 성공 |
| node --input-type=module (표준입력 HTTP fixture 검증 스크립트) | 12건 통과. 실제 네트워크 요청으로 미설정·잘못된 URL·자격증명 포함 URL·query 포함 URL·정상 응답·401·404·잘못된 JSON·DOWN·리다이렉트·시간 초과·서버 중단 검사 |
| pnpm lint | 성공, 종료 코드 0 |
| pnpm typecheck | 성공, 종료 코드 0 |
| pnpm test:unit | 기존 2개 통과, 종료 코드 0 |
| pnpm build | 성공, 종료 코드 0. 연결 확인 경로는 요청 시 동적 렌더링 |
| pnpm test:e2e | 기존 Chromium 데스크톱·모바일 2개 통과 |
| node --input-type=module (표준입력 브라우저 fixture 검증 스크립트) | 기존 Playwright로 실제 빌드 서버·HTTP fixture를 실행. 화면 진입·성공·재시도 후 401·잘못된 JSON·5초 시간 초과·정상 복구·모바일 가로 넘침 없음·서버 중단 표시 확인. 브라우저 런타임 오류 없음 |

테스트용 HTTP 서버는 실제 Spring 애플리케이션을 대체하는 검증 fixture다.
fixture의 성공을 실제 백엔드 통합 성공으로 기록하지 않는다.
브라우저 검증용 서버는 검사 후 종료했고, 캡처는 ignore된 `test-results/`에 남겼다.
신규 검증을 위해 테스트 설정이나 다른 담당자의 테스트 파일을 변경하지 않았다.

## 실패 후 수정한 것

- 화면 링크 작성 스크립트가 PowerShell 예약 변수 HOME과 충돌했다. 변수명을 변경해 다시 실행했다.
- 검증 스크립트의 `--experimental-default-type=module`은 현재 Node.js에서 지원하지 않아 종료 코드 9로 실패했다. 해당 옵션을 제거하고 `--input-type=module`로 다시 실행해 통과했다.
- Node가 독립 TS 모듈 검증에서 MODULE_TYPELESS_PACKAGE_JSON 경고를 출력했다. 공유 package.json을 변경하지 않았으며 Next.js 빌드와 검증은 통과했다.

## 실행하지 않은 것

- 실제 Spring Boot 서버 시작 및 실제 /health 통합 검증: 현재 작업 폴더에 endpoint가 없고 실행 중 서버도 없음.
- macOS에서의 실행 확인.
- 원격 CI.
- 설치·초기화, 백엔드 파일 변경, 공유 설정 변경, 커밋·push.

## 백엔드 팀에 필요한 확인

health-check 코드가 main에 반영되었거나 해당 버전으로 서버가 실행되어야 한다.
`GET /health`가 인증 없이 HTTP 200과 `{"status":"UP"}`를 반환하는지 확인한다.
그 후 이 화면의 `다시 확인`으로 실제 통합 결과를 검증할 수 있다.

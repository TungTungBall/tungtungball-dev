# 프론트엔드 초기화 기록

- 작업일: 2026-10-27 (Asia/Seoul)
- 실행 주체: 사용자 요청을 받아 Codex가 명령 실행. 팀원 본인의 실행 확인과 구분한다.
- 실행 환경: Windows x64, PowerShell 7.6.5, Node.js 24.20.0, pnpm 11.25.0.
- 저장소 루트: `tungtungball-dev/`.
- 프론트엔드 위치: `healthmith-frontend/`.
- 범위: 기본 화면, UI 스타일, 실행 설정, 테스트, CI, 설치·실행 안내.
- 실제 서비스 기능·Next.js API·백엔드 연동·카메라·LLM·DB·인증은 구현하지 않았다.

## 공식 문서 확인

2026-10-27에 아래 공식 문서의 해당 절을 열어 확인했다.
버전 번호는 공개 패키지 메타데이터와 실제 설치 결과도 함께 확인했다.
이 기록은 팀원 전원이 직접 문서를 확인하거나 macOS에서 실행했다는 뜻이 아니다.

| 문서 | 확인한 절 | 적용 |
| --- | --- | --- |
| [Next.js Installation](https://nextjs.org/docs/app/getting-started/installation) | System requirements, Create with the CLI | Node.js 요구사항, TypeScript·App Router 초기화 |
| [create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app) | Reference | src-dir, empty, skip-install, disable-git, no-* 옵션 |
| [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next) | Commands, next dev options | dev·build·start·typegen, 포트·호스트 지정 |
| [pnpm Installation](https://pnpm.io/installation) | Prerequisites, Supported platforms | 설치 환경·macOS arm64/x64 지원. 현재 설치된 pnpm 11.25.0 유지 |
| [pnpm install](https://pnpm.io/cli/install) | TL;DR, Options | frozen-lockfile로 잠금 파일 유지 |
| [Tailwind Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs) | Install Tailwind CSS, Configure PostCSS Plugins | 수동 가이드는 PostCSS 방식. 실제 생성기는 Tailwind Turbopack 설정을 생성했으므로 중복 PostCSS 설정을 추가하지 않음 |
| [shadcn/ui Next.js](https://ui.shadcn.com/docs/installation/next) | Existing Project, Run the CLI, Add Components | 기존 Next.js 프로젝트에 UI 초기화 |
| [shadcn CLI](https://ui.shadcn.com/docs/cli) | init, add | defaults·yes 및 컴포넌트 추가. 고정 CLI의 --help도 확인 |
| [Vitest Getting Started](https://vitest.dev/guide/) | Adding Vitest to Your Project, Writing Tests | 개발 의존성 설치, 단발 실행 |
| [Playwright Installation](https://playwright.dev/docs/intro) | Installing Playwright, Running the Example Test | 테스트 도구·실행 방식 |
| [Playwright Browsers](https://playwright.dev/docs/browsers) | Introduction | 버전별 브라우저 바이너리 설치 |
| [Playwright Web server](https://playwright.dev/docs/test-webserver) | Introduction | 테스트 서버 자동 실행 |
| [Playwright CI](https://playwright.dev/docs/ci) | Introduction, GitHub Actions | CI에서 Chromium·시스템 의존성 설치 |
| [GitHub Node.js CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs) | Specifying the Node.js version, Installing dependencies, Building and testing your code | 프론트 폴더에서 검사·빌드 실행 |
| [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node) | Usage, Basic usage | 공식 README의 v7 참조 |
| [ESLint Version Support](https://eslint.org/version-support/) | Current Release Lines | ESLint 9의 지원 종료 확인. 아래 호환성 제한 기록 |

## 실행한 초기화·설치 명령과 결과

아래 명령은 실제 실행했다. 생성기를 다시 실행할 필요는 없으며 팀원은 README의 설치 절을 따른다.

| 위치 | 명령 | 결과 |
| --- | --- | --- |
| 루트 | git status --short | 기존 `frontend/.gitkeep` 삭제 확인. 이번 작업에서 보존하고 커밋 대상에서 제외 |
| 루트 | git fetch origin | 성공. origin/main 기준 확인 |
| 루트 | git switch -c codex/frontend-scaffold origin/main | 성공. 작업 브랜치 생성 |
| 루트 | node --version / pnpm --version | v24.20.0 / 11.25.0 |
| 루트 | pnpm view create-next-app version / pnpm view next version / pnpm view shadcn version / pnpm view vitest version / pnpm view @playwright/test version | 각각 16.4.3 / 16.4.3 / 4.22.1 / 5.0.5 / 1.64.1 |
| 루트 | pnpm dlx create-next-app@16.4.3 healthmith-frontend --ts --eslint --tailwind --app --src-dir --use-pnpm --import-alias '@/*' --empty --disable-git --no-agents-md --no-agent-feedback --no-react-compiler --no-cache-components --skip-install --yes | 성공. 빈 app-tw-empty 템플릿 생성. Git 중첩 초기화·에이전트 파일 생성 생략 |
| 프론트 | pnpm view next@16.4.3 engines --json | Node.js >=20.9.0 |
| 프론트 | pnpm view vitest@5.0.5 engines --json | Node.js ^22.12.0 또는 ^24.0.0 또는 >=26.0.0 |
| 프론트 | pnpm view @playwright/test@1.64.1 engines --json | Node.js >=20 |
| 프론트 | pnpm dlx shadcn@4.22.1 init --help | 성공. 고정 CLI 옵션 확인 |
| 프론트 | pnpm install | 성공. 생성기 의존성과 잠금 파일 설치. ESLint 9 지원 종료 경고 발생 |
| 프론트 | pnpm dlx shadcn@4.22.1 init --defaults --no-monorepo --yes | 성공. base-nova 스타일, 버튼·유틸리티·테마 생성 |
| 프론트 | pnpm dlx shadcn@4.22.1 add button --yes | 성공. 이미 초기화에서 생성한 동일 버튼 파일은 건너뜀 |
| 프론트 | pnpm add -D --save-exact vitest@5.0.5 @playwright/test@1.64.1 | 성공. Node 타입 peer 경고 확인 |
| 프론트 | pnpm view eslint-config-next@16.4.3 peerDependencies --json | eslint >=9.0.0 확인. 하위 플러그인 범위는 별도 확인 필요 |
| 프론트 | pnpm add -D --save-exact eslint@10.13.0 | 설치 성공. 하위 플러그인의 ESLint 10 미지원 peer 경고 발생 |
| 프론트 | pnpm exec playwright install chromium | 성공. Chromium·headless shell 및 실행 보조 도구 설치 |
| 프론트 | pnpm add -D --save-exact @types/node@24 | 성공. 24.19.2 설치. Vitest Node 타입 요구에 맞춤 |
| 프론트 | pnpm peers check | eslint-plugin-import·jsx-a11y·react가 ESLint 9까지만 허용하는 충돌 확인 |
| 프론트 | pnpm add -D --save-exact eslint@9.39.5 | 성공. 생성기의 호환 버전으로 복귀. 지원 종료 경고는 남음 |
| 프론트 | pnpm list --depth 0 --json | 실제 설치 버전 확인 후 package.json의 직접 의존성을 정확한 버전으로 고정 |

초기 샌드박스 안에서는 Git 경로 접근 오류가 발생했으며, 지정 저장소 접근 권한을 적용한 뒤 정상 실행했다.
GitHub CLI 로그인은 없었고, 사용자가 PR 작성을 직접 하기로 했다. 원격 push·PR 생성은 수행하지 않는다.

## 계획과 실제의 차이·제약

- 사용자 설명에 따라 프론트엔드만 작업했다. 서버 API·health endpoint를 만들지 않았다.
- 루트 README 원문은 유지하고 프론트 안내 링크를 덧붙였다. 기존 백엔드·문서·에이전트 파일은 수정하지 않았다.
- create-next-app은 PostCSS 파일 대신 `@tailwindcss/turbopack`과 next.config.ts의 CSS 로더를 생성했다.
- shadcn CLI는 버튼까지 생성했고 `cn` 패키지를 사용했다. 계획의 유틸리티 파일은 해당 export를 따른다.
- shadcn이 추가한 Google 폰트 다운로드를 제거하고 시스템 폰트로 구성했다.
- eslint-config-next의 직접 peer 범위만 보고 ESLint 10을 설치했으나, 하위 플러그인이 지원하지 않았다. 강제 peer 무시 설정 없이 ESLint 9.39.5로 복귀했다.
- **알려진 제약:** ESLint 9는 지원 종료 상태다. Next.js 하위 플러그인의 ESLint 10 지원 조합이 확인되면 별도 의존성 갱신 작업으로 교체한다. 이번에는 생성기의 호환 조합을 유지한다.
- Vitest 최초 실행에서 설정의 CommonJS/ESM 경고가 발생해 vitest.config.ts를 vitest.config.mts로 변경했다. 재실행 시 경고 없이 2개 테스트가 통과했다.
- next dev가 AGENTS.md를 자동 생성했다. 이 신규 파일은 도구 생성 원문을 유지한다. 기존 에이전트 파일을 덮어쓴 것이 아니다.
- 데스크톱·모바일 테스트 캡처를 육안 확인했다. test-results 아래 캡처는 커밋하지 않는다.
- E2E의 NO_COLOR/FORCE_COLOR 경고는 실행 환경의 출력 색상 설정 충돌이며 테스트는 통과했다.
- 실제 실행 결과는 Windows x64 기준이다. macOS와 원격 CI 결과는 아직 없다.

## 실행 검사

아래는 실제 Windows 실행 결과다. 프로덕션 시작은 E2E webServer의 pnpm start --hostname 127.0.0.1로 함께 검증했다.

| 위치 | 명령 | 실제 결과 |
| --- | --- | --- |
| 프론트 | pnpm install --lockfile-only | 성공, 종료 코드 0. 직접 의존성 버전 고정에 맞춰 잠금 파일 갱신 |
| 프론트 | pnpm install --frozen-lockfile | 성공, 종료 코드 0. Lockfile is up to date |
| 프론트 | pnpm peers check (최종) | 성공, 종료 코드 0. No peer dependency issues found |
| 프론트 | pnpm lint | 성공, 종료 코드 0. 최종 설정·테스트 포함 검사 |
| 프론트 | pnpm typecheck | 성공, 종료 코드 0. next typegen 후 tsc --noEmit |
| 프론트 | pnpm test:unit | 성공, 종료 코드 0. 1개 파일·2개 테스트 통과 |
| 프론트 | pnpm build | 성공, 종료 코드 0. /와 /_not-found 정적 생성 |
| 프론트 | pnpm test:e2e | 성공, 종료 코드 0. Chromium 데스크톱·모바일 2개 통과. HTTP 200·제목·문구·버튼·가로 넘침·런타임 오류 확인 |
| 프론트 | pnpm dev --hostname 127.0.0.1 | Ready 확인. Invoke-WebRequest로 HTTP 200과 한국어 제목·초기 문구 확인. 확인 후 서버 종료 |
| 루트 | git check-ignore 규칙 검사 | 7개 제외 경로 확인. .env.example·pnpm-lock.yaml은 추적 가능 |
| 루트 | git diff --check / 백엔드 변경 확인 | 성공. 백엔드 diff 없음. 커밋 직전 staged 파일도 추가 검사 |

## 팀원 최종 macOS 확인

정리 담당 1명이 각자 직접 실행한 명령·결과·OS·칩·오류를 취합한다.
Codex의 Windows 실행 결과나 Linux CI 통과로 이 표를 대신 채우지 않는다.

| 팀원 | macOS 버전·칩 | 설치 | 기본 실행 | 린트·타입·빌드 | 단위·E2E | 남은 문제 |
| --- | --- | --- | --- | --- | --- | --- |
| 강태은 | 미확인 | 미실행 | 미실행 | 미실행 | 미실행 | 직접 확인 필요 |
| 양정우 | 미확인 | 미실행 | 미실행 | 미실행 | 미실행 | 직접 확인 필요 |
| 윤재준 | 미확인 | 미실행 | 미실행 | 미실행 | 미실행 | 직접 확인 필요 |
| 이형민 | 미확인 | 미실행 | 미실행 | 미실행 | 미실행 | 직접 확인 필요 |
| 정현태 | 미확인 | 미실행 | 미실행 | 미실행 | 미실행 | 직접 확인 필요 |


## 실제 고정 버전

아래는 package.json의 직접 의존성이다. 간접 의존성은 pnpm-lock.yaml을 따른다.

| 구분 | 패키지 | 버전 |
| --- | --- | --- |
| dependencies | @base-ui/react | 1.9.0 |
| dependencies | class-variance-authority | 0.7.1 |
| dependencies | cn | 0.5.0 |
| dependencies | lucide-react | 1.61.0 |
| dependencies | next | 16.4.3 |
| dependencies | react | 19.3.0 |
| dependencies | react-dom | 19.3.0 |
| dependencies | shadcn | 4.22.1 |
| dependencies | tw-animate-css | 1.4.0 |
| devDependencies | @playwright/test | 1.64.1 |
| devDependencies | @tailwindcss/turbopack | 4.3.3 |
| devDependencies | @types/node | 24.19.2 |
| devDependencies | @types/react | 19.3.0 |
| devDependencies | @types/react-dom | 19.3.0 |
| devDependencies | eslint | 9.39.5 |
| devDependencies | eslint-config-next | 16.4.3 |
| devDependencies | tailwindcss | 4.3.3 |
| devDependencies | typescript | 5.9.3 |
| devDependencies | vitest | 5.0.5 |

## 최종 변경 검토

- 최초 staged diff 검사에서 E2E 테스트 파일 끝의 불필요한 빈 줄 1개를 발견해 제거했다.
- 실행 도중 생성된 캐시·스크린샷·보고서는 ignore 대상이며, 신규 AGENTS.md는 next dev가 생성한 원문이다.
- 기존 frontend/.gitkeep 삭제는 사용자 변경으로 남기고 이번 커밋에서 제외한다.

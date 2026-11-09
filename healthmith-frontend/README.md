# 헬스미스 프론트엔드

Next.js App Router와 TypeScript 기반의 실행 가능한 최소 구조입니다.
기본 화면과 UI 스타일, 단위 테스트, 브라우저 스모크 테스트를 포함합니다.
실제 서비스 기능은 아직 구현하지 않았습니다. 시작 화면의 `백엔드 연결 확인`에서 Spring의 `/health` 상태를 확인할 수 있습니다.
Mac에서 설치·실행·테스트와 실제 Spring 연결까지 확인한 결과는 [Mac 실행 기록](docs/mac-verification-2026-10-27.md)에 있습니다.

## 위치와 담당 범위

저장소 루트는 `tungtungball-dev/`, 프론트엔드 프로젝트는 `healthmith-frontend/`입니다.
아래 명령은 별도 표시가 없으면 **프론트엔드 폴더에서** 실행합니다.
`healthmith-backend/`는 다른 팀이 관리합니다.

```text
tungtungball-dev/
├─ .github/workflows/frontend.yml
├─ .gitignore
├─ README.md
├─ healthmith-backend/
└─ healthmith-frontend/
   ├─ src/app/             # 레이아웃, 기본 화면, 전역 스타일
   ├─ src/components/ui/   # shadcn/ui 컴포넌트
   ├─ src/lib/             # 공유 UI 유틸리티
   ├─ tests/unit/          # Vitest
   ├─ tests/e2e/           # Playwright
   └─ docs/setup-log.md    # 공식 문서와 실제 실행 결과
```

루트 설정·의존성·잠금 파일·ignore 규칙은 공유 담당자가 관리합니다.
화면·테스트 담당자는 같은 설정 파일을 중복 생성하지 않습니다.
새 Git 저장소나 루트 Node.js workspace는 만들지 않습니다.

## 사전 설치

- Git
- Node.js **24.20.0** (`.node-version`)
- pnpm **11.25.0** (`package.json`의 `packageManager`)

Node.js는 [공식 설치 안내](https://nodejs.org/en/download)를 보고 설치하세요.
pnpm 설치 방법은 [공식 문서](https://pnpm.io/installation)를 참고하세요.
Node.js가 설치된 환경에서 버전을 맞추는 명령은 다음과 같습니다.

```sh
npm install --global pnpm@11.25.0
node --version
pnpm --version
```

macOS Apple Silicon에서는 arm64, Intel에서는 x64 Node.js를 사용합니다.
`node -p "process.arch"`로 확인하고 Rosetta의 x64 환경과 arm64 환경을 섞지 마세요.
다른 OS·아키텍처의 `node_modules`를 복사하지 말고 각 기기에서 설치합니다.
프론트 기본 화면과 기존 E2E 검사에는 Java·Python·Docker·DB·API 키가 필요하지 않습니다. 실제 백엔드 연결 화면을 확인하려면 별도로 JDK 21 기반 Spring 서버를 실행합니다.

## 설치와 개발 실행

저장소 루트에서 다음을 실행합니다.

```sh
cd healthmith-frontend
pnpm install --frozen-lockfile
pnpm dev
```

[http://localhost:3000](http://localhost:3000)에 `헬스미스`,
`프론트엔드 기본 화면이 준비되었습니다.`, 비활성화된 `준비 완료` 버튼이 보이면 성공입니다.
버튼은 스타일 확인용이며 실제 기능을 수행하지 않습니다.
종료하려면 실행한 터미널에서 `Ctrl+C`를 누릅니다.

개발·프로덕션 기본 포트는 **3000**이며 5000은 사용하지 않습니다.
3000이 사용 중이면 개발 서버는 `pnpm dev --port 3001`로 실행할 수 있습니다.
E2E 테스트는 3000을 사용하므로 해당 포트의 기존 서버를 먼저 종료하세요.

## 검사와 테스트

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

- 린트·타입 검사·빌드: 오류 없이 종료 코드 0.
- 단위 테스트: 공통 클래스 유틸리티 테스트 2개 통과.
- E2E: Chromium 데스크톱·모바일 화면 검사 2개 통과.
- 기존 E2E는 시작 화면(`/`)만 검사합니다. 실제 Spring 연결 확인은 별도로 실행한 [Mac 기록](docs/mac-verification-2026-10-27.md)을 참고하세요. CI의 E2E 성공에 Spring 연동 검사가 포함되지는 않습니다.
- E2E는 **먼저 생성한 프로덕션 빌드**를 자동 실행하고 종료합니다.
  개발 서버를 따로 켜지 않아도 됩니다. 빌드가 없으면 `pnpm build`를 먼저 실행하세요.
- Chromium 설치는 최초 실행 또는 Playwright 버전 변경 시 필요합니다.
- 모바일 테스트는 Chromium의 기기 에뮬레이션이며 실제 iPhone·Safari 검증을 뜻하지 않습니다.
- 리포트는 `pnpm exec playwright show-report`로 확인합니다.

프로덕션 화면을 직접 확인하려면 다음을 실행합니다.

```sh
pnpm build
pnpm start
```

프로젝트에 별도 포맷터는 구성하지 않았습니다. `pnpm lint`가 포맷 검사 전체를 대신하는 것은 아닙니다.

## 환경변수와 ignore 규칙

프론트 기본 실행의 필수 환경변수는 없습니다. `BACKEND_API_URL`은 선택적인 서버 전용 변수이며 미설정 시 로컬 8080의 Spring 서버를 사용합니다. 인증 방식·그 밖의 공개 설정은 해당 API 계약을 정한 뒤 추가합니다.
비밀 키는 브라우저 코드에 넣지 않습니다.
`.env*`는 제외하지만 향후 `.env.example`은 추적할 수 있도록 예외를 두었습니다.
의존성·빌드·테스트 결과는 `.gitignore`로 제외하고 `pnpm-lock.yaml`은 커밋합니다.

## CI와 최종 확인

프론트엔드 변경 PR과 지정된 브랜치 push에 GitHub Actions가 린트·타입 검사·단위 테스트·빌드·E2E를 실행합니다.
워크플로 경로는 저장소 루트의 `.github/workflows/frontend.yml`입니다.
CI의 Linux 결과는 팀원 5명의 최종 macOS 실행 확인과 별개입니다.
실제 실행한 명령·결과·미실행 항목은 [초기화 기록](docs/setup-log.md)에 남깁니다.

## 문제 해결

- `pnpm`을 찾을 수 없음: Node.js 설치를 확인하고 위 pnpm 설치 명령을 실행한 뒤 새 터미널을 엽니다.
- Node.js 엔진 오류: `.node-version`과 같은 버전으로 변경합니다.
- `Executable doesn't exist`: `pnpm exec playwright install chromium`을 실행합니다.
- E2E에서 포트 사용 중 오류: 3000에서 실행 중인 자신의 서버를 종료하고 다시 실행합니다.
- 프로덕션 빌드 없음: `pnpm build`를 먼저 실행합니다.
- 설치 실패: 실행 위치·명령·OS·아키텍처·오류 메시지를 그대로 기록합니다. 잠금 파일을 지워서 해결하지 않습니다.

## Google 로그인

`/login`에서 Google 로그인을 시작하면 Supabase Auth를 거쳐 `/auth/callback`으로 돌아온다. 서버에서 PKCE 코드를 교환하고 검증한 뒤 `/survey`로 이동한다. `next`에는 앱 내부 경로만 허용한다. 세션은 HttpOnly 쿠키에 저장하며 로그아웃은 현재 브라우저 세션에 적용한다.

로컬 설정은 `.env.example`을 참고해 `.env.local`에 넣는다. `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL=http://localhost:3000`이 필요하다. Google Client ID와 Secret은 Supabase Dashboard의 Authentication → Sign In / Providers → Google에 등록한다. Google Secret은 프론트엔드에 넣지 않는다.

GCP 웹 OAuth 클라이언트의 리디렉션 URI는 Supabase Google 공급자 화면에 표시된 `/auth/v1/callback` 주소를 사용한다. Supabase의 Site URL에는 앱 origin을, Redirect URLs에는 `http://localhost:3000/auth/callback`과 `http://127.0.0.1:3000/auth/callback`을 등록한다. 요청 권한은 `openid email profile`이다. Google 앱이 테스트 모드라면 계정에 따라 테스트 사용자 등록이 필요할 수 있다.

개발 서버에 접속하는 호스트와 `APP_URL`을 일치시킨다. 실제 배포에서는 HTTPS origin과 정확한 콜백 URL로 설정을 변경한다. 비밀 값 파일은 Git에서 제외한다.

2026-11-10 macOS에서 새 GCP 웹 OAuth 클라이언트와 Supabase Google 공급자를 연결해 실제 Google 로그인 → `/survey` 복귀 → `/login` 재방문 및 새로고침 후 세션 유지 → 로그아웃을 확인했다. GCP 앱은 외부 테스트 모드이며 배포 도메인 설정·운영 공개는 별도다. 이 확인에는 사전조사 저장이나 전체 업무 API의 실서비스 검증은 포함하지 않는다.

# 팀 개발 지침

- 상태: 활동 3 검토안. 개인의 수정 판단과 실제 확인 결과를 기록했으며 전원 검토·승인은 별도다.
- 응답과 문서는 한국어로 쓴다. 계획, 실제 실행 결과, 사람의 확인을 구분한다.

## 저장소와 작업 위치

- [문서 저장소](https://github.com/TungTungBall/tungtungball): 요구사항·기술 결정·팀 규칙·개인 기록. 애플리케이션 코드는 넣지 않는다.
- [실행 저장소](https://github.com/TungTungBall/tungtungball-dev): `healthmith-frontend/`와 `healthmith-backend/`. 명령은 아래에 적힌 프로젝트 폴더에서 실행한다.
- 두 저장소가 같은 부모 폴더에 있다는 가정으로 경로를 만들지 않는다. `git remote -v`로 대상 저장소를 확인한다.
- 이 파일과 역할별 규칙 5개는 두 저장소에 같은 내용으로 둔다. 수정할 때 두 사본을 함께 확인한다. 다른 저장소의 파일은 자동으로 로드되지 않는다.

## 먼저 확인할 것

1. `git status --short`, `git branch --show-current`와 해당 경로의 `AGENTS.md`를 읽고 다른 사람의 변경을 보존한다.
2. 해당 저장소 README와 [PRD](https://github.com/TungTungBall/tungtungball/blob/main/docs/PRD.md), [초기화 계획](https://github.com/TungTungBall/tungtungball/blob/main/docs/SETUP-PLAN.md)을 읽는다. 문서 저장소에서 작업 중이면 로컬 파일을 먼저 읽는다.
3. 이슈의 담당자 1명, 대상 파일, 완료 조건과 검증 방법을 확인한다. 맡은 역할과 수정 영역을 먼저 정한다.
4. 브랜치·커밋·PR·리뷰·병합은 [팀 작업 규칙](https://github.com/TungTungBall/tungtungball/blob/main/docs/team/working-agreement.md)을 따른다. main에 직접 커밋하지 않는다.

## 확인된 실행 방법

2026-10-27 실행 저장소 `b030df9`의 파일과 기록을 기준으로 한다. 작업 시 현재 파일·설정이 달라졌는지도 확인한다.

| 실행 위치 | 명령 | 동작·주의 |
| --- | --- | --- |
| 실행 저장소의 `healthmith-frontend/` | `pnpm install --frozen-lockfile` | 기존 의존성 복원. 학생이 요구 버전을 맞춘 뒤 직접 실행하며 잠금 파일을 갱신하지 않는다 |
| 같은 폴더 | `pnpm dev` | 개발 화면, 포트 3000 |
| 같은 폴더 | `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` | 각각 린트·타입·단위 검사. 단위 테스트 2개가 있다 |
| 같은 폴더 | `pnpm build`, 이후 `pnpm start` | 프로덕션 빌드·실행, 포트 3000 |
| 같은 폴더 | `pnpm build`, 이후 `pnpm test:e2e` | Playwright가 프로덕션 서버를 자동 실행한다. Chromium 설치가 필요하며 3000의 기존 서버를 재사용하지 않는다 |
| 실행 저장소의 `healthmith-backend/` | `./gradlew bootRun` | JDK 21, 기본 포트 8080. `GET /health`는 인증 없이 HTTP 200과 JSON `status: UP`을 반환한다 |
| 같은 폴더 | `./gradlew test` | 컨텍스트·health 스모크 테스트 총 2개 |
| 같은 폴더 | `./gradlew test --tests 'tungtungball.healthmithbackend.HealthSmokeTest'` | 실제 서버를 임의 포트로 띄우는 스모크 테스트 1개 |
| 각 저장소 루트 | `git diff --check` | 문서 공백 검사. 새 파일은 스테이징 전 검사 범위에서 빠지므로 별도 확인한다 |

- 프론트엔드 요구 버전은 Node.js `24.x`, pnpm `11.25.0`이다. `.node-version`은 `24.20.0`이다. JDK toolchain은 21, Gradle은 저장소 wrapper를 쓴다.
- Windows 백엔드 명령은 `./gradlew` 대신 `.\gradlew.bat`를 쓴다. 실행하지 않은 OS의 결과를 통과로 기록하지 않는다.
- 프론트 CI의 린트·타입·단위·빌드·E2E 성공과 Mac 백엔드 테스트 성공은 확인됐다. 이 결과로 팀원 5명의 직접 실행을 대신하지 않는다.
- 현재 CI 설정은 프론트엔드만 대상으로 한다. 백엔드 CI나 저장소의 필수 검사 유무는 GitHub에서 따로 확인한다.
- 의존성 복원·Chromium 준비와 최초 프로젝트 생성은 구분한다. 설치·초기화는 수업 안내대로 학생이 공식 문서를 보고 직접 진행하며, 이미 만든 프로젝트에 생성기를 다시 실행하지 않는다.

## 요구사항을 읽는 기준

- 첫 데모·8주 MVP의 포함과 제외: [MVP 범위](https://github.com/TungTungBall/tungtungball/blob/main/docs/decisions/mvp-scope.md).
- US·F, 정상·실패·권한·취소·LLM 조건: [백로그](https://github.com/TungTungBall/tungtungball/blob/main/docs/requirements/backlog.md)의 해당 US와 미확정 절.
- 첫 데모 흐름·상태: [사용자 흐름](https://github.com/TungTungBall/tungtungball/blob/main/docs/requirements/user-flows.md).
- 기술 결정: [STACK.md](https://github.com/TungTungBall/tungtungball/blob/main/docs/STACK.md). Next.js 화면과 Spring WebFlux 업무 API를 분리한다. 선택한 기술과 실제 구현 범위를 구분한다.
- 상태·LLM 기본 양식이 비어 있으면 [PRD의 문서 기준](https://github.com/TungTungBall/tungtungball/blob/main/docs/PRD.md#문서를-읽는-순서와-기준)에 따라 작성된 백로그·사용자 흐름을 함께 확인한다.

문서가 충돌하면 파일·절, 차이, 영향받는 US를 기록한다. 답이 필요한 작업만 보류하고 독립적인 작업을 계속한다. 번호·상태·수치·담당자·합의를 만들어 빈칸을 채우지 않는다.

## 바꾸기 전에 확인할 경계

- 인수 조건은 사람이 작성·확인한다. AI가 문장·체크 표시를 대신 바꾸지 않는다. 수정 요청에는 현재 조건·미확정·근거를 읽고 사람이 결정할 질문을 정리한다.
- MVP·기술 스택을 임의로 바꾸지 않는다. 제출한 제안서는 수정하지 않고 차이를 기록한다.
- LLM은 초안·안내·요약을 맡는다. 커리큘럼 확정·게임 시작은 사용자 확인, 횟수·단계 판정은 규칙을 따른다.
- LLM 전송 금지는 해당 US, 서버 전송·저장 범위는 STACK.md 4절을 각각 확인한다. 서로 다른 금지 범위를 하나로 합치거나 확대하지 않는다.
- 비밀 값·개인 경로는 공유하지 않는다. 환경변수는 이름과 공개 가능한 기본 동작만 기록한다. 개인 지침·로컬 권한 설정은 커밋하지 않는다.
- 현재 health 연결은 Next.js 서버가 Spring 서버에 요청한다. JWT·Supabase·Gemini·브라우저 API 호출·CORS까지 구현됐다고 가정하지 않는다.
- 계획 밖의 파일·명령, 다른 역할의 영역이나 공유 설정이 필요하면 이유와 범위를 알린다. 승인된 작업을 임의로 넓히지 않는다.

## 역할별 규칙

두 저장소에서 공통 경계를 읽을 수 있도록 경로 제한 없이 다섯 파일을 로드한다. 맡은 역할의 절차를 적용하며, 코드 경로는 실행 저장소를 기준으로 한다.

- [공유 기반](.claude/rules/shared.md): 의존성·설정·실행 방법.
- [서버](.claude/rules/server.md): WebFlux 서버와 권한·LLM·데이터 경계.
- [화면](.claude/rules/frontend.md): Next.js 화면과 사용자 확인.
- [테스트·실행](.claude/rules/testing.md): 실제 검사와 근거.
- [문서·정리](.claude/rules/docs.md): 문서 기준과 기록 취합.

## 완료 보고

수정 파일, 실행한 명령과 실제 결과, 실패·미실행과 이유를 남긴다. [완료 기준](https://github.com/TungTungBall/tungtungball/blob/main/docs/team/definition-of-done.md)에 따라 수정·검증·병합 완료를 구분한다. 커밋·push·PR·병합은 사용자가 요청한 범위와 팀 규칙 안에서 수행한다. 팀원의 검토·승인·기기 실행을 대신 완료로 기록하지 않는다.

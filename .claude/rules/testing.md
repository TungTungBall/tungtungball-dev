# 테스트·실행

테스트·실행을 맡았을 때 적용한다. 경로는 실행 저장소 기준이다.

- 프론트 테스트는 `healthmith-frontend/tests/unit/`, `tests/e2e/`와 `vitest.config.mts`, `playwright.config.ts`다. 백엔드는 `healthmith-backend/src/test/java/`와 기존 Gradle test 태스크를 쓴다.
- 프론트에서 `pnpm test:unit`은 단위 2개, `pnpm build` 후 `pnpm test:e2e`는 기본 화면의 Chromium 데스크톱·모바일 2개를 실행한다. E2E는 3000을 점유하고 프로덕션 서버를 직접 시작·종료한다.
- Chromium 준비는 `pnpm exec playwright install chromium`이다. 설치 여부를 확인하고 수업의 학생 직접 설치 절차를 따른다. 브라우저가 없으면 원인과 미실행을 기록한다.
- 백엔드에서 `./gradlew test`는 컨텍스트와 health 스모크 총 2개다. 단독 smoke 명령은 `./gradlew test --tests 'tungtungball.healthmithbackend.HealthSmokeTest'`다. 실제 서버·보안 필터·HTTP 응답을 검사하며 임의 포트를 사용한다.
- 활동 2 범위와 기능별 검증을 구분한다. 공유 패키지·테스트 설정 변경은 공유 기반 담당에게 요청한다.
- 제품 검사는 기존 인수 조건을 입력·기대 결과로 사용한다. 모호한 조건은 해당 US·영향·질문을 기록한다. 통과시키려고 문장·체크 표시를 바꾸지 않는다.
- 정상·실패·권한, 해당하는 취소·반려·LLM 조건을 확인한다. 미실행·설정 없음·실행 실패·검증 완료를 구분하고 실제 명령과 결과를 남긴다.
- 완료 신호 주입, 실제 카메라 인식, 가짜 LLM 응답, 실제 LLM 품질은 별개다. 테스트 데이터·타임아웃을 실사용 정책으로 확정하지 않는다.
- CI는 `.github/workflows/frontend.yml`의 실제 검사와 GitHub 결과를 확인한다. 현재 백엔드 CI는 없다. 이전 커밋의 성공을 최신 전체 저장소의 CI 성공이라고 적지 않는다.
- 팀원 5명의 결과는 각자의 실제 기록을 받는다. 이 컴퓨터·Windows 기록·Linux CI로 다른 사람의 Mac 실행을 대신하지 않는다.
- 문서는 링크·표·US/F·범위·`git diff --check`를 확인한다. 새 파일도 검사 범위에 넣는다. 새 Claude 세션의 응답 확인은 앱 테스트·권한 차단 보장과 구분한다.

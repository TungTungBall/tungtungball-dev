# 화면

화면을 맡았을 때 적용한다. 경로는 실행 저장소 기준이다.

- 구현 영역은 `healthmith-frontend/src/app/`, `src/components/`, `src/lib/`다. 그 폴더의 `AGENTS.md`와 설치된 Next.js의 해당 공식 가이드를 먼저 읽는다.
- 개발 실행은 `healthmith-frontend/`의 `pnpm dev`이며 기본 포트는 3000이다. `src/app/page.tsx`는 시작 화면, `src/app/backend-connection/`은 health 연결 확인 화면이다.
- 활동 2에서는 기본 화면·연결 확인만 다룬다. 실제 사전조사·게임·설문은 승인된 기능 이슈가 있을 때 구현한다.
- 의존성·lockfile·공통 설정·README 공통 절은 공유 기반 담당에게 파일·이유·영향을 전달한다. 알리는 것만으로 변경 승인을 받았다고 해석하지 않는다.
- 기능 화면은 [사용자 흐름](https://github.com/TungTungBall/tungtungball/blob/main/docs/requirements/user-flows.md), [백로그](https://github.com/TungTungBall/tungtungball/blob/main/docs/requirements/backlog.md), [MVP](https://github.com/TungTungBall/tungtungball/blob/main/docs/decisions/mvp-scope.md)를 함께 읽는다. 첫 데모·8주 범위를 섞지 않는다.
- 신체 제약 부위, 운동 부위 우선순위, 운동 후 통증 부위는 다른 입력이다. 원문의 선택지·검사·전송 범위를 따른다.
- 생성 중·실패·초안·확정·게임 진행 상태를 구분한다. 생성 응답만으로 사용자 확정이나 게임 시작을 처리하지 않는다. 구체적인 확정 조건은 US-03을 확인한다.
- health 화면은 Next.js 서버가 `BACKEND_API_URL` 또는 로컬 기본 주소로 요청한다. 서버 키·주소 설정을 브라우저 코드로 옮기지 않는다. 이 요청의 성공을 브라우저 CORS·JWT 연동 성공으로 기록하지 않는다.
- 결과에는 실제 화면·입력·기기 조건을 남긴다. 데스크톱·Chromium 모바일 에뮬레이션·실제 휴대폰·카메라 확인을 구분한다.

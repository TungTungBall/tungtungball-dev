# 공유 기반

공유 기반을 맡았을 때 적용한다. 경로는 실행 저장소 기준이다.

- 근거는 문서 저장소의 [PRD](https://github.com/TungTungBall/tungtungball/blob/main/docs/PRD.md), [STACK](https://github.com/TungTungBall/tungtungball/blob/main/docs/STACK.md), [초기화 계획](https://github.com/TungTungBall/tungtungball/blob/main/docs/SETUP-PLAN.md)이다. 승인된 계획에 실제 경로·명령·근거를 보완한다.
- 프론트 설정·의존성은 `healthmith-frontend/`의 `package.json`, `pnpm-lock.yaml`, 각 도구 설정에 있다. 백엔드는 `healthmith-backend/build.gradle`과 Gradle wrapper를 사용한다. 루트에 별도 Node 프로젝트·lockfile을 만들지 않는다.
- 루트 설정·의존성·잠금 파일·ignore·README 공통 실행 절은 공유 기반 영역이다. 다른 역할의 요청은 파일·이유·영향을 확인한다. 승인한 범위에 없는 패키지·전역 도구를 추가하지 않는다.
- 설치·최초 초기화는 학생이 공식 문서를 보고 직접 한다. 이미 있는 앱을 다시 생성하지 않는다. AI는 공식 주소·절, 요구 버전, 실행 위치·성공 기준을 정리한다.
- 기존 프론트 의존성 복원은 `pnpm install --frozen-lockfile`로 안내한다. 잠금 불일치가 나면 파일을 삭제·갱신하지 말고 원인과 담당자를 확인한다.
- 프론트는 Node 24.x·pnpm 11.25.0, 백엔드는 JDK 21과 wrapper를 쓴다. 최신 버전 조회 결과를 이유로 선택 버전·lockfile을 자동 갱신하지 않는다.
- 프론트 기본 포트는 3000, 백엔드는 8080이다. 5000은 쓰지 않는다. 포트가 사용 중이면 다른 사람의 프로세스를 종료하지 말고 소유자와 대안을 확인한다.
- `BACKEND_API_URL`은 Next.js 서버 전용이다. 이름·기본 동작은 기록하되 비밀 값을 넣거나 `NEXT_PUBLIC_` 변수로 바꾸지 않는다. 현재 health 호출은 서버 간 요청이라 브라우저 CORS 검증과 구분한다.
- Gemini·Supabase·JWT·배포 설정은 현재 health 뼈대에 없다. 변수 이름·인증 계약을 추측해 추가하지 않는다. 실제 서비스 작업의 별도 근거와 담당 범위부터 확인한다.
- 환경 변경 후 실제 명령·오류·OS·칩과 결과를 남긴다. 기존 파일의 존재, 이 컴퓨터의 실행, 팀원 각자의 실행을 구분한다. 확인된 실행 방법과 두 저장소의 지침을 함께 갱신한다.

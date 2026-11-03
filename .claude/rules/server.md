# 서버

서버를 맡았을 때 적용한다. 경로는 실행 저장소 기준이다.

- 구현 영역은 `healthmith-backend/src/main/java/tungtungball/healthmithbackend/`와 `src/main/resources/`다. 설정·의존성 변경은 공유 기반 담당과 범위를 확인한다.
- `./gradlew bootRun`으로 실행하며 기본 포트는 8080이다. 현재 상태 확인 계약은 인증 없는 `GET /health` → HTTP 200, JSON `status: UP`이다. `HealthController`와 `SecurityConfig`를 함께 확인한다.
- 활동 2는 시작점·health 뼈대까지다. 승인된 별도 작업 없이 로그인·DB·실제 운동 기능을 추가하지 않는다. 현재 HTTP Basic 설정을 제품의 Supabase JWT 구현으로 취급하지 않는다.
- 루트·프론트·다른 담당자의 테스트를 함께 고치지 않는다. 추가 패키지는 이름·이유·영향 파일을 공유 기반 담당에게 전달한다.
- 기능 구현 전 [백로그](https://github.com/TungTungBall/tungtungball/blob/main/docs/requirements/backlog.md)의 해당 US·미확정을 읽는다. 요청자·데이터 소유자, 입력 오류·중복·지연 요청은 기존 인수 조건을 따른다.
- 업무 API·LLM 호출·DTO 검증은 [STACK](https://github.com/TungTungBall/tungtungball/blob/main/docs/STACK.md)의 WebFlux 경계를 따른다. 요청 처리 경로에 `block()`이나 블로킹 I/O를 넣지 않는다. 카메라·횟수 판정을 백엔드나 LLM으로 옮기지 않는다.
- 신체 제약·통증 부위 값의 LLM 전송 금지와 서버 저장 범위를 구분한다. 해당 US의 LLM 조건과 STACK 4절을 각각 확인한다.
- DB 테이블·API·DTO·JWT issuer·키·RLS는 근거 없이 확정하지 않는다. 공유된 기술 선택이 해당 기능의 설치·연결 완료를 뜻하지 않는다.
- 변경에 맞는 `./gradlew test` 결과와 실제 HTTP 응답을 남긴다. 생성한 코드·가짜 외부 응답·실제 외부 연동을 구분한다.

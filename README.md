# tungtungball-dev 

## 프론트엔드

프론트엔드 소스와 의존성은 `healthmith-frontend/`에서 관리합니다.
설치·실행·검사 방법은 [프론트엔드 README](healthmith-frontend/README.md),
공식 문서와 실제 명령 실행 결과는 [초기화 기록](healthmith-frontend/docs/setup-log.md)을 참고하세요.

백엔드는 `healthmith-backend/`에서 별도 팀이 관리합니다.

## 백엔드 스모크 테스트

실제 서버의 `GET /health`가 인증 없이 HTTP 200과 `{"status":"UP"}`을 반환하는지 검사합니다.
JDK 21 기준 실행 방법과 검사 범위는 [백엔드 README](healthmith-backend/README.md#스모크-테스트)를 참고하세요.

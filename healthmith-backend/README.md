# 헬스미스 백엔드

## 스모크 테스트

실제 Spring Boot 서버를 띄워 인증 정보 없이 `GET /health`를 호출한다.
HTTP 200, JSON 응답, `status` 값 `UP`을 모두 확인하면 통과한다.
컨트롤러나 보안 설정을 테스트용으로 바꾸지 않는다.

프로젝트의 Java toolchain은 JDK 21이다. 아래 명령은 `JAVA_HOME`을 JDK 21로 맞춰 검증했다.
Gradle은 저장소의 wrapper를 사용한다. 최초 실행에는 Gradle과 기존 의존성을 내려받을 네트워크 연결이 필요하다.
별도 패키지 설치나 프론트엔드 실행은 필요 없다.

저장소 루트에서 다음 명령을 실행한다.

macOS·Linux:

```sh
cd healthmith-backend
./gradlew test --tests 'tungtungball.healthmithbackend.HealthSmokeTest'
```

Windows PowerShell:

```powershell
cd healthmith-backend
.\gradlew.bat test --tests "tungtungball.healthmithbackend.HealthSmokeTest"
```

테스트가 사용 가능한 포트를 자동으로 배정하고 서버도 종료한다.
8080에서 개발 서버가 실행 중이어도 별도로 검사할 수 있다.
실패했을 때는 `build/reports/tests/test/index.html`에서 요청·응답과 실패한 검사를 확인한다.
같은 입력으로 강제로 다시 실행하려면 명령 끝에 `--rerun-tasks`를 붙인다.

전체 백엔드 테스트는 같은 폴더에서 `./gradlew test`로 실행한다.
스모크 테스트의 범위는 백엔드 기동·라우팅·보안 필터를 거친 health 응답이다.
브라우저 화면이나 프론트엔드와의 연결 성공까지 확인하는 테스트는 아니다.

구현은 [Spring Boot의 실제 서버 테스트 안내](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html#testing.spring-boot-applications.with-running-server)와
[WebTestClient의 서버 연결 방식](https://docs.spring.io/spring-framework/reference/testing/webtestclient.html#webtestclient-server-config)을 따른다.

## 실행 확인

2026-10-27, macOS 15.1.1 arm64에서 JDK 21.0.11과 Gradle wrapper 9.8.2로 확인했다.
아래 명령은 `healthmith-backend/`에서 실행했다.

| 명령 | 결과 |
| --- | --- |
| `./gradlew test --tests 'tungtungball.healthmithbackend.HealthSmokeTest' --no-daemon --console=plain` | 스모크 테스트 1개 통과 |
| `./gradlew test --no-daemon --console=plain` | 기존 컨텍스트 테스트와 스모크 테스트, 총 2개 통과 |

처음 `--offline`으로 실행했을 때는 기존 의존성의 캐시가 없어 빌드에 실패했다.
일반 실행에서 `build.gradle`에 선언된 의존성을 받은 뒤 위 두 검사를 통과했다.
의존성 선언은 변경하지 않았다. Windows와 팀원별 기기의 실행은 아직 확인하지 않았다.

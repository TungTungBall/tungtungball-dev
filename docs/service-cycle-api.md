# 개인화 운동 사이클 API

모든 호출은 검증된 사용자 JWT가 필요하다. 쓰기에는 UUID `Idempotency-Key`가 필수다. 성공 응답을 잃으면 같은 본문·키로 재시도한다. 다른 본문으로 키를 재사용하면 409다. 사용자는 요청 본문으로 바꿀 수 없다.

## 사전조사

`/api/v2/survey-submissions`의 POST, `/{id}`의 GET/PATCH, `/latest`의 GET을 사용한다. PATCH는 `expected_version`을 보낸다. `answers`는 아래 7개 필드만 받는다.

```json
{
  "goal": "habit",
  "experience": "beginner",
  "available_minutes": 20,
  "days_per_week": 3,
  "limitations_present": false,
  "limitations": [],
  "priority_body_parts": ["arms", "core"]
}
```

- goal: fitness / strength / weight_management / habit
- experience: beginner / occasional / regular
- available_minutes: 10 / 20 / 30 / 45 / 60
- days_per_week: 1~7
- limitations: `{part,side,severity}`. part는 neck / shoulder / elbow / wrist / lower_back / hip / knee / ankle. neck·lower_back의 side는 center, 나머지는 left/right/both. severity는 mild/moderate/severe.
- priority_body_parts: arms / legs / core / shoulder / chest / neck. 제한 부위와 다른 열거형이다.

## 사이클 명령

`POST /api/v2/cycle/{operation}?id={대상 UUID}`. generate에는 id가 없다.

| operation | 본문 | 결과 |
| --- | --- | --- |
| generate | survey_id, survey_version, condition(recommended/light/normal/hard) | 요청 id·상태·서버 plan |
| start | confirmed:true | 새 세션. succeeded이고 사전조사 버전이 같아야 함 |
| repetition | version | 현재 단계 1회 증가. 멱등·450ms 간격·휴식 검증 |
| tracking-lost | version | 횟수·단계는 그대로, 판정 누락 표시 |
| pause / resume | version | 상태만 전환, 반복 간 활동 시간 계측 초기화 |
| rest | version, seconds(0~1800) | 0은 건너뛰기. 휴식 시작 이후 총 30분이 상한 |
| stop | version, reason(pain/tracking/voluntary) | 기록 저장·보석 판정, 설문 skipped |
| feedback | version, skip, effort, duration_feedback, satisfaction, comment, keywords | 완료 세션만 제출 또는 건너뛰기 |

feedback의 모든 키는 보내고 미응답은 null, comment는 빈 문자열, keywords는 빈 배열로 보낸다. effort=light/normal/hard, duration_feedback=short/normal/long, satisfaction=1~5다. 의견은 최대 500자다. 제출 후 수정은 지원하지 않는다. skip이면 전달된 설문 값은 저장하지 않는다.

`POST /api/v2/cycle/keywords/preview`는 `{comment}`를 받아 `{keywords,pain,dictionary_version}`을 돌려준다. 데이터 저장과 LLM 호출을 하지 않는다. 화면에서 확인한 키워드만 feedback에 넣는다. 기본 칩: other_area / same_exercise / variety / more_rest / less_rest. 부위 선호: prefer_ 또는 avoid_ 뒤에 우선 부위 코드. more_rest·less_rest 동시 제출은 거절한다.

## 조회

- GET `/api/v2/cycle/request?id=…`
- GET `/api/v2/cycle/session?id=…`
- GET `/api/v2/cycle/active`
- GET `/api/v2/cycle/latest-request`
- GET `/api/v2/cycle/records`
- GET `/api/v2/cycle/profile/summary`

본인 데이터만 조회한다. 조회 대상이 없으면 null, 기록 목록은 빈 배열이다. 프로필은 계산 버전·표본 수·기간·갱신 시각·축별 값과 상태를 제공한다. 기록 3회 미만의 상태는 collecting이다.

## worker

기존 `GENERATION_WORKER_*` 설정을 사용한다. v1 큐 처리 후 cycle_poll로 새 요청을 하나 가져온다. 서버 계획의 운동 ID·횟수·5단계를 그대로 반환하도록 Gemini에 요청한다. worker와 DB 모두 결과를 확인하고, 임대 토큰과 만료 시간을 검사한 뒤에만 succeeded로 바꾼다. 실패나 시간 초과를 합성 루틴으로 대체하지 않는다.

테스트 전용 생성 응답은 `tests/fixtures/workout-stack.mjs`의 로컬 서버에만 있다. 제품 API에 테스트 완료나 수동 횟수 채우기 기능을 추가하지 않았다. 실제 배포에서는 worker를 활성화하고 정상 생성 상태를 확인해야 한다.

## 이전 버전과의 관계

v1 API·DB 기록·진행 중 세션은 보존한다. 새 사이클의 request/session은 별도 테이블이다. 운동 주소의 `sessionId`는 기존 데이터, `cycleId`는 새 데이터다. 프론트의 홈에서는 새 흐름만 시작하고, 기록 화면에 이전 기록으로 가는 링크를 둔다. 새 프로필 계산은 새 사이클 기록만 대상으로 하며 옛 항목을 새 설문으로 임의 변환하지 않는다.

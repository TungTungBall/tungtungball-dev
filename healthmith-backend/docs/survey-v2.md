> 2026-11-23 개편: 아래는 앞선 저장/연결 작업의 기록이다. 최신 입력·생성·설문 계약은 저장소의 `docs/service-cycle-api.md`, 구현과 검증 결과는 `docs/reports/2026-11-23-service-cycle.md`를 따른다. 현재 수준과 저장 강도는 새 입력에서 제거했다.

# 상세 사전조사 저장 API

2026-11-23 구현. 기존 `/api/survey-submissions`와 v1 데이터는 그대로 둔다. 새 사전조사는 `/api/v2/survey-submissions`와 `survey_submissions_v2`에 저장한다. 아래는 이 변경의 구현 계약이며 기존 PRD 전체를 바꾸는 문서는 아니다.

## 범위와 적용

- 경험·현재 수준·일정·8개 제한 부위의 위치와 정도·선택 선호도를 저장, 조회, 수정한다.
- 기본 R2DBC 저장 모드에서 제공한다. 레거시 `postgrest` 모드에서는 v2 컨트롤러가 등록되지 않는다.
- `supabase/migrations/20261123000000_add_detailed_survey_v2.sql` 적용 후 서버와 프론트를 배포해야 한다. 애플리케이션이 운영 DB에 자동 적용하지 않는다. 기존 행을 v2로 변환하거나 기존 필드에 임의 기본값을 채우지 않는다.
- v2 값은 기존 생성 API로 보내지 않는다. 새 제한 조건의 후보 필터·추천 결과 검증이 연결되기 전까지 루틴 생성 준비 완료로 표시하지 않는다. 설문·운동 카탈로그 확장은 별도 작업이다.

## 요청

모든 경로에 사용자 Bearer JWT가 필요하다. 소유자는 검증된 JWT와 DB의 `auth.uid()`에서 결정하며 요청 본문으로 받지 않는다.

| 메서드·경로 | 동작 |
| --- | --- |
| `POST /api/v2/survey-submissions` | 신규 저장. `Idempotency-Key` UUID 필수, 본문 `answers`, 성공 201 |
| `GET /api/v2/survey-submissions/{id}` | 본인 행 조회, 성공 200 |
| `GET /api/v2/survey-submissions/latest` | 본인의 가장 최근 생성 행 조회. 수정 시간 순이 아니며 동률은 id 순. 없으면 404 |
| `PATCH /api/v2/survey-submissions/{id}` | 전체 answers 교체. `Idempotency-Key`와 `expected_version` 필수, 성공 200 |

```json
{
  "answers": {
    "goal": "fitness",
    "experience": "occasional",
    "current_level": "light_routine",
    "available_minutes": 20,
    "days_per_week": 3,
    "limitations_present": true,
    "limitations": [{"part": "wrist", "side": "left", "severity": "moderate"}],
    "preferred_intensity": null,
    "priority_body_parts": ["wrist"]
  }
}
```

PATCH 본문은 위 객체에 `"expected_version": 1`을 추가한다. 숫자 문자열·소수·누락 필드·알 수 없는 필드를 거절한다. 선택 강도 미응답은 필드를 생략하지 않고 null, 우선 부위 미응답은 빈 배열로 보낸다.

| 필드 | 허용 값 |
| --- | --- |
| goal | fitness(체력), strength(근력), weight_management(체중 관리), habit(운동 습관) |
| experience | never(처음), occasional(가끔), regular(꾸준히) |
| current_level | beginner(기초), light_routine(가벼운 루틴), multiple_sets(여러 세트) |
| available_minutes | 10, 20, 30, 45, 60 |
| days_per_week | 정수 1~7 |
| limitations_present | true/false. false면 limitations는 빈 배열, true면 최소 한 항목 |
| limitations[].part / priority_body_parts[] | neck, shoulder, elbow, wrist, lower_back, hip, knee, ankle. 중복 불가 |
| limitations[].side | 목·허리는 center, 나머지는 left/right/both |
| limitations[].severity | mild/moderate/severe. 사용자의 불편 정도이며 진단이나 운동 허용 판정이 아님 |
| preferred_intensity | light/moderate/vigorous 또는 null |

제한 부위와 우선 부위의 겹침은 그대로 보존한다. 이 저장 API가 운동 가능 여부를 판정하거나 대체 운동을 추천하는 것은 아니다.

## 응답·충돌·재시도

성공 응답은 `id`, `schema_version: 2`, `answers`, `version`, `created_at`만 반환한다. 최초 version은 1, 성공한 신규 수정마다 1 증가한다. 생성 상태나 사용자 ID는 포함하지 않는다.

- 같은 사용자·같은 키·같은 요청은 최초 응답을 다시 반환한다. 생성 중복과 수정 버전의 중복 증가를 막는다. 같은 키로 다른 본문이나 작업을 보내면 409 `IDEMPOTENCY_CONFLICT`다.
- PATCH의 expected_version이 현재 버전과 다르면 409 `VERSION_CONFLICT`다. 같은 버전에 대한 동시 수정은 하나만 반영한다.
- 다른 사용자 행·없는 행은 모두 404 `RESOURCE_NOT_FOUND`다. 미인증은 401, 입력 오류는 400이다. 내부 DB 상세 오류·입력은 응답에 노출하지 않는다.
- 테이블은 본인 SELECT만 허용한다. 직접 INSERT/UPDATE 권한은 없고 검증·소유권·잠금 처리를 하는 제한된 함수로만 저장한다.
- 영수증은 자동 만료시키지 않는다. 재시도 보장 기간과 삭제 정책은 후속 결정이 필요하다.

## 프론트 연결

`/survey`에서 새 조사 작성·저장을 제공한다. 저장 후 주소는 `/survey?id=<id>`가 되며 새로고침하면 서버에서 본인 데이터를 다시 읽는다. ‘입력 대신 최신 저장본 불러오기’로 저장본을 불러올 수 있다. 수정 시 버전을 전달한다.

브라우저에서 백엔드 토큰을 관리하지 않고 기존 Next.js 서버 세션을 사용한다. 응답 유실 시 화면 입력과 같은 멱등 키를 유지하고 재확인할 때까지 편집을 막는다. 키·입력은 화면 메모리에만 있으므로 이 상태에서 새로고침·탭 종료를 하면 재시도 정보는 사라진다. 이때 새로 제출하기 전에 최근 저장본으로 결과를 확인한다.

`/survey/legacy`의 v1 저장·수정·생성 경로는 유지한다. v2를 v1으로 자동 축약하지 않는다. 실제 Google 로그인·운영 Supabase·Gemini 검증은 격리 DB와 임시 인증 통합 검사로 대신하지 않는다.

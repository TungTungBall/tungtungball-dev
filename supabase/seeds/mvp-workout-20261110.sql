-- MVP 생성 데이터: 운동 목록 3종과 생성·시작 정책 (2026-11-10, 테크 리드 정현태)
-- 사용자에게 전달받은 중간 미팅용 MVP 값. 운영 확정값이 아니며 팀 검토 후 변경할 수 있다.
-- 자동 migration이 아니다. DB 관리자가 별도로 실행하며 재실행은 같은 ID/정책을 덮어쓴다.
begin;

insert into public.exercise_catalog (id, name, body_parts, internal_focus_instruction, enabled) values
  ('squat', '스쿼트', '["하체"]',
   '엉덩이를 뒤로 빼며 앉고, 일어설 때 허벅지 앞쪽과 엉덩이에 힘이 들어가는 것을 느껴 보세요.', true),
  ('push_up', '푸시업', '["상체"]',
   '몸을 일자로 유지한 채 내려가고, 밀어 올릴 때 가슴과 팔 뒤쪽에 힘이 들어가는 것을 느껴 보세요.', true),
  ('lunge', '런지', '["하체"]',
   '상체를 곧게 세운 채 앞다리로 내려가고, 올라올 때 앞다리 허벅지와 엉덩이에 힘이 들어가는 것을 느껴 보세요.', true)
on conflict (id) do update
  set name = excluded.name, body_parts = excluded.body_parts,
      internal_focus_instruction = excluded.internal_focus_instruction, enabled = excluded.enabled;

insert into private.runtime_policies (name, value) values ('generation_validation', $json$
{
  "repetition_limits": {
    "squat": {"min": 5, "max": 20},
    "push_up": {"min": 3, "max": 15},
    "lunge": {"min": 4, "max": 16}
  },
  "pace_instructions": [
    "천천히 3초 내려가고 1초 멈춘 뒤 올라오기",
    "2초 내려가고 2초 올라오기",
    "보통 속도로 일정하게"
  ],
  "purpose_mapping": {
    "체력": "전신 체력 향상. 여러 운동을 고르게 섞고 단계가 갈수록 횟수를 조금씩 늘린다.",
    "감량": "칼로리 소모. 보통 속도로 하고 횟수를 범위의 중간 이상으로 잡는다.",
    "근력": "근력 향상. 천천히 하는 속도 안내를 쓰고 횟수는 범위의 낮은 쪽으로 잡는다.",
    "자세": "바른 자세 익히기. 가장 천천히 하는 속도 안내를 쓰고 횟수를 적게 잡아 정확한 동작에 집중한다.",
    "자유 입력": "목적이 정해지지 않은 사용자. 여러 운동을 균형 있게 섞고 횟수는 범위의 중간 정도로 잡는다."
  },
  "curriculum_instruction": "너는 운동 입문자를 위한 맨몸운동 루틴을 만든다. 입력 JSON의 exercises에 있는 운동만 사용한다. 반드시 5단계를 아래 순서와 이름 그대로 만든다: 1 광석 채굴, 2 광석 쪼개기, 3 광석 세척, 4 광석 가공, 5 보석 연마. 각 단계는 stage_index(1~5 정수), stage_name, exercise_id, exercise_name, target_repetitions, pace_instruction, internal_focus_instruction 7개 필드만 가진다. exercise_name과 internal_focus_instruction은 exercises에 있는 값을 한 글자도 바꾸지 말고 그대로 복사한다. target_repetitions는 repetition_limits에서 해당 exercise_id의 min 이상 max 이하 정수다. pace_instruction은 pace_instructions 목록의 문장 중 하나를 그대로 쓴다. purpose의 설명을 따르고, intensity(1~10)가 높을수록 횟수를 범위의 위쪽으로 잡는다. priority_body_parts의 앞쪽 부위를 쓰는 운동을 더 많은 단계에 배치한다(운동 이름으로 부위를 판단한다). 단계가 진행될수록 비슷하거나 조금 더 어렵게 만든다. 다른 설명 없이 JSON만 출력한다.",
  "curriculum_schema": {
    "type": "object",
    "properties": {
      "stages": {
        "type": "array", "minItems": 5, "maxItems": 5,
        "items": {
          "type": "object",
          "properties": {
            "stage_index": {"type": "integer", "minimum": 1, "maximum": 5},
            "stage_name": {"type": "string", "enum": ["광석 채굴", "광석 쪼개기", "광석 세척", "광석 가공", "보석 연마"]},
            "exercise_id": {"type": "string"},
            "exercise_name": {"type": "string"},
            "target_repetitions": {"type": "integer", "minimum": 1},
            "pace_instruction": {"type": "string", "enum": ["천천히 3초 내려가고 1초 멈춘 뒤 올라오기", "2초 내려가고 2초 올라오기", "보통 속도로 일정하게"]},
            "internal_focus_instruction": {"type": "string"}
          },
          "required": ["stage_index", "stage_name", "exercise_id", "exercise_name", "target_repetitions", "pace_instruction", "internal_focus_instruction"],
          "additionalProperties": false
        }
      }
    },
    "required": ["stages"], "additionalProperties": false
  },
  "adjustment_instruction": "previous_curriculum은 사용자가 마친 직전 루틴이다. difficulty(1~5, 5가 가장 힘듦)와 enjoyment(1~5, 5가 가장 재미있음)를 반영해 새 5단계 루틴을 만든다. difficulty가 4 이상이면 횟수를 줄이거나 더 천천히 하는 속도 안내로 바꾸고, 2 이하이면 횟수를 조금 늘린다. enjoyment가 2 이하이면 다른 운동을 섞는다. 그 밖의 규칙은 처음 루틴을 만들 때와 같다.",
  "include_generated_summary": false,
  "summary_instruction": "feedback은 사용자의 운동 후 설문 기록이다(difficulty·enjoyment 1~5). 사용자의 운동 성향을 한국어 한두 문장으로 요약한다. 건강 상태나 신체 부위를 추측해 쓰지 않는다. JSON만 출력한다.",
  "summary_schema": {
    "type": "object", "properties": {"summary": {"type": "string"}},
    "required": ["summary"], "additionalProperties": false
  },
  "max_summary_length": 200
}
$json$::jsonb)
on conflict (name) do update set value = excluded.value;

insert into private.runtime_policies (name, value) values ('workout_start', '{"allow_reuse": true}'::jsonb)
on conflict (name) do update set value = excluded.value;

commit;

-- 가상 시드 (docs/DATA-MODEL.md '가상 시드 데이터' 1~3번)
-- 실제 개인정보가 아니다. 화면 확인과 테스트 입력용이다.
--
-- user_id는 auth.users를 참조하므로, 아래 이메일의 테스트 계정이 있을 때만 행이 들어간다.
-- 계정이 없으면 아무것도 넣지 않는다(오류 없음). 계정은 Supabase 대시보드 Authentication에서 만든다.
--   seed-user-a@example.test : 시드 1·2
--   seed-user-b@example.test : 시드 3
-- 같은 파일을 여러 번 실행해도 중복 행이 생기지 않는다.

insert into public.survey_submissions (id, user_id, answers, generation_request_status, created_at)
select s.id, u.id, s.answers, 'prepared', timestamptz '2026-11-02 05:00:00+00'
from (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 'seed-user-a@example.test',
     '{"physical_limitations": {"present": false, "body_parts": []},
       "purpose": {"type": "체력", "custom_text": null},
       "intensity": 1,
       "priority_body_parts": ["하체", "상체"]}'::jsonb),
    ('10000000-0000-4000-8000-000000000002'::uuid, 'seed-user-a@example.test',
     '{"physical_limitations": {"present": true, "body_parts": ["허리"]},
       "purpose": {"type": "근력", "custom_text": null},
       "intensity": 10,
       "priority_body_parts": ["상체", "하체"]}'::jsonb),
    ('10000000-0000-4000-8000-000000000003'::uuid, 'seed-user-b@example.test',
     '{"physical_limitations": {"present": false, "body_parts": []},
       "purpose": {"type": "자유 입력", "custom_text": "오래 걸을 체력을 기르고 싶다"},
       "intensity": 5,
       "priority_body_parts": ["하체"]}'::jsonb)
) as s (id, email, answers)
join auth.users as u on u.email = s.email
on conflict (id) do nothing;

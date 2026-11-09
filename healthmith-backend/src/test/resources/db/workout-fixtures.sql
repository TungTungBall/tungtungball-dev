-- 통합 검사 전용 가상 운동·정책. 운영 권장 운동이나 운영 수치가 아니다.
TRUNCATE auth.users CASCADE;
INSERT INTO auth.users VALUES ('20000000-0000-4000-8000-000000000001'), ('20000000-0000-4000-8000-000000000002');
INSERT INTO public.exercise_catalog VALUES ('TEST_EX','테스트 운동','["하체"]','테스트 집중 안내',true)
ON CONFLICT(id) DO UPDATE SET enabled=true;
INSERT INTO private.runtime_policies VALUES
('workout_start','{"allow_reuse":false}'),
('generation_validation','{"purpose_mapping":{"체력":"fitness","자유 입력":"fitness"},"repetition_limits":{"TEST_EX":{"min":1,"max":5}},"pace_instructions":["테스트 속도"],"max_summary_length":100,"adjustment_instruction":"test-only","include_generated_summary":true}')
ON CONFLICT(name) DO UPDATE SET value=EXCLUDED.value;

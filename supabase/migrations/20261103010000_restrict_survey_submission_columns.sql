-- PR #23 리뷰 반영: id·created_at은 사용자가 정하지 못하게 한다.
-- 서버는 사용자 JWT로 Data API를 호출하므로 사용자도 같은 권한으로 직접 INSERT할 수 있다.
-- 그래서 두 값은 DB 기본값으로 만들고, 사용자(authenticated)에게는 나머지 컬럼의 INSERT 권한만 준다.
-- 서버도 INSERT할 때 id·created_at을 보내지 않고, Prefer: return=representation으로 저장된 값을 돌려받는다.

alter table public.survey_submissions alter column id set default gen_random_uuid();
alter table public.survey_submissions alter column created_at set default now();

revoke insert on table public.survey_submissions from authenticated;
grant insert (user_id, answers, generation_request_status) on table public.survey_submissions to authenticated;

comment on table public.survey_submissions is 'US-01 사전조사 제출. id·created_at은 DB 기본값, user_id는 JWT 사용자(RLS), prepared는 검사 제약으로 고정한다.';

-- US-01 사전조사 제출 저장 (docs/DATA-MODEL.md, docs/API.md 기준, 실행 이슈 #15)
-- 서버가 모든 입력을 먼저 검사한다. Data API로 직접 들어오는 잘못된 값도 막기 위해 DB에 같은 조건을 한 번 더 둔다.
-- 정하지 않은 정책(계정 삭제 시 처리, 보관 기간, 자유 입력 길이 제한)은 여기서 정하지 않는다.

-- 검사 함수는 Data API에 노출되지 않는 private 스키마에 둔다.
create schema if not exists private;

create or replace function private.is_valid_body_parts(parts jsonb, min_count integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if parts is null or jsonb_typeof(parts) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(parts) < min_count then
    return false;
  end if;
  -- 허용 목록(상체·하체·허리)의 문자열만, 중복 없이
  if exists (
    select 1
    from jsonb_array_elements(parts) as e
    where jsonb_typeof(e) is distinct from 'string'
       or (e #>> '{}') not in ('상체', '하체', '허리')
  ) then
    return false;
  end if;
  return (select count(distinct e) from jsonb_array_elements(parts) as e) = jsonb_array_length(parts);
end;
$$;

create or replace function private.is_valid_survey_answers(answers jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  limitations jsonb;
  purpose jsonb;
  purpose_type text;
  custom_text jsonb;
begin
  -- answers: 정확히 네 필드만
  if answers is null or jsonb_typeof(answers) is distinct from 'object' then
    return false;
  end if;
  if not (answers ?& array['physical_limitations', 'purpose', 'intensity', 'priority_body_parts'])
     or (select count(*) from jsonb_object_keys(answers)) <> 4 then
    return false;
  end if;

  -- physical_limitations: present(boolean)와 body_parts만. 없음이면 빈 배열, 있음이면 1개 이상
  limitations := answers -> 'physical_limitations';
  if jsonb_typeof(limitations) is distinct from 'object'
     or not (limitations ?& array['present', 'body_parts'])
     or (select count(*) from jsonb_object_keys(limitations)) <> 2
     or jsonb_typeof(limitations -> 'present') is distinct from 'boolean' then
    return false;
  end if;
  if (limitations ->> 'present')::boolean then
    if not private.is_valid_body_parts(limitations -> 'body_parts', 1) then
      return false;
    end if;
  else
    if not private.is_valid_body_parts(limitations -> 'body_parts', 0)
       or jsonb_array_length(limitations -> 'body_parts') <> 0 then
      return false;
    end if;
  end if;

  -- purpose: type과 custom_text만. 자유 입력이면 공백뿐이 아닌 문자열, 그 밖에는 JSON null
  purpose := answers -> 'purpose';
  if jsonb_typeof(purpose) is distinct from 'object'
     or not (purpose ?& array['type', 'custom_text'])
     or (select count(*) from jsonb_object_keys(purpose)) <> 2
     or jsonb_typeof(purpose -> 'type') is distinct from 'string' then
    return false;
  end if;
  purpose_type := purpose ->> 'type';
  custom_text := purpose -> 'custom_text';
  if purpose_type not in ('체력', '감량', '근력', '자세', '자유 입력') then
    return false;
  end if;
  if purpose_type = '자유 입력' then
    if jsonb_typeof(custom_text) is distinct from 'string' or (custom_text #>> '{}') !~ '\S' then
      return false;
    end if;
  elsif jsonb_typeof(custom_text) is distinct from 'null' then
    return false;
  end if;

  -- intensity: 1~10 정수. 문자열·소수(5.0 포함)·boolean 거절
  if jsonb_typeof(answers -> 'intensity') is distinct from 'number'
     or (answers ->> 'intensity') !~ '^(10|[1-9])$' then
    return false;
  end if;

  -- priority_body_parts: 1개 이상, 중복 없음, 신체 제약 부위와 겹치지 않음
  if not private.is_valid_body_parts(answers -> 'priority_body_parts', 1) then
    return false;
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(answers -> 'priority_body_parts') as p
    where (limitations -> 'body_parts') ? p
  ) then
    return false;
  end if;

  return true;
end;
$$;

create table public.survey_submissions (
  id uuid primary key,
  -- 계정 삭제 시 처리(연쇄 삭제 등)는 보관·삭제 정책과 함께 정한다. 그 전까지 기본 동작(삭제 막음)이다.
  user_id uuid not null references auth.users (id),
  answers jsonb not null,
  generation_request_status text not null,
  created_at timestamptz not null,
  constraint survey_submissions_answers_valid check (private.is_valid_survey_answers(answers)),
  constraint survey_submissions_status_prepared check (generation_request_status = 'prepared')
);

comment on table public.survey_submissions is 'US-01 사전조사 제출. id·user_id·created_at·prepared는 서버가 정한다.';

create index survey_submissions_user_id_idx on public.survey_submissions (user_id);

-- 권한: 로그인한 사용자(authenticated)만 자기 행을 넣고 읽는다. 수정·삭제 정책은 두지 않는다.
alter table public.survey_submissions enable row level security;

revoke all on table public.survey_submissions from anon, authenticated;
grant select, insert on table public.survey_submissions to authenticated;

grant usage on schema private to authenticated;
revoke execute on function private.is_valid_body_parts(jsonb, integer) from public, anon;
revoke execute on function private.is_valid_survey_answers(jsonb) from public, anon;
grant execute on function private.is_valid_body_parts(jsonb, integer) to authenticated;
grant execute on function private.is_valid_survey_answers(jsonb) to authenticated;

create policy survey_submissions_insert_own
  on public.survey_submissions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy survey_submissions_select_own
  on public.survey_submissions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- US-01 S03 구현 후보. 실제 Supabase 적용·보관 정책·생성 작업 연결은 별도 검토한다.
alter table public.survey_submissions add column generation_claimed_at timestamptz;

-- 성공 영수증만 저장한다. 자동 삭제/만료는 정책 확정 전 도입하지 않는다.
create table private.survey_update_receipts (
  user_id uuid not null references auth.users(id),
  submission_id uuid not null references public.survey_submissions(id),
  request_key uuid not null,
  request_hash bytea not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id, request_key)
);
revoke all on private.survey_update_receipts from public, anon, authenticated;

-- 직접 UPDATE 권한을 열지 않는다. 사용자 JWT의 auth.uid()만 소유자로 사용한다.
create function public.update_survey_submission(
  p_submission_id uuid, p_expected_version bigint, p_answers jsonb, p_idempotency_key uuid
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  current_row public.survey_submissions%rowtype;
  receipt private.survey_update_receipts%rowtype;
  payload_hash bytea;
  reply jsonb;
begin
  if actor is null then
    return jsonb_build_object('outcome', 'UNAUTHORIZED', 'submission', null);
  end if;
  if p_submission_id is null or p_idempotency_key is null or p_expected_version is null
     or p_expected_version < 1 or not private.is_valid_survey_answers(p_answers) then
    return jsonb_build_object('outcome', 'INVALID_INPUT', 'submission', null);
  end if;

  select * into current_row from public.survey_submissions
    where id = p_submission_id and user_id = actor for update;
  if not found then
    return jsonb_build_object('outcome', 'RESOURCE_NOT_FOUND', 'submission', null);
  end if;
  payload_hash := sha256(convert_to(jsonb_build_object(
    'answers', p_answers, 'expected_version', p_expected_version)::text, 'UTF8'));
  select * into receipt from private.survey_update_receipts
    where user_id = actor and submission_id = p_submission_id and request_key = p_idempotency_key;
  if found then
    if receipt.request_hash is distinct from payload_hash then
      return jsonb_build_object('outcome', 'IDEMPOTENCY_CONFLICT', 'submission', null);
    end if;
    -- 새 상태나 생성 잠금을 다시 적용하지 않고 최초 확정 결과를 반환한다.
    return receipt.response;
  end if;
  if current_row.generation_claimed_at is not null then
    return jsonb_build_object('outcome', 'INVALID_STATE', 'submission', null);
  end if;
  if current_row.version <> p_expected_version then
    return jsonb_build_object('outcome', 'VERSION_CONFLICT', 'submission', null);
  end if;

  update public.survey_submissions set answers = p_answers, version = version + 1
    where id = current_row.id returning * into current_row;
  reply := jsonb_build_object('outcome', 'UPDATED', 'submission', jsonb_build_object(
    'id', current_row.id, 'answers', current_row.answers,
    'generation_request_status', current_row.generation_request_status,
    'created_at', current_row.created_at, 'version', current_row.version));
  insert into private.survey_update_receipts(user_id, submission_id, request_key, request_hash, response)
    values (actor, p_submission_id, p_idempotency_key, payload_hash, reply);
  return reply;
end;
$$;
revoke all on function public.update_survey_submission(uuid,bigint,jsonb,uuid) from public, anon;
grant execute on function public.update_survey_submission(uuid,bigint,jsonb,uuid) to authenticated;

-- 향후 생성 작업 접수 함수가 작업 레코드 생성과 같은 트랜잭션에서 호출할 내부 함수.
-- 외부 사용자가 단독 호출해 생성 없이 입력을 잠그지 못하게 한다.
create function private.claim_survey_submission_for_generation(p_submission_id uuid, p_expected_version bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  current_row public.survey_submissions%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHORIZED';
  end if;
  select * into current_row from public.survey_submissions
    where id = p_submission_id and user_id = auth.uid() for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'RESOURCE_NOT_FOUND';
  end if;
  if current_row.generation_claimed_at is not null then
    raise exception using errcode = '55000', message = 'INVALID_STATE';
  end if;
  if p_expected_version is null or current_row.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  update public.survey_submissions set generation_claimed_at = now() where id = current_row.id;
  return jsonb_build_object('id', current_row.id, 'answers', current_row.answers, 'version', current_row.version);
end;
$$;
revoke all on function private.claim_survey_submission_for_generation(uuid,bigint) from public, anon, authenticated;

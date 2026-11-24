-- v1 행·함수·생성 경로는 변경하지 않는다. v2는 아직 생성 입력으로 사용하지 않는다.
create function private.is_valid_survey_v2(a jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; p text; parts text[] := array['neck','shoulder','elbow','wrist','lower_back','hip','knee','ankle'];
begin
  if a is null or jsonb_typeof(a) is distinct from 'object' then return false; end if;
  if not (a ?& array['goal','experience','current_level','available_minutes','days_per_week',
      'limitations_present','limitations','preferred_intensity','priority_body_parts'])
      or (select count(*) from jsonb_object_keys(a)) <> 9 then return false; end if;
  if jsonb_typeof(a->'goal') is distinct from 'string' or a->>'goal' not in ('fitness','strength','weight_management','habit')
      or jsonb_typeof(a->'experience') is distinct from 'string' or a->>'experience' not in ('never','occasional','regular')
      or jsonb_typeof(a->'current_level') is distinct from 'string' or a->>'current_level' not in ('beginner','light_routine','multiple_sets')
      or jsonb_typeof(a->'available_minutes') is distinct from 'number' or (a->>'available_minutes') !~ '^(10|20|30|45|60)$'
      or jsonb_typeof(a->'days_per_week') is distinct from 'number' or (a->>'days_per_week') !~ '^[1-7]$'
      or jsonb_typeof(a->'limitations_present') is distinct from 'boolean'
      or jsonb_typeof(a->'limitations') is distinct from 'array'
      or jsonb_typeof(a->'priority_body_parts') is distinct from 'array' then return false; end if;
  if (a->>'limitations_present')::boolean = (jsonb_array_length(a->'limitations') = 0) then return false; end if;
  for item in select value from jsonb_array_elements(a->'limitations') loop
    if jsonb_typeof(item) is distinct from 'object' then return false; end if;
    if not (item ?& array['part','side','severity']) or (select count(*) from jsonb_object_keys(item)) <> 3
        or jsonb_typeof(item->'part') is distinct from 'string' or not (item->>'part' = any(parts))
        or jsonb_typeof(item->'side') is distinct from 'string'
        or jsonb_typeof(item->'severity') is distinct from 'string' or item->>'severity' not in ('mild','moderate','severe') then return false; end if;
    p := item->>'part';
    if p in ('neck','lower_back') then
      if item->>'side' <> 'center' then return false; end if;
    elsif item->>'side' not in ('left','right','both') then return false;
    end if;
  end loop;
  if (select count(distinct value->>'part') from jsonb_array_elements(a->'limitations')) <> jsonb_array_length(a->'limitations') then return false; end if;
  if a->'preferred_intensity' <> 'null'::jsonb and (jsonb_typeof(a->'preferred_intensity') is distinct from 'string'
      or a->>'preferred_intensity' not in ('light','moderate','vigorous')) then return false; end if;
  if exists (select 1 from jsonb_array_elements(a->'priority_body_parts') e
      where jsonb_typeof(e) is distinct from 'string' or not ((e #>> '{}') = any(parts))) then return false; end if;
  return (select count(distinct e) from jsonb_array_elements(a->'priority_body_parts') e) = jsonb_array_length(a->'priority_body_parts');
end;
$$;
revoke all on function private.is_valid_survey_v2(jsonb) from public, anon;
grant execute on function private.is_valid_survey_v2(jsonb) to authenticated;

create table public.survey_submissions_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  answers jsonb not null check (private.is_valid_survey_v2(answers)),
  version bigint not null default 1 check (version >= 1),
  created_at timestamptz not null default now()
);
create index survey_v2_owner_created on public.survey_submissions_v2(user_id, created_at desc, id desc);
alter table public.survey_submissions_v2 enable row level security;
revoke all on public.survey_submissions_v2 from public, anon, authenticated;
grant select on public.survey_submissions_v2 to authenticated;
create policy survey_v2_select_own on public.survey_submissions_v2 for select to authenticated using (auth.uid() = user_id);

create table private.survey_v2_receipts (
  user_id uuid not null references auth.users(id),
  request_key uuid not null,
  request_payload jsonb not null,
  response jsonb not null,
  primary key(user_id, request_key)
);
revoke all on private.survey_v2_receipts from public, anon, authenticated;

-- 소유자는 JWT에서만 결정한다. 키 잠금 후 행 잠금으로 동시 재시도·수정 충돌을 직렬화한다.
create function public.save_survey_v2(p_id uuid, p_expected_version bigint, p_answers jsonb, p_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); current_row public.survey_submissions_v2%rowtype;
  receipt private.survey_v2_receipts%rowtype; payload jsonb; reply jsonb;
begin
  if actor is null then return jsonb_build_object('outcome','UNAUTHORIZED'); end if;
  if p_key is null or p_expected_version is null or not private.is_valid_survey_v2(p_answers)
      or (p_id is null and p_expected_version <> 0) or (p_id is not null and p_expected_version < 1) then
    return jsonb_build_object('outcome','INVALID_INPUT');
  end if;
  payload := jsonb_build_object('id',p_id,'expected_version',p_expected_version,'answers',p_answers);
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_key::text, 0));
  select * into receipt from private.survey_v2_receipts where user_id = actor and request_key = p_key;
  if found then
    if receipt.request_payload is distinct from payload then return jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT'); end if;
    return receipt.response;
  end if;
  if p_id is null then
    insert into public.survey_submissions_v2(user_id,answers) values(actor,p_answers) returning * into current_row;
  else
    select * into current_row from public.survey_submissions_v2 where id = p_id and user_id = actor for update;
    if not found then return jsonb_build_object('outcome','RESOURCE_NOT_FOUND'); end if;
    if current_row.version <> p_expected_version then return jsonb_build_object('outcome','VERSION_CONFLICT'); end if;
    update public.survey_submissions_v2 set answers = p_answers, version = version + 1 where id = p_id returning * into current_row;
  end if;
  reply := jsonb_build_object('outcome','SAVED','submission',jsonb_build_object('id',current_row.id,
      'schema_version',2,'answers',current_row.answers,'version',current_row.version,'created_at',current_row.created_at));
  insert into private.survey_v2_receipts values(actor,p_key,payload,reply);
  return reply;
end;
$$;
revoke all on function public.save_survey_v2(uuid,bigint,jsonb,uuid) from public, anon;
grant execute on function public.save_survey_v2(uuid,bigint,jsonb,uuid) to authenticated;

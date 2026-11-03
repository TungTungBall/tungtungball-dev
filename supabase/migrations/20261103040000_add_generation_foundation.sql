-- E01/G01/G02/C01 기반. 실제 운동·LLM·안전 정책·worker 배포는 별도 준비한다.
-- 실제 운동은 시드로 확정하지 않는다. 카탈로그/worker가 없으면 생성 접수를 거절한다.
create table public.exercise_catalog (
  id text primary key check (btrim(id) <> ''),
  name text not null check (btrim(name) <> ''),
  body_parts jsonb not null check (private.is_valid_body_parts(body_parts, 1)),
  internal_focus_instruction text not null check (btrim(internal_focus_instruction) <> ''),
  enabled boolean not null default false
);
alter table public.exercise_catalog enable row level security;
revoke all on public.exercise_catalog from public, anon, authenticated;
grant select on public.exercise_catalog to authenticated;
create policy exercise_catalog_read_enabled on public.exercise_catalog for select to authenticated using (enabled);

create table public.curriculum_generation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  survey_submission_id uuid not null references public.survey_submissions(id),
  source_version bigint not null check (source_version > 0),
  kind text not null check (kind in ('initial','regeneration','next')),
  status text not null check (status in ('queued','running','succeeded','failed')),
  curriculum_id uuid,
  error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_result_shape check (
    (status in ('queued','running') and curriculum_id is null and error is null)
    or (status = 'succeeded' and curriculum_id is not null and error is null)
    or (status = 'failed' and curriculum_id is null and jsonb_typeof(error) is not distinct from 'object')
  )
);
create index generation_requests_owner_idx on public.curriculum_generation_requests(user_id);
create unique index generation_one_active_source on public.curriculum_generation_requests(user_id,survey_submission_id,kind)
  where status in ('queued','running');
alter table public.curriculum_generation_requests enable row level security;
revoke all on public.curriculum_generation_requests from public, anon, authenticated;
grant select on public.curriculum_generation_requests to authenticated;
create policy generation_read_own on public.curriculum_generation_requests for select to authenticated
  using (user_id = (select auth.uid()));

create table private.generation_workers (
  id uuid primary key,
  available_until timestamptz not null
);
create table private.generation_inputs (
  request_id uuid primary key references public.curriculum_generation_requests(id),
  input_snapshot jsonb not null,
  exercise_candidates jsonb not null,
  attempts integer not null default 0,
  worker_id uuid references private.generation_workers(id),
  lease_token uuid,
  lease_until timestamptz
);
create table private.initial_generation_keys (
  user_id uuid not null references auth.users(id),
  request_key uuid not null,
  submission_id uuid not null references public.survey_submissions(id),
  request_id uuid not null references public.curriculum_generation_requests(id),
  primary key(user_id,request_key)
);
revoke all on private.generation_workers,private.generation_inputs,private.initial_generation_keys from public,anon,authenticated;

create function private.valid_curriculum_stages(stages jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  stage jsonb;
  idx integer := 0;
  field text;
  names text[] := array['광석 채굴','광석 쪼개기','광석 세척','광석 가공','보석 연마'];
begin
  if stages is null or jsonb_typeof(stages) is distinct from 'array' or jsonb_array_length(stages) <> 5 then
    return false;
  end if;
  for stage in select * from jsonb_array_elements(stages) loop
    idx := idx + 1;
    if jsonb_typeof(stage) is distinct from 'object' or (select count(*) from jsonb_object_keys(stage)) <> 7
       or stage->>'stage_index' is distinct from idx::text or stage->>'stage_name' is distinct from names[idx]
       or jsonb_typeof(stage->'stage_index') is distinct from 'number'
       or jsonb_typeof(stage->'target_repetitions') is distinct from 'number'
       or (stage->>'target_repetitions') !~ '^[1-9][0-9]*$' then return false; end if;
    if (stage->>'target_repetitions')::numeric > 2147483647 then return false; end if;
    foreach field in array array['stage_name','exercise_id','exercise_name','pace_instruction','internal_focus_instruction'] loop
      if jsonb_typeof(stage->field) is distinct from 'string' or btrim(stage->>field) = '' then return false; end if;
    end loop;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_curriculum_stages(jsonb) from public,anon;
grant execute on function private.valid_curriculum_stages(jsonb) to authenticated;

create table public.curricula (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  survey_submission_id uuid not null references public.survey_submissions(id),
  generation_request_id uuid not null unique references public.curriculum_generation_requests(id),
  previous_curriculum_id uuid references public.curricula(id),
  status text not null check (status in ('draft','confirmed','rejected')),
  version bigint not null default 1 check (version > 0),
  stages jsonb not null check (private.valid_curriculum_stages(stages)),
  validated boolean not null default false,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  check ((status = 'confirmed') = (confirmed_at is not null))
);
alter table public.curriculum_generation_requests add foreign key(curriculum_id) references public.curricula(id);
create index curricula_owner_idx on public.curricula(user_id);
alter table public.curricula enable row level security;
revoke all on public.curricula from public,anon,authenticated;
grant select on public.curricula to authenticated;
create policy curricula_read_validated_own on public.curricula for select to authenticated
  using (validated and user_id = (select auth.uid()));

create function private.check_generation_success() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='succeeded' and not exists(select 1 from public.curricula c
      where c.id=new.curriculum_id and c.validated and c.user_id=new.user_id
        and c.survey_submission_id=new.survey_submission_id and c.generation_request_id=new.id) then
    raise exception using errcode='23514',message='INVALID_GENERATED_CURRICULUM';
  end if;
  return new;
end;
$$;
revoke all on function private.check_generation_success() from public,anon,authenticated;
create trigger generation_success_requires_validated_curriculum
  before insert or update on public.curriculum_generation_requests
  for each row execute function private.check_generation_success();

create function private.generation_wire(job public.curriculum_generation_requests) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id',(job).id,'kind',(job).kind,'status',(job).status,'curriculum_id',(job).curriculum_id,
    'error',(job).error,'created_at',(job).created_at,'updated_at',(job).updated_at)
$$;
revoke all on function private.generation_wire(public.curriculum_generation_requests) from public,anon,authenticated;

create function public.create_initial_generation(p_submission_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source public.survey_submissions%rowtype;
  prior private.initial_generation_keys%rowtype;
  job public.curriculum_generation_requests%rowtype;
  candidates jsonb;
begin
  if actor is null then return jsonb_build_object('outcome','UNAUTHORIZED','request',null); end if;
  if p_submission_id is null or p_idempotency_key is null then
    return jsonb_build_object('outcome','INVALID_INPUT','request',null);
  end if;
  select * into source from public.survey_submissions where id=p_submission_id and user_id=actor for update;
  if not found then return jsonb_build_object('outcome','RESOURCE_NOT_FOUND','request',null); end if;
  perform pg_advisory_xact_lock(hashtextextended('initial:'||actor::text||':'||p_idempotency_key::text,0));
  select * into prior from private.initial_generation_keys where user_id=actor and request_key=p_idempotency_key;
  if found then
    if prior.submission_id <> p_submission_id then
      return jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT','request',null);
    end if;
    select * into job from public.curriculum_generation_requests where id=prior.request_id;
    return jsonb_build_object('outcome','ACCEPTED','request',private.generation_wire(job));
  end if;
  if source.generation_claimed_at is not null then
    return jsonb_build_object('outcome','INVALID_STATE','request',null);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'body_parts',e.body_parts,
      'internal_focus_instruction',e.internal_focus_instruction) order by e.id),'[]'::jsonb)
    into candidates from public.exercise_catalog e where e.enabled
      and not (e.body_parts ?| array(select jsonb_array_elements_text(source.answers#>'{physical_limitations,body_parts}')));
  if jsonb_array_length(candidates)=0 then
    return jsonb_build_object('outcome','NO_ELIGIBLE_EXERCISE','request',null);
  end if;
  if not exists(select 1 from private.generation_workers where available_until > now()) then
    return jsonb_build_object('outcome','GENERATION_UNAVAILABLE','request',null);
  end if;
  -- 생성 참조 획득·작업·스냅샷·키는 같은 거래다. 실패하면 모두 롤백한다.
  perform private.claim_survey_submission_for_generation(source.id,source.version);
  insert into public.curriculum_generation_requests(user_id,survey_submission_id,source_version,kind,status)
    values(actor,source.id,source.version,'initial','queued') returning * into job;
  -- 서버 보관 스냅샷이며 외부 LLM 전송 payload가 아니다. 자유 입력 비식별화 정책은 후속이다.
  insert into private.generation_inputs(request_id,input_snapshot,exercise_candidates)
    values(job.id,jsonb_build_object('purpose',source.answers->'purpose','intensity',source.answers->'intensity',
      'priority_body_parts',source.answers->'priority_body_parts'),candidates);
  insert into private.initial_generation_keys(user_id,request_key,submission_id,request_id)
    values(actor,p_idempotency_key,source.id,job.id);
  return jsonb_build_object('outcome','ACCEPTED','request',private.generation_wire(job));
end;
$$;
revoke all on function public.create_initial_generation(uuid,uuid) from public,anon;
grant execute on function public.create_initial_generation(uuid,uuid) to authenticated;

-- 아래 함수는 향후 신뢰된 worker가 사용할 기반이다. 사용자 JWT로는 직접 실행할 수 없다.
create function private.register_generation_worker(p_worker_id uuid,p_lease_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_worker_id is null or p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception using errcode='22023',message='INVALID_WORKER_LEASE';
  end if;
  insert into private.generation_workers values(p_worker_id,now()+make_interval(secs=>p_lease_seconds))
    on conflict(id) do update set available_until=excluded.available_until;
end;
$$;
create function private.claim_generation_request(p_request_id uuid,p_worker_id uuid,p_lease_seconds integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare job public.curriculum_generation_requests%rowtype; payload private.generation_inputs%rowtype;
begin
  if p_lease_seconds is null or p_lease_seconds <= 0 then
    raise exception using errcode='22023',message='INVALID_WORKER_LEASE';
  end if;
  if not exists(select 1 from private.generation_workers where id=p_worker_id and available_until>now()) then return null; end if;
  select * into job from public.curriculum_generation_requests where id=p_request_id for update;
  if not found or job.status not in ('queued','running') then return null; end if;
  select * into payload from private.generation_inputs where request_id=job.id for update;
  if job.status='running' and payload.lease_until>now() then return null; end if;
  update private.generation_inputs set attempts=attempts+1,worker_id=p_worker_id,lease_token=gen_random_uuid(),
    lease_until=now()+make_interval(secs=>p_lease_seconds) where request_id=job.id returning * into payload;
  update public.curriculum_generation_requests set status='running',updated_at=now() where id=job.id;
  return jsonb_build_object('request_id',job.id,'lease_token',payload.lease_token,'input_snapshot',payload.input_snapshot,
    'exercise_candidates',payload.exercise_candidates);
end;
$$;
create function private.fail_generation_request(p_request_id uuid,p_lease_token uuid,p_error_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare job public.curriculum_generation_requests%rowtype; payload private.generation_inputs%rowtype; message text;
begin
  message := case p_error_code when 'LLM_UNAVAILABLE' then '생성 서비스를 이용할 수 없습니다.'
    when 'GENERATION_TIMEOUT' then '생성 처리 시간이 초과되었습니다.'
    when 'INVALID_GENERATED_CURRICULUM' then '생성 결과를 사용할 수 없습니다.'
    when 'NO_ELIGIBLE_EXERCISE' then '구성할 수 있는 지원 운동이 없습니다.' else null end;
  if message is null then raise exception using errcode='22023',message='INVALID_ERROR_CODE'; end if;
  select * into job from public.curriculum_generation_requests where id=p_request_id for update;
  if not found or job.status<>'running' then return false; end if;
  select * into payload from private.generation_inputs where request_id=job.id for update;
  if p_lease_token is null or payload.lease_token is distinct from p_lease_token
     or payload.lease_until is null or payload.lease_until<=now() then return false; end if;
  update public.curriculum_generation_requests set status='failed',error=jsonb_build_object(
    'code',p_error_code,'message',message,'field_errors','[]'::jsonb),updated_at=now() where id=job.id;
  update private.generation_inputs set lease_token=null,lease_until=null where request_id=job.id;
  return true;
end;
$$;
create function private.expire_generation_requests(p_queued_before timestamptz) returns bigint
language plpgsql security definer set search_path = '' as $$
declare affected bigint;
begin
  update public.curriculum_generation_requests j set status='failed',updated_at=now(),error=jsonb_build_object(
    'code','GENERATION_TIMEOUT','message','생성 처리 시간이 초과되었습니다.','field_errors','[]'::jsonb)
    from private.generation_inputs p where j.id=p.request_id and
      ((j.status='running' and p.lease_until<=now()) or (j.status='queued' and j.created_at<=p_queued_before));
  get diagnostics affected = row_count;
  update private.generation_inputs p set lease_token=null,lease_until=null
    from public.curriculum_generation_requests j where j.id=p.request_id and j.status='failed';
  return affected;
end;
$$;
revoke all on function private.register_generation_worker(uuid,integer),private.claim_generation_request(uuid,uuid,integer),
  private.fail_generation_request(uuid,uuid,text),private.expire_generation_requests(timestamptz) from public,anon,authenticated;

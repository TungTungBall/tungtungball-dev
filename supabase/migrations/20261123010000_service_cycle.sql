-- v1 행·함수·생성 경로는 변경하지 않는다. v2는 아직 생성 입력으로 사용하지 않는다.
create or replace function private.is_valid_survey_v2(a jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb; p text; parts text[] := array['neck','shoulder','elbow','wrist','lower_back','hip','knee','ankle'];
begin
  if a is null or jsonb_typeof(a) is distinct from 'object' then return false; end if;
  if not (a ?& array['goal','experience','available_minutes','days_per_week',
      'limitations_present','limitations','priority_body_parts'])
      or (select count(*) from jsonb_object_keys(a)) <> 7 then return false; end if;
  if jsonb_typeof(a->'goal') is distinct from 'string' or a->>'goal' not in ('fitness','strength','weight_management','habit')
      or jsonb_typeof(a->'experience') is distinct from 'string' or a->>'experience' not in ('beginner','occasional','regular')
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
  if exists (select 1 from jsonb_array_elements(a->'priority_body_parts') e
      where jsonb_typeof(e) is distinct from 'string' or not ((e #>> '{}') = any(array['arms','legs','core','shoulder','chest','neck']))) then return false; end if;
  return (select count(distinct e) from jsonb_array_elements(a->'priority_body_parts') e) = jsonb_array_length(a->'priority_body_parts');
end;
$$;
-- v1 테이블과 진행 중 세션은 그대로 둔다. 새 흐름은 v2 저장 조건의 스냅샷을 참조한다.
create table private.cycle_catalog (
 id text primary key, name text not null, variant text not null,
 loaded_parts text[] not null, instructions jsonb not null
);
insert into private.cycle_catalog values
 ('push_up_knee','무릎 푸시업','knee',array['neck','shoulder','elbow','wrist','lower_back','hip','knee'],
 '{"start":"정면 카메라에 어깨와 손, 무릎까지 보이게 맞추고 무릎을 바닥에 댄 준비 자세를 잡으세요.","mistake":"허리가 꺾이거나 어깨가 올라가지 않도록 해 주세요.","stop":"통증이나 어지러움이 생기면 즉시 멈추세요."}'),
 ('push_up_standard','정자세 푸시업','standard',array['neck','shoulder','elbow','wrist','lower_back','hip','ankle'],
 '{"start":"정면 카메라에 어깨와 손, 몸통이 보이게 맞추고 손과 발로 몸을 지지하세요.","mistake":"몸통이 먼저 내려가거나 허리가 꺾이지 않도록 해 주세요.","stop":"통증이나 어지러움이 생기면 즉시 멈추세요."}');
create table private.cycle_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 survey_id uuid not null references public.survey_submissions_v2(id), survey_version bigint not null,
 snapshot jsonb not null, preworkout jsonb not null, plan jsonb not null,
 status text not null default 'queued' check(status in ('queued','running','succeeded','failed')),
 explanation text, error text, lease uuid, lease_until timestamptz,
 created_at timestamptz not null default clock_timestamp()
);
create unique index cycle_one_generation on private.cycle_requests(user_id) where status in ('queued','running');
create table private.cycle_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
 request_id uuid not null unique references private.cycle_requests(id),
 status text not null default 'active' check(status in ('active','paused','completed','stopped')),
 counts integer[] not null default array[0,0,0,0,0], stage integer not null default 1 check(stage between 1 and 5),
 version integer not null default 1, rest_until timestamptz, rest_started_at timestamptz,
 tracking_lost boolean not null default false, stop_reason text,
 active_ms bigint not null default 0, last_rep_at timestamptz,
 feedback_status text not null default 'pending' check(feedback_status in ('pending','submitted','skipped')),
 feedback jsonb, gem text check(gem in ('polished','unfinished','dull')),
 started_at timestamptz not null default clock_timestamp(), ended_at timestamptz
);
create unique index cycle_one_active on private.cycle_sessions(user_id) where status in ('active','paused');
create table private.cycle_receipts(user_id uuid not null, request_key uuid not null, payload jsonb not null, response jsonb not null, primary key(user_id,request_key));
revoke all on private.cycle_catalog, private.cycle_requests, private.cycle_sessions, private.cycle_receipts from public,anon,authenticated;

create function private.cycle_request_view(r private.cycle_requests) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'status',r.status,'plan',r.plan,'explanation',r.explanation,'error',r.error,'created_at',r.created_at)
$$;
create function private.cycle_session_view(s private.cycle_sessions) returns jsonb language sql stable set search_path='' as $$
 select (to_jsonb(s)-array['user_id','last_rep_at']) || jsonb_build_object('request',private.cycle_request_view(r))
 from private.cycle_requests r where r.id=s.request_id
$$;

create function private.cycle_plan(a jsonb, previous private.cycle_sessions, prior private.cycle_requests, pre jsonb) returns jsonb
language plpgsql set search_path='' as $$
#variable_conflict use_variable
declare variant text; n integer; baseline integer; cap integer := 15; rest integer := 60; item jsonb;
 c private.cycle_catalog%rowtype; reason text; hit boolean; mild boolean := false; budget integer;
begin
 variant := case when a->>'experience'='beginner' then 'knee' else 'standard' end;
 n := case a->>'experience' when 'beginner' then 3 when 'occasional' then 4 else 6 end;
 reason := '저장된 운동 경험을 기준으로 시작해요.';
 if previous.id is not null and prior.snapshot->>'experience'=a->>'experience' then
   variant := prior.plan->>'variant'; n := (prior.plan->>'baseline_reps')::integer;
   hit := (select min(x) from unnest(previous.counts) x) >= (prior.plan->>'reps')::integer;
   if not previous.tracking_lost and coalesce(previous.stop_reason,'') <> 'pain' then
     if (previous.feedback->>'effort'='hard') or not hit then
       if variant='standard' and n<=2 then variant:='knee';n:=6;else n:=greatest(1,n-1);end if;
       reason := '지난 운동이 힘들었거나 목표에 못 미쳐 단계당 횟수를 줄였어요.';
     elsif previous.feedback->>'effort'='light' and hit then
       if variant='knee' and n>=6 then variant:='standard';n:=2;
         reason := '무릎 푸시업 목표를 달성하고 가볍다고 답해서 정자세 2회에 도전해요.';
       else n:=n+1;reason:='지난번에 가볍다고 답하고 목표를 달성해서 단계당 1회 늘렸어요.';end if;
     else reason := '지난 운동의 기준 횟수를 유지해요.';end if;
   else reason := '판정 누락이나 통증 중단이 있어 지난 기준을 유지해요.';end if;
 end if;
 select * into c from private.cycle_catalog where cycle_catalog.variant=variant;
 for item in select value from jsonb_array_elements(a->'limitations') loop
   if (item->>'part'='knee' and variant='knee') or (item->>'part'=any(c.loaded_parts) and item->>'severity' in ('moderate','severe')) then
     return jsonb_build_object('blocked',true,'reason','제한 조건에 맞는 푸시업이 없어요. 무리해서 다른 자세로 바꾸지 않아요. 통증이 계속되면 전문가와 상담해 주세요.');
   end if;
   if item->>'part'=any(c.loaded_parts) then mild:=true;end if;
 end loop;
 n:=least(cap,greatest(1,n)); baseline:=n;
 -- 목표별 구성의 초기값. 난이도/다음 회차 기준값은 바꾸지 않는다.
 if a->>'goal' in ('strength','fitness') then n:=least(cap,n+1);end if;
 rest:=case a->>'goal' when 'strength' then 75 when 'fitness' then 45 when 'weight_management' then 45 else 60 end;

 if pre->>'condition'='light' then n:=greatest(1,round(n*0.8)::integer);
 elsif pre->>'condition'='hard' then n:=least(cap,round(n*1.2)::integer);end if;
 if mild then n:=greatest(1,floor(n*0.8)::integer); reason:=reason||' 불편한 부위가 있어 이번 횟수를 낮췄어요.';end if;
 -- 명시적 휴식 칩을 우선하고, 시간 만족도는 휴식만 보정한다. 강도 기준값은 유지한다.
 if previous.feedback->'keywords' ? 'more_rest' then rest:=75;
 elsif previous.feedback->'keywords' ? 'less_rest' then rest:=45;
 elsif previous.feedback->>'duration_feedback'='long' then rest:=greatest(15,rest-15);
 elsif previous.feedback->>'duration_feedback'='short' then rest:=rest+15;end if;
 budget:=(a->>'available_minutes')::integer*60;
 rest:=least(1800,rest,greatest(0,(budget-5*n*5)/4));
 return jsonb_build_object('policy_version','cycle-2026-11-23.1','exercise_id',c.id,'exercise_name',c.name,'variant',variant,
 'baseline_reps',baseline,'reps',n,'stages',5,'cap',cap,'rest_seconds',rest,'max_rest_seconds',1800,
 'estimated_seconds',5*n*5+4*rest,'goal',a->>'goal','reason',reason,'instructions',c.instructions);
end;
$$;

create function public.cycle_command(op text, entity uuid, request_key uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); a public.survey_submissions_v2%rowtype; r private.cycle_requests%rowtype;
 s private.cycle_sessions%rowtype; prev private.cycle_sessions%rowtype; prior private.cycle_requests%rowtype;
 receipt private.cycle_receipts%rowtype; payload jsonb; reply jsonb; plan jsonb; target integer; total integer;
 threshold numeric; item jsonb; t timestamptz:=clock_timestamp(); duration integer;
begin
 if actor is null then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if p is null or jsonb_typeof(p)<>'object' then return jsonb_build_object('error','INVALID_INPUT');end if;
 -- All writes for one owner serialize, including different request keys.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,33));
 if request_key is null then return jsonb_build_object('error','INVALID_INPUT');end if;
 payload:=jsonb_build_object('op',op,'entity',entity,'body',p);
 select * into receipt from private.cycle_receipts where user_id=actor and cycle_receipts.request_key=cycle_command.request_key;
 if found then
   if receipt.payload<>payload then return jsonb_build_object('error','IDEMPOTENCY_CONFLICT');end if;
   return receipt.response;
 end if;
 if op='generate' then
   if not(p ?& array['survey_id','survey_version','condition']) or (select count(*) from jsonb_object_keys(p))<>3
     or p->>'condition' not in ('recommended','light','normal','hard') then return jsonb_build_object('error','INVALID_INPUT');end if;
   select * into a from public.survey_submissions_v2 where id=(p->>'survey_id')::uuid and user_id=actor for share;
   if not found then return jsonb_build_object('error','NOT_FOUND');end if;
   if a.version<>(p->>'survey_version')::bigint then return jsonb_build_object('error','VERSION_CONFLICT');end if;
   if exists(select 1 from private.cycle_sessions where user_id=actor and status in ('active','paused')) or exists(select 1 from public.workout_sessions where user_id=actor and status in ('in_progress','paused')) then return jsonb_build_object('error','ACTIVE_SESSION');end if;
   update private.cycle_requests set status='failed',error='GENERATION_TIMEOUT' where user_id=actor and status in ('queued','running') and created_at<t-interval '5 minutes';
   if exists(select 1 from private.cycle_requests where user_id=actor and status in ('queued','running')) then return jsonb_build_object('error','GENERATION_IN_PROGRESS');end if;
   select * into prev from private.cycle_sessions where user_id=actor and status in ('completed','stopped') order by ended_at desc,id desc limit 1;
   select * into prior from private.cycle_requests where id=prev.request_id;
   plan:=private.cycle_plan(a.answers,prev,prior,p);
   insert into private.cycle_requests(user_id,survey_id,survey_version,snapshot,preworkout,plan,status,error)
     values(actor,a.id,a.version,a.answers,p,plan,case when plan->>'blocked'='true' then 'failed' else 'queued' end,
       case when plan->>'blocked'='true' then 'NO_CANDIDATES' end) returning * into r;
   reply:=private.cycle_request_view(r);
 elsif op='start' then
   select * into r from private.cycle_requests where id=entity and user_id=actor;
   if not found then return jsonb_build_object('error','NOT_FOUND');end if;
   if r.status<>'succeeded' or p<> '{"confirmed":true}'::jsonb then return jsonb_build_object('error','INVALID_STATE');end if;
   if exists(select 1 from private.cycle_sessions where user_id=actor and status in ('active','paused')) or exists(select 1 from public.workout_sessions where user_id=actor and status in ('in_progress','paused')) then return jsonb_build_object('error','ACTIVE_SESSION');end if;
   if not exists(select 1 from public.survey_submissions_v2 where id=r.survey_id and version=r.survey_version) then return jsonb_build_object('error','STALE_SURVEY');end if;
   if exists(select 1 from private.cycle_sessions where request_id=r.id) then return jsonb_build_object('error','ALREADY_STARTED');end if;
   insert into private.cycle_sessions(user_id,request_id) values(actor,r.id) returning * into s;
   reply:=private.cycle_session_view(s);
 else
   select * into s from private.cycle_sessions where id=entity and user_id=actor for update;
   if not found then return jsonb_build_object('error','NOT_FOUND');end if;
   select * into r from private.cycle_requests where id=s.request_id;
   if p->>'version' is null or (p->>'version')::integer<>s.version then return jsonb_build_object('error','VERSION_CONFLICT');end if;
   target:=(r.plan->>'reps')::integer;
   if op='repetition' then
     if s.status<>'active' or s.rest_until>t then return jsonb_build_object('error','INVALID_STATE');end if;
     if s.last_rep_at is not null and t-s.last_rep_at<interval '450 milliseconds' then return jsonb_build_object('error','TOO_FAST');end if;
     s.counts[s.stage]:=s.counts[s.stage]+1;
     if s.last_rep_at is not null then s.active_ms:=s.active_ms+least(5000,greatest(0,extract(epoch from t-s.last_rep_at)*1000))::bigint;end if;
     s.last_rep_at:=t;
     if s.counts[s.stage]>=target then
       if s.stage=5 then s.status:='completed';s.ended_at:=t;s.gem:='polished';
       else s.stage:=s.stage+1;s.rest_started_at:=t;s.rest_until:=t+make_interval(secs=>(r.plan->>'rest_seconds')::integer);s.last_rep_at:=null;end if;
     end if;
   elsif op='tracking-lost' then
     if s.status not in ('active','paused') then return jsonb_build_object('error','INVALID_STATE');end if;
     s.tracking_lost:=true;s.last_rep_at:=null;
   elsif op='pause' then
     if s.status<>'active' then return jsonb_build_object('error','INVALID_STATE');end if;
     s.status:='paused';s.last_rep_at:=null;
   elsif op='resume' then
     if s.status<>'paused' then return jsonb_build_object('error','INVALID_STATE');end if;
     s.status:='active';s.last_rep_at:=null;
   elsif op='rest' then
     if s.status<>'active' or s.rest_until is null then return jsonb_build_object('error','INVALID_STATE');end if;
     duration:=(p->>'seconds')::integer;
     if duration is null or duration<0 or duration>1800 then return jsonb_build_object('error','INVALID_INPUT');end if;
     s.rest_until:=least(t+make_interval(secs=>duration),s.rest_started_at+interval '30 minutes');s.last_rep_at:=null;
   elsif op='stop' then
     if s.status not in ('active','paused') or coalesce(p->>'reason','') not in ('pain','tracking','voluntary') then return jsonb_build_object('error','INVALID_STATE');end if;
     s.status:='stopped';s.stop_reason:=p->>'reason';s.ended_at:=t;s.feedback_status:='skipped';
     total:=(select sum(x) from unnest(s.counts) x);
     threshold:=case r.snapshot->>'experience' when 'beginner' then 0.5 when 'occasional' then 0.7 else 0.8 end;
     if s.tracking_lost or s.stop_reason in ('pain','tracking') then s.gem:=null;
     elsif total>=5*target*threshold then s.gem:='polished';
     else
       s.gem:='unfinished';
       if r.snapshot->>'experience'<>'beginner' and (select count(*) from (select gem from private.cycle_sessions where user_id=actor and ended_at is not null order by ended_at desc limit 2) x where gem in ('unfinished','dull'))=2 then s.gem:='dull';end if;
     end if;
   elsif op='feedback' then
     if s.status<>'completed' or s.feedback_status<>'pending' then return jsonb_build_object('error','INVALID_STATE');end if;
     if not(p ?& array['version','skip','effort','duration_feedback','satisfaction','comment','keywords']) or (select count(*) from jsonb_object_keys(p))<>7
       or jsonb_typeof(p->'skip')<>'boolean' or jsonb_typeof(p->'comment')<>'string' or length(p->>'comment')>500
       or jsonb_typeof(p->'keywords')<>'array' or jsonb_array_length(p->'keywords')>12
       or (p->'effort'<>'null'::jsonb and p->>'effort' not in ('light','normal','hard'))
       or (p->'duration_feedback'<>'null'::jsonb and p->>'duration_feedback' not in ('short','normal','long'))
       or (p->'satisfaction'<>'null'::jsonb and (p->>'satisfaction')!~'^[1-5]$') then return jsonb_build_object('error','INVALID_INPUT');end if;
     for item in select value from jsonb_array_elements(p->'keywords') loop
       if (item#>>'{}') not in ('other_area','same_exercise','variety','more_rest','less_rest','prefer_arms','prefer_legs','prefer_core','prefer_shoulder','prefer_chest','prefer_neck','avoid_arms','avoid_legs','avoid_core','avoid_shoulder','avoid_chest','avoid_neck') then return jsonb_build_object('error','INVALID_INPUT');end if;
     end loop;
     if p->'keywords' ? 'more_rest' and p->'keywords' ? 'less_rest' then return jsonb_build_object('error','INVALID_INPUT');end if;
     if (p->>'skip')::boolean or (p->'effort'='null' and p->'duration_feedback'='null' and p->'satisfaction'='null' and btrim(p->>'comment')='' and p->'keywords'='[]') then
       s.feedback_status:='skipped';s.feedback:=null;
     else s.feedback_status:='submitted';s.feedback:=p-array['version','skip'];end if;
   else return jsonb_build_object('error','INVALID_INPUT');end if;
   update private.cycle_sessions set status=s.status,counts=s.counts,stage=s.stage,version=version+1,rest_until=s.rest_until,rest_started_at=s.rest_started_at,
     tracking_lost=s.tracking_lost,stop_reason=s.stop_reason,active_ms=s.active_ms,last_rep_at=s.last_rep_at,
     feedback_status=s.feedback_status,feedback=s.feedback,gem=s.gem,ended_at=s.ended_at where id=s.id returning * into s;
   reply:=private.cycle_session_view(s);
 end if;
 insert into private.cycle_receipts values(actor,request_key,payload,reply);
 return reply;
exception when invalid_text_representation or numeric_value_out_of_range then return jsonb_build_object('error','INVALID_INPUT');
end;
$$;
revoke all on function public.cycle_command(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.cycle_command(text,uuid,uuid,jsonb) to authenticated;

create function public.cycle_query(op text, entity uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); reply jsonb;
begin
 if actor is null then return jsonb_build_object('error','UNAUTHORIZED');end if;
 if op='request' then
 update private.cycle_requests set status='failed',error='GENERATION_TIMEOUT' where id=entity and user_id=actor and status in ('queued','running') and created_at<clock_timestamp()-interval '5 minutes';
 select private.cycle_request_view(r) into reply from private.cycle_requests r where id=entity and user_id=actor;
 elsif op='session' then select private.cycle_session_view(s) into reply from private.cycle_sessions s where id=entity and user_id=actor;
 elsif op='active' then select private.cycle_session_view(s) into reply from private.cycle_sessions s where user_id=actor and status in ('active','paused') limit 1;
 elsif op='records' then
   select coalesce(jsonb_agg(private.cycle_session_view(s) order by s.started_at desc),'[]') into reply from private.cycle_sessions s where user_id=actor;
 elsif op='latest-request' then select private.cycle_request_view(r) into reply from private.cycle_requests r where user_id=actor order by created_at desc limit 1;
 else return jsonb_build_object('error','INVALID_INPUT');end if;
 return coalesce(reply,'null'::jsonb);
end;
$$;
revoke all on function public.cycle_query(text,uuid) from public,anon;
grant execute on function public.cycle_query(text,uuid) to authenticated;

-- 기존 worker의 최소 실행 권한을 유지하며 새 요청도 같은 worker가 처리한다.
alter function public.generation_worker(text,uuid,integer,jsonb) rename to generation_worker_v1;
revoke all on function public.generation_worker_v1(text,uuid,integer,jsonb) from public,anon,authenticated;
create function public.generation_worker(p_operation text,p_worker_id uuid,p_seconds integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r private.cycle_requests%rowtype; v_explanation text;
begin
 if p_operation='cycle_poll' then
   update private.cycle_requests set status='failed',error='GENERATION_TIMEOUT' where (status='running' and lease_until<clock_timestamp()) or (status='queued' and created_at<clock_timestamp()-interval '5 minutes');
   select * into r from private.cycle_requests where status='queued' order by created_at for update skip locked limit 1;
   if not found then return 'null'::jsonb;end if;
   update private.cycle_requests set status='running',lease=gen_random_uuid(),lease_until=clock_timestamp()+make_interval(secs=>p_seconds) where id=r.id returning * into r;
   return jsonb_build_object('request_id',r.id,'lease_token',r.lease,'goal',r.snapshot->>'goal','plan',r.plan,
     'priority_body_parts',r.snapshot->'priority_body_parts','keywords',coalesce((select feedback->'keywords' from private.cycle_sessions where user_id=r.user_id and feedback_status='submitted' order by ended_at desc limit 1),'[]'::jsonb));
 elsif p_operation in ('cycle_publish','cycle_fail') then
   select * into r from private.cycle_requests where id=(p_payload->>'request_id')::uuid for update;
   if not found or r.status<>'running' or r.lease is distinct from (p_payload->>'lease_token')::uuid or r.lease_until<clock_timestamp() then return 'false';end if;
   if p_operation='cycle_publish' then
     if p_payload->'stages' is distinct from (select jsonb_agg(jsonb_build_object('stage_index',i,'exercise_id',r.plan->>'exercise_id','reps',(r.plan->>'reps')::integer) order by i) from generate_series(1,5) i) then return 'false';end if;
     v_explanation:=p_payload->>'explanation';
     -- 모델은 검토된 설명 ID만 고른다. 임의 동작·안전 지침을 생성해서 덮어쓸 수 없다.
     if v_explanation is null or v_explanation not in ('steady','habit','control') then return 'false';end if;
     update private.cycle_requests set status='succeeded',explanation=case v_explanation
       when 'steady' then '지금 정한 횟수에 맞춰 일정한 속도로 움직여 주세요.'
       when 'habit' then '오늘 가능한 만큼 차근차근 이어가 주세요. 통증이 생기면 멈춰도 괜찮아요.'
       when 'control' then '횟수를 서두르기보다 내려갔다 올라오는 한 번의 움직임에 집중해 주세요.' end where id=r.id;
   else update private.cycle_requests set status='failed',error='GENERATION_FAILED' where id=r.id;end if;
   return 'true';
 end if;
 return public.generation_worker_v1(p_operation,p_worker_id,p_seconds,p_payload);
end;
$$;
revoke all on function public.generation_worker(text,uuid,integer,jsonb) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.generation_worker(text,uuid,integer,jsonb) to service_role;end if;end $$;

-- Helpers are only called inside the owner-checked SECURITY DEFINER entry points.
revoke all on function private.cycle_request_view(private.cycle_requests) from public,anon,authenticated;
revoke all on function private.cycle_session_view(private.cycle_sessions) from public,anon,authenticated;
revoke all on function private.cycle_plan(jsonb,private.cycle_sessions,private.cycle_requests,jsonb) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='healthmith_worker') then
   grant execute on function public.generation_worker(text,uuid,integer,jsonb) to healthmith_worker;
 end if;
end $$;

-- Prevent a legacy start and a v2 start from creating two active sessions for one user.
alter function public.journey_command(text,uuid,uuid,jsonb) rename to journey_command_v1;
revoke all on function public.journey_command_v1(text,uuid,uuid,jsonb) from public,anon,authenticated;
create function public.journey_command(p_operation text,p_resource_id uuid,p_key uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_operation='start' and auth.uid() is not null then
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,33));
   if not exists(select 1 from private.journey_receipts where user_id=auth.uid() and operation='start' and resource_id=p_resource_id and request_key=p_key)
     and exists(select 1 from private.cycle_sessions where user_id=auth.uid() and status in ('active','paused')) then
     return jsonb_build_object('outcome','INVALID_STATE','data',null);
   end if;
 end if;
 return public.journey_command_v1(p_operation,p_resource_id,p_key,p_payload);
end;
$$;
revoke all on function public.journey_command(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.journey_command(text,uuid,uuid,jsonb) to authenticated;

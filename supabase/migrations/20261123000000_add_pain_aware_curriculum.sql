-- 통증 위치는 진단이 아니다. 근거 자료는 서버에서 운동 부하 조절에만 사용한다.
-- 횟수 상한을 기존 승인 범위의 최솟값으로 낮추는 것은 제품의 보수적 시작 정책이며 임상 처방 수치가 아니다.
CREATE FUNCTION private.is_valid_pain_body_parts(parts jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF parts IS NULL OR jsonb_typeof(parts) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(parts) e WHERE jsonb_typeof(e) IS DISTINCT FROM 'string'
   OR (e #>> '{}') NOT IN ('목', '어깨', '팔꿈치 바깥쪽', '손목·손 저림', '허리', '고관절·엉덩이 바깥쪽', '무릎 앞쪽', '발뒤꿈치 위쪽', '발바닥·뒤꿈치 아래쪽')) THEN RETURN false; END IF;
 RETURN (SELECT count(DISTINCT e) FROM jsonb_array_elements(parts) e)=jsonb_array_length(parts);
END $$;
REVOKE ALL ON FUNCTION private.is_valid_pain_body_parts(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.is_valid_pain_body_parts(jsonb) TO authenticated;

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
  -- 기존 네 필드 + 선택적인 pain_body_parts. 이전 제출은 그대로 유효하다.
  if answers is null or jsonb_typeof(answers) is distinct from 'object' then
    return false;
  end if;
  if not (answers ?& array['physical_limitations', 'purpose', 'intensity', 'priority_body_parts'])
     or (answers - array['physical_limitations', 'purpose', 'intensity', 'priority_body_parts', 'pain_body_parts']) <> '{}'::jsonb then
    return false;
  end if;

  if answers ? 'pain_body_parts' and not private.is_valid_pain_body_parts(answers->'pain_body_parts') then
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

-- 운동 이름에서 추측하지 않는다. 신규 운동은 동작 프로필을 등록한 뒤 통증 응답에 사용한다.
CREATE TABLE private.exercise_motion_profiles (
 exercise_id text PRIMARY KEY,
 motion_tags jsonb NOT NULL CHECK(jsonb_typeof(motion_tags)='array')
);
REVOKE ALL ON TABLE private.exercise_motion_profiles FROM PUBLIC,anon,authenticated;
INSERT INTO private.exercise_motion_profiles VALUES
 ('squat','["neck_load","trunk_load","hip_load","knee_flexion","ankle_load","foot_load"]'),
 ('push_up','["neck_load","trunk_load","shoulder_load","elbow_load","wrist_load"]'),
 ('lunge','["neck_load","trunk_load","hip_load","knee_flexion","ankle_load","foot_load"]');

CREATE TABLE private.pain_adjustment_rules (
 body_part text PRIMARY KEY,
 reference_condition text NOT NULL,
 motion_tags jsonb NOT NULL,
 guidance text NOT NULL,
 source_url text NOT NULL
);
REVOKE ALL ON TABLE private.pain_adjustment_rules FROM PUBLIC,anon,authenticated;
INSERT INTO private.pain_adjustment_rules
 SELECT body_part,reference_condition,motion_tags,guidance,source_url
 FROM jsonb_to_recordset($rules$[
  {
    "body_part": "목",
    "reference_condition": "일반적인 근육·관절성 목 통증",
    "motion_tags": [
      "neck_load",
      "heavy_lift"
    ],
    "guidance": "무거운 중량 없이 편안한 범위에서 움직이고, 반복 횟수를 낮춰 시작하세요.",
    "source_url": "https://www.chelwest.nhs.uk/your-visit/patient-leaflets/medicine-services/neck-pain"
  },
  {
    "body_part": "어깨",
    "reference_condition": "어깨 충돌 증상",
    "motion_tags": [
      "overhead_repetition",
      "shoulder_load"
    ],
    "guidance": "머리 위로 반복해서 올리는 동작과 추가 중량을 줄이고 편안한 범위에서 가볍게 움직이세요.",
    "source_url": "https://www.nhs.uk/conditions/shoulder-impingement-syndrome/"
  },
  {
    "body_part": "팔꿈치 바깥쪽",
    "reference_condition": "테니스엘보",
    "motion_tags": [
      "strong_grip",
      "heavy_lift",
      "forearm_twist",
      "elbow_load"
    ],
    "guidance": "강하게 쥐거나 비트는 힘과 추가 중량을 줄이세요.",
    "source_url": "https://swanseabay.nhs.wales/hospitals/a-z-services/physiotherapy/musculoskeletal-physiotherapy/elbow-pain/tennis-elbow-lateral-epicondylitis/"
  },
  {
    "body_part": "손목·손 저림",
    "reference_condition": "손목터널증후군",
    "motion_tags": [
      "repeated_wrist_flexion",
      "strong_grip",
      "wrist_load"
    ],
    "guidance": "반복해서 굽히는 동작과 쥐는 힘, 지지하는 부하를 줄이세요.",
    "source_url": "https://www.nhs.uk/conditions/carpal-tunnel-syndrome/"
  },
  {
    "body_part": "허리",
    "reference_condition": "일반적인 요통",
    "motion_tags": [
      "trunk_load",
      "heavy_lift"
    ],
    "guidance": "통증이 늘어나는 동작의 범위와 부하를 줄이되 편안한 일상 활동은 유지하세요.",
    "source_url": "https://www.nhs.uk/conditions/back-pain/"
  },
  {
    "body_part": "고관절·엉덩이 바깥쪽",
    "reference_condition": "둔근 힘줄병증",
    "motion_tags": [
      "hill",
      "stairs",
      "long_walk",
      "hip_adduction_stretch",
      "hip_load"
    ],
    "guidance": "반복 계단·언덕·장거리 보행을 줄이고, 무릎을 반대편으로 넘기는 압박 스트레칭은 피하세요.",
    "source_url": "https://www.cuh.nhs.uk/patient-information/gluteal-tendinopathy/"
  },
  {
    "body_part": "무릎 앞쪽",
    "reference_condition": "슬개대퇴통증",
    "motion_tags": [
      "knee_flexion",
      "run",
      "jump",
      "stairs"
    ],
    "guidance": "앉는 깊이와 반복 횟수를 줄이세요. 편안한 범위의 강화 동작은 유지할 수 있어요.",
    "source_url": "https://www.orthoinfo.org/bodypart/kneelower-leg/patellofemoral-pain-syndrome/"
  },
  {
    "body_part": "발뒤꿈치 위쪽",
    "reference_condition": "아킬레스건 중간부 힘줄병증에 한함",
    "motion_tags": [
      "calf_load",
      "run",
      "jump",
      "ankle_load"
    ],
    "guidance": "완전한 휴식보다 견딜 수 있는 수준으로 부하를 낮추세요. 위치만으로 중간부 힘줄병증으로 판단하거나 부하를 늘리지 마세요.",
    "source_url": "https://doi.org/10.2519/jospt.2024.0302"
  },
  {
    "body_part": "발바닥·뒤꿈치 아래쪽",
    "reference_condition": "족저근막염",
    "motion_tags": [
      "run",
      "long_walk",
      "long_standing",
      "foot_load"
    ],
    "guidance": "달리기·과도한 걷기·오래 서 있는 양을 줄이고 편안한 범위에서 움직이세요.",
    "source_url": "https://www.hey.nhs.uk/patient-leaflet/plantar-fasciitis/"
  }
]$rules$::jsonb)
 AS r(body_part text,reference_condition text,motion_tags jsonb,guidance text,source_url text);

-- 같은 후보·검증 정책을 최초 생성, 재생성, 피드백 후 다음 생성 모두에 적용한다.
CREATE FUNCTION private.adjust_curriculum_for_pain(candidates jsonb, pain jsonb, policy jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE candidate jsonb; tags jsonb; limits jsonb; adjusted jsonb:='[]';
BEGIN
 IF pain IS NULL OR pain='[]'::jsonb THEN RETURN jsonb_build_object('candidates',candidates,'policy',policy); END IF;
 IF NOT private.is_valid_pain_body_parts(pain) THEN RAISE EXCEPTION 'invalid pain selection'; END IF;
 FOR candidate IN SELECT * FROM jsonb_array_elements(candidates) LOOP
  SELECT motion_tags INTO tags FROM private.exercise_motion_profiles WHERE exercise_id=candidate->>'id';
  -- 미분류 동작을 안전하다고 간주하지 않는다. 다른 검토된 후보가 없으면 기존 NO_ELIGIBLE_EXERCISE 응답.
  IF tags IS NULL THEN CONTINUE; END IF;
  IF EXISTS(SELECT 1 FROM private.pain_adjustment_rules r WHERE pain ? r.body_part
      AND r.motion_tags ?| ARRAY(SELECT jsonb_array_elements_text(tags))) THEN
   limits:=policy->'repetition_limits'->(candidate->>'id');
   IF limits IS NULL THEN CONTINUE; END IF;
   -- 복수 부위가 겹쳐도 한 번만 조절하고 최소 1회인 기존 하한은 유지한다.
   policy:=jsonb_set(policy,ARRAY['repetition_limits',candidate->>'id','max'],limits->'min');
   -- 질환/통증 부위 원문을 모델에 보내지 않는다. 안내는 최종 결과에도 그대로 검증·저장된다.
   candidate:=jsonb_set(candidate,'{internal_focus_instruction}',to_jsonb(
    (candidate->>'internal_focus_instruction') || ' 추가 중량 없이 편안한 범위에서 작게 움직이세요. 통증이 늘면 해당 동작을 멈추세요.'));
  END IF;
  adjusted:=adjusted||jsonb_build_array(candidate);
 END LOOP;
 RETURN jsonb_build_object('candidates',adjusted,'policy',policy);
END $$;
REVOKE ALL ON FUNCTION private.adjust_curriculum_for_pain(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

create or replace function public.create_initial_generation(p_submission_id uuid,p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  source public.survey_submissions%rowtype;
  prior private.initial_generation_keys%rowtype;
  job public.curriculum_generation_requests%rowtype;
  candidates jsonb;
  policy jsonb;
  adjusted jsonb;
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
  select value into policy from private.runtime_policies where name='generation_validation';
  adjusted:=private.adjust_curriculum_for_pain(candidates,source.answers->'pain_body_parts',policy);
  candidates:=adjusted->'candidates';policy:=adjusted->'policy';
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
  insert into private.generation_inputs(request_id,input_snapshot,exercise_candidates,validation_policy)
    values(job.id,jsonb_build_object('purpose',source.answers->'purpose','intensity',source.answers->'intensity',
      'priority_body_parts',source.answers->'priority_body_parts'),candidates,policy);
  insert into private.initial_generation_keys(user_id,request_key,submission_id,request_id)
    values(actor,p_idempotency_key,source.id,job.id);
  return jsonb_build_object('outcome','ACCEPTED','request',private.generation_wire(job));
end;
$$;
revoke all on function public.create_initial_generation(uuid,uuid) from public,anon;
grant execute on function public.create_initial_generation(uuid,uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.generation_workflow(p_operation text,p_resource_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=auth.uid(); c public.curricula;f public.workout_feedback;s public.workout_sessions;
 source public.survey_submissions;job public.curriculum_generation_requests;tjob public.tendency_generation_requests;
 cached private.workflow_keys;profile public.workout_tendencies;candidates jsonb;snapshot jsonb;excluded jsonb;
 result jsonb;policy jsonb;adjusted jsonb;feedback_count integer;root_id uuid:='00000000-0000-0000-0000-000000000000';
BEGIN
 IF owner_id IS NULL THEN RETURN jsonb_build_object('outcome','UNAUTHORIZED','data',NULL); END IF;
 IF p_operation IN ('tendency','tendency_job') THEN
  IF p_operation='tendency_job' THEN
   SELECT * INTO tjob FROM public.tendency_generation_requests WHERE id=p_resource_id AND user_id=owner_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
   result:=to_jsonb(tjob)-'user_id';
  ELSE
   SELECT * INTO profile FROM public.workout_tendencies WHERE user_id=owner_id;
   SELECT * INTO tjob FROM public.tendency_generation_requests WHERE user_id=owner_id ORDER BY created_at DESC,id DESC LIMIT 1;
   result:=jsonb_build_object('summary',profile.summary,'updated_at',profile.updated_at,'source_feedback_count',coalesce(profile.source_feedback_count,0),'latest_generation_status',coalesce(tjob.status,'not_requested'),'latest_request_id',tjob.id);
  END IF;
  RETURN jsonb_build_object('outcome','OK','data',result);
 END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('regeneration','next','summary') OR p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
 p_resource_id:=coalesce(p_resource_id,root_id);
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text,33));
 IF p_operation='regeneration' THEN
  SELECT * INTO c FROM public.curricula WHERE id=p_resource_id AND user_id=owner_id AND validated FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
 ELSIF p_operation='next' THEN
  SELECT * INTO f FROM public.workout_feedback WHERE id=p_resource_id AND user_id=owner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
  SELECT * INTO s FROM public.workout_sessions WHERE id=f.session_id AND user_id=owner_id;
  SELECT * INTO c FROM public.curricula WHERE id=s.curriculum_id AND user_id=owner_id AND validated;
 END IF;
 SELECT * INTO cached FROM private.workflow_keys WHERE user_id=owner_id AND operation=p_operation AND resource_id=p_resource_id AND request_key=p_key;
 IF FOUND THEN
  IF cached.payload<>p_payload THEN RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT','data',NULL); END IF;
  IF p_operation='summary' THEN SELECT * INTO tjob FROM public.tendency_generation_requests WHERE id=cached.job_id;
   result:=jsonb_build_object('id',tjob.id,'status',tjob.status,'created_at',tjob.created_at);
  ELSE SELECT * INTO job FROM public.curriculum_generation_requests WHERE id=cached.job_id;result:=private.generation_wire(job); END IF;
  RETURN jsonb_build_object('outcome','OK','data',result);
 END IF;
 IF p_operation='regeneration' THEN
  IF (p_payload-'expected_version')<>'{}'::jsonb OR jsonb_typeof(p_payload->'expected_version') IS DISTINCT FROM 'number' OR (p_payload->>'expected_version')!~'^[1-9][0-9]*$' THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
  IF c.version<>(p_payload->>'expected_version')::bigint THEN RETURN jsonb_build_object('outcome','VERSION_CONFLICT','data',NULL); END IF;
  IF EXISTS(SELECT 1 FROM public.curricula n WHERE n.user_id=owner_id AND n.validated AND (n.created_at,n.id)>(c.created_at,c.id)) THEN RETURN jsonb_build_object('outcome','NOT_CURRENT_DRAFT','data',NULL); END IF;
  IF c.status<>'draft' AND NOT(c.status='rejected' AND EXISTS(SELECT 1 FROM private.generation_inputs i JOIN public.curriculum_generation_requests j ON j.id=i.request_id WHERE i.previous_curriculum_id=c.id AND j.status='failed') AND NOT EXISTS(SELECT 1 FROM private.generation_inputs i JOIN public.curriculum_generation_requests j ON j.id=i.request_id WHERE i.previous_curriculum_id=c.id AND j.status<>'failed')) THEN RETURN jsonb_build_object('outcome','INVALID_STATE','data',NULL); END IF;
 ELSIF p_payload<>'{}'::jsonb THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL);
 END IF;
 IF p_operation='summary' THEN
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('difficulty',difficulty,'enjoyment',enjoyment) ORDER BY created_at,id),'[]') INTO feedback_count,snapshot FROM public.workout_feedback WHERE user_id=owner_id;
  IF feedback_count=0 THEN RETURN jsonb_build_object('outcome','NO_FEEDBACK','data',NULL); END IF;
  SELECT * INTO tjob FROM public.tendency_generation_requests WHERE user_id=owner_id AND status IN ('queued','running');
  IF FOUND THEN result:=jsonb_build_object('id',tjob.id,'status',tjob.status,'created_at',tjob.created_at);
  ELSE
   IF NOT EXISTS(SELECT 1 FROM private.generation_workers WHERE available_until>clock_timestamp()) THEN RETURN jsonb_build_object('outcome','GENERATION_UNAVAILABLE','data',NULL); END IF;
   INSERT INTO public.tendency_generation_requests(user_id,status,source_feedback_count) VALUES(owner_id,'queued',feedback_count) RETURNING * INTO tjob;
   INSERT INTO private.tendency_inputs(request_id,input_snapshot) VALUES(tjob.id,snapshot);
   result:=jsonb_build_object('id',tjob.id,'status',tjob.status,'created_at',tjob.created_at);
  END IF;
  INSERT INTO private.workflow_keys VALUES(owner_id,p_operation,p_resource_id,p_key,p_payload,tjob.id);
 ELSE
  SELECT j.* INTO job FROM public.curriculum_generation_requests j JOIN private.generation_inputs i ON i.request_id=j.id WHERE j.user_id=owner_id AND i.feedback_id=f.id AND j.status IN ('queued','running') LIMIT 1;
  IF FOUND AND p_operation='next' THEN
   INSERT INTO private.workflow_keys VALUES(owner_id,p_operation,p_resource_id,p_key,p_payload,job.id);
   RETURN jsonb_build_object('outcome','OK','data',private.generation_wire(job));
  END IF;
  SELECT * INTO source FROM public.survey_submissions WHERE id=c.survey_submission_id AND user_id=owner_id FOR UPDATE;
  IF p_operation='next' AND f.soreness_body_parts ? '기타' THEN RETURN jsonb_build_object('outcome','POLICY_NOT_CONFIGURED','data',NULL); END IF;
  excluded:=coalesce(source.answers->'physical_limitations'->'body_parts','[]')||coalesce(f.soreness_body_parts-'없음','[]');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'name',e.name,'body_parts',e.body_parts,'internal_focus_instruction',e.internal_focus_instruction) ORDER BY e.id),'[]') INTO candidates
   FROM public.exercise_catalog e WHERE e.enabled AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(e.body_parts) part WHERE excluded ? part);
  IF jsonb_array_length(candidates)=0 THEN RETURN jsonb_build_object('outcome','NO_ELIGIBLE_EXERCISE','data',NULL); END IF;
  SELECT value INTO policy FROM private.runtime_policies WHERE name='generation_validation';
  IF policy IS NULL OR (p_operation='next' AND coalesce(btrim(policy->>'adjustment_instruction'),'')='') THEN RETURN jsonb_build_object('outcome','POLICY_NOT_CONFIGURED','data',NULL); END IF;
  adjusted:=private.adjust_curriculum_for_pain(candidates,source.answers->'pain_body_parts',policy);
  candidates:=adjusted->'candidates';policy:=adjusted->'policy';
  IF jsonb_array_length(candidates)=0 THEN RETURN jsonb_build_object('outcome','NO_ELIGIBLE_EXERCISE','data',NULL); END IF;
  IF NOT EXISTS(SELECT 1 FROM private.generation_workers WHERE available_until>clock_timestamp()) THEN RETURN jsonb_build_object('outcome','GENERATION_UNAVAILABLE','data',NULL); END IF;
  snapshot:=jsonb_build_object('purpose',source.answers->'purpose','intensity',source.answers->'intensity','priority_body_parts',source.answers->'priority_body_parts');
  IF p_operation='next' THEN SELECT * INTO profile FROM public.workout_tendencies WHERE user_id=owner_id;
   snapshot:=snapshot||jsonb_build_object('difficulty',f.difficulty,'enjoyment',f.enjoyment,'previous_stages',c.stages);
   IF policy->'include_generated_summary'='true'::jsonb AND profile.summary IS NOT NULL THEN
    snapshot:=snapshot||jsonb_build_object('summary',profile.summary);
   END IF;
  END IF;
  INSERT INTO public.curriculum_generation_requests(user_id,survey_submission_id,source_version,kind,status) VALUES(owner_id,source.id,source.version,p_operation,'queued') RETURNING * INTO job;
  INSERT INTO private.generation_inputs(request_id,input_snapshot,exercise_candidates,previous_curriculum_id,feedback_id,validation_policy) VALUES(job.id,snapshot,candidates,c.id,f.id,policy);
  IF p_operation='regeneration' AND c.status='draft' THEN UPDATE public.curricula SET status='rejected',version=version+1 WHERE id=c.id; END IF;
  INSERT INTO private.workflow_keys VALUES(owner_id,p_operation,p_resource_id,p_key,p_payload,job.id);result:=private.generation_wire(job);
 END IF;
 RETURN jsonb_build_object('outcome','OK','data',result);
END $$;
REVOKE ALL ON FUNCTION public.generation_workflow(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generation_workflow(text,uuid,uuid,jsonb) TO authenticated;

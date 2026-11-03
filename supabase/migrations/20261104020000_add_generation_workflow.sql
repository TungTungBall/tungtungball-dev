CREATE TABLE public.tendency_generation_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),
 status text NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
 source_feedback_count integer NOT NULL CHECK(source_feedback_count>0),error jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='failed')=(error IS NOT NULL))
);
CREATE UNIQUE INDEX tendency_one_active ON public.tendency_generation_requests(user_id) WHERE status IN ('queued','running');
CREATE TABLE private.tendency_inputs (
 request_id uuid PRIMARY KEY REFERENCES public.tendency_generation_requests(id),input_snapshot jsonb NOT NULL,
 worker_id uuid REFERENCES private.generation_workers(id),lease_token uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0
);
CREATE TABLE public.workout_tendencies (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),summary text NOT NULL CHECK(btrim(summary)<>''),
 updated_at timestamptz NOT NULL,source_feedback_count integer NOT NULL CHECK(source_feedback_count>0)
);
ALTER TABLE public.tendency_generation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_tendencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tendency_generation_requests,public.workout_tendencies,private.tendency_inputs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.tendency_generation_requests,public.workout_tendencies TO authenticated;
CREATE POLICY tendency_job_owner ON public.tendency_generation_requests FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY tendency_owner ON public.workout_tendencies FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
ALTER TABLE private.generation_inputs ADD COLUMN previous_curriculum_id uuid REFERENCES public.curricula(id), ADD COLUMN feedback_id uuid REFERENCES public.workout_feedback(id), ADD COLUMN validation_policy jsonb;
CREATE TABLE private.workflow_keys (
 user_id uuid NOT NULL REFERENCES auth.users(id),operation text NOT NULL,resource_id uuid NOT NULL,
 request_key uuid NOT NULL,payload jsonb NOT NULL,job_id uuid NOT NULL,PRIMARY KEY(user_id,operation,resource_id,request_key)
);
REVOKE ALL ON private.workflow_keys FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.generation_workflow(p_operation text,p_resource_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=auth.uid(); c public.curricula;f public.workout_feedback;s public.workout_sessions;
 source public.survey_submissions;job public.curriculum_generation_requests;tjob public.tendency_generation_requests;
 cached private.workflow_keys;profile public.workout_tendencies;candidates jsonb;snapshot jsonb;excluded jsonb;
 result jsonb;policy jsonb;feedback_count integer;root_id uuid:='00000000-0000-0000-0000-000000000000';
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
  IF NOT EXISTS(SELECT 1 FROM private.generation_workers WHERE available_until>clock_timestamp()) THEN RETURN jsonb_build_object('outcome','GENERATION_UNAVAILABLE','data',NULL); END IF;
  snapshot:=jsonb_build_object('purpose',source.answers->'purpose','intensity',source.answers->'intensity','priority_body_parts',source.answers->'priority_body_parts');
  IF p_operation='next' THEN SELECT * INTO profile FROM public.workout_tendencies WHERE user_id=owner_id;
   snapshot:=snapshot||jsonb_build_object('difficulty',f.difficulty,'enjoyment',f.enjoyment,'previous_stages',c.stages,'summary',profile.summary); END IF;
  INSERT INTO public.curriculum_generation_requests(user_id,survey_submission_id,source_version,kind,status) VALUES(owner_id,source.id,source.version,p_operation,'queued') RETURNING * INTO job;
  INSERT INTO private.generation_inputs(request_id,input_snapshot,exercise_candidates,previous_curriculum_id,feedback_id,validation_policy) VALUES(job.id,snapshot,candidates,c.id,f.id,policy);
  IF p_operation='regeneration' AND c.status='draft' THEN UPDATE public.curricula SET status='rejected',version=version+1 WHERE id=c.id; END IF;
  INSERT INTO private.workflow_keys VALUES(owner_id,p_operation,p_resource_id,p_key,p_payload,job.id);result:=private.generation_wire(job);
 END IF;
 RETURN jsonb_build_object('outcome','OK','data',result);
END $$;
REVOKE ALL ON FUNCTION public.generation_workflow(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generation_workflow(text,uuid,uuid,jsonb) TO authenticated;

CREATE FUNCTION private.publish_curriculum(p_request_id uuid,p_lease_token uuid,p_stages jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.curriculum_generation_requests;input private.generation_inputs;stage jsonb;candidate jsonb;policy jsonb;c public.curricula;limits jsonb;
BEGIN
 SELECT * INTO job FROM public.curriculum_generation_requests WHERE id=p_request_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(job.user_id::text,33));
 SELECT * INTO job FROM public.curriculum_generation_requests WHERE id=p_request_id FOR UPDATE;
 SELECT * INTO input FROM private.generation_inputs WHERE request_id=job.id FOR UPDATE;
 IF job.status<>'running' OR input.lease_token IS DISTINCT FROM p_lease_token OR input.lease_until<=clock_timestamp() OR NOT private.valid_curriculum_stages(p_stages) THEN RETURN false; END IF;
 policy:=input.validation_policy;
 IF policy IS NULL THEN SELECT value INTO policy FROM private.runtime_policies WHERE name='generation_validation'; END IF;
 IF policy IS NULL THEN RETURN false; END IF;
 FOR stage IN SELECT * FROM jsonb_array_elements(p_stages) LOOP
  SELECT v INTO candidate FROM jsonb_array_elements(input.exercise_candidates) v WHERE v->>'id'=stage->>'exercise_id';
  limits:=policy->'repetition_limits'->(stage->>'exercise_id');
  IF candidate IS NULL OR stage->>'exercise_name' IS DISTINCT FROM candidate->>'name' OR stage->>'internal_focus_instruction' IS DISTINCT FROM candidate->>'internal_focus_instruction'
   OR limits IS NULL OR jsonb_typeof(limits->'min') IS DISTINCT FROM 'number' OR jsonb_typeof(limits->'max') IS DISTINCT FROM 'number'
   OR (stage->>'target_repetitions')::integer NOT BETWEEN (limits->>'min')::integer AND (limits->>'max')::integer
   OR NOT coalesce(policy->'pace_instructions' ? (stage->>'pace_instruction'),false) THEN RETURN false; END IF;
 END LOOP;
 IF input.previous_curriculum_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.curricula newer JOIN public.curricula old ON old.id=input.previous_curriculum_id WHERE newer.user_id=job.user_id AND newer.validated AND (newer.created_at,newer.id)>(old.created_at,old.id)) THEN RETURN false; END IF;
 INSERT INTO public.curricula(user_id,survey_submission_id,generation_request_id,previous_curriculum_id,status,stages,validated) VALUES(job.user_id,job.survey_submission_id,job.id,input.previous_curriculum_id,'draft',p_stages,true) RETURNING * INTO c;
 UPDATE public.curriculum_generation_requests SET status='succeeded',curriculum_id=c.id,updated_at=clock_timestamp() WHERE id=job.id;
 RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.publish_curriculum(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.publish_tendency(p_request_id uuid,p_lease_token uuid,p_summary text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE job public.tendency_generation_requests;input private.tendency_inputs;max_length integer;
BEGIN
 SELECT * INTO job FROM public.tendency_generation_requests WHERE id=p_request_id;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(job.user_id::text,33));
 SELECT * INTO job FROM public.tendency_generation_requests WHERE id=p_request_id FOR UPDATE;
 SELECT * INTO input FROM private.tendency_inputs WHERE request_id=job.id FOR UPDATE;
 SELECT (value->>'max_summary_length')::integer INTO max_length FROM private.runtime_policies WHERE name='generation_validation';
 IF job.status<>'running' OR input.lease_token IS DISTINCT FROM p_lease_token OR input.lease_until<=clock_timestamp()
  OR max_length IS NULL OR p_summary IS NULL OR btrim(p_summary)='' OR length(p_summary)>max_length THEN RETURN false; END IF;
 IF (SELECT count(*) FROM public.workout_feedback WHERE user_id=job.user_id)<>job.source_feedback_count THEN RETURN false; END IF;
 INSERT INTO public.workout_tendencies VALUES(job.user_id,p_summary,clock_timestamp(),job.source_feedback_count)
  ON CONFLICT(user_id) DO UPDATE SET summary=EXCLUDED.summary,updated_at=EXCLUDED.updated_at,source_feedback_count=EXCLUDED.source_feedback_count WHERE public.workout_tendencies.source_feedback_count<=EXCLUDED.source_feedback_count;
 UPDATE public.tendency_generation_requests SET status='succeeded',updated_at=clock_timestamp() WHERE id=job.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION private.publish_tendency(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.generation_worker(p_operation text,p_worker_id uuid,p_seconds integer,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE jid uuid;claim jsonb;input private.generation_inputs;tinput private.tendency_inputs;job public.tendency_generation_requests;policy jsonb;token uuid;ok boolean;
BEGIN
 IF p_worker_id IS NULL OR p_seconds IS NULL OR p_seconds<=0 THEN RAISE EXCEPTION 'invalid worker lease'; END IF;
 IF p_operation='poll' THEN
  SELECT value INTO policy FROM private.runtime_policies WHERE name='generation_validation';
  IF policy IS NULL THEN RETURN NULL; END IF;
  PERFORM private.register_generation_worker(p_worker_id,p_seconds);
  SELECT j.id INTO jid FROM public.curriculum_generation_requests j JOIN private.generation_inputs i ON i.request_id=j.id
   WHERE j.status='queued' OR (j.status='running' AND i.lease_until<=clock_timestamp()) ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
  IF FOUND THEN
   claim:=private.claim_generation_request(jid,p_worker_id,p_seconds);
   IF claim IS NOT NULL THEN
    UPDATE private.generation_inputs SET validation_policy=coalesce(validation_policy,policy) WHERE request_id=jid RETURNING * INTO input;
    RETURN jsonb_build_object('kind','curriculum','request_id',jid,'lease_token',input.lease_token,'snapshot',input.input_snapshot,'candidates',input.exercise_candidates,'policy',input.validation_policy);
   END IF;
  END IF;
  SELECT j.* INTO job FROM public.tendency_generation_requests j JOIN private.tendency_inputs i ON i.request_id=j.id
   WHERE j.status='queued' OR (j.status='running' AND i.lease_until<=clock_timestamp()) ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1;
  IF FOUND THEN
   token:=gen_random_uuid();UPDATE public.tendency_generation_requests SET status='running',updated_at=clock_timestamp() WHERE id=job.id;
   UPDATE private.tendency_inputs SET worker_id=p_worker_id,lease_token=token,lease_until=clock_timestamp()+make_interval(secs=>p_seconds),attempts=attempts+1 WHERE request_id=job.id RETURNING * INTO tinput;
   RETURN jsonb_build_object('kind','summary','request_id',job.id,'lease_token',token,'snapshot',tinput.input_snapshot,'candidates',NULL,'policy',policy);
  END IF;
  RETURN NULL;
 ELSIF p_operation='publish_curriculum' THEN
  SELECT worker_id INTO jid FROM private.generation_inputs WHERE request_id=(p_payload->>'request_id')::uuid AND lease_token=(p_payload->>'lease_token')::uuid;
  IF jid IS DISTINCT FROM p_worker_id THEN RETURN 'false'; END IF;
  ok:=private.publish_curriculum((p_payload->>'request_id')::uuid,(p_payload->>'lease_token')::uuid,p_payload->'stages');RETURN to_jsonb(ok);
 ELSIF p_operation='publish_summary' THEN
  SELECT worker_id INTO jid FROM private.tendency_inputs WHERE request_id=(p_payload->>'request_id')::uuid AND lease_token=(p_payload->>'lease_token')::uuid;
  IF jid IS DISTINCT FROM p_worker_id THEN RETURN 'false'; END IF;
  ok:=private.publish_tendency((p_payload->>'request_id')::uuid,(p_payload->>'lease_token')::uuid,p_payload->>'summary');RETURN to_jsonb(ok);
 ELSIF p_operation='fail' THEN
  IF p_payload->>'code' NOT IN ('LLM_UNAVAILABLE','GENERATION_TIMEOUT','INVALID_GENERATED_CURRICULUM') THEN RETURN 'false'; END IF;
  IF p_payload->>'kind'='curriculum' THEN
   SELECT worker_id INTO jid FROM private.generation_inputs WHERE request_id=(p_payload->>'request_id')::uuid AND lease_token=(p_payload->>'lease_token')::uuid;
   IF jid IS DISTINCT FROM p_worker_id THEN RETURN 'false'; END IF;
   RETURN to_jsonb(private.fail_generation_request((p_payload->>'request_id')::uuid,(p_payload->>'lease_token')::uuid,p_payload->>'code'));
  ELSE
   UPDATE public.tendency_generation_requests j SET status='failed',error=jsonb_build_object('code',p_payload->>'code','message','요약 생성에 실패했습니다.','field_errors','[]'::jsonb),updated_at=clock_timestamp()
    FROM private.tendency_inputs i WHERE j.id=i.request_id AND j.id=(p_payload->>'request_id')::uuid AND j.status='running' AND i.worker_id=p_worker_id AND i.lease_token=(p_payload->>'lease_token')::uuid AND i.lease_until>clock_timestamp();
   RETURN to_jsonb(FOUND);
  END IF;
 ELSIF p_operation='expire' THEN
  PERFORM private.expire_generation_requests((p_payload->>'queued_before')::timestamptz);
  UPDATE public.tendency_generation_requests j SET status='failed',error=jsonb_build_object('code','GENERATION_TIMEOUT','message','생성 처리 시간이 초과되었습니다.','field_errors','[]'::jsonb),updated_at=clock_timestamp()
   FROM private.tendency_inputs i WHERE j.id=i.request_id AND ((j.status='running' AND i.lease_until<=clock_timestamp()) OR (j.status='queued' AND j.created_at<(p_payload->>'queued_before')::timestamptz));
  RETURN 'true';
 END IF;
 RAISE EXCEPTION 'unsupported worker operation';
END $$;
REVOKE ALL ON FUNCTION public.generation_worker(text,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION public.generation_worker(text,uuid,integer,jsonb) TO service_role;
END IF;END $$;

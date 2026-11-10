-- MVP include_generated_summary=false이면 다음 생성 스냅샷에서도 요약을 제외한다.
-- 기존 worker의 미승인 요약 전송 차단은 유지한다.
CREATE OR REPLACE FUNCTION public.generation_workflow(p_operation text,p_resource_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb
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

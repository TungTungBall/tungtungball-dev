-- C02/W01/W04/R01/F01/F02/R02/R03/GE01/GE02. 정책은 관리 권한으로만 설정한다.
CREATE TABLE private.runtime_policies (name text PRIMARY KEY, value jsonb NOT NULL);
REVOKE ALL ON private.runtime_policies FROM PUBLIC,anon,authenticated;
CREATE TABLE private.journey_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id), operation text NOT NULL, resource_id uuid NOT NULL,
 request_key uuid NOT NULL, payload jsonb NOT NULL, response jsonb NOT NULL,
 PRIMARY KEY(user_id,operation,resource_id,request_key)
);
REVOKE ALL ON private.journey_receipts FROM PUBLIC,anon,authenticated;
CREATE TABLE private.workout_events (
 session_id uuid NOT NULL REFERENCES public.workout_sessions(id), event_id uuid NOT NULL,
 payload jsonb NOT NULL, PRIMARY KEY(session_id,event_id)
);
REVOKE ALL ON private.workout_events FROM PUBLIC,anon,authenticated;
CREATE TABLE public.workout_feedback (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 session_id uuid NOT NULL UNIQUE REFERENCES public.workout_sessions(id), soreness_body_parts jsonb NOT NULL,
 difficulty integer NOT NULL CHECK(difficulty BETWEEN 1 AND 5), enjoyment integer NOT NULL CHECK(enjoyment BETWEEN 1 AND 5),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.gems (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 source_workout_session_id uuid NOT NULL UNIQUE REFERENCES public.workout_sessions(id),
 state text NOT NULL DEFAULT 'polished' CHECK(state='polished'), display_name text NOT NULL DEFAULT '완성된 보석',
 availability text NOT NULL DEFAULT 'available' CHECK(availability IN ('available','reserved','battle_locked')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.workout_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gems ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_feedback,public.gems FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.workout_feedback,public.gems TO authenticated;
CREATE POLICY feedback_owner ON public.workout_feedback FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY gem_owner ON public.gems FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE FUNCTION private.valid_feedback(parts jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 RETURN jsonb_typeof(parts)='array' AND jsonb_array_length(parts) BETWEEN 1 AND 4
  AND (SELECT count(*)=count(DISTINCT v) AND bool_and(jsonb_typeof(v)='string' AND v#>>'{}' IN ('없음','상체','하체','허리','기타')) FROM jsonb_array_elements(parts) v)
  AND (NOT parts ? '없음' OR jsonb_array_length(parts)=1);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_feedback(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.valid_feedback(jsonb) TO authenticated;
ALTER TABLE public.workout_feedback ADD CHECK(private.valid_feedback(soreness_body_parts) IS TRUE);
CREATE FUNCTION private.check_journey_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.workout_sessions s WHERE s.id=CASE WHEN TG_TABLE_NAME='gems' THEN (to_jsonb(NEW)->>'source_workout_session_id')::uuid ELSE (to_jsonb(NEW)->>'session_id')::uuid END AND s.user_id=NEW.user_id AND s.status='completed') THEN
  RAISE EXCEPTION 'invalid source workout' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.check_journey_owner() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER feedback_source_guard BEFORE INSERT OR UPDATE ON public.workout_feedback FOR EACH ROW EXECUTE FUNCTION private.check_journey_owner();
CREATE TRIGGER gem_source_guard BEFORE INSERT OR UPDATE ON public.gems FOR EACH ROW EXECUTE FUNCTION private.check_journey_owner();
CREATE FUNCTION private.curriculum_response(c public.curricula) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT to_jsonb(c)-ARRAY['user_id','generation_request_id','validated'];
$$;
REVOKE ALL ON FUNCTION private.curriculum_response(public.curricula) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.journey_command(p_operation text,p_resource_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=auth.uid(); c public.curricula; s public.workout_sessions; f public.workout_feedback;
 receipt private.journey_receipts; ev private.workout_events; result jsonb; err text; expected bigint;
 changed_at timestamptz; stage jsonb; new_reps integer; reusable boolean; gem public.gems;
BEGIN
 IF owner_id IS NULL THEN RETURN jsonb_build_object('outcome','UNAUTHORIZED','data',NULL); END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('confirm','start','repetition','feedback') OR p_resource_id IS NULL OR p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
  RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
 IF (p_operation IN ('confirm','start') AND (p_payload - 'expected_version')<>'{}'::jsonb)
  OR (p_operation='repetition' AND (p_payload - ARRAY['stage_index','expected_version'])<>'{}'::jsonb)
  OR (p_operation='feedback' AND (p_payload - ARRAY['soreness_body_parts','difficulty','enjoyment'])<>'{}'::jsonb) THEN
  RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text,33));
 IF p_operation IN ('confirm','start') THEN
  SELECT * INTO c FROM public.curricula WHERE id=p_resource_id AND user_id=owner_id AND validated FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
 ELSE
  SELECT * INTO s FROM public.workout_sessions WHERE id=p_resource_id AND user_id=owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
 END IF;
 SELECT * INTO receipt FROM private.journey_receipts WHERE user_id=owner_id AND operation=p_operation AND resource_id=p_resource_id AND request_key=p_key;
 IF FOUND THEN
  IF receipt.payload<>p_payload THEN RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT','data',NULL); END IF;
  RETURN jsonb_build_object('outcome','OK','data',receipt.response);
 END IF;
 IF p_operation='repetition' THEN
  SELECT * INTO ev FROM private.workout_events WHERE session_id=s.id AND event_id=p_key;
  IF FOUND THEN
   IF ev.payload<>p_payload THEN RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT','data',NULL); END IF;
   RETURN jsonb_build_object('outcome','OK','data',jsonb_build_object('session',private.workout_response(s),'event_id',p_key,'event_applied',false));
  END IF;
 END IF;
 changed_at:=clock_timestamp();
 IF p_operation IN ('confirm','start','repetition') THEN
  IF jsonb_typeof(p_payload->'expected_version') IS DISTINCT FROM 'number' OR (p_payload->>'expected_version')!~'^[1-9][0-9]*$' THEN err:='INVALID_INPUT';
  ELSE expected:=(p_payload->>'expected_version')::bigint; END IF;
  IF err IS NULL AND expected<>(CASE WHEN p_operation IN ('confirm','start') THEN c.version ELSE s.version END) THEN err:='VERSION_CONFLICT'; END IF;
 END IF;
 IF err IS NOT NULL THEN RETURN jsonb_build_object('outcome',err,'data',NULL); END IF;
 IF p_operation='confirm' THEN
  IF c.status<>'draft' OR EXISTS(SELECT 1 FROM public.curricula newer WHERE newer.user_id=owner_id AND newer.validated AND (newer.created_at,newer.id)>(c.created_at,c.id)) THEN err:='NOT_CURRENT_DRAFT';
  ELSE UPDATE public.curricula SET status='confirmed',version=version+1,confirmed_at=changed_at WHERE id=c.id RETURNING * INTO c;
   result:=private.curriculum_response(c); END IF;
 ELSIF p_operation='start' THEN
  IF c.status<>'confirmed' THEN err:='INVALID_STATE';
  ELSIF EXISTS(SELECT 1 FROM public.curricula newer WHERE newer.user_id=owner_id AND newer.validated AND (newer.created_at,newer.id)>(c.created_at,c.id)) THEN err:='NOT_CURRENT_DRAFT';
  ELSIF EXISTS(SELECT 1 FROM public.workout_sessions WHERE user_id=owner_id AND status IN ('in_progress','paused')) THEN err:='INVALID_STATE';
  ELSE
   SELECT (value->>'allow_reuse')::boolean INTO reusable FROM private.runtime_policies WHERE name='workout_start' AND jsonb_typeof(value->'allow_reuse')='boolean';
   IF reusable IS NULL THEN err:='POLICY_NOT_CONFIGURED';
   ELSIF NOT reusable AND EXISTS(SELECT 1 FROM public.workout_sessions WHERE curriculum_id=c.id) THEN err:='INVALID_STATE';
   ELSE INSERT INTO public.workout_sessions(user_id,curriculum_id,stages,status,current_stage_index,current_repetitions,completed_stage_count,stage_results,started_at,updated_at)
    VALUES(owner_id,c.id,c.stages,'in_progress',1,0,0,'[]',changed_at,changed_at) RETURNING * INTO s;
    result:=private.workout_response(s); END IF;
  END IF;
 ELSIF p_operation='repetition' THEN
  IF jsonb_typeof(p_payload->'stage_index') IS DISTINCT FROM 'number' OR (p_payload->>'stage_index')!~'^[1-5]$' THEN err:='INVALID_INPUT';
  ELSIF s.status<>'in_progress' OR (p_payload->>'stage_index')::integer<>s.current_stage_index THEN err:='INVALID_STATE';
  ELSE
   stage:=s.stages->(s.current_stage_index-1);new_reps:=s.current_repetitions+1;
   IF new_reps=(stage->>'target_repetitions')::integer THEN
    s.stage_results:=s.stage_results||jsonb_build_array(jsonb_build_object('stage_index',s.current_stage_index,'exercise_id',stage->>'exercise_id','target_repetitions',stage->'target_repetitions','completed_repetitions',new_reps,'completed_at',changed_at));
    s.completed_stage_count:=s.completed_stage_count+1;
    IF s.current_stage_index=5 THEN s.status:='completed';s.ended_at:=changed_at;
    ELSE s.current_stage_index:=s.current_stage_index+1;new_reps:=0; END IF;
   END IF;
   UPDATE public.workout_sessions SET status=s.status,current_stage_index=s.current_stage_index,current_repetitions=new_reps,
    completed_stage_count=s.completed_stage_count,stage_results=s.stage_results,version=version+1,updated_at=greatest(changed_at,updated_at),ended_at=s.ended_at
    WHERE id=s.id RETURNING * INTO s;
   IF s.status='completed' THEN INSERT INTO public.gems(user_id,source_workout_session_id,created_at) VALUES(owner_id,s.id,changed_at); END IF;
   INSERT INTO private.workout_events VALUES(s.id,p_key,p_payload);
   RETURN jsonb_build_object('outcome','OK','data',jsonb_build_object('session',private.workout_response(s),'event_id',p_key,'event_applied',true));
  END IF;
 ELSIF p_operation='feedback' THEN
  IF private.valid_feedback(p_payload->'soreness_body_parts') IS NOT TRUE OR jsonb_typeof(p_payload->'difficulty') IS DISTINCT FROM 'number'
   OR (p_payload->>'difficulty')!~'^[1-5]$' OR jsonb_typeof(p_payload->'enjoyment') IS DISTINCT FROM 'number' OR (p_payload->>'enjoyment')!~'^[1-5]$' THEN err:='INVALID_FEEDBACK';
  ELSIF s.status<>'completed' THEN err:='INVALID_STATE';
  ELSIF EXISTS(SELECT 1 FROM public.workout_feedback WHERE session_id=s.id) THEN err:='FEEDBACK_ALREADY_SUBMITTED';
  ELSE
   INSERT INTO public.workout_feedback(user_id,session_id,soreness_body_parts,difficulty,enjoyment)
    VALUES(owner_id,s.id,p_payload->'soreness_body_parts',(p_payload->>'difficulty')::integer,(p_payload->>'enjoyment')::integer) RETURNING * INTO f;
   UPDATE public.workout_sessions SET feedback_status='submitted',version=version+1,updated_at=greatest(changed_at,updated_at) WHERE id=s.id;
   result:=jsonb_build_object('feedback',to_jsonb(f)-'user_id','safety_notice',CASE WHEN f.soreness_body_parts ? '없음' THEN NULL ELSE '통증이 있으면 운동을 중단하고 전문가와 상담해 주세요.' END,'next_generation_request_id',NULL,'tendency_generation_request_id',NULL);
  END IF;
 END IF;
 IF err IS NOT NULL THEN RETURN jsonb_build_object('outcome',err,'data',NULL); END IF;
 INSERT INTO private.journey_receipts VALUES(owner_id,p_operation,p_resource_id,p_key,p_payload,result);
 RETURN jsonb_build_object('outcome','OK','data',result);
END $$;
REVOKE ALL ON FUNCTION public.journey_command(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journey_command(text,uuid,uuid,jsonb) TO authenticated;

CREATE FUNCTION public.journey_query(p_operation text,p_resource_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=auth.uid();s public.workout_sessions;f public.workout_feedback;g public.gems;result jsonb;rows jsonb;
 completed bigint;abandoned bigint;n integer;boundary_time timestamptz;boundary_id uuid;last_item jsonb;cursor_value text;
BEGIN
 IF owner_id IS NULL THEN RETURN jsonb_build_object('outcome','UNAUTHORIZED','data',NULL); END IF;
 IF p_operation IN ('feedback','result') THEN
  SELECT * INTO s FROM public.workout_sessions WHERE id=p_resource_id AND user_id=owner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
  IF p_operation='feedback' THEN
   SELECT * INTO f FROM public.workout_feedback WHERE session_id=s.id;
   result:=jsonb_build_object('feedback',CASE WHEN f.id IS NOT NULL THEN to_jsonb(f)-'user_id' ELSE NULL END);
  ELSE
   IF s.status NOT IN ('completed','abandoned') THEN RETURN jsonb_build_object('outcome','INVALID_STATE','data',NULL); END IF;
   SELECT * INTO g FROM public.gems WHERE source_workout_session_id=s.id AND user_id=owner_id;
   IF s.status='completed' AND g.id IS NULL THEN RETURN jsonb_build_object('outcome','INTERNAL_ERROR','data',NULL); END IF;
   result:=jsonb_build_object('session',private.workout_response(s),'gem',CASE WHEN s.status='completed' THEN jsonb_build_object('id',g.id,'source_workout_session_id',g.source_workout_session_id,'state',g.state,'display_name',g.display_name) ELSE NULL END);
  END IF;
 ELSIF p_operation='gem' THEN
  SELECT * INTO g FROM public.gems WHERE id=p_resource_id AND user_id=owner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
  result:=to_jsonb(g)-'user_id';
 ELSIF p_operation='stats' THEN
  SELECT count(*) FILTER(WHERE status='completed'),count(*) FILTER(WHERE status='abandoned') INTO completed,abandoned FROM public.workout_sessions WHERE user_id=owner_id;
  result:=jsonb_build_object('completed_sessions',completed,'abandoned_sessions',abandoned,'current_streak_days',CASE WHEN completed+abandoned=0 THEN 0 ELSE NULL END,'streak_timezone',NULL,'body_part_results',NULL,'radar',NULL);
 ELSIF p_operation IN ('records','gems') THEN
  n:=(p_payload->>'limit')::integer;
  IF n IS NULL OR n NOT BETWEEN 1 AND 50 THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
  IF p_payload->'cursor' IS NOT NULL AND p_payload->'cursor'<>'null'::jsonb THEN
   IF p_payload->'cursor'->>'owner' IS DISTINCT FROM owner_id::text OR p_payload->'cursor'->>'operation' IS DISTINCT FROM p_operation THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
   boundary_time:=(p_payload->'cursor'->>'time')::timestamptz;boundary_id:=(p_payload->'cursor'->>'id')::uuid;
   IF boundary_time IS NULL OR boundary_id IS NULL THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
  END IF;
  IF p_operation='records' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO rows FROM (SELECT id AS session_id,status AS result,ended_at,completed_stage_count,feedback_status FROM public.workout_sessions
    WHERE user_id=owner_id AND status IN ('completed','abandoned') AND (boundary_time IS NULL OR (ended_at,id)<(boundary_time,boundary_id)) ORDER BY ended_at DESC,id DESC LIMIT n+1) r;
  ELSE
   SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO rows FROM (SELECT id,source_workout_session_id,state,display_name,availability,created_at FROM public.gems
    WHERE user_id=owner_id AND (boundary_time IS NULL OR (created_at,id)<(boundary_time,boundary_id)) ORDER BY created_at DESC,id DESC LIMIT n+1) r;
  END IF;
  IF jsonb_array_length(rows)>n THEN
   rows:=rows-n;last_item:=rows->(n-1);
   cursor_value:=replace(rtrim(translate(encode(convert_to(jsonb_build_object('owner',owner_id,'operation',p_operation,'time',coalesce(last_item->>'ended_at',last_item->>'created_at'),'id',coalesce(last_item->>'session_id',last_item->>'id'))::text,'UTF8'),'base64'),'+/','-_'),'='),E'\n','');
  END IF;
  result:=jsonb_build_object('items',rows,'next_cursor',cursor_value,'has_more',cursor_value IS NOT NULL);
 ELSE RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL);
 END IF;
 RETURN jsonb_build_object('outcome','OK','data',result);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
 RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL);
END $$;
REVOKE ALL ON FUNCTION public.journey_query(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.journey_query(text,uuid,jsonb) TO authenticated;

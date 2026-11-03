-- W02/W03/W05/W06/W07 기반. 시작·반복 판정·완료 보상은 별도이며 공개 쓰기 권한을 열지 않는다.
CREATE FUNCTION private.valid_workout_progress(stages jsonb, stage_index integer, repetitions integer,
    completed_count integer, results jsonb, session_status text, started timestamptz, updated timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = pg_catalog AS $$
DECLARE item jsonb; target jsonb; previous_time timestamptz := started; result_time timestamptz;
BEGIN
    IF stages IS NULL OR NOT private.valid_curriculum_stages(stages) OR stage_index IS NULL
       OR stage_index NOT BETWEEN 1 AND 5 OR repetitions IS NULL OR repetitions < 0 OR completed_count IS NULL
       OR completed_count NOT BETWEEN 0 AND 5 OR jsonb_typeof(results) IS DISTINCT FROM 'array'
       OR jsonb_array_length(results) <> completed_count OR started IS NULL OR updated IS NULL OR updated < started
       OR session_status IS NULL OR session_status NOT IN ('in_progress','paused','completed','abandoned') THEN RETURN false; END IF;
    IF session_status = 'completed' THEN
        IF stage_index <> 5 OR completed_count <> 5 OR repetitions <> (stages->4->>'target_repetitions')::integer THEN RETURN false; END IF;
    ELSIF completed_count <> stage_index - 1 OR repetitions > (stages->(stage_index-1)->>'target_repetitions')::integer THEN RETURN false;
    END IF;
    FOR i IN 0..completed_count-1 LOOP
        item := results->i; target := stages->i;
        IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 5
            OR item->'stage_index' IS DISTINCT FROM to_jsonb(i+1)
            OR item->'exercise_id' IS DISTINCT FROM target->'exercise_id'
            OR item->'target_repetitions' IS DISTINCT FROM target->'target_repetitions'
            OR item->'completed_repetitions' IS DISTINCT FROM target->'target_repetitions'
            OR jsonb_typeof(item->'completed_at') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
        result_time := (item->>'completed_at')::timestamptz;
        IF result_time < previous_time OR result_time > updated THEN RETURN false; END IF;
        previous_time := result_time;
    END LOOP;
    RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_workout_progress(jsonb,integer,integer,integer,jsonb,text,timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.valid_workout_progress(jsonb,integer,integer,integer,jsonb,text,timestamptz,timestamptz) TO authenticated;

CREATE TABLE public.workout_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    curriculum_id uuid NOT NULL REFERENCES public.curricula(id),
    stages jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('in_progress','paused','completed','abandoned')),
    current_stage_index integer NOT NULL,
    current_repetitions integer NOT NULL,
    completed_stage_count integer NOT NULL,
    stage_results jsonb NOT NULL,
    version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
    started_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    feedback_status text NOT NULL DEFAULT 'not_submitted' CHECK (feedback_status IN ('not_submitted','submitted')),
    CHECK (private.valid_workout_progress(stages,current_stage_index,current_repetitions,completed_stage_count,stage_results,status,started_at,updated_at)),
    CHECK ((status IN ('completed','abandoned')) = (ended_at IS NOT NULL)),
    CHECK (ended_at IS NULL OR ended_at BETWEEN started_at AND updated_at),
    CHECK (status = 'completed' OR feedback_status = 'not_submitted')
);
CREATE UNIQUE INDEX workout_one_active_per_owner ON public.workout_sessions(user_id) WHERE status IN ('in_progress','paused');
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workout_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.workout_sessions TO authenticated;
CREATE POLICY workout_owner_read ON public.workout_sessions FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION private.check_workout_curriculum() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.curricula c WHERE c.id=NEW.curriculum_id AND c.user_id=NEW.user_id
        AND c.validated AND c.status='confirmed' AND c.confirmed_at IS NOT NULL AND c.stages=NEW.stages) THEN
        RAISE EXCEPTION 'invalid workout curriculum' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.check_workout_curriculum() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER workout_curriculum_guard BEFORE INSERT OR UPDATE OF curriculum_id,user_id,stages
    ON public.workout_sessions FOR EACH ROW EXECUTE FUNCTION private.check_workout_curriculum();

CREATE TABLE private.workout_state_receipts (
    user_id uuid NOT NULL REFERENCES auth.users(id), session_id uuid NOT NULL REFERENCES public.workout_sessions(id),
    command text NOT NULL CHECK (command IN ('pause','resume','abandon')), request_key uuid NOT NULL,
    request_hash text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id,session_id,command,request_key)
);
REVOKE ALL ON private.workout_state_receipts FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.workout_response(session public.workout_sessions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
    SELECT to_jsonb(session) - ARRAY['user_id','stages'];
$$;
REVOKE ALL ON FUNCTION private.workout_response(public.workout_sessions) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.change_workout_state(p_session_id uuid, p_expected_version bigint, p_command text,
    p_reason text, p_idempotency_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE owner_id uuid := auth.uid(); session public.workout_sessions; cached private.workout_state_receipts;
    request_hash text; response jsonb; next_status text; changed_at timestamptz;
BEGIN
    IF owner_id IS NULL THEN RETURN jsonb_build_object('outcome','UNAUTHORIZED','session',NULL); END IF;
    IF p_session_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 OR p_expected_version = 9223372036854775807
       OR p_command IS NULL OR p_command NOT IN ('pause','resume','abandon') OR p_idempotency_key IS NULL
       OR (p_command='pause' AND (p_reason IS NULL OR p_reason NOT IN ('manual','no_motion')))
       OR (p_command<>'pause' AND p_reason IS NOT NULL) THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','session',NULL); END IF;
    SELECT * INTO session FROM public.workout_sessions WHERE id=p_session_id AND user_id=owner_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','session',NULL); END IF;
    request_hash := md5(jsonb_build_object('version',p_expected_version,'command',p_command,'reason',p_reason)::text);
    SELECT * INTO cached FROM private.workout_state_receipts r WHERE r.user_id=owner_id AND r.session_id=p_session_id
        AND r.command=p_command AND r.request_key=p_idempotency_key;
    IF FOUND THEN
        IF cached.request_hash <> request_hash THEN RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT','session',NULL); END IF;
        RETURN jsonb_build_object('outcome','UPDATED','session',cached.result);
    END IF;
    IF session.version <> p_expected_version THEN RETURN jsonb_build_object('outcome','VERSION_CONFLICT','session',NULL); END IF;
    IF (p_command='pause' AND session.status<>'in_progress') OR (p_command IN ('resume','abandon') AND session.status<>'paused') THEN
        RETURN jsonb_build_object('outcome','INVALID_STATE','session',NULL); END IF;
    next_status := CASE p_command WHEN 'pause' THEN 'paused' WHEN 'resume' THEN 'in_progress' ELSE 'abandoned' END;
    changed_at := greatest(clock_timestamp(),session.updated_at);
    UPDATE public.workout_sessions SET status=next_status, version=version+1, updated_at=changed_at,
        ended_at=CASE WHEN next_status='abandoned' THEN changed_at ELSE NULL END
        WHERE id=p_session_id RETURNING * INTO session;
    response := private.workout_response(session);
    INSERT INTO private.workout_state_receipts(user_id,session_id,command,request_key,request_hash,result)
        VALUES(owner_id,p_session_id,p_command,p_idempotency_key,request_hash,response);
    RETURN jsonb_build_object('outcome','UPDATED','session',response);
END $$;
REVOKE ALL ON FUNCTION public.change_workout_state(uuid,bigint,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_workout_state(uuid,bigint,text,text,uuid) TO authenticated;

CREATE FUNCTION private.install_default_loadouts() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE version text;rules jsonb;
BEGIN
 SELECT r.version,r.document INTO version,rules FROM public.combat_rulesets r WHERE r.enabled;
 IF version IS NOT NULL THEN
  INSERT INTO public.spell_loadouts(gem_id,user_id,ruleset_version,spell_ids)
   SELECT g.id,g.user_id,version,rules->'default_spell_ids' FROM public.gems g ON CONFLICT(gem_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.install_default_loadouts() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER gem_default_loadout AFTER INSERT ON public.gems FOR EACH STATEMENT EXECUTE FUNCTION private.install_default_loadouts();
CREATE TRIGGER ruleset_default_loadout AFTER INSERT OR UPDATE ON public.combat_rulesets FOR EACH STATEMENT EXECUTE FUNCTION private.install_default_loadouts();
CREATE FUNCTION public.combat_command(p_operation text,p_resource_id uuid,p_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=auth.uid();g public.gems;r public.combat_rulesets;l public.spell_loadouts;t public.matchmaking_tickets;other public.matchmaking_tickets;fake public.matchmaking_tickets;
 b private.battles;a private.battle_actors;enemy private.battle_actors;e public.combat_encounters;receipt private.combat_receipts;
 request_hash text;result jsonb;err text;bid uuid;spell jsonb;recognition jsonb;effects jsonb;cast_id uuid;eid bigint;changed_at timestamptz:=clock_timestamp();expected bigint;recognized boolean;
BEGIN
 IF owner_id IS NULL THEN RETURN jsonb_build_object('outcome','UNAUTHORIZED','data',NULL); END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('loadout','pve','match','cancel_match','ready','surrender','cast') OR p_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
 -- 현재 소규모 1대1 구현은 명령을 DB에서 직렬화한다. 수평 확장 처리량은 별도 부하 검증 대상이다.
 PERFORM pg_advisory_xact_lock(35353535);changed_at:=clock_timestamp();
 IF p_operation IN ('ready','surrender','cast') THEN
  SELECT * INTO b FROM private.battles WHERE id=p_resource_id FOR UPDATE;
  SELECT * INTO a FROM private.battle_actors WHERE battle_id=p_resource_id AND user_id=owner_id;
  IF a.user_id IS NULL THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
 ELSIF p_operation='cancel_match' THEN
  SELECT * INTO t FROM public.matchmaking_tickets WHERE id=p_resource_id AND user_id=owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
 ELSE
  SELECT * INTO g FROM public.gems WHERE id=CASE WHEN p_operation='loadout' THEN p_resource_id ELSE (p_payload->>'gem_id')::uuid END AND user_id=owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
 END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('resource',p_resource_id,'payload',p_payload)::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM private.combat_receipts WHERE user_id=owner_id AND operation=p_operation AND request_key=p_key;
 IF FOUND THEN
  IF receipt.request_hash<>request_hash THEN RETURN jsonb_build_object('outcome','IDEMPOTENCY_CONFLICT','data',NULL); END IF;
  RETURN jsonb_build_object('outcome','OK','data',receipt.response);
 END IF;
 IF p_operation IN ('loadout','cancel_match','ready','surrender') THEN
  IF jsonb_typeof(p_payload->'expected_version') IS DISTINCT FROM 'number' OR (p_payload->>'expected_version')!~'^[1-9][0-9]*$' THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
  expected:=(p_payload->>'expected_version')::bigint;
 END IF;
 IF p_operation IN ('loadout','pve','match') THEN
  SELECT * INTO r FROM public.combat_rulesets WHERE enabled;
  IF NOT FOUND OR NOT private.valid_combat_rules(r.document) THEN RETURN jsonb_build_object('outcome','POLICY_NOT_CONFIGURED','data',NULL); END IF;
  SELECT * INTO l FROM public.spell_loadouts WHERE gem_id=g.id;
  IF l.gem_id IS NULL THEN RETURN jsonb_build_object('outcome','POLICY_NOT_CONFIGURED','data',NULL); END IF;
  IF g.availability<>'available' THEN RETURN jsonb_build_object('outcome','GEM_NOT_AVAILABLE','data',NULL); END IF;
 END IF;
 IF p_operation='loadout' THEN
  IF (p_payload-ARRAY['spell_ids','expected_version'])<>'{}'::jsonb OR jsonb_typeof(p_payload->'spell_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'spell_ids') NOT BETWEEN 1 AND (r.document->>'slot_limit')::integer
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'spell_ids') id WHERE jsonb_typeof(id)<>'string') OR (SELECT count(*)<>count(DISTINCT id) FROM jsonb_array_elements(p_payload->'spell_ids') id) THEN err:='INVALID_INPUT';
  ELSIF expected<>l.version THEN err:='VERSION_CONFLICT';
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_payload->'spell_ids') id WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.document->'spells') registered_spell WHERE registered_spell->>'id'=id)) THEN err:='SPELL_NOT_AVAILABLE';
  ELSE UPDATE public.spell_loadouts SET spell_ids=p_payload->'spell_ids',ruleset_version=r.version,version=version+1 WHERE gem_id=g.id RETURNING * INTO l;result:=private.loadout_wire(l,r.document); END IF;
 ELSIF p_operation IN ('pve','match') THEN
  IF (p_operation='pve' AND ((p_payload-ARRAY['gem_id','encounter_id'])<>'{}'::jsonb OR coalesce(btrim(p_payload->>'encounter_id'),'')='')) OR (p_operation='match' AND (p_payload-'gem_id')<>'{}'::jsonb) THEN err:='INVALID_INPUT';
  ELSIF EXISTS(SELECT 1 FROM private.battle_actors WHERE user_id=owner_id AND active) THEN err:='ACTIVE_BATTLE_EXISTS';
  ELSIF EXISTS(SELECT 1 FROM public.matchmaking_tickets WHERE user_id=owner_id AND status='searching') THEN err:='ACTIVE_MATCHMAKING_EXISTS';
  ELSIF l.ruleset_version<>r.version THEN err:='SPELL_NOT_AVAILABLE';
  ELSIF p_operation='pve' THEN
   SELECT * INTO e FROM public.combat_encounters WHERE id=p_payload->>'encounter_id' AND enabled AND ruleset_version=r.version;
   IF NOT FOUND THEN err:='ENCOUNTER_UNAVAILABLE';
   ELSIF (e.configuration->>'hp')!~'^[1-9][0-9]*$' OR (e.configuration->>'mana')!~'^[0-9]+$' OR (e.configuration->>'action_interval_ms')!~'^[1-9][0-9]*$'
    OR jsonb_typeof(e.configuration->'actions') IS DISTINCT FROM 'array' OR jsonb_array_length(e.configuration->'actions')=0 THEN err:='POLICY_NOT_CONFIGURED';
   ELSE fake.user_id:=owner_id;fake.gem_id:=g.id;bid:=private.make_battle('pve',r.version,fake,other,e.configuration);result:=private.battle_wire(bid,owner_id); END IF;
  ELSE
   INSERT INTO public.matchmaking_tickets(user_id,gem_id,status,ruleset_version) VALUES(owner_id,g.id,'searching',r.version) RETURNING * INTO t;
   UPDATE public.gems SET availability='reserved' WHERE id=g.id;
   SELECT * INTO other FROM public.matchmaking_tickets WHERE status='searching' AND user_id<>owner_id AND ruleset_version=r.version ORDER BY created_at,id FOR UPDATE LIMIT 1;
   IF FOUND THEN
    bid:=private.make_battle('pvp',r.version,other,t,NULL);
    UPDATE public.matchmaking_tickets SET status='matched',battle_id=bid,version=version+1,updated_at=changed_at WHERE id IN (t.id,other.id);
    SELECT * INTO t FROM public.matchmaking_tickets WHERE id=t.id;
   END IF;
   result:=private.ticket_wire(t);
  END IF;
 ELSIF p_operation='cancel_match' THEN
  IF (p_payload-'expected_version')<>'{}'::jsonb THEN err:='INVALID_INPUT';
  ELSIF t.status='matched' THEN err:='MATCH_ALREADY_FOUND';
  ELSIF expected<>t.version THEN err:='VERSION_CONFLICT';
  ELSIF t.status<>'searching' THEN err:='INVALID_STATE';
  ELSE UPDATE public.matchmaking_tickets SET status='cancelled',version=version+1,updated_at=changed_at WHERE id=t.id RETURNING * INTO t;
   UPDATE public.gems SET availability='available' WHERE id=t.gem_id AND user_id=owner_id AND availability='reserved';result:=private.ticket_wire(t); END IF;
 ELSIF p_operation IN ('ready','surrender') THEN
  IF (p_payload-'expected_version')<>'{}'::jsonb THEN err:='INVALID_INPUT';
  ELSIF expected<>b.version THEN err:='VERSION_CONFLICT';
  ELSIF b.status NOT IN ('waiting_ready','active') OR (p_operation='ready' AND (b.status<>'waiting_ready' OR a.ready)) THEN err:='INVALID_STATE';
  ELSIF p_operation='surrender' THEN
   PERFORM private.finish_battle(b.id,CASE WHEN a.actor_id='actor_a' THEN 'actor_b' ELSE 'actor_a' END,CASE WHEN b.status='waiting_ready' THEN 'cancelled_before_start' ELSE 'surrender' END,b.status='waiting_ready');result:=private.battle_wire(b.id,owner_id);
  ELSE
   UPDATE private.battle_actors SET ready=true WHERE battle_id=b.id AND user_id=owner_id;
   UPDATE private.battles SET version=version+1 WHERE id=b.id;
   IF NOT EXISTS(SELECT 1 FROM private.battle_actors WHERE battle_id=b.id AND NOT ready) THEN
    UPDATE private.battles SET status='active',started_at=changed_at,npc_next_action_at=CASE WHEN mode='pve' THEN changed_at+make_interval(secs=>(encounter->>'action_interval_ms')::numeric/1000) ELSE NULL END WHERE id=b.id;
    UPDATE private.battle_actors SET hp=CASE WHEN kind='npc' THEN (b.encounter->>'hp')::integer ELSE (b.ruleset->>'initial_hp')::integer END,mana=CASE WHEN kind='npc' THEN (b.encounter->>'mana')::integer ELSE (b.ruleset->>'initial_mana')::integer END WHERE battle_id=b.id;
    PERFORM private.combat_event(b.id,'battle.started','{}');
   ELSE PERFORM private.combat_event(b.id,'actor.updated',jsonb_build_object('actor_id',a.actor_id,'ready',true)); END IF;
   result:=private.battle_wire(b.id,owner_id);
  END IF;
 ELSIF p_operation='cast' THEN
  IF (p_payload-ARRAY['client_cast_id','client_sequence','spell_id','rune_template_version','drawing'])<>'{}'::jsonb
   OR p_payload->>'client_cast_id' IS DISTINCT FROM p_key::text OR jsonb_typeof(p_payload->'client_sequence') IS DISTINCT FROM 'number' OR (p_payload->>'client_sequence')!~'^[1-9][0-9]*$' THEN err:='INVALID_INPUT';
  ELSIF b.status<>'active' THEN err:='BATTLE_NOT_ACTIVE';
  ELSIF a.next_cast_sequence<>(p_payload->>'client_sequence')::bigint THEN err:='CAST_SEQUENCE_CONFLICT';
  ELSIF octet_length(p_payload::text)>(b.ruleset->'drawing_limits'->>'max_body_bytes')::integer OR NOT private.valid_drawing(p_payload->'drawing',b.ruleset) THEN err:='INVALID_INPUT';
  ELSE
   SELECT v INTO spell FROM jsonb_array_elements(b.ruleset->'spells') v WHERE v->>'id'=p_payload->>'spell_id' AND a.spell_ids ? (v->>'id');
   IF spell IS NULL THEN err:='SPELL_NOT_AVAILABLE';
   ELSIF spell->>'rune_template_version' IS DISTINCT FROM p_payload->>'rune_template_version' THEN err:='RUNE_VERSION_MISMATCH';
   ELSIF a.cast_window_start+make_interval(secs=>(b.ruleset->>'cast_window_ms')::numeric/1000)>changed_at AND a.cast_window_count>=(b.ruleset->>'max_casts_per_window')::integer THEN err:='RATE_LIMITED';
   ELSIF a.mana<(spell->>'base_mana_cost')::integer THEN err:='INSUFFICIENT_MANA';
   ELSIF (a.cooldowns->>(spell->>'id'))::timestamptz>changed_at THEN err:='COOLDOWN_ACTIVE';
   ELSE
    recognition:=private.rune_recognition(p_payload->'drawing',spell,b.ruleset);recognized:=(recognition->>'recognized')::boolean;cast_id:=gen_random_uuid();effects:='[]';
    UPDATE private.battle_actors SET next_cast_sequence=next_cast_sequence+1,cast_window_start=CASE WHEN cast_window_start IS NULL OR cast_window_start+make_interval(secs=>(b.ruleset->>'cast_window_ms')::numeric/1000)<=changed_at THEN changed_at ELSE cast_window_start END,cast_window_count=CASE WHEN cast_window_start IS NULL OR cast_window_start+make_interval(secs=>(b.ruleset->>'cast_window_ms')::numeric/1000)<=changed_at THEN 1 ELSE cast_window_count+1 END WHERE battle_id=b.id AND actor_id=a.actor_id;
    UPDATE private.battles SET version=version+1 WHERE id=b.id RETURNING * INTO b;
    IF recognized THEN
     UPDATE private.battle_actors SET mana=mana-(spell->>'base_mana_cost')::integer,cooldowns=cooldowns||jsonb_build_object(spell->>'id',changed_at+make_interval(secs=>(spell->>'cooldown_ms')::numeric/1000)) WHERE battle_id=b.id AND actor_id=a.actor_id;
     effects:=private.combat_effect(b.id,a.actor_id,spell,(recognition->>'power_multiplier')::numeric);
    END IF;
    eid:=private.combat_event(b.id,CASE WHEN recognized THEN 'spell.resolved' ELSE 'spell.rejected' END,jsonb_build_object('cast_id',cast_id,'actor_id',a.actor_id,'spell_id',spell->>'id','effects',effects));
    result:=jsonb_build_object('id',cast_id,'battle_id',b.id,'client_cast_id',p_key,'client_sequence',a.next_cast_sequence,'actor_id',a.actor_id,'spell_id',spell->>'id','status',CASE WHEN recognized THEN 'applied' ELSE 'rejected' END,'rejection_code',CASE WHEN recognized THEN NULL ELSE 'RUNE_NOT_RECOGNIZED' END,'recognition',recognition,'mana_spent',CASE WHEN recognized THEN (spell->>'base_mana_cost')::integer ELSE 0 END,'effects',effects,'battle_version',b.version,'server_event_id',eid::text,'resolved_at',changed_at);
    INSERT INTO private.cast_receipts VALUES(cast_id,b.id,owner_id,p_key,result);
    IF EXISTS(SELECT 1 FROM private.battle_actors WHERE battle_id=b.id AND hp=0) THEN
     PERFORM private.finish_battle(b.id,CASE WHEN (SELECT hp FROM private.battle_actors WHERE battle_id=b.id AND actor_id='actor_b')=0 THEN 'actor_a' ELSE 'actor_b' END,'opponent_hp_depleted',false);
    END IF;
   END IF;
  END IF;
 END IF;
 IF err IS NOT NULL THEN RETURN jsonb_build_object('outcome',err,'data',NULL); END IF;
 INSERT INTO private.combat_receipts VALUES(owner_id,p_operation,p_key,request_hash,result);
 RETURN jsonb_build_object('outcome','OK','data',result);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL);
END $$;
REVOKE ALL ON FUNCTION public.combat_command(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.combat_command(text,uuid,uuid,jsonb) TO authenticated;

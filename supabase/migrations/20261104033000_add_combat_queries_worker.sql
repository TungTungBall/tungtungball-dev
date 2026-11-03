CREATE FUNCTION public.combat_query(p_operation text,p_resource_id uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE owner_id uuid:=auth.uid();r public.combat_rulesets;l public.spell_loadouts;t public.matchmaking_tickets;b private.battles;a private.battle_actors;
 result jsonb;rows jsonb;after_id bigint;next_id bigint;limit_value integer;boundary_time timestamptz;boundary_id uuid;last_item jsonb;cursor_value text;
BEGIN
 IF owner_id IS NULL THEN RETURN jsonb_build_object('outcome','UNAUTHORIZED','data',NULL); END IF;
 IF p_operation='spells' THEN
  SELECT * INTO r FROM public.combat_rulesets WHERE enabled;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','POLICY_NOT_CONFIGURED','data',NULL); END IF;
  SELECT jsonb_agg(jsonb_build_object('id',v->'id','display_name',v->'display_name','category',v->'category','target',v->'target','rune_template_version',v->'rune_template_version','guide',v->'guide','base_mana_cost',v->'base_mana_cost','cooldown_ms',v->'cooldown_ms','recognition_min_score',v->'recognition_min_score') ORDER BY v->>'id') INTO rows FROM jsonb_array_elements(r.document->'spells') v;
  result:=jsonb_build_object('ruleset_version',r.version,'drawing_limits',r.document->'drawing_limits','spells',rows);
 ELSIF p_operation='encounters' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'display_name',e.display_name,'ruleset_version',e.ruleset_version,'enabled',e.enabled) ORDER BY e.id),'[]') INTO rows
   FROM public.combat_encounters e JOIN public.combat_rulesets catalog_rule ON catalog_rule.version=e.ruleset_version AND catalog_rule.enabled WHERE e.enabled;
  result:=jsonb_build_object('items',rows);
 ELSIF p_operation='loadout' THEN
  IF NOT EXISTS(SELECT 1 FROM public.gems WHERE id=p_resource_id AND user_id=owner_id) THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
  SELECT * INTO l FROM public.spell_loadouts WHERE gem_id=p_resource_id AND user_id=owner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','POLICY_NOT_CONFIGURED','data',NULL); END IF;
  SELECT * INTO r FROM public.combat_rulesets WHERE version=l.ruleset_version;result:=private.loadout_wire(l,r.document);
 ELSIF p_operation IN ('ticket','current_ticket') THEN
  IF p_operation='ticket' THEN SELECT * INTO t FROM public.matchmaking_tickets WHERE id=p_resource_id AND user_id=owner_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;result:=private.ticket_wire(t);
  ELSE SELECT * INTO t FROM public.matchmaking_tickets WHERE user_id=owner_id AND (status='searching' OR (status='matched' AND EXISTS(SELECT 1 FROM private.battles WHERE id=battle_id AND status IN ('waiting_ready','active')))) ORDER BY created_at DESC,id DESC LIMIT 1;
   result:=jsonb_build_object('ticket',CASE WHEN t.id IS NOT NULL THEN private.ticket_wire(t) ELSE NULL END);
  END IF;
 ELSIF p_operation='current_battle' THEN
  SELECT battle_id INTO boundary_id FROM private.battle_actors WHERE user_id=owner_id AND active;
  result:=jsonb_build_object('battle',CASE WHEN boundary_id IS NOT NULL THEN private.battle_wire(boundary_id,owner_id) ELSE NULL END);
 ELSIF p_operation IN ('battle','result','cast','events','drawing_limits') THEN
  SELECT * INTO a FROM private.battle_actors WHERE battle_id=p_resource_id AND user_id=owner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
  SELECT * INTO b FROM private.battles WHERE id=p_resource_id;
  IF p_operation='battle' THEN result:=private.battle_wire(b.id,owner_id);
  ELSIF p_operation='drawing_limits' THEN result:=b.ruleset->'drawing_limits';
  ELSIF p_operation='result' THEN
   SELECT br.result INTO result FROM private.battle_results br WHERE battle_id=b.id AND user_id=owner_id;
   IF NOT FOUND THEN RETURN jsonb_build_object('outcome','BATTLE_NOT_FINISHED','data',NULL); END IF;
  ELSIF p_operation='cast' THEN
   SELECT cr.response INTO result FROM private.cast_receipts cr WHERE battle_id=b.id AND user_id=owner_id AND id=(p_payload->>'cast_id')::uuid;
   IF NOT FOUND THEN RETURN jsonb_build_object('outcome','RESOURCE_NOT_FOUND','data',NULL); END IF;
  ELSE
   IF p_payload->>'after_event_id' IS NULL OR (p_payload->>'after_event_id')!~'^(0|[1-9][0-9]*)$' THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
   after_id:=(p_payload->>'after_event_id')::bigint;
   IF after_id<b.first_event_id-1 THEN RETURN jsonb_build_object('outcome','EVENT_CURSOR_EXPIRED','data',NULL); END IF;
   IF after_id>b.last_event_id THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',event_id::text,'event',event_type,'data',data) ORDER BY event_id),'[]'),coalesce(max(event_id),after_id) INTO rows,next_id
    FROM (SELECT * FROM private.battle_events WHERE battle_id=b.id AND event_id>after_id AND event_id<=b.last_event_id ORDER BY event_id LIMIT (b.ruleset->>'event_batch_size')::integer) page;
   result:=jsonb_build_object('events',rows,'next_event_id',next_id::text,'terminal',b.status IN ('finished','cancelled') AND next_id=b.last_event_id,'poll_interval_ms',(b.ruleset->>'event_poll_interval_ms')::integer);
  END IF;
 ELSIF p_operation='records' THEN
  limit_value:=(p_payload->>'limit')::integer;
  IF limit_value IS NULL OR limit_value NOT BETWEEN 1 AND 50 OR (p_payload->>'mode' IS NOT NULL AND p_payload->>'mode' NOT IN ('pvp','pve')) THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
  IF p_payload->'cursor' IS NOT NULL AND p_payload->'cursor'<>'null'::jsonb THEN
   IF p_payload->'cursor'->>'owner' IS DISTINCT FROM owner_id::text OR p_payload->'cursor'->>'operation' IS DISTINCT FROM ('battles:'||coalesce(p_payload->>'mode','all')) THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
   boundary_time:=(p_payload->'cursor'->>'time')::timestamptz;boundary_id:=(p_payload->'cursor'->>'id')::uuid;
   IF boundary_time IS NULL OR boundary_id IS NULL THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
  END IF;
  SELECT coalesce(jsonb_agg(page.result),'[]') INTO rows FROM (SELECT br.result FROM private.battle_results br JOIN private.battles record_battle ON record_battle.id=br.battle_id WHERE br.user_id=owner_id AND (p_payload->>'mode' IS NULL OR record_battle.mode=p_payload->>'mode') AND (boundary_time IS NULL OR (record_battle.ended_at,record_battle.id)<(boundary_time,boundary_id)) ORDER BY record_battle.ended_at DESC,record_battle.id DESC LIMIT limit_value+1) page;
  IF jsonb_array_length(rows)>limit_value THEN
   rows:=rows-limit_value;last_item:=rows->(limit_value-1);
   cursor_value:=replace(rtrim(translate(encode(convert_to(jsonb_build_object('owner',owner_id,'operation','battles:'||coalesce(p_payload->>'mode','all'),'time',last_item->>'ended_at','id',last_item->>'battle_id')::text,'UTF8'),'base64'),'+/','-_'),'='),E'\n','');
  END IF;
  result:=jsonb_build_object('items',rows,'next_cursor',cursor_value,'has_more',cursor_value IS NOT NULL);
 ELSE RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL); END IF;
 RETURN jsonb_build_object('outcome','OK','data',result);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format THEN RETURN jsonb_build_object('outcome','INVALID_INPUT','data',NULL);
END $$;
REVOKE ALL ON FUNCTION public.combat_query(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.combat_query(text,uuid,jsonb) TO authenticated;
CREATE FUNCTION public.combat_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE t public.matchmaking_tickets;b private.battles;npc private.battle_actors;spell jsonb;effects jsonb;changed_at timestamptz:=clock_timestamp();
BEGIN
 PERFORM pg_advisory_xact_lock(35353535);changed_at:=clock_timestamp();
 FOR t IN SELECT mt.* FROM public.matchmaking_tickets mt JOIN public.combat_rulesets r ON r.version=mt.ruleset_version WHERE mt.status='searching' AND mt.created_at+make_interval(secs=>(r.document->>'match_timeout_ms')::numeric/1000)<=changed_at FOR UPDATE OF mt LOOP
  UPDATE public.matchmaking_tickets SET status='expired',version=version+1,updated_at=changed_at WHERE id=t.id;
  UPDATE public.gems SET availability='available' WHERE id=t.gem_id AND user_id=t.user_id AND availability='reserved';
 END LOOP;
 FOR b IN SELECT * FROM private.battles WHERE status IN ('waiting_ready','active') ORDER BY id FOR UPDATE LOOP
  IF b.status='waiting_ready' AND b.created_at+make_interval(secs=>(b.ruleset->>'ready_timeout_ms')::numeric/1000)<=changed_at THEN PERFORM private.finish_battle(b.id,NULL,'ready_timeout',true);
  ELSIF b.status='active' AND b.started_at+make_interval(secs=>(b.ruleset->>'battle_timeout_ms')::numeric/1000)<=changed_at THEN
   PERFORM private.finish_battle(b.id,CASE WHEN b.mode='pve' AND b.ruleset->>'battle_timeout_outcome'='pve_loss' THEN 'actor_b' ELSE NULL END,'time_limit',false);
  ELSIF b.status='active' AND b.mode='pve' AND b.npc_next_action_at<=changed_at THEN
   SELECT * INTO npc FROM private.battle_actors WHERE battle_id=b.id AND kind='npc';
   SELECT v INTO spell FROM jsonb_array_elements(b.ruleset->'spells') v WHERE v->>'id'=b.encounter->'actions'->>(b.npc_action_index%jsonb_array_length(b.encounter->'actions'));
   IF spell IS NULL THEN RAISE EXCEPTION 'invalid encounter spell'; END IF;
   UPDATE private.battles SET npc_action_index=npc_action_index+1,npc_next_action_at=changed_at+make_interval(secs=>(encounter->>'action_interval_ms')::numeric/1000) WHERE id=b.id;
   IF npc.mana>=(spell->>'base_mana_cost')::integer AND coalesce((npc.cooldowns->>(spell->>'id'))::timestamptz,'-infinity')<=changed_at THEN
    UPDATE private.battles SET version=version+1 WHERE id=b.id;
    UPDATE private.battle_actors SET mana=mana-(spell->>'base_mana_cost')::integer,cooldowns=cooldowns||jsonb_build_object(spell->>'id',changed_at+make_interval(secs=>(spell->>'cooldown_ms')::numeric/1000)) WHERE battle_id=b.id AND kind='npc';
    effects:=private.combat_effect(b.id,npc.actor_id,spell,1);
    PERFORM private.combat_event(b.id,'spell.resolved',jsonb_build_object('actor_id',npc.actor_id,'spell_id',spell->>'id','effects',effects));
    IF EXISTS(SELECT 1 FROM private.battle_actors WHERE battle_id=b.id AND hp=0) THEN PERFORM private.finish_battle(b.id,CASE WHEN (SELECT hp FROM private.battle_actors WHERE battle_id=b.id AND actor_id='actor_a')=0 THEN 'actor_b' ELSE 'actor_a' END,'opponent_hp_depleted',false); END IF;
   END IF;
  END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.combat_tick() FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN GRANT EXECUTE ON FUNCTION public.combat_tick() TO service_role; END IF;END $$;
-- 버전을 고정한 뒤 사용 중인 규칙 문서가 바뀌어 경기/카탈로그가 어긋나지 않게 한다.
CREATE FUNCTION private.check_combat_configuration() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE spell jsonb;stroke jsonb;p jsonb;band jsonb;field text;drawing jsonb;points jsonb;strokes jsonb;doc jsonb;
BEGIN
 IF TG_TABLE_NAME='combat_encounters' THEN
  IF NEW.enabled THEN
   doc:=NEW.configuration;
   IF NOT coalesce(doc ?& ARRAY['hp','mana','action_interval_ms','actions'],false) OR jsonb_typeof(doc->'hp') IS DISTINCT FROM 'number' OR (doc->>'hp')!~'^[1-9][0-9]*$'
    OR jsonb_typeof(doc->'mana') IS DISTINCT FROM 'number' OR (doc->>'mana')!~'^[0-9]+$' OR jsonb_typeof(doc->'action_interval_ms') IS DISTINCT FROM 'number' OR (doc->>'action_interval_ms')!~'^[1-9][0-9]*$'
    OR jsonb_typeof(doc->'actions') IS DISTINCT FROM 'array' OR jsonb_array_length(doc->'actions')=0 THEN RAISE EXCEPTION 'invalid encounter policy'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(doc->'actions') action WHERE jsonb_typeof(action)<>'string' OR NOT EXISTS(SELECT 1 FROM public.combat_rulesets r,jsonb_array_elements(r.document->'spells') s WHERE r.version=NEW.ruleset_version AND s->'id'=action)) THEN RAISE EXCEPTION 'unknown encounter action'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND NEW.document<>OLD.document AND (EXISTS(SELECT 1 FROM private.battles WHERE ruleset_version=OLD.version) OR EXISTS(SELECT 1 FROM public.spell_loadouts WHERE ruleset_version=OLD.version)) THEN RAISE EXCEPTION 'used ruleset is immutable'; END IF;
 IF NOT NEW.enabled THEN RETURN NEW; END IF;
 doc:=NEW.document;
 FOREACH field IN ARRAY ARRAY['command_order','match_selector','recognition_algorithm','size_metric','power_band_policy','mana_regeneration','unlock_policy','npc_catchup','battle_timeout_outcome'] LOOP
  IF jsonb_typeof(doc->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid ruleset field'; END IF;
 END LOOP;
 FOR spell IN SELECT * FROM jsonb_array_elements(doc->'spells') LOOP
  FOREACH field IN ARRAY ARRAY['id','display_name','category','target','rune_template_version'] LOOP
   IF jsonb_typeof(spell->field) IS DISTINCT FROM 'string' OR btrim(spell->>field)='' THEN RAISE EXCEPTION 'invalid spell text'; END IF;
  END LOOP;
  FOREACH field IN ARRAY ARRAY['base_mana_cost','cooldown_ms','recognition_min_score','base_amount'] LOOP
   IF jsonb_typeof(spell->field) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid spell number'; END IF;
  END LOOP;
  strokes:='[]';
  FOR stroke IN SELECT * FROM jsonb_array_elements(spell->'template') LOOP
   points:='[]';
   FOR p IN SELECT * FROM jsonb_array_elements(stroke->'points') LOOP points:=points||jsonb_build_array(p||jsonb_build_object('t_ms',0)); END LOOP;
   strokes:=strokes||jsonb_build_array(jsonb_build_object('points',points));
  END LOOP;
  drawing:=jsonb_build_object('canvas_width',1,'canvas_height',1,'strokes',strokes);
  IF NOT private.valid_drawing(drawing,doc) THEN RAISE EXCEPTION 'invalid rune template'; END IF;
  FOR band IN SELECT * FROM jsonb_array_elements(spell->'power_bands') LOOP
   FOREACH field IN ARRAY ARRAY['min_accuracy','max_accuracy','min_size','max_size','multiplier'] LOOP
    IF jsonb_typeof(band->field) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'invalid power band'; END IF;
   END LOOP;
   IF (band->>'min_accuracy')::numeric NOT BETWEEN 0 AND (band->>'max_accuracy')::numeric OR (band->>'max_accuracy')::numeric>1
    OR (band->>'min_size')::numeric NOT BETWEEN 0 AND (band->>'max_size')::numeric OR (band->>'max_size')::numeric>1
    OR (band->>'multiplier')::numeric NOT BETWEEN 0 AND (doc->>'max_power_multiplier')::numeric THEN RAISE EXCEPTION 'invalid power bound'; END IF;
  END LOOP;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.check_combat_configuration() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER combat_rules_guard BEFORE INSERT OR UPDATE ON public.combat_rulesets FOR EACH ROW EXECUTE FUNCTION private.check_combat_configuration();
CREATE TRIGGER combat_encounter_guard BEFORE INSERT OR UPDATE ON public.combat_encounters FOR EACH ROW EXECUTE FUNCTION private.check_combat_configuration();

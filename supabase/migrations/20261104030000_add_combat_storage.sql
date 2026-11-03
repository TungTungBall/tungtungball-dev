-- 운영 ruleset/적/문양은 이 마이그레이션으로 확정하지 않는다. 카탈로그는 기본 비활성·무시드다.
CREATE TABLE public.combat_rulesets(version text PRIMARY KEY CHECK(btrim(version)<>''),document jsonb NOT NULL,enabled boolean NOT NULL DEFAULT false);
CREATE UNIQUE INDEX combat_one_enabled_ruleset ON public.combat_rulesets(enabled) WHERE enabled;
CREATE TABLE public.combat_encounters(id text PRIMARY KEY,display_name text NOT NULL,ruleset_version text NOT NULL REFERENCES public.combat_rulesets(version),configuration jsonb NOT NULL,enabled boolean NOT NULL DEFAULT false);
CREATE TABLE public.spell_loadouts(gem_id uuid PRIMARY KEY REFERENCES public.gems(id),user_id uuid NOT NULL REFERENCES auth.users(id),version bigint NOT NULL DEFAULT 1 CHECK(version>0),ruleset_version text NOT NULL REFERENCES public.combat_rulesets(version),spell_ids jsonb NOT NULL);
CREATE TABLE private.battles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mode text NOT NULL CHECK(mode IN ('pvp','pve')),status text NOT NULL CHECK(status IN ('waiting_ready','active','finished','cancelled')),
 ruleset_version text NOT NULL,ruleset jsonb NOT NULL,encounter jsonb,version bigint NOT NULL DEFAULT 1,last_event_id bigint NOT NULL DEFAULT 0,first_event_id bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz,ended_at timestamptz,npc_next_action_at timestamptz,npc_action_index integer NOT NULL DEFAULT 0,
 CHECK(version>0 AND last_event_id>=0 AND first_event_id>0),CHECK((status IN ('finished','cancelled'))=(ended_at IS NOT NULL)));
CREATE TABLE private.battle_actors(battle_id uuid NOT NULL REFERENCES private.battles(id),actor_id text NOT NULL,user_id uuid REFERENCES auth.users(id),kind text NOT NULL CHECK(kind IN ('player','npc')),gem_id uuid REFERENCES public.gems(id),
 ready boolean NOT NULL DEFAULT false,hp integer,mana integer,shield integer NOT NULL DEFAULT 0,next_cast_sequence bigint NOT NULL DEFAULT 1,spell_ids jsonb NOT NULL,cast_window_start timestamptz,cast_window_count integer NOT NULL DEFAULT 0,cooldowns jsonb NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(battle_id,actor_id),CHECK(next_cast_sequence>0 AND shield>=0 AND (hp IS NULL OR hp>=0) AND (mana IS NULL OR mana>=0)),CHECK((kind='player')=(user_id IS NOT NULL AND gem_id IS NOT NULL)));
CREATE UNIQUE INDEX combat_one_active_user ON private.battle_actors(user_id) WHERE active AND user_id IS NOT NULL;
CREATE UNIQUE INDEX combat_one_active_gem ON private.battle_actors(gem_id) WHERE active AND gem_id IS NOT NULL;
CREATE TABLE public.matchmaking_tickets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users(id),gem_id uuid NOT NULL REFERENCES public.gems(id),version bigint NOT NULL DEFAULT 1,status text NOT NULL CHECK(status IN ('searching','matched','cancelled','expired')),battle_id uuid REFERENCES private.battles(id),ruleset_version text NOT NULL REFERENCES public.combat_rulesets(version),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(version>0),CHECK((status='matched')=(battle_id IS NOT NULL)));
CREATE UNIQUE INDEX combat_one_searching_user ON public.matchmaking_tickets(user_id) WHERE status='searching';
CREATE UNIQUE INDEX combat_one_searching_gem ON public.matchmaking_tickets(gem_id) WHERE status='searching';
CREATE TABLE private.combat_receipts(user_id uuid NOT NULL REFERENCES auth.users(id),operation text NOT NULL,request_key uuid NOT NULL,request_hash text NOT NULL,response jsonb NOT NULL,PRIMARY KEY(user_id,operation,request_key));
CREATE TABLE private.cast_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),battle_id uuid NOT NULL REFERENCES private.battles(id),user_id uuid NOT NULL REFERENCES auth.users(id),client_cast_id uuid NOT NULL,response jsonb NOT NULL,UNIQUE(user_id,client_cast_id));
CREATE TABLE private.battle_events(battle_id uuid NOT NULL REFERENCES private.battles(id),event_id bigint NOT NULL,event_type text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(battle_id,event_id));
CREATE TABLE private.battle_results(battle_id uuid NOT NULL REFERENCES private.battles(id),user_id uuid NOT NULL REFERENCES auth.users(id),result jsonb NOT NULL,PRIMARY KEY(battle_id,user_id));
REVOKE ALL ON private.battles,private.battle_actors,private.combat_receipts,private.cast_receipts,private.battle_events,private.battle_results FROM PUBLIC,anon,authenticated;
ALTER TABLE public.combat_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spell_loadouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matchmaking_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.combat_rulesets,public.combat_encounters,public.spell_loadouts,public.matchmaking_tickets FROM PUBLIC,anon,authenticated;
-- 카탈로그의 내부 판정 템플릿은 공개 테이블 SELECT로 내보내지 않고 projection RPC만 사용한다.
GRANT SELECT ON public.spell_loadouts,public.matchmaking_tickets TO authenticated;
CREATE POLICY loadout_owner ON public.spell_loadouts FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY ticket_owner ON public.matchmaking_tickets FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));

CREATE FUNCTION private.valid_combat_rules(document jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE k text;s jsonb;ids text[]:='{}';
BEGIN
 IF NOT coalesce(document ?& ARRAY['command_order','match_selector','recognition_algorithm','size_metric','power_band_policy','mana_regeneration','unlock_policy','npc_catchup','initial_hp','initial_mana','slot_limit','samples_per_stroke','match_timeout_ms','ready_timeout_ms','battle_timeout_ms','event_poll_interval_ms','event_batch_size','max_effect_amount','max_canvas_dimension','max_casts_per_window','cast_window_ms','distance_scale','max_power_multiplier','spells','default_spell_ids','battle_timeout_outcome','drawing_limits'],false) THEN RETURN false; END IF;
 IF jsonb_typeof(document->'distance_scale') IS DISTINCT FROM 'number' OR jsonb_typeof(document->'max_power_multiplier') IS DISTINCT FROM 'number' THEN RETURN false; END IF;
 IF jsonb_typeof(document) IS DISTINCT FROM 'object' OR document->>'command_order'<>'serialized' OR document->>'match_selector'<>'fifo'
  OR document->>'recognition_algorithm'<>'ordered_path_v1' OR document->>'size_metric'<>'bounding_box_area' OR document->>'power_band_policy'<>'first_match'
  OR document->>'mana_regeneration'<>'none' OR document->>'unlock_policy'<>'all_catalog_spells' OR document->>'npc_catchup'<>'skip_missed' THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['initial_hp','initial_mana','slot_limit','samples_per_stroke','match_timeout_ms','ready_timeout_ms','battle_timeout_ms','event_poll_interval_ms','event_batch_size','max_effect_amount','max_canvas_dimension','max_casts_per_window','cast_window_ms'] LOOP
  IF jsonb_typeof(document->k) IS DISTINCT FROM 'number' OR (document->>k)!~'^[1-9][0-9]*$' OR (document->>k)::numeric>2147483647 THEN RETURN false; END IF;
 END LOOP;
 IF (document->>'samples_per_stroke')::integer<2 OR (document->>'distance_scale')::numeric<=0 OR (document->>'max_power_multiplier')::numeric<0
  OR jsonb_typeof(document->'spells') IS DISTINCT FROM 'array' OR jsonb_array_length(document->'spells')=0
  OR jsonb_typeof(document->'default_spell_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(document->'default_spell_ids')=0
  OR jsonb_array_length(document->'default_spell_ids')>(document->>'slot_limit')::integer
  OR document->>'battle_timeout_outcome' NOT IN ('draw','pve_loss') THEN RETURN false; END IF;
 FOREACH k IN ARRAY ARRAY['max_strokes','max_points_per_cast','max_duration_ms','max_body_bytes'] LOOP
  IF jsonb_typeof(document->'drawing_limits'->k) IS DISTINCT FROM 'number' OR (document->'drawing_limits'->>k)!~'^[1-9][0-9]*$' THEN RETURN false; END IF;
 END LOOP;
 FOR s IN SELECT * FROM jsonb_array_elements(document->'spells') LOOP
  IF NOT coalesce(s ?& ARRAY['id','display_name','category','target','rune_template_version','guide','template','recognition_min_score','base_mana_cost','cooldown_ms','base_amount','power_bands'],false) THEN RETURN false; END IF;
  IF coalesce(btrim(s->>'id'),'')='' OR s->>'id'=ANY(ids) OR coalesce(btrim(s->>'display_name'),'')='' OR s->>'category' NOT IN ('attack','heal','defense')
   OR s->>'target' NOT IN ('self','opponent') OR coalesce(btrim(s->>'rune_template_version'),'')=''
   OR jsonb_typeof(s->'guide') IS DISTINCT FROM 'object' OR jsonb_typeof(s->'template') IS DISTINCT FROM 'array'
   OR jsonb_array_length(s->'template')=0 OR (s->>'recognition_min_score')::numeric NOT BETWEEN 0 AND 1
   OR (s->>'base_mana_cost')!~'^[0-9]+$' OR (s->>'cooldown_ms')!~'^[0-9]+$' OR (s->>'base_amount')!~'^[0-9]+$'
   OR jsonb_typeof(s->'power_bands') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'power_bands')=0 THEN RETURN false; END IF;
  ids:=array_append(ids,s->>'id');
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(document->'default_spell_ids') id WHERE NOT(id=ANY(ids)))
  OR (SELECT count(*)<>count(DISTINCT v) FROM jsonb_array_elements_text(document->'default_spell_ids') v) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION private.valid_combat_rules(jsonb) FROM PUBLIC,anon,authenticated;
ALTER TABLE public.combat_rulesets ADD CHECK(NOT enabled OR private.valid_combat_rules(document) IS TRUE);
CREATE FUNCTION private.ticket_wire(t public.matchmaking_tickets) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT to_jsonb(t)-ARRAY['user_id','ruleset_version'] $$;
CREATE FUNCTION private.loadout_wire(l public.spell_loadouts,rules jsonb) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$ SELECT (to_jsonb(l)-'user_id')||jsonb_build_object('slot_limit',rules->'slot_limit') $$;
CREATE FUNCTION private.battle_wire(p_id uuid,p_user uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',b.id,'mode',b.mode,'status',b.status,'self_actor_id',self.actor_id,'ruleset_version',b.ruleset_version,'version',b.version,'last_event_id',b.last_event_id::text,'next_cast_sequence',self.next_cast_sequence,
 'participants',(SELECT jsonb_agg(jsonb_build_object('actor_id',a.actor_id,'kind',a.kind,'gem_id',a.gem_id,'ready',a.ready,'hp',a.hp,'mana',a.mana) ORDER BY a.actor_id) FROM private.battle_actors a WHERE a.battle_id=b.id),'started_at',b.started_at,'ended_at',b.ended_at)
 FROM private.battles b JOIN private.battle_actors self ON self.battle_id=b.id AND self.user_id=p_user WHERE b.id=p_id;
$$;
CREATE FUNCTION private.combat_event(p_id uuid,p_type text,p_data jsonb) RETURNS bigint LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b private.battles;
BEGIN
 UPDATE private.battles SET last_event_id=last_event_id+1 WHERE id=p_id RETURNING * INTO b;
 INSERT INTO private.battle_events VALUES(b.id,b.last_event_id,p_type,jsonb_build_object('battle_id',b.id,'battle_version',b.version,'server_time',clock_timestamp())||p_data);
 RETURN b.last_event_id;
END $$;
CREATE FUNCTION private.finish_battle(p_id uuid,p_winner text,p_reason text,p_cancel boolean) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b private.battles;a private.battle_actors;eid bigint;
BEGIN
 SELECT * INTO b FROM private.battles WHERE id=p_id FOR UPDATE;
 IF b.status NOT IN ('waiting_ready','active') THEN RETURN; END IF;
 UPDATE private.battles SET status=CASE WHEN p_cancel THEN 'cancelled' ELSE 'finished' END,ended_at=clock_timestamp(),version=version+1 WHERE id=p_id RETURNING * INTO b;
 eid:=private.combat_event(p_id,CASE WHEN p_cancel THEN 'battle.cancelled' ELSE 'battle.finished' END,jsonb_build_object('winner_actor_id',p_winner,'reason',p_reason));
 FOR a IN SELECT * FROM private.battle_actors WHERE battle_id=p_id LOOP
  IF a.user_id IS NOT NULL THEN
   INSERT INTO private.battle_results VALUES(p_id,a.user_id,jsonb_build_object('battle_id',p_id,'mode',b.mode,'outcome',CASE WHEN p_cancel THEN 'cancelled' WHEN p_winner IS NULL THEN 'draw' WHEN a.actor_id=p_winner THEN 'win' ELSE 'loss' END,'reason',p_reason,'gem_id',a.gem_id,'started_at',b.started_at,'ended_at',b.ended_at,'final_event_id',eid::text));
   UPDATE public.gems SET availability='available' WHERE id=a.gem_id AND user_id=a.user_id;
  END IF;
 END LOOP;
 UPDATE private.battle_actors SET active=false WHERE battle_id=p_id;
END $$;
CREATE FUNCTION private.make_battle(p_mode text,p_ruleset text,p_a public.matchmaking_tickets,p_b public.matchmaking_tickets,p_encounter jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE id uuid;r jsonb;l public.spell_loadouts;
BEGIN
 SELECT document INTO r FROM public.combat_rulesets WHERE version=p_ruleset AND enabled;
 INSERT INTO private.battles(mode,status,ruleset_version,ruleset,encounter) VALUES(p_mode,'waiting_ready',p_ruleset,r,p_encounter) RETURNING private.battles.id INTO id;
 SELECT * INTO l FROM public.spell_loadouts WHERE gem_id=(p_a).gem_id;
 INSERT INTO private.battle_actors(battle_id,actor_id,user_id,kind,gem_id,spell_ids) VALUES(id,'actor_a',(p_a).user_id,'player',(p_a).gem_id,l.spell_ids);
 IF p_mode='pvp' THEN
  SELECT * INTO l FROM public.spell_loadouts WHERE gem_id=(p_b).gem_id;
  INSERT INTO private.battle_actors(battle_id,actor_id,user_id,kind,gem_id,spell_ids) VALUES(id,'actor_b',(p_b).user_id,'player',(p_b).gem_id,l.spell_ids);
 ELSE INSERT INTO private.battle_actors(battle_id,actor_id,kind,ready,spell_ids) VALUES(id,'actor_b','npc',true,'[]'); END IF;
 UPDATE public.gems SET availability='battle_locked' WHERE public.gems.id IN ((p_a).gem_id,(p_b).gem_id);
 RETURN id;
END $$;
REVOKE ALL ON FUNCTION private.ticket_wire(public.matchmaking_tickets),private.loadout_wire(public.spell_loadouts,jsonb),private.battle_wire(uuid,uuid),private.combat_event(uuid,text,jsonb),private.finish_battle(uuid,text,text,boolean),private.make_battle(text,text,public.matchmaking_tickets,public.matchmaking_tickets,jsonb) FROM PUBLIC,anon,authenticated;

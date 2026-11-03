CREATE FUNCTION private.valid_drawing(d jsonb,r jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE stroke jsonb;p jsonb;previous_t bigint:=0;total integer:=0;
BEGIN
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR (d-ARRAY['canvas_width','canvas_height','strokes'])<>'{}'::jsonb
  OR jsonb_typeof(d->'canvas_width') IS DISTINCT FROM 'number' OR jsonb_typeof(d->'canvas_height') IS DISTINCT FROM 'number'
  OR (d->>'canvas_width')!~'^[1-9][0-9]*$' OR (d->>'canvas_height')!~'^[1-9][0-9]*$'
  OR (d->>'canvas_width')::numeric>(r->>'max_canvas_dimension')::numeric OR (d->>'canvas_height')::numeric>(r->>'max_canvas_dimension')::numeric
  OR jsonb_typeof(d->'strokes') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'strokes') NOT BETWEEN 1 AND (r->'drawing_limits'->>'max_strokes')::integer THEN RETURN false; END IF;
 FOR stroke IN SELECT * FROM jsonb_array_elements(d->'strokes') LOOP
  IF jsonb_typeof(stroke) IS DISTINCT FROM 'object' OR (stroke-'points')<>'{}'::jsonb OR jsonb_typeof(stroke->'points') IS DISTINCT FROM 'array' OR jsonb_array_length(stroke->'points')<2 THEN RETURN false; END IF;
  total:=total+jsonb_array_length(stroke->'points');
  IF total>(r->'drawing_limits'->>'max_points_per_cast')::integer THEN RETURN false; END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(stroke->'points') LOOP
   IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (p-ARRAY['x','y','t_ms'])<>'{}'::jsonb OR jsonb_typeof(p->'x') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'y') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'t_ms') IS DISTINCT FROM 'number'
    OR (p->>'x')::numeric NOT BETWEEN 0 AND 1 OR (p->>'y')::numeric NOT BETWEEN 0 AND 1 OR (p->>'t_ms')!~'^[0-9]+$'
    OR (p->>'t_ms')::numeric<previous_t OR (p->>'t_ms')::numeric>(r->'drawing_limits'->>'max_duration_ms')::numeric THEN RETURN false; END IF;
   previous_t:=(p->>'t_ms')::bigint;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION private.resample_rune(points jsonb,n integer,w numeric,h numeric) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE xs numeric[]:='{}';ys numeric[]:='{}';ds numeric[]:='{}';p jsonb;count integer:=0;length numeric:=0;target numeric;at integer:=2;ratio numeric;result jsonb:='[]';x numeric;y numeric;
BEGIN
 FOR p IN SELECT * FROM jsonb_array_elements(points) LOOP
  count:=count+1;x:=(p->>'x')::numeric*w;y:=(p->>'y')::numeric*h;xs:=array_append(xs,x);ys:=array_append(ys,y);
  IF count>1 THEN length:=length+sqrt(power(x-xs[count-1],2)+power(y-ys[count-1],2)); END IF;ds:=array_append(ds,length);
 END LOOP;
 IF count<2 OR length=0 OR n<2 THEN RETURN NULL; END IF;
 FOR i IN 0..n-1 LOOP
  target:=length*i/(n-1);
  WHILE at<count AND ds[at]<target LOOP at:=at+1; END LOOP;
  ratio:=CASE WHEN ds[at]=ds[at-1] THEN 0 ELSE (target-ds[at-1])/(ds[at]-ds[at-1]) END;
  result:=result||jsonb_build_array(jsonb_build_object('x',xs[at-1]+ratio*(xs[at]-xs[at-1]),'y',ys[at-1]+ratio*(ys[at]-ys[at-1])));
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION private.rune_recognition(d jsonb,spell jsonb,r jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE a jsonb;b jsonb;all_a jsonb:='[]';all_b jsonb:='[]';pa jsonb;pb jsonb;band jsonb;n integer:=(r->>'samples_per_stroke')::integer;
 minax numeric;maxax numeric;minay numeric;maxay numeric;minbx numeric;maxbx numeric;minby numeric;maxby numeric;scalea numeric;scaleb numeric;
 dx numeric;dy numeric;distance numeric:=0;accuracy numeric:=0;size numeric:=0;multiplier numeric:=0;matched boolean:=false;recognized boolean:=false;
BEGIN
 IF jsonb_array_length(d->'strokes')<>jsonb_array_length(spell->'template') THEN RETURN jsonb_build_object('recognized',false,'accuracy',0,'normalized_size',0,'power_multiplier',0); END IF;
 FOR i IN 0..jsonb_array_length(d->'strokes')-1 LOOP
  a:=private.resample_rune(d->'strokes'->i->'points',n,(d->>'canvas_width')::numeric,(d->>'canvas_height')::numeric);
  b:=private.resample_rune(spell->'template'->i->'points',n,1,1);
  IF a IS NULL OR b IS NULL THEN RETURN jsonb_build_object('recognized',false,'accuracy',0,'normalized_size',0,'power_multiplier',0); END IF;
  all_a:=all_a||a;all_b:=all_b||b;
 END LOOP;
 SELECT min((p->>'x')::numeric),max((p->>'x')::numeric),min((p->>'y')::numeric),max((p->>'y')::numeric) INTO minax,maxax,minay,maxay FROM jsonb_array_elements(all_a) p;
 SELECT min((p->>'x')::numeric),max((p->>'x')::numeric),min((p->>'y')::numeric),max((p->>'y')::numeric) INTO minbx,maxbx,minby,maxby FROM jsonb_array_elements(all_b) p;
 scalea:=greatest(maxax-minax,maxay-minay);scaleb:=greatest(maxbx-minbx,maxby-minby);
 IF scalea=0 OR scaleb=0 THEN RETURN jsonb_build_object('recognized',false,'accuracy',0,'normalized_size',0,'power_multiplier',0); END IF;
 size:=least(1,greatest(0,(maxax-minax)*(maxay-minay)/((d->>'canvas_width')::numeric*(d->>'canvas_height')::numeric)));
 FOR i IN 0..jsonb_array_length(all_a)-1 LOOP
  pa:=all_a->i;pb:=all_b->i;
  dx:=((pa->>'x')::numeric-(maxax+minax)/2)/scalea-((pb->>'x')::numeric-(maxbx+minbx)/2)/scaleb;
  dy:=((pa->>'y')::numeric-(maxay+minay)/2)/scalea-((pb->>'y')::numeric-(maxby+minby)/2)/scaleb;
  distance:=distance+sqrt(dx*dx+dy*dy);
 END LOOP;
 accuracy:=least(1,greatest(0,1-distance/jsonb_array_length(all_a)/(r->>'distance_scale')::numeric));
 FOR band IN SELECT * FROM jsonb_array_elements(spell->'power_bands') LOOP
  IF accuracy BETWEEN (band->>'min_accuracy')::numeric AND (band->>'max_accuracy')::numeric AND size BETWEEN (band->>'min_size')::numeric AND (band->>'max_size')::numeric THEN
   multiplier:=least((r->>'max_power_multiplier')::numeric,greatest(0,(band->>'multiplier')::numeric));matched:=true;EXIT;
  END IF;
 END LOOP;
 recognized:=accuracy>=(spell->>'recognition_min_score')::numeric AND matched;
 RETURN jsonb_build_object('recognized',recognized,'accuracy',accuracy,'normalized_size',size,'power_multiplier',CASE WHEN recognized THEN multiplier ELSE 0 END);
END $$;
CREATE FUNCTION private.combat_effect(p_id uuid,p_actor text,p_spell jsonb,p_multiplier numeric) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b private.battles;target private.battle_actors;target_id text;amount integer;actual integer;absorbed integer;
BEGIN
 SELECT * INTO b FROM private.battles WHERE id=p_id;
 target_id:=CASE WHEN p_spell->>'target'='self' THEN p_actor WHEN p_actor='actor_a' THEN 'actor_b' ELSE 'actor_a' END;
 SELECT * INTO target FROM private.battle_actors WHERE battle_id=p_id AND actor_id=target_id;
 amount:=least((b.ruleset->>'max_effect_amount')::numeric,floor((p_spell->>'base_amount')::numeric*p_multiplier))::integer;
 IF p_spell->>'category'='attack' THEN
  absorbed:=least(target.shield,amount);actual:=least(target.hp,amount-absorbed);
  UPDATE private.battle_actors SET hp=hp-actual,shield=shield-absorbed WHERE battle_id=p_id AND actor_id=target_id;
 ELSIF p_spell->>'category'='heal' THEN
  actual:=least(amount,(CASE WHEN target.kind='npc' THEN b.encounter->>'hp' ELSE b.ruleset->>'initial_hp' END)::integer-target.hp);
  UPDATE private.battle_actors SET hp=hp+actual WHERE battle_id=p_id AND actor_id=target_id;
 ELSIF p_spell->>'category'='defense' THEN
  actual:=least(amount,(b.ruleset->>'max_effect_amount')::integer-target.shield);
  UPDATE private.battle_actors SET shield=shield+actual WHERE battle_id=p_id AND actor_id=target_id;
 ELSE RAISE EXCEPTION 'unsupported effect'; END IF;
 RETURN jsonb_build_array(jsonb_build_object('kind',CASE p_spell->>'category' WHEN 'attack' THEN 'damage' WHEN 'heal' THEN 'heal' ELSE 'shield' END,'target_actor_id',target_id,'amount',actual));
END $$;
REVOKE ALL ON FUNCTION private.valid_drawing(jsonb,jsonb),private.resample_rune(jsonb,integer,numeric,numeric),private.rune_recognition(jsonb,jsonb,jsonb),private.combat_effect(uuid,text,jsonb,numeric) FROM PUBLIC,anon,authenticated;

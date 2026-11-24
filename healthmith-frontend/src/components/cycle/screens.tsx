"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {cycleCall} from "./actions";
import {type Request,type Session,type Profile,type KeywordPreview,keywordLabels} from "./contract";
import {loadWorkout} from "@/app/(experience)/workout/actions";
import {loadDetailedSurvey} from "@/app/survey/detailed-actions";
import {type IntakeDetail,fromIntakeAnswers} from "@/lib/healthmith/intake-contract";
import {PoseCamera} from "@/components/healthmith/pose-camera";
import {InputOptions} from "@/components/healthmith/input-options";
import {Gem} from "@/components/healthmith/gem";

const cameraRule={method:"frontal-pushup"} as const;
const noRepetition=()=>{};
function useCommand(){
  const [busy,setBusy]=useState(false),[message,setMessage]=useState<string|null>(null),[uncertain,setUncertain]=useState(false);
  const flight=useRef(false),pending=useRef<{op:string;id:string|null;body:unknown;key:string}|null>(null);
  const execute=useCallback(async(op:string,id:string|null,body:unknown)=>{
    if(flight.current)return null;
    const attempt=pending.current??{op,id,body,key:crypto.randomUUID()};
    if(pending.current&&(attempt.op!==op||attempt.id!==id)){setMessage("먼저 이전 요청의 결과를 다시 확인해 주세요.");return null;}
    pending.current=attempt;flight.current=true;setBusy(true);
    try{const result=await cycleCall(attempt.op,attempt.id,attempt.body,attempt.key);
      if(result.ok){pending.current=null;setUncertain(false);setMessage(null);return result.data;}
      setMessage(result.message);setUncertain(result.uncertain);if(!result.uncertain)pending.current=null;return null;
    }finally{flight.current=false;setBusy(false);}
  },[]);
  const retry=()=>pending.current?execute(pending.current.op,pending.current.id,pending.current.body):Promise.resolve(null);
  return {busy,message,uncertain,execute,retry};
}
function ErrorNote({message}:{message:string|null}){return message?<p role="alert" className="hm-error">{message} <Link href="/login">로그인</Link></p>:null;}
export function CycleHome(){
  const router=useRouter(),command=useCommand();
  const [legacy,setLegacy]=useState<string|null>(null),[survey,setSurvey]=useState<IntakeDetail|null>(null),[active,setActive]=useState<Session|null>(null),[request,setRequest]=useState<Request|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState<string|null>(null),[condition,setCondition]=useState("recommended");
  useEffect(()=>{let alive=true;Promise.all([loadDetailedSurvey(),cycleCall("active"),cycleCall("latest-request"),loadWorkout()]).then(([a,b,c,d])=>{if(!alive)return;if(a.state==="saved")setSurvey(a.submission);else if(a.state!=="not-found")setNotice(a.message);if(b.ok)setActive(b.data as Session|null);else setNotice(b.message);if(c.ok)setRequest(c.data as Request|null);if(d.state==="ok"&&d.data.session)setLegacy(d.data.session.id);setLoading(false);});return()=>{alive=false;};},[]);
  const input=survey?fromIntakeAnswers(survey.answers):null;
  async function generate(){if(!survey)return;const value=await command.execute("generate",null,{survey_id:survey.id,survey_version:survey.version,condition});if(value)router.push(`/prepare?requestId=${(value as Request).id}`);}
  return <section className="hm-cycle"><p className="hm-eyebrow">오늘의 운동</p><h1>오늘도 한 단계씩.</h1><p className="hm-description">내 조건으로 만들고, 내 속도로 운동해요.</p>{loading?<p role="status">저장된 조건을 확인하고 있어요.</p>:<>
    {legacy?<Link className="hm-action" href={`/workout?sessionId=${legacy}`}>이전에 시작한 운동 이어 하기</Link>:active?<Link className="hm-action" href={`/workout?cycleId=${active.id}`}>진행 중인 운동 이어 하기</Link>:survey&&input?<><dl className="hm-review-list"><div><dt>목표</dt><dd>{input.goal}</dd></div><div><dt>일정</dt><dd>주 {input.days}회 · 최대 {input.minutes}분</dd></div><div><dt>제한 부위</dt><dd>{Object.keys(input.limitations).join(", ")||"없음"}</dd></div></dl><Link className="hm-text-link" href={`/survey?id=${survey.id}`}>조건 수정 · 새로 불편한 곳 있어요</Link>
      <InputOptions label="오늘 컨디션 · 선택" values={["추천대로","가볍게","보통","강하게"]} selected={[["recommended","light","normal","hard"].indexOf(condition)].map(i=>["추천대로","가볍게","보통","강하게"][i])} onChange={v=>setCondition(["recommended","light","normal","hard"][["추천대로","가볍게","보통","강하게"].indexOf(v)])}/><p className="hm-helper">지금은 푸시업 두 자세를 지원해요. 제한 조건을 먼저 확인해요.</p><button className="hm-action" disabled={command.busy} onClick={generate}>{command.busy?"준비 중":command.uncertain?"생성 요청 다시 확인":"루틴 만들고 카메라 준비"}</button>
      {request&&["queued","running","succeeded"].includes(request.status)&&<Link className="hm-text-link" href={`/prepare?requestId=${request.id}`}>이전에 요청한 루틴 확인</Link>}</>:<Link className="hm-action" href="/survey">내 운동 조건 입력하기</Link>}</>}
    <ErrorNote message={notice||command.message}/><Link className="hm-text-link" href="/profile">내 기록과 운동 성향</Link></section>;
}
export function CyclePrepare({id}:{id:string}){
  const router=useRouter(),command=useCommand();const [request,setRequest]=useState<Request|null>(null),[error,setError]=useState<string|null>(null),[camera,setCamera]=useState(false),[cameraKey,setCameraKey]=useState(0),[cameraFailed,setCameraFailed]=useState(false),[confirmed,setConfirmed]=useState(false);
  useEffect(()=>{let alive=true;let timer:ReturnType<typeof setTimeout>;const poll=async()=>{const r=await cycleCall("request",id);if(!alive)return;if(r.ok){setRequest(r.data as Request);if(r.data&&["queued","running"].includes((r.data as Request).status))timer=setTimeout(poll,1500);}else setError(r.message);};void poll();return()=>{alive=false;clearTimeout(timer);};},[id]);
  const failed=request?.status==="failed";const noCandidates=request?.error==="NO_CANDIDATES";
  async function start(){if(!camera||!confirmed)return;const s=await command.execute("start",id,{confirmed:true});if(s)router.push(`/workout?cycleId=${(s as Session).id}`);}
  return <section className="hm-cycle"><p className="hm-eyebrow">운동 준비</p><h1>카메라를 맞춰 주세요.</h1><p className="hm-description">정면에서 어깨·손·몸통이 보이도록 고정해 주세요. 사람이 보이는지 먼저 확인해요.</p>
    {!noCandidates&&!cameraFailed&&<PoseCamera key={cameraKey} rule={cameraRule} enabled onRepetition={noRepetition} onPause={()=>{setCameraFailed(true);setCamera(false);}} onTracking={setCamera}><span>준비 자세 확인</span></PoseCamera>}
    {cameraFailed&&<><p role="status">카메라 권한과 다른 앱의 사용 여부를 확인해 주세요. 카메라 확인 없이 운동을 시작하지 않아요.</p><button className="hm-action hm-action-secondary" onClick={()=>{setCameraKey(k=>k+1);setCameraFailed(false);}}>카메라 다시 켜기</button></>}
    {request?.status==="succeeded"?<><h2>{request.plan.exercise_name}</h2><p>{request.plan.reps}회 × 5단계 · 단계 사이 {request.plan.rest_seconds}초 휴식</p><p>약 {Math.ceil(request.plan.estimated_seconds/60)}분 · 운동 시간은 상한 안에서 짧아질 수 있어요.</p><p>{request.plan.reason}</p><p>{request.explanation}</p><details open><summary>시작 자세와 중단 조건</summary><p>{request.plan.instructions.start}</p><p>{request.plan.instructions.mistake}</p><p>{request.plan.instructions.stop}</p></details><label className="hm-helper"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 루틴과 시작 자세를 확인했어요</label><button className="hm-action" disabled={command.busy||!confirmed||!camera} onClick={start}>{command.uncertain?"시작 요청 다시 확인":"운동 시작"}</button></>:failed?<><p role="alert">{noCandidates?request.plan.reason:"루틴을 만들지 못했어요. 저장 조건을 확인하고 다시 요청해 주세요."}</p><Link className="hm-action" href="/">조건 확인하고 다시 만들기</Link></>:<p role="status">카메라를 확인하는 동안 루틴을 만들고 있어요.</p>}
    <ErrorNote message={error||command.message}/></section>;
}
export function CycleWorkout({id}:{id:string}){
  const router=useRouter(),command=useCommand();const [session,setSession]=useState<Session|null>(null),[error,setError]=useState<string|null>(null),[now,setNow]=useState(()=>Date.now()),[cameraKey,setCameraKey]=useState(0),[tracking,setTracking]=useState(false),[hardwareStopped,setHardwareStopped]=useState(false);
  const {execute}=command;
  const latest=useRef<Session|null>(null),wasTracking=useRef(false),lost=useRef(false),pausePending=useRef(false);
  const accept=useCallback((s:Session)=>{latest.current=s;setSession(s);if(["completed","stopped"].includes(s.status))router.replace(`/workout/complete?cycleId=${s.id}`);},[router]);
  const reload=useCallback(async()=>{const r=await cycleCall("session",id);if(r.ok&&r.data)accept(r.data as Session);else setError(r.ok?"운동을 찾을 수 없어요.":r.message);},[id,accept]);
  useEffect(()=>{let alive=true;cycleCall("session",id).then(r=>{if(alive){if(r.ok&&r.data)accept(r.data as Session);else setError(r.ok?"운동을 찾을 수 없어요.":r.message);}});const timer=setInterval(()=>setNow(Date.now()),250);return()=>{alive=false;clearInterval(timer);};},[id,accept]);
  const mutate=useCallback(async(op:string,extra:Record<string,unknown>={})=>{const s=latest.current;if(!s)return;const value=await execute(op,id,{version:s.version,...extra});if(value){accept(value as Session);if(op==="resume")setHardwareStopped(false);}},[id,execute,accept]);
  const reportTracking=useCallback((visible:boolean)=>{setTracking(visible);if(visible)wasTracking.current=true;else if(wasTracking.current)lost.current=true;},[]);
  // Preserve the loss event through a repetition response; don't race two versioned writes.
  useEffect(()=>{if(lost.current&&!command.busy&&!command.uncertain&&session&&!session.tracking_lost){lost.current=false;void mutate("tracking-lost");}},[tracking,command.busy,command.uncertain,session,mutate]);
  useEffect(()=>{if(pausePending.current&&!command.busy&&!command.uncertain&&session?.status==="active"){pausePending.current=false;void Promise.resolve().then(()=>mutate("pause"));}},[command.busy,command.uncertain,session,hardwareStopped,mutate]);
  const rest=session?.rest_until?Math.max(0,Math.ceil((Date.parse(session.rest_until)-now)/1000)):0;
  if(!session)return <section className="hm-cycle"><h1>운동 불러오는 중</h1><ErrorNote message={error}/></section>;
  const plan=session.request.plan;
  return <section className="hm-cycle"><p className="hm-eyebrow">{({fitness:"체력 기르기",strength:"근력 키우기",weight_management:"체중 관리",habit:"운동 습관"} as Record<string,string>)[plan.goal]}</p><h1>{plan.exercise_name}</h1><p className="hm-progress-title">보석 다듬기 {session.stage} / 5단계</p><div className="hm-form-progress" aria-label={`${session.stage} / 5단계`}>{session.counts.map((c,i)=><span key={i} className={c>=plan.reps?"is-current":""}/>)}</div>
    {session.status==="active"&&!command.uncertain&&!hardwareStopped?<PoseCamera key={cameraKey} rule={cameraRule} enabled={!command.busy&&rest===0} resetWhenDisabled={rest>0} onRepetition={()=>void mutate("repetition")} onPause={()=>{pausePending.current=true;setHardwareStopped(true);}} onTracking={reportTracking}><strong className="hm-cycle-count">{rest>0?`${rest}초 휴식`:`${Math.max(0,plan.reps-session.counts[session.stage-1])}회 남음`}</strong></PoseCamera>:<p role="status">{command.uncertain?"요청 결과를 확인할 때까지 측정을 멈췄어요.":"일시정지했어요. 횟수와 진행 단계는 그대로예요."}</p>}
    {rest>0&&<><p>다음 단계 {plan.reps}회 · 휴식 중에는 세지 않아요.</p><button className="hm-action" disabled={command.busy} onClick={()=>void mutate("rest",{seconds:0})}>바로 시작</button><button className="hm-action hm-action-secondary" disabled={command.busy} onClick={()=>void mutate("rest",{seconds:Math.min(1800,rest+60)})}>1분 더 쉬기</button></>}
    <p className="hm-helper">{plan.instructions.stop}</p>
    {command.uncertain?<button className="hm-action" onClick={()=>void command.retry().then(v=>{if(v)accept(v as Session);})}>이전 요청 결과 다시 확인</button>:<><button className="hm-action hm-action-secondary" disabled={command.busy} onClick={()=>{if(session.status==="paused")setCameraKey(k=>k+1);void mutate(session.status==="paused"?"resume":"pause");}}>{session.status==="paused"?"다시 시작":"일시정지"}</button><div className="hm-form-actions"><button disabled={command.busy} onClick={()=>void mutate("stop",{reason:"pain"})}>아파서 멈추기</button><button disabled={command.busy} onClick={()=>void mutate("stop",{reason:session.tracking_lost?"tracking":"voluntary"})}>여기까지 운동하기</button></div></>}
    <ErrorNote message={command.message||error}/>{command.message&&!command.uncertain&&<button onClick={()=>void reload()}>저장된 상태 다시 불러오기</button>}</section>;
}
export function CycleComplete({id}:{id:string}){
  const [session,setSession]=useState<Session|null>(null),[error,setError]=useState<string|null>(null);const command=useCommand();
  const [effort,setEffort]=useState<string|null>(null),[duration,setDuration]=useState<string|null>(null),[score,setScore]=useState<number|null>(null),[comment,setComment]=useState(""),[keywords,setKeywords]=useState<string[]>([]),[preview,setPreview]=useState<KeywordPreview|null>(null),[reviewed,setReviewed]=useState(false);
  useEffect(()=>{let alive=true;cycleCall("session",id).then(r=>{if(alive){if(r.ok)setSession(r.data as Session);else setError(r.message);}});return()=>{alive=false;};},[id]);
  function toggle(k:string){setKeywords(v=>v.includes(k)?v.filter(x=>x!==k):[...v.filter(x=>!(k==="more_rest"&&x==="less_rest")&&!(k==="less_rest"&&x==="more_rest")),k]);}
  async function inspect(){const r=await cycleCall("keywords/preview",null,{comment});if(r.ok){setPreview(r.data as KeywordPreview);setReviewed(true);}else setError(r.message);}
  async function submit(skip:boolean){if(!session)return;if(!skip&&comment.trim()&&!reviewed){setError("자유 의견에서 반영할 내용을 먼저 확인해 주세요.");return;}const r=await command.execute("feedback",id,{version:session.version,skip,effort:skip?null:effort,duration_feedback:skip?null:duration,satisfaction:skip?null:score,comment:skip?"":comment,keywords:skip?[]:keywords});if(r)setSession(r as Session);}
  if(!session)return <section className="hm-cycle"><h1>결과 확인</h1><ErrorNote message={error}/></section>;
  if(!["completed","stopped"].includes(session.status))return <section className="hm-cycle"><h1>아직 운동 중이에요.</h1><Link href={`/workout?cycleId=${id}`}>이어서 운동하기</Link></section>;
  return <section className="hm-cycle"><p className="hm-eyebrow">오늘의 기록</p><h1>{session.status==="completed"?"다섯 단계 완료.":"오늘은 여기까지."}</h1><strong className="hm-cycle-count">{session.counts.reduce((a,b)=>a+b,0)}회</strong><p>{session.request.plan.exercise_name} · {session.counts.filter(c=>c>=session.request.plan.reps).length}단계 달성</p>
    {session.gem?<><Gem state={session.gem==="polished"?"polished":"matte"}/><p>{session.gem==="polished"?"보석을 완성했어요.":session.gem==="dull"?"조금 쉬어가도 괜찮아요. 다음 횟수를 줄여볼게요.":"조금씩 다듬어 가고 있어요."}</p></>:<p>통증이나 판정 누락으로 멈춘 기록에는 보석 불이익을 주지 않아요.</p>}
    {session.status==="completed"&&session.feedback_status==="pending"?<><h2>오늘 운동은 어땠나요?</h2><p>모두 선택 사항이에요. 답한 내용만 다음 운동에 참고해요.</p><fieldset disabled={command.busy||command.uncertain} className="hm-cycle-fieldset">
      <InputOptions label="운동 강도" values={["가벼웠어요","적당했어요","힘들었어요"]} selected={effort?[["light","normal","hard"].indexOf(effort)].map(i=>["가벼웠어요","적당했어요","힘들었어요"][i]):[]} onChange={v=>{const code=["light","normal","hard"][["가벼웠어요","적당했어요","힘들었어요"].indexOf(v)];setEffort(effort===code?null:code);}}/>
      <InputOptions label="운동 시간" values={["짧았어요","적당했어요","길었어요"]} selected={duration?[["short","normal","long"].indexOf(duration)].map(i=>["짧았어요","적당했어요","길었어요"][i]):[]} onChange={v=>{const code=["short","normal","long"][["짧았어요","적당했어요","길었어요"].indexOf(v)];setDuration(duration===code?null:code);}}/>
      <InputOptions label="루틴 만족도" values={["1점","2점","3점","4점","5점"]} selected={score?[`${score}점`]:[]} onChange={v=>setScore(score===parseInt(v)?null:parseInt(v))}/>
      <InputOptions label="다음엔 이렇게" values={["other_area","same_exercise","variety","more_rest","less_rest"].map(k=>keywordLabels[k])} selected={keywords.map(k=>keywordLabels[k])} multiple onChange={v=>toggle(Object.keys(keywordLabels).find(k=>keywordLabels[k]===v)!)}/>
      <label htmlFor="cycle-comment">자유 의견 · 최대 500자</label><textarea id="cycle-comment" maxLength={500} value={comment} onChange={e=>{setComment(e.target.value);setReviewed(false);setPreview(null);setKeywords(v=>v.filter(k=>!k.startsWith("prefer_")&&!k.startsWith("avoid_")));}}/><button className="hm-action hm-action-secondary" onClick={()=>void inspect()}>반영할 내용 확인</button>
      {preview&&<><p>반영할 내용만 직접 골라 주세요. 원문은 AI에 보내지 않아요.</p>{preview.keywords.length>0?<InputOptions label="확인한 선호도" values={preview.keywords.map(k=>keywordLabels[k])} selected={keywords.map(k=>keywordLabels[k])} multiple onChange={v=>toggle(Object.keys(keywordLabels).find(k=>keywordLabels[k]===v)!)}/>:<p>자동으로 추린 선호도는 없어요.</p>}{preview.pain&&<Link className="hm-text-link" href="/survey">불편한 부위를 저장 조건에 추가하기</Link>}</>}
      </fieldset><button className="hm-action" disabled={command.busy} onClick={()=>void submit(false)}>{command.uncertain?"이전 제출 다시 확인":"답변 저장"}</button><button className="hm-action hm-action-secondary" disabled={command.busy||command.uncertain} onClick={()=>void submit(true)}>건너뛰기</button></>:<p>{session.feedback_status==="submitted"?"답변을 저장했어요.":"답변 없이도 운동 기록은 남아 있어요."}</p>}
    <ErrorNote message={command.message||error}/><Link className="hm-text-link" href="/profile">내 운동 성향 보기</Link><Link className="hm-text-link" href="/">다음 운동</Link></section>;
}
export function CycleProfileScreen(){
  const [profile,setProfile]=useState<Profile|null>(null),[records,setRecords]=useState<Session[]>([]),[error,setError]=useState<string|null>(null);
  useEffect(()=>{let alive=true;Promise.all([cycleCall("profile/summary"),cycleCall("records")]).then(([p,r])=>{if(!alive)return;if(p.ok)setProfile(p.data as Profile);else setError(p.message);if(r.ok)setRecords(r.data as Session[]);else setError(r.message);});return()=>{alive=false;};},[]);
  const point=(i:number,value:number)=>{const a=(i*60-90)*Math.PI/180;return [150+Math.cos(a)*value,140+Math.sin(a)*value];};
  return <section className="hm-cycle"><p className="hm-eyebrow">나의 운동</p><h1>조금씩 쌓이는 변화.</h1>{profile?profile.status==="collecting"?<p role="status">기록을 모으는 중 · {profile.sample_count} / 3회</p>:<><svg viewBox="0 0 300 285" role="img" aria-label="나의 운동 성향 육각형 차트" className="hm-radar">{[25,50,75,100].map(r=><polygon key={r} points={Array.from({length:6},(_,i)=>point(i,r).join(",")).join(" ")} fill="none" stroke="#444"/>)}{profile.axes.every(a=>a.value!==null)&&<polygon points={profile.axes.map((a,i)=>point(i,a.value!).join(",")).join(" ")} fill="#f33b5266" stroke="#ff4257"/>}{profile.axes.map((a,i)=><g key={a.name}><line x1="150" y1="140" x2={point(i,100)[0]} y2={point(i,100)[1]} stroke="#444"/>{a.value!==null&&<circle cx={point(i,a.value)[0]} cy={point(i,a.value)[1]} r="4" fill="#ff4257"/>}<text x={point(i,123)[0]} y={point(i,123)[1]} fill="#fff" textAnchor="middle" dominantBaseline="middle" fontSize="14" fontWeight="700">{a.name}</text></g>)}</svg><dl className="hm-review-list">{profile.axes.map(a=><div key={a.name}><dt>{a.name}</dt><dd>{a.value===null?"자료 없음":`${a.value} / 100`}</dd></div>)}</dl><p>{profile.note}</p><p>최근 7일 측정된 활동 {Math.round(profile.recent_active_ms/60000)}분 · 정자세 승급 {profile.promotions}회</p></>:<p>기록을 확인하고 있어요.</p>}<ErrorNote message={error}/><h2>최근 운동</h2>{records.length?records.map(s=><Link className="hm-cycle-record" key={s.id} href={s.ended_at?`/workout/complete?cycleId=${s.id}`:`/workout?cycleId=${s.id}`}><span>{new Date(s.started_at).toLocaleDateString("ko-KR")} · {s.request.plan.exercise_name}</span><strong>{s.counts.reduce((a,b)=>a+b,0)}회</strong></Link>):<p>아직 저장된 운동이 없어요.</p>}<Link className="hm-text-link" href="/records">이전 버전 운동 기록도 보기</Link><Link className="hm-text-link" href="/survey">내 조건 수정</Link></section>;
}

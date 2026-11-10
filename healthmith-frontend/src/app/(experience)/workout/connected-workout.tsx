"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionBar, ActionLink, Notice, PageIntro } from "@/components/healthmith/ui";
import { PoseCamera } from "@/components/healthmith/pose-camera";
import { changeWorkoutState, loadPoseRule, loadWorkout, recordWorkoutRepetition } from "./actions";
import { commandKey } from "@/lib/healthmith/command-key";
import type { CameraRule } from "@/lib/healthmith/pose-counter";
import type { WorkoutCurriculum, WorkoutSession } from "@/lib/healthmith/workout-contract";

type PendingCommand = { kind: "repetition" | "pause" | "resume" | "abandon"; session: WorkoutSession; key: string; reason?: "manual" | "no_motion" };
export function ConnectedWorkout({ sessionId }: { sessionId?: string }) {
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [curriculum, setCurriculum] = useState<WorkoutCurriculum | null>(null);
  const [rule, setRule] = useState<CameraRule | null>(null);
  const [ruleExerciseId, setRuleExerciseId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState<PendingCommand | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const [pauseRequested, setPauseRequested] = useState<"manual" | "no_motion" | null>(null);
  const lock = useRef(false);
  const router = useRouter();
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);
  const accept = useCallback((s: WorkoutSession) => {
    setSession(s); sessionRef.current = s;
    if (s.status !== "in_progress") setPauseRequested(null);
    if (s.status === "completed" || s.status === "abandoned") router.replace(`/workout/complete?sessionId=${encodeURIComponent(s.id)}`);
  }, [router]);
  const reload = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setPending(true);
    try {
      const r = await loadWorkout(sessionId);
      if (r.state === "ok") {
        setUncertain(null); setBlocked(false); setMessage(null); setCameraEpoch((v) => v + 1);
        if (r.data.session) { setCurriculum(r.data.curriculum); accept(r.data.session); }
        else { setSession(null); setCurriculum(null); }
      } else { setMessage(r.message); setBlocked(true); }
      setLoaded(true);
    } catch { setMessage("운동 정보를 불러오지 못했어요. 다시 확인해 주세요."); setBlocked(true); setLoaded(true); }
    finally { lock.current = false; setPending(false); }
  }, [sessionId, accept]);
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);
  const exerciseId = curriculum?.stages[(session?.current_stage_index ?? 1) - 1]?.exercise_id;
  useEffect(() => {
    let active = true;
    if (exerciseId) void loadPoseRule(exerciseId).then((r) => { if (active) { setRule(r); setRuleExerciseId(exerciseId); } })
      .catch(() => { if (active) { setRule(null); setRuleExerciseId(exerciseId); } });
    return () => { active = false; };
  }, [exerciseId]);

  const execute = useCallback(async (command: PendingCommand) => {
    if (lock.current) return;
    lock.current = true; setPending(true); setMessage(null);
    try {
      const s = command.session;
      const r = command.kind === "repetition"
        ? await recordWorkoutRepetition(s.id, s.version, s.current_stage_index, command.key)
        : await changeWorkoutState(s.id, s.version, command.kind, command.key, command.reason);
      if (r.state === "ok") { setUncertain(null); setBlocked(false); accept(r.data); }
      else { setMessage(r.message); setUncertain(r.uncertain ? command : null); setBlocked(true); }
    } catch {
      setMessage("저장 결과를 확인하지 못했어요. 같은 요청 결과를 다시 확인해 주세요."); setUncertain(command); setBlocked(true);
    } finally { lock.current = false; setPending(false); }
  }, [accept]);
  const change = useCallback((kind: PendingCommand["kind"], reason: "manual" | "no_motion" = "manual") => {
    const s = sessionRef.current;
    if (!s || lock.current || blocked) return;
    void execute({ kind, session: s, key: commandKey(`${kind}:${s.id}:${s.version}:${reason}`), reason });
  }, [blocked, execute]);
  useEffect(() => {
    if (!pauseRequested || pending || blocked || session?.status !== "in_progress") return;
    const timer = setTimeout(() => { change("pause", pauseRequested); setPauseRequested(null); }, 0);
    return () => clearTimeout(timer);
  }, [pauseRequested, pending, blocked, session, change]);
  useEffect(() => () => {
    const s = sessionRef.current;
    if (s?.status === "in_progress" && !lock.current) {
      // 브라우저 종료 때의 전송은 보장할 수 없으며 재진입 시 서버 상태를 다시 읽는다.
      void changeWorkoutState(s.id, s.version, "pause", commandKey(`pause:${s.id}:${s.version}:manual`)).catch(() => {});
    }
  }, []);

  if (!loaded) return <><PageIntro eyebrow="YOUR QUEST" title="저장된 운동을 불러오고 있어요" /><p role="status">잠시만 기다려 주세요.</p></>;
  if (!session || !curriculum) return <>
    <PageIntro eyebrow="YOUR QUEST" title={message ? "운동을 불러오지 못했어요" : "진행 중인 운동이 없어요"} />
    {message && <p role="alert" className="hm-error">{message}</p>}
    <Button disabled={pending} onClick={() => void reload()}>다시 불러오기</Button>
    <ActionBar><ActionLink href="/records">운동 기록 보기</ActionLink><ActionLink href="/survey">새 루틴 준비하기</ActionLink></ActionBar>
  </>;
  const stage = curriculum.stages[session.current_stage_index - 1];
  const active = session.status === "in_progress";
  const currentRule = ruleExerciseId === exerciseId ? rule : null;
  return <>
    <PageIntro eyebrow={`STAGE ${session.current_stage_index} / 5`} title={active ? stage.stage_name : session.status === "paused" ? "잠시 쉬고 있어요" : "운동을 마무리했어요"} />
    <h2>{stage.exercise_name}</h2>
    <p>{stage.pace_instruction}</p><p>{stage.internal_focus_instruction}</p>
    <div className="hm-counter"><strong aria-live="polite">{session.current_repetitions} / {stage.target_repetitions}</strong><p>{session.completed_stage_count} / 5 단계 완료</p></div>
    {active && currentRule && <PoseCamera key={`${exerciseId}:${cameraEpoch}`} rule={currentRule} enabled={!pending && !blocked && !pauseRequested}
      onRepetition={() => change("repetition")} onPause={setPauseRequested} />}
    {active && !currentRule && <Notice>이 운동의 카메라 측정 기준이 준비되지 않았어요. 횟수를 측정할 수 없어 일시정지 후 기록으로 돌아갈 수 있어요.</Notice>}
    {session.status === "paused" && <Notice>단계와 횟수를 저장했어요. 카메라를 다시 준비한 뒤 이어갈 수 있어요.</Notice>}
    {message && <p role="alert" className="hm-error">{message}</p>}
    {uncertain && <Button disabled={pending} onClick={() => void execute(uncertain)}>같은 요청 결과 다시 확인</Button>}
    <Button disabled={pending} onClick={() => void reload()}>최신 상태 불러오기</Button>
    <ActionBar>
      {active && <Button className="hm-action-button" disabled={pending || blocked} onClick={() => change("pause")}>잠시 쉬어가기</Button>}
      {session.status === "paused" && <>
        <Button className="hm-action-button" disabled={pending || blocked || !currentRule} onClick={() => change("resume")}>이어서 운동하기</Button>
        <Button className="hm-action-button hm-secondary-button" disabled={pending || blocked} onClick={() => change("abandon")}>이번 운동 포기하기</Button>
      </>}
    </ActionBar>
    <p className="hm-helper">30초 동안 동작이 감지되지 않거나 화면을 벗어나면 운동을 일시정지해요.</p>
    <ActionLink href="/records">운동 기록 보기</ActionLink>
  </>;
}

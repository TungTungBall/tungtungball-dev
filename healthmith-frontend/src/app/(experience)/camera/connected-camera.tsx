"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionLink, Notice, PageIntro } from "@/components/healthmith/ui";
import { ExercisePreparation, FrontCameraDiagram } from "@/components/healthmith/exercise-preparation";
import { loadConfirmedWorkout, startWorkoutSession } from "../workout/actions";
import { commandKey, finishCommand } from "@/lib/healthmith/command-key";
import type { WorkoutCurriculum } from "@/lib/healthmith/workout-contract";

export function ConnectedCamera({ curriculumId }: { curriculumId: string }) {
  const [curriculum, setCurriculum] = useState<WorkoutCurriculum | null>(null);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState<"exercise" | "camera">("exercise");
  const [selectedStage, setSelectedStage] = useState(0);
  const [camera, setCamera] = useState<"idle" | "requesting" | "active">("idle");
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    active.current = true;
    let current = true;
    void loadConfirmedWorkout(curriculumId).then(result => {
      if (!current) return;
      if (result.state === "ok") {
        setCurriculum(result.data.curriculum);
        const supported = result.data.curriculum.stages.every(stage => Object.hasOwn(result.data.rules, stage.exercise_id));
        setSupported(supported);
        if (!supported) setMessage("이 루틴에는 카메라 측정 기준이 준비되지 않은 운동이 있어요. 지원 운동을 확인해 주세요.");
      } else setMessage(result.message);
    }).catch(() => { if (current) setMessage("확정한 루틴을 불러오지 못했어요. 기록에서 다시 열어 주세요."); });
    return () => { current = false; active.current = false; stream.current?.getTracks().forEach(track => track.stop()); };
  }, [curriculumId]);

  async function requestCamera() {
    if (locked.current || !supported) return;
    locked.current = true;setCamera("requesting");setMessage(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error();
      const next = await navigator.mediaDevices.getUserMedia({video: {facingMode: "user"}, audio: false});
      if (!active.current) {next.getTracks().forEach(track => track.stop());return;}
      stream.current = next;
      if (video.current) {video.current.srcObject = next;await video.current.play();}
      next.getVideoTracks().forEach(track => track.addEventListener("ended", () => {
        if (active.current) {setCamera("idle");setMessage("카메라 연결이 끊겼어요. 다시 연결해 주세요.");}
      }));
      setCamera("active");
    } catch {
      stream.current?.getTracks().forEach(track => track.stop());stream.current = null;
      if (active.current) {setCamera("idle");setMessage("카메라를 연결하지 못했어요. 브라우저 권한과 다른 앱의 카메라 사용을 확인해 주세요.");}
    } finally {locked.current = false;}
  }

  async function start() {
    if (!curriculum || !supported || locked.current || camera !== "active") return;
    if (!stream.current?.getVideoTracks().some(track => track.readyState === "live")) {setCamera("idle");setMessage("카메라를 다시 연결해 주세요.");return;}
    locked.current = true;setPending(true);setMessage(null);
    try {
      const scope = `start:${curriculum.id}:${curriculum.version}`;
      const result = await startWorkoutSession(curriculum.id, curriculum.version, commandKey(scope));
      if (result.state === "ok") {
        finishCommand(scope);
        stream.current?.getTracks().forEach(track => track.stop());stream.current = null;
        if (active.current) router.push(`/workout?sessionId=${encodeURIComponent(result.data.id)}`);
      } else if (active.current) setMessage(result.message);
    } catch {if (active.current) setMessage("운동 시작 결과를 확인할 수 없어요. 진행 중인 운동을 먼저 확인해 주세요.");}
    finally {locked.current = false;if (active.current) setPending(false);}
  }

  function back() {
    stream.current?.getTracks().forEach(track => track.stop());stream.current = null;
    setCamera("idle");setMessage(null);setStep("exercise");
  }
  const stage = curriculum?.stages[selectedStage];
  return <div className="hm-preparation">
    <PageIntro eyebrow={step === "exercise" ? "운동 준비 1 / 2" : "운동 준비 2 / 2"} title={step === "exercise" ? "시작 전에 확인해요" : "정면으로 맞춰주세요"} description={step === "exercise" ? "확정한 루틴의 동작과 중단 조건을 확인해요." : "밝은 곳에 카메라를 고정해 주세요."} />
    {step === "exercise" ? <>
      {curriculum && <div className="hm-option-list hm-stage-picker" role="group" aria-label="단계별 운동 준비">{curriculum.stages.map((item, index) => <button type="button" key={item.stage_index} aria-label={`${item.stage_index}단계 ${item.exercise_name}`} aria-pressed={index === selectedStage} onClick={() => setSelectedStage(index)}>{item.stage_index}</button>)}</div>}
      {stage ? <ExercisePreparation key={stage.stage_index} stage={stage} /> : !message && <p role="status" className="hm-description">확정한 루틴을 불러오는 중이에요.</p>}
      <button className="hm-action" disabled={!supported} onClick={() => {setStep("camera");setMessage(null);}}>촬영 준비로</button>
    </> : <>
      <video ref={video} hidden={camera !== "active"} autoPlay playsInline muted aria-label="내 카메라 미리보기" />
      {camera !== "active" && <FrontCameraDiagram />}
      <section className="hm-camera-instructions" aria-label="촬영 구도">
        <p>카메라를 정면에 두고 동작 중에도 필요한 관절이 모두 보이도록 거리를 맞춰요.</p>
        {curriculum?.stages.some(item => item.exercise_id === "push_up") && <p>푸시업은 상체와 양손이 동작 내내 화면에 보이게 해주세요.</p>}
        {curriculum?.stages.some(item => item.exercise_id !== "push_up") && <p>서서 하는 운동은 머리부터 발까지 화면에 들어오게 해주세요.</p>}
        <p>운동 화면에서 ‘측정 중’ 표시를 확인한 뒤 움직여요. 관절이 안 보이면 ‘판정 불가’로 표시하고 횟수와 단계는 유지해요.</p>
      </section>
      <Notice>영상과 관절 좌표는 이 기기 안에서만 처리해요. 지금은 구도를 확인하는 미리보기이며 횟수 측정은 운동 시작 후 진행해요.</Notice>
      {camera === "active" ? <button className="hm-action" disabled={pending} onClick={start}>{pending ? "운동 시작 확인 중…" : "구도 확인 완료, 운동 시작"}</button>
        : <button className="hm-action" disabled={camera === "requesting"} onClick={requestCamera}>{camera === "requesting" ? "카메라 권한 확인 중…" : "카메라 연결하기"}</button>}
      <button className="hm-action hm-action-secondary" disabled={pending || camera === "requesting"} onClick={back}>운동 안내로 돌아가기</button>
    </>}
    {message && <p role="alert" className="hm-error">{message}</p>}
    <div className="hm-stack"><ActionLink href="/workout?connected=1" secondary>진행 중인 운동 확인하기</ActionLink><ActionLink href="/records" secondary>운동 기록으로</ActionLink></div>
  </div>;
}

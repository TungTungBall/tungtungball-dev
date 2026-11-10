"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionBar, ActionLink, Notice, PageIntro } from "@/components/healthmith/ui";
import { Button } from "@/components/ui/button";
import { loadConfirmedWorkout, startWorkoutSession } from "../workout/actions";
import { commandKey, finishCommand } from "@/lib/healthmith/command-key";
import type { WorkoutCurriculum } from "@/lib/healthmith/workout-contract";

export function ConnectedCamera({ curriculumId }: { curriculumId: string }) {
  const [curriculum, setCurriculum] = useState<WorkoutCurriculum | null>(null);
  const [supported, setSupported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    void loadConfirmedWorkout(curriculumId).then((r) => {
      if (!active) return;
      if (r.state === "ok") {
        setCurriculum(r.data.curriculum);
        const supported = r.data.curriculum.stages.every((s) => Object.hasOwn(r.data.rules, s.exercise_id));
        setSupported(supported);
        if (!supported) setMessage("이 루틴에는 카메라 측정 기준이 준비되지 않은 운동이 있어요. 관리자에게 지원 운동을 확인해 주세요.");
      } else setMessage(r.message);
    }).catch(() => { if (active) setMessage("확정한 루틴을 불러오지 못했어요. 기록에서 다시 열어 주세요."); });
    return () => { active = false; };
  }, [curriculumId]);
  async function start() {
    if (!curriculum || !supported || locked.current) return;
    locked.current = true; setPending(true); setMessage(null);
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error();
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      // 권한을 먼저 확인한다. 실제 측정은 운동 화면에서 새 스트림으로 시작한다.
      stream.getTracks().forEach((t) => t.stop());
      const scope = `start:${curriculum.id}:${curriculum.version}`;
      const r = await startWorkoutSession(curriculum.id, curriculum.version, commandKey(scope));
      if (r.state === "ok") {
        finishCommand(scope);
        router.push(`/workout?sessionId=${encodeURIComponent(r.data.id)}`);
      }
      else setMessage(r.message);
    } catch { setMessage("카메라 권한을 허용해야 운동을 시작할 수 있어요. 브라우저 설정을 확인해 주세요."); }
    finally { stream?.getTracks().forEach((t) => t.stop()); locked.current = false; setPending(false); }
  }
  return <>
    <PageIntro eyebrow="READY YOUR CRAFT" title="확정한 루틴으로 준비해요" description="전신이 보이는 밝은 공간에서 카메라를 준비해 주세요." />
    <Notice>영상과 관절 좌표는 이 기기 안에서만 처리해요. 서버에는 측정한 반복 이벤트만 저장해요.</Notice>
    {curriculum && <p>{curriculum.stages.length}단계 · 확정 버전 {curriculum.version}</p>}
    {message && <p role="alert" className="hm-error">{message}</p>}
    <ActionBar><Button className="hm-action-button" disabled={!supported || pending} onClick={start}>{pending ? "운동 시작 확인 중…" : "카메라 허용하고 운동 시작"}</Button></ActionBar>
    <ActionLink href="/workout?connected=1">진행 중인 운동 확인하기</ActionLink>
    <ActionLink href="/records">운동 기록으로</ActionLink>
  </>;
}

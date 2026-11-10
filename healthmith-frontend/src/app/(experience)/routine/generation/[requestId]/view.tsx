"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { ActionBar, ActionLink, Card, Notice, PageIntro } from "@/components/healthmith/ui";
import { Button } from "@/components/ui/button";
import { confirmWorkoutCurriculum } from "@/app/(experience)/workout/actions";
import { commandKey } from "@/lib/healthmith/command-key";

import {
  readCurriculumGeneration,
  readGeneratedCurriculum,
  regenerateCurriculum,
  type GeneratedCurriculum,
  type GenerationJob,
} from "@/app/survey/generation-actions";

export function GeneratedRoutineView({ requestId }: { requestId: string }) {
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [curriculum, setCurriculum] = useState<GeneratedCurriculum | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [acknowledged, setAcknowledged] = useState(false);
  const [reload, setReload] = useState(0);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const result = await readCurriculumGeneration(requestId);
        if (!active) return;
        if (result.state !== "ok") {
          setMessage(result.message);
          return;
        }
        setJob(result.job);
        if (result.job.status === "failed") {
          setMessage(result.job.error?.message ?? "초안을 만들지 못했어요.");
          return;
        }
        if (result.job.status === "succeeded" && result.job.curriculum_id) {
          const loaded = await readGeneratedCurriculum(result.job.curriculum_id);
          if (!active) return;
          if (loaded.state === "ok") setCurriculum(loaded.curriculum);
          else setMessage(loaded.message);
          return;
        }
        timer = setTimeout(poll, 2_000);
      } catch { if (active) setMessage("생성 상태를 확인하지 못했어요. 잠시 후 다시 확인해 주세요."); }
    }

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestId, reload]);

  if (message) {
    return <>
      <PageIntro eyebrow="YOUR QUEST / 초안 생성" title="초안을 불러오지 못했어요" />
      <Notice danger>{message}</Notice>
      <Button className="hm-action-button" onClick={() => {
        setMessage(null);
        setJob(null);
        setCurriculum(null);
        setActionMessage(null);
        setAcknowledged(false);
        setReload((value) => value + 1);
      }}>같은 요청 다시 확인하기</Button>
      <p className="hm-helper">상태만 다시 조회해요. 새 생성 요청은 보내지 않아요.</p>
      <ActionBar><ActionLink href="/survey">사전조사로 돌아가기</ActionLink></ActionBar>
    </>;
  }

  if (!curriculum) {
    return <>
      <PageIntro eyebrow="YOUR QUEST / 초안 생성" title="운동 설계도를 준비하고 있어요" description="생성이 끝나면 실제 운동 단계와 안내를 보여드릴게요." />
      <div role="status" aria-live="polite"><Card className="hm-loading">
        <LoaderCircle size={28} aria-hidden="true" />
        <p>{job?.status === "running" ? "운동 단계를 구성하고 있어요." : "생성 요청을 확인하고 있어요."}</p>
      </Card></div>
      <p className="hm-helper">이 화면을 나갔다가 생성 요청 주소로 다시 돌아와도 상태를 확인할 수 있어요.</p>
    </>;
  }

  return <>
    <PageIntro eyebrow="YOUR QUEST / 생성된 초안" title="오늘의 운동 설계도" description="백엔드가 생성한 단계와 안내를 확인해 주세요." />
    <div className="hm-routine-meta"><span className="is-draft">{curriculum.status === "confirmed" ? "확정한 커리큘럼" : "커리큘럼 초안"}</span><span>버전 {curriculum.version}</span></div>
    <ol className="hm-routine-list">
      {curriculum.stages.map((stage) => (
        <li key={stage.stage_index} className="hm-routine-item">
          <h2>{String(stage.stage_index).padStart(2, "0")} {stage.stage_name}</h2>
          <p className="hm-exercise">{stage.exercise_name} · {stage.target_repetitions}회 · {stage.pace_instruction}</p>
          <p className="hm-guide">{stage.internal_focus_instruction}</p>
        </li>
      ))}
    </ol>
    <button
      type="button"
      className="hm-action hm-action-secondary"
      disabled={pending || curriculum.status !== "draft"}
      onClick={() => startTransition(async () => {
        try {
          setActionMessage(null);
          const result = await regenerateCurriculum(curriculum.id, curriculum.version);
          if (result.state === "ok") router.push(`/routine/generation/${encodeURIComponent(result.job.id)}`);
          else setActionMessage(result.message);
        } catch { setActionMessage("새 초안 요청 결과를 확인하지 못했어요. 생성 상태를 다시 확인해 주세요."); }
      })}
    >{pending ? "새 초안을 요청하고 있어요…" : "다른 초안 다시 만들기"}</button>
    {actionMessage && <p role="alert" className="hm-error">{actionMessage}</p>}
    {curriculum.status === "draft" && <label className="hm-confirmation"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /><span>운동 단계와 안내를 확인했어요.</span></label>}
    <Notice>직접 확정한 루틴으로만 운동을 시작해요. 카메라 준비 화면에서 시작 여부를 다시 확인할 수 있어요.</Notice>
    <ActionBar><Button className="hm-action-button" disabled={pending || (curriculum.status === "draft" && !acknowledged)} onClick={() => startTransition(async () => {
      try {
        setActionMessage(null);
        if (curriculum.status === "confirmed") { router.push(`/camera?curriculumId=${encodeURIComponent(curriculum.id)}`); return; }
        const r = await confirmWorkoutCurriculum(curriculum.id, curriculum.version, commandKey(`confirm:${curriculum.id}:${curriculum.version}`));
        if (r.state === "ok") {
          setCurriculum({ ...curriculum, status: "confirmed", version: r.data.version });
          router.push(`/camera?curriculumId=${encodeURIComponent(curriculum.id)}`);
        } else setActionMessage(r.message);
      } catch { setActionMessage("확정 결과를 확인하지 못했어요. 같은 요청을 다시 확인하거나 이 주소를 새로 열어 주세요."); }
    })}>{pending ? "확인 중…" : curriculum.status === "confirmed" ? "확정한 루틴으로 준비하기" : "이 루틴 확정하고 준비하기"}</Button></ActionBar>
    <Link className="hm-text-link" href="/workout?connected=1">진행 중인 운동 확인하기</Link>
  </>;
}

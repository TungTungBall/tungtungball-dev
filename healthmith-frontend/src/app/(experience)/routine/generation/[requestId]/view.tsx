"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { ActionBar, ActionLink, Card, Notice, PageIntro } from "@/components/healthmith/ui";

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
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
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
    }

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [requestId]);

  if (message) {
    return <>
      <PageIntro eyebrow="YOUR QUEST / 초안 생성" title="초안을 불러오지 못했어요" />
      <Notice danger>{message}</Notice>
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
    <div className="hm-routine-meta"><span className="is-draft">커리큘럼 초안</span><span>버전 {curriculum.version}</span></div>
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
      disabled={pending}
      onClick={() => startTransition(async () => {
        setActionMessage(null);
        const result = await regenerateCurriculum(curriculum.id, curriculum.version);
        if (result.state === "ok") router.push(`/routine/generation/${encodeURIComponent(result.job.id)}`);
        else setActionMessage(result.message);
      })}
    >{pending ? "새 초안을 요청하고 있어요…" : "다른 초안 다시 만들기"}</button>
    {actionMessage && <p role="alert" className="hm-error">{actionMessage}</p>}
    <Notice>생성된 내용을 확인한 뒤, 커리큘럼 확정과 운동 연결을 이어서 제공할 예정이에요.</Notice>
    <ActionBar><Link href="/survey" className="hm-action-button">사전조사 화면으로</Link></ActionBar>
  </>;
}

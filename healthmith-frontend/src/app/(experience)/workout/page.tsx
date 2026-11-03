"use client";

import { useRouter } from "next/navigation";
import { Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Gem } from "@/components/healthmith/gem";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, ActionLink, Notice, PageIntro, PoseFigure } from "@/components/healthmith/ui";
import { previewStages } from "@/lib/healthmith/preview-data";

const numerals = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"];

export default function WorkoutPage() {
  const { workout, setWorkout } = usePreview();
  const router = useRouter();
  const stage = previewStages[workout.stageIndex] ?? previewStages[0];

  function addPreviewRepetition() {
    const repetitions = workout.repetitions + 1;
    if (repetitions < stage.target) { setWorkout({ ...workout, repetitions }); return; }
    if (workout.stageIndex < previewStages.length - 1) { setWorkout({ ...workout, stageIndex: workout.stageIndex + 1, repetitions: 0 }); return; }
    setWorkout({ ...workout, repetitions: stage.target, status: "completed" });
    router.push("/workout/complete");
  }

  if (workout.status === "abandoned" || workout.status === "completed") {
    return <><PageIntro eyebrow="YOUR QUEST" title="마무리된 여정이에요" /><div className="hm-survey-bottom"><Notice>새로운 보석은 새로운 여정에서 만들어봐요.</Notice></div><ActionBar><ActionLink href={workout.status === "completed" ? "/workout/complete" : "/routine"}>{workout.status === "completed" ? "완성한 보석 보기" : "새 여정 준비하기"}</ActionLink></ActionBar></>;
  }

  return <>
    <PageIntro eyebrow={`STAGE ${numerals[workout.stageIndex]} / V`} title={stage.name} />
    <div className="hm-stage-track" role="img" aria-label={`5단계 중 ${workout.stageIndex + 1}단계`}>{numerals.map((number, index) => <span key={number} className={index <= workout.stageIndex ? "is-active" : undefined}>{number}</span>)}</div>
    <div className="hm-game-art"><p>THE FIRST ORE</p><Gem state={stage.gem} label={stage.name + " 단계의 보석"} /><strong>{stage.target - workout.repetitions > 0 ? `좋아요, 목표까지 ${stage.target - workout.repetitions}회!` : "한 단계 더 빛나졌어요!"}</strong></div>
    <div className="hm-game-metrics"><div className="hm-game-camera"><PoseFigure small /></div><div className="hm-counter"><strong aria-live="polite">{String(workout.repetitions).padStart(2, "0")} / {stage.target}</strong><p>{stage.exercise} · 천천히</p><div className="hm-meter" role="progressbar" aria-label="현재 단계 진행률" aria-valuemin={0} aria-valuemax={stage.target} aria-valuenow={workout.repetitions}><span style={{ width: `${Math.min(100, workout.repetitions / stage.target * 100)}%` }} /></div></div></div>
    <section className="hm-focus-note"><h2>몸의 감각에 집중해요</h2><p>{stage.instruction}</p></section>
    <p className="hm-helper">목표 횟수를 채우면 다음 단계가 열려요.</p>
    <div className="hm-demo-control"><span>화면 예시 · 카메라 횟수 측정 전</span><button type="button" onClick={addPreviewRepetition}>+1회 미리보기</button></div>
    <ActionBar><Button className="hm-action-button" onClick={() => { setWorkout((value) => ({ ...value, status: "paused" })); router.push("/workout/paused"); }}><Pause size={16} />잠시 쉬어가기</Button></ActionBar>
  </>;
}

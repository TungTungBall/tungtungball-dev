"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Gem } from "@/components/healthmith/gem";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, ActionLink, Card, Notice, PageIntro } from "@/components/healthmith/ui";
import { previewStages } from "@/lib/healthmith/preview-data";

export default function PausedPage() {
  const { workout, setWorkout } = usePreview();
  const router = useRouter();
  const stage = previewStages[workout.stageIndex] ?? previewStages[0];

  if (workout.status === "abandoned" || workout.status === "completed") {
    return <><PageIntro eyebrow="YOUR QUEST" title="마무리된 여정이에요" /><div className="hm-survey-bottom"><Notice>완료하거나 포기한 여정은 다시 이어갈 수 없어요.</Notice></div><ActionBar><ActionLink href="/routine">새 여정 준비하기</ActionLink></ActionBar></>;
  }

  return <>
    <PageIntro eyebrow="PAUSED" title="잠시, 불을 낮추고." />
    <div className="hm-game-art hm-pause-art"><Gem state={stage.gem} label="잠시 세공을 멈춘 보석" /><p>THE FORGE RESTS</p></div>
    <Card className="hm-pause-card"><span className="hm-small-label">일시정지</span><h2>쉬어가도 괜찮아요.</h2><p>{stage.name} · {workout.repetitions} / {stage.target}회<br />이어서 하면 중단한 단계에서 진행해요.</p><Button className="hm-action-button hm-secondary-button" onClick={() => { setWorkout((value) => ({ ...value, status: "abandoned" })); router.push("/records?state=populated"); }}>이번 운동 포기하기</Button><p className="hm-helper">포기하면 게임이 종료되며<br />운동 후 설문은 진행하지 않아요.</p></Card>
    <ActionBar><Button className="hm-action-button" onClick={() => { setWorkout((value) => ({ ...value, status: "preview" })); router.push("/workout"); }}>이어서 운동하기</Button></ActionBar>
  </>;
}

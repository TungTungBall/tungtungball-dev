"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Gem } from "@/components/healthmith/gem";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, Notice, PageIntro } from "@/components/healthmith/ui";
import { previewStages } from "@/lib/healthmith/preview-data";

export default function RoutinePage() {
  const { survey, setWorkout } = usePreview();
  const [acknowledged, setAcknowledged] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  async function refreshPreview() {
    setRefreshing(true);
    setAcknowledged(false);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setRefreshing(false);
  }

  return <>
    <PageIntro eyebrow="YOUR QUEST / 시작 전" title="오늘의 운동 설계도" description="단계별 운동을 확인한 뒤 확정해주세요." />
    <div className="hm-routine-meta"><span className="is-draft">커리큘럼 초안</span><span>{survey.purpose === "자유 입력" ? "나의 목표" : survey.purpose} · 강도 {survey.intensity}</span></div>
    {refreshing ? <div className="hm-loading" role="status"><RefreshCw size={24} /><p>초안 미리보기를 준비하고 있어요.</p></div> : <ol className="hm-routine-list">{previewStages.map((stage, index) => <li key={stage.name} className="hm-routine-item"><h2>{String(index + 1).padStart(2, "0")} {stage.name}</h2><p className="hm-exercise">{stage.exercise} · {stage.target}회 · 천천히</p><p className="hm-guide">{stage.instruction}</p><Gem state={stage.gem} /></li>)}</ol>}
    <label className="hm-confirmation"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span>운동 안내를 확인했어요. · 운동·수치 예시</span></label>
    <div className="hm-routine-tools"><Link href="/preparation/body" className="hm-text-link">입력 내용 수정</Link><Button variant="ghost" className="hm-text-link" onClick={refreshPreview} disabled={refreshing}><RefreshCw size={13} />다시 만들기</Button></div>
    <Notice>시안 확인용 초안이에요. 실제 AI 생성이나 운동 처방이 아니에요.</Notice>
    <ActionBar><Button className="hm-action-button" disabled={!acknowledged || refreshing} onClick={() => { setWorkout({ stageIndex: 0, repetitions: 0, confirmed: true, status: "preview" }); router.push("/camera"); }}>이 루틴 확정하고 준비하기</Button></ActionBar>
  </>;
}

"use client";

import Link from "next/link";
import { Gem } from "@/components/healthmith/gem";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, ActionLink, Card, Notice, PageIntro } from "@/components/healthmith/ui";

export default function CompletePage() {
  const { feedback } = usePreview();
  return <>
    <PageIntro eyebrow="QUEST COMPLETE / 예시 결과" title="오늘도 빛을 벼렸어요." />
    <div className="hm-arch hm-result-arch"><span className="hm-arch-label">A GEM IS BORN</span><Gem state="polished" label="완성된 에메랄드 보석" /></div>
    <Card className="hm-result-stats"><h2>오늘의 에메랄드</h2><div className="hm-stat-grid"><div><strong>5 / 5</strong><p>완료한 스테이지</p></div><div><strong>3일</strong><p>연속 운동일 · 예시</p></div></div></Card>
    <div className="hm-result-note"><Notice>모든 단계의 목표 횟수를 채웠어요.<br />{feedback.submitted ? "오늘의 느낌을 미리보기에 반영했어요." : "오늘의 느낌은 아직 저장되지 않았어요."}</Notice></div>
    <div className="hm-centered-link"><Link className="hm-text-link" href="/records?state=populated">나의 운동 기록 보기 ↗</Link></div>
    <ActionBar><ActionLink href="/feedback">오늘의 운동 느낌 남기기</ActionLink></ActionBar>
  </>;
}

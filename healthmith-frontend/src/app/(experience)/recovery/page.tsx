"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionBar, ActionLink, Card, PageIntro } from "@/components/healthmith/ui";

export default function RecoveryPage() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function retry() {
    setPending(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    router.push("/routine");
  }

  return <>
    <PageIntro eyebrow="RECOVERY STATES" title="막힌 길에서 다시 준비해요" />
    <Card className="hm-recovery-card"><span className="hm-small-label">커리큘럼 생성 실패 · 예시</span><h2>새 의뢰서를 만들지 못했어요.</h2><p>잠시 후 다시 시도하거나<br />입력 내용을 수정해주세요.<br />확정 전에는 게임이 시작되지 않아요.</p><ActionLink href="/preparation/body" secondary>입력 내용 수정하기</ActionLink></Card>
    <div className="hm-notice hm-notice-danger hm-recovery-pain"><span className="hm-small-label">설문 · 통증 선택 시</span><h2>통증이 계속되면 쉬어가세요.</h2><p>운동을 멈추고 전문가와 상담해주세요.<br />응답은 저장할 수 있어요.<br />다음 루틴에서는 해당 부위 운동을 제외해요.</p><p className="hm-helper">진단·의료 처방을 제공하지 않아요.</p></div>
    <p className="hm-helper hm-survey-bottom">생성 실패·통증 안내를 비교하는 시안이에요.</p>
    <ActionBar><Button className="hm-action-button" onClick={retry} disabled={pending}>{pending && <LoaderCircle size={16} />}{pending ? "초안 화면 준비 중" : "커리큘럼 다시 시도하기"}</Button></ActionBar>
  </>;
}

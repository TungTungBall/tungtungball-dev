"use client";

import Link from "next/link";
import { Gem as GemIcon, LoaderCircle } from "lucide-react";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, ActionLink, Card, Notice, PageIntro } from "@/components/healthmith/ui";

export function RecordsView({ mode }: { mode: "populated" | "empty" | "loading" | "error" }) {
  const { workout } = usePreview();
  return <>
    <PageIntro eyebrow="MY CABINET / 예시 기록" title="쌓여가는 나의 보석들" />
    {mode === "loading" ? <div className="hm-records-stats hm-loading" role="status"><LoaderCircle size={28} /><p>나의 운동 기록을 불러오고 있어요.</p><Link className="hm-text-link" href="/records">기록 화면 보기</Link></div> : mode === "error" ? <div className="hm-records-stats"><Notice danger>기록을 불러오지 못했어요.<br />잠시 후 다시 확인해주세요.</Notice><Link className="hm-text-link" href="/records">다시 시도하기</Link></div> : mode === "empty" ? <Card className="hm-records-stats hm-empty"><GemIcon size={38} strokeWidth={1.2} /><h2>아직 완료한 운동이 없어요</h2><p>첫 번째 여정에서<br />나만의 보석을 만들어보세요.</p><p>연속 운동일 0일</p></Card> : <>
      <div className="hm-stat-grid hm-records-stats"><Card><strong>3일</strong><p>연속 운동일</p></Card><Card><strong>12개</strong><p>완성한 보석</p></Card></div>
      <Card className="hm-records-radar"><h2>부위별 운동 돌아보기</h2><div className="hm-records-radar-content"><svg className="hm-radar" viewBox="0 0 200 180" role="img" aria-label="항목과 계산이 아직 정해지지 않은 육각형 그래프 구조 예시"><g fill="none" stroke="#dfe3f0"><polygon points="100,8 178,52 178,132 100,176 22,132 22,52" /><polygon points="100,30 158,64 158,120 100,154 42,120 42,64" /><polygon points="100,51 139,75 139,110 100,133 61,110 61,75" /></g><polygon points="100,18 145,68 164,122 103,147 31,126 43,66" fill="#92bda7" stroke="#7355f5" strokeWidth="1.5" /></svg><div className="hm-helper">육각형 구조 예시<br />항목·계산은 미정<br /><br />상체 18단계<br />하체 27단계<br />허리 15단계</div></div></Card>
      <div className="hm-notice hm-records-summary"><span className="hm-small-label">나의 운동 성향 · 예시</span><h2>차근차근 완성하는 즐거움</h2><p>최근 설문에서 재미를 높게 평가했어요.</p></div>
      <Card className="hm-records-history"><h2>지난 게임 결과</h2>{workout.status === "abandoned" && <div className="hm-record-row"><span>이번 여정 · 예시</span><span>{workout.stageIndex} / 5 포기</span></div>}<div className="hm-record-row"><span>11.02 ◆ 에메랄드</span><span>5 / 5 완료</span></div><div className="hm-record-row"><span>11.01 ◆ 에메랄드</span><span>5 / 5 완료</span></div></Card>
      <p className="hm-helper">표시된 기록은 디자인 예시예요.</p>
    </>}
    <ActionBar><ActionLink href="/preparation/body">오늘의 운동 시작하기</ActionLink></ActionBar>
  </>;
}

export function SignedOutRecordsView() {
  return <PageIntro eyebrow="MY CABINET" title="나의 운동 기록" description="로그인하면 저장된 운동과 보석을 확인할 수 있어요." />;
}

"use client";
import { useState } from "react";
import Link from "next/link";
import { PageIntro } from "@/components/healthmith/ui";
import { InputOptions } from "@/components/healthmith/input-options";

export function FeedbackForm({ sessionId }: { sessionId?: string }) {
  const [effort, setEffort] = useState<string | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  return <section className="hm-feedback-v2">
    <PageIntro eyebrow="운동 후 설문 · 선택" title="오늘 운동은 어땠나요?" description="네 항목 모두 선택이에요. 답하고 싶은 것만 남겨주세요." />
    <p className="hm-availability" id="feedback-save-note" role="note">새 설문 저장은 준비 중이에요. 지금 입력한 내용은 저장되거나 다음 루틴에 반영되지 않아요.{sessionId && <> <Link href={`/feedback?sessionId=${encodeURIComponent(sessionId)}&legacy=1`}>기존 설문으로 응답하기</Link></>}</p>
    <InputOptions label="운동 강도" values={["가벼웠어요", "적당했어요", "힘들었어요"]} selected={effort ? [effort] : []} onChange={v => setEffort(effort === v ? null : v)} />
    <InputOptions label="운동 시간" values={["짧았어요", "적당했어요", "길었어요"]} selected={duration ? [duration] : []} onChange={v => setDuration(duration === v ? null : v)} />
    <InputOptions label="루틴 만족도" values={[1, 2, 3, 4, 5]} selected={rating ? [rating] : []} onChange={v => setRating(rating === v ? null : v)} />
    <div className="hm-score-labels"><span>아쉬워요</span><span>만족해요</span></div>
    <div className="hm-input-options"><label htmlFor="feedback-comment">자유 의견</label><textarea id="feedback-comment" maxLength={500} value={comment} onChange={e => setComment(e.target.value)} placeholder="다음 루틴에 바라는 점을 적어주세요." /><p className="hm-helper">{comment.length} / 500 · 이름·연락처 등 개인정보는 적지 말아주세요.</p></div>
    <button className="hm-action" type="button" disabled aria-describedby="feedback-save-note">응답 저장 준비 중</button>
    <Link className="hm-action hm-action-secondary" href="/records">건너뛰고 기록 보기</Link>
    <p className="hm-helper">화면을 떠나거나 새로고침하면 입력한 내용은 사라져요.</p>
  </section>;
}

"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionBar, ActionLink, ChoiceButton, Notice, PageIntro } from "@/components/healthmith/ui";
import { sorenessOptions, type Soreness } from "@/lib/healthmith/preview-data";
import { submitWorkoutFeedback } from "./actions";

export function ConnectedFeedbackForm({ sessionId }: { sessionId: string }) {
  const [soreness, setSoreness] = useState<Soreness[]>([]);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [enjoyment, setEnjoyment] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [nextRequestId, setNextRequestId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function chooseSoreness(part: Soreness) {
    setMessage(null);
    setSoreness((current) => part === "없음"
      ? (current.includes("없음") ? [] : ["없음"])
      : current.includes(part) ? current.filter((item) => item !== part) : [...current.filter((item) => item !== "없음"), part]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (soreness.length === 0 || difficulty === null || enjoyment === null) {
      setMessage("세 문항에 모두 응답해 주세요.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await submitWorkoutFeedback(sessionId, {
        soreness_body_parts: soreness,
        difficulty,
        enjoyment,
      });
      if (result.state === "saved") {
        setSaved(true);
        setMessage(result.safety_notice || "운동 후 설문을 저장했어요.");
        setNextRequestId(result.next_generation_request_id);
      } else {
        setSaved(false);
        setMessage(result.message);
      }
    });
  }

  if (saved) {
    return <>
      <PageIntro eyebrow="REFLECTION" title="오늘의 응답을 저장했어요" />
      <Notice danger={soreness.some((part) => part !== "없음")}>{message}</Notice>
      {nextRequestId ? <ActionBar><Button className="hm-action-button" onClick={() => router.push(`/routine/generation/${encodeURIComponent(nextRequestId)}`)}>다음 운동 초안 보기</Button></ActionBar>
        : <ActionBar><ActionLink href="/records">운동 기록 보기</ActionLink></ActionBar>}
    </>;
  }

  const hasSoreness = soreness.some((part) => part !== "없음");
  return <>
    <PageIntro eyebrow="REFLECTION" title="오늘의 여정은 어땠나요?" description="세 가지 응답을 다음 운동을 준비하는 데 사용해요." />
    <form className="hm-feedback-form" onSubmit={submit} noValidate>
      <fieldset className="hm-fieldset"><legend>01 근육통이 있는 부위가 있나요?</legend><div className="hm-choice-grid is-three">{sorenessOptions.map((part) => <ChoiceButton key={part} selected={soreness.includes(part)} onClick={() => chooseSoreness(part)} label={`근육통 ${part}`}>{part}</ChoiceButton>)}</div><p className="hm-helper">‘없음’은 다른 부위와 함께 선택할 수 없어요.</p></fieldset>
      <fieldset className="hm-fieldset"><legend>02 오늘 운동의 난이도는?</legend><div className="hm-choice-grid is-five">{[1, 2, 3, 4, 5].map((value) => <ChoiceButton key={value} label={`난이도 ${value}`} selected={difficulty === value} onClick={() => { setMessage(null); setDifficulty(value); }}>{value}</ChoiceButton>)}</div><div className="hm-range-labels"><span>매우 쉬움</span><span>매우 어려움</span></div></fieldset>
      <fieldset className="hm-fieldset"><legend>03 오늘 운동은 재미있었나요?</legend><div className="hm-choice-grid is-five">{[1, 2, 3, 4, 5].map((value) => <ChoiceButton key={value} label={`재미 ${value}`} selected={enjoyment === value} onClick={() => { setMessage(null); setEnjoyment(value); }}>{value}</ChoiceButton>)}</div><div className="hm-range-labels"><span>매우 재미없음</span><span>매우 재미있음</span></div></fieldset>
      {message && <p className="hm-error" role="alert">{message}</p>}
      <Notice danger={hasSoreness}>{hasSoreness ? <>통증이 계속되면 운동을 멈추고<br />전문가와 상담해주세요.</> : <>응답은 운동 기록과 함께 저장돼요.</>}</Notice>
      <Button className="hm-action-button" type="submit" disabled={pending}>{pending ? "응답 저장 중" : "응답 저장하고 다음 초안 보기"}</Button>
    </form>
  </>;
}

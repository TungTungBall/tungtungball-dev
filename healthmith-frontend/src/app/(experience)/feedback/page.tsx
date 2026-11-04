"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, ActionLink, ChoiceButton, Notice, PageIntro } from "@/components/healthmith/ui";
import { sorenessOptions, type Soreness } from "@/lib/healthmith/preview-data";

export default function FeedbackPage() {
  const { feedback, setFeedback, workout } = usePreview();
  const [error, setError] = useState("");
  const router = useRouter();
  const hasSoreness = feedback.soreness.some((part) => part !== "없음");

  function chooseSoreness(part: Soreness) {
    setError("");
    setFeedback((value) => ({ ...value, soreness: part === "없음" ? ["없음"] : value.soreness.includes(part) ? value.soreness.filter((item) => item !== part) : [...value.soreness.filter((item) => item !== "없음"), part] }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback.soreness.length || feedback.difficulty === null || feedback.enjoyment === null) { setError("세 문항에 모두 응답해 주세요."); return; }
    setFeedback((value) => ({ ...value, submitted: true }));
    router.push("/routine");
  }

  if (workout.status === "abandoned") return <><PageIntro eyebrow="REFLECTION" title="이번 여정은 여기까지" description="포기한 운동은 설문 없이 마무리돼요." /><ActionBar><ActionLink href="/routine">새 여정 준비하기</ActionLink></ActionBar></>;

  return <>
    <PageIntro eyebrow="REFLECTION" title="오늘의 여정은 어땠나요?" description={<>세 가지 응답을 바탕으로<br />다음 커리큘럼 초안을 준비해요.</>} />
    <form className="hm-feedback-form" id="feedback-form" onSubmit={submit} noValidate>
      <fieldset className="hm-fieldset"><legend>01 근육통이 있는 부위가 있나요?</legend><div className="hm-choice-grid is-three">{sorenessOptions.map((part) => <ChoiceButton key={part} selected={feedback.soreness.includes(part)} onClick={() => chooseSoreness(part)} label={`근육통 ${part}`}>{part}</ChoiceButton>)}</div><p className="hm-helper">‘없음’은 다른 부위와 함께 선택할 수 없어요.</p></fieldset>
      <fieldset className="hm-fieldset"><legend>02 오늘 운동의 난이도는?</legend><div className="hm-choice-grid is-five">{[1, 2, 3, 4, 5].map((difficulty) => <ChoiceButton key={difficulty} label={`난이도 ${difficulty}`} selected={feedback.difficulty === difficulty} onClick={() => { setError(""); setFeedback((value) => ({ ...value, difficulty: value.difficulty === difficulty ? null : difficulty })); }}>{difficulty}</ChoiceButton>)}</div><div className="hm-range-labels"><span>매우 쉬움</span><span>매우 어려움</span></div></fieldset>
      <fieldset className="hm-fieldset"><legend>03 오늘 운동은 재미있었나요?</legend><div className="hm-choice-grid is-five">{[1, 2, 3, 4, 5].map((enjoyment) => <ChoiceButton key={enjoyment} label={`재미 ${enjoyment}`} selected={feedback.enjoyment === enjoyment} onClick={() => { setError(""); setFeedback((value) => ({ ...value, enjoyment: value.enjoyment === enjoyment ? null : enjoyment })); }}>{enjoyment}</ChoiceButton>)}</div><div className="hm-range-labels"><span>매우 재미없음</span><span>매우 재미있음</span></div></fieldset>
      {error && <p className="hm-error" role="alert">{error}</p>}
      <div className="hm-feedback-notice"><Notice danger={hasSoreness}>{hasSoreness ? <>통증이 계속되면 운동을 멈추고<br />전문가와 상담해주세요.</> : <>세 문항 모두 응답해야 저장할 수 있어요.<br />다음 루틴도 직접 확인한 뒤 시작해요.</>}</Notice><p className="hm-helper">디자인 미리보기예요. 응답은 서버에 저장되지 않아요.</p></div>
    </form>
    <ActionBar><Button className="hm-action-button" type="submit" form="feedback-form">응답 저장하고 다음 초안 보기</Button></ActionBar>
  </>;
}

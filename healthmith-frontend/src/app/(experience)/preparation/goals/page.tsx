"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, ChoiceButton, Notice, PageIntro, StepProgress } from "@/components/healthmith/ui";
import { purposes } from "@/lib/healthmith/preview-data";

export default function GoalsPreparationPage() {
  const { survey, setSurvey } = usePreview();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (survey.purpose === "자유 입력" && !survey.customPurpose.trim()) {
      setError("직접 목표를 적어주세요. 공백만 입력할 수는 없어요.");
      document.getElementById("custom-purpose")?.focus();
      return;
    }
    setError("");
    startTransition(() => router.push("/routine"));
  }

  return <>
    <PageIntro eyebrow="PREPARATION / 2 OF 2" title="오늘의 목표를 골라요" description="원하는 목적과 강도를 정해주세요." />
    <form className="hm-goal-form" id="goals-survey" onSubmit={next} noValidate>
      <StepProgress step={2} />
      <fieldset className="hm-fieldset"><legend>운동 목적</legend><div className="hm-choice-grid">{purposes.map((purpose) => <div key={purpose} className={purpose === "자유 입력" ? "hm-full-width" : undefined}><ChoiceButton selected={survey.purpose === purpose} onClick={() => { setSurvey((value) => ({ ...value, purpose })); setError(""); }}>{purpose}</ChoiceButton></div>)}</div></fieldset>
      <label className="sr-only" htmlFor="custom-purpose">직접 운동 목표 입력</label><input className="hm-input" id="custom-purpose" value={survey.customPurpose} disabled={survey.purpose !== "자유 입력"} placeholder="직접 목표를 적어주세요" aria-invalid={!!error} aria-describedby={error ? "purpose-error" : undefined} onChange={(event) => { setSurvey((value) => ({ ...value, customPurpose: event.target.value })); setError(""); }} />
      {error && <p className="hm-error" id="purpose-error" role="alert">{error}</p>}
      <fieldset className="hm-fieldset hm-intensity"><legend className="sr-only">원하는 운동 강도</legend><div className="hm-intensity-heading"><span className="hm-label">원하는 운동 강도</span><output aria-live="polite" aria-label="선택한 운동 강도">{survey.intensity} / 10</output></div><div className="hm-choice-grid is-five">{Array.from({ length: 10 }, (_, index) => index + 1).map((intensity) => <ChoiceButton key={intensity} label={`운동 강도 ${intensity}`} selected={survey.intensity === intensity} onClick={() => setSurvey((value) => ({ ...value, intensity }))}>{intensity}</ChoiceButton>)}</div><div className="hm-range-labels"><span>가볍게</span><span>적당하게</span><span>힘차게</span></div></fieldset>
      <Notice>내 몸과 목적에 맞춰 5단계를 준비해요.<br /><span className="hm-helper">지금은 저장·생성 없이 디자인 예시를 둘러볼 수 있어요.</span></Notice>
    </form>
    <ActionBar><Button className="hm-action-button" type="submit" form="goals-survey" disabled={pending}>{pending && <LoaderCircle size={16} />}{pending ? "초안 화면 준비 중" : "나의 커리큘럼 초안 만들기"}</Button></ActionBar>
  </>;
}

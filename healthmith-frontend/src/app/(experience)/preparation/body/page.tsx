"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { usePreview } from "@/components/healthmith/preview-provider";
import { ActionBar, Card, ChoiceButton, Notice, PageIntro, StepProgress } from "@/components/healthmith/ui";
import { bodyParts, type BodyPart } from "@/lib/healthmith/preview-data";

export default function BodyPreparationPage() {
  const { survey, setSurvey } = usePreview();
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  function togglePart(part: BodyPart, field: "limitations" | "priorities") {
    setSurvey((previous) => ({ ...previous, [field]: previous[field].includes(part) ? previous[field].filter((value) => value !== part) : [...previous[field], part] }));
    setError("");
  }

  function next(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const conflict = survey.limitations.filter((part) => survey.priorities.includes(part));
    const message = survey.hasLimitations && survey.limitations.length === 0
      ? "운동할 수 없는 부위를 선택해 주세요."
      : survey.priorities.length === 0
        ? "먼저 운동하고 싶은 부위를 하나 이상 선택해 주세요."
        : survey.hasLimitations && conflict.length > 0
          ? `${conflict.join(", ")}는 운동할 수 없는 부위에 포함되어 있어요. 우선 부위를 수정해 주세요.`
          : "";
    setError(message);
    if (message) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    router.push("/preparation/goals");
  }

  return <>
    <PageIntro eyebrow="PREPARATION / 1 OF 2" title="내 몸에 맞는 시작" description={<>운동할 수 없는 부위와<br />먼저 운동할 부위를 따로 알려주세요.</>} />
    <StepProgress step={1} />
    <form id="body-survey" onSubmit={next} noValidate>
      <Card className="hm-survey-card"><fieldset className="hm-fieldset"><legend>운동할 수 없는 부위가 있나요?</legend><p className="hm-description" id="limitations-help">선천적 장애·신체 결손 등으로<br />운동이 어려운 부위를 말해요.</p><div className="hm-choice-grid">
        <ChoiceButton selected={!survey.hasLimitations} onClick={() => { setSurvey((value) => ({ ...value, hasLimitations: false, limitations: [] })); setError(""); }}>없어요</ChoiceButton>
        <ChoiceButton selected={survey.hasLimitations} onClick={() => setSurvey((value) => ({ ...value, hasLimitations: true }))}>있어요</ChoiceButton>
      </div><p className="hm-helper">‘있어요’를 고르면 해당 부위를 선택해요.</p><div className="hm-choice-grid is-four" role="group" aria-label="운동할 수 없는 부위" aria-describedby="limitations-help">{bodyParts.map((part) => <ChoiceButton key={part} disabled={!survey.hasLimitations} selected={survey.limitations.includes(part)} onClick={() => togglePart(part, "limitations")} label={`제약 부위 ${part}`}>{part}</ChoiceButton>)}<ChoiceButton selected={false} onClick={() => {}} disabled label="기타 부위 선택은 준비 중">기타</ChoiceButton></div></fieldset></Card>
      <Card className="hm-survey-card"><fieldset className="hm-fieldset"><legend>먼저 운동하고 싶은 부위</legend><p className="hm-description">선택한 순서가 우선순위가 돼요.</p><div className="hm-choice-grid is-three" role="group" aria-label="운동 부위 우선순위">{bodyParts.map((part) => { const index = survey.priorities.indexOf(part); return <ChoiceButton key={part} selected={index !== -1} onClick={() => togglePart(part, "priorities")} label={`우선 부위 ${part}`}>{index !== -1 && `${index + 1} `}{part}</ChoiceButton>; })}</div></fieldset></Card>
      {error && <p id="body-error" className="hm-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
      <div className="hm-survey-bottom"><Notice>신체 제약은 운동 후에 생기는<br />근육통과 다른 정보예요.</Notice></div>
    </form>
    <ActionBar><Button className="hm-action-button" type="submit" form="body-survey">목표 정하러 가기</Button></ActionBar>
  </>;
}

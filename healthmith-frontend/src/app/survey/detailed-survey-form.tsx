"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { InputOptions } from "@/components/healthmith/input-options";
import { GOALS, EXPERIENCES, PRIORITY_PARTS, LIMITATION_PARTS, SEVERITIES, sidesFor, emptyIntake, intakeStepError, type IntakeInput, type LimitationPart } from "@/lib/healthmith/intake";

import { fromIntakeAnswers, toIntakeAnswers, type IntakeDetail } from "@/lib/healthmith/intake-contract";
import { loadDetailedSurvey, saveDetailedSurvey } from "./detailed-actions";

const TITLES = ["운동 목표", "운동 경험", "현재 운동 수준", "운동 가능한 일정", "운동 제한 부위", "운동 선호도", "입력 내용 확인"];
const DESCRIPTIONS = ["가장 중요한 목표 하나를 골라주세요.", "지금까지 운동해 온 경험을 알려주세요.", "이전 경험과 별개로, 지금 상태를 골라주세요.", "꾸준히 할 수 있는 일정을 골라주세요.", "해당하는 부위를 모두 골라주세요.", "선택하지 않으면 가능한 운동 중에서 추천해요.", "아직 저장되지 않았어요. 입력한 내용을 확인해 주세요."];
export function DetailedSurveyForm({initial = null, loadError = null}: {initial?: IntakeDetail | null; loadError?: string | null}) {
  const [input, setInput] = useState<IntakeInput>(() => initial ? fromIntakeAnswers(initial.answers)! : emptyIntake());
  const [step, setStep] = useState(initial ? 6 : 0);
  const [saved, setSaved] = useState(initial);
  const [notice, setNotice] = useState<string | null>(initial ? "저장된 사전조사를 불러왔어요." : loadError);
  const [pending, startTransition] = useTransition();
  const [unknown, setUnknown] = useState(false);
  const [conflict, setConflict] = useState(false);
  const requestKey = useRef<string | null>(null);
  const inFlight = useRef(false);
  const dirty = !saved || JSON.stringify(toIntakeAnswers(input)) !== JSON.stringify(saved.answers);
  function accept(submission: IntakeDetail) {
    setSaved(submission); setInput(fromIntakeAnswers(submission.answers)!); setStep(6);
    setUnknown(false); setConflict(false); requestKey.current = null;
    window.history.replaceState(null, "", `/survey?id=${submission.id}`);
  }
  function save() {
    if (inFlight.current || conflict || !dirty) return;
    const answers = toIntakeAnswers(input);
    if (!fromIntakeAnswers(answers)) {setError("입력 내용을 확인해 주세요."); return;}
    requestKey.current ??= crypto.randomUUID();
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await saveDetailedSurvey(answers, requestKey.current!, saved?.id ?? null, saved?.version ?? null);
        if (result.state === "saved") {accept(result.submission); setNotice("사전조사를 저장했어요.");}
        else {
          setNotice(result.message); setUnknown(result.state === "unknown"); setConflict(result.state === "conflict");
          if (result.state !== "unknown") requestKey.current = null;
        }
      } catch {setUnknown(true);setNotice("저장 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.");}
      finally {inFlight.current = false;}
    });
  }
  function load() {
    if (inFlight.current || unknown) return;
    inFlight.current = true;
    startTransition(async () => {
      try {
        const result = await loadDetailedSurvey(saved?.id ?? null);
        if (result.state === "saved") {accept(result.submission);setNotice("저장된 사전조사를 불러왔어요.");}
        else setNotice(result.message);
      } catch {setNotice("저장 내용을 불러오지 못했어요.");}
      finally {inFlight.current = false;}
    });
  }
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const update = (patch: Partial<IntakeInput>) => {setInput(current => ({...current, ...patch}));setError(null);setNotice(null);};
  function move(next: number) {setStep(next);setError(null);requestAnimationFrame(() => {heading.current?.focus();heading.current?.scrollIntoView({block: "start"});});}
  function next() {
    const message = intakeStepError(input, step);
    if (message) {setError(message);return;}
    if (step === 5) for (let index = 0; index < 5; index++) {
      const invalid = intakeStepError(input, index);
      if (invalid) {move(index);setError(invalid);return;}
    }
    move(step === 1 ? 3 : step + 1);
  }
  function togglePart(part: LimitationPart) {
    const limitations = {...input.limitations};
    if (limitations[part]) delete limitations[part]; else limitations[part] = {side: null, severity: null};
    update({limitationsPresent: true, limitations});
  }
  const parts = LIMITATION_PARTS.filter(part => input.limitations[part]);
  const overlaps = input.priorities.filter(part => parts.some(p => p === part));
  return <section className="hm-intake">
    <p className="hm-eyebrow">{step < 6 ? `사전조사 ${step >= 3 ? step : step + 1} / 5` : "사전조사 · 확인"}</p>
    <h1 tabIndex={-1} ref={heading}>{TITLES[step]}</h1><p className="hm-description">{step === 6 && !dirty ? "저장된 내용을 확인하거나 이전 단계에서 수정할 수 있어요." : DESCRIPTIONS[step]}</p>
    {notice && <p className="hm-availability" role="status">{notice}</p>}
    <button type="button" className="hm-text-link" disabled={pending || unknown} onClick={load}>{dirty ? "입력 대신 최신 저장본 불러오기" : "저장본 다시 불러오기"}</button>
    <fieldset disabled={pending || unknown} style={{border:0,padding:0,margin:0,minWidth:0}}>
    {step < 6 && <div className="hm-form-progress" role="img" aria-label={`${step >= 3 ? step : step + 1} / 5 단계`}>{TITLES.slice(0, 6).filter((_, i) => i !== 2).map((title, i) => <span key={title} className={i <= (step >= 3 ? step - 1 : step) ? "is-current" : ""} />)}</div>}
    {step === 0 && <><InputOptions label="어떤 변화를 원하나요? · 필수" values={GOALS} selected={input.goal ? [input.goal] : []} onChange={goal => update({goal})} /><p className="hm-availability" role="note">입력한 조건은 다음 운동에도 사용해요. 운동 시간은 채워야 하는 목표가 아니라 최대 가능한 시간이에요.</p></>}
    {step === 1 && <InputOptions label="얼마나 해보셨나요? · 필수" values={EXPERIENCES} selected={input.experience ? [input.experience] : []} onChange={experience => update({experience})} />}

    {step === 3 && <><InputOptions label="한 번에 가능한 시간 · 필수" values={["10분", "20분", "30분", "45분", "60분"]} selected={input.minutes ? [`${input.minutes}분`] : []} onChange={value => update({minutes: parseInt(value, 10)})} /><InputOptions label="일주일에 몇 번 할까요? · 필수" values={["1회", "2회", "3회", "4회", "5회", "6회", "7회"]} selected={input.days ? [`${input.days}회`] : []} onChange={value => update({days: parseInt(value, 10)})} /></>}
    {step === 4 && <>
      <InputOptions label="불편하거나 제한이 있는 부위 · 필수" values={["없음", ...LIMITATION_PARTS]} selected={input.limitationsPresent === false ? ["없음"] : parts} multiple onChange={value => value === "없음" ? update({limitationsPresent: false, limitations: {}}) : togglePart(value as LimitationPart)} />
      {parts.map(part => <section key={part} className="hm-limitation-detail" aria-label={`${part} 상세 입력`}><h2>{part}</h2>
        <InputOptions label="위치 · 필수" values={sidesFor(part)} selected={input.limitations[part]?.side ? [input.limitations[part]!.side!] : []} onChange={side => update({limitations: {...input.limitations, [part]: {...input.limitations[part]!, side}}})} />
        <InputOptions label="불편 정도 · 필수" values={SEVERITIES} selected={input.limitations[part]?.severity ? [input.limitations[part]!.severity!] : []} onChange={severity => update({limitations: {...input.limitations, [part]: {...input.limitations[part]!, severity}}})} />
      </section>)}
    </>}
    {step === 5 && <><InputOptions label="먼저 운동하고 싶은 부위 · 선택" values={PRIORITY_PARTS} selected={input.priorities} multiple onChange={part => update({priorities: input.priorities.includes(part) ? input.priorities.filter(p => p !== part) : [...input.priorities, part]})} />{overlaps.length > 0 && <p className="hm-availability">제한 부위를 먼저 확인해서 가능한 운동만 추천해요.</p>}</>}
    {step === 6 && <><dl className="hm-review-list">{[
      ["운동 목표", input.goal], ["운동 경험", input.experience], ["일정", `${input.minutes}분 · 주 ${input.days}회`],
      ["제한 부위", input.limitationsPresent ? parts.map(p => `${p} · ${input.limitations[p]?.side} · ${input.limitations[p]?.severity}`).join("\n") : "없음"], ["우선 부위", input.priorities.join(", ") || "선택 안 함"],
    ].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
      <p className="hm-availability" id="intake-save-note">저장한 내용은 다시 불러와 수정할 수 있어요. 저장하지 않은 변경은 화면을 떠나면 사라져요.</p>{!dirty && <Link className="hm-action" href="/">오늘 운동 준비하기</Link>}
    </>}
    {error && <p className="hm-error" role="alert">{error}</p>}
    <div className="hm-form-actions">{step > 0 && <button type="button" className="hm-action hm-action-secondary" onClick={() => move(step === 3 ? 1 : step - 1)}>이전</button>}{step < 6 && <button type="button" className="hm-action" onClick={next}>{step === 5 ? "입력 내용 확인" : "다음"}</button>}</div>
    </fieldset>
    {step === 6 && <button className="hm-action" type="button" disabled={pending || conflict || (!dirty && !unknown)} aria-describedby="intake-save-note" onClick={save}>{pending ? "저장 확인 중" : unknown ? "같은 요청으로 저장 다시 확인" : !dirty ? "저장 완료" : saved ? "수정 내용 저장" : "사전조사 저장"}</button>}
  </section>;
}

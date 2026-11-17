"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { InputOptions } from "@/components/healthmith/input-options";
import { GOALS, EXPERIENCES, LEVELS, LIMITATION_PARTS, INTENSITIES, SEVERITIES, sidesFor, emptyIntake, intakeStepError, type IntakeInput, type LimitationPart } from "@/lib/healthmith/intake";

const TITLES = ["운동 목표", "운동 경험", "현재 운동 수준", "운동 가능한 일정", "운동 제한 부위", "운동 선호도", "입력 내용 확인"];
const DESCRIPTIONS = ["가장 중요한 목표 하나를 골라주세요.", "지금까지 운동해 온 경험을 알려주세요.", "이전 경험과 별개로, 지금 상태를 골라주세요.", "꾸준히 할 수 있는 일정을 골라주세요.", "해당하는 부위를 모두 골라주세요.", "두 항목 모두 선택하지 않아도 괜찮아요.", "아직 저장되지 않았어요. 입력한 내용을 확인해 주세요."];
export function DetailedSurveyForm() {
  const [input, setInput] = useState<IntakeInput>(emptyIntake);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const update = (patch: Partial<IntakeInput>) => {setInput(current => ({...current, ...patch}));setError(null);};
  function move(next: number) {setStep(next);setError(null);requestAnimationFrame(() => {heading.current?.focus();heading.current?.scrollIntoView({block: "start"});});}
  function next() {
    const message = intakeStepError(input, step);
    if (message) {setError(message);return;}
    if (step === 5) for (let index = 0; index < 5; index++) {
      const invalid = intakeStepError(input, index);
      if (invalid) {move(index);setError(invalid);return;}
    }
    move(step + 1);
  }
  function togglePart(part: LimitationPart) {
    const limitations = {...input.limitations};
    if (limitations[part]) delete limitations[part]; else limitations[part] = {side: null, severity: null};
    update({limitationsPresent: true, limitations});
  }
  const parts = LIMITATION_PARTS.filter(part => input.limitations[part]);
  const overlaps = input.priorities.filter(part => parts.includes(part));
  return <section className="hm-intake">
    <p className="hm-eyebrow">{step < 6 ? `사전조사 ${step + 1} / 6` : "사전조사 · 확인"}</p>
    <h1 tabIndex={-1} ref={heading}>{TITLES[step]}</h1><p className="hm-description">{DESCRIPTIONS[step]}</p>
    {step < 6 && <div className="hm-form-progress" role="img" aria-label={`${step + 1} / 6 단계`}>{TITLES.slice(0, 6).map((title, i) => <span key={title} className={i <= step ? "is-current" : ""} />)}</div>}
    {step === 0 && <><InputOptions label="어떤 변화를 원하나요? · 필수" values={GOALS} selected={input.goal ? [input.goal] : []} onChange={goal => update({goal})} /><p className="hm-availability" role="note">새 사전조사 저장은 준비 중이에요. 지금 운동을 시작하려면 <Link href="/survey/legacy">기존 양식으로 입력하기</Link>를 이용해 주세요.</p></>}
    {step === 1 && <InputOptions label="얼마나 해보셨나요? · 필수" values={EXPERIENCES} selected={input.experience ? [input.experience] : []} onChange={experience => update({experience})} />}
    {step === 2 && <InputOptions label="현재 가능한 정도 · 필수" values={LEVELS} selected={input.level ? [input.level] : []} onChange={level => update({level})} />}
    {step === 3 && <><InputOptions label="한 번에 가능한 시간 · 필수" values={["10분", "20분", "30분", "45분", "60분"]} selected={input.minutes ? [`${input.minutes}분`] : []} onChange={value => update({minutes: parseInt(value, 10)})} /><InputOptions label="일주일에 몇 번 할까요? · 필수" values={["1회", "2회", "3회", "4회", "5회", "6회", "7회"]} selected={input.days ? [`${input.days}회`] : []} onChange={value => update({days: parseInt(value, 10)})} /></>}
    {step === 4 && <>
      <InputOptions label="불편하거나 제한이 있는 부위 · 필수" values={["없음", ...LIMITATION_PARTS]} selected={input.limitationsPresent === false ? ["없음"] : parts} multiple onChange={value => value === "없음" ? update({limitationsPresent: false, limitations: {}}) : togglePart(value as LimitationPart)} />
      {parts.map(part => <section key={part} className="hm-limitation-detail" aria-label={`${part} 상세 입력`}><h2>{part}</h2>
        <InputOptions label="위치 · 필수" values={sidesFor(part)} selected={input.limitations[part]?.side ? [input.limitations[part]!.side!] : []} onChange={side => update({limitations: {...input.limitations, [part]: {...input.limitations[part]!, side}}})} />
        <InputOptions label="불편 정도 · 필수" values={SEVERITIES} selected={input.limitations[part]?.severity ? [input.limitations[part]!.severity!] : []} onChange={severity => update({limitations: {...input.limitations, [part]: {...input.limitations[part]!, severity}}})} />
      </section>)}
    </>}
    {step === 5 && <><InputOptions label="선호하는 강도 · 선택" values={INTENSITIES} selected={input.intensity ? [input.intensity] : []} onChange={intensity => update({intensity: input.intensity === intensity ? null : intensity})} /><InputOptions label="먼저 운동하고 싶은 부위 · 선택" values={LIMITATION_PARTS} selected={input.priorities} multiple onChange={part => update({priorities: input.priorities.includes(part) ? input.priorities.filter(p => p !== part) : [...input.priorities, part]})} />{overlaps.length > 0 && <p className="hm-availability" role="status">{overlaps.join(", ")}은 제한 부위이기도 해요. 추천을 연결할 때 제한 조건을 먼저 확인해야 해요.</p>}</>}
    {step === 6 && <><dl className="hm-review-list">{[
      ["운동 목표", input.goal], ["운동 경험", input.experience], ["현재 수준", input.level], ["일정", `${input.minutes}분 · 주 ${input.days}회`],
      ["제한 부위", input.limitationsPresent ? parts.map(p => `${p} · ${input.limitations[p]?.side} · ${input.limitations[p]?.severity}`).join("\n") : "없음"], ["선호 강도", input.intensity ?? "선택 안 함"], ["우선 부위", input.priorities.join(", ") || "선택 안 함"],
    ].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}</dl>
      <p className="hm-availability" id="intake-save-note" role="status">새 사전조사 저장은 준비 중이에요. 입력은 이 화면을 떠나거나 새로고침하면 사라져요. 기존 양식으로 자동 변환하지 않아요.</p><button className="hm-action" type="button" disabled aria-describedby="intake-save-note">저장 기능 준비 중</button><Link className="hm-text-link" href="/survey/legacy">기존 양식으로 새로 입력하기</Link>
    </>}
    {error && <p className="hm-error" role="alert">{error}</p>}
    <div className="hm-form-actions">{step > 0 && <button type="button" className="hm-action hm-action-secondary" onClick={() => move(step - 1)}>이전</button>}{step < 6 && <button type="button" className="hm-action" onClick={next}>{step === 5 ? "입력 내용 확인" : "다음"}</button>}</div>
  </section>;
}
